# Setting up a project

**This guide takes you from a first program to a real project.** It covers running a program with arguments, working in any folder, and building an executable to hand out. It also covers splitting a program into files, and editing in VS Code. It continues from the quick start in the root [`README.md`](../README.md).

**What you need first:**

* `ksplc` with its `std/` folder beside it, unpacked from a release or built from source.
* `clang` on the PATH.
* For the last section only, more: it says so at its top.

The commands are written for the unpacked folder (`./ksplc`). With `ksplc` on the PATH, drop the `./`.

## Running a program

**`ksplc run` turns a `.kspl` file into a program and runs it, in one command.**

```sh
./ksplc run hello.kspl            # on Windows, .\ksplc.exe run hello.kspl
```

`run` translates the program to C, compiles, links and runs it. It caches the build, so an unchanged source starts at once (the cache is in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

**It compiles the intermediate C with `clang`** (or the compiler named by the environment variable `CC`), so one has to be on the PATH. Building an executable yourself uses the same C compiler ("Building a standalone executable" below).

**On Windows, use MSYS2's UCRT64 clang** (`pacman -S mingw-w64-ucrt-x86_64-clang` in the "MSYS2 UCRT64" shell, then put `C:\msys64\ucrt64\bin` on the PATH). Kanso is developed and built with it. LLVM's own Windows clang targets MSVC instead. ksplc names that toolchain's link flags, but nothing builds or runs a program with it ("Where it is supported" in the root [`README.md`](../README.md)).

Arguments after the script name go to the program:

```sh
./ksplc run hello.kspl --name=Kanso    # --name=Kanso is received by hello.kspl
```

**A first line `#!/usr/bin/env -S ksplc run` makes the script executable** once `ksplc` is on the PATH: you can then start it as `./hello.kspl`. That first line (a *shebang*) does nothing in Windows's native shell, so write `ksplc run <script.kspl>` there.

## Working in another folder

**To work in any folder, put the folder holding `ksplc` on the PATH, and keep `std/` beside `ksplc`.** `import "std/io"` reads the `std/` beside `ksplc`, from whatever folder `ksplc` runs in. Set the PATH in the shell's configuration file (`~/.bashrc` or similar):

```sh
export PATH="/path/to/unpacked:$PATH"       # on Windows, add the folder to Path in the settings
ksplc info std-dir                          # names the std/ beside ksplc
```

The second line checks the result: it prints the `std/` folder `ksplc` uses.

## Building a standalone executable

**To get the executable itself rather than `run` it, `build` it:**

```sh
./ksplc build hello.kspl hello     # hello.c and hello.libs are left beside it
./hello
```

`build` writes the C, then has `clang` (or the compiler `CC` names) compile and link it. It links the libraries this platform needs and those the program names (`#link("openblas")`, "11.5 Naming the library an `extern` block needs" in the [KSPL language specification](SPEC-programming-language.md)).

| You want | Do this |
| :-- | :-- |
| To run it in PowerShell | The same line, with `.\ksplc.exe` and `hello.exe` |
| A normal build | Nothing: it builds optimised, with `-g` (debug information) |
| To pass flags to the C compiler | `--cflags=…`; they come after ksplc's own |
| To step through it in a debugger | `--cflags=-O0` (no optimization) |
| To stop it at a bad memory access, and name the line | `--sanitize=address` (the C compiler's address sanitizer; `--cflags` does not take `-fsanitize=`) |

The steps it takes, and how to take them apart (to ship objects without the source, say), are in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md).

## Splitting a program into files

**Where an `import` searches from depends on how it is written.** Above all, it depends on whether it contains `/` ("The three strict rules of path resolution" in the [KSPL language specification](SPEC-programming-language.md)). The table shows what to write for the usual cases.

| Where the file is | Write |
| :-- | :-- |
| In the standard library | `import "std/io"` |
| Beside the importing file (`hw.kspl` beside `main.kspl`) | `import "hw"` (`as` only to rename) |
| At the top of a project that names itself | `import "myapp/hw"` (below) |

**When an import is not found, the error lists every folder searched**, which shows the starting point.

**A project that names itself is found from any folder.** Put a `ksplc.cfg` holding `[package]` and `name = myapp` at its top, and `import "myapp/hw"` finds `hw.kspl` in that top folder. `ksplc info package` names the package of the current folder. The details are in "A package that names itself (`[package]`)" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md).

