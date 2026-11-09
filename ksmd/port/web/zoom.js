// ksmd page: the zoom of the document alone, at the right of the status bar: −, the level, and +.
// The level opens a menu of fixed steps, and View holds Zoom in, Zoom out and Zoom 100%, with
// Ctrl+Alt+= and Ctrl+Alt+- as Excel has them. The browser keeps Ctrl with +, - or the wheel, which
// zooms the whole window. The menus, the bars and the print keep their size, and the file is
// unchanged. The level is this browser's own, as the page's width is.
"use strict";

// The levels, in percent, that −, + and the menu step through.
const ZOOM_STEPS = [50, 75, 90, 100, 110, 125, 150, 175, 200];

function ksmdZoom(ks) {
  const box = document.querySelector(".status-zoom");
  const level = box.querySelector(".zoom-level");
  const out = box.querySelector(".zoom-out");
  const into = box.querySelector(".zoom-in");
  let now = 100;

  // Sets the level. The block at the window's top stays where it stood, so the place being read
  // stays in sight.
  function set(percent) {
    const top = document.querySelector(".top");
    const y = (top ? top.getBoundingClientRect().bottom : 0) + 4;
    const at = document.elementFromPoint(window.innerWidth / 2, y);
    const block = at && ks.root.contains(at) && at !== ks.root ? at.closest(".doc > *") : null;
    const before = block ? block.getBoundingClientRect().top : 0;
    now = percent;
    // `page.css` scales the document by it on the screen alone.
    document.documentElement.style.setProperty("--doc-zoom", String(percent / 100));
    level.textContent = `${percent}%`;
    level.setAttribute("aria-label", `Zoom ${percent}%. Choose a zoom`);
    out.disabled = percent <= ZOOM_STEPS[0];
    into.disabled = percent >= ZOOM_STEPS[ZOOM_STEPS.length - 1];
    if (block) window.scrollBy(0, block.getBoundingClientRect().top - before);
    try {
      localStorage.setItem("ksmd.zoom", String(percent));
    } catch (_) { /* a browser that keeps nothing shows 100% next time */ }
    return null;
  }

  // The next step up or down from the level now.
  function step(by) {
    const next = by > 0 ? ZOOM_STEPS.find((p) => p > now) : ZOOM_STEPS.filter((p) => p < now).pop();
    return next === undefined ? null : set(next);
  }

  out.addEventListener("click", () => step(-1));
  into.addEventListener("click", () => step(1));
  level.addEventListener("click", () => ks.status.popup(level, "Zoom",
    ZOOM_STEPS.slice().reverse().map((p) => [`${p}%`, p === now, () => set(p)]), true, false));

  // Ctrl+Alt+= zooms in and Ctrl+Alt+- out, also with Shift, which types + on many keyboards.
  document.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || !e.altKey || e.metaKey || e.isComposing) return;
    const by = e.key === "=" || e.key === "+" ? 1 : e.key === "-" || e.key === "_" ? -1 : 0;
    if (by === 0) return;
    e.preventDefault();
    e.stopPropagation();
    step(by);
  }, true);

  ks.handle("zoom-in", () => step(1), { looks: true });
  ks.handle("zoom-out", () => step(-1), { looks: true });
  ks.handle("zoom-reset", () => set(100), { looks: true });

  let kept = 100;
  try {
    kept = Number(localStorage.getItem("ksmd.zoom")) || 100;
  } catch (_) { /* a browser that keeps nothing shows 100% */ }
  set(ZOOM_STEPS.includes(kept) ? kept : 100);

  ks.zoom = {
    // The level as a factor: 1.25 for 125%.
    factor: () => now / 100,
  };
}
