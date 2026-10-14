#!/usr/bin/env python3
"""Stage 3  The external LoRA fine-tuning pipeline (run it where a GPU and Hugging Face are reachable).

This repository's sandbox has neither a GPU nor a route to Hugging Face, so this script cannot be run
here (a genuine constraint, and no way around it is taken). It is provided as a template that "runs as
it stands", meant to be run on a machine with a GPU (your own, Colab, and the like). Of its logic,
only the part that converts into `ksai/lora.kspls`'s format (`convert_peft_state_dict`) is unit-checked
even in this sandbox, on synthesized data (see the self-test under __main__ below; it needs neither a
GPU nor the network).

How to use it (on the GPU side):
  pip install torch transformers peft safetensors
  python3 lora_finetune_external.py \
      --base-model Qwen/Qwen2.5-Coder-0.5B \
      --train-jsonl tools/ai_assist/corpus/fim_train.jsonl \
      --out out/kanso_lora.safetensors

What comes out is safetensors the KSPL side reads as it stands: `Qkv_lora.load_set` in
`ksai/lora.kspls` (which calls `lora_load_from` inside), `Mini_llama.load_lora_set` in
`ksai/examples/llama_engine/model.kspls` and `Qwen_model.load_lora_set` in `ksai/examples/qwen_infer/main.kspls` all share
the same naming convention.
The name convention: "blocks.{i}.attn.{q,v}.lora_{a,b,scale}"
  lora_a: [in, rank]   lora_b: [rank, out] (with alpha/rank's scale already baked in)
  lora_scale: [1] holding 1.0 (the scale is baked into b, so this is the identity)
"""
import argparse
import json
import re
import struct
import sys

from tools.ai_assist.safetensors_io import write_safetensors


def load_jsonl(path):
    """Reads JSONL (one record per line).

    Caution: This script stays on the PyTorch side (the outside ML ecosystem), so the KSPL version
    (`load_jsonl` in `tools/ai_assist/ksplc_oracle.kspls`) cannot be called from here. It is three
    lines, so it is copied.
    """
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

# A peft key's prefix and adapter name change with the version and the wrapping depth (e.g.
# "base_model.model.model.layers.0.self_attn.q_proj.lora_A.default.weight"), so only the layer
# number and the projection kind are matched.
LORA_A_RE = re.compile(r"\.layers\.(\d+)\.self_attn\.(q_proj|v_proj)\.lora_A\.")


def convert_peft_state_dict(state_dict, rank, alpha):
    """Converts a peft LoRA state_dict (Q/V's lora_A/lora_B) into the KSPL side's convention.

    peft's (HuggingFace's) custom: y = x @ W^T + scale * (x @ lora_A^T @ lora_B^T)
      lora_A.*.weight: [rank, in]   lora_B.*.weight: [out, rank]
    The KSPL side's convention (`ksai/lora.kspls`): delta = x @ A @ B  (A:[in,rank], B:[rank,out])
      = peft's A^T and B^T. And scale=alpha/rank is baked into the B side
      (the KSPL side only has to hold a one-element lora_scale tensor as the identity 1.0).

    The state_dict argument is a plain dict of {tensor_name: a 2D list (or equivalent row-major
    data)} (it does not depend on torch, so a test can check this function on its own).
    What comes back is in the {kanso_name: (shape, flat_row_major_list)} form.
    """
    scale = alpha / rank
    out = {}
    for a_key, a in state_dict.items():
        m = LORA_A_RE.search(a_key)
        if not m:
            continue
        layer, proj = int(m.group(1)), m.group(2)
        b_key = a_key.replace("lora_A", "lora_B")  # the prefix and adapter name should be the same
        if b_key not in state_dict:
            continue
        b = state_dict[b_key]  # [out, rank]
        in_dim = len(a[0])
        out_dim = len(b)
        # A^T: [in, rank]
        a_t = [[a[r][i] for r in range(rank)] for i in range(in_dim)]
        # B^T * scale: [rank, out]
        b_t = [[b[o][r] * scale for o in range(out_dim)] for r in range(rank)]
        kanso_proj = "q" if proj == "q_proj" else "v"
        prefix = f"blocks.{layer}.attn.{kanso_proj}"
        out[prefix + ".lora_a"] = ((in_dim, rank), [v for row in a_t for v in row])
        out[prefix + ".lora_b"] = ((rank, out_dim), [v for row in b_t for v in row])
        out[prefix + ".lora_scale"] = ((1,), [1.0])  # the scale is baked into b already
    return out


