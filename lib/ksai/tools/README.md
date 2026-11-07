# ksai's tools

These Python tools convert a borrowed model into the files ksai reads, and write the reference files its tests read. They also check ksai against Hugging Face and llama.cpp. Each one checks itself when run with no argument; `make test-pytools` runs those self-tests.

## What is here

| File | What it does |
| :-- | :-- |
| `export_qwen_to_kspl.py` / `export_qwen_tokenizer.py` | Convert Hugging Face Qwen's weights and tokenizer into the files `ksai` reads. |
| `gen_unicode_class.py` | Writes `lib/ksai/unicode_class.kspl`, the Unicode classes the tokenizer's rule reads, from llama.cpp's `unicode-data.cpp`. `--check` compares instead of writing. |
| `check_qwen_tokenizer.py` / `tokenize_lists.kspl` | Compare ksai's tokenizer with llama.cpp's on a GGUF model, text by text (below). `tokenize_lists.kspl` loads the GGUF file's lists through `Tokenizer.load_lists` and prints each text's IDs. |
| `qwen_logit_parity.py` | Prints Hugging Face's logits (the scores for each next token) for the same input, to compare with KSPL's. |
| `qwen_gguf_check.py` | Runs ksai's Qwen model (`lib/ksai/benches/bench_qwen.kspl`) and llama.cpp on the same GGUF file and compares them ("Checking against llama.cpp" below). |
| `make_qwen_fixtures.py` / `make_qwen35_fixtures.py` | Write the tiny Qwen3 and Qwen3.5 models and the chat-template cases that ksai's tests read (`lib/ksai/tests/qwen_data/`), with llama.cpp's packages as the reference. |
| `safetensors_io.py` | Writes safetensors, for `export_qwen_to_kspl.py` and for `examples/code_complete/lora_finetune_external.py`. |
| `make_quant_fixtures.py` | Writes the reference files that ksai's GGUF formats are tested against (`lib/ksai/tests/quant_data/`), from llama.cpp's `gguf` package and C library. |
| `gguf_quant_check.py` | Takes a few real tensors of each format out of GGUF files, for checking ksai's decoding by hand (`lib/ksai/benches/README.md`). |

## The outside packages needed

**They are not needed to build.** They serve only the Python tools here and `examples/code_complete/lora_finetune_external.py`; the repository builds and passes `make ci` without them.

```sh
python3 -m venv .venv && . .venv/bin/activate
pip install numpy torch transformers peft safetensors gguf llama-cpp-python jinja2
```

### How borrowed models are handled

**You bring the borrowed model's weights yourself: they are not in this repository.** `export_qwen_to_kspl.py` converts the weights you obtain (`--base-model Qwen/Qwen2.5-Coder-0.5B`). Only the conversion procedure is distributed here, so the [MIT](../../../LICENSE.md) notice does not cover the model.

**The converted safetensors inherit the original model's license.** To distribute them, meet its conditions (the Qwen2.5 family is Apache-2.0, which requires attribution).

The `lib/ksai/examples/llama_engine/mini_llama.safetensors` and `lib/ksos/demo/cortex_m/pilot_policy.safetensors` in the repository are tiny models made here, not borrowed ones.

## Checking against a real Qwen

These two checks show that KSPL runs a real Qwen2.5-Coder-0.5B as the reference Python library does. They need the outside packages above.

**The logit check** runs the same tokens through KSPL and through Hugging Face:

```sh
python3 lib/ksai/tools/export_qwen_to_kspl.py --base-model Qwen/Qwen2.5-Coder-0.5B \
    --out data/qwen_kspl.safetensors
make qwen
echo "3 1 4" | ./out/qwen_infer.exe data/qwen_kspl.safetensors
python3 lib/ksai/tools/qwen_logit_parity.py --base-model Qwen/Qwen2.5-Coder-0.5B --tokens "3 1 4"
```

The two print the same argmax (the token with the top score). Their logits differ only by floating-point rounding, since the matrix products are added in a different order.

**Generating text** adds the tokenizer:

```sh
python3 lib/ksai/tools/export_qwen_tokenizer.py --base-model Qwen/Qwen2.5-Coder-0.5B \
    --out-dir out/ksai/qwen_tokenizer
make qwen
echo "def add(a, b):
    return a" | ./out/qwen_infer.exe generate data/qwen_kspl.safetensors \
    out/ksai/qwen_tokenizer/vocab.txt out/ksai/qwen_tokenizer/merges.txt 151643
```

It writes Python that stays coherent across several functions. **The prompt is Python on purpose.** The model has never seen KSPL, so a KSPL prompt could not show whether the pipeline is broken. Decoding is greedy with no repetition penalty, so a numeric prompt such as `let n = ` can repeat digits without end.

## Checking against llama.cpp

This check shows that ksai runs the user's model, Qwen3-4B-Instruct-2507, as llama.cpp runs the same GGUF file. It needs `gguf`, `llama-cpp-python` and `numpy`, and the file that [`data/README.md`](../../../data/README.md) names:

```sh
out/ksplc_stage1.exe build "--cflags=-O3 -march=native" lib/ksai/benches/bench_qwen.kspl out/benches/bench_qwen.exe
python3 lib/ksai/tools/qwen_gguf_check.py --model data/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
python3 lib/ksai/tools/qwen_gguf_check.py --model data/Qwen3.5-9B-Q3_K_M.gguf
```

The prompts' token IDs come from llama.cpp, so the tokenizers do not mix in. Each check prints `agree` or `DIFFER`:

* **The first 32 greedy tokens** equal llama.cpp's, for prompts in English, Japanese and code, and a conversation with tools. A parting within the scores' tolerance prints `tie`.
* **The scores after a fixed prompt** agree within a tolerance, since both sides round each product's inputs to 8 bits. Beside it stands llama.cpp against itself, reading a prompt in one batch and token by token.
* **The chat template**: llama.cpp renders each conversation of `template_cases.json`, or `template35_cases.json` for Qwen3.5, in `lib/ksai/tests/qwen_data/`. ksai's tests check that `chat_server` renders the same texts.

Last it prints how fast each side reads a prompt of 350 tokens and generates 64, on the same machine.

## Checking the tokenizer against llama.cpp

This check shows that ksai's tokenizer gives the same token IDs as llama.cpp for a real model. It needs the `gguf` and `llama_cpp` Python packages, a built `ksplc` and a downloaded GGUF model.

```sh
python3 lib/ksai/tools/check_qwen_tokenizer.py --model Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

It reads which rule splits the text from the file's `tokenizer.ggml.pre`: `qwen2` for Qwen3-4B-Instruct-2507, `qwen35` for Qwen3.5-9B. Run it on each model the server runs.

The texts are samples written into the script, 5,000 seeded random strings, and every text file the repository tracks. **It passes when the last line says `0 differ`.** `--random`, `--seed` and `--file-limit` change the random strings and the largest file read.

**Check the Unicode table too when llama.cpp changes.** With llama.cpp's source in the version the model runs with, run:

```sh
python3 lib/ksai/tools/gen_unicode_class.py <llama.cpp>/src/unicode-data.cpp --check
```

It fails when `lib/ksai/unicode_class.kspl` differs from what that source gives. Run it again without `--check` to write the new table.

## Further reading

* [ksai](../README.md) — the engine these tools convert models for and check.
