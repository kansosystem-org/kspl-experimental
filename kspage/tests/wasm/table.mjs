import { check, near } from "./shell.mjs";
import { material, para, grid } from "./material.mjs";

export const subject = "A table's cells, its formulas, and its columns' widths and seams.";

// What it reaches into.
// Caution: **Give it two tables** (for a reference across tables). **Put a formula into the body
// too.** **Lay a way of showing on the amount's column** (its text is the one of its kind to hunt
// by). **Settle only the quantity's and the price's columns at 64px.** **Put the table the joining
// uses apart** (else the formulas' targets move). **Make the first block a body with no formula**
// ("outside the table" presses (0, 10); a table there would make that check pass quietly).
//
// The style names (`body`, `strong`, `table`, `cell`, `heading-cell`, `amount`) and the
// amount's money sign (`$`) are the document's own, defined by `kspage/content`'s sample, so they
// stay as they are until that side moves. The tables' own names and the cells' texts are this
// file's material.
export const opens = material({
  styles: [
    { name: "body", space_after: 12.0 },
    { name: "strong", weight: 700 },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
    { name: "heading-cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc", fill: "#f0f0f0" },
    { name: "amount", places: 0, grouped: true, prefix: "$", pad: 4.0, rule_width: 1.0,
      rule_color: "#cccccc" },
  ],
  blocks: [
    para("body", "It is a body that carries no formula. What is pressed here is outside the table."),
    grid("table",
      [para("heading-cell", ["The look", "strong"]), para("heading-cell", ["The order", "strong"])],
      [para("cell", "Prose"), para("cell", "Flowed in")]),
    grid({ style: "table", name: "detail", columns: [64.0, 64.0] },
      [para("heading-cell", ["Qty", "strong"]), para("heading-cell", ["Price", "strong"]),
        para("heading-cell", ["Amount", "strong"])],
      [para("cell", "3"), para("cell", "120"), para("cell", ["=A2*B2", "amount"])],
      [para("cell", "5"), para("cell", "80"), para("cell", ["=A3*B3", "amount"])],
      [para("cell", ["Total", "strong"]), para("cell", ""),
        para("cell", ["=C2:C3.sum()", "amount"])]),
    grid({ style: "table", name: "summary" },
      [para("heading-cell", ["Items", "strong"]), para("heading-cell", ["Sum", "strong"])],
      [para("cell", "=detail!C2:C3.count()"), para("cell", "=detail!C4")]),
    para("body", "Type the quantity over and the amount, the total, and the sum of ",
      "=detail!C4", " follow along."),
  ],
});

