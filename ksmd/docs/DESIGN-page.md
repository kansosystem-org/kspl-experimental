# The ksmd editing page

**This document says why the editing page in a browser works the way it does**: its input, its menus, its tables and its tools. The document language, the model, the editor's actions and the file lifecycle are in [`DESIGN-ksmd.md`](DESIGN-ksmd.md).

## Input, menus and tables

`ksmd/port/web/` holds the page: `bridge.kspl`, `bridge_tables.kspl` and `view.kspl` built as wasm32, and the script and style that show the model. `make ksmd-web` builds it as `out/ksmd/web/ksmd.html`.

**Text arrives through `beforeinput`, which the page cancels.** The page runs the matching action, renders the blocks it changed, and puts the selection back from model spots. So the browser's own undo has nothing to undo. A dropped item is refused.

**An input method's composition is the one edit the browser makes itself**, since it cannot be cancelled. While a composition lasts, the page renders nothing and runs no action. When it ends, the page waits one turn, then takes the change in the element's text as one transaction. The key press that starts an input method deletes a selection first.

**The selection is two model spots.** A spot names a block, a list item and a UTF-8 offset into its text, or a gap. The page maps between spots and places on the page at each action, and keeps no place across one.

**Only the blocks an action changed are rendered again.** A table edit shows every table again, since a value can depend on another table.

**The menu bar holds every command: File, Edit, View, Insert, Format and Table.** Each item shows its icon, its name and its shortcut. One list in `ksmd/port/web/commands.js` gives each command its name, key and icon, and builds the menus, the right-click menu and the quick access bar. Open and Save stand in File only where the local server opens files.

* **A menu opens on a press of its name, not on pointing.** While one menu is open, pointing at another name opens that one. A flyout opens on pointing, on a press, or with Right.
* **Esc, a press outside and a chosen command close every menu**, and the focus goes back where it was. The arrow keys move through the menus and flyouts.

**A table command that cannot act is disabled, not hidden**, so the menu does not change shape.

**A right-click on a cell, a row number or a column letter opens the table menu at that place.** It chooses that cell first, but keeps a chosen range it falls inside. Shift+F10 or the menu key in an open cell opens it too. It holds the Table menu's commands (`TABLE_GROUPS` in `ksmd/port/web/commands.js`). Rows, Columns and Note stand in the menu itself, and the other groups are flyouts, so the menu fits a window 600 pixels tall.

**A command's key stands beside its item, and the same list runs it from a cell**, so the two keys cannot differ.

**A table shows as an HTML table of calculated values**, with column letters and row numbers. The row of names under the letters is the table's heading. A press chooses a cell. A double press or F2 opens it in an input of its own. Typing on a chosen cell replaces its value. Enter, Tab and the arrow keys move the choice, passing over hidden rows. Esc drops the open cell's edit. The arrow keys past the first or last row leave the table for the gap there.

**Left and Right move the caret inside a cell's text, and move to the next cell at the text's edge.** A cell opens with all its text selected, so Left and Right then move to the next cell at once.

**Sorting orders a table's data rows by the chosen cell's column, as one step of undo.** Numbers come first, smallest first, then text from A to Z without regard to case, then `false` and `true`, then errors. Descending reverses that order. Empty cells stand last either way. Rows with equal values keep their order, so a sort by one column after another sorts by both. A formula sorts by its calculated value.

**A column filters from its heading.** Each name carries an arrow, and pressing it opens a panel under that column (`ksmd/port/web/filter.js`):

* The panel holds the two sorts, Clear filter from this column, a search box, and the column's values with tick boxes. OK applies them.
* A condition is folded away under the list: is, is not, contains, is greater than, is less than, is empty, is not empty.
* Typing in the search box narrows the list shown, and never unticks a value.
* The values are listed in the order the column sorts in. Values that differ only in case are one value, and empty cells one value listed last. The list stops at 1,000 values and says so.
* **A column's dates stand in a tree: years, then months, then days.** Each year and month starts folded, and its button or Right and Left open and fold it. A month is named in the browser's language. A day stands by its date, whatever format its cell shows it in, so a year stands once.
* **A year's or a month's box ticks every day under it.** Where only some are ticked, it shows a mix, as (Select all) does.
* **A search opens the years and months that hold a match**, and hides those that hold none. A day matches by its whole date, `2026-01-15`, or as its format shows it.
* **The column's other values, text, numbers and blanks, stand after the tree, as a list.** A date column that holds a stray text keeps it in sight to be ticked or not.
* **The tree is a way of listing, so the filter stays a set of ticked values.** A year ticked whole holds its days as they stand, and a date added later is not in it.

