# The design of ksagent

This document gives the reasons behind ksagent's shape: how a question is answered, and what keeps an answer honest. It is for whoever changes ksagent. How to run it is in [`ksagent/README.md`](../README.md).

Words used here: the *root* is the one folder whose files ksagent reads. A *source* is a place an answer cites: a file under the root, a first and a last line, and a quote. A *conversation* is three files that share a name under the root. Its *ask file* (`team.ask.jsonl`) holds the questions the chat page asks. Its *chat file* (`team.chat.jsonl`) records each question ksagent took and the answer it got. Its *live file* (`team.live.json`) shows the answer being written. A *pending* question is one in an ask file with no stop and no answer yet. A *text view* is the lines of text a Word or Excel file is read as.

## One question, one loop

**The model finds the files itself, through four tools, and ends by calling `answer`.** ksagent sends the question with a system prompt and the tools' descriptions (`agent.run`). The model asks for tool calls; ksagent runs each one and sends back what it gave.

| Tool | What it gives back |
| :-- | :-- |
| `list(path)` | The entries of one folder under the root |
| `search(text, path)` | The lines that hold every word of the text, as `path:line: text`, at most 50 |
| `read(path, from_line, to_line)` | Numbered lines of one text file, at most 400 lines or 32 KiB |
| `answer(text, sources)` | The final answer, and the sources it comes from |

**The system prompt is the main control over a small model**, so it states each rule once, in a short numbered sentence. It tells the model to answer only from the tools' results, in the question's language. When the files do not hold the answer, the model calls `answer` with the text `NOT_FOUND` and no sources. **That text is a marker, not a sentence**: a small model copies one word reliably. ksagent then writes the not-found sentence itself, in the question's language.

**Plain text with no `answer` call is asked once to become one** (`REMIND_ANSWER`). A small model often ends that way, with even its sources written as text, which no check can read. One reminder turns most of these into a checked answer, and a second would only cost time. **If the model answers in plain text again, that text counts as an answer with no sources.** It is marked unverified, since it can still help the person.

**English and Japanese are the two languages of the lines ksagent adds.** A question holding kana or kanji is Japanese, and the chat file records the language with the question.

## The caps

**Every loop ends.** A cap that is reached ends the question with a line that names the cap.

| Cap | Value | Why |
| :-- | :-- | :-- |
| Requests to the model per question | 12 | A small model that has not found the answer in a dozen calls rarely finds it later. Each round can take a minute |
| Bytes of one request | 64 KiB | The whole conversation goes out on every round. This bounds what the model must read. It fits the context of 32k tokens the launcher starts llama-server with: Japanese takes about 3 bytes a token, and the rest holds the reply. A context twice as long would not fit a graphics card of 6 GB |
| Lines or bytes of one read | 400 lines or 32 KiB | One read fills no context alone. The last line says where to read on |
| Hits of one search | 50 | A longer list buries the right line. The last line says that the list was cut |
| Names of one listing | 500 | The same reason |
| An ask file's size | 1 MiB | It is read again for each question, and every 2 seconds while an answer is written. Ids are found by halving, so a read takes time in step with the file |
| Earlier turns sent from a chat file | 4, and 16 KiB | A follow-up question refers to what was asked just before. A stopped or failed turn holds no answer, so it is not sent |
| A text file's size, or a text view's | 8 MiB | It bounds the memory one tool call takes. Each tool call, each file a search reads, and each question works in memory of its own, so these do not add up |
| A Word or Excel file's size | 32 MiB | Pictures make most of such a file, and only its text parts are unpacked |
| One part unpacked, and all of one file's parts | 64 MiB, and 128 MiB | XML spends most of its bytes on markup |
| Parts in one zip, and XML nesting | 10,000 parts, 256 levels | A Word or Excel file holds tens of parts, and nests far less deep |
| Work of reading one Word or Excel file | 32 units for each byte of its view's cap; a unit is about a byte of memory | A few bytes of XML can ask for millions of empty cells. Text alone reaches the view's cap first |
| A list's number pattern (`lvlText`) | 256 bytes | Word's own are a few characters, and each numbered paragraph repeats its pattern |

