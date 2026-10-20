// The tools' height, the ribbon's sets, the tidings band and the right list, and the look.

function kspageProbeRibbon(ks) {
  const { check, app, canvas, ime, spot, press, pressAt, keyIn, openMenu, findCell } = ks;

  // 28''. That the tools at the top eat no height, and can be folded.
  //
  // **This can be seen nowhere else.** The height and the folding are the DOM's side
  // (it breaks as "two thirds of the window is all that is seen of the body"). **Lay a cap down.**
  // Every row added shaves the body's width, so it is made to fall once they grow.
  const chromeBox = document.getElementById("chrome");
  const chromeTall = () => Math.round(chromeBox.getBoundingClientRect().height);
  const chromeCap = 140;
  check(chromeTall() <= chromeCap,
    "the tools at the top are within " + chromeCap + "px (" + chromeTall() + ")");
  // The formula field comes out only when usable (always laid, it wastes a row's height).
  press(20, 20);
  check(document.getElementById("formula-row").hidden,
    "over the body the formula field does not come out");
  // It can be folded. **Folded, the height must go down.**
  const ribbonBox = document.getElementById("ribbon");
  const wasTall = chromeTall();
  document.getElementById("fold-ribbon").click();
  check(ribbonBox.hidden, "the ribbon can be folded");
  check(chromeTall() < wasTall,
    "folding it takes the height down (" + chromeTall() + " < " + wasTall + ")");
  document.getElementById("fold-ribbon").click();
  check(!ribbonBox.hidden && chromeTall() === wasTall, "pressing again puts it back");
  // **The ribbon is the same on every screen**: no tool is chosen, hidden, moved or stripped of
  // its name by the viewer. So the ⚙ panel holds no place for it, and a tool's name is out.
  for (const id of ["tool-picks", "show-labels", "tool-find", "tools-reset"]) {
    check(document.getElementById(id) === null, "there is no ribbon setting " + id);
  }
  check(document.querySelector("#ribbon .label").getBoundingClientRect().width > 0,
    "the tools' names are out");
  // Caution: **A name must be one to one.** Several places get a tool by its name.
  const twice = [];
  const seenIds = new Set();
  for (const one of document.querySelectorAll("#ribbon [id^=\"tool-\"]")) {
    if (seenIds.has(one.id)) twice.push(one.id);
    seenIds.add(one.id);
  }
  check(twice.length === 0,
    "the tools' names are one to one (" + twice.join(" / ") + ")");

  // 28'''. That a set which does not fit falls into the `…`.
  //
  // **This can be seen nowhere else**: what overflows is settled by the window's width. **What
  // opens (the colour sets, the shape lists) cannot be copied**, so a row with no name ("Shapes:
  // null") is looked for here.
  ribbonBox.style.maxWidth = "260px";
  app.onRedraw();
  const spillRows = Array.from(document.querySelectorAll("#spill .items button"));
  check(spillRows.length > 0,
    "narrowed, a set falls into the … (" + spillRows.length + " rows)");
  const blankRow = spillRows.filter((one) => one.textContent.indexOf("null") >= 0
    || one.textContent.trim().length === 0);
  check(blankRow.length === 0,
    "every row in the … holds a name ("
      + blankRow.map((one) => one.textContent).join(" / ") + ")");
  ribbonBox.style.maxWidth = "";
  app.onRedraw();

  // 28''. The sets inside the ribbon that open (colours, styles, landing).
  //
  // **This can be seen nowhere else**: the direction it opens, and its marks matching the menu's
  // same set. **See that the content is not copied** — copied, they fall out of step once one alone
  // changes.
  const inkRibbon = document.getElementById("tool-ink");
  check(inkRibbon !== null && inkRibbon.classList.contains("fly"),
    "the text colour is a ribbon set that opens");
  check(ks.flyLabels("tool-ink").join("/") === ks.flyLabels("paint-color").join("/"),
    "the colours lined up in the ribbon and the menu are the same ("
      + ks.flyLabels("tool-ink").join("/") + ")");
  // Caution: **Put the colour itself out** (by name alone, pink and orange cannot be told apart).
  const chips = inkRibbon.querySelectorAll(".fly-chip");
  check(chips.length === ks.flyLabels("tool-ink").length - 1,
    "every row but Unset carries a colour sample (" + chips.length + ")");
  check(getComputedStyle(chips[0]).backgroundColor !== "rgba(0, 0, 0, 0)",
    "the sample is painted with the colour ("
      + getComputedStyle(chips[0]).backgroundColor + ")");
  // **It must open downward** (open right and it overlaps the neighbouring tool).
  const inkItems = inkRibbon.querySelector(".fly-items");
  check(getComputedStyle(inkItems).left === "0px",
    "a ribbon set opens downward (" + getComputedStyle(inkItems).left + ")");
  // **It must open on a press, onto a panel that can be pointed at.** Measures alone pass a `flex`
  // panel that **is not out on the screen**. Cut off by a box winding the vertical up, the canvas
  // takes the press. `click()` reaches a hidden node too. So it looks at who picks up the
  // panel's middle.
  const inkOpen = inkRibbon.querySelector(".fly-open");
  inkOpen.click();
  check(getComputedStyle(inkItems).display === "flex",
    "a press opens the panel (" + getComputedStyle(inkItems).display + ")");
  const inkAt = (() => {
    const box = inkItems.getBoundingClientRect();
    return document.elementFromPoint(box.left + box.width / 2, box.top + 12);
  })();
  check(inkAt !== null && (inkItems === inkAt || inkItems.contains(inkAt)),
    "an opened panel is somewhere that can be pointed at ("
      + (inkAt === null ? "nobody is there" : inkAt.tagName) + ")");
  inkOpen.click();
  check(getComputedStyle(inkItems).display === "none",
    "pressing again folds it (" + getComputedStyle(inkItems).display + ")");
  // Choose it and it acts on the document, and the same set on the menu's side gets the mark too.
  press(20, 20);
  keyIn("Home");
  keyIn("End", { shiftKey: true });
  check(ks.flyPick("tool-ink", "Red"), "a colour can be chosen from the ribbon");
  check(app.spanInk().color === "#c00000",
    "the colour chosen acts on the document (" + app.spanInk().color + ")");
  check(ks.flyTick("paint-color") === "Red",
    "the same set on the menu's side gets the mark too ("
      + ks.flyTick("paint-color") + ")");
  check(ks.flyPick("tool-ink", "Unset"), "it can be taken off from the ribbon");
  // The paragraph-style set goes the same way.
  // Caution: **Look at the count too.** It breaks as the ribbon's side alone staying at the old row
  // (a rebuild bundling it wrong).
  check(ks.flyLabels("tool-block-style").join("/") === ks.flyLabels("block-style").join("/"),
    "the paragraph styles lined up in the ribbon and the menu are the same ("
    + ks.flyLabels("tool-block-style").length + ")");

  // 28'. The ribbon's sets, and dragging a selected frame.
  //
  // **This can be seen nowhere else.** It checks that the sets put out change with the state. It
  // checks that a pressed frame can be taken hold of (it breaks as "press it and it does not
  // move"). **Do not line up anything pressable that does not act.** A contextual set is put out
  // only when it acts.
  const ribbon = document.getElementById("ribbon");
  check(ribbon.querySelectorAll(".group").length >= 4, "the ribbon is split into sets");
  // **A set's name is laid where it eats no row.** A row of names doubles the height; the sets show
  // by their break lines, and the names are read on landing. The buttons' names are visible.
  const named = Array.from(ribbon.querySelectorAll(".group"));
  check(named.every((one) => (one.title || "").length > 0),
    "every set carries a name");
  // **What is looked at is the tools on the row.** In a folded list the name is the text itself; a
  // row's tools can lose their names, so those want an `aria-label`.
  check(Array.from(ribbon.querySelectorAll(".group > button")).every((one) =>
    (one.getAttribute("aria-label") || "").length > 0), "every button carries a name");
  const frameGroup = ribbon.querySelector(".group[data-when=\"frame\"]");
  // It presses a frame inside the slide (**laid out at real measures, so where it lands cannot be
  // settled up front**).
  const facePart = app.regions().find((one) => one.kind === "absolute");
  check(facePart !== undefined, "the presentation slide's region is there");
  if (facePart) {
    const held = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type, spot(x, y)));
    held(facePart.x + 4, facePart.y + 4, "pointerup");
    // **A region's upper edge is not the slide's upper edge**, since the slack before a paragraph
    // goes into the region. So it hunts downward until a frame is found.
    let first = null;
    for (let dy = 4; dy < facePart.h && first === null; dy += 4) {
      held(facePart.x + 8, facePart.y + dy, "pointerdown");
      held(facePart.x + 8, facePart.y + dy, "pointerup");
      first = app.frameRect();
    }
    check(first !== null, "a press inside a slide selects a frame");
    // **Having fallen into the `…` counts as "out" too**; otherwise the result changes with the
    // window's width.
    const spilled = Array.from(document.querySelectorAll("#spill .items button"))
      .some((one) => one.textContent.indexOf("The selected shape") === 0);
    check(!frameGroup.hidden || spilled,
      "the selected-shape group comes out (where it folded is looked at too)");
    if (first) {
      // **Show where it can be taken hold of by the arrow's shape** (which handle is where is the
      // wasm side's checks'). `seen` is in the canvas's coordinates (do not add the region's
      // position).
      held(first.seen.x, first.seen.y, "pointermove");
      check(canvas.style.cursor === "nwse-resize",
        "over a corner it becomes a diagonal arrow (" + canvas.style.cursor + ")");
      const midX = first.seen.x + first.seen.w / 2;
      const lowY = first.seen.y + first.seen.h;
      held(midX, lowY, "pointermove");
      check(canvas.style.cursor === "ns-resize",
        "at the lower edge's middle it becomes a vertical arrow ("
          + canvas.style.cursor + ")");
      // The edge outside a handle moves it. **They must be tellable apart by the arrow.**
      const holdX = first.seen.x + first.seen.w / 4;
      held(holdX, lowY, "pointermove");
      check(canvas.style.cursor === "move",
        "at the edge outside a handle it becomes the move arrow ("
        + canvas.style.cursor + ")");
      // It takes hold of an edge and pulls. **Keep the difference from the point taken hold of**
      // (kept, it moves by however much it was pulled).
      held(holdX, lowY, "pointerdown");
      held(holdX + 20, lowY + 10, "pointermove");
      held(holdX + 20, lowY + 10, "pointerup");
      const moved = app.frameRect();
      check(moved !== null && Math.round(moved.x - first.x) === 20,
        "it moves sideways by however much it was pulled");
      check(moved !== null && Math.round(moved.y - first.y) === 10,
        "the vertical is the same");
      check(moved !== null && Math.round(moved.w) === Math.round(first.w),
        "moving it does not change the size");
      // It lays it by the number fields. **Do not rewrite while it is being typed on**, so the
      // field's value is looked at too.
      const boxX = document.getElementById("frame-x");
      boxX.value = "40";
      boxX.dispatchEvent(new Event("change", { bubbles: true }));
      const placed = app.frameRect();
      check(placed !== null && Math.round(placed.x) === 40,
        "the number fields act on the frame ("
          + (placed === null ? "none" : Math.round(placed.x)) + ")");
      // Alt+arrow moves it too.
      // Caution: **It must go through the same entry point** (split in two, one alone is changed).
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }));
      const nudged = app.frameRect();
      check(nudged !== null && Math.round(nudged.x) === 41,
        "Alt+arrow moves it 1px");
    }
  }

  // 28''. The tidings band, the right list, drawing by dragging, and folding the overflow.
  //
  // **This can be seen nowhere else**: these are the page's adornment (they break as "press it and
  // nothing happens" and "an unreadable colour").

  // The tidings come out on the status bar at the lower edge, and a refusal gets a colour.
  // Caution: **Do not put them out above too** (two places saying the same thing fall out of step
  // with one alone changed).
  const statusBar = document.getElementById("status");
  check(statusBar !== null && getComputedStyle(statusBar).position === "fixed",
    "the tidings band is fixed to the lower edge");
  check(document.getElementById("note").closest("#status") !== null,
    "the tidings sit inside the band");
  press(20, 20);
  openMenu("drop-frame");
  document.getElementById("drop-frame").click();
  check(document.getElementById("note").classList.contains("warn"),
    "a refusal gets a colour (" + document.getElementById("note").className + ")");
  // Caution: **Do not make it red.** Red is kept for when something is lost. A refusal that broke
  // nothing, in the strongest colour, races the words and is not read. The rules' side attaches the
  // mark (⚠).
  const denied = getComputedStyle(document.getElementById("note"));
  check(denied.getPropertyValue("--warn").trim().length > 0,
    "the refusal's colour is held as a role (" + denied.getPropertyValue("--warn") + ")");
  // **What is pressed is not "Save"** (the answer goes past a wait. The reason is at the same
  // place in `menu.js`).
  document.getElementById("export-md").click();
  check(!document.getElementById("note").classList.contains("warn"),
    "a tiding of something done gets no colour");
  // Where it is now comes out on the band too. **Do not leave it empty** (half the reasons a press
  // does not act are read here).
  check(document.getElementById("where").textContent.length > 0, "where it is now comes out");
  // Which file is open comes out on the band too.
  // Caution: **Put it out above all when it is nowhere** — left empty, that what was written goes
  // nowhere cannot be noticed.
  const placeBox = document.getElementById("file-at");
  check(placeBox.closest("#status") !== null,
    "the file open sits inside the band");
  check(placeBox.classList.contains("nowhere") && placeBox.textContent.length > 0,
    "it says it is in no file (" + placeBox.textContent + ")");
  // **The front alone must be the shrinking frame**; with the name's side shrinking, the name
  // vanishes on a long path.
  check(getComputedStyle(placeBox.querySelector(".name")).flexShrink === "0",
    "the name's side does not shrink");
  check(getComputedStyle(placeBox.querySelector(".dir")).textOverflow === "ellipsis",
    "the front side is shaved and folded");

  // The document's one unit is one CSS pixel. **This can be seen nowhere else.** Another ratio in
  // between wants the press-to-document division in four places (the zoom is the browser's). Only
  // the pixel density is multiplied. A wide table or slide can extend the drawing surface.
  const zoomWide = Math.round(canvas.getBoundingClientRect().width);
  app.resize(600);
  const extent = Math.max(600, ...app.regions().map((region) => region.x + region.w));
  check(Math.abs(parseFloat(canvas.style.width) - extent) < 0.5,
    "the drawing surface covers the layout without scaling ("
      + canvas.style.width + ")");
  check(canvas.width === Math.ceil(extent * (window.devicePixelRatio || 1)),
    "the pixel density alone is applied (" + canvas.width + ")");
  // **Do not lay a zoom tool down again** (two ratios would multiply together).
  check(document.getElementById("zoom") === null, "there is no zoom tool on the page's side");
  check(app.zoom === undefined && app.setZoom === undefined, "no zoom entry point is left either");
  app.resize(zoomWide);

  // The right list. **Do not lay it in the fixed area above** (the body would drop by as many
  // slides as there are).
  const sideBox = document.getElementById("side");
  check(sideBox !== null && !sideBox.hidden,
    "with slides there the right list comes out");
  check(document.getElementById("slides").closest("#side") !== null,
    "the list of slides has moved to the right");
  check(sideBox.getBoundingClientRect().left > canvas.getBoundingClientRect().right - 1,
    "the list is to the body's right (it does not overlap the body)");
  check(document.querySelectorAll("#side .slide").length >= 1,
    "the slides' knobs line up");

  // Drags with a drawing tool from (x0, y0) to (x1, y1) on the canvas, whose place on the screen
  // is `at` (taken by the caller). `keys` adds a held key, such as `{ shiftKey: true }`.
  const penDrag = (at, x0, y0, x1, y1, keys) => {
    const pen = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type, Object.assign(
      { clientX: at.left + x, clientY: at.top + y, bubbles: true, cancelable: true }, keys || {})));
    pen(x0, y0, "pointerdown");
    pen(x1, y1, "pointermove");
    pen(x1, y1, "pointerup");
  };

  // The list of a slide's content. **The row is the stacking order** (the top is the front).
  const faceSpot = app.regions().find((one) => one.kind === "absolute");
  // It hunts down as far as a frame (the reason is at `facePart` above).
  const intoFace = () => {
    if (!faceSpot) return false;
    for (let dy = 4; dy < faceSpot.h; dy += 4) {
      press(faceSpot.x + 8, faceSpot.y + dy);
      if (app.frameRect() !== null) return true;
    }
    return false;
  };
  if (faceSpot) {
    check(intoFace(), "a frame inside a slide can be pressed");
    // **Press the tab first, like a person, before looking** (the navigation is split into
    // three sheets, and one is out).
    document.getElementById("side-tab-objects").click();
    const rows = document.querySelectorAll("#objects .item");
    check(rows.length >= 1,
      "a slide's content lines up in the list (" + rows.length + ")");
    const many = app.objects().length;
    // Press one of the list and it selects that thing.
    // **The cursor must not move.**
    if (rows.length >= 2) {
      rows[1].querySelector(".who").click();
      const held = app.objects().find((one) => one.picked);
      check(held !== undefined, "pressing the list selects it");
      // It raises the stacking order. **The document's order is the stacking order** (no field
      // apart).
      const wasAt = held === undefined ? -1 : held.index;
      const lifted = app.raiseObject(true);
      const nowAt = (app.objects().find((one) => one.picked) || { index: -1 }).index;
      check(!lifted || nowAt === wasAt + 1,
        "raising it to the front advances the document's order by one ("
          + wasAt + "→" + nowAt + ")");
      check(app.objects().length === many, "raising it does not change the count");
    }
  }

  // It draws a shape by dragging. **It readies the tool and then drags** (as other products do).
  if (faceSpot) {
    intoFace();
    // **The shapes are folded into one** (to spare the row's width); it opens the knob, then
    // presses a shape.
    const shapesTab = document.getElementById("tool-shapes");
    check(shapesTab !== null, "the shapes knob is in the ribbon");
    const shapesMenu = shapesTab === null ? null : shapesTab.closest("details.menu");
    if (shapesMenu !== null) shapesMenu.querySelector("summary").click();
    const drawKey = document.getElementById("draw-ellipse");
    check(drawKey !== null, "opening it puts the list of shapes out");
    if (drawKey) {
      drawKey.click();
      check(app.armed !== null && app.armed.shape === "ellipse",
        "a press readies the tool (" + (app.armed ? app.armed.shape : "none") + ")");
      // **The folded knob must get the mark**; on the chosen one alone it hides behind the shut
      // knob.
      check(shapesTab.classList.contains("on"),
        "being at the ready comes out on the folded knob");
      // **Remember the shape pressed** (the shapes used most are put out at the head).
      if (shapesMenu !== null) {
        shapesMenu.querySelector("summary").click();
        const first = shapesMenu.querySelector(".row.shapes button");
        check(first !== null && first.textContent.indexOf("Ellipse") >= 0,
          "the shape used lately comes out at the head ("
            + (first === null ? "none" : first.textContent) + ")");
        shapesMenu.querySelector("summary").click();
      }
      const before = app.objects().length;
      const at = canvas.getBoundingClientRect();
      penDrag(at, faceSpot.x + 20, faceSpot.y + 20, faceSpot.x + 90, faceSpot.y + 60);
      const drew = app.objects();
      check(drew.length === before + 1,
        "one shape grows by however much it was dragged");
      const made = drew.find((one) => one.picked);
      check(made !== undefined && Math.round(made.w) === 70,
        "the width dragged is the shape's width as it stands (" +
        (made === undefined ? "none" : Math.round(made.w)) + ")");
      check(app.armed === null, "once drawn the tool stands down");
      // Delete deletes it. **Only for shapes holding no text** (a Delete while typing deletes one
      // character).
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Delete", bubbles: true, cancelable: true }));
      check(app.objects().length === before, "Delete deletes the shape selected");
      // Pull with Shift held and it becomes 1:1, the same key that keeps the ratio while resizing.
      // **This can be seen nowhere else**: the drag's band is built by the page's side.
      shapesMenu.querySelector("summary").click();
      document.getElementById("draw-box").click();
      penDrag(at, faceSpot.x + 20, faceSpot.y + 20, faceSpot.x + 100, faceSpot.y + 50,
        { shiftKey: true });
      const evened = app.objects().find((one) => one.picked);
      check(evened !== undefined && Math.round(evened.w) === Math.round(evened.h),
        "pulling with Shift makes the sides the same (" + (evened === undefined ? "none"
          : Math.round(evened.w) + "×" + Math.round(evened.h)) + ")");
      check(evened !== undefined && Math.round(evened.w) === 30,
        "it fits the shorter (" + (evened === undefined ? "none" : Math.round(evened.w)) + ")");
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Delete", bubbles: true, cancelable: true }));
      check(app.objects().length === before, "what was drawn can be put back");
    }
  }

  // It can draw by dragging over the body too (Word and Excel both do).
  //
  // **This can be seen nowhere else**: a drag is events the page's side builds, so running the wasm
  // shows only "press it and nothing happens". What was drawn is put back by Delete.
  const shapesOn = document.getElementById("tool-shapes");
  if (shapesOn !== null) {
    press(20, 20);
    const flowWas = app.objects().length;
    shapesOn.closest("details.menu").querySelector("summary").click();
    const boxKey = document.getElementById("draw-box");
    if (boxKey !== null) {
      boxKey.click();
      const at = canvas.getBoundingClientRect();
      penDrag(at, 30, 14, 90, 44);
      const flowDrew = app.objects();
      check(flowDrew.length === flowWas + 1,
        "over the body too the shapes grow by however much it was dragged ("
          + flowDrew.length + ")");
      const flowMade = flowDrew.find((one) => one.picked);
      check(flowMade !== undefined && Math.round(flowMade.w) === 60,
        "the width dragged is the shape's width as it stands (" +
        (flowMade === undefined ? "none" : Math.round(flowMade.w)) + ")");
      // **The list must come out**; shapes exist with no slides, and left folded they cannot be
      // touched.
      check(!document.getElementById("side").hidden,
        "with shapes there the right list comes out");
      // It draws one more, and selects from the list.
      //
      // **This can be seen nowhere else**: running the wasm shows an unwired press only as "nothing
      // is chosen". **One is chosen at a time** — choosing another takes the one before off, and
      // the nudge moves that one alone.
      shapesOn.closest("details.menu").querySelector("summary").click();
      document.getElementById("draw-box").click();
      penDrag(at, 120, 14, 170, 44);
      check(app.objects().length === flowWas + 2, "two line up over the body");
      const rows = document.querySelectorAll("#objects .item .who");
      check(rows.length === 2, "two come out in the list (" + rows.length + ")");
      if (rows.length === 2) {
        rows[0].click();
        check(app.objects().filter((one) => one.picked).length === 1,
          "one can be selected");
        rows[1].dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true }));
        const chosen = app.objects().filter((one) => one.picked).length;
        check(chosen === 1, "one is chosen at a time, Shift or no Shift (" + chosen + ")");
        check(document.getElementById("tally").textContent.indexOf("Shape ") >= 0,
          "the shape's size comes out on the band ("
            + document.getElementById("tally").textContent + ")");
        // The nudge moves the one chosen, and leaves the other where it was.
        // Caution: **Do not take the list's order for the contents' order.** The list has the
        // top nearest the front, so it is the other way round.
        const at = app.objects().findIndex((one) => one.picked);
        const wasAt = app.objects().map((one) => Math.round(one.x));
        ime.dispatchEvent(new KeyboardEvent("keydown",
          { key: "ArrowRight", altKey: true, bubbles: true, cancelable: true }));
        const nowAt = app.objects().map((one) => Math.round(one.x));
        check(nowAt[at] === wasAt[at] + 1,
          "Alt+arrow moves the one chosen (" + wasAt.join(",") + " -> " + nowAt.join(",") + ")");
        check(nowAt.every((v, i) => i === at || v === wasAt[i]),
          "and leaves the other where it was");
        rows[1].dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true }));
        check(app.objects().filter((one) => one.picked).length === 1,
          "pressing again takes it off");
      }
      // **Everything selected must be deleted** (one operation comes back in one); it chooses the
      // one taken off again.
      rows[1].dispatchEvent(new MouseEvent("click", { shiftKey: true, bubbles: true }));
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Delete", bubbles: true, cancelable: true }));
      check(app.objects().length === flowWas, "the two selected go on Delete");
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
      check(app.objects().length === flowWas + 2, "one undo puts both back");
      ime.dispatchEvent(new KeyboardEvent("keydown",
        { key: "Delete", bubbles: true, cancelable: true }));
    }
  }

  // A set that overflowed falls into the `…`. **Do not grow a row to fit it** (it shaves the body).
  const spillBox = document.getElementById("spill");
  const ribbonTall = ribbon.getBoundingClientRect().height;
  const wasWide = canvas.getBoundingClientRect().width;
  // Caution: **Do not settle the result by the window's width** (add tools and it overflows on a
  // wide window too). What is looked at is "narrow it and they grow, put it back and they return".
  const spillCount = () => document.querySelectorAll("#spill .items button").length;
  const spillWas = spillCount();
  // **The window cannot be shrunk**, so it narrows the ribbon's container instead.
  ribbon.style.maxWidth = "260px";
  if (app.onRedraw) app.onRedraw();
  check(!spillBox.hidden, "narrowed, the overflow falls into the `…`");
  check(spillCount() > spillWas,
    "the narrower it goes the more fall (" + spillCount() + ")");
  check(ribbon.getBoundingClientRect().height <= ribbonTall + 1,
    "dropping them grows no row ("
      + Math.round(ribbon.getBoundingClientRect().height) + ")");
  ribbon.style.maxWidth = "";
  if (app.onRedraw) app.onRedraw();
  check(spillCount() === spillWas,
    "putting it back returns the count that fell too (" + spillCount() + ")");
  check(Math.abs(canvas.getBoundingClientRect().width - wasWide) < 2,
    "the body's width comes back");

  // The document's name. **It is not the document's content** (it is the name of the file saved).
  const docNameBox = document.getElementById("doc-name");
  check(docNameBox !== null && docNameBox.closest("#bar") !== null,
    "the document's name is in the band (folding the ribbon does not delete it)");
  if (docNameBox) {
    docNameBox.value = "work";
    docNameBox.dispatchEvent(new Event("change", { bubbles: true }));
    let keptName = null;
    try { keptName = localStorage.getItem("kspage.name"); } catch (_) { keptName = null; }
    check(keptName === "work", "the name is remembered (" + keptName + ")");
  }

  // 28'''. The look.
  //
  // **This can be seen nowhere else.** The roles (CSS variables) hold colours, and **the look is
  // one**. No other palette and no other packing of the tools is offered, so the root carries no
  // mark for either.
  const root = document.documentElement;
  const roleOf = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  check(roleOf("--accent").length > 0, "the roles hold colours (" + roleOf("--accent") + ")");
  check(document.getElementById("look-theme") === null
    && document.getElementById("look-dense") === null,
    "there is no row choosing a palette or how tightly the tools pack");
  check(root.dataset.theme === undefined && root.dataset.dense === undefined,
    "the root carries no palette's or packing's mark");
  // The document's slide is a colour apart from the ground: **it shows where the document runs,
  // with no line.**
  check(getComputedStyle(canvas).backgroundColor !== "rgba(0, 0, 0, 0)",
    "the document's slide carries a colour ("
      + getComputedStyle(canvas).backgroundColor + ")");

  // 28-e. Putting the right list out, and folding it.
  //
  // **This can be seen nowhere else.** Whether the body's width spreads when it is folded is the
  // adornment's (it breaks as "fold it and the body does not spread").
  const sideKey = document.getElementById("side-toggle");
  check(sideKey !== null, "the list's knob is there");
  if (sideKey && !sideKey.hidden) {
    const wasShut = sideBox.hidden;
    const wasWide = Math.round(canvas.getBoundingClientRect().width);
    sideKey.click();
    check(sideBox.hidden !== wasShut, "a press takes the list in and out");
    const nowWide = Math.round(canvas.getBoundingClientRect().width);
    check(nowWide !== wasWide,
      `the body's width is taken afresh (${wasWide} -> ${nowWide})`);
    let keptSide = null;
    try { keptSide = localStorage.getItem("kspage.side"); } catch (_) { keptSide = null; }
    check(keptSide !== null, `whether it is folded is remembered (${keptSide})`);
    // **It must be puttable back** (else the choice stays remembered and the next page opens
    // folded).
    sideKey.click();
    check(sideBox.hidden === wasShut, "pressing again puts it back");
  }

  // 28-f. Changing the right list's width by the boundary.
  //
  // **This can be seen nowhere else.** Three things are the adornment's and the DOM's. They are
  // whether the boundary sits at the panel's edge, whether the drag takes the body afresh, and
  // whether it moves by key. They break as "it cannot be taken hold of" and "drag it and the body
  // does not spread".
  const grip = document.getElementById("side-grip");
  check(grip !== null, "the boundary that changes the width is there");
  if (grip !== null && !sideBox.hidden) {
    // **It must straddle the panel's edge**; off the edge, a finger reaching for it lands on the
    // body.
    const edge = sideBox.getBoundingClientRect().left;
    const bar = grip.getBoundingClientRect();
    check(bar.left <= edge && bar.right >= edge,
      `the boundary straddles the panel's edge `
        + `(band ${Math.round(bar.left)}–${Math.round(bar.right)} / edge ${Math.round(edge)})`);
    // **A width that can be taken hold of is wanted** (a 1px frame cannot be aimed at, a complaint
    // against other products).
    check(bar.width >= 4,
      `the width that can be taken hold of is 4px or more (${Math.round(bar.width)})`);
    // It drags.
    // Caution: **The body must be taken afresh too** (untaken, the right edge hides behind the
    // panel).
    const held = (x, how) => grip.dispatchEvent(new PointerEvent(how,
      { clientX: x, clientY: Math.round((bar.top + bar.bottom) / 2), pointerId: 1,
        bubbles: true, cancelable: true }));
    const wasSide = Math.round(sideBox.getBoundingClientRect().width);
    const wasBody = Math.round(canvas.getBoundingClientRect().width);
    held(edge, "pointerdown");
    held(edge - 40, "pointermove");
    const nowSide = Math.round(sideBox.getBoundingClientRect().width);
    check(nowSide > wasSide,
      `dragging left widens the panel (${wasSide} -> ${nowSide})`);
    check(Math.round(canvas.getBoundingClientRect().width) < wasBody,
      "the body's width is taken afresh by however much it was dragged");
    held(edge - 40, "pointerup");
    // **The focus must come to where it pressed**, so ← → pack it straight after taking hold;
    // otherwise the keys' way means following it again by Tab.
    check(document.activeElement === grip,
      "taking hold brings the focus to the boundary");
    // **Remember it.** Word does not, so people who fit it afresh on every open write VBA.
    let keptWide = null;
    try { keptWide = localStorage.getItem("kspage.side.width"); } catch (_) { keptWide = null; }
    check(keptWide !== null && Number(keptWide) > 0,
      `the width is remembered (${keptWide})`);
    // **It must move by key too**, for whoever cannot aim at a thin boundary and hold it. The panel
    // is on the right, so the leftward key widens it.
    const arrow = (key) => grip.dispatchEvent(new KeyboardEvent("keydown",
      { key: key, bubbles: true, cancelable: true }));
    const beforeKey = Math.round(sideBox.getBoundingClientRect().width);
    arrow("ArrowLeft");
    const wideKey = Math.round(sideBox.getBoundingClientRect().width);
    check(wideKey > beforeKey, `← widens it (${beforeKey} -> ${wideKey})`);
    arrow("ArrowRight");
    check(Math.round(sideBox.getBoundingClientRect().width) < wideKey,
      "→ thins it");
    // **It must stop at the cap**, or the list eats the slide being read.
    for (let i = 0; i < 60; i += 1) arrow("ArrowLeft");
    const most = Math.round(sideBox.getBoundingClientRect().width);
    check(most <= Math.round(document.documentElement.clientWidth / 2) + 1,
      `widened, it stops at half the window `
        + `(${most} / window ${document.documentElement.clientWidth})`);
    // **It must stop at the floor** (at 0 there is no edge left to take hold of).
    for (let i = 0; i < 60; i += 1) arrow("ArrowRight");
    const least = Math.round(sideBox.getBoundingClientRect().width);
    check(least >= 100, `thinned, it stops (${least})`);
    // **It must be puttable back to the default.** With no way back, whoever thinned it too far
    // puts it back by eye (a common complaint).
    grip.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    check(Math.round(sideBox.getBoundingClientRect().width) === 216,
      `a second press goes back to the default `
        + `(${Math.round(sideBox.getBoundingClientRect().width)})`);
    // **Fold the panel and the boundary must fold too** (else a band stands alone where no panel
    // is).
    sideKey.click();
    check(grip.hidden, "folding the list folds the boundary too");
    sideKey.click();
    check(!grip.hidden, "putting the list out puts the boundary out too");
  }

  // The Insert buttons act the way Word's and PowerPoint's do.
  //
  // **This can be seen nowhere else.** A button that opens a panel and a rule that folds the
  // panels both run on the one press. Their order breaks as "press it and nothing happens".
  const note = document.getElementById("note");
  // Esc folds every menu and panel (`page.js`), putting the screen back to a known state between
  // presses.
  const shutAll = () => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Escape", bubbles: true, cancelable: true }));
  // **Only the tools out by default are looked at here** (turning one on is the chooser's, checked
  // above).
  const openField = (tool, field) => {
    if (document.getElementById(tool) === null) return "no such tool";
    shutAll();
    document.getElementById(tool).click();
    const box = document.getElementById(field);
    if (box === null) return "no such field";
    const at = document.activeElement;
    if (at !== box) return "the focus is on " + (at === null ? "nothing" : at.id || at.tagName);
    if (box.getBoundingClientRect().height <= 0) return "the field is not visible";
    return "";
  };
  const linkWhy = openField("tool-link", "href");
  check(linkWhy === "",
    "Link opens its panel and puts the cursor in the field, and it stays open (" + linkWhy + ")");
  const remarkWhy = openField("tool-remark", "remark-text");
  check(remarkWhy === "",
    "Comment does the same (" + remarkWhy + ")");
  // **Ctrl+K opens the link's field**, as it does in Word.
  shutAll();
  ime.focus();
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
  check(document.activeElement === document.getElementById("href"),
    "Ctrl+K opens the link's field too");
  // **Image opens the file chooser**, as Word's Pictures does. The chooser shows nothing a check
  // can see, so it is looked at no longer pressing "Insert" on an empty field.
  shutAll();
  pressAt(8);
  document.getElementById("note").textContent = "";
  document.getElementById("tool-image").click();
  check(note.textContent === "",
    `Image does not ask for a place to be typed first (${note.textContent})`);
  // A slide refused inside a table's cell says the cell is why, not "there is no slide style".
  shutAll();
  const cellY = findCell();
  if (cellY > 0) {
    document.getElementById("tool-slide").click();
    check(note.textContent.indexOf("table") >= 0,
      `inside a cell the slide's refusal names the cell (${note.textContent})`);
  }
  pressAt(8);
}
