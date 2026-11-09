// ksmd page: the status bar at the window's foot. From the left it shows the chosen cell's address
// and what was typed in it, why it shows an error, the note on that cell or on the paragraph at the
// caret, a message, how many rows a filter shows, and the printed page the caret stands on
// (`pages.js`). At the right stand the figures (`figures.js`) and the zoom (`zoom.js`).
// A range chosen is also said to a screen reader (`said`): the focus stays on its first cell.
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
  const why = part("why");
  const note = part("note");
  const said = part("said");
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
      why.hidden = true;
      if (said.textContent !== "") said.textContent = "";
      return;
    }
    const c = ks.cell;
    let where;
    let text = "";
    if (ks.range.any() || ks.range.lines()) {
      where = rangeAddress(wrap, ks.range.rect());
    } else {
      where = at(c.row, c.column);
      text = ks.range.typed();
    }
    // **Written only when it changes**: the bar is shown again on each change of the selection,
    // and writing the same text again would drop text being chosen in it.
    const shown = text.replace(/\n/g, " ");
    if (address.textContent !== where) address.textContent = where;
    if (content.textContent !== shown) content.textContent = shown;
    cellBox.hidden = false;
    // Why a chosen error stands, as its tooltip says it (`table.js`). One line: an ellipsis cuts
    // a long reason, and the part's tooltip holds it whole.
    const one = !ks.range.any() && !ks.range.lines();
    const el = one ? wrap.querySelector(`td[data-r="${c.row}"][data-c="${c.column}"]`) : null;
    const reason = (el && el.dataset.why) || "";
    why.hidden = reason === "";
    if (why.textContent !== reason) why.textContent = reason;
    why.title = reason;
    const full = text === "" ? `Cell ${where}` : `Cell ${where}: ${text}`;
    cellBox.title = full;
    cellBox.setAttribute("aria-label", full);
    // A range is said once each time it changes; one cell says nothing here, since its box
    // already says its value and address.
    const range = one ? "" : `${where} chosen`;
    if (said.textContent !== range) said.textContent = range;
  }

  // The note on the chosen cell, or on the paragraph or heading at the caret: a red corner or a bar
  // marks it, and pointing shows it. Here it shows also for a person who works with keys.
  function showNote(wrap, block) {
    let text = "";
    if (wrap && !ks.range.any() && !ks.range.lines()) {
      text = ks.notes.of(wrap, ks.cell.row, ks.cell.column);
    } else if (!wrap && block && block.dataset.note) {
      text = block.dataset.note;
    }
    const shown = text === "" ? "" : `Note: ${text}`;
    note.hidden = shown === "";
    if (note.textContent !== shown) note.textContent = shown;
    note.title = shown;
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
      // A table that prints smaller to fit the paper says so here, while the person works in it.
      const small = block.classList.contains("table") && block.printScale < 100 ? block.printScale : 0;
      page.textContent = `Page ${p.page} of ${p.pages}` + (small ? ` · this table prints at ${small}%` : "");
      page.title = `Page ${p.page} of ${p.pages} on ${p.paper}, as the print lays the document out. ` +
        "The print dialog's own paper, margins or scale can change it." + (small ? " The table is wider " +
        "than the paper, so print and PDF shrink it. Narrow its columns, or choose a wider paper or " +
        "Landscape in File, Page setup…" : "");
    }
  }

  function update() {
    const wrap = ks.inTable() ? ks.view.blocks()[ks.cell.block] : null;
    showCell(wrap);
    const f = wrap && wrap.filterShown;
    filter.hidden = !f;
    if (f) filter.textContent = `${f.shown} of ${f.all} rows shown`;
    const block = blockNow();
    showPage(block);
    showNote(wrap, block);
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

  // A small menu that opens from the bar, above it: the figures to show, or the zoom's steps
  // (`ks.popup`). `items` are [label, checked, act, aside]; `radio` makes the ticks exclude each
  // other, and `stays` keeps the menu open after a press, so several can be ticked in turn.
  function popup(from, label, items, radio, stays) {
    const menu = document.createElement("div");
    menu.className = "menu status-menu";
    menu.setAttribute("aria-label", label);
    for (const [text, on, act, aside] of items) {
      const b = ks.button("", null, null, () => {
        act();
        if (!stays) return ks.popup.close(menu, true);
        b.setAttribute("aria-checked", String(b.getAttribute("aria-checked") !== "true"));
        return null;
      });
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
      menu.appendChild(b);
    }
    ks.popup(menu, "menu", { at: from, above: true, from, back: () => from.focus() });
  }

  ks.status = {
    update: schedule,
    popup,
    // Runs `f` each time the bar is shown again, for the parts other files keep.
    also: (f) => updates.push(f),
    bar,
  };
}
