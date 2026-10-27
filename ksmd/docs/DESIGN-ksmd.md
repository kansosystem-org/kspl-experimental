# The first ksmd document and editor

This is the design for implementers and reviewers. **It is not an implemented file-format specification.** The examples under `ksmd/examples/` illustrate these decisions. The source-validation layer is implemented. So are the reader and writer for every structure below: blocks, inline markup and clauses ("What the first reader models" below). Includes and image paths resolve inside a workspace, and each source saves alone ("Includes and images" below). Table editing and calculation are implemented ("Tables and calculations" below). An editing page edits one source in a browser ("How the editor changes a document" below, and [`DESIGN-page.md`](DESIGN-page.md)). Served by the local server, the page opens and saves files and holds drafts ("The file lifecycle" below). A launcher opens a `.ksmd` file from the desktop on its workspace ("Opening a document from the desktop" below).

## The first usable document

A document contains prose, calculating tables, charts of them, images and includes, in reading order. The editor changes that structure directly. Source is read at open and written at save, not reparsed after each keystroke.

| Included | Excluded from the first release |
| :-- | :-- |
| Paragraphs, six heading levels, lists, links, emphasis and literal code | Raw HTML, executable code fences, embedded scripts |
| Rectangular tables with text, numbers and formulas | Merged cells, nested tables, blocks inside cells |
| Images in the document flow, with alternate text and an optional caption | Floating objects, absolute positioning, vector drawing tools |
| Browser printing with automatic page breaks | Editable page boundaries, page templates, exact cross-browser pagination |
| Includes opened separately for editing | Network includes, editing several sources in one transaction |

Static figures are images with captions. Images retain their aspect ratio and fit the content width. Column resizing affects appearance, never cell identities or values. There is no presentation mode.

## Source boundaries

Files use UTF-8. The first line is exactly `%ksmd 1`. An unsupported version is an error before the body is read. The canonical writer uses LF line endings and ends the file with one newline. The reader also accepts CRLF and an optional initial UTF-8 BOM. A carriage return without a following line feed is an error. Source views retain original bytes so diagnostics do not shift after CRLF or a BOM.

A file containing only the version marker represents an empty document. A blank line separates blocks. Within a prose paragraph, a source newline becomes one space. A backslash immediately before a newline means a hard line break. The writer puts a paragraph on one source line except for hard breaks.

A clause starts at column one with `:::` followed by its kind and attributes. A line containing only `:::` closes it. Clauses do not nest in version 1. The kinds are `table`, `include`, `image` and `chart`; an unknown kind is an error. Attributes are unique `name=value` pairs separated by spaces. Unknown attributes and duplicate attributes are errors.

Attribute strings use JSON string quoting and escapes. Numeric attributes use decimal numbers. There are no implicit attributes, positional arguments or alternate short forms. A style cannot change a block's kind.

A code fence starts with at least three backticks, optionally followed by a language label. Its closing line contains the same number of backticks and nothing else. Everything inside is literal, including clauses and the version marker. Choose a longer fence when the content contains a matching closing line. The writer chooses the shortest safe fence of at least three backticks.

## What the first reader models

**The reader models every structure of this design, and refuses a source it cannot read whole.** Saving a partial model would lose what it did not read. A refusal names the line and column. The three examples read, and their first save is the file itself.

**Inline markup is read into nodes, and the writer writes it back from them.** Text, inline code, a hard break, and the start and end of emphasis, strong emphasis and a link are each one node. Each node keeps its offset, so a diagnostic points at what was written.

These reading rules settle cases the notation above leaves open:

* A block starts at column one. An indented first line is refused, since two spaces mark a nested list item.
* A line of spaces and tabs only is blank, and separates blocks.
* Inside a paragraph, each line's leading and trailing spaces are dropped. Its newline becomes one space.
* A line inside a paragraph that starts a block (`#`, a fence, `:::`, `|`, a list marker) is refused. Put a blank line before it, or escape its first character.
* An odd run of backslashes at a line's end is a hard break. An even run is literal backslashes. A hard break at the end of a paragraph is refused.
* A heading's text is trimmed and must not be empty. Seven or more `#`, or `#` without a following space, is refused.
* A code fence's label holds only letters, digits and `_` `-` `+` `.`. A fence with no closing line is refused at its opening line.
* A list marker is `-`, or digits and `.`, followed by a space or the line's end. So `-5 degrees` and `1.5 metres` stay prose.
* A list runs to the next blank line, and each of its lines is an item. A line without a marker is refused, since an item takes one line.
* An item is nested at most one level deeper than the item before it. All items at one level of one list share one marker; a blank line starts a new list.
* An item with no text, or one that ends in a hard break, is refused.
* The writer numbers every ordered item `1.`. Inserting or moving an item then changes only its own lines, and the generated numbering stays correct.
* Every mark (emphasis, strong emphasis, inline code, a link) closes on the source line where it opens. The writer puts a paragraph on one line, so this limits only hand-written source.
* The writer leaves out what the format cannot hold at a line's edge. That is spaces and tabs at either end of a line, and hard breaks at a paragraph's end. An editor's model holds them while text is typed; the reader would drop or refuse them.
* A backslash escapes ASCII punctuation only. The writer escapes `\`, `*`, backticks, `[` and `]` in text, and a block marker that starts a paragraph's line. A needless escape is dropped at save.
* A run of `*` first closes open marks, innermost first, then opens marks that are not open. Marks must nest, and a run that can do neither is refused. A run never closes a mark and opens the same kind at once.
* Only a run of three with no mark open has two readings. Strong emphasis goes outside, unless the next run on the line can close only the other order. So `***a** b*` reads as emphasis around strong emphasis, and `***a***` as strong emphasis around emphasis.
* A code span ends at the next run of exactly as many backticks. One space at each end is dropped when both ends have one, so a span can start or end with a backtick. The writer chooses the shortest run that the code does not hold.
* A link's label is not empty and holds no link. Its destination follows at once in parentheses, without spaces or parentheses, and starts with `https:`, `http:`, `mailto:` or `#`.
* A clause's kind follows `:::` at once. Its attributes may come in any order, separated by one or more spaces. The writer writes them in a fixed order with one space: `name`, `widths`, `formats`; `path`; `src`, `alt`, `caption`.
* A clause closes at a line that is exactly `:::`. A table row outside a table clause is refused.
* Any clause may take `invisible="printing"`, written last. Its block shows while editing and is left out of print and PDF ("Print and PDF" in [`DESIGN-page.md`](DESIGN-page.md)). It has one value, so a misspelt one is refused, not ignored.
* `name`, `path` and `src` must not be empty. `alt` may be empty, for an image that only decorates. An empty `caption` is refused: leave the attribute out.
* A table may have a header and no data rows, so an editor can create an empty one. Every header cell is quoted text.
* A cell's spaces are trimmed. The writer puts one space on each side of a value, and writes an empty cell as `| |`.
* A number has JSON's shape: no `+`, no leading zero, and a finite value. It is kept as written, so `2.50` stays `2.50`.
* A formula is kept as written after `=`, up to 4,096 bytes. What it means is checked when tables calculate, not when the source is read.
* Quoted text is decoded by JSON's rules. The writer escapes only what JSON requires, and leaves non-ASCII text as it is.
* Paths are kept as written. Whether a file exists, and whether a path stays inside the workspace, is checked when files are resolved.

## Prose notation

| Structure | Source form | Limits |
| :-- | :-- | :-- |
| Heading | One to six `#` characters, then a space and inline text | One source line |
| Unordered list | `- ` before each item | One source line per item; two spaces per nested level |
| Ordered list | `1. ` before each item | Numbering is generated; two spaces per nested level |
| Checklist item | `- [ ] ` before an open item, `- [x] ` before a ticked one | A bulleted item; it can stand among other bulleted items |
| Quote | `> ` before each line | One paragraph; its lines join as a paragraph's do |
| Divider | A line `---` | Nothing else on the line |
| Emphasis | `*text*` | No newline inside a mark |
| Strong emphasis | `**text**` | No newline inside a mark |
| Link | `[label](destination)` | No nested links; spaces and parentheses in destinations are percent-encoded |
| Coloured text | `[text]{color="#c00000"}` | A link takes a colour after its destination: `[label](destination){color=...}` |
| Aligned paragraph or heading | A line `{align="center"}` straight before it | `left`, `center` or `right` |
| Inline code | A matching run of backticks around literal text | Use a longer run for embedded backticks; no newline |
| Paragraph | Other text | Inline content and explicit hard breaks |

