// ksmd page: the menu bar's drop-down menus, their flyouts, and the table's right-click menu.
// A menu opens on a press of its name, not on pointing; while one is open, pointing at another name
// opens that one. Inside a menu, a flyout opens on pointing and on focus. A press elsewhere, Esc
// and a chosen command close every menu, through `shut`.
// The arrow keys move through a menu: Up and Down between items, Right into a flyout or on to the
// next menu, Left back out. Enter and Space press the item that has the focus.
// The table's commands stand in one list, `TABLE_GROUPS`: the Table menu shows each group as a
// flyout, and the right-click menu shows the groups one after another.
"use strict";

const TABLE_GROUPS = [
  ["Rows", [["row-above", "Insert row above"], ["row-below", "Insert row below"],
    ["row-remove", "Remove row"]]],
  ["Columns", [["column-left", "Insert column left"], ["column-right", "Insert column right"],
    ["column-remove", "Remove column"], ["column-fit", "Fit column width"]]],
  ["Fill", [["fill-down", "Fill down", "Ctrl+D"], ["fill-right", "Fill right", "Ctrl+R"]]],
  ["Sort", [["sort-up", "Sort ascending (A to Z, 0 to 9)"], ["sort-down", "Sort descending"]]],
  ["Filter", [["filter-column", "Filter this column…"],
    ["filter-value", "Show only rows with this value"], ["filter-clear", "Show all rows"]]],
  ["Number format", [["format-none", "General: as calculated"], ["format-number", "Number: 1234.50"],
    ["format-grouped", "Thousands: 1,234.50"], ["format-percent", "Percent: 12%"],
    ["format-currency", "Currency…"], ["format-more", "More decimal places"],
    ["format-fewer", "Fewer decimal places"]]],
  ["Table", [["table-rename", "Rename table…"], ["table-remove", "Remove table"]]],
];

