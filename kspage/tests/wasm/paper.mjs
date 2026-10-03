import { check, near } from "./shell.mjs";
import { material, para, group, grid } from "./material.mjs";

export const subject = "Parting into pages, the bands above and below, the regions, the slides.";

// The text of a frame inside the slide.
// Caution: **Make the material and the text hunted for one name** (apart, a change to the
// material fails only "the frame is not found").
const inside = "As one sheet";

// What it parts.
// Caution: **Give it all three kinds of region — prose, table and slide** (with one kind, "which
// band is which region" breaks unnoticed). **Put two prose paragraphs in a row** (they gather into
// one region). **Make it two sheets or more at a page height of 137.** **Make two frames in the
// slide, one at x = 320**, where a flow would not put it. **Give the body a multiple for the
// line's height** — `line-height` is the one field **where the reader's type size could leak into
// the writing**; without it that check cannot fall.
//
// The style names (`body`, `heading`, `table`, `cell`, `slide`) are the document's own,
// defined by `kspage/content`'s sample, so they stay as they are until that side moves.
export const opens = material({
  styles: [
    { name: "body", space_after: 12.0, line_spacing: 1.4 },
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0 },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
    { name: "slide", space_before: 12.0, space_after: 12.0, width: 620.0, height: 120.0,
      arrange: "absolute" },
  ],
  blocks: [
    para("body", "Prose, tables and slides alike, it is an editing system for writing them all "
      + "as one document."),
    para("body", "Only the arranging differs, and below that they are shared. Breaking into "
      + "lines, inheriting, and lining baselines up are all on the core's side."),
    grid("table",
      [para("cell", "The look"), para("cell", "The order")],
      [para("cell", "Prose"), para("cell", "Flowed in")],
      [para("cell", "Table"), para("cell", "Grid")]),
    group("slide",
      para({ style: "heading", frame: { x: 0.0, y: 8.0, w: 300.0, h: 40.0 } }, inside),
      para({ style: "body", frame: { x: 320.0, y: 16.0, w: 300.0, h: 80.0 } },
        "The same tree can be one slide as well, changing only the style's arranging.")),
    para("body", "The table and the slide are both part of the flow. Type the quantity over and "
      + "even the paragraph below is placed afresh."),
  ],
});

