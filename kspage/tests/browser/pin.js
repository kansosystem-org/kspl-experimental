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

  // **A press on the band is a press on the heading**: the cursor goes into that cell and the
  // window follows it up, so the real heading shows and nothing is kept.
  const at = pin.getBoundingClientRect();
  pin.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.left + 4, clientY: at.top + 4,
    button: 0, bubbles: true, cancelable: true }));
  const back = app.cellFrame();
  check(back !== null && Math.abs(back[1] - frame[1]) < 0.5,
    "a press on the band stands the cursor in the heading row");
  check(app.pinnedHead() === null, "and the window follows up to the real heading");

  // Send the whole table past the top: nothing is kept (the band leaves with the last row).
  window.scrollTo(0, canvasTop + frame[1] + frame[3] * 45);
  check(app.pinnedHead() === null, "once the table has passed, nothing is kept");
  window.scrollTo(0, 0);
  check(app.pinnedHead() === null && getComputedStyle(pin).display === "none",
    "at the head of the document the sheet is hidden");

  undoKey();
  check(app.cellFrame() === null, "one undo takes the table back");
  window.scrollTo(0, wasY);
}
