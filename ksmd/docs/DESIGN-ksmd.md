# The first ksmd document and editor

This is the design for implementers and reviewers. **It is not an implemented file-format specification.** The examples under `ksmd/examples/` illustrate these decisions, and everything below is implemented. The editing page has its own design, [`DESIGN-page.md`](DESIGN-page.md).

## The first usable document

A document contains prose, calculating tables, charts of them, images and includes, in reading order. The editor changes that structure directly. Source is read at open and written at save, not reparsed after each keystroke.

| Included | Excluded from the first release |
| :-- | :-- |
| Paragraphs, six heading levels, lists, links, emphasis and literal code | Raw HTML, executable code fences, embedded scripts |
| Rectangular tables with text, numbers and formulas | Merged cells, nested tables, blocks inside cells |
| Images in the document flow, with alternate text, an optional caption and shapes drawn over them | Floating objects, absolute positioning |
| Diagrams of shapes and the arrows between them | Shapes drawn freely on the page |
| Browser printing with automatic page breaks | Editable page boundaries, page templates, exact cross-browser pagination |
| Includes opened separately for editing | Network includes, editing several sources in one transaction |

Static figures are images with captions. Images keep their aspect ratio. Each fits the content width, or takes a share of it or of its own size that a person sets. Column resizing affects appearance, never cell identities or values. There is no presentation mode.

## Source boundaries

Files use UTF-8. The first line is exactly `%ksmd 1`; an unsupported version is an error before the body is read. The writer uses LF line endings and ends the file with one newline. The reader also accepts CRLF and an initial UTF-8 BOM. A carriage return without a following line feed is an error. Source views keep the original bytes, so diagnostics do not shift after CRLF or a BOM.

A file holding only the version marker is an empty document. A blank line separates blocks. Within a paragraph, a source newline becomes one space, and a backslash right before a newline is a hard line break. The writer puts a paragraph on one source line except for hard breaks.

A clause starts at column one with `:::`, its kind and its attributes. A line holding only `:::` closes it. Clauses do not nest in version 1. The kinds are `table`, `include`, `image`, `chart`, `diagram`, `functions` and `document`; an unknown kind is an error. Attributes are unique `name=value` pairs separated by spaces; an unknown or a repeated attribute is an error. Strings use JSON quoting and escapes, and numbers are decimal. There are no implicit attributes, positional arguments or short forms. A style cannot change a block's kind.

**A new attribute stays in version 1, and a ksmd older than the attribute refuses the file.** Its reader refuses an unknown attribute, naming the line and column, so it never opens such a file and saves it without the attribute. A version step would add nothing to that refusal: the older reader refuses `%ksmd 2` as well. It would cost a second reader to keep, and every file written since would carry the new number. The format is not yet a published specification, so version 1 still grows. A version step comes with a change an older reader would read wrongly rather than refuse.

A code fence starts with at least three backticks and an optional language label. Its closing line holds the same number of backticks and nothing else. Everything inside is literal, clauses and the version marker included. The writer chooses the shortest safe fence of at least three backticks.

## What the first reader models

**The reader models every structure of this design, and refuses a source it cannot read whole.** Saving a partial model would lose what it did not read. A refusal names the line and column.

**Inline markup is read into nodes, and the writer writes it back from them.** Text, inline code, a hard break, and the start and end of emphasis, strong emphasis and a link are each one node. Each node keeps its offset for diagnostics.

These reading rules settle cases the notation leaves open:

* A block starts at column one. An indented first line is refused, since two spaces mark a nested list item.
* A line of spaces and tabs only is blank. Inside a paragraph, each line's leading and trailing spaces are dropped.
* A line inside a paragraph that starts a block (`#`, a fence, `:::`, `|`, a list marker) is refused. Put a blank line before it, or escape it.
* An odd run of backslashes at a line's end is a hard break, and an even run is literal backslashes. A hard break at the end of a paragraph is refused.
* A heading's text is trimmed and must not be empty. Seven or more `#`, or `#` without a following space, is refused.
* A code fence's label holds only letters, digits and `_` `-` `+` `.`. A fence with no closing line is refused at its opening line.
* A list marker is `-`, or digits and `.`, followed by a space or the line's end. So `-5 degrees` and `1.5 metres` stay prose.
* A list runs to the next blank line, and each of its lines is an item. A line without a marker, an item with no text, and an item that ends in a hard break are refused.
* An item is nested at most one level deeper than the item before it. All items at one level of one list share one marker.
* The writer numbers every ordered item `1.`, so inserting or moving an item changes only its own lines.
* The writer leaves out spaces and tabs at a line's ends, and hard breaks at a paragraph's end. An editor's model holds them while text is typed.
* A run of `*` first closes open marks, innermost first, then opens marks that are not open. Marks must nest, and a run that can do neither is refused. A run never closes a mark and opens the same kind at once.
* Only a run of three with no mark open has two readings. Strong emphasis goes outside, unless the next run on the line can close only the other order (`***a** b*`).
* A code span ends at the next run of exactly as many backticks. One space at each end is dropped when both ends have one. The writer chooses the shortest run that the code does not hold.
* A link's label is not empty and holds no link. Its destination follows at once in parentheses, without spaces or parentheses, and starts with `https:`, `http:`, `mailto:` or `#`.
* A clause's kind follows `:::` at once, and its attributes come in any order. The writer writes them in a fixed order with one space: `name`, `char_widths`, `heights`, `formats`, `choices`, `rules`, `groups`, `filter`; `path`; `src`, `alt`, `caption`, `width`, `scale`. A table row outside a table clause is refused.
* Any clause may take `invisible="printing"`, written last, which leaves its block out of print and PDF ("Print and PDF" in [`DESIGN-page.md`](DESIGN-page.md)). It has one value, so a misspelt one is refused.
* `name`, `path` and `src` must not be empty. `alt` may be empty, for an image that only decorates. An empty `caption` is refused: leave the attribute out.
* A table may have a header and no data rows, so an editor can create an empty one.
* A cell's spaces are trimmed. The writer puts one space on each side of a value, and writes an empty cell as `| |`.
* A number has JSON's shape: no `+`, no leading zero, and a finite value. It is kept as written, so `2.50` stays `2.50`.
* A formula is kept as written after `=`, up to 4,096 bytes, and checked when tables calculate.
* Quoted text is decoded by JSON's rules. The writer escapes only what JSON requires.
* Paths are kept as written, and checked when files are resolved.

## Prose notation

| Structure | Source form | Limits |
| :-- | :-- | :-- |
| Heading | One to six `#` characters, then a space and inline text | One source line |
| Unordered list | `- ` before each item | One source line per item; two spaces per nested level |
| Ordered list | `1. ` before each item | Numbering is generated; two spaces per nested level |
| Checklist item | `- [ ] ` before an open item, `- [x] ` before a ticked one | A bulleted item; it can stand among other bulleted items |
| Quote | `> ` before each line | One paragraph; its lines join as a paragraph's do |
| Divider | A line `---` | Nothing else on the line |
| Blank line | A line `\` | Nothing else on the line; each such line is one empty line on the page |
| Emphasis | `*text*` | No newline inside a mark |
| Strong emphasis | `**text**` | No newline inside a mark |
| Link | `[label](destination)` | Holds emphasis and inline code, not a link; spaces and parentheses in destinations are percent-encoded |
| Coloured text | `[text]{color="#c00000"}` | A link takes a colour after its destination: `[label](destination){color=...}` |
| Aligned paragraph or heading | A line `{align="center"}` straight before it | `left`, `center` or `right` |
| Inline code | A matching run of backticks around literal text | Use a longer run for embedded backticks; no newline |
| Paragraph | Other text | Inline content and explicit hard breaks |

A backslash escapes the following ASCII punctuation outside code. Escape a block marker to start a literal paragraph: `\#`, `\-`, `1\.`, `\>`, `\---` or `\:::`. A backslash before a digit is invalid. The writer escapes `\`, `*`, backticks, `[` and `]` in text, and a block marker that starts a paragraph's line; a needless escape is dropped at save.

Typing inserts literal text: `#`, `*` or `:::` does not change structure. Formatting commands change the model, and the writer adds the delimiters and escapes. A rich-text paste would need a conversion that reports what it drops before insertion.

### Checklists, quotes and dividers

**A checklist item is a bulleted item with a tick box**: `- [ ] Buy pens`, and `- [x] Call Sam` once ticked. A to-do list then keeps what is done in sight.

* **Only a bulleted item takes a box.** Two forms for one need would make the file harder to read.
* **The `x` is lowercase**, so one tick has one spelling. Text in brackets that is not a box is escaped: `- \[ \] x`.
* **On the page, a press on the box ticks it or takes the tick away**, as one step of undo. A ticked item's text is greyed. Enter after a ticked item starts an open one.

**A quote is a paragraph whose every line starts with `> `**, as mail writes it. A quote holds one paragraph; two quotes stand apart with a blank line between them, so no quote nests in another.

**A divider is a line `---`**, and separates two parts of a document. It holds nothing, so the page shows it as a line with a Remove button. Insert, Divider adds one at the caret.

### Looks: colours, font size and alignment

**A look is direct formatting written in braces after what it formats**, so a change of look changes one line of the file. A table cell takes every part. Text in brackets takes a colour alone, and a paragraph or a heading an alignment alone.

| Part | Written | Meaning |
| :-- | :-- | :-- |
| `color` | `"#c00000"` | The text's colour: `#` and six hex digits |
| `fill` | `"#fff2cc"` | The background's colour |
| `size` | `14`, `10.5` | The font size in points, from 6 to 72, whole or ending in `.5`. The page offers 9, 10, 11, 12, 14, 18 and 24 |
| `align` | `"left"`, `"center"`, `"right"`, `"across"` | A cell's or a paragraph's alignment. `across` is a cell's alone |
| `wrap` | `"on"` | A cell's text breaks into lines at its column's width, as Excel's Wrap Text. Left out, the text stays on its lines |

