# Writing a suite

This is for whoever adds a test to the repository. It assumes a built tree (`make`), so that the seed (`out/ksplc_seed.exe`) and stage1 (`out/ksplc_stage1.exe`) exist. Each folder's place is in [`tests/README.md`](../README.md); why the suites are built this way is in [`tests/docs/DESIGN.md`](DESIGN.md).

## Contents

* [Where a new test goes](#where-a-new-test-goes)
* [The manners for writing a suite](#the-manners-for-writing-a-suite)
* [The arena is held by harness](#the-arena-is-held-by-harness)
* [Showing that a check can fire](#showing-that-a-check-can-fire)
* [Moving a tool out of Python](#moving-a-tool-out-of-python)
* [Reading the mutants report](#reading-the-mutants-report)

---

## Where a new test goes

**A test inspecting one package goes into that package's `tests/`**, reached through `<package>/tests/all.kspls`. `make debug` runs those, not the suites here. "13.1 A test inspecting the inside of a unit goes inside that unit" in [`docs/DESIGN.md`](../../docs/DESIGN.md) lists the packages and why.

Caution: **After adding a test, add its import and call to that package's `<package>/tests/all.kspls`.** `make debug` cannot see a file no entry point calls, so forgetting this stays green.

**Do not write individual tests into `tests/debug/`.** Only the run that calls each package's entry point in turn lives there. There, in another unit, tests would need `pub` to inspect anything.

**kssrv's tests and ksai's examples have no such entry point.** They build their programs and start them, so each runs through its own folder's `make test` ([`kssrv/Makefile`](../../kssrv/Makefile), [`ksai/Makefile`](../../ksai/Makefile)): `make debug-kssrv` / `make debug-ksai` from here, and `make test-extract` in CI, which repeats any line they skipped as its own.

**A suite that reads more than one package goes into `tests/suite/`**, and a suite that checks only the compiler goes into ksplc's folder ([ksplc](../../ksplc/README.md)). Register a new suite in [`mk/test.mk`](../../mk/test.mk): a `suite_<name>` line and its name in `SUITES`. `make` stops at start-up when the two disagree, and `make test-<name>` runs the suite.

A suite can use only the notations the seed knows, since the seed runs it. To use a language or codegen fix in a suite, **re-bake the seed first** (`make commit-seed`; `make install` does it too). Otherwise the suite passes on the stage1 just built, while `make test-<name>` alone fails.

## The manners for writing a suite

Use `tests/support/harness.kspls` (the Python suites use `tests/support/harness.py`), and `std/verdict.kspls` for the verdict lines. If each suite finds the root and the target, formats the verdict lines and uses exit codes in its own way, CI's log becomes unreadable.

```kspls
#!/usr/bin/env -S ksplc run
import "std/mem" { Arena }
import "std/verdict"
import "tests/support/harness"

fn main(): I32
  arena: = harness.begin(8 * 1024 * 1024)
  r: = harness.ksplc(U8[][]::U8[][_]::{ "info", "keywords" })
  verdict.check("the exit code is 0", r.code == 0, r.out)
  return harness.finish()
```

* **The exit code carries the verdict**: `main` ends with `return harness.finish()`. The `RESULT:` line is for people and the log (the Makefile greps it as a marker for some targets only).
* **Report a case that could not be confirmed with `verdict.skip_check()`.** Written as `check(.., true, ..)`, a case that confirmed nothing prints the same line as one that confirmed something, and the log cannot tell them apart.
* **Get a workspace from `harness.sandbox("<suite name>")`.** It empties `out/tmp/<suite name>` and returns it, so the last run's leftovers do not mix into this run's verdict.
  * Caution: **Do not write to a fixed path (`/tmp/out.c` and the like).**
* **Read a generated file with `harness.read_generated`.** ksplc writes in text mode, so on Windows the newlines become `\r\n`. Compared raw, the same content fails only on Windows, as "the head does not match" or "a blank line is not found", never as a newline mismatch. `.gitattributes` pins the repository's files to LF, so `harness.read_under_root` is enough for them.
* **Take a line out of a child's output with `htext.line_after()`.** A line cut at `'\n'` keeps a trailing `\r` on Windows: a child's stdout is in text mode by default, so the log gets CRLF. The `\r` stays unseen until the string lands in a header or a token. `make test-conventions` checks this.
* Interpolation (`\{x\}`) can be written only inside a `Writer`'s `.s()`. To build a `U8[]`, such as a case name passed to `check`, use `arena.text().s("…").take()`, the notation for "allocate and keep" (why there are only three shapes: "The destination is always named" in [`std/docs/DESIGN.md`](../../std/docs/DESIGN.md)).
  * **Where no arena is in reach, use `harness.arena()`.**
* A suite runs its cases one at a time, in order. `harness.run_all` runs the cases given to it in parallel and returns the results **in input order**, through `std/verdict`'s `run_children`. `verdict.jobs()` sets the parallelism; `KANSO_TEST_JOBS=1` makes it sequential to narrow down a failure.
  * Caution: **Give each suite its own workspace name.** Suites themselves run in parallel under `make -j`, so two sharing a workspace read each other's output.
* **Where the amount of material is part of the verdict, give the reason in the suite's opening comment**, which anyone reducing it reads first. For example, `visibility` needs three files: without another folder and another package, the difference at the boundary does not show.

## The arena is held by harness

`harness.begin()` makes the suite's arena and returns it. The suite can use it directly for its own allocations, so `List.new(arena)` and the like read as usual. Why `harness.*` does not take the arena per call is in "Why harness holds the arena" in [`tests/docs/DESIGN.md`](DESIGN.md).

Caution: **Do not free it with a `defer`.** `finish` / `fatal` free it, so a `defer arena.free()` frees it twice.

**Still pass an arena where the arena decides where the result goes**, as with `Map.entry_list`.

## Showing that a check can fire

The convention checks (`make test-conventions`) are **green when the repository is clean, and so green even when a check is broken**: `test-mutants` shows that removing a verdict's guard fails no test.

So a rule's decision is factored out into a function that takes one string, with a table of strings that should and should not match **in the same file as the rule**.

```kspls
priv const tmp_samples: Sample[7] = ::{
  Sample::{ .text = "path = \"/tmp/x\"", .hits = true },
  Sample::{ .text = "// On macOS /tmp is a link to /private/tmp.", .hits = false },
  // …
}

priv fn check_tmp_fires(arena: Arena$@)
  $bad: = scan.misjudged(Sample[]::tmp_samples, opens_tmp, arena)
  verdict.check_list("the `/tmp` decision can fire", tmp_samples.len, "samples", bad@,
    "the table is `tmp_samples`")
```

* Caution: **List both the matching and the non-matching side.** A one-sided table lets one kind of breakage ("always true" or "always false") slip past.
* **Make the decision a pure function of one string.** If it reads a file, no sample can be passed to it. If the decision is inline in the check, factor it out first.
* **A file holding a table excludes itself from that rule's check** (its samples would show as real findings). Exclude that one file only: anything excluded drops out of the rule's check entirely.
* **Do not put the samples in a file.** Keeping that file out of scope needs machinery, and a missed exclusion fails the real check. `ksplc/tests/negative/`'s exclusions, scattered per check, show that shape.
* This checks only the decision. `harness.tracked_matching` checks which files are looked at: it stops when a string without a wildcard matches nothing.

## Moving a tool out of Python

**When a tool moves out of Python, check that it gives the Python version's verdict, broken input included.** For `llvm_ir_abi_check`, that means the extracted type list agrees with real IR line for line, and the output matches byte for byte on four ways of breaking the IR. Comparing counts alone is not enough: two versions wrong in the same way still agree.

**A scan built on regular expressions need not keep them when it moves**: `llvm_ir_abi_check` counts separators instead (its header says why).

## Reading the mutants report

`make test-mutants FILE=<file> [MAX=n]` drops one guard at a time, runs the tests, and reports each guard they did not catch.

Caution: **Do not read a survivor as "the tests are lacking".** The report includes guards whose removal changes nothing (equivalent mutants), and no list suppresses them ("Why the mutants report keeps no suppression list" in [`tests/docs/DESIGN.md`](DESIGN.md)).

**Read the survivors one at a time, and tell guards that take effect from guards whose removal changes nothing**, as with these from `kspage/write/typing.kspls`:

| The survivor | What reading it showed |
| :-- | :-- |
| `set_preedit`'s `s.len <= 0` | **Equivalent**. `Inline.insert` refuses an empty one, so dropping it takes the same path |
| `backspace`'s `c.inline == null` | **Equivalent**. `owner_of(null)` returns not-found, and the next guard returns |
| The two `!own.found` | **Defensive**. Only a caret pointing at a run off the tree reaches them (a state that must not exist) |
| `snap`'s `n == null` | **Defensive**. Only `clamp` calls it, and no path passes it a null |
