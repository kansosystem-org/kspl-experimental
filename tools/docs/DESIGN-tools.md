# tools — the design

**Why the programs in `tools/` are built the way they are.** It is for whoever changes a tool in `tools/`. What each file does is in the table in [`tools/README.md`](../README.md); the rules every document follows are in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md).

## The API record

Every package keeps a plain text list of the names it publishes, its *API record* `SURFACE.txt`: one line per published function, type or constant. `tools/surface.kspl` and `surface_rows.kspl` write and check it. The browsable *reference* is `ksplc doc`'s output, which `pages` writes under `out/docs/`. What the gate checks is "The record of a published API" in [`docs/SPEC-gates.md`](../../docs/SPEC-gates.md).

### Why the record and the reference are two renderings

**Both render the lines of one walk** (`surface_lines` in `ksplc/tools/surface.kspl`), so they cannot disagree. Only the record goes into git; why is "The reference is rendered when asked, not committed" in [`docs/DESIGN-repository.md`](../../docs/DESIGN-repository.md).

| | The record (`SURFACE.txt`) | The reference (`out/docs/`) |
| :-- | :-- | :-- |
| Committed to git? | yes | no |
| What it holds | each published name and its signature, with no formatting | the same names, plus the descriptions of each parameter and return value |
| What a diff of it means | "the API changed", and nothing else | nothing to diff: it is rebuilt when asked |

**The reference holds more than the record**: the `//<` rows for parameters and return values, which `SURFACE.txt` leaves out ("Writing out the published API" in [`ksplc/docs/SPEC-tools.md`](../../ksplc/docs/SPEC-tools.md)). **The pages under `out/docs/` are `ksplc doc`'s output and nothing else**, so no gate needs to check them.

**A file that cannot be read on its own stops the record.** A record missing a file would show every entry in it as removed.

## The desktop opener

Double-clicking a `.ksmd` document runs ksmd's opener, [`../ksmd.kspl`](../ksmd.kspl). It makes sure a local kssrv server is running for the document's workspace, then makes the browser open the document's page. It chooses only the folder to serve and the port to start from; the rest is [`../opener.kspl`](../opener.kspl). ksagent's chat opener shares it ("Opening the chat page" below). The steps that tie the file type to it are "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md#opening-a-ksmd-document-on-a-double-click).

```mermaid
sequenceDiagram
    participant U as the user
    participant O as the opener
    participant R as the saved record
    participant S as kssrv
    participant B as the browser
    U->>O: double-clicks a .ksmd
    O->>R: take the lock; is a server for this folder listed?
    O->>S: if listed, ask /api/status with its token
    alt no live server for this folder
        O->>S: start one on a free port
        S-->>O: prints its URL and token once, into the log
        O->>R: add this server to the record
    end
    O->>R: let the lock go
    O->>B: start it on a small page (the token is inside the page, not on the command line)
    B->>S: the page moves on to the URL and loads the document
    O-->>U: says where the page is, without the token, then exits
```

### Where the double-click opener lives

**The opener is a leaf** ([`../opener.kspl`](../opener.kspl)), because only a leaf can know both the server and the page. (A *leaf* is a folder such as `tools/` that can point at every package but that no package points at.) `kssrv` knowing the `?doc=` shape, or `ksmd` knowing how the server is started, would be a sideways reference ("Reference direction between documents" in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md)).

**Which folder is served, and from where the page comes:**

| Decision | Why |
| :-- | :-- |
| **The page is served from outside the root** (`kssrv --page=<file>`), not copied into the user's folder. | Copying a 2MB page into the folder at every opening would fail on a read-only folder. |
| **The folder served is the document's workspace** ("Opening a `.ksmd` document" below). | Serving only the document's folder would leave the files it includes unreachable. |
| **The served folder is remembered as an absolute path.** | `.` and `/home/me/devel` are one folder but two strings, and would start two servers on the same folder. |
| **A folder that holds the server's `tmp/` gets no builder, and the run says why.** | The record of allowed files stands in `tmp/`, and a page could write it there. kssrv refuses such a record, so with the builder named the server would not start at all. |

Why that one named page file gives the client no more reach is "Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

**Reusing a server:**

