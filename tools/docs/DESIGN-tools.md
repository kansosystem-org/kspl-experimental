# tools — the design

**Why Kanso's own development tools are built the way they are.** It is for whoever changes a tool in `tools/`. What each file does is in the table in [`tools/README.md`](../README.md); the rules every document follows are in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md).

## The API record

Every package keeps a plain text list of the names it publishes (its API), and a tool writes and checks that list. A second tool turns the same information into pages you can browse.

The list is the package's *API record*, `SURFACE.txt`: one line per published function, type or constant. `tools/surface.kspl` and `surface_rows.kspl` write and check it. The browsable *reference* is `ksplc doc`'s output, which `pages` writes under `out/docs/`. What the gate checks is in "The record of a published API" in [`docs/SPEC-gates.md`](../../docs/SPEC-gates.md).

### Why the record and the reference are two renderings

**Both render the lines of one walk** (`surface_lines` in `ksplc/tools/surface.kspl`), so they cannot disagree. Only the record goes into git; why is "The reference is rendered when asked, not committed" in [`docs/DESIGN-repository.md`](../../docs/DESIGN-repository.md).

| | The record (`SURFACE.txt`) | The reference (`out/docs/`) |
| :-- | :-- | :-- |
| Committed to git? | yes | no |
| What it holds | each published name and its signature, with no formatting | the same names, plus the descriptions of each parameter and return value |
| What a diff of it means | "the API changed", and nothing else | nothing to diff: it is rebuilt when asked |

**The reference holds more than the record.** The rows written with `//<` for a parameter and a return value are the half of a reference a reader most needs. `SURFACE.txt` leaves them out ("Writing out the published API" in [`ksplc/docs/SPEC-tools.md`](../../ksplc/docs/SPEC-tools.md)). That is the one place where the two need different content, not only a different shape. The split is the same: share the walk, not the output.

**The pages under `out/docs/` are `ksplc doc`'s output and nothing else.** `pages` runs the command once per publishing file and once for the package. So a page cannot say anything the command would not, and no gate needs to check them.

**A file that cannot be read on its own stops the record.** A record missing a file would show every entry in it as removed.

## The coding assistant

`tools/ai_assist/` builds an AI that fills in missing KSPL code, and the KSPL compiler decides whether each answer is good.

The folder makes the training data, scores the completions and trains the model. What each file does is in [`tools/ai_assist/README.md`](../ai_assist/README.md); what is left to build is in the "tools" section of [`docs/PLAN.md`](../../docs/PLAN.md).

The task is *fill-in-the-middle* (FIM): the model sees the code before and after a gap (a *hole*) and writes what goes in the gap.

### The approach: borrow for training, KSPL for checking and serving

| Part | What it uses |
| :-- | :-- |
| **Training** | It can borrow an existing model: a large LLM, or LoRA fine-tuning of a small coding model. (LoRA trains only a few added parameters, not the whole model.) |
| **Checking** | KSPL's own tools: `ksplc` (compiling), `lint` and `fmt` |
| **Serving** (running the model) | KSPL: inference runs on `ksai` with safetensors weights (`ksai/examples/fim_coder` and `ksai/examples/qwen_infer`) |

**The compiler is the judge.** What is generated and trained on is checked and filtered by a program, not by a person. The main measure is the rate at which `ksplc` accepts a file once the completion is inserted. Using the compiler this way is called the *compiler oracle* below.

**It lives in `tools/`, not in `ksai/`, because it imports nothing from the engine.** It starts the compiler and reads this repository as its corpus, so it runs only inside the whole tree. The engine's examples take the corpus and the tokenizer by path, and this folder runs them as processes.

### Implementation language: KSPL for data, evaluation and the gate

**Whatever reduces to the compiler oracle is KSPL.** Calling `ksplc` as a child process and judging the result needs no outside machine-learning library; it uses `run_capture` in [`std/subproc.kspl`](../../std/subproc.kspl).

**What depends on the outside ML ecosystem stays in Python on purpose** (`transformers`, `peft`, `torch` and the like). Porting it would gain little. It would also lose its value as an outside reference that checks the KSPL code. Those helpers import the libraries inside a function, so a file loads without them.

### How a completion is scored

**A hole counts only where the compiler would notice it is empty, that is, where removing its line breaks compilation** (`eval_fim.kspl`). So the original line (the oracle) scores 100% and an empty completion 0%, by construction. A comment or a blank line compiles when empty, and counting it would let "nothing" pass.

**`fim_coder complete` returns several candidates, and the compiler chooses among them.** This scores clearly higher than the model's single most likely answer (the *greedy* candidate). So `eval_fim --model=native` reports both:

