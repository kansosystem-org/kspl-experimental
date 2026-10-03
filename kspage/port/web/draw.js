// ==========================================
// kspage's JS side — drawing: it only draws the laid-out boxes onto a canvas. **No layout logic is
// here** (line breaking, inheritance and cursor movement are the wasm's).
// Caution: **Take the colors by role** (`page.css`'s `:root`); a color hard-coded into the canvas
// escapes the theme. **The cursor's element is not drawn onto the canvas** (drawn, every blink
// would repaint the whole document; the thumbnails and the pages work the same way).
// Split off for the 1000-line-per-file cap (Principle 3); the shared state is
// [`kspage.js`](kspage.js)'s `ks`.
// ==========================================
function kspageDraw(ks) {
  const { w, canvas, ctx, str, outText, colorText, fontString, vmetrics, scratch, nums } = ks;
  // Reads the theme's colors from the CSS, **again on every draw** (a theme changes without the
  // page being rebuilt). With no role it is the screen's default accent (so it works with the text
  // alone embedded into a page).
  // Caution: **Do not hard-code a color into the canvas** — that one place keeps the earlier color
  // when the theme changes.
  let accent = "Highlight";
  let paperInk = "Canvas";
  let lineInk = "GrayText";
  // "Whether the background is dark", for choosing the text color.
  // Caution: **Do not read the role's text as it is** — `--paper` can be a system color name
  // (`Canvas`), which reads as no color and stays dark after a dark theme. **Read the computed
  // color** (`background`, names resolved to rgb()); **if transparent, decide by the system
  // setting**. **Not a plain average** (`dark_color` in `kspage/model/style.kspls`).
  const darkOf = (text) => {
    const rgb = /^rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?/i
      .exec(text || "");
    if (!rgb || (rgb[4] !== undefined && Number(rgb[4]) === 0)) {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return (Number(rgb[1]) * 299 + Number(rgb[2]) * 587 + Number(rgb[3]) * 114) / 1000 < 128;
  };

  const readTheme = () => {
    const look = getComputedStyle(canvas);
    const got = look.getPropertyValue("--accent").trim();
    accent = got.length > 0 ? got : "Highlight";
    const sheet = look.getPropertyValue("--paper").trim();
    paperInk = sheet.length > 0 ? sheet : "Canvas";
    const edge = look.getPropertyValue("--line").trim();
    lineInk = edge.length > 0 ? edge : "GrayText";
    // Caution: **Pass it to the core too** — the layout chooses the text color, so otherwise, under
    // a dark theme **the text alone** stays light-theme and disappears into the background.
    w.kspage_web_set_dark_ground(darkOf(look.backgroundColor) ? 1 : 0);
  };

  const surfaceOf = (i) => {
    w.kspage_web_surface(i, scratch);
    return Array.from(nums(4));
  };

  // One page's settings. **`band` is the content height** (minus the margins; it decides the page
  // interval and the break). Width 0 means "the container's width", height 0 "do not split";
  // `reading` is the width the body is not widened past (0: no limit).
  const paperOf = () => {
    w.kspage_web_paper(scratch);
    const [pw, ph, left, top, right, bottom, band, reading] =
      nums(8);
    return { width: pw, height: ph, left, top, right, bottom, band, reading };
  };

  // How the boxes are read: **the document's boxes and the page's bands are two sets** (their
  // coordinates mean different things); the drawing is shared.
  const DOC_BOXES = {
    shape: (i, at) => w.kspage_web_box(i, at),
    words: (i) => [str(w.kspage_web_box_text(i), w.kspage_web_box_text_len(i)),
      str(w.kspage_web_box_family(i), w.kspage_web_box_family_len(i))],
  };
  // A band passes the text and the font name through the one arena, separated by a tab.
  const CHROME_BOXES = {
    shape: (i, at) => w.kspage_web_chrome_box(i, at),
    words: (i) => {
      const len = w.kspage_web_chrome_text(i);
      const both = len > 0 ? outText(len) : "\t";
      const cut = both.indexOf("\t");
      return [both.slice(0, cut), both.slice(cut + 1)];
    },
  };
  // Draws the boxes in order, **in the document's own coordinates** (offset and zoom are the
  // caller's).
  // Caution: **Set the color again for every box**, or the next box takes the last one; **a box
  // with no setting takes the caller's color**, and **`plain` (the viewer's override) never reaches
  // paper or the list's images** (pages keep the document's colors). `marks` are the diagnostics',
  // colored at layout time by the background, **not by color alone** (an error wavy, the rest
  // dotted).
  function paintBoxes(count, ctx, read, crop, plain, marks) {
    const ink = ctx.fillStyle;
    const gap = ctx.letterSpacing;
    for (let i = 0; i < count; i++) {
      read.shape(i, scratch);
      const [x, y, bw, bh, sizePx, weight, italic, midComp,
        hasColor, color, hasBack, back, under, strike, spacing] = nums(15);
      // Caution: **Skip whatever is outside the crop before reading the text** — skipped after,
      // every thumbnail measures the whole document and keystrokes get slower per slide.
      if (crop && (x > crop[0] + crop[2] || x + bw < crop[0] ||
        y > crop[1] + crop[3] || y + bh < crop[1])) continue;
      const [text, family] = read.words(i);
      ctx.font = fontString(family, sizePx, weight, italic !== 0);
      // The justification's letter spacing, which the canvas adds after each character.
      // Caution: **Pass the core's value as it is** (recomputed here, it would drift from where
      // clicks land).
      ctx.letterSpacing = `${spacing}px`;
      // **Paint the background before the text** (after, it covers it) — only the box's part; a
      // whole paragraph or cell is the style's band.
      if (hasBack !== 0 && !plain) {
        ctx.fillStyle = colorText(back);
        ctx.fillRect(x, y, bw, bh);
      }
      ctx.fillStyle = hasColor !== 0 && !plain ? colorText(color) : ink;
      // A box's y is its top edge and fillText's y is the baseline, so it moves down by the ascent.
      const asc = vmetrics(family, sizePx, weight, italic !== 0).ascent;
      ctx.fillText(text, x, y + asc);
      // The underline and the strikethrough, **in the text color, after the text** (before, the
      // text covers them). **The thickness follows the font size.**
      const pen = Math.max(1, Math.round(sizePx / 14));
      if (under !== 0) ctx.fillRect(x, y + asc + pen, bw, pen);
      if (strike !== 0) ctx.fillRect(x, y + asc - sizePx * 0.28, bw, pen);
      // Composition shows as an underline (otherwise it looks committed), at the box's bottom edge,
      // separate from the style's underline below the baseline.
      if (midComp !== 0) ctx.fillRect(x, y + bh - 2, bw, 1);
    }
    ctx.fillStyle = ink;
    // Caution: **Reset the letter spacing too** — measureText includes it, so the next
    // `kspage_js_measure` would give the core a wider width and line breaking would shift after the
    // draw.
    ctx.letterSpacing = gap;
  }

  // The shapes a band is drawn as. **A list of numbers, not the list offered to choose from** (that
  // is the menu's: `ribbon.js`'s `SHAPES`). **The list is the wasm's exactly**
  // (`port/web/state.kspls`'s `shape_order`, separate from the enum's order in the source).
  // **Do not move an existing entry** — a saved document is read by name, but this bridge passes by
  // number (`make test-conventions` checks that both sides match).
  const SHAPES = ["box", "ellipse", "fall_line", "rise_line", "fall_arrow", "rise_arrow",
    "fall_arrow_back", "rise_arrow_back", "round_box", "triangle", "diamond"];
  // How a filter matches a cell (`keep_order` in `state.kspls`, `Keep` in `model/filter.kspls`).
  // The same rule as the shapes: **do not move an existing entry.**
  const KEEPS = ["is", "is_not", "holds", "above", "below", "blank", "filled"];
  // The closed shapes (the inside is painted). **The rest are lines along the band's diagonal.**
  const CLOSED = ["box", "round_box", "ellipse", "triangle", "diamond"];
  // Whether it is a shape drawn along the band's diagonal.
  const diagonal = (kind) => CLOSED.indexOf(kind) < 0;
  // Draws one closed shape's path. **The fill and the line share it** (separate, a thick line would
  // shift off the fill's edge); `inset` moves it in for a line centered on the path.
  const closedPath = (g, kind, x, y, pw, ph, inset) => {
    const l = x + inset, t = y + inset;
    const r = x + pw - inset, b = y + ph - inset;
    const mx = (l + r) / 2, my = (t + b) / 2;
    g.beginPath();
    if (kind === "ellipse") {
      g.ellipse(mx, my, Math.max(r - l, 0) / 2, Math.max(b - t, 0) / 2, 0, 0, Math.PI * 2);
      return;
    }
    if (kind === "triangle") {
      g.moveTo(mx, t);
      g.lineTo(r, b);
      g.lineTo(l, b);
      g.closePath();
      return;
    }
    if (kind === "diamond") {
      g.moveTo(mx, t);
      g.lineTo(r, my);
      g.lineTo(mx, b);
      g.lineTo(l, my);
      g.closePath();
      return;
    }
    if (kind === "round_box") {
      // **The rounding goes up to half the band** (past half, the path crosses itself).
      const round = Math.min(8, Math.max(r - l, 0) / 2, Math.max(b - t, 0) / 2);
      g.roundRect(l, t, Math.max(r - l, 0), Math.max(b - t, 0), round);
      return;
    }
    g.rect(l, t, Math.max(r - l, 0), Math.max(b - t, 0));
  };
  // Whether the arrowhead is at the start — **the band alone does not give the direction.**
  const backwards = (kind) => kind.endsWith("_back");
  // A line's and an arrow's two ends: **`rise` is bottom left to top right** (`fall` top left to
  // bottom right).
  const endsOf = (kind, x, y, pw, ph) => kind.startsWith("rise")
    ? [x, y + ph, x + pw, y] : [x, y, x + pw, y + ph];

  // Draws the arrowhead at the end, along the direction.
  // Caution: **Size it from the thickness.** A fixed size gives a thick line a thin head.
  function paintHead(g, x1, y1, x2, y2, edge) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= 0) return;
    const size = Math.max(edge * 4, 8);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // The direction's perpendicular.
    // Caution: **Spread it equally left and right** (one side alone bends the head).
    const px = -uy;
    const py = ux;
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - ux * size + px * size / 2, y2 - uy * size + py * size / 2);
    g.lineTo(x2 - ux * size - px * size / 2, y2 - uy * size - py * size / 2);
    g.closePath();
    g.fill();
  }

  // A paragraph's or a cell's fill and border — the document's content, so also in printing and
  // presenting (unlike a region's frame).
  // Caution: **Paint all the fills first, then all the lines** — one at a time, a neighbour's fill
  // covers the nearer cell's line and the grid has gaps. **Draw them before the text.**
  // **With `plain`, no fill is painted** (the viewer declines the document's colors), but the line
  // is drawn in the screen's border role, or the cells' boundaries would vanish.
  function paintPanels(g, plain, crop) {
    const count = w.kspage_web_panel_count();
    // Caution: Copy them all out first — there is one arena, so asking while drawing deletes the
    // earlier values. **What is outside the crop is dropped here** (the kept heading paints one
    // row; every panel on every scroll would cost the whole document).
    const seen = [];
    for (let i = 0; i < count; i++) {
      w.kspage_web_panel(i, scratch);
      const one = Array.from(nums(9));
      if (crop && (one[0] > crop[0] + crop[2] || one[0] + one[2] < crop[0] ||
        one[1] > crop[1] + crop[3] || one[1] + one[3] < crop[1])) continue;
      seen.push(one);
    }
    g.save();
    for (const one of seen) {
      const [x, y, pw, ph, , , hasFill, fill, shape] = one;
      const kind = SHAPES[shape] || SHAPES[0];
      // **A line and an arrow are not filled** (no enclosed inside).
      if (hasFill === 0 || plain || pw <= 0 || ph <= 0 || diagonal(kind)) continue;
      g.fillStyle = colorText(fill);
      if (kind === "box") {
        g.fillRect(x, y, pw, ph);
        continue;
      }
      closedPath(g, kind, x, y, pw, ph, 0);
      g.fill();
    }
    for (const one of seen) {
      const [x, y, pw, ph, edge, color, , , shape] = one;
      const kind = SHAPES[shape] || SHAPES[0];
      // Caution: **Draw a line and an arrow even where one side is 0** — a horizontal line is a
      // band of height 0 (with both 0, there is nothing to draw).
      const flat = diagonal(kind);
      if (edge <= 0) continue;
      if (flat ? (pw <= 0 && ph <= 0) : (pw <= 0 || ph <= 0)) continue;
      g.strokeStyle = plain ? lineInk : colorText(color);
      g.fillStyle = plain ? lineInk : colorText(color);
      g.lineWidth = edge;
      if (!flat && kind !== "box") {
        // A line is centered on the path; not moved in, it spills into the next frame.
        closedPath(g, kind, x, y, pw, ph, edge / 2);
        g.stroke();
        continue;
      }
      if (kind !== "box") {
        const [x1, y1, x2, y2] = endsOf(kind, x, y, pw, ph);
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.stroke();
        // **The shape says which end the head is at**: `_back` is the start.
        if (kind.indexOf("arrow") >= 0) {
          if (backwards(kind)) paintHead(g, x2, y2, x1, y1, edge);
          else paintHead(g, x1, y1, x2, y2, edge);
        }
        continue;
      }
      g.strokeRect(x + edge / 2, y + edge / 2, pw - edge, ph - edge);
    }
    g.restore();
  }

  // The loaded images, redrawn once loaded (until then only the frame).
  // Caution: **Keep one per source** (otherwise it is fetched on every redraw).
  const pictures = new Map();
  // Whether that source is an external server: **anything but an embedded image (`data:`) or one
  // beside the document (a relative path with no scheme)**, the latter fetched from this page's
  // server.
  const outside = (src) => {
    const cut = src.indexOf(":");
    if (cut < 0) return false;
    const said = src.slice(0, cut).toLowerCase();
    // **Where `/` `?` `#` come first it is no scheme** (`a/b:c` is a path).
    for (const c of ["/", "?", "#"]) {
      if (src.indexOf(c) >= 0 && src.indexOf(c) < cut) return false;
    }
    return said !== "data";
  };
  // The number of external images blocked.
  // Caution: **Count them again on every draw** (switching the document changes it).
  let held = 0;
  function pictureOf(src) {
    let got = pictures.get(src);
    if (got) return got;
    got = new Image();
    got.addEventListener("load", () => draw());
    // Caution: **Store it before starting the load** — setting `src` starts loading, so the
    // "loaded" event could come with no image stored to draw.
    pictures.set(src, got);
    got.src = src;
    return got;
  }

  // Draws the laid-out images. **The image is not in the core** (only the source and size). **Draw
  // the frame alone before it loads** (nothing drawn would look as if it were gone).
  function paintPictures(g) {
    held = 0;
    const count = w.kspage_web_picture_count();
    for (let i = 0; i < count; i++) {
      w.kspage_web_picture(i, scratch);
      const [x, y, pw, ph] = nums(4);
      const len = w.kspage_web_picture_src(i);
      if (len <= 0 || pw <= 0 || ph <= 0) continue;
      const src = outText(len);
      // Caution: **Do not fetch from an external server when the document opens** — that tells the
      // server the document was opened, and where (a tracking pixel). An external image shows only
      // the frame until allowed for this document; **the document does not change** (the source
      // stays).
      const shut = outside(src) && !ks.outsidePics;
      const img = shut ? null : pictureOf(src);
      if (shut) {
        held += 1;
      }
      if (img !== null && img.complete && img.naturalWidth > 0) {
        g.drawImage(img, x, y, pw, ph);
        continue;
      }
      g.save();
      g.strokeStyle = "gray";
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);
      g.restore();
    }
  }


  // **The list is exactly the numbers the core returns** (`Arrange`'s order). **This is the only
  // list** (with name and text kept separately, one alone would grow when a kind is added).
  const REGIONS = [
    { key: "flow", label: "Prose" },
    { key: "grid", label: "Table" },
    { key: "absolute", label: "Slide" },
  ];
  const regionAt = (kind) => REGIONS[kind] || { key: "", label: "" };
  // A paragraph's alignment. **The list is exactly the numbers the core returns** (`Align`'s
  // order); the justification's spacing is the core's per box.
  const ALIGNS = ["left", "center", "right", "justify"];
  // The comparison of a value, **in the core's numbers too** (`Compare`'s order); reading and
  // writing share it (`indexOf` gives the number).
  const COMPARES = ["none", "above", "below", "equal"];
  // The marker, **in the core's numbers too** (`Marker`'s order). **Drop one and that marker reads
  // as "no marker"**, vanishing when the style field opens.
  const MARKS = ["none", "bullet", "number", "serial", "outline"];
  // The markers that pass two texts, **separated by a tab in the one arena** (a running number
  // `before\tafter`, a chapter number `separator\tafter`); one list, so reading and writing agree.
  const PAIRED_MARKS = ["serial", "outline"];
  // The date format, **in the core's numbers too** (`Dating`'s order). A date is days since
  // 1970-01-01.
  const DATINGS = ["none", "plain", "long"];
  // What is built at layout time, **in the core's numbers too** (`Collect`'s order); bars and lines
  // come from the range's values, not the document.
  const COLLECTS = ["none", "contents", "notes", "bars", "lines", "source", "imports"];
  // A slide's layout sketch, **in the numbers the core reads** (`Sketch`'s order); it acts once at
  // insertion.
  const SKETCHES = ["whole", "titled", "halved"];
  // A region's frame, outlining in pale gray the band that is prose, a table or a slide, with a
  // label (the frame alone does not say which tool applies there).
  // Caution: **Draw it only on the editing screen** — printing, presenting and the HTML all go
  // through `paintBoxes`, so there it would reach the page. **Draw it before the text.**
  function paintRegions(g) {
    const count = w.kspage_web_region_count();
    if (count <= 0) return;
    g.save();
    g.globalAlpha = 0.55;
    g.strokeStyle = "gray";
    g.fillStyle = "gray";
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.font = "10px sans-serif";
    g.textBaseline = "top";
    for (let i = 0; i < count; i++) {
      w.kspage_web_region(i, scratch);
      const [x, y, rw, rh, kind] = nums(5);
      if (rw <= 0 || rh <= 0) continue;
      // A line is centered on the path; not offset by half a pixel, a 1px line blurs to 2px.
      g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5,
        Math.round(rw) - 1, Math.round(rh) - 1);
      // The label. **Cover the spot with the background before writing** — the frame shares its
      // place with the body's text.
      const label = regionAt(kind).label;
      const lw = g.measureText(label).width;
      if (label.length <= 0 || rw < lw + 12 || rh < 18) continue;
      const lx = x + rw - lw - 5;
      g.save();
      g.globalAlpha = 1;
      g.fillStyle = "Canvas";
      g.fillRect(lx - 3, y + 1, lw + 6, 13);
      g.globalAlpha = 0.7;
      g.fillStyle = "gray";
      g.fillText(label, lx, y + 2);
      g.restore();
    }
    g.restore();
  }

  // The selected frame's handles: the four corners (both dimensions), the four edge middles (one)
  // and the inside (move).
  // Caution: **Draw them in a visible shape** — unseen, nobody learns that it can be moved at all.
  // **A handle that does nothing is not drawn.**
  function paintGrips(g) {
    w.kspage_web_frame_rect(scratch);
    const seen = nums(9);
    const sx = seen[4], sy = seen[5], sw = seen[6], sh = seen[7];
    if (seen[8] === 0 || sw <= 0 || sh <= 0) return;
    g.save();
    g.strokeStyle = accent;
    g.fillStyle = accent;
    g.lineWidth = 1;
    // A line is centered on the path; not offset by half a pixel, a 1px line blurs to 2px.
    g.setLineDash([4, 3]);
    g.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5,
      Math.round(sw) - 1, Math.round(sh) - 1);
    g.setLineDash([]);
    const half = 3;
    const midX = sx + sw / 2;
    const midY = sy + sh / 2;
    // **Corners and edges have different shapes** (otherwise the one-dimension handle cannot be
    // seen; other products do the same).
    for (const at of [[sx, sy], [sx + sw, sy], [sx, sy + sh], [sx + sw, sy + sh]]) {
      g.fillRect(Math.round(at[0]) - half, Math.round(at[1]) - half, half * 2, half * 2);
    }
    for (const at of [[midX, sy], [midX, sy + sh]]) {
      g.fillRect(Math.round(at[0]) - half * 2, Math.round(at[1]) - 2, half * 4, 4);
    }
    for (const at of [[sx, midY], [sx + sw, midY]]) {
      g.fillRect(Math.round(at[0]) - 2, Math.round(at[1]) - half * 2, 4, half * 4);
    }
    g.restore();
  }

  // The rectangle of the band being dragged.
  // Caution: **Keep the geometry in one place** — where the shown band and the placed shape differ,
  // the shape jumps on release. Shift makes it 1:1 (the key that keeps the ratio when resizing; an
  // undrawn shape has none).
  function bandRect() {
    const band = ks.drawn;
    if (!band) return null;
    let wide = Math.abs(band.x1 - band.x0);
    let tall = Math.abs(band.y1 - band.y0);
    if (band.square) {
      const side = Math.min(wide, tall);
      wide = side;
      tall = side;
    }
    return {
      x: band.x1 < band.x0 ? band.x0 - wide : band.x0,
      y: band.y1 < band.y0 ? band.y0 - tall : band.y0,
      w: wide,
      h: tall,
    };
  }

  // Shows the band being dragged **in the chosen tool's shape** (a bare rectangle would hide that
  // an ellipse was chosen), dashed to set it apart from placed shapes.
  function paintDrawn(g) {
    if (!ks.drawn || !ks.api.armed) return;
    const spot = bandRect();
    const x = spot.x;
    const y = spot.y;
    const wide = spot.w;
    const tall = spot.h;
    if (wide <= 0 && tall <= 0) return;
    g.save();
    g.strokeStyle = accent;
    g.lineWidth = 1;
    g.setLineDash([4, 3]);
    const kind = ks.api.armed.shape;
    if (diagonal(kind)) {
      const [x1, y1, x2, y2] = endsOf(kind, x, y, wide, tall);
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
    } else {
      closedPath(g, kind, x, y, wide, tall, 0.5);
    }
    g.stroke();
    g.restore();
  }

  // Moves the selected frame (with `size`, resizes it); true if it moved. **With none selected it
  // does nothing.** Fine adjustment shares the number fields' entry point
  // (`kspage_web_place_frame`).
  function nudgeFrame(dx, dy, size) {
    w.kspage_web_frame_rect(scratch);
    const at = nums(9);
    if (at[8] === 0) return false;
    // **Everything selected moves** (as with a drag); resizing is only the selected frame, by
    // number.
    const done = size
      ? w.kspage_web_place_frame(at[0], at[1], at[2] + dx, at[3] + dy)
      : w.kspage_web_move_frames(dx, dy);
    if (done !== 0) draw();
    return done !== 0;
  }

  function draw() {
    // Caution: **Read the theme before drawing** (the selection and the handles take their color
    // from it).
    readTheme();
    const dpr = window.devicePixelRatio || 1;
    const count = w.kspage_web_layout(ks.width);
    boxCount = count;
    if (ks.showing >= 0) {
      // While presenting, the cursor is hidden (nothing can be typed).
      hideCaret();
      if (ks.hidePinned) ks.hidePinned();
      ks.paintSurface(count, dpr);
      if (ks.api.onRedraw) ks.api.onRedraw();
      return;
    }
    const height = Math.max(w.kspage_web_height(), 24);

    // **One document unit is one CSS pixel**; another scale would need the click-mapping division
    // in four more places (`kspage/docs/DESIGN.md`'s "Whether the browser or the page holds the
    // zoom"). Only the pixel density is multiplied.
    canvas.width = Math.ceil(ks.width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.style.width = `${ks.width}px`;
    canvas.style.height = `${height}px`;
    // Resizing resets the 2D state, so the density is multiplied after it.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ks.width, height);
    const ink = getComputedStyle(canvas).color;
    ctx.fillStyle = ink;

    // **A style's fill comes before the selection** (after, the selection is invisible). **The
    // override is only the screen's** (paper and the list's images keep the document's colors).
    paintPanels(ctx, ks.plain);
    paintPictures(ctx);
    paintRegions(ctx);

    // Caution: **Paint the selection before the text** (after, it covers it). The wasm cuts the
    // rectangles; the whole box would paint the entire inline for a few characters.
    ctx.fillStyle = accent;
    for (let i = 0; i < w.kspage_web_selection_count(); i++) {
      w.kspage_web_selection_rect(i, scratch);
      const [sx, sy, sw, sh] = nums(4);
      ctx.fillRect(sx, sy, sw, sh);
    }
    ctx.fillStyle = ink;

    // **The cell frame goes after the fill and before the text** (before, the fill covers it;
    // after, it crosses the text).
    w.kspage_web_cell_frame(scratch);
    const [fx, fy, fw, fh, inCell] = nums(5);
    if (inCell !== 0) {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      // A line is centered on the path; not moved in, it spills into the next cell.
      ctx.strokeRect(fx + 1, fy + 1, fw - 2, fh - 2);
    }

    paintBoxes(count, ctx, DOC_BOXES, null, ks.plain, true);

    // The page breaks.
    // Caution: **Draw them after the contents** (before, the text covers them). **Their interval is
    // the content height**, not the page's (smaller by the margins).
    const band = paperOf().band;
    if (band > 0) {
      ctx.save();
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([4, 4]);
      for (let y = band; y < height; y += band) {
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(ks.width, Math.round(y) + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Caution: **Draw them after the text**, or the handles end up under it.
    paintGrips(ctx);
    paintDrawn(ctx);
    // **The arrow that opens a column's filter goes last** (`narrow.js`) — in a heading cell, the
    // text would cover it.
    if (ks.paintNarrowArrows) ks.paintNarrowArrows(ctx);

    w.kspage_web_cursor(scratch);
    const [cx, cy, ch, found] = nums(4);
    if (found !== 0) {
      moveCaret(cx, cy, ch);
      moveIme(cx, cy, ch);
      followCaret(cy, ch);
    } else {
      hideCaret();
    }
    // **After following the cursor** — it may have scrolled the window, which decides the kept
    // heading (`pin.js`).
    if (ks.paintPinned) ks.paintPinned();
    ks.paintThumbs(count, dpr);
    // Reports the redraw; the page's chrome (the formula field) updates from it.
    if (ks.api.onRedraw) ks.api.onRedraw();
  }

  // Composed input.
  // Caution: **Handle composition's three events as a set** (update alone leaves committed text
  // looking composed). The keys go only to the hidden input field, **not hidden by `opacity: 0` or
  // `visibility: hidden`** (composition may not start; only the color is transparent), and **placed
  // over the cursor**, or the candidate window opens away from the body.
  const ime = document.createElement("input");
  ime.setAttribute("aria-hidden", "true");
  ime.setAttribute("autocapitalize", "off");
  ime.setAttribute("autocomplete", "off");
  ime.setAttribute("spellcheck", "false");
  ime.style.cssText = "position:absolute;left:0;top:0;width:2px;height:1em;" +
    "border:0;padding:0;margin:0;outline:none;background:transparent;" +
    "color:transparent;caret-color:transparent;font:inherit";
  canvas.after(ime);

  // The cursor, **one DOM element, not drawn onto the canvas** — a blink repaints nothing, and it
  // appears in neither the pages nor the thumbnails.
  const bar = document.createElement("div");
  bar.setAttribute("aria-hidden", "true");
  bar.style.cssText = "position:absolute;left:0;top:0;width:1.5px;height:0;" +
    "background:currentColor;pointer-events:none;display:none";
  canvas.after(bar);
  // The blink.
  // Caution: **Do not keep a timer on this side** (it would race the keystrokes). **The switch is
  // instant** (faded, a half-visible line would linger).
  const blink = bar.animate([
    { opacity: 1, offset: 0 },
    { opacity: 1, offset: 0.49 },
    { opacity: 0, offset: 0.5 },
    { opacity: 0, offset: 1 },
  ], { duration: 1060, iterations: Infinity });

  // Puts the cursor at that position, restarting the blink so it shows right after moving.
  // The document's unit is the CSS px the cursor and the field are placed in.
  // Caution: **Call it at every layout** (the boxes are rebuilt).
  function moveCaret(x, y, h) {
    bar.style.display = "block";
    bar.style.left = `${Math.round(x)}px`;
    bar.style.top = `${y}px`;
    bar.style.height = `${h}px`;
    blink.currentTime = 0;
  }

  function hideCaret() {
    bar.style.display = "none";
  }

  // Scrolls the cursor into the window.
  // Caution: **Scroll only when it goes outside** (every time, a window scrolled away to read would
  // jump back on every keystroke). **Scroll past the chrome pinned at the top**
  // (`ks.api.headRoom`), or typing hides behind the tools. Only vertically (a column is the
  // window's width). The direction of one arrow key, **kept in a table** (with four cases written
  // out, one alone gets changed).
  const ARROW_STEPS = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  const caretMargin = 24;
  // The height the chrome hides at the window's top. **Following and jumping share it** (separate,
  // only the jump target would hide behind the tools).
  function headRoom() {
    return Math.max(ks.api.headRoom ? ks.api.headRoom() : 0, caretMargin);
  }
  // The boxes the last layout made; **the kept heading paints from them without a layout**
  // (`pin.js`).
  let boxCount = 0;

  // Puts the jump target at the window's top. **It is separate from following**, which moves the
  // least and would leave a target reached from below at the window's bottom; after a jump, reading
  // continues from the target.
  function jumpToCaret() {
    w.kspage_web_cursor(scratch);
    const [_x, y, _h, found] = nums(4);
    if (found === 0) return;
    const top = canvas.getBoundingClientRect().top + y;
    window.scrollBy(0, top - headRoom());
    // **The kept heading covers the window's top too** — landing under it, the target hides (the
    // common fault of a sticky heading), so the window scrolls back by its height.
    const band = ks.pinnedBand ? ks.pinnedBand() : null;
    if (band !== null && y >= band.ry + band.rh && y < band.ty + band.th) {
      window.scrollBy(0, -band.rh);
    }
  }
  function followCaret(y, h) {
    const rect = canvas.getBoundingClientRect();
    let top = rect.top + y;
    const room = window.innerHeight;
    let above = headRoom();
    // **The kept heading covers the window's top too** (`pin.js`): in a body row of that table the
    // cursor stays below the band; in the heading row the whole row goes under the tools and the
    // band disappears.
    const band = ks.pinnedBand ? ks.pinnedBand() : null;
    if (band !== null && y >= band.ty && y < band.ty + band.th) {
      if (y < band.ry + band.rh) top = rect.top + band.ry;
      else above += band.rh;
    }
    if (top < above) {
      window.scrollBy(0, top - above);
    } else if (top + h > room - caretMargin) {
      window.scrollBy(0, top + h - (room - caretMargin));
    }
  }

  // Places the input field over the cursor.
  // Caution: Call it at every layout.
  function moveIme(x, y, h) {
    ime.style.left = `${x}px`;
    ime.style.top = `${y}px`;
    ime.style.height = `${h}px`;
  }
  // The entry points the other parts use. **Only what is exported here is visible from outside.**
  ks.surfaceOf = surfaceOf;
  ks.paperOf = paperOf;
  ks.bandRect = bandRect;
  ks.nudgeFrame = nudgeFrame;
  ks.headRoom = headRoom;
  ks.boxCount = () => boxCount;
  // Caution: **Run the drawing through the safety net** — a layout uses the most arena, and where
  // it runs out unrefused **the screen freezes**. The net is `api.js`'s `cramps` (it frees the
  // half-built arena and reports). **Keep the `draw` called inside it bare** (wrapped twice, the
  // cleanup would run twice).
  ks.draw = () => {
    try {
      draw();
    } catch (e) {
      const back = w.kspage_web_recover();
      if (ks.api && ks.api.onCramped) {
        ks.api.onCramped(back);
      }
    }
  };
  // **The helpers passed to the code that draws onto another canvas
  // ([`draw_crop.js`](draw_crop.js)).** Printing, previews and thumbnails go through the same path
  // as here, or print and screen disagree. **The colors are passed as functions that ask**, not as
  // values (a theme changes without the page being rebuilt).
  ks.paperInkOf = () => paperInk;
  // The number of external images blocked.
  // Caution: **Ask after drawing** (nothing is counted before).
  ks.picturesHeld = () => held;
  ks.paintBoxes = paintBoxes;
  ks.paintPanels = paintPanels;
  ks.paintPictures = paintPictures;
  ks.surfaceOf = surfaceOf;
  ks.DOC_BOXES = DOC_BOXES;
  ks.CHROME_BOXES = CHROME_BOXES;
  ks.ime = ime;
  ks.bar = bar;
  ks.blink = blink;
  ks.moveCaret = moveCaret;
  ks.moveIme = moveIme;
  ks.jumpToCaret = jumpToCaret;
  // The arrow keys' directions. **The key handler reads them** (moving a frame shares the number
  // fields' entry point).
  ks.ARROW_STEPS = ARROW_STEPS;
  // The list of names. **The boundary passes by number**, so a reordered list would read an old
  // text as something else.
  ks.SHAPES = SHAPES;
  ks.KEEPS = KEEPS;
  ks.ALIGNS = ALIGNS;
  ks.COMPARES = COMPARES;
  ks.MARKS = MARKS;
  ks.PAIRED_MARKS = PAIRED_MARKS;
  ks.DATINGS = DATINGS;
  ks.COLLECTS = COLLECTS;
  ks.SKETCHES = SKETCHES;
  ks.regionAt = regionAt;
}
