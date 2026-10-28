# The ksmd editing page

**This document says why the editing page in a browser works the way it does**: its input, its menus, its tables and its tools. The document language, the model, the editor's actions and the file lifecycle are in [`DESIGN-ksmd.md`](DESIGN-ksmd.md).

## Input, menus and tables

`ksmd/port/web/` holds the page: `bridge.kspl` and `view.kspl` built as wasm32, and the script and style that show the model. `make ksmd-web` builds it as `out/ksmd/web/ksmd.html`.

**Text arrives through `beforeinput`, which the page cancels.** The page runs the matching action, renders the blocks it changed, and puts the selection back from model spots. So the page keeps no edit the browser made, and the browser's own undo has nothing to undo. A dropped item is refused. Key presses carry the commands. Ctrl+B, Ctrl+I, Ctrl+E and Ctrl+K set marks, and Ctrl+Alt+0 to 6 make a paragraph or a heading. Tab and Shift+Tab nest list items, and Ctrl+Z and Ctrl+Y undo and redo. Ctrl+F and Ctrl+H open find and replace ("Find and replace" below).

**An input method's composition is the one edit the browser makes itself.** Text from an input method cannot be cancelled. While a composition lasts, the page renders nothing and runs no action. When it ends, the page compares the element's text with its text before, and takes the difference as one transaction. That comparison waits one turn, so a browser that changes the text after the composition ends has done so. Any other input takes it first. The key press that starts an input method deletes a selection, so the composition starts in one place.

**The selection is two model spots.** A spot names a block, a list item and a UTF-8 offset into its text, or a gap. The page maps between spots and places on the page at each action, and keeps no place across one.

**Only the blocks an action changed are rendered again.** An action reports the first block it changed and how many at the end it left alone. After a table edit, every table shows again, since a value can depend on another table.

**The menu bar holds every command: File, Edit, View, Insert, Format and Table.** Each item shows its icon, its name and its shortcut, so a person can find any command by reading the menus. One list in `ksmd/port/web/commands.js` gives each command its name, key and icon. The menus, the right-click menu and the quick access bar are built from it, so the three cannot differ. File always holds Print; Open and Save stand in it only where the local server opens files. A menu opens on a press of its name, not on pointing, so moving the mouse across the bar opens nothing. While one menu is open, pointing at another name opens that one. In the right-click menu, a long group is a flyout, which opens on pointing, on a press, or with Right. Esc, a press outside and a chosen command close every menu, and the focus goes back where it was. Up and Down move through a menu, and Right and Left go into a flyout, out of it, or on to the next menu. Each command keeps its shortcut, which the menu shows beside it.

**A table command that cannot act is disabled, not hidden.** With no cell chosen, every table command is disabled. A person sees where the command is, and the menu does not change shape.

**A right-click on a cell, a row number or a column letter opens the table menu at that place.** It chooses that cell first, and the commands act on it. A right-click inside a chosen range keeps the range, as in Excel, so a command acts on all of it. Shift+F10 or the menu key in an open cell opens the menu too. It holds the Table menu's commands, from one list (`TABLE_GROUPS` in `ksmd/port/web/commands.js`). Rows, Columns and Note show their commands in the menu itself, as the most used. Fill, Sort, Filter, Number format, Group, AutoSum and Table are flyouts, as Excel's cell menu holds Sort and Filter. So the whole menu fits a window 600 pixels tall, and its last items never fall below the screen.

**A command's key stands beside its item, in the menu and in a flyout, and the same list runs it from a cell.** So the key shown and the key that acts cannot differ. The keys are Excel's: Ctrl+Shift+~, !, % and $ for the number formats, Shift+F2 for a note, and Alt+Down for the column's filter. The page has no separate list of keys; a person learns each one beside the command it runs.