Emphasis and strong emphasis may nest, with properly paired delimiters. Links may contain emphasis and inline code. Unclosed reserved delimiters are errors, not silently discarded formatting.

A backslash escapes the following ASCII punctuation outside code. Escape a block marker to start a literal paragraph: `\#`, `\-`, `1\.`, `\>`, `\---` or `\:::`. For an ordered-list marker, escape its period (`1\.`); a backslash before a digit is invalid. The writer emits only escapes needed to avoid syntax or represent a literal backslash.

Visual typing inserts literal text. Typing `#`, `*` or `:::` does not automatically change structure. Formatting commands change the model, and the writer adds the required source delimiters and escapes. Pasted plain text stays text. A rich-text paste is accepted only through a conversion that retains supported content; unsupported content must be reported before insertion.

### Checklists, quotes and dividers

**A checklist item is a bulleted item with a tick box**, as GitHub, Notion and Obsidian write it: `- [ ] Buy pens`, and `- [x] Call Sam` once ticked. A to-do list then keeps what is done in sight.

* **Only a bulleted item takes a box.** A numbered to-do list is rare, and two forms for one need would make the file harder to read.
* **The `x` is lowercase**, so one tick has one spelling. Text in brackets that is not a box is escaped: `- \[ \] x`.
* **On the page, a press on the box ticks it, and another press takes the tick away**, as one step of undo each. A ticked item's text is greyed. Enter after a ticked item starts an open one.

**A quote is a paragraph whose every line starts with `> `**, as mail and Markdown write it. Meeting notes and quoted mail are then set apart from the writer's own words. A quote holds one paragraph; two quotes stand apart with a blank line between them, so no quote nests in another.

**A divider is a line `---`**, and separates two parts of a document. It holds nothing, so the page shows it as a line with a Remove button, as an image has. Insert, Divider adds one at the caret.

### Looks: colours, font size and alignment

**A look is direct formatting written in braces after what it formats**, as Excel's cell formatting is held beside the value. A change of look then changes one line of the file. A table cell takes every part. Text in brackets takes a colour alone, and a paragraph or a heading alignment alone.

| Part | Written | Meaning |
| :-- | :-- | :-- |
| `color` | `"#c00000"` | The text's colour: `#` and six hex digits |
| `fill` | `"#fff2cc"` | The background's colour |
| `size` | `14`, `10.5` | The font size in points, from 6 to 72, whole or ending in `.5`. The page offers 9, 10, 11, 12, 14, 18 and 24, the sizes people choose |
| `align` | `"left"`, `"center"`, `"right"` | A cell's or a paragraph's alignment |

* **Values are written as attributes are**: strings in JSON quotes, numbers bare. One form for each value keeps the canonical file unique.
* **The writer writes the parts in that fixed order**, and colours in lower case. A look with no part is refused, so `{}` never stands in a file.
* **A table cell writes its look after its value**: `| 120 {color="#c00000"} |`. An empty cell can carry a look alone: `| {fill="#fff2cc"} |`. A `{` inside quoted text is text.
* **Text takes a colour, and nothing else, in brackets: `[text]{color="#c00000"}`.** A word in red marks a warning or a change, as people mark it in Word. A fill and a size on text are left out: they make a page uneven, and a cell carries them where a value needs them.
* **A `{` right after brackets is escaped**, since it would read as their colour.
* **A paragraph's or a heading's alignment stands on a line of braces right before it.** At the end of the text, an ordinary `{` in prose could not be told apart. That line holds only `align`.
* **A `{` at the start of a paragraph's line is escaped**, since it would read as an alignment. Anywhere else it is text.
* **A cell's new value keeps its look**, as a spreadsheet's cell keeps its format. A look is undone and redone as any edit is.

### Notes

**A cell, a paragraph or a heading can hold a note: a remark for the people who read the file.** Excel's notes and Word's comments serve the same need. The note stands last in the braces:

```text
| 120 {fill="#fff2cc" note="Check with Sam"} |

{note="Is this the final title?"}
# Plan
```

* **A note is 1 to 1,000 bytes of text**, a JSON string as any attribute is. A line break may stand in it, written `\n`.
* **Resolving a note takes it away.** Word keeps a resolved comment hidden in the file. Here the file holds what is still open, so the next reader is not handed remarks that no longer apply. Undo brings a resolved note back.
* **No threads, replies or names.** These serve several people working on one file at once, which ksmd leaves out ("What the file lifecycle leaves out" below).
* **A note stays with its cell or paragraph.** A new value, a new column name, a sort and a moved row keep it. A paragraph split in two keeps it on the part that holds the text before the split.

## Tables and calculations

A table clause requires `name="budget"`. A name is 1 to 255 bytes of any text but line breaks and other control characters, such as `Q1 sales`. Names are unique within one source file. A table has a header row followed by data rows. The header contains quoted strings and is not part of the cell address space.

Every row starts and ends with `|`. Separators outside quoted strings split cells. Every row has the same positive number of cells. There is no Markdown alignment or separator row.

| Cell source | Meaning |
| :-- | :-- |
| Nothing between separators | Empty cell |
| `"Pens"`, `"0012"`, `"a\nb"` | Text; JSON escapes permit a multiline text value |
| `12`, `-3.5`, `1e3` | Finite decimal number, evaluated as F64 |
| `2026-10-23` | A date: a day of the years 1 to 9999, written as ISO 8601 writes it |
| `=B1*C1`, `=sum(D1:D2)` | Formula source, not its cached result |

Text cells need quotes, so numeric-looking identifiers and a leading `=` are unambiguous. A pipe inside a quoted string is text. A physical source row stays on one line. Multiline text is allowed through `\n`; multiline cell blocks are excluded.

Addresses start at `A1`, the first data cell. `$A$1`, `$A1` and `A$1` express fixed axes when copying formulas. Within one source, `budget.D1` names a cell in another table. Cross-file formulas are excluded initially, including references into an include.

A formula holds numbers, text in quotes, `true` and `false`, cell references, rectangular ranges, parentheses, unary minus, `+`, `-`, `*`, `/`, the comparisons `=`, `<>`, `<`, `<=`, `>`, `>=`, the words `and`, `or` and `not`, and the functions `sum`, `min`, `max`, `count`, `average`, `if`, `round`, `sum_if`, `count_if`, `average_if`, `lookup`, `today`, `date`, `year`, `month` and `day`. Function names are lowercase. Multiplication and division bind before addition and subtraction, and both before a comparison. `not` binds before `and`, and `and` before `or`. Other arithmetic groups left to right. A range stands only as a function's argument, or in the condition of `sum_if`, `count_if` and `average_if`. There are no user functions.

An empty cell becomes zero in scalar arithmetic. Numeric aggregates ignore empty and text cells; `count` counts numbers. An empty numeric set gives zero for `sum` and `count`, and an error for `min`, `max` and `average`. Scalar arithmetic on text is a type error. Division by zero, non-finite results, invalid references and cycles have distinct displayed errors. Errors in referenced cells propagate. Dates have their own rules ("Dates" below).

### How a formula is written

