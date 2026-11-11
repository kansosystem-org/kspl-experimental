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
    // grows. A buffer the memory cannot hold stops the page, so the action after it does nothing.
    ks.put = (text) => ks.putBytes(enc.encode(text));
    ks.putBytes = (...parts) => {
      const len = parts.reduce((n, p) => n + p.length, 0);
      if (ks.stopped) return 0;
      let at;
      try {
        at = w.ksmd_web_in(Math.max(len, 1));
      } catch (e) {
        if (!(e instanceof GaveUp)) throw e;
        stop(e.message);
        return 0;
      }
      for (const p of parts) {
        new Uint8Array(mem.buffer, at, p.length).set(p);
        at += p.length;
      }
      return len;
    };
    ks.out = (len) => (len > 0 ? dec.decode(new Uint8Array(mem.buffer, w.ksmd_web_out_ptr(), len)) : "");
    // A message stands in the status bar until the next action. The bar's other items step aside
    // for it, and its tooltip holds the whole of a message the bar cuts.
    ks.say = (text) => {
      status.textContent = text;
      status.title = text;
      status.parentElement.classList.toggle("saying", text !== "");
    };
    // Whether pasted text is longer than a source can hold, after saying so. It is checked before
    // it goes in, so a paste never asks for more memory than the editor has.
    ks.tooLarge = (text) => {
      const max = w.ksmd_web_source_limit();
      if (text.length <= max && enc.encode(text).length <= max) return false;
      ks.say(`Nothing was pasted: the text is larger than the ${max / 1048576} MiB a document can hold.`);
      return true;
    };

    function stop(why) {
      ks.stopped = true;
      root.contentEditable = "false";
      ks.say(`The editor stopped: ${why}. Copy what you need, then open the document again.`);
    }

    // Runs one action and shows its result; returns the result, or null when the page stopped.
    ks.act = (name, ...args) => run(name, false, args);

    // Shows the document again for work that ended later: a document's own function answering,
    // an include or image fetched again. **It leaves alone what the person is doing.** The caret
    // goes back into the document only where the focus is there: put back while the person typed
    // in the find bar, Insert Function or Save As, it took the focus, and the next keys went into
    // the text. A gap the caret stands in is drawn again all the same, so the blocks below it
    // stay where they stood. The status bar keeps its words, unless the showing fails. During an
    // input method's composition it waits until the composition ends: moving the box being
    // composed in ends the composition, and what was composed went in twice.
    let composing = false;
    let waiting = null;
    ks.redraw = (name) => {
      if (composing) {
        waiting = waiting === "ksmd_web_render" ? waiting : name;
        return null;
      }
      return run(name, true, []);
    };
    document.addEventListener("compositionstart", () => {
      composing = true;
    }, true);
    // It listens as the composition's own commit does, after it, so the commit's turn comes first
    // (`flush` in `input.js`).
    document.addEventListener("compositionend", () => {
      composing = false;
      if (!waiting) return;
      const name = waiting;
      waiting = null;
      setTimeout(() => {
        ks.flush();
        ks.redraw(name);
      }, 0);
    });
    // A caret not put back is put back once the text has the focus again, as the find bar's Esc
    // gives it, unless the person already put one there.
    // Caution: **Only the text's own focus puts it back.** A focus inside the document, on a
    // drawing's shapes or a cell's box, lost it to the caret, and drawing on an image hung.
    let unplaced = false;
    root.addEventListener("focus", () => {
      if (!unplaced) return;
      unplaced = false;
      const s = window.getSelection();
      if (s.rangeCount > 0 && root.contains(s.focusNode)) return;
      if (ks.sel && !ks.inTable()) ks.view.showSelection(ks.sel);
    });

    function run(name, quiet, args) {
      if (ks.stopped) return null;
      // Read-only takes every action that changes the document; showing it again is no change.
      if (ks.readOnly && !["ksmd_web_render", "ksmd_web_render_files", "ksmd_web_selection"].includes(name)) {
        ks.say("The page is read-only. View, Read-only turns editing on again.");
        return null;
      }
      const here = document.activeElement;
      const inDocument = !here || here === document.body || root.contains(here);
      let r;
      try {
        r = JSON.parse(ks.out(w[name](...args)));
      } catch (e) {
        if (!(e instanceof GaveUp)) throw e;
        stop(e.message);
        return null;
      }
      ks.here = r.here;
      ks.view.apply(r);
      for (const f of ks.rendered) f();
      // A table that went takes the place with it, and the person works in the text again.
      if (ks.where === "cell" && !ks.inTable()) ks.setPlace("text");
      unplaced = quiet && !inDocument;
      ks.view.showSelection(r.sel, !unplaced);
      ks.sel = r.sel;
      if (!quiet || !r.ok) ks.say(r.ok ? "" : r.why);
      // The menu and the quick access bar can each hold Undo and Redo.
      ks.canUndo = r.undo === 1;
      ks.canRedo = r.redo === 1;
      for (const el of document.querySelectorAll('[data-cmd="undo"]')) el.disabled = !ks.canUndo;
      if (r.changed === 1) ks.changedBy();
      ks.showRedo();
      if (r.changed === 1) {
        for (const f of ks.changed) f();
        if (api.onchange) api.onchange();
      }
      return r;
    }

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
    // What stands at the page's selection now: its kind of block, alignment and marks, which the
    // quick access bar shows. It tells the editor where the selection is, and changes nothing.
    ks.hereNow = () => {
      if (ks.stopped) return ks.here;
      ks.sync();
      ks.here = JSON.parse(ks.out(w.ksmd_web_here()));
      return ks.here;
    };
    ks.cellText = (block, row, column) => ks.out(w.ksmd_web_cell_text(block, row, column));
    // A number the page worked out, such as a sum, written as a cell shows it.
    ks.showNumber = (n) => ks.out(w.ksmd_web_show_number(n));
    // Today's date as 2026-10-23, or the time now as 14:05: what Ctrl+; and Ctrl+: type, as in
    // Excel. The form is ISO 8601's, which reads the same in every country and sorts as text.
    ks.now = (time) => {
      const d = new Date();
      const two = (n) => String(n).padStart(2, "0");
      return time ? `${two(d.getHours())}:${two(d.getMinutes())}` :
        `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
    };

    // Where the person worked last: "text" or "cell". A look, a paste and the fill and size tools
    // follow it.
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
    // Caution: **Focus the document without a scroll.** A focused document jumps to its top.
    ks.leaveTable = () => {
      ks.setPlace("text");
      ks.root.focus({ preventScroll: true });
      if (ks.sel) ks.view.showSelection(ks.sel);
    };
    // Gives the focus back to `from`, where it was before a panel, a menu or a bar took it, as a
    // dialog does. Where `from` is gone, as a cell the table drew again since, the chosen cell
    // takes it, or else the text with its caret where the model holds it.
    ks.focusBack = (from) => {
      if (from && from !== document.body && from !== ks.root && from.isConnected) {
        from.focus({ preventScroll: true });
      } else if (ks.inTable()) {
        ks.range.focus();
      } else {
        ks.root.focus({ preventScroll: true });
        if (ks.sel) ks.view.showSelection(ks.sel);
      }
    };
    // A button of the page's own: its name, its class, its tooltip and what a press does. Each
    // part left out, as null or "", is not set.
    ks.button = (label, cls, title, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      if (label) b.textContent = label;
      if (cls) b.className = cls;
      if (title) b.title = title;
      if (onClick) b.addEventListener("click", onClick);
      return b;
    };
    // The header's height, under which a table's frozen heading and a heading scrolled to stand.
    const top = document.querySelector(".top");
    if (top && window.ResizeObserver) {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty("--top-height", `${top.offsetHeight}px`);
      }).observe(top);
    }
    ksmdHandlers(ks);
    ksmdPanels(ks);
    ksmdPopup(ks);
    ksmdView(ks);
    ksmdTable(ks);
    ksmdSizes(ks);
    ksmdOutline(ks);
    ksmdChoices(ks);
    ksmdRules(ks);
    ksmdChart(ks);
    ksmdDrawings(ks);
    ksmdImages(ks);
    ksmdDiagram(ks);
    ksmdSettings(ks);
    ksmdMerge(ks);
    ksmdNotes(ks);
    ksmdStatus(ks);
    ksmdBar(ks);
    ksmdFigures(ks);
    ksmdZoom(ks);
    ksmdPages(ks);
    ksmdAutosum(ks);
    ksmdRange(ks);
    ksmdCut(ks);
    ksmdPaste(ks);
    ksmdPoint(ks);
    ksmdRefs(ks);
    ksmdSuggest(ks);
    ksmdCatalog(ks);
    ksmdFilter(ks);
    ksmdInput(ks);
    // The menus and the quick access bar stand before the commands set their ticks.
    ksmdMenus(ks);
    ksmdQuick(ks);
    ksmdCommands(ks);
    ksmdTouch(ks);
    ksmdFind(ks);
    ksmdContents(ks);
    ks.checkHandlers();
    ks.quick.sync();
    try {
      if (localStorage.getItem("ksmd.readonly") === "1") ks.setReadOnly(true);
    } catch (_) { /* a browser that keeps nothing opens for editing */ }

    const api = {
      // Opens a document's source, as text or as bytes; on refusal the open document stays, and
      // `line` and `column` name the place.
      load(source) {
        // Text in a cell still open that the editor refuses would be lost, so nothing opens then.
        if (!ks.table.take()) {
          const why = "the text in the open cell cannot go in. Change it, or press Esc to drop it";
          ks.say(`This document cannot be opened: ${why}.`);
          return { ok: false, why };
        }
        let opened;
        // The date it opens on is what `today()` gives until the next document opens.
        const d = new Date();
        const len = typeof source === "string" ? ks.put(source) : ks.putBytes(source);
        if (ks.stopped) return { ok: false, why: "The editor's memory ran out." };
        try {
          opened = w.ksmd_web_load(len, d.getFullYear(), d.getMonth() + 1, d.getDate());
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
        ks.table.chooseCell(null);
        ks.cut.drop();
        ks.filter.forget();
        ks.setPlace("text");
        // Showing a large document can use up the memory too; the page then says it stopped.
        if (!ks.act("ksmd_web_render")) {
          return { ok: false, why: "The editor's memory ran out while it showed this document." };
        }
        ks.say("");
        return said;
      },
      // The canonical source of the open document, as a save writes it. Text in a cell still open
      // that the editor refuses stays there, and is not in it.
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
    api.load("%ksmd 2\n");
    // Each call that hands a file to the editor can run out of memory as an action can.
    ks.call = (name, ...args) => {
      if (ks.stopped) return 0;
      try {
        return w[name](...args);
      } catch (e) {
        if (!(e instanceof GaveUp)) throw e;
        stop(e.message);
        return 0;
      }
    };
    ksmdFiles(ks, api);
    ksmdFunctions(ks);
    return api;
  });
}

// The small panels that set a column's rule, a chart and the page setup (`ks.panel`). Each has
// Apply and Cancel at its end. Escape or a press outside closes it, as a press outside a menu does.
// Apply, Cancel and Escape give the focus back where it was before the panel opened, as a dialog
// does; left on the panel that went, it fell to the page's body, and the next key went nowhere.
function ksmdPanels(ks) {
  const open = new Set();
  document.addEventListener("mousedown", (e) => {
    for (const p of open) if (!p.el.contains(e.target)) p.close();
  }, true);
  // A panel of class `cls` (`rule-panel`), named `label` for a screen reader. Making it closes
  // the open panel of its class. `show` adds Apply (`rule-apply`) and Cancel, and puts it on the
  // page. Apply closes it, then runs `onApply`, which can still read the panel's fields.
  ks.panel = (cls, label, onApply) => {
    for (const p of open) if (p.el.className === cls) p.close();
    const el = document.createElement("div");
    el.className = cls;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", label);
    const from = document.activeElement;
    const p = { el, close: () => { el.remove(); open.delete(p); } };
    const back = () => {
      p.close();
      ks.focusBack(from);
    };
    p.apply = ks.button("Apply", cls.replace(/-panel$/, "-apply"), null, () => { back(); onApply(); });
    const cancel = ks.button("Cancel", null, null, back);
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      back();
    });
    p.show = () => {
      el.append(p.apply, cancel);
      document.body.appendChild(el);
      open.add(p);
    };
    return p;
  };
}
