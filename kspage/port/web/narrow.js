// ==========================================
// kspage's JS side — **the table heading kept in view while its table scrolls under the tools**.
// The first row (the heading by position, `kspage_web_head`) stays at the window's top. It stays
// from when the table's top edge passes under the tools until its last body row leaves (as in
// Numbers).
// **It is a copy on a canvas of its own**: the document's canvas is one long sheet the window
// scrolls. A band painted there would repaint the whole document for every pixel moved. **It
// paints the same way as [`draw.js`](draw.js)** (`paintPanels` / `paintBoxes`, cropped to the
// row). **It sits under the tools** (`#pinned-head` in `page.css`), so a menu covers it; paper
// never has it. It is split from `draw.js` for the 1000-line-per-file cap (Principle 3).
// ==========================================
function kspagePin(ks) {
  const { w, canvas, scratch, nums } = ks;
  const { paintBoxes, paintPanels, DOC_BOXES } = ks;

  const pin = document.createElement("canvas");
  pin.id = "pinned-head";
  pin.setAttribute("aria-hidden", "true");
  document.body.appendChild(pin);
  // The band shown now, in document coordinates (null for none): `y` where it sits, `r*` the row.
  let pinned = null;

  // The band the window's position calls for: the first table whose heading has passed the tools'
  // bottom while part of it is below. **Nothing is painted here**, as following the cursor asks.
  function pinnedBand() {
    if (ks.showing >= 0) return null;
    const rect = canvas.getBoundingClientRect();
    // The document's y at the window's usable top edge (the tools' bottom).
    const docTop = ks.headRoom() - rect.top;
    const n = w.kspage_web_head_count();
    for (let i = 0; i < n; i++) {
      w.kspage_web_head(i, scratch);
      const [tx, ty, tw, th, rx, ry, rw, rh] = nums(8);
      if (tw <= 0 || rw <= 0 || rh <= 0) continue;
      // Half a pixel of slack (scrolling to the row's edge rounds; a sliver would cover it).
      if (ty + 0.5 < docTop && ty + th > docTop) {
        // **It leaves with the table's last row**, sliding up rather than covering another table.
        const y = Math.min(docTop, ty + th - rh);
        return { table: i, tx: tx, ty: ty, tw: tw, th: th, rx: rx, ry: ry, rw: rw, rh: rh, y: y,
          left: rect.left, top: rect.top };
      }
    }
    return null;
  }

  function hidePinned() {
    pin.style.display = "none";
    pinned = null;
  }

  function paintPinned() {
    const band = pinnedBand();
    if (band === null) {
      hidePinned();
      return;
    }
    pinned = band;
    const stage = canvas.parentElement;
    const view = stage.getBoundingClientRect();
    const left = Math.max(band.left + band.rx, view.left);
    const right = Math.min(band.left + band.rx + band.rw, view.left + stage.clientWidth);
    const width = Math.max(right - left, 0);
    const dpr = window.devicePixelRatio || 1;
    pin.style.display = "block";
    pin.style.left = `${left}px`;
    pin.style.top = `${band.top + band.y}px`;
    pin.style.width = `${width}px`;
    pin.style.height = `${band.rh}px`;
    pin.width = Math.ceil(width * dpr);
    pin.height = Math.ceil(band.rh * dpr);
    const g = pin.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The paper's color first, so the row underneath does not show through, **read as computed**
    // (`readTheme`'s rule in `draw.js`). Where it is transparent, the role's own color is used.
    const ground = getComputedStyle(canvas).backgroundColor;
    g.fillStyle = ground && ground !== "rgba(0, 0, 0, 0)" ? ground : ks.paperInkOf();
    g.fillRect(0, 0, width, band.rh);
    // Now in document coordinates, cropped to the row (copied, not laid out again).
    g.translate(band.left - left, -band.ry);
    const crop = [band.rx, band.ry, band.rw, band.rh];
    g.fillStyle = getComputedStyle(canvas).color;
    paintPanels(g, ks.plain, crop);
    paintBoxes(ks.boxCount(), g, DOC_BOXES, crop, ks.plain, false);
  }

  // **The band is the heading.** A click puts the cursor in that cell (as in a spreadsheet's frozen
  // row). Following then brings the whole row into view under the tools (`followCaret`, `draw.js`).
  pin.addEventListener("pointerdown", (e) => {
    if (pinned === null || e.button !== 0) return;
    e.preventDefault();
    const at = pin.getBoundingClientRect();
    w.kspage_web_compose_commit();
    w.kspage_web_click(e.clientX - pinned.left, e.clientY - at.top + pinned.ry, 0);
    ks.draw();
    ks.ime.focus();
  });
  // Scrolling repaints it (the window's position decides the band); **so does layout** (`draw.js`).
  window.addEventListener("scroll", paintPinned, { passive: true });
  canvas.parentElement.addEventListener("scroll", paintPinned, { passive: true });

  ks.pinnedBand = pinnedBand;
  ks.paintPinned = paintPinned;
  ks.hidePinned = hidePinned;
  // The heading shown now ([table, x, y, w, h] in document coordinates, y where the band sits) or
  // null. **It is computed anew from the window's position**, so a check can ask right after
  // scrolling.
  ks.pinnedHead = () => {
    paintPinned();
    return pinned === null ? null : [pinned.table, pinned.rx, pinned.y, pinned.rw, pinned.rh];
  };
}