**A table shows as an HTML table of calculated values**, with column letters and row numbers. The row of names under the letters is the table's heading, with its own colour and a line below it. An empty name shows a faint "Name". The row numbers take only the width their digits need. A press chooses a cell, as in a spreadsheet. A double press or F2 opens it in an input of its own, the caret after its text. Typing on a chosen cell replaces its value. Enter, Tab and the arrow keys move the choice, passing over hidden rows. Esc drops the open cell's edit and leaves the cell chosen. The arrow keys past the first or last row leave the table for the gap there. A press between two blocks, or below the last, puts the caret in the gap there.

**Left and Right move the caret inside a cell's text, and move to the next cell at the text's edge.** A cell opens with all its text selected, so Left and Right then move to the next cell at once, as in a spreadsheet. Once a click or a key puts the caret inside the text, they move the caret. At the text's edge, the next press moves to the next cell. Left in the first column and Right in the last stay in the cell.

**Sorting orders a table's data rows by the chosen cell's column, as one step of undo.** Numbers come first, smallest first, then text from A to Z, then `false` and `true`, then errors. Descending reverses that order. Empty cells stand last either way, as spreadsheets put them, so a sort never hides the filled rows below empty ones. Text compares letters without regard to case. Rows with equal values keep their order, so a sort by one column after another sorts by both. A formula sorts by its calculated value. The names above the data rows do not move.

**A column filters from its heading, as in Excel.** Each name carries an arrow, and pressing it opens a panel under that column (`ksmd/port/web/filter.js`):

* The panel starts with Sort ascending, Sort descending and Clear filter from this column. A search box follows, then the column's values, each with a tick box.
* A condition is folded away under the list: is, is not, contains, is greater than, is less than, is empty, is not empty. A number compares as a number.
* OK applies the ticks or the condition, and Cancel, Esc and a press outside change nothing. A sort closes the panel, so the rows can be seen.
* Typing in the search box narrows the list shown, and never unticks a value. Looking and choosing are two acts, so they are two controls. "(Select all)" ticks or unticks the values in sight.
* The values are listed in the order the column sorts in, so 80 comes before 120. Values that differ only in case are one value, since the filter ignores case. Empty cells are one value, listed last as "(Blanks)". The list stops at 1,000 values and says so.

**Each column holds one condition, and a row shows when it meets every column's.** A narrowed column's arrow is marked, so a person sees which columns narrow the table. A line above the table says how many rows are shown, with a button that shows every row again. The right-click menu's Filter group opens the same panel for the chosen cell's column. It can also show only the rows with that cell's value, or every row.

**A filter is a way of looking: the file keeps every row.** It belongs to the page, and lasts until it is cleared, the table is removed, or the page closes. A filter written into the file would hide rows from the next reader, the complaint Excel's saved filters draw. A formula counts every row, shown or not. The row being edited stays in sight until the edit is taken. Up, Down and Enter pass over the hidden rows. A new row shows every row again, since the filter would hide an empty row at once.

**Under the menu bar stands a quick access bar, as in Office: one row of the tools the person chose, as icons.** A ribbon's groups took three lines of height and still could not hold every command. The menus now hold them all, so the bar needs only the few a person uses most. Pointing at a tool shows its name and key. View, Quick access bar opens the chooser, which lists every command menu by menu, each with a box. A right-click on a command, in a menu or on the bar, adds it or takes it off.

**The bar keeps the menus' order, with a line between two menus' tools.** A tool is then found where its menu puts it, whatever order it was chosen in. A tool its menu hides, as Save in a page opened from a file, stands nowhere on the bar.

**The bar shows what stands at the caret, as Word's does.** The kind of block shows in its list, and Strong, Emphasis, a kind of list and an alignment are pressed in where they are on. Over a selection, a mark is pressed in where all the selected text has it. At a caret, it is pressed in where text typed there would take it. A tool that cannot act there is greyed out. Marks belong to text, so a heading takes them. A code block holds literal text and a cell a value, so the mark tools are greyed out there.

