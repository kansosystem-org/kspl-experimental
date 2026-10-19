// The keys while one sheet at a time is being shown, and Enter splitting a paragraph.

function kspageProbeShow(ks) {
  const { check, app, canvas, ime, pressAt } = ks;

  // 14. While one sheet at a time is shown, a key goes to sending rather than editing. Only a real
  // keystroke shows whether what types is shut: the hidden input field takes the keys.
  if (app.surfaceCount() > 0) {
    const key = (k) => ime.dispatchEvent(new KeyboardEvent("keydown",
      { key: k, bubbles: true, cancelable: true }));
    const before = app.text();
    check(app.present(0) === 0, "the first sheet can be shown");
    check(app.showing() === 0, "the number of the slide being shown comes back");
    // **While it is being shown the canvas is the window's size** (the page folds the adornment).
    check(canvas.clientWidth > 0 && canvas.clientHeight > 0, "the canvas has a size");
    // In a sample with one slide alone, sending stays put (it does not cross the edge).
    key("ArrowRight");
    check(app.showing() === 0, "it does not go past the last slide");
    key("ArrowLeft");
    check(app.showing() === 0, "it does not go back before the first sheet either");
    // **What types must be shut.** Open, the document is rewritten while it is shown.
    ime.dispatchEvent(new InputEvent("input", { data: "X", bubbles: true }));
    key("Backspace");
    check(app.text() === before,
      "while it is shown the document changes on neither a type nor an delete");
    key("Escape");
    check(app.showing() === -1, "Esc goes back to the editing screen");
    check(app.text() === before, "back there, the document is as it was");
  }

  // 15. Enter is wired to what splits a paragraph (**untaken, a line break goes into the hidden
  // input field**). The count of blocks in the document shows it.
  const blocks = () => ks.savedBlocks().length;
  // Caution: **Lay it over the body before pressing.** Inside a table's cell it does not split, so
  // "it does not grow on a press" would be the correct answer.
  pressAt(8);
  const wasBlocks = blocks();
  const split = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  ime.dispatchEvent(split);
  check(split.defaultPrevented, "Enter is taken over");
  check(blocks() === wasBlocks + 1,
    "one paragraph grows (" + wasBlocks + " -> " + blocks() + ")");
  check(ime.value === "", "no line break goes into the hidden input field");
  // Delete at the split head and it goes back.
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Backspace", bubbles: true, cancelable: true }));
  check(blocks() === wasBlocks, "a Backspace at the head puts the paragraph count back");
}

// Inserting tables and slides, and a region's frame and colours.