* A number has a cell number's shape without its sign: `2.5`, `1e3`, `0.5`. A sign is unary minus.
* A cell is capital column letters, then a row number from 1 without a leading zero: `D1`, `AA12`. A `$` before either part fixes that part for copying.
* `budget.D1` names a cell of another table in the same source. No space stands around the `.`.
* A name that is not plain, a lowercase letter followed by lowercase letters, digits and `_`, stands in JSON quotes: `"Q1 sales".D1`. The quotes are the ones the `name` attribute uses, so one quoting rule serves the whole file. A table row already skips text in quotes, so a `|` inside a name cannot split the row.
* A range is two cells joined by `:` without spaces: `D1:D3`. A table's name stands once, before the range: `budget.D1:D3`.
* A range is the rectangle between its corners, which can come in either order. The writer saves the upper left corner first.
* `#REF!` stands where a reference lost its row or column. The reader and writer keep it, and it calculates as `#REF!`.
* **Text stands in JSON quotes, with JSON's escapes:** `"Pens"`, `"say \"hi\""`. A `|` inside the quotes stays in the cell, as in a text cell.
* **Quotes followed at once by `.` and a cell name a table; any other quotes hold text.** So `"Q1 sales".D1` is a cell, and `"Q1 sales"` alone is text. Text has no use before `.`, so the reader never has to guess.
* **`and`, `or`, `not`, `true` and `false` are words.** A `|` splits a table row unless it stands in quotes, so the symbols `||` and `|` cannot serve. Words also read as the sentence a person would say.
* **A comparison takes one step: `1 < A1 < 9` does not read.** Written so, it would compare `true` with 9. Write `1 < A1 and A1 < 9`.
* Spaces and tabs can stand between tokens. A function takes one or more arguments, separated by `,`.
* A formula nests at most 64 levels. The formula itself is one level, and each bracket, function, unary minus and `not` adds one.

### Values and errors

A cell's value is empty, a number, text, `true` or `false`, or an error. A formula's value is a number, text, `true` or `false`, or an error. A formula that gives an empty cell's value, such as `=A1`, shows 0, since an empty cell is 0 in arithmetic.

**Decided: a formula's value is no longer only a number or an error.** A choice such as `if(E1 < today(), "late", "")` gives text, and a comparison gives `true` or `false`. So `=A1` with text in A1 now gives that text, where it gave `#VALUE!` before.

* **Kinds are never converted into each other.** Text and `true` or `false` in arithmetic are `#VALUE!`, even text that looks like a number. Quotes already mark a cell as text, so converting it would only undo a choice the writer made. A `true` counted as 1 would give a total that looks right and is not.
* **`and`, `or` and `not` take only `true` and `false`.** A number or text there is `#VALUE!`; an empty cell is `false`.
* **Two values of different kinds are unequal.** `=` gives `false` and `<>` gives `true`. `<`, `<=`, `>` and `>=` between them are `#VALUE!`: an order between a number and text would hide a mistake.
* **An empty cell takes the kind of the other side: 0, empty text or `false`.** So `A1 = ""` and `A1 = 0` both hold for an empty A1, as an empty cell is 0 in arithmetic.
* **Text compares without regard to case,** in the order the sort uses: letters A to Z, then other bytes by their value. So `"pens" = "Pens"` is `true`, as the sort and the filter treat them alike.
* **`false` comes before `true`** when they are ordered, as they sort.
* **`and` calculates its right side only when its left side is `true`, and `or` only when its left side is `false`.** So `B1 <> 0 and A1 / B1 > 2` is `false`, not `#DIV/0!`, when B1 is 0. An error or a wrong kind on the left decides too.
* **`if(condition, then, else)` calculates only the branch it takes.** So `if(C1 = 0, 0, B1 / C1)` is 0, not `#DIV/0!`, when C1 is 0. An error in the condition is the result, and neither branch is calculated.
* **`if` takes all three arguments.** A missing `else` would need a value of its own, and `false` in a column of numbers reads as a mistake. Two arguments are `#SYNTAX!`.
* **The branch not taken must still read.** `if(true, 1, 2 +)` is `#SYNTAX!`, as is an unknown function there: a slip shows at once, not on the day the condition changes.
* **`round(x, places)` changes the value, where a number format changes only what shows.** So a total of rounded prices matches the prices shown.
* **`round` rounds the shortest decimal digits of the number, half away from zero, as a number format does.** So `round(2.675, 2)` is 2.68, the digits a person reads, rounded as they round them. The result is the F64 nearest to those digits.
* **`places` is a whole number from -15 to 15; anything else is `#NUM!`.** A negative `places` rounds to tens, hundreds and on: `round(1250, -2)` is 1300. An F64 holds at most 17 significant digits, so a carry cannot overflow.
* **A reference alone as a function argument is a set of cells.** The function leaves out the set's empty cells, text, and `true` and `false`. Any other argument calculates as arithmetic, so `sum(A1+0)` with text in A1 is `#VALUE!`.
* **`min`, `max` and `average` of no numbers are `#EMPTY!`, not 0.** A zero would hide that a column holds no data yet.
* **An error in a referenced cell carries into every formula that uses it, `count` included.** A count beside a broken cell would otherwise look right.
* **Of two errors, the left one in the formula comes first.** In a range, the first in reading order comes first: row by row, each from the left.
* **A formula that does not read is `#SYNTAX!`, whatever its parts calculate to.** Its source is kept, so a slip can be fixed later.

Each error has its own mark, since each is fixed differently. A cycle shown as 0 would read as a value, and one shown as `#REF!` would send the reader to look for a removed row.

| Mark | The cause |
| :-- | :-- |
| `#VALUE!` | A value of the wrong kind: text or `true` and `false` in arithmetic, a number or text as a condition, or two kinds ordered |
| `#DIV/0!` | A division by zero |
| `#NUM!` | A number or a result too large for an F64, or `round`'s places not a whole number from -15 to 15 |
| `#REF!` | A reference to no cell: `#REF!`, a cell outside its table, or a table name this source does not hold |
| `#CYCLE!` | The cell depends on itself, directly or through other cells |
| `#EMPTY!` | `min`, `max`, `average` or `average_if` of no numbers |
| `#SHAPE!` | A range in the condition of `sum_if`, `count_if` or `average_if` that is not one column as tall as the values, or a condition with no range |
| `#SYNTAX!` | The formula does not read: an unknown function, a range outside a function or a condition, a missing bracket or operand, or more than 64 levels |

**Decided: `#SHAPE!` is a new mark.** A condition's ranges that do not match the values are fixed by changing a range, which no other mark asks for.

### Totals by a condition

`sum_if(values, condition)` adds the numbers in `values` on the rows where the condition holds. `count_if` counts those numbers. `average_if` gives their average, or `#EMPTY!` when there are none, as `average` does.

```text
=sum_if(D1:D9, B1:B9 = "Pens")
=count_if(A1:A9, C1:C9 > 5 and B1:B9 <> "Done")
=average_if(D1:D9, B1:B9 = "Pens" or B1:B9 = "Ink")
```

* **The condition is an ordinary expression, not text read again later.** A range in it is read as its cell on each row in turn. A comparison with a cell is then written as anywhere else: `B1:B9 = E1`.
* **`and`, `or` and `not` join conditions,** so one function serves one condition or many. A second set of functions for several conditions would give two ways to write one thing.
* **The values come first in all three.** One order cannot be swapped by mistake.
* **`values` is a cell or a range, and can be several columns wide.** Each row adds its cells from the left. Its empty cells, text, and `true` and `false` are left out, as in `sum`.
* **Every range in the condition is one column wide and as tall as `values`.** Its rows pair with the rows of `values` in order. Any other range gives `#SHAPE!`: a range quietly cut or stretched would add the wrong rows.
* **A condition holds at least one range, or the result is `#SHAPE!`.** Without one, the condition is the same on every row and takes all rows or none. That is nearly always a range written as a cell.
* **A cell alone in the condition is the same on every row.** `B1:B9 = E1` compares each row with E1.
* **Inside the condition, a range alone as a function's argument is still a set of cells.** `D1:D9 > average(D1:D9)` compares each row with the average of them all.
* **The condition takes only `true` and `false`; an empty result is `false`.** A number or text there is `#VALUE!`.
* **The values on a row are read only where the condition holds,** as `if` reads only the branch it takes. An error on a row left out does not show. A total row inside its own range is no cycle when the condition leaves its row out.
* **Errors carry row by row from the top:** first the condition's, then the values' on that row from the left. An error in a value on a row that holds carries, `count_if` included.

### Finding a value by its key

**`lookup(key, keys, values, otherwise)` gives the value beside the first key that equals `key`**, as Excel's XLOOKUP does with an exact match. `=lookup(A1, prices.A1:A50, prices.B1:B50, 0)` finds a price by its code.

