# ksagent's commands, page and files

**This document is the agreement between ksagent and whoever runs it, writes questions for it, or chooses a model for it.** It sets each command's options, what each prints, the files it reads and writes, and its limits. How to start it is in [`ksagent/README.md`](../README.md). The steps from installing llama.cpp to the first answer are [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](TUTORIAL-ask-about-your-files.md).

## The model server

**ksagent asks a model server that answers `POST /v1/chat/completions` with tool calls**, such as llama.cpp's `llama-server`, vLLM or ksai's `chat_server`. **It asks for the reply as a stream, and shows it as it is written.** A server that does not stream works too: ksagent then asks it for whole replies. Which model to use, and where to download it, are in [`data/README.md`](../../data/README.md).

**`ask`, `watch` and `eval` need a model server already running.** `make model-server` starts one alone, where they ask by default, and keeps it until Ctrl+C.

**An API key comes only from the environment variable `KSAGENT_API_KEY`**, sent as `Authorization: Bearer`. No option takes it, since the command line shows in the process list.

**The llama-server that `make model-server` or `make chat` starts asks for a key.** Without one, any web page could ask it. The key is new at each start, and stands in `out/tmp/model.<port>.key` until the server stops. `make model-server` prints where; `make chat` gives it to ksagent itself.

## `ask`, `watch` and `eval`

**`out/ksagent.exe` takes a command, the folder, and that command's arguments**, as "Run it" in [`ksagent/README.md`](../README.md#run-it) shows. Each option below works with each of the three commands, unless the table says otherwise.

| Option | What it does |
| :-- | :-- |
| `--model-url=<url>` | The model server. The default is `http://127.0.0.1:8081`. Only `http://` works. Leave out `/v1`: ksagent adds `/v1/chat/completions` itself |
| `--model=<name>` | The model name each request carries. The default is `local`; a server that holds one model needs no other |
| `--timeout=<seconds>` | How long one reply from the model may take, from the request to its last piece. The default is 600 |
| `--out=<file>` | `eval` only: also writes the table to this file under the folder, as `.md` or `.ksmd` |

### What `ask` prints

`ask` prints the answer, then each checked source with its quote:

```
New employees receive 10 days of paid leave after six months of work.

Sources:
- rules/leave.md lines 3–4
  > A new employee receives 10 days of paid leave after six months of work.
```

**An answer with no checked source says so** in a line of its own ("Unverified"). A source whose quote does not stand at its lines is removed, and a line says how many were removed.

### What standard error shows

**While the model works, standard error shows what it does**: its thinking, each tool call, and the answer as it is written. A local model can take minutes, so you see that it works, and can stop it with Ctrl+C. **The answer that grows there is not checked yet**, and a line before it says so:

```
  search {"text": "paid leave new employee carry over"}
  read {"path": "rules/leave.md", "from_line": 3, "to_line": 10}
  writing (sources not checked yet):
A new employee gets 10 days of paid leave, and unused days carry over for one year.
  answer {"text": "A new employee gets 10 days of paid leave, and unused days carry over for one year.", …}
```

A model that thinks first (Qwen3.5) shows its thinking after `thinking:`. Neither the answer nor a chat file holds the thinking.

## Word and Excel files

**ksagent reads a Word or an Excel file as it is kept, as lines of text.** Nothing is converted by hand, and nothing is stored beside the file. The lines are what `search` finds, what `read` shows, and what a source's line numbers count.

| File | One line holds | For example |
| :-- | :-- | :-- |
| Word (`.docx`, `.docm`) | A paragraph, or a table row with its cells joined by ` \| ` | `第3条 特別休暇は、5日とする。` |
| Excel (`.xlsx`, `.xlsm`) | A row, opening with its sheet and row number | `規程一覧!7: 割増賃金率 \| 25%` |

* **A line holds what the person who opens the file sees**: list numbers written out, tracked changes applied, a formula's result, a date as `2024-04-01`. Hidden text, comments, headers, footers, hidden sheets and furigana are left out.
* **Word does not number these lines**, so find a Word source's place by its quote. In an Excel file, each line names its own sheet and row.
* **Some files are refused, with a line that says what to do**: old `.doc` and `.xls` files, files protected by a password, and damaged files.

## The chat page

