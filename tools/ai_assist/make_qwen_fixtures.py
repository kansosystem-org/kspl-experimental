#!/usr/bin/env python3
"""Writes the tiny Qwen3 model and the chat-template cases that ksai's tests read.

The tests need no download and no Python: both files are committed. Run this again only when a
case changes. It needs llama.cpp's Python packages, `gguf` and `llama_cpp`, and the downloaded
Qwen3-4B-Instruct-2507 file, whose chat template the tiny model carries:

  python3 tools/ai_assist/make_qwen_fixtures.py \
      --template-from models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf --out-dir ksai/tests/qwen_data

It writes two files:

* `tiny_qwen3.gguf`: a Qwen3-shaped model of 2 blocks with random weights in F32, Q8_0 and Q4_K,
  a byte-level vocabulary with a few merges and Qwen's markers, and the real chat template. Its
  `ksai.check.*` keys hold one value of each GGUF type, and the scores the model gives after each
  token of `ksai.check.tokens`, computed here in F64 from the decoded weights. Each product's
  input is first rounded to 8 bits as llama.cpp's CPU backend rounds it on x86: to Q8_0 blocks
  for a Q8_0 weight, to Q8_K blocks for a Q4_K one, and not at all for an F32 one.
* `template_cases.json`: conversations in the shape a client sends, each with the prompt text
  llama.cpp's Jinja formatter renders from the template.

Run with no argument, it self-tests what needs no download and no llama.cpp: the byte alphabet,
that the reference computation sees no later token, and the model file as `gguf` reads it back.

The seed is fixed. Another numpy version can draw other numbers; the files then differ, and each
still agrees with itself. Where `llama_cpp` loads the tiny model, the scores are also compared with
llama.cpp's own, and the largest gap is shown.
"""
import argparse
import json
import os
import sys
import tempfile

import numpy as np

# llama.cpp's package `gguf`, loaded by load_reference: only writing the files needs it.
Q = quants = GGUFReader = GGUFValueType = GGUFWriter = None


def load_reference():
    """Loads `gguf`; returns whether it is installed."""
    global Q, quants, GGUFReader, GGUFValueType, GGUFWriter
    try:
        import gguf
    except ImportError:
        return False
    Q, quants = gguf.GGMLQuantizationType, gguf.quants
    GGUFReader, GGUFValueType, GGUFWriter = gguf.GGUFReader, gguf.GGUFValueType, gguf.GGUFWriter
    return True

SEED = 20261027
ARCH = "qwen3"
N_LAYERS = 2
HIDDEN = 32
N_HEADS = 4
N_KV_HEADS = 2
HEAD_DIM = 16
FFN = 256  # a multiple of 256, so `ffn_down`'s rows can be Q4_K
CONTEXT = 4096
THETA = 1000000.0
EPS = 1e-6
ALIGNMENT = 64  # not the default 32, so the key is read

# The vocabulary's merges, in priority order, written in GPT-2's byte-level alphabet.
MERGES = [("Ġ", "t"), ("h", "e"), ("Ġt", "he"), ("i", "n"), ("Ġ", "a"), ("e", "r"), ("o", "n"),
          ("r", "e"), ("Ġ", "s"), ("a", "y"), ("Ġ", "d"), ("Ġd", "ay"), ("ä", "¼"), ("ä¼", "ĳ")]
MARKERS = [("<|endoftext|>", 3), ("<|im_start|>", 3), ("<|im_end|>", 3), ("<tool_call>", 4),
           ("</tool_call>", 4), ("<tool_response>", 4), ("</tool_response>", 4), ("<think>", 4),
           ("</think>", 4), ("[PAD0]", 5)]


def byte_alphabet():
    """GPT-2's byte-level alphabet: the character each byte is written as, in Qwen's ID order."""
    bs = list(range(ord("!"), ord("~") + 1)) + list(range(ord("¡"), ord("¬") + 1)) + \
        list(range(ord("®"), ord("ÿ") + 1))
    cs = bs[:]
    n = 0
    for b in range(256):
        if b not in bs:
            bs.append(b)
            cs.append(256 + n)
            n += 1
    return [chr(c) for c in cs]


