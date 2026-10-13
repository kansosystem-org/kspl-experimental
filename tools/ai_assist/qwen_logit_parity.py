#!/usr/bin/env python3
"""Stage 3: the logit parity check (the HF side).

Puts out the final-position logits of HF (transformers) Qwen for the same token-ID sequence.
Matched against the output of KSPL's
`echo "<ids>" | out/qwen_infer.exe out/qwen_kspl.safetensors`, it confirms whether the native
implementation reproduces the base model correctly.

  python3 tools/ai_assist/qwen_logit_parity.py --base-model Qwen/Qwen2.5-Coder-0.5B --tokens "3 1 4"

The output is in the same form as KSPL's: "ARGMAX <id>" and "LOGITS[0:10] v0 .. v9".
Run with no argument, it self-tests what needs no model.
Caution: the logits do not match exactly, because the order of the additions differs. The
architecture is right as long as ARGMAX matches and the leading 10 dimensions are numerically
close (within ~1e-2).
"""
import argparse
import sys


def parse_tokens(text):
    """The token-ID sequence written as whitespace-separated integers."""
    return [int(t) for t in text.split()]


def report_lines(logits):
    """The two lines KSPL's qwen_infer prints, for a flat sequence of floats.

    Caution: **Keep the form KSPL's** (`ARGMAX <id>`, `LOGITS[0:10] v0 .. v9`); the check is a
    line-by-line comparison of the two outputs.
    """
    vals = [float(v) for v in logits]
    best = max(range(len(vals)), key=lambda i: vals[i])
    return [f"ARGMAX {best}", "LOGITS[0:10] " + " ".join(f"{v:.6f}" for v in vals[:10])]


def self_test():
    """What can be checked with no torch, no transformers and no model: the parsing and the form."""
    assert parse_tokens(" 3 1\t4 ") == [3, 1, 4]
    lines = report_lines([0.5, 2.0, -1.0] + [0.0] * 9)
    assert lines[0] == "ARGMAX 1", lines[0]
    assert lines[1].startswith("LOGITS[0:10] 0.500000 2.000000 -1.000000"), lines[1]
    assert len(lines[1].split()) == 11, lines[1]
    print("[self-test] the token parsing and the ARGMAX / LOGITS lines' form are confirmed.")
    print("[self-test] To compare with a real model, run it with --base-model.")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", required=True)
    ap.add_argument("--tokens", default="3 1 4", help="a whitespace-separated token-ID sequence")
    args = ap.parse_args()
    try:
        import torch
        from transformers import AutoModelForCausalLM
    except ImportError as e:
        print(f"[error] transformers/torch is required: {e}", file=sys.stderr)
        sys.exit(1)

    ids = parse_tokens(args.tokens)
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    model.eval()
    with torch.no_grad():
        out = model(torch.tensor([ids], dtype=torch.long))
    logits = out.logits[0, -1, :].float().cpu().numpy()
    for line in report_lines(logits.tolist()):
        print(line)


if __name__ == "__main__":
    main()
