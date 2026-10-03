# Setting up a project

This continues from the quick start in the root [`README.md`](../README.md). It needs `ksplc` and its `std/` (unpacked from a release or built from source) and `clang` on the PATH. The commands are written for the unpacked folder (`./ksplc`); with `ksplc` on the PATH, drop the `./`. The last section needs more, and says so at its top.

## Running a program

```sh
./ksplc run hello.kspls            # on Windows, .\ksplc.exe run hello.kspls
```

`run` translates, compiles, links and runs the program in one command. It caches the build, so an unchanged source starts at once (the cache is in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

**It compiles the intermediate C with `clang`** (or the compiler named by the environment variable `CC`), so one has to be on the PATH. Building an executable yourself uses the same C compiler ("Building a standalone executable" below).

**On Windows, use MSYS2's UCRT64 clang** (`pacman -S mingw-w64-ucrt-x86_64-clang` in the "MSYS2 UCRT64" shell, then put `C:\msys64\ucrt64\bin` on the PATH). Kanso is developed and built with it. LLVM's own Windows clang targets MSVC instead, and is built in CI but not confirmed ("Where it is supported" in the root [`README.md`](../README.md)).

Arguments after the script name go to the program:

```sh
./ksplc run hello.kspls --name=Kanso    # --name=Kanso is received by hello.kspls
```

**A first line `#!/usr/bin/env -S ksplc run` makes the script executable** once `ksplc` is on the PATH. A shebang does nothing in Windows's native shell, so write `ksplc run <script.kspls>` there.

## Working in another folder

`import "std/io"` reads the `std/` beside `ksplc`, from whatever folder `ksplc` runs in. **To work anywhere, put the folder holding `ksplc` on the PATH**, in the shell's configuration file (`~/.bashrc` or similar), and keep `std/` beside `ksplc`:

```sh
export PATH="/path/to/unpacked:$PATH"       # on Windows, add the folder to Path in the settings
ksplc info std-dir                          # names the std/ beside ksplc
```

## Building a standalone executable

To get the executable itself rather than `run` it, compile the KSPL to C and link it with your C compiler.

```sh
# compile: hello.kspls -> hello.c
./ksplc hello.kspls hello.c

# link: hello.c -> executable
clang hello.c $(./ksplc info link-libs) -o hello

# run
./hello
```

**The libraries to link differ per C compiler target, and are needed even when the program uses no networking or threads.** The C that `ksplc` emits always holds the whole standard-library runtime. `ksplc info link-libs` prints them for the `clang` on the PATH, so the line above is the same in every POSIX shell, MSYS2's included. In PowerShell, split its output into words:

```powershell
.\ksplc.exe hello.kspls hello.c
clang hello.c ((.\ksplc.exe info link-libs) -split ' ') -o hello.exe
```

**A program whose `extern` block names its library** (`#link("openblas")`, "11.5 Naming the library an `extern` block needs" in the [KSPL language specification](SPEC-language.md)) needs that library on the line too. Have the compile write the names to a file, and pass it to clang right after the source:

```sh
./ksplc --emit-libs=hello.libs hello.kspls hello.c
clang hello.c @hello.libs $(./ksplc info link-libs) -o hello
```

`ksplc run` and the bundled `.vscode/` build task (next section) do all of this themselves. Why it differs per OS, and where the `-l...` go, are in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md).

## Splitting a program into files

**Where an `import` searches from depends on how it is written, above all on whether it contains `/`** ("The three strict rules of path resolution" in the [KSPL language specification](SPEC-language.md)).

With `hw.kspls` beside `main.kspls`, write `import "hw";` (`as` only to rename). **When an import is not found, the error lists every folder searched**, which shows the starting point.

**A project that names itself is found from any folder.** Put a `ksplc.cfg` holding `[package]` and `name = myapp` at its top, and `import "myapp/hw";` finds `hw.kspls` in that top folder. `ksplc info package` names the package of the current folder. The details are in "A package that names itself (`[package]`)" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md).