* **A running server is reused, but only one serving the same folder, never one picked by its port number.** One server per document would multiply, and a server for another folder cannot read the document. So the saved record holds a list of servers (`state_text` in `tools/opener_aim.kspl`).
* **The record drops a server when it stops answering, never at a count.** Cut at a count, it would drop a server still running, which `--list` and `--stop-all` then cannot reach. On Windows its program file would stay locked against the build.
* **When the named port is taken, the next one is tried**, tested with the same binding kssrv uses. Giving up after one would make every document in another folder fail to open.
* **A server counts as alive only when it accepts the token.** Any program can be listening on an open port. On a local server, `/api/status` needs the token, so a 200 means the peer is kssrv.

**Several documents opened at once** (each starts its own opener, at the same moment):

* **One lock is held from looking at the record to writing it** (`out/tmp/ksmd.lock`, `open_or_start` in [`../opener.kspl`](../opener.kspl)), and `--list`, `--stop` and `--stop-all` take it too. Without it, two openers each start a server, and one record overwrites the other, losing a server nobody can then reach.
* **The lock is the operating system's** (`fs.File_lock`), let go however the process ends. A lock file the opener made would outlive a crash and stop every later opening.
* **Each server writes its own log, named by its port** (`out/tmp/ksmd.<port>.log`), chosen free under the lock. One shared log would hand one opener the URL another's server printed.
* **What it gives up**: an opening waits while another starts its server, a few seconds at most.

**Keeping the token secret:**

* **The token is kept in files that only their owner can read**: the record (`out/tmp/ksmd.state`), the server's log and the page handed to the browser. Each is created with mode 0600 (`fs.write_unique`), and replaced with `fs.replace_file`'s owner-only rule (`write_owned` in [`../opener_aim.kspl`](../opener_aim.kspl)). On Windows no mode is set, and the folder decides who can read them.
* **The token never goes on a command line**, where `ps` shows it to every user on the machine. The opener reads it from the line kssrv prints once at start-up. It hands it to the browser inside a page ("The browser is handed a page, never the URL" below).
* **The token is put out only with `--show` or `--list`**, which a person asks for at a terminal. A double-click sends the opener's output where others can read it, such as the system journal. So when it opens a document without `--show`, the opener puts out the URL without its fragment.

**Starting the browser:**

* **The opener tries the environment's tools in turn, and always says how to open the page by hand.** Where one tool is absent, nothing happens and nothing says so. Each environment has its own list (`OPENERS` / `OPENERS_WIN` in `tools/opener.kspl`).
* **On POSIX, a tool is looked up on the PATH before it is started.** Starting even a missing tool creates the child there, and the failure shows only inside it.
* **Do not mix the environments' tools in one list.** On Windows a tool counts as handed over as soon as it starts, so MSYS2's `xdg-open` first would report success without starting any browser.
* **On Windows, the page goes to `explorer.exe`**, which opens one file with the program the system holds for its type: the default browser for `.html`. Its path is written with `\`.
* **`cmd /c start` cannot be used.** Each argument is passed in its own quotation marks (`kspl_win_build_cmdline` in [`../../ksplc/gen/runtime/hosted_spawn.c`](../../ksplc/gen/runtime/hosted_spawn.c)), and cmd does not recognise `"start"` as an internal command. Do not fix it by dropping the quoting: that function stops argument injection.
* **"Handed over" is not reported as "opened"**, since a tool can start and still show nothing. So the opener always prints how to open the page by hand and where the messages are.
* **On Windows, a path's `\` becomes `/` inside the URL.** On POSIX, `\` can be part of a file name, so it is kept there.

**How it is installed and checked:**

* **The file association points at the built executable** (`out/ksmd.exe`, built by `make ksmd`, or the copy `make install` puts in), which finds kssrv beside itself. Started by a double-click, `ksplc run ...` would run in home or `/`, where neither `std/` nor `out/` can be found.
* **It looks beside its own executable first, as the OS names it** (`sys.exe_path`), then beside argv[0], then in `out/`. Started through PATH, argv[0] holds the bare name, and through the link `make install` puts in `bin/`, it names the link's folder.
* **`make install` copies the folder in the shape of `out/`**: the launcher, kssrv, and the page under `ksmd/web/`. So one search finds both, and no second layout is kept in step. It stops the installed servers first and replaces the folder whole, as `make` does before it rebuilds them.
* **The opener exits once the URL is passed to a browser, and the server stays** for the next opening. Only with `--show` does it wait and pass the server's output through (`tools/tests/ksmd_launch.kspl` uses that).
* **The document to double-click is an example the tree keeps**, [`ksmd/examples/overview.ksmd`](../../ksmd/examples/overview.ksmd), which `make ksmd` names. It holds a table that calculates and an include, so the opened page shows both working.

**What it gives up**:

* **Only the servers in the record can be listed and stopped.** One started by hand, or one that has stopped answering, is left to the operating system's own tools.
* **Only the Linux association is installed automatically**, by `make install` through `make install-desktop`. The gates install it into a scratch folder and check the files there.
* **On Linux, the files go to the user's data folder**, `$XDG_DATA_HOME` or `~/.local/share`, or under a named `PREFIX`'s `share`. The two caches are rebuilt where their tools exist; a missing tool is a note.
* **Only the user's own install sets the default program** (`xdg-mime default`). Under a named `PREFIX` other users can share the files, and the choice of program stays each user's.
* **On Windows, make writes no registry entry.** Only Windows' own "Open with" dialog sets a file type's default program, so the person ties the type there, once.

### The browser is handed a page, never the URL

**The URL carries the token, so the browser is started on a small page, which moves on to the URL at once** (`page_text` in [`../opener_aim.kspl`](../opener_aim.kspl)). A browser's command line is open to every user while the starter runs, and the browser keeps it among its own arguments.

The page moves on with a `refresh`, and the fragment (the part after `#`) travels with it. So the page reads the token as from a URL typed by hand. The page offers the link too, for a browser that does not follow a `refresh`.

