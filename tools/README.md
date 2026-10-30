# tools — Kanso's own development tools

**Tools for working on this repository, written in KSPL wherever possible.** They are for whoever changes Kanso: they regenerate documents, run the CI's gates, and help with debugging. Nothing here ships with the compiler. Each runs from the tree with `ksplc run tools/<name>.kspl`, or through the make target named beside it.

## Run it

After `make` has built the compiler, this writes the repository's size to `out/repo_stat.txt`:

```sh
./out/ksplc_stage1.exe run tools/repo_stat.kspl   # the repository's size -> out/repo_stat.txt
```

## What is here

Most tools come in pairs: the program holds `main`, and a second file holds what its test imports, so the test does not pull in that `main`.

| File | What it does |
| :-- | :-- |
| **Documents generated from the source** | |
| `surface.kspl` / `surface_rows.kspl` | Writes and checks a package's API record (`<package>/SURFACE.txt`), the list of every name the package publishes. `pages` writes `ksplc doc`'s reference under `out/docs/`. `make surface` regenerates both; `make test-surface` fails on a record that no longer matches the source. |
| `tutorial.kspl` / `tutorial_page.kspl` | The tour of the language (`docs/TUTORIAL-programming-language.md`), generated from its program by `make tutorial`. `make test-docs` fails on a drift, or when the page's code blocks, joined in order, do not run as the program does. |
| **The repository and its CI** | |
| `seed_sum.kspl` | Records which compiler source `ksplc/seed.c` was taken from (`make commit-seed`), and checks the tree still holds it (`make test-seed-sum`). |
| `repo_stat.kspl` / `repo_stat_path.kspl` | Writes the repository's size as one page of text, over the files git tracks or does not ignore. It totals functional code, test code, tooling and prose apart. |
| `ci.kspl` / `ci_gates.kspl` | The CI's gate table and runner. `make ci` runs what the host runs natively, and `make ci-summary` asks for the job's summary page. How the gates are read is in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md). |
| `make_explain.kspl` / `make_settings.kspl` / `make_db.kspl` | Says what one make target is made of (`make explain T=<target>`): its rule, prerequisites, commands filled in, variables and settings, all asked of make. `make_settings.kspl` runs make and names who receives each setting; `make_db.kspl` reads make's database and make files. Its design is "Explaining a make target" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `msys2-packages.txt` | The MSYS2 UCRT64 packages `make ci` needs on Windows. CI, the release's Windows build (`.github/actions/msys2-ucrt64/`) and "The environment for each platform" in [`docs/HOWTO-build.md`](../docs/HOWTO-build.md) all read this one list. |
| **Editing and debugging** | |
| `ksmd.kspl` | Opens one `.ksmd` document in ksmd, the document editor (`make ksmd-open`, `make ksmd`), serving its workspace on that workspace's own port. `--list`, `--stop=<folder>` and `--stop-all` tend its servers. Its design is "The desktop opener" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `ksagent_chat.kspl` | Asks about a folder in one command (`make chat`): the model server, the chat page, then `ksagent watch` until Ctrl+C. `--show`, `--list`, `--stop=<folder>` and `--stop-all` work as ksmd's opener's do. Its design is "Opening the chat page" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `model_server.kspl` | Uses the model server that answers where ksagent asks, or starts `llama-server` or `chat_server` and waits until it is ready. Its design is "Starting the model server" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `opener.kspl` / `opener_aim.kspl` | What the two openers share: finding or starting the local server, handing the URL to a browser, and listing and stopping servers. `opener_aim.kspl` holds the rules a test checks alone: what each opener opens (`App`), the paths, the URL, the workspace and its port. |
| `kspl_lldb.py` | The LLDB pretty printer: it shows slices, `Result`s and structs in readable form while debugging. |
| **Folders** | |
| `ai_assist/` | The coding assistant's data, evaluation and training pipeline, with its own tests ([its guide](ai_assist/README.md)). |
| `release-assets/` | What the release zip carries beside the executable (its own `README.md` and the `.vscode/` settings), copied in by `.github/workflows/release.yml`. |
| `tests/` | The tools' tests. `page_test.kspl` covers the URL that opens a document, the surface listing and the tour page. `repo_test.kspl` covers the file statistics and the CI's sets. `ksmd_aim_test.kspl` covers the rules of ksmd's opener. `make_explain_test.kspl` holds `make explain`'s answers to `make -pn` and `make -n`, on real targets and a fixture of its own. `all.kspl` runs them and `ai_assist/tests/`; `main.kspl` gives them a `main` for `make debug-tools`. `ksmd_launch.kspl` (`make test-ksmd-open`) starts ksmd's opener on scratch workspaces and asks each server it started. `chat_launch.mjs` and `chat_page.mjs` (`make test-ksagent-chat`) check the launcher's model server, then drive ksagent's chat page in a headless Chromium, through kssrv and `ksagent watch`. `chat_support.mjs` holds their stand-in model server. |
| `docs/` | The design ("Further reading" below). |

## Further reading

Every document here is for whoever changes Kanso's own tools.

| Document | What it holds |
| :-- | :-- |
| [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md) | Why the tools are built the way they are: the API record, `make explain`, the coding assistant, the desktop opener, the chat page's opener. |
| The "tools" section of [`docs/PLAN.md`](../docs/PLAN.md) | What is left of the coding assistant. |
| [`tools/ai_assist/README.md`](ai_assist/README.md) | The coding assistant's files, and how to run its pipeline. |
| [`../docs/DESIGN-principles.md`](../docs/DESIGN-principles.md) | The Development Principles, and why a leaf (a folder such as `tools/` that only points upward at the packages) points only upward. |
