// ==========================================
// kspage's page — the wiring of the commands that change the document: a table's rows and
// columns, inserted things, find and replace, notes, comments. **It is not the JS counterpart of
// [`../../write/edit.kspls`](../../write/edit.kspls)** (that is [`api.js`](api.js)); it only
// connects the menu's buttons to the core's entry points, as [`file.js`](file.js) does for files,
// [`form.js`](form.js) for styles and [`paper.js`](paper.js) for paper.
// Caution: **Route every click result through one path** (`ui.putButton` / `ui.lineButton`);
// wired directly, the focus return and the refusal color would be missing here alone. **Adding
// a connector and removing a frame act only inside a slide** (the menu says so); a shape goes to
// the container the click landed in, so over the body too.
// ==========================================
function kspageCommand(ui) {
  const app = ui.app;
  const say = ui.say, tell = ui.tell, deny = ui.deny;
  const putButton = ui.putButton, lineButton = ui.lineButton, whyButton = ui.whyButton;
  lineButton("add-row", () => app.addLine("row"));
  lineButton("drop-row", () => app.dropLine("row"));
  lineButton("add-col", () => app.addLine("column"));
  lineButton("drop-col", () => app.dropLine("column"));
  // Merging says which of four things stopped it (nothing selected, only one cell, a merge
  // extending outside, read-only), so it writes its own refusal.
  whyButton("merge-cells", () => app.mergeCells());
  lineButton("split-cell", () => app.splitCell());
  lineButton("fill-down", () => app.fillAlong("down"));
  lineButton("fill-right", () => app.fillAlong("right"));
  // Sorting says why it did not (a merge, too few rows, already in order), so its buttons write
  // their own refusal.
  whyButton("sort-down", () => app.sortRows("down"));
  whyButton("sort-up", () => app.sortRows("up"));

  // The items holding the settings for inserting; the chosen text shows right of the item.
  // Caution: **The text must be a name the core knows** — an unknown name becomes number 0, so a
  // typo silently inserts something else (`make test-conventions` checks it). **Keep the list in
  // the core's numbering** (`state.kspls`'s `*_order`). **Do not go back to a `<select>`** — a
  // closed field hides the choice, so it cannot be read until opened (the header of `fly.js`).
  const SKETCH_PICKS = [["whole", "One frame"], ["titled", "A title and a body"],
    ["halved", "A title and two columns"]];
  const SHAPE_PICKS = [["box", "Rectangle"], ["round_box", "Rounded rectangle"],
    ["ellipse", "Ellipse"], ["triangle", "Triangle"], ["diamond", "Diamond"],
    ["fall_line", "Line, down-right"], ["rise_line", "Line, up-right"],
    ["fall_arrow", "Arrow, down-right"], ["rise_arrow", "Arrow, up-right"],
    ["fall_arrow_back", "Arrow, down-right reversed"],
    ["rise_arrow_back", "Arrow, up-right reversed"]];
  const CHART_PICKS = [["bars", "Bar chart"], ["lines", "Line chart"]];
  // How a filter matches a cell (`keep_order` in `state.kspls`).
  const KEEP_PICKS = [["is", "is"], ["is_not", "is not"], ["holds", "contains"],
    ["above", "is above"], ["below", "is below"], ["blank", "is empty"], ["filled", "is not empty"]];
  // Builds an item that holds one setting (`fly.js` holds the value).
  // Caution: **Return focus to the clicked place**, or typing right after choosing fails.
  const holdFly = (host, id, name, picks) => kspageHoldFly(document.getElementById(host),
    { id: id, name: name, picks: picks, run: () => app.focus() }).now;

  // Filtering the rows. **It is a view** — nothing is saved and a total counts every row — so the
  // count shown stays in the status bar (`page.js`), and "Show all rows" is the way back (not
  // undo).
  const keepNow = holdFly("filter-kind", "filter-keep", "Kind", KEEP_PICKS);
  const filterText = document.getElementById("filter-text");
  whyButton("filter-apply", () => app.filterRows(keepNow(), filterText.value));
  whyButton("filter-clear", () => app.showAllRows());
  // The panel the heading's arrow opens; **the ribbon's button opens the same one** at the cursor's
  // column (`narrow.js`).
  whyButton("narrow-here", () => app.openNarrow());
  whyButton("narrow-ticked", () => app.narrowToTicks());
  whyButton("narrow-clear", () => app.showThisColumn());

  // Inserting a table and a slide. **This page decides the style's name** (a name in the document's
  // style table); a slide is sized by its style, so without a name it is not inserted.
  // **Do not rely on the name too much** — the core finds the style **by role** (`role_of` in
  // `../../write/insert.kspls`); the name only picks between two with the same role.
  // **The size grid and the button are one path** — the grid sets the size and clicks the button,
  // so the refusal and the focus are only `putButton`'s (Principle 6).
  const tableSize = kspageGridPick(document.getElementById("table-picks"), {
    id: "table-size", cols: 10, rows: 8, was: [2, 2],
    run: () => document.getElementById("put-table").click(),
  });
  putButton("put-table", () => {
    const [rows, cols] = tableSize.now();
    return app.insertTable("table", rows, cols);
  }, "It cannot be inserted inside a table's cell");
  // A slide. **The template decides only the frame layout** (a style is applied another way).
  const slideSketch = holdFly("slide-picks", "slide-sketch", "Layout", SKETCH_PICKS);
  whyButton("put-slide", () => app.insertSurface("slide", slideSketch()));
  putButton("put-toc", () => app.insertGathered("contents", "contents"), "It cannot be inserted inside a table's cell");

  // The selected frame's position and size fields are **the offset from the slide's top left**,
  // built by the ribbon.
  putButton("put-notes", () => app.insertGathered("footnote", "notes"), "It cannot be inserted inside a table's cell");
  putButton("drop-holder", () => app.dropHolder(), "Deleting is only possible while inside a table, a slide or an image");
  putButton("drop-frame", () => app.dropFrame(), "Deleting is only possible inside a slide, and where there are two or more frames");
  // Shapes. **Each shape is a separate style** (one name cannot hold two shapes).
  const shapeKind = holdFly("shape-picks", "shape-kind", "The shape's kind", SHAPE_PICKS);
  putButton("put-shape", () => app.insertShape(`figure-${shapeKind()}`, shapeKind()),
    "A shape is placed inside a slide. Click a slide and then insert it");
  // The name of one thing, **separate from a style's name.**
  // **Write what it attaches to into the refusal** — it depends on where the cursor is (`named_at`
  // in `../../write/block.kspls`).
  // Caution: **Do not say only "the text inside a frame"** — someone who wants to name a table
  // reads that as impossible.
  const frameNameBox = document.getElementById("frame-name");
  document.getElementById("frame-name-apply").addEventListener("click", () => {
    tell(app.setName(frameNameBox.value), "Set the name",
      "Click where the name is to be given and then set it (inside a cell it attaches to the table, "
        + "inside a slide's frame to the frame, and otherwise to the paragraph you are in)");
    app.focus();
  });
  // Referring to a figure from the body. **Only the target's name is stored** (the number is
  // counted at every layout).
  const referTo = document.getElementById("refer-to");
  putButton("put-refer", () => app.insertRefer(referTo.value),
    "No figure of that name is found. Enter a name set on a paragraph carrying a running number");
  // Charts. **Each aggregation is a separate style** (the height is changed there too).
  const chartRange = document.getElementById("chart-range");
  const chartKind = holdFly("chart-picks", "chart-kind", "The chart's kind", CHART_PICKS);
  putButton("put-chart",
    () => chartRange.value !== ""
      && app.insertChart(`chart-${chartKind()}`, chartRange.value, chartKind()),
    "The chart cannot be inserted. The range is empty, or you are inside a table's cell");

  // Images. **The page decides the size** (the core cannot read an image); left empty, the natural
  // size is read. **Loading is asynchronous**, so the notice comes once it is loaded.
  const imageSrc = document.getElementById("image-src");
  const imageW = document.getElementById("image-w");
  const imageH = document.getElementById("image-h");
  document.getElementById("put-image").addEventListener("click", async () => {
    const src = imageSrc.value;
    if (src === "") {
      deny("Enter the image's place");
      return;
    }
    const asked = [Number(imageW.value), Number(imageH.value)];
    const size = asked[0] > 0 && asked[1] > 0 ? asked : await app.measureImage(src);
    if (size === null) {
      deny("The image at that place cannot be read. Check the place");
    } else {
      tell(app.insertImage(src, size[0], size[1]), "Inserted the image", "It cannot be inserted inside a table's cell");
    }
    app.focus();
  });

  // Inserting an image from a local file, **for those who can insert one only here** (the URL field
  // alone would mean building the data: text yourself); cleared so the same file fires `change`
  // again, and the natural size is read. **Two forms, no choice** (`file.js`'s rule): with the
  // local server and the document's path set it is saved beside the document and referenced by
  // path, otherwise embedded; which one it became is reported.
  // **Report the embedded size** (base64 is 4/3), or a few photos silently reach the opening cap.
  const imageFile = document.getElementById("image-file");
  document.getElementById("pick-image").addEventListener("click", () => imageFile.click());
  // The same folder as the document (`docs/` for `docs/notes.kspage`).
  // Caution: **Do not create a folder** — the server's write entry point creates none (a person
  // decides folders), and a folder per document would need one (Principle 1). **The path is
  // relative to the served folder**, the same basis as the document's path (with two bases only the
  // images would stop showing).
  const folderOf = (path) => {
    const cut = path.lastIndexOf("/");
    return cut < 0 ? "" : path.slice(0, cut + 1);
  };
  // Saves it on the local server and references it by path, returning the path, or null (with the
  // reason shown).
  // Caution: **Do not silently overwrite what is there** — the chosen file's name can clash with
  // another image, so on a clash it names it and refuses.
  const putBeside = async (chosen) => {
    const to = folderOf(ui.docPath()) + chosen.name;
    if (await ui.localStat(to)) {
      deny("An image of the same name is already there (" + to + "). Change the name and then insert it");
      return null;
    }
    const bytes = new Uint8Array(await chosen.arrayBuffer());
    const stopped = await ui.localWrite(to, bytes);
    if (stopped) {
      deny("The image could not be placed (" + to + ": " + stopped + ")");
      return null;
    }
    return to;
  };
  // Reads it into data: text, **once the asynchronous read is finished.**
  const asEmbedded = (chosen) => new Promise((done) => {
    const read = new FileReader();
    read.addEventListener("load", () => done(String(read.result || "")));
    read.addEventListener("error", () => done(""));
    read.readAsDataURL(chosen);
  });
  imageFile.addEventListener("change", () => {
    const chosen = imageFile.files[0];
    imageFile.value = "";
    takeImage(chosen);
  });
  // Inserts one image into the document.
  // **Do not write it per case** — picking and dropping share this function, so neither embeds
  // where the other saves beside the document.
  async function takeImage(chosen) {
    if (!chosen) return;
    // Where the path is not set it embeds the image.
    const beside = ui.localHere() && ui.docPath() !== ""
      ? await putBeside(chosen)
      : null;
    if (beside === null && ui.localHere() && ui.docPath() !== "") {
      app.focus();   // `putBeside` has already reported what happened
      return;
    }
    const src = beside !== null ? beside : await asEmbedded(chosen);
    if (src === "") {
      deny("This file cannot be read");
      app.focus();
      return;
    }
    const size = await app.measureImage(src);
    if (size === null) {
      deny("This image cannot be read. Choose an image file");
      app.focus();
      return;
    }
    const put = app.insertImage(src, size[0], size[1]);
    if (!put) {
      deny("It cannot be inserted inside a table's cell");
    } else if (beside !== null) {
      say("Inserted the image (it refers to " + beside + ". Only the place goes into the document)");
    } else {
      say("Inserted the image (embedded " + Math.round(src.length / 1024) + " KB into the document)");
    }
    app.focus();
  }

  // ---- Find and replace ----
  // Caution: **Take over Ctrl+F** — the browser's own search finds **not one match**, since the
  // body is inside the canvas.
  const findBox = document.getElementById("find-text");
  const withBox = document.getElementById("find-with");
  // Shows the match count while typing. **Reporting after a click is too late** — "Replace all"
  // touches the whole document, so how many will change shows **before clicking** (after it, the
  // only way back is undo).
  // Caution: **Show 0 too** (left empty, "not counted" and 0 look alike).
  const tallyBox = document.getElementById("find-tally");
  const retally = () => {
    const needle = findBox.value;
    tallyBox.textContent = needle === "" ? "" : `${app.count(needle)} found`;
  };
  findBox.addEventListener("input", retally);
  // **Rather than opening a panel, it jumps to the field** (on the ribbon's right, always visible).
  const openFind = () => {
    findBox.focus();
    findBox.select();
  };
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      openFind();
    }
  });
  // Caution: **Report that it was not found** — silent, it looks as if clicking does nothing.
  const hunt = (back) => {
    tell(app.find(findBox.value, back), "", "Not found");
    app.focus();
  };
  document.getElementById("find-next").addEventListener("click", () => hunt(false));
  document.getElementById("find-prev").addEventListener("click", () => hunt(true));
  // In the find field, Enter means "Next".
  findBox.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      tell(app.find(findBox.value, e.shiftKey), "", "Not found");
    } else if (e.key === "Escape") {
      // **It only returns to the body** (the field stays where it is always visible).
      e.preventDefault();
      app.focus();
    }
  });
  const swap = (all) => {
    const n = app.replace(findBox.value, withBox.value, all);
    tell(n > 0, `Replaced ${ui.count(n, "place")}`, "There is nowhere to replace");
    // Caution: **Count again after replacing**, or the old count stays and reads as "there are
    // still some".
    retally();
    app.focus();
  };
  document.getElementById("find-swap").addEventListener("click", () => swap(false));
  document.getElementById("find-swap-all").addEventListener("click", () => swap(true));

  // Notes. **The mark appears at the cursor** (the inline is split there).
  const noteBox = document.getElementById("note-text");
  document.getElementById("note-apply").addEventListener("click", () => {
    const text = noteBox.value;
    if (text === "") {
      deny("Enter the footnote's text");
    } else {
      tell(app.setNote(text), "Added the footnote", "There is nowhere to add a footnote. Click on some text");
    }
    app.focus();
  });
  document.getElementById("note-clear").addEventListener("click", () => {
    tell(app.setNote(""), "Deleted the footnote", "There is no footnote to delete");
    app.focus();
  });

  // Comments. **It applies to the selected range** (like a link), or with nothing selected to the
  // cursor's inline.
  const remarkBox = document.getElementById("remark-text");
  const remarkBy = document.getElementById("remark-by");
  document.getElementById("remark-apply").addEventListener("click", () => {
    const text = remarkBox.value;
    if (text === "") {
      deny("Enter the comment's text");
    } else {
      tell(app.setRemark(text), "Added the comment", "There is nowhere to add a comment. Click on some text");
    }
    app.focus();
  });
  document.getElementById("remark-clear").addEventListener("click", () => {
    tell(app.setRemark(""), "Deleted the comment", "There is no comment to delete");
    app.focus();
  });

  return {
    // The function that inserts one image into the document (dropping borrows it).
    takeImage: takeImage,
    frameNameBox: frameNameBox,
    noteBox: noteBox,
    remarkBox: remarkBox,
    remarkBy: remarkBy,
    // Caution: **Count again on every redraw**, or the old count stays. It costs about a tenth of a
    // layout.
    retally: retally,
  };
}
