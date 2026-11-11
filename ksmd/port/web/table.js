// ksmd page: tables. A table shows calculated values; a cell opened to edit shows what was typed in
// it (its formula, number or text), and the value is calculated again once the edit is taken.
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
    const wrap = document.createElement("div");
    wrap.className = "b table";
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
      const cap = document.createElement("div");
      cap.className = "table-caption";
      cap.textContent = b.cap;
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
      const th = document.createElement("th");
      th.className = "letter";
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
      const number = document.createElement("th");
      number.className = "row-number";
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
  function pin() {
    const wraps = Array.from(ks.root.querySelectorAll(".b.table"));
    const zoom = ks.zoom ? ks.zoom.factor() : 1;
    const widths = wraps.map((wrap) => {
      const corner = wrap.querySelector("thead tr:first-child > th:first-child");
      return corner ? corner.getBoundingClientRect().width / zoom : 0;
    });
    wraps.forEach((wrap, i) => wrap.style.setProperty("--first-left", `${widths[i]}px`));
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
  // The next column a person sees from `column`, one way, passing over a hidden group's columns;
  // the column itself where none shows that way.
  function stepColumn(block, column, by) {
    const wrap = ks.view.blocks()[block];
    const hidden = wrap.foldedColumns || [];
    let c = column + by;
    while (c >= 0 && c < hidden.length && hidden[c]) c += by;
    return c < 0 || c >= size(block).columns ? column : c;
  }

  // The cell being edited: { block, row, column, input, before } or null.
  let open = null;
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

  // Chooses a cell, or with `opening` opens it to edit, as a spreadsheet's double-click or F2 does,
  // the caret at the end. With `whole`, all of its text is selected, so what is typed replaces it.
  // With `typed`, the box that holds the chosen cell's focus becomes the input, keeping what was
  // typed or is being composed in it (`catcher` in `range.js`). With `composing`, an input
  // method's composition goes on in it.
  // The element a cell's box is: an input where its column has choices, else a text area.
  function boxKind(el) {
    const wrap = el.closest(".table");
    const list = Number(el.dataset.r) >= 0 && wrap && wrap.choices && wrap.choices[Number(el.dataset.c)];
    return list && list.length > 0 ? "input" : "textarea";
  }
  // A cell's box as tall as its text, the lines its column's width breaks it into counted too.
  // Caution: **Count what shows, not the line breaks.** A box as tall as its breaks scrolled a
  // wrapped line out of sight above the caret, so the first line seemed gone.
  function fitLines(input) {
    if (input.tagName !== "TEXTAREA") return;
    input.rows = 1;
    input.style.height = "auto";
    if (!input.isConnected) return;
    input.style.height = `${input.scrollHeight + input.offsetHeight - input.clientHeight}px`;
  }

  // A cell's box while the formula bar holds its edit: a copy of the bar's text that takes no keys,
  // so the cell keeps the size and the place it has while it is edited in itself (`bar.js`).
  function mirrorOf(el, text) {
    const m = document.createElement(boxKind(el));
    m.className = "cell-input cell-mirror";
    m.readOnly = true;
    m.tabIndex = -1;
    m.setAttribute("aria-hidden", "true");
    if (m.tagName === "TEXTAREA") m.cols = 1;
    else m.size = 1;
    m.value = text;
    return m;
  }
  // What stands in the open cell: its own box, or the copy of the formula bar's box.
  const homeOf = (o) => o.mirror || o.input;

  // With `bar`, the formula bar's box takes the edit, and the cell shows a copy of its text.
  function edit(el, opening = true, whole = false, typed = null, composing = false, bar = null) {
    if (open && homeOf(open).parentNode === el) return;
    // Caution: **A cell whose text the model refuses stays open, and no other cell opens.** Its box
    // stood on with nothing owning it: Esc did not drop it, and the draft did not hold its text.
    if (!take()) {
      open.input.focus();
      return;
    }
    const block = blockOf(el);
    const row = Number(el.dataset.r);
    const column = Number(el.dataset.c);
    chooseCell({ block, row, column });
    ks.setPlace("cell");
    // A chosen cell takes keys, copies and a range's sum; read-only only ever chooses.
    if (ks.readOnly || !opening) {
      ks.range.collapse();
      ks.range.focus();
      return;
    }
    // A text area, so a cell's line breaks stay while it is edited; Alt+Enter types one. A column
    // with choices takes one line, and keeps an input, which alone offers a list as one types.
    const input = bar || typed || document.createElement(boxKind(el));
    const where = row < 0 ? `Name of column ${letters(column)}` : `Cell ${letters(column)}${row + 1}`;
    if (!bar) {
      input.className = "cell-input";
      // A box asks for about 20 characters of width; given one, opening a cell moves no column.
      if (input.tagName === "TEXTAREA") input.cols = 1;
      else input.size = 1;
      input.title = "Alt+Right makes this column wider, and Alt+Left narrower. Shift+F10 opens the table menu";
    }
    input.readOnly = false;
    input.setAttribute("aria-label", bar ? `Formula bar, ${where}` : where);
    const before = ks.cellText(block, row, column);
    // The bar's box shows the text already; writing it again would move the caret pressed into it.
    if (!typed && input.value !== before) input.value = before;
    // **Two modes, as Excel's.** Typing into a chosen cell enters it: an arrow key takes the text
    // and moves to the next cell. A double-click or F2 edits it: the arrow keys move the caret
    // inside the text, and F2 turns entering into editing. The formula bar always edits.
    const entering = !bar && (!!typed || whole);
    const mirror = bar ? mirrorOf(el, before) : null;
    open = { block, row, column, input, before, entering, mirror,
      nodes: Array.from(el.childNodes).filter((n) => n !== input) };
    // Caution: **Leave a typed box where it stands.** Moved, it loses the focus, and an input
    // method its composition.
    for (const n of open.nodes) n.remove();
    if (mirror) el.appendChild(mirror);
    else if (!typed) el.appendChild(input);
    serve(open, el, composing);
    ks.range.collapse();
    if (typed || bar) return;
    input.focus();
    if (whole) input.select();
    else input.setSelectionRange(input.value.length, input.value.length);
  }

  // Gives the open edit's box its keys and its help: the cell's own box, or the formula bar's.
  // Each box is served once, when the edit comes to it, and dropped when the edit ends.
  function serve(o, el, composing = false) {
    const input = o.input;
    const fit = () => {
      fitLines(input);
      if (o.mirror) {
        o.mirror.value = input.value;
        fitLines(o.mirror);
      }
    };
    fit();
    input.addEventListener("input", fit);
    // The list of functions takes its keys first, while it is open, so this cell's keys stay as
    // they are whenever it is closed.
    if (o.row >= 0) ks.suggest.attach(input);
    // A formula's references show in colour while it is typed (`refs.js`).
    if (o.row >= 0) ks.refs.attach(input, o.block, composing);
    input.addEventListener("keydown", keys);
    if (o.row >= 0) ks.choices.attach(el.closest(".table"), o.column, input);
    // A grid from a spreadsheet fills cells from this one; one value goes into the input.
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
      // Text a document cannot hold never goes in, not even as one value.
      if (ks.tooLarge(text)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (!ks.range.grid(text)) return;
      e.preventDefault();
      // The paste renders the table again, which takes this input out of the page; the document's
      // own paste handler must not take the event a second time.
      e.stopPropagation();
      if (open && open.input === input) input.value = open.before;
      // Cells copied in ksmd keep their formulas (`paste.js`).
      if (!ks.pasting.paste(e.clipboardData, text)) ks.range.pasteGrid(text, false);
    });
    // A blur of an input already closed, as a resize closes and opens its cell, takes nothing. A
    // value the model refuses stays: the person may have only pressed a menu or a dialog. A cell
    // held for the Insert Function dialog stays open (`catalog.js`).
    // A blur while the table is drawn again takes nothing either: the box comes back (`redrawn`).
    input.addEventListener("blur", () => {
      if (open && open.input === input && !open.held && !carrying && document.activeElement !== input) {
        take();
      }
    });
  }

  // Moves the edit open in a cell into the formula bar's `box`, with its text: the cell's own box
  // becomes the copy, and takes no more keys.
  function toBar(box) {
    const o = open;
    const was = o.input;
    ks.refs.detach();
    was.readOnly = true;
    was.tabIndex = -1;
    was.classList.add("cell-mirror");
    was.setAttribute("aria-hidden", "true");
    box.value = was.value;
    o.mirror = was;
    o.input = box;
    o.entering = false;
    o.held = false;
    box.readOnly = false;
    box.setAttribute("aria-label", `Formula bar, ${was.getAttribute("aria-label")}`);
    serve(o, was.parentNode);
  }

  // Takes the open cell's text into the model; the table is then shown again with its values.
  // **A value the model refuses stays open in its cell**, so the draft holds it, and the result is
  // false. The input stands as it is, where the focus may have gone elsewhere. With "focus", the
  // cell opens again with the text and the focus. An input that left the page takes nothing.
  function take(keep = "") {
    if (!open) return true;
    const o = open;
    open = null;
    ks.refs.detach();
    // Puts the cell's own content back in place of its box.
    const shut = () => {
      const el = homeOf(o).parentNode;
      if (!el) return;
      el.textContent = "";
      el.append(...o.nodes);
      // The row kept in sight while it was edited goes, if the filter does not show it.
      ks.filter.apply(el.closest(".table"));
    };
    if (o.input.value === o.before) {
      shut();
      return true;
    }
    const r = ks.act("ksmd_web_set_cell", o.block, o.row, o.column, ks.put(o.input.value));
    if (r && r.ok) closed(o);
    // Caution: **A table whose values did not change is not drawn again**, as `=1+2` typed over a
    // 3 leaves it. Its box then stood on in the cell, and the next cell opened beside it.
    if (r && r.ok && homeOf(o).isConnected) shut();
    if (!r || r.ok) return true;
    if (keep !== "focus") {
      if (!homeOf(o).isConnected) return true;
      open = o;
      if (o.row >= 0) ks.refs.attach(o.input, o.block);
      return false;
    }
    const el = find(o.block, o.row, o.column);
    if (el) {
      // The cell's own content goes back first, so Esc in the box opened next puts it back
      // rather than the refused box.
      if (homeOf(o).parentNode === el) homeOf(o).replaceWith(...o.nodes);
      edit(el);
      open.input.value = o.input.value;
    }
    ks.say(r.why);
    return false;
  }

  // Says what the editor added to close a formula just taken (`close_formula` in
  // `ksmd/edit/editor_tables.kspl`), so the person knows why the cell holds more than they typed.
  function closed(o) {
    const typed = o.input.value;
    const now = ks.cellText(o.block, o.row, o.column);
    if (o.row < 0 || !typed.startsWith("=") || now.length <= typed.length || !now.startsWith(typed)) return;
    ks.say(`Added ${now.slice(typed.length)} at the end so the formula reads. Ctrl+Z takes it back.`);
  }

  // Whether the page is drawing the open cell's table again (`redrawn`).
  let carrying = false;
  // Runs `draw`, which shows tables again, and puts the open cell's box, with its text, caret and
  // focus, into the same cell of the table drawn again.
  // **A table drawn again while a cell is open keeps what is being typed.** The answers of a
  // document's own functions arrive while a person may be typing in a cell (`functions.js`), and
  // the box went with the old table: the keys typed so far were lost, and the next key opened the
  // cell afresh.
  function redrawn(draw) {
    if (!open) return draw();
    const o = open;
    // **The open cell's table is found again by what it is, not by its place**: a block drawn
    // before it, such as a pasted image, moves it down.
    const home = homeOf(o);
    const was = home.closest(".table");
    const focused = document.activeElement === o.input;
    const { selectionStart: from, selectionEnd: to, selectionDirection: way } = o.input;
    carrying = true;
    try {
      draw();
    } finally {
      carrying = false;
    }
    if (open !== o) return;
    const blocks = ks.view.blocks();
    const wrap = home.isConnected ? home.closest(".table") :
      blocks.find((b) => was && b.u === was.u && b.classList.contains("table") && !b.included);
    const block = wrap ? blocks.indexOf(wrap) : -1;
    const el = home.isConnected || block < 0 ? null : find(block, o.row, o.column);
    // A cell the drawing took away takes its box with it.
    if (block < 0 || (!home.isConnected && !el)) {
      open = null;
      ks.refs.detach();
      return;
    }
    const moved = block !== o.block;
    if (moved && cell && cell.block === o.block) cell = { ...cell, block };
    o.block = block;
    if (home.isConnected) {
      if (moved && o.row >= 0) ks.refs.attach(o.input, o.block);
      return;
    }
    o.nodes = Array.from(el.childNodes);
    for (const n of o.nodes) n.remove();
    el.appendChild(home);
    fitLines(home);
    if (o.row >= 0) ks.refs.attach(o.input, o.block);
    // The formula bar is never drawn again, so its box keeps its focus and its caret.
    if (!focused || o.mirror) return;
    o.input.focus({ preventScroll: true });
    o.input.setSelectionRange(from, to, way);
  }

  function moveTo(block, row, column, opening = false, whole = false) {
    const s = size(block);
    if (row < -1) return leave(block, false);
    if (row >= s.rows) return leave(block, true);
    const el = find(block, row, Math.max(0, Math.min(s.columns - 1, column)));
    if (el) edit(el, opening, whole);
  }

  // Tab moves to the next column, and past a row's last to the next row's first, as in an Excel
  // table and a Word table; Shift+Tab goes back, and stops at the first cell. Tab past the last
  // cell adds a row and moves into it, as both do, so a list grows without the menu. One undo
  // takes the row away.
  function tab(block, row, column, back) {
    const by = back ? -1 : 1;
    const next = stepColumn(block, column, by);
    if (next !== column) return moveTo(block, row, next);
    const r = stepRow(block, row, by);
    const s = size(block);
    const start = stepColumn(block, back ? s.columns : -1, by);
    if (r < -1) return null;
    if (r < s.rows) return moveTo(block, r, start);
    const added = ks.act("ksmd_web_table_edit", block, 0, s.rows, 1, ks.put(""));
    if (!added || !added.ok) return null;
    return moveTo(block, s.rows, start);
  }

  // Leaves the table for the text after it, or before it (`select_beside` in
  // `ksmd/edit/editor.kspl`), and scrolls only as far as the caret needs.
  // Caution: **Focus the document without a scroll.** A focused document jumps to its top.
  function leave(block, after) {
    ks.root.focus({ preventScroll: true });
    ks.setPlace("text");
    ks.act("ksmd_web_select_beside", block, after ? 1 : 0);
    ks.view.caretIntoSight();
  }

  function keys(e) {
    if (!open || e.isComposing) return;
    const { block, row, column } = open;
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // The cell stays open, so each press moves the edge one more step.
      e.preventDefault();
      take();
      ks.sizes.widen(block, column, e.key === "ArrowRight");
      moveTo(block, row, column, true);
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
    if (e.key === "F2" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open.entering = false;
      return;
    }
    const arrow = e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" ||
      e.key === "ArrowRight";
    // Editing, an arrow key, with Shift or Ctrl or neither, works on the text alone; Alt keeps its own.
    if (arrow && !open.entering && !e.altKey) return;
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
    let to = null;
    // Alt+Enter types a line break inside the cell, as in a spreadsheet; Enter moves down.
    if (e.key === "Enter" && e.altKey && !e.ctrlKey && !e.metaKey && open.input.tagName === "TEXTAREA") {
      e.preventDefault();
      const input = open.input;
      input.setRangeText("\n", input.selectionStart, input.selectionEnd, "end");
      fitLines(input);
      return;
    }
    // Shift+Enter takes the text and moves up, as Shift+Tab moves left, as in Excel.
    if (e.key === "Tab") {
      e.preventDefault();
      if (take("focus")) tab(block, row, column, e.shiftKey);
      return;
    }
    if (e.key === "Enter") to = [stepRow(block, row, e.shiftKey ? -1 : 1), column];
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
      const next = stepColumn(block, column, left ? -1 : 1);
      e.preventDefault();
      if (next === column) return;
      to = [row, next];
    } else if (e.key === "Escape" || (open.entering && (e.ctrlKey || e.metaKey) && !e.altKey &&
      !e.shiftKey && e.key.toLowerCase() === "z")) {
      // The edit is dropped and the cell stays chosen, as in a spreadsheet; a second Esc leaves
      // the table. Ctrl+Z in a cell typed into does the same: the box held nothing before the
      // first key, so the browser's own undo emptied the cell rather than giving its value back.
      open.input.value = open.before;
      take();
      choose(block, row, column);
      ks.range.focus();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    if (!take("focus")) return;
    moveTo(block, to[0], to[1]);
  }

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
    if (e.detail >= 2 && e.button === 0 && pressed && !open) {
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
    letters,
    range: () => ks.range.rect(),
    // Opens a cell to edit, or leaves the table past its first or last row; with `whole`, what is
    // typed replaces its text.
    open: (block, row, column, whole = false) => moveTo(block, row, column, true, whole),
    // Opens the chosen cell with what was typed or is being composed in the box over it.
    openTyped: (box, composing = false) => {
      const el = box.parentElement;
      if (!el || ks.readOnly || (open && open.input === box)) return;
      ks.range.collapse();
      edit(el, true, false, box, composing);
    },
    // Gives the edit of the chosen cell to the formula bar's `box`: an edit open in the cell moves
    // there with its text, or the cell opens there. False where the cell cannot be edited: none or
    // a range is chosen, the page is read-only, or the table is shown from an included file.
    inBar: (box) => {
      if (open) {
        if (open.input !== box && !open.mirror) toBar(box);
        return open.input === box;
      }
      const el = cell && find(cell.block, cell.row, cell.column);
      if (ks.readOnly || !el || el.closest(".include") || ks.range.any() || ks.range.lines()) return false;
      edit(el, true, false, null, false, box);
      return !!open && open.input === box;
    },
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
    boxKind,
    describe,
    // The column `dc` steps from `column`, passing over the columns a group hides.
    stepColumn: (block, column, dc) => stepColumn(block, column, dc),
    // The cell being edited, whose row a filter keeps in sight: { block, row, input } or null.
    // `home` is what stands in the cell: the box itself, or the copy of the formula bar's box.
    editing: () => (open ? { block: open.block, row: open.row, input: open.input, home: homeOf(open) } : null),
    redrawn,
    // The open cell's text where it differs from the cell's own, not yet taken into the
    // document: { block, row, column, text } or null.
    pending: () => (open && open.input.value !== open.before ?
      { block: open.block, row: open.row, column: open.column, text: open.input.value } : null),
    // Whether an event belongs to a cell's own input rather than to the document.
    owns: (target) => !!(target && target.closest && target.closest(".table")),
    // Keeps the open cell open while the focus is elsewhere, or lets it be taken again on a blur.
    hold: (on) => {
      if (open) open.held = on;
    },
    // Opens a cell with text typed in and part of it selected, as AutoSum leaves its formula.
    openWith: (block, row, column, text, from, to) => {
      moveTo(block, row, column, true);
      if (!open) return;
      open.input.value = text;
      open.input.setSelectionRange(from, to);
    },
    // Opens the first name of a new table to edit.
    editFirst: (block) => {
      const el = find(block, -1, 0);
      if (el) edit(el, true, true);
    },
  };
}