| Decision | Why |
| :-- | :-- |
| **Each run writes a page of its own** (`fs.write_unique`). | Several openers at once would hand each browser the page written last. |
| **A page is removed by a later run, once it is older than `page_keep_s`** (`sweep_pages`). | The opener exits as soon as the browser is started, and a cold browser can take a while to read the page. |
| **The page lies in `tmp/` next to the server, not in a hidden folder.** | A browser confined by its packaging (a snap) reads no hidden folder under home. |

**What it gives up**: a browser on another system (Windows' browser started from inside WSL) can fail to reach the page's path. `--show`'s URL is then the way in.

### Listing and stopping the servers it left

**The server stays running after an opening, so the opener can also list those servers and stop them.** `--list` prints each running server's URL and folder; `--stop=<folder>` stops the one serving that folder, and `--stop-all` every one (`tend` in [`../opener.kspl`](../opener.kspl)).

**A server counts as running by the test for reuse**: "Reusing a server" under "Where the double-click opener lives" above. Why a stop never goes by process number is "A page asks the local machine through one protocol" in [`docs/DESIGN-repository.md`](../../docs/DESIGN-repository.md).

**A server is picked by the folder it serves, not by its port**, which changes when a taken one is skipped. The folder is made absolute and loses a trailing separator first (`trim_end_sep` in [`../opener_aim.kspl`](../opener_aim.kspl)), so the one typed with tab completion is the one the record holds.

**A stop is asked of the server itself** (`POST /api/stop`, "Stopping it when asked" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)), with the token from the record. It is reported only once the server no longer answers.

**The URL printed carries the token**: it opens the page again, and whoever can run the opener can read the record anyway.

**Each mode stands alone.** A document or another option beside `--list`, `--stop` or `--stop-all` is refused rather than ignored. A folder with no server is a failure, so a mistyped folder does not read as stopped. `--stop-all` with nothing running is not a failure.

### The opener opens no console, yet prints to the parent's

**On Windows the opener is built for the windowing subsystem, and attaches to the console it was started from when there is one.** Double-clicked, it shows no black console window. Typed in a terminal, it still prints the address to open there. The generated entry point attaches to the parent's console before anything is written (`kspl_io_attach_console` in [`../../ksplc/gen/runtime/hosted.c`](../../ksplc/gen/runtime/hosted.c)).

