# The ksmd editing page

**This document says why the editing page in a browser works the way it does**: its input, its menus, its tables and its tools. The document language, the model, the editor's actions and the file lifecycle are in [`DESIGN-ksmd.md`](DESIGN-ksmd.md).

## Input, menus and tables

`ksmd/port/web/` holds the page: the `bridge*.kspl` files, `view.kspl` and `moving.kspl` built as wasm32, and the script and style that show the model. `make ksmd-web` builds it as `out/ksmd/web/ksmd.html`.

**Text arrives through `beforeinput`, which the page cancels.** The page runs the matching action, renders the blocks it changed, and puts the selection back from model spots. So the browser's own undo has nothing to undo. A dropped item is refused.

**An input method's composition is the one edit the browser makes itself**, since it cannot be cancelled. While a composition lasts, the page renders nothing and runs no action. When it ends, the page waits one turn, then takes the change in the element's text as one transaction. The key press that starts an input method deletes a selection first.

**The selection is two model spots.** A spot names a block, a list item and a UTF-8 offset into its text, or a gap. The page maps between spots and places on the page at each action, and keeps no place across one.

**Only the blocks an action changed are rendered again.** A table edit sends every table, since a value can depend on another table. The page draws again only a table whose JSON differs from the JSON it was drawn from. In a document of many tables, drawing and laying out the others again would take most of an edit's time, and change nothing that shows.

**The menu bar holds every command: File, Edit, View, Insert, Format and Table.** Each item shows its icon, its name and its shortcut. One list in `ksmd/port/web/commands.js` gives each command its name, key and icon, and builds the menus, the right-click menu and the quick access bar. Open and Save stand in File only where the local server opens files.

**A command's work stands in the script that does it, which registers it by name** (`ks.handle` in `ksmd/port/web/handlers.js`). The registration also says what the command needs: a chosen cell, Repeat, or nothing that edits under Read-only. That file only looks a command up, so a new command touches its list entry and its own script.

* **The page does not start while a command lacks a handler, or a handler its command.** An item that does nothing would otherwise be found only by pressing it.
* **The chosen cell has one keeper, `ksmd/port/web/table.js`.** Another script changes it through `ks.table.chooseCell`, and a plain write throws, so a wrong choice has one door to look at.

* **A menu opens on a press of its name, not on pointing.** While one menu is open, pointing at another name opens that one. A flyout opens on pointing, on a press, or with Right.
* **Esc, a press outside and a chosen command close every menu**, and the focus goes back where it was. The arrow keys move through the menus and flyouts.
* **A menu taller than the window scrolls**, so its last item can still be reached. A flyout stands against the window beside its name, so a scrolling menu does not cut it off, and scrolling closes it.
* **Edit holds Cut and Copy, which run the browser's own cut and copy.** So each acts as its key does where the focus stands, and a touch screen without keys reaches them.
* **Paste stands after them, and reads the clipboard through the browser, as Excel for the web does.** It hands what it read to the place the focus stands, as a paste with Ctrl+V would. So it acts as Ctrl+V does there, through the same code.
  * **A browser may ask the person first, or refuse.** Without Paste, a person whose mouse is in hand, or who has no keys, has no way to paste.
  * **Where the browser refuses, or cannot read the clipboard, the page says "Press Ctrl+V to paste." and changes nothing.** A cut that waits in the page still moves, since it needs nothing from the clipboard.
  * **The browser hands a page only plain text and HTML.** So a whole table copied in another page pastes from the menu as tab-separated rows, and whole with Ctrl+V.
  * **Cells copied in the same page still paste from the menu with their formulas.** The page keeps its last copy of cells, and finds it by the clipboard's text ("Copying and pasting cells" below).
  * **A whole table copied or cut in the same page pastes from the menu as the same table.** The page keeps the last one in the same way, and finds it by its rows' text.
* **Paste values stands after Paste, and pastes as Ctrl+Shift+V does.**

**A table command that cannot act is disabled, not hidden**, so the menu does not change shape.

**A right-click on a cell, a row number or a column letter opens the table menu at that place.** It chooses that cell first, but keeps a chosen range it falls inside, and whole rows or columns chosen. Shift+F10 or the menu key in an open cell opens it too. Cut, Copy, Copy formula, Paste and Paste values stand first, as in Excel's cell menu. The two copies share one row, and so do the two pastes. The Table menu's commands follow (`TABLE_GROUPS` in `ksmd/port/web/commands.js`). Rows, Columns and Note stand in the menu itself, and the other groups are flyouts, so the menu fits a window 600 pixels tall.

**A command's key stands beside its item, and the same list runs it from a cell**, so the two keys cannot differ.

**A table shows as an HTML table of calculated values**, with column letters and row numbers. The row of names under the letters is the table's heading. A press chooses a cell. A double press or F2 opens it in an input of its own. Typing on a chosen cell replaces its value. Enter, Tab and the arrow keys move the choice, passing over hidden rows, except in a cell opened to edit (below). Esc drops the open cell's edit. The arrow keys past the first or last row leave the table for the text there.

**Alt+Enter types a line break inside an open cell**, as in a spreadsheet, and the cell shows its lines. A line break typed into a cell that held none turns its Wrap text on, in the same step, as Excel does. Unwrapped, the lines after it would run past the column and be cut. The open cell's box is as tall as the lines it shows, those its column's width breaks included. So no line scrolls out of sight while the cell is edited.

**An open cell has Excel's two modes.** A cell opened by a double press or F2 is *edited*. Every arrow key, with Shift or Ctrl or neither, then works on its text, and the caret never leaves the cell. A cell typed into is *entered*. Up and Down then take the text and move to the next cell. Left and Right move the caret inside the text, and to the next cell at its edge. F2 in an entered cell edits it. Enter, Tab and Esc act the same in both.

**Sorting orders a table's data rows by the chosen cell's column, as one step of undo.** Numbers come first, smallest first, then text from A to Z without regard to case, then `false` and `true`, then errors. Descending reverses that order. Empty cells stand last either way. Rows with equal values keep their order, so a sort by one column after another sorts by both. A formula sorts by its calculated value.

**A column filters from its heading.** Each name carries an arrow, and pressing it opens a panel under that column (`ksmd/port/web/filter.js`):

* The panel holds the two sorts, Clear filter from this column, a search box, and the column's values with tick boxes. OK applies them.
* A condition is folded away under the list: is, is not, contains, is greater than, is less than, is empty, is not empty.
* **"Is greater than" and "is less than" compare a number at the 15 digits it shows**, as a formula's `>` and `<` do. A colour rule compares so too. The page asks the editor (`ks.compareNumbers` in `ksmd/port/web/core.js`), so it has no rule of its own that could disagree with a formula.
* Typing in the search box narrows the list shown, and never unticks a value.
* The values are listed in the order the column sorts in. Values that differ only in case are one value, and empty cells one value listed last. The list stops at 1,000 values and says so.
* **Past 1,000 values, the search looks through all of them**, and lists the first 1,000 it finds.
* **A value the list never showed was never unticked, so it stays shown.** Past 1,000 values, OK keeps whichever is fewer: the values ticked (`in:`), or those left out (`out:`), which lets a value added later show. Up to 1,000, OK keeps the values ticked.
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
* **A new row keeps the filter, and shows until the filter is chosen again**, as in Excel. The filter would hide the empty row at once, and the person could not type in it. A value typed in the new row leaves it in sight.
* **A row is new where the table did not hold it when its filter last changed.** A row inserted, a row a paste adds past the end, and a row an undo or a redo brings back are new. A row moved by Insert cut rows is not, and the filter shows it as before.
* **A row whose values change stays as it was, shown or hidden, until the filter is chosen again**, as in Excel. A value typed, cleared or pasted that the filter would not take leaves its row in sight. A row that went from sight at once would hide the change the person just made.
* **Choosing the filter again applies it to every row**, as Excel's Reapply does. OK in its panel and Show all rows choose it again, and so does an undo that changes it. So does opening the document again: the file holds no mark of which row is new or changed.
* **The filter stays the same in the file**, and one undo takes away the new row alone.
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

**The Number format group sets the format of the chosen cells in one step**, or of columns chosen whole by their letters. Currency asks for a code, and takes no places for JPY and KRW and two for every other code. **Thousands takes no places** (`1,235`): it is chosen for counts, such as sizes in bytes, where places only add zeros. Excel's own key gives two; More decimal places adds them. The filter panel lists and matches the text a format shows. So a change of format takes the filter of each column it reaches away, in the same step: its entries would match no row.

**Three ways choose a whole table: Ctrl+A twice in a cell, the corner left of its column letters, and Select table.** Select table stands in the Table flyout. The first Ctrl+A chooses the data cells, as in Excel, and the second adds the names. A frame shows round the table. Only these three choose it whole: in a table with no data rows, a press on a name chooses that cell alone.

* **A copy of the whole table carries it three ways**: as ksmd's own source (`application/x-ksmd`), as tab-separated rows, and as an HTML table. A spreadsheet takes the rows, a word processor the HTML, and ksmd its own source, so nothing is lost between two ksmd documents.
  * **The rows and the HTML leave out the rows a filter hides, as any copy of cells does.** ksmd's own source holds every row with the filter, since a paste in ksmd makes the same table again.
