// ksmd page: choosing cells by pointing while a formula is typed, as Excel's point mode. While an
// open cell holds text that starts with `=`, and its caret stands where a reference can go, a press
// on a data cell writes that cell's reference at the caret, and a drag writes a range. A cell of
// another table of the document is written with its table's name: `map.D3`. A press on a column's
// letter or name writes the whole column, its table's name always written: `map.D`. The cell stays
// open. Pointing again replaces the reference just written, until the text
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

  // A table's name as a formula writes it: plain where it is `[a-z][a-z0-9_]*`, else in JSON
  // quotes, as `write_table_name` in `ksmd/calc/formula.kspl` writes it.
  const tableName = (name) => (/^[a-z][a-z0-9_]*$/.test(name) ? name : JSON.stringify(name));

  // A cell's reference, `B3`, or a range's, `A1:B3`, its upper left corner first. A cell of
  // another table has that table's name before it, once for a range: `map.D1:D3`. Whole columns
  // always have it, as a formula writes them: `map.D`, `map.D:F`.
  function reference(a, b) {
    const letter = (column) => ks.table.letters(column);
    const c1 = Math.min(a.column, b.column);
    const c2 = Math.max(a.column, b.column);
    if (a.whole) return `${tableName(a.table)}.${letter(c1)}${c1 === c2 ? "" : `:${letter(c2)}`}`;
    const cell = (row, column) => `${letter(column)}${row + 1}`;
    const r1 = Math.min(a.row, b.row);
    const r2 = Math.max(a.row, b.row);
    const named = a.own ? "" : `${tableName(a.table)}.`;
    return named + (r1 === r2 && c1 === c2 ? cell(r1, c1) : `${cell(r1, c1)}:${cell(r2, c2)}`);
  }

  // Whether two points can make one range: the same table, and both cells or both whole columns.
  const together = (a, b) => a.table === b.table && a.own === b.own && a.whole === b.whole;

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

  // What is under a point: { row, column, table, own, whole }. A data cell other than the open
  // one gives its row and column. A column's letter or name gives the whole column (`whole`, row
  // -1); its filter arrow keeps its own press. `table` is the table's name, and `own` says it is
  // the open cell's table. A table shown from an included file is never pointed at, as no formula
  // reaches into another file.
  function cellAt(target, open) {
    if (!target || !target.closest || target.closest(".filter-arrow")) return null;
    const el = target.closest(".table td[data-r], .table th.name[data-c], .table th.letter");
    if (!el || el.closest(".include") || el.contains(open.input)) return null;
    const wrap = el.closest(".table");
    const own = ks.view.blocks().indexOf(wrap) === open.block;
    const whole = el.tagName === "TH";
    if ((!own || whole) && !wrap.dataset.name) return null;
    // A letter's column is its place in its row, after the corner cell.
    const column = el.dataset.c !== undefined ? Number(el.dataset.c) : el.cellIndex - 1;
    return { row: whole ? -1 : Number(el.dataset.r), column, table: wrap.dataset.name, own, whole };
  }

  // It runs before the table's own presses, which would end the edit, and stops them.
  document.addEventListener("mousedown", (e) => {
    const open = ks.table.editing();
    if (!open || e.button !== 0) return;
    const at = cellAt(e.target, open);
    if (!at || !slot(open.input)) return;
    e.preventDefault();
    e.stopPropagation();
    // Shift reaches from the cell pointed at last, in the same table, as Shift+click reaches a range.
    const anchor = e.shiftKey && last && together(last.anchor, at) ? last.anchor : at;
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
    // **The formula's own tip and list of functions float over the cells**, often over the next
    // table's headings, so the drag looks through them.
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest(".fx-tip, .fx-list"));
    const at = cellAt(under, open);
    // A range stays in one table, and holds cells or whole columns: a drag past them keeps it.
    if (!at || !together(at, drag.anchor) || (at.row === drag.at.row && at.column === drag.at.column)) return;
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