**Each column holds one condition, and a row shows when it meets every column's.** A narrowed column's arrow is marked, and a line above the table says how many rows are shown. The right-click menu's Filter group opens the same panel, and can show only the rows with the chosen cell's value.

**A filter is kept in the file, so a document opens with the rows it was left with** (`filter` in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)). A person who narrowed a long table to their own rows finds it so the next day, as in Excel.

* **The next reader sees at once that rows are hidden.** The line above the table says how many of how many rows show, and its Show all rows takes the filter away.
* **The file still holds every row**, and a formula counts every row, shown or not. Only the page hides them.
* **Each change of a filter is one step of undo**, since it changes the file.
* **A new row takes the filter away, in the same step of undo as the row.** The filter would hide the empty row at once. One undo brings back the filter and takes the row away.
* **With no value ticked and no condition, OK cannot be pressed**, as in Excel: no row would show. A condition counts once its value is typed, or at once for is empty and is not empty.
* **In Read-only, a filter is the viewer's alone.** It narrows the rows for them, and the file keeps its own. Editing again shows the file's.

**Under the menu bar stands a quick access bar: one row of the tools the person chose, as icons.** The menus hold every command, so the bar needs only the few a person uses most. View, Quick access bar opens the chooser, and a right-click on a command adds it or takes it off. The bar keeps the menus' order, and a tool its menu hides stands nowhere on it.

**The bar shows what stands at the caret.** The kind of block shows in its list. A mark, a kind of list and an alignment are pressed in where all the selected text has them. At a caret, they are pressed in where typed text would take them. A tool that cannot act there is greyed out.

**The choice of tools is this browser's own**, so nothing goes into the file. Reset brings back the tools every page starts with (`QUICK_DEFAULT` in `ksmd/port/web/commands.js`).

* **The font colour acts on the selected text or the chosen cells; fill and size act on cells alone.** With nothing selected, a colour applies to the text typed next; Automatic takes it away.
* **The colour tools are split**: the face applies the colour shown on it, and the arrow opens a palette.
* **Clear format takes colours, size, alignment and a cell's own number format away in one step.** In text it takes the colour and the paragraphs' alignment away; the marks stay, as part of what the text says.
* **Paragraph (Ctrl+Alt+0) turns every selected block back into a plain paragraph, in one step.** A heading, a list item, a checklist item, a quote and a code block all go. Ctrl+Alt+1 to 6 make headings.
* **Clear format leaves the kind of block**, as it leaves the marks. A heading and a list say how the text is built, and the contents are made from the headings. A command that cleared both would turn a whole document flat in one press. So clearing the kind is one command and clearing the look another.

**A look acts on the cells where a cell was worked in last, and on the selected text otherwise.** Alignment on text aligns the paragraphs and headings the selection touches.

**Shift+click chooses a range of cells from the chosen one, and so does a drag across cells** ("Ranges of cells" below). Once the drag reaches another cell, the open cell closes unchanged, and the range follows the pointer until the button comes up.

**The Number format group sets the format of the chosen cells in one step**, or of columns chosen whole by their letters. Currency asks for a code, and takes no places for JPY and KRW and two for every other code. The filter panel lists and matches the text a format shows. So a change of format takes the filter of each column it reaches away, in the same step: its entries would match no row.

**Three ways choose a whole table: Ctrl+A twice in a cell, the corner left of its column letters, and Select table.** Select table stands in the Table flyout. The first Ctrl+A chooses the data cells, as in Excel, and the second adds the names. A frame shows round the table. Only these three choose it whole: in a table with no data rows, a press on a name chooses that cell alone.

