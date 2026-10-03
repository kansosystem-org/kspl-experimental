# tools — Kanso's own development tools

**Tools for the repository's own development, written in KSPL wherever possible.** Nothing here ships with the compiler. Each runs from the tree with `ksplc run tools/<name>.kspls`, or through the make target named beside it.

## Contents

* [Run it](#run-it)
* [What is here](#what-is-here)
* [Files near the limit and how they split](#files-near-the-limit-and-how-they-split)
* [Further reading](#further-reading)

---

## Run it

```sh
./out/ksplc_stage1.exe run tools/repo_stat.kspls   # the repository's size -> out/repo_stat.txt
```

## What is here

| File | What it does |
| :-- | :-- |
| `surface.kspls` / `surface_rows.kspls` | Writes and checks a package's API record (`<package>/SURFACE.txt`); `pages` writes `ksplc doc`'s reference under `out/docs/` for browsing. `make surface` regenerates the record and the pages; `make test-surface` fails on a drifted record. Why only the record is committed is in "Why the record and the reference are two renderings" in [`tools/docs/DESIGN.md`](docs/DESIGN.md). |
| `tour.kspls` / `tour_page.kspls` | The tour of the language, generated from its program: `make tour` regenerates it, `make test-docs` fails on a drift. |
| `code_table.kspls` / `code_rows.kspls` | The table of diagnostic codes in `ksplc/docs/SPEC-tools.md`, generated from the code sections below it: `make code-table` regenerates it, `make test-conventions` fails on a drift. |
| `repo_stat.kspls` / `repo_stat_path.kspls` | Writes the repository's size as one page of text, counting the files git lists: the tracked, and the untracked that are not ignored. |
| `kspage_open.kspls` / `kspage_aim.kspls` / `kspage_doc.kspls` | Opening one document in kspage: the server, the URL, and the document to double-click (`make kspage-open`, `make kspage`). `out/kspage_open.exe --list` shows the servers it left running, `--stop=<folder>` stops one and `--stop-all` every one. Its design is in "The desktop opener" in [`tools/docs/DESIGN.md`](docs/DESIGN.md). |
| `kspage_plugin_sort.kspls` | A kspage plugin, and the worked example of one. |
| `lsp_client.kspls` / `lsp_place.kspls` | Asking `ksplc lsp` once by hand, and the position passed to it. |
| `mqtt_stub.kspls` | The MQTT peer the car's probes talk to. |
| `kspl_lldb.py` | The LLDB pretty printer: readable slices, `Result`s and structs while debugging. |
| `ai_assist/` | The coding assistant's data, evaluation and training pipeline, with its own tests ([its guide](ai_assist/README.md)). |
| `release-assets/` | What the release zip carries beside the executable (its own `README.md` and the `.vscode/` settings), copied in by `.github/workflows/release.yml`. |
| `tests/` | One test file per tool: `surface_test.kspls`, `tour_page_test.kspls`, `code_rows_test.kspls`, `repo_stat_test.kspls`, `aim_test.kspls` (the URL that opens kspage), and `lsp_place_test.kspls`. `all.kspls` runs them, and `ai_assist/tests/` too (`make debug-tools`). |
| `docs/` | This folder's documents: the design and what is left ([its index](docs/README.md)). |

## Files near the limit and how they split

No file in tools exceeds 900 lines.

## Further reading

| Document | What it holds |
| :-- | :-- |
| [`tools/docs/DESIGN.md`](docs/DESIGN.md) | Why the tools are built the way they are: the API record, the coding assistant, the desktop opener. |
| [`tools/docs/PLAN.md`](docs/PLAN.md) | What is left of the coding assistant. |
| [`tools/ai_assist/README.md`](ai_assist/README.md) | The coding assistant's files, and how to run its pipeline. |
| [`../docs/DESIGN.md`](../docs/DESIGN.md) | The Development Principles, and why a leaf points only upward. |

Every document here is for whoever changes Kanso's own tools.
