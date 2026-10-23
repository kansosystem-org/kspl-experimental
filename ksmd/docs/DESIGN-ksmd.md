# The first ksmd document and editor

This is the design for implementers and reviewers. **It is not an implemented file-format specification.** The examples under `ksmd/examples/` illustrate these decisions. The source-validation layer is implemented. So are the reader and writer for every structure below: blocks, inline markup and clauses ("What the first reader models" below). Includes and image paths resolve inside a workspace, and each source saves alone ("Includes and images" below). Table editing and calculation are implemented ("Tables and calculations" below). An editing page edits one source in a browser ("How the editor changes a document" and "The editing page" below). Served by the local server, the page opens and saves files and holds drafts ("The file lifecycle" below). A launcher opens a `.ksmd` file from the desktop on its workspace ("Opening a document from the desktop" below).

## The first usable document

A document contains prose, calculating tables, images and includes, in reading order. The editor changes that structure directly. Source is read at open and written at save, not reparsed after each keystroke.

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

A clause starts at column one with `:::` followed by its kind and attributes. A line containing only `:::` closes it. Clauses do not nest in version 1. The kinds are `table`, `include` and `image`; an unknown kind is an error. Attributes are unique `name=value` pairs separated by spaces. Unknown attributes and duplicate attributes are errors.

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
* A clause's kind follows `:::` at once. Its attributes may come in any order, separated by one or more spaces. The writer writes them in a fixed order with one space: `name`, `widths`; `path`; `src`, `alt`, `caption`.
* A clause closes at a line that is exactly `:::`. A table row outside a table clause is refused.
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
| Emphasis | `*text*` | No newline inside a mark |
| Strong emphasis | `**text**` | No newline inside a mark |
| Link | `[label](destination)` | No nested links; spaces and parentheses in destinations are percent-encoded |
| Inline code | A matching run of backticks around literal text | Use a longer run for embedded backticks; no newline |
| Paragraph | Other text | Inline content and explicit hard breaks |

Emphasis and strong emphasis may nest, with properly paired delimiters. Links may contain emphasis and inline code. Unclosed reserved delimiters are errors, not silently discarded formatting.

A backslash escapes the following ASCII punctuation outside code. Escape a block marker to start a literal paragraph: `\#`, `\-`, `1\.` or `\:::`. For an ordered-list marker, escape its period (`1\.`); a backslash before a digit is invalid. The writer emits only escapes needed to avoid syntax or represent a literal backslash.

Visual typing inserts literal text. Typing `#`, `*` or `:::` does not automatically change structure. Formatting commands change the model, and the writer adds the required source delimiters and escapes. Pasted plain text stays text. A rich-text paste is accepted only through a conversion that retains supported content; unsupported content must be reported before insertion.

## Tables and calculations

A table clause requires `name="budget"`. Names match `[a-z][a-z0-9_]*` and are unique within one source file. A table has a header row followed by data rows. The header contains quoted strings and is not part of the cell address space.

Every row starts and ends with `|`. Separators outside quoted strings split cells. Every row has the same positive number of cells. There is no Markdown alignment or separator row.

| Cell source | Meaning |
| :-- | :-- |
| Nothing between separators | Empty cell |
| `"Pens"`, `"0012"`, `"a\nb"` | Text; JSON escapes permit a multiline text value |
| `12`, `-3.5`, `1e3` | Finite decimal number, evaluated as F64 |
| `=B1*C1`, `=sum(D1:D2)` | Formula source, not its cached result |

Text cells need quotes, so numeric-looking identifiers and a leading `=` are unambiguous. A pipe inside a quoted string is text. A physical source row stays on one line. Multiline text is allowed through `\n`; multiline cell blocks are excluded.

Addresses start at `A1`, the first data cell. `$A$1`, `$A1` and `A$1` express fixed axes when copying formulas. Within one source, `budget.D1` names a cell in another table. Cross-file formulas are excluded initially, including references into an include.

A formula holds numbers, cell references, rectangular ranges, parentheses, unary minus, `+`, `-`, `*`, `/`, and `sum`, `min`, `max`, `count`, `average`. Function names are lowercase. Multiplication and division bind before addition and subtraction. Other arithmetic groups left to right; ranges appear only as function arguments. There are no user functions.

