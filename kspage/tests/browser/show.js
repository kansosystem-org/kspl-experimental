// The keys while one sheet at a time is being shown, and Enter splitting a paragraph.

function kspageProbeShow(ks) {
  const { check, app, canvas, ime, pressAt } = ks;

  // 14. While one sheet at a time is shown, a key goes to sending rather than editing (only a real
  // keystroke shows whether what types is shut: the hidden input field takes the keys).
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
  // input field**), seen by the count of blocks in the HTML written out.
  const blocks = () => app.html().split("<div").length;
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
