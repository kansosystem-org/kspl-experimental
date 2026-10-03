// The frame of the cell it is in, and dragging a column's boundary.
//
// Note: The decoration style names (`decoration-…`) are assembled by `kspage/model/paint.kspls`, so
// they stay as they are until that side moves.

function kspageProbeCell(ks) {
  const { check, app, canvas, ime, spot, pressAt, undoKey, openMenu, findCell, dpr } = ks;

  // 12. The frame of the cell it is in really is painted. **What is inside the canvas does not come
  // out in the DOM**; the frame's shape is the wasm side's, so only "was it painted" is looked at.
  const box = canvas.getBoundingClientRect();
  const cellY = findCell();
  const cell = app.cellFrame();
  check(cell !== null, "inside a cell the frame's shape comes out");
  if (cell) {
    const paint = canvas.getContext("2d");
    const inkAt = (x, y) =>
      Array.from(paint.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data)
        .join();
    // Over the frame's left line (a cell's characters start an indent in).
    const at = [cell[0] + 1, cell[1] + cell[3] / 2];
    const marked = inkAt(at[0], at[1]);
    check(marked !== "0,0,0,0", "the frame's line is painted");
    // Caution: It must go once it is back in the body. Left there, which cell it is in cannot be
    // told.
    // **It cannot be told apart by whether it is painted** (the cell holds the style's line in the
    // same place), so the colour changing is looked at.
    pressAt(8);
    check(inkAt(at[0], at[1]) !== marked, "back in the body the frame goes");
  }

  // What lands decoration on the selection without giving a name.
  //
  // **This can be seen nowhere else**: the colour samples and the mark are DOM inside the menu, so
  // a misspelt id breaks only as "press it and no colour appears".
  openMenu("paint-color");
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  // **It lands the moment it is chosen**; nothing is pressed to land it.
  check(ks.flyPick("paint-color", "Red"), "the samples line up on the colour row");
  check(app.styleNames().includes("decoration-cc00000"),
    "the moment it is chosen the decoration becomes a style's name ("
      + app.styleNames().slice(-1) + ")");
  check(document.activeElement === ime,
    "after choosing, the focus goes back to the input field");
  // **The decoration now must come back to the row**, or choosing an underline next drops the
  // colour.
  check(ks.flyTick("paint-color") === "Red",
    "the colour landed gets the mark (" + ks.flyTick("paint-color") + ")");
  check(ks.flyNow("paint-color") === "Red",
    "the colour landed comes out on the row (" + ks.flyNow("paint-color") + ")");
  check(ks.flyPick("paint-under", "Draw"), "the choices line up on the underline row");
  check(app.styleNames().includes("decoration-cc00000-u1"),
    "the underline is added with the colour left there (" + app.styleNames().slice(-1) + ")");
  // **What takes it off is the one "Unset" under the style presets.** Decoration lands on a run as
  // its one name, so a second way to take it off is one thing two ways (Principle 6).
  check(ks.flyPick("style-set", "Unset"), "the Unset row is lined up");
  // **Where it is inherited from the parent the row's right must be empty** ("Unset" there reads as
  // something landed). The mark moves to the Unset row.
  check(ks.flyNow("paint-color") === "" && ks.flyNow("paint-under") === "",
    "taking it off puts the row's right back to empty");
  check(ks.flyTick("paint-color") === "Unset", "the mark moves to the Unset row");
  // **Undo as many times as it landed** (three: colour, underline, taking off). Too few leaves the
  // run split, and later sections fall as "a character's worth was selected and it is empty".
  for (let i = 0; i < 3; i += 1) {
    undoKey();
  }
  check(!app.styleNames().includes("decoration-cc00000"),
    "undoing leaves no decoration style either");

  // 13. Dragging a column's boundary. **This can be seen nowhere else**: the order of the press
  // (the boundary before the text selection) and the arrow's shape.
  //
  // It hunts for a cell of a table whose width is settled. **It is laid out at real measures, so
  // where on the page it lands cannot be settled up front.**
  let sized = null;
  for (let y = 8; y < box.height && !sized; y += 4) {
    pressAt(y);
    const f = app.cellFrame();
    if (f && Math.abs(f[2] - 64) < 0.5) sized = f;
  }
  check(sized !== null, "a cell of a column whose width is settled is there");
  if (sized) {
    const bx = sized[0] + sized[2];
    const by = sized[1] + sized[3] / 2;
    const point = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type, spot(x, y)));
    // Caution: **Let the press held down while hunting go.** Movement while held becomes
    // selecting on.
    point(bx, by, "pointerup");
    // Over the boundary while not pressing, the arrow's shape shows it can be taken hold of.
    point(bx, by, "pointermove");
    check(canvas.style.cursor === "col-resize",
      "over the boundary the arrow changes (" + canvas.style.cursor + ")");
    point(bx - 30, by, "pointermove");
    check(canvas.style.cursor !== "col-resize", "inside the cell the arrow goes back");
    // A row's boundary shows in a different shape, so vertical and sideways can be told apart.
    point(sized[0] + 4, sized[1] + sized[3], "pointermove");
    check(canvas.style.cursor === "row-resize",
      "at a row's boundary it becomes a different arrow (" + canvas.style.cursor + ")");
    point(bx, by, "pointermove");

    // Press the boundary and the cursor does not move there (the drag does not become a selection).
    const held = app.typed();
    point(bx, by, "pointerdown");
    point(bx + 40, by, "pointermove");
    point(bx + 40, by, "pointerup");
    check(app.typed() === held, "pressing the boundary does not move the cursor");
    const after = app.cellFrame();
    check(after !== null && Math.abs(after[2] - 104) < 1.5,
      "as far as it was pulled becomes the column's width ("
        + (after ? after[2] : "none") + ")");

    // **One drag comes back in one**, or what is written out afterwards keeps the pulled width.
    const undo = undoKey();
    const back = app.cellFrame();
    check(back !== null && Math.abs(back[2] - 64) < 1.5,
      "Ctrl+Z returns to the original width in one (" + (back ? back[2] : "none") + ")");
  }

  // 14. Typing a column's width and a row's height as numbers. **This can be seen nowhere else**:
  // the fields are DOM inside the ribbon (a misspelt id breaks as "type it and nothing acts").
  //
  // **Go back inside a cell before looking** (outside a table the fields are not out).
  if (sized) {
    pressAt(sized[1] + sized[3] / 2);
    const wide = document.getElementById("cell-w");
    const tall = document.getElementById("cell-h");
    check(wide !== null && tall !== null,
      "inside a cell the column-width and row-height fields come out");
    if (wide && tall) {
      // **A row with nothing settled must have an empty value**, or a field nobody touched reads as
      // "it was settled". The faint number is the height being seen now.
      check(tall.value === "" && Number(tall.placeholder) > 0,
        "a row with nothing settled is empty, and the faint number is the height now ("
          + tall.placeholder + ")");
      // **Write to the same place as the drag**, or the typed number and the pulled width part.
      wide.value = "128";
      wide.dispatchEvent(new Event("change", { bubbles: true }));
      const put = app.cellFrame();
      check(put !== null && Math.abs(put[2] - 128) < 1.5,
        "the number typed becomes the column's width as it stands ("
          + (put ? put[2] : "none") + ")");
      // **One comes back in one** (the same settlement as the drag).
      undoKey();
      const back = app.cellFrame();
      check(back !== null && Math.abs(back[2] - 64) < 1.5,
        "Ctrl+Z returns to the original width in one (" + (back ? back[2] : "none") + ")");
      // **Emptying it must take the setting off**; a column with it off fits the content, so the
      // width moves from 64.
      wide.value = "";
      wide.dispatchEvent(new Event("change", { bubbles: true }));
      const gone = app.cellFrame();
      check(gone !== null && Math.abs(gone[2] - 64) > 1.5,
        "emptying it takes the setting off and fits the content ("
          + (gone ? gone[2] : "none") + ")");
      undoKey();
    }
  }
}
