// ==========================================
// kspage's JS side — **the table heading kept in view while its table scrolls under the tools**:
// the first row (the heading by position, `kspage_web_head`) stays at the window's top from when
// the table's top edge passes under the tools until its last body row leaves, as Numbers does.
// **It is a copy on a canvas of its own**: the document's canvas is one long sheet the window
// scrolls (a band painted there would repaint the whole document for every pixel moved). **It
// paints the same way as [`draw.js`](draw.js)** (`paintPanels` / `paintBoxes`, cropped to the row),
// and **sits under the tools** (`#pinned-head` in `page.css`), so a menu covers it; paper never has
// it. It is split from `draw.js` for the 1000-line-per-file cap (Principle 3).
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

  // The band the window's position calls for (the first table whose heading has passed the tools'
  // bottom while part of it is below); **nothing is painted here**, as following the cursor asks.
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
    const dpr = window.devicePixelRatio || 1;
    pin.style.display = "block";
    pin.style.left = `${band.left + band.rx}px`;
    pin.style.top = `${band.top + band.y}px`;
    pin.style.width = `${band.rw}px`;
    pin.style.height = `${band.rh}px`;
    pin.width = Math.ceil(band.rw * dpr);
    pin.height = Math.ceil(band.rh * dpr);
    const g = pin.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The paper's color first, so the row underneath does not show through, **read as computed**
    // (`readTheme`'s rule in `draw.js`); where it is transparent, the role's own color is used.
    const ground = getComputedStyle(canvas).backgroundColor;
    g.fillStyle = ground && ground !== "rgba(0, 0, 0, 0)" ? ground : ks.paperInkOf();
    g.fillRect(0, 0, band.rw, band.rh);
    // Now in document coordinates, cropped to the row (copied, not laid out again).
    g.translate(-band.rx, -band.ry);
    const crop = [band.rx, band.ry, band.rw, band.rh];
    g.fillStyle = getComputedStyle(canvas).color;
    paintPanels(g, ks.plain, crop);
    paintBoxes(ks.boxCount(), g, DOC_BOXES, crop, ks.plain, false);
  }

  // **The band is the heading**: a click puts the cursor in that cell (as in a spreadsheet's frozen
  // row), then following brings the whole row into view under the tools (`followCaret`, `draw.js`).
  pin.addEventListener("pointerdown", (e) => {
    if (pinned === null || e.button !== 0) return;
    e.preventDefault();
    const at = pin.getBoundingClientRect();
    w.kspage_web_compose_commit();
    w.kspage_web_click(e.clientX - at.left + pinned.rx, e.clientY - at.top + pinned.ry, 0);
    ks.draw();
    ks.ime.focus();
  });
  // Scrolling repaints it (the window's position decides the band); **so does layout** (`draw.js`).
  window.addEventListener("scroll", paintPinned, { passive: true });

  ks.pinnedBand = pinnedBand;
  ks.paintPinned = paintPinned;
  ks.hidePinned = hidePinned;
  // The heading shown now ([table, x, y, w, h] in document coordinates, y where the band sits) or
  // null, **computed anew from the window's position** so a check can ask right after scrolling.
  ks.pinnedHead = () => {
    paintPinned();
    return pinned === null ? null : [pinned.table, pinned.rx, pinned.y, pinned.rw, pinned.rh];
  };
}
