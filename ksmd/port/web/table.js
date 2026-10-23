// ksmd page: tables. A table shows calculated values; a cell opened to edit shows what was typed in
// it (its formula, number or text), and the value is calculated again once the edit is taken.
// A table is not editable text: the document's selection stops at its edges, and a cell edits in
// an input of its own. Arrow keys past the first or last row leave the table for the gap there.
// Dragging the edge between two column letters, or Alt+Left and Alt+Right in a cell, resizes the
// columns: the table's widths change in one step, and its cells do not change.
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
      el.textContent = value.length > 1 ? (value[0] === 1 ? shown(value[1]) : value[1]) : "";
    }
    return el;
  }

  function render(b) {
    const wrap = document.createElement("div");
    wrap.className = "b table";
    wrap.contentEditable = "false";
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
    const input = document.createElement("input");
    input.className = "cell-input";
    input.setAttribute("aria-label", row < 0 ? `Name of column ${letters(column)}` :
      `Cell ${letters(column)}${row + 1}`);
    input.title = "Alt+Right makes this column wider, and Alt+Left narrower";
    input.value = ks.cellText(block, row, column);
    open = { block, row, column, input, before: input.value, shown: el.textContent };
    el.textContent = "";
    el.appendChild(input);
    input.addEventListener("keydown", keys);
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
      if (el) el.textContent = o.shown;
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
    let to = null;
    if (e.key === "Enter") to = [row + 1, column];
    else if (e.key === "Tab") to = [row, column + (e.shiftKey ? -1 : 1)];
    else if (e.key === "ArrowUp") to = [row - 1, column];
    else if (e.key === "ArrowDown") to = [row + 1, column];
    else if (e.key === "Escape") {
      open.input.value = open.before;
      take();
      ks.root.focus();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    take();
    moveTo(block, to[0], to[1]);
  }

  function rename(button) {
    const block = blockOf(button);
    const name = window.prompt("Table name: a lowercase letter, then lowercase letters, digits and _",
      button.textContent);
    if (name !== null && name !== button.textContent) {
      ks.act("ksmd_web_rename_table", block, ks.put(name.trim()));
    }
  }

  // A cell opens on the press, not on the click. A press moves the document's caret out of its
  // gap, which can shift the table, so the button would come up elsewhere and no click would come.
  ks.root.addEventListener("mousedown", (e) => {
    // A table shown from an included file edits in that file's own tab.
    if (!e.target.closest || e.target.closest(".include")) return;
    const edge = e.target.closest(".col-edge");
    if (edge) return drag(e, edge);
    const el = e.target.closest(".table [data-r]");
    if (el && !el.querySelector("input")) {
      e.preventDefault();
      edit(el);
    }
  });

  ks.root.addEventListener("click", (e) => {
    if (!e.target.closest || e.target.closest(".include")) return;
    const name = e.target.closest(".table-name");
    if (name) rename(name);
  });

  ks.table = {
    render,
    take,
    // Whether an event belongs to a cell's own input rather than to the document.
    owns: (target) => !!(target && target.closest && target.closest(".table")),
    // Opens the first name of a new table to edit.
    editFirst: (block) => {
      const el = find(block, -1, 0);
      if (el) edit(el);
    },
  };
}
