// Narrowing a table's rows by a condition (a filter): a way of looking, not a change to the
// document.

function kspageProbeFilter(ks) {
  const { check, app, openMenu, flyPick, press, canvas, spot } = ks;
  // Caution: **Let every press go again.** `press` only puts the pointer down, and one left down
  // silently turns the next press into a drag that selects, felling the merging checks that run
  // after this file.
  const tap = (x, y) => {
    press(x, y);
    canvas.dispatchEvent(new PointerEvent("pointerup", spot(x, y)));
  };
  const narrowed = document.getElementById("narrowed");
  const note = document.getElementById("note");
  const textBox = document.getElementById("filter-text");
  // **The condition and the ticks live in the one panel the heading's arrow opens** (`narrow.js`),
  // so every press below opens it first.
  const openNarrow = () => {
    openMenu("narrow-here");
    document.getElementById("narrow-here").click();
  };

  // The sample's price column holds 120 and 80. "Is above 100" leaves the 80 row out, and the
  // total's row too (a blank fails a number's test, as in Excel).
  check(app.find("120", false) && app.cellFrame() !== null,
    "a cell of the price's column can be landed on");
  const was = app.rowsShown();
  check(was !== null && !was[2], "before narrowing, nothing is narrowed");
  openNarrow();
  check(!document.getElementById("narrow").hidden, "the arrow's panel opens at that column");
  check(flyPick("filter-keep", "is above"), "the kind can be chosen");
  textBox.value = "100";
  document.getElementById("filter-apply").click();
  const now = app.rowsShown();
  check(now !== null && now[2], "the table is narrowed");
  check(now !== null && was !== null && now[0] < was[0],
    `fewer rows are shown (${now && now[0]} of ${now && now[1]})`);
  check(narrowed.textContent.indexOf("shown") >= 0,
    `the status says how many are shown (${narrowed.textContent})`);
  check(note.textContent === "", "a narrowing that acted leaves no notice");

  // A number is wanted for "is above": a word is refused, and the notice says so.
  openNarrow();
  textBox.value = "many";
  document.getElementById("filter-apply").click();
  check(note.textContent === "Type a number to compare with",
    "a word where a number is wanted is refused with the reason");
  check(app.rowsShown() !== null && app.rowsShown()[2], "and the narrowing before it holds");

  // Showing all again.
  openMenu("filter-clear");
  document.getElementById("filter-clear").click();
  const back = app.rowsShown();
  check(back !== null && was !== null && !back[2] && back[0] === was[0],
    "Show all rows brings every row back");
  check(narrowed.textContent === "", "and the status falls silent");
  openMenu("filter-clear");
  document.getElementById("filter-clear").click();
  check(note.textContent === "No rows are narrowed",
    "with nothing narrowed, Show all rows says so");

  // ---- The set of values ticked, and the arrow that opens it ----
  //
  // **This can be seen nowhere else**: the list is built from what the core says the column shows,
  // so a wrong order or a value missed shows only here.
  check(app.find("120", false) && app.cellFrame() !== null,
    "a cell of the price's column can be landed on again");
  const said = app.columnValues();
  check(said !== null && said.values.length > 0,
    `the column's values come out (${said && said.values.join("/")})`);
  check(said !== null && said.chosen === null,
    "with nothing narrowed, no set is chosen");
  // **The order is the order that column sorts in**, so 80 stands before 120 (compared as a number,
  // not as text).
  check(said !== null && said.values.indexOf("80") < said.values.indexOf("120"),
    "the values come in the order that column sorts in");
  const every = app.rowsShown();
  check(app.filterValues(["120"]) === "", "the column narrows to one ticked value");
  const one = app.rowsShown();
  check(one !== null && every !== null && one[0] < every[0],
    `fewer rows are shown (${one && one[0]} of ${one && one[1]})`);
  const again = app.columnValues();
  check(again !== null && again.chosen !== null && again.chosen.length === 1
    && again.chosen[0] === "120", "the panel shows back what is ticked");
  // **Taking the narrowing off this column alone is its own way back**, apart from "Show all rows"
  // (every column at once).
  check(app.showThisColumn() === "", "the column's own narrowing comes off");
  const freed = app.rowsShown();
  check(freed !== null && every !== null && freed[0] === every[0],
    "and every row is back");
  check(app.showThisColumn() === "This column is not narrowed",
    "taking it off twice says why the second did nothing");
  // The panel reached from the ribbon's button opens at the column the cursor stands in.
  check(app.openNarrow() === "", "the ribbon's button opens the same panel");
  check(!document.getElementById("narrow").hidden, "and it is out");
  document.getElementById("narrow-shut").click();
  check(document.getElementById("narrow").hidden, "closing it puts it away");

  // The arrow drawn in the heading. **It is painted on the canvas, so only a press on the canvas
  // reaches it** — misplace it by a few pixels and nothing here would say so.
  check(app.find("120", false) && app.cellFrame() !== null, "back in the price's column");
  const cell = app.cellFrame();
  // Walking up the column lands the cursor in the heading, whose cell frame the arrow hangs off.
  let head = cell;
  for (let y = cell[1] - 6; y > 0; y -= 6) {
    tap(cell[0] + 6, y);
    const f = app.cellFrame();
    if (f === null) break;
    head = f;
  }
  check(head[1] < cell[1], "the column's heading cell is above the row pressed");
  tap(head[0] + head[2] - 10, head[1] + head[3] / 2);
  check(!document.getElementById("narrow").hidden,
    "pressing the arrow drawn in the heading opens the panel");
  document.getElementById("narrow-shut").click();
  // **A press inside the heading away from the arrow is an ordinary press**, so the cell can still
  // be typed in.
  tap(head[0] + 6, head[1] + head[3] / 2);
  check(document.getElementById("narrow").hidden,
    "a press elsewhere in the heading does not open it");
}
