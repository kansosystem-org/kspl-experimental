# The first ksmd document and editor

This is the design for implementers and reviewers. **It is not an implemented file-format specification.** The examples under `ksmd/examples/` illustrate these decisions, and everything below is implemented. The editing page has its own design, [`DESIGN-page.md`](DESIGN-page.md).

## The first usable document

A document contains prose, calculating tables, charts of them, images and includes, in reading order. The editor changes that structure directly. Source is read at open and written at save, not reparsed after each keystroke.

| Included | Excluded from the first release |
| :-- | :-- |
| Paragraphs, six heading levels, lists, links, emphasis and literal code | Raw HTML, executable code fences, embedded scripts |
| Rectangular tables with text, numbers and formulas | Merged cells, nested tables, blocks inside cells |
| Images in the document flow, with alternate text and an optional caption | Floating objects, absolute positioning, vector drawing tools |
| Browser printing with automatic page breaks | Editable page boundaries, page templates, exact cross-browser pagination |
| Includes opened separately for editing | Network includes, editing several sources in one transaction |

Static figures are images with captions. Images keep their aspect ratio and fit the content width. Column resizing affects appearance, never cell identities or values. There is no presentation mode.

## Source boundaries

Files use UTF-8. The first line is exactly `%ksmd 1`; an unsupported version is an error before the body is read. The writer uses LF line endings and ends the file with one newline. The reader also accepts CRLF and an initial UTF-8 BOM. A carriage return without a following line feed is an error. Source views keep the original bytes, so diagnostics do not shift after CRLF or a BOM.

A file holding only the version marker is an empty document. A blank line separates blocks. Within a paragraph, a source newline becomes one space, and a backslash right before a newline is a hard line break. The writer puts a paragraph on one source line except for hard breaks.

A clause starts at column one with `:::`, its kind and its attributes. A line holding only `:::` closes it. Clauses do not nest in version 1. The kinds are `table`, `include`, `image` and `chart`; an unknown kind is an error. Attributes are unique `name=value` pairs separated by spaces; an unknown or a repeated attribute is an error. Strings use JSON quoting and escapes, and numbers are decimal. There are no implicit attributes, positional arguments or short forms. A style cannot change a block's kind.

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
* A clause's kind follows `:::` at once, and its attributes come in any order. The writer writes them in a fixed order with one space: `name`, `widths`, `heights`, `formats`, `choices`, `rules`, `groups`, `filter`; `path`; `src`, `alt`, `caption`. A table row outside a table clause is refused.
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
| `align` | `"left"`, `"center"`, `"right"` | A cell's or a paragraph's alignment |

* **Values are written as attributes are**: strings in JSON quotes, numbers bare. The writer writes the parts in that fixed order, and colours in lower case. A look with no part is refused.
* **A table cell writes its look after its value**: `| 120 {color="#c00000"} |`. An empty cell can carry a look alone: `| {fill="#fff2cc"} |`. A `{` inside quoted text is text.
* **Text takes a colour, and nothing else, in brackets: `[text]{color="#c00000"}`.** A fill and a size on text would make a page uneven. A `{` right after brackets is escaped.
* **A paragraph's or a heading's alignment stands on a line of braces right before it**, holding only `align`. At the end of the text, an ordinary `{` in prose could not be told apart. A `{` at the start of a paragraph's line is escaped, and anywhere else it is text.
* **A cell's new value keeps its look.**

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

A formula holds numbers, text in quotes, `true` and `false`, cell references, rectangular ranges, parentheses, unary minus, `+`, `-`, `*`, `/`, the comparisons `=`, `<>`, `<`, `<=`, `>`, `>=`, the words `and`, `or` and `not`, and the functions `sum`, `min`, `max`, `count`, `average`, `if`, `round`, `sum_if`, `count_if`, `average_if`, `lookup`, `today`, `date`, `year`, `month` and `day`. Function names are lowercase. Multiplication and division bind before addition and subtraction, and both before a comparison. `not` binds before `and`, and `and` before `or`. Other arithmetic groups left to right. A range stands only as a function's argument, or in the condition of `sum_if`, `count_if` and `average_if`. There are no user functions.