**The choice of tools is this browser's own**, as the width is, so nothing goes into the file. Reset brings back the tools every page starts with (`QUICK_DEFAULT` in `ksmd/port/web/commands.js`). They are the most used: saving, undo, finding, the looks of text, and Table and Sum. The font colour acts on the selected text, or on the chosen cells. The fill and size tools act on cells alone, so they are pressed only while a cell is the place. With nothing selected, a colour applies to the text typed next, as in Word; Automatic takes it away. The font and fill colour tools are split: the face applies the colour shown on it, and the arrow opens a palette. The palette holds Office's standard colours, "Automatic" or "No fill", and any other colour. Clear format takes colours, size, alignment and a cell's own number format away in one step, as Excel's Clear Formats does. In text it takes the colour and the paragraphs' alignment away; the marks stay, as part of what the text says.

**A look acts on the cells where a cell was worked in last, and on the selected text otherwise.** A press or a key in the text makes the text the place; opening or choosing a cell makes the cells the place. The page's own selection changes after an action do not count. Alignment on text aligns the paragraphs and headings the selection touches.

**Shift+click chooses a range of cells from the chosen one, and so does a drag across cells** ("Ranges of cells" below). The press opens its cell as usual. Once the drag reaches another cell, the open cell closes unchanged, and the range follows the pointer until the button comes up.

**The Number format group sets the format of the chosen cells**, in one step, as Excel does. Columns chosen whole, by their letters, take it as their own, which new rows follow. It holds General, Number, Thousands, Percent, Currency, More and Fewer decimal places, and two forms of a date: `2026-10-26`, the default, and `2026/10/26`. Currency asks for a code, and takes the places that currency's money is counted in: none for JPY and KRW, two for every other code. A cell shows the text the format gives, and the filter panel lists and matches that text.

**Cells copy and paste as Excel's do.** Ctrl+C on a range puts its values on the clipboard as tab-separated rows, which a spreadsheet takes. A number goes as calculated, not as its format shows it, so no digit is lost. A paste of such rows fills the table from the chosen cell, as one step, and the table grows the rows and columns it needs. Each pasted value reads as typed text does, and a number with thousands separators, as `1,234.5`, is a number. Rows pasted into text make a new table, whose first row gives the names. A refusal changes nothing.

**The document fills the window's width by default, with a margin of 32 pixels.** A table then has the room a spreadsheet would give it. View, Reading width keeps lines about 50 characters' widths long instead, for long prose. The choice belongs to the browser, not to the document.

**Ctrl+; types today's date, and Ctrl+: the time, as in Excel.** They work in a cell and in the text, and the Insert menu holds both. The date is written `2026-10-23` and the time `14:05`, ISO 8601's forms. They read the same in every country. In a cell, the date is a date and the time is text.

**A double-click on a column's border fits the column to its widest value on one line.** The border is the edge between two column letters, or the border between two cells. The table keeps its width, and the other columns share what is left in the proportions they had. The fit is one step of undo, and saves as `widths`, as a drag does. A row has no height in the source. It is always as tall as its content, so a double-click on a row's border has nothing to set.

**A cell is chosen when the mouse button goes down, not on the click.** The press takes the caret out of its gap, and a gap above the table then goes. The table moves up a line under the mouse, so the button would come up on another element, and no click would come. For the same reason, the second press of a double-click opens the cell the first chose, wherever it lands.

**While a person works in a table, the page draws no caret in the text.** A cell or a range is chosen, or a cell is open. The format has no empty paragraph, so a caret beside a table would stand in a gap. That gap would push the table down a line after each action, and the next press would miss. So the table stays where it is, and the keys go to the chosen cell. Esc on a chosen cell, a press in the text, and an arrow key past the table's first or last row leave the table. The caret then comes back where the model holds it, in a gap too.

**Dragging the edge between two column letters resizes the two columns beside it.** They share their width anew, and every other column keeps its weight. The page shows the new widths while the mouse moves. When the button comes up, the table's `widths` change in one step of undo, and no cell changes. A press that does not move changes nothing.

