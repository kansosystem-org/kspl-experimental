# The ksmd document and editor

This is the design for implementers and reviewers, and everything below is implemented. The rules of the file are in [`SPEC-file-format.md`](SPEC-file-format.md); this document gives their reasons. The examples under `ksmd/examples/` illustrate these decisions. The editing page has its own design, [`DESIGN-page.md`](DESIGN-page.md).

## What a document holds

A document contains prose, calculating tables, charts of them, images and includes, in reading order. The editor changes that structure directly. Source is read at open and written at save, not reparsed after each keystroke.

| Included | Left out |
| :-- | :-- |
| Paragraphs, six heading levels, lists, links, emphasis and literal code | Raw HTML, executable code fences, embedded scripts |
| Rectangular tables with text, numbers and formulas | Merged cells, nested tables, blocks inside cells |
| Images in the document flow, with alternate text, an optional caption and shapes drawn over them | Floating objects, absolute positioning |
| Diagrams of shapes and the arrows between them | Shapes drawn freely on the page |
| Browser printing with automatic page breaks | Editable page boundaries, page templates, exact cross-browser pagination |
| Includes opened separately for editing | Network includes, editing several sources in one transaction |

Static figures are images with captions. Images keep their aspect ratio. Each fits the content width, or takes a share of it that a person sets. Column resizing affects appearance, never cell identities or values. There is no presentation mode.

## Source boundaries