An empty cell is zero in arithmetic. The rules for values and errors are "Values and errors" below, and for dates "Dates" below.

### How a formula is written

* A number has a cell number's shape without its sign: `2.5`, `1e3`, `0.5`. A sign is unary minus.
* A cell is capital column letters, then a row number from 1 without a leading zero: `D1`, `AA12`. A `$` before either part fixes that part for copying.
* `budget.D1` names a cell of another table in the same source, with no space around the `.`. A name that is not plain (a lowercase letter, then lowercase letters, digits and `_`) stands in JSON quotes: `"Q1 sales".D1`.
* A range is two cells joined by `:` without spaces: `D1:D3`. A table's name stands once, before the range: `budget.D1:D3`. The corners can come in either order, and the writer saves the upper left first.
* `#REF!` stands where a reference lost its row or column. The reader and writer keep it, and it calculates as `#REF!`.
* **Text stands in JSON quotes, with JSON's escapes:** `"Pens"`, `"say \"hi\""`. Quotes followed at once by `.` and a cell name a table instead.
* **`and`, `or`, `not`, `true` and `false` are words.** A `|` splits a table row unless it stands in quotes, so the symbols `||` and `|` cannot serve.
* **A comparison takes one step: `1 < A1 < 9` does not read.** Write `1 < A1 and A1 < 9`.
* Spaces and tabs can stand between tokens. A function takes one or more arguments, separated by `,`.
* A formula nests at most 64 levels. The formula itself is one level, and each bracket, function, unary minus and `not` adds one.

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
| `#NUM!` | A number or a result too large for an F64, or `round`'s places not a whole number from -15 to 15 |
| `#REF!` | A reference to no cell: `#REF!`, a cell outside its table, or a table name this source does not hold |
| `#CYCLE!` | The cell depends on itself, directly or through other cells |
| `#EMPTY!` | `min`, `max`, `average` or `average_if` of no numbers |
| `#SHAPE!` | A range in the condition of `sum_if`, `count_if` or `average_if` that is not one column as tall as the values, or a condition with no range. It is fixed by changing a range, which no other mark asks for |
| `#SYNTAX!` | The formula does not read: an unknown function, a range outside a function or a condition, a missing bracket or operand, or more than 64 levels |

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

### Finding a value by its key

**`lookup(key, keys, values, otherwise)` gives the value beside the first key that equals `key`**, an exact-match lookup. `=lookup(A1, prices.A1:A50, prices.B1:B50, 0)` finds a price by its code.

