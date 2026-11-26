// ksmd page: cells copied in ksmd and pasted again, with their formulas or as values, as in Excel.
// A copy of cells puts, beside their shown values, what ksmd needs to paste them as they were: each
// cell's text as typed, a formula with its `=`, each value as calculated, the number format each
// cell shows, and the place they were copied from (`KSMD_CELLS_TYPE`). Another program reads only
// the shown values.
// Ctrl+V pastes the formulas and the number formats, each reference without `$` shifted by the
// distance from the copied cells to the paste (`paste_copied` in `ksmd/edit/editor_tables.kspl`).
// Ctrl+Shift+V, and Edit, Paste values, put the values alone. After either, the Paste Options
// button by the pasted cells switches that paste to another kind, as one step; Ctrl alone opens
// it. It goes at the next action. Text from another program pastes as before (`range.js`).
"use strict";

function ksmdPaste(ks) {
  // The last copy of cells this page made: { text, cells }, so a paste that can read only the
  // clipboard's text, as Edit, Paste does, finds what went with it.
  let copied = null;
  // Whether the paste under way puts the values alone: Ctrl+Shift+V, or Paste values, sets it.
  let values = false;
  // The paste the button can switch: { block, r1, c1, r2, c2, copy, values, formats }, the range
  // as it was chosen before the paste, and what was pasted; or null.
  let offer = null;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "paste-options";
  button.title = "Paste options (Ctrl)";
  button.setAttribute("aria-label", "Paste options");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.appendChild(ksmdIcon("paste"));
  button.insertAdjacentHTML("beforeend", '<span class="arrow" aria-hidden="true">▾</span>');
  button.hidden = true;
  // The menu the button opens (`ks.popup`). The letter of a choice chooses it, as in Excel.
  const menu = ks.el("div", "menu paste-menu");
  menu.setAttribute("aria-label", "Paste options");
  // Each choice: whether it puts values, whether it puts the number formats, its name, its key
  // there, and the key that pastes so.
  const CHOICES = [[false, true, "Formulas and formats", "F", "Ctrl+V"], [false, false, "Formulas only", "O", ""],
    [true, false, "Values only", "V", "Ctrl+Shift+V"], [true, true, "Values and formats", "A", ""]];
  for (const [kind, formats, label, letter, key] of CHOICES) {
    const b = ks.button("", null, null, () => choose(kind, formats));
    b.setAttribute("role", "menuitemradio");
    b.setAttribute("aria-keyshortcuts", letter);
    b.dataset.values = kind ? "1" : "0";
    b.dataset.formats = formats ? "1" : "0";
    b.appendChild(ksmdIcon(kind ? "paste-values" : "paste"));
    // The letter that chooses it is underlined, as in Excel's menus.
    const at = label.toLowerCase().indexOf(letter.toLowerCase());
    const name = ks.el("span", "label");
    const u = document.createElement("u");
    u.textContent = label[at];
    name.append(label.slice(0, at), u, label.slice(at + 1));
    b.appendChild(name);
    if (key) {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      b.appendChild(kbd);
    }
    menu.appendChild(b);
  }
  document.body.append(button);

  // The cells a copy carries for a paste in ksmd, as JSON, or "" outside a table. A hidden row
  // is left out, and `rows` says the row each line was copied from, so each formula shifts from
  // its own row.
  function carry(r) {
    const own = ks.out(ks.w.ksmd_web_copied_cells(r.block, r.r1, r.c1, r.r2, r.c2,
      ks.put(ks.range.hiddenRows(r.block, r.r1, r.r2).join(","))));
    if (!own) return "";
    const got = JSON.parse(own);
    return JSON.stringify({ row: r.r1, column: r.c1, cells: got.cells, values: got.values, formats: got.formats,
      rows: got.rows });
  }

  // Puts the copy of the range `r` on the clipboard beside its shown values, `text`.
  function copy(data, r, text) {
    const own = carry(r);
    if (!own) return;
    data.setData(KSMD_CELLS_TYPE, own);
    copied = { text, own };
  }

  // The last whole table this page copied or cut: { text, source }, its rows as text and its own
  // source, or null.
  let table = null;

  // Keeps a whole table copied or cut, `source`, beside its rows as text.
  function copyTable(text, source) {
    table = { text, source };
  }

  // Puts back the whole table a paste lost, where it read only the clipboard's text, as Edit,
  // Paste does: the text of the last whole table copied gives that table's source again.
  function restore(data) {
    const text = data.getData("text/plain");
    if (table && text && !data.getData(KSMD_TYPE) && plain(text) === plain(table.text)) {
      data.setData(KSMD_TYPE, table.source);
    }
  }

  // Lines of text as the clipboard may hand them back: line breaks as LF, and no break at the end.
  const plain = (t) => t.replace(/\r\n/g, "\n").replace(/\n$/, "");

  // The cells copied in ksmd that a paste holds, or null: from the clipboard's own type, or from the
  // page's last copy where only its text came.
  function held(data, text) {
    let own = data ? data.getData(KSMD_CELLS_TYPE) : "";
    if (!own && copied && text && plain(text) === plain(copied.text)) own = copied.own;
    if (!own || ks.tooLarge(own)) return null;
    try {
      const c = JSON.parse(own);
      const grid = (g) => Array.isArray(g) && g.length > 0 && g.every((line) => Array.isArray(line) &&
        line.length === g[0].length && line.every((t) => typeof t === "string"));
      // A copy without `rows` holds lines that stood one after another.
      const rows = c.rows === undefined || (Array.isArray(c.rows) && c.rows.length === c.cells.length &&
        c.rows.every((n) => Number.isInteger(n) && n >= -1));
      // A copy without `formats`, from an older page, pastes with none.
      const formats = c.formats === undefined || (grid(c.formats) && c.formats.length === c.cells.length);
      if (!Number.isInteger(c.row) || !Number.isInteger(c.column) || !grid(c.cells) ||
        !grid(c.values) || c.values.length !== c.cells.length || !rows || !formats) return null;
      return c;
    } catch (_) {
      return null;
    }
  }

  // Pastes copied cells at the chosen range, with their formulas or as values, and with their
  // number formats or not, as one step, and chooses the cells pasted. A range that holds the copy
  // a whole number of times takes it that many times, as `paste_copied` does. False where the
  // editor refused.
  function put(c, block, r1, c1, r2, c2, asValues, withFormats) {
    ks.table.take();
    const r = ks.act("ksmd_web_paste_copied", block, r1, c1, r2, c2, c.row, asValues ? -1 : c.column,
      ks.put(JSON.stringify({ cells: asValues ? c.values : c.cells, rows: c.rows || [],
        formats: withFormats && c.formats ? c.formats : [] })));
    if (!r || !r.ok) return false;
    const height = c.cells.length;
    const width = c.cells[0].length;
    const whole = (r2 - r1 + 1) % height === 0 && (c2 - c1 + 1) % width === 0;
    const bottom = whole ? r2 : r1 + height - 1;
    const right = whole ? c2 : c1 + width - 1;
    ks.range.set(block, r1, c1, { row: bottom, column: right });
    ks.range.focus();
    offer = { block, r1, c1, r2, c2, copy: c, values: asValues, formats: withFormats };
    show(bottom, right);
    return true;
  }

  // Pastes the cells a ksmd copy left on the clipboard at the chosen range; true where it took the
  // paste. Text from elsewhere is left to the caller.
  function paste(data, text) {
    const asValues = values;
    values = false;
    if (!ks.cell) return false;
    const c = held(data, text);
    if (!c) return false;
    const r = ks.range.rect();
    // Paste values puts the values alone, as Excel's does; Ctrl+V brings the formats too.
    put(c, r.block, r.r1, r.c1, r.r2, r.c2, asValues, !asValues);
    return true;
  }

  // Shows the button below the right of the pasted cells' corner.
  function show(row, column) {
    const wrap = ks.view.blocks()[offer.block];
    const corner = wrap && wrap.querySelector(`[data-r="${row}"][data-c="${column}"]`);
    if (!corner) return hide();
    const box = corner.getBoundingClientRect();
    button.style.left = `${box.right + window.scrollX + 2}px`;
    button.style.top = `${box.bottom + window.scrollY + 2}px`;
    button.hidden = false;
  }

  function hide() {
    offer = null;
    button.hidden = true;
    shut();
  }

  // The menu opens with the kind pasted ticked and in focus; closed by a key, it gives the focus
  // back to the pasted cells.
  function open() {
    if (!offer) return;
    for (const b of menu.children) {
      b.setAttribute("aria-checked", String((b.dataset.values === "1") === offer.values &&
        (b.dataset.formats === "1") === offer.formats));
    }
    ks.popup(menu, "menu", { at: button, from: button, back: () => ks.range.focus() });
  }

  const shut = () => ks.popup.close(menu);

  // Switches the paste the button stands for to another kind: an undo, then that paste, so the
  // result is one step again.
  function choose(asValues, withFormats) {
    const o = offer;
    shut();
    if (!o) return;
    if (o.values === asValues && o.formats === withFormats) {
      ks.range.focus();
      return;
    }
    const undone = ks.act("ksmd_web_undo");
    if (!undone || !undone.ok) return hide();
    ks.range.set(o.block, o.r1, o.c1, { row: o.r2, column: o.c2 });
    if (!put(o.copy, o.block, o.r1, o.c1, o.r2, o.c2, asValues, withFormats)) hide();
  }

  button.addEventListener("click", open);
  menu.addEventListener("keydown", (e) => {
    const letter = CHOICES.findIndex(([, , , l]) => l.toLowerCase() === e.key.toLowerCase());
    if (letter < 0) return;
    e.preventDefault();
    e.stopPropagation();
    choose(CHOICES[letter][0], CHOICES[letter][1]);
  });

  // Any change to the document takes the button away, as does a press or a key elsewhere: a
  // paste shows it again after its own change. Ctrl pressed and let go alone opens it, as in Excel.
  let ctrlAlone = false;
  ks.changed.push(() => {
    if (offer) hide();
  });
  document.addEventListener("keydown", (e) => {
    ctrlAlone = e.key === "Control" && !e.repeat && !button.hidden;
    if (button.hidden || ["Control", "Shift", "Alt", "Meta"].includes(e.key) || menu.contains(e.target)) return;
    hide();
  }, true);
  document.addEventListener("keyup", (e) => {
    if (e.key === "Control" && ctrlAlone && !button.hidden) {
      e.preventDefault();
      open();
    }
    ctrlAlone = false;
  });
  document.addEventListener("mousedown", (e) => {
    if (!button.hidden && !button.contains(e.target) && !menu.contains(e.target)) hide();
  }, true);

  // Ctrl+Shift+V pastes values alone where the cells are ksmd's: the browser's paste it starts
  // comes at once, while the key is down.
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== "v") return;
    values = true;
    setTimeout(() => {
      values = false;
    }, 0);
  }, true);

  ks.pasting = { copy, copyTable, restore, paste,
    // Whether the paste under way puts the values alone.
    values: () => values,
    // Runs `f`, a paste the page starts itself, so that it puts the values alone.
    asValues: (f) => {
      values = true;
      try {
        return f();
      } finally {
        values = false;
      }
    },
  };
}
