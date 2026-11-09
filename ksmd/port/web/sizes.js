// ksmd page: a table's column widths and row heights, as a spreadsheet keeps them.
// A column is as wide as its width in characters, and the table as wide as its columns, so a
// narrow window scrolls the page sideways and wraps no text. A column with no width fits its text,
// within 3 to 60 characters. A cell's text stays on its lines: it runs on over the empty cells to
// its right, and is cut where the next cell holds something. A cell set to wrap breaks its text
// into lines at its column's width instead, and its row grows to show them. A number is always
// cut at its cell. A row with a height is that tall, and text taller than it is cut; a row
// without one fits its lines.
// The reasons are "Column widths and row heights" in `ksmd/docs/DESIGN-page.md`.
// Dragging the right edge of a column letter, or the bottom edge of a row number, sets that
// column's width or that row's height; a double-click there fits it to its text. Alt+Left and
// Alt+Right in a cell change its column's width by one character.
// A table wider than the paper prints smaller to fit it, and says so on the page.
"use strict";

// The widths a column can be given, in characters, and the widths a column without one takes.
const SIZE_LEAST = 0.5;
const SIZE_MOST = 255;
const SIZE_FIT_LEAST = 3;
const SIZE_FIT_MOST = 60;
// Each paper's width and height in millimetres, as `:::document` names it.
const SIZE_PAPERS = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250],
  letter: [215.9, 279.4], legal: [215.9, 355.6],
};

