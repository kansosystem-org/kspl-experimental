# KSPL — get it running first

This folder holds the KSPL compiler and its standard library, ready to use. Below: what is in it, how to run your first program, and how to build an executable.

| name | what it is |
| :-- | :-- |
| `ksplc` / `ksplc.exe` | the compiler, which both translates and runs |
| `std/` | the standard library. **Keep it beside `ksplc`** |
| `.vscode/` | VS Code's build tasks and LLDB settings, which work without setup once this folder is open |
| `kspl_lldb.py` | the script that formats KSPL's values for LLDB, the debugger |
| `LICENSE.md` | the license (MIT) this folder is distributed under |

## Your first program

You need one thing besides this folder: a C compiler, `clang`, on the PATH. KSPL translates your program to C, and `clang` turns the C into machine code. The environment variable `CC` names a different C compiler if you prefer one.

**On Windows, use MSYS2's UCRT64 clang**: install it with `pacman -S mingw-w64-ucrt-x86_64-clang` in the "MSYS2 UCRT64" shell, then put `C:\msys64\ucrt64\bin` on the PATH. Kanso is developed and built with it. LLVM's own Windows clang is a different build: it targets MSVC, Microsoft's toolchain. ksplc names that toolchain's link flags, but nothing builds or runs a program with it.

Then:

1. Make a `hello.kspl` inside the unpacked folder:

   ```kspl
   import "std/io"

   fn main()
       io.out().s("Hello, Kanso!\n")
   ```

2. Run it:

   ```sh
   ./ksplc run hello.kspl            # on Windows, .\ksplc.exe run hello.kspl
   ```

   It prints `Hello, Kanso!`. `run` translates, compiles, links and runs the program in one command. Building an executable yourself uses the same C compiler ("Making an executable" below).

## Splitting a program into files — how to write `import`

**Where `import` looks depends on how it is written**, and this most often catches people out.

| how it is written | where it looks from |
| :-- | :-- |
| `import "std/io"` | from the `std/` that came with it |
| `import "hw"` / `"./hw"` / `"../hw"` (no `/`, or starting with `.`) | from **beside the file containing the import** |
| `import "src/hw"` (holds a `/` and does not start with `.`) | from **the folder `ksplc` was run in** |

So with `hw.kspl` beside `main.kspl`, `main.kspl` writes `import "hw"`. `import "src/hw"` looks in `src/` and fails if nothing is there; the error lists every folder it looked in.

**`as` changes only the name**: `import "hw"` alone lets you write `hw.say()`. `import "hw" as hw` means the same, and `ksplc lint` reports that the `as` adds nothing.

A function used only inside its own folder needs no `pub`; only what another folder calls needs it.

## Making an executable

To get the executable itself rather than `run` it, `build` it:

```sh
./ksplc build hello.kspl hello     # hello.c and hello.libs are left beside it
./hello
```

`build` writes the C, then has `clang` (or the compiler `CC` names) compile and link it, with the libraries this platform and the program need.

| You want | Write |
| :-- | :-- |
| The same in PowerShell | `.\ksplc.exe` and `hello.exe` in place of `./ksplc` and `./hello` |
| To pass flags to the C compiler | `--cflags`, such as `--cflags=-O0` for the debugger |
| To stop it at a bad memory access | `--sanitize=address`, the C compiler's address sanitizer |
| To build from VS Code | the bundled build task, which runs the same command |

## Working in another folder

`ksplc` finds the `std/` beside itself, whatever folder you run it in. Put this folder on the PATH and it runs from anywhere; keep `std/` beside `ksplc`.

```sh
export PATH="/path/to/unpacked:$PATH"       # on Windows, add the folder to Path in the settings
ksplc info std-dir                          # names the std/ beside ksplc
```

## Further reading

| Command or document | What it tells you |
| :-- | :-- |
| `ksplc --help` | the subcommands (`run` / `lint` / `fmt` / `info` / `clean` / `doc`) and options |
| `ksplc doc std` | every file of the bundled `std/`, one line each; `ksplc doc std/io` shows one file's declarations, and `ksplc doc std/io.out` one entry |
| `ksplc lint <file>` | what is flagged before it becomes an error (an unused import, a no-op `as`, and the like) |
| `docs/SPEC-language.md` in the Kanso repository | the language specification |
| `ksplc/docs/SPEC-tools.md` in the Kanso repository | the tools' specification (the cache, the link flags, `##lint`) |
