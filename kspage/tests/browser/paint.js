// A paragraph's fill and frame, the underline, and joining cells.
//
// The style name `heading` is the document's and the theme name `Indigo` is the core's
// (`kspage/write/theme.kspls`), so those needles follow those sides.

function kspageProbePaint(ks) {
  const { check, app, canvas, ime, spot, pressAt, undoKey, openMenu, findBlock, dpr } = ks;

  const h1At = app.styleNames().indexOf("heading");
  // Caution: **Hunt for where the band is** (the start-up rows are the product's sample, so a place
  // settled up front falls with "0 pixels" once the sample changes), as the cell hunt does.
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
  // sit moves with the sample's layout, and the first cell a downward scan meets can have nothing
  // to join or reorder, so the press goes green about being wired while acting on nothing, and its
  // undo takes a neighbouring step back instead. `find` goes the same way as the hunt field, and
  // lands the cursor inside that cell.
  const inCell = (want) => app.find(want, false) && app.cellFrame() !== null;

  // 20. A paragraph's fill and frame come out on the canvas.
  //
  // **This can be seen nowhere else**: with the drawing order wrong, the fill covers the characters
  // and the line juts into the neighbouring cell, told only by pixels. The fill and the line take
  // different colours, so the fill cannot pass for a line.
  app.setStyleEdge(h1At, { width: 2, color: "#ff00ff", fill: "#0000ff" });
  const walled = app.styleEdge(h1At);
  check(walled.width === 2 && walled.fill === "#0000ff",
    "the frame and fill settled can be read back (" + walled.width + "/" + walled.fill + ")");
  const band = bandAt();
  let blues = 0;
  let walls = 0;
  for (let i = 0; i < band.length; i += 4) {
    if (band[i + 2] > 200 && band[i] < 80 && band[i + 1] < 80) blues += 1;
    if (band[i] > 200 && band[i + 2] > 200 && band[i + 1] < 80) walls += 1;
  }
  check(blues > 0, "the paragraph's fill comes out on the canvas (" + blues + " pixels)");
  check(walls > 0, "the paragraph's frame comes out on the canvas (" + walls + " pixels)");
  // See that it can be deleted too; the fill holds an "unset", so what deletes it is apart.
  app.setStyleEdge(h1At, { width: 0, color: "#ff00ff", fill: null });
  const bare = app.styleEdge(h1At);
  check(bare.width === 0 && bare.fill === null, "the frame and fill can be deleted");

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
  app.setStyleLook(h1At, { family: null, sizePx: 28, weight: 700, italic: null,
    color: "#0000ff", background: null });
  const plainInk = blueOf();
  app.setStyleDecor(h1At, { underline: true, strike: null });
  check(app.styleDecor(h1At).underline === true, "the line settled can be read back");
  const withLine = blueOf();
  check(withLine > plainInk,
    "the pixels grow by the underline's worth (" + plainInk + " -> " + withLine + ")");

  // 21'. The split view (another place in the same document at the same time), drawn to another
  // canvas the core does not know; **a window that only reads** (the cursor is one).
  // Caution: **Look at it by pixels** — opened and shut by the DOM's mark alone passes with the
  // content undrawn.
  const peekBand = document.getElementById("peek");
  const peekFace = document.getElementById("peek-page");
  const peekInk = () => {
    const g = peekFace.getContext("2d");
    if (peekFace.width <= 0 || peekFace.height <= 0) return 0;
    const p = g.getImageData(0, 0, peekFace.width, peekFace.height).data;
    let n = 0;
    // Caution: **Count the pixels that differ from the under-ground** (the page's colour is bright,
    // so the dark side is counted).
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] > 0 && p[i] < 140 && p[i + 1] < 140) n += 1;
    }
    return n;
  };
  check(peekBand.hidden, "the split view is folded at first");
  // **Do not line it up flat on the menu's first row** (`fly.js`'s opening header); a set that ends
  // in one press is a submenu. The count alone (`menu.js`'s cap of 4) passes while within the cap.
  const peekKey = document.getElementById("peek-flip");
  check(peekKey.closest(".fly-items") !== null,
    "the split view's command sits inside a submenu");
  // **Which it is now must be readable.** A row saying only "split view" leaves unread whether a
  // press puts it out or folds it (a row inside a submenu takes no mark either).
  const shutWord = peekKey.textContent;
  peekKey.click();
  check(peekKey.textContent !== shutWord,
    `the put-out and fold texts swap (${shutWord} -> ${peekKey.textContent})`);
  check(!peekBand.hidden, "a press opens it");
  check(peekFace.width > 0 && peekFace.height > 0,
    `the split view's canvas gets a size (${peekFace.width}×${peekFace.height})`);
  const peeked = peekInk();
  check(peeked > 0, `the document is drawn in the split view (${peeked} pixels)`);
  // Caution: **Type in the body and the split view must be drawn afresh**, or it looks out of step
  // though it mirrors the same document. "It is still drawn" passes on the earlier image, so **the
  // pixel count changing** is looked at.
  // **Type inside the band that is pinned** (the document's head, so it presses the head paragraph
  // first). **Put what was typed back** — later sections rely on the text length; one character
  // comes back in one.
  pressAt(headY);
  const wasInk = peekInk();
  ime.dispatchEvent(new InputEvent("input",
    { data: "P", inputType: "insertText", bubbles: true }));
  const nowInk = peekInk();
  check(nowInk !== wasInk,
    `the split view's pixels move by what was typed (${wasInk} -> ${nowInk})`);
  undoKey();
  check(peekInk() === wasInk, `undoing puts the split view back too (${peekInk()})`);
  // **A way of pinning it afresh must be there** (else another place means shutting and opening).
  const wasAt = document.getElementById("peek-at").textContent;
  window.scrollBy(0, 200);
  document.getElementById("peek-pin").click();
  check(document.getElementById("peek-at").textContent !== wasAt,
    `pinning afresh changes what it mirrors `
      + `(${wasAt} -> ${document.getElementById("peek-at").textContent})`);
  window.scrollBy(0, -200);
  // **A turn must not send the body's side** (the split view alone moves).
  const wasScroll = window.scrollY;
  peekFace.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  check(window.scrollY === wasScroll, "a turn over the split view does not send the body");
  peekKey.click();
  check(peekBand.hidden, "pressing again folds it");
  check(peekKey.textContent === shutWord, `folding puts the text back too (${peekKey.textContent})`);

  // 22. The buttons that join cells.
  //
  // **This can be seen nowhere else**: misspell an id of the table menu's buttons and the wasm is
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
  check(app.text() === wholeTable, "a refused merge changes not one character");
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
  document.getElementById("split-cell").click();
  check(app.text().length < wholeTable.length, "a cell that comes back on splitting is empty");
  // **Joining and splitting are one undo each.** Press twice and two undos put it back.
  undoKey();
  undoKey();
  check(app.text() === wholeTable, "two undos return to the original table");

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
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  check(app.text().length === sortWas.length, "sorting does not change how much text there is");
  // A refusal says why: sorted again the same way, the status says the rows are in order, not
  // "click inside a table's cell".
  const note = document.getElementById("note");
  check(note.textContent === "", "a sort that acted leaves no notice");
  document.getElementById("sort-down").click();
  check(note.textContent === "The rows are already in this order",
    "sorted again the same way, the notice names the reason");
  undoKey();
  check(app.text() === sortWas, "one undo returns to the original row");

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
