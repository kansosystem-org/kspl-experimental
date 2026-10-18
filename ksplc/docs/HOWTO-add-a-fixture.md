# Adding a fixture

**This guide gives the steps for adding a fixture to `ksplc`'s suites.** A fixture is one small source with its expected result written in its opening comment. A suite compiles it and holds the compiler to that result. Each step names the file, the command to run, and what fails if the step is left out. You need a clone that builds (`make` passes, [`docs/HOWTO-build.md`](../../docs/HOWTO-build.md)). Which folder under `ksplc/tests/` holds what is "tests/ — the suites and their fixtures" in [`ksplc/README.md`](../README.md).

## The steps

1. **Choose the folder by what the case must show.** Each folder runs its cases one way, and demands one exit code:

   | Folder | What runs | The exit code | The suite |
   | :-- | :-- | :-- | :-- |
   | `ksplc/tests/parse/` | `ksplc/tests/prog/raw_parse.kspl` calling the internal parser directly | **Must be non-zero** (the parser refuses the brace fixture) | `make test-negative` |
   | `ksplc/tests/negative/` | `ksplc [ARGS] <file> <out.c>` | **Must be non-zero** (the compiler refuses the program) | `make test-negative` |
   | `ksplc/tests/lint/` | `ksplc lint [ARGS] <file>` | Not looked at: lint exits 0 even with diagnostics | `make test-lint` |
   | `ksplc/tests/runtime/` | The compile must pass; then it links and runs the program and matches its own output | **Must be non-zero** (this folder pins down stopping at run time) | `make test-runtime` |

2. **Add the case to the file of its subject**, opened by a line `// ==== case <name>` (the name in lower case letters, digits and `_`). Make a new file only for a new subject. Keep a file under about 600 lines, so that a reader can still find a case in it. A mark above the first head, or two cases with one name in a folder, fails the suite.
3. **Write the marks at the case's head.** `harness_markers.markers()` reads them, the same in every folder:

   ```kspl
   //< Write in 1 to 4 lines what is being pinned down (why it breaks if it is otherwise).
   // ARGS: --to=llvm          the arguments to prefix to the compiler (omissible)
   // EXPECT: <what the output must contain>
   // EXPECT-NOT: <what the output must not contain>
   program
   ```

   **The description holds at most four lines of text**, a bare `//<` parting aside. The cases are a few lines each, so a longer description outgrows what it describes. A trap that one case guards goes beside that case, as a `//` above it.
4. **Run the folder's suite** (the last column of the table in step 1), here or from the repository's root. A case whose marks do not hold fails it.

## How a case is compiled

**A case is the text from the line after its head to the next head. The suite compiles it alone**, as the file `<name>.kspl` in the suite's scratch. A parser case of `ksplc/tests/parse/` is in braces, so it is `<name>.ksplb`. So a case reads as the file it would be alone. Its marks are its own. A position in a mark counts lines from the line after its head. Nothing that one case declares reaches another.

**A case that only compiles where it stands stays a file of its own**, with no head. The suite compiles such a file in place. These are the cases:

* a case whose message carries its module's full name, which changes outside it;
* a case that imports this package's code, which also changes outside it;
* the `deep_*` material of a limit;
* a source that another gate also compiles by its path (`ksplc/tests/runtime/main_result_without_sys.kspl`).

Each file says why in its opening comment.

**A case can show several shapes of one subject**, one function each (`fn case_<name>()`), with every shape's marks together at its head. The same `EXPECT:` line written N times must match N places in the output. **Only checks raised inside a function body can share a case this way**, and only where the compile really reports every shape. Some checks stop at the first problem they find and say nothing of the rest; a cycle check is one. Such a check takes a case of its own: merged, the shapes after the first are lost silently and the gate stays green.

## Rules for every fixture folder

* Do not repeat an `EXPECT-NOT:` string in the same file's comments. A diagnostic quotes the source line. The comment then appears in the output and fails its own check.
* **A case with an `EXPECT-NOT:` names every error it reports.** Each `error:` line in its output holds one of its `EXPECT:` strings. Otherwise the suite fails the case and prints the line. An error that the case does not foresee can stop the check that the `EXPECT-NOT:` is about. After an error in a body, the analysis skips the rest of that body. The `EXPECT-NOT:` then holds whatever the compiler does.
* Caution: **A case that must fail, yet pins that a check stays silent, fails through that same check.** It fails on another name, after the places that must stay silent. Its count is pinned (`EXPECT: Finished with 1 error(s)`). The case `use_after_free_block_dealloc_ok` in `ksplc/tests/negative/import.kspl` does this. **The suite cannot check this one.** An unrelated error that the case names (an undefined name, say) passes the rule above and still stops the check.
* **Prove a move between files by the marks.** List every `EXPECT` line in the folder before and after, keeping duplicates (`grep -h '^// EXPECT' tests/negative/* | sort`, run in `ksplc/`). The two lists must be the same, line for line: each case then still demands its own error.

## Rules for `ksplc/tests/runtime/`

* **Write the subscript and the like so that it is decided at run time.** A constant subscript inside the range emits no check (`index_is_static_in_range` in `ksplc/sema/body/postfix.kspl`), so the test would never take the run-time path.
* The exception is a fixture pinning down "the boundary that may be omitted" (the case `array_index_constant_out_of_bounds` in `ksplc/tests/runtime/stops.kspl`).
* Caution: **Put the position (`at <file>:`) in `EXPECT` too.** Matching the sentence alone lets a wrongly spelt file name slip past. LLVM puts the file name in the string pool, where its head and tail drop if the wrapping is wrong. The suite compiles a case from its own folder by its file name, outside any package. So the position names the case (`at <name>:`).
* The suite builds and runs each fixture twice, once by the C backend and once by the LLVM backend. It matches the same marks against both outputs. So write marks that **hold on both**. Write in full what both print the same way every run, such as `panic: index out of bounds in array (idx: 7, len: 4)`. Then one mark also catches the two backends printing it differently. Leave out a part that changes from run to run, such as an address.
* **A fixture imports nothing beyond what this package uses**: a stop only another package's code can reach is that package's to pin.