* **A paste of it in text puts the same table after the caret's paragraph**, as one step: its formulas, looks, formats, widths, heights and filter. A paste on a whole table chosen puts it after that table.
* **A name another table has gains `_2`, `_3` and on**, and the table's own formulas follow the new name. `_` keeps a plain name plain, so a formula still names it without quotes.
* **Delete, Backspace and Cut on the whole table remove it, as one step.** On the data cells alone, Delete clears them, as it clears any range. Word's Delete clears a selected table's text and only Backspace removes it, which people find hard to tell apart.
* **The caret takes the table's place** ("Removing a whole block" below).

**Ctrl+C on a range puts its values on the clipboard as tab-separated rows**, which a spreadsheet takes, each number as calculated. Beside them goes what ksmd needs to paste the cells with their formulas ("Copying and pasting cells" below). A paste of rows from another program fills the table from the chosen cell, as one step, growing the table as needed. Each pasted value reads as typed text does, and `1,234.5` is a number. Spaces around a number or a date are left out, and text keeps its spaces. Rows pasted into text make a new table, whose first row gives the names. **An open cell takes the pasted text whole, line breaks included**, as Excel's cell does while it is edited. A person who pastes lines there means one cell's text. A chosen cell that is not open is where rows spread over cells.

**The document fills the window's width by default, with a margin of 32 pixels**, so a table has a spreadsheet's room. View, Reading width keeps lines about 50 characters long instead, for long prose. The choice belongs to the browser, not to the document.

**Ctrl+; types today's date, and Ctrl+: the time**, in a cell and in the text; the Insert menu holds both. They are written `2026-10-23` and `14:05`, ISO 8601's forms. In a cell, the date is a date and the time is text.

**A cell is chosen when the mouse button goes down, not on the click.** The press can remove a gap above the table and move the table up a line, so no click would come. For the same reason, the second press of a double-click opens the cell the first chose.

**While a person works in a table, the page draws no caret in the text.** A caret beside a table would stand in a gap, which would push the table down a line after each action. So the keys go to the chosen cell. Esc, a press in the text, and an arrow key past the table's edge leave the table.

* **Esc brings the caret back where the model holds it**, and the window stays where it is.
* **An arrow key past the table's edge puts the caret on the text beside it** (`select_beside` in `ksmd/edit/editor.kspl`). Down from the last row goes to the start of the text after the table. Up from the names goes to the end of the text before it. A gap shows as an empty line, so the caret takes one only where no text stands on that side.
* **The window scrolls only as far as it must to show the caret.** Focusing the document without that care scrolls a browser's window to the document's top.

**Removing a whole block puts the caret on the block that takes its place** (`remove_whole` in `ksmd/edit/editor.kspl`). That is the start of the text after it, else the end of the text before it. A table, chart, image, include or divider goes this way, by its Remove button, the table menu, or Delete on a whole table. An include, an image and a chart have a Remove button, since no text selection reaches inside them. The included file or the image file stays as it is.

* **The window scrolls only as far as it must to show the caret.** The person goes on working where the block stood, not at the top of the document.
* **The caret takes a gap only where no text stands on either side**, as in an empty document. A gap shows as an empty line, which looks like a paragraph no one typed.
* **A gap stays while the focus is in a bar, a menu or a dialog**, and while work that ends later shows the document again. The caret comes back there. Without it, the blocks below moved up a line, then down again as the focus came back. A press made then landed a row too high.

**Ctrl+End and Ctrl+Home reach the gap after a last block, or before a first one, that holds no text**, such as a chart. The browser cannot put its caret beside such a block, and would leave it where it was. Where text stands at that end, the browser's own move stays.

**An image and an include show what their clauses say.** Opened from a file, the page shows an image's path, alternate text and caption, and a marked box naming an include's path. Served by the local server, it shows the image and the included blocks in place ("The file lifecycle" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).

**An image goes in three ways: Insert ▸ Image…, a paste, or a drop.** The menu item opens the system's file chooser, so a person who has no image on the clipboard can still add one. Where the file goes, and why nothing is asked, is "Images" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md).

**A paste takes the clipboard's plain text.** Each line starts a block of the caret's kind. When the clipboard also held formatting, the page says that it was not kept.

**The page is built as wasm32 with no C library**, using clang's bulk-memory instructions to copy and fill memory. **It is one file**: kssrv's `kssrv/page/bundle.kspl` puts its style, its scripts and its wasm, as base64, inside `ksmd.html`. One of the scripts is kssrv's client for the local server, `kssrv/page/client.js`, which ksagent's chat page holds too. So the page opens from a file, and the local server hands it out alone.

**Opened from a file, the page reaches no file: a host opens and saves through two calls.** `ksmd.load(source)` opens a source, or names the line and column it refuses. `ksmd.source()` returns the canonical source to save, and `ksmd.onchange` learns of each change.

**The editor's memory is a fixed 128 MiB.** An action that starts with less than 16 MiB free is refused, and the page asks the person to save and open the document again. The document and its whole history stay in that memory until another document opens.

## Keys alone, and a screen reader

**Every part of the page works with keys alone, and a screen reader reads a table as a grid.** Each choice below follows the spreadsheets' keys and WAI-ARIA's patterns, so a person brings what they already know.

**A table is a `grid`, on the HTML table the page already draws.** Its letters and names are column headers, its row numbers row headers, and its cells grid cells. The cells of the chosen range carry `aria-selected`. Nothing is drawn twice for a screen reader: the grid is the table a person sees.

* **The focus stands in a text box over the chosen cell** ("Ranges of cells" below gives why). So that box's name is what a screen reader says: the cell's value and address, such as `6, C1`. Its description holds the formula, the error's reason, the note and the link. A name of `Cell C1` alone would make a listener open each cell to learn its value.
* **A range is said through a hidden live region in the status bar**, such as `B1:C2 chosen`, each time it changes. The focus stays on the range's first cell, so nothing else says how far a range reaches. One cell says nothing there, since its box already says it.

**F10 puts the focus on the menu bar, as in Windows's programs and LibreOffice.** F10 again, or Esc, gives it back where it was, and an open cell's text goes in first. Alt alone is left to the browser: Firefox shows its own menu bar on it, and Chrome and Edge on Windows focus their own menu. Shift+F10 still opens the table's menu.

* **The menus' names stand in a `menubar` of their own**, apart from the document's name and its saved state, which are not menus. Each name is a `menuitem`.
* **The menu bar and the quick access bar are each one stop of Tab.** The arrow keys move along them, as WAI-ARIA's menu bar and toolbar have it. The stop is the item the focus left last. Fifteen stops in the quick access bar made the document far to reach.
* **Home and End go to the first and last item**, in a bar and in a menu. Up on a menu's name opens it on its last item.
* **Every small pop-up takes its keys and its place from one file** (`popup.js`). They are the status bar's menus, Paste Options, the quick access bar's menu and palette, and a column's filter. Each menu moves by Up, Down, Home and End. Esc closes any of them and gives the focus back, and each keeps off the window's bottom edge.
* **The item the keys reach takes the mark's colour, with the paper's colour on it.** It stands out from the menu at 4.5 to 1 or more, in both schemes. The soft ground a pointer gives stands at about 1.1 to 1, too faint to find the focus by.

**Esc, Cancel and Apply in a side panel give the focus back where it was before the panel opened**, as a dialog does. Page setup, Colour by value and a chart's panel are such panels. Left on the panel that went, the focus fell to the page's body, and the next key went nowhere.

**A chosen cell takes the spreadsheets' keys for moving:**

* **Ctrl and an arrow key go to the edge of the values.** From a value with a value beside it, they go to the last value before an empty cell. Else they go over empty cells to the next value, or to the table's edge.
  * The names count as the row above the first, as a heading row does in a sheet.
  * Hidden rows and columns are passed over, as the arrow keys pass them.
* **Home and End go to the row's first and last column.** A table ends at its last column, so End needs no Excel's End mode.
* **Ctrl+Home goes to the first data cell, and Ctrl+End to the last row's last cell.** The names stand frozen above the rows, and Excel's Ctrl+Home goes to the first cell under a frozen heading.
* **Shift with any of them reaches there as a range**, from the range's far corner, as in Excel.
* **Shift+Space chooses the rows of the chosen cells, and Ctrl+Space their columns**, as in Excel. In an open cell, Ctrl+Space still opens the list of functions.

**In an open cell, Shift+Enter takes the text and moves up**, as Shift+Tab moves left.

**Tab past a row's last cell goes to the next row's first.** Past the table's last cell it adds a row, as an Excel table and a Word table do. A list then grows without the menu, and one undo takes the row away. Shift+Tab goes back, and stops at the first cell.

**Esc or Ctrl+Z in a cell typed into gives back the value it held**, and the cell stays chosen. The box held nothing before the first key, so the browser's own undo emptied the cell instead. In a cell opened to edit, Ctrl+Z stays the browser's own, on the text.

## Column widths and row heights

**A table's columns and rows keep the sizes a person gives them, as in a spreadsheet** (`sizes.js`). The file holds them as `char_widths` and `heights` ("Column widths and row heights" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).