**Two executables are ruled out**, because the choice would be made twice: by whoever types the name, and by the file association. The price is that the prompt returns before the last line.

**The server it starts gets no console window either.** A windowing program that starts a console program gets a fresh console window for the child (`spawn_redirect` in [`../../std/subproc.kspl`](../../std/subproc.kspl)). With no window to close, the server stops itself once no page holds it open: when the last ksmd tab closes.

**With `--show`, the server shares the opener's console instead** (`spawn_beside`). It has no idle stop then, so the Ctrl+C that stops the opener must reach the server too. Without a console, the server would keep running.

Note: The server's output and the browser's are written beside the opener, under the names `LOG_EXT` / `Where.browser` in [`../opener.kspl`](../opener.kspl).

### Opening a `.ksmd` document

**ksmd's opener is a program of its own, `tools/ksmd.kspl`, built as `out/ksmd.exe`.** ksmd is a library and a page, with no program to add an `open` command to. Only a leaf may know both kssrv and ksmd's page.

ksmd needs a workspace that holds the document's includes, and one port for it on every run ("Opening a document from the desktop" in [`ksmd/docs/DESIGN-ksmd.md`](../../ksmd/docs/DESIGN-ksmd.md)). The rules are in [`../opener_aim.kspl`](../opener_aim.kspl), each checked alone by [`../tests/ksmd_aim_test.kspl`](../tests/ksmd_aim_test.kspl).

**Which folder is the workspace:**

| Decision | Why |
| :-- | :-- |
| **The workspace is the nearest folder at or above the document that holds a file named `.ksmd-workspace`.** Without one, it is the document's own folder. `--workspace=<folder>` names it for one run instead | An include that climbs with `../` must stay inside the folder the person chose. The mark keeps that choice in the folder, so no list of known folders goes stale |
| **Only `.ksmd-workspace` marks a workspace; a `.git` folder does not** | A repository at the home folder would then serve every file there to whoever holds the token |
| **`--workspace` exists beside the mark** | A folder can be read-only, or shared with others |
| **A path holding `..` is refused, not folded away.** `.` and doubled separators drop, and a Windows drive letter is upper-cased | The port follows from the path's text, so one folder needs one spelling. Windows ignores a drive letter's case. Behind a link, `a/link/..` is another folder than `a` |
| **A document that is a link, or lies under a folder that is one, is refused before anything starts** | The server opens no link inside its root (`fs.join_under`), and the opener asks the same link check (`fs.stays_under`) |
| **A name not ending in `.ksmd` is refused, in any case** | Windows and the Linux MIME globs both hand `NOTES.KSMD` to the association |

**Which port it gets:**

| Decision | Why |
| :-- | :-- |
| **The port is 20000 plus the FNV-1a hash of the workspace's absolute path, modulo 10000** (`home_port`) | The browser keeps drafts per address, the port included. A port that changed between runs would hide every draft held before |
| **The port is worked out, never remembered** | A record can be lost with `out/` or another clone |
| **Ports 20000 to 29999** | The OS hands out outgoing ports from 32768 on Linux and 49152 on Windows and macOS. Development servers mostly take ports below 10000 |
| **Do not change the formula** | Every workspace would move, with its drafts. The test pins a few values, so a change fails it |
| **A running server for the workspace is reused, whatever its port** | A server that started on another port keeps its drafts there until it stops |
| **A taken port is skipped, and the run says so.** The next free port of the 16 after it is used | The page cannot see another port's drafts, so the line says why they seem gone. Once the port is free again, the next run returns to it |

**What it gives up:**

* **Two workspaces can share a port.** With ten workspaces, the chance is about one in 200. While both run, the second one opened takes the next free port.
* **One folder spelt two ways is two workspaces**, such as another letter case on Windows or a path through a link.
* **Each opening shows a new browser tab.** The opener cannot bring forward a tab that another program opened. Two tabs on one document keep two drafts, so nothing is lost.

### Opening the chat page