* **Values are written as attributes are**: strings in JSON quotes, numbers bare. The writer writes the parts in that fixed order, and colours in lower case. A look with no part is refused.
* **A table cell writes its look after its value**: `| 120 {color="#c00000"} |`. An empty cell can carry a look alone: `| {fill="#fff2cc"} |`. A `{` inside quoted text is text.
* **Text takes a colour, and nothing else, in brackets: `[text]{color="#c00000"}`.** A fill and a size on text would make a page uneven. A `{` right after brackets is escaped.
* **A paragraph's or a heading's alignment stands on a line of braces right before it**, holding only `align`. At the end of the text, an ordinary `{` in prose could not be told apart. A `{` at the start of a paragraph's line is escaped, and anywhere else it is text.
* **A cell's new value keeps its look.**
* **`align="across"` centres a cell's value across the empty cells to its right that are `across` too**, as Excel's Center Across Selection. The run stops at the first cell that holds a value or has another alignment. A column a group hides is passed over.
  * **It is only a look.** The value stays in its own cell, so references, ranges, sort, filter, fill, copy and paste act as before.
  * **A value typed into a cell of the run ends the run there at once**, so no value is ever hidden under another.
  * **A paragraph or a heading refuses it**: they have no cells to span.

### Notes

**A cell, a paragraph or a heading can hold a note: a remark for the people who read the file.** The note stands last in the braces:

```text
| 120 {fill="#fff2cc" note="Check with Sam"} |

{note="Is this the final title?"}
# Plan
```

* **A note is 1 to 1,000 bytes of text**, a JSON string as any attribute is. A line break may stand in it, written `\n`.
* **Resolving a note takes it away**, so the next reader is not handed remarks that no longer apply. Undo brings it back.
* **No threads, replies or names.** These serve several people working on one file at once ("What the file lifecycle leaves out" below).
* **A note stays with its cell or paragraph** through a new value, a sort and a moved row. A paragraph split in two keeps it on the part before the split.

## The document's own settings

**A `:::document` clause sets what holds for the whole document**: the paper, the printed header and footer, and the numbers of headings and captions. It stands first in its source, before every other block, and once:

```text
:::document paper="A3" orientation="landscape" header="[Confidential]" footer="No.EXAMPLE-0001 ({page}/{pages})" numbers=2 table_label="表" figure_label="図"
:::
```

| Attribute | Sets | Left out |
| :-- | :-- | :-- |
| `paper` | `A3`, `A4`, `A5`, `B4`, `B5`, `letter` or `legal` | The browser's paper |
| `orientation` | `"landscape"` | Portrait |
| `header` | The text in the middle of each printed page's header | The document's name |
| `footer` | The text at the left of each printed page's footer | Nothing |
| `numbers` | The heading level that numbering starts at, 1 to 6, unquoted | No numbers |
| `table_label`, `figure_label` | The word before a table's or an image's number | `Table`, `Figure` |

* **Every attribute is optional, but the clause sets at least one.** Portrait has no spelling, so one setting has one form.
* **A header or a footer is 1 to 200 bytes of text.** `{page}` and `{pages}` stand for the page's number and the count of pages, and are the only braces it holds.
* **Headings number themselves from the level `numbers` names**: 1, 1.1, 1.1.1. With `numbers=2`, a level-1 heading stays a title without a number. A number is shown, never written into the heading's text, so an inserted section moves every later number at once.
* **A table's `caption` and an image's caption take a number by chapter**, such as `表 4-12`, where headings are numbered. The chapter is the heading at the level numbering starts at, and each chapter counts from 1 again.
* **A link whose text is `#` is a reference: `[#](#運用モード)`.** It shows the number of the heading, table or image its place names, so `[#](#運用モード)項` reads "4.1.1項". The place is a heading's text, a table's name or caption, or an image's caption. Without numbers, it shows that name, and a name that finds nothing shows `#?`.
* **Only the opened document's clause counts.** An included file's own clause is read, and changes nothing where it is included.

`ksmd/syntax/settings.kspl` reads, checks and writes the clause, and `ksmd/edit/editor_settings.kspl` sets it as one step of undo.

## Tables and calculations

A table clause requires `name="budget"`. A name is 1 to 255 bytes of any text but control characters, such as `Q1 sales`, unique within one source file. A table has a header row of quoted strings, outside the cell addresses, followed by data rows.

Every row starts and ends with `|`, and separators outside quoted strings split cells. Every row has the same positive number of cells. There is no Markdown alignment or separator row.

| Cell source | Meaning |
| :-- | :-- |
| Nothing between separators | Empty cell |
| `"Pens"`, `"0012"`, `"a\nb"` | Text; JSON escapes permit a multiline text value |
| `12`, `-3.5`, `1e3` | Finite decimal number, evaluated as F64 |
| `2026-10-23` | A date: a day of the years 1 to 9999, written as ISO 8601 writes it |
| `=B1*C1`, `=sum(D1:D2)` | Formula source, not its cached result |

Text cells need quotes, so numeric-looking identifiers and a leading `=` are unambiguous. A pipe inside a quoted string is text.

Addresses start at `A1`, the first data cell. `$A$1`, `$A1` and `A$1` fix axes when copying formulas. Within one source, `budget.D1` names a cell in another table. Cross-file formulas are excluded, including references into an include.

A formula holds numbers, text in quotes, `true` and `false`, cell references, rectangular ranges and whole columns. It holds parentheses, unary minus, `+`, `-`, `*`, `/`, `&`, the comparisons `=`, `<>`, `<`, `<=`, `>`, `>=`, the words `and`, `or` and `not`, and the functions `sum`, `min`, `max`, `count`, `average`, `if`, `round`, `round_down`, `round_up`, `sum_if`, `count_if`, `average_if`, `sum_product`, `lookup`, `today`, `date`, `year`, `month` and `day`. It also holds the six base functions of "Hexadecimal and binary" below, `mod` and `power`, and the text functions of "Text" below. Function names are lowercase. Multiplication and division bind before addition and subtraction. Both bind before `&`, and `&` before a comparison. `not` binds before `and`, and `and` before `or`. Other arithmetic groups left to right. A range stands only as a function's argument, or in the condition of `sum_if`, `count_if` and `average_if`. A document can add functions of its own, written in KSPL ("Your own functions").

An empty cell is zero in arithmetic. The rules for values and errors are "Values and errors" below, and for dates "Dates" below.

### How a formula is written

* A number has a cell number's shape without its sign: `2.5`, `1e3`, `0.5`. A sign is unary minus.
* **A whole number can also be written in hexadecimal or binary, as KSPL writes it:** `0xFF`, `0b_0111_0001` ("Hexadecimal and binary" below).
* A cell is capital column letters, then a row number from 1 without a leading zero: `D1`, `AA12`. A `$` before either part fixes that part for copying.
* `budget.D1` names a cell of another table in the same source, with no space around the `.`. A name that is not plain (a lowercase letter, then lowercase letters, digits and `_`) stands in JSON quotes: `"Q1 sales".D1`.
* A range is two cells joined by `:` without spaces: `D1:D3`. A table's name stands once, before the range: `budget.D1:D3`. The corners can come in either order, and the writer saves the upper left first.
* **A table's name and column letters alone name the whole column: `map.D`.** It takes every data row, never the names row, and rows added later. `map.D:F` names whole columns side by side. The table's name is always written, even for the formula's own table.
* `#REF!` stands where a reference lost its row or column. The reader and writer keep it, and it calculates as `#REF!`.
* **Text stands in JSON quotes, with JSON's escapes:** `"Pens"`, `"say \"hi\""`. Quotes followed at once by `.` and a cell name a table instead.
* **`and`, `or`, `not`, `true` and `false` are words.** A `|` splits a table row unless it stands in quotes, so the symbols `||` and `|` cannot serve.
* **A comparison takes one step: `1 < A1 < 9` does not read.** Write `1 < A1 and A1 < 9`.
* Spaces and tabs can stand between tokens. A function takes one or more arguments, separated by `,`.
* A formula nests at most 64 levels. The formula itself is one level, and each bracket, function, unary minus and `not` adds one.

### How a function is written

**Every function a formula calls by name is an ordinary KSPL function**, in `ksmd/calc/functions.kspl`. Its parameters' types say what it takes, and its result becomes the cell's value:

```kspl
pub fn round(x: F64, places: I64): F64!Calc_error
```

* **One set of rules converts every argument** (`ksmd/calc/args.kspl`). An `F64` takes a number, and an empty cell is 0; text there is `#VALUE!`. An `I64` takes a whole number, and a fraction is `#NUM!`. A `Value[]`, last, takes the arguments left, a range alone giving its numbers. A `T?`, last, may be left out.
* **An argument holding an error is the result**, the leftmost first, and the function is not called. An error the function throws (`!Calc_error`) is the cell's mark.
* **The table that calls them is written from their signatures** (`ksmd/calc/glue.kspl`, `make ksmd-functions`). So a function is added by writing it, and nothing else names it.
* **Seven forms are not functions**: `if`, `sum_if`, `count_if`, `average_if` and `lookup` choose which arguments are calculated, `sum_product` pairs two ranges' cells, and `today` reads the date the document opened. They stay in the calculator. `sum_if` hands the values its condition keeps to the same `sum`.
* **What a person reads of a function is written beside it, in its doc comments.** The first line says what it gives, each parameter's line what that argument takes, and a sentence "For example, `f(…)` is `…`." shows a call. The divider above it names its group. `make ksmd-functions` refuses a function that leaves one out, and a test calculates every example. The seven forms have their entries in `ksmd/calc/help.kspl`, which the calculator takes their names from. The page's help while a formula is typed and the reference's lists both come from there.