| Score | What it counts |
| :-- | :-- |
| pass@1 | the greedy candidate compiles |
| pass@K | any one of K candidates compiles |

**A line the compiler accepts is not always the line meant.** Far fewer completions match the original line exactly. So the rate measures whether the code is valid KSPL, not whether it is right.

**Settings are compared by the held-out loss, not by the compiler's rate.** The *held-out loss* is the model's error on code it was not trained on. At this model size, a retrain of one setting with only a new random seed moves the compiler's rate. It moves the rate more than a change of optimizer or batch does. The held-out loss hardly moves. So `make fim-eval` prints the held-out loss (`fim_coder loss`) before the rates. The loss `train` prints is on its training data, so it cannot stand in for the held-out loss.

**The held-out loss is printed twice: over every position, and over the middle alone** (the hole's tokens and its end marker). The first is mostly the prefix and the suffix, which the model is given, not asked to write. The second is the task itself.

**Adam is the default optimizer** (`FIM_OPTIMIZER=sgd` selects SGD). At the default batch and step count it reaches a lower held-out loss than SGD, by more than two seeds of one setting differ. Its steps take longer.

### Why the assistant runs outside the language server

**The AI runs as its own process, not inside the language server** (the program that gives an editor its completions and diagnostics). A model inside the server's process costs memory and delay on every keystroke, and its crash takes the server down. Kept apart, the compiler is untouched and the seed is unaffected.

`fim_coder complete` fills a file of holes; nothing serves an editor as the user types. **An editor bridge is not built until the completions are worth its cost.** Passing completions over, with a fallback on a timeout, adds work to every keystroke.

## The desktop opener

Double-clicking a `.ksmd` document runs ksmd's opener, [`../ksmd_open.kspl`](../ksmd_open.kspl). The opener makes sure a local kssrv server is running for the document's workspace, then makes the browser open the document's page. It chooses only the folder to serve and the port to start from. The rest is [`../opener.kspl`](../opener.kspl), which an opener for another document type would share.

The steps that tie the file type to it are in "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md#opening-a-ksmd-document-on-a-double-click).

This is what one opening does. The sections below give the reason for each step.

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

**The opener is a leaf** ([`../opener.kspl`](../opener.kspl)), because only a leaf can know both the server and the page. (A *leaf* is a folder such as `tools/` that can point at every package but that no package points at.) Packages refer to each other only in the direction of import. So `kssrv` knowing the `?doc=` shape, or `ksmd` knowing how the server is started, would be a sideways reference ("Reference direction between documents" in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md)).

**Which folder is served, and from where the page comes:**

| Decision | Why |
| :-- | :-- |
| **The page is served from outside the root** (`kssrv --page=<file>`). Do not copy the page into the user's folder. | The server serves only what is under its root (the folder it serves). Requiring the page there means copying a 2MB page into that folder at every opening, and a read-only folder could not be opened at all. |
| **The folder served is the document's workspace**, which "Opening a `.ksmd` document" below defines. | Serving only the document's folder would leave the files it includes beside it unreachable from the page, since the server refuses everything outside its root. |
| **The served folder is remembered as an absolute path.** | `.` and `/home/me/devel` are one folder but two strings. Remembered as written, they make `make ksmd-open` and the file association start two servers on the same folder. |

Why that one named page file gives the client no more reach, and why it is never a folder, is in "Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

**Reusing a server:**

* **A running server is reused, but only one serving the same folder, never one picked by its port number.** Do not start a server without looking: one per document multiplies, and their ports collide and are refused. A server for another folder cannot read the document. So the saved record holds a list of servers (`state_text` in `tools/opener_aim.kspl`). Holding only one, it would lose the first as soon as a second started.
* **The record drops a server when it stops answering, never at a count.** Each new server's opening rebuilds the record, and only the servers that still answer with their token stay in it. Cut at a count instead, the record drops a server still running. `--list` and `--stop-all` then cannot reach that server. On Windows its program file then stays locked, so the build cannot replace it.
* **When the named port is taken, the next one is tried.** Giving up after one would make every document in another folder fail to open. The question is "can I listen", not "is someone listening", and it is tested with the same binding kssrv uses.
* **A server counts as alive only when it accepts the token.** Do not trust an open port: any program can be listening there. On a local server, `/api/status` needs the token (a secret string the server makes at start-up), so a 200 means the peer is kssrv.

**Several documents opened at once** (several chosen and opened together start one opener each, at the same moment):

