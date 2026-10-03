# kspage

**Kanso Doc is one editing system in place of Word, Excel and PowerPoint**: the three uses in one document, not three programs. It is written in KSPL alone. It borrows neither the browser's layout (DOM/CSS) nor the OS, so the document model, the line building, the reckoning and the drawing are its own. Five core folders sit under a bridge to the browser: the KSPL side built as wasm32, and the JS that draws and wires the page.

**The aim is not reached, and the gap is file formats**: kspage can neither open nor write a `.docx`, an `.xlsx` or a `.pptx`. What else is missing is in the manual's last chapter (the page's `?`, "Open the manual"). Do not copy it here, since the manual is its source. What comes next is in [`kspage/docs/PLAN.md`](docs/PLAN.md).

**This guide is the map.** It assumes no experience of building an editing system. It shows where things are in the code, the order to read them in, and what a change must touch. The decisions and their grounds are in [`kspage/docs/DESIGN.md`](docs/DESIGN.md).

## Contents

* [Run it](#run-it)
* [The idea](#the-idea)
* [What is here](#what-is-here)
* [Reading order](#reading-order)
* [Common changes](#common-changes)
* [Pitfalls](#pitfalls)
* [The checks, and what none of them sees](#the-checks-and-what-none-of-them-sees)
* [Files near the limit and how they split](#files-near-the-limit-and-how-they-split)
* [Further reading](#further-reading)

---

## Run it

```sh
make kspage                              # build the page, the server and the opener, and out/sample.kspage
make kspage-open FILE=out/sample.kspage  # a browser comes up with that document open
```

`make help` lists the other targets under Run and Gates: serving one document, the page as one file, and the checks.

**Type `make kspage` first.** It builds the page, the server and the opener, and prints the steps that tie the file type to the opener. You carry out those steps yourself. The last section of [`docs/HOWTO-set-up-a-project.md`](../docs/HOWTO-set-up-a-project.md) says how they differ per environment, and what to check when a double-click opens nothing.

`make kspage-serve` opens the page on one document, with saving to the file, opening another file and the folder list all working. Choose the document with `KSPAGE_DOC=docs/CONTRIBUTING.md` (relative to the root) and the port with `KSPAGE_SERVE_PORT=8081`. It serves the whole root, because the server refuses anything outside what it serves. **Open the URL it prints, including the token (`#t=…`).** Without it, the page cannot read local files. A URL assembled by hand that misses the page's address or the document opens a page that shows no message.

**`make kspage-web` makes one file that embeds the wasm and the JS.** It needs no web server or container, and copied alone to another machine it opens the same way. `make clean` deletes `out/`, so copy the file elsewhere to keep it.

**This folder's own [`Makefile`](Makefile) builds and tests a standalone copy of the folder**: `make test`, `make test-fuzz` (`make test-kspage-fuzz` from the root), `make web`, `make test-wasm`, `make test-browser` and `make test-served KSSRV=<kssrv>`. It finds `ksdb` where the compiler is told packages are. The head of that file says what else each target needs. The commands above are the repository's: they call these targets with its own compiler, and build kssrv and the opener around the page.

**What it does**: typing and styling from a blank sheet, solving a table's formulas, showing slides one at a time, paging and printing, saving and reading back, and writing out HTML and Markdown. Two windows may open one file. The second to save is refused if the file changed after it read it ("Editing together" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md) says why the two are not joined).

## The idea

**A document, a spreadsheet and a presentation differ only in their arrangement, not in the shape of their data** (the grounds are "Why the three can be made one" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)).

| How it looks | The arrangement |
| :-- | :-- |
| Prose | flow (a run of text split onto pages) |
| A table | a grid (rows × columns), solved again along the graph of dependencies between values |
| Presentation | absolute coordinates (laid onto a slide of a set size) |

Only the arrangement forks. Everything under it is shared:

```
one document model        a tree of blocks + a row of inlines + styles drawn on by name
one text layout           line parting, the range chosen, the cursor, the IME
one reckoning engine      the graph of dependencies (a table's mostly, but it acts on a formula in prose too)
three laying-out strategies   flowing / a grid / absolute coordinates   <- this alone forks
two places drawn to       a canvas (WebAssembly) / native              <- a thin port layer
```

### The terms and the types behind them

| An editing system's word | Roughly | In kspage |
| :-- | :-- | :-- |
| A document | all the contents | `Doc` ([`kspage/model/doc.kspls`](model/doc.kspls)) |
| A paragraph, a heading, a bullet item, a table, a slide | **all one thing**, told apart only by the style's name | `Block` |
| A row of characters | the text a block holds directly | `Inline` ([`kspage/model/run.kspls`](model/run.kspls)) |
| A style | the look and the arrangement, shared by name | `Style` / `Sheet` ([`kspage/model/style.kspls`](model/style.kspls)) |
| An arrangement | flow / a grid / absolute coordinates | `Arrange` |
| What was laid out | the row of boxes on the screen. **It is not a document** | `Page` / `Box` ([`kspage/lay/page.kspls`](lay/page.kspls)) |
| The cursor | where it is | `Caret` ([`kspage/lay/caret.kspls`](lay/caret.kspls)) |
| The place of editing | **the only** entry point that rewrites the document | `Editor` ([`kspage/write/edit.kspls`](write/edit.kspls)) |
| The shape it is saved in | JSON | [`kspage/share/store.kspls`](share/store.kspls) |

### There are two trees, and they must not be mixed

* **`Doc`** is the source. Only it is saved, and only it is what an undo puts back.
* **`Page`** is the layout result. It is thrown away and rebuilt at every keystroke. The coordinates, the line breaks and the boxes all live here and are never written into the document. To change what the screen shows, change `Doc` or `Sheet`.

**This is why "it does not go into the document" turns up all over the code.** The table of contents, the chapter numbers, a list's marks, a note's number, a graph's contents and the page numbers are all counted at layout and put into `Page`. They never go into `Doc`, where typing could delete them ("What layout recomputes every time" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)).

### The idea in code

```kspls
import "std/mem" { Arena }
import "kspage/model/font" { Font }
import "kspage/model/fixed_font" as fixed
import "kspage/model/doc" { Doc }
import "kspage/model/style" { Sheet }
import "kspage/lay/flow" as flow

arena: = Arena.new(64 * 1024)
defer arena.free()
root: = Font::{ .family = "sans", .size_px = 16.0, .weight = 400U16, .italic = false }
sheet: = Sheet.new(root, arena)

doc: = Doc.new(arena)
doc.add_block("body").add_text("aaa bbb ccc", "", arena)

page: = flow.layout(doc, sheet, fixed.make(), 40.0, arena)
// An ASCII character is half an em (8px), so a width of 40px holds five of them, and it
// breaks behind a whitespace. Three rows, and three boxes.
```

A block whose style says `arrange = Arrange.grid` is laid out in rows × columns, and only that block is: **that is a table inside flowing prose**. With `Arrange.absolute` it becomes a slide of `Style.width` × `Style.height`, each child in its own `frame`.

Text written as `=A1*3` becomes a formula (`calc.recalc`), in the body too, where it can name a table (`=detail!C4`). **Only the text typed stays in the document**; the value is shown through `Inline.showing`.

`store.save` and `store.load` save and read back (the "Save" and "Open" buttons). `html.write` and `markdown.write` write out, and `markdown_read.read` reads Markdown as a new document. **A document opened from a `.md` is written back to a `.md`.**

### What happens on one keystroke

```
(1) keys.js               pick the keystroke up                       port/web/
(2) bridge.kspls           call the wasm's entry point (#export)       port/web/
(3) Editor.insert         rewrite the document, pile an undo break    write/
(4) kspage_web_layout      from here down it carries on in one call    port/web/
    - calc.recalc         solve the formula cells in dependency order expr/
    - flow.layout         Doc + Sheet + measurements -> Page          lay/
(5) draw.js               put Page's boxes out to the canvas          port/web/
```

**Only (3) rewrites the document**: (4) only reads it, and (5) sees only `Page`. So when the screen is wrong, the fault is in the rewrite (3), the layout (4) or the drawing (5).

Note: **(4) redoes everything every time.** Its cost, and why it stays, are in "Accepted limit 1: typing one character lays the whole document out again" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md).

**A formula is written in the code's own syntax** ("Formulas use KSPL's expression syntax" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)), so a document holding prose, tables and figures can stand beside the code. A figure is a slide. A slide laid out at absolute coordinates already goes into the flow, so figures need no other container. (A box, a connecting line and a number are all a figure needs.)

What kspage leaves out is in "What it does not hold" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md).

## What is here

The table below lists the folders from the bottom layer up, by what each one knows.

| Folder | What it holds | What it knows |
| :-- | :-- | :-- |
| `kspage/model/` | The document and the styles. | itself alone |
| `kspage/expr/` | A cell's formula, its value and their text. | `model` |
| `kspage/lay/` | Layout: turns a document into a row of placed boxes. It only reads. | `model` `expr` |
| `kspage/share/` | The shapes that go outside: saving, writing out, the change record. | `model` `expr` `lay` |
| `kspage/write/` | Rewriting: `Editor`, and the moves that use it. | the four above |
| `kspage/content/` | The documents shipped with the product (the manual, and the sample shown at startup). **No wiring.** | `model` alone |
| `kspage/port/web/` | The bridge to the browser, built as wasm32, measuring and drawing on a canvas. | the six above |
| `kspage/tests/` | The tests that inspect the inside of the unit. | the seven above |

`kspage/content/` sits just below `kspage/port/web/` rather than at the bottom, because only `kspage/port/web` imports it. Its own files import `model` alone. **Do not import it from the other five**, or the core would know the manual's wording.

**`kspage/tests/` sits inside the package**, so the tests reach its inside without making it `pub` (why is "13.1 A test inspecting the inside of a unit goes inside that unit" in [`docs/DESIGN.md`](../docs/DESIGN.md)). `kspage/tests/main.kspls` gives them a `main` of their own, so this folder's `make test` runs them alone. Only what the repository's `tests/` calls is `pub`: `run_kspage` in `kspage/tests/all.kspls`, which runs them all; `kspage/tests/trip.kspls`, for the round-trip gate; and `kspage/tests/seeds.kspls`, which builds the fuzz seeds. [I0402] in `ksplc.cfg` holds the rest at zero. Do not import `kspage/tests/` from the product's code, or the tests end up in what is built.

**No folder imports one above it.** What holds that order, and why `kspage/lay/` is one loop, are in [`kspage/docs/DESIGN.md`](docs/DESIGN.md#why-the-folders-are-split-by-what-they-know).

**Each file's head comment (`//<`) says what it holds**, so the files of the five core folders and `content/` are not listed here. A list kept by hand beside them would drift. Each document shipped with the product (`content/`) assembles a `Doc` and a `Sheet` and returns them, and knows neither an entry point nor a screen.

**The files of the bridge to the browser (`port/web/`) are listed**, because `make test-conventions` checks that this guide names every one of them. Several exist only because of the 1000-line cap on a file.

| File | Contents |
| :-- | :-- |
| [`kspage/port/web/bridge.kspls`](port/web/bridge.kspls) | The KSPL side: the entry points that go outside (`#export`). |
| [`kspage/port/web/state.kspls`](port/web/state.kspls) | One page's state (the document, the cursor, the arena), the only state, and the entry points that borrow dimensions. |
| [`kspage/port/web/face.kspls`](port/web/face.kspls) | The entry points that **apply** a style (to the selection, a list, a paragraph) and the insertions that follow from it (a shape, an image, a link, a line tied by name, a note, a comment). |
| [`kspage/port/web/face_edit.kspls`](port/web/face_edit.kspls) | The entry points that change **the i-th style's contents** (the look, how a number is shown, a paragraph's settings, the frame and the fill, the underline, the line-head mark, a heading's depth, the look changed by the value). |
| [`kspage/port/web/objects.kspls`](port/web/objects.kspls) | The entry points for the contents of the container you are in: line them up, select one, change the stacking order. |
| [`kspage/port/web/table.kspls`](port/web/table.kspls) | The entry points that move a table's cells (rows and columns, merging, copying along, sorting, CSV in and out, a container's note). |
| [`kspage/port/web/grab.kspls`](port/web/grab.kspls) | The entry points that press and drag (a cell's seam, a slide's frame): the only holder of the state that lives during a press. |
| [`kspage/port/web/paper.kspls`](port/web/paper.kspls) | The entry points for pages (the paper size, the margins, the body's width, a column's width and left edge, the sheet count) and for the header and footer. |
| [`kspage/port/web/theme.kspls`](port/web/theme.kspls) | The entry points for themes (the count, a name, wearing one). |
| [`kspage/port/web/review.kspls`](port/web/review.kspls) | The entry points for the change history (stamp and append, write the list out, carry it away, read it back). |
| [`kspage/port/web/inout.kspls`](port/web/inout.kspls) | The entry points for taking the document in and out (the save that reads back, HTML and Markdown out, Markdown in). |
| [`kspage/port/web/diff.kspls`](port/web/diff.kspls) | The entry points for comparing with an earlier version (the other text, the count, one item, jumping to it, discarding it). The page does the narrowing by view. |
| [`kspage/port/web/source.kspls`](port/web/source.kspls) | The entry points that point from the document at the source (load what it points at, tie them, find a symbol). |
| [`kspage/port/web/outline.kspls`](port/web/outline.kspls) | The list of headings and the entry point that jumps there, both built from one row, `Page.headings`. |
| [`kspage/port/web/kspage.js`](port/web/kspage.js) | The JS side's entry point: starts the wasm, makes `ks` (the set the parts share), and assembles the parts. |
| [`kspage/port/web/draw.js`](port/web/draw.js) | Draws the laid-out boxes with `fillText`, the bands, the shapes and the handles, and moves the cursor's sheet. |
| [`kspage/port/web/draw_crop.js`](port/web/draw_crop.js) | Draws onto another canvas (a printed sheet, a preview, a thumbnail, a slide shown alone), the same way as `draw.js`. |
| [`kspage/port/web/peek.js`](port/web/peek.js) | The split view: "Pin it below" pins the place in view under the body, for reading only. |
| [`kspage/port/web/pin.js`](port/web/pin.js) | The table heading kept in view, on a sheet of its own, while its table passes under the tools. Pressing it puts the cursor in the heading. |
| [`kspage/port/web/narrow.js`](port/web/narrow.js) | The arrow in every heading cell, and the panel it opens (the ordering, the conditions, a box to search the values, the ticks). |
| [`kspage/port/web/keys.js`](port/web/keys.js) | Pressing and typing: passes the place pressed, the key typed and the text being composed to the wasm. |
| [`kspage/port/web/api.js`](port/web/api.js) | The entry points that go outside (the document itself, the pages, showing, taking in and out, inserting, finding). The four files below add theirs to the same `app`. |
| [`kspage/port/web/api_io.js`](port/web/api_io.js) | Those that make the document into text, and a document from text. |
| [`kspage/port/web/api_look.js`](port/web/api_look.js) | Those that change the look (decoration, styles, the line-head mark, the frame and the fill, shapes, a container's contents). |
| [`kspage/port/web/api_diff.js`](port/web/api_diff.js) | Those that hold a second text beside the document (the change history, an earlier version). |
| [`kspage/port/web/api_show.js`](port/web/api_show.js) | Those that cut the document into set frames for viewing (pages drawn, slides shown one at a time). |
| [`kspage/port/web/page.css`](port/web/page.css) | The look, with the colours and the dimensions held by role (`:root`); a theme swaps those roles. |
| [`kspage/port/web/page.js`](port/web/page.js) | The page's frame: the notices, the menus, the common wiring, the redraw notice, the startup. **The parts are assembled here.** |
| [`kspage/port/web/keep.js`](port/web/keep.js) | The draft held back, so what was written survives closing the page. **It is not a save.** |
| [`kspage/port/web/file.js`](port/web/file.js) | The document's name, saving, opening, the change history, the row of open documents. **This is what swaps the current document.** |
| [`kspage/port/web/handle.js`](port/web/handle.js) | The arenas remembered across a reload: where each tab's document lives, and the drafts held aside. |
| [`kspage/port/web/report.js`](port/web/report.js) | Drops a record for changing things, without the document's contents. |
| [`kspage/port/web/save.js`](port/web/save.js) | Saving and loading (write out, write back, open from a URL or a local place, reopen a tab's document), on the same `kf` as `file.js`. |
| [`kspage/port/web/inout.js`](port/web/inout.js) | Taking in and out with other formats (HTML, Markdown, CSV, constants), none of which swaps the current document. |
| [`kspage/port/web/paper.js`](port/web/paper.js) | The paper settings, printing, and showing one page at a time. |
| [`kspage/port/web/plugin.js`](port/web/plugin.js) | The plugins: local programs, started by the server, that take the selected text and return text. With no server they are not shown. |
| [`kspage/port/web/local.js`](port/web/local.js) | Asks the local server (`kssrv --local`) for a file. A page opened from `file://` has no server, and the tools for it are not shown. |
| [`kspage/port/web/command.js`](port/web/command.js) | The wiring of the commands that rewrite the document (a table's rows and columns, insertions, find and replace, notes, comments). `write/edit.kspls`'s counterpart is `api.js`, not this. |
| [`kspage/port/web/form.js`](port/web/form.js) | The style menu (apply one, change its contents, how a number is shown, a paragraph's settings, the line-head mark, the frame and the fill). |
| [`kspage/port/web/fly.js`](port/web/fly.js) | The submenus that fly out to the right of the row pointed at, showing what is applied. |
| [`kspage/port/web/ribbon.js`](port/web/ribbon.js) | The ribbon and the tools (the table of commands shown, choosing, reordering, folding the overflow, folding it). |
| [`kspage/port/web/diff.js`](port/web/diff.js) | Comparing with an earlier version (a list narrowed by three views, jumping to a row, matching the look's pixels) and the versions held back. |
| [`kspage/port/web/here.js`](port/web/here.js) | The menu of the place, on a right-click over the body. |
| [`kspage/port/web/drop.js`](port/web/drop.js) | Opening a file dropped onto the screen, through `file.js`'s `takeChosen` for a document and `command.js`'s `takeImage` for an image. |
| [`kspage/port/web/source.js`](port/web/source.js) | Pointing from the document at the source (pass it in, tie them, press to show). It holds the text passed in, as bytes. |
| [`kspage/port/web/side.js`](port/web/side.js) | The list on the right (the slides and the contents), the status bar at the bottom edge, and the look's theme. |
| [`kspage/port/web/rt.c`](port/web/rt.c) | `memset` / `memcpy` / `memmove`, supplied here because wasm has no libc. |
| [`kspage/port/web/imports.txt`](port/web/imports.txt) | The entry points that may be borrowed from outside. **The link is bound by this list.** |
| [`kspage/port/web/page.html`](port/web/page.html) | The page's template (the frame and the menus' text), naming the texts to bind. It works only once its marks are filled in. |
| [`kspage/port/web/menus.html`](port/web/menus.html) | The band's Style, Table and Insert menus: a fragment of the template, named by `page.html`. |
| [`kspage/port/web/bundle.kspls`](port/web/bundle.kspls) | Binds the texts the template names and the wasm into one HTML. |

## Reading order

**Read along the line of understanding, `model` -> `lay` -> `write`**, not in import order (`model` -> `expr` -> `lay` -> `share` -> `write` -> `port/web`).

### (1) The document and the styles — `model/`

The base under everything, and **the only folder that knows no other**.

* [`kspage/model/doc.kspls`](model/doc.kspls) — `Doc` / `Block` / `Rect`. Read `Block`'s fields and `Block.add_text` first: **a block has no field for its kind**, only `style`, a name.
* [`kspage/model/style.kspls`](model/style.kspls) — `Sheet` (from a name to a `Style`) and `Style`. Read `Arrange` (the three arrangements) and `Sheet.add` first. **What says "this is a table" is the style, not the document**: that is the system's keystone.
* [`kspage/model/run.kspls`](model/run.kspls) — `Inline`: the row of characters and the decoration laid on it.
* The rest (`font` / `fixed_font` / `paint` / `marker` / `collect` / `fence` / `ident` / `limit` / `locate` / `number` / `over` / `paper` / `panel_paint` / `style_when` / `day` / `code` / `filter` / `source`) can wait until you need them.

### (2) Laying out — `lay/`

Reads `Doc` and makes `Page`. **Nothing here rewrites one byte.**

* [`kspage/lay/flow.kspls`](lay/flow.kspls) — the entry point `layout(doc, sheet, src, width, arena)`, where everything starts, and flow layout itself.
* [`kspage/lay/line.kspls`](lay/line.kspls) — how one line is built (where it breaks, where it is drawn): the body of the text layout, and the most costly code there is.
* [`kspage/lay/grid.kspls`](lay/grid.kspls) / [`kspage/lay/absolute.kspls`](lay/absolute.kspls) — the other two strategies, shorter than you would think because they leave the contents to flow.
* [`kspage/lay/caret.kspls`](lay/caret.kspls) — `hit_test(page, x, y)`, which **turns the place pressed back into a place in the document**: the hinge between the screen and the document.

### (3) Editing — `write/`

* [`kspage/write/edit.kspls`](write/edit.kspls) — `Editor`. **Only its `do_*` operations rewrite the document.** They record the undo in the same place, so no rewrite can escape the undo. The undo record's shape is [`kspage/write/record.kspls`](write/record.kspls).
* [`kspage/write/typing.kspls`](write/typing.kspls) — `Editor.insert` / `backspace` / the IME / moving the cursor: the entry point to (3).
* The rest (`block` / `shape` / `cells` / `insert` / `field` / `theme` / `csv` / `merge` / `again`) are moves built from `edit`'s tools, split into files by purpose and nothing more. Read one when you need it.

### (4) Formulas — `expr/`

* [`kspage/expr/calc.kspls`](expr/calc.kspls) — `recalc(doc, sheet)` solves the cells beginning with `=` in dependency order.
  * Caution: **Call it before laying out**, so that the text shown becomes the computed value.
* `value` / `shown` / `addr` / `shift` — the value, how it is shown, an address's text, and rewriting a formula as rows and columns grow and shrink. **None of them knows the document or a cell**, so each can be tested alone.

### (5) Saving, import and export — `share/`

Saving, writing out, taking in, and the change history.

* [`kspage/share/store.kspls`](share/store.kspls) — `save` / `load`. **This JSON is the only thing that reads back.**
* [`kspage/share/html.kspls`](share/html.kspls) / [`kspage/share/markdown.kspls`](share/markdown.kspls) — shapes for a person to read. **Neither reads back.**
* [`kspage/share/page.kspls`](share/page.kspls) — `parts`, **an entry point open to callers outside**: bytes in, two texts out (the CSS and the body). It is for a caller that builds a `<head>` per page (a site), since `html.write`'s one sheet holds neither a title nor a viewport.
* `compare` / `trail` / `consts` / `text` / `markdown_read` / `markdown_style` / `markdown_look` / `markdown_fenced` — comparing with an earlier version, the change history, a table written out as constants, the plain-text shape, and the Markdown reader with the styles and the look it applies. Come back to each when you need it.

### (6) Connecting to the browser — `port/web/`

**The core calls neither the OS nor the canvas.** JS measures text for it through `Font_source` and draws on a canvas. Start with the row of `#export` in [`kspage/port/web/bridge.kspls`](port/web/bridge.kspls), which is every entry point from the screen into the core; then [`kspage/port/web/kspage.js`](port/web/kspage.js) and [`kspage/port/web/page.js`](port/web/page.js), which start the wasm and assemble the parts. One keystroke goes [`kspage/port/web/keys.js`](port/web/keys.js) → [`kspage/port/web/draw.js`](port/web/draw.js). What every other file holds is in "What is here" above. What the boundary promises is in "The boundary between the core and the browser" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md).

## Common changes

**Few changes stay in one place.** The common ones, and the places easily forgotten:

| What you want to do | Where you touch | Easily forgotten | The gate |
| :-- | :-- | :-- | :-- |
| Add a field to a style | `kspage/model/style.kspls` | `kspage/share/store.kspls` (saving), `kspage/share/html.kspls` (writing out), `kspage/port/web/face.kspls` (the screen's entry point) | `make debug` / `make test-kspage-wasm` |
| Add a move | a file under `kspage/write/` | `kspage/write/record.kspls` (the instruction that undoes it) | a test that undoes it in one step |
| Expose an entry point to the screen | `#export` in `kspage/port/web/bridge.kspls` | the JS side in `kspage/port/web/api.js` and the wiring (`port/web/*.js`), `kspage/port/web/face_edit.kspls` where it bears on the look, and the sources `kspage/port/web/page.html` names | `make test-kspage-browser` |
| Change the shape it is saved in | `kspage/share/store.kspls` | **raise `version`**: otherwise an old file is silently read as something else | `make debug` |
| Change a text shown on the screen | `port/web/*.js` / `kspage/port/web/page.html` / `content/manual*.kspls` | the screen and the code share one vocabulary: the rejected wordings are in `tests/support/conventions_prose.kspls`, and the grounds in "The vocabulary is one" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md) | `make test-conventions` |

Note: **Whatever the change, finish with `make ci-linux`**, every Linux gate ("What each platform runs" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).

## Pitfalls

* **Do not mix the arenas.** The document lives in a long-lived arena, and `Page` in a short-lived one thrown away per keystroke ("Whether an entry point takes an arena depends on what it returns" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)).
* **A block's `id` is never given afresh or used again** ("A block number is never changed or reused" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)).
* **When you touch the text being composed, run both `make test-kspage-browser` and `make test-kspage-served`.** The tests confirm that characters of more than one byte can be typed, and what happens with a server present shows only in the second.
* **The page's JS runs as one script**, so a name declared in two files stops all of it. Only two objects pass between the files ("The page's scripts share one scope" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md)).

## The checks, and what none of them sees

`make test` (`make debug-kspage` from the root, and part of `make debug` on both C and LLVM) checks layout and editing as golden tests (`tests/*.kspls`), with the table of fixed measurements plugged in. `make test-wasm` (`make test-kspage-wasm`) runs the core built for wasm32 (`tests/wasm/`, run by `node`).

`make test-browser` (`make test-kspage-browser`) runs the scripts in `tests/browser/` on the built page in a real headless browser. The HTML written out is drawn for real in an `iframe`, since only drawing shows whether its class names and CSS rules match.

`make test-served KSSRV=<kssrv>` runs the same sections on the page a real `kssrv --local` served. kssrv is another package, so it is passed in, with the `sort` plugin beside it. `make test-kspage-served` from the root builds both and passes them in. What each of these gates checks, and what it does when no browser is found, are in the notes to "What each platform runs" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md). How the checks keep their documents apart is in "How the page is checked" in [`kspage/docs/DESIGN.md`](docs/DESIGN.md).

**What none of the three sees**: what comes out on the canvas (open the page yourself, by the steps in "Run it"); the window that chooses a file, which cannot open headless; and a real composition, since a headless browser has no input method (open the page by hand and type). To confirm that a save overwrote, open a file by hand, save twice, and see that nothing grew.

## Files near the limit and how they split

| File | What to split out | Destination |
| :-- | :-- | :-- |
| [`kspage/port/web/page.html`](port/web/page.html) | more of the menu bar's markup: the `Style`, `Table` and `Insert` menus are out, and `Review` is the largest left. **Take a whole menu, next to those already out**: the band's order is the template's, so a menu taken from the middle comes back with the rest of the bar between its halves | [`kspage/port/web/menus.html`](port/web/menus.html), where the template names it |
| [`kspage/write/block.kspls`](write/block.kspls) | a slide's frames: which is current, choosing one from the list of contents, the overlap order, taking one off (`frame_at` / `framer_at` / `pick_nth` / `raise_frame` / `drop_picked` / `drop_frame`, with the privs `Frame_at` / `no_frame_at` / `holder_of` / `holds_frame` / `dropped`) | a new `frame.kspls` under `kspage/write/` |
| [`kspage/tests/flow_test.kspls`](tests/flow_test.kspls) | the marker-driven tests (`test_a_bullet_hangs_in_the_indent` / `test_numbering_counts_consecutive_siblings` / `test_nested_numbering_starts_over` / `test_a_serial_number_runs_through_the_document` / `test_a_serial_number_counts_nested_figures` / `test_the_contents_lists_the_headings` / `test_the_contents_follows_the_headings` / `test_a_note_puts_a_raised_mark_after_its_run` / `test_note_numbers_follow_the_document_order`). What stays is the flow's geometry | a new `flow_mark_test.kspls` under `kspage/tests/` |
| [`kspage/tests/grid_test.kspls`](tests/grid_test.kspls) | the tests of moving between cells and of narrowing the rows (`test_the_caret_steps_from_cell_to_cell` / `test_enter_moves_down_a_row` / `test_a_filter_leaves_rows_out_of_the_layout`). What stays is how a column's and a row's measurements are decided | a new `step_test.kspls` under `kspage/tests/`, registered in `all.kspls` like the rest |
| [`kspage/tests/slide_test.kspls`](tests/slide_test.kspls) | the tests of grabbing and dragging a frame (`test_a_frame_is_grabbed_at_its_corners_and_body` / `test_one_frame_is_picked_at_a_time` / `test_a_ratio_drag_keeps_the_shape` / `test_dragging_a_frame_moves_and_resizes_it` / `test_one_frame_drag_undoes_in_one_step` / `test_a_frameless_child_cannot_be_grabbed`). What stays is how a slide lays out and what goes onto it and off it. **It needs `sized_slide_sheet`**, which then stops being `priv` | a new `frame_drag_test.kspls` under `kspage/tests/`, registered in `all.kspls` like the rest |
| [`kspage/tests/browser/ribbon.js`](tests/browser/ribbon.js) | the checks of the panel on the right and the split view: the lists of headings, slides, placed things and files, the tabs and their counts, the boundary that can be dragged, and the split view's place against the panel. What stays is the ribbon itself | a new `side.js` under `kspage/tests/browser/`, named in `KSPAGE_PROBE` in [`Makefile`](Makefile) and run by `probe.js` like the rest |
| [`kspage/port/web/draw.js`](port/web/draw.js) | the cursor (its bar and its blink) and the IME (`moveCaret` / `hideCaret` / `headRoom` / `jumpToCaret` / `followCaret` / `moveIme`, with the `ime` and `bar` elements). What stays is the painting | a new `caret.js` under `kspage/port/web/`, named from the template as `__KSPAGE_FILE:caret.js__` |
| [`kspage/port/web/page.css`](port/web/page.css) | the three theme palettes (Mist / Ink / Page). They only redefine the role tokens, so the roles' own definition and the layout stay behind | a new `themes.css` under `kspage/port/web/`, named from the template as `__KSPAGE_FILE:themes.css__` |
| [`kspage/share/compare.kspls`](share/compare.kspls) | the three tiers that pair the nodes up (`match_by_id` / `match_by_anchor` / `match_by_slot`, with the privs `trusts_ids` / `ahead_by_id` / `ahead_by_key` / `numbered` / `unpaired` / `merge_run` / `ordered` / `run_len` / `same_slot` / `fill_slots`). What stays is the flattening, the runs that moved and the per-block comparison | a new `compare_pair.kspls` under `kspage/share/` |
| [`kspage/share/markdown.kspls`](share/markdown.kspls) | writing out a grid: a cell, the rule row under the heading, a column's alignment and a table's marks (`cell_into` / `table_notices` / `align_of` / `rule_into` / `write_table`). What stays is writing the flow. **It needs `Sink` passed in**, and `runs_into` / `start_block` / `lead_in` / `notice` stop being `priv` | a new `markdown_table.kspls` under `kspage/share/` |
| [`kspage/share/markdown_read.kspls`](share/markdown_read.kspls) | what acts inside one line: the run being held and how it is put in, a code text's fence, the marks (a link, a picture, a note's mark) and the notes' definition lines (`Def` / `collect_defs` / `def_text` / `dest_of` / `flush_run` / `add_code_run` / `trimmed_text` / `Ticked` / `ticked_at` / `trimmed` / `all_spaces` / `add_inlines` / `mark_at` / `image_at` / `note_at`, with `Draft`). What stays is reading the lines themselves. **`Draft` goes with it and `Into` stays**, so the line reader passes `Into` in | a new `markdown_inline.kspls` under `kspage/share/` |

Note: **Splitting an `Editor` method costs every caller an import.** An extension method is seen only where its file is imported. So moving the frame group out of [`kspage/write/block.kspls`](write/block.kspls) adds an `import` to every file that calls it. Count the callers before choosing which group leaves.

**The build accepts a split with nothing added.** `make web` deliberately does not list the bound texts, since the template names them ([`kspage/Makefile`](Makefile)). A fragment needs only its mark and a row in the `port/web/` table under "What is here".

**Do not move the navigation's labels out of `page.html`.** The manual's cross-check reads them from that file by path (`tests/support/conventions_manual.kspls`). With `side-tabs` moved, it finds no labels, and a check with nothing to match against passes.

**When several sections share state rewritten inside one closure, moving blocks does not split the file**: a cut anywhere sends dozens of names across the boundary. First gather that state into one named object (`kf` in [`kspage/port/web/file.js`](port/web/file.js), the same shape as `ks`).

**Name a file with a word no variable already uses.** An import's alias can collide with a variable's name. [`kspage/model/paint.kspls`](model/paint.kspls) is not called `ink`, because `ink.drawn(...)` would be resolved as that variable's method.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kspage/docs/DESIGN.md`](docs/DESIGN.md) | Why it has this shape: the decisions, their grounds, and what each gives up. | Whoever changes kspage |
| [`kspage/docs/PLAN.md`](docs/PLAN.md) | What is left, and in what order. | Whoever changes kspage |
| [std](../std/README.md) | The standard library (`ksplc doc std` lists every file it publishes). kspage stands on the arena (`mem`), strings (`str`), numbers (`math`) and writing out (`json`). | Whoever changes kspage |
| [ksdb](../ksdb/README.md) | The append-only record a document's change history is kept on. | Whoever changes kspage |
| [`docs/SPEC-language.md`](../docs/SPEC-language.md) | The language. A function type's alias, used to swap a function out, is "3.5 Typedefs (`typedef`)". How a function is passed is "8. Functions and error handling". | Whoever changes kspage |
| [`docs/HOWTO-set-up-a-project.md`](../docs/HOWTO-set-up-a-project.md) | Its last section: making a `.kspage` open on a double-click, per environment, and what to check when a press opens nothing. | Whoever wants to open documents that way. Needs a browser and the built opener |
