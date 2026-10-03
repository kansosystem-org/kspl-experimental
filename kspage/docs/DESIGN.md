# The grounds of kspage's design

This document says why kspage has the shape it has. What is there, and how to use it, is in [kspage](../README.md).

## Contents

* [What it is aimed at](#what-it-is-aimed-at)
* [Why the three can be made one](#why-the-three-can-be-made-one)
* [Why the folders are split by 'what they know'](#why-the-folders-are-split-by-what-they-know)
* [What it does not hold](#what-it-does-not-hold)
* [The body is not available to a screen reader](#the-body-is-not-available-to-a-screen-reader)
* [How the built-in manual is written](#how-the-built-in-manual-is-written)
* [Why the styles are not made HTML/CSS themselves](#why-the-styles-are-not-made-htmlcss-themselves)
* [The core and the port](#the-core-and-the-port)
* [The boundary between the core and the browser](#the-boundary-between-the-core-and-the-browser)
* [The document model](#the-document-model)
* [How text flows](#how-text-flows)
* [How a grid and absolute coordinates are laid out](#how-a-grid-and-absolute-coordinates-are-laid-out)
* [How the arrangements nest](#how-the-arrangements-nest)
* [How the cursor is held](#how-the-cursor-is-held)
* [The editor and the undo record](#the-editor-and-the-undo-record)
* [Styles and their fields](#styles-and-their-fields)
* [What layout recomputes every time](#what-layout-recomputes-every-time)
* [Tables](#tables)
* [Formulas in tables](#formulas-in-tables)
* [Slides and frames](#slides-and-frames)
* [Pages and printing](#pages-and-printing)
* [Saving and loading the document](#saving-and-loading-the-document)
* [Block identity for showing a difference](#block-identity-for-showing-a-difference)
* [The mapping into HTML](#the-mapping-into-html)
* [The wording on the screen](#the-wording-on-the-screen)
* [The tools, the menus and the panels](#the-tools-the-menus-and-the-panels)
* [What a document received is trusted with](#what-a-document-received-is-trusted-with)
* [Opening, saving and writing back](#opening-saving-and-writing-back)
* [More than one window, and opening from the desktop](#more-than-one-window-and-opening-from-the-desktop)
* [Markdown, plain text and source](#markdown-plain-text-and-source)
* [If kspage is to become a code editor](#if-kspage-is-to-become-a-code-editor)
* [How the page is checked](#how-the-page-is-checked)
* [The screen and its controls](#the-screen-and-its-controls)
* [Accepted limits (what is decided not to change)](#accepted-limits-what-is-decided-not-to-change)
* [Further reading](#further-reading)

---

## What it is aimed at

**kspage aims to replace Word, Excel and PowerPoint**: to serve all three uses in one document, with nothing to set up first, not to sit beside them or cover part of their work.

**The aim decides what counts as a fault.** For "a place to write a design document beside the code", a `.docx` it cannot open would be out of scope. Under this aim it is the first wall a person meets, since they have only the document they were sent.

**The aim is not a claim that it is reached.** What kspage cannot do is the manual's last chapter ([`content/manual_share.kspls`](../content/manual_share.kspls)). What is decided never to change is "Accepted limits" below. Neither list shrinks because the aim grew: an aim written without its gaps makes a reader trust what is not there.

## Why the three can be made one

A document, a spreadsheet and a slide deck **differ only in how their data is arranged, not in its shape**. Styled text, the box it goes into and the box placed on a slide are the same in all three. Only the placing differs: flow, a grid, or absolute coordinates.

Built separately, everything but the placing would be written three times. **The most costly part is text layout and the IME**: line breaking, the selection, the cursor and showing the text being composed are needed in every view. Joining the three adds no work; it removes the tripling.

## Why the folders are split by 'what they know'

The folders are **not split by the order of processing**. A compiler, with one order, can be cut into stages. Here layout, editing and export all call one another, so a cut by order would scatter one piece of logic across three places. What can be cut is what each part knows. From the bottom: `model` (the document and the styles), `expr` (a cell's formula and value), `lay` (layout), `share` (the external formats), `write` (editing) and `port/` (the screen). None imports anything above it.

**The folders make the levels a constraint, not just names**: importing each other across directories is a compile error ([`docs/SPEC-language.md`](../../docs/SPEC-language.md)'s "9.4 Circular imports and visibility"), which a flat layout would not give. The compiler does not catch every upward import. One that closes no cycle (`expr` -> `share`) builds with zero diagnostics, so `make test-conventions` checks the order.

**Do not split a cycle inside one level.** `lay/`'s `flow` calls the three arrangements and the line building, and each calls back into `flow` (layout enters through flow). Split into another folder, the cycle crosses directories and does not build. So a cycle decides where a folder's boundary goes.

The day (date) type lives in `model/` because a style's number format (`Number_spec`) holds a day's text. In `expr/`, `model` would depend on a level above it.

**Do not give a file the name of its folder** (no `calc/calc.kspls`): the folder says what it knows, and the file its subject within that.

## What it does not hold

How kspage feels to use is based on the existing office suites, but they are not copied wholesale. **For each item below, the decision is "none"**; adding one needs grounds that overturn the reason given.

**Typed text is never changed automatically**: no curly quotes, no capital at the start of a sentence, no automatic bullets. Once the changed text becomes the real text, the way back to what was typed is gone.

**A cell's type is not guessed from its text**: nothing turns "1/2" into a date or drops a leading 0. The style says the type (`Number_spec.dated`). A guess is invisible where right and visible only where wrong, so whoever changes the document starts from "why is this one cell different".

**No procedure runs inside the document** (no macro). With one, opening a document would mean running it, and merely reading a document someone sent would touch the machine. To repeat a fixed routine, write KSPL code that edits the document (the core is a library).

**Another document is not embedded.** As with a picture, only where it came from is held. Embedding would need an arena and a reader for each kind of document.

**A circular formula is not iterated to a solution.** The answer would change with the number of rounds, so the same document would look different at every opening. A cycle is reported and stopped.

**There is one way to point at a cell** (`A1`); no other notation gives the row and column as numbers. If one cell could be written two ways, whatever reads formulas would have to handle both.

**It does not compete on the number of functions.** Only what cannot be written with what exists is added; a function for a formula that can already be written makes two ways of saying one thing.

**There is no time axis** (no slide transitions, no moving elements). A slide is a block that holds a place, not a separate type (["How a grid and absolute coordinates are laid out"](#how-a-grid-and-absolute-coordinates-are-laid-out)). So a time axis would put into the document what cannot be carried into the printed page, the exported HTML or a diff. (Paper cannot say "this paragraph appears 0.4 seconds later".) Nor does the screen alone hold an effect. An effect that cannot be written into the document is lost on saving, so what was written would silently disappear. kspage's worth is being writable as one document, not winning as a presentation program.

Note: **An order can be held**, since on the page it flattens to everything shown (["Showing frames in turn is an order, not a timeline"](#showing-frames-in-turn-is-an-order-not-a-timeline) below).

## The body is not available to a screen reader

**kspage has no way to hand the body to a screen reader or a braille display.** This is not "not yet": it is the largest price of drawing the body onto a canvas, and it is accepted.

**To a screen reader, the body is one picture**: assistive technology reads only the DOM, never inside a canvas. The only way to hand the body over is a second copy of the text, never shown on screen.

**The reason is not the cost but the harm**: a second copy must be kept in reading order, carry the cursor and the selection, and follow every edit.

Caution: **The day that copy drifts, the screen reader does not go silent; it goes on reading an old body.** Nobody can read inside the canvas, so there is no way to check from outside that the copy has drifted. Silence as a picture is better than the wrong text read aloud.

**Whatever can be handed over without a copy of the body is handed over.** The test is "does it also help someone reading with their eyes"; something built for the screen reader alone has no place here.

| Where it is handed over | What happens without it |
| :-- | :-- |
| The page's declared language ([`port/web/page.html`](../port/web/page.html)'s `lang`) | Japanese and Chinese **write the same character in different shapes**, so some environments draw Japanese prose in a Chinese typeface. It is also how a screen reader picks a voice |
| The tab title follows the document's name ([`port/web/side.js`](../port/web/side.js)'s `showPlace`) | Different documents can be open in different windows, yet **every tab shows the same name** (the tab title is the only handle for finding a window folded away) |
| The body's canvas says what it is and **that its content cannot be read** | An unnamed canvas is announced as "an empty picture", so **the reason it cannot be read appears nowhere** |
| The tools (the ribbon, the menus, the panels, the status bar) | (They are DOM already, and carry their role and name) |

So the manual's "what it cannot do" chapter states **that the body cannot be read and that this will not change** ([`content/manual_share.kspls`](../content/manual_share.kspls)).

**There is no field for a picture's alternative text either**: it would reach nobody, so it would be decoration only the writer sees (Principle 5).

## How the built-in manual is written

`kspage/content` holds **the content itself, not a sample**. Opening a document replaces it, so it decides only what appears when nothing is opened. A reader can type into it in place, and reloading brings it back. The chapters are separate files because of the 1000-line limit.

**Do not write a chapter number, the table of contents or a note number as text**: layout counts them all (the style's `outline` and `Collect` produce them), and a manual writing them out would not use the machinery it explains.

**Do not put the manual on the bridge side**: the boundary's shape and what the manual explains change for different reasons.

**Write in the reader's words, which are the screen's words too**: the manual and the screen give each thing one word ("The vocabulary is one" below), so a label the manual quotes is the label the reader finds. A gate checks only the navigation's tab names (`make test-conventions`). Every other quoted label is kept right by reading it against the screen.

**Keep each level of heading to one grammatical shape**: a chapter heading is a noun phrase; a section heading is an `-ing` verb phrase for a task and a noun phrase for an explanation. Otherwise a glance down the contents cannot tell tasks from explanations.

**Say where each action is**, down to "under `Paragraph style` in the `Style` menu", in the label's own words. Otherwise the feature is explained and still cannot be reached.

**Quote a label in the manual's text with “ ”, not with "**: the text is prose a reader sees, so typographic quotes are right for it, and a straight quote ends the literal carrying the text. Escaping it would leave `\"` mid-sentence, which whoever changes the wording must keep right.

## Why the styles are not made HTML/CSS themselves

A document written once must also work on the web as it stands. That is no reason to make the styles HTML and CSS: **with a layout of its own, kspage would have to implement CSS again** to give the borrowed styles their meaning.

Instead, **only the structure is kept close to HTML's**: a tree of blocks, a row of inlines, and styles referenced by name. So HTML export is a mechanical mapping (a block is an element, a style name a class). Referencing styles by name is for this. With sizes and weights held on a block, the HTML writer would have to work the name back out of the values.

## The core and the port

The core lays out and edits; the port measures text and draws for one target, the browser. These sections say why the line between the two runs where it does.

### Why a browser's layout is not borrowed

When an office suite in a browser feels slower than a desktop one, the causes, heaviest first, are:

| Order | What is happening |
| :--: | :-- |
| 1 | **The chain from layout to drawing is long.** Every character typed rewrites the DOM, and the browser's own layout, style resolution and compositing run. The larger the document, the longer each round trip. |
| 2 | **Garbage-collection pauses are uneven.** The collector decides at run time how long it stops, and steady work such as typing stutters inside a pause. |
| 3 | **There is much to load and interpret at start-up** before the first screen appears. |
| 4 | The network. |

**The network is not the main cause.** Editing happens entirely on the machine. Only saving and editing together make a round trip, and a faster network changes neither 1 nor 2.

**The DOM and CSS are designed for web pages**, not for pagination, footnotes or strict line breaking. With them, kspage's own pagination would pile on top of the browser's layout, and the chain in 1 would get no shorter. Drawing onto a canvas itself, kspage controls the whole chain from the edit to the screen.

**The price is large**: line breaking, the selection, the cursor, the IME and hit-testing a click are all written in-house. The choice holds because the three views share them all.

### Why the core is a pure function

Layout is `(the prose, the styles, the font's measurements) -> a row of placed boxes`. It needs neither a window nor a canvas. From outside it needs only font measurement, received as a struct of function-typed fields ([`model/font.kspls`](../model/font.kspls)'s `Font_source`).

* **It can be tested before a window exists.** A table of fixed measurements ([`model/fixed_font.kspls`](../model/fixed_font.kspls)) can be plugged in, so no real font or OS is needed, and the answer is the same every time.
* **Where it draws can be chosen later.** A thin layer encloses the difference between a canvas and a native window.

**Font measurement has two entry points: a line's width and its height** (`Font_source`'s `measure_width` and `vmetrics_of`). Pass them an already resolved `Font`, so they depend on nothing of how a style holds things. Tied to the styles, they could not be defined until the document model was fixed, and without them layout could not be tested. Neither rasterizing nor shaping is held: the canvas uses the browser's own shaping, so the two entry points do not grow when a drawing target is added.

JS passes the width and takes the boxes back. It holds neither line breaking, nor inheritance, nor how the cursor advances. The wasm side does the tables' calculation too, and **it runs before the layout**: it changes the cells' text, so run afterwards, the boxes would point at the old text.

**Everything is bound into one file.** Separate files opened from `file://` cannot use ES module loading or `fetch`, which the same-origin rule refuses, and a web server would be needed just to serve static files.

### Why the browser is the main target

**Each OS designs its native IME differently** (Windows: IMM32 / TSF; Linux: IBus / Fcitx; macOS: `NSTextInputClient`), and that is where most of the porting work lies. In a browser the three composition events (start / update / end) are enough.

Caution: **Handle the three composition events as a set.** With only the update handled, committed text stays marked as still being composed.

**Development can go on under Windows.** The core calls no OS, so day-to-day work needs only the tests. Once the screen matters, it is checked in a browser.

### How drawing is split between the core and the browser

The browser's side does two things and no more: it measures text with `measureText` and returns the measurements, and it draws the laid-out boxes with `fillText` (`port/web/`, whose files are listed in [kspage](../README.md)'s "What is here").

Caution: **Do not bring layout decisions into it.** The thicker it grows, the more must be rewritten to move to a native window.

**The wasm has neither libc nor malloc.** It is built with `--freestanding` and allocates from a free list over a static buffer. The C that replaces libc sits with the target that has none ([`port/web/rt.c`](../port/web/rt.c)). In ksplc's freestanding runtime it would be defined twice in the builds that also link a real libc.

**The link guarantees that the borrowed entry points have not grown.** An unresolved name not on the allowed list fails the link. With any name allowed, code that pulls in libc still links, and "there is no such function" first shows up in a browser.

### Where memory runs short it refuses rather than crashing

**A failed allocation stops the whole wasm**: the screen freezes, and reloading the page loses unsaved work. So kspage refuses where the text first comes in ([`port/web/inout.kspls`](../port/web/inout.kspls)'s `kspage_web_load_buffer`), before the open document is touched.

**Derive the cap from the arena** (`port/web/state.kspls`'s `doc_limit`). Written as a number in two places, the refusal and its report get out of step the day the arena is widened. Widening alone changes nothing: four times the arena moves the limit four times further, and past it the page still dies. Whoever widens it first looks at how many instances the wasm gate starts and at the load gate's peak, since both grow with the arena.

**The cap counts blocks, because blocks set the cost of layout**: at the same number of characters, a table costs 40 times as much. The other products all cap by bytes or characters.

**A cap in bytes cannot guard it.** The cost per byte of reading, layout and writing back, measured on paragraphs, does not hold for other shapes; a table's is far higher. Raising the multiple does not help. Fitted to the worst shape, the cap shrinks drastically for everything else and still guarantees nothing: a text can be packed tighter, and a table within the cap still freezes the page during layout. Per block, the cost flattens out. It explodes per byte only because packing puts many more blocks into the same bytes, and eight times the columns (1x20 -> 1x160) costs only 8% more. So a cap per block decides what fits (`port/web/state.kspls`).

**The cap per block has two values, by arrangement: 512 B for flow and 2 KiB for a grid.** Do not make them one. A grid costs five times what flow does, so one number either cuts prose's cap to a fifth or lets a table cross the limit; kept apart, prose keeps the higher cap. Inside a grid, everything below counts as grid, since the column-width solver's cost applies to rows and cells alike. A style name that does not exist counts as flow, as in layout. So at about the same size the answer differs by shape: prose of 1,162 KB opens, and a table document of 1,225 KB is refused (a gate holds this pair).

**It refuses at three tiers**, because each looks at something different.

1. **The byte sieve** (`kspage_web_load_buffer`). It guarantees nothing: it only turns away a size that plainly cannot fit, before the arena for the text is prepared.
2. **The gate on the count of blocks** (`kspage_web_load` / `kspage_web_load_markdown`). After reading and before the swap, it counts the blocks and refuses when layout and writing back will not fit.
   * **It means something only before the swap**: afterwards, the open document is already gone.
   * **Send Markdown through the same gate.** If only one route is guarded, the page dies the same way through the other.
3. **The last net** (`panic_hook` -> the JS throws). One way past the gate remains: reading itself comes before the count of blocks is known. So a packed text (a row of `{}`, three bytes per block) can use up the arena within the cap.
   * A cap fitted to reading's worst case would stop that too, but **cutting every ordinary document to a quarter, to stop a shape the net already handles, is not a fair exchange.**

**The net calls a JS entry point that throws.** The wasm holds no code that raises an exception, so only the JS side can throw. A freestanding panic records the reason and stops at `for {}` (`../../std/lang.kspls`), so an unhandled panic freezes the screen. The exception passes through the wasm frames to the catch at the caller (`port/web/api.js`'s `cramps`).

**After a refusal, the half-built arena is freed** (`kspage_web_recover`). Otherwise refusing loses half its point. After the unwinding nothing points at the half-built chunks, so the arena shrinks by that much for good, until even saving fails. Keep the reading's arena in a global: a local one is lost in the unwinding, leaving nothing to free it through. Do not touch the document. It is swapped only after reading, so a refused read leaves it unharmed.

**Report "too large" apart from "cannot be read".** The fixes are opposite: change the text, or split the document or widen the memory (`port/web/file.js`'s `whyNotRead`). Do not guess the reason from the size. The cap is not a count of bytes, so the core's reason is passed on unchanged (`port/web/api_io.js`'s `load` returns the reason, not true or false). The debug log shows the memory left, which its reader most needs just before a failure.

### Whether an entry point takes an arena depends on what it returns

**"The receiver has an arena, so none need be passed" is not true in general**: an arena argument may choose where the result goes, not where the receiver lives, and the two are not always the same arena.

* **An entry point that attaches to the receiver's tree uses the receiver's arena** and takes none. `Block.add_text` and `Block.add_child` allocate in the arena `inlines` / `children` hold. A caller's choice would allow a tree whose child dies before its parent. An `Editor` lives exactly as long as its document, so `new_editor(d)` takes none either.
* **An entry point that returns a fresh result takes the arena as an argument** (and keeps it): `lay.layout`, and `Block.tiles_of` / `fresh_line` / `detach_line`.
  * **Do not pass `doc.arena` to it.** A page is thrown away at every keystroke, so the web bridge makes a short-lived arena and passes that (`port/web/bridge.kspls`'s `page_arena`). In the document's arena, pages would pile up for as long as the person works.

**Do not decide which case applies by reading the code.** Add a check that fails wherever the arena passed differs from the derivable one, confirm no gate fires it, and only then drop the argument.

## The boundary between the core and the browser

**The entry points JS calls in wasm are the `#export` functions under `port/web/`**, from the row in [`port/web/bridge.kspls`](../port/web/bridge.kspls) and the files beside it. The comment above each says what it takes and returns. The names wasm borrows from JS (`extern "C"`) are those [`port/web/imports.txt`](../port/web/imports.txt) lists.

**Do not list the entry points on the linking side.** The `#export` in the source decides what is exported, and the generated C marks it so `--gc-sections` keeps it. A hand-kept list silently misses each new entry point, and "there is no such function" shows up only when the button is pressed.

**`make test-kspage-wasm` checks that nothing else is exported**: only `kspage_web_*`, the `memory` and `__heap_base` the linker adds, and `memcmp`, which a target with no libc needs. `make test-conventions` checks that the two sides agree, matching the source's `#export` against the entry points JS calls by name.

Caution: **Both directions break silently.** JS calling an entry point the source lacks still links, and fails only when pressed. An entry point nobody calls stays, holding the boundary wide (Principle 5).

**Every entry point that asks which cell, holder or line edge the cursor is in is called after layout**, since none of that is known before. Outside a table or holder it returns 0 and leaves the key to the caller.

A `len` argument is text first written into the typing arena (`kspage_web_input_buffer()`), unless the entry point's comment names the loading arena. An entry point that "writes out" text puts it in the one out arena (`kspage_web_out_ptr()`), which the next write clears, and returns its length. Each `out` receives the numbers listed in that entry point's comment under `port/web/`. **Where an entry point can refuse for more than one reason, it returns the reason as a number its comment lists** (per `Sort_end`, `Merge_end` and the like), and the page words it.

### Values that cross the boundary

**Ask the wasm side for the arena the numbers pass through** (`kspage_web_nums()`). Memory borrowed below `__heap_base` is C's stack: a deep call writes to the same place, so the numbers written out vanish inside the entry point that wrote them. The arena's width, `kspage_web_nums_cap()`, fits the entry point that writes the most (a box's 15). Keep one reader (`kspage.js`'s `ks.nums(n)`).

Caution: **Do not hold the width on the JS side.** With a view made in each place, the day the arena is narrowed a view silently reads its neighbour. With one reader, checking that the numbers fit is one place too.

**No slice crosses the boundary** ("11.1 Types that cannot cross the C boundary" in [`docs/SPEC-language.md`](../../docs/SPEC-language.md)): the pointer and the length are passed separately. Nor can a struct be returned, so several values are returned through a place passed in for them.

**The wasm's memory becomes a different `ArrayBuffer` when it grows.** Do not keep a `Uint8Array` on the JS side; make one at each read.

**For text written out, take the length before the place**: if memory grows during the write, the place moves. Passed as two arguments of one call, the place is fixed first, since JS evaluates from the left. Reading is the same: make the view only after taking the arena. If the memory grows there, an array made earlier still points at the old `ArrayBuffer`.

### Keys, focus and menus

Caution: **Do not take the keys of composing.** A `keydown` while `isComposing` belongs to the IME, and taking it stops the composing.

**Do take the undo key.** Otherwise the hidden input field runs its own undo: the field's text goes back and the body does not.

**JS puts in the undo separator** after a pause in typing (`kspage_web_break_undo_group()`). Without it, one undo takes back everything typed.

**Take copy, cut and paste** on the `copy` / `cut` / `paste` events, which carry `clipboardData`. The hidden input field is empty, so by default a copy takes nothing that can be pasted, and a paste goes into the field and never reaches the body. Do not take them on the key side: the key starts the browser's own copy, and taking the key stops that event from arriving. A paste's `input` has `data` null (the text is in `clipboardData`) and does not arrive as a keypress. With nothing selected a copy is not taken, so copying text from outside the page is not blocked.

**Take Ctrl+F, Ctrl+S, Home, End and Ctrl+A.** The body is inside the canvas, so the browser's own versions act on the page instead. Its search finds nothing (search looks broken). Its "save page" downloads this HTML, not the document. Home and End scroll the whole window, and Ctrl+A selects the whole page while the cursor stays put.

**A button and the formula field both take the focus.** Return it to the input field afterwards, or typing stops working.

**Do not rewrite the formula field while it is being typed in**: refilled on every redraw, it loses what was typed. It is applied on Enter alone. Applied when the focus leaves, a press elsewhere would change the text.

**Open one menu at a time.** Close the others before opening. `toggle` arrives afterwards, so closing there leaves a moment with two open, and the one meant to be pressed hides behind. Close a menu once a command is pressed (left open, it covers the canvas), but not in a field where a number or a name is typed (the typing could never be finished).

### What composed input needs

**Do not put the focus on the canvas.** The canvas is not an editing element, so with the focus there the IME does not start. Only the hidden input field takes the keys.

**Do not hide the input field with `opacity: 0` or `visibility: hidden`**: on an invisible element composing sometimes does not begin. Make only its colour transparent and keep its size.

**Keep the input field over the cursor**, moving it at every layout. Otherwise the IME's candidate window appears away from the text.

Note: `make test-kspage-browser` checks these three in a real browser, but **not that real composing works**: a headless browser has no input method. To confirm composing, open the page by hand and type.

### Drawing on the canvas

**Only the editing screen draws a region's frame.** Printing, presenting and the HTML written out all go through what draws boxes, so a frame drawn there would appear on the page too.

**When printing, paint the background white and set the text colour to black** (a colour a style sets is kept): the screen's colours follow light and dark mode, so a dark screen's white text would not show on paper.

**Pictures are read and drawn by the page's side.** Read each source once (otherwise every redraw fetches it). Redraw once it has loaded: loading is asynchronous, and drawing without waiting leaves a blank. Until then, draw the frame alone (drawing nothing makes the inserted picture look lost).

**Only a press with Ctrl (⌘) held follows a link**, since on the editing screen a press on text places the cursor. Do not move the cursor when following it (the person could not go on typing on return). A link looks like one because of its decorating style, so drawing needs no special case.

**Draw the page's header and footer after cropping**: they sit in the margins, outside the frame that crops the contents. Their coordinates are from the page's top left, so do not shift them again (with the margin added again, they land off the page). Lay them out again for every page, since the numbers change.

**Draw underline and strikethrough after the text, in the text's colour**; drawn first, the text covers them. Their thickness follows the font size (a fixed 1px looks like a hair at large sizes). The composing underline sits at the box's bottom edge, so it reads as a different line from the style's underline (below the baseline).

Caution: **Set the colour again for every box.** Left overwritten, the caller's colour carries on to whatever is drawn next.

**Draw a box with no colour set in the caller's colour** (which follows light and dark mode). Paint the background before the text, or it covers the text.

**Paint all the band fills first, then all their lines.** Painted one band at a time, a neighbouring cell's fill covers this cell's line, and the table's grid goes missing in places. Bands come before the boxes and the selection; painted after, they cover both. Unlike a region's frame, a band is document content: it appears in print and when presenting, so draw it where boxes are drawn. A line straddles its path, half on each side, so move it inward by half its thickness, or it spills into the neighbouring cell.

### The page's scripts share one scope

**The JS runs concatenated into one `<script>`** ([`port/web/bundle.kspls`](../port/web/bundle.kspls) binds it, in the order [`port/web/page.html`](../port/web/page.html) names).

Caution: **Do not declare one name with `let` / `const` / `class` in two files**: the whole block is then never evaluated, so each file passes alone and nothing happens on the screen. `make test-js-syntax` checks each file and the concatenation, but only their syntax, so a mistyped name gets through.

**The script files share only two objects, `ks` and `ui`**: `kspage.js` makes `ks` where it starts the wasm, and `page.js` makes `ui` for the page's frame. `make test-conventions` checks that every field read from either is one some file puts there, and that every field put there is read. So a mistyped read and an entry point nobody calls are both caught. Do not expose a field that only its own file uses; keep it out of the `return`. Two other shared objects are not checked this way: `kf`, through which [`port/web/file.js`](../port/web/file.js) and [`port/web/save.js`](../port/web/save.js) pass entry points both ways; and `ks.api`, which faces callers outside the page, so a field there that no file reads is no defect.

## The document model

### A block has no field for its kind

A heading, a paragraph and a list item are all blocks; only the style name differs ([`model/doc.kspls`](../model/doc.kspls)).

Caution: **A separate kind field would say the same thing as the style**; each place that draws would pick one of the two, and where they disagreed nothing would decide which is right.

### Unset is expressed with `Option`

Every style field can be unset, and an unset field inherits from the parent.

Caution: **Do not use 0 or an empty string to mean unset.** No weight is 0, but `false` is a real value for italic, so in some fields the marker would collide with a value.

**The rule covers the fields that inherit and the values a person can type as 0.** A measurement that cannot usefully be 0 keeps 0 as its "not set" mark, and the section on that field says what 0 means: a slide's width and the paper's width (the container's width), the paper's height (no pagination), the body's width (no limit), a paragraph's leading (the font's own height) and a rule's width (no rule).

Only the font is inherited. **Space before and after a paragraph, and the indent, are not**; inherited, they would space a child twice over at every level of nesting.

### Only the block holds its position

Of the three arrangements, only absolute coordinates cannot derive where a block goes from the previous element. Every frame's position is its own, so `Block` holds `frame: Option<|Rect|>` ([`model/doc.kspls`](../model/doc.kspls)).

**Do not put it in the style**: a style is shared by name, and an unshared value would need one style per frame. Nor outside the document: held in a separate table, the positions alone would be lost on saving and reading back.

**Every value that differs from one block to the next is held on the block for the same reason**, though the blocks share a style: a frame's build step (`step`), a table's column widths and row heights (`size_of`), a merge's span (`span_rows` / `span_cols`), and the name a formula or a reference points at (`name`). The sections that use each field point here.

**Fields that one arrangement alone reads are the exception to the rule that only the arrangement branches** ("Why the three can be made one"): `frame` (flow and the grid derive a position from the previous element) and `step` for absolute coordinates, and a table's sizes and merges for the grid ([`model/doc.kspls`](../model/doc.kspls)'s `Block`).

### An unknown style name does not stop layout

A style name missing from the table is treated as unset ([`lay/flow.kspls`](../lay/flow.kspls)).

Caution: **A misspelt name passes silently.** Check first with `Sheet.find` that a name exists. Failing partway through layout instead would let one typo blank the whole screen.

### Styles are told apart by role, not by name

**Where the core, the page, a theme or a reader needs "the heading style" or "the code style", it looks for a role in the table below**, never for a name.

Caution: **Neither the core nor the page may list styles by name and remember them.** A remembered list breaks silently the day a document renames a style: that one style alone keeps the previous theme's colour. What is looked at is the role.

| The role | How it is recognised |
| :-- | :-- |
| A heading | its depth (`outline > 0`) |
| A code block | it does not wrap (`wrap == false`) |
| A table | it is laid out as a grid (`arrange == grid`) |
| A slide | it is laid out at absolute coordinates, and has a size |
| A collecting block | its way of collecting (`collect`) |
| A framed block | it has a fill, it draws a line |
| A table's cell | a flowing paragraph with inner space and no marker (`cell_like` in [`model/style.kspls`](../model/style.kspls)) |

Caution: **A theme must cover the styles a person made too.** Chosen by name, those alone would escape it.

**Inserting looks a style up by name, then by role, then makes one by name.** By name alone, it breaks the day the name changes; by role alone, it cannot choose between two of one role. A slide style cannot be made up: the core must not decide a slide's size, so the style has to exist first.

### Asides and annotations are held beside the text, outside the flow

**An aside attached to a holder belongs to the holder's block** (`Block.aside`). On a slide it is the presenter's note. No output includes it, so only its writer sees it. It is attached only with the cursor inside a holder (a table, a slide, a picture): beside an ordinary paragraph the screen could not show where it is. It is saved, and one undo removes it.

**An annotation on text belongs to its run** (`Inline.remark` and `Inline.remark_by`). It is what somebody said about the text, not part of the document, so it too stays out of the flow. It covers a range, so splitting the run leaves it on both halves (like a link, unlike a note's mark, which is a point). Runs with different annotations are not joined, or one remark would cover both. The core does not decide who wrote it (it holds no user name); the name comes from outside when it is added. One undo removes both the words and the author.

### A picture: the document holds only its source and size

**Do not put the picture itself into the document**: in a browser the arena is a static 1 MiB block, which one photograph fills. The document holds only where the picture comes from and how it is laid out. Reading and drawing it happen outside (the core cannot read a picture). In exchange, the document alone does not carry its pictures.

**The document holds the size too.** The core cannot measure a picture, and an entry point asking outside would make layout depend on how the reading went. With the size in the document, layout is the same whether or not the picture can be read. A picture with only a source is not laid out.

**It is not shrunk to fit**: where it does not fit it overflows (as with a set column width), since shrinking needs the aspect ratio, and knowing it means reading the picture.

**A picture is not split**: its size is known first, so where it does not fit, it moves whole to the next page (like a slide).

## How text flows

* **A line breaks after whitespace, and beside any non-ASCII character.** Breaking at whitespace alone would let prose written without spaces run along one line forever.
* **Even where not one character fits, one character is placed, overflowing.** Otherwise the line never advances and layout loops forever.
* **The whitespace at a break stays at the end of the earlier line.** Moved to the start of the next, it would break the left edge.
* **The characters of a line sit on one baseline.** A line is as tall as its tallest character, so only closing the line decides a character's vertical position.
* **Width is always measured for the whole text from the start of the line.** Adding widths one character at a time drifts under an implementation that kerns.
* **The break is found by bisection.**
  * **Do not measure one character at a time going forward.** Each measurement asks the typeface (`measureText` in a browser), so k measurements for a k-character line would set the cost of every keystroke's relayout. Ask once whether all the rest fits, and bisect only where it does not.
  * **Bisection relies on "a longer text is never narrower than a shorter one".** Even under negative kerning the boundary slips by one character at most, and the caller measures an overflowing line again.
  * **Snap the midpoint to a character boundary** (a Japanese character is several bytes). Searching only backwards or only forwards does not find the boundary ([`lay/line.kspls`](../lay/line.kspls)'s `midpoint`).
* **The measured width is returned with the break.**
  * **Do not measure the same text twice.** When "all the rest fits", the caller puts the text just measured into the box. Without the width returned, each box would cost two calls across the boundary. Most paragraphs do not wrap, so this halves the calls.
  * **Do not return it after a bisection.** The break depends on the text alone, so the break returned lies before the point measured (`Inline.known_fit`).

### Text that has not changed is not measured again

**Measuring calls across the boundary** (in a browser it asks the real typeface), so measuring the whole document at every keystroke would slow typing as the document grows. Unchanged text has an unchanged width, so a run caches what it measured ([`model/run.kspls`](../model/run.kspls)'s `wide`).

The strongest answer, laying out only what is in view (as VS Code does), is closed to kspage because it paginates: the page count and breaks need what is out of view. kspage also stays in step rather than catching up, a common complaint.

**A run caches measurements, never layout**: the width of its whole text, and the answers `fit` gave, keyed by "typeface, space, start" and holding "break, width laid, width to the end" (`model/run.kspls`'s `Fit_at`).

Caution: **Do not cache a box or a line.** Where a line wraps depends on the width the text before it used, which a run alone does not know.

The whole-text width spares a paragraph that does not wrap all measuring, but never hits for a run that wraps. Once the whole does not fit, `lay/line.kspls`'s `fit` bisects for the break, measuring about log(length) times, and the following lines are not whole texts either. With `fit`'s answers cached too, a keystroke measures 7 or 8 widths whatever the document's size: the one run typed into is measured again (its cache is thrown away there). **This keeps to "no box or line is cached"**. Caching the break alone would break it, since the break depends on the width the text before used. With the space in the key, the answer is fixed.

**A run caches for one "typeface and space" pair**, throwing the cache away when asked with another. Where one paragraph is one run (the commonest shape), every question from the start of a line carries the same space, so it keeps hitting. A run that starts partway along a line and wraps misses (its first line has a different space). It is measured again, which costs no more than having no cache.

**The cache lives in the run's own arena**, so `remember_fit` takes no arena argument.

Caution: **Do not let layout's arena be passed in.** The cache would point into memory freed at the next layout, and in wasm that becomes a loop that never stops (a freestanding panic records it and enters `for {}`).

**Staleness is stopped by keeping invalidation in one place.** Only three methods of `Inline` change the text shown (`buf` and `shown` are `priv`), and they throw the cache away. Do not guess by a fingerprint of the content: the length misses `ab` -> `ba`, and even a strong fingerprint can collide.

The typeface is part of the key, since the same text in another typeface has another width. The typeface name is compared by address, not read. The styles' table owns that text, so replacing it changes the address, and another address holding the same text is merely a miss (slower, never a wrong width). This relies on a typeface's measurements never changing. kspage loads no typeface (it only names the environment's), so they cannot move while the page is open. **Whatever adds typeface loading must also throw the cache away when loading finishes.**

**Vertical metrics are cached per typeface.** They do not depend on the text (a line's height comes from the typeface), yet uncached they are asked for three times per box. A document uses no more typefaces than styles, so cached on the layout side, the questions drop to the number of typefaces. Put what is added in one place: without a way to "give the height from the metrics", whoever caches the metrics would ask the typeface again for the height ([`model/font.kspls`](../model/font.kspls)'s `line_height`). When the cache overflows, it simply fails to remember: an old entry is swapped out, and the next box measures again.

**An entry point that sets a value again does nothing when the value is the same.** In the plain-text shape "no value" arrives at every setting ([`expr/calc.kspls`](../expr/calc.kspls)'s `show_free`), so invalidating there would measure the whole document again.

Note: The same input always gives the same count, so the gate checks **the count of measurements**, not time: the same shape of document is typed at two sizes and the counts must match, covering a miss as well as a hit ([`../tests/wasm/store.mjs`](../tests/wasm/store.mjs)).

### A style is looked up by name once

**Laying out one block looks up the same style name about ten times** (collecting headings, notes, running numbers, a fence's breaks, the arrangement, the box, the fill). The lookup scans the table from its end, so the further back a document's style sits in the table, the heavier each keystroke. Remembering the last style found removes the gap between the table's head and its end.

**The other products do not look styles up here**: Word and Writer store a reference to the style itself in a paragraph's attributes. kspage stores a name. A style is shared by name, and what is saved is a name too (saved by number, an old text would point at another style the day a style is added). So the lookup is made faster without changing what is stored.

**The one style found last is remembered.** One block keeps asking for the same name, so nine times in ten that is enough. What is remembered is the style's place in the table, not the name's text, which could live in an arena freed first. A place is checked against the name the table holds.

**Do not remember "there was none"**: a style of that name added later could then never be found (adding does not clear the memory). The lookup checks the name before returning, so a stale memory is merely a miss.

**No index of names is added.** One memory is enough where it hits, and an index would shorten only the miss: a document pointing at a name not in its table, fixed by changing the faulty document. If documents full of misses appear, the answer is bisecting an array of indices sorted by name. (The order of `styles` itself must not move: saving, the HTML and matching read that order.)

**`Map` is not used.** The key names come from a document, so colliding keys can be crafted (the decision in `../../std/docs/DESIGN.md`; the check is `make test-conventions`).

### The inner padding is not derived from the line height

The fill's band needs space between its edge and the content (a code block does).

Caution: **Do not make that space from a multiple of the line height.** A multiple acts between line and line, so it opens the prose's leading too, not just the band's edge (the text looks thinly stretched).

By Principle 6, **`Style.pad` is the space inside all four sides** ([`model/style.kspls`](../model/style.kspls)): the band spans the region's full width, and only the content is inset within it.

**Always restore the region's right edge.** The pen holds only one right edge per region, so otherwise the next sibling is laid out that much narrower ([`lay/flow.kspls`](../lay/flow.kspls)'s `close_block`).

### A code block's lines form one fence, painted as one band

A code block is a row of paragraphs (one line is one paragraph). **Painted one at a time, the background shows through between the lines and the block comes out striped.**

Caution: **Do not decide this in two places, layout and Markdown export.** Changed in one alone, the block is one sheet on screen while each line is fenced separately in the text (or the reverse).

**[`model/fence.kspls`](../model/fence.kspls) alone decides where one fence starts and ends.** Consecutive paragraphs with the same style name that do not wrap, carry no marker, collect nothing and are arranged by flow form one fence. The name "code" is not looked for (the same style under another name would then not become a fence).

Layout **takes one fill band at the fence's start and stretches it to where the fence closes** ([`lay/flow.kspls`](../lay/flow.kspls)'s `Joint`). Do not open space before or after partway through (the background would show through there). Do not take a new band partway through either (an unused band would stay in the drawing side's count).

The space above and below is a multiple of the line height (the band closes at the height of the line's box, so with the line exact the text would touch the edge).

### The indent does not narrow the region

The band of the fill and the rule starts before the indent ([`lay/panel.kspls`](../lay/panel.kspls)'s `hold`). **Narrowed by the indent, it would leave a strip of background at a code block's left, and in a list the fill would break off before the marker** (the marker sits inside the indent). So the indent becomes the left space inside the fill.

### The column set

**Word's columns are a section break**: an invisible mark, whose breaking, meshing and emptying happen out of sight. CSS's `column-count` holds no such mark and levels the heights as the content comes.

**A column set is one block** ([`lay/columns.kspls`](../lay/columns.kspls)). The style holds the number of columns (`Style.columns`), and the block's children are dealt into the columns. No invisible mark such as a section break is made. The block is the range itself, so a table or a slide can sit inside a column set without overflowing a column.

**Heights are measured first and levelled**: the children are laid out one at a time at a column's width and measured, then rewound and dealt out. So the right column is not left empty when the content is short. A child is not split (its two halves would land in different columns), so the heights do not always come out equal. Fewer children than columns is still a column set (repacked, the column set would vanish from the screen).

**A column's width is not held.** It follows from the number of columns and the gap between them (`Style.column_gap`). A width field would allow settings where width × count + gaps does not add up to the region's width.

**A column set does not cross a page** (split across pages, the reader could not tell which column continues which). Where it does not fit, the whole set moves to the next page.

## How a grid and absolute coordinates are laid out

Both **leave the content of a cell or a frame to flow** ([`lay/flow.kspls`](../lay/flow.kspls)'s `place_blocks`): given the region's top-left corner and width, flow lays the content there and returns the height used.

**Do not write how content is arranged three times.**

* **A grid column takes its set width, or else fits its widest content.** The row with the most cells decides the number of columns. Columns that do not fit shrink with their ratios kept; cutting only the excess would collapse the narrow ones first.
  * Width is measured **as the real layout does it** (the cell laid out once, its box's right edge read). Added up instead, the indent, inheritance and wrapping would each be solved two ways.
* **A row is as tall as its tallest cell**, so only laying out its cells decides its height.
* **A laid-out cell keeps the shape cut by its column's width and its row's height.** Sized to its content, neighbouring cells would not line up.
* **The space after a paragraph goes in after the children**; opened before them, it would split the block's inside and pack the gap to the next block tight.
* **A slide at absolute coordinates does not stretch**: it returns the slide's size, not its content's, since absolute coordinates mean that a slide's size is fixed first.
* **A child with no position is laid over the whole slide.**
  * Caution: Dropped instead, written content would silently disappear. An apparent overlap can be fixed; something out of sight cannot.

## How the arrangements nest

**Each block's arrangement is set by its style** ([`model/style.kspls`](../model/style.kspls)'s `Arrange`). Flow hands over to the grid only at a block whose style is `Arrange.grid`, and a cell's content returns to flow. So a table inside a table, or a list inside a table, is laid out the same way.

Caution: **Do not let the document hold it**: with "this is a table" written into the tree, the tree could no longer be laid out by another arrangement. The arrangement is not inherited either, or even a paragraph in a table's cell would become a table.

**Flow is the entry point**: only flow knows what follows the previous element, so only flow can hand over to another arrangement. All three nest in one another (a table in the flow or in a table's cell, a slide in the flow, a table in a slide's frame), and every combination is laid out the same way.

**A slide's size is set by its style** (`Style.width` / `Style.height`). That is what lets absolute coordinates sit in the flow. Partway along a flow there is no fixed size, so a size taken from the content would break "a slide's size is fixed first", and slides of one style would differ in size.

**Set both width and height**: a frame sits at absolute coordinates in px, so with the width left to the container the document would look different at each window width. A width of 0 means unset and becomes the container's width. Across, there is a container width to fall back on; down the page there is none, so a height of 0 is a slide 0 high.

**A frame's position is relative to the slide's top-left corner.** Only layout decides where the slide lands in the flow, so a `frame` read as screen coordinates would leave the content behind when the slide moved.

### A region's kind is its arrangement

On the editing screen a grey dotted line shows which band of the page is prose, a table or a slide, from bands layout leaves behind (`Page.regions`). The outermost block's arrangement decides: flow is prose, a grid a table, absolute coordinates a slide. **A region's kind is `Arrange` itself**; under another name, nobody would notice the style's arrangement and the region's kind drifting apart.

**Merge consecutive flow into one region**; split per paragraph, one continuous piece of prose would look like as many regions as it has paragraphs.

**Shrink a table's or a slide's region to its laid-out content's width**, or a page-wide frame would surround a narrow table. Down the page it stays a band (the space before and after a paragraph belongs to its region too).

**Regions are recorded only when the whole document is laid out** (`flow.layout`). What lays out a region's inside again (`place_blocks`) also lays out nested content, so recording there would add a region per table cell.

**The frame is drawn only on the editing screen.** Printing, the one-slide-at-a-time view and the exported HTML carry none: it is not content but a guide to which kind of tool is in use where the cursor is.

### Flow and the grid call each other

[`lay/flow.kspls`](../lay/flow.kspls) and [`lay/line.kspls`](../lay/line.kspls) are split into "stacking blocks" and "building one line" (for the 1000-line cap per file). The line side holds the pen (`Pen`). The block side sets the per-paragraph settings on it again (alignment, leading, the marker at the start of a line). **Forgotten, a paragraph that sets no style of its own is laid out with the previous paragraph's settings.**

[`lay/flow.kspls`](../lay/flow.kspls) and [`lay/grid.kspls`](../lay/grid.kspls) import each other, so the cycle stays inside one folder ([Why the folders are split by 'what they know'](#why-the-folders-are-split-by-what-they-know)).

Both entry points (`flow.place_blocks` and `grid.place_rows`) take the shape "How a grid and absolute coordinates are laid out" gives. **Neither looks at `at.h`**: the content decides the height, and the caller what overflows.

## How the cursor is held

The cursor is held as "which `Inline`, and which byte in it" ([`lay/caret.kspls`](../lay/caret.kspls)), **not in screen coordinates**. When the width changes the boxes move, but the position in the document does not, so the cursor survives relayout. (The `Inline` it points at lives in an arena relayout does not throw away.)

In exchange, a click must become a document position, so **each box records which `Inline`, and which byte in it, it came from** ([`lay/flow.kspls`](../lay/flow.kspls)'s `Box`).

* **A click snaps to the nearest character boundary**; text inserted mid-character would break it. At equal distance it goes left.
* **A click outside every box goes to the nearest box**; a click on the margin that did nothing would make the screen look dead.
* **Empty text gets a zero-width box.** The cursor can stand only on a box: without one, an empty cell or paragraph could not be clicked into, and an added row would stay buried in the table at height 0.
* **Vertical distance weighs more than horizontal**; at equal weight the end of a neighbouring line can come out nearer, and the cursor would jump to a line other than the one clicked.
* **Deleting removes a character, not a byte**; deleting one byte of a multi-byte character breaks the text.
* **The `Inline` holds its text**, copied in when added, so the caller need not keep it alive.
  * Caution: **Do not keep a reference to the text.** It grows and shrinks with editing, and moves when it does.

### Left and right follow the document; up and down follow the laid-out lines

← and → move in document order.

Caution: **Do not stop them at the boundary of a run or a paragraph**; stopped there, the cursor could not get past the start of a paragraph. The order is layout's (a block's own inlines first, then its child blocks).

↑ and ↓ move across the laid-out lines, because only layout decides where a line stands. The target column is kept, and the move acts as a click at that column on the neighbouring line. **Call them after relayout.**

**The target column is set where vertical movement began**; taking the current column each time would pull it in at every short line passed. Forget it after a horizontal move (`collapse`), or ↑ or ↓ after ← or → would jump to the old column. Only vertical movement sets it again.

### A position at a wrap is read by how the cursor got there

A position at a wrap reads both as "the end of the line before" and as "the start of the next line", since the same `offset` belongs to two boxes. Which one the cursor stands at depends on **how it got there** (`Caret.at_line_start`):

* **It came down from the line above, or the start of that line was clicked** -> the start of the next line.
* **Anything else** -> the end of the line before.

**Without the distinction, ↓ does nothing there**: the new position would be drawn at the end of the line before, so only the column would jump.

The flag comes from the click, so `hit_test` sets it (a position is at a wrap when it is at the start of a box that is not the start of its run). **Set a position through `at`**; writing the field directly would leave the remembered column and this flag as they were.

### The cursor's cell is outlined

The cursor's table cell is outlined ([`lay/caret.kspls`](../lay/caret.kspls)'s `cell_frame`) in **the cell's shape as layout left it**, redrawn at every layout.

**The content's box does not stand in for it**: inset by the indent, it is narrower than the column, and neighbouring outlines would look misaligned.

**When nested, it is the innermost cell**: the outer cell holds the same inline too, and layout records cells outermost first, so searching from the end finds the inner one first.

**The outline and an editable formula are two things.** The outline only shows which cell the cursor is in, while a formula can be written only on the cell's first inline ([`expr/calc.kspls`](../expr/calc.kspls)'s `takes_formula`). So in a cell holding two runs the outline appears while the formula field stays closed.

### The selection is two points

The points are "where it started" and "where it is now". **The direction it was extended is not stored**: document order decides which point comes first (`Doc.index_of`), so a stored direction would say the same thing twice.

Caution: **Always collapse the selection when the text moves.** If only the current point moves, the editor treats text as selected when nothing is, and whatever is typed next deletes that range.

**The core computes the highlight rectangles.** Painting whole boxes would highlight an entire run when only a few characters are selected. Each rectangle needs the width up to the selection's end measured, and only the core holds the measurement entry point.

**An inline that has become empty stays in the tree**, or any cursor or box pointing at it would dangle; an empty run draws nothing.

### Home and End go to the ends of the laid-out line

`Editor.move_to_edge` moves to the start or end of **the laid-out line, not the paragraph**. With Shift held it extends the selection there. It does not leave the container: the end of a table row would land in the next cell's text, so the edge is the cell's. Call it after layout, which decides a line's ends (as with ↑ and ↓).

Two boxes are on one line if they overlap vertically; by top edges, a line mixing character sizes would read as two.

### Select all runs from the first run to the last

`Editor.select_all` selects from the first block's first run to the last block's last run: **the whole document, not the page in view**.

**A block without any text is skipped** (a picture or a shape has nowhere for the cursor to stand). The runs at both ends are found in one place (`Block.first_run` / `last_run`), so what "the first run" means cannot differ between the ends.

### The text being composed goes into the document too

Typing Japanese needs the text being composed on screen until it is committed.

Caution: **Do not hold it separately, outside the document**, or wrapping, style inheritance and baseline alignment would all need a second solution for the composition alone.

Instead, the composition goes into the document, and the cursor records how many bytes before it are being composed. Layout and drawing work as usual, unaware of it. **Until committed, the text can vanish at any time.** Replacing it deletes the old composition, then inserts the new (inserting without deleting would pile it up at every keystroke).

It is told apart by a mark on the box ([`lay/flow.kspls`](../lay/flow.kspls)'s `Box.composing`). **Layout does not set the mark**; `mark_composing` does, at every layout, since the rebuilt boxes lose earlier marks. It marks every box the composition covers, since a composition can cross a wrap.

Caution: **Typing and deleting during a composition go to the composition's handling**: typing commits it first; deleting cancels it whole. Cutting into its middle would leave the next replacement unable to know how much to delete.

**The composition does not go into the undo record.** It can vanish at any time, so recorded as typed, a cancelled composition would leave a step whose undo restores nothing. The commit is recorded, as one "typed" step ([`write/typing.kspls`](../write/typing.kspls)'s `commit_preedit`).

**So do not add anything that merely clears the composing mark.** The text would stay in the document with nothing in the record, a hole that cannot be undone. Moving the cursor and typing both go through the commit first.

A composition begun after deleting the selection differs: that deletion is an edit of its own, so it stays in the record and does not return when the composition is cancelled (the undo brings it back).

## The editor and the undo record

One `Editor` holds the document, the cursor and the undo record ([`write/edit.kspls`](../write/edit.kspls)).

Caution: **Do not change the document directly.** Nothing is recorded, leaving a hole the undo cannot restore. Only two operations in `Editor` change text (insert and delete), and both record their inverse first.

### Undo is held as inverse operations

**No copy of the document is taken**, since the cursor points at the `Inline` itself and a swapped-in copy would leave it dangling. Each edit records its inverse instead: deleting for an insertion, inserting again for a deletion.

Caution: **Copy the text before deleting it**; afterwards it cannot be read.

**Apply the inverses newest first**, or the positions the later operations looked at would have shifted. While undoing, redo records the inverse of each inverse (the original operation) onto a new step.

**Once something new is written, discard the redoable steps**, or a redo after undoing and writing something else would apply edits to text that no longer matches.

### Undo then redo restores the document byte for byte

**Undo, redo, and the document is back to the same bytes.** The undo rests on this: change only the undoing side, and a redo can trample the earlier edit. The invariant is checked (`../tests/wasm/edit.mjs`).

### Where a step ends is decided outside the core

What one undo restores is a step.

**Do not make each keystroke a step**, or undoing one sentence would take dozens of presses. Continuous typing is one step, cut when the cursor moves and when a composition is committed.

**A pause between keystrokes does not cut a step**: the core has no clock, so a caller that needs a cut at a pause calls `break_group`, as the browser side does after a pause in typing.

A step that changed nothing is not recorded; its undo would restore nothing.

### The record holds every kind of instruction in one row

The undo record is one row of instructions, each undoing one edit, whatever the edit touched: text, a cell's size, a row or column, a run, a style, a frame, the paper and the rest. The kinds are the variants of `Op` in [`write/record.kspls`](../write/record.kspls).

Caution: **Do not split them into separate records.** The undo order would split, and interleaved edits would stop adding up. Applying one style puts the split, the apply and the join in one step.

**Undo and redo go through the same path** (`apply_inverse`); written twice, a new kind of instruction would reach only one of them.

**A cell's size is one instruction for columns and rows alike** (a field says which); split in two, the same shape of record would exist twice. It remembers "unset" too; restored as 0, a size would appear where the content had been fitted. Dragging does not grow the record. The setting saved when the drag began undoes the repeated moves, the step boundaries are at the grab and the release, and one drag is one undo.

**A frame's position remembers "unset" too** (a frame with no position covers the whole slide, so restored as a 0-size rectangle it would vanish).

**The paper settings are saved whole** (the same reason as a style's look). In the paper, 0 means "no pagination" (height), "the container's width" (width) and "no limit" (body width), so saved field by field, "not set" and "was 0" would look the same.

**Replacing a setting with the same value adds no step**: the screen sends all seven fields whichever one is touched, so steps whose undo restores nothing would otherwise pile up. The text sent is compared whole (field by field, a field added later would be forgotten).

### The change history is kept outside the document

"When, who and what changed" goes to an append-only log ([`ksdb`](../../ksdb/README.md)) ([`share/trail.kspls`](../share/trail.kspls)), **so that git is not needed.** Append-only, the log keeps what was written readable even if a write fails partway.

**The document is the source of truth**: deleting the history leaves the document intact, not the reverse, so the history is a separate file. Do not mix it into the document, which would grow at every save and holds only how it stands.

**The core decides neither the time nor the person** (it has no clock and no user name). It keeps the "what", the "when and who" are attached from outside, and typing on before they are attached loses nothing.

**Name what was done after the step's last instruction**: a replacement deletes, then inserts, so by the first instruction typing would read as a deletion. Do not record the typed text itself: text meant to be deleted would stay in the history.

Caution: **When the log is full, refuse and count what was dropped.** Silently discarding old entries would make "it should be in the history" wrong.

**When the document is read again, reopen its history too**; appended to another document's history, the entries would tell another document's story.

### Doing the last command again is its own key

**`F4` repeats the last command where the cursor now is, and redo keeps `Ctrl+Y`.** Excel and Word put both on `Ctrl+Y` (redo if there is something to redo, else repeat), so which one a press will do cannot be told beforehand. `F4` is Excel's own second key for repeat and a browser page does not take it, so each job keeps one key.

**The command is remembered, not inferred from the record** (`Again` in [`write/record.kspls`](../write/record.kspls)); inferring would be guesswork. Each repeatable command registers itself when it succeeds, so the list is readable in one place. What is kept is what the command needs (an axis, a style name), not where it acted, since repeating acts where the cursor is.

**Answer the key either way**: done, the status bar clears; refused, it names the command it was holding.

### Splitting a paragraph adds a block

Enter **splits the paragraph at the cursor** (`Editor.split_block`): the runs after it move to a new block, and a run straddling the cursor is split first. Backspace at a paragraph's start is the inverse: its runs move to the end of the previous paragraph and the emptied block is removed (`Editor.join_prev`). Only a paragraph's start joins, or the text before the cursor would move.

**A style names the style that follows it when a paragraph is ended at its end; naming none means the same style again.** Otherwise Enter at the end of a heading makes another heading, and the outline and the table of contents each gain an empty line. Word calls the field "Style for following paragraph", Writer and InDesign "Next Style"; Google Docs hard-wires Normal after a heading.

**It acts only at the paragraph's end** (`follows` in [`write/block.kspls`](../write/block.kspls)): split partway along, the halves are one paragraph cut in two, and both keep the style, as in every product with the field. A paste does not use it: it puts in one text, not a person ending a paragraph, so every line it makes takes the style where it lands.

**Naming none is the default, so nothing already saved changes**, and such a style writes nothing into the file (naming itself would say the same thing a second way). A name found in no table counts as none, so the follower is looked up when splitting, not bound when the style is read.

Caution: **Leave a run in each paragraph.** The cursor can stand only on a box, which appears only where a run is. A split at the end or the start leaves one side empty, so that side gets an empty run, or it could not be clicked into.

**Do not split inside a table cell**: a cell is a row's child, so a paragraph beside it would give that row alone one more cell, and the rows' column counts would disagree (cells grow only by adding rows and columns). Nor does Backspace join at a cell's start. A paragraph with nested blocks is not joined either: its children would move with it, and nothing decides whether before or after the previous paragraph's children.

**Deleting a selection that crosses paragraphs joins them the same way** (`Editor.delete_span`). Deleting only the text would leave empty paragraphs standing, still showing their markers (a list's "•", a number). The following paragraphs are joined on until the one where the selection ended has merged into the cursor's. The deletion and the joining are one step; as two, one undo would produce a state nobody remembers writing.

**Stop where joining is impossible**: across a cell only the content is deleted, and joining stops at a paragraph holding a table or a slide.

**Layout is asked whether joining is allowed** (`caret.cell_of`): the document says neither "table" nor "slide", so only layout tells whether a block is a cell. So the joining lives in `block`, and `edit`'s `delete_selection` deletes text only.

### Copy and paste count paragraphs by line breaks

`caret.selection_into` (selection to text) and `Editor.paste` (text into the document) follow one rule: **a paragraph break is one line break**.

**An `Inline` cannot hold a line break** (breaking lines is layout's job), so pasting makes one paragraph per line break. Folded into one paragraph, the pasted lines could be restored only by typing each break again.

Caution: **Do not write a line break where a run is split inside a paragraph.** Applying a style splits a run, so copied text would gain lines just because something was made bold. What counts is where the enclosing block changes, not the runs.

**Inside a table cell, a line break is folded into a space**: a cell's paragraph is not split ("Splitting a paragraph adds a block"), and dropped, part of what was pasted would silently vanish.

**One paste is one undo**: the splitting and inserting share one step, which the caller opens (`Editor.split_here` opens none). With one undo per line, nobody could tell how many presses undo a wrong paste.

Cut has no operation of its own: it copies, then calls **the deletion of the selection**.

### Find returns only a range, and replace selects and types over it

[`lay/find.kspls`](../lay/find.kspls) returns only a range in the document, and **must not touch the document**, or merely searching would add to the undo record.

**A match crosses runs**, since applying a style splits them and text including a bold part must still be found. It does not cross paragraphs: there is no character between them, so the end of one and the start of the next would be found as one text. It walks in layout order (a block's own inlines first, then its children), or "find next" would not move in the order seen.

**Start matching only at character boundaries**; byte by byte, a match could begin in the middle of a Japanese character, and the selection would split it.

Replace **selects and then types over** (`Editor.replace_next`); typing deletes the selection, so one replacement is one undo.

**"Replace all" does not wrap around at the end**; it would find the replacement text again and loop forever (replacing "a" with "aa" does exactly that). Skip a match that cannot be replaced and carry on (stopping would leave everything after it unreplaced).

**The visible text of a formula cell is not typed over**, since the next recalculation would write it back. Search still finds it, since being led to where a value is beats not finding it.

### Compound operations are split into files by purpose

`Editor`'s methods are split between [`write/edit.kspls`](../write/edit.kspls) (the operations that change the document, `do_*`, and the undo record) and files of compound operations built on them, split by what they change. **A file is capped at 1000 lines** (Principle 3), so keep splitting by purpose as they grow; each file's share is in [kspage](../README.md).

**The document changes only through `write/edit.kspls`'s `do_*`**, the one place that records undo; compound operations only call it.

An extension method is visible only where imported, so code using `Editor` **imports every file holding an operation it calls**.

## Styles and their fields

A style holds the look and the arrangement, and blocks share it by name. These sections say which field belongs to the style, and how each one acts.

### Applying a style splits a run

From the screen, only **the style name** of text can be changed (`Editor.set_style`). Weight and size held on a run directly would break the HTML mapping ("Why the styles are not made HTML/CSS themselves").

A run has one style, so styling part of a run splits it at the selection's two ends and writes the name on the runs between. **With nothing selected, it applies to the cursor's whole run** (there is nowhere to split).

Caution: **Do not split a run that holds a formula.** Its visible text is the computed result, overwritten whole at the next recalculation. Split, the second half would miss the overwrite and keep the old value. A formula run takes the style whole.

**After applying, join neighbouring runs with the same style**, or runs multiply with every apply and remove. Neighbours are joined within their block, so the parents of the styled runs are collected first (a selection crosses blocks).

**After a split or a join, move the cursor with it**; typing into a removed run would put text in the document that appears nowhere on screen.

**A position exactly at a split stays with the earlier run**, which stays in place, so it keeps pointing at the same spot. On the later run, the selection's end would point at a run outside the range, and the applied style could not be read. A join, by contrast, takes the run along, so byte 0 moves as well.

**The selection stays after applying**, so another style can be applied next, or this one removed.

### A paragraph's style is separate from a run's

The line-start marker (a list's `•`) and the arrangement belong to the paragraph's style, so the marker is added and removed here (`Editor.set_block_style`), not on a run. **Deleting the text leaves the marker**: it is not text, so only removing the paragraph's style removes it. An empty name means a plain paragraph.

**A style with another arrangement is not applied**: a table's or a slide's style on a paragraph would not match its content's shape, leaving the text nowhere to go, so the choice is refused and reverts.

**It applies to every paragraph in the selection, and only to paragraphs**: the range a run's style covers, so one selection never lands on two different things. It skips holders (a table, a row, a slide, a picture) and cells: on a cell the grid would go, and on the table the arrangement would turn into flow and the table fall apart. Layout says whether a block is a cell (the document does not say "table"), so the page must be laid out first. However many paragraphs it covers, it is one undo.

### Direct formatting is a style name too

"Change the colour of just the selection" does not make a run hold a colour.

**Direct formatting reaches only the characters' look.** Alignment, indent, spacing, leading, the mark at a paragraph's head and a page break belong to the style alone. Where a style and direct formatting can set the same thing, changing the style later leaves the directly formatted places as they were. In Word a number applied by hand holds only until the next style is applied; in PowerPoint a slide changed by hand stops following its master (Principle 6).

Caution: **Build a style name from the settings, make sure a style of that name exists, then apply it.** A colour held on a run breaks the same mapping ("Applying a style splits a run"), the keystone of this design.

**The same settings give the same name** (`decoration-cff0000-b00ff00-u1`). A new name at every apply would grow the styles' table, and the saved text, by one each time. Do not change the order of the fields, or the same settings would give a different name from before.

**Create the style and apply it in the same step**; separate, undoing one operation would take two presses. With nothing set, the name goes back to empty, which removes the direct formatting.

**Bold and italic are applied the same way, but not on the colour's side** (`Ink`): weight and slant change the measurements, which would break "a colour changes neither the width nor the height". They are held as `Accent` and copied into the style's font fields. Either can be "off", so one run can be made plain inside a bold paragraph.

### Changing a style is an edit to the document too

The screen changes **one whole style** at a time (`Editor.set_look`).

**Do not make an entry point per field**: unset is a value in its own right, so field by field, "there was none" and "it was 0" would arrive in the same shape.

Caution: **Keep it and carry it as one whole style.** With copying written per field, a copy missed when a field is added gives no message. It surfaces as "only the colour does not reach the other window", visible in neither the text nor the layout. Copied whole, a new field adds no operation (`style.put_face`).

**The name alone is not changed**: a style is shared by name, so renaming it would strip it from every place it is applied. What is carried is the same text as when the style is added (one style's JSON). With two formats, changing only one would produce text that cannot be read back.

**Changing a style changes every place with its name**: that is sharing by name. To change one run alone, a new name is made and applied. Do not make two styles with the same name: `Sheet.find` returns the first added, so the later one is never used.

A new style sets nothing; it is meant to be applied and then changed.

**Changes to the styles' table go through the undo record too**: the table is saved with the document, so a change that cannot be undone would be a hole (the reason for not changing the document directly).

### A link: the run holds where it points, and the style holds the look

A link has two parts: where it points, and looking like a link. **Do not hold them in one place**: the target differs run by run, while the look is shared by name. Mixed, the styles' table would grow by one style per target.

So the run holds the target (`Inline.href`), and the look is applied as a direct-formatting style, **both in one step**. As two, one undo would leave either text that is merely blue or a link with no look. Removing is one step too: the look returns to the parent's with the target.

**Unlike a formula, typing does not drop it**: a formula goes stale when its text changes, but a link's target has nothing to do with its text.

**Neighbouring runs with different targets are not joined**, or two adjacent links would become one target (the same treatment as a style name).

### Colour is inherited with the font but stays out of `Font`

The text and background colours belong to the style (`Style.ink`). **Do not put them in `Font`**: `Font` is the key for measuring, and a colour changes neither the width nor the height. Mixed in, two fonts differing only in colour would be measured twice. So layout carries a `Look`, the font and the colour bound together, as the inherited value.

**The background is inherited like the text colour.** Otherwise a background set on a paragraph's style would appear nowhere, since boxes exist only where there is text and a paragraph has no box of its own. Only the boxes are painted, like a highlighter (the fill band, below, paints a whole paragraph or cell).

**The highlight goes over the band's fill**: the narrower one on top. Where one style sets both, the same one wins on screen and in the exported HTML.

**It can be unset**: unset text is drawn in the screen's default colour, where black would be unreadable on a dark screen. Do not use 0 to mean unset. Black (`#000000`) is a real value, so it is held in `Option`, as italic's `false` is.

**A colour is `0xRRGGBB`, with no transparency**: at 24 bits it crosses the boundary as one number (it fits exactly in an F32). The text form is `#rrggbb`, used alike by the saved file, the exported CSS and the screen's swatch.

**Decide the text colour together with the fill**: the fill (`Style.fill` / `Ink.background`) is a fixed number, but unset text takes the screen's default colour, so deciding only one allows bright text on a bright fill on some screens.

Note: The rule colour has the same problem, and its default black is a dark screen's background. So a line meant to show what was added gets a colour readable on either screen (`write/insert.kspls`'s `drawn_color`).

### Underline and strikethrough sit with the colour

Both belong to the style (`Ink.underline` / `Ink.strike`) and are inherited with the font. **Do not put them in `Font`**: like a colour, a line changes neither the width nor the height, so it is not part of the measuring key.

**`false` means "draw none"**; if it meant unset, one run inside an underlined paragraph could not have its line removed (as with italic's `false`).

**In the exported HTML, "draw none" has no effect**: CSS's `text-decoration` propagates to children and cannot be cancelled by one, so the parent's line is drawn through it. The screen can remove it, so here alone the two look different.

**Write both as one declaration** (`text-decoration-line: underline line-through`); written separately, the later overrides the earlier and only one line appears.

### The fill and the rule are laid as a band, not a box

The fill behind a paragraph or a cell, and the rule around it, belong to the style (`Style.fill` / `Style.rule_width` / `Style.rule_color`). **A box does not stand in for them**: boxes exist only where there is text, so an empty paragraph or cell could not be painted and the rest of a line would stay bare. Layout leaves one band per block (`Panel`).

**The block holds neither rule nor fill; the style does**, and changing it changes every block with that name. Held on a block, they would need a new instruction in both the carried format and the undo record (carrying one whole style already exists, and a new field adds no operation to it).

**The band is taken before the content and its shape filled in after**, since the height is unknown until the content is laid out. Taken first, it keeps document order, so an inner block's band comes later and lies on top.

**Its top edge is the top of the laid-out content, not the height when it was taken**: a block crossing a page is laid out and then moved to the next page, making that height stale, and the band would stretch from the old page to the new one.

**Do not include the space before and after**, or the gap between paragraphs would be painted too, merging into the neighbour's band.

**A cell's band is realigned once the row's height is known**; left at content height, the grid would be missing under the shorter cells. So a band points at its block, letting each cell's band be found afterwards.

**Which sides are drawn is not held**: all four are drawn, neighbouring sides overlapping, since removal per side would need a rule for whose setting wins against the neighbouring cell.

The fill can be unset, and a rule is off at width 0 (a rule always has a colour, so it needs no `Option`).

### A shape is the band drawn in another outline

A shape is **the same band with an outline other than a rectangle** (`Style.shape`): an ellipse, a rounded box, a triangle, a diamond, or a line or arrow drawn as the band's diagonal. It is not a separate kind of element: two things would then hold a fill and a rule, doubling up layout and printing.

**The style holds the shape**, as with the frame and the fill, and no value changes it. The style also says which end carries an arrow's head (`_back` is the end it starts from), since the band alone has no direction.

**A shape belongs to the holder where it was clicked**: a slide, a paragraph or a cell alike, as Word and Excel lay one over the body (where it may not go is "How a shape is drawn" below). It holds no text, so it cannot be clicked into; grabbing its frame's corner moves it.

**A band on a frame closes at the frame's height, not the content's**: at absolute coordinates the frame's size is fixed first. Closed at the content's height, a frame with no text (a shape) would be 0 high and vanish.

Lines and arrows do not appear in the exported HTML (their position is not written, so their ends are unknown); an ellipse does, since rounded corners give the same shape.

### Alignment and leading are per paragraph, and take effect when the line is closed

Alignment belongs to the style (`Style.align`) and **takes effect when the line is closed**, once the remaining space is known: the closed line's boxes shift across together.

Caution: **Do not shift where there is no remaining space.** A wrapped line fills the width, so a negative shift would push characters outside the column. Neither alignment nor leading is inherited (like the space before and after a paragraph). Inherited, the next paragraph or a child with no style would take the previous paragraph's alignment, and something nobody remembers changing would move.

**It works the same way inside a cell**, whose content flows at the column's width, so right-aligning numbers comes for free.

**Justification spreads a line's remaining space into letter spacing** (`Box.spacing`) without changing the measurement entry points. Letter spacing is space added after each character, which the core can count and add. Passing it to the entry points would grow what every port implements ("font measurement has two entry points" holds).

**Only wrapped lines are stretched** (closing a line is told whether text continues after it). Spread over a paragraph's last line, a few characters would scatter across the whole column.

Caution: **Do not include the last letter space in a box's width.** A box ends where its last character does, and the next box starts one letter space further on. Then, however many boxes a line is split into, its right edge meets the column's, by one rule for every box (width = measured width + (characters − 1) × spacing).

**Hit-testing must add the same spacing** (`caret.width_to`), or the visible character and the click position drift apart along the line. Drawing uses the spacing it is given as is; spread again, it would drift from what layout computed.

**Do not write the letter spacing into the exported HTML**: the browser decides its own line breaks, so copied spacing would slip line by line. `text-align: justify` is written instead, leaving the spreading to the browser.

The leading is a multiple of the line height (`Style.line_spacing`); 0 means unset and keeps the font's height (like a slide's width). **Apply it to the line height only**; applied to the font size, it would grow the characters when the aim was to space the lines.

**It is relative to one line, not to the font size.** One line is the height the font gives, taller than the font size (about 1.26 times). This is how Word's, Writer's and Docs' "multiple" counts, unlike CSS's `line-height` number (relative to the font size).

Note: So the field's name states the unit (`port/web/menus.html`'s "leading (lines)"). A bare number would be entered with CSS's meaning and open the lines wide.

**Do not add a field with CSS's meaning alongside** (the same thing would be settable two ways).

### The line gap is kspage's own number, since the canvas cannot give it

The canvas measures text and nothing more. The leading a typeface recommends is in its OS/2 table, but a canvas gives only the box above and below the text (`fontBoundingBox*`), so the gap is kspage's own number. **It is set by matching other products**: 0.17em on top of that box matches VS Code's own default almost exactly. Do not raise it: at 0.2em the leading reads as too wide. A style's `line_spacing` multiplies on top of it, so do not make the default wide and tighten it with a style.

### A paragraph that does not wrap keeps the text unchanged

Whether a paragraph wraps belongs to its style too (`Style.wrap`). **Where it is false, what passes the column's width overflows** instead of moving to the next line, as in a code block.

**Wrapping changes the text**: the whitespace after a break is dropped rather than carried to the next line (`lay/line.kspls`'s `skip_spaces`), so code aligned in columns with spaces comes apart where it wraps. Overflowing is better than changing the text: the reader can scroll across, but dropped whitespace cannot be put back.

**This is not inherited either** (like alignment and leading), and it is set on the pen again at the start of every paragraph, or the paragraph after a non-wrapping one would stop wrapping too.

**In the exported HTML, use `white-space: pre`**; stopping only the wrapping would let the browser collapse runs of whitespace, changing the indentation on export.

**The monospace comes from the style's font** (`Font_spec.family`). The core has no notion of "code": as `Arrange` sets the arrangement, the style says the look.

### A number format applies only where text is made from a value

Currency, thousands grouping, per cent and decimal places belong to the style (`Style.number`); only [`expr/calc.kspls`](../expr/calc.kspls) reads them.

Caution: **Plain typed text is not reformatted**, only a formula cell and a formula in the body, where the core makes text from a value. Formatting plain text would turn the characters being typed into a number partway through.

So "type 1200 and see 1,200" first needs **a cell to hold a value separately from its visible text**.

**It is not inherited** (like the arrangement): only the text's own style is used, or a currency set on the table's style would make the headings and notes currency too.

**Error text is not formatted**; `#VALUE!` with a currency symbol would read like a value.

The sign comes before the symbol (`-$1,200`); after it, a negative value would look like a subtraction.

## What layout recomputes every time

**What layout can count is counted at every layout and never stored**: a note's number, the table of contents, chapter and caption numbers, list markers, a graph's bars, a page number, a conditional style and a window's borrowed text. The grounds are the same for each:

* **Stored, a count would go stale** the moment something before it changed, and nobody could see that it had, since the stored text looks as right as a fresh one.
* **One function counts, and layout and export share it**, so the screen and the exported text cannot disagree.
* **What looks over the whole document is collected before layout starts** (headings, captions, a graph's values), so an entry standing early still sees what comes after it.
* **A counted entry points at no text in the document**, so typing cannot delete it and the cursor cannot stand in it.

Each section below keeps only what is particular to its count.

### The run holds a note, and layout numbers it

A note has two parts, the text it is attached to and the note's own text, and the run holds both (`Inline.note`). **The number is not held.** The mark and the list of notes both take it from one place, the order of the collected list, so a mark reading 2 cannot stand beside a list entry reading 3.

**The mark appears after the run's text**: adding a note splits the run at the cursor and attaches the note to the first half. The second half does not inherit it (one note would show two marks), and a run carrying a note is not joined with its neighbours (the mark would move into the middle of the text).

**The mark is superscript**, or it would look like part of the text. The box holds how far it is raised (`Box.rise`), added to the coordinates when the line is closed, so neither drawing nor hit-testing needs to know.

**A note is not laid out at the foot of the page.** That needs each page's body height first reduced by its notes' height, yet only laying out the body decides which notes land on a page. One pass cannot solve it, so layout stays one pass and notes appear where the block that collects them stands.

### The table of contents is built at every layout, not stored

The table of contents is a copy of the headings, built at every layout.

**The style says which paragraphs are headings** (`Style.outline`; 0 is "not a heading", 1 the outermost level).

**The contents keep no list of style names** ("Styles are told apart by role, not by name" above): with "collect h1 and h2" written there, renaming a style would empty the contents.

**Headings are collected before layout starts** (`number.collect_headings`, which export shares): the contents can stand anywhere, and collected during layout, only the headings before the contents would be listed.

**No page numbers are listed.** They need the page each heading lands on, known only after the contents are laid out (its height pushes what follows). Listing them would mean laying out and writing back, or laying out twice, breaking the rule that layout is one pass.

### Chapter numbers are computed from depth at every layout

A heading's chapter number ("1.2.3") follows from how many headings at each depth come before it, so adding one chapter changes every later number and every reference to them in the body.

**The style says the depth (`Style.outline`); the marker says how the number is written (`Marker.outline`).** Do not let the marker hold the depth too, or the contents' indent and the chapter number's levels would come from different values for one heading.

**Depth is counted, not whether a heading shows a number.** Under a depth-1 heading whose style shows no number, a depth-2 heading is still "1.1"; counted by marker it would be "1", losing which chapter it belongs to.

**A skipped depth shows as 0** (depth 3 after depth 1 is "1.0.1"); packed to "1.1", the number would hide the skipped level. The choice is no invisible renumbering.

**Numbers are assigned after collecting** (`number.number_headings`, which export shares), since depth can be counted only with the headings in document order.

**A reference from the body shows the number alone.** A figure reference shows "Figure 2" whole because that is the figure's name. A chapter is named differently by context (`section 1.2`, `1.2 above`), so the surrounding words belong to the referring text. When the target is gone, `?` appears (a vanished number shown as it was would go unnoticed).

### Headings outside the chapter sequence

A title page, the table of contents and a colophon **are headings, but not chapters of the body**.

**Do not take them out by setting the depth (`outline`) to 0.** 0 means "not a heading", so they would drop out of the headings map too and need a separate way to jump to them. Setting the style's `in_chapters` to false keeps them in the map, and out of both the table of contents and the chapter numbering.

**Do not split "shown in the contents" and "counted in the numbering" into two settings.** Split, they make "not in the contents but taking a number" writable, and the chapter numbers get a hole (a combination that can be written will be written some day). Whether the chapter number is shown is a separate matter, held by the marker (`Marker`): "an unnumbered chapter shown in the contents" (a change log, say) takes the marker `none`.

**Other products do not do this**: Word and LibreOffice give the contents' own heading another style and drop it from navigation too, and Google Docs cannot leave it out at all. The two are kept apart here, because people do want to jump to the contents. No separate way to jump to the contents is kept (it would be a second way to do one thing; Principle 6).

**The headings map also jumps to the document's two ends, placed at the ends of its row**: the position says the destination, so it is understood without reading the label.

### Caption numbers count across the document, and a figure is referred to by name

A figure's or a table's caption carries a running number, **counted across the whole document in one sequence per style name**: figures and tables each count from 1 separately, and nothing in between resets them (a reset would renumber the figures after every figure added). A nested figure belongs to the same sequence, or it would disagree with the number referred to from the body. Captions are collected before layout (`collect_serials` in [`model/number.kspls`](../model/number.kspls)): the position in that list is the number, counted in one place (`serial_number`). The text around the number belongs to the style too (the `Figure ` and `. ` of `Figure 1. `).

**The body refers to a figure only by its target's name** (`Block.name`), and `number_refs` writes the visible `Figure 2` in at every layout. Only a block with a running number can be referred to. A number counted among siblings changes with whatever comes between, so a distant reference would point at something else. The referring run holds no text, so it is never split or joined with its neighbour, and Backspace deletes it whole. A name lands on the frame inside a slide, and outside one on the paragraph it stands in.

### List markers are given at layout, not stored

A list's bullet or number belongs to the style (`Style.marker`). **Do not put it into the document as text**: typing could then delete it, leaving "a list item with only its bullet gone", and something would be needed to renumber.

**A number counts consecutive numbered siblings.** A paragraph without a marker in between restarts it at 1; otherwise two separate lists would number on from each other. A nested level is a separate sequence, so a child's number starts from 1.

**The counting is `style.next_ord`**, which layout (`flow`) and the HTML writer (`html`) both call.

**The marker's box points at nothing in the document** (`Box.inline` is null). Hit-testing must skip it, or a click inside the marker would land as a position in the body (in Japanese prose, the middle of a character). Being a box, it is drawn, printed and shown in the one-slide view with nothing extra.

**Do not move the body's left edge line by line.** The marker sits right-aligned inside the indent; shifting only the first line by the marker's width would misalign the wrapped lines.

**Where the indent is narrower than the marker, move the paragraph's left edge right until the marker fits.** Otherwise the marker overlaps the first character, and the number seems to vanish in a heading or a figure title with no indent set. It moves once per paragraph, so wrapped lines share the left edge. A set indent wider than the marker is kept (the left edge does not shift with the number of digits).

**Write it into the exported HTML as text**: `::before` or CSS counters cannot restart the count where an unnumbered paragraph comes between. The text from the same counting is written as is (HTML is not read back, so it never mixes into the document).

### A graph is built from its range at every layout

**The document holds only which values a graph shows** (`Block.chart`), never a bar's height or a value's text.

**The range needs the table's name**: a graph stands in the flow with no table of its own, so `A1` alone names no cell (as with a formula in the body).

**What is read is the computed number** (`Inline.figure`), since the number cannot be recovered from the visible text with its grouping and units. So the document is recalculated before layout (`calc.recalc`).

Caution: **Do not add a drawing primitive.** A bar is a painted band (`Panel`), a line is a band's diagonal, and a value's text is a box (`Box`): all shapes layout already produces. A new primitive would be needed at once by the canvas, the HTML and page export.

**Values are collected before layout starts** (`chart.collect_figures`), since the range finds its table by name anywhere in the document.

**The style sets the height** (`Style.height`): the core cannot derive one from the content (however many values there are, the height does not follow, as with a picture), so with no height set the graph is not laid out.

**Where the style sets no colour, a default colour is drawn** (`lay/chart.kspls`'s `drawn`). Transparent in a style with neither rule nor fill, a resolved range would show nothing, and whoever inserted it could only conclude the range was wrong (Principle 5). A shape differs: a frame with neither rule nor fill is useful as a shape that holds children, while a graph holds none.

Note: The default colour is the one insertion uses (`model/style.kspls`'s `drawn_color`). Kept apart, an inserted graph and a graph read from a file would differ in colour (Principle 4).

A bar starts from 0, and the axis is drawn at 0; showing only the differences would make a short bar look long.

## Tables

A table is a block laid out as a grid. These sections say how its sizes, merges and rows are held, and how a person moves through it and narrows it.

**A table's first row is its heading by position**, with no setting and nothing to switch on: the saved Markdown (GFM) reads it so, and the sort, the heading kept in view and the column filter take it the same way.

### The table holds its cells' sizes, and a set size does not move

Each column's width and each row's height belong to **the table's block, not the style** (`Block.size_of` / `set_size`; "Only the block holds its position" above), or resizing one table would resize every table with that style.

**A row's height works the same way**: content does not push a set height taller, it overflows. The exception is sharing the remainder. Across, the container's width is fixed, so unset columns share what is left; down the page there is no container height, so an unset row is as tall as its content.

The setting is a row of "set / unset" per column. **An unset column still keeps its slot**; dropped, every later column would shift forward one. The cells decide the number of columns, so the settings may be fewer or more (extra ones are not read).

**A set width does not shrink**, or nobody could tell whether the width written took effect or did not fit. Only the unset columns are adjusted. Where the set widths alone exceed the container, the unset columns become 0 and the table overflows. An overflow in sight can be fixed; a silent shrink cannot (the same judgment as not dropping a child with no position).

**Only the grid reads it**; flow and absolute coordinates ignore it, so, as with `frame`, the same tree can still be laid out by another arrangement.

### A border is grabbed at a cell's right and bottom edges

Dragging a border resizes a cell ([`lay/caret.kspls`](../lay/caret.kspls)'s `edge_at` and [`write/edit.kspls`](../write/edit.kspls)'s `drag_edge`). A column's right edge and a row's bottom edge can be grabbed, and **the column or row on the near side** is returned: drag right (or down) and that one grows.

**At a corner, the column wins**; both edges are near, so without a rule the grab would waver.

**Check for a grab before text selection**, or a click on a border would move the cursor and a drag would select text.

**Do not let an edge pass the column's left edge**; a negative width would bring the next column back leftwards over the cells.

**The width is measured from the column's current left edge.** Do not remember the coordinate where the grab began: the drag can change the column to the left as well, so the edge is read again at every layout.

### Typing a number writes to the same place as dragging

By dragging alone, two columns cannot be made the same width (matched by eye, the difference shows when printed), so a size can also be typed ([`port/web/table.kspls`](../port/web/table.kspls)'s `kspage_web_set_cell_size`). **It writes through the same `do_set_size` as dragging**; with a second path, the typed and dragged widths would stay apart, and an undo would restore only one.

**The unit is px, and only px**, as for the paper, the margins and a frame's position (px at 96dpi). Among these products, the unit the fewest people understand is Excel's "count of characters".

**Nothing overrides a typed number.** There is neither "fit to the table's width" nor "automatic fitting". Word has both, and with them a width can revert even after being typed again.

**A row's height has no "minimum"**; the number typed is the height. Google Docs has only a minimum, so a row cannot be made shorter.

**Emptying the field makes the size unset.**

Caution: **Do not let 0 stand for unset**; 0 is a value that can be typed, and typed, it means 0.

The document holds unset as a state of its own (`Option`), so an empty field maps onto it directly. **Show the current size faintly in an empty field**, or the screen gives no starting point.

### Rows and columns are added and deleted at the cursor's cell

**A new row (column) goes after the one the cursor is in, and deleting removes the one the cursor is in** ([`write/edit.kspls`](../write/edit.kspls)'s `add_line` and `drop_line`).

Caution: **Call both after layout**, which decides which cell the cursor is in.

**The last row or column is not deleted**; a table with none would leave nothing to click to add one.

**Shift the size settings with it**; matched by position, each later setting would otherwise land on the row or column one nearer.

**Keep the removed block**, so putting it back puts the same object back. A rebuilt one would differ from the inline the record's other instructions point at, and the text's undo would dangle. A column is "the cell with the same number in every row", so deleting one removes a cell from every row.

**Adding also goes through "put back what was removed"**: build the empty row or column first, and adding and putting back are one instruction.

### Fitting a column measures it, and fitting a row removes its set height

**A double-click on a cell's seam fits it to its content**, the gesture every spreadsheet uses.

**The two axes are fitted differently, because layout already fits one of them.** A row with no set height is already laid out to its content, so fitting it removes the setting. A column with no set width takes an equal share of the region, so fitting it sets a measured width ([`lay/ask.kspls`](../lay/ask.kspls)'s `Fit`).

That asymmetry also answers the common complaint about this feature, merged cells. Excel's row fitting is its own measurement and cannot see a merged cell, while here layout does the work and takes merges in like anything else.

**A merged cell is skipped when a column is measured.** It spans two or more columns, so counting it would make one column as wide as the pair. Dragging leaves merged cells out for the same reason.

**The width is summed per run from the boxes as laid out**: a wrapped run's boxes add up to its unwrapped width, which is what fitting needs. So nothing is measured twice, and no second path through the font metrics is opened.

Caution: **Leave room beside the text, and a floor under it.** Fitted exactly, the text sits on the rule; fitted to nothing, an empty column's seam can no longer be found to drag it back.

**Do not make that margin a setting.** Calc does, and two people's fitted widths then differ. It is one number, kept next to the fitting code.

### An automatic column width includes the inner padding on both sides

**Do not take the content's measured right edge as the column's width.** That edge includes only the left padding (what the placing code indented by), so as the width it is short by the right padding. The text runs into the padding and, where it does not fit, wraps. The fix belongs where the column's width is decided (`natural_width` in `lay/grid.kspls`), not in the style.

**Write a cell's padding with `pad`, not `indent`.** `indent` indents from the left, so nothing opens on the right; `pad` covers all four sides.

### The cell holds its merge, and covered cells are removed

The merged cell holds its span (`Block.span_rows` / `span_cols`), not its style ("Only the block holds its position" above).

**Do not leave a covered cell in the row**: merging removes it, since, left standing, its text would be in the document yet nowhere on screen. Unmerging puts an empty cell back; restoring its text is the undo's job.

**Where each cell stands is counted in one place only** (`Block.tiles_of`): layout, formula addresses and HTML export all need it, and with copies one table could take three shapes. A covered position has no cell, so the next cell moves right.

**A merged cell sets neither a column's width nor a row's height**, which would need a rule for which column its content's width counts toward. Content that does not fit overflows (as with a set width). A vertical merge's height is filled in after the rows it covers are laid out (their cells decide their heights).

**A formula addresses a merge by its top-left cell only.** A covered address is "no cell" (`#REF!`): merged away, it holds no value, and returning 0 would look like one.

**Only a neighbour whose shape fits is merged in**: across, the neighbour to the right spanning the same number of rows; down, the one directly below spanning the same number of columns. A misfit would make the covered area non-rectangular, and layout could not count the columns it skips.

### Merging is a rectangle chosen by dragging, and one press

**The cells to merge are selected by dragging across them, and merged with one press.**

**Do not merge one neighbour at a time.** With "merge with the cell to the right" and "merge with the cell below", merging six cells takes five presses in an order the user has to work out, and no other office suite works that way.

**The range is derived from the selection's two ends and stored nowhere**: a stored range would go stale the moment a row was added, and the two ends say all it needs ([`lay/ask.kspls`](../lay/ask.kspls)'s `cell_range`). With nothing selected it is the cursor's cell, so the caller reads one answer.

**The top-left cell's text is kept and the rest dropped, without asking first.** Excel and Sheets warn every time and LibreOffice asks a three-way question, because they cannot undo a merge cleanly. Here one undo puts every cell and its text back, so a question beforehand buys nothing and costs a press every time (Principle 5).

**A merge inside the range that reaches outside it is refused.** Merged anyway, the overhanging cell would lose the columns it covers and every row below would shift by one.

Caution: **Put the cursor in the cell that remains.** The selection reached into cells just removed from the tree, so left as it was, it would point at a run no longer in the document. Whatever is typed next would then go in without appearing on screen.

**Each refusal keeps its own reason and wording** (`Merge_end` in [`write/cells.kspls`](../write/cells.kspls), the same rule as `Sort_end`): nothing selected in a table, a single cell, a merge reaching outside, read-only. Each is fixed differently: one needs a wider selection, another the inner merge split first.

### A table or a slide is inserted only after the cursor's paragraph

A table or a slide goes **after** the cursor's paragraph (`Editor.insert_table` / `Editor.insert_surface`), the direction rows and columns are added in, so nobody has to remember which way each operation grows.

**It is not inserted inside a table cell**, for the reason a paragraph is not split there. A table inside a table is for code that builds documents, not the screen: it could go "beside" or "inside" the cell, and a click cannot decide which.

**The style says the arrangement**: the document does not say "table", so insertion looks at the style, making one that says grid where none exists. An existing style's arrangement is never changed (every block with that name would change arrangement). So it is set only when a style is added (`Editor.add_style`), and insertion refuses a name whose arrangement does not match.

**Only a slide's style must already exist**: it sets the slide's size, which the core must not choose (as a slide's size is not taken from its content). A width of 0 means the container's width, which leaves the frames' sizes unknown before layout, so only a style with both width and height set is accepted.

**A refused slide insertion names its reason.** "There is no slide style, or you are inside a table's cell" is one wording for two causes; a person in a cell reads the first half and hunts for a style that was there all along. The reasons take the same shape as the sort's (`Sort_end`, below).

### A fresh table takes the size pressed, and its cells take the cell style

**The Insert menu chooses the size on a 10 × 8 grid, and the button inserts at the size last chosen (2 × 2 at first).** This is Word's cap, and a larger table grows with "Insert a row", as there. Every other office suite uses this form. The ribbon's Table button inserts at that size rather than opening the grid: the ribbon is a row of shortcuts that act, and a menu opened there would not stay open. Columns come first ("4 × 3" is four across), as in all three products. The cap is the menu's: the core refuses only a size with no cell (a table read from text can be any size).

**The cells take the cell style, found by its role, and created through the record where the document has none.** One predicate identifies a cell style: `cell_like` in [`model/style.kspls`](../model/style.kspls), a flow paragraph with inner space and no marker. The Markdown reader asks the same one, so tables typed in and read from text share one style. A missing one is made inside the insertion's step (`Editor.styled`), its look taken from the one place that look is written (`dress_cell` in [`share/markdown_look.kspls`](../share/markdown_look.kspls)). Each cell gets an empty run, without which it could not be clicked into.

**The cell style's grid line is 1px and light grey, not black**: among prose, a black grid would pull the eye from the text.

**An existing style with the cell style's name is used as it is**, whatever its look: restyling it would change every cell using it, and a document that made its cells bare on purpose keeps them bare.

**No heading row is made.** Word, Excel and Google Docs insert a plain grid; only Writer styles the first row as a heading. The exported GFM takes the first row as the heading by position anyway, so leaving the look to the person loses nothing.

**A new table's columns get set widths, equal shares of the width it is laid out at**: the container of the cursor's paragraph, less what the table's own style takes off a block (indent and inner space). The one function flow uses computes it (`contents_width` in `lay/flow.kspls`), so the widths set and the layout cannot disagree. The table spans the text width from the start, and a column keeps its width while typed text wraps inside it. Layout's rule is untouched (an unset column still follows its content, as in a table read from text), and the widths go through the record, so one undo takes them with the table. Where the cursor is in no laid-out container, no width is set.

### A move past the table's end adds a row, and Enter moves down a row

**Tab from the last cell adds a row and moves into its first cell. Enter in a cell moves to the cell below, Shift+Enter to the one above, and Enter past the last row adds a row too.** One rule, on two keys: moving past the table's end grows a row.

**Tab growing the table is what Word, Docs and Writer all do**, so someone filling in a table never reaches for the menu; one undo removes the row. The key adds a row through the button's recorded insertion, so its undo is the button's. The new row goes at the table's end, not after the cursor's row: a vertically merged cell can reach the end from a row above, and a row inserted after that row would land inside the merge.

**Enter takes the spreadsheet's side.** In a document's table it starts a paragraph in the cell; in a spreadsheet it moves down. A table here stands where a spreadsheet does and a cell's text wraps on its own, so an in-cell Enter has nothing to open. A person at a table wants the next row. A line break inside a cell is not possible (a cell is one paragraph); the manual's last chapter says so rather than hiding it behind a key.

**It stops above the first row and before the first cell**: a table grows only at its end, never above what was typed.

### Sorting keeps the first row, orders letters without regard to case, and says why it refused

**The first row is the heading and never moves in a sort, whichever row the cursor is in; the cursor only picks the column.** Letting the cursor decide is a trap for hands trained on Excel: they put the cursor in the heading to sort by its column, and the heading is sorted into the data without warning. The heading is the first row by position ("Tables" above), so the sort asks nothing, as the products with no such complaint do. What is given up is sorting part of a table (the rows from partway down): no product offers it from the cursor alone, only a two-row heading needs it, and the manual says so.

**Text sorts alphabetically ignoring case, and texts differing only in case are one key**, as in Excel's and Calc's default; Sheets puts every capital first. The folding is ASCII only (beyond it, code points are compared as they are), so an accented capital is not folded onto its lower case. The spreadsheets use the locale's collation there, at the cost of a collation table in the core, which is not paid here (the comparison names the gap). A date is read by the reader the formulas use (`day.day_of`), so exactly the spellings that count as dates sort as dates, and no second notion of "what is a date" arises.

**Every refused sort says why, and the page words each reason.** One wording for all ("click inside a table's cell") would name the wrong cause when it is a merged cell, sending the reader after a cursor that is not the problem. So, as `Block_style_end` does for applying a style, the core has an enumeration of reasons (`Sort_end`), passed across the bridge as a number and worded on the page.

Caution: **Do not merge the reasons back into one, and do not compare them by number in the core**; a newly added reason would then pass silently (`Sort_end` in [`write/cells.kspls`](../write/cells.kspls), read by `switch`).

### The heading row stays in view while its table passes the window's top

**While a table scrolls past, its first row stays at the top of the window by itself and leaves with the table's last body row, with no command and nothing saved**, as in Numbers.

**The band is a copy, painted from the finished layout onto a small canvas of its own** under the tools (`#pinned-head`, `draw.js`). Nothing on the document's canvas, one long sheet the window scrolls, can stay put. The layout names each outermost table's rectangle and its first row's (`head_band_at` in `lay/ask.kspls`, across the bridge as `kspage_web_head`) and knows nothing of the window; the page knows the window and nothing of rows. Rules and fills come with the copy. The web's sticky heading loses them, because only the cells move while the collapsed grid stays. A click on the band is a click on the heading: the cursor goes into that cell and the window scrolls up to it, as with a frozen cell in a spreadsheet.

**The band leaves with the table**, sliding up as the last row reaches the top rather than covering what is not this table's. A table inside a cell names no band of its own: the outer heading is kept, since two bands at one edge would overlap.

**What is given up**: a heading of more than one row, and a column kept at the left (the page does not scroll sideways); turning it off per table (that would be a setting in the document); and repeating the heading on the next printed page (Word and Excel do; the manual says so).

### A filter is a way of looking: the rows leave the layout and the document stays whole

**A table's rows are narrowed by a condition held with the window, not the document.** The condition (one per column: is, is not, contains, above, below, empty, not empty) lives in `Over.filters` ([`model/over.kspls`](../model/over.kspls), [`model/filter.kspls`](../model/filter.kspls)), beside the text size and whether marks are revealed: the reader's own settings, which never reach the text, the HTML or the record. Nothing is saved, no other window is touched, the undo does not see it, and "Show all rows" is the way back. Other suites use this shape, answering the complaint "my filter hid rows for everyone". Written out as Markdown, a filtered document carries every row.

**Layout asks one question; the document is left alone.** `grid.place_rows` asks `filter.row_shown` for each row. A row left out takes no height but keeps its number, so formulas still point at it and merged cells are fixed up by number. A formula counts every row, as in all four products (`SUBTOTAL` is their opt-in): a total that moved with the filter would show two values on two screens. The heading is always laid out, and so is the row the cursor is in (`Over.kept_row`, set by the page before every layout). A row being typed into must not vanish under the hands (in Numbers' live filtering it can). When the cursor leaves, the row goes if it fails the condition. Tab, Enter and the arrows skip the rows left out, as Excel's skip hidden rows.

**No hiding rows by hand, and no folding groups.** A hand-hidden row is state inside the data, the source of the second family of complaints: pasting into hidden rows, deleting them unseen, a forgotten row travelling with the file. The manual's last chapter names both, and folding groups are a stage in [`PLAN.md`](PLAN.md).

Caution: **Show the count while a condition is on.** A table with rows missing and nothing saying so reads as a table that lost them, so the status bar says "3 of 10 rows shown" for the cursor's table.

### A column is filtered from its own heading, and typing only narrows the list

Every heading cell carries a small arrow. Pressing it opens a panel under that column with sorting, the column's values each with a tick box, a box to search them, the conditions, and the way back. Tick three names and press once, and the table shows those three.

**The arrow is on every heading row, with nothing to switch on first.** Excel shows its arrows only after AutoFilter is switched on. Here the heading is the first row whatever anyone presses ("Tables" above), so a switch would decide nothing.

**Typing in the search box narrows the list shown and never unticks anything.** In Excel and Sheets typing there replaces the choice instead. Looking and choosing are two acts, so they are two controls.

**Sorting and narrowing are one panel.** Held apart, a column could be narrowed in two places with only one of them looked at (Principle 6). The ribbon keeps one button, which opens the same panel at the cursor's column.

**Pressing the arrow puts the cursor in that heading cell.** Everything the panel does (sorting, narrowing, reading the values) asks about the cursor's column. Naming the column a second way would mean two ways to say which column, and then two ways to narrow one.

**The values are listed in the order the column sorts in.** One place decides both orders (`column_values` in [`write/cells.kspls`](../write/cells.kspls) uses the sort's own comparison). Numbers stand as numbers, so 80 comes before 120.

**Values differing only in case are one value.** The narrowing ignores case, so held apart, both would answer to one tick, and the list would promise what the narrowing does not do.

**The list is capped, and says so.** A thousand values is more than anyone reads down; past that, the panel says so where the eye already is.

**With nothing ticked, no rows show**: that is what unticking everything asks for. The way back is the panel's own "Show every row", which removes this column's narrowing and leaves the other columns'. An empty set meaning "all" could not be told from one whose values have all been typed away.

**A narrowed column keeps a line under its arrow.** Excel's funnel says some column is narrowed, never which.

Note: Blank cells are one value in the list, worded and placed last; an empty value carries them, and how a set is spelled is `value_sep` in [`model/filter.kspls`](../model/filter.kspls).

## Formulas in tables

**A cell whose text begins with `=` holds a formula** ([`expr/calc.kspls`](../expr/calc.kspls)). The document keeps only the text typed: the value is shown only at layout (`Inline.show_value`), and goes into neither the saved file nor the undo. Formula and value are never drawn as two texts; drawing them apart would need a second wrapping, cursor and selection for the value alone.

**Only the cell being typed in shows its formula** (`Book.editing`); showing the value there would take the typed text away. Replacing a formula whole is a separate operation (`Editor.set_source`).

**The reckoning moves the cursor**: the text shrinks and can leave the cursor past its end, so `Editor.clamp` fits it back onto a character boundary.

### Formulas use KSPL's expression syntax

**A formula is written in KSPL's own expression syntax. Do not make another language for formulas**: one repository would carry two syntaxes to remember, defeating the aim of writing a design document beside the code.

| To write | The text |
| :-- | :-- |
| A choice | `10 if A1 > 0 else 20` (chains to the right) |
| Folding a range | `A1:A3.sum()` / `.min()` / `.max()` / `.count()` |
| Rounding a value | `A1.round(2)` |
| Making a day | `Day.of(2026, 8, 18)` |
| Taking a day apart | `A1.year()` / `.month()` / `.day()` |

**There is no function-first form (`SUM(range)`)**: folding and taking apart are methods chained after the value, so the reading order is the evaluation order (`A1:A3.sum().round(0)`).

**`Day` is a type's name**, so no table may be named `Day` (`Day.of` would read as its cell). `if` and `else` are keywords, so `ifx` is another word, not `if`.

### A day is a count of days from 1970-01-01, and nothing returns today

**A day is a number**: the count of days since 1970-01-01, so subtracting two gives the days between and adding moves a day forward ([`model/day.kspls`](../model/day.kspls)). Values get no day kind; with one, every step of the reckoning would branch on "number or day".

Caution: **Do not move the origin**: every day in every saved document would shift. The calendar is the Gregorian one extended into the past, ignoring each country's switch-over.

**A text is read and shown as a day only where its style says so** (`Number_spec.dated`; no type is guessed, "What it does not hold" above). On a day the number format does not apply (neither grouping nor per cent is read): with one text formatted two ways, the screen cannot show which acted. A day cannot be written literally inside a formula (`2026-08-18` is a subtraction): write `Day.of(year, month, day)`, and take it apart with `.year()` / `.month()` / `.day()`.

**Nothing returns "today"**: the same document would give a different answer each day, and layout would stop being a pure function, which the tests stand on.

### A table is pointed at by name

A formula points at another table's cell as `the table's name!the place`. **The name belongs to the block, not to the style** (`Block.name`; "Only the block holds its position" above): in HTML terms `style` is a class and `name` an id.

**An unknown name gives `#NAME!`**; falling back to the formula's own table would silently give another cell's value. A table with no name cannot be pointed at.

**Gather every table in the document before solving.** Otherwise a formula pointing at a table not yet gathered is an "unknown name", and the answer depends on the order of writing. The gathered tables live through one whole reckoning, which remembers how far each cell is solved. A cycle across tables is found only because both are gathered at once.

A range can point into another table too (`detail!A1:B2.sum()`); **the name covers the whole range**, so its two ends cannot name different tables.

**The block a name goes on is chosen from the innermost outwards** ([`write/block.kspls`](../write/block.kspls)'s `named_at`).

| Where the cursor stands | What the name goes on | What points at it |
| :-- | :-- | :-- |
| Inside a table's cell | **the enclosing table** | a formula (`detail!C4`) |
| Inside a slide's frame, outside a table | the frame | a joining line |
| Anywhere else | the paragraph | whatever in the body calls it |

**Do not put it on the cell itself**: nothing reads a cell's name, so it would be pointed at from nowhere while the screen says it was set. A cell is pointed at by its place (the `C4` of `detail!C4`).

**Look for the table before the frame.** In a table on a slide, taking the frame first would leave no way to name the table for a formula: the frame can still be named from outside the table, but the table only from inside it.

**A name is set only after layout**, since only then is it known whether the cursor is in a cell ([`lay/ask.kspls`](../lay/ask.kspls)'s `cell_of`). Called before layout, the entry point refuses ([`port/web/face.kspls`](../port/web/face.kspls)).

Caution: **Do not fall back silently to the paragraph.** That is the same mistake as putting the table's name on the cell.

**A name is recognised by the `!` after it**; where none follows, the reader puts back what it read (as with a range's `:`). Only the formula's separators are barred from a name, so a name can be Japanese prose as it is.

### The dependencies are followed while it is solved

**No dependency graph is built first: references are followed down while a formula is solved**, with three states per cell (not yet, being solved, solved):

* **A solved cell is remembered**, or it would be solved again at every branch that refers to it.
* **Reaching a cell that is being solved is a cycle**; without this the descent would never come back.

So cells are solved **in dependency order, not in the order written**, and an earlier row may refer to a later one.

### The methods that fold a range

**`A1:A3` is not a value**: it cannot be added or multiplied. Only a range with a folding method chained on is one (`A1:A3.sum()`); `A1:A3` alone is `#SYNTAX!`.

**A folding method takes no argument**: an argument list would let what a formula already says be said again inside a function, giving two ways for one thing.

**A place is a range only if a `:` follows it**; otherwise the reader puts back what it read, or the `A1` of `A1+2` would be taken for a range's end.

**A cell in the range that is not a number is skipped**: a range means "the numbers around here" without naming each, and empty cells and heading words get mixed in. An operator differs: `=A1+A2` names two cells, so a non-number there is an error. An error mark inside the range is carried through; skipped, it would let a total look right while a cell inside it is `#CYCLE!`.

**With no number in the range**, the total and the count are 0, but there is no least or greatest value (`#VALUE!`).

**No function is added that the others can already write** ("What it does not hold" above): the mean is `r.sum() / r.count()`, and the absolute value `-A1 if A1 < 0 else A1`.

### A comparison is made once, and the answer is 1 or 0

There are six comparisons (`=` / `<>` / `<` / `<=` / `>` / `>=`), read after addition and subtraction. **The answer is 1 or 0 so that existing operators can combine answers**: multiplying gives "and"; adding and testing for greater than 0 gives "or".

**Comparisons do not chain**: `A1<B1<C1` would compare the first answer, 1 or 0, with `C1`, which is not what it reads as, so it is refused as text left unread.

**Only numbers can be compared.** A value is only ever a number or an error, so a text cell is "not a number" (`"yes" == A1` cannot be written).

### The conditional expression evaluates both arms

**Both arms are solved, then one is chosen**, and the error on the arm not chosen is discarded: `0 if A1 == 0 else 1/A1` is 0 even where A1 is 0. Solving only the chosen arm would make the same formula touch different cells from one reckoning to the next, and change which cycles are found.

### Displayed decimal places and rounding the value are separate

`round` rounds the value, so formulas pointing at it see the rounded one. **The number format's places (`Number_spec.places`) round only the text shown**, so formulas pointing at the cell keep the full value.

Caution: **Do not merge the two.** If the number format changed the value, merely changing the places shown would move a total.

**Round at the last place when writing a number out**: truncating shows F64's 1.23 (stored a little under) as "1.229999". The larger the number, the fewer decimal places can be written: rounding multiplies by 10 to the power of the places and converts to an integer, so past the range of I64 the result is nonsense.

### Conditional styles are resolved at layout

**A conditional style is a rule the style holds** (`Style.when`): "where the value is greater than this number, lay the style of this name over it". What is laid over is a name; a colour or a weight held directly would also break the mapping into HTML, where a name becomes a class as it is.

**Only the look is laid over** (font, colour, fill, border). Spacing, indent and alignment stay as the plain style has them, since a row whose height moved with the value would lose the reader's place. The fill and the border are laid over field by field (`panel_paint.paint_of`); laid over whole, the condition's style would drop the plain fill or border on exactly the cells that met it.

**Nothing is written into the document** ("What layout recomputes every time" above), and nothing reaches exported HTML, where a class is fixed by name and cannot follow the value.

### Changing a formula replaces its source text whole

The cell shows the value, so typing onto it cannot change the formula. Instead **`Inline.text` (the formula if there is one, otherwise the text shown) is offered, and `Editor.set_source` replaces it whole**.

Caution: **The replacement goes through the undo record too**; written directly, it would leave a hole that cannot be undone. A break is recorded before and after it, so one undo takes it back.

### A formula that cannot be evaluated shows an error mark

`#SYNTAX!` (not readable as a formula), `#REF!` (no cell where it points), `#VALUE!` (what it points at is not a number), `#CYCLE!` (it comes back round to itself), `#NAME!` (an unknown function's name). **They stay distinct because each is fixed differently.**

**Do not overwrite a mark already raised with the mark for text left unread**: the unread text lies past where the first mark arose, and the first reason is closer to the fix. A formula read only part way is not accepted either; discarding the unread rest and answering would let a typing slip pass silently.

**Division by 0 gives no number either**: an infinity or a NaN turned into text would leave an unreadable value in the cell.

**A formula can point only at a cell**, not at text outside a table cell. A table inside a cell is a table in its own right, and can be pointed at if it has a name.

### A formula can be written in the body as well

A text beginning with `=` is a formula outside a table cell too. **The body has no table of its own**, so it points at cells by name; a bare `A1` names no table and is `#REF!`.

Caution: **Solve the body after the tables.** Solved first, a body formula would read values not yet computed.

**Only a cell's first inline is solved as the cell**: a table's or a row's own text, and a cell's second run onwards, count as body and must point by name.

### Once a row or a column is moved the formulas are rewritten

**A place is absolute**: `A2` keeps pointing at the same cell when a row is added, and what changes is its number. So adding or deleting a row or a column rewrites every formula in the document ([`expr/shift.kspls`](../expr/shift.kspls)'s `plan_shift`), because a named table can be pointed at from another table or from the body. A reference with no name belongs to its formula's own table, so an `A2` inside another table does not move.

Caution: **A formula pointing at the deleted row itself becomes `#REF!`**; closing up the numbers would silently point it at the neighbouring cell. So `#REF!` is also text a formula may contain, or a rewritten formula could not be read.

**A range shrinks by the part of its end that was deleted**: turning the end into `#REF!` would make the whole range unreadable and lose the total of the cells still there. Only when the near end passes the far end is the whole range `#REF!`.

**Record the rewrite in the same step as the row or column change**; as two steps, one undo would bring back the row and leave the formulas behind. The place of editing applies it, since a rewrite on the reckoning's side would miss the undo record.

### `$` acts only when copying

The `$` in `$A$1` is easily read as "a reference that never moves", but it holds still **only when copied**.

**When a row or a column is added or deleted, the reference moves, `$` or not**: the cell itself moves, so a reference left in place would point at another cell. (The mark says what copying does, not which cell is meant.) So one module reads and writes references (`kspage/addr`), and only the two ways of moving them differ (`kspage/shift`).

Caution: **Do not split the reading of the text in two**, or the same formula would be read differently depending on the reader.

**Copying moves references to any table.** A reference with a table name (`detail!A1`) keeps pointing at that table, and only its position shifts. Adding and deleting rows or columns moves only references to the table that changed.

### Where the formula's field opens

**The formula field shows the text typed and replaces it whole.** Making a formula does not need it (typing `=` first does); changing one does, because the text shown is the value.

**It opens on a table's cell and on a run that already holds a formula, not on the bare body**, where replacing whole would let one press delete a paragraph. Do not narrow it to cells alone either: a formula in the body could then be made but never changed. The same set the reckoning rewrites decides whether it opens, so the two never disagree.

## Slides and frames

A slide is a block laid out at absolute coordinates, and a frame is a child with a position of its own. These sections say how frames are placed, picked, drawn and shown.

### Showing frames in turn is an order, not a timeline

The frames on one slide can appear one at a time. **The document holds only the step at which each frame appears** (`Block.step`). Step 0 is always shown; step 1 or more appears once the show reaches that step. There is no time axis ("What it does not hold" above), only an order, which flattens by itself: with no narrowing every frame shows, so printing and the HTML need nothing.

**The block holds the step, not the style** ("Only the block holds its position" above).

The narrowing is a viewer setting (`Style.Over.reveal`) and is not saved. `none` narrows nothing; `some(n)` lays out only the frames whose `step` is n or less. **Clear it when the show ends.** Otherwise frames with a step stay hidden while editing, and look deleted.

**Layout does the narrowing** ([`lay/absolute.kspls`](../lay/absolute.kspls)'s `shown`). A frame hidden only when drawing could still have its text selected and found by search.

**One action advances the show** (`port/web/api_show.js`'s `stepAhead`). It goes to the next step if one is left, else to the next slide; with two actions, the presenter must remember which to press.

**Reordering means moving blocks in the document**: the order of the slides is a result of layout, so only the document holds it.

Caution: **Move only the outermost block** (a slide inside a frame cannot be moved).

### Showing one slide at a time crops and magnifies it

To show a slide filling the window, the core holds **only the list of laid-out slides** (`Page.surfaces`), in document order. The style decides which block is a slide, so the document cannot tell; only layout knows, so layout records it. The rest is the screen's work: scaling to the window, centring and the key bindings.

**Clip what lies outside the slide**, or the paragraphs around it would seem to flow into it.

**Do not change the layout width during the show.** A slide's style size fixes its content, but the flow around it would rewrap and the slide would move.

**Shut off typing during the show**, or an edit could change what the presenter did not mean to touch. Shutting off the one place text enters is enough: keys, a committed composition and a paste all enter there.

### A slide's sketch is not kept

A new slide's frames come from **a sketch** (`Sketch`). It lays out at least one frame, since a child with no frame covers the slide but cannot be grabbed. It acts once, at insertion.

Caution: **Keep it in neither the document nor the styles.** Kept, the first move of a frame makes "the frames the sketch describes" disagree with "the frames the document holds", and nothing decides which is the source. Only the frames it built go into the document; the sketch is saved neither as a number nor as a name.

**A sketch sets the frames only, and applies no style name.** A separate operation applies styles, and a name set here would be a second way to do it (as with the unnamed rows and cells of an inserted table). Every frame takes the parent's style; a larger title means applying a style.

**Write the open margin and the title's height as ratios of the slide's size.** In fixed px, the frames would stick out as soon as the slide's size changed.

### A frame is grabbed at its handles

A frame is dragged the way a border is ([`lay/ask.kspls`](../lay/ask.kspls)'s `grip_at` and [`write/shape.kspls`](../write/shape.kspls)'s `drag_frame`). Where to grab it, and what each spot does, is in "Handles on frames and shapes, and the numeric fields" below.

**Check for a grab before text selection**, as for a cell's border ("A border is grabbed at a cell's right and bottom edges" above).

**A frame with no set position cannot be grabbed.** It covers the whole slide, so there is nowhere to move it.

Do not remember the coordinate where the grab began. The slide sits in the flow and moves at every layout, so the frame's offset from it is recomputed at every drawing.

### One frame is selected at a time

**A click selects one frame, and selecting another deselects the first.** There is no selecting several with Shift.

**Shift means one thing: it extends the text selection.** With several frames selectable, a Shift-click would mean two things, depending on what lay under the pointer.

**So there is no grouping, aligning or spacing several shapes evenly.** Built on shapes picked one at a time, grouping would carry its whole cost without the drag box and the Shift-click that make it easy elsewhere.

### Deleting a frame and deleting its holder are separate

**Do not delete "from the inside out" in one operation.** A press meant to delete the slide would delete one frame and stop. A mistaken deletion is hard to undo, so what gets deleted must be clear beforehand. Deleting a frame and deleting its holder are separate operations (`Editor.drop_frame` / `Editor.drop_holder`).

**The last frame is not deleted.** A slide with no frame emits no box for the cursor, so no shape could be added nor the holder deleted, and the slide could never be removed.

**The frame deleted is the one directly under the slide**, even from a table inside a frame. Inside a slide only frames hold a place, so deleting anything further in would not change the slide's frames. Deleting the table itself is deleting a holder.

### A line that joins two frames is drawn by the gathered figure, not by a person

**There is no control for drawing a line between two named frames.** The drawing code remains, and its one user is the gathered figure. Joining frames by typing their names would carry the whole cost of the feature without what makes it easy to use: a connector that snaps to a shape and follows it, as in PowerPoint. So it is left out rather than half-built.

**What remains is load-bearing.** A block carries the two names it joins (`tie_from` / `tie_to` in [`model/doc.kspls`](../model/doc.kspls)). Layout draws the band between them, following either when it moves. The figure of what a source file uses builds its boxes and lines this way (`pulled` in [`lay/gather.kspls`](../lay/gather.kspls)), with the names given as numbers. A saved document with such a line still draws it, since the saved format and the Markdown fence carry the names. Dropping the reader would silently lose a line somebody drew.

### How a shape is drawn

**Hold the tool, then drag to draw.** The cursor is not consulted: the shape goes into the slide under the press, since by the cursor a drag made while looking at another slide would land in the wrong one. While dragging, a dashed outline shows the form, since a bare rectangle would hide whether an ellipse or a triangle was chosen. Once a shape is drawn the tool drops, or shapes would appear where the body was meant to be pressed. Pressing the tool again keeps it held; `Esc` drops it. Click-to-insert-in-the-middle stays in the menu, for where there is nowhere to drag.

**The holder of the spot pressed holds the shape**: a slide, a paragraph or a cell. The frame's position counts from that holder's top left, a slide's frame rule widened to every holder. There is no second means: nothing "anchors to the page". It is not placed in the flow, where it would move the text, and there is no text wrapping (which Word recomputes at every move). A shape does not go into a block that lays out no children. A grid's children are its rows and cells, and a gathering block's are not laid out, so a shape there would appear nowhere; a shape drawn over a table belongs to the cell. Shapes are placed after the contents, so they show on top of the text, stacked in the document's order.

The forms are few, and **adding one never renumbers the others**. PowerPoint holds 160 kinds, so the one needed has to be found (hence its recently used forms at the top). kspage holds the rectangle, the rounded rectangle, the ellipse, the triangle, the diamond, the line and the arrow (along a diagonal). Saving uses the name, and the boundary passes a number (the variant's name of `Shape` in [`model/style.kspls`](../model/style.kspls)). So a new form goes at the end only; renumbering would make an old text read as another form.

### How a form is chosen

**The forms are folded into one ribbon button that opens their list**, headed by the recently used forms to pay back the press the folding costs. Laid out flat, the forms would use up the level's width. The folded button shows that a tool is held; marking only the chosen form, hidden in the closed list, would not. Choosing a form closes the list, which would otherwise cover the slide about to be dragged on.

### Handles on frames and shapes, and the numeric fields

**Eight handles.** The four corners change both dimensions, the four edge midpoints change one, and the rest of the edge moves the frame.

Caution: **Do not leave out the edge handles.** With only corners, changing the width means matching the height again by eye (every other product has eight).

**A handle that is not drawn is not made**, or spots that do nothing when pressed would multiply. Inside a frame with contents cannot be grabbed, or its text could not be selected; inside a shape (no contents) can, since nothing else happens there. On a small frame a corner handle and an edge handle overlap, each keeping a grabbable width, and the corner wins.

**The pointer's shape follows the direction**: diagonal, horizontal, vertical or move. An edge gets no diagonal arrow, which would suggest that grabbing there changes both dimensions.

**`Shift` keeps the ratio of the sides, at a corner only**; on an edge handle it would move the side not grabbed too. While drawing, `Shift` gives 1:1: a shape not yet drawn has no ratio to keep, so it makes a square or a true circle. Compute the drag rectangle in one place (`bandRect` in `port/web/draw.js`). Computed twice, for the preview and the placed shape, the shape would jump on release.

**The numeric fields act on the selected shape.** A shape has no text, so it cannot hold the cursor. One way to select it is kept: pressing selects the frame under the press (`Editor.picks`). `Alt`+arrow uses the same entry point, not a second way.

### The stacking order of a slide's contents

**The list runs down the right side**, not in the fixed area at the top, where every slide would push the body further down. The top is in front (Figma's way). The stacking order is the document's order; a separate field would state it twice.

An unnamed shape is listed under a name like "Shape 3". **The page makes this name, not the core**; a name made by the core would look stored in the document.

## Pages and printing

The paper is one setting for the whole document, and layout splits the content into pages. These sections say how the pages are made and printed.

### Pagination happens during layout

The document holds one page's height (`Paper.height`; 0 means no pagination). **The width is not held here.** The paper's width is the container's, as with a slide's size: across, the container has a size; down the page it has none.

Caution: **Do not shift content onto pages after layout.** The cells, slides and frames would have to move with the boxes, and any one forgotten would silently stay out of place. Paginated during layout, whatever comes next starts from the new `y`.

The unit of splitting is set by where a finer split would make the text unreadable:

* **Never split inside a line.** The characters' top and bottom halves would land on different pages.
* **Never split inside a table row.** Only layout knows its height, so a row found crossing the break is rewound and laid out again.
* **A slide is not split.** Its size is known first, so where it does not fit, it moves whole.

**Move a block that fits on one page to the next page whole.** A paragraph split with a single line left behind is hard to follow. Only layout knows its height, so the block is laid out and measured, then rewound and laid out again where it must move. Without pagination (on screen), one pass is enough.

**Do not move a block that does not fit on one page.** It would not fit on the next either, and moving it only wastes the rest of this one. It is split at line boundaries instead, since an overflow in sight is easier to fix than content that disappears.

**The page count comes from the height where the content ends** (`lay/flow.kspls`'s `paper_count` and `Page.filled`).

**Do not count by the height used**, which includes the space after the last block (`space_after`). A document filling exactly one page would count as two, and a blank last page with no box at all would print. Only the last block's space is excluded; space between blocks is content.

**Do not put the counting in the bridge**, where `make debug` does not reach it (the check is `tests/print_test.kspls`'s "the count of sheets of a document that fits exactly").

**Printing draws one canvas per page** (one long canvas cannot cross pages), clipping and scaling with the one-slide view's code.

### The document holds the paper size, and margins apply when printing

The page size and the margins are whole-document settings (`Sheet.paper`).

Caution: **Do not put them in a style.** With two page shapes in one document, neither the page breaks nor a column's width could be decided.

**A width of 0 means the container's width.** Until a paper width is set, the text follows the window; once it is set, the column keeps that width at any window width.

**Compute a column's width in one place, in the styles' table** (`Sheet.column_width`). If callers repeated the expression, the widths laid out and printed would drift apart.

**Do not build the margins into the layout coordinates.** Laid-out content is one continuous band, and the margins are how far print insets it; built in, every page break would need arithmetic to skip them. So the top and bottom margins do not appear on screen; they show as the spacing at the page breaks.

**The height available for content on one page is also computed in one place** (`Sheet.column_height`). Only there are the margins subtracted from the page height; the break interval, the break line and the page count follow from it.

**Where the margins alone fill the page, it does not paginate.** Moved, the content would not fit on the next page either, and stopping is plainer than looping forever.

### Headers and footers have no place in the document's coordinates

The header and footer are whole-document settings (`Doc.header` / `Doc.footer`).

**Do not put them in `blocks`.** A band appears once per page, so it has no place in one continuous run of coordinates. It is laid out separately (`flow.layout_chrome`), and its coordinates are relative to the page's top-left corner. Printing clips and insets the content by the margins, and draws the band as it is.

**With no paper size and no top and bottom margins, the band is not laid out.** It sits inside the margin, and with no fixed bottom edge the footer has nowhere to go. Nor is an empty band laid out, which would make the margin look narrower.

The page number is counted at layout ("What layout recomputes every time" above): `{page}` is the current page and `{pages}` the total. **The document's text keeps the placeholder.** With the number written in, merely changing the paper size would change the document's text.

**A band cannot be reached by a path.** Paths count positions by index in `blocks`, so none points at a band, and search does not go through it. It can still be undone, since its text changes through the same `Editor` as typing.

### The printing fits the page into the printable region

**Do not count on `@page { margin: 0 }`.** Margins chosen in the print dialog win. A canvas drawn at the paper's width is then wider than the printable region, and its right side is cut off, so only the left margin shows. `max-width: 100%` shrinks the page to fit and keeps both margins equal. Do not fix it by shifting the page's inner margins left: left and right are equal (57px each on A4), so shifting them makes it wrong.

### A document with no paper size borrows one only for printing

**A height of 0 means "one continuous run on the screen", not "no pages in print either".** A plain-text document (a program's source), Markdown and a new document all set no paper. Printed unchanged, they become one long canvas, and the browser breaks the pages where it likes.

**The size and the margins are borrowed together** (`paintPages` in `port/web/api_show.js`). Borrowing the size alone gives margins of 0. The header and footer bands stand inside the margin, so they have nowhere to go (`chrome_rect` in `lay/chrome.kspls` returns a height of 0), and the body runs up to the break, where characters look cut. Borrowed together, a 15mm (57px) band opens above and below.

What is borrowed is the default paper of the bundled documents (`a4_portrait` in `model/paper.kspls`: A4 portrait, 15mm margins on all four sides). **Do not copy the numbers into the code that borrows them.** One-inch margins there would drift from the 15mm of the bundled documents (the manual). Two documents printed from one screen would then get different margins, the source of the complaint "the margins are too wide". Do not make it one inch either: Word's, Google Docs' and Pages' defaults are one inch, but kspage's is 15mm. A line that does not wrap runs into the right margin (`wrap` in `share/text.kspls`); to narrow it, set the paper and margin fields.

**Do not borrow for a document that has set its paper**, since margins of 0 were the writer's choice. Once printed, the borrowed paper is returned (the same rule as the viewer's overrides). The check is `kspage/tests/browser/paper.js`'s "A document with no paper settled becomes a page with margins in printing too.", which checks that the bands above and below hold no ink and that a band appears inside the borrowed margin.

## Saving and loading the document

The saved text is JSON ([`share/store.kspls`](../share/store.kspls)). **The document and its styles are saved together.** Saved apart, one could travel without the other, and the look would drift.

**An unset field is not written.** A style's font fields can be unset (inherited from the parent), so writing the default in would break the inheritance there. The reader leaves an absent field alone too. Only `Sheet.add` fills in defaults; with two places, one could change alone.

**A text of a different version is not read even in part.** Writing back a document that kept only what could be read would lose the original.

### A name the core looks up belongs to the format version

**The saved text holds names the core looks up**: style names, and the header and footer marks `{page}` / `{pages}`.

Caution: **Changing a name the core looks up raises the version in [`share/store.kspls`](../share/store.kspls).** Without the raise, an old file's mark is not read as a mark and is printed as written. Those names are the two marks (`page_mark` in [`lay/chrome.kspls`](../lay/chrome.kspls)) and the header and footer styles (`header` / `footer` in [`model/doc.kspls`](../model/doc.kspls)). One raise covers the whole vocabulary, not one per name.

**Any other style may be renamed without raising it.** A style is saved with its definition, so an old file opens with its own, and nothing looked up goes missing.

### An earlier name is not read

**The field that names the version is `kspage`, the product's own name, and no earlier name is read.** So renaming the product makes every document saved before it unreadable, although the rename changes not one byte of the format.

**That price is accepted rather than paid with a reader per name.** A reader for an old name never retires: it must be carried, tested and explained as long as the format lives. What is written and what is read are one name. The version check is not relaxed: a document under that name with a different number is still refused ("A text of a different version is not read even in part" above). The guard is [`tests/store_test.kspls`](../tests/store_test.kspls)'s `test_only_the_one_name_opens`.

### Reading back swaps the document whole

**Rebuild the cursor and the undo record too.** Both point at `Inline`s, which dangle once the document is swapped. Discard the layout too: its boxes point at `Inline`s that are gone.

**Parse the text into the same arena as the document.** A style's name is referenced, not copied, so parsed into another arena it dangles once that arena is freed.

### Saving and loading are separate from exporting

**Export to HTML and Markdown cannot be read back.** In HTML a style shrinks to its name, and in Markdown even the name is lost. Both are for showing the document and for keeping it beside the code. Only this JSON reads back, and neither is used in place of the other.

### Reading and writing CSV share one quoting rule

**Reading and writing CSV share one set of quoting rules** ([`write/csv.kspls`](../write/csv.kspls)). With two, kspage could write a file it cannot read back.

**Export writes the text shown, not the formula.** CSV carries values, and the receiver cannot solve a formula. Imported text goes into the cell as it is, so a text beginning with `=` becomes a formula, as if typed. Rows are padded to the longest row; otherwise the cell count would vary from row to row and the columns would be undefined.

## Block identity for showing a difference

To show the difference between two texts, kspage must first decide **which block matches which**. Blocks cannot be matched by path (`Path`): adding one paragraph at the top shifts every path after it, so a single edit would show as "everything changed". So `Block` holds a number that never changes (`Block.id`), and `Doc` a mark of where the numbers were issued (`Doc.origin`). One place issues them: [`model/ident.kspls`](../model/ident.kspls).

### A block number is never changed or reused

**The heading is the whole rule**, guarded by [`tests/ident_test.kspls`](../tests/ident_test.kspls):

* **Never renumbered.** Saving, reading back or laying out again leaves the number as it is.
* **Never reused** (`Doc.next_id` never goes down). A deleted block still stands in the other text, so a reused number would match a different block as "the same".
* **A number read in only raises the counter.** A block taken from another text keeps its number, so the next one is made larger than any seen; otherwise this text could give that number to a different block.

**The value lies not in having a number but in its never changing.** OOXML's paragraph carries one (`w14:paraId`), but Word is reported to reissue it on every save, so no comparer can rely on it.

### Block numbers are given only when the document is saved

Caution: **Do not number a block when it is made.** A page's header and footer make and discard blocks at every layout ([`lay/chrome.kspls`](../lay/chrome.kspls)), so numbering at creation would raise the counter at every redraw. `doc.new_block` sets 0 (no number), and `store.save` numbers the unnumbered blocks on entry.

**An old text without numbers can still be read.** Its `Doc.origin` is empty, and with an empty origin the numbers are not trusted, so blocks are matched by content. A number makes matching fast and sure where it exists, but matching does not depend on it.

### The origin mark is made outside the core

**The core holds no clock and no randomness**, so the mark is passed in from outside (`kspage_web_set_origin`), as the change history's "when and who" is:

* **A mark once set cannot be overwritten**; otherwise the document would claim to be another at every opening.
* **A copied document keeps the same mark**, so a copy and its original can be matched.

Caution: **Do not match two texts with different marks by number.** Their numbers were issued separately, so the same number means different blocks.

### Matching runs in three steps, and a later step leaves an earlier step's pairs alone

[`share/compare.kspls`](../share/compare.kspls) computes the difference.

Caution: **Do not keep a separate matching per view.** Prose, shapes and look are views of one result; solved separately, one edit would show a different count of changes in each.

1. **By number** (`Block.id`), where the two texts carry the same origin mark. This match is authoritative.
2. **By anchor**: of the blocks left, those whose text occurs exactly once in each text are paired.
3. **By place**: the blocks left between anchors are paired in order, where depth and style agree.

**The order is where this differs from the others.** Word's comparison cannot recognise a large move and reports a deletion and an insertion. git's `--color-moved` infers moves by matching text, so it needs at least 20 characters, since short lines match by chance. Both judge "the same" by the text alone; here the number makes a move a fact, not an inference.

**Moves are inferred only where there is no number, and only for anchors.** Blocks paired by place are never reported as moved, which avoids the chance matches of short lines.

### A block counts as moved only where the order changed

**Do not report a shift of position as a move.** Adding one block shifts every block after it, so comparing positions would turn one edit into "everything after this moved". What counts is order: only a pair outside the longest run of pairs that kept their order has moved. So has a pair whose parents do not correspond; a block put into a table has gone somewhere else even if its order was kept.

### The comparison works on the saved text

Caution: **Do not compare field by field.** A field added to `Block` or `Inline` and forgotten in the comparison shows only as "changing that field does not show in the difference". Comparing the very text that [`share/store.kspls`](../share/store.kspls) writes means a field the comparer does not know enters the difference by itself (as `same_style` there does for a style applied again).

There are seven kinds of difference: added, deleted, moved, text changed, a setting changed, a frame changed, and a whole-document setting changed.

* **One block can yield two or more** (one that moved and whose text changed).
* Caution: **Do not merge them into one.** Narrowing by view would then lose that view's change.
* **The style table is matched by name.** Its row order does not correspond between two texts, so a different row order is no difference.
* **The viewer's overrides (`Over`) are not part of the difference**, since they are never saved.

### A merge only takes a section that exists on one side alone

Showing the difference needs only the number. **Merging is built on it, within limits the number rule itself sets** ([`write/merge.kspls`](../write/merge.kspls)).

**Only a block present in the other text alone can be taken.** A block whose number already stands in this document is in both texts with no common ancestor. Nothing tells which is newer, so taking it would silently lose either their change or ours.

* **Only between texts matched by number** (the same origin mark). Taken from a pair matched by text, a block could land in the wrong place.
* **Its position is decided by number too**: after the preceding sibling in the other text if that number stands in this document, otherwise at the head of the parent. A path would shift with one insertion in between.
* **Not when the parent is absent from this document.** That would take the parent as well, which is not "taking one block".
* **Copy it, then add it.** The other text's block lives in its own arena, so it is copied through the saved text (there is one way to copy a tree).
* **Record it in the undo**, so one undo takes it back.

**Nothing is merged automatically**; a person takes blocks one press at a time. git's three-way merge needs a common ancestor. Word's comparison writes the difference into a third document to accept piece by piece. In both, "accept all" takes every difference unseen, so kspage offers no "take all".

A taken block keeps its number, so it drops out of the next comparison. **That is the number's worth**: matched by text, the block would still show as "added".

## The mapping into HTML

[`share/html.kspls`](../share/html.kspls) writes it, by three rules:

* **A block becomes an element**: `div`, or for a style with `Arrange.grid` a `table`, with `tr` for its children and `td` for its grandchildren. A table's own text goes into `caption`. Text cannot stand directly inside a `table`, and a `caption` comes before the rows, where the core also flows that text.
* **A style's name becomes the `class`.** This is why styles are referred to by name ("Why the styles are not made HTML/CSS themselves" above).
* **The style table becomes CSS rules.** There is none for the table element (CSS's default table fits columns to their contents, capped at the container's width), and none for an unset field: CSS font properties inherit from the parent too, so leaving one out already means "as the parent has it". Spacing before and after a paragraph and the indent (`margin`) inherit in neither.

Caution: **Escape the name as a CSS identifier.** Unescaped, a `.` inside it reads as the start of another selector. A leading digit is escaped too, since an identifier cannot begin with one.

**Whitespace inside a name is folded to a hyphen, the same way in the rule and in the tag.** Escaping cannot handle whitespace: `class` splits on it, so `class="page break"` is two classes, while the escaped rule `.page\ break` expects one class of that whole text. Escaped only in the rule, the paragraph loses its look, silently, and only in exported HTML. The fold is [`model/style.kspls`](../model/style.kspls)'s `class_byte`, used by both [`share/html.kspls`](../share/html.kspls)'s `css_ident` and its `class_attr`. It covers HTML's five whitespace bytes (space, tab, line feed, form feed, carriage return); folding only the space would still split a name holding a tab.

Folding instead of escaping would make two names that differ only in whitespace one class. So **the entry point where a person names a style refuses such a name** ([`write/shape.kspls`](../write/shape.kspls)'s `add_style`; the reason reaches the screen as its own code in [`port/web/face_edit.kspls`](../port/web/face_edit.kspls)). Names and classes stay one to one, and exported HTML carries the person's own names.

Note: Every name kspage writes itself already has that shape, so only names nothing in the product needs are refused. `make test-conventions` checks the names the product writes.

**Do not push the refusal down into the model or the reader.** [`model/style.kspls`](../model/style.kspls)'s `Sheet.add` takes whatever name a text holds; the reader refuses and changes no text ("The Markdown reader accepts any text" below). Inserting a table, a chart or a code block derives its style name from one already in the table, so a refusal down there would make a document read in silently refuse every insertion. A name from a text goes in as it is and comes out folded.

**The other products' two approaches cannot be borrowed, because they store a reference where kspage stores a name.** No machine name stands beside the one a person sees (Word's `MsoNormal`). Here the name is the identity ("A style is looked up by name once" above) and the saved file points at it, so a second name is a second identity (Principle 6). No slug is made on export, which reaches the same collision another way. What remains, at the cost of one hyphen, is refusing the name where it is typed, which a product storing a reference cannot do.

**The line-spacing multiple cannot be written as it is.** kspage applies it to one line's height, not to the font size ("Alignment and leading are per paragraph, and take effect when the line is closed" above). The exported HTML alone would pack its lines tight. A line's height divided by the font size is constant per typeface, since both scale with the em, so the multiplied number gives the screen's height. So the exporter needs an entry point for measuring the typeface (`html.write` takes a `Font_source`).

**The layout may still differ.** Line breaking and whitespace collapsing follow the browser's rules, not the core's; the canvas is where the same layout is seen.

**A frame's position (`frame`) is not written.** Rebuilt in CSS, a slide would leave it unknowable whether the core's layout or the browser's is the source, so a frame's block exports only its flowing contents.

**One `<a>` wraps each stretch of consecutive runs with the same destination, not each run.** A run splits wherever the formatting changes, so a link with a bold word in the middle would become three `<a>`s.

Caution: **The screen cannot show this, since all three lead to the same place.** Yet a screen reader announces "three links", and selecting and copying break part way.

The Markdown export follows the same rule ("The parting is in two stages" in "What a Markdown round trip drops" below). **Only runs inside a link are grouped**: grouping runs with no link too would detach a note's mark from its run.

## The wording on the screen

**Text on the screen uses the wording the other products share.** A name is what people search by, so a feature called something else looks as if it is missing.

**Do not stop at "make it the same".** Established or not, a name that does not say what is inside is not taken. Mailings is one example: the feature brings in an outside list to make one document per person.

**Two tests, in this order.** ① Does the wording reach the person reading? ② Does it say what is inside? A wording that passes both is taken; where none does, the one that says what is inside is taken.

### The established term stays the term

**Do not coin a plain word of our own for a term other tools already share**; no product does. Call a server "the answering side" or a cursor "an insertion bar", and the reader cannot tell it is the same thing.

**Nor is a word right merely for being the industry's.** The US Federal Plain Language Guidelines ask for the common word over jargon the reader does not share.

**The first test is whether the word reaches the person reading**, not "borrowed, so bad" or "plain, so good". An established word reaches them as it is; an unestablished one does not, whether borrowed, coined or plain.

The complaints come from both directions at once, and this test answers both.

### The register follows where the text appears

**Do not mix registers on one screen.** The register follows where the text appears, and the four products agree on this.

| Where it appears | The register | Example |
| :-- | :-- | :-- |
| A tab's or a menu's name | **a noun, sentence case** | File / Insert / Table / Review |
| A button's name | **the imperative** | Save / Undo / Delete the row |
| A field's name | **a noun phrase, sentence case** | Paper size / Line spacing / The body's width |
| A report of what happened | **a full sentence** | Saved it / Wrote it out as CSV |
| A refusal | **a full sentence giving the next step** | There is nowhere to add a comment. Click on some text |
| The manual's body | **sentence case, second person, present tense** | Choose the kind and type the text |
| The manual's heading | **sentence case, in the grammar "How the built-in manual is written" gives** | Paper and printing / Adding a footnote |

**Sentence case, tab names included.**

Caution: **Do not put Title Case on a tab.** Microsoft and Google put Title Case at the top level and sentence case everywhere below. That is history, not a decision: their menus predate their own companies' guidance. With no such menus to carry, kspage takes the guidance whole.

**Do not end a name with a full stop.** A tab, a button and a field are names, while a report of what happened is a sentence; a full stop on a name would blur the two.

### The vocabulary is one

**Do not use different words on the screen, in the code and in the comments.** With two vocabularies, the day someone forgets to update the mapping between them, the screen and the code seem to mean different things. So the wordings turned away appear nowhere in this package: not in the source, a comment, a document or a gate. Identifiers are no exception: whoever comes next reads them, so the same `face_words` catches them.

**Do not copy the list here.** Its canonical source is [`tests/support/conventions_prose.kspls`](../../tests/support/conventions_prose.kspls)'s `face_words`; a copy would pass with only one of the two updated the day a word is added. The check is `make test-conventions`; without it, a changed wording comes back with the next screen added. Do not refuse a different word that merely contains the same letters: `face_keep` masks those before the search.

**Where one word covers two things, split it.** "The place" is `arena` for where memory is taken from and `memory` for the amount usable. "The spelling" is `text` for the content and `path` for the location. Choosing one meaning without splitting leaves the other unreadable.

**Names used only inside the manual belong to the vocabulary too.** `screen-bar` and `screen-area`, which draw a picture of the screen, sit in one list with the `slide-frame` the reader presses.

**The words the reader meets are those the other products use**, on the screen, in the manual and in the style names alike (the reader sees style names in the paragraph list):

| What it names | The word | Where it comes from |
| :-- | :-- | :-- |
| a slide, and a deck of them | Slide | PowerPoint, Impress and Google Slides call it this |
| a table's cell | Cell | Excel, Calc and Sheets call it this |
| a menu | Menu | the standard UI term |
| the band at the top / the band at the bottom | Menu bar / Status bar | the same |
| the list on the right | Navigation | Word's "Navigation pane" |
| the mouse's wheel | Wheel | the same |
| a key | Key (the list is "Keyboard shortcuts") | the same |
| a note | Note | the same |
| the mark at a line's head | Bullets and numbering | Word splits the two ("Bullets" / "Numbering"), and one control here covers both |
| text | character / string / code | chosen by the situation |

**The navigation is "Navigation".** Its four tabs are Headings, Slides, Placed and Files, and "Headings" would hide the other three.

The fixed words, each in place of a plain word of our own:

| The word | What it names | What was turned away, and why |
| :-- | :-- | :-- |
| **entry point** | a place in the code that callers reach | `door` / `mouth`: no other editor, nor Rust, Swift or Java, replaces `entry point`. **Something pressed on the screen** takes the screen's own words — a menu item, the ribbon's tools |
| **character** / **text** / **font** | one unit of text / the text itself / the set that fixes its look | `letter`, for all three: every product says **Font colour** (the ribbon has it and **Highlight colour**), not "The letter's colour". `letter` is not in `face_words`: a word with several senses needs a replacement per sense, and four ordinary uses stay — CSS's `letter spacing`, Excel's **column letter**, the **Letter** paper size, and a letter one writes |
| **change** / **fix** / **edit** | altering a document, a style or a field / repairing a defect / altering a generated file by hand | `mend`, for all three, which puts a "Mend" button beside a report reading "Changed the style". Word's ribbon says "Modify", which Microsoft's own writing guide says not to use |
| **path** / **way** / **operation** | a place in a document, or a file's place / a means of doing something / a countable act | `road`, for all three, though the type is `Path` ([`model/locate.kspls`](../model/locate.kspls)). Where "the road that X" would stand for an operation, the noun goes ("what X", or a gerund in a heading). `route` is no answer — a synonym is the same calque spelled differently |
| **theme** | the document's set of colours and typefaces, and the page's own look | `skin`. The bare word is the document's (three of the four products give Theme to the document; [`write/theme.kspls`](../write/theme.kspls) holds it); the page's is qualified by its section (`look-theme` under Look), as Microsoft qualifies the chrome's as **Office Theme**. The two stay apart: the document's is saved as the style table, and the page's never leaves the browser. The fill and the border solved for one block are `Panel_paint` ([`model/panel_paint.kspls`](../model/panel_paint.kspls)), named with the drawing layer's word |
| **delete** | removing a row, a column or an object | `erase`: beside the menu's "Delete the row" it gives one operation two words on one screen; Microsoft, Google, LibreOffice and VS Code all say delete |

**Count the things before counting the name.** `Caret` and `Cursor` in [`lay/caret.kspls`](../lay/caret.kspls) look like one word twice but are two things. `Caret` is the place in the document: which run, which byte, what is being composed, where a selection starts. `Cursor` is the upright bar drawn for it. Neither is a word of our own making. A count says where to look, never what is found there.

### How a wording is changed

**Do not change a wording with a plain bulk replace.** A word turned away usually has a second meaning somewhere in the repository, and replacing every occurrence breaks text unrelated to the screen. Read each line for what it says before changing it. Where a word has no second meaning, say so and measure it; it can then move over in all its forms in one pass.

**Keep the list in the language the package is written in.** A list that hunts one language while the package is written in another cannot fire, and the very wordings it turns away come back through the pass meant to apply it. The list is `face_words` ("The vocabulary is one" above).

## The tools, the menus and the panels

These sections say where each tool sits on the screen and how it answers a press. **Each decision names the complaint it answers.**

### A ribbon, or a toolbar that does not move

**The ribbon has no tabs.** With tabs, finding a command means first knowing which tab holds it. Commands sit in named groups, and a contextual group appears on the same row, so no tab has to be searched. What cannot act is not shown, so nothing pressable does nothing. No icon stands without its name. Deep settings stay in the menus ("The tools and the look" below).

### How much of the window's height is handed to the tools

**Two levels, the menu bar (the band) and the ribbon, and no more.** The manual sits inside the "?", the find field at the band's right, and the formula field appears only when it can be used. The checks in `kspage/tests/browser/` watch the cap, since every level takes room from the body.

**A tool's name sits to the right of its icon.** Stacked, they would take twice the height. Names show by default, since a name shown only on pointing cannot be read on a touch screen, and they can be turned off (as in Office). A group's name takes no level: a dividing line shows the group, and its name shows on pointing.

**The band's right side is not left empty.** Find, replace, the manual ("?"), choosing the tools and folding go there. Do not put the manual at the left end. Place follows use, and the left end belongs to "File", used most, not to what is used least.

### What the ribbon shows

**A dropdown can sit on the ribbon too.**

Caution: **Do not copy its contents.** The choices and what runs on one live once, in [`port/web/form.js`](../port/web/form.js) (Principle 4). Each place decides only where it sits and its name ("the text colour" on the ribbon, "the colour" inside the font's set). The value is the document's, so either acts on it and both show the mark.

**Colours show as swatches, not names alone.** The value's shape decides whether a swatch appears (a `#rrggbb` is a colour), so the menu and the ribbon show it alike.

**What is placed once per document is not shown by default.** The table of contents, the list of notes and the columns are not worth a level's room for good. Do not take them out of the menu.

**Line alignment is one dropdown, not four buttons.** The other products apply alignment to the paragraph itself, so four buttons suit them. kspage applies it to the paragraph's style, so a dropdown that shows in one row what is applied is plainer.

**A dropdown that moves into `…` opens its twin in the menu.** Do not copy the dropdown as it stands: the copy has no rows behind it and opens nothing when pressed (Principle 5).

**The table's order is the order of use.** Groups that do not fit move into `…` from the back, so the order is also the order they survive in on a narrow screen. Do not order them by meaning, or what survives would stop being what is used most. Place following use is the same decision as "The band's right side is not left empty" above.

* At 1920px the always-shown groups take **1595px**, so at 1280px only Edit, Paragraph, Font and File fit. What survives is the only room the design has, and the order decides it.
* **Back and Forward come last.** No other product puts them on the first level, and the four words are easily confused with Undo and Redo. So they sit where a narrow screen drops first.
* **Save comes early.** Word and Excel keep saving in the always-shown Quick Access Toolbar, and Google Docs saves by itself. kspage does not save by itself, so Save must never sit inside `…`.

**Contextual groups come ahead of the always-shown groups, though not first.** At the back, a group shown only while you work on its thing would move into `…` exactly when needed. Ahead, only the less-used groups behind shift. First, it would move the most-pressed group from under the finger.

### What is done with the tools that do not fit

**Overflow drops into `…`, and no level is added.** Do not wrap the row: the narrower the window, the less body would show. Whole groups drop (single tools would split a group between the row and `…`), from the back, where the least used sit.

**The arrangement chosen is remembered, and rearranging stays inside a group.** A tool missing from the remembered order is kept, at the back in the table's order; otherwise, the day a tool is added, it vanishes from the screen of anyone keeping a learned layout. Unreadable stored text falls back to the default, and a reset to the default is offered. Otherwise a broken learned layout takes the tools with it, as a rearranged row lost in an update does. It works where nothing can be stored too, since every read is fenced.

**The `…` sits at the right end of the ribbon's row.** Do not put it on another row: with the cut in one place and what was cut in another, nobody can see what went. It sits beside the ribbon, which clips horizontally and would clip it. Measure without the `…` first; shown first, it would drop one more group at the width where everything fits.

### The ribbon's first level opens on a press

**It depends on where the group sits.** The ribbon's first-level groups open on a press; groups inside an open menu open on pointing and on focus alike. Do not open the first level on pointing, or passing over the row would open panel after panel (inside a menu the groups run down the page, so the path to a choice crosses no others). Nor on `:focus-within`, or tabbing through would open it. A press can come from a key, so the keyboard keeps working.

**Three ways close it, all through one place**: another press, a press outside, and Esc (`shutTools` in [`port/web/page.js`](../port/web/page.js)). A panel that opens on pointing closes when the pointer leaves, so opening on a press needs ways to close. Do not write the closing in several places. Split, a press outside would close the band's menu and leave the ribbon's panel open.

**Esc follows the other products.** A menu opened by a key closes by a key, and WAI-ARIA's menu button requires Esc. It takes nothing from the browser, since none of Esc's default jobs (stopping a load, leaving full screen, closing a `<dialog>`) arises on this page.

**Leave Esc alone while composing**, where it cancels the composition ("Keys, focus and menus" above). Esc has three jobs (close the menu, drop the held tool, collapse the selection), so only the first that applies acts. The focus goes back to the text input, not to the button that opened the menu, so typing works right after it closes.

**The ribbon scrolls horizontally only.** Do not clip it vertically: a panel opening downward is cut off, and it is open, yet nothing shows. Its `display` is `flex` and it has a size, yet the canvas receives the pointer.

Note: **A check that looks only at the size passes**, so the check asks what receives the pointer at the panel's middle ([`../tests/browser/ribbon.js`](../tests/browser/ribbon.js)).

### A button on the ribbon either acts, or opens the thing that needs filling in

**A ribbon button whose operation needs nothing typed acts on the press.** One that needs something typed opens the panel holding that field, with the cursor in it, and the panel stays open. Applied while empty, a link would stay with no destination (Principle 5). One function opens the field, and the right-click menu uses it too.

**A folded panel takes no focus.** A closed menu and a folded panel are laid out as nothing, and focusing a box not laid out does nothing. So the code taking a person to a field opens every level first and focuses last (`reach` in [`port/web/page.js`](../port/web/page.js)). The other way round, the press looks dead, as Link and Comment both would. Panels open when the pointer rests on them, so there is no state to read. A panel opened on purpose carries a mark, cleared by the one function that folds panels.

**A press that opens a panel is not a choice made.** The ribbon folds its panels on any press that is not on a control, so a button that opens one stops its own press there ([`port/web/ribbon.js`](../port/web/ribbon.js)). Unstopped, the panel would open and fold within one click.

### Groups in a menu are submenus, and a panel is only for what is used over and over

A group inside a menu takes one of two shapes: a submenu that flies out, or a folded panel. **Two shapes are not the problem; leaving unwritten which to use is**, since the same kind of group then gets built differently in each menu.

**The one thing that decides is whether the group is touched on and on.**

| The shape | Where it is used | Why |
| :-- | :-- | :-- |
| A submenu (`data-fly`) | one choice (or entry), and done | the press returns the focus to the body, so closing as the pointer leaves is fine |
| A folded panel (`details.sub`) | a group touched on and on | as a submenu, **it would close at every touch** (the focus returns to the body) |

Two kinds are touched on and on. One is **what holds text to read**: the source text passed in, the note on what is remembered, the history's list. The other has fields filled in one after another: the page and the margins, the fields that change a style.

Caution: **Do not lay commands out flat on the first level.** Even when the menu stays short, flat commands give no clue to which acts on what. The cap is four, and what counts is every button in neither a submenu nor a panel. Counting only the children of `.items` misses a button inside a `.row`.

**Do not bring the often-used commands back to the first level.** One-press reach is the ribbon's job, and it presses the same button. The checks are four, in `kspage/tests/browser/menu.js`: the first level's count, the shapes a panel may take, no `<select>` in a menu, and no group inside a group.

**A level may be added only where two or more items are folded.** Folding one adds a step with nothing to hide.

Apple's and Microsoft's guidance both say "one level at most". **Two levels are allowed all the same, to keep the first level to "what it acts on"**, as Google Docs' `Format ▸ Text ▸ Bold` does. No third level is made.

**No `<select>` inside a menu; wherever one thing is chosen, it is a submenu, at any level.** Not even inside a panel: the choices there would stay fields while every other became a submenu, and which one acts on the press would get harder to read.

**Where it sits says whether it acts on the press.** Inside a panel a submenu only holds a value, and pressing "Apply" acts (`panelFly` in `port/web/form.js`); outside a panel it acts on the press. A submenu works inside a panel because the panel is a `details`. A bare submenu closes as the focus returns to the body, but a panel stays open, so the next field can be filled in.

**The choices' list belongs to the JS that builds the submenu**; `page.html` holds only where it sits (`<div id="...">`). `menu_pairs` in `tests/support/conventions_bound.kspls` checks it against the core's list. The list lives in one form, so one reader is enough.

**No bare text field on a menu's first level**; no other product has one. A group needing a field goes into a submenu or a panel, as "link", "footnote" and "comment" do. The one exception is "where it is saved and read from". It shows where saving writes, and folding it would break the rule that this can be read before the press ("The save destination is remembered, and permission is asked at the first save" below). It shows only while the local server is there, so the flat rows do not keep growing.

### A submenu is not put into a box that scrolls

**A box with `overflow` clips its absolutely positioned descendants.** So `overflow` must not go on a level (a submenu) that holds another submenu. The next level would hide inside the box, a horizontal scroll bar would appear, and the deeper levels could not be reached.

What may scroll is **a leaf level** that lists only choices; a swatch list or style names can run long, so it scrolls vertically. `port/web/fly.js` marks the levels that hold submenus (`fly-nest`).

**In the markup the next level is there, so counting the DOM does not notice.** Only the look breaks. So `kspage/tests/browser/menu.js` really opens the third level and checks both its size and the scrolling. A size alone proves nothing, since a rectangle comes back even for a hidden element.

**Some level always runs out of room to open rightward.** Each level opens 180px further right, so the third reaches the window's edge. A level is opened, measured, and flipped to the left (`place` in `port/web/fly.js`). The menus at the band's right open leftward from the first level (`at-right` in `port/web/page.css`). One mark serves the first level and the submenus alike; a list of ids would get changed in one place only, the day a menu is added.

### The style menu is grouped by what it acts on

**Users raised three questions here**: "what do I select before changing it?", "is it the Styles field or the Paragraph field?" and "what does this item point at?". A label alone answers none of them.

**The menu is split by what a style acts on, not by its kind.** There are three headings: on the selected characters (select them first), on this paragraph (clicking inside it is enough), and on the whole document. Do not head them with the kinds' names (character style, paragraph style). As users reported, those do not answer "what do I do?". Each heading's bracket names the operation needed, so the list says what to select.

**A list shows only the styles that really apply there.** The paragraph's list shows flowing styles only, judged in one place (`fits_block` in `model/style.kspls`). If the page judged again, a listed style could be refused. Do not accept "let it be chosen, then refuse": nothing pressable may fail to act (Principle 5). The entry point still refuses with a reason, but no path leads a person there.

**The list reflects the current state.** Rebuild it when the document is swapped, or the previous document's names stay listed, and choosing one is refused with "there is no style of that name". Build it from the names alone; built from the contents, it would be rebuilt at every colour change, closing an open list at once.

**Rows instead of fields, with the choices opening to the right** ([`port/web/fly.js`](../port/web/fly.js)). Do not go back to a label and a `<select>`. A closed field hides what is applied, so it cannot be read until opened, as users reported. A row puts a ✓ on what is applied and shows its name at the right.

**Only "a choice that acts on the spur of the press" becomes a submenu.** Do not move a field that acts only when applied into such a submenu. "A style's detailed settings" is a panel that swaps some 40 fields on one "Apply", so acting on a row's press would make a half-typed value the style. Across the page, a choice that acts on the spur of the press is a submenu: the paper size, the print direction, the comparison's view, the theme, the tools' density, the choice made when inserting. A choice whose list is built from the state (the style to change, the source passed in) only holds a value for the button pressed next.

**A kept version is not one of those.** Its list is built from the state, yet choosing it starts the comparison, so it acts on the spur of the press (`pastFly` in [`port/web/diff.js`](../port/web/diff.js)).

**Deleting a kept version has rows of its own, and the row pressed is the version deleted** (`dropFly` in [`port/web/diff.js`](../port/web/diff.js)). Sharing the comparison's rows would run a comparison nobody asked for, and delete a stale choice instead. Google Docs and Word do the same (a ⋯ on each row).

**The "there is none" row does not take the value the ✓ is matched against.** It would match the empty value `now` returns, and put the ✓ on "There is no saved version yet".

**A check that compares and then deletes cannot catch shared rows.** Both easy checks pass, while the shared code, with nothing chosen, silently throws the oldest version away instead of refusing.

Note: The check keeps two versions, deletes the newer, and **proves the older survives** ([`../tests/browser/diff.js`](../tests/browser/diff.js)).

**The first level has three rows only: "the characters", "the paragraph's character style" and "the whole document's theme".** Do not put the choices on the first level. The decorations are six, so the menu would pass its 400px cap and cover the canvas. A submenu floats at absolute coordinates, so opening levels never changes the first level's height.

**Inheriting from the parent is one of the choices.** Its row names itself "nothing named", since a blank row does not look pressable. Nothing shows right of a closed row, though, where "nothing named" would read as something applied: named in the list, blank as the current value.

**Both "do" and "do not" are offered.** Do not make it one switch: one word could not be made non-bold inside a bold paragraph. "Nothing named" cannot say that, since the parent is bold. So there are three rows (nothing named / do / do not), the shape of Google Docs' "Size" and "Alignment".

**One thing removes decoration: "nothing named" in the character style's list.** Do not add a separate "remove decoration". What is applied to a run is one name, and a decoration is applied as a name too (`decoration-cff0000-u1`). So in the core both come down to `apply_style("")`: one thing done two ways (Principle 6). Its label would also lie: pressing "remove decoration" would remove a named style as well, since the core does not tell them apart.

### The insert menu is grouped by what is inserted

**The name comes from the other products**: Word, Excel and Google Docs all have "Insert".

Note: The verb "insert" also stays the core's word ([`write/insert.kspls`](../write/insert.kspls)). **A menu's name and an operation's name are two things.**

**The first level holds only the names of the things inserted; the values and the "insert" sit inside each thing's submenu.** Fields on the first level would number over 10, passing the menu's 400px cap and covering the canvas. The first level has seven submenus (a table, a slide, a picture, a graph, a figure, a link, a note). It also has two commands with no settings (insert the table of contents; delete the table, slide or picture you are in), and one folded panel (tie to the source).

**One thing's matters are done in one submenu.** Do not scatter a thing's rows over two: the note's submenu holds adding one, removing it and inserting the list together. The figure's submenu holds the shapes, the name and the reference from the body for the same reason. All point at a figure by name, and the reference does nothing until the figure has one.

**The choice made when inserting is a submenu too**: the sketch, the shape's kind, the graph's kind, the line's kind. Do not go back to a `<select>`; a closed field hides what is chosen, as in the styles' menu above.

Note: The page holds the labels and texts in one place (`port/web/command.js`), and `make test-conventions` checks them against the core's texts. **The check reads the JS file**, so a list kept anywhere else goes unchecked.

**A group whose text is read stays a folded panel** (tie to the source). Do not make it a submenu, which closes when the pointer leaves and cuts the reading short. The line is "a place to choose, or a place to read".

**A submenu's contents are written in the HTML, and the page builds only the row that points to it** (`kspageFlyGroups` in [`port/web/fly.js`](../port/web/fly.js)). Do not copy that row's text into the HTML, or one copy goes stale the day the markup changes (Principle 4). The fields and their explanations (`placeholder`, `title`) stay in the HTML; moved, the menu's words would be split over two texts.

### The right-click menu, and what is carried on it

**Only the body's menu is replaced.** Over the menu bar, the status bar, the list at the right and the typing field, the browser's own menu appears. The body is a canvas, where the browser's menu offers only "save the image", so replacing it there loses the least.

**No cut, copy or paste**, since nothing pressable may fail to act (Principle 5). The keys work as usual, since the hidden typing field receives them.

**Every row names a button that is in a menu.** No command lives here and nowhere else (Apple HIG). A row reads its wording from the button it names, so it never keeps old words after the menu changes (Principle 4). A row whose button is absent does not appear.

**A right-click inside the selection does not move the cursor.** Moving it would drop the selection of whoever selected and then opened the menu, and a comment would attach to nothing. A right-click outside the selection does move it. The rows depend on where you are, so without the move, rows acting somewhere other than the spot pressed would be listed.

**The right button grabs nothing.** Grabbing a handle or a border would make opening the menu resize the frame.

### The debug log is kept apart from the document

**Do not write it into the document.** The change trail is the document's and goes with it to whoever receives it; a log belongs to one machine at one time. What decides is whether a save comes in between. Written into the document, reporting a fault would mean saving first, yet what broke did so before the save.

**The log downloads as a text file.** The document's text does not go in, or reporting a fault would mean handing over what was written; a gate checks this. In go the styles' list and the names listed in the fields, the styles applied now, the numbering and page settings, the messages and refusals shown, and the change trail. A mismatch shows here: the faults reported from use are slips between "the document's styles" and "the styles listed in the field".

**The change trail goes in too**, since what was done just before it broke is what is needed. The typed text does not go in, so the trail leaks no contents. Read its count after stamping it (`stampTrail` in `port/web/report.js`). Read first, what is not yet stamped is lost, and the rows and the count disagree.

**It is called "Download the debug log".** Do not say "write out", which copies the document into another format (HTML, Markdown, CSV), and this is not the document. What a browser passes to the user is a download (the same distinction Word and Excel make between "export" and "download").

### The '?' menu does not copy the manual

**Do not keep the usage text in two places.** Text in the menu goes stale the day the manual changes, and nothing tells which is the source. The manual is a kspage document opened in this window, so it never sends the reader to another page either. So the menu holds two items and no more: what opens the manual, and what downloads the debug log.

### Where the result of a press is shown

**The result of a press goes in the status bar**, and not at the top as well, since two places drift apart when only one is changed. The left shows where you are, the middle the result, and the right the counts. Where you are sits at the left because it explains half the refusals (a shape goes only inside a slide; a row is added only inside a cell).

**A refusal gets a colour.**

Caution: **Do not show it in the same colour as a success.** A message in the bottom bar does not stand out, so nobody would notice the press did nothing.

**A refusal is amber, and red is kept for when something is lost**, since red catches the eye on its own. Shown in the strongest colour, a refusal that broke nothing would be as loud as a lost document.

**A success is not coloured.** Do not light the bar up at every press; lit all the time, it would stop the refusals catching the eye.

**A mark (✓ / ⚠) goes beside the message.** Do not rely on colour alone, or someone who cannot tell the colours apart could not tell success from refusal. The mark is decoration, so `page.css` holds it, and the text holds only the wording.

**The wording is "what could not be done + the next step".** Do not show a note written for the implementer as it stands. "drag on a presentation's slide" is the implementer's phrasing, and whoever pressed cannot tell from it what happened. It is written as `A shape goes inside a slide. Press a slide and then drag`.

### Where the open file's path is shown

**The path is shown as it is at the left end of the status bar.** Do not add a level for it: the status bar is there already, so this costs none.

**The front is cut, and the name always stays.** Cut from the end, what disappears would be what you most want to see. The front and the name sit in separate boxes and only the front shrinks, so the CSS alone does it (`#file-at .dir` and `#file-at .name`).

**Pointing at it shows the whole path.** Showing only the cut form would leave no way to tell files with the same name apart.

**It says so when there is no file too.**

Caution: **Do not leave it silently empty.** Empty, it lets nobody notice that what is written is going nowhere.

For a file chosen in the browser, the browser passes no path, so only the name is shown, and pointing at it says why.

### Where the document's name is placed

**It sits on the band and is renamed in place.** It is not on the ribbon's row, where folding the ribbon would hide it. It is not the document's contents: the core keeps no name in a document, so this is "the file name when this page saves". Opening a file replaces it with that file's name.

### The headings and the placed objects share one panel

What the panels beside the body show is built from the document at every layout, and nothing in them is remembered.

The panel shows two things: the document's frame (the headings) and what is placed on it (shapes, frames, lines).

**One navigation panel, divided by tabs**: "Headings", "Slides" and "Placed", one shown at a time.

Caution: **Do not move the placed objects out to another panel** (as Word and Google Slides do), nor mix them into one tree (as LibreOffice does).

**All three tabs always show, each with a count.**

* **Do not remove an empty tab.** Without it, whether anything is placed could not be known without pressing (the separate panel's "what is folded away is forgotten"). With the count shown, "three placed" reads without a press.
* **Do not switch tabs because of a press.** If selecting a shape swapped out the headings, whoever was following the chapters would lose their place (the count already shows that placed objects exist).
* **Remember the chosen tab**, even where nothing can be stored (every read is fenced). One place decides which tab's contents show (the tabs in `port/web/side.js`). If another place also folded a tab when empty, a pressed tab could show nothing (Principle 6).

How the slides themselves are shown follows the same line. **A thumbnail is too small for its contents to be read**, so on its own it leaves the reader asking which slide it is.

**"Slide 1" and so on is laid over each thumbnail.** Do not make it readable only by pointing, since a `title` alone cannot be read on a touch screen. The page is painted in its role colour, not in the screen's own colour. Under a dark theme the screen's colour makes black panels on a black ground, a row of thumbnails showing nothing.

The slide's title is not shown beside it. The core has no entry point that returns a slide's text, so showing it would take a new one.

### How the side panel's width is set

What the panel lists is **the document's text** (headings, shapes' names), so the width needed differs per document.

**The width is changed by dragging, remembered, moved by key too, and reset by a double press; the four go as one set:**

* Caution: **Do not rely on dragging alone.** Aiming at a thin border and holding it is a barrier for an unsteady hand, so the arrow keys move the same width 16px at a time.
* **Offer a reset**; otherwise whoever made it too narrow would restore it by eye.
* **Do not make the grab area the border line alone.** A 6px strip straddles the border, since a border that cannot be hit sends the finger meant for it onto the body. The strip is painted in the same colour when pointed at and when reached by key; that colour is the only sign that it moves.
* **Do not change the width when the tab changes** (as LibreOffice's sidebar does).

**The limits live in one place, the CSS** (`--side-room` in `port/web/page.css`). Do not repeat them in the JS. The upper limit depends on the window's width (`50vw`), which JS cannot hold as a number, and two copies drift apart (Principle 4). The JS holds only the remembered width and the default (216px); the CSS fits a remembered width that is out of range. The remembered number is left as it is: a width widened on a wide screen is fitted when opened on a narrow one.

**Measure the outer width** (`border-box`). Otherwise the room the body gives up, where the border sits and the remembered number drift apart, and narrowing by key keeps widening the outside. The width matters only while the panel is shown. Folded, the border folds too; otherwise a grab strip would stand beside no panel, still in the keys' round (nothing pressable does nothing).

**The split view stops at the panel.** Run to the right edge, it would sit in front of the status bar and hide the list's lower part, which scrolling cannot bring back. Because the width can change, the part hidden would change too ("the wider, the more hidden"). So a mark on the root says whether the panel is shown, and `--side-room` sets the right edge.

### A remembered position goes stale

**Do not have a list row remember its target's height.** The list on the right is rebuilt only from the text and the depth, so that it is not rebuilt at every keystroke. So it is not rebuilt at a relayout, where a remembered height goes stale. Asking at the moment of the press is enough (`app.contentsTop()`).

**Only kspage scrolls the window.** The typing field sits over the cursor, so focusing it makes the browser scroll there on its own judgement. Giving focus back right after a jump can then pull the window from the target back to the cursor. So focus is given with `focus({ preventScroll: true })`, and only `followCaret` and `jumpToCaret` scroll. They allow for the height hidden behind the tools (`headRoom`); the browser's scrolling does not.

**Neither shows a symptom everywhere**; it depends on the environment. "It does not reproduce" is no reason to leave it. A place that breaks a rule is wrong even where no one knows an environment that shows it.

### How the difference of two versions is shown

**The matching is done once, and a view only narrows it** (why is "Matching runs in three steps, and a later step leaves an earlier step's pairs alone" above). Show both the narrowed count and the total; the narrowed count alone makes a difference under another view look absent.

**A difference makes no document.** It is a list to look at, and no third document is written out, so there is nothing more to tidy away and pressing "stop" ends it at once. Pressing a row jumps to that place; otherwise, back in the body, you would hunt for the change by eye. A deleted section has nowhere to jump to, so it says so and refuses.

**Both looks are drawn by the same drawer at the same width**, with what prints the page (`paintPage`). So they match pixel for pixel, and no tolerance is held, the setting that causes complaints in other picture comparers. Do not use the screen's canvas, or its cursor, selection and dotted region lines would show as differences.

Caution: **Where the sizes differ, compare only the overlap and say "the lengths differ".** Cut silently, what grew would never enter the difference.

**A version is kept only on a press and on a save, not at every keystroke.** That fine a step lines up more versions than anyone can read, and uses up memory.

* **Set a cap, throw the oldest away when it overflows, and say so.**
* **A chosen version can be deleted.** (Google Docs' version history stops taking named versions at its cap, and only a named version can be deleted on its own.)
* **Kept versions are stored apart by the document's origin mark.** Pages opened from `file://` share their storage, so another document's versions would mix in. So a document with no mark keeps no versions; saving it gives it one. They are that page's storage and cannot go to another machine; choosing a file is the way to take one elsewhere. Comparing with a kept version and with a file share one entry point, since two would drift apart when only one is changed.

**The screen says how the two were matched** ("matched by number" or "matched by text", above the rows). Do not fall back to text silently: unseen, a mismatch is taken for the difference itself. Typing makes the difference stale, since it only points at two documents, and the screen says that too.

### Whether the browser or the page holds the zoom

**The zoom is the browser's; the page keeps none.** A desktop program holds a zoom of its own because no browser stands around it, and the OS's magnifier enlarges the whole screen. In a browser the zoom is already there, so a second one would be two means for one purpose (Principle 6). A page-side zoom does to the document exactly what the browser's does: both divide the laid-out width and rewrap, with the canvas staying at the window's width. They differ only in whether the tools grow too. What is lost: the browser's zoom enlarges the ribbon and the menus too, so "enlarge only the document" is impossible. Packing the tools tighter on a narrow screen is another setting's job (the tools' density).

**One document unit is one CSS pixel.** Do not put another multiple in between. Then every file that handles a press would need the division that turns a press into document coordinates, and missing one would make the press and the cursor drift apart only when zoomed. Only the pixel density (`devicePixelRatio`) multiplies, in one place, where the canvas is drawn.

**Showing one sheet at a time magnifies differently** ("Showing one slide at a time crops and magnifies it"). It fits one sheet to the window, not a multiple the reader chooses.

### Where the body's width is capped

* **A line is held readable at 45 to 75 characters.** Left to the window, a line on a wide screen passes 200.
* **Set in one place alone, it causes a complaint either way.** Set by the document alone, it is "set it every time"; set by the application alone, "this one document cannot be changed".

**The body's width is the document's setting** (`Sheet.paper.reading` in [`model/style.kspls`](../model/style.kspls)), kept with the paper width and the margins. 0 means no limit. That is the default, the holder's full width, so an old text reads unchanged. It does not act once the paper width is set: the printed width is the page's to decide, and with both acting, line length would have two owners. The room left over is split equally left and right (`Sheet.column_left`).

* **Do not align it to the left**, or on a wide window the body would cling to one side. The centring is computed in one place; added by each caller, the laid-out and the printed positions would drift apart.
* **The limit applies after the margins are taken off**, so the number in the field matches the body's visible width. Applied before, the body would be narrower by the margins.
* **A row sets the recommended width** (`Make it a readable width`, 640px: 45 to 75 characters at 13px). Someone who does not know the number needs a way in, and a number field alone gives no clue.
* **The application adds no default of its own**: with two settings for one purpose, nobody can tell where an opened document's width came from. Nor does it write the document's width. Written, nobody, the receiver included, could tell from the document whether the width is the writer's choice or the application's default.
* **"I want it readable for myself" belongs to the viewer's overrides**, the unsaved layer ("Where the viewer's overrides are placed" below). This screen remembers them, so the width, set once, applies to every document opened afterwards. The document's width is the setting for "everyone who opens it reads at this width". The two are not one thing said twice.

**What it costs**: with the body's width limited, a wide table must fit inside it too, not cut but cramped (the cells wrap). The ways out are no limit (0), setting the paper width, or putting the table on a slide. One block alone cannot be placed outside the width (`Style.width` acts on a slide alone).

**Changing the paper settings goes onto the undo record** (`Paper_op`; "The record holds every kind of instruction in one row" above). Do not write `sheet.paper` directly; go through `Editor.set_paper`. Missing this is worse than "undo does nothing". An unrecorded change makes no step, so undo reverts the change before it. Type three characters, change the paper and press undo: `undo()` returns true and undoes the typing while the paper stays changed. With only the paper changed the record is empty, so it returns false and nothing happens. The check is [`../tests/browser/paper.js`](../tests/browser/paper.js).

**Test it after typing**; otherwise the case that loses the characters is missed. The whole value goes onto the record, so going back to 0 is checked too. If a 0 were not written, undo would keep the previous width, and the same document would wrap differently before and after. The check is in [`../tests/wasm/paper.mjs`](../tests/wasm/paper.mjs).

### Where the viewer's overrides are placed

* **A per-viewer override that no document holds brings two complaints**: a "change how it looks" that changes the contents too (darkened pictures, dropped tables), and a choice made again every time.

**The overrides are a layer** (`Sheet.over` in [`model/style.kspls`](../model/style.kspls)). The document does not change: they reach neither the saved text nor the HTML. They do not act when printing, since a page per viewer would make printouts disagree. The list's thumbnails are pages too, so they show the document's colours.

**They survive reading the document again and go with the viewer** (`carried` in [`model/over.kspls`](../model/over.kspls)). The exception is the filters, which point at the old document's tables. Kept per document, the overrides would be chosen again every time.

**The width is the core's, and the colour the page's.** The width must fix the laid-out and the pressed positions by the same expression, so it is the core's (`Sheet.column_width`). Only the page knows the role names (the core holds no colour names), so the colour is the page's. Do not have both hold the same field.

**Colours are not "inverted"; the document's colours are simply not used.** Pictures are not touched, since a colour inside a picture is no setting of the document. A table's grid is drawn in the screen's border colour; undrawn, the cells could not be told apart.

**This screen alone remembers them**, as with the theme.

**The body's text size can be overridden too** (`Over.size_px`), apart from the zoom. For the body's text, this covers what "Whether the browser or the page holds the zoom" above names as lost. The coordinate system does not change: one document unit stays one CSS pixel, so no press-mapping division comes back. Only the font size changes; pictures, frames and the table's grid keep their size.

**It takes a size, not a multiple** ("read the body at this size"), so one number gives the same body size in every document, whatever its root's size. A multiple would differ per document, and the reader would enter it again for each.

**A style with a size written scales by the same ratio** (`Sheet.text_ratio`). Do not scale the root alone: the larger the text, the more the body would overtake the headings.

**The ratio is set on `Look` and passed down the tree.** Do not have the drawing code read `Sheet` for it. Each caller declares the ratio, so the two that must not apply it say so: a page's header and footer (the bands would grow) and the HTML written out (it would change with the writer's settings). The ratio applies to "the size written" only. Applied by the receiver, it would multiply once per level of nesting, since the parent's size is already scaled.

### What a theme holds

**A theme holds only colours and typefaces.** It holds no sizes, spacing or alignment: changing those would change the page count per theme, and the printed page and the screen would drift apart. So a theme holds no body width either (the width is a paper setting).

**The colours and the typefaces come as one set** (one list).

Caution: **Do not split them into two lists.** Separate lists let their combinations make a look nobody has seen.

**A theme touches only the styles**, not the root's typeface and not the paper settings. The paper settings are measurements alone (the size, the margins, the body's width), and a theme holds none. The root's typeface is on no undo record (no edit changes it), so one undo would put the styles back and leave it changed.

**One undo restores the whole theme** (`wear` in [`write/theme.kspls`](../write/theme.kspls) opens a step at its two ends alone). Applied style by style, undoing one theme would take tens of presses.

**A theme reaches every style, chosen by its part and not by its name** ("Styles are told apart by role, not by name" above). A link's style by the runs carrying a link, a heading's by its depth, code's by not wrapping, and the rest as the body.

**The worn theme's name is not written into the document.** Do not leave a tie between the document and the theme; Word's automatic update reverts the styles through such a tie. A document with one colour changed afterwards would still claim to be "that theme", and the name would lie. Once a theme is worn, the styles' table is the source. So themes are offered as commands to press, not a field to choose from, since a field would claim to show the current state.

### A theme is a few roles, not a field per part

**The colours and the measurements are held as a few roles** (`:root` in [`port/web/page.css`](../port/web/page.css)). There are two for text (`ink` / `ink-dim`), three for the ground (`field` / `panel` / `raised`), and the border, the accent, the refusal, the page, the rounding, the typeface and the shadow. No field exists per part of the screen, since from then on the parts left behind multiply with every theme. One accent colour only: with two, nobody could read which marks the current state.

**No colour is written straight into a rule.** Every one written leaks out of the theme, and that one place stays in its colour. `make test-conventions` checks it, so a colour value outside `:root` fails. The canvas reads the same roles; it borrows `--accent`, so the selection and the handles follow the theme too.

**The text and its ground reach a contrast of 4.5:1** (3:1 for large text; WCAG 2.2's 1.4.3). Measure it for each theme. Enough under one theme can be too low under another (a hovered row the rule missed stays the browser's own button). Do not style pressable things place by place, or a place forgotten stays the browser's own and does not follow the theme.

**A gate checks the contrast** (`make test-conventions`). Do not rely on looking at the screen. The ground shown on pointing (`--raised`) appears only when pointed at, so even a screenshot misses it. The gate reads only the roles' colour sets, so it needs no browser and covers a theme the day it is added. It cannot check values the environment decides, such as `CanvasText` in the default `:root`, nor how rules interact (a `:hover` holding an id taking only `[open]`'s ground) cannot be said in colour sets; that needs a real pointer.

**The document's colours are not the theme's.** The colours a style holds show as the document names them, even under a dark theme.

Caution: **Do not mix the two.** Mixed, the same document would show other colours on another machine, and the printed page and the screen would drift apart.

### The tools' density belongs to the screen

**The density is this screen's setting**, not the document's. Do not bake it into the document: the same document is opened in narrow and wide windows, so baked in, it would trouble one of them. Only two roles move (`--tool-pad-y` / `--tool-gap` in the `:root` of [`port/web/page.css`](../port/web/page.css)). The font size does not. The body is not affected, since its width and leading are the styles' settings.

**Three levels: tight, normal and roomy.** A single density causes complaints from both directions at once ("too cramped to read" and "I want it tighter"). Normal is the bare state with no attribute; tight is for a narrow window, roomy for pressing with a finger. It is remembered as the theme is, rewriting the mark on the root through the one entry point that remembers; a second would get forgotten.

### How the settings panel is laid out

**The panel is divided by headings** (the look / the ribbon / what is remembered). Do not lay the fields out flat. Only the top one (the look) is open; the two below are folded panels (see the scrolling below).

* **The tools' list has a heading for each ribbon group, in the ribbon's own words.** So nobody has to work out which field acts where: where the ribbon's group is "Shapes", the heading is "Shapes" too.
* **Past 20 fields, a way of narrowing is offered.** It matches a group's name and a tool's name alike, since people remember by different ones.
* **What is remembered is written down.** Unseen, nobody can tell how to fix it, nor what a reset puts back. So "Put the ribbon back to the default" names its reach.
* **Only the one long list scrolls** (the tools' list). Do not make the panel itself a scrolling box, or a submenu inside it would hide in the box ("A submenu is not put into a box that scrolls" above). Folding is the one means of keeping it short (Principle 6); scrolling the panel as a second means would only get in its way. Nor nest scrolling: with the inside and the outside moving separately, nobody can tell which one is scrolling.

## What a document received is trusted with

A received document was written by someone else, so two rules say what is refused rather than repaired.

### The numbers inside a document are refused rather than rounded where they are outside the range

**Size is not the only thing a cap must guard.** In some fields one number sets how much work there is. A merge loops once per column it spans, a column set lays out once per column, and a heading's depth sets how many places its chapter number stacks up. A size cap does not stop this. A 190-byte document with two billion in `span_cols` never returns from layout, and with three blocks it passes every size gate.

**The ranges live in one place, [`model/limit.kspls`](../model/limit.kspls), and a value outside its range is refused where it is read.**

| The field | The range | Where it comes from |
| :-- | :-- | :-- |
| A merge's rows and columns (`Block.span_rows` / `span_cols`) | 1 to 1000 | the same as HTML's `colspan` |
| A column set's columns (`Style.columns`) | 0 to 64 | Word allows 45 (paper width ÷ a ½-inch minimum column) |
| A heading's depth (`Style.outline`) | 0 to 9 | where Word and ODF stop |
| The decimal places (`Number_spec.places`) | 0 to 9 | 10 to that power still fits an I64 |

Caution: **Do not round into range.** HTML silently rounds a `colspan` down to 1000, so the file says 5000 and the screen shows 1000. That is a field that does not act as written (Principle 5).

Refusing, as Word's field does, tells the writer what happened.

**Both entry points, the file ([`share/store.kspls`](../share/store.kspls)) and the screen ([`port/web/face.kspls`](../port/web/face.kspls)), check the same numbers.** One wider entry point would make the range meaningless, so the model holds the ranges and the entry points only read them (Principle 6).

**Read with `as_int64`.** `std/json`'s `as_int` returns an I32, so an overflowing number turns negative (`4000000000` becomes `-294967296`). A check of the lower bound alone then silently lets it through as "not merged (1)". So both entry points check the range as an I64.

Note: **A gate watches this.** It feeds deliberately broken documents ([`../tests/fuzz_main.kspls`](../tests/fuzz_main.kspls), `make test-fuzz`) through reading, and also through layout and writing out, so this kind of multiplication shows up as a timeout.

### Text from a received document is checked where it is used

**Holding no macros closes only that one hole.** Every entry point that uses the document's text as it stands is the same hole. Even with no code to run, what was received decides a link's scheme, a picture's source and the HTML written out.

**Each entry point decides whom it trusts and which schemes it lets through, as listed below.**

Caution: **Do not list the dangerous ones and turn those away.** The next one to appear gets through silently.

| The entry point | What is let through | What refusing guards against |
| :-- | :-- | :-- |
| Opening and writing out a link ([`model/source.kspls`](../model/source.kspls)'s `safe_href`) | a relative path, `#`, `http`, `https`, `mailto` | a shared document with a `javascript:` link runs that code in the page of whoever presses it |
| A picture from an outside server ([`port/web/draw.js`](../port/web/draw.js)'s `outside`) | embedded (`data:`), or beside the document (a path with no scheme) | on opening, the other server learns that the document was opened, and from where (a tracking pixel) |
| Pointing at a path and opening it ([`port/web/save.js`](../port/web/save.js)'s `isSafePath`) | a path with no scheme and no `..` | opening what lies outside the folder served (`%2e%2e%2f` and `..\` are decoded before the check) |
| A CSS value written out ([`share/html.kspls`](../share/html.kspls)'s `css_value`) | only characters that cannot break out of the declaration | one font name could slip any rule into the HTML written out |

**Do not use `escape_html` for CSS.** HTML escaping does not act inside a `<style>`: `;` and `}` pass straight through, and an entity such as `&lt;` lands in the value. The escaping follows the destination: an attribute, text, a CSS value and a CSS name each need their own.

Caution: **Tell the user what was stopped.** Stopped silently, an empty frame looks like a failed read, and the screen seems not to respond.

For outside pictures, the status bar shows how many were stopped, and the setting that allows them is in "the look".

**That permission is not remembered.** Remembered, it would let the next document opened silently fetch from outside too.

## Opening, saving and writing back

A browser reaches a file only on a press.

### A document is written back where it was opened

**A document is written back where it was opened from, and "Open" is the browser's own window whether or not the server is running.** A document opened through the window keeps its handle and saves through it, even while the server runs. One opened by path (Enter in the path field, a `?doc=` link, a double-click) holds no handle and saves to its path. A document that came any other way lives in no file (the file field, a drop that passes no handle, imported Markdown, the manual). It first saves where a fileless document does (under the served folder by its name, or where the window asks), never into the previous document's file. Every way of opening ends in the one place that decides this (`settleIn` in [`port/web/file.js`](../port/web/file.js)).

**"Open" is not routed through the path field while the server runs.** A person who arrived by a double-click holds a file, not a path, and presses "Open" expecting the window every other product gives them.

**What this gives up**: a file opened through the window may lie outside the served folder, so no `?doc=` link can point at it. It is reopened the way it was opened: through the window, or by a double-click, the OS's own way. A file under the folder is still reached by path. The path field clears when the window opens a document, so only one destination shows.

**Opening by path is Enter in the path field**, as in a location bar. It is the screen's one way, and it states its refusals there: an empty field, or a path outside the folder.

**Say something on a cancel too.** The browser's window returns the same refusal when a person closes it and when it failed to open. With no message, that looks like a button that does nothing.

### A save has one destination, and asks nothing it already knows

**While the server runs, a document opened by path does not choose its destination in the browser's window.** If it could, it could be saved outside the served folder, making a document that cannot be reopened by path. The same press would also do two different things.

**Nor does it ask instead.** The folder is the one the person chose when starting `kssrv`, and the name is in the menu bar's field; asking for what is already known only adds a press. So with the path field empty, it writes directly under the folder by that name and puts the path written into the field. Later saves then go to the same place, and the workings are visible.

Caution: **Do not silently overwrite an existing file.** The default name is the same for everyone, so it can collide with another document. On a collision the save refuses, pointing at the field.

**A save's path goes to the document it was made for.** The document in view can change while a save waits on the write. A dropped file that fails to open puts the previous document and its path back, and one that opens stays in view. So the path written, and the text the next save compares against, are recorded after the write, only while that document is still in view (`stillHere` in [`port/web/save.js`](../port/web/save.js)). Recorded before the write, the first case restores the pre-save path. Recorded on whatever is in view, the second gives another document a file it never came from, which its next save overwrites. The cost: a document that has left view does not take the path. Its next save asks again, and refuses to overwrite this save's file, pointing at the field.

### Before writing back, outside changes are detected by comparing the text

The same file can be open in two windows: by path (`?doc=` and the path field), or through the browser's window, where each window holds its own handle.

Caution: **Overwrite it silently and what was written in the other window is lost.**

So the file is read again before writing, and **if it differs from the text last seen there, the save refuses**, naming that place.

**A handle compares against the text last read or written through it** (`seenAt` in [`port/web/file.js`](../port/web/file.js), compared in [`port/web/save.js`](../port/web/save.js)'s `writeTo`). The one exception is a target just chosen in the save window. Choosing an existing file is the person's own "replace it", and the window asks.

**Do not compare the time and size**, as other products do (VS Code's "The content of the file is newer"). That refuses even when nothing changed, because clock granularity and each filesystem's quirks affect it. Comparing the text itself never refuses by mistake, and the cap on what can be opened bounds the text held.

**No lock file is laid down** (LibreOffice's `.~lock.`). One left behind by a crashed page makes a file nobody can open, while reading again and comparing leaves nothing behind.

**What guards a path is a text read from it.** A reloaded page reads its document again ("The save destination is remembered, and permission is asked at the first save"), so its first save compares too. A path typed into the field and saved to at once has read nothing. That save is the person's own "write it here", which the refusal of a colliding name points them to ("A save has one destination, and asks nothing it already knows").

**When the check cannot be made, refuse.** Writing without being able to read is overwriting unchecked.

### The save destination is remembered, and permission is asked at the first save

**A reloaded page comes up on the document it had open, read again from where it lives, together with where it writes back.** Otherwise every reload asks for the destination, and a wrong choice grows a copy beside the original. What is remembered is the document's path or its handles (`FileSystemFileHandle`, for the document and its history). At start-up the document is read from there and laid in, as Enter in the path field and the window do (`reopen` in [`port/web/save.js`](../port/web/save.js)).

**Do not restore a destination without its document.** Restored onto the sample the page comes up on, the first `Ctrl+S` would write the sample over a file it never came from. Nothing stops it, since the guard compares only against a text read there. Reading the document again is what makes restoring the destination safe: the text last seen is the one just read, so the guard holds from the first save.

**It is remembered per tab.** The tab's own storage (`sessionStorage`) survives a reload, is seen by no other tab, and holds the tab's name. The record under that name holds the path and the handles ([`port/web/handle.js`](../port/web/handle.js)). A handle cannot be turned into text, and IndexedDB is the one store that keeps it, by structured cloning. Remembered browser-wide, a reload would bring in the document another tab had open last.

**Only a reload or going back keeps the name** (by the navigation type). A page reached fresh (a window another opened, a URL typed again) takes a new name and comes up on the sample, in no file.

**A closed tab leaves its record behind**, since nothing tells closing from reloading. So the records are capped, and the oldest go first.

**The permission does not come back with the handle.** `requestPermission` can be called only in response to a press. So the start-up read relies on the permission the browser still holds, and write permission is asked at the first save. Once the browser has been closed, the read permission is gone too, and the file cannot be read without a press. The page says so, and the file is reopened from "Open".

**A destination that cannot be read again is forgotten, and the page says why**: the file is gone, the server is not running, or the permission is gone. The page stays on the sample, in no file. Without that read, a memory remains that is found broken only when pressed, the complaint raised most against desktop "recent files".

**A link wins over the memory** (`?doc=`). The address names its document, so the page comes up on that and ignores the record.

**It must also work where nothing can be remembered.** IndexedDB cannot be opened under an opaque origin (`file://`), so there the page comes up on the sample. Do not stop silently. A store that fails to open answers "nothing remembered" ([`port/web/handle.js`](../port/web/handle.js)); otherwise start-up waits forever for a document that never comes.

### Drafts are held aside, and a draft is never called a save

**Without drafts, unsaved work is lost.** The file is written only on a press, so a crashed tab loses the whole day's typing. Every other editor keeps a draft.

**A draft is held aside in the browser during typing.** When typing pauses (2 seconds) and when the document is left, its text is written to IndexedDB ([`port/web/keep.js`](../port/web/keep.js)).

**Do not write it on closing (`beforeunload`).** No event fires when the tab crashes, so it fails exactly when it is needed.

**It does not write to the file.** The browser grants write permission only on a press ("The save destination is remembered, and permission is asked at the first save"), so saving by itself is impossible in principle.

**It says only "held aside", never "saved".** The two words are easy to confuse. Word's AutoRecover is read as "it was saved", yet closing without saving throws the recovery copy away too, and whoever misread it loses the work. Kept apart, the words cannot be misread, and "recovery" does not appear on the screen either.

**A draft is restored only when pressed.** Opened by itself at start-up, a draft one meant to discard would come back to life. The status bar says in one line where it is, and it is restored from "File", then "the record of what is half-written". Do not announce the open window's own draft. That window is alive and still holding it aside, so the notice would list a live draft as one lost earlier.

**A restored draft is not tied to a destination.** The draft can be older than the file, so tying it would let one press of Save turn the file back into an older version. Word and LibreOffice tie it, relying on the user to notice. The status bar says where the original was, and the first save asks for the destination.

**One question decides whether to write or discard: "is there anything to lose?"** [`port/web/file.js`](../port/web/file.js)'s `draftNow` returns null when there is nothing to lose, and there is one entry point, `keepSync`. Do not split the question and the contents into two entry points: the caller would call both and turn the whole document into text twice per pause, paid on every keystroke. Do not reuse `unsaved` either. It answers "may this be thrown away?" and deliberately calls a document in no file unchanged, so here it would leave unkept a document typed on a blank sheet, the kind most easily lost.

**The key differs per start-up**, and per window, since two windows under one origin use the same document numbers. Keyed by the number alone, document 0 after a reload would overwrite the earlier 0's draft before it can be restored. The start-up's key is not remembered, so an earlier start-up's draft is always left an orphan, and that orphan is what gets restored.

Caution: **Do not let drafts pile up without end.** An origin's storage has a quota, and past it writes fail silently, so the guard works in name only.

Drafts are pruned past 30 days and past 32 of them, in one place at start-up. Elsewhere, drafts would pile up whenever that place is not reached.

**Only the document in view and the documents left are held aside.** Each is held aside as it is left, so every open document is covered. The core has no entry point for "write out another document's text now"; adding one would be a change to the core.

### A document is replaced by another only when nothing would be lost

**When another document is opened over it, a document with unsaved text goes to its draft first.**

Caution: **Do not silently discard unsaved work.** Writing lost to one keypress cannot be undone.

So **no refusal is needed**: a document is replaced only when there is nothing to lose.

**Do not ask with a dialog (`confirm`).** In a test browser nobody answers, so the test stops there. On an embedded page, a dialog that blocks the whole page does the same.

**Show a held-aside document in the list** ("Files" in the right-hand list). Otherwise nobody can tell where the unsaved work went. Mark it as unsaved too, with a mark beside the name, not by colour alone.

**The document in view lives in the globals** ([`port/web/state.kspls`](../port/web/state.kspls)). The list holds the others' held-aside records, and switching copies the globals into a record and restores another's. Do not turn the globals into "the i-th in the list". Every entry point would then carry "which document", and every signature across the boundary would grow.

**The history has one static arena**, so it is copied out on leaving and reopened on returning. The arena decides how many documents fit: the list's size is the only cap on the count, and the arena's gate answers whether one opens.

**"Open" on the document already in view reads it again.** Whoever pressed wants a fresh read, since it may have changed outside; showing it again would make the press do nothing.

### The extension is kspage's own, and does not name the format inside

**Documents are saved as `.kspage`** (the contents stay JSON).

**Do not name the extension after the format inside.** As `.json`, these documents could not be associated alone. The OS associates by extension, so tying `.json` to kspage would make every settings and data file open in kspage on a double-click.

The other products do the same: Word names its zip `.docx`, not `.zip`.

**`.json` stays readable.** Older documents are `.json`. Made unreadable, one would open as plain text, its tables, formulas and decorations collapsed into one paragraph, and saving would overwrite it in that shape.

**This does not make two formats for writing.** One function writes (`port/web/file.js`'s `bodyExt`), and `kindOf` only reads files that already exist. This is the same reason a version is kept ([`share/store.kspls`](../share/store.kspls)'s version).

**Write a document back in the form it was opened in.** Do not move a document opened from `.json` to `.kspage`, or two files would stand side by side with nothing to say which is newer (the same reason as "Markdown is edited as itself"). Whoever wants to move it can use "save as".

### The saved text is laid out to read well in a diff

**Do not pack the whole document onto one line.** Packed JSON reads back just as well, but then changing one word changes the whole document in a diff. git's diff and merge and `grep` can say nothing, and there is no way to compare what was written side by side.

**It is written one value per line** ([`share/store.kspls`](../share/store.kspls)'s `spacing`). The reader skips whitespace, so a text saved earlier still reads if the indentation changes; packed text reads too.

**The other products differ here.** kspage saves text that it reads back, so packing is its own choice, and a readable diff is worth more than what packing saves (some tens of KB).

### Pointing at a document by URL and opening it

**`?doc=<path>` starts with that document open, and `&read=1` makes it read-only.** This is how a README or an issue links to a document; a path typed into the field by hand cannot be passed on as one link.

Caution: **Accept only a relative path on the same origin.** A scheme (`https:` / `data:`), a path starting with `//` and one climbing with `..` are refused. Accepted, one shared link could make this page read any location and show its contents.

**It reads with an ordinary `fetch`**, not the local server's `/api/file`, so it works from any server that just serves files. It does not work on a page opened from `file://`, since the document is not on that page's origin.

**Do not strip the query from the URL.** Unlike the token ([`port/web/local.js`](../port/web/local.js)'s `#t=`) it is no secret, and a reload returning to the same document is what the link is worth.

**Set read-only before loading.** Loading a document rebuilds the editing state, so if it is set afterwards, the document is writable while it loads.

### Read-only belongs to how a document was opened, not to the document

Caution: **Do not write it into the document.** Written in, it becomes a lie: a copy calls itself "read-only" and anyone can edit it anyway (the same reason a theme's name is not written into the document). So it appears in neither the saved text nor the HTML written out.

It lives with the reader's overrides (`Sheet.over`), and **survives reloading the document** ([`port/web/state.kspls`](../port/web/state.kspls)'s `new_edit`).

**The core refuses the edits.** Hiding the tools is not enough: operations that slip past hidden tools (shortcut keys, pasting, undo) always remain. Hiding only keeps buttons that would do nothing off the screen.

**The refusal is at the entry point of a rewrite, not in the code that rewrites.** If the `do_*` functions (the 20 that rewrite) quietly did nothing, a caller that repeats until something happens would never finish. [`write/block.kspls`](../write/block.kspls)'s `join_here` loops until the runs are gone, so with `do_run` doing nothing it hangs there. Refused at the entry point ([`write/edit.kspls`](../write/edit.kspls)'s `shut`), the loop never starts.

**There are over 50 entry points, so one will surely be missed.** So the check is not a count but that the saved text does not change by one byte (`kspage/tests/edit_test.kspls` and `kspage/tests/browser/store.js`). Whichever way an edit gets in, a changed document shows up there.

### Switching between reading and editing

**The mode switches both ways, and stays a setting of how the document was opened.** Do not make it feel like a lock: it is a screen against edits by a mistaken press. A document opened with `&read=1` can be switched to editing too. A one-way switch would guard nothing, since removing that mark from the URL does the same.

**The control that shows the current mode is the one that switches it**: the pair at the status bar's left edge, with the mark on whichever is on. Do not show the mode in two places, or changing one puts them out of step. Do not hide it when read-only; hidden, the way back is gone from the screen.

**No shortcut key is assigned.** Nothing may silently switch the mode on a mistaken press (as LibreOffice's `Ctrl+Shift+M` can), and with the control always in sight, no key is needed.

**The switch applies in both directions.** Applied one way only, the tools would stay hidden back from read-only, leaving a screen where one can write but the writing tools are missing.

### Whether a picture is linked or embedded is decided by whether the server is there, not by the person

The document holds only **the picture's source**, which is text, and so an outside reference as it stands.

**Do not make the person choose how it goes in.** As with the save destination ("A save has one destination, and asks nothing it already knows"): where the local server is running and the document's path is known, the picture is put in the document's folder and referenced by path; otherwise it is embedded. The page says which happened.

**Do not make a folder.** A per-document subfolder (`notes.files/`) needs an entry point that makes folders, and the server's write entry point makes none. Whether a folder exists is the person's to decide; saving to one that does not exist refuses and says why.

Caution: **Do not silently overwrite an existing name.** The picture keeps its file's name, so it can collide with another picture.

**Report the size embedded.** Unreported, a few photographs reach the cap on what can be opened, and nobody can see what is heavy (a `data:` text is 4/3 the original bytes).

**In the HTML written out, the reference stays relative.** Move the page elsewhere and the picture disappears, so a page that must be self-contained uses embedding. This is a trade-off: neither can be made the default with the other taken away.

## More than one window, and opening from the desktop

One page holds one document.

### Editing together

**Two people do not edit one document at once, and two windows on one machine are not joined to edit it together either.**

**Why windows are not joined.** Simultaneous edits need an agreed order, and with no server only each window's own count can give one. That fails with a third window and across a network. So two windows in one browser are a different problem, not a small case of two people in two places. A join held as paths into the tree also breaks in ordinary use. Adding or deleting a row or a column, or applying a new style, cuts the paths, and those are the very operations a table needs.

**Two people's work is brought together afterwards**, by the change history ([`share/trail.kspls`](../share/trail.kspls)) and by comparing against an earlier version ([`share/compare.kspls`](../share/compare.kspls)). Two windows may open one file, but the second to save is refused if the file changed after that window read it ("Before writing back, outside changes are detected by comparing the text" above).

**A real answer needs a server that orders edits for everyone.** `kssrv` exists but deliberately knows no document ("Who asks whom" below), so such a server has to be designed from scratch, not reached by joining windows.

Note: What the person meets instead is in the manual's "What it cannot do" chapter ([`content/manual_share.kspls`](../content/manual_share.kspls)).

### A read-only split view shows another part of the same document

**Two panes that both take typing cannot be made.** The core holds one cursor ([`write/edit.kspls`](../write/edit.kspls)'s `Editor`), so a second editable pane would have nowhere to keep its own. The split view is therefore a window that only reads, called "pinning" ([`port/web/peek.js`](../port/web/peek.js)). This follows from the core's shape; it is not a shortcut.

**It has the body's width and sits below the body.** At one width there is one layout result, so opening the split view lays out nothing more. It crops that result and draws it (`paintCrop` in `port/web/draw_crop.js`, the same tool printing uses). Do not put the two side by side: halving the width lays out both again, doubling the cost of every keystroke.

**Redraw the split view on every redraw notice.** Otherwise what was typed shows in the body alone, and a view of the same document looks out of step with it.

**Keep a way to pin again**, or looking at another place means closing and reopening the split view. The wheel over the split view moves the pinned place up and down, and the body does not scroll with it.

**This is not a way to put different documents side by side.** The state is one set, so another document is another window (accepted limit 2 in "Accepted limits (what is decided not to change)" below).

### A window opened on a document holds that document

**A window the page opens with `?doc=` reads the document that names, and no window passes its document to another**, since two windows are not joined ("Editing together" above). A window opened from a link inside a document is `noopener` as well. Lining documents up inside one window is a separate matter (accepted limit 2 below).

Caution: **Do not check it by the text alone.** A passed-over document overwrites the named one only when it arrives later, so the text can look right in one order and lose the document in the other. The browser check also counts what was passed ("Opening a different document in a different window" in [`../tests/browser/local.js`](../tests/browser/local.js)).

### What kspage publishes for the opener

**Nothing in kspage is published for the opener**, the program outside this package that opens a `.kspage` document on a double-click. Do not have it reach the names of the sample and of saving directly. `pub` is a contract leaving the unit, so opening `content/` and `share/` adds two contracts (`ksplc.cfg`'s [I0402] watches their count; see "What is here" in [`kspage/README.md`](../README.md)). The entry that assembles the seed is already open for the gates, so the opener uses that.

### Whether a dropped file is opened or inserted

**The heaviest complaints about a drop are "I meant to open it and it was inserted" and "I meant to insert it, it opened, and the earlier document was gone".**

**Once something is dropped, the browser's default is always stopped, across the whole window.** Unstopped, the browser moves to that file, and the document being edited goes with the page.

Caution: **Do not stop it on the body's canvas alone**, or a drop on a panel or the ribbon would escape to the browser. The mark shown while dragging covers the whole window too.

**A picture is inserted into the document, and anything else is opened as a document**, told apart in one place (`isPicture` in `port/web/drop.js`). The cursor first moves to where the picture landed, but only when it landed on the body; a panel's or the ribbon's coordinates would put the cursor somewhere else. A picture that declares no type is opened as a document, where the core checks the contents and refuses, so it is never silently mistaken.

**A drop borrows the existing entry points**: `takeChosen` in `port/web/file.js` for a document, `takeImage` in `port/web/command.js` for a picture. Do not write a reading path into the drop (Principle 4), or dropping alone would behave differently.

**A text drag is left alone.** Only a drag carrying `Files` is taken over. Stopping a drag of characters too would stop dropping text into a field to paste it.

**The dropped file is bound for writing back only where a handle could be taken.** In the browsers that give one (Chrome, Edge), a save writes straight back to the dropped file. Do not bind again where no handle was taken; that would only delete the handle remembered. There the file opens but a save drops a copy, the same split as choosing a file (`canBind` in `port/web/file.js`).

### How a blank document is started

**The commonest complaint is a list of templates standing between the user and the blank sheet.**

**"New" opens a blank sheet, with no screen of choices in between**, since that screen is the complaint itself. A template never stands in front of the blank sheet.

**The open document stays open.**

Caution: **Do not make "New" close the open document.** It would silently throw away whatever is half-written.

When there is no room for one more it refuses (the same limit as "A document is replaced by another only when nothing would be lost" above).

**No shortcut key is named.** Do not offer `Ctrl+N`: the browser takes that key before the page sees it, so the hint would not work when pressed. A desktop product can use `Ctrl+N` because no browser stands in between (the same difference as "Whether the browser or the page holds the zoom").

**A blank sheet is the styles' table plus one paragraph holding an empty run.** Include the styles' table. Without it, tables and slides both land as ordinary paragraphs, so someone who started from "New" cannot insert a table. Lay the empty run down too. A block alone produces no box, so a press cannot fix a position, and the blank sheet appears but cannot be typed into. This is the shape the editor leaves when it empties a paragraph, and it is saved as `"text": ""`.

**Where to write back is not carried over**: neither the name, the path nor the handle. Otherwise saving a blank sheet would overwrite the file opened before. The record kept aside for comparison is empty too, so the overwrite guard would not act either.

**The read-only look is undone.** The core marks a fresh document read-only, so if it were left alone, a look that forbids typing would sit on a document that allows it.

**Neither a body width nor a theme is written into a blank sheet.**

Caution: **Do not make "New" the place defaults are laid down.** "Where the body's width is capped" above says why, and where "readable for me" goes instead.

## Markdown, plain text and source

The texts kept beside code are opened as they are.

### The mapping into Markdown

[`share/markdown.kspls`](../share/markdown.kspls) writes it, **for keeping a document beside the code**. Like HTML it does not read back, since no style is carried into the text ("Saving and loading are separate from exporting" above).

**Contents with a Markdown form are written in that form; contents without one are written as a mark.**

* With a form: a heading's depth is its count of `#`; a list's mark is `-` or `1.`; a paragraph is text outside any fence; a grid is a GFM table; a link is `[text](destination)`; emphasis on a run is `**` and `*`. A slide and a chart each get a fence of their own ("Markdown carries a slide as the positions of its frames" below).
* Without one: **merged cells, a block inside a cell, a block inside a slide's frame, and a joining line outside a slide** (inside one, it goes in the slide's fence). They are not dropped silently. Each is written as `<!-- kspage: ... -->`, an HTML comment that Markdown passes through unseen.

**A mark is written only where contents are lost.** The look (colour, sizes, alignment, a picture's size, a column's width, a row's height) is dropped wholesale. A mark for each would bury the text, so this section says it once.

**A number with a Markdown form is written in that form; one without is written as text.** A list's bullet symbol written beside the `-` would show two marks, while a dropped chapter number or "Figure 1. " would vanish from the screen.

Note: Both numbers come from the same place the layout uses (`kspage/model/number.kspls`'s `heading_number` / `serial_number` / `note_number`).

**Escape only what would read as something else**, since escaping everything makes the text unreadable. A `_` inside a word is not emphasis and is left alone, while a `#` at a line's start could read as a heading and is escaped.

**Indent only inside a list.** In Markdown, leading spaces change a block's meaning, so indenting at every nesting level would turn a paragraph into a code block.

**A table's first row is its heading**, since GFM has no table without one. As with CSV, export writes the text shown, not the formula.

### The Markdown reader accepts any text

[`share/markdown_read.kspls`](../share/markdown_read.kspls) reads it.

Caution: **A line it does not recognise goes in as a paragraph**, so reading never fails. Refusing would silently drop the lines it cannot read. In a format like Markdown, where any text reads as prose, the person would not know what was lost.

**The text typed is not changed** (as in "What it does not hold"). A chapter number or a list number written in the text goes in as text where it stands. So a heading gets a style with no number mark; with one, export would double the number. A numbered list's marker, by contrast, is not taken from the text: an item's number is counted at layout, so it is renumbered by the same rule.

**A style is looked up by its shape, and added where none matches.** Looked up by name, merely renaming a style would make the next import build another one. Only the emphasis style's name is built in one place, shared with the code that applies emphasis (`paint.span_name`). With two places, the same emphasis would appear twice in the table.

**A row gets no style name**, since the text gives no way to choose one. A cell takes the cell style of its column's alignment, found by its part, as a table inserted from the menu finds it (`cell_style` in [`share/markdown_style.kspls`](../share/markdown_style.kspls)). Why a left-aligned cell takes one too is in "What a Markdown round trip drops" below. A picture gets a fixed size: at size 0 it is not laid out, so an imported picture would silently vanish.

### Markdown is edited as itself (no second copy is kept)

**Do not sync an exported text back into a separately kept document.** With two copies, one of them without styles, nothing tells which is newer. This is why a block whose number already stands is not taken ("A merge only takes a section that exists on one side alone" above). So the `.kspage` is not made the source of a generated `.md`, since that is the two-copy shape itself.

**A document opened from a `.md` is written back to a `.md`**, so there is one copy. Write it back in the format it was opened in; saved as a `.kspage`, it would become two copies at once. A document kept as text (a `.md` in git, say) can then be edited in kspage while the tools around it work unchanged: diff, `grep`, the checks that read text.

**If anything will be dropped, say so before writing.** Written back over the original, a silent drop cannot be noticed by anyone. The count lives in one place, [`share/markdown.kspls`](../share/markdown.kspls)'s `Sink.dropped`. It takes what can be marked in the text (`notice`) and what cannot (annotations, asides): the person needs to know not "what was dropped" but "whether anything was".

**The annotations (`Inline.remark`) and the asides (`Block.aside`) are not written**, and get no mark. They are not the document's contents, so nothing is dropped from the flow. They still count as dropped: the file is written back, so their absence must be reported.

**Do not write a history file into a Markdown document's folder.** A `.ksdb` growing beside it would be foreign to a folder kept as text, where git and similar tools keep a document's history.

### Markdown carries a slide as the positions of its frames

**A slide is the one block that loses its whole point when dropped.** Other blocks lose a look and keep their contents, but a slide would lose where every box was placed, which is all a slide is. Markdown is the one format in which a person can carry a slide out of this application, so it must carry that much.

**A slide is written as a fence whose language is `kspage-slide`, with the frames' placement as its contents.** The other ways of carrying a figure in text fail here:

* **Not a file of its own** (JSON Canvas, whose users keep asking for Markdown). Two files are two things to keep in step, and the document's own search does not reach into the second.
* **Not a model inside a picture.** draw.io says of its own such files that the diff is lost, and that git says nothing until a helper pulls the model back out.
* **Not text a machine lays out** (Mermaid). A language that cannot name a position cannot carry a slide placed by hand. Where positions matter, Mermaid's own answer is a mode for dragging by hand. The position has to live somewhere, and in a text that somewhere is the text.

**A fence, because a tool that does not know it still shows the text** as a code block. So a person can still read the frames' names and texts, where a picture with the model inside shows a blob and a `.canvas` shows nothing at all.

The spelling is one line per thing.

````
```kspage-slide 620x120 #plan
frame #one at 24,16 size 180x64 style slide-title
  The **reader**
frame #two at 300,16 size 180x64 style slide-body
  The writer
tie #one -> #two style figure-fall_arrow
```
````

**The fence's opening line carries the slide's size.** The size belongs to the slide's style ("How a grid and absolute coordinates are laid out" above), and no style fields go into the text. Read back, it makes a style of that size, and a second size makes a second style, as a fence's language does. Do not derive the size from how far the frames reach: a size fixed first is what lets absolute coordinates sit inside the flow.

**A frame's contents are the lines indented by two spaces, one paragraph per line.** Inline marks (emphasis, a link, code) work there as anywhere. A line holding a fence mark lengthens the slide's fence, as a fence inside a fence does. A frame holding more than flowing text keeps its comment mark: a table inside a frame has no line to go on, so it is dropped and the export says so.

**Every field but the position may be omitted.** `#name` appears only where something points at the frame, and `style` only where it is not the slide's plain one.

**A fence with a line that does not parse is a code block, whole.** Half-read, it would give a slide missing some frames, and nobody could see which line was skipped. The fence's text is kept as it is.

**What is written out must read back to exactly the same place.** Graphviz's recorded bug is a pinned position coming back at the origin, so a round trip moved the figure. The gate is the fixed point that `tests/suite/mdtrip_test.kspls` holds. Numbers get as few decimal places as they need. A position dragged by hand lands on a fraction, so the first round trip may move a frame by a hundredth of a pixel; from the second on it does not move, which is what the fixed point asks.

**One language name is reserved, and only one.** A fence's language is otherwise a style's name ("What a Markdown round trip drops" below), so `kspage-slide` alone reads as something else.

**The look is still dropped** (colours, line widths, typefaces). What is carried is where things are placed, not how they are drawn.

### What a Markdown round trip drops

Whether the repository's documents can be held in kspage depends first on **whether the round trip drops any content**. Once something is dropped, nobody can say what was lost on the day a document moved. [`../../tests/suite/mdtrip_test.kspls`](../../tests/suite/mdtrip_test.kspls) watches this by sending the repository's own `.md` files through. Do not test on small made-up texts alone: code inside bold or a link, and consecutive fences, appear only in the real thing.

**What is required is a fixed point, not sameness with the original.** A choice of notation, such as a `*` bullet becoming `-`, is not content. Reading it in again must change it no further, the same idea as self-hosting's diff-zero. Separately, the counts of headings, code spans, fence languages and link targets must not go down.

**A code span (`` ` ``) is read as a run.** Kept as literal text, the `` ` `` would become a character of the body, be escaped on writing back, and change the text across the round trip. Its style has the same role as a code block's (it does not wrap). It gets no role of its own, because a run reads neither the wrap setting nor the fill, and the theme applies the monospace by looking at that one role.

**The language a fence names is kept as a style name.** Dropped, ` ```kspl ` becomes ` ``` `, and every tool that collects the source's fences misses them (in this repository, [`../../tests/suite/docsnippet_test.kspls`](../../tests/suite/docsnippet_test.kspls)). A style name becomes the HTML class unchanged, so Markdown's naming is the same mapping.

**Consecutive runs are wrapped together per emphasis.** Code inside bold splits into three runs (`this document (` / `DESIGN.md` / `)`), so wrapping each run in `**` would write `**...****` ... `****...**`.

**The parting is in two stages: by link target first, then by emphasis inside that.** Parting by both at once splits a link wherever the emphasis changes inside its text. A `[...](...)` is written per piece, so one link multiplies into as many links as it has runs. The rendered text does not change, so nothing shows on the screen; only the gate that counts notices. This is the rule of the HTML mapping ("The mapping into HTML" above) carried out in the writer, not a separate one.

**A break is "a block that holds no content and collects none"** (`divides` in `model/fence.kspls`). Add neither a field nor a name. It is recognised by role, so renaming a style does not break it (Principle 1). Its look is the style's: a line under a style that draws one, only space under one that does not.

**A break is never taken into a fence.** Taken in, two fences with a break between would become one block: one band on the screen, and one ``` pair in the text. So two fences separated by one blank line round-trip as two. Where a fence begins with the same style as the block before it, the reader puts a break between them. That break is not written into the text. The next reading rebuilds it from "there are two fences", so it does not multiply across round trips.

**Do not mistake a collecting block for a break.** The table of contents, the footnote list, a chart, a figure and a window assemble their content at every layout. So in the document they hold neither text nor children, and mistaken for breaks, the list disappears whole. Nor mistake a blank line inside a fence, which holds one empty run.

**A setext underline is not read as a heading**, since the reader takes only `#` headings. Read as body characters, a `---` would join the paragraph before it, so reading it as a break is the nearer answer.

**A column's alignment is held by the style of that column's cells.** Do not add a field to the table. `Style.align` already means "the alignment of a row's content", so a table field would hold one thing two ways (Principle 6). The role looked for is a flowing paragraph with inner padding and no marker, of that alignment. The padding tells it apart. A cell has padding to keep the grid line off its content, whereas a break draws a line without padding, and a bare paragraph has neither.

**Give a left-aligned cell a style too.** A block with no style name cannot hold a style, so it would stay as its parent has it, and neither the grid line nor the padding could be written anywhere. Nothing goes into the text, so the round trip does not move.

**An explicit left (`:--`) is folded into the default.** It looks the same as `---`, so holding the two apart in the document means nothing. In this repository `:--` far outnumbers centre and right together, and only those two carry content that could be lost. So holding alignment for them alone is enough; otherwise the styles' table grows by the number of cells.

**It is one per column.** Markdown can write alignment only per column, so the writer takes the header row's cells. A different alignment in a lower row cannot be written. Taking "any row that holds one" would let adding one row change the whole column's alignment.

### Markdown's look comes from a style table passed in before reading

**The reader decides roles only and writes no look.**

Caution: **Writing into a style what is not in the text grows a look that is not in the text.** A `#` says "this is a heading", not "this is 32px bold".

Yet with roles alone, the size, the background colour and the rules are nowhere.

**A table carrying the look is passed in before reading** ([`share/markdown_look.kspls`](../share/markdown_look.kspls)). The reader always "uses what is there and adds a style only where there is none", so a table passed in is taken up unchanged.

Caution: **Do not apply the table after reading.** Applied afterwards, it misses the styles the reader added (a fence naming a language, a code span with emphasis).

**Carry one style per role, no more.** With two of one role, the table's row order decides which is taken, since the reader looks up by role and takes the first found.

**Do not hold two sets of style names.** The names carried in the table and the names the reader adds where the table lacks them are the same names. With two sets, one document would carry different names depending on how it was opened (Principle 4). So `markdown_look.kspls` holds the one set, and the reader uses it.

**A role missing from the table is added by following a style of the same role that is there.** Do not add it bare. A fence naming a language (` ```kspl `) and a code span with emphasis (`` **`x`** ``) each carry a different style name and so become new styles, yet every one of them is code by role. Added bare, a fence that names its language alone comes out as plain body text, with no monospace, background or frame.

**Give a bare paragraph a name too.** A block with no name cannot hold a style, so neither the space before and after nor the line height could be written anywhere. Its role is "no role": a paragraph that is no heading, list, code, cell or break, and carries no marker.

**A break alone is told apart by name.** A break that draws no line has nothing but its empty content (its role's definition), so style fields cannot tell it from a bare paragraph. The distinction lives in this one place; held in two, the paragraph after a break would take the break's style.

**A link's colour is the theme's to hold.** Given the body's colour, the clickable place would vanish into the text. Which style is a link is not read from the style. A colour plus an underline is a link-like look, not a link; a heading given both looks the same. So the document is asked. The run holds a link's target (see "A link: the run holds where it points, and the style holds the look" above), so the style a run with a target wears is the link style. Walk the document once, first; walking it per style would go over the document once for every style. The test on the look (`linked` in `model/style.kspls`) is needed only to find the one link look in a table one made oneself. That is the reader's case, where no other style carries a colour and an underline.

**Swapping this table does not move the round trip.** Neither style names nor measurements are written into the `.md`.

Caution: **So the round-trip check runs with this table.** Run with an empty one, a round trip broken by an added look would go unnoticed.

### Plain text holds one line per block

This is how kspage opens a `.txt` or a program's source ([`share/text.kspls`](../share/text.kspls)).

**It round-trips byte for byte.** Markdown's "fixed point" is not enough ("What a Markdown round trip drops" above). That one does not count a choice of notation as content, whereas this text is a compiler's or a tool's input, where one byte different is another file. So the notation is not tidied, trailing whitespace is not dropped, and line breaks are not made uniform. [`../../tests/suite/textrip_test.kspls`](../../tests/suite/textrip_test.kspls) watches it by sending every file git knows through whole.

**One line is held as one block.** Do not make a second kind of document: relayout, the cursor, undo, saving, searching and comparing all work unchanged with what exists (Principle 1 and Principle 6). A fence (a ``` block) already has this shape, so only a reader and a writer are added.

**The gutter for line numbers is sized from the number of digits in the line count** (`gutter_for` in `share/text.kspls`). Do not make it a fixed width; one wide enough for the largest document leaves too much space on the left of a file with fewer digits. The digits follow from the line count, so they are known as soon as the file is read. Reckon a digit's width generously: a monospace digit is 0.55 to 0.62em, so 0.65em is used. A number wider than the gutter is drawn from the gutter's left edge and runs into the body (`place_mark` in `lay/line.kspls`). Measuring cannot find it: the gutter is where the body begins, needed before the layout.

Note: The check is [`tests/text_test.kspls`](../tests/text_test.kspls)'s "there is a gutter the numbers are laid in", which checks that the gutter widens as the digits grow and that the number and the space beside it always fit.

**The price is the arena.** This repository's text takes several times its own size again in memory, the more so the shorter the lines. The cap is that of the existing document memory gate (`room_for` in `port/web/state.kspls`), and past it the page refuses before opening.

**VS Code went the other way.** It replaced one line as one string with a piece table, because opening was slow and memory ran high. That reason holds here too, so kspage does not claim that any large text can be opened. What the price buys is that the document's tools work unchanged.

**A line is exactly a piece cut at line breaks, so a trailing line break is followed by one more, empty, line.** That tells a file ending in a line break from one that does not, so it is not remembered separately. A flag would say what the content already says, and one of the two could change alone.

**A CR is kept as a character of its line**, so a CRLF file shows one character at each line's end (this repository holds no CRLF file).

Caution: **Do not remember "this file is CRLF".** In a file with mixed breaks, one kind would be silently rewritten.

**A file holding a NUL is refused.** Do not open a picture or an executable as text: the screen fills with nonsense, and the file is broken the moment it is saved. The one test is git's own, "is there a NUL"; relying on the encoding would let a misjudged text through silently. Report it apart from both "too large" and "cannot be read", since the remedy is "open it with another tool", not changing the text.

**How a file is opened is decided in one place, by its name** (`kindOf` in `port/web/file.js`). There are four ways to open one (a path, a text reference, a handle, a drop). A test per entry point would let the shape opened and the shape written back drift apart per entry point (Principle 4). An unknown extension opens as plain text. A list of known ones would grow with every extension, and a text missing from it would be read as JSON without a word.

**Do not write a history file (`.ksdb`) beside a plain-text document** (the same rule as Markdown's).

### Source colouring stops at lexemes and is recomputed at every layout

Colour goes on when a source in KSPL (either notation), C or JavaScript is opened. It also goes on a Markdown fence naming one of them: ` ```kspls `, ` ```kspl `, ` ```c `, ` ```js ` and the like (the names known are `kind_of`'s in [`model/code.kspls`](../model/code.kspls)).

**It splits no further than lexemes**: comments, strings, numbers and keywords. No syntactic role (a type, a function, a variable) is coloured. Going further means knowing the grammar, and becomes a rebuilding of what ksplc holds. Imitating the grammar with regular expressions, as TextMate grammars do, is wrong wherever the grammar nests, so it would colour some text wrongly every time.

Note: **kspage cannot colour by syntactic role the way other editors do.** The reference direction does not let it import ksplc ([`../../docs/SPEC-documents.md`](../../docs/SPEC-documents.md)).

**The language is given by the style name.** The language a fence names is already kept as a style name ("What a Markdown round trip drops" above), and the same name is read here. A plain-text file opens the same way, its extension becoming the style name. An unknown name gets no colour, since splitting by guesswork would colour only part of the text.

**Colour is worked out at every layout, and the document is not touched.**

Caution: **Do not write it into a run.** It would go stale at every keystroke, and the undo record would fill with colour changes.

A box holds its run and a byte offset into it (`Box` in `lay/page.kspls`), so however many pieces a run is split into, neither the cursor nor a press moves.

**A lexeme crossing a line passes one state, and only one, to the next line** (`Carry` in [`model/code.kspls`](../model/code.kspls)). Keep it to one. Every state carried across lines is one more way a change in one line reaches the lines below (relayout runs a line at a time). Do not work the state out again from the top, or colouring one line would mean lexing again from the document's head.

Note: Lines are laid in document order, so the code that places them passes the previous line's answer straight on to the next (`Pen.carry` in `lay/line.kspls`).

**Reset it when the language name changes.** It is another text, and a comment left open in the fence before would run on into the next block. One state also keeps a change local. Below a changed line, only the lines whose carried state changed need splitting again, which a narrower relayout could rely on (accepted limit 1 below).

**Only two lexemes cross lines** (`/* */`, and JavaScript's template strings); the more there are, the less a line can be split by looking at it alone. KSPL's only comment is `//` ([`../../docs/SPEC-language.md`](../../docs/SPEC-language.md)'s "Line comment"), so a KSPL source carries nothing over.

**The keyword list is a copy.** ksplc cannot be imported, so copying is the only way, and a copy drifts silently. Add a keyword and kspage reports no error; that one word just has no colour. So a check holds the two together ([`../../tests/suite/keywords_test.kspls`](../../tests/suite/keywords_test.kspls)), and the source is the output of `ksplc info keywords`.

### A text's colour is chosen from the background behind it

**The colour a text is painted in is chosen from the ground colour behind it**: the fill where the style gives one, otherwise the reader's theme ([`model/style.kspls`](../model/style.kspls)'s `dark_ground`).

**Do not fix one set of colours.** A set readable on light paper sinks into a dark ground and cannot be read, and a dark theme exists. Nor are the colours taken from the theme, as VS Code's theme holds the text colours (`tokenColors`). That would add one more thing to save in the document.

**Each set is picked by hand.** Derived by shifting lightness, colours turn muddy and hard to read. The diagnostics' mark colours come from the same place, since a red readable on light paper sinks on a dark ground.

**Do not decide the colour in the drawing code**, which would make a second source. The cost is per box, inside the fixed amount per box that every layout of the whole document pays ("Accepted limit 1: typing one character lays the whole document out again" below).

### Pointing at the source and showing it

**The direction and the grounds** for tying a design document to the source are [`../../docs/DESIGN.md`](../../docs/DESIGN.md)'s "12.3 Linking a design document to the source (no round trip)". Only kspage's own decisions are here.

**The document holds names only**: which file and which symbol, never a line number or the source text (the grounds are the root design's, above). The text is read and assembled at layout ("What layout recomputes every time" above).

**Two fields carry the pointer, chosen by what it hangs on.** A link's is the run's (`Run.href`). A window's and a figure's is the block's (`Block.aim`), since a window lays borrowed text down as a block, which a run's field cannot hold. Both carry the same `src:<file>#<symbol>` text, read and written in one place, [`model/source.kspls`](../model/source.kspls). Do not add a third: another carrier is another path through saving, export and comparison, all of them (Principle 6).

**Drop the `src:` mark on export.** It means something only on the screen, and exported it would be a link that cannot open; dropped, it reads as a file's path (enough in git).

**A symbol's extent is cut out by column**, on formatted text (`make fmt` fixes the columns). It runs from the declaration line to the line that closes at the same column, with `X.y` the `y` at column 2 inside `impl X`. Counting braces instead would need a tool that skips brackets inside strings and comments, a rebuild of what ksplc holds. Two `impl`s of one name can exist (`impl U8[]` and `impl U8$[]`). Where the first lacks the symbol, look in the next, or a function in the later one is reported missing. Take from the declaration line down only; finding where the comments and directives above it begin would make the answer depend on the number of blank lines.

| The kind | What it holds | What layout does with it |
| :-- | :-- | :-- |
| A link | the file's name and the symbol's name | hands them to whatever shows the text (the document does not open it) |
| A window | the same two | borrows that symbol's text and lays it down line by line |
| A figure | which figure it is | follows the imports and assembles the boxes and lines (the same shape as a joining line, using `tie_to`) |

Caution: **Where the target is missing, say so rather than showing nothing.** A deleted or renamed symbol is noticed by nobody unless it shows on the spot (as with Markdown's drops, "The mapping into Markdown" above). So a window lays down a block saying "that symbol is not there".

**The source text is not saved into the document.** Saved, there would be two texts and nothing to tell which is newer (why Markdown is not made a round trip). It exists only at layout, so `share/store.kspls` gains only the two names.

**A browser can read only a file a person has handed over**, not one it is merely told the name of; until then a window and a figure show "not handed over yet". Do not stall the screen waiting: the rest of the document lays out first.

**The core does not remember the text handed over.** If it did, it would hold "which file path it was", and a browser and a native window would diverge. It receives one row of bytes and returns byte positions inside it, so the page cuts the text as bytes too. Converted to a JS string first, the cut would drift by the non-ASCII characters in comments.

**The name handed over and the name pointed at are matched by their ends**, since the browser sets the name at hand-over. Handing a folder gives `kspage/model/doc.kspls`; handing files one at a time gives `doc.kspls`. An exact match comes first, then a match at the end. Where two or more match, refuse: "which one is unknowable" beats showing the wrong text.

**A window is one of the things that gather and line up**, like the contents list, the notes and the graphs, and it lays down no child of the document (its `Style.collect` is `source`). Its contents are in neither saving, comparison nor undo because there is nowhere to put them, not by a workaround. Nor does the cursor enter it, since its boxes point at no text in the document. A window is changed at the source.

**The text is borrowed at layout**, through an entry point shaped like the one that borrows measurements ([`model/font.kspls`](../model/font.kspls)'s `Font_source`), and received from outside ([`model/source.kspls`](../model/source.kspls)'s `Hand`). The boundary holds: the core opens no file, so the text is held outside even though a window needs it at layout. Only the files pointed at are handed over, since a whole folder would pile up unread texts. Nothing is handed to a layout made only to measure. A window in a cell sizes its column by the pointer's text, as a graph in a cell is measured with the body as its destination.

**A window whose text is not handed over is not left empty.** It shows its pointer line (`src:...#...`) as it is; otherwise nobody could tell "not handed over yet" from "nothing there". The page says which, since the core holds no words for a person.

**Export does not carry the text.** In HTML and Markdown a window becomes a link to its target, since a copy would go stale unseen where it was exported, the very thing this design avoids.

**A figure assembles the imports** (the direction of `import "..."`), not the calls. A call graph would need a tool that really parses the text, a rebuild of what ksplc holds. A column-cutting reader following expressions would mistake the insides of strings and comments for code. An import is one line at column 0, so the reading that cuts out a symbol serves.

**Build the boxes and the lines in the layout's arena.** Put into the document, they would double at the next layout and appear in saving and in comparison too; as with a window, by design there is nowhere to put them. Once assembled, they go to the absolute-coordinates layout, which decides each line's direction and arrow (no second way). Two styles are needed (the box and the line), and the line's name is built from the box's (`model/paint.kspls`'s `pull_line_name`). Do not build it in two places: the inserting code and the placing code both use this one.

Caution: **Report overflow as a count** (everything past the cap becomes one `+N` box). Cut silently, fewer imports would show than exist, and the figure would lie.

**The layout is fixed and automatic**: not movable by hand, and so never stale. Its ugliness is the price, since hand-set positions would create "the source changed after the figure was moved".

**What is pointed at can be inspected.** Windows, figures and links go into one list, each marked "not handed over yet", "found" or "that symbol is not there". Do not count the three kinds apart, or an inspection covering only one would say "everything has arrived". Keep "not handed over" apart from "the symbol is not there". Mixed, a forgotten hand-over and a rename would look the same, while their fixes are opposite (hand it over / change the document).

Note: This is what keeps "if what is pointed at is absent, it fails" ([`../../docs/SPEC-documents.md`](../../docs/SPEC-documents.md)'s "Linking documents to source"). Where an example is shown as a test's function, renaming that test makes the inspection say "that symbol is not there". **A copied example has no such alarm.**

**Only building from a table goes the other way**: the table is the origin, and the text is generated. What is built is one list of constants: the first column the name, the second the value, the first row the heading.

**It stays one list of constants, not general code generation, and its origin mark goes at the head of what is built**, one per file, as the root design says. Nobody can fix generated code that carries no mark.

Caution: **Count the rows refused.** Silently skipping a text that cannot be a name (not an identifier, or a duplicate) would drop something plainly written in the table from what is built.

A cell holding a computed value is written as a number: **the formula's result becoming a constant** is what joining a table to a text means.

**Put a freshness check beside it.** Where the table holds a target (`Block.aim`) and that text is handed over, the check compares it with a fresh build and says "the same" or "different". Without it, a changed table and a stale text would sit silently side by side until someone hand-edits the generated text.

**The built text is downloaded, not written into the source file**; writing it back is a stage in [`PLAN.md`](PLAN.md).

## If kspage is to become a code editor

`kssrv --local` answers the page's requests for files, folders, watching and processes, and the page uses them to open and save by path ([`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). Building and debugging, which a place for writing code needs, rely on starting a process.

### It is not a matter of a browser or a native window

VS Code's desktop edition is a browser too (Electron = Chromium + Node.js). Its terminal and debugger run because the Node in the same process can touch the OS. The edition opened in a browser (`vscode.dev`) has neither, and Microsoft's answer is "bring your own machine in over a tunnel". **So the dividing line is not a browser or a native window, but who gives the page what touches the OS.**

| The approach | What touches the OS | The trade |
| :-- | :-- | :-- |
| Put it inside Electron | the Node in the same process | the container is someone else's implementation, and what ships runs to hundreds of MB |
| **Run a `kssrv` locally** | the local server, over HTTP | one more executable to start |
| Move drawing to a native window | kspage itself | an IME per OS ("Why the browser is the main target" above) |

**A `kssrv` is run locally.** It already exists, and kspage refers to it within the reference direction ([`../../docs/SPEC-documents.md`](../../docs/SPEC-documents.md)'s "Reference direction between documents"; how is in "Where the protocol with the server is written down" below). It needs a browser: this approach ships none and uses the one on the machine.

### Who asks whom

The three flows are "Who asks whom" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md), and why **`kssrv` knows no document** is "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md). `kssrv` serving the page is also what lets the page ask at all, since the same-origin rule stops a page from `file://` asking another address. What the page may ask for, and why building, debugging and a language server get no entry point of their own, is the same document's "Only five things can be asked for". What keeps an entry point that starts processes from being open to anyone is its "Where it listens".

**Without a server, the code tools are folded away, and the page asks once whether a server is there** (the same document's "When it is not connected"). Asking at every press would make a person wait each time there is none. It asks `/api/status`, and 401 counts as "there". Folded into "not there", "there but without the token" would hide that reopening the URL is all it takes.

**The case with no server is checked too.** That nothing pressable-but-inert appears can be seen only where no server is, so two gates run: the page opened from `file://` (`make test-kspage-browser`) and the page a real `kssrv --local` serves (`make test-kspage-served`).

Note: The same sections run under both ([`../tests/browser/probe.js`](../tests/browser/probe.js)).

### kspage holds no language-server client

**kspage does not talk to a language server.** It leaves out semantic colouring, diagnostics, the explanation of what is pointed at, going to a definition, finding where a name is used, who calls it, renaming and completion.

**The aim decides it.** kspage stands in for Word, Excel and PowerPoint ("What it is aimed at" above). None of the three answers a question about a program's meaning, and whoever wants that answer already has an editor open. The VS Code extension in this tree is that editor's, and the one client belongs there. Held in two places, the one nobody reads drifts. That is why the checks in [`../../tests/support/conventions_lsp.kspls`](../../tests/support/conventions_lsp.kspls) hold the server against its client at all.

**Holding it would cost** the largest single cluster in kspage, and a wait in real time for a second program's answer. That wait reaches into the gates, where the served one cannot use the browser's virtual clock.

**What kspage keeps.** Colouring by lexeme ("Source colouring stops at lexemes and is recomputed at every layout" above): it asks nothing outside, works while the text does not parse, and makes a source readable inside a document. Find and replace, which changes text rather than names. Going back and forth: a cursor position is a line's number and a byte within it, because that survives reopening the document (`kspage_web_caret_spot` in `port/web/bridge.kspls`).

Note: What is lost against an editor is written where the reader will meet it, in the manual's "What it cannot do" chapter ([`content/manual_share.kspls`](../content/manual_share.kspls)), not only here.

### A plugin is a program on the machine, given the selected text

**What extends kspage is a program on the machine, and the whole agreement is "the selected text goes in, and what comes out replaces it".**

**It is the rule of holding no macro** ("What it does not hold" above), reached from the opposite direction. A plugin is not in the document and no document can name one. It sits beside the server, a person presses it, and nothing runs when a file is opened.

What a plugin may be, where it lives and why the page can name no path are "What may be launched" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md); the table is [`../../kssrv/proc.kspls`](../../kssrv/proc.kspls)'s.

Caution: **What comes out replaces the text only when the program ended cleanly.** Vim's `!` puts in whatever came out, so a program that failed loses the text and leaves its complaint in the document. Here a non-zero exit replaces nothing, and what the program wrote to its error stream is shown instead.

**A failing plugin is named**, so with several, "it did not work" says which. The wait has a cap, and a generous one. It is a safety valve against waiting for ever, not a measure of speed. Made short, it would cut off an ordinary plugin on a loaded machine and tell the person something false.

**With no server, the plugin set is not shown at all.** A page opened from `file://` can start nothing, so the menu would be a row that does nothing when pressed (Principle 5).

**The opening is narrow on purpose.** A plugin receives the selected text and nothing else. It cannot read the document's structure, apply a style or add a button of its own. Beside VS Code's extensions that is very little, and the narrowness is what makes a bad plugin harmless: the worst it can do is put in the wrong text, which one undo takes back.

Note: The language a plugin is written in does not matter, because the cut is at the protocol, not at a call. VS Code's extensions are JavaScript because they call its in-process `vscode` API, while LSP and DAP ask for no language (Microsoft itself ships a way to run a wasm language server). The plugins that ship are KSPL ([`../../tools/kspage_plugin_sort.kspls`](../../tools/kspage_plugin_sort.kspls) is the worked example, built by `make kspage-plugins`).

### What the process support underneath cannot do

1. **A process cannot be started on the LLVM backend** (`kspl_proc_*` always returns a failure). `kssrv` emits C and builds with `cc`, so kspage does not meet this; a `kssrv` built with LLVM would.
2. **A child's output cannot be waited on in the same loop that listens for connections.** `std/reactor` watches the connections' handles, and a child's pipe is read with a timeout. `kssrv` already narrows its wait to 2ms while it holds inference work, and the same means can serve a child. Making a pipe waitable beside the connections would be costly, because Windows' pipes are another mechanism.

Why output comes back as a response sent in pieces rather than over a WebSocket, and why the page asks for a change rather than watching through the OS, is in "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md).

### Where the protocol with the server is written down

**`kspage → kssrv` is not in the packages' reference direction.** Only the direction of import is allowed ([`../../docs/SPEC-documents.md`](../../docs/SPEC-documents.md)), and there is no import (HTTP joins them), so the only question is where the agreement lives.

**It lives in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)**, for the reasons "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md) gives.

## How the page is checked

kspage's checks on the built page live in `kspage/tests/wasm/` and `kspage/tests/browser/`. These sections say how each check keeps to a document of its own, and what a round that is cut short still reports.

### Each browser-check section has its own document

Caution: **A check on the page must not count on the document shown at startup, nor share a document with another section.** The startup document is the product's sample ([`content/sample.kspls`](../content/sample.kspls)), and it changes whenever what is to be shown changes. Counted on, fixing one paragraph of it fails a test that cannot say whether the rule broke or the sample changed; moving one heading fails cases in both folders. A shared document breaks the same way: a paragraph added for section A moves section B's measurements.

**How a folder keeps its sections apart depends on whether each can have a document of its own:**

| Folder | What it holds | How it keeps them apart |
| :-- | :-- | :-- |
| `kspage/tests/wasm/` | `make test-wasm`'s per-section code; `kspage/tests/wasm/shell.mjs` hands the entry points over, and `kspage/tests/wasm/material.mjs` assembles the documents | **Each section declares its own document** with `opens`, and the driver reads it before passing it on, so **a forgotten declaration fails the run** (a rule merely written down is not kept) |
| `kspage/tests/browser/` | `make test-browser` and `make test-served`, run on the assembled page in a real browser; `kspage/tests/browser/probe.js` runs the sections in the order of `KSPAGE_PROBE` in [`Makefile`](../Makefile) | The sections share one page, and **those holding asynchrony overlap**, so the document cannot be swapped: they **search for the place to press and to peek** instead (`findBlock` / `findCell` in `kspage/tests/browser/probe.js`) |

### A cut-off test round says how far it got

**The page also writes every mark to `console`, and the gate reads them back from the browser's standard error when no DOM arrives.** The `file://` page dumps its DOM only at the end, so a browser killed before then would leave only "it did not reach the marker". With the marks, the last one read is how far the round got.

**The hang itself is Chrome's.** `--virtual-time-budget`'s own description says "virtual time does not advance while network fetches are pending". `--timeout` does not cover that wait, since it races only the page's load. So a fetch that never settles pins the clock and nothing is dumped. Killing from outside is the only way out.

**Other test runners use this shape.** Chromium's own web-test runner reads the browser's standard error alongside the results, keeps its own deadline outside the browser, kills, and reports what came out before the kill. Playwright and Puppeteer (`dumpio`) keep the same way out, because any timeout put inside the browser can itself be what hangs.

**A way out used only in an emergency has to run on the ordinary round too.** The shape of the line Chrome writes is no contract and moves between versions. A reader left behind would cut out nothing and report "the page said nothing", on the one round where the trace was needed. So a round that passes compares the two lists, and the day the shape moves, a green round fails instead.

## The screen and its controls

What a user meets is the manual's to say ([`content/manual.kspls`](../content/manual.kspls)). This chapter holds what the page itself fixes that no chapter above says: where a control sits, what a key does, and the numbers the page holds.

### Where the controls sit, and the keys

* **The commands sit in six menus** (File, Style, Table, Insert, Share, Review), one open at a time. The frequent ones line up as icon shortcuts on the ribbon (`RIBBON` in `port/web/ribbon.js`). A shortcut presses the menu's own button, and so does its entry under `…`, so nothing is implemented twice.
* **Opening by path is the path field under "File".** The split view is under "Share": it pins the place in view below, for reading only. The note on the holder the cursor is in (a slide, a table, a picture) is under "Share" too. "Review" saves the current version and deletes a saved one. The cap is 8: past it the oldest goes, and the page says so. A table exports as `kspage.csv`. A slide is inserted from the template beside the button (one frame, a title and a body, a title and two columns). Each shape drawn brings one style named `figure-<the shape>`, and each chart one named `chart-<the way of gathering>`.
* **Ctrl+S saves, Ctrl+Z undoes, and Ctrl+Shift+Z or Ctrl+Y redoes** (Command on a Mac). Ctrl+F opens the find field (Esc folds it), and Ctrl+K opens the link field. Ctrl+B / I / U toggle bold, italic and underline, with the same rows as the menu's (`ACCENT_KEYS` in `port/web/keys.js` and `keys` in `port/web/form.js` are one list). A press with Ctrl (⌘) held follows a link. `Alt`+arrow moves the chosen frame, with `Shift` resizes it, and with `Ctrl` moves it 10px at a time. Delete or Backspace deletes a chosen shape (in a frame holding text, one character). Tab outside a table is not taken: focus moves to the next field, and no tab character goes in.
* **During a slideshow**, → ↓ and Space go to the next step or slide and ← ↑ to the previous. Esc returns to editing, and typing is shut off. Holding `N` shows the slide's note at the bottom. There is one screen, so nothing can be shown to the presenter alone, and an empty note shows no band (a black band alone looks like a mistake). In a document with no slides nothing happens.
* **The right-click menu on the body** carries a comment, a link and the style, and in a table cell the rows and columns.
* **Typing in the find field shows the count found at once.** "Replace all" touches the whole document, so how many will change is in view before the press. 0 is shown too, since a blank could not tell "not counted" from 0. What is counted is places found; a formula's run is found but not replaced, so fewer may be replaced. Overlaps are not counted, and it counts again on every redraw (about a tenth of a layout).
* **In the "Slides" tab a thumbnail is dragged to reorder**, placed by where it is dropped; moving it while dragging would shift it by however many it passed. A dotted frame shows where it will go, and it is one undo, since the order is the document's.

### The tools and the look

**The tools stay put while the body scrolls.** The menus, fields and ribbon stay at the window's top (`#chrome`) and the body passes under them. So scrolling to follow the cursor stops at the tools' bottom edge (`app.headRoom`); otherwise the place being typed would hide behind the tools. The checks hold the two rows under a cap (`chromeCap` in [`../tests/browser/ribbon.js`](../tests/browser/ribbon.js)).

**The cursor is a layer over the canvas**, so a blink repaints no document and shows on neither the page nor a thumbnail. The window scrolls to it only when it leaves the view. Scrolling every time would pull back, on every keystroke, a window moved to read. Right after a move, the cursor is always in view.

**⚙ remembers** the theme, how tightly the tools pack, the ribbon's shape and order, what is folded, the shape last used and the document's name (`localStorage`). It also says the document's own settings (the body's width, the pages, the margins, the styles) are under "File" and saved with it. The page's themes are `Standard` (fits the screen), `Mist`, `Ink` and `Page`, chosen under ⚙'s "The look". The document's are `Standard`, `Indigo`, `Vermilion` and `Serif`, at the top of the "Style" menu, and those names are the core's ([`write/theme.kspls`](../write/theme.kspls)).

**Only desktop Chromium can write a file back** (`showSaveFilePicker` / `showOpenFilePicker`). In Firefox, Safari and on a phone a copy is downloaded, and the page says so rather than switching silently. Retyping the document's name forgets where it writes back. That is "save as", and it has no button, since one thing is not done two ways.

## Accepted limits (what is decided not to change)

This chapter keeps the shortcomings **judged not worth their cost**, each with its grounds. Keep them rather than deleting them; without the grounds, the same point keeps coming back as "something nobody has got round to".

**It is not the list of what is still missing.** That is the manual's last chapter ([`content/manual_share.kspls`](../content/manual_share.kspls)), which also carries every item here that a user can see; left out, a user would hunt for it as their own mistake. Do not write the same sentence in both. The manual says what cannot be done, and this chapter says why it is decided not to change.

### Accepted limit 1: typing one character lays the whole document out again

**How it stands.** The calls that cross the boundary do not grow with the document ("Text that has not changed is not measured again" and "A style is looked up by name once" above), but what is walked is the whole document (`layout` in `lay/flow.kspls`). Retyping one paragraph takes time in proportion to the document's size.

**The cost of one relayout.** It is measured on 3,000 paragraphs of an unchanged document under native `ksplc run`, an unoptimised build, so absolute values run about 2.5 times wasm's; what counts is the ratios. The cost is a fixed amount per paragraph plus a fixed amount per box, nearly constant whatever the shape. The paragraph share stays in the low hundreds of nanoseconds, and the box share adds about as much again. The gathering done beforehand (headings, notes, running numbers, charts, references) is no hotspot either; stopping it saves only a small fraction of the fixed cost. So making one place faster does not help: both shares grow with how much is walked.

**A relayout that changed nothing costs the same**, so merely moving the cursor costs as much as typing. Moving the cursor, finding the place pressed, selecting and rereading the theme each lay the whole document out again. They are as frequent as keystrokes, so this limit cannot be weighed by typing alone.

**Four reasons for giving up:**

* **No document can make it too slow.** The heaviest document that can be opened takes about a third of the 16.7ms budget of one frame at 60 per second.
  * What is hit first is **the size cap**, where the document is refused rather than the page crashing ("Where memory runs short it refuses rather than crashing" above).
* **No hotspot can be pulled out on its own** (the breakdown above), so nothing but narrowing what is walked can speed it up.
* **Narrowing it means changing the model's invariants.** It needs "from where it changed", and guessing that from the text's contents does not work (a length or a fingerprint misses `ab` → `ba`). A version number per block drops nothing, but it cannot be made complete with `Block` as it stands: its fields are all `pub`, and rewriting also happens outside `write/`. Nor is the part before the change safe. Where the table of contents, the footnote list, a chart or a reference from the body stands earlier, it has to be laid out whole again.
* **Its way of failing is the worst of all.** A version number not raised "breaks quietly while staying fast", showing an old state. Putting it in first needs a check that relayout gives the same result as a whole layout ([`tests/relayout_test.kspls`](../tests/relayout_test.kspls)).

**What a narrower reach would stand on is there already.** The layout is a row of boxes piled fresh onto the arena, not a tree rewritten in place. So nothing is marked, and forgetting to mark a change cannot break it, whereas other editors lay out again from what they mark as changed. A box comes from only four inputs: its text, the width and style, the counts over the whole document, and the height it starts at. Where the four are the same, the box is the same to the byte, so once a changed paragraph keeps its height, nothing below needs laying out again.

**Narrowing is worth something only once the arena itself is wider.** The size cap, not the speed, is what a document meets first.

**Do not add a risky cache.** Showing an old state is the worst breakage an editor can have. The rewind that exists (`Placed` / `rewind` in `lay/flow.kspls`) serves trial layouts partway through a layout, not reuse across keystrokes.

### Accepted limit 2: another document cannot be shown inside one window

**How it stands.** What it would take lies in the page, not the core. The page already starts a second core ([`port/web/diff.js`](../port/web/diff.js)'s `ui.boot`, which draws an earlier version). What stands in the way is the tools reaching the DOM by id: hundreds of `getElementById` calls, of ids and of calls to `app`, and the parts wired to `ui`.

**Two reasons for giving up:**

* **A second pane that takes typing is large.** Every lookup by id would have to ask which pane is current, or the ids would be kept in two sets, and every part wired to `ui` would be touched.
* **A second read-only pane is small, but buys almost nothing.** Another document already opens in another window (from a link inside a document, or with `?doc=` when the server serves the page). There the size, the arrangement and a second screen are all real. Another place in the same document is the split view's job ("A read-only split view shows another part of the same document" above). With two means already there, a third goes against Principle 6.

## Further reading

* [kspage](../README.md) — what is here, and the smallest example.
* [`PLAN.md`](PLAN.md) — what is left.
* [`../../docs/DESIGN.md`](../../docs/DESIGN.md) — the Development Principles that apply to all of Kanso, and the grounds of the language design.
* [`../../std/docs/DESIGN.md`](../../std/docs/DESIGN.md) — the design of the standard library kspage stands on.