An empty cell becomes zero in scalar arithmetic. Numeric aggregates ignore empty and text cells; `count` counts numbers. An empty numeric set gives zero for `sum` and `count`, and an error for `min`, `max` and `average`. Scalar arithmetic on text is a type error. Division by zero, non-finite results, invalid references and cycles have distinct displayed errors. Errors in referenced cells propagate. Dates remain text in version 1.

### How a formula is written

* A number has a cell number's shape without its sign: `2.5`, `1e3`, `0.5`. A sign is unary minus.
* A cell is capital column letters, then a row number from 1 without a leading zero: `D1`, `AA12`. A `$` before either part fixes that part for copying.
* `budget.D1` names a cell of another table in the same source. No space stands around the `.`.
* A range is two cells joined by `:` without spaces: `D1:D3`. A table's name stands once, before the range: `budget.D1:D3`.
* A range is the rectangle between its corners, which can come in either order. The writer saves the upper left corner first.
* `#REF!` stands where a reference lost its row or column. The reader and writer keep it, and it calculates as `#REF!`.
* Spaces and tabs can stand between tokens. A function takes one or more arguments, separated by `,`.
* A formula nests at most 64 levels. The formula itself is one level, and each bracket, function and unary minus adds one.

### Values and errors

A cell's value is empty, a number, text or an error. A formula's value is a number or an error, so `=A1` with text in A1 is `#VALUE!`.

* **Text in arithmetic is an error, even text that looks like a number.** Quotes already mark a cell as text, so converting it would only undo a choice the writer made.
* **A reference alone as a function argument is a set of cells.** The function leaves out the set's empty cells and text. Any other argument calculates as arithmetic, so `sum(A1+0)` with text in A1 is `#VALUE!`.
* **`min`, `max` and `average` of no numbers are `#EMPTY!`, not 0.** A zero would hide that a column holds no data yet.
* **An error in a referenced cell carries into every formula that uses it, `count` included.** A count beside a broken cell would otherwise look right.
* **Of two errors, the left one in the formula comes first.** In a range, the first in reading order comes first: row by row, each from the left.
* **A formula that does not read is `#SYNTAX!`, whatever its parts calculate to.** Its source is kept, so a slip can be fixed later.

Each error has its own mark, since each is fixed differently. A cycle shown as 0 would read as a value, and one shown as `#REF!` would send the reader to look for a removed row.

| Mark | The cause |
| :-- | :-- |
| `#VALUE!` | Text in arithmetic |
| `#DIV/0!` | A division by zero |
| `#NUM!` | A number or a result too large for an F64 |
| `#REF!` | A reference to no cell: `#REF!`, a cell outside its table, or a table name this source does not hold |
| `#CYCLE!` | The cell depends on itself, directly or through other cells |
| `#EMPTY!` | `min`, `max` or `average` of no numbers |
| `#SYNTAX!` | The formula does not read: an unknown function, a range outside a function, a missing bracket or operand, or more than 64 levels |

### How references follow edits

Each row and column of a table holds an identity that the source does not show. A reference holds the identities of its cells, and the writer writes the coordinates they have now. The model is the only authority: calculated values are never stored in it. `ksmd/edit.kspl` holds the operations an editor calls: insert, remove and move a row or a column, set a cell and copy a cell.

* **Insertion and movement keep every reference on its cells.** A range spans its two corners, so a row inserted between them joins it. A row inserted after the last corner stays outside; to grow a range at its end, insert inside it.
* **A range's corner follows its row or column.** When a corner's row moves, the range spans the corners' new places.
* **Removal turns a reference to the removed line into `#REF!`.** A range's corner on that line moves one line toward the other corner. A range with no line left becomes `#REF!`.
* **`$` acts only on copying.** A copy shifts each part without `$` by the distance copied, and a part with `$` keeps its row or column. A shift outside the table gives `#REF!`.
* **A reference without a table's name names a cell of the table that holds the formula.** So a copy into another table names a cell there.
* **A reference that names no cell stays as written,** such as `Z9` in a four-column table. It attaches once that cell exists: after an insertion, and when the source is read again.
* **A reference straight after a number, as in `1A1`, never attaches.** That formula does not read. Attached, a moved column could join the two into one number (`1E1`).
* **An edit that would write a formula longer than 4,096 bytes is refused, and changes nothing.** The reader refuses such a formula, so the saved source could not be opened again.
* **A value that would not read back is refused.** A number keeps the shape the reader takes. A formula stays on one line, with each `|` inside quotes.

