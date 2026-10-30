# tests — the design

**Why the repository's suites are built the way they are**, for whoever changes a suite or the code the suites share. How to write one is in [`tests/docs/HOWTO-write-a-suite.md`](HOWTO-write-a-suite.md).

## The seed runs the suites

Two compilers take part in every suite run. A fixed, older one runs the suite, and the suite tests the new one.

| Compiler | What it is | Its job in a suite run |
| :-- | :-- | :-- |
| **The seed** (`out/ksplc_seed.exe`) | A copy of the compiler frozen as C source (`ksplc/seed.c`). `make` builds it before stage1 | Compiles and runs the suite itself |
| **Stage1** (`out/ksplc_stage1.exe`) | The compiler built from the current source, with your edit in it | What the suite checks. The suite starts it as a separate process |

The diagram shows one run of `make test-<name>`, from start to verdict.

```mermaid
sequenceDiagram
    participant M as make
    participant S as the seed
    participant T as the suite
    participant C as stage1 (under test)
    M->>S: run the suite's .kspl file
    S->>T: compile and start the suite
    loop each case
        T->>C: start it on an input
        C-->>T: exit code and output
        T->>T: print one pass / FAIL / SKIP line
    end
    T->>T: print the closing RESULT line
    T-->>M: exit code (0 = all passed)
```

**The exit code carries the verdict to `make`.** The `pass` / `FAIL` / `SKIP` lines and the closing `RESULT:` line are for a person reading the log.

Caution: **Do not build the suites with the compiler under inspection.** A broken compiler and a failed test would then show the same symptom. The seed does not change with the edit being tested.

**What it gives up: a suite can use only the notations the seed knows.** A fix to the language or to code generation reaches the suites only after the seed is re-baked.

## What stays in the root tests folder

**A suite stays in the root `tests/` only when it reads more than one package; a suite about one package lives inside that package.** A suite here checks the compiler against something outside its folder, or gates the repository itself. Examples are the language specification, the VS Code extension's grammar and the root `Makefile`'s rebuild list. Others read every package's generated C, or the whole tree. So a package carved out of the tree takes its own tests with it.

**A suite lives where what it reads lives.**

| Suite | What it reads | Where it lives |
| :-- | :-- | :-- |
| `lsp-tree`, `fmt-tree` | The whole tree | Here |
| ksplc's `lsp`, `notation` | ksplc's folder only | In ksplc's folder |

**The tests `make debug` builds are not suites.** They are what is inspected, not what gives the verdict; the Makefile gives it, from the exit code and the output. So they live in each package's `tests/`, and only the run that calls them is here.

## The folder and the file name each hold a role

| What you look at | What it tells you |
| :-- | :-- |
| The folder (`tests/suite/` or `tests/support/`) | Whether the file is run, or read by what is run |
| The name inside `tests/support/` (`harness*` or `<suite>_<subject>`) | Whether every suite shares the file, or one suite owns it |

With only one of the two, what is run and what it runs against mix together in an `ls`.

## Why harness holds the arena

`harness.begin()` makes one arena for the whole suite (a block of memory freed all at once), and the `harness.*` helpers allocate from it. **`harness.*` does not take the arena per call**, because lines that only pass it along would make up a meaningful share of a suite's code.

**This is not a rule that an arena is never passed.** What decides is where the result goes. A list kept only for one function's length is given `null`, the global heap (`List<|T|>(null)`, freed at once with a `defer`). A temporary list in a long-lived arena only grows.

Caution: **Confirm before dropping the arena argument from another function.** Plant a check in harness that fails where the arena passed differs from the main arena, and run every suite.