* **A copy of the whole table carries it three ways**: as ksmd's own source (`application/x-ksmd`), as tab-separated rows, and as an HTML table. A spreadsheet takes the rows, a word processor the HTML, and ksmd its own source, so nothing is lost between two ksmd documents.
* **A paste of it in text puts the same table after the caret's paragraph**, as one step: its formulas, looks, formats, widths, heights and filter. A paste on a whole table chosen puts it after that table.
* **A name another table has gains `_2`, `_3` and on**, and the table's own formulas follow the new name. `_` keeps a plain name plain, so a formula still names it without quotes.
* **Delete, Backspace and Cut on the whole table remove it, as one step.** On the data cells alone, Delete clears them, as it clears any range. Word's Delete clears a selected table's text and only Backspace removes it, which people find hard to tell apart.
* **The caret takes the table's place** ("Removing a whole block" below).

**Ctrl+C on a range puts its values on the clipboard as tab-separated rows**, which a spreadsheet takes, each number as calculated. A paste of such rows fills the table from the chosen cell, as one step, growing the table as needed. Each pasted value reads as typed text does, and `1,234.5` is a number. Rows pasted into text make a new table, whose first row gives the names.

**The document fills the window's width by default, with a margin of 32 pixels**, so a table has a spreadsheet's room. View, Reading width keeps lines about 50 characters long instead, for long prose. The choice belongs to the browser, not to the document.

**Ctrl+; types today's date, and Ctrl+: the time**, in a cell and in the text; the Insert menu holds both. They are written `2026-10-23` and `14:05`, ISO 8601's forms. In a cell, the date is a date and the time is text.

**A double-click on a column's border fits the column to its widest value on one line.** The table keeps its width, and the other columns share what is left in their proportions. The fit saves as `widths`, in one step of undo.

**Column width… and Row height… ask for a number**, as Excel's dialogs do. Both stand in the Size flyout of the Table menu and the right-click menu, beside Fit column width. Each change is one step of undo.

* **Column width takes a percent of the table's width, from 1 to 99, with at most one decimal place.** The chosen columns each take it, and the other columns share the rest in the proportions they have. With every column chosen, nothing is left to share, so a share that does not add up to 100% is refused with the reason. A table fills the width of its page, so a share is the one width that holds on every screen and on paper. Excel's characters would mean another width on each screen.
* **Row height takes whole points from 6 to 409**, saved in `heights` ("Model and editor architecture" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)). An empty answer takes the height away. The rows keep their heights on paper too.
* **Only the data rows in sight take the height**, as in Excel. A row a filter or a closed group hides keeps its own. Row height cannot be pressed on the names row, which takes the height its text needs.
* **A number outside the limits is refused, and the page says which numbers it takes.** Nothing changes then.
* **Neither has a key of its own.** Excel's Alt, H, O, W and Alt, H, O, H walk its ribbon, which the page does not have.

**A cell is chosen when the mouse button goes down, not on the click.** The press can remove a gap above the table and move the table up a line, so no click would come. For the same reason, the second press of a double-click opens the cell the first chose.

**While a person works in a table, the page draws no caret in the text.** A caret beside a table would stand in a gap, which would push the table down a line after each action. So the keys go to the chosen cell. Esc, a press in the text, and an arrow key past the table's edge leave the table. The caret then comes back where the model holds it.

**Dragging the edge between two column letters resizes the two columns beside it**, and every other column keeps its weight. When the button comes up, the table's `widths` change in one step of undo.

* **The page turns pixels into weights.** A table without `widths` first takes weights from its columns' widths on the page, about 1,000 in all.
* **All weights are multiplied by one whole number before the two columns share theirs.** The two then have about 1,000 steps to share, and the other columns keep their proportions exactly.
* **No weight passes 10,000 or falls below 1**, the bounds the reader takes.

**In a cell, chosen or open, Alt+Right makes its column wider and Alt+Left narrower, by a twentieth of the table's width.** The width comes from the neighbouring column. Each press is one step of undo. The keys work in the cell because a keyboard already reaches it; a focusable edge would be one more Tab stop on every table.

