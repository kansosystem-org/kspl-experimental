# ksai

**The KSPL-native AI engine**: a small neural-network engine written in KSPL alone, with its own matrix computation, training, tokenizer, and saving and loading of weights.

**This guide assumes no AI knowledge.** It maps each concept to the KSPL type or function that holds it, and gives the order to read the code in, before any formula.

## Run it

```sh
make test    # here in ksai/: the tests that check ksai's parts (matrix product, gradients, training) are correct
make run     # at the repository's root: the demo that trains a tiny language model from scratch and generates characters
```

`make test` needs nothing but a `ksplc` and a C compiler, which builds the examples it runs ("The examples" below; [`ksai/Makefile`](Makefile)). ksai names itself in [`ksai/ksplc.cfg`](ksplc.cfg), so a copy of this folder alone runs the tests the same way. It also runs the programs that must stop on purpose (an empty `argmax`, a shape whose product overflows), each as a child that has to say why ([`ksai/tests/stops_main.kspls`](tests/stops_main.kspls)). `make test BLAS=1` passes `matmul` to OpenBLAS. `make test-fuzz` (from the repository, `make test-ksai-fuzz`) feeds broken weights files and vocabularies to the readers. They are built with the address sanitizer where the C compiler has it (`KSAI_REQUIRE_ASAN=1` makes it required).

`make run` shows the loss falling, which means the model is learning: the numbers shrink as training proceeds.

## The idea

At bottom it does two things.

1. **Inference**: it takes an input (a token sequence) and, through many matrix multiplications, outputs scores (logits) for the token likely to come next.
2. **Training**: it measures the gap between its answer and the correct one (the loss). It corrects each matrix (the weights) little by little to shrink it. Working out how much to correct is the backward pass.

The cast in everyday words:

| AI term | Roughly | In KSPL |
|---|---|---|
| tensor | a multi-dimensional box of numbers (a matrix, generalized) | `Tensor<\|T\|>` |
| weights | the "knowledge" training adjusts (itself a tensor) | the `Tensor` each layer (`Linear` and the rest) holds |
| forward | input → computation → output | each layer's `forward(...)` |
| backward | the output's gap → which way to correct each weight | `grad_*` in `ksai/grad.kspls` / `ksai/nn_grad.kspls` |
| loss | the size of the gap (smaller is better) | `cross_entropy_loss(...)` |
| optimizer | the rule updating the weights from the gap | `sgd_step` / `optim.Adam` |
| token | the smallest unit text is cut into (≒ a piece of a word) | `tokenizer.Tokenizer` |

## What is here

| Where | What it holds |
| :-- | :-- |
| `ksai/*.kspls` | The parts: tensors, layers, training, the tokenizer and the weights format, in the order "Reading order" below gives |
| [`ksai/examples/`](examples/) | Programs built from the parts, as someone using `ksai` would write them ("The examples" below) |
| [`ksai/benches/`](benches/README.md) | The speed bench for one training step, with how to run it and what it shows |
| [`ksai/tests/`](tests/) | The tests `make test` runs |
| [`ksai/docs/`](docs/README.md) | The design and the generated reference |

## Reading order

The groundwork stacks up in this order, which **differs from the `import` order in one place**. `ksai/nn.kspls` refers to `Lora` in `ksai/lora.kspls` (`forward_lora` takes it). But `forward` reads fine without LoRA, so by concept `nn.kspls` comes first.

