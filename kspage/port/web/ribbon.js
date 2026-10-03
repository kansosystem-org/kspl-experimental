// ==========================================
// kspage's page — the ribbon and the tools: the table of commands shown, choosing tools,
// reordering, collapsing the overflow, collapsing the ribbon.
//
// **What a button does is the same as the menu's**: `press` clicks the menu's button (a second
// path would drift), and `run` is for what is in no menu. **Only as much as fits on one row**; a
// group that does not fit moves into `…`. **The chosen layout is remembered**, and **unreadable
// text falls back to the default** (a broken memory must not disable the tools).
// ==========================================
function kspageRibbon(ui) {
  const app = ui.app;
  const say = ui.say, tell = ui.tell, deny = ui.deny;
  const frameBoxes = [["frame-x", "x"], ["frame-y", "y"], ["frame-w", "w"], ["frame-h", "h"]];
  const framePart = (id) => document.getElementById(id);
  const frameSpec = () => {
    const spec = {};
    for (const pair of frameBoxes) {
      const box = framePart(pair[0]);
      spec[pair[1]] = box === null ? 0 : Number(box.value) || 0;
    }
    return spec;
  };
  const columnsToggle = () => {
    // **Find the style's index from its name** (a paragraph's style is stored by name).
    const face = app.blockStyle();
    const at = app.styleNames().indexOf(face);
    if (face.length <= 0 || at < 0) {
      deny("The columns land on a paragraph style. Click on some text");
      return;
    }
    const was = app.stylePara(at);
    const spec = Object.assign({}, was);
    spec.columns = was.columns > 1 ? 0 : 2;
    if (spec.columns > 1 && !(was.columnGap > 0)) spec.columnGap = 16;
    tell(app.setStylePara(at, spec), spec.columns > 1 ? "Made it two columns" : "Released the columns",
      "It cannot be made into columns");
  };

  // The menu that chooses the tools shown.
  // Caution: **Provide a way back too.** ---- The ribbon ---- (the rules are in the header; the
  // menu side handles the notice and the focus.) **This table's order is "the order of use"**: `…`
  // takes from the end, so it is the order they survive a narrow screen (`../../docs/DESIGN.md`'s
  // "The band's right side is not left empty"). A contextual group (`when`: `"cells"` in a table,
  // `"frame"` on a selected frame) goes before the others, so it stays when it appears. The shapes:
  // **a shortcut, not the list** (the menu's `shape-kind`; the numbers are `draw.js`'s `SHAPES`).
  // Caution: **The text must be a name the core knows** — an unknown name becomes number 0, so a
  // typo silently inserts a rectangle (`make test-conventions` checks it).
  const SHAPES = [
    { id: "draw-box", mark: "▭", label: "Rectangle", shape: "box" },
    { id: "draw-round", mark: "▢", label: "Rounded", shape: "round_box" },
    { id: "draw-ellipse", mark: "◯", label: "Ellipse", shape: "ellipse" },
    { id: "draw-triangle", mark: "△", label: "Triangle", shape: "triangle" },
    { id: "draw-diamond", mark: "◇", label: "Diamond", shape: "diamond" },
    { id: "draw-fall-line", mark: "＼", label: "Line", shape: "fall_line" },
    { id: "draw-fall-arrow", mark: "↘", label: "Arrow", shape: "fall_arrow" },
  ];
  // The recently used shapes.
  // Caution: **Put them first** (putting all shapes behind one button cost a click; this gives it
  // back). **It must work where nothing can be stored** (read it guarded; unreadable is empty).
  const RECENT_KEY = "kspage.shapes";
  const RECENT_MAX = 5;
  const readRecent = () => {
    try {
      const was = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (!Array.isArray(was)) return [];
      return was.filter((id) => SHAPES.some((one) => one.id === id)).slice(0, RECENT_MAX);
    } catch (_) {
      return [];
    }
  };
  let recent = readRecent();
  const keepRecent = (id) => {
    recent = [id].concat(recent.filter((one) => one !== id)).slice(0, RECENT_MAX);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch (_) { /* it works on a page that cannot remember too */ }
  };

  const RIBBON = [
    { name: "Edit", items: [
      { id: "tool-undo", mark: "↶", label: "Undo", tip: "Ctrl+Z", run: () => app.undo() },
      { id: "tool-redo", mark: "↷", label: "Redo", tip: "Ctrl+Shift+Z", run: () => app.redo() },
    ] },
    // Paragraph.
    // Caution: **Put the styles at the top level** (kspage's styling applies to a style, as in
    // Word's style gallery). Only `form.js` holds the contents.
    { name: "Paragraph", items: [
      { id: "tool-block-style", mark: "¶", label: "Paragraph style", fly: "block-style",
        at: "block-style" },
      { id: "tool-align", mark: "≡", label: "Alignment", fly: "para-align", at: "para-align" },
    ] },
    { name: "Font", items: [
      { id: "tool-bold", mark: "B", label: "Bold", tip: "Ctrl+B",
        run: () => app.accentSpan("bold") },
      { id: "tool-italic", mark: "I", label: "Italic", tip: "Ctrl+I",
        run: () => app.accentSpan("italic") },
      { id: "tool-under", mark: "U", label: "Underline", run: () => app.accentSpan("underline") },
      { id: "tool-strike", mark: "S", label: "Strikethrough", off: true,
        run: () => app.accentSpan("strike") },
      // Colors.
      // Caution: **Do not copy the list** (`form.js` holds the colors and the names). A group that
      // opens on a click: a color is "choose one and done" (the header of `fly.js`).
      { id: "tool-ink", mark: "A", label: "Font colour", fly: "paint-color", at: "paint-color" },
      { id: "tool-ink-back", mark: "▮", label: "Highlight colour", fly: "paint-back",
        at: "paint-back" },
    ] },
    { name: "File", items: [
      { id: "tool-save", mark: "⭳", label: "Save", tip: "Ctrl+S", press: "save" },
      { id: "tool-print", mark: "⎙", label: "Print", press: "print" },
      { id: "tool-export-md", mark: "⇩", label: "Markdown", press: "export-md", off: true },
    ] },
    { name: "Table", when: "cells", items: [
      { id: "tool-row", mark: "⊞", label: "Insert a row", press: "add-row" },
      { id: "tool-col", mark: "⊟", label: "Insert a column", press: "add-col" },
      { id: "tool-merge", mark: "⇥", label: "Merge cells", press: "merge-cells" },
      { id: "tool-split", mark: "⇤", label: "Unmerge cells", press: "split-cell" },
      { id: "cell-nums", nums: "cells", label: "Column width and row height" },
      // **Sorting and filtering are one button**, because they are one panel: the arrow in a
      // column's heading opens it, and this opens the same one at the cursor's column.
      { id: "tool-narrow", mark: "⊽", label: "Order and narrow", press: "narrow-here", off: true },
      { id: "tool-drop-row", mark: "⊝", label: "Delete the row", press: "drop-row", off: true },
      { id: "tool-drop-col", mark: "⊘", label: "Delete the column", press: "drop-col", off: true },
    ] },
    { name: "The selected shape", when: "frame", items: [
      { id: "frame-nums", nums: "frame", label: "Place and size" },
      { id: "tool-drop-frame", mark: "✕", label: "Delete", press: "drop-frame" },
    ] },
    { name: "Insert", items: [
      // A table is inserted at the size chosen in the Insert menu's grid (2 × 2 until chosen).
      // **The shortcut acts, as every shortcut here does**; the size is one click away in "Insert".
      { id: "tool-table", mark: "▦", label: "Table", press: "put-table" },
      { id: "tool-slide", mark: "▭", label: "Slide", press: "put-slide" },
      // **Image opens the file picker**, as Word's "Pictures" does (a web address is in the menu).
      { id: "tool-image", mark: "▨", label: "Image", press: "pick-image" },
      // A link and a comment need a field filled in, so the button goes as far as the field.
      // Caution: **Do not mix them with things that act on one click** — applied while still empty,
      // a link with no target would attach. **Do not use an emoji as the mark** (its height and
      // color stand out).
      { id: "tool-link", mark: "↗", label: "Link", at: "put-link-fly", to: "href" },
      { id: "tool-remark", mark: "✎", label: "Comment", at: "remark-fly", to: "remark-text" },
      // **Do not show one-time items by default** (a table of contents, a footnote list: they are
      // in the menus).
      { id: "tool-toc", mark: "☰", label: "Table of contents", press: "put-toc", off: true },
      { id: "tool-notes", mark: "¹", label: "Footnote list", press: "put-notes", off: true },
      // Columns. **They apply to the current paragraph's style** (there are no section breaks).
      // Caution: **Do not show it by default** — it is set on a style once and done.
      { id: "tool-columns", mark: "▥", label: "Columns", tip: "Makes the current paragraph style two columns",
        off: true, run: () => columnsToggle() },
    ] },
    // Shapes. **Clicking arms the tool**, then a drag draws it (a click alone opens the menu's).
    // Caution: **Do not list the shapes on the row one by one** — they eat the row and the eye
    // skips over them (Office puts them behind one "Shapes" too).
    { name: "Shapes", items: [
      { id: "tool-shapes", mark: "▱", label: "Shapes", gallery: true, at: "put-shape-fly" },
    ] },
    // Back and forward.
    // Caution: **Keep it separate from editing** (undo restores a change; this, the place). It is
    // the way home after a jump.
    { name: "Move", items: [
      { id: "tool-back", mark: "←", label: "Back", tip: "To the position before moving",
        run: async () => tell(await app.jumpBack(), "", "There is no further back") },
      { id: "tool-ahead", mark: "→", label: "Forward", tip: "To the position before \"Back\" moved",
        run: async () => tell(await app.jumpAhead(), "", "There is no further forward") },
    ] },
  ];
  // The remembered layout (unreadable falls back to the default, as the header says).
  // Caution: **It must work where nothing can be stored** (read it guarded).
  const TOOLS_KEY = "kspage.tools";
  const defaultPicks = () => {
    const off = [];
    for (const group of RIBBON) {
      for (const one of group.items) {
        if (one.off) off.push(one.id);
      }
    }
    return { labels: true, off: off, order: [] };
  };
  let picks = defaultPicks();
  const knownIds = new Set();
  for (const group of RIBBON) {
    for (const one of group.items) knownIds.add(one.id);
  }
  const loadPicks = () => {
    try {
      const raw = localStorage.getItem(TOOLS_KEY);
      if (!raw) return;
      const got = JSON.parse(raw);
      if (!got || typeof got !== "object" || !Array.isArray(got.off)) return;
      // **An unknown name is dropped** (a stale text must not delete every tool).
      const order = Array.isArray(got.order) ? got.order.filter((id) => knownIds.has(id)) : [];
      picks = {
        labels: got.labels !== false,
        off: got.off.filter((id) => knownIds.has(id)),
        order: order,
      };
    } catch (_) { /* it works on a page that cannot remember too */ }
  };
  const savePicks = () => {
    try {
      localStorage.setItem(TOOLS_KEY, JSON.stringify(picks));
    } catch (_) { /* it works on a page that cannot remember too */ }
  };
  loadPicks();
  const ribbon = document.getElementById("ribbon");
  // The order within a group.
  // Caution: **A tool not in the remembered order goes at the end in the table's order**, or a new
  // tool vanishes for whoever has a remembered layout.
  const sorted = (group) => {
    const rank = (one) => {
      const at = picks.order.indexOf(one.id);
      return at < 0 ? 1000 + group.items.indexOf(one) : at;
    };
    return group.items.slice().sort((a, b) => rank(a) - rank(b));
  };
  // Moves one tool forward or back within its group. **The remembered order does not cross groups**
  // (the table decides the groups' order).
  const shift = (group, id, back) => {
    const line = sorted(group).map((one) => one.id);
    const at = line.indexOf(id);
    const to = back ? at - 1 : at + 1;
    if (at < 0 || to < 0 || to >= line.length) return false;
    line.splice(to, 0, line.splice(at, 1)[0]);
    // Caution: **Keep the other groups' orders** (replacing the whole resets them).
    picks.order = picks.order.filter((one) => !line.includes(one)).concat(line);
    savePicks();
    return true;
  };
  // Makes one number field (a label with a field).
  // Caution: **Build them in one place**, or the label link and the step size drift per field.
  // The unit is px at 96dpi everywhere. **Do not take focus back mid-typing.**
  const numBox = (id, label, tip, run) => {
    const tag = document.createElement("label");
    tag.setAttribute("for", id);
    tag.textContent = label;
    const num = document.createElement("input");
    num.id = id;
    num.type = "number";
    num.step = "1";
    if (tip) {
      tag.title = tip;
      num.title = tip;
    }
    num.addEventListener("change", () => run(num));
    return [tag, num];
  };
  const putPair = (box, pair) => {
    box.appendChild(pair[0]);
    box.appendChild(pair[1]);
  };
  const numsRow = () => {
    // The selected frame's position and size.
    // Caution: **Keep the field names short** (or they eat the row's height).
    const box = document.createElement("span");
    box.className = "nums";
    for (const pair of [["frame-x", "Left"], ["frame-y", "Top"], ["frame-w", "Width"],
      ["frame-h", "Height"]]) {
      putPair(box, numBox(pair[0], pair[1], "", () => {
        tell(app.placeFrame(frameSpec()), "Placed the shape", "No shape is selected");
      }));
    }
    // The step at which it appears. 0 means "always shown", which also removes the setting.
    // Caution: **Do not call it "stage"** — everywhere else says "step" (`../../docs/DESIGN.md`'s
    // "The vocabulary is one").
    const step = numBox("frame-step", "Step", "Which step to show it at (0 shows it always)", (num) => {
      tell(app.setFrameStep(Number(num.value) || 0),
        "Set the step to show it at", "No shape is selected");
    });
    step[1].min = "0";
    putPair(box, step);
    return box;
  };
  // The width of the cursor's column and the height of its row.
  // **Emptying it means "unset"** (back to fitting the contents), passed as a negative since 0 is a
  // value. The pale number shown when empty is **the size visible now**.
  const cellNumsRow = () => {
    const box = document.createElement("span");
    box.className = "nums";
    for (const one of [["cell-w", "Column width", 1], ["cell-h", "Row height", 0]]) {
      const pair = numBox(one[0], one[1], "Empty it and it fits the contents (the unit is px)", (num) => {
        const gone = num.value === "";
        tell(app.setCellSize(one[2], gone ? -1 : Number(num.value) || 0),
          gone ? "Put it back to fitting the contents" : "Set the size",
          "Put the cursor inside a table's cell");
      });
      pair[1].min = "0";
      putPair(box, pair);
    }
    return box;
  };
  const NUMS_ROWS = { frame: numsRow, cells: cellNumsRow };
  // Copies the current values into the fields.
  // Caution: **Do not rewrite mid-typing** (the same reason as the formula field).
  // **Clear the value when there is no setting**, or an untouched field would apply the visible
  // number to the next cell.
  const showCellSizes = () => {
    const now = app.cellSizes();
    if (now === null) {
      return;
    }
    for (const one of [["cell-w", "wide", "hasWide", "roomWide"],
      ["cell-h", "tall", "hasTall", "roomTall"]]) {
      const num = framePart(one[0]);
      if (num === null || document.activeElement === num) {
        continue;
      }
      num.value = now[one[2]] ? Math.round(now[one[1]]) : "";
      num.placeholder = Math.round(now[one[3]]);
    }
  };
  // Rebuilds the ribbon.
  // Caution: **Wire the clicks here too** (rebuilding deletes the earlier elements). Arming a
  // shape: **click the same one again and it disarms**; a second click keeps it armed after
  // drawing. **Remember the clicked shape** (it leads the collapsed list).
  const armShape = (one) => {
    const on = app.armed && app.armed.id === one.id;
    app.arm(on && app.armed.lock ? null : {
      id: one.id, shape: one.shape, label: one.label,
      name: "figure-" + one.shape, lock: on, group: "tool-shapes",
    });
    if (app.armed) keepRecent(one.id);
    say(app.armed
      ? (app.armed.lock ? one.label + ": held down (Esc releases it)"
        : one.label + ": drag on a slide to draw")
      : "");
    app.focus();
  };

  // The list of shapes.
  // **Rebuild it on every opening** (the recent shapes change).
  const fillGallery = (box) => {
    box.textContent = "";
    const rows = [];
    if (recent.length > 0) {
      rows.push({ name: "Shapes used recently", ids: recent });
    }
    rows.push({ name: "Shapes", ids: SHAPES.map((one) => one.id) });
    for (const row of rows) {
      const title = document.createElement("span");
      title.textContent = row.name;
      box.appendChild(title);
      const line = document.createElement("div");
      line.className = "row shapes";
      for (const id of row.ids) {
        const one = SHAPES.find((s) => s.id === id);
        const key = document.createElement("button");
        // Caution: **Do not give the number button the id** — a shape also shows under "used
        // recently", so the earlier item holds the id (both call `armShape`).
        if (row === rows[rows.length - 1]) key.id = one.id;
        key.type = "button";
        key.title = one.label;
        key.textContent = one.mark + " " + one.label;
        key.addEventListener("click", () => armShape(one));
        line.appendChild(key);
      }
      box.appendChild(line);
    }
  };

  const drawRibbon = () => {
    ribbon.textContent = "";
    ribbon.className = picks.labels ? "" : "bare";
    for (const group of RIBBON) {
      const shown = sorted(group).filter((one) => !picks.off.includes(one.id));
      if (shown.length <= 0) continue;
      const box = document.createElement("div");
      box.className = "group";
      box.title = group.name;
      if (group.when) box.dataset.when = group.when;
      for (const one of shown) {
        if (one.nums) {
          box.appendChild(NUMS_ROWS[one.nums]());
          continue;
        }
        // The list of shapes starts collapsed.
        // **Make its opener look like a ribbon button.**
        if (one.gallery) {
          const menu = document.createElement("details");
          menu.className = "menu";
          // Caution: **It must be reachable from where it overflowed to** (an opener cannot be
          // copied; `fitRibbon` below).
          menu.dataset.at = one.at;
          menu.dataset.label = one.label;
          const tab = document.createElement("summary");
          tab.id = one.id;
          tab.title = one.label;
          const face = document.createElement("span");
          face.className = "mark";
          face.textContent = one.mark;
          const said = document.createElement("span");
          said.className = "label";
          said.textContent = one.label;
          tab.appendChild(face);
          tab.appendChild(said);
          menu.appendChild(tab);
          const items = document.createElement("div");
          items.className = "items";
          menu.appendChild(items);
          // **Build it before opening** (`toggle` fires later, and it would open empty).
          fillGallery(items);
          tab.addEventListener("click", () => fillGallery(items));
          box.appendChild(menu);
          continue;
        }
        // A group that opens.
        // Caution: **Do not copy the contents here** — the choices and their actions are only
        // `form.js`'s (Principle 4). Its menu twin shares the document's value and the mark.
        if (one.fly) {
          const hold = document.createElement("span");
          hold.className = "fly-host";
          // Caution: **It must be reachable from where it overflowed to** — in `…` a copy would not
          // open, so it goes to the menu's twin.
          hold.dataset.at = one.at;
          hold.dataset.label = one.label;
          box.appendChild(hold);
          ui.putFly(hold, one.fly, one.id, one.label);
          // Caution: **Give it a mark**, or `bare` leaves an empty button. **Set the name and the
          // current value as labels**, or this alone keeps its name when collapsed.
          const open = hold.querySelector(".fly-open");
          const face = document.createElement("span");
          face.className = "mark";
          face.textContent = one.mark;
          open.insertBefore(face, open.firstChild);
          for (const part of open.querySelectorAll(".fly-name, .fly-now")) {
            part.classList.add("label");
          }
          // Caution: **Open it on click.** Opening on hover alone fails on a touch screen (there is
          // no hover). The rule is `page.css`'s `.fly-on`. A second click closes it. **Only one
          // opens.** One function closes them, `page.js`'s `shutTools`, for a click outside and Esc
          // too.
          const fly = hold.querySelector(".fly");
          open.addEventListener("click", () => {
            const was = fly.classList.contains("fly-on");
            ui.shutTools(null);
            if (!was) fly.classList.add("fly-on");
          });
          continue;
        }
        const key = document.createElement("button");
        key.id = one.id;
        key.type = "button";
        key.title = one.tip ? one.label + " (" + one.tip + ")" : one.label;
        key.setAttribute("aria-label", one.label);
        const mark = document.createElement("span");
        mark.className = "mark";
        mark.textContent = one.mark;
        const name = document.createElement("span");
        name.className = "label";
        name.textContent = one.label;
        key.appendChild(mark);
        key.appendChild(name);
        key.addEventListener("click", (e) => {
          if (one.press) {
            document.getElementById(one.press).click();
            return;
          }
          // Caution: **An item that fills a field only goes there** (`page.js`'s `reach`), or a
          // link with no target would attach. **Stop the click here** — it would bubble to the rule
          // that closes panels on any click (`page.js`), and the panel would open and close in one
          // click, looking dead.
          if (one.at) {
            e.stopPropagation();
            ui.reach(one.at, one.to);
            return;
          }
          one.run();
          app.focus();
        });
        box.appendChild(key);
      }
      ribbon.appendChild(box);
    }
  };
  // Moves the groups that do not fit into `…`.
  // Caution: **Do not add a row to fit them** (it cuts into the body). **Move whole groups**, so no
  // group splits between the row and `…`, **from the end** (the table is in order of use).
  // Wherever an item ends up, clicking it is the same (it clicks the ribbon's button as it is).
  const spill = document.getElementById("spill");
  const spillBox = spill.querySelector(".items");
  // **Decide the groups shown before calling** (the contextual groups first); this only collapses
  // the trailing groups that do not fit. **Do not measure with `scrollWidth`** — a `clip` box does
  // not scroll (`page.css`'s `#ribbon`), and where it reports no overflow nothing ever moves into
  // `…`. The right edge of the shown groups is measured (groups do not shrink).
  const fits = () => {
    const room = ribbon.getBoundingClientRect().left + ribbon.clientWidth;
    for (const box of ribbon.children) {
      if (box.hidden) continue;
      if (box.getBoundingClientRect().right > room + 1) return false;
    }
    return true;
  };
  const fitRibbon = () => {
    spillBox.textContent = "";
    const boxes = Array.from(ribbon.children);
    // Caution: **Measure without `…` first**, or at a width that just fits, one more group moves.
    spill.hidden = true;
    if (!ribbon.hidden && !fits()) {
      spill.hidden = false;
      for (let i = boxes.length - 1; i >= 0; i -= 1) {
        if (fits()) break;
        const box = boxes[i];
        if (box.hidden) continue;
        box.hidden = true;
        // Caution: **Copy them in the row's order** (not buttons and openers separately).
        for (const part of box.children) {
          // **Do not copy an opener (a color group, the list of shapes) as it is** — the copy would
          // not open (Principle 5); it goes to the menu's twin.
          const jump = part.dataset.at !== undefined;
          const key = jump ? null : part;
          if (!jump && key.tagName !== "BUTTON") continue;
          const copy = document.createElement("button");
          copy.type = "button";
          copy.textContent = (box.title ? box.title + ": " : "")
            + (jump ? part.dataset.label : key.getAttribute("aria-label"));
          copy.addEventListener("click", () => {
            spill.open = false;
            if (jump) {
              ui.reach(part.dataset.at);
              return;
            }
            key.click();
          });
          spillBox.appendChild(copy);
        }
      }
    }
    spill.hidden = spillBox.children.length <= 0;
    if (spill.hidden) spill.open = false;
  };
  const picksBox = document.getElementById("tool-picks");
  const labelsBox = document.getElementById("show-labels");
  // The filter text.
  // Caution: **It must match both a group's name and a tool's name.**
  const findBox = document.getElementById("tool-find");
  const matches = (group, one) =>
    findBox.value.length <= 0
      || (group.name + " " + one.label).indexOf(findBox.value) >= 0;
  const drawPicks = () => {
    picksBox.textContent = "";
    labelsBox.checked = picks.labels;
    for (const group of RIBBON) {
      const shown = sorted(group).filter((one) => matches(group, one));
      if (shown.length <= 0) continue;
      // Caution: **Show a heading per group**, so the list mirrors the ribbon's groups.
      const head = document.createElement("h4");
      head.textContent = group.name;
      picksBox.appendChild(head);
      for (const one of shown) {
        const tag = document.createElement("label");
        const tick = document.createElement("input");
        tick.type = "checkbox";
        // Caution: **Identify the tool by a data attribute** (by name, a rewording breaks it).
        tick.dataset.tool = one.id;
        tick.checked = !picks.off.includes(one.id);
        tick.addEventListener("change", () => {
          picks.off = picks.off.filter((id) => id !== one.id);
          if (!tick.checked) picks.off.push(one.id);
          savePicks();
          drawRibbon();
          if (app.onRedraw) app.onRedraw();
        });
        tag.appendChild(tick);
        tag.appendChild(document.createTextNode(" " + one.label + " "));
        // Reordering, one place per click, **only within a group** (the table orders the groups).
        for (const way of [["▲", true], ["▼", false]]) {
          const key = document.createElement("button");
          key.type = "button";
          key.className = "lift";
          key.textContent = way[0];
          key.title = way[1] ? "Forward" : "Back";
          key.addEventListener("click", (e) => {
            // **Do not let a click inside a label reach its checkbox** (a tool would vanish).
            e.preventDefault();
            e.stopPropagation();
            if (!shift(group, one.id, way[1])) return;
            drawRibbon();
            drawPicks();
            if (app.onRedraw) app.onRedraw();
          });
          tag.appendChild(key);
        }
        picksBox.appendChild(tag);
      }
    }
  };
  findBox.addEventListener("input", () => drawPicks());
  labelsBox.addEventListener("change", () => {
    picks.labels = labelsBox.checked;
    savePicks();
    drawRibbon();
    if (app.onRedraw) app.onRedraw();
  });
  document.getElementById("tools-reset").addEventListener("click", () => {
    picks = defaultPicks();
    savePicks();
    drawRibbon();
    drawPicks();
    if (app.onRedraw) app.onRedraw();
    say("Put the ribbon back to the default");
  });
  // Collapses the ribbon. **The collapsed state is remembered too.**
  const FOLD_KEY = "kspage.folded";
  const foldKey = document.getElementById("fold-ribbon");
  const showFold = () => {
    ribbon.hidden = picks.folded === true;
    foldKey.textContent = picks.folded ? "⌄" : "⌃";
    foldKey.title = picks.folded ? "Put the ribbon out" : "Fold the ribbon";
  };
  try {
    picks.folded = localStorage.getItem(FOLD_KEY) === "1";
  } catch (_) { picks.folded = false; }
  foldKey.addEventListener("click", () => {
    picks.folded = !picks.folded;
    try {
      localStorage.setItem(FOLD_KEY, picks.folded ? "1" : "0");
    } catch (_) { /* it works on a page that cannot remember too */ }
    showFold();
    app.focus();
  });
  drawRibbon();
  drawPicks();
  showFold();
  return {
    frameBoxes: frameBoxes,
    showCellSizes: showCellSizes,
    framePart: framePart,
    fitRibbon: fitRibbon,
    ribbon: ribbon,
  };
}
