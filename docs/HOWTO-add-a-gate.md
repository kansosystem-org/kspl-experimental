# Adding a gate or a suite

**This guide adds a check that CI runs**: a gate (a make target the CI table names) or a suite (one KSPL program that runs many checks). You need a clone that builds ([`HOWTO-build.md`](HOWTO-build.md)). How to write the suite's checks themselves is [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md).

**Every list here is checked**: a place left out fails loudly, and the step says what it prints.

## A gate

1. **Write the make target** in the root `Makefile` or a file under `mk/`, with its help line on the line above and the name in `.PHONY`:

   ```make
   ## Gates|test-foo|What it checks, in one line
   test-foo: $(STAGE1_EXE)
   	...
   	@echo "RESULT: ALL PASS (what passed)"
   ```

   The group must be one of `HELP_GROUPS` in `mk/help.mk`. A target missing from `.PHONY` or the help line fails `make test-recipe-bytes`. The closing `RESULT: ALL PASS` line is what the CI runner reads ("How a run is read" in [`SPEC-gates.md`](SPEC-gates.md)).
2. **Add its row** to `gates` in `tools/ci_gates.kspls`. The row's place is its order in the run. Where it runs follows from two fields:

   | `shard` | `macos` | Where it runs |
   | :-- | :-- | :-- |
   | `.core` or `.rest` | either | Linux and Windows, in that job; macOS too if `macos` is true |
   | `.linux` | either | Linux alone (its tool is only in Linux's image, or the answer cannot differ by platform) |
   | `.none` | `true` | macOS alone |

   A row no set runs, and `macos` with `par = .synced` (macOS's `make` has no `--output-sync`), are refused when the runner starts.
3. **Name every SKIP it may print**: an `Expected_skip` row in the same file, with the platforms it is expected on and a piece of its line. An unnamed SKIP fails the gate with "a SKIP no row of `expected_skips` holds". **A tool Linux's image holds is required there instead**, through a switch: the gate fails without the tool where the switch reads 1, and skips where a person set it to 0. Its skip lines then go in `switch_skips` in the same file, and the switch in `REQUIRE_SWITCHES` in `mk/test.mk` ("The switches that require a tool" in [`SPEC-gates.md`](SPEC-gates.md)).
4. **Give it a row in the platform table**, "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md): the row's first word is the target (with or without `test-`), or the target stands in the row's bracketed list. Left out, `make test-conventions` fails with "the platform table names every gate and suite CI runs".
5. **A new shard** also needs a `Shard` and a `Set` variant, its place in `set_order`, and the job's matrix in `.github/workflows/ci.yml`; `make test-conventions` holds them together ("the CI's shards agree with the workflow's matrix"). A gate in an existing shard needs no change to the workflow.

## A suite

**A suite of the repository** (`tests/suite/`) is added by "Adding a suite, step by step" in [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md).

**A suite of the compiler's own** goes under `ksplc/tests/suite/`:

1. **The file**: `ksplc/tests/suite/<stem>_test.kspls`. Its name is the stem with `-` for `_` (`std_dir_test.kspls` is `std-dir`).
2. **List it** in `SUITES` in `ksplc/Makefile`. It runs through `make test-extract-ksplc`; macOS runs it only with a gate row of its own. A suite file in no list, or a name with no file, stops make at once with a message saying which.
3. **Name it in the platform table** (step 4 of the gate): the suites usually join a bracketed list such as "The other suites (…)".
4. **Run it**:

   ```sh
   make test-<name>          # last line: RESULT: ALL PASS
   make test-conventions     # the platform table, and the samples' checks
   ```
