// ksmd page: a chart block, drawn as SVG from the table's calculated values each time the tables
// are shown again. A bar chart groups each row's bars under its label; a line chart joins each
// column's points. The axis starts at zero, or below it where a value is below zero, and its
// marks fall on round numbers. A cell that holds no number leaves a gap.
// The chart's Edit button opens a small panel: the kind, the column of labels, the columns drawn
// and a title; Apply makes them one step of undo.
"use strict";

// Colours for up to eight columns, told apart by people with the common kinds of colour blindness;
// the last is grey, not black, so it shows on a dark page too.
const CHART_COLOURS = ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00",
  "#f0e442", "#999999"];

function ksmdChart(ks) {
  const W = 640;
  const H = 300;
  const PAD = { right: 16, top: 16, bottom: 48 };
  // The marks' and labels' font is 12 pixels (`.chart-tick` in `tools.css`). A digit or a Latin
  // letter takes at most 7 pixels of it, a wide character such as a kanji 12. The SVG is drawn
  // before it stands in the page, so the widths are estimated, not measured.
  const textWidth = (s) => Array.from(s).reduce((w, ch) => w + (ch.codePointAt(0) >= 0x1100 ? 12 : 7), 0);

  // The widest a label stands before it is cut, in the chart's pixels.
  const LABEL_MOST = 120;
  // `s` cut to `room` pixels, with `…` where characters were left out.
  function cut(s, room) {
    if (textWidth(s) <= room) return s;
    const chars = Array.from(s);
    while (chars.length > 0 && textWidth(chars.join("") + "…") > room) chars.pop();
    return chars.join("") + "…";
  }

  const node = ks.svg;

  // An axis mark as a cell's Thousands format shows it: `,` between thousands and `.` for the
  // point, as the file writes numbers everywhere. Past 15 digits the short form `1e+21` stays.
  const markText = (m) => Math.abs(m) < 1e15 ?
    m.toLocaleString("en-US", { maximumFractionDigits: 12 }) : String(m);

  // Round marks for an axis from `lo` to `hi`: 1, 2 or 5 times a power of ten apart. The first
  // mark is at or below `lo` and the last at or above `hi`, so every bar and point falls between
  // them. The small allowance keeps a value that is a mark, such as 1.1 over 0.1, from adding one.
  function ticks(lo, hi) {
    const span = hi - lo || 1;
    const raw = span / 5;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
    const first = Math.floor(lo / step + 1e-9);
    const last = Math.ceil(hi / step - 1e-9);
    const out = [];
    for (let k = first; k <= last; k++) out.push(Number((k * step).toPrecision(12)));
    return out;
  }

  function draw(b) {
    const svg = node("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", class: "chart-svg" });
    svg.setAttribute("aria-label", b.title || `Chart of ${b.ser.map((s) => s.n).join(", ")}`);
    const numbers = b.ser.flatMap((s) => s.v.filter((v) => v !== null));
    const lo = Math.min(0, ...numbers);
    const hi = Math.max(0, ...numbers);
    const marks = ticks(lo, hi);
    const top = marks[marks.length - 1];
    const bottom = marks[0];
    const y = (v) => PAD.top + (H - PAD.top - PAD.bottom) * (top - v) / (top - bottom || 1);
    // The left edge makes room for the widest mark, so 12,000,000 keeps its first digits.
    const texts = marks.map(markText);
    const left = Math.max(56, 12 + Math.max(...texts.map(textWidth)));
    marks.forEach((m, i) => {
      svg.appendChild(node("line", { x1: left, x2: W - PAD.right, y1: y(m), y2: y(m),
        class: m === 0 ? "chart-zero" : "chart-grid" }));
      svg.appendChild(node("text", { x: left - 6, y: y(m) + 4, "text-anchor": "end",
        class: "chart-tick" }, texts[i]));
    });
    const rows = b.lab.length;
    const band = (W - left - PAD.right) / Math.max(rows, 1);
    // Every `every`th label shows, so the labels do not overlap past about 30 rows. A label wider
    // than its room is cut with `…`, and its whole text shows as the label's tooltip.
    const need = Math.min(LABEL_MOST, Math.max(0, ...b.lab.map(textWidth))) + 8;
    const every = Math.max(1, Math.ceil(need / band));
    b.lab.forEach((label, r) => {
      if (r % every !== 0) return;
      const x = left + band * (r + 0.5);
      const shown = cut(label, Math.min(band * every, 2 * Math.min(x, W - x)) - 8);
      const text = node("text", { x, y: H - PAD.bottom + 16, "text-anchor": "middle",
        class: "chart-label" }, shown);
      if (shown === label) {
        svg.appendChild(text);
        return;
      }
      const g = node("g", {});
      g.append(node("title", {}, label), text);
      svg.appendChild(g);
    });
    b.ser.forEach((s, k) => {
      const colour = CHART_COLOURS[k % CHART_COLOURS.length];
      if (b.kind === "bar") {
        const width = band * 0.8 / b.ser.length;
        s.v.forEach((v, r) => {
          if (v === null) return;
          const x = left + band * r + band * 0.1 + width * k;
          svg.appendChild(node("rect", { x, y: Math.min(y(v), y(0)), width: Math.max(width - 1, 1),
            height: Math.abs(y(0) - y(v)), fill: colour }));
        });
      } else {
        let path = "";
        s.v.forEach((v, r) => {
          if (v === null) {
            path += " ";
            return;
          }
          const x = left + band * (r + 0.5);
          path += `${/[0-9]$/.test(path) ? " L" : " M"}${x} ${y(v)}`;
          svg.appendChild(node("circle", { cx: x, cy: y(v), r: 3, fill: colour }));
        });
        svg.appendChild(node("path", { d: path.trim(), fill: "none", stroke: colour,
          "stroke-width": 2 }));
      }
    });
    return svg;
  }

  function render(b) {
    const el = ks.el("figure", "b chart");
    el.contentEditable = "false";
    el.chart = b;
    const bar = ks.el("div", "chart-buttons");
    // A chart of an included file is edited in that file's own tab, so it has no Edit here.
    if (!b.included) {
      bar.appendChild(ks.button("Edit", "chart-edit", "Choose the kind of chart, its labels, the columns drawn and its title"));
    }
    bar.appendChild(ks.view.removeButton("Remove this chart; its table stays"));
    el.appendChild(bar);
    if (b.title) {
      const cap = document.createElement("figcaption");
      cap.textContent = b.title;
      el.appendChild(cap);
    }
    if (b.why) {
      const p = ks.el("p", "problem", `This chart cannot be drawn: ${b.why}`);
      el.appendChild(p);
      return el;
    }
    // The chart and the shapes drawn over it share one box (`drawings.js`).
    const picture = ks.el("div", "picture");
    picture.appendChild(draw(b));
    el.appendChild(picture);
    if (b.ser.length > 1) {
      const key = ks.el("div", "chart-key");
      b.ser.forEach((s, k) => {
        const item = document.createElement("span");
        const swatch = ks.el("span", "chart-swatch");
        swatch.style.backgroundColor = CHART_COLOURS[k % CHART_COLOURS.length];
        item.append(swatch, s.n);
        key.appendChild(item);
      });
      el.appendChild(key);
    }
    return el;
  }

  // The panel that sets a chart's kind, labels, columns or rows, and title.
  function ask(block) {
    const el = ks.view.blocks()[block];
    const b = el.chart;
    if (b.u === undefined) {
      ks.say(`This chart cannot be edited: ${b.why}`);
      return;
    }
    const panel = ks.panel("chart-panel", "Chart", () => {
      const v = Array.from(columns.querySelectorAll("input:checked"), (x) => Number(x.value));
      const rows = by.value === "rows";
      ks.act("ksmd_web_set_chart", block, ks.put(JSON.stringify({ t: b.u, k: kind.value,
        l: Number(labels.value), v, title: title.value.trim(), r: rows ? 1 : 0,
        f: Number(ends[0].value), e: Number(ends[1].value) })));
    });
    const kind = ks.el("select", "chart-kind");
    kind.add(new Option("Bars", "bar"));
    kind.add(new Option("Lines", "line"));
    kind.value = b.kind;
    const labels = ks.el("select", "chart-labels");
    b.cols.forEach((n, c) => labels.add(new Option(n || ks.table.letters(c), String(c))));
    labels.value = String(Math.max(b.l, 0));
    // Series in columns, or in rows as a burn-up chart of a plan whose months stand across.
    const by = ks.el("select", "chart-by");
    by.add(new Option("Series in columns", "columns"));
    by.add(new Option("Series in rows", "rows"));
    by.value = b.r ? "rows" : "columns";
    const name = (c) => b.cols[c] || ks.table.letters(c);
    const ends = ["chart-from", "chart-to"].map((cls, i) => {
      const pick = ks.el("select", cls);
      b.cols.forEach((n, c) => pick.add(new Option(name(c), String(c))));
      pick.value = String(b.r ? (i === 0 ? b.f : b.e) : (i === 0 ? 0 : b.cols.length - 1));
      return pick;
    });
    const span = document.createElement("span");
    span.append(" from ", ends[0], " to ", ends[1]);
    // The table's own block, whose values name the rows.
    const table = ks.view.blocks().find((x) => x.classList.contains("table") && x.u === b.u && !x.included);
    const columns = ks.el("span", "chart-columns");
    // The boxes: the table's columns, or the rows by their text in the labels column. Only the
    // rows the editor takes as series are offered (`sr`): text written in the cell, not a
    // calculated value, and a name the saved chart finds that row by.
    const boxes = () => {
      columns.textContent = "";
      const rows = by.value === "rows";
      const l = Number(labels.value);
      const rowName = (r) => {
        const v = table && table.values[r] && table.values[r][l];
        return v && v[0] === 2 ? String(v[1]) : `Row ${r + 1}`;
      };
      const items = rows ? (b.sr[l] || []).map((r) => [r, rowName(r)]) : b.cols.map((n, c) => [c, name(c)]);
      for (const [at, text] of items) {
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = String(at);
        box.checked = !!b.r === rows && b.v.includes(at);
        label.append(box, ` ${text}`);
        columns.appendChild(label);
      }
      span.hidden = !rows;
    };
    by.addEventListener("change", boxes);
    labels.addEventListener("change", boxes);
    boxes();
    const title = ks.el("input", "chart-title");
    title.type = "text";
    title.placeholder = "Title";
    title.value = b.title;
    panel.el.append(kind, " ", by, " labelled by ", labels, span, " showing ", columns, title);
    panel.show();
    const at = el.getBoundingClientRect();
    panel.el.style.left = `${Math.max(4, at.left + window.scrollX)}px`;
    panel.el.style.top = `${at.top + window.scrollY}px`;
    kind.focus();
  }

  // The panel opens on the press, not on the click: the press closes an open cell, which can
  // draw the chart again, and the release would then land on another element. Enter and Space
  // give a click with no press (`detail` 0), which opens it too.
  function edit(e) {
    const b = e.target.closest && e.target.closest(".chart-edit");
    if (!b || b.closest(".include .inside") || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ks.table.take();
    const block = ks.view.blocks().indexOf(b.closest(".b"));
    ask(block);
  }
  ks.root.addEventListener("mousedown", edit, true);
  ks.root.addEventListener("click", (e) => {
    if (e.detail === 0) edit(e);
  });

  ks.chart = { render };
}