## Search instead of a vector index

**Each tool reads the files as they stand when the question is asked.** The common alternative builds an index ahead of time, through a second model that turns passages into vectors. ksagent does not, for three reasons:

* **The answer is always current.** An index is as old as its last rebuild, and a changed regulation would be answered from the old text.
* **No copy of confidential text exists.** An index is a second store of the documents, which needs its own access rules and its own deletion.
* **Nothing else runs.** There is no second model and no index to rebuild.

**The price is that the model must guess the words the files use**, so a synonym needs another search. A large folder also makes each search slower, since it walks every file.

**A search skips hidden folders, and every folder named `out`** (`files.skip_dir`). A checkout keeps build output in `out`, often in each package, and its generated text would bury the real lines. A regulations folder seldom names a folder so. A search given a path inside one still reads it.

**A search matches words, not the whole phrase** (`files.tool_search`):

* **A line matches when it holds every word, in any order**, ASCII case ignored. A model writes its own phrase, which a document almost never holds word for word.
* **A word is found inside a longer one**, so `quote` finds `quoted`. The other way round does not work, so the model is told to give each word in its shortest form.
* **With no line holding every word, the lines holding the most words come first**, under a line that says so. The model then sees where the closest text stands.
* **Japanese has no spaces, so a Japanese text is one word**, matched as it is written. Words are split at the ideographic space too, the one a Japanese keyboard types.
* **When a search finds nothing, the system prompt says what to do next.** The model searches for one key word alone, then reads the README and the documents `list` shows. A small model otherwise gives up with the answer one file away.

## The citation check

**A small model invents, and an invented rule reads like a real one.** So each source is checked by machine against the file (`answer.check_source`):

* **The quote must stand within the lines the source names.** Both are compared with each run of spaces, tabs and line breaks made one space.
* **A source that fails is removed**, and one line says how many were removed. In `ask`, each removed source is named with the reason, so whoever tries a model sees what it got wrong.
* **The range may span at most 50 lines.** Any quote stands somewhere in a long range, so a wider one points at no evidence. Without this cap, `eval` would pass an answer that cites a whole file.
* **A quote must hold at least 8 characters.** One word, or one Japanese character, stands in almost any range. Characters are counted, not bytes, so a Japanese quote needs as many as an English one.
* **An answer with no checked source is marked unverified** in one line, the not-found answer aside.

Caution: **The check shows that the words stand at those lines, not that they back the answer.** A model can quote a real line and still draw the wrong conclusion. So the answer shows the quote beside it, for the person to read, and the check is not presented as more.

**A conversation's files are never a source.** The answers in them are the model's own words, so citing one would check a claim against itself. The questions are no evidence either. The tools leave all three files out of every listing and search, and refuse to read one. A name counts whatever its ASCII case, since Windows and macOS open `team.CHAT.jsonl` as `team.chat.jsonl`. The long name counts too, since Windows answers to a short name. The earlier turns the model needs reach it as the conversation so far ("The caps" above), not through a tool.

## The guards on paths

**Every path the model gives passes one check before anything opens it** (`files.resolve`). A refusal goes back to the model as the tool's result, so the loop goes on.

* **The path must stay under the root.** `fs.stays_under` refuses an absolute path, a `..` step, a Windows device name and a link anywhere on the path. kssrv's static serving uses the same checks.
* **A name that starts with a dot is hidden.** A root that is a checkout holds `.git/` and `.env`. Each segment's long name is checked too (`fs.long_name`), because Windows opens `.git` by its short name `GIT~1`. An empty segment (`a//b`) is skipped, since Windows reads no long name for `a/`. A long name that cannot be read counts as hidden wherever something stands there.
* **Only text is read.** A file with a NUL byte, or one that is not valid UTF-8, is skipped by a search and refused by a read. A Word or Excel file is read as its text view ("Word and Excel files" below).
* **The tools only read.** ksagent writes only chat files, live files, the lock `watch` holds (`.ksagent.lock`) and the table that `--out` names.

