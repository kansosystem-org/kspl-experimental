#!/usr/bin/env python3
"""Stage 3: the logit parity check (the HF side).

Puts out the final-position logits of HF (transformers) Qwen for the same token-ID sequence.
Matched against the output of KSPL's
`echo "<ids>" | out/qwen_infer.exe out/qwen_kspl.safetensors`, it confirms whether the native
implementation reproduces the base model correctly.

  python3 tools/ai_assist/qwen_logit_parity.py --base-model Qwen/Qwen2.5-Coder-0.5B --tokens "3 1 4"

The output is in the same form as KSPL's: "ARGMAX <id>" and "LOGITS[0:10] v0 .. v9".
the logits do not match exactly, because the order of the additions differs. The architecture
   is right as long as ARGMAX matches and the leading 10 dimensions are numerically close (within
   ~1e-2).
"""
import argparse
import sys


def main():
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

    ids = [int(t) for t in args.tokens.split()]
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    model.eval()
    with torch.no_grad():
        out = model(torch.tensor([ids], dtype=torch.long))
    logits = out.logits[0, -1, :].float().cpu().numpy()
    print(f"ARGMAX {int(logits.argmax())}")
    print("LOGITS[0:10] " + " ".join(f"{v:.6f}" for v in logits[:10]))


if __name__ == "__main__":
    main()
