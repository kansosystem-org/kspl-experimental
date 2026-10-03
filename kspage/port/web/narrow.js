// ==========================================
// kspage's JS side — **the arrow in a table's heading, and the panel it opens**.
//
// A table's heading row always has one arrow per column: click it and the panel that filters and
// sorts that column opens under it. **There is no mode that turns the arrows on first** — Excel has
// one, and until it is found, the feature looks missing.
//
// **The arrow says whether that column is filtered.** Excel's funnel says that one is somewhere,
// never which, so every column's menu has to be opened to find out.
//
// **The click moves the cursor into that heading cell first.** Filtering, sorting and the values
// all read the cursor's column, so choosing a column by the arrow and by the cursor is the same
// act (otherwise there would be a second way of naming a column, and two ways to filter one).
// It is split from [`draw.js`](draw.js) for the 1000-line-per-file cap (Principle 3).
// ==========================================
function kspageNarrow(ks) {
  const { w, canvas, scratch, nums } = ks;

  // The arrow's box, and how far it sits inside the cell's right edge.
  // Caution: **Keep it clear of the border.** The border is grabbed to change a column's width, and
  // an arrow right against it would take the clicks meant for the border.
  const SIDE = 13;
  const PAD = 4;
  // The narrowest cell an arrow is drawn in. Narrower, the arrow would cover the heading's text.
  const LEAST = 34;

  // Every arrow in the current layout, in canvas coordinates.
  // Caution: **Compute them anew, never remember them.** A column's width, the scroll and the
  // filter all move them, so a remembered list answers for places where no arrow is.
  const arrows = () => {
    const out = [];
    const tables = w.kspage_web_head_count();
    for (let i = 0; i < tables; i += 1) {
      const cells = w.kspage_web_head_cell_count(i);
      for (let c = 0; c < cells; c += 1) {
        w.kspage_web_head_cell(i, c, scratch);
        const [x, y, cw, chh, column, on, found] = nums(7);
        if (found === 0 || cw < LEAST) continue;
        out.push({
          table: i, cell: c, column: column, on: on !== 0,
          x: x + cw - SIDE - PAD, y: y + (chh - SIDE) / 2, w: SIDE, h: SIDE,
          cellX: x, cellY: y, cellW: cw, cellH: chh,
        });
      }
    }
    return out;
  };

  // The arrow the click landed on, or null.
  const at = (x, y) => {
    const row = arrows();
    for (let i = 0; i < row.length; i += 1) {
      const a = row[i];
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a;
    }
    return null;
  };

  // Paints them over the text.
  // Caution: **Paint after the text** (painted first they end up under it and are invisible).
  const paint = (g) => {
    const row = arrows();
    if (row.length === 0) return;
    // **Read the ink, not the paper.** `paperInkOf` is the sheet's color, and an arrow painted in
    // it is an arrow nobody can see.
    const said = getComputedStyle(canvas).getPropertyValue("--ink").trim();
    const ink = said.length > 0 ? said : "CanvasText";
    g.save();
    for (let i = 0; i < row.length; i += 1) {
      const a = row[i];
      g.globalAlpha = a.on ? 0.95 : 0.4;
      g.fillStyle = ink;
      g.beginPath();
      // A downward triangle, the shape the field agrees on for "there is a list here".
      g.moveTo(a.x + 2, a.y + a.h * 0.36);
      g.lineTo(a.x + a.w - 2, a.y + a.h * 0.36);
      g.lineTo(a.x + a.w / 2, a.y + a.h * 0.72);
      g.closePath();
      g.fill();
      // **A filtered column keeps a line under its arrow.** It is the one mark that says which
      // column is filtered without opening anything.
      if (a.on) g.fillRect(a.x + 1, a.y + a.h * 0.82, a.w - 2, 1.5);
    }
    g.restore();
  };

  // ---- The panel ----

  const panel = document.getElementById("narrow");
  const list = document.getElementById("narrow-list");
  const find = document.getElementById("narrow-find");
  const note = document.getElementById("narrow-note");
  // The values the column shows now, and whether it has a blank. **They are read anew on every
  // opening** (a list kept from before would check values no row holds any more).
  let values = [];
  let blank = false;
  // What is checked, by value. The blank cells are the empty text, the same way the core holds
  // them.
  let ticked = new Set();

  const shut = () => {
    panel.hidden = true;
  };

  // Whether the panel is open. **The click handler asks it**, so a click inside the panel is not
  // taken for a click on the document.
  const open = () => !panel.hidden;

  // Lays out the checkboxes, showing only the values the search box matches.
  // **Typing never unchecks.** What is typed narrows what is shown and nothing else — in Excel and
  // Sheets it replaces the selection.
  const fill = () => {
    const look = find.value.trim().toLowerCase();
    list.textContent = "";
    const shown = values.filter((v) => look === "" || v.toLowerCase().indexOf(look) >= 0);
    const row = (label, value, on) => {
      const wrap = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = on;
      box.addEventListener("change", () => {
        if (box.checked) ticked.add(value); else ticked.delete(value);
        fill();
      });
      wrap.appendChild(box);
      wrap.appendChild(document.createTextNode(label));
      list.appendChild(wrap);
    };
    // **"Every value" checks and unchecks what is shown**, not what the search box hides —
    // otherwise a search followed by "every value" would quietly include what was never read.
    const all = document.createElement("label");
    const allBox = document.createElement("input");
    allBox.type = "checkbox";
    const holdsBlank = blank && (look === "" || "(the blank cells)".indexOf(look) >= 0);
    const every = shown.every((v) => ticked.has(v)) && (!holdsBlank || ticked.has(""));
    allBox.checked = every && (shown.length > 0 || holdsBlank);
    allBox.addEventListener("change", () => {
      const on = allBox.checked;
      shown.forEach((v) => { if (on) ticked.add(v); else ticked.delete(v); });
      if (holdsBlank) { if (on) ticked.add(""); else ticked.delete(""); }
      fill();
    });
    all.appendChild(allBox);
    all.appendChild(document.createTextNode("(every value)"));
    list.appendChild(all);
    shown.forEach((v) => row(v, v, ticked.has(v)));
    if (holdsBlank) row("(the blank cells)", "", ticked.has(""));
  };

  // Reads the column anew and shows the panel under that heading cell.
  const show = (rect) => {
    const said = ks.api.columnValues();
    if (said === null) return false;
    values = said.values;
    blank = said.blank;
    // **Nothing filtered means everything is checked** — the checkboxes show what is kept, and with
    // no filter every value is.
    ticked = new Set(said.chosen === null
      ? values.concat(blank ? [""] : [])
      : said.chosen);
    find.value = "";
    note.textContent = said.cut
      ? "This column shows more values than the list holds, so what is below is not all of them"
      : "";
    fill();
    panel.hidden = false;
    // Caution: **Place it after showing it.** Hidden, its size is 0, so a panel placed first would
    // be pushed off the screen's edge by a size nobody has measured yet.
    const box = canvas.getBoundingClientRect();
    const wide = panel.offsetWidth;
    const tall = panel.offsetHeight;
    const room = document.documentElement.clientWidth;
    const high = document.documentElement.clientHeight;
    let left = box.left + rect.cellX + rect.cellW - wide;
    if (left < 4) left = 4;
    if (left + wide > room - 4) left = room - wide - 4;
    let top = box.top + rect.cellY + rect.cellH;
    // **Above the heading where it does not fit below**, so the window's bottom never cuts the
    // list.
    if (top + tall > high - 4) top = Math.max(4, box.top + rect.cellY - tall);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    return true;
  };

  // The arrow was clicked: the cursor goes into that heading cell, then the panel opens under it.
  const openAt = (a) => {
    w.kspage_web_click(a.cellX + Math.min(8, a.cellW / 4), a.cellY + a.cellH / 2, 0);
    ks.draw();
    return show(a);
  };

  // The ribbon's button: the panel opens at the heading of the cursor's current column.
  const openHere = () => {
    w.kspage_web_head_spot(scratch);
    const [i, c, found] = nums(3);
    if (found === 0) return false;
    w.kspage_web_head_cell(i, c, scratch);
    const [x, y, cw, chh, _column, _on, got] = nums(7);
    if (got === 0) return false;
    return show({ cellX: x, cellY: y, cellW: cw, cellH: chh });
  };

  const canvasSpot = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  // **Closing it is not choosing.** What was checked takes effect only when "Narrow to the ticked"
  // is clicked, so a panel closed by mistake changes nothing.
  document.getElementById("narrow-shut").addEventListener("click", shut);
  find.addEventListener("input", fill);
  // A click outside closes it (as with every other panel on this page).
  document.addEventListener("pointerdown", (e) => {
    if (!open() || panel.contains(e.target)) return;
    if (e.target === canvas && at(...canvasSpot(e)) !== null) return;
    shut();
  }, true);

  ks.paintNarrowArrows = paint;
  ks.narrowAt = at;
  ks.narrowOpenAt = openAt;
  ks.narrowOpenHere = openHere;
  // What is checked now, as a list of values. **The empty text means the blank cells**, the same
  // way the core holds them.
  ks.narrowTicked = () => Array.from(ticked);
}