**Why ordinary functions**: a person reads how `sum` works in the language they write, and its rules for arguments are the ones any function follows.

### Your own functions

**A document adds its own functions with a `:::functions` clause** that names a `.kspl` file. Each `pub fn` in it is a function a formula calls by its name, with the rules above for its arguments:

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
* **A name ksmd has is refused**, so `sum` always means ksmd's `sum`. Where two files give one name, the first clause's is called.
* **The file is built again when it changes on disk**, once the page looks again (on focus, as for an include). The person allows its new content first.
* **A function returns a value only.** It cannot change the document, as a procedure in a spreadsheet's macros can. That was left for later.
* **Inside a `sum_if` condition, a range reaches a person's function whole**, never one row's cell. ksmd's own functions read the row's cell there.

**The page cannot wait for an answer**, so a cell whose answer has not come shows `…`, and the tables show again once it has. An answer comes back at once for the same call with the same arguments.

**Nothing of a functions file is built or run until the person allows that exact file.** Opening a document whose file is not allowed builds nothing. A bar at the top names the file: "This document has its own functions (mine.kspl). They run only if you allow them.", with Allow and Not now.

* **The allow holds for the file and its exact bytes.** The local server records the SHA-256 of the file's path and of its content. A file that changes, as when a colleague edits it in a shared folder, asks again.
* **The server keeps the record, and the server enforces it.** It builds only a file whose present bytes are allowed, and hands the builder their digest, so bytes changed in between are not built. A page that skipped the question still gets nothing built. The record stands outside the workspace, where a document's folder cannot allow its own functions.
* **The person's press on Allow is the one way an allow is made.** The page sends it with the token, and names the bytes it read. Bytes changed since are refused, and the page asks again.
* **Not now puts the question off for this opening alone.** The bar asks again the next time the document opens. The clause's box keeps its own Allow.
* **Stop allowing, in the clause's box, takes the allow back.** The cells show `#BLOCKED!` again.
* **Until the file is allowed, a call to a name ksmd does not have shows `#BLOCKED!`.** The names a file gives are known only once it builds, so every unknown name may be one of them. Once every file is built, an unknown name is `#SYNTAX!`, as ever. While a file builds, such a call shows `…`.
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

A cell's value is empty, a number, text, `true` or `false`, or an error. A formula's value is a number, text, `true` or `false`, or an error: `if(E1 < today(), "late", "")` gives text, and a comparison gives `true` or `false`. A formula that gives an empty cell's value, such as `=A1`, shows 0.

* **Kinds are never converted into each other.** Text and `true` or `false` in arithmetic are `#VALUE!`, even text that looks like a number. A `true` counted as 1 would give a total that looks right and is not.
* **`and`, `or` and `not` take only `true` and `false`.** A number or text there is `#VALUE!`; an empty cell is `false`.
* **Two values of different kinds are unequal.** `=` gives `false` and `<>` gives `true`. Ordering them is `#VALUE!`: an order between a number and text would hide a mistake.
* **An empty cell takes the kind of the other side: 0, empty text or `false`.** So `A1 = ""` and `A1 = 0` both hold for an empty A1.
* **Text compares without regard to case,** in the order the sort uses: letters A to Z, then other bytes by their value. `false` comes before `true`.
* **`and` calculates its right side only when its left side is `true`, and `or` only when it is `false`.** An error or a wrong kind on the left decides too.
* **`if(condition, then, else)` calculates only the branch it takes.** An error in the condition is the result.
* **`if` takes all three arguments**, since `false` in a column of numbers reads as a mistake. Two arguments are `#SYNTAX!`.
* **The branch not taken must still read**, so a slip shows at once: `if(true, 1, 2 +)` is `#SYNTAX!`.
* **`round(x, places)` changes the value, where a number format changes only what shows.** It rounds the shortest decimal digits of the number, half away from zero, so `round(2.675, 2)` is the F64 nearest to 2.68.
* **`places` is a whole number from -15 to 15; anything else is `#NUM!`.** `round(1250, -2)` is 1300.
* **`round_down` cuts toward zero and `round_up` away from it**, taking `places` as `round` does. They cut the 15 significant digits a person reads, so `round_down(0.1 + 0.2, 1)` is 0.3.
* **Only those 15 digits are rounded first**, so `round_down(0.99999999, 0)` is 0 and `round_up(1.0000001, 0)` is 2.
* **A reference alone as a function argument is a set of cells.** The function leaves out the set's empty cells, text, and `true` and `false`. Any other argument calculates as arithmetic, so `sum(A1+0)` with text in A1 is `#VALUE!`.
* **`min`, `max` and `average` of no numbers are `#EMPTY!`, not 0**, while `sum` and `count` of none are 0. A zero would hide that a column holds no data yet.
* **An error in a referenced cell carries into every formula that uses it, `count` included.**
* **Of two errors, the left one in the formula comes first**, and in a range the first in reading order.
* **A formula that does not read is `#SYNTAX!`.** Its source is kept, so a slip can be fixed later.

Each error has its own mark, since each is fixed differently.

| Mark | The cause |
| :-- | :-- |
| `#VALUE!` | A value of the wrong kind: text or `true` and `false` in arithmetic, a number or text as a condition, or two kinds ordered |
| `#DIV/0!` | A division by zero |
| `#NUM!` | A result too large: a number past an F64, or text past 32,767 bytes. Or a value out of a function's range: `round`'s places, a text position or a count |
| `#REF!` | A reference to no cell: `#REF!`, a cell outside its table, or a table name this source does not hold |
| `#CYCLE!` | The cell depends on itself, directly or through other cells |
| `#EMPTY!` | `min`, `max`, `average` or `average_if` of no numbers |
| `#SHAPE!` | A range in the condition of `sum_if`, `count_if` or `average_if` that is not one column as tall as the values, or a condition with no range. It is fixed by changing a range, which no other mark asks for |
| `#SYNTAX!` | The formula does not read: an unknown function, a range outside a function or a condition, a missing bracket or operand, or more than 64 levels. Or a literal in a base that is bad, past 2^53, or written as digit text |
| `#BLOCKED!` | A call to a name that ksmd does not have, while the person has not allowed the document's functions file ("Your own functions") |

### Totals by a condition

`sum_if(values, condition)` adds the numbers in `values` on the rows where the condition holds. `count_if` counts those numbers. `average_if` gives their average, or `#EMPTY!` when there are none.

```text
=sum_if(D1:D9, B1:B9 = "Pens")
=count_if(A1:A9, C1:C9 > 5 and B1:B9 <> "Done")
=average_if(D1:D9, B1:B9 = "Pens" or B1:B9 = "Ink")
```

* **The condition is an ordinary expression, not text read again later.** A range in it is read as its cell on each row in turn. `and`, `or` and `not` join conditions, so one function serves one condition or many.
* **The values come first in all three**, so the order cannot be swapped by mistake.
* **`values` is a cell or a range, and can be several columns wide.** Each row adds its cells from the left, leaving out empty cells, text, and `true` and `false`.
* **Every range in the condition is one column wide and as tall as `values`**, its rows paired with those of `values`. Any other range gives `#SHAPE!`: a range quietly cut or stretched would add the wrong rows.
* **A condition holds at least one range, or the result is `#SHAPE!`.** Without one, it takes all rows or none, which is nearly always a range written as a cell.
* **A cell alone in the condition is the same on every row**, and so is a range alone as a function's argument. `D1:D9 > average(D1:D9)` compares each row with the average of them all.
* **The condition takes only `true` and `false`; an empty result is `false`.** A number or text there is `#VALUE!`.
* **The values on a row are read only where the condition holds,** as `if` reads only the branch it takes. An error on a row left out does not show. A total row inside its own range is no cycle when the condition leaves it out.
* **Errors carry row by row from the top:** first the condition's, then the values' on that row from the left, `count_if` included.

### The sum of products

**`sum_product(a, b)` multiplies each cell of `a` by the cell of `b` beside it, and adds the products.** `=sum_product(D1:D9, E1:E9) / sum(D1:D9)` is the average of E weighted by D, such as a progress rate weighted by hours.

* **`a` and `b` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A pair is left out unless both its cells hold numbers**, as `sum` leaves out text and empty cells.
* **An error in either range is the result**, the first in order.

### Finding a value by its key

**`lookup(key, keys, values, otherwise)` gives the value beside the first key that equals `key`**, an exact-match lookup. `=lookup(A1, prices.A1:A50, prices.B1:B50, 0)` finds a price by its code.

* **`keys` and `values` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A match is exact.** Text equals text without regard to case, as the sort and the filter compare it. A number equals the same number. No nearest match is guessed.
* **`otherwise` is required, and calculated only where no key matches.** A missing key then shows what the writer chose, never an error nobody planned for.
* **An error in `key` is the result.** A key cell holding an error is passed over, but a key on a cycle before the match makes the lookup `#CYCLE!`. Passed over, it would hide the cycle.

### Hexadecimal and binary

**`dec_to_hex(n)` writes a whole number in hexadecimal, and `hex_to_dec(text)` reads it back**; `dec_to_bin` and `bin_to_dec` do the same in binary, and `hex_to_bin` and `bin_to_hex` go between the two. `=dec_to_hex(255)` is `"FF"`, and `=bin_to_dec("101")` is 5.

