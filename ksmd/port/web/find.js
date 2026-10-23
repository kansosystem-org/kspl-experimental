// ksmd page: find and replace. Ctrl+F opens the find bar and Ctrl+H the bar with its replace part.
// Find looks in the text the document shows, and in each cell's text as a person edits it: a
// formula's source, not its value. A match can cross formatting, as `**a**b` holds "ab", since a
// person sees one word there. It stays inside one paragraph, heading, item or cell.
// Caution: **The find bar never changes the document, and marks no text in it.** Matches show
// through the browser's highlights (`CSS.highlights`), which add no element, so an input method's
// composition and the model's spots are left as they are. Only Replace and Replace all act.
"use strict";

function ksmdFind(ks) {
  const bar = document.querySelector(".find");
  if (!bar) return;
  const box = bar.querySelector(".find-text");
  const withBox = bar.querySelector(".replace-text");
  const part = bar.querySelector(".replace-part");
  const count = bar.querySelector(".find-count");
  const matchCase = bar.querySelector(".find-case");
  const marks = typeof Highlight === "function" && window.CSS && CSS.highlights;

  // The matches in the document's order: { kind: "t", block, item, el, from, to } in a unit's text,
  // where `from` and `to` count UTF-8 bytes as the model does, or { kind: "c", block, row, column,
  // text, from16, to16 } in a cell's text. `at` is the current one, or -1.
  let found = [];
  let at = -1;
  // Where the focus was before the bar took it, so closing the bar can give it back.
  let back = null;

  const ascii = /^[\x00-\x7f]*$/;
  // Where `query` stands in `text`, as UTF-16 [start, end] pairs that do not overlap. Without
  // Match case, each character is folded alone, so a match keeps the text's own places.
  function places(text, query, exact) {
    const out = [];
    if (exact || (ascii.test(text) && ascii.test(query))) {
      const t = exact ? text : text.toLowerCase();
      const q = exact ? query : query.toLowerCase();
      for (let i = t.indexOf(q); i >= 0; i = t.indexOf(q, i + q.length)) out.push([i, i + q.length]);
      return out;
    }
    const chars = Array.from(text);
    const folded = chars.map((c) => c.toLowerCase());
    const q = Array.from(query).map((c) => c.toLowerCase());
    const starts = [];
    let n = 0;
    for (const c of chars) {
      starts.push(n);
      n += c.length;
    }
    starts.push(n);
    for (let i = 0; i + q.length <= folded.length;) {
      let k = 0;
      while (k < q.length && folded[i + k] === q[k]) k++;
      if (k === q.length) {
        out.push([starts[i], starts[i + q.length]]);
        i += q.length;
      } else {
        i += 1;
      }
    }
    return out;
  }

  // Each cell's text as a person edits it, names first; kept on the table's element, which every
  // change to the table makes anew.
  function written(wrap, block) {
    if (!wrap.written) {
      const len = ks.call("ksmd_web_table_texts", block);
      wrap.written = len > 0 ? JSON.parse(ks.out(len)) : [];
    }
    return wrap.written;
  }

  // Finds every match. The text shown from an included file is not searched: it edits in a tab of
  // its own. Nor are the rows a filter hides, so Replace all changes no row out of sight.
  function search() {
    const query = box.value;
    found = [];
    if (query === "" || ks.stopped) return;
    const exact = matchCase.checked;
    const text = (block, item, el) => {
      const shown = ks.view.unitText(el);
      for (const [a, b] of places(shown, query, exact)) {
        found.push({ kind: "t", block, item, el, from: ks.view.u8len(shown.slice(0, a)),
          to: ks.view.u8len(shown.slice(0, b)) });
      }
    };
    ks.view.blocks().forEach((el, block) => {
      if (el.classList.contains("table")) {
        const body = el.querySelector("tbody").rows;
        written(el, block).forEach((cells, k) => {
          if (k > 0 && body[k - 1].hidden) return;
          cells.forEach((t, column) => {
            for (const [a, b] of places(t, query, exact)) {
              found.push({ kind: "c", block, row: k - 1, column, text: t, from16: a, to16: b });
            }
          });
        });
      } else if (el.classList.contains("list")) {
        ks.view.items(el).forEach((li, item) => text(block, item, li));
      } else if (el.classList.contains("u")) {
        text(block, 0, el);
      }
    });
  }

  const cellOf = (m) => {
    const wrap = ks.view.blocks()[m.block];
    return wrap ? wrap.querySelector(`[data-r="${m.row}"][data-c="${m.column}"]`) : null;
  };

  function rangeOf(m) {
    const a = ks.view.pointIn(m.el, m.from);
    const b = ks.view.pointIn(m.el, m.to);
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }

  // Shows the matches, the current one apart, and how many there are.
  function show() {
    for (const el of ks.root.querySelectorAll(".found, .found-now")) el.classList.remove("found", "found-now");
    if (marks) {
      CSS.highlights.delete("ksmd-found");
      CSS.highlights.delete("ksmd-found-now");
    }
    count.textContent = found.length > 0 ? `${at + 1} of ${found.length}` :
      box.value === "" ? "" : "No matches";
    if (bar.hidden) return;
    const all = marks ? new Highlight() : null;
    const now = marks ? new Highlight() : null;
    found.forEach((m, k) => {
      if (m.kind === "c") {
        const el = cellOf(m);
        if (el) el.classList.add(k === at ? "found-now" : "found");
      } else if (marks) {
        (k === at ? now : all).add(rangeOf(m));
      }
    });
    if (marks) {
      CSS.highlights.set("ksmd-found", all);
      CSS.highlights.set("ksmd-found-now", now);
    }
  }

  // Scrolls the current match into sight.
  function reveal() {
    const m = found[at];
    if (!m) return;
    const el = m.kind === "c" ? cellOf(m) : m.el;
    if (!el) return;
    if (m.kind === "c") {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      return;
    }
    const r = rangeOf(m).getBoundingClientRect();
    if (r.top < bar.getBoundingClientRect().bottom || r.bottom > window.innerHeight - 40) {
      el.scrollIntoView({ block: "center" });
    }
  }

  // The first match at or after the caret, so a search goes on from where the person reads.
  function fromCaret() {
    const s = ks.sel;
    if (!s || found.length === 0) return found.length > 0 ? 0 : -1;
    const [, block, item, offset] = s.a;
    const k = found.findIndex((m) => m.block > block || (m.block === block &&
      (m.kind === "c" || m.item > item || (m.item === item && m.from >= offset))));
    return k < 0 ? 0 : k;
  }

  function refresh(fromStart) {
    search();
    at = found.length === 0 ? -1 : fromStart ? fromCaret() : Math.min(Math.max(at, 0), found.length - 1);
    show();
    if (fromStart) reveal();
  }

  function step(by) {
    if (found.length === 0) return;
    at = (at + by + found.length) % found.length;
    show();
    reveal();
  }

  function open(replace) {
    const a = document.activeElement;
    if (bar.hidden) back = a && a !== document.body && !bar.contains(a) ? a : ks.root;
    // A short selection in one line becomes the query, as in Word and Chrome.
    const s = window.getSelection();
    const picked = s.rangeCount > 0 && ks.root.contains(s.anchorNode) ? s.toString() : "";
    if (picked && !picked.includes("\n") && picked.length <= 100) box.value = picked;
    bar.hidden = false;
    if (replace) part.hidden = false;
    else if (bar.dataset.part !== "1") part.hidden = true;
    bar.dataset.part = part.hidden ? "0" : "1";
    box.focus();
    box.select();
    refresh(true);
  }

  // Closes the bar. The current match becomes the selection, or the chosen cell, so the person
  // goes on from there.
  function close() {
    if (bar.hidden) return;
    const m = found[at];
    bar.hidden = true;
    bar.dataset.part = "0";
    show();
    if (m && m.kind === "t") {
      ks.root.focus({ preventScroll: true });
      ks.place([0, m.block, m.item, m.from], [0, m.block, m.item, m.to]);
    } else if (m) {
      ks.range.set(m.block, m.row, m.column, null);
      const el = cellOf(m);
      if (el) el.focus({ preventScroll: true });
    } else if (back && back.isConnected) {
      back.focus({ preventScroll: true });
    } else {
      ks.root.focus({ preventScroll: true });
    }
    back = null;
  }

  // The matches to replace, in the form `ksmd_web_replace` takes.
  function payload(list) {
    const spans = [];
    const cells = new Map();
    for (const m of list) {
      if (m.kind === "t") {
        spans.push([m.block, m.item, m.from, m.to]);
        continue;
      }
      const key = `${m.block}:${m.row}:${m.column}`;
      if (!cells.has(key)) cells.set(key, { m, parts: [] });
      cells.get(key).parts.push(m);
    }
    const c = [];
    for (const { m, parts } of cells.values()) {
      let t = m.text;
      for (const p of parts.slice().reverse()) t = t.slice(0, p.from16) + withBox.value + t.slice(p.to16);
      c.push([m.block, m.row, m.column, t]);
    }
    return { t: withBox.value, s: spans, c };
  }

  function replace(all) {
    ks.flush();
    ks.table.take();
    search();
    if (at >= found.length) at = found.length - 1;
    const list = all ? found : found[at] ? [found[at]] : [];
    if (list.length === 0) {
      show();
      return;
    }
    // Showing the result puts the document's selection back, which takes the focus; it returns to
    // the bar, so the person can press again.
    const had = document.activeElement;
    const r = ks.act("ksmd_web_replace", ks.put(JSON.stringify(payload(list))));
    if (had && bar.contains(had)) had.focus();
    if (r && r.ok && all) ks.say(`Replaced ${list.length} ${list.length === 1 ? "match" : "matches"}.`);
    refresh(false);
    reveal();
  }

  // After each action, the matches are found again in what the page now shows.
  ks.rendered.push(() => {
    if (!bar.hidden && box.value !== "") refresh(false);
  });

  bar.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) e.preventDefault();
  });
  bar.addEventListener("click", (e) => {
    const b = e.target.closest("[data-find]");
    if (!b) return;
    const what = b.dataset.find;
    if (what === "next" || what === "previous") step(what === "next" ? 1 : -1);
    else if (what === "replace" || what === "all") replace(what === "all");
    else if (what === "close") close();
  });
  box.addEventListener("input", (e) => {
    if (!e.isComposing) refresh(true);
  });
  box.addEventListener("compositionend", () => refresh(true));
  matchCase.addEventListener("change", () => refresh(true));
  bar.addEventListener("keydown", (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter" && e.target === box) {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" && e.target === withBox) {
      e.preventDefault();
      replace(false);
    }
  });

  // Ctrl+F and Ctrl+H open the bar wherever the focus is, in place of the browser's own find and
  // history. F3 and Shift+F3 step through the matches while it is open.
  document.addEventListener("keydown", (e) => {
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (mod && (key === "f" || key === "h")) {
      e.preventDefault();
      e.stopPropagation();
      ks.command(key === "h" ? "replace" : "find");
    } else if (e.key === "F3" && !bar.hidden) {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    }
  }, true);

  ks.find = { open, close };
}
