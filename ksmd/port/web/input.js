// ksmd page: input. Text arrives through `beforeinput`, which is cancelled and turned into a model
// action; commands arrive through key presses, the menus and the quick access bar. The page never
// keeps an edit the browser made, except an input method's composition while it lasts.
// Caution: **Never render the element being composed in, and commit a composition once.** An input
// method owns that element until `compositionend`. The commit compares the element's text before and
// after, so a later `input` event adds nothing.
"use strict";

function ksmdInput(ks) {
  const root = ks.root;
  // A composition that has ended and waits to be taken: { el, before, spot }.
  let ended = null;

  // Takes an ended composition into the model as one action.
  function flush() {
    if (!ended) return;
    const c = ended;
    ended = null;
    const after = ks.view.unitText(c.el);
    const before = c.before;
    let s = 0;
    while (s < before.length && s < after.length && before[s] === after[s]) s++;
    let e = 0;
    while (e < before.length - s && e < after.length - s &&
      before[before.length - 1 - e] === after[after.length - 1 - e]) e++;
    // Never cut a character in two: step back off half of a surrogate pair at either edge.
    if (s > 0 && /[\uD800-\uDBFF]/.test(before[s - 1])) s--;
    if (e > 0 && /[\uDC00-\uDFFF]/.test(before[before.length - e])) e--;
    const inserted = after.slice(s, after.length - e);
    const from = ks.view.u8len(before.slice(0, s));
    const to = ks.view.u8len(before.slice(0, before.length - e));
    if (c.spot[0] === ks.SPOT.TEXT) {
      ks.select([ks.SPOT.TEXT, c.spot[1], c.spot[2], from], [ks.SPOT.TEXT, c.spot[1], c.spot[2], to]);
    }
    else ks.select(c.spot, c.spot);
    ks.act("ksmd_web_type", ks.put(inserted), 2);
  }
  ks.flush = flush;

  function unitAt(node) {
    return ks.view.closest(node, ".gap") || ks.view.closest(node, ".u");
  }

  // The spot of a unit's start, or the gap's spot.
  function startOf(el) {
    if (el.classList.contains("gap")) return el.spot.slice();
    return ks.view.spotAt(el, 0);
  }

  // A field inside the document, as a settings block holds, keeps its own keys and its copy.
  const field = (el) => !!(el && el.matches && el.matches("input, textarea, select"));

  function collapsed() {
    const s = window.getSelection();
    return s.rangeCount === 0 || s.isCollapsed;
  }

  // Selects what a `beforeinput` targets: its first target range, or the selection.
  function syncTarget(e) {
    const ranges = e.getTargetRanges ? e.getTargetRanges() : [];
    if (ranges.length > 0 && !ranges[0].collapsed) {
      const a = ks.view.spotAt(ranges[0].startContainer, ranges[0].startOffset);
      const f = ks.view.spotAt(ranges[0].endContainer, ranges[0].endOffset);
      if (a && f) return ks.select(a, f);
    }
    ks.sync();
  }

  function erase(e, backward) {
    ks.sync();
    if (collapsed()) {
      // A character or a word: the browser's target range knows where it ends. At a unit's edge
      // the model decides, as it lifts a list item before joining blocks.
      const ranges = e.getTargetRanges ? e.getTargetRanges() : [];
      if (ranges.length > 0 && !ranges[0].collapsed) {
        const a = ks.view.spotAt(ranges[0].startContainer, ranges[0].startOffset);
        const f = ks.view.spotAt(ranges[0].endContainer, ranges[0].endOffset);
        if (a && f && a[0] === ks.SPOT.TEXT && f[0] === ks.SPOT.TEXT && a[1] === f[1] && a[2] === f[2]) ks.select(a, f);
      }
    }
    ks.act("ksmd_web_erase", backward ? 1 : 0);
  }

  root.addEventListener("beforeinput", (e) => {
    if (ks.table.owns(e.target)) return;
    if (ks.composing) return;
    const t = e.inputType;
    // Safari's commit of a composition: the browser writes it, and `compositionend` takes it.
    if (t === "insertCompositionText" || t === "deleteCompositionText" ||
      t === "insertFromComposition") return;
    e.preventDefault();
    flush();
    if (ks.stopped) return;
    if (t === "insertText" || t === "insertReplacementText") {
      syncTarget(e);
      const text = e.data !== null ? e.data : e.dataTransfer ? e.dataTransfer.getData("text/plain") : "";
      ks.act("ksmd_web_type", ks.put(text), 0);
    } else if (t === "insertParagraph") {
      ks.sync();
      ks.act("ksmd_web_enter", 0);
    } else if (t === "insertLineBreak") {
      ks.sync();
      ks.act("ksmd_web_enter", 1);
    } else if (t === "historyUndo") {
      ks.act("ksmd_web_undo");
    } else if (t === "historyRedo") {
      ks.act("ksmd_web_redo");
    } else if (t === "formatBold") {
      ks.command("strong");
    } else if (t === "formatItalic") {
      ks.command("emphasis");
    } else if (t.startsWith("delete")) {
      erase(e, !t.endsWith("Forward"));
    }
    // Anything else, such as a drop, is refused: it changes nothing.
  });

  root.addEventListener("compositionstart", (e) => {
    if (ks.table.owns(e.target)) return;
    flush();
    ks.sync();
    const s = window.getSelection();
    const el = s.rangeCount > 0 ? unitAt(s.focusNode) : null;
    ks.composing = el ? { el, before: ks.view.unitText(el), spot: startOf(el) } : null;
  });

  root.addEventListener("compositionend", () => {
    if (!ks.composing) return;
    ended = ks.composing;
    ks.composing = null;
    // The commit waits a turn: a browser that changes the text after `compositionend` has done so
    // by then. Any other input takes it first (`flush`).
    setTimeout(flush, 0);
  });

  root.addEventListener("keydown", (e) => {
    // Caution: **A key another handler took is not the text's.** A chosen cell's Ctrl+; opens the
    // cell and takes its box out of the page, so `owns` no longer sees the table, and the date
    // went into the text at the hidden caret too.
    if (e.defaultPrevented || ks.table.owns(e.target)) return;
    if (e.isComposing || e.keyCode === 229) {
      // An input method starts: take the selected text out first, so it composes in one place.
      if (!ks.composing && !collapsed()) {
        ks.sync();
        ks.act("ksmd_web_erase", 1);
      }
      return;
    }
    flush();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey && (e.key === "End" || e.key === "Home")) {
      if (toEdge(e.key === "End")) e.preventDefault();
      return;
    }
    // Caution: **Ctrl+A selects the model's whole document, and Delete or Backspace on a selection
    // erase through the model.** The browser's own Select All cannot reach past a table, an image,
    // a chart or a divider at either end. With one at the end, it left the caret at the start, and
    // Delete took the first character. Over such a block, the browser sends no `beforeinput`.
    if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "a" && !field(e.target)) {
      e.preventDefault();
      selectAll();
      return;
    }
    // Shift+Delete is a cut on Windows; the cut's own handler takes it.
    const erases = e.key === "Backspace" || (e.key === "Delete" && !e.shiftKey);
    if (erases && !e.altKey && !collapsed() && !field(e.target)) {
      e.preventDefault();
      ks.sync();
      ks.act("ksmd_web_erase", e.key === "Backspace" ? 1 : 0);
      return;
    }
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let name = null;
    if (mod && !e.altKey) {
      if (key === "z") name = e.shiftKey ? "redo" : "undo";
      else if (key === "y") name = "redo";
      else if (key === "b") name = "strong";
      else if (key === "i") name = "emphasis";
      else if (key === "e") name = "code";
      else if (key === "k") name = "link";
      else if (e.key === ";") name = "date";
      else if (e.key === ":") name = "time";
    } else if (mod && e.altKey && /^Digit[0-6]$/.test(e.code) && !altGr(e, e.code.slice(5))) {
      const n = e.code.slice(5);
      name = n === "0" ? "p" : `h${n}`;
    } else if (e.key === "Tab" && !mod && inList()) {
      name = e.shiftKey ? "outdent" : "indent";
    }
    if (name) {
      e.preventDefault();
      ks.command(name);
    }
  });

  // Caution: **AltGr types a character; it is not a shortcut.** On Windows the browser reports
  // AltGr as Ctrl+Alt. AltGr+0 on a German keyboard (`}`) took Ctrl+Alt+0: it made a paragraph and
  // dropped the character. Outside a Mac, a press is AltGr's where the browser says so, or where
  // Ctrl+Alt gives a character other than `want`, the character the shortcut names. ProseMirror and
  // CodeMirror decide the same way. The cost: a layout whose digit key types a sign without Shift,
  // as `&` on a French one, makes no heading with Ctrl+Alt there; the menu still does.
  // A Mac has no AltGr, but Firefox there can report Option as AltGraph (`ks.mac`).
  function altGr(e, want) {
    return !ks.mac && (e.getModifierState("AltGraph") ||
      (e.ctrlKey && e.altKey && !e.metaKey && e.key.length === 1 && e.key !== want));
  }

  // Ctrl+End and Ctrl+Home where the document ends, or starts, with a block that holds no text, as
  // a table, a chart or a diagram. The browser cannot put its caret beside such a block, and
  // would leave it where it was, so the page puts it in the gap there. Where text stands at that
  // end, the browser's own move stays. True where the page moved the caret.
  function toEdge(end) {
    const all = ks.view.blocks();
    if (all.length === 0) return false;
    const edge = all[end ? all.length - 1 : 0];
    if (edge.classList.contains("u") || edge.classList.contains("list")) return false;
    ks.place([ks.SPOT.BLOCK_GAP, end ? all.length : 0, 0, 0]);
    const gap = root.querySelector(".gap");
    if (gap) gap.scrollIntoView({ block: "nearest" });
    return true;
  }

  // Selects the whole document: from its first text, or the gap before a first block that holds
  // none, to its last text, or the gap after such a last block.
  function selectAll() {
    const all = ks.view.blocks();
    if (all.length === 0) return;
    const text = (el) => el.classList.contains("u") || el.classList.contains("list");
    const first = all[0];
    const last = all[all.length - 1];
    const a = text(first) ? [ks.SPOT.TEXT, 0, 0, 0] : [ks.SPOT.BLOCK_GAP, 0, 0, 0];
    let f = [ks.SPOT.BLOCK_GAP, all.length, 0, 0];
    if (text(last)) {
      const units = last.classList.contains("list") ? ks.view.items(last) : [last];
      const unit = units[units.length - 1];
      f = [ks.SPOT.TEXT, all.length - 1, units.length - 1, ks.view.u8len(ks.view.unitText(unit))];
    }
    ks.place(a, f);
  }

  function inList() {
    const s = window.getSelection();
    return s.rangeCount > 0 && !!ks.view.closest(s.focusNode, ".li");
  }

  // Whether an image can go in here, saying why not where it cannot: Insert ▸ Image… asks this too.
  ks.imagesHere = () => {
    if (ks.addImage) return true;
    ks.say("An image goes in only where the local server opened the document, to save it beside it.");
    return false;
  };

  // An image file pasted or dropped is written in the document's data folder, where the local
  // server serves the page (`file.js`). It never goes into a cell.
  function image(files) {
    const file = Array.from(files || []).find((f) => f.type.startsWith("image/"));
    if (!file) return false;
    ks.sync();
    if (ks.imagesHere()) ks.addImage(file);
    return true;
  }

  root.addEventListener("paste", (e) => {
    if (ks.table.owns(e.target)) return;
    e.preventDefault();
    flush();
    const data = e.clipboardData;
    if (data && image(data.files)) return;
    // A whole table copied from ksmd goes after the caret's paragraph, as the same table.
    if (ks.where !== "cell" && ks.pasteTable(data, -1)) return;
    const text = data ? data.getData("text/plain") : "";
    if (ks.tooLarge(text)) return;
    // Cells copied from a spreadsheet: at a chosen cell they fill the table from there, and in
    // text they make a new table, whose first row gives the names.
    if (ks.where === "cell" && ks.cell &&
      (ks.pasting.paste(data, text) || ks.range.pasteGrid(text, false))) return;
    // Text makes a table only where each line that holds text holds a tab. Text copied across a
    // table, with lines before and after it, so pastes as paragraphs, not as rows.
    const g = ks.range.grid(text);
    const empty = (row) => row.length === 1 && row[0] === "";
    if (g && g.some((row) => row.length > 1) && g.every((row) => row.length > 1 || empty(row))) {
      ks.sync();
      ks.act("ksmd_web_paste_table", ks.put(JSON.stringify(g)));
      return;
    }
    ks.sync();
    if (text) ks.act("ksmd_web_type", ks.put(text), 1);
    if (data && Array.from(data.types).includes("text/html")) {
      ks.say("Pasted as plain text. Formatting from the clipboard is not kept.");
    }
  });

  // Caution: **A copy or a cut of text writes the document's plain text, not the page's.** Over a
  // table or an image, the browser's own copy took the page's buttons and labels, as
  // "Rectangle, Arrow", and a paste made each a paragraph. A cut erases through the model.
  // A copy of chosen cells is the table's own (`range.js`).
  for (const type of ["copy", "cut"]) {
    root.addEventListener(type, (e) => {
      if (ks.where === "cell" || ks.table.owns(e.target) || field(e.target) || collapsed() || !e.clipboardData) return;
      flush();
      const text = selectedText();
      if (text === null) return;
      e.preventDefault();
      e.clipboardData.setData("text/plain", text);
      if (type !== "cut") return;
      ks.sync();
      ks.act("ksmd_web_erase", 1);
    });
  }

  // The selection's text: each text unit's selected part, a table's cells in tab-separated rows
  // as a copy of all its cells gives them, and an image's alt text and caption. A line break
  // stands between units. A chart, a diagram, a divider or an included file gives nothing.
  // Null where the selection is not in the document.
  function selectedText() {
    const s = window.getSelection();
    let a = ks.view.spotAt(s.anchorNode, s.anchorOffset);
    let f = ks.view.spotAt(s.focusNode, s.focusOffset);
    if (!a || !f) return null;
    if (later(a, f)) [a, f] = [f, a];
    const all = ks.view.blocks();
    const parts = [];
    const last = Math.min(f[0] === ks.SPOT.BLOCK_GAP ? f[1] - 1 : f[1], all.length - 1);
    for (let b = a[1]; b <= last; b++) {
      const el = all[b];
      if (el.classList.contains("u") || el.classList.contains("list")) {
        const units = el.classList.contains("list") ? ks.view.items(el) : [el];
        units.forEach((u, i) => {
          const text = ks.view.unitText(u);
          const len = ks.view.u8len(text);
          if (later(a, [ks.SPOT.TEXT, b, i, len]) || later([ks.SPOT.TEXT, b, i, 0], f)) return;
          const here = (p) => p[0] === ks.SPOT.TEXT && p[1] === b && p[2] === i;
          const from = here(a) ? a[3] : 0;
          const to = here(f) ? f[3] : len;
          parts.push(text.slice(ks.view.u16At(text, from), ks.view.u16At(text, to)));
        });
      } else if (!later(a, [ks.SPOT.BLOCK_GAP, b, 0, 0]) && !later([ks.SPOT.BLOCK_GAP, b + 1, 0, 0], f)) {
        const text = blockText(el, b);
        if (text) parts.push(text);
      }
    }
    return parts.join("\n");
  }

  function blockText(el, block) {
    if (el.classList.contains("table") && el.rowIds) {
      return ks.range.tableText(block).replace(/\r\n/g, "\n").replace(/\n$/, "");
    }
    if (el.classList.contains("figure")) {
      const caption = el.querySelector("figcaption");
      return [el.dataset.alt, caption ? caption.textContent : ""].filter((t) => t).join("\n");
    }
    return "";
  }

  // Whether spot `p` stands after spot `q`: by block, then the gap before a block, then each list
  // item's gap before its text, then the offset in the text.
  function later(p, q) {
    const key = (x) => [x[1], x[0] === ks.SPOT.BLOCK_GAP ? -1 : 2 * x[2] + (x[0] === ks.SPOT.TEXT ? 1 : 0),
      x[0] === ks.SPOT.TEXT ? x[3] : 0];
    const kp = key(p);
    const kq = key(q);
    for (let i = 0; i < 3; i++) if (kp[i] !== kq[i]) return kp[i] > kq[i];
    return false;
  }

  // Pastes the table a ksmd copy left on the clipboard, after the caret's paragraph, or into the gap
  // before block `at` where it is 0 or more. False where the clipboard holds no such table.
  ks.pasteTable = (data, at) => {
    const own = data ? data.getData(KSMD_TYPE) : "";
    if (!/^%ksmd [12]\r?\n\r?\n:::table /.test(own) || ks.tooLarge(own)) return false;
    ks.table.take();
    if (at >= 0) {
      ks.table.chooseCell(null);
      ks.setPlace("text");
      ks.root.focus({ preventScroll: true });
      ks.select([ks.SPOT.BLOCK_GAP, at, 0, 0], [ks.SPOT.BLOCK_GAP, at, 0, 0]);
    } else {
      ks.sync();
    }
    ks.act("ksmd_web_paste_ksmd", ks.put(own));
    return true;
  };

  root.addEventListener("drop", (e) => {
    if (ks.table.owns(e.target)) return;
    e.preventDefault();
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || files.length === 0) return;
    // The caret goes where the image was dropped, as a drop of text would put it.
    const at = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
    if (at && root.contains(at.startContainer)) {
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(at);
    }
    flush();
    image(files);
  });

  // A press or a key in the text makes the text the place a look acts on. The page's own
  // selection changes after each action do not.
  for (const type of ["mousedown", "keydown"]) {
    root.addEventListener(type, (e) => {
      if (!ks.table.owns(e.target)) ks.setPlace("text");
    }, true);
  }

  // A press between blocks, or after the last, puts the caret in the gap there.
  root.addEventListener("mousedown", (e) => {
    if (e.target !== root) return;
    e.preventDefault();
    flush();
    const all = ks.view.blocks();
    let b = all.length;
    for (let i = 0; i < all.length; i++) {
      const r = all[i].getBoundingClientRect();
      if (e.clientY < (r.top + r.bottom) / 2) {
        b = i;
        break;
      }
    }
    // Caution: **Focus the document without a scroll.** From a chosen cell, it jumped to its top.
    root.focus({ preventScroll: true });
    ks.place([ks.SPOT.BLOCK_GAP, b, 0, 0]);
  });

  // A gap stands only while the caret is in it. The blocks after a gap move up when it goes.
  // A table that is chosen or opened takes the gap away itself, at once (`hideCaret` in
  // `view.js`).
  // Caution: **A gap stays while the focus is outside the document**, in a bar, a menu or a
  // dialog, as the caret does: it comes back there. The table below went up a line as Insert
  // Function opened, and came down again a moment after it closed, so a press made then
  // landed a row too high.
  document.addEventListener("selectionchange", () => {
    const s = window.getSelection();
    const gap = root.querySelector(".gap");
    if (gap && s.rangeCount > 0 && root.contains(s.focusNode) && !gap.contains(s.focusNode) &&
      !ks.composing) {
      gap.remove();
    }
  });
}
