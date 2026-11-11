# The ksmd editing page: a reference

**This reference is for a person who writes documents in ksmd.** Look a task up by its section, or a key in "Every command and its key" at the end. A first walk through the page is [`TUTORIAL-ksmd.md`](TUTORIAL-ksmd.md).

## Opening and saving

**A document is a `.ksmd` file inside a workspace folder.** Every include and image a document names stands inside that folder.

* **Open a document by a double-click on it**, once `make ksmd` and `make install` have tied `.ksmd` files to ksmd. "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md) gives the steps for each system.
* **Or run `make ksmd-open FILE=<path>`** from the repository's root. The file must stand already; an empty document is the one line `%ksmd 2`.
* **The workspace is the document's own folder**, or the nearest folder above it that holds a file named `.ksmd-workspace`.

| To | Do |
| :-- | :-- |
| Open another document | File ▸ Open… (`Ctrl`+`O`), then choose it in the dialog |
| Save | File ▸ Save (`Ctrl`+`S`). A document with no file yet asks where it goes |
| Save under another name | File ▸ Save as… (`Ctrl`+`Shift`+`S`) |
| Print, or save a PDF | File ▸ Print or save as PDF… (`Ctrl`+`P`) |
| Set the paper, the header and the footer | File ▸ Page setup… ("Page setup, numbers and references" below) |

**Unsaved edits are kept as a draft in this browser.** The menu bar then reads "Not saved. A draft is held in this browser."

* **A draft never changes the file.** Opening the document again offers to bring the draft back, or to discard it.
* **A draft goes when you save, discard it, or undo back to the file's text.** Drafts older than 30 days go when the page starts.

**When another program changes the file, the page says so and writes nothing.** Its notice offers to replace the file with your version, or to load the file's version and keep yours as a draft.

**Opened from the file `ksmd.html` alone, without the local server, the page opens and saves no file.** Its File menu then holds Page setup and Print alone.

## The window

| Part | What it does |
| :-- | :-- |
| Menu bar | Every command: File, Edit, View, Insert, Format and Table |
| Quick access bar | One row of the tools you chose. View ▸ Quick access bar… chooses them; a right-click on a command adds it or takes it off |
| Formula bar | The chosen cell's address and its whole text, as `C2  =hex_to_dec(B2)`; a range shows `C2:D5`. Press in it to edit the cell there (The formula bar below) |
| Status bar | One line at the foot, which says where you work (The status bar below) |
| View ▸ Contents | The headings at the window's left; a press on one scrolls to it. The ▸/▾ before a heading folds the headings under it; with `Alt`, every heading of its level |
| View ▸ Full width, Reading width | The document fills the window, or keeps lines about 50 characters long |
| View ▸ One line per cell | Every table row shows one line; a cell shows whole while it is edited |
| View ▸ Read-only | The page takes no edit. Finding, filters, printing and links still work |

**Every part works with keys alone:**

| To | Do |
| :-- | :-- |
| Reach the menu bar | `F10`. `F10` again, or `Esc`, gives the focus back where it was |
| Move along the menu bar or the quick access bar | `←` and `→`; `Home` and `End` go to the first and last. Each bar is one stop of `Tab` |
| Reach the formula bar | `Tab` after the quick access bar, so `F10`, then `Tab` twice, from a chosen cell |
| Open a menu from its name | `↓`, `Enter` or `Space`; `↑` opens it on its last item |
| Move in a menu | `↑` and `↓`, `Home` and `End`; `→` opens a flyout and `←` closes it |
| Close a panel, such as Page setup | `Esc` or Cancel. The focus goes back where it was before the panel opened |

### The formula bar

* **It shows the chosen cell's address and its whole text as typed**, on one line. A column's name cell shows `C name` and the name. A range shows its address alone, and takes no edit.
* **A press in it, or `Tab` to it, edits the chosen cell there.** It grows with a long formula, up to eight lines, and scrolls past them. The cell shows what you type, framed with dashes.
* **It edits as the cell does:** `Enter`, `Tab` and `Esc`, the list of functions, the colours of references, the marked brackets and AutoCorrect all act the same. The arrow keys move the caret, as after `F2`.
* **In Read-only, outside a table and on a table shown from an included file, it shows the text and takes no edit.** You can still choose and copy its text.

### The status bar

| Part | What it shows or does |
| :-- | :-- |
| Why it shows an error | The mark and its reason, as `#VALUE!: B7 holds text, which arithmetic cannot use`. Its tooltip holds a long reason whole |
| The document's own functions | Which ones the chosen cell calls, as `Uses tax from mine.kspl (this document's own)` |
| Note | The note on the chosen cell, or on the paragraph or heading at the caret, as `Note: Count again` |
| Message | What the last action said, until the next one |
| Filter | `5 of 120 rows shown` while a filter hides rows of the chosen table |
| Page | The printed page the caret or the chosen cell stands on, as `Page 3 of 12` |
| Figures | With two or more cells chosen, the figures you picked: Average, Count, Numerical count, Min, Max, Sum. Otherwise the lines and characters of the selection or the document |
| Zoom | `−`, the level and `+` scale the document alone, from 50% to 200% |

* **A right-click on the bar, or a press on the figures, chooses the figures.** Each item shows its value for the chosen cells. Average, Count and Sum show until you choose, and this browser keeps your choice.
* **A line is a line as written**: each paragraph, heading, list item, quote and code line, and each line break typed in one. A character is one you see; spaces are not counted. Table cells are not counted.
* **The page is counted on the paper Page setup names, A4 where it names none.** The print dialog's own paper, margins or scale can change it. A document of more than 15,000 page elements shows no page.
* **The zoom leaves the menus, the bars, the file and the print as they are.** View ▸ Zoom in (`Ctrl`+`Alt`+`=`), Zoom out (`Ctrl`+`Alt`+`-`) and Zoom 100% do the same. This browser keeps the level.

**The page follows the system's light or dark scheme.** Your own colours in a document print as you chose them.

**Undo is `Ctrl`+`Z`, and Redo `Ctrl`+`Y`.** With nothing left to redo, `Ctrl`+`Y` or `F4` repeats the last command where you work now. In a cell open on a formula, `F4` turns a reference's `$` instead (Formulas below).

## Writing text

**What you type stays as typed.** A `#`, `*` or `:::` at a line's start stays text; the menus make structure.

