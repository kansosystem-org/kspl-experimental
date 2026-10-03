// ==========================================
// kspage's JS side — clicks and typing: it passes the clicked place, the typed key and the text
// being composed to the wasm. **No movement logic is here** (the cursor's movement and the
// selection are the wasm's). **Only the hidden input field takes the keys, and only its `input`
// takes the characters** (the reasons are at those two listeners).
// Split off for the 1000-line-per-file cap (Principle 3): [`draw.js`](draw.js) makes the cursor's
// canvas and the input field, and this file connects the keys to them.
// ==========================================
function kspageKeys(ks) {
  const { w, mem, canvas, enc, str, draw, ime, bar, blink, moveCaret, moveIme,
  nudgeFrame, ARROW_STEPS, scratch, nums } = ks;

  // The non-character keys pressed, newest last and **capped**, for the debug log (the history
  // holds only changes, so Enter, an arrow that did not move and F4 leave no trace).
  // Caution: **A character key is not recorded** (it is the document's contents, which the log
  // never carries); a longer key name, or a key held with Ctrl, Alt or Meta, is.
  const pressed = [];
  const pressedMax = 40;
  const notePress = (e) => {
    const mod = (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.metaKey ? "Meta+" : "");
    if (mod === "" && e.key.length <= 1) return;
    const named = mod === "" ? e.key : mod + (e.key.length <= 1 ? "(a character)" : e.key);
    pressed.push((e.shiftKey && e.key !== "Shift" ? "Shift+" : "") + named);
    if (pressed.length > pressedMax) pressed.shift();
  };
  ks.api.pressedKeys = () => pressed.slice();

  // The styles that have a shortcut (Ctrl+B / I / U in every product). **The texts also appear in
  // the menu items**, so do not add to one side only (`form.js`'s `keys`).
  const ACCENT_KEYS = { b: "bold", i: "italic", u: "underline" };

  // Copies text into the wasm's buffer: the length, or -1 (nothing copied) if it does not fit.
  function stage(text) {
    const bytes = enc.encode(text);
    const cap = w.kspage_web_input_cap();
    if (bytes.length > cap) return -1;
    new Uint8Array(mem.buffer, w.kspage_web_input_buffer(), cap).set(bytes);
    return bytes.length;
  }

  // The current time **in local time**, to the minute (to the second, one burst of typing splits).
  function nowText() {
    const t = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return t.getFullYear() + "-" + p(t.getMonth() + 1) + "-" + p(t.getDate())
      + " " + p(t.getHours()) + ":" + p(t.getMinutes());
  }

  // A pause between keystrokes ends the undo step (else undo goes one keystroke at a time) and
  // stamps the history. **The core has no clock**: the pause, time and name are decided here.
  let idleTimer = 0;
  function armGroupBreak() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      w.kspage_web_break_undo_group();
      ks.api.stampTrail();
    }, 700);
  }

  function type(text) {
    // Caution: **No typing while presenting** — keys advance, but `input` and pastes come here too.
    if (ks.showing >= 0) return;
    const len = stage(text);
    if (len <= 0) return;
    w.kspage_web_type(len);
    armGroupBreak();
    draw();
  }

  // Replaces the text being composed. **It is not kept in the document until committed.**
  function compose(text) {
    if (ks.showing >= 0) return;
    const len = stage(text);
    if (len < 0) return;
    w.kspage_web_compose(len);
    draw();
  }

  // Caution: **Do not put zoom between** a click and canvas coordinates: the document's unit is one
  // CSS pixel, so a subtraction is enough (zoom is left to the browser).
  const spotOf = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  // Whether that point is inside the selection, **box by box** (a selection breaks per line, so one
  // enclosing box would make the space right of a wrap "selected").
  const inPick = (x, y) => {
    const many = w.kspage_web_selection_count();
    for (let i = 0; i < many; i += 1) {
      w.kspage_web_selection_rect(i, scratch);
      const [rx, ry, rw, rh] = nums(4);
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) return true;
    }
    return false;
  };
  // Whether a text drag is in progress (it extends the selection while pressed).
  let dragging = false;
  // Whether a column border is being dragged (separate from selecting text).
  let sizing = false;
  // Whether a slide's frame is being dragged.
  let framing = false;

  canvas.addEventListener("pointerdown", (e) => {
    // A click while composing commits it first (once the cursor moves, its position is lost).
    w.kspage_web_compose_commit();
    // **While presenting it only advances** (the zoomed, offset coordinates would point elsewhere).
    if (ks.showing >= 0) {
      ks.api.stepAhead();
      return;
    }
    const [x, y] = spotOf(e);
    // Caution: **Grab nothing on a right click** (it opens the context menu; grabbing a handle or a
    // border would resize a frame). **On the selection the cursor does not move** (the selection
    // would vanish); outside it the cursor moves, since the menu's items act where the cursor is.
    if (e.button === 2) {
      if (!inPick(x, y)) {
        w.kspage_web_click(x, y, 0);
        draw();
      }
      return;
    }
    // **The armed tool comes first of all** (otherwise the drawing's start would move the cursor).
    if (ks.api.armed) {
      ks.drawn = { x0: x, y0: y, x1: x, y1: y };
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) { /* uncaptured, the press goes on */ }
      return;
    }
    // **It follows a link only with Ctrl (⌘) held** (a plain click places the cursor).
    if (e.ctrlKey || e.metaKey) {
      // Caution: **A link to the source must not open a window** (`src:` means text shown only on
      // this screen): the page shows it (`onSource`), or it stays unopened.
      const aim = ks.api.sourceAt(x, y);
      if (aim !== null) {
        if (ks.api.onSource) ks.api.onSource(aim);
        return;
      }
      const to = ks.api.hrefAt(x, y);
      if (to.length > 0) {
        window.open(to, "_blank", "noopener");
        return;
      }
    }
    // **The arrow in a table's heading comes first** (in a cell; passed on, it moves the caret).
    if (ks.narrowAt) {
      const arrow = ks.narrowAt(x, y);
      if (arrow !== null) {
        ks.narrowOpenAt(arrow);
        return;
      }
    }
    // **A double click on a border fits it to its contents** (as in Excel and Calc; `detail`
    // counts consecutive clicks, so no clock of our own).
    // Caution: **Check it before grabbing** (grabbed first, it starts an empty drag, no fitting).
    if (e.detail === 2 && w.kspage_web_edge_at(x, y) !== 0) {
      if (w.kspage_web_fit_edge(x, y) !== 0) draw();
      return;
    }
    // **A cell border comes first** (otherwise clicking it moves the cursor and the drag selects).
    if (w.kspage_web_grab_edge(x, y) !== 0) {
      sizing = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) { /* uncaptured, the press goes on */ }
      return;
    }
    // **A frame's handle comes before the text too** (Shift adds to or removes from the selection).
    if (w.kspage_web_grab_frame(x, y) !== 0) {
      framing = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (_) { /* uncaptured, the press goes on */ }
      return;
    }
    // A contents row jumps to its chapter, **checked before placing the cursor** (its box points at
    // no text, so the click would look dead); **not with Shift held** (mid-selection).
    if (!e.shiftKey) {
      const head = w.kspage_web_contents_hit(y);
      // Caution: **Go through the api** — called directly, remembering the place and scrolling it
      // to the window's top would get a second copy, and only one would be kept up to date.
      if (head >= 0 && ks.api.headingGo(head)) {
        return;
      }
      // A notes-list row jumps to where that note is attached (the same reason as a contents row).
      const back = ks.api.notesHit(y);
      if (back >= 0 && ks.api.goHeight(back)) {
        return;
      }
    }
    // With Shift held it keeps the anchor and extends the selection.
    w.kspage_web_click(x, y, e.shiftKey ? 1 : 0);
    dragging = true;
    // Caution: **Capture, but carry on if it fails** (a target that cannot be captured throws, and
    // the click must not fail with it just for a drag's convenience).
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) { /* uncaptured, the press goes on */ }
    draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (ks.showing >= 0) return;
    const [x, y] = spotOf(e);
    if (ks.drawn) {
      ks.drawn.x1 = x;
      ks.drawn.y1 = y;
      // **Shift fixes the aspect ratio** (a shape has no ratio before it is drawn, so it is 1:1).
      ks.drawn.square = e.shiftKey;
      draw();
      return;
    }
    if (sizing) {
      w.kspage_web_drag_edge(x, y);
      draw();
      return;
    }
    if (framing) {
      // **Shift fixes the aspect ratio** (as in other products), only on a corner.
      w.kspage_web_drag_frame(x, y, e.shiftKey ? 1 : 0);
      draw();
      return;
    }
    if (!dragging) {
      // Not pressed, only the pointer's shape changes over a border or a handle, per direction.
      if (ks.api.armed) {
        canvas.style.cursor = "crosshair";
        return;
      }
      // Over a contents or notes-list row the pointer shows it can be clicked, **checked before the
      // borders and handles** (the rows' box points at no text, so the border check would miss).
      if (w.kspage_web_contents_hit(y) >= 0 || w.kspage_web_notes_hit(y) >= 0) {
        canvas.style.cursor = "pointer";
        return;
      }
      const edge = w.kspage_web_edge_at(x, y);
      const grip = edge !== 0 ? 0 : w.kspage_web_grip_at(x, y);
      // Caution: **A one-direction arrow on an edge handle** (a diagonal says both change); a
      // corner has two: top left and bottom right ↖↘, top right and bottom left ↗↙.
      canvas.style.cursor = grip !== 0
        ? ["", "move", "nwse-resize", "ew-resize", "ns-resize", "nesw-resize"][grip]
        : ["text", "col-resize", "row-resize"][edge];
      return;
    }
    w.kspage_web_click(x, y, 1);
    draw();
  });
  const endDrag = () => {
    // One shape of the dragged size, **not drawn if too small** (an invisible shape could not be
    // deleted, the handles being the only way); on a click alone the tool stays armed.
    if (ks.drawn) {
      // Caution: **Place it by the shown band's geometry** (`bandRect`), or it jumps on release.
      const band = ks.bandRect();
      ks.drawn = null;
      if (band.w >= 4 && band.h >= 4) {
        const made = ks.api.drawShape(ks.api.armed.name, ks.api.armed.shape, band.x, band.y,
          band.w, band.h);
        // Caution: **Report a failure too** (silence reads as dead, as a drag outside a slide).
        if (ks.api.onDraw) ks.api.onDraw(made);
        // **Disarm the tool once drawn** (otherwise the next click grows a shape); `lock` keeps it.
        if (!ks.api.armed.lock) ks.api.arm(null);
      }
      draw();
      return;
    }
    // Caution: **End the undo step on release**, or it undoes together with the next typing.
    if (sizing) {
      w.kspage_web_release_edge();
    }
    if (framing) {
      w.kspage_web_release_frame();
    }
    sizing = false;
    framing = false;
    dragging = false;
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  ime.addEventListener("compositionstart", () => { ks.composing = true; });
  ime.addEventListener("compositionupdate", (e) => { compose(e.data || ""); });
  // Caution: **A cancelled composition is not a commit** — with Esc, `data` comes empty, and
  // committing `compose("")` would pass nothing; cancelling has its own entry point.
  ime.addEventListener("compositionend", (e) => {
    ks.composing = false;
    if (e.data) {
      compose(e.data);
      w.kspage_web_compose_commit();
    } else {
      w.kspage_web_compose_cancel();
    }
    ime.value = "";
    draw();
  });
  // **The only place typed characters go in**, composed or not (in the key handler too, a key
  // would go in twice). **A paste does not come here** (`data` is null); `paste` takes it.
  ime.addEventListener("input", (e) => {
    if (ks.composing || e.isComposing) return;
    if (e.data) type(e.data);
    ime.value = "";
  });

  // **Handle copy and cut**: the hidden input field is empty, so the browser's own copy takes
  // nothing. **Handle paste too**: by default it goes into the hidden field, not the body.
  const putClip = (e) => {
    const picked = ks.api.selectionText();
    if (picked.length <= 0) return false;
    e.clipboardData.setData("text/plain", picked);
    e.preventDefault();
    return true;
  };
  ime.addEventListener("copy", (e) => { putClip(e); });
  ime.addEventListener("cut", (e) => {
    if (putClip(e)) {
      w.kspage_web_backspace();
      draw();
    }
  });
  ime.addEventListener("paste", (e) => {
    e.preventDefault();
    ks.api.paste(e.clipboardData.getData("text/plain"));
  });
  // A canvas click gives the keys to the hidden input, **with `preventDefault`** (or focus moves).
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ime.focus();
  });

  // Caution: **The key handler takes no characters**: the key that starts a composition comes with
  // `isComposing` still false, so the IME would compose it too. Only `input` inserts characters.
  const onKey = (e) => {
    // Keys while composing belong to the IME. Taking them would stop the composition.
    if (ks.composing || e.isComposing) return;
    // **Record it before anything acts**, so a key that returns early is in the log too.
    notePress(e);
    // Caution: **Block typing while presenting** (the document would change unintentionally).
    if (ks.showing >= 0) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") {
        // **Where a step is left, advance the step** (`api.js`'s `stepAhead`).
        ks.api.stepAhead();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        ks.api.stepBack();
      } else if (e.key === "n" || e.key === "N") {
        // The speaker's notes, **a key only while presenting** (in editing, N is a character),
        // passed to the page through a callback (like `onDraw` / `onArm`).
        if (ks.api.onNote) ks.api.onNote();
      } else if (e.key === "Escape") {
        ks.api.present(-1);
      } else { return; }
      e.preventDefault();
      return;
    }
    const ext = e.shiftKey ? 1 : 0;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      // Ctrl+Shift+Z redoes too (a Mac cannot press Ctrl+Y); the boundary redraws.
      e.preventDefault();
      if (e.shiftKey) { ks.api.redo(); } else { ks.api.undo(); }
      return;
    }
    else if (mod && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      ks.api.redo();
      return;
    }
    // **F4 repeats the last command** at the cursor (Excel's second key, free in a page);
    // **redo keeps Ctrl+Y** (Excel and Word put both on one key, so which one runs is unclear).
    // Caution: **Say why when it refuses** (a key that silently works only sometimes annoys).
    else if (e.key === "F4" && !mod) {
      e.preventDefault();
      if (ks.api.words) ks.api.words(ks.api.again());
      else ks.api.again();
      return;
    }
    // **Ctrl+K opens the link field** (as in Word, Excel and PowerPoint), the selection as the
    // text; **not bound to the key itself** (with the field empty, a link to nowhere would attach).
    else if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (ks.api.reach) ks.api.reach("put-link-fly", "href");
      return;
    }
    // Bold, italic, underline: each press toggles between "set" and "the parent's".
    // Caution: **Read the applied style and replace only that field** — replaced whole without
    // reading, the color or the underline would be lost.
    else if (mod && ACCENT_KEYS[e.key.toLowerCase()] !== undefined) {
      e.preventDefault();
      ks.api.accentSpan(ACCENT_KEYS[e.key.toLowerCase()]);
      return;
    }
    // **Esc disarms the armed tool** (else the body cannot be clicked until something is drawn).
    else if (e.key === "Escape" && ks.api.armed) {
      e.preventDefault();
      ks.api.arm(null);
      return;
    }
    // **The selected shape comes first**: holding no text, it has no cursor, and this is the one
    // key that deletes it (a frame holding text returns 0 and goes on to delete one character).
    else if ((e.key === "Delete" || e.key === "Backspace") && ks.api.dropPicked()) {
      e.preventDefault();
      return;
    }
    else if (e.key === "Backspace") { w.kspage_web_backspace(); }
    // **Delete removes the next character**; at a paragraph's end it joins the next (not in cells).
    else if (e.key === "Delete") { w.kspage_web_delete(); }
    // **Enter splits the paragraph**; in a table cell it moves down a row (Shift+Enter up, as
    // Excel's Enter), adding one past the last row as Tab does. Backspace at the start joins back.
    else if (e.key === "Enter") {
      if (w.kspage_web_split_block() === 0) w.kspage_web_move_row(ext);
    }
    // **An arrow with Alt held moves the selected frame** (with Shift it resizes), 1px per press or
    // 10px with Ctrl — the fine control, acting on the same values as the number fields.
    else if (e.altKey && ARROW_STEPS[e.key] !== undefined) {
      const way = ARROW_STEPS[e.key];
      const step = mod ? 10 : 1;
      nudgeFrame(way[0] * step, way[1] * step, e.shiftKey);
    }
    else if (e.key === "ArrowLeft") { w.kspage_web_move(-1, ext); }
    else if (e.key === "ArrowRight") { w.kspage_web_move(1, ext); }
    // Up and down move over the laid-out lines (before a layout, the previous layout's).
    else if (e.key === "ArrowUp") { w.kspage_web_move_line(-1, ext); }
    else if (e.key === "ArrowDown") { w.kspage_web_move_line(1, ext); }
    // **Home and End stay in the container** (in a table row they stop inside the cell).
    else if (e.key === "Home") { w.kspage_web_move_edge(-1, ext); }
    else if (e.key === "End") { w.kspage_web_move_edge(1, ext); }
    // Caution: **Take over Ctrl+A**, or the window selects the whole page and nothing in the body.
    else if (mod && (e.key === "a" || e.key === "A")) { w.kspage_web_select_all(); }
    // **Tab moves only inside a table** (outside, focus goes to the next field, or the page could
    // not be used by keyboard); **no tab is typed as a character** (nothing defines its width).
    else if (e.key === "Tab") {
      if (w.kspage_web_move_cell(ext) === 0) return;
    }
    else { return; }
    e.preventDefault();
    draw();
  };
  // **On the input field, not the canvas** (focused on the canvas, the IME does not start).
  ime.addEventListener("keydown", onKey);

  // The entry points the other parts use.
  ks.stage = stage;
  ks.type = type;
  ks.compose = compose;
  ks.nowText = nowText;
  ks.armGroupBreak = armGroupBreak;
}
