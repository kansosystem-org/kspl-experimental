// ksmd page: tables. A table shows calculated values; a cell opened to edit shows what was typed in
// it (its formula, number or text), and the value is calculated again once the edit is taken.
// The open cell and its box are `cellbox.js`.
// A table is not editable text: the document's selection stops at its edges, and a cell edits in
// an input of its own. Arrow keys past the first or last row leave the table for the text there.
// Column widths and row heights, and the edges that change them, are `sizes.js`.
// Each name in the heading row carries the arrow that opens its column's filter (`filter.js`).
// Ctrl+; types today's date into a cell, and Ctrl+: the time, as Excel does.
// Shift+click, and Shift with an arrow key, choose a range of cells from the chosen one
// (`range.js`).
// A right-click on a cell, a row number or a column letter opens the table's menu (`menu.js`).
// While a formula is typed, a press on a cell can write its reference instead (`point.js`), and
// a list offers the functions whose names fit what is typed (`suggest.js`).
// Groups of rows show beside the row numbers, and groups of columns above the letters (`outline.js`).
"use strict";

function ksmdTable(ks) {
  const letters = (c) => {
    let n = c + 1;
    let s = "";
    while (n > 0) {
      s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };

  function cellEl(tag, row, column, value) {
    const el = document.createElement(tag);
    el.dataset.r = String(row);
    el.dataset.c = String(column);
    el.tabIndex = -1;
    if (value) {
      if (value[0] === 1) el.className = "number";
      if (value[0] === 5) el.className = "date";
      if (value[0] === 3) el.className = "error";
      el.textContent = ks.filter.shown(value);
    }
    return el;
  }

  function render(b) {
    const wrap = ks.el("div", "b table");
    wrap.contentEditable = "false";
    wrap.dataset.name = b.name;
    // The table's place in the model, and its rows' and columns' identities, which a range keeps to.
    wrap.u = b.u;
    // A table shown from an included file: its place is in that file's model, not this one's.
    wrap.included = !!b.included;
    wrap.merged = b.mg;
    wrap.rowIds = b.ri;
    wrap.colIds = b.ci;
    wrap.values = b.rows;
    wrap.names = b.names;
    wrap.appendChild(ks.button(b.name, "table-name", "Rename the table"));
    // The caption stands above the table, its number drawn before it (`settings.js`).
    if (b.cap) {
      const cap = ks.el("div", "table-caption", b.cap);
      wrap.appendChild(cap);
    }
    // A grid, as a spreadsheet is to a screen reader: its rows, its column letters, names and row
    // numbers as headers, and the chosen cells selected (`mark` in `range.js`).
    const table = document.createElement("table");
    table.setAttribute("role", "grid");
    table.setAttribute("aria-label", b.name);
    table.setAttribute("aria-multiselectable", "true");
    wrap.widths = b.w;
    wrap.heights = b.h;
    wrap.filterEntries = b.fl;
    // A hidden group's columns take no width (`sizes.js`).
    wrap.foldedColumns = ks.outline.foldedColumns(b.cg, b.names.length);
    const head = document.createElement("thead");
    const lettersRow = document.createElement("tr");
    const namesRow = document.createElement("tr");
    lettersRow.appendChild(document.createElement("th"));
    namesRow.appendChild(document.createElement("th"));
    b.names.forEach((n, c) => {
      const th = ks.el("th", "letter");
      th.scope = "col";
      th.textContent = letters(c);
      lettersRow.appendChild(th);
      const name = cellEl("th", -1, c, [2, n]);
      name.className = "name";
      name.scope = "col";
      if (n === "") name.dataset.empty = "1";
      const arrow = ks.button("\u25BE", "filter-arrow", "Sort and filter this column");
      arrow.dataset.c = String(c);
      arrow.tabIndex = -1;
      arrow.setAttribute("aria-label", `Sort and filter column ${letters(c)}`);
      name.appendChild(arrow);
      namesRow.appendChild(name);
    });
    head.appendChild(lettersRow);
    head.appendChild(namesRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    b.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      const number = ks.el("th", "row-number");
      number.scope = "row";
      number.setAttribute("role", "rowheader");
      number.textContent = String(r + 1);
      tr.appendChild(number);
      row.forEach((value, c) => tr.appendChild(cellEl("td", r, c, value)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    for (const [r, c, color, fill, size, align, wraps] of b.looks) {
      const el = wrap.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      if (color) el.style.color = color;
      if (fill) el.style.backgroundColor = fill;
      if (color || fill) el.classList.add("looked");
      if (size) el.style.fontSize = `${size / 2}pt`;
      // A value centred across columns is laid out with its run (`spill` in `sizes.js`).
      if (align === "across") el.classList.add("across");
      else if (align) el.style.textAlign = align;
      if (wraps) el.classList.add("wrap");
    }
    // A cell's link holds its text, and opens as a prose link does: on Ctrl+press, or a press
    // while read-only (`view.js`). A plain press chooses the cell, so it can be edited.
    wrap.links = new Map();
    for (const [r, c, to] of b.links) {
      const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      wrap.links.set(`${r} ${c}`, to);
      const a = document.createElement("a");
      a.href = to;
      a.className = "cell-link";
      a.title = `${to}\nCtrl+click opens it in a new tab`;
      a.append(...el.childNodes);
      el.appendChild(a);
    }
    // A choice's colours first, so a column's rule stands over them.
    ks.choices.mark(wrap, b.ch, b.rc);
    ks.rules.paint(wrap, b.ru);
    ks.outline.draw(wrap, b.g);
    ks.outline.drawColumns(wrap, b.cg);
    ks.notes.mark(wrap, b.notes);
    // Why each error stands, as the calculator says it: on the cell's tooltip, after any note,
    // and on the status bar while the cell is chosen (`status.js`).
    for (const [r, c, why] of b.err) {
      const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      el.dataset.why = `${el.textContent}: ${why}`;
      el.title = el.title ? `${el.title}\n${el.dataset.why}` : el.dataset.why;
    }
    if (ks.ownMark) ks.ownMark(wrap, b.own);
    ks.filter.apply(wrap);
    ks.sizes.decorate(wrap, b.h);
    return wrap;
  }

  // Measures each table's row numbers, so its first column stays in sight just right of them
  // (`--first-left` in `tools.css`). Every width is read first, then every one is set, so the page
  // is laid out once. A table an include shows is measured too: it scrolls sideways as well.
  // A width on the screen is divided by the document's zoom, which scales the property again.
  // The columns stay only in a table the page can scroll past sideways (`pinned`): one whose left
  // edge lies within the page's sideways scroll.
  function pin() {
    const wraps = Array.from(ks.root.querySelectorAll(".b.table"));
    const zoom = ks.zoom ? ks.zoom.factor() : 1;
    const page = document.scrollingElement;
    const room = page.scrollWidth - page.clientWidth;
    const reads = wraps.map((wrap) => {
      const corner = wrap.querySelector("thead tr:first-child > th:first-child");
      const left = wrap.getBoundingClientRect().left + window.scrollX;
      return [corner ? corner.getBoundingClientRect().width / zoom : 0, room > left];
    });
    wraps.forEach((wrap, i) => {
      wrap.style.setProperty("--first-left", `${reads[i][0]}px`);
      wrap.classList.toggle("pinned", reads[i][1]);
    });
  }
  // A change of the window, the zoom or the contents' width can make the page scroll sideways, or
  // stop it. Each is looked at once, on the next frame.
  let repin = false;
  function pinLater() {
    if (repin) return;
    repin = true;
    requestAnimationFrame(() => {
      repin = false;
      pin();
    });
  }
  window.addEventListener("resize", pinLater);
  new MutationObserver(pinLater).observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
  new MutationObserver(pinLater).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const blockOf = (el) => ks.view.blocks().indexOf(el.closest(".table"));
  const size = (block) => {
    const t = ks.view.blocks()[block].querySelector("table");
    return { rows: t.tBodies[0].rows.length, columns: t.tHead.rows[1].cells.length - 1 };
  };
  const find = (block, row, column) =>
    ks.view.blocks()[block].querySelector(`[data-r="${row}"][data-c="${column}"]`);
  const hiddenRow = (block, row) => {
    const rows = ks.view.blocks()[block].querySelector("tbody").rows;
    return row >= 0 && row < rows.length && rows[row].hidden;
  };
  // The next row a person sees from `row`, one way: a filter's hidden rows are passed over.
  function stepRow(block, row, by) {
    let r = row + by;
    while (hiddenRow(block, r)) r += by;
    return r;
  }
  // The next column a person sees from `column`, one way, passing over a hidden group's columns;
  // the column itself where none shows that way.
  function stepColumn(block, column, by) {
    const wrap = ks.view.blocks()[block];
    const hidden = wrap.foldedColumns || [];
    let c = column + by;
    while (c >= 0 && c < hidden.length && hidden[c]) c += by;
    return c < 0 || c >= size(block).columns ? column : c;
  }

  // The chosen cell: the table and cell the row and column commands act on, as
  // { block, row, column }, or null. This file alone keeps it, and another changes it through
  // `ks.table.chooseCell`, so a choice comes from one door. A plain write to `ks.cell` throws.
  let cell = null;
  Object.defineProperty(ks, "cell", {
    get: () => cell,
    set: () => {
      throw new Error("ks.cell is kept by table.js: call ks.table.chooseCell");
    },
  });
  const chooseCell = (c) => {
    cell = c;
  };

  // The cell opened to edit and its box are `cellbox.js`, which alone keeps them.
  const box = ksmdCellBox(ks, { letters, blockOf, size, find, stepRow, stepColumn, chooseCell, choose });
  const { edit, take, moveTo, tab, redrawn } = box;

  // Downloads the table as CSV: its names, then each row's calculated values, every row whether
  // shown or not. A number is written as the table shows it before any format, with `.` for its
  // point, so another program reads it as a number. The file is UTF-8 with a byte order mark,
  // which Excel needs to read it as UTF-8; lines end in CR LF, as RFC 4180 has them.
  function csv(block) {
    const wrap = ks.view.blocks()[block];
    // Caution: **A spreadsheet runs text that starts with `=`, `+`, `-`, `@`, a tab or a CR as a
    // formula.** Such text gets a `'` before it and is quoted, so it opens as text; a number
    // stays a number.
    const field = (text, number = false) => {
      const t = !number && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return t !== text || /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const value = (v) => (v ? ks.filter.plain(v) : "");
    const lines = [wrap.names.map((n) => field(n)).join(",")];
    for (const row of wrap.values) {
      lines.push(row.map((v) => field(value(v), !!v && v[0] === 1)).join(","));
    }
    const file = new Blob(["\uFEFF", lines.join("\r\n"), "\r\n"], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(file);
    a.download = `${wrap.dataset.name.replace(/[\\/:*?"<>|]/g, "_")}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    ks.say(`Exported ${a.download}.`);
    return null;
  }

  function rename(block) {
    const was = ks.view.blocks()[block].dataset.name;
    const name = window.prompt("Table name", was);
    if (name === null || name === was) return null;
    return ks.act("ksmd_web_rename_table", block, ks.put(name));
  }

  // Sets the number format of the chosen cells as one step, as Excel does; a currency asks for its
  // code. Whole columns, chosen by their letters, take it as the column's own, which new rows
  // follow too; the cells' own formats there go. General and the plain date are a cell's
  // `general`, which shows its value as calculated over any format of its column.
  function format(block, name) {
    const r = ks.range.rect();
    const rows = size(block).rows;
    const whole = r.r1 <= 0 && r.r2 === rows - 1 && (r.r2 > r.r1 || r.r1 < 0);
    const kinds = { "format-none": "", "format-number": "number:2", "format-grouped": "grouped:0",
      "format-percent": "percent:0", "format-date": "", "format-date-slash": "date:yyyy/mm/dd" };
    if (name in kinds) {
      if (whole) return ks.act("ksmd_web_column_format", block, r.c1, r.c2, ks.put(kinds[name]));
      return ks.act("ksmd_web_cell_look", block, r.r1, r.c1, r.r2, r.c2, 5, ks.put(kinds[name] || "general"));
    }
    if (name === "format-more" || name === "format-fewer") {
      const more = name === "format-more" ? 1 : 0;
      if (whole) return ks.act("ksmd_web_column_places", block, r.c1, r.c2, more);
      return ks.act("ksmd_web_cell_places", block, r.r1, r.c1, r.r2, r.c2, more);
    }
    const code = window.prompt("Currency code, such as USD, EUR or JPY", "USD");
    if (code === null) return null;
    const typed = ks.put(code.trim().toUpperCase());
    if (whole) return ks.act("ksmd_web_column_currency", block, r.c1, r.c2, typed);
    return ks.act("ksmd_web_cell_currency", block, r.r1, r.c1, r.r2, r.c2, typed);
  }

  // Marks the cell the table commands act on, while no cell is open.
  function choose(block, row, column) {
    ks.range.set(block, row, column, null);
  }

  // A press chooses a cell and a double press opens it, as in a spreadsheet; both on the press,
  // not the click. A press moves the document's caret out of its gap, which can shift the table,
  // so the button would come up elsewhere and no click would come.
  let pressed = null; // the cell a single press chose, which a second press opens
  ks.root.addEventListener("mousedown", (e) => {
    // A table shown from an included file edits in that file's own tab.
    if (!e.target.closest || e.target.closest(".include")) return;
    // The second press of a double-click opens the cell the first chose, wherever it lands now:
    // choosing can take an empty line above the table away, and the table moves under the pointer.
    if (e.detail >= 2 && e.button === 0 && pressed && !box.isOpen()) {
      // No other press handler acts on it, such as the one that puts the caret in a gap.
      e.preventDefault();
      e.stopImmediatePropagation();
      const c = pressed;
      pressed = null;
      return moveTo(c.block, c.row, c.column, true);
    }
    pressed = null;
    const el = e.target.closest(".table [data-r]");
    // A right press inside the chosen range keeps it, so the menu acts on the whole range.
    if (el && e.button === 2 && inRange(blockOf(el), Number(el.dataset.r), Number(el.dataset.c))) {
      e.preventDefault();
      return;
    }
    // Shift+click reaches from the chosen cell to this one, as a range.
    if (el && e.shiftKey && ks.cell && ks.cell.block === blockOf(el)) {
      e.preventDefault();
      take();
      ks.range.reach(Number(el.dataset.r), Number(el.dataset.c));
      return;
    }
    if (el && !el.querySelector(".cell-input")) {
      e.preventDefault();
      edit(el, false);
      if (e.button === 0 && !e.shiftKey) pressed = ks.cell;
    }
  });

  ks.root.addEventListener("click", (e) => {
    if (!e.target.closest || e.target.closest(".include")) return;
    const name = e.target.closest(".table-name");
    if (name) rename(blockOf(name));
  });

  // Whether a cell stands in the chosen range of more than one cell.
  function inRange(block, row, column) {
    // Whole lines chosen stay so even where they are one cell, so a cut from the menu cuts them.
    if (!ks.cell || ks.cell.block !== block || (!ks.range.any() && !ks.range.lines())) return false;
    const r = ks.range.rect();
    return row >= r.r1 && row <= r.r2 && column >= r.c1 && column <= r.c2;
  }

  // A right-click on a cell, a row number or a column letter chooses that place and opens the
  // table's menu there. Inside the chosen range, the range stays.
  ks.root.addEventListener("contextmenu", (e) => {
    if (!e.target.closest || e.target.closest(".include")) return;
    const wrap = e.target.closest(".table");
    const at = wrap && e.target.closest("[data-r], th.row-number, th.letter");
    if (!at) return;
    e.preventDefault();
    take();
    const block = blockOf(wrap);
    const was = ks.cell && ks.cell.block === block ? ks.cell : { row: 0, column: 0 };
    let row = was.row;
    let column = was.column;
    if (at.dataset.r !== undefined) {
      row = Number(at.dataset.r);
      column = Number(at.dataset.c);
    } else if (at.classList.contains("row-number")) {
      row = at.parentElement.sectionRowIndex;
    } else {
      column = at.cellIndex - 1;
    }
    if (!inRange(block, row, column)) choose(block, row, column);
    ks.menus.openContext(e.clientX, e.clientY);
  });

  // Asks for a table's caption; an empty answer takes it away.
  function askCaption(block) {
    const wrap = ks.view.blocks()[block];
    const cap = wrap.querySelector(".table-caption");
    const typed = window.prompt("Caption, shown above the table. Leave it empty for none.",
      cap ? cap.textContent : "");
    if (typed === null) return null;
    return ks.act("ksmd_web_table_caption", block, ks.put(typed.trim()));
  }

  // Asks for the chosen cell's link; an empty answer takes it away.
  function askLink() {
    const c = ks.cell;
    const wrap = ks.view.blocks()[c.block];
    const now = wrap.links.get(`${c.row} ${c.column}`) || "https://";
    const to = window.prompt("Link the cell's text to an https:, http: or mailto: address. Leave it " +
      "empty to take the link away.", now);
    if (to === null) return null;
    return ks.act("ksmd_web_cell_link", c.block, c.row, c.column, ks.put(to.trim()));
  }

  // What a screen reader says of a chosen cell: its value and address as its name, as a
  // spreadsheet's cell is read, and its formula, its error's reason, its note and its link as
  // its description. A sighted person reads these on the cell, its corner and the status bar.
  function describe(el) {
    const wrap = el.closest(".table");
    const row = Number(el.dataset.r);
    const column = Number(el.dataset.c);
    const block = blockOf(el);
    if (row < 0) {
      const name = wrap.names[column];
      return { name: `${name === "" ? "empty" : name}, name of column ${letters(column)}`, description: "" };
    }
    const v = wrap.values[row] && wrap.values[row][column];
    const shown = v ? ks.filter.shown(v) : "";
    const typed = block >= 0 && !wrap.included ? ks.cellText(block, row, column) : "";
    const more = [];
    if (typed.startsWith("=")) more.push(`Formula ${typed}`);
    if (el.dataset.why) more.push(el.dataset.why);
    const note = ks.notes.of(wrap, row, column);
    if (note) more.push(`Note: ${note}`);
    const link = wrap.links && wrap.links.get(`${row} ${column}`);
    if (link) more.push(`Link to ${link}`);
    return { name: `${shown === "" ? "empty" : shown}, ${letters(column)}${row + 1}`, description: more.join(". ") };
  }

  // Whether a table is left out of print and PDF.
  const leftOut = (block) => ks.view.blocks()[block].classList.contains("print-hidden");

  // The commands on a table's rows and columns, and on the table as a whole. Each acts on every
  // row or column the range spans, as one step: with rows 2 to 3 chosen, Insert row above inserts
  // two rows, as Excel does. A row that a filter or a closed group hides counts for none: Remove
  // row leaves it, and Insert row above inserts one row for each row in sight. While rows of the
  // table are cut, Insert row above inserts them instead, and Insert column left the columns
  // (`CUT_FORMS` in `commands.js`). A filter stays, and shows a new row until it is chosen again
  // (`filter.js`).
  const LINES = { "row-above": [0, 0], "row-below": [0, 1], "row-remove": [1, 0],
    "column-left": [2, 0], "column-right": [2, 1], "column-remove": [3, 0] };
  const editLines = (name, c) => {
    const rows = name.startsWith("row-");
    if (name in CUT_FORMS && ks.cut.waiting(c.block, rows)) return ks.cut.insert(c.block, rows);
    const [what, after] = LINES[name];
    const r = ks.range.rect();
    const first = rows ? Math.max(r.r1, 0) : r.c1;
    const last = rows ? Math.max(r.r2, 0) : r.c2;
    const hidden = rows ? ks.range.hiddenRows(c.block, first, last) : [];
    const removes = what === 1;
    return ks.act("ksmd_web_table_edit", c.block, what, after ? last + 1 : first,
      last - first + 1 - (removes ? 0 : hidden.length), ks.put(removes ? hidden.join(",") : ""));
  };
  ks.handle(["row-above", "row-below", "row-remove"], editLines,
    { table: true, repeat: true, when: (c) => c.row >= 0 });
  ks.handle(["column-left", "column-right", "column-remove"], editLines, { table: true, repeat: true });
  ks.handle("table-rename", (_, c) => rename(c.block), { table: true });
  ks.handle("table-caption", (_, c) => askCaption(c.block), { table: true });
  ks.handle("table-csv", (_, c) => csv(c.block), { table: true, looks: true });
  ks.handle("table-print", (_, c) => ks.act("ksmd_web_invisible", c.block, leftOut(c.block) ? 0 : 1),
    { table: true, repeat: true });
  ks.handle("table-chart", (_, c) => ks.act("ksmd_web_insert_chart", c.block), { table: true });
  ks.handle("table-remove", (_, c) => {
    chooseCell(null);
    return ks.view.removeBlock("ksmd_web_remove_table", c.block);
  }, { table: true });
  // A currency asks for its code, so Repeat leaves it out.
  ks.handle(["format-none", "format-number", "format-grouped", "format-percent", "format-more",
    "format-fewer", "format-date", "format-date-slash"], (name, c) => format(c.block, name),
  { table: true, repeat: true });
  ks.handle("format-currency", (name, c) => format(c.block, name), { table: true });

  ks.table = {
    render,
    take,
    // Undoes a formula's closing quote right after it was added, and opens the cell with the
    // formula as typed; false where the editor's own undo acts (`unclose` in `cellbox.js`).
    unclose: box.unclose,
    letters,
    range: () => ks.range.rect(),
    // Opens a cell to edit, or leaves the table past its first or last row; with `whole`, what is
    // typed replaces its text.
    open: (block, row, column, whole = false) => moveTo(block, row, column, true, whole),
    // Opens the chosen cell with what was typed or is being composed in the box over it.
    openTyped: box.openTyped,
    // Gives the edit of the chosen cell to the formula bar's `box`: an edit open in the cell moves
    // there with its text, or the cell opens there. False where the cell cannot be edited: none or
    // a range is chosen, the page is read-only, or the table is shown from an included file.
    inBar: box.inBar,
    // Chooses a cell, or leaves the table past its first or last row.
    choose: (block, row, column) => moveTo(block, row, column, false),
    tab,
    // The row `dr` steps from `row`, passing over the rows a filter or a group hides.
    step: (block, row, dr) => stepRow(block, row, dr),
    pin,
    leftOut,
    // Sets the chosen cell, { block, row, column }, or null for none.
    chooseCell,
    askLink,
    // The element a chosen cell's box is (`catcher` in `range.js`).
    boxKind: box.boxKind,
    describe,
    // The column `dc` steps from `column`, passing over the columns a group hides.
    stepColumn: (block, column, dc) => stepColumn(block, column, dc),
    // The cell being edited, whose row a filter keeps in sight: { block, row, input } or null.
    // `home` is what stands in the cell: the box itself, or the copy of the formula bar's box.
    editing: box.editing,
    redrawn,
    // The open cell's text where it differs from the cell's own, not yet taken into the
    // document: { block, row, column, text } or null.
    pending: box.pending,
    // Whether an event belongs to a cell's own input rather than to the document.
    owns: (target) => !!(target && target.closest && target.closest(".table")),
    // Keeps the open cell open while the focus is elsewhere, or lets it be taken again on a blur.
    hold: box.hold,
    // Opens a cell with text typed in and part of it selected, as AutoSum leaves its formula.
    openWith: box.openWith,
    // Opens the first name of a new table to edit.
    editFirst: box.editFirst,
  };
}