Note: **Artifacts can also be linked against each other, so you need not hand over KSPL source** ("Linking the artifacts together" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

## VS Code (syntax highlighting, the Language Server, debugging)

The unpacked folder holds `.vscode/` (build tasks, LLDB settings) and, at its top, `kspl_lldb.py`: the LLDB pretty printer that makes slices, `Result` types and structs readable. So VS Code builds and debugs in the folder without setup. The Kanso extension adds `.kspls` syntax highlighting and the Language Server (jump to definition, hover, diagnostics).

1. **Install the extension**

  Install `kspl-*.vsix` from the Releases page. It bundles the LSP server for all three OSes and activates when a `.kspls` is opened.

  ```sh
  code --install-extension kspl-x.y.z.vsix
  ```

  Editing the grammar file (`ksplc/kspl.kspeg`) also needs `kspeg-*.vsix`, installed the same way.

2. **Open the unpacked folder and build**

  Open the folder where `ksplc` and `std/` sit side by side. The bundled `.vscode/tasks.json` takes effect, and `Ctrl+Shift+B` compiles and links the open `.kspls`.
  * Caution: **For a project elsewhere, set `KSPLC_STD_DIR` before starting VS Code.** The Language Server analyzes in a child process, and the CLI's `--std-dir=` does not reach it.

3. **Debug with LLDB (optional)**

  With [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb) installed (third-party, not in the release artifacts), `F5` on an open `.kspls` runs everything from the build to the debugger's launch.

## Opening a `.kspage` document on a double-click

**This section needs a clone of this repository that builds from source** ([`HOWTO-build.md`](HOWTO-build.md)), not only the unpacked folder. `make kspage` builds the three programs it uses: the opener, the server and the page ("Where the double-click opener lives" in [`tools/docs/DESIGN.md`](../tools/docs/DESIGN.md)).

A `.kspage` file double-clicked in a file manager opens in a browser through `out/kspage_open.exe`, built from [`tools/kspage_open.kspls`](../tools/kspage_open.kspls) (what `make kspage-open FILE=…` runs). It starts the local server, or reuses the one serving the same folder, and passes the URL to a browser.

**The server stays up for the next document**, and stops by itself once no kspage tab has held it for a while. `out/kspage_open.exe --list` shows the ones running, with the folder each serves; `--stop=<folder>` stops one, and `--stop-all` every one.

### Linux (a desktop environment)

    make kspage

builds the page, the server, the opener and `out/sample.kspage` to double-click. It writes `out/kspage.desktop` (checked by `desktop-file-validate` where installed) and prints the four lines below. **Running them is your own step**: `make` does not write under your home directory.

    xdg-mime install --novendor out/kspage-mime.xml
    cp out/kspage.desktop ~/.local/share/applications/
    update-desktop-database ~/.local/share/applications
    xdg-mime default kspage.desktop application/x-kspage

**Do not skip the first line.** Linux ties an application to a MIME type, not an extension. Undeclared, `.kspage` reads as `application/octet-stream`, which the last line cannot tie.

**Do not edit `Path=` or `%f` in the `.desktop` file.** A double-click starts in the home directory, hence `Path=`, and opens one file, hence `%f`, not `%F`.

Then double-click `out/sample.kspage`, the one way to confirm the association works. It holds [`tools/kspage_doc.kspls`](../tools/kspage_doc.kspls)'s content, **not the document shown at start-up**.

To tie `.md` or `.txt` to kspage instead, swap the last line's type for `text/markdown` / `text/plain`; that sends **every** `.md` or `.txt` on the machine to kspage.

### Windows and macOS

**`make kspage` builds the same four** and prints this environment's association steps. The server and the page also have targets of their own:

    make kssrv             # the server it starts  -> out/kssrv.exe
    make kspage-web        # the page it serves    -> out/kspage_web/kspage.html

**All three programs are needed**: the opener looks for `kssrv.exe` and `kspage_web/kspage.html` beside itself, and stops with "kssrv not found" if either is missing.

Caution: **A double-click shows that refusal nowhere.** Run the opener once by hand first (`make kspage-open FILE=out/sample.kspage`) to see the page open.

Each association below runs `out/kspage_open.exe` with one file's path. **No gate runs either of them**, so only your environment can say whether it works.

* **Windows** — right-click a `.kspage` file, choose "Open with ▸ Choose another app ▸ Look for another app on this PC", pick `out\kspage_open.exe`, and tick "Always use this app".
  * **Do not tie `.json` to it.** Every settings and data file on the machine would open in kspage ("The extension is kspage's own, and does not name the format inside" in [`kspage/docs/DESIGN.md`](../kspage/docs/DESIGN.md)).
* **macOS** — Finder's "Get Info ▸ Open with" needs an application bundle (`.app`). Make one in Automator's "Application" running `out/kspage_open.exe "$1"`, and tie that.

### When a double-click shows nothing

**The server can start while the hand-over to the browser fails**, leaving nothing on the screen.

* **Look first at `out/tmp/kspage_open.browser.log`**, which holds what the browser printed (the opener's last line names it).
* **Paste the URL printed on the terminal into a browser** — the whole of it, with the token after `#`.
