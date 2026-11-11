# What is left

**This page holds every plan for the work not done yet**: a section per package with work left, and what spans packages. **Only what is not done stands here.** A done stage is deleted, and its result goes into the document of its kind. A package with nothing left to do has no section ("Document naming" in [`SPEC-documents.md`](SPEC-documents.md)). Each section counts its stages from 1.

## ksai

This section plans ksai running ksagent's model itself, so that no outside program is needed. **What is left is speed.** Which models ksai runs today, and what it holds, is in [ksai](../lib/ksai/README.md), and its decisions are in [`lib/ksai/docs/DESIGN-learning.md`](../lib/ksai/docs/DESIGN-learning.md).

**The reference for every stage is llama.cpp, run on the same GGUF file.** ksai's answers must match its answers. The server is a ksai program of its own, so kssrv stays free of models.

How fast ksai runs today beside llama.cpp is in [`lib/ksai/benches/README.md`](../lib/ksai/benches/README.md).

| | What is left | What it gives the user | What marks it as done |
| :-- | :-- | :-- | :-- |
| stage 1 | **The graphics card.** Everything runs on the CPU. The user's card is an NVIDIA one with 6 GB. Its kernels can be written for CUDA (NVIDIA only) or Vulkan (any vendor, as the user's llama.cpp build uses) | Answers at the speed of a chat | The user's choice between CUDA and Vulkan first, then Qwen3-4B-Instruct-2507 on the card with the same tokens. This is by far the largest stage |
