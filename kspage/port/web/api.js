// ==========================================
// kspage's JS side — the public entry points that all of the page's chrome (`page.js` and below)
// uses.
// Caution: **Do not call the wasm's entry points directly from the page** — the boundary's text
// spreads into two places, and they get out of step when only one changes.
// **Every entry point returns "whether it acted"** and **handles the layout itself** (the caller
// does not remember "redraw after this"). Split off for the 1000-line-per-file cap (Principle 3).
// ==========================================
function kspageApi(ks) {
  // The back and forward history, **two stacks** (one list with a position needs truncating where
  // it branches). **What is remembered is the window's scroll**, a place in the open document only,
  // so swapping the document clears both (`forgetPlaces`).
  const back = [];
  const ahead = [];
  const hop = (from, to) => {
    if (from.length === 0) return false;
    to.push(window.scrollY);
    window.scrollTo(0, from.pop());
    return true;
  };

  const { w, mem, canvas, enc, str, outText, colorText, colorNum, scratch, nums, draw, acted, stage,
  type, compose, ime, bar, paperOf, armGroupBreak, handOver,
  SHAPES, ALIGNS, MARKS, DATINGS, COLLECTS, SKETCHES } = ks;
  // The safety net for exhausted memory (`kspage.js`'s `ks.cramps`).
  const { cramps } = ks;
  const api = {
    // Called after a redraw; the page sets it (none by default).
    onRedraw: null,
    // The notifier for a refusal from full memory, given the bytes freed (**the page's text**).
    onCramped: null,
    // The bottom (px) of the chrome pinned at the top, **set by the page** (unset, 24px).
    headRoom: null,
    // Where the slide list is shown, **set by the page** (unset, no list); redrawn each time.
    slideStrip: null,
    // Sets the width and redraws. **Pass the container's width as it is** — one document unit is
    // one CSS pixel (`kspage/docs/DESIGN.md`'s "Whether the browser or the page holds the zoom").
    resize(cssWidth) { ks.width = cssWidth; draw(); },
    // The viewer's overrides, **not document settings**: the colors fitted to the screen, and
    // whether outside images are read in.
    over() {
      return { plain: ks.plain, pics: ks.outsidePics };
    },
    // Replaces the viewer's overrides whole (an omitted field: not overridden). **Both are the
    // page's** (it knows the roles' colors and fetches the images).
    setOver(spec) {
      ks.plain = spec.plain === true;
      // **Only external images are not remembered** (unlike `side.js`'s `keptPick`), or one
      // permission would silently fetch from outside for every later document.
      ks.outsidePics = spec.pics === true;
      draw();
    },
    // `picturesHeld` counts the external images blocked on opening; `paper` is one page's settings
    // (**`band` is the content height** minus margins; width 0 the container's, height 0 unsplit).
    // Caution: **Ask after drawing** (nothing is counted before); not 0, a bare frame is "blocked".
    picturesHeld() { return ks.picturesHeld ? ks.picturesHeld() : 0; },
    paper() { return paperOf(); },
    // Replaces one page's settings whole. An omitted field is passed as 0 (unset).
    setPaper(spec) {
      w.kspage_web_set_paper(spec.width || 0, spec.height || 0, spec.left || 0,
        spec.top || 0, spec.right || 0, spec.bottom || 0, spec.reading || 0);
      draw();
    },
    // How many pages the layout makes. **It only reads, never lays out** (otherwise it would lay
    // out several times per keystroke); every changing entry point redraws, so read after.
    paperCount() { return w.kspage_web_paper_count(); },
    // Makes it ready to take keys, on the input field, not the canvas.
    // Caution: **Do not let it scroll the window** (`preventScroll`): the browser would scroll to
    // the field over the cursor, pulling away from a jump's target. **Only this side scrolls the
    // window** (`followCaret` and `jumpToCaret`, which know the height the chrome hides).
    focus() { ime.focus({ preventScroll: true }); },
    // The page's text (the boxes joined in order, **no wrap breaks**), for checks from outside.
    text() {
      const count = cramps(() => w.kspage_web_layout(ks.width)) || 0;
      let out = "";
      for (let i = 0; i < count; i++) {
        out += str(w.kspage_web_box_text(i), w.kspage_web_box_text_len(i));
      }
      return out;
    },
    // Undo and redo, **for the keys and the icons alike** (with two paths, one alone gets changed).
    undo() {
      const done = w.kspage_web_undo() !== 0;
      if (done) { armGroupBreak(); draw(); }
      return done;
    },
    redo() {
      const done = w.kspage_web_redo() !== 0;
      if (done) { armGroupBreak(); draw(); }
      return done;
    },
    // Where the cursor is and the lines around it, **for the debug log only**; **no document text**
    // (only which paragraph, how far in, the lines' shape).
    caretReport() {
      const len = w.kspage_web_caret_report();
      return outText(len);
    },
    // Writes the reloadable text.
    save() {
      const len = w.kspage_web_save();
      return outText(len);
    },
    // The largest document that can be opened, in bytes (**"unreadable" and "too large" are
    // reported apart**, with opposite fixes); **not copied into the page** (the two would drift).
    docLimit() { return w.kspage_web_doc_limit(); },
    // Whether it is open read-only, **not a property of the document** (neither saved nor exported).
    // Caution: **Not just a flag for hiding the tools** — the core refuses (`write/edit.kspls`'s
    // `shut`), stopping what gets past the hidden tools (shortcuts, pasting).
    readOnly() { return w.kspage_web_read_only() !== 0; },
    setReadOnly(on) { w.kspage_web_set_read_only(on ? 1 : 0); },
    // The bytes of the arena in use and of the whole memory, for the debug log and the status bar.
    room() {
      return { used: w.kspage_web_heap_used(), all: w.kspage_web_heap_room() };
    },
    // Whether style `i` "starts a new page before it" (no effect where pages do not split).
    styleBreaks(i) { return w.kspage_web_style_breaks(i) !== 0; },
    // Replaces it, **as one undo step.**
    setStyleBreaks(i, on) {
      const took = w.kspage_web_set_style_breaks(i, on ? 1 : 0) !== 0;
      if (took) draw();
      return took;
    },
    // Whether style `i` "is included in chapters"; **false keeps it out of the contents and the
    // chapter numbers** (a title page, a colophon), though the heading map can still jump to it.
    styleInChapters(i) { return w.kspage_web_style_in_chapters(i) !== 0; },
    // Replaces it, **as one undo step.**
    setStyleInChapters(i, on) {
      const took = w.kspage_web_set_style_in_chapters(i, on ? 1 : 0) !== 0;
      if (took) draw();
      return took;
    },
    // The headings **as of the last layout**: depth 1 is a chapter, `number` is empty if none.
    headings() {
      // **It only reads** (the same rule as `paperCount`).
      const many = w.kspage_web_heading_count();
      const list = [];
      for (let i = 0; i < many; i += 1) {
        const len = w.kspage_web_heading_text(i);
        const text = outText(len);
        const nlen = w.kspage_web_heading_number(i);
        list.push({
          text: text,
          number: outText(nlen),
          level: w.kspage_web_heading_level(i),
        });
      }
      return list;
    },
    // Scrolls to height `y` in the document, **remembering the position first** (otherwise there is
    // no going back). A place with no text, such as a table of contents, is reached by height.
    goHeight(y) {
      if (y < 0) return false;
      this.markJump();
      const top = ks.canvas.getBoundingClientRect().top + y;
      window.scrollBy(0, top - (this.headRoom ? this.headRoom() : 24));
      return true;
    },
    // **What is remembered is the viewed place** (not the cursor), like a browser's back and
    // forward. Caution: **Record the current place before moving** (after, it records the target).
    markJump() {
      back.push(window.scrollY);
      // **A new jump clears the forward history** (kept, it would disagree with the path taken).
      ahead.length = 0;
    },
    // Forgets both histories, **called where a document is swapped in** (`file.js`'s `settleIn`):
    // a place in the document gone says nothing about the one now open.
    forgetPlaces() {
      back.length = 0;
      ahead.length = 0;
    },
    // Caution: **Remember the position before jumping to the document's edge**; **the cursor does
    // not move** (as from a contents row), so typing continues where you came back to.
    goStart() {
      this.markJump();
      window.scrollTo(0, 0);
      return true;
    },
    goEnd() {
      this.markJump();
      // **Do not compute the upper bound** (the browser clamps it).
      window.scrollTo(0, document.documentElement.scrollHeight);
      return true;
    },
    jumpBack() { return hop(back, ahead); },
    jumpAhead() { return hop(ahead, back); },
    // Caution: **Put the heading jumped to at the window's top** (left to following, one reached
    // from below would stick to the bottom).
    headingGo(i) {
      const moved = w.kspage_web_heading_go(i) !== 0;
      if (moved) {
        // **Remember before jumping** (after, it remembers the target).
        this.markJump();
        draw();
        if (ks.jumpToCaret) ks.jumpToCaret();
      }
      return moved;
    },
    // The note's own height for the clicked notes-list row (-1 if none; a mark sits mid-inline).
    notesHit(y) { return w.kspage_web_notes_hit(y); },
    // Opens the manual (true if it did); **the current document is not kept** (no arena needed).
    loadManual() {
      if (w.kspage_web_load_manual() === 0) return false;
      draw();
      return true;
    },
    // Adds a row or column after the cursor: **empty if added, else the reason** (the rule of
    // `setBlockStyle`).
    addLine(axis) {
      const got = w.kspage_web_add_line(axis === "column" ? 1 : 0);
      if (got === 1) {
        draw();
        return "";
      }
      if (got === -1) return "The document is open for reading alone";
      if (got === -2) return "A merged cell here already covers 1000 columns, the most one may";
      return "Click inside a table's cell";
    },
    // Deletes the cursor's row or column (false outside a table).
    dropLine(axis) {
      return acted(w.kspage_web_drop_line(axis === "column" ? 1 : 0));
    },
    // The selection's text; **a paragraph break is one newline.** Empty with nothing selected.
    selectionText() {
      const len = w.kspage_web_selection_text();
      return outText(len);
    },
    // Pastes text at the cursor: **a newline is a paragraph break** (a space in a cell).
    // Caution: **Read memory only after getting the arena** — wasm memory grows there.
    paste(text) {
      const bytes = enc.encode(text);
      if (bytes.length <= 0) return false;
      if (!handOver(bytes)) return false;
      return acted(w.kspage_web_paste(bytes.length));
    },
    // Finds and selects text (true if found); **past the end it wraps**, continuing from there.
    find(needle, back) {
      const len = stage(needle);
      if (len <= 0) return false;
      return acted(w.kspage_web_find(len, back ? 1 : 0));
    },
    // How often that text appears in the document, **without a redraw** (the selection would
    // flicker mid-typing); it can differ from the number replaced (a formula is found, not
    // replaced).
    count(needle) {
      const len = needle ? stage(needle) : 0;
      return len <= 0 ? 0 : w.kspage_web_count(len);
    },
    // Finds and replaces, returning the number replaced (**only the next when `all` is false**).
    // **The two texts share the one arena, separated by a tab**, so a tab cannot be searched for.
    replace(needle, with_, all) {
      if (!needle) return 0;
      const len = stage(`${needle}\t${with_ || ""}`);
      if (len <= 0) return 0;
      const done = w.kspage_web_replace(len, all ? 1 : 0);
      if (done > 0) draw();
      return done;
    },
    // Inserts a table or a slide after the cursor's paragraph, in the named style **the caller
    // chooses** (it travels with the document; a missing table style is made as a grid). The
    // slide's style must exist first; false in a cell; `rows` × `cols` is the size (0 is refused).
    insertTable(name, rows, cols) {
      const len = stage(name);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_table(len, rows, cols));
    },
    // **The template is not kept** (the frames belong to the document); empty if the slide went in,
    // else **the reason**, **never merged into one** (the rule of `setBlockStyle`).
    insertSurface(name, plan) {
      const len = stage(name);
      if (len <= 0) return "The style's name is too long";
      const kind = Math.max(SKETCHES.indexOf(plan), 0);
      const end = w.kspage_web_insert_surface(len, kind);
      if (end === 1) {
        draw();
        return "";
      }
      if (end === -1) return "A slide cannot stand inside a table's cell. Click outside the table";
      if (end === -2) {
        return "This document holds no slide style. A slide's size is set by its style";
      }
      if (end === -3) return "The document is open for reading alone";
      if (end === -4) return "Slides inside slides go no deeper here: blocks nest 32 levels at most";
      return "Click in the body first, and the slide goes in after that paragraph";
    },
    // Inserts one image after the cursor's paragraph, **sized by the caller**, the document holding
    // only the source. **Read memory only after getting the arena** (as `paste`).
    insertImage(src, imgW, imgH) {
      const bytes = enc.encode(src);
      if (bytes.length <= 0 || imgW <= 0 || imgH <= 0) return false;
      if (!handOver(bytes)) return false;
      return acted(w.kspage_web_insert_image(bytes.length, imgW, imgH));
    },
    // Deletes the cursor's whole container (a table, a slide, an image), **never a paragraph**.
    dropHolder() {
      return acted(w.kspage_web_drop_holder());
    },
    // Removes the cursor's frame from a slide. **The last frame is not removed** (a slide with none
    // could not be clicked into); the whole slide is `dropHolder`.
    dropFrame() {
      return acted(w.kspage_web_drop_frame());
    },
    // The speaker's notes on the cursor's slide (**empty outside one**).
    aside() {
      const len = w.kspage_web_aside();
      return outText(len);
    },
    // Attaches the speaker's notes to the cursor's slide; empty removes them.
    setAside(text) {
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return false;
      return acted(w.kspage_web_set_aside(len));
    },
    // CSV of the cursor's table, the shown text rather than formulas (**empty outside a table**).
    csv() {
      const len = w.kspage_web_csv();
      return outText(len);
    },
    // Inserts one table from CSV text after the cursor's paragraph. **Read memory after getting the
    // arena** (as `paste`); **the style name goes via the typing arena**, so load the text first.
    insertCsv(text, name) {
      const bytes = enc.encode(text);
      if (bytes.length <= 0) return false;
      if (!handOver(bytes)) return false;
      const len = stage(name);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_csv(bytes.length, len));
    },
    // Sorts the rows under the heading by the cursor's column (**the heading never moves**); `how`
    // is "down" (smallest first) or "up". Empty if sorted, else **the reason**, **never merged into
    // one** (the rule of `setBlockStyle`; merged, a merge would get "click in a cell").
    sortRows(how) {
      const end = w.kspage_web_sort_rows(how === "up" ? 1 : 0);
      if (end === 1) {
        draw();
        return "";
      }
      if (end === -1) return "Split the cell merged down the page first, then sort";
      if (end === -2) return "There are not two rows under the heading to put in order";
      if (end === -3) return "The rows are already in this order";
      if (end === -4) return "The document is open for reading alone";
      return "Click inside a table's cell";
    },
    // Copies the cell's text into the cells beyond it, up to the table's edge (autofill); `how` is
    // "down" or "right". **References inside a formula shift** (only `$A$1` stays put).
    fillAlong(how) {
      return acted(w.kspage_web_fill_along(how === "right" ? 1 : 0));
    },
    // Inserts one collecting block after the cursor's paragraph (`what` "contents" or "notes");
    // **its contents are not inserted** (built at every layout), and a missing style is made.
    insertGathered(name, what) {
      const len = stage(name);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_gathered(len, what === "notes" ? 2 : 1));
    },
    // Inserts one chart after the cursor's paragraph (`kind` "bars" / "lines"). **The range needs
    // the table's name** (`Details!C2:C4`; a chart in the flow has no table of its own), and **the
    // contents do not enter the document**. The name and range share the arena, separated by a tab.
    insertChart(name, range, kind) {
      const len = stage(`${name}\t${range}`);
      if (len <= 0) return false;
      return acted(w.kspage_web_insert_chart(len, Math.max(COLLECTS.indexOf(kind), 0)));
    },
    // The note on the cursor's inline. **Empty means none.**
    note() {
      const len = w.kspage_web_note();
      return outText(len);
    },
    // Attaches a note at the cursor (**empty removes it**); numbers are assigned when listed.
    setNote(text) {
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return false;
      return acted(w.kspage_web_set_note(len));
    },
    // The comment on the cursor's inline, and who wrote it. **Empty text means none.**
    remark() {
      const len = w.kspage_web_remark();
      return outText(len);
    },
    remarkBy() {
      const len = w.kspage_web_remark_by();
      return outText(len);
    },
    // Who writes the comments. **The page sets it** (the core holds no user name; empty, a comment
    // carries an empty "by").
    author: "",
    // Attaches a comment to the selection (a range, not a point); **empty removes it**, written by
    // `author` above.
    setRemark(text) {
      const len = stage(api.author + "\t" + text);
      if (len < 0) return false;
      return acted(w.kspage_web_set_remark(len));
    },
    // Loads an image and measures its natural size (**asynchronous**; null if unreadable).
    measureImage(src) {
      return new Promise((done) => {
        const img = new Image();
        img.addEventListener("load", () => done([img.naturalWidth, img.naturalHeight]));
        img.addEventListener("error", () => done(null));
        // **Read it where drawing reads it** (`draw.js`'s `pictureOf`), or a picture measured
        // here fails to draw, or the other way round.
        const load = api.localPicture;
        if (!load) {
          img.src = src;
          return;
        }
        // **The address is this measure's alone**, so it is released once the size is read; the
        // drawing reads its own, kept while its picture is cached.
        load(src).then((url) => {
          if (!url) {
            done(null);
            return;
          }
          if (url.startsWith("blob:")) {
            const release = () => URL.revokeObjectURL(url);
            img.addEventListener("load", release);
            img.addEventListener("error", release);
          }
          img.src = url;
        });
      });
    },
    // Whether the text may be replaced whole as a formula (a cell or a formula's inline).
    takesFormula() { return w.kspage_web_takes_formula() !== 0; },
    // The selected frame's position and size, from the slide's top left (**null if none**): the
    // frame the click landed on, since a shape has no text for the cursor. `seen` is the same frame
    // in canvas coordinates, for the handles and hit testing.
    frameRect() {
      w.kspage_web_frame_rect(scratch);
      const at = nums(9);
      if (at[8] === 0) return null;
      return {
        x: at[0], y: at[1], w: at[2], h: at[3],
        seen: { x: at[4], y: at[5], w: at[6], h: at[7] },
      };
    },
    // The step at which the selected frame appears. **0 without a frame** (0 means "always").
    frameStep() { return w.kspage_web_frame_step(); },
    // Sets the step at which the selected frame appears; true if set. **0 means "always"** (it also
    // removes the setting); **a negative value becomes 0.**
    setFrameStep(at) {
      return acted(w.kspage_web_set_frame_step(at > 0 ? at : 0));
    },
    // Places the selected frame by number (true if it did), **offset from the slide's top left**.
    placeFrame(spec) {
      return acted(w.kspage_web_place_frame(spec.x || 0, spec.y || 0,
        spec.w || 0, spec.h || 0));
    },
    // The cursor's cell frame ([x, y, w, h]) or null, after layout: ask again after a resize.
    cellFrame() {
      w.kspage_web_cell_frame(scratch);
      const [x, y, cw, ch, found] = nums(5);
      return found === 0 ? null : [x, y, cw, ch];
    },
    // Filters the cursor's table to the rows whose cell in the cursor's column matches: `kind` is a
    // name in KEEPS (`is`, `is_not`, `holds`, `above`, `below`, `blank`, `filled`), `text` a value.
    // **A view** (nothing is saved, the cursor's row is always shown); empty if it filtered, else
    // **the reason**.
    filterRows(kind, text) {
      const no = ks.KEEPS.indexOf(kind);
      const len = text.length > 0 ? stage(text) : 0;
      if (len < 0) return "The value is too long";
      const end = w.kspage_web_filter(no < 0 ? 0 : no, len);
      if (end === 1) {
        draw();
        return "";
      }
      if (end === -1) return "Type a number to compare with";
      return "Click inside a table's cell";
    },
    // What the cursor's column shows, to check a set of values: `{ values, blank, cut, chosen }` —
    // its distinct texts in its sort order, whether a cell shows nothing, whether values were cut,
    // and the set a filter keeps (null unless filtered by a set). **Null outside a cell.**
    // Caution: **Ask again after every change** (what a column shows changes with the document).
    columnValues() {
      const len = w.kspage_web_column_values();
      if (len <= 0) return null;
      try {
        return JSON.parse(outText(len));
      } catch (_) {
        return null;
      }
    },
    // Filters the cursor's column to the rows showing one of `values` ("" means the blank cells),
    // **a view**; empty if filtered, else the reason. **Choosing nothing leaves no rows**
    // (unchecking everything asks for that); the way back is `showThisColumn`.
    filterValues(values) {
      const said = values.map((v) => `${v}\n`).join("");
      const len = said.length > 0 ? stage(said) : 0;
      if (len < 0) return "There are too many values ticked to hand over at once";
      if (w.kspage_web_filter_values(len) !== 1) return "Click inside a table's cell";
      draw();
      return "";
    },
    // Opens the panel that sorts and filters the cursor's column (as its heading's arrow does).
    openNarrow() {
      return ks.narrowOpenHere() ? "" : "Click inside a table's cell";
    },
    // Filters the column to what is checked in that panel (empty, or the reason).
    narrowToTicks() {
      return this.filterValues(ks.narrowTicked());
    },
    // Removes the filter from the cursor's column only (empty, or the reason).
    showThisColumn() {
      if (w.kspage_web_unfilter_column() !== 1) return "This column is not narrowed";
      draw();
      return "";
    },
    // Shows every row of the cursor's table again (outside one, all tables): empty or the reason.
    showAllRows() {
      if (w.kspage_web_unfilter() === 1) {
        draw();
        return "";
      }
      return "No rows are narrowed";
    },
    // The rows under the heading shown: [shown, total, filtered]; null outside a table.
    rowsShown() {
      w.kspage_web_rows_shown(scratch);
      const [shown, total, narrowed, found] = nums(4);
      return found === 0 ? null : [shown, total, narrowed !== 0];
    },
    // The table heading kept in view ([table, x, y, w, h] in document coordinates, y where the band
    // sits), or null; **decided by the window's position**, so ask after scrolling.
    pinnedHead() {
      return ks.pinnedHead ? ks.pinnedHead() : null;
    },
    // The cursor's column width and row height (null outside a table): `wide` / `tall` as typed,
    // `room` the visible size; **"not set" is not 0** (0 is a valid value): `hasWide` / `hasTall`.
    // Caution: **Do not ask for the two separately** — a layout in between leaves one stale.
    cellSizes() {
      w.kspage_web_cell_sizes(scratch);
      const [wide, tall, roomW, roomH, found, hasW, hasH] = nums(7);
      return found === 0 ? null
        : { wide: wide, tall: tall, roomWide: roomW, roomTall: roomH,
          hasWide: hasW !== 0, hasTall: hasH !== 0 };
    },
    // Sets the column width (`axis` 1) or row height (0); **a negative means "unset"**, 0 is 0.
    setCellSize(axis, v) {
      return acted(w.kspage_web_set_cell_size(axis, v));
    },
    // The text a person typed in the cursor's cell (the formula, if there is one).
    // **Do not name it `source`** — on this page "source" means a program's text.
    typed() {
      const len = w.kspage_web_typed();
      return outText(len);
    },
    // Replaces that cell's whole text; a text that is too long is dropped.
    setTyped(text) {
      const len = stage(text);
      if (len < 0) return false;
      w.kspage_web_set_typed(len);
      draw();
      return true;
    },
    // The hidden input field that takes the keys, for feeding keystrokes in from outside.
    inputElement: ime,
    // The cursor's own element. **It is not inside the canvas**, so an outside check looks here.
    caretElement: bar,
    type,
    compose,
  };

  // Caution: **Put the entry points in here.** The drawing and typing code call through `ks.api`,
  // so a missing one breaks quietly as "no redraw notification arrives". **The entry points for
  // styling are not here** ([`api_look.js`](api_look.js) adds them to the same `app`).
  ks.api = api;
}