## Word and Excel files

**A Word or Excel file becomes one text view, made in one place** (`files.read_text`). Search, read and the citation check then work on its lines unchanged, and a line number means one line everywhere.

* **The view is made each time a tool reads the file.** Nothing is stored beside the file, and no cache keeps views, so the view is as current as the file. A stored view would be a second copy of confidential text, as an index would ("Search instead of a vector index" above).
* **No conversion by hand.** A person keeps the file as Word or Excel saves it.
* **The old `.doc` and `.xls` formats are refused**, with a line saying to save the file as `.docx` or `.xlsx`. They are a different container, the compound file, which would double the code for formats Office has long stopped saving by default.
* **A file protected by a password is refused** with the same kind of line. Office keeps it encrypted inside a compound file, and ksagent holds no password.
* **`.docm` and `.xlsm` are read like `.docx` and `.xlsx`.** They differ only by their macros, and ksagent reads only the XML parts. No macro ever runs.

### A view shows what the person reading the file sees

**A citation is checked against the view, so the view must hold the text a person reads in Word or Excel.** Text the person does not see would let a model cite it. Text the person sees but the view lacks could not be cited.

| In Word | In the view | Why |
| :-- | :-- | :-- |
| A paragraph | One line | A paragraph is the unit a regulation's sentence stands in |
| A heading | One `#` per level, before its text | The model sees where a chapter begins. A heading is known by its outline level, or by its style's name, `heading N`, which a Japanese Word does not translate |
| A list number (`第3条`, `（２）`, `①`) | Written out before the text | A regulation numbers its articles this way, and a person asks for `第3条`. Two parts of one list continue each other's counters, as Word shows them |
| A table row | One line, its cells joined by ` \| ` | A cell is read beside its neighbours. A cell merged down from the row above repeats its text, so each row reads whole |
| A text box | Its paragraphs after the paragraph it stands in | Word's second copy for older readers (`mc:Fallback`) is left out, or the text would stand twice |
| A tracked change | The text as changed: insertions kept, deletions left out | The person reads the changed text. A quote of deleted text then fails the check |
| A footnote or endnote | `[^1]` where it is referred to, and `[^1]: …` at the end | The note stays one line, and its mark ties it to its place |
| Hidden text, comments, field codes | Left out | The reader of the document does not see them. A field's result, such as a date, is kept |
| Headers and footers | Left out | They repeat on every page, and hold page numbers and the company's name |

| In Excel | In the view | Why |
| :-- | :-- | :-- |
| A row | One line, `規程一覧!12: 有給休暇 \| 20日` | The sheet and the row tell the person where to look. A source's line numbers count the view's lines, which Excel does not show |
| A column | The same place on every line of the sheet | An empty cell keeps its place, from the sheet's first used column. So a model can match a value to the heading row |
| A number | Its stored value, to 15 significant digits | Excel keeps 15. The digits are worked on as text, so `0.25` shown as `25%` is never `25.000000000000004` |
| A date or a time | `yyyy-mm-dd`, `hh:mm`, or both | A date is stored as a count of days. One spelling, whatever the cell's format, is what a search can find |
| A percentage | A hundred times the value, and `%` | `25%` is what the person sees, not `0.25` |
| A formula | The value Excel last computed | The person sees the value. A file no program has computed (one a library wrote) holds no value, so its formula is shown, as `=SUM(D2:D5)` |
| A merged cell | Its text in every row of the merge | A category merged down a column then stands on each of its rows. A merge within one row shows its text once |
| A hidden sheet | Left out | The person who opens the file does not see it, and it often holds old or working data |
| A hidden row or column | Kept | A filter hides rows the same way, and a view cannot tell the two apart |
| Furigana (`rPh`) | Left out | It is no part of the cell's text: `社内規程` would become `社内規程シャナイキテイ` |
| An empty row | No line | It holds nothing to find. The next line names its own row, so no place is lost |

### Files from anyone

**A Word or Excel file can come from anyone.** So every malformed one is refused with a reason, and none can make ksagent take unbounded memory or time.

