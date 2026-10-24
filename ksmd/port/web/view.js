// ksmd page: how blocks are shown, and how a place on the page maps to a spot in the model.
// Blocks arrive as JSON; `ksmd/port/web/view.kspl` names the shapes. A spot is
// [place, block, item, offset]: place 0 is text, 1 the gap before a block, 2 the gap before a list
// item. An offset counts UTF-8 bytes of a unit's visible text, where a hard break counts one byte.
// Caution: **Never keep a page place across an action.** Every action renders the blocks it
// changed again, and the selection comes back as model spots.
"use strict";

function ksmdView(ks) {
  const enc = new TextEncoder();
  const u8len = (s) => enc.encode(s).length;

  // The UTF-16 index at which the first `bytes` UTF-8 bytes of `s` end.
  function u16At(s, bytes) {
    let b = 0;
    let i = 0;
    while (i < s.length && b < bytes) {
      const cp = s.codePointAt(i);
      b += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      i += cp > 0xffff ? 2 : 1;
    }
    return i;
  }

  // A line that is empty, or ends in a hard break, gets a placeholder so the caret has a line.
  // **The placeholder is not text**: offsets and `unitText` skip it.
  function placeholder(el) {
    const br = document.createElement("br");
    br.dataset.ph = "1";
    el.appendChild(br);
  }

  function segsInto(el, segs) {
    for (const s of segs) {
      if (s.br) {
        el.appendChild(document.createElement("br"));
        continue;
      }
      let node = document.createTextNode(s.t);
      for (const [bit, tag] of [[4, "code"], [1, "em"], [2, "strong"]]) {
        if (s.m & bit) {
          const wrap = document.createElement(tag);
          wrap.appendChild(node);
          node = wrap;
        }
      }
      if (s.co) {
        const span = document.createElement("span");
        span.className = "coloured";
        span.style.color = s.co;
        span.appendChild(node);
        node = span;
      }
      if (s.l) {
        const a = document.createElement("a");
        a.href = s.l;
        a.appendChild(node);
        node = a;
      }
      el.appendChild(node);
    }
    if (segs.length === 0 || segs[segs.length - 1].br) placeholder(el);
  }

  function unit(tag, cls) {
    const el = document.createElement(tag);
    el.className = cls;
    return el;
  }

  // The marker each item shows: a bullet, or its number among the items of its level.
  function markers(items) {
    const counts = [];
    return items.map((it, k) => {
      if (k === 0 || it.d > items[k - 1].d) counts[it.d] = 0;
      counts.length = it.d + 1;
      counts[it.d] += 1;
      if (it.x) return it.x === 2 ? "\u2611" : "\u2610";
      return it.o ? `${counts[it.d]}.` : "•";
    });
  }

  function itemEl(depth, ordered, mark) {
    const el = unit("div", "u li");
    el.setAttribute("role", "listitem");
    el.setAttribute("aria-level", String(depth + 1));
    el.dataset.depth = String(depth);
    el.dataset.mark = mark;
    if (ordered) el.dataset.ordered = "1";
    return el;
  }

  // A block left out of print and PDF is marked; a chart, an image or an include has its toggle
  // beside its Remove button, and a table has it in its right-click menu.
  function render(b) {
    const el = shape(b);
    el.classList.toggle("print-hidden", !!b.iv);
    const remove = ["g", "i", "n"].includes(b.k) && el.querySelector(".block-remove");
    if (remove) remove.before(printButton(!!b.iv));
    return el;
  }

  function printButton(left) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "block-print";
    b.textContent = left ? "Put back in print" : "Leave out of print";
    b.title = left ? "Show this block in print and PDF again" :
      "Keep this block while editing, and leave it out of print and PDF";
    return b;
  }

  function shape(b) {
    switch (b.k) {
      case "p": {
        const el = unit("p", "b u");
        if (b.a) el.style.textAlign = b.a;
        ks.notes.markBlock(el, b.no);
        segsInto(el, b.s);
        return el;
      }
      case "h": {
        const el = unit(`h${b.n}`, "b u");
        if (b.a) el.style.textAlign = b.a;
        ks.notes.markBlock(el, b.no);
        segsInto(el, b.s);
        return el;
      }
      case "c": {
        const el = unit("pre", "b u code");
        if (b.label) el.dataset.label = b.label;
        el.appendChild(document.createTextNode(b.t));
        if (b.t === "" || b.t.endsWith("\n")) placeholder(el);
        return el;
      }
      case "l": {
        const el = unit("div", "b list");
        el.setAttribute("role", "list");
        const marks = markers(b.items);
        b.items.forEach((it, k) => {
          const li = itemEl(it.d, it.o === 1, marks[k]);
          if (it.x) li.dataset.check = String(it.x);
          segsInto(li, it.s);
          el.appendChild(li);
        });
        return el;
      }
      case "q": {
        const el = unit("blockquote", "b u");
        segsInto(el, b.s);
        return el;
      }
      case "d": {
        const el = unit("div", "b divider");
        el.contentEditable = "false";
        el.appendChild(document.createElement("hr"));
        el.appendChild(removeButton("Remove this divider"));
        return el;
      }
      case "t":
        return ks.table.render(b);
      case "g":
        return ks.chart.render(b);
      case "i": {
        const el = unit("figure", "b figure");
        el.contentEditable = "false";
        el.appendChild(removeButton("Remove this image from the document; the image file stays"));
        const place = unit("div", "image");
        place.setAttribute("role", "img");
        place.setAttribute("aria-label", b.alt || b.src);
        place.textContent = `Image: ${b.src}`;
        el.appendChild(place);
        // Where files are fetched, `file.js` shows the pixels in place of the path.
        if (b.to !== undefined && !b.wait) {
          el.dataset.to = b.to;
          if (b.why !== undefined) {
            el.dataset.why = "1";
            place.textContent = `This image cannot be shown: ${problem(b)}`;
            place.classList.add("problem");
          }
        }
        if (b.cap) {
          const cap = document.createElement("figcaption");
          cap.textContent = b.cap;
          el.appendChild(cap);
        }
        return el;
      }
      default:
        return include(b);
    }
  }

  // A refusal at a clause, and where it stands when that is inside another file.
  const problem = (b) => (b.in === undefined ? `${b.why}.` :
    `${b.why} (${b.in}, line ${b.line}, column ${b.column}).`);

  // An include: its path, and where files are fetched its file's blocks in place, which edit only
  // in a tab of their own. **They are not the document's blocks**: `closest` stops at the box.
  function include(b) {
    const el = unit("div", "b include");
    el.contentEditable = "false";
    el.dataset.path = b.path;
    el.setAttribute("role", "note");
    const head = unit("div", "include-head");
    head.textContent = `Included from ${b.path}.` +
      (b.to === undefined ? " The included file is edited on its own." : "");
    head.appendChild(removeButton("Remove this include from the document; the included file stays"));
    el.appendChild(head);
    // Opened from a file, the page shows the include's path alone (`b.to` is undefined).
    if (b.to !== undefined && b.why !== undefined) {
      const why = unit("p", "problem");
      why.textContent = `This include cannot be shown: ${problem(b)}`;
      el.appendChild(why);
    } else if (b.to !== undefined && b.inside !== undefined) {
      const open = document.createElement("button");
      open.type = "button";
      open.className = "include-open";
      open.dataset.to = b.to;
      open.textContent = `Edit ${b.to}`;
      open.title = "Opens the included file in a tab of its own";
      head.appendChild(open);
      const inside = unit("div", "inside");
      for (const nb of b.inside) inside.appendChild(render(nb));
      el.appendChild(inside);
    }
    return el;
  }

  // The button that removes a whole include or image block, which no text selection reaches.
  function removeButton(title) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "block-remove";
    b.textContent = "Remove";
    b.title = title;
    return b;
  }

  // A press on a checklist item's box, left of its text, ticks it or takes the tick away.
  ks.root.addEventListener("mousedown", (e) => {
    const li = e.target.closest && e.target.closest(".li[data-check]");
    if (!li || li.closest(".include .inside")) return;
    const text = parseFloat(getComputedStyle(li).paddingLeft);
    if (e.clientX - li.getBoundingClientRect().left > text) return;
    e.preventDefault();
    const list = li.parentElement;
    ks.act("ksmd_web_check", blocks().indexOf(list), Array.from(list.children).indexOf(li));
  });

  // Leave out of print acts on the press, as a chart's Edit does: an open cell closes on the
  // press, which draws the chart again, so a click would be lost. Enter and Space still click it.
  function printToggle(e) {
    const b = e.target.closest && e.target.closest(".block-print");
    if (!b || b.closest(".include .inside")) return;
    e.preventDefault();
    const el = b.closest(".b");
    const block = blocks().indexOf(el);
    const on = el.classList.contains("print-hidden") ? 0 : 1;
    ks.table.take();
    if (block >= 0) ks.act("ksmd_web_invisible", block, on);
  }
  ks.root.addEventListener("mousedown", printToggle, true);
  ks.root.addEventListener("click", (e) => {
    if (e.detail === 0) printToggle(e);
  });

  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".block-remove");
    if (!b || b.closest(".include .inside")) return;
    const block = blocks().indexOf(b.closest(".b"));
    if (block >= 0) ks.act("ksmd_web_remove_block", block);
  });

  // The page's block elements, in the model's order; the gap element is not a block.
  const blocks = () => Array.from(ks.root.children).filter((e) => !e.classList.contains("gap"));
  const items = (list) => Array.from(list.children).filter((e) => !e.classList.contains("gap"));

  // The text of a unit as the model counts it: a hard break is "\n", a placeholder nothing.
  function unitText(el) {
    let text = "";
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) text += n.data;
      else if (n.nodeName === "BR" && !n.dataset.ph) text += "\n";
    }
    return text;
  }

  // The element around a node that matches `selector`, inside the document. Anything shown from an
  // included file answers as the include's own block.
  function closest(node, selector) {
    let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const box = el ? el.closest(".include") : null;
    if (box && ks.root.contains(box)) {
      el = box;
      while (el.parentElement && el.parentElement !== ks.root) el = el.parentElement;
      return el.matches(selector) ? el : null;
    }
    const found = el ? el.closest(selector) : null;
    return found && ks.root.contains(found) && found !== ks.root ? found : null;
  }

  // The spot of a place on the page, or null outside the document.
  function spotAt(node, offset) {
    if (!node || !ks.root.contains(node)) return null;
    const gap = closest(node, ".gap");
    if (gap) return gap.spot.slice();
    const u = closest(node, ".u");
    if (u) {
      const li = u.classList.contains("li");
      const block = blocks().indexOf(li ? u.parentElement : u);
      const item = li ? items(u.parentElement).indexOf(u) : 0;
      const r = document.createRange();
      r.setStart(u, 0);
      r.setEnd(node, offset);
      const before = r.cloneContents();
      const breaks = before.querySelectorAll("br:not([data-ph])").length;
      return [0, block, item, u8len(before.textContent) + breaks];
    }
    const b = closest(node, ".b");
    if (b) return [1, blocks().indexOf(b), 0, 0];
    // Between blocks: `offset` counts the root's children, the gap element among them.
    const kids = Array.from(ks.root.childNodes).slice(0, offset);
    return [1, kids.filter((k) => k.nodeType === Node.ELEMENT_NODE && !k.classList.contains("gap"))
      .length, 0, 0];
  }

  // The page place of `bytes` into a unit's text.
  function pointIn(el, bytes) {
    let left = bytes;
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const len = u8len(n.data);
        if (left <= len) return { node: n, offset: u16At(n.data, left) };
        left -= len;
      } else if (n.nodeName === "BR") {
        const at = { node: n.parentNode, offset: Array.prototype.indexOf.call(n.parentNode.childNodes, n) };
        if (n.dataset.ph || left === 0) return at;
        left -= 1;
      }
    }
    return { node: el, offset: el.childNodes.length };
  }

  function removeGap() {
    for (const g of ks.root.querySelectorAll(".gap")) g.remove();
  }

  // The element that shows a gap: an empty line of the kind a block typed there takes.
  function makeGap(spot, style) {
    removeGap();
    let el;
    if (style.k === "h") el = unit(`h${style.n}`, "gap u");
    else if (style.k === "c") el = unit("pre", "gap u code");
    else if (style.k === "l") {
      el = itemEl(style.d, style.o === 1, style.o ? "#" : "•");
      el.classList.add("gap");
    } else el = unit("p", "gap u");
    placeholder(el);
    el.spot = spot.slice();
    const all = blocks();
    if (spot[0] === 2 && all[spot[1]]) {
      const list = all[spot[1]];
      list.insertBefore(el, items(list)[spot[2]] || null);
    } else {
      ks.root.insertBefore(el, all[spot[1]] || null);
    }
    return el;
  }

  function pointOf(spot) {
    const b = blocks()[spot[1]];
    if (!b) return { node: ks.root, offset: ks.root.childNodes.length };
    const u = b.classList.contains("list") ? items(b)[spot[2]] : b;
    return pointIn(u || b, spot[3]);
  }

  // Draws no caret while the person works in a table: no gap, and no selection in the text.
  function hideCaret() {
    removeGap();
    const s = window.getSelection();
    if (s.rangeCount > 0 && ks.root.contains(s.focusNode) && !closest(s.focusNode, ".table")) {
      s.removeAllRanges();
    }
  }
  ks.placeHooks.push(() => {
    if (ks.where === "cell") hideCaret();
  });

  // Shows the model's selection on the page, or no caret while the person works in a table.
  function showSelection(sel) {
    if (ks.inTable()) return hideCaret();
    removeGap();
    const s = window.getSelection();
    if (sel.f[0] !== 0) {
      const g = makeGap(sel.f, sel.g);
      s.setBaseAndExtent(g, 0, g, 0);
      return;
    }
    const a = pointOf(sel.a[0] === 0 ? sel.a : sel.f);
    const f = pointOf(sel.f);
    s.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  }

  // Puts an action's result on the page: the changed blocks and the other tables. The selection
  // follows once the page has found the chosen cell again (`ks.act`).
  function apply(r) {
    removeGap();
    const all = blocks();
    const end = all.length - r.tail;
    const next = all[end] || null;
    for (let i = r.from; i < end; i++) all[i].remove();
    for (const b of r.blocks) ks.root.insertBefore(render(b), next);
    for (const [i, b] of r.tables) {
      const old = blocks()[i];
      if (old) old.replaceWith(render(b));
    }
  }

  ks.view = { apply, showSelection, spotAt, pointIn, unitText, blocks, items, closest, u8len,
    removeGap, removeButton };
}
