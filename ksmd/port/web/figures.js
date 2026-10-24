// ksmd page: the figures at the right of the status line. With two or more cells chosen, the sum
// and average of their numbers and the count of the cells that hold a value, as Excel's status
// bar shows them; rows a filter hides are left out, as there. Otherwise the words and characters of the selection, or of the whole document.
// Words are runs of letters between spaces; text written without spaces, as Japanese is, counts
// by its characters, so both counts stand side by side.
"use strict";

function ksmdFigures(ks) {
  const box = document.createElement("span");
  box.className = "figures";
  box.setAttribute("aria-live", "polite");
  document.body.appendChild(box);

  const shown = (n) => Number(n.toPrecision(15)).toLocaleString("en-US", { maximumFractionDigits: 10 });

  function cells() {
    if (ks.where !== "cell" || !ks.cell || !ks.range || !ks.range.any()) return null;
    const r = ks.range.rect();
    const wrap = ks.view.blocks()[r.block];
    if (!wrap || !wrap.values) return null;
    const rows = wrap.querySelector("tbody").rows;
    let sum = 0;
    let numbers = 0;
    let filled = 0;
    for (let row = Math.max(r.r1, 0); row <= r.r2; row++) {
      if (rows[row] && rows[row].hidden) continue;
      for (let column = r.c1; column <= r.c2; column++) {
        const v = wrap.values[row] && wrap.values[row][column];
        if (!v || v.length < 2) continue;
        filled += 1;
        if (v[0] === 1) {
          sum += v[1];
          numbers += 1;
        }
      }
    }
    const parts = [];
    if (numbers > 0) parts.push(`Sum ${shown(sum)}`, `Average ${shown(sum / numbers)}`);
    parts.push(`Count ${filled}`);
    return parts.join(" · ");
  }

  // The words and characters of the selection inside the document, or of all its prose.
  function words() {
    const s = window.getSelection();
    const chosen = s.rangeCount > 0 && !s.isCollapsed && ks.root.contains(s.anchorNode);
    const t = chosen ? s.toString() : Array.from(
      ks.root.querySelectorAll("p.b, h1, h2, h3, h4, h5, h6, blockquote, .li, pre"),
      (el) => el.textContent).join("\n");
    const count = (t.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
    const characters = Array.from(t.replace(/\s/g, "")).length;
    return `${count} words · ${characters} characters${chosen ? " selected" : ""}`;
  }

  let waiting = false;
  function update() {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => {
      waiting = false;
      box.textContent = cells() || words();
    });
  }

  ks.rendered.push(update);
  ks.placeHooks.push(update);
  document.addEventListener("selectionchange", update);
  ks.figures = { update };
  update();
}
