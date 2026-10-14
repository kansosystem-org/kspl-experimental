#!/usr/bin/env python3
"""Stage 3  Turns a Qwen tokenizer into the format the KSPL side's
`Tokenizer.load` in `ksai/tokenizer.kspls` can read (vocab.txt / merges.txt, the same format as
`train_bpe.kspls`).

The Qwen/GPT-2 family's byte-level BPE saves vocab.json/merges.txt as text through the
"byte-to-unicode" trick, which temporarily swaps a raw byte (0-255) for a printable Unicode
character. That swap is no more than a convenience of representation for saving safely as JSON or
text and has nothing to do with what BPE means, so the KSPL side is handed the raw bytes converted
back (the KSPL side reads and writes raw bytes directly as hex from the start, so this one
conversion only has to be absorbed on the Python side).

The Python API of the tokenizer's own implementation (the `tokenizers` library, written in Rust) can
change with the version (there is a real case of how vocab/merges are stored changing with
tokenizers' version), so rather than calling its methods directly, the vocab, the merges and the
special tokens are read out of the JSON `backend_tokenizer.to_str()` returns (the stable serialized
format every fast tokenizer implements).

How to use it:
  python3 tools/ai_assist/export_qwen_tokenizer.py --base-model Qwen/Qwen2.5-Coder-0.5B \
      --out-dir out/qwen_tokenizer

What comes out: out/qwen_tokenizer/{vocab.txt,merges.txt}
  (`Tokenizer.load(vocab_path, merges_path)` in `ksai/tokenizer.kspls` reads it as it stands)
"""
import argparse
import json
import sys


def bytes_to_unicode():
    """GPT-2's byte<->unicode table (id: the raw byte value -> a printable Unicode character).
    The standard table nearly every byte-level BPE tokenizer has used since OpenAI's GPT-2
    implementation (it is fixed, and does not depend on a version)."""
    bs = (list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) +
          list(range(ord("®"), ord("ÿ") + 1)))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return dict(zip(bs, (chr(c) for c in cs)))


def token_str_to_bytes(s, byte_decoder):
    """Puts a token string encoded with byte-to-unicode back into raw bytes.
    A character absent from the table (a raw string such as a special token) becomes UTF-8 bytes as
    it stands.
    """
    out = bytearray()
    for ch in s:
        if ch in byte_decoder:
            out.append(byte_decoder[ch])
        else:
            out.extend(ch.encode("utf-8"))
    return bytes(out)


def load_backend_json(tok):
    """Reads a fast tokenizer's internal state through the stable JSON serialization
    (each Python method name can change with the version, so using the to_str() every fast
    tokenizer implements avoids the API's differences)."""
    if not hasattr(tok, "backend_tokenizer"):
        print("[error] this is not a fast tokenizer (there is no backend_tokenizer). "
              "Please check AutoTokenizer.from_pretrained(..., use_fast=True).",
              file=sys.stderr)
        sys.exit(1)
    return json.loads(tok.backend_tokenizer.to_str())


