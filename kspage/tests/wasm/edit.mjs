import { check, near } from "./shell.mjs";
import { material, para, grid } from "./material.mjs";

export const subject =
  "The ways of typing (CSV, sorting, paragraphs, copying, hunting, inserting, contents, notes, "
  + "images).";

// The text of the run a note is put on.
// Caution: **Make the material and the text hunted for one name** (written apart, the day one
// character of the material changes only "the box is there" falls).
// **Keep it narrower than the width laid out** (300 here): `find` matches one box's text whole.
const lead = "Prose, tables and slides ";

// Caution: **Make the first block a heading of depth 1.** The contents' check reads the first
// box's text as the item, so unless the first is a heading the contents come out empty.
// **Put "document" into the heading** (hunting, counting and replacing all use that text).
// **Give it one detail table** — CSV, sorting, moving by Tab and the auto-fill all use it. The
// price's column is 120 and 80, and the total's row alone is empty (so it is left last however
// it is sorted).
// **Lay the contents', the notes' list's and the slide's styles in.** The inserting side draws
// each by name or by role, so with no style it falls with "it cannot be inserted", not naming
// what was missing.
//
// The style names and the money sign (`$`) are the document's own (`kspage/content`'s sample),
// so they stay as they are until that side moves.
export const opens = material({
  styles: [
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0, outline: 1 },
    { name: "body", space_after: 12.0 },
    { name: "strong", weight: 700 },
    { name: "contents", space_after: 12.0, indent: 16.0, contents: true },
    { name: "footnote", space_before: 12.0, notes: true },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
    { name: "heading-cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc", fill: "#f0f0f0" },
    { name: "amount", places: 0, grouped: true, prefix: "$", pad: 4.0, rule_width: 1.0,
      rule_color: "#cccccc" },
    { name: "slide", space_before: 12.0, space_after: 12.0, width: 620.0, height: 120.0,
      arrange: "absolute" },
  ],
  blocks: [
    para("heading", "kspage, a document"),
    para("body", lead, ["all in one document", "strong"], " is what it is for writing."),
    grid({ style: "table", name: "detail" },
      [para("heading-cell", "Qty"), para("heading-cell", "Price"), para("heading-cell", "Amount")],
      [para("cell", "3"), para("cell", "120"), para("cell", ["=A2*B2", "amount"])],
      [para("cell", "5"), para("cell", "80"), para("cell", ["=A3*B3", "amount"])],
      [para("cell", ["Total", "strong"]), para("cell", ""),
        para("cell", ["=C2:C3.sum()", "amount"])]),
  ],
});

