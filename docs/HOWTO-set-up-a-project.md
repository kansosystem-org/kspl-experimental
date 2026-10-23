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

**Inside VS Code, the extension gives each `.kspl` file its icon**: the KSPL ensō and K on a white page. A `.ksmd` document's icon has a larger K and no ring, so the two icons differ even at their smallest. File managers need the steps below, run once from this folder.

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

## Opening a `.ksmd` document on a double-click

**This section makes a `.ksmd` document open in ksmd, in your browser, when you double-click it.** ksmd is the document editor of this repository ([ksmd](../ksmd/README.md)). This section needs a clone that builds from source ([`HOWTO-build.md`](HOWTO-build.md)). `make ksmd` builds the three programs it uses: the launcher `out/ksmd_open.exe`, the server and the page.

**The launcher starts the local server on the document's workspace, or reuses the server already running there.** It then passes the document's address to the browser, and exits. Its decisions are "Opening a `.ksmd` document" in [`tools/docs/DESIGN-tools.md`](../tools/docs/DESIGN-tools.md).

### Choose the workspace

**The workspace is the folder that ksmd reads and writes.** Every include and image of a document must stand inside it.

* **By default, the workspace is the document's own folder.** An include that climbs with `../` then reaches outside it, and the page refuses it.
* **To make a larger folder the workspace, put an empty file named `.ksmd-workspace` in it.** Every document below that folder then opens in that workspace. The nearest such folder above a document wins.

  ```sh
  touch ~/notes/.ksmd-workspace
  ```

  On Windows, run `New-Item $HOME\notes\.ksmd-workspace` in PowerShell.
* **From a terminal, `--workspace=<folder>` names the workspace for one run**: `out/ksmd_open.exe --workspace=$HOME/notes $HOME/notes/a/b.ksmd`. Use it for a folder you cannot write the file into.

**Each workspace keeps its own port, a number from 20000 to 29999 worked out from its path.** The browser keeps unsaved drafts per address, port included, so the same port brings the drafts back. If another program holds that port, the launcher takes the next free one and says so. Drafts held on one port do not show on the other. They show again once the usual port is free.

### Linux (a desktop environment)

**On Linux, `make install` ties `.ksmd` to the launcher for your user.** It needs clang's wasm32 tools to build the page, and prints a note where they are missing. `make install-desktop` does that step alone, without installing `ksplc`.

1. **Build everything and tie it:**

  ```sh
  make install-desktop
  ```

  It builds the page, the server and the launcher. It writes `out/ksmd.desktop` and `out/ksmd-mime.xml`, checks them, and puts them in with the icon.

2. **Double-click `ksmd/examples/overview.ksmd`.** The browser shows "Office supplies", with its table calculated and its note included.

**It writes only to your data folder**, `$XDG_DATA_HOME`, or `~/.local/share` where that is not set:

| What | Where |
| :-- | :-- |
| The launcher's entry, `ksmd.desktop` | `applications/` |
| The type declaration, `ksmd-mime.xml` | `mime/packages/` |
| The icon, `application-x-ksmd.svg` | `icons/hicolor/scalable/mimetypes/` |

* **It then rebuilds the desktop's caches**, with `update-mime-database` and `update-desktop-database`. Where a tool is missing, it prints a note and goes on. Install `shared-mime-info` or `desktop-file-utils`, then run `make install-desktop` again.
* **It makes ksmd the default program for `.ksmd` files** with `xdg-mime default`. That writes your choice to `~/.config/mimeapps.list`. Without `xdg-utils`, it prints a note, and the file manager's "Open with" offers ksmd.
* **`make install PREFIX=<folder>` writes under `<folder>/share` instead**, and sets no default program. Each user then runs `xdg-mime default ksmd.desktop application/x-ksmd` for themselves. Writing to a system folder such as `/usr/local/share` needs `sudo`.
* **The entry holds the path of this folder**, where `out/ksmd_open.exe` stands. After you move or clone the repository again, run `make install-desktop` again.

**Each `.ksmd` file shows its icon**, a white page with the vermilion KSPL K. A file manager may show the icon only after you log in again.

### Windows

**On Windows the tie is made by hand, once.** `make install` changes no registry entry: Windows lets only its own "Open with" dialog choose the default program.

1. **Build everything** in the MSYS2 UCRT64 shell: `make ksmd`. The build puts the icon inside `out\ksmd_open.exe`.
2. **Open one document by hand first**: `out/ksmd_open.exe ksmd/examples/overview.ksmd`. Check that the browser shows it.
   * Caution: **A double-click shows a refusal nowhere.** This run shows it in the terminal.
3. **Right-click a `.ksmd` file**, and choose "Open with ▸ Choose another app ▸ Look for another app on this PC".
4. **Pick `out\ksmd_open.exe`**, and tick "Always use this app". The `.ksmd` files then show the launcher's icon, the page with the K.

**No gate runs these steps on Windows.** They were checked once by hand on a Windows PC, and only a Windows PC shows whether they still work.

**macOS**, by hand as well: make an Automator "Application" that runs `out/ksmd_open.exe "$1"`, and tie `.ksmd` to it with Finder's "Get Info ▸ Open with ▸ Change All".

### Listing and stopping the servers

**A server stays up for the next document**, and stops by itself five minutes after its last ksmd tab closes.

| Command | What it does |
| :-- | :-- |
| `out/ksmd_open.exe --list` | Shows the servers running, with the workspace each serves |
| `out/ksmd_open.exe --stop=<folder>` | Stops the server of that workspace |
| `out/ksmd_open.exe --stop-all` | Stops every one |

### Resetting the `.ksmd` association

**Do this when a `.ksmd` file shows the wrong icon or opens the wrong program.** This happens after a rebuild in another folder, or a fresh clone.

**Windows** (PowerShell, as yourself; no administrator needed):

1. **Rebuild the launcher**: `make ksmd`. In Explorer, `out\ksmd_open.exe` now shows the page with the K.
2. **Make Windows forget the old choices.** An error saying a key does not exist only means there was nothing to forget.

  ```powershell
  reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.ksmd" /f
  reg delete "HKCU\Software\Classes\Applications\ksmd_open.exe" /f
  reg delete "HKCU\Software\Classes\.ksmd" /f
  ```

3. **Clear the icon cache:** run `ie4uinit.exe -show`, or sign out and in again.
4. **Tie it again**, as in the steps above. Pick the `out\ksmd_open.exe` of the folder you work in now, not an entry already in the list.

**Linux:** run `make install-desktop` from the folder you work in now. It replaces `ksmd.desktop`, which holds that folder's path, and ties `.ksmd` to it again. To remove the tie and the type altogether:

```sh
rm -f ~/.local/share/applications/ksmd.desktop ~/.local/share/mime/packages/ksmd-mime.xml
rm -f ~/.local/share/icons/hicolor/scalable/mimetypes/application-x-ksmd.svg
sed -i '/application\/x-ksmd/d' ~/.config/mimeapps.list
update-mime-database ~/.local/share/mime
update-desktop-database ~/.local/share/applications
```

### When a `.ksmd` double-click shows nothing

| Look at | What it tells you |
| :-- | :-- |
| **A run from a terminal** | `out/ksmd_open.exe <document>` prints why it refuses a document, such as a name not ending in `.ksmd` |
| **`out/tmp/ksmd_open.browser.log`** | What the browser printed when the launcher started it |
| **The URL printed on the terminal** | Paste the whole of it, with the token after `#`, into a browser. If the page opens, only the hand-over to the browser failed |