**The chat page lets a person ask from a browser, and shows each answer as it is written.** `make chat DIR=<folder>` opens it and answers it, as [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](TUTORIAL-ask-about-your-files.md) shows. The command is `out/ksagent_chat.exe`, and `make chat` writes each of its options out. **An option given empty is an option not given**, and `out/ksagent_chat.exe --help` names each default.

| Option | What it does | Empty, or not given |
| :-- | :-- | :-- |
| `--dir=<folder>` | The folder to ask about; `make chat DIR=<folder>` gives it | Stops, and says how to name one |
| `--model-file=<file>` | The model file in `data/` to start; `make chat MODEL=<file>` gives it | The first model in [`data/README.md`](../../data/README.md) |
| `--port=<n>` | The model server's port on this machine, used where one answers, otherwise started; `make chat PORT=<n>` gives it | 8081, where ksagent asks by default |
| `--model-wait=<seconds>` | How long a model server can take to load its model | 600 |
| `--model-only` | Starts the model server alone, until Ctrl+C; `make model-server` gives it | |
| `--show`, `--list`, `--stop=<folder>`, `--stop-all` | As for ksmd's opener: the whole URL with no browser, and the chat servers left running | |

**The launcher starts `llama-server` where it is on PATH, otherwise `chat_server`.** Where neither is there, it stops and names the command that builds `chat_server`, `make chat-server NATIVE=1`.

### On the page

* **Stop** stops the answer within about 2 seconds. The page then marks it stopped; any text written so far stays, marked as not whole and not checked.
* **Ask again** asks a stopped or failed question once more, as a new question.
* **New conversation** starts another conversation. The list on the left holds every conversation at the top of the folder.
* **The last 4 questions and answers**, up to 16 KiB, go with a new question as the conversation so far.
* **When the model server cannot be reached or fails, the answer says so in one line.** Run `make chat` again, then press Ask again.

### A conversation's files

**A conversation is three files in the folder**, which you can keep in git: `team.ask.jsonl`, `team.chat.jsonl` and `team.live.json`.

* **One JSON record stands on each line.** A text editor can ask too, by adding a line such as `{"type": "question", "id": "q1", "text": "How many days?"}` to an ask file.
* **An ask file larger than 1 MiB gets no further answer**, and the console and the page say so. Start a new conversation.
* **A line that cannot be read is named on the console and on the page**, with its number and the reason. In a chat file, ksagent answers no further question until the line is repaired, and answers again within 2 seconds once it is.
* **ksagent starts nothing where an old `.chat.ksmd` or `.live.ksmd` file stands**, and names the file. Delete it, or ask its questions again on the page.

## Testing models on your own documents

**`ksagent eval` asks a list of questions whose answers you know, and scores each answer.** A model that does well elsewhere can still miss your terms or invent a rule. So test each candidate model on your own documents before you trust its answers.

**The questions file is a Markdown or ksmd file of `## Question` sections.** End each question with a line that says where the right answer stands:

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
| Result | `pass`, or `fail:` and why. A checked source passes when its lines overlap the expected ones in the expected file. `Expect: none` passes only on the not-found answer |
| Seconds | How long the question took, model time included |

A last line gives the totals: questions passed and failed, answers with no checked source, and the average seconds per question. Run every candidate model on the same questions file, and compare these totals.

## Limits

* **Text, Word and Excel files only.** A text file must be UTF-8 and hold no NUL byte. A PDF file is not read yet: save it as text, Word or Excel first.
* **Each search reads every Word and Excel file under its path again**, so large workbooks make each search slower.
* **A search skips every folder named `out`.** So does `watch`, for ask files. `list` and `read` reach these folders.
* **A search and `watch` pass over a folder that cannot be read**, and walk the rest. Its files are not searched, and its ask files get no answer. Where the folder itself cannot be read, a search is refused, and `watch` tries again at its next look. A search of one named file that cannot be read is refused too, with the reason `read` would give.
* **http only.** Run the model server on this machine, or reach it over a network you trust.
* **The search matches words, not meanings.** A line matches when it holds every word of a search, in any order, so a synonym needs another search.
* **The check shows that a quote stands at its lines, not that the answer follows from it.** Read the quote.
* **It writes no file but its own**: the chat files, the live files, the lock `watch` holds (`.ksagent.lock`) and the table that `--out` names.
