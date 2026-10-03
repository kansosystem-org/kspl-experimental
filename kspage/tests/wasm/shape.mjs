import { check, near } from "./shell.mjs";
import { material, para, group, grid } from "./material.mjs";

export const subject = "Shapes, columns and charts.";

// What it places the shapes on.
// Caution: **Make the first block a body** (adding a shape and a slide both press (0, 10), which
// would nest in a slide or table). **Give it one slide** (sections count on it). **Make the
// slide's child a frame holding text** (for "a frame holding text does not go on the key").
// **Give it one detail table** (for a chart's range). **Lay a style for columns in.**
//
// The style names (`body`, `strong`, `table`, `cell`, `heading-cell`, `amount`, `slide`,
// `columns`, `column-body`) and the amount's money sign (`$`) are the document's own, defined by
// `kspage/content`'s sample, so they stay as they are until that side moves. The `figure-` and
// `chart-` names are shaped as the page shapes them (`port/web/command.js`).
export const opens = material({
  styles: [
    { name: "body", space_after: 12.0 },
    { name: "strong", weight: 700 },
    { name: "columns", space_before: 12.0, space_after: 12.0, columns: 2, column_gap: 24.0 },
    { name: "column-body", space_after: 8.0 },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
    { name: "heading-cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc", fill: "#f0f0f0" },
    { name: "amount", places: 0, grouped: true, prefix: "$", pad: 4.0, rule_width: 1.0,
      rule_color: "#cccccc" },
    { name: "slide", space_before: 12.0, space_after: 12.0, width: 620.0, height: 120.0,
      arrange: "absolute" },
  ],
  blocks: [
    para("body", "Shapes, columns and charts alike are placed on the same tree."),
    group("slide",
      para({ style: "body", frame: { x: 155.0, y: 16.0, w: 300.0, h: 80.0 } },
        "The same tree can be one slide as well, changing only the style's arranging.")),
    grid({ style: "table", name: "detail" },
      [para("heading-cell", "Qty"), para("heading-cell", "Price"), para("heading-cell", "Amount")],
      [para("cell", "3"), para("cell", "120"), para("cell", ["=A2*B2", "amount"])],
      [para("cell", "5"), para("cell", "80"), para("cell", ["=A3*B3", "amount"])]),
    group("columns",
      para("column-body", "Columns are a settlement the style carries. Write the count of columns and "
        + "that style's block's children part into columns."),
      para("column-body", "No invisible mark called a section's seam is made. One block is one set of "
        + "columns as it stands.")),
  ],
});

