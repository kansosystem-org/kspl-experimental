// ksmd page: the open cell. A cell opened to edit shows what was typed in it (its formula, number
// or text) in a box of its own, or in the formula bar's box (`bar.js`); the value is calculated
// again once the edit is taken. The box's keys move to the next cell, as a spreadsheet's do, and
// Alt+Enter types a line break inside it. Drawing a table again keeps the open box (`redrawn`).
// **This file alone keeps the open cell.** `table.js` makes it once and reaches it through what it
// gives back; the chosen cell stays with `table.js`, set here through `chooseCell`.
"use strict";

// `table` gives what this file needs of the table: `letters`, `blockOf`, `size`, `find`,
// `stepRow`, `stepColumn`, `chooseCell` and `choose`.
function ksmdCellBox(ks, table) {
  // The cell being edited: { block, row, column, input, before } or null.
  let open = null;

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
    const m = ks.el(boxKind(el), "cell-input cell-mirror");
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

  // Chooses a cell, or with `opening` opens it to edit, as a spreadsheet's double-click or F2 does,
  // the caret at the end. With `whole`, all of its text is selected, so what is typed replaces it.
  // With `typed`, the box that holds the chosen cell's focus becomes the input, keeping what was
  // typed or is being composed in it (`catcher` in `range.js`). With `composing`, an input
  // method's composition goes on in it.
  // With `bar`, the formula bar's box takes the edit, and the cell shows a copy of its text.
  function edit(el, opening = true, whole = false, typed = null, composing = false, bar = null) {
    if (open && homeOf(open).parentNode === el) return;
    // Caution: **A cell whose text the model refuses stays open, and no other cell opens.** Its box
    // stood on with nothing owning it: Esc did not drop it, and the draft did not hold its text.
    if (!take()) {
      open.input.focus();
      return;
    }
    const block = table.blockOf(el);
    const row = Number(el.dataset.r);
    const column = Number(el.dataset.c);
    table.chooseCell({ block, row, column });
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
    const where = row < 0 ? `Name of column ${table.letters(column)}` : `Cell ${table.letters(column)}${row + 1}`;
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
    // **An open cell takes the pasted text as it is**, line breaks and tabs included, as Excel's
    // cell does while it is edited. A chosen cell that is not open spreads rows over cells
    // (`range.js`). A one-line box (a column with choices) and a column's name hold no line
    // break, so there a grid from a spreadsheet still fills cells from this one.
    input.addEventListener("paste", (e) => {
      const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
      // Text a document cannot hold never goes in, not even as one value.
      if (ks.tooLarge(text)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (input.tagName === "TEXTAREA" && o.row >= 0) {
        e.preventDefault();
        e.stopPropagation();
        // A copied line or row ends with a line break, which is not part of its text.
        const body = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
        input.setRangeText(body, input.selectionStart, input.selectionEnd, "end");
        input.dispatchEvent(new Event("input"));
        fitLines(input);
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
    const el = table.find(o.block, o.row, o.column);
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
  // **`Ctrl`+`Z` right after gives back the formula as typed, whatever was added.** A missing `)`
  // is a step of its own, so the editor's undo gives the typed formula back. Text left open in
  // quotes runs over the cell's end, so the file cannot hold it, and the closed form went in as
  // one step. Its typed form is kept here instead (`unclose`), and the first `Ctrl`+`Z` opens
  // the cell again with it.
  let unclosed = null;
  ks.changed.push(() => {
    unclosed = null;
  });
  function closed(o) {
    const typed = o.input.value;
    const now = ks.cellText(o.block, o.row, o.column);
    if (o.row < 0 || !typed.startsWith("=") || now.length <= typed.length || !now.startsWith(typed)) return;
    const added = now.slice(typed.length);
    if (added.startsWith('"')) unclosed = { block: o.block, row: o.row, column: o.column, typed };
    ks.say(`Added ${added} at the end so the formula reads. Ctrl+Z takes it back.`);
  }
  // Undoes the closed form put in right before, and opens its cell with the formula as typed;
  // false where nothing was closed so, and the editor's own undo acts. `Esc` then leaves the
  // value the cell held before, as a second `Ctrl`+`Z` does after a missing `)`.
  function unclose() {
    const u = unclosed;
    if (!u || open || ks.readOnly) return false;
    const r = ks.act("ksmd_web_undo");
    const el = r && r.ok && table.find(u.block, u.row, u.column);
    if (!el) return true;
    edit(el);
    if (!open) return true;
    open.input.value = u.typed;
    open.input.setSelectionRange(u.typed.length, u.typed.length);
    fitLines(open.input);
    return true;
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
    const el = home.isConnected || block < 0 ? null : table.find(block, o.row, o.column);
    // A cell the drawing took away takes its box with it.
    if (block < 0 || (!home.isConnected && !el)) {
      open = null;
      ks.refs.detach();
      return;
    }
    const moved = block !== o.block;
    if (moved && ks.cell && ks.cell.block === o.block) table.chooseCell({ ...ks.cell, block });
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
    const s = table.size(block);
    if (row < -1) return leave(block, false);
    if (row >= s.rows) return leave(block, true);
    const el = table.find(block, row, Math.max(0, Math.min(s.columns - 1, column)));
    if (el) edit(el, opening, whole);
  }

  // Tab moves to the next column, and past a row's last to the next row's first, as in an Excel
  // table and a Word table; Shift+Tab goes back, and stops at the first cell. Tab past the last
  // cell adds a row and moves into it, as both do, so a list grows without the menu. One undo
  // takes the row away.
  function tab(block, row, column, back) {
    const by = back ? -1 : 1;
    const next = table.stepColumn(block, column, by);
    if (next !== column) return moveTo(block, row, next);
    const r = table.stepRow(block, row, by);
    const s = table.size(block);
    const start = table.stepColumn(block, back ? s.columns : -1, by);
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
    if (e.key === "Enter") to = [table.stepRow(block, row, e.shiftKey ? -1 : 1), column];
    else if (e.key === "ArrowUp") to = [table.stepRow(block, row, -1), column];
    else if (e.key === "ArrowDown") to = [table.stepRow(block, row, 1), column];
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
      const next = table.stepColumn(block, column, left ? -1 : 1);
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
      table.choose(block, row, column);
      ks.range.focus();
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    if (!take("focus")) return;
    moveTo(block, to[0], to[1]);
  }

  return {
    edit,
    take,
    unclose,
    moveTo,
    tab,
    redrawn,
    boxKind,
    // Whether a cell is open to edit.
    isOpen: () => !!open,
    openTyped: (box, composing = false) => {
      const el = box.parentElement;
      if (!el || ks.readOnly || (open && open.input === box)) return;
      ks.range.collapse();
      edit(el, true, false, box, composing);
    },
    inBar: (box) => {
      if (open) {
        if (open.input !== box && !open.mirror) toBar(box);
        return open.input === box;
      }
      const c = ks.cell;
      const el = c && table.find(c.block, c.row, c.column);
      if (ks.readOnly || !el || el.closest(".include") || ks.range.any() || ks.range.lines()) return false;
      edit(el, true, false, null, false, box);
      return !!open && open.input === box;
    },
    editing: () => (open ? { block: open.block, row: open.row, input: open.input, home: homeOf(open) } : null),
    pending: () => (open && open.input.value !== open.before ?
      { block: open.block, row: open.row, column: open.column, text: open.input.value } : null),
    hold: (on) => {
      if (open) open.held = on;
    },
    openWith: (block, row, column, text, from, to) => {
      moveTo(block, row, column, true);
      if (!open) return;
      open.input.value = text;
      open.input.setSelectionRange(from, to);
    },
    editFirst: (block) => {
      const el = table.find(block, -1, 0);
      if (el) edit(el, true, true);
    },
  };
}