* **Every whole number up to 2^53 either way converts exactly**, the largest a cell's number holds exactly. A larger one, or a fraction, is `#NUM!`.
* **Without a width, a negative number takes a minus sign**: `=dec_to_bin(-5)` is `"-101"`, and `=hex_to_dec("-ff")` is -255.
* **A width in bits, from 1 to 53, writes two's complement**: `=dec_to_bin(-5, 8)` is `"11111011"`, and `=bin_to_dec("11111011", 8)` reads it back as -5. A number is written in the digits the width needs, zeros first (`=dec_to_hex(10, 16)` is `"000A"`). A number outside the width, or another width, is `#NUM!`.
* **Hexadecimal is written in capitals and read in either case.** A text holding anything but the base's digits is `#VALUE!`.
* **A whole number stands for its decimal digits** where text is read, so `=bin_to_dec(1010)` is 10. An empty cell is 0.

**A formula can also write a whole number in a base: `0x` and hexadecimal digits, or `0b` and binary digits.** `=0x100000` is 1048576, and `=0b_0111_0001` is 113.

* **The spelling is KSPL's, so one literal means the same in both.** The prefix is lowercase, and hexadecimal digits take either case. `_` can stand anywhere after the prefix, doubled or last too, as KSPL allows. `0X1F`, `0x`, `0x_`, `0b2` and `0xFFG` do not read.
* **The literal is kept as written**, as `2.50` is: the source saves `0x100000`, and a paste shifts only the references beside it.
* **Up to 2^53 it is exact; a larger literal does not read**, since a cell's number holds no larger whole number exactly.
* **It takes no sign.** A minus before it is unary minus: `=-0x10` is -16.
* **A literal does not read as the digit text of `hex_to_dec`, `bin_to_dec`, `hex_to_bin` or `bin_to_hex`**: `=hex_to_dec(0x100000)` is `#SYNTAX!`.
* A value typed into a cell is not read this way: a typed `0xFF` stays text.

**Why the literal is refused as digit text:** it is already the number. As a whole number, it would stand for its decimal digits, so `hex_to_dec(0x100000)` would quietly give 17073526. The rule holds in the argument's own brackets and arithmetic, but not inside another call: `=hex_to_dec(dec_to_hex(0xFF))` is 255. A formula that does not read shows at once, where a wrong number may never be noticed.

**Why a sign by default:** a negative number written as a fixed run of digits surprises a reader who wanted a sign. A fixed width also limits which numbers convert. So the width is the reader's choice, up to 53 bits.

### Text

**`mid`, `left`, `right`, `len` and `find` take Excel's names and its order of arguments, counted from 1**, so a formula carries over. `=mid("1234 5678", 6, 4)` is `"5678"`.

| Function | Gives |
| :-- | :-- |
| `mid(text, start, count)` | `count` characters from the `start`th |
| `left(text, count)`, `right(text, count)` | The first or the last `count` characters |
| `len(text)` | How many characters the text holds |
| `find(part, text)` | Where `part` first stands, from 1, or 0 where it does not |
| `value(text)` | The number the text writes in decimal: `value(" 12.5 ")` is 12.5 |
| `substitute(text, old, new)` | The text with every `old` replaced by `new`, from the left; case counts |
| `text(value, format)` | A number or a date written as a column's format shows it: `text(E2, "date:yyyy/mm/dd")` |
| `a & b` | The two texts joined |

* **A position counts characters, not bytes**, so `mid("かんそ", 2, 1)` is `"ん"`.
* **A start below 1 or a negative count is `#NUM!`.** A count past the end takes what there is, and a start past it gives empty text.
* **`find` gives 0 where the part is missing, not an error.** `if(find("/", A1) > 0, …)` then reads without a second function to catch the error. Case counts: `find("a", "A")` is 0.
* **A number is not text, here as in arithmetic.** `mid(255, 1, 1)` and `"No. " & 5` are `#VALUE!`; `dec_to_hex` writes a number as text. An empty cell is empty text.
* **`text` is the one way from a number or a date to text**, so `&` can join it. Its format is an entry of `formats` ("Number formats" below).
* **An empty format writes a number as the page shows it without a format**: at most 15 significant digits, so `text(0.1 + 0.2, "")` is `"0.3"`.
* **Text that `&` or a function gives is at most 32,767 bytes; a longer result is `#NUM!`.** Spreadsheets cap a cell's text at 32,767 characters. The count is in UTF-8 bytes, as for every other limit here.
* **The length is found before the text is made.** So a formula that doubles its text down 27 rows stops at the cap, and takes no more memory.
* **A line break in text is written `\n`**, with JSON's escapes: `substitute(A1, "\n", ", ")` puts a line's parts on one line.
* **`value` is the one way from text to a number.** Text that writes no decimal number, `"0x10"` among it, is `#VALUE!`; `hex_to_dec` reads hexadecimal.

**`mod(x, y)` takes the sign of `y`**, so `mod(-1, 72)` is 71 and a count wraps round as a clock does. **`power(x, y)` is `x` to the power `y`**; a result with no real number, such as `power(-1, 0.5)`, is `#NUM!`.

### Number formats

**A column's number format sets how its numbers show, and a cell can take its own; each cell keeps the number it holds.** The table's `formats` attribute holds one entry per column, as `widths` does:

```text
:::table name="budget" formats=",grouped:2,percent:1,currency:USD:2"
```

| Entry | Shows 1234.5 as | Shows -0.125 as |
| :-- | :-- | :-- |
| Nothing | The number as calculated | The number as calculated |
| `number:2` | `1234.50` | `-0.13` |
| `grouped:2` | `1,234.50` | `-0.13` |
| `percent:1` | `123,450.0%` | `-12.5%` |
| `currency:USD:2` | `$1,234.50` | `-$0.13` |
| `date:yyyy/mm/dd` | The number as calculated | The number as calculated |

* **Each entry names its kind and its decimal places, from 0 to 9**, with no default, so one format has one spelling. New rows follow the column's format.
* **A cell can take a format of its own, written in its braces: `| 0.125 {format="percent:1"} |`.** It stands over its column's. `general` shows the cell as calculated; a column has no such entry, since its empty entry says the same.
* **A format chosen on whole columns, by their letters, is the columns'**, and takes their cells' own formats away. Clear format takes a cell's own format away.
* **A column without a format has an empty entry.** `formats` stands only while some column has a format. A wrong entry is refused at its own column on the line.
* **Every kind but `number` puts a `,` between each three digits.** `percent` shows the number times 100: the decimal point moves two places, so 0.07 shows as exactly `7%`.
* **The decimal point is always `.` and the separator `,`**, so one file shows one way everywhere.
* **A currency is the three capital letters of ISO 4217.** USD, EUR, JPY, GBP, CNY, KRW, INR, CAD and AUD show their English symbols, with `CA$` and `CN¥` apart from `$` and `¥`. Any other code shows itself and a no-break space, as `CHF 12.00`.
* **A minus sign stands first, before a symbol.** A number that rounds to zero shows no minus: `-0.00` would read as a value below zero.
* **Rounding follows `round`'s rule, in the same code** ("Values and errors" above). So 2.675 shows as `2.68`, though its binary value is a little less. Only the shown text is rounded: a sum still adds the stored numbers.
* **Text, empty cells and errors in a formatted column show as they are.**
* **A typed `$12` or `12%` stays text** ("How the editor changes a document" below). The format gives the symbol; the cell holds the number.
* **An open cell edits the number it holds, with every digit, not the shown text.**
* **`date:yyyy/mm/dd` shows the column's dates as `2026/10/23`.** A date shows as `2026-10-23` with no entry. Its places cannot change.
* **A new column has no format, and a moved or removed column takes its format with it.**

`ksmd/model/format.kspl` reads, writes and shows a format. `edit.set_format` and `edit.step_places` (one place more or fewer) are each one step of undo.

### Choices

**A column can take only the values on its list of choices**, so the filter and `count_if` see "Done", never "done". The table's `choices` attribute holds one entry per column; inside an entry, `|` separates the choices:

```text
:::table name="tasks" choices=",Open|In progress|Done"
```

* **A typed value equals a choice without regard to case, and the cell holds the choice as the list spells it.** Any other value is refused, typed, pasted, filled or copied; an empty cell is allowed.
* **A choice is 1 to 100 bytes of text, with no `,`, `|`, `;`, `"` or `\`, and no space at either end.** A column holds at most 50, and no two equal without regard to case.
* **A list belongs to a column**, as a format does. A cell that already holds another value keeps it, and the page marks it.
* **Only a list.** Number ranges, dates and formula conditions are left out, and so is a list taken from another table.
* **A choice can take colours after `;`, as a rule writes them**: `Done;fill:#c6efce` or `Open;color:#9c0006 fill:#ffc7ce`. A cell that holds the choice shows them.
* **`color_rows="C"` colours each whole row by the choice its column C holds**, so the rows of an issue list show their state at a glance. Only a column with choices can colour rows, and a column's colour rule stands over a row's colours.
* **`color_rows` follows its column as a reference does**, and goes with it when the column is removed or loses its list.

`ksmd/model/choice.kspl` reads, writes and checks an entry. `edit.set_choices` sets a column's list as one step of undo, and `edit.set_cell` keeps to it.

### A link in a cell

**A text cell can link its text, written in its braces after its note: `| "Results" {link="https://example.com/r"} |`.** The page shows the text as a link.

* **The link takes the rules of a link in the text**: `https:`, `http:`, `mailto:` or a `#` place, with no space or bracket.
* **Only a text cell holds a link**, since the link names what the text says. A cell given a number, a date or a formula loses its link; new text keeps it.

### Colouring cells by their value

**A column can take one colour rule: its cells that meet it take the rule's colours**, which follow the value as it is calculated again. The table's `rules` attribute holds one entry per column, empty for none:

