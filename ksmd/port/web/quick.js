// ksmd page: the quick access bar, the one row of tools under the menu bar, as in Office. It holds
// the commands the person chose, each as its icon, in the menus' order, with a line between two
// menus' tools. View, Quick access bar opens the chooser, and a right-click on a command, in a menu
// or on the bar, adds it or takes it off. The choice is this browser's own, as the width is, so
// nothing goes into the file. The tools show what stands at the caret: its kind of block, its
// marks and its alignment.
// The tools press the same commands as the menus (`commands.js`). Two of them are split: the face
// applies the colour shown on it, and the arrow opens a palette. The fill and size tools act on
// table cells, so they are pressed only while a cell is the place.
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
    const b = document.createElement("button");
    b.type = "button";
    b.dataset.cmd = name;
    b.title = key ? `${label} (${key})` : label;
    b.setAttribute("aria-label", label);
    b.appendChild(ksmdIcon(name));
    const twin = ks.bar.querySelector(`[data-cmd="${name}"]`);
    if (twin && twin.hasAttribute("aria-checked")) b.setAttribute("aria-checked", twin.getAttribute("aria-checked"));
    return b;
  }

  function split(part) {
    const s = document.createElement("span");
    s.className = "split";
    s.dataset.colour = part;
    const face = document.createElement("button");
    face.type = "button";
    face.className = "apply";
    face.title = part === "color" ? "Font colour of the selected text or the chosen table cells" :
      "Fill colour of the chosen table cells";
    face.setAttribute("aria-label", part === "color" ? "Font colour" : "Fill colour");
    face.appendChild(ksmdIcon(part));
    face.addEventListener("click", () => ks.applyLook(part, current[part]));
    const more = document.createElement("button");
    more.type = "button";
    more.className = "more";
    more.setAttribute("aria-haspopup", "true");
    more.title = part === "color" ? "Choose the font colour" : "Choose the fill colour";
    more.textContent = "▾";
    more.addEventListener("click", () => (palette ? closePalette() : openPalette(part, s)));
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
        const line = document.createElement("span");
        line.className = "sep";
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
  }

  // Each split tool's face shows the colour it applies.
  function paint() {
    for (const part of ["color", "fill"]) {
      for (const el of bar.querySelectorAll(`.split[data-colour="${part}"] .swatch-${part}`)) {
        el.style.fill = current[part];
      }
    }
  }

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

  // The palette of one colour: the standard colours, none, and any colour. It opens under its
  // split tool, or under the Format menu where the bar holds none.
  let palette = null;
  function closePalette() {
    if (palette) palette.remove();
    palette = null;
  }
  function openPalette(part, under) {
    closePalette();
    const at = under || bar.querySelector(`.split[data-colour="${part}"]`) ||
      Array.from(ks.bar.querySelectorAll(".menu-name")).find((el) => el.textContent === "Format");
    palette = document.createElement("div");
    palette.className = "palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-label", part === "color" ? "Font colour" : "Fill colour");
    const pick = (value) => {
      closePalette();
      if (value) {
        current[part] = value;
        paint();
      }
      ks.applyLook(part, value);
    };
    const none = document.createElement("button");
    none.type = "button";
    none.className = "none";
    none.textContent = part === "color" ? "Automatic" : "No fill";
    none.addEventListener("click", () => pick(""));
    palette.appendChild(none);
    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const c of QUICK_COLOURS) {
      const b = document.createElement("button");
      b.type = "button";
      b.style.backgroundColor = c;
      b.title = c;
      b.setAttribute("aria-label", c);
      b.addEventListener("click", () => pick(c));
      swatches.appendChild(b);
    }
    palette.appendChild(swatches);
    const more = document.createElement("label");
    more.className = "more-colours";
    const input = document.createElement("input");
    input.type = "color";
    input.value = current[part];
    input.addEventListener("change", () => pick(input.value));
    more.append("More colours… ", input);
    palette.appendChild(more);
    palette.addEventListener("mousedown", (e) => {
      if (e.target.tagName === "BUTTON") e.preventDefault();
    });
    document.body.appendChild(palette);
    const r = at.getBoundingClientRect();
    palette.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - palette.offsetWidth - 4))}px`;
    palette.style.top = `${r.bottom + window.scrollY}px`;
  }
  document.addEventListener("mousedown", (e) => {
    if (palette && !palette.contains(e.target) && !(e.target.closest && e.target.closest(".split .more"))) {
      closePalette();
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (palette && e.key === "Escape") closePalette();
  });

  // The small menu a right-click on a command opens: add it to the bar, or take it off, and on the
  // bar move it left or right.
  let offered = null;
  function shutOffer() {
    if (offered) offered.remove();
    offered = null;
  }
  function offer(name, x, y) {
    shutOffer();
    if (!placed.has(name)) return;
    if (ks.menus) ks.menus.shut(false);
    const choices = !chosen.includes(name) ? [["Add to quick access bar", () => set([...chosen, name])]] :
      [["Remove from quick access bar", () => set(chosen.filter((n) => n !== name))]];
    choices.push(["Choose tools…", choose]);
    offered = document.createElement("div");
    offered.className = "menu context quick-offer";
    offered.setAttribute("role", "menu");
    offered.setAttribute("aria-label", labelOf(name));
    for (const [text, act] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.textContent = text;
      b.addEventListener("click", () => {
        shutOffer();
        act();
      });
      offered.appendChild(b);
    }
    offered.addEventListener("mousedown", (e) => e.preventDefault());
    offered.addEventListener("keydown", (e) => {
      if (e.key === "Escape") shutOffer();
    });
    document.body.appendChild(offered);
    const r = offered.getBoundingClientRect();
    offered.style.left = `${Math.max(0, Math.min(x, window.innerWidth - r.width))}px`;
    offered.style.top = `${Math.max(0, Math.min(y, window.innerHeight - r.height))}px`;
    offered.firstElementChild.focus();
  }
  document.addEventListener("mousedown", (e) => {
    if (offered && !offered.contains(e.target)) shutOffer();
  }, true);
  window.addEventListener("blur", shutOffer);

  // The chooser: every command, menu by menu, each with a box that puts it on the bar or takes it
  // off at once. Reset brings back the tools every page starts with.
  let dialog = null;
  function choose() {
    shutOffer();
    if (!dialog) dialog = chooser();
    for (const box of dialog.querySelectorAll("input[type=checkbox]")) box.checked = chosen.includes(box.value);
    dialog.showModal();
  }
  function chooser() {
    const d = document.createElement("dialog");
    d.className = "quick-choose";
    d.setAttribute("aria-labelledby", "quick-choose-title");
    const title = document.createElement("h2");
    title.id = "quick-choose-title";
    title.textContent = "Quick access bar";
    const note = document.createElement("p");
    note.textContent = "Tick the commands the bar holds. A right-click on a command in a menu adds it too.";
    const groups = document.createElement("div");
    groups.className = "quick-groups";
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
    const buttons = document.createElement("div");
    buttons.className = "quick-buttons";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      set(QUICK_DEFAULT.slice());
      for (const box of d.querySelectorAll("input[type=checkbox]")) box.checked = chosen.includes(box.value);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.addEventListener("click", () => d.close());
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

  ks.quick = { offer, choose, palette: (part) => openPalette(part, null), sync, render };
  render();
}
