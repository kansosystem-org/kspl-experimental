// The tools' height, the ribbon's sets, the tidings band and the right list, and the themes.

function kspageProbeRibbon(ks) {
  const { check, app, canvas, ime, spot, press, pressAt, keyIn, openMenu, findCell } = ks;

  // 28''. That the tools at the top eat no height, can be folded, and can be chosen.
  //
  // **This can be seen nowhere else**: the height, the folding and the choosing are the DOM's side
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
  // The names can be deleted (pictures alone). **The default is to put them out** (a picture's
  // meaning must be remembered).
  const labelBox = document.getElementById("show-labels");
  check(labelBox.checked, "the names are out by default");
  const labelWide = () =>
    document.querySelector("#ribbon .label").getBoundingClientRect().width;
  check(labelWide() > 0, "the names have a width");
  labelBox.checked = false;
  labelBox.dispatchEvent(new Event("change", { bubbles: true }));
  check(labelWide() === 0, "the names can be deleted");
  check(chromeTall() <= chromeCap,
    "deleted, it is within the cap (" + chromeTall() + ")");
  labelBox.checked = true;
  labelBox.dispatchEvent(new Event("change", { bubbles: true }));
  // The tools put out can be chosen. **A way back must be there too.**
  const picksMenu = document.getElementById("tool-picks");
  const firstPick = picksMenu.querySelector("input[type=\"checkbox\"]");
  check(firstPick !== null, "the list of tools lines up");
  // Caution: **Count inside the `…` too.** A set that does not fit falls in there, so counting the
  // ribbon alone goes wrong once taking one off lets the whole set fit (it falls on a narrow screen
  // alone).
  const toolCount = () =>
    document.querySelectorAll("#ribbon [id^=\"tool-\"], #spill [id^=\"tool-\"]").length;
  // Caution: **A name must be one to one.** Give two tools the same name and taking one off deletes
  // the other too; several places get one by name.
  const twice = [];
  const seenIds = new Set();
  for (const one of document.querySelectorAll("#tool-picks input[data-tool]")) {
    if (seenIds.has(one.dataset.tool)) twice.push(one.dataset.tool);
    seenIds.add(one.dataset.tool);
  }
  check(twice.length === 0,
    "the tools' names are one to one (" + twice.join(" / ") + ")");
  const beforePicks = toolCount();
  firstPick.checked = false;
  firstPick.dispatchEvent(new Event("change", { bubbles: true }));
  check(toolCount() === beforePicks - 1,
    "a tool taken off vanishes from the ribbon ("
      + beforePicks + " -> " + toolCount() + ")");
  document.getElementById("tools-reset").click();
  check(toolCount() === beforePicks, "putting the defaults back returns it");

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
  // panel that **is not out on the screen** (cut off by a box winding the vertical up, the canvas
  // takes the press), and `click()` reaches a hidden node too; so it looks at who picks up the
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
  // **This can be seen nowhere else**: that the sets put out change with the state, and that a
  // pressed frame can be taken hold of (it breaks as "press it and it does not move"). **Do not
  // line up anything pressable that does not act** — a contextual set is put out only when it acts.
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
    // **A region's upper edge is not the slide's upper edge** (the slack before a paragraph goes
    // into the region), so it hunts downward until a frame is found.
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
  // Caution: **Do not make it red** — red is kept for when something is lost; a refusal that broke
  // nothing, in the strongest colour, races the words and is not read. The rules' side attaches the
  // mark (⚠).
  const denied = getComputedStyle(document.getElementById("note"));
  check(denied.getPropertyValue("--warn").trim().length > 0,
    "the refusal's colour is held as a role (" + denied.getPropertyValue("--warn") + ")");
  // **What is pressed is not "Save"** (the answer goes past a wait. The reason is at the same
  // place in `menu.js`).
  document.getElementById("export").click();
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
  // between wants the press-to-document division in four places (the zoom is the browser's); only
  // the pixel density is multiplied, so the CSS width is the width handed over.
  const zoomWide = Math.round(canvas.getBoundingClientRect().width);
  app.resize(600);
  check(canvas.style.width === "600px",
    "the width handed over becomes the CSS width as it stands ("
      + canvas.style.width + ")");
  check(canvas.width === Math.ceil(600 * (window.devicePixelRatio || 1)),
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
      const pen = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type,
        { clientX: at.left + x, clientY: at.top + y, bubbles: true, cancelable: true }));
      pen(faceSpot.x + 20, faceSpot.y + 20, "pointerdown");
      pen(faceSpot.x + 90, faceSpot.y + 60, "pointermove");
      pen(faceSpot.x + 90, faceSpot.y + 60, "pointerup");
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
      const square = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type,
        { clientX: at.left + x, clientY: at.top + y, shiftKey: true, bubbles: true,
          cancelable: true }));
      square(faceSpot.x + 20, faceSpot.y + 20, "pointerdown");
      square(faceSpot.x + 100, faceSpot.y + 50, "pointermove");
      square(faceSpot.x + 100, faceSpot.y + 50, "pointerup");
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
      const pen = (x, y, type) => canvas.dispatchEvent(new PointerEvent(type,
        { clientX: at.left + x, clientY: at.top + y, bubbles: true, cancelable: true }));
      pen(30, 14, "pointerdown");
      pen(90, 44, "pointermove");
      pen(90, 44, "pointerup");
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
      pen(120, 14, "pointerdown");
      pen(170, 44, "pointermove");
      pen(170, 44, "pointerup");
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
        // Caution: **Do not take the list's order for the contents' order** — the list has the
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

  // Sorting the tools. **Remember it** (do not make them sort afresh every time). The settings are
  // split by heading and can be narrowed; **do not line them up flat** (the field wanted cannot be
  // found). **It must be the same word as the thing set** (the ribbon set's name is the heading).
  const picksHeads = Array.from(document.querySelectorAll("#tool-picks h4"))
    .map((one) => one.textContent);
  check(picksHeads.length >= 4,
    "the list of settings carries a heading per set (" + picksHeads.length + ")");
  check(picksHeads.includes("Shapes"),
    "the headings are the same names as the ribbon's sets");
  const findTools = document.getElementById("tool-find");
  const allTools = document.querySelectorAll("#tool-picks label").length;
  findTools.value = "Shape";
  findTools.dispatchEvent(new Event("input", { bubbles: true }));
  const someTools = document.querySelectorAll("#tool-picks label").length;
  check(someTools > 0 && someTools < allTools,
    "narrowed, the tools that landed alone remain ("
      + allTools + " -> " + someTools + ")");
  findTools.value = "";
  findTools.dispatchEvent(new Event("input", { bubbles: true }));
  check(document.querySelectorAll("#tool-picks label").length === allTools,
    "emptying it puts it back");
  const liftKey = document.querySelector("#tool-picks .lift");
  check(liftKey !== null, "the hand that sorts is there");
  if (liftKey) {
    const order = () => Array.from(document.querySelectorAll("#ribbon button"))
      .map((one) => one.id).join(",");
    const was = order();
    // The first cannot be moved forward (it is the edge). It presses the second's ▲.
    const keys = document.querySelectorAll("#tool-picks label");
    const second = keys.length > 1 ? keys[1].querySelector(".lift") : null;
    if (second) {
      second.click();
      check(order() !== was, "sorting changes the ribbon's row");
      let kept = null;
      try { kept = localStorage.getItem("kspage.tools"); } catch (_) { kept = null; }
      check(kept !== null && kept.indexOf("order") >= 0, "the row is remembered");
    }
    document.getElementById("tools-reset").click();
  }

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

  // Columns. **What holds the count of columns is a style** (no invisible mark such as a section
  // break). **It is not put out by default**, so it is put out first.
  const columnTick = document.querySelector("#tool-picks input[data-tool=\"tool-columns\"]");
  check(columnTick !== null, "the columns tool can be put out");
  if (columnTick) {
    columnTick.checked = true;
    columnTick.dispatchEvent(new Event("change", { bubbles: true }));
  }
  press(20, 20);
  const columnKey = document.getElementById("tool-columns");
  check(columnKey !== null, "put out, the columns tool is in the ribbon");
  if (columnKey) {
    const faceName = app.blockStyle();
    const spotAt = app.styleNames().indexOf(faceName);
    columnKey.click();
    const after = spotAt >= 0 ? app.stylePara(spotAt).columns : 0;
    check(spotAt < 0 || after === 2,
      "a press makes the style now two columns (" + after + ")");
    columnKey.click();
    const back = spotAt >= 0 ? app.stylePara(spotAt).columns : 0;
    check(spotAt < 0 || back === 0, "pressing again puts it back (" + back + ")");
  }

  // 28'''. The look's themes.
  //
  // **This can be seen nowhere else**: whether swapping the roles (CSS variables) reaches both the
  // screen and the canvas (it breaks as "the page alone changes colour, the selection stays the
  // earlier colour").
  const root = document.documentElement;
  const roleOf = (name) => getComputedStyle(root).getPropertyValue(name).trim();
  // **Follow it in the same order as a person** (press the row to open it, then press the choice);
  // it is a `fly.js` row, not a `<select>`.
  const themeFly = document.getElementById("look-theme");
  check(themeFly !== null, "the row that chooses a theme is there");
  if (themeFly) {
    const plainAccent = roleOf("--accent");
    const plainField = roleOf("--field");
    check(plainAccent.length > 0,
      "the roles hold colours even bare (" + plainAccent + ")");
    check(ks.flyPick("look-theme", "Ink (a dark ground and amber)"),
      "the Ink theme can be chosen");
    check(root.dataset.theme === "Ink", "the theme chosen becomes the root's mark");
    // **It must come out on the shut row too** (what is landed must be readable).
    check(ks.flyNow("look-theme") === "Ink (a dark ground and amber)",
      "the theme now comes out to the shut row's right (" + ks.flyNow("look-theme") + ")");
    check(ks.flyTick("look-theme") === "Ink (a dark ground and amber)",
      "Ink in the list gets the mark");
    const darkAccent = roleOf("--accent");
    check(darkAccent !== plainAccent, "the role's colour swaps (" + darkAccent + ")");
    check(roleOf("--field") !== plainField, "the ground's colour swaps too");
    // The canvas reads the same roles. **A selection colour that does not follow is leaking out of
    // the theme** (a colour written straight into the canvas). **Choose by key** (the entry point
    // that chooses is on the key's side alone).
    ime.dispatchEvent(new KeyboardEvent("keydown",
      { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
    const inkOf = (want) => {
      const g = canvas.getContext("2d");
      const p = g.getImageData(0, 0, canvas.width, Math.min(canvas.height, 400)).data;
      let n = 0;
      for (let i = 0; i < p.length; i += 4) {
        if (Math.abs(p[i] - want[0]) < 24 && Math.abs(p[i + 1] - want[1]) < 24 &&
          Math.abs(p[i + 2] - want[2]) < 24) n += 1;
      }
      return n;
    };
    // Ink's emphasis is #ff9f0a.
    // Caution: **Look at it by pixels rather than text** (the colour drawn is the answer).
    check(inkOf([255, 159, 10]) > 100,
      "the selection is painted in the theme's emphasis colour ("
        + inkOf([255, 159, 10]) + " pixels)");
    // Remembering it. **It must not fall where it cannot remember** (it is read inside a guard).
    let keptTheme = null;
    try { keptTheme = localStorage.getItem("kspage.theme"); } catch (_) { keptTheme = null; }
    check(keptTheme === "Ink", "the theme chosen is remembered (" + keptTheme + ")");
    check(ks.flyPick("look-theme", "Standard (fits the screen)"),
      "it can go back to Standard");
    check(root.dataset.theme === undefined,
      "going back to Standard takes the mark off with it");
    check(roleOf("--accent") === plainAccent, "the roles come back too");
  }
  // The document's slide is a colour apart from the ground: **it shows where the document runs,
  // with no line.**
  check(getComputedStyle(canvas).backgroundColor !== "rgba(0, 0, 0, 0)",
    "the document's slide carries a colour ("
      + getComputedStyle(canvas).backgroundColor + ")");

  // 28''''. How tightly the tools pack.
  //
  // **This can be seen nowhere else**: how much height goes is the adornment's (it breaks as
  // "choose it and nothing changes").
  // Caution: **It must not land on the body.** Landed, the same document wraps in different places
  // per machine.
  const denseFly = document.getElementById("look-dense");
  check(denseFly !== null, "the row that chooses how tightly it packs is there");
  if (denseFly) {
    const wasChrome = chromeTall();
    const wasWide = Math.round(canvas.getBoundingClientRect().width);
    check(ks.flyPick("look-dense", "Tight (a wider body)"), "Tight can be chosen");
    check(root.dataset.dense === "Tight",
      "the packing chosen becomes the root's mark");
    check(chromeTall() < wasChrome,
      "packing it takes the tools' height down (" + wasChrome + " -> " +
      chromeTall() + ")");
    check(Math.round(canvas.getBoundingClientRect().width) === wasWide,
      "the body's width does not change (" + wasWide + ")");
    check(ks.flyPick("look-dense", "Roomy (for touch)"), "Roomy can be chosen");
    check(chromeTall() > wasChrome,
      "loosening it grows the height (" + chromeTall() + ")");
    let keptDense = null;
    try { keptDense = localStorage.getItem("kspage.dense"); } catch (_) { keptDense = null; }
    check(keptDense === "Roomy",
      "the packing chosen is remembered (" + keptDense + ")");
    check(ks.flyPick("look-dense", "Standard"), "it can go back to Standard");
    check(root.dataset.dense === undefined && chromeTall() === wasChrome,
      "going back to Standard takes the mark off with it and returns the height");
  }

  // 28-e. Putting the right list out, and folding it.
  //
  // **This can be seen nowhere else**: whether the body's width spreads when it is folded is the
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
  // **This can be seen nowhere else**: whether the boundary sits at the panel's edge, whether the
  // body is taken afresh by the drag, and whether it moves by key are the adornment's and the DOM's
  // (they break as "it cannot be taken hold of" and "drag it and the body does not spread").
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
    // **The split view must not cover the panel.** It sits in front of the status bar, so laid to
    // the right edge it hides the list's lower part (winding up does not bring it out). The panel's
    // width changes, so unlooked at here it becomes "the wider it goes the more is hidden".
    const peekBand = document.getElementById("peek");
    document.getElementById("peek-flip").click();
    check(!peekBand.hidden, "the split view opens");
    check(peekBand.getBoundingClientRect().right
      <= sideBox.getBoundingClientRect().left + 1,
      `the split view does not cover the list's panel `
      + `(split view ${Math.round(peekBand.getBoundingClientRect().right)}`
      + ` / panel ${Math.round(sideBox.getBoundingClientRect().left)})`);
    document.getElementById("peek-flip").click();
    // **Fold the panel and the boundary must fold too** (else a band stands alone where no panel
    // is).
    sideKey.click();
    check(grip.hidden, "folding the list folds the boundary too");
    sideKey.click();
    check(!grip.hidden, "putting the list out puts the boundary out too");
  }

  // The Insert buttons act the way Word's and PowerPoint's do.
  //
  // **This can be seen nowhere else**: a button that opens a panel and a rule that folds the panels
  // both run on the one press, and their order breaks as "press it and nothing happens".
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