### How tables calculate

Calculation (`ksmd/calc.kspl`) reads only the model. It opens no file, and its results stand apart from the document. It calculates every table of a source together, so a reference into another table and a cycle through two tables are both seen.

* **A cell calculates when a formula first needs it.** So a formula can name a later row, and the order of rows does not matter.
* **A cell reached again while it calculates is a cycle.** Every cell on the cycle shows `#CYCLE!`, and the error carries into the cells that use them.
* **A chain deeper than 256 steps is set aside, and its deepest cell calculates first.** A step is a cell or a level of a formula. So a running total down 10,000 rows calculates without exhausting the stack.
* **After an edit, the whole source calculates again.** The table limits bound that cost; a partial recalculation waits for a measured need.

## Includes and images

An include clause has only `path="notes.ksmd"` and an empty body. An image clause requires `src` and `alt`, and permits `caption`. All three are quoted strings; its body is empty. Version 1 accepts local PNG and JPEG assets. SVG, remote images, executable formats and data URLs are excluded.

Links may use `https`, `http`, `mailto`, or a document fragment. Other schemes are refused. Opening links is an explicit user action; rendering does not follow them.

### The workspace and its paths

**A document opens inside a workspace: a folder the user opens explicitly.** Every source and image the document reaches stays inside that folder. `Workspace` in `ksmd/workspace.kspl` holds it. The root itself may be a link.

**A path is read from the folder of the source that holds it**, for includes and images alike. An image in an included file keeps its own file's folder. A file then keeps its meaning when its folder moves with the files it names. A rule that reads paths from the top document or the working folder breaks once a file moves into a subfolder.

**A path has one spelling.** `/` separates folders. Any `..` segments come first, and each climbs one folder from the holding file's folder. `resolve_text` in `ksmd/files.kspl` refuses every other form, on disk and in the page alike:

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

**Each source is read once into its own model, and the view refers to its blocks.** `assemble` in `ksmd/assemble.kspl` builds it. Each `Entry` names the instance and the block it shows. So the view can name, for every block, the file it came from and its offset there. An include clause stays in its parent's model, and the included blocks follow its entry.

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

**To change included text, the editor opens the included source.** `load` in `ksmd/files.kspl` reads it alone. Its save leaves the parent's bytes unchanged, and the next view shows the change. Undo belongs to the source being edited. Several sources are never saved in one transaction.

### Table names across includes

**A table name belongs to its source file.** Two files can each hold a table named `budget`, and a repeated include shows one declaration again. A formula names only the tables of its own source; a reference into an include or into a parent is excluded. So a repeated table shows the same values in each instance.

## Model and editor architecture

Use an ordered block tree. Its node kinds are paragraph, heading, list, code, table, image and include. Inline nodes are text, emphasis, strong emphasis, code and link. Tables own rectangular cells, rather than general child blocks.

Source locations belong to parsed nodes and tokens. Editing identities belong to the model and need not appear in source. Appearance holds optional column-width ratios; it cannot encode a table as prose or change formula meaning. The table's `widths` attribute, when present, is a quoted comma-separated list of positive integer weights, one per column. Weights are integers from 1 to 10,000. The writer divides them by their greatest common divisor. The editor rounds resized proportions to these weights; layout divides each weight by their sum.

**Use browser layout for the first editor.** Paragraphs and real HTML tables give text flow, selection, accessibility structure and print layout without a second text-layout engine. Canvas remains an option for future specialized figures, not the default document surface.

The KSPL model remains authoritative. The page turns editing into model actions ("How the editor changes a document"). The selection is a pair of model spots, not a DOM range kept across rendering. Undo records model transactions ("Undo and redo"). The page renders only the blocks an action changed, and restores the selection through the spots ("The editing page").

**A layout comparison confirmed the choice.** A small page held editable paragraphs and a real HTML table, beside a canvas that drew the same text. It ran in headless Chromium 141, and every check passed:

* Typing inserts once. A composition, sent as an input method sends it, commits its text once.
* An edit inside a cell stays in that cell, and a paragraph after the table takes typing.
* At a 320-pixel width the paragraph wraps and the table fits, with no line breaker of the editor's own.
* Native selection reads the text, and the table and its cells stand in the accessibility tree.
* Printing breaks a 120-row table across four A4 pages.
* The canvas exposes no text: no accessibility node, no selection, and no typing without a hidden input field. Each of these would be the editor's own code.