Note: **A library can also be handed over without its KSPL source.** Build it with `--library=`, and use it through the C interface that the compiler writes beside it ("Shipping a library and using it" in [`ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

## VS Code (syntax highlighting, the Language Server, debugging)

**VS Code builds and debugs in the unpacked folder without setup; the Kanso extension adds colouring and code help.** The unpacked folder holds `.vscode/` (build tasks, LLDB settings). At its top it holds `kspl_lldb.py`, the LLDB pretty printer. It makes slices, `Result` types and structs readable in the debugger. The Kanso extension adds `.kspl` syntax highlighting and the Language Server (jump to definition, hover, diagnostics).

1. **Install the extension**

  Install `kspl-*.vsix` from the Releases page. It bundles the LSP server for all three OSes and activates when a `.kspl` is opened.

  ```sh
  code --install-extension kspl-x.y.z.vsix
  ```

  Editing the grammar file (`ksplc/kspl.kspeg`) also needs `kspeg-*.vsix`, installed the same way.

2. **Open the unpacked folder and build**

  Open the folder where `ksplc` and `std/` sit side by side. The bundled `.vscode/tasks.json` takes effect, and `Ctrl+Shift+B` compiles and links the open `.kspl`.
  * Caution: **For a project elsewhere, set `KSPLC_STD_DIR` before starting VS Code.** The Language Server analyzes in a child process, and the CLI's `--std-dir=` does not reach it.

3. **Debug with LLDB (optional)**

  With [CodeLLDB](https://marketplace.visualstudio.com/items?itemName=vadimcn.vscode-lldb) installed (third-party, not in the release artifacts), `F5` on an open `.kspl` runs everything from the build to the debugger's launch.

### The `.kspl` file icon outside VS Code

**Inside VS Code, the extension gives each `.kspl` file its icon**: the KSPL ensō and K on a white page. A `.kspage` document's icon has a larger K and no ring, so the two differ even at their smallest. File managers need the steps below, run once from this folder.

**Linux:**

```sh
mkdir -p ~/.local/share/mime/packages ~/.local/share/icons/hicolor/scalable/mimetypes
cat > ~/.local/share/mime/packages/kspl.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="text/x-kspl">
    <comment>KSPL source</comment>
    <sub-class-of type="text/plain"/>
    <glob pattern="*.kspl"/>
  </mime-type>
</mime-info>
EOF
update-mime-database ~/.local/share/mime
cp .vscode/extensions/kspl/kspl-file.svg ~/.local/share/icons/hicolor/scalable/mimetypes/text-x-kspl.svg
```

**Windows** (PowerShell, as yourself). It ties `.kspl` to VS Code under a name of its own, which carries the icon:

```powershell
$ico = (Resolve-Path .vscode\extensions\kspl\kspl-file.ico).Path
$code = "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe"
reg add "HKCU\Software\Classes\KSPL.Source" /ve /d "KSPL source" /f
reg add "HKCU\Software\Classes\KSPL.Source\DefaultIcon" /ve /d "$ico" /f
reg add "HKCU\Software\Classes\KSPL.Source\shell\open\command" /ve /d "`"$code`" `"%1`"" /f
reg add "HKCU\Software\Classes\.kspl" /ve /d "KSPL.Source" /f
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.kspl" /f
ie4uinit.exe -show
```

* The `reg delete` line drops an earlier "Open with" choice, which would hide the icon. An error saying the key does not exist only means there was none.
* **The icon is read from this folder.** After moving or cloning it again, run the lines again.
* VS Code installed for all users sits under `C:\Program Files\Microsoft VS Code\`; change `$code` to match.

## Opening a `.kspage` document on a double-click

**This section makes a `.kspage` document open in your browser when you double-click it in the file manager.** It needs a clone of this repository that builds from source ([`HOWTO-build.md`](HOWTO-build.md)), not only the unpacked folder. `make kspage` builds the three programs it uses: the opener, the server and the page ("Where the double-click opener lives" in [`tools/docs/DESIGN-tools.md`](../tools/docs/DESIGN-tools.md)).

The diagram shows what happens on a double-click.

```mermaid
flowchart LR
    Click[Double-click a .kspage file] --> Opener[out/kspage_open.exe]
    Opener -->|starts, or reuses| Server[kssrv, the local server]
    Opener -->|passes the URL| Browser
    Browser -->|loads the page from| Server
```

A `.kspage` file double-clicked in a file manager opens in a browser through `out/kspage_open.exe`, built from [`tools/kspage_open.kspl`](../tools/kspage_open.kspl) (what `make kspage-open FILE=…` runs). It starts the local server, or reuses the one serving the same folder, and passes the URL to a browser.

**The server stays up for the next document**, and stops by itself once no kspage tab has held it for a while.

| Command | What it does |
| :-- | :-- |
| `out/kspage_open.exe --list` | Shows the servers running, with the folder each serves |
| `out/kspage_open.exe --stop=<folder>` | Stops one |
| `out/kspage_open.exe --stop-all` | Stops every one |

### Linux (a desktop environment)

1. **Build everything:**

  ```sh
  make kspage
  ```

  It builds the page, the server, the opener and `out/sample.kspage` to double-click. It writes `out/kspage.desktop` (checked by `desktop-file-validate` where installed) and prints the six lines below.

2. **Run the six lines yourself.** `make` does not write under your home directory.

  ```sh
  xdg-mime install --novendor out/kspage-mime.xml
  mkdir -p ~/.local/share/icons/hicolor/scalable/mimetypes
  cp kspage/port/desktop/kspage.svg ~/.local/share/icons/hicolor/scalable/mimetypes/application-x-kspage.svg
  cp out/kspage.desktop ~/.local/share/applications/
  update-desktop-database ~/.local/share/applications
  xdg-mime default kspage.desktop application/x-kspage
  ```

3. **Double-click `out/sample.kspage`**, the one way to confirm the association works. It holds [`kspage/content/example.kspl`](../kspage/content/example.kspl)'s content. Its title is "Sample document".

**Do not skip the first of the six lines.** Linux ties an application to a MIME type (a name for a kind of file), not to an extension. Undeclared, `.kspage` reads as `application/octet-stream`, which the last line cannot tie.

**The second and third lines give each `.kspage` file its icon**, a white page with the KSPL K. A file manager may show it only after you log in again.

**Do not edit `Path=` or `%f` in the `.desktop` file.** A double-click starts in the home directory, hence `Path=`, and opens one file, hence `%f`, not `%F`.

To tie `.md` or `.txt` to kspage instead, swap the last line's type for `text/markdown` / `text/plain`; that sends **every** `.md` or `.txt` on the machine to kspage.

### Windows and macOS

**`make kspage` builds the same four** and prints this environment's association steps. The server and the page also have targets of their own:

    make kssrv             # the server it starts  -> out/kssrv.exe
    make kspage-web        # the page it serves    -> out/kspage_web/kspage.html

**All three programs are needed**: the opener looks for `kssrv.exe` and `kspage_web/kspage.html` beside itself, and stops with "kssrv not found" if either is missing.

Caution: **A double-click shows that refusal nowhere.** Run the opener once by hand first (`make kspage-open FILE=out/sample.kspage`) to see the page open.

Each association below runs `out/kspage_open.exe` with one file's path. **No gate runs either of them**, so only your environment can say whether it works.

* **Windows**:
  1. Right-click a `.kspage` file.
  2. Choose "Open with ▸ Choose another app ▸ Look for another app on this PC".
  3. Pick `out\kspage_open.exe`, and tick "Always use this app". The files then show the opener's icon, a white page with the KSPL K, which the build puts inside it.
  * **Do not tie `.json` to it.** Every settings and data file on the machine would open in kspage ("The extension is kspage's own and names no format inside" in [`kspage/docs/DESIGN-application.md`](../kspage/docs/DESIGN-application.md)).
* **macOS** — Finder's "Get Info ▸ Open with" needs an application bundle (`.app`). Make one in Automator's "Application" running `out/kspage_open.exe "$1"`, and tie that.

### Resetting the association

**Do this when a `.kspage` file shows the wrong icon or opens the wrong program.** This happens after a rebuild in another folder, or after a fresh clone. The system then remembers an old opener, or two of them.

**Windows** (PowerShell, as yourself; no administrator needed):

1. **Rebuild the opener, so it holds the icon.** In the MSYS2 UCRT64 shell, run `pacman -S --needed mingw-w64-ucrt-x86_64-binutils` once, then `make kspage`. In Explorer, `out\kspage_open.exe` itself now shows the washi page. If it still shows a plain program icon, the rebuild did not happen.
2. **Make Windows forget the old choices.** An error saying a key does not exist only means there was nothing to forget.

  ```powershell
  reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.kspage" /f
  reg delete "HKCU\Software\Classes\Applications\kspage_open.exe" /f
  reg delete "HKCU\Software\Classes\.kspage" /f
  ```

  * The first line removes the program chosen for `.kspage`, and the "Open with" list.
  * The second removes where Windows remembers `kspage_open.exe` to be. A stale path there is why the menu can list it twice.
  * The third removes any other tie to `.kspage`.
3. **Clear the icon cache:** run `ie4uinit.exe -show`, or sign out and in again.
4. **Tie it again**, as in the steps above. In step 3 there, pick the `out\kspage_open.exe` of the folder you now work in. Do not pick an entry already in the list.

If a `reg delete` line says access is denied, sign out and in, then run it again. Explorer may hold the key open.

**Linux:**

```sh
rm -f ~/.local/share/applications/kspage.desktop
sed -i '/application\/x-kspage/d' ~/.config/mimeapps.list
update-desktop-database ~/.local/share/applications
```

Then run `make kspage` and its six lines again. The new `kspage.desktop` holds the path of the folder you ran it in.

**macOS:** delete the Automator application, make it again for the current `out/kspage_open.exe`, and tie that.

### When a double-click shows nothing

**The server can start while the hand-over to the browser fails**, leaving nothing on the screen.

| Look at | What it tells you |
| :-- | :-- |
| **`out/tmp/kspage_open.browser.log` first** | What the browser printed (the opener's last line names this file) |
| **The URL printed on the terminal** | Paste the whole of it, with the token after `#`, into a browser. If the page opens, the server works and only the hand-over failed |