**Asking about a folder is one command, `make chat DIR=<folder>`, which runs `tools/ksagent_chat.kspl`, built as `out/ksagent_chat.exe`.** It makes sure a model server answers ("Starting the model server" below). It starts or reuses a local server that serves the chat page for the folder, and hands the URL to the browser. It then runs `ksagent watch` on the folder in the foreground, so one command both opens the page and answers it. **`make chat` hands it every option, empty where a setting is not given**, and the launcher makes every choice ("A run target writes every option out" in [`docs/DESIGN-repository.md`](../../docs/DESIGN-repository.md)). `out/ksagent_chat.exe --help` names each default.

**It shares the desktop opener** (`tools/opener.kspl`): the lock, the note, the free port, the handed page and `--list` / `--stop`. Each opener names what it opens in an `App` (`tools/opener_aim.kspl`): its name, its page beside the server, and the start of its files' names in `tmp/`.

| Decision | Why |
| :-- | :-- |
| **A leaf starts the server and `ksagent watch` together** | kssrv does not know ksagent, and ksagent takes only kssrv's browser client from it ("Reference direction between documents" in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md)). A page may start no program |
| **The chat opener keeps its own note** (`ksagent_chat.state`) | A ksmd server and a chat server for one folder serve different pages, so neither may be reused for the other |
| **A new chat server looks for a free port from 30000** | ksmd's workspaces take 20000 to 29999, and the chat page keeps no draft, so its port needs not stay the same |
| **The page is built beside the server** (`out/ksagent/chat.html`) | The page is served from outside the root, as ksmd's is. The build puts kssrv's client for the local server inside it, so it is one file, as ksmd's page is |
| **With `--show`, the server it started stops when `ksagent watch` ends** | A server started for `--show` has no idle stop, so it would outlive the run |

**What it gives up**: the browser check drives it with `--show` (`make test-ksagent-chat`), so no gate checks how it starts a browser, as for ksmd's opener.

### Starting the model server

**The launcher uses a model server that already answers where ksagent asks.** Otherwise it starts one, waits until it has loaded, and stops it at the end (`tools/model_server.kspl`). So a person runs one command in one terminal, and no server outlives it holding the graphics card's memory.

```mermaid
flowchart TD
    A[ask GET /v1/models at the address] -->|lists models| B{GET /health}
    B -->|200, or no /health| R[use it, and leave it running at the end]
    B -->|503| W[wait until it is ready]
    A -->|another answer| X[refuse: the port belongs to another program]
    A -->|401| K[refuse: name KSAGENT_API_KEY]
    A -->|nothing listens| F{model file in data/?}
    F -->|no| D[print the curl command, and stop]
    F -->|yes| L{llama-server starts from PATH?}
    L -->|yes| S[start it]
    L -->|no| B2{chat_server built beside the launcher?}
    B2 -->|yes| C[start chat_server, and say it is slow]
    B2 -->|no| N[name make chat-server NATIVE=1, and stop]
    S --> W2[wait, saying so every 10 s]
    C --> W2
    W2 -->|ready| U[run the page and ksagent watch; stop the server at the end]
    W2 -->|ended, or too long| T[show its last lines and its log, and stop]
```