```text
:::table name="budget" rules=",,<0;color:#9c0006 fill:#ffc7ce"
```

* **An entry is a condition, `;`, then the colours.** `<5` is below 5, `>5` above 5, `=5` or `=Done` equal to it, and `empty` an empty cell. `color:` is the text's colour and `fill:` the background's, one or both.
* **The rule reads each cell's calculated value**, and compares text without regard to case.
* **The rule's colours stand over the cell's own look** while the rule holds.
* **`scale;from:#ffffff to:#ffef9c` is a colour scale.** The least number takes the first fill and the greatest the second, with the numbers between in between. A large workload stands out at a glance.
* **The columns that hold the same scale share one least and one greatest number.** So a block of months compares as one, as a scale over a range does in a spreadsheet. A cell that holds no number is not filled.
* **One rule per column, and only these conditions**, so no order between rules is needed. Data bars, icon sets and formula conditions are left out.
* **A rule belongs to a column**, as a format does, and moves with it.

`ksmd/model/rule.kspl` reads and writes an entry, and `edit.set_rule` sets a column's rule as one step of undo.

### Captions and merged columns

**Merged cells stay out: a table stays a rectangular grid, so sort, filter, ranges and references keep one cell per place.** Their look is given without them: `merge` gives it down a column, and `align="across"` ("Looks: colours, font size and alignment" above) along a row.

**A table's `caption` stands above it**: `:::table name="modes" caption="運用モード一覧"`. A caption is 1 to 200 bytes of text with no braces, numbered where the document numbers headings ("The document's own settings" above).

**`merge="A,B"` shows a value repeated down a column once, as merged cells look in a word processor.** Each cell still holds its value, so a sort, a filter and a range work as before; only the look changes.

* **A value merges with the shown row above when it shows the same text.** A column merges on a row only where every merged column left of it merges too. So a group's rows stay inside the group above them.
* **The columns are named by letters from the left, each once.** They follow their columns as a reference does, and a removed column leaves the list.
* **Rows a filter or a group hides do not count**, so what shows reads as merged.

### Groups of rows and columns

**Data rows can be grouped, and a group's rows hide and show together, as a spreadsheet's outline does. Columns group the same way.** The table's `groups` attribute saves each group, and whether it is hidden:

```text
:::table name="budget" groups="rows 2-4, rows 6-9 closed, rows 7, columns C-H closed"
```

* **An entry names data rows as a formula numbers them, from 1.** `rows 2-4` is rows 2 to 4, and `rows 7` one row. ` closed` marks a group whose rows are hidden.
* **A column entry names columns by their letters**: `columns C-H`, or `columns C` for one.
* **The rows' entries stand from the top, then the columns' from the left, an outer group before the groups it holds.** They are separated by `, `.
* **The rules below hold for the groups of columns as for those of rows**, each list alone. A column inserted inside a group joins it, and so on.
* **A group holds another group whole, or shares no row with it.** Groups nest at most 8 deep. Two groups never hold the same rows, and two side by side stay two.
* **A group belongs to the table's layout, as a width does, so it names rows by place.** A sort or a moved row leaves the groups where they stand. A row inserted inside a group joins it. A removed row leaves it, and a group whose rows are all removed goes.
* **Hidden rows still count in a formula**, as with a filter.
* **Whether a group is hidden is saved in the file, unlike a filter.** Hiding detail is the shape the writer gives the table, while a filter answers one question for the moment.

`ksmd/model/group.kspl` reads, writes and checks the groups. `edit.group_lines`, `edit.ungroup_lines` and `edit.show_group` are each one step of undo. Ungrouping takes away the smallest group that holds the chosen rows.

### Column widths and row heights

**The table's `char_widths` attribute gives a column a width in characters**, as a quoted list with one entry per column: `char_widths="12,,8.5"`. An entry is 0.5 to 255, Excel's limit, with at most one decimal place. An empty entry is a column that fits its text. The attribute stands only while some column has a width.

* **A character is the width of the digit 0 in the table's font**, as Excel's column width and CSS's unit `ch` count it. The model keeps tenths of a character, so a width is a whole number.
* **The table is as wide as its columns, not as wide as the window.** A person who sets a column's width in a spreadsheet expects it to stay, and expects no text to wrap when the window narrows. A wider table makes the page scroll sideways.
* **The older `widths="1,2,1"`, which gave each column a share of the width, is refused.** The message names `char_widths`, which says the same in characters.

**The table's `heights` attribute gives a row a height in points**, as a quoted list with one entry per data row: `heights=",30,,"`. An entry is a whole number from 6 to 409, Excel's limit, or empty for a row that fits its lines. The attribute stands only while some row has a height.

* **A height is exact: text taller than the row is cut, as in Excel.** A person who makes a row lower means it. A double-click on the row's edge fits it to its lines again ("Column widths and row heights" in [`DESIGN-page.md`](DESIGN-page.md)).
* **The model keeps each height by the row's identity**, so a sort, a moved row and an inserted row leave it on its row. A removed row's height comes back with an undo.
* **Points are the unit of a font's size**, which the look already uses ("Looks" above), and of Excel's row height.

### Filters

**The table's `filter` attribute keeps which rows the page shows**, as a quoted list with one entry per column (`ksmd/model/filter.kspl`):

```text
:::table name="tasks" filter="in:open|in progress|,,above:100"
```

| Entry | The rows it shows |
| :-- | :-- |
| Nothing | Every row |
| `in:` and values separated by bars | Rows whose cell shows one of the values; an empty value stands for empty cells |
| `out:` and values separated by bars | Rows whose cell shows none of the values |
| `is:`, `not:`, `contains:` and a value | Rows whose cell shows that text, any other, or text holding it |
| `above:`, `below:` and a value | Rows whose number is greater or less; text compares as text |
| `empty`, `filled` | Rows whose cell is empty, or holds a value |

* **A value is the text the cell shows, in lower case**, since the page compares without regard to case. `%25`, `%2C` and `%7C` stand for `%`, `,` and `|`, which separate the entries.
* **A change of number format takes the column's entry away, in the same step of undo.** The format of the column or of a cell in it changes the text the cell shows, so `in:1.5` would hide every row once 1.5 shows as 1.50.
* **A row inserted leaves every entry as it is.** The page shows the new row until the filter is chosen again ([`DESIGN-page.md`](DESIGN-page.md)), so the file keeps the filter the person chose.
* **The model keeps each entry by the column's identity**, so it moves with its column, and an undo of a removed column brings it back.
* **Whole columns cut and pasted on others give their entries to the columns pasted on**, as their widths, formats, choices and rules go (`move_cells` in `ksmd/edit/moving.kspl`). The cells move but the columns stay, so an entry left on its column would hide every row of an empty column.
* **The file keeps every row; a filter only hides some on the page and on paper.** A reader that does not know the attribute refuses the file rather than show rows the writer hid ("Source boundaries" above).

### How references follow edits

Each row and column of a table holds an identity that the source does not show. A reference holds the identities of its cells, and the writer writes the coordinates they have now. Calculated values are never stored in the model. `ksmd/edit/edit.kspl` holds the operations: insert and remove a row or a column, set a cell and copy a cell. `ksmd/edit/moving.kspl` moves a block of rows, columns or cells, and `ksmd/edit/sort.kspl` sorts the rows.

* **Insertion and movement keep every reference on its cells.** A range spans its two corners, so a row inserted between them joins it. A row inserted after the last corner stays outside; to grow a range at its end, insert inside it.
* **A whole column holds no row.** Rows inserted, removed or moved anywhere only change how many it takes. Its column follows as a range's does.
* **A moved block of cells moves a whole column only when the block holds every data row.** So a column cut by its letter and pasted on another takes `t.A` with it, as Excel moves `A:A`. A whole column written over by such a block becomes `#REF!`, and a block of some rows leaves it alone.
* **A range's corner follows its row or column.** When a corner's row moves, the range spans the corners' new places.
* **A sort moves each row with its identity.** A formula keeps naming the cells it named before, so `=B1*C1` in row 1 still names its own row after the sort.
* **Removal turns a reference to the removed line into `#REF!`.** A range's corner on that line moves one line toward the other corner. A range with no line left becomes `#REF!`.
* **`$` acts only on copying.** A copy shifts each part without `$` by the distance copied, and a part with `$` keeps its row or column. A shift outside the table gives `#REF!`.
* **A reference without a table's name names a cell of the table that holds the formula.** So a copy into another table names a cell there.
* **A paste of cells copied in the page moves their formulas by the same rule.** The copy carries each formula as typed, and the place it was copied from. So the paste works from the text, in another table or another document (`shift_formula` in `ksmd/calc/formula.kspl`). A reference to a table that document lacks stays as written.
* **A reference that names no cell stays as written,** such as `Z9` in a four-column table. It attaches once that cell exists: after an insertion, and when the source is read again.
* **A reference straight after a number, as in `1A1`, never attaches.** That formula does not read, and a moved column could join the two into one number (`1E1`).
* **A value that would not read back is refused, and changes nothing.** A formula must be at most 4,096 bytes, and read back as itself alone in its cell. The reader's own rule decides (`reads_as_formula` in `ksmd/syntax/clause.kspl`): a formula stays on one line, with each `|` and `{` inside quotes.

### How tables calculate

Calculation (`ksmd/calc/calc.kspl`) reads the model and one input: the date the document was opened. It opens no file, and its results stand apart from the document. It calculates every table of a source together, so a reference into another table and a cycle through two tables are both seen.