* **The page turns pixels into weights.** A table without `widths` first takes weights from its columns' widths on the page, about 1,000 in all.
* **All weights are multiplied by one whole number before the two columns share theirs.** The two then have about 1,000 steps to share, and the other columns keep their proportions exactly. The writer divides the weights by their greatest common divisor again.
* **No weight passes 10,000 or falls below 1**, the bounds the reader takes.

**In a cell, chosen or open, Alt+Right makes its column wider and Alt+Left narrower, by a twentieth of the table's width.** Left to the browser, the keys would go back or forward a page, out of the editor. The width comes from the column on its right, or for the last column from the one on its left. Each press is one step of undo, and the cell stays open for the next. The keys work in the cell because a keyboard already reaches a cell, and resizes the column being worked in. An edge that takes the focus would be one more stop for Tab on every table. A table of one column has no width to share, and the page says so.

**An image and an include show what their clauses say.** Opened from a file, the page shows an image's path, alternate text and caption, and a marked box naming an include's path. Served by the local server, it shows the image and the included blocks in place ("The file lifecycle" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md)).

**A paste takes the clipboard's plain text.** Each line starts a block of the caret's kind. When the clipboard also held formatting, the page says that it was not kept.

**The page is built as wasm32 with no C library.** Clang's bulk-memory instructions copy and fill memory, so no C routine is linked.

**The page is one file.** `ksmd/port/web/bundle.kspl` puts its style, its scripts and its wasm, as base64, inside `ksmd.html`. So the page opens from a file, and the local server hands it out alone.

**Opened from a file, the page reaches no file: a host opens and saves through two calls.** `ksmd.load(source)` opens a source; a refused source leaves the open document as it was, and the result names the line and column. `ksmd.source()` returns the canonical source to save. `ksmd.onchange` learns of each change.

**The editor's memory is a fixed 128 MiB.** An action that starts with less than 16 MiB free is refused, and the page asks the person to save and open the document again. The document and its whole history stay in that memory until another document opens.

## Ranges of cells

**A range of cells runs from the chosen cell to a far corner.** Shift+click reaches it from the chosen cell, and so do Shift and an arrow key. A press on a row number chooses that row. A press on a column letter chooses that column's data cells. Shift with either press reaches from the chosen cell's row or column.

* **Shift and an arrow key extend a range from an open cell**, as in a spreadsheet. Once the caret stands inside the cell's text, Shift+Left and Shift+Right select text instead.
* **The range keeps the identities of its rows and columns, as a formula's range does.** A row added above it, a sort or an undo leaves it on the same cells. The page keeps no element and no place on the page across an action.
* **On a chosen cell that is not open, the keys act on the range.** Delete and Backspace clear its cells as one step, and each cell keeps its look. F2 opens the chosen cell, and a typed character opens it with that character in place of its value. An input method composes from the first key too. The focus stands in an invisible text box over the chosen cell. Windows keeps an input method off where no text can be typed. On the cell itself, the first key went in as a letter ("bい" for "び"). What is typed or composed in the box opens the cell. The box itself becomes its input, so a composition goes on unbroken. Enter moves the choice down and Tab right, Shift back. Ctrl+; and Ctrl+: type today's date or the time into it. Ctrl+Z and Ctrl+Y undo and redo, as in the text. Esc first leaves the chosen cell alone, then leaves the table.
* **Copy, cut and paste act on the range.** A paste of one value fills every cell of the range. A paste of rows fills the table from the range's corner.
* **A look applies to every cell of the range in one step.**

## Filling cells

**Ctrl+D fills a range down from its top row, and Ctrl+R right from its left column**, as in Excel. A range of one row fills down from the cell above it. A range of one column fills right from the cell left of it. The right-click menu holds both, and each fill is one step of undo.