| Decision | Why |
| :-- | :-- |
| **The launcher starts the model server, though a page may start no program** | The person's own command starts it, once, before any page opens. No page request reaches it ("It starts one program at most" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)) |
| **It chooses the server itself: `llama-server` where it starts from PATH, otherwise `chat_server`** | The person makes no choice. `llama-server` uses the graphics card. `chat_server` needs nothing from outside, so the command works without llama.cpp, slowly, and says so |
| **Starting `llama-server` is the test of whether it is on PATH** | The runtime looks a bare name up in PATH alone, on every OS. A second lookup could disagree with it |
| **Where neither `llama-server` nor a built `chat_server` is there, the launcher stops and names `make chat-server NATIVE=1`** | Installing llama.cpp is the better way. A build that started by itself would commit the person to answers that take minutes. A program that make started would also need make's name and settings to build |
| **A model server is one whose `GET /v1/models` lists models** | Something else on the port answers otherwise, and is refused by name, not taken for a server that never gets ready |
| **`GET /health` answering 503 means that it still loads** | `llama-server` listens before its model is loaded, and answers `/v1/models` meanwhile. `chat_server` listens only once it is ready, and has no `/health` |
| **The wait says what it waits for, and again every 10 seconds** | Loading takes seconds to minutes; a silent wait reads as a hang |
| **A server that ends before it is ready shows its last 12 lines and its log's path** | Its own words name the cause, such as memory that ran out. A hint follows where it says `out of memory` |
| **A missing model file stops the launcher with the `curl` command to run** | A download of gigabytes that starts by itself holds the terminal for minutes with no choice. The person sees the size first |
| **Only the server this run started is stopped** | A server the person started is theirs, and other programs can use it too |
| **The server shares the launcher's console** (`spawn_beside` in [`std/subproc.kspl`](../../std/subproc.kspl)) | Ctrl+C at the console reaches it as it reaches the launcher, so it stops even when the launcher is stopped before it can act |
| **The launcher takes the model server's port, `--port`, and hands `ksagent watch` the address on this machine** | The address is made once, so the server started and the server asked cannot differ. `make chat PORT=<n>` names the port |
| **A llama-server it starts gets a new random key each time, through `LLAMA_API_KEY`** | llama-server checks no `Host` and answers the CORS request of any page. Without a key, a web page could use the graphics card and read the answers. The environment keeps the key out of the process list |
| **It starts llama-server with `--no-slots`** | `GET /slots` shows the prompts that are being answered, and nothing here reads it |
| **The key stands in `tmp/model.<port>.key`, which only its owner can read, until the server stops** | A second launcher, and `ksagent ask` after `make model-server`, ask a server they did not start. `ksagent watch` gets the key through `KSAGENT_API_KEY` |
| **A key file whose server is gone is deleted, and `KSAGENT_API_KEY` is tried instead** | Ctrl+C can end the launcher before it deletes its file. The server it started takes that key, so a port where nothing answers, or a server that refuses the key, means the file is stale. Kept, it would stand in for `KSAGENT_API_KEY` for good, and the message below would name a setting that changes nothing |
| **A server that answers 401 is refused, and the message names `KSAGENT_API_KEY`** | It is a model server that wants a key this launcher does not hold. Taking it for another program would hide the fix |
| **`chat_server` gets no key** | It answers only a request whose `Host` is this machine, so a web page cannot reach it |
| **A model file named for a server not started here is refused** | That server keeps its own model, so the name would change nothing (Principle 5 in [`docs/DESIGN-principles.md`](../../docs/DESIGN-principles.md)) |
| **With `chat_server`, ksagent waits an hour for one reply** | It reads a prompt several times slower than `llama-server`, and ksagent's own limit would end a question it still answers |
| **`llama-server`'s options stand in `tools/model_server.kspl` alone**, and `make model-server` runs the launcher with `--model-only` | `ksagent ask` and `eval` need a server alone. Through the launcher it gets the same options, the same choice and the same messages |
| **`llama-server` keeps the conversation's memory at 8 bits** (`--cache-type-k q8_0 --cache-type-v q8_0`) | At 16 bits, 32,768 tokens of the first model take 4.5 GiB, and the model and its conversation do not fit a 6 GB card together. At 8 bits the conversation takes 2.4 GiB. The sums are at `LLAMA_OPTIONS` |
| **`--flash-attn on` is written out, and needs llama.cpp b6325 (August 2025) or later** | An 8-bit value cache needs flash attention. Written out, the need does not hang on a default that changed between builds. A build that runs the second model is newer anyway |

**What it gives up**:

* **Two launchers can share one model server**, and the one that started it stops it at its end. The other's questions then fail with a line that says so, until the person runs it again.
* **A launcher killed outright leaves its model server running.** Ctrl+C and closing the terminal reach the server too; `kill -9` and the Task Manager do not. Holding the server in a job that the OS ends with the launcher would need a change in the C runtime and a new seed.
* **On Windows, only the cross-compiled link is checked here.** The stop on Ctrl+C is confirmed on Linux alone (`make test-ksagent-chat`).
* **A built `chat_server` is not built again after its sources change.** Run `make chat-server NATIVE=1` again after pulling a change to it.
* **The launcher asks a model server on this machine only.** For a server on another machine, run `ksagent watch --model-url=<url>` yourself.
* **The launcher does not check llama.cpp's version.** An older build refuses `--flash-attn on`, and the last lines the launcher shows say `invalid argument`.