// ==========================================
// kspage's JS side — **the arrow in a table's heading, and the panel it opens**.
//
// A table's heading row always has one arrow per column: click it and the panel that filters and
// sorts that column opens under it. **There is no mode that turns the arrows on first.** Excel has
// one, and until it is found, the feature looks missing.
//
// **The arrow says whether that column is filtered.** Excel's funnel says that one is somewhere,
// never which, so every column's menu has to be opened to find out.
//
// **The click moves the cursor into that heading cell first.** Filtering, sorting and the values
// all read the cursor's column. So choosing a column by the arrow and by the cursor is the same
// act. Otherwise there would be a second way of naming a column, and two ways to filter one.
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
        const [x, y, cw, chh, column, on, found, hasColor, color] = nums(9);
        if (found === 0 || cw < LEAST) continue;
        out.push({
          table: i, cell: c, column: column, on: on !== 0,
          ink: hasColor !== 0 && !ks.plain ? ks.colorText(color) : null,
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
      g.fillStyle = a.ink || ink;
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
    // **"Select All" checks and unchecks what is shown**, not what the search box hides.
    // Otherwise a search followed by "Select All" would quietly include what was never read.
    const all = document.createElement("label");
    const allBox = document.createElement("input");
    allBox.type = "checkbox";
    const holdsBlank = blank && (look === "" || "(blanks)".indexOf(look) >= 0);
    const every = shown.every((v) => ticked.has(v)) && (!holdsBlank || ticked.has(""));
    allBox.checked = every && (shown.length > 0 || holdsBlank);
    allBox.indeterminate = !every && (shown.some((v) => ticked.has(v)) ||
      (holdsBlank && ticked.has("")));
    allBox.addEventListener("change", () => {
      const on = allBox.checked;
      shown.forEach((v) => { if (on) ticked.add(v); else ticked.delete(v); });
      if (holdsBlank) { if (on) ticked.add(""); else ticked.delete(""); }
      fill();
    });
    all.appendChild(allBox);
    all.appendChild(document.createTextNode("(Select All)"));
    list.appendChild(all);
    shown.forEach((v) => row(v, v, ticked.has(v)));
    if (holdsBlank) row("(Blanks)", "", ticked.has(""));
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
    document.getElementById("narrow-condition").open = false;
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

  // Commands finish the choice; hiding the panel exposes the result and any status message.
  panel.addEventListener("click", (e) => {
    const button = e.target.closest("button");
    if (!button || !["sort-down", "sort-up", "filter-apply", "narrow-clear",
      "narrow-ticked", "narrow-shut"].includes(button.id)) return;
    shut();
    ks.ime.focus();
  });
  // Cancel and Escape discard the pending checkboxes; only OK applies them.
  panel.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing || e.keyCode === 229) return;
    e.preventDefault();
    e.stopPropagation();
    shut();
    ks.ime.focus();
  });
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
