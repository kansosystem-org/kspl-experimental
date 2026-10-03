# KSPL — get it running first

This zip unpacks into a folder holding five things.

| name | what it is |
| :-- | :-- |
| `ksplc` / `ksplc.exe` | the compiler, which both translates and runs |
| `std/` | the standard library. **Keep it beside `ksplc`** |
| `.vscode/` | VS Code's build tasks and LLDB settings, which work without setup once this folder is open |
| `kspl_lldb.py` | the script that formats KSPL's values for LLDB |
| `LICENSE.md` | the license (MIT) this folder is distributed under |

## Your first program

Make a `hello.kspls` inside the unpacked folder.

```kspls
import "std/io"

fn main()
  io.out().s("Hello, Kanso!\n")
```

```sh
./ksplc run hello.kspls            # on Windows, .\ksplc.exe run hello.kspls
```

`run` translates, compiles, links and runs it in one command. **It compiles the intermediate C with `clang`** (or the compiler named by the environment variable `CC`), so one has to be on the PATH. Building an executable yourself uses the same C compiler ("Making an executable" below).

**On Windows, use MSYS2's UCRT64 clang** (`pacman -S mingw-w64-ucrt-x86_64-clang` in the "MSYS2 UCRT64" shell, then put `C:\msys64\ucrt64\bin` on the PATH). Kanso is developed and built with it. LLVM's own Windows clang targets MSVC instead, and is built in CI but not confirmed.

## Splitting a program into files — how to write `import`

**Where `import` looks depends on how it is written**, and this most often catches people out.

| how it is written | where it looks from |
| :-- | :-- |
| `import "std/io";` | from the `std/` that came with it |
| `import "hw";` / `"./hw"` / `"../hw"` (no `/`, or starting with `.`) | from **beside the file containing the import** |
| `import "src/hw";` (holds a `/` and does not start with `.`) | from **the folder `ksplc` was run in** |

So with `hw.kspls` beside `main.kspls`, `main.kspls` writes `import "hw";`. `import "src/hw";` looks in `src/` and fails if nothing is there; the error lists every folder it looked in.

**`as` changes only the name**: `import "hw";` alone lets you write `hw.say()`. `import "hw" as hw;` means the same, and `ksplc lint` reports that the `as` adds nothing.

A function used only inside its own folder needs no `pub`; only what another folder calls needs it.

## Making an executable

To get the executable itself rather than `run` it, compile the KSPL to C and link it with your C compiler.

```sh
# compile: hello.kspls -> hello.c
./ksplc hello.kspls hello.c

# link: hello.c -> executable
clang hello.c $(./ksplc info link-libs) -o hello

# run
./hello
```

**The libraries to link differ per C compiler target**, even without networking or threads, so `ksplc info link-libs` prints them for the `clang` on the PATH. In PowerShell, split its output into words:

```powershell
.\ksplc.exe hello.kspls hello.c
clang hello.c ((.\ksplc.exe info link-libs) -split ' ') -o hello.exe
```

A program whose `extern` block names its library (`#link("openblas")`) needs that library too. Have the compile write the names to a file, and pass it to clang right after the source:

```sh
./ksplc --emit-libs=hello.libs hello.kspls hello.c
clang hello.c @hello.libs $(./ksplc info link-libs) -o hello
```

`run` and the bundled tasks do this themselves.

## Working in another folder

`ksplc` reads the `std/` beside it from whatever folder it runs in. Put this folder on the PATH and it runs from anywhere; keep `std/` beside `ksplc`.

```sh
export PATH="/path/to/unpacked:$PATH"       # on Windows, add the folder to Path in the settings
ksplc info std-dir                          # names the std/ beside ksplc
```

## Further reading

* `ksplc --help` … subcommands (`run` / `lint` / `fmt` / `info` / `clean` / `doc`) and options
* `ksplc doc std` … every file of the bundled `std/`, one line each; `ksplc doc std/io` shows one file's declarations, and `ksplc doc std/io.out` one entry
* `ksplc lint <file>` … what is flagged before it becomes an error (an unused import, a no-op `as`, and the like)
* In the Kanso repository, the language specification is `docs/SPEC-language.md`, and the tools' specification (the cache, the link flags, `##lint`) is `ksplc/docs/SPEC-tools.md`
