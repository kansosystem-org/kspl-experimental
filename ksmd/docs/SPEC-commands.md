# ksmd's commands

**This document is the agreement between ksmd's launcher and whoever runs it.** That may be a person at a terminal, a double-click, or a model checking a file it wrote. It sets each command and option, what each prints, and its exit code. What a `.ksmd` file may hold is [`SPEC-file-format.md`](SPEC-file-format.md). The steps that tie `.ksmd` files to a double-click are "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md#opening-a-ksmd-document-on-a-double-click).

**The command is the launcher**: `out/ksmd.exe` after `make ksmd`, or `ksmd` after `make install`. This document writes it `ksmd`.

| Command | What it does |
| :-- | :-- |
| `ksmd <file>` | Opens the document in a browser, on a local server for its workspace ("Opening a document" below) |
| `ksmd --show <file>` | Opens it on the server, but prints the whole URL and starts no browser |
| `ksmd --list` | Shows the servers running, with the workspace each serves ("Listing and stopping the servers" below) |
| `ksmd --stop=<folder>` | Stops the server of that workspace |
| `ksmd --stop-all` | Stops every one |
| `ksmd --check <file>` | Opens nothing. Prints whether ksmd refuses the file, and what each formula calculates ("Checking a file" below) |
| `ksmd --markdown <file>` | Opens nothing. Prints the document as Markdown ("Printing as Markdown" below) |
| `ksmd --help` | Prints each option, and what it does |

**These options go with a command that names a file:**

| Option | What it does |
| :-- | :-- |
| `--workspace=<folder>` | Names the workspace for this run. The folder must hold the file |
| `--today=<date>` | With `--check` or `--markdown` only: the date that `today()` gives, such as `--today=2026-10-23` |

## The exit code

**The exit code says how a command ended:**

| Code | When |
| :-- | :-- |
| 0 | The command did what it was asked. A file with an error in a cell ends with 0 too |
| 1 | It was refused, or the file has a problem ("Checking a file" below) |
| 2 | The launcher cannot take its command line. The reason and the usage go to standard error |

**A line the launcher writes about itself starts with its name and a colon**, such as `ksmd: no server is running`. Standard error holds each reason.

**These command lines end with code 2:**

* **No file, or more than one**, where a file is needed.
* **`--today` without `--check` or `--markdown`**, or a date not written as `2026-10-23`.
* **`--check` and `--markdown` together.** Each prints the whole answer.
* **`--check` or `--markdown` with `--show`, `--list`, `--stop` or `--stop-all`.** Neither opens anything.
* **An option the launcher does not know.**

**A file named on the command line is refused with code 1**, and the reason goes to standard error:

* **A name that does not end in `.ksmd`.** The letter case does not count, so `NOTES.KSMD` is taken.
* **A path that holds `..`.** Name the file from its own folder, or in full.
* **A path where no file stands, or where a folder stands.**
* **A `--workspace` folder that does not exist, holds `..`, or does not hold the file.**
* **A file that is a link, or lies under a folder inside the workspace that is one.** The local server opens no link inside the workspace. The workspace itself may be reached through a link, as macOS reaches `/tmp` through `/private/tmp`.

## Opening a document

**`ksmd <file>` makes sure a local server runs for the file's workspace, and hands the document's page to the browser.** It then exits, and the server stays for the next document.

**The workspace is the folder that ksmd reads and writes.** Every include and image of the document must stand inside it.

* **The workspace is the nearest folder at or above the file that holds a file named `.ksmd-workspace`.** Without one, it is the file's own folder.
* **`--workspace=<folder>` names it for one run instead.**

**Each workspace keeps its own port, from 20000 to 29999, worked out from its path.** The browser keeps unsaved drafts per address, so they come back on the next opening.

* **A server already running for the workspace is used again**, whatever its port.
* **Where another program holds the port, the launcher takes the next free one of the 16 after it.** A line says so, since drafts held on one port do not show on the other.

**It prints the page's address without its token**, then how to open the page by hand where no browser shows it. The token is left out, since a double-click's output can reach others.

**A server stops by itself five minutes after its last ksmd tab closes.**

**`--show` prints the whole URL instead, with the token after `#`, and starts no browser.** Paste the URL into a browser. The launcher then waits, and prints what the server prints, until Ctrl+C stops both.

**The launcher stops with code 1 where it cannot open the document:**

* **The local server or the page is not built.** Run `make ksmd` first.
* **The workspace's name holds a line break.** It cannot be served.
* **The server does not start.** The line says why, or names the server's log.

