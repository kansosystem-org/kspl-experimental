# Asking questions about your own files

**You need a clone of this repository that builds with `make`.** A graphics card with 6 GB or more of its own memory makes the answers fast. On Windows, run every command in the MSYS2 UCRT64 terminal, as "The environment for each platform" in [`docs/HOWTO-build.md`](../../docs/HOWTO-build.md) sets it up.

This guide sets up ksagent once, then asks questions about a folder of Word, Excel and text files. Each answer names the file and the lines it comes from. Nothing leaves your computer.

## 1. Install llama.cpp (once)

**llama.cpp runs the model on your graphics card.** Use build b6325 (August 2025) or later; winget installs the latest. Without llama.cpp, `make chat` stops and names the command that builds a slower server. That server runs on the CPU alone, and an answer takes minutes.

1. Open PowerShell, and run this command:

   ```sh
   winget install llama.cpp
   ```

2. Close PowerShell. In the MSYS2 UCRT64 terminal, add winget's folder of programs to `PATH`:

   ```sh
   echo 'export PATH="$PATH:$(cygpath "$LOCALAPPDATA")/Microsoft/WinGet/Links"' >> ~/.bashrc
   source ~/.bashrc
   ```

3. Check that MSYS2 finds it:

   ```sh
   command -v llama-server
   ```

   It prints a path that ends in `llama-server`. If it prints nothing, see "When something goes wrong" below.

## 2. Download the model (once)

**Go to the repository's root, and download the model file into `models/`.** The file is 2.5 GB, and `curl` shows its progress while it downloads.

```sh
curl -L -o models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
```

The other models, and when to choose one, are in [`models/README.md`](../../models/README.md).

## 3. Put your files in a folder

**ksagent reads only the folder you name, and the folders inside it.** Put copies of the files there, not the originals.

```sh
mkdir -p "$HOME/my-files"
cp /c/Users/me/Documents/rules.docx /c/Users/me/Documents/leave.xlsx "$HOME/my-files/"
```

`/c/` is the `C:` drive in MSYS2. ksagent reads `.docx`, `.xlsx` and UTF-8 text files ("Word and Excel files" in [`ksagent/README.md`](../README.md)).

## 4. Run the one command

**Run this command at the repository's root, and leave its terminal open:**

```sh
make chat DIR="$HOME/my-files"
```

The first run builds the programs, which takes a few minutes. Then make prints the command it runs, with each setting written out; an empty one is a setting you did not give. Then each step prints one line:

```
./out/ksagent_chat.exe --dir='/home/me/my-files' --model-file='' --port=''
ksagent_chat: model server: nothing answers at http://127.0.0.1:8081, so this command starts one
ksagent_chat: model server: starting llama-server on models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf (it is on PATH, and uses the graphics card)
ksagent_chat: waiting for llama-server to load the model (seconds to a minute)
ksagent_chat: model server: ready at http://127.0.0.1:8081
ksagent_chat: opening http://127.0.0.1:30000/
  ...
ksagent_chat: ready. Ask on the page; the questions and answers stay in /home/me/my-files. Stop with Ctrl+C
```

**The chat page opens in your browser.** If no page opens, the lines after `opening` name a page file to open yourself.

## 5. Ask a question

1. Type a question on the page, for example `How many days of paid leave does a new employee get?`
2. Press Enter. Shift+Enter starts a new line instead.
3. Watch the answer grow, under the line "Being written: sources not checked yet".
4. Read the checked answer when it replaces the growing one. It shows "Sources checked", and each source with its quote.

**Read each quote.** ksagent checks that the quote stands at those lines, not that the answer follows from it. The terminal shows what the model does meanwhile: each search, each file it reads, and the answer as it is written.

The buttons on the page, and the files a conversation keeps in the folder, are in "The chat page" in [`ksagent/README.md`](../README.md).

## 6. Stop

**Press Ctrl+C in the terminal.** The command stops, and so does the model server it started, which frees the graphics card's memory. The questions and answers stay in the folder; run step 4 again to go on.

## When something goes wrong

**Each message says what to do. The common ones:**

| The message starts with | Do this |
| :-- | :-- |
| `models/… is not there. Download it` | Run the `curl` line it prints, at the repository's root |
| `llama-server is not on PATH, and chat_server is not built` | Do step 1, then run `make chat` again. To use the slower server instead, run `make chat-server NATIVE=1`, then `make chat` |
| `starting chat_server …, since llama-server is not on PATH` | Do step 1, press Ctrl+C, and run `make chat` again |
| `port 8081 answers, but not as a model server` | Stop the program that uses port 8081, or choose another port: `make chat DIR="$HOME/my-files" PORT=8082` |
| `llama-server stopped before it was ready` | Read the last lines it shows. The line `the model does not fit in memory` asks you to close programs that use the graphics card |
| `llama-server stopped before it was ready`, and its last line is `error: invalid argument: on` | Your llama.cpp is older than build b6325. In PowerShell, run `winget upgrade llama.cpp`, then run `make chat` again |
| `llama-server was not ready after 600 seconds` | Read the last lines it shows, then run `make chat` again |
| `the model server at … is not started here, … so MODEL=… would change nothing` | Stop that model server, or leave out `MODEL=` |
| `another ksagent watch answers in … already` | Another `make chat` runs on that folder. Use its page, or stop it with Ctrl+C in its terminal |
| An answer on the page says `the model server … does not answer` | The model server stopped. Press Ctrl+C, run `make chat` again, then press Ask again |

**If `command -v llama-server` prints nothing**, winget kept llama.cpp in a folder of its own. Find that folder:

```sh
ls "$(cygpath "$LOCALAPPDATA")/Microsoft/WinGet/Packages" | grep -i llama
```

Add the folder it prints to `PATH` in `~/.bashrc`, as in step 1, with `Packages/<that folder>` in place of `Links`.

## On Linux and macOS

**`make chat` builds kssrv, which needs OpenSSL.** On Windows, the MSYS2 set-up named at the top installs it. On Linux and macOS, install it as each line below says.

* **Linux**: install llama.cpp from your distribution, or build it, so that `llama-server` is on `PATH`. Install `libssl-dev` (Debian and Ubuntu) for OpenSSL. The other steps are the same.
* **macOS**: run `brew install llama.cpp` in place of step 1. It runs the model on the Mac's own graphics. For OpenSSL, run `brew install openssl@3`, then `export LIBRARY_PATH="$(brew --prefix openssl@3)/lib"` so that the linker finds it.
