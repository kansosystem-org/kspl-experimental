// ksmd page: choosing cells by pointing while a formula is typed, as Excel's point mode. While an
// open cell holds text that starts with `=`, and its caret stands where a reference can go, a press
// on a data cell of the same table writes that cell's reference at the caret, and a drag writes a
// range. The cell stays open. Pointing again replaces the reference just written, until the text
// changes otherwise. Anywhere else, a press ends the edit as before (`table.js`). F4 in such a cell
// turns the `$` of the reference at the caret, as Excel's does.
"use strict";

function ksmdPoint(ks) {
  // The reference pointing wrote last: { input, from, to, value, anchor }, where it stands in the
  // input, the input's whole text after it, and the cell a Shift+press reaches from; or null.
  let last = null;
  // While the button is down: { input, anchor, at }, `at` the cell under the pointer.
  let drag = null;

  // Whether text that ends here leaves the caret where a reference can go: after `=`, `(`, `,`,
  // `:`, an operator (`+ - * / & = < >`), or the words and, or, not; never inside quoted text.
  function referencePlace(before) {
    if (!before.startsWith("=")) return false;
    let quoted = false;
    for (let i = 1; i < before.length; i++) {
      if (quoted && before[i] === "\\") i++;
      else if (before[i] === '"') quoted = !quoted;
    }
    return !quoted && /(?:[=(,:+\-*/<>&]|(?:^|[^\w.$"])(?:and|or|not)\s)\s*$/.test(before);
  }

  // Where a pointed reference goes in the open cell's input: { from, to }, or null where none can.
  // The reference written last is replaced while the text has not changed since.
  function slot(input) {
    if (last && last.input === input && input.value === last.value &&
      input.selectionStart === last.to && input.selectionEnd === last.to) {
      return { from: last.from, to: last.to };
    }
    last = null;
    const from = input.selectionStart;
    return referencePlace(input.value.slice(0, from)) ? { from, to: input.selectionEnd } : null;
  }

  // A cell's reference, `B3`, or a range's, `A1:B3`, its upper left corner first.
  function reference(a, b) {
    const cell = (row, column) => `${ks.table.letters(column)}${row + 1}`;
    const r1 = Math.min(a.row, b.row);
    const r2 = Math.max(a.row, b.row);
    const c1 = Math.min(a.column, b.column);
    const c2 = Math.max(a.column, b.column);
    return r1 === r2 && c1 === c2 ? cell(r1, c1) : `${cell(r1, c1)}:${cell(r2, c2)}`;
  }

  // Writes the reference from the anchor to a cell. The reference then shows in colour, with a
  // frame round the cells it names, as every reference typed does (`refs.js`).
  function write(input, anchor, to) {
    const at = slot(input);
    if (!at) return;
    const text = reference(anchor, to);
    input.setRangeText(text, at.from, at.to, "end");
    // The draft and the choices' list learn of the change as of typing.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    last = { input, from: at.from, to: at.from + text.length, value: input.value, anchor };
  }

  // The data cell under a point, in the open cell's table, other than the open cell itself.
  function cellAt(target, open) {
    const el = target && target.closest && target.closest(".table td[data-r]");
    if (!el || el.closest(".include") || el.contains(open.input)) return null;
    if (ks.view.blocks().indexOf(el.closest(".table")) !== open.block) return null;
    return { row: Number(el.dataset.r), column: Number(el.dataset.c) };
  }

  // It runs before the table's own presses, which would end the edit, and stops them.
  document.addEventListener("mousedown", (e) => {
    const open = ks.table.editing();
    if (!open || e.button !== 0) return;
    const at = cellAt(e.target, open);
    if (!at || !slot(open.input)) return;
    e.preventDefault();
    e.stopPropagation();
    // Shift reaches from the cell pointed at last, as Shift+click reaches a range.
    const anchor = e.shiftKey && last ? last.anchor : at;
    drag = { input: open.input, anchor, at };
    write(open.input, anchor, at);
  }, true);

  document.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const open = ks.table.editing();
    if ((e.buttons & 1) === 0 || !open || open.input !== drag.input) {
      drag = null;
      return;
    }
    const at = cellAt(document.elementFromPoint(e.clientX, e.clientY), open);
    if (!at || (at.row === drag.at.row && at.column === drag.at.column)) return;
    drag.at = at;
    write(drag.input, drag.anchor, at);
  });

  document.addEventListener("mouseup", () => {
    drag = null;
  });

  // F4 in a cell open on a formula turns the `$` of the reference at the caret, or of each one
  // the selection touches: `A1`, `$A$1`, `A$1`, `$A1`, then `A1` again (`cycle_fixed` in
  // `ksmd/calc/formula.kspl`). True when the key was the cell's; elsewhere F4 repeats.
  function turn(target) {
    const open = ks.table.editing();
    if (!open || open.input !== target || !target.value.startsWith("=")) return false;
    const input = target;
    // The editor counts in bytes, and the input in UTF-16 units.
    const bytes = (text) => ks.enc.encode(text).length;
    const from = bytes(input.value.slice(0, input.selectionStart));
    const to = bytes(input.value.slice(0, input.selectionEnd));
    const len = ks.put(input.value);
    const out = ks.out(ks.w.ksmd_web_cycle_fixed(from, to, len));
    if (!out) return true;
    const got = JSON.parse(out);
    const end = new TextDecoder().decode(ks.enc.encode(got.text).slice(0, got.at)).length;
    const start = input.selectionStart === input.selectionEnd ? end : input.selectionStart;
    input.value = got.text;
    input.setSelectionRange(start, end);
    // The draft and the lists learn of the change as of typing.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  ks.point = { turn };
}
