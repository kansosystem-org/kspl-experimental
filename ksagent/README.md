# ksagent

ksagent answers questions about the files in one folder. It asks a model server that you run yourself, usually on the same machine, so the files need not leave it. **Each answer names the file and the lines it comes from, and ksagent checks that each quoted passage really stands there.** Use it for a folder of company regulations, or for a development folder.

This page is for whoever runs ksagent, writes questions for it, or chooses a model for it. The reasons behind each decision are in [`ksagent/docs/DESIGN-agent.md`](docs/DESIGN-agent.md).

## Start a model server

ksagent needs a model server that answers `POST /v1/chat/completions` with tool calls, without streaming. llama.cpp's `llama-server` does, and so do vLLM and others. **Which model to use, where to download it, and how to start `llama-server` are in [`models/README.md`](../models/README.md).**

`-c` sets the context, the text the model can read at once. ksagent sends the whole conversation on every round, up to 192 KiB. A smaller context fails sooner on a long search.

## Run it

```sh
make ksagent                                   # -> out/ksagent.exe
./out/ksagent.exe ask rules "How many days of paid leave does a new employee get?"
./out/ksagent.exe watch rules                  # answers the chat files under rules/
./out/ksagent.exe eval rules rules/questions.md --out=eval.ksmd
```

| Option | What it does |
| :-- | :-- |
| `--model-url=<url>` | The model server. The default is `http://127.0.0.1:8081`. Only `http://` works |
| `--model=<name>` | The model name each request carries. The default is `local`; a server that holds one model needs no other |
| `--timeout=<seconds>` | How long one reply from the model may take. The default is 600 |
| `--out=<file>` | `eval` only: also writes the table to this file under the folder, as `.md` or `.ksmd` |

**An API key comes only from the environment variable `KSAGENT_API_KEY`**, sent as `Authorization: Bearer`. It is no option, because the command line shows in the process list to anyone on the machine.

`ask` prints the answer, then each checked source with its quote. While the model works, each tool call it makes appears on standard error. A local model can take minutes, so these lines show it is still working.

```
New employees receive 10 days of paid leave after six months of work.

Sources:
- rules/leave.md lines 3–4
  > A new employee receives 10 days of paid leave after six months of work.
```

**An answer with no checked source says so** in a line of its own ("Unverified"). A source whose quote does not stand at its lines is removed, and a line says how many were removed.

## The chat file

**A chat file lets a person ask from a page, such as ksmd's editor, while `ksagent watch` runs.** Its name ends in `.chat.ksmd`, and it can stand anywhere under the folder. Folders whose names start with a dot, and `out/`, are not looked in.

1. Add a section whose heading line is exactly `## Question` (or `## 質問`), and write the question under it.
2. Save the file.
3. Wait. ksagent looks at the folder every 2 seconds, and the model then takes its time.

ksagent writes an `## Answer` section right after the question, or `## 回答` after `## 質問`:

```
%ksmd 1

## Question

How many days of paid leave does a new employee get?

## Answer

New employees receive 10 days of paid leave after six months of work.

Sources:

`rules/leave.md` lines 3–4

> A new employee receives 10 days of paid leave after six months of work.
```

* **A question with an answer right after it is done.** The earlier questions and answers in the file go with a new question as the conversation so far: the last 4, up to 16 KiB.
* **To ask a question again, delete its answer and save.**
* **When the model server cannot be reached or fails, the answer says so in one line.** Start the server, delete that answer, and save.
* **A heading inside a ```` ``` ```` fence or a `:::` block does not count.**
* **The model's text is written as plain text**, so a heading or a list mark in it shows as written and asks no new question.

A chat file is never a source. Its answers are the model's own words, so the tools neither search it nor read it.

## Step 0: test models on your own documents

**Test candidate models on your own documents before you trust their answers.** A model that does well elsewhere can still miss your terms or invent a rule. `ksagent eval` asks a list of questions whose answers you know, and scores each answer.

**The questions file uses the chat file's headings.** End each question with a line that says where the right answer stands:

```
## Question

How many days of paid leave does a new employee get?

Expect: rules/leave.md 3-4

## 質問

社員食堂は何時に開きますか?

Expect: none
```

* `Expect: <path> <from>-<to>` names the file under the folder and the lines that hold the answer.
* `Expect: none` says the files do not hold the answer. **Include such questions**: they show whether a model invents an answer rather than say it found none.
* Write the questions as the people who will use ksagent would ask them, in their words.

`eval` prints a table, one row per question:

| Column | What it holds |
| :-- | :-- |
| Question | The question, on one line |
| Expected | The place from the `Expect:` line, or `none` |
| Result | `pass`, or `fail:` and why. A checked source passes when it names the expected file with lines that overlap the expected ones. `Expect: none` passes only on the not-found answer |
| Seconds | How long the question took, model time included |

Under the table, one line gives the totals: questions passed, questions failed, answers with no checked source, and the average seconds per question. Run every candidate model on the same questions file, and compare these totals.

## Limits

* **Text files only.** A file must be UTF-8 and hold no NUL byte. PDF and Word files are not read yet: save them as text first.
* **No streaming.** The answer appears once the model has finished.
* **http only.** Run the model server on this machine, or reach it only over a network you trust.
* **The search matches words, not meanings.** A line matches when it holds every word of a search, in any order. The model must still guess the words the files use, so a synonym needs another search.
* **The check shows that a quote stands at its lines, not that the answer follows from it.** Read the quote.
* **It writes only chat files and the table that `--out` names.** It reads everything else and changes nothing.

## What is here

| File | What it holds |
| :-- | :-- |
| [`ksagent/main.kspl`](main.kspl) | The command line |
| [`ksagent/agent.kspl`](agent.kspl) | The loop for one question, the system prompt and the tools' descriptions |
| [`ksagent/files.kspl`](files.kspl) | The tools `list`, `search` and `read`, and the guards on every path |
| [`ksagent/answer.kspl`](answer.kspl) | An answer, the citation check, and the lines ksagent adds in English or Japanese |
| [`ksagent/model.kspl`](model.kspl) | One request to the model server, and its reply |
| [`ksagent/chat.kspl`](chat.kspl) | Reading a chat file, and writing an answer into it |
| [`ksagent/watch.kspl`](watch.kspl) | Following the chat files under the folder |
| [`ksagent/evaluate.kspl`](evaluate.kspl) | `eval`: the questions file, the scoring and the table |
| [`ksagent/tests/`](tests/) | The tests `make test` runs ("The tests" below) |

## The tests

**`make test` runs them from this folder** ([`ksagent/Makefile`](Makefile)). It needs a `ksplc` and a C compiler, and no model. The tests start a stand-in model server in a thread, which gives prepared replies ([`ksagent/tests/stub.kspl`](tests/stub.kspl)). Then they check what ksagent does with each reply.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`ksagent/docs/DESIGN-agent.md`](docs/DESIGN-agent.md) | Why ksagent is shaped this way: files as the channel, search, the citation check and the caps | Whoever changes ksagent |
| [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md) | The rules of the local server a page uses to read and write files | Whoever wants to know why ksagent does not talk to the page |
| [std](../std/README.md) | The `net`, `http`, `json` and `fs` it is built on; `ksplc doc std` lists every file std publishes | Whoever changes ksagent |
