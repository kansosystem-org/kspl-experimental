// ksmd page: a column whose repeated values show once, as cells merged down the column look in a
// word processor's table. The data stays one value per row, so a sort, a filter and a range keep
// working: only the look changes. A value merges with the one above when it shows the same text,
// and every merged column left of it merges on that row too, so a group's rows stay inside the
// group above them. Rows a filter or a group hides do not count.
"use strict";

function ksmdMerge(ks) {
  // Marks the cells of `wrap`'s merged columns that repeat the shown row above.
  function paint(wrap) {
    const columns = wrap.merged || [];
    for (const el of wrap.querySelectorAll("td.merged-repeat")) el.classList.remove("merged-repeat");
    if (columns.length === 0) return;
    const rows = Array.from(wrap.querySelector("tbody").rows).filter((tr) => !tr.hidden);
    for (let i = 1; i < rows.length; i++) {
      let joined = true;
      for (const c of columns) {
        const above = rows[i - 1].cells[c + 1];
        const here = rows[i].cells[c + 1];
        joined = joined && !!above && !!here && here.textContent !== "" &&
          here.textContent === above.textContent;
        if (!joined) break;
        here.classList.add("merged-repeat");
      }
    }
  }

  // Shows the chosen column's repeated values once, or each again where it does so already.
  function toggle(block, column) {
    const wrap = ks.view.blocks()[block];
    const on = !(wrap.merged || []).includes(column);
    return ks.act("ksmd_web_merge", block, column, on ? 1 : 0);
  }

  ks.handle("column-merge", (_, c) => toggle(c.block, c.column), { table: true });

  ks.merge = { paint, toggle };
}