* **A column is as wide as its width in characters, and the table as wide as its columns.** A narrow window makes the page scroll sideways, and no text wraps to fit it. A table that filled the window wrapped its text differently on each screen, and a person could not make one column stay narrow.
* **A column with no width fits its text**: its widest value or its name, from 3 to 60 characters. Rows a filter hides count too, so a filter moves no column.
* **A cell's text stays on its lines.** Alt+Enter's line breaks still show as lines, and nothing else breaks a line, unless the cell wraps.
* **Wrap text, as Excel's, breaks a cell's text into lines at its column's width.** It is set on each cell, as `wrap="on"` in its braces. Its row grows to show the lines, unless the row has a height. A word too long for the column breaks inside the word.
* **A text runs on over the empty cells to its right, and is cut where the next cell holds a value**, as Excel shows it. It is cut at the table's right edge too.
* **A number, a date or an error is always cut at its own cell.** A number or a date too wide for its column shows `###`, as in Excel: cut, 1200 would read as 120. Opening the cell shows the value.
* **Centre across columns sets `align="across"` on each chosen cell, as one step of undo.** It stands in Format and in the table's Look flyout. Pressed again on a cell that has it, it takes it off, as the other alignments do.
* **A value centred across columns shows in a box as wide as its run, over the run's empty cells.** A number wider than the whole run shows `###` in its own cell.
  * **The lines between the run's cells go**, as Excel draws no gridline under such a value. With them, the value would look cut by a line, and the run is meant to read as one cell. Paper shows it the same way.
  * **A press on the run still chooses the cell under it**, and the formula bar names that cell. So each cell can still be chosen and typed into, which a merged cell would not allow.
* **A row with a height is that tall, and text taller than it is cut.** A row without one fits its lines.
* **The Look flyout's Merge repeated values merges the chosen column** (`merge.js`), as one step of undo. Pressed again on a merged column, it stops.

**Dragging the right edge of a column letter sets that column's width**, and every other column keeps its own. The last column has an edge too. When the button comes up, the width is saved in characters, as one step of undo.

* **Where the chosen cells run through every row of their columns and the edge is one of theirs, each takes the width**, as in Excel. Column letters, Ctrl+A and the corner choose such cells.
* **While the edge moves, the status bar shows the width in characters.** A press that does not move changes nothing.

**Dragging the bottom edge of a row number sets that row's height in points**, as one step of undo. A dashed line with the height shows where the row's bottom will stand. Chosen cells that run across every column take the height together.

**A double-click on an edge fits it to its text.** On a column's edge, or on the border between two cells, the column takes the width of its widest value, and keeps it. On a row's edge, the row's height goes, so the row fits its lines again. The chosen columns or rows fit together, as a drag sets them.

**In a cell, chosen or open, Alt+Right makes its column one character wider and Alt+Left one narrower.** Each press is one step of undo. The keys work in the cell because a keyboard already reaches it; a focusable edge would be one more Tab stop on every table.

**Column width… and Row height… ask for a number**, as Excel's dialogs do. Both stand in the Size flyout of the Table menu and the right-click menu, beside Fit column width. Each change is one step of undo.

* **Column width takes 0.5 to 255 characters, with at most one decimal place.** The chosen columns each take it. An empty answer lets them fit their text again.
* **Row height takes whole points from 6 to 409.** An empty answer takes the height away. The rows keep their heights on paper too.
* **Only the data rows in sight take the height**, as in Excel. A row a filter or a closed group hides keeps its own. Row height cannot be pressed on the names row, which takes the height its text needs.
* **A number outside the limits is refused, and the page says which numbers it takes.** Nothing changes then.
* **Neither has a key of its own.** Excel's Alt, H, O, W and Alt, H, O, H walk its ribbon, which the page does not have.

## Ranges of cells

**A range of cells runs from the chosen cell to a far corner.** Shift+click and Shift with an arrow key reach it from the chosen cell. A press on a row number chooses that row, and one on a column letter that column's data cells. Shift with either press reaches from the chosen cell's row or column.

* **The range keeps the identities of its rows and columns.** A row added above it, a sort or an undo leaves it on the same cells. A formula follows other rules on a sort. One on a sorted row moves as a copy, but a reference the shift would take out of the table keeps its places. One in another table keeps a range over several rows on its places ("How references follow edits" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).
* **On a chosen cell that is not open, the keys act on the range.** Delete and Backspace clear its cells as one step, and each cell keeps its look. A typed character opens the chosen cell with that character in place of its value.
* **A command on a chosen range acts on the rows in sight alone, as in Excel** (`clear_cells` in `ksmd/edit/editor_tables.kspl`). Delete, a fill, a copy, a cut and Remove row are such commands. A row a filter or a closed group hides keeps its cells, and a copy leaves it out. Find and Replace pass over those rows too. So none of these commands changes a cell the person cannot see.
* **An input method composes from the first key.** The focus stands in an invisible text box over the chosen cell, since Windows keeps an input method off where no text can be typed. What is typed or composed there opens the cell, and the box becomes its input, so a composition goes on unbroken.
* **Copy, cut and paste act on the range.** A paste of one value fills every cell of the range. Cells copied in ksmd fill each place of the range that holds them whole. A paste of rows fills the table from the range's corner. A cut clears nothing: its cells wait for a paste that moves them ("Moving cells" below).
* **A paste is not such a command: it fills row after row from the range's corner, hidden rows included**, as Excel does. It puts the copied lines one after another. A paste that moves cut cells is refused over a hidden row ("Moving cells" below).
* **A look applies to every cell of the range in one step.**

## Copying and pasting cells

**A copy of cells carries their formulas for a paste in ksmd, and their shown values for any other program**, as Excel's copy does (`ksmd/port/web/paste.js`).

* **The plain text a copy puts on the clipboard stays the shown values.** A spreadsheet or a text editor takes them as before. A formula there would name cells the other program does not hold.
* **Beside it goes ksmd's own type, `application/x-ksmd-cells`.** It holds each cell's text as typed, a formula with its `=`, and each value as calculated. It also holds the place the cells were copied from. So a paste in another table, or in another ksmd window, has all it needs, whatever the copied document holds by then.
* **A copy over rows a filter hides leaves them out, and the paste puts the lines in sight together.** The copy holds the row each line came from (`Copied_at.rows`). So each formula moves from its own row: `=A3*2` copied from row 3 and pasted in row 2 becomes `=A2*2`.
* **Ctrl+V pastes the formulas, each reference moved as far as the paste moved from the copy.** A part with `$` stays, and a reference moved outside its table becomes `#REF!`. One rule moves a reference, for a fill and a paste alike (`moved` in `ksmd/calc/formula.kspl`).
  * **A reference without a table's name names a cell of the table pasted into.** A reference to a table the document lacks stays as written.
* **Ctrl+Shift+V pastes the values alone, and so do Edit ▸ Paste values and the right-click menu.** Each value goes in as typed text that reads back as that value.
  * **A number goes in as it shows without a format, and a date as `2026-10-23`.**
  * **Other values go in as quoted text, so `"12"` stays text.** `true`, `false` and an error go in as the text they show.
* **A paste is one step of undo, and the pasted cells stay chosen.** A range that holds the copy a whole number of times takes it in each place, each copy moved from its own place. Any other range takes it once, from its corner.
* **After a paste of copied cells, the Paste options button stands below their right corner, as Excel's does.** Its menu holds Keep formulas and Values only, the one in use ticked. The other undoes the paste and pastes again that way, so one undo still takes the whole paste away.
  * **Ctrl pressed and let go alone opens the menu, as in Excel**, and F or V chooses. The arrow keys, Enter and Esc work as in any menu.
  * **The next key, press or change takes the button away**, so it never offers to change a paste that is no longer the last.
* **Text from another program pastes as before**: its values fill the cells, and no button shows. Only the clipboard's own type tells a copy made in ksmd.
* **A cut carries no formulas for another window.** Its cells wait in their table for a paste that moves them ("Moving cells" below).

## Pointing at cells in a formula

**While a formula is typed, a press on a cell writes its reference at the caret, and a drag writes a range.** Excel calls this point mode (`ksmd/port/web/point.js`). Typing `=sum(`, then a drag from A1 to A2, gives `=sum(A1:A2`.

* **It acts only where a reference can go.** The cell's text starts with `=`, and the caret stands after `=`, `(`, `,`, `:`, an operator (`+ - * / & = < >`), or the word `and`, `or` or `not`. Inside quoted text it does not act.
* **A press on a column's letter or name writes the whole column**, and a drag across them columns side by side: `D`, `D:F`. In another table the table's name stands first, as for a cell: `map.D`, `map.D:F`. The name's filter arrow keeps its own press.
* **Only data cells and column headings are pointed at.** A press on a row number or outside every table ends the edit as before. So does a press where no reference can go, such as after a number.
* **A cell of another table is written with that table's name**: a press gives `map.D3`, and a drag `map.D3:D5`. A name that is not plain stands in quotes, as a typed one does. A range stays in one table, as a written one must.
* **A table shown from an included file is not pointed at.** No formula reaches into another file, so a press there ends the edit.
* **The cell stays open, with the caret after the reference.** Enter takes the formula, and Esc drops the edit, as in any open cell.
* **Pointing again replaces the reference just written**, until the person types or moves the caret. Shift with a press reaches a range from the cell pointed at last.
* **The reference written shows in colour, with a frame round its cells**, as every reference typed does ("A formula's references in colour" below).
* **A selection is replaced by the reference.** So AutoSum's selected range changes by a drag.
* **F4 turns the `$` of the reference at the caret**: `A1`, `$A$1`, `A$1`, `$A1`, then `A1` again, as in Excel. A selection turns every reference it touches, and a range's corners turn together (`cycle_fixed` in `ksmd/calc/formula.kspl`). So a `$`, which decides what a copy moves, takes one key and no careful edit.
* **The arrow keys do not point.** In Excel they point while a formula is being typed, and move the caret once F2 has opened the cell. People find the two modes hard to tell apart. In the page, the arrow keys act in a formula as in any open cell.

