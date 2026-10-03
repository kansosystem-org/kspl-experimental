# tools — what is left

**Only what is not done is listed here.** A finished stage is deleted, and its result goes into the document of its kind ("Document naming" in [`SPEC-documents.md`](../../docs/SPEC-documents.md)). What spans packages is in [`docs/PLAN.md`](../../docs/PLAN.md).

All of it belongs to the coding assistant (`tools/ai_assist/`). What is in place is in [`tools/ai_assist/README.md`](../ai_assist/README.md), and why it is built that way is in "The coding assistant" in [`tools/docs/DESIGN.md`](DESIGN.md).

| | What is left | What marks it as done |
| :-- | :-- | :-- |
| stage 2 | **A LoRA that speaks KSPL.** No adapter is trained on the FIM corpus: the adapter that shows the pipeline runs is close to untrained. Training one needs only the FIM corpus `make_fim.kspls` writes and `lora_finetune_external.py` as it is | `eval_fim.kspls`'s compile pass rate on `corpus/fim_val.jsonl` beats the base model's |
| stage 3 | **The self-evolution loop.** Of the loop below, only continued training exists (`lora_finetune_external.py --continue-from`). Missing: ① the part that emits completions and writes the usage log, ② the part that scores with `ksplc_oracle` and keeps only what passed, ③ the regression gate that compares new and old output and promotes, rejects or holds. ② and ③ need only the compiler reward, so they can be built as soon as ① exists | The loop turns once end to end: a usage log written, scored, trained on, and the new adapter promoted or rejected by the gate |

```
[use] the side emitting completions appends (prefix, middle, suffix) one line at a time   … missing
   ▼
usage_log.jsonl                                              … nothing writes it
   ▼
[reward and batching] only the compile-passing ones are taken   … missing
   ▼
feedback_train.jsonl
   ▼
[continued training] lora_finetune_external.py --continue-from <the current adapter> \
             --extra-jsonl feedback_train.jsonl               … in the tree
   │  trains on top of the existing adapter at a low learning rate (1e-4 by default), avoiding catastrophic forgetting
   ▼
out/kanso_lora_vN.safetensors (a new version)
   ▼
[regression gate] compares the new and old output and promotes / rejects / holds  … missing
```

## What is decided about the loop

1. **The usage log is off by default.** The part that emits completions writes it only when given a path: privacy comes first.
2. **Continued training is started by hand** (there is no `make retrain`). Background work and automatic retraining go against keeping the compiler light and stable.
3. **The regression gate promotes a new version only when it is at least as good as the old one.** While there are few samples, the gate withholds its verdict, so noise neither promotes nor rejects a version.

## Where the native model stands

**The KSPL-native model (`ksai/examples/fim_coder`, built by `make fim-model`) scores above the empty completion and far below the oracle** on `make fim-eval`. It writes KSPL's surface (the `//<` comments, `fn main(): I32`, `priv const`) and little of its meaning.

## Not yet decided: the editor's signal

**Stage 3 runs on the compiler reward alone.** `ksplc_oracle` gives that reward: objective, deterministic, and callable without limit. The other signal, whether the editor accepted a completion, needs an editor plugin, and none exists (the assistant runs outside the language server: "Why the assistant runs outside the language server" in [`tools/docs/DESIGN.md`](DESIGN.md)).

**Do not fill that signal with made-up or guessed data**: the model would learn from answers no editor gave.

How the editor reports is decided once an editor plugin exists. One candidate is a two-step exchange: `complete` returns a `request_id`, and `feedback <id> accepted|rejected` reports on it later.
