// ksmd page: the menu bar's drop-down menus, their flyouts, and the table's right-click menu.
// A menu opens on a press of its name, not on pointing; while one is open, pointing at another name
// opens that one. Inside a menu, a flyout opens on pointing and on focus. A press elsewhere, Esc
// and a chosen command close every menu, through `shut`.
// The arrow keys move through a menu: Up and Down between items, Right into a flyout or on to the
// next menu, Left back out, and Left and Right along a row of items. Home and End go to the first
// and last. Enter and Space press the item that has the focus.
// F10 puts the focus on the menu bar, and again takes it back. The bar is one stop of Tab: Left
// and Right move along its names, and Down, Enter or Space open one (WAI-ARIA's menu bar).
// The menu bar holds every command, each with its icon (`MENUS` in `commands.js`). The table's
// commands stand in its Table menu and in the right-click menu alike, from one list,
// `TABLE_GROUPS`; the right-click menu holds Cut, Copy, Paste and Paste values above them.
// Shift+F10 or the menu key opens the right-click menu from a cell. A command's
// key, which its item shows, runs it from a cell through the same list. A right-click on an item
// offers to add it to the quick access bar, or to take it off (`quick.js`).
"use strict";

function ksmdMenus(ks) {
  const bar = ks.bar;

  // Each table command that has a key: the key's parts, as its item shows them, and the command.
  const arrows = { "\u2190": "ArrowLeft", "\u2192": "ArrowRight", "\u2193": "ArrowDown" };
  const keyed = TABLE_GROUPS.flatMap(([, cmds]) => cmds.filter((c) => COMMAND.get(c).key).map((cmd) => {
    const parts = COMMAND.get(cmd).key.split("+");
    const last = parts[parts.length - 1];
    return { cmd, ctrl: parts.includes("Ctrl"), alt: parts.includes("Alt"),
      shift: parts.includes("Shift"), key: arrows[last] || (last.length === 1 ? last.toLowerCase() : last) };
  }));
  // It runs before the cell's own keys, as a press on the item would, and leaves the cell chosen.
  ks.root.addEventListener("keydown", (e) => {
    const cell = e.target.closest && e.target.closest(".table [data-r]");
    if (!cell || cell.closest(".include") || e.isComposing) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const hit = keyed.find((k) => k.key === key && k.ctrl === (e.ctrlKey || e.metaKey) &&
      k.alt === e.altKey && k.shift === e.shiftKey);
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    ks.command(hit.cmd);
  }, true);

  // One command's item: its icon, its name, and its key.
  function item(cmd) {
    const { label, key } = COMMAND.get(cmd);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", CHECKED[cmd] || "menuitem");
    if (CHECKED[cmd]) b.setAttribute("aria-checked", "false");
    b.dataset.cmd = cmd;
    b.appendChild(ksmdIcon(cmd));
    const name = document.createElement("span");
    name.className = "label";
    name.textContent = label;
    b.appendChild(name);
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
    head.appendChild(ksmdIcon(items[0]));
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = name;
    head.appendChild(label);
    const menu = document.createElement("div");
    menu.className = "menu flyout";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", name);
    menu.hidden = true;
    for (const cmd of items) menu.appendChild(item(cmd));
    sub.appendChild(head);
    sub.appendChild(menu);
    return sub;
  }

  // Fills a menu from its list: commands, lines between groups, flyouts, and rows of commands
  // side by side, `{ row: [names] }`. A row's items show their keys as their tips.
  function fill(menu, entries) {
    for (const entry of entries) {
      if (entry === "-") menu.appendChild(document.createElement("hr"));
      else if (Array.isArray(entry)) menu.appendChild(flyout(entry[0], entry[1]));
      else if (entry.row) {
        const row = document.createElement("div");
        row.className = "menu-row";
        for (const cmd of entry.row) {
          const b = item(cmd);
          const kbd = b.querySelector("kbd");
          if (kbd) {
            b.title = `${COMMAND.get(cmd).label} (${kbd.textContent})`;
            b.setAttribute("aria-keyshortcuts", kbd.textContent);
            kbd.remove();
          }
          row.appendChild(b);
        }
        menu.appendChild(row);
      } else menu.appendChild(item(entry));
    }
  }

  // The menu bar's menus stand before the document's name, in a menu bar of their own: the name
  // and the saved state are not menus. File's own commands show only where the local server opens
  // files (`file.js`).
  const names = document.createElement("div");
  names.className = "menu-names";
  names.setAttribute("role", "menubar");
  names.setAttribute("aria-label", "Menu");
  bar.insertBefore(names, bar.firstChild);
  for (const [name, entries] of MENUS) {
    const top = document.createElement("div");
    top.className = "top-menu";
    const head = document.createElement("button");
    head.type = "button";
    head.className = "menu-name";
    head.setAttribute("role", "menuitem");
    head.tabIndex = -1;
    head.setAttribute("aria-haspopup", "menu");
    head.setAttribute("aria-expanded", "false");
    head.textContent = name;
    const menu = document.createElement("div");
    menu.className = "menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", name);
    menu.hidden = true;
    fill(menu, entries);
    if (name === "File") {
      top.classList.add("files");
      for (const el of menu.querySelectorAll('[data-cmd^="file-"]')) el.hidden = true;
      const line = menu.querySelector("hr");
      line.classList.add("file-only");
      line.hidden = true;
    }
    top.appendChild(head);
    top.appendChild(menu);
    names.appendChild(top);
  }
  // The names in sight, in order.
  const tops = () => Array.from(names.querySelectorAll(".top-menu:not([hidden]) > .menu-name"));
  // One name takes Tab's stop, the one the focus left last, so Tab reaches the bar once.
  function rove(name) {
    for (const el of names.querySelectorAll(".menu-name")) el.tabIndex = el === name ? 0 : -1;
  }
  rove(tops()[0]);
  names.addEventListener("focusin", (e) => {
    if (e.target.classList.contains("menu-name")) rove(e.target);
  });

  const context = document.createElement("div");
  context.className = "menu context";
  context.setAttribute("role", "menu");
  context.setAttribute("aria-label", "Table");
  context.hidden = true;
  // Cut, Copy, Copy formula, Paste and Paste values stand first, as in Excel's cell menu; the two
  // copies share a row, and so do the two pastes, so the menu still fits a laptop's screen. Flyouts side by side share one line above and
  // below them, as one group of names.
  fill(context, ["cut", { row: ["copy", "copy-formula"] }, { row: ["paste", "paste-values"] }, "-", ...MENUS.find(([name]) => name === "Table")[1]]);
  document.body.appendChild(context);

  // The open top menu's name, or null; and where the focus was before a menu took it.
  let openName = null;
  let back = null;

  const items = (menu) => Array.from(menu.children)
    .flatMap((el) => (el.classList.contains("sub") ? [el.firstElementChild] :
      el.classList.contains("menu-row") ? Array.from(el.children) : [el]))
    .filter((el) => el.tagName === "BUTTON" && !el.disabled && !el.hidden);

  // Every menu keeps off the window's bottom edge, and scrolls where it would pass it (`ks.popup`).
  const { fit, bottom, MARGIN } = ks.popup;

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
    // A flyout stands against the window beside its name, so a menu that scrolls in a short
    // window does not cut it off (`ks.popup.fit`). With no room on the right it opens to the
    // left, and with no room below it moves up until it fits. **One taller than the window
    // scrolls**, as a top menu does: moved up alone, it ran past the bottom.
    const h = head.getBoundingClientRect();
    menu.style.maxHeight = "";
    menu.style.left = "0px";
    menu.style.top = "0px";
    const r = menu.getBoundingClientRect();
    const left = h.right + r.width <= window.innerWidth ? h.right : Math.max(0, h.left - r.width);
    menu.style.left = `${left}px`;
    menu.style.top = `${Math.max(MARGIN, Math.min(h.top - 5, bottom() - r.height))}px`;
    fit(menu);
  }

  function closeFlyouts(menu, except) {
    for (const sub of menu.querySelectorAll(":scope > .sub")) if (sub !== except) showFlyout(sub, false);
  }

  // Opens a top menu; `focusFirst` puts the focus on its first item, or with "last" on its last.
  function openTop(name, focusFirst) {
    if (openName && openName !== name) closeTop();
    const menu = name.nextElementSibling;
    ks.enableTable();
    menu.hidden = false;
    fit(menu);
    name.setAttribute("aria-expanded", "true");
    openName = name;
    rove(name);
    if (focusFirst) {
      const list = items(menu);
      const first = focusFirst === "last" ? list[list.length - 1] : list[0];
      if (first) first.focus();
    }
  }

  function closeTop() {
    if (!openName) return;
    const menu = openName.nextElementSibling;
    closeFlyouts(menu, null);
    // A menu scrolled down opens at its top the next time. Set here, as it closes: set as it
    // opens, the scroll it makes would close the flyout a person opens next.
    menu.scrollTop = 0;
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
    ks.popup.place(context, { x, y });
    const first = items(context)[0];
    if (first) first.focus();
  }

  // Closes every menu. With `restore`, the focus goes back where it was before a menu took it.
  function shut(restore) {
    closeTop();
    closeFlyouts(context, null);
    context.scrollTop = 0;
    context.hidden = true;
    // An open cell the menu's command took is gone, and the chosen cell takes the keys again.
    if (restore) ks.focusBack(back);
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

  // A menu that scrolls closes its flyouts, which stand against the window and would stay behind.
  for (const holder of [bar, context]) {
    holder.addEventListener("scroll", (e) => {
      if (e.target.classList && e.target.classList.contains("menu")) closeFlyouts(e.target, null);
    }, true);
  }

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
    // A right-click on an item offers to put it on the quick access bar, or to take it off.
    menu.addEventListener("contextmenu", (e) => {
      const el = e.target.closest(".menu [data-cmd]");
      if (!el) return;
      e.preventDefault();
      ks.quick.offer(el.dataset.cmd, e.clientX, e.clientY);
    });
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
    const all = tops();
    const step = (k) => {
      const at = all.indexOf(openName || name);
      const next = all[(at + k + all.length) % all.length];
      if (openName) openTop(next, true);
      else next.focus();
    };
    if (name) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        remember();
        openTop(name, e.key === "ArrowUp" ? "last" : true);
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        all[e.key === "Home" ? 0 : all.length - 1].focus();
      }
      return;
    }
    const menu = el && el.closest(".menu");
    if (!menu) return;
    const list = items(menu);
    const at = list.indexOf(el);
    if (ks.popup.move(e, list)) return;
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && el.parentElement.classList.contains("menu-row")) {
      // Left and Right move along a row of items, as Up and Down do.
      e.preventDefault();
      const next = list[at + (e.key === "ArrowRight" ? 1 : -1)];
      if (next && next.parentElement === el.parentElement) next.focus();
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

  // F10 puts the focus on the menu bar's name the focus left last, as in Windows's programs and
  // LibreOffice; pressed in the bar or a menu, it closes the menu and gives the focus back. Alt
  // alone is left to the browser, whose own menu it opens. Shift+F10 opens the right-click menu.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "F10" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    // A dialog open, as Save as, keeps the focus: the page behind it takes none.
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    e.stopPropagation();
    const a = document.activeElement;
    if (a && a.closest && (a.closest(".menu-names") || (a.closest(".menu") && (openName || !context.hidden)))) {
      shut(true);
      return;
    }
    shut(false);
    // An open cell's text goes in first, while it has the focus: taken as the focus left it, the
    // table drawn again gave the focus to the chosen cell, away from the menu bar.
    ks.table.take();
    const now = document.activeElement;
    back = now && now !== document.body ? now : ks.root;
    const name = names.querySelector('.menu-name[tabindex="0"]') || tops()[0];
    if (name) name.focus();
  }, true);

  // A press anywhere outside the open menus closes them.
  document.addEventListener("mousedown", (e) => {
    if (!openName && context.hidden) return;
    if (e.target.closest && (e.target.closest(".menubar") || e.target.closest(".menu.context"))) return;
    shut(false);
  }, true);
  window.addEventListener("blur", () => shut(false));
  window.addEventListener("resize", () => shut(false));

  ks.menus = { openContext, shut };
}
