# tools — programs that use more than one package

**Programs that need more than one package and `std`, and the data files beside them, written in KSPL wherever possible.** Most are for whoever changes Kanso: they regenerate documents and run the CI's gates. Some reach the end user as well. Where ksmd can be built, `make install` builds `ksmd.kspl` into `ksmd.exe` and installs it. `make chat` starts `ksagent_chat.kspl`. The release zip carries `kspl_lldb.py` and the contents of `release-assets/`. Each program runs from the tree with `ksplc run tools/<name>.kspl`, or through the make target named beside it.

## What is here

Most tools come in pairs: the program holds `main`, and a second file holds what its test imports, so the test does not pull in that `main`.

| File | What it does |
| :-- | :-- |
| **Document generators** | |
| `surface.kspl` / `surface_rows.kspl` | Writes and checks a package's API record (`<package>/SURFACE.txt`), the list of every name the package publishes. `pages` writes `ksplc doc`'s reference under `out/docs/`. `make surface` regenerates both; `make test-surface` fails on a record that no longer matches the source. |
| `tutorial.kspl` / `tutorial_page.kspl` | The language tutorial (`docs/TUTORIAL-programming-language.md`), generated from its program by `make tutorial`. `make test-docs` fails on a drift, or when the page's code blocks, joined in order, do not run as the program does. |
| **The repository and its CI** | |
| `seed_sum.kspl` | Records which compiler source `ksplc/seed.c` was taken from (`make commit-seed`), and checks the tree still holds it (`make test-seed-sum`). |
| `ci.kspl` / `ci_gates.kspl` | The CI's gate table and runner. `make ci` runs every gate the host can answer, and `make ci-summary` asks for the job's summary page. How the gates are read is in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md). |
| `make_db.kspl` | Reads make's database and the make files' own lines. The root's checks of the make names in documents and of the make files' text use it. |
| **Launchers for the user** | |
| `ksmd.kspl` | Opens one `.ksmd` document in ksmd, the document editor (`make ksmd-open`, `make ksmd`), serving its workspace on that workspace's own port. `--list`, `--stop=<folder>` and `--stop-all` tend its servers. `--check` opens nothing, and prints what ksmd refuses in the document and what its formulas give. Its commands are [`ksmd/docs/SPEC-commands.md`](../ksmd/docs/SPEC-commands.md). Its design is "The desktop opener" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `ksagent_chat.kspl` | Asks about a folder in one command (`make chat`): the model server, the chat page, then `ksagent watch` until Ctrl+C. `--show`, `--list`, `--stop=<folder>` and `--stop-all` work as ksmd's opener's do. Its design is "Opening the chat page" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `model_server.kspl` | Uses the model server that answers where ksagent asks, or starts `llama-server` or `chat_server` and waits until it is ready. Its design is "Starting the model server" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `opener.kspl` / `opener_aim.kspl` | What the two openers share: finding or starting the local server, handing the URL to a browser, and listing and stopping servers. `opener_aim.kspl` holds the rules a test checks alone: what each opener opens (`App`), the paths, the URL, the workspace and its port. |
| **For the user's debugger** | |
| `kspl_lldb.py` | The LLDB pretty printer. While debugging, it shows slices, lists, maps, strings, `Option`s, `Result`s, enums and trait values in readable form, and it stops the program on a panic. The release zip carries it. Its self-test (`make test-pytools`) builds `tests/lldb_sample.kspl`, checks the printer's names against its C, and runs the printer in LLDB on it. |
| **Data that other programs read** | |
| `msys2-packages.txt`, `msys2-packages-full.txt` | The MSYS2 UCRT64 packages CI's Windows job needs. CI, the release's Windows build (`.github/actions/msys2-ucrt64/`) and "The environment for each platform" in [`docs/HOWTO-build.md`](../docs/HOWTO-build.md) all read this one list. The second list adds what `make ci` uses on Windows for the gates CI runs on Linux alone. |
| `release-assets/` | What the release zip carries beside the executable (its own `README.md` and the `.vscode/` settings), copied in by `.github/workflows/release.yml`. |
| **Folders** | |
| `tests/` | The tools' tests. `page_test.kspl` covers the URL that opens a document, the surface listing and the tutorial page. `repo_test.kspl` covers the CI's sets. `aim_rows_test.kspl` checks the rows of `docs/SPEC-opener-aim.ksmd` against the code. `ksmd_aim_test.kspl` covers the other rules of ksmd's opener, and `opener_test.kspl` how it gives up on a server. `all.kspl` runs them; `main.kspl` gives them a `main` for `make debug-tools`. `lldb_sample.kspl` is the program `kspl_lldb.py`'s self-test debugs. `ksmd_launch.kspl` (`make test-ksmd-open`) starts ksmd's opener on scratch workspaces and asks each server it started. `chat_launch.mjs` and `chat_page.mjs` (`make test-ksagent-chat`) check the launcher's model server, then drive ksagent's chat page in a headless Chromium, through kssrv and `ksagent watch`. `chat_support.mjs` holds their stand-in model server. |
| `docs/` | The design, and the opener's rules as rows ("Further reading" below). |

## Changing a rule of the opener

**The opener's rules stand as table rows in [`docs/SPEC-opener-aim.ksmd`](docs/SPEC-opener-aim.ksmd), and a test holds each row to the code.**

1. **Run the test**: `make debug-tools`. It ends with `RESULT: ALL PASS` when every row holds.
2. **Read a failure**: it names the row's line, as `tools/docs/SPEC-opener-aim.ksmd:49: plain of "/a/b/" gives "/a/b", but the row's Plain says "/a/b/"`.
3. **Change a rule**: change or add its row first, run the test, and see it fail. Then change `opener_aim.kspl` until it passes.
4. **Add a table** for a new function: bind its name in `tests/aim_rows_test.kspl` too. A table no binding names fails the test.
5. **Check the document alone**: `ksmd --check tools/docs/SPEC-opener-aim.ksmd` says whether ksmd reads it. It runs no code, so it does not check the rows against the opener.

Open the document as a page with `make ksmd-open FILE=tools/docs/SPEC-opener-aim.ksmd`.

## Further reading

Every document here is for whoever changes Kanso's own tools.

| Document | What it holds |
| :-- | :-- |
| [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md) | Why the tools are built the way they are: the API record, the desktop opener, the chat page's opener. |
| [`tools/docs/SPEC-opener-aim.ksmd`](docs/SPEC-opener-aim.ksmd) | The rules of ksmd's opener that a table can hold: a workspace's port, which files open, a path's one spelling. Its test checks each row. Open it in ksmd to read it as a page. |
| [`../docs/DESIGN-principles.md`](../docs/DESIGN-principles.md) | The Development Principles, and why a leaf (a folder such as `tools/` that only points upward at the packages) points only upward. |
