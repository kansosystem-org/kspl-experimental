// ==========================================
// kspage's JS side — splitting into pages and printing, and presenting slides one at a time (the
// same `app` as [`api.js`](api.js)). **Both cut one continuous document into fixed frames and show
// them; the cutting is a view, and the document does not change.**
// ==========================================
function kspageApiShow(ks) {
  const { w, outText, scratch, nums, draw, paintCrop, paintChrome, paperOf, regionAt } = ks;
  Object.assign(ks.api, {
    // Draws page `i` onto `target`'s canvas at 1:1 (a document that is not split is one sheet).
    // **The margins apply here** (the layout knows none); printing uses one canvas per page.
    paintPage(target, i) {
      this.paintPages((at) => (at === i ? target : null), i, i + 1);
    },
    // Caution: **The page printing uses is this, not `paper()`**: a document with no paper set
    // borrows one in `paintPages`, so `paper()` reads 0 and the browser picks its own page for
    // `@page`. **Decide whether to borrow only here** (`paper.js`'s `@page` uses it too).
    printPaper() {
      const was = paperOf();
      if (was.width > 0 && was.height > 0) {
        return was;
      }
      w.kspage_web_default_paper(scratch);
      const [width, height, left, top, right, bottom] = nums(6);
      return { width, height, left, top, right, bottom, band: 0, reading: was.reading };
    },
    // Draws every page; `make(i)` returns page `i`'s canvas (null draws nothing).
    // Caution: **Lay out once and ask the page count once** (not in the `for` condition), and
    // **remove the viewer's overrides while printing**, restoring them at the end (otherwise the
    // print differs per viewer).
    paintPages(make, from = 0, upto = -1) {
      // **Whole, not per field** (a field added later would leak onto the paper).
      const over = this.over();
      const overOn = over.reading > 0 || over.size > 0;
      if (overOn) {
        w.kspage_web_set_over(0, 0);
      }
      // Caution: **Split into pages even with no page set** (unsplit, the browser breaks one long
      // canvas mid-line), **borrowing the margins with the size** (a margin of 0 leaves the bands
      // nowhere to go); a document with paper set borrows nothing.
      const was = paperOf();
      const bare = was.width <= 0 || was.height <= 0;
      if (bare) {
        // Caution: **Do not write the numbers here** (`a4_portrait` in `../../model/paper.kspls`
        // holds them; `printPaper` decides what to borrow).
        const use = this.printPaper();
        w.kspage_web_set_paper(use.width, use.height, use.left, use.top, use.right, use.bottom,
          was.reading);
      }
      // **A page is light**: laid out under a dark theme, text would come out pale on white paper.
      // The viewer's setting is reset before layout and restored afterwards.
      w.kspage_web_set_dark_ground(0);
      const count = w.kspage_web_layout(ks.width);
      const total = w.kspage_web_paper_count();
      const last = upto < 0 ? total : Math.min(upto, total);
      for (let i = from; i < last; i += 1) {
        const target = make(i);
        if (target !== null && target !== undefined) {
          this.paintSheet(target, i, count, total);
        }
      }
      // Caution: **Restore both the borrowed page and the overrides and lay out again**, or the
      // screen stays split into pages at the document's width (the settings silently vanish).
      if (bare) {
        w.kspage_web_set_paper(was.width, was.height, was.left, was.top, was.right, was.bottom,
          was.reading);
      }
      if (overOn) {
        w.kspage_web_set_over(over.reading, over.size);
      }
      // **Back to the screen's background color**: `draw` reads the theme again and lays out.
      draw();
    },
    // The height of the whole laid-out document, **after layout** (0 before).
    docHeight() { return w.kspage_web_height(); },
    // Draws `tall` pixels from document height `from` onto `target`'s canvas at 1:1.
    // Caution: **Do not lay out again**: at the body's width there is one layout, so this only
    // **crops and draws**, in screen colors; the column's width and left edge come from the core.
    paintPeek(target, from, tall) {
      const count = w.kspage_web_layout(ks.width);
      const column = w.kspage_web_column(ks.width);
      const left = w.kspage_web_column_left(ks.width);
      const high = Math.max(1, Math.min(tall, Math.max(1, w.kspage_web_height() - from)));
      paintCrop(target, count, [left, Math.max(0, from), column, high],
        column, tall, window.devicePixelRatio || 1, { scale: 1, x: 0, y: 0 });
    },
    // Page `i` at 1:1, for `paintPages` only, **given the layout and page count** (else per page).
    paintSheet(target, i, count, total) {
      const p = paperOf();
      // **Ask the core for the column's width** (an expression here would drift from the layout).
      const column = w.kspage_web_column(ks.width);
      // **And for the left edge** (at the body's width the column moves inward; 0 shifts it left).
      const from = w.kspage_web_column_left(ks.width);
      const box = p.band > 0
        ? [from, i * p.band, column, p.band]
        : [from, 0, column, Math.max(w.kspage_web_height(), 1)];
      const outW = p.width > 0 ? p.width : box[2] + p.left + p.right;
      const outH = p.height > 0 ? p.height : box[3] + p.top + p.bottom;
      // **White page, black text** (in a dark screen's colors the text is invisible on paper).
      paintCrop(target, count, box, outW, outH, window.devicePixelRatio || 1,
        { scale: 1, x: p.left, y: p.top, ink: "black", paper: "white" });
      // Caution: **Draw the header and footer after cropping** (they sit in the margins, outside
      // the crop); the coordinates are already from the page's top left.
      paintChrome(target, i + 1, total);
    },
    // The number of slides (0: nothing to present). **It only reads** (as `paperCount` does).
    surfaceCount() { return w.kspage_web_surface_count(); },
    // The regions **after layout**; `kind` "flow" / "grid" / "absolute" is prose / table / slide.
    regions() {
      w.kspage_web_layout(ks.width);
      const out = [];
      for (let i = 0; i < w.kspage_web_region_count(); i++) {
        w.kspage_web_region(i, scratch);
        const [x, y, rw, rh, kind] = nums(5);
        out.push({ x, y, w: rw, h: rh, kind: regionAt(kind).key });
      }
      return out;
    },
    // The slide shown now (-1 when nothing is presented).
    showing() { return ks.showing; },
    // Shows slide `i` filling the window; **a negative value returns to editing.** Keys and clicks
    // come here to advance, so the page only shows and hides the chrome.
    present(i) {
      const n = w.kspage_web_surface_count();
      ks.showing = (i < 0 || n <= 0) ? -1 : (i < n ? i : n - 1);
      // Caution: **Clear the step filter when presenting stops**, or a stepped frame stays hidden
      // in the editor; **set it before layout** (the layout reads it).
      ks.step = 0;
      w.kspage_web_set_reveal(ks.showing < 0 ? -1 : 0);
      draw();
      return ks.showing;
    },
    // Moves slide `from` to slide `to`'s position; true if moved. **The order is only the
    // document's order** (the slide list is a layout result). One undo restores it.
    moveSurface(from, to) {
      if (from < 0 || to < 0 || from === to) return false;
      const done = w.kspage_web_move_surface(from, to) !== 0;
      if (done) draw();
      return done;
    },
    // The speaker's notes on slide `i` (**empty if none**). **It is separate from `aside`**, which
    // reads the cursor's container; while presenting, the cursor need not be in that slide.
    surfaceAside(i) {
      const len = i < 0 ? 0 : w.kspage_web_surface_aside(i);
      return outText(len);
    },
    // The step shown now (**0 when nothing is presented**).
    step() { return ks.step || 0; },
    // The largest step in the current slide (**0 with no stepped frame**).
    maxStep() {
      return ks.showing < 0 ? 0 : w.kspage_web_max_step(ks.showing);
    },
    // Advances one: a step if one is left, otherwise the next slide — the one path for keys and
    // clicks (**not two entry points**: with two, nobody can tell which to use).
    stepAhead() {
      if (ks.showing < 0) return false;
      if ((ks.step || 0) < this.maxStep()) {
        ks.step = (ks.step || 0) + 1;
        w.kspage_web_set_reveal(ks.step);
        draw();
        return true;
      }
      const was = ks.showing;
      this.present(ks.showing + 1);
      return ks.showing !== was;
    },
    // Goes back one; **the slide gone back to shows everything** (steps are not replayed).
    stepBack() {
      if (ks.showing < 0) return false;
      if ((ks.step || 0) > 0) {
        ks.step = (ks.step || 0) - 1;
        w.kspage_web_set_reveal(ks.step);
        draw();
        return true;
      }
      if (ks.showing <= 0) return false;
      this.present(ks.showing - 1);
      ks.step = this.maxStep();
      w.kspage_web_set_reveal(ks.step);
      draw();
      return true;
    },
  });
}
