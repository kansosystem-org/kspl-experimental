// ksmd page: the shapes drawn over an image or a chart, as a layer over its picture. A shape
// stands in the picture's own pixels (a chart's frame is 640 by 300), so it stays on what it
// points at however wide the page shows the picture.
// A person picks Rectangle, Arrow, Line or Pen in the picture's tools and drags across the picture;
// Pen draws a free line where the pointer goes. With Shift held, a rectangle is a square, and a
// line or an arrow keeps to a multiple of 45 degrees, as in Word. A
// press on a shape chooses it: a drag moves it, Text… gives a rectangle its words, and Delete
// takes it away. Each change sends the whole list as the clause's `draw` lines, so the file's
// reader checks it, and it is one step of undo (`ksmd/edit/editor_drawings.kspl`).
"use strict";

function ksmdDrawings(ks) {
  const SVG = "http://www.w3.org/2000/svg";
  // The colours offered, as the writer keeps them; the first is used where the file names none.
  const COLOURS = [["#c00000", "Red"], ["#1f5fbf", "Blue"], ["#1a7f37", "Green"], ["#000000", "Black"]];
  const CHART = [640, 300];
  // The largest coordinate the file's reader takes (`MAX_SPOT` in `ksmd/model/model.kspl`).
  const MAX_SPOT = 20000;
  const SHAPES = [["rect", "Rectangle"], ["arrow", "Arrow"], ["line", "Line"], ["pen", "Pen"]];
  // The most points a pen line keeps (`MAX_PEN_POINTS` in `ksmd/model/model.kspl`), and the least
  // distance in the picture's pixels between two it keeps, so a slow hand makes no needless points.
  const MAX_POINTS = 500;
  const STEP = 3;
  let tool = null; // { fig, shape } while a shape waits to be drawn
  let colour = COLOURS[0][0];
  // { block, index } of the chosen shape. Any change to the document lets it go, as the shape at
  // that place can then be another, or none.
  let chosen = null;
  let drag = null; // what a press started: a new shape, or a chosen one moving

  function node(tag, attrs, text) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    if (text !== undefined) el.textContent = text;
    return el;
  }

  const blockOf = (fig) => ks.view.blocks().indexOf(fig);
  // The picture's frame in its own pixels, or null while an image has not loaded.
  function frameOf(fig) {
    if (fig.classList.contains("chart")) return CHART;
    const img = fig.querySelector(".picture img");
    return img && img.naturalWidth > 0 ? [img.naturalWidth, img.naturalHeight] : null;
  }
  // Where a shape may stand: inside the frame, and no further than the reader takes.
  function bounds(fig) {
    const [w, h] = frameOf(fig);
    return [Math.min(w, MAX_SPOT), Math.min(h, MAX_SPOT)];
  }
  // A pointer's place in the picture's pixels, kept inside `bounds`.
  function spot(fig, e) {
    const svg = fig.querySelector("svg.drawings");
    const r = svg.getBoundingClientRect();
    const [w, h] = frameOf(fig);
    const [maxX, maxY] = bounds(fig);
    const clamp = (v, hi) => Math.max(0, Math.min(hi, Math.round(v)));
    return [clamp(((e.clientX - r.left) * w) / r.width, maxX), clamp(((e.clientY - r.top) * h) / r.height, maxY)];
  }

  // Adds the layer, and the tools where the page edits, to a rendered image or chart.
  function attach(fig, b) {
    fig.drawings = (b.dr || []).map(([shape, x1, y1, x2, y2, color, text, points]) =>
      ({ shape, x1, y1, x2, y2, color, text,
        points: points ? points.split(" ").map((p) => p.split(",").map(Number)) : [] }));
    const pic = fig.querySelector(".picture");
    if (!pic) return;
    // The layer takes the focus while a shape is chosen (`choose`), never by Tab.
    pic.appendChild(node("svg", { class: "drawings", "aria-hidden": "true", tabindex: "-1" }));
    if (!b.included) fig.insertBefore(tools(fig), fig.firstChild);
    paint(fig);
  }

  function tools(fig) {
    const bar = document.createElement("div");
    bar.className = "draw-tools";
    for (const [shape, label] of SHAPES) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.shape = shape;
      b.textContent = label;
      b.title = `Draw a ${label.toLowerCase()} over the picture: drag across it`;
      bar.appendChild(b);
    }
    const pick = document.createElement("select");
    pick.className = "draw-colour";
    pick.title = "The colour of new shapes, and of the chosen one";
    for (const [value, name] of COLOURS) pick.appendChild(new Option(name, value, false, value === colour));
    bar.appendChild(pick);
    for (const [name, label, title] of [["text", "Text…", "Write words inside the chosen rectangle"],
      ["delete", "Delete", "Take the chosen shape away"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.act = name;
      b.textContent = label;
      b.title = title;
      bar.appendChild(b);
    }
    return bar;
  }

  // Draws the shapes, and `extra` where a drag shows one not yet sent.
  function paint(fig, extra = null) {
    const svg = fig.querySelector("svg.drawings");
    if (!svg) return;
    const frame = frameOf(fig);
    svg.textContent = "";
    if (!frame) return;
    const [w, h] = frame;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const shown = svg.getBoundingClientRect().width || w;
    // How many of the picture's pixels one pixel on the page spans, so heads and words keep a
    // size a person reads.
    const k = w / shown;
    const block = blockOf(fig);
    const list = extra ? [...fig.drawings, extra] : fig.drawings;
    list.forEach((d, i) => {
      const g = node("g", { class: "drawing", "data-i": i });
      const stroke = d.color || COLOURS[0][0];
      if (d.shape === "pen") {
        g.appendChild(node("polyline", { points: d.points.map((p) => p.join(",")).join(" "), stroke,
          fill: "none", "stroke-width": 3 * k, "stroke-linecap": "round", "stroke-linejoin": "round" }));
      } else if (d.shape === "rect") {
        const x = Math.min(d.x1, d.x2);
        const y = Math.min(d.y1, d.y2);
        g.appendChild(node("rect", { x, y, width: Math.abs(d.x2 - d.x1), height: Math.abs(d.y2 - d.y1),
          stroke, fill: "none", "stroke-width": 3 * k }));
        if (d.text) {
          g.appendChild(node("text", { x: x + 6 * k, y: y + 18 * k, fill: stroke, "font-size": 14 * k,
            class: "drawing-text" }, d.text));
        }
      } else {
        g.appendChild(node("line", { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, stroke, "stroke-width": 3 * k,
          "stroke-linecap": "round" }));
        if (d.shape === "arrow") g.appendChild(head(d, stroke, k));
      }
      // The chosen shape's outline turns to dashes.
      if (chosen && chosen.block === block && chosen.index === i && d !== extra) {
        g.classList.add("drawing-chosen");
        g.firstChild.setAttribute("stroke-dasharray", `${10 * k} ${6 * k}`);
      }
      svg.appendChild(g);
      // The words take a white ground of their own, so they read over the picture while the
      // rest of what the rectangle frames still shows.
      const words = g.querySelector("text");
      if (words) {
        const box = words.getBBox();
        g.insertBefore(node("rect", { x: box.x - 3 * k, y: box.y - 2 * k, width: box.width + 6 * k,
          height: box.height + 4 * k, fill: "#ffffff" }), words);
      }
    });
  }

  // An arrow's head at its end, 14 pixels long on the page.
  function head(d, fill, k) {
    const a = Math.atan2(d.y2 - d.y1, d.x2 - d.x1);
    const len = 14 * k;
    const at = (turn) => `${d.x2 - len * Math.cos(a + turn)},${d.y2 - len * Math.sin(a + turn)}`;
    return node("polygon", { points: `${d.x2},${d.y2} ${at(0.45)} ${at(-0.45)}`, fill });
  }

  // The `draw` lines the file holds for these shapes.
  function lines(list) {
    return list.map((d) => `draw shape="${d.shape}"` + (d.shape === "pen" ?
      ` points="${d.points.map((p) => p.join(",")).join(" ")}"` : ` from="${d.x1},${d.y1}" to="${d.x2},${d.y2}"`) +
      (d.color ? ` color="${d.color}"` : "") + (d.text ? ` text=${JSON.stringify(d.text)}` : "") + "\n").join("");
  }

  // Sends the shapes as the clause's lines. The change lets the chosen shape go, so `keep` names
  // the shape to choose again after it, or is null for none.
  function send(fig, list, keep = null) {
    const block = blockOf(fig);
    const r = ks.act("ksmd_web_drawings", block, ks.put(lines(list)));
    if (r && r.ok && keep !== null) choose(ks.view.blocks()[block], keep);
    return r;
  }

  // Chooses a shape, or none. A chosen shape takes the keyboard's focus from the text or a field,
  // so Delete then takes the shape away and no text.
  function choose(fig, index) {
    chosen = index === null ? null : { block: blockOf(fig), index };
    for (const f of ks.root.querySelectorAll(".figure, .chart")) paint(f);
    const layer = chosen && fig.querySelector("svg.drawings");
    if (layer) layer.focus({ preventScroll: true });
  }

  // Whether the focus stands where a key types: in the document's text or in a field.
  function typing() {
    const el = document.activeElement;
    return !!el && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".draw-tools button");
    if (!b || ks.readOnly) return;
    e.preventDefault();
    const fig = b.closest(".figure, .chart");
    if (b.dataset.shape) {
      tool = tool && tool.fig === fig && tool.shape === b.dataset.shape ? null : { fig, shape: b.dataset.shape };
      for (const t of ks.root.querySelectorAll(".draw-tools button[data-shape]")) {
        t.setAttribute("aria-pressed", String(!!tool && t === b));
      }
      fig.classList.toggle("drawing-now", !!tool);
      return;
    }
    const at = chosen && chosen.block === blockOf(fig) ? chosen.index : -1;
    if (at < 0 || at >= fig.drawings.length) {
      ks.say("Choose a shape first: press on it.");
      return;
    }
    if (b.dataset.act === "delete") {
      chosen = null;
      send(fig, fig.drawings.filter((_, i) => i !== at));
      return;
    }
    const d = fig.drawings[at];
    if (d.shape !== "rect") {
      ks.say("Only a rectangle holds words. Choose a rectangle.");
      return;
    }
    const typed = window.prompt("Words inside the rectangle. Leave it empty for none.", d.text);
    if (typed === null) return;
    send(fig, fig.drawings.map((x, i) => (i === at ? { ...x, text: typed.replace(/\s+/g, " ").trim() } : x)), at);
  });

  ks.root.addEventListener("change", (e) => {
    if (!e.target.classList || !e.target.classList.contains("draw-colour")) return;
    colour = e.target.value;
    const fig = e.target.closest(".figure, .chart");
    if (chosen && chosen.block === blockOf(fig) && chosen.index < fig.drawings.length) {
      const color = colour === COLOURS[0][0] ? "" : colour;
      send(fig, fig.drawings.map((x, i) => (i === chosen.index ? { ...x, color } : x)), chosen.index);
    }
  });

  // A press on the picture draws with the chosen tool, or chooses the shape under it and moves
  // it; a press elsewhere lets the chosen shape go.
  ks.root.addEventListener("pointerdown", (e) => {
    const fig = e.target.closest && e.target.closest(".figure, .chart");
    const pic = fig && e.target.closest(".picture");
    if (!pic || ks.readOnly || !frameOf(fig) || fig.querySelector(".draw-tools") === null) {
      if (chosen && !(e.target.closest && e.target.closest(".draw-tools"))) choose(null, null);
      return;
    }
    const at = spot(fig, e);
    if (tool && tool.fig === fig) {
      drag = { fig, start: at, shape: tool.shape, points: tool.shape === "pen" ? [at] : null };
    } else {
      const g = e.target.closest("g.drawing");
      if (!g) {
        if (chosen) choose(null, null);
        return;
      }
      const index = Number(g.dataset.i);
      choose(fig, index);
      drag = { fig, start: at, index };
    }
    e.preventDefault();
    pic.setPointerCapture(e.pointerId);
  }, true);

  // The shape a drag makes: a new one from where it started, or the chosen one moved. A new shape
  // in the first colour names none, as the file needs none.
  const shapeOf = (d, at, square) => {
    if (d.index !== undefined) return moved(d.fig, d.fig.drawings[d.index], d.start, at);
    const color = colour === COLOURS[0][0] ? "" : colour;
    if (d.shape === "pen") return penOf(d.points, color);
    const [x2, y2] = square ? held(d.shape, d.start, at, bounds(d.fig)) : at;
    return { shape: d.shape, x1: d.start[0], y1: d.start[1], x2, y2, color, text: "", points: [] };
  };
  // A pen line through its points, with the box round them, its points thinned to the most kept.
  function penOf(points, color) {
    const step = Math.ceil(points.length / MAX_POINTS);
    const kept = points.filter((_, i) => i % step === 0 || i === points.length - 1);
    const xs = kept.map((p) => p[0]);
    const ys = kept.map((p) => p[1]);
    return { shape: "pen", x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys),
      color, text: "", points: kept };
  }
  // Where a drag ends with Shift held: a square's other corner, or a line's end on a multiple of
  // 45 degrees, kept inside the picture.
  function held(shape, from, to, [w, h]) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const clamp = (v, hi) => Math.max(0, Math.min(hi, Math.round(v)));
    if (shape === "rect") {
      // The side shrinks to the room on both axes, so a square stays square at the picture's edge.
      const sx = Math.sign(dx || 1);
      const sy = Math.sign(dy || 1);
      const room = Math.min(sx > 0 ? w - from[0] : from[0], sy > 0 ? h - from[1] : from[1]);
      const side = Math.min(Math.max(Math.abs(dx), Math.abs(dy)), room);
      return [from[0] + sx * side, from[1] + sy * side];
    }
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return [clamp(from[0] + Math.cos(a) * len, w), clamp(from[1] + Math.sin(a) * len, h)];
  }
  // A shape moved by the distance between two spots, kept inside `bounds`.
  function moved(fig, d, from, to) {
    const [w, h] = bounds(fig);
    const dx = Math.max(-Math.min(d.x1, d.x2), Math.min(w - Math.max(d.x1, d.x2), to[0] - from[0]));
    const dy = Math.max(-Math.min(d.y1, d.y2), Math.min(h - Math.max(d.y1, d.y2), to[1] - from[1]));
    return { ...d, x1: d.x1 + dx, y1: d.y1 + dy, x2: d.x2 + dx, y2: d.y2 + dy,
      points: d.points.map(([x, y]) => [x + dx, y + dy]) };
  }

  ks.root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const at = spot(drag.fig, e);
    if (drag.points) {
      const last = drag.points[drag.points.length - 1];
      if (Math.hypot(at[0] - last[0], at[1] - last[1]) >= STEP) drag.points.push(at);
    }
    if (drag.index !== undefined) {
      const was = drag.fig.drawings;
      drag.fig.drawings = was.map((x, i) => (i === drag.index ? shapeOf(drag, at) : x));
      paint(drag.fig);
      drag.fig.drawings = was;
    } else {
      paint(drag.fig, shapeOf(drag, at, e.shiftKey));
    }
  });

  ks.root.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    const at = spot(d.fig, e);
    if (d.points) d.points.push(at);
    const far = Math.abs(at[0] - d.start[0]) + Math.abs(at[1] - d.start[1]) >= 4 ||
      (d.points && d.points.length > 2);
    if (!far) {
      paint(d.fig);
      return;
    }
    if (d.index !== undefined) {
      send(d.fig, d.fig.drawings.map((x, i) => (i === d.index ? shapeOf(d, at) : x)), d.index);
      return;
    }
    const list = [...d.fig.drawings, shapeOf(d, at, e.shiftKey)];
    tool = null;
    send(d.fig, list, list.length - 1);
  });

  // Delete takes the chosen shape away, and Esc lets it, or a tool, go. Where the focus stands in
  // text or in a field, Delete is that place's own.
  document.addEventListener("keydown", (e) => {
    if (!chosen && !tool) return;
    if (e.key === "Escape") {
      tool = null;
      for (const f of ks.root.querySelectorAll(".drawing-now")) f.classList.remove("drawing-now");
      choose(null, null);
      return;
    }
    if (!chosen || (e.key !== "Delete" && e.key !== "Backspace") || ks.readOnly || typing()) return;
    const fig = ks.view.blocks()[chosen.block];
    if (!fig || !fig.drawings || chosen.index >= fig.drawings.length) return;
    e.preventDefault();
    e.stopPropagation();
    const at = chosen.index;
    chosen = null;
    send(fig, fig.drawings.filter((_, i) => i !== at));
  }, true);

  ks.changed.push(() => {
    if (chosen) choose(null, null);
  });

  // An image's frame is known once it has loaded.
  ks.root.addEventListener("load", (e) => {
    const fig = e.target.closest && e.target.closest(".figure");
    if (fig && e.target.tagName === "IMG") paint(fig);
  }, true);
  window.addEventListener("resize", () => {
    for (const f of ks.root.querySelectorAll(".figure, .chart")) paint(f);
  });

  ks.drawings = { attach, lines };
}
