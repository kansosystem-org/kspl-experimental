# tools — Kanso's own development tools

**Tools for working on this repository, written in KSPL wherever possible.** They are for whoever changes Kanso: they regenerate documents, run the CI's gates, and help with debugging. Nothing here ships with the compiler. Each runs from the tree with `ksplc run tools/<name>.kspls`, or through the make target named beside it.

## Run it

After `make` has built the compiler, this writes the repository's size to `out/repo_stat.txt`:

```sh
./out/ksplc_stage1.exe run tools/repo_stat.kspls   # the repository's size -> out/repo_stat.txt
```

## What is here

Most tools come in pairs: the program you run, which holds `main`, and a second file its test imports, kept apart so the test does not pull in that `main`. The table groups them by what they are for.

| File | What it does |
| :-- | :-- |
| **Documents generated from the source** | |
| `surface.kspls` / `surface_rows.kspls` | Writes and checks a package's API record (`<package>/SURFACE.txt`), the list of every name the package publishes. `pages` writes `ksplc doc`'s reference under `out/docs/` for browsing. `make surface` regenerates the record and the pages; `make test-surface` fails on a drifted record (one that no longer matches the source). Why only the record is committed is in "Why the record and the reference are two renderings" in [`tools/docs/DESIGN.md`](docs/DESIGN.md). |
| `tour.kspls` / `tour_page.kspls` | The tour of the language (`docs/TOUR.md`), generated from its program: `make tour` regenerates it, `make test-docs` fails on a drift. |
| **The repository and its CI** | |
| `repo_stat.kspls` / `repo_stat_path.kspls` | Writes the repository's size as one page of text, counting the files git lists: the tracked, and the untracked that are not ignored. |
| `ci.kspls` / `ci_gates.kspls` | The CI's gates (the checks that can fail a build): one table of what each asks `make` for and which job runs it, and the runner `make ci` and its siblings call with their own name. `make ci-summary` asks it for the job's summary page. How the gates are read is in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md). |
| **Editing and debugging** | |
| `kspage_open.kspls` / `kspage_aim.kspls` / `kspage_doc.kspls` | Opening one document in kspage, the document editor written in KSPL: the server, the URL, and the document to double-click (`make kspage-open`, `make kspage`). `out/kspage_open.exe --list` shows the servers it left running, `--stop=<folder>` stops one and `--stop-all` every one. Its design is in "The desktop opener" in [`tools/docs/DESIGN.md`](docs/DESIGN.md). |
| `kspl_lldb.py` | The LLDB pretty printer: it shows slices, `Result`s and structs in readable form while debugging. |
| **Folders** | |
| `ai_assist/` | The coding assistant's data, evaluation and training pipeline, with its own tests ([its guide](ai_assist/README.md)). |
| `release-assets/` | What the release zip carries beside the executable (its own `README.md` and the `.vscode/` settings), copied in by `.github/workflows/release.yml`. |
| `tests/` | The tools' tests, two files by subject: `page_test.kspls` (the URL that opens kspage, the surface listing and the tour page) and `repo_test.kspls` (the repository's file statistics, and how the CI's sets are dealt out and summed up). `all.kspls` runs them, and `ai_assist/tests/` too; `main.kspls` gives them a `main` for `make debug-tools`. |
| `docs/` | This folder's document: the design ("Further reading" below). |

## Files near the limit and how they split

No file in tools exceeds 900 lines.

## Further reading

Every document here is for whoever changes Kanso's own tools.

| Document | What it holds |
| :-- | :-- |
| [`tools/docs/DESIGN.md`](docs/DESIGN.md) | Why the tools are built the way they are: the API record, the coding assistant, the desktop opener. |
| The "tools" section of [`docs/PLAN.md`](../docs/PLAN.md) | What is left of the coding assistant. |
| [`tools/ai_assist/README.md`](ai_assist/README.md) | The coding assistant's files, and how to run its pipeline. |
| [`../docs/DESIGN.md`](../docs/DESIGN.md) | The Development Principles, and why a leaf (a folder such as `tools/` that only points upward at the packages) points only upward. |
