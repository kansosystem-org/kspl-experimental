// Narrowing a table's rows by a condition (a filter): a way of looking, not a change to the
// document.

function kspageProbeFilter(ks) {
  const { check, app, openMenu, flyPick, press, canvas, spot } = ks;
  // Caution: **Let every press go again.** `press` only puts the pointer down. One left down
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
    document.getElementById("narrow-condition").open = true;
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
  // **This can be seen nowhere else.** The list is built from what the core says the column
  // shows, so a wrong order or a value missed shows only here.
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
  const upButton = document.getElementById("sort-up").getBoundingClientRect();
  const downButton = document.getElementById("sort-down").getBoundingClientRect();
  check(upButton.top >= downButton.bottom, "sort commands occupy separate menu rows");
  check(!document.getElementById("narrow-condition").open, "conditions start folded away");
  const search = document.getElementById("narrow-find");
  search.value = "blanks";
  search.dispatchEvent(new Event("input", { bubbles: true }));
  check(document.getElementById("narrow-list").textContent.includes("(Blanks)"),
    "search can find blank cells without matching case");

  document.getElementById("narrow-shut").click();
  check(document.getElementById("narrow").hidden, "closing it puts it away");
  app.openNarrow();
  const pending = document.querySelector("#narrow-list input");
  pending.click();
  document.getElementById("narrow-shut").click();
  check(app.rowsShown()[0] === every[0], "Cancel discards pending checkbox changes");
  app.openNarrow();
  document.querySelector("#narrow-list input").click();
  document.getElementById("narrow-ticked").click();
  check(document.getElementById("narrow").hidden && app.rowsShown()[0] < every[0],
    "OK applies checkbox changes and closes the menu");
  app.openNarrow();
  document.getElementById("narrow-clear").click();
  check(document.getElementById("narrow").hidden && app.rowsShown()[0] === every[0],
    "Clear filter restores rows and closes the menu");
  app.openNarrow();
  document.getElementById("narrow-find").dispatchEvent(new KeyboardEvent("keydown",
    { key: "Escape", bubbles: true, cancelable: true }));
  check(document.getElementById("narrow").hidden, "Escape closes the filter menu");


  // The arrow drawn in the heading. **It is painted on the canvas, so only a press on the canvas
  // reaches it.** Misplace it by a few pixels, and nothing here would say so.
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

// Hunting and replacing; copying, cutting and pasting: **the wiring alone** (the keys and the
// fields taken over, the clipboard's events, the focus, the count shown). What a find, a replace or
// a paste does to the document is the core's, checked in `kspage/tests/`.
//
// What it hunts for (`document`) is the sample document's own text, so that needle moves when
// `kspage/content` does. The word it replaces in is this side's own. What it pastes is non-ASCII on
// purpose (the reason is where it is pasted).

function kspageProbeFind(ks) {
  const { check, app, canvas, ime, pressAt, undoKey } = ks;

  // 18. Hunting and replacing.
  //
  // **This can be seen nowhere else.** It checks that Ctrl+F is taken over and the focus moves to
  // the field. It checks that the focus goes back to the body after the press. Untaken, the
  // browser's own hunt runs over a body inside the canvas, so **not one hit is found**.
  // **There is no row.** The hunt field sits on the band's right side, so Ctrl+F jumps to the
  // field. A row folding and unfolding makes the body leap on every press.
  const findBox = document.getElementById("find-text");
  const findKey = new KeyboardEvent("keydown",
    { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(findKey);
  check(findKey.defaultPrevented, "Ctrl+F is taken over");
  check(document.activeElement === findBox, "the focus moves to the hunt field");
  check(findBox.closest("#bar") !== null, "the hunt field is inside the band (it eats no row)");
  // The count comes out while typing.
  //
  // **This can be seen nowhere else.** Counting is the wasm's, but the keystrokes' wiring to the
  // field needs the DOM. It breaks as "the count does not come out on the press".
  // Caution: **Put 0 out too.** Left empty, whether it counted or the answer is 0 cannot be told.
  const tallyBox = document.getElementById("find-tally");
  const typeFind = (t) => {
    findBox.value = t;
    findBox.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  typeFind("document");
  check(/^[1-9]\d* found$/.test(tallyBox.textContent),
    "typing puts the count out (" + tallyBox.textContent + ")");
  typeFind("a text that cannot be there");
  check(tallyBox.textContent === "0 found",
    "with none there, 0 comes out (" + tallyBox.textContent + ")");
  typeFind("");
  check(tallyBox.textContent === "", "with the field empty nothing comes out");

  // It hunts and selects.
  // In the hunt field Enter is "next".
  findBox.value = "document";
  findBox.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Enter", bubbles: true, cancelable: true }));
  check(app.selectionText() === "document",
    "what was found is selected (" + app.selectionText() + ")");
  // Caution: Say that nothing was found; gone quiet, it looks as though nothing happens.
  findBox.value = "a text that cannot be there";
  document.getElementById("find-next").click();
  check(document.getElementById("note").textContent === "Not found",
    "with none there it says so");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // It replaces and puts it back.
  findBox.value = "document";
  document.getElementById("find-with").value = "papers";
  const wasBody = app.text();
  document.getElementById("find-swap-all").click();
  check(app.text() !== wasBody, "replace all changes the body");
  check(document.getElementById("note").textContent.indexOf("Replaced") >= 0,
    "it says how many");
  // Caution: **Count again after replacing**, or the old count reads as "there are still some".
  check(tallyBox.textContent === "0 found",
    "after replacing it becomes 0 (" + tallyBox.textContent + ")");
  // **Leave the document as it was found** (the next sections run on it).
  undoKey();
  check(app.text() === wasBody, "the document is put back after the replace");
  // Esc folds it and goes back to the body.
  findBox.focus();
  findBox.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Escape", bubbles: true, cancelable: true }));
  check(document.activeElement === ime, "after Esc the focus goes back to the body");
  pressAt(8);

  // 19. Copy, cut and paste are wired to the body.
  //
  // **This can be seen nowhere else**: `clipboardData` exists only in a real browser, and the
  // hidden input field's taking over needs the DOM. The keys are not pressed (a scripted keystroke
  // starts no default copy). The `else { return; }` that does not take over keeps the way from a
  // key.
  const clip = (kind) => {
    const e = new ClipboardEvent(kind, {
      clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
    });
    ime.dispatchEvent(e);
    return e;
  };
  pressAt(8);
  const wasText = app.text();
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  const picked = app.selectionText();
  check(picked.length > 0, "the selected range's text can be got (" + picked + ")");
  const copied = clip("copy");
  check(copied.defaultPrevented, "the copy is taken over");
  check(copied.clipboardData.getData("text/plain") === picked,
    "the selected text goes into the clipboard");
  // With nothing selected it does not take over (copying text from outside the page stays open).
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", bubbles: true, cancelable: true }));
  check(!clip("copy").defaultPrevented, "with nothing selected the copy walks past");

  // Caution: **Take the paste over too.** Left to the default it goes into the hidden input field
  // and never reaches the body.
  // **Keep the pasted character non-ASCII.** The clipboard is a way apart from the IME's
  // (`input.js`), so with ASCII a byte count lost on the way would pass.
  const pasted = new ClipboardEvent("paste", {
    clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
  });
  pasted.clipboardData.setData("text/plain", "貼");
  ime.dispatchEvent(pasted);
  check(pasted.defaultPrevented, "the paste is taken over");
  check(app.text().indexOf("貼") >= 0, "the pasted text goes into the body");
  check(ime.value === "", "it does not go into the hidden input field");
  undoKey();

  // Cutting is copying and deleting.
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  const cut = clip("cut");
  check(cut.clipboardData.getData("text/plain").length > 0,
    "the cut text goes into the clipboard");
  check(app.text().length < wasText.length, "the cut takes the selection off the body");
  undoKey();
  check(app.text() === wasText, "the document is put back after the paste and the cut");
  pressAt(8);
}
