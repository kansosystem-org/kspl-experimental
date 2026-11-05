// ksmd page: the status bar at the window's foot. From the left it shows the chosen cell's address
// and what was typed in it, a message, how many rows a filter shows, and the printed page the caret
// stands on (`pages.js`). At the right stand the figures (`figures.js`) and the zoom (`zoom.js`).
// The bar keeps one line: a message pushes the page and the filter aside, and a narrow window
// drops items in the order `page.css` gives.
// Everything here only reads the page. It changes neither the document nor the selection.
"use strict";

function ksmdStatus(ks) {
  const bar = document.querySelector(".status-bar");
  const part = (name) => bar.querySelector(`.status-${name}`);
  const cellBox = part("cell");
  const address = part("address");
  const content = part("content");
  const filter = part("filter");
  const page = part("page");
  const updates = [];

  // A cell's address as a formula writes it, such as C2; a column's name cell is its letter and
  // "name", since it stands above row 1.
  const at = (row, column) => `${ks.table.letters(column)}${row < 0 ? " name" : row + 1}`;

  // The chosen range's address, such as C2:D5. A range from the names down to the last row is the
  // columns alone, such as A:D.
  function rangeAddress(wrap, r) {
    if (r.r1 < 0 && r.r2 === wrap.rowIds.length - 1) {
      return `${ks.table.letters(r.c1)}:${ks.table.letters(r.c2)}`;
    }
    return `${at(r.r1, r.c1)}:${at(r.r2, r.c2)}`;
  }

  // The chosen cell's address and its text as typed: a formula, a value or a column's name. While
  // the cell is open, the text is what its box holds now.
  function showCell(wrap) {
    if (!wrap) {
      cellBox.hidden = true;
      return;
    }
    const c = ks.cell;
    let where;
    let text = "";
    if (ks.range.any() || ks.range.lines()) {
      where = rangeAddress(wrap, ks.range.rect());
    } else {
      where = at(c.row, c.column);
      const open = ks.table.editing();
      text = open ? open.input.value : ks.cellText(c.block, c.row, c.column);
    }
    address.textContent = where;
    content.textContent = text.replace(/\n/g, " ");
    cellBox.hidden = false;
    const said = text === "" ? `Cell ${where}` : `Cell ${where}: ${text}`;
    cellBox.title = said;
    cellBox.setAttribute("aria-label", said);
  }

  // The top-level element the caret stands in, or the chosen cell's table; null outside the
  // document. A focus elsewhere, as in a menu, keeps the last place.
  let lastBlock = null;
  function blockNow() {
    if (ks.inTable()) return ks.view.blocks()[ks.cell.block] || null;
    const s = window.getSelection();
    let el = s.rangeCount > 0 ? s.focusNode : null;
    if (!el || !ks.root.contains(el) || el === ks.root) return lastBlock && lastBlock.isConnected ? lastBlock : null;
    while (el.parentNode !== ks.root) el = el.parentNode;
    return el.nodeType === Node.ELEMENT_NODE ? el : el.previousElementSibling;
  }

  function showPage(block) {
    lastBlock = block;
    const row = ks.inTable() && ks.cell ? Math.max(ks.cell.row, 0) : -1;
    const p = block && ks.pages ? ks.pages.at(block, row) : null;
    page.hidden = !p;
    if (p) {
      page.textContent = `Page ${p.page} of ${p.pages}`;
      page.title = `Page ${p.page} of ${p.pages} on ${p.paper}, as the print lays the document out. ` +
        "The print dialog's own paper, margins or scale can change it.";
    }
  }

  function update() {
    const wrap = ks.inTable() ? ks.view.blocks()[ks.cell.block] : null;
    showCell(wrap);
    const f = wrap && wrap.filterShown;
    filter.hidden = !f;
    if (f) filter.textContent = `${f.shown} of ${f.all} rows shown`;
    showPage(blockNow());
    for (const f2 of updates) f2();
  }

  // Every change of choice, edit, key or focus shows the bar again, once per frame at most.
  let waiting = false;
  function schedule() {
    if (waiting) return;
    waiting = true;
    requestAnimationFrame(() => {
      waiting = false;
      update();
    });
  }
  ks.rendered.push(schedule);
  ks.placeHooks.push(schedule);
  document.addEventListener("selectionchange", schedule);
  for (const type of ["input", "keyup", "focusin", "mouseup"]) document.addEventListener(type, schedule, true);

  // A small menu that opens from the bar, above it: the figures to show, or the zoom's steps.
  // `items` are [label, checked, act]; `radio` makes the ticks exclude each other. Up and Down move,
  // Enter and Space press, and Esc, Tab or a press elsewhere close it, the focus back on `from`.
  let menu = null;
  function closeMenu(refocus) {
    if (!menu) return;
    const from = menu.from;
    menu.remove();
    menu = null;
    from.setAttribute("aria-expanded", "false");
    if (refocus) from.focus();
  }
  function popup(from, label, items, radio, stays) {
    closeMenu(false);
    menu = document.createElement("div");
    menu.className = "menu status-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", label);
    menu.from = from;
    for (const [text, on, act, aside] of items) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", radio ? "menuitemradio" : "menuitemcheckbox");
      b.setAttribute("aria-checked", String(on));
      const name = document.createElement("span");
      name.className = "label";
      name.textContent = text;
      b.appendChild(name);
      if (aside) {
        const value = document.createElement("span");
        value.className = "status-value";
        value.textContent = aside;
        b.appendChild(value);
      }
      b.addEventListener("click", () => {
        act();
        if (!stays) return closeMenu(true);
        b.setAttribute("aria-checked", String(b.getAttribute("aria-checked") !== "true"));
        return null;
      });
      menu.appendChild(b);
    }
    menu.addEventListener("keydown", (e) => {
      const list = Array.from(menu.children);
      const k = list.indexOf(document.activeElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        list[(k + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length].focus();
      } else if (e.key === "Escape" || e.key === "Tab") {
        e.preventDefault();
        closeMenu(true);
      }
    });
    document.body.appendChild(menu);
    const r = from.getBoundingClientRect();
    const w = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - w.width - 4))}px`;
    menu.style.top = `${Math.max(0, r.top - w.height - 2)}px`;
    from.setAttribute("aria-expanded", "true");
    (menu.querySelector('[aria-checked="true"]') || menu.firstElementChild).focus();
  }
  document.addEventListener("mousedown", (e) => {
    if (menu && !menu.contains(e.target) && e.target !== menu.from) closeMenu(false);
  }, true);
  window.addEventListener("resize", () => closeMenu(false));

  ks.status = {
    update: schedule,
    popup,
    // Runs `f` each time the bar is shown again, for the parts other files keep.
    also: (f) => updates.push(f),
    bar,
  };
}