## Help while a formula is typed

**Where a function's name can start, the letters typed open a list of the functions that fit** (`ksmd/port/web/suggest.js`). Each entry shows the name and what it gives, and the chosen one also shows its arguments. Insert ▸ Function… (Shift+F3) opens the whole list as a dialog (`ksmd/port/web/catalog.js`).

| Key | While the list is open |
| :-- | :-- |
| Up, Down, Page Up, Page Down | Choose another entry |
| Tab or Enter | Write the chosen name and its `(` in place of the letters typed |
| Esc | Shut the list; the cell stays open |
| Ctrl+Space | Open the list where it is shut, also with no letter typed |

* **A name can start after `=`, `(`, `,`, an operator or a space, never inside quoted text.** After a letter, a digit, `.` or `$` the caret stands in a reference or a table's name.
* **Only lowercase letters open the list.** A function's name is lowercase, and an uppercase letter starts a reference, so typing `B1` offers nothing.
* **Names that start with the letters come first, then names with a part after `_` that does.** So `=dec` offers `dec_to_bin` and `dec_to_hex`, then `bin_to_dec` and `hex_to_dec`. A letter in the middle of a part finds nothing, as `um` does not find `sum`: a list that grows with every letter hides the name sought.
* **The list takes keys only while it is open, and none during an input method's composition.** With the list shut, Enter, Tab, the arrow keys and Esc act in the cell as before. So the two edit modes of "Input, menus and tables" above keep their keys.
* **Enter writes the name while the list is open, as Tab does.** A list that shows a choice but leaves Enter to take the cell writes a formula that does not read.
* **With no letter before the caret, the list shuts, unless Ctrl+Space opened it.** So `=sum(` shuts it as the `(` is typed. A list left open there would take Enter and Tab, and cover the cells a person points at.
* **Esc shuts the list alone, and a letter typed opens it again.** Excel turns its list off for good with one key; a person who pressed it by mistake then has no list.
* **Inside a call, a tip shows the arguments, the one the caret is in bold**, with what the function gives and what that argument takes. A press on the name in the tip opens the dialog on it.
* **The dialog searches names and what the functions do.** `hex` finds every function whose name or description holds it, and a group narrows the list. It shows each argument, what the function gives and an example, and Insert writes `=name(` into the chosen cell. In a cell being edited, the cell stays open and the name goes at the caret.
* **What the list, the tip and the dialog say is written once, in the functions' doc comments** (`ksmd/calc/help.kspl`). A document's own functions show what their own doc comments say, marked as the document's own.
* **The list stands under the box being typed in, the cell or the formula bar, not under the caret.** A text area does not say where its caret is drawn, and the cell is narrow, so the two places differ little.

**The bracket beside the caret and the bracket it pairs with take a coloured ground, as the spreadsheets mark them** (`ksmd_web_bracket_pair` in `ksmd/port/web/bridge_tables.kspl`). In a formula of several calls, a person sees which `(` a `)` closes without counting.

* **The bracket just before the caret comes first, then the one just after it.** So the `)` just typed shows the `(` it closes.
* **The editor pairs them, from the formula's own tokens** (`partner` in `ksmd/calc/formula.kspl`). A bracket inside quoted text is text, so it is never marked, and the page has no second reader that could disagree.
* **A bracket that pairs with nothing is not marked.** A mark on one bracket alone would tell the person less than the gap they look for.
* **The mark is a ground alone, in the coloured copy behind the box** ("A formula's references in colour" below). Bold type would change the bracket's width, and the copy would stand off the text typed.

## A formula's references in colour

**While a cell is open on a formula, each reference to cells takes a colour, and a frame of that colour stands round its cells** (`ksmd/port/web/refs.js`). Excel and other spreadsheets do the same. Typing `=A2-A4` shows `A2` in blue with a blue frame round A2, and `A4` in red with a red frame round A4.

* **The colours come in a fixed order**: blue, red, purple, green, orange, teal, magenta and brown, then blue again. Each takes the next colour in the order its reference is written. The same cells written twice keep one colour, so `=A1+A1` shows one frame.
* **Each colour stands out from the open cell's ground at 4.5 to 1 or more**, in the light scheme and the dark one (`--ref-1` to `--ref-8` in `ksmd/port/web/page.css`). The colour only adds to the text: the reference itself still names the cells, for a person who does not tell the colours apart.
* **A range and whole columns take one frame round all their cells.** A filter's hidden rows and a folded group's columns are passed over.
* **A reference to another table of the document is coloured, and its cells are framed there.** Every table of the document stands on the page, so the frame shows wherever that table is. A table shown from an included file takes no frame, as a formula cannot name it.
* **Only a reference that names cells is coloured.** `Z9` in a table of four columns, a table's name the document lacks, and text in quotes stay in the cell's own colour. So a reference that stays plain names nothing.
* **The editor finds the references, as taking the formula attaches them** (`ksmd_web_references` in `ksmd/port/web/bridge_tables.kspl`, from `attachable` in `ksmd/calc/formula.kspl`). The page has no second reader of formulas, so the colours never disagree with what the formula calculates.
* **The colours follow each change**: typing, a press that points, F4, the list of functions and Alt+Enter. They go when the cell closes, by Enter, Tab, Esc or a press elsewhere.

**A text area cannot colour part of its text, so a coloured copy of the text stands behind it.** The open cell's own text is transparent over the copy. The copy takes the box's font, padding, wrapping and size, and follows its growth and its scroll.

* **The person still types in the text area.** So the caret, the selection, Alt+Enter and the two edit modes work as before. The selection shows through, so the coloured text stays readable under it.
* **While an input method composes, the box shows its own text and the copy hides.** The input method draws its own marks on the text being composed, which a transparent text would hide. The colours come back once the composition ends.
* **A column with choices edits in a one-line box, and the copy follows its sideways scroll.**

## Inserting and removing rows and columns

**Insert row above, Insert row below and Remove row act on every row the range spans, as one step**, as in Excel and Google Sheets. With rows 2 to 3 chosen, Insert row above inserts two rows above row 2, and Remove row removes both. The column commands act on the columns the range spans the same way. A refused removal changes nothing.

* **A row a filter or a closed group hides counts for none, as in Excel.** Remove row leaves it, and removes the rows in sight from the bottom up, as one step. Insert row above inserts one row for each row in sight. So a range over a hidden row never removes a row the person cannot see.

## Moving rows and columns

**Rows move by a cut and Insert cut rows, as Excel's Insert Cut Cells moves them.** Columns move the same way, by Insert cut columns. Excel users already move rows this way, so the page has no Move row up or Move row down.

1. Choose whole rows by their row numbers, or whole columns by their letters. Shift with a press reaches across several.
2. Cut them with Ctrl+X or Edit, Cut. Nothing is removed yet: a dashed frame marks the lines, as Excel's moving border does.
3. Right-click a row number, or a column letter, and choose Insert cut rows or Insert cut columns. The lines move to stand above that row, or left of that column. The lines between close up.

**Insert cut rows stands in place of Insert row above while rows of that table are cut**, as Excel's Insert reads Insert Cut Cells then. Insert cut columns likewise stands in place of Insert column left. So the menu keeps its shape, and the item stands where a person looks for Insert.

* **The move is one step of undo, and the moved lines stay chosen at their new place.**
* **Each line keeps its identity** (`move_lines` in `ksmd/edit/editor_tables.kspl`). A formula's reference follows its row or column, so no `#REF!` appears. A row takes its height and notes along. A column takes its name and every setting that a cut column takes ("Moving cells" below), and a chart still finds it by name.
* **A group keeps its places, as after a sort**: it belongs to the table's layout ("Groups of rows and columns" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).
* **A move is refused whole when a formula would grow past 4,096 bytes**, or when a chart would no longer find its column. Nothing changes then, and the page says why.
* **Esc, or any other change to the document, drops the cut**, as in Excel. A place inside the cut lines, or just after them, changes nothing, and the cut stays.
* **The cut also puts the lines' values on the clipboard as tab-separated rows.** So a paste in another program takes them, and the lines stay, as in Excel.
* **Ctrl+V or Paste on a row moves cut rows there, writing over the rows they land on**, as Excel's Paste does. Their own rows are left empty. Cut columns go to the chosen column the same way, names included. Insert cut rows and Insert cut columns still insert, and write over nothing. The paste works as a paste of cells ("Moving cells" below).
* **Lines move only inside their own table.** Insert cut rows reads so only in the menu of the table they were cut from.
* **A drag does not move rows.** Excel's drag with Shift held inserts, without Shift it writes over the cells it lands on, and its browser version swaps the two. A press that slips then overwrites data. A cut and an explicit Insert never write over a cell.

## Moving cells

**A cut of cells and a paste in the page move them, as in Excel.** The cut removes nothing: a dashed frame marks the cells until the paste.

