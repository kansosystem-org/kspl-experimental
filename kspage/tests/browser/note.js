// Notes, remarks, and choosing a paragraph's style.
//
// The style names (`heading`, `bullet`, `table`) and the table name (`detail`) are the document's,
// defined by `kspage/content`'s sample, so those needles follow that side.

function kspageProbeNote(ks) {
  const { check, app, canvas, ime, press, pressAt, undoKey, openMenu } = ks;

  const box = canvas.getBoundingClientRect();
  const h1At = app.styleNames().indexOf("heading");

  // 27. The note button.
  //
  // **This can be seen nowhere else**: misspell the field's or the button's id and the core is
  // unhurt, and it breaks only as "press it and nothing comes out".
  openMenu("note-apply");
  pressAt(8);
  document.getElementById("note-text").value = "the note's text";
  document.getElementById("note-apply").click();
  check(app.note() === "the note's text", "the button is wired to the note");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  check(app.html().indexOf("<sup>1</sup>") >= 0, "the mark comes out in what is written out");
  openMenu("put-notes");
  const beforeNotes = app.text().length;
  document.getElementById("put-notes").click();
  check(app.text().length > beforeNotes,
    "putting the list in puts the entries out on the screen");
  document.getElementById("note-clear").click();
  check(app.note() === "", "the button that takes it off is wired too");

  // 27'. The remark button.
  //
  // **This can be seen nowhere else**: putting the writer in is the page's side (it breaks as "it
  // is attached and whose it is does not come out").
  // Caution: **Look at the name put out beside it too** — the field alone lets the name's drawing
  // come off unnoticed.
  openMenu("remark-apply");
  pressAt(8);
  app.author = "Alice";
  document.getElementById("remark-text").value = "better not stated so flatly here";
  document.getElementById("remark-apply").click();
  check(app.remark() === "better not stated so flatly here",
    "the button is wired to the remark");
  check(app.remarkBy() === "Alice", "the name the page put in becomes the writer");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  check(document.getElementById("remark-by").textContent === "Alice",
    "the writer comes out beside it (" + document.getElementById("remark-by").textContent + ")");
  // **It does not come out in the flow**, neither in what is written out nor on the page.
  check(app.html().indexOf("better not stated so flatly here") < 0,
    "the remark does not come out in what is written out");
  document.getElementById("remark-clear").click();
  check(app.remark() === "" && app.remarkBy() === "",
    "taking it off drops the writer too");

  // 27''. Choosing a paragraph's style: whether the choice is wired to the paragraph's entry point
  // and comes back when refused (putting it back is the page's).
  // Caution: **Look at what takes it off too** (else a row-head mark, a bullet's `•`, cannot go).
  // **Hunt for where it presses** (the start-up rows are the product's sample and move).
  check(ks.findBlock("heading") >= 0, "the heading's paragraph is there");
  openMenu("block-style");
  check(ks.flyNow("block-style") === "heading",
    "the style of the paragraph it is in comes out on the row ("
      + ks.flyNow("block-style") + ")");
  check(ks.flyTick("block-style") === "heading", "the style landed gets the mark");
  const bullets = () => (app.html().match(/• /g) || []).length;
  const wasBullets = bullets();
  check(ks.flyPick("block-style", "bullet"), "the bullet-list row is lined up");
  check(app.blockStyle() === "bullet",
    "it lands on the paragraph the moment it is pressed");
  check(bullets() === wasBullets + 1,
    "the row-head mark comes out on the paragraph it landed on too");
  // **A style with a different way of arranging must not come out on the row.** Landed, the
  // paragraph's text waits for a cell and loses where to be laid.
  // Caution: **Do not stop it by refusing** — do not line up what can be chosen and is then refused
  // (Principle 5).
  const listed = ks.flyLabels("block-style");
  check(listed.indexOf("table") < 0, "a grid style does not come out on the row");
  check(listed.indexOf("bullet") >= 0, "a flowing style comes out on the row");
  // What deletes the mark. **Delete the text and the mark stays**, so taking it off is the point.
  // "Unset" is the row that inherits from the parent; the shut row's right goes empty.
  check(ks.flyPick("block-style", "Unset"), "the Unset row is lined up");
  check(app.blockStyle() === "" && bullets() === wasBullets,
    "taking it off deletes the row-head mark too");
  check(ks.flyNow("block-style") === "",
    "taking it off puts the row's right back to empty");
  undoKey();
  check(app.blockStyle() === "bullet", "one undo returns to the style that was landed");
  undoKey();
  check(app.blockStyle() === "heading" && bullets() === wasBullets,
    "one more undo returns to the original paragraph");
  // **It must land on the whole range selected**, as the neighbouring "styles" and "paragraphs"
  // lists do. **It must not land on a table's cells** — landed, the grid vanishes and the cells
  // turn into flow.
  const cells = () => (app.html().match(/<td/g) || []).length;
  const wasCells = cells();
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
  ks.flyPick("block-style", "bullet");
  check(bullets() >= wasBullets + 2, "several selected paragraphs become bullet lists ("
    + wasBullets + "→" + bullets() + ")");
  check(cells() === wasCells,
    "the table's cells change in neither count nor shape (" + cells() + ")");
  undoKey();
  check(bullets() === wasBullets, "one undo returns the whole document");
  pressAt(8);

  // The list of slides (the thumbnails): the thumbnails and turning a press into the document's
  // coordinates are the DOM's (else "lined up, and a press does not go in").
  // Caution: **Press the tab first, like a person** — the navigation is three sheets with one out
  // (`kspage/port/web/side.js`), and unpressed, a thumbnail in a folded set reads as "visible".
  document.getElementById("side-tab-slides").click();
  const slideStrip = document.getElementById("slides");
  check(!slideStrip.hidden && slideStrip.children.length === app.surfaceCount(),
    "as many thumbnails line up as there are slides ("
      + slideStrip.children.length + ")");
  // **The count must come out on the tab**, or whether there is content cannot be read until
  // pressed (forgetting what is hidden is the standard complaint).
  const tallyOf = (which) =>
    document.getElementById("side-tab-" + which).querySelector(".tally").textContent;
  check(tallyOf("slides") === String(app.surfaceCount()),
    "the count of slides comes out on the tab (" + tallyOf("slides") + ")");
  check(tallyOf("objects") === String(app.objects().length),
    "the count of what was laid down comes out on the tab too ("
      + tallyOf("objects") + ")");
  // **One sheet alone is out** (mixed, what is hunted for is further away by the other's count).
  check(document.getElementById("outline").hidden && document.getElementById("objects").hidden,
    "pressing a tab puts that set out alone");
  const thumb = slideStrip.children[0];
  const sheet = thumb.querySelector("canvas");
  check(sheet !== null && sheet.width > 0 && sheet.height > 0,
    "the thumbnail has a size");
  // **Put the number out in characters.** A thumbnail alone leaves what it points at unreadable,
  // and `title` needs a finger resting on it.
  const tag = thumb.querySelector(".tag");
  check(tag !== null && tag.textContent === "Slide 1",
    "the number comes out on the thumbnail ("
      + (tag === null ? "none" : tag.textContent) + ")");
  check(tag !== null && tag.getBoundingClientRect().width > 0, "that number is visible");
  // **Paint the page in the role's colour**, or on a dark theme it is a black panel on black
  // ground.
  const paperOf = (el) => getComputedStyle(el).getPropertyValue("--paper").trim();
  check(paperOf(sheet).length > 0,
    "the page's role reaches as far as the thumbnail (" + paperOf(sheet) + ")");
  // **The content must be drawn**, not a frame alone.
  const thumbInk = () => {
    const g = sheet.getContext("2d");
    const p = g.getImageData(0, 0, sheet.width, sheet.height).data;
    let n = 0;
    for (let i = 3; i < p.length; i += 4) {
      if (p[i] > 0) n += 1;
    }
    return n;
  };
  check(thumbInk() > 0,
    "the content is drawn on the thumbnail (" + thumbInk() + " pixels)");
  // A press puts the cursor into that slide, seen by where the input field that follows it is.
  pressAt(8);
  const topWas = parseFloat(ime.style.top);
  thumb.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  const topNow = parseFloat(ime.style.top);
  check(topNow > topWas,
    "the cursor goes into the slide (" + topWas + " -> " + topNow + ")");

  // Naming a frame.
  //
  // **This can be seen nowhere else**: misspell an id and the core is unhurt (it breaks as "press
  // it and nothing happens").
  // Caution: **Ask the laid-out result where the slide is** (it is laid out at real measures, so it
  // cannot be settled up front).
  openMenu("frame-name-apply");
  const nameBox = document.getElementById("frame-name");
  // Being nameable marks "it is inside a frame" (by the name, an empty field looks like being
  // outside).
  const nameHere = (text) => {
    nameBox.value = text;
    document.getElementById("frame-name-apply").click();
    return app.name() === text;
  };
  const face = app.regions().filter((one) => one.kind === "absolute")[0];
  const intoFrame = (want) => {
    for (let y = 4; face !== undefined && y < face.h; y += 6) {
      press(face.x + face.w / 2, face.y + y);
      if (want()) return true;
    }
    return false;
  };
  check(intoFrame(() => nameHere("one")), "the button is wired to the frame's name");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  check(intoFrame(() => app.name() !== "one" && nameHere("two")),
    "another frame gets a name too");
  check(intoFrame(() => app.name() === "one"), "it can go back to the frame it named");

  // Calling a figure from the body (a cross-reference).
  //
  // **This can be seen nowhere else**: whether the field and the button are wired to what calls.
  // Caution: **See that the number does not go into the document too** — in it, adding one figure
  // makes every calling name after it stale.
  pressAt(8);
  const referTo = document.getElementById("refer-to");
  openMenu("put-refer");
  referTo.value = "nowhere at all";
  const beforeRefer = app.text().length;
  document.getElementById("put-refer").click();
  check(app.text().length === beforeRefer, "with no such name it cannot be called");
  // Caution: A chapter number must round-trip too. Dropped from the row of numbers, the kind reads
  // as "no mark", so opening and shutting the style's fields deletes it (two texts, as for a serial
  // number).
  app.setStyleMark(h1At, { kind: "outline", before: ".", text: " " });
  const chapter = app.styleMark(h1At);
  check(chapter.kind === "outline",
    "a chapter number reads back as a chapter number (" + chapter.kind + ")");
  check(chapter.before === "." && chapter.text === " ",
    "the separator and what follows come back apart");
  // It lands a serial number on the heading, then names it and calls it.
  app.setStyleMark(h1At, { kind: "serial", before: "Fig. ", text: ". " });
  // Caution: **Hunt for where it presses** (a place settled up front names another paragraph once
  // the sample changes, and calling it puts no number out).
  check(ks.findBlock("heading") >= 0, "the heading with a serial number landed is there");
  nameBox.value = "thehead";
  document.getElementById("frame-name-apply").click();
  check(app.name() === "thehead", "outside a slide the paragraph gets the name");
  // Caution: **Look at it by the count** (the heading's own mark is "Fig. 1. " too).
  const calls = () => (app.text().match(/Fig\. 1/g) || []).length;
  const markOnly = calls();
  referTo.value = "thehead";
  document.getElementById("put-refer").click();
  check(calls() === markOnly + 1,
    "\"Fig. 1\" comes out in the body too (" + markOnly + "→" + calls() + ")");
  // **What the document holds is the name and nothing more.**
  check(app.save().indexOf("\"refers\": \"thehead\"") >= 0,
    "what goes into the save is the name of what it points at");
  undoKey();
  check(calls() === markOnly, "one undo deletes the calling text");
  // Caution: **Give the borrowed mark back.** A heading holds no indent, so with the mark left the
  // body's left edge moves right by the mark (the settlement in
  // [`../../lay/flow.kspls`](../../lay/flow.kspls)); the next section, pressing the heading's head,
  // lands on the mark and fails as "press it and the style does not land".
  app.setStyleMark(h1At, { kind: "none" });

  // The field for a memo attached to a container (the presenter's note).
  //
  // **This can be seen nowhere else**: misspell an id and the core is unhurt (it breaks as "press
  // it and nothing remains").
  openMenu("aside-apply");
  const asideBox = document.getElementById("aside");
  // It goes inside a slide from the list's thumbnails (they turn a press into document
  // coordinates).
  thumb.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  asideBox.value = "pause here";
  document.getElementById("aside-apply").click();
  check(app.aside() === "pause here", "the button is wired to the memo");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // Caution: **Move and the field must swap too.** Unswapped, it overwrites another slide's memo.
  pressAt(8);
  check(asideBox.value === "", "outside a container the field goes empty");
  document.getElementById("aside-clear").click();
  check(document.getElementById("note").textContent.length > 0,
    "the reason it cannot come off comes out");

  // The shape buttons and the shapes menu.
  //
  // **This can be seen nowhere else**: misspell an id of the menu's shape or of what adds, and the
  // core is unhurt (it breaks as "press it and nothing comes out").
  openMenu("put-shape");
  // It sees that the press landed — missed, it passes with the default shape going in (`probe.js`'s
  // `flyPick`).
  check(ks.flyPick("shape-kind", "Arrow, down-right"),
    "\"Arrow, down-right\" can be chosen from the shapes submenu");
  // Caution: **It must be addable over the body too** (Word and Excel both lay a shape over the
  // body). What was added is put back; later sections rely on the sample.
  pressAt(8);
  const wasFlow = app.objects().length;
  document.getElementById("put-shape").click();
  check(app.objects().length === wasFlow + 1, "it can be added over the body too");
  undoKey();
  // It goes inside a slide from the list's thumbnails.
  thumb.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
  document.getElementById("put-shape").click();
  check(document.getElementById("note").textContent === "",
    "inside a slide it can be added");
  // A shape added lines up in the style table by name. **The shape is held by that style.**
  const figureAt = app.styleNames().indexOf("figure-fall_arrow");
  check(figureAt >= 0, "one style is made under the menu's shape name");
  check(figureAt < 0 ? false : app.styleEdge(figureAt).shape === "fall_arrow",
    "the shape chosen in the menu goes into that style");
  check(figureAt < 0 ? false : app.styleEdge(figureAt).width > 0,
    "one line goes in so that it is visible");
  undoKey();

  // The chart button and the range field.
  //
  // **This can be seen nowhere else**: the range field and the gathering menu are DOM inside the
  // menu (a misspelt id breaks as "press it and nothing comes out"). **Painting the bars is the
  // DOM's side too** (failed, "it is laid there and nothing is visible").
  openMenu("put-chart");
  const chartRangeBox = document.getElementById("chart-range");
  // It counts the pixels of the bars' colour (#4472c4). **It is looked at by them growing** (the
  // colour can be elsewhere too).
  const barInk = () => {
    const g = canvas.getContext("2d");
    const p = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i] === 68 && p[i + 1] === 114 && p[i + 2] === 196) n += 1;
    }
    return n;
  };
  pressAt(8);
  chartRangeBox.value = "";
  document.getElementById("put-chart").click();
  check(document.getElementById("note").textContent ===
    "The chart cannot be inserted. The range is empty, or you are inside a table's cell",
    "with the range empty the reason comes out");
  chartRangeBox.value = "detail!C2:C3";
  check(ks.flyPick("chart-kind", "Bar chart"),
    "\"Bar chart\" can be chosen from the chart kinds");
  const inkWas = barInk();
  document.getElementById("put-chart").click();
  check(document.getElementById("note").textContent === "",
    "write the range and it can go in");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  const chartAt = app.styleNames().indexOf("chart-bars");
  check(chartAt >= 0, "one style is made under the menu's gathering name");
  check(chartAt < 0 ? false : app.styleOutline(chartAt).collect === "bars",
    "the gathering chosen in the menu goes into that style");
  const inkNow = barInk();
  check(inkNow > inkWas,
    "the bars are painted (" + inkWas + " -> " + inkNow + " pixels)");
  undoKey();
  check(barInk() === inkWas, "one undo deletes the bars too");

  // The CSV buttons.
  //
  // **This can be seen nowhere else**: what drops and what chooses a file are DOM inside the menu
  // (a misspelt id breaks as "press it and nothing falls"). The file chooser cannot open headless,
  // so the text is handed straight to the entry point.
  openMenu("export-csv");
  pressAt(8);
  document.getElementById("export-csv").click();
  check(document.getElementById("note").textContent.length > 0,
    "over the body the reason it cannot be written out comes out");
  // Over a table's cell it falls. **What drops cannot be taken over**, so the text coming out is
  // looked at. **Hunt for the cell afresh** (earlier sections moved the paragraphs).
  let csvY = 0;
  for (let y = 8; y < box.height && csvY === 0; y += 8) {
    pressAt(y);
    if (app.cellFrame() !== null) csvY = y;
  }
  check(csvY > 0, "a table's cell can be pressed");
  check(app.csv().indexOf(",") >= 0,
    "over a cell the CSV comes out (" + app.csv().slice(0, 8) + ")");
  const csvTables = () => app.html().split("<table").length;
  const csvWas = csvTables();
  pressAt(8);
  check(app.insertCsv("a,b\nc,d\n", "table"), "a table can be put in from CSV");
  check(csvTables() === csvWas + 1, "one table grows");
  undoKey();
  check(csvTables() === csvWas, "one undo takes the table put in off");
}