* **A cell calculates when a formula first needs it**, so the order of rows does not matter.
* **A cell reached again while it calculates is a cycle.** Every cell on the cycle shows `#CYCLE!`, and the error carries into the cells that use them.
* **Only what is calculated is followed.** A cell named in a branch `if` does not take, or on the side `and` or `or` skips, is not reached. So `=if(A1 > 0, B1, 0)` in B1 is a cycle while A1 is above 0, and 0 otherwise.
* **A chain deeper than 256 steps is set aside, and its deepest cell calculates first.** A step is a cell or a level of a formula. So a running total down 10,000 rows calculates without exhausting the stack.
* **After an edit, the whole source calculates again.** The table limits bound that cost; a partial recalculation waits for a measured need.
* **A condition of `sum_if`, `count_if` or `average_if` calculates once for each row of its values.**
* **A function's arguments are kept only while it runs.** So `=sum(t.A)` on each of 3,000 rows keeps no copy of column A for each row; only the results stay.

### Dates

**A date is a value of its own: a day, written `2026-10-23` and shown so.** A cell holding a bare `2026-10-23` is a date. A typed `2026-10-23`, `2026/10/23`, `2026/1/5` or `11/6` becomes one, kept as `2026-10-23`. `11/6` falls in the year the document was opened. A quoted `"2026-10-23"` stays text.

* **A date plus or minus a whole number of days is a date, and a date minus a date is the days between them**: `=A1+7`, `=B1-A1`. Any other arithmetic on a date is `#VALUE!`, and a day outside the years 1 to 9999 is `#NUM!`.
* **Dates compare with dates.** A date and text are unequal, and ordering them is `#VALUE!`, as for any two kinds.
* **`date(year, month, day)` makes a date**, and a day that does not exist, such as `date(2026, 2, 29)`, is `#NUM!`. `year`, `month` and `day` give a date's parts as numbers.
* **`min` and `max` of dates give the earliest and the latest, and `count` counts them.** `sum` and `average` over a date are `#VALUE!`, as is `min` over dates and numbers together.
* **A date sorts after the numbers and before text, earliest first.** The fill handle goes on by a day, or by the step between two dates.
* **The file keeps a date in ISO 8601's one form.** It reads the same in every country, and sorts in day order even as text. A column can show it with `/` ("Number formats" above).
* **A date is a count of days, not a number.** A date kept as a serial number adds silently in a sum. Here the kinds stay apart, and a mistake shows as `#VALUE!`.

### Today's date

**Calculation takes the date the page opened the document as an input, and reads no other outside state.** `today()` gives that date, the date Ctrl+; types.

* **The date stays the same while the document is open,** and moves at the next opening. A value that changed between two edits would surprise the person who made neither change.
* **Calculation reads no clock.** The page hands the date in, as `calculate(doc, today)`, so a test passes a fixed date. An included document calculates with the date of the document that includes it.
* **`today()` is a date**, so `today() - E1` gives the days since E1. Ctrl+; types a fixed date instead.

### What formulas leave for later

These were weighed and left out, so one way to write each thing stays:

* `ifs(c1, v1, c2, v2, …, otherwise)`, for a chain of choices. A nested `if` writes the same now.
* `let(name, value, expression)`, for long formulas. It needs names inside a formula, which ksmd does not have.
* Methods after a dot, as `B1.round(2)`. They would be a second way to write `round(B1, 2)`, and `.` already joins a table's name to a cell.
* A condition written as text, as `">5"`, and a second set of functions for several conditions. `sum_if` takes an expression and joins conditions with `and` and `or`.
* A `today()` that moves while the document is open, and a time of day as a value.
* A person's procedure that changes the document, as a spreadsheet's macros can. A person's own function returns a value only ("Your own functions").

### Charts

**A chart draws a table's calculated columns as bars or as lines.** The `:::chart` clause names the table, the column whose values label each bar or point, and the columns drawn:

```text
:::chart table="budget" kind="bar" labels="month" values="rent,food" title="Spending by month"
:::
```

* **`table`, `kind`, `labels` and `values` are required, and `title` is not.** `kind` is `bar` or `line`; `values` names 1 to 8 columns, separated by `,`.
* **`by="rows"` draws rows instead, as a burn-up chart of a plan whose months stand across.** `values` then names rows by their text in the `labels` column, and the columns from `from` to `to` are the points:

```text
:::chart table="plan" kind="line" labels="item" values="plan total,done total" by="rows" from="Oct" to="Mar"
:::
```

* **A row is found by its text when the chart is drawn**, the first row that holds it. `from` and `to` are held by identity, as the other columns are.
* **Only bars and lines**, the charts people make most.
* **A chart holds its table and columns by identity, as a formula's references do**, and the writer writes the names they have now.
* **A name that names nothing is kept as written, and the chart says what is missing.** Nothing is lost when a column is removed and put back.
* **A column that a chart shows keeps a name that finds it again.** The reader takes the first column of a name and splits `values` at each `,`. So an edit is refused where a shown column's name would be empty, hold a `,`, or match an earlier column.
* **A cell that holds no number leaves a gap**, and the axis starts at zero, so a bar's height is its value. The chart itself holds no values.
* **The page draws a chart as SVG**, with colours that people with the common kinds of colour blindness tell apart.

`ksmd/syntax/chart.kspl` reads and writes the clause, and finds its table and columns. `ksmd/edit/editor_charts.kspl` makes and changes charts. A changed chart is a new entry that its block points at, so undo swaps the block back.

### Shapes drawn over an image or a chart

**Rectangles, arrows, lines and pen lines can be drawn over an image or a chart, to point at a part of it.** Each shape is a `draw` line in the clause's body, with attributes as a clause's:

```text
:::image src="build.png" alt="The build window"
draw shape="rect" from="120,40" to="420,120" text="Press Build here"
draw shape="arrow" from="460,200" to="430,110" color="#1f5fbf"
:::
```

* **`shape` is `rect`, `arrow`, `line` or `pen`.** For the first three, `from` and `to` are its two ends: a rectangle's are two corners, and an arrow points at `to`.
* **A pen line is drawn by hand, and keeps its `points`**: `draw shape="pen" points="10,20 14,25 30,22"`, 2 to 500 points one space apart. It takes a `color`, and nothing else.
* **The page keeps a pen line's points at least 3 pixels apart, and thins a long stroke to 500.** So a slow hand makes no needless points in the file.
* **A point is in the picture's own pixels, from its upper left corner.** So a shape stays on what it points at however wide the page shows the picture. A chart's frame is 640 by 300 pixels.
* **A coordinate is a whole number from 0 to 20,000**, written without a leading zero.
* **`color` is `#` and six lowercase hexadecimal digits.** Left out, the shape takes the page's red.
* **Only a rectangle holds `text`: one line of 1 to 200 bytes**, written at its upper left corner on a white ground.
* **One image or chart holds at most 100 shapes.**
* **The picture itself never changes.** The shapes are a layer over it in the source, so they can be moved or taken away later, and a diff shows them.
* **A shape belongs to its picture, never to the page.** No shape floats over the text, so none loses its place when the text or the rows above it change.

`ksmd/syntax/drawing.kspl` reads and writes the lines. `ksmd/edit/editor_drawings.kspl` changes them: new drawings make a new image or chart entry, so undo swaps the block back.

### Diagrams

**A `:::diagram` clause holds a drawing area of shapes and the arrows between them.** A chart of screens and the keys that move between them is one:

```text
:::diagram size="800,400" caption="Moving between screens"
box id="menu" at="40,40" size="200,120" text="MENU\n1.SET\n2.END" font="mono"
diamond id="ask" at="320,60" size="120,80" text="Save?"
note id="tip" at="320,200" size="160,50" text="Yes saves"
arrow from="menu" to="ask" text="[OK] pressed"
line from="tip" to="ask" via="380,180"
:::
```

* **A shape is `box`, `diamond`, `start`, `end`, `group` or `note`.** A start is a filled dot and an end a ringed one. A group is a dashed frame whose text is its title.
* **Each shape names itself with `id`, and an arrow or a line names the two shapes it joins.** So a moved shape keeps its arrows, and a diff shows a moved shape as one changed line.
* **`at` and `size` place a shape in the diagram's own pixels, inside `size`**, which runs from 50 to 20,000 each way.
* **A shape's `text` may hold lines, written `\n`.** `font="mono"` gives it a fixed-width font, for a screen's mock-up. `color` and `fill` are `#` and six lowercase hexadecimal digits.
* **An arrow's `text` is one line, and `via` lists up to 20 points it bends at.** Its ends meet the shapes' borders, wherever the shapes stand.
* **The shapes come first, then the arrows and lines**, so an arrow names only shapes already read. One diagram holds at most 1,000 shapes and 2,000 arrows and lines.
* **`caption` is numbered as an image's is** ("Page setup, numbers and references" in [`DESIGN-page.md`](DESIGN-page.md)), and a reference can name it.

**The layout is the author's, not computed.** A diagram drawn to a hand-made plan keeps that plan. A tool that lays a diagram out itself moves every box when one is added. The price is that a large diagram is placed by hand.

`ksmd/syntax/diagram.kspl` reads and writes the clause. `ksmd/edit/editor_diagrams.kspl` changes it whole: a changed diagram is a new entry, so undo swaps the block back.

## Includes and images

An include clause has only `path="notes.ksmd"` and an empty body. Insert ▸ Include… puts one at the caret: it picks a document in the workspace, or starts an empty one. A document never includes itself. An image clause requires `src` and `alt`, and permits `caption`, and `width` or `scale`. Its body holds only the shapes drawn over it ("Shapes drawn over an image or a chart" below). Version 1 accepts local PNG and JPEG assets. SVG, remote images, executable formats and data URLs are excluded.

**An image's `width` is its share of the text width: `width="40%"`, a whole number from 1 to 100.** Its height follows, so the picture keeps its shape. Without it, the image fits the text width as far as its pixels allow.

