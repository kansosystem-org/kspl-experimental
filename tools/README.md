# tools — Kanso's own development tools

**Tools for working on this repository, written in KSPL wherever possible.** They are for whoever changes Kanso: they regenerate documents, run the CI's gates, and help with debugging. Nothing here ships with the compiler. Each runs from the tree with `ksplc run tools/<name>.kspl`, or through the make target named beside it.

## Run it

After `make` has built the compiler, this writes the repository's size to `out/repo_stat.txt`:

```sh
./out/ksplc_stage1.exe run tools/repo_stat.kspl   # the repository's size -> out/repo_stat.txt
```

## What is here

Most tools come in pairs. The program you run holds `main`. A second file holds what its test imports. The two are kept apart so that the test does not pull in that `main`. The table groups them by what they are for.

| File | What it does |
| :-- | :-- |
| **Documents generated from the source** | |
| `surface.kspl` / `surface_rows.kspl` | Writes and checks a package's API record (`<package>/SURFACE.txt`), the list of every name the package publishes. `pages` writes `ksplc doc`'s reference under `out/docs/` for browsing. `make surface` regenerates the record and the pages; `make test-surface` fails on a drifted record (one that no longer matches the source). Why only the record is committed is in "Why the record and the reference are two renderings" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `tutorial.kspl` / `tutorial_page.kspl` | The tour of the language (`docs/TUTORIAL.md`), generated from its program. `make tutorial` regenerates it. `make test-docs` fails on a drift. It also fails when the page's code blocks, joined in order, do not run as the program does. |
| **The repository and its CI** | |
| `seed_sum.kspl` | Records which compiler source `ksplc/seed.c` was taken from (`make commit-seed`), and checks the tree still holds it (`make test-seed-sum`), so a change under `ksplc/` that skipped the re-bake fails a gate. |
| `repo_stat.kspl` / `repo_stat_path.kspl` | Writes the repository's size as one page of text, counting the files git lists: the tracked, and the untracked that are not ignored. It totals each file's role apart: functional code, test code, tooling and prose. |
| `ci.kspl` / `ci_gates.kspl` | The CI's gate table and runner. `make ci` runs what the host runs natively: core and rest everywhere, and the Linux-only gates on Linux. `make ci-summary` asks for the job's summary page. How the gates are read is in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md). |
| `msys2-packages.txt` | The MSYS2 UCRT64 packages `make ci` needs on Windows. CI's Windows job and the release's Windows build install it through `.github/actions/msys2-ucrt64/`. "The environment for each platform" in [`docs/HOWTO-build.md`](../docs/HOWTO-build.md) installs it by hand. Both read this one list, so the two cannot drift apart. |
| **Editing and debugging** | |
| `kspage_open.kspl` / `kspage_aim.kspl` | Opening one document in kspage, the document editor written in KSPL: the server and the URL (`make kspage-open`, `make kspage`). `out/kspage_open.exe --list` shows the servers it left running, `--stop=<folder>` stops one and `--stop-all` every one. Its design is in "The desktop opener" in [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md). |
| `kspl_lldb.py` | The LLDB pretty printer: it shows slices, `Result`s and structs in readable form while debugging. |
| **Folders** | |
| `ai_assist/` | The coding assistant's data, evaluation and training pipeline, with its own tests ([its guide](ai_assist/README.md)). |
| `release-assets/` | What the release zip carries beside the executable (its own `README.md` and the `.vscode/` settings), copied in by `.github/workflows/release.yml`. |
| `tests/` | The tools' tests, in two files by subject. `page_test.kspl` covers the URL that opens kspage, the surface listing and the tour page. `repo_test.kspl` covers the repository's file statistics, and how the CI's sets are dealt out and summed up. `all.kspl` runs them, and `ai_assist/tests/` too; `main.kspl` gives them a `main` for `make debug-tools`. `open_together.kspl` is a program of its own, which starts two openers at once on the built opener and server (`make test-kspage-open`). |
| `docs/` | This folder's document: the design ("Further reading" below). |

## Files near the limit and how they split

No file in tools exceeds 900 lines.

## Further reading

Every document here is for whoever changes Kanso's own tools.

| Document | What it holds |
| :-- | :-- |
| [`tools/docs/DESIGN-tools.md`](docs/DESIGN-tools.md) | Why the tools are built the way they are: the API record, the coding assistant, the desktop opener. |
| The "tools" section of [`docs/PLAN.md`](../docs/PLAN.md) | What is left of the coding assistant. |
| [`tools/ai_assist/README.md`](ai_assist/README.md) | The coding assistant's files, and how to run its pipeline. |
| [`../docs/DESIGN-principles.md`](../docs/DESIGN-principles.md) | The Development Principles, and why a leaf (a folder such as `tools/` that only points upward at the packages) points only upward. |