* **Each cell is copied through the model's copy of a cell** (`copy_cell` in `ksmd/edit/edit.kspl`). A reference without `$` shifts as far as the copy moves, and a part with `$` stays. The copy takes the cell's look too.
* **A fill is refused whole.** A copy that would write a formula longer than 4,096 bytes puts back every cell copied before it.
* **The square at a range's lower right corner fills by a drag.** A drag down or right repeats the range's cells over the cells it reaches. The square stands under the pointer, so no key or menu is needed for it.
* **A drag of the square goes on with a series, where the cells make one; Ctrl+D and Ctrl+R always copy**, as in Excel (`ksmd/edit/series.kspl`).
  * **Two or more numbers with one step between each go on by that step**: `1, 2` gives `3, 4`, and `10, 7.5` gives `5, 2.5`. The arithmetic is in decimal digits, so `0.1, 0.2` gives `0.3`.
  * **Text that ends in a number goes on by its step, or by one from a single cell**: `Item 1` gives `Item 2`, and `Q1, Q3` gives `Q5`. A number with leading zeros keeps its width: `Week 08` gives `Week 09`.
  * **Anything else repeats**: one number alone, numbers whose steps differ, a formula, a mix of kinds. A single number repeats because the person most often wants copies of it, and two cells show the step meant. A date or a time written as text repeats too, since its last number is a day or a minute. A date cell goes on by days.
  * **Excel fits a straight line through steps that differ.** Here they repeat, so every value a fill writes is one a person can work out from the cells.
* **Ctrl+D and Ctrl+R act only while a cell or a range is chosen.** Elsewhere the browser keeps them, to bookmark the page and to load it again. Inside a table, a person reaches for a fill, and undo takes a wrong one back.

## Exporting a table

**The right-click menu's Export as CSV downloads the table**, so another program can take its values. Copying a range already gives tab-separated rows, which Excel pastes.

* **The file holds the names, then each row's calculated values**, every row whether a filter or a group hides it. A formula gives its result, since the other program reads no ksmd formula.
* **A number is written as the table shows it before any format**, with `.` for its point and no separators. Another program then reads it as a number; a format is a way of showing.
* **A value is quoted only where it holds a comma, a quote or a line break**, and a quote inside is doubled. Lines end in CR LF, as RFC 4180 writes them.
* **Text that starts with `=`, `+`, `-`, `@`, a tab or a CR gets a `'` before it, and is quoted.** A spreadsheet would run such text as a formula, and a formula can open a link or start a program. The `'` shows in the cell, and the text stays text. A number is never changed, so `-5` stays a number.
* **The file is UTF-8 with a byte order mark.** Without one, Excel reads the bytes in the computer's own code page, and text outside ASCII comes out wrong.
* **The file is named after the table**, with the characters a file name cannot hold made `_`.

## Find and replace

**Ctrl+F opens a find bar under the quick access bar, and Ctrl+H opens it with its replace part.** The Edit menu and the bar's Find tool open it too. A short selection on one line becomes the search text.

* **Find looks in the text the page shows, and in each cell's text as a person edits it.** So a formula's source is searched, and its calculated value is not. Replace changes what is written, and a calculated value holds nothing written to change.
* **A match can cross formatting.** `**bold**words` holds "boldwords", since a reader sees one word there. A match stays inside one paragraph, heading, list item, code block or cell.
* **Without Match case, each character is compared in lower case.** Each character is folded alone, so a match keeps the text's own places in every script.
* **Enter and F3 go to the next match, and Shift+Enter and Shift+F3 to the one before.** The bar says which match is current, and of how many. A search starts from the caret.
* **The matches show without any change to the page's text.** Matches in text show through the browser's highlights, which add no element. So the find bar never disturbs an input method's composition. A cell that holds a match is marked as a whole.
* **Typing in the find bar never changes the document.** Only Replace and Replace all act on it.
* **Replace changes the current match, and the next match becomes the current one.** Replace all changes every match as one step of undo, prose and cells together.
* **The new text takes the marks of the first character it replaces.** So a bold word stays bold, and text inside a link stays in the link.
* **A replace is refused whole**, as every action is. A cell text the file cannot hold changes nothing. A match that no longer stands where it was found also changes nothing.
* **Esc closes the bar and selects the current match**, or chooses its cell, so the person goes on from there.
* **Find does not look in an included file's blocks, nor in rows a filter hides.** An included file edits in a tab of its own. A hidden row stays out, so Replace all changes nothing a person cannot see.