* **`keys` and `values` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A match is exact.** Text equals text without regard to case, as the sort and the filter compare it. A number equals the same number. No nearest match is guessed.
* **`otherwise` is required, and calculated only where no key matches.** A missing key then shows what the writer chose, never an error nobody planned for.
* **An error in `key` is the result.** A key cell holding an error is passed over, but a key on a cycle before the match makes the lookup `#CYCLE!`. Passed over, it would hide the cycle.

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
* **A choice is 1 to 100 bytes of text, with no `,`, `|`, `"` or `\`, and no space at either end.** A column holds at most 50, and no two equal without regard to case.
* **A list belongs to a column**, as a format does. A cell that already holds another value keeps it, and the page marks it.
* **Only a list.** Number ranges, dates and formula conditions are left out, and so is a list taken from another table.

`ksmd/model/choice.kspl` reads, writes and checks an entry. `edit.set_choices` sets a column's list as one step of undo, and `edit.set_cell` keeps to it.

### Colouring cells by their value

**A column can take one colour rule: its cells that meet it take the rule's colours**, which follow the value as it is calculated again. The table's `rules` attribute holds one entry per column, empty for none:

```text
:::table name="budget" rules=",,<0;color:#9c0006 fill:#ffc7ce"
```

* **An entry is a condition, `;`, then the colours.** `<5` is below 5, `>5` above 5, `=5` or `=Done` equal to it, and `empty` an empty cell. `color:` is the text's colour and `fill:` the background's, one or both.
* **The rule reads each cell's calculated value**, and compares text without regard to case.
* **The rule's colours stand over the cell's own look** while the rule holds.
* **One rule per column, and only these conditions**, so no order between rules is needed. Colour scales, data bars, icon sets and formula conditions are left out.
* **A rule belongs to a column**, as a format does, and moves with it.

`ksmd/model/rule.kspl` reads and writes an entry, and `edit.set_rule` sets a column's rule as one step of undo.

### Groups of rows

**Data rows can be grouped, and a group's rows hide and show together, as a spreadsheet's outline does.** The table's `groups` attribute saves each group, and whether it is hidden:

```text
:::table name="budget" groups="rows 2-4, rows 6-9 closed, rows 7"
```

* **An entry names data rows as a formula numbers them, from 1.** `rows 2-4` is rows 2 to 4, and `rows 7` one row. ` closed` marks a group whose rows are hidden.
* **The entries stand from the top, an outer group before the groups it holds,** separated by `, `.
* **A group holds another group whole, or shares no row with it.** Groups nest at most 8 deep. Two groups never hold the same rows, and two side by side stay two.
* **A group belongs to the table's layout, as a width does, so it names rows by place.** A sort or a moved row leaves the groups where they stand. A row inserted inside a group joins it. A removed row leaves it, and a group whose rows are all removed goes.
* **Hidden rows still count in a formula**, as with a filter.
* **Whether a group is hidden is saved in the file, unlike a filter.** Hiding detail is the shape the writer gives the table, while a filter answers one question for the moment.

`ksmd/model/group.kspl` reads, writes and checks the groups. `edit.group_rows`, `edit.ungroup_rows` and `edit.show_group` are each one step of undo. Ungrouping takes away the smallest group that holds the chosen rows.

### How references follow edits

Each row and column of a table holds an identity that the source does not show. A reference holds the identities of its cells, and the writer writes the coordinates they have now. Calculated values are never stored in the model. `ksmd/edit/edit.kspl` holds the operations: insert, remove and move a row or a column, sort the rows, set a cell and copy a cell.

* **Insertion and movement keep every reference on its cells.** A range spans its two corners, so a row inserted between them joins it. A row inserted after the last corner stays outside; to grow a range at its end, insert inside it.
* **A range's corner follows its row or column.** When a corner's row moves, the range spans the corners' new places.
* **A sort moves each row with its identity.** A formula keeps naming the cells it named before, so `=B1*C1` in row 1 still names its own row after the sort.
* **Removal turns a reference to the removed line into `#REF!`.** A range's corner on that line moves one line toward the other corner. A range with no line left becomes `#REF!`.
* **`$` acts only on copying.** A copy shifts each part without `$` by the distance copied, and a part with `$` keeps its row or column. A shift outside the table gives `#REF!`.
* **A reference without a table's name names a cell of the table that holds the formula.** So a copy into another table names a cell there.
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

### Dates

**A date is a value of its own: a day, written `2026-10-23` and shown so.** A cell holding a bare `2026-10-23` is a date. A typed `2026-10-23`, `2026/10/23` or `2026/1/5` becomes one, kept as `2026-10-23`. A quoted `"2026-10-23"` stays text.

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

### Charts

**A chart draws a table's calculated columns as bars or as lines.** The `:::chart` clause names the table, the column whose values label each bar or point, and the columns drawn:

```text
:::chart table="budget" kind="bar" labels="month" values="rent,food" title="Spending by month"
:::
```

