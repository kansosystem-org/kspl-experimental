# The grounds of kspage's document

**This document says why kspage's document is shaped as it is.** It covers its model and styles, how it is laid out, and how it is edited and undone. Its tables and formulas are in [`DESIGN-tables.md`](DESIGN-tables.md), and its slides and pages in [`DESIGN-slides.md`](DESIGN-slides.md). The words it uses without stopping are in "Words used in this document" in [`DESIGN-architecture.md`](DESIGN-architecture.md). So are the core, the port and the boundary with the browser it leans on.

## The document model

A document is a tree of blocks. Each block holds a row of runs (its own text) and can hold child blocks. A block names its style; the styles live in one table beside the tree.

The tree for a heading, a paragraph with one bold word, and a table looks like this (the style names are examples):

```mermaid
flowchart TD
    doc["Doc: the document"]
    h["Block: a heading<br/>style 'heading'"]
    p["Block: a paragraph<br/>style 'body'"]
    t["Block: a table<br/>style 'table' (a grid)"]
    row["Block: a row"]
    cell["Block: a cell"]
    r1["Inline (run): 'Hello '"]
    r2["Inline (run): 'world'<br/>style 'bold'"]
    sheet["Sheet: the style table,<br/>looked up by name"]
    doc --> h
    doc --> p
    doc --> t
    t --> row --> cell
    p --> r1
    p --> r2
    p -.->|"names a style"| sheet
```

### A block has no field for its kind

A heading, a paragraph and a list item are all blocks; only the style name differs ([`model/doc.kspl`](../model/doc.kspl)).

Caution: **A separate kind field would say the same thing as the style.** Each place that draws would pick one of the two. Where they disagreed, nothing would decide which is right.

### Unset is expressed with `Option`

Every style field can be "unset", and an unset field takes its parent's value. Unset is an empty `Option` (KSPL's "maybe a value" type), never 0 or an empty string.

Caution: **Do not use 0 or an empty string to mean unset.** No weight is 0, but `false` is a real value for italic, so in some fields the marker would collide with a value.

**The rule covers the fields that inherit and the values a person can type as 0.** A measurement that cannot usefully be 0 keeps 0 as its "not set" mark, and the section on that field says what 0 means:

| Field | What 0 means |
| :-- | :-- |
| a slide's width, the paper's width | the container's width |
| the paper's height | no pagination |
| the body's width | no limit |
| a paragraph's leading (the distance from one line to the next) | the font's own height |
| a rule's width | no rule |

Only the font is inherited. **Space before and after a paragraph, and the indent, are not**; inherited, they would space a child twice over at every level of nesting.

### Only the block holds its position

A frame's position on a slide is stored on the block itself: not in its style, and not in a table beside the document. The same goes for every value that differs from one block to the next.

Of the three arrangements, only absolute coordinates cannot work out where a block goes from the element before it. Every frame's position is its own, so `Block` holds `frame: Rect?` ([`model/doc.kspl`](../model/doc.kspl)).

**Do not put it in the style**: a style is shared by name, and an unshared value would need one style per frame. Nor outside the document: held in a separate table, the positions alone would be lost on saving and reading back.

**Every value that differs from one block to the next is held on the block for the same reason**, though the blocks share a style:

| Field | What it holds |
| :-- | :-- |
| `frame` | a frame's position on its slide |
| `step` | a frame's build step (when it appears as the slide is shown in turn) |
| `size_of` | a table's column widths and row heights |
| `span_rows` / `span_cols` | how far a merged cell spans |
| `name` | the name a formula or a reference points at |

The sections that use each field point here.

**Fields that one arrangement alone reads are the exception to the rule that only the arrangement branches.** That rule is "Why the three can be made one" in [`DESIGN-architecture.md`](DESIGN-architecture.md). The exceptions are in [`model/doc.kspl`](../model/doc.kspl)'s `Block`:

* `frame` and `step` for absolute coordinates (flow and the grid derive a position from the previous element);
* a table's sizes and merges for the grid.

### An unknown style name does not stop layout

A style name missing from the table is treated as unset ([`lay/flow.kspl`](../lay/flow.kspl)), so the text takes its parent's look.

Caution: **A misspelt name passes silently.** Check first with `Sheet.find` that a name exists. Failing partway through layout instead would let one typo blank the whole screen.

### Styles are told apart by role, not by name

**To find "the heading style" or "the code style", a reader looks at what a style does, never at what it is called.** That reader can be the core, the page or a theme. What a style does is its role in the table below. A document can name its styles anything.

Caution: **Neither the core nor the page can list styles by name and remember them.** A remembered list breaks silently the day a document renames a style: that one style alone keeps the previous theme's colour. What is looked at is the role.

| The role | How it is recognised |
| :-- | :-- |
| A heading | its depth (`outline > 0`) |
| A code block | it does not wrap (`wrap == false`) |
| A table | it is laid out as a grid (`arrange == grid`) |
| A slide | it is laid out at absolute coordinates, and has a size |
| A collecting block (one that gathers entries, such as a table of contents) | its way of collecting (`collect`) |
| A framed block | it has a fill, it draws a line |
| A table's cell | a flowing paragraph with inner space and no marker (`cell_like` in [`model/style.kspl`](../model/style.kspl)) |

Caution: **A theme must cover the styles a person made too.** Chosen by name, those alone would escape it.

**Inserting looks a style up by name, then by role, then makes one by name.** By name alone, it breaks the day the name changes; by role alone, it cannot choose between two of one role. A slide style cannot be made up: the core must not decide a slide's size, so the style has to exist first.

### Asides and annotations sit beside the text, outside the flow

Two kinds of side text stay out of the document's flow. An aside belongs to a slide; an annotation (a remark on some text) belongs to a run.

| | An aside | An annotation |
| :-- | :-- | :-- |
| **Held on** | the slide's block (`Block.aside`) | its run (`Inline.remark` and `Inline.remark_by`) |
| **What it is** | the presenter's note | what somebody said about the text, not part of the document |
| **Who sees it** | the presenter, during the show: no output includes it | it stays out of the flow too |
| **Where it is attached** | only with the cursor inside a slide. The show is the one place a note is read. On a table, a picture or a paragraph, nobody would see it was there | on a range of text |
| **Undo** | it is saved, and one undo removes it | one undo removes both the words and the author |

**An aside a saved text holds on another block is kept as it stands.** The reader takes a block's fields whatever its style, so such an aside is read and written back unchanged, and nothing shows it. Whether a block is a slide is its style's to say, and only layout reads the style. A reader that dropped the field would lose what the text held. A style changed into a slide's would bring the note back.