| To | Do |
| :-- | :-- |
| Make a heading | Format ▸ Kind of block ▸ Heading 1 to 6 (`Ctrl`+`Alt`+`1` to `6`) |
| Make a plain paragraph again | Format ▸ Kind of block ▸ Paragraph (`Ctrl`+`Alt`+`0`) |
| Make a list or a checklist | Format ▸ Bulleted list, Numbered list or Checklist. A press on a checklist's box ticks it |
| Nest a list item | Format ▸ Indent (`Tab`); Outdent is `Shift`+`Tab` |
| Quote | Format ▸ Quote |
| Write code | Format ▸ Kind of block ▸ Code block, or Inline code (`Ctrl`+`E`) |
| Make words strong or emphasised | Format ▸ Strong (`Ctrl`+`B`), Emphasis (`Ctrl`+`I`) |
| Link words | Insert ▸ Link… (`Ctrl`+`K`): an `https:`, `http:` or `mailto:` address, or `#` and a heading's text |
| Colour words | Format ▸ Font colour… |
| Align a paragraph or a heading | Format ▸ Align left, Centre, Align right. Pressed again, it is taken off |
| Take colours and alignment away | Format ▸ Clear format. The kind of block and the marks stay |
| Part the document | Insert ▸ Divider. On paper a divider ends a page |
| Leave a blank line | `Enter` on an empty line between two blocks. Each press adds one; `Backspace` after it, or `Delete` before it, takes it away |
| Type today's date or the time | Insert ▸ Today's date (`Ctrl`+`;`), Time now (`Ctrl`+`:`) |
| Note a paragraph | Insert ▸ Note… (`Shift`+`F2`). An empty note resolves it |
| Find and replace | Edit ▸ Find… (`Ctrl`+`F`), Replace… (`Ctrl`+`H`). `Enter` and `F3` go to the next match |
| Go to the document's start or end | `Ctrl`+`Home`, `Ctrl`+`End`, also past a table, a chart or a diagram there. Or press below the last block |

**A paste takes the clipboard's plain text.** Where the clipboard also held formatting, the page says it was not kept. Rows of tab-separated values pasted into text make a table.

**An image goes in by Insert ▸ Image…, a paste, or a drop.** It takes a PNG or a JPEG, and asks nothing. The file is written in the document's data folder, such as `OfficeMemo-data/image-1.png`, so the document needs a file first. Caption… in the image's tools gives it a caption, which a reference can name. Alt text… gives it a description for someone who cannot see it. A screen reader passes over an image with none, as decoration.

**Insert ▸ Include… shows another document's blocks in place.** Its Edit button opens that document in a tab of its own.

**A document's data folder holds the files ksmd writes for it.** It stands beside the document, named for it: `OfficeMemo.ksmd` keeps its images in `OfficeMemo-data/`. Insert ▸ Include… and Insert ▸ Functions file… offer a new file there too. A file you choose elsewhere is used where it stands.

**Insert ▸ Functions file… adds the document's own functions, written in KSPL** ("Your own functions" below).

## Tables

**Insert ▸ Table puts a table of three columns and two rows at the caret**, with its first name open to type.

### Choosing and editing cells

| To | Do |
| :-- | :-- |
| Choose a cell | Press on it. `Enter` moves the choice down and `Tab` right, and with `Shift` up and left. The arrow keys move it too |
| Go to the edge of the values | `Ctrl`+an arrow key: to the last value before an empty cell, or over empty cells to the next value |
| Go to a row's first or last cell | `Home`, `End` |
| Go to the first data cell or the last cell | `Ctrl`+`Home`, `Ctrl`+`End` |
| Add a row at the end | `Tab` in the last cell. `Tab` past a row's last cell goes on to the next row's first |
| Edit a cell | Press twice, or press `F2`: the arrow keys then move the caret inside the cell. Typing on a chosen cell replaces its value, and an arrow key then moves to the next cell |
| Edit a long formula | Press in the formula bar, under the quick access bar. It edits the chosen cell with the window's width |
| Take the edit | `Enter`, `Tab`, or a press elsewhere. `Shift`+`Enter` takes it and moves up. `Esc` drops it |
| Give back the value you typed over | `Esc` or `Ctrl`+`Z`, while the cell you typed into is still open |
| Type a line break in a cell | `Alt`+`Enter` |
| Leave the table | `Esc`, a press in the text, or an arrow key past the first or last row. An arrow key puts the caret on the text after the table, or before it |
| Choose a range | `Shift`+press, `Shift` with any key that moves the choice, or a drag across cells |
| Choose whole rows or columns | Press on their row numbers or column letters. `Shift`+`Space` chooses the rows of the chosen cells, and `Ctrl`+`Space` their columns |
| Choose the whole table | `Ctrl`+`A` twice, the corner left of the letters, or Table ▸ Table ▸ Select table |
| Clear the chosen cells | `Delete` or `Backspace`. On the whole table, they remove it |