* **The cells there take the cut cells whole**: their values, formulas, looks, number formats and notes (`move_cells` in `ksmd/edit/editor_tables.kspl`). The cells the move leaves behind become empty.
* **A reference to a moved cell follows it, wherever its formula stands**, as in Excel. A formula moved keeps pointing at the same cells.
* **A range follows when it moves whole.** A range moved in part stays where it is. Excel moves each corner of a range on its own. So a range's end cell moved inside it drops cells from a sum, without a word.
* **A reference to a cell written over becomes `#REF!`, as in Excel**, and so does a range whose two corners were written over. The value it named is gone.
* **Whole columns cut by their letters take a whole-column reference with them**, so `=sum(A)` follows column A's cells to C, as Excel moves `A:A` to `C:C`. A block of some rows leaves such a reference alone, since the reference names every row.
* **Whole columns also take their settings**, as Excel's paste of whole columns does (`move_cells` in `ksmd/edit/moving.kspl`). "Copying, moving and filling" in [`SPEC-editing-page.md`](SPEC-editing-page.md) lists them. The columns written over lose their own, and the columns left behind keep none. Otherwise a filter left on an empty column would hide every row. Whole rows likewise take their heights.
* **The move is one step of undo, and the moved cells stay chosen at their new place.** The table grows rows and columns where the cells reach past it, as a paste of rows grows it.
* **A move is refused whole when a formula would grow past 4,096 bytes**, or when the table would pass its limits. Nothing changes then, and the page says why.
* **A cut pastes once.** Esc, a copy, or any other change to the document drops it, as in Excel.
* **Paste values while a cut waits is refused, and the cut still waits.** Excel offers no Paste Special for a cut, since cut cells move whole. The page says to press Ctrl+V, or to copy the cells for their values.
* **The cut puts the cells' values on the clipboard as tab-separated rows**, so another program takes them, and the cells stay. Text on the clipboard other than the cut's own was copied later, so a paste drops the cut and pastes that text.
* **Cells move only inside their own table.** A paste in another table is refused, and the page says to copy instead. A reference across tables would need the same care, and a person rarely moves cells between two tables.
* **A cut of cells or whole rows over a hidden row is refused**, and the page says to show all rows or copy instead. The paste would move the hidden cells too, out of the person's sight. A paste of the cut onto a hidden row is refused with the same words. It would write over cells out of sight, and turn references to them into `#REF!`. Whole columns cut by their letters move whole, hidden rows and all, as a column moves with its filter.
* **The names move only along the names row**, since a name names a column, not a value.

## Filling cells

**Ctrl+D fills a range down from its top row, and Ctrl+R right from its left column.** A range of one row fills down from the cell above it, and a range of one column right from the cell left of it. The right-click menu holds both, and each fill is one step of undo.

* **Each cell is copied through the model's copy of a cell** (`copy_cell` in `ksmd/edit/edit.kspl`), look included, so references shift as a copy shifts them.
* **A fill is refused whole.** A copy that would write a formula longer than 4,096 bytes puts back every cell copied before it.
* **A row a filter or a closed group hides neither gives nor takes a cell**, as in Excel. Fill down from one row copies the nearest row in sight above it. A series counts only the rows in sight, so `1, 2` goes on as `3, 4` in the next two shown rows.
* **A drag of the square at a range's lower right corner goes on with a series, where the cells make one, or repeats them.** Ctrl+D and Ctrl+R always copy (`ksmd/edit/series.kspl`).
  * **Two or more numbers with one step between each go on by that step**: `1, 2` gives `3, 4`, and `10, 7.5` gives `5, 2.5`. The arithmetic is in decimal digits, so `0.1, 0.2` gives `0.3`.
  * **Text that ends in a number goes on by its step, or by one from a single cell**: `Item 1` gives `Item 2`, and `Q1, Q3` gives `Q5`. A number with leading zeros keeps its width: `Week 08` gives `Week 09`. A `-`, `/` or `.` before the number does not stop it, so `INV-001` gives `INV-002` and `v1.9` gives `v1.10`, as in Excel.
  * **Anything else repeats**: one number alone, numbers whose steps differ, a formula, a mix of kinds, and a date or a time as text. Such text reads whole as a date or a time, as `2026-10-23`, `10/23` or `14:05`. A date cell goes on by days. Steps that differ repeat rather than fit a straight line, so a person can work out every value from the cells.
* **Ctrl+D and Ctrl+R act only while a cell or a range is chosen.** Elsewhere the browser keeps them.

## Exporting a table

**The Table flyout's Export as CSV downloads the table**, so another program can take its values.

* **The file holds the names, then each row's calculated values**, every row whether hidden or not. A number is written before any format, with `.` for its point and no separators.
* **A value is quoted only where it holds a comma, a quote or a line break**, and a quote inside is doubled. Lines end in CR LF, as RFC 4180 writes them.
* **Text that starts with `=`, `+`, `-`, `@`, a tab or a CR gets a `'` before it, and is quoted.** A spreadsheet would run such text as a formula, and a formula can open a link or start a program. A number is never changed, so `-5` stays a number.
* **The file is UTF-8 with a byte order mark.** Without one, a spreadsheet can read the bytes in the computer's own code page, and text outside ASCII comes out wrong.
* **The file is named after the table**, with the characters a file name cannot hold made `_`.

## Find and replace

