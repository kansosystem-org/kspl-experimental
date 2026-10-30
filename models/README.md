# models

**This folder holds the model files you download to run on this machine.** Git ignores everything here but this page, so a file of several GB is never committed. Caution: `git clean -x` deletes the files too.

This page is the one place that says which models to use, and where to get them. How to ask ksagent about your files with one of them is [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](../ksagent/docs/TUTORIAL-ask-about-your-files.md).

## The models

Both are GGUF files, the format llama.cpp reads. Q4_K_M and Q3_K_M keep about 4 and about 3 bits per number.

| Order | Model | File | Size | When |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Qwen3-4B-Instruct-2507 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2.5 GB | First. It fits a graphics card with 6 GB and leaves room for the conversation |
| 2 | Qwen3.5-9B | `Qwen3.5-9B-Q3_K_M.gguf` | 4.7 GB | Once the first one works well. It answers better, and is slower |

**The file and the conversation must both fit in the graphics card's own memory.** Memory the system lends the card is several times slower. `make chat` keeps a conversation of up to 32,768 tokens, stored at 8 bits a number:

| Model | File | Conversation | Together |
| :-- | :-- | :-- | :-- |
| Qwen3-4B-Instruct-2507 | 2.5 GB | 2.6 GB | 5.1 GB |
| Qwen3.5-9B | 4.7 GB | 0.8 GB | 5.5 GB |

* **The second model needs less for the conversation**, since only every fourth of its layers keeps one entry per token. The other layers keep a fixed state.
* **llama-server also needs memory to compute, and the screen uses some of the card.** A card sold as 6 GB holds 6 GiB, which is 6.4 GB. So the first model leaves about 1.4 GB for these, and the second about 1.0 GB.
* **When llama-server runs out of memory, `make chat` says so** and shows its last lines. Close the programs that use the graphics card, or use the first model.

The memory arithmetic stands at `LLAMA_OPTIONS` in [`tools/model_server.kspl`](../tools/model_server.kspl).

## Download them

From the repository's root:

```sh
curl -L -o models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
curl -L -o models/Qwen3.5-9B-Q3_K_M.gguf https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q3_K_M.gguf
```

**`make chat` prints the same command when the file it needs is missing**, and these lines are checked against what it prints (`make test-ksagent-chat`).

These GGUF files are Unsloth's conversions of the weights Qwen publishes. Both models are under the Apache 2.0 licence, which allows use at work.

## Using a model

**`make chat DIR=<folder>` starts the first model, and `MODEL=<file>` picks another file in `models/`.** The command starts llama.cpp's `llama-server` on the file, and stops it when you stop the command. The steps are [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](../ksagent/docs/TUTORIAL-ask-about-your-files.md).

## Choosing another model

Any GGUF model that llama.cpp runs with tool calls can stand in. Test it first with `ksagent eval` on questions about your own documents ("Step 0" in [`ksagent/README.md`](../ksagent/README.md)). Keep the model that passes more questions at a speed you accept.