**A right-click on a cell, a row number or a column letter opens the table's menu there.** `Shift`+`F10` opens it from an open cell.

**A screen reader reads a table as a grid.** A chosen cell says its value and address, such as `6, C1`, then its formula, the reason for its error, its note and its link. A range says how far it reaches.

**What you type in a cell is read as one of four kinds of value:**

| You type | It is |
| :-- | :-- |
| `12`, `-3.5`, `1e3` | A number |
| `2026-10-23` | A date |
| `2026/10/23`, `2026/1/5`, `11/6` | A date, while Edit ▸ AutoCorrect ▸ Turn typed dates into dates is on. `11/6` falls in the year the document was opened. The file keeps `2026-11-06` |
| `=B1*C1` | A formula ("Formulas" below) |
| `"11/6"`, in quotes | Text, whatever it looks like. Inside the quotes every character is itself, `\` included, and a quote is written twice, as in a formula: `"say ""hi"""`. The file still writes the text in JSON's quotes |
| `https://example.com` | Text that links to that address, while Edit ▸ AutoCorrect ▸ Turn typed web addresses into links is on |
| Anything else, `1,234.5`, `0xFF` and `true` among it | Text. A number in hexadecimal or binary is written in a formula: `=0xFF` |

**Right after a typed value turns into a date or a link, `Ctrl`+`Z` gives back the text as you typed it.** A second `Ctrl`+`Z` gives back what the cell held before. The AutoCorrect choices are this browser's own, and all start on.

### Copying, moving and filling

* **`Ctrl`+`C` copies the chosen cells.** Another program, such as a spreadsheet or a text editor, takes their shown values as tab-separated rows. A paste of rows from another program fills the table from the chosen cell, and grows it as needed.
* **A paste in ksmd (`Ctrl`+`V`) brings the copied cells' formulas**, in any table and in another ksmd window. Each reference moves as far as the paste moved from the copy. A part with `$` stays, and a reference moved outside its table becomes `#REF!`.
* **Paste values (`Ctrl`+`Shift`+`V`) puts the values the copied cells showed**, with no formula. Edit ▸ Paste values and the right-click menu do the same.
* **Copy formula copies one cell's text as typed**, such as a whole formula, as plain text for another program. It stands in the right-click menu and the Edit menu. Text chosen in the formula bar is copied as chosen.
* **After a paste of copied cells, the Paste options button stands below their right corner.** Choose Keep formulas or Values only there to change that paste; one undo still takes it away. `Ctrl` alone opens the button's menu, and `F` or `V` chooses. The next key or press takes the button away.
* **A range that holds the copy a whole number of times takes it in each place.** So one cell pasted on ten rows fills all ten.
* **A whole table copied and pasted into text makes a second table**, with its formulas and looks. A name already taken gains `_2`.
* **`Ctrl`+`X` then a paste moves cells within their table.** Formulas that named them follow them. Whole columns cut by their letters also take their settings. These are width, number format, choices, colour rule, filter, Merge repeated values and Colour rows by this column. A copy, or `Esc`, drops the cut. Paste values does not move cut cells: press `Ctrl`+`V`, or copy them instead.
* **To move rows, cut them by their row numbers, then right-click a row number and choose Insert cut rows.** Columns move the same way.
* **Fill down (`Ctrl`+`D`) and Fill right (`Ctrl`+`R`) copy the first cells across the range.**
* **A drag of the square at a range's corner goes on with a series**: `1, 2` gives `3, 4`, and `Item 1` gives `Item 2`. Anything else repeats.
* **Delete, a copy, a fill and Remove row act on the rows in sight alone.** Rows a filter or a closed group hides keep their cells. Insert row above inserts one row for each row in sight. A cut over a hidden row is refused, and so is a paste of a cut onto one: show all rows first, or copy instead.
* **A paste fills row after row from the chosen cell, hidden rows included**, as in Excel.

### Rows and columns

| To | Do |
| :-- | :-- |
| Insert or remove rows or columns | Table ▸ Insert row above, Insert row below, Remove row, and the same for columns. Each acts on every row or column the range spans |
| Sort by a column | Table ▸ Sort ▸ Sort ascending or Sort descending. Empty cells stand last |
| Show only some rows | The arrow on a column's name, or Table ▸ Filter ("Filters" below) |
| Group rows or columns | Table ▸ Group ▸ Group rows (`Alt`+`Shift`+`→`), Group columns. The −/+ button beside them hides and shows them |
| Set a column's width | Drag the right edge of its letter, or Table ▸ Size ▸ Column width… in characters, 0.5 to 255 |
| Fit a column to its text | Double-click the right edge of its letter, or Table ▸ Size ▸ Fit column width |
| Set a row's height | Drag the bottom edge of its number, or Table ▸ Size ▸ Row height… in points, 6 to 409 |
| Fit a row to its lines | Double-click the bottom edge of its number |
| Widen or narrow a column by one character | `Alt`+`→` and `Alt`+`←` in a cell |
| Show a long text on several lines in its cell | Format ▸ Wrap text, or Table ▸ Look ▸ Wrap text. Pressed again on a cell that wraps, it stops. A line break typed with `Alt`+`Enter` turns it on |

