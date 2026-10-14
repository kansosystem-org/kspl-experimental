# Building Kanso from source

**This guide builds the KSPL compiler `ksplc` from a clone of this repository, and then runs the formatter, the linter and the tests.** It is for two readers, and both need a C compiler and Make:

| You are | What to read |
| :-- | :-- |
| Writing programs, with no prebuilt `ksplc` for your system | Only "The two-stage bootstrap (`make`)" and "Putting `ksplc` on the PATH" below. Then continue with the quick start in the root [`README.md`](../README.md) |
| Changing Kanso itself | All of it |

What every gate (each check CI runs, any of which can fail the build) checks, and on which platform, is in [`SPEC-gates.md`](SPEC-gates.md).

## Requirements

**KSPL builds with a C compiler (Clang) and Make, and nothing else.** It needs no CMake, no C++ toolchain and no external library. The supported environments are in "Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported).

| Tool | What it is for | Needed? |
| :-- | :-- | :-- |
| **Clang** | Compiles the generated C, as `clang -std=c99` by default. The quick start needs it too, to link the C that KSPL emits | Yes |
| **Make** | Builds the compiler from source and drives the two-stage bootstrap, the LSP server and the rest | Yes |
| **Clang-Format** | Tidies the generated C in the two places a person reads it, `make debug-file` and `make commit-seed` | Optional, except for `make commit-seed`. Without it, `make debug-file` (VS Code's F5) leaves its C as generated and says so in one line; `make commit-seed` stops, since the seed in git is tidied and an untidied one would change every line of it |

**That is what building needs. Running every gate needs more** (a second C compiler, the sanitizers, node and the rest): `.devcontainer/Dockerfile` installs each tool the gates use, and is their one list. Where a gate meets a missing tool, "Gates that pass silently where a tool is missing" in [`SPEC-gates.md`](SPEC-gates.md) says what it does, and on Linux how to run without the tool.

## Building and testing

**Clone the repository, then run `make` in its top folder.** Set the console to UTF-8 before running. The steps in this section, in order:

1. `make` builds the compiler ("The two-stage bootstrap" below).
2. `make install` puts it on your PATH, so you can type `ksplc` anywhere (optional).
3. If you change Kanso: `make fmt`, `make lint` and `make debug` format, check and test it.

**Keep the clone outside a cloud-synced folder** (OneDrive, Dropbox, iCloud Drive and the like). The build writes thousands of short-lived files under `out/`, and the sync agent locks and uploads each as it appears. One test deliberately makes a path longer than Windows's 260 characters, and OneDrive refuses to sync it.

**On Windows with Docker, keep the clone inside WSL2's own filesystem** (for example `~/src/kspl`), not in a Windows folder mounted into the container. That folder has no POSIX permissions, so every file reads as executable, and the build is slower.

### The two-stage bootstrap (`make`)

**`make` builds the compiler in three steps, because the compiler is written in KSPL and needs a compiler to build it.** The first compiler is the *seed*, a copy of the compiler already translated to C (`ksplc/seed.c`).

1. Clang compiles the seed into `out/ksplc_seed.exe`.
2. The seed compiles the current compiler source into Stage1 (`out/ksplc_stage1.exe`).
3. Stage1 compiles the same source again, into Stage2, and the two outputs must match byte for byte.

```sh
make
```

**When it works, the last line reads `RESULT: ALL PASS (self-hosting, c backend)`.** Why the two stages must match, and how the seed is kept in step, are in "The bootstrap, and keeping the seed in step" in [`ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

**A copy of `ksplc/` bootstraps the same way from any `ksplc`.** Run `make self-host` in that folder, and tell it where `std` and kspeg are, as for any package (the top of [`ksplc/Makefile`](../ksplc/Makefile)).

**Two variables change what is built:**

| Command | What it does |
| :-- | :-- |
| `make LLVM=1` (and `make LLVM=1 debug`) | Uses the LLVM backend instead of the C backend. A switch reads `0` or `1` alone: `LLVM=true` stops make, rather than quietly building the C backend |
| `make debug-file SRC_KSPL=<file.kspls>` | Builds one file with debug information (VS Code's F5 calls it) |

### The formatter and the linter (`make fmt` / `make lint`)

**`make fmt` lays out every source file in the standard style, and `make lint` reports suspicious code.**

```sh
make fmt
make lint
```

Formatting runs as many files at once as there are cores (`FMT_JOBS`, default `nproc`). The files are independent, so the result is the same. **`make fmt FMT_JOBS=1` runs one file at a time**, for when the failures should come in a fixed order.

**`make fmt` formats with the seed, while the formatting gate (`make test-kspls-trip`) asks the ksplc just built.** After a change to ksplc's formatter, run `make commit-seed` before `make fmt`, or the gate keeps failing on files `make fmt` leaves as they are.

**`make fmt` formats `.kspl` and `.kspls` each in its own notation** (braces, or indentation), and `make lint` accepts either. "3.1 Basic use" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md) covers converting between the notations, and the one comment `make lint` asks you to move so the round trip is exact (why: "The indentation notation" in [`DESIGN.md`](DESIGN.md)).

### The tests (`make debug`)

**`make debug` builds the tests of most packages, and of `tools/`, into one program and runs it.** Which tests it calls, and in what order, is set by `main` in `tests/debug/main.kspls`.

```sh
make debug                         # every test main.kspls calls
make debug-std                     # std only (an order of magnitude less to build)
```

Note: After changing one package, `make debug-<name>` answers sooner. **It does not narrow what must be confirmed**: every package builds on `std/`, so run `make ci-linux` before pushing.

### Putting `ksplc` on the PATH (`make install`, optional)

**`make install` copies the compiler and its standard library to where your shell finds them, so `ksplc` works from any folder.** The development scripts (`tools/repo_stat.kspls` and others) start with `#!/usr/bin/env -S ksplc run`, so they run directly (`./tools/repo_stat.kspls`) once `ksplc` is on the PATH. In Windows's native shell, a shebang (that `#!` first line) does nothing ("Running a program" in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md)).

```sh
make install                       # puts Stage2 into ~/.local/bin/ksplc, std/ into ~/.local/lib/kspl/std
```

It ends by printing where it installed, in lines that start `# installed ->`, and **which `ksplc` your PATH starts**: the one just installed (a line with ✅), another one found first (named, with the line to put in your shell's configuration), or none. That last part is `make install-check` (with the same `PREFIX=`), which you can run again after changing PATH. It searches PATH as a shebang does (through `env`), and compares files, not names. On Windows it reads the UCRT64 shell's PATH; cmd and PowerShell keep their own, and `where ksplc` there names the one they start.

* `make install PREFIX=/usr/local` installs elsewhere (writing there needs `sudo`). **Pass `PREFIX` as an absolute path.** A relative one is refused: it would land inside the repository, and the only sign would be a PATH that does not work. Where MSYS2 gives `HOME` in Windows form (`C:\msys64\home\<user>`), `make` converts it to `/` separators.
* **It installs only a compiler that reproduces itself.** It first runs `make self-host` and `make self-host-ship`, and stops where either differs. It changes no file in the tree: it neither formats nor re-bakes the seed. After a change to how ksplc generates code, the seed still generates the old way, so it stops there until `make commit-seed` has run; the message says so.
* **Do not put `out/ksplc_seed.exe` on the PATH.** The seed is the compiler from the last time it was re-taken: it lacks every later feature and is built with `-O0 -g` (no optimization, with debug information). `make install` installs Stage2 instead: the self-hosting fixed point (the compiler that reproduces itself), rebuilt with optimization ("A shipped executable is built optimized" in [`DESIGN.md`](DESIGN.md)).

**If it goes wrong, there are four ways, each with its own sign.**

| What you see | Why | The fix |
| :-- | :-- | :-- |
| `file not found or unreadable: std/lang.kspls` when launching outside the repository | The `ksplc` started has no `std/` beside it (copied by hand, not by `make install`), so `std/` is looked for only directly under the current directory | Run `make install`, which puts `std/` where `ksplc` looks for it; `ksplc info std-dir` names the folder taken |
| `env: 'ksplc': No such file or directory`, only when a script is launched by its shebang (typing `ksplc` works) | `export PATH="~/.local/bin:$PATH"` put a literal `~` in the PATH (double quotes do not expand it). bash expands it at the prompt, but `env`'s search for a shebang (`execvp`) does not | Write `$HOME` (expanded inside double quotes) or an absolute path: `export PATH="$HOME/.local/bin:$PATH"`. `make install` warns when `env ksplc` cannot be found |
| `ksplc` runs, but lacks what you just built (an older version answers) | Another `ksplc`, installed earlier elsewhere (`/usr/local/bin`, say), comes before `$PREFIX/bin` on PATH | Put `$PREFIX/bin` first, or remove the other one; `make install-check` names the one found first. A shell already open may remember the old place until `hash -r` |
| It works in a terminal opened from the desktop, but not in VS Code's integrated terminal | The PATH was set in `~/.bash_profile`, which **only a login shell reads** | Set it in `~/.bashrc` (`~/.zshrc` for zsh), or use `~/.local/bin` (`make install`'s default), which many distributions' `~/.profile` already adds |

## Windows natively, without Docker

**Which environment to use depends on your system and on what you want to confirm.**

| Your system | Use |
| :-- | :-- |
| Linux | `.devcontainer/` (Docker) as it is |
| macOS | `make` natively with Xcode's clang: an environment built in CI but not confirmed ("Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported)) |
| Windows, to match CI exactly | The `.devcontainer/` on WSL2, where CI's authoritative gates (every stage of `make ci`) run bit for bit the same |
| Windows, to confirm native behavior on real hardware | [MSYS2](https://www.msys2.org/), in the three steps below |

What the `windows-ucrt64` job verifies is in "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md).

### 1. Use the 'MSYS2 UCRT64' shell (mandatory)

**Install MSYS2, open its "MSYS2 UCRT64" shell, and do all the work below in it.** Install MSYS2 by the [official site](https://www.msys2.org/)'s procedure. Launch "MSYS2 UCRT64" from the Start menu (not "MSYS2 MSYS", "MSYS2 MINGW64" or "MSYS2 CLANG64"). This shell is a terminal window called mintty.

**`echo $MSYSTEM` must display `UCRT64`.** Only UCRT64 is supported. The released Windows `ksplc.exe` is built with it, and UCRT is Windows 10's own C runtime, so what it builds needs no DLL from MSYS2 ("The Windows executable is built on UCRT64" in [`DESIGN.md`](DESIGN.md)).

**On Windows, the Makefile refuses to run outside the UCRT64 shell.** That includes MSYS2's tools run from PowerShell or cmd through the PATH (`MSYSTEM` is empty there). What breaks outside the shell is in the same section of [`DESIGN.md`](DESIGN.md).

Note: **`ksplc`'s own output (`--help`, diagnostics) does not depend on the terminal's setting**, even through ConPTY (VS Code's integrated terminal and the like). `ksplc` sets the console's output and input code pages to UTF-8 at start-up and restores them on exit and after a panic (`kspl_io_init_console` in `ksplc/gen/runtime/hosted.c`). A crash that ends the process without a panic (an access violation) leaves them set.

**In VS Code, the integrated terminal is already UCRT64.** `.vscode/settings.json` makes an "MSYS2 UCRT64" profile the default terminal on Windows (a Windows-only key). Open this folder and `make` / `make ci` run unchanged in the integrated terminal (`Ctrl+@`). PowerShell stays in the dropdown at its top right. Where MSYS2 is not in `C:\msys64`, set the profile's `path` to its location.

### 2. Install the packages

**Install the tools with MSYS2's package manager, `pacman`.** The list mixes two kinds of package on purpose:

| Name | Where it goes | What it does |
| :-- | :-- | :-- |
| No prefix (`git`, `make`, `python`) | `/usr/bin`, MSYS2's POSIX tools | Drives the build |
| Starting `mingw-w64-ucrt-x86_64-` | `/ucrt64/bin`, native UCRT64 tools | Builds what ships |

Why the two stay apart is "The Windows executable is built on UCRT64" in [`DESIGN.md`](DESIGN.md).

**`make` and `python` exist on both sides.** Once installed, the native versions win: UCRT64's PATH puts `/ucrt64/bin` before `/usr/bin`.

* **Do not fix that by reordering the PATH.** With `/usr/bin` first, `cc`/`gcc` come from the POSIX side and build a different `ksplc.exe` that depends on `msys-2.0.dll` (the Makefile rejects it via `-dumpmachine`).
* `type -a make python` shows collisions. `pacman -Qo <path>` names the package that installed a file, and `Required By` in `pacman -Qi <package>` tells whether it may be removed.

**The packages `make ci` needs are listed in [`tools/msys2-packages.txt`](../tools/msys2-packages.txt)**, one a line, each with what it is for. CI's `windows-ucrt64` job and the release's Windows build install that same file, so what passes there is what you install here. Install `git` first and clone the repository (outside a synced folder, as "[Building and testing](#building-and-testing)" says), then install the list from the clone's top folder:

```sh
pacman -Syu   # the first time updates the core, so follow the guidance to close the terminal once, reopen it, and re-run
pacman -S --needed git
# clone the repository and cd into it, then:
pacman -S --needed $(sed 's/#.*//' tools/msys2-packages.txt)
```

Two more are worth adding; `make ci` needs neither:

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-clang-tools-extra mingw-w64-ucrt-x86_64-lldb
```

| Package | What it gives you |
| :-- | :-- |
| `mingw-w64-ucrt-x86_64-clang-tools-extra` | `clang-format` (see [Requirements](#requirements)) |
| `mingw-w64-ucrt-x86_64-lldb` | `lldb`, for debugging, such as investigating a panic |

Caution: **Do not install `mingw-w64-ucrt-x86_64-make`.** UCRT64's PATH would pick it first. If it is installed, the Makefile rejects it at start-up and says what breaks and how to reach MSYS2's `make`.

`make BLAS=1` needs OpenBLAS, which MSYS2 packages as `mingw-w64-ucrt-x86_64-openblas`; ordinary language development does not need it.

**To build Kanso OS for bare metal (`ksos-cm*` / `ksos-rp*`) on Windows**, which only a real microcontroller needs, add these:

| The command needed | What it is for | Without it |
|---|---|---|
| `llvm-objcopy` | Extracting the stage-2 bootloader to a raw binary (`-llvm`) | `llvm-objcopy: command not found` |
| `llvm-objdump` | Verifying the section layout and the generated code (`-llvm`) | Likewise not found |
| `ld.lld` | The bare-metal final link (`-lld`) | Likewise not found |
| `arm-none-eabi-gcc` | Using libgcc's definitions (soft-float and 64-bit integer division); `clang` still compiles (`-arm-none-eabi-gcc`) | It stops with `ARM_TOOLCHAIN_HINT`'s guidance |

**`clang`'s package does not include the LLVM binutils (`llvm-objcopy` and the rest) or `ld.lld`.** clang alone cross-compiles for ARM, so the build reaches the link and stops there. Install these three:

```sh
pacman -S --needed \
  mingw-w64-ucrt-x86_64-llvm \
  mingw-w64-ucrt-x86_64-lld \
  mingw-w64-ucrt-x86_64-arm-none-eabi-gcc
```

**To assemble kspage for the browser (`make kspage-web` / `make test-kspage-wasm`)**, you also need the `-lld` and `-llvm` packages above: clang alone compiles to wasm32 and stops at the link.

| The command needed | What it is for | Without it |
|---|---|---|
| `wasm-ld` | The wasm32 final link (`-lld`) | `wasm-ld: command not found` |
| `llvm-nm` | Confirming the functions called from JS are all assembled (`-llvm`) | `llvm-nm: command not found` |
| `node` | Running the assembled wasm / checking the JS syntax (`make test-js-syntax`) | `node: command not found` |

For `node`, the Windows build of Node.js on the PATH is quicker than an MSYS2 package. `make kspage-web` alone needs only `wasm-ld`.

`pacman -Ss <part of the name>` finds a package whose name has changed. To find the package that provides a command (`pacman -F`), **fetch the file database with `pacman -Fy` first**; otherwise you get only the warning `database file for '...' does not exist`.

```sh
pacman -Fy                      # fetch the file DB (the first time only)
pacman -F llvm-objcopy          # display the package providing this command
```

The `Makefile` finds `ld.lld` / `llvm-objdump` / `llvm-objcopy` under the plain or the versioned name (`ld.lld-22` and so on, matching clang's version), so either may be installed.

### 3. Run `make` / `make ci`

**From here, `make`, `make debug`, `make ci` and the rest run as on Linux and macOS.**

**Known caveats**, if it goes wrong:

| What you see | Why | The fix |
| :-- | :-- | :-- |
| **A link fails with `Permission denied`** | `make ci` rebuilds the same `.exe` many times in a short span, and a program that watches new files can briefly lock one just written. A real-time scan such as Windows Defender's does it, and so does a sync agent such as OneDrive's | Re-running often fixes it. Where it recurs, exclude this repository's `out/` (or the whole repository) from the scan, and keep the repository outside a synced folder (for example `C:\dev\kspl`), as "[Building and testing](#building-and-testing)" says |
| `make ci` ends `ALL GREEN`, yet its digest lists `SKIP` lines: `node`, Wine, the MinGW cross compiler, an ARM toolchain and others | Those gates need a tool the package list leaves out, or one that has no place on Windows (Wine runs Windows programs on Linux). Each such line is one that `expected_skips` in `tools/ci_gates.kspls` names for `win32`, and a `SKIP` it does not name fails its gate, so a green round has skipped only those | Nothing to fix. What each skip leaves unchecked is "Gates that pass silently where a tool is missing" in [`SPEC-gates.md`](SPEC-gates.md). Installing the tools step 2 lists for Kanso OS and kspage (`llvm`, `lld`, the ARM toolchain, `node`) turns their skips into real runs |
| Part of `std/tests/sys_test.kspls` skips itself | It needs POSIX paths such as `/bin/echo`, so it skips itself on native Windows (`sys.is_windows()`) | Nothing to fix. Subprocesses themselves (`run_capture`, through `CreateProcess`) work there, and the `windows-ucrt64` job in `.github/workflows/ci.yml` runs them on real hardware |