export function run(ks) {
  const { w, scratch, read, out, stage, geom, textOf, find, save, html, load, typed, setTyped,
    leaveCell, styleNames, paraOf, panelAt, surfaceAt } = ks;

  // Caution: **Take the material's likeness here** (the sections onward put it back from this).
  const wasImage = save();

  // --- Shapes (a line, an arrow, an ellipse) ---
  // **They can be added only inside a slide** (only there is a place read). **It holds no text, so
  // unless the band closes at the frame's height nothing at all is seen.**
  const figureOf = (kind) => {
    for (let i = w.kspage_web_panel_count() - 1; i >= 0; i -= 1) {
      const one = panelAt(i);
      if (one[8] === kind) return one;
    }
    return null;
  };
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  // **It can be added over a body too** (as in Word and Excel); it is put back after.
  check(w.kspage_web_insert_shape(stage("figure-arrow"), 4) === 1,
    "it can be added over a body too");
  check(w.kspage_web_object_count() === 1, "it is counted as that paragraph's content");
  w.kspage_web_undo();
  const [fx, fy] = surfaceAt(0);
  w.kspage_web_click(fx + 8, fy + 8, 0);
  w.kspage_web_layout(300);
  const panelsWere = w.kspage_web_panel_count();
  check(w.kspage_web_insert_shape(stage("figure-arrow"), 4) === 1,
    "inside a slide it can be added");
  w.kspage_web_layout(300);
  check(w.kspage_web_panel_count() === panelsWere + 1, "the bands grow by one");
  const arrow = figureOf(4);
  check(arrow !== null, "a band of that shape comes out");
  check(arrow[3] > 0, `the band carries the frame's height (${arrow === null ? "" : arrow[3]})`);
  check(arrow[4] > 0, "one line goes in so that it can be seen");
  check(save().indexOf("fall_arrow") >= 0, "the shape goes into the text saved");
  // Caution: **Take the name from the typing arena**, or another text of the same length is left as
  // the style's name.
  check(styleNames().indexOf("figure-arrow") >= 0,
    "one style of the name handed over is made");
  check(save().indexOf("figure-arrow") >= 0, "that name goes into the text saved");
  // An ellipse is the shape with rounded corners, so it comes out in the HTML too.
  check(w.kspage_web_insert_shape(stage("figure-ellipse"), 1) === 1,
    "an ellipse can be added too");
  check(html().indexOf("border-radius: 50%") >= 0,
    "an ellipse becomes a round corner in the HTML");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_panel_count() === panelsWere, "both come away in one step");

  // --- Drawing a shape by dragging, the list, and the order of overlapping ---
  // **The cursor is not looked at**; it draws onto the slide pressed.
  // Caution: **Insert one slide oneself before looking**, or a break in the inserted slide's
  // template goes unnoticed.
  w.kspage_web_layout(620);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_surface(stage("slide"), 0) === 1,
    "one slide to look at can be inserted");
  w.kspage_web_layout(620);
  const [faceX, faceY, faceW, faceH] = surfaceAt(0);
  check(faceW > 0 && faceH > 0,
    `there is one slide (${Math.round(faceW)}x${Math.round(faceH)})`);
  // **It cannot be drawn outside the document**; over a body, a paragraph holds it.
  check(w.kspage_web_draw_shape(stage("figure-drawn"), 1, 5000, 5000, 40, 20) === 0,
    "outside the document it cannot be drawn");
  const drawnOk =
    w.kspage_web_draw_shape(stage("figure-drawn"), 1, faceX + 20, faceY + 20, 70, 40);
  check(drawnOk === 1, "over a slide it can be drawn");
  w.kspage_web_layout(620);
  // The list. **A slide's children line up as they stand** (the order of overlapping).
  const objectAt = (i) => {
    w.kspage_web_object(i, scratch);
    return read(5);
  };
  const many = w.kspage_web_object_count();
  check(many >= 2, `the slide's content comes out in the list (${many})`);
  const last = objectAt(many - 1);
  check(Math.round(last[2]) === 70 && Math.round(last[3]) === 40,
    `the size dragged is the frame's size as it stands `
      + `(${Math.round(last[2])}x${Math.round(last[3])})`);
  // **The frame's place is from the slide's top left** (this side subtracts).
  check(Math.round(last[0]) === 20 && Math.round(last[1]) === 20,
    `it becomes the place from the slide's top left (${Math.round(last[0])}, ${Math.round(last[1])})`);
  check((last[4] & 1) !== 0, "what was drawn is in the chosen state");
  check((last[4] & 2) === 0, "a shape holds no text");
  // The order of overlapping. **It is the document's order itself.**
  check(w.kspage_web_raise_object(1) === 0, "the last one cannot be raised nearer still");
  check(w.kspage_web_raise_object(0) === 1, "it can be lowered further back");
  w.kspage_web_layout(620);
  const moved = objectAt(many - 2);
  check((moved[4] & 1) !== 0, "after being lowered it stays chosen");
  // Choosing one from the list. **The cursor does not move.**
  check(w.kspage_web_pick_object(0) === 1, "one of the list can be chosen");
  check((objectAt(0)[4] & 1) !== 0, "the mark of being chosen goes on");
  check(w.kspage_web_pick_object(many + 5) === 0, "a number that is not there cannot be chosen");
  // Only what holds no text goes on the key.
  // Caution: **Do not settle it by number** (the row changes with the template and the order
  // drawn). Hunt by the mark.
  const firstWhere = (want) => {
    for (let i = 0; i < w.kspage_web_object_count(); i += 1) {
      if (want(objectAt(i)[4])) return i;
    }
    return -1;
  };
  const hasText = firstWhere((flags) => (flags & 2) !== 0);
  check(hasText >= 0, "a frame holding text is inside the slide");
  check(w.kspage_web_pick_object(hasText) === 1, "that frame can be chosen");
  check(w.kspage_web_drop_picked() === 0, "a frame holding text does not go on the key");
  const noText = firstWhere((flags) => (flags & 2) === 0);
  check(noText >= 0, "a shape holding no text is inside the slide");
  check(w.kspage_web_pick_object(noText) === 1, "that shape can be chosen");
  check(w.kspage_web_drop_picked() === 1, "a shape holding no text goes on the key");
  w.kspage_web_layout(620);
  check(w.kspage_web_object_count() === many - 1, "the list drops by what went");
  // Adding a shape does not move the row of numbers (**else an older text reads as another**).
  check(w.kspage_web_insert_shape(stage("figure-diamond"), 10) === 1,
    "a diamond can be added too");
  check(save().indexOf("diamond") >= 0, "the diamond's name goes into the text saved");
  check(w.kspage_web_insert_shape(stage("figure-round"), 8) === 1,
    "a rounded square can be added too");
  check(html().indexOf("border-radius: 8px") >= 0,
    "a rounded square has round corners in the HTML too");
  check(w.kspage_web_insert_shape(stage("figure-triangle"), 9) === 1,
    "a triangle can be added too");
  check(html().indexOf("clip-path: polygon(50% 0, 100% 100%, 0 100%)") >= 0,
    "a triangle becomes a polygon's clipping in the HTML");

  // --- The frame's eight handles ---
  // **A corner is both measures, the middle of an edge is one, the rest of the edge moves it.**
  // It returns 0 none, 1 move, 2 diagonal, 3 across only, 4 down only.
  w.kspage_web_layout(620);
  const wideFace = surfaceAt(0);
  // It lays it away from the other frames' corners (a handle has a width), at a size the eight
  // handles fit into.
  check(w.kspage_web_pick_object(0) === 1, "one frame is chosen");
  // Caution: **Lay it where it does not go under another frame**, or that one is hit first
  // (`grip_at`). This slide's other children start from x 155.
  check(w.kspage_web_place_frame(20, 20, 100, 60) === 1, "it can be laid by numbers");
  w.kspage_web_layout(620);
  const held = objectAt(0);
  check(Math.round(held[2]) === 100 && Math.round(held[3]) === 60,
    "it becomes the size laid");
  const gx = wideFace[0] + 20;
  const gy = wideFace[1] + 20;
  check(w.kspage_web_grip_at(gx, gy) === 2, "the top left corner is diagonal");
  check(w.kspage_web_grip_at(gx + 100, gy + 60) === 2,
    "the bottom right corner is diagonal too");
  check(w.kspage_web_grip_at(gx + 100, gy + 30) === 3,
    "the middle of the right edge is across only");
  check(w.kspage_web_grip_at(gx, gy + 30) === 3,
    "the middle of the left edge is across only too");
  check(w.kspage_web_grip_at(gx + 50, gy) === 4, "the middle of the top edge is down only");
  check(w.kspage_web_grip_at(gx + 50, gy + 60) === 4,
    "the middle of the bottom edge is down only too");
  check(w.kspage_web_grip_at(gx + 25, gy + 60) === 1,
    "the edge outside a handle is where it moves");

  // --- At which step it comes out (showing it in stages) ---
  //
  // **Narrowing the steps is the showing side's settlement**: saved, but biting on neither the
  // page nor the HTML. **Not narrowing is the default** (printing shows everything).
  check(w.kspage_web_frame_step() === 0, "a frame comes out at any time by default");
  check(w.kspage_web_set_frame_step(1) === 1, "a step can be settled for the frame chosen");
  check(w.kspage_web_frame_step() === 1, "the step settled can be read back");
  check(w.kspage_web_max_step(0) === 1,
    `that slide's largest step comes back (${w.kspage_web_max_step(0)})`);
  const everyBox = w.kspage_web_layout(620);
  w.kspage_web_set_reveal(0);
  const stagedBox = w.kspage_web_layout(620);
  check(stagedBox < everyBox,
    `at step 0 there is a frame that does not come out (${everyBox} -> ${stagedBox})`);
  w.kspage_web_set_reveal(1);
  check(w.kspage_web_layout(620) === everyBox,
    "sent on as far as step 1 it returns to the count it was");
  // **A way of taking the narrowing off is needed.**
  w.kspage_web_set_reveal(-1);
  check(w.kspage_web_layout(620) === everyBox, "with no narrowing everything comes out");
  check(save().includes("\"step\": 1"), "the step settled goes into the saving");
  w.kspage_web_undo();
  check(w.kspage_web_frame_step() === 0, "one step returns to before the step was settled");

  // --- The note put beside a slide (the presenter's note) ---
  //
  // **It is a different entry point from the note of the place it stands in** (when showing, the
  // cursor need not be on that slide).
  check(out(w.kspage_web_surface_aside(0)) === "", "with no note put beside it, it is empty");
  check(w.kspage_web_set_aside(stage("pause here")) === 1,
    "a note can be put beside a slide");
  check(out(w.kspage_web_surface_aside(0)) === "pause here",
    `the note can be read from the slide's number (${out(w.kspage_web_surface_aside(0))})`);
  w.kspage_web_undo();

  // --- Nudging the shape chosen ---
  // **One shape is chosen at a time** (choosing another takes the one before off); the nudge
  // moves it by the step handed over.
  const manyPicks = w.kspage_web_object_count();
  check(manyPicks >= 2, `the slide's content is two or more (${manyPicks})`);
  check(w.kspage_web_pick_object(0) === 1, "the first is chosen");
  check(w.kspage_web_pick_object(1) === 1, "and another can be chosen");
  const pickedFlags = () => {
    let n = 0;
    for (let i = 0; i < w.kspage_web_object_count(); i += 1) {
      if ((objectAt(i)[4] & 1) !== 0) n += 1;
    }
    return n;
  };
  check(pickedFlags() === 1, `one alone carries the mark (${pickedFlags()})`);
  const wasAt = objectAt(1);
  const wasOther = objectAt(0);
  check(w.kspage_web_move_frames(10, 6) === 1, "the one chosen can be nudged");
  w.kspage_web_layout(620);
  const nowAt = objectAt(1);
  check(Math.round(nowAt[0] - wasAt[0]) === 10, "it moves across");
  check(Math.round(nowAt[1] - wasAt[1]) === 6, "and down");
  check(Math.round(objectAt(0)[0]) === Math.round(wasOther[0]) &&
    Math.round(objectAt(0)[1]) === Math.round(wasOther[1]),
    "the one not chosen stays where it was");
  // **It has to go back in one step.**
  w.kspage_web_undo();
  w.kspage_web_layout(620);
  check(Math.round(objectAt(1)[0]) === Math.round(wasAt[0]), "one step returns it");

  // --- Columns ---
  // **What carries the count of columns is the style** (no invisible section mark).
  const paraAt = (i) => {
    w.kspage_web_style_para(i, scratch);
    return read(8);
  };
  const twoAt = styleNames().indexOf("columns");
  check(twoAt >= 0, "the material has a style for columns");
  if (twoAt >= 0) {
    const was = paraOf(twoAt);
    check(was[6] === 2, `the count of columns crosses the boundary (${was[6]})`);
    check(was[7] > 0, `the gap between columns crosses too (${was[7]})`);
    // Swapped, it bites on the placing afresh too. **One column is not laying columns at all.**
    check(w.kspage_web_set_style_para(twoAt, 0, was[1], was[2], was[3], was[4], 1, 3, 8) === 1,
      "the count of columns can be swapped");
    check(paraOf(twoAt)[6] === 3, "the count swapped in comes back");
    check(html().indexOf("column-count: 3") >= 0, "it comes out in the HTML written out too");
    // **Outside the range it is not taken** (`kspage/model/limit`; rounded, the count would be at
    // odds with the screen). Refused, the count stays.
    check(w.kspage_web_set_style_para(twoAt, 0, was[1], was[2], was[3], was[4], 1, -2, 8) === 0,
      "a negative count of columns is not taken");
    check(
      w.kspage_web_set_style_para(twoAt, 0, was[1], was[2], was[3], was[4], 1, 900000, 8) === 0,
      "too many columns is not taken either");
    check(paraOf(twoAt)[6] === 3, "after refusing it is still the count swapped in");
    check(w.kspage_web_set_style_para(twoAt, 0, was[1], was[2], was[3], was[4], 1, 2, 24) === 1,
      "it can be put back");
  }

  // Caution: **Put it back to the material's likeness** (the checks behind this count on it).
  check(load(wasImage) === 1, "it can be put back to the material's document");
  w.kspage_web_layout(300);

  // --- Charts (a range's values laid out as bars and a line) ---
  // **The content does not go into the document** — only the range; the bars are built from the
  // table at every placing. **A range needs a table's name.**
  const countText = (t) => {
    const count = w.kspage_web_layout(300);
    let hits = 0;
    for (let i = 0; i < count; i += 1) {
      if (textOf(i) === t) hits += 1;
    }
    return hits;
  };
  const chartIn = (name, range, kind) =>
    w.kspage_web_insert_chart(stage(`${name}\t${range}`), kind);
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  const chartPanels = w.kspage_web_panel_count();
  const chartLabels = countText("$360");
  check(chartIn("chart-bar", "", 3) === 0, "with the range empty it does not go in");
  check(chartIn("chart-bar", "detail!C2:C3", 1) === 0,
    "with a style that does not gather it does not go in");
  check(chartIn("chart-bar", "detail!C2:C3", 3) === 1, "a bar chart can be put in");
  w.kspage_web_layout(300);
  // Two bars, and one axis drawn where 0 is.
  const barPanels = w.kspage_web_panel_count();
  check(barPanels === chartPanels + 3,
    `two bars and one axis grow (${chartPanels} -> ${barPanels})`);
  check(countText("$360") === chartLabels + 1, "the value's text comes out above the bar");
  check(save().indexOf("\"chart\": \"detail!C2:C3\"") >= 0,
    "what goes into the saving is the range alone");
  check(save().indexOf("chart-bar") >= 0,
    "the style of the name handed over goes into the saving");
  check(styleNames().indexOf("chart-bar") >= 0, "one style of that name is made");
  // A bar's height is the value.
  // Caution: **Take it from the number worked out, not from the text dressed up.**
  const barsOf = () => {
    const out = [];
    for (let i = 0; i < w.kspage_web_panel_count(); i += 1) {
      const one = panelAt(i);
      if (one[7] === 0x4472c4 && one[3] > 0) out.push(one);
    }
    return out;
  };
  const bars = barsOf();
  check(bars.length === 2, `bars come out for as many values as the range has (${bars.length})`);
  check(bars[1][3] > bars[0][3], "the bar of the larger value is taller");
  check(bars[0][0] < bars[1][0], "the bars line up in the range's order");
  // Type a value over and the bars follow (**the document holds no copy**).
  // Caution: **Take hold of the quantity's cell by pressing right below the heading**; by text, a
  // value's tab of the same text is found first, and it leads into no cell.
  const chartHead = geom(find("Qty"));
  w.kspage_web_click(chartHead[0] + 1, chartHead[1] + chartHead[3] * 1.5, 0);
  check(typed() === "3", `the quantity's cell can be taken hold of (${typed()})`);
  setTyped("9");
  leaveCell();
  const taller = barsOf();
  check(taller.length === 2 && taller[0][3] > bars[0][3],
    `change the value and the bar grows (${bars[0][3]} -> ${taller.length === 2 ? taller[0][3] : 0})`);
  check(taller.length === 2 && taller[1][3] < bars[1][3],
    "the whole row is drawn afresh (the bar beside it shrinks)");
  w.kspage_web_undo();
  leaveCell();
  check(html().indexOf("detail!C2:C3") < 0,
    "neither the range nor the bars come out in the HTML written out");
  // A line joins point to point. Between two points there is one.
  check(chartIn("chart-line", "detail!C2:C3", 4) === 1, "a line chart can be put in too");
  w.kspage_web_layout(300);
  const linePanels = w.kspage_web_panel_count();
  check(linePanels === barPanels + 2,
    `one line and one axis grow (${barPanels} -> ${linePanels})`);
  check(save().indexOf("\"lines\": true") >= 0, "the way of gathering goes into the saving");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_panel_count() === chartPanels, "both come away in one step");

  // --- Reordering the slides ---
  //
  // **The only thing carrying the order is the document's row.** It starts from the material put
  // back.
  check(load(wasImage) === 1, "it can be put back to the material");
  w.kspage_web_layout(300);
  const oneFace = w.kspage_web_surface_count();
  check(oneFace === 1, `the material's slide is one sheet (${oneFace})`);
  // It puts a note beside the first sheet as a mark, then adds a second and carries it.
  const faceAt = surfaceAt(0);
  w.kspage_web_click(faceAt[0] + 8, faceAt[1] + 8, 0);
  check(w.kspage_web_set_aside(stage("the first sheet")) === 1,
    "a note as a mark can be put beside the first sheet");
  // **Adding is done from outside a slide** (inside a frame it would nest, and only the outermost
  // can be carried), so it moves over the heading first.
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_surface(stage("slide"), 0) === 1, "a second sheet can be added");
  w.kspage_web_layout(300);
  check(w.kspage_web_surface_count() === 2, "the slides become two sheets");
  // Caution: **Look at which is the first sheet by the note** (the measures are the same).
  const firstAt = out(w.kspage_web_surface_aside(0)) === "the first sheet" ? 0 : 1;
  check(w.kspage_web_move_surface(firstAt, 1 - firstAt) === 1, "a slide can be carried");
  w.kspage_web_layout(300);
  check(out(w.kspage_web_surface_aside(1 - firstAt)) === "the first sheet",
    "the first sheet comes to where it was carried");
  // **Taking it out and putting it in has to go back on one undo.**
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(out(w.kspage_web_surface_aside(firstAt)) === "the first sheet",
    "one step returns to before the carrying");
  check(w.kspage_web_move_surface(0, 0) === 0, "it is not carried to the same place");
  check(load(wasImage) === 1, "it ends by putting the material back");
  w.kspage_web_layout(300);
}
