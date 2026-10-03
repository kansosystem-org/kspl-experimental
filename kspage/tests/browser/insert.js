// Inserting tables and slides, and a region's frame and colours.

function kspageProbeInsert(ks) {
  const { check, app, canvas, ime, press, pressAt, undoKey, openMenu, findBlock, dpr } = ks;

  // 16. The buttons that insert a table and a slide.
  //
  // **A button takes the focus**; unreturned, it cannot be typed on straight after the press.
  // Whether it went in is seen by the counts of tables and slides in the HTML written out.
  const tables = () => app.html().split("<table").length;
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
  const rowsIn = () => (app.html().match(/<tr[\s>]/g) || []).length;
  const cellsIn = () => (app.html().match(/<t[dh][\s>]/g) || []).length;
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
  // **This can be seen nowhere else**: the value is held by the JS, not a field, so forgetting the
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
  // press". **Press inside the slide before taking it off** (in the flow it does not come off);
  // **the cursor just after inserting is inside the slide**, so it goes out into the flow first.
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
  // painted colour are looked at. **The frame must come out neither in printing nor in the HTML
  // written out** (it is the editing screen's).
  const kinds = app.regions().map((one) => one.kind);
  check(kinds.length > 1, "there are two or more regions (" + kinds.join(",") + ")");
  check(kinds.includes("flow") && kinds.includes("grid"),
    "the prose region and the table region are apart");
  // With a frame mixed into the HTML written out, a dotted line comes out where it is handed to.
  check(app.html().indexOf("kspage-region") < 0, "no region comes out in the HTML written out");

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