* **A zip bomb is refused before anything unpacks.** Each part's declared size is checked against the caps first ("The caps" above). The DEFLATE decoder then writes at most that size, so a part that lies about its size fails.
* **A name inside the zip is only ever a key**, compared with the parts asked for, and never a path on the disk. A relationship that points above the zip's root is refused.
* **The XML reader reads no DTD and expands no entity** but XML's five predefined ones and numeric references. A part that declares a DTD is refused, so no entity can grow a part, or reach a file outside it.
* **Every damaged part is refused, never read wrong.** A part's checksum is checked after it unpacks. Elements must close in the order they open, and a part must be UTF-8 with no control character.
* **Each item is charged to one work budget before it is made** (`package.Work`). The items are paragraphs, table rows and cells, sheets, a sheet's rows and cells, lists, and the bytes of labels. A file that asks for more is refused. So the memory and time of one file stay bounded by its caps, not by what its markup asks for.
* **Nothing is made twice or for nothing.** A workbook that lists one sheet twice is refused. Cells skipped before a table row stop at the widest grid read, 4,096 columns. A numbered paragraph with no text counts in its list, and gets no label.
* **The tests damage the fixtures at random**: the whole file, and each XML part. Each copy must be read within the cap, or refused with a reason. Files of a few KiB that ask for much work must be read or refused within 2 MiB of memory.

**The zip and DEFLATE readers stand in `ksagent/office/`, since no other package reads either.** They move to `std/` when a second package needs them. Moved earlier, they would be a published API with one user, kept compatible for nobody.

## Files are the only channel

**A page in the browser and ksagent share nothing but files.** The chat page appends a question to the ask file, and ksagent records the question and its answer in the chat file. The page sees each change by asking the local server whether a file changed. While the answer grows, the live file shows it ("Watching an answer grow").

**The local server's rules stay as they are** ([`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). kssrv holds no model, and no endpoint of it starts a program. An endpoint that reached a model would let any page with the token ask for work beyond files. Every guard of that protocol would then have to hold for that work too.

**The price is a wait.** ksagent looks at the folder every 2 seconds, and the page looks at its files every second. A look reads an ask file again only when its size or change time moved, or its chat file's did. An ask file and a chat file only grow, so each new record changes the size. The stamps are taken before the files are read, so a question added meanwhile is seen at the next look.

## The chat files

**A conversation is stored as JSON Lines: one JSON record a line, holding the model's text as the Markdown it wrote.** Programs exchange a conversation this way, and only the screen reads the Markdown. So nothing is escaped on the way in or out:

* **The model's answer is kept as it wrote it.** A list stays a list and `**10 days**` stays bold on the page, where an escaped copy would show the marks.
* **The question reaches the model as the person typed it**, and so do the earlier turns. A `*` the person typed is a `*`, not an escape.
* **One record a line keeps a git diff readable**, and a line can be read alone. A file of one JSON value would change wholesale with one typed character.

**The chat files are not ksmd documents**, and ksmd's reader does not read them. A Markdown document needs every mark in the model's text escaped. Otherwise the text becomes structure: a `## Question` line in an answer would ask a new question. A string inside JSON has no marks to escape.

### One writer per file

**Each file has one writer, so no save can be lost between a read and a write.** Two writers of one file race: the second write can replace the first, which is then lost.

| File | Writer | What it holds |
| :-- | :-- | :-- |
| `team.ask.jsonl` | The page | `{"type":"question","id":…,"text":…}` for each question, and `{"type":"stop","id":…}` to stop one |
| `team.chat.jsonl` | ksagent | `{"type":"question",…,"lang":…}` for each question it took, then `{"type":"answer","id":…,"state":…}` with the text, the checked sources, the sources removed and the lines it adds |
| `team.live.json` | ksagent | One record, replaced as a whole: the question's id, what the model is doing, and the unchecked text so far. Where ksagent answers none of the conversation's questions, the id is empty, the phase `refused`, and `why` says why |

