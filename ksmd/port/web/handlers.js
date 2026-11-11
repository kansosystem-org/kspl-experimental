// ksmd page: the commands' handlers. `ks.handle` registers a command's handler by name, and
// `ks.command` runs it: it takes the open cell first, and keeps what Repeat does again. The
// handlers of the commands on text and on the page as a whole stand here too.
"use strict";

// The commands' handlers, by name. The file that does a command's work registers it (`ks.handle`),
// with what the command needs: a chosen cell of a table (`table`), whether Repeat does it again
// (`repeat`), whether Read-only leaves it (`looks`), when else it can act (`when`, given the chosen
// cell), and whether it runs as the browser's own, before an open cell is taken (`direct`). So a
// command's work stands in one file, `commands.js` says what it is called, and this file only
// looks it up.
function ksmdHandlers(ks) {
  const handlers = new Map();
  ks.handle = (names, run, how = {}) => {
    for (const name of [].concat(names)) {
      if (handlers.has(name)) throw new Error(`The command ${name} has two handlers.`);
      handlers.set(name, { run, table: !!how.table, repeat: !!how.repeat, looks: !!how.looks,
        when: how.when || null, direct: !!how.direct });
    }
  };
  ks.handler = (name) => handlers.get(name) || null;
  // Every command `commands.js` names has a handler, and every handler a command. A page that would
  // show an item doing nothing does not start, so the browser's checks stop on it at once.
  ks.checkHandlers = () => {
    const missing = COMMANDS.map(([name]) => name).filter((name) => !handlers.has(name));
    const extra = [...handlers.keys()].filter((name) => !COMMAND.has(name));
    if (missing.length > 0 || extra.length > 0) {
      throw new Error(`Commands without a handler: ${missing.join(", ") || "none"}. ` +
        `Handlers without a command: ${extra.join(", ") || "none"}.`);
    }
  };
}