def vocabulary():
    """The tokens, their types, and the merges as GGUF writes them."""
    tokens = byte_alphabet()
    types = [1] * len(tokens)
    for a, b in MERGES:
        assert a in tokens and b in tokens and a + b not in tokens, (a, b)
        tokens.append(a + b)
        types.append(1)
    for text, kind in MARKERS:
        tokens.append(text)
        types.append(kind)
    return tokens, types, [a + " " + b for a, b in MERGES]


def q8_0(rng, rows, cols, scale):
    """A Q8_0 weight of normal random numbers: its bytes and the numbers they decode to."""
    data = quants.quantize(rng.normal(0.0, scale, (rows, cols)).astype(np.float32), Q.Q8_0)
    return data, quants.dequantize(data, Q.Q8_0).astype(np.float64)


def q4_k(rng, rows, cols):
    """A Q4_K weight of random blocks with small scales: its bytes and their numbers.

    Any bytes form a valid block, and `gguf` has no Q4_K quantizer, so the blocks are drawn.
    """
    blocks = rng.integers(0, 256, (rows, cols // 256, 144), dtype=np.uint8)
    blocks[:, :, 0:2] = np.array([0.0004], dtype=np.float16).view(np.uint8)
    blocks[:, :, 2:4] = np.array([0.0006], dtype=np.float16).view(np.uint8)
    data = blocks.reshape(rows, -1)
    return data, quants.dequantize(data, Q.Q4_K).astype(np.float64)


def f32(rng, rows, cols, scale):
    """An F32 weight of normal random numbers."""
    data = rng.normal(0.0, scale, (rows, cols)).astype(np.float32)
    return data, data.astype(np.float64)


def gain(rng, n):
    """A norm's gain: numbers near 1."""
    return (1.0 + 0.1 * rng.normal(0.0, 1.0, n)).astype(np.float32)


def weights(rng, vocab, quantized=True):
    """Every tensor: name -> (bytes or F32 array, ggml type, decoded F64 numbers).

    With `quantized` false, every weight is F32 and has no ggml type, so `gguf` is not needed.
    """
    q_dim, kv_dim = N_HEADS * HEAD_DIM, N_KV_HEADS * HEAD_DIM
    w = {}
    F32 = Q.F32 if quantized else None

    def put(name, made, qtype):
        w[name] = (made[0], qtype, made[1])

    def q8(rows, cols, scale):
        if quantized:
            return q8_0(rng, rows, cols, scale), Q.Q8_0
        return f32(rng, rows, cols, scale), None

    def q4(rows, cols):
        if quantized:
            return q4_k(rng, rows, cols), Q.Q4_K
        return f32(rng, rows, cols, 0.01), None

    put("token_embd.weight", *q8(vocab, HIDDEN, 1.0))
    for i in range(N_LAYERS):
        p = f"blk.{i}."
        g = gain(rng, HIDDEN)
        put(p + "attn_norm.weight", (g, g.astype(np.float64)), F32)
        put(p + "attn_q.weight", *q8(q_dim, HIDDEN, 0.3))
        put(p + "attn_k.weight", *q8(kv_dim, HIDDEN, 0.3))
        # One F32 weight per block, at another place in each, so both paths are read.
        if i == 0:
            put(p + "attn_v.weight", f32(rng, kv_dim, HIDDEN, 0.3), F32)
        else:
            put(p + "attn_v.weight", *q8(kv_dim, HIDDEN, 0.3))
        put(p + "attn_output.weight", *q8(HIDDEN, q_dim, 0.2))
        for part in ("attn_q_norm", "attn_k_norm"):
            g = gain(rng, HEAD_DIM)
            put(p + part + ".weight", (g, g.astype(np.float64)), F32)
        g = gain(rng, HIDDEN)
        put(p + "ffn_norm.weight", (g, g.astype(np.float64)), F32)
        put(p + "ffn_gate.weight", *q8(FFN, HIDDEN, 0.3))
        if i == 0:
            put(p + "ffn_up.weight", *q8(FFN, HIDDEN, 0.3))
        else:
            put(p + "ffn_up.weight", f32(rng, FFN, HIDDEN, 0.3), F32)
        put(p + "ffn_down.weight", *q4(HIDDEN, FFN))
    g = gain(rng, HIDDEN)
    put("output_norm.weight", (g, g.astype(np.float64)), F32)
    return w


def round_q8_0(x):
    """Each block of 32 rounded as ggml's AVX `quantize_row_q8_0` does, and read back.

    The number of largest size sets `d = max / 127`, kept as an F16. Each number becomes
    `x × 127 / max`, in F32, rounded with halves to even.
    """
    b = x.astype(np.float32).reshape(-1, 32)
    amax = np.abs(b).max(axis=1, keepdims=True)
    d = (amax / np.float32(127)).astype(np.float16).astype(np.float64)
    with np.errstate(divide="ignore"):
        inv = np.where(amax == 0, np.float32(0), np.float32(127) / amax).astype(np.float32)
    q = np.clip(np.rint((b * inv).astype(np.float32)), -128, 127)
    return (q * d).reshape(x.shape)


def round_q8_k(x):
    """Each block of 256 rounded as ggml's `quantize_row_q8_K` does, and read back.

    The first number of largest size becomes -127: each number is `x × -127 / max` in F32, rounded
    with halves to even and capped at 127. The scale is that factor's reciprocal, in F32.
    """
    out = np.zeros(x.shape)
    flat_in = x.astype(np.float32).reshape(-1, 256)
    flat_out = out.reshape(-1, 256)
    for i, b in enumerate(flat_in):
        j = int(np.argmax(np.abs(b)))
        if b[j] == 0:
            continue
        iscale = np.float32(-127) / b[j]
        q = np.minimum(np.rint((iscale * b).astype(np.float32)), 127)
        flat_out[i] = q * np.float64(np.float32(1) / iscale)
    return out


def rms(x, g):
    """RMS norm over the last axis, then the gain."""
    return x / np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + EPS) * g


def rope(x, pos):
    """NeoX-style RoPE of each head: the first half paired with the second."""
    half = HEAD_DIM // 2
    freq = THETA ** (-np.arange(half) * 2.0 / HEAD_DIM)
    ang = pos * freq
    c, s = np.cos(ang), np.sin(ang)
    a, b = x[..., :half], x[..., half:]
    return np.concatenate([a * c - b * s, b * c + a * s], axis=-1)


def forward(w, tokens):
    """The scores after each token, in F64, as llama.cpp's `qwen3` graph computes them."""
    def d(name):
        return w[name][2]

    def mul(x, name):
        """`x` times weight `name`'s rows, its input rounded as the weight's format asks."""
        qtype = w[name][1]
        if qtype is None:  # an F32 weight of the self-test without gguf: no rounding
            return x @ d(name).T
        if qtype == Q.Q8_0:
            x = round_q8_0(x)
        elif qtype == Q.Q4_K:
            x = round_q8_k(x)
        return x @ d(name).T

    n = len(tokens)
    x = d("token_embd.weight")[tokens]
    groups = N_HEADS // N_KV_HEADS
    for i in range(N_LAYERS):
        p = f"blk.{i}."
        h = rms(x, d(p + "attn_norm.weight"))
        q = mul(h, p + "attn_q.weight").reshape(n, N_HEADS, HEAD_DIM)
        k = mul(h, p + "attn_k.weight").reshape(n, N_KV_HEADS, HEAD_DIM)
        v = mul(h, p + "attn_v.weight").reshape(n, N_KV_HEADS, HEAD_DIM)
        q = rms(q, d(p + "attn_q_norm.weight"))
        k = rms(k, d(p + "attn_k_norm.weight"))
        pos = np.arange(n)[:, None, None]
        q, k = rope(q, pos), rope(k, pos)
        out = np.zeros((n, N_HEADS, HEAD_DIM))
        for hd in range(N_HEADS):
            kh, vh = k[:, hd // groups], v[:, hd // groups]
            sc = q[:, hd] @ kh.T / np.sqrt(HEAD_DIM)
            sc = sc + np.triu(np.full((n, n), -np.inf), 1)
            e = np.exp(sc - sc.max(axis=1, keepdims=True))
            out[:, hd] = (e / e.sum(axis=1, keepdims=True)) @ vh
        x = x + mul(out.reshape(n, -1), p + "attn_output.weight")
        h = rms(x, d(p + "ffn_norm.weight"))
        g = mul(h, p + "ffn_gate.weight")
        u = mul(h, p + "ffn_up.weight")
        x = x + mul(g / (1.0 + np.exp(-g)) * u, p + "ffn_down.weight")
    return mul(rms(x, d("output_norm.weight")), "token_embd.weight")


def check_tokens(tokens):
    """A prompt that reaches markers, merged tokens and bytes, by ID."""
    def id_of(t):
        return tokens.index(t)
    return [id_of("<|im_start|>"), id_of("u"), id_of("s"), id_of("e"), id_of("r"), id_of("Ċ"),
            id_of("H"), id_of("Ġthe"), id_of("Ġday"), id_of("ä¼ĳ"), id_of("?"),
            id_of("<|im_end|>")]


def write_model(path, template, rng):
    """The tiny model file; returns its vocabulary and the reference scores."""
    tokens, types, merges = vocabulary()
    w = weights(rng, len(tokens))
    ids = check_tokens(tokens)
    scores = forward(w, ids)
    gw = GGUFWriter(path, ARCH)
    gw.add_custom_alignment(ALIGNMENT)
    gw.add_name("tiny-qwen3")
    gw.add_uint32(f"{ARCH}.block_count", N_LAYERS)
    gw.add_uint32(f"{ARCH}.context_length", CONTEXT)
    gw.add_uint32(f"{ARCH}.embedding_length", HIDDEN)
    gw.add_uint32(f"{ARCH}.feed_forward_length", FFN)
    gw.add_uint32(f"{ARCH}.attention.head_count", N_HEADS)
    gw.add_uint32(f"{ARCH}.attention.head_count_kv", N_KV_HEADS)
    gw.add_float32(f"{ARCH}.rope.freq_base", THETA)
    gw.add_float32(f"{ARCH}.attention.layer_norm_rms_epsilon", EPS)
    gw.add_uint32(f"{ARCH}.attention.key_length", HEAD_DIM)
    gw.add_uint32(f"{ARCH}.attention.value_length", HEAD_DIM)
    gw.add_tokenizer_model("gpt2")
    gw.add_tokenizer_pre("qwen2")
    gw.add_token_list(tokens)
    gw.add_token_types(types)
    gw.add_token_merges(merges)
    gw.add_eos_token_id(tokens.index("<|im_end|>"))
    gw.add_pad_token_id(tokens.index("<|endoftext|>"))
    gw.add_add_bos_token(False)
    gw.add_chat_template(template)
    # One value of each GGUF type, read back by the reader's tests.
    gw.add_uint8("ksai.check.u8", 200)
    gw.add_int8("ksai.check.i8", -100)
    gw.add_uint16("ksai.check.u16", 60000)
    gw.add_int16("ksai.check.i16", -30000)
    gw.add_uint32("ksai.check.u32", 4000000000)
    gw.add_int32("ksai.check.i32", -2000000000)
    gw.add_float32("ksai.check.f32", 1.5)
    gw.add_bool("ksai.check.bool", True)
    gw.add_string("ksai.check.string", "かんそ ✓")
    gw.add_uint64("ksai.check.u64", 2 ** 40 + 3)
    gw.add_int64("ksai.check.i64", -(2 ** 40) - 5)
    gw.add_float64("ksai.check.f64", 3.25e-7)
    gw.add_array("ksai.check.strings", ["", "a", "ü", "かんそ"])
    gw.add_key_value("ksai.check.tokens", ids, GGUFValueType.ARRAY, GGUFValueType.INT32)
    gw.add_key_value("ksai.check.scores", [float(v) for v in scores.astype(np.float32).ravel()],
                     GGUFValueType.ARRAY, GGUFValueType.FLOAT32)
    for name, (data, qtype, _) in w.items():
        if qtype == Q.F32:
            gw.add_tensor(name, data)
        else:
            gw.add_tensor(name, data, raw_dtype=qtype)
    gw.write_header_to_file()
    gw.write_kv_data_to_file()
    gw.write_tensors_to_file()
    gw.close()
    return ids, scores


def compare_with_llama(path, ids, scores):
    """llama.cpp's scores for the same tokens, against the F64 reference; says the largest gap."""
    try:
        import llama_cpp
    except ImportError:
        print("SKIP: llama_cpp is not installed, so llama.cpp's scores are not compared")
        return
    # Its cache in F32 (type 0), as the reference's.
    llm = llama_cpp.Llama(path, n_ctx=64, n_threads=1, logits_all=True, verbose=False, type_k=0,
                          type_v=0)
    llm.eval(ids)
    got = np.array(llm.scores[:len(ids)], dtype=np.float64)
    gap = np.abs(got - scores).max()
    agree = (got.argmax(axis=1) == scores.argmax(axis=1)).mean()
    print(f"llama.cpp against the F64 reference: largest gap {gap:.2e} over scores up to "
          f"{np.abs(scores).max():.2f}; the top token agrees at {agree:.0%} of positions")


def tool(name, description, props, required):
    """One tool, in the shape a client sends."""
    return {"type": "function", "function": {"name": name, "description": description,
            "parameters": {"type": "object", "properties": props, "required": required}}}


TOOLS = [
    tool("search", "Find the lines that hold a text. ASCII case is ignored.",
         {"text": {"type": "string", "description": "The exact text, such as \"leave\"."},
          "path": {"type": "string", "description": "A folder; empty for all of them."}},
         ["text"]),
    tool("read", "Read numbered lines of one file: 休暇 \\ <b>",
         {"path": {"type": "string"}, "from_line": {"type": "integer", "minimum": 1}},
         ["path", "from_line"]),
]


def call(cid, name, arguments):
    """One tool call an assistant message holds."""
    return {"id": cid, "type": "function", "function": {"name": name, "arguments": arguments}}


CASES = [
    # A whole round with tools, as ksagent sends it: arguments are JSON text.
    {"messages": [
        {"role": "system", "content": "You answer from the files."},
        {"role": "user", "content": "How much leave? 休暇"},
        {"role": "assistant", "content": None,
         "tool_calls": [call("call_1", "search", "{\"text\": \"leave\"}")]},
        {"role": "tool", "tool_call_id": "call_1", "content": "rules/leave.md:3: ten days"},
        {"role": "tool", "tool_call_id": "call_1", "content": "no more hits"},
        {"role": "assistant", "content": "Ten days."},
        {"role": "user", "content": "And sick days?"}], "tools": TOOLS},
    # Tools and no system message; two calls with text before them, arguments as an object.
    {"messages": [
        {"role": "user", "content": "Read it."},
        {"role": "assistant", "content": "I will look.",
         "tool_calls": [call("a", "search", {"text": "x", "path": ""}),
                        call("b", "read", "{\"path\":\"a.md\",\"from_line\":1}")]},
        {"role": "tool", "content": "a.md:1: x"},
        {"role": "tool", "content": "1: x"}], "tools": TOOLS},
    # No tools, no system message.
    {"messages": [{"role": "user", "content": "Hi"}]},
    # No tools; a system message first and another later, and a null content.
    {"messages": [
        {"role": "system", "content": "Be brief."},
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hello."},
        {"role": "system", "content": "Now answer in Japanese."},
        {"role": "user", "content": None}]},
    # The last message is the assistant's after the last question: an empty thinking block.
    {"messages": [
        {"role": "user", "content": "Count to two."},
        {"role": "assistant", "content": "One,"}]},
    # A thinking block written in the content, and one given as `reasoning_content`.
    {"messages": [
        {"role": "user", "content": "First?"},
        {"role": "assistant", "content": "<think>\nhmm\n</think>\n\nYes."},
        {"role": "user", "content": "Second?"},
        {"role": "assistant", "content": "Maybe.", "reasoning_content": "\nlet me see\n"},
        {"role": "tool", "content": "done"}]},
    # A user message that is a tool response does not count as the last question.
    {"messages": [
        {"role": "user", "content": "Go."},
        {"role": "assistant", "content": "", "tool_calls": [call("c", "search", "{}")]},
        {"role": "user", "content": "<tool_response>\nnothing\n</tool_response>"},
        {"role": "assistant", "content": "Done.", "reasoning_content": "checked"}],
     "tools": TOOLS},
]


def write_cases(path, template):
    """Each case with the prompt llama.cpp's Jinja formatter renders for it."""
    from llama_cpp.llama_chat_format import Jinja2ChatFormatter
    fmt = Jinja2ChatFormatter(template, eos_token="<|im_end|>", bos_token="")
    out = []
    for case in CASES:
        prompt = fmt(messages=case["messages"], tools=case.get("tools")).prompt
        request = {"model": "local", "stream": False, "messages": case["messages"]}
        if "tools" in case:
            request["tools"] = case["tools"]
        out.append({"request": request, "prompt": prompt})
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")


def self_test():
    """What needs neither the download nor llama.cpp; the file only where `gguf` is installed."""
    alphabet = byte_alphabet()
    assert len(set(alphabet)) == 256 and alphabet[0] == "!" and alphabet[32] == "A", "the alphabet"
    assert alphabet[188] == "Ā" and "Ġ" in alphabet, "the bytes without a glyph come last"
    tokens, _, _ = vocabulary()
    have_gguf = load_reference()
    w = weights(np.random.default_rng(SEED), len(tokens), quantized=have_gguf)
    ids = check_tokens(tokens)
    whole = forward(w, ids)
    start = forward(w, ids[:5])
    assert np.allclose(whole[:5], start, rtol=0, atol=1e-9), "a position sees no later token"
    print("[self-test] make_qwen_fixtures: the byte alphabet, and a reference that sees no later token")
    if not have_gguf:
        print("[self-test] To write and read back the model file, install gguf.")
        return
    with tempfile.TemporaryDirectory() as out:
        path = os.path.join(out, "tiny.gguf")
        write_model(path, "{{ messages }}", np.random.default_rng(SEED))
        r = GGUFReader(path)
        assert len(r.tensors) == 2 + 11 * N_LAYERS, "the tensors"
        assert len(r.fields["ksai.check.scores"].data) == len(ids) * len(tokens), "the scores"
    print("[self-test] make_qwen_fixtures: the model file written and read back")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--template-from", required=True,
                    help="the Qwen3-4B-Instruct-2507 GGUF file whose chat template is taken")
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    if not load_reference():
        sys.exit("make_qwen_fixtures: writing the files needs gguf: pip install gguf")
    field = GGUFReader(a.template_from).fields["tokenizer.chat_template"]
    template = bytes(field.parts[field.data[0]]).decode("utf-8")
    os.makedirs(a.out_dir, exist_ok=True)
    path = os.path.join(a.out_dir, "tiny_qwen3.gguf")
    ids, scores = write_model(path, template, np.random.default_rng(SEED))
    print(f"wrote {path}: {os.path.getsize(path)} bytes, {len(ids)} check tokens")
    compare_with_llama(path, ids, scores)
    cases = os.path.join(a.out_dir, "template_cases.json")
    write_cases(cases, template)
    print(f"wrote {cases}: {len(CASES)} conversations")


if __name__ == "__main__":
    main()