* **One lock is held from looking at the record to writing it** (`out/tmp/ksmd_open.lock`, `open_or_start` in [`../opener.kspl`](../opener.kspl)), and `--list`, `--stop` and `--stop-all` take it too. Without it, two openers each find no server, and each starts one. Each then rewrites the record from what it read, so one record overwrites the other. The lost record's server holds its port with nobody able to list, stop or reuse it. With it, a second document in the same folder reuses the first's server.
* **The lock is the operating system's** (`fs.File_lock`), let go however the process ends. A lock file the opener made and removed would outlive a crash and stop every later opening until someone deleted it.
* **Each server writes its own log, named by its port** (`out/tmp/ksmd_open.<port>.log`). One log shared by every opening hands one opener the URL another's server printed. The port is chosen free under the lock and is held by its server from then on. So no two running servers share a log, and the logs number no more than the ports tried.
* **What it gives up**: an opening waits while another starts its server. The wait is a few seconds at most, since a server that exits early ends the wait at once.

**Keeping the token secret:**

* **The token is kept in files that only their owner can read**: the record (`out/tmp/ksmd_open.state`), the server's log and the page handed to the browser. Each is created with mode 0600 (`fs.write_unique`). The record and the log replace what stood there with `fs.replace_file`'s owner-only rule (`write_owned` in [`../opener_aim.kspl`](../opener_aim.kspl)). So a file written before under another mode does not keep that mode. A crash leaves the old record or the new one, never half of it. On Windows no mode is set, and who can read them is whatever the folder grants, as for the source beside them.
* **The token never goes on a command line**, where `ps` shows it to every user on the machine. The opener reads it from the line kssrv prints once at start-up. It hands it to the browser inside a page ("The browser is handed a page, never the URL" below).
* **The token is put out only with `--show`**, which a person asks for at a terminal. A double-click sends the opener's output where others can read it, such as the system journal on Linux. So without `--show` the opener puts out the URL without its fragment: it says where the page is, and opens no file.

**Starting the browser:**

* **The opener tries the environment's tools in turn to start the browser, and always says how to open the page by hand.** Do not rely on one tool: where it is absent, nothing happens and nothing says so. The opener names the page it handed over, which opens the document in any browser. `--show` puts out the whole URL instead. Each environment has its own list (`OPENERS` / `OPENERS_WIN` in `tools/opener.kspl`).
* **On POSIX, a tool is looked up on the PATH before it is started.** There, starting even a missing tool succeeds in creating the child; the failure shows only inside the child. Judged by that alone, an environment without `xdg-open` "thinks it started one" and stops without trying the next tool. Windows refuses at once, so the lookup is not done there.
* **Do not mix the environments' tools in one list.** Windows does not look at the PATH, so a tool earlier in the list counts as handed over as soon as it starts. With `xdg-open` first, an environment where MSYS2 installed it reports success without starting any browser.
* **On Windows, the page goes to `explorer.exe`**, an executable that opens one file with the program the system holds for its type: the default browser for `.html`. Its path is written with `\`, the separator `explorer.exe` reads.
* **`cmd /c start` cannot be used.** Each argument is passed in its own quotation marks (`kspl_win_build_cmdline` in [`../../ksplc/gen/runtime/hosted_spawn.c`](../../ksplc/gen/runtime/hosted_spawn.c)), so `start` becomes `"start"`. cmd does not recognise an internal command in quotation marks (it says "`'"start"'` is not recognized as an internal or external command..."). Do not fix it by dropping the quoting: that function stops argument injection.
* **"Handed over" is not reported as "opened".** A tool can start successfully and still show nothing on the screen, like the `cmd` above, whose message reaches only the log. So even after handing the URL over, the opener prints how to open it by hand and where the messages are. Otherwise a run where nothing appeared would leave nothing to read.
* **The separator inside a URL is `/`.** A path from a double-click on Windows arrives with `\` (`parts\notes.ksmd`), so its `\` becomes `/`. This happens on Windows only. On POSIX, `\` can be part of a file name, and converting it everywhere would make such a document impossible to open.

**How it is installed and checked:**

* **The file association points at the built executable** (`out/ksmd_open.exe`, built by `make ksmd`), which finds kssrv beside itself. Do not point it at `ksplc run ...`: started by a double-click, its working folder is home or `/`, where neither `std/` nor `out/` can be found.
* **The opener exits once the URL is passed to a browser, and the server stays** for the next opening. Do not keep a process waiting for someone who is not watching a terminal: one would be left per document opened. Only with `--show` does it wait and pass the server's output through (`tools/tests/ksmd_launch.kspl` uses that).
* **The document to double-click is an example the tree keeps**, [`ksmd/examples/overview.ksmd`](../../ksmd/examples/overview.ksmd), which `make ksmd` names. It holds a table that calculates and an include, so the opened page shows both working. Nothing else checks that the association works. Started by a double-click, a refusal appears nowhere, so "a double-click does nothing" and "the document is broken" look alike.

**What it gives up**:

* **Only the servers in the record can be listed and stopped.** One started by hand (`kssrv --local`), or one that has stopped answering, is not reached. Ending it is left to the operating system's own tools.
* **Installing the association differs per environment** (the Windows registry, a Linux `.desktop` file, a macOS bundle). Only the Linux one is automatic: `make install` puts it in, through `make install-desktop`. The gates install it into a scratch folder and check the files there. Whether a double-click opens the document can be confirmed only on a desktop.
* **On Linux, the files go to the user's data folder**, `$XDG_DATA_HOME` or `~/.local/share`, where the desktop looks for them. A named `PREFIX` puts them under `$PREFIX/share` instead, so nothing reaches a system folder that the person did not name. The entry, the MIME declaration and the icon are copied, and the two caches are rebuilt where their tools exist. A missing tool is a note: the files are in place for the tool's next run.
* **Only the user's own install sets the default program** (`xdg-mime default`), which records the choice in the user's `mimeapps.list`. Under a named `PREFIX` other users can share the files, and the choice of program stays each user's.
* **On Windows, make writes no registry entry.** Windows keeps the default program for a file type as a choice that only its own "Open with" dialog sets. So the person ties the type there, once.

### The browser is handed a page, never the URL

**The URL carries the token, so the opener never puts it on the browser's command line.** **The browser is started on the path of a small page, which moves on to the URL at once** (`page_text` in [`../opener_aim.kspl`](../opener_aim.kspl)). The command line that starts a browser is open to every user while the starter runs. A browser started that way keeps it among its own arguments for as long as it runs.

The page moves on with a `refresh` (an HTML instruction to load another address). The fragment (the part after `#`) travels with it, so the page reads the token as from a URL typed by hand. The page offers the link too, for a browser that does not follow a `refresh`.