* **The page gives each question its id**, and the answer names the same id. Ids match a question to its answer whatever their order. An id holds 1 to 64 ASCII letters, digits, `-` and `_`, since it names a question in three files and on the console.
* **The chat file repeats the question's text**, so it is a whole record alone. What was asked stands beside what was answered, even after the ask file changes.
* **ksagent replaces the chat file as a whole** (`fs.replace_file`), so a power cut leaves the old file or the new one. An append in place can leave half a line, and the next append lands on it.
* **ksagent reads the chat file again just before it writes**, so a line a person changed by hand meanwhile is checked, never buried.
* **One `watch` runs per folder.** It holds a lock (`.ksagent.lock` in the root), and a second `watch` refuses to start. Two would answer one question and both write its chat file.
* **A `watch` on a folder inside or around a watched one refuses too**, naming the folder watched. It looks for a held lock above and below its root as it starts.
* **A turn the chat file already records is not written again.** Written twice, its id would stand twice, and the chat file would be refused.

### Asking, stopping and a refused save

**A question is pending while the ask file holds it, with no stop record and no answer in the chat file.** `watch` answers the pending questions of one ask file in the order they were asked.

**The page stops an answer by appending a stop record.** While an answer grows, `watch` reads the ask file every 2 seconds (`Progress.go_on`). A stop record, or a question gone from the ask file, stops it. The model's time then goes to the next question.

**A stopped answer is recorded as `stopped`**, with ksagent's line saying why. The text shown before the stop goes into its own member, `partial`, never into `text`, so no reader can take it for an answer. A question stopped before ksagent took it gets no record: no work was done for it.

**The page writes the ask file through the local server's conditional write.** It reads the file, adds its line, and names the digest of what it read. Where another tab wrote meanwhile, the server refuses with 409. The page then reads the file again and adds its line again, up to five times, and else says so.

### A line that cannot be read

**A broken line is refused with its number and the reason, never passed over in silence.**

* **In an ask file, a broken line is refused alone.** Its question gets no answer, and the console names the line. The page writes only lines it can read, so a broken line comes from a hand edit.
* **A chat file with a broken line gets no further answer** until the line is repaired. A turn written after it would hide it, and reading up to it would drop the turns after it without a word.
* **The page shows each broken line it meets**, with its file and number. It reads an ask file with ksagent's rules, so a question ksagent passes over is named, never shown as waiting. The browser check compares its reasons with what ksagent prints.

### Chat files of the old form

**ksagent starts no command where a `.chat.ksmd` or `.live.ksmd` file stands under the root.** The tools do not hide such a file, so its answers would count as sources. The refusal names the file and says to delete it, or to ask its questions again on the chat page. No conversion is offered: a converter would stay as code that serves no file once the old ones are deleted.

## The chat page

**The chat page is the one place a person asks** ([`ksagent/page/chat.html`](../page/chat.html)). It lists the conversations at the top of the root, starts a new one, asks, stops, and shows each answer as it grows. One HTML file holds its style and its scripts, since the local server serves one file for the page and nothing else without the token.

**A text editor can still ask**, by appending a question record to an ask file. Nothing in ksagent depends on which program wrote it.

### Showing the model's Markdown

**The page reads the model's Markdown leniently: it never refuses, and shows a half-written answer too.** Headings, lists, emphasis, code, quotes, tables and links are shown as such; anything else stays text. Plain text with its line breaks kept would leave `**10 days**` with its marks, the complaint this page answers.

* **No HTML ever becomes markup.** The reader builds a tree of allowed elements, and text enters the page only as text nodes. So there is no sanitizer to get past, and a `<script>` in an answer shows as text.
* **A link goes only to http, https or mailto.** Any other link shows as its text alone.
* **No image is ever loaded.** An image shows as a link to its address, and the page's content security policy refuses images too. An image would be fetched with no click, so an address holding text the model was led to write would carry it away.
* **A half-written answer reads too.** An unclosed code fence runs to the end. A table shows once its delimiter row arrives. An unclosed `**` stays as text until it closes, so `2 * 3` never turns bold for a moment.
* **A line break stays a line break**, since models write one line per sentence or item, and Japanese text joined with a space reads wrong.
* **A hostile or runaway answer reads in time in step with its length.** Each mark's closings, and each bracket's match, are found in one pass, never by a scan from each opening.
* **Quotes, lists and emphasis nest at most 8 deep**, and deeper text reads as text. Thousands of `>` would otherwise nest the reader as deep, and overflow the browser's stack.
* **ksmd's reader is not used.** It is strict, and refuses much of what models write; it is also internal to ksmd.

