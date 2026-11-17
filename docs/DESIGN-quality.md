# Quality: what Kanso holds itself to, and what checks it

**This document lists the quality properties that Kanso holds itself to, and how the repository makes sure of each one.** It also says where that assurance is weak today. Each mechanism is stated in its canonical source; this document only points at it (Principle 4 in [`DESIGN-principles.md`](DESIGN-principles.md)).

## The properties this document uses

**The list starts from the nine product properties of the standard ISO/IEC 25010:2023.** A standard list keeps a property from being left out because nobody thought of it. The descriptions below are Kanso's own words, one line each.

| Property | What it asks, in Kanso's words |
| :-- | :-- |
| Functional suitability | The program does what its specification says, and nothing else |
| Performance efficiency | It uses time, memory and other resources in proportion to the work |
| Compatibility | It works beside other programs, formats and earlier versions of itself |
| Interaction capability | A person, or a model, can learn it and use it without guessing |
| Reliability | It keeps working on bad input, and fails in a way that can be seen |
| Security | Only the people and inputs allowed to act can act |
| Maintainability | A change stays small, local and checkable |
| Flexibility | It moves to another machine or another use with little work |
| Safety | It does not harm people or things in the physical world |

**Eight further properties are ones the builders of a system add.** The standard does not list them on their own, but they decide how the work above is done.

| Property | What it asks |
| :-- | :-- |
| Readability | A reader understands the code and the documents at the first reading |
| Testability and verifiability | Each claim can be checked by a program, not by trust |
| Determinism | The same input gives the same output and the same verdict, on any run |
| Observability | When something fails, the output says where and why |
| Documentation | The documents agree with the code and say what the reader needs |
| Privacy | A person's data stays where that person put it |
| Licence compliance | Every recipient gets the notices they are owed |
| Sustainability | The checks cost no more machine time and money than they buy |

## The summary

**The table gives each property's main mechanisms and how strong the assurance is today.** "Strong" means a gate fires on most ways to break the property. "Partial" means gates cover part of it and review the rest. "Weak" means mostly review or a check by hand.

| Property | Main mechanisms | Strength today |
| :-- | :-- | :-- |
| Functional suitability | self-host, `test-equiv`, `test-property`, `test-random-equiv`, `test-spec-claims`, `test-negative`, `test-extract`, the package tests | Strong for ksplc and std, partial for the rest |
| Performance efficiency | `perf-log`, `test-simd` | Partial |
| Compatibility | `test-llvm-abi`, `test-emit-runtime`, `test-ship`, `test-lsp`, `test-layout-targets` | Strong; partial off Linux |
| Interaction capability | `ksplc explain`, `ksplc doc`, `test-ksmd-browser`, the CLI comparison in `test-conventions` | Strong for ksplc, partial elsewhere |
| Reliability | `T!E` results, `lint`, `test-fuzz`, `test-sanitize`, `test-race`, `test-holes`, `test-lsp` | Partial |
| Security | the language's checks, `test-holes`, `test-sanitize`, the local server's tests, `test-ksagent-chat` | Partial |
| Maintainability | `lint`, `test-conventions`, `test-docref`, `test-surface`, `test-fmt-tree` | Strong |
| Flexibility | both backends self-host, `test-ksos-qemu`, `test-ksos-link`, `test-freestanding-math`, `install-check` | Strong |
| Safety | ksos's kernel checks, `motor_test.kspl`, `stops_test.kspl`, the car checked by hand | Partial |
| Readability | `test-fmt-tree`, the sentence and comment caps | Strong for length, review for meaning |
| Testability and verifiability | stage1 equal to stage2, `test-seed-sum`, a failure case per gate, `make coverage` by hand when the tests are surveyed | Strong; no coverage gated |
| Determinism | fixed seeds, no time bound in a test, byte-equal stages | Strong |
| Observability | the round's verdict and causes, per-gate logs, panic positions | Strong |
| Documentation | `test-docref`, `test-docsnippet`, `test-spec-claims`, `test-docs` | Strong for references and code, partial for prose |
| Privacy | a local model, files as the only channel | Partial |
| Licence compliance | `THIRD-PARTY-NOTICES.md` held by `test-conventions` | Strong |
| Sustainability | a weekly CI, a factor per platform, time caps on jobs and gates | Strong; energy not measured |

## The nine product properties

### Functional suitability

