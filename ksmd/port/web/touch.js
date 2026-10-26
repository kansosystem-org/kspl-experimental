// ksmd page: a touch screen, as a phone's. A long press on a cell opens the table's menu, where a
// mouse would right-click, and a double tap opens the cell, where a mouse would double-click. A
// single tap chooses the cell through the mouse events the browser makes of it.
"use strict";

function ksmdTouch(ks) {
  const HOLD_MS = 500; // how long a press is held before it opens the menu
  const TWICE_MS = 350; // how close two taps come to be one double tap
  const STILL_PX = 10; // how far a finger may move and still press, not scroll
  let held = null; // the press being held: { el, x, y, timer, fired }
  let tapped = null; // the last tap: { el, at }

  const cellOf = (e) => (e.target.closest ? e.target.closest(".table [data-r]") : null);
  const placeOf = (el) => ({ block: ks.view.blocks().indexOf(el.closest(".table")),
    row: Number(el.dataset.r), column: Number(el.dataset.c) });

  ks.root.addEventListener("touchstart", (e) => {
    const el = cellOf(e);
    if (!el || e.touches.length !== 1 || el.closest(".include")) return;
    const t = e.touches[0];
    held = { el, x: t.clientX, y: t.clientY, fired: false, timer: setTimeout(() => {
      held.fired = true;
      const p = placeOf(el);
      if (p.block < 0) return;
      ks.table.choose(p.block, p.row, p.column);
      ks.menus.openContext(held.x, held.y);
    }, HOLD_MS) };
  }, { passive: true });

  ks.root.addEventListener("touchmove", (e) => {
    if (!held) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - held.x) > STILL_PX || Math.abs(t.clientY - held.y) > STILL_PX) {
      clearTimeout(held.timer);
      held = null;
    }
  }, { passive: true });

  ks.root.addEventListener("touchend", (e) => {
    if (!held) return;
    const h = held;
    held = null;
    clearTimeout(h.timer);
    // The menu is open: no tap follows, or it would land on an item at once.
    if (h.fired) {
      e.preventDefault();
      return;
    }
    const now = Date.now();
    // The second tap opens the cell the first chose: choosing can take an empty line above the
    // table away, and the table moves under the finger.
    if (tapped && now - tapped.at < TWICE_MS) {
      const p = tapped.el === h.el || !ks.cell ? placeOf(h.el) : ks.cell;
      tapped = null;
      e.preventDefault();
      if (p.block >= 0) ks.table.open(p.block, p.row, p.column);
      return;
    }
    tapped = { el: h.el, at: now };
  });

  ks.root.addEventListener("touchcancel", () => {
    if (held) clearTimeout(held.timer);
    held = null;
  });
}
