# The specification for the gates

**What CI runs, what every gate promises, and what the checks count.** A gate is one check CI runs that can fail the build ("Terms of art" in [`SPEC-documents.md`](SPEC-documents.md)). How to run the gates is in [`HOWTO-build.md`](HOWTO-build.md); why a gate has its shape is in [`DESIGN.md`](DESIGN.md) and in the design document of the package it inspects.

* [How CI runs](#how-ci-runs) — once a week and on a manual launch; choosing the jobs, and what each costs
* [How a run is read](#how-a-run-is-read) — the verdict line every gate emits, one log per gate, and the list at the tail
* [How the gates are arranged](#how-the-gates-are-arranged) — the make targets, the sections, and what runs in parallel
* [What each platform runs](#what-each-platform-runs) — the table, with a note on every gap
* [The shape of a per-item pass/fail line](#the-shape-of-a-per-item-passfail-line)
* [The record of a published API](#the-record-of-a-published-api)
* [What the convention checks count](#what-the-convention-checks-count)

## How CI runs

`.github/workflows/ci.yml` covers four platforms (Linux, macOS, Windows ×2), one job each. The table in "What each platform runs" below says which job runs which check. Update it with every addition, so that a check added on one platform and never on another stays visible.

**It runs only once a week, late at night (the time is `cron` in `.github/workflows/ci.yml`), and when launched by hand from the Actions screen.** So "CI is green" does not mean a given commit is green: the scheduled run inspects the default branch as it stands then. After 60 days with no repository activity, GitHub stops the scheduled run; re-enable it from the Actions screen.

**A manual launch can choose which jobs run.** "Run workflow" shows a checkbox per job (`linux` / `macos` / `windows-msvc` / `windows-ucrt64`), all ticked by default; an unticked job takes no runner and is not billed. Per GitHub's billing documentation, a run costs each job's wall-clock time, rounded up to the minute, times the runner's factor (Linux ×1, Windows ×2, macOS ×10), summed. So macOS has the shortest wall clock but costs the most. A green run with a job unticked covers only the jobs that ran. A scheduled run has no choice (`inputs` is empty).

Caution: **When adding a job, add an input of the same name and an `if:` with it.** Either alone breaks silently: the input alone is a checkbox with no effect, and the job alone runs whatever is ticked. `make test-conventions` checks that they match.

**To drop a job from some scheduled runs, write its condition as "not the cron of the runs it is dropped from", never as "the cron of the runs it runs on".** If the cron changes, a condition that matches it stops the job silently and for good. `make test-conventions` also checks that this cron appears in the `schedule:` declaration.

## How a run is read

**Every gate ends with one verdict line**, in one notation for all gates, starting at the head of the line.

| Line | Meaning |
| --- | --- |
| `RESULT: ALL PASS[ (breakdown)]` | Everything passed; the parentheses hold a breakdown such as a count |
| `RESULT: SOME FAILED (count)[ -> name]` | It failed |
| `RESULT: SKIPPED (reason)` | It passed silently, for want of a tool or the like |
| `RESULT: MEASURED (breakdown)` | A tool that reports numbers with no verdict (`make test-mutants`) |

CI looks only for `RESULT: ALL PASS` (`ci_check` in `mk/ci.mk`).

Caution: **When adding a gate, emit one line in this notation.** A notation per gate needs a reader per gate on the CI side, and a bug in such a reader stays green.

**Do not begin anything but a verdict with `RESULT:`**: the path of a built file starts with `OUTPUT:`, and a refusal along the way with `NOTE:`. The canonical source is `finish` in `std/verdict.kspls`.

**One gate's full log is in the run's Artifacts.** The log on screen merges a whole job into one stream, and a reader that gets only the tail (GitHub's API) cannot see its middle. `ci_gate` writes each gate's log to `out/log/ci/<name>.log`, and the workflow uploads it as `log-<job>-<section>`. It uploads on a failing run too (`if:always()`), the run you need it for.

**The log's tail lists what actually ran.** `make ci` / `ci-linux` / `ci-macos` end by listing the gates they ran and the seconds each took (`gate seconds:` is the total), read from `out/log/ci/` itself, not listed by hand. Where the time goes, and what shrinks it, is "Where CI's time goes" in [`DESIGN.md`](DESIGN.md).

**A gate that passed silently stays in the list, green, as `SKIPPED`** (`test-ksos-link` off Linux, `test-kspage-browser` with no browser), so only reading the list reveals it. `ci-linux` runs `ci` first, so the list appears twice; the second holds everything.

## How the gates are arranged

The procedure lives in the Makefile. `make ci` runs the gates common to Linux and Windows (ucrt64), `make ci-linux` adds the Linux-only gates, and `make ci-macos` runs macOS's. The workflow only calls them, so **to change which gates run, fix `ci` / `ci-linux` / `CI_MACOS_GATES` in `mk/ci.mk`**, not ci.yml. The same targets reproduce a run locally.

**When only `.md` files changed, `make ci-docs` suffices; once even one line of source changed, `make ci` is needed.** `make ci-docs` runs the gates that read `.md` (its recipe in `mk/ci.mk` lists them), and `make ci` runs them all too. `grep -l '\.md' tests/suite/*.kspls` confirms that no other gate reads `.md`.

**The common gates run as two sections, in parallel, as separate jobs.** `ci-shard-core` runs self-host and one half of the regression suites, and `ci-shard-rest` runs the rest and the other half. The suites are dealt across both halves rather than kept whole, so that neither half dominates a job's wait; `SUITES_B` in `mk/test.mk` says which suite goes where. Linux runs three jobs: these two and `ci-linux-only`. The number of sections is set by how many job start-ups can be paid for, not by what divides evenly (the grounds are "Where CI's time goes" in [`DESIGN.md`](DESIGN.md)).

**Always measure the usage time before adding a section.** The cheapest way to shrink the wait is not splitting but choosing which jobs run ("How CI runs" above).

**"Everything ran" rests on a chain of three checks**, since a job sees only its own section and its tail lists only that. The chain: (1) `make` fails at start-up if a step of `CI_STEPS` is in no section, (2) `make test-conventions` checks that every section is in the `.yml`'s matrix, and (3) GitHub checks that each job is green. The whole chain is in the "Shards" section of `mk/ci.mk`.

**Do not remove `fail-fast: false`**: without it the first failing job cancels the rest, and their results are lost.

The gates run in parallel wherever possible (`make ci`'s `-j$(TEST_JOBS)`). `lint` / `lint-cfg` / `test-suites` / `test-ksos-link` / `test-ksos-posix` / `test-ksos-qemu` are each split into one target per item, so a failing item is named by its target.

**Items that hold a fixed resource are listed as serial** (`KSOS_QEMU_SERIAL_DEMOS` / `KSOS_POSIX_SERIAL_DEMOS` in `ksos/Makefile`; their comments say which resources, and why the serial items are the ones listed).

## What each platform runs

**The table says what CI runs, not what passed.** The Linux job's devcontainer image is cached at `ghcr.io/<owner>/<repository>/devcontainer` (`imageName` in `.github/workflows/ci.yml`; only a run on main writes it), and is pulled rather than built while `.devcontainer/Dockerfile` is unchanged. The first run after the Dockerfile changes rebuilds the cache, and on that run alone the Linux job takes several minutes longer.

| Check | Linux (`make ci-linux`) | macOS (`make ci-macos`) | Windows (msvc) | Windows (ucrt64, `make ci`) |
|---|:---:|:---:|:---:|:---:|
| self-host (the C backend) | ✅ | ✅ | ✅ | ✅ |
| debug tests | ✅ | ✅ | ✅ | ✅ |
| test-fmt-tree (the tracked sources are already formatted) | ✅ | ✅ | ➖(note 1) | ✅ |
| lint | ✅ | ✅ | ➖(note 1) | ✅ |
| test-negative | ✅ | ✅ | ✅ | ✅ |
| test-equiv (C⇔LLVM equivalence) | ✅(note 2) | ✅(note 2) | ✅(C only, note 3) | ✅ |
| test-lsp (the language server, on ksplc's folder as its workspace) | ✅ | ✅ | ✅ | ✅ |
| test-lsp-tree (the language server over the repository's whole tree) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-freestanding-math | ✅ | ✅(note 5) | ➖(note 1) | ✅ |
| test-simd | ✅ | ✅ | ➖(note 1) | ✅ |
| test-surface (the published API matches its record) | ✅ | ✅ | ➖(note 1) | ✅ |
| test-docs (the language tour matches its program and output) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-emit-runtime | ✅ | ✅(note 6) | ➖(note 1) | ✅(note 6) |
| run (the AI engine, a smoke test) | ✅ | ✅ | ➖(note 1) | ✅ |
| test-run (`ksplc run`'s cache) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-llvm-abi (the calling conventions agree) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-ksos-posix (running on the POSIX host port) | ✅ | ➖(note 7) | ➖(note 1) | ➖(note 7) |
| test-ksos-link (bare-metal linking, `test-ksos-ramtext` with it) | ✅ | ➖(note 4) | ➖(note 1) | ➖(note 8) |
| test-ksos-qemu (bare-metal execution under QEMU) | ✅ | ➖(note 9) | ➖(note 1) | ➖(note 9) |
| test-kspage-wasm (running the browser-facing wasm) | ✅ | ➖(note 10) | ➖(note 1) | ➖(note 10) |
| test-kspage-browser (the input entry point in a real browser) | ✅(note 11) | ➖(note 12) | ➖(note 1) | ➖(note 12) |
| test-kspage-served (on a page `kssrv --local` served) | ✅ | ➖(note 12) | ➖(note 1) | ➖(note 13) |
| test-debug-line (the debug position points at the `.kspls`) | ✅ | ➖(note 4) | ➖(note 1) | ✅(note 14) |
| test-split (split compilation builds the same thing as a single TU) | ✅ | ➖(note 4) | ➖(note 1) | ✅(note 15) |
| test-ast-cache (the parse cache does not change the result) | ✅ | ➖(note 4) | ➖(note 1) | ✅(note 16) |
| test-property (a random expression matches on both backends) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| Fuzzing, each package's own `test-fuzz` run on its copy by `test-extract`, sanitizer-built, none may die: ksplc's earlier stages on corrupted source, kspage opening and laying out a corrupted document, std's readers on a corrupted byte sequence, ksai on a corrupted weights file and vocabulary | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-kspls (ksplc reads indentation-written source directly, giving the same C, squiggles, hovers, and jump targets) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-kspls-trip (every tracked source goes round the two notations and comes back byte for byte) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-file-path (the logical name is stable however the entry point is written) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| test-js-syntax (the page's JS parses as syntax) | ✅ | ➖(note 17) | ➖(note 1) | ➖(note 17) |
| test-broken-pipe (writing to nobody does not die, and output losing its destination ends quietly) | ✅ | ➖(note 4) | ➖(note 18) | ➖(note 18) |
| test-carve (ksdb carved into a read-only copy whose own `make test` passes from a fresh clone, and every package's references still landing from its copy) | ✅ | ➖(note 4) | ➖(note 1) | ✅(note 19) |
| The other suites (cli / config / std-dir / thin-use / output-flush / vscode / lint / lint-gate / fmt / write-perm / recipe-bytes / deps / ext-import / link-flags / pytools / doc) | ✅ | ➖(note 4) | ➖(note 1) | ✅ |
| self-host (the LLVM backend) | ✅ | ✅ | ➖(notes 1 and 3) | ✅ |
| debug tests (the LLVM backend) | ✅ | ✅ | ➖(notes 1 and 3) | ✅ |
| A real build of the optional backends (`TLS=1 DB=1 BLAS=1 debug`) | ✅ | ➖(note 20) | ➖(note 1) | ➖(note 20) |
| perf_guard (peak-memory regression; time is recorded only) | ✅ | ➖(note 21) | ➖(note 1) | ✅ |
| test-race (the tests that start threads, built with ThreadSanitizer, report no data race) | ✅ | ➖(note 4) | ➖(note 1) | ➖(note 22) |

**The compiler's own suites run from a copy.** On Linux and ucrt64, `test-extract` runs the suites in ksplc's folder (`test-negative`, `test-equiv`, `test-run` and the rest of `SUITES` in `ksplc/Makefile`) from a copy of that folder alone, against the compiler the copy rebuilt. macOS and msvc run the ones their columns mark by name, from the repository.

**Formatting is checked before lint, and the order matters** (why is the comment at that step of `mk/ci.mk`).

**The lint gate passes only when every count is 0, hints included.** It analyses the entry points listed in `LINT_TARGETS` in `mk/lint.mk`. A generic is analysed only where it is instantiated, so code that only one entry point instantiates (`tests/debug/main.kspls`, say) escapes the gate unless that entry point is listed. `make test-lint-gate` checks that a file holding one information diagnostic makes `make lint` exit non-zero.

* **note 1**: `windows-msvc` is deliberately narrowed to catching regressions on the MSVC target; it is not a full `make ci`. The clang from LLVM's own Windows installer targets MSVC by default, so a user with that clang compiles `ksplc run`'s C there. The released `ksplc.exe` is built on UCRT64 (`.github/workflows/release.yml`). `windows-ucrt64` covers on Windows what it leaves out, so no coverage is lost.
* **note 2**: `test-equiv` runs on macOS because nothing excludes it: the platform branch in `ksplc/tests/suite/backend_equiv_test.kspls` is MSVC-only, and `self-host` / `debug` under `LLVM=1` already exercise macOS's LLVM path.
* **note 3**: an LLVM artifact links the C runtime (`ksplc emit-runtime`'s output, threads included), so it needs the same libraries as the C backend. CI does not link LLVM's output with MSVC's `link.exe`: `windows-msvc` stops at the C-backend build, and `windows-ucrt64` checks the LLVM backend's behavior.
* **note 4**: `ci-macos` runs only what is worth running on real macOS hardware (`CI_MACOS_GATES` in `mk/ci.mk`); what it leaves out is judged platform-independent, and Linux and Windows already pass it. When adding to it, fix `CI_MACOS_GATES` and this table together.
* **note 5**: on macOS the gate handles two differences in Apple's toolchain: `ld64`'s `-dead_strip` in place of `-Wl,--gc-sections` (chosen by `PLATFORM` in `GC_SECTIONS_FLAG`), and Mach-O's "segment,section" form for what `#section("...")` emits (handled by `KSPL_SECTION` in `ksplc/gen/runtime/core.h`). **Such differences cannot be counted in advance**: treat their number as unknown until a gate runs on real hardware.
* **note 6**: the `--omit-runtime` version's symbol relies on a mark saying "keep it even when unreferenced", and the mark is spelled differently in each object format (ELF, Mach-O and PE; the compiler's design document lists each).
  * Caution: On a format with no way to ask for the mark, the generated C stops with `#error`, so the check cannot silently vanish. **Only the host's own format can be checked through to the link**: Linux confirms ELF and macOS Mach-O end to end. For the other formats the test checks only that the mark is attached, on a fragment run through that target's assembler (`ksplc/tests/suite/emit_runtime_test.kspls`).
* **note 7**: `test-ksos-posix` runs demos of ksos's POSIX host port (context switching with ucontext). **Nothing else exercises the host-side port layer, task liveness management, the ISR-safe API or the stack canary**: `test-ksos-qemu`'s Cortex-M demos exercise the kernel core, not this port layer. It needs `<ucontext.h>`, which Windows lacks and macOS deprecates with no guaranteed behavior, so it is Linux-only.
  * The comment at `KSOS_POSIX_TEMPLATED` in `ksos/Makefile` says how a demo joins it; `KSOS_CM_DEMOS` and `KSOS_RP2040_DEMOS` take the same shape.
* **note 8**: `test-ksos-link` needs the `arm-none-eabi` toolchain (a libgcc that defines soft-float and 64-bit integer division). **`test-ksos-ramtext` runs as its prerequisite**, so the two are green or absent together, never one alone. It checks that a window function with a tight deadline sits in RAM rather than in flash.
  * **On Linux the toolchain is required**: the root `Makefile` sets `KSOS_REQUIRE_ARM` there, and without the toolchain the target fails. The Linux devcontainer bundles the toolchain.
  * **Elsewhere, without the toolchain, the target prints `SKIPPED (no ARM toolchain)` and passes silently**, so a green `make ci` on ucrt64 does not mean bare-metal linking was checked.
  * It checks the bare-metal demos under `ksos/demo/<port>/` (`cortex_m` / `rp2040`); the comment at `demo_stems` in `ksos/Makefile` says how the listing is built, and how a port joins it.
* **note 9**: `test-ksos-qemu` runs ksos's bare-metal demos under `qemu-system-arm` and checks that no failure marker (`[FAIL]` / `N FAIL`) appears in the log. A demo that links may still fail to work, and `test-ksos-link` checks only the link. Do not check the exit code alone: semihosting's exit returns 0 whatever the demo's own verdict. The macOS and Windows runners have no qemu (as in note 10), so it is a Linux-only gate (`make ci-linux`).
* **note 10**: `test-kspage-wasm` builds `kspage`'s core to wasm32 under `--freestanding`, runs it with `node`, and checks that placing and editing give the expected result. The canvas is not inspected: text sizes are fixed values instead, since a browser's measurements change with the model and version. **The link checks that the set of imported functions has not grown**: `kspage/port/web/imports.txt` constrains it, not `--allow-undefined`, so libc code slipping in fails it. `wasm-ld` and `node` are in `.devcontainer/Dockerfile` but not on the macOS and Windows runners, so it is a Linux-only gate.
* **note 11**: **A gate that dumps the page and quits (`test-kspage-browser`) stalls on requests to outside hosts.** On a network where they never return (a proxy holding the handshake, say), the time budget never runs out, and the gate times out with no marker even when everything works. So `KSPAGE_BROWSER_FLAGS` in `kspage/Makefile` turns off name resolution (`--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"`), and such a request fails at once.
  * **Keep `127.0.0.1` excluded**: `test-kspage-served` connects to the local server. The bound page uses no outside resource, so cutting the network costs the check nothing.
* **note 12**: `test-kspage-browser` opens the built page in a real browser and checks where the focus is, whether the input field counts as visible, and how many characters each keystroke enters. **Neither running the wasm nor looking at the canvas shows these**, so `test-kspage-wasm` cannot replace it when typing works and only conversion fails. A real conversion is not checked either: a headless browser has no input method. The macOS and Windows runners have no browser (as in note 10), so it is a Linux-only gate.
  * **With no browser the target prints `SKIPPED (no browser)` and passes silently**, so a green run there has not checked the input entry point (as with `test-ksos-link`). The bundled browser is an amd64 deb, so on other machines it passes silently too.
  * **`ci-linux` sets `KSPAGE_REQUIRE_BROWSER=1` so it does not pass silently**: the devcontainer bundles the browser, so not finding one there means the image lost it.
* **note 13**: `test-kspage-served` starts `kssrv --local`, opens the page it serves in a real browser, and checks opening a file in a local folder and writing it back. **`test-kspage-browser` cannot replace it**: it opens the page from `file://` with no server, and checks only that no tools appear when there is none. The token travels in the opened URL's fragment (`#t=`), on the security grounds in [`DESIGN.md`](DESIGN.md), "13.10 A page asks the local machine through one protocol". The gate passes kssrv's printed URL straight to the browser and holds no copy of it. The run ends on the marker the page writes back, in real time, not on `--dump-dom` / `--virtual-time-budget` (why is at `KSPAGE_DUMP_FLAGS` in `kspage/Makefile`).
  * The page writes a marker to a file per item, so the last line of a list cut short names what it was waiting for. It is Linux-only, and does not pass silently, for the same reasons as `test-kspage-browser` (note 12).
* **note 14**: `ksplc/tests/suite/debug_line_test.kspls` has two tiers. The first, a pure text comparison that runs everywhere, checks that the generated C's `#line` points at the source's real line. **The second tier is Linux-only**: it checks that the `.kspl` name survives in the debug information of an executable built with `-g`. Under a one-step compile and link, macOS leaves `-g`'s DWARF in the `.o` / `.dSYM` rather than the executable, and Windows (MSYS2) is unverified. The LLVM backend emits no debug information, so it is out of scope.
  * Before widening it, confirm **both directions** on the target platform's real hardware: the name appears with `-g` and disappears without. Without that contrast the check goes green even while inspecting nothing.
* **note 15**: `ksplc/tests/suite/split_test.kspls` checks that a program built with `--split=N` gives the same output as one built unsplit, and **always links and runs it**, since what splitting breaks shows only at link time. There is no platform branch (`harness_build.build_exe` asks `ksplc info link-libs` for the libraries to link). Splitting is C-backend-only, so the LLVM backend is out of scope; the test also checks that asking for both is refused.
* **note 16**: `ksplc/tests/suite/ast_cache_test.kspls` uses a cache location of its own (`KSPLC_CACHE_DIR`). It checks that the generated C matches byte for byte with and without the cache, that changing the source rebuilds the entry, that a corrupted entry is silently discarded, and that old generations do not pile up. There is no platform branch.
  * **Check "changing only the contents rebuilds it" by rewriting the file at the same path.** A copy under another name changes the file name in the key, so an implementation whose key ignores the contents would pass too.
* **note 17**: `test-js-syntax` checks with `node --check` that the page's JS parses, per file and concatenated into the bound page. **It needs `node`, so it is a Linux-only gate** (as in note 10).
  * **Do not put it into the common `ci`**: that runs in three environments, and a local machine without node would fail it.
  * **The target exists in every environment**, so wherever node is installed `make test-js-syntax` runs it (the procedure is in the tools table under "Windows natively, without Docker" in [`HOWTO-build.md`](HOWTO-build.md)). It is a suite but not one of `test-suites`; such suites are listed in `LINUX_SUITES` in `mk/test.mk`.
* **note 18**: `test-broken-pipe` checks POSIX's handling of SIGPIPE, so **Windows has nothing to check**: it has no SIGPIPE, and a write to a closed named pipe merely fails. The suite reads `--target` and says `SKIPPED` there, so it can be run anywhere. Of its three checks, only "a launched child holds SIGPIPE's default" reads `/proc/self/status`, so that check runs only on Linux (`SKIPPED` elsewhere).
  * Note: The decision's canonical source is "Writing when nobody is left to read it" in `ksplc/gen/runtime/hosted.c`.
* **note 19**: `test-carve` needs `git subtree`, which ships among git's contributed commands, not its core. **With a git built without them, the suite prints `SKIP` and the reason** rather than a pass, so read the suite's own line. The Linux devcontainer's git has it.
  * **Whether the copy's addresses open on the net is not checked**, only that each names a file that the pinned commit holds in this repository (why is at the head of `tests/suite/carve_test.kspls`).
* **note 20**: `make TLS=1 DB=1 BLAS=1 debug` needs libssl / libsqlite3 / libopenblas, which the windows-ucrt64 and macOS runners lack (as in note 10), so it is a Linux-only gate. **`lint-cfg` cannot replace it**: it only runs semantic analysis inside `#cfg(tls)` / `#cfg(db)` / `#cfg(blas)`, and only a real build shows whether the FFI is right (argument order, types, libraries to link). The default build's tests confirm only that with TLS=0 it returns unsupported. BLAS's and SQLite's libraries are named in the source (`#link`), so this is also the one gate that sees a named library really linked.
* **note 21**: `tests/tools/perf_baseline.json` holds baselines (with tolerance factors) taken on the Linux CI's real hardware. Applied to macOS as they are, they could raise false alarms or miss regressions, so the gate stays off macOS unless a macOS baseline is added.
  * Only the peak memory decides the verdict; the build time is only recorded, as a ratio to the baseline (why is in `tests/tools/perf_guard.kspls`).
* **note 22**: `test-race` builds the tests `make debug` runs (every package's own), kssrv's tests with the server they start, and ksai's examples with the tests that run them, through the C backend with clang's `-fsanitize=thread`, runs them, and fails on any report from any process, the runtime's and libc's included. **It finds the races the tests reach, not the ones they miss** (why it stands in place of a type-system check is "5.1 Why data races are not prevented by the type system" in [`DESIGN.md`](DESIGN.md)).
  * **It shows that it can fire**: a program racing on purpose, built and run the same way, must be reported first. **And that it still covers what starts threads**: every tracked source that starts a thread is compiled into a program it runs, or named with the reason in `left_out` in `tests/suite/race_test.kspls`.
  * **No report is suppressed.** std, the runtime and the program are compiled from source into one unit, so nothing the sanitizer watches is uninstrumented, and a report is a finding to fix.
  * **The LLVM backend is out of scope**: clang instruments only the functions its own front end marks, so IR that `--target=llvm` wrote would run unwatched.
  * **On Linux the sanitizer is required** (`KANSO_REQUIRE_TSAN`, set in `mk/test.mk` on Linux; the devcontainer holds clang's sanitizer runtime). **Elsewhere, a C compiler without it gives a `SKIP` line** and the gate passes silently. Windows has no ThreadSanitizer, so ucrt64 does not run it.

## The shape of a per-item pass/fail line

Every place inside `make ci` that emits a per-item verdict emits one line in the order **marker, label, content**.

```
pass lsp-tree: a workspace query does not stay silent longer than the supervisor's window
FAIL conventions: the letters by which the compiler names std really exist: std/reflect.kspls:17: …
SKIP kssrv: a link inside the root cannot get outside: a link cannot be made with `ln -s` in this environment
```

* **The marker** … four characters, `PASS` / `FAIL` / `SKIP`, never the pair `OK` / `NG` (why is at `mark_ok` in `tests/support/conventions_line.kspls`).
  * **The failing marker is `FAIL`**: `mk/ci.mk`'s summary picks up that text, so a failing line worded otherwise never reaches the summary.
* **The label** … for a suite, its name in the table in `mk/test.mk`; for a kspage probe, the section's name. Do not have the suite write its own label; the table is the one source.
* **The content** … what was confirmed.

**Do not add new places that build the line.** The canonical source is the table in [`../tests/support/conventions_line.kspls`](../tests/support/conventions_line.kspls), and a file that writes the shape without being in that table fails `make test-conventions`. To change the shape, change the table; the failing check names the file to fix.

Caution: **Put the code that reads a marker in the table too.** Otherwise, the day the marker changes, a reader still looking for the old one fails for a false reason: that not one item ran.

**Send output line by line** (`io.set_line_buffered()` in KSPL, `reconfigure(line_buffering=True)` in Python). Fully buffered output can flush mid-line, and when `ci` bundles many suites into one pipe, the half line joins another suite's line with no marker or label left to tell them apart.

**`make debug`'s tests take the same shape**, assembled in [`../std/verdict.kspls`](../std/verdict.kspls): `verdict.start` prints nothing, and `verdict.pass` or `verdict.skip` prints one line and ends it. The comments at `start` / `pass` / `skip` in `std/verdict.kspls` say what the line carries, and how a frozen run shows where it stopped.

```
pass NCM: it can assemble the byte run the specification says.
SKIP Fs: directory operations (mkdir/stat/rename/enumerate/delete): LLVM backend has no fs support
```

* **This family has no failing marker**: a failure is `std/lang`'s panic, and `panic: <reason> at <file>:<line>` names the test.
* Caution: **To skip, go through `verdict.skip`.** A silent skip is indistinguishable from a pass, and a degraded environment then looks like "everything passed".

## The record of a published API

**Each package that publishes an API carries a `SURFACE.txt`**, one line per published declaration, holding its name, its shape and the summary of its `//<`. `make surface` regenerates all of them, and `make test-surface` refuses a tree whose published API and record have drifted apart.

**Each source is compiled as an entry point of its own**, since no file of a package imports all of it, and the records are joined into `<the package>/SURFACE.txt`. A `pub` in a subfolder is the package's API too. Compiling each source alone also catches a file that does not build alone: say, one that forgot the import of an extension method it uses, hidden while another file brings in the method's definition first.

Caution: **Do not edit a record by hand.** The next `make surface` overwrites the edit, and until then the gate compares the tree against something nobody generated.

**The reference to read is rendered from the same walk when asked**, not committed: `ksplc doc <file>` prints what a file publishes, entry by entry, so it cannot disagree with the record. `make surface` also writes it under `out/docs/` for browsing, and no gate looks at that copy. Why the record is kept at all is "13.2 The published API is recorded in the repository" in [`DESIGN.md`](DESIGN.md), and why the reference is not committed is "13.11 The reference is rendered when asked, not committed" there.

**Adding, changing or removing a `pub` shows in the record's diff.** A declaration split by `#cfg` appears for both branches, since the record reads the raw syntax tree, not the branch one build enables.

## What the convention checks count

The principles themselves are "Development Principles" in [`DESIGN.md`](DESIGN.md); what is here is only what `make test-conventions` counts, and where. **Do not copy the rules here.**

### Principle 3 - what is counted, and how

**Everything written by hand is measured** (`.kspls` / `.kspl`, `.c` / `.h`, and the page's `.html` / `.css` / `.js`). Only generated artifacts are left out: `size_exempt` in [`../tests/support/conventions_size.kspls`](../tests/support/conventions_size.kspls) names `ksplc/seed.c` (the split applies to the code that generates it).

**A function's length and nesting are measured only in `.kspls` source**: C has no `fn `, so the count does not apply; C relies on the C compiler's warnings and on review instead.

Note: The one other exception is test material that shows the ceiling refusing something: the same `size_exempt` names the files that would be useless as tests if split (`ksplc/tests/negative/deep_*.kspl` and `ksplc/tests/lint/long_function.kspls`).

**A file over 900 lines fails `make test-conventions` unless "Files near the limit and how they split" in the `README.md` of the top-level folder it sits in names it.** What that section holds is "Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md). A warning on screen alone would let the README's "no file exceeds it" go stale without anyone seeing it (Principle 7).

**In C, splitting only the definitions by subject suffices.** The headers (`.h`) do not multiply: the definition files are concatenated into one translation unit, so `static` helpers and types from an earlier file stay visible (`ksplc/gen/runtime/hosted*.c` and `write_impl` in `ksplc/gen/runtime.kspls`).

### Principle 7 - the forbidden phrasings, and where the measurements live

**Do not copy the list of forbidden phrasings here.** The canonical source is `history_words` in [`../tests/support/conventions_now.kspls`](../tests/support/conventions_now.kspls). How a trap is written instead is "A trap is written as why it is dangerous" in [`SPEC-documents.md`](SPEC-documents.md).

**A measurement may stand only in material that holds the procedure for taking it again**; a document's prose points there (`make …`).