**The browser's own undo is not the product's undo.** One undo removed two separate edits, the typed text and the composed text, since the browser groups edits by its own rules. So undo records model transactions. The comparison checks layout responsibilities, not complete editors or performance.

## How the editor changes a document

`Editor` in `ksmd/editor.kspl` holds one document, its selection and its history. Every action a page asks for is a method on it, and each action is one transaction.

**An action takes the blocks it touches apart into units, changes them, and settles them into blocks again** (`ksmd/region.kspl`). A unit is a paragraph, a heading, a code block or one list item. A table, an image or an include is a whole unit, kept as it is. An action works on units without regard to which block holds them. Settling then groups neighbouring list items into one list, and starts another list where a top-level item's marker changes.

**Text is changed as a run of segments, each with its own marks** (`ksmd/styled.kspl`). A command sets or clears a mark per segment, and never opens or closes a node itself. Building the inline nodes again opens marks in a fixed order: a link outermost, then strong emphasis, then emphasis. That is the order in which the reader takes a run of `***` that opens both. Every mark closes before a hard break, since a mark closes on its source line.

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

**Each action records the swap of what it changed** (`ksmd/history.kspl`). Undoing swaps the old blocks and table parts back in, which leaves the undone version in the record, ready for redo. Inline nodes and list items are only ever added, so an old block still names valid nodes. A swap is exact only when every later action is undone first, so undo and redo run strictly in order.

**A table edit is recorded by comparing each table with a copy made before it.** Where a table keeps its rows, columns, name and cell count, the record holds only the cells and formula pieces that differ. A cell edit in a large table then records one cell. Column widths that change alone are recorded alone, so resizing a column of a 10,000-row table copies no cell. Otherwise the record holds the whole table.

**Typing joins one step per word, with no clock.** Typed text joins the step before it while the caret stays where that step left it. A space ends the step it is typed into. Deleting single characters joins the same way. A paste, a composition, Enter and every command are steps of their own. A rule with no clock gives the same steps on every machine, so a test can check it.

Undo and redo put back the selection each step started or ended with. A new action drops what was undone. A refused action records nothing.

## The editing page

`ksmd/port/web/` holds the page: `bridge.kspl` and `view.kspl` built as wasm32, and the script and style that show the model. `make ksmd-web` builds it as `out/ksmd/web/ksmd.html`.

**Text arrives through `beforeinput`, which the page cancels.** The page runs the matching action, renders the blocks it changed, and puts the selection back from model spots. So the page keeps no edit the browser made, and the browser's own undo has nothing to undo. A dropped item is refused. Key presses carry the commands. Ctrl+B, Ctrl+I, Ctrl+E and Ctrl+K set marks, and Ctrl+Alt+0 to 6 make a paragraph or a heading. Tab and Shift+Tab nest list items, and Ctrl+Z and Ctrl+Y undo and redo.

**An input method's composition is the one edit the browser makes itself.** Text from an input method cannot be cancelled. While a composition lasts, the page renders nothing and runs no action. When it ends, the page compares the element's text with its text before, and takes the difference as one transaction. That comparison waits one turn, so a browser that changes the text after the composition ends has done so. Any other input takes it first. The key press that starts an input method deletes a selection, so the composition starts in one place.

**The selection is two model spots.** A spot names a block, a list item and a UTF-8 offset into its text, or a gap. The page maps between spots and places on the page at each action, and keeps no place across one.

**Only the blocks an action changed are rendered again.** An action reports the first block it changed and how many at the end it left alone. After a table edit, every table shows again, since a value can depend on another table.

**A table shows as an HTML table of calculated values**, with column letters and row numbers. A cell edits in an input of its own. Enter, Tab and the arrow keys move between cells. The arrow keys past the first or last row leave the table for the gap there. A press between two blocks, or below the last, puts the caret in the gap there.

**A cell opens when the mouse button goes down, not on the click.** The press takes the caret out of its gap, and a gap above the table then goes. The table moves up a line under the mouse, so the button would come up on another element, and no click would come.