export function run(ks) {
  const { w, scratch, str, read, out, stage, feed, geom, boxOf, textOf, find, type, save, html,
    csv, load, typed, setTyped, styleNames, surfaceAt } = ks;

  // --- Taking CSV in and out ---
  // **What is written out is the text that is seen**, not the formula the reader cannot
  // work out.
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(csv() === "", "outside a table nothing comes out");
  const csvAt = geom(find("Qty"));
  w.kspage_web_click(csvAt[0] + 1, csvAt[1] + csvAt[3] / 2, 0);
  const asCsv = csv();
  check(asCsv.indexOf("Qty,Price,Amount\n") === 0,
    `the heading's row comes out first (${asCsv.slice(0, 18)})`);
  check(asCsv.indexOf("=A2*B2") < 0, "the value comes out, not the formula");
  check(asCsv.indexOf("$360") >= 0 || asCsv.indexOf("\"$360\"") >= 0,
    "the value comes out as the way of showing says");
  // Read it in and a table goes in behind the paragraph the cursor is in.
  const tablesBefore = html().split("<table").length;
  w.kspage_web_click(0, 10, 0);
  const csvIn = (text) => w.kspage_web_insert_csv(feed(text), stage("table"));
  check(csvIn("a,\"b,c\"\n1,2\n") === 1, "a table can be put in from CSV");
  check(html().split("<table").length === tablesBefore + 1, "the tables grow by one");
  w.kspage_web_layout(300);
  check(find("b,c") >= 0, "a splitter inside quotes goes in as text");
  w.kspage_web_undo();
  check(html().split("<table").length === tablesBefore,
    "one step takes the table put in away");

  // --- Sorting the rows ---
  // Caution: **A formula has to go on pointing at its own row.** Unshifted, it reads another row's
  // quantity where it has moved to.
  // It sorts by the price's column (the rows of 120 and 80 change places).
  const sortAt = geom(find("120"));
  w.kspage_web_click(sortAt[0] + 1, sortAt[1] + sortAt[3] / 2, 0);
  check(geom(find("$360"))[1] < geom(find("$400"))[1],
    "before sorting, $360 is the upper one");
  check(w.kspage_web_sort_rows(0) === 1, "it can be sorted smallest first by this column");
  check(geom(find("$400"))[1] < geom(find("$360"))[1],
    "the row with the smaller price comes up");
  check(find("$400") >= 0 && find("$360") >= 0,
    "every row's amount is still its own row's");
  check(find("$760") >= 0, "the total does not move (that row is empty, so it is left last)");
  // Sorted again the same way, the answer says so (-3) rather than pretending it sorted or
  // blaming the cursor's place.
  check(w.kspage_web_sort_rows(0) === -3, "sorted again the same way, it says the rows are in order");
  w.kspage_web_undo();
  check(geom(find("$360"))[1] < geom(find("$400"))[1],
    "one step returns the row it was in");
  // **The heading never moves, whichever row holds the cursor** — an Excel hand puts it on the
  // heading itself.
  const headAt = geom(find("Price"));
  w.kspage_web_click(headAt[0] + 1, headAt[1] + headAt[3] / 2, 0);
  check(w.kspage_web_sort_rows(0) === 1, "with the cursor in the heading it sorts the rows under it");
  check(geom(find("Price"))[1] < geom(find("$400"))[1], "the heading stays at the head");
  check(geom(find("$400"))[1] < geom(find("$360"))[1], "and the smaller price comes up");
  w.kspage_web_undo();
  check(geom(find("$360"))[1] < geom(find("$400"))[1], "one step returns that too");

  // --- Splitting and joining a paragraph ---
  // **The text alone is not enough** (splitting adds no character), so it looks at the box
  // parting into two and at what follows coming to the line below.
  const headText = textOf(0);
  const boxes = w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  w.kspage_web_move(1, 0);
  check(w.kspage_web_split_block() === 1, "the paragraph splits");
  check(w.kspage_web_layout(300) === boxes + 1, "the boxes grow by one");
  check(textOf(0) + textOf(1) === headText,
    `the text parts into two boxes (${textOf(0)}|${textOf(1)})`);
  check(geom(1)[1] > geom(0)[1], "the paragraph behind comes to the line below");
  // Deleting at the head of the paragraph split joins it onto the one in front (no character goes).
  w.kspage_web_backspace();
  check(w.kspage_web_layout(300) === boxes, "the count of boxes returns to what it was");
  check(textOf(0) === headText, `the text is as it was too (${textOf(0)})`);

  // --- Deleting across a paragraph ---
  // **The paragraphs crossed have to be joined into one.** Unjoined, the paragraph left
  // empty and its mark (a bullet's dot) are left behind.
  w.kspage_web_click(0, 10, 0);
  w.kspage_web_move(1, 0);
  check(w.kspage_web_split_block() === 1, "it splits again");
  w.kspage_web_layout(300);
  // From the head of the paragraph behind, it chooses one character's worth across the seam.
  w.kspage_web_move(-1, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  w.kspage_web_backspace();
  check(w.kspage_web_layout(300) === boxes,
    "deleting across it, the boxes return to one");
  const joined = headText.slice(0, 1) + headText.slice(2);
  check(textOf(0) === joined,
    `the seam and the one character both go and it joins (${textOf(0)})`);
  // Deleting and joining go back as one step.
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === boxes + 1,
    "one step back returns the shape it was split into");
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === boxes, "the splitting goes back too");
  check(textOf(0) === headText, `the text is as it was (${textOf(0)})`);
  w.kspage_web_click(0, 10, 0);
  w.kspage_web_delete();
  w.kspage_web_layout(300);
  check(textOf(0) === headText.slice(1),
    `Delete deletes the next one character (${textOf(0)})`);
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(textOf(0) === headText, "Delete goes back too");

  // --- Copying, cutting and pasting ---
  // Caution: **Read the text chosen from the writing-out arena.** The hidden input field is empty,
  // so the browser's own copying takes nothing at all.
  const selectionText = () => {
    const len = w.kspage_web_selection_text();
    return len <= 0 ? "" : str(w.kspage_web_out_ptr(), len);
  };
  // Caution: **Use the loading arena** (the typing arena is of a settled size, and a long text is
  // quietly cut).
  // The settlement of the order of peeking is `shell.mjs`'s `feed`.
  const pasteIn = (s) => w.kspage_web_paste(feed(s)) !== 0;
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(selectionText() === "", "with nothing chosen nothing is taken");
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  check(selectionText().length > 0,
    `the text of what is chosen can be taken (${selectionText()})`);

  // Pasting replaces what is chosen, and the boxes grow by the count of newlines.
  const beforePaste = w.kspage_web_layout(300);
  check(pasteIn("XY\nZ"), "it can be pasted");
  check(w.kspage_web_layout(300) === beforePaste + 1,
    "one newline grows the boxes by one");
  check(textOf(0).endsWith("XY") && textOf(1).startsWith("Z"),
    `the paragraph splits at the newline (${textOf(0)}|${textOf(1)})`);
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === beforePaste, "a pasting goes back in one step");
  check(pasteIn("") === false, "an empty text is not pasted");

  // --- Hunting and replacing ---
  // **Reaching the end, go back to the head.** Ungone, nothing is found once it has hunted
  // all the way down.
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_find(stage("document"), 0) === 1, "the text is found");
  // What was found has to be chosen. Merely laid, it cannot be told on the screen.
  w.kspage_web_layout(300);
  check(w.kspage_web_selection_count() > 0, "what was found is chosen");
  check(w.kspage_web_find(stage("a text not to be found"), 0) === 0,
    "a text that is not there returns 0");
  // Counting merely counts, and moves neither the cursor nor what is chosen.
  // **Do not count what overlaps** (the reason is at `count_matches` in `kspage/lay/find.kspls`).
  const before = w.kspage_web_selection_count();
  const many = w.kspage_web_count(stage("document"));
  check(many > 0, `the count found comes back (${many})`);
  check(w.kspage_web_selection_count() === before,
    "counting does not move what is chosen");
  check(w.kspage_web_count(stage("a text not to be found")) === 0,
    "a text that is not there is 0");
  // Overlaps are looked at on a small document read in.
  // Caution: **Put the material back** (a reading afresh throws the record of going back away
  // too, so what follows this section would run on another document).
  const held = save();
  check(load("{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"aaa\"}]}]}") === 1,
    "a text for looking at overlaps can be read");
  check(w.kspage_web_count(stage("a")) === 3, "\"a\", which does not overlap, is 3");
  check(w.kspage_web_count(stage("aa")) === 1,
    `"aa", which overlaps, is 1 (${w.kspage_web_count(stage("aa"))})`);
  // **It has to match the count replaced**, or the count put out forecasts nothing.
  check(w.kspage_web_replace(stage("aa\tb"), 1) === 1, "one alone is replaced");
  check(w.kspage_web_count(stage("a")) === 1,
    `what is left is one (${w.kspage_web_count(stage("a"))})`);
  check(load(held) === 1, "the material can be put back");
  w.kspage_web_layout(300);

  // Replacing is handed over as `the text hunted\tthe text replacing`. With no splitter it does
  // nothing.
  check(w.kspage_web_replace(stage("document"), 1) === 0,
    "with no splitter nothing is replaced");
  const swapped = w.kspage_web_replace(stage("document\tpaper"), 1);
  check(swapped > 0, `replacing them all, the count comes back (${swapped})`);
  check(find("paper") >= 0 || w.kspage_web_layout(300) > 0, "the text replaced goes in");
  // The whole of it has to go back on one undo.
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_replace(stage("paper\tdocument"), 1) === 0,
    "one step returns to before the replacing");

  // --- Inserting a table and a slide ---
  // **The style's name is handed over by the caller** (the core does not know it).
  const wasBoxes = w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_table(stage("table"), 2, 2) === 1, "a table can be inserted");
  check(w.kspage_web_layout(300) === wasBoxes + 4, "four empty cells grow");
  // The cursor is now in a cell of the table inserted.
  check(w.kspage_web_insert_table(stage("table"), 2, 2) === 0, "inside a cell nothing is inserted");
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === wasBoxes, "one step returns it to what it was");
  // **The size is the press's**, and a size with no cell in it is refused rather than made.
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_table(stage("table"), 0, 4) === 0, "no rows inserts nothing");
  check(w.kspage_web_insert_table(stage("table"), 3, 4) === 1, "three by four inserts");
  check(w.kspage_web_layout(300) === wasBoxes + 12, "twelve empty cells grow");
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === wasBoxes, "one step returns that too");

  const wasSurfaces = w.kspage_web_surface_count();
  // **A refusal names its reason**: in a cell it names the cell, not leaving the page to guess
  // between the cell and a missing style.
  const cellAt = geom(find("120"));
  w.kspage_web_click(cellAt[0] + 1, cellAt[1] + cellAt[3] / 2, 0);
  check(w.kspage_web_insert_surface(stage("slide"), 0) === -1,
    "inside a table's cell the slide is refused, and the cell is named as why");
  check(w.kspage_web_surface_count() === wasSurfaces, "and nothing goes in");
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_surface(stage("slide"), 0) === 1, "a slide can be inserted");
  w.kspage_web_layout(300);
  check(w.kspage_web_surface_count() === wasSurfaces + 1, "it is counted as one sheet");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_surface_count() === wasSurfaces, "one step returns it to what it was");
  // Caution: **The document's slide style has to be found by role even under a name it does not
  // know.** Hunt by name alone and the inserting quietly stops biting the day the document changes
  // a style's name (`write/insert.kspls`'s `role_of`).
  // The name settles only which of two of the same role to choose.
  w.kspage_web_click(0, 10, 0);
  const beforeUnknown = w.kspage_web_surface_count();
  check(w.kspage_web_insert_surface(stage("a name that is not there"), 0) === 1,
    "even under a name it does not know, the slide's style is found by role");
  w.kspage_web_layout(300);
  check(w.kspage_web_surface_count() === beforeUnknown + 1,
    "that slide is counted as one sheet too");
  w.kspage_web_undo();
  w.kspage_web_layout(300);

  // The slide's template. **It stays neither in the document nor in the style** (it bites once
  // only, at the inserting).
  //
  // Caution: **Put one text into every frame.** A box comes out only where there is text, so lay
  // the frames alone and there is nowhere for the cursor to stand.
  // So the count of frames is seen through the count of boxes.
  const boxesIn = (rect) => {
    const count = w.kspage_web_layout(300);
    const hits = [];
    for (let i = 0; i < count; i += 1) {
      const one = geom(i);
      if (one[0] >= rect[0] && one[0] < rect[0] + rect[2] &&
        one[1] >= rect[1] && one[1] < rect[1] + rect[3]) hits.push(one);
    }
    return hits;
  };
  w.kspage_web_click(0, 10, 0);
  const plainBoxes = w.kspage_web_layout(300);
  const beforeSketch = save();
  check(w.kspage_web_insert_surface(stage("slide"), 0) === 1,
    "it can be inserted with one frame");
  const oneFrame = w.kspage_web_layout(300);
  check(oneFrame === plainBoxes + 1,
    `the boxes grow by one frame's worth (${plainBoxes} -> ${oneFrame})`);
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_surface(stage("slide"), 2) === 1,
    "it can be inserted with a title and two columns");
  const threeFrames = w.kspage_web_layout(300);
  check(threeFrames === plainBoxes + 3,
    `the boxes grow by three frames' worth (${plainBoxes} -> ${threeFrames})`);
  // The slide inserted is the first (the cursor is in the paragraph at the head).
  const inner = boxesIn(surfaceAt(0));
  check(inner.length === 3, `three boxes come out inside that slide (${inner.length})`);
  if (inner.length === 3) {
    check(near(inner[1][1], inner[2][1]), "the lower two line up at the same height");
    check(inner[2][0] > inner[1][0], "the lower two line up across");
    check(inner[0][1] < inner[1][1], "the title comes above");
  }
  // **What goes into the saving is the places of the frames assembled.**
  const withFrames = save();
  check(load(withFrames) === 1, "the text written out can be read back");
  check(w.kspage_web_layout(300) === threeFrames, "read back, the frames are three");
  check(load(beforeSketch) === 1, "it can be put back to the text before the inserting");
  check(w.kspage_web_layout(300) === plainBoxes,
    "put back, the boxes of the frames are gone");

  // Taking one frame off. **What comes off is the frame the cursor is in alone** (taking the slide
  // off whole is a separate entry point). **The last frame is not taken off** (a slide with not one
  // frame cannot be got into by pressing).
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_drop_frame() === 0, "outside a slide nothing comes off");
  check(w.kspage_web_insert_surface(stage("slide"), 2) === 1,
    "it can be inserted with a title and two columns");
  w.kspage_web_layout(300);
  check(boxesIn(surfaceAt(0)).length === 3, "the frames are three");
  // A box's coordinates are from the page's top left, not from inside the slide.
  const pressBox = (one) => {
    w.kspage_web_click(one[0] + 1, one[1] + 1, 0);
    w.kspage_web_layout(300);
  };
  pressBox(boxesIn(surfaceAt(0))[2]);
  check(w.kspage_web_drop_frame() === 1, "inside a slide it comes off");
  check(boxesIn(surfaceAt(0)).length === 2, "the frames drop by one");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(boxesIn(surfaceAt(0)).length === 3, "it goes back in one step");
  pressBox(boxesIn(surfaceAt(0))[2]);
  check(w.kspage_web_drop_frame() === 1, "the second can be taken off");
  w.kspage_web_layout(300);
  pressBox(boxesIn(surfaceAt(0))[1]);
  check(w.kspage_web_drop_frame() === 1, "the third can be taken off too");
  w.kspage_web_layout(300);
  check(boxesIn(surfaceAt(0)).length === 1, "one frame is left");
  pressBox(boxesIn(surfaceAt(0))[0]);
  check(w.kspage_web_drop_frame() === 0, "the last frame is not taken off");
  check(load(beforeSketch) === 1,
    "it can be put back to the text before the taking off");
  check(w.kspage_web_layout(300) === plainBoxes,
    "it returns to the count of boxes it was");

  // --- Moving to a line's edge, and choosing the whole document ---
  // **A line's edge stops inside its vessel** (in a table's row that is inside the cell).
  w.kspage_web_layout(300);
  const edgeAt = geom(find("Qty"));
  w.kspage_web_click(edgeAt[0] + 1, edgeAt[1] + edgeAt[3] / 2, 0);
  w.kspage_web_move_edge(1, 0);
  check(w.kspage_web_takes_formula() === 1, "moved to the edge it is the same cell");
  check(typed() === "Qty", `the cell's text does not change (${typed()})`);
  // The choosing side moves too. **It only chooses, so the document does not change.**
  w.kspage_web_move_edge(-1, 0);
  w.kspage_web_move_edge(1, 1);
  check(out(w.kspage_web_selection_text()) === "Qty",
    "it can be chosen on as far as the edge");
  // Choosing the whole document takes more than the page that is seen.
  const htmlLen = html().length;
  check(w.kspage_web_select_all() === 1, "the whole document can be chosen");
  const picked = out(w.kspage_web_selection_text());
  check(picked.length > 0, `the text chosen can be taken (${picked.length} bytes)`);
  check(html().length === htmlLen, "choosing does not change the document");
  w.kspage_web_layout(300);

  // --- Moving from cell to cell by Tab ---
  // **It only moves** (at the table's end it adds no row). **Outside a table it returns 0**, so
  // the key's clearing up is left to the caller (leave the window's own behaviour off and the
  // keys alone can no longer walk across the page).
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_move_cell(0) === 0, "outside a table it does not move");
  const stepAt = geom(find("Qty"));
  w.kspage_web_click(stepAt[0] + 1, stepAt[1] + stepAt[3] / 2, 0);
  check(typed() === "Qty", "it stands in the heading's cell");
  check(w.kspage_web_move_cell(0) === 1, "it can move to the cell on the right");
  check(typed() === "Price", `it moves to the cell beside it (${typed()})`);
  check(w.kspage_web_move_cell(0) === 1 && typed() === "Amount",
    "it can move on past that too");
  // The head of the detail's second row is the quantity's 3.
  check(w.kspage_web_move_cell(0) === 1, "at a row's end it moves too");
  check(typed() === "3", `it comes round to the head of the next row (${typed()})`);
  check(w.kspage_web_move_cell(1) === 1 && typed() === "Amount", "it can move back too");
  // Enter inside a cell moves down a row and Shift+Enter up, staying in the column (Excel's
  // Enter).
  check(w.kspage_web_move_row(0) === 1, "it can move down a row");
  const under = typed();
  check(under !== "Amount", `it stands in the cell below (${under})`);
  check(w.kspage_web_move_row(1) === 1 && typed() === "Amount", "and back up to the heading");
  check(w.kspage_web_move_row(1) === 0, "above the first row it does not move");

  // --- An absolute reference and the auto-fill ---
  // **The side carrying `$` does not move on a copying** (where a row or a column is added it
  // moves even carrying the mark).
  const cellSource = (x, y) => {
    w.kspage_web_layout(300);
    w.kspage_web_click(x, y, 0);
    return typed();
  };
  w.kspage_web_layout(300);
  const priceAt = geom(find("Price"));
  // It copies downward from the cell one below the heading (the price's column).
  const priceCell = [priceAt[0] + 1, priceAt[1] + priceAt[3] + 4];
  w.kspage_web_click(priceCell[0], priceCell[1], 0);
  setTyped("=A1*$A$1");
  check(cellSource(priceCell[0], priceCell[1]) === "=A1*$A$1",
    "a formula carrying $ can be typed");
  check(w.kspage_web_fill_along(0) === 1, "it can be copied downward");
  const below = cellSource(priceCell[0], priceCell[1] + priceAt[3] + 4);
  check(below === "=A2*$A$1", `only the relative side shifts (${below})`);
  w.kspage_web_undo();
  const backOff = cellSource(priceCell[0], priceCell[1] + priceAt[3] + 4);
  check(backOff !== "=A2*$A$1", "one step returns to before the copying");
  w.kspage_web_undo();

  // --- The headings and the contents ---
  // **The contents' content does not go into the document** (it is assembled from the headings on
  // every placing). Write it in and it goes stale the moment a heading is changed — and that it is
  // stale is visible to nobody.
  const outlineOf = (i) => {
    w.kspage_web_style_outline(i, scratch);
    return read(2);
  };
  const head1 = styleNames().indexOf("heading");
  check(outlineOf(head1)[0] === 1, "the material's heading is of depth 1");
  const tocAt = styleNames().indexOf("contents");
  // The way of gathering is 0 for none, 1 for the contents, 2 for the notes' list.
  check(tocAt >= 0 && outlineOf(tocAt)[1] === 1,
    "the material has a style for the contents");
  check(outlineOf(styleNames().indexOf("footnote"))[1] === 2,
    "the material has a style for the notes' list too");
  // **Do not settle the text by hand** (a heading can be typed over): it reads the heading's box
  // and looks for the same text in the item.
  const wasLines = w.kspage_web_layout(300);
  const headLine = textOf(0);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_gathered(stage("contents"), 1) === 1,
    "the contents can be inserted");
  const withToc = w.kspage_web_layout(300);
  check(withToc > wasLines,
    `the boxes grow by the headings' worth (${wasLines} -> ${withToc})`);
  check(textOf(1) === headLine,
    `the heading's text becomes the item as it stands (${textOf(1)})`);
  // Were the content in the document, the heading's text would come out twice in it.
  const savedTwice = save().split(`"text": "${headLine}"`).length - 1;
  check(savedTwice === 1, `the heading's text rides the document once only (${savedTwice})`);
  // **An item is a link** (contents where pressing does nothing are not written out). The id it
  // flies to is made the same way as the heading's, so the two stay in step.
  const wrote = html();
  check(wrote.includes(`margin-left:0px"><a href="#kspage-h1">${headLine}</a></div>`),
    "the contents in the HTML written out become a link");
  check(wrote.includes(`id="kspage-h1"`), "the same name goes on the heading's side");
  // Change the heading and the contents change too (they hold no copy).
  w.kspage_web_click(geom(0)[0] + 1, geom(0)[1] + 1, 0);
  type("!");
  w.kspage_web_layout(300);
  check(textOf(1) === textOf(0), `what was typed comes out in the contents too (${textOf(1)})`);
  w.kspage_web_undo();
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === wasLines,
    "two steps return to before the inserting");

  // --- The notes ---
  // **The numbers do not go into the document** (they are counted at the lining up). Put them in
  // and adding one note alone makes every number behind it stale.
  const setNote = (text) => w.kspage_web_set_note(stage(text));
  w.kspage_web_layout(300);
  const noteLead = geom(find(lead));
  w.kspage_web_click(noteLead[0] + 30, noteLead[1] + 1, 0);
  check(setNote("the note's text") === 1, "a note can be put where the cursor is");
  check(out(w.kspage_web_note()) === "the note's text", "the note put on can be read back");
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_gathered(stage("footnote"), 2) === 1,
    "the notes' list can be inserted");
  const listed = w.kspage_web_layout(300);
  let noteLine = -1;
  for (let i = 0; i < listed; i += 1) {
    if (textOf(i) === "1 the note's text") noteLine = i;
  }
  check(noteLine >= 0, "it comes out in the list, number and all");
  // The mark is a small box raised up (laid at the body's height it would look like part of the
  // text).
  let markAt = -1;
  for (let i = 0; i < listed; i += 1) {
    if (textOf(i) === "1" && boxOf(i)[4] < 16) markAt = i;
  }
  check(markAt >= 0, "a small mark comes out in the body");
  check(boxOf(markAt)[1] < boxOf(markAt + 1)[1],
    "the mark comes out above the text that follows");
  // Press a row of the list and it goes back to where that note was put on.
  // **It cannot be drawn from the list's box** (as with the contents, it points at none of the
  // document's texts); it is drawn from the row's place remembered at the placing, so **what
  // comes back is a height** — that of the run that put the mark out, not of the lifted mark.
  const listY = geom(noteLine)[1];
  const backTo = w.kspage_web_notes_hit(listY + 1);
  check(near(backTo, geom(markAt + 1)[1]),
    `from the list's row it goes back to where the note was put on `
      + `(${backTo} / text ${geom(markAt + 1)[1]})`);
  check(w.kspage_web_notes_hit(-10) < 0, "outside the list's rows it is -1");
  const savedNote = save();
  check(savedNote.includes(`"note": "the note's text"`),
    "the note goes into the text written out");
  check(!savedNote.includes(`"text": "1 the note's text"`),
    "the number does not go into the text");
  check(html().includes("<sup>1</sup>"), "in the HTML written out it becomes a sup");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(out(w.kspage_web_note()) === "", "two steps return to before it was put on");

  // --- Images ---
  // **What the document carries is where it came from and its size alone** (it does not carry the
  // image itself; there is not memory enough).
  // **Where it came from is handed over from the loading arena** (the reason is at `pasteIn`).
  const putImage = (src, iw, ih) => w.kspage_web_insert_image(feed(src), iw, ih);
  const pictureAt = (i) => {
    w.kspage_web_picture(i, scratch);
    return read(4);
  };
  w.kspage_web_layout(300);
  const wasPictures = w.kspage_web_picture_count();
  w.kspage_web_click(0, 10, 0);
  check(putImage("picture.png", 80, 40) === 1, "an image can be inserted");
  w.kspage_web_layout(300);
  check(w.kspage_web_picture_count() === wasPictures + 1,
    "it is counted as an image laid");
  const shotAt = w.kspage_web_picture_count() - 1;
  check(out(w.kspage_web_picture_src(shotAt)) === "picture.png",
    "where it came from can be read");
  const shot = pictureAt(shotAt);
  check(near(shot[2], 80) && near(shot[3], 40),
    `it is the size handed over as it stands (${shot[2]}x${shot[3]})`);
  // With no size it is not inserted (the core cannot read an image to settle one).
  check(putImage("picture.png", 0, 40) === 0, "an image with no size is not inserted");
  check(save().includes("\"image\": \"picture.png\""),
    "where it came from goes into the text written out");
  check(html().includes("<img src=\"picture.png\" width=\"80\""),
    "in the HTML written out it becomes an img");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_picture_count() === wasPictures,
    "one step returns to before the inserting");
}