**Ctrl+F opens a find bar under the formula bar, and Ctrl+H opens it with its replace part.** The Edit menu and the bar's Find tool open it too. A short selection on one line becomes the search text.

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
* **The row numbers and the first column stay in sight while the page scrolls sideways** (`position: sticky` on each row's first two cells). So a row of a wide table keeps its name, as a spreadsheet's frozen first column does. `table.js` measures the row numbers' width, so the first column stands just right of them. It measures a table that an include shows too.
  * **They stay only in a table that the page can scroll past sideways** (`pinned`). Elsewhere a cell that stays has no effect, and thousands of them slowed each scrolled frame about threefold. `table.js` checks again when the tables are drawn, and when the window, the zoom or the contents' width changes.
* **Every table's heading sticks, and no source notation chooses it.** A choice per table would change the file for a way of looking.
* **On paper, the browser repeats the `thead` on each page.**

## Colour rules on the page

**The right-click menu's Look flyout holds Colour by value…, which opens a small panel over the table.** It holds the condition (below, above, equal to, empty, or no rule), its value and a style. The styles are ready-made pairs, such as a light red fill with dark red text, so a person picks one rather than two colours. Apply sets the rule as one step.

**A colour scale is one more condition in the panel**, with the colour of the greatest number: yellow, green, red or blue. The least number's cell stays white.

**The panel keeps colours written in the file that it does not offer.** It lists them as one more choice, chosen, so Apply changes only what the person changed. A new scale starts from white.

## Notes on the page

**A cell with a note has a red corner, and a paragraph or a heading with one has a bar at its left.** Pointing at it shows the note.

* **The status bar shows the note too, while its cell is chosen or the caret stands in its paragraph.** A person who works with keys never points, so pointing alone left the note unread. A cell's note also goes with its name to a screen reader.

* **Insert, Note asks for the note of the chosen cell, or of the paragraph the caret stands in.** An empty answer resolves it.
* **The table's right-click menu holds Note… and Resolve note.** Each change is one step of undo.

## Choices on the page

**The right-click menu's Columns group holds Choices…, which asks for the column's list as one line**, such as `Open, In progress, Done`. An empty line clears it.

* **An open cell of the column offers the list while one types** (an HTML `datalist`).
* **A value off the list stays in its cell to be put right, and the page says why.** Esc, or leaving the cell, drops it.
* **A cell that holds a value off its column's list has a wavy underline**, and its title names the choices.
* **A choice takes a colour after `=` in that line**, such as `Open=red, Done=green`. The names are red, yellow, green, blue, orange, purple and gray, each a fill and a text colour that read together. `=own` keeps colours the file gave, and `=none` gives none.
* **Text after the last `=` that names no colour is part of the choice**, so `1+1=2` is a choice of its own. A choice with no colour whose text ends in `=` and a colour's name shows with `=none` after it. So the line reads back as the same choices.
* **A cell that holds a coloured choice shows its colours**, as a tag does in a list of tasks.
* **Colour rows by this column, in the Look flyout, colours each row by the choice that column holds.** Pressed again on that column, it stops. A column's colour rule stands over a row's colours.
* **A column with choices opens its cells in a box of one line**, the only box a browser offers a list in. Other cells open in a text area that keeps line breaks.

## AutoCorrect: dates, links and brackets as they are typed

**A typed `11/6` or `2026/1/5` becomes a date, and a typed `https:` or `http:` address becomes text that links to it**, as Excel does. Each saves a step that people do by hand often.

* **Each can be turned off, under Edit ▸ AutoCorrect.** Sometimes `11/6` is a ratio or a part number, and an address is only to be read. The choices are this browser's own, as the width is: they are how a person types, not part of the document.
* **`Ctrl`+`Z` right after gives back the text as typed**, as Excel's AutoCorrect does. The editor records the typed text and the change as two steps (`set_cell` in `ksmd/edit/editor_tables.kspl`). So a change made once against the person's wish costs one key, not a trip to the settings.
* **`2026-10-23`, the file's own form, is a date even with the choice off**, as a number is a number. A value in quotes is text whatever it looks like.
* **A paste reads dates by the same choice, and makes no link.** A pasted column of addresses is data to be read, and a link on each would be a surprise.

**A formula that misses its last `)` takes it as the cell is taken**, by Enter, Tab, a press elsewhere or any other way (`close_formula` in `ksmd/edit/editor_tables.kspl`). `=sum(A1:A3` becomes `=sum(A1:A3)`. Without it, the cell shows `#SYNTAX!`, and the person must find the gap by eye.

* **Only an ending is added**: a `"` where quoted text is still open, then a `)` for each `(` left open (`closing` in `ksmd/calc/formula.kspl`). Nothing goes inside the formula. A guess in the middle can change what the formula means and still read.
* **The formula takes the ending only where it then reads.** `=1+(` and `=round(2.5` stay as typed, with their `#SYNTAX!`, so the reason names the person's own mistake.
* **A `)` too many is left alone**, since no ending can close it. A `\` before the end is text, so `"C:\` closes as `"C:\"`.
* **The status bar says what was added**, such as `Added ) at the end so the formula reads. Ctrl+Z takes it back.` A cell that holds more than was typed, with no word why, looks like a fault.
* **`Ctrl`+`Z` right after gives back the formula as typed**, as for dates and links: the editor records two steps. Quoted text left open runs over the cell's end in the file, so that formula goes in closed, as one step. The page keeps the typed form instead (`unclose` in `ksmd/port/web/cellbox.js`). `Ctrl`+`Z` right after then undoes the step and opens the cell with the formula as typed. `Esc` there leaves the value the cell held before.
* **It is the third choice under Edit ▸ AutoCorrect, on at first.** A person who wants to see each `#SYNTAX!` turns it off.
* **The page adds no `)` while a formula is typed.** A bracket that appears ahead of the caret is typed over or doubled, depending on where the caret went since. Spreadsheets that add one draw that complaint.
* **Excel asks in a dialog before it corrects a formula.** A dialog on every Enter costs a key each time, and its proposals can change the meaning. The page asks nothing, and adds only what reads.

## An image's width, caption and alternate text

**A drag of the square at an image's lower right corner sets its width, and so does Width… in its tools** (`images.js`). The width is a share of the text width, and the status line shows it while the corner moves. Width… takes a number, as Column width… does, so the keyboard reaches it too.

* **Caption… and Alt text… stand beside Width…** and ask for the image's words, as they stand. A caption is what a reference names (`[#](#caption)`), so an image that a reference needs takes one there.
* **An image with no alt text is decoration, and a screen reader passes over it** (`alt=""`). Alt text… says so when it asks. A file's name, read in its place, tells a listener nothing of what the image shows.
* **Images with widths that fit share a row**, laid out as inline blocks of their share. A paragraph or a gap between them starts a new row.
* **The square is left out of print and while read-only**, as the drawing tools are.

## A link in a cell

**Insert ▸ Link… on a chosen cell links the cell's text**, and an empty answer takes the link away. The text shows as a link. It opens in a new tab on Ctrl+press, or on a press while read-only, as a link in the text does. A plain press chooses the cell, so it can still be edited.

## Groups of rows and columns on the page

**A table's outline of rows stands left of its row numbers, and its outline of columns above its letters.** Each has one line of marks per level of groups (`outline.js`).

* **Each group has a button on the line before it: − while its lines show, + while they are hidden.** A hidden row or column could not hold the button. A line runs beside the lines of a group that shows.
* **The right-click menu's Group flyout holds Group rows (Alt+Shift+Right), Ungroup rows (Alt+Shift+Left), Hide detail and Show detail.** They act on the chosen cells' rows.
* **The same flyout holds Group columns, Ungroup columns, Hide column detail and Show column detail.** They act on the chosen cells' columns.
* **A hidden column takes no width, and the arrow keys and Tab pass over it.** Its `col` stays, so each `col` keeps standing over its own cells.
* **A row shows only when neither a hidden group nor a filter hides it.**

## A chart's panel

**The Table flyout's Insert chart puts a bar chart of the first column of numbers after the table.**

**A chart's Edit button opens a panel**: the kind, series in columns or in rows, the labels column, the series drawn and the title (`chart.js`). In rows, the panel lists the rows that the editor takes as series, and asks for the first and last columns drawn. Such a row holds text written in the labels column, not a calculated value. The saved chart finds the row by that text, so the text holds no `,` and no row above it holds the same text. The view sends these rows for each column (`sr` in `ksmd/port/web/view.kspl`), so the panel and the editor apply one rule. Apply sets the chart as one step.

## Page setup, numbers and references

**File ▸ Page setup… opens a panel for the document's settings.** It holds the paper, the orientation, the header and the footer. It also holds where heading numbers start, and the words before table and image numbers. Apply sets them as one step (`settings.js`).

* **The settings stand at the document's top as a dashed bar** that says what they set, with Edit and Remove. Paper never shows the bar.
* **A heading's or a caption's number is drawn by CSS from an attribute, never written into the text.** The editor counts the text of each block, so a number inside it would move every caret after it. The contents list shows the numbers too.
* **A reference's `#` stays in the text and takes no room.** Its number is drawn after it.
* **Ctrl+press on a reference, or a press while read-only, scrolls to what it names.**
* **Table ▸ Caption… sets a table's caption, as one step of undo.**

## Drawing on an image or a chart

**An image and a chart each have the tools Rectangle, Arrow, Line, Pen, a colour, Text… and Delete** (`drawings.js`). With Shift held, a rectangle is a square, and a line or an arrow keeps to a multiple of 45 degrees. The shapes are saved in the picture's clause ("Shapes drawn over an image or a chart" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).

* **A shape is drawn by a drag across the picture once its tool is pressed.** The new shape is then chosen.
* **A press on a shape chooses it, and a drag moves it**, kept inside the picture. Delete takes the chosen shape away, and Esc lets it go.
* **A chosen shape takes the keyboard's focus.** Where the focus then goes to the text or to a field, Delete and Backspace act there and leave the shape. Any change to the document lets the chosen shape go, as another shape can then stand in its place.
* **A shape stands no further than 20,000 pixels from the picture's corner**, the most the file's reader takes, however large the image is.
* **The colour list sets the colour of new shapes and of the chosen one.** Text… writes the words inside the chosen rectangle.
* **Each change is one step of undo.** The page sends the whole list as `draw` lines, so the file's reader checks every change.
* **The shapes are drawn in the picture's own pixels**, so they scale with it. A line's width, an arrow's head and the words keep a size a person reads.
* **Read-only, an included file and paper show the shapes without the tools.**

## A diagram on the page

**Insert ▸ Diagram puts an empty drawing area at the caret** (`diagram.js`). Its tools draw a box, a diamond, a start or end dot, a group and a note. They also draw an arrow or a line between two shapes. The file's form is "Diagrams" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md).

* **A shape is drawn by a drag across the area once its tool is pressed**, or at its own size by one press. An arrow is drawn by a drag from one shape to another.
* **A press chooses a shape or an arrow.** A drag moves a shape and its arrows follow, kept inside the area. A group carries the shapes it holds whole.
* **A chosen shape's corner handle resizes it, and the area's corner handle resizes the area**, never smaller than what it holds.
* **A chosen arrow shows a handle halfway along each stretch; a drag of one adds a bend there.** A bend's own handle moves it, and two presses on it take it away.
* **Two presses on a part, or Text…, open a box for its words.** Ctrl+Enter or a press elsewhere takes them, and Esc drops them. A shape's words may have several lines.
* **Mono, the colour list and the ground list change the chosen part**, and the next one drawn. Caption… writes the words under the diagram.
* **Delete takes the chosen part away, and a shape's arrows go with it.** An arrow key nudges a chosen shape one pixel, ten with Shift.
* **Each change is one step of undo.** The page sends the whole clause, so the file's reader checks every change.
* **The area shows at its own size, and a wide one reaches past the page**, as a wide table does. Paper shrinks it to the page's width. Read-only, an included file and paper show it without its tools.
* **The page tells two presses apart itself.** The first press draws the area again, so the browser sends no double-click.
* **The box for a part's words stands outside the document**, as the chart's panel does. Inside it, the document's own keys would type into its text.

## AutoSum

**Sum (Alt+=) puts a total in the chosen cell** (`autosum.js`). The AutoSum flyouts of the Table menu and the right-click menu also give Average, Count numbers, Max and Min.

* **In one cell, it types `=sum(...)` over the whole column above, and leaves the cell open with the range selected.** Enter takes it, and typing changes the range. Where nothing stands above, it takes the row to the left.
* **The range is the whole column above, not the numbers up to the first gap**, which would leave out the numbers above an empty cell. The names' row is never in the range.
* **With a range chosen, each column of numbers gets its total under them, as one step.** The total goes in the range's last row where that row is empty, or else in the row under it. A row that holds a value is never written over.
* **A row added after the last row of the sum stays outside it**, as "How references follow edits" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md) says.

## Print and PDF

**File, Print or save as PDF (Ctrl+P) opens the browser's print dialog, which also saves a PDF.** Print and PDF are one output, made by the same rules.