function kspageProbeInsert(ks) {
  const { check, app, canvas, ime, press, pressAt, undoKey, openMenu, findBlock, dpr } = ks;

  // 16. The buttons that insert a table and a slide.
  //
  // **A button takes the focus**; unreturned, it cannot be typed on straight after the press.
  // Whether it went in is seen by the counts of tables and slides in the document.
  const tables = ks.tableCount;
  pressAt(8);
  const wasTables = tables();
  const wasSurfaces = app.surfaceCount();
  openMenu("put-table");
  document.getElementById("put-table").click();
  check(tables() === wasTables + 1, "one table grows");
  check(document.activeElement === ime,
    "after a table goes in the focus goes back to the input field");
  // The cursor is in a cell of the table just inserted, so nothing can be inserted there.
  openMenu("put-table");
  document.getElementById("put-table").click();
  check(tables() === wasTables + 1, "it does not grow inside a cell");
  check(document.getElementById("note").textContent.length > 0,
    "the reason it cannot go in comes out");
  pressAt(8);

  // The grid the size is chosen on. **Point and it says the size, columns first**; press and a
  // table of that size goes in (Word's shape — `fly.js`'s `kspageGridPick`).
  const gridCell = (cols, rows) => document.querySelector(
    `#table-size .grid-cell[aria-label="${cols} columns × ${rows} rows"]`);
  const rowsIn = ks.rowCount;
  const cellsIn = ks.cellCount;
  openMenu("put-table");
  const four3 = gridCell(4, 3);
  check(four3 !== null, "the grid holds a cell for four columns by three rows");
  four3.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  check(document.querySelector("#put-table-fly .grid-say").textContent === "4 × 3",
    "pointing at the grid says the size, columns first");
  check(document.querySelectorAll("#table-size .grid-cell.on").length === 12,
    "twelve cells light for four by three");
  const wasRows = rowsIn();
  const wasCells = cellsIn();
  four3.click();
  check(rowsIn() === wasRows + 3, "pressing the grid inserts three rows");
  check(cellsIn() === wasCells + 12, "and four cells to each of them");
  check(document.activeElement === ime, "after the grid's press the focus goes back to the input field");
  // Tab past the last cell adds a row (Word, Docs and Writer all do). Enter in a cell moves down a
  // row and Shift+Enter up — one rule: a move past the table's end grows a row.
  const key = (k, shift) => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: k, shiftKey: !!shift, bubbles: true, cancelable: true }));
  // A fresh table already fills the text width. Both insertion controls must add a visible
  // column without shrinking the old ones, including after the last column at the page edge.
  const firstCell = app.cellFrame();
  openMenu("add-col");
  document.getElementById("add-col").click();
  check(cellsIn() === wasCells + 15, "the menu adds a column to every row of a fresh table");
  check(Math.abs(app.cellFrame()[2] - firstCell[2]) < 0.5, "the current column keeps its width");
  key("Tab");
  check(Math.abs(app.cellFrame()[2] - firstCell[2]) < 0.5,
    "the inserted column has the same visible width");
  undoKey();
  check(cellsIn() === wasCells + 12, "one undo removes the new column");
  press(firstCell[0] + 8, firstCell[1] + 8);
  for (let i = 0; i < 3; i += 1) key("Tab");
  const chromeLeft = document.getElementById("chrome").getBoundingClientRect().left;
  let addColumn = document.getElementById("tool-col");
  if (addColumn.getBoundingClientRect().width === 0) {
    document.getElementById("spill").open = true;
    addColumn = Array.from(document.querySelectorAll("#spill .items button"))
      .find((button) => button.textContent === "Table: Insert a column");
  }
  check(addColumn !== undefined, "the ribbon offers Insert a column, directly or in its overflow");
  const buttonRect = addColumn.getBoundingClientRect();
  const hit = document.elementFromPoint(buttonRect.left + buttonRect.width / 2,
    buttonRect.top + buttonRect.height / 2);
  check(hit !== null && (hit === addColumn || addColumn.contains(hit)),
    "the ribbon's insertion button can be pointed at");
  addColumn.click();
  check(cellsIn() === wasCells + 15, "the ribbon adds a column after the last one");
  key("Tab");
  const endCell = app.cellFrame();
  check(Math.abs(endCell[2] - firstCell[2]) < 0.5, "the new last column has a visible width too");
  check(canvas.clientWidth >= endCell[0] + endCell[2] - 1, "the canvas draws the whole last column");
  const viewport = canvas.parentElement;
  const view = viewport.getBoundingClientRect();
  const cursor = app.caretElement.getBoundingClientRect();
  check(viewport.scrollLeft > 0 && cursor.left >= view.left &&
    cursor.right <= view.left + viewport.clientWidth,
    "Tab scrolls horizontally to keep the new column's cursor in view");
  check(window.scrollX === 0 && document.getElementById("chrome").getBoundingClientRect().left === chromeLeft,
    "the document scrolls without moving the tools");
  ks.typeIn("new-column-text");
  check(app.save().includes("new-column-text"), "the new column accepts typing");
  undoKey();
  undoKey();
  check(cellsIn() === wasCells + 12, "undo takes the text and column back separately");
  press(firstCell[0] + 8, firstCell[1] + 8);
  for (let i = 0; i < 11; i += 1) key("Tab");
  check(rowsIn() === wasRows + 3, "eleven Tabs walk the twelve cells without growing a row");
  key("Tab");
  check(rowsIn() === wasRows + 4, "Tab from the last cell adds a row");
  const lastFrame = app.cellFrame();
  key("Enter", true);
  const upFrame = app.cellFrame();
  check(lastFrame !== null && upFrame !== null && upFrame[1] < lastFrame[1],
    "Shift+Enter moves up a row");
  key("Enter");
  check(app.cellFrame()[1] === lastFrame[1], "Enter moves back down to it");
  key("Enter");
  check(rowsIn() === wasRows + 5, "Enter from the last row adds a row");
  undoKey();
  undoKey();
  check(rowsIn() === wasRows + 3, "two undos take the rows added back");
  undoKey();
  check(rowsIn() === wasRows, "one more takes the sized table back");
  // Leaving the grid puts the light back on what is landed, not on what was pointed at.
  openMenu("put-table");
  gridCell(9, 7).dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  document.getElementById("table-size").dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
  check(document.querySelector("#put-table-fly .grid-say").textContent === "4 × 3",
    "leaving the grid puts the light back on the size landed");
  pressAt(8);
  openMenu("put-slide");
  // The menu of slide sketches.
  //
  // **This can be seen nowhere else**: a misspelt id in the menu leaves the wasm unhurt, and any
  // sketch becomes one frame. The frame count is the count of `frame` in the text saved.
  const frames = () => app.save().split("\"frame\"").length - 1;
  const framesWere = frames();
  // It sees that the press landed — missed, it passes with the default sketch going in
  // (`probe.js`'s `flyPick`).
  check(ks.flyPick("slide-sketch", "One frame"),
    "\"One frame\" can be chosen from the sketch submenu");
  document.getElementById("put-slide").click();
  check(app.surfaceCount() === wasSurfaces + 1, "one slide grows");
  check(frames() === framesWere + 1, "the one-frame sketch grows one frame");
  undoKey();
  pressAt(8);
  check(ks.flyPick("slide-sketch", "A title and two columns"),
    "\"A title and two columns\" can be chosen from the sketch submenu");
  // What was chosen must be readable from the shut row.
  //
  // **This can be seen nowhere else.** The value is held by the JS, not a field. So forgetting the
  // place that puts it out still passes the entry point (the same harm as a `<select>`).
  check(ks.flyNow("slide-sketch") === "A title and two columns",
    "the sketch chosen comes out to the shut row's right (" + ks.flyNow("slide-sketch") + ")");
  check(ks.flyTick("slide-sketch") === "A title and two columns",
    "the sketch chosen gets the mark (" + ks.flyTick("slide-sketch") + ")");
  document.getElementById("put-slide").click();
  check(frames() === framesWere + 3, "the title-and-two-columns sketch grows three frames");

  // The button that takes one frame off.
  //
  // **This can be seen nowhere else**: a misspelt id breaks only as "the frames do not go down on a
  // press". **Press inside the slide before taking it off** (in the flow it does not come off).
  // **The cursor just after inserting is inside the slide**, so it goes out into the flow first.
  pressAt(8);
  openMenu("drop-frame");
  document.getElementById("drop-frame").click();
  check(document.getElementById("note").textContent ===
    "Deleting is only possible inside a slide, and where there are two or more frames",
    "outside a slide the reason it cannot come off comes out");
  // The slide inserted comes first in the document's order. **Where a slide is is asked of the
  // laid-out result.**
  const faces = app.regions().filter((one) => one.kind === "absolute");
  check(faces.length > 0, "the slide's region comes out");
  press(faces[0].x + faces[0].w / 2, faces[0].y + 8);
  openMenu("drop-frame");
  document.getElementById("drop-frame").click();
  check(frames() === framesWere + 2, "inside a slide one frame goes down");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  undoKey();
  check(frames() === framesWere + 3, "the frame taken off comes back in one");

  openMenu("put-slide");
  undoKey();
  pressAt(8);
  ks.flyPick("slide-sketch", "One frame");
  document.getElementById("put-slide").click();
  // Caution: **Put it back for the checks that follow.** The table inserted goes before the details
  // table, so the checks on "the first table" would look at this one.
  undoKey();
  undoKey();
  check(tables() === wasTables && app.surfaceCount() === wasSurfaces, "two undos put it back");
  // The cursor that came back points at a block that came off, so it is laid down again.
  pressAt(8);

  // A container put in can be deleted whole. **Only tables, slides and pictures** (a paragraph goes
  // by Backspace and Delete).
  openMenu("put-table");
  document.getElementById("put-table").click();
  check(tables() === wasTables + 1, "one table goes in before deleting");
  openMenu("drop-holder");
  document.getElementById("drop-holder").click();
  check(tables() === wasTables, "the table it is in can be deleted whole");
  check(document.activeElement === ime, "after the delete the focus goes back to the input field");
  pressAt(8);
  openMenu("drop-holder");
  document.getElementById("drop-holder").click();
  check(document.getElementById("note").textContent.length > 0,
    "over the body the reason it cannot be deleted comes out");

  // 17. A region's frame, and the characters' and background's colours.
  //
  // **What is inside the canvas does not come out in the DOM**, so the row of regions and the
  // painted colour are looked at. **The frame must not come out in printing** (it is the
  // editing screen's).
  const kinds = app.regions().map((one) => one.kind);
  check(kinds.length > 1, "there are two or more regions (" + kinds.join(",") + ")");
  check(kinds.includes("flow") && kinds.includes("grid"),
    "the prose region and the table region are apart");

  // A colour goes into a style, looked at by the canvas's pixels. **This can be seen nowhere else**
  // — the colour can reach the box and still not be drawn unless laid down again at drawing time.
  const h1At = app.styleNames().indexOf("heading");
  check(h1At >= 0, "the sample holds an h1 style");
  const wasLook = app.styleLook(h1At);
  check(wasLook.color === null, "the colour starts from unset");
  app.setStyleLook(h1At, { family: null, sizePx: 28, weight: 700, italic: null,
    color: "#ff0000", background: "#00ff00" });
  const inked = app.styleLook(h1At);
  check(inked.color === "#ff0000" && inked.background === "#00ff00",
    "the colour settled can be read back (" + inked.color + "/" + inked.background + ")");
  // It peeks at the band the heading is in.
  // Caution: **Do not look at one point alone.** Whether it is over a character or the background
  // depends on the font, and a character gives its own colour back. A ratio is applied, so the
  // pixel coordinates are doubled.
  // **Hunt for where the band is** (the same reason as in `paint.js`).
  const headY = findBlock("heading");
  check(headY >= 0, "the heading's paragraph is there");
  const strip = canvas.getContext("2d")
    .getImageData(0, Math.round(headY * dpr), Math.round(60 * dpr), Math.round(30 * dpr)).data;
  let greens = 0;
  let reds = 0;
  for (let i = 0; i < strip.length; i += 4) {
    if (strip[i] > 200 && strip[i + 1] < 80) reds += 1;
    if (strip[i + 1] > 200 && strip[i] < 80) greens += 1;
  }
  check(greens > 0, "the background's green comes out on the canvas (" + greens + " pixels)");
  check(reds > 0, "the characters' red comes out on the canvas (" + reds + " pixels)");
  undoKey();
  check(app.styleLook(h1At).color === null, "one undo deletes the colour settled");
}