**The compiler is checked against itself, against a second backend and against its specification.** The self-host builds ksplc with itself on the C and the LLVM backends, and stage1 and stage2 must agree. `test-equiv`, `test-property` and `test-random-equiv` check that C, LLVM, clang and gcc give programs that run alike. `test-generic-matrix`, `test-notation`, `test-split` and `test-ast-cache` each check that one way of building gives the same result as another.

**The specification's claims are compiled.** `test-spec-claims` compiles code that [`SPEC-programming-language.md`](SPEC-programming-language.md) calls refused or allowed, in pairs. `test-negative` checks that wrong programs are refused, and `test-conventions` checks that each diagnostic code has an input that shows it.

**Every package's tests run from a copy of its folder alone** (`test-extract`), on both backends (`debug`, `test-llvm-pkgs`). `test-surface` holds each published API to its record. `test-ksmd-browser` and `test-ksagent-chat` drive the two pages in a browser.

**What is not covered**: only the language specification has a claims gate. The specifications of kssrv, ksagent, ksmd, ksos and the local server are compared with the code by review.

### Performance efficiency

**Memory is gated; time is recorded.** `perf-log` judges the compiler's peak memory during its own build, and the sizes of its tree types. The build time is only logged, since a time differs from machine to machine ("No fixed time bound in a test" in [`SPEC-gates.md`](SPEC-gates.md)). `test-simd` checks that ksai's marked loops are vectorized.

**What is not covered**: the speed of generated programs, kssrv's throughput and the language server's latency are not measured. ksai's benchmarks and ksmd's `make measure` run by hand, with no baseline to judge against.

### Compatibility

**Each binary interface has its own gate.** `test-llvm-abi` checks that the two backends call each other correctly. `test-emit-runtime` checks that a runtime of another version does not link. `test-ship` links the shipped libraries into C and KSPL programs, static and shared. `test-layout-targets` checks every folded size against each machine ksplc knows.

**Formats and protocols have their own checks.** A ksmd file names its version, and the reader also takes version 1 ([`DESIGN-ksmd.md`](../ksmd/docs/DESIGN-ksmd.md)). `test-lsp`, `test-lsp-tree` and `test-vscode` check the language server and the editor extension.