* **`keys` and `values` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A match is exact.** Text equals text without regard to case, as the sort and the filter compare it. A number equals the same number. No nearest match is guessed, which is the complaint VLOOKUP's default draws.
* **`otherwise` is required, and calculated only where no key matches**, as `if` calculates only its branch. A missing key then shows what the writer chose, never an error nobody planned for.
* **An error in `key` is the result.** A key cell holding an error is passed over, except `#CYCLE!` before the match.
* **A key on a cycle makes the lookup `#CYCLE!`.** Passed over, it would hide the cycle, and which cell showed it would depend on which calculated first.

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

* **Each entry names its kind and its decimal places, from 0 to 9.** No part is left to a default, so one format has one spelling. A short word replaces a code of `#`, `0` and `;` that a person has to decode.
* **A column's format is the default, and new rows follow it.** A column mostly holds one kind of value, so a new row shows like the rows above it. The source then holds one entry per column, not one per cell of 10,000 rows.
* **A cell can take a format of its own, written in its braces: `| 0.125 {format="percent:1"} |`.** A total row, a rate among amounts, or a table set out as labels and values needs one format per cell, as Excel gives. The cell's own format stands over its column's. `general` shows the cell as calculated, whatever its column's format; a column has no such entry, since its empty entry says the same.
* **A format chosen on cells is theirs; chosen on whole columns, by their letters, it is the columns'.** A column's format then takes its cells' own formats away, so the whole column shows it, as in Excel. Clear format takes a cell's own format away.
* **A column without a format has an empty entry.** `formats` stands only while some column has a format; the reader refuses one whose entries are all empty. A wrong entry is refused at its own column on the line.
* **Every kind but `number` puts a `,` between each three digits.** `percent` shows the number times 100: the decimal point moves two places, so 0.07 shows as exactly `7%`.
* **The decimal point is always `.` and the separator `,`, the characters the source and a paste already use.** So every reader sees the same text in the same file. A setting per document or per machine would show one file in two ways.
* **A currency is the three capital letters of ISO 4217.** USD, EUR, JPY, GBP, CNY, KRW, INR, CAD and AUD show their English symbols. `CA$` and `CN¥` keep two currencies that share a symbol apart. Any other code shows itself and a no-break space, as `CHF 12.00`.
* **A minus sign stands first, before a symbol.** A number that rounds to zero shows no minus: `-0.00` would read as a value below zero.
* **Rounding acts on the shortest decimal digits of the number, and a half goes away from zero.** So 2.675 shows as `2.68`, the digits a person reads rounded as they would round them. The binary value of 2.675 is a little less, and rounding that would show `2.67`. A half rounds up because only the shown text is rounded: a sum still adds the stored numbers. A formula's `round` follows the same rule, in the same code.
* **Text, empty cells and errors in a formatted column show as they are.** A formula's number shows in the column's format. The header's names never change.
* **A typed `$12` or `12%` stays text,** as any other typed text does ("How the editor changes a document" below). The format gives the symbol; the cell holds the number.
* **An open cell edits the number it holds, not the shown text.** A format hides digits, so the cell's editor shows them all.
* **`date:yyyy/mm/dd` shows the column's dates as `2026/10/23`; its numbers show as calculated.** It names the pattern it shows, so a reader of the source knows the form. A date shows as `2026-10-23` with no entry, so that form has no entry of its own. Its places cannot change.
* **A new column has no format, and a moved or removed column takes its format with it.** A new column's values are not known yet, so no format is guessed for them.

`ksmd/model/format.kspl` reads, writes and shows a format. `edit.set_format` sets or clears the format of a run of columns, and `edit.step_places` shows one more or one fewer place. Each is one step of undo.

### Choices

**A column can take only the values on its list of choices**, as Excel's Data Validation list does. A tracker's Status column then holds "Done", never "done" or "Dnoe", so the filter and `count_if` see one value. The table's `choices` attribute holds one entry per column, as `formats` does; inside an entry, `|` separates the choices:

```text
:::table name="tasks" choices=",Open|In progress|Done"
```

* **A typed value equals a choice without regard to case, and the cell holds the choice as the list spells it.** Any other value is refused, and an empty cell is allowed. A paste, a fill and a copy are refused the same way.
* **A choice is 1 to 100 bytes of text, with no `,`, `|`, `"` or `\`, and no space at either end.** A column holds at most 50, and no two equal without regard to case.
* **A list belongs to a column**, as a format does: it moves with its column, and a new column has none. `choices` stands only while some column has one.
* **A list only ever narrows what is typed next.** A cell that already holds another value keeps it, and the page marks it, so setting a list never changes a value.
* **Only a list.** Excel's validation also takes number ranges, dates and formulas, which draw few users and many questions. A list taken from another table, which Excel also offers, is left for later.

`ksmd/model/choice.kspl` reads, writes and checks an entry. `edit.set_choices` sets a column's list as one step of undo, and `edit.set_cell` keeps to it.

### Colouring cells by their value

**A column can take one colour rule: its cells that meet it take the rule's colours**, as Excel's conditional formatting does in its simplest form. Overdue counts or negative sums then stand out, and the colour follows the value when it is calculated again. The table's `rules` attribute holds one entry per column, empty for none:

```text
:::table name="budget" rules=",,<0;color:#9c0006 fill:#ffc7ce"
```

* **An entry is a condition, `;`, then the colours.** `<5` is below 5, `>5` above 5, `=5` or `=Done` equal to it, and `empty` an empty cell. `color:` is the text's colour and `fill:` the background's, one or both.
* **The rule reads each cell's calculated value**, so a formula's result is coloured too. Text compares without regard to case, as the filter compares it.
* **The rule's colours stand over the cell's own look** while the rule holds, as in Excel. The cell's look stays in the file.
* **One rule per column, and only these conditions.** Excel's many rules per range, their order and "stop if true", and rules that multiply when cells are copied draw the most complaints. Colour scales, data bars, icon sets and formula conditions draw few users.
* **A rule belongs to a column**, as a format does, and moves with it.

`ksmd/model/rule.kspl` reads and writes an entry, and `edit.set_rule` sets a column's rule as one step of undo.

### Groups of rows

**Data rows can be grouped, and a group's rows hide and show together, as Excel's outline does.** The table's `groups` attribute saves each group, and whether it is hidden:

```text
:::table name="budget" groups="rows 2-4, rows 6-9 closed, rows 7"
```

* **An entry names data rows as a formula numbers them, from 1.** `rows 2-4` is rows 2 to 4, and `rows 7` one row. ` closed` marks a group whose rows are hidden.
* **The entries stand from the top, an outer group before the groups it holds,** separated by `, `. One list of groups has one spelling.
* **A group holds another group whole, or shares no row with it.** Groups nest at most 8 deep, Excel's limit. Two groups never hold the same rows.
* **Two groups side by side stay two groups.** Excel keeps a level per row, so two groups that touch become one, and people put an empty row between them. A group here keeps its own first and last row.
* **A group belongs to the table's layout, as a width does, so it names rows by place.** A sort or a moved row leaves the groups where they stand. A row inserted inside a group joins it. A removed row leaves it, and a group whose rows are all removed goes.
* **Hidden rows still count.** A formula reads every row, as with a filter.
* **Whether a group is hidden is saved in the file, unlike a filter.** A filter answers one question for the moment. Hiding detail is the shape the writer gives the table, and the next reader sees it so.

`ksmd/model/group.kspl` reads, writes and checks the groups and follows a row edit. `edit.group_rows`, `edit.ungroup_rows` and `edit.show_group` act on them, each as one step of undo. Ungrouping takes away the smallest group that holds the chosen rows.

### How references follow edits

Each row and column of a table holds an identity that the source does not show. A reference holds the identities of its cells, and the writer writes the coordinates they have now. The model is the only authority: calculated values are never stored in it. `ksmd/edit/edit.kspl` holds the operations an editor calls: insert, remove and move a row or a column, sort the rows, set a cell and copy a cell.

* **Insertion and movement keep every reference on its cells.** A range spans its two corners, so a row inserted between them joins it. A row inserted after the last corner stays outside; to grow a range at its end, insert inside it.
* **A range's corner follows its row or column.** When a corner's row moves, the range spans the corners' new places.
* **A sort moves each row with its identity.** A formula keeps naming the cells it named before, and its written references change to their rows' new places. A formula that names its own row, such as `=B1*C1` in row 1, still names its own row after the sort.
* **Removal turns a reference to the removed line into `#REF!`.** A range's corner on that line moves one line toward the other corner. A range with no line left becomes `#REF!`.
* **`$` acts only on copying.** A copy shifts each part without `$` by the distance copied, and a part with `$` keeps its row or column. A shift outside the table gives `#REF!`.
* **A reference without a table's name names a cell of the table that holds the formula.** So a copy into another table names a cell there.
* **A reference that names no cell stays as written,** such as `Z9` in a four-column table. It attaches once that cell exists: after an insertion, and when the source is read again.
* **A reference straight after a number, as in `1A1`, never attaches.** That formula does not read. Attached, a moved column could join the two into one number (`1E1`).
* **An edit that would write a formula longer than 4,096 bytes is refused, and changes nothing.** The reader refuses such a formula, so the saved source could not be opened again.
* **A value that would not read back is refused.** A number keeps the shape the reader takes. A formula must read back as itself, alone in its cell.
* **The reader's own rule for a cell decides whether a formula reads back** (`reads_as_formula` in `ksmd/syntax/clause.kspl`). So a formula stays on one line, with each `|` and `{` inside quotes. A `{` outside quotes would start the cell's look.

