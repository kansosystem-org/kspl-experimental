# tools — the design

**Why Kanso's own development tools are built the way they are.** It is for whoever changes a tool in `tools/`. What each file does is in the table in [`tools/README.md`](../README.md); the rules every document follows are in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md).

## Contents

* [The API record](#the-api-record)
* [The coding assistant](#the-coding-assistant)
* [The desktop opener](#the-desktop-opener)

---

## The API record

`tools/surface.kspls` and `surface_rows.kspls` write and check each package's API record (`SURFACE.txt`). The reference for reading is `ksplc doc`'s, which `pages` writes under `out/docs/` for browsing. What the gate checks is in "The record of a published API" in [`docs/SPEC-gates.md`](../../docs/SPEC-gates.md).

### Why the record and the reference are two renderings

Both render the lines of one walk (`surface_lines` in `ksplc/tools/surface.kspls`), so they cannot disagree.

**Only the record is committed.** It holds no rendering, so its diff means "the API changed" and nothing else: adding one function changes one line. If the reference were committed too, a change to the rendering would rewrite every page without publishing anything new. A copy of every description would also sit beside its source. Go splits it the same way: its `api/go1.txt` sits beside godoc rather than inside it. Why the reference is not committed at all is in "13.11 The reference is rendered when asked, not committed" in [`docs/DESIGN.md`](../../docs/DESIGN.md).

**The reference holds more than the record.** The rows of a parameter's and a return's `//<`, which `SURFACE.txt` leaves out ("Writing out the published API" in [`ksplc/docs/SPEC-tools.md`](../../ksplc/docs/SPEC-tools.md)), are the half of a reference a reader most needs. That is the one place where the two need different content, not only a different shape. The split is the same: share the walk, not the output.

**The pages under `out/docs/` are `ksplc doc`'s output and nothing else.** `pages` runs the command once per publishing file and once for the package. So a page cannot say anything the command would not, and no gate needs to check them.

**A file that cannot be read on its own stops the record.** A record missing a file would show every entry in it as removed.

## The coding assistant

`tools/ai_assist/` builds an AI that completes KSPL code: it makes the data, scores the completions and trains. What each file does is in [`tools/ai_assist/README.md`](../ai_assist/README.md); what is left to build is in [`tools/docs/PLAN.md`](PLAN.md).

### The approach: borrow for training, use KSPL for checking and serving

- **Training may borrow an existing model**: a large LLM, or LoRA fine-tuning of a small coding model (LoRA trains only a few added parameters).
- **Checking and serving are KSPL.** `ksplc` (compiling), `lint` and `fmt` are the checkers, and inference runs on `ksai` with safetensors weights (`ksai/examples/fim_coder` and `ksai/examples/qwen_infer`).
- **The compiler is the judge.** What is generated and trained on is checked and filtered mechanically. The main measure is the rate at which `ksplc` accepts a file once the completion is inserted, not a person's judgement.

**It lives in `tools/`, not in `ksai/`, because it imports nothing from the engine.** It starts the compiler and reads this repository as its corpus, so it runs only inside the whole tree. The engine's examples take the corpus and the tokenizer by path, and this folder runs them as processes.

### The implementation language: KSPL for the data, the evaluation and the gate

**Whatever reduces to the compiler oracle is KSPL.** Calling `ksplc` as a child process and judging the result needs no outside ML library; it uses `run_capture` in [`std/subproc.kspls`](../../std/subproc.kspls).

**What depends on the outside ML ecosystem stays in Python on purpose** (`transformers`, `peft`, `torch` and the like). Porting it would gain little, and it would lose its value as an outside reference for checking the KSPL code. Those helpers import the libraries inside a function, so a file loads without them.

### How a completion is scored

**A hole counts only where removing its line breaks compilation** (`eval_fim.kspls`). So the oracle scores 100% and the empty completion 0% by construction. A comment or a blank line compiles when empty, and counting it would let "nothing" pass.

**`fim_coder complete` returns several candidates, and the compiler chooses among them.** Choosing that way scores clearly higher than the greedy candidate alone, so `eval_fim --model=native` reports both: pass@1 (the greedy candidate) and pass@K (any of K candidates).

**A line the compiler accepts is not always the line meant.** Far fewer completions match the original line exactly, so the rate measures whether the code is valid KSPL, not whether it is right.

**Settings are compared by the held-out loss, not by the compiler's rate.** At this model size, retraining one setting with only the random seed changed moves the rate more than changing the optimizer or batch does. The held-out loss hardly moves. So `make fim-eval` prints the held-out loss (`fim_coder loss`) before the rates. The loss `train` prints is on its training data, so it cannot stand in for the held-out loss.

**The held-out loss is printed twice: over every position, and over the middle alone** (the hole's tokens and its end marker). The first is mostly the prefix and the suffix, which the model is given, not asked to write; the second is the task itself.

**Adam is the default optimizer** (`FIM_OPTIMIZER=sgd` selects SGD). At the default batch and step count, it reaches a lower held-out loss than SGD by more than two seeds of one setting differ, though its steps take longer.

### Why the assistant runs outside the language server

**The AI runs as its own process, not inside the language server.** A model inside the server's process costs resident memory and latency on every keystroke, and its crash takes the server down. Kept apart, the compiler is untouched and the seed is unaffected.

`fim_coder complete` fills a file of holes; nothing serves an editor as the user types. **An editor bridge is not built until the completions are worth its cost**: passing completions over, with a fallback on a timeout, adds work to every keystroke.

## The desktop opener

`tools/kspage_open.kspls` opens one `.kspage` document in kspage: it starts the local server, or reuses one, and passes the URL to a browser. The steps that tie the file type to it are in "Opening a `.kspage` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md#opening-a-kspage-document-on-a-double-click).

### Where the double-click opener lives

**The opener is a leaf** ([`../kspage_open.kspls`](../kspage_open.kspls)), because only a leaf may know both the server and the page. Packages refer to each other only in the direction of import. So `kssrv` knowing the `?doc=` shape, or `kspage` knowing how the server is started, would be a sideways reference ("Reference direction between documents" in [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md)).

**The page is served from outside the root** (`kssrv --page=<file>`). Do not copy the page into the user's folder. The server serves only what is under its root, so requiring the page there means copying a 2MB page into that folder at every opening. A read-only folder could not be opened at all. Why that one named file gives the client no more reach, and why it is never a folder, is in "Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

**For a document inside a KSPL tree, the tree's root is served**, and for any other document, its own folder. Serving only the document's folder would leave nothing beside the document reachable from the page, since the server refuses everything outside its root. `std/` marks a tree.

**A running server is reused, but only one serving the same folder, never one picked by its port number.** Do not start a server without looking: one per document multiplies, and their ports collide and are refused. A server for another folder cannot read the document. So the saved record holds a list of servers (`state_text` in `tools/kspage_aim.kspls`). Holding only one, it would lose the first as soon as a second started.

**The served folder is remembered as an absolute path.** `.` and `/home/me/devel` are one folder but two strings. Remembered as written, they make `make kspage` and the file association start two servers on the same tree.

**When the named port is taken, the next one is tried.** Giving up after one would make every document in another folder fail to open. The question is "can I listen", not "is someone listening", and it is tested with the same binding kssrv uses.

**A server counts as alive only when it accepts the token.** Do not trust an open port: any program may be listening there. On a local server, `/api/status` needs the token, so a 200 means the peer is kssrv.

The limit is that **the token is kept in a file**. Whoever can read the record (`out/tmp/kspage_open.state`) can read the token. That is the same reach as the source being edited, since the file lies where git does not look. On a shared machine, use it knowing that the reach differs.

**The token never goes on a command line**, where `ps` would show it and leak it. The opener reads it from the line kssrv prints once at start-up.

**The opener tries the environment's tools in turn to start the browser, and always prints the URL on one line.** Do not rely on one tool: where it is absent, nothing happens and nothing says so. The printed line opens the document even where no browser could be started. Each environment has its own list (`openers` / `openers_win` in `tools/kspage_open.kspls`).

**On POSIX, a tool is looked up on the PATH before it is started.** There, even a missing tool succeeds in creating the child; the failure shows only inside the child. Judged by that alone, an environment without `xdg-open` "thinks it started one" and stops without trying the next tool. Windows refuses at once, so the lookup is not done there.

**Do not mix the environments' tools in one list.** Windows does not look at the PATH, so a tool earlier in the list counts as handed over as soon as it starts. With `xdg-open` first, an environment where MSYS2 installed it reports success without starting any browser.

**On Windows, the URL goes to `explorer.exe`**, an executable that passes one URL on to the default browser. `cmd /c start` cannot be used. Each argument is passed in its own quotation marks (`kspl_win_build_cmdline` in [`../../ksplc/gen/runtime/hosted_spawn.c`](../../ksplc/gen/runtime/hosted_spawn.c)), so `start` becomes `"start"`. cmd does not recognise an internal command in quotation marks (it says "`'"start"'` is not recognized as an internal or external command..."). Do not fix it by dropping the quoting: that function stops argument injection.

**"Handed over" is not reported as "opened".** A tool can start successfully and still show nothing on the screen, like the `cmd` above, whose message reaches only the log. So even after handing the URL over, the opener prints how to open it by hand and where the messages are. Otherwise a run where nothing appeared would leave nothing to read.

**The separator inside a URL is `/`.** A path from a double-click on Windows arrives as `out\sample.kspage`, so its `\` becomes `/`. This happens on Windows only: on POSIX, `\` may be part of a file name, and converting it everywhere would make such a document impossible to open.

**The file association points at the built executable** (`out/kspage_open.exe`, built by `make kspage`), which finds kssrv beside itself. Do not point it at `ksplc run ...`: started by a double-click, its working folder is home or `/`, where neither `std/` nor `out/` can be found.

**The opener exits once the URL is passed to a browser, and the server stays** for the next opening. Do not keep a process waiting for someone who is not watching a terminal: one would be left per document opened. Only with `--show` does it wait and pass the server's output through (`make kspage` uses that).

**The document to double-click is built by `make` too** ([`../kspage_doc.kspls`](../kspage_doc.kspls) writes `out/sample.kspage`, and `make kspage` depends on it). Do not write a `.kspage` by hand. Nothing else checks that the association works, and with a path one character off, "a double-click does nothing" and "the document is broken" look alike: started by a double-click, the refusal appears nowhere.

**It is not the sample shown at start-up.** That one is [`kspage/content/sample.kspls`](../../kspage/content/sample.kspls) (`ensure` in `kspage/port/web/state.kspls`), so with it, a run that read the file and one that did not would look the same. It is the `.kspage` of the fuzzing seed ([`kspage/tests/seeds.kspls`](../../kspage/tests/seeds.kspls)), built to hold one of every shape: a merged table, a heading depth, a column set, a number format. So a path that drops any of them shows it. kspage publishes nothing for this ("What kspage publishes for the opener" in [`kspage/docs/DESIGN.md`](../../kspage/docs/DESIGN.md)).

**What it gives up**:

* **Only the servers in the record can be listed and stopped.** One started by hand (`kssrv --local`), one whose record fell past the cap, or one that has stopped answering is not reached; ending it is left to the operating system's own tools.
* **Installing the association differs per environment** (the Windows registry, a Linux `.desktop` file, a macOS bundle). `make kspage` can assemble the Linux one and check it with `desktop-file-validate`, but whether a double-click opens the document can be confirmed only on a desktop.

### Listing and stopping the servers it left

**`--list` prints each running server's URL and the folder it serves, one per line; `--stop=<folder>` stops the one serving that folder, and `--stop-all` every one** (`tend` in [`../kspage_open.kspls`](../kspage_open.kspls)). The server stays up for the next opening, so without these the only way to end one before its idle time is to find its process and kill it.

**A server counts as running only when it answers with its token**, the test the reuse already makes. A record whose server does not answer is dropped from the record and never listed. Do not judge by a process number instead: a number outlives its process and is handed to the next one, so a dead server would be listed as running and a stop would end an unrelated program.

**A server is picked by the folder it serves, not by its port.** The folder is what the reuse looks a server up by and what a person knows; the port changes from run to run, since a taken one is skipped. The folder is made absolute and loses a trailing separator first (`trim_end_sep` in [`../kspage_aim.kspls`](../kspage_aim.kspls)), so the one typed with tab completion is the one the record holds.

**A stop is asked of the server itself** (`POST /api/stop`, the rule in "Stopping it when asked" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)), with the token from the record, and reported only once the server no longer answers. A stop that was only answered is not reported as done.

**The URL printed carries the token**, as the line printed at an opening does: it is what opens the page again, and whoever can run the opener can read the record anyway.

**Each mode stands alone.** A document or another option beside `--list`, `--stop` or `--stop-all` would do nothing, so the opener refuses it rather than ignoring it. A folder with no server is a failure, so a mistyped folder does not read as stopped; `--stop-all` with nothing running is not.

### The opener opens no console, yet prints to the one it was started from

**The opener is built for the windowing subsystem, and attaches to the console it was started from when there is one.** Opened from a document, it shows no window. Typed in a terminal, it still prints the line saying which address to open, because the generated entry point attaches to the parent's console before anything is written (`kspl_io_attach_console` in [`../../ksplc/gen/runtime/hosted.c`](../../ksplc/gen/runtime/hosted.c)).

**Two executables are ruled out**, because the choice would be made twice: once by whoever types the name, and once by the file association, which is set once and never looked at again. The price is that the prompt returns before the last line, since a command processor does not wait for a windowing program. The opener prints a line or two and finishes.

**The server it starts gets no console window either.** A windowing program that starts a console program gets a fresh console window for the child. So hiding only the opener's window would move the black window rather than remove it (`spawn_redirect` in [`../../std/subproc.kspls`](../../std/subproc.kspls)). With no window to close, the server stops itself once no page holds it open: when the last kspage tab closes.

Note: The server's output and the browser's are written beside the opener, under the names `log_rel` / `browser_rel` in [`../kspage_open.kspls`](../kspage_open.kspls).