* **A share, not pixels or centimetres**: the same file shows alike on any screen and on any paper. A narrower window narrows the image with the text.
* **Images next to each other share a row while each has a width and the widths add up to 100% or less.** So pictures stand in a line of Word's text. Two screenshots at `45%` stand side by side, with no clause for a row.

**An image's `scale` is its share of its own size: `scale="50%"`, a whole number from 1 to 400.** At `100%`, one pixel of the image is one CSS pixel. Its height follows, and the image is never wider than the text.

* **A scale follows the picture, not the window.** The text width changes with the window, so a width cannot hold "half of this screenshot". A scale keeps a picture at the size that its own pixels give, on any window, as Word's Scale and Typora's zoom do.
* **A clause holds a width or a scale, never both.** Each is a way to size the image, so the reader refuses the two together, and the message says to keep one. Setting one in the editor takes the other away.
* **Only a width shares a row.** A width is a share of the text, so the widths add up; a scale gives no share to add.

Links may use `https`, `http`, `mailto`, or a document fragment; other schemes are refused. Rendering never follows a link; opening one is an explicit user action, in a new tab ("Read-only" in [`DESIGN-page.md`](DESIGN-page.md)).

### The workspace and its paths

**A document opens inside a workspace: a folder the user opens explicitly.** Every source and image the document reaches stays inside it (`Workspace` in `ksmd/files/workspace.kspl`). The root itself may be a link.

**A path is read from the folder of the source that holds it**, for includes and images alike. A file then keeps its meaning when its folder moves with the files it names.

**A path has one spelling.** `/` separates folders. Any `..` segments come first, and each climbs one folder from the holding file's folder. `resolve_text` in `ksmd/files/files.kspl` refuses every other form, on disk and in the page alike:

| Written | Why it is refused |
| :-- | :-- |
| `/notes.ksmd`, `C:/notes.ksmd` | An absolute path or a drive depends on one machine |
| `https://…`, `mailto:…`, `//server/share/…` | A network location reaches outside the workspace, and can change or vanish |
| `a\b.ksmd` | `\` separates folders on Windows alone, so the path names other files elsewhere |
| `./a.ksmd`, `a//b.ksmd`, `a/../b.ksmd` | A shorter spelling names the same file |
| `..` alone, or `sub` for a folder | It names a folder, not a file |
| `../x.ksmd` in a file at the root | It climbs out of the workspace |
| A name ending in `.` or a space, holding `:`, or a device name such as `CON` | Windows reads it as another file or a device |

