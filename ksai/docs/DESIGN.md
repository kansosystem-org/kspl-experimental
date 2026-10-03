# The design decisions of ksai

`ksai` runs inference, and light training, on nothing but the local machine. This document says **why it took this shape**. Each file's purpose is in [ksai](../README.md).

## The caller picks the optimizer

**`backward` / `backward_lora` go as far as applying the update, and are fixed to SGD.** To use Adam ([`optim.kspls`](../optim.kspls)) instead, call `backward_grads` / `backward_lora_grads`. The applying versions are built on them, so the computation sits in one place.

A whole model moves through one `Updater` (SGD, or Adam with a state per weight). Each layer's `apply_grads` passes it that layer's weights with their gradients. **The list of a layer's weights stays in the layer's own `apply_grads`**, beside the `backward_grads` that fills them. So a weight added to a layer is added in one file (the reason "Each layer initializes its own weights" below gives for `init_uniform`).

* **Adam's states are paired with the weights by position.** The n-th weight a step passes keeps the n-th state. This needs no key, and holds while every step passes them in one order. A step passing another number of weights stops the run (`begin_step`), rather than let the states slide onto the wrong weights.
* **Every gradient is worked out before any weight moves.** No weight is read after its own update within one backward pass. So for SGD this is the same arithmetic as updating each layer as it is reached, except for the embedding. There, a token met twice in a sequence takes the sum of its rows' gradients in one step, as Adam needs it.

## A batch is spread over threads, and the weights come out the same for any count

**`fim_coder train --batch=B` moves the weights by the sum of B sequences' gradients, and `--threads` only splits the batch.** Each thread works out whole sequences' gradients on its own arena, and only reads the weights (`grads_seq` in [`examples/llama_engine/model.kspls`](../examples/llama_engine/model.kspls)). The caller's thread picks the sequences, and their gradients are summed in the order picked (`accumulate`). So one thread and every CPU write the same bytes.

