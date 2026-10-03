# tests

**The repository's suites live here.** `make ci` runs everything here. How to write a suite is in [`tests/docs/HOWTO-write-a-suite.md`](docs/HOWTO-write-a-suite.md); why the suites are built this way is in [`tests/docs/DESIGN.md`](docs/DESIGN.md).

## Contents

* [Run it](#run-it)
* [Placement and naming](#placement-and-naming)
* [The suites](#the-suites)
* [The tools in tests/tools](#the-tools-in-teststools)
* [The fixture folders](#the-fixture-folders)
* [Files near the limit and how they split](#files-near-the-limit-and-how-they-split)
* [Further reading](#further-reading)

---

## Run it

```sh
make test-conventions   # one suite: the conventions the documents state hold in the tree
make test-suites        # every suite here and in ksplc's folder, in parallel under make -j
```

## Placement and naming

| Folder | What lives there |
|---|---|
| `tests/suite/` | One suite that runs with no arguments. `make test-<name>` calls it |
| `tests/support/` | The code a suite reads. Not what it runs against |
| `tests/tools/` | A tool `make` calls directly, passing its subject as an argument (a file or log to inspect, a package to carve) |
| `tests/debug/` | `make debug`'s entry point: `main.kspls` sets the order, `parts.kspls` calls each package's `tests/all` in turn, and `pkg/` holds the entry points that run one package (`make debug-<name>`) |
| `tests/freestanding/` | Fixtures checked the same way, in one folder |
| `tests/docs/` | This folder's documents ([its index](docs/README.md)) |

**Do not put a `.kspls` directly under `tests/`**: its name would not say whether `make` runs it or it is material. Only this guide and `ksplc.cfg` live there. Settings are found by walking upwards, so they must be here to cover all of `tests/`.

Inside `tests/support/`, the name splits the files in two.

| Name | Role |
|---|---|
| `harness*` | The foundation every suite shares. **A fix here reaches every suite here** |
| `<suite name>_<subject>` | A piece for that suite alone, used from `tests/suite/` |

Caution: **Do not put a foundation under a name other than `harness`.** Then the name does not say whether a file is shared or exclusive, and nobody can tell how far a fix reaches.

The foundation is split by the reason for reading it.

| File | The reason to read it |
|---|---|
| `harness` | Finding the root, a suite's start and end (the verdict lines are `std/verdict`'s), starting a process, a temporary folder, the files git knows |
| `harness_text` | Looking at strings (one UTF-8 character, a word boundary, folding newlines to LF, searching for a string) |
| `harness_refs` | Where a text names a file and where the name points. The reference check (`test-docref`) and the carving (`make carve`, which re-points names that leave a package) read it alike |

The compiler's suites have their own foundation in ksplc's folder, including the build helper and the runner of `EXPECT:` fixtures ([ksplc](../ksplc/README.md)).

## The suites

**The list of suites is `SUITES` in [`mk/test.mk`](../mk/test.mk)**, and `make help` prints one line for each target. Each suite's opening comment says what it pins down.

**Suites that check only the compiler live in ksplc's folder** ([`ksplc/README.md`](../ksplc/README.md)), and `make test-<name>` runs them from here too. What stays here reads more than one package ("What stays in the root tests folder" in [`tests/docs/DESIGN.md`](docs/DESIGN.md)).

**Fuzzing is each package's own `make test-fuzz`**, run from here as `make test-std-fuzz` / `test-kspage-fuzz` / `test-ksai-fuzz` (ksplc's as `make test-fuzz`), with seeds read from the repository root.

## The tools in tests/tools

| Thing | How it is called |
|---|---|
| `tests/tools/llvm_ir_abi_check.kspls` | `make test-llvm-abi` passes it the generated `.ll` files. They must include one whose `main` returns a Result, since no other program exercises the entry point's failure path |
| `tests/tools/perf_guard.kspls` | `make ci` passes it the build log at the end (reference values in `perf_baseline.json`) |
| `tests/tools/carve.kspls` | `make carve PKG=<package> [DEST=<place>] [URL=<address>]` carves the package into a read-only copy of its own (the tool's header says what the copy holds) and sends nothing anywhere. `make test-carve` checks ksdb's carving |
| `tests/tools/mutants.kspls` | `make test-mutants FILE=<file> [MAX=n]` drops one guard, runs the tests, and sees whether they catch it. **Not a gate**; how to read its report is in "Reading the mutants report" in [`tests/docs/HOWTO-write-a-suite.md`](docs/HOWTO-write-a-suite.md) |

## The fixture folders

| Folder | How it is called |
|---|---|
| `tests/freestanding/` | `make test-freestanding-math`, comparing `#cfg(freestanding)`'s std/math against the real libm |
| `ksos/tests/` | ksos's own tests, run by its own [`ksos/Makefile`](../ksos/Makefile) (`make debug-ksos` from here, `make test-extract` in CI): the unit tests, the USB descriptors read as text, and elf2uf2 fed broken ELFs. `make test-ksos-qemu` calls its UART checks (`uart_*_test.py`) |
| `kspage/tests/wasm/` `kspage/tests/browser/` | kspage's checks on its page, run by its own [`kspage/Makefile`](../kspage/Makefile) (`make test-kspage-wasm` / `test-kspage-browser` / `test-kspage-served` from here). How their material is kept apart from the sample shown at startup is in "Each browser-check section has its own document" in [`kspage/docs/DESIGN.md`](../kspage/docs/DESIGN.md) |

## Files near the limit and how they split

How to choose where a file splits is "Choosing where to split a file" in [`docs/DESIGN.md`](../docs/DESIGN.md). A package's tests live in its `tests/`, so how they split is in that package's README.

| File | What to split out | Destination | Why it parts there |
| :-- | :-- | :-- | :-- |
| `tests/suite/docref_test.kspls` | the "what may refer to what" side: `layer_from` / `layer_to` / `spec_may_reach_up` / `ref_heads` / `ref_names` / `group_of` / `may_refer` / `unit_ref_defects` | a new `docref_layer.kspls` under `tests/support/` | It answers "may this folder point at that one" from folder names alone. It is the one part that reads no reference, so the split leaves `harness_refs` and `docref_cite` untouched |
| `tests/suite/conventions_test.kspls` | the shape of a comment in a source: `max_comment_lines` / `max_header_lines` / `is_header_lead` / `check_comments` / `check_summary_inside` | a new `conventions_comment.kspls` under `tests/support/` | It reads a source as lines of text alone: how long a `//` run may stand over the code, and where a `//<` run goes when the declaration has braces. It touches no AST and no other check's tables |

## Further reading

| Document | What it holds | Who reads it |
| :-- | :-- | :-- |
| [`tests/docs/HOWTO-write-a-suite.md`](docs/HOWTO-write-a-suite.md) | Where a new test goes, the manners for writing a suite, showing that a check can fire, reading the mutants report | Whoever adds a test |
| [`tests/docs/DESIGN.md`](docs/DESIGN.md) | Why the seed runs the suites, what stays here, why harness holds the arena, why a suite stays in Python | Whoever changes a suite or the shared foundation |
| [`../docs/SPEC-gates.md`](../docs/SPEC-gates.md) | The gates, the verdict line, and the verification scope per platform | Whoever reads a gate's result |
| [`../docs/DESIGN.md`](../docs/DESIGN.md) | The Development Principles the manners rest on (Principle 8 is why a check shows it can fire) | Whoever changes Kanso |
| [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md) | The design grounds of the compiler these suites inspect | Whoever changes the compiler |