export async function run(ks, open) {
  const { w, mem, scratch, read, out, stage, geom, boxOf, find, save, html, load,
    surfaceAt } = ks;

  // --- A slide inside the flow (absolute coordinates) ---
  // **A slide's height is settled by the style** (not by what is inside).
  const title = geom(find(inside));
  const all = w.kspage_web_layout(300);
  // The right frame is at x = 320; its text wraps, so it is hunted for by place.
  let side = -1;
  for (let i = 0; i < all; i += 1) {
    if (geom(i)[0] >= 319.5) { side = i; break; }
  }
  check(side >= 0,
    "the right frame is laid at the x settled (it is not settled by what is around it)");
  if (side >= 0) {
    const sideAt = geom(side);
    check(sideAt[1] >= title[1] && sideAt[1] < title[1] + 120,
      "they line up inside the same slide");
  }
  // A slide takes the style's height.
  check(geom(all - 1)[1] > title[1] + 100,
    "the paragraph behind carries on from below the slide's height");

  // --- Parting into single pages, and the margins ---
  // **The paper's settings are the document's.** Width 0 is the vessel's width; height 0 parts not.
  const paperOf = () => {
    w.kspage_web_paper(scratch);
    return read(8);
  };
  check(paperOf()[1] === 0 && paperOf()[6] === 0, "by default it does not part");
  w.kspage_web_layout(300);
  const flat = w.kspage_web_height();
  check(w.kspage_web_paper_count() === 1, "a document that does not part is one sheet");
  // Caution: **Keep watch here over the page a document with no paper settled borrows for
  // printing.** The numbers are the core's (`../../model/paper.kspls`'s `a4_portrait`); a JS copy
  // would give **two documents from the same screen different margins**. Pinned by value (A4
  // upright in px at 96dpi, margins 15mm all round).
  w.kspage_web_default_paper(scratch);
  const borrow = read(6);
  check(borrow[0] === 794 && borrow[1] === 1123, "the page borrowed is A4 upright");
  check(borrow[2] === 57 && borrow[3] === 57 && borrow[4] === 57 && borrow[5] === 57,
    "the margins borrowed are 15mm (57px) all round");
  check(near(w.kspage_web_column(300), 300),
    "with no paper width the column is the vessel's width");
  check(w.kspage_web_column_left(300) === 0,
    "where nothing stops it the column starts from the left edge");

  // --- Stopping at the body's width ---
  // **What is left over by the stopping is parted equally left and right.** **It does not bite
  // where the paper's width is settled** (two hands would settle the width to print).
  w.kspage_web_set_paper(0, 0, 0, 0, 0, 0, 400);
  check(paperOf()[7] === 400, "the body's width can be read back");
  check(near(w.kspage_web_column(1000), 400), "in a wide window it is the width stopped at");
  check(near(w.kspage_web_column_left(1000), 300),
    "what is left over is parted equally left and right");
  check(near(w.kspage_web_column(300), 300),
    "in a window narrower than the width stopped at it stays as it is");
  check(w.kspage_web_column_left(300) === 0, "and then it is not drawn over");
  const midLaid = w.kspage_web_layout(1000);
  check(midLaid > 0 && near(geom(0)[0], 300),
    "the coordinates laid come inward by what it was drawn over");
  // Caution: **Stop after the margins are taken off** (the field's number is the body's width).
  w.kspage_web_set_paper(0, 0, 50, 0, 50, 0, 400);
  check(near(w.kspage_web_column(1000), 400),
    "with margins too, the body's width is the number written");
  check(near(w.kspage_web_column_left(1000), 250),
    "what is left over is parted from what remains after the margins");
  // It is written out and stays after being read back. **A field holding 0 is not written.**
  const capped = save();
  check(capped.includes("\"reading_width\": 400"),
    "the body's width goes into the text written out");
  check(load(capped) !== 0 && paperOf()[7] === 400,
    "read back, the body's width is still there");
  w.kspage_web_set_paper(0, 0, 0, 0, 0, 0, 0);
  check(save().includes("reading_width") === false,
    "where nothing stops it, nothing is written into the text");
  check(near(w.kspage_web_column(1000), 1000),
    "with nothing stopping it, it widens to the vessel's width");

  // --- The reader's overriding ---
  // **It is not the document's settlement**: it stays out of the text saved, and stays on after
  // the document is read afresh.
  const overOf = () => {
    w.kspage_web_over(scratch);
    return read(2)[0];
  };
  const sizeOf = () => {
    w.kspage_web_over(scratch);
    return read(2)[1];
  };
  check(overOf() === 0 && sizeOf() === 0, "to begin with nothing is overridden");
  w.kspage_web_set_paper(0, 0, 0, 0, 0, 0, 500);
  w.kspage_web_set_over(300, 0);
  check(overOf() === 300, "the overriding can be read back");
  check(near(w.kspage_web_column(1000), 300),
    "the overriding is stronger than the document's settlement");
  check(near(w.kspage_web_column_left(1000), 350),
    "what is left over is parted equally left and right");
  // **It must not come out in the text** (it would fix the next reader to the writer's width).
  const kept = save();
  check(kept.includes("\"reading_width\": 500"),
    "the document side's width does go into the text");
  // Caution: **Look at it read back in another window** — the same window carries the overriding
  // on, so a leak into the text would go unnoticed.
  const other = await open();
  check(other.load(kept) !== 0, "the text written out can be read in another window too");
  other.w.kspage_web_over(other.scratch);
  check(other.read(2)[0] === 0,
    "in another window there is no overriding (it has not come out in the text)");
  check(near(other.w.kspage_web_column(1000), 500),
    "in another window the document side's width comes out");
  // **It has to stay after the document is read afresh** (it hangs on the reader).
  check(load(kept) !== 0 && overOf() === 300, "read afresh, the overriding is still there");
  check(near(w.kspage_web_column(1000), 300), "after reading afresh the overriding still bites");
  // **A negative value becomes 0** (0 is "do not override").
  w.kspage_web_set_over(-10, -10);
  check(overOf() === 0 && sizeOf() === 0, "a negative value becomes 0");
  check(near(w.kspage_web_column(1000), 500),
    "taken off, it returns to the document's settlement");
  w.kspage_web_set_paper(0, 0, 0, 0, 0, 0, 0);

  // --- The reader's type size ---
  //
  // **It is taken as a size and not as a multiple** (any document's body comes out at it).
  // Caution: **A style with a size written on it has to stretch by the same ratio**, or **the
  // body overtakes the heading** as the type grows. **It must not come out in the HTML written
  // out.** **Do not follow it by a box's number** (the wrapping changes the count); the smallest
  // and the largest type are looked at.
  const sizeSpan = () => {
    const all = w.kspage_web_layout(300);
    let lo = 0;
    let hi = 0;
    for (let i = 0; i < all; i += 1) {
      const px = boxOf(i)[4];
      if (px <= 0) continue;
      if (lo === 0 || px < lo) lo = px;
      if (px > hi) hi = px;
    }
    return { lo: lo, hi: hi };
  };
  const wasSpan = sizeSpan();
  check(wasSpan.hi > wasSpan.lo,
    `there is a style with a size written on it (${wasSpan.lo}px and ${wasSpan.hi}px)`);
  // **The HTML written out is set against the whole of it before the laying on** ("this number
  // does not come out" would be a check that cannot fall).
  const bareHtml = html();
  w.kspage_web_set_over(0, 24);
  check(sizeOf() === 24, "the type size can be read back");
  const bigSpan = sizeSpan();
  check(near(bigSpan.lo, 24), `the body comes out at the size said (${bigSpan.lo}px)`);
  check(near(bigSpan.hi, wasSpan.hi * 24.0 / wasSpan.lo),
    `a size written on stretches by the same ratio (${bigSpan.hi}px)`);
  check(bigSpan.hi > bigSpan.lo, "the heading is still larger than the body");
  // **It must come out neither in the text saved nor in the HTML written out.**
  check(save().includes("\"size_px\": 24") === false,
    "the type size does not come out in the text");
  check(html() === bareHtml,
    "the HTML written out does not differ by one byte with the reader's type size");
  w.kspage_web_set_over(0, 0);
  const backSpan = sizeSpan();
  check(near(backSpan.lo, wasSpan.lo) && near(backSpan.hi, wasSpan.hi),
    `taken off, it returns to the size it was (${backSpan.lo}px and ${backSpan.hi}px)`);

  // A page height that is not a multiple of the line's height, so a line has to cross a page.
  w.kspage_web_set_paper(0, 137, 0, 0, 0, 0, 0);
  w.kspage_web_layout(300);
  const sheets = w.kspage_web_paper_count();
  check(sheets > 1, `parted, it becomes several sheets (${sheets})`);
  // It stretches as a whole by what it sends to the head of the next page.
  check(w.kspage_web_height() > flat,
    `it stretches down by what was sent on (${flat} -> ${w.kspage_web_height()})`);
  // The odd sheet at the end is counted too (else it is not printed).
  check(sheets * 137 >= w.kspage_web_height(),
    "the last odd remainder is counted as one sheet too");

  // The margins. **The column narrows, and the height that fits one page drops too.**
  w.kspage_web_set_paper(400, 300, 40, 30, 40, 30, 0);
  const spec = paperOf();
  check(spec[0] === 400 && spec[1] === 300, "the paper's size can be read back");
  check(spec[2] === 40 && spec[3] === 30, "the margins can be read back too");
  // **The core takes the margins off** (300 - 30 - 30 = 240), not the caller.
  check(spec[6] === 240, `the content's height that fits a page (${spec[6]})`);
  // **The vessel's width is disregarded** (400 - 40 - 40 = 320).
  check(near(w.kspage_web_column(1000), 320),
    `the column is the width with the margins off (${w.kspage_web_column(1000)})`);
  // **Settle the paper's width and the body's width does not bite.**
  w.kspage_web_set_paper(400, 300, 40, 30, 40, 30, 100);
  check(near(w.kspage_web_column(1000), 320),
    "settle the paper's width and the body's width does not bite");
  check(w.kspage_web_column_left(1000) === 0,
    "and then it is not drawn over (the copying side takes the margins off)");
  w.kspage_web_set_paper(400, 300, 40, 30, 40, 30, 0);
  const laidWide = w.kspage_web_layout(1000);
  check(laidWide > 0 && near(geom(0)[0], 0),
    "the coordinates laid are from the column's left edge");
  // A negative value becomes 0 (a negative margin makes the column wider than the page).
  w.kspage_web_set_paper(400, 300, -50, 0, 0, 0, 0);
  check(paperOf()[2] === 0, "a negative margin becomes 0");
  // Where the margins alone fill the page, it does not part.
  w.kspage_web_set_paper(0, 100, 0, 60, 0, 60, 0);
  check(paperOf()[6] === 0, "on a page the margins fill, it does not part");
  check(w.kspage_web_paper_count() === 1, "and then it is one sheet");
  // It goes into the text written out and stays after being read back.
  w.kspage_web_set_paper(794, 1123, 76, 76, 76, 76, 0);
  const withPaper = save();
  check(withPaper.includes("\"page_width\": 794"),
    "the paper's width goes into the text written out");
  check(withPaper.includes("\"margin_top\": 76"), "the margins go in too");
  const paperBack = load(withPaper) !== 0;
  check(paperBack && paperOf()[0] === 794 && paperOf()[2] === 76,
    "read back, the paper's settings are still there");

  // --- A page's header and footer ---
  // **It is a row apart from the document's boxes** (its coordinates are from the page's top left).
  // The marks in the text (`{page}`, `{pages}`) are the core's — `page_mark` and
  // `count_mark` in `kspage/lay/chrome.kspls` — so those needles stay as they are until that side
  // moves.
  const chromeText = (i) => {
    const len = w.kspage_web_chrome_text(i);
    return len > 0 ? out(len).split("\t")[0] : "";
  };
  const chromeBox = (i) => {
    w.kspage_web_chrome_box(i, scratch);
    return read(14);
  };
  const setChrome = (which, s) => w.kspage_web_set_chrome(which, stage(s));
  // By default the bands have no text, so they do not come out.
  w.kspage_web_set_paper(400, 300, 40, 30, 40, 30, 0);
  check(w.kspage_web_chrome(0, 1, 3) === 0, "a band with no text does not come out");
  check(setChrome(1, "{page}/{pages}") !== 0, "the footer's text can be put in");
  check(out(w.kspage_web_chrome_source(1)) === "{page}/{pages}",
    "the text put in can be read back with its marks as they were");
  const footer = w.kspage_web_chrome(1, 2, 3);
  check(footer === 1, "the footer is one line");
  check(chromeText(0) === "2/3",
    "the marks turn into the page now and the count of all the sheets");
  // The coordinates are from the page's top left (the bottom margin is from 300 - 30 = 270).
  check(near(chromeBox(0)[0], 40) && near(chromeBox(0)[1], 270),
    "the band sits inside the page's margins");
  w.kspage_web_chrome(1, 3, 3);
  check(chromeText(0) === "3/3", "on the next page only the number changes");
  // The band can be read across a placing afresh (it is carried apart from the document's arena).
  w.kspage_web_layout(300);
  check(chromeText(0) === "3/3" && near(chromeBox(0)[0], 40),
    "placed afresh the band is still there");
  // The marks do not go into the document (the numbers are handed out on every placing).
  check(save().includes("\"text\": \"{page}/{pages}\""),
    "the text written out is the marks");
  check(setChrome(0, "Confidential") !== 0 && w.kspage_web_chrome(0, 1, 3) === 1,
    "the header can be put out too");
  check(near(chromeBox(0)[1], 0), "the header starts from the page's top edge");
  // **The reader's type size does not bite on the bands** (larger, they would eat the margin).
  const bandSize = chromeBox(0)[4];
  w.kspage_web_set_over(0, 40);
  w.kspage_web_chrome(0, 1, 3);
  check(near(chromeBox(0)[4], bandSize),
    `the band's type does not move with the reader's size (${chromeBox(0)[4]}px)`);
  w.kspage_web_set_over(0, 0);
  w.kspage_web_chrome(0, 1, 3);
  // What changes the text rides the same record as what types.
  w.kspage_web_undo();
  check(out(w.kspage_web_chrome_source(0)) === "",
    "going back returns the band's text too");
  w.kspage_web_redo();
  check(out(w.kspage_web_chrome_source(0)) === "Confidential",
    "done again it goes in once more");
  setChrome(0, "");
  setChrome(1, "");

  w.kspage_web_set_paper(0, 0, 0, 0, 0, 0, 0);
  w.kspage_web_layout(300);
  check(w.kspage_web_chrome(1, 1, 1) === 0, "with no pages the bands do not come out either");
  check(w.kspage_web_height() === flat && w.kspage_web_paper_count() === 1,
    "put back, it is one sheet again");

  // --- The regions (prose, table, a slide for presenting) ---
  // **Which band is which region is settled by the style.**
  // The kinds are 0 for prose, 1 for table, 2 for slide (the row of `Arrange`).
  const regionOf = (i) => {
    w.kspage_web_region(i, scratch);
    return read(5);
  };
  w.kspage_web_layout(300);
  const regionCount = w.kspage_web_region_count();
  check(regionCount > 1, `the regions are two or more (${regionCount})`);
  const kinds = [];
  for (let i = 0; i < regionCount; i++) kinds.push(regionOf(i)[4]);
  check(kinds.includes(0) && kinds.includes(1) && kinds.includes(2),
    `prose, table and slide are each there (${kinds.join(",")})`);
  // Prose in a row is one region, not one per paragraph.
  check(!kinds.join("").includes("00"), "prose in a row gathers into one region");
  // A region with no height is not remembered (else its frame is left as a line).
  check(regionOf(0)[3] > 0, "a region has a height");
  check(regionOf(99)[2] === 0, "asking for a number that is not there does not fall");

  // --- Showing it one sheet at a time ---
  // **Which block is a slide is settled by the style.**
  const surfaceOf = (i) => {
    w.kspage_web_surface(i, scratch);
    return read(4);
  };
  w.kspage_web_layout(300);
  check(w.kspage_web_surface_count() === 1,
    `the slides are one (${w.kspage_web_surface_count()})`);
  const slide = surfaceAt(0);
  // The material's `slide` is 620 x 120; in a 300px vessel it does not shrink.
  check(near(slide[2], 620) && near(slide[3], 120),
    `the slide's size is as the style says (${slide[2]}x${slide[3]})`);
  check(surfaceAt(9)[2] === 0, "asking for a number that is not there does not fall");

  // --- Taking hold of a slide's frame ---
  // **A corner is the size, an edge moves it.** **A frame with something inside cannot be taken
  // hold of inside** (its text could no longer be chosen).
  const titleAt = geom(find(inside));
  check(w.kspage_web_grip_at(titleAt[0] + 40, titleAt[1] + 5) === 0,
    "inside a frame with something in it, it cannot be taken hold of");
  check(w.kspage_web_grip_at(titleAt[0], titleAt[1]) === 2,
    "a corner is a handle that changes the size");
  check(w.kspage_web_grab_frame(titleAt[0], titleAt[1]) === 1,
    "the frame can be taken hold of");
  w.kspage_web_drag_frame(titleAt[0] + 24, titleAt[1] + 8);
  w.kspage_web_release_frame();
  const dragged = geom(find(inside));
  check(near(dragged[0], titleAt[0] + 24) && near(dragged[1], titleAt[1] + 8),
    `the corner taken hold of comes where it was drawn (${dragged[0]}, ${dragged[1]})`);
  // One dragging goes back in one step.
  w.kspage_web_undo();
  const restored = geom(find(inside));
  check(near(restored[0], titleAt[0]) && near(restored[1], titleAt[1]),
    "one step returns it to the place it was");

  // **A shape holds no text, so the cursor cannot point at it**: the frame pressed is chosen.
  const frameOf = () => {
    w.kspage_web_frame_rect(w.kspage_web_nums());
    const at = new Float32Array(mem.buffer, w.kspage_web_nums(), 9);
    return at[8] === 0 ? null : { x: at[0], y: at[1], w: at[2], h: at[3] };
  };
  w.kspage_web_click(8, 8, 0);
  check(frameOf() === null, "over the body no frame is chosen");
  w.kspage_web_click(titleAt[0] + 40, titleAt[1] + 5, 0);
  const held = frameOf();
  check(held !== null, "press inside a frame and it is chosen");
  if (held !== null) {
    check(w.kspage_web_place_frame(40, 24, 120, 60) === 1,
      "the frame chosen can be laid by numbers");
    const placed = frameOf();
    check(placed.x === 40 && placed.y === 24 && placed.w === 120 && placed.h === 60,
      `it becomes the place and size handed over `
        + `(${placed.x},${placed.y},${placed.w},${placed.h})`);
    // A negative size becomes 0 (a frame turned inside out could not be taken hold of).
    w.kspage_web_place_frame(40, 24, -5, -5);
    const flat = frameOf();
    check(flat.w === 0 && flat.h === 0, "a negative size becomes 0");
    w.kspage_web_undo();
    w.kspage_web_undo();
    w.kspage_web_layout(300);
    const back = frameOf();
    check(back !== null && back.w === held.w, "two steps return it to the size it was");
  }

  // --- The note put beside a vessel (the presenter's note) ---
  // **It does not come out in the flow, but it has to go into the saving.**
  const asideOf = () => out(w.kspage_web_aside());
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_set_aside(stage("pause here")) === 0,
    "over the body nothing can be put beside");
  // It presses inside the slide. The slide's place is lined up in the result of the placing.
  const [sx, sy] = surfaceAt(0);
  w.kspage_web_click(sx + 8, sy + 8, 0);
  check(w.kspage_web_set_aside(stage("pause here")) === 1,
    "inside a slide it can be put beside");
  check(asideOf() === "pause here", "the remembrance put beside can be read back");
  const boxesWere = w.kspage_web_layout(300);
  check(w.kspage_web_layout(300) === boxesWere,
    "putting a note beside does not grow the boxes");
  check(save().indexOf("pause here") >= 0,
    "the remembrance goes into the text saved");
  check(html().indexOf("pause here") < 0, "it does not come out in the HTML written out");
  w.kspage_web_undo();
  check(asideOf() === "", "one step takes it off");
}
