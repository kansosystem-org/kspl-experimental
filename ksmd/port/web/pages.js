// ksmd page: on which printed page the caret stands, and how many pages the print has. A browser
// tells a script nothing of its print's pages, so the page lays the document out once more in a
// hidden frame, as the print does: the page's own styles with the print's rules in force, on the
// paper `:::document` names and inside the margin of `@page` in `print.css`. The frame cuts it into
// columns one page high, and the browser breaks lines, rows and blocks between them as between
// printed pages. A divider's page break is a column break there.
// The print dialog's own paper, margins or scale can still change the count, and the bar says so.
"use strict";

// The most elements the document can hold for the bar to count its pages: such a document, of
// about 2,000 table rows and 2,000 paragraphs, lays out in a few tenths of a second.
const PAGES_MOST_ELEMENTS = 15000;

function ksmdPages(ks) {
  let frame = null;
  let inner = null; // the copy of the document in the frame
  let laid = null; // the paper the copy was laid out on: { width, height, name }
  let copied = ""; // the document's HTML the copy was made from
  let timer = 0;
  let cost = 0; // how long the last layout took, in milliseconds

  // The `@page` rule of the page's styles that sets the print's margin, or null.
  function pageRule() {
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSPageRule && rule.style.getPropertyValue("margin-top")) return rule;
      }
    }
    return null;
  }

  // The paper the document prints on, in CSS pixels: its whole width and height, and the room inside
  // the margins. A document that names no paper takes A4, which most of the world prints on.
  function paper() {
    const s = ks.settings.current();
    const name = (s && s.paper) || "A4";
    const [w, h] = SIZE_PAPERS[name] || SIZE_PAPERS.A4;
    const land = !!(s && s.land);
    const px = (mm) => (mm * 96) / 25.4;
    const rule = pageRule();
    const side = (edge) => length(rule ? rule.style.getPropertyValue(`margin-${edge}`) : "");
    const width = px(land ? h : w) - side("left") - side("right");
    const height = px(land ? w : h) - side("top") - side("bottom");
    return { width, height, name: `${name}${land ? " landscape" : ""}${s && s.paper ? "" : ", as the document names no paper"}` };
  }

  // A CSS length, such as 10mm, in pixels; nothing given is no margin.
  // Each length is measured once and kept. The measure lays the whole page out, and each table
  // action reads the paper (`printable` in `sizes.js`). A length in `em` or `%` can change with the
  // window or the print, so a resize or a print drops the kept ones. A browser zoom is a resize.
  const lengths = new Map();
  const forget = () => lengths.clear();
  window.addEventListener("resize", forget);
  window.addEventListener("beforeprint", forget);
  window.addEventListener("afterprint", forget);
  function length(text) {
    if (!text) return 0;
    if (lengths.has(text)) return lengths.get(text);
    const probe = document.createElement("div");
    probe.style.cssText = `position: absolute; visibility: hidden; width: ${text}`;
    document.body.appendChild(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    lengths.set(text, px);
    return px;
  }

  // The page's rules as the print reads them: a print rule taken out of its `@media print`, a
  // screen rule left out, and a page break written as a column break. `@page` is left out, since the
  // frame is no paper.
  let rules = null;
  function printRules() {
    if (rules) return rules;
    const out = [];
    const take = (list) => {
      for (const rule of list) {
        if (rule instanceof CSSPageRule) continue;
        if (rule instanceof CSSMediaRule) {
          const media = rule.media.mediaText;
          if (/\bprint\b/.test(media)) take(rule.cssRules);
          else if (!/\bscreen\b/.test(media)) out.push(rule.cssText);
          continue;
        }
        out.push(rule.cssText);
      }
    };
    for (const sheet of document.styleSheets) take(sheet.cssRules);
    rules = out.join("\n").replace(/(break-(?:before|after)):\s*page/g, "$1: column");
    return rules;
  }

  // Lays the document out on its paper in the frame, as the print does.
  function lay() {
    timer = 0;
    // The layout's time grows faster than the document. Past this size it would hold the page up
    // for a second or more after each pause, so the bar counts no pages there.
    if (ks.root.getElementsByTagName("*").length > PAGES_MOST_ELEMENTS) {
      laid = null;
      copied = "";
      ks.status.update();
      return;
    }
    const started = performance.now();
    if (!frame) {
      frame = ks.el("iframe", "page-measure");
      frame.setAttribute("sandbox", "allow-same-origin");
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      document.body.appendChild(frame);
      const d = frame.contentDocument;
      d.open();
      d.write(`<!doctype html><html><head><style>${printRules()}</style></head>` +
        '<body><div class="pages"><main class="doc"></main></div></body></html>');
      d.close();
      inner = d.querySelector(".doc");
    }
    const p = paper();
    const html = ks.root.innerHTML;
    const d = frame.contentDocument;
    // A caret that only moved changes nothing the print shows.
    if (laid && html === copied && p.name === laid.name && p.width === laid.width &&
      p.height === laid.height && d.body.className === document.body.className) return;
    frame.style.width = `${p.width}px`;
    frame.style.height = `${p.height}px`;
    d.body.className = document.body.className;
    d.querySelector(".pages").style.cssText = `width: ${p.width}px; height: ${p.height}px; ` +
      `columns: ${p.width}px; column-gap: 0; column-fill: auto;`;
    inner.innerHTML = html;
    copied = html;
    // An image takes its height before it loads, as it has in the document.
    const shown = ks.root.querySelectorAll("img");
    inner.querySelectorAll("img").forEach((img, k) => {
      const from = shown[k];
      if (from && from.naturalWidth) {
        img.width = from.naturalWidth;
        img.height = from.naturalHeight;
      }
    });
    repeatHeads();
    laid = p;
    cost = performance.now() - started;
    ks.status.update();
  }

  // A print repeats a table's heading row at the top of each page the table goes on to, and a
  // column of the frame does not. So the heading gives way to as much room above the table, which
  // each column the table goes on to repeats (`box-decoration-break: clone`). Every height is read
  // before any is set, so the frame is laid out once more, not once per table.
  function repeatHeads() {
    const tables = Array.from(inner.querySelectorAll(".table")).map((wrap) => {
      const head = wrap.querySelector(":scope > table > thead");
      const zoom = parseFloat(getComputedStyle(wrap).zoom) || 1;
      return [wrap, head, head ? head.getBoundingClientRect().height / zoom : 0];
    });
    for (const [wrap, head, height] of tables) {
      if (!head) continue;
      head.style.display = "none";
      wrap.style.paddingTop = `${height}px`;
      wrap.style.boxDecorationBreak = "clone";
    }
  }

  // Lays the document out again once the person pauses. A document that takes long to lay out
  // waits longer, so typing in it stays quick.
  function later() {
    clearTimeout(timer);
    timer = setTimeout(lay, Math.max(400, cost * 4));
  }
  ks.rendered.push(later);
  // The width and one line per cell change the print too, as they change the page.
  new MutationObserver(later).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", later);

  // The page a block starts on, or with `row` the page a row of its table starts on:
  // { page, pages, paper }, or null before the first layout. A block the print leaves out takes
  // the page of the block before it.
  function at(block, row) {
    if (!laid || !inner) return null;
    const index = Array.prototype.indexOf.call(ks.root.children, block);
    let el = inner.children[index];
    if (el && row >= 0 && el.classList.contains("table")) {
      const tr = el.querySelector("tbody") && el.querySelector("tbody").rows[row];
      if (tr && tr.getClientRects().length > 0) el = tr;
    }
    while (el && el.getClientRects().length === 0) el = el.previousElementSibling;
    const width = laid.width;
    const d = frame.contentDocument;
    const left = d.querySelector(".pages").getBoundingClientRect().left;
    const page = el ? Math.floor((el.getClientRects()[0].left - left + 1) / width) + 1 : 1;
    const pages = Math.max(1, Math.round(d.scrollingElement.scrollWidth / width));
    return { page: Math.min(page, pages), pages, paper: laid.name };
  }

  ks.pages = { at, paper };
}
