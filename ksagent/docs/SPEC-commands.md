# ksagent's commands, page and files

**This document is the agreement between ksagent and whoever runs it, writes questions for it, or chooses a model for it.** It sets each command's options, what each prints, the files it reads and writes, and its limits. How to start it is in [`ksagent/README.md`](../README.md). The steps from installing llama.cpp to the first answer are [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](TUTORIAL-ask-about-your-files.md).

## The rows, and what they start from

**Many rules carry rows: a command, and what ksagent does with it.** ksagent's own tests run each row's command through `out/ksagent.exe`, so a row is a promise.

**A row is a row of a table whose header is one of these:**

| Header | What it promises |
| :-- | :-- |
| `\| Command \| Exit code \| Standard error holds \|` | ksagent ends with that code before it asks a model. It prints nothing to standard output, and standard error holds each text |
| `\| The stand-in model \| Command \| Exit code \| Standard output holds \| Standard error holds \|` | A stand-in model server gives the answer that the first cell names. ksagent ends with that code, and each output holds each text in its cell |

* **Each text stands in backticks.** A cell can hold several, with a comma between two of them, or none.
* **The tests add `--model-url` after the command word of an answer row.** It names the stand-in, which gives the same answer to each request.

**The stand-in model gives one of these answers:**

| Name | What the stand-in model gives |
| :-- | :-- |
| `cites lines 3–4` | It thinks, then answers "New employees receive 10 days of paid leave after six months of work." It cites lines 3–4 of `rules/leave.md`, with the quote that stands there |
| `cites a wrong quote` | The same, but its quote does not stand at those lines |
| `cites nothing` | The same answer, with no source |
| `finds nothing` | It lists the folder, then says that the files do not hold the answer |

**The rows run in a folder that holds the folder `team`.** `team` holds `rules/leave.md`, whose lines 3–4 read "A new employee receives 10 days of paid leave" and "after six months of work." It also holds `questions.md`, the questions file that "Testing models on your own documents" shows.

## The model server

**ksagent asks a model server that answers `POST /v1/chat/completions` with tool calls**, such as llama.cpp's `llama-server`, vLLM or ksai's `chat_server`. **It asks for the reply as a stream, and shows it as it is written.** A server that does not stream works too: ksagent then asks it for whole replies. Which model to use, and where to download it, are in [`data/README.md`](../../data/README.md).

**`ask`, `watch` and `eval` need a model server already running.** `make model-server` starts one alone, where they ask by default, and keeps it until Ctrl+C.

**An API key comes only from the environment variable `KSAGENT_API_KEY`**, sent as `Authorization: Bearer`. No option takes it, since the command line shows in the process list.

**Over `https://`, ksagent checks the server's certificate before it sends anything.** A trusted CA must vouch for the certificate, and the certificate must name the host or address in the URL. The questions, the file excerpts and the key then cross the network encrypted. No option turns the check off. Over `http://` they cross in the clear, so use http only for a server on this machine or on a network you trust.

**A certificate that does not verify ends the question with one line that says why and what to do:**

| What is wrong | What the line says to do |
| :-- | :-- |
| No trusted CA vouches for it, as for a self-signed certificate | Give the CA's PEM file with `--model-ca` |
| It names another host or address | Give `--model-url` the name the certificate holds |
| It does not verify for another reason, such as having expired | Renew it on the server |
| The file `--model-ca` names cannot be read, or holds no certificate | Give the PEM file of the CA that made the certificate |
| The server does not speak TLS | Give an `http://` address, if it serves plain http |

**The llama-server that `make model-server` or `make chat` starts asks for a key.** Without one, any web page could ask it. The key is new at each start, and stands in `out/tmp/model.<port>.key` until the server stops. `make model-server` prints where; `make chat` gives it to ksagent itself. **The next `make chat` or `make model-server` deletes a key file left behind** where its server is gone. It then tries `KSAGENT_API_KEY`.

## `ask`, `watch` and `eval`

**`out/ksagent.exe` takes a command, the folder, and that command's arguments**, as "Run it" in [`ksagent/README.md`](../README.md#run-it) shows. Each option below works with each of the three commands, unless the table says otherwise.

| Option | What it does |
| :-- | :-- |
| `--model-url=<url>` | The model server, as `http://<host>[:<port>]` or `https://<host>[:<port>]`, with an optional path after it. The default is `http://127.0.0.1:8081`. Without a port, http takes 80 and https takes 443. Leave out `/v1`: ksagent adds `/v1/chat/completions` itself |
| `--model-ca=<file>` | With an `https://` model URL only: the PEM file of the CA that made the server's certificate, such as a server's own self-signed certificate. ksagent then trusts only the CAs in this file. Without it, the system's trusted CAs are used |
| `--model=<name>` | The model name each request carries. The default is `local`; a server that holds one model needs no other |
| `--timeout=<seconds>` | How long one reply from the model may take, from the request to its last piece: 1 to 86,400 seconds. The default is 600 |
| `--out=<file>` | `eval` only: also writes the table to this file under the folder, as `.md` or `.ksmd` |