* **`table`, `kind`, `labels` and `values` are required, and `title` is not.** `kind` is `bar` or `line`; `values` names 1 to 8 columns, separated by `,`.
* **Only bars and lines**, the charts people make most.
* **A chart holds its table and columns by identity, as a formula's references do**, and the writer writes the names they have now.
* **A name that names nothing is kept as written, and the chart says what is missing.** Nothing is lost when a column is removed and put back.
* **A column that a chart shows keeps a name that finds it again.** The reader takes the first column of a name and splits `values` at each `,`. So an edit is refused where a shown column's name would be empty, hold a `,`, or match an earlier column.
* **A cell that holds no number leaves a gap**, and the axis starts at zero, so a bar's height is its value. The chart itself holds no values.
* **The page draws a chart as SVG**, with colours that people with the common kinds of colour blindness tell apart.

`ksmd/syntax/chart.kspl` reads and writes the clause, and finds its table and columns. `ksmd/edit/editor_charts.kspl` makes and changes charts. A changed chart is a new entry that its block points at, so undo swaps the block back.

## Includes and images

An include clause has only `path="notes.ksmd"` and an empty body. An image clause requires `src` and `alt`, and permits `caption`; its body is empty. Version 1 accepts local PNG and JPEG assets. SVG, remote images, executable formats and data URLs are excluded.

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

The table's `widths` attribute, when present, is a quoted comma-separated list of integer weights from 1 to 10,000, one per column. The writer divides them by their greatest common divisor, and layout divides each weight by their sum.

**The table's `heights` attribute gives a row a least height in points**, as a quoted list with one entry per data row: `heights=",30,,"`. An entry is a whole number from 6 to 409, Excel's limit, or empty for a row the text sizes. The attribute stands only while some row has a height.

* **A height is a least height: a row grows where its text needs more room.** A spreadsheet that cuts the text off at the row's edge hides a value from the reader.
* **The model keeps each height by the row's identity**, so a sort, a moved row and an inserted row leave it on its row. A removed row's height comes back with an undo.
* **Points are the unit of a font's size**, which the look already uses ("Looks" above), and of Excel's row height. A table's column widths stay weights, since the table fills the width of the page or paper.

**The table's `filter` attribute keeps which rows the page shows**, as a quoted list with one entry per column (`ksmd/model/filter.kspl`):

```text
:::table name="tasks" filter="in:open|in progress|,,above:100"
```

| Entry | The rows it shows |
| :-- | :-- |
| Nothing | Every row |
| `in:` and values separated by bars | Rows whose cell shows one of the values; an empty value stands for empty cells |
| `is:`, `not:`, `contains:` and a value | Rows whose cell shows that text, any other, or text holding it |
| `above:`, `below:` and a value | Rows whose number is greater or less; text compares as text |
| `empty`, `filled` | Rows whose cell is empty, or holds a value |

* **A value is the text the cell shows, in lower case**, since the page compares without regard to case. `%25`, `%2C` and `%7C` stand for `%`, `,` and `|`, which separate the entries.
* **The model keeps each entry by the column's identity**, so it moves with its column, and an undo of a removed column brings it back.
* **The file keeps every row; a filter only hides some on the page and on paper.** A reader that does not know the attribute refuses the file rather than show rows the writer hid ("Source boundaries" above).

**The editor uses browser layout.** Paragraphs and real HTML tables give text flow, selection, accessibility structure and print layout without a second text-layout engine. Canvas remains an option for future specialized figures, not the default document surface.

The KSPL model remains authoritative: the page turns editing into model actions, and the selection is a pair of model spots, not a DOM range ([`DESIGN-page.md`](DESIGN-page.md)).

**A layout comparison confirmed the choice.** In headless Chromium, editable paragraphs and a real HTML table took typing and composition once. They wrapped and fitted at a 320-pixel width. Native selection read the text, the accessibility tree held the table, and printing broke a long table across pages. A canvas exposed no text, so accessibility, selection and typing would each be the editor's own code.

**The browser's own undo is not the product's undo.** The browser groups edits by its own rules, so one undo removed two separate edits. Undo records model transactions instead ("Undo and redo").