### What a turn shows

**An answer whose sources were not checked never looks checked.**

| State | What the page shows |
| :-- | :-- |
| Waiting | The question, "Waiting for ksagent", and a Stop button. After 15 seconds, a line asks the person to check that `ksagent watch` runs |
| Being written | The growing text, set apart by a dashed border, under a line saying its sources are not checked yet. What the model is doing, and a Stop button |
| `checked` | The answer, its checked sources with their quotes, and the lines ksagent adds |
| `unverified`, `not_found` | The answer or the not-found line, under its state, and ksagent's lines |
| `stopped`, `failed` | The state, ksagent's line saying why, any partial text marked as not whole and not checked, and "Ask again" |
| Not recorded | ksagent could not record the answer, and its live file says `stopped`. The page shows it as stopped, with why, the text marked as not checked, and "Ask again" |

* **Only the page's own labels follow the browser's language**: English, or Japanese where the browser asks for it. ksagent's lines come in the question's language.
* **The page follows the growing answer only while it stands near the bottom**, within 60 pixels. A person reading above is not pulled down, and a button jumps to the latest text.
* **Only a turn whose records changed is read and drawn again.** So a growing answer leaves the rest of the page still, and unread.
* **A turn that cannot be shown says so, and the page goes on.** Its text stands as plain text, and the next look comes whatever the last one met.
* **A live file with an empty id and the phase `refused` is shown as a notice**: ksagent answers none of the conversation's questions, and says why.

### Opening the page

**ksagent starts no server and opens no browser.** It does not know the local server, and the local server does not know it, so only a program outside both starts them together. The repository's `make chat` runs that program, which starts the model server too; [`TUTORIAL-ask-about-your-files.md`](TUTORIAL-ask-about-your-files.md) says how to run it.

**Starting the model server belongs to that program, not to ksagent.** ksagent asks one protocol of any server, on this machine or another, so it stays free of which server runs and how. The program chooses and starts a server only on this machine, and only while the person's command runs.

## The model server

**ksagent speaks one protocol: `POST /v1/chat/completions` with `"tools"`.** Many local servers speak it, so a person can change servers without changing ksagent.

* **It asks for a stream (`"stream": true`), and reads a reply sent as one JSON body too.**
* **A server that refuses a stream with HTTP 400 is asked again for a whole reply** (`agent.opened`). If that reply comes, ksagent asks for whole replies from then on, and says so once on the console. If it fails too, its own message ends the question.
* **It falls back by itself, not through an option**, since the refusal comes on the first question, before the person would look for an option. A refusal takes no model time, so the second request costs little.
* **One connection per request, closed after it.** A turn waits seconds or minutes for the model, so a connection kept alive saves nothing worth its state. Closing it also stops the model: `llama-server` and `chat_server` stop generating once a write to a closed connection fails.
* **`--timeout` bounds one whole reply**, from the request to its last piece. A bound on the silence between pieces alone would let a server that never ends hold the question for good.
* **The model's turn is rebuilt before it is sent back**: its text and its calls only. A field one server adds, such as its reasoning, is not sent to it again on every round.
* **Only plain http**, since `std` holds no TLS client. The model server runs on this machine, or on a network the person trusts.
* **A reply's end must be told.** A chunked reply ends with its last chunk, and another one names its `Content-Length`. A reply that runs to the close is refused, since one cut short reads the same.
* **A stream must end with a finish reason or `[DONE]`.** One whose body ends first broke off, and so does one that brings an `error` event. Either ends the question with a line that says so, and no part of it counts as an answer.
* **A reply whose finish reason is `length` is used in no part**, whole or streamed. The server's length limit cut it, and a call cut short can still be valid JSON, such as `{"path": "a.md"}` cut before its lines. It would run with the wrong arguments, or answer with half a text. The question ends as `stopped`, with a line saying the limit cut the reply. Asking again would most often meet the same limit.
* **A call's pieces are joined by their `index`**, as the protocol numbers them. Thinking comes as `reasoning_content`, as `llama-server` sends it, or as `reasoning`.
* **An API key comes only from the environment variable `KSAGENT_API_KEY`.** The command line shows in the process list, so an option would expose the key.
* **A server that cannot be reached, or fails, ends the question with one line** saying what went wrong and what to do. The chat file records the answer as `failed` with that line, so the person waiting on the page sees it.