**Removing a whole block puts the caret on the block that takes its place** (`remove_whole` in `ksmd/edit/editor.kspl`). That is the start of the text after it, else the end of the text before it. A table, chart, image, include or divider goes this way, by its Remove button, the table menu, or Delete on a whole table.

* **The window scrolls only as far as it must to show the caret.** The person goes on working where the block stood, not at the top of the document.
* **The caret takes a gap only where no text stands on either side**, as in an empty document. A gap shows as an empty line, which looks like a paragraph no one typed.

**An image and an include show what their clauses say.** Opened from a file, the page shows an image's path, alternate text and caption, and a marked box naming an include's path. Served by the local server, it shows the image and the included blocks in place ("The file lifecycle" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).

**A paste takes the clipboard's plain text.** Each line starts a block of the caret's kind. When the clipboard also held formatting, the page says that it was not kept.

**The page is built as wasm32 with no C library**, using clang's bulk-memory instructions to copy and fill memory. **It is one file**: `ksmd/port/web/bundle.kspl` puts its style, its scripts and its wasm, as base64, inside `ksmd.html`. So the page opens from a file, and the local server hands it out alone.

**Opened from a file, the page reaches no file: a host opens and saves through two calls.** `ksmd.load(source)` opens a source, or names the line and column it refuses. `ksmd.source()` returns the canonical source to save, and `ksmd.onchange` learns of each change.

**The editor's memory is a fixed 128 MiB.** An action that starts with less than 16 MiB free is refused, and the page asks the person to save and open the document again. The document and its whole history stay in that memory until another document opens.

## Ranges of cells

**A range of cells runs from the chosen cell to a far corner.** Shift+click and Shift with an arrow key reach it from the chosen cell. A press on a row number chooses that row, and one on a column letter that column's data cells. Shift with either press reaches from the chosen cell's row or column.

* **The range keeps the identities of its rows and columns, as a formula's range does.** A row added above it, a sort or an undo leaves it on the same cells.
* **On a chosen cell that is not open, the keys act on the range.** Delete and Backspace clear its cells as one step, and each cell keeps its look. A typed character opens the chosen cell with that character in place of its value.
* **An input method composes from the first key.** The focus stands in an invisible text box over the chosen cell, since Windows keeps an input method off where no text can be typed. What is typed or composed there opens the cell, and the box becomes its input, so a composition goes on unbroken.
* **Copy, cut and paste act on the range.** A paste of one value fills every cell of the range. A paste of rows fills the table from the range's corner.
* **A look applies to every cell of the range in one step.**

## Filling cells

**Ctrl+D fills a range down from its top row, and Ctrl+R right from its left column.** A range of one row fills down from the cell above it, and a range of one column right from the cell left of it. The right-click menu holds both, and each fill is one step of undo.

* **Each cell is copied through the model's copy of a cell** (`copy_cell` in `ksmd/edit/edit.kspl`), look included, so references shift as a copy shifts them.
* **A fill is refused whole.** A copy that would write a formula longer than 4,096 bytes puts back every cell copied before it.
* **A drag of the square at a range's lower right corner goes on with a series, where the cells make one, or repeats them.** Ctrl+D and Ctrl+R always copy (`ksmd/edit/series.kspl`).
  * **Two or more numbers with one step between each go on by that step**: `1, 2` gives `3, 4`, and `10, 7.5` gives `5, 2.5`. The arithmetic is in decimal digits, so `0.1, 0.2` gives `0.3`.
  * **Text that ends in a number goes on by its step, or by one from a single cell**: `Item 1` gives `Item 2`, and `Q1, Q3` gives `Q5`. A number with leading zeros keeps its width: `Week 08` gives `Week 09`.
  * **Anything else repeats**: one number alone, numbers whose steps differ, a formula, a mix of kinds, and a date or a time written as text. A date cell goes on by days. Steps that differ repeat rather than fit a straight line, so a person can work out every value from the cells.
* **Ctrl+D and Ctrl+R act only while a cell or a range is chosen.** Elsewhere the browser keeps them.

## Exporting a table