### ① The groundwork: tensors — `ksai/tensor.kspls`
The container for every computation: a box of numbers plus the operations on it (matrix product, element-wise operations).
- `Tensor<|T|>` holds `data` (the body), `shape` (each dimension's size) and `size` (the total element count).
- Look first at `matmul` (the heart of AI computation), `add_bias`, `softmax` (scores → probabilities), `silu` (activation), `+`/`-`/`*`, and `x[i]` (element access).
- `x[i]` is an element's place (an `Index_place`): read, assign, compound-assign (`x[i] += v`) or take its address (`x[i]@`), with no copy. **The receiver needs no `$`**, so `out[i] = v` works even on a by-value tensor like `matmul_into`'s `out` ("The receiver shape an implementation declared decides whether it is chosen when the receiver is read-only" in [`docs/SPEC-language.md`](../docs/SPEC-language.md)).
- Memory comes from an arena (`Arena`). The tensors of an intermediate computation are built on one arena and released together (deterministic and fast).
- The optional BLAS backend: `matmul` is pure KSPL by default (zero dependencies, portability first). `make BLAS=1` (needs `libopenblas-dev`) passes it to OpenBLAS's gemm through FFI for server-level throughput. **The block declaring the gemm names its library** (`#cfg(blas) #link("openblas")`). So any build given `--define=blas` links OpenBLAS with no build file naming it (`ksplc run --define=blas main.kspls` in a project using ksai).
  * Caution: **Do not copy the speed figures here.** The bench measures them again in [`ksai/benches/README.md`](benches/README.md), and only there.
- SIMD comes from `-O3` auto-vectorizing `matmul_kernel`'s loop, checked by `make test-simd` ("The kernels are spelt for the auto-vectorizer, not with intrinsics" in [`ksai/docs/DESIGN.md`](docs/DESIGN.md)).
- Optional weight quantization: `ksai/quant.kspls` provides `Tensor<|T|>.quantize()` (int8, one scale per row) and `Quantized_tensor.dequantize<|T|>()` (back to F32/F64). Opt-in like BLAS, it cuts memory (weights to a quarter) rather than time. `matmul` and the rest run unchanged on the expanded tensor.

### ② The parts: layers — `ksai/nn.kspls`
The parts built from tensor operations. A model stacks them like blocks.
- `Linear` (`matmul` + a bias), `Rms_norm` (normalization), `Mlp`/`Swiglu_mlp` (the intermediate layer), `Self_attention`/`Gqa_attention` (mixing the context), `Embedding` (a token → a vector), `Transformer_block` (all of the above in one stage).
- Note: **`Self_attention` (one head, trainable) and `Gqa_attention` (per head, inference only) are split on purpose** ("The attention mechanisms are split by the head count" in [`ksai/docs/DESIGN.md`](docs/DESIGN.md)).
- Each returns an output tensor from an input tensor through `forward(...)`. Read `Linear.forward` and `Transformer_block.forward` first to see what one stage does.

### ③ How training works — `ksai/grad.kspls`, `ksai/nn_grad.kspls`, `ksai/optim.kspls`
- `ksai/grad.kspls`: the tensor-level backward-pass steps (`grad_matmul_input/weight`, `grad_silu`, `cross_entropy_loss`, `grad_softmax_cross_entropy`, `sgd_step`). There is no automatic-differentiation tape: each forward's backward is called explicitly (simple and easy to follow).
- `ksai/nn_grad.kspls`: `backward(...)` per layer, which works out the gradient, updates the weight on the spot, and returns the gradient for the layer before.
- `ksai/optim.kspls`: `Adam` (a cleverer update rule than SGD), and `Updater`, which moves a whole model's weights by SGD or by Adam. Each layer's `backward_grads` works out its weights' gradients, and its `apply_grads` passes them to the `Updater`. A batch sums its sequences' gradients with `accumulate` first, so one `apply_grads` moves the weights once.
- The whole-sequence forward/backward used only in training is split into `ksai/attention_train.kspls` / `ksai/block_train.kspls`, so an inference binary carries no training code.
- **`_grad` vs `_train`**: both hold backward-pass code. `_grad` holds only gradient functions (for layers whose backward needs no value from the forward pass). `_train` holds a struct saving the forward pass's intermediate values (`Attention_train` / `Block_train`, like PyTorch's `save_for_backward`).