| Decision | Why |
| :-- | :-- |
| **Each run writes a page of its own** (`fs.write_unique`). | Several documents chosen and opened together start several openers at once, and one shared name would hand each browser the page written last. |
| **A page is removed by a later run, once it is older than `page_keep_s`** (`sweep_pages`). | The opener exits as soon as the browser is started, so nothing tells it when the page has been read. A cold browser can take a while to start. |
| **The page lies in `tmp/` next to the server, not in a hidden folder.** | A browser confined by its packaging (a snap) reads no hidden folder under home, and a page it cannot read opens nothing. |

**What it gives up**: the browser can run on another system than the opener (Windows' browser started from inside WSL). There it can fail to reach the page's path, and nothing opens. The URL that `--show` puts out is then the way in. Handing the URL over instead would put the token back on the command line.

### Listing and stopping the servers it left

**The server stays running after an opening, so the opener can also list those servers and stop them.** `--list` prints each running server's URL and the folder it serves, one per line; `--stop=<folder>` stops the one serving that folder, and `--stop-all` every one (`tend` in [`../opener.kspl`](../opener.kspl)). Without these, the only way to end a server before its idle time is to find its process and kill it.

**A server counts as running only when it answers with its token**, the test the reuse already makes. A record whose server does not answer is dropped from the record and never listed. Do not judge by a process number instead: a number outlives its process and is handed to the next one. A dead server would then be listed as running, and a stop would end an unrelated program.

**A server is picked by the folder it serves, not by its port.** The folder is what the reuse looks a server up by and what a person knows. The port changes from run to run, since a taken one is skipped. The folder is made absolute and loses a trailing separator first (`trim_end_sep` in [`../opener_aim.kspl`](../opener_aim.kspl)), so the one typed with tab completion is the one the record holds.

**A stop is asked of the server itself** (`POST /api/stop`, the rule in "Stopping it when asked" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)), with the token from the record. It is reported only once the server no longer answers. A stop that was only answered is not reported as done.

**The URL printed carries the token**, as the line `--show` prints at an opening does. It is what opens the page again, and whoever can run the opener can read the record anyway.

**Each mode stands alone.** A document or another option beside `--list`, `--stop` or `--stop-all` would do nothing, so the opener refuses it rather than ignoring it. A folder with no server is a failure, so a mistyped folder does not read as stopped. `--stop-all` with nothing running is not a failure.

### The opener opens no console, yet prints to the parent's