**The exit code says how a command ended:**

| Code | When |
| :-- | :-- |
| 0 | The command ran to its end. An answer with no checked source ends with 0 too, since it says so itself |
| 1 | It was refused, or an answer stopped or failed before it was finished |
| 2 | Its command line cannot be read: a missing or extra argument, or an option `ask` does not take |

**A command that cannot run is refused before ksagent asks a model:**

| Command | Exit code | Standard error holds |
| :-- | :-- | :-- |
| `ksagent ask team` | 2 | `usage: ksagent ask [options...] <folder> "<question>"` |
| `ksagent watch team team` | 2 | `usage: ksagent watch [options...] <folder>` |
| `ksagent eval team` | 2 | `usage: ksagent eval [options...] <folder> <questions file>` |
| `ksagent ask nowhere "How many days?"` | 1 | `not a folder: nowhere` |
| `ksagent ask --timeout=0 team "How many days?"` | 1 | `--timeout must be from 1 to 86400 seconds` |
| `ksagent ask --model-ca=ca.pem team "How many days?"` | 1 | `--model-ca is for an https:// model URL` |
| `ksagent ask --model-url=ftp://127.0.0.1:8081 team "How many days?"` | 1 | `must start with http:// or https://` |
| `ksagent ask --model-url=http://127.0.0.1:8081/v1 team "How many days?"` | 1 | `must leave out /v1` |
| `ksagent ask --out=table.md team "How many days?"` | 2 | `'--out' does not take effect on the subcommand 'ask'` |
| `ksagent eval --out=table.txt team team/questions.md` | 1 | `--out must name a .md or a .ksmd file` |
| `ksagent eval --out=/table.md team team/questions.md` | 1 | `--out: the path must stay inside the folder` |

### What `ask` prints

`ask` prints the answer, then each checked source with its quote:

```
New employees receive 10 days of paid leave after six months of work.

Sources:
- rules/leave.md lines 3–4
  > A new employee receives 10 days of paid leave after six months of work.
```

**An Excel source names the sheet and rows Excel shows**, not the lines of its text view: `- 規程/leave.xlsx sheet 規程一覧, rows 7–9`. The chat page shows it the same way.

**An answer with no checked source says so** in a line of its own ("Unverified"). A source whose quote does not stand at its lines is removed, and a line says how many were removed.

| The stand-in model | Command | Exit code | Standard output holds | Standard error holds |
| :-- | :-- | :-- | :-- | :-- |
| `cites lines 3–4` | `ksagent ask team "How many days of paid leave does a new employee get?"` | 0 | `New employees receive 10 days of paid leave after six months of work.`, `Sources:`, `- rules/leave.md lines 3–4`, `> A new employee receives 10 days of paid leave after six months of work.` | |
| `cites a wrong quote` | `ksagent ask team "How many days of paid leave does a new employee get?"` | 0 | `Removed 1 cited source`, `Unverified` | |
| `cites nothing` | `ksagent ask team "How many days of paid leave does a new employee get?"` | 0 | `Unverified` | |

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

| The stand-in model | Command | Exit code | Standard output holds | Standard error holds |
| :-- | :-- | :-- | :-- | :-- |
| `cites lines 3–4` | `ksagent ask team "How many days of paid leave does a new employee get?"` | 0 | | `thinking: `, `writing (sources not checked yet):`, `answer {"text": "New employees receive 10 days` |

## Word and Excel files

**ksagent reads a Word or an Excel file as it is kept, as lines of text.** Nothing is converted by hand, and nothing is stored beside the file. The lines are what `search` finds, what `read` shows, and what a source's line numbers count.

| File | One line holds | For example |
| :-- | :-- | :-- |
| Word (`.docx`, `.docm`) | A paragraph, or a table row with its cells joined by ` \| ` | `第3条 特別休暇は、5日とする。` |
| Excel (`.xlsx`, `.xlsm`) | A row, opening with its sheet and row number | `規程一覧!7: 割増賃金率 \| 25%` |

* **A line holds what the person who opens the file sees**: list numbers written out, tracked changes applied, a formula's result, a date as `2024-04-01`. Hidden text, comments, headers, footers, hidden sheets and furigana are left out.
* **Word does not number these lines**, so find a Word source's place by its quote. In an Excel file, each line names its own sheet and row, and a source names them too.
* **A search matches an Excel line by its cells.** The sheet's name at the head of each line is left out, so a word of it does not match every row.
* **Some files are refused, with a line that says what to do**: old `.doc` and `.xls` files, files protected by a password, and damaged files.

## The chat page

**The chat page lets a person ask from a browser, and shows each answer as it is written.** `make chat DIR=<folder>` opens it and answers it, as [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](TUTORIAL-ask-about-your-files.md) shows. The command is `out/ksagent_chat.exe`, and `make chat` writes each of its options out. **An option given empty is an option not given**, and `out/ksagent_chat.exe --help` names each default.

