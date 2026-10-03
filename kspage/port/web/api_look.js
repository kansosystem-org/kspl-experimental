// ==========================================
// kspage's JS side — the entry points for styling: colors on text, paragraph and inline styles,
// the marker, the border and the fill, shapes, and the list of a slide's contents. **They are
// added to the same `app` as [`api.js`](api.js)** (`api.js` / `api_io.js` / `api_look.js` /
// `api_diff.js` are one `app`). Split off for the 1000-line-per-file cap, and follows the same
// boundary rules.
//
// Caution: **Every entry point replaces the whole.** One that changes a field at a time breaks
// when a field passed without being read reverts to the default (the caller reads first, then
// passes it with one thing changed). **A color is passed as a `0xRRGGBB` number** (24-bit, exact
// in an F32).
// ==========================================
function kspageApiLook(ks) {
  const { w, canvas, enc, outText, colorText, colorNum, scratch, nums, draw, stage, handOver,
    SHAPES, ALIGNS, COMPARES, MARKS, PAIRED_MARKS, DATINGS, COLLECTS } = ks;
  // Caution: **Add it to the same `app`** (the page sees one handle).
  Object.assign(ks.api, {
    // Style `i`'s heading depth (0: not a heading) and what it collects ("none" / "contents" /
    // "notes").
    styleOutline(i) {
      w.kspage_web_style_outline(i, scratch);
      const [level, collect] = nums(2);
      return { level, collect: COLLECTS[collect] || COLLECTS[0] };
    },
    // Replaces style `i`'s heading depth and what it collects, whole.
    setStyleOutline(i, spec) {
      const kind = COLLECTS.indexOf(spec.collect || COLLECTS[0]);
      const done = w.kspage_web_set_style_outline(i, spec.level || 0,
        kind < 0 ? 0 : kind) !== 0;
      if (done) draw();
      return done;
    },
    // The style name of the cursor's inline. Empty means the parent's.
    style() {
      const len = w.kspage_web_style();
      return outText(len);
    },
    // Applies a style name to the selection (with nothing selected, the whole inline); an empty
    // name reverts to "the parent's".
    setStyle(name) {
      const len = stage(name);
      if (len < 0) return false;
      const done = w.kspage_web_set_style(len) !== 0;
      if (done) draw();
      return done;
    },
    // The text of the band at the page's top ("header") or bottom ("footer"), with `{page}` and
    // `{pages}` as they are.
    chrome(which) {
      const len = w.kspage_web_chrome_source(which === "footer" ? 1 : 0);
      return outText(len);
    },
    // Replaces the band's whole text, **in the same record as typing** (Ctrl+Z restores it).
    // `{page}` becomes the page number and `{pages}` the page count.
    setChrome(which, text) {
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return false;
      const done = w.kspage_web_set_chrome(which === "footer" ? 1 : 0, len) !== 0;
      if (done) draw();
      return done;
    },
    // Applies colors (text color, background, underline, strikethrough) to the selection. **It
    // replaces the whole**: an omitted field is "unset (the parent's)", and passing none removes
    // it. A color is `#rrggbb` text.
    paintSpan(spec) {
      const has = (v) => (v === null || v === undefined ? 0 : 1);
      const done = w.kspage_web_paint_span(
        has(spec.color), spec.color ? colorNum(spec.color) : 0,
        has(spec.background), spec.background ? colorNum(spec.background) : 0,
        has(spec.underline), spec.underline ? 1 : 0,
        has(spec.strike), spec.strike ? 1 : 0,
        has(spec.bold), spec.bold ? 1 : 0,
        has(spec.italic), spec.italic ? 1 : 0) !== 0;
      if (done) draw();
      return done;
    },
    // Toggles bold or italic, leaving the other styling; true if applied. **The styling is replaced
    // whole**, so the settings are read and only that field changed, between "set" and "the
    // parent's" ("off" is a setting, passed directly to `paintSpan`).
    accentSpan(which) {
      const now = this.spanInk();
      const spec = {
        color: now.color, background: now.background,
        underline: now.underline, strike: now.strike,
        bold: now.bold, italic: now.italic,
      };
      spec[which] = now[which] === true ? null : true;
      return this.paintSpan(spec);
    },
    // The styling of the cursor's inline. **"Unset" comes back as null per field.**
    // Caution: **To change one field, read this and then pass it to `paintSpan`** — passed without
    // reading, the other applied fields are lost.
    spanInk() {
      w.kspage_web_span_ink(scratch);
      const [hasColor, color, hasBack, back, hasUnder, under, hasStrike, strike,
        hasBold, bold, hasItalic, italic] = nums(12);
      return {
        color: hasColor !== 0 ? colorText(color) : null,
        background: hasBack !== 0 ? colorText(back) : null,
        underline: hasUnder !== 0 ? under !== 0 : null,
        strike: hasStrike !== 0 ? strike !== 0 : null,
        bold: hasBold !== 0 ? bold !== 0 : null,
        italic: hasItalic !== 0 ? italic !== 0 : null,
      };
    },
    // Style `i`'s look (the font and the colors), a color as `#rrggbb` text. **"Unset" comes back
    // as null per field** (0 could not be told from italic false or black).
    styleLook(i) {
      const len = w.kspage_web_style_family(i);
      const family = len > 0 ? outText(len) : null;
      w.kspage_web_style_look(i, scratch);
      const [hasSize, size, hasWeight, weight, hasItalic, italic,
        hasColor, color, hasBack, back] = nums(10);
      return {
        family: family,
        sizePx: hasSize !== 0 ? size : null,
        weight: hasWeight !== 0 ? weight : null,
        italic: hasItalic !== 0 ? italic !== 0 : null,
        color: hasColor !== 0 ? colorText(color) : null,
        background: hasBack !== 0 ? colorText(back) : null,
      };
    },
    // Replaces style `i`'s look whole. **There is no entry point per field** ("unset" is one of the
    // settings).
    setStyleLook(i, spec) {
      const len = spec.family === null ? -1 : stage(spec.family);
      if (len < -1) return false;
      const done = w.kspage_web_set_style_look(i, len,
        spec.sizePx === null ? 0 : 1, spec.sizePx === null ? 0 : spec.sizePx,
        spec.weight === null ? 0 : 1, spec.weight === null ? 0 : spec.weight,
        spec.italic === null ? 0 : 1, spec.italic ? 1 : 0,
        spec.color === null ? 0 : 1, spec.color === null ? 0 : colorNum(spec.color),
        spec.background === null ? 0 : 1,
        spec.background === null ? 0 : colorNum(spec.background)) !== 0;
      if (done) draw();
      return done;
    },
    // Style `i`'s number format. **The decimal places can be "unset"** (as many as needed). It
    // applies only where text is made from a value (plain typed text stays).
    styleNumber(i) {
      w.kspage_web_style_number(i, scratch);
      const [hasPlaces, places, grouped, percent, dated] =
        nums(5);
      // Caution: For the text, get the length before asking for the address (writing grows memory).
      const prefixLen = w.kspage_web_style_affix(i, 0);
      const prefix = outText(prefixLen);
      const suffixLen = w.kspage_web_style_affix(i, 1);
      const suffix = outText(suffixLen);
      return {
        places: hasPlaces !== 0 ? places : null,
        grouped: grouped !== 0,
        percent: percent !== 0,
        prefix: prefix,
        suffix: suffix,
        dated: DATINGS[dated] || DATINGS[0],
      };
    },
    // Replaces style `i`'s number format whole. **The texts before and after share the one arena,
    // separated by a tab**, so a tab cannot be used in them.
    // Caution: **Pass the date format too** (omitted, it reverts to a number).
    setStyleNumber(i, spec) {
      const affix = `${spec.prefix || ""}\t${spec.suffix || ""}`;
      const len = affix === "\t" ? 0 : stage(affix);
      if (len < 0) return false;
      const done = w.kspage_web_set_style_number(i, len,
        spec.places === null || spec.places === undefined ? 0 : 1,
        spec.places === null || spec.places === undefined ? 0 : spec.places,
        spec.grouped ? 1 : 0, spec.percent ? 1 : 0,
        Math.max(DATINGS.indexOf(spec.dated), 0)) !== 0;
      if (done) draw();
      return done;
    },
    // Style `i`'s paragraph settings: the alignment is "left" / "center" / "right" / "justify". **A
    // line height multiple of 0 means "unset"** (the font's height). **With `wrap` false, text
    // wider than the column spills out** (a code block). **0 and 1 columns both mean no columns**
    // (a column's width comes from the count and the gap).
    stylePara(i) {
      w.kspage_web_style_para(i, scratch);
      const [align, spacing, before, after, indent, wrap, columns, gap, pad] =
        nums(9);
      return {
        align: ALIGNS[align] || "left",
        spacing: spacing,
        spaceBefore: before,
        spaceAfter: after,
        indent: indent,
        wrap: wrap !== 0,
        columns: columns,
        columnGap: gap,
        pad: pad,
      };
    },
    // Replaces style `i`'s paragraph settings whole.
    setStylePara(i, spec) {
      const at = ALIGNS.indexOf(spec.align);
      const done = w.kspage_web_set_style_para(i, at < 0 ? 0 : at, spec.spacing || 0,
        spec.spaceBefore || 0, spec.spaceAfter || 0, spec.indent || 0,
        spec.wrap === false ? 0 : 1, spec.columns || 0, spec.columnGap || 0,
        spec.pad || 0) !== 0;
      if (done) draw();
      return done;
    },
    // Style `i`'s border and fill. **Only the fill can be "unset"** (no line is thickness 0, so its
    // color always comes back); a color as `#rrggbb` text.
    styleEdge(i) {
      w.kspage_web_style_edge(i, scratch);
      const [edge, color, hasFill, fill, shape] = nums(5);
      return {
        width: edge,
        color: colorText(color),
        fill: hasFill !== 0 ? colorText(fill) : null,
        shape: SHAPES[shape] || SHAPES[0],
      };
    },
    // Replaces style `i`'s border and fill whole; a grid on a table is a line on the cell style
    // (`cell`).
    // Caution: **Pass the shape too** (omitted, it reverts to a rectangle).
    setStyleEdge(i, spec) {
      const done = w.kspage_web_set_style_edge(i, spec.width || 0,
        colorNum(spec.color || "#000000"),
        spec.fill === null || spec.fill === undefined ? 0 : 1,
        spec.fill ? colorNum(spec.fill) : 0,
        Math.max(SHAPES.indexOf(spec.shape), 0)) !== 0;
      if (done) draw();
      return done;
    },
    // The armed tool; **`null` means none** (clicking selects text). The shape is `SHAPES`'s text,
    // `name` the style applied to it, and `lock` keeps it armed after drawing (PowerPoint's "lock
    // drawing mode").
    armed: null,
    // Arms a tool (`null` disarms).
    // Caution: **Report each change of the armed tool** (unless the tool's look follows, the screen
    // does not show it).
    arm(tool) {
      ks.api.armed = tool;
      canvas.style.cursor = tool ? "crosshair" : "text";
      if (ks.api.onArm) ks.api.onArm(tool);
    },
    // Called when the armed tool changes (a tool or null is passed).
    onArm: null,
    // Called once a drag has finished drawing (whether it could be drawn is passed).
    onDraw: null,
    // Draws one shape of `wide` × `tall` from screen position (x, y) onto the slide the click
    // landed in; the cursor is ignored. **It cannot draw outside a slide** (flow and grid layouts
    // read no position).
    drawShape(name, shape, x, y, wide, tall) {
      const len = stage(name);
      if (len <= 0) return false;
      const done = w.kspage_web_draw_shape(len, Math.max(SHAPES.indexOf(shape), 0),
        x, y, wide, tall) !== 0;
      if (done) draw();
      return done;
    },
    // Removes the selected frame if it holds no text. **On a frame with text it is false** (the key
    // handler then deletes one character).
    dropPicked() {
      const done = w.kspage_web_drop_picked() !== 0;
      if (done) draw();
      return done;
    },
    // The contents of the current slide (**empty outside one**), **in stacking order** (a later one
    // is drawn on top). `name` is the document's, empty where none (the screen makes a label).
    objects() {
      const many = w.kspage_web_object_count();
      const got = [];
      for (let i = 0; i < many; i += 1) {
        w.kspage_web_object(i, scratch);
        const [x, y, wide, tall, flags, sx, sy, sw, sh] =
          nums(9);
        got.push({
          index: i,
          name: outText(w.kspage_web_object_name(i)),
          style: outText(w.kspage_web_object_style(i)),
          x: x, y: y, w: wide, h: tall,
          picked: (flags & 1) !== 0,
          hasText: (flags & 2) !== 0,
          tie: (flags & 4) !== 0,
          // Screen coordinates, **only after layout** (0 before).
          seen: { x: sx, y: sy, w: sw, h: sh },
        });
      }
      return got;
    },
    // Selects item `i` of the list, **one at a time**; the cursor does not move (a shape has
    // nowhere for it).
    pickObject(i) {
      const done = w.kspage_web_pick_object(i) !== 0;
      if (done) draw();
      return done;
    },
    // Moves the selected frame by (dx, dy).
    moveFrames(dx, dy) {
      const done = w.kspage_web_move_frames(dx, dy) !== 0;
      if (done) draw();
      return done;
    },
    // Moves the selected frame one place in the stacking order. **False at either end.**
    raiseObject(up) {
      const done = w.kspage_web_raise_object(up ? 1 : 0) !== 0;
      if (done) draw();
      return done;
    },
    // Adds one shape to the cursor's container, **to the slide itself inside a slide** (otherwise
    // the paragraph or cell). A missing style is made; for an existing one only the shape changes.
    // It appears near the slide's middle, to be grabbed and moved.
    insertShape(name, shape) {
      const len = stage(name);
      if (len <= 0) return false;
      const done = w.kspage_web_insert_shape(len, Math.max(SHAPES.indexOf(shape), 0)) !== 0;
      if (done) draw();
      return done;
    },
    // The style name of the cursor's paragraph. **Empty means the parent's.** **It is separate from
    // the inline style** (`style()`); the marker and the arrangement belong here.
    blockStyle() {
      const len = w.kspage_web_block_style();
      return outText(len);
    },
    // Applies a style to the cursor's paragraph; **empty removes it** (making a list, or removing
    // its marker, is this). Empty text if applied, else **the reason**. **Do not merge the reasons
    // into one** — merged, four different causes share one message and the reader cannot fix it.
    setBlockStyle(name) {
      const len = name.length > 0 ? stage(name) : 0;
      if (len < 0) return "The name is too long";
      const end = w.kspage_web_set_block_style(len);
      if (end === 1) {
        draw();
        return "";
      }
      if (end === -1) {
        return "There is no style of this name in this document";
      }
      if (end === -2) {
        return "A table's or a slide's style cannot be applied to a paragraph";
      }
      return "Click inside a paragraph and then choose";
    },
    // Whether style `i` can be applied to a paragraph. **The core decides** (a separate check in
    // the page could list a style that is then refused).
    styleFitsBlock(i) { return w.kspage_web_style_fits_block(i) !== 0; },
    // The name of the current place; **empty means none** (it cannot be pointed at). It is separate
    // from a style's name. **It attaches to the frame inside a slide, and to the paragraph outside
    // one** (a table or list inside a frame answers with the outer frame's name).
    name() {
      const len = w.kspage_web_name();
      return outText(len);
    },
    // Names the current place; empty removes the name.
    setName(text) {
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return false;
      const done = w.kspage_web_set_name(len) !== 0;
      if (done) draw();
      return done;
    },
    // Inserts at the cursor text that refers to the target by name. **Only a paragraph with a
    // running number can be referred to** (nothing else has text to show). The number is recounted
    // at every layout; the document stores only the name.
    // Caution: **Lay out first, then call** (the number comes from the layout result).
    insertRefer(name) {
      w.kspage_web_layout(ks.width);
      const len = stage(name);
      if (len <= 0) return false;
      const done = w.kspage_web_insert_refer(len) !== 0;
      if (done) draw();
      return done;
    },
    // Merges every cell the selection covers into its top-left cell — **drag across and click
    // once** (Excel's way). **Empty if merged, else the reason** (the rule of `setBlockStyle`). One
    // undo restores the absorbed cells.
    mergeCells() {
      w.kspage_web_layout(ks.width);
      const got = w.kspage_web_merge_cells();
      if (got === 1) { draw(); return ""; }
      if (got === -1) return "This document is open for reading alone";
      if (got === -2) return "Drag across two or more cells first";
      if (got === -3) return "A cell already merged reaches outside what was selected";
      return "Select cells inside one table";
    },
    // Splits the merged cell the cursor is in; empty cells come back where it covered.
    splitCell() {
      w.kspage_web_layout(ks.width);
      const done = w.kspage_web_split_cell() !== 0;
      if (done) draw();
      return done;
    },
    // The link target of the cursor's inline. **Empty means it is not a link.**
    href() {
      const len = w.kspage_web_href();
      return outText(len);
    },
    // Makes the selection (with nothing selected, the whole inline) a link. **Empty removes it**,
    // and the link's look reverts to "the parent's" too.
    setHref(text) {
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return false;
      const done = w.kspage_web_set_href(len) !== 0;
      if (done) draw();
      return done;
    },
    // The source the cursor's inline points at. **null means none** (an ordinary link included).
    sourceAim() {
      const len = w.kspage_web_source_aim(0);
      if (len <= 0) return null;
      const file = outText(len);
      const two = w.kspage_web_source_aim(1);
      return { file: file, name: outText(two) };
    },
    // The source the text exactly at document position (x, y) points at; **not moved to what is
    // nearby** (null outside).
    sourceAt(x, y) {
      w.kspage_web_layout(ks.width);
      const len = w.kspage_web_source_at(x, y, 0);
      if (len <= 0) return null;
      const file = outText(len);
      const two = w.kspage_web_source_at(x, y, 1);
      return { file: file, name: outText(two) };
    },
    // Makes the selection (with nothing selected, the whole inline) a link to the source.
    // Caution: **Do not build the link target's text here** (the core does, in one place); the two
    // names are sent separated by a tab.
    linkSource(file, name) {
      const len = stage(file + "\t" + (name || ""));
      if (len < 0) return false;
      const done = w.kspage_web_link_source(len) !== 0;
      if (done) draw();
      return done;
    },
    // Remembers one text passed in. **A window borrows at layout time**, so one whose text was not
    // passed in shows only the target. The same name again replaces it.
    handSource(file, bytes) {
      if (!handOver(bytes)) return false;
      const nameLen = stage(file);
      if (nameLen < 0) return false;
      const done = w.kspage_web_hand_source(nameLen, bytes.length) !== 0;
      if (done) draw();
      return done;
    },
    // Forgets all the text passed in.
    dropSources() {
      w.kspage_web_drop_sources();
      draw();
    },
    // What this document points at (windows, figures and links in one list), **for choosing the
    // files to pass in and for the check** — passing everything in piles unread text in the wasm.
    // `state` is 0 not passed in, 1 found, 2 the symbol missing (**kept apart because the fixes are
    // opposite**: pass it in / change the document).
    aims() {
      const many = w.kspage_web_aim_count();
      const got = [];
      for (let i = 0; i < many; i += 1) {
        const len = w.kspage_web_aim(i, 0);
        if (len <= 0) continue;
        const file = outText(len);
        const two = w.kspage_web_aim(i, 1);
        got.push({
          file: file,
          name: outText(two),
          state: w.kspage_web_aim_state(i),
        });
      }
      return got;
    },
    // Inserts one window after the cursor's paragraph. **The contents are not inserted** (borrowed
    // at every layout).
    insertWindow(style, file, name) {
      const len = stage(style + "\t" + file + "\t" + (name || ""));
      if (len < 0) return false;
      const done = w.kspage_web_insert_window(len) !== 0;
      if (done) draw();
      return done;
    },
    // Inserts one imports figure after the cursor's paragraph. **Neither boxes nor lines are
    // inserted** (built from the borrowed source's `import` at every layout). Two styles are made
    // (the box and its lines).
    insertPulls(style, file) {
      const len = stage(style + "\t" + file);
      if (len < 0) return false;
      const done = w.kspage_web_insert_pulls(len) !== 0;
      if (done) draw();
      return done;
    },
    // Where that symbol is inside the passed-in text, in bytes (the caller cuts its own bytes).
    // **null when absent** — empty text would hide that the symbol is gone.
    sourceSpot(bytes, name) {
      // Caution: **Return null when it is absent** (the same promise as `nameLen` below).
      if (!handOver(bytes)) return null;
      const nameLen = stage(name || "");
      if (nameLen < 0) return null;
      const found = w.kspage_web_source_spot(bytes.length, nameLen, scratch);
      const [at, wide, line] = nums(3);
      return found === 0 ? null : { at: at, len: wide, line: line };
    },
    // The link target exactly at document position (x, y); **not moved to what is nearby** (empty
    // outside).
    hrefAt(x, y) {
      w.kspage_web_layout(ks.width);
      const len = w.kspage_web_href_at(x, y);
      return outText(len);
    },
    // Style `i`'s underline and strikethrough. **Both can be "unset"** (null).
    styleDecor(i) {
      w.kspage_web_style_decor(i, scratch);
      const [hasUnder, under, hasStrike, strike] =
        nums(4);
      return {
        underline: hasUnder !== 0 ? under !== 0 : null,
        strike: hasStrike !== 0 ? strike !== 0 : null,
      };
    },
    // Style `i`'s conditional style: `how` is `COMPARES`'s text, `then` the style applied. **Only
    // the name is applied** (the color and thickness are that style's).
    styleWhen(i) {
      w.kspage_web_style_when(i, scratch);
      const [how, than] = nums(2);
      const len = w.kspage_web_style_when_then(i);
      return {
        how: COMPARES[how] || COMPARES[0],
        than: than,
        then: outText(len),
      };
    },
    // Replaces style `i`'s condition whole.
    setStyleWhen(i, spec) {
      const len = stage(spec.then || "");
      if (len < 0) return false;
      const at = COMPARES.indexOf(spec.how);
      const done = w.kspage_web_set_style_when(i, at < 0 ? 0 : at,
        Number(spec.than) || 0, len) !== 0;
      if (done) draw();
      return done;
    },
    // Replaces style `i`'s line settings whole.
    setStyleDecor(i, spec) {
      const done = w.kspage_web_set_style_decor(i,
        spec.underline === null || spec.underline === undefined ? 0 : 1,
        spec.underline ? 1 : 0,
        spec.strike === null || spec.strike === undefined ? 0 : 1,
        spec.strike ? 1 : 0) !== 0;
      if (done) draw();
      return done;
    },
    // Style `i`'s marker; the kind is `MARKS`'s text. **The text's meaning depends on the kind**
    // (the bullet itself, or the text after the number). **Running and chapter numbers have two
    // texts** (before and after the number; the separator and the after), which the core separates
    // by a tab and this splits. Other kinds have `before` empty.
    styleMark(i) {
      const len = w.kspage_web_style_mark(i, scratch);
      const kind = nums(1)[0];
      const got = outText(len);
      const tab = got.indexOf("\t");
      const paired = PAIRED_MARKS.indexOf(MARKS[kind]) >= 0;
      return {
        kind: MARKS[kind] || "none",
        before: paired && tab >= 0 ? got.slice(0, tab) : "",
        text: paired ? (tab >= 0 ? got.slice(tab + 1) : got) : got,
      };
    },
    // Replaces style `i`'s marker whole.
    // Caution: **For the kinds with two texts, pass `before` too** (omitted, "Figure " or the
    // separator is lost and the number stands alone).
    setStyleMark(i, spec) {
      const at = MARKS.indexOf(spec.kind);
      const both = PAIRED_MARKS.indexOf(spec.kind) >= 0
        ? `${spec.before || ""}\t${spec.text || ""}` : (spec.text || "");
      const len = both ? stage(both) : 0;
      if (len < 0) return false;
      const done = w.kspage_web_set_style_mark(i, at < 0 ? 0 : at, len) !== 0;
      if (done) draw();
      return done;
    },
    // Adds one style with a name and returns its index (the existing one's where the name exists).
    // **A refusal comes back as its reason**: -1 "no name", -2 "the name holds a space" (with one
    // number, the screen would ask for a name that was already typed).
    addStyle(name) {
      const len = stage(name);
      if (len <= 0) return -1;
      const at = w.kspage_web_add_style(len);
      if (at >= 0) draw();
      return at;
    },
    // The names in the style table; the document decides the screen's order.
    // Caution: Get the length first (writing can grow memory and move the address).
    styleNames() {
      const out = [];
      for (let i = 0; i < w.kspage_web_style_count(); i += 1) {
        const len = w.kspage_web_style_name(i);
        out.push(outText(len));
      }
      return out;
    },
    // The names of the themes that can be applied. **The count and the names are the core's**
    // (copied into the page, adding a theme would split the two).
    themes() {
      const out = [];
      for (let i = 0; i < w.kspage_web_theme_count(); i += 1) {
        const len = w.kspage_web_theme_name(i);
        out.push(outText(len));
      }
      return out;
    },
    // Applies theme `i` to the style table; **one undo restores it all.** With the same colors
    // again it is false (no step that does nothing is recorded).
    wearTheme(i) {
      const done = w.kspage_web_wear_theme(i) !== 0;
      if (done) draw();
      return done;
    },
  });
}