**Dragging the edge between two column letters resizes the two columns beside it.** They share their width anew, and every other column keeps its weight. The page shows the new widths while the mouse moves. When the button comes up, the table's `widths` change in one step of undo, and no cell changes. A press that does not move changes nothing.

* **The page turns pixels into weights.** A table without `widths` first takes weights from its columns' widths on the page, about 1,000 in all.
* **All weights are multiplied by one whole number before the two columns share theirs.** The two then have about 1,000 steps to share, and the other columns keep their proportions exactly. The writer divides the weights by their greatest common divisor again.
* **No weight passes 10,000 or falls below 1**, the bounds the reader takes.

**In a cell, Alt+Right makes its column wider and Alt+Left narrower, by a twentieth of the table's width.** The width comes from the column on its right, or for the last column from the one on its left. Each press is one step of undo, and the cell stays open for the next. The keys work in the cell because a keyboard already reaches a cell, and resizes the column being worked in. An edge that takes the focus would be one more stop for Tab on every table. A table of one column has no width to share, and the page says so.

**An image and an include show what their clauses say.** Opened from a file, the page shows an image's path, alternate text and caption, and a marked box naming an include's path. Served by the local server, it shows the image and the included blocks in place ("The file lifecycle" below).

**A paste takes the clipboard's plain text.** Each line starts a block of the caret's kind. When the clipboard also held formatting, the page says that it was not kept.

**The page is built as wasm32 with no C library.** Clang's bulk-memory instructions copy and fill memory, so no C routine is linked.

**The page is one file.** `ksmd/port/web/bundle.kspl` puts its style, its scripts and its wasm, as base64, inside `ksmd.html`. So the page opens from a file, and the local server hands it out alone.

**Opened from a file, the page reaches no file: a host opens and saves through two calls.** `ksmd.load(source)` opens a source; a refused source leaves the open document as it was, and the result names the line and column. `ksmd.source()` returns the canonical source to save. `ksmd.onchange` learns of each change.

**The editor's memory is a fixed 128 MiB.** An action that starts with less than 16 MiB free is refused, and the page asks the person to save and open the document again. The document and its whole history stay in that memory until another document opens.

### What the editing page does not do yet

* It does not convert a rich paste; it takes the plain text and says so.
* It never trims the undo history. A long session can use up the editor's memory, and the page then asks the person to save and open the document again.
* The browser checks run in headless Chromium alone. Firefox, Safari, a real input method on a real keyboard and screen readers are not checked.
* A person switching tabs in a desktop browser is not checked: the checks send the focus event themselves.

## The file lifecycle

**ksmd reaches files through the repository's local server, `kssrv --local`, started on one workspace folder.** A page in a browser cannot read a folder, so it asks the server for each file by its path from the root. The protocol and its refusals are [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md). The server reaches files and nothing else: it starts no program, lists no folder, and knows nothing of the document. ksmd adds no server and no request of its own.

| Guarantee | What holds it |
| :-- | :-- |
| Only this machine reaches the server | The server listens on the loopback alone, and refuses a request that names another host |
| Another page or program cannot drive it | The server makes a new token at each start. The page moves it from the address into the tab's storage, and sends it in a header |
| A path stays inside the workspace | The page applies the workspace's text rules (`resolve_text` in `ksmd/files.kspl`). The server refuses a link and a path out of its root |
| No file appears by itself | Opening, viewing and drafts write nothing. A save writes the open document's own path, or a new path where no file stands |

### Opening

**A document opens from its path in the workspace**: from the address (`?doc=notes.ksmd`), or typed into the Document field. The page gives the file's bytes to the editor unchanged. A file the reader refuses does not open, and the open document stays.

**The page builds the assembled view itself, in rounds.** An assembly over what the page holds names the files it still lacks (`Fetched` in `ksmd/fetched.kspl`). The page fetches them and assembles again, one round per level of includes. So the browser applies `assemble`'s rules, and a refusal that the server gives, such as a link, stands as that file's. A clause whose file is still being fetched shows its path and no problem.

**An include shows its file's blocks in place, and they do not edit there.** Its Edit button opens the included file in a tab of its own, with its own undo history, its own save and its own draft. The parent's model holds the clause, so the parent's save never writes the included file.

### Saving

**A save writes the open document's canonical source to its own file, and only that file.** Ctrl+S and the Save button save. The server replaces the file through `fs.replace_file`, so a crash leaves the old text or the new.