**A path stays inside the root by refusal, not by comparison.** It is refused if any folder or file along it is a link, even a link that stays inside. `Workspace.resolve` decides this with `fs.stays_under`, std's one check for it ([std's reasons](../../std/docs/DESIGN-system.md#a-path-stays-under-the-root-by-refusal-not-comparison)). A refused path opens nothing, so it never opens another file than the one written.

**Nothing is created for a missing file.** An include or an image whose file is absent is a problem at its clause.

### The assembled view

**Each source is read once into its own model, and the view refers to its blocks.** `assemble` in `ksmd/files/assemble.kspl` builds it. Each `Entry` names the instance and the block it shows, so every block has its file and offset. An include clause stays in its parent's model, and the included blocks follow its entry.

**Each include of a file makes an instance of its own.** A file included twice is read once and shown twice, so repetition is not a cycle. A cycle is a source already on the current include stack.

**Only the opened document's own failure stops it opening.** An include or an image that fails is a `Problem` at its clause, and the rest of the view opens. The clause stays in the model, so a save keeps it. A problem holds its diagnostic and the include chain: each include clause that leads to it, innermost first.

| What fails | Where its diagnostic points |
| :-- | :-- |
| A refused path, a missing or unreadable file, a cycle, the depth limit or a view limit | The include or image clause |
| A source the reader refuses | Its own line and column; the clause that includes it leads the chain |

**Two sources are the same file when their paths from the root are equal.** On a file system that ignores case, `Notes.ksmd` and `notes.ksmd` are then two sources. A cycle spelt in two cases ends at the depth limit, not at the cycle check.

**An image's path is resolved and checked when the view is built**: a regular file must stand there. Its format and pixels are checked when the editor reads it for display.

### Who writes a file

**Viewing never writes a file.** The view holds references to blocks, not text, so it has nothing to save.

**A save writes one source.** `Workspace.save` writes a document's canonical text through `fs.replace_file`, so a crash leaves the old text or the new. A parent's model holds its include clause, so its save cannot flatten the included blocks.

**To change included text, the editor opens the included source** (`load` in `ksmd/files/files.kspl`), with its own undo. Several sources are never saved in one transaction.

### Table names across includes

**A table name belongs to its source file.** Two files can each hold a table named `budget`, and a repeated include shows one declaration again. A formula names only the tables of its own source, so a repeated table shows the same values in each instance.

## Model and editor architecture

**The code's folders are layers, each knowing only those below it**: `base`, `model`, `calc`, `syntax`, then `files` and `edit` side by side, then the page. "Folder map" in [`ksmd/README.md`](../README.md) lists them.

* **The model and the calculation know no syntax**, so a value can be tested without reading a source.
* **The editor never reads a file.** It changes one source in memory, so the page can hand it files fetched from the server, and a test can hand it text.
* **An upward import is refused by `make test-conventions`.** The compiler sees only a cycle.

The model is an ordered block tree of paragraphs, headings, lists, code, tables, charts, images and includes. Tables own rectangular cells, not child blocks. Editing identities belong to the model and need not appear in source.

**The editor uses browser layout.** Paragraphs and real HTML tables give text flow, selection, accessibility structure and print layout without a second text-layout engine. Canvas remains an option for future specialized figures, not the default document surface.

The KSPL model remains authoritative: the page turns editing into model actions, and the selection is a pair of model spots, not a DOM range ([`DESIGN-page.md`](DESIGN-page.md)).

**A layout comparison confirmed the choice.** In headless Chromium, editable paragraphs and a real HTML table took typing and composition once. They wrapped and fitted at a 320-pixel width. Native selection read the text, the accessibility tree held the table, and printing broke a long table across pages. A canvas exposed no text, so accessibility, selection and typing would each be the editor's own code.

**The browser's own undo is not the product's undo.** The browser groups edits by its own rules, so one undo removed two separate edits. Undo records model transactions instead ("Undo and redo").

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

**A cell edits as the text a person types.** Text after `=` is a formula, and a number as JSON writes one is a number. A quoted JSON string is text, so `"12"` is the text 12. Nothing makes the cell empty, and anything else is text as typed. A number too large for a cell, as `1e400`, stays the text typed, as Excel keeps it. An `=` with nothing after it is refused as an empty formula. A cell's editor shows text that would read as another kind in quotes.

## Undo and redo

**Each action records the swap of what it changed** (`ksmd/edit/history.kspl`). Undoing swaps the old blocks and table parts back in, which leaves the undone version in the record for redo. Inline nodes and list items are only ever added, so an old block still names valid nodes. Undo and redo run strictly in order, since a swap is exact only then.

**A table edit is recorded by comparing each table with a copy made before it.** Where a table keeps its rows, columns, name and cell count, the record holds only the cells and formula pieces that differ. Column widths that change alone are recorded alone, so resizing a column copies no cell. Otherwise the record holds the whole table.

**Typing joins one step per word, with no clock**, so every machine gives the same steps and a test can check them. Typed text joins the step before it while the caret stays where that step left it. A space ends the step. Deleting single characters joins the same way. A paste, a composition, Enter and every command are steps of their own.

Undo and redo put back the selection each step started or ended with. A new action drops what was undone. A refused action records nothing.

## The file lifecycle

**ksmd reaches files through the repository's local server, `kssrv --local`, started on one workspace folder.** A page in a browser cannot read a folder, so it asks the server for each file by its path from the root ([`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). The server reaches files, and knows nothing of the document. Its one other request builds a document's own functions ("Your own functions"). ksmd adds no server of its own.

| Guarantee | What holds it |
| :-- | :-- |
| Only this machine reaches the server | The server listens on the loopback alone, and refuses a request that names another host |
| Another page or program cannot drive it | The server makes a new token at each start. The page moves it from the address into the tab's storage, and sends it in a header |
| A path stays inside the workspace | The page applies the workspace's text rules (`resolve_text` in `ksmd/files/files.kspl`). The server refuses a link and a path out of its root |
| No file appears by itself | Opening, viewing and drafts write nothing. A save writes the open document's own path, or a new path where no file stands. Save As replaces another file only after a second press, and only while that file still holds what it held when chosen |

### Opening

**A document opens from its path in the workspace**: from the address (`?doc=notes.ksmd`), or chosen in File, Open (Ctrl+O). The page gives the file's bytes to the editor unchanged. A file the reader refuses does not open, and the open document stays.

**The page builds the assembled view itself, in rounds.** An assembly over what the page holds names the files it still lacks (`Fetched` in `ksmd/files/fetched.kspl`). The page fetches them and assembles again, one round per level of includes. So the browser applies `assemble`'s rules, and a refusal that the server gives stands as that file's.

**A chart's Edit button opens a panel**: bars or lines, the labels column, the columns drawn, and a title. The table's right-click menu holds Insert chart, which puts a bar chart of the first column of numbers after the table.

**A Remove button on an include, an image or a chart takes that block out of the document**, since no text selection reaches inside it. The included file or the image file stays as it is.

**An include shows its file's blocks in place, and they do not edit there.** Its Edit button opens the included file in a tab of its own, with its own undo, save and draft.

### Saving

**A save (Ctrl+S) writes the open document's canonical source to its own file, and only that file**, through `fs.replace_file` on the server.

**Save As chooses the folder and the name in a dialog** (Ctrl+Shift+S). The dialog shows one folder at a time: its folders, then its `.ksmd` documents, under the path from the workspace. It asks the local server for each folder's names; links and hidden names are not listed. A name with no extension gets `.ksmd`, and the chosen path goes through the same rules as a typed one. The Open dialog is the same dialog. A check or a draft that falls due while it is open still runs.

**A save compares the file's bytes with those this page last read or wrote, never its time.** The page keeps the SHA-256 digest of those bytes, and reads the file again before it writes. It sends the digest with the write, and the server replaces the file only while the file still matches. So a write from another tab in between is caught.

**A file changed on disk is never overwritten without a choice.** The page writes nothing and shows a notice that does not block editing. It offers to replace the file with this version, or to load the file's version and keep this one as a draft. No merge is offered, since a merge that drops a line loses work silently.

**When the page gains focus or is shown again, it reads its file again.** With nothing unsaved, a changed file shows at once. With edits unsaved, the page shows the same notice as a save. Each include and image is fetched again too.

**While the page is visible, it asks the local server every two seconds for its file's size and change time** ("Watching" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). Where either changed, the check above runs, so another program's write shows without a click.

**A new document saves only where no file stands, unless the person chooses to replace one.** Save on a document with no file yet opens Save As, where a file that stands is replaced only after a second press. Opening a missing path creates nothing.

### Drafts

**Unsaved edits are held as a draft in the browser's storage, and a draft is never written to the file.** A draft is written after one second without typing, after five seconds of steady typing, and when the page is hidden or left. The page says "Not saved. A draft is held in this browser.", and never calls a draft saved.

**A draft is offered when its document opens again, and comes back only on a press.** The notice names the time the draft was held, and offers to bring it back or discard it. A draft brought back keeps the digest of the file it started from, so a save over a file changed since then asks first.

**A draft is kept per workspace, path and opening.** Two tabs on one document hold two drafts, and neither overwrites the other. A save, a discard, or edits undone back to the file's text let the draft go. Drafts older than 30 days are let go when the page starts.

**The browser keeps drafts per address, the server's port included.** So a launcher keeps one port per workspace ("Opening a document from the desktop" below). A server started by hand needs the same port each time.

**Nothing is written beside the document.** A lock file that a crash leaves behind blocks the next open, and the comparison of bytes at each save makes a lock unnecessary.

### Opening a document from the desktop

**A launcher opens a `.ksmd` file on its workspace, and keeps one port per workspace.** It starts the local server on the workspace, or reuses the one already serving it. It then opens the document's address, `?doc=` and its path from the root, in the default browser. "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md) ties `.ksmd` to it on each system.

* **Started from a file, the workspace is the nearest folder at or above it that holds a file named `.ksmd-workspace`**, or else the file's own folder. The mark keeps the person's choice in the folder itself, so an include that climbs with `../` stays inside it. A `.git` folder does not make a workspace: one at the home folder would put every file there in reach.
* **The same workspace gets the same port on every run**, worked out from its path, so the drafts held for that address come back. A port that another program holds moves that run's server to the next free port.
* **Each opening shows a tab of its own**, with its own draft.

**Where it was checked:** `make test-ksmd-open` runs the launcher on Linux, without a browser. No gate checks a double-click; it was checked by hand on Windows only, not on macOS.

### A part file that an interrupted save leaves

**A `<name>.<16 hex digits>.part` file beside a source is left as it is.** `fs.replace_file` writes it before the rename, so it stays only after a crash. The source then still holds its old text, and the draft the text being saved. The page cannot see the part file and no request deletes one, so a person deletes it.

### Images

**An image's format and size come from its file's header, before the browser decodes it.** `measure` in `ksmd/files/image.kspl` reads a PNG's IHDR chunk, or walks a JPEG's segments to its frame header. The bytes decide the format, not the file's name. The page passes the header in windows of 64 KiB, so a large file never fills the editor's memory.

**An image pasted or dropped into the text is written in the document's data folder, and its clause goes in after the caret's block.** That folder is the document's name and `-data`, beside it, and the image takes the first free number: `notes-data/image-2.png`.

* **One folder per document holds every file ksmd writes for it**: its images, and a new functions file or included document from Insert (`dataFolder` in `ksmd/port/web/file.js`). A folder of documents does not fill with their files, and each document's files can be told apart. Moving or sending a document means one folder more. The server makes the folder on the first write.
* **The folder's name says it belongs to the document, not what it holds.** A name per kind of file, such as `-images`, would need a second folder for each new kind.
* **A file chosen elsewhere is used where it stands.** The folder is only where a new file goes by default; a clause may name any file in the workspace.
* **A document renamed or saved elsewhere keeps the folder's old name.** Its clauses name the files by their paths, which Save As writes again (`ksmd/port/web/moving.kspl`), so nothing breaks.
* **The write never replaces a file**: a name already taken goes on to the next number.
* **The page asks nothing as the image goes in.** It goes in with no alternate text, as one that only decorates. Alt text… in the image's tools gives it a description later, and Caption… a caption that a reference names. A question on every image was asked more often than it was answered, and put the work before the picture.
* **It needs the local server and a document saved once**, for the image needs a folder to go in.
* **Only PNG and JPEG go in, up to the server's 8 MiB.** An image never goes into a table cell.
* **Undo takes the clause out, and the file stays**, as the Remove button leaves it.

### What the file lifecycle leaves out

* Two people editing one file at once. A save after another person's save asks, as for any change on disk.
* Noticing a change while the page is hidden.

## Limits and failures

Initial limits are safety bounds, not performance claims. Apply them before allocating expanded structures.

| Resource | Limit |
| :-- | :-- |
| One source file | 8 MiB of UTF-8 |
| Blocks in one source | 100,000 |
| List nesting or inline nesting | 16 levels each |
| One table | 256 columns, 10,000 data rows, 100,000 cells including the header |
| One formula | 4,096 UTF-8 bytes and 64 expression levels |
| Text that `&` or a function gives | 32,767 UTF-8 bytes; past it, `#NUM!` |
| `round`'s places | -15 to 15 |
| Include depth | 16 files on the active stack |
| Assembled view | 64 MiB of source text and 200,000 blocks, counting repeated instances |
| One decoded image | 16 million pixels |

**The view counts a source's text when the source is read, refused or not, and again at each later include of it.** An include that would pass a view limit is a problem at its clause, found before its blocks join the view.

A diagnostic names the source path, one-based line and Unicode-scalar column, plus the offending span. Internal spans use UTF-8 byte offsets, which the UI converts to its own selection units.

A source the reader refuses cannot be edited or saved, so a partly parsed model never overwrites the file; its diagnostics are offered instead. Calculation errors are valid cell results and do not prevent saving.

An edit that would write a formula over 4,096 bytes is refused; a table's new name counts too, as a reference writes it. A formula nested deeper than 64 levels calculates as `#SYNTAX!`. A table edit past a table's limits is refused, and a refused edit changes nothing.

**A step that would leave the source over 8 MiB or 100,000 blocks is undone and refused**, since the saved file would not open again. The editor keeps the count of the source's bytes. A step that changes only blocks adds the bytes of those blocks. A step that changes a table measures the whole source, since a table changes how other tables and charts are written.

### Keys from a document

**No key from a document reaches std's `Map`.** `Map` hashes with a fixed seed, so a document could hold many names that start at one slot. Each lookup would pass them all. `make test-conventions` refuses `Map` anywhere in `ksmd/`.

**`Keyed` in `ksmd/base/keyed.kspl`, an AVL tree that compares keys byte by byte, holds them instead.** A lookup passes at most about 1.44 log2(n) keys, whatever their hashes. It holds the table names `reader.read` checks for repeats, the sources in `Assembly`, and the files in `Fetched`. A clause's problem is found by a binary search of `Assembly.problems`, and an included source's values by index. A sorted list is not used: names in falling order would shift the whole list at each insertion.

### What a document costs

**`make measure-ksmd` times three documents and checks nothing; its figures hold only for the machine it runs on.** `ksmd/tests/measure.kspl` times the model outside the browser, and `ksmd/tests/browser/measure.mjs` the page in headless Chromium. The documents are a typical one of about 46 KB, and two of about 2.4 MB and 6.2 MB with a table of 9,999 rows.

What the figures show, as orders of magnitude:

* **In the typical document, an edit takes tens of milliseconds at most, and opening well under a second.**
* **Outside the browser, the model is fast at every size.** A typed character takes under a millisecond, and setting a cell and calculating every table tens of milliseconds.
* **A key press grows with the blocks on the page, not with the model.** Most of its time goes to the browser placing the selection and laying the page out, and to the page's own scans of every block.
* **The editor's 128 MiB holds the large document only in a page opened from a file.** Served, the page builds its view from a second copy of the source, and the memory runs out. Opened from a file, a second opening of it is refused.

These are known limits, not yet worked on:

* A key press in a document of tens of thousands of blocks takes over 100 ms.
* An edit in a table of 10,000 rows takes over a second, as the page shows every table again.
* So the served page does not reach the limits above: a document of 6.2 MB does not open, and one of 4.3 MB does.

## Acceptance examples and next work

The examples `overview.ksmd`, `notes.ksmd` and `literals.ksmd` cover the first contract. In the budget table, D1 is 30, D2 is 10 and D3 is 40. The include remains a clause when the parent is saved. A pipe in quoted table text remains one cell. The fenced clause in the literal example stays code.

`make test-ksmd-browser` drives the editing page through the browser's own input events, and checks the source each model transaction saves. It then serves the page with `kssrv --local` on a scratch workspace, and checks each file step against the bytes on disk.
