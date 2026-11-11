// ksmd page: the quick access bar, the one row of tools under the menu bar, as in Office. It holds
// the commands the person chose, each as its icon, in the menus' order, with a line between two
// menus' tools. View, Quick access bar opens the chooser, and a right-click on a command, in a menu
// or on the bar, adds it or takes it off. The choice is this browser's own, as the width is, so
// nothing goes into the file. The tools show what stands at the caret: its kind of block, its
// marks and its alignment.
// The tools press the same commands as the menus (`commands.js`). Two of them are split: the face
// applies the colour shown on it, and the arrow opens a palette. The fill and size tools act on
// table cells, so they are pressed only while a cell is the place.
// The bar is one stop of Tab, as WAI-ARIA's toolbar is: Left and Right move along its tools, Home
// and End go to the first and last, and Up and Down stay with a list.
"use strict";

// Office's standard colours, as a palette shows them first.
const QUICK_COLOURS = ["#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050",
  "#00b0f0", "#0070c0", "#002060", "#7030a0", "#000000", "#595959", "#a6a6a6", "#ffffff"];
// The sizes in points the size list offers: the few that people choose.
const QUICK_SIZES = ["9", "10", "11", "12", "14", "18", "24"];
// Where the choice is kept in this browser.
const QUICK_KEY = "ksmd.quick";