**A save compares the file's bytes with those this page last read or wrote, never its time.** The page keeps the SHA-256 digest of those bytes. Before it writes, it reads the file again and compares. It then sends the digest with the write, and the server replaces the file only while the file still matches. A file rewritten with the same bytes is no change, and a write from another tab in between is caught.

**A file changed on disk is never overwritten without a choice.** The page writes nothing and shows a notice that does not block editing. The notice offers two ways on: replace the file with this version, or load the file's version and keep this one as a draft. No merge is offered, since a merge that drops a line loses work silently.

**When the page is looked at again, it reads its file again.** Focus and visibility both start the check. With nothing unsaved, a changed file shows at once. With edits unsaved, the page shows the same notice as a save. Each include and image is fetched again, and the view changes where one changed. The server watches no file, so a page that is not looked at notices a change only at its next save.

**A new document saves only where no file stands.** Its first save writes the path typed into the Document field, and the server refuses it where a file stands. A save to a path other than the document's own works the same way. So a save never replaces a file that this document did not come from. Opening a missing path creates nothing.

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

**An image's format and size come from its file's header, before the browser decodes it.** `measure` in `ksmd/image.kspl` reads a PNG's IHDR chunk, or walks a JPEG's segments to its frame header. The bytes decide the format, and the file's name does not. Another format is refused, and so is an image of more than 16 million pixels. The page passes the header in windows of 64 KiB, so a large file never fills the editor's memory. An image that is refused or missing shows the reason at its clause.

### What the file lifecycle leaves out

* Two people editing one file at once. A save after another person's save asks, as for any change on disk.
* A list of the workspace's files, which the protocol does not offer. A path is typed or linked.
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
| Include depth | 16 files on the active stack |
| Assembled view | 64 MiB of source text and 200,000 blocks, counting repeated instances |
| One decoded image | 16 million pixels |

**The view counts a source's text when the source is read, refused or not, and again at each later include of it.** A refused source counts because its text was read into memory. An include that would pass a view limit is a problem at its clause, found before its blocks join the view.

A diagnostic names the source path, one-based line and Unicode-scalar column, plus the offending span. Internal spans use UTF-8 byte offsets. Include errors also show the include chain. The UI converts offsets to its own selection units.

Malformed syntax, unknown clauses or attributes, and unsupported versions prevent editing and saving that source. They do not cause a partly parsed model to overwrite the file. Offer the original source and diagnostics for inspection. Calculation errors are valid cell results and do not prevent saving their formula source.

The reader refuses a formula longer than 4,096 bytes, and an edit that would write one is refused. A formula nested deeper than 64 levels calculates as `#SYNTAX!`. A table edit past a table's limits is refused, and a refused edit changes nothing.

### Keys from a document

**No key from a document reaches std's `Map`.** `Map` hashes with a fixed seed. A document could then hold many table names or paths that start at one slot, and each lookup would pass them all. `make test-conventions` refuses `Map` anywhere in `ksmd/`.

| What is looked up | By | Where | Work for one lookup |
| :-- | :-- | :-- | :-- |
| A table name, to refuse a second table of that name | The name | `Keyed`, while `reader.read` reads one source | At most about 1.44 log2(n) names, for at most 100,000 tables |
| A source the view already read or refused | Its path from the root | `Keyed`, in `Assembly` | The same, for at most 200,000 includes |
| A file the page fetched, or still lacks | Its path from the root | `Keyed`, in `Fetched` | The same |
| A clause's problem | Its entry | A binary search of `Assembly.problems`, which stand in the order of their entries | log2 of the problems |
| An included source's values | Its index | A list, by that index | One step |

**`Keyed` in `ksmd/keyed.kspl` is an AVL tree that compares keys byte by byte.** Its work does not depend on any hash. A sorted list is not used: names in falling order would shift the whole list at each insertion.

### What a document costs

**These figures come from one machine, and promise nothing elsewhere.** `make measure-ksmd` measured them on 22 October 2026. The machine had four cores of an Intel Xeon at 2.10 GHz, 15 GB of memory and Linux. The browser was the headless Chromium 141 that the browser gate drives.

* `ksmd/tests/measure.kspl` writes the documents, and times the model outside the browser. `ksplc run` builds it with `-O2`.
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
