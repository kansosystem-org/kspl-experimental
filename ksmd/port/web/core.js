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
      ks.sel = r.sel;
      ks.say(r.ok ? "" : r.why);
      bar.querySelector('[data-cmd="undo"]').disabled = r.undo !== 1;
      bar.querySelector('[data-cmd="redo"]').disabled = r.redo !== 1;
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
    // Puts the caret on a spot, such as a gap, and shows it.
    ks.place = (spot) => {
      ks.select(spot, spot);
      ks.act("ksmd_web_selection");
    };
    ks.cellText = (block, row, column) => ks.out(w.ksmd_web_cell_text(block, row, column));

    ksmdView(ks);
    ksmdTable(ks);
    ksmdInput(ks);
    ksmdCommands(ks);

    const api = {
      // Opens a document's source, as text or as bytes; on refusal the open document stays, and
      // `line` and `column` name the place.
      load(source) {
        ks.table.take();
        let opened;
        try {
          opened = w.ksmd_web_load(typeof source === "string" ? ks.put(source) : ks.putBytes(source));
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

// The toolbar and keyboard commands, by name.
function ksmdCommands(ks) {
  const kinds = { p: [0, 0, 0], c: [2, 0, 0], bullets: [3, 0, 0], numbers: [3, 0, 1] };
  for (let n = 1; n <= 6; n++) kinds[`h${n}`] = [1, n, 0];
  const marks = { emphasis: 0, strong: 1, code: 2 };
  const rows = { "row-above": [0, 0], "row-below": [0, 1], "row-remove": [1, 0] };
  const columns = { "column-left": [2, 0], "column-right": [2, 1], "column-remove": [3, 0] };

  ks.command = (name) => {
    ks.flush();
    ks.table.take();
    if (name === "undo") return ks.act("ksmd_web_undo");
    if (name === "redo") return ks.act("ksmd_web_redo");
    if (name in rows || name in columns || name === "table-remove") return tableCommand(name);
    ks.sync();
    if (name in kinds) return ks.act("ksmd_web_kind", ...kinds[name]);
    if (name in marks) return ks.act("ksmd_web_mark", marks[name], 0);
    if (name === "indent" || name === "outdent") return ks.act("ksmd_web_indent", name === "indent" ? 1 : 0);
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

  function tableCommand(name) {
    const c = ks.cell;
    if (!c) {
      ks.say("Choose a cell of the table first.");
      return null;
    }
    if (name === "table-remove") {
      ks.cell = null;
      ks.root.focus();
      return ks.act("ksmd_web_remove_table", c.block);
    }
    if (name in rows) {
      const [what, after] = rows[name];
      return ks.act("ksmd_web_table_edit", c.block, what, Math.max(c.row, 0) + after);
    }
    const [what, after] = columns[name];
    return ks.act("ksmd_web_table_edit", c.block, what, c.column + after);
  }

  for (const el of ks.bar.querySelectorAll("[data-cmd]")) {
    // The toolbar must not take the selection away from the document.
    el.addEventListener("mousedown", (e) => {
      if (el.tagName === "BUTTON") e.preventDefault();
    });
    if (el.tagName === "SELECT") {
      el.addEventListener("change", () => {
        const name = el.value;
        el.value = "";
        ks.command(name);
        ks.root.focus();
      });
    } else {
      el.addEventListener("click", () => ks.command(el.dataset.cmd));
    }
  }
}
