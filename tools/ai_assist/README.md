# ai_assist — the coding assistant

The pipeline (data, evaluation, training) for building an AI that completes KSPL code. It is kept apart from the language core and the AI engine (`ksai`). Why it is built this way is in "The coding assistant" in [`tools/docs/DESIGN.md`](../docs/DESIGN.md); what is left is in [`tools/docs/PLAN.md`](../docs/PLAN.md).

Note: If how an AI works is new to you, read [`../../ksai/README.md`](../../ksai/README.md) (the introduction to the KSPL-native AI engine) first.

## Run it

```sh
make fim-corpus   # the corpus and the FIM examples -> tools/ai_assist/corpus/
make fim-model    # the tokenizer, then the KSPL-native model -> out/fim_coder.safetensors
make fim-eval     # the model's held-out loss, then the rate at which ksplc accepts its completions
```

Each KSPL tool also runs alone: `./out/ksplc_stage1.exe run tools/ai_assist/<tool>.kspls`, with the usage in the file's header.

## What is here

| File | What it does |
| :-- | :-- |
| `ksplc_oracle.kspls` | The compiler oracle's shared parts: an error count plus the diagnostics, and reading JSONL. Evaluation, generation and filtering all use it; it has no executable of its own. |
| `build_corpus.kspls` / `corpus_count.kspls` | Normalizes every source through `fmt`, removes duplicates, splits train/val and counts, writing to `corpus/`. `corpus_count.kspls` holds the counting rules (the folders left out; words, tokens and lines), split off so it can be tested. |
| `make_fim.kspls` | Writes FIM training examples to `corpus/fim_{train,val}.jsonl`. The source is self-hosted code that compiles, so the middle is the correct completion by definition and no example needs recompiling. |
| `eval_fim.kspls` | Hides single lines of the validation files, inserts a model's completion, and measures the rate at which `ksplc` accepts the file (`make fim-eval`). `--model=native` runs `ksai/examples/fim_coder` as its own process. A file that does not compile on its own gives no holes. |
| `make_error_fix.kspls` / `fix_names.kspls` | Breaks the source in exactly one place (a missing `;`/`}`, a deleted line, a type typo), confirms the diagnostic `ksplc` really emits, and writes the triples (broken code, real diagnostic, fixed code) into `corpus/error_fix.jsonl`. `fix_names.kspls` holds how it builds the names in the examples, split off so it can be tested. |
| `train_bpe.kspls` | Derives the BPE vocabulary and merges from the corpus into `tokenizer/`, which `Tokenizer.load` in `ksai/tokenizer.kspls` reads. |
| `lora_finetune_external.py` | Fine-tunes a LoRA outside KSPL, on a GPU machine (from scratch, or continued with `--continue-from`), and writes it as safetensors in the KSPL convention. `--help` lists its options, including those for a CPU. |
| `export_qwen_to_kspl.py` / `export_qwen_tokenizer.py` | Convert Hugging Face Qwen's weights and tokenizer into the files `ksai` reads. |
| `qwen_logit_parity.py` | Prints Hugging Face's logits for the same input, to compare with KSPL's. |
| `safetensors_io.py` | Writes safetensors, for `export_qwen_to_kspl.py` and `lora_finetune_external.py`. |
| `tests/` | `corpus_count_test.kspls`, `fix_names_test.kspls`, and `oracle_test.kspls`, which starts the real compiler; `make debug-tools` runs them with the rest of the tools' tests. |

**`corpus/` and `tokenizer/` are generated and reproducible**, and git ignores them; the scripts and the tools are the product.

### The outside packages needed

**They are not needed to build.** These serve only the Python helpers here, and the repository builds and passes `make ci` without them.

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install numpy torch transformers peft safetensors
```

**`tools/kspl_lldb.py`'s `lldb` is not among them.** It is a Python module that comes with LLVM, not from pip, and is installed with LLVM ([`.devcontainer/Dockerfile`](../../.devcontainer/Dockerfile)).

### How borrowed models are handled

**The models' weights are not in this repository.** `export_qwen_to_kspl.py` converts weights you obtain yourself (`--base-model Qwen/Qwen2.5-Coder-0.5B`). Only the conversion procedure is distributed here, so the [MIT](../../LICENSE.md) notice does not cover the model.

**The converted safetensors inherit the original model's license.** To distribute them, meet its conditions (the Qwen2.5 family is Apache-2.0, which requires attribution).

The `ksai/examples/llama_engine/mini_llama.safetensors` and `ksos/demo/cortex_m/pilot_policy.safetensors` in the repository are tiny models made here, not borrowed ones.

## Checking against a real Qwen

These need the outside packages above and a downloaded Qwen2.5-Coder-0.5B.

**The logit check** runs the same tokens through KSPL and through Hugging Face:

```sh
python3 tools/ai_assist/export_qwen_to_kspl.py --base-model Qwen/Qwen2.5-Coder-0.5B \
    --out out/qwen_kspl.safetensors
make qwen
echo "3 1 4" | ./out/qwen_infer.exe out/qwen_kspl.safetensors
python3 tools/ai_assist/qwen_logit_parity.py --base-model Qwen/Qwen2.5-Coder-0.5B --tokens "3 1 4"
```

The two print the same argmax, and logits that differ only by floating-point rounding (24 layers of matrix products added in a different order).

**Generating text** adds the tokenizer:

```sh
python3 tools/ai_assist/export_qwen_tokenizer.py --base-model Qwen/Qwen2.5-Coder-0.5B \
    --out-dir out/qwen_tokenizer
make qwen
echo "def add(a, b):
    return a" | ./out/qwen_infer.exe generate out/qwen_kspl.safetensors \
    out/qwen_tokenizer/vocab.txt out/qwen_tokenizer/merges.txt 151643
```

It writes Python that stays coherent across several functions. **The prompt is Python on purpose**: the model has never seen KSPL, so a KSPL prompt could not tell a broken pipeline from a model that does not know KSPL.

Decoding is greedy, with no repetition penalty, so a numeric prompt such as `let n = ` can repeat digits without end. That comes from the decoding, not from a fault in the pipeline.

## Further reading

* [`tools/docs/DESIGN.md`](../docs/DESIGN.md) — why the assistant is built this way: what is KSPL and what is borrowed, how a completion is scored, why it runs outside the language server.
* [`tools/docs/PLAN.md`](../docs/PLAN.md) — what is left of the coding assistant.
* [ksai](../../ksai/README.md) — the engine the assistant's tools feed, with the examples that load what it makes.
* [`../README.md`](../README.md) — the other tools, and the one test file per tool they keep in `tools/tests/`.
