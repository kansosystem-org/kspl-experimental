// ksmd page: what the document's own settings (`:::document`) change on the page and on paper.
// Headings number themselves from the level `numbers` names, captions of tables and images take
// a number by chapter ("Table 4-12"), and a link whose text is `#` shows the number of what it
// names. The paper's size and the printed header and footer follow the settings. File, Page
// setup... opens a panel that sets them all, as one step.
// Caution: **A number is drawn by CSS from a `data-` attribute, never written into the text.**
// The text of an editable block is what the model counts, so a number inside it would move
// every caret after it.
"use strict";

function ksmdSettings(ks) {
  let settings = null; // the `:::document` block's settings, or null
  // Each place a reference can name, by its text: { el, shows }.
  let targets = new Map();

  const LEVELS = ["H1", "H2", "H3", "H4", "H5", "H6"];

  // A text as CSS `content` writes it, with `{page}` and `{pages}` as the page's counters.
  function content(text) {
    const parts = text.split(/(\{pages\}|\{page\})/).filter((p) => p !== "");
    return parts.map((p) => (p === "{page}" ? "counter(page)" : p === "{pages}" ? "counter(pages)" :
      JSON.stringify(p))).join(" ");
  }

  // The paper and the printed header and footer, in a style of their own after `print.css`.
  function paper() {
    let style = document.getElementById("ksmd-paper");
    if (!style) {
      style = document.createElement("style");
      style.id = "ksmd-paper";
      document.head.appendChild(style);
    }
    const s = settings;
    if (!s) {
      style.textContent = "";
      return;
    }
    const size = [s.paper, s.land ? "landscape" : ""].filter(Boolean).join(" ");
    style.textContent = `@page {${size ? ` size: ${size};` : ""}` +
      (s.header ? ` @top-center { content: ${content(s.header)}; }` : "") +
      (s.footer ? ` @bottom-left { content: ${content(s.footer)}; }` : "") + " }";
  }

  // The place a `#` link names: its text after the `#`, each run of `%XX` escapes read as the
  // UTF-8 it writes. Caution: **A `%` that starts no escape stays itself.** Read as an escape, it
  // threw, and a reference to a heading such as `Rise 5%` stopped the document opening.
  const placeOf = (href) => href.slice(1).replace(/(%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch (_) {
      return run;
    }
  });

  // Numbers the headings, the captions and the references of the page as it stands now.
  function apply() {
    const first = ks.view.blocks()[0];
    settings = first && first.classList.contains("settings") ? first.settings : null;
    paper();
    targets = new Map();
    const from = settings ? settings.numbers : 0;
    const counts = [0, 0, 0, 0, 0, 0];
    let tables = 0;
    let figures = 0;
    const chapter = () => (from > 0 ? `${counts[from - 1]}-` : "");
    const all = ks.root.querySelectorAll("h1.b, h2.b, h3.b, h4.b, h5.b, h6.b, .b.table, .b.figure");
    for (const el of all) {
      const level = LEVELS.indexOf(el.tagName);
      if (level >= 0) {
        const text = el.textContent.trim();
        delete el.dataset.number;
        if (from > 0 && level + 1 >= from) {
          counts[level] += 1;
          for (let k = level + 1; k < 6; k++) counts[k] = 0;
          // A new chapter starts the captions' numbers again.
          if (level + 1 === from) {
            tables = 0;
            figures = 0;
          }
          el.dataset.number = counts.slice(from - 1, level + 1).join(".");
        }
        if (text && !targets.has(text)) targets.set(text, { el, shows: el.dataset.number || text });
        continue;
      }
      const caption = el.querySelector(el.classList.contains("table") ? ".table-caption" : "figcaption");
      if (!caption) continue;
      const isTable = el.classList.contains("table");
      const label = isTable ? (settings && settings.tl) || "Table" : (settings && settings.fl) || "Figure";
      delete caption.dataset.number;
      if (from > 0) {
        const n = isTable ? ++tables : ++figures;
        caption.dataset.number = `${label} ${chapter()}${n}`;
      }
      const shows = caption.dataset.number || caption.textContent.trim();
      for (const key of [caption.textContent.trim(), isTable ? el.dataset.name : ""]) {
        if (key && !targets.has(key)) targets.set(key, { el, shows });
      }
    }
    // The contents list shows the numbers too.
    if (ks.contents) ks.contents.build();
    for (const a of ks.root.querySelectorAll('a[href^="#"]')) {
      if (a.textContent !== "#") continue;
      const t = targets.get(placeOf(a.getAttribute("href")));
      a.classList.add("ref");
      a.classList.toggle("ref-missing", !t);
      a.dataset.ref = t ? t.shows : "#?";
      a.title = t ? `Goes to ${t.shows}` : "No heading, table or image of this name stands in the document";
    }
  }

  // Where a `#place` link goes: the heading, table or image it names, or null.
  const target = (href) => {
    const t = targets.get(placeOf(href));
    return t ? t.el : null;
  };

  // The bar a `:::document` block shows at the document's top: what it sets, Edit and Remove.
  function render(b) {
    const el = ks.el("div", "b settings");
    el.contentEditable = "false";
    el.settings = b;
    const said = [b.paper && `${b.paper}${b.land ? " landscape" : ""}`, !b.paper && b.land && "landscape",
      b.header && `header "${b.header}"`, b.footer && `footer "${b.footer}"`,
      b.numbers && `headings numbered from level ${b.numbers}`, b.tl && `tables "${b.tl}"`,
      b.fl && `images "${b.fl}"`].filter(Boolean);
    const text = ks.el("span", "settings-text", `Page setup: ${said.join(", ")}`);
    const edit = ks.button("Edit", "settings-edit", "Change the paper, the printed header and footer, and the numbers");
    el.append(text, edit, ks.view.removeButton("Take the page setup away"));
    return el;
  }

  const PAPERS = ["A3", "A4", "A5", "B4", "B5", "JIS-B4", "JIS-B5", "letter", "legal"];
  // The panel that sets the paper, the header and footer, the numbers and the labels.
  function ask() {
    const now = settings || { paper: "", land: 0, header: "", footer: "", numbers: 0, tl: "", fl: "" };
    const panel = ks.panel("settings-panel", "Page setup", () => {
      const s = { paper: paperSel.value, land: Number(orient.value), header: header.value.trim(),
        footer: footer.value.trim(), numbers: Number(numbers.value), tl: tl.value.trim(), fl: fl.value.trim() };
      ks.act("ksmd_web_settings", ks.put(JSON.stringify(s)));
    });
    // Each list and field has a name of its own, which a screen reader says: a field's example
    // text goes once something is typed.
    const pick = (cls, name, options, value) => {
      const sel = ks.el("select", cls);
      sel.setAttribute("aria-label", name);
      for (const [v, label] of options) sel.add(new Option(label, v));
      sel.value = String(value);
      return sel;
    };
    const field = (cls, name, value, hint) => {
      const input = document.createElement("input");
      input.setAttribute("aria-label", name);
      input.type = "text";
      input.className = cls;
      input.value = value;
      input.placeholder = hint;
      return input;
    };
    const paperSel = pick("settings-paper", "Paper",
      [["", "The browser's paper"], ...PAPERS.map((p) => [p, p])], now.paper);
    const orient = pick("settings-orientation", "Orientation", [["0", "Portrait"], ["1", "Landscape"]], now.land);
    const header = field("settings-header", "Header", now.header, "Header, as [Confidential]");
    const footer = field("settings-footer", "Footer", now.footer, "Footer, as No.123 ({page}/{pages})");
    const numbers = pick("settings-numbers", "Heading numbers", [["0", "No numbers"],
      ...[1, 2, 3, 4, 5, 6].map((n) => [String(n), `Number headings from level ${n}`])], now.numbers);
    const tl = field("settings-tl", "Word before a table's number", now.tl, "Word before a table's number: Table");
    const fl = field("settings-fl", "Word before an image's number", now.fl, "Word before an image's number: Figure");
    for (const part of [paperSel, orient, header, footer, numbers, tl, fl]) {
      const row = document.createElement("div");
      row.appendChild(part);
      panel.el.appendChild(row);
    }
    panel.show();
    paperSel.focus();
    return null;
  }

  ks.root.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".settings-edit")) ask();
  });

  ks.handle("page-setup", () => ask());

  // The settings the document holds now, or null.
  ks.settings = { apply, target, render, current: () => settings };
}
