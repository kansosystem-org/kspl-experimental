// ksmd page: the start. It loads the editor's wasm, calls its actions, and gives the host an API:
// `load(source)` opens a document's source, and `source()` returns the canonical source to save.
// The editor holds the document, its selection and its history; this script only shows them.
// Served by the local server, the page opens and saves files itself (`file.js`).
// Caution: **Call every action through `ks.act`.** It is the one place that applies a result, and
// that stops the page when the editor's memory runs out (`ksmd_js_gave_up`).
"use strict";

function ksmdStart(root, bar, status, wasmBytes) {
  const enc = new TextEncoder();
  // Caution: **Keep a BOM**: the default decoder drops one at the start of the text.
  const dec = new TextDecoder("utf-8", { ignoreBOM: true });
  let mem = null;
  class GaveUp extends Error {}

  const imports = {
    env: {
      // Called when the editor stops for want of memory. **It must throw**: a freestanding panic
      // that returns would spin for ever and freeze the page.
      ksmd_js_gave_up(ptr, len) {
        throw new GaveUp(dec.decode(new Uint8Array(mem.buffer, ptr, len)));
      },
    },
  };

  return WebAssembly.instantiate(wasmBytes, imports).then((made) => {
    const w = made.instance.exports;
    mem = w.memory;
    // `changed` and `rendered` hold what runs after an action changed the document, or showed one.
    const ks = { root, bar, w, enc, composing: null, stopped: false, sel: null, cell: null,
      changed: [], rendered: [] };

    // Writes text, or byte arrays one after another, into the editor's input buffer, and returns
    // the length in bytes. **Make the view after asking for the buffer**: memory can move when it
    // grows.
    ks.put = (text) => ks.putBytes(enc.encode(text));
    ks.putBytes = (...parts) => {
      const len = parts.reduce((n, p) => n + p.length, 0);
      let at = w.ksmd_web_in(Math.max(len, 1));
      for (const p of parts) {
        new Uint8Array(mem.buffer, at, p.length).set(p);
        at += p.length;
      }
      return len;
    };
    ks.out = (len) => (len > 0 ? dec.decode(new Uint8Array(mem.buffer, w.ksmd_web_out_ptr(), len)) : "");
    ks.say = (text) => {
      status.textContent = text;
    };

    function stop(why) {
      ks.stopped = true;
      root.contentEditable = "false";
      ks.say(`The editor stopped: ${why}. Copy what you need, then open the document again.`);
    }

    // Runs one action and shows its result; returns the result, or null when the page stopped.
    ks.act = (name, ...args) => {
      if (ks.stopped) return null;
      let r;
      try {
        r = JSON.parse(ks.out(w[name](...args)));
      } catch (e) {
        if (!(e instanceof GaveUp)) throw e;
        stop(e.message);
        return null;
      }
      ks.view.apply(r);
      for (const f of ks.rendered) f();
      // A table that went takes the place with it, and the person works in the text again.
      if (ks.where === "cell" && !ks.inTable()) ks.setPlace("text");
      ks.view.showSelection(r.sel);
      ks.sel = r.sel;
      ks.say(r.ok ? "" : r.why);
      // The menu and the ribbon each hold Undo and Redo.
      for (const el of document.querySelectorAll('[data-cmd="undo"]')) el.disabled = r.undo !== 1;
      for (const el of document.querySelectorAll('[data-cmd="redo"]')) el.disabled = r.redo !== 1;
      if (r.changed === 1) {
        for (const f of ks.changed) f();
        if (api.onchange) api.onchange();
      }
      return r;
    };

    ks.select = (a, f) => {
      w.ksmd_web_select(a[0], a[1], a[2], a[3], f[0], f[1], f[2], f[3]);
    };
    // Tells the editor where the page's selection stands.
    ks.sync = () => {
      const s = window.getSelection();
      if (s.rangeCount === 0) return;
      const a = ks.view.spotAt(s.anchorNode, s.anchorOffset);
      const f = ks.view.spotAt(s.focusNode, s.focusOffset);
      if (a && f) ks.select(a, f);
    };
    // Puts the caret on a spot, such as a gap, or the selection from one spot to another, in the
    // text, and shows it there. It leaves a table.
    ks.place = (a, f = a) => {
      ks.setPlace("text");
      ks.select(a, f);
      return ks.act("ksmd_web_selection");
    };
    ks.cellText = (block, row, column) => ks.out(w.ksmd_web_cell_text(block, row, column));
    // Today's date as 2026-10-23, or the time now as 14:05: what Ctrl+; and Ctrl+: type, as in
    // Excel. The form is ISO 8601's, which reads the same in every country and sorts as text.
    ks.now = (time) => {
      const d = new Date();
      const two = (n) => String(n).padStart(2, "0");
      return time ? `${two(d.getHours())}:${two(d.getMinutes())}` :
        `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    };

    // Where the person worked last: "text" or "cell". A look, a paste and the ribbon's table
    // group follow it.
    ks.where = "text";
    ks.placeHooks = [];
    ks.setPlace = (where) => {
      if (ks.where === where) return;
      ks.where = where;
      for (const f of ks.placeHooks) f();
    };
    // Whether the person works in a table: a cell or a range chosen there, or a cell open. The
    // page then draws no caret in the text, so no gap stands beside the table to move it.
    ks.inTable = () => {
      const el = ks.where === "cell" && ks.cell && ks.view.blocks()[ks.cell.block];
      return !!el && el.classList.contains("table");
    };
    // Leaves the table for the text: the caret shows again at the model's selection.
    ks.leaveTable = () => {
      ks.setPlace("text");
      ks.root.focus();
      if (ks.sel) ks.view.showSelection(ks.sel);
    };
    // The header's height, under which a table's frozen heading and a heading scrolled to stand.
    const top = document.querySelector(".top");
    if (top && window.ResizeObserver) {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty("--top-height", `${top.offsetHeight}px`);
      }).observe(top);
    }
    ksmdView(ks);
    ksmdTable(ks);
    ksmdRange(ks);
    ksmdFilter(ks);
    ksmdInput(ks);
    ksmdCommands(ks);
    ksmdMenus(ks);
    ksmdRibbon(ks);
    ksmdFind(ks);
    ksmdContents(ks);

    const api = {
      // Opens a document's source, as text or as bytes; on refusal the open document stays, and
      // `line` and `column` name the place.
      load(source) {
        ks.table.take();
        let opened;
        // The date it opens on is what `today()` gives until the next document opens.
        const d = new Date();
        try {
          opened = w.ksmd_web_load(typeof source === "string" ? ks.put(source) : ks.putBytes(source),
            d.getFullYear(), d.getMonth() + 1, d.getDate());
        } catch (e) {
          if (!(e instanceof GaveUp)) throw e;
          w.ksmd_web_recover();
          return { ok: false, why: "This document is too large for the editor's memory." };
        }
        const said = JSON.parse(ks.out(w.ksmd_web_out_len()));
        if (opened !== 1) {
          // A refusal for want of memory names no place.
          const at = said.line ? `line ${said.line}, column ${said.column}: ` : "";
          ks.say(`This document cannot be opened: ${at}${said.why}`);
          return said;
        }
        ks.root.textContent = "";
        ks.cell = null;
        ks.setPlace("text");
        // Showing a large document can use up the memory too; the page then says it stopped.
        if (!ks.act("ksmd_web_render")) {
          return { ok: false, why: "The editor's memory ran out while it showed this document." };
        }
        ks.say("");
        return said;
      },
      // The canonical source of the open document, as a save writes it.
      source() {
        ks.flush();
        ks.table.take();
        return ks.out(w.ksmd_web_source());
      },
      // The most bytes one source can hold: an open reads no more, and a save writes no more.
      sourceLimit() {
        return w.ksmd_web_source_limit();
      },
      // The model's selection: { a, f, g } as spots and the gap's kind.
      selection() {
        return ks.sel;
      },
      // Set by a host to learn that the document changed.
      onchange: null,
    };
    api.load("%ksmd 1\n");
    // Each call that hands a file to the editor can run out of memory as an action can.
    ks.call = (name, ...args) => {
      try {
        return w[name](...args);
      } catch (e) {
        if (!(e instanceof GaveUp)) throw e;
        stop(e.message);
        return 0;
      }
    };
    ks.files = ksmdFiles(ks, api);
    return api;
  });
}

// The menus' and the keyboard's commands, by name.
function ksmdCommands(ks) {
  const kinds = { p: [0, 0, 0], c: [2, 0, 0], bullets: [3, 0, 0], numbers: [3, 0, 1] };
  for (let n = 1; n <= 6; n++) kinds[`h${n}`] = [1, n, 0];
  const marks = { emphasis: 0, strong: 1, code: 2 };
  const rows = { "row-above": [0, 0], "row-below": [0, 1], "row-remove": [1, 0] };
  const columns = { "column-left": [2, 0], "column-right": [2, 1], "column-remove": [3, 0] };
  // The commands that act on the chosen cell's table.
  const aligns = { "align-left": "left", "align-center": "center", "align-right": "right",
    "align-none": "" };
  const onTable = new Set([...Object.keys(rows), ...Object.keys(columns), "column-fit", "sort-up",
    "sort-down", "filter-column", "filter-value", "filter-clear", "table-rename", "table-remove",
    ...TABLE_GROUPS.find(([group]) => group === "Number format")[1].map(([cmd]) => cmd),
    "fill-down", "fill-right"]);

  ks.command = (name) => {
    ks.flush();
    ks.table.take();
    if (name === "undo") return ks.act("ksmd_web_undo");
    if (name === "find" || name === "replace") return ks.find.open(name === "replace");
    if (name === "contents") return ks.contents.toggle();
    if (name === "redo") return ks.act("ksmd_web_redo");
    if (onTable.has(name)) return tableCommand(name);
    if (name in aligns) return ks.applyLook("align", aligns[name]);
    if (name === "look-clear") return ks.applyLook("all", "");
    ks.sync();
    if (name in kinds) return ks.act("ksmd_web_kind", ...kinds[name]);
    if (name in marks) return ks.act("ksmd_web_mark", marks[name], 0);
    if (name === "indent" || name === "outdent") return ks.act("ksmd_web_indent", name === "indent" ? 1 : 0);
    if (name === "date" || name === "time") return ks.act("ksmd_web_type", ks.put(ks.now(name === "time")), 0);
    if (name === "link") {
      const to = window.prompt("Link to an https:, http: or mailto: address, or a #place", "https://");
      if (to === null) return null;
      return ks.act("ksmd_web_mark", 3, ks.put(to.trim()));
    }
    if (name === "table") {
      const r = ks.act("ksmd_web_insert_table", 3, 2);
      if (r && r.ok) ks.table.editFirst(r.from + (r.blocks[0] && r.blocks[0].k === "t" ? 0 : 1));
      return r;
    }
    return null;
  };

  // Sets one part of a look, or clears it with an empty value: on the chosen cells where a cell
  // was worked in last, or else on the selected text and, for alignment, its paragraphs.
  const parts = { color: 0, fill: 1, size: 2, align: 3, all: 4 };
  ks.applyLook = (part, value) => {
    ks.flush();
    if (ks.where === "cell" && chosen()) {
      const r = ks.table.range();
      ks.table.take();
      return ks.act("ksmd_web_cell_look", r.block, r.r1, r.c1, r.r2, r.c2, parts[part], ks.put(value));
    }
    ks.sync();
    if (part === "align") return ks.act("ksmd_web_align", ks.put(value));
    return ks.act("ksmd_web_text_look", parts[part], ks.put(value));
  };

  // The chosen cell, while its table still stands where it was chosen.
  const chosen = () => {
    const c = ks.cell;
    const el = c && ks.view.blocks()[c.block];
    return el && el.classList.contains("table") ? c : null;
  };

  // Enables only the table commands that can act now, so no item is pressed for nothing.
  ks.enableTable = () => {
    const c = chosen();
    for (const el of document.querySelectorAll(".menu [data-cmd], .ribbon [data-cmd]")) {
      const name = el.dataset.cmd;
      if (!onTable.has(name)) continue;
      el.disabled = !c || (name === "filter-clear" && !ks.filter.on(c.block)) ||
        ((name === "filter-value" || name.startsWith("row-")) && c.row < 0);
    }
  };

  function tableCommand(name) {
    const c = chosen();
    if (!c) {
      ks.say("Choose a cell of the table first.");
      return null;
    }
    switch (name) {
      case "table-remove":
        ks.cell = null;
        ks.root.focus();
        return ks.act("ksmd_web_remove_table", c.block);
      case "table-rename":
        return ks.table.rename(c.block);
      case "column-fit":
        return ks.table.fit(c.block, c.column);
      case "sort-up":
      case "sort-down":
        return ks.act("ksmd_web_sort", c.block, c.column, name === "sort-down" ? 1 : 0);
      case "filter-column":
        return ks.filter.open(c.block, c.column);
      case "filter-value":
        return ks.filter.only(c.block, c.row, c.column);
      case "filter-clear":
        return ks.filter.clearAll(c.block);
      case "fill-down":
      case "fill-right":
        return ks.range.fill(name === "fill-down");
      default:
        if (name.startsWith("format-")) return ks.table.format(c.block, name);
        break;
    }
    if (name in rows) {
      // A new row is empty, so a filter would hide it at once; the filter goes first.
      if (name !== "row-remove" && ks.filter.on(c.block)) {
        ks.filter.clearAll(c.block);
        const r = ks.act("ksmd_web_table_edit", c.block, rows[name][0], Math.max(c.row, 0) + rows[name][1]);
        if (r && r.ok) ks.say("All rows are shown again, so the new row can be seen.");
        return r;
      }
      const [what, after] = rows[name];
      return ks.act("ksmd_web_table_edit", c.block, what, Math.max(c.row, 0) + after);
    }
    const [what, after] = columns[name];
    return ks.act("ksmd_web_table_edit", c.block, what, c.column + after);
  }
}