function ksmdMenus(ks) {
  const bar = ks.bar;

  function item(cmd, label, key) {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    b.dataset.cmd = cmd;
    b.textContent = label;
    if (key) {
      const kbd = document.createElement("kbd");
      kbd.textContent = key;
      b.appendChild(kbd);
    }
    return b;
  }

  function flyout(name, items) {
    const sub = document.createElement("div");
    sub.className = "sub";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "sub-name";
    head.setAttribute("role", "menuitem");
    head.setAttribute("aria-haspopup", "menu");
    head.setAttribute("aria-expanded", "false");
    head.textContent = name;
    const menu = document.createElement("div");
    menu.className = "menu flyout";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", name);
    menu.hidden = true;
    for (const [cmd, label, key] of items) menu.appendChild(item(cmd, label, key));
    sub.appendChild(head);
    sub.appendChild(menu);
    return sub;
  }

  const tableMenu = bar.querySelector("[data-table-menu]");
  for (const [name, items] of TABLE_GROUPS) tableMenu.appendChild(flyout(name, items));

  const context = document.createElement("div");
  context.className = "menu context";
  context.setAttribute("role", "menu");
  context.setAttribute("aria-label", "Table");
  context.hidden = true;
  TABLE_GROUPS.forEach(([, items], k) => {
    if (k > 0) context.appendChild(document.createElement("hr"));
    for (const [cmd, label, key] of items) context.appendChild(item(cmd, label, key));
  });
  document.body.appendChild(context);

  // The open top menu's name, or null; and where the focus was before a menu took it.
  let openName = null;
  let back = null;

  const items = (menu) => Array.from(menu.children)
    .map((el) => (el.classList.contains("sub") ? el.firstElementChild : el))
    .filter((el) => el.tagName === "BUTTON" && !el.disabled);

  function showFlyout(sub, on) {
    const head = sub.firstElementChild;
    const menu = sub.lastElementChild;
    if (on === !menu.hidden) return;
    menu.hidden = !on;
    head.setAttribute("aria-expanded", on ? "true" : "false");
    sub.classList.toggle("open", on);
    if (!on) {
      for (const inner of menu.querySelectorAll(".sub.open")) showFlyout(inner, false);
      return;
    }
    // A flyout with no room on the right opens to the left instead.
    menu.classList.remove("flip");
    if (menu.getBoundingClientRect().right > window.innerWidth) menu.classList.add("flip");
  }

  function closeFlyouts(menu, except) {
    for (const sub of menu.querySelectorAll(":scope > .sub")) if (sub !== except) showFlyout(sub, false);
  }

  function openTop(name, focusFirst) {
    if (openName && openName !== name) closeTop();
    const menu = name.nextElementSibling;
    ks.enableTable();
    menu.hidden = false;
    name.setAttribute("aria-expanded", "true");
    openName = name;
    if (focusFirst) {
      const first = items(menu)[0];
      if (first) first.focus();
    }
  }

  function closeTop() {
    if (!openName) return;
    const menu = openName.nextElementSibling;
    closeFlyouts(menu, null);
    menu.hidden = true;
    openName.setAttribute("aria-expanded", "false");
    openName = null;
  }

  // Opens the right-click menu at a point on the page.
  function openContext(x, y) {
    shut(false);
    remember();
    ks.enableTable();
    context.hidden = false;
    const r = context.getBoundingClientRect();
    context.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width))}px`;
    context.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height))}px`;
    const first = items(context)[0];
    if (first) first.focus();
  }

  // Closes every menu. With `restore`, the focus goes back where it was before a menu took it.
  function shut(restore) {
    closeTop();
    context.hidden = true;
    if (restore) {
      const to = back && back.isConnected ? back : ks.root;
      to.focus();
    }
    back = null;
  }

  // Keeps where the focus was: an open cell, or else the document.
  function remember() {
    const a = document.activeElement;
    if (!back) back = a && a !== ks.root && ks.root.contains(a) ? a : ks.root;
  }

  bar.addEventListener("mousedown", (e) => {
    // A press in the bar must not take the selection away from the document.
    if (e.target.closest("button")) e.preventDefault();
  });
  context.addEventListener("mousedown", (e) => e.preventDefault());

  bar.addEventListener("click", (e) => {
    const name = e.target.closest(".menu-name");
    if (name) {
      remember();
      if (openName === name) shut(true);
      else openTop(name, e.detail === 0);
    }
  });

  bar.addEventListener("mouseover", (e) => {
    const name = e.target.closest(".menu-name");
    if (name && openName && openName !== name) openTop(name, false);
  });

  // Pointing at a flyout's name opens it and closes its neighbours.
  for (const menu of [bar, context]) {
    menu.addEventListener("mouseover", (e) => {
      const head = e.target.closest(".menu > *");
      if (!head) return;
      const parent = head.parentElement;
      closeFlyouts(parent, head.classList.contains("sub") ? head : null);
      if (head.classList.contains("sub")) showFlyout(head, true);
    });
    menu.addEventListener("click", (e) => {
      const el = e.target.closest("[data-cmd]");
      if (el && !el.disabled) {
        const restore = back;
        shut(false);
        back = restore;
        // The focus goes back first, so the command acts on the selection the person left.
        if (back && back.isConnected) back.focus();
        back = null;
        ks.command(el.dataset.cmd);
        return;
      }
      const head = e.target.closest(".sub-name");
      if (head) showFlyout(head.parentElement, true);
    });
    menu.addEventListener("keydown", keys);
  }

  function keys(e) {
    const el = document.activeElement;
    const name = el && el.classList.contains("menu-name") ? el : null;
    if (e.key === "Escape") {
      e.preventDefault();
      const sub = el && el.closest(".flyout");
      if (sub) {
        showFlyout(sub.parentElement, false);
        sub.parentElement.firstElementChild.focus();
      } else {
        shut(true);
      }
      return;
    }
    const tops = Array.from(bar.querySelectorAll(".menu-name"));
    const step = (k) => {
      const at = tops.indexOf(openName || name);
      const next = tops[(at + k + tops.length) % tops.length];
      if (openName) openTop(next, true);
      else next.focus();
    };
    if (name) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        remember();
        openTop(name, true);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }
      return;
    }
    const menu = el && el.closest(".menu");
    if (!menu) return;
    const list = items(menu);
    const at = list.indexOf(el);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const k = e.key === "ArrowDown" ? 1 : -1;
      const next = list[(at + k + list.length) % list.length];
      if (next) next.focus();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (el.classList.contains("sub-name")) {
        showFlyout(el.parentElement, true);
        const first = items(el.nextElementSibling)[0];
        if (first) first.focus();
      } else if (openName) {
        step(1);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (menu.classList.contains("flyout")) {
        showFlyout(menu.parentElement, false);
        menu.parentElement.firstElementChild.focus();
      } else if (openName) {
        step(-1);
      }
    } else if (e.key === "Tab") {
      shut(true);
    }
  }

  // Esc closes a menu wherever the focus is: a menu opened by a press leaves it in the document.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || (!openName && context.hidden)) return;
    if (e.target.closest && e.target.closest(".menu, .menubar")) return;
    e.preventDefault();
    e.stopPropagation();
    shut(true);
  }, true);

  // A press anywhere outside the open menus closes them.
  document.addEventListener("mousedown", (e) => {
    if (!openName && context.hidden) return;
    if (e.target.closest && (e.target.closest(".menubar") || e.target.closest(".menu.context"))) return;
    shut(false);
  }, true);
  window.addEventListener("blur", () => shut(false));
  window.addEventListener("resize", () => shut(false));

  ks.menus = { openContext, shut, context };
}