**The file has one written form for each structure.** Its rules are "The source" in [`SPEC-file-format.md`](SPEC-file-format.md#the-source). A style cannot change a block's kind.

**The reader keeps the original bytes, so a place in a refusal does not shift after a CRLF or a byte order mark.**

**A new attribute stays in version 2, and a ksmd older than the attribute refuses the file.** Its reader refuses an unknown attribute, naming the line and column, so it never opens such a file and saves it without the attribute. A version step would add nothing to that refusal: the older reader refuses `%ksmd 3` as well. It would cost a second reader to keep, and every file written since would carry the new number. The format is not yet a published specification, so version 2 still grows. A version step comes with a change an older reader would read wrongly rather than refuse.

### A formula longer than an edit writes

**A file holds a formula of up to 32,768 bytes** (`MAX_READ_FORMULA` in `ksmd/model/model.kspl`). An older ksmd converted the formulas of a `%ksmd 1` file, and the conversion could make one longer than 4,096 bytes.

* **A document that holds a formula over 4,096 bytes when read allows that formula's length to each edit** (`formula_cap`). So such a formula does not refuse every edit of the document. A formula typed into a cell, or made longer by an edit, keeps within that length.

## What the reader models

**The reader models every structure of the file, and refuses a source it cannot read whole.** Saving a partial model would lose what it did not read. The rules it reads by are "How the reader reads" and the sections after it in [`SPEC-file-format.md`](SPEC-file-format.md#how-the-reader-reads).

**Inline markup is read into nodes, and the writer writes it back from them.** Text, inline code, a hard break, and the start and end of emphasis, strong emphasis and a link are each one node. Each node keeps its offset for diagnostics.

* **A block starts at column one**, since two spaces mark a nested list item.
* **The writer numbers every ordered item `1.`**, so inserting or moving an item changes only its own lines.
* **The writer leaves out spaces and tabs at a line's ends, and hard breaks at a paragraph's start or end.** An editor's model holds them while text is typed.

## Prose notation

**The prose notation follows Markdown's forms.** The forms are "Prose" in [`SPEC-file-format.md`](SPEC-file-format.md#prose).

Typing inserts literal text: `#`, `*` or `:::` does not change structure. Formatting commands change the model, and the writer adds the delimiters and escapes. A rich-text paste would need a conversion that reports what it drops before insertion.

### Checklists, quotes and dividers

**A checklist item is a bulleted item with a tick box**, so a to-do list keeps what is done in sight. Its forms are "Lists and checklists" in [`SPEC-file-format.md`](SPEC-file-format.md#lists-and-checklists).

* **Only a bulleted item takes a box.** Two forms for one need would make the file harder to read.
* **The `x` is lowercase**, so one tick has one spelling.
* **On the page, a press on the box ticks it or takes the tick away**, as one step of undo. A ticked item's text is greyed. Enter after a ticked item starts an open one.

**A quote is written as mail writes it**, with `> ` before each line. It holds one paragraph, so no quote nests in another.

**A divider holds nothing**, so the page shows it as a line with a Remove button. Insert, Divider adds one at the caret.

### Looks: colours, font size and alignment

**A look is direct formatting written in braces after what it formats**, so a change of look changes one line of the file. Its parts and their order are "Looks" in [`SPEC-file-format.md`](SPEC-file-format.md#looks). The page offers the font sizes 9, 10, 11, 12, 14, 18 and 24.

* **Text takes a colour, and nothing else.** A fill and a size on text would make a page uneven.
* **A paragraph's or a heading's alignment stands on a line of braces before it.** At the end of the text, an ordinary `{` in prose could not be told apart.
* **A cell's new value keeps its look.**
* **`align="across"` works as Excel's Center Across Selection.** It is only a look, so references, ranges, sort, filter, fill, copy and paste act as before.
  * **A value typed into a cell of the run ends the run there at once**, so no value is ever hidden under another.
  * **A paragraph or a heading refuses it**: they have no cells to span.

### Notes

**A cell, a paragraph or a heading can hold a note: a remark for the people who read the file.** Its form is "Notes" in [`SPEC-file-format.md`](SPEC-file-format.md#notes).

* **Resolving a note takes it away**, so the next reader is not handed remarks that no longer apply. Undo brings it back.
* **No threads, replies or names.** These serve several people working on one file at once ("What the file lifecycle leaves out" below).
* **A note stays with its cell or paragraph** through a new value, a sort and a moved row. A paragraph split in two keeps it on the part before the split.

## The document's own settings

**A `:::document` clause sets what holds for the whole document**: the paper, the printed header and footer, and the numbers of headings and captions. Its attributes are "The document's own settings" in [`SPEC-file-format.md`](SPEC-file-format.md#the-documents-own-settings).

* **Portrait has no spelling**, so one setting has one form.
* **Each paper's name is the one CSS's `@page` takes**, so one name means one size in the file and in the browser's print.
* **A heading's number is shown, never written into its text**, so an inserted section moves every later number at once. With `numbers=2`, a level-1 heading stays a title without a number.
* **Only the opened document's clause counts.** A functions clause in an included file counts there, as "Table names across includes" below says.

`ksmd/syntax/settings.kspl` reads, checks and writes the clause, and `ksmd/edit/editor_settings.kspl` sets it as one step of undo.

## Tables and calculations

**The rules of a table and of a formula are "Tables and formulas" in [`SPEC-file-format.md`](SPEC-file-format.md).** This section gives why they are so, and where the code holds them.

* **Text cells need quotes**, so a code such as `"0012"` and a leading `=` cannot be mistaken for a number or a formula.
* **There is no Markdown alignment or separator row.** A table's look is given by its attributes, so a row means data alone.
* **A formula is kept as its text, never as its result.** The file then holds what the person wrote, and a result cannot go stale in it.
* **Cross-file formulas are left out**, references into an include among them. A formula's answer then depends on its own file alone.

### How a formula is written

The rules are "How a formula is written" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **Words, not symbols, join conditions.** A `|` splits a table row unless it stands in quotes, so `||` and `|` cannot serve.
* **A comparison takes one step.** `1 < A1 < 9` reads as a range check in mathematics, but as a comparison of `true` with 9 in most languages. Refusing it leaves no doubt.
* **A whole column without a table's name is a column of the formula's own table, as a cell is.** So a copy into another table names that table's column.
* **Letters just before `(` never read as a column**, since a function's name is lowercase.

### Text in a formula

The rules are "Text in a formula" in [`SPEC-file-format.md`](SPEC-file-format.md). AutoCorrect's closing quote is in [`SPEC-editing-page.md`](SPEC-editing-page.md).

**Why the spreadsheets' rule:** Excel, LibreOffice Calc and Google Sheets all write a quote inside formula text as `""`, and none of them escapes with `\`. A formula copied from one of them keeps its text and its answer. A path, a regular expression or a file pattern holds `\` often, and doubling every one of them is easy to forget. A single `\` before the closing quote would join the quote to the text, and the rest of the formula would change meaning.

**What this gives up:** a quote inside text takes two characters, and a long run such as `""""` is hard to read. `char(34)` writes a quote too. JSON's `\n` and `\u` do not apply in formula text, so `char` writes those characters.

**Text typed in quotes into a cell follows the same rule**, and a cell's editor shows quoted text by it. One rule then covers all quoted text a person types. The file still keeps JSON's quotes for a text cell, as for the rest of the file.

### A column's name in a formula

The rules for `name` are "Functions" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **It follows the column as every reference does**, through an insert, a removal, a cut and paste and Insert cut columns.
* **A new name shows at once.** Every edit calculates every cell again, a rename of a column too, so each `name` of it changes in every table.
* **While a formula is typed, a press on a column's letter or name writes the whole column**, which is the argument `name` takes.

**Why a function:** a person who compares with a column's title today types that title again, in a data cell or in the formula. The copy goes stale when the name changes. With `name`, the title is written once, and the formula follows the column wherever it moves.

**Why not a row 0, as `B0`:** a range such as `B0:B9` would then mix the name with the values. Every function that reads a range would have to leave the name out again. A function that takes only a whole column cannot mix them.

**Why not Excel's way:** Excel gives a column's title only through a table's own references, written as `Table1[[#Headers],[Col]]`. Those name the column by its title, so the formula must already hold the text it asks for. ksmd names a column by its letters, which follow the column.

### How a function is written

**Every function a formula calls by name is an ordinary KSPL function**, in `ksmd/calc/functions.kspl`. Its parameters' types say what it takes, and its result becomes the cell's value:

```kspl
pub fn round(number: F64, num_digits: I64): F64!Calc_error
```

* **One set of rules converts every argument** (`ksmd/calc/args.kspl`). The rules are "Functions" in [`SPEC-file-format.md`](SPEC-file-format.md). An `F64` takes a number, an `I64` a whole number, and a `Value[]`, last, the arguments left. A `T?`, last, may be left out.
* **An argument holding an error is the result, and the function is not called.** An error the function throws (`!Calc_error`) is the cell's mark.
* **The table that calls them is written from their signatures** (`ksmd/calc/glue.kspl`, `make ksmd-functions`). So a function is added by writing it, and nothing else names it.
* **Eight forms are not functions**: `if`, `sum_if`, `count_if`, `average_if` and `lookup` choose which arguments are calculated, and `sum_product` pairs two ranges' cells. `today` reads the date the document opened, and `name` reads a column's name. They stay in the calculator. `sum_if` hands the values its condition keeps to the same `sum`.
* **What a person reads of a function is written beside it, in its doc comments.** The first line says what it gives, each parameter's line what that argument takes, and a sentence "For example, `f(…)` is `…`." shows a call. The divider above it names its group. `make ksmd-functions` refuses a function that leaves one out, and a test calculates every example. The eight forms have their entries in `ksmd/calc/help.kspl`, which the calculator takes their names from. The page's help while a formula is typed and the reference's lists both come from there.
* **A parameter takes the name Excel gives that argument, in snake_case**: `round(number, num_digits)`, `find(find_text, within_text)`. A person who knows a spreadsheet then reads the help as they already know it.
  * Where Excel has no such function (`like`) or means another thing by its name, the parameter takes the clearest word. A base function's `width` counts bits, while Excel's `places` counts characters.

**Why ordinary functions**: a person reads how `sum` works in the language they write, and its rules for arguments are the ones any function follows.

### Your own functions

**The clause, its names and the marks a call shows are "Your own functions" in [`SPEC-file-format.md`](SPEC-file-format.md).** This section gives how a file is trusted, built and run. Each `pub fn` in the file is a function a formula calls by its name:

```kspl
pub fn tax(price: F64, rate: F64?): F64 //< the price with its tax
    return price * (1.0 + rate.unwrap_or(0.1))
```

```text
:::functions path="mine.kspl"
:::

| 100 | =tax(A1) |
```

* **The clause's box says what the file gives**: the names a formula can call. Or it says why the file cannot be used, in the compiler's own words.
* **Insert ▸ Functions file… puts the clause at the caret.** It picks a `.kspl` file in the workspace, or starts a new one holding one function to copy.
* **Why a name ksmd has is refused:** `sum` then always means ksmd's `sum`.
  * **A file that is not ready keeps the names of its last build.** It may wait for an allow, have had Stop allowing pressed, or not build. A call to one shows `#BLOCKED!`, never the answer of a file below. Its reason says whether the file waits for an allow or does not build.
  * **While a file waits for its allow or builds, the files below it give no names.** Its names are unknown, so any of theirs may be its. Their box says that those names wait for a file above.
* **The file is built again when it changes on disk**, once the page looks again (on focus, as for an include). The person allows its new content first.
* **A function returns a value only.** It cannot change the document, as a procedure in a spreadsheet's macros can. That was left for later.

**The page cannot wait for an answer**, so a cell whose answer has not come shows `…`, and the tables show again once it has. An answer comes back at once for the same call with the same arguments.

**Nothing of a functions file is built or run until the person allows that exact file.** Opening a document whose file is not allowed builds nothing. A bar at the top names the file: "This document has its own functions (mine.kspl). They run only if you allow them.", with Allow and Not now.

* **The allow holds for the file and its exact bytes.** The local server records the SHA-256 of the file's path and of its content. A file that changes, as when a colleague edits it in a shared folder, asks again.
* **The server keeps the record, and the server enforces it.** It builds only a file whose present bytes are allowed, and hands the builder their digest, so bytes changed in between are not built. A page that skipped the question still gets nothing built. The record stands outside the workspace, where a document's folder cannot allow its own functions.
* **The person's press on Allow is the one way an allow is made.** The page sends it with the token, and names the bytes it read. Bytes changed since are refused, and the page asks again.
* **Not now puts the question off for this opening alone.** The bar asks again the next time the document opens. The clause's box keeps its own Allow.
* **Stop allowing, in the clause's box, takes the allow back.** The cells show `#BLOCKED!` again.
* **Why an unknown name shows `#BLOCKED!` until the file is allowed:** the names a file gives are known only once it builds. So every unknown name may be one of them.
* **A cell whose formula calls the document's own functions has a small corner** in the mark's colour at its top left. A note's corner stands at the right, so a cell can show both. When the cell is chosen, the status bar names the functions and their file: "Uses tax from mine.kspl (this document's own)". The corner is not printed, since a printed page has no status bar to explain it.

**Why ask before the build, though the result runs in a sandbox:** the run cannot reach the machine. The build, though, runs the compilers natively on the file. A build on opening would hand a crafted file to them before the person chose anything. Asking costs one press per file and per change.

**Why a bar and not a dialog:** the document stays readable and editable while the question waits. Only the cells that call the file wait with it.

**What is left out:**

* **Allowing a whole folder.** A shared folder is where a file arrives unasked, so trusting the folder trusts every file a colleague puts there.
* **A setting that turns the question off.** One press per file and per change is cheap, and a switch that removes the question removes it for every document.
* **Trust kept in the browser alone.** The page is the less trusted side, so the server holds the record and refuses a build it has not seen allowed.

**Where it runs, and its limits:**

| What | Holds |
| :-- | :-- |
| Asking | Nothing is built before the person allows the file's exact bytes; the local server refuses any other build |
| Building | The local server's builder, named when the server starts. The build is closed: the file may use `std` and ksmd's calculation files, and a path to anything else fails it. So does any way to C (`extern`, `##link`, assembler text), which ksplc refuses under `--closed` |
| Running | A worker apart from the page, with its own memory and no way to the files, the network or the page |
| Time | 2 seconds per call; past it the cell shows `#TIME!`, and the worker starts afresh |
| A panic or a fault | The cell shows `#STOPPED!`, and the worker starts afresh |
| Opened from a file | Nothing runs; the box says that functions need the local server |

**Why KSPL and a build**: a person writes their functions as ksmd writes its own, with the same types and rules for arguments. A build checks the types before anything runs, so a wrong call fails at the clause, not in a cell.

### Values and errors

The rules are "Values and errors" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **Why kinds never turn into each other:** a `true` counted as 1 would give a total that looks right and is not. Text that looks like a number hides the same mistake.
* **Why an order between two kinds is an error:** an order between a number and text would hide a mistake.
* **Why an empty cell is a day before every date:** a due date not yet written counts as passed. A blank counts as 0 against a number in the same way. Excel and LibreOffice Calc give the same answer, so a sheet brought from them keeps its marks. An error here would turn a whole `sum_if` over a column with one blank date into `#VALUE!`.
* **Why two numbers compare at 15 digits** (`shows_same` in `ksmd/model/format.kspl`): a person reads the 15 digits. A comparison that disagreed with what both cells show would look wrong. The display, `round_down` and `text` already use those digits. Excel, LibreOffice Calc and Google Sheets all compare so.
* **Why `+` and `-` cancel to 0** (`sum_of` in `ksmd/calc/value.kspl`): the 5.55111512312578e-17 that binary arithmetic leaves in `0.1 + 0.2 - 0.3` is no value a person wrote. Shown, it reads as a real amount, and a check that a total balances to 0 fails. Only `+` and `-` do this, since only there do two equal amounts cancel.
* **Why `if` takes all three arguments:** `false` in a column of numbers reads as a mistake. The branch not taken must still read, so a slip shows at once.
* **Why `min`, `max` and `average` of no numbers are `#EMPTY!`:** a zero would hide that a column holds no data yet.
* **Why a formula that does not read keeps its source:** a slip can then be fixed later.

**Each error has its own mark, since each is fixed differently.** `#SHAPE!` is fixed by changing a range, and `#LIMIT!` by reading fewer cells, which no other mark asks for.

**Every error also says why it stands, in words.** A mark names only the kind, and `#SYNTAX!` alone has a dozen causes. The page shows the reason on the cell's tooltip and on the status bar ("The status bar" in [`DESIGN-page.md`](DESIGN-page.md)).

* **An error carried from another cell names that cell, not its cause.** A chain of formulas then leads, one cell at a time, to the cell to fix. A cycle keeps its own reason, since every cell on it shows the same cause.
* **The reason is not part of the value.** A comparison, a function and an error carried on read only the kind, so they act as before.
* **An error keeps a tag and a detail, not a sentence** (`Why` in `ksmd/calc/value.kspl`). The detail is a cell's place or a piece of the formula's text, which the value already has room for. So a table of 100,000 errors grows by no byte and makes no text while it calculates.
* **The sentence is written only for a table the page shows** (`ksmd/calc/reason.kspl`), and only for its errors.
* **Every tag with every kind writes words.** A test walks them all, and a second test checks that every error a formula meets carries a tag. A new place that makes an error without one fails there.

### Totals by a condition

The rules are "Totals by a condition" in [`SPEC-file-format.md`](SPEC-file-format.md).

```text
=sum_if(D1:D9, B1:B9 = "Pens")
=count_if(A1:A9, C1:C9 > 5 and B1:B9 <> "Done")
=average_if(D1:D9, B1:B9 = "Pens" or B1:B9 = "Ink")
```

* **The condition is an ordinary expression, not text read again later.** So one function serves one condition or many, joined by `and`, `or` and `not`.
* **The values come first in all three**, so the order cannot be swapped by mistake.
* **A range of another shape is `#SHAPE!`**, since a range quietly cut or stretched would add the wrong rows.
* **A condition with no range is `#SHAPE!`.** Without one, it takes all rows or none, which is nearly always a range written as a cell.
* **The values on a row are read only where the condition holds**, as `if` reads only the branch it takes. So a total row inside its own range is no cycle when the condition leaves it out.

### The sum of products

The rules are "The sum of products" in [`SPEC-file-format.md`](SPEC-file-format.md). `=sum_product(D1:D9, E1:E9) / sum(D1:D9)` is the average of E weighted by D, such as a progress rate weighted by hours.

### Finding a value by its key

The rules are "Finding a value by its key" in [`SPEC-file-format.md`](SPEC-file-format.md). `=lookup(A1, prices.A1:A50, prices.B1:B50, 0)` finds a price by its code.

* **A match is exact, and no nearest match is guessed.** Text compares as the sort and the filter compare it, and a number as `=` compares it.
* **`otherwise` is required.** A missing key then shows what the writer chose, never an error nobody planned for.
* **A key on a cycle before the match makes the lookup `#CYCLE!`.** Passed over, it would hide the cycle.

### Hexadecimal and binary

The rules are "Hexadecimal and binary" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **Every whole number up to 2^53 converts exactly**, the largest a cell's number holds exactly.
* **Why the width is signed only:** the digits read back as signed, so `11001000` written for 200 would read back as -56.
* **The literal's spelling is KSPL's, so one literal means the same in both.**
* **The literal is kept as written**, as `2.50` is, and a paste shifts only the references beside it.
* **A value typed into a cell is not read as a literal:** a typed `0xFF` stays text.

**Why the literal is refused as digit text:** it is already the number. As a whole number, it would stand for its decimal digits, so `hex_to_dec(0x100000)` would quietly give 17073526. The rule holds in the argument's own brackets and arithmetic, but not inside another call: `=hex_to_dec(dec_to_hex(0xFF))` is 255. A formula that does not read shows at once, where a wrong number may never be noticed.

**Why a sign by default:** a negative number written as a fixed run of digits surprises a reader who wanted a sign. A fixed width also limits which numbers convert. So the width is the reader's choice, up to 53 bits.

### Text

The rules are "Text" in [`SPEC-file-format.md`](SPEC-file-format.md). What each text function gives is "Functions by name" in [`SPEC-editing-page.md`](SPEC-editing-page.md).

* **`mid`, `left`, `right`, `len` and `find` take Excel's names and its order of arguments, counted from 1**, so a formula carries over.
* **`find` gives 0 where the part is missing, not an error.** `if(find("/", A1) > 0, …)` then reads without a second function to catch the error.
* **`text` is the one way from a number to text, and `value` the one way back.** A number turned into text by itself would hide the same mistakes as text in arithmetic.
* **Text a formula gives holds at most 32,767 bytes.** Spreadsheets cap a cell's text at 32,767 characters. The count is in UTF-8 bytes, as for every other limit here.
* **The length is found before the text is made.** So a formula that doubles its text down 27 rows stops at the cap, and takes no more memory.
* **The work of `like` is at most the text's characters times the pattern's bytes.** The matcher goes back only to the last `*` passed. So a pattern such as `"*a*a*a*b"` cannot take exponential time.
* **A number or a date matches no pattern of `like`.** A code column often mixes numbers with text, and `sum_if(B, like(A, "INV-*"))` then adds the matching rows instead of being `#VALUE!` for the whole column.

**Why Excel's wildcards:** a criterion such as `"ABC*"` in a spreadsheet's `SUMIF` becomes `like(A, "ABC*")`, with the same `*`, `?` and `~`. Excel's wildcards also ignore case and match the whole text, so a formula carried over keeps its answer.

**Why a function, not wildcards in every comparison:** in a spreadsheet, a criterion's `*` and `?` are wildcards without a sign. A key that holds a `*` then matches more rows than intended. In ksmd, `=` never reads a wildcard, and a wildcard works only where `like` is written.

**Why a `~` before another character is refused:** what a spreadsheet does with it is not clearly documented. An error shows at once, where a wrong match may never be noticed.

**Why `mod` takes the sign of its divisor:** a count then wraps round as a clock does. Its quotient is cut at the 15 digits it shows, as `round_down` cuts. Where whole divisors were taken away, the remainder is rounded at the place of the larger operand's 15th digit, since the subtraction's error lies there.

### Number formats

The rules are "Number formats" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **Each entry has one spelling, with no default**, so one format is written one way.
* **The decimal point is always `.` and the separator `,`**, so one file shows one way everywhere.
* **A number that rounds to zero shows no minus:** `-0.00` would read as a value below zero.
* **Rounding follows `round`'s rule, in the same code.** So 2.675 shows as `2.68`, though its binary value is a little less.
* **A format chosen on whole columns, by their letters, is the columns'**, and takes their cells' own formats away. Clear format takes a cell's own format away.
* **New rows follow the column's format. A new column has no format, and a moved or removed column takes its format with it.**
* **An open cell edits the number it holds, with every digit, not the shown text.**
* **A typed `$12` or `12%` stays text** ("How the editor changes a document" below). The format gives the symbol; the cell holds the number.
  * **Such text is marked in a column of numbers**, since `sum` leaves it out without a word (`number_as_text` in `ksmd/edit/typed.kspl`). The page shows the mark ("The status bar" in [`DESIGN-page.md`](DESIGN-page.md)).
  * Text looks like a number when it holds digits that `,` may group in threes, with a sign, a `.`, a currency sign or a `%`: `1,000`, `+.5`, `+5`, `12%`, `$12`. Full-width forms such as `１２` count, and so does a number in quotes.
  * A code such as `"007"` never looks like a number: its whole part starts with 0 and holds more digits. As a number it would lose its zeros.
  * A column of numbers holds more numbers than other text, and codes count as other text. So a column of codes such as `"007"` is not marked, even beside as many numbers. A formula's text is not marked either, since its writer chose text.
  * Why a mark, and not a number: reading `12%` as 0.12 or `1,000` as 1000 guesses what the person meant. A wrong guess changes a total without a word. The mark keeps the cell as typed, and shows that a total leaves it out.

`ksmd/model/format.kspl` reads, writes and shows a format. `edit.set_format` and `edit.step_places` (one place more or fewer) are each one step of undo.

### Choices

The rules are "Choices" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **A column takes only the values on its list**, so the filter and `count_if` see "Done", never "done".
* **A typed value equals a choice without regard to case, and the cell holds the choice as the list spells it.** Any other value is refused, typed, pasted, filled or copied; an empty cell is allowed.
* **A list belongs to a column**, as a format does. A cell that already holds another value keeps it, and the page marks it.
* **Only a list.** Number ranges, dates and formula conditions are left out, and so is a list taken from another table.
* **`color_rows` shows the rows of an issue list in their state at a glance.** A column's colour rule stands over a row's colours.
* **`color_rows` follows its column as a reference does**, and goes with it when the column is removed or loses its list.

`ksmd/model/choice.kspl` reads, writes and checks an entry. `edit.set_choices` sets a column's list as one step of undo, and `edit.set_cell` keeps to it.

### A link in a cell

The rules are "A link in a cell" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **Only a text cell holds a link**, since the link names what the text says. A cell given a number, a date or a formula loses its link; new text keeps it.

### Colouring cells by their value

The rules are "Colouring cells by their value" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **The colours follow the value as it is calculated again.**
* **A colour scale makes a large workload stand out at a glance.** The columns that hold the same scale share one least and one greatest number. So a block of months compares as one, as a scale over a range does in a spreadsheet.
* **One rule per column, and only these conditions**, so no order between rules is needed. Data bars, icon sets and formula conditions are left out.
* **A rule belongs to a column**, as a format does, and moves with it.

`ksmd/model/rule.kspl` reads and writes an entry, and `edit.set_rule` sets a column's rule as one step of undo.

### Captions and merged columns

The rules are "Captions and merged columns" in [`SPEC-file-format.md`](SPEC-file-format.md).

**Merged cells stay out: a table stays a rectangular grid, so sort, filter, ranges and references keep one cell per place.** Their look is given without them: `merge` gives it down a column, and `align="across"` ("Looks: colours, font size and alignment" above) along a row.

* **`merge` changes only the look.** Each cell still holds its value, so a sort, a filter and a range work as before.
* **A column merges only where the columns to its left merge too.** So a group's rows stay inside the group above them.
* **The merged columns follow their columns as a reference does**, and a removed column leaves the list.
* **Hidden rows do not count**, so what shows reads as merged.

### Groups of rows and columns

The rules are "Groups of rows and columns" in [`SPEC-file-format.md`](SPEC-file-format.md). Groups work as a spreadsheet's outline does.

* **The groups of columns follow the rules of the groups of rows**, each list alone. A column inserted inside a group joins it, and so on.
* **A group belongs to the table's layout, as a width does, so it names rows by place.** A sort or a moved row leaves the groups where they stand. A row inserted inside a group joins it. A removed row leaves it, and a group whose rows are all removed goes.
* **Whether a group is hidden is saved in the file, unlike a filter.** Hiding detail is the shape the writer gives the table, while a filter answers one question for the moment.

`ksmd/model/group.kspl` reads, writes and checks the groups. `edit.group_lines`, `edit.ungroup_lines` and `edit.show_group` are each one step of undo. Ungrouping takes away the smallest group that holds the chosen rows.

### Column widths and row heights

The rules are "Column widths and row heights" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **A width counts characters**, as Excel's column width and CSS's unit `ch` count it. Its limit, 255, is Excel's. The model keeps tenths of a character, so a width is a whole number.
* **The table is as wide as its columns, not as wide as the window.** A person who sets a column's width in a spreadsheet expects it to stay, and expects no text to wrap when the window narrows. A wider table makes the page scroll sideways.
* **A height is exact, as in Excel.** A person who makes a row lower means it. A double-click on the row's edge fits it to its lines again ("Column widths and row heights" in [`DESIGN-page.md`](DESIGN-page.md)).
* **The model keeps each height by the row's identity**, so a sort, a moved row and an inserted row leave it on its row. A removed row's height comes back with an undo.
* **Points are the unit of a font's size**, which the look already uses ("Looks" above), and of Excel's row height. Its limit, 409, is Excel's.

### Filters

The rules are "Filters" in [`SPEC-file-format.md`](SPEC-file-format.md). `ksmd/model/filter.kspl` reads and writes an entry.

* **A value is lower case, since the page compares without regard to case.**
* **A change of number format takes the column's entry away, in the same step of undo.** The format of the column or of a cell in it changes the text the cell shows, so `in:1.5` would hide every row once 1.5 shows as 1.50.
* **A row inserted leaves every entry as it is.** The page shows the new row until the filter is chosen again ([`DESIGN-page.md`](DESIGN-page.md)), so the file keeps the filter the person chose.
* **The model keeps each entry by the column's identity**, so it moves with its column, and an undo of a removed column brings it back.
* **Whole columns cut and pasted on others give their entries to the columns pasted on**, as their other settings go ("Moving cells" in [`DESIGN-page.md`](DESIGN-page.md)). The cells move but the columns stay, so an entry left on its column would hide every row of an empty column.
* **A reader that does not know the attribute refuses the file** rather than show rows the writer hid ("Source boundaries" above).

### How references follow edits

Each row and column of a table holds an identity that the source does not show. A reference holds the identities of its cells, and the writer writes the coordinates they have now. Calculated values are never stored in the model. `ksmd/edit/edit.kspl` holds the operations: insert and remove a row or a column, set a cell and copy a cell. `ksmd/edit/moving.kspl` moves a block of rows, columns or cells, and `ksmd/edit/sort.kspl` sorts the rows.

* **Insertion and movement keep every reference on its cells.** A range spans its two corners, so a row inserted between them joins it. A row inserted after the last corner stays outside; to grow a range at its end, insert inside it.
* **A whole column holds no row.** Rows inserted, removed or moved anywhere only change how many it takes. Its column follows as a range's does.
* **A moved block of cells moves a whole column only when the block holds every data row.** So a column cut by its letter and pasted on another takes `A` and `t.A` with it, as Excel moves `A:A`. A whole column written over by such a block becomes `#REF!`, and a block of some rows leaves it alone.
* **A range's corner follows its row or column.** When a corner's row moves by an insertion or a move, the range spans the corners' new places.
* **A sort moves each row with its identity, and each formula on a sorted row moves as a copy, as in Excel** (`move_as_copies` in `ksmd/edit/sort.kspl`). The formula is written again at its row's new place. A row part without `$` of a reference into the sorted table shifts as far as the row moved, and a part with `$` keeps its place.
  * So `=B1*C1` and `=sum(B1:C1)` stay their own row's figures. A running total `=sum(B$1:B3)` that lands on row 1 becomes `=sum(B$1:B1)`, so it still runs in the new order. `=B1-B$1` still compares its row with the first row.
  * A reference or range that the shift would take outside the table keeps its places, where a copy would give `#REF!`. So `=sum(A1:A3)` on row 1 that lands on row 3 stays `=sum(A1:A3)`.
  * A reference into another table keeps its cells, since that table's rows stay where they stood.
  * Why: a formula on a sorted row is written for its row: `B3` on row 3 means "this row" and `B2` "the row above". Only a copy keeps that meaning in the new order. The person who wants fixed rows writes `$`, as in every spreadsheet.
* **A formula in another table keeps naming what it named** (`keep_ranges` in `ksmd/edit/sort.kspl`). The sorted rows are not its own, so it has no row to move with.
  * A reference to one cell follows its cell, so `=t.B1` still names the same item after the sort.
  * A range within one row follows its row, as one cell does. So `=sum(t.B1:C1)` still adds that item's figures.
  * A range over several rows stays on its places. So `=sum(t.B1:B5)` still adds the first five rows.
  * Why: a total over rows 1 to 5 means that block, whatever order its rows stand in. Corners that followed their rows would land anywhere in the new order, and the total would add other rows without a word. Excel too leaves such a range on its places.
* **Removal turns a reference to the removed line into `#REF!`.** A range's corner on that line moves one line toward the other corner. A range with no line left becomes `#REF!`.
* **`$` acts only on copying, and on a sort, which moves a sorted row's formulas as copies.** A copy shifts each part without `$` by the distance copied, and a part with `$` keeps its row or column. A copy's shift outside the table gives `#REF!`, and a sort's keeps the places.
* **A reference without a table's name names a cell or a whole column of the table that holds the formula.** So a copy into another table names a cell or a column there. The writer keeps it without the name, also after a move.
* **A paste of cells copied in the page moves their formulas by the same rule.** The copy carries each formula as typed, and the place it was copied from. So the paste works from the text, in another table or another document (`shift_formula` in `ksmd/calc/formula.kspl`). A reference to a table that document lacks stays as written.
* **A reference that names no cell stays as written,** such as `Z9` in a four-column table. It attaches once that cell exists: after an insertion, and when the source is read again.
* **A reference straight after a number, as in `1A1`, never attaches.** That formula does not read, and a moved column could join the two into one number (`1E1`).
* **A value that would not read back is refused, and changes nothing.** A formula must be at most 4,096 bytes, and read back as itself alone in its cell. The reader's own rule decides (`reads_as_formula` in `ksmd/syntax/clause.kspl`): a formula stays on one line, with each `|` and `{` inside quotes.

### How tables calculate

The rules are "How tables calculate" in [`SPEC-file-format.md`](SPEC-file-format.md). Calculation (`ksmd/calc/calc.kspl`) opens no file, and its results stand apart from the document. It calculates every table of a source together, so a reference into another table and a cycle through two tables are both seen.

* **A chain deeper than 256 steps is set aside, and its deepest cell calculates first.** A step is a cell or a level of a formula. So a running total down 10,000 rows calculates without exhausting the stack.
* **After an edit, the whole source calculates again.** The read limit bounds that cost; a partial recalculation waits for a measured need.
* **Why a limit of reads** (`MAX_READS` in `ksmd/calc/calc.kspl`): the table limits alone do not bound the work. A range read on every row multiplies it, so a crafted file within 8 MiB can read billions of values, at about 100 ns each.
  * Why 500 million: the largest ordinary shapes measured read far less. A table of 10,000 rows with a `sum_if` over a whole column on each row reads 205 million.
  * The reason names the limit, so the person knows the values are not wrong but unfinished. Like `#CYCLE!`, the error keeps its own reason as it carries.
* **A call worked out once is used again for the rest of the calculation**, where each argument is a reference alone: `sum(A$1:A$10000)`, or `max(t.B)`. The same function on the same cells gives the same answer, as no function reads anything but its arguments. So a table of 10,000 rows with each row's share of a column's total adds the column once, not 10,000 times.
  * **The call is the function's name and its cells**, so `sum(t.A)` and `sum(A1:A300)` over the same 300 rows are one call. A person's own functions are not kept, nor a call with any other argument, nor a range read row by row in a condition.
  * **A call is kept only once each of its cells holds its final value.** A cell's value never changes after that within the calculation. Otherwise, as for a cell on its own chain or past the read limit, the call is worked out again where it stands next.
  * **A call used again counts as one read**, as reading it costs no more than reading one cell. So the read limit still bounds the work: a share of the total on each of 10,000 rows reads about 20,000 values.
  * Measured in the page's wasm, the share of a total down 10,000 rows calculated in 7.7 seconds before, and now in 0.04 seconds. In Chromium, an edit there took 14 seconds, and now 2.
  * Ten columns of 7,500 rows, each `sum(A1:A7500)`, reached `#LIMIT!` after 38 seconds. They now calculate in 0.13 seconds.
* **A function's arguments are kept only while it runs.** So `=sum(t.A)` on each of 3,000 rows keeps no copy of column A for each row; only the results stay.

### Dates

The rules are "Dates" in [`SPEC-file-format.md`](SPEC-file-format.md).

* **A typed `2026-10-23`, `2026/10/23`, `2026/1/5` or `11/6` becomes a date**, kept as `2026-10-23`. `11/6` falls in the year the document was opened.
* **A date sorts after the numbers and before text, earliest first.** The fill handle goes on by a day, or by the step between two dates.
* **The file keeps a date in ISO 8601's one form.** It reads the same in every country, and sorts in day order even as text. A column can show it with `/` ("Number formats" above).
* **A date is a count of days, not a number.** A date kept as a serial number adds silently in a sum. Here the kinds stay apart, and a mistake shows as `#VALUE!`.

### Today's date

The rules are "Today's date" in [`SPEC-file-format.md`](SPEC-file-format.md). `today()` gives the date Ctrl+; types.

* **The date stays the same while the document is open,** and moves at the next opening. A value that changed between two edits would surprise the person who made neither change.
* **Calculation reads no clock.** The page hands the date in, as `calculate(doc, today)`, so a test passes a fixed date.
* **Ctrl+; types a fixed date**, where `today()` moves at the next opening.

### What formulas leave for later

These were weighed and left out, so one way to write each thing stays:

* `ifs(c1, v1, c2, v2, …, otherwise)`, for a chain of choices. A nested `if` writes the same now.
* `let(name, value, expression)`, for long formulas. It needs names inside a formula, which ksmd does not have.
* Methods after a dot, as `B1.round(2)`. They would be a second way to write `round(B1, 2)`, and `.` already joins a table's name to a cell.
* A condition written as text, as `">5"`, and a second set of functions for several conditions. `sum_if` takes an expression and joins conditions with `and` and `or`.
* A `today()` that moves while the document is open, and a time of day as a value.
* A person's procedure that changes the document, as a spreadsheet's macros can. A person's own function returns a value only ("Your own functions").

### Charts

**A chart draws a table's calculated columns as bars or as lines.** Its clause is "Charts" in [`SPEC-file-format.md`](SPEC-file-format.md#charts).

* **Only bars and lines**, the charts people make most.
* **`by="rows"` serves a burn-up chart of a plan whose months stand across.** `from` and `to` are held by identity, as the other columns are.
* **A chart holds its table and columns by identity, as a formula's references do**, and the writer writes the names they have now.
* **A name that names nothing is kept as written**, so nothing is lost when a column is removed and put back.
* **A column that a chart shows keeps a name that finds it again.** The reader takes the first column of a name and splits `values` at each `,`. So an edit is refused where a shown column's name would be empty, hold a `,`, or match an earlier column.
* **The page draws a chart as SVG**, with colours that people with the common kinds of colour blindness tell apart.

`ksmd/syntax/chart.kspl` reads and writes the clause, and finds its table and columns. `ksmd/edit/editor_charts.kspl` makes and changes charts. A changed chart is a new entry that its block points at, so undo swaps the block back.

### Shapes drawn over an image or a chart

**Rectangles, arrows, lines and pen lines can be drawn over an image or a chart, to point at a part of it.** Their `draw` lines are "Shapes over an image or a chart" in [`SPEC-file-format.md`](SPEC-file-format.md#shapes-over-an-image-or-a-chart).

* **The page keeps a pen line's points at least 3 pixels apart, and thins a long stroke to 500.** So a slow hand makes no needless points in the file.
* **A point is in the picture's own pixels**, so a shape stays on what it points at however wide the page shows the picture.
* **The picture itself never changes.** The shapes are a layer over it in the source, so they can be moved or taken away later, and a diff shows them.
* **A shape belongs to its picture, never to the page.** No shape floats over the text, so none loses its place when the text or the rows above it change.

`ksmd/syntax/drawing.kspl` reads and writes the lines. `ksmd/edit/editor_drawings.kspl` changes them: new drawings make a new image or chart entry, so undo swaps the block back.

### Diagrams

**A `:::diagram` clause holds a drawing area of shapes and the arrows between them.** Its form is "Diagrams" in [`SPEC-file-format.md`](SPEC-file-format.md#diagrams).

* **Each shape names itself with `id`, and an arrow or a line names the two shapes it joins.** So a moved shape keeps its arrows, and a diff shows a moved shape as one changed line.
* **`font="mono"` serves a screen's mock-up.**
* **An arrow's ends meet the shapes' borders**, wherever the shapes stand.
* **The shapes come first**, so an arrow names only shapes already read.

**The layout is the author's, not computed.** A diagram drawn to a hand-made plan keeps that plan. A tool that lays a diagram out itself moves every box when one is added. The price is that a large diagram is placed by hand.

`ksmd/syntax/diagram.kspl` reads and writes the clause. `ksmd/edit/editor_diagrams.kspl` changes it whole: a changed diagram is a new entry, so undo swaps the block back.

## Includes and images

**An include clause names another source, and an image clause a picture.** Their forms are "Includes and images" in [`SPEC-file-format.md`](SPEC-file-format.md#includes-and-images). Insert ▸ Include… puts an include at the caret: it picks a document in the workspace, or starts an empty one.

**An image's `width` is its share of the text width.**

* **A share, not pixels or centimetres**: the same file shows alike on any screen and on any paper. A narrower window narrows the image with the text.
* **Images next to each other share a row**, so pictures stand in a line of Word's text. Two screenshots at `45%` stand side by side, with no clause for a row.

Rendering never follows a link; opening one is an explicit user action, in a new tab ("Read-only" in [`DESIGN-page.md`](DESIGN-page.md)).

### The workspace and its paths

**A document opens inside a workspace: a folder the user opens explicitly.** The local server is started on that folder and refuses a path that leaves it ("Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md#where-it-listens)). The root itself may be a link. A path's rules are "Paths" in [`SPEC-file-format.md`](SPEC-file-format.md#paths).

**A path is read from the folder of the source that holds it.** A file then keeps its meaning when its folder moves with the files it names.

**A path has one spelling.** `resolve_text` in `ksmd/files/files.kspl` refuses every other form before the page asks the local server for the file:

| Form refused | Why |
| :-- | :-- |
| An absolute path or a drive | It depends on one machine |
| A network location | It reaches outside the workspace, and can change or vanish |
| `\` between folders | `\` separates folders on Windows alone, so the path names other files elsewhere |
| A second spelling, such as `./a.ksmd` | A shorter spelling names the same file |
| A folder | A clause names a file |
| A climb out of the workspace | The workspace holds every file a document reaches |
| A final `.` or space, a `:`, or a device name | Windows reads it as another file or a device |

**A path stays inside the root by refusal, not by comparison.** It is refused if any folder or file along it is a link, even a link that stays inside. The local server makes this check, since it alone reaches the files ("Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md#where-it-listens); [std's reasons](../../std/docs/DESIGN-system.md#a-path-stays-under-the-root-by-refusal-not-comparison)). The page holds its refusal as that file's. A refused path opens nothing, so it never opens another file than the one written.

### The assembled view

**Each source is read once into its own model, and the view refers to its blocks.** `assemble_loaded` in `ksmd/files/assemble.kspl` builds it. Each `Entry` names the instance and the block it shows, so every block has its file and offset. An include clause stays in its parent's model, and the included blocks follow its entry. What a reader of the file can rely on is "The assembled view" in [`SPEC-file-format.md`](SPEC-file-format.md#the-assembled-view).

* **A file included twice is read once and shown twice**, so repetition is not a cycle.
* **A failed include or image is a `Problem` at its clause.** It holds its diagnostic and the include chain. The clause stays in the model, so a save keeps it.
* **A cycle spelt in two cases ends at the depth limit, not at the cycle check**, since the two spellings are two sources.

### Who writes a file

**Viewing never writes a file.** The view holds references to blocks, not text, so it has nothing to save.

**A save writes one source.** The page sends a document's canonical text for its own path. The local server replaces that file whole, so a crash leaves the old text or the new ("Files" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md#files)). A parent's model holds its include clause, so its save cannot flatten the included blocks.

**To change included text, the editor opens the included source** (`load` in `ksmd/files/files.kspl`), with its own undo. Several sources are never saved in one transaction.

### Table names across includes

**A table name belongs to its source file, and a functions clause gives its functions to the whole page.** The rules are "Table names across includes" in [`SPEC-file-format.md`](SPEC-file-format.md#table-names-across-includes).

* **Why functions are the exception:** a table in an included file calls the functions its own file names. So that file's clause must count where it is included. The page holds one list of names, so the parent's formulas see them too.

## Model and editor architecture

**The code's folders are layers, each knowing only those below it**: `base`, `model`, `calc`, `syntax`, then `files` and `edit` side by side, then the page. "Folder map" in [`ksmd/README.md`](../README.md) lists them.

* **The model and the calculation know no syntax**, so a value can be tested without reading a source.
* **The editor never reads a file.** It changes one source in memory, so the page can hand it files fetched from the server, and a test can hand it text.
* **An upward import is refused by `make test-conventions`.** The compiler sees only a cycle.

The model is an ordered block tree of paragraphs, headings, lists, code, tables, charts, images and includes. Tables own rectangular cells, not child blocks. Editing identities belong to the model and need not appear in source.

**The editor uses browser layout.** Paragraphs and real HTML tables give text flow, selection, accessibility structure and print layout without a second text-layout engine. Canvas remains an option for future specialized figures, not the default document surface.

The KSPL model remains authoritative: the page turns editing into model actions, and the selection is a pair of model spots, not a DOM range ([`DESIGN-page.md`](DESIGN-page.md)).

**A canvas exposes no text**, so selection, accessibility and typing would each need the editor's own code.

**The browser's own undo is not the product's undo.** The browser groups edits by its own rules, so undo records model transactions instead ("Undo and redo").

## How the editor changes a document

`Editor` in `ksmd/edit/editor.kspl` holds one document, its selection and its history. Every action a page asks for is a method on it, and each action is one transaction.

**An action takes the blocks it touches apart into units, changes them, and settles them into blocks again** (`ksmd/edit/region.kspl`). A unit is a paragraph, a heading, a code block, one list item, or a whole table, chart, image or include. Settling groups neighbouring list items into one list, and starts another list where a top-level item's marker changes.

**Text is changed as a run of segments, each with its own marks** (`ksmd/edit/styled.kspl`). A command sets or clears a mark per segment, and never opens or closes a node itself. Building the inline nodes again opens marks in a fixed order: a link outermost, then strong emphasis, then emphasis. That is the order in which the reader takes a run of `***` that opens both. Every mark closes before a hard break, since a mark closes on its source line.

**Each action's result is written and read back before it is taken.** The action is refused, and changes nothing, if the reader refuses that source or reads other text or other marks. So the editor holds no second copy of a rule the reader holds. The comparison allows what the writer leaves out at a line's edge.

**A block with no text leaves a gap**: a place for the caret, which keeps nothing. Deleting a block's last character removes the block, and the caret stands in a gap where it stood. Typing in a gap makes a block of the kind the gap keeps. A gap can stand between any two blocks and at either end. An empty code block stays, since the format holds one.

**A blank line is kept as a block of its own, written as a line holding only `\`.** Enter in a gap puts one there, as an empty paragraph stands in Word. The caret stays in the gap after it, so each press adds one more. Backspace or Delete beside it takes it away, as one step of undo.

* **Why a block of its own, not an empty paragraph**: Markdown has no empty paragraph, since a blank line separates blocks. A paragraph's lone hard break, `\`, is the closest form a reader of Markdown knows.
* **Why it holds no text**: typing in the gap beside it starts a paragraph there, so the blank line stays as it was.

| Key | Where the caret stands | What happens |
| :-- | :-- | :-- |
| Enter | In text | The block splits, and the text after the caret starts a block of the same kind |
| Enter | At the end of a heading's text | A gap for a paragraph opens after it |
| Enter | At the start of a block's text | A gap opens before the block, and the caret moves there |
| Enter | In an empty list item | The item moves one level out; at the top level it leaves the list |
| Enter | In code | A line break. On code's empty last line, that line goes and a gap opens after the code |
| Shift+Enter | In a paragraph | A hard break. In another block it acts as Enter |
| Backspace | At the start of a list item | The item moves one level out; at the top level it becomes a paragraph |
| Backspace | At the start of another block | The block joins the text block before it |
| Delete | At the end of a block | The next text block joins it |
| Enter | In a gap | A blank line goes there, and the caret stays in the gap after it |
| Backspace or Delete | Beside a blank line, in a gap or at the edge of the text | The blank line goes |
| Backspace or Delete | In a gap | The caret moves to the end of the text before it, or the start of the text after it |

**A kind change keeps the text.** In a heading or a list item a hard break becomes a space, and in code the marks go. A paragraph made a list item joins a neighbouring list whose top level has the same marker. A nested item's marker follows the first item of its level.

**A table goes in where the caret stands, splitting its text block.** A new table takes the first free name of `table1`, `table2` and on, with empty column names. Adding or renaming a table attaches each reference kept as text that then names one of its cells.

**A removed table keeps its place in the document's list of tables, emptied and with no name.** Blocks and references name a table by its place, so taking it out would renumber every later table. A reference to it from another table becomes text as written, and calculates as `#REF!`. Removing a table's block by any action empties its table.

**A cell edits as the text a person types.** Text after `=` is a formula, and a number as JSON writes one is a number. So is `1.` or `.5`, as Excel takes them; the file keeps `1` and `0.5`. A date as the file writes one, `2026-10-23`, is a date. While the page's AutoCorrect for dates is on, `2026/10/23` and `11/6` are dates too, and the file keeps the `-` form ("Choosing and editing cells" in [`SPEC-editing-page.md`](SPEC-editing-page.md)). Text in quotes is text, read as formula text is ("Text in a formula"), so `"12"` is the text 12. Nothing makes the cell empty, and anything else is text as typed. A number too large for a cell, as `1e400`, stays the text typed, as Excel keeps it. An `=` with nothing after it is refused as an empty formula. A cell's editor shows text that would read as another kind in quotes.

## Undo and redo

**Each action records the swap of what it changed** (`ksmd/edit/history.kspl`). Undoing swaps the old blocks and table parts back in, which leaves the undone version in the record for redo. Inline nodes and list items are only ever added, so an old block still names valid nodes. Undo and redo run strictly in order, since a swap is exact only then.

**A table edit is recorded by comparing each table with a copy made before it.** Where a table keeps its rows, columns, name and cell count, the record holds only the cells and formula pieces that differ. Column widths that change alone are recorded alone, so resizing a column copies no cell. Otherwise the record holds the whole table.

**Typing joins one step per word, with no clock**, so every machine gives the same steps and a test can check them. Typed text joins the step before it while the caret stays where that step left it. A space ends the step. Deleting single characters joins the same way. A paste, a composition, Enter and every command are steps of their own.

Undo and redo put back the selection each step started or ended with. A new action drops what was undone. A refused action records nothing.

## The file lifecycle

**ksmd reaches files through the repository's local server, `kssrv --local`, started on one workspace folder.** A page in a browser cannot read a folder, so it asks the server for each file by its path from the root ([`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). The server reaches files, and knows nothing of the document. Its one other request builds a document's own functions ("Your own functions"). ksmd adds no server of its own.

| Guarantee | What holds it |
| :-- | :-- |
| Only this machine and this page reach the server | "Where it listens" and "How the token gets across" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md) |
| A path stays inside the workspace | The page applies the workspace's text rules (`resolve_text` in `ksmd/files/files.kspl`). The server refuses a link and a path out of its root |
| No file is replaced by itself | Opening, viewing and drafts write nothing. A save writes the open document's own path, or a new path where no file stands. Save As replaces another file only after a second press, and only while that file still holds what it held when chosen. A new image, and a file that Insert starts, are written at once, never over a file that stands ("Images" below) |

### Opening

**A document opens from its path in the workspace**: from the address (`?doc=notes.ksmd`), or chosen in File, Open (Ctrl+O). The page gives the file's bytes to the editor unchanged. A file the reader refuses does not open, and the open document stays.

**The page builds the assembled view itself, in rounds.** An assembly over what the page holds names the files it still lacks (`Fetched` in `ksmd/files/fetched.kspl`). The page fetches them and assembles again, one round per level of includes. So the browser applies `assemble_loaded`'s rules, and a refusal that the server gives stands as that file's.

**An include shows its file's blocks in place, and they do not edit there.** Its Edit button opens the included file in a tab of its own, with its own undo, save and draft.

### Saving

**A save (Ctrl+S) writes the open document's canonical source to its own file, and only that file**, through `fs.replace_file` on the server.

**Save As chooses the folder and the name in a dialog** (Ctrl+Shift+S). The dialog shows one folder at a time: its folders, then its `.ksmd` documents, under the path from the workspace. It asks the local server for each folder's names; links and hidden names are not listed. A name with no extension gets `.ksmd`, and the chosen path goes through the same rules as a typed one. The Open dialog is the same dialog. A check or a draft that falls due while it is open still runs.

**A save compares the file's bytes with those this page last read or wrote, never its time.** The page keeps the SHA-256 digest of those bytes, and reads the file again before it writes. It sends the digest with the write, and the server replaces the file only while the file still matches. So a write from another tab in between is caught.

**A file changed on disk is never overwritten without a choice.** The page writes nothing and shows a notice that does not block editing. It offers to replace the file with this version, or to load the file's version and keep this one as a draft. No merge is offered, since a merge that drops a line loses work silently.

**When the page gains focus or is shown again, it reads its file again.** With nothing unsaved, a changed file shows at once, and the focus stays where it is, such as in the find bar. With edits unsaved, the page shows the same notice as a save. Each include and image is fetched again too.

**While the page is visible, it asks the local server every two seconds for its file's size and change time** ("Watching" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). Where either changed, the check above runs, so another program's write shows without a click.

**A new document saves only where no file stands, unless the person chooses to replace one.** Save on a document with no file yet opens Save As, where a file that stands is replaced only after a second press. Opening a missing path creates nothing.

### Drafts

**Unsaved edits are held as a draft in the browser's storage, and a draft is never written to the file.** A draft is written after one second without typing, after five seconds of steady typing, and when the page is hidden or left. The page says "Not saved. A draft is held in this browser.", and never calls a draft saved.

**A draft is offered when its document opens again, and comes back only on a press.** The notice names the time the draft was held, and offers to bring it back or discard it. A draft brought back keeps the digest of the file it started from, so a save over a file changed since then asks first.

**A draft is kept per workspace, path and opening.** Two tabs on one document hold two drafts, and neither overwrites the other. A draft is offered only once its tab is closed, so no tab can bring back or discard a draft that another still writes. A save, a discard, or edits undone back to the file's text let the draft go. Drafts older than 30 days are let go when the page starts.

**The browser keeps drafts per address, the server's port included.** So a launcher keeps one port per workspace ("Opening a document from the desktop" below). A server started by hand needs the same port each time.

**No lock file is written beside the document.** A lock file that a crash leaves behind blocks the next open, and the comparison of bytes at each save makes a lock unnecessary. Two actions write a new file at once without a save, never over one that stands. An image goes into the data folder under a free name ("Images" below). Insert ▸ Include… and Insert ▸ Functions file… write a starter file where the dialog chose, by default the data folder.

### Opening a document from the desktop

**A launcher opens a `.ksmd` file on its workspace, and keeps one port per workspace.** It starts the local server on the workspace, or reuses the one already serving it. It then opens the document's address, `?doc=` and its path from the root, in the default browser. "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md) ties `.ksmd` to it on each system.

* **Started from a file, the workspace is the nearest folder at or above it that holds a file named `.ksmd-workspace`**, or else the file's own folder. The mark keeps the person's choice in the folder itself, so an include that climbs with `../` stays inside it. A `.git` folder does not make a workspace: one at the home folder would put every file there in reach.
* **The same workspace gets the same port on every run**, worked out from its path, so the drafts held for that address come back. A port that another program holds moves that run's server to the next free port.
* **Each opening shows a tab of its own**, with its own draft.

**Where it was checked:** `make test-ksmd-open` runs the launcher on Linux, without a browser. No gate checks a double-click; it was checked by hand on Windows only, not on macOS.

### Checking a file without the page

**`ksmd --check` reads, assembles and calculates a file with the page's own code**, `report` in `ksmd/port/check.kspl`. Whoever wrote the file, often a model with no browser, sees what the page would show. The rules are "Checking a file" in [`SPEC-commands.md`](SPEC-commands.md#checking-a-file).

| Decision | Why |
| :-- | :-- |
| **A value is written as the file writes a cell**, text in quotes | A model reads the kind at once: the text `"6"` is a common mistake for the number `6`. A text that holds a line break stays on one line |
| **A cell's error leaves the exit code at 0; a problem in the view makes it 1** | An error is a value a file can hold on purpose. A missing include is never meant, and the page marks it at its clause |
| **Every problem prints, not only the first** | A writer fixes them in one round. The reader still stops at a source's first refusal |
| **Only the file named is calculated** | Each source calculates on its own, so an included file prints the same when checked itself. Its table names would otherwise need its path in front |
| **`today()` is today's date in UTC, unless `--today` names one** | std reads no time zone. The page's local date differs only near midnight, and `--today` gives a fixed answer |
| **No document's own functions run** | Running one needs the person's allowance, which only the page asks for. A call shows `#BLOCKED!`, so a correct name does not read as unknown |
| **A workspace on disk is read through `fs.join_under`**, as the local server reads it (`Disk`) | A link along a path is refused as the page sees it refused. ksmd's tests read their scratch folders through `Disk` too |

### A part file that an interrupted save leaves

**A `<name>.<16 hex digits>.part` file beside a source is left as it is.** `fs.replace_file` writes it before the rename, so it stays only after a crash. The source then still holds its old text, and the draft the text being saved. The page cannot see the part file and no request deletes one, so a person deletes it.

### Images

**An image's format and size come from its file's header, before the browser decodes it.** `measure` in `ksmd/files/image.kspl` reads a PNG's IHDR chunk, or walks a JPEG's segments to its frame header. The bytes decide the format, not the file's name. The page passes the header in windows of 64 KiB, so a large file never fills the editor's memory.

**An image pasted or dropped into the text is written in the document's data folder, and its clause goes in after the caret's block.** That folder is the document's name and `-data`, beside it, and the image takes the first free number: `notes-data/image-2.png`.

* **One folder per document holds every file ksmd writes for it**: its images, and a new functions file or included document from Insert (`dataFolder` in `ksmd/port/web/file.js`). A folder of documents does not fill with their files, and each document's files can be told apart. Moving or sending a document means one folder more. The server makes the folder on the first write.
* **The folder's name says it belongs to the document, not what it holds.** A name per kind of file, such as `-images`, would need a second folder for each new kind.
* **A file chosen elsewhere is used where it stands.** The folder is only where a new file goes by default; a clause may name any file in the workspace.
* **A document renamed or saved elsewhere keeps the folder's old name.** Its clauses name the files by their paths, which Save As writes again (`ksmd/port/web/save_as.kspl`), so nothing breaks.
* **The write never replaces a file**: a name already taken goes on to the next number.
* **The page asks nothing as the image goes in.** It goes in with no alternate text, as one that only decorates. Alt text… in the image's tools gives it a description later, and Caption… a caption that a reference names. A question on every image was asked more often than it was answered, and put the work before the picture.
* **It needs the local server and a document saved once**, for the image needs a folder to go in.
* **Only PNG and JPEG go in, up to the server's 8 MiB.** An image never goes into a table cell.
* **Undo takes the clause out, and the file stays**, as the Remove button leaves it.

### What the file lifecycle leaves out

* Two people editing one file at once. A save after another person's save asks, as for any change on disk.
* Noticing a change while the page is hidden.

## Limits and failures

Initial limits are safety bounds, not performance claims. Apply them before allocating expanded structures. The limits a file must keep are "Limits" in [`SPEC-file-format.md`](SPEC-file-format.md#limits).

**The view counts each include of a source**, so a view limit is found before the included blocks join the view.

A diagnostic names the source path, one-based line and Unicode-scalar column, plus the offending span. Internal spans use UTF-8 byte offsets, which the UI converts to its own selection units.

A source the reader refuses cannot be edited or saved, so a partly parsed model never overwrites the file; its diagnostics are offered instead.

An edit that would write a formula over 4,096 bytes is refused; a table's new name counts too, as a reference writes it. In a document read with a longer formula, that formula's length is the limit instead ("A formula longer than an edit writes"). A table edit past a table's limits is refused, and a refused edit changes nothing.

**A step that would leave the source over 8 MiB or 100,000 blocks is undone and refused**, since the saved file would not open again. The editor keeps the count of the source's bytes. A step that changes only blocks adds the bytes of those blocks. A step that changes a table measures the whole source, since a table changes how other tables and charts are written.

### Keys from a document

**No key from a document reaches std's `Map`.** `Map` hashes with a fixed seed, so a document could hold many names that start at one slot. Each lookup would pass them all. `make test-conventions` refuses `Map` anywhere in `ksmd/`.

**`Keyed` in `ksmd/base/keyed.kspl`, an AVL tree that compares keys byte by byte, holds them instead.** A lookup passes at most about 1.44 log2(n) keys, whatever their hashes. It holds the table names `reader.read` checks for repeats, the sources in `Assembly`, and the files in `Fetched`. A clause's problem is found by a binary search of `Assembly.problems`, and an included source's values by index. A sorted list is not used: names in falling order would shift the whole list at each insertion.

### What a document costs

**`make measure-ksmd` times three documents and checks nothing; its figures hold only for the machine it runs on.** `ksmd/tests/measure.kspl` times the model outside the browser, and `ksmd/tests/browser/measure.mjs` the page in headless Chromium. The documents are a typical one of about 46 KB, and two of about 2.4 MB and 6.2 MB with a table of 9,999 rows. In the page, a key is also timed to the end of the next frame, so the status bar's work counts too. The frames of a scroll through the first table are timed as well.

What the figures show, as orders of magnitude:

* **In the typical document, an edit takes tens of milliseconds at most, and opening well under a second.**
* **Outside the browser, the model is fast at every size.** A typed character takes under a millisecond, and setting a cell and calculating every table tens of milliseconds.
* **A key press grows with the blocks on the page, not with the model.** Most of its time goes to the browser placing the selection and laying the page out, and to the page's own scans of every block.
* **The editor's 128 MiB holds the large document only in a page opened from a file.** Served, the page builds its view from a second copy of the source, and the memory runs out. Opened from a file, a second opening of it is refused.
* **A value entered in a table draws again only the cells it changed** ("Input, menus and tables" in [`DESIGN-page.md`](DESIGN-page.md)). Before, the page drew and laid out the whole table, about 0.35 ms for each row. In the medium document, an entry went from 4.3 s to 1.4 s, and Alt+Right from 4.6 s to 1.6 s.
* **What is left of an entry's time is mostly the browser laying out the table.** A table of rows that each add to a running total changes half its column at each entry. A column that fits its text changes its width when its widest value changes, as a sum's does.

An entry in the middle of an invented table, the median of five, in milliseconds:

| The table | 1,000 rows, before → now | 3,000 rows | 9,999 rows |
| :-- | --: | --: | --: |
| A running total; the columns fit their text | 345 → 135 | 1,066 → 429 | 3,646 → 1,451 |
| A running total; the columns have widths set | 323 → 62 | 985 → 179 | 3,332 → 560 |
| No running total; the columns fit their text | 318 → 104 | 904 → 302 | 3,277 → 972 |
| No running total; the columns have widths set | 280 → 22 | 885 → 52 | 3,050 → 164 |
| Alt+Right, a running total; the columns fit their text | 336 → 120 | 1,027 → 329 | 4,993 → 1,113 |

These are known limits, not yet worked on:

* A key press in a document of tens of thousands of blocks takes over 100 ms.
* An entry in a table of 10,000 rows can still take about a second. A running total, or a column that fits its text, makes the browser lay out the whole table again. The calculation is a small part of it.
* So the served page does not reach the limits above: a document of 6.2 MB does not open, and one of 4.3 MB does.
