// ksmd page: input. Text arrives through `beforeinput`, which is cancelled and turned into a model
// action; commands arrive through key presses and the toolbar. The page never keeps an edit the
// browser made, except an input method's composition while it lasts.
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
    if (c.spot[0] === 0) ks.select([0, c.spot[1], c.spot[2], from], [0, c.spot[1], c.spot[2], to]);
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
    const at = ks.view.spotAt(el, 0);
    return at;
  }

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
        if (a && f && a[0] === 0 && f[0] === 0 && a[1] === f[1] && a[2] === f[2]) ks.select(a, f);
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
    if (ks.table.owns(e.target)) return;
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
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    let name = null;
    if (mod && !e.altKey) {
      if (key === "z") name = e.shiftKey ? "redo" : "undo";
      else if (key === "y") name = "redo";
      else if (key === "b") name = "strong";
      else if (key === "i") name = "emphasis";
      else if (key === "e") name = "code";
      else if (key === "k") name = "link";
    } else if (mod && e.altKey && /^[0-6]$/.test(e.code.replace("Digit", ""))) {
      const n = e.code.replace("Digit", "");
      name = n === "0" ? "p" : `h${n}`;
    } else if (e.key === "Tab" && !mod && inList()) {
      name = e.shiftKey ? "outdent" : "indent";
    }
    if (name) {
      e.preventDefault();
      ks.command(name);
    }
  });

  function inList() {
    const s = window.getSelection();
    return s.rangeCount > 0 && !!ks.view.closest(s.focusNode, ".li");
  }

  root.addEventListener("paste", (e) => {
    if (ks.table.owns(e.target)) return;
    e.preventDefault();
    flush();
    const data = e.clipboardData;
    const text = data ? data.getData("text/plain") : "";
    ks.sync();
    if (text) ks.act("ksmd_web_type", ks.put(text), 1);
    if (data && Array.from(data.types).includes("text/html")) {
      ks.say("Pasted as plain text. Formatting from the clipboard is not kept.");
    }
  });

  root.addEventListener("drop", (e) => {
    if (!ks.table.owns(e.target)) e.preventDefault();
  });

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
    root.focus();
    ks.place([1, b, 0, 0]);
  });

  // A gap stands only while the caret is in it.
  document.addEventListener("selectionchange", () => {
    const s = window.getSelection();
    const gap = root.querySelector(".gap");
    if (gap && s.rangeCount > 0 && !gap.contains(s.focusNode) && !ks.composing) gap.remove();
  });
}
