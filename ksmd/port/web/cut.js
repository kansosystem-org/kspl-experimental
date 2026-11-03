// ksmd page: cells cut, and what moves them, as in Excel. A cut removes nothing: a dashed frame
// marks the cells until a paste in their table moves them (`move_cells` in
// `ksmd/edit/editor_tables.kspl`). Whole rows cut by their numbers, or whole columns by their
// letters, can also go in by Insert cut rows or Insert cut columns, as Excel's Insert Cut Cells
// moves them (`move_lines`). A cut pastes once. Esc, or any other change to the document, drops it.
"use strict";

function ksmdCut(ks) {
  // The cut: { u, rows, rowIds, colIds, text }. `u` is the table's place in the model. `rows` is
  // true for whole rows, false for whole columns, and null for a range of cells. `rowIds` and
  // `colIds` are the identities of its rows and columns from the first, -1 for the names; whole
  // rows keep no columns, and whole columns no rows. `text` is what the cut put on the clipboard.
  // Identities find the cells again after each render.
  let cut = null;
  // The cells marked now, so marking again clears only them.
  let marked = [];

  // Where a run of identities stands in a table's list: its first place, or null where one went.
  const span = (ids, list) => {
    const first = ids[0] === -1 ? -1 : list.indexOf(ids[0]);
    if (ids[0] !== -1 && first < 0) return null;
    const moved = ids.some((id, k) => (first + k === -1 ? -1 : list[first + k]) !== id);
    return moved ? null : first;
  };
  // Where the cut stands now: { block, r1, r2, c1, c2 }, or null when its table or a line went.
  function where() {
    if (!cut) return null;
    const block = ks.view.blocks().findIndex((el) => el.classList.contains("table") && el.u === cut.u);
    if (block < 0) return null;
    const wrap = ks.view.blocks()[block];
    const r1 = cut.rowIds ? span(cut.rowIds, wrap.rowIds) : -1;
    const c1 = cut.colIds ? span(cut.colIds, wrap.colIds) : 0;
    if (r1 === null || c1 === null) return null;
    return { block, r1, c1, r2: cut.rowIds ? r1 + cut.rowIds.length - 1 : wrap.rowIds.length - 1,
      c2: cut.colIds ? c1 + cut.colIds.length - 1 : wrap.colIds.length - 1 };
  }

  // Draws the frame: each cell of the cut takes the edges of the frame it stands on.
  function mark() {
    for (const el of marked) el.classList.remove("cut", "cut-top", "cut-bottom", "cut-left", "cut-right");
    marked = [];
    const w = where();
    if (!w) {
      cut = null;
      return;
    }
    for (const el of ks.view.blocks()[w.block].querySelectorAll("[data-r]")) {
      const row = Number(el.dataset.r);
      const column = Number(el.dataset.c);
      if (row < w.r1 || row > w.r2 || column < w.c1 || column > w.c2) continue;
      el.classList.add("cut");
      if (row === w.r1) el.classList.add("cut-top");
      if (row === w.r2) el.classList.add("cut-bottom");
      if (column === w.c1) el.classList.add("cut-left");
      if (column === w.c2) el.classList.add("cut-right");
      marked.push(el);
    }
  }
  ks.rendered.push(mark);

  // Drops the cut; true when one was waiting.
  function drop() {
    const was = !!cut;
    cut = null;
    mark();
    return was;
  }
  // Any change to the document drops the cut, the move's own included.
  ks.changed.push(drop);

  // Cuts cells: `r` is the range as `ks.range.rect` gives it, and `lines` whole lines as
  // `ks.range.lines` gives them, or null. `text` is what the cut put on the clipboard.
  function take(r, lines, text) {
    const wrap = ks.view.blocks()[r.block];
    const ids = (list, from, to) => Array.from({ length: to - from + 1 }, (_, k) =>
      (from + k < 0 ? -1 : list[from + k]));
    // Whole columns take their names too, which move with them.
    cut = { u: wrap.u, rows: lines ? lines.rows : null, text,
      rowIds: lines && !lines.rows ? null : ids(wrap.rowIds, r.r1, r.r2),
      colIds: lines && lines.rows ? null : ids(wrap.colIds, r.c1, r.c2) };
    mark();
    const insert = lines ? `, or right-click a ${lines.rows ? "row number" : "column letter"} and ` +
      `choose Insert cut ${lines.rows ? "rows" : "columns"}` : "";
    ks.say(`Choose where they go and press Ctrl+V${insert}. Esc keeps them where they are.`);
  }

  // Moves the cut lines before the chosen range's first row or column, as one step, and chooses
  // them at their new place. A place inside them, or just after them, changes nothing.
  function insert(block, rows) {
    const w = where();
    if (!w || w.block !== block || cut.rows !== rows) return null;
    const r = ks.range.rect();
    const at = rows ? r.r1 : r.c1;
    const first = rows ? w.r1 : w.c1;
    const count = rows ? w.r2 - w.r1 + 1 : w.c2 - w.c1 + 1;
    if (at < 0 || (at >= first && at <= first + count)) return null;
    const result = ks.act("ksmd_web_move_lines", block, rows ? 1 : 0, first, count, at);
    if (result && result.ok) {
      const to = at < first ? at : at - count;
      ks.range.chooseLines(block, rows, to, to + count - 1);
    }
    return result;
  }

  // Lines of text as the clipboard may hand them back: line breaks as LF, and no break at the end.
  const plain = (t) => t.replace(/\r\n/g, "\n").replace(/\n$/, "");

  // A paste at the chosen range while a cut waits moves the cut cells there, as one step. It
  // chooses them at their new place, and gives true when it took the paste. Whole rows go to the
  // chosen row, and whole columns to the chosen column. Text on the clipboard other than the cut's
  // own was copied since, from another program, so the cut drops and that text pastes as usual.
  function paste(text) {
    const w = where();
    if (!w) return false;
    if (plain(text) !== plain(cut.text)) {
      drop();
      return false;
    }
    const r = ks.range.rect();
    if (r.block !== w.block) {
      ks.say("Cut cells move only inside their own table. To put them in another table, copy them instead.");
      return true;
    }
    const rows = cut.rows;
    const toRow = rows === true ? Math.max(0, r.r1) : rows === false ? -1 : r.r1;
    const toColumn = rows === true ? 0 : r.c1;
    if ((w.r1 < 0) !== (toRow < 0)) {
      ks.say(w.r1 < 0 ? "Cut names move only along the names row. Choose a name to paste on." :
        "Cut cells move only to data cells. Choose a cell under the names.");
      return true;
    }
    const height = w.r2 - w.r1 + 1;
    const width = w.c2 - w.c1 + 1;
    ks.table.take();
    const result = ks.act("ksmd_web_move_cells", w.block, w.r1, w.c1, height, width, toRow, toColumn);
    if (!result || !result.ok) return true;
    drop();
    if (rows === true) ks.range.chooseLines(w.block, true, toRow, toRow + height - 1);
    else if (rows === false) ks.range.chooseLines(w.block, false, toColumn, toColumn + width - 1);
    else {
      ks.range.set(w.block, toRow, toColumn, { row: toRow + height - 1, column: toColumn + width - 1 });
      ks.range.focus();
    }
    return true;
  }

  // Esc drops the cut wherever the focus is, unless something else took the key first, such as a
  // menu or an open cell.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !e.defaultPrevented && cut && drop()) ks.say("");
  });

  ks.cut = { take, drop, insert, paste,
    // Whether lines of this kind are cut in the table a block shows, so Insert row above or Insert
    // column left inserts them.
    waiting: (block, rows) => {
      const w = where();
      return !!w && w.block === block && cut.rows === rows;
    },
    // What the waiting cut put on the clipboard, or "" when none waits.
    text: () => (where() ? cut.text : ""),
  };
}
