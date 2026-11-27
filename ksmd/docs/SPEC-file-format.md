# The ksmd file format

**This specification sets what a `.ksmd` file may hold, and what each form in it means.** It is for a person who writes a file by hand, and for a model that writes one for someone. It needs no knowledge of ksmd's code.

**Every rule here holds for ksmd's reader and writer.** The reader opens a file; the writer saves one. How the editing page changes a document, and its keys, are in [`SPEC-editing-page.md`](SPEC-editing-page.md).

**To check a file you wrote, run `ksmd --check <file>`.** It prints whether ksmd refuses the file, and what each formula calculates, with no browser. The command is "Checking a file" in [`SPEC-commands.md`](SPEC-commands.md#checking-a-file).

## The rows, and what they start from

**Many rules carry rows: a small input, and what ksmd does with it.** ksmd's own tests read each row from this file and check it, so a row is a promise.

**A block row is a fenced `ksmd` block, then one sentence on the next line that is not empty:**

| The sentence | What it promises |
| :-- | :-- |
| "It saves as:" and a second `ksmd` block | The writer saves the first source as the second, byte for byte |
| "It is refused at line L, column C." | The reader refuses the source at that place |
| "It reads as:" and a `text` block | The reader builds the structure that the outline shows |
| "It copies as Markdown:" and a `markdown` block | Copy as Markdown gives the second block, byte for byte ("Copying as Markdown" below) |

* **A `ksmd` block with none of these sentences after it is an example**, not a row.
* **Lines and columns count from 1.** Line 1 is the version line. A column counts characters, not bytes.
* **An outline puts one part of the document on each line.** A part's contents stand under it, indented two more spaces.

**A table row is a row of a table whose header is one of these:**

| Header | Each row holds | What it promises |
| :-- | :-- | :-- |
| `\| Formula \| Shows \|` | A formula, and the text its cell shows | The cell shows that text: a number as shown, a date, `true`, or an error mark such as `#SHAPE!` |
| `\| Formula \| The reason says \|` | A formula, and words | The error's reason holds those words |
| `\| Entry \| Shows 1234.5 as \| Shows -0.125 as \|` | A number format, and two texts | The format shows each number as that text |
| `\| Written \| Answer \|` | A path as a clause writes it, and the path from the workspace's root, or `refused` | The path is read that way |
| `\| Opened \| Shows \| Problem at \| The reason says \|` | A file of the workspace above the table, what its view shows, and its problem | Opening that file gives that view and that problem, or no problem |

In a table, a backslash before `|` inside a cell makes a literal `|`.

**The rows calculate in a table named `t`, in a document opened on 2026-10-23.** Its cell A1 holds 2, A2 holds 3, B1 holds `"Pens"` and B2 holds `"Ink"`.

**A block that copies as Markdown calculates its own tables**, in a document opened on that date.

**A path row reads its path from a file in the folder `plans`**, just under the workspace's root.

**An `Opened` row opens a file of the workspace above its table.** A check row checks one: the sentence "`ksmd --check <path>` ends with code N and prints:", then a `text` block.

* **A workspace is the fenced blocks labelled `ksmd` and a path**, such as ` ```ksmd parts/one.ksmd `. Each holds the text of the file at that path from the workspace's root.
* **It runs from the nearest heading or `Opened` table above, down to the row.** No other file stands in it.
* **`Shows` is the view's text, in reading order, with `, ` between its parts.** A paragraph's or a heading's text is one part, and so is each data cell of a table, as it shows. Other blocks add nothing. `refused` means that the file itself does not open.
* **`Problem at` is the problem's place, as `file:line:column`.** After it, each include clause that leads there follows a `<`, innermost first. `none` means the file opens with no problem.
* **`The reason says` holds words of the problem's message**, and is empty under `none`.
* **An `Opened` row's file gives one problem at most.**
* **A check row promises that exit code, and that output byte for byte.** What the command prints is "Checking a file" in [`SPEC-commands.md`](SPEC-commands.md#checking-a-file).

**An outline names each part with these words:**

| Word | The part |
| :-- | :-- |
| `heading 1` to `heading 6` | A heading, at its level |
| `paragraph` | A paragraph |
| `text "…"` | Text, as it reads after its escapes |
| `strong`, `emphasis` | Strong emphasis, emphasis |
| `code "…"` | Inline code |
| `link "target"` | A link, with its destination |
| `list`, `item` | A list, and one item of it |
| `ticked item`, `unticked item` | A checklist item, ticked or open |
| `quote`, `divider` | A quote, a divider |
| `table "name"`, `row`, `cell "…"` | A table, one of its rows, one cell |
| `image "path"` | An image |
| `note "…"` | A note |

## The source

**A file is UTF-8 text, and its first line names its version: `%ksmd 2`.** The reader refuses any other first line before it reads on, `%ksmd 1` included.

```ksmd
%ksmd 3
```

It is refused at line 1, column 1.

* **The writer ends each line with LF, and the file with one newline.**
* **The reader also takes CRLF line ends and a byte order mark at the start.** A carriage return with no line feed after it is refused.
* **A place in a refusal counts in the original bytes**, so a CRLF or a byte order mark moves no place.
* **A file holding only the version line is an empty document.**
* **A blank line separates two blocks.** A line of spaces and tabs only is blank. Two or more blank lines read as one.
* **A block starts at column one.** An indented first line is refused.

```ksmd
%ksmd 2

  Indented
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

# Plan



Text
```

It saves as:

```ksmd
%ksmd 2

# Plan

Text
```

### Clauses

**A clause holds what prose cannot: a table, a chart, a diagram, an image, an include, a functions file or the document's settings.** It starts at column one with `:::`, its kind and its attributes. A line holding only `:::` closes it.

* **The kinds are `table`, `include`, `image`, `chart`, `diagram`, `functions` and `document`.** An unknown kind is refused.
* **The kind follows `:::` at once**, with no space between.
* **Clauses do not nest.**
* **An attribute is `name=value`, and one space separates two attributes.** A name stands at most once in a clause. An unknown name and a repeated one are refused.
* **A text value is quoted as JSON quotes a string, with JSON's escapes.** A number is decimal and bare.
* **No attribute is implied**, and there are no positional values or short forms.
* **The attributes may come in any order.** The writer writes each clause's in its own fixed order, given in that clause's section.
* **`name`, `path` and `src` are not empty.** `alt` may be empty, for an image that only decorates. An empty `caption` is refused: leave the attribute out.

```ksmd
%ksmd 2

:::picture src="a.png"
:::
```

It is refused at line 3, column 4.

```ksmd
%ksmd 2

::: include path="notes.ksmd"
:::
```

It is refused at line 3, column 5.

```ksmd
%ksmd 2

:::include path="a.ksmd" path="b.ksmd"
:::
```

It is refused at line 3, column 26.

```ksmd
%ksmd 2

:::include path=""
:::
```

It is refused at line 3, column 12.

**A table, chart, diagram, image or include clause may take `invisible="printing"`, written last.** Its block is then left out of print and PDF. The other clauses refuse it, and so does any other value.

```ksmd
%ksmd 2

:::include path="notes.ksmd" invisible="print"
:::
```

It is refused at line 3, column 30.

## How the reader reads

**The reader reads a source whole, or refuses it.** A refusal names one line and column, and the reader builds no part of the document.

**The writer writes the document back from what the reader built.** A form with two spellings saves as the one the writer chooses, and each section below names that one.

These rules hold for the cells of a table:

* **A table may have a header and no data rows.**
* **A cell's spaces are trimmed.** The writer puts one space on each side of a value, and writes an empty cell as `| |`.
* **A number has JSON's form**: no `+`, no leading zero, and a finite value. It is kept as written, so `2.50` stays `2.50`.
* **A formula is kept as written after `=`, up to 4,096 bytes.** A longer one is refused at its cell. It is checked when the tables calculate.
* **Quoted text is decoded by JSON's rules.** The writer escapes only what JSON requires.
* **A path is kept as written**, and checked when the files are found ("Paths" below).
* **A table row outside a table clause is refused.**

```ksmd
%ksmd 2

:::table name="t"
| "a" | "b" | "c" |
|   2.50   |  | "x\u0041" |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t"
| "a" | "b" | "c" |
| 2.50 | | "xA" |
:::
```

```ksmd
%ksmd 2

| "a" |
```

It is refused at line 3, column 1.

## Prose

| Structure | Source form | Limits |
| :-- | :-- | :-- |
| Heading | One to six `#`, then a space and inline text | One source line |
| Paragraph | Other text | Inline content and hard breaks |
| Unordered list | `- ` before each item | One source line per item; two spaces per nested level |
| Ordered list | `1. ` before each item | The numbers are generated; two spaces per nested level |
| Checklist item | `- [ ] ` before an open item, `- [x] ` before a ticked one | A bulleted item; it can stand among other bulleted items |
| Quote | `> ` before each line | One paragraph; its lines join as a paragraph's do |
| Divider | A line `---` | Nothing else on the line |
| Blank line | A line `\` | Nothing else on the line; each such line is one empty line on the page |
| Code block | A fence of backticks before and after literal lines | "Code blocks" below |
| Emphasis | `*text*` | No line break inside a mark |
| Strong emphasis | `**text**` | No line break inside a mark |
| Inline code | A matching run of backticks around literal text | No line break |
| Link | `[label](destination)` | Holds emphasis and inline code, not a link |
| Coloured text | `[text]{color="#c00000"}` | A link takes a colour after its destination: `[label](destination){color="#c00000"}` |
| Aligned paragraph or heading | A line `{align="center"}` straight before it | `left`, `center` or `right` |

### Headings and paragraphs

**A heading is one to six `#`, a space, and its text.** Its text is trimmed and must not be empty. Seven or more `#`, or a `#` with no space after it, is refused.

```ksmd
%ksmd 2

#Plan
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

####### Plan
```

It is refused at line 3, column 1.

**A paragraph's lines join: each line break becomes one space.** Each line's leading and trailing spaces are dropped. The writer puts a paragraph on one line, except at its hard breaks.

```ksmd
%ksmd 2

line one
line two
```

It saves as:

```ksmd
%ksmd 2

line one line two
```

**A backslash right before a line's end is a hard break.** An odd run of backslashes there is a hard break, and an even run is literal backslashes. A hard break at a paragraph's end is refused.

```ksmd
%ksmd 2

line one\
line two
```

It saves as:

```ksmd
%ksmd 2

line one\
line two
```

```ksmd
%ksmd 2

The end\
```

It is refused at line 3, column 8.

**A line inside a paragraph that starts a block is refused**: `#`, a fence, `:::`, `|` or a list marker. Put a blank line before it, or escape it ("Escapes" below).

```ksmd
%ksmd 2

Text
# Plan
```

It is refused at line 4, column 1.

**The writer leaves out spaces and tabs at a line's ends.**

**A paragraph or a heading takes its alignment from a line of braces straight before it.** The braces hold `align`, a note ("Notes" below), or both. `align` is `left`, `center` or `right`. A blank line between the braces and the text is refused.

```ksmd
%ksmd 2

{align="right"}
Right text
```

It saves as:

```ksmd
%ksmd 2

{align="right"}
Right text
```

```ksmd
%ksmd 2

{align="right"}

Right text
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

{align="across"}
Text
```

It is refused at line 3, column 1.

### Lists and checklists

**A list marker is `-`, or digits and `.`, followed by a space or the line's end.** So `-5 degrees` and `1.5 metres` stay prose.

```ksmd
%ksmd 2

-5 degrees
```

It reads as:

```text
paragraph
  text "-5 degrees"
```

* **A list runs to the next blank line, and each of its lines is an item.** A line without a marker is refused.
* **An item with no text is refused**, and so is an item that ends in a hard break.
* **Two spaces before a marker nest its item one level.** An item is nested at most one level deeper than the item before it.
* **A list nests at most 16 levels.**
* **All items at one level of one list share one marker.** Put a blank line between two lists.
* **The writer numbers every ordered item `1.`**, whatever number it was written with.

```ksmd
%ksmd 2

3. One
7. Two
  - Inner
```

It saves as:

```ksmd
%ksmd 2

1. One
1. Two
  - Inner
```

```ksmd
%ksmd 2

- One
1. Two
```

It is refused at line 4, column 1.

```ksmd
%ksmd 2

- One
Two
```

It is refused at line 4, column 1.

```ksmd
%ksmd 2

- One
    - Too deep
```

It is refused at line 4, column 5.

**A checklist item is a bulleted item with a tick box**: `- [ ] ` before an open item, and `- [x] ` before a ticked one.

```ksmd
%ksmd 2

- [ ] Buy pens
- [x] Call Sam
```

It reads as:

```text
list
  unticked item
    text "Buy pens"
  ticked item
    text "Call Sam"
```

* **Only a bulleted item takes a box.** On a numbered item, the brackets read as text in brackets, which is refused.
* **The `x` is lowercase.** An `X` is refused in the same way.
* **Text in brackets that is not a box is escaped**: `- \[ \] x`.
* **A checklist item may stand among other bulleted items**, at any level.

```ksmd
%ksmd 2

- [ ] Plan
  - [x] Ask Sam
- Notes
```

It saves as:

```ksmd
%ksmd 2

- [ ] Plan
  - [x] Ask Sam
- Notes
```

```ksmd
%ksmd 2

- [X] Call Sam
```

It is refused at line 3, column 5.

```ksmd
%ksmd 2

1. [ ] Call Sam
```

It is refused at line 3, column 6.

### Quotes, dividers and blank lines

**A quote is a paragraph whose every line starts with `> `.** Its lines join as a paragraph's do. A quote holds one paragraph, and no quote nests in another. Two quotes stand apart with a blank line between them.

```ksmd
%ksmd 2

> First line
> second line
```

It saves as:

```ksmd
%ksmd 2

> First line second line
```

```ksmd
%ksmd 2

> First line
>second line
```

It is refused at line 4, column 1.

**A divider is a line holding only `---`.** It separates two parts of a document. A line of `---` and more text is a paragraph.

**A blank line on the page is a line holding only `\`.** Each such line is one empty line on the page.

```ksmd
%ksmd 2

Before

---

\

After
```

It saves as:

```ksmd
%ksmd 2

Before

---

\

After
```

### Code blocks

**A code fence is a line of at least three backticks, with an optional language label after them.** The closing line holds the same number of backticks and nothing else.

````text
```py
total = 2 + 3
```
````

* **Everything inside is literal**, a clause and a version line included.
* **A label holds only letters, digits and `_` `-` `+` `.`.**
* **A fence with no closing line is refused at its opening line.**
* **The writer chooses the shortest fence of at least three backticks that the code does not end early.**

### Emphasis, inline code and links

**`*` marks emphasis and `**` strong emphasis.** A mark opens and closes on one line.

* **A run of `*` first closes open marks, innermost first, then opens marks that are not open.**
* **Marks nest.** A run that can neither close nor open is refused.
* **A run never closes a mark and opens the same kind at once.**
* **Only a run of three with no mark open has two readings.** Strong emphasis goes outside, unless the next run on the line can close only the other order.

```ksmd
%ksmd 2

***a** b*
```

It reads as:

```text
paragraph
  emphasis
    strong
      text "a"
    text " b"
```

```ksmd
%ksmd 2

***a* b**
```

It reads as:

```text
paragraph
  strong
    emphasis
      text "a"
    text " b"
```

```ksmd
%ksmd 2

*one
two*
```

It is refused at line 3, column 1.

**A code span ends at the next run of exactly as many backticks.** One space at each end is dropped when both ends have one. The writer chooses the shortest run that the code does not hold.

```ksmd
%ksmd 2

Use `` a`b `` here
```

It saves as:

```ksmd
%ksmd 2

Use ``a`b`` here
```

**A link is a label in brackets and a destination in parentheses straight after it.**

* **The label is not empty, and holds no link.** It may hold emphasis and inline code.
* **The destination holds no spaces or parentheses.** Write them as `%20`, `%28` and `%29`.
* **The destination starts with `https:`, `http:`, `mailto:` or `#`.** Any other is refused.

```ksmd
%ksmd 2

See [the site](https://example.org) and **this** *too*.
```

It saves as:

```ksmd
%ksmd 2

See [the site](https://example.org) and **this** *too*.
```

```ksmd
%ksmd 2

[the page](SPEC-editing-page.md)
```

It is refused at line 3, column 12.

```ksmd
%ksmd 2

[a](https://example.org/a b)
```

It is refused at line 3, column 26.

### Escapes

**A backslash escapes the ASCII punctuation mark after it, outside code.** A backslash before any other character is refused.

* **Escape a block marker to start a paragraph with it**: `\#`, `\-`, `1\.`, `\>`, `\---` or `\:::`.
* **A `{` at the start of a paragraph's line is escaped**, so it does not read as a look. Anywhere else in prose it is text.
* **The writer escapes `\`, `*`, backticks, `[` and `]` in text**, and a block marker that starts a paragraph's line.
* **A needless escape is dropped at save.**

```ksmd
%ksmd 2

\# Not a heading

\{not a look}

A \! b \* c

\--- not a divider
```

It saves as:

```ksmd
%ksmd 2

\# Not a heading

\{not a look}

A ! b \* c

--- not a divider
```

```ksmd
%ksmd 2

Price \5
```

It is refused at line 3, column 7.

## Looks

**A look is direct formatting, written in braces after what it formats.** A table cell takes every part. Text in brackets takes a colour alone, and a paragraph or a heading an alignment alone.

| Part | Written | Meaning |
| :-- | :-- | :-- |
| `color` | `"#c00000"` | The text's colour: `#` and six hex digits |
| `fill` | `"#fff2cc"` | The background's colour |
| `size` | `14`, `10.5` | The font size in points, from 6 to 72, whole or ending in `.5` |
| `align` | `"left"`, `"center"`, `"right"`, `"across"` | A cell's or a paragraph's alignment. `across` is a cell's alone |
| `wrap` | `"on"` | A cell's text breaks into lines at its column's width. Left out, the text stays on its lines |
| `format` | `"percent:1"` | A cell's own number format, as "Tables and formulas" below writes an entry |

**After the look's parts, braces may hold a note and then a link.** A note is in "Notes" below; a link in a cell is in "Tables and formulas".

* **Values are written as attributes are**: text in JSON quotes, numbers bare.
* **The writer writes the parts in the table's order, then `note`, then `link`.** It writes a colour in lower case.
* **Braces with no part are refused.**
* **A table cell writes its look after its value**: `| 120 {color="#c00000"} |`. An empty cell can carry a look alone: `| {fill="#fff2cc"} |`.
* **A `{` inside quoted text is text.**
* **Text takes a colour in brackets, and nothing else**: `[text]{color="#c00000"}`. A `{` straight after brackets is escaped.
* **`align="across"` centres a cell's value across the empty cells to its right that are `across` too.** The run stops at the first cell that holds a value or has another alignment. A column that a group hides is passed over.
* **`across` is only a look.** The value stays in its own cell, for references, ranges, sort and filter alike.
* **A paragraph or a heading refuses `across`.**

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| "Site" {link="https://example.org" note="Check with Sam" format="percent:1" wrap="on" align="right" size=10.5 fill="#FFF2CC" color="#C00000"} |
| {fill="#fff2cc"} |
| "x{y" |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| "Site" {color="#c00000" fill="#fff2cc" size=10.5 align="right" wrap="on" format="percent:1" note="Check with Sam" link="https://example.org"} |
| {fill="#fff2cc"} |
| "x{y" |
:::
```

```ksmd
%ksmd 2

[Red]{color="#C00000"} text
```

It saves as:

```ksmd
%ksmd 2

[Red]{color="#c00000"} text
```

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| {} |
:::
```

It is refused at line 5, column 3.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| {size=5} |
:::
```

It is refused at line 5, column 4.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| {color="red"} |
:::
```

It is refused at line 5, column 4.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| {wrap="off"} |
:::
```

It is refused at line 5, column 4.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| {bold="on"} |
:::
```

It is refused at line 5, column 4.

```ksmd
%ksmd 2

[Red]{fill="#c00000"} text
```

It is refused at line 3, column 6.

## Notes

**A table cell, a paragraph or a heading can hold a note: a remark for the people who read the file.** The note stands in the braces after the look's parts, and before a link.

```ksmd
%ksmd 2

{align="center" note="Is this the final title?"}
# Plan

:::table name="t"
| "a" |
| 120 {fill="#fff2cc" note="Check with Sam"} |
:::
```

It saves as:

```ksmd
%ksmd 2

{align="center" note="Is this the final title?"}
# Plan

:::table name="t"
| "a" |
| 120 {fill="#fff2cc" note="Check with Sam"} |
:::
```

* **A note is 1 to 1,000 bytes of text**, quoted as any attribute is.
* **A line break may stand in a note, written `\n`.** No other control character may.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 120 {note="Line one\nLine two"} |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 120 {note="Line one\nLine two"} |
:::
```

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 120 {note=""} |
:::
```

It is refused at line 5, column 8.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 120 {note="Tab\there"} |
:::
```

It is refused at line 5, column 8.

## The document's own settings

**A `:::document` clause sets what holds for the whole document**: the paper, the printed header and footer, and the numbers of headings and captions. It stands first in its source, before every other block, and once.

| Attribute | Sets | Left out |
| :-- | :-- | :-- |
| `paper` | `A3`, `A4`, `A5`, `B4`, `B5`, `JIS-B4`, `JIS-B5`, `letter` or `legal` | The browser's paper |
| `orientation` | `"landscape"` | Portrait |
| `header` | The text in the middle of each printed page's header | The document's name |
| `footer` | The text at the left of each printed page's footer | Nothing |
| `numbers` | The heading level that numbering starts at, 1 to 6, unquoted | No numbers |
| `table_label`, `figure_label` | The word before a table's or an image's number | `Table`, `Figure` |

* **Every attribute is optional, but the clause sets at least one.** Portrait has no spelling.
* **The writer writes the attributes in the table's order.**
* **`B4` and `B5` are the ISO sizes, 250 × 353 and 176 × 250 mm.** `JIS-B4` and `JIS-B5` are the Japanese sizes, 257 × 364 and 182 × 257 mm.
* **A header or a footer is 1 to 200 bytes of text, with no control character.** `{page}` and `{pages}` stand for the page's number and the count of pages. They are the only braces it holds.
* **A label is 1 to 200 bytes of text, with no control character and no braces.**
* **Headings number themselves from the level `numbers` names**: 1, 1.1, 1.1.1. A heading above that level has no number. The number is shown, and never stands in the heading's text.
* **A table's and an image's caption take a number by chapter, such as `表 4-12`, where headings are numbered.** The chapter is the heading at the level numbering starts at. Each chapter counts from 1 again.
* **A link whose text is `#` is a reference**: `[#](#運用モード)`. It shows the number of the heading, table or image its place names.
  * **The place is a heading's text, a table's name or caption, or an image's caption.**
  * **Without numbers, it shows that name.** A place that finds nothing shows `#?`.
* **Only the opened document's clause counts.** An included file's own clause is read, and changes nothing where it is included.

```ksmd
%ksmd 2

:::document figure_label="図" table_label="表" numbers=2 footer="No.EXAMPLE-0001 ({page}/{pages})" header="[Confidential]" orientation="landscape" paper="A3"
:::
```

It saves as:

```ksmd
%ksmd 2

:::document paper="A3" orientation="landscape" header="[Confidential]" footer="No.EXAMPLE-0001 ({page}/{pages})" numbers=2 table_label="表" figure_label="図"
:::
```

```ksmd
%ksmd 2

:::document
:::
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

Text

:::document paper="A4"
:::
```

It is refused at line 5, column 1.

```ksmd
%ksmd 2

:::document orientation="portrait"
:::
```

It is refused at line 3, column 13.

```ksmd
%ksmd 2

:::document paper="A6"
:::
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

:::document header="{date}"
:::
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

:::document numbers=7
:::
```

It is refused at line 3, column 1.

## Tables and formulas

### A table

**A `:::table` clause holds a header row of names, then data rows.** It requires `name`. A name is 1 to 255 bytes of any text but control characters, such as `Q1 sales`. Two tables of one source file cannot share a name.

* **Every row starts and ends with `|`.** A `|` outside quoted text splits two cells.
* **Every row has as many cells as the header row.** A table has at least one column, and at most 256.
* **The header row holds quoted text alone.** It names the columns, and stands outside the cell addresses.
* **There is no alignment row and no separator row.** A row such as `|---|---|` is refused.

| Cell source | What it holds |
| :-- | :-- |
| Nothing between the separators | An empty cell |
| `"Pens"`, `"0012"`, `"a\nb"` | Text, with JSON's quotes and escapes, so a text value can hold a line break |
| `12`, `-3.5`, `1e3` | A finite number, written as JSON writes a number: no `+`, and no leading zero |
| `2026-10-23` | A date: a day of the years 1 to 9999, written as ISO 8601 writes it |
| `=B1*C1`, `=sum(D1:D2)` | A formula. The file holds the formula's text, never its result |

**Text needs quotes**, so a code such as `"0012"` and a text that starts with `=` stay text. A `|` inside quotes is text.

```ksmd
%ksmd 2

:::table name="t"
| "a" | "b" | "c" | "d" |
|  | "a\nb" | 1e3 | 2026-10-23 |
| -3.5 | "0012" | =sum(A1:A2) | =A$1 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t"
| "a" | "b" | "c" | "d" |
| | "a\nb" | 1e3 | 2026-10-23 |
| -3.5 | "0012" | =sum(A1:A2) | =A$1 |
:::
```

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| Pens |
:::
```

It is refused at line 5, column 3.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 0012 |
:::
```

It is refused at line 5, column 3.

```ksmd
%ksmd 2

:::table name="t"
| "a" | "b" |
| 2 |
:::
```

It is refused at line 5, column 1.

### How a formula is written

**A formula is a cell's source after `=`.** It stays on one line, and holds at most 4,096 bytes.

| Part | What it holds |
| :-- | :-- |
| Values | Numbers, text in quotes, `true` and `false` |
| References | Cells, ranges and whole columns |
| Operators | Brackets, unary minus, `+`, `-`, `*`, `/`, `^`, `%` after a value, and `&` |
| Comparisons | `=`, `<>`, `<`, `<=`, `>` and `>=` |
| Words | `and`, `or` and `not` |
| Functions | ksmd's functions, and a document's own functions ("Your own functions" below) |

* **A number has a number cell's form without its sign**: `2.5`, `1e3`, `0.5`. A sign before it is unary minus.
* **A formula's number can also leave out the digits on one side of its point, as Excel takes it**: `1.` is 1, and `.5` is 0.5.
* **A formula's number can also start with zeros, as Excel takes it**: `007` is 7, and `00.5` is 0.5. A row number of a cell still takes no leading zero.
* **A number cell in a file takes none of these forms**: `| 1. |`, `| .5 |` and `| 007 |` are refused. Typing `1.` or `.5` on the page stores `1` or `0.5` ("Choosing and editing cells" in [`SPEC-editing-page.md`](SPEC-editing-page.md)).

```ksmd
%ksmd 2

:::table name="t"
| "Price" |
| .5 |
:::
```

It is refused at line 5, column 3.

* **A whole number can also stand in hexadecimal or in binary**: `0xFF`, `0b_0111_0001` ("Hexadecimal and binary" below).
* **A cell is capital column letters, then a row number from 1 without a leading zero**: `D1`, `AA12`. `A1` is the first data cell.
* **A `$` before the letters or the row number fixes that part for copying**: `$A$1`, `$A1`, `A$1`.
* **A range is two cells joined by `:`, with no space**: `D1:D3`. Its corners can stand in either order.
* **Column letters alone name a whole column**: `D`, or `D:F` for columns side by side. A whole column takes every data row, rows added later included. It never takes the names row.
* **Letters with a row number on one side of `:` alone do not read**: `D:F9` and `D1:F` are neither a range nor columns.
* **A reference without a table's name names the formula's own table.** `budget.D1`, `budget.D1:D3` and `budget.D` name cells of the table `budget` in the same source file, with no space around the `.`.
* **A table name that is not plain stands in quotes**: `"Q1 sales".D1`. A plain name is a lowercase letter, then lowercase letters, digits and `_`.
* **A formula cannot name a cell of another file**, nor a table of an included file.
* **`#REF!` stands where a reference lost its row or column.** The reader and the writer keep it, and it calculates as `#REF!`.
* **Function names are lowercase.** A function takes one or more arguments, separated by `,`.
* **`and`, `or`, `not`, `true` and `false` are words.** `&&` and `!` do not read. A `|` outside quotes splits the table row.
* **Spaces and tabs can stand between tokens.** A space inside a range or a reference does not read.
* **A formula nests at most 64 levels.** The formula itself is one level. Each bracket, function, unary minus and `not` adds one more.
* **A formula that does not read keeps its source.** The reader and the writer keep it as written, and it calculates as `#SYNTAX!`.

**The operators bind in this order, the tightest first:**

1. Unary minus. Before a value raised by `^`, it does not read (below).
2. `%` after a value.
3. `^`. Two in a row do not read (below).
4. `*` and `/`.
5. `+` and `-`.
6. `&`.
7. A comparison. Only one comparison stands in a row: `1 < A1 < 9` does not read. Write `1 < A1 and A1 < 9`.
8. `not`, then `and`, then `or`.

Arithmetic of one level groups from the left. Where a formula reads, the order and the grouping are Excel's. So a formula copied from Excel gives the same value, or does not read.

* **A minus right before a value raised by `^` does not read**: `-2^2`, `-A1^2` and `1+-2^2` are `#SYNTAX!`. Write `(-2)^2` or `-(2^2)`.
  * Excel reads `-2^2` as `(-2)^2`, which is 4. In mathematics it is `-(2^2)`, which is -4.
  * A minus on the power reads: `2^-1` is 0.5.
* **Two `^` in a row do not read**: `2^3^2` is `#SYNTAX!`. Write `(2^3)^2` or `2^(3^2)`.
  * Excel groups `^` from the left, so `2^3^2` is 64 there. In mathematics it groups from the right, and is 512.
* **Why ksmd refuses these two forms:** each answer surprises someone. Excel's answer surprises a reader who knows mathematics. The answer of mathematics would change a formula copied from Excel without a word. A refusal says where the formula reads two ways, and brackets settle it.
* **`0^0` is 1**, as `power(0, 0)` is. Excel gives `#NUM!`; most programming languages give 1.
* **`^` follows the rules of `power`**: 0 to a negative power is `#DIV/0!`, and a result that is no real number is `#NUM!`.
* **`%` after a value divides it by 100.** `5%` is the number 0.05, and the cell shows 0.05. A `percent` format shows it as 5% ("Number formats" below).

| Formula | Shows |
| :-- | :-- |
| `=A1+A2` | `5` |
| `=A1*A2` | `6` |
| `=A2/A1` | `1.5` |
| `=-A1` | `-2` |
| `=2+3*4` | `14` |
| `=(2+3)*4` | `20` |
| `=10-4-3` | `3` |
| `=8/4/2` | `1` |
| `=2^3` | `8` |
| `=A1^A2` | `8` |
| `=2*3^2` | `18` |
| `=2^-1` | `0.5` |
| `=-2^2` | `#SYNTAX!` |
| `=(-2)^2` | `4` |
| `=-(2^2)` | `-4` |
| `=-A1^2` | `#SYNTAX!` |
| `=1+-2^2` | `#SYNTAX!` |
| `=2^3^2` | `#SYNTAX!` |
| `=(2^3)^2` | `64` |
| `=2^(3^2)` | `512` |
| `=5%` | `0.05` |
| `=A1%` | `0.02` |
| `=50%*A1` | `1` |
| `=5%%` | `0.0005` |
| `=-5%` | `-0.05` |
| `=2^200%` | `4` |
| `=0^0` | `1` |
| `=0^-1` | `#DIV/0!` |
| `=(-1)^0.5` | `#NUM!` |
| `=B1^2` | `#VALUE!` |
| `=B1%` | `#VALUE!` |
| `=1.` | `1` |
| `=.5` | `0.5` |
| `=007` | `7` |
| `=00.5` | `0.5` |
| `=1e3` | `1000` |
| `=1E3` | `1000` |
| `=$A1+A$2` | `5` |
| `=t.A1+t.A2` | `5` |
| `=sum(A2:A1)` | `5` |
| `=1+2=3` | `true` |
| `=1<A1<9` | `#SYNTAX!` |
| `=1<A1 and A1<9` | `true` |
| `=not A1=2` | `false` |
| `=A1:A2` | `#SYNTAX!` |
| `=sum(A1 : A2)` | `#SYNTAX!` |
| `=1+` | `#SYNTAX!` |
| `=A1 % 2` | `#SYNTAX!` |
| `=A1 ~ 2` | `#SYNTAX!` |
| `=1A1` | `#SYNTAX!` |
| `=foo(1)` | `#SYNTAX!` |
| `=Sum(1)` | `#SYNTAX!` |
| `=u.A1` | `#REF!` |
| `=#REF!+1` | `#REF!` |

### Text in a formula

**Inside a formula's quotes, every character stands for itself, `\` included.** A `"` inside is written twice. Formula text has no other escape.

* **`""` alone is empty text, and `""""` is one quote.**
* **A quote that nothing closes is refused** at the place the quote opens.
* **`char(number)` writes a character that formula text cannot hold**, such as a line break: `char(10)`.
* **A table's name in quotes follows the same rule.**
* **This rule applies to a formula's text alone.** A text cell, an attribute and a note keep JSON's quotes and escapes.

| Formula | Shows |
| :-- | :-- |
| `=".\src\"` | `.\src\` |
| `="say ""hi"""` | `say "hi"` |
| `=len("""")` | `1` |
| `=len("")` | `0` |
| `=len("a"&char(10)&"b")` | `3` |

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| ="C:\ |
:::
```

It is refused at line 5, column 4.

### Values and errors

**A cell's value is empty, a number, text, a date, `true` or `false`, or an error.** A formula gives one of these, but never an empty value. A formula that names an empty cell alone shows 0.

* **Kinds never turn into each other.** Text, a date, `true` and `false` in arithmetic are `#VALUE!`, even text that looks like a number.
* **`and`, `or` and `not` take only `true` and `false`.** A number, text or a date there is `#VALUE!`.
* **Two values of different kinds are unequal.** `=` gives `false` and `<>` gives `true`. Putting them in order is `#VALUE!`.
* **An empty cell takes the kind of the other side**: 0, empty text, `false`, or a day before every date. So an empty cell equals `""`, 0 and `false`.
* **Two numbers are equal when the 15 significant digits they show agree.** `<`, `<=`, `>`, `>=` and `<>` follow the same rule.
* **`a + b` and `a - b` are exactly 0 where the two sides cancel at the 15 digits they show.** A result that does not cancel stays, however small. `sum` adds without this rule.
* **Text compares without regard to case.** The order is the sort's: the letters A to Z, then other bytes by their value.
* **`false` comes before `true`.**
* **`and` calculates its right side only when its left side is `true`, and `or` only when it is `false`.** An error or a wrong kind on the left is the result.
* **A number shows at most 15 significant digits**, without a trailing zero after the point. A number past 21 digits, or below 0.000001, shows with an exponent.

| Formula | Shows |
| :-- | :-- |
| `=A1&B1` | `#VALUE!` |
| `=B1+1` | `#VALUE!` |
| `=true+1` | `#VALUE!` |
| `=1 and true` | `#VALUE!` |
| `=B1 and true` | `#VALUE!` |
| `=B1="pens"` | `true` |
| `=B1<"pot"` | `true` |
| `="abc"="ABC"` | `true` |
| `="Z"<"é"` | `true` |
| `=B1=A1` | `false` |
| `=B1<A1` | `#VALUE!` |
| `=false<true` | `true` |
| `=true<1` | `#VALUE!` |
| `=true or 1/0` | `true` |
| `=false and 1/0` | `false` |
| `=1/0 or true` | `#DIV/0!` |
| `=0.1+0.2` | `0.3` |
| `=0.1+0.2=0.3` | `true` |
| `=0.1+0.2>0.3` | `false` |
| `=0.1+0.2-0.3` | `0` |
| `=1e-20-1e-21` | `9e-21` |
| `=1/3` | `0.333333333333333` |
| `=123456789012345678` | `123456789012346000` |
| `=0.0000001` | `1e-7` |
| `=1e21` | `1e+21` |
| `=1e300*1e300` | `#NUM!` |

**An error stands for a value that cannot be worked out.** Each kind has its own mark, since each one is fixed in a different way.

| Mark | The cause |
| :-- | :-- |
| `#VALUE!` | A value of the wrong kind: text, a date, `true` or `false` in arithmetic. Or a number or text as a condition, or two kinds put in order |
| `#DIV/0!` | A division by zero, or 0 to a negative power |
| `#NUM!` | A result too large: a number past the largest a cell holds, or text past 32,767 bytes. Or a value outside the range a function or `^` takes |
| `#REF!` | A reference to no cell: `#REF!`, a cell outside its table, or a table name that this source file does not hold |
| `#CYCLE!` | The cell depends on itself, directly or through other cells |
| `#EMPTY!` | `min`, `max`, `average` or `average_if` of no numbers |
| `#SHAPE!` | Ranges whose shapes do not fit: in a condition of `sum_if`, `count_if` or `average_if`, or in `sum_product` or `lookup` |
| `#SYNTAX!` | The formula does not read. Or a literal in a base is bad, past 2^53, or written as digit text |
| `#BLOCKED!` | A call to a name that ksmd does not have, while the document's own functions are not allowed |
| `#LIMIT!` | The calculation read 500 million cell values before this formula was finished |
| `#TIME!` | A call to a document's own function ran past 2 seconds |
| `#STOPPED!` | A document's own function stopped with a fault |
| `…` | The answer of a document's own function has not come yet |

* **An error in a cell that a formula uses is the formula's value**, `count` included.
* **Of two errors, the leftmost in the formula comes first.** In a range, the first in reading order comes first.
* **Every error also gives a reason in words.** The reason is not part of the value, and the file does not hold it.
* **A reason names what went wrong, and what to write instead where that is clear.** It names the cell or the function it is about.
* **An error carried from another cell names that cell, not its cause**: `A3 shows #DIV/0!`. A cycle keeps its own reason.
* **A formula that does not read gives its first fault from the left.**

| Formula | Shows |
| :-- | :-- |
| `=1/0` | `#DIV/0!` |
| `=A1/(A2-3)` | `#DIV/0!` |
| `=A1/0+B1` | `#DIV/0!` |
| `=B1+A1/0` | `#VALUE!` |
| `=max(1/0, B1+1)` | `#DIV/0!` |
| `=t.Z9` | `#REF!` |
| `=min(B1:B2)` | `#EMPTY!` |
| `=sum_if(A1:A2, B1="Pens")` | `#SHAPE!` |

| Formula | The reason says |
| :-- | :-- |
| `=B1+1` | B1 holds text, which arithmetic cannot use |
| `=A1&B1` | A1 holds no text, and & joins only text |
| `=1/0` | the divisor is 0 |
| `=A1/0+B1` | the divisor is 0 |
| `=1+"x"+A1` | arithmetic cannot use text, even text that looks like a number |
| `=1e300*1e300` | the number is too large for a cell |
| `=date(2026, 1, 1)+1e300` | the date falls outside the years 1 to 9999 |
| `=round(1, 16)` | round: the result is too large, or a value is outside the range it takes |
| `=#REF!` | a reference lost its cell, when its row or column was removed |
| `=t.Z9` | a reference names no cell |
| `=min(B1:B2)` | min found no numbers |
| `=sum_if(A1:A2, B1="Pens")` | the condition holds no range |
| `=sum_product(A1:A2, A1:A1)` | the two ranges must both be one column, or both one row, of the same length |
| `=foo(1)` | no function is called foo |
| `=1<A1<9` | two comparisons in a row do not read |
| `=-2^2` | a - right before a value raised by ^ reads two ways. Bracket the one meant, as (-2)^2 or -(2^2) |
| `=1+-A1^2` | a - right before a value raised by ^ reads two ways. Bracket the one meant, as (-2)^2 or -(2^2) |
| `=2^3^2` | two ^ in a row read two ways. Bracket the one meant, as (2^3)^2 or 2^(3^2) |
| `=A1 ~ 2` | ~ starts nothing a formula reads |
| `=A1 % 2` | an operator is missing before 2 |
| `=B1^2` | B1 holds text, which arithmetic cannot use |
| `=0^-1` | ^ divides by zero |
| `=(-1)^0.5` | ^: the result is too large, or a value is outside the range it takes |
| `=if(true, 1)` | the arguments do not fit if. Write if(condition, then, else) |
| `=hex_to_dec(0x100000)` | 0x100000 is already the number 1048576. Write =0x100000, or hex_to_dec("100000") |

### Functions

**ksmd's functions are listed in "Functions by name" in [`SPEC-editing-page.md`](SPEC-editing-page.md#functions-by-name)**, each with what it gives and a checked example. This section gives the rules that every function follows.

* **A number argument takes a number.** An empty cell is 0, and text, a date, `true` or `false` is `#VALUE!`.
* **A whole-number argument takes a whole number up to 2^53.** A fraction is `#NUM!`.
* **A reference alone as an argument of `sum`, `count`, `min`, `max` or `average` is a set of cells.** The function leaves out the set's empty cells, text, `true` and `false`. A date stays a date.
* **Any other argument calculates as arithmetic**, so `sum(B1+0)` is `#VALUE!` when B1 holds text.
* **`sum` and `count` of no numbers are 0.** `min`, `max` and `average` of no numbers are `#EMPTY!`.
* **An argument that holds an error is the result**, the leftmost first.
* **A call with too few or too many arguments is `#SYNTAX!`.**
* **`if(condition, then, else)` takes all three arguments, and calculates only the branch it takes.** The branch not taken must still read.
* **`round(number, num_digits)` rounds half away from zero, at the number's shortest decimal digits.** `num_digits` is a whole number from -15 to 15.
* **`round_down` cuts toward zero and `round_up` away from zero.** They cut at the 15 significant digits that the number shows.
* **`mod(number, divisor)` takes the sign of `divisor`.** It works at the 15 digits that its operands show, as `round_down` does. Two whole numbers give the exact remainder, so `mod(999999999999999, 2)` is 1.
* **`power(number, power)` with no real result, or one too large, is `#NUM!`.** `power(0, -1)` is `#DIV/0!`.
* **`name(E)` gives the name of a whole column, as text**, as the names row holds it. It takes one whole column alone, such as `name(B)` or `name(map.B)`. Any other argument is `#SYNTAX!`.

| Formula | Shows |
| :-- | :-- |
| `=sum(A1:A2)` | `5` |
| `=sum(A1:B2)` | `5` |
| `=sum(B1:B2)` | `0` |
| `=sum(B1+0)` | `#VALUE!` |
| `=count(A1:B2)` | `2` |
| `=count()` | `#SYNTAX!` |
| `=average(A1:A2)` | `2.5` |
| `=max(A1:A2, 10)` | `10` |
| `=average(B1:B2)` | `#EMPTY!` |
| `=if(A1>2, "big", "small")` | `small` |
| `=if(A1>2, 1/0, 5)` | `5` |
| `=if(A1=2, 1/0, 5)` | `#DIV/0!` |
| `=if(1, 2, 3)` | `#VALUE!` |
| `=if(true, 1)` | `#SYNTAX!` |
| `=if(true, 1, 2+)` | `#SYNTAX!` |
| `=round(2.675, 2)` | `2.68` |
| `=round(1250, -2)` | `1300` |
| `=round(-2.5, 0)` | `-3` |
| `=round(1, 16)` | `#NUM!` |
| `=round(1, 0.5)` | `#NUM!` |
| `=round_down(0.1+0.2, 1)` | `0.3` |
| `=round_down(0.99999999, 0)` | `0` |
| `=round_up(1.0000001, 0)` | `2` |
| `=mod(-1, 72)` | `71` |
| `=mod(3.3, 1.1)` | `0` |
| `=mod(0.35, 0.1)` | `0.05` |
| `=mod(1e-20, 1)` | `1e-20` |
| `=power(2, 10)` | `1024` |
| `=power(-1, 0.5)` | `#NUM!` |
| `=power(0, -1)` | `#DIV/0!` |
| `=name(B1)` | `#SYNTAX!` |
| `=name(A1:A2)` | `#SYNTAX!` |

### Your own functions

**A `:::functions` clause adds a document's own functions**, written in KSPL. Its `path` names a `.kspl` file, and its body is empty. Each `pub fn` in the file is a function that a formula calls by its name.

* **The clause takes `path` alone.** A path that does not end in `.kspl` is refused.
* **A name that ksmd has is refused**, so `sum` always means ksmd's `sum`.
* **A name that a formula cannot call is refused**, such as `Sum` or `myTax`, since formula names are lowercase.
* **Where two files give one name, the first clause's function is called.**
* **A function's parameters follow the rules for arguments in "Functions" above.**
* **Inside a condition of `sum_if`, a range reaches a document's own function whole**, never one row's cell.
* **A call shows `#BLOCKED!` while the file is not allowed, or does not build.** Until every file builds, a call to a name that ksmd does not have shows `#BLOCKED!`. After that, such a call is `#SYNTAX!`.
* **A call shows `…` while its file builds, or while its answer has not come.**
* **A call stops after 2 seconds with `#TIME!`, and a fault shows `#STOPPED!`.**

```ksmd
%ksmd 2

:::functions path="mine.kspl"
:::
```

It saves as:

```ksmd
%ksmd 2

:::functions path="mine.kspl"
:::
```

```ksmd
%ksmd 2

:::functions path="mine.txt"
:::
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

:::functions path="mine.kspl"
| 1 |
:::
```

It is refused at line 4, column 1.

### Totals by a condition

**`sum_if(values, condition)` adds the numbers in `values` on the rows where the condition holds.** `count_if` counts those numbers. `average_if` gives their average, or `#EMPTY!` where there are none.

* **The condition is an expression.** A range in it reads its cell on each row in turn. `and`, `or` and `not` join conditions.
* **`values` is a cell or a range, and can be several columns wide.** Each row adds its cells from the left, leaving out empty cells, text, `true` and `false`.
* **Every range in the condition is one column wide, and as tall as `values`.** Any other range gives `#SHAPE!`.
* **The condition holds at least one range, or the result is `#SHAPE!`.**
* **A cell alone in the condition is the same on every row**, as is a range alone as a function's argument.
* **The condition takes only `true` and `false`.** An empty result is `false`, and a number or text is `#VALUE!`.
* **The values on a row are read only where the condition holds.** An error on a row left out does not show.
* **Errors carry row by row from the top**: first the condition's, then the values' on that row from the left.

| Formula | Shows |
| :-- | :-- |
| `=sum_if(A1:A2, B1:B2="Pens")` | `2` |
| `=sum_if(A1:A2, B1:B2="ink")` | `3` |
| `=sum_if(A1:A2, not(B1:B2="Pens"))` | `3` |
| `=sum_if(A1:A2, B1:B2="Pens" and A1:A2>2)` | `0` |
| `=sum_if(A1:A2, A1:A2>average(A1:A2))` | `3` |
| `=sum_if(A1:B2, A1:A2>0)` | `5` |
| `=sum_if(A1:A2, like(B1:B2, "P*"))` | `2` |
| `=count_if(A1:A2, A1:A2>2)` | `1` |
| `=count_if(B1:B2, A1:A2>0)` | `0` |
| `=average_if(A1:A2, B1:B2="Pens" or B1:B2="Ink")` | `2.5` |
| `=average_if(A1:A2, B1:B2="Pen")` | `#EMPTY!` |
| `=sum_if(A1:A2, A1:B2>0)` | `#SHAPE!` |
| `=sum_if(A1:A2, A1:A2)` | `#VALUE!` |
| `=sum_if(A1:A2)` | `#SYNTAX!` |

### The sum of products

**`sum_product(a, b)` multiplies each cell of `a` by the cell of `b` beside it, and adds the products.**

* **`a` and `b` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A pair counts only where both its cells hold numbers.**
* **An error in either range is the result**, the first in order.

| Formula | Shows |
| :-- | :-- |
| `=sum_product(A1:A2, A1:A2)` | `13` |
| `=sum_product(A1:B1, A2:B2)` | `6` |
| `=sum_product(A1:A2, B1:B2)` | `0` |
| `=sum_product(A1:A2, A1:A1)` | `#SHAPE!` |
| `=sum_product(A1:B2, A1:B2)` | `#SHAPE!` |

### Finding a value by its key

**`lookup(key, keys, values, otherwise)` gives the value beside the first key that equals `key`.**

* **`keys` and `values` are ranges of one column, or of one row, as long as each other.** Any other shape is `#SHAPE!`.
* **A match is exact.** Text equals text without regard to case. A number equals a number that shows the same 15 digits.
* **`otherwise` is required, and is calculated only where no key matches.**
* **An error in `key` is the result.** A key cell that holds an error is passed over. A key on a cycle before the match makes the result `#CYCLE!`.

| Formula | Shows |
| :-- | :-- |
| `=lookup("ink", B1:B2, A1:A2, 0)` | `3` |
| `=lookup(3, A1:A2, B1:B2, "none")` | `Ink` |
| `=lookup("Paper", B1:B2, A1:A2, "none")` | `none` |
| `=lookup("Pens", B1:B2, A1:A2, 1/0)` | `2` |
| `=lookup(2.0000000000000001, A1:A2, B1:B2, "")` | `Pens` |
| `=lookup(2, A1:B1, A2:B2, "no")` | `3` |
| `=lookup(1/0, A1:A2, B1:B2, "")` | `#DIV/0!` |
| `=lookup(1, A1:A2, B1:B1, "")` | `#SHAPE!` |
| `=lookup("Ink", B1:B2, A1:A2)` | `#SYNTAX!` |

### Hexadecimal and binary

**`dec_to_hex` writes a whole number in hexadecimal, and `hex_to_dec` reads it back.** `dec_to_bin` and `bin_to_dec` do the same in binary. `hex_to_bin` and `bin_to_hex` go between the two.

* **Every whole number from -2^53 to 2^53 converts exactly.** A larger one, or a fraction, is `#NUM!`.
* **Without a width, a negative number takes a minus sign.**
* **A width in bits, from 1 to 53, writes two's complement.** The digits are as many as the width needs, zeros first. The width is signed, so 8 bits hold -128 to 127. A number outside the width is `#NUM!`.
* **Hexadecimal is written in capitals, and read in either case.** Text that holds anything but the base's digits is `#VALUE!`.
* **A whole number stands for its decimal digits where text is read.** An empty cell is 0.

| Formula | Shows |
| :-- | :-- |
| `=dec_to_hex(255)` | `FF` |
| `=hex_to_dec("ff")` | `255` |
| `=hex_to_dec("-ff")` | `-255` |
| `=bin_to_dec("101")` | `5` |
| `=bin_to_dec(1010)` | `10` |
| `=dec_to_bin(-5)` | `-101` |
| `=dec_to_bin(-5, 8)` | `11111011` |
| `=bin_to_dec("11111011", 8)` | `-5` |
| `=dec_to_hex(10, 16)` | `000A` |
| `=dec_to_bin(128, 8)` | `#NUM!` |
| `=dec_to_bin(5, 54)` | `#NUM!` |
| `=dec_to_hex(1.5)` | `#NUM!` |
| `=hex_to_dec("fg")` | `#VALUE!` |
| `=hex_to_dec("0xFF")` | `#VALUE!` |

**A formula can also write a whole number in a base**: `0x` and hexadecimal digits, or `0b` and binary digits.

* **The prefix is lowercase, and hexadecimal digits take either case.**
* **`_` can stand anywhere after the prefix**, doubled or last too.
* **The literal holds at most 2^53.** A larger literal does not read.
* **It takes no sign.** A minus before it is unary minus.
* **The writer keeps the literal as written.**
* **A literal does not read as the digit text of `hex_to_dec`, `bin_to_dec`, `hex_to_bin` or `bin_to_hex`**, in the argument's own brackets and arithmetic. Inside another call, it is a number as ever.
* **A cell's own value never reads as a literal.** A cell that holds `0x10` without `=` is refused.

| Formula | Shows |
| :-- | :-- |
| `=0xFF` | `255` |
| `=0x100000` | `1048576` |
| `=0b_0111_0001` | `113` |
| `=0x_f__f_` | `255` |
| `=-0x10` | `-16` |
| `=0x20000000000000` | `9007199254740990` |
| `=0x20000000000001` | `#SYNTAX!` |
| `=0X1F` | `#SYNTAX!` |
| `=0B101` | `#SYNTAX!` |
| `=0x` | `#SYNTAX!` |
| `=0b2` | `#SYNTAX!` |
| `=0xFFG` | `#SYNTAX!` |
| `=hex_to_dec(0x100000)` | `#SYNTAX!` |
| `=hex_to_dec((0x10))` | `#SYNTAX!` |
| `=hex_to_dec(dec_to_hex(0xFF))` | `255` |

### Text

**`mid`, `left`, `right`, `len` and `find` count positions from 1, in characters, not in bytes.** `a & b` joins two texts.

* **A start below 1, or a negative count, is `#NUM!`.** A count past the end takes what there is. A start past the end gives empty text.
* **`find` gives 0 where the part is missing.** Case counts in `find`.
* **A number is not text.** A number beside `&`, or as the text of `mid`, `left`, `right`, `len`, `find` or `substitute`, is `#VALUE!`.
* **An empty cell is empty text.**
* **`text(value, format)` is the one way from a number or a date to text.** Its format is an entry of "Number formats" below.
* **An empty format writes a number as a cell shows it without a format**, and a date as `2026-10-23`.
* **`value` is the one way from text to a number.** Text that writes no decimal number is `#VALUE!`.
* **Text that `&` or a function gives holds at most 32,767 bytes.** A longer result is `#NUM!`.

| Formula | Shows |
| :-- | :-- |
| `=B1&B2` | `PensInk` |
| `="No. "&5` | `#VALUE!` |
| `="No. "&text(5, "")` | `No. 5` |
| `=mid("1234 5678", 6, 4)` | `5678` |
| `=mid("かんそ", 2, 1)` | `ん` |
| `=len("かんそ")` | `3` |
| `=left("Pens", 2)` | `Pe` |
| `=len(mid("Pens", 9, 1))` | `0` |
| `=mid("Pens", 0, 1)` | `#NUM!` |
| `=mid(255, 1, 1)` | `#VALUE!` |
| `=find("n", B1)` | `3` |
| `=find("x", B1)` | `0` |
| `=find("a", "A")` | `0` |
| `=text(0.1+0.2, "")` | `0.3` |
| `=text(1234.5, "grouped:2")` | `1,234.50` |
| `=text(A1, "percent:0")` | `200%` |
| `=text(today(), "date:yyyy/mm/dd")` | `2026/10/23` |
| `=value("12.5")` | `12.5` |
| `=value("0x10")` | `#VALUE!` |
| `=substitute("a,b,c", ",", "; ")` | `a; b; c` |
| `=char(65)` | `A` |

**`like(text, pattern)` asks whether text matches a pattern.**

* **`*` stands for any run of characters, none included, and `?` for exactly one character.** Any other character stands for itself.
* **`~*`, `~?` and `~~` stand for `*`, `?` and `~` themselves.** Any other `~`, one at the end included, is `#VALUE!`.
* **The whole text must match.**
* **Case does not count for the letters A to Z alone.**
* **A number or a date as the text matches no pattern.** `true` or `false` as the text, and anything but text as the pattern, are `#VALUE!`.
* **Inside a condition of `sum_if`, a range in `like` reads its cell on each row.**

| Formula | Shows |
| :-- | :-- |
| `=like(B1, "P*")` | `true` |
| `=like(B1, "P?ns")` | `true` |
| `=like("ab", "a")` | `false` |
| `=like("pens", "PENS")` | `true` |
| `=like("É", "é")` | `false` |
| `=like("かんそ", "か?そ")` | `true` |
| `=like("a*b", "a~*b")` | `true` |
| `=like("ab", "a~b")` | `#VALUE!` |
| `=like(5, "5")` | `false` |
| `=like(true, "t*")` | `#VALUE!` |

### Number formats

**A table's `formats` attribute holds one entry per column, and sets how the column's numbers show.** A cell keeps the number it holds.

* **Each entry names its kind and its decimal places, from 0 to 9.** An entry has one spelling, with no default.
* **An empty entry is a column without a format.** `formats` stands only while some column has a format.
* **A cell can take its own format in its braces**: `| 0.125 {format="percent:1"} |`. It stands over its column's.
* **`general` is a cell's alone.** It shows the cell as calculated, over its column's format.
* **Every kind but `number` puts a `,` between each three digits.** `percent` shows the number times 100.
* **The decimal point is always `.`, and the separator `,`.**
* **A currency is three capital letters of ISO 4217.** USD, EUR, JPY, GBP, CNY, KRW, INR, CAD and AUD show their symbols. Any other code shows itself, then a no-break space.
* **A minus sign stands first, before a symbol.** A number that rounds to zero shows no minus.
* **A format rounds as `round` does.** Only the shown text is rounded.
* **Text, empty cells and errors show as they are.**
* **`date:yyyy/mm/dd` shows a date as `2026/10/23`**, and a number as calculated.

| Entry | Shows 1234.5 as | Shows -0.125 as |
| :-- | :-- | :-- |
| `number:2` | `1234.50` | `-0.13` |
| `number:0` | `1235` | `0` |
| `grouped:2` | `1,234.50` | `-0.13` |
| `grouped:0` | `1,235` | `0` |
| `percent:1` | `123,450.0%` | `-12.5%` |
| `percent:0` | `123,450%` | `-13%` |
| `currency:USD:2` | `$1,234.50` | `-$0.13` |
| `currency:EUR:0` | `€1,235` | `€0` |
| `currency:CAD:2` | `CA$1,234.50` | `-CA$0.13` |
| `currency:CNY:1` | `CN¥1,234.5` | `-CN¥0.1` |
| `currency:CHF:2` | `CHF 1,234.50` | `-CHF 0.13` |

```ksmd
%ksmd 2

:::table name="t" formats=",grouped:2"
| "a" | "b" |
| 0.125 {format="percent:1"} | 1234.5 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" formats=",grouped:2"
| "a" | "b" |
| 0.125 {format="percent:1"} | 1234.5 |
:::
```

```ksmd
%ksmd 2

:::table name="t" formats="number:2,percent:10"
| "a" | "b" |
| 2 | 3 |
:::
```

It is refused at line 3, column 37.

```ksmd
%ksmd 2

:::table name="t" formats="general"
| "a" |
| 0.125 |
:::
```

It is refused at line 3, column 28.

```ksmd
%ksmd 2

:::table name="t" formats=","
| "a" | "b" |
| 2 | 3 |
:::
```

It is refused at line 3, column 19.

### Choices

**A table's `choices` attribute holds one entry per column.** Inside an entry, `|` separates the choices.

* **A choice is 1 to 100 bytes of text**, with no `,`, `|`, `;`, `"` or `\`, and no space at either end.
* **A column holds at most 50 choices**, and no two that are equal without regard to case.
* **A choice can take colours after `;`**, written as a colour rule writes them: `Done;fill:#c6efce`.
* **`color_rows="C"` colours each whole row by the choice its column C holds.** It names a column that has choices.
* **A cell that holds a value off its column's list still reads.** The editor keeps a typed value to the list, as "Choices" in [`SPEC-editing-page.md`](SPEC-editing-page.md) says.

```ksmd
%ksmd 2

:::table name="t" choices=",Open;fill:#c6efce|Done;color:#9c0006 fill:#ffc7ce" color_rows="B"
| "id" | "state" |
| 1 | "Open" |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" choices=",Open;fill:#c6efce|Done;color:#9c0006 fill:#ffc7ce" color_rows="B"
| "id" | "state" |
| 1 | "Open" |
:::
```

```ksmd
%ksmd 2

:::table name="t" choices=",Open|open"
| "id" | "state" |
| 1 | "Open" |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" choices=",Open| Done"
| "id" | "state" |
| 1 | "Open" |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" color_rows="A"
| "id" | "state" |
| 1 | "Open" |
:::
```

It is refused at line 3, column 19.

### A link in a cell

**A text cell can link its text, in its braces after its note**: `| "Results" {note="see r" link="https://example.com/r"} |`.

* **The link takes the rules of a link in prose**: `https:`, `http:` or `mailto:`, or a `#` place, with no space or bracket.
* **Only a text cell holds a link.**

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| "Results" {link="https://example.com/r" note="see r"} |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| "Results" {note="see r" link="https://example.com/r"} |
:::
```

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| 5 {link="https://example.com/r"} |
:::
```

It is refused at line 5, column 6.

```ksmd
%ksmd 2

:::table name="t"
| "a" |
| "x" {link="ftp://example.com/r"} |
:::
```

It is refused at line 5, column 8.

### Colouring cells by their value

**A table's `rules` attribute holds one colour rule per column, or an empty entry for none.** A cell that meets its column's rule takes the rule's colours.

* **An entry is a condition, `;`, then the colours.** `<5` is below 5, `>5` above 5, `=5` or `=Done` equal to it, and `empty` an empty cell.
* **The text after `=` is 1 to 100 bytes**, with no `,`, `;`, `"`, `\` or control character, and no space at either end.
* **`color:` is the text's colour and `fill:` the background's**, one or both, in that order. A colour is `#` and six hex digits, and the writer writes it in lower case.
* **The rule reads each cell's calculated value.** It compares text without regard to case, and a number at the 15 digits it shows.
* **The rule's colours stand over the cell's own look** while the rule holds.
* **`scale;from:#ffffff to:#ffef9c` is a colour scale.** The least number takes the first fill, and the greatest the second. The numbers between take a fill between.
* **The columns that hold the same scale share one least and one greatest number.** A cell that holds no number takes no fill.
* **`rules` stands only while some column has a rule.**

```ksmd
%ksmd 2

:::table name="t" rules=",<0;color:#9c0006 fill:#FFC7CE"
| "a" | "b" |
| 2 | -1 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" rules=",<0;color:#9c0006 fill:#ffc7ce"
| "a" | "b" |
| 2 | -1 |
:::
```

```ksmd
%ksmd 2

:::table name="t" rules="=Done;fill:#c6efce,scale;from:#ffffff to:#ffef9c"
| "a" | "b" |
| "Done" | 3 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" rules="=Done;fill:#c6efce,scale;from:#ffffff to:#ffef9c"
| "a" | "b" |
| "Done" | 3 |
:::
```

```ksmd
%ksmd 2

:::table name="t" rules="<5"
| "a" |
| 2 |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" rules="<5;fill:#ffffff color:#000000"
| "a" |
| 2 |
:::
```

It is refused at line 3, column 19.

### Captions and merged columns

**A table's `caption` stands above it**: `caption="運用モード一覧"`. A caption is 1 to 200 bytes of text with no braces. It takes a number where the document numbers its headings.

**`merge="A,B"` shows a value repeated down a column once**, as merged cells look in a word processor. Each cell still holds its value.

* **A value merges with the shown row above when it shows the same text.**
* **A column merges on a row only where every merged column to its left merges too.**
* **The columns are named by their letters from the left, each once.**
* **Rows that a filter or a group hides do not count.**

```ksmd
%ksmd 2

:::table name="modes" caption="運用モード一覧" merge="A,B"
| "a" | "b" |
| 2 | "Pens" |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="modes" caption="運用モード一覧" merge="A,B"
| "a" | "b" |
| 2 | "Pens" |
:::
```

```ksmd
%ksmd 2

:::table name="modes" caption="a {b}"
| "a" |
| 2 |
:::
```

It is refused at line 3, column 23.

```ksmd
%ksmd 2

:::table name="t" merge="B,A"
| "a" | "b" |
| 2 | "Pens" |
:::
```

It is refused at line 3, column 19.

### Groups of rows and columns

**A table's `groups` attribute holds its groups of data rows and of columns**, and whether each one is hidden.

* **A row entry names data rows from 1**: `rows 2-4`, or `rows 7` for one row.
* **A column entry names columns by their letters**: `columns C-H`, or `columns C` for one.
* **` closed` after an entry marks a hidden group.**
* **The rows' entries stand from the top, then the columns' from the left.** An outer group stands before the groups it holds. `, ` separates the entries.
* **A group holds another group whole, or shares no row with it.** Two groups never hold the same rows.
* **A row or a column stands in at most 8 groups.**
* **Hidden rows still count in a formula.**

```ksmd
%ksmd 2

:::table name="t" groups="rows 1-3, rows 2 closed, columns B-C closed"
| "a" | "b" | "c" |
| 1 | | |
| 2 | | |
| 3 | | |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" groups="rows 1-3, rows 2 closed, columns B-C closed"
| "a" | "b" | "c" |
| 1 | | |
| 2 | | |
| 3 | | |
:::
```

```ksmd
%ksmd 2

:::table name="t" groups="rows 2, rows 1-2"
| "a" |
| 1 |
| 2 |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" groups="rows 1-2, rows 2-3"
| "a" |
| 1 |
| 2 |
| 3 |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" groups="rows 1-3"
| "a" |
| 1 |
| 2 |
:::
```

It is refused at line 3, column 19.

### Column widths and row heights

**A table's `char_widths` attribute gives each column a width in characters**: `char_widths="12,,8.5"`.

* **An entry is 0.5 to 255, with at most one decimal place.** An empty entry is a column that fits its text.
* **A character is the width of the digit 0 in the table's font.**
* **The table is as wide as its columns, not as wide as the window.**
* **`widths` is refused**, with a message that names `char_widths`.

**A table's `heights` attribute gives each data row a height in points**: `heights=",30"`.

* **An entry is a whole number from 6 to 409**, or empty for a row that fits its lines.
* **A height is exact.** Text taller than its row is cut.

**Each attribute stands only while some column has a width, or some row a height.**

```ksmd
%ksmd 2

:::table name="t" char_widths="12.0,,8.5" heights=",30"
| "a" | "b" | "c" |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="t" char_widths="12,,8.5" heights=",30"
| "a" | "b" | "c" |
| 1 | 2 | 3 |
| 4 | 5 | 6 |
:::
```

```ksmd
%ksmd 2

:::table name="t" char_widths="8.55"
| "a" |
| 1 |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" heights="12.5"
| "a" |
| 1 |
:::
```

It is refused at line 3, column 19.

### Filters

**A table's `filter` attribute keeps which rows the page shows**, with one entry per column.

| A column's entry | The rows it shows |
| :-- | :-- |
| Nothing | Every row |
| `in:` and values separated by `\|` | Rows whose cell shows one of the values. An empty value stands for an empty cell |
| `out:` and values separated by `\|` | Rows whose cell shows none of the values |
| `is:`, `not:` or `contains:`, and a value | Rows whose cell shows that text, any other text, or text that holds it |
| `above:` or `below:`, and a value | Rows whose number is greater or less. Text compares as text, and an empty cell meets neither |
| `empty`, `filled` | Rows whose cell is empty, or holds a value |

* **A value is the text the cell shows, in lower case.** The comparison does not regard case.
* **`%25`, `%2C` and `%7C` stand for `%`, `,` and `|`.** Any other `%` is refused.
* **An entry holds at most 65,536 bytes.**
* **`filter` stands only while some column has an entry.**
* **The file keeps every row.** A filter hides rows on the page and on paper alone.

```ksmd
%ksmd 2

:::table name="tasks" filter="in:open|in progress|,,above:100"
| "state" | "who" | "hours" |
| "Open" | "Ana" | 120 |
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="tasks" filter="in:open|in progress|,,above:100"
| "state" | "who" | "hours" |
| "Open" | "Ana" | 120 |
:::
```

```ksmd
%ksmd 2

:::table name="t" filter="in:X"
| "a" |
| "x" |
:::
```

It is refused at line 3, column 19.

```ksmd
%ksmd 2

:::table name="t" filter="is:x,,"
| "a" |
| "x" |
:::
```

It is refused at line 3, column 19.

### How tables calculate

**A calculation reads the document and one input: the date the document was opened.** It reads no file and no clock. It calculates every table of a source file together.

* **A cell calculates when a formula first needs it**, so the order of the rows does not matter.
* **A cell that is reached again while it calculates is on a cycle.** Every cell on the cycle shows `#CYCLE!`, and the error carries into the cells that use them.
* **Only what is calculated is followed.** A cell named in a branch that `if` does not take is not reached. So is a side that `and` or `or` skips.
* **One calculation reads at most 500 million cell values.** Past the limit, each formula not yet finished shows `#LIMIT!`. A formula finished before keeps its value.
* **A condition of `sum_if`, `count_if` or `average_if` calculates once for each row of its values.**

### Dates

**A date is a value of its own: a day, written `2026-10-23` and shown so.** A cell that holds a bare `2026-10-23` holds a date. A quoted `"2026-10-23"` is text.

* **A date plus or minus a whole number of days is a date.** A date minus a date is the days between them.
* **Any other arithmetic on a date is `#VALUE!`.** A day outside the years 1 to 9999 is `#NUM!`.
* **Dates compare with dates.** A date and a value of another kind are unequal, and putting them in order is `#VALUE!`.
* **`date(year, month, day)` makes a date.** A day that does not exist is `#NUM!`.
* **`year`, `month` and `day` give a date's parts as numbers.**
* **`min` and `max` of dates give the earliest and the latest, and `count` counts them.** `sum` and `average` of a date are `#VALUE!`, and so is `min` of dates and numbers together.
* **A date is no number literal in a formula.** `=2026-10-23` is a subtraction.

| Formula | Shows |
| :-- | :-- |
| `=date(2026, 10, 23)+7` | `2026-10-30` |
| `=date(2026, 10, 23)-date(2026, 1, 1)` | `295` |
| `=date(2024, 2, 29)` | `2024-02-29` |
| `=date(2026, 2, 29)` | `#NUM!` |
| `=date(2026.5, 1, 1)` | `#NUM!` |
| `=date(9999, 12, 31)+1` | `#NUM!` |
| `=date(2026, 1, 1)+1e300` | `#NUM!` |
| `=day(date(2026, 2, 1)-1)` | `31` |
| `=year(B1)` | `#VALUE!` |
| `=date(2026, 1, 1)<date(2026, 1, 2)` | `true` |
| `=max(today(), date(2027, 1, 1))` | `2027-01-01` |
| `=min(date(2026, 1, 5), date(2026, 3, 1))` | `2026-01-05` |
| `=count(A1:A2, B1:B2, today())` | `3` |
| `=min(today(), 5)` | `#VALUE!` |
| `=sum(today())` | `#VALUE!` |
| `=2026-10-23` | `1993` |

### Today's date

**`today()` gives the date the document was opened.** It stays the same while the document is open.

* **An included document calculates with the date of the document that includes it.**
* **`today()` is a date**, so `today() - E1` gives the days since E1.
* **`today` takes no argument.**

| Formula | Shows |
| :-- | :-- |
| `=today()` | `2026-10-23` |
| `=today()-7` | `2026-10-16` |
| `=today()+0.5` | `#VALUE!` |
| `=today()+today()` | `#VALUE!` |
| `=year(today())` | `2026` |
| `=today()<date(2027, 1, 1)` | `true` |
| `=today()="2026-10-23"` | `false` |
| `=today()<1` | `#VALUE!` |
| `=text(today(), "")` | `2026-10-23` |
| `=today(1)` | `#SYNTAX!` |

## Charts

**A `:::chart` clause draws a table's calculated columns as bars or as lines.** It names the table, the column whose values label each bar or point, and the columns drawn.

* **`table`, `kind`, `labels` and `values` are required, and `title` is not.**
* **`kind` is `bar` or `line`.**
* **`values` names 1 to 8 columns, separated by `,`.**
* **The writer writes `table`, `kind`, `labels`, `values`, `by`, `from`, `to`, `title`, then `invisible`.**

```ksmd
%ksmd 2

:::table name="budget"
| "month" | "rent" | "food" |
| "Oct" | 800 | 300 |
:::

:::chart title="Spending by month" values="rent,food" labels="month" kind="bar" table="budget"
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="budget"
| "month" | "rent" | "food" |
| "Oct" | 800 | 300 |
:::

:::chart table="budget" kind="bar" labels="month" values="rent,food" title="Spending by month"
:::
```

**`by="rows"` draws rows instead, as a burn-up chart of a plan whose months stand across.** `values` then names rows by their text in the `labels` column. The columns from `from` to `to` are the points, and both are required.

```ksmd
%ksmd 2

:::table name="plan"
| "item" | "Oct" | "Nov" |
| "plan total" | 1 | 2 |
:::

:::chart to="Nov" from="Oct" by="rows" values="plan total" labels="item" kind="line" table="plan"
:::
```

It saves as:

```ksmd
%ksmd 2

:::table name="plan"
| "item" | "Oct" | "Nov" |
| "plan total" | 1 | 2 |
:::

:::chart table="plan" kind="line" labels="item" values="plan total" by="rows" from="Oct" to="Nov"
:::
```

* **A row is found by its text when the chart is drawn**: the first row that holds it.
* **A name finds the first column of that name.**
* **A name that names nothing is kept as written**, and the chart says what is missing.
* **A cell that holds no number leaves a gap.** The axis starts at zero, so a bar's height is its value.
* **The chart holds no values of its own.**

```ksmd
%ksmd 2

:::table name="budget"
| "month" | "rent" |
| "Oct" | 800 |
:::

:::chart table="budget" kind="pie" labels="month" values="rent"
:::
```

It is refused at line 8, column 25.

```ksmd
%ksmd 2

:::table name="budget"
| "month" | "rent" |
| "Oct" | 800 |
:::

:::chart table="budget" kind="bar" labels="month"
:::
```

It is refused at line 8, column 1.

## Shapes over an image or a chart

**Rectangles, arrows, lines and pen lines can be drawn over an image or a chart, to point at a part of it.** Each shape is a `draw` line in the clause's body, with attributes as a clause's.

```ksmd
%ksmd 2

:::image src="build.png" alt="The build window"
draw shape="rect" from="120,40" to="420,120" text="Press Build here"
draw color="#1f5fbf" to="430,110" from="460,200" shape="arrow"
draw shape="pen" points="10,20 14,25 30,22"
:::
```

It saves as:

```ksmd
%ksmd 2

:::image src="build.png" alt="The build window"
draw shape="rect" from="120,40" to="420,120" text="Press Build here"
draw shape="arrow" from="460,200" to="430,110" color="#1f5fbf"
draw shape="pen" points="10,20 14,25 30,22"
:::
```

* **`shape` is `rect`, `arrow`, `line` or `pen`.** For the first three, `from` and `to` are its two ends. A rectangle's ends are two corners, and an arrow points at `to`.
* **A pen line keeps its `points`**: 2 to 500 points, one space apart. It takes a `color`, and nothing else.
* **A point is in the picture's own pixels, from its upper left corner.** A chart's frame is 640 by 300 pixels.
* **A coordinate is a whole number from 0 to 20,000**, written without a leading zero.
* **`color` is `#` and six lowercase hex digits.** Left out, the shape takes the page's red.
* **Only a rectangle holds `text`: one line of 1 to 200 bytes**, written at its upper left corner.
* **One image or chart holds at most 100 shapes.**
* **The writer writes `shape`, `from`, `to`, `points`, `color`, then `text`.**

```ksmd
%ksmd 2

:::image src="a.png" alt="A window"
draw shape="arrow" from="1,1" to="5,5" color="#1F5FBF"
:::
```

It is refused at line 4, column 40.

```ksmd
%ksmd 2

:::image src="a.png" alt="A window"
draw shape="line" from="1,1" to="5,5" text="Here"
:::
```

It is refused at line 4, column 39.

```ksmd
%ksmd 2

:::image src="a.png" alt="A window"
draw shape="rect" from="01,1" to="5,5"
:::
```

It is refused at line 4, column 19.

## Diagrams

**A `:::diagram` clause holds a drawing area of shapes and the arrows between them.** A chart of screens and the keys that move between them is one.

```ksmd
%ksmd 2

:::diagram caption="Moving between screens" size="800,400"
box id="menu" at="40,40" size="200,120" text="MENU\n1.SET\n2.END" font="mono"
diamond id="ask" at="320,60" size="120,80" text="Save?"
note id="tip" at="320,200" size="160,50" text="Yes saves"
arrow from="menu" to="ask" text="[OK] pressed"
line from="tip" to="ask" via="380,180"
:::
```

It saves as:

```ksmd
%ksmd 2

:::diagram size="800,400" caption="Moving between screens"
box id="menu" at="40,40" size="200,120" text="MENU\n1.SET\n2.END" font="mono"
diamond id="ask" at="320,60" size="120,80" text="Save?"
note id="tip" at="320,200" size="160,50" text="Yes saves"
arrow from="menu" to="ask" text="[OK] pressed"
line from="tip" to="ask" via="380,180"
:::
```

* **The clause takes `size`, which is required, and `caption`.** `size` is a width and a height from 50 to 20,000 pixels.
* **A shape is `box`, `diamond`, `start`, `end`, `group` or `note`.** A start is a filled dot and an end a ringed one. A group is a dashed frame whose text is its title.
* **A shape needs `id`, `at` and `size`.** `at` and `size` place it in the diagram's own pixels, and it stands inside the diagram's `size`.
* **An `id` is 1 to 32 bytes of letters, digits, `_` and `-`**, unique in its diagram.
* **A shape's `text` is 1 to 2,000 bytes.** It may hold lines, written `\n`.
* **`font="mono"` gives a shape's text a fixed-width font.** `color` and `fill` are `#` and six lowercase hex digits.
* **An arrow or a line names the two different shapes it joins, by `from` and `to`.**
* **An arrow's or a line's `text` is one line of 1 to 2,000 bytes.** `via` lists up to 20 points it bends at, inside the diagram.
* **The shapes come first, then the arrows and lines.** `from` and `to` name only shapes on lines above.
* **One diagram holds at most 1,000 shapes and 2,000 arrows and lines.**
* **`caption` is one line of 1 to 2,000 bytes, numbered as an image's caption is.** A reference can name it.
* **The layout is the author's.** ksmd places nothing itself.
* **The writer writes `size`, `caption` and `invisible`; then each shape's `id`, `at`, `size`, `text`, `font`, `color` and `fill`; then each arrow's `from`, `to`, `text`, `color` and `via`.**

```ksmd
%ksmd 2

:::diagram size="800,400"
arrow from="a" to="b"
:::
```

It is refused at line 4, column 7.

```ksmd
%ksmd 2

:::diagram size="800,400"
box id="a" at="0,0" size="10,10"
box id="b" at="20,0" size="10,10"
arrow from="a" to="b"
box id="c" at="40,0" size="10,10"
:::
```

It is refused at line 7, column 1.

```ksmd
%ksmd 2

:::diagram size="800,400"
box id="a.b" at="0,0" size="10,10"
:::
```

It is refused at line 4, column 5.

```ksmd
%ksmd 2

:::diagram size="40,400"
:::
```

It is refused at line 3, column 12.

```ksmd
%ksmd 2

:::diagram size="800,400"
box id="a" at="700,0" size="200,10"
:::
```

It is refused at line 4, column 12.

## Includes and images

**An include clause shows another `.ksmd` file's blocks in its place.** It has only `path` and an empty body. A document never includes itself.

```ksmd
%ksmd 2

:::include path="notes.ksmd"
Text
:::
```

It is refused at line 4, column 1.

**An image clause requires `src` and `alt`, and permits `caption` and `width`.** Its body holds only the shapes drawn over it ("Shapes over an image or a chart" above).

* **An image is a local PNG or JPEG file.** The file's bytes decide its format, not its name. SVG, a remote image, an executable format and a data URL are refused.
* **`width` is the image's share of the text width: `width="40%"`, a whole number from 1 to 100.** Its height follows, so the picture keeps its shape.
* **Without `width`, the image fits the text width** as far as its pixels allow.
* **Images next to each other share a row while each has a width and the widths add up to 100% or less.**
* **`scale` is refused**, with a message that names `width`.
* **The writer writes `src`, `alt`, `caption`, `width`, then `invisible`.**

```ksmd
%ksmd 2

:::image width="40%" caption="The window" alt="The build window" src="build.png"
:::
```

It saves as:

```ksmd
%ksmd 2

:::image src="build.png" alt="The build window" caption="The window" width="40%"
:::
```

```ksmd
%ksmd 2

:::image src="a.png"
:::
```

It is refused at line 3, column 1.

```ksmd
%ksmd 2

:::image src="a.png" alt="A window" width="0%"
:::
```

It is refused at line 3, column 37.

```ksmd
%ksmd 2

:::image src="a.png" alt="A window" caption=""
:::
```

It is refused at line 3, column 37.

### Paths

**A document opens inside a workspace: a folder the person opens.** Every source and image the document reaches stays inside it. The local server refuses a path that leaves it ("Where it listens" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md#where-it-listens)).

**A path is read from the folder of the source that holds it**, for includes and images alike.

**A path has one spelling.** `/` separates folders. Any `..` segments come first, and each climbs one folder from the holding file's folder. The reader refuses every other form:

| Written | Answer |
| :-- | :-- |
| `notes.ksmd` | `plans/notes.ksmd` |
| `sub/notes.ksmd` | `plans/sub/notes.ksmd` |
| `../notes.ksmd` | `notes.ksmd` |
| `../shared/logo.png` | `shared/logo.png` |
| `../../notes.ksmd` | refused |
| `/notes.ksmd` | refused |
| `C:/notes.ksmd` | refused |
| `https://example.org/a.ksmd` | refused |
| `mailto:a@example.org` | refused |
| `//server/share/a.ksmd` | refused |
| `a\b.ksmd` | refused |
| `./a.ksmd` | refused |
| `a//b.ksmd` | refused |
| `a/../b.ksmd` | refused |
| `..` | refused |
| `notes.ksmd.` | refused |
| `notes .ksmd ` | refused |
| `a/b:c.ksmd` | refused |
| `CON` | refused |
| `con.ksmd` | refused |

| What is refused | Rows above |
| :-- | :-- |
| An absolute path, or a drive | `/notes.ksmd`, `C:/notes.ksmd` |
| A network location | `https://…`, `mailto:…`, `//server/share/…` |
| `\` between folders | `a\b.ksmd` |
| A second spelling of a shorter path | `./a.ksmd`, `a//b.ksmd`, `a/../b.ksmd` |
| A folder, not a file | `..` alone |
| A climb out of the workspace | `../../notes.ksmd` from `plans` |
| A name that Windows reads as another file or a device: a final `.` or space, a `:`, a device name | `notes.ksmd.`, `a/b:c.ksmd`, `CON`, `con.ksmd` |

* **A path is refused where any folder or file along it is a link**, even a link that stays inside. The local server makes this check.
* **Nothing is created for a missing file.** An include or an image whose file is absent is a problem at its clause.

### The assembled view

**A document's view holds its own blocks, and in each include's place the included blocks.** Each source is read once.

* **Each include of a file shows it once more.** A file included twice is shown twice, which is not a cycle.
* **A cycle is an include of a source that already includes it, through the includes now open.**
* **At most 16 files stand on that chain**, the opened document included.
* **Two sources are the same file when their paths from the root are equal.** On a file system that ignores case, `Notes.ksmd` and `notes.ksmd` are then two sources.
* **Only the opened document's own failure stops it opening.** An include, an image or a functions clause that fails is a problem at its clause, and the rest of the view opens. A save keeps the clause.
* **A problem names the include clauses that lead to it**, innermost first.
* **An image's path must name a regular file when the view is built.** Its format and pixels are checked when the image is shown.

| What fails | Where its problem points |
| :-- | :-- |
| A refused path, a missing or unreadable file, a cycle, the depth limit or a view limit | The include, image or functions clause |
| A source the reader refuses | Its own line and column; the clause that includes it leads the chain |

**In this workspace, one file is included twice, two files include each other, and one includes itself:**

```ksmd top.ksmd
%ksmd 2

Top

:::include path="parts/one.ksmd"
:::

:::include path="parts/one.ksmd"
:::
```

```ksmd parts/one.ksmd
%ksmd 2

One

:::include path="../end.ksmd"
:::
```

```ksmd end.ksmd
%ksmd 2

End
```

```ksmd loop.ksmd
%ksmd 2

Loop

:::include path="a.ksmd"
:::
```

```ksmd a.ksmd
%ksmd 2

A

:::include path="b.ksmd"
:::
```

```ksmd b.ksmd
%ksmd 2

B

:::include path="a.ksmd"
:::
```

```ksmd self.ksmd
%ksmd 2

Self

:::include path="self.ksmd"
:::
```

| Opened | Shows | Problem at | The reason says |
| :-- | :-- | :-- | :-- |
| `top.ksmd` | `Top, One, End, One, End` | none | |
| `parts/one.ksmd` | `One, End` | none | |
| `loop.ksmd` | `Loop, A, B` | `b.ksmd:5:1 < a.ksmd:5:1 < loop.ksmd:5:1` | closes a cycle |
| `a.ksmd` | `A, B` | `b.ksmd:5:1 < a.ksmd:5:1` | closes a cycle |
| `self.ksmd` | `Self` | `self.ksmd:5:1` | closes a cycle |

**In this workspace, each problem stays at its clause, and the rest of the view opens:**

```ksmd missing.ksmd
%ksmd 2

Before

:::include path="gone.ksmd"
:::

After
```

```ksmd deep.ksmd
%ksmd 2

Deep

:::include path="sub/mid.ksmd"
:::
```

```ksmd sub/mid.ksmd
%ksmd 2

Mid

:::include path="gone.ksmd"
:::
```

```ksmd outside.ksmd
%ksmd 2

Out

:::include path="../away.ksmd"
:::
```

```ksmd picture.ksmd
%ksmd 2

Picture

:::image src="none.png" alt="Nothing"
:::
```

```ksmd wrong.ksmd
%ksmd 2

Wrong

:::include path="bad.ksmd"
:::
```

```ksmd bad.ksmd
%ksmd 2

#bad
```

| Opened | Shows | Problem at | The reason says |
| :-- | :-- | :-- | :-- |
| `missing.ksmd` | `Before, After` | `missing.ksmd:5:1` | no file stands at this path |
| `deep.ksmd` | `Deep, Mid` | `sub/mid.ksmd:5:1 < deep.ksmd:5:1` | no file stands at this path |
| `outside.ksmd` | `Out` | `outside.ksmd:5:1` | climbs out of the workspace |
| `picture.ksmd` | `Picture` | `picture.ksmd:5:1` | no file stands at this path |
| `wrong.ksmd` | `Wrong` | `bad.ksmd:3:1 < wrong.ksmd:5:1` | a heading is one to six '#' |
| `bad.ksmd` | refused | `bad.ksmd:3:1` | a heading is one to six '#' |

### Table names across includes

**A table name belongs to its source file.** Two files can each hold a table named `budget`. A formula names only the tables of its own source. A table in a file included twice shows the same values in both places.

**In this workspace, `top.ksmd` and `part.ksmd` each hold a table named `budget`:**

```ksmd top.ksmd
%ksmd 2

:::table name="budget"
| "n" |
| 1 |
:::

:::include path="part.ksmd"
:::

:::table name="t"
| "n" |
| =budget.A1 |
:::
```

```ksmd part.ksmd
%ksmd 2

:::table name="budget"
| "n" |
| 2 |
:::

:::table name="t"
| "n" |
| =budget.A1 |
:::
```

```ksmd twice.ksmd
%ksmd 2

:::include path="part.ksmd"
:::

:::include path="part.ksmd"
:::
```

```ksmd lone.ksmd
%ksmd 2

:::include path="part.ksmd"
:::

:::table name="t"
| "n" |
| =budget.A1 |
:::
```

| Opened | Shows | Problem at | The reason says |
| :-- | :-- | :-- | :-- |
| `top.ksmd` | `1, 2, 2, 1` | none | |
| `twice.ksmd` | `2, 2, 2, 2` | none | |
| `lone.ksmd` | `2, 2, #REF!` | none | |

**A functions clause in an included file gives its functions to the whole page**, the parent's tables among them.

* **The clauses count in the order the page shows them**, the included ones in their place.
* **Where two files give one name, the first clause on the page is called.**

## Copying as Markdown

**The editing page's File ▸ Copy as Markdown puts the whole document on the clipboard as Markdown**, as GitHub reads it. A paste into another program then keeps the headings, lists, links and tables. The command is in "Opening and saving" in [`SPEC-editing-page.md`](SPEC-editing-page.md#opening-and-saving).

**`ksmd --markdown <file>` prints the same Markdown**, with no browser. The command is "Printing as Markdown" in [`SPEC-commands.md`](SPEC-commands.md#printing-as-markdown).

| A part of the document | The Markdown it gives |
| :-- | :-- |
| A heading, a paragraph, a quote, a divider | `#` to `######` and a space; the text; `> ` before each line; `---` |
| Strong emphasis, emphasis, inline code, a link | `**text**`, `*text*`, backticks as the file writes them, `[label](destination)` |
| A hard break | `\` at the line's end |
| A list item | `- `, `1. `, `- [ ] ` or `- [x] `, then its text |
| A code block | A fence of backticks and its label. The fence is at least three, and longer than any run of backticks inside |
| A table | Its caption as a paragraph, then a pipe table of the values its cells show |
| An image | `![alt](src)`, then its caption as a paragraph |
| A chart, a diagram, an include | One line in emphasis that says it is not copied |
| A blank line, the document's settings, a functions clause | Nothing |

**Text reads back as the same text.** A backslash goes before each character that Markdown would read as markup:

* **`\`, a backtick, `*`, `[`, `]`, `~` and `|`, wherever they stand.**
* **`_`, unless a letter or a digit stands on each side of it**, so `a_b` stays as it is.
* **`<` before a letter, `/`, `!` or `?`**, and `&` before a character reference such as `&amp;`.
* **A block marker at a line's start**: `#`, `>`, `-` or `+` before a space, a line of `=`, and the `.` or `)` after a number.
* **A heading's last `#`, and `!` straight before a link.**

**Spaces at a mark's inner edge stand outside it**, since Markdown opens and closes a mark only next to text. Spaces at a line's start and end are left out, as the file leaves them out.

Caution: **Strong or emphasised text that Markdown cannot close where it stands shows its asterisks.** One case is strong text that ends in punctuation straight before a letter, as in `**a.**b`.

**Looks are not copied.** Colours, alignment, sizes, notes and column widths give nothing, and coloured text gives its text alone.

**A list keeps its nesting and its kinds of item.**

* **Every numbered item is written `1.`**, and Markdown numbers the items.
* **A nested item is indented to the text of the item above it**: two spaces under `- `, and three under `1. `.
* **A list straight after another list takes the other markers: `*` and `1)` after `-` and `1.`, and `-` and `1.` after `*` and `1)`.** Markdown would otherwise join the two lists into one.

**A table gives what the page shows.**

* **Each cell gives its shown value**: a number in its format, a date, `true` or `false`, or an error's mark. A formula is not kept.
* **The column names make the header row**, and a row of `---` follows them.
* **A line break in a cell becomes `<br>`**, since a row of a pipe table stands on one line.
* **Every row and every column is written, also one that a filter or a closed group hides.** Markdown cannot hide a row.
* **A merged column gives its value in every row**, as Markdown has no merged cells.
* **A cell's link holds the text that the cell shows.**

**An image gives its path as the document writes it**, relative to the document. The picture is not on the clipboard, and the shapes drawn over it give nothing.

**A chart, a diagram or an include gives one line**, so that a reader sees that something is missing:

* **A chart**: `*Not copied: the chart "Spending".*` with its title, or `*Not copied: a chart.*` without one.
* **A diagram**: `*Not copied: the diagram "Flow".*` with its caption, or `*Not copied: a diagram.*` without one.
* **An include**: `*Not copied: the included file "notes.ksmd".*` with its path as written.

```ksmd
%ksmd 2

# Plan for C\#

Some **bold**, *soft*, `code` and [the site](https://example.org).\
\# Not a heading, a_b, _c_ and [red]{color="#c00000"} words.

1\. Not a list, <b>, &amp;, R&D, 1 | 2 and ~x~.

Hello![x](https://example.org) and** spaced **words.

> A quote
```

It copies as Markdown:

```markdown
# Plan for C\#

Some **bold**, *soft*, `code` and [the site](https://example.org).\
\# Not a heading, a_b, \_c\_ and red words.

1\. Not a list, \<b>, \&amp;, R&D, 1 \| 2 and \~x\~.

Hello\![x](https://example.org) and **spaced** words.

> A quote
```

```ksmd
%ksmd 2

1. First
  - [ ] Open
  - [x] Done
1. Second

- Next list
```

It copies as Markdown:

```markdown
1. First
   - [ ] Open
   - [x] Done
1. Second

* Next list
```

```ksmd
%ksmd 2

:::table name="costs" caption="Costs" formats=",grouped:2," merge="A" groups="rows 2 closed"
| "item" | "cost" | "note" |
| "Pens | ink" | 1234.5 | "a\nb" |
| "Pens | ink" | =B1*2 | "Results" {link="https://example.com/r"} |
| "Ink" | =1/0 | 2026-10-23 |
:::

:::chart table="costs" kind="bar" labels="item" values="cost" title="Spending"
:::

:::include path="notes.ksmd"
:::

:::diagram size="200,100"
box id="a" at="20,20" size="50,50"
:::
```

It copies as Markdown:

```markdown
Costs

| item | cost | note |
| --- | --- | --- |
| Pens \| ink | 1,234.50 | a<br>b |
| Pens \| ink | 2,469.00 | [Results](https://example.com/r) |
| Ink | #DIV/0! | 2026-10-23 |

*Not copied: the chart "Spending".*

*Not copied: the included file "notes.ksmd".*

*Not copied: a diagram.*
```

````ksmd
%ksmd 2

:::document numbers=1
:::

```kspl
x: = 1
```

---

\

:::image src="shots/build window.png" alt="The build window" caption="The window"
draw shape="rect" from="120,40" to="420,120"
:::
````

It copies as Markdown:

````markdown
```kspl
x: = 1
```

---

![The build window](<shots/build window.png>)

The window
````

## Limits

**A source past a limit of this table is refused when read.** A diagram's, a drawing's and the settings' own limits are in their sections.

| Resource | Limit |
| :-- | :-- |
| One source file | 8 MiB of UTF-8 |
| Blocks in one source | 100,000 |
| List nesting | 16 levels |
| One table | 256 columns, 10,000 data rows, 100,000 cells counting the header |
| A colour rule's text | 100 bytes |
| A filter's entry for one column | 65,536 bytes |
| One formula | 4,096 bytes, in a file as in an edit, and 64 levels of nesting |
| Text that `&` or a function gives | 32,767 bytes; past it, `#NUM!` |
| `round`'s places | -15 to 15 |
| Cell values read in one calculation | 500 million; past it, each formula not yet calculated shows `#LIMIT!` |
| Include depth | 16 files on the chain of includes |
| Assembled view | 64 MiB of source text and 200,000 blocks, counting each repeated include |
| One decoded image | 16 million pixels |

* **A formula nested deeper than 64 levels calculates as `#SYNTAX!`.** A calculation error is a cell's value, and does not stop a save.
* **The view counts a source's text when the source is read, refused or not.** It counts it again at each later include of it.
* **An include that would pass a view limit is a problem at its clause**, found before its blocks join the view.

## Checking a file

**`ksmd --check <file>` prints whether ksmd refuses a file, and what each formula calculates.** Its options, its output and its exit codes are "Checking a file" in [`SPEC-commands.md`](SPEC-commands.md#checking-a-file). The rows below show what it prints for a few files.

**In this workspace, `report.ksmd` includes `budget.ksmd`, and a file that includes a missing one:**

```ksmd budget.ksmd
%ksmd 2

:::table name="t"
| "Item" | "Price" | "Count" | "Total" |
| "Pens" | 2 | 3 | =B1*C1 |
| "Ink" | 4 | 0 | =B2/C2 |
| =A1&" each" | =today() | =B1>1 | =sum(D1:D2) |
:::
```

```ksmd report.ksmd
%ksmd 2

:::include path="budget.ksmd"
:::

:::include path="parts/notes.ksmd"
:::
```

```ksmd parts/notes.ksmd
%ksmd 2

:::include path="gone.ksmd"
:::
```

```ksmd bad.ksmd
%ksmd 2

#bad
```

`ksmd --check budget.ksmd` ends with code 0 and prints:

```text
t.D1 = 6
t.D2 = #DIV/0!: C2, the divisor, is 0 or empty
t.A3 = "Pens each"
t.B3 = 2026-10-23
t.C3 = true
t.D3 = #DIV/0!: D2 shows #DIV/0!
ok: 1 table, 6 formulas, 2 errors
```

`ksmd --check report.ksmd` ends with code 1 and prints:

```text
parts/notes.ksmd:3:1: no file stands at this path. Correct the path; ksmd does not create the file (included from report.ksmd:6:1)
1 problem: 0 tables, 0 formulas, 0 errors
```

`ksmd --check bad.ksmd` ends with code 1 and prints:

```text
bad.ksmd:3:1: a heading is one to six '#', a space and its text. Write '\#' for a literal '#'
```
