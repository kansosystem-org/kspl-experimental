# Adding a gate or a suite

**This guide adds a check that CI runs.** That is a gate (a make target that the CI table names) or a suite (one KSPL program that runs many checks). You need a clone that builds ([`HOWTO-build.md`](HOWTO-build.md)).

**Every list here is checked**: a place left out fails loudly, and the step says what it prints.

## A gate

1. **Write the make target** in the root `Makefile` or a file under `mk/`, with its help line on the line above and the name in `.PHONY`:

   ```make
   ## Gates|test-foo|What it checks, in one line
   test-foo: $(STAGE1_EXE)
   	...
   	@echo "RESULT: ALL PASS (what passed)"
   ```

   The group must be one of `HELP_GROUPS` in `mk/help.mk`. A target missing from `.PHONY` or the help line fails `make test-recipe-bytes`. The CI runner reads the closing `RESULT: ALL PASS` line ("How a run is read" in [`SPEC-gates.md`](SPEC-gates.md)).
2. **Add its row** to `GATES` in `tools/ci_gates.kspl`. The row's place is its order in the run. Where it runs follows from three fields:

   | `shard` | `linux_only` | `macos` | Where it runs |
   | :-- | :-- | :-- | :-- |
   | `.core` or `.rest` | `false` | either | Linux and Windows, in that job; macOS too if `macos` is true |
   | `.core` or `.rest` | `true` | either | That job's Linux run alone; macOS too if `macos` is true |
   | `.linux` | `false` | either | Linux alone (its tool is only in Linux's image, or the answer cannot differ by platform) |
   | `.none` | `false` | `true` | macOS alone |

   A gate for Linux alone goes in `.linux`, unless that job would then end after the others. Then it goes in the shorter shared job, with `linux_only`.

   The runner refuses at start a row no set runs, and `macos` with `par = .synced` (macOS's `make` has no `--output-sync`). Leave `beside` out unless the gate is one of a pair ("Two gates side by side" in [`SPEC-gates.md`](SPEC-gates.md)).
3. **Name every SKIP it can print** in an `Expected_skip` row in the same file: the platforms that expect it, and a piece of its line. An unnamed SKIP fails the gate with "a SKIP no row of `expected_skips` holds". **A tool that Linux's image holds is required there instead**, through a switch in `REQUIRE_SWITCHES` in `mk/test.mk`. Its skip lines go in `switch_skips` ("The switches that require a tool" in [`SPEC-gates.md`](SPEC-gates.md)).
4. **Give it a row in the platform table**, "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md). The row's first word is the target (with or without `test-`), or the target stands in the row's bracketed list. Left out, `make test-conventions` fails with "the platform table names every gate and suite CI runs".
5. **A new shard** also needs a `Shard` and a `Set` variant, its place in `set_order`, and the job's matrix in `.github/workflows/ci.yml`. `make test-conventions` holds them together ("the CI's shards agree with the workflow's matrix").

## A suite

**A suite is added by "Adding a suite, step by step"** in [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md).