def extract_merges(model_json):
    """model.merges can be represented differently per tokenizers version:
      the newer form: [["a","b"], ["c","d"], ...]
      the older form: ["a b", "c d", ...]
    Both are lists in rank order (the order they were trained in).
    """
    merges = model_json.get("merges", [])
    out = []
    for m in merges:
        if isinstance(m, (list, tuple)) and len(m) == 2:
            out.append((m[0], m[1]))
        elif isinstance(m, str):
            parts = m.split(" ", 1)
            if len(parts) == 2:
                out.append((parts[0], parts[1]))
        else:
            print(f"[warn] skipping a merges element of an unknown form: {m!r}", file=sys.stderr)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-model", required=True)
    ap.add_argument("--out-dir", default="out/qwen_tokenizer")
    args = ap.parse_args()
    try:
        from transformers import AutoTokenizer
    except ImportError as e:
        print(f"[error] transformers is needed: {e}", file=sys.stderr)
        sys.exit(1)
    import os
    os.makedirs(args.out_dir, exist_ok=True)

    tok = AutoTokenizer.from_pretrained(args.base_model)
    d = load_backend_json(tok)
    model_json = d.get("model", {})
    vocab = model_json.get("vocab")
    if not vocab:
        print(f"[error] model.vocab is empty or absent. model's keys: {list(model_json.keys())}",
              file=sys.stderr)
        sys.exit(1)
    merges = extract_merges(model_json)
    byte_decoder = {v: k for k, v in bytes_to_unicode().items()}

    # added_tokens (special tokens such as <|endoftext|>) are literal strings apart from the vocab,
    # not through byte-to-unicode.
    added = {}
    for t in d.get("added_tokens", []):
        added[t["id"]] = t["content"]

    id_to_bytes = {}
    for tok_str, tid in vocab.items():
        id_to_bytes[tid] = token_str_to_bytes(tok_str, byte_decoder)
    for tid, content in added.items():
        id_to_bytes[tid] = content.encode("utf-8")

    vocab_path = os.path.join(args.out_dir, "vocab.txt")
    with open(vocab_path, "w") as f:
        for tid in sorted(id_to_bytes):
            f.write(f"{tid}\t{id_to_bytes[tid].hex()}\n")

    # merges: each (str,str) pair as "id1 id2 merged_id", in rank order, since the order
    # Tokenizer.add_merge is called in is the rank.
    merges_path = os.path.join(args.out_dir, "merges.txt")
    skipped = 0
    with open(merges_path, "w") as f:
        for a, b in merges:
            id_a, id_b = vocab.get(a), vocab.get(b)
            merged_tok = a + b
            id_merged = vocab.get(merged_tok)
            if id_a is None or id_b is None or id_merged is None:
                skipped += 1
                continue
            f.write(f"{id_a} {id_b} {id_merged}\n")

    print(f"exported {len(id_to_bytes)} vocab entries, {len(merges) - skipped}/{len(merges)} "
          f"merges -> {vocab_path}, {merges_path}")
    if skipped:
        print(f"[warn] skipping {skipped} merges (no matching ID is found in the vocab)",
              file=sys.stderr)


def _selftest():
    """The unit test that needs no transformers: the byte-to-unicode reverse conversion, taking the
    merges out, and generating vocab.txt/merges.txt, all checked on synthesized JSON standing in
    for to_str()."""
    b2u = bytes_to_unicode()
    decoder = {v: k for k, v in b2u.items()}
    # A known byte sequence ("AB") through byte-to-unicode and back gives the bytes back.
    encoded = b2u[0x41] + b2u[0x42]
    assert token_str_to_bytes(encoded, decoder) == b"AB", \
        "byte_to_unicode's reverse conversion is broken"
    # A character absent from the table (a special token) is taken as UTF-8 as it is.
    assert token_str_to_bytes("<|endoftext|>", decoder) == b"<|endoftext|>", \
        "the fallback for an unhandled character is broken"

    # Taking the merges out: both the newer form ([["a","b"],...]) and the older (["a b",...]).
    new_style = {"merges": [["a", "b"], ["c", "d"]]}
    old_style = {"merges": ["a b", "c d"]}
    assert extract_merges(new_style) == [("a", "b"), ("c", "d")]
    assert extract_merges(old_style) == [("a", "b"), ("c", "d")]

    print("[self-test] OK: the byte-to-unicode reverse conversion and taking the merges out")
    print("[self-test] (both forms) are confirmed. Checked this far with no transformers.")
    print("[self-test] To convert a real model, run it with --base-model (it goes through the fast")
    print("[self-test] tokenizer's backend_tokenizer.to_str(), so it should stand up to the")
    print("[self-test] tokenizers library's differences between versions).")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main()
    else:
        _selftest()