**A table is as wide as its columns.** A wide table makes the page scroll sideways; its row numbers and first column stay in sight. Its column letters and names stay in sight while you scroll down.

**A cell's text runs on over the empty cells to its right**, and is cut where the next cell holds a value. A number too wide for its column shows `###`. A cell set to wrap breaks its text into lines at the column's width instead, and its row grows to show them.

**After Ctrl+A or a press on column letters, a drag or a double-click on one edge sets every chosen column.** Rows work alike.

**A column with no width set fits its text, from 3 to 60 characters.** A row with a height set cuts text taller than it.

### Filters

**The arrow on a column's name opens a panel** with the two sorts, a search box and the column's values with tick boxes. OK shows only the rows ticked.

* **A condition stands folded under the list**: is, is not, contains, is greater than, is less than, is empty, is not empty.
* **A column of dates lists its years, then months, then days.**
* **A line above the table says how many rows show**, and its Show all rows takes every filter away.
* **The file keeps the filter**, so the document opens with the same rows shown. Formulas still count every row.
* **In Read-only, a filter is yours alone**, and the file keeps its own.
* **A row you edit stays in sight**, even when its new value does not match. OK in the panel applies the filter to every row again.

### Looks and formats

| To | Do |
| :-- | :-- |
| Colour a cell's text or its ground | The quick access bar's Font colour and Fill colour, on the chosen cells |
| Set a cell's font size | Format ▸ Font size |
| Format numbers | Table ▸ Number format: General, Number, Thousands, Percent, Currency…, Date, and more or fewer decimal places |
| Offer a column's values as a list | Table ▸ Choices…, such as `Open=red, Done=green`. Colours are red, yellow, green, blue, orange, purple and gray |
| Colour each row by a column's choice | Table ▸ Look ▸ Colour rows by this column |
| Colour cells by their value | Table ▸ Look ▸ Colour by value…: below, above, equal to, empty, or a colour scale |
| Show a repeated value once, as merged | Table ▸ Look ▸ Merge repeated values |
| Show a value centred across empty cells to its right | Choose the cells, then Format ▸ Centre across columns, or Table ▸ Look ▸ Centre across columns |
| Write a note on a cell | Table ▸ Note… (`Shift`+`F2`); a red corner marks it |
| Link a cell's text | Insert ▸ Link… on the chosen cell. `Ctrl`+press opens it |

**A number format on columns chosen by their letters becomes the column's own**, which new rows follow. On cells, it is theirs alone.

### The table as a whole

| To | Do |
| :-- | :-- |
| Rename it | Table ▸ Table ▸ Rename table…, or press its name above it |
| Give it a numbered caption | Table ▸ Table ▸ Caption… |
| Draw a chart of it | Table ▸ Table ▸ Insert chart |
| Export it as CSV | Table ▸ Table ▸ Export as CSV, for a spreadsheet |
| Leave it out of print | Table ▸ Table ▸ Leave out of print. It still calculates |
| Remove it | Table ▸ Table ▸ Remove table |

## Formulas

**A formula starts with `=` and shows its result.** Opening its cell shows the formula.

