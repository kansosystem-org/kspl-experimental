# Building Kanso from source

**This is for two readers, and both need a C compiler and Make.** If you change Kanso itself, read all of it. If you only write programs and have no prebuilt `ksplc` for your system, you need only `make` and "Putting `ksplc` on the PATH" below. Then continue with the quick start in the root [`README.md`](../README.md). What every gate checks, and on which platform, is in [`SPEC-gates.md`](SPEC-gates.md).

* [Requirements](#requirements)
* [Building and testing](#building-and-testing) — the bootstrap, the backend, formatting, linting, the tests, the PATH
* [Windows natively, without Docker](#windows-natively-without-docker) — the MSYS2 UCRT64 shell, the packages, the known caveats

## Requirements

KSPL builds with a C compiler (Clang) and Make. It needs no CMake, no C++ toolchain and no external library. The supported environments are in "Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported).

* **Clang**: compiles the generated C, as `clang -std=c99` by default (the quick start needs it too, to link the C that KSPL emits).
* **Make**: builds the compiler from source and drives the two-stage bootstrap, the LSP server and the rest.
* **Clang-Format** (recommended, optional): tidies the generated C in the two places a person reads it, `make debug-file` and `make commit-seed`.

## Building and testing

Clone the repository and build from source. Set the console to UTF-8 before running.

**Keep the clone outside a cloud-synced folder** (OneDrive, Dropbox, iCloud Drive and the like). The build writes thousands of short-lived files under `out/`, and the sync agent locks and uploads each as it appears. One test deliberately makes a path longer than Windows's 260 characters, and OneDrive refuses to sync it.

**On Windows with Docker, keep the clone inside WSL2's own filesystem** (for example `~/src/kspl`), not in a Windows folder mounted into the container. That folder has no POSIX permissions, so every file reads as executable, and the build is slower.

### The two-stage bootstrap (`make`)

The compiler is written in KSPL, so building it needs a working compiler first: the seed written in C (`ksplc/seed.c`). The two stages `make` builds from it, and the byte-for-byte match between them, are in "The bootstrap, and keeping the seed in step" in [`ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

```sh
make
```

**A copy of `ksplc/` bootstraps the same way from any `ksplc`.** Run `make self-host` in that folder, and tell it where `std` and kspeg are, as for any package (the top of [`ksplc/Makefile`](../ksplc/Makefile)).

**Two variables change what is built.** `make LLVM=1` (and `make LLVM=1 debug`) uses the LLVM backend instead of the C backend. `make debug-file SRC_KSPL=<file.kspls>` builds one file with debug information (VS Code's F5 calls it).

### The formatter and the linter (`make fmt` / `make lint`)

```sh
make fmt
make lint
```

Formatting runs as many files at once as there are cores (`FMT_JOBS`, default `nproc`). The files are independent, so the result is the same. **`make fmt FMT_JOBS=1` runs one file at a time**, for when the failures should come in a fixed order.

**`make fmt` formats `.kspl` and `.kspls` each in its own notation**, and `make lint` accepts either. "3.1 Basic use" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md) covers converting between the notations, and the one comment `make lint` asks you to move so the round trip is exact (why: "The indentation notation" in [`DESIGN.md`](DESIGN.md)).

### The tests (`make debug`)

`make debug` gathers the tests of most packages, and of `tools/`, into one executable. Which tests it calls, and in what order, is set by `main` in `tests/debug/main.kspls`.

```sh
make debug                         # every test main.kspls calls
make debug-std                     # std only (an order of magnitude less to build)
```

Note: After changing one package, `make debug-<name>` answers sooner. **It does not narrow what must be confirmed**: every package builds on `std/`, so run `make ci-linux` before pushing.

### Putting `ksplc` on the PATH (`make install`, optional)

The development scripts (`tools/repo_stat.kspls` and others) start with `#!/usr/bin/env -S ksplc run`, so they run directly (`./tools/repo_stat.kspls`) once `ksplc` is on the PATH. In Windows's native shell, a shebang does nothing ("Running a program" in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md)).

```sh
make install                       # puts Stage2 into ~/.local/bin/ksplc, std/ into ~/.local/lib/kspl/std
```

* `make install PREFIX=/usr/local` installs elsewhere (writing there needs `sudo`). **Pass `PREFIX` as an absolute path.** A relative one is refused: it would land inside the repository, and the only sign would be a PATH that does not work. Where MSYS2 gives `HOME` in Windows form (`C:\msys64\home\<user>`), `make` converts it to `/` separators.
* **Do not put `out/ksplc_seed.exe` on the PATH.** The seed is the compiler from its last re-bake: it lacks every later feature and is built with `-O0 -g`. `make install` installs Stage2 instead: the self-hosting fixed point, rebuilt with optimization ("A shipped executable is built optimized" in [`DESIGN.md`](DESIGN.md)).

**Three ways it fails, each with its own sign.**

| What you see | Why | The fix |
| :-- | :-- | :-- |
| `file not found or unreadable: std/lang.kspls` when launching outside the repository | The `ksplc` started has no `std/` beside it (copied by hand, not by `make install`), so `std/` is looked for only directly under the current directory | Run `make install`, which puts `std/` where `ksplc` looks for it; `ksplc info std-dir` names the folder taken |
| `env: 'ksplc': No such file or directory`, only when a script is launched by its shebang (typing `ksplc` works) | `export PATH="~/.local/bin:$PATH"` put a literal `~` in the PATH (double quotes do not expand it). bash expands it at the prompt, but `env`'s search for a shebang (`execvp`) does not | Write `$HOME` (expanded inside double quotes) or an absolute path: `export PATH="$HOME/.local/bin:$PATH"`. `make install` warns when `env ksplc` cannot be found |
| It works in a terminal opened from the desktop, but not in VS Code's integrated terminal | The PATH was set in `~/.bash_profile`, which **only a login shell reads** | Set it in `~/.bashrc` (`~/.zshrc` for zsh), or use `~/.local/bin` (`make install`'s default), which many distributions' `~/.profile` already adds |

## Windows natively, without Docker

**On Linux, use `.devcontainer/` (Docker) as it is.** On macOS, `make` runs natively with Xcode's clang, an environment built in CI but not confirmed ("Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported)). On Windows:

* To match CI exactly, run the `.devcontainer/` on WSL2, where CI's authoritative gates (every stage of `make ci`) run bit for bit the same.
* To confirm Windows-native behavior on real hardware, use [MSYS2](https://www.msys2.org/) as below.

What the `windows-msvc` / `windows-ucrt64` jobs each verify is in "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md).

### 1. Use the 'MSYS2 UCRT64' shell (mandatory)

Install MSYS2 by the [official site](https://www.msys2.org/)'s procedure. Launch "MSYS2 UCRT64" from the Start menu (not "MSYS2 MSYS", "MSYS2 MINGW64" or "MSYS2 CLANG64"), and do all the work below in this shell (mintty). **`echo $MSYSTEM` must display `UCRT64`.** Only UCRT64 is supported. The released Windows `ksplc.exe` is built with it, and UCRT is Windows 10's own C runtime, so what it builds needs no DLL from MSYS2 ("15.4 The Windows executable is built on UCRT64" in [`DESIGN.md`](DESIGN.md)).

**On Windows, the Makefile refuses to run outside the UCRT64 shell.** That includes MSYS2's tools run from PowerShell or cmd through the PATH (`MSYSTEM` is empty there). What breaks outside the shell is in the same section of [`DESIGN.md`](DESIGN.md).

Note: **`ksplc`'s own output (`--help`, diagnostics) does not depend on the terminal's setting**, even through ConPTY (VS Code's integrated terminal and the like). `ksplc` sets the console's output code page to UTF-8 at start-up and restores it on exit (`kspl_io_init_console` in `ksplc/gen/runtime/hosted.c`).

**In VS Code, the integrated terminal is already UCRT64.** `.vscode/settings.json` makes an "MSYS2 UCRT64" profile the default terminal on Windows (a Windows-only key). Open this folder and `make` / `make ci` run unchanged in the integrated terminal (`Ctrl+@`). PowerShell stays in the dropdown at its top right. Where MSYS2 is not in `C:\msys64`, set the profile's `path` to its location.

### 2. Install the packages

**The install list mixes two kinds of package on purpose.** A name with no prefix (`git`, `make`, `python`) is one of MSYS2's POSIX tools in `/usr/bin`, which drive the build. A name starting `mingw-w64-ucrt-x86_64-` is a native UCRT64 tool in `/ucrt64/bin`, which builds what ships (why the two stay apart: "15.4 The Windows executable is built on UCRT64" in [`DESIGN.md`](DESIGN.md)).

**`make` and `python` exist on both sides.** Once installed, the native versions win: UCRT64's PATH puts `/ucrt64/bin` before `/usr/bin`.

* **Do not fix that by reordering the PATH.** With `/usr/bin` first, `cc`/`gcc` come from the POSIX side and build a different `ksplc.exe` that depends on `msys-2.0.dll` (the Makefile rejects it via `-dumpmachine`).
* `type -a make python` shows collisions. `pacman -Qo <path>` names the package that installed a file, and `Required By` in `pacman -Qi <package>` tells whether it may be removed.

```sh
pacman -Syu   # the first time updates the core, so follow the guidance to close the terminal once, reopen it, and re-run
pacman -S --needed \
  git make python \
  mingw-w64-ucrt-x86_64-clang \
  mingw-w64-ucrt-x86_64-clang-tools-extra \
  mingw-w64-ucrt-x86_64-lldb
```

* `make`: MSYS2's own (`/usr/bin/make`; `make --version` says `Built for x86_64-pc-msys`).
  * Caution: **Do not install `mingw-w64-ucrt-x86_64-make`.** UCRT64's PATH would pick it first. If it is installed, the Makefile rejects it at start-up and says what breaks and how to reach MSYS2's `make`.
* `mingw-w64-ucrt-x86_64-clang`: `clang` (the compiler itself, which also compiles the LLVM IR that `--target=llvm` emits).
* `mingw-w64-ucrt-x86_64-clang-tools-extra`: `clang-format` (see [Requirements](#requirements)).
* `mingw-w64-ucrt-x86_64-lldb`: `lldb` (for debugging, such as investigating a panic; optional).
* `make BLAS=1` needs `libopenblas-dev`, which MSYS2 also packages; ordinary language development does not need it.

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

The `Makefile` finds `ld.lld` / `llvm-objdump` / `llvm-objcopy` under the plain or the versioned name (`ld.lld-19` and so on, matching clang's version), so either may be installed.

### 3. Run `make` / `make ci`

From here, `make`, `make debug`, `make ci` and the rest run as on Linux/macOS.

**Known caveats**:

* **A link fails with `Permission denied`**: `make ci` rebuilds the same `.exe` many times in a short span, and a program that watches new files can briefly lock one just written. A real-time scan such as Windows Defender's does it, and so does a sync agent such as OneDrive's. Re-running often fixes it. Where it recurs, exclude this repository's `out/` (or the whole repository) from the scan, and keep the repository outside a synced folder (for example `C:\dev\kspl`), as "[Building and testing](#building-and-testing)" says.
* Part of `std/tests/sys_test.kspls` needs POSIX paths such as `/bin/echo` and skips itself on native Windows (`sys.is_windows()`). Subprocesses themselves (`run_capture`, through `CreateProcess`) work there, and the `windows-msvc` job in `.github/workflows/ci.yml` verifies them on real hardware.