// ==========================================
// kspage's JS side — turning the document into text and text into a document (the same `app` as
// [`api.js`](api.js)): the saved form (JSON), exports (Markdown), text form (`.txt` and
// source) and reading them back.
// Caution: **Do not merge the reasons for refusing into one** — each has a different fix, so the
// core's answer is passed on as it is. **Read memory only after getting the arena** (wasm memory
// can grow there, leaving an earlier array on the old ArrayBuffer).
// ==========================================
function kspageApiIo(ks) {
  // **`cramps` is `kspage.js`'s** (one handler for full memory; with two, one skips cleanup).
  const { w, enc, outText, draw, cramps, handOver } = ks;
  Object.assign(ks.api, {
    // Makes Markdown of the current document. **It cannot be reloaded.**
    markdown() {
      const len = w.kspage_web_markdown();
      return outText(len);
    },
    // The current document as a text form; **it round-trips byte for byte** (`loadPlainText`).
    plainText() {
      const len = w.kspage_web_plain_text();
      return outText(len);
    },
    // Reads a document back from text: empty if read, otherwise **the reason for refusing** (the
    // current document stays either way).
    // Caution: **Return a reason, not a boolean, and never guess it from the size** — "cannot be
    // read" and "too large to lay out" have opposite fixes (change the text, split the document).
    load(text) {
      const bytes = enc.encode(text);
      if (!handOver(bytes)) return "too_big";
      const got = cramps(() => w.kspage_web_load(bytes.length));
      if (got === null) return "cramped";
      if (got === 0) return "broken";
      if (got < 0) return "too_big";
      draw();
      return "";
    },
    // Replaces the document with a blank one (**keeping what was there is the page's**: `file.js`
    // sets a draft aside first).
    loadBlank() {
      w.kspage_web_load_blank();
      draw();
    },
    // A new document from a text form (`.txt`, a program's source), answering as `load` does with a
    // fourth reason: **it is not text** (it holds a NUL; open it with another tool).
    // Caution: **The declaration goes before the text in the one arena**, split by length (a text
    // can hold any character, so no separator can be used). Read memory after getting the arena.
    loadPlainText(text, spoken) {
      const head = enc.encode(spoken || "");
      const body = enc.encode(text);
      const bytes = new Uint8Array(head.length + body.length);
      bytes.set(head, 0);
      bytes.set(body, head.length);
      if (!handOver(bytes)) return "too_big";
      const got = cramps(() => w.kspage_web_load_plain_text(bytes.length, head.length));
      if (got === null) return "cramped";
      if (got === 0) return "broken";
      if (got === -2) return "not_text";
      if (got < 0) return "too_big";
      draw();
      return "";
    },
  });
}