| Write | It means |
| :-- | :-- |
| `D1`, `AA12` | A cell: its column's letters, then its row, from the first data row |
| `$D$1`, `$D1`, `D$1` | A cell whose column, row or both stay when the formula is copied |
| `D1:D9` | A range of cells |
| `budget.D1`, `budget.D1:D9` | Cells of the table named `budget` in the same document |
| `"Q1 sales".D1` | Cells of a table whose name is not plain lowercase |
| `D`, `D:F` | Whole columns of the formula's own table, every data row, rows added later included |
| `map.D`, `map.D:F` | Whole columns of the table named `map` |
| `+ - * /` | Arithmetic |
| `&` | Two texts joined |
| `= <> < <= > >=` | Comparisons, giving `true` or `false` |
| `and`, `or`, `not` | Conditions joined |
| `"Pens"`, `".\src\"` | Text, in quotes. Every character inside is itself, `\` included |
| `"say ""hi"""` | A quote inside text, written twice, as in Excel. `""` alone is empty text |
| `0xFF`, `0b_0111_0001` | A whole number in hexadecimal or binary, kept as you wrote it. `_` can stand anywhere after `0x` or `0b`. A number past 2^53 does not read |

**While a formula is typed, each reference shows in a colour of its own, with a frame of that colour round the cells it names.** The first is blue and the second red, then purple, green, orange, teal, magenta and brown. The same cells written twice keep one colour. A reference to another table is framed in that table; one that names no cell stays plain. The colours go when the cell closes.

**While a formula is typed, the bracket beside the caret and the one it pairs with show on a coloured ground.** A bracket inside quoted text is text, and is never marked.

**A formula that misses its last `)` takes it when the cell is taken**, by `Enter`, `Tab` or a press elsewhere. `=sum(A1:A3` becomes `=sum(A1:A3)`, and the status bar says what was added. `Ctrl`+`Z` right after gives back the formula as you typed it.

* **Only an ending is added**: a closing `"` for text still open in quotes, then the `)` that are missing. `=like(A1, ".\src\*` becomes `=like(A1, ".\src\*")`.
* **A formula that would not read with them stays as you typed it**, such as `=1+(`, and shows `#SYNTAX!`. So does one with a `)` too many.
* **Edit ▸ AutoCorrect ▸ Close a formula's brackets on Enter turns it off.**

**While a formula is typed, a press on a cell writes its reference**, and a drag writes a range. `F4` turns the reference at the caret from `D1` to `$D$1`, `D$1`, `$D1`, then `D1` again. AutoSum (`Alt`+`=`) writes `=sum(…)` over the column above the chosen cell, or the row left of it.

**`name(D)` gives a column's name as text**, as its names row holds it, and changes when the name changes. `name(map.D)` gives the name of a column of the table `map`. While a formula is typed, a press on a column's letter or name writes that whole column: `D` in the formula's own table, `map.D` in another.

**`like(A1, "INV-*")` asks whether a text matches a pattern**: `*` stands for any characters, `?` for one, and case does not count. `=sum_if(D, like(A, "INV-*"))` adds column D on the rows whose A starts with `INV-`. Write `~*`, `~?` or `~~` for a `*`, `?` or `~` itself.

| To | Do |
| :-- | :-- |
| See the functions whose names fit the letters typed | Type lowercase letters after `=`, `(` or `,`; a list opens under the cell |
| See every function at the caret | `Ctrl`+`Space` |
| Choose in the list | `↑` and `↓` |
| Write the chosen function's name and `(` | `Tab`, `Enter`, or a press on it |
| Shut the list and keep the cell open | `Esc` |
| See a function's arguments | Type inside its brackets; a tip shows them, the current one in bold |
| Find a function by what it does, and read about it | Insert ▸ Function…, or `Shift`+`F3`; Insert writes `=name(` in the chosen cell |

**Kinds never turn into each other.** Text in arithmetic is `#VALUE!`, even text that looks like a number. An empty cell is 0, empty text or `false`, as the other side needs.

**Point at a cell that shows an error, or choose it, to see why.** Its tooltip and the status bar give the reason in words, and what to write instead where that is clear:

| The cell holds | The reason says |
| :-- | :-- |
| `=hex_to_dec(0x100000)` | `hex_to_dec reads digits as text: 0x100000 is already the number 1048576. Write =0x100000, or hex_to_dec("100000")` |
| `=B7+1`, with text in B7 | `B7 holds text, which arithmetic cannot use` |
| `=foo(1)` | `no function is called foo` |
| `=sum_if(D1:D9)` | `the arguments do not fit sum_if. Write sum_if(values, condition)` |
| `=A3*2`, where A3 shows `#DIV/0!` | `A3 shows #DIV/0!`; choose A3 to see its own reason |

The reason is worked out each time the table is calculated. It is not saved in the file.


| Mark | The cause |
| :-- | :-- |
| `#VALUE!` | A value of the wrong kind |
| `#DIV/0!` | A division by zero |
| `#NUM!` | A number too large, or a value outside a function's range |
| `#REF!` | A reference to a cell, a column or a table that is gone |
| `#CYCLE!` | The cell depends on itself |
| `#EMPTY!` | `min`, `max` or an average of no numbers |
| `#SHAPE!` | Ranges of shapes that do not match, as in `sum_if` |
| `#SYNTAX!` | The formula does not read. A literal such as `0x10` written as the digits of `hex_to_dec`, `bin_to_dec`, `hex_to_bin` or `bin_to_hex` does not read either: write `=0x10`, or `hex_to_dec("10")` |
| `#BLOCKED!` | It may call the document's own functions, which you have not allowed yet |
| `#LIMIT!` | The document's formulas read more than 500 million cell values, so this cell was not calculated |

### Your own functions

**A formula can call functions you write in KSPL, as it calls `sum`.** They need the local server: open the document by its launcher, or by a server started with `--builder` and `--allowed`. A page opened from a file runs none of them.

**Nothing of a functions file is built or run until you allow that exact file.** A bar at the top of the page names the file, with Allow and Not now.

1. Put the caret where the clause goes.
2. Choose Insert ▸ Functions file…, then pick a `.kspl` file in the workspace, or type a new name. The dialog offers `functions.kspl` in the document's data folder. A new file starts with one function, `twice`, to call and to copy.
3. Choose Allow, in the bar at the top or in the clause's box.
4. The clause's box lists the functions the file gives, such as "A formula can call: twice." A cell can then hold `=twice(A1)`.
5. Edit the file in any text editor. When you come back to the page, it asks again, then builds the file again.

| To | Do |
| :-- | :-- |
| Let the document's own functions run | Allow, in the bar at the top or in the clause's box |
| Leave them off for now | Not now; the bar asks again when the document next opens |
| Take the allow back | Stop allowing, in the clause's box. The cells show `#BLOCKED!` again |

* **The allow holds for the file's present content.** A file changed since asks again.
* **A cell whose formula calls them has a small blue corner at its top left.** When you choose the cell, the status bar names the functions and their file.

**Each `pub fn` in the file is a function a formula can call:**

```kspl
//< My functions
import "std/mem" { Arena }
import "std/str"

pub fn tax(price: F64, rate: F64?): F64 //< the price with its tax; the rate is 10% when left out
    return price * (1.0 + rate.unwrap_or(0.1))

pub fn greet(name: U8[], arena: Arena$@): U8[] //< a greeting
    return arena.text().s("hello, ").s(name).take()
```

The clause in the document's file reads `:::functions path="mine.kspl"`, then `:::` on the next line.

| Parameter | Takes | Else the cell shows |
| :-- | :-- | :-- |
| `F64` | A number; an empty cell is 0 | `#VALUE!` |
| `I64` | A whole number | `#NUM!` for a fraction, `#VALUE!` for text |
| `Bool` | `true` or `false` | `#VALUE!` |
| `U8[]` | Text | `#VALUE!` |
| `Value` | Any value, as it is | Nothing |
| `Value[]`, last | Every argument left; a range gives its cells | Nothing |
| `T?`, last | As `T`, or none where the formula leaves it out | As `T` |
| `Arena$@` | No argument: the memory a text result goes in | Nothing |

A function returns `F64`, `I64`, `Bool`, `U8[]` or `Value`. It may throw a `Calc_error` (`!Calc_error`), which the cell shows as its mark. `Value` and `Calc_error` come from `import "ksmd/calc/value"`.

| You see | It means |
| :-- | :-- |
| The compiler's message in the clause's box | The file does not build. Fix the file and save it; the page builds it again when you come back to it |
| `…` in a cell | Its answer has not come yet |
| `#BLOCKED!` in a cell | It may call the document's own functions, which you have not allowed yet |
| `#TIME!` | The call ran past 2 seconds |
| `#STOPPED!` | The function panicked |
| `#SYNTAX!` | Too many or too few arguments, as for ksmd's own functions |
| The box refuses a name | ksmd already has that name, such as `sum` |
| The build fails on an import | A file may import only `std` and ksmd's files. A path that climbs out of its folder, or names another package, fails the build |

**Your functions cannot change the document, read files or reach the network.** They run in the browser, apart from the page.

### Functions that decide what they calculate

**These functions choose which arguments are calculated, or read a column itself**, so the calculator reads them itself. Their list is written from `ksmd/calc/help.kspl`.

| Function | What it gives | For example |
| :-- | :-- | :-- |
| `today()` | today's date, as the page opened the document | `today()` |
| `if(condition, then, else)` | `then` where the condition holds, else `else` | `if(3 > 2, "yes", "no")` is `yes` |
| `sum_if(values, condition)` | the numbers of `values` on the rows where the condition holds | `sum_if(D1:D9, B1:B9 = "Pens")` |
| `count_if(values, condition)` | how many numbers of `values` stand on the rows where the condition holds | `count_if(D1:D9, B1:B9 = "Pens")` |
| `average_if(values, condition)` | the average of the numbers of `values` on the rows where the condition holds | `average_if(D1:D9, B1:B9 = "Pens")` |
| `lookup(key, keys, values, otherwise)` | the value beside the first key that equals `key`, else `otherwise` | `lookup("Pens", B1:B9, D1:D9, 0)` |
| `sum_product(a, b)` | each cell of `a` times the cell of `b` beside it, added | `sum_product(C1:C9, D1:D9)` |
| `name(column)` | the column's name, as text, as the names row holds it | `name(B)` |

### Functions by name

**This list is written from the functions' own signatures and doc comments** (`make ksmd-functions`). An argument in brackets can be left out, and `…` takes any number of them.

| Function | What it gives | For example |
| :-- | :-- | :-- |
| `average(xs…)` | the numbers' mean | `average(2, 4, 9)` is `5` |
| `bin_to_dec(digits, [width])` | the number binary digits name | `bin_to_dec("101")` is `5` |
| `bin_to_hex(digits, [width])` | binary digits written in hexadecimal | `bin_to_hex("11111")` is `1F` |
| `char(code)` | the character with this Unicode number, such as a line break for 10 | `char(65)` is `A` |
| `count(xs…)` | how many numbers and dates there are | `count(4, 8, 15)` is `3` |
| `date(year, month, day)` | the day the three parts name, in the years 1 to 9999 | `date(2026, 3, 1)` is `2026-03-01` |
| `day(d)` | a date's day of the month | `day(date(2026, 3, 1))` is `1` |
| `dec_to_bin(n, [width])` | `n` in binary | `dec_to_bin(5)` is `101` |
| `dec_to_hex(n, [width])` | `n` in hexadecimal | `dec_to_hex(255)` is `FF` |
| `find(part, t)` | where `part` first stands in `t`, in characters from 1; 0 where it does not | `find("c", "pencil")` is `4` |
| `hex_to_bin(digits, [width])` | hexadecimal digits written in binary | `hex_to_bin("1F")` is `11111` |
| `hex_to_dec(digits, [width])` | the number hexadecimal digits name | `hex_to_dec("100000")` is `1048576` |
| `left(t, count)` | the first `count` characters | `left("pencil", 3)` is `pen` |
| `len(t)` | how many characters the text holds | `len("pencil")` is `6` |
| `like(t, pattern)` | whether the whole text matches the pattern, `*` and `?` standing for any characters | `like("Pens", "p?n*")` is `true` |
| `max(xs…)` | the greatest; of dates alone, the latest date | `max(3, -1, 7)` is `7` |
| `mid(t, start, count)` | `count` characters from the `start`th, the first being 1 | `mid("pencil", 2, 3)` is `enc` |
| `min(xs…)` | the least; of dates alone, the earliest date | `min(3, -1, 7)` is `-1` |
| `mod(x, y)` | what is left of `x` after dividing by `y`, with the sign of `y` | `mod(-1, 72)` is `71` |
| `month(d)` | a date's month, 1 to 12 | `month(date(2026, 3, 1))` is `3` |
| `power(x, y)` | `x` to the power `y` | `power(2, 10)` is `1024` |
| `right(t, count)` | the last `count` characters | `right("pencil", 4)` is `ncil` |
| `round(x, places)` | `x` rounded to `places` decimal places, half away from zero | `round(1234.5, -2)` is `1200` |
| `round_down(x, places)` | `x` cut to `places` decimal places, toward zero | `round_down(2.79, 1)` is `2.7` |
| `round_up(x, places)` | `x` taken to `places` decimal places, away from zero | `round_up(2.21, 1)` is `2.3` |
| `substitute(t, old, new)` | `t` with every `old` in it replaced by `new`, from the left and without overlaps | `substitute("a-b-c", "-", "/")` is `a/b/c` |
| `sum(xs…)` | the numbers added; of nothing, 0 | `sum(1, 2, 3.5)` is `6.5` |
| `text(v, format)` | a number or a date written as text, as a column's number format would show it | `text(0.25, "percent:0")` is `25%` |
| `value(v)` | the number a text writes in decimal, such as `"12.5"` or `" -3 "`; a number stays as it is | `value(" -3 ")` is `-3` |
| `year(d)` | a date's year | `year(date(2026, 3, 1))` is `2026` |

## Charts, images and drawing

**Table ▸ Table ▸ Insert chart puts a bar chart of the table after it.** Its Edit button sets bars or lines, series in columns or rows, the labels, the columns drawn and a title.

**An image and a chart have the tools Rectangle, Arrow, Line, Pen, a colour, Text… and Delete.** Drag across the picture to draw; press a shape to choose it and drag to move it. Pen draws where the pointer goes. With `Shift` held, a rectangle is a square, and a line or an arrow keeps to a multiple of 45 degrees.

**To change an image's size, drag the square at its lower right corner, or press Width… and type a percent of the text width.** An empty answer fits it to the text again. **To show two images side by side, give each a width that adds up to 100% or less, such as 45% each.**

## Diagrams

**Insert ▸ Diagram puts an empty drawing area at the caret.** Its shapes are boxes, diamonds, start and end dots, dashed groups and notes, joined by arrows and lines.

| To | Do |
| :-- | :-- |
| Draw a shape | Press its tool, then drag across the area, or press once for its own size |
| Join two shapes | Press Arrow or Line, then drag from one shape to the other |
| Move a shape | Drag it; its arrows follow. A group carries the shapes inside it |
| Resize a shape | Drag the square at its lower right corner while it is chosen |
| Resize the area | Drag the square at the area's lower right corner |
| Bend an arrow | Choose it, then drag a dot halfway along it. Two presses on a bend take it away |
| Write a shape's or an arrow's words | Press it twice, or Text…. `Ctrl`+`Enter` takes the words, and `Esc` drops them |
| Show a screen's mock-up | Mono, for a fixed-width font |
| Colour it | The colour list for lines and words, the ground list for a shape's fill |
| Move a shape by one pixel | An arrow key; ten pixels with `Shift` |
| Take it away | `Delete`; a shape's arrows go with it |
| Number it as a figure | Caption… |

**On paper, a diagram wider than the page shrinks to the page's width.**

## Page setup, numbers and references

**File ▸ Page setup… sets the document's paper and its numbers**, kept in the document itself:

* **The paper**: A3, A4, A5, B4, B5, letter or legal, and its orientation.
* **The header's middle and the footer's left**: any text, where `{page}` and `{pages}` stand for the page's number and the count.
* **Where heading numbers start**: from level 1 (1, 1.1, 1.1.1), or from level 2 to leave the title unnumbered.
* **The words before a table's and an image's number**, such as `表` and `図`.

**A caption takes a number by chapter, such as "表 2-1".** A link whose text is `#` shows the number of what it names: `[#](#Modes)` reads "2.1" or "表 2-1". `Ctrl`+press on it scrolls there.

## Print and PDF

**File ▸ Print or save as PDF… (`Ctrl`+`P`) opens the browser's print dialog**, which also saves a PDF.

* **Paper shows the document alone**: no menus, bars, letters, row numbers or buttons.
* **Rows a filter or a group hides stay hidden on paper.**
* **A table wider than the paper prints smaller.** While you work in it, the status bar says so: "Page 2 of 5 · this table prints at 72%".
* **Each page's header holds the time of the print and the document's name**; the footer holds the page's number.
* **A chart, an image, an include or a diagram is left out of print by its Leave out of print button.** A table is left out by the Table flyout's item.

## Limits

| Limit | The most |
| :-- | :-- |
| A document's size | 8 MiB, 100,000 blocks |
| A table | 10,000 data rows, 100,000 cells |
| A formula | 4,096 bytes, 64 levels of nesting |
| A text a formula makes | 32,767 bytes |
| The cell values all formulas read, each time the document calculates | 500 million. Past it, each formula not yet calculated shows `#LIMIT!` |
| A diagram | 1,000 shapes, 2,000 arrows and lines |
| The editor's memory | 128 MiB. Past it, the page asks you to save and open the document again |

## Every command and its key

**This list is written from the page's own list of commands** (`make ksmd-reference`), so it names every command the page has, with its key.

### File

| Command | Key |
| :-- | :-- |
| Open… | `Ctrl`+`O` |
| Save | `Ctrl`+`S` |
| Save as… | `Ctrl`+`Shift`+`S` |
| Page setup… |  |
| Print or save as PDF… | `Ctrl`+`P` |

### Edit

| Command | Key |
| :-- | :-- |
| Undo | `Ctrl`+`Z` |
| Redo | `Ctrl`+`Y` |
| Cut | `Ctrl`+`X` |
| Copy | `Ctrl`+`C` |
| Copy formula |  |
| Paste | `Ctrl`+`V` |
| Paste values | `Ctrl`+`Shift`+`V` |
| Find… | `Ctrl`+`F` |
| Replace… | `Ctrl`+`H` |
| AutoCorrect ▸ Turn typed dates into dates (11/6) |  |
| AutoCorrect ▸ Turn typed web addresses into links |  |
| AutoCorrect ▸ Close a formula's brackets on Enter |  |

### View

| Command | Key |
| :-- | :-- |
| Contents |  |
| Full width |  |
| Reading width |  |
| One line per cell |  |
| Zoom in | `Ctrl`+`Alt`+`=` |
| Zoom out | `Ctrl`+`Alt`+`-` |
| Zoom 100% |  |
| Read-only |  |
| Quick access bar… |  |

### Insert

| Command | Key |
| :-- | :-- |
| Table |  |
| Diagram |  |
| Image… |  |
| Include… |  |
| Functions file… |  |
| Divider |  |
| Link… | `Ctrl`+`K` |
| Today's date | `Ctrl`+`;` |
| Time now | `Ctrl`+`:` |
| Function… | `Shift`+`F3` |
| Note… | `Shift`+`F2` |

### Format

| Command | Key |
| :-- | :-- |
| Kind of block ▸ Paragraph | `Ctrl`+`Alt`+`0` |
| Kind of block ▸ Heading 1 | `Ctrl`+`Alt`+`1` |
| Kind of block ▸ Heading 2 | `Ctrl`+`Alt`+`2` |
| Kind of block ▸ Heading 3 | `Ctrl`+`Alt`+`3` |
| Kind of block ▸ Heading 4 | `Ctrl`+`Alt`+`4` |
| Kind of block ▸ Heading 5 | `Ctrl`+`Alt`+`5` |
| Kind of block ▸ Heading 6 | `Ctrl`+`Alt`+`6` |
| Kind of block ▸ Code block |  |
| Strong | `Ctrl`+`B` |
| Emphasis | `Ctrl`+`I` |
| Inline code | `Ctrl`+`E` |
| Font colour… |  |
| Fill colour… |  |
| Font size ▸ Default size |  |
| Font size ▸ 9 pt |  |
| Font size ▸ 10 pt |  |
| Font size ▸ 11 pt |  |
| Font size ▸ 12 pt |  |
| Font size ▸ 14 pt |  |
| Font size ▸ 18 pt |  |
| Font size ▸ 24 pt |  |
| Clear format |  |
| Align left |  |
| Centre |  |
| Align right |  |
| Centre across columns |  |
| Wrap text |  |
| Bulleted list |  |
| Numbered list |  |
| Checklist |  |
| Quote |  |
| Indent | `Tab` |
| Outdent | `Shift`+`Tab` |

### Table

| Command | Key |
| :-- | :-- |
| Insert row above |  |
| Insert row below |  |
| Remove row |  |
| Insert column left |  |
| Insert column right |  |
| Remove column |  |
| Choices… |  |
| Look ▸ Wrap text |  |
| Look ▸ Centre across columns |  |
| Look ▸ Colour by value… |  |
| Look ▸ Colour rows by this column |  |
| Look ▸ Merge repeated values |  |
| Size ▸ Fit column width |  |
| Size ▸ Column width… |  |
| Size ▸ Row height… |  |
| Fill ▸ Fill down | `Ctrl`+`D` |
| Fill ▸ Fill right | `Ctrl`+`R` |
| Sort ▸ Sort ascending (A to Z, 0 to 9) |  |
| Sort ▸ Sort descending |  |
| Filter ▸ Filter this column… | `Alt`+`↓` |
| Filter ▸ Show only rows with this value |  |
| Filter ▸ Show all rows |  |
| Number format ▸ General: as calculated | `Ctrl`+`Shift`+`~` |
| Number format ▸ Number: 1234.50 |  |
| Number format ▸ Thousands: 1,235 | `Ctrl`+`Shift`+`!` |
| Number format ▸ Percent: 12% | `Ctrl`+`Shift`+`%` |
| Number format ▸ Currency… | `Ctrl`+`Shift`+`$` |
| Number format ▸ More decimal places |  |
| Number format ▸ Fewer decimal places |  |
| Number format ▸ Date: 2026-10-26 |  |
| Number format ▸ Date: 2026/10/26 |  |
| Group ▸ Group rows | `Alt`+`Shift`+`→` |
| Group ▸ Ungroup rows | `Alt`+`Shift`+`←` |
| Group ▸ Hide detail |  |
| Group ▸ Show detail |  |
| Group ▸ Group columns |  |
| Group ▸ Ungroup columns |  |
| Group ▸ Hide column detail |  |
| Group ▸ Show column detail |  |
| AutoSum ▸ Sum | `Alt`+`=` |
| AutoSum ▸ Average |  |
| AutoSum ▸ Count numbers |  |
| AutoSum ▸ Max |  |
| AutoSum ▸ Min |  |
| Note… | `Shift`+`F2` |
| Resolve note |  |
| Table ▸ Select table |  |
| Table ▸ Rename table… |  |
| Table ▸ Caption… |  |
| Table ▸ Insert chart |  |
| Table ▸ Export as CSV |  |
| Table ▸ Leave out of print |  |
| Table ▸ Remove table |  |

**A table's right-click menu holds Cut, Copy, Copy formula, Paste and Paste values, then the Table menu's groups.** They are Rows, Columns, Look, Size, Fill, Sort, Filter, Number format, Group, AutoSum, Note, Table.
