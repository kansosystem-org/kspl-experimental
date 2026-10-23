// ksmd page: tables. A table shows calculated values; a cell opened to edit shows what was typed in
// it (its formula, number or text), and the value is calculated again once the edit is taken.
// A table is not editable text: the document's selection stops at its edges, and a cell edits in
// an input of its own. Arrow keys past the first or last row leave the table for the gap there.
// Dragging the edge between two column letters, or Alt+Left and Alt+Right in a cell, resizes the
// columns: the table's widths change in one step, and its cells do not change. A double-click on a
// column's border fits that column to its widest value.
// Each name in the heading row carries the arrow that opens its column's filter (`filter.js`).
// Ctrl+; types today's date into a cell, and Ctrl+: the time, as Excel does.
// Shift+click, and Shift with an arrow key, choose a range of cells from the chosen one
// (`range.js`).
// A right-click on a cell, a row number or a column letter opens the table's menu (`menu.js`).
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

  // A number as a person reads it: at most 15 significant digits, as spreadsheets show them.
  const shown = (n) => String(Number(n.toPrecision(15)));

  function cellEl(tag, row, column, value) {
    const el = document.createElement(tag);
    el.dataset.r = String(row);
    el.dataset.c = String(column);
    el.tabIndex = -1;
    if (value) {
      if (value[0] === 1) el.className = "number";
      if (value[0] === 3) el.className = "error";
      // A number in a column with a number format comes with the text the format shows.
      el.textContent = value.length > 2 ? value[2] :
        value.length > 1 ? (value[0] === 1 ? shown(value[1]) : value[1]) : "";
    }
    return el;
  }

  function render(b) {
    const wrap = document.createElement("div");
    wrap.className = "b table";
    wrap.contentEditable = "false";
    wrap.dataset.name = b.name;
    // The table's place in the model, and its rows' and columns' identities, which a range keeps to.
    wrap.u = b.u;
    wrap.rowIds = b.ri;
    wrap.colIds = b.ci;
    wrap.values = b.rows;
    wrap.names = b.names;
    const name = document.createElement("button");
    name.type = "button";
    name.className = "table-name";
    name.textContent = b.name;
    name.title = "Rename the table";
    wrap.appendChild(name);
    const table = document.createElement("table");
    wrap.weights = b.w;
    if (b.w.length > 0) showWidths(table, b.w);
    const head = document.createElement("thead");
    const lettersRow = document.createElement("tr");
    const namesRow = document.createElement("tr");
    lettersRow.appendChild(document.createElement("th"));
    namesRow.appendChild(document.createElement("th"));
    b.names.forEach((n, c) => {
      const th = document.createElement("th");
      th.className = "letter";
      th.textContent = letters(c);
      if (c < b.names.length - 1) {
        const edge = document.createElement("span");
        edge.className = "col-edge";
        edge.dataset.edge = String(c);
        edge.title = "Drag to share the width of the two columns beside this edge anew";
        th.appendChild(edge);
      }
      lettersRow.appendChild(th);
      const name = cellEl("th", -1, c, [2, n]);
      name.className = "name";
      if (n === "") name.dataset.empty = "1";
      const arrow = document.createElement("button");
      arrow.type = "button";
      arrow.className = "filter-arrow";
      arrow.dataset.c = String(c);
      arrow.tabIndex = -1;
      arrow.title = "Sort and filter this column";
      arrow.setAttribute("aria-label", `Sort and filter column ${letters(c)}`);
      arrow.textContent = "\u25BE";
      name.appendChild(arrow);
      namesRow.appendChild(name);
    });
    head.appendChild(lettersRow);
    head.appendChild(namesRow);
    table.appendChild(head);
    const body = document.createElement("tbody");
    b.rows.forEach((row, r) => {
      const tr = document.createElement("tr");
      const number = document.createElement("th");
      number.className = "row-number";
      number.textContent = String(r + 1);
      tr.appendChild(number);
      row.forEach((value, c) => tr.appendChild(cellEl("td", r, c, value)));
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
    for (const [r, c, color, fill, size, align] of b.looks) {
      const el = wrap.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      if (color) el.style.color = color;
      if (fill) el.style.backgroundColor = fill;
      if (size) el.style.fontSize = `${size / 2}pt`;
      if (align) el.style.textAlign = align;
    }
    ks.filter.apply(wrap);
    return wrap;
  }

  // Shows weights as the columns' widths: each column takes its weight's share of the table.
  function showWidths(table, weights) {
    let cols = table.querySelector("colgroup");
    if (!cols) {
      cols = document.createElement("colgroup");
      table.insertBefore(cols, table.firstChild);
    }
    cols.textContent = "";
    cols.appendChild(document.createElement("col"));
    const sum = weights.reduce((a, x) => a + x, 0);
    for (const weight of weights) {
      const col = document.createElement("col");
      col.style.width = `${(100 * weight) / sum}%`;
      cols.appendChild(col);
    }
  }

  // The most a column's weight can be, as the reader takes it.
  const MAX_WEIGHT = 10000;
  // Each column's width on the page in pixels, read from the row of column letters.
  const pixels = (wrap) => Array.from(wrap.querySelector("table").tHead.rows[0].cells).slice(1)
    .map((th) => th.getBoundingClientRect().width);
  // A table's weights, or for a table without any, weights made from its columns on the page.
  function weightsOf(wrap, px) {
    if (wrap.weights.length > 0) return wrap.weights;
    const total = px.reduce((a, x) => a + x, 0);
    return px.map((p) => Math.max(1, Math.round((1000 * p) / total)));
  }

  // The weights after the edge right of column `left` moves `dx` pixels: the two columns beside it
  // share their width anew, and every other column keeps its weight. All weights are first
  // multiplied by one whole number, so the two columns have about 1,000 steps to share; the
  // writer divides the weights by their greatest common divisor again.
  function moved(base, px, left, dx) {
    const pair = base[left] + base[left + 1];
    const k = Math.max(1, Math.min(Math.floor(MAX_WEIGHT / Math.max(...base)), Math.ceil(1000 / pair)));
    const out = base.map((w) => w * k);
    const both = pair * k;
    const share = (px[left] + dx) / (px[left] + px[left + 1]);
    out[left] = Math.min(both - 1, MAX_WEIGHT, Math.max(1, both - MAX_WEIGHT, Math.round(both * share)));
    out[left + 1] = both - out[left];
    return out;
  }

  // Moves the edge right of column `left` by `dx` pixels, as one action.
  function resize(block, left, dx) {
    const wrap = ks.view.blocks()[block];
    const px = pixels(wrap);
    const weights = moved(weightsOf(wrap, px), px, left, dx);
    return ks.act("ksmd_web_set_widths", block, ks.put(weights.join(",")));
  }

  // Alt+Right makes a cell's column wider and Alt+Left narrower, by a twentieth of the table. The
  // width comes from the column on its right, or from the one on its left for the last column.
  function widen(block, column, wider) {
    const columns = size(block).columns;
    if (columns < 2) {
      ks.say("A table with one column takes the whole width.");
      return;
    }
    const last = column === columns - 1;
    const step = ks.view.blocks()[block].querySelector("table").getBoundingClientRect().width / 20;
    resize(block, last ? column - 1 : column, wider !== last ? step : -step);
  }

  // A drag of an edge shows the new widths as the mouse moves, and takes them as one action when
  // the button is let go. A press that does not move changes nothing.
  function drag(e, edge) {
    e.preventDefault();
    take();
    const wrap = edge.closest(".table");
    const block = blockOf(wrap);
    const left = Number(edge.dataset.edge);
    const px = pixels(wrap);
    const base = weightsOf(wrap, px);
    const table = wrap.querySelector("table");
    const x0 = e.clientX;
    wrap.classList.add("resizing");
    const move = (m) => showWidths(table, moved(base, px, left, m.clientX - x0));
    const up = (u) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      wrap.classList.remove("resizing");
      if (u.clientX !== x0) {
        ks.act("ksmd_web_set_widths", block, ks.put(moved(base, px, left, u.clientX - x0).join(",")));
      } else if (wrap.weights.length > 0) {
        showWidths(table, wrap.weights);
      } else {
        const cols = table.querySelector("colgroup");
        if (cols) cols.remove();
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

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

  // The cell being edited: { block, row, column, input, before } or null.
  let open = null;
  // The table and cell the row and column commands act on.
  ks.cell = null;

  function edit(el) {
    if (open && open.input.parentNode === el) return;
    take();
    const block = blockOf(el);
    const row = Number(el.dataset.r);
    const column = Number(el.dataset.c);
    ks.cell = { block, row, column };
    ks.setPlace("cell");
    const input = document.createElement("input");
    input.className = "cell-input";
    // An input asks for about 20 characters of width; given none, opening a cell moves no column.
    input.size = 1;
    input.setAttribute("aria-label", row < 0 ? `Name of column ${letters(column)}` :
      `Cell ${letters(column)}${row + 1}`);
    input.title = "Alt+Right makes this column wider, and Alt+Left narrower. Shift+F10 opens the table menu";
    input.value = ks.cellText(block, row, column);
    open = { block, row, column, input, before: input.value, nodes: Array.from(el.childNodes) };
    el.textContent = "";
    el.appendChild(input);
    input.addEventListener("keydown", keys);
    ks.range.collapse();
    // A grid from a spreadsheet fills cells from this one; one value goes into the input.
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
      if (!ks.range.grid(text)) return;
      e.preventDefault();
      // The paste renders the table again, which takes this input out of the page; the document's
      // own paste handler must not take the event a second time.
      e.stopPropagation();
      if (open && open.input === input) input.value = open.before;
      ks.range.pasteGrid(text, false);
    });
    // A blur of an input already closed, as a resize closes and opens its cell, takes nothing.
    input.addEventListener("blur", () => {
      if (open && open.input === input) take();
    });
    input.focus();
    // All of it is selected, so typing replaces the value, as a spreadsheet's cell does.
    input.select();
  }

  // Takes the open cell's text into the model; the table is then shown again with its values.
  function take() {
    if (!open) return;
    const o = open;
    open = null;
    if (o.input.value === o.before) {
      const el = o.input.parentNode;
      if (el) {
        el.textContent = "";
        el.append(...o.nodes);
        // The row kept in sight while it was edited goes, if the filter does not show it.
        ks.filter.apply(el.closest(".table"));
      }
      return;
    }
    ks.act("ksmd_web_set_cell", o.block, o.row, o.column, ks.put(o.input.value));
  }

  function moveTo(block, row, column) {
    const s = size(block);
    if (row < -1) return leave(block, false);
    if (row >= s.rows) return leave(block, true);
    const el = find(block, row, Math.max(0, Math.min(s.columns - 1, column)));
    if (el) edit(el);
  }

  // Leaves the table for the gap before or after it.
  function leave(block, after) {
    ks.root.focus();
    const b = block + (after ? 1 : 0);
    ks.place([1, b, 0, 0]);
  }

  function keys(e) {
    if (!open || e.isComposing) return;
    const { block, row, column } = open;
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // The cell stays open, so each press moves the edge one more step.
      e.preventDefault();
      take();
      widen(block, column, e.key === "ArrowRight");
      moveTo(block, row, column);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === ";" || e.key === ":")) {
      e.preventDefault();
      const input = open.input;
      input.setRangeText(ks.now(e.key === ":"), input.selectionStart, input.selectionEnd, "end");
      return;
    }
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = open.input.getBoundingClientRect();
      take();
      ks.menus.openContext(r.left, r.bottom);
      return;
    }
    const shifted = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (e.shiftKey && shifted[e.key] && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Shift and an arrow key choose a range from this cell, as in a spreadsheet. Left and Right
      // select text instead once the caret stands inside it.
      const input = open.input;
      const all = input.selectionStart === 0 && input.selectionEnd === input.value.length;
      if (shifted[e.key][1] === 0 || all) {
        e.preventDefault();
        take();
        ks.range.extend({ block, row, column }, ...shifted[e.key]);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "d" || e.key === "r")) {
      e.preventDefault();
      take();
      ks.range.fill(e.key === "d");
      return;
    }
    let to = null;
    if (e.key === "Enter") to = [stepRow(block, row, 1), column];
    else if (e.key === "Tab") to = [row, column + (e.shiftKey ? -1 : 1)];
    else if (e.key === "ArrowUp") to = [stepRow(block, row, -1), column];
    else if (e.key === "ArrowDown") to = [stepRow(block, row, 1), column];
    else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && !e.ctrlKey &&
      !e.metaKey && !e.altKey) {
      // The caret moves inside the text; at the text's edge, or with all of it selected, the
      // press moves to the next cell, as a spreadsheet's cell does.
      const input = open.input;
      const len = input.value.length;
      const all = input.selectionStart === 0 && input.selectionEnd === len;
      const left = e.key === "ArrowLeft";
      const edge = input.selectionStart === input.selectionEnd &&
        input.selectionStart === (left ? 0 : len);
      if (!all && !edge) return;
      const next = column + (left ? -1 : 1);
      e.preventDefault();
      if (next < 0 || next >= size(block).columns) return;
      to = [row, next];
    } else if (e.key === "Escape") {
      // The edit is dropped and the cell stays chosen, as in a spreadsheet; a second Esc leaves
      // the table.
      open.input.value = open.before;
      take();
      choose(block, row, column);
      ks.range.focus();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    take();
    moveTo(block, to[0], to[1]);
  }

  function rename(block) {
    const was = ks.view.blocks()[block].dataset.name;
    const name = window.prompt("Table name", was);
    if (name === null || name === was) return null;
    const r = ks.act("ksmd_web_rename_table", block, ks.put(name));
    // A filter keeps to its table under the new name.
    if (r && r.ok) {
      ks.filter.renamed(was, name);
      ks.filter.apply(ks.view.blocks()[block]);
    }
    return r;
  }

  // Sets the number format of the chosen columns as one step; a currency asks for its code.
  function format(block, name) {
    const r = ks.range.rect();
    const kinds = { "format-none": "", "format-number": "number:2", "format-grouped": "grouped:2",
      "format-percent": "percent:0" };
    if (name in kinds) return ks.act("ksmd_web_column_format", block, r.c1, r.c2, ks.put(kinds[name]));
    if (name === "format-more" || name === "format-fewer") {
      return ks.act("ksmd_web_column_places", block, r.c1, r.c2, name === "format-more" ? 1 : 0);
    }
    const code = window.prompt("Currency code, such as USD, EUR or JPY", "USD");
    if (code === null) return null;
    return ks.act("ksmd_web_column_currency", block, r.c1, r.c2, ks.put(code.trim().toUpperCase()));
  }

  // Fits a column to its widest value on one line: the other columns share what is left in the
  // proportions they have now, and the table keeps its width. It is one action, as a drag is.
  function fit(block, column) {
    const wrap = ks.view.blocks()[block];
    const px = pixels(wrap);
    if (px.length < 2) {
      ks.say("A table with one column takes the whole width.");
      return null;
    }
    const total = px.reduce((a, x) => a + x, 0);
    const cells = Array.from(wrap.querySelectorAll(`[data-c="${column}"]`));
    let widest = 0;
    for (const el of cells) {
      const probe = document.createElement("span");
      probe.className = "measure";
      probe.textContent = el.querySelector("input") ? el.querySelector("input").value : el.textContent;
      el.appendChild(probe);
      const style = getComputedStyle(el);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
        parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      widest = Math.max(widest, probe.getBoundingClientRect().width + pad + 2);
      probe.remove();
    }
    const least = 48;
    const width = Math.max(least, Math.min(widest, total - least * (px.length - 1)));
    const others = total - px[column];
    const out = px.map((p, c) => (c === column ? width : (p * (total - width)) / others));
    const weights = out.map((p) => Math.max(1, Math.round((1000 * p) / total)));
    return ks.act("ksmd_web_set_widths", block, ks.put(weights.join(",")));
  }

  // The column whose right border a press stands on, within a few pixels; -1 when none.
  function borderAt(e, el) {
    const r = el.getBoundingClientRect();
    const column = el.classList.contains("letter") ? el.cellIndex - 1 : Number(el.dataset.c);
    if (e.clientX >= r.right - 5) return column;
    if (e.clientX <= r.left + 5) return column - 1;
    return -1;
  }

  // Marks the cell the table commands act on, while no cell is open.
  function choose(block, row, column) {
    ks.range.set(block, row, column, null);
  }

  // A cell opens on the press, not on the click. A press moves the document's caret out of its
  // gap, which can shift the table, so the button would come up elsewhere and no click would come.
  ks.root.addEventListener("mousedown", (e) => {
    // A table shown from an included file edits in that file's own tab.
    if (!e.target.closest || e.target.closest(".include")) return;
    const edge = e.target.closest(".col-edge");
    if (edge && e.detail >= 2) {
      e.preventDefault();
      return fit(blockOf(edge), Number(edge.dataset.edge));
    }
    if (edge) return drag(e, edge);
    const bordered = e.target.closest(".table [data-r], .table th.letter");
    if (bordered && e.detail >= 2 && e.button === 0) {
      const column = borderAt(e, bordered);
      if (column >= 0) {
        e.preventDefault();
        take();
        return fit(blockOf(bordered), column);
      }
    }
    const el = e.target.closest(".table [data-r]");
    // Shift+click reaches from the chosen cell to this one, as a range.
    if (el && e.shiftKey && ks.cell && ks.cell.block === blockOf(el)) {
      e.preventDefault();
      take();
      ks.range.reach(Number(el.dataset.r), Number(el.dataset.c));
      return;
    }
    if (el && !el.querySelector("input")) {
      e.preventDefault();
      edit(el);
    }
  });

  ks.root.addEventListener("click", (e) => {
    if (!e.target.closest || e.target.closest(".include")) return;
    const name = e.target.closest(".table-name");
    if (name) rename(blockOf(name));
  });

  // A right-click on a cell, a row number or a column letter chooses that place and opens the
  // table's menu there.
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
    choose(block, row, column);
    ks.menus.openContext(e.clientX, e.clientY);
  });

  ks.table = {
    render,
    take,
    letters,
    rename,
    format,
    fit,
    range: () => ks.range.rect(),
    // Opens a cell, or leaves the table past its first or last row.
    open: moveTo,
    // The cell being edited, whose row a filter keeps in sight: { block, row } or null.
    editing: () => (open ? { block: open.block, row: open.row } : null),
    // Whether an event belongs to a cell's own input rather than to the document.
    owns: (target) => !!(target && target.closest && target.closest(".table")),
    // Opens the first name of a new table to edit.
    editFirst: (block) => {
      const el = find(block, -1, 0);
      if (el) edit(el);
    },
  };
}
