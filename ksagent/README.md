# ksagent

ksagent answers questions about the files in one folder. It asks a model server that you run yourself, usually on the same machine, so the files need not leave it. **Each answer names the file and the lines it comes from, and ksagent checks that each quoted passage really stands there.** Use it for a folder of company regulations, or for a development folder.

This page is the way in. What each command, option and file does is [`ksagent/docs/SPEC-commands.md`](docs/SPEC-commands.md); the reasons behind each decision are [`ksagent/docs/DESIGN-agent.md`](docs/DESIGN-agent.md).

## Run it

**`make chat DIR=<folder>` asks about a folder in one command**: it starts the model server, opens the chat page, and answers its questions until Ctrl+C. The steps, from installing llama.cpp to the first answer, are [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](docs/TUTORIAL-ask-about-your-files.md). Which model to use, and where to download it, are in [`data/README.md`](../data/README.md).

**`ask`, `watch` and `eval` need a model server already running.** `make model-server` starts one alone, and keeps it until Ctrl+C. Run it in a second terminal:

```sh
make model-server                              # the model server, until Ctrl+C
export KSAGENT_API_KEY="$(cat out/tmp/model.8081.key)"  # the key make model-server made
make ksagent                                   # -> out/ksagent.exe
./out/ksagent.exe ask rules "How many days of paid leave does a new employee get?"
./out/ksagent.exe watch rules                  # answers the questions the chat page asks in rules/
./out/ksagent.exe eval rules rules/questions.md --out=eval.ksmd
```

**Test candidate models on your own documents before you trust their answers.** `eval` scores a model on questions whose answers you know. The questions file and the table are "Testing models on your own documents" in [`ksagent/docs/SPEC-commands.md`](docs/SPEC-commands.md#testing-models-on-your-own-documents).

## What is here

| File | What it holds |
| :-- | :-- |
| [`ksagent/main.kspl`](main.kspl) | The command line |
| [`ksagent/agent.kspl`](agent.kspl) | The loop for one question, the system prompt and the tools' descriptions |
| [`ksagent/files.kspl`](files.kspl) | The tools `list`, `search` and `read`, and the guards on every path |
| [`ksagent/office/`](office/) | Word and Excel files as lines of text: the zip, DEFLATE and XML readers, and a file for each format |
| [`ksagent/sorted_names.kspl`](sorted_names.kspl) | Names read from a file, sorted once and found by halving: the Office readers' and the chat file's |
| [`ksagent/answer.kspl`](answer.kspl) | An answer, the citation check, and the lines ksagent adds in English or Japanese |
| [`ksagent/model.kspl`](model.kspl) | One request to the model server, and its reply as it arrives |
| [`ksagent/defaults.kspl`](defaults.kspl) | Where ksagent asks by default, the API key's variable, and the conversation's length a model server must hold |
| [`ksagent/events.kspl`](events.kspl) | The server-sent events a streamed reply comes in |
| [`ksagent/progress.kspl`](progress.kspl) | What the console and the live file show while an answer is written |
| [`ksagent/chat.kspl`](chat.kspl) | Reading an ask file and a chat file, and recording a question with its answer |
| [`ksagent/watch.kspl`](watch.kspl) | Following the ask files under the folder |
| [`ksagent/page/chat.html`](page/chat.html) | The chat page: asking, stopping, and showing the model's Markdown safely |
| [`ksagent/evaluate.kspl`](evaluate.kspl) | `eval`: the questions file, the scoring and the table |
| [`ksagent/tests/`](tests/) | The tests `make test` runs ("The tests" below) |

## The tests

**`make test` runs them from this folder** ([`ksagent/Makefile`](Makefile)). It needs a `ksplc` and a C compiler, and no model or Python. The tests start a stand-in model server in a thread, which gives prepared replies ([`ksagent/tests/stub.kspl`](tests/stub.kspl)), and check what ksagent does with each. The Word and Excel files they read are in [`ksagent/tests/office_data/`](tests/office_data/), made by [`ksagent/tests/make_office_fixtures.py`](tests/make_office_fixtures.py).

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](docs/TUTORIAL-ask-about-your-files.md) | Installing llama.cpp, downloading the model, and asking about a folder with `make chat` | Whoever asks ksagent questions for the first time |
| [`ksagent/docs/SPEC-commands.md`](docs/SPEC-commands.md) | Each command's options and output, Word and Excel files, the chat page and its files, `eval`'s questions file, and the limits | Whoever runs ksagent, writes questions for it, or chooses a model for it |
| [`ksagent/docs/DESIGN-agent.md`](docs/DESIGN-agent.md) | Why ksagent is shaped this way: files as the channel, search, the citation check and the caps | Whoever changes ksagent |
| [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md) | The rules of the local server a page uses to read and write files | Whoever wants to know why ksagent does not talk to the page |
| [std](../std/README.md) | The `net`, `http`, `json` and `fs` it is built on; `ksplc doc std` lists every file std publishes | Whoever changes ksagent |
