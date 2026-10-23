// ksmd page: the ribbon, the row of tools under the menu bar, as in Office. Each group stands
// named, and a tool shows its name or its shortcut on pointing. The Table group stands only while
// a table cell is the place being worked in. The tools press the same commands as the menus.
// A colour tool is split: its face applies the colour shown on it, and its arrow opens a palette.
"use strict";

// Office's standard colours, as a palette shows them first.
const RIBBON_COLOURS = ["#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050", "#00b050",
  "#00b0f0", "#0070c0", "#002060", "#7030a0", "#000000", "#595959", "#a6a6a6", "#ffffff"];
// The sizes in points the size list offers, as Office's does.
const RIBBON_SIZES = ["8", "9", "10", "10.5", "11", "12", "14", "16", "18", "20", "24", "28", "36",
  "48", "72"];

function ksmdRibbon(ks) {
  const ribbon = document.querySelector(".ribbon");
  if (!ribbon) return;
  const tableGroup = ribbon.querySelector(".table-group");
  // The colour each split tool's face applies; it changes to the colour chosen last.
  const current = { color: "#c00000", fill: "#ffff00" };

  ribbon.addEventListener("mousedown", (e) => {
    // A tool must not take the selection away from the document or the cell.
    if (e.target.closest("button")) e.preventDefault();
  });
  ribbon.addEventListener("click", (e) => {
    const el = e.target.closest("[data-cmd]");
    if (el && !el.disabled) ks.command(el.dataset.cmd);
  });

  const kind = ribbon.querySelector('[data-ribbon="kind"]');
  kind.addEventListener("change", () => {
    const name = kind.value;
    kind.value = "";
    ks.command(name);
    ks.root.focus();
  });
  const size = ribbon.querySelector('[data-ribbon="size"]');
  for (const s of RIBBON_SIZES) {
    const o = document.createElement("option");
    o.value = s;
    o.textContent = s;
    size.appendChild(o);
  }
  size.addEventListener("change", () => {
    const value = size.value === "-" ? "" : size.value;
    size.value = "";
    ks.applyLook("size", value);
  });

  // The palette of one split tool: the standard colours, none, and any colour.
  let palette = null;
  function closePalette() {
    if (palette) palette.remove();
    palette = null;
  }
  function openPalette(split) {
    closePalette();
    const part = split.dataset.colour;
    palette = document.createElement("div");
    palette.className = "palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-label", part === "color" ? "Font colour" : "Fill colour");
    const pick = (value) => {
      closePalette();
      if (value) {
        current[part] = value;
        split.querySelector(".swatch").style.backgroundColor = value;
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
    for (const c of RIBBON_COLOURS) {
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
    const r = split.getBoundingClientRect();
    palette.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - palette.offsetWidth - 4))}px`;
    palette.style.top = `${r.bottom + window.scrollY}px`;
  }
  for (const split of ribbon.querySelectorAll(".split")) {
    const part = split.dataset.colour;
    split.querySelector(".swatch").style.backgroundColor = current[part];
    split.querySelector(".apply").addEventListener("click", () => ks.applyLook(part, current[part]));
    split.querySelector(".more").addEventListener("click", () => {
      if (palette) closePalette();
      else openPalette(split);
    });
  }
  document.addEventListener("mousedown", (e) => {
    if (palette && !palette.contains(e.target) && !(e.target.closest && e.target.closest(".split .more"))) {
      closePalette();
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (palette && e.key === "Escape") closePalette();
  });

  // The Table group stands while a table cell is the place being worked in.
  const sync = () => {
    tableGroup.hidden = ks.where !== "cell";
    ks.enableTable();
  };
  ks.placeHooks.push(sync);
  ks.rendered.push(sync);
  sync();
}