**On Windows the opener is built for the windowing subsystem, and attaches to the console it was started from when there is one.** (Windows marks each executable as a console program or a windowing program; a console program always gets a console window.) Double-clicked or opened from a document, it shows no black console window. Typed in a terminal, it still prints, to that terminal, the line saying which address to open. The generated entry point attaches to the parent's console before anything is written (`kspl_io_attach_console` in [`../../ksplc/gen/runtime/hosted.c`](../../ksplc/gen/runtime/hosted.c)).

**Two executables are ruled out**, because the choice would be made twice. Whoever types the name would make it once. The file association would make it again, and it is set once and never looked at again. The price is that the prompt returns before the last line, since a command processor does not wait for a windowing program. The opener prints a line or two and finishes.

**The server it starts gets no console window either.** A windowing program that starts a console program gets a fresh console window for the child. So hiding only the opener's window would move the black window rather than remove it (`spawn_redirect` in [`../../std/subproc.kspl`](../../std/subproc.kspl)). With no window to close, the server stops itself once no page holds it open: when the last ksmd tab closes.

Note: The server's output and the browser's are written beside the opener, under the names `LOG_EXT` / `Where.browser` in [`../opener.kspl`](../opener.kspl).

### Opening a `.ksmd` document

**ksmd's opener is a program of its own, `tools/ksmd_open.kspl`, built as `out/ksmd_open.exe`.** ksmd has no program to add an `open` command to: it is a library and a page. And only a leaf may know both kssrv and ksmd's page. So it is a program, sharing the opener's code. The file association points at the executable, for the reason given above.

ksmd needs two more things. One is a workspace that holds the document's includes. The other is the same port for that workspace on every run. The rules are in [`../opener_aim.kspl`](../opener_aim.kspl), each checked alone by [`../tests/ksmd_aim_test.kspl`](../tests/ksmd_aim_test.kspl).

**Which folder is the workspace:**

| Decision | Why |
| :-- | :-- |
| **The workspace is the nearest folder at or above the document that holds a file named `.ksmd-workspace`.** Without one, it is the document's own folder. `--workspace=<folder>` names it for one run instead | ksmd opens a document inside a folder the person chose. An include that climbs with `../` must stay inside that folder, so the document's folder alone would refuse it. The mark is the person's choice, kept in the folder: it moves with the folder, and no list of known folders goes stale |
| **Only `.ksmd-workspace` marks a workspace; a `.git` folder does not** | A repository at the home folder would then serve every file there to whoever holds the token. A mark is never set by accident |
| **`--workspace` exists beside the mark** | A person cannot always write a file into the folder: it can be read-only, or shared with others |
| **A path holding `..` is refused, not folded away.** `.` and doubled separators drop | The workspace and its port follow from the path's text, so one folder needs one spelling. Behind a link, `a/link/..` is another folder than `a`, so folding would open another file than the one named |
| **A document that is a link, or lies under a folder that is one, is refused before anything starts** | The server opens no link inside its root (`fs.stays_under`), so the page would be refused that document. The opener asks the same function, so the two cannot disagree |
| **A name not ending in `.ksmd` is refused, in any case** | Windows and the Linux MIME globs both hand `NOTES.KSMD` to the association. Another file reaches the opener only when typed or tied by mistake |

**Which port it gets:**

| Decision | Why |
| :-- | :-- |
| **The port is 20000 plus the FNV-1a hash of the workspace's absolute path, modulo 10000** (`home_port`) | The browser keeps drafts per address, the port included ("The file lifecycle" in [`ksmd/docs/DESIGN-ksmd.md`](../../ksmd/docs/DESIGN-ksmd.md)). A port that changed between runs would hide every draft held before |
| **The port is worked out, never remembered** | A record can be lost with `out/` or another clone. Worked out from the path, the port comes back the same with nothing kept |
| **Ports 20000 to 29999** | The OS hands out ports for outgoing connections from 32768 on Linux and 49152 on Windows and macOS. Development servers mostly take ports below 10000 |
| **Do not change the formula** | Every workspace would move, with its drafts. The test pins a few values, so a change fails it |
| **A running server for the workspace is reused, whatever its port** | As above. A server that started on another port keeps its drafts there until it stops |
| **A taken port is skipped, and the run says so.** The next free port of the 16 after it is used | Failing would leave the document unopened. The page cannot see another port's drafts, so the line says why they seem gone. Once the port is free again, the next run returns to it |

**What it gives up:**

* **Two workspaces can share a port.** With ten workspaces, the chance is about one in 200. While both run, the second one opened takes the next free port.
* **One folder spelt two ways is two workspaces**, such as another letter case on Windows or a path through a link. Each gets its own port, its own server and its own drafts.
* **Each opening shows a new browser tab.** The opener cannot ask a browser to bring forward a tab that another program opened. Two tabs on one document keep two drafts, so nothing is lost.
