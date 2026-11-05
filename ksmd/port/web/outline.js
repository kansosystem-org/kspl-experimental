// ksmd page: a table's groups of rows, shown beside the row numbers as Excel's outline is, and its
// groups of columns, shown above the column letters. Each group has a button on the line before
// it, which hides or shows its lines: − while they show, + while they are hidden. A line runs
// beside the lines of a group that shows.
// A group, and whether it is hidden, is saved in the file (`groups` on the table), so hiding one is
// a step of undo. A filter hides rows too; a row shows only when neither hides it (`filter.js`).
// Caution: **The button stands on the row above the group, never on a row of it.** A hidden row
// cannot hold the button that shows it again. Above the first data row stands the names' row; left
// of column A, the corner above the row numbers.
"use strict";

function ksmdOutline(ks) {
  // Draws the groups `g` names into a rendered table, and notes which rows they hide.
  function draw(wrap, groups) {
    wrap.groups = groups;
    const rows = Array.from(wrap.querySelector("tbody").rows);
    wrap.folded = rows.map(() => false);
    if (groups.length === 0) return;
    const deepest = Math.max(...groups.map((g) => g[3])) + 1;
    const names = wrap.querySelector("thead tr:last-child > th:first-child");
    const heads = [names, ...rows.map((tr) => tr.cells[0])];
    // Each row's outline: one slot per level, from the outermost group in.
    const slots = heads.map((th) => {
      const bar = document.createElement("span");
      bar.className = "outline";
      const own = [];
      for (let d = 0; d < deepest; d++) {
        const slot = document.createElement("span");
        slot.className = "outline-slot";
        bar.appendChild(slot);
        own.push(slot);
      }
      th.insertBefore(bar, th.firstChild);
      return own;
    });
    for (const [first, last, closed, depth] of groups) {
      const span = first === last ? `row ${first + 1}` : `rows ${first + 1} to ${last + 1}`;
      const b = toggle(first, last, closed, `${closed ? "Show" : "Hide"} ${span}`);
      slots[first][depth].appendChild(b);
      for (let r = first; r <= last; r++) {
        if (closed) wrap.folded[r] = true;
        else slots[r + 1][depth].classList.add(r === last ? "outline-end" : "outline-line");
      }
    }
  }

  // Which of `count` columns the groups `cg` hide.
  function foldedColumns(cg, count) {
    const out = new Array(count).fill(false);
    for (const [first, last, closed] of cg) {
      if (closed) for (let c = first; c <= last; c++) out[c] = true;
    }
    return out;
  }

  // Draws the groups of columns `cg` names above the column letters, and hides the columns a
  // closed group holds. `foldedColumns` was worked out before the widths were drawn.
  function drawColumns(wrap, cg) {
    wrap.columnGroups = cg;
    const table = wrap.querySelector("table");
    for (const tr of table.rows) {
      for (let c = 0; c < wrap.foldedColumns.length; c++) {
        if (wrap.foldedColumns[c]) tr.cells[c + 1].classList.add("col-folded");
      }
    }
    if (cg.length === 0) return;
    const deepest = Math.max(...cg.map((g) => g[3])) + 1;
    // Each heading's outline: one slot per level, from the outermost group down.
    const slots = Array.from(table.tHead.rows[0].cells).map((th) => {
      const bar = document.createElement("span");
      bar.className = "outline-cols";
      const own = [];
      for (let d = 0; d < deepest; d++) {
        const slot = document.createElement("span");
        slot.className = "outline-slot";
        bar.appendChild(slot);
        own.push(slot);
      }
      th.insertBefore(bar, th.firstChild);
      return own;
    });
    for (const [first, last, closed, depth] of cg) {
      const name = (c) => letterOf(c);
      const span = first === last ? `column ${name(first)}` : `columns ${name(first)} to ${name(last)}`;
      const b = toggle(first, last, closed, `${closed ? "Show" : "Hide"} ${span}`);
      b.dataset.columns = "1";
      slots[first][depth].appendChild(b);
      for (let c = first; c <= last && !closed; c++) {
        slots[c + 1][depth].classList.add(c === last ? "outline-end" : "outline-line");
      }
    }
  }

  // A column's letters, as the column heading shows them.
  function letterOf(c) {
    let s = "";
    for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  }

  // A button that hides or shows the lines from `first` to `last`.
  function toggle(first, last, closed, title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "outline-toggle";
    b.tabIndex = -1;
    b.dataset.from = String(first);
    b.dataset.to = String(last);
    b.dataset.closed = String(closed);
    b.textContent = closed ? "+" : "−";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.setAttribute("aria-expanded", String(!closed));
    return b;
  }

  // The smallest group that holds a line, as [first, last, closed, depth], or null.
  function around(groups, row) {
    let best = null;
    for (const g of groups || []) {
      if (g[0] <= row && row <= g[1] && (!best || g[1] - g[0] < best[1] - best[0])) best = g;
    }
    return best;
  }

  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".outline-toggle");
    if (!b) return;
    e.preventDefault();
    ks.table.take();
    const block = ks.view.blocks().indexOf(b.closest(".table"));
    ks.act("ksmd_web_group", block, b.dataset.closed === "1" ? 3 : 2, b.dataset.columns ? 1 : 0,
      Number(b.dataset.from), Number(b.dataset.to));
  });
  // A press on the button chooses no row and no cell, and does not move the caret.
  ks.root.addEventListener("mousedown", (e) => {
    if (!e.target.closest || !e.target.closest(".outline-toggle")) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  ks.handle(["group-rows", "ungroup-rows", "group-hide", "group-show", "group-columns",
    "ungroup-columns", "column-group-hide", "column-group-show"], (name) => ks.outline.act(name),
  { table: true, repeat: true });

  ks.outline = {
    draw,
    drawColumns,
    foldedColumns,
    // Groups the chosen rows or columns, takes their smallest group away, or hides or shows that
    // group. The column commands act on the chosen columns, the row commands on the chosen rows.
    act(name) {
      if (!ks.cell) {
        ks.say("Choose a cell of the table first.");
        return null;
      }
      const r = ks.table.range();
      const columns = name.endsWith("-columns") || name.startsWith("column-group-");
      const first = columns ? r.c1 : Math.max(r.r1, 0);
      const last = columns ? r.c2 : Math.max(r.r2, 0);
      const flag = columns ? 1 : 0;
      if (name === "group-rows" || name === "group-columns") {
        return ks.act("ksmd_web_group", r.block, 0, flag, first, last);
      }
      if (name === "ungroup-rows" || name === "ungroup-columns") {
        return ks.act("ksmd_web_group", r.block, 1, flag, first, last);
      }
      const wrap = ks.view.blocks()[r.block];
      const g = around(columns ? wrap.columnGroups : wrap.groups, first);
      if (!g) {
        ks.say(columns ? "No group holds this column. Choose a column inside a group." :
          "No group holds this row. Choose a row inside a group.");
        return null;
      }
      const show = name === "group-show" || name === "column-group-show";
      return ks.act("ksmd_web_group", r.block, show ? 3 : 2, flag, g[0], g[1]);
    },
  };
}
