// ==========================================
// kspage's JS side — the entry points for styling. They cover colors on text, paragraph and
// inline styles, the marker, the border and the fill, shapes, and the list of a slide's contents.
// **They are added to the same `app` as [`api.js`](api.js)** (`api.js` / `api_look.js` /
// `api_show.js` are one `app`). Split off for the 1000-line-per-file cap, and follows the same
// boundary rules.
//
// Caution: **Every entry point replaces the whole.** One that changes a field at a time breaks
// when a field passed without being read reverts to the default. The caller reads first, then
// passes it with one thing changed. **The text's colors are passed as `0xRRGGBB` numbers** (24-bit,
// exact in an F32); **a style crosses as its saved text**, where a color is `#rrggbb`.
// ==========================================
function kspageApiLook(ks) {
  const { w, canvas, enc, outText, colorText, colorNum, scratch, nums, draw, acted, ended, stage,
    handOver, cramps } = ks;
  // Caution: **Add it to the same `app`** (the page sees one handle).
  Object.assign(ks.api, {
    // Style `i` **as a saved document holds it** (`kspage/share/store.kspl`): the font, the colors,
    // the paragraph settings, the number format, the marker, the border and the rest, by the saved
    // field names. **A field left out is unset or holds its default**; null where there is no style
    // `i`.
    styleData(i) {
      const len = w.kspage_web_style_text(i);
      return len > 0 ? JSON.parse(outText(len)) : null;
    },
    // Replaces style `i` with `data`, **read as a saved style is** (the same checks; out of range,
    // nothing changes) and kept as one undo step; true if replaced. The name stays.
    // Caution: **Pass back the whole style read from `styleData`**, changed where it changes — a
    // field left out is unset, so one not passed is dropped.
    setStyleData(i, data) {
      const bytes = enc.encode(JSON.stringify(data));
      if (!handOver(bytes)) return false;
      return acted(w.kspage_web_set_style_text(i, bytes.length));
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
      return acted(w.kspage_web_set_style(len));
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
      return acted(w.kspage_web_set_chrome(which === "footer" ? 1 : 0, len));
    },
    // Applies colors (text color, background, underline, strikethrough) to the selection. **It
    // replaces the whole**: an omitted field is "unset (the parent's)", and passing none removes
    // it. A color is `#rrggbb` text.
    paintSpan(spec) {
      const has = (v) => (v === null || v === undefined ? 0 : 1);
      return acted(w.kspage_web_paint_span(
        has(spec.color), spec.color ? colorNum(spec.color) : 0,
        has(spec.background), spec.background ? colorNum(spec.background) : 0,
        has(spec.underline), spec.underline ? 1 : 0,
        has(spec.strike), spec.strike ? 1 : 0,
        has(spec.bold), spec.bold ? 1 : 0,
        has(spec.italic), spec.italic ? 1 : 0));
    },
    // Toggles bold or italic, leaving the other styling; true if applied. **The styling is replaced
    // whole**, so the settings are read, and only that field changes between "set" and "the
    // parent's". "Off" is a setting, passed directly to `paintSpan`.
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
    // The armed tool; **`null` means none** (clicking selects text). The shape is `Shape`'s name,
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
      if (name.length <= 0) return false;
      const len = stage(`${shape}\t${name}`);
      if (len <= 0) return false;
      return acted(w.kspage_web_draw_shape(len, x, y, wide, tall));
    },
    // Removes the selected frame if it holds no text. **On a frame with text it is false** (the key
    // handler then deletes one character).
    dropPicked() {
      return acted(w.kspage_web_drop_picked());
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
          // Screen coordinates, **only after layout** (0 before).
          seen: { x: sx, y: sy, w: sw, h: sh },
        });
      }
      return got;
    },
    // Selects item `i` of the list, **one at a time**; the cursor does not move (a shape has
    // nowhere for it).
    pickObject(i) {
      return acted(w.kspage_web_pick_object(i));
    },
    // Moves the selected frame one place in the stacking order. **False at either end.**
    raiseObject(up) {
      return acted(w.kspage_web_raise_object(up ? 1 : 0));
    },
    // Adds one shape to the cursor's container, **to the slide itself inside a slide** (otherwise
    // the paragraph or cell). A missing style is made; for an existing one only the shape changes.
    // It appears near the slide's middle, to be grabbed and moved.
    insertShape(name, shape) {
      if (name.length <= 0) return false;
      const len = stage(`${shape}\t${name}`);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_shape(len));
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
      return ended(w.kspage_web_set_block_style(len));
    },
    // Whether style `i` can be applied to a paragraph. **The core decides** (a separate check in
    // the page could list a style that is then refused).
    styleFitsBlock(i) { return w.kspage_web_style_fits_block(i) !== 0; },
    // The name of the current place. **Empty means none** (it cannot be pointed at). It is
    // separate from a style's name. **It attaches to the frame inside a slide, and to the paragraph
    // outside one.** A table or list inside a frame answers with the outer frame's name.
    name() {
      const len = w.kspage_web_name();
      return outText(len);
    },
    // Names the current place; empty removes the name. Empty if named, else **the reason**: no
    // place, or why no formula could reach a table by that name (`kspage_web_set_name`).
    // **Write what it attaches to into "no place"**: it depends on where the cursor is
    // (`named_at` in `../../write/block.kspl`). Saying only "the text inside a frame", someone
    // who wants to name a table reads that as impossible.
    setName(text) {
      const nowhere = "Click where the name is to be given and then set it (inside a cell it "
        + "attaches to the table, inside a slide's frame to the frame, and otherwise to the "
        + "paragraph you are in)";
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return nowhere;
      return ended(w.kspage_web_set_name(len), { nowhere: nowhere });
    },
    // Inserts at the cursor text that refers to the target by name. **Only a paragraph with a
    // running number can be referred to** (nothing else has text to show). The number is recounted
    // at every layout; the document stores only the name.
    // Caution: **Lay out first, then call** (the number comes from the layout result).
    insertRefer(name) {
      cramps(() => w.kspage_web_layout(ks.width));
      const len = stage(name);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_refer(len));
    },
    // Merges every cell the selection covers into its top-left cell — **drag across and click
    // once** (Excel's way). **Empty if merged, else the reason** (the rule of `setBlockStyle`). One
    // undo restores the absorbed cells.
    mergeCells() {
      cramps(() => w.kspage_web_layout(ks.width));
      return ended(w.kspage_web_merge_cells(), {
        outside: "Select cells inside one table",
        too_wide: "One merge covers at most 1000 rows and 1000 columns",
      });
    },
    // Splits the merged cell the cursor is in; empty cells come back where it covered.
    splitCell() {
      cramps(() => w.kspage_web_layout(ks.width));
      return acted(w.kspage_web_split_cell());
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
      return acted(w.kspage_web_set_href(len));
    },
    // The link target exactly at document position (x, y); **not moved to what is nearby** (empty
    // outside).
    hrefAt(x, y) {
      cramps(() => w.kspage_web_layout(ks.width));
      const len = w.kspage_web_href_at(x, y);
      return outText(len);
    },
    // Adds one style with a name and returns its index (the existing one's where the name exists).
    // **A refusal comes back as its reason**: -1 "no name", -2 "the name holds a space". With one
    // number, the screen would ask for a name that was already typed.
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
      return acted(w.kspage_web_wear_theme(i));
    },
  });
}