## The heading row of a long table

**A table's column letters and names stay in sight under the header while the page scrolls through the table.** The heading sticks within the page's own scroll (`position: sticky` on the table's `thead`).

* **A table never scrolls in a box of its own.** A box would take the mouse wheel in the middle of a document. Its heading would also hide under the header once the page scrolled on past the box's top.
* **Every table's heading sticks, and no source notation chooses it.** A short table never scrolls under the header, so it looks the same. A choice per table would change the file for a way of looking.
* **The column edges stand in the letters, so a drag resizes a column wherever the table is scrolled.**
* **On paper, the heading is the table's own `thead`, which the browser repeats on each page.**
* **A table wider than the page reaches past it, and the page scrolls sideways.** A box that scrolled sideways would hold the heading inside it, and the heading could not stick to the page.

## Colour rules on the page

**The right-click menu's Columns group holds Colour by value…, which opens a small panel over the table.** It holds the condition, its value and a style. The condition is below, above, equal to, empty, or no rule. The styles are Excel's ready-made pairs, such as a light red fill with dark red text, so a person picks one rather than two colours. Apply sets the rule as one step; Esc or a press outside closes the panel.

## Notes on the page

**A cell with a note has a red corner, as in Excel. A paragraph or a heading with one has a bar at its left.** Pointing at it shows the note.

* **Insert, Note asks for the note of the chosen cell, or of the paragraph the caret stands in.** An empty answer resolves it.
* **The table's right-click menu holds Note… and Resolve note.** Each change is one step of undo.

## Choices on the page

**The right-click menu's Columns group holds Choices…, which asks for the column's list as one line**, such as `Open, In progress, Done`. An empty line clears it.

* **An open cell of the column offers the list while one types** (an HTML `datalist`), and the list narrows to what matches.
* **A value off the list stays in its cell to be put right, and the page says why**, as a spreadsheet keeps a refused value. Esc drops it. Leaving the cell another way drops it too.
* **A cell that holds a value off its column's list has a wavy underline**, and its title names the choices.

## Groups of rows on the page

**A table's outline stands left of its row numbers**: one column of marks per level of groups (`outline.js`).

* **Each group has a button on the row above it: − while its rows show, + while they are hidden.** The button never stands on a row of the group, since a hidden row could not hold the button that shows it again. Above the first data row stands the names' row.
* **A line runs down beside the rows of a group that shows**, and ends with a short foot on its last row.
* **The right-click menu's Group flyout holds Group rows (Alt+Shift+Right), Ungroup rows (Alt+Shift+Left), Hide detail and Show detail.** Excel's Data, Outline holds the same. They act on the chosen cells' rows.
* **A row shows only when neither a hidden group nor a filter hides it.** Up and Down pass over hidden rows either way.

## AutoSum

**Sum (Alt+=) puts a total in the chosen cell**, as Excel's AutoSum does (`autosum.js`). The Table menu's AutoSum flyout also gives Average, Count numbers, Max and Min, as does the right-click menu's.

* **In one cell, it types `=sum(...)` over the whole column above, and leaves the cell open with the range selected.** Enter takes it, and typing changes the range. Where nothing stands above, it takes the row to the left.
* **The range is the whole column above, not the numbers up to the first gap.** A range cut at an empty cell would leave out the numbers above it. `sum` leaves out empty cells and text, and the names' row is never in the range.
* **With a range chosen, each column of numbers gets its total under them, as one step.** It goes in the range's last row where that row is empty, or else in the row under the range. The table gains that row where it ends. A row under the range that holds a value is never written over.
* **A row added after the last row of the sum stays outside it**, as "How references follow edits" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md) says. To grow a total, insert inside its range.

## Print and PDF

**File, Print or save as PDF (Ctrl+P) opens the browser's print dialog, which also saves a PDF.** Print and PDF are then one output, made by the same rules, so they never differ.