def pack_for_write(tensors):
    """Turns convert_peft_state_dict's output ({name: (shape, flat_f32_list)}) into the
    (name, shape, raw_bytes) `write_safetensors` in `tools/ai_assist/safetensors_io.py` expects."""
    for name, (shape, flat) in tensors.items():
        yield name, shape, struct.pack(f"<{len(flat)}f", *flat)


def inject_kanso_lora(model, kanso_tensors):
    """Stage 4, continued training: writes a saved kanso-format LoRA
    (blocks.{i}.attn.{q,v}.lora_{a,b,scale}) into the peft model's matching lora_A/lora_B parameters
    (convert_peft_state_dict the other way). The caller's LoraConfig has to be set to alpha=rank
    (peft's internal scale=1), because the kanso side's convention saves the scale baked into b."""
    import torch
    sd = model.state_dict()
    written = 0
    for name in list(sd.keys()):
        m = LORA_A_RE.search(name)
        if not m:
            continue
        layer, proj = int(m.group(1)), m.group(2)
        prefix = f"blocks.{layer}.attn.{'q' if proj == 'q_proj' else 'v'}"
        if f"{prefix}.lora_a" not in kanso_tensors:
            continue
        a = kanso_tensors[f"{prefix}.lora_a"]  # [in, rank]
        b = kanso_tensors[f"{prefix}.lora_b"]  # [rank, out]
        scale = float(kanso_tensors[f"{prefix}.lora_scale"][0])
        b_key = name.replace("lora_A", "lora_B")
        with torch.no_grad():
            sd[name].copy_(torch.from_numpy(a.T.copy()))
            sd[b_key].copy_(torch.from_numpy((b * scale).T.copy()))
        written += 2
    print(f"[continue-from] read {written} LoRA tensors (0 may mean the layer count or the naming "
          f"does not match)")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base-model", required=True, help="the name of a small HF Coder model")
    ap.add_argument("--train-jsonl", default="tools/ai_assist/corpus/fim_train.jsonl")
    ap.add_argument("--extra-jsonl", default=None,
                     help="phase 4: data mixed in on top for continued training (for example "
                          "feedback_train.jsonl). Mixing it with --train-jsonl avoids "
                          "catastrophically forgetting what is already known")
    ap.add_argument("--continue-from", default=None,
                     help="phase 4: continue training from an existing kanso-format LoRA "
                          "(safetensors). The rank is matched to that file automatically")
    ap.add_argument("--out", default="out/kanso_lora.safetensors")
    ap.add_argument("--rank", type=int, default=8)
    ap.add_argument("--alpha", type=float, default=16.0)
    ap.add_argument("--epochs", type=int, default=1)
    ap.add_argument("--lr", type=float, default=None,
                     help="the learning rate (the default is 5e-4 training anew, and 1e-4 with "
                          "--continue-from given)")
    ap.add_argument("--max-length", type=int, default=256,
                     help="the cap on the token length (the shorter, the less memory)")
    ap.add_argument("--batch-size", type=int, default=1, help="the batch size per GPU/CPU")
    ap.add_argument("--grad-accum", type=int, default=8,
                     help="how many gradient-accumulation steps (the effective batch is "
                          "batch_size*grad_accum)")
    ap.add_argument("--dtype", default="bf16", choices=["fp32", "bf16", "fp16"],
                     help="the precision the base model is loaded at. bf16 is recommended on a CPU "
                          "or where memory is tight")
    ap.add_argument("--no-grad-checkpointing", action="store_true",
                     help="turn gradient checkpointing off (ordinarily it can be left on)")
    ap.add_argument("--max-examples", type=int, default=0,
                     help="narrow the training data to the first N records, to see that it runs "
                          "(0 = all of them)")
    args = ap.parse_args()

    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments
        from peft import LoraConfig, get_peft_model
    except ImportError as e:
        print(f"[error] a library the GPU side needs is absent: {e}\n"
              f"  Please run this script where `pip install torch transformers peft` can be run "
              f"(this sandbox is not such a place: no GPU, and huggingface.co is unreachable).",
              file=sys.stderr)
        sys.exit(1)

    kanso_tensors = None
    rank = args.rank
    if args.continue_from:
        from safetensors.numpy import load_file
        kanso_tensors = load_file(args.continue_from)
        rank = kanso_tensors["blocks.0.attn.q.lora_a"].shape[1]
        print(f"[continue-from] found rank={rank} in {args.continue_from}")

    torch_dtype = {"fp32": torch.float32, "bf16": torch.bfloat16,
                    "fp16": torch.float16}[args.dtype]
    tok = AutoTokenizer.from_pretrained(args.base_model)
    if tok.pad_token is None:  # for a model with no padding token set, as in the Qwen family
        tok.pad_token = tok.eos_token
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch_dtype)
    if not args.no_grad_checkpointing:
        model.gradient_checkpointing_enable()  # recomputes the activations, saving a lot of memory
        model.enable_input_require_grads()  # required to combine checkpointing with a frozen base
    # With continue-from, alpha=rank pins peft's scale (alpha/rank) at 1: the kanso side has the
    # scale baked into b already.
    alpha = rank if kanso_tensors is not None else args.alpha
    lora_cfg = LoraConfig(r=rank, lora_alpha=alpha,
                           target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
    model = get_peft_model(model, lora_cfg)
    if kanso_tensors is not None:
        inject_kanso_lora(model, kanso_tensors)
    model.print_trainable_parameters()  # to see that what is trained (the LoRA) is a tiny part

    examples = load_jsonl(args.train_jsonl)
    if args.extra_jsonl:
        examples += load_jsonl(args.extra_jsonl)
        print(f"[continue-from] mixed in {args.extra_jsonl} from --extra-jsonl "
              f"({len(examples)} records in all)")
    if args.max_examples > 0:
        examples = examples[:args.max_examples]

    def to_text(ex):  # FIM: prefix + middle + suffix used as plain next-token training
        return ex["prefix"] + ex["middle"] + ex["suffix"]

    enc = tok([to_text(e) for e in examples], truncation=True, max_length=args.max_length,
              padding=True, return_tensors="pt")
    dataset = torch.utils.data.TensorDataset(enc["input_ids"], enc["attention_mask"])

    class Ds(torch.utils.data.Dataset):
        def __len__(self):
            return len(dataset)

        def __getitem__(self, i):
            ids, mask = dataset[i]
            return {"input_ids": ids, "attention_mask": mask, "labels": ids.clone()}

    lr = args.lr if args.lr is not None else (1e-4 if args.continue_from else 5e-4)
    trainer = Trainer(model=model, args=TrainingArguments(
        output_dir="out/lora_run", num_train_epochs=args.epochs, learning_rate=lr,
        per_device_train_batch_size=args.batch_size, gradient_accumulation_steps=args.grad_accum,
        logging_steps=10, save_strategy="no"), train_dataset=Ds())
    trainer.train()

    sd = {k: v.detach().to(torch.float32).cpu().tolist()
          for k, v in model.state_dict().items() if "lora_" in k}
    kanso_tensors = convert_peft_state_dict(sd, rank, alpha)
    if not kanso_tensors:
        print("[error] not one LoRA tensor was found. peft's version may name its keys "
              "differently from what is assumed. The actual key names (the first 10):",
              file=sys.stderr)
        for k in list(sd.keys())[:10]:
            print(f"  {k}", file=sys.stderr)
        sys.exit(1)
    n_pairs = len(kanso_tensors) // 3  # three of lora_{a,b,scale} per (q,v) x layer
    expected = model.config.num_hidden_layers * 2
    if n_pairs != expected:
        print(f"[warn] {n_pairs} (layer, proj) pairs were found "
              f"(expected: {model.config.num_hidden_layers} layers x 2 = {expected})",
              file=sys.stderr)
    write_safetensors(pack_for_write(kanso_tensors), args.out)
    print(f"saved {len(kanso_tensors)} tensors ({n_pairs} adapters) -> {args.out}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main()
    else:
        # The self-test (no GPU or network): the conversion logic on a synthesized state_dict,
        # keyed as get_peft_model names them
        # ("base_model.model.model.layers.N.self_attn.PROJ.lora_A.default.weight"). The prefix
        # varies per layer so the regular expression is checked on both forms.
        import random
        random.seed(0)
        n_layers, rank, in_dim, out_dim, alpha = 2, 4, 8, 8, 16.0
        key_prefixes = ["base_model.model.model", "base_model.model"]  # peft's / plain naming
        key_suffixes = [".default.weight", ".weight"]  # with / without the adapter name
        sd = {}
        for layer in range(n_layers):
            prefix, suffix = key_prefixes[layer % 2], key_suffixes[layer % 2]
            for proj in ("q_proj", "v_proj"):
                a_key = f"{prefix}.layers.{layer}.self_attn.{proj}.lora_A{suffix}"
                b_key = f"{prefix}.layers.{layer}.self_attn.{proj}.lora_B{suffix}"
                sd[a_key] = [[random.uniform(-1, 1) for _ in range(in_dim)] for _ in range(rank)]
                sd[b_key] = [[random.uniform(-1, 1) for _ in range(rank)] for _ in range(out_dim)]

        out = convert_peft_state_dict(sd, rank, alpha)
        assert len(out) == n_layers * 2 * 3, \
            "the total of layers x {q,v} x {a,b,scale} does not add up"

        # Checking the numbers: whether delta = x @ A_peft^T @ B_peft^T * scale (peft's definition)
        # agrees with x @ A_kanso @ B_kanso (the KSPL side's definition; the scale is baked into b).
        scale = alpha / rank
        x = [random.uniform(-1, 1) for _ in range(in_dim)]

        def matvec(mat_rows, v):  # mat_rows: [out][in] row-major x [in] -> [out]
            return [sum(row[i] * v[i] for i in range(len(v))) for row in mat_rows]

        for layer in range(n_layers):
            prefix, suffix = key_prefixes[layer % 2], key_suffixes[layer % 2]
            for proj in ("q_proj", "v_proj"):
                a_key = f"{prefix}.layers.{layer}.self_attn.{proj}.lora_A{suffix}"
                b_key = f"{prefix}.layers.{layer}.self_attn.{proj}.lora_B{suffix}"
                # peft: delta = ((x @ A^T) @ B^T) * scale ; A:[rank,in],B:[out,rank]
                xa_peft = matvec(sd[a_key], x)  # [rank]
                delta_peft = [v * scale for v in matvec(sd[b_key], xa_peft)]  # [out]

                # kanso: delta = x @ A_k @ B_k ; A_k:[in,rank] (=A^T), B_k:[rank,out] (=B^T*scale)
                kprefix = f"blocks.{layer}.attn.{'q' if proj == 'q_proj' else 'v'}"
                (a_shape, a_flat) = out[kprefix + ".lora_a"]
                (b_shape, b_flat) = out[kprefix + ".lora_b"]
                a_k = [a_flat[i * rank:(i + 1) * rank] for i in range(in_dim)]  # [in][rank]
                b_k = [b_flat[r * out_dim:(r + 1) * out_dim] for r in range(rank)]  # [rank][out]
                xa_k = [sum(x[i] * a_k[i][r] for i in range(in_dim)) for r in range(rank)]
                delta_kanso = [sum(xa_k[r] * b_k[r][o] for r in range(rank))
                               for o in range(out_dim)]

                max_diff = max(abs(p - k) for p, k in zip(delta_peft, delta_kanso))
                assert max_diff < 1e-9, \
                    f"{layer}/{proj}: peft's and kanso's delta disagree ({max_diff})"

        # Writing and reading safetensors (the byte format) is self-checked too.
        #
        # Caution: **Do not write the place in directly** (Windows has no `/tmp`: FileNotFoundError
        # there alone). **Wrap it in a `with`**, or a failing assert below skips the cleanup.
        import os
        import tempfile
        with tempfile.TemporaryDirectory() as work:
            path = os.path.join(work, "lora_selftest.safetensors")
            write_safetensors(pack_for_write(out), path)
            size = os.path.getsize(path)
        assert size > 8, "the safetensors file is too small"

        print(f"[self-test] OK: {len(out)} tensors, peft's and kanso's delta agree (error<1e-9), "
              f"safetensors written out at {size} bytes")
        print("[self-test] Checked this far with no GPU or network.")
        print("[self-test] For the fine-tuning itself, run this script where a GPU and Hugging Face")
        print("[self-test] are reachable, giving it --base-model and the rest.")