### How tables calculate

Calculation (`ksmd/calc/calc.kspl`) reads the model and one input: the date the document was opened. It opens no file, and its results stand apart from the document. It calculates every table of a source together, so a reference into another table and a cycle through two tables are both seen.

* **A cell calculates when a formula first needs it.** So a formula can name a later row, and the order of rows does not matter.
* **A cell reached again while it calculates is a cycle.** Every cell on the cycle shows `#CYCLE!`, and the error carries into the cells that use them.
* **Only what is calculated is followed.** A cell named in a branch `if` does not take, or on the side `and` or `or` skips, is not reached. So `=if(A1 > 0, B1, 0)` in B1 is a cycle while A1 is above 0, and 0 otherwise.
* **A chain deeper than 256 steps is set aside, and its deepest cell calculates first.** A step is a cell or a level of a formula. So a running total down 10,000 rows calculates without exhausting the stack.
* **After an edit, the whole source calculates again.** The table limits bound that cost; a partial recalculation waits for a measured need.
* **A condition of `sum_if`, `count_if` or `average_if` calculates once for each row of its values.** So one such formula over 10,000 rows calculates its condition 10,000 times.

### Dates

**A date is a value of its own: a day, written `2026-10-23` and shown so.** A cell holding a bare `2026-10-23` is a date, and a typed one becomes one. A typed `2026/10/23` or `2026/1/5` becomes one too, kept as `2026-10-23`. A quoted `"2026-10-23"` stays text, so a file written before dates were values reads as it did.

* **A date plus or minus a whole number of days is a date, and a date minus a date is the days between them**: `=A1+7`, `=B1-A1`. Any other arithmetic on a date is `#VALUE!`, and a day outside the years 1 to 9999 is `#NUM!`.
* **Dates compare with dates.** A date and text are unequal, and ordering them is `#VALUE!`, as for any two kinds.
* **`date(year, month, day)` makes a date**, and a day that does not exist, such as `date(2026, 2, 29)`, is `#NUM!`. `year`, `month` and `day` give a date's parts as numbers.
* **`min` and `max` of dates give the earliest and the latest, and `count` counts them.** A date has no sum, so `sum` and `average` over one are `#VALUE!`, as is `min` over dates and numbers together.
* **A date sorts after the numbers and before text, earliest first.** The fill handle goes on by a day, or by the step between two dates.
* **The file keeps a date in one form, ISO 8601's.** It reads the same in every country, and sorts in day order even as text.
* **A column can show its dates with `/`, as Japan, China and Korea write them** (`date:yyyy/mm/dd` under "Number formats" below). Typing `/` is what a person there does, and Excel there reads it as a date. A typed `/` date that stayed text sorted among the text, after every real date. So the page takes the form people type, and the file keeps the one form.
* **A date is a count of days, not a number.** Excel keeps a date as a serial number, so a date in a sum adds silently, and a number shown as a date misleads. Here the kinds stay apart, and a mistake shows as `#VALUE!`.

### Today's date

**Decided: calculation takes the date the page opened the document as an input, and reads no other outside state.** `today()` gives that date, the date Ctrl+; types.

* **The date stays the same while the document is open,** after any edit. It moves the next day, at the next opening. A value that changed between two edits would surprise the person who made neither change.
* **Calculation reads no clock.** The page reads the date when it opens a document and hands it in, as `calculate(doc, today)`. So the same document and date always give the same values, and a test passes a fixed date.
* **An included document calculates with the date of the document that includes it.** One view shows one date.
* **`today()` is a date**, so `E1 < today()` finds a date that has passed, and `today() - E1` the days since it.
* **Ctrl+; and `today()` differ on purpose.** Ctrl+; types a fixed date into a cell, and `today()` is the date of each opening.

### What formulas leave for later

These were weighed and left out, so one way to write each thing stays:

* `ifs(c1, v1, c2, v2, …, otherwise)`, for a chain of choices. A nested `if` writes the same now.
* `let(name, value, expression)`, for long formulas. It needs names inside a formula, which ksmd does not have.
* Methods after a dot, as `B1.round(2)`. They would be a second way to write `round(B1, 2)`, and `.` already joins a table's name to a cell.
* A condition written as text, as `">5"`, and a second set of functions for several conditions. `sum_if` takes an expression and joins conditions with `and` and `or`.
* A `today()` that moves while the document is open, and a time of day as a value.

### Charts

**A chart draws a table's columns as bars or as lines**, and draws them again after every edit. The `:::chart` clause names the table, the column whose values label each bar or point, and the columns drawn:

```text
:::chart table="budget" kind="bar" labels="month" values="rent,food" title="Spending by month"
:::
```

* **`table`, `kind`, `labels` and `values` are required, and `title` is not.** `kind` is `bar` or `line`; `values` names 1 to 8 columns, separated by `,`.
* **Only bars and lines.** They are the charts people make most. A pie shows the same as a bar and is harder to read. Scatter, area and stacked charts draw few users.
* **A chart holds its table and columns by identity, as a formula's references do.** A renamed or a moved column stays in the chart, and the writer writes the names they have now.
* **A name that names nothing is kept as written, and the chart says what is missing**, as a formula's `#REF!` does. Nothing is lost when a column is removed and put back.
* **A column that a chart shows keeps a name that finds it again.** The reader takes the first column of a name, and splits `values` at each `,`. So an edit is refused where a shown column's name would be empty or would match a column before it. A drawn column's name also holds no `,`.
* **A cell that holds no number leaves a gap**, and the axis starts at zero, so a bar's height is its value.
* **A chart draws the table's calculated values and holds none.** The file keeps only the clause, so the table stays the one place its numbers live.
* **The page draws a chart as SVG**, with colours that people with the common kinds of colour blindness tell apart.

`ksmd/syntax/chart.kspl` reads the clause's names, finds the table and columns for them, and writes them back. `ksmd/edit/editor_charts.kspl` makes a chart of a table and gives a chart new settings. A changed chart is a new entry, and its block points at it, so undo swaps the block back.

## Includes and images

An include clause has only `path="notes.ksmd"` and an empty body. An image clause requires `src` and `alt`, and permits `caption`. All three are quoted strings; its body is empty. Version 1 accepts local PNG and JPEG assets. SVG, remote images, executable formats and data URLs are excluded.

Links may use `https`, `http`, `mailto`, or a document fragment. Other schemes are refused. Rendering never follows a link, and opening one is an explicit user action. In the page, Ctrl+click opens a link in a new tab, and in Read-only a plain click does too. The page's own tab never leaves the document.

### The workspace and its paths

**A document opens inside a workspace: a folder the user opens explicitly.** Every source and image the document reaches stays inside that folder. `Workspace` in `ksmd/files/workspace.kspl` holds it. The root itself may be a link.

**A path is read from the folder of the source that holds it**, for includes and images alike. An image in an included file keeps its own file's folder. A file then keeps its meaning when its folder moves with the files it names. A rule that reads paths from the top document or the working folder breaks once a file moves into a subfolder.

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

