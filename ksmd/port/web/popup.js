// ksmd page: the small pop-ups over the page, in one place. They are the status bar's menus
// (`status.js`), Paste Options (`paste.js`), the quick access bar's right-click menu and its colour
// palette (`quick.js`), and a column's filter panel (`filter.js`). The menu bar's menus and the
// right-click menu take their place and their keys from here too (`menu.js`).
// One pop-up is open at a time. It stands by what opened it, inside the window, and keeps off its
// bottom edge. Esc, a press outside it and a change of the window's size close it, and the focus
// goes back where it was. In a menu, Up and Down move through its items, Home and End go to the
// first and last, and Tab closes it, as WAI-ARIA's menu does.
"use strict";

function ksmdPopup(ks) {
  // **Every pop-up keeps this far from the window's bottom edge**, so its last item never sits under
  // the edge or the status bar's top line.
  const MARGIN = 8;
  const bottom = () => window.innerHeight - MARGIN;
  // The least height a pop-up that scrolls keeps, so a few of its items still show.
  const LEAST = 80;

  // Makes `part` of a pop-up, the whole of it by default, scroll where the pop-up would pass the
  // bottom edge. The limit is on the part's content, so its padding and border are taken off it,
  // and so is what stands below it in the pop-up.
  function fit(el, part = el) {
    const s = getComputedStyle(part);
    const frame = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"]
      .reduce((sum, k) => sum + parseFloat(s[k]), 0);
    const below = el.getBoundingClientRect().bottom - part.getBoundingClientRect().bottom;
    const room = bottom() - part.getBoundingClientRect().top - frame - below;
    part.style.maxHeight = `${Math.max(LEAST, room)}px`;
  }

  // Puts `el`, already on the page, by `at`: under an element, or above it with `above`, or at a
  // point { x, y } of the window. Under an element, it goes to the side with more room where it
  // does not fit; at a point, it moves left and up until it fits. A pop-up that stands against
  // the page, not the window, takes the page's scroll into its place.
  function place(el, at, above = false, part = el) {
    part.style.maxHeight = "";
    el.style.left = "0px";
    el.style.top = "0px";
    const r = el.getBoundingClientRect();
    let x;
    let y;
    if (at instanceof Element) {
      const box = at.getBoundingClientRect();
      const under = bottom() - box.bottom;
      const over = box.top - MARGIN;
      const down = above ? r.height > over && under > over : !(r.height > under && over > under);
      x = box.left;
      y = down ? box.bottom + 2 : box.top - 2 - r.height;
    } else {
      x = at.x;
      y = Math.min(at.y, bottom() - r.height);
    }
    x = Math.max(0, Math.min(x, window.innerWidth - r.width));
    y = Math.max(MARGIN, y);
    const fixed = getComputedStyle(el).position === "fixed";
    el.style.left = `${x + (fixed ? 0 : window.scrollX)}px`;
    el.style.top = `${y + (fixed ? 0 : window.scrollY)}px`;
    fit(el, part);
  }

  // Moves the focus through a menu's items, `list`, by Up, Down, Home and End, and says whether
  // the key was one of them. Up and Down go round from one end to the other.
  function move(e, list) {
    if (list.length === 0) return false;
    const at = list.indexOf(document.activeElement);
    let next = null;
    if (e.key === "ArrowDown") next = list[at < 0 ? 0 : (at + 1) % list.length];
    else if (e.key === "ArrowUp") next = list[at < 0 ? list.length - 1 : (at - 1 + list.length) % list.length];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    if (!next) return false;
    e.preventDefault();
    next.focus();
    return true;
  }

  // A menu's items: its buttons that can be pressed now.
  const items = (el) => Array.from(el.querySelectorAll("button")).filter((b) => !b.disabled && !b.hidden);

  // The open pop-up: { el, close } or null.
  let open = null;

  // Opens `el` as the pop-up, in place of any open one, and returns { el, close }. `role` is
  // "menu" or "dialog". `how` holds:
  // - `at` and `above`: where it stands (`place`); `part`, what scrolls where it does not fit.
  // - `from`: the button that opened it, whose `aria-expanded` follows it. A press on it is not
  //   outside, so the button itself can close it; so is a press on what `keep` matches.
  // - `focus`: what takes the focus as it opens; a menu's ticked item or first item by default.
  // - `back`: what gives the focus back as it closes; by default, where the focus was.
  // - `onClose`: what runs as it closes.
  // `close(true)` gives the focus back; Esc and Tab in a menu do so, and a press outside does not.
  function popup(el, role, how = {}) {
    if (open) open.close(false);
    const was = document.activeElement;
    el.setAttribute("role", role);
    el.hidden = false;
    if (!el.isConnected) document.body.appendChild(el);
    const p = { el, how };
    p.close = (refocus) => {
      if (open !== p) return;
      open = null;
      el.remove();
      if (how.from) how.from.setAttribute("aria-expanded", "false");
      if (how.onClose) how.onClose();
      if (!refocus) return;
      if (how.back) how.back();
      else ks.focusBack(was);
    };
    el.onkeydown = (e) => {
      if (e.key === "Escape" || (e.key === "Tab" && role === "menu")) {
        e.preventDefault();
        e.stopPropagation();
        p.close(true);
      } else if (role === "menu" && move(e, items(el))) {
        e.stopPropagation();
      }
    };
    open = p;
    if (how.from) how.from.setAttribute("aria-expanded", "true");
    place(el, how.at, !!how.above, how.part || el);
    const first = how.focus || (role === "menu" ? el.querySelector('[aria-checked="true"]') || items(el)[0] : null);
    if (first) first.focus();
    return p;
  }

  document.addEventListener("mousedown", (e) => {
    if (!open) return;
    const t = e.target;
    const { from, keep } = open.how;
    if (open.el.contains(t) || (from && from.contains(t)) || (keep && t.closest && t.closest(keep))) return;
    open.close(false);
  }, true);
  window.addEventListener("resize", () => open && open.close(false));

  ks.popup = Object.assign(popup, {
    place,
    fit,
    move,
    // Closes `el` where it is the open pop-up; with `refocus`, the focus goes back where it was.
    close: (el, refocus = false) => {
      if (open && el && open.el === el) open.close(refocus);
    },
    // Whether `el` is the open pop-up.
    isOpen: (el) => !!open && open.el === el,
    bottom,
    MARGIN,
  });
}