export function run(ks) {
  const { w, scratch, read, geom, find, type, typed, setTyped, leaveCell, stage } = ks;

  // --- The heading rows the window keeps in view ---
  // Each table names a band: its rectangle and its first row's, kept at the window's top.
  check(w.kspage_web_head_count() === 3, `every outermost table names a band (${w.kspage_web_head_count()})`);
  w.kspage_web_head(1, scratch);
  const [tx, ty, tw, th, rx, ry, rw, rh] = read(8);
  const head = geom(find("Qty"));
  check(rx <= head[0] && head[0] + head[2] <= rx + rw && ry <= head[1] && head[1] + head[3] <= ry + rh,
    "the detail's band holds its heading's text");
  check(ty === ry && th > rh && tw >= rw, "the row is the table's first, and the table reaches below it");
  const total = geom(find("Total"));
  check(total[1] + total[3] <= ty + th + 0.5, "the table's rectangle reaches its last row");
  w.kspage_web_head(3, scratch);
  check(read(8).every((v) => v === 0), "past the last table it writes zeros");

  // --- Narrowing the rows (a filter) ---
  // **A way of looking, not a change to the document.** On the price's column "is above 100"
  // leaves the 80 row and the total's row out (a blank fails a number's test, as in Excel); the
  // cursor's row stays; a formula counts every row; "show all" brings them back.
  const priceBox = geom(find("120"));
  w.kspage_web_click(priceBox[0] + 1, priceBox[1] + priceBox[3] / 2, 0);
  check(w.kspage_web_filter(3, stage("100")) === 1, "the table can be narrowed to prices above 100");
  check(find("80") < 0 && find("120") >= 0, "the 80 row is left out and the 120 row stays");
  check(find("Total") < 0, "the total's row, with no price, is left out too");
  w.kspage_web_rows_shown(scratch);
  check(read(4).join() === "1,3,1,1", `one of three rows is shown and the table is narrowed (${read(4).join()})`);
  check(find("760") >= 0, "a formula still counts the rows left out (the summary's sum stands)");
  check(w.kspage_web_filter(4, stage("100")) === 1, "the condition on the column is replaced");
  check(find("120") >= 0 && find("80") >= 0,
    "the row the cursor stands in stays though its price is not below 100, and the 80 row is back");
  check(w.kspage_web_filter(3, stage("many")) === -1, "a word where a number is wanted is refused");
  check(w.kspage_web_unfilter() === 1, "show all takes the condition off");
  check(find("80") >= 0 && find("Total") >= 0, "every row is back");
  check(w.kspage_web_unfilter() === 0, "with nothing narrowed there is nothing to take off");

  // --- What the table works out ---
  // **It works it out afresh on every placing.**
  check(find("$360") >= 0 && find("$400") >= 0 && find("760") >= 0,
    "a cell holding a formula comes out as its value");

  const qty = find("3");
  check(qty >= 0, "the quantity's cell becomes a box");
  const at = geom(qty);
  // Press the cell's head and then type. 3 -> 13, so the amount becomes 1560 and the total 1960.
  // The amount's column carries a way of showing, so it comes out as a text holding the grouping.
  w.kspage_web_click(at[0] + 1, at[1] + at[3] / 2, 0);
  type("1");
  check(find("$1,560") >= 0, "the amount comes out afresh on the number typed over");
  check(find("1960") >= 0, "the total follows along too");

  // Gone back, both the formula and the value return.
  w.kspage_web_undo();
  check(find("$360") >= 0 && find("760") >= 0,
    "going back returns the value, formula and all");

  // --- Changing a formula ---
  // The formula typed is swapped whole. To see the value, leave the cell being typed on
  // (`shell.mjs`'s `leaveCell`). Press over the detail's total cell (=C2:C3.sum()).
  // Caution: **Hunt by the text carrying the way of showing** (a bare "760" is found elsewhere
  // first).
  const totalBox = find("$760");
  const totalAt = geom(totalBox);
  w.kspage_web_click(totalAt[0] + 1, totalAt[1] + totalAt[3] / 2, 0);
  check(w.kspage_web_takes_formula() === 1, "inside a cell a formula can be swapped");
  check(typed() === "=C2:C3.sum()", `behind the value seen there is a formula (${typed()})`);

  setTyped("=C2*2");
  check(typed() === "=C2*2", "the text typed is swapped");
  leaveCell();
  check(find("$720") >= 0, "it is worked out afresh by the formula swapped in");
  w.kspage_web_undo();
  leaveCell();
  check(find("$760") >= 0, "one step returns the original formula");

  // Over the body it is not a cell.
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_takes_formula() === 0, "in a body with no formula nothing can be swapped");

  // --- The frame of the cell it stands in ---
  // **The frame is the column's width and the row's height** (not the box inside the padding).
  const frame = () => {
    w.kspage_web_cell_frame(scratch);
    return read(5);
  };

  const inked = geom(find("760"));
  w.kspage_web_click(inked[0] + 1, inked[1] + inked[3] / 2, 0);
  const here = frame();
  check(here[4] === 1, "inside a cell the frame comes out");
  check(here[0] <= inked[0] && here[0] + here[2] >= inked[0] + inked[2],
    "the frame covers the box inside");
  check(here[2] > inked[2], "the frame is wider than what is inside (it is the column's width)");
  check(here[3] >= inked[3], "the frame is taller than what is inside (it is the row's height)");

  w.kspage_web_click(0, 10, 0);
  check(frame()[4] === 0, "over the body no frame comes out");

  // --- Settling a column's width ---
  // **The width is carried by the table, not by the style.**
  const qtyHead = geom(find("Qty"));
  const priceHead = geom(find("Price"));
  const step = priceHead[0] - qtyHead[0];
  check(near(step, 64), `it starts to the right by the column's width settled (${step})`);
  check(step > qtyHead[2], "the width settled is wider than what is inside");

  // --- A reference across tables ---
  // **The name is carried by the table, not by the style.**
  check(find("2") >= 0, "a value folding another table's range comes out (the items)");
  const carried = find("760");
  check(carried >= 0, "a value pointing at another table's cell comes out (the sum)");
  // Type the detail's quantity over and the summary's side follows along.
  const qtyCell = geom(find("3"));
  w.kspage_web_click(qtyCell[0] + 1, qtyCell[1] + qtyCell[3] / 2, 0);
  type("1");
  check(find("1960") >= 0, "typed over, the other table's value follows along too");
  w.kspage_web_undo();
  check(find("760") >= 0, "gone back, the other table's value returns too");

  // --- A formula inside prose ---
  // **A body carries no table of its own**; it points at the detail's cell by name.
  check(find("760") >= 0, "the body's formula becomes a value too");
  // Type the quantity over and the body's value follows along.
  const proseQty = geom(find("3"));
  w.kspage_web_click(proseQty[0] + 1, proseQty[1] + proseQty[3] / 2, 0);
  type("1");
  const grownTotal = find("1960");
  check(grownTotal >= 0, "typed over, the body's value follows along too");
  // The field opens over a body's formula as well (unchangeable, it would be one-way).
  w.kspage_web_click(geom(grownTotal)[0] + 1, geom(grownTotal)[1] + 2, 0);
  check(w.kspage_web_takes_formula() === 1, "in a body holding a formula it can be swapped");
  w.kspage_web_undo();
  check(find("760") >= 0, "gone back, the body's value returns too");

  // --- Dragging a column's seam ---
  // **The seam can be taken hold of only at the column's right edge** (inside, the text is chosen).
  const border = geom(find("Qty"))[1] + 4;
  check(w.kspage_web_edge_at(64, border) === 1, "a column's seam returns 1");
  check(w.kspage_web_edge_at(32, border) === 0, "inside a cell it cannot be taken hold of");

  check(w.kspage_web_grab_edge(64, border) === 1, "the seam can be taken hold of");
  w.kspage_web_drag_edge(104, border);
  w.kspage_web_release_edge();
  const widened = geom(find("Price"))[0] - geom(find("Qty"))[0];
  check(near(widened, 104), `as far as it was drawn becomes the column's width (${widened})`);

  // One dragging goes back in one step.
  w.kspage_web_grab_edge(104, border);
  w.kspage_web_drag_edge(140, border);
  w.kspage_web_drag_edge(170, border);
  w.kspage_web_drag_edge(200, border);
  w.kspage_web_release_edge();
  w.kspage_web_undo();
  const undone = geom(find("Price"))[0] - geom(find("Qty"))[0];
  check(near(undone, 104), `one step returns the width from before the dragging (${undone})`);

  // --- Fitting a column to what is in it (a second press on the seam) ---
  // **The column is far wider than its text here**, so a fitting must narrow it.
  // Caution: **Look at it narrowing, not at an exact number** (the width follows the typeface).
  // **The seam stands at 104 by now**, not 64 — the undo above put back 104.
  const beforeFit = geom(find("Price"))[0] - geom(find("Qty"))[0];
  check(w.kspage_web_fit_edge(104, border) === 1, "a seam can be fitted to what is in it");
  const fitted = geom(find("Price"))[0] - geom(find("Qty"))[0];
  check(fitted < beforeFit, `fitting narrows the column to its text (${beforeFit} -> ${fitted})`);
  check(fitted > 0, `the column does not close up entirely (${fitted})`);
  // **One press goes back in one step.**
  w.kspage_web_undo();
  const unfitted = geom(find("Price"))[0] - geom(find("Qty"))[0];
  check(near(unfitted, beforeFit), `one step returns the width from before the fitting (${unfitted})`);
  // **Off a seam nothing is fitted** (the press belongs to the text then).
  check(w.kspage_web_fit_edge(32, border) === 0, "inside a cell nothing is fitted");

  // A row's seam comes through the same entry point. **The bearing comes back** (1 column, 2 row).
  const cellTop = geom(find("Qty"))[1];
  const rowLine = cellTop + geom(find("Qty"))[3];
  check(w.kspage_web_edge_at(20, rowLine) === 2, "a row's seam returns 2");
  check(w.kspage_web_grab_edge(20, rowLine) === 1, "a row's seam can be taken hold of too");
  w.kspage_web_drag_edge(20, rowLine + 30);
  w.kspage_web_release_edge();
  const grown = geom(find("3"))[1] - cellTop;
  check(grown > geom(find("Qty"))[3],
    `as far as it was drawn becomes the row's height (${grown})`);
  // **A row's fitting is the naming going away**, so a row dragged taller comes back to the height
  // the laying out gives it unasked (the reason is on `Fit` in `kspage/lay/ask.kspls`).
  check(w.kspage_web_fit_edge(20, rowLine + 30) === 1, "a row's seam can be fitted too");
  const shrunk = geom(find("3"))[1] - cellTop;
  check(shrunk < grown, `fitting takes the row back to its contents (${grown} -> ${shrunk})`);
  w.kspage_web_undo();
  w.kspage_web_undo();

  // --- Joining cells ---
  // **A cell taken in comes away from the document** (else its text is there, unseen). **The cells
  // are chosen by dragging across them** (`extend`); one cell alone is refused by its own number.
  const headSpot = geom(find("The look"));
  const nextSpot = geom(find("The order"));
  w.kspage_web_click(headSpot[0] + 1, headSpot[1] + 1, 0);
  const wasBoxCount = w.kspage_web_layout(300);
  check(find("The order") >= 0, "the cell to be taken in is there");
  check(w.kspage_web_merge_cells() === -2, "one cell alone is refused by its own number");
  check(w.kspage_web_layout(300) === wasBoxCount, "a refused merge moves not one box");
  // Caution: **Press the far cell with `extend`**, or the choosing collapses to that one cell.
  w.kspage_web_click(nextSpot[0] + 1, nextSpot[1] + 1, 1);
  check(w.kspage_web_merge_cells() === 1, "the cells dragged across can be joined");
  check(w.kspage_web_layout(300) === wasBoxCount - 1, "the boxes drop by one");
  check(find("The order") === -1, "the text of the cell taken in comes away from the document");
  // A joined cell does not narrow (it is its columns' widths together).
  check(geom(find("The look"))[2] >= headSpot[2], "a joined cell does not narrow");
  // Undone, an empty cell comes back.
  check(w.kspage_web_split_cell() === 1, "the joining can be undone");
  check(w.kspage_web_layout(300) === wasBoxCount, "the count of boxes comes back too");
  check(find("The order") === -1, "the cell that comes back on undoing is empty");
  // It has to go back in one step.
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(find("The order") >= 0, "going back returns the text taken in too");
  // Outside the table it does not bite.
  w.kspage_web_click(0, 4, 0);
  check(w.kspage_web_merge_cells() === 0, "over the body nothing is joined");
  check(w.kspage_web_split_cell() === 0, "over the body nothing is undone");

  // --- Adding and dropping a row ---
  // **Move a row and move the formulas with it** (else the amount points at the empty row).
  const headAt = geom(find("Qty"));
  w.kspage_web_click(headAt[0] + 1, headAt[1] + headAt[3] / 2, 0);
  check(w.kspage_web_add_line(0) === 1, "inside a table a row can be added");
  check(find("$360") >= 0 && find("$400") >= 0,
    "the amount goes on pointing at the same quantity and price");
  check(find("760") >= 0,
    "the total, the summary's sum and the body all stay the same value");
  w.kspage_web_undo();
  check(find("$360") >= 0 && find("760") >= 0,
    "one step returns the row and the formulas alike");

  // A formula that pointed at a row dropped says it cannot point; it must not quietly point at the
  // cell beside it.
  const dropAt = geom(find("3"));
  w.kspage_web_click(dropAt[0] + 1, dropAt[1] + dropAt[3] / 2, 0);
  check(w.kspage_web_drop_line(0) === 1, "a row can be dropped");
  check(find("$400") >= 0, "the amount of the row left over stays as it was");
  check(find("$400") >= 0 && find("760") < 0, "the total becomes the row left over alone");
  w.kspage_web_undo();
  check(find("$360") >= 0 && find("760") >= 0,
    "one step returns the row dropped and the formulas alike");

  // --- A filter stays with its document ---
  // **Opening another document drops the filters**, whichever way it is opened: they point at the
  // old document's tables, whose arena the opening frees.
  const others = {
    "a saved text": () => ks.load(opens),
    "Markdown": () => w.kspage_web_load_markdown(ks.feed("# Another\n\nIts own text.\n")),
    "a text form": () => w.kspage_web_load_plain_text(ks.feed("Its own text.\n"), 0),
    "the manual": () => w.kspage_web_load_manual(),
  };
  for (const [how, other] of Object.entries(others)) {
    check(ks.load(opens) === 1, `the table can be opened again before ${how}`);
    const price = geom(find("120"));
    w.kspage_web_click(price[0] + 1, price[1] + price[3] / 2, 0);
    check(w.kspage_web_filter(3, stage("100")) === 1, `the table is narrowed before ${how}`);
    check(other() === 1, `${how} opens over the narrowed table`);
    w.kspage_web_layout(300);
    check(w.kspage_web_unfilter() === 0, `after ${how} no filter is left to take off`);
  }
}
