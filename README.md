# Kanso Programming Language (KSPL)

<img src="docs/kspl-icon.svg" alt="" width="112" align="right">

> [!CAUTION]
> **This repository is an experiment.** The language, the standard library and every tool may change in ways that break existing code, with no deprecation period. The repository itself may be deleted or replaced without notice. Do not depend on it.

**KSPL is a statically typed programming language (every type is checked before the program runs) for code that runs close to the machine**: a small operating system on a microcontroller, a web server, an AI model. It is for programmers who want the control C gives them over memory and speed, and want the compiler to catch more mistakes before the program runs.

**Only what you write happens.** There is no garbage collector (a background process that frees memory you no longer use), no memory allocation you did not ask for, and no exception that jumps past your code: a function that can fail says so in its type.

**To try it, follow the three steps of the [Quick start](#-quick-start-write-and-run-your-first-program) below**: get the compiler `ksplc`, save a five-line `hello.kspls`, and type `ksplc run hello.kspls`. Then [`docs/TOUR.md`](docs/TOUR.md) teaches the language in short steps.

"Kanso" (簡素, plainness) names the design philosophy of the whole project. KSPL is its first product. Kanso OS, Kanso Server, the AI engine, Kanso DataBase and Kanso Doc follow the same philosophy (their folders are in "Repository layout" below).

**The compiler turns KSPL into C, and a C compiler makes the program.** The compiler `ksplc` writes C99 (the 1999 edition of C, which nearly every C compiler accepts). So a new platform needs only a C compiler, not a port of the whole toolchain. [Where it is supported](#where-it-is-supported) below lists where this is confirmed to run.

The diagram shows the path from a KSPL file to a program you can run.

```mermaid
flowchart LR
    KSPL[Your .kspls file] --> Compiler[ksplc, the KSPL compiler]
    Compiler -->|writes| C[C99 source]
    C -->|clang compiles| Bin[Program, OS image or AI engine]
```

**The compiler is written in KSPL itself**, which is called *self-hosting*. That raises a chicken-and-egg problem: you need a KSPL compiler to build it. So the repository also holds a *seed*, a copy of the compiler taken at one moment and already translated to C (`ksplc/seed.c`). `make` builds the seed with clang, the seed builds the current compiler, and that compiler rebuilds itself to check the result. This first step is called *bootstrapping*.

## 🚀 Getting started

### ⚡ Quick start (write and run your first program)

The steps need a C compiler (`clang`) on the PATH, since `ksplc` passes its output to one.

1. **Get `ksplc`**

  **Build it from source** with `make`. It needs a clone of this repository, a C compiler and Make. On Windows, run these in the MSYS2 UCRT64 shell ("Windows natively, without Docker" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md)).

  ```sh
  make                               # builds ksplc from the seed written in C
  make install                       # puts ksplc into ~/.local/bin, std/ into ~/.local/lib/kspl
  ```

  What `make install` needs, and the three ways it fails, are in "Putting `ksplc` on the PATH" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md).

  **Or download it**, if the Releases page has a zip for your system:

  | Your system | The zip |
  | :-- | :-- |
  | Linux x64 | `ksplc-<version>-linux-x64.zip` |
  | macOS on Apple Silicon | `ksplc-<version>-macos-arm64.zip`. It comes from a toolchain that CI builds but nobody confirms ([Where it is supported](#where-it-is-supported)) |
  | Windows x64 | `ksplc-<version>-windows-x64.zip` |

  Unpacking puts `ksplc` (or `ksplc.exe`) and `std/`, the standard library, side by side. On Linux and macOS, `chmod +x ksplc` makes it runnable. It finds that `std/` from any folder; to type `ksplc` from anywhere, see "Working in another folder" in [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md).

2. **Write your first program**

  Save the following as `hello.kspls` (inside the unpacked folder, if you downloaded `ksplc`). `import "std/io"` brings in the standard library's input and output, and `main` is where the program starts.

  ```kspls
  import "std/io"

  fn main()
      io.out().s("Hello, Kanso!\n")
  ```

3. **Run it**

  ```sh
  ksplc run hello.kspls      # inside the unpacked folder: ./ksplc run hello.kspls
  ```

  `run` compiles, links and runs it in one command. You should see `Hello, Kanso!`.

Next, [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) continues from here: passing arguments, working in another folder, an executable to distribute, a program split into files, and VS Code. [`docs/TOUR.md`](docs/TOUR.md) teaches the language.

## 🧭 How it is designed

Each row is one idea that shapes the whole language, and what it means when you write code.

| Idea | What it means |
| :-- | :-- |
| **No hidden work** | No exception unwinds the stack (jumps out through several functions at once): a failure is an ordinary return value. You choose how each type is freed: `defer` (free it when the block ends), an arena (a pool you free all at once) or reference counting (freed when the last user lets go). |
| **Failure and absence appear in the type** | A function that can fail returns `T!E`, read "a `T`, or an error `E`". The caller handles it with `!`, `catch` or `fallback`. A value that may be missing is `T?` (`std/lang`'s `Option<\|T\|>`), and a `switch` on it must handle `none`. |
| **Immutable by default** | A name without a mark cannot be changed after it is set. `$` marks the places where changing is allowed. |
| **Bounds and initialization are guarded** | A slice (a view of part of an array) checks every index while the program runs. Reading a variable before it is given a value is stopped at compile time. Raw pointers remain for low-level work. |
| **Offered as parts, not imposed** | Features for one field (networking, a scheduler) are parts of the standard library, not rules of the language. You pay only for what you `import`, so a real-time OS (RTOS) on a microcontroller stays small. |
| **One means to one purpose** | Nothing can be written two ways: no two names for one command-line option, no two functions that do the same, no searching for files by relative path. The compiler never searches for an `import` path; three fixed rules find the file. |
| **A compiler a tool can read** | On request (`--diagnostic-format=json`), the compiler writes its error messages as JSON, and `ksplc explain <code>` explains each message code. An editor, a script or an AI model reading the output needs nothing else. |
| **AI runs in it** | Running and training AI models is KSPL too (`ksai/`), with no second language under the model. The same code runs on a microcontroller and on a server. |

The reasons for each idea are in [`docs/DESIGN.md`](docs/DESIGN.md); for the last two rows, they are in "16. Models write it, and AI runs in it" in [`docs/DESIGN.md`](docs/DESIGN.md). How an `import` path resolves is in "The three strict rules of path resolution" in [`docs/SPEC-language.md`](docs/SPEC-language.md), and choosing a way of freeing is in "8.4 The memory management model: `defer` / ARC / arenas" there.

## 📊 What works, and how far

Each row says what a part can do and how far that has been tested. A row counts only what actually ran, not what was written.

| Target | What it can do | How far it is confirmed |
| :-- | :-- | :-- |
| **The compiler** (`ksplc/`) | Writes C99. Generics (code written once for many types; the compiler makes one copy per type used), `T!E`, `defer`, the formatter, the Language Server (what gives an editor go-to-definition and error marks), the linter (a checker for suspicious code) | It builds itself in two stages from the seed, and **is self-hosting with zero difference**: the compiler the seed built and the compiler that built itself write exactly the same output. CI builds it on Linux, macOS and two Windows setups; only some of these are supported ([below](#where-it-is-supported)). The Language Server is tested only with VS Code |
| **The LLVM IR backend** (a second output: LLVM's code format instead of C) | The language features pass | **Not shipped.** It is kept as a mirror: with two backends to serve, the earlier stages of the compiler (parse, sema, lower) cannot come to depend on either ("6. The backends (Genc / Genllvm) and the runtime ABI" in [`ksplc/docs/DESIGN.md`](ksplc/docs/DESIGN.md)) |
| **The standard library** (`std/`) | Files, time, environment variables, signals, hashing and randomness, thread synchronization, TCP/UDP, HTTP/1.1, asynchronous I/O, JSON, URLs, regular expressions, collection operations | No dependencies: it builds wherever the toolchain does, with nothing to install |
| **The bindings** (`ksbind/`) | A TLS client (encrypted connections) over OpenSSL, and SQLite | Only where OpenSSL and SQLite are installed. **Run only on Linux** in CI |
| **The AI engine** (`ksai/`) | Tensor (multi-dimensional array) operations, inference (running a model), training (backpropagation), fine-tuning with LoRA, a tokenizer, safetensors weight files | KSPL alone, with no external library, including continued training on the device |
| **Kanso OS** (`ksos/`) | Cooperative and preemptive scheduling (tasks that yield, and tasks the OS interrupts), mutual exclusion and waiting, a heap, drivers that talk to hardware through its memory addresses (MMIO), a minimal ARP/IPv4/UDP/TCP network stack | Three ports: Cortex-M, Armv6-M and POSIX (a process on Linux or macOS). **Runs on real silicon (RP2040)**, not only in the QEMU emulator. Wireless is out of scope (its license does not fit this repository's attribution) |
| **Kanso Server** (`kssrv/`) | Serving static files, the file endpoints a local page uses, steering the car | Many connections on one thread, in constant resident memory |
| **Edge AI** (AI on the device itself) | A policy trained on a PC and run on a microcontroller alone | **A closed loop on a palm-sized four-wheeled car** (a Freenove car kit plus a Raspberry Pi Pico W). It decides with the PC disconnected (measured timings are in "What has been checked on real hardware" in [ksos](ksos/README.md)) |
| **The document editing system** (`kspage/`) | Prose, tables and presentation material as one document: typing, formatting, table formulas, figures, a table of contents, chapter numbers, printing, Markdown export | Runs in a browser (wasm32 + canvas). CI runs the wasm under `node`, and the input handling in a real browser: headless Chromium on Linux. Other browsers and input-method (IME) conversion are untested. **Not complete as an editing system** (what is there and what is not: [kspage](kspage/README.md)) |

**The car shows only that the mechanism runs on a microcontroller.** Its predictions are no better than "the same as last time", and the accuracy target is unmet (why: "🤖 The AI on bare metal" in [`ksos/docs/DESIGN.md`](ksos/docs/DESIGN.md); how to read it: [`ksos/docs/HOWTO-bring-up.md`](ksos/docs/HOWTO-bring-up.md)). It is also a small microcontroller on a commercial car kit, not a car a person rides in.

### Phases

**The foundation was built in these phases, in this order, and it is done.** How far each part is confirmed is in its row of the table above.

| Phase | Subject | State |
| :--: | :-- | :--: |
| 0 | Standing on its own: self-hosting from a minimal seed written in C | ✅ |
| 1 | The formatter, the Language Server and the linter | ✅ |
| 2 | A general-purpose language: `std/`, `ksai/`, `ksos/`, and what bare metal needs (inline assembly, `volatile`, custom linker scripts) | ✅ |
| 3 | Demonstrating embedded, IoT and edge AI: the Edge AI loop, its result kept across power cycles in `ksdb/` | ✅ |

**For now the work is mainly the quality of what is already built**, not new features: fixing what reviews and real runs find, and making the existing parts simpler, faster and better checked. What is left in each package is in its plan ([`docs/PLAN.md`](docs/PLAN.md)).

### Where it is supported

**Only the first level is supported.** Each row names the operating system, the processor architecture and the C compiler together. ksplc hands its output to a C compiler, so that compiler partly decides whether a program runs. Why the levels are set this way is in "15.3 'Supported' means someone uses it" in [`docs/DESIGN.md`](docs/DESIGN.md).

| Level | What stands behind it | Environments |
| :-- | :-- | :-- |
| **Supported** | The gates (the checks CI runs, any of which can fail the build) run there in CI, and Kanso is developed there day to day, so a person sees what no gate checks | Linux x86-64 (glibc) with clang, as [`.devcontainer/`](.devcontainer/) sets it up; Windows x64 with MSYS2 UCRT64's clang, which builds the released Windows `ksplc.exe` |
| **Built in CI, not confirmed** | A CI job builds it and runs part of the gates; nobody develops there, so nobody sees what no gate checks | macOS arm64 with Xcode's clang |
| **Untested** | Nothing runs there. It may work, since the output is C99, but nothing has shown it | GCC as the C compiler; Windows x64 with LLVM's own clang, which targets MSVC; MSVC's own `cl.exe` and `clang-cl`; a clang older than the rows above use; Linux on arm64, on musl, or other than the image above; Intel Macs; Windows on Arm; 32-bit hosts; the BSDs |

**A supported environment does not carry every package.** How far each package is confirmed is its row in [the table that opens this section](#-what-works-and-how-far). Which gate runs in which environment is in "What each platform runs" in [`docs/SPEC-gates.md`](docs/SPEC-gates.md).

## 📁 Repository layout

Each row is a top-level folder or file. Each package (a top-level folder built and shipped as one unit, such as `ksplc/` or `std/`) has a `README.md`, linked from its row.

| Directory / file | Description |
| :--- | :--- |
| **`ksplc/`** | The self-hosting compiler, the bootstrap seed (`seed.c`) and the canonical grammar `kspl.kspeg` ([entry point](ksplc/README.md) / [internal design](ksplc/docs/DESIGN.md)). |
| **`std/`** | The standard library, which the compiler itself depends on; flat, with no folders ([file list](std/README.md) / [design policy](std/docs/DESIGN.md)). |
| **`ksai/`** | The KSPL-native AI engine, with its own matrix computation, training, tokenizer and weight files. Its examples are `examples/llama_engine/` (training a tiny model further from its embedded weights) and `examples/qwen_infer/` (a Qwen2.5-family inference CLI); `benches/` measures speed and energy against Python and C ([introduction](ksai/README.md) / [design](ksai/docs/DESIGN.md)). |
| **`kspeg/`** | A parser that runs a PEG grammar (a set of rules that says how text is read) directly, KSPL's own (`ksplc/kspl.kspeg`) among them ([introduction](kspeg/README.md) / [notation specification](kspeg/docs/SPEC-notation.md)). |
| **`ksos/`** | The lightweight real-time OS (Kanso OS): one kernel from a bare-metal microcontroller (no OS beneath it) to a Linux host ([introduction](ksos/README.md) / [design](ksos/docs/DESIGN.md) / [what is left](ksos/docs/PLAN.md)). |
| **`kssrv/`** | The server (Kanso Server), on top of `std/net` and `std/http` ([introduction](kssrv/README.md) / [design](kssrv/docs/DESIGN.md) / [what is left](kssrv/docs/PLAN.md)). |
| **`ksdb/`** | A zero-dependency database for inside a device (Kanso DataBase): an append-only record on flash that survives power loss ([introduction](ksdb/README.md) / [design](ksdb/docs/DESIGN.md)). |
| **`ksbind/`** | Bindings to C libraries from outside the toolchain, kept out of `std` so that `std` needs nothing installed: a TLS client over OpenSSL, and SQLite ([introduction](ksbind/README.md) / [design](ksbind/docs/DESIGN.md)). |
| **`kspage/`** | The editing system for prose, tables and presentation material as one document (Kanso Doc), with a browser port (wasm32 + canvas) ([introduction](kspage/README.md) / [design](kspage/docs/DESIGN.md)). |
| **`docs/`** | The documents belonging to no single package, such as [the design rationale](docs/DESIGN.md), [the rules every document obeys](docs/SPEC-documents.md) and [what is left](docs/PLAN.md). The table in [`docs/README.md`](docs/README.md) says who each is for. |
| **`tests/`** | The test suites for the language, the toolchain and the OS ([entry point](tests/README.md)). |
| **`tools/`** | Tools for developing Kanso itself, in KSPL where possible, including `ai_assist/` (training the code-completion AI) ([entry point](tools/README.md) / [what is left](tools/docs/PLAN.md)). |
| **`.vscode/`** | Editor settings, syntax highlighting for `.kspls` and `.kspeg`, and the native LSP extension. |
| **`.github/`** | GitHub Actions: `ci.yml` (continuous integration) and `release.yml` (per-OS binaries on a tag push). |
| **`.devcontainer/`** | An identical Dev Containers / Codespaces environment, ready to build and verify right after cloning. |
| **`out/`** | The output: artifacts directly under it, logs in `log/`, temporaries in `tmp/`, per-target artifacts in `ksos_*/`. `make clean` removes it all. |
| **`Makefile`** | Bootstrapping and building; it pulls in `mk/` with `include`. How to use it is in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). |

## 📜 License

Kanso is published under the [MIT License](LICENSE.md).

Note: **Only the RP2040 files under `ksos/` owe a notice to the Raspberry Pi pico-sdk (BSD-3-Clause)**: its drivers, its stage-2 bootloader and the two tools that make its boot image. Their attribution and files, and the third-party artifacts not bundled (the Qwen weights, vendor materials), are in [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).

## 📖 Further reading

A document's name says its kind: `TOUR` to learn, `HOWTO-` to do a task, `SPEC-` to look a rule up, `DESIGN` to understand why ("Document naming" in [`docs/SPEC-documents.md`](docs/SPEC-documents.md)). A folder's listing is its reading order, and the layout table above is the whole map.

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`docs/TOUR.md`](docs/TOUR.md) | The language one step at a time, through one program the gates run | Whoever is learning KSPL; start here after the quick start |
| [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) | After the quick start: arguments, an executable, several files, VS Code | Whoever writes KSPL and has `ksplc` |
| [`docs/SPEC-language.md`](docs/SPEC-language.md) | The language specification | Whoever writes KSPL and needs the exact rule |
| [`docs/HOWTO-build.md`](docs/HOWTO-build.md) | Building `ksplc` from source, the tests, and Windows without Docker | Whoever has no prebuilt `ksplc`, and whoever changes Kanso; both need a C compiler and Make |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Building from source, the gates, and the rules for changing Kanso | Whoever is about to change Kanso |
| [`docs/README.md`](docs/README.md) | Every document that belongs to no single package, and who each is for | Whoever looks for a document not listed here |
| Each package's `README.md` | That package's entry point, linked from its row in "Repository layout" above | Whoever uses or changes that package |
