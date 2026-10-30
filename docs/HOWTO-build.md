# Building Kanso from source

**This guide builds the KSPL compiler `ksplc` from a clone of this repository, then runs the formatter, the linter and the tests.** You need a C compiler and Make.

| You are | What to read |
| :-- | :-- |
| Writing programs, with no prebuilt `ksplc` for your system | Only "The two-stage bootstrap (`make`)" and "Putting `ksplc` on the PATH" below. Then continue with the quick start in the root [`README.md`](../README.md) |
| Changing Kanso itself | All of it |

## Requirements

**KSPL builds with a C compiler (Clang) and Make, and nothing else.** The supported environments are in "Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported).

| Tool | What it is for | Needed? |
| :-- | :-- | :-- |
| **Clang** | Compiles the generated C, as `clang -std=c99` by default. The quick start needs it too | Yes |
| **Make** | Builds the compiler and drives the bootstrap, the LSP server and the rest | Yes |
| **Clang-Format** | Tidies the generated C where a person reads it: `make debug-file` and `make commit-seed` | Only for `make commit-seed`, which stops without it, since an untidied seed would change every line. `make debug-file` (VS Code's F5) leaves its C untidied and says so |

**Running every gate needs more tools**; `.devcontainer/Dockerfile` is their one list. A gate without its tool is covered by "Gates that pass silently where a tool is missing" in [`SPEC-gates.md`](SPEC-gates.md).

## Building and testing

**Clone the repository, set the console to UTF-8, and run `make` in its top folder.** The steps in this section, in order:

1. `make` builds the compiler ("The two-stage bootstrap" below).
2. `make install` puts it on your PATH, so you can type `ksplc` anywhere (optional).
3. If you change Kanso: `make fmt`, `make lint` and `make debug` format, check and test it.

**Keep the clone outside a cloud-synced folder** (OneDrive, Dropbox and the like), whose agent locks the build's short-lived files. OneDrive also refuses a test's path longer than 260 characters.

**On WSL2, Docker on WSL2 included, keep the clone inside Linux's own filesystem** (`~/src/kspl`), not on `/mnt/c`, where small files cost more and permissions can differ.

### The two-stage bootstrap (`make`)

**`make` builds the compiler in three steps, because the compiler is written in KSPL.** The first compiler is the *seed*, a copy of the compiler already translated to C (`ksplc/seed.c`).

1. Clang compiles the seed into `out/ksplc_seed.exe`.
2. The seed compiles the current compiler source into Stage1 (`out/ksplc_stage1.exe`).
3. Stage1 compiles the same source again, into Stage2, and the two outputs must match byte for byte.

```sh
make
```

**When it works, the last line reads `RESULT: ALL PASS (self-hosting, c backend)`.** Why is "The bootstrap, and keeping the seed in step" in [`ksplc/docs/DESIGN-compiler.md`](../ksplc/docs/DESIGN-compiler.md).

**A copy of `ksplc/` bootstraps the same way** with `make self-host` there, told where `std` and kspeg are (the top of [`ksplc/Makefile`](../ksplc/Makefile)).

**Two variables change what is built:**

| Command | What it does |
| :-- | :-- |
| `make LLVM=1` (and `make LLVM=1 debug`) | Uses the LLVM backend instead of the C backend. A switch reads `0` or `1` alone: `LLVM=true` stops make |
| `make debug-file SRC_KSPL=<file.kspl>` | Builds one file with debug information (VS Code's F5 calls it) |

### The formatter and the linter (`make fmt` / `make lint`)

**`make fmt` lays out every source file in the standard style, and `make lint` reports suspicious code.**

```sh
make fmt
make lint
```

Formatting runs as many files at once as there are cores (`FMT_JOBS`, default `nproc`). **`make fmt FMT_JOBS=1` runs one file at a time**, for the failures in a fixed order.

**`make fmt` formats with the seed, while the gate `make test-fmt-tree` asks the ksplc just built.** After a change to ksplc's formatter, run `make commit-seed` before `make fmt`. Otherwise the gate keeps failing on files `make fmt` leaves as they are.

### The tests (`make debug`)

**`make debug` builds the tests of most packages, and of `tools/`, into one program and runs it.** Which tests it calls, and in what order, is set by `main` in `tests/debug/main.kspl`.

```sh
make debug                         # every test main.kspl calls
make debug-std                     # std only (an order of magnitude less to build)
```

Note: After changing one package, `make debug-<name>` answers sooner. **It does not narrow what must be confirmed**: every package builds on `std/`, so run `make ci` before pushing ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)).