* **The output shows the document, and nothing only editing uses.** The menus, the quick access bar, the status line and the contents go. So do the column letters, the row numbers, a table's name, the filter arrows and the line above a filtered table. Remove, Edit and Leave out of print go too, with an include's frame, the marks of notes and choices, and the chosen cells.
* **Rows a filter or a closed group hides stay hidden on paper, as in Excel.** So a printout shows what the person sees.
* **A divider ends a page.** Its line still shows at the page's end.
* **The page always prints light, and the author's fills and colours print as the page shows them.** The browser would otherwise leave background colours out.
* **A table fits the page.** A number or a date stays on one line, and a long word, such as a URL or a path, breaks where it must. Kept whole, it widened its column past the page, so the table stood off the page's middle. The width left over goes by the columns' weights. Scaled down whole, a table set out for a wide window would break a short date apart.
* **The row numbers' column keeps its place with no width.** Taken out of the rows, it would move every value one column to the left, under another column's name.

**A table, chart, image or include can be left out of the output: `invisible="printing"` in its clause.** A table that only feeds a chart is the usual case. It still calculates, and the chart still draws from it.

* **The attribute names the exception, so a clause without it prints.** A new block is in the output until its author says otherwise.
* **While editing, such a block has a dashed frame and the words "Not in print or PDF"**, so its author always knows.
* **The table menu's Table flyout holds Leave out of print. A chart, an image and an include have the button beside Remove.** Each change is one step of undo, and the button reads Put back in print once it is set.

## Repeat

**With nothing to redo, Redo becomes Repeat, as in Office: Ctrl+Y or F4 does the last command again where the person works now.** Insert column right then F4 inserts another column; Bold on one word then F4 makes the next selection bold.

* **The button reads Repeat while it repeats, and Redo while something is left to redo.** Undo always comes back first.
* **A command that asks for something is not repeated**, such as Rename or a note. Nor are typing and pasting.
* **Any other change forgets what would be repeated**, so F4 never repeats a command from before the person typed.

## Read-only

**View, Read-only shows the document and takes no edit**, as Word's Read Mode and Excel's Protected View do. A person reading a file then changes nothing by a stray key.

* **The blocks' buttons go, the commands that edit cannot be pressed, and a Read-only mark stands beside the document's name.**
* **Every action that changes the document is refused at one place**, the call that runs it, so no key, paste or drop gets past.
* **What only looks still works**: finding, filters, the contents, printing, saving a copy and exporting CSV. A press on a cell chooses it without opening it, so a range's sum still shows.
* **A press on a link opens it in a new tab.** While editing, a press places the caret, and Ctrl+press opens the link. The page's own tab never follows a link, since it holds the unsaved edits and the local server's token.
* **The choice is this browser's own and is kept**, as the page's width is. Nothing goes into the file.

## The figures in the status line

**With two or more cells chosen, the status line's right end shows their sum, average and count**, as Excel's status bar does (`figures.js`).

* **The sum and average take the numbers alone. The count takes every cell that holds a value.** Rows a filter hides are left out.
* **Otherwise it shows the words and characters of the selection, or of the whole document.** A word is a run of letters or digits. Japanese has no spaces between words, so the count of characters stands beside it.

## A dark scheme

**The page follows the system's choice of a light or a dark scheme**, through `prefers-color-scheme`. It has no switch of its own, so one setting rules every program.

* **The page's own colours are tokens, and the dark scheme gives them other values.** The document's colours are not tokens: they are the author's, and a print shows them.
* **A cell with a colour or a fill of its own keeps a white ground and dark text in both schemes.** Yellow text on a dark ground, or light text on a yellow fill, would be unreadable.

## The contents

**View, Contents shows the document's headings in a panel at the window's left**, each indented by its level, as GitHub's outline does.

* **A press on a heading scrolls to it, and puts the caret at its start.** A heading shown from an included file only scrolls, since it does not edit here. Its file's path stands beside it.
* **The heading being read is marked as the page scrolls**: the last one above the top of the reading area.
* **The list follows every edit.** An action that changes no heading builds no list.
* **Whether the panel shows is kept in the browser's storage, for each viewer.** It is a way of looking, so it stays out of the file. Where storage is off, the panel starts hidden.