// The table heading kept in view while its table passes under the tools.

function kspageProbePin(ks) {
  const { check, app, canvas, pressAt, undoKey } = ks;

  // **The band is a sheet of its own**, laid under the tools. Nothing is pressed or saved for it:
  // a table taller than the window is enough.
  const pin = document.getElementById("pinned-head");
  check(pin !== null, "the sheet the heading is kept on is there");
  const wasY = window.scrollY;
  pressAt(8);
  check(app.insertTable("table", 40, 2), "a table of forty rows goes in after the paragraph");
  check(app.addLine("column") === "", "the tall table can grow past the page's width");
  const frame = app.cellFrame();
  check(frame !== null, "the cursor stands in the fresh table's first cell");
  // The canvas's place in the document (the window scrolls the document, not the canvas).
  const canvasTop = canvas.getBoundingClientRect().top + window.scrollY;
  check(app.pinnedHead() === null, "with the heading on the screen nothing is kept");

  // Send the heading past the top, with most of the table still below.
  window.scrollTo(0, canvasTop + frame[1] + frame[3] * 6);
  const kept = app.pinnedHead();
  check(kept !== null, "with the heading gone past the top, it is kept in view");
  check(kept !== null && Math.abs(kept[4] - frame[3]) < 0.5, "the band is the first row's height");
  check(kept !== null && Math.abs(kept[1] - frame[0]) < 0.5, "and starts at the first cell's edge");
  check(getComputedStyle(pin).display === "block", "the sheet is shown");
  const room = app.headRoom();
  check(Math.abs(pin.getBoundingClientRect().top - room) < 1.5, "it stands just under the tools");
  check(pin.width > 0 && pin.height > 0, "and holds a painting");
  const viewport = canvas.parentElement;
  viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
  viewport.dispatchEvent(new Event("scroll"));
  const view = viewport.getBoundingClientRect();
  const clipped = pin.getBoundingClientRect();
  check(clipped.left >= view.left - 1 && clipped.right <= view.left + viewport.clientWidth + 1,
    "a wide heading scrolls with the table and stays clear of the side panel");

  // **A press on the band is a press on the heading.** The cursor goes into that cell, and the
  // window follows it up, so the real heading shows and nothing is kept.
  const at = pin.getBoundingClientRect();
  const docX = at.left + 4 - canvas.getBoundingClientRect().left;
  pin.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.left + 4, clientY: at.top + 4,
    button: 0, bubbles: true, cancelable: true }));
  const back = app.cellFrame();
  check(back !== null && Math.abs(back[1] - frame[1]) < 0.5,
    "a press on the band stands the cursor in the heading row");
  check(back !== null && docX >= back[0] && docX < back[0] + back[2],
    "after horizontal scrolling the press reaches the correct heading cell");
  check(app.pinnedHead() === null, "and the window follows up to the real heading");

  // Send the whole table past the top: nothing is kept (the band leaves with the last row).
  window.scrollTo(0, canvasTop + frame[1] + frame[3] * 45);
  check(app.pinnedHead() === null, "once the table has passed, nothing is kept");
  window.scrollTo(0, 0);
  check(app.pinnedHead() === null && getComputedStyle(pin).display === "none",
    "at the head of the document the sheet is hidden");

  undoKey();
  check(app.cellFrame() !== null, "one undo removes the extra column and keeps the table");
  undoKey();
  check(app.cellFrame() === null, "the next undo takes the table back");
  window.scrollTo(0, wasY);
}