**A path stays inside the root by refusal, not by comparison.** It is refused if any folder or file along it is a link, even a link that stays inside. `Workspace.resolve` decides this with `fs.stays_under`, std's one check for it. Resolving links and comparing the result gives different answers on Windows ([std's reasons](../../std/docs/DESIGN-system.md#a-path-stays-under-the-root-by-refusal-not-comparison)). A refused path opens nothing, so it never opens another file than the one written.

**Nothing is created for a missing file.** An include or an image whose file is absent is a problem at its clause.

### The assembled view

**Each source is read once into its own model, and the view refers to its blocks.** `assemble` in `ksmd/files/assemble.kspl` builds it. Each `Entry` names the instance and the block it shows. So the view can name, for every block, the file it came from and its offset there. An include clause stays in its parent's model, and the included blocks follow its entry.

**Each include of a file makes an instance of its own.** A file included twice is read once and shown twice, so repetition is not a cycle. A cycle is a source already on the current include stack: a file that includes itself, or that includes a file leading back to it.

**Only the opened document's own failure stops it opening.** An include or an image that fails is a `Problem` at its clause, and the rest of the view opens. The clause stays in the model, so a save keeps it. A problem holds its diagnostic and the include chain: each include clause that leads to it, innermost first.

| What fails | Where its diagnostic points |
| :-- | :-- |
| A refused path, a missing or unreadable file, a cycle, the depth limit or a view limit | The include or image clause |
| A source the reader refuses | Its own line and column; the clause that includes it leads the chain |

**Two sources are the same file when their paths from the root are equal.** On a file system that ignores case, `Notes.ksmd` and `notes.ksmd` are then two sources. A cycle spelt in two cases ends at the depth limit, not at the cycle check.

**An image's path is resolved and checked when the view is built**: a regular file must stand there. Its format and pixels are checked when the editor reads it for display.

### Who writes a file

**Viewing never writes a file.** The view holds references to blocks, not text, so it has nothing to save.

**A save writes one source.** `Workspace.save` writes a document's canonical text through `fs.replace_file`. A crash then leaves the old text or the new, never a part. The page saves through the local server, which replaces the file the same way. A parent's model holds its include clause, not the included blocks, so its save cannot flatten them.

**To change included text, the editor opens the included source.** `load` in `ksmd/files/files.kspl` reads it alone. Its save leaves the parent's bytes unchanged, and the next view shows the change. Undo belongs to the source being edited. Several sources are never saved in one transaction.

### Table names across includes

**A table name belongs to its source file.** Two files can each hold a table named `budget`, and a repeated include shows one declaration again. A formula names only the tables of its own source; a reference into an include or into a parent is excluded. So a repeated table shows the same values in each instance.

## Model and editor architecture

**The code's folders are layers, each knowing only those below it**: `base`, `model`, `calc`, `syntax`, then `files` and `edit` side by side, then the page. "Folder map" in [`ksmd/README.md`](../README.md) lists them.

* **The model and the calculation know no syntax.** So a value can be tested without reading a source, and the reader and writer can change without touching a formula's arithmetic.
* **The editor never reads a file.** It changes one source in memory, so the page can hand it files fetched from the server, and a test can hand it text.
* **An upward import is refused by `make test-conventions`.** The compiler sees only a cycle, and an upward import that closes none would build unnoticed.

Use an ordered block tree. Its node kinds are paragraph, heading, list, code, table, chart, image and include. Inline nodes are text, emphasis, strong emphasis, code and link. Tables own rectangular cells, rather than general child blocks.

Source locations belong to parsed nodes and tokens. Editing identities belong to the model and need not appear in source. Appearance holds optional column-width ratios; it cannot encode a table as prose or change formula meaning. The table's `widths` attribute, when present, is a quoted comma-separated list of positive integer weights, one per column. Weights are integers from 1 to 10,000. The writer divides them by their greatest common divisor. The editor rounds resized proportions to these weights; layout divides each weight by their sum.

**Use browser layout for the first editor.** Paragraphs and real HTML tables give text flow, selection, accessibility structure and print layout without a second text-layout engine. Canvas remains an option for future specialized figures, not the default document surface.

The KSPL model remains authoritative. The page turns editing into model actions ("How the editor changes a document"). The selection is a pair of model spots, not a DOM range kept across rendering. Undo records model transactions ("Undo and redo"). The page renders only the blocks an action changed, and restores the selection through the spots ([`DESIGN-page.md`](DESIGN-page.md)).

**A layout comparison confirmed the choice.** A small page held editable paragraphs and a real HTML table, beside a canvas that drew the same text. It ran in headless Chromium 141, and every check passed:

* Typing inserts once. A composition, sent as an input method sends it, commits its text once.
* An edit inside a cell stays in that cell, and a paragraph after the table takes typing.
* At a 320-pixel width the paragraph wraps and the table fits, with no line breaker of the editor's own.
* Native selection reads the text, and the table and its cells stand in the accessibility tree.
* Printing breaks a 120-row table across four A4 pages.
* The canvas exposes no text: no accessibility node, no selection, and no typing without a hidden input field. Each of these would be the editor's own code.

**The browser's own undo is not the product's undo.** One undo removed two separate edits, the typed text and the composed text, since the browser groups edits by its own rules. So undo records model transactions. The comparison checks layout responsibilities, not complete editors or performance.

## How the editor changes a document

`Editor` in `ksmd/edit/editor.kspl` holds one document, its selection and its history. Every action a page asks for is a method on it, and each action is one transaction.

**An action takes the blocks it touches apart into units, changes them, and settles them into blocks again** (`ksmd/edit/region.kspl`). A unit is a paragraph, a heading, a code block or one list item. A table, a chart, an image or an include is a whole unit, kept as it is. An action works on units without regard to which block holds them. Settling then groups neighbouring list items into one list, and starts another list where a top-level item's marker changes.

**Text is changed as a run of segments, each with its own marks** (`ksmd/edit/styled.kspl`). A command sets or clears a mark per segment, and never opens or closes a node itself. Building the inline nodes again opens marks in a fixed order: a link outermost, then strong emphasis, then emphasis. That is the order in which the reader takes a run of `***` that opens both. Every mark closes before a hard break, since a mark closes on its source line.

**Each action's result is written and read back before it is taken.** The new text blocks are written as a small source and read again. The action is refused, and changes nothing, if the reader refuses that source or reads other text or other marks. So the editor holds no second copy of a rule the reader holds. The comparison allows what the writer leaves out at a line's edge.

**A block with no text leaves a gap.** The format has no empty paragraph, since a blank line separates blocks. So deleting a block's last character removes the block, and the caret stands in a gap where it stood. Typing in a gap makes a block of the kind the gap keeps. A gap can stand before or after a table, between any two blocks, and at the document's end. An empty code block stays, since the format holds one.

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
| Backspace or Delete | In a gap | The caret moves to the end of the text before it, or the start of the text after it |

**A kind change keeps the text.** A heading and a list item hold one line, so a paragraph's hard break becomes a space in them. Code holds plain text, so the marks go. A paragraph made a list item joins a neighbouring list whose top level has the same marker. A nested item's marker follows the first item of its level.

**A table goes in where the caret stands, splitting its text block.** A new table takes the first free name of `table1`, `table2` and on. Its column names are empty. Adding or renaming a table attaches each reference kept as text that then names one of its cells.

**A removed table keeps its place in the document's list of tables, emptied and with no name.** Blocks and references name a table by its place, so taking it out would renumber every later table. With no name, no reference and no new table finds it. A reference to it from another table becomes text as written, and calculates as `#REF!`. Removing a table's block by any action, a deleted selection included, empties its table.

**A cell edits as the text a person types.** Text after `=` is a formula, and a number as JSON writes one is a number. A quoted JSON string is text, so `"12"` is the text 12. Nothing makes the cell empty, and anything else is text as typed. A cell's editor shows its value the same way: text that would read as another kind shows in quotes, as the source writes it.

## Undo and redo

**Each action records the swap of what it changed** (`ksmd/edit/history.kspl`). Undoing swaps the old blocks and table parts back in, which leaves the undone version in the record, ready for redo. Inline nodes and list items are only ever added, so an old block still names valid nodes. A swap is exact only when every later action is undone first, so undo and redo run strictly in order.

**A table edit is recorded by comparing each table with a copy made before it.** Where a table keeps its rows, columns, name and cell count, the record holds only the cells and formula pieces that differ. A cell edit in a large table then records one cell. Column widths that change alone are recorded alone, so resizing a column of a 10,000-row table copies no cell. Otherwise the record holds the whole table.

**Typing joins one step per word, with no clock.** Typed text joins the step before it while the caret stays where that step left it. A space ends the step it is typed into. Deleting single characters joins the same way. A paste, a composition, Enter and every command are steps of their own. A rule with no clock gives the same steps on every machine, so a test can check it.

Undo and redo put back the selection each step started or ended with. A new action drops what was undone. A refused action records nothing.

## The file lifecycle

**ksmd reaches files through the repository's local server, `kssrv --local`, started on one workspace folder.** A page in a browser cannot read a folder, so it asks the server for each file by its path from the root. The protocol and its refusals are [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md). The server reaches files and nothing else: it starts no program, and knows nothing of the document. It lists one folder's names, for the File dialog alone. ksmd adds no server and no request of its own.

| Guarantee | What holds it |
| :-- | :-- |
| Only this machine reaches the server | The server listens on the loopback alone, and refuses a request that names another host |
| Another page or program cannot drive it | The server makes a new token at each start. The page moves it from the address into the tab's storage, and sends it in a header |
| A path stays inside the workspace | The page applies the workspace's text rules (`resolve_text` in `ksmd/files/files.kspl`). The server refuses a link and a path out of its root |
| No file appears by itself | Opening, viewing and drafts write nothing. A save writes the open document's own path, or a new path where no file stands. Save As replaces another file only after a second press, and only while that file still holds what it held when chosen |

### Opening

**A document opens from its path in the workspace**: from the address (`?doc=notes.ksmd`), or chosen in File, Open (Ctrl+O). The menu bar shows the open document's path. The page gives the file's bytes to the editor unchanged. A file the reader refuses does not open, and the open document stays.

**The page builds the assembled view itself, in rounds.** An assembly over what the page holds names the files it still lacks (`Fetched` in `ksmd/files/fetched.kspl`). The page fetches them and assembles again, one round per level of includes. So the browser applies `assemble`'s rules, and a refusal that the server gives, such as a link, stands as that file's. A clause whose file is still being fetched shows its path and no problem.

**A chart's Edit button opens a panel**: bars or lines, the labels column, the columns drawn, and a title. Apply is one step of undo. The table's right-click menu holds Insert chart, which puts a bar chart after the table. It labels the bars by the first column and draws the first column of numbers.

**A Remove button on an include, an image or a chart takes that block out of the document**, as one step of undo. No text selection reaches inside such a block, so without the button only a text editor could take it out. The included file or the image file stays as it is.

**An include shows its file's blocks in place, and they do not edit there.** Its Edit button opens the included file in a tab of its own, with its own undo history, its own save and its own draft. The parent's model holds the clause, so the parent's save never writes the included file.

### Saving

**A save writes the open document's canonical source to its own file, and only that file.** Ctrl+S and the Save button save. The server replaces the file through `fs.replace_file`, so a crash leaves the old text or the new.

**Save As chooses the folder and the name in a dialog** (Ctrl+Shift+S), as a word processor's does. The dialog shows one folder at a time: its folders, then its `.ksmd` documents, with the path from the workspace down to it above them. It asks the local server for each folder's names; links and hidden names are not listed. A name with no extension gets `.ksmd`. A name that stands there already asks for a second press of Save before it is replaced. The chosen path then goes through the same rules as a typed one. The Open dialog is the same dialog, and a double press on a document opens it.

**The dialog stays open outside the page's file steps.** A check or a draft that falls due while it is open still runs. Only what is chosen runs as a step.

**A save compares the file's bytes with those this page last read or wrote, never its time.** The page keeps the SHA-256 digest of those bytes. Before it writes, it reads the file again and compares. It then sends the digest with the write, and the server replaces the file only while the file still matches. A file rewritten with the same bytes is no change, and a write from another tab in between is caught.

**A file changed on disk is never overwritten without a choice.** The page writes nothing and shows a notice that does not block editing. The notice offers two ways on: replace the file with this version, or load the file's version and keep this one as a draft. No merge is offered, since a merge that drops a line loses work silently.

**When the page is looked at again, it reads its file again.** Focus and visibility both start the check. With nothing unsaved, a changed file shows at once. With edits unsaved, the page shows the same notice as a save. Each include and image is fetched again, and the view changes where one changed. The server watches no file, so a page that is not looked at notices a change only at its next save.

**A new document saves only where no file stands, unless the person chooses to replace one.** Save on a document with no file yet opens Save As, as a word processor does. Save As replaces a file that stands only after a second press. So a save never replaces a file without a choice. Opening a missing path creates nothing.

### Drafts

**Unsaved edits are held as a draft in the browser's storage, and a draft is never written to the file.** A draft is written after a pause of one second in typing, and after five seconds of typing without a pause. It is also written when the page is hidden or left. A crash then loses at most those seconds. The page says "Not saved. A draft is held in this browser.", and never calls a draft saved.

**A draft is offered when its document opens again, and comes back only on a press.** The notice names the time the draft was held, with two choices: bring it back, or discard it. A draft brought back is unsaved edits, and keeps the digest of the file it started from. So a save over a file changed since then asks first.

**A draft is kept per workspace, path and opening.** Two tabs on one document hold two drafts, and neither overwrites the other. A save, a discard, or edits undone back to the file's text let the draft go. Drafts older than 30 days are let go when the page starts.

**The browser keeps drafts per address, the server's port included.** Started on another port, the page finds none of the drafts held before. So a launcher keeps one port per workspace ("Opening a document from the desktop" below). A server started by hand needs the same port each time.

**Nothing is written beside the document.** A lock file or a swap file that a crash leaves behind blocks the next open, and shows up in version control. The comparison of bytes at each save makes a lock unnecessary.

### Opening a document from the desktop

**A launcher opens a `.ksmd` file on its workspace, and keeps one port per workspace.** It starts the local server on the workspace, or reuses the server already serving it. It then opens the document's address, `?doc=` and its path from the root, in the default browser. "Opening a `.ksmd` document on a double-click" in [`docs/HOWTO-set-up-a-project.md`](../../docs/HOWTO-set-up-a-project.md) ties `.ksmd` to it on each system. On Linux `make install` makes the tie; on Windows and macOS a person makes it once.

* **Started from a file, the workspace is the nearest folder at or above it that holds a file named `.ksmd-workspace`.** Without one, it is the file's own folder. A person opens a workspace explicitly, and the mark keeps that choice in the folder itself. It moves with the folder, and an include that climbs with `../` stays inside it.
* **Only that mark makes a workspace.** A repository's `.git` folder does not: a repository at the home folder would put every file there in the page's reach.
* **The same workspace gets the same port on every run.** The port is worked out from the workspace's path, so nothing has to be remembered, and the drafts held for that address come back.
* **Each opening shows a tab of its own.** Two tabs on one document hold two drafts, so neither loses the other's edits.

**What it gives up:** a port that another program holds moves that run's server to the next free port. Its drafts stay with that port. One folder spelt two ways, such as another letter case on Windows, is two workspaces. They have two ports and two sets of drafts.

**Where it was checked:** `make test-ksmd-open` runs the launcher on Linux, without a browser. A person checked the rest by hand on a Windows PC, once. There a double-click opened a document with its table calculated and its note included, and the files showed the icon. A second document opened on the same port, and a folder named with spaces and `メモ` opened. The reset steps tied `.ksmd` to a launcher built elsewhere, and `--list` and `--stop-all` named and stopped the servers. No gate checks a double-click, and macOS was not checked.

### A part file that an interrupted save leaves

**A `<name>.<16 hex digits>.part` file beside a source is left as it is.** `fs.replace_file` writes it before the rename, so it stays only after a crash before the rename. The source then still holds its old text. The draft holds the text that was being saved, since a draft goes only after the server reports the save on disk. The part file can be cut short, the page cannot see it, and no request deletes a file. So ksmd neither reads nor removes it, and a person deletes it with the file manager.

### Images

**An image's format and size come from its file's header, before the browser decodes it.** `measure` in `ksmd/files/image.kspl` reads a PNG's IHDR chunk, or walks a JPEG's segments to its frame header. The bytes decide the format, and the file's name does not. Another format is refused, and so is an image of more than 16 million pixels. The page passes the header in windows of 64 KiB, so a large file never fills the editor's memory. An image that is refused or missing shows the reason at its clause.

**An image pasted or dropped into the text is written beside the document, and its clause goes in after the caret's block.** Its name is the document's, then `-image-` and the first free number, such as `notes-image-2.png`.

* **The write names no file, so it never replaces one.** A name already taken goes on to the next number.
* **The page asks for the alternate text first.** An empty answer marks the image as one that only decorates; Cancel puts nothing in.
* **It needs the local server and a document saved once**, for the image needs a folder to go in. Opened from a file, the page says so and changes nothing.
* **Only PNG and JPEG go in, up to the server's 8 MiB.** An image never goes into a table cell.
* **Undo takes the clause out, and the file stays**, as the Remove button leaves it.

### What the file lifecycle leaves out

* Two people editing one file at once. A save after another person's save asks, as for any change on disk.
* Noticing a change while the page is not looked at.

## Limits and failures

Initial limits are safety bounds, not performance claims. Apply them before allocating expanded structures.

| Resource | Limit |
| :-- | :-- |
| One source file | 8 MiB of UTF-8 |
| Blocks in one source | 100,000 |
| List nesting or inline nesting | 16 levels each |
| One table | 256 columns, 10,000 data rows, 100,000 cells including the header |
| One formula | 4,096 UTF-8 bytes and 64 expression levels |
| `round`'s places | -15 to 15 |
| Include depth | 16 files on the active stack |
| Assembled view | 64 MiB of source text and 200,000 blocks, counting repeated instances |
| One decoded image | 16 million pixels |

**The view counts a source's text when the source is read, refused or not, and again at each later include of it.** A refused source counts because its text was read into memory. An include that would pass a view limit is a problem at its clause, found before its blocks join the view.

A diagnostic names the source path, one-based line and Unicode-scalar column, plus the offending span. Internal spans use UTF-8 byte offsets. Include errors also show the include chain. The UI converts offsets to its own selection units.

Malformed syntax, unknown clauses or attributes, and unsupported versions prevent editing and saving that source. They do not cause a partly parsed model to overwrite the file. Offer the original source and diagnostics for inspection. Calculation errors are valid cell results and do not prevent saving their formula source.

The reader refuses a formula longer than 4,096 bytes, and an edit that would write one is refused. A table's new name counts too, as a reference writes it. A formula nested deeper than 64 levels calculates as `#SYNTAX!`. A table edit past a table's limits is refused, and a refused edit changes nothing.

**A step that would leave the source over 8 MiB or 100,000 blocks is undone and refused.** The reader refuses such a source, so the saved file would not open again. The editor keeps the count of the source's bytes. A step that changes only blocks adds the bytes of those blocks. A step that changes a table measures the whole source. A table's rows and names change how other tables and charts are written.

### Keys from a document

**No key from a document reaches std's `Map`.** `Map` hashes with a fixed seed. A document could then hold many table names or paths that start at one slot, and each lookup would pass them all. `make test-conventions` refuses `Map` anywhere in `ksmd/`.

| What is looked up | By | Where | Work for one lookup |
| :-- | :-- | :-- | :-- |
| A table name, to refuse a second table of that name | The name | `Keyed`, while `reader.read` reads one source | At most about 1.44 log2(n) names, for at most 100,000 tables |
| A source the view already read or refused | Its path from the root | `Keyed`, in `Assembly` | The same, for at most 200,000 includes |
| A file the page fetched, or still lacks | Its path from the root | `Keyed`, in `Fetched` | The same |
| A clause's problem | Its entry | A binary search of `Assembly.problems`, which stand in the order of their entries | log2 of the problems |
| An included source's values | Its index | A list, by that index | One step |

**`Keyed` in `ksmd/base/keyed.kspl` is an AVL tree that compares keys byte by byte.** Its work does not depend on any hash. A sorted list is not used: names in falling order would shift the whole list at each insertion.

### What a document costs

**These figures come from one machine, and promise nothing elsewhere.** `make measure-ksmd` measured them on 22 October 2026. The machine had four cores of an Intel Xeon at 2.10 GHz, 15 GB of memory and Linux. The browser was the headless Chromium 141 that the browser gate drives.

* `ksmd/tests/measure.kspl` writes the documents, and times the model outside the browser. `ksplc run` builds it with `-O0`, so its figures run slower than the page, which is built with `-O2`.
* `ksmd/tests/browser/measure.mjs` times the page, opened from a file and served by `kssrv --local`. An edit is timed from the browser's input event to the end of the page's change, the layout included. Painting is not timed.
* Each figure is the middle of five runs. Runs differ: an earlier run of the same commands opened the large document in 6.1 s.

| Document | Bytes | Blocks | Tables |
| :-- | --: | --: | :-- |
| Typical | 46,416 | 247 | Four of 49 rows, each with a row of sums |
| Medium | 2,435,351 | 12,004 | One of 9,999 rows and a row of sums |
| Large | 6,207,351 | 36,004 | One of 9,999 rows and a row of sums |

Each table row holds a count, a price, their product and a running total. The times are in milliseconds.

| Step | Typical | Medium | Large |
| :-- | --: | --: | --: |
| Outside the browser: read the files and build the view | 3.1 | 125 | 321 |
| Outside the browser: calculate every table | 0.3 | 15 | 16 |
| Outside the browser: one typed character, as one transaction | 0.02 | 0.4 | 0.3 |
| Outside the browser: set one cell, then calculate every table | 0.5 | 32 | 31 |
| Outside the browser: write the source and replace the file | 2.1 | 64 | 151 |
| Page from a file: open, calculate and show every block | 37 | 1,555 | 3,317 |
| Page from a file: a key typed at the end | 2.8 | 130 | 364 |
| Page from a file: a cell's value entered | 18 | 1,272 | 1,562 |
| Page from a file: Alt+Right or Alt+Left in a cell | 20 | 1,301 | 1,627 |
| Page from a file: the source a save writes | 0.4 | 11 | 26 |
| Served page: open, with the page, its wasm and the files fetched | 276 | 5,199 | Does not open |
| Served page: Ctrl+S, to the file written and the result shown | 26 | 329 | Does not open |

What the figures show:

* **In the typical document, an edit takes at most 20 ms, and opening takes at most 0.3 s.**
* **A key press grows with the blocks on the page, not with the model.** One profile of a key press in the large document was taken by hand. The transaction took under 5 ms. Most of the time went to the browser placing the selection and laying the page out. The page's own scans of every block took about 80 ms.
* **A table edit shows the whole table again.** With 10,000 rows, a cell's value or a resize takes over a second in the page. Outside the browser, the same edit and calculation take 31 ms.
* **The editor's 128 MiB holds the large document only in a page opened from a file.** Served, the page builds its view from a second copy of the source, and the memory runs out. The page then says that the editor stopped. Opened from a file, a second opening of it is refused, since the open document stays until the next one is read.
* **So the page does not reach the limits above.** By hand, the served page opened the large document cut to 4.3 MB and 24,004 blocks, in 11.6 s.

These are known limits, not yet worked on:

* A key press in a document of tens of thousands of blocks takes over 100 ms.
* An edit in a table of 10,000 rows takes over a second, as the page shows every table again.
* Served, a document of 6.2 MB did not open, and one of 4.3 MB did.

## Acceptance examples and next work

The examples `overview.ksmd`, `notes.ksmd` and `literals.ksmd` cover the first contract. In the budget table, D1 is 30, D2 is 10 and D3 is 40. The include remains a clause when the parent is saved. A pipe in quoted table text remains one cell. The fenced clause in the literal example stays code.

File resolution and calculation stay separate from syntax parsing. `make test-ksmd-browser` drives the editing page through the browser's own input events, and checks the source each model transaction saves. It then serves the page with `kssrv --local` on a scratch workspace, and checks each file step against the bytes on disk.