// The menus' and the keyboard's commands, by name, and the handlers of the commands on text and
// on the page as a whole. A table's commands are handled by the files that do their work.
function ksmdCommands(ks) {
  const kinds = { p: [0, 0, 0], c: [2, 0, 0], bullets: [3, 0, 0], numbers: [3, 0, 1], checks: [3, 0, 2],
    quote: [4, 0, 0] };
  for (let n = 1; n <= 6; n++) kinds[`h${n}`] = [1, n, 0];
  const marks = { emphasis: 0, strong: 1, code: 2 };
  const aligns = { "align-left": "left", "align-center": "center", "align-right": "right",
    "align-across": "across" };

  // Repeat, as Office's: with nothing to redo, Redo (Ctrl+Y) and F4 do the last command again where
  // the person works now. Only a command whose handler says `repeat` is repeated: one that asks for
  // something, typing and pasting are not, and a change no command made forgets what would be.
  let repeat = null; // the last command that can be repeated, as a function, or null
  let running = 0; // how deep commands run, so a change can be told from one a command made
  let acted = false; // whether the running command changed the document
  ks.changedBy = () => {
    if (running > 0) acted = true;
    else repeat = null;
  };
  // Shows Redo, or Repeat where nothing is left to redo and a command can be repeated.
  const label = (el, text) => {
    const own = el.querySelector(".label");
    if (own) own.textContent = text;
  };
  ks.showRedo = () => {
    const repeating = !ks.canRedo && !!repeat;
    for (const el of document.querySelectorAll('[data-cmd="redo"]')) {
      el.disabled = ks.readOnly || !(ks.canRedo || repeat);
      label(el, repeating ? "Repeat" : "Redo");
      if (el.closest(".quick")) {
        el.title = repeating ? "Repeat (Ctrl+Y, F4)" : "Redo (Ctrl+Y)";
        el.setAttribute("aria-label", repeating ? "Repeat" : "Redo");
      }
    }
  };
  const runs = (name, f) => {
    running += 1;
    if (running === 1) acted = false;
    try {
      return f();
    } finally {
      running -= 1;
      if (running === 0) {
        const h = ks.handler(name);
        if (h && h.repeat) repeat = () => ks.command(name);
        else if (acted && name !== "undo" && name !== "redo") repeat = null;
        ks.showRedo();
      }
    }
  };
  ks.repeat = () => (ks.canRedo || !repeat ? null : repeat());
  document.addEventListener("keydown", (e) => {
    if (e.key !== "F4" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    e.preventDefault();
    // In a cell open on a formula, F4 turns the `$` of the reference at the caret instead, as
    // Excel's does (`point.js`).
    if (!ks.point.turn(e.target)) ks.repeat();
  }, true);

  ks.command = (name) => {
    const h = ks.handler(name);
    if (!h) return null;
    if (name === "redo" && !ks.canRedo) return ks.repeat();
    if (h.direct) return h.run(name);
    return runs(name, () => command(name, h));
  };

  // Paste reads the clipboard through the browser, as Excel for the web does. It hands what it read
  // to the place the focus stands as a paste event, so it acts as Ctrl+V does there. A browser can refuse to read, or lack the means: a cut waiting in the page then
  // still moves, and anything else asks for Ctrl+V. With `values`, it acts as Ctrl+Shift+V does.
  async function paste(values) {
    const at = document.activeElement && ks.root.contains(document.activeElement) ?
      document.activeElement : ks.root;
    const data = new DataTransfer();
    try {
      if (navigator.clipboard.read) {
        for (const item of await navigator.clipboard.read()) {
          for (const type of ["text/plain", "text/html"]) {
            if (item.types.includes(type)) data.setData(type, await (await item.getType(type)).text());
          }
        }
      } else {
        data.setData("text/plain", await navigator.clipboard.readText());
      }
    } catch (_) {
      if (!ks.cut.text()) {
        ks.say(values ? "Press Ctrl+Shift+V to paste values." : "Press Ctrl+V to paste.");
        return;
      }
      data.setData("text/plain", ks.cut.text());
    }
    ks.pasting.restore(data);
    const e = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
    const send = () => at.dispatchEvent(e);
    // An input takes the text where no handler took the paste, as the browser's own paste puts it.
    if ((values ? ks.pasting.asValues(send) : send()) && at.matches("input, textarea")) {
      document.execCommand("insertText", false, data.getData("text/plain"));
    }
  }

  // A command first takes the open cell. Text there that the editor refuses stays, and the
  // command does nothing, so a menu never drops what was typed. A table's command acts on the
  // chosen cell, and says so where none is chosen.
  const command = (name, h) => {
    ks.flush();
    if (!ks.table.take()) return null;
    if (!h.table) return h.run(name);
    const c = chosen();
    if (!c) {
      ks.say("Choose a cell of the table first.");
      return null;
    }
    return h.run(name, c);
  };

  // The commands on the page as a whole. Cut and Copy run the browser's own, so they act as Ctrl+X
  // and Ctrl+C do where the focus stands: an open cell stays open, and its selected text is what
  // goes.
  ks.handle("cut", (name) => {
    document.execCommand(name);
    return null;
  }, { direct: true });
  ks.handle("copy", (name) => {
    document.execCommand(name);
    return null;
  }, { direct: true, looks: true });
  ks.handle("paste", () => {
    paste(false);
    return null;
  }, { direct: true });
  // Paste values puts copied cells' values alone, as Ctrl+Shift+V does (`paste.js`).
  ks.handle("paste-values", () => {
    paste(true);
    return null;
  }, { direct: true });
  ks.handle("undo", () => ks.act("ksmd_web_undo"));
  ks.handle("redo", () => ks.act("ksmd_web_redo"));
  ks.handle(["file-open", "file-save", "file-save-as"],
    (name) => (ks.fileCommand ? ks.fileCommand(name) : null), { looks: true });
  ks.handle("print", () => window.print(), { looks: true });
  ks.handle("read-only", () => ks.setReadOnly(!ks.readOnly), { looks: true });
  ks.handle(["width-full", "width-reading"], (name) => ks.setWidth(name === "width-reading"),
    { looks: true });
  ks.handle("one-line", () => ks.setOneLine(!document.body.classList.contains("one-line")),
    { looks: true });

  // The looks: a size, an alignment and Clear format.
  ks.handle(COMMANDS.map(([name]) => name).filter((name) => name.startsWith("size-")),
    (name) => ks.applyLook("size", name === "size-default" ? "" : name.slice(5)));
  // Pressing an alignment that is on takes it off, as in Excel and Word: the text then stands
  // where the page sets it.
  ks.handle(Object.keys(aligns),
    (name) => ks.applyLook("align", alignNow() === aligns[name] ? "" : aligns[name]), { repeat: true });
  ks.handle("look-clear", () => ks.applyLook("all", ""), { repeat: true });
  // Wrap text, as Excel's: pressed on a cell that wraps, it stops the chosen cells wrapping.
  ks.handle("wrap-text", () => ks.applyLook("wrap", wrapNow() ? "" : "on"), { repeat: true });

  // The commands on text, which act at the model's selection, so the page's own is read first.
  const synced = (f) => (name) => {
    ks.sync();
    return f(name);
  };
  // A list or a quote pressed where it stands already turns back into paragraphs, as in Word.
  ks.handle(Object.keys(kinds), synced((name) => ks.act("ksmd_web_kind",
    ...(isOn(name, ks.hereNow()) ? kinds.p : kinds[name]))), { repeat: true });
  ks.handle(Object.keys(marks), synced((name) => ks.act("ksmd_web_mark", marks[name], 0)),
    { repeat: true });
  ks.handle(["indent", "outdent"], synced((name) => ks.act("ksmd_web_indent", name === "indent" ? 1 : 0)),
    { repeat: true });
  ks.handle("divider", synced(() => ks.act("ksmd_web_divider")), { repeat: true });
  ks.handle(["date", "time"], synced((name) => ks.act("ksmd_web_type", ks.put(ks.now(name === "time")), 0)),
    { repeat: true });
  // Insert ▸ Image… chooses a file, which then goes in as a pasted image does (`addImage` in
  // `file.js`): written in the document's data folder, its clause at the caret.
  ks.handle("image", synced(() => {
    if (!ks.imagesHere()) return null;
    const pick = document.createElement("input");
    pick.type = "file";
    pick.accept = "image/png,image/jpeg";
    pick.addEventListener("change", () => {
      if (!pick.files || !pick.files[0]) return;
      ks.sync();
      ks.addImage(pick.files[0]);
    });
    pick.click();
    return null;
  }));
  // Insert ▸ Functions… and Insert ▸ Include… choose a file in the workspace, or start one
  // (`addClause` in `file.js`), and put its clause at the caret.
  ks.handle(["functions", "include"], synced((name) => {
    if (!ks.addClause) {
      ks.say(name === "functions" ?
        "Functions go in only where the local server opened the document, to build them." :
        "An include goes in only where the local server opened the document, to read its file.");
      return null;
    }
    ks.addClause(name);
    return null;
  }));
  ks.handle("link", synced(() => {
    // A chosen cell takes the link on its text.
    if (ks.inTable() && ks.cell && ks.cell.row >= 0) return ks.table.askLink();
    const to = window.prompt("Link to an https:, http: or mailto: address, or a #place", "https://");
    if (to === null) return null;
    return ks.act("ksmd_web_mark", 3, ks.put(to.trim()));
  }));
  ks.handle("table", synced(() => {
    const r = ks.act("ksmd_web_insert_table", 3, 2);
    if (r && r.ok) ks.table.editFirst(r.from + (r.blocks[0] && r.blocks[0].k === "t" ? 0 : 1));
    return r;
  }));

  // Whether a kind that turns off when pressed again stands at the selection.
  const isOn = (name, h) => !!h && ((h.k === "list" && ((name === "bullets" && h.o === 0 && h.c === 0) ||
    (name === "numbers" && h.o === 1) || (name === "checks" && h.c > 0))) || (name === "quote" && h.k === "quote"));

  // The alignment where the person works: the chosen cell's, or the selected text's first paragraph.
  const alignNow = () => {
    if (ks.where === "cell") {
      const c = chosen();
      const el = c && ks.view.blocks()[c.block].querySelector(`[data-r="${c.row}"][data-c="${c.column}"]`);
      if (!el) return "";
      return el.classList.contains("across") ? "across" : el.style.textAlign;
    }
    const h = ks.hereNow();
    return h ? h.a : "";
  };

  // Whether the chosen cell's text wraps.
  const wrapNow = () => {
    const c = ks.where === "cell" && chosen();
    const el = c && ks.view.blocks()[c.block].querySelector(`[data-r="${c.row}"][data-c="${c.column}"]`);
    return !!el && el.classList.contains("wrap");
  };

  // An open cell's edit is taken before the browser prints, also when Ctrl+P prints. The printed
  // page's header shows the time of this print (`@top-left` in `print.css`).
  window.addEventListener("beforeprint", () => {
    ks.table.take();
    const at = new Date().toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    document.documentElement.style.setProperty("--print-date", `"${at}"`);
  });

  // Sets one part of a look, or clears it with an empty value: on the chosen cells where a cell
  // was worked in last, or else on the selected text: its colour, or its paragraphs' alignment.
  // A fill, a size and wrapping belong to cells alone, so in text Clear clears the alignment.
  const parts = { color: 0, fill: 1, size: 2, align: 3, all: 4, wrap: 6 };
  ks.applyLook = (part, value) => {
    const r = runs("look", () => look(part, value));
    if (r && r.ok) repeat = () => ks.applyLook(part, value);
    ks.showRedo();
    return r;
  };
  const look = (part, value) => {
    ks.flush();
    if (ks.where === "cell" && chosen()) {
      const r = ks.table.range();
      ks.table.take();
      return ks.act("ksmd_web_cell_look", r.block, r.r1, r.c1, r.r2, r.c2, parts[part], ks.put(value));
    }
    ks.sync();
    if (part === "all") return ks.act("ksmd_web_clear_look");
    if (part === "align" && value !== "across") return ks.act("ksmd_web_align", ks.put(value));
    if (part === "color") return ks.act("ksmd_web_text_color", ks.put(value));
    ks.say("Fill colours, font sizes, wrapping and centring across columns apply to table cells. " +
      "Choose cells first.");
    return null;
  };

  // View, Read-only: the page shows the document and takes no edit, as Word's Read Mode does. The
  // blocks' buttons go, the commands that edit cannot be pressed, a cell is chosen but never
  // opened, and finding, filters and printing still work. The choice is this browser's own, as the width is.
  ks.readOnly = false;
  ks.setReadOnly = (on) => {
    if (on) ks.table.take();
    ks.readOnly = on;
    if (ks.filter) ks.filter.readOnly();
    document.body.classList.toggle("read-only", on);
    ks.root.contentEditable = on ? "false" : "true";
    for (const el of document.querySelectorAll('[data-cmd="read-only"]')) {
      el.setAttribute("aria-checked", String(on));
    }
    ks.quick.sync();
    try {
      localStorage.setItem("ksmd.readonly", on ? "1" : "0");
    } catch (_) { /* a browser that keeps nothing opens for editing next time */ }
    return null;
  };

  // The page's width: the document fills the window, or keeps lines short for reading. The choice
  // is this browser's own, so it is kept there and not in the document.
  ks.setWidth = (reading) => {
    document.body.classList.toggle("reading", reading);
    for (const el of document.querySelectorAll('[data-cmd="width-full"], [data-cmd="width-reading"]')) {
      el.setAttribute("aria-checked", String((el.dataset.cmd === "width-reading") === reading));
    }
    try {
      localStorage.setItem("ksmd.width", reading ? "reading" : "full");
    } catch (_) { /* a browser that keeps nothing shows the full width next time */ }
    return null;
  };
  try {
    ks.setWidth(localStorage.getItem("ksmd.width") === "reading");
  } catch (_) {
    ks.setWidth(false);
  }

  // One line per cell: a long text is cut at its cell's edge, so a wide table keeps short rows.
  // The choice is this browser's own, as the width is, and the document is unchanged.
  ks.setOneLine = (on) => {
    document.body.classList.toggle("one-line", on);
    for (const el of document.querySelectorAll('[data-cmd="one-line"]')) {
      el.setAttribute("aria-checked", String(on));
    }
    try {
      localStorage.setItem("ksmd.oneLine", on ? "1" : "0");
    } catch (_) { /* a browser that keeps nothing wraps the text next time */ }
    if (ks.table && ks.view) ks.table.pin();
    return null;
  };
  let oneLine = false;
  try {
    oneLine = localStorage.getItem("ksmd.oneLine") === "1";
  } catch (_) { /* a browser that keeps nothing wraps the text */ }
  ks.setOneLine(oneLine);

  // AutoCorrect, as Excel's: a typed `11/6` becomes a date, a typed web address a link, and a
  // formula missing its last `)` takes it. Each is on until a person turns it off, and the
  // choice is this browser's own, as the width is. `Ctrl`+`Z` right after takes back the change
  // alone (`set_cell` in `ksmd/edit/editor_tables.kspl`).
  const auto = { "auto-dates": true, "auto-links": true, "auto-brackets": true };
  const autoKeys = { "auto-dates": "ksmd.autoDates", "auto-links": "ksmd.autoLinks",
    "auto-brackets": "ksmd.autoBrackets" };
  ks.setAuto = (name, on) => {
    auto[name] = on;
    ks.w.ksmd_web_auto_entry(auto["auto-dates"] ? 1 : 0, auto["auto-links"] ? 1 : 0,
      auto["auto-brackets"] ? 1 : 0);
    for (const el of document.querySelectorAll(`[data-cmd="${name}"]`)) {
      el.setAttribute("aria-checked", String(on));
    }
    try {
      localStorage.setItem(autoKeys[name], on ? "1" : "0");
    } catch (_) { /* a browser that keeps nothing turns it on again next time */ }
    return null;
  };
  for (const name of Object.keys(auto)) {
    let on = true;
    try {
      on = localStorage.getItem(autoKeys[name]) !== "0";
    } catch (_) { /* a browser that keeps nothing keeps it on */ }
    ks.setAuto(name, on);
  }
  ks.handle(Object.keys(auto), (name) => ks.setAuto(name, !auto[name]), { looks: true });

  // The chosen cell, while its table still stands where it was chosen.
  const chosen = () => {
    const c = ks.cell;
    const el = c && ks.view.blocks()[c.block];
    return el && el.classList.contains("table") ? c : null;
  };

  // Enables only the commands that can act now, so no item is pressed for nothing. Read-only
  // leaves those whose handler only looks: finding, the view, printing, files, filters and CSV.
  const MARKS = new Set(["strong", "emphasis", "code", "link"]);
  ks.enableTable = () => {
    const c = chosen();
    ks.showRedo();
    for (const el of document.querySelectorAll(".menu [data-cmd], .quick [data-cmd]")) {
      const name = el.dataset.cmd;
      if (name === "undo") {
        el.disabled = ks.readOnly || !ks.canUndo;
        continue;
      }
      if (name === "redo") continue;
      if (MARKS.has(name)) {
        // A mark belongs to text: a cell holds a value, and a code block literal text. A link is
        // the one a cell takes too, on its text.
        el.disabled = ks.readOnly || (ks.where === "cell" && name !== "link") ||
          !!(ks.here && /^(code|other)$/.test(ks.here.k));
        continue;
      }
      if (name === "fill" || name.startsWith("size-")) {
        // A fill and a size belong to table cells alone.
        el.disabled = ks.readOnly || ks.where !== "cell";
        continue;
      }
      const h = ks.handler(name);
      if (!h || !h.table) {
        el.disabled = ks.readOnly && !(h && h.looks);
        continue;
      }
      el.disabled = !c || (ks.readOnly && !h.looks) || (!!h.when && !h.when(c));
      // While lines of this table are cut, Insert row above or Insert column left reads as the
      // insert of them, in the same place (`CUT_FORMS` in `commands.js`).
      if (name in CUT_FORMS) {
        const cutForm = c && ks.cut.waiting(c.block, name === "row-above");
        const [text, icon] = cutForm ? CUT_FORMS[name] : [COMMAND.get(name).label, name];
        label(el, text);
        if (el.closest(".quick")) el.title = text;
        const glyph = el.querySelector(".glyph");
        if (glyph && (glyph.dataset.icon || name) !== icon) {
          const next = ksmdIcon(icon);
          next.dataset.icon = icon;
          glyph.replaceWith(next);
        }
      }
      if (name === "table-print") {
        const text = c && ks.table.leftOut(c.block) ? "Put back in print" : "Leave out of print";
        label(el, text);
        if (el.closest(".quick")) el.title = text;
      }
    }
  };
}
