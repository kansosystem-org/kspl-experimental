// ==========================================
// kspage's JS side — **drawing onto another canvas**: a printed page, a preview, a thumbnail, a
// slide presented alone. **None touches the screen's canvas**, so the screen stays as it is.
// Caution: **They must draw through the same path as [`draw.js`](draw.js)** (`paintBoxes` /
// `paintPanels` / `paintPictures`), or the print and the screen disagree; they borrow the helpers
// that file puts on `ks`.
// **A region's frame and the handles are not drawn here** (they belong to the editing screen).
// Split off for the 1000-line-per-file cap (Principle 3).
// ==========================================
function kspageDrawCrop(ks) {
  const { canvas, str, w } = ks;
  const { paintBoxes, paintPanels, paintPictures, surfaceOf, DOC_BOXES, CHROME_BOXES } = ks;

  // Crops a part of the document (`box`) onto `target`'s canvas, **clipping what is outside**
  // (otherwise the neighbours show); presenting and printing differ only in the crop and placement.
  // **`how` decides the placement and the colors**: empty means "fit and center, in the screen's
  // colors, no background"; `scale` not 0 places it at `(x, y)` at that multiple (1:1 for paper).
  // Caution: **Set black and white (`ink` / `paper`) for paper** (dark screen colors hide text).
  function paintCrop(target, count, box, outW, outH, dpr, how) {
    const [bx, by, bw, bh] = box;
    const g = target.getContext("2d");
    const scale = how.scale || 0;
    target.width = Math.ceil(outW * dpr);
    target.height = Math.ceil(outH * dpr);
    target.style.width = `${outW}px`;
    target.style.height = `${outH}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, outW, outH);
    // **Paint the background before clipping** (after, it would cover the contents).
    if (how.paper) {
      g.fillStyle = how.paper;
      g.fillRect(0, 0, outW, outH);
    }
    if (bw <= 0 || bh <= 0) return;
    const fit = scale > 0 ? scale : Math.min(outW / bw, outH / bh);
    g.save();
    // Offsets to the placement, then makes the crop's top left the origin.
    if (scale > 0) {
      g.translate(how.x || 0, how.y || 0);
    } else {
      g.translate((outW - bw * fit) / 2, (outH - bh * fit) / 2);
    }
    g.scale(fit, fit);
    g.beginPath();
    g.rect(0, 0, bw, bh);
    g.clip();
    g.translate(-bx, -by);
    paintPanels(g);
    paintPictures(g);
    g.fillStyle = how.ink || getComputedStyle(canvas).color;
    paintBoxes(count, g, DOC_BOXES, box);
    g.restore();
  }

  // Draws the page's header and footer as page `no` of `of`, **in paper colors** (black on white).
  // **A list separate from the document's boxes**, or a click mapped back would point at the band's
  // text.
  function paintChrome(target, no, of) {
    const g = target.getContext("2d");
    for (const which of [0, 1]) {
      const count = w.kspage_web_chrome(which, no, of);
      if (count <= 0) continue;
      g.save();
      g.fillStyle = "black";
      paintBoxes(count, g, CHROME_BOXES);
      g.restore();
    }
  }

  // The slide list (the thumbnails); **with no slides nothing is shown** (the space alone would
  // push the body down). **The layout's width is not changed** (a new width re-breaks the flow and
  // shifts the slides). **Each image is redrawn at every layout** (a slide changes per keystroke);
  // boxes outside the crop are skipped before `paintBoxes`, so more slides cost a keystroke
  // nothing. A click is mapped to document coordinates, as an ordinary click.
  function paintThumbs(count, dpr) {
    const strip = ks.api.slideStrip;
    if (!strip) return;
    const many = w.kspage_web_surface_count();
    // Caution: **Do not decide show / hide here** — one place does, the navigation's tabs
    // (`side.js`); with two, a tab can open an empty list (Principle 6). When empty, one line of
    // guidance is shown (an empty panel looks "broken").
    if (many <= 0) {
      if (!strip.dataset.none) {
        strip.textContent = "";
        strip.dataset.none = "1";
        const none = document.createElement("div");
        none.className = "none";
        none.textContent = "Insert a slide and they are listed here";
        strip.appendChild(none);
      }
      return;
    }
    // **Rebuild them only when the count changed** (otherwise a thumbnail vanishes mid-click),
    // **not counting the guidance line** (it would match the first slide and stay).
    if (strip.children.length !== many || strip.dataset.none) {
      delete strip.dataset.none;
      strip.textContent = "";
      for (let i = 0; i < many; i += 1) {
        // Caution: **Show the number as text** — a thumbnail alone leaves "what is this", and a
        // `title` is not seen until the pointer rests on it.
        const one = document.createElement("div");
        one.className = "slide";
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = `Slide ${i + 1}`;
        one.appendChild(tag);
        one.appendChild(document.createElement("canvas"));
        one.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          // Remembers where it was grabbed. **A click alone does not move it** (it moves only when
          // released on another image).
          ks.dragThumb = i;
          const at = surfaceOf(i);
          w.kspage_web_click(at[0] + 4, at[1] + 4, 0);
          ks.ime.focus();
          // The layout alone scrolls the window to that slide (`followCaret`), not here as well.
          ks.draw();
        });
        // Reordering, **decided where it is released** (while dragging it would move past every
        // image crossed); released where grabbed, it is a plain click.
        one.addEventListener("pointerenter", () => {
          if (ks.dragThumb === null || ks.dragThumb === undefined) return;
          one.classList.toggle("aim", ks.dragThumb !== i);
        });
        one.addEventListener("pointerleave", () => { one.classList.remove("aim"); });
        one.addEventListener("pointerup", () => {
          const from = ks.dragThumb;
          ks.dragThumb = null;
          one.classList.remove("aim");
          if (from === null || from === undefined || from === i) return;
          ks.api.moveSurface(from, i);
        });
        strip.appendChild(one);
      }
    }
    for (let i = 0; i < many; i += 1) {
      const at = surfaceOf(i);
      const wide = 120;
      const tall = at[2] > 0 ? Math.max(Math.round(wide * at[3] / at[2]), 24) : 68;
      // **Paint the page by role** (the screen's default gives black on black in a dark theme).
      paintCrop(strip.children[i].querySelector("canvas"), count, at, wide, tall, dpr,
        { paper: ks.paperInkOf() });
    }
  }

  function paintSurface(count, dpr) {
    paintCrop(canvas, count, surfaceOf(ks.showing),
      Math.max(window.innerWidth, 1), Math.max(window.innerHeight, 1), dpr, {});
  }

  ks.paintCrop = paintCrop;
  ks.paintChrome = paintChrome;
  ks.paintThumbs = paintThumbs;
  ks.paintSurface = paintSurface;
}