**What is not covered**: Linux runs every gate, Windows the shared sections, and macOS a small set ("What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md)). No browser or sanitizer gate runs off Linux. The behaviour of Windows file systems is checked by hand on a Windows machine.

### Interaction capability

**For ksplc, every diagnostic explains itself.** `ksplc explain <code>` prints the section of [`SPEC-diagnostics.md`](../ksplc/docs/SPEC-diagnostics.md) for that code, and each code must have one. `--diagnostic-format=json` gives the same diagnostics to a program. `test-conventions` compares the options of ksplc, kssrv, ksmd and ksagent with their documents, both ways, and refuses internal names in messages.

**A model is a user too** ("The reader can be a model" in [`DESIGN-repository.md`](DESIGN-repository.md)). `ksplc doc` prints what a file publishes, and the language tutorial is generated from a program that the gates run.

**Both pages are checked for keyboard use, names and focus** by `test-ksmd-browser` and `test-ksagent-chat`, in Chromium on Linux. `test-conventions` holds every colour pair of both pages, in light and dark, to a contrast of 4.5:1. It refuses a colour written in a page's `.html`, where that measure would miss it.

**What is not covered**: no browser gate runs off Linux, and no screen reader is driven. The wording of a diagnostic is reviewed; only its spelling of names is checked.

### Reliability

**Failure is a value that cannot be ignored.** A function that can fail returns `T!E`, and the compiler refuses a result left untaken. Warning Zero holds through `lint` and `test-c-warnings`, and `test-lint-gate` shows that `lint` can fail.

**The tools that run long recover or refuse in a bounded way.** The language server restarts its worker after a crash or a hang (`test-lsp`; [`SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). kssrv bounds each connection's time and the number of connections, and counts its own heap ([`DESIGN-server.md`](../kssrv/docs/DESIGN-server.md)). ksdb's tests cut the power at each write in turn, and check that every finished record reads back.

**The memory and thread gates run on Linux.** `test-sanitize` runs the tests of ksplc, std, ksmd, ksagent, kssrv, ksai, ksdb, ksos, kspeg and kstls under the address, leak and undefined-behaviour sanitizers, on both backends. `test-race` runs the threaded programs once under ThreadSanitizer. `test-holes` checks that each known way to break memory or threads keeps its verdict. `test-fuzz` fuzzes ksplc, std's readers, kssrv's paths, ksai and ksos's network receive path on a fixed seed. It also fuzzes ksmd's document reader, kspeg's grammar reader and engine, ksdb's log on a damaged medium, and both halves of kstls. `make fuzz-long` goes deeper by hand.

**What is not covered**: `test-race` sees one schedule per run (its note in "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md)). A panic ends kssrv, and nothing in the repository starts it again.

### Security

**The language closes some holes and leaves others open, and says which.** Every access to a slice by index is checked at run time. A pointer into a function's frame cannot leave it by `return` or `throw`. A global, or a value handed to a new thread, cannot hold an `Rc`. KSPL has no borrow check, so a use after free is undefined ("8.4 Memory management" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). Lints such as [W0109] and [W0601] report part of what remains.

**The inputs from outside are checked where they arrive.** ksagent's Word and Excel readers are tested on zip bombs and damaged copies, under the sanitizers. The local server's rules are [`SPEC-local-server.md`](SPEC-local-server.md): the loopback, a token checked before any path, and headers that refuse framing. kssrv refuses a key file that others can read, on POSIX systems. ksmd's page and ksagent's chat page show a file's markup as text. Each page's Content-Security-Policy lets only its own scripts run, each named by its hash, and refuses any load from outside. `test-ksmd-browser` opens a crafted document and checks that nothing in it runs. It and `test-ksagent-chat` also put markup straight into their page, and check that the policy refuses it ([What a document cannot do in the page](../ksmd/docs/DESIGN-page.md#what-a-document-cannot-do-in-the-page)).

**The supply chain is pinned where it is fetched.** The workflows name each outside action by its hash, the Linux image's base by its digest, and the Chromium build by its SHA-256. `test-conventions` refuses an action or a base image named any other way. Each release carries `SHA256SUMS` over its files. Dependabot proposes updates. [`SECURITY.md`](SECURITY.md) says where to report a vulnerability and what counts as one.

**What is not covered**: on Windows, `secret_trust` in `std/fs.kspl` returns `unchecked`, since an ACL decides there.

### Maintainability

**Size and dead code are gated.** `lint` passes only at zero, with unused code ([W0206], [W0207], [W0208], [I0401], [I0402]) among its reports. It caps a function at 300 lines ([H0803]) and nesting at 8 levels ([H0805]). `test-conventions` caps a hand-written file at 1000 lines ("What the convention checks count" in [`SPEC-gates.md`](SPEC-gates.md)).

**The boundaries are gated.** `test-conventions` holds the layers of imports, and `test-docref` the direction of references. `test-extract` proves each package builds from its own folder, and `test-surface` records each published API. `test-fmt-tree` keeps every source formatted.

**The compiler can always rebuild itself.** It is built from a frozen C copy, the seed, and `test-seed-sum` checks that the seed was baked after the last compiler change ([`DESIGN-compiler.md`](../ksplc/docs/DESIGN-compiler.md)).

**What is not covered**: files in Python, make and Markdown have no line cap.

### Flexibility

**Two backends and several machines build the same source.** Both backends self-host. ksmd's page builds for wasm32. ksos runs on Cortex-M under QEMU (`test-ksos-qemu`), and its RP2040 demos link (`test-ksos-link`). `test-freestanding-math` and `test-ksos-posix` check the code that runs with no operating system, or on ksos's POSIX port.

**An installation is checked where it is made.** `make install` runs `self-host-ship` and `install-check` before it installs. A release unpacks itself and runs a first program on each platform ([`HOWTO-release.md`](HOWTO-release.md)).

**What is not covered**: for the other machines ksplc knows, only the sizes are checked. The root README lists them as untested ("'Supported' means someone uses it" in [`DESIGN-repository.md`](DESIGN-repository.md)).

### Safety

**ksos guards its own kernel under test.** A stack canary, a heap guard and the refusal of a wait with interrupts off run in `test-ksos-posix` and `test-ksos-qemu`. `lib/ksos/tests/motor_test.kspl` checks that every wheel command is scaled to the speed cap. `watchdog_test.kspl` in the same folder checks the watchdog's register values.

**The car's stop decisions are checked on the host; their sensors and wiring are checked on the car.** QEMU has no RP2040 model, so `test-ksos-link` only links that firmware. So each stop decision is a function with no hardware access. `lib/ksos/tests/stops_test.kspl` checks the battery, distance, remote and run-time stops of both car firmwares. It also checks that a panic's stop gives every wheel zero. Which parts still need the car is in ksos's bring-up tutorial, under [The safety timeouts of each firmware](../lib/ksos/docs/TUTORIAL-bring-up.md#the-safety-timeouts-of-each-firmware).

## The properties builders add

### Readability

**Length is checked by programs, and meaning by review.** `test-conventions` holds a published sentence to 25 words and a heading to 10. `lint` holds a comment's length ([H0806]). `test-fmt-tree` gives every source one layout. The plain-language rules are [`SPEC-plain-language.md`](SPEC-plain-language.md); review checks what a count cannot.

### Testability and verifiability

**A verdict must be earned.** Each row of the gate table names a failure case that its check must reject ("Every gate shows that it can fail" in [`SPEC-gates.md`](SPEC-gates.md)). A gate that prints no verdict fails, and so does a SKIP that its platform does not expect. stage1 and stage2 must agree byte for byte.

**What is not covered**: no gate measures code coverage. `make coverage` measures it by hand, by `.kspl` line. It counts the compiler over all of ksplc's tests, its suites included, and std over std's tests. A file of counts that cannot be read is left out, and the run says how many were. The LSP worker's counts are lost, since the server kills it and a killed process writes none. So the LSP files read lower than the tests reach. It is run when the tests are surveyed for the paths they miss, not in a round. It holds no number, so a path that no test takes is still found only by review, the fuzzers or the sanitizers.

### Determinism

**A test counts work and never bounds a time.** `test-conventions` refuses a test that compares an elapsed time with a constant ("No fixed time bound in a test" in [`SPEC-gates.md`](SPEC-gates.md)). Fuzzing and generated programs start from fixed seeds. `test-file-path` checks that a file's logical name does not depend on how its path is written.

### Observability

**A failed round says why in its last lines.** Each gate ends with one verdict line, and the round lists each cause with the path of its log ("How a run is read" in [`SPEC-gates.md`](SPEC-gates.md)). The logs are uploaded with every run. A panic names its file and line, and a failing `main` prints the path its error came through. `tools/kspl_lldb.py` shows KSPL values in lldb, and has a self-test.

### Documentation

**References and code in documents are checked; prose is reviewed.** `test-docref` checks every link, quoted heading, file and symbol name, and `make` target. `test-docsnippet` compiles every KSPL block, and `test-docs` runs the language tutorial. [W0211] checks a dotted name in a comment.

**What is not covered**: only the claims listed for `test-spec-claims` are compiled. The other specifications' claims, and every other sentence, are checked by review.

### Privacy

**ksagent keeps a person's files on their machine.** It asks a model server that the person runs, usually on the same machine. It shares nothing with the page but files in the folder ([`DESIGN-agent.md`](../ksagent/docs/DESIGN-agent.md)).

**What is not covered**: ksagent speaks only plain http to its model server. That is a decision, since std holds no TLS client ([The model server](../ksagent/docs/DESIGN-agent.md#the-model-server) in ksagent's design). ksmd's page fetches nothing from outside, and its Content-Security-Policy and `test-ksmd-browser` hold it to that.

### Licence compliance

**One table lists every notice owed.** [`THIRD-PARTY-NOTICES.md`](../THIRD-PARTY-NOTICES.md) names each file under another licence and the origin of each binary. `test-conventions` fails when a file is missing from it. Code rewritten from another's without its words is not caught ("What recipients are owed: one table, held by a gate" in [`DESIGN-repository.md`](DESIGN-repository.md)).

### Sustainability

**The checks are paid for in machine time, and each cost has a limit.** CI runs once a week and by hand, and each platform's minute costs a different factor ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)). Each job and each gate has a time cap. "Where CI's time goes, and what shrinks it" in [`DESIGN-repository.md`](DESIGN-repository.md) gives the reasons. Energy is not measured.

## Where the checks are weakest

**These gaps matter most, in this order.** Each one is checked by no gate today, or only in part. Where the gap follows a decision, the entry says where the decision is written.

| Gap | Why it matters |
| :-- | :-- |
| The car's sensors, wiring and panic hook are checked only on the car | A wrong stop harms people or things, and QEMU has no RP2040 model |
| No gate holds a coverage figure | `make coverage` measures it by hand, so a path that no test takes is found only by chance |
| Only memory is gated for performance | A slower compiler, server or generated program passes every gate |
| Only the language specification has a claims gate | The other specifications can drift from their code |

**Some gaps are decisions, with their reasons in the canonical source.** CI runs weekly ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)). `test-race` sees one schedule (its note in "What each platform runs" there). ksagent speaks plain http to its model ([The model server](../ksagent/docs/DESIGN-agent.md#the-model-server) in ksagent's design).
