// A paragraph's fill and frame, the underline, and joining cells.
//
// The style name `heading` is the document's and the theme name `Indigo` is the core's
// (`kspage/write/theme.kspl`), so those needles follow those sides.

function kspageProbePaint(ks) {
  const { check, app, canvas, ime, spot, undoKey, openMenu, findBlock, dpr } = ks;

  const h1At = app.styleNames().indexOf("heading");
  // Caution: **Hunt for where the band is**, as the cell hunt does. The start-up rows are the
  // product's sample, so a place settled up front falls with "0 pixels" once the sample changes.
  const headY = findBlock("heading");
  check(headY >= 0, "the heading's paragraph is there");
  // **Take it from above where it pressed, wider than the paragraph's length.** The y pressed is
  // partway down the paragraph, so peeking 30px from there drops the underline below the band ("it
  // does not grow"). The colour landed meets no other paragraph's, so a neighbour does not ride on
  // the count.
  const bandTop = Math.max(0, headY - 24);
  const bandAt = () => canvas.getContext("2d")
    .getImageData(0, Math.round(bandTop * dpr), Math.round(60 * dpr), Math.round(72 * dpr)).data;
  // Caution: **Land on the cell by its text, not by pressing down the canvas.** Where the tables
  // sit moves with the sample's layout. The first cell a downward scan meets can have nothing to
  // join or reorder. The press then goes green about being wired while acting on nothing, and its
  // undo takes a neighbouring step back instead. `find` goes the same way as the hunt field, and
  // lands the cursor inside that cell.
  const inCell = (want) => app.find(want, false) && app.cellFrame() !== null;

  // 20. A paragraph's fill and frame come out on the canvas.
  //
  // **This can be seen nowhere else.** With the drawing order wrong, the fill covers the
  // characters and the line juts into the neighbouring cell, told only by pixels. The fill and the
  // line take different colours, so the fill cannot pass for a line.
  app.setStyleData(h1At,
    { ...app.styleData(h1At), rule_width: 2, rule_color: "#ff00ff", fill: "#0000ff" });
  const walled = app.styleData(h1At);
  check(walled.rule_width === 2 && walled.fill === "#0000ff",
    "the frame and fill settled can be read back (" + walled.rule_width + "/" + walled.fill + ")");
  const band = bandAt();
  let blues = 0;
  let walls = 0;
  for (let i = 0; i < band.length; i += 4) {
    if (band[i + 2] > 200 && band[i] < 80 && band[i + 1] < 80) blues += 1;
    if (band[i] > 200 && band[i + 2] > 200 && band[i + 1] < 80) walls += 1;
  }
  check(blues > 0, "the paragraph's fill comes out on the canvas (" + blues + " pixels)");
  check(walls > 0, "the paragraph's frame comes out on the canvas (" + walls + " pixels)");
  // See that it can be deleted too: a field left out is "unset".
  app.setStyleData(h1At, { ...app.styleData(h1At), rule_width: undefined, fill: undefined });
  const bare = app.styleData(h1At);
  check(bare.rule_width === undefined && bare.fill === undefined,
    "the frame and fill can be deleted");

  // 21. The underline comes out on the canvas.
  //
  // **This can be seen nowhere else**: the setting can reach the box and still not be drawn. The
  // line is the characters' colour, so pixels of that colour growing are looked at.
  const blueOf = () => {
    const band = bandAt();
    let n = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (band[i + 2] > 200 && band[i] < 80 && band[i + 1] < 80) n += 1;
    }
    return n;
  };
  app.setStyleData(h1At, { ...app.styleData(h1At), color: "#0000ff", background: undefined });
  const plainInk = blueOf();
  app.setStyleData(h1At, { ...app.styleData(h1At), underline: true, strike: undefined });
  check(app.styleData(h1At).underline === true, "the line settled can be read back");
  const withLine = blueOf();
  check(withLine > plainInk,
    "the pixels grow by the underline's worth (" + plainInk + " -> " + withLine + ")");

  // 22. The buttons that join cells.
  //
  // **This can be seen nowhere else.** Misspell an id of the table menu's buttons and the wasm is
  // unhurt (it breaks as "press it and it does not join"). Joining takes the cells it drew in off,
  // so the body's text shortens.
  openMenu("merge-cells");
  check(inCell("Qty"), "the heading cell of the table with formulas can be landed on");
  const wholeTable = app.text();
  // **One cell alone says so rather than going quiet**, seen through the button a person presses.
  document.getElementById("merge-cells").click();
  check(document.getElementById("note").textContent.indexOf("two or more") >= 0,
    "one cell alone is refused, saying to drag first ("
      + document.getElementById("note").textContent + ")");
  // **Drag across two cells, then press**, as in Excel.
  const cell = app.cellFrame();
  const drag = (x0, y0, x1, y1) => {
    canvas.dispatchEvent(new PointerEvent("pointerdown", spot(x0, y0)));
    canvas.dispatchEvent(new PointerEvent("pointermove",
      Object.assign(spot(x1, y1), { buttons: 1 })));
    canvas.dispatchEvent(new PointerEvent("pointerup", spot(x1, y1)));
  };
  const midY = cell[1] + cell[3] / 2;
  drag(cell[0] + cell[2] / 2, midY, cell[0] + cell[2] + cell[2] / 2, midY);
  openMenu("merge-cells");
  document.getElementById("merge-cells").click();
  check(app.text().length < wholeTable.length,
    "joining takes the drawn-in cells' text off ("
      + wholeTable.length + " -> " + app.text().length + ")");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  const joined = ks.cellCount();
  document.getElementById("split-cell").click();
  check(ks.cellCount() > joined,
    "the button is wired to splitting (" + joined + " -> " + ks.cellCount() + " cells)");
  // **Leave the table as it was found** (the sorting below and the next sections run on it).
  undoKey();
  undoKey();
  check(app.text() === wholeTable, "the table is put back after joining and splitting");

  // The sorting buttons. **This can be seen nowhere else** (misspell an id and the wasm is unhurt).
  // The text length does not change, so the row changing tells it.
  check(inCell("120"), "a cell of the price's column can be landed on");
  // **The sorting buttons live in the panel the heading's arrow opens** (`narrow.js`), opened first
  // as a person does.
  openMenu("narrow-here");
  document.getElementById("narrow-here").click();
  const sortWas = app.text();
  document.getElementById("sort-down").click();
  check(app.text() !== sortWas, "the button is wired to sorting");
  check(document.getElementById("narrow").hidden, "sorting closes the filter menu to expose the rows");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // A refusal says why: sorted again the same way, the status says the rows are in order, not
  // "click inside a table's cell".
  const note = document.getElementById("note");
  check(note.textContent === "", "a sort that acted leaves no notice");
  app.openNarrow();
  document.getElementById("sort-down").click();
  check(note.textContent === "The rows are already in this order",
    "sorted again the same way, the notice names the reason");
  check(document.getElementById("narrow").hidden, "an already sorted column also closes the menu");
  undoKey();
  check(app.text() === sortWas, "the rows are put back after sorting");
  // A table's name no formula could reach is refused, and the notice says which rule it broke.
  // **This can be seen nowhere else**: the core's reason becomes words in the page alone.
  openMenu("frame-name-apply");
  const tableName = app.name();
  document.getElementById("frame-name").value = "Q1 sales";
  document.getElementById("frame-name-apply").click();
  check(app.name() === tableName, "a table's name holding a space is refused");
  check(note.textContent.indexOf("cannot hold a space") >= 0,
    "the notice names the rule the name broke (" + note.textContent + ")");

  // 22'. The document's theme (wearing colours and typefaces in one set).
  //
  // **This can be seen nowhere else**: the row made from the core's list, and the colours worn
  // reaching the canvas. **They are the document's colours** (kept even on a dark screen).
  const themeRows = ks.flyLabels("theme-picks");
  check(themeRows.length === app.themes().length,
    "the themes lined up are the core's list itself (" + themeRows.length + ")");
  // Indigo's heading is #1f3a93.
  // Caution: **Look at it by pixels rather than text** (the colour drawn is the answer).
  const inkOf = (want) => {
    const band = canvas.getContext("2d")
      .getImageData(0, 0, Math.round(160 * dpr), Math.round(40 * dpr)).data;
    let n = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (Math.abs(band[i] - want[0]) < 24 && Math.abs(band[i + 1] - want[1]) < 24 &&
        Math.abs(band[i + 2] - want[2]) < 24) n += 1;
    }
    return n;
  };
  check(themeRows.indexOf("Indigo") >= 0, "the Indigo theme is lined up");
  if (themeRows.indexOf("Indigo") >= 0) {
    check(inkOf([31, 58, 147]) === 0, "before it is worn there are no Indigo pixels");
    openMenu("theme-picks");
    check(ks.flyPick("theme-picks", "Indigo"), "the Indigo row can be pressed");
    check(inkOf([31, 58, 147]) > 20,
      "the colour worn reaches as far as the canvas (" + inkOf([31, 58, 147]) + " pixels)");
    check(document.getElementById("note").textContent.indexOf("Indigo") >= 0,
      "that it was worn comes out on the status bar ("
        + document.getElementById("note").textContent + ")");
    // **One undo must put the lot back** (do not make it a press per style).
    undoKey();
    check(inkOf([31, 58, 147]) === 0, "one undo returns to the original colours");
  }
}
