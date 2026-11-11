// ksmd page: the references of a formula being typed, in colour. While an open cell holds a
// formula, each reference that names cells of this document takes a colour of a fixed list, in
// the order written; the same cells written twice keep one colour. Its text shows in that colour
// in the cell, and a frame of that colour stands round the cells it names, in any table of the
// document. The colours follow each change, and go when the cell closes.
// The editor says which text is a reference and what it names (`ksmd_web_references` in
// `bridge_tables.kspl`), so the colours agree with what taking the formula attaches.
// The bracket beside the caret and the one it pairs with are marked in the same copy, as the
// editor pairs them (`ksmd_web_bracket_pair`), so a bracket inside quoted text is never marked.
"use strict";

function ksmdRefs(ks) {
  // How many colours stand in the list (`--ref-1` to `--ref-8` in `page.css`).
  const COLOURS = 8;
  // The open cell's box, the block of its table, the copy of its text, and the frames drawn.
  let input = null;
  let block = -1;
  let copy = null;
  let frames = [];
  let refs = []; // the references the box holds now, coloured
  let watch = null;
  // While an input method composes, the box shows its own text and the copy waits.
  let composing = false;

  // The references in a text, in UTF-16 units: [{ from, to, key, u, r1, c1, r2, c2, whole }].
  function read(text) {
    const out = ks.out(ks.w.ksmd_web_references(block, ks.put(text)));
    if (!out) return [];
    const units = (n) => ks.view.u16At(text, n);
    return JSON.parse(out).map(([from, to, u, ra, ca, rb, cb, whole]) => {
      const r1 = Math.min(ra, rb);
      const r2 = Math.max(ra, rb);
      const c1 = Math.min(ca, cb);
      const c2 = Math.max(ca, cb);
      return { from: units(from), to: units(to), u, r1, c1, r2, c2, whole,
        key: `${u} ${whole ? "" : `${r1}:${r2}`} ${c1}:${c2}` };
    });
  }

  // Gives each reference its colour, from 1: the first cells named take the first colour, and
  // cells named again keep theirs.
  function colour(found) {
    const given = new Map();
    for (const r of found) {
      if (!given.has(r.key)) given.set(r.key, (given.size % COLOURS) + 1);
      r.colour = given.get(r.key);
    }
    return found;
  }

  // A text area colours no part of its text. So a copy of the text, coloured, stands behind the
  // box, and the box's own text is transparent; the caret and the selection stay the browser's.
  // The copy stands where the box would, as an absolute box with no offsets, and takes its sizes.
  function makeCopy() {
    const cs = getComputedStyle(input);
    copy = ks.el("div", "cell-copy");
    copy.setAttribute("aria-hidden", "true");
    for (const p of ["font-family", "font-size", "font-weight", "font-style", "letter-spacing",
      "line-height", "text-align", "white-space", "overflow-wrap", "word-break", "tab-size",
      "padding-top", "padding-right", "padding-bottom", "padding-left", "border-top-width",
      "border-right-width", "border-bottom-width", "border-left-width", "color", "background-color"]) {
      copy.style.setProperty(p, cs.getPropertyValue(p));
    }
    // A one-line box shows its line in the middle, and scrolls sideways.
    if (input.tagName === "INPUT") copy.classList.add("one-line");
    input.style.caretColor = cs.color;
    input.parentNode.insertBefore(copy, input);
  }

  // The two brackets that pair at the caret, in UTF-16 units: [a, b], or null. A selection, or a
  // caret beside no bracket that pairs, marks none.
  function pairAt(text) {
    if (!text.startsWith("=") || input.selectionStart !== input.selectionEnd) return null;
    const caret = ks.view.u8len(text.slice(0, input.selectionStart));
    const out = ks.out(ks.w.ksmd_web_bracket_pair(ks.put(text), caret));
    if (!out) return null;
    return JSON.parse(out).map((n) => ks.view.u16At(text, n));
  }

  // Writes the coloured copy: each reference in its colour, and the brackets that pair marked.
  function paint(text, pair) {
    copy.textContent = "";
    const line = document.createElement("span");
    const marks = refs.map((r) => ({ from: r.from, to: r.to, cls: "ref-text", ref: r.colour }));
    for (const at of pair || []) marks.push({ from: at, to: at + 1, cls: "bracket-pair", ref: 0 });
    marks.sort((a, b) => a.from - b.from);
    let at = 0;
    for (const m of marks) {
      line.append(text.slice(at, m.from));
      const part = ks.el("span", m.cls);
      if (m.ref) part.dataset.ref = String(m.ref);
      part.textContent = text.slice(m.from, m.to);
      line.appendChild(part);
      at = m.to;
    }
    // A last line break needs a character after it to take its line, as the box gives it one.
    line.append(text.slice(at), text.endsWith("\n") ? " " : "");
    copy.appendChild(line);
    fit();
  }

  function fit() {
    if (!copy) return;
    copy.style.width = `${input.offsetWidth}px`;
    copy.style.height = `${input.offsetHeight}px`;
    copy.scrollTop = input.scrollTop;
    copy.scrollLeft = input.scrollLeft;
  }

  // The table element of a table's place in this document's model; none for a table shown from
  // an included file.
  const tableOf = (u) => ks.view.blocks().find((el) => el.classList.contains("table") && el.u === u &&
    !el.included) || null;

  // A frame round the cells a reference names, inside the table's element, over the rows and
  // columns that show. A filter's rows and a hidden group's columns are passed over.
  function frame(r) {
    const wrap = tableOf(r.u);
    if (!wrap) return;
    const rows = wrap.querySelector("tbody").rows;
    const last = r.whole ? rows.length - 1 : Math.min(r.r2, rows.length - 1);
    const shown = [];
    for (let i = r.whole ? 0 : r.r1; i <= last; i++) if (!rows[i].hidden) shown.push(i);
    const folded = wrap.foldedColumns || [];
    const columns = [];
    for (let c = r.c1; c <= r.c2; c++) if (!folded[c]) columns.push(c);
    if (shown.length === 0 || columns.length === 0) return;
    const cell = (row, c) => wrap.querySelector(`td[data-r="${row}"][data-c="${c}"]`);
    const a = cell(shown[0], columns[0]);
    const b = cell(shown[shown.length - 1], columns[columns.length - 1]);
    if (!a || !b) return;
    const zoom = ks.zoom ? ks.zoom.factor() : 1;
    const box = wrap.getBoundingClientRect();
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    const el = ks.el("div", "ref-frame");
    el.dataset.ref = String(r.colour);
    el.dataset.cells = `${r.u} ${shown[0]} ${columns[0]} ${shown[shown.length - 1]} ${columns[columns.length - 1]}`;
    el.style.left = `${(ra.left - box.left) / zoom}px`;
    el.style.top = `${(ra.top - box.top) / zoom}px`;
    el.style.width = `${(rb.right - ra.left) / zoom}px`;
    el.style.height = `${(rb.bottom - ra.top) / zoom}px`;
    wrap.appendChild(el);
    frames.push(el);
  }

  function unframe() {
    for (const el of frames) el.remove();
    frames = [];
  }

  // Reads the box again: the colours of its text, and the frames.
  function sync() {
    if (!input) return;
    if (!input.isConnected) {
      detach();
      return;
    }
    if (composing) return;
    refs = colour(input.value.startsWith("=") ? read(input.value) : []);
    repaint();
    unframe();
    const seen = new Set();
    for (const r of refs) {
      if (seen.has(r.key)) continue;
      seen.add(r.key);
      frame(r);
    }
  }

  // Shows the copy again, as the caret moves: the copy shows while it marks anything.
  function repaint() {
    if (!input || composing || !input.isConnected) return;
    const text = input.value;
    const pair = pairAt(text);
    const any = refs.length > 0 || !!pair;
    input.classList.toggle("tinted", any);
    copy.hidden = !any;
    if (any) paint(text, pair);
  }
  // The caret moves without an input event: by the arrow keys, a press, or Home and End.
  const moved = () => {
    if (input && document.activeElement === input) repaint();
  };
  document.addEventListener("selectionchange", moved);

  // Serves a cell's box while it is open; `at` is the block of its table. A box opened by an input
  // method's first key is opened `composing`.
  function attach(box, at, whileComposing = false) {
    detach();
    input = box;
    block = at;
    makeCopy();
    composing = whileComposing;
    if (composing) onCompose();
    box.addEventListener("input", onInput);
    box.addEventListener("scroll", fit);
    box.addEventListener("compositionstart", onCompose);
    box.addEventListener("compositionend", onComposed);
    box.addEventListener("keyup", moved);
    box.addEventListener("mouseup", moved);
    // The box grows with its lines, which moves the rows below it, and with them the frames.
    if (window.ResizeObserver) {
      watch = new ResizeObserver(() => sync());
      watch.observe(box);
    }
    sync();
  }

  function onInput(e) {
    if (!e.isComposing) sync();
  }
  function onCompose() {
    composing = true;
    input.classList.remove("tinted");
    copy.hidden = true;
  }
  function onComposed() {
    composing = false;
    setTimeout(sync, 0);
  }

  // Takes the colours and the frames away, as the cell closes.
  function detach() {
    unframe();
    if (watch) watch.disconnect();
    watch = null;
    if (copy) copy.remove();
    copy = null;
    if (input) {
      input.classList.remove("tinted");
      input.style.caretColor = "";
      input.removeEventListener("input", onInput);
      input.removeEventListener("scroll", fit);
      input.removeEventListener("compositionstart", onCompose);
      input.removeEventListener("compositionend", onComposed);
      input.removeEventListener("keyup", moved);
      input.removeEventListener("mouseup", moved);
    }
    input = null;
    refs = [];
  }

  // A showing of the document can put new tables in place, and the frames are drawn again; it can
  // also take the box away.
  ks.rendered.push(sync);
  window.addEventListener("resize", sync);

  ks.refs = { attach, detach };
}
