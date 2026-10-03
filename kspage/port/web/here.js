// ==========================================
// kspage's page — the context menu (right-click): "the menu for the place just clicked", not back
// and forward navigation (`api.js`'s `spotNow` / `markSpot`).
// **It replaces the browser's menu only over the body** (elsewhere, spell check, opening a link,
// translating and looking up would vanish; on the canvas the browser offers only "save as image").
// Caution: **Do not make a command that exists only here** (Apple HIG): an item **names a button in
// a menu** and takes its wording from it, and disappears with it (`kspage/tests/browser/menu.js`
// checks). **Cut, copy and paste are not included**: a browser cannot paste from a click (reading
// asks permission), so they would do nothing (Principle 5); the keys work.
// ==========================================
function kspageHere(ui) {
  const app = ui.app;
  const canvas = document.getElementById("page");

  // The items shown, **only what acts in one click**: `run` clicks that button; `at` goes to the
  // group inside the menu (named from there), and with `to` on to that field, left selected. `when`
  // is the context: "cell" (in a table cell), "frame" (a shape selected), or omitted (always).
  // Caution: **Order them by context** — a context menu reads outward from the click (Apple HIG),
  // so the items the click decides go on top.
  const PICKS = [
    { run: "add-row", when: "cell" },
    { run: "drop-row", when: "cell" },
    { run: "add-col", when: "cell" },
    { run: "drop-col", when: "cell" },
    { run: "merge-row", when: "cell" },
    { run: "split-cell", when: "cell" },
    { run: "drop-frame", when: "frame" },
    { rule: true },
    { at: "block-style" },
    { at: "style-set" },
    { rule: true },
    { at: "remark-fly", to: "remark-text" },
    { at: "put-link-fly", to: "href" },
    { at: "put-note-fly", to: "note-text" },
  ];

  // Caution: **The item's name is read from the button** (kept separately, a rewording goes stale).
  const nameOf = (pick) => {
    if (pick.run) return document.getElementById(pick.run).textContent.trim();
    return document.querySelector("#" + pick.at + " .fly-name").textContent.trim();
  };
  // Where it goes, **possibly the group itself** (a group of choices opens when the item pointing
  // at it gets focus: `page.css`'s `:focus-within`); `ui.reach` goes there, as for the ribbon.
  const aimOf = (pick) => (pick.to !== undefined ? document.getElementById(pick.to)
    : document.querySelector("#" + pick.at + " > .fly-open"));
  // Whether the button it names exists; **absent, no item** (a read-only page hides whole menus).
  const there = (pick) => {
    if (pick.rule) return true;
    if (pick.run) return document.getElementById(pick.run) !== null;
    return document.querySelector("#" + pick.at + " .fly-name") !== null
      && aimOf(pick) !== null;
  };

  const box = document.createElement("div");
  box.className = "items";
  box.id = "here";
  box.setAttribute("role", "menu");
  box.hidden = true;
  document.body.appendChild(box);

  const shut = () => {
    if (box.hidden) return;
    box.hidden = true;
    box.textContent = "";
  };

  // Caution: **Ask for the context every time the menu opens** (remembered, the cell's items would
  // stay after leaving the cell).
  const fill = () => {
    const where = app.cellFrame() !== null ? "cell"
      : app.frameRect() !== null ? "frame" : "";
    box.textContent = "";
    let waiting = null;
    for (const pick of PICKS) {
      if (!there(pick)) continue;
      if (pick.rule) {
        // Caution: **No separator on its own first** (with no item below, it is a bare line).
        waiting = pick;
        continue;
      }
      if (pick.when !== undefined && pick.when !== where) continue;
      // Caution: **A separator only below an item** (a line at the top looks broken).
      if (waiting !== null && box.childElementCount > 0) {
        box.appendChild(document.createElement("hr"));
      }
      waiting = null;
      const one = document.createElement("button");
      one.type = "button";
      one.className = "fly-pick";
      one.setAttribute("role", "menuitem");
      const label = document.createElement("span");
      label.className = "fly-label";
      label.textContent = nameOf(pick);
      one.appendChild(label);
      one.addEventListener("click", () => {
        shut();
        if (pick.run) {
          document.getElementById(pick.run).click();
          return;
        }
        ui.reach(pick.at, pick.to);
      });
      box.appendChild(one);
    }
    return box.childElementCount > 0;
  };

  // Shows it at the clicked place; measured after opening (closed, the dimensions are 0).
  // Caution: **Move it where it does not fit**, or the lower items fall off the screen.
  const place = (x, y) => {
    box.style.left = x + "px";
    box.style.top = y + "px";
    box.hidden = false;
    const room = box.getBoundingClientRect();
    if (room.right > window.innerWidth - 4) {
      box.style.left = Math.max(4, window.innerWidth - 4 - room.width) + "px";
    }
    if (room.bottom > window.innerHeight - 4) {
      box.style.top = Math.max(4, window.innerHeight - 4 - room.height) + "px";
    }
  };

  // **Only over the body** (over the whole page, a typing field would lose the spell check).
  canvas.addEventListener("contextmenu", (e) => {
    // **With no item at all, the browser's menu is kept** (still more use than an empty panel).
    if (!fill()) return;
    e.preventDefault();
    place(e.clientX, e.clientY);
  });
  // **Close it when the user clicks outside** (as the menu bar does).
  addEventListener("pointerdown", (e) => {
    if (e.target.closest === undefined || e.target.closest("#here") === null) shut();
  });
  // **Close it on Esc too**, in the capture phase, stopped there once closed (Esc has other uses).
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing || e.keyCode === 229 || box.hidden) return;
    e.preventDefault();
    e.stopPropagation();
    shut();
    app.focus();
  }, true);
  // Caution: **Close it on scroll** (placed where the click landed, scrolled it points elsewhere).
  addEventListener("scroll", shut, { passive: true });
  addEventListener("resize", shut);

  return {};
}
