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
  const SVG = "http://www.w3.org/2000/svg";
  const W = 640;
  const H = 300;
  const PAD = { left: 56, right: 16, top: 16, bottom: 48 };

  function node(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  // Round marks for an axis from `lo` to `hi`: 1, 2 or 5 times a power of ten apart.
  function ticks(lo, hi) {
    const span = hi - lo || 1;
    const raw = span / 5;
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw);
    const first = Math.floor(lo / step) * step;
    const out = [];
    for (let v = first; v <= hi + step / 2; v += step) out.push(Number(v.toPrecision(12)));
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
    for (const m of marks) {
      svg.appendChild(node("line", { x1: PAD.left, x2: W - PAD.right, y1: y(m), y2: y(m),
        class: m === 0 ? "chart-zero" : "chart-grid" }));
      svg.appendChild(node("text", { x: PAD.left - 6, y: y(m) + 4, "text-anchor": "end",
        class: "chart-tick" }, String(m)));
    }
    const rows = b.lab.length;
    const band = (W - PAD.left - PAD.right) / Math.max(rows, 1);
    b.lab.forEach((label, r) => {
      svg.appendChild(node("text", { x: PAD.left + band * (r + 0.5), y: H - PAD.bottom + 16,
        "text-anchor": "middle", class: "chart-label" }, label));
    });
    b.ser.forEach((s, k) => {
      const colour = CHART_COLOURS[k % CHART_COLOURS.length];
      if (b.kind === "bar") {
        const width = band * 0.8 / b.ser.length;
        s.v.forEach((v, r) => {
          if (v === null) return;
          const x = PAD.left + band * r + band * 0.1 + width * k;
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
          const x = PAD.left + band * (r + 0.5);
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
    const el = document.createElement("figure");
    el.className = "b chart";
    el.contentEditable = "false";
    el.chart = b;
    const bar = document.createElement("div");
    bar.className = "chart-buttons";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "chart-edit";
    edit.textContent = "Edit";
    edit.title = "Choose the kind of chart, its labels, the columns drawn and its title";
    bar.appendChild(edit);
    bar.appendChild(ks.view.removeButton("Remove this chart; its table stays"));
    el.appendChild(bar);
    if (b.title) {
      const cap = document.createElement("figcaption");
      cap.textContent = b.title;
      el.appendChild(cap);
    }
    if (b.why) {
      const p = document.createElement("p");
      p.className = "problem";
      p.textContent = `This chart cannot be drawn: ${b.why}`;
      el.appendChild(p);
      return el;
    }
    el.appendChild(draw(b));
    if (b.ser.length > 1) {
      const key = document.createElement("div");
      key.className = "chart-key";
      b.ser.forEach((s, k) => {
        const item = document.createElement("span");
        const swatch = document.createElement("span");
        swatch.className = "chart-swatch";
        swatch.style.backgroundColor = CHART_COLOURS[k % CHART_COLOURS.length];
        item.append(swatch, s.n);
        key.appendChild(item);
      });
      el.appendChild(key);
    }
    return el;
  }

  let panel = null;
  function close() {
    if (panel) panel.remove();
    panel = null;
  }

  // The panel that sets a chart's kind, labels, columns and title.
  function ask(block) {
    close();
    const el = ks.view.blocks()[block];
    const b = el.chart;
    if (b.u === undefined) {
      ks.say(`This chart cannot be edited: ${b.why}`);
      return;
    }
    panel = document.createElement("div");
    panel.className = "chart-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chart");
    const kind = document.createElement("select");
    kind.className = "chart-kind";
    kind.add(new Option("Bars", "bar"));
    kind.add(new Option("Lines", "line"));
    kind.value = b.kind;
    const labels = document.createElement("select");
    labels.className = "chart-labels";
    b.cols.forEach((n, c) => labels.add(new Option(n || ks.table.letters(c), String(c))));
    labels.value = String(Math.max(b.l, 0));
    const columns = document.createElement("span");
    columns.className = "chart-columns";
    b.cols.forEach((n, c) => {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = String(c);
      box.checked = b.v.includes(c);
      label.append(box, ` ${n || ks.table.letters(c)}`);
      columns.appendChild(label);
    });
    const title = document.createElement("input");
    title.className = "chart-title";
    title.type = "text";
    title.placeholder = "Title";
    title.value = b.title;
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "chart-apply";
    apply.textContent = "Apply";
    apply.addEventListener("click", () => {
      const v = Array.from(columns.querySelectorAll("input:checked"), (x) => Number(x.value));
      close();
      ks.act("ksmd_web_set_chart", block, ks.put(JSON.stringify({ t: b.u, k: kind.value,
        l: Number(labels.value), v, title: title.value.trim() })));
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);
    panel.append(kind, " labelled by ", labels, " showing ", columns, title, apply, cancel);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    document.body.appendChild(panel);
    const at = el.getBoundingClientRect();
    panel.style.left = `${Math.max(4, at.left + window.scrollX)}px`;
    panel.style.top = `${at.top + window.scrollY}px`;
    kind.focus();
  }

  // The panel opens on the press, not on the click: the press closes an open cell, which can
  // draw the chart again, and the release would then land on another element.
  ks.root.addEventListener("mousedown", (e) => {
    const b = e.target.closest && e.target.closest(".chart-edit");
    if (!b || b.closest(".include .inside") || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ks.table.take();
    const block = ks.view.blocks().indexOf(b.closest(".b"));
    ask(block);
  }, true);
  document.addEventListener("mousedown", (e) => {
    if (panel && !panel.contains(e.target)) close();
  }, true);

  ks.chart = { render, ask, close };
}