### What a target does (`make explain`)

**`make explain T=<target>` says what one target is made of, so you do not follow its variables through the make files by hand.** `make help` lists the targets; this command explains one of them.

```sh
make explain T=chat                    # the root build's target `chat`
make explain T=chat MODEL=x.gguf       # the same, with that setting given
make explain T=ksmd:test               # ksmd's own Makefile, as `make -C ksmd test`
```

It prints where the rule is written and each prerequisite with its state. Then come the commands filled in, as `make -n` shows them for this target alone. Last come every variable it reads, with its value and the line that sets it, and the settings it takes. An unknown name is refused with the nearest names. It needs GNU make 4 or later; on macOS, install it with `brew install make`. Why it works this way is "Explaining a make target" in [`../tools/docs/DESIGN-tools.md`](../tools/docs/DESIGN-tools.md).

### Putting `ksplc` on the PATH (`make install`, optional)

**`make install` copies the compiler and its standard library to where your shell finds them, so `ksplc` works from any folder.** The development scripts (`tools/repo_stat.kspl` and others) then run directly, through their `#!/usr/bin/env -S ksplc run` line. In Windows's native shell, that *shebang* does nothing ("Running a program" in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md)).

```sh
make install                       # puts Stage2 into ~/.local/bin/ksplc, std/ into ~/.local/lib/kspl/std
```

It ends with `# installed ->` lines, then says **which `ksplc` your PATH starts**. That is the one just installed (✅), another one found first, or none. For another one, it prints the line to add to your shell's configuration. That last part is `make install-check` (with the same `PREFIX=`), which you can run again after changing PATH. It searches PATH as a shebang does (through `env`), and compares files, not names. On Windows it reads the UCRT64 shell's PATH; in cmd and PowerShell, `where ksplc` names the one they start.

* `make install PREFIX=/usr/local` installs elsewhere (writing there needs `sudo`). **Pass `PREFIX` as an absolute path**; a relative one is refused, since it would land inside the repository. Where MSYS2 gives `HOME` in Windows form (`C:\msys64\home\<user>`), `make` converts it to `/` separators.
* **On Linux it then makes `.ksmd` files open on a double-click**, with their icon (`make install-desktop`), under `~/.local/share` or `$PREFIX/share`. Building ksmd's page needs clang's wasm32 tools, and its local server needs OpenSSL (`libssl-dev`). Without them it prints a note and installs `ksplc` anyway. The files it writes are in "Opening a `.ksmd` document on a double-click" in [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md).
* **It installs only a compiler that reproduces itself.** It runs `make self-host` and `make self-host-ship` first, and stops where either differs. It changes no file in the tree. After a change to how ksplc generates code, it stops until `make commit-seed` has run, and says so.
* **Do not put `out/ksplc_seed.exe` on the PATH.** The seed lacks every feature since it was last re-taken, and is built with `-O0 -g`. `make install` installs Stage2, the compiler that reproduces itself, rebuilt with optimization. Why is "A shipped executable is optimized; the development cycle is not" in [`DESIGN-repository.md`](DESIGN-repository.md).

**Installation prepares both copies before replacing the compiler or library**, and a failed replacement tries to restore both backups. Wait until it ends before compiling.

**If rollback fails, the error names the backup folders**; keep them until the old pair is restored. A killed process or power loss can also leave `.kspl-install.*` folders and `$PREFIX/lib/kspl/.install-lock`. After checking that no installer runs, recover any `old` library and `old` compiler (`old.exe` on Windows) from those folders. Then remove the empty lock directory and retry. Close programs using the installed compiler if Windows refuses a move.

**If it goes wrong, there are four ways, each with its own sign.**

