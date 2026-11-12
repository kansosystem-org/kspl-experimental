// ksmd page: the formula bar under the quick access bar. It shows the chosen cell's address and
// its whole text as typed: a formula, a value or a column's name. A press in its box, or Tab to
// it, opens the chosen cell for editing there.
// One edit, two views: the bar's box takes the open edit itself (`inBar` in `cellbox.js`), so Enter,
// Tab, Esc, the list of functions, the colours, the brackets and AutoCorrect act as in the cell.
// The cell shows a copy of the text while the bar holds the edit.
// Caution: **A box that held an edit is never served again.** Its keys and help stay attached
// to it, so the bar puts a fresh box in its place once that edit ends.
"use strict";

function ksmdBar(ks) {
  const bar = document.querySelector(".formula-bar");
  const address = bar.querySelector(".formula-address");
  const field = bar.querySelector(".formula-field");
  let box = null;
  // Whether the pointer put the focus in the box, so the caret stays where it was pressed.
  let pressed = false;

  function fresh() {
    const b = ks.el("textarea", "formula-input");
    b.rows = 1;
    b.wrap = "off";
    b.spellcheck = false;
    b.setAttribute("autocomplete", "off");
    b.setAttribute("aria-label", "Formula bar");
    b.addEventListener("mousedown", () => {
      pressed = true;
      // An edit open in the cell stays open while the focus comes here (`blur` in `cellbox.js`).
      if (ks.table.editing()) ks.table.hold(true);
    });
    b.addEventListener("focus", () => take(b));
    if (box) box.replaceWith(b);
    else field.appendChild(b);
    box = b;
  }

  // The box took the focus: it takes the edit, where the chosen cell can be edited.
  function take(b) {
    const mouse = pressed;
    pressed = false;
    if (b.readOnly || b.dataset.used) {
      ks.table.hold(false);
      return;
    }
    // The box wraps before it takes the edit, so the edit measures its lines as they wrap.
    b.wrap = "soft";
    bar.classList.add("editing");
    if (!ks.table.inBar(b)) {
      b.wrap = "off";
      bar.classList.remove("editing");
      ks.table.hold(false);
      return;
    }
    b.dataset.used = "1";
    // Tab to the box puts the caret at the end, as a cell opened by F2 has it.
    if (!mouse) b.setSelectionRange(b.value.length, b.value.length);
  }

  // Shows the chosen cell again. The box that holds the edit is never written: what is typed
  // there is the text. While the cell holds the edit, the box follows what is typed in it.
  function show() {
    const open = ks.table.editing();
    if (box.dataset.used && (!open || open.input !== box)) {
      const focused = document.activeElement === box;
      bar.classList.remove("editing");
      fresh();
      if (focused) ks.range.focus();
    }
    const where = ks.status.where();
    if (address.textContent !== where) address.textContent = where;
    if (open && open.input === box) return;
    const one = where !== "" && !ks.range.any() && !ks.range.lines();
    const text = one ? ks.range.typed() : "";
    if (box.value !== text) box.value = text;
    const wrap = one ? ks.view.blocks()[ks.cell.block] : null;
    box.readOnly = !one || ks.readOnly || !!(wrap && wrap.included);
    box.setAttribute("aria-label", where === "" ? "Formula bar" : `Formula bar, ${where}`);
    box.title = box.readOnly ? "" : "Press here to edit the chosen cell in the formula bar";
  }

  fresh();
  ks.status.also(show);
}