**The right-click menu's Export as CSV downloads the table**, so another program can take its values.

* **The file holds the names, then each row's calculated values**, every row whether hidden or not. A number is written before any format, with `.` for its point and no separators.
* **A value is quoted only where it holds a comma, a quote or a line break**, and a quote inside is doubled. Lines end in CR LF, as RFC 4180 writes them.
* **Text that starts with `=`, `+`, `-`, `@`, a tab or a CR gets a `'` before it, and is quoted.** A spreadsheet would run such text as a formula, and a formula can open a link or start a program. A number is never changed, so `-5` stays a number.
* **The file is UTF-8 with a byte order mark.** Without one, a spreadsheet can read the bytes in the computer's own code page, and text outside ASCII comes out wrong.
* **The file is named after the table**, with the characters a file name cannot hold made `_`.

## Find and replace

**Ctrl+F opens a find bar under the quick access bar, and Ctrl+H opens it with its replace part.** The Edit menu and the bar's Find tool open it too. A short selection on one line becomes the search text.

* **Find looks in the text the page shows, and in each cell's text as a person edits it.** So a formula's source is searched, and its calculated value is not.
* **A match can cross formatting**, but stays inside one paragraph, heading, list item, code block or cell.
* **Without Match case, each character is compared in lower case, alone**, so a match keeps the text's own places in every script.
* **Enter and F3 go to the next match, and Shift+Enter and Shift+F3 to the one before.** The bar says which match is current, and of how many. Esc closes the bar and selects the current match.
* **The matches show through the browser's highlights, which add no element**, so the find bar never disturbs an input method's composition.
* **Only Replace and Replace all change the document.** Replace all changes every match as one step of undo, prose and cells together.
* **The new text takes the marks of the first character it replaces.** So a bold word stays bold, and text inside a link stays in the link.
* **A replace is refused whole**, as every action is. A cell text the file cannot hold, or a match that no longer stands where it was found, changes nothing.
* **Find does not look in an included file's blocks, nor in rows a filter hides.** An included file edits in a tab of its own, and Replace all changes nothing a person cannot see.

## The heading row of a long table

**A table's column letters and names stay in sight under the header while the page scrolls through the table** (`position: sticky` on the table's `thead`).

* **A table never scrolls in a box of its own.** A box would take the mouse wheel in the middle of a document, and its heading would hide under the header. A table wider than the page reaches past it, and the page scrolls sideways.
* **Every table's heading sticks, and no source notation chooses it.** A choice per table would change the file for a way of looking.
* **On paper, the browser repeats the `thead` on each page.**

## Colour rules on the page

**The right-click menu's Columns group holds Colour by value…, which opens a small panel over the table.** It holds the condition (below, above, equal to, empty, or no rule), its value and a style. The styles are ready-made pairs, such as a light red fill with dark red text, so a person picks one rather than two colours. Apply sets the rule as one step.

## Notes on the page

**A cell with a note has a red corner, and a paragraph or a heading with one has a bar at its left.** Pointing at it shows the note.

* **Insert, Note asks for the note of the chosen cell, or of the paragraph the caret stands in.** An empty answer resolves it.
* **The table's right-click menu holds Note… and Resolve note.** Each change is one step of undo.

## Choices on the page

**The right-click menu's Columns group holds Choices…, which asks for the column's list as one line**, such as `Open, In progress, Done`. An empty line clears it.

* **An open cell of the column offers the list while one types** (an HTML `datalist`).
* **A value off the list stays in its cell to be put right, and the page says why.** Esc, or leaving the cell, drops it.
* **A cell that holds a value off its column's list has a wavy underline**, and its title names the choices.

## Groups of rows on the page

**A table's outline stands left of its row numbers**: one column of marks per level of groups (`outline.js`).

* **Each group has a button on the row above it: − while its rows show, + while they are hidden.** A hidden row could not hold the button. A line runs down beside the rows of a group that shows.
* **The right-click menu's Group flyout holds Group rows (Alt+Shift+Right), Ungroup rows (Alt+Shift+Left), Hide detail and Show detail.** They act on the chosen cells' rows.
* **A row shows only when neither a hidden group nor a filter hides it.**