* **Not each product split over threads.** At this model's size a matrix product is too small to share. BLAS's own threads make a step slower than one thread does, so `make fim-model` holds OpenBLAS to one thread. A whole sequence is work enough to pay for a thread.
* **The batch belongs to the training, the thread count to the machine.** PyTorch's `DistributedDataParallel` averages a batch per process, so the effective batch, and with it the result, moves with the number of processes. DeepSpeed spells the batch out as micro-batch × accumulation × processes to hold it still. Here the thread count never enters the arithmetic.
* **Summed, not averaged**, so `--lr` stays how far each sequence moves the weights, whatever the batch. Averaged (PyTorch's default), a batch of four at one sequence's step size moves the weights a quarter as far, and keeps pace only at four times that step. That is the linear scaling rule (Goyal et al.), which the user then applies by hand.
* **Not Hogwild!** (threads moving shared weights without a lock). It is fast, but the result depends on how the threads happened to interleave, so no run could be repeated.
* **A step's memory stays taken for the next** (`Arena.reset`). An arena wound back to empty returns its chunks to the OS. Taking them again page by page costs a large share of each step, more so with several threads sharing one address space.

## LoRA keeps the adapter apart from reading and writing the bundle

[`lora.kspls`](../lora.kspls) holds only the adapter `Lora`. The per-block bundle (`Qkv_lora` / `Mlp_lora`) and its safetensors layout are in [`lora_set.kspls`](../lora_set.kspls). **The split follows what the signatures import.** Reading and writing the bundle takes a `Safetensors`. In one file, [`nn.kspls`](../nn.kspls), which uses only `Lora`, would bring the weight format and JSON parsing along. Split, `json` / `safetensors` / `bytes` / `strnum` drop out of the inference path.

**Do not move the code that takes a `Safetensors` into [`model_file.kspls`](../model_file.kspls)**, which imports `std/io`. Bare metal passes an `embed`ed byte sequence straight through `Safetensors.load_from_bytes` to `lora_set`, and requiring `std/io` there would close that path.

The three tiers, the body / the format / the file, grow heavier in the order `lora` → `lora_set` → `model_file`.

**`Lora.save_raw` / `load_raw` are the smallest format, for a place with no heap.** The safetensors path resolves names through `Str_builder` and so needs the global heap. A bare-metal probe that has only `Arena.from_buffer` cannot give it one. So one adapter goes out as raw bytes, and `load_raw` rebuilds it independently of the instance that saved it.

## The attention mechanisms are split by the head count

[`nn.kspls`](../nn.kspls) holds two attention mechanisms, split by **the head count and whether they can be trained**.

| | Heads | RoPE | Backward pass |
| :-- | :-- | :-- | :-- |
| `Self_attention` | one | the whole row, in adjacent pairs | **yes** ([`attention_train.kspls`](../attention_train.kspls)) |
| `Gqa_attention` | split per head (GQA too) | per head's width, variable base (NeoX-style) | none (inference only) |

Caution: **Do not let `Self_attention` take a head count.** Nothing in it splits Q/K/V per head, so the count would be accepted yet have no effect (Principle 5). `n_heads=2` would change only the scale `1/sqrt(dim/n_heads)`, while the heads stay at one, unnoticed.

Nor is the per-head code copied into it: `Gqa_attention` already has it, and a copy would give one purpose two means (Principle 6).

**`dim` has to be even**, since RoPE rotates adjacent elements in pairs. An odd `dim` stops `new` on the spot. Unstopped, it would fail inside the first `forward`, with nothing there saying the dimension was odd.

## Each layer initializes its own weights

`nn.*.new` defaults to the same value in every element (0.1 for `Linear`, 0.01 for `Embedding`). Training then sends the same gradient to every output unit. So **the units stay identical to the end while the loss still falls**, with nothing to notice it by.

Caution: **Do not enumerate the weight tensors one by one from outside.** A layer that gains a weight tells the enumerating code nothing, and the forgotten weight stays at the same value. The spreading is written in each layer's `init_uniform`, called once per layer.

**The normalization's weights are not spread** (they start training at 1.0).

**A test checks that `init_uniform` misses none of them** ([`tests/nn_test.kspls`](../tests/nn_test.kspls)). It checks only the weights listed there, so add a new weight to that list in the same commit (Principle 8).

## The weights' gradients are matched against numerical differentiation too

**A mistake in the backward pass passes the tests and only makes training worse.** A roughly right gradient still makes the loss fall, so a test watching the loss fall lets a wrong gradient through. So [`tests/param_grad_test.kspls`](../tests/param_grad_test.kspls) matches each trained weight against a central difference.

* **The input's gradient (dX) alone is not enough.** dW can be wrong on its own, and a 1% error in RMSNorm's dW passes the dX test and fails this one.
* **The analytic gradient is worked back from how SGD moved the weight** (`sgd_step` is `w -= lr*g`, so `g = (before - after)/lr`).
  * Caution: **Do not add a separate function that returns the gradient alone.** The path training uses would then split from the path the test checks, leaving the one in use unchecked.
* **Do not check with every weight at the same value.** `Linear.new` defaults to 0.1 everywhere, and there even a gradient with rows and columns swapped matches.
* Other frameworks do the same: PyTorch's `gradcheck` and ggml's `test-grad0` both check weights too.

## The matrix backend is chosen where it is deployed

**`matmul` is pure KSPL by default, and OpenBLAS only on request** (`make BLAS=1`, or `--define=blas`). Through OpenBLAS it comes within a few percent of C calling the same library. Pure KSPL is about an order of magnitude slower. The measurement, and the command that repeats it, are in [`ksai/benches/README.md`](../benches/README.md).

* **At the edge, embedded, and in short-lived jobs, pure KSPL.** It has zero dependencies, a much shorter start-up, and a fraction of the memory and of the size to distribute. The code around the kernel (tokenizing, preprocessing, control) is compiled rather than interpreted either way.
* **On servers and in large-scale training, OpenBLAS.** It is the same gemm a C program would call, called from compiled code.

## The kernels are spelt for the auto-vectorizer, not with intrinsics

The default `matmul_kernel` in [`tensor.kspls`](../tensor.kspls) holds no hand-written SIMD intrinsic. Clang's `-O3` auto-vectorizes a cache-efficient i-k-j loop, so it needs no particular instruction set and checks correctly on any target. `make test-simd` checks that it stays vectorized, along with `add_bias` / `rmsnorm` / `softmax` here and `Gqa_attention.forward_lora`'s attn@V gathering in [`nn.kspls`](../nn.kspls).

A loop reaches the vectorizer only through one of two techniques.

1. **Swap the loop nesting alone, keeping the order of the additions into each output element.** It then accumulates each element in parallel rather than by a horizontal sum, and the result is unchanged bit for bit (as in `grad_matmul_weight_into`).
2. **Replace a division inside the loop with one reciprocal computed outside it and a multiplication** (division has lower per-lane throughput).

Caution: **`-ffast-math` is not used**, since accuracy comes first. Without it, auto-vectorization cannot reach a horizontal sum over a single accumulator, or any loop with `exp` / `sin` / `cos` / `sqrt`, unless one technique applies (`-Rpass-analysis=loop-vectorize` says why).

Where the inner product runs along both rows (C = A·Bᵀ: `matmul_transb`, and `grad_matmul_input_into`'s dY·Wᵀ), neither technique fits without a transposed copy. That copy would allocate in an `_into`. So `transb_kernel` in [`tensor.kspls`](../tensor.kspls) **sums four outputs side by side**. One running sum waits on its last addition at every step, but four independent ones overlap. Each still adds in ascending order, so the result is unchanged bit for bit. Under `cfg(blas)` it is `gemm` with B transposed, as `matmul_kernel` is.

## A byte sequence from outside is read on the assumption that it is broken

`ksai` receives two things from outside: the weights file (safetensors) and the tokenizer's vocabulary. It chooses the writer of neither (a checkpoint someone passed on, a vocabulary another tool made).

**The weights file is the more dangerous.** Its header names its own length and each tensor's range, and trusting those reads out of bounds. `get_tensor` in [`safetensors.kspls`](../safetensors.kspls) returns a view onto the raw bytes, so no error comes until an element is read. By then garbled numbers are in use as weights. So the range checks are layered: the dtype's width, `data_offsets`' start and end, `shape`'s element count, and its cap.

Caution: **Keep the layers so that taking one out leaves the others to catch it.** Feeding in broken inputs (fuzzing) confirms it.

**The fuzzing check is [`../tests/fuzz_main.kspls`](../tests/fuzz_main.kspls)** (`make test-fuzz`). `Safetensors_writer` writes its seeds on the spot. Sample files would leave the seeds stale the day the format's spelling changes.

**Build what is fuzzed with the sanitizer (ASan) on.** Built plain, a read past the bounds inside the same allocation or page does nothing and returns 0. So the breakage most worth finding is the least visible. With the sanitizer, the read stops one byte over, at a reported `.kspls` line.

**Make it mandatory on Linux** (`KSAI_REQUIRE_ASAN=1`, which the repository sets on Linux). The devcontainer holds the tool, so its absence means it dropped out of the image, not an environment gap.

**Fuzzing alone is still not enough.** The sanitizer watches the allocation's edges, not the header's named range. So reading a neighbouring tensor inside the same allocation is valid memory access and does not stop. And a random single-byte flip almost never produces a wrong range (a few hundred to one against).

**So the known invariants are built by hand and tested directly** ("refusing a weight whose named range is wrong" in [`tests/tensor_test.kspls`](../tests/tensor_test.kspls)). Fuzzing hunts unknown breakage and does not replace this (Principle 8).

## Further reading

* [ksai](../README.md) — each file's purpose and how to use it.
* [`../../docs/DESIGN.md`](../../docs/DESIGN.md) — Kanso's Development Principles as a whole, and the grounds for the language design.