## Watching an answer grow

**A local model takes minutes, so each reply shows as it arrives** (`ksagent/progress.kspl`). The chat file is written once a question ends, with its answer and the answer's state.

| Where | What it shows | Which command |
| :-- | :-- | :-- |
| The console's standard error | The model's thinking after `thinking:`, then its text under a line saying its sources are not checked yet | `ask`, `watch` and `eval` |
| The live file: `team.live.json` beside `team.ask.jsonl` | The question's id, what the model is doing (`waiting`, `thinking`, `reading` with the tools called, `writing`) and the unchecked text so far | `watch` |
| The chat file | The question and its answer, with its state, once the work on it ends | `watch` |
| Standard output | The checked answer and its sources, once | `ask` |

* **The console gets no control character but a line break and a tab** (`answer.write_shown`); each other one shows as `�`. Text from the model, a file or a server can hold an escape sequence, which a terminal would obey.
* **The live file is a file of its own**, replaced as a whole, so the chat file holds only turns that ended. It needs no endpoint and starts nothing.
* **The live file is written at most once a second**, and the page reads it every second while a question is open. The tools leave it out, as they leave out the other two files.
* **The answer's text is read from the `answer` call while its arguments arrive.** They are JSON cut anywhere, so the `text` member is decoded up to its last whole character. Each byte is read once (`progress.Text_reader`), so a long answer takes time and memory in step with its length. The not-found marker shows nothing: ksagent writes its own sentence at the end.

**An unchecked answer never looks checked.**

* On the console, the checked answer and its sources come after the growing text, apart from it.
* The chat file names `checked` only for an answer with a source that passed the check. Text shown before a stop stands in `partial`, never in `text`.
* Once the turn is recorded, the live file says `done` and holds no text. The page then shows the recorded answer in place of the growing text.
* When the turn cannot be recorded, the live file says `stopped`, and why, beside the unchecked text.
* A process stopped by Ctrl+C leaves the live file as it last was. The chat file holds no answer for the question, so the next `watch` asks it again.

**The thinking shows on the console and nowhere else**, as a sign that the model works. It is the model's draft, not its answer, so the live file and the chat file leave it out.

**Stopping an answer:**

* **Ctrl+C stops ksagent**, which closes its connection and so stops the model. KSPL's standard library catches no signal, so nothing is written on the way out; the files stand as above.
* **The page's Stop button stops an answer within about 2 seconds.** It adds a stop record to the ask file ("Asking, stopping and a refused save" above). A page cannot stop it any other way, since a page may not start anything.

Caution: **While `llama-server` reads a long prompt, nothing comes back, not even the reply's head.** So the console shows nothing new for that time, and a stopped question stops its answer only once the first piece arrives. ksai's `chat_server` sends its head at once.

## Scoring with `eval`

**A source passes when its lines overlap the expected range in the expected file.** Overlap, not equality: a model may cite one line more or less than the person who wrote the question. The 50-line cap keeps a wide range from passing by accident.

**`Expect: none` passes only on the not-found answer.** These questions measure whether a model invents an answer, so a model that always answers something passes none of them.

**The table goes to standard output as Markdown.** `--out` also writes it under the root: as Markdown, or as a ksmd table when the name ends in `.ksmd`. The two forms differ, since a ksmd table holds quoted text and bare numbers.