| What you see | Why | The fix |
| :-- | :-- | :-- |
| `ksplc: the standard library is not found: …/std holds no lang.kspl` outside the repository | The `ksplc` started has no `std/` beside it (copied by hand) | Run `make install`; `ksplc info std-dir` names the folder taken |
| `env: 'ksplc': No such file or directory`, only when a script is launched by its shebang | `export PATH="~/.local/bin:$PATH"` put a literal `~` in the PATH. bash expands it at the prompt, but `env`'s search (`execvp`) does not | Write `export PATH="$HOME/.local/bin:$PATH"`. `make install` warns when `env ksplc` cannot be found |
| `ksplc` runs, but an older version answers | Another `ksplc` (in `/usr/local/bin`, say) comes before `$PREFIX/bin` on PATH | Put `$PREFIX/bin` first, or remove the other; `make install-check` names the one found first. An open shell can remember the old place until `hash -r` |
| It works in a desktop terminal, but not in VS Code's integrated terminal | The PATH was set in `~/.bash_profile`, which **only a login shell reads** | Set it in `~/.bashrc` (`~/.zshrc` for zsh), or use `~/.local/bin`, which many distributions' `~/.profile` already adds |

## The environment for each platform

| Your system | Use |
| :-- | :-- |
| Linux | `.devcontainer/` (Docker) as it is |
| macOS | `make` natively with Xcode's clang: built in CI but not confirmed ("Where it is supported" in the root [`README.md`](../README.md#where-it-is-supported)). `make kssrv` and `make ksmd` also need Homebrew's `openssl@3` ("Run it" in [kssrv](../kssrv/README.md)) |
| Windows, to run the complete Linux checks | The `.devcontainer/` on WSL2, where all Linux gates run |
| Windows, to confirm native behavior on real hardware | [MSYS2](https://www.msys2.org/), in the three steps below |

### 1. Use the 'MSYS2 UCRT64' shell (mandatory)

**Install MSYS2 by the [official site](https://www.msys2.org/)'s procedure, and do all the work below in its "MSYS2 UCRT64" shell.** Launch it from the Start menu, not "MSYS2 MSYS", "MSYS2 MINGW64" or "MSYS2 CLANG64".

**`echo $MSYSTEM` must display `UCRT64`**, the one environment supported. **On Windows, the Makefile refuses to run outside that shell**, through the PATH from PowerShell or cmd included. Why is "The Windows executable is built on UCRT64" in [`DESIGN-repository.md`](DESIGN-repository.md).

Note: **`ksplc`'s own output does not depend on the terminal's setting.** It sets the console's code pages to UTF-8 at start-up, and restores them on exit and after a panic (`kspl_io_init_console` in `ksplc/gen/runtime/hosted.c`). An access violation leaves them set.

**In VS Code, the integrated terminal is already UCRT64** (`.vscode/settings.json`), and PowerShell stays in its dropdown. Where MSYS2 is not in `C:\msys64`, set the profile's `path`.

### 2. Install the packages

**Install the tools with MSYS2's package manager, `pacman`.** The list mixes two kinds of package on purpose:

| Name | Where it goes | What it does |
| :-- | :-- | :-- |
| No prefix (`git`, `make`, `diffutils`) | `/usr/bin`, MSYS2's POSIX tools | Drives the build |
| Starting `mingw-w64-ucrt-x86_64-` | `/ucrt64/bin`, native UCRT64 tools | Builds what ships |

**Where a tool exists on both sides, the native one wins**: UCRT64's PATH puts `/ucrt64/bin` before `/usr/bin`.

* **Do not fix that by reordering the PATH.** With `/usr/bin` first, `cc`/`gcc` build a `ksplc.exe` that depends on `msys-2.0.dll` (the Makefile rejects it via `-dumpmachine`).
* `type -a make` shows the collision, and `pacman -Qo <path>` names the package that installed a file.

**The packages `make ci` needs are listed in [`tools/msys2-packages.txt`](../tools/msys2-packages.txt)**, which CI's Windows jobs install too. Install `git` first and clone the repository, then install the list from the clone's top folder:

```sh
pacman -Syu   # the first time updates the core, so follow the guidance to close the terminal once, reopen it, and re-run
pacman -S --needed git
# clone the repository and cd into it, then:
pacman -S --needed $(sed 's/#.*//' tools/msys2-packages.txt)
```

**To check everything this PC can with `make ci-full`, add [`tools/msys2-packages-full.txt`](../tools/msys2-packages-full.txt) the same way.** Each of its lines says which gate needs it.

```sh
pacman -S --needed $(sed 's/#.*//' tools/msys2-packages-full.txt)
```

Two more are worth adding; no gate needs either:

```sh
pacman -S --needed mingw-w64-ucrt-x86_64-clang-tools-extra mingw-w64-ucrt-x86_64-lldb
```

| Package | What it gives you |
| :-- | :-- |
| `mingw-w64-ucrt-x86_64-clang-tools-extra` | `clang-format` (see [Requirements](#requirements)) |
| `mingw-w64-ucrt-x86_64-lldb` | `lldb`, for debugging, such as investigating a panic |

Caution: **Do not install `mingw-w64-ucrt-x86_64-make`.** UCRT64's PATH would pick it first. If it is installed, the Makefile rejects it at start-up and says how to reach MSYS2's `make`.

**The full list also holds what three builds need beyond `make ci`:**

| Build | What it needs from the full list |
| :-- | :-- |
| `make BLAS=1` | OpenBLAS (`-openblas`) |
| Kanso OS for bare metal (`ksos-cm*` / `ksos-rp*`), for a real microcontroller | `llvm-objcopy` and `llvm-objdump` (`-llvm`), `ld.lld` (`-lld`), and `arm-none-eabi-gcc` for libgcc's soft-float and 64-bit division (`-arm-none-eabi-gcc`); QEMU runs the demos. **`clang`'s package holds none of these.** Without them the build reaches the link and stops with `command not found`, or with `ARM_TOOLCHAIN_HINT`'s guidance |
| ksmd's page (`make ksmd-web` / `make test-ksmd-browser`) | `wasm-ld` (`-lld`), clang's wasm32 builtins (`-wasi-compiler-rt`), and `node` for the browser test |

**The `-wasi-compiler-rt` package supplies the arithmetic helpers clang emits for wasm32**; the page stays freestanding, with no WASI system calls. Keep it at clang's version with `pacman -Syu`. Check that the file this prints exists, using the clang from `/ucrt64/bin` (`type -a clang`):

```sh
clang --target=wasm32-wasi -rtlib=compiler-rt -print-libgcc-file-name
```

To find the package that provides a command, **fetch the file database with `pacman -Fy` first**; otherwise `pacman -F` warns `database file for '...' does not exist`.

```sh
pacman -Fy                      # fetch the file DB (the first time only)
pacman -F llvm-objcopy          # display the package providing this command
```

The `Makefile` finds `ld.lld` / `llvm-objdump` / `llvm-objcopy` under the plain or the versioned name (`ld.lld-22` and so on, matching clang's version).

### 3. Run `make` / `make ci`

**From here, `make`, `make debug` and `make ci` run natively** ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)).

**Known caveats**, if it goes wrong:

| What you see | Why | The fix |
| :-- | :-- | :-- |
| **A link fails with `Permission denied`** | A real-time scan (Windows Defender's) or a sync agent briefly locks an `.exe` just written | Re-run. Where it recurs, exclude `out/` from the scan, and keep the repository outside a synced folder |
| `make ci` ends `ALL GREEN`, yet lists `SKIP` lines (`node`, Wine, the MinGW cross compiler, an ARM toolchain) | Those gates need a tool the package list leaves out. `EXPECTED_SKIPS` in `tools/ci_gates.kspl` names each for `win32` | Nothing to fix ("Gates that pass silently where a tool is missing" in [`SPEC-gates.md`](SPEC-gates.md)). The full list turns most into real runs |
| Part of `std/tests/sys_test.kspl` skips itself | It needs POSIX paths such as `/bin/echo` | Nothing to fix: subprocesses themselves work, and CI's Windows job runs them |
