# Kanso Programming Language (KSPL)

<img src="docs/kspl-icon.svg" alt="" width="112" align="right">

> [!CAUTION]
> **This repository is an experiment.** The language, standard library and tools can change without a deprecation period. These changes can break existing code. The repository can be deleted or replaced without notice. Do not depend on it.

**KSPL is a statically typed language for code that runs close to the machine.** Examples include microcontroller operating systems, web servers and artificial intelligence (AI) models. It gives programmers C-like control over memory and speed, and its compiler checks every type before the program runs.

**Only what you write happens.** No garbage collector frees unused memory in the background. Memory allocation requires an explicit request. No exception skips your code. A function that can fail declares that in its type.

**To start, follow the three [Quick start](#-quick-start-write-and-run-your-first-program) steps below**, then learn the language in short steps with [`docs/TUTORIAL-programming-language.md`](docs/TUTORIAL-programming-language.md).

"Kanso" (簡素, simplicity) names the project’s design philosophy, which KSPL, Kanso OS, Kanso Server, the AI engine, Kanso DataBase and Kanso Doc follow.

**The compiler turns KSPL into C99**, the 1999 edition of C that nearly every C compiler accepts, and a C compiler then builds the program. A new platform therefore needs a C compiler rather than a port of the whole toolchain. [Where it is supported](#where-it-is-supported) lists the confirmed environments.

The diagram shows the path from a KSPL file to a program you can run.

```mermaid
flowchart LR
    KSPL[Your .kspl file] --> Compiler[ksplc, the KSPL compiler]
    Compiler -->|writes| C[C99 source]
    C -->|clang compiles| Bin[Program, OS image or AI engine]
```

**The compiler is written in KSPL** (*self-hosting*). `make` *bootstraps* it from a *seed*, the compiler already translated to C (`ksplc/seed.c`), and the result rebuilds itself to check it.

## 🚀 Getting started

### ⚡ Quick start (write and run your first program)

Put the C compiler `clang` on your PATH before starting. `ksplc` passes its generated C to clang.

1. **Get `ksplc`**

  **Build it from source** with `make`. It needs a clone of this repository, a C compiler and Make. On Windows, run these in the MSYS2 UCRT64 shell ("The environment for each platform" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md)).

  ```sh
  make                               # builds ksplc from the seed written in C
  make install                       # puts ksplc into ~/.local/bin, std/ into ~/.local/lib/kspl
  ```

  Installation requirements and failures are in "Putting `ksplc` on the PATH" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md).

  **Alternatively, download a zip** from the Releases page if one exists for your system.

  | Your system | The zip |
  | :-- | :-- |
  | Linux x64 | `ksplc-<version>-linux-x64.zip` |
  | macOS on Apple Silicon | `ksplc-<version>-macos-arm64.zip`. Continuous integration (CI) builds it, but nobody confirms it ([Where it is supported](#where-it-is-supported)) |
  | Windows x64 | `ksplc-<version>-windows-x64.zip` |

  Unpack the zip, which places `ksplc` beside the standard library, `std/`. On Linux and macOS, run `chmod +x ksplc`. To run it from anywhere, read "Working in another folder" in [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md).

2. **Write your first program**

  Save this program as `hello.kspl`, inside the unpacked folder if you downloaded `ksplc`. `import "std/io"` provides the standard library’s input and output functions. The program starts at `main`.

  ```kspl
  import "std/io"

  fn main()
      io.out().s("Hello, Kanso!\n")
  ```

3. **Run it**

  ```sh
  ksplc run hello.kspl      # inside the unpacked folder: ./ksplc run hello.kspl
  ```

  `run` compiles, links and runs the program in one command. It prints `Hello, Kanso!`.

Next, [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) covers arguments, working folders, executables, programs with several files and VS Code.

## 🧭 How it is designed

| Idea | What it means |
| :-- | :-- |
| **No hidden work** | Failures return as ordinary values; no exception unwinds the stack. You choose how memory is released: `defer`, an arena, or reference counting. |
| **Failure and absence appear in the type** | A function that can fail returns `T!E`: a `T` or an error `E`. The caller handles it with `!`, `catch` or `fallback`. `T?` is a possibly missing value (`std/lang`’s `Option<\|T\|>`), and a `switch` on it must handle `none`. |
| **Immutable by default** | A name without a mark cannot be changed after it is set. `$` marks the places where changing is allowed. |
| **Bounds and initialization are guarded** | A slice, a view of part of an array, checks every index at run time. The compiler rejects reads of variables that have no value yet. Raw pointers remain for low-level work. |
| **Offered as parts, not imposed** | Networking, scheduling and the like belong to the standard library, not the language, and only imported features add cost. |
| **One means to one purpose** | Each purpose has one form. Command-line options have no aliases. Three fixed rules resolve each `import` path, with no search by relative path. |
| **A compiler a tool can read** | `--diagnostic-format=json` gives error messages as JSON, and `ksplc explain <code>` explains each message code, for editors, scripts and AI models. |
| **AI runs in it** | KSPL runs and trains AI models (`ksai/`) with no second implementation language, on microcontrollers and servers alike. |

The reasons are in [`docs/DESIGN-principles.md`](docs/DESIGN-principles.md); its section "Models write it, and AI runs in it" covers the last two rows. [`docs/SPEC-programming-language.md`](docs/SPEC-programming-language.md) defines imports in "The three strict rules of path resolution", and memory management in "8.4 Memory management".

## 📊 What works, and how far

A row counts only what actually ran.

| Target | What it can do | How far it is confirmed |
| :-- | :-- | :-- |
| **The compiler** (`ksplc/`) | Writes C99, with generics, `T!E` and `defer`. Includes a formatter, a linter, and a Language Server for editors. | **Self-hosting produces identical output** from the compiler the seed builds and the one it builds. CI builds on Linux, macOS and Windows ([below](#where-it-is-supported)). Language Server tests cover VS Code only. |
| **The LLVM IR backend** (LLVM’s intermediate representation, an output format besides C) | The language features pass | **Not shipped.** Why it exists is "The backends (Genc / Genllvm) and the runtime ABI" in [`ksplc/docs/DESIGN-backends.md`](ksplc/docs/DESIGN-backends.md). |
| **The standard library** (`std/`) | Files, time, environment variables, signals, hashing and randomness, thread synchronization, TCP, HTTP/1.1, asynchronous I/O, JSON, URLs, regular expressions, collection operations | No dependencies: it builds wherever the toolchain does |
| **The bindings** (`ksbind/`) | TLS over OpenSSL: a client, and the server half kssrv uses | **Run on Linux** in CI. The Windows job runs the tests too; no run there has confirmed them yet |
| **The AI engine** (`ksai/`) | Tensor operations, inference, training by backpropagation, fine-tuning with low-rank adaptation (LoRA), tokenization and safetensors weight files | KSPL alone, with no external library, including continued training on the device |
| **Kanso OS** (`ksos/`) | Cooperative and preemptive scheduling, mutual exclusion, waiting, a heap, memory-mapped I/O drivers, and a minimal ARP/IPv4/UDP/TCP stack | Ports for Cortex-M, Armv6-M, RP2040 and POSIX. **Runs on real RP2040 hardware** and in QEMU. Wireless is out of scope: its license does not fit this repository’s attribution. |
| **Kanso Server** (`kssrv/`) | Serving static files (the car's policy file among them) over HTTP or HTTPS, and the file endpoints a local page uses | Many connections on one thread, in constant resident memory. HTTPS is checked on Linux alone |
| **Edge AI** (AI on the device) | A policy trained on a PC runs on a microcontroller alone | **A closed loop on a palm-sized four-wheeled car** (a Freenove kit with a Raspberry Pi Pico W), deciding with the PC disconnected. Measured timings are under "What has been checked on real hardware" in [ksos](ksos/README.md). |
| **The folder agent** (`ksagent/`) | Answers questions about a folder's files through a model server on the same machine, citing lines it checks | **Only against a stand-in model server**; no real model runs in CI |
| **The document editor** (`ksmd/`) | Prose, lists, formatting, calculating tables with resizable columns, images and included files, in a `.ksmd` source a person can read. Opens and saves a folder's files through `kssrv --local`, and opens a document on a double-click. | Runs in a browser with wasm32. Browser tests drive headless Chromium on Linux. Other browsers, a real input method editor (IME) and screen readers are untested. The double-click was checked by hand on Windows only. [ksmd](ksmd/README.md) lists what works and its limits. |

**The car demonstrates that the mechanism runs on a microcontroller.** It decides with a policy trained on the PC, and trains nothing while it drives ("🤖 The AI on bare metal" in [`ksos/docs/DESIGN-rtos.md`](ksos/docs/DESIGN-rtos.md)). [`ksos/docs/HOWTO-bring-up.md`](ksos/docs/HOWTO-bring-up.md) brings it up. It is a commercial car kit, not a passenger vehicle.

### Phases

**These foundation phases are complete**, in this order. The table above states how far each part is confirmed.

| Phase | Subject | State |
| :--: | :-- | :--: |
| 0 | Self-hosting from a minimal seed written in C | ✅ |
| 1 | The formatter, the Language Server and the linter | ✅ |
| 2 | A general-purpose language: `std/`, `ksai/`, `ksos/`, and what bare metal needs (inline assembly, `volatile`, custom linker scripts) | ✅ |
| 3 | Embedded systems, the Internet of Things (IoT) and edge AI. The Edge AI loop stores its result across power cycles in `ksdb/`. | ✅ |

**Current work improves the existing parts** rather than adding features. [`docs/PLAN.md`](docs/PLAN.md) lists the remaining work by package.

### Where it is supported

**Only the first level is supported.** Each environment combines an operating system, a processor architecture and a C compiler, which processes KSPL’s output. "'Supported' means someone uses it" in [`docs/DESIGN-repository.md`](docs/DESIGN-repository.md) explains these levels.

| Level | What stands behind it | Environments |
| :-- | :-- | :-- |
| **Supported** | CI runs the gates: checks that can fail the build. Daily development also exposes problems that gates do not check. | Linux x86-64 (glibc) with clang, configured by [`.devcontainer/`](.devcontainer/). Windows x64 with MSYS2 UCRT64’s clang, which builds the released Windows `ksplc.exe`. |
| **Built in CI, not confirmed** | CI builds the compiler and runs some gates. Nobody develops there, so problems outside those checks remain unconfirmed. | macOS arm64 with Xcode’s clang |
| **Untested** | No tests run there. C99 output makes these environments possible, but none is confirmed. | GCC. Windows x64 with LLVM’s clang targeting MSVC. MSVC’s `cl.exe` and `clang-cl`. Clang versions older than those above. Linux on arm64, on musl, or outside the image above. Intel Macs. Windows on Arm. 32-bit hosts. The BSDs. |

**A supported environment does not carry every package**: each package's row in [the table above](#-what-works-and-how-far) says how far it is confirmed. Which gate runs where is "What each platform runs" in [`docs/SPEC-gates.md`](docs/SPEC-gates.md).

## 📁 Repository layout

A package is a top-level folder built and shipped as one unit, and its row links to its `README.md`.

| Directory / file | Description |
| :--- | :--- |
| **`ksplc/`** | The self-hosting compiler, the bootstrap seed (`seed.c`) and the canonical grammar `kspl.kspeg` ([entry point](ksplc/README.md) / [internal design](ksplc/docs/DESIGN-compiler.md)). |
| **`std/`** | The standard library, which the compiler itself depends on; flat, with no folders ([file list](std/README.md) / [design policy](std/docs/DESIGN-core.md)). |
| **`ksai/`** | The KSPL-native AI engine: matrix computation, training, a tokenizer and weight files. Its `examples/` train and run models, including a server for ksagent, and `benches/` compares speed and energy with Python and C ([introduction](ksai/README.md) / [design](ksai/docs/DESIGN-learning.md)). |
| **`kspeg/`** | A parser that directly executes a parsing expression grammar (PEG), KSPL’s grammar `ksplc/kspl.kspeg` included ([introduction](kspeg/README.md) / [notation](kspeg/docs/SPEC-notation.md)). |
| **`ksos/`** | Kanso OS, a lightweight real-time OS: one kernel on bare-metal microcontrollers and on Linux hosts ([introduction](ksos/README.md) / [design](ksos/docs/DESIGN-rtos.md) / [remaining work](docs/PLAN.md)). |
| **`kssrv/`** | Kanso Server, which uses `std/net` and `std/http` ([introduction](kssrv/README.md) / [design](kssrv/docs/DESIGN-server.md) / [what is left](docs/PLAN.md)). |
| **`ksdb/`** | Kanso DataBase, a device database with no dependencies: an append-only record on flash that survives power loss ([introduction](ksdb/README.md) / [design](ksdb/docs/DESIGN-storage.md)). |
| **`ksbind/`** | Bindings to external C libraries: TLS over OpenSSL, kept outside `std` so that `std` needs no other installation ([introduction](ksbind/README.md) / [design](ksbind/docs/DESIGN-bindings.md)). |
| **`ksmd/`** | The document editor: prose, calculating tables and included documents in its own `.ksmd` language, edited and saved through `kssrv --local` ([ksmd](ksmd/README.md)). |
| **`ksagent/`** | Answers questions about the files in one folder through a model server on your machine, citing and checking its lines ([introduction](ksagent/README.md) / [design](ksagent/docs/DESIGN-agent.md)). |
| **`models/`** | The model files downloaded to run on this machine, which Git ignores; which models and how to start them is its [entry point](models/README.md). |
| **`docs/`** | Documents that cover the whole project, such as the [design rationale](docs/DESIGN-principles.md), [document rules](docs/SPEC-documents.md) and [remaining work](docs/PLAN.md). [`docs/README.md`](docs/README.md) lists their readers. |
| **`tests/`** | The test suites for the language, the toolchain and the OS ([entry point](tests/README.md)). |
| **`tools/`** | Tools for developing Kanso itself, in KSPL where possible, including `ai_assist/` (training the code-completion AI) ([entry point](tools/README.md) / [what is left](docs/PLAN.md)). |
| **`.vscode/`** | Editor settings, syntax highlighting for `.kspl` and `.kspeg`, and the Language Server Protocol (LSP) extension. |
| **`.github/`** | GitHub Actions: `ci.yml` and `release.yml` (per-OS binaries on a tag push). |
| **`.devcontainer/`** | The same environment for Dev Containers and Codespaces. |
| **`out/`** | Build artifacts: the programs a person runs at the top, and `gen/`, `test/`, `log/`, `tmp/` and target-specific `ksos_*/` inside ("What goes where in `out/`" in [`docs/DESIGN-repository.md`](docs/DESIGN-repository.md)). A package’s own `Makefile` builds into its own `out/`. `make clean` removes these output folders and nothing else. |
| **`Makefile`** | Bootstrapping and building. It loads `mk/` with `include`. How to use it is in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). |

## 📜 License

Kanso is published under the [MIT License](LICENSE.md).

Note: **Some files under `ksos/`, `ksai/` and `ksagent/` owe a notice to the work they follow.** Among them are the Raspberry Pi pico-sdk (BSD-3-Clause), llama.cpp (MIT) and zlib's puff (zlib License). [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) lists each file with its notice. It also covers third-party artifacts that are not bundled, including Qwen weights and vendor materials.

## 📖 Further reading

A document’s name identifies its kind: `TUTORIAL-` teaches, `HOWTO-` gives task instructions, `SPEC-` defines rules, and `DESIGN` explains their reasons ("Document naming" in [`docs/SPEC-documents.md`](docs/SPEC-documents.md)).

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`docs/TUTORIAL-programming-language.md`](docs/TUTORIAL-programming-language.md) | The language one step at a time, through one program the gates run | Whoever is learning KSPL; start here after the quick start |
| [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) | After the quick start: arguments, an executable, several files, VS Code | Whoever writes KSPL and has `ksplc` |
| [`docs/SPEC-programming-language.md`](docs/SPEC-programming-language.md) | The language specification | Whoever writes KSPL and needs the exact rule |
| [`ksagent/docs/TUTORIAL-ask-about-your-files.md`](ksagent/docs/TUTORIAL-ask-about-your-files.md) | Asking questions about a folder of Word, Excel and text files, with a model on your own computer | Whoever wants answers from their own documents, with the sources checked |
| [`docs/HOWTO-build.md`](docs/HOWTO-build.md) | Building `ksplc` from source, the tests, and the environment for each platform | Whoever has no prebuilt `ksplc`, and whoever changes Kanso; both need a C compiler and Make |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Building from source, the gates, and the rules for changing Kanso | Whoever is about to change Kanso |
| [`docs/README.md`](docs/README.md) | Every document that belongs to no single package, and who each is for | Whoever looks for a document not listed here |
| Each package's `README.md` | That package's entry point, linked from its row in "Repository layout" above | Whoever uses or changes that package |