### ④ Input and output: the tokenizer and persisting weights
- `ksai/tokenizer.kspls`: `Tokenizer`, string ↔ token IDs (the GPT-2/Qwen family's byte-level BPE): `encode` / `decode` / `load` (reading a vocabulary file).
- `ksai/safetensors.kspls`: weights in the industry-standard format: `Safetensors_writer.add` + `finish` (to a byte sequence), `set_meta` (into `__metadata__`, for facts the weights need but are not), `load_from_bytes` + `get_tensor` (zero-copy views onto the original bytes). Only byte sequences: the function taking a path is in `ksai/model_file.kspls`.
  * **Load into a model with `map_into`, not `get_tensor`.** Why, and what `get_tensor` leaves unchecked, is what `ksplc doc ksai/safetensors` says of each.
- `ksai/sampler.kspls`: picks the actual token from the scores — `argmax` (the top one) or `sample` (by temperature, top-k and top-p).
- `ksai/lora.kspls`: `Lora`, lightweight fine-tuning (LoRA) that trains only small added matrices rather than the whole model. **It imports no safetensors.** It saves raw bytes with zero dependencies (`save_raw` / `load_raw`).
- `ksai/lora_set.kspls`: `Qkv_lora` / `Mlp_lora`, the adapters bundled per block, and the naming that lays them into safetensors (`load_set_from` / `save_set_into`, given an already parsed `Safetensors`).
  * **Which to use**: this one (the standard format) to carry a result elsewhere. `Lora.save_raw` (no JSON, no allocation) only to save and re-read in the same environment.
- `ksai/model_file.kspls`: calls the two above by path (`load_safetensors` / `save_qkv_lora_set` and the rest). **It is the only ksai file that imports `std/io`**, split off so code using only tensors skips the file-I/O cost. With no filesystem, pass an `embed`ed byte sequence through `load_from_bytes` → `load_set_from` instead.

## Pitfalls

- **What is `T`?** The element type. Inference uses `F32` (single precision); the numerical gradient checks use `F64` (double). The same code runs on both.
- **`@` and `$`**: `X@` is a pointer type and `ptr$` what it points at. A tensor's `data` is a raw pointer, so `(t.data + i)$` is the i-th element (low-level, speed first).
- **Freeing the arena invalidates the tensors made from it.** The zero-copy views and intermediate results live on it. `free` it while they are in use and they break (the compiler's use-after-free check catches the simple cases).

## The examples

**Programs built from these parts, as someone using `ksai` would write them.** Read `llama_engine` first (training and inference in the shortest form), then `qwen_infer` (reading real weights), then `fim_coder` (training on a real corpus over every CPU).

| Folder | What it does | How to build it |
| :-- | :-- | :-- |
| `examples/llama_engine/` | Trains a tiny language model from scratch and generates: `main.kspls` (load → train → generate) and `model.kspls` (the layer stack) | `make run` at the root: builds and runs |
| `examples/qwen_infer/` | A CLI inferring from real Qwen2.5-Coder weights; the model sits inside `main.kspls` | `make qwen` at the root: builds only |
| `examples/fim_coder/` | A small coding model trained from scratch on a FIM corpus. `train` writes its weights (a batch of sequences a step, spread over every CPU). `complete` fills holes with candidates, greedy first. It takes the corpus and the tokenizer by path | `make fim-model` at the root: trains on this repository |

**They stand inside the package, as Cargo keeps a crate's `examples/`.** `make test` here builds every one and checks that they print what they must ([`tests/examples_main.kspls`](tests/examples_main.kspls)). So an example that stops building fails the package's own tests, and a copy of this folder carries them.

The bundled weights `examples/llama_engine/mini_llama.safetensors` (vocabulary 12, 2 layers) are our own, borrowing only Llama's shape ([`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md)). **`llama_engine` bakes them in with `embed`**, found through the package wherever it stands, so it runs from any folder. It trains a copy and writes nothing back (the entry point that writes is `model.kspls`'s).

**`qwen_infer` needs real weights converted first** (`tools/ai_assist/export_qwen_to_kspl.py`), which is why `make qwen` stops at building.

**Read this before deleting or moving an example**: every gate below depends on them.

| Gate | What it uses them for |
| :-- | :-- |
| `make run` (CI's AI step) | `llama_engine` really trains, and reports for itself that the loss fell |
| `make test-extract` (runs this folder's `make test` from a copy) | `llama_engine` trains from a folder holding nothing else. `qwen_infer` reads small Qwen-shaped weights written by a fixed formula and gives the reference answers ([`tests/examples_qwen.kspls`](tests/examples_qwen.kspls)). `fim_coder` trains a few steps on a corpus written on the spot, writes the same weights on one thread and two, and answers a hole ([`tests/examples_fim.kspls`](tests/examples_fim.kspls)) |
| `make test-simd` | Compiles `llama_engine` and `qwen_infer` to C and checks that the `ksai` functions it names auto-vectorize at `-O3` |
| `make lint` | Every example's `main.kspls` is in `LINT_TARGETS` (`mk/lint.mk`) |
| `make test-ksos-link` / `make test-ksos-qemu` | `ksos`'s Cortex-M demo `embed`s the weights, bringing trained weights into an environment with no file system |

**Being `test-simd`'s foundation is easy to miss.** Generics emit no code until instantiated, so reading `ksai`'s functions as C needs a finished program built from them. Without one, the check loses its target. The examples also feed the fuzzer's seeds (`make test-fuzz`).

## Further reading

* [`ksai/docs/DESIGN.md`](docs/DESIGN.md) — why it took this shape (how the optimizer is picked, how a batch is spread over threads, how LoRA is split, which matrix backend to deploy).
* [`ksai/benches/README.md`](benches/README.md) — the speed bench: how to run it, and the relations it shows.
* [`ksai/SURFACE.txt`](SURFACE.txt) — the record of the published API, written and checked by the same two targets ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).
* [std](../std/README.md) — the way in to the standard library; every file it publishes is listed by `ksplc doc std`. The `mem` / `math` / `bytes` that `ksai` stands on are there.

The packages built on this, and the tools for growing it, stand elsewhere, listed in the root README's [Repository layout](../README.md#-repository-layout). **Do not copy where they are into this README**: a lower tier would then know its users' names ("Reference direction between documents" in [`docs/SPEC-documents.md`](../docs/SPEC-documents.md)). The examples and the bench above are this package's own.