## AutoSum

**Sum (Alt+=) puts a total in the chosen cell** (`autosum.js`). The AutoSum flyouts of the Table menu and the right-click menu also give Average, Count numbers, Max and Min.

* **In one cell, it types `=sum(...)` over the whole column above, and leaves the cell open with the range selected.** Enter takes it, and typing changes the range. Where nothing stands above, it takes the row to the left.
* **The range is the whole column above, not the numbers up to the first gap**, which would leave out the numbers above an empty cell. The names' row is never in the range.
* **With a range chosen, each column of numbers gets its total under them, as one step.** The total goes in the range's last row where that row is empty, or else in the row under it. A row that holds a value is never written over.
* **A row added after the last row of the sum stays outside it**, as "How references follow edits" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md) says.

## Print and PDF

**File, Print or save as PDF (Ctrl+P) opens the browser's print dialog, which also saves a PDF.** Print and PDF are one output, made by the same rules.

* **The output shows the document, and nothing only editing uses.** The menus, the bars, the status line and the contents go. So do the column letters, row numbers, table names, filter marks and block buttons. An include's frame, the marks of notes and choices, and the chosen cells go too.
* **Rows a filter or a closed group hides stay hidden on paper**, so a printout shows what the person sees.
* **A divider ends a page.** Its line still shows at the page's end.
* **The page always prints light, and the author's fills and colours print as the page shows them.** The browser would otherwise leave background colours out.
* **A table fits the page.** A number or a date stays on one line, and a long word, such as a URL or a path, breaks where it must. The width left over goes by the columns' weights.
* **The row numbers' column keeps its place with no width**, so no value moves under another column's name.

**A table, chart, image or include can be left out of the output: `invisible="printing"` in its clause.** A table that only feeds a chart is the usual case. It still calculates, and the chart still draws from it.

* **The attribute names the exception, so a new block is in the output until its author says otherwise.**
* **While editing, such a block has a dashed frame and the words "Not in print or PDF".**
* **The table menu's Table flyout holds Leave out of print. A chart, an image and an include have the button beside Remove.** Each change is one step of undo, and the button reads Put back in print once it is set.

## Repeat

**With nothing to redo, Redo becomes Repeat: Ctrl+Y or F4 does the last command again where the person works now.** Insert column right then F4 inserts another column; Bold on one word then F4 makes the next selection bold.

* **The button reads Repeat while it repeats, and Redo while something is left to redo.**
* **A command that asks for something is not repeated**, such as Rename or a note. Nor are typing and pasting.
* **Any other change forgets what would be repeated**, so F4 never repeats a command from before the person typed.

## Read-only

**View, Read-only shows the document and takes no edit**, so a person reading a file changes nothing by a stray key.

* **Every action that changes the document is refused at one place**, the call that runs it, so no key, paste or drop gets past. The commands that edit are greyed out.
* **What only looks still works**: finding, filters for the viewer alone, the contents, printing, saving a copy and exporting CSV. A press on a cell chooses it without opening it.
* **A press on a link opens it in a new tab.** While editing, Ctrl+press does. The page's own tab never follows a link, since it holds the unsaved edits and the local server's token.
* **The choice is this browser's own and is kept.** Nothing goes into the file.

## The figures in the status line

**With two or more cells chosen, the status line's right end shows their sum, average and count** (`figures.js`).

* **The sum and average take the numbers alone. The count takes every cell that holds a value.** Rows a filter hides are left out.
* **Otherwise it shows the words and characters of the selection, or of the whole document.** A word is a run of letters or digits. Japanese has no spaces between words, so the count of characters stands beside it.

## A dark scheme

**The page follows the system's choice of a light or a dark scheme** (`prefers-color-scheme`), with no switch of its own.

* **The page's own colours are tokens, and the dark scheme gives them other values.** The document's colours are the author's, and a print shows them.
* **A cell with a colour or a fill of its own keeps a white ground and dark text in both schemes.** Yellow text on a dark ground, or light text on a yellow fill, would be unreadable.

## The contents