function ksmdSizes(ks) {
  const canvas = document.createElement("canvas").getContext("2d");
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // The width of a text's longest line in pixels, in a font CSS names.
  function textWidth(text, font) {
    canvas.font = font;
    let widest = 0;
    for (const line of text.split("\n")) widest = Math.max(widest, canvas.measureText(line).width);
    return widest;
  }

  const fontOf = (style) => `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  // The fonts and spaces a table's cells are drawn with: `ch` is the width of one character, the
  // digit 0, as CSS's unit `ch` and Excel's column width take it.
  function metrics(wrap) {
    const td = wrap.querySelector("tbody td") || wrap.querySelector("th.name");
    const name = wrap.querySelector("th.name");
    const number = wrap.querySelector("thead tr > th:first-child");
    const style = getComputedStyle(td);
    const font = fontOf(style);
    return {
      font,
      size: parseFloat(style.fontSize),
      nameFont: name ? fontOf(getComputedStyle(name)) : font,
      numberFont: number ? fontOf(getComputedStyle(number)) : font,
      ch: textWidth("0", font),
      pad: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) + 1,
    };
  }

  // The width a column's text takes, in characters: its widest value, or its name with the
  // filter's arrow. Rows a filter or a closed group hides count too, so a filter moves no column.
  function textChars(wrap, column, m) {
    let widest = 0;
    const name = wrap.querySelector(`th.name[data-c="${column}"]`);
    if (name) widest = textWidth(wrap.names[column], m.nameFont) + 18;
    for (const tr of wrap.querySelector("tbody").rows) {
      const td = tr.cells[column + 1];
      const input = td.querySelector(".cell-input");
      const text = input ? input.value : td.textContent;
      if (text === "") continue;
      const size = td.style.fontSize;
      const font = size ? m.font.replace(/\d+(\.\d+)?px/, size) : m.font;
      widest = Math.max(widest, textWidth(text, font));
    }
    return widest / m.ch;
  }

  // Each column's width in pixels as the page shows it, 0 for a column a closed group hides.
  function shown(wrap, m) {
    return wrap.names.map((_, c) => {
      if (wrap.foldedColumns[c]) return 0;
      const given = wrap.widths[c] || 0;
      const chars = given > 0 ? given / 10 : clamp(Math.ceil(textChars(wrap, c, m) * 10) / 10,
        SIZE_FIT_LEAST, SIZE_FIT_MOST);
      return chars * m.ch + m.pad;
    });
  }

  // The width the row numbers take: their longest number, and the outline of the row groups.
  function firstWidth(wrap, m) {
    const slots = wrap.querySelectorAll("tbody tr:first-child .outline-slot").length;
    const digits = String(Math.max(1, wrap.values.length));
    return Math.ceil(textWidth(digits, m.numberFont) + m.pad + (slots > 0 ? slots * 14 + 4 : 0) + 4);
  }

  // Draws the widths `px` into the table's `colgroup`, with the row numbers first. A column a
  // closed group hides has no `col`: its cells take no place in the row (`outline.js`). `room` is
  // the paper's width for tables (`printable`).
  function draw(wrap, px, room = printable()) {
    const table = wrap.querySelector("table");
    let cols = table.querySelector("colgroup");
    if (!cols) {
      cols = document.createElement("colgroup");
      table.insertBefore(cols, table.firstChild);
    }
    cols.textContent = "";
    const first = document.createElement("col");
    first.style.width = `${wrap.firstWidth}px`;
    cols.appendChild(first);
    let sum = 0;
    for (const p of px) {
      if (p === 0) continue;
      const col = document.createElement("col");
      col.style.width = `${p}px`;
      cols.appendChild(col);
      sum += p;
    }
    // Paper leaves the row numbers out, and takes the columns' width alone (`print.css`).
    table.style.width = `${wrap.firstWidth + sum}px`;
    table.style.setProperty("--columns-width", `${sum}px`);
    wrap.px = px;
    scale(wrap, sum, room);
  }

  // Lays a rendered table out: its columns' widths, then which cells cut their text. A table
  // is laid out once after it is drawn; its widths change only by an action, which draws it anew.
  function lay(wrap, room) {
    if (wrap.laid || !wrap.isConnected) return;
    wrap.laid = true;
    const m = metrics(wrap);
    wrap.metrics = m;
    wrap.firstWidth = firstWidth(wrap, m);
    draw(wrap, shown(wrap, m), room);
    spill(wrap);
  }

  // Marks each data cell whose text must stop at its own edge: a number, a date or an error, a
  // cell whose next column shows a value, and the last column's cells. Other text runs on over
  // the empty cells to its right, as a spreadsheet's does. A number or a date wider than its
  // column shows `###` instead, as in Excel: cut, 1200 would read as 120.
  // A cell centred across columns shows its value over the run `across` gives it instead.
  function spill(wrap) {
    const hidden = wrap.foldedColumns;
    const m = wrap.metrics;
    for (const tr of wrap.querySelector("tbody").rows) {
      unbox(tr);
      let before = null;
      for (let c = 0; c < wrap.names.length; c++) {
        if (hidden[c]) continue;
        const td = tr.cells[c + 1];
        const text = td.textContent;
        if (before) before.classList.toggle("clip", text !== "");
        const value = td.classList.contains("number") || td.classList.contains("date");
        td.classList.toggle("clip", value || ["error", "wrap"].some((k) => td.classList.contains(k)));
        const run = text !== "" && td.classList.contains("across") ? across(wrap, tr, c) : [];
        const width = [c, ...run].reduce((sum, k) => sum + wrap.px[k], 0) - m.pad;
        let narrow = false;
        if (value) {
          const size = td.style.fontSize;
          const font = size ? m.font.replace(/\d+(\.\d+)?px/, size) : m.font;
          narrow = textWidth(text, font) > width + 0.5;
          td.classList.toggle("narrow", narrow);
          if (narrow) td.style.setProperty("--cell-size", size || `${m.size}px`);
        }
        if (text !== "" && td.classList.contains("across") && !narrow &&
          !td.querySelector(".cell-input")) {
          const last = run.length > 0 ? run[run.length - 1] : c;
          box(td, run.map((k) => tr.cells[k + 1]), width, cutAfter(wrap, tr, last));
          c = last;
          before = null;
          continue;
        }
        before = td.classList.contains("clip") ? null : td;
      }
      if (before) before.classList.add("clip");
    }
  }

  // Centre across columns, as Excel's Center Across Selection: the columns after `c` whose cells
  // are `across` and empty, up to the first that is not. A hidden column is passed over.
  function across(wrap, tr, c) {
    const run = [];
    for (let k = c + 1; k < wrap.names.length; k++) {
      if (wrap.foldedColumns[k]) continue;
      const td = tr.cells[k + 1];
      if (!td.classList.contains("across") || td.textContent !== "") break;
      run.push(k);
    }
    return run;
  }

  // Whether a value wider than its run must stop at the run's end: where the next shown cell
  // holds a value, or the run ends the row. Otherwise it runs on as other text does.
  function cutAfter(wrap, tr, last) {
    for (let k = last + 1; k < wrap.names.length; k++) {
      if (!wrap.foldedColumns[k]) return tr.cells[k + 1].textContent !== "";
    }
    return true;
  }

  // Shows a cell's value in a box as wide as its run, centred, over the run's empty cells. The
  // lines between the run's cells go, as a merged cell's would; each cell can still be chosen.
  function box(td, cells, width, cut) {
    const holder = td.querySelector(":scope > .cell-fit") || td;
    const boxEl = document.createElement("span");
    boxEl.className = "across-box";
    boxEl.style.setProperty("--across-width", `${width}px`);
    boxEl.classList.toggle("cut", cut || td.classList.contains("wrap"));
    boxEl.append(...holder.childNodes);
    holder.appendChild(boxEl);
    td.classList.add("across-start");
    td.classList.remove("clip");
    for (const cell of cells) cell.classList.add("across-run");
  }

  // Takes a row's boxes away, so a table laid out again draws its runs anew.
  function unbox(tr) {
    for (const b of tr.querySelectorAll(".across-box")) b.replaceWith(...b.childNodes);
    for (const td of tr.querySelectorAll(".across-start, .across-run")) {
      td.classList.remove("across-start", "across-run");
    }
  }

  // Gives a rendered table its edges and its rows' heights: an edge at the right of each column
  // letter and at the bottom of each row number. A row with a height holds each cell's content in
  // a box that tall, which cuts what is taller.
  function decorate(wrap, heights) {
    const table = wrap.querySelector("table");
    for (const th of table.tHead.rows[0].cells) {
      if (!th.classList.contains("letter")) continue;
      const edge = document.createElement("span");
      edge.className = "col-edge";
      edge.dataset.edge = String(th.cellIndex - 1);
      edge.title = "Drag to change this column's width. Double-click to fit it to its text";
      th.appendChild(edge);
    }
    Array.from(table.tBodies[0].rows).forEach((tr, r) => {
      const edge = document.createElement("span");
      edge.className = "row-edge";
      edge.dataset.edge = String(r);
      edge.title = "Drag to change this row's height. Double-click to fit it to its lines";
      tr.cells[0].appendChild(edge);
      if (!(heights[r] > 0)) return;
      tr.classList.add("sized");
      tr.style.height = `${heights[r]}pt`;
      tr.style.setProperty("--row-height", `${heights[r]}pt`);
      for (const cell of tr.cells) {
        const box = document.createElement("div");
        box.className = "cell-fit";
        box.append(...Array.from(cell.childNodes).filter((n) => n !== edge));
        cell.insertBefore(box, cell.firstChild);
      }
    });
  }

  // The columns an edge's change reaches: where the chosen cells run through every data row of
  // their columns (Ctrl+A, the corner, or column letters) and the edge's column is one of them,
  // all of those columns, as in Excel; else that column alone. Rows likewise, across every column.
  function reach(block, rows, line) {
    const c = ks.cell;
    if (!c || c.block !== block || !ks.range.any()) return [line];
    const r = ks.range.rect();
    const wrap = ks.view.blocks()[block];
    const whole = rows ? r.c1 === 0 && r.c2 === wrap.colIds.length - 1
      : r.r1 <= 0 && r.r2 === wrap.rowIds.length - 1;
    const first = rows ? Math.max(0, r.r1) : r.c1;
    const last = rows ? r.r2 : r.c2;
    if (!whole || line < first || line > last) return [line];
    const out = [];
    for (let i = first; i <= last; i++) out.push(i);
    return out;
  }

  // Gives `columns` the width `chars` (0 to fit their text), keeping every other column's, as one
  // action. A width is kept in tenths of a character.
  function setWidths(block, columns, chars) {
    const wrap = ks.view.blocks()[block];
    const tenths = wrap.names.map((_, c) => wrap.widths[c] || 0);
    for (const c of columns) tenths[c] = Math.round(chars * 10);
    const text = tenths.map((t) => (t > 0 ? String(t / 10) : "")).join(",");
    return ks.act("ksmd_web_set_widths", block, ks.put(text));
  }

  // A column's width as the page shows it now, in characters.
  function charsOf(wrap, column) {
    if (wrap.widths[column] > 0) return wrap.widths[column] / 10;
    lay(wrap);
    return Math.round(((wrap.px[column] - wrap.metrics.pad) / wrap.metrics.ch) * 10) / 10;
  }

  const blockOf = (el) => ks.view.blocks().indexOf(el.closest(".table"));

  // Fits columns to their text, as a double-click on a column's edge does in Excel: each takes
  // the width of its widest value, or of its name, and keeps it.
  function fit(block, column) {
    const wrap = ks.view.blocks()[block];
    lay(wrap);
    const columns = reach(block, false, column);
    const tenths = wrap.names.map((_, c) => wrap.widths[c] || 0);
    for (const c of columns) {
      const chars = Math.ceil(textChars(wrap, c, wrap.metrics) * 10) / 10;
      tenths[c] = Math.round(clamp(Math.max(chars, 1), SIZE_LEAST, SIZE_MOST) * 10);
    }
    const text = tenths.map((t) => (t > 0 ? String(t / 10) : "")).join(",");
    return ks.act("ksmd_web_set_widths", block, ks.put(text));
  }

  // Column width…, as Excel's dialog: the chosen columns each take a width in characters, the
  // width of the digit 0 in the table's font. An empty answer lets them fit their text again.
  function askWidth(block) {
    const wrap = ks.view.blocks()[block];
    const r = ks.range.rect();
    const typed = window.prompt("Column width, in characters (0.5 to 255). Leave it empty to fit " +
      "the text", String(charsOf(wrap, r.c1)));
    if (typed === null) return null;
    const t = typed.trim();
    if (t !== "" && (!/^\d+(\.\d)?$/.test(t) || Number(t) < SIZE_LEAST || Number(t) > SIZE_MOST)) {
      ks.say("A column's width is 0.5 to 255 characters, such as 12 or 8.5, or empty to fit the text.");
      return null;
    }
    const columns = [];
    for (let c = r.c1; c <= r.c2; c++) columns.push(c);
    return setWidths(block, columns, t === "" ? 0 : Number(t));
  }

  // Alt+Right makes a cell's column one character wider, and Alt+Left one narrower.
  function widen(block, column, wider) {
    const wrap = ks.view.blocks()[block];
    const chars = clamp(Math.round(charsOf(wrap, column)) + (wider ? 1 : -1), 1, SIZE_MOST);
    return setWidths(block, [column], chars);
  }

  // Row height…, as Excel's dialog: the chosen rows take a height in points, the unit of a font's
  // size, and text taller than it is cut. An empty answer lets them fit their lines again. The
  // names row takes the height its text needs. Rows a filter or a closed group hides keep theirs,
  // as Excel changes only the rows it shows.
  function askHeight(block) {
    const r = ks.range.rect();
    const wrap = ks.view.blocks()[block];
    const rows = [];
    const all = wrap.querySelector("tbody").rows;
    for (let row = Math.max(0, r.r1); row <= r.r2; row++) if (!all[row].hidden) rows.push(row);
    if (rows.length === 0) {
      ks.say("The names row takes the height its text needs. Choose data rows to give them a height.");
      return null;
    }
    const now = wrap.heights[rows[0]] || "";
    const typed = window.prompt("Row height, in points (6 to 409). Leave it empty to fit the lines",
      String(now));
    if (typed === null) return null;
    const t = typed.trim();
    if (t !== "" && (!/^\d+$/.test(t) || Number(t) < 6 || Number(t) > 409)) {
      ks.say("A row's height is a whole number of points from 6 to 409, or empty to fit its lines.");
      return null;
    }
    return ks.act("ksmd_web_set_heights", block, ks.put(rows.join(",")), t === "" ? 0 : Number(t));
  }

  // A drag of a column's edge shows the column's new width as the mouse moves, and takes it as one
  // action when the button is let go. A press that does not move changes nothing.
  function dragColumn(e, edge) {
    const wrap = edge.closest(".table");
    const block = blockOf(wrap);
    const column = Number(edge.dataset.edge);
    lay(wrap);
    const m = wrap.metrics;
    const start = wrap.px.slice();
    const x0 = e.clientX;
    const least = SIZE_LEAST * m.ch + m.pad;
    // The pointer moves in the window's pixels, and the widths are the document's, before its zoom.
    const zoom = ks.zoom.factor();
    const width = (x) => clamp(start[column] + (x - x0) / zoom, least, SIZE_MOST * m.ch + m.pad);
    wrap.classList.add("resizing");
    const move = (mv) => {
      const px = start.slice();
      px[column] = width(mv.clientX);
      draw(wrap, px);
      ks.say(`Width: ${Math.round(((px[column] - m.pad) / m.ch) * 10) / 10} characters`);
    };
    const up = (u) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      wrap.classList.remove("resizing");
      if (u.clientX === x0) return draw(wrap, start);
      const chars = clamp(Math.round(((width(u.clientX) - m.pad) / m.ch) * 10) / 10, SIZE_LEAST, SIZE_MOST);
      return setWidths(block, reach(block, false, column), chars);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // A drag of a row's edge shows a line where the row's new bottom stands, with its height, and
  // takes the height as one action when the button is let go.
  function dragRow(e, edge) {
    const wrap = edge.closest(".table");
    const block = blockOf(wrap);
    const row = Number(edge.dataset.edge);
    const tr = edge.closest("tr");
    const top = tr.getBoundingClientRect().top;
    const y0 = e.clientY;
    // The pointer moves in the window's pixels, and the guide and the height are the document's.
    const zoom = ks.zoom.factor();
    const points = (y) => clamp(Math.round(((y - top) / zoom) * 0.75), 6, 409);
    const guide = document.createElement("div");
    guide.className = "row-guide";
    wrap.appendChild(guide);
    const show = (y) => {
      const p = points(y);
      guide.style.top = `${(top - wrap.getBoundingClientRect().top) / zoom + p / 0.75}px`;
      guide.dataset.height = `${p} pt`;
    };
    show(tr.getBoundingClientRect().bottom);
    const move = (mv) => show(mv.clientY);
    const up = (u) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      guide.remove();
      if (u.clientY === y0) return null;
      const rows = reach(block, true, row);
      return ks.act("ksmd_web_set_heights", block, ks.put(rows.join(",")), points(u.clientY));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // The column whose right border a press on a cell or a letter stands on, within a few pixels;
  // -1 when none.
  function borderAt(e, el) {
    const r = el.getBoundingClientRect();
    const column = el.classList.contains("letter") ? el.cellIndex - 1 : Number(el.dataset.c);
    if (e.clientX >= r.right - 5) return column;
    if (e.clientX <= r.left + 5) return column - 1;
    return -1;
  }

  // The edges take the press before the table does, so it chooses no cell.
  ks.root.addEventListener("mousedown", (e) => {
    if (!e.target.closest || e.target.closest(".include") || e.button !== 0 || ks.readOnly) return;
    const col = e.target.closest(".col-edge");
    const row = e.target.closest(".row-edge");
    const bordered = !col && !row && e.detail >= 2 && e.target.closest(".table [data-r], .table th.letter");
    const column = bordered ? borderAt(e, bordered) : -1;
    if (!col && !row && column < 0) return;
    e.preventDefault();
    e.stopPropagation();
    ks.table.take();
    if (column >= 0) return fit(blockOf(bordered), column);
    if (col && e.detail >= 2) return fit(blockOf(col), Number(col.dataset.edge));
    if (col) return dragColumn(e, col);
    const block = blockOf(row);
    if (e.detail >= 2) return ks.act("ksmd_web_set_heights", block, ks.put(reach(block, true, Number(row.dataset.edge)).join(",")), 0);
    return dragRow(e, row);
  }, true);

  // The width a page of the document's paper leaves for a table, in CSS pixels: the room inside
  // the print's margins (`ks.pages.paper`), less the document's own padding.
  // Caution: **Read it once for all the tables.** It reads the layout, and a print scale written
  // to a table before the next read makes the browser lay out the whole document again.
  function printable() {
    const doc = getComputedStyle(ks.root);
    return ks.pages.paper().width - parseFloat(doc.paddingLeft) - parseFloat(doc.paddingRight);
  }

  // A table wider than the paper prints smaller, so all of its columns fit. The status bar says so
  // while the person works in it (`status.js`). Paper leaves out the row numbers, so only the
  // columns count.
  function scale(wrap, columns, room) {
    const by = columns > room ? Math.floor((100 * room) / columns) : 100;
    wrap.style.setProperty("--print-zoom", String(by / 100));
    wrap.printScale = by;
  }

  // Lays out every table not yet laid out, then sets each table's print scale for the paper the
  // document names now.
  function layAll() {
    const room = printable();
    for (const wrap of ks.root.querySelectorAll(".b.table")) {
      if (!wrap.laid) lay(wrap, room);
      else scale(wrap, wrap.px.reduce((a, x) => a + x, 0), room);
    }
  }

  // Before a print, the status line names the tables that print smaller.
  window.addEventListener("beforeprint", () => {
    const small = Array.from(ks.root.querySelectorAll(".b.table:not(.print-hidden)"))
      .filter((w) => w.printScale < 100).map((w) => `${w.dataset.name} at ${w.printScale}%`);
    if (small.length > 0) ks.say(`Printed smaller to fit the paper: ${small.join(", ")}.`);
  });

  ks.handle("column-fit", (_, c) => fit(c.block, c.column), { table: true, repeat: true });
  ks.handle("column-width", (_, c) => askWidth(c.block), { table: true });
  ks.handle("row-height", (_, c) => askHeight(c.block), { table: true });

  ks.sizes = { decorate, layAll, widen };
}
