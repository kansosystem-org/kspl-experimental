# models

**This folder holds the model files you download to run on this machine.** Git ignores everything here but this page, so a file of several GB is never committed. Caution: `git clean -x` deletes the files too.

This page is the one place that says which models to use, where to get them, and how to start them. ksagent ([`ksagent/README.md`](../ksagent/README.md)) asks the model server for its answers. ksai ([`ksai/README.md`](../ksai/README.md)) is building its own server for the same files.

## The models

Both are GGUF files, the format llama.cpp reads. Q4_K_M and Q3_K_M name how many bits each number keeps: about 4 and about 3.

| Order | Model | File | Size | When |
| :-- | :-- | :-- | :-- | :-- |
| 1 | Qwen3-4B-Instruct-2507 | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | 2.5 GB | First. It fits a graphics card with 6 GB and leaves room for the conversation |
| 2 | Qwen3.5-9B | `Qwen3.5-9B-Q3_K_M.gguf` | 4.7 GB | Once the first one works well. It answers better, and is slower |

**The file and the conversation must both fit in the graphics card's own memory.** Leave about 2 GB beyond the file's size. Memory the system lends the card is several times slower.

## Download them

From the repository's root:

```sh
curl -L -o models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
curl -L -o models/Qwen3.5-9B-Q3_K_M.gguf \
  https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q3_K_M.gguf
```

Qwen publishes these models' original weights. These GGUF files are Unsloth's conversions, which Qwen does not publish itself. Both models are under the Apache 2.0 licence, which allows use at work.

## Start a model server

Install llama.cpp once. On Windows, run `winget install llama.cpp` in PowerShell, then open a new terminal. In an MSYS2 terminal, add winget's folder for llama.cpp to `PATH` in `~/.bashrc`. Then, from the repository's root:

```sh
make model-server                                   # the first model
make model-server MODEL=Qwen3.5-9B-Q3_K_M.gguf      # another file in models/
```

It starts `llama-server` on the file with the options ksagent needs; the root `Makefile` holds them:

* **`--jinja`**, or the server offers no tool calls, and ksagent works through tool calls.
* **`-c 32768`**, the conversation's length in tokens. A larger one holds a longer search, and takes more memory.
* **`--port 8081`**, the port ksagent asks by default.

**Leave its terminal open.** It is ready when it says it is listening on `127.0.0.1:8081`, the address ksagent asks by default.

Open `http://127.0.0.1:8081` in a browser to try the model by hand.

## Choosing another model

Any GGUF model that llama.cpp runs with tool calls can stand in. Test it first with `ksagent eval` on questions about your own documents ("Step 0" in [`ksagent/README.md`](../ksagent/README.md)). Keep the model that passes more questions at a speed you accept.