**View, Contents shows the document's headings in a panel at the window's left**, each indented by its level.

* **A press on a heading scrolls to it, and puts the caret at its start.** A heading from an included file only scrolls, and its file's path stands beside it.
* **The heading being read is marked as the page scrolls**: the last one above the top of the reading area.
* **The list follows every edit.** An action that changes no heading builds no list.
* **Whether the panel shows is kept in the browser's storage, for each viewer.** Where storage is off, the panel starts hidden.
* **The edge between the panel and the document drags to change the panel's width**, from 160 to 480 pixels. The document keeps at least 400 pixels beside it. Below 48rem the panel lies over the document instead.
* **The edge is eight pixels wide** and shows itself when pointed at, so it is easy to hit, unlike a one-pixel border.
* **The edge is a separator that Tab reaches.** Left and Right move it by 16 pixels, and Home and End go to the limits. A double-click gives the first width, 240 pixels, back.
* **The width is kept in the browser's storage, as whether the panel shows is.** It is a way of looking, so the file never holds it.

## A touch screen

**On a touch screen, a long press on a cell opens the table's menu, and a double tap opens the cell** (`touch.js`).

* **A single tap chooses the cell**, through the mouse events the browser makes of a tap.
* **A finger that moves more than a few pixels scrolls**, and presses nothing.
* **A cell takes no text selection and no callout of its own**, so the system's menu does not cover the table's.
* **In a narrow window the quick access bar is one row that scrolls sideways**, so the document keeps the height.

## The page and its files

Served by the local server, the page opens and saves files itself ("The file lifecycle" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)). This section gives the page's own choices.

* **One tab holds the server open for all the page's tabs on it.** A browser opens six connections to one server, so a hold in each of six tabs would leave no connection for a save. The tabs share one lock (`navigator.locks`).
* **Text typed in a cell still open is unsaved at once, and its draft holds it** beside the document's source. Taking the cell to hold a draft would close it under the person's typing.
* **A draft brought back first holds aside the edits made since the document opened**, as a draft of their own. So neither version is lost.
* **The open document's path, its file's digest and its saved text are one record in `ksmd/port/web/file.js`, changed in one place.** The editor, the menu bar, the window's title and the address follow from it, so the address cannot name a document that did not open.
* **A change time in the same second as the ask cannot rule out a later write**, since the server gives whole seconds. Until an ask comes in a later second, and once after its own save, the page compares the file's bytes too.
* **Whether a draft is held is the answer of the last write, not whether the browser has storage.** A browser whose storage is full opens its store, but every write fails.
* **Where no draft could be held, leaving a document with unsaved edits asks first**: save, discard, or cancel. A change on disk then offers to load the file's version only as a discard.
* **Leaving the page asks first while no draft holds the latest edits**: in the second after typing, and where no draft can be held. A draft written as the page goes may not land before the page closes.
* **A document named in the address that does not open leaves the address.** The new document is then open, and its draft is offered.
* **Text typed in a cell that the editor refuses stays in its cell, and the draft holds it.** A save writes nothing, another document does not open, and a menu command does nothing until the text is put right or Esc drops it. A press in the menu bar or in a dialog leaves the cell open.
* **Save As into another folder writes each include's and image's path again, so it names the same file from there** (`ksmd/port/web/moving.kspl`). A save that fails takes the rewrite back.
* **Pasted text larger than a document can hold is refused before it reaches the editor's fixed memory.**

## What the editing page does not do yet

* It does not convert a rich paste; it takes the plain text and says so.
* Find has no whole-word search and no regular expressions. It does not search table names.
* A browser without the highlight API (`CSS.highlights`) marks no match in text. The current match still scrolls into sight, and the count still shows.
* A filter's hidden rows are filled as the shown ones are.
* Columns cannot be grouped; only rows can.
* It never trims the undo history. A long session can use up the editor's memory, and the page then asks the person to save and open the document again.
* The browser checks run in headless Chromium alone. Firefox, Safari, a real input method on a real keyboard and screen readers are not checked.
* A person switching tabs in a desktop browser is not checked: the checks send the focus event themselves, and hide the page by script.