| Option | What it does | Empty, or not given |
| :-- | :-- | :-- |
| `--dir=<folder>` | The folder to ask about; `make chat DIR=<folder>` gives it | Stops, and says how to name one |
| `--model-file=<file>` | The model file in `data/` to start; `make chat MODEL=<file>` gives it | The first model in [`data/README.md`](../../data/README.md) |
| `--port=<n>` | The model server's port on this machine, used where one answers, otherwise started; `make chat PORT=<n>` gives it | 8081, where ksagent asks by default |
| `--model-wait=<seconds>` | How long a model server can take to load its model: 1 or more | 600 |
| `--model-only` | Starts the model server alone, until Ctrl+C; `make model-server` gives it | |
| `--show`, `--list`, `--stop=<folder>`, `--stop-all` | As for ksmd's opener: the whole URL with no browser, and the chat servers left running | |

**The launcher starts `llama-server` where it is on PATH, otherwise `chat_server`.** Where neither is there, it stops and names the command that builds `chat_server`, `make chat-server NATIVE=1`.

### On the page

* **Stop** stops the answer within about 2 seconds. The page then marks it stopped; any text written so far stays, marked as not whole and not checked.
* **Ask again** asks a stopped or failed question once more, as a new question.
* **New conversation** starts another conversation. The list on the left holds every conversation at the top of the folder.
* **The last 4 questions and answers**, up to 16 KiB, go with a new question as the conversation so far.
* **When the model server cannot be reached or fails, the answer says so in one line.** Run `make chat` again, then press Ask again.
* **When ksagent stops while it writes an answer**, as at Ctrl+C, the answer says within about 15 seconds to check that `ksagent watch` runs. Run `make chat` again: the question is asked again.

### A conversation's files

**A conversation is three files in the folder**, which you can keep in git: `team.ask.jsonl`, `team.chat.jsonl` and `team.live.json`.

* **One JSON record stands on each line.** A text editor can ask too, by adding a line such as `{"type": "question", "id": "q1", "text": "How many days?"}` to an ask file.
* **An ask file larger than 1 MiB gets no further answer**, and the console and the page say so. Start a new conversation.
* **A line that cannot be read is named on the console and on the page**, with its number and the reason. In a chat file, ksagent answers no further question until the line is repaired, and answers again within 2 seconds once it is.

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
* **The questions file and the `--out` file can stand in the folder.** The tools leave both out while `eval` runs, and a source in either fails the check.

`eval` prints a table, one row per question:

| Column | What it holds |
| :-- | :-- |
| # | The question's number in the file, from 1 |
| Question | The question, on one line |
| Expected | The place from the `Expect:` line, or `none` |
| Result | `pass`, or `fail:` and why. A checked source passes when its lines overlap the expected ones in the expected file. `Expect: none` passes only on the not-found answer |
| Seconds | How long the question took, model time included |

A last line gives the totals: questions passed and failed, answers with no checked source, and the average seconds per question. Run every candidate model on the same questions file, and compare these totals.

| The stand-in model | Command | Exit code | Standard output holds | Standard error holds |
| :-- | :-- | :-- | :-- | :-- |
| `cites lines 3–4` | `ksagent eval team team/questions.md` | 0 | `rules/leave.md 3-4 \| pass`, `none \| fail:`, `Passed: 1. Failed: 1. Answers with no checked source: 0. Average:` | |
| `finds nothing` | `ksagent eval team team/questions.md` | 0 | `rules/leave.md 3-4 \| fail:`, `none \| pass` | |
| `cites lines 3–4` | `ksagent eval --out=table.md team team/questions.md` | 0 | `Passed: 1. Failed: 1.` | `wrote team/table.md` |

## Limits

* **Text, Word and Excel files only.** A text file must be UTF-8 and hold no NUL byte. A PDF file is not read yet: save it as text, Word or Excel first.
* **Each search reads every Word and Excel file under its path again**, so large workbooks make each search slower.
* **A search skips every folder named `out`.** So does `watch`, for ask files. `list` and `read` reach these folders.
* **A search and `watch` pass over a folder that cannot be read**, and walk the rest. Its files are not searched, and its ask files get no answer. Where the folder itself cannot be read, a search is refused, and `watch` tries again at its next look. A search of one named file that cannot be read is refused too, with the reason `read` would give.
* **The certificate is the only thing checked over https.** ksagent does not check whether a CA withdrew it (revocation), and does not show a client certificate.
* **The search matches words, not meanings.** A line matches when it holds every word of a search, in any order, so a synonym needs another search.
* **The check shows that a quote stands at its lines, not that the answer follows from it.** Read the quote.
* **It writes no file but its own**: the chat files, the live files, the lock `watch` holds (`.ksagent.lock`) and the table that `--out` names.