**An annotation covers a range**, so splitting the run leaves it on both halves (like a link, unlike a note's mark, which is a point). Runs with different annotations are not joined, or one remark would cover both. The core does not decide who wrote it (it holds no user name); the name comes from outside when it is added.

### A picture: the document holds only its source and size

**The document stores where a picture comes from and how large it is laid out, never the picture's bytes.** In a browser the whole heap is one static block. So the largest document it opens is about 1 MiB (`doc_limit` in `port/web/state.kspl`), which one photograph fills. Reading and drawing it happen outside (the core cannot read a picture). In exchange, the document alone does not carry its pictures.

**The document holds the size too.** The core cannot measure a picture, and an entry point asking outside would make layout depend on how the reading went. With the size in the document, layout is the same whether or not the picture can be read. A picture with only a source is not laid out.

**It is not shrunk to fit.** Where it does not fit it overflows (as with a set column width). Shrinking needs the aspect ratio, and knowing it means reading the picture.

**A picture is not split.** Its size is known first, so where it does not fit, it moves whole to the next page (like a slide).

## Styles and their fields

A style holds the look and the arrangement, and blocks and runs share it by name. These sections say which field belongs to the style, and how each one acts.

### Applying a style splits a run

Making part of a run bold splits the run at the selection's two ends and gives the middle part another style name. A run never holds a weight or a size of its own.

From the screen, only **the style name** of text can be changed (`Editor.set_style`). Weight and size held on a run directly would step around the styles ("Why the styles are kspage's own, not CSS").

A run has one style. So styling part of a run splits it at the selection's two ends and writes the name on the runs between. **With nothing selected, it applies to the cursor's whole run** (there is nowhere to split). For example, making "world" bold:

| | The runs |
| :-- | :-- |
| Before | `Hello world again` (style `body`) |
| After | `Hello ` (`body`), `world` (`bold`), ` again` (`body`) |

Caution: **Do not split a run that holds a formula.** Its visible text is the computed result, overwritten whole at the next recalculation. Split, the second half would miss the overwrite and keep the old value. A formula run takes the style whole.

**After applying, join neighbouring runs with the same style**, or runs multiply with every apply and remove. Neighbours are joined within their block, so the parents of the styled runs are collected first (a selection crosses blocks).

**After a split or a join, move the cursor with it.** Typing into a removed run would put text in the document that appears nowhere on screen.

**A position exactly at a split stays with the earlier run**, which stays in place, so it keeps pointing at the same spot. On the later run, the selection's end would point at a run outside the range, and the applied style could not be read. A join, by contrast, takes the run along, so byte 0 moves as well.

**The selection stays after applying**, so another style can be applied next, or this one removed.

### A paragraph's style is separate from a run's

A paragraph has its own style, which holds the list marker and the arrangement. It is set with `Editor.set_block_style`, apart from the runs' styles.

The line-start marker (a list's `•`) and the arrangement belong to the paragraph's style, so the marker is added and removed here, not on a run. **Deleting the text leaves the marker**: it is not text, so only removing the paragraph's style removes it. An empty name means a plain paragraph.

**A style with another arrangement is not applied.** A table's or a slide's style on a paragraph would not match its content's shape, leaving the text nowhere to go. So the choice is refused and reverts.

**It applies to every paragraph in the selection, and only to paragraphs.** That is the range a run's style covers, so one selection never lands on two different things. It skips holders (a table, a row, a slide, a picture) and cells. On a cell the grid would go. On the table the arrangement would turn into flow, and the table would fall apart. Layout says whether a block is a cell (the document does not say "table"), so the page must be laid out first. However many paragraphs it covers, it is one undo.

### Direct formatting is a style name too

"make just this red" stores no colour on the text. It makes (or reuses) a style whose name spells out the settings, and applies that style.

"Change the colour of just the selection" does not make a run hold a colour.

**Direct formatting reaches only the characters' look.** Alignment, indent, spacing, leading, the mark at a paragraph's head and a page break belong to the style alone. Where a style and direct formatting can set the same thing, changing the style later leaves the directly formatted places as they were. In Word a number applied by hand holds only until the next style is applied. In PowerPoint a slide changed by hand stops following its master (Principle 6).

Caution: **Build a style name from the settings, make sure a style of that name exists, then apply it.** A colour held on a run breaks the same mapping ("Applying a style splits a run"), the keystone of this design.

**The same settings give the same name** (`decoration-cff0000-b00ff00-u1`: text colour ff0000, background 00ff00, underline on). A new name at every apply would grow the styles' table, and the saved text, by one each time. Do not change the order of the fields, or the same settings would give a different name from before.

**Create the style and apply it in the same step**; separate, undoing one operation would take two presses. With nothing set, the name goes back to empty, which removes the direct formatting.

**Bold and italic are applied the same way, but not on the colour's side** (`Ink`). Weight and slant change the measurements. On that side they would break "a colour changes neither the width nor the height". They are held as `Accent` and copied into the style's font fields. Either can be "off", so one run can be made plain inside a bold paragraph.

### Changing a style is an edit to the document too

The screen changes **one whole style** at a time (`Editor.set_look`), and the change goes into the undo record like any edit.

**Do not make an entry point per field.** Unset is a value in its own right. Field by field, "there was none" and "it was 0" would arrive in the same shape.

Caution: **Keep it and carry it as one whole style.** With copying written per field, a copy missed when a field is added gives no message. It surfaces as "only the colour does not reach the other window", visible in neither the text nor the layout. Copied whole, a new field adds no operation (`style.put_face`).

**The name alone is not changed**: a style is shared by name, so renaming it would strip it from every place it is applied. What is carried is the same text as when the style is added (one style's JSON). With two formats, changing only one would produce text that cannot be read back.

**Changing a style changes every place with its name**: that is sharing by name. To change one run alone, a new name is made and applied. Do not make two styles with the same name: `Sheet.find` returns the first added, so the later one is never used.

A new style sets nothing; it is meant to be applied and then changed.

**Changes to the styles' table go through the undo record too.** The table is saved with the document. So a change that cannot be undone would be a hole (the reason for not changing the document directly).

### Links: the run holds the target, the style the look

A link's target is stored on the run (`Inline.href`); its look is an ordinary style. Both are set, and removed, in one step.

A link has two parts: where it points, and looking like a link. **Do not hold them in one place**: the target differs run by run, while the look is shared by name. Mixed, the styles' table would grow by one style per target.

So the run holds the target, and the look is applied as a direct-formatting style, **both in one step**. As two, one undo would leave either text that is merely blue or a link with no look. Removing is one step too: the look returns to the parent's with the target.

**Unlike a formula, typing does not drop it.** A formula goes stale when its text changes, but a link's target has nothing to do with its text.

**Neighbouring runs with different targets are not joined**, or two adjacent links would become one target (the same treatment as a style name).

### Colour is inherited with the font but stays out of `Font`

**The text and background colours belong to the style (`Style.ink`) and are inherited like the font, but stay out of `Font`.** `Font` holds only what measuring needs (it is the key for measuring). A colour changes neither the width nor the height. Mixed in, two fonts differing only in colour would be measured twice. So layout carries a `Look`, the font and the colour bound together, as the inherited value.

**The background is inherited like the text colour.** Otherwise a background set on a paragraph's style would appear nowhere. Boxes exist only where there is text, and a paragraph has no box of its own. Only the boxes are painted, like a highlighter (the fill band, below, paints a whole paragraph or cell).

**The highlight goes over the band's fill**: the narrower one on top.

**It can be unset**: unset text is drawn in the screen's default colour, where black would be unreadable on a dark screen. Do not use 0 to mean unset. Black (`#000000`) is a real value, so it is held in `Option`, as italic's `false` is.

**A colour is `0xRRGGBB`, with no transparency**: at 24 bits it crosses the boundary as one number (it fits exactly in an F32, a 32-bit floating-point number). The text form is `#rrggbb`, used alike by the saved file, the exported CSS and the screen's swatch.

**Decide the text colour together with the fill.** The fill (`Style.fill` / `Ink.background`) is a fixed number, but unset text takes the screen's default colour. So deciding only one allows bright text on a bright fill on some screens.

Note: The rule colour has the same problem, and its default black is a dark screen's background. So a line meant to show what was added gets a colour readable on either screen (`write/insert.kspl`'s `DRAWN_COLOR`).

### Underline and strikethrough sit with the colour

Underline and strikethrough belong to the style (`Ink.underline` / `Ink.strike`) and are inherited with the font. **Do not put them in `Font`.** Like a colour, a line changes neither the width nor the height, so it is not part of the measuring key.

**`false` means "draw none"**; if it meant unset, one run inside an underlined paragraph could not have its line removed (as with italic's `false`).

**Write both as one declaration** (`text-decoration-line: underline line-through`); written separately, the later overrides the earlier and only one line appears.

### Fill and rule are one band, not a box

A paragraph's or a cell's background (the fill) and border (the rule) are painted as one rectangle per block, the band. They come from the style (`Style.fill` / `Style.rule_width` / `Style.rule_color`).

**A box does not stand in for them.** Boxes exist only where there is text. So an empty paragraph or cell could not be painted, and the rest of a line would stay bare. Layout leaves one band per block (`Panel`).

**The block holds neither rule nor fill; the style does**, and changing it changes every block with that name. Held on a block, they would need a new instruction in both the carried format and the undo record. On the style they need none: carrying one whole style already exists, and a new field adds no operation to it.

| The rule | Why |
| :-- | :-- |
| **The band is taken before the content and its shape filled in after** | The height is unknown until the content is laid out. Taken first, it keeps document order, so an inner block's band comes later and lies on top |
| **Its top edge is the top of the laid-out content, not the height when it was taken** | A block crossing a page is laid out and then moved to the next page, making that height stale. The band would then stretch from the old page to the new one |
| **Do not include the space before and after** | Otherwise the gap between paragraphs would be painted too, merging into the neighbour's band |
| **A cell's band is realigned once the row's height is known**, so a band points at its block | Left at content height, the grid would be missing under the shorter cells. Pointing at its block lets each cell's band be found afterwards |
| **Which sides are drawn is not held**: all four are drawn, neighbouring sides overlapping | Removal per side would need a rule for whose setting wins against the neighbouring cell |

The fill can be unset, and a rule is off at width 0 (a rule always has a colour, so it needs no `Option`).

### A shape is the band drawn in another outline

A shape is **the same band with an outline other than a rectangle** (`Style.shape`). The outline is an ellipse, a rounded box, a triangle or a diamond. Or it is a line or arrow drawn as the band's diagonal. It is not a separate kind of element: two things would then hold a fill and a rule, doubling up layout and printing.

**The style holds the shape**, as with the frame and the fill, and no value changes it. The style also says which end carries an arrow's head (`_back` is the end it starts from), since the band alone has no direction.

**A shape belongs to the holder where it was clicked**: a slide, a paragraph or a cell alike. Word and Excel lay one over the body the same way. Where it cannot go is "How a shape is drawn" in [`DESIGN-slides.md`](DESIGN-slides.md). It holds no text, so it cannot be clicked into; grabbing its frame's corner moves it.

**A band on a frame closes at the frame's height, not the content's**: at absolute coordinates the frame's size is fixed first. Closed at the content's height, a frame with no text (a shape) would be 0 high and vanish.

### Alignment and leading are per paragraph, applied as lines close

Alignment (left, centre, right, justified) and leading (the line spacing) belong to the paragraph's style, and are not inherited. Alignment is applied once a line is full, by shifting or spreading its boxes.

Alignment belongs to the style (`Style.align`) and **takes effect when the line is closed**, once the remaining space is known. The closed line's boxes then shift across together.

Caution: **Do not shift where there is no remaining space.** A wrapped line fills the width, so a negative shift would push characters outside the column.

Neither alignment nor leading is inherited (like the space before and after a paragraph). Inherited, the next paragraph or a child with no style would take the previous paragraph's alignment, and something nobody remembers changing would move.

**It works the same way inside a cell**, whose content flows at the column's width, so right-aligning numbers comes for free.

**Justification spreads a line's remaining space into letter spacing** (`Box.spacing`) without changing the measurement entry points. Letter spacing is space added after each character, which the core can count and add. Passing it to the entry points would grow what every port implements ("font measurement has two entry points" holds).

**Only wrapped lines are stretched** (closing a line is told whether text continues after it). Spread over a paragraph's last line, a few characters would scatter across the whole column.

Caution: **Do not include the last letter space in a box's width.** A box ends where its last character does, and the next box starts one letter space further on. Then, however many boxes a line is split into, its right edge meets the column's. One rule holds for every box: width = measured width + (characters − 1) × spacing.

**Hit-testing must add the same spacing** (`caret.width_to`), or the visible character and the click position drift apart along the line. Drawing uses the spacing it is given as is; spread again, it would drift from what layout computed.

The leading is a multiple of the line height (`Style.line_spacing`); 0 means unset and keeps the font's height (like a slide's width). **Apply it to the line height only**; applied to the font size, it would grow the characters when the aim was to space the lines.

**It is relative to one line, not to the font size.** One line is the height the font gives, taller than the font size (about 1.26 times). This is how Word's, Writer's and Docs' "multiple" counts, unlike CSS's `line-height` number (relative to the font size).

Note: So the field's name states the unit (`port/web/menus.html`'s "leading (lines)"). A bare number would be entered with CSS's meaning and open the lines wide.

**Do not add a field with CSS's meaning alongside** (the same thing would be settable two ways).

### The line gap is kspage's own number, not the canvas's

The canvas cannot tell kspage how much space a typeface wants between lines, so kspage adds its own 0.17em, matched against other editors.

The canvas measures text and nothing more. The leading a typeface recommends is in its OS/2 table (a part of the font file). But a canvas gives only the box above and below the text (`fontBoundingBox*`). So the gap is kspage's own number. **It is set by matching other products**: 0.17em on top of that box matches VS Code's own default almost exactly. Do not raise it: at 0.2em the leading reads as too wide. A style's `line_spacing` multiplies on top of it, so do not make the default wide and tighten it with a style.

### A paragraph that does not wrap keeps the text unchanged

Whether a paragraph wraps belongs to its style too (`Style.wrap`). **Where it is false, what passes the column's width overflows** instead of moving to the next line, as in a code block.

**Wrapping changes the text.** The whitespace after a break is dropped rather than carried to the next line (`lay/line.kspl`'s `skip_spaces`). So code aligned in columns with spaces comes apart where it wraps. Overflowing is better than changing the text: the reader can scroll across, but dropped whitespace cannot be put back.

**This is not inherited either** (like alignment and leading). It is set on the pen again at the start of every paragraph. Otherwise the paragraph after a non-wrapping one would stop wrapping too.

**The monospace comes from the style's font** (`Font_spec.family`). The core has no notion of "code": as `Arrange` sets the arrangement, the style says the look.

### A number format applies only to text from a value

Currency, thousands grouping, per cent and decimal places belong to the style (`Style.number`), and apply only to text a formula produced. Text a person typed is never reformatted.

Only [`expr/calc.kspl`](../expr/calc.kspl) reads the number format.

Caution: **Plain typed text is not reformatted**, only a formula cell and a formula in the body, where the core makes text from a value. Formatting plain text would turn the characters being typed into a number partway through.

So "type 1200 and see 1,200" first needs **a cell to hold a value separately from its visible text**.

| The rule | Why |
| :-- | :-- |
| **It is not inherited** (like the arrangement): only the text's own style is used | Otherwise a currency set on the table's style would make the headings and notes currency too |
| **Error text is not formatted** | `#VALUE!` with a currency symbol would read like a value |
| The sign comes before the symbol (`-$1,200`) | After it, a negative value would look like a subtraction |

## Why the styles are kspage's own, not CSS

kspage's styles are its own, not CSS. **With a layout of its own, kspage would have to implement CSS again** to give borrowed styles their meaning.

**A block and a run name their style; neither holds a size or a weight.** A document is a tree of blocks, a row of runs inside each, and styles referenced by name. So changing a style changes every block that names it. What reads the document (the saved text, the Markdown writer) reads one name. It does not read a pile of values to work a name back out of.

## A style name holds no whitespace

**A name a person types for a new style cannot hold whitespace (a space, a tab, a line break).** A code style's name is the language its Markdown fence declares. A fence's declaration ends at whitespace ("Rules the Markdown writer keeps" in [`DESIGN-application.md`](DESIGN-application.md)). A style named `my code` would be written out as a fence of language `my`. kspage's own names already join words with a hyphen (`column-body`).

**The entry point where a person names a style refuses such a name** ([`write/shape.kspl`](../write/shape.kspl)'s `add_style`; the reason reaches the screen as its own code in [`port/web/face_edit.kspl`](../port/web/face_edit.kspl)). `make test-conventions` checks the names the product writes.

**Do not push the refusal down into the model or the loader.** [`model/style.kspl`](../model/style.kspl)'s `Sheet.add` takes whatever name a saved text holds, and loading changes no name. Inserting a table, a chart or a code block derives its style name from one already in the table of styles. So a refusal down there would make a document that was read in silently refuse every insertion.

## How text flows

Flow fills a line with text until the next piece no longer fits, then starts the next line. Each rule below keeps that simple loop correct and fast.

A paragraph's text becomes lines and boxes like this:

```mermaid
flowchart TD
    rest["the rest of the paragraph's text"] --> ask{"does all the rest<br/>fit on this line?"}
    ask -->|yes| box["one box for it,<br/>with the width just measured"]
    ask -->|no| bisect["bisect for the last<br/>break that fits"]
    bisect --> part["a box up to the break"]
    part --> close["close the line:<br/>baseline, alignment"]
    close --> rest
    box --> last["go on with the next run,<br/>or close the last line"]
```

| The rule | Why |
| :-- | :-- |
| **A line breaks after whitespace, and beside any non-ASCII character.** | Breaking at whitespace alone would let prose written without spaces (Japanese, Chinese) run along one line forever |
| **Even where not one character fits, one character is placed, overflowing.** | Otherwise the line never advances and layout loops forever |
| **The whitespace at a break stays at the end of the earlier line.** | Moved to the start of the next, it would break the left edge |
| **The characters of a line sit on one baseline.** | A line is as tall as its tallest character, so only closing the line decides a character's vertical position |
| **Width is always measured for the whole text from the start of the line.** | Adding widths one character at a time drifts under an implementation that kerns (moves some letter pairs closer, such as "AV") |
| **The break is found by bisection** (halving the range until the break is found). | Below |
| **The measured width is returned with the break.** | Below |

**How the break is found:**

* **Do not measure one character at a time going forward.** Each measurement asks the typeface (`measureText` in a browser), so k measurements for a k-character line would set the cost of every keystroke's relayout. Ask once whether all the rest fits, and bisect only where it does not.
* **Bisection relies on "a longer text is never narrower than a shorter one".** Even under negative kerning the boundary slips by one character at most, and the caller measures an overflowing line again.
* **Snap the midpoint to a character boundary** (a Japanese character is several bytes). Searching only backwards or only forwards does not find the boundary ([`lay/line.kspl`](../lay/line.kspl)'s `midpoint`).

**Why the width comes back with the break:**

* **Do not measure the same text twice.** When "all the rest fits", the caller puts the text just measured into the box. Without the width returned, each box would cost two calls across the boundary. Most paragraphs do not wrap, so this halves the calls.
* **Do not return it after a bisection.** The break depends on the text alone, so the break returned lies before the point measured (`Inline.known_fit`).

### Text that has not changed is not measured again

**Each run remembers the widths it has measured, so a keystroke measures only the run typed into.** Measuring calls across the boundary (in a browser it asks the real typeface). So measuring the whole document at every keystroke would slow typing as the document grows. And unchanged text has an unchanged width ([`model/run.kspl`](../model/run.kspl)'s `wide`). Layout itself (boxes and lines) is never remembered.

The strongest answer is laying out only what is in view (as VS Code does). It is closed to kspage because it paginates: the page count and the page breaks need what is out of view. kspage also stays in step with the typing rather than catching up later, a common complaint.

**A run caches measurements, never layout.** It keeps two things:

| What is cached | What it holds |
| :-- | :-- |
| The width of its whole text | that width |
| The answers `fit` gave | keyed by "typeface, space, start", holding "break, width laid, width to the end" (`model/run.kspl`'s `Fit_at`) |

Caution: **Do not cache a box or a line.** Where a line wraps depends on the width the text before it used, which a run alone does not know.

The whole-text width spares a paragraph that does not wrap all measuring, but never hits for a run that wraps. Once the whole does not fit, `lay/line.kspl`'s `fit` bisects for the break, measuring about log(length) times, and the following lines are not whole texts either. With `fit`'s answers cached too, a keystroke measures 7 or 8 widths whatever the document's size. The one run typed into is measured again (its cache is thrown away there). **This keeps to "no box or line is cached"**. Caching the break alone would break it, since the break depends on the width the text before used. With the space in the key, the answer is fixed.

**A run caches for one "typeface and space" pair**, throwing the cache away when asked with another. Where one paragraph is one run (the commonest shape), every question from the start of a line carries the same space, so it keeps hitting. A run that starts partway along a line and wraps misses (its first line has a different space). It is measured again, which costs no more than having no cache.

**The cache lives in the run's own arena**, so `remember_fit` takes no arena argument.

Caution: **Do not let layout's arena be passed in.** The cache would point into memory freed at the next layout. In wasm that becomes a loop that never stops (a freestanding panic records it and enters `for {}`).

**Staleness is stopped by keeping invalidation in one place.** Only three methods of `Inline` change the text shown (`buf` and `shown` are `priv`), and they throw the cache away. Do not guess by a fingerprint of the content: the length misses `ab` -> `ba`, and even a strong fingerprint can collide.

**The typeface is part of the key**, since the same text in another typeface has another width. The typeface name is compared by address, not read. The styles' table owns that text, so replacing it changes the address. Another address holding the same text is merely a miss (slower, never a wrong width). This relies on a typeface's measurements never changing. kspage loads no typeface (it only names the environment's), so they cannot move while the page is open. **Whatever adds typeface loading must also throw the cache away when loading finishes.**

**Vertical metrics are cached per typeface.** They do not depend on the text (a line's height comes from the typeface), yet uncached they are asked for three times per box. A document uses no more typefaces than styles, so cached on the layout side, the questions drop to the number of typefaces. Put what is added in one place. Without a way to "give the height from the metrics", whoever caches the metrics would ask the typeface again for the height. That way is [`model/font.kspl`](../model/font.kspl)'s `line_height`. When the cache overflows, it simply fails to remember: an old entry is swapped out, and the next box measures again.

**An entry point that sets a value again does nothing when the value is the same.** In the plain-text shape "no value" arrives at every setting ([`expr/calc.kspl`](../expr/calc.kspl)'s `show_free`), so invalidating there would measure the whole document again.

Note: The same input always gives the same count, so the gate checks **the count of measurements**, not time. The same shape of document is typed at two sizes, and the counts must match. This covers a miss as well as a hit ([`../tests/wasm/store.mjs`](../tests/wasm/store.mjs)).

### A style is looked up by name once

**Layout remembers the last style it found, so the ten or so lookups one block makes cost about one.** Laying out one block looks up the same style name about ten times. The lookups collect headings, notes, running numbers, a fence's breaks, the arrangement, the box and the fill. The lookup scans the table from its end. So the further back a document's style sits in the table, the heavier each keystroke. Remembering the last style found removes that gap between the table's head and its end.

**The other products do not look styles up here**: Word and Writer store a reference to the style itself in a paragraph's attributes. kspage stores a name. A style is shared by name, and what is saved is a name too. Saved by number, an old text would point at another style the day a style is added. So the lookup is made faster without changing what is stored.

**The one style found last is remembered.** One block keeps asking for the same name, so nine times in ten that is enough. What is remembered is the style's place in the table, not the name's text, which could live in an arena freed first. A place is checked against the name the table holds.

**Do not remember "there was none"**: a style of that name added later could then never be found (adding does not clear the memory). The lookup checks the name before returning, so a stale memory is merely a miss.

**No index of names is added.** One memory is enough where it hits, and an index would shorten only the miss. A miss is a document pointing at a name not in its table. The fix for it is changing the faulty document. If documents full of misses appear, the answer is bisecting an array of indices sorted by name. (The order of `styles` itself must not move: saving and matching read that order.)

**`Map` is not used.** The key names come from a document, so colliding keys can be crafted (the decision in `../../std/docs/DESIGN-core.md`; the check is `make test-conventions`).

### The inner padding is not derived from the line height

The space between a fill's edge and its content is one setting, `Style.pad`, for all four sides. It is not a multiple of the line height.

The fill's band needs space between its edge and the content (a code block does).

Caution: **Do not make that space from a multiple of the line height.** A multiple acts between line and line, so it opens the prose's leading too, not just the band's edge (the text looks thinly stretched).

By Principle 6, **`Style.pad` is the space inside all four sides** ([`model/style.kspl`](../model/style.kspl)): the band spans the region's full width, and only the content is inset within it.

**Always restore the region's right edge.** The pen holds only one right edge per region, so otherwise the next sibling is laid out that much narrower ([`lay/flow.kspl`](../lay/flow.kspl)'s `close_block`).

### A code block's lines form one fence and one band

A code block is several one-line paragraphs, but it is painted as one background. One file decides which paragraphs belong together; such a group is a *fence*.

A code block is a row of paragraphs (one line is one paragraph). **Painted one at a time, the background shows through between the lines and the block comes out striped.**

Caution: **Do not decide this in two places, layout and Markdown export.** Changed in one alone, the block is one sheet on screen while each line is fenced separately in the text (or the reverse).

**[`model/fence.kspl`](../model/fence.kspl) alone decides where one fence starts and ends.** Consecutive paragraphs form one fence when they have the same style name, do not wrap, carry no marker, collect nothing and are arranged by flow. The name "code" is not looked for (the same style under another name would then not become a fence).

Layout **takes one fill band at the fence's start and stretches it to where the fence closes** ([`lay/flow.kspl`](../lay/flow.kspl)'s `Joint`). Do not open space before or after partway through (the background would show through there). Do not take a new band partway through either (an unused band would stay in the drawing side's count).

The space above and below is a multiple of the line height. The band closes at the height of the line's box, so with the line exact the text would touch the edge.

### The indent does not narrow the region

A fill or a rule starts at the region's left edge, before the indent; the indent becomes space inside the fill.

The band of the fill and the rule starts before the indent (`hold_panel` in [`lay/flow.kspl`](../lay/flow.kspl)). **Narrowed by the indent, it would leave a strip of background at a code block's left.** **In a list the fill would break off before the marker** (the marker sits inside the indent). So the indent becomes the left space inside the fill.

### The column set

Text in several columns, as in a newspaper, is one block whose style says how many columns. Its children are dealt into the columns, and the column heights are levelled.

**Word's columns are a section break**: an invisible mark, whose breaking, meshing and emptying happen out of sight. CSS's `column-count` holds no such mark and levels the heights as the content comes.

**A column set is one block** ([`lay/columns.kspl`](../lay/columns.kspl)). The style holds the number of columns (`Style.columns`), and the block's children are dealt into the columns. No invisible mark such as a section break is made. The block is the range itself, so a table or a slide can sit inside a column set without overflowing a column.

| The rule | Why |
| :-- | :-- |
| **Heights are measured first and levelled.** The children are laid out one at a time at a column's width and measured. Then they are rewound and dealt out | So the right column is not left empty when the content is short |
| A child is not split | Its two halves would land in different columns. So the heights do not always come out equal |
| Fewer children than columns is still a column set | Repacked, the column set would vanish from the screen |
| **A column's width is not held.** It follows from the number of columns and the gap between them (`Style.column_gap`) | A width field would allow settings where width × count + gaps does not add up to the region's width |
| **A column set does not cross a page**; where it does not fit, the whole set moves to the next page | Split across pages, the reader could not tell which column continues which |

## How a grid and absolute coordinates are laid out

The content of a table cell and of a slide's frame is laid out by flow. The grid and the slide only decide where each cell or frame goes and how wide it is.

Both **leave the content of a cell or a frame to flow** ([`lay/flow.kspl`](../lay/flow.kspl)'s `place_blocks`). Given the region's top-left corner and width, flow lays the content there and returns the height used.

**Do not write how content is arranged three times.**

| The rule | Why |
| :-- | :-- |
| **A grid column takes its set width, or else fits its widest content.** The row with the most cells decides the number of columns | Columns that do not fit shrink with their ratios kept; cutting only the excess would collapse the narrow ones first |
| A column's width is measured **as the real layout does it**: the cell is laid out once, and its box's right edge read | Added up instead, the indent, inheritance and wrapping would each be solved two ways |
| **A row is as tall as its tallest cell** | So only laying out its cells decides its height |
| **A laid-out cell keeps the shape cut by its column's width and its row's height** | Sized to its content, neighbouring cells would not line up |
| **The space after a paragraph goes in after the children** | Opened before them, it would split the block's inside and pack the gap to the next block tight |
| **A slide at absolute coordinates does not stretch**: it returns the slide's size, not its content's | Absolute coordinates mean that a slide's size is fixed first |
| **A child with no position is laid over the whole slide** | The caution below |

Caution: Dropped instead, a child with no position would make written content silently disappear. An apparent overlap can be fixed; something out of sight cannot.

## How the arrangements nest

**Each block's style says its arrangement** ([`model/style.kspl`](../model/style.kspl)'s `Arrange`), **and layout switches arrangement at that block.** Flow hands over to the grid only at a block whose style is `Arrange.grid`, and a cell's content returns to flow. So a table can sit in prose, a list in a table's cell, a table inside a table, and a table on a slide. All are laid out the same way.

Caution: **Do not let the document hold it.** With "this is a table" written into the tree, the tree could no longer be laid out by another arrangement. The arrangement is not inherited either, or even a paragraph in a table's cell would become a table.

**Flow is the entry point**: only flow knows what follows the previous element, so only flow can hand over to another arrangement. All three nest in one another. A table can sit in the flow or in a table's cell, a slide in the flow, and a table in a slide's frame. Every combination is laid out the same way:

```mermaid
flowchart LR
    flowing["flow<br/>(prose)"]
    grid["grid<br/>(a table)"]
    absolute["absolute coordinates<br/>(a slide)"]
    flowing -->|"a block whose style is grid"| grid
    flowing -->|"a block whose style is absolute"| absolute
    grid -->|"each cell's content"| flowing
    absolute -->|"each frame's content"| flowing
```

**A slide's size is set by its style** (`Style.width` / `Style.height`). That is what lets absolute coordinates sit in the flow. Partway along a flow there is no fixed size. So a size taken from the content would break "a slide's size is fixed first", and slides of one style would differ in size.

**Set both width and height.** A frame sits at absolute coordinates in px. With the width left to the container, the document would look different at each window width. A width of 0 means unset and becomes the container's width. Across, there is a container width to fall back on; down the page there is none, so a height of 0 is a slide 0 high.

**A frame's position is relative to the slide's top-left corner.** Only layout decides where the slide lands in the flow, so a `frame` read as screen coordinates would leave the content behind when the slide moved.

### A region's kind is its arrangement

On the editing screen a grey dotted line marks each prose, table or slide region. A region's kind comes straight from its outermost block's arrangement.

The line comes from bands layout leaves behind (`Page.regions`). The outermost block's arrangement decides: flow is prose, a grid a table, absolute coordinates a slide. **A region's kind is `Arrange` itself**; under another name, nobody would notice the style's arrangement and the region's kind drifting apart.

| The rule | Why |
| :-- | :-- |
| **Merge consecutive flow into one region** | Split per paragraph, one continuous piece of prose would look like as many regions as it has paragraphs |
| **Shrink a table's or a slide's region to its laid-out content's width.** Down the page it stays a band (the space before and after a paragraph belongs to its region too) | Otherwise a page-wide frame would surround a narrow table |
| **Regions are recorded only when the whole document is laid out** (`flow.layout`) | What lays out a region's inside again (`place_blocks`) also lays out nested content, so recording there would add a region per table cell |
| **The frame is drawn only on the editing screen**; printing and the one-slide-at-a-time view carry none | It is not content but a guide to which kind of tool is in use where the cursor is |

### Flow and the grid call each other

Two pairs of layout files call each other, and both pairs stay in `lay/`. The block side must set the pen's per-paragraph settings again for every paragraph.

[`lay/flow.kspl`](../lay/flow.kspl) and [`lay/line.kspl`](../lay/line.kspl) are split into "stacking blocks" and "building one line" (for the 1000-line cap per file). The line side holds the pen (`Pen`). The block side sets the per-paragraph settings on it again (alignment, leading, the marker at the start of a line). **Forgotten, a paragraph that sets no style of its own is laid out with the previous paragraph's settings.**

[`lay/flow.kspl`](../lay/flow.kspl) and [`lay/grid.kspl`](../lay/grid.kspl) import each other, so the cycle stays inside one folder ([Why the folders are split by 'what they know'](DESIGN-architecture.md#why-the-folders-are-split-by-what-they-know)).

Both entry points (`flow.place_blocks` and `grid.place_rows`) take the shape "How a grid and absolute coordinates are laid out" gives. **Neither looks at `at.h`** (the height of the region handed in): the content decides the height, and the caller what overflows.

## What layout recomputes every time

**Numbers that can be counted from the document are counted again at every layout and never stored.** They are a note's number, the table of contents, chapter and caption numbers, and list markers. They are also a graph's bars, a page number and a conditional style. The grounds are the same for each:

| The ground | What it gives |
| :-- | :-- |
| **Stored, a count would go stale** the moment something before it changed | Nobody could see that it had, since the stored text looks as right as a fresh one |
| **One function counts, and layout and export share it** | So the screen and the exported text cannot disagree |
| **What looks over the whole document is collected before layout starts** (headings, captions, a graph's values) | So an entry standing early still sees what comes after it |
| **A counted entry points at no text in the document** | So typing cannot delete it and the cursor cannot stand in it |

Each section below keeps only what is particular to its count.

### The run holds a note, and layout numbers it

A footnote's text is stored on the run it is attached to (`Inline.note`). **The number is not held**: it is the note's place in the list layout collects.

A note has two parts, the text it is attached to and the note's own text, and the run holds both. The mark and the list of notes both take the number from one place, the order of the collected list. So a mark reading 2 cannot stand beside a list entry reading 3.

**The mark appears after the run's text**: adding a note splits the run at the cursor and attaches the note to the first half. The second half does not inherit it (one note would show two marks). A run carrying a note is not joined with its neighbours (the mark would move into the middle of the text).

**The mark is superscript**, or it would look like part of the text. The box holds how far it is raised (`Box.rise`), added to the coordinates when the line is closed, so neither drawing nor hit-testing needs to know.

**A note is not laid out at the foot of the page.** That needs each page's body height first reduced by its notes' height, yet only laying out the body decides which notes land on a page. One pass cannot solve it, so layout stays one pass and notes appear where the block that collects them stands.

### The contents are built at every layout, not stored

The table of contents is a copy of the headings, built at every layout. **The style says which paragraphs are headings** (`Style.outline`; 0 is "not a heading", 1 the outermost level).

**The contents keep no list of style names** ("Styles are told apart by role, not by name" above). With "collect h1 and h2" written there, renaming a style would empty the contents.

**Headings are collected before layout starts** (`number.collect_headings`, which export shares). The contents can stand anywhere. Collected during layout, only the headings before the contents would be listed.

**No page numbers are listed.** They need the page each heading lands on, known only after the contents are laid out (its height pushes what follows). Listing them would mean laying out and writing back, or laying out twice, breaking the rule that layout is one pass.

### Chapter numbers are computed from depth at every layout

A heading's chapter number ("1.2.3") follows from how many headings at each depth come before it. So adding one chapter changes every later number, and every reference to them in the body, at the next layout.

**The style says the depth (`Style.outline`); the marker says how the number is written (`Marker.outline`).** Do not let the marker hold the depth too. The contents' indent and the chapter number's levels would then come from different values for one heading.

| The case | The number | Why |
| :-- | :-- | :-- |
| A depth-2 heading under a depth-1 heading whose style shows no number | "1.1" | **Depth is counted, not whether a heading shows a number.** Counted by marker it would be "1", losing which chapter it belongs to |
| Depth 3 straight after depth 1 | "1.0.1" | **A skipped depth shows as 0.** Packed to "1.1", the number would hide the skipped level. The choice is no invisible renumbering |

**Numbers are assigned after collecting** (`number.number_headings`, which export shares), since depth can be counted only with the headings in document order.

**A reference from the body shows the number alone.** A figure reference shows "Figure 2" whole because that is the figure's name. A chapter is named differently by context (`section 1.2`, `1.2 above`), so the surrounding words belong to the referring text. When the target is gone, `?` appears (a vanished number shown as it was would go unnoticed).

### Headings outside the chapter sequence

A title page, the table of contents and a colophon **are headings, but not chapters of the body**. Their style sets `in_chapters` to false: they stay in the headings map, and out of the table of contents and the chapter numbering.

**Do not take them out by setting the depth (`outline`) to 0.** 0 means "not a heading", so they would drop out of the headings map too and need a separate way to jump to them.

**Do not split "shown in the contents" and "counted in the numbering" into two settings.** Split, they make "not in the contents but taking a number" writable. The chapter numbers then get a hole (a combination that can be written will be written some day). Whether the chapter number is shown is a separate matter, held by the marker (`Marker`). "An unnumbered chapter shown in the contents" (a change log, say) takes the marker `none`.

**Other products do not do this.** Word and LibreOffice give the contents' own heading another style and drop it from navigation too. Google Docs cannot leave it out at all. The two are kept apart here, because people do want to jump to the contents. No separate way to jump to the contents is kept (it would be a second way to do one thing; Principle 6).

**The headings map also jumps to the document's two ends, placed at the ends of its row.** The position says the destination, so it is understood without reading the label.

### Captions count across the document; figures are cited by name

Figures and tables are numbered across the whole document, one sequence per caption style. The body refers to a figure by its name, and layout writes in the current number.

A figure's or a table's caption carries a running number, **counted across the whole document in one sequence per style name**. Figures and tables each count from 1 separately, and nothing in between resets them (a reset would renumber the figures after every figure added). A nested figure belongs to the same sequence, or it would disagree with the number referred to from the body. Captions are collected before layout (`collect_serials` in [`model/number.kspl`](../model/number.kspl)): the position in that list is the number, counted in one place (`serial_number`). The text around the number belongs to the style too (the `Figure ` and `. ` of `Figure 1. `).

**The body refers to a figure only by its target's name** (`Block.name`), and `number_refs` writes the visible `Figure 2` in at every layout. Only a block with a running number can be referred to. A number counted among siblings changes with whatever comes between. So a distant reference would point at something else. The referring run holds no text, so it is never split or joined with its neighbour, and Backspace deletes it whole. A name lands on the frame inside a slide, and outside one on the paragraph it stands in.

### List markers are given at layout, not stored

A list's bullet or number belongs to the style (`Style.marker`), and layout draws it. **Do not put it into the document as text.** Typing could then delete it, leaving "a list item with only its bullet gone". Something would also be needed to renumber.

**A number counts consecutive numbered siblings.** A paragraph without a marker in between restarts it at 1; otherwise two separate lists would number on from each other. A nested level is a separate sequence, so a child's number starts from 1.

**The counting is `style.next_ord`**, which layout (`flow`) and the Markdown writer both call.

**The marker's box points at nothing in the document** (`Box.inline` is null). Hit-testing must skip it. Otherwise a click inside the marker would land as a position in the body (in Japanese prose, the middle of a character). Being a box, it is drawn, printed and shown in the one-slide view with nothing extra.

**Do not move the body's left edge line by line.** The marker sits right-aligned inside the indent; shifting only the first line by the marker's width would misalign the wrapped lines.

**Where the indent is narrower than the marker, move the paragraph's left edge right until the marker fits.** Otherwise the marker overlaps the first character, and the number seems to vanish in a heading or a figure title with no indent set. It moves once per paragraph, so wrapped lines share the left edge. A set indent wider than the marker is kept (the left edge does not shift with the number of digits).

**Write it into the exported Markdown as text** where Markdown has no form for it (a figure's number). The text from the same counting is written as is (Markdown is not read back, so it never mixes into the document).

### A graph is built from its range at every layout

**The document holds only which values a graph shows** (`Block.chart`), never a bar's height or a value's text. The bars and labels are drawn again from the cells' current values at every layout.

**The range needs the table's name.** A graph stands in the flow with no table of its own, so `A1` alone names no cell (as with a formula in the body).

**What is read is the computed number** (`Inline.figure`), since the number cannot be recovered from the visible text with its grouping and units. So the document is recalculated before layout (`calc.recalc`).

Caution: **Do not add a drawing primitive.** A bar is a painted band (`Panel`), a line is a band's diagonal, and a value's text is a box (`Box`): all shapes layout already produces. A new primitive would be needed at once by the canvas and page export.

**Values are collected before layout starts** (`chart.collect_figures`), since the range finds its table by name anywhere in the document.

**Each way of gathering brings one style, named `chart-<the way of gathering>`** (`chart-bars`), found by name at the next insertion as a shape's is.

**The style sets the height** (`Style.height`). The core cannot derive one from the content: however many values there are, the height does not follow, as with a picture. So with no height set the graph is not laid out.

**Where the style sets no colour, a default colour is drawn** (`lay/chart.kspl`'s `drawn`). Transparent in a style with neither rule nor fill, a resolved range would show nothing. Whoever inserted it could only conclude the range was wrong (Principle 5). A shape differs: a frame with neither rule nor fill is useful as a shape that holds children, while a graph holds none.

Note: The default colour is the one insertion uses (`model/style.kspl`'s `DRAWN_COLOR`). Kept apart, an inserted graph and a graph read from a file would differ in colour (Principle 4).

A bar starts from 0, and the axis is drawn at 0; showing only the differences would make a short bar look long.

## How the cursor is held

The cursor is a place in the document ("this run, this byte"), not a point on the screen. So it stays put when the window is resized and the text moves.

Opening a document places the cursor at the first editable text. A new blank document accepts typing immediately.

The cursor is held as "which `Inline`, and which byte in it" ([`lay/caret.kspl`](../lay/caret.kspl)), **not in screen coordinates**. When the width changes the boxes move, but the position in the document does not, so the cursor survives relayout. (The `Inline` it points at lives in an arena relayout does not throw away.)

In exchange, a click must become a document position, so **each box records which `Inline`, and which byte in it, it came from** ([`lay/flow.kspl`](../lay/flow.kspl)'s `Box`).

| The rule | Why |
| :-- | :-- |
| **A click snaps to the nearest character boundary**; at equal distance it goes left | Text inserted mid-character would break it |
| **A click outside every box goes to the nearest box** | A click on the margin that did nothing would make the screen look dead |
| **Empty text gets a zero-width box** | The cursor can stand only on a box. Without one, an empty cell or paragraph could not be clicked into, and an added row would stay buried in the table at height 0 |
| **Vertical distance weighs more than horizontal** | At equal weight, the end of a neighbouring line can come out nearer. The cursor would then jump to a line other than the one clicked |
| **Deleting removes a character, not a byte** | Deleting one byte of a multi-byte character breaks the text |
| **The `Inline` holds its text**, copied in when added | So the caller need not keep it alive |

Caution: **Do not keep a reference to a run's text.** It grows and shrinks with editing, and moves when it does.

### Sideways moves follow the document; vertical moves follow laid-out lines

← and → step through the text in document order. ↑ and ↓ move to the line above or below on the screen, keeping the column.

Caution: **Do not stop ← and → at the boundary of a run or a paragraph.** Stopped there, the cursor could not get past the start of a paragraph. The order is layout's (a block's own inlines first, then its child blocks).

↑ and ↓ move across the laid-out lines, because only layout decides where a line stands. The target column is kept, and the move acts as a click at that column on the neighbouring line. **Call them after relayout.**

**The target column is set where vertical movement began**; taking the current column each time would pull it in at every short line passed. Forget it after a horizontal move (`collapse`), or ↑ or ↓ after ← or → would jump to the old column. Only vertical movement sets it again.

### A wrap position depends on how the cursor arrived

Where a line wraps, one place in the text is both the end of one line and the start of the next. Which line the cursor is shown on depends on how it got there.

The same `offset` belongs to two boxes at a wrap. So a position there reads both as "the end of the line before" and as "the start of the next line". Which one the cursor stands at depends on **how it got there** (`Caret.at_line_start`):

| How the cursor got there | Where it stands |
| :-- | :-- |
| **It came down from the line above, or the start of that line was clicked** | the start of the next line |
| **Anything else** | the end of the line before |

**Without the distinction, ↓ does nothing there.** The new position would be drawn at the end of the line before, so only the column would jump.

The flag comes from the click, so `hit_test` sets it. A position is at a wrap when it is at the start of a box that is not the start of its run. **Set a position through `at`**; writing the field directly would leave the remembered column and this flag as they were.

### The cursor's cell is outlined

The table cell the cursor is in gets an outline ([`lay/caret.kspl`](../lay/caret.kspl)'s `cell_frame`), in **the cell's shape as layout left it**, redrawn at every layout.

**The content's box does not stand in for it**: inset by the indent, it is narrower than the column, and neighbouring outlines would look misaligned.

**When nested, it is the innermost cell.** The outer cell holds the same inline too. Layout records cells outermost first, so searching from the end finds the inner one first.

**The outline and an editable formula are two things.** The outline only shows which cell the cursor is in, while a formula can be written only on the cell's first inline ([`expr/calc.kspl`](../expr/calc.kspl)'s `takes_formula`). So in a cell holding two runs the outline appears while the formula field stays closed.

### The selection is two points

**A selection is "where it started" and "where it is now".** **The direction it was extended is not stored.** Document order decides which of the two comes first (`Doc.index_of`), so a stored direction would say the same thing twice.

Caution: **Always collapse the selection when the text moves.** If only the current point moves, the editor treats text as selected when nothing is, and whatever is typed next deletes that range.

**The core computes the highlight rectangles.** Painting whole boxes would highlight an entire run when only a few characters are selected. Each rectangle needs the width up to the selection's end measured, and only the core holds the measurement entry point.

**An inline that has become empty stays in the tree**, or any cursor or box pointing at it would dangle; an empty run draws nothing.

### Home and End go to the laid-out line's ends

Home and End go to the start and end of the line on the screen, not of the paragraph, and never leave a table cell.

`Editor.move_to_edge` moves to the start or end of **the laid-out line, not the paragraph**. With Shift held it extends the selection there. It does not leave the container: the end of a table row would land in the next cell's text, so the edge is the cell's. Call it after layout, which decides a line's ends (as with ↑ and ↓).

Two boxes are on one line if they overlap vertically; compared by top edges, a line mixing character sizes would read as two.

### Select all runs from the first run to the last

`Editor.select_all` selects from the first block's first run to the last block's last run: **the whole document, not the page in view**.

**A block without any text is skipped** (a picture or a shape has nowhere for the cursor to stand). The runs at both ends are found in one place (`Block.first_run` / `last_run`), so what "the first run" means cannot differ between the ends.

### The text being composed goes into the document too

While the IME is composing, its text sits in the document like any other text, so layout and drawing handle it unchanged. It enters the undo record only when it is committed.

Typing Japanese needs the text being composed on screen until it is committed.

Caution: **Do not hold it separately, outside the document.** Wrapping, style inheritance and baseline alignment would then all need a second solution for the composition alone.

Instead, the composition goes into the document, and the cursor records how many bytes before it are being composed. Layout and drawing work as usual, unaware of it. **Until committed, the text can vanish at any time.** Replacing it deletes the old composition, then inserts the new (inserting without deleting would pile it up at every keystroke).

It is told apart by a mark on the box ([`lay/flow.kspl`](../lay/flow.kspl)'s `Box.composing`). **Layout does not set the mark**; `mark_composing` does, at every layout, since the rebuilt boxes lose earlier marks. It marks every box the composition covers, since a composition can cross a wrap.

Caution: **Typing and deleting during a composition go to the composition's handling**: typing commits it first; deleting cancels it whole. Cutting into its middle would leave the next replacement unable to know how much to delete.

**The composition does not go into the undo record.** It can vanish at any time, so recorded as typed, a cancelled composition would leave a step whose undo restores nothing. The commit is recorded, as one "typed" step ([`write/typing.kspl`](../write/typing.kspl)'s `commit_preedit`).

**So do not add anything that merely clears the composing mark.** The text would stay in the document with nothing in the record, a hole that cannot be undone. Moving the cursor and typing both go through the commit first.

A composition begun after deleting the selection differs. That deletion is an edit of its own, so it stays in the record. It does not return when the composition is cancelled (the undo brings it back).

## The editor and the undo record

Every change to the document goes through one `Editor` ([`write/edit.kspl`](../write/edit.kspl)), which holds the document, the cursor and the undo record. Each change records how to undo itself before it happens.

Caution: **Do not change the document directly.** Nothing is recorded, leaving a hole the undo cannot restore. Only two operations in `Editor` change text (insert and delete), and both record their inverse first.

One edit, and later its undo, go like this:

```mermaid
sequenceDiagram
    participant C as A command (typing, a style, a paste)
    participant E as Editor (do_*)
    participant D as The document
    participant R as The undo record
    C->>E: insert abc
    E->>R: record the inverse: delete abc
    E->>D: insert abc
    Note over C,R: later, the person presses undo
    E->>R: take the newest step
    E->>D: apply its inverses, newest first
    E->>R: record the inverse of each, for redo
```

### Undo is held as inverse operations

**Undo keeps no copies of the document**, since the cursor points at the `Inline` itself and a swapped-in copy would leave it dangling. Each edit records its opposite (deleting for an insertion, inserting again for a deletion), and undo applies those.

Caution: **Copy the text before deleting it**; afterwards it cannot be read.

**Apply the inverses newest first**, or the positions the later operations looked at would have shifted. While undoing, redo records the inverse of each inverse (the original operation) onto a new step.

**Once something new is written, discard the redoable steps.** Otherwise a redo after undoing and writing something else would apply edits to text that no longer matches.

### Undo then redo restores the document byte for byte

**Undo, redo, and the document is back to the same bytes.** The undo rests on this: change only the undoing side, and a redo can trample the earlier edit. The invariant is checked (`../tests/wasm/edit.mjs`).

### Where a step ends is decided outside the core

**What one undo takes back is a *step*.** **Continuous typing is one step, not one per keystroke.** Otherwise undoing one sentence would take dozens of presses. A step is cut when the cursor moves and when a composition is committed.

**A pause between keystrokes does not cut a step.** The core has no clock. So a caller that needs a cut at a pause calls `break_group`, as the browser side does after a pause in typing.

A step that changed nothing is not recorded; its undo would restore nothing.

### The record holds every kind of instruction in one row

The undo record is one list for every kind of edit (text, sizes, styles, frames, the paper). So undo always goes back in the order things were done.

The undo record is one row of instructions, each undoing one edit, whatever the edit touched. An edit can touch text, a cell's size, a row or column, a run, a style, a frame, the paper and the rest. The kinds are the variants of `Op` in [`write/record.kspl`](../write/record.kspl).

Caution: **Do not split them into separate records.** The undo order would split, and interleaved edits would stop adding up. Applying one style puts the split, the apply and the join in one step.

**Undo and redo go through the same path** (`apply_inverse`); written twice, a new kind of instruction would reach only one of them.

| The instruction | How it is held | Why |
| :-- | :-- | :-- |
| **A cell's size is one instruction for columns and rows alike** (a field says which) | It remembers "unset" too | Split in two, the same shape of record would exist twice. Restored as 0, a size would appear where the content had been fitted |
| A drag of a cell's border | The setting saved when the drag began undoes the repeated moves; the step boundaries are at the grab and the release | Dragging does not grow the record, and one drag is one undo |
| **A frame's position remembers "unset" too** | as `Option` | A frame with no position covers the whole slide, so restored as a 0-size rectangle it would vanish |
| **The paper settings are saved whole** | all fields at once (the same reason as a style's look) | In the paper, 0 means "no pagination" (height), "the container's width" (width) and "no limit" (body width). Saved field by field, "not set" and "was 0" would look the same |

**Replacing a setting with the same value adds no step.** The screen sends all seven fields whichever one is touched. So steps whose undo restores nothing would otherwise pile up. The text sent is compared whole (field by field, a field added later would be forgotten).

### Splitting a paragraph adds a block

Enter splits the paragraph at the cursor into two blocks, and Backspace at a paragraph's start joins it to the one before. Enter at the end of a heading starts a paragraph in the style the heading names to follow it.

Enter **splits the paragraph at the cursor** (`Editor.split_block`): the runs after it move to a new block, and a run straddling the cursor is split first. Backspace at a paragraph's start is the inverse: its runs move to the end of the previous paragraph and the emptied block is removed (`Editor.join_prev`). Only a paragraph's start joins, or the text before the cursor would move.

**A style names the style that follows it when a paragraph is ended at its end; naming none means the same style again.** Otherwise Enter at the end of a heading makes another heading, and the outline and the table of contents each gain an empty line. Word calls the field "Style for following paragraph", Writer and InDesign "Next Style"; Google Docs hard-wires Normal after a heading.

**It acts only at the paragraph's end** (`follows` in [`write/block.kspl`](../write/block.kspl)). Split partway along, the halves are one paragraph cut in two. Both keep the style, as in every product with the field. A paste does not use it: it puts in one text, not a person ending a paragraph. So every line it makes takes the style where it lands.

**Naming none is the default, so nothing already saved changes.** Such a style writes nothing into the file (naming itself would say the same thing a second way). A name found in no table counts as none, so the follower is looked up when splitting, not bound when the style is read.

Caution: **Leave a run in each paragraph.** The cursor can stand only on a box, which appears only where a run is. A split at the end or the start leaves one side empty. So that side gets an empty run, or it could not be clicked into.

**Where splitting and joining do not happen:**

| Where | What happens | Why |
| :-- | :-- | :-- |
| **Inside a table cell** | Enter does not split, and Backspace does not join at a cell's start | A cell is a row's child, so a paragraph beside it would give that row alone one more cell. The rows' column counts would then disagree (cells grow only by adding rows and columns) |
| A paragraph with nested blocks | It is not joined | Its children would move with it, and nothing decides whether before or after the previous paragraph's children |

**Deleting a selection that crosses paragraphs joins them the same way** (`Editor.delete_span`). Deleting only the text would leave empty paragraphs standing, still showing their markers (a list's "•", a number). The following paragraphs are joined on until the one where the selection ended has merged into the cursor's. The deletion and the joining are one step; as two, one undo would produce a state nobody remembers writing.

**Stop where joining is impossible**: across a cell only the content is deleted, and joining stops at a paragraph holding a table or a slide.

**Layout is asked whether joining is allowed** (`caret.cell_of`): the document says neither "table" nor "slide", so only layout tells whether a block is a cell. So the joining lives in `block`, and `edit`'s `delete_selection` deletes text only.

### Copy and paste count paragraphs by line breaks

Copying writes one line break between paragraphs, and pasting makes one paragraph per line. `caret.selection_into` (selection to text) and `Editor.paste` (text into the document) follow one rule: **a paragraph break is one line break**.

**An `Inline` cannot hold a line break** (breaking lines is layout's job), so pasting makes one paragraph per line break. Folded into one paragraph, the pasted lines could be restored only by typing each break again.

Caution: **Do not write a line break where a run is split inside a paragraph.** Applying a style splits a run, so copied text would gain lines just because something was made bold. What counts is where the enclosing block changes, not the runs.

**Inside a table cell, a line break is folded into a space.** A cell's paragraph is not split ("Splitting a paragraph adds a block"). Dropped, part of what was pasted would silently vanish.

**One paste is one undo**: the splitting and inserting share one step, which the caller opens (`Editor.split_here` opens none). With one undo per line, nobody could tell how many presses undo a wrong paste.

Cut has no operation of its own: it copies, then calls **the deletion of the selection**.

### Find returns only a range; replace selects, then types over

Find only reports where a match is, and never changes the document. Replace selects the match and types over it, as a person would.

[`lay/find.kspl`](../lay/find.kspl) returns only a range in the document, and **must not touch the document**, or merely searching would add to the undo record.

| The rule | Why |
| :-- | :-- |
| **A match crosses runs** | Applying a style splits them, and text including a bold part must still be found |
| A match does not cross paragraphs | There is no character between them, so the end of one and the start of the next would be found as one text |
| It walks in layout order (a block's own inlines first, then its children) | Otherwise "find next" would not move in the order seen |
| **Start matching only at character boundaries** | Byte by byte, a match could begin in the middle of a Japanese character, and the selection would split it |

Replace **selects and then types over** (`Editor.replace_next`); typing deletes the selection, so one replacement is one undo.

**"Replace all" does not wrap around at the end.** It would find the replacement text again and loop forever (replacing "a" with "aa" does exactly that). Skip a match that cannot be replaced and carry on (stopping would leave everything after it unreplaced).

**The visible text of a formula cell is not typed over**, since the next recalculation would write it back. Search still finds it, since being led to where a value is beats not finding it.

**The find field shows the count found as it is typed**, so how many places "Replace all" will touch is in view before the press. 0 is shown too, since a blank could not tell "not counted" from 0. What is counted is places found, so with a formula cell among them fewer are replaced. Matches do not overlap, since replacing goes on from the end of what it found, so the count and the outcome agree. It counts again at every redraw.

### Compound operations are split into files by purpose

Only `write/edit.kspl` changes the document; larger operations are built on it, in files split by what they change.

`Editor`'s methods are split into two parts:

* [`write/edit.kspl`](../write/edit.kspl): the operations that change the document, `do_*`, and the undo record;
* files of compound operations built on them, split by what they change. **A file is capped at 1000 lines** (Principle 3), so keep splitting by purpose as they grow; each file's share is in [kspage](../README.md).

**The document changes only through `write/edit.kspl`'s `do_*`**, the one place that records undo; compound operations only call it.

An extension method is a method declared on a type in another file. It is visible only where its file is imported. So code using `Editor` **imports every file holding an operation it calls**.