## How the editor changes a document

`Editor` in `ksmd/edit/editor.kspl` holds one document, its selection and its history. Every action a page asks for is a method on it, and each action is one transaction.

**An action takes the blocks it touches apart into units, changes them, and settles them into blocks again** (`ksmd/edit/region.kspl`). A unit is a paragraph, a heading, a code block, one list item, or a whole table, chart, image or include. Settling groups neighbouring list items into one list, and starts another list where a top-level item's marker changes.

**Text is changed as a run of segments, each with its own marks** (`ksmd/edit/styled.kspl`). A command sets or clears a mark per segment, and never opens or closes a node itself. Building the inline nodes again opens marks in a fixed order: a link outermost, then strong emphasis, then emphasis. That is the order in which the reader takes a run of `***` that opens both. Every mark closes before a hard break, since a mark closes on its source line.

**Each action's result is written and read back before it is taken.** The action is refused, and changes nothing, if the reader refuses that source or reads other text or other marks. So the editor holds no second copy of a rule the reader holds. The comparison allows what the writer leaves out at a line's edge.

**A block with no text leaves a gap**, since the format has no empty paragraph. Deleting a block's last character removes the block, and the caret stands in a gap where it stood. Typing in a gap makes a block of the kind the gap keeps. A gap can stand between any two blocks and at either end. An empty code block stays, since the format holds one.

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

**A kind change keeps the text.** In a heading or a list item a hard break becomes a space, and in code the marks go. A paragraph made a list item joins a neighbouring list whose top level has the same marker. A nested item's marker follows the first item of its level.

**A table goes in where the caret stands, splitting its text block.** A new table takes the first free name of `table1`, `table2` and on, with empty column names. Adding or renaming a table attaches each reference kept as text that then names one of its cells.

**A removed table keeps its place in the document's list of tables, emptied and with no name.** Blocks and references name a table by its place, so taking it out would renumber every later table. A reference to it from another table becomes text as written, and calculates as `#REF!`. Removing a table's block by any action empties its table.

**A cell edits as the text a person types.** Text after `=` is a formula, and a number as JSON writes one is a number. A quoted JSON string is text, so `"12"` is the text 12. Nothing makes the cell empty, and anything else is text as typed. A cell's editor shows text that would read as another kind in quotes.

## Undo and redo

**Each action records the swap of what it changed** (`ksmd/edit/history.kspl`). Undoing swaps the old blocks and table parts back in, which leaves the undone version in the record for redo. Inline nodes and list items are only ever added, so an old block still names valid nodes. Undo and redo run strictly in order, since a swap is exact only then.

**A table edit is recorded by comparing each table with a copy made before it.** Where a table keeps its rows, columns, name and cell count, the record holds only the cells and formula pieces that differ. Column widths that change alone are recorded alone, so resizing a column copies no cell. Otherwise the record holds the whole table.

**Typing joins one step per word, with no clock**, so every machine gives the same steps and a test can check them. Typed text joins the step before it while the caret stays where that step left it. A space ends the step. Deleting single characters joins the same way. A paste, a composition, Enter and every command are steps of their own.

Undo and redo put back the selection each step started or ended with. A new action drops what was undone. A refused action records nothing.

## The file lifecycle

**ksmd reaches files through the repository's local server, `kssrv --local`, started on one workspace folder.** A page in a browser cannot read a folder, so it asks the server for each file by its path from the root ([`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)). The server reaches files and nothing else, and knows nothing of the document. ksmd adds no server and no request of its own.

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

**An image pasted or dropped into the text is written beside the document, and its clause goes in after the caret's block.** Its name is the document's, then `-image-` and the first free number, such as `notes-image-2.png`.

* **The write never replaces a file**: a name already taken goes on to the next number.
* **The page asks for the alternate text first.** An empty answer marks the image as one that only decorates; Cancel puts nothing in.
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
