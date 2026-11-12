// ksmd page: the figures in the status bar. With two or more cells chosen, it shows the figures the
// person picked for them by a right-click on the bar, as Excel's status bar does: Average, Count,
// Numerical count, Min, Max and Sum. Rows a filter hides are left out, as there. Otherwise it shows
// the lines and characters of the selection, or of the whole document.
// A line is a line as written: each paragraph, heading, list item, quote and code line, and each
// line break typed inside one. A character is one a person sees, spaces left out, so a Japanese
// name written with a variation selector counts as the one character it shows.
"use strict";

// The figures for chosen cells, in the order the bar shows them, and those it shows until a person
// picks others: Excel's own.
const FIGURES = [["average", "Average"], ["count", "Count"], ["numbers", "Numerical count"],
  ["min", "Min"], ["max", "Max"], ["sum", "Sum"]];
const FIGURES_DEFAULT = ["average", "count", "sum"];
// The pause after a change before the lines and characters are counted, in milliseconds: longer
// than the gap between two keys of most people typing.
const FIGURES_PAUSE = 300;

function ksmdFigures(ks) {
  const box = document.querySelector(".status-bar .figures");
  box.title = "Lines and characters, or the figures for the chosen cells. Press to choose which " +
    "figures show; a right-click on the status bar does the same";
  let picked = new Set(FIGURES_DEFAULT);
  try {
    const kept = localStorage.getItem("ksmd.figures");
    if (kept !== null) picked = new Set(kept.split(",").filter((k) => FIGURES.some(([name]) => name === k)));
  } catch (_) { /* a browser that keeps nothing shows Excel's figures */ }

  // The chosen cells' figures by name, or null where fewer than two cells are chosen. A figure of
  // numbers is left out where the cells hold none, as Excel leaves it out.
  function cells() {
    if (!ks.inTable() || !ks.range.any()) return null;
    const r = ks.range.rect();
    const wrap = ks.view.blocks()[r.block];
    if (!wrap || !wrap.values) return null;
    const rows = wrap.querySelector("tbody").rows;
    const numbers = [];
    let filled = 0;
    for (let row = Math.max(r.r1, 0); row <= r.r2; row++) {
      if (rows[row] && rows[row].hidden) continue;
      for (let column = r.c1; column <= r.c2; column++) {
        const v = wrap.values[row] && wrap.values[row][column];
        if (!v || v.length < 2) continue;
        filled += 1;
        if (v[0] === 1) numbers.push(v[1]);
      }
    }
    const sum = numbers.reduce((a, x) => a + x, 0);
    const all = { count: String(filled), numbers: String(numbers.length) };
    if (numbers.length > 0) {
      all.average = ks.showNumber(sum / numbers.length);
      all.min = ks.showNumber(Math.min(...numbers));
      all.max = ks.showNumber(Math.max(...numbers));
      all.sum = ks.showNumber(sum);
    }
    return all;
  }

  // A text's characters as a person sees them, spaces left out.
  const graphemes = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter() : null;
  function characters(text) {
    const t = text.replace(/\s/g, "");
    if (!graphemes) return Array.from(t).length;
    let n = 0;
    for (const _ of graphemes.segment(t)) n += 1;
    return n;
  }
  // A text's lines and characters: [lines, characters].
  const measure = (text) => [text.split("\n").length, characters(text)];

  // Each block's counts, kept until its text changes, so typing counts again only what it changed.
  const known = new WeakMap();
  const UNITS = "p.b, h1, h2, h3, h4, h5, h6, blockquote, .li, pre:not(.gap)";
  function counted(el) {
    const text = ks.view.unitText(el);
    const k = known.get(el);
    if (k && k.text === text) return k.counts;
    const counts = measure(text);
    known.set(el, { text, counts });
    return counts;
  }

  // The lines and characters of the selection inside the document, or of all its prose. A block
  // the selection only touches at its edge is not counted.
  function lines() {
    const s = window.getSelection();
    const chosen = s.rangeCount > 0 && !s.isCollapsed && ks.root.contains(s.anchorNode);
    const range = chosen ? s.getRangeAt(0) : null;
    let lineCount = 0;
    let charCount = 0;
    for (const el of ks.root.querySelectorAll(UNITS)) {
      let counts;
      if (!range) counts = counted(el);
      else {
        if (!range.intersectsNode(el)) continue;
        const part = document.createRange();
        part.selectNodeContents(el);
        if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) {
          part.setStart(range.startContainer, range.startOffset);
        }
        if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
        if (part.collapsed) continue;
        counts = measure(ks.view.unitText(part.cloneContents()));
      }
      lineCount += counts[0];
      charCount += counts[1];
    }
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return `${plural(lineCount, "line")} · ${plural(charCount, "character")}${chosen ? " selected" : ""}`;
  }

  // The lines and characters shown on the bar. Each key would read every block again, a tenth of a
  // second in a long document, so they are counted once the person pauses, as the page count is
  // (`pages.js`). A document that takes long to count waits longer.
  let timer = 0;
  let cost = 0; // how long the last count took, in milliseconds
  function count() {
    timer = 0;
    const started = performance.now();
    box.textContent = lines();
    box.setAttribute("aria-label", `${box.textContent}. Choose the figures for chosen cells`);
    cost = performance.now() - started;
  }

  function update() {
    const all = cells();
    clearTimeout(timer);
    timer = 0;
    if (!all) {
      timer = setTimeout(count, Math.max(FIGURES_PAUSE, cost * 4));
      return;
    }
    box.textContent = FIGURES.filter(([name]) => picked.has(name) && name in all)
      .map(([name, label]) => `${label} ${all[name]}`).join(" · ");
    box.setAttribute("aria-label", `${box.textContent || "No figures"}. Choose the figures for chosen cells`);
  }

  // The menu of figures, each with its value for the chosen cells, as Excel's lists them. It stays
  // open, so several can be ticked in turn.
  function choose(from) {
    const all = cells() || {};
    ks.status.popup(from, "Figures for chosen cells", FIGURES.map(([name, label]) => [label, picked.has(name),
      () => {
        if (picked.has(name)) picked.delete(name);
        else picked.add(name);
        try {
          localStorage.setItem("ksmd.figures", FIGURES.map(([n]) => n).filter((n) => picked.has(n)).join(","));
        } catch (_) { /* a browser that keeps nothing forgets the choice */ }
        update();
      }, all[name] || ""]), false, true);
  }
  box.addEventListener("click", () => choose(box));
  ks.status.bar.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".status-zoom")) return;
    e.preventDefault();
    choose(box);
  });

  ks.status.also(update);
  update();
}
