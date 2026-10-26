// ksmd page: a range of chosen cells, and what acts on it. The range runs from the chosen cell
// (`ks.cell`) to a far corner. Shift+click, Shift and an arrow key, and a press on a row number or a
// column letter choose one; Shift there reaches from the chosen cell.
// The range keeps to the identities of its rows and columns, as a formula's range does, so it stays
// on its cells when the table is shown again, sorted, or has rows added above.
// Delete clears the range, Ctrl+D fills it down and Ctrl+R right, and the handle at its corner
// fills it by a drag. A copy puts its shown values on the clipboard as tab-separated rows, and a
// paste of such rows fills cells from its corner. Each is one action.
"use strict";

function ksmdRange(ks) {
  // The far corner, { row, column } in the chosen cell's table, or null for that cell alone.
  let end = null;
  // The range by identities: { u, a, f, at }, `a` and `f` as [row id, column id] (-1 for the
  // names), and `at` the chosen cell it was taken for.
  let kept = null;

  const wrapOf = (block) => {
    const el = ks.view.blocks()[block];
    return el && el.classList.contains("table") ? el : null;
  };
  // A cell's element by its place, through the table's rows: a range can hold a whole column.
  const find = (block, row, column) => {
    const wrap = wrapOf(block);
    const t = wrap && wrap.querySelector("table");
    const tr = t && (row < 0 ? t.tHead.rows[1] : t.tBodies[0].rows[row]);
    return tr ? tr.cells[column + 1] || null : null;
  };
  // The elements marked now, so marking again clears only them.
  let marked = [];
  const size = (block) => {
    const wrap = wrapOf(block);
    return { rows: wrap.rowIds.length, columns: wrap.colIds.length };
  };

  // The rectangle a look, a copy, a paste or a fill acts on: the range, or the chosen cell.
  function rect() {
    const c = ks.cell;
    const e = end || c;
    return { block: c.block, r1: Math.min(c.row, e.row), c1: Math.min(c.column, e.column),
      r2: Math.max(c.row, e.row), c2: Math.max(c.column, e.column) };
  }

  function keep() {
    const c = ks.cell;
    const wrap = c && wrapOf(c.block);
    if (!wrap) {
      kept = null;
      return;
    }
    const id = (row, column) => [row < 0 ? -1 : wrap.rowIds[row], wrap.colIds[column]];
    kept = { u: wrap.u, a: id(c.row, c.column), f: end ? id(end.row, end.column) : null,
      at: { block: c.block, row: c.row, column: c.column } };
  }

  // After the page shows an action's result: the range finds its rows and columns again.
  function follow() {
    const c = ks.cell;
    const same = c && kept && c.block === kept.at.block && c.row === kept.at.row &&
      c.column === kept.at.column;
    if (same) {
      const block = ks.view.blocks().findIndex((el) => el.classList.contains("table") && el.u === kept.u);
      const wrap = block >= 0 ? ks.view.blocks()[block] : null;
      const place = (id) => {
        const row = id[0] < 0 ? -1 : wrap.rowIds.indexOf(id[0]);
        const column = wrap.colIds.indexOf(id[1]);
        return (id[0] >= 0 && row < 0) || column < 0 ? null : { row, column };
      };
      const a = wrap && place(kept.a);
      if (a) {
        ks.cell = { block, row: a.row, column: a.column };
        end = kept.f ? place(kept.f) : null;
      } else {
        end = null;
      }
      // A table that went, as an undo of its insert takes it, holds no chosen cell.
      if (!wrap) ks.cell = null;
    } else if (!c) {
      end = null;
    }
    keep();
    mark();
    // In a table with no cell open, the keys go to the chosen cell. An action that showed the
    // table again took the focus away with the old cell. A focus elsewhere, as in the find bar,
    // stays.
    const focused = document.activeElement;
    if (ks.inTable() && !ks.table.editing() &&
      (!focused || focused === document.body || focused === ks.root)) {
      focusChosen();
    }
  }
  ks.rendered.push(follow);
  // The marks show only while the person works in the table.
  ks.placeHooks.push(mark);

  // Marks the range's cells and the chosen one, and puts the fill handle at the range's corner.
  function mark() {
    if (ks.figures) ks.figures.update();
    for (const el of marked) {
      if (el.classList.contains("fill-handle")) el.remove();
      else el.classList.remove("in-range", "chosen", "corner");
    }
    marked = [];
    const c = ks.cell;
    if (!c || !wrapOf(c.block) || ks.where !== "cell") return;
    const r = rect();
    if (end) {
      for (let row = r.r1; row <= r.r2; row++) {
        for (let column = r.c1; column <= r.c2; column++) {
          const el = find(r.block, row, column);
          if (!el) continue;
          el.classList.add("in-range");
          marked.push(el);
        }
      }
    }
    const open = ks.table.editing();
    const chosen = find(c.block, c.row, c.column);
    if (chosen && !open) {
      chosen.classList.add("chosen");
      marked.push(chosen);
    }
    const corner = find(r.block, r.r2, r.c2);
    if (corner && r.r1 >= 0) handle(corner);
  }

  // Sets the range: the chosen cell, and the far corner or null.
  function set(block, row, column, to) {
    ks.cell = { block, row, column };
    ks.setPlace("cell");
    end = to && (to.row !== row || to.column !== column) ? to : null;
    keep();
    mark();
  }

  // The chosen cell alone again; a cell opened or chosen calls it.
  function collapse() {
    end = null;
    keep();
    mark();
  }

  function focusChosen() {
    const c = ks.cell;
    const el = c && find(c.block, c.row, c.column);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  // Reaches from the chosen cell to another, as Shift+click does.
  function reach(row, column) {
    const c = ks.cell;
    set(c.block, c.row, c.column, { row, column });
    focusChosen();
  }

  // Moves the far corner one step, as Shift and an arrow key do, from the cell at `from`.
  function extend(from, dr, dc) {
    if (!ks.cell || ks.cell.block !== from.block || ks.cell.row !== from.row ||
      ks.cell.column !== from.column) {
      set(from.block, from.row, from.column, null);
    }
    const s = size(from.block);
    const e = end || { row: from.row, column: from.column };
    const row = Math.max(-1, Math.min(s.rows - 1, e.row + dr));
    const column = Math.max(0, Math.min(s.columns - 1, e.column + dc));
    set(from.block, ks.cell.row, ks.cell.column, { row, column });
    focusChosen();
  }

  // A drag across cells chooses the range from the cell pressed to the cell under the pointer, as
  // in a spreadsheet. The press opens its cell as before; once the drag reaches another cell, that
  // cell closes unchanged and the range follows the pointer until the button comes up.
  let dragFrom = null;
  ks.root.addEventListener("mousedown", (e) => {
    const el = e.target.closest && e.target.closest(".table [data-r]");
    dragFrom = null;
    if (!el || e.button !== 0 || e.shiftKey || e.detail > 1 || el.closest(".include")) return;
    const block = ks.view.blocks().indexOf(el.closest(".table"));
    dragFrom = { block, row: Number(el.dataset.r), column: Number(el.dataset.c) };
  }, true);
  document.addEventListener("mousemove", (e) => {
    if (!dragFrom || (e.buttons & 1) === 0) return;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const el = under && under.closest && under.closest(".table [data-r]");
    if (!el || ks.view.blocks().indexOf(el.closest(".table")) !== dragFrom.block) return;
    const row = Number(el.dataset.r);
    const column = Number(el.dataset.c);
    const e0 = end || { row: dragFrom.row, column: dragFrom.column };
    if (row === e0.row && column === e0.column && end === null &&
      row === dragFrom.row && column === dragFrom.column) return;
    e.preventDefault();
    if (ks.table.editing()) ks.table.take();
    set(dragFrom.block, dragFrom.row, dragFrom.column, { row, column });
  });
  document.addEventListener("mouseup", () => {
    if (dragFrom && end) focusChosen();
    dragFrom = null;
  });

  // A press on a row number chooses the row, and one on a column letter the column's data cells.
  // With Shift, the range reaches from the chosen cell's row or column.
  ks.root.addEventListener("mousedown", (e) => {
    if (!e.target.closest || e.target.closest(".include") || e.button !== 0) return;
    if (e.target.closest(".col-edge") || e.detail > 1) return;
    const head = e.target.closest(".table th.row-number, .table th.letter");
    if (!head) return;
    e.preventDefault();
    ks.table.take();
    const wrap = head.closest(".table");
    const block = ks.view.blocks().indexOf(wrap);
    const s = size(block);
    const was = e.shiftKey && ks.cell && ks.cell.block === block ? ks.cell : null;
    if (head.classList.contains("row-number")) {
      const row = head.parentElement.sectionRowIndex;
      set(block, was ? Math.max(0, was.row) : row, 0, { row, column: s.columns - 1 });
    } else {
      const column = head.cellIndex - 1;
      if (s.rows === 0) return;
      set(block, 0, was ? was.column : column, { row: s.rows - 1, column });
    }
    focusChosen();
  });

  // The keys on a chosen cell that is not open: the range, Delete, the fills, undo, and opening a
  // cell.
  ks.root.addEventListener("keydown", (e) => {
    const el = e.target;
    if (!el.matches || !el.matches(".table [data-r]") || el.closest(".include") || !ks.cell) return;
    if (e.isComposing || e.keyCode === 229) return;
    const c = ks.cell;
    const mod = e.ctrlKey || e.metaKey;
    const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (steps[e.key] && e.shiftKey && !mod && !e.altKey) {
      e.preventDefault();
      extend(c, ...steps[e.key]);
    } else if (steps[e.key] && !mod && !e.altKey) {
      e.preventDefault();
      collapse();
      const [dr, dc] = steps[e.key];
      ks.table.choose(c.block, dr ? ks.table.step(c.block, c.row, dr) : c.row, Math.max(0, c.column + dc));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      clear();
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Enter moves down and Tab right, Shift back, as in a spreadsheet; F2 opens the cell.
      e.preventDefault();
      collapse();
      const back = e.shiftKey ? -1 : 1;
      if (e.key === "Enter") ks.table.choose(c.block, ks.table.step(c.block, c.row, back), c.column);
      else ks.table.choose(c.block, c.row, Math.max(0, c.column + back));
    } else if (mod && !e.altKey && (e.key === ";" || e.key === ":")) {
      // Today's date or the time, typed into the cell as an open one takes it; Enter keeps it.
      e.preventDefault();
      collapse();
      const now = ks.now(e.key === ":");
      ks.table.openWith(c.block, c.row, c.column, now, now.length, now.length);
    } else if (e.key === "F2") {
      e.preventDefault();
      collapse();
      ks.table.open(c.block, c.row, c.column);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (end) collapse();
      else ks.leaveTable();
    } else if (mod && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      // Undo and redo, as in the text: the focus stands on the cell, not in the document.
      e.preventDefault();
      ks.command(e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
    } else if (e.key.length === 1 && !mod && !e.altKey) {
      // Typing on a chosen cell opens it, and the key's text replaces its value, as in a
      // spreadsheet.
      collapse();
      ks.table.open(c.block, c.row, c.column, true);
    }
  });

  // Clears every cell of the range as one action; each cell keeps its look.
  function clear() {
    const r = rect();
    const rows = Array.from({ length: r.r2 - r.r1 + 1 }, () => new Array(r.c2 - r.c1 + 1).fill(""));
    return ks.act("ksmd_web_paste_cells", r.block, r.r1, r.c1, ks.put(JSON.stringify(rows)));
  }

  // Fill down copies the range's top row into the rest, and fill right its left column. A range
  // of one row fills down from the cell above it, and one of one column right from the left.
  function fill(down) {
    if (!ks.cell || !wrapOf(ks.cell.block)) return null;
    ks.table.take();
    const r = rect();
    const r1 = Math.max(0, r.r1);
    let top = r1;
    let left = r.c1;
    if (down && r1 === r.r2) top -= 1;
    if (!down && r.c1 === r.c2) left -= 1;
    if (top < 0 || left < 0 || r.r2 < 0) {
      ks.say(down ? "Fill down copies a cell above the chosen ones. Choose cells below a value." :
        "Fill right copies a cell left of the chosen ones. Choose cells right of a value.");
      return null;
    }
    return ks.act("ksmd_web_fill", r.block, top, left, down ? 1 : r.r2 - top + 1,
      down ? r.c2 - left + 1 : 1, r.r2, r.c2, 0);
  }

  // The square at the range's lower right corner. A drag down or right fills the cells it reaches
  // with the range's cells, repeated, as one action.
  // It stands in the corner cell, so placing it reads no layout.
  function handle(corner) {
    const box = document.createElement("span");
    box.className = "fill-handle";
    box.contentEditable = "false";
    box.title = "Drag down or right to fill the cells with these";
    box.addEventListener("mousedown", drag);
    corner.classList.add("corner");
    corner.appendChild(box);
    marked.push(corner, box);
  }

  function drag(e) {
    e.preventDefault();
    e.stopPropagation();
    ks.table.take();
    const from = rect();
    const anchor = { block: from.block, row: from.r1, column: from.c1 };
    let to = null;
    const move = (m) => {
      const el = document.elementFromPoint(m.clientX, m.clientY);
      const cell = el && el.closest && el.closest(".table td[data-r]");
      if (!cell || ks.view.blocks().indexOf(cell.closest(".table")) !== from.block) return;
      const row = Number(cell.dataset.r);
      const column = Number(cell.dataset.c);
      const down = row - from.r2;
      const right = column - from.c2;
      to = down > 0 && down >= right ? { row, column: from.c2 } :
        right > 0 ? { row: from.r2, column } : null;
      set(anchor.block, anchor.row, anchor.column, to || { row: from.r2, column: from.c2 });
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      if (!to) return;
      ks.act("ksmd_web_fill", from.block, from.r1, from.c1, from.r2 - from.r1 + 1,
        from.c2 - from.c1 + 1, to.row, to.column, 1);
      focusChosen();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  // Rows of cells from text copied out of a spreadsheet: a tab between cells, a line break
  // between rows, and quotes around a cell holding either, a quote doubled inside them. Null for
  // text that is one value alone.
  function grid(text) {
    const body = text.replace(/\r?\n$/, "");
    if (!/[\t\n]/.test(body)) return null;
    const rows = [];
    let row = [];
    let field = "";
    let start = true;
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (start && c === '"') {
        let j = i + 1;
        let quoted = "";
        for (; j < body.length; j++) {
          if (body[j] === '"') {
            if (body[j + 1] === '"') {
              quoted += '"';
              j++;
            } else break;
          } else quoted += body[j];
        }
        field = quoted;
        i = j;
        start = false;
      } else if (c === "\t") {
        row.push(field);
        field = "";
        start = true;
      } else if (c === "\n" || (c === "\r" && body[i + 1] === "\n")) {
        if (c === "\r") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        start = true;
      } else {
        field += c;
        start = false;
      }
    }
    row.push(field);
    rows.push(row);
    return rows;
  }

  // Pastes copied text at the range: a grid fills cells from its corner, and with `single`, one
  // value fills every cell of the range. One action; false when there is nothing to paste.
  function pasteGrid(text, single) {
    if (!ks.cell) return false;
    let g = grid(text);
    const r = rect();
    if (!g && single) {
      const value = text.replace(/\r?\n$/, "");
      g = Array.from({ length: r.r2 - r.r1 + 1 }, () => new Array(r.c2 - r.c1 + 1).fill(value));
    }
    if (!g) return false;
    ks.table.take();
    ks.act("ksmd_web_paste_cells", r.block, r.r1, r.c1, ks.put(JSON.stringify(g)));
    return true;
  }

  // The range's shown values as tab-separated rows, as a spreadsheet takes them from the clipboard.
  function copied() {
    const r = rect();
    const wrap = wrapOf(r.block);
    const field = (t) => (/[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
    const lines = [];
    for (let row = r.r1; row <= r.r2; row++) {
      const cells = [];
      for (let column = r.c1; column <= r.c2; column++) {
        // A copy takes the number as calculated, not as its format shows it, so no digit is lost.
        const v = row < 0 ? null : wrap.values[row][column].slice(0, 2);
        cells.push(field(v ? ks.filter.shown(v) : wrap.names[column]));
      }
      lines.push(cells.join("\t"));
    }
    return `${lines.join("\r\n")}\r\n`;
  }

  // A copy while a range is chosen, or no cell is open, takes the cells' shown values; a cut
  // clears them after.
  for (const type of ["copy", "cut"]) {
    document.addEventListener(type, (e) => {
      if (ks.where !== "cell" || !ks.cell || !wrapOf(ks.cell.block)) return;
      if (e.target && e.target.nodeType === Node.ELEMENT_NODE && !ks.root.contains(e.target)) return;
      if (ks.table.editing() && !end) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", copied());
      if (type === "cut") clear();
    });
  }

  // A paste on a chosen cell that is not open fills the range.
  ks.root.addEventListener("paste", (e) => {
    if (!e.target.matches || !e.target.matches(".table [data-r]") || e.target.closest(".include")) return;
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    pasteGrid(text, true);
  });

  ks.range = { rect, set, collapse, reach, extend, fill, clear, grid, pasteGrid, mark,
    // Puts the focus on the chosen cell, so the keys act on it.
    focus: focusChosen,
    // Whether a range of more than one cell is chosen.
    any: () => !!end };
}