## Listing and stopping the servers

**Each of `--list`, `--stop=<folder>` and `--stop-all` stands alone.**

* **A file, `--show`, `--workspace` or `--stop` beside one ends with code 1**, and so does `--stop=` with no folder.
* **`--list` and `--stop-all` together end with code 2**, as a command line the launcher cannot take.

| Command | What it prints | Exit code |
| :-- | :-- | :-- |
| `ksmd --list` | A line for each running server: its whole URL with the token, a space, and its workspace. Where none runs, `no server is running` on standard error | 0 |
| `ksmd --stop=<folder>` | `stopped the server serving <folder>` | 0 |
| `ksmd --stop=<folder>`, where no server serves that folder | `no server is serving <folder>` on standard error | 1 |
| `ksmd --stop-all` | A line for each server stopped, or `no server is running` on standard error | 0 |

* **The folder is named as on the command line**, from the current folder or in full. A trailing separator does not count. A folder that holds `..` is refused with code 1.
* **A server that does not stop when asked ends the command with code 1**, and a line on standard error names it.
* **Each launcher tends only the servers it started.** The one that `make install` put in (`ksmd --list`) and `out/ksmd.exe` each keep their own record. A server started by hand is not listed.

## Checking a file

**`ksmd --check <file>` reads a file as the editing page opens it, and prints what each formula calculates.** It needs no browser and no server. So whoever wrote the file, a person or a model, sees what ksmd refuses and what it calculates.

* **The workspace is found as an opening finds it**, and `--workspace=<folder>` names it in the same way.
* **Includes and images are read from the workspace**, and a link along a path is refused, as the local server refuses it.
* **`today()` gives today's date in UTC**, or the date that `--today=<date>` names. The page takes the computer's local date instead.
* **No document's own functions are built or run.** A call to one shows `#BLOCKED!`, as on the page before you allow its file.

**The output goes to standard output, and the exit code says how the file stands:**

| The file | What it prints | Exit code |
| :-- | :-- | :-- |
| The reader refuses it | One line: `<file>:<line>:<column>: <reason>` | 1 |
| It opens, with a problem in its view | A line for each problem, then a line for each formula, then the count | 1 |
| It opens with no problem | A line for each formula, then the count | 0 |

**Each line of the output takes one form:**

| Line | Form |
| :-- | :-- |
| A problem | `<file>:<line>:<column>: <reason>`. Where the problem lies in an included file, `(included from <file>:<line>:<column>)` follows, with each further include clause after a `<`, innermost first |
| A formula | `<table>.<cell> = <value>`, such as `t.D1 = 6` |
| The count | `ok` where no problem stands, else the problems, such as `1 problem`. Then a `:`, and the file's tables, formulas and errors: `ok: 1 table, 3 formulas, 1 error` |

* **A file's path is its path from the workspace's root**, as the page names it.
* **A problem is an include, an image or a functions clause that the view cannot show** ("The assembled view" in [`SPEC-file-format.md`](SPEC-file-format.md#the-assembled-view)). The page opens such a file, and shows the problem at its clause.
* **A cell is named as a formula in another table names it.** The lines follow the tables in order, each table row by row, from the left.
* **A value is written as a cell of the file writes it.** A number shows as in a column with no format. Text stands in quotes with its escapes, so the text `"6"` reads apart from the number `6`.
* **An error is its mark, then `: ` and its reason**, as the page's tooltip gives it.
* **An error in a cell leaves the exit code at 0.** The error is the cell's value, and a file can hold one on purpose, such as a share of a total that is still empty.
* **Only the file named is calculated.** An included file's formulas print when you check that file. Its problems print here too.

**Examples of what it prints, each checked by ksmd's tests, are "Checking a file" in [`SPEC-file-format.md`](SPEC-file-format.md#checking-a-file).**

## Printing as Markdown

**`ksmd --markdown <file>` prints the document as Markdown, as the editing page's File ▸ Copy as Markdown copies it.** It needs no browser. What each part of a document becomes is "Copying as Markdown" in [`SPEC-file-format.md`](SPEC-file-format.md#copying-as-markdown).

* **It reads the file as `--check` does**, with `--workspace` and `--today` alike. The tables show their values on that date.
* **A file the reader refuses prints no Markdown.** Its reason goes to standard error, and the exit code is 1.
* **A problem in the file's view goes to standard error**, in `--check`'s form, after the Markdown is printed. The exit code is then 1, else 0.