function ksmdQuick(ks) {
  const bar = document.querySelector(".quick");
  if (!bar) return;
  // The colour each split tool's face applies; it changes to the colour chosen last.
  const current = { color: "#c00000", fill: "#ffff00" };
  const labelOf = (name) => (COMMAND.get(name) || {}).label ||
    QUICK_LISTS.find(([n]) => n === name)[1];

  // Where each tool stands: its menu, and its place there. The lists stand beside the flyout of
  // the commands they choose from. The bar shows its tools in this order, whatever order they were
  // chosen in, so a tool is always found where its menu puts it.
  const placed = new Map();
  MENUS.forEach(([, entries], menu) => {
    for (const entry of entries) {
      if (entry === "-") continue;
      if (Array.isArray(entry)) {
        const list = entry[0] === "Kind of block" ? "kind-list" : entry[0] === "Font size" ? "size-list" : null;
        if (list) placed.set(list, { menu, at: placed.size });
      }
      for (const name of Array.isArray(entry) ? entry[1] : [entry]) {
        if (!placed.has(name)) placed.set(name, { menu, at: placed.size });
      }
    }
  });

  // The tools chosen. A name no command answers, as one a later page dropped, goes.
  let chosen = QUICK_DEFAULT;
  try {
    const kept = JSON.parse(localStorage.getItem(QUICK_KEY));
    if (Array.isArray(kept)) chosen = kept.filter((name) => placed.has(name));
  } catch (_) { /* a browser that keeps nothing shows the tools every page starts with */ }
  const keep = () => {
    try {
      localStorage.setItem(QUICK_KEY, JSON.stringify(chosen));
    } catch (_) { /* the choice then lasts while the page is open */ }
  };
  const set = (list) => {
    chosen = list;
    keep();
    render();
  };

  // A command's tool: its icon, with its name and key on pointing. It is ticked where its menu
  // item is.
  function button(name) {
    const { label, key } = COMMAND.get(name);
    const b = ks.button("", null, key ? `${label} (${key})` : label);
    b.dataset.cmd = name;
    b.setAttribute("aria-label", label);
    b.appendChild(ksmdIcon(name));
    const twin = ks.bar.querySelector(`[data-cmd="${name}"]`);
    if (twin && twin.hasAttribute("aria-checked")) b.setAttribute("aria-checked", twin.getAttribute("aria-checked"));
    return b;
  }

  function split(part) {
    const s = ks.el("span", "split");
    s.dataset.colour = part;
    const face = ks.button("", "apply", part === "color" ?
      "Font colour of the selected text or the chosen table cells" : "Fill colour of the chosen table cells",
    () => ks.applyLook(part, current[part]));
    face.setAttribute("aria-label", part === "color" ? "Font colour" : "Fill colour");
    face.appendChild(ksmdIcon(part));
    const more = ks.button("▾", "more", part === "color" ? "Choose the font colour" : "Choose the fill colour",
      () => openPalette(part, s));
    more.setAttribute("aria-haspopup", "true");
    s.append(face, more);
    return s;
  }

  function list(name) {
    const sel = document.createElement("select");
    sel.dataset.quick = name;
    const add = (value, text) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = text;
      sel.appendChild(o);
    };
    if (name === "kind-list") {
      sel.title = "Kind of block";
      add("", "Kind of block");
      for (const kind of MENUS.find(([n]) => n === "Format")[1][0][1]) add(kind, COMMAND.get(kind).label);
      add("quote", "Quote");
      sel.addEventListener("change", () => {
        const kind = sel.value;
        sel.value = "";
        ks.command(kind);
        ks.root.focus();
      });
    } else {
      sel.title = "Font size of the chosen table cells; text takes none";
      add("", "Size");
      add("-", "Default");
      for (const size of QUICK_SIZES) add(size, size);
      sel.addEventListener("change", () => {
        const value = sel.value === "-" ? "" : sel.value;
        sel.value = "";
        ks.applyLook("size", value);
      });
    }
    sel.setAttribute("aria-label", sel.title);
    return sel;
  }

  function render() {
    closePalette();
    bar.textContent = "";
    let menu = -1;
    // A tool its menu hides, as Save opened from a file, stands nowhere, and so starts no group.
    const hidden = (name) => {
      const twin = ks.bar.querySelector(`[data-cmd="${name}"]`);
      return !!twin && twin.hidden;
    };
    for (const name of chosen.slice().sort((a, b) => placed.get(a).at - placed.get(b).at)) {
      if (hidden(name)) continue;
      // A line stands between the tools of two menus, as File's and Edit's.
      if (menu >= 0 && placed.get(name).menu !== menu) {
        const line = ks.el("span", "sep");
        line.setAttribute("role", "separator");
        bar.appendChild(line);
      }
      menu = placed.get(name).menu;
      if (name === "color" || name === "fill") bar.appendChild(split(name));
      else if (name === "kind-list" || name === "size-list") bar.appendChild(list(name));
      else bar.appendChild(button(name));
    }
    paint();
    sync();
    rove();
  }

  // Each split tool's face shows the colour it applies.
  function paint() {
    for (const part of ["color", "fill"]) {
      for (const el of bar.querySelectorAll(`.split[data-colour="${part}"] .swatch-${part}`)) {
        el.style.fill = current[part];
      }
    }
  }

  // The one tool Tab stops at: the one the focus left last, while it can be pressed, else the
  // first that can. Fifteen stops in a row made the document far to reach by Tab.
  const tools = () => Array.from(bar.querySelectorAll("button, select")).filter((el) => !el.disabled);
  const keyOf = (el) => (el ? `${el.dataset.cmd || el.dataset.quick || ""}|${el.className}|${
    el.closest(".split") ? el.closest(".split").dataset.colour : ""}` : "");
  let stop = "";
  function rove() {
    const list = tools();
    const at = list.find((el) => keyOf(el) === stop) || list[0];
    for (const el of bar.querySelectorAll("button, select")) el.tabIndex = el === at ? 0 : -1;
  }
  // A tool greyed out, or pressable again, moves the stop as it changes.
  new MutationObserver(rove).observe(bar, { subtree: true, childList: true, attributeFilter: ["disabled"] });
  bar.addEventListener("focusin", (e) => {
    stop = keyOf(e.target);
    rove();
  });
  bar.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const list = tools();
    const at = list.indexOf(e.target);
    if (at < 0) return;
    let next = null;
    if (e.key === "ArrowRight") next = list[(at + 1) % list.length];
    else if (e.key === "ArrowLeft") next = list[(at - 1 + list.length) % list.length];
    else if (e.key === "Home") next = list[0];
    else if (e.key === "End") next = list[list.length - 1];
    if (!next) return;
    e.preventDefault();
    next.focus();
  });

  bar.addEventListener("mousedown", (e) => {
    // A tool must not take the selection away from the document or the cell.
    if (e.target.closest("button")) e.preventDefault();
  });
  bar.addEventListener("click", (e) => {
    const el = e.target.closest("[data-cmd]");
    if (el && !el.disabled) ks.command(el.dataset.cmd);
  });
  bar.addEventListener("contextmenu", (e) => {
    const el = e.target.closest("[data-cmd], .split, select");
    if (!el) return;
    e.preventDefault();
    offer(el.dataset.cmd || el.dataset.colour || el.dataset.quick, e.clientX, e.clientY);
  });

  // The palette of one colour (`ks.popup`): the standard colours, none, and any colour. It opens
  // under its split tool, or under the Format menu where the bar holds none.
  let palette = null;
  const closePalette = () => ks.popup.close(palette);
  function openPalette(part, under) {
    const at = under || bar.querySelector(`.split[data-colour="${part}"]`) ||
      Array.from(ks.bar.querySelectorAll(".menu-name")).find((el) => el.textContent === "Format");
    palette = ks.el("div", "palette");
    palette.setAttribute("aria-label", part === "color" ? "Font colour" : "Fill colour");
    const pick = (value) => {
      ks.popup.close(palette, true);
      if (value) {
        current[part] = value;
        paint();
      }
      ks.applyLook(part, value);
    };
    palette.appendChild(ks.button(part === "color" ? "Automatic" : "No fill", "none", null, () => pick("")));
    const swatches = ks.el("div", "swatches");
    for (const c of QUICK_COLOURS) {
      const b = ks.button("", null, c, () => pick(c));
      b.style.backgroundColor = c;
      b.setAttribute("aria-label", c);
      swatches.appendChild(b);
    }
    palette.appendChild(swatches);
    const more = ks.el("label", "more-colours");
    const input = document.createElement("input");
    input.type = "color";
    input.value = current[part];
    input.addEventListener("change", () => pick(input.value));
    more.append("More colours… ", input);
    palette.appendChild(more);
    palette.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") e.preventDefault();
    });
    const from = under ? under.querySelector(".more") : null;
    ks.popup(palette, "dialog", { at, from, focus: swatches.firstElementChild });
  }

  // The small menu a right-click on a command opens (`ks.popup`): add it to the bar, or take it
  // off, or choose the tools. A menu it was opened from closes first, and gives the focus back.
  let offered = null;
  function offer(name, x, y) {
    if (!placed.has(name)) return;
    ks.menus.shut(true);
    const choices = !chosen.includes(name) ? [["Add to quick access bar", () => set([...chosen, name])]] :
      [["Remove from quick access bar", () => set(chosen.filter((n) => n !== name))]];
    choices.push(["Choose tools…", choose]);
    offered = ks.el("div", "menu context quick-offer");
    offered.setAttribute("aria-label", labelOf(name));
    for (const [text, act] of choices) {
      const b = ks.button(text, null, null, () => {
        ks.popup.close(offered, true);
        act();
      });
      b.setAttribute("role", "menuitem");
      offered.appendChild(b);
    }
    offered.addEventListener("mousedown", (e) => e.preventDefault());
    ks.popup(offered, "menu", { at: { x, y } });
  }
  window.addEventListener("blur", () => ks.popup.close(offered));

  // The chooser: every command, menu by menu, each with a box that puts it on the bar or takes it
  // off at once. Reset brings back the tools every page starts with.
  let dialog = null;
  function choose() {
    if (!dialog) dialog = chooser();
    for (const box of dialog.querySelectorAll("input[type=checkbox]")) box.checked = chosen.includes(box.value);
    dialog.showModal();
  }
  function chooser() {
    const d = ks.el("dialog", "quick-choose");
    d.setAttribute("aria-labelledby", "quick-choose-title");
    const title = document.createElement("h2");
    title.id = "quick-choose-title";
    title.textContent = "Quick access bar";
    const note = document.createElement("p");
    note.textContent = "Tick the commands the bar holds. A right-click on a command in a menu adds it too.";
    const groups = ks.el("div", "quick-groups");
    const names = (entries) => entries.flatMap((e) => (e === "-" ? [] : Array.isArray(e) ? e[1] : [e]));
    // A command in two menus, as Note in Insert and Table, is listed in the first alone.
    const listed = new Set();
    for (const [menu, entries] of MENUS) {
      const field = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = menu;
      field.appendChild(legend);
      const own = names(entries).concat(menu === "Format" ? QUICK_LISTS.map(([n]) => n) : [])
        .filter((name) => !listed.has(name));
      for (const name of own) {
        listed.add(name);
        const row = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.value = name;
        box.addEventListener("change", () => set(box.checked ? [...chosen, name] :
          chosen.filter((n) => n !== name)));
        const text = document.createElement("span");
        text.textContent = labelOf(name);
        row.append(box, ksmdIcon(name), text);
        field.appendChild(row);
      }
      groups.appendChild(field);
    }
    const buttons = ks.el("div", "quick-buttons");
    const reset = ks.button("Reset", null, null, () => {
      set(QUICK_DEFAULT.slice());
      for (const box of d.querySelectorAll("input[type=checkbox]")) box.checked = chosen.includes(box.value);
    });
    const close = ks.button("Close", null, null, () => d.close());
    buttons.append(reset, close);
    d.append(title, note, groups, buttons);
    d.addEventListener("close", () => ks.root.focus());
    document.body.appendChild(d);
    return d;
  }

  // The colour, size and kind tools follow where the person works, and read-only presses none.
  // A font colour belongs to text or cells, and so not to a code block's literal text.
  function sync() {
    const literal = ks.where !== "cell" && !!ks.here && /^(code|other)$/.test(ks.here.k);
    for (const el of bar.querySelectorAll(".split button, select")) {
      const part = el.closest(".split") ? el.closest(".split").dataset.colour : el.dataset.quick;
      const cells = part === "fill" || part === "size-list";
      el.disabled = ks.readOnly || (cells && ks.where !== "cell") ||
        (part === "color" && literal) || (part === "kind-list" && ks.where === "cell");
    }
    if (ks.enableTable) ks.enableTable();
    show();
  }

  // What stands at the caret shows on the tools, as in Word: the kind of block in its list, and
  // each mark, kind of list and alignment pressed where it is on. A chosen cell shows none.
  function show() {
    const h = ks.where === "cell" ? null : ks.here;
    const kinds = { paragraph: "p", code: "c", quote: "quote" };
    const kind = !h ? "" : h.k === "heading" ? `h${h.l}` : kinds[h.k] || "";
    for (const sel of bar.querySelectorAll('[data-quick="kind-list"]')) sel.value = kind;
    const list = !!h && h.k === "list";
    const on = { emphasis: !!h && h.m[0] === 1, strong: !!h && h.m[1] === 1, code: !!h && h.m[2] === 1,
      bullets: list && h.o === 0 && h.c === 0, numbers: list && h.o === 1, checks: list && h.c > 0,
      quote: !!h && h.k === "quote", "align-left": !!h && h.a === "left",
      "align-center": !!h && h.a === "center", "align-right": !!h && h.a === "right" };
    for (const el of bar.querySelectorAll("[data-cmd]")) {
      if (el.dataset.cmd in on) el.setAttribute("aria-pressed", String(on[el.dataset.cmd]));
    }
  }

  // The caret moving in the text asks the editor what stands there, once a frame at most. A
  // composition is left alone: the input method owns the text until it ends.
  let asked = false;
  document.addEventListener("selectionchange", () => {
    if (asked || ks.composing || ks.where === "cell") return;
    const s = window.getSelection();
    const node = s.rangeCount > 0 ? s.focusNode : null;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || !ks.root.contains(el) || ks.table.owns(el)) return;
    asked = true;
    requestAnimationFrame(() => {
      asked = false;
      if (!ks.composing && ks.where !== "cell") ks.hereNow();
      sync();
    });
  });
  ks.placeHooks.push(sync);
  ks.rendered.push(sync);

  ks.handle("quick-choose", () => choose(), { looks: true });
  ks.handle(["color", "fill"], (name) => openPalette(name, null));

  ks.quick = { offer, sync, render };
  render();
}
