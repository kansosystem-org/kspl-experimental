# tests — the design

**Why the repository's suites are built the way they are.** It is for whoever changes a suite or the code the suites share. How to write one is in [`tests/docs/HOWTO-write-a-suite.md`](HOWTO-write-a-suite.md), and each folder's place is in [`tests/README.md`](../README.md).

## Contents

* [The seed runs the suites](#the-seed-runs-the-suites)
* [What stays in the root tests folder](#what-stays-in-the-root-tests-folder)
* [A folder holds a role, and a file name holds a role within it](#a-folder-holds-a-role-and-a-file-name-holds-a-role-within-it)
* [Why harness holds the arena](#why-harness-holds-the-arena)
* [Why a suite stays in Python](#why-a-suite-stays-in-python)
* [Why the mutants report keeps no suppression list](#why-the-mutants-report-keeps-no-suppression-list)

---

## The seed runs the suites

A suite is written in KSPL and run by **the seed** (`out/ksplc_seed.exe`), which `make` builds before stage1.

Caution: **Do not build the suites with the compiler under inspection.** A broken compiler and a failed test would then show the same symptom. The seed is a fixed point built from `ksplc/seed.c`, so it does not change with the edit being tested. It runs in a separate process from what the suite drives (`out/ksplc_stage1.exe`).

**What it gives up: a suite can use only the notations the seed knows.** A language or codegen fix reaches the suites only after the seed is re-baked.

## What stays in the root tests folder

**What stays here reads more than one package.** A suite here checks the compiler against something outside its folder (the specification, kspage's highlighter and the editor's grammar, the root `Makefile`'s rebuild list, every package's generated C, the whole tree), or it gates the repository itself. So a package carved out of the tree leaves these suites behind, and takes its own tests with it.

**A suite lives where what it reads lives.** `lsp-tree` and `kspls-trip` read the whole tree and live here, while ksplc's `lsp` and `kspls` read that package's folder and live in it. `lsp-tree` starts its own server on the workspace only this folder offers.

**The tests `make debug` builds are not suites.** They are what is inspected ("does a program written in KSPL run correctly"), not what gives the verdict: the Makefile gives that, from the exit code and the output. So they live in each package's `tests/`, and only the run that calls them is here.

## A folder holds a role, and a file name holds a role within it

**The folder says whether a file is run or read**, and the name inside `tests/support/` says whether it is shared. With only one of the two, what is run and what it runs against mix together in an `ls`.

**A piece two parts read goes to the shared foundation, under its name.** Finding file references, and where each points, is in `tests/support/harness_refs.kspls`, because the carving (`make carve`) reads references the way the reference check does. Under the suite's name, a fix to it would reach the carving with nothing in the name saying so.

## Why harness holds the arena

**`harness.*` does not take the arena per call**, because lines that only pass it along would make up a meaningful share of a suite's code.

**This is not a rule that an arena is never passed.** What decides is where the result goes, not where the receiver lives. Nearly every call of `Map.entry_list` passes `null` (the heap) and frees the result at once with a `defer`, since a temporary list in a long-lived arena only grows.

Caution: **Confirm before dropping the arena argument from another function.** Plant a check in harness that fails where the arena passed differs from the main arena, and run every suite.

## Why a suite stays in Python

**One suite is in Python**, `tests/suite/link_flags_test.py`, for the reason in its row of the table. It is not partway through a migration, and the tools under `tests/tools/` are not suites.

| The reason it stays | What it needs |
|---|---|
| Watching Python itself | `tests/support/link_flags.py` cannot be removed, because of the bootstrap's order: the libraries needed to build ksplc cannot be asked of a ksplc that does not exist. The check that it agrees with the implementation is written in the language of what it watches |

Caution: **Do not add a row without a reason to this table.** Once written, a row reads as "it cannot be moved", and nobody touches it.

## Why the mutants report keeps no suppression list

`make test-mutants` is not a gate: it is not in `ci`, and one case takes tens of seconds. Its report includes **equivalent mutants**: guards whose removal changes nothing. They are the biggest complaint about mutation testing in other tools too.

**No list suppresses them**, because such a list would drift from the source. A survivor is read one at a time instead ("Reading the mutants report" in [`tests/docs/HOWTO-write-a-suite.md`](HOWTO-write-a-suite.md)).
