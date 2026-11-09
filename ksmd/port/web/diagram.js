// ksmd page: a diagram, a drawing area of boxes and the arrows between them, as a screen
// transition chart or a system's parts. Its tools draw a box, a diamond, a start or end dot, a
// dashed group or a note by a drag across the area, and an arrow or a line by a drag from one
// shape to another. An arrow is tied to its two shapes, so a moved shape keeps its arrows.
// A press chooses a shape or an arrow. A drag moves the shape, its corner handle resizes it, and a
// group carries the shapes inside it. A chosen arrow's handles bend it, and a double-click on a
// bend takes it away. A double-click on a shape or an arrow writes its words; Mono gives a shape a
// fixed-width font, for a screen's mock-up. Delete takes the chosen part away, and the arrows of a
// shape go with it.
// Each change sends the whole `:::diagram` clause, so the file's reader checks it, and it is one
// step of undo (`ksmd/edit/editor_diagrams.kspl`). The diagram shows at its own size; paper
// shrinks it to the page's width.
"use strict";

function ksmdDiagram(ks) {
  const SVG = "http://www.w3.org/2000/svg";
  const SHAPES = [["box", "Box"], ["diamond", "Diamond"], ["start", "Start"], ["end", "End"],
    ["group", "Group"], ["note", "Note"]];
  const LINKS = [["arrow", "Arrow"], ["line", "Line"]];
  // The colours offered for lines and words, and for grounds, as the writer keeps them. The first
  // of each is the page's own, which the file names by leaving the colour out.
  const COLOURS = [["", "Default"], ["#c00000", "Red"], ["#1f5fbf", "Blue"], ["#1a7f37", "Green"],
    ["#7f6000", "Brown"], ["#000000", "Black"]];
  const FILLS = [["", "Default"], ["#fff2cc", "Yellow"], ["#ddebf7", "Blue"], ["#e2efda", "Green"],
    ["#fce4d6", "Red"], ["#ededed", "Grey"]];
  // The limits the file's reader takes (`ksmd/model/model.kspl`).
  const MAX = 20000;
  const LEAST = 50;
  const MAX_BENDS = 20;
  // A dot's size, and the least a drawn shape takes; a press without a drag draws this size.
  const DOT = 24;
  const SIZE = { box: [160, 80], diamond: [120, 80], group: [240, 160], note: [160, 60] };
  const LINE = 18; // the words' line height, at 14 pixels

  let tool = null; // { block, kind } while a tool waits to draw
  let chosen = null; // { block, part: "fig" or "link", index }
  let drag = null; // what a press started
  let last = null; // the part the last press chose, and when, to know a second press on it
  let colour = "";
  let fill = "";

  const node = (tag, attrs, text) => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const blockOf = (fig) => ks.view.blocks().indexOf(fig);
  const editable = (fig) => !ks.readOnly && !!fig.querySelector(":scope > .diagram-tools");
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));

  // Builds a diagram block from the view's JSON: its tools, its area and its caption.
  function render(b) {
    const fig = document.createElement("figure");
    fig.className = "b figure diagram";
    fig.contentEditable = "false";
    fig.dg = {
      w: b.size[0], h: b.size[1], cap: b.cap,
      figs: b.fig.map(([id, kind, x, y, w, h, text, mono, color, fillOf]) =>
        ({ id, kind, x, y, w, h, text, mono: mono === 1, color, fill: fillOf })),
      links: b.ln.map(([kind, from, to, text, color, via]) => ({ kind, from, to, text, color,
        via: Array.from({ length: via.length / 2 }, (_, i) => [via[2 * i], via[2 * i + 1]]) })),
    };
    if (!b.included) fig.appendChild(tools());
    const area = document.createElement("div");
    area.className = "diagram-area";
    area.appendChild(node("svg", { class: "diagram-svg", tabindex: "-1", role: "img",
      "aria-label": b.cap || "Diagram" }));
    fig.appendChild(area);
    if (b.cap) {
      const cap = document.createElement("figcaption");
      cap.textContent = b.cap;
      fig.appendChild(cap);
    }
    paint(fig);
    return fig;
  }

  function button(label, title, data) {
    const b = ks.button(label, null, title);
    Object.assign(b.dataset, data);
    return b;
  }

  function picker(cls, title, list, now) {
    const pick = document.createElement("select");
    pick.className = cls;
    pick.title = title;
    for (const [value, name] of list) pick.appendChild(new Option(name, value, false, value === now));
    return pick;
  }

  function tools() {
    const bar = document.createElement("div");
    bar.className = "diagram-tools";
    for (const [kind, label] of SHAPES) {
      bar.appendChild(button(label, `Draw a ${label.toLowerCase()}: drag across the area, or press once`,
        { tool: kind }));
    }
    for (const [kind, label] of LINKS) {
      bar.appendChild(button(label, `Draw ${kind === "arrow" ? "an arrow" : "a line"}: drag from one shape to another`,
        { tool: kind }));
    }
    bar.appendChild(picker("diagram-colour", "The colour of lines and words: of what is drawn next, and of the chosen part", COLOURS, colour));
    bar.appendChild(picker("diagram-fill", "The ground of shapes: of what is drawn next, and of the chosen shape", FILLS, fill));
    for (const [act, label, title] of [["text", "Text…", "Write the chosen part's words; a double-click on it does too"],
      ["mono", "Mono", "Give the chosen shape's words a fixed-width font, as a screen's mock-up"],
      ["delete", "Delete", "Take the chosen part away; a shape's arrows go with it"],
      ["caption", "Caption…", "Write the words under the diagram, numbered as a figure's"]]) {
      bar.appendChild(button(label, title, { act }));
    }
    bar.appendChild(ks.view.removeButton("Remove this diagram from the document"));
    return bar;
  }

  // Where a shape's border meets the line from its middle towards `p`.
  function edge(f, p) {
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    if (dx === 0 && dy === 0) return [cx, cy];
    let t;
    if (f.kind === "diamond") t = 1 / (Math.abs(dx) / (f.w / 2) + Math.abs(dy) / (f.h / 2));
    else if (f.kind === "start" || f.kind === "end") t = Math.min(f.w, f.h) / 2 / Math.hypot(dx, dy);
    else t = Math.min(dx === 0 ? Infinity : f.w / 2 / Math.abs(dx), dy === 0 ? Infinity : f.h / 2 / Math.abs(dy));
    return t >= 1 ? [cx, cy] : [cx + dx * t, cy + dy * t];
  }

  // An arrow's points: from the first shape's border, through its bends, to the second's.
  function route(d, k) {
    const a = d.figs[k.from];
    const b = d.figs[k.to];
    const mid = (f) => [f.x + f.w / 2, f.y + f.h / 2];
    const first = k.via.length > 0 ? k.via[0] : mid(b);
    const last = k.via.length > 0 ? k.via[k.via.length - 1] : mid(a);
    return [edge(a, first), ...k.via, edge(b, last)];
  }

  // The point halfway along a run of points, where an arrow's words stand.
  function halfway(points) {
    const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    let left = lens.reduce((s, x) => s + x, 0) / 2;
    for (let i = 0; i < lens.length; i++) {
      if (left <= lens[i] && lens[i] > 0) {
        const t = left / lens[i];
        return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t];
      }
      left -= lens[i];
    }
    return points[0];
  }

  // Words of one or more lines: centred in a box, a diamond or a dot, at the upper left in a
  // group, a note or a mock-up.
  function words(f, g) {
    if (!f.text) return;
    const lines = f.text.split("\n");
    const left = f.mono || f.kind === "group" || f.kind === "note";
    const x = left ? f.x + 8 : f.x + f.w / 2;
    const top = left ? f.y + 6 : f.y + f.h / 2 - (lines.length * LINE) / 2;
    const t = node("text", { x, y: top, class: `dg-words${f.mono ? " dg-mono" : ""}`,
      "text-anchor": left ? "start" : "middle" });
    if (f.color) t.style.fill = f.color;
    lines.forEach((line, i) => t.appendChild(node("tspan", { x, y: top + (i + 1) * LINE - 4 }, line || " ")));
    g.appendChild(t);
  }

  function shapeEl(f) {
    const at = { class: `dg-${f.kind}` };
    switch (f.kind) {
      case "diamond":
        return node("polygon", { ...at, points: `${f.x + f.w / 2},${f.y} ${f.x + f.w},${f.y + f.h / 2} ` +
          `${f.x + f.w / 2},${f.y + f.h} ${f.x},${f.y + f.h / 2}` });
      case "start":
      case "end":
        return node("circle", { ...at, cx: f.x + f.w / 2, cy: f.y + f.h / 2, r: Math.min(f.w, f.h) / 2 });
      default:
        return node("rect", { ...at, x: f.x, y: f.y, width: f.w, height: f.h, rx: f.kind === "box" ? 4 : 0 });
    }
  }

  // Draws the diagram `d`, and `extra` where a drag shows a part not yet sent.
  function paint(fig, d = fig.dg, extra = null) {
    const svg = fig.querySelector("svg.diagram-svg");
    svg.textContent = "";
    svg.setAttribute("width", d.w);
    svg.setAttribute("height", d.h);
    svg.setAttribute("viewBox", `0 0 ${d.w} ${d.h}`);
    svg.appendChild(node("rect", { class: "dg-ground", x: 0, y: 0, width: d.w, height: d.h }));
    const block = blockOf(fig);
    const mine = chosen && chosen.block === block;
    // Groups stand under the rest, so a press inside one reaches the shapes it holds.
    const order = d.figs.map((f, i) => i).sort((a, b) => (d.figs[b].kind === "group") - (d.figs[a].kind === "group"));
    for (const i of order) {
      const f = d.figs[i];
      const g = node("g", { "data-fig": i, class: "dg-part" });
      const s = shapeEl(f);
      if (f.color) s.style.stroke = f.color;
      if (f.fill) s.style.fill = f.fill;
      if (f.kind === "start" && f.color) s.style.fill = f.color;
      g.appendChild(s);
      if (f.kind === "end") {
        const inner = node("circle", { class: "dg-end-dot", cx: f.x + f.w / 2, cy: f.y + f.h / 2, r: Math.min(f.w, f.h) / 4 });
        if (f.color) inner.style.fill = f.color;
        g.appendChild(inner);
      }
      words(f, g);
      if (mine && chosen.part === "fig" && chosen.index === i) {
        g.classList.add("dg-chosen");
        if (editable(fig)) g.appendChild(node("rect", { class: "dg-handle", "data-handle": "size", x: f.x + f.w - 5, y: f.y + f.h - 5, width: 10, height: 10 }));
      }
      svg.appendChild(g);
    }
    d.links.forEach((k, i) => {
      const points = route(d, k);
      const g = node("g", { "data-link": i, class: "dg-part" });
      const path = points.map((p) => p.join(",")).join(" ");
      g.appendChild(node("polyline", { class: "dg-hit", points: path }));
      const line = node("polyline", { class: "dg-link", points: path });
      if (k.color) line.style.stroke = k.color;
      g.appendChild(line);
      if (k.kind === "arrow") g.appendChild(head(points, k.color));
      if (k.text) {
        const [x, y] = halfway(points);
        const t = node("text", { class: "dg-label", x, y: y + 5, "text-anchor": "middle" }, k.text);
        if (k.color) t.style.fill = k.color;
        g.appendChild(t);
      }
      if (mine && chosen.part === "link" && chosen.index === i) {
        g.classList.add("dg-chosen");
        if (editable(fig)) {
          // A handle on each bend moves it; one halfway along each stretch adds a bend there.
          k.via.forEach(([x, y], j) => g.appendChild(node("circle", { class: "dg-handle", "data-handle": `bend:${j}`, cx: x, cy: y, r: 6 })));
          for (let j = 0; j + 1 < points.length && k.via.length < MAX_BENDS; j++) {
            const [x, y] = halfway([points[j], points[j + 1]]);
            g.appendChild(node("circle", { class: "dg-handle dg-add", "data-handle": `add:${j}`, cx: x, cy: y, r: 5 }));
          }
        }
      }
      svg.appendChild(g);
    });
    // A label's ground, so its words read over the line under them.
    for (const t of svg.querySelectorAll(".dg-label")) {
      const box = t.getBBox();
      if (box.width > 0) t.before(node("rect", { class: "dg-label-ground", x: box.x - 3, y: box.y - 1, width: box.width + 6, height: box.height + 2 }));
    }
    if (extra) svg.appendChild(extra);
    if (editable(fig)) svg.appendChild(node("rect", { class: "dg-handle dg-corner", "data-handle": "area", x: d.w - 10, y: d.h - 10, width: 10, height: 10 }));
  }

  // An arrow's head at its last point, 12 pixels long.
  function head(points, color) {
    const [x2, y2] = points[points.length - 1];
    const [x1, y1] = points[points.length - 2];
    const a = Math.atan2(y2 - y1, x2 - x1);
    const at = (turn) => `${x2 - 12 * Math.cos(a + turn)},${y2 - 12 * Math.sin(a + turn)}`;
    const h = node("polygon", { class: "dg-head", points: `${x2},${y2} ${at(0.45)} ${at(-0.45)}` });
    if (color) h.style.fill = color;
    return h;
  }

  // The whole `:::diagram` clause the file holds for `d`.
  function clause(d) {
    const q = (s) => JSON.stringify(s);
    let out = `:::diagram size="${d.w},${d.h}"${d.cap ? ` caption=${q(d.cap)}` : ""}\n`;
    for (const f of d.figs) {
      out += `${f.kind} id=${q(f.id)} at="${f.x},${f.y}" size="${f.w},${f.h}"` +
        (f.text ? ` text=${q(f.text)}` : "") + (f.mono ? ' font="mono"' : "") +
        (f.color ? ` color="${f.color}"` : "") + (f.fill ? ` fill="${f.fill}"` : "") + "\n";
    }
    for (const k of d.links) {
      out += `${k.kind} from=${q(d.figs[k.from].id)} to=${q(d.figs[k.to].id)}` +
        (k.text ? ` text=${q(k.text)}` : "") + (k.color ? ` color="${k.color}"` : "") +
        (k.via.length ? ` via="${k.via.map((p) => p.join(",")).join(" ")}"` : "") + "\n";
    }
    return `${out}:::\n`;
  }

  // Sends the diagram, and chooses `keep` again once it is shown, or nothing.
  function send(fig, d, keep = null) {
    const block = blockOf(fig);
    const r = ks.act("ksmd_web_diagram", block, ks.put(clause(d)));
    if (r && r.ok && keep) choose(ks.view.blocks()[block], keep.part, keep.index);
    return r;
  }

  function choose(fig, part = null, index = -1) {
    chosen = part === null ? null : { block: blockOf(fig), part, index };
    for (const f of ks.root.querySelectorAll(".diagram")) if (f.dg) paint(f);
    if (chosen) fig.querySelector("svg.diagram-svg").focus({ preventScroll: true });
  }

  // A pointer's place in the diagram's pixels.
  function spot(fig, e) {
    const svg = fig.querySelector("svg.diagram-svg");
    const r = svg.getBoundingClientRect();
    // The size drawn now, which a drag of the area's corner changes under the pointer.
    const k = svg.viewBox.baseVal.width / r.width;
    return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
  }

  // A shape's id not yet taken: `s` and the next number.
  function freshId(d) {
    let n = 0;
    for (const f of d.figs) {
      const m = /^s(\d+)$/.exec(f.id);
      if (m) n = Math.max(n, Number(m[1]));
    }
    return `s${n + 1}`;
  }

  // The shape a drag from `a` to `b` draws, kept inside the diagram. A press without a drag draws
  // the kind's own size, from the press.
  // A dot always takes its own size, centred on the press.
  function drawn(d, kind, a, b) {
    const dot = kind === "start" || kind === "end";
    const far = !dot && Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) >= 6;
    const [w, h] = (dot ? [DOT, DOT] : far ? [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])] : SIZE[kind])
      .map((v, i) => clamp(v, 8, i === 0 ? d.w : d.h));
    const x = clamp(far ? Math.min(a[0], b[0]) : dot ? a[0] - w / 2 : a[0], 0, d.w - w);
    const y = clamp(far ? Math.min(a[1], b[1]) : dot ? a[1] - h / 2 : a[1], 0, d.h - h);
    return { id: freshId(d), kind, x, y, w, h, text: "", mono: false,
      color: colour, fill: kind === "start" || kind === "end" || kind === "group" ? "" : fill };
  }

  // The shapes a group holds whole: they move with it.
  const inside = (d, g) => d.figs.map((f, i) => i).filter((i) => d.figs[i] !== g &&
    d.figs[i].x >= g.x && d.figs[i].y >= g.y && d.figs[i].x + d.figs[i].w <= g.x + g.w &&
    d.figs[i].y + d.figs[i].h <= g.y + g.h);

  // A copy of the diagram as a drag leaves it: moved, resized, bent or grown.
  function dragged(dr, p) {
    const d = dr.fig.dg;
    const dx = p[0] - dr.start[0];
    const dy = p[1] - dr.start[1];
    const out = { ...d, figs: d.figs.map((f) => ({ ...f })), links: d.links.map((k) => ({ ...k, via: k.via.map((v) => [...v]) })) };
    if (dr.what === "move") {
      // The whole party moves by one distance, kept inside the diagram.
      const party = [dr.index, ...dr.carried].map((i) => d.figs[i]);
      const mx = clamp(dx, -Math.min(...party.map((f) => f.x)), d.w - Math.max(...party.map((f) => f.x + f.w)));
      const my = clamp(dy, -Math.min(...party.map((f) => f.y)), d.h - Math.max(...party.map((f) => f.y + f.h)));
      for (const i of [dr.index, ...dr.carried]) {
        out.figs[i].x = d.figs[i].x + mx;
        out.figs[i].y = d.figs[i].y + my;
      }
    } else if (dr.what === "size") {
      const f = out.figs[dr.index];
      f.w = clamp(d.figs[dr.index].w + dx, 8, d.w - f.x);
      f.h = clamp(d.figs[dr.index].h + dy, 8, d.h - f.y);
    } else if (dr.what === "bend") {
      out.links[dr.index].via[dr.bend] = [clamp(p[0], 0, d.w), clamp(p[1], 0, d.h)];
    } else if (dr.what === "add") {
      out.links[dr.index].via.splice(dr.bend, 0, [clamp(p[0], 0, d.w), clamp(p[1], 0, d.h)]);
    } else if (dr.what === "area") {
      // The area keeps every shape and bend inside it.
      const needW = Math.max(LEAST, ...d.figs.map((f) => f.x + f.w), ...d.links.flatMap((k) => k.via.map((v) => v[0])));
      const needH = Math.max(LEAST, ...d.figs.map((f) => f.y + f.h), ...d.links.flatMap((k) => k.via.map((v) => v[1])));
      out.w = clamp(d.w + dx, needW, MAX);
      out.h = clamp(d.h + dy, needH, MAX);
    }
    return out;
  }

  // The shape under a pointer, or -1.
  function figAt(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const g = el && el.closest && el.closest("[data-fig]");
    return g ? Number(g.dataset.fig) : -1;
  }

  ks.root.addEventListener("pointerdown", (e) => {
    const fig = e.target.closest && e.target.closest(".diagram");
    const svg = fig && e.target.closest("svg.diagram-svg");
    if (!svg || !fig.dg) {
      if (chosen && !(e.target.closest && e.target.closest(".diagram-tools, .diagram-text"))) choose(null);
      return;
    }
    e.preventDefault();
    const p = spot(fig, e);
    const block = blockOf(fig);
    if (!editable(fig)) {
      return;
    }
    const d = fig.dg;
    ks.table.take();
    if (tool && tool.block === block) {
      if (tool.kind === "arrow" || tool.kind === "line") {
        const from = figAt(e);
        if (from < 0) {
          ks.say("Start the arrow on a shape, and let go on another.");
          return;
        }
        drag = { fig, what: "link", kind: tool.kind, from, start: p };
      } else {
        drag = { fig, what: "new", kind: tool.kind, start: p };
      }
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const handle = e.target.closest("[data-handle]");
    if (handle) {
      const [what, j] = handle.dataset.handle.split(":");
      if (what === "bend" && e.detail >= 2) {
        const k = d.links[chosen.index];
        const next = { ...d, links: d.links.map((x, i) => (i === chosen.index ? { ...k, via: k.via.filter((_, b) => b !== Number(j)) } : x)) };
        send(fig, next, { part: "link", index: chosen.index });
        return;
      }
      // A bend's handle names its place in `via`; an added bend goes between the stretch's ends.
      drag = { fig, what, start: p, index: chosen ? chosen.index : -1, bend: j === undefined ? 0 : Number(j) };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const link = e.target.closest("[data-link]");
    const shape = e.target.closest("[data-fig]");
    // A second press on the part just pressed writes its words, as a double-click. The page
    // tells the two presses apart itself: the first draws the diagram again, so the browser,
    // whose press ended on another element, sends no click and no double-click.
    const part = link ? ["link", Number(link.dataset.link)] : shape ? ["fig", Number(shape.dataset.fig)] : null;
    const again = part && last && last.block === block && last.part === part[0] && last.index === part[1] &&
      e.timeStamp - last.at < 500;
    last = part && { block, part: part[0], index: part[1], at: e.timeStamp };
    if (again) {
      last = null;
      askText(fig);
      return;
    }
    if (link) {
      choose(fig, "link", Number(link.dataset.link));
      return;
    }
    if (shape) {
      const index = Number(shape.dataset.fig);
      choose(fig, "fig", index);
      drag = { fig, what: "move", index, start: p, carried: d.figs[index].kind === "group" ? inside(d, d.figs[index]) : [] };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    choose(null);
  }, true);

  ks.root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const p = spot(drag.fig, e);
    if (drag.what === "new") {
      const f = drawn(drag.fig.dg, drag.kind, drag.start, p);
      paint(drag.fig, drag.fig.dg, node("rect", { class: "dg-rubber", x: f.x, y: f.y, width: f.w, height: f.h }));
    } else if (drag.what === "link") {
      paint(drag.fig, drag.fig.dg, node("line", { class: "dg-rubber", x1: drag.start[0], y1: drag.start[1], x2: p[0], y2: p[1] }));
    } else {
      paint(drag.fig, dragged(drag, p));
    }
  });

  ks.root.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const dr = drag;
    drag = null;
    const p = spot(dr.fig, e);
    const d = dr.fig.dg;
    const far = Math.abs(p[0] - dr.start[0]) + Math.abs(p[1] - dr.start[1]) >= 4;
    if (dr.what === "new") {
      const f = drawn(d, dr.kind, dr.start, p);
      stopTool();
      send(dr.fig, { ...d, figs: [...d.figs, f] }, { part: "fig", index: d.figs.length });
      return;
    }
    if (dr.what === "link") {
      const to = figAt(e);
      stopTool();
      if (to < 0 || to === dr.from) {
        paint(dr.fig);
        ks.say("An arrow joins two shapes: let go on another shape.");
        return;
      }
      const k = { kind: dr.kind, from: dr.from, to, text: "", color: colour, via: [] };
      send(dr.fig, { ...d, links: [...d.links, k] }, { part: "link", index: d.links.length });
      return;
    }
    if (!far) {
      paint(dr.fig);
      return;
    }
    const next = dragged(dr, p);
    const keep = dr.what === "area" ? chosen && { part: chosen.part, index: chosen.index } :
      { part: dr.what === "move" || dr.what === "size" ? "fig" : "link", index: dr.index };
    send(dr.fig, next, keep);
  });

  function stopTool() {
    tool = null;
    for (const b of ks.root.querySelectorAll(".diagram-tools [data-tool]")) b.setAttribute("aria-pressed", "false");
    for (const f of ks.root.querySelectorAll(".diagram.drawing-now")) f.classList.remove("drawing-now");
  }

  // Writes the chosen part's words in a box over it: Ctrl+Enter or a press elsewhere takes them,
  // and Esc drops them. A shape's words may have several lines; an arrow's have one.
  function askText(fig) {
    if (!chosen) return;
    const d = fig.dg;
    const isFig = chosen.part === "fig";
    const part = isFig ? d.figs[chosen.index] : d.links[chosen.index];
    const box = document.createElement(isFig ? "textarea" : "input");
    box.className = "diagram-text";
    box.value = part.text;
    const r = fig.querySelector("svg.diagram-svg").getBoundingClientRect();
    const k = r.width / d.w;
    const at = isFig ? [part.x, part.y, Math.max(part.w, 120), Math.max(part.h, 40)] :
      (() => { const [x, y] = halfway(route(d, part)); return [x - 80, y - 14, 160, 28]; })();
    Object.assign(box.style, { left: `${r.left + window.scrollX + at[0] * k}px`, top: `${r.top + window.scrollY + at[1] * k}px`,
      width: `${at[2] * k}px`, height: `${at[3] * k}px` });
    if (isFig && part.mono) box.classList.add("dg-mono");
    // The box stands outside the document, as the chart's panel does: there the document's own
    // keys, which type into its text, do not reach it.
    document.body.appendChild(box);
    const keep = { part: chosen.part, index: chosen.index };
    let done = false;
    const finish = (take) => {
      if (done) return;
      done = true;
      const text = isFig ? box.value.replace(/\r/g, "") : box.value.replace(/\s+/g, " ").trim();
      box.remove();
      if (!take || text === part.text) return;
      const next = isFig ? { ...d, figs: d.figs.map((f, i) => (i === keep.index ? { ...f, text } : f)) } :
        { ...d, links: d.links.map((x, i) => (i === keep.index ? { ...x, text } : x)) };
      send(fig, next, keep);
    };
    box.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") finish(false);
      else if (e.key === "Enter" && (!isFig || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finish(true);
      }
    });
    // The box takes the focus once the press that opened it has ended: the press's own handling
    // would move the focus on, and the box would close at once.
    setTimeout(() => {
      box.focus();
      box.select();
      box.addEventListener("blur", () => finish(true));
    }, 0);
  }

  function askCaption(fig) {
    const typed = window.prompt("Caption, shown under the diagram and numbered as a figure's. Leave it empty for none.",
      fig.dg.cap);
    if (typed === null) return null;
    return send(fig, { ...fig.dg, cap: typed.replace(/\s+/g, " ").trim() });
  }

  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".diagram-tools button");
    if (!b || ks.readOnly || b.classList.contains("block-remove")) return;
    e.preventDefault();
    const fig = b.closest(".diagram");
    const block = blockOf(fig);
    if (b.dataset.tool) {
      const same = tool && tool.block === block && tool.kind === b.dataset.tool;
      stopTool();
      if (!same) {
        tool = { block, kind: b.dataset.tool };
        b.setAttribute("aria-pressed", "true");
        fig.classList.add("drawing-now");
      }
      return;
    }
    if (b.dataset.act === "caption") {
      askCaption(fig);
      return;
    }
    if (!chosen || chosen.block !== block) {
      ks.say("Choose a shape or an arrow first: press on it.");
      return;
    }
    if (b.dataset.act === "text") askText(fig);
    else if (b.dataset.act === "delete") remove(fig);
    else if (b.dataset.act === "mono") {
      if (chosen.part !== "fig") {
        ks.say("Mono gives a shape's words a fixed-width font. Choose a shape.");
        return;
      }
      const d = fig.dg;
      send(fig, { ...d, figs: d.figs.map((f, i) => (i === chosen.index ? { ...f, mono: !f.mono } : f)) },
        { part: "fig", index: chosen.index });
    }
  });

  ks.root.addEventListener("change", (e) => {
    const pick = e.target;
    if (!pick.classList || !(pick.classList.contains("diagram-colour") || pick.classList.contains("diagram-fill"))) return;
    const isFill = pick.classList.contains("diagram-fill");
    if (isFill) fill = pick.value;
    else colour = pick.value;
    const fig = pick.closest(".diagram");
    if (!chosen || chosen.block !== blockOf(fig)) return;
    const d = fig.dg;
    const keep = { part: chosen.part, index: chosen.index };
    if (chosen.part === "fig") {
      send(fig, { ...d, figs: d.figs.map((f, i) => (i === keep.index ? { ...f, [isFill ? "fill" : "color"]: pick.value } : f)) }, keep);
    } else if (!isFill) {
      send(fig, { ...d, links: d.links.map((k, i) => (i === keep.index ? { ...k, color: pick.value } : k)) }, keep);
    }
  });

  // Takes the chosen part away; a shape takes its arrows with it, and the others keep their ends.
  function remove(fig) {
    const d = fig.dg;
    const at = chosen.index;
    const part = chosen.part;
    chosen = null;
    if (part === "link") return send(fig, { ...d, links: d.links.filter((_, i) => i !== at) });
    const links = d.links.filter((k) => k.from !== at && k.to !== at)
      .map((k) => ({ ...k, from: k.from > at ? k.from - 1 : k.from, to: k.to > at ? k.to - 1 : k.to }));
    return send(fig, { ...d, figs: d.figs.filter((_, i) => i !== at), links });
  }

  const typing = () => {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
  };

  // Delete takes the chosen part away, an arrow key nudges a chosen shape a pixel (ten with
  // Shift), and Esc lets the part, or a tool, go.
  document.addEventListener("keydown", (e) => {
    if (!chosen && !tool) return;
    if (e.key === "Escape") {
      stopTool();
      if (chosen) choose(null);
      return;
    }
    if (!chosen || ks.readOnly || typing()) return;
    const fig = ks.view.blocks()[chosen.block];
    if (!fig || !fig.dg) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      e.stopPropagation();
      remove(fig);
      return;
    }
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (chosen.part === "fig" && steps[e.key] && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const n = e.shiftKey ? 10 : 1;
      const d = fig.dg;
      const dr = { fig, what: "move", index: chosen.index, start: [0, 0],
        carried: d.figs[chosen.index].kind === "group" ? inside(d, d.figs[chosen.index]) : [] };
      send(fig, dragged(dr, [steps[e.key][0] * n, steps[e.key][1] * n]), { part: "fig", index: chosen.index });
    }
  }, true);

  ks.changed.push(() => {
    if (chosen && !drag) chosen = null;
  });

  ks.handle("diagram", () => {
    ks.sync();
    return ks.act("ksmd_web_insert_diagram");
  });

  ks.diagram = { render };
}