* **The output shows the document, and nothing only editing uses.** The menus, the bars, the status bar and the contents go. So do the column letters, row numbers, table names, filter marks and block buttons. An include's frame, the marks of notes and choices, and the chosen cells go too.
* **Rows a filter or a closed group hides stay hidden on paper**, so a printout shows what the person sees.
* **A divider ends a page.** Its line still shows at the page's end.
* **The page always prints light, and the author's fills and colours print as the page shows them.** The browser would otherwise leave background colours out.
* **A table keeps its columns' widths on paper.** A table wider than the paper prints smaller, so all its columns fit, and no text wraps to fit the paper. The paper is the one File, Page setup… names, else A4.
* **The status bar says when a table will print smaller**: "this table prints at 72%" follows the page while the person works in it. Before a print, the status bar names each such table. A shrunk table is harder to read, so the person learns of it before the paper does. A note that stood beside the table's name all the time would be in the way of a person who knows.
* **The row numbers' column keeps its place with no width**, so no value moves under another column's name.

**Each page has a header and a footer of the page's own**, drawn with the margin boxes of CSS (`@page` in `print.css`).

* **The header holds the time of the print at the left and the document's name in the middle of the page.** The footer holds "page / pages" at the right.
* **The document's settings can put their own text in the header's middle and at the footer's left.** They also set the paper and its orientation ("The document's own settings" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).
* **A document with no file yet is named "Untitled", as Excel names a new workbook Book1.** The menu bar, the window's title ("Untitled - ksmd") and the printed header show it, so each still says which document is open. Saving asks for a path as before.
* **The browser's own line would put the title off the middle.** Chrome centres it in the room after the date, so a longer date moves it further right.
* **A browser that draws margin boxes then draws no line of its own at that edge**, so the person changes no setting. Chrome 153 does so, as the checks here found.
* **The browser's line would also print the page's address**, which only names the local server and tells the reader of the paper nothing.
* **A browser without margin boxes still prints its own line**, and its print dialog turns that line off.

**A table, chart, diagram, image or include can be left out of the output: `invisible="printing"` in its clause.** A table that only feeds a chart is the usual case. It still calculates, and the chart still draws from it.

* **The attribute names the exception, so a new block is in the output until its author says otherwise.**
* **While editing, such a block has a dashed frame and the words "Not in print or PDF".**
* **The table menu's Table flyout holds Leave out of print. A chart, a diagram, an image and an include have the button beside Remove.** Each change is one step of undo, and the button reads Put back in print once it is set.

## Repeat

**With nothing to redo, Redo becomes Repeat: Ctrl+Y or F4 does the last command again where the person works now.** Insert column right then F4 inserts another column; Bold on one word then F4 makes the next selection bold.

* **The button reads Repeat while it repeats, and Redo while something is left to redo.**
* **A command that asks for something is not repeated**, such as Rename or a note. Nor are typing and pasting.
* **Any other change forgets what would be repeated**, so F4 never repeats a command from before the person typed.
* **In a cell open on a formula, F4 turns a reference's `$` instead** ("Pointing at cells in a formula" above), as in Excel. Elsewhere it repeats as before.

## Read-only

**View, Read-only shows the document and takes no edit**, so a person reading a file changes nothing by a stray key.

* **Every action that changes the document is refused at one place**, the call that runs it, so no key, paste or drop gets past. The commands that edit are greyed out.
* **What only looks still works**: finding, filters for the viewer alone, the contents, printing, saving a copy and exporting CSV. A press on a cell chooses it without opening it.
* **A press on a link opens it in a new tab.** While editing, Ctrl+press does. The page's own tab never follows a link, since it holds the unsaved edits and the local server's token.
* **The choice is this browser's own and is kept.** Nothing goes into the file.

## The status bar

**The status bar is one line at the window's foot that says where the person works** (`status.js`). From the left it shows why the chosen cell shows an error, and the note at the cell or caret. Then come a message, the document's own functions the cell calls, a filter's count and the printed page where the caret stands. The figures and the zoom stand at the right.

* **The status bar does not show the chosen cell's address or text.** The formula bar shows them whole, and edits them ("The formula bar" below). The same text in two bars would be one more thing to read, and the status bar could only show it cut.
* **A chosen cell that shows an error shows why**, as `#VALUE!: B7 holds text, which arithmetic cannot use`. The cell's tooltip holds the same words, after any note. A mark alone makes the person guess, or look it up in the reference.
  * **The calculator writes the reason; the page only shows it** (`write_reason` in `ksmd/calc/reason.kspl`, sent with each table as `err`). So `#BLOCKED!` has no words of its own in the page's script: its reason comes the same way.
  * **The bar cuts a long reason with `…`**, and the part's tooltip holds it whole. A reason in two lines would push the bar's other parts out of the window.
  * **An error carried from another cell names that cell**, as `A3 shows #DIV/0!`. Choosing A3 shows its own reason, so the person follows the chain to the cell to fix.
* **The bar names no cell mode.** The open cell shows its mode by how it acts. A cell typed into moves on with the arrow keys, and one opened by F2 moves its caret ("Input, menus and tables" above). A mode named in the bar tells the person nothing that the next key does not show.
* **The bar names no section.** View ▸ Contents marks the heading being read ("The contents" below), and shows its place among the others, which one name cannot.
* **A message stands in the middle until the next action.** The page and the filter's count step aside for it, and its tooltip holds a message the bar cuts.
* **A filter's count shows while a cell of a filtered table is chosen**, as `5 of 120 rows shown`. A table no filter narrows shows none.
* **The bar keeps one line.** A narrow window drops the zoom and the page first. A phone's width then drops the filter's count and the error's reason. The message and the figures stay.

* **Only the parts a person presses are buttons**: the figures, and the zoom's −, level and +. Tab from the text reaches them. The other parts are text that a screen reader reads, and only the message is announced as it changes.

### The figures

**With two or more cells chosen, the bar shows the figures the person picked for them** (`figures.js`). A right-click on the bar, or a press on the figures, opens their menu. It holds Average, Count, Numerical count, Min, Max and Sum, each with its value now. Average, Count and Sum show until a person picks others, as in Excel. The choice is this browser's own, and no document carries it.

* **Count takes every cell that holds a value, and the others take the numbers alone.** A figure of numbers is left out where the cells hold none. A date is not a number here, so a sum never adds days. Rows a filter hides are left out.
* **Each number is written as a cell writes a number without a format**, by the engine. The page has no rule of its own for a number's digits, so a cell, `text(A1, "")` and the bar never round one value differently.
* **Otherwise the figures are the lines and characters of the selection, or of the whole document.** A word count is absent: Japanese writes no spaces between words, so it would count a sentence as one word.
* **A line is a line as written.** Each paragraph, heading, list item, quote and code line is one, and each line break typed inside one adds one. The count does not change with the window's width or the zoom. A table's cells and captions are not counted.
* **A character is one that a person sees, and spaces are left out.** A kanji written with a variation selector, as some names are, is one character, though it takes two code points. A space, full-width or not, is not counted.
* **A block that the selection only touches at its edge is not counted.** So selecting a paragraph up to the start of the next one counts one paragraph.
* **The lines and characters are counted once the person pauses, as the page is.** Each count reads every block, and in a document of 12,000 blocks that took a tenth of a second per key. The figures for chosen cells show on the next frame.

### The page

**The bar names the printed page the caret or the chosen cell stands on**, such as `Page 3 of 12`. So a person in a long A3 specification knows where they are on paper, and the contents say where they are in the outline.

* **A browser tells a script nothing of its print's pages, so the page lays the document out a second time** (`pages.js`). A hidden frame holds a copy of the document, with the print's rules in force. Its width is the room inside the paper's margins, and its columns are one page high. The browser breaks lines, rows and blocks between those columns as it breaks them between printed pages.
* **The copy follows the print's own rules, read from the page's styles**, so nothing is written twice. A print rule is taken out of its `@media print`, and a screen rule is left out. A divider's page break becomes a column break.
* **A table's heading row repeats at the top of each page it goes on to**, as the print repeats it. A column of the frame does not repeat it. So the copy keeps as much room free at the top of each column that the table reaches.
* **The paper is the one that `:::document` names, and A4 where it names none.** The margin is the one `@page` sets in `print.css`, which a table's print scale reads too. The browsers' own margins differ, so the page sets its own.
* **The page is where the block, or the chosen cell's row, starts.** A block that the print leaves out takes the page of the block before it.
* **The tooltip says that the print dialog's own paper, margins or scale can change the count.** With the dialog's defaults, the count matches the pages of the browser's print to PDF, and the browser checks compare the two.
* **The copy is made again once the person pauses**, and a document that takes long to lay out waits longer. A caret that only moved changes nothing the print shows, so nothing is laid out for it.
* **A document of more than 15,000 elements counts no pages, and the bar shows no page.** The layout's time grows faster than the document. Past this size it would hold the page up for a second or more after each pause.

### The zoom

**View ▸ Zoom in, Zoom out and Zoom 100%, and the bar's −, level and +, scale the document alone** (`zoom.js`). The level's menu holds the steps 50, 75, 90, 100, 110, 125, 150, 175 and 200%.

