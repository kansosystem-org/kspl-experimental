# The design of ksagent

This document gives the reasons behind ksagent's shape: how a question is answered, and what keeps an answer honest. It is for whoever changes ksagent. How to run it is in [`ksagent/README.md`](../README.md).

Words used here: the *root* is the one folder whose files ksagent reads. A *source* is a place an answer cites: a file under the root, a first and a last line, and a quote. A *chat file* is a file under the root whose name ends in `.chat.ksmd`. A *pending* question is one in a chat file with no answer right after it.

## One question, one loop

**The model finds the files itself, through four tools, and ends by calling `answer`.** ksagent sends the question with a system prompt and the tools' descriptions (`agent.run`). The model asks for tool calls; ksagent runs each one and sends back what it gave. The tools are these:

| Tool | What it gives back |
| :-- | :-- |
| `list(path)` | The entries of one folder under the root |
| `search(text, path)` | The lines that hold every word of the text, as `path:line: text`, at most 50 |
| `read(path, from_line, to_line)` | Numbered lines of one text file, at most 400 lines or 32 KiB |
| `answer(text, sources)` | The final answer, and the sources it comes from |

**The system prompt is the main control over a small model**, so it states each rule once, in a short numbered sentence. It tells the model to answer only from the tools' results, in the question's language. When the files do not hold the answer, the model calls `answer` with the text `NOT_FOUND` and no sources. **That text is a marker, not a sentence**: a small model copies one word reliably. ksagent then writes the not-found sentence itself, in the question's language.

**Plain text with no `answer` call is asked once to become one.** A small model often ends that way, with the answer and even its sources written as text, which no check can read. So ksagent sends the text back and asks the model to call `answer` (`REMIND_ANSWER`). One request is enough to turn most of these into a checked answer, and a second would only cost time. **If the model answers in plain text again, that text counts as an answer with no sources.** It is marked unverified, since it can still help the person.

**English and Japanese are the two languages of the lines ksagent adds.** A question holding kana or kanji is Japanese. In a chat file, the heading decides: `## 質問` gets `## 回答` and Japanese lines.

## The caps

**Every loop ends.** A cap that is reached ends the question with a line that names the cap.

| Cap | Value | Why |
| :-- | :-- | :-- |
| Requests to the model per question | 12 | A small model that has not found the answer in a dozen calls rarely finds it later. Each round can take a minute |
| Bytes of one request | 192 KiB | The whole conversation goes out on every round. This bounds what the model must read |
| Lines or bytes of one read | 400 lines or 32 KiB | One read fills no context alone. The last line says where to read on |
| Hits of one search | 50 | A longer list buries the right line. The last line says that the list was cut |
| Names of one listing | 500 | The same reason |
| Earlier turns sent from a chat file | 4, and 16 KiB | A follow-up question refers to what was asked just before |
| A file's size for a tool | 8 MiB | It bounds the memory one tool call takes |

## Search instead of a vector index

**Each tool reads the files as they stand when the question is asked.** Nothing is copied ahead of time. The other common design builds an index of the text ahead of time, through a second model that turns passages into vectors. ksagent does not, for three reasons:

* **The answer is always current.** An index is as old as its last rebuild, and a changed regulation would be answered from the old text.
* **No copy of confidential text exists.** An index is a second store of the documents, which needs its own access rules and its own deletion.
* **Nothing else runs.** There is no second model and no index to rebuild.

**The price is that the model must guess the words the files use.** A synonym still needs another search. A large folder also makes each search slower, since it walks every file.

**A search matches words, not the whole phrase** (`files.tool_search`):

* **A line matches when it holds every word, in any order**, ASCII case ignored. A model writes its own phrase, such as "check quoted source". A document almost never holds that phrase word for word, so a literal search found nothing.
* **A word is found inside a longer one**, so `quote` finds `quoted`. The other way round does not work, so the model is told to give each word in its shortest form.
* **With no line holding every word, the lines holding the most words come first**, under a line that says so. A model then sees where the closest text stands, rather than nothing.
* **Japanese has no spaces, so a Japanese text is one word**, matched as it is written. Words are split at the ideographic space too, the one a Japanese keyboard types.
* **The system prompt says what to do when a search finds nothing.** The model searches for one key word alone, then reads the README and the documents `list` shows. A small model otherwise gives up after a few phrases, with the answer one file away.

## The citation check

**A small model invents, and an invented rule reads like a real one.** So each source is checked by machine against the file (`answer.check_source`):

* **The quote must stand within the lines the source names.** Both are compared with each run of spaces, tabs and line breaks made one space. So a line break inside the quote does not matter.
* **A source that fails is removed**, and one line says how many were removed. In `ask`, each removed source is named with the reason, so whoever tries a model sees what it got wrong.
* **The range may span at most 50 lines.** A wider range points at no evidence: any quote stands somewhere in a long range. Without this cap, `eval` would pass an answer that cites a whole file.
* **A quote must hold at least 8 characters.** One word, or one Japanese character, stands in almost any range, so a shorter quote shows nothing. Characters are counted, not bytes, so a Japanese quote needs as many as an English one.
* **An answer with no checked source is marked unverified** in one line, the not-found answer aside.

