# Kanso Programming Language (KSPL)

<img src="docs/kspl-icon.svg" alt="" width="112" align="right">

> [!CAUTION]
> **This repository is an experiment.** The language, standard library and tools can change without a deprecation period. These changes can break existing code. The repository can be deleted or replaced without notice. Do not depend on it.

**KSPL is a statically typed language for code that runs close to the machine.** The compiler checks every type before the program runs. Examples include microcontroller operating systems, web servers and artificial intelligence (AI) models. KSPL gives programmers C-like control over memory and speed. Its compiler catches more mistakes before a program runs.

**Only what you write happens.** No garbage collector frees unused memory in the background. Memory allocation requires an explicit request. No exception skips your code. A function that can fail declares that in its type.

**Follow the three [Quick start](#-quick-start-write-and-run-your-first-program) steps below.** Get the compiler `ksplc`. Save the four-line program as `hello.kspl`. Run `ksplc run hello.kspl`. Then read [`docs/TUTORIAL.md`](docs/TUTORIAL.md) to learn the language in short steps.

"Kanso" (簡素, simplicity) names the project’s design philosophy. KSPL is its first product. Kanso OS, Kanso Server, the AI engine, Kanso DataBase and Kanso Doc follow the same philosophy. Their folders appear in "Repository layout" below.

**The compiler turns KSPL into C.** A C compiler then builds the program. `ksplc` writes C99, the 1999 edition that nearly every C compiler accepts. A new platform therefore needs a C compiler rather than a port of the whole toolchain. [Where it is supported](#where-it-is-supported) lists the confirmed environments.

The diagram shows the path from a KSPL file to a program you can run.

```mermaid
flowchart LR
    KSPL[Your .kspl file] --> Compiler[ksplc, the KSPL compiler]
    Compiler -->|writes| C[C99 source]
    C -->|clang compiles| Bin[Program, OS image or AI engine]
```

**The compiler is written in KSPL**, which is called *self-hosting*. Building it therefore requires a KSPL compiler. The repository provides a *seed*: a saved version of the compiler already translated to C (`ksplc/seed.c`). `make` builds the seed with clang. The seed builds the current compiler, which rebuilds itself to check the result. This initial build process is called *bootstrapping*.

## 🚀 Getting started

### ⚡ Quick start (write and run your first program)

Put the C compiler `clang` on your PATH before starting. `ksplc` passes its generated C to clang.

1. **Get `ksplc`**

  **Build it from source** with `make`. It needs a clone of this repository, a C compiler and Make. On Windows, run these in the MSYS2 UCRT64 shell ("The environment for each platform" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md)).

  ```sh
  make                               # builds ksplc from the seed written in C
  make install                       # puts ksplc into ~/.local/bin, std/ into ~/.local/lib/kspl
  ```

  Read "Putting `ksplc` on the PATH" in [`docs/HOWTO-build.md`](docs/HOWTO-build.md) for installation requirements and failures.

  **Alternatively, download a zip** from the Releases page if one exists for your system.

  | Your system | The zip |
  | :-- | :-- |
  | Linux x64 | `ksplc-<version>-linux-x64.zip` |
  | macOS on Apple Silicon | `ksplc-<version>-macos-arm64.zip`. Continuous integration (CI) builds this toolchain, but nobody confirms it ([Where it is supported](#where-it-is-supported)) |
  | Windows x64 | `ksplc-<version>-windows-x64.zip` |

  Unpack the zip to place `ksplc` (or `ksplc.exe`) beside the standard library, `std/`. On Linux and macOS, run `chmod +x ksplc`. The compiler finds this `std/` from any folder. Read "Working in another folder" in [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) to run `ksplc` from anywhere.

2. **Write your first program**

  Save this program as `hello.kspl`. If you downloaded `ksplc`, save it inside the unpacked folder. `import "std/io"` provides the standard library’s input and output functions. The program starts at `main`.

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

Next, read [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) for arguments, working folders, distributable executables, programs with several files and VS Code. [`docs/TUTORIAL.md`](docs/TUTORIAL.md) teaches the language.

## 🧭 How it is designed

Each row is one idea that shapes the whole language, and what it means when you write code.

| Idea | What it means |
| :-- | :-- |
| **No hidden work** | Failures return as ordinary values. No exception unwinds the stack by leaving several functions at once. You choose how each type releases memory. `defer` releases it when the block ends. An arena holds memory that you free together. Reference counting releases memory when the last user releases its reference. |
| **Failure and absence appear in the type** | A function that can fail returns `T!E`: a `T` or an error `E`. The caller handles it with `!`, `catch` or `fallback`. `T?` represents a possibly missing value through `std/lang`’s `Option<\|T\|>`. A `switch` on it must handle `none`. |
| **Immutable by default** | A name without a mark cannot be changed after it is set. `$` marks the places where changing is allowed. |
| **Bounds and initialization are guarded** | A slice is a view of part of an array. It checks every index at run time. The compiler rejects reads of variables that have no value yet. Raw pointers remain available for low-level work. |
| **Offered as parts, not imposed** | Field-specific features, such as networking and scheduling, belong to the standard library. They are not language rules. Only imported features add cost. This keeps a real-time operating system (RTOS) small on a microcontroller. |
| **One means to one purpose** | Each purpose has one form. Command-line options have no aliases. Functions do not duplicate one another. Three fixed rules resolve each `import` path. The compiler does not search for files by relative path. |
| **A compiler a tool can read** | `--diagnostic-format=json` requests error messages as JSON. `ksplc explain <code>` explains each message code, and `ksplc explain` lists them. Editors, scripts and AI models can read this output directly. |
| **AI runs in it** | KSPL runs and trains AI models (`ksai/`). The models need no second implementation language. The same code runs on microcontrollers and servers. |

Read [`docs/DESIGN-principles.md`](docs/DESIGN-principles.md) for the reasons behind these ideas. Its section "Models write it, and AI runs in it" covers the last two rows. [`docs/SPEC-programming-language.md`](docs/SPEC-programming-language.md) defines imports in "The three strict rules of path resolution". Its section "8.4 Memory management" covers how to choose memory management.

## 📊 What works, and how far

Each row says what a part can do and how far that has been tested. A row counts only what actually ran, not what was written.

| Target | What it can do | How far it is confirmed |
| :-- | :-- | :-- |
| **The compiler** (`ksplc/`) | Writes C99 and supports generics, `T!E` and `defer`. Generics define code for several types; the compiler produces a copy for each type used. Includes a formatter, a Language Server and a linter. The Language Server provides go-to-definition and error marks in editors. The linter checks suspicious code. | **Self-hosting produces identical output.** The seed builds a compiler, which builds itself again. Both compilers generate exactly the same output. CI builds on Linux, macOS and Windows. Only some environments are supported ([below](#where-it-is-supported)). Language Server tests cover VS Code only. |
| **The LLVM IR backend** (LLVM’s intermediate representation, an output format besides C) | The language features pass | **Not shipped.** A second backend keeps the parser, semantic analysis and lowering independent of either output format. The reasons are in "The backends (Genc / Genllvm) and the runtime ABI" in [`ksplc/docs/DESIGN-backends.md`](ksplc/docs/DESIGN-backends.md). |
| **The standard library** (`std/`) | Files, time, environment variables, signals, hashing and randomness, thread synchronization, TCP, HTTP/1.1, asynchronous I/O, JSON, URLs, regular expressions, collection operations | No dependencies: it builds wherever the toolchain does, with nothing to install |
| **The bindings** (`ksbind/`) | A TLS client (encrypted connections) over OpenSSL | Only where OpenSSL is installed. **Run only on Linux** in CI |
| **The AI engine** (`ksai/`) | Tensor operations on multidimensional arrays, inference (running a model), training by backpropagation, fine-tuning with low-rank adaptation (LoRA), tokenization and safetensors weight files | Uses KSPL alone, with no external library. Includes continued training on the device. |
| **Kanso OS** (`ksos/`) | Cooperative scheduling lets tasks yield. Preemptive scheduling lets the OS interrupt tasks. Provides mutual exclusion, waiting, a heap and drivers using memory-mapped input/output (MMIO). Includes a minimal ARP/IPv4/UDP/TCP network stack. | Four ports: Cortex-M, Armv6-M, RP2040 and POSIX (a Linux or macOS process). **Runs on real RP2040 hardware** as well as in the QEMU emulator. Wireless is outside the scope because its license does not fit this repository’s attribution. |
| **Kanso Server** (`kssrv/`) | Serving static files (the car's policy file among them) and the file endpoints a local page uses | Many connections on one thread, in constant resident memory |
| **Edge AI** (AI on the device) | A policy trained on a PC runs on a microcontroller alone | **A closed loop on a palm-sized four-wheeled car.** It uses a Freenove car kit and a Raspberry Pi Pico W. The car makes decisions with the PC disconnected. Measured timings appear under "What has been checked on real hardware" in [ksos](ksos/README.md). |
| **The document editor** (`ksmd/`) | Prose, lists, formatting, calculating tables with resizable columns, images and included files, in a `.ksmd` source a person can read. Opens and saves the files of a folder through `kssrv --local`, and opens a document on a double-click. | Runs in a browser with wasm32. Browser tests drive headless Chromium on Linux through its own input events. Other browsers, a real input method editor (IME) and screen readers are untested. The double-click was checked by hand on Windows only. [ksmd](ksmd/README.md) lists what works. Its known limits are under "What a document costs" in [`ksmd/docs/DESIGN-ksmd.md`](ksmd/docs/DESIGN-ksmd.md). The page's gaps are under "What the editing page does not do yet" in [`ksmd/docs/DESIGN-page.md`](ksmd/docs/DESIGN-page.md). |

**The car demonstrates that the mechanism runs on a microcontroller.** It decides each manoeuvre with a policy trained on the PC, and it trains nothing while it drives. See "🤖 The AI on bare metal" in [`ksos/docs/DESIGN-rtos.md`](ksos/docs/DESIGN-rtos.md) for the reason. [`ksos/docs/HOWTO-bring-up.md`](ksos/docs/HOWTO-bring-up.md) explains how to bring it up. The device is a small microcontroller on a commercial car kit, not a passenger vehicle.

### Phases

**These foundation phases are complete.** Their order is listed below. The table above states how far each part is confirmed.

| Phase | Subject | State |
| :--: | :-- | :--: |
| 0 | Self-hosting from a minimal seed written in C | ✅ |
| 1 | The formatter, the Language Server and the linter | ✅ |
| 2 | A general-purpose language: `std/`, `ksai/`, `ksos/`, and what bare metal needs (inline assembly, `volatile`, custom linker scripts) | ✅ |
| 3 | Embedded systems, the Internet of Things (IoT) and edge AI. The Edge AI loop stores its result across power cycles in `ksdb/`. | ✅ |

**Current work focuses on improving the existing parts.** It addresses problems found in reviews and real runs. It also simplifies the parts, improves their speed and strengthens their checks. New features are not the main focus. [`docs/PLAN.md`](docs/PLAN.md) lists the remaining work by package.

### Where it is supported

**Only the first level is supported.** Each environment combines an operating system, a processor architecture and a C compiler. The C compiler processes KSPL’s output, so it partly determines whether a program runs. "'Supported' means someone uses it" in [`docs/DESIGN-repository.md`](docs/DESIGN-repository.md) explains these levels.

| Level | What stands behind it | Environments |
| :-- | :-- | :-- |
| **Supported** | CI runs the gates: checks that can fail the build. Daily development also exposes problems that gates do not check. | Linux x86-64 (glibc) with clang, configured by [`.devcontainer/`](.devcontainer/). Windows x64 with MSYS2 UCRT64’s clang, which builds the released Windows `ksplc.exe`. |
| **Built in CI, not confirmed** | CI builds the compiler and runs some gates. Nobody develops there, so problems outside those checks remain unconfirmed. | macOS arm64 with Xcode’s clang |
| **Untested** | No tests run there. C99 output makes these environments possible, but none is confirmed. | GCC. Windows x64 with LLVM’s clang targeting MSVC. MSVC’s `cl.exe` and `clang-cl`. Clang versions older than those above. Linux on arm64, on musl, or outside the image above. Intel Macs. Windows on Arm. 32-bit hosts. The BSDs. |

**A supported environment does not carry every package.** How far each package is confirmed is its row in [the table that opens this section](#-what-works-and-how-far). Which gate runs in which environment is in "What each platform runs" in [`docs/SPEC-gates.md`](docs/SPEC-gates.md).

## 📁 Repository layout

Each row names a top-level folder or file. Each package is a top-level folder built and shipped as one unit, such as `ksplc/` or `std/`. Its row links to its `README.md`.

| Directory / file | Description |
| :--- | :--- |
| **`ksplc/`** | The self-hosting compiler, the bootstrap seed (`seed.c`) and the canonical grammar `kspl.kspeg` ([entry point](ksplc/README.md) / [internal design](ksplc/docs/DESIGN-compiler.md)). |
| **`std/`** | The standard library, which the compiler itself depends on; flat, with no folders ([file list](std/README.md) / [design policy](std/docs/DESIGN-core.md)). |
| **`ksai/`** | The KSPL-native AI engine provides matrix computation, training, a tokenizer and weight files. `examples/llama_engine/` trains a tiny model further from embedded weights. `examples/qwen_infer/` provides a command-line interface (CLI) for Qwen2.5-family inference. `examples/car_pilot/` trains the car's policy and writes it to a file. `benches/` compares speed and energy use with Python and C. See the [introduction](ksai/README.md) and [design](ksai/docs/DESIGN-learning.md). |
| **`kspeg/`** | A parser that directly executes a parsing expression grammar (PEG): rules for reading text. It also runs KSPL’s grammar, `ksplc/kspl.kspeg`. See the [introduction](kspeg/README.md) and [notation specification](kspeg/docs/SPEC-notation.md). |
| **`ksos/`** | Kanso OS is a lightweight real-time OS. One kernel runs on bare-metal microcontrollers, with no OS beneath it, and on Linux hosts. See the [introduction](ksos/README.md), [design](ksos/docs/DESIGN-rtos.md) and [remaining work](docs/PLAN.md). |
| **`kssrv/`** | Kanso Server, which uses `std/net` and `std/http` ([introduction](kssrv/README.md) / [design](kssrv/docs/DESIGN-server.md) / [what is left](docs/PLAN.md)). |
| **`ksdb/`** | Kanso DataBase is a device database with no dependencies. It stores an append-only record on flash that survives power loss. See the [introduction](ksdb/README.md) and [design](ksdb/docs/DESIGN-storage.md). |
| **`ksbind/`** | Bindings to external C libraries: a TLS client over OpenSSL. They stay outside `std` so that `std` needs no other installation. See the [introduction](ksbind/README.md) and [design](ksbind/docs/DESIGN-bindings.md). |
| **`ksmd/`** | The document editor: prose, calculating tables and included documents in its own `.ksmd` language. Its page edits and saves files through `kssrv --local`; see [ksmd](ksmd/README.md). |
| **`docs/`** | Documents that cover the whole project. These include the [design rationale](docs/DESIGN-principles.md), [document rules](docs/SPEC-documents.md) and [remaining work](docs/PLAN.md). [`docs/README.md`](docs/README.md) lists their readers. |
| **`tests/`** | The test suites for the language, the toolchain and the OS ([entry point](tests/README.md)). |
| **`tools/`** | Tools for developing Kanso itself, in KSPL where possible, including `ai_assist/` (training the code-completion AI) ([entry point](tools/README.md) / [what is left](docs/PLAN.md)). |
| **`.vscode/`** | Editor settings, syntax highlighting for `.kspl` and `.kspeg`, and the native Language Server Protocol (LSP) extension. |
| **`.github/`** | GitHub Actions: `ci.yml` (continuous integration) and `release.yml` (per-OS binaries on a tag push). |
| **`.devcontainer/`** | The same environment for Dev Containers and Codespaces, ready to build and verify after cloning. |
| **`out/`** | Build artifacts are directly under `out/`; logs use `log/`, temporary files use `tmp/`, and target-specific artifacts use `ksos_*/`. Each package’s standalone `Makefile` builds into its own `out/`, such as `std/out/`. `make clean` removes the root and package output folders. It preserves outputs elsewhere. `make install-lsp` writes the language server to `.vscode/extensions/kspl/bin/`. `make fim-corpus` and `make fim-model` write the corpus and tokenizer to `tools/ai_assist/corpus/` and `tools/ai_assist/tokenizer/`. |
| **`Makefile`** | Bootstrapping and building. It loads `mk/` with `include`. How to use it is in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md). |

## 📜 License

Kanso is published under the [MIT License](LICENSE.md).

Note: **Only RP2040 files under `ksos/` require attribution to the Raspberry Pi pico-sdk (BSD-3-Clause).** These are its drivers, stage-2 bootloader and two boot-image tools. [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) lists the files and their attribution. It also covers third-party artifacts that are not bundled, including Qwen weights and vendor materials.

## 📖 Further reading

A document’s name identifies its kind. `TUTORIAL` teaches the language; `HOWTO-` gives task instructions. `SPEC-` defines rules; `DESIGN` explains their reasons. "Document naming" in [`docs/SPEC-documents.md`](docs/SPEC-documents.md) defines these kinds. A folder’s listing gives its reading order. The layout table above maps the repository.

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`docs/TUTORIAL.md`](docs/TUTORIAL.md) | The language one step at a time, through one program the gates run | Whoever is learning KSPL; start here after the quick start |
| [`docs/HOWTO-set-up-a-project.md`](docs/HOWTO-set-up-a-project.md) | After the quick start: arguments, an executable, several files, VS Code | Whoever writes KSPL and has `ksplc` |
| [`docs/SPEC-programming-language.md`](docs/SPEC-programming-language.md) | The language specification | Whoever writes KSPL and needs the exact rule |
| [`docs/HOWTO-build.md`](docs/HOWTO-build.md) | Building `ksplc` from source, the tests, and the environment for each platform | Whoever has no prebuilt `ksplc`, and whoever changes Kanso; both need a C compiler and Make |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Building from source, the gates, and the rules for changing Kanso | Whoever is about to change Kanso |
| [`docs/README.md`](docs/README.md) | Every document that belongs to no single package, and who each is for | Whoever looks for a document not listed here |
| Each package's `README.md` | That package's entry point, linked from its row in "Repository layout" above | Whoever uses or changes that package |