## A touch screen

**On a touch screen, a long press on a cell opens the table's menu, and a double tap opens the cell** (`touch.js`). They stand where a mouse would right-click and double-click.

* **A single tap chooses the cell**, through the mouse events the browser makes of a tap.
* **A finger that moves more than a few pixels scrolls**, and presses nothing.
* **A cell takes no text selection and no callout of its own.** Without that, the system's own menu would cover the table's.
* **In a narrow window the quick access bar is one row that scrolls sideways**, so the document keeps the height.

## The page and its files

Served by the local server, the page opens and saves files itself. The file lifecycle is "The file lifecycle" in [`DESIGN-ksmd.md`](DESIGN-ksmd.md); this section gives the page's own choices.

* **One tab holds the server open for all the page's tabs on it.** A browser opens six connections to one server. A hold in each tab would use them all with six tabs open, and no save could go out. The tabs share one lock (`navigator.locks`), and when the holder closes, another tab takes the hold over.
* **Text typed in a cell still open is unsaved at once, and its draft holds it.** The draft keeps the open cell's text beside the document's source, and brings it back as that cell's value. Taking the cell to hold a draft would close it under the person's typing.
* **A draft brought back first holds aside the edits made since the document opened**, as a draft of their own. So neither version is lost.
* **The open document's path, its file's digest and its saved text are one record in `ksmd/port/web/file.js`, changed in one place.** The editor, the menu bar, the window's title and the address follow from it. Each kept its own copy before, so a document that did not open could leave the address naming it. A reload then opened that file again in place of the edits.
* **A change time in the same second as the ask cannot rule out a later write.** The server gives the time in whole seconds. A write of the same size later in that second leaves both answers alike. So until an ask comes in a later second, the page compares the file's bytes too. After its own save, the page compares them once, since another program can write between the save and the ask.
* **Whether a draft is held is the answer of the last write, not whether the browser has storage.** A browser whose storage is full opens its store, but every write fails. A check of the store alone let the page open another document, and the edits went.
* **Where no draft could be held, leaving a document with unsaved edits asks first**: save, discard, or cancel. Opening another document would otherwise lose the edits without a word. A change on disk then offers to load the file's version only as a discard.
* **Leaving the page asks first while no draft holds the latest edits**: in the second after typing, and where no draft can be held. A draft written as the page goes may not land before the page closes.
* **A document named in the address that does not open leaves the address.** The new document is then open, and its draft is offered.
* **Text typed in a cell that the editor refuses stays in its cell**, as a spreadsheet keeps it, and the draft holds it. A save writes nothing, another document does not open, and a menu command does nothing until the text is put right or Esc drops it. A press in the menu bar or in a dialog leaves the cell open. Before, each of them took the cell, the text went, and the next draft let it go.
* **Save As into another folder writes each include's and image's path again, so it names the same file from there.** A path is read from the document's folder, so kept as it was, it would name another file. The rewrite is one step of undo, and a save that fails takes it back (`ksmd/port/web/moving.kspl`).
* **Pasted text larger than a document can hold is refused before it reaches the editor.** The editor's memory is a fixed buffer, and a request that cannot be met stops the page.

## What the editing page does not do yet

* It does not convert a rich paste; it takes the plain text and says so.
* Find has no whole-word search and no regular expressions. It does not search table names.
* A browser without the highlight API (`CSS.highlights`) marks no match in text. The current match still scrolls into sight, and the count still shows.
* A filter's hidden rows are filled as the shown ones are.
* Columns cannot be grouped; only rows can.
* It never trims the undo history. A long session can use up the editor's memory, and the page then asks the person to save and open the document again.
* The browser checks run in headless Chromium alone. Firefox, Safari, a real input method on a real keyboard and screen readers are not checked.
* A person switching tabs in a desktop browser is not checked: the checks send the focus event themselves, and hide the page by script.
