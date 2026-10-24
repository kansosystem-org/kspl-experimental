// ksmd page: a table's groups of rows, shown beside the row numbers as Excel's outline is. Each
// group has a button on the row above it, which hides or shows its rows: − while they show, + while
// they are hidden. A line runs down beside the rows of a group that shows.
// A group, and whether it is hidden, is saved in the file (`groups` on the table), so hiding one is
// a step of undo. A filter hides rows too; a row shows only when neither hides it (`filter.js`).
// Caution: **The button stands on the row above the group, never on a row of it.** A hidden row
// cannot hold the button that shows it again. Above the first data row stands the names' row.
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
      const b = document.createElement("button");
      b.type = "button";
      b.className = "outline-toggle";
      b.tabIndex = -1;
      b.dataset.from = String(first);
      b.dataset.to = String(last);
      b.dataset.closed = String(closed);
      b.textContent = closed ? "+" : "−";
      const span = first === last ? `row ${first + 1}` : `rows ${first + 1} to ${last + 1}`;
      b.title = `${closed ? "Show" : "Hide"} ${span}`;
      b.setAttribute("aria-label", b.title);
      b.setAttribute("aria-expanded", String(!closed));
      slots[first][depth].appendChild(b);
      for (let r = first; r <= last; r++) {
        if (closed) wrap.folded[r] = true;
        else slots[r + 1][depth].classList.add(r === last ? "outline-end" : "outline-line");
      }
    }
  }

  // The smallest group that holds a row, as [first, last, closed, depth], or null.
  function around(wrap, row) {
    let best = null;
    for (const g of wrap.groups || []) {
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
    ks.act("ksmd_web_group", block, b.dataset.closed === "1" ? 3 : 2, Number(b.dataset.from),
      Number(b.dataset.to));
  });
  // A press on the button chooses no row and no cell, and does not move the caret.
  ks.root.addEventListener("mousedown", (e) => {
    if (!e.target.closest || !e.target.closest(".outline-toggle")) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  ks.outline = {
    draw,
    // Groups the chosen rows, takes their smallest group away, or hides or shows that group.
    act(name) {
      if (!ks.cell) {
        ks.say("Choose a cell of the table first.");
        return null;
      }
      const r = ks.table.range();
      const first = Math.max(r.r1, 0);
      const last = Math.max(r.r2, 0);
      if (name === "group-rows") return ks.act("ksmd_web_group", r.block, 0, first, last);
      if (name === "ungroup-rows") return ks.act("ksmd_web_group", r.block, 1, first, last);
      const g = around(ks.view.blocks()[r.block], first);
      if (!g) {
        ks.say("No group holds this row. Choose a row inside a group.");
        return null;
      }
      return ks.act("ksmd_web_group", r.block, name === "group-show" ? 3 : 2, g[0], g[1]);
    },
  };
}