* **The menus, the bars and the panels keep their size**, so a larger document leaves the tools where the hand knows them. The browser's own zoom still scales everything.
* **The keys are `Ctrl`+`Alt`+`=` and `Ctrl`+`Alt`+`-`, as in Excel.** The browser keeps `Ctrl` with `+`, `-`, `0` or the wheel for its own zoom. A page that took them would leave a person who magnifies everything without their key. Zoom 100% has no key, since `Ctrl`+`Alt`+`0` makes a paragraph.
* **The zoom is CSS `zoom` on the document, on the screen alone.** The file is unchanged, and the print keeps the document's own sizes. The block at the window's top stays in place as the level changes.
* **Where the page turns a pointer's move into the document's sizes, it divides by the zoom.** This holds for a column's drag, a row's drag and a checklist's box. The header's height, under which a table's heading stays, is divided by it too.
* **The level is this browser's own and is kept**, as the page's width is.

## The formula bar

**Under the quick access bar stands the formula bar: the chosen cell's address, then its whole text as typed** (`bar.js`). A press in its box, or Tab to it, opens the chosen cell for editing there. A long formula then has the window's width, not the cell's.

* **It shows a value's typed text, and a formula as written.** A column's name cell shows `C name` and the name. A range shows `C2:D5`, or `A:D` from the names to the last row. While the cell is open, the bar shows its text as it is typed.
* **It shows one line while it only shows.** Choosing another cell then moves nothing under it, so a press or a drag lands where it was aimed. The box still holds the whole text, which a screen reader reads, and a press shows it all.
* **While it holds the edit, it grows with the wrapped text, up to eight lines, and scrolls past them.** Excel's bar opens to a fixed height that the person sets by hand, and people ask for one that fits the formula.
* **It has no key of its own to grow, as Excel's `Ctrl`+`Shift`+`U`.** The bar grows by itself where the text needs room, so the key would do nothing a press does not.

**One edit, two views: the bar's box takes the open edit itself** (`inBar` in `ksmd/port/web/cellbox.js`). The keys, the list of functions, the colours, the marked brackets and AutoCorrect act in the bar as in the cell, by the same code. The cell shows a copy of the text, framed with dashes.

* **An edit open in the cell moves into the bar with its text** when the bar is pressed. The caret stands where the press was.
* **The bar always edits, as F2 does**: the arrow keys move the caret. Enter and Tab take the text and choose the next cell. Esc drops the edit. The keys then go back to the table.
* **While a formula is typed in the bar, a press on a cell writes its reference.** It works as from the cell ("Pointing at cells in a formula" above).
* **A table drawn again while the bar holds the edit keeps the text, the caret and the focus.** The bar is not drawn again. The cell's copy of the text comes back in the table drawn again (`redrawn` in `ksmd/port/web/cellbox.js`).
* **A box that held an edit is never used again.** Its keys and help stay attached to it, so the bar puts a fresh box in its place once that edit ends.

**The bar is a stop of Tab after the quick access bar.** Its box's name says which cell it edits, such as `Formula bar, Cell C2`. F10 then Tab twice reach it from a chosen cell. Tab to the box puts the caret at the end, as F2 does.

**Where no edit is allowed, the bar shows the text and takes no edit.** That is in Read-only, on a range, outside a table, and on a table shown from an included file. Its text can still be chosen and copied. A page opened without the local server edits in the bar as it edits in a cell.

**A column with choices offers its list in the cell alone.** A browser offers a list only under a one-line input, and the bar wraps.

## A compact page

**The page is compact, as a spreadsheet or a file manager's compact list is.** So more of a document stands in the window. The sizes are custom properties at the top of `page.css`, each set in that one place.

* **Prose has a line height of 1.4 and half a line between blocks.** The text keeps its size of 16 pixels, so nothing becomes harder to read.
* **A table's cells have a line height of 1.3 and a padding of 2 by 6 pixels.** A row of one line is 26 pixels tall, near a spreadsheet's 20 or 21.
* **Anything a pointer presses is at least 24 pixels tall**, the least size that the web's accessibility guidelines ask for (WCAG 2.2, "Target Size (Minimum)"). This holds for the menus, the quick access bar, the column letters and the contents.
* **A row height the person typed stays as typed**, and the compact padding only lowers the rows that have none.
* **View, One line per cell keeps every row one line tall.** A text of several lines shows them on one line, cut at its cell's edge with `…`, and shows whole while the cell is edited. The choice is kept by this browser and leaves the file unchanged, as the page's width does.
* **The page has no setting for a roomier look.** The zoom makes the document larger ("The zoom" above), and the browser's zoom makes everything larger. A second set of sizes would double what the checks must look at.

## A dark scheme

**The page follows the system's choice of a light or a dark scheme** (`prefers-color-scheme`), with no switch of its own.

* **The page's own colours are tokens, and the dark scheme gives them other values.** The document's colours are the author's, and a print shows them.
* **A cell with a colour or a fill of its own keeps a white ground and dark text in both schemes.** Yellow text on a dark ground, or light text on a yellow fill, would be unreadable.

## The contents

**View, Contents shows the document's headings in a panel at the window's left**, each indented by its level.

* **A press on a heading scrolls to it, and puts the caret at its start.** A heading from an included file only scrolls, and its file's path stands beside it.
* **The heading being read is marked as the page scrolls**: the last one above the top of the reading area. One folded away marks the heading it is folded under.
* **A heading with headings under it folds them away, and back, by the ▸/▾ button before it**, as Word's navigation pane does. With Alt, every heading of that level folds or unfolds, so a long document shows its chapters alone.
* **A fold lasts while the heading keeps its level and text**, through edits elsewhere. It is not kept in the file, nor in the browser's storage: it is how one reads now.
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
* **Save As into another folder writes each include's, image's and functions file's path again, so it names the same file from there** (`ksmd/port/web/save_as.kspl`). The file is written from a copy with the new paths. The page's document takes them, as one step of undo, only after the write succeeds. So a save that fails changes nothing, and text typed during the write stays.
* **A notice runs one choice.** The first press closes it, so a double press does not save twice or hold a second draft.
* **Before the page lays another file in, a draft holds what the page shows.** Text typed while the draft is written makes the page write the draft again, so no key is lost.
* **The Save as and Open dialog shows the folder pressed last, and a choice waits for its listing.** A listing that arrives after a newer one is let go.
* **Pasted text larger than a document can hold is refused before it reaches the editor's fixed memory.**

## A document's own functions on the page

What a person's own functions are, and their limits, is "Your own functions" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md). This section gives how the page runs them (`ksmd/port/web/functions.js`, `ksmd/port/web/bridge_own.kspl`).

```mermaid
sequenceDiagram
    participant E as editor (wasm)
    participant P as page script
    participant S as local server
    participant W as worker
    P->>S: is the clause's file allowed, as it stands?
    S-->>P: no
    Note over P: the bar asks; cells show #BLOCKED!
    P->>S: allow these bytes (the person's press)
    P->>S: build the clause's file
    S-->>P: the module, or the build's message
    P->>W: start the module
    W-->>P: its names, and what each one's doc comments say
    P->>E: the names
    E-->>P: cells show …, calls wait in a queue
    P->>W: each call, one at a time
    W-->>P: its answer
    P->>E: the answers, then show again
```

* **The editor never waits.** A calculation answers from the answers already come; a call with none goes into a queue once and shows `…`. Then the page takes the queue, and shows the document again after each round of answers, at most eight rounds after one showing.
* **One call at a time, each with its own time limit.** So a function that never ends is named by its own cell, and the others still answer.
* **A worker that ran past its time, or stopped, is ended and started afresh.** A module stopped part-way may hold half-changed memory.
* **The worker gets the module and nothing else.** Its one import throws, so a panic reaches the page as `#STOPPED!`; it cannot reach the document, the files or the network.
* **An answer is kept by its call's bytes**, the name and every argument. So the same call is answered at once, and an argument changed asks again. After 4,096 answers, all are forgotten between two rounds.
* **A functions file is fetched as an image is**: the page asks whether it stands, and keeps its bytes. When those bytes change, the page asks the server again whether they are allowed.
* **The page asks the server before every build, and builds nothing while the answer is no.** On a 403 or a 409 the file changed since, and the page asks the person again. The server's rules are "Building a page's own functions" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).
* **The person's answers wait their turn.** A press on Allow or Stop allowing waits until the work before it ends, so two steps never change one file at once.
* **The bar asks once per opening.** Not now and Stop allowing keep it shut for that file while the page stays open; the clause's box still offers Allow.
* **The corner mark comes from the editor**, which reads each formula as the calculator does (`Own_functions.called`). A function's name inside quoted text is no call, so it marks nothing.

## What the editing page does not do yet

* It does not convert a rich paste; it takes the plain text and says so.
* A paste of copied cells brings their values and formulas, not their looks, notes or links. The cells pasted on keep their own.
* Paste values is the one other kind of paste. A paste of formats alone, a paste that turns rows into columns, and a paste that adds to the cells are absent.
* Find has no whole-word search and no regular expressions. It does not search table names.
* A browser without the highlight API (`CSS.highlights`) marks no match in text. The current match still scrolls into sight, and the count still shows.
* It never trims the undo history. A long session can use up the editor's memory, and the page then asks the person to save and open the document again.
* Choosing a diagram's shape, drawing one and joining two take the pointer. The arrow keys only move a shape already chosen.
* The browser checks run in headless Chromium alone. Firefox, Safari, a real input method on a real keyboard and screen readers are not checked. What a screen reader is given is checked by the page's names, roles and states.
* A person switching tabs in a desktop browser is not checked: the checks send the focus event themselves, and hide the page by script.