Caution: **The check shows that the words stand at those lines, not that they back the answer.** A model can quote a real line and still draw the wrong conclusion from it. So the answer shows the quote beside it, for the person to read. The check is not presented as more than this.

**A chat file is never a source.** Its answers are the model's own words, so citing one would check a claim against itself. The tools leave chat files out of every listing and search, and refuse to read one.

## The guards on paths

**Every path the model gives passes one check before anything opens it** (`files.resolve`). A refusal goes back to the model as the tool's result, so the loop goes on.

* **The path must stay under the root.** `fs.stays_under` refuses an absolute path, a `..` step, a Windows device name and a link anywhere on the path. These are the same checks static serving uses in kssrv.
* **A name that starts with a dot is hidden.** A root that is a checkout holds `.git/` and `.env`. Each segment's long name is checked too (`fs.long_name`), because Windows opens `.git` by its short name `GIT~1`.
* **Only text is read.** A file with a NUL byte, or one that is not valid UTF-8, is skipped by a search and refused by a read.
* **The tools only read.** ksagent writes only chat files and the table that `--out` names.

## Files are the only channel

**A page in the browser and ksagent share nothing but files.** The person saves a question into a chat file, and ksagent writes the answer into the same file. The page sees the change as it sees any change to an open file.

**The local server's rules stay as they are** ([`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). kssrv holds no model, and has no endpoint that starts a program. An endpoint that reached a model would let any page with the token ask for work beyond files. Every guard of that protocol would then have to hold for that work too. With files as the channel, the protocol does not change at all.

**Any editor can ask**, since a chat file is a text file. ksagent does not need to know which program wrote the question.

**The price is a wait.** ksagent looks at the folder every 2 seconds, and the page shows the answer once it reads the file again. A look reads a file again only when its size or change time moved. The change time counts whole seconds, so a second save in the same second at the same size goes unseen until the next save.

## The chat file

**ksagent reads a deliberate subset of ksmd's syntax**: level 1 and 2 headings, and the two fences that hide a heading. ksmd's own reader is internal to ksmd, not an API it publishes. So ksagent reads only what it needs, and nothing more:

* A section starts at a heading of level 1 or 2 and ends at the next one.
* A heading inside a ```` ``` ```` fence or a `:::` block does not count.
* `## Question` and `## 質問` start a question. `## Answer` and `## 回答` start an answer.
* A question is pending when the next section is not an answer. A question with no text yet is passed over, since the person saved before writing it.

**What ksagent writes is ksmd that a page can open.** The model's text is escaped: every mark ksmd would read takes a backslash (`write_text`). So a `## Question` line inside an answer is plain text, and asks no new question. **A source's path stands in backticks, not as a link.** A ksmd link goes only to a web address. A link to a file would make the page refuse the whole file.

## Writing the answer back

**ksagent reads the file again just before it writes**, and puts the answer into what the file holds then (`watch.answer_one`). The person can have written elsewhere in the file while the model worked, and that text stays.

* **The answer goes in only if the same question is still pending**, with the same text. If the person changed the question or removed it, the answer is dropped, and the console says so.
* **The file is replaced as a whole** (`fs.replace_file`), so a power cut leaves the old file or the new one, never part of either.

Caution: **A race remains between that second read and the replace.** A save the person makes in that moment is overwritten, and lost. The moment is short: no model call stands between the read and the write. A lock would not close it, since the page takes none.

## The model server

**ksagent speaks one protocol: `POST /v1/chat/completions` with `"tools"`, and `"stream": false`.** Many local servers speak it, `llama-server` and vLLM among them. So a person can change servers without changing ksagent.

* **One connection per request, closed after it.** A turn waits seconds or minutes for the model, so a connection kept alive between turns saves nothing worth its state.
* **The model's turn is rebuilt before it is sent back**: its text and its calls only. A field one server adds, such as its reasoning, is not sent to it again on every round.
* **Only plain http, and only a reply that names its length.** `std/http` reads a body only by its `Content-Length`. A chunked reply fails with a message that names this, and says that `llama-server` and vLLM send a length when `"stream"` is false.
* **An API key comes only from the environment variable `KSAGENT_API_KEY`.** The command line shows in the process list, so an option would expose the key.
* **A server that cannot be reached, or fails, ends the question with one line** saying what went wrong and what to do. In a chat file that line is the answer, so the person waiting on the page sees it.

## Scoring with `eval`

**A source passes when it names the expected file with lines that overlap the expected range.** Overlap, not equality: a model may cite one line more or less than the person who wrote the question. The 50-line cap keeps a wide range from passing by accident.

**`Expect: none` passes only on the not-found answer.** These questions measure whether a model invents an answer. A model that always answers something passes none of them.

**The table goes to standard output as Markdown.** `--out` also writes it under the root: as Markdown, or as a ksmd table when the name ends in `.ksmd`. A ksmd table holds quoted text and bare numbers, so the two forms differ.

## What it does not do yet

| Absent | Why |
| :-- | :-- |
| PDF and Word files | Reading them needs a converter that ksagent does not hold |
| Streaming the answer | The citation check needs the whole answer first, and `std/http` reads no chunked body |
| https to the model server | `std` holds no TLS client. The model server runs on this machine, or on a network the person trusts |
