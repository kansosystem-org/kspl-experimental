// Copying to paper, a page's header and footer, and the letter spacing of justification.
//
// The style names (`body`, `code`) are the document's and the placeholders `{page}` / `{pages}` are
// the core's (`kspage/port/web/paper.kspl`), so those needles follow those sides.

function kspageProbePaper(ks) {
  const { check, app, canvas, press, keyIn, ime } = ks;
  // One page's settings by the saved field names (`app.paper()`); the four margins alike.
  const pageOf = (width, height, margin) => ({ page_width: width, page_height: height,
    margin_left: margin, margin_top: margin, margin_right: margin, margin_bottom: margin });

  // 23. Copy to paper and it becomes black text on white paper.
  //
  // **This can be seen nowhere else.** The screen's colours come from `getComputedStyle`, so on a
  // dark screen the text is white. Copied to paper as it stands, **nothing is visible on the
  // page**, told only by the canvas's pixels.
  const sheet = document.createElement("canvas");
  app.setPaper(pageOf(300, 200, 20));
  check(app.paper().band === 160,
    "the height of content that fits a page is what is left after the margins");
  app.paintPage(sheet, 0);
  const paperPixels = sheet.getContext("2d")
    .getImageData(0, 0, sheet.width, sheet.height).data;
  // The page's top-left corner (inside the margin) is the under-ground as it stands.
  const corner = [paperPixels[0], paperPixels[1], paperPixels[2], paperPixels[3]];
  check(corner.join() === "255,255,255,255",
    "the page's under-ground is white (" + corner.join() + ")");
  let darks = 0;
  for (let i = 0; i < paperPixels.length; i += 4) {
    if (paperPixels[i] < 80 && paperPixels[i + 1] < 80 && paperPixels[i + 2] < 80) darks += 1;
  }
  check(darks > 0, "the text comes out black (" + darks + " pixels)");

  // 23'. The rows that choose the paper size and the direction are wired to the document's
  // settlement.
  //
  // **This can be seen nowhere else.** The rows' reading is DOM inside the menu, so a misspelt row
  // leaves the wasm unhurt. It breaks only as "choose it and the page does not change". **The
  // direction only swaps the vertical measure**, so landscape is looked at too.
  ks.openMenu("paper-size");
  check(ks.flyPick("paper-size", "A4"), "\"A4\" can be chosen from the paper sizes");
  const a4 = app.paper();
  check(a4.page_width === 794 && a4.page_height === 1123,
    "the size chosen goes into the document's settlement ("
      + a4.page_width + "x" + a4.page_height + ")");
  check(ks.flyNow("paper-size") === "A4",
    "the size chosen comes out to the shut row's right (" + ks.flyNow("paper-size") + ")");
  check(ks.flyPick("paper-turn", "Landscape"),
    "\"Landscape\" can be chosen from the printing directions");
  const wide = app.paper();
  check(wide.page_width === 1123 && wide.page_height === 794,
    "landscape swaps the vertical measure (" + wide.page_width + "x" + wide.page_height + ")");
  check(ks.flyPick("paper-size", "Do not split into pages"),
    "it can go back to \"Do not split into pages\"");
  check(app.paper().band === 0, "it goes back to not splitting into pages");
  // Caution: **Put the page back for the checks that follow** (below relies on a 300x200 page).
  app.setPaper(pageOf(300, 200, 20));

  // 24. A page's header and footer come out black inside the margin.
  //
  // **This can be seen nowhere else.** The bands sit inside the margin, outside the frame cut out.
  // Landed wrong, the wasm still returns the right coordinates, and it draws outside the page. It
  // counts the black pixels inside the lower margin (0 before the band goes in).
  const inFooter = () => {
    // **The pixels are apart from the page's measures** (the screen's fineness), so the ratio is
    // taken from the canvas.
    const s = sheet.width / 300;
    const p = sheet.getContext("2d")
      .getImageData(0, Math.round(180 * s), sheet.width, Math.round(20 * s)).data;
    let n = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i] < 80 && p[i + 1] < 80 && p[i + 2] < 80) n += 1;
    }
    return n;
  };
  check(inFooter() === 0,
    "before the band goes in there is nothing in the lower margin ("
      + inFooter() + " pixels)");
  const footBox = document.getElementById("footer-text");
  footBox.value = "{page}/{pages}";
  footBox.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.chrome("footer") === "{page}/{pages}",
    "the input field is wired to the band's text");
  app.paintPage(sheet, 0);
  check(inFooter() > 0,
    "the band comes out black inside the lower margin (" + inFooter() + " pixels)");
  footBox.value = "";
  footBox.dispatchEvent(new Event("change", { bubbles: true }));
  app.paintPage(sheet, 0);
  check(inFooter() === 0, "emptying the text deletes the band too");

  // 24'. The letter spacing of justification acts on the real drawer too.
  //
  // **This can be seen nowhere else.** Drop the place that hands the spacing over, and the text is
  // drawn packed while every coordinate stays right. The page is white, so the rightmost black
  // pixel per row is that row's last character.
  //
  // Caution: **Do not compare with the row's right edge itself.** A character's ink does not reach
  // the right edge of its advance, so the verdict changes with the fonts on the machine.
  // **Do not set one pixel row's ink against another layout's.** Latin letters do not ink their
  // whole box. Where the last character has no ink, the rightmost ink is an earlier character's.
  // A row's leftmost ink can be a cell or an indented block rather than a line's head.
  // **How much spacing is dealt is looked at from the boxes** (`kspage/tests/wasm/style.mjs`); what
  // is left here is only **that the drawer applied it at all.**
  const inkEdges = () => {
    const s = sheet.width / 320;
    const p = sheet.getContext("2d").getImageData(0, 0, sheet.width, sheet.height).data;
    const far = new Array(sheet.height).fill(-1);
    for (let i = 0; i < p.length; i += 4) {
      if (p[i] >= 80 || p[i + 1] >= 80 || p[i + 2] >= 80) continue;
      const at = i / 4;
      const row = Math.floor(at / sheet.width);
      const x = (at % sheet.width) / s;
      if (x > far[row]) far[row] = x;
    }
    return far;
  };
  app.setPaper(pageOf(320, 600, 20));
  const bodyAt = app.styleNames().indexOf("body");
  check(bodyAt >= 0, "body is in the style table");
  const wasSpec = app.styleData(bodyAt);
  app.paintPage(sheet, 0);
  const plainEdges = inkEdges();
  app.setStyleData(bodyAt, { ...wasSpec, align: "justify" });
  check(app.styleData(bodyAt).align === "justify",
    "the menu's justification goes into the style");
  app.paintPage(sheet, 0);
  const spreadEdges = inkEdges();
  // It picks the row that moved furthest right. **Only the wrapped rows move** (a paragraph's last
  // row gets no spacing and stays landed left).
  let spreadRow = -1;
  let moved = 0;
  for (let i = 0; i < spreadEdges.length; i++) {
    if (plainEdges[i] < 0 || spreadEdges[i] < 0) continue;
    if (spreadEdges[i] - plainEdges[i] > moved) {
      moved = spreadEdges[i] - plainEdges[i];
      spreadRow = i;
    }
  }
  const edgeAt = (edges) => (spreadRow < 0 ? "there is no row" : edges[spreadRow]);
  check(spreadRow >= 0,
    "the letter spacing reaches the characters right ("
      + edgeAt(plainEdges) + " -> " + edgeAt(spreadEdges) + ")");
  // A style that does not wrap (a code block) spreads right beyond the row's width.
  //
  // **This can be seen nowhere else**: whether the menu's tick is wired to the style needs pressing
  // it and having it drawn.
  // Caution: **Do not look at it by the pixel count inside one page.** Stop the wrapping, and the
  // document shortens, so more fits on the first sheet and the pixels grow. The check would fall
  // once the sample grows, though the settlement acts. It is looked at by how many sheets the whole
  // document comes to.
  const tallWas = Math.round(canvas.getBoundingClientRect().height);
  app.setStyleData(bodyAt, { ...wasSpec, wrap: false });
  check(app.styleData(bodyAt).wrap === false,
    "the menu's taking the wrapping off goes into the style");
  app.paintPage(sheet, 0);
  const tallNow = Math.round(canvas.getBoundingClientRect().height);
  check(tallNow < tallWas,
    "not wrapping shortens the document (" + tallWas + " -> " + tallNow + "px)");
  app.setStyleData(bodyAt, wasSpec);
  check(app.styleData(bodyAt).wrap === undefined, "undoing puts the wrapping back too");
  app.setPaper({});

  // 23'''. Stop it at the body's width and the row narrows inside the window.
  //
  // **This can be seen nowhere else.** It checks that the field is wired to the style table, and
  // that what was stopped reaches the redraw. It breaks as "type in the field and nothing
  // happens".
  // Caution: **Settle it from the window's width.** A number settled up front passes unstopped on a
  // machine with a narrow window.
  // It presses the row's head, so the cursor stands at the row's left edge.
  const caretBox = app.caretElement;
  const textWide = document.getElementById("text-width");
  const roomWide = canvas.getBoundingClientRect().width;
  const headLeft = () => {
    press(1, 20);
    return caretBox.getBoundingClientRect().left;
  };
  const wasHead = headLeft();
  const half = Math.round(roomWide / 2);
  textWide.value = half;
  textWide.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.paper().reading_width === half,
    "the width written in the field goes into the document's settlement (" + half + ")");
  // Caution: **It must come in by half the slack.** "It came in" alone passes for a shape
  // landed left too.
  const slack = Math.round((roomWide - half) / 2);
  const inward = Math.round(headLeft() - wasHead);
  check(Math.abs(inward - slack) <= 2,
    "the row's head comes in by half the slack (" + inward + " / " + slack + ")");
  // **The width recommended must be pressable**, for whoever does not know the numbers. 640 is
  // `port/web/paper.js`'s `READ_WIDTH` (45 to 75 characters at 13px).
  document.getElementById("text-width-read").click();
  check(app.paper().reading_width === 640,
    "pressing the width recommended stops it at 640px");
  textWide.value = "";
  textWide.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.paper().reading_width === undefined, "emptying it stops nothing");
  check(Math.round(headLeft()) === Math.round(wasHead),
    "undoing puts the row's head back too");

  // 23''''. The viewing side's overrides (not saved, and not landing on the page).
  //
  // **This can be seen nowhere else**: that the fields are wired to the overrides, and that copying
  // to paper does not take them.
  // **The body's width and type size have no field of their own.** The document's width is the
  // settlement under File, and the browser's zoom enlarges what is read.
  check(document.getElementById("over-width") === null
    && document.getElementById("over-size") === null,
    "there is no field for a width or a type size of the viewer's own");
  const overPlain = document.getElementById("over-plain");
  // Fitting the document's colours to the screen.
  // Caution: **Look at it by pixels** (the colour drawn is the answer).
  // It is looked at by the code block's fill (#f5f5f5) vanishing; the document does not move.
  const fillOf = (want) => {
    const band = canvas.getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (Math.abs(band[i] - want[0]) < 6 && Math.abs(band[i + 1] - want[1]) < 6 &&
        Math.abs(band[i + 2] - want[2]) < 6) n += 1;
    }
    return n;
  };
  const codeAt = app.styleNames().indexOf("code");
  const codeFill = app.styleData(codeAt).fill;
  check(codeFill !== undefined,
    "the sample's code block has a fill (" + codeFill + ")");
  const painted = fillOf([245, 245, 245]);
  check(painted > 100, "that fill is out on the canvas (" + painted + " pixels)");
  overPlain.checked = true;
  overPlain.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().plain === true, "the tick goes into the override");
  // **It does not become 0.** Pictures come out as they are. Inverting pictures and highlighter on
  // a dark screen is the standard complaint, so this is "do not use the document's colours" and
  // nothing more.
  const left = fillOf([245, 245, 245]);
  check(left * 20 < painted,
    "fitting to the screen deletes the document's fill ("
      + painted + " -> " + left + " pixels)");
  check(app.styleData(codeAt).fill === codeFill, "the document's own fill does not move");
  // **It does not land on the page** (a page comes out in the document's colours), looked at by the
  // faint fill over the white paper.
  const plainSheet = document.createElement("canvas");
  app.paintPage(plainSheet, 0);
  const onPaper = plainSheet.getContext("2d")
    .getImageData(0, 0, plainSheet.width, plainSheet.height).data;
  let paperFills = 0;
  for (let i = 0; i < onPaper.length; i += 4) {
    if (Math.abs(onPaper[i] - 245) < 6 && Math.abs(onPaper[i + 1] - 245) < 6 &&
      Math.abs(onPaper[i + 2] - 245) < 6) paperFills += 1;
  }
  check(paperFills > 100,
    "the document's fill comes out on the page (" + paperFills + " pixels)");
  overPlain.checked = false;
  overPlain.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().plain === false, "it can be taken off");
  check(fillOf([245, 245, 245]) > 100, "taking them off puts the document's fill back");

  // The paper's settings must ride on the record for undoing.
  //
  // **This can be seen nowhere else**: unridden, `undo()` puts **the rewrite before it** back and
  // the paper stays changed.
  // Caution: **Try it after typing.** Change the paper alone and `undo()` returns false with an
  // empty record, so "nothing happens" passes and the shape that eats characters is missed.
  app.setPaper({});
  press(20, 20);
  keyIn("End");
  const typedWas = app.text().length;
  ime.dispatchEvent(new InputEvent("input",
    { data: "ab", inputType: "insertText", bubbles: true }));
  const typed = app.text().length;
  check(typed > typedWas, "what was typed goes in (" + typedWas + " -> " + typed + ")");
  app.setPaper(pageOf(640, 900, 30));
  check(app.paper().page_width === 640, "the paper changes");
  check(app.undo(), "it can be undone");
  check(app.paper().page_width === undefined,
    "the undo puts the paper back (" + app.paper().page_width + ")");
  check(app.text().length === typed,
    "what was typed does not come back (" + app.text().length + ")");
  check(app.redo() && app.paper().page_width === 640, "the redo puts the paper back");
  // **Do not stack a step for the same setting.** The screen hands all seven fields over whichever
  // is touched, so stacked, steps where "a press puts nothing back" line up.
  app.setPaper(pageOf(640, 900, 30));
  check(app.undo() && app.paper().page_width === undefined, "the same setting stacks no step");
  app.setPaper({});

  // 23'''''. A document with no paper settled becomes a page with margins in printing too.
  //
  // **This can be seen nowhere else.** Guessing the page borrowed is the JS's side (`api_show.js`'s
  // `paintPages`). The numbers are the core's (`../../model/paper.kspl`'s `a4_portrait`, watched
  // in `../wasm/paper.mjs`). **Borrow the size alone, and a page with 0 margin comes out.** The
  // bands have nowhere to lay, and the body sticks to the page's break, so **the text looks cut off
  // at the break**. Plain text (a program's source), Markdown and a fresh document all have no
  // paper settled.
  const wasPaper = app.paper();
  app.setPaper({});
  check(app.paper().page_height === undefined,
    "it can be put into the state with no paper settled");
  const bareSheet = document.createElement("canvas");
  app.paintPage(bareSheet, 0);
  check(bareSheet.width === 794 && bareSheet.height === 1123,
    "the page borrowed is A4 (" + bareSheet.width + "x" + bareSheet.height + ")");
  // Caution: **The measures handed to `@page` and the measures of the canvas drawn must be the
  // same.** Out of step, the canvas does not fit the page. **Each sheet overflows, the overflow
  // looking like a blank page** (with no measures, the browser picks its own paper). So it asks for
  // the page printing actually uses (`api_show.js`'s `printPaper`).
  const willPrint = app.printPaper();
  check(willPrint.page_width > 0 && willPrint.page_height > 0,
    "even for a document with no paper settled, the measures of the page printing uses are "
      + "settled");
  check(willPrint.page_width === bareSheet.width && willPrint.page_height === bareSheet.height,
    "those measures are the same as the canvas drawn ("
      + willPrint.page_width + "x" + willPrint.page_height + ")");
  // There must be no ink in the upper and lower bands.
  // Caution: **Look at it per row** (in the overall pixel count one row of a narrow band is
  // buried).
  const inkRow = (data, wide, y) => {
    let n = 0;
    for (let x = 0; x < wide; x += 1) {
      if (data[(y * wide + x) * 4] < 200) n += 1;
    }
    return n;
  };
  const bareInk = bareSheet.getContext("2d")
    .getImageData(0, 0, bareSheet.width, bareSheet.height).data;
  let firstInk = -1;
  for (let y = 0; y < bareSheet.height; y += 1) {
    if (inkRow(bareInk, bareSheet.width, y) > 0) { firstInk = y; break; }
  }
  let lastInk = -1;
  for (let y = bareSheet.height - 1; y >= 0; y -= 1) {
    if (inkRow(bareInk, bareSheet.width, y) > 0) { lastInk = y; break; }
  }
  check(firstInk >= 24,
    "there is a band's slack at the page's top (the first ink is at y=" + firstInk + ")");
  check(lastInk <= bareSheet.height - 24,
    "there is a band's slack at the page's bottom too (the last ink is at y=" + lastInk
      + " / height " + bareSheet.height + ")");
  // Caution: **A band must come out in the margin borrowed** (slack being there alone does not tell
  // whether what lays a band is wired).
  const wasBand = app.chrome(0);
  app.setChrome(0, "the head band");
  const headSheet = document.createElement("canvas");
  app.paintPage(headSheet, 0);
  const headInk = headSheet.getContext("2d")
    .getImageData(0, 0, headSheet.width, headSheet.height).data;
  let bandInk = 0;
  for (let y = 0; y < firstInk; y += 1) {
    bandInk += inkRow(headInk, headSheet.width, y);
  }
  check(bandInk > 0,
    "the band comes out inside the margin borrowed (" + bandInk + " pixels)");
  app.setChrome(0, wasBand);
  // Caution: **Put it back** (a later section runs on top of the document an earlier
  // one laid down).
  app.setPaper(wasPaper);
  check(app.paper().page_height === wasPaper.page_height,
    "the document's settlement goes back as it was");
}

// Links and the contents.
//
// The style names it reaches for (`heading`, `amount`, `bullet`, `strong`) are the document's,
// defined by `kspage/content`'s sample, so they follow that side.

function kspageProbeLink(ks) {
  const { check, app, canvas, ime, spot, pressAt, undoKey, openMenu } = ks;

  const box = canvas.getBoundingClientRect();

  // 25. The link button, and jumping on a press with Ctrl held.
  //
  // **This can be seen nowhere else**: whether it jumps on that combination of keys with the cursor
  // staying put. It breaks as "it does not jump on the press" and "the text's position jumps".
  // Caution: **Do not let a window open.** A second window left open stops a headed browser drawing
  // the DOM, and it runs out of time with not one mark put out. Only the attempt is held, and put
  // straight back.
  openMenu("link-apply");
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  const hrefField = document.getElementById("href");
  hrefField.value = "https://example.com/";
  document.getElementById("link-apply").click();
  check(app.href() === "https://example.com/", "the button is wired to where it links");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");

  // It hunts for where it landed, and presses with Ctrl held.
  const realOpen = window.open;
  let opened_to = "";
  window.open = (to) => { opened_to = to; return null; };
  let hitLink = false;
  // A Ctrl+press not over a link moves the cursor. So the cursor just before each press is held,
  // to look at the jumping round alone.
  let caretWas = "";
  for (let y = 8; y < box.height && !hitLink; y += 4) {
    for (let x = 4; x < 200 && !hitLink; x += 8) {
      caretWas = ime.style.left + "," + ime.style.top;
      canvas.dispatchEvent(new PointerEvent("pointerdown",
        { ...spot(x, y), ctrlKey: true }));
      hitLink = opened_to !== "";
    }
  }
  window.open = realOpen;
  check(hitLink, "with Ctrl held it jumps to the link (" + opened_to + ")");
  check(opened_to === "https://example.com/", "where it jumps is the link that was landed");
  // **Where it jumped, the cursor does not move**, or the sequel cannot be typed where you come
  // back to.
  const caretNow = ime.style.left + "," + ime.style.top;
  check(caretNow === caretWas, "a jump does not move the cursor (" + caretWas + ")");
  document.getElementById("link-clear").click();
  check(app.href() === "", "the button that takes it off is wired too");

  // 26. The contents button, and the style's heading field.
  //
  // **This can be seen nowhere else.** It checks that the button is wired to the contents' entry
  // point, and the style's field to the depth. A misspelt id leaves the core unhurt. The contents
  // pick the headings up, so it is told by one text growing.
  openMenu("put-toc");
  // `text()` is the laid-out boxes joined, so it grows once the entries come out (that they do not
  // go into the document is the wasm checks').
  // The Markdown written out lists the entries as items, so they are counted there too.
  const items = () => (app.markdown().match(/^ *- /gm) || []).length;
  const beforeToc = app.text().length;
  const itemsBefore = items();
  document.getElementById("put-toc").click();
  check(app.text().length > beforeToc, "a press puts the contents' entries out on the screen");
  const itemsWithToc = items();
  check(itemsWithToc > itemsBefore, "the contents' entries come out in what is written out");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // The style's field is wired to the heading's depth. **0 is "not a heading".**
  openMenu("style-apply");
  const headAt = app.styleNames().indexOf("heading");
  check(headAt >= 0, "h1 is in the row of styles");
  check(ks.flyPick("style-pick", "heading"),
    "the heading style can be chosen from the set of styles to change");
  check(document.getElementById("style-outline").value === "1",
    "the heading's depth comes out in the field");
  document.getElementById("style-outline").value = "0";
  document.getElementById("style-apply").click();
  check(app.styleData(headAt).outline === undefined, "changing the field changes the depth too");
  check(ks.flyTick("style-collect") === "Do not gather",
    "the set for how it gathers gets the mark too (" + ks.flyTick("style-collect") + ")");
  check(items() < itemsWithToc, "taking the heading off takes its entries out too");
  undoKey();
  check(app.styleData(headAt).outline === 1, "one undo puts the depth back");

  // The fields that settle a change of look by value (a conditional style).
  //
  // **This can be seen nowhere else.** The three fields are DOM inside the menu (a misspelt id
  // breaks as "settle it and nothing changes"). What it lays over is chosen from the styles there.
  // The list is made from the style table, so a style just made is not in it.
  openMenu("style-apply");
  const moneyAt = app.styleNames().indexOf("amount");
  check(moneyAt >= 0, "the sample holds a money style");
  // The partner for choosing afresh: moving away and back shows the field filled afresh.
  const itemAt = app.styleNames().indexOf("bullet");
  check(itemAt >= 0, "the sample holds an item style");
  check(ks.flyPick("style-pick", "amount"),
    "the money style can be chosen from the set of styles to change");
  check(ks.flyTick("style-when") === "No condition",
    "the settlement starts from no condition (" + ks.flyTick("style-when") + ")");
  check(ks.flyPick("style-when", "Greater than"),
    "\"Greater than\" can be chosen from the conditions");
  document.getElementById("style-when-than").value = "100";
  check(ks.flyPick("style-when-then", "strong"),
    "the emphasis style can be chosen from the styles to lay over");
  document.getElementById("style-apply").click();
  const setWhen = app.styleData(moneyAt);
  check(setWhen.when_above === 100 && setWhen.when_then === "strong",
    "the fields are wired to the settlement ("
      + setWhen.when_above + "/" + setWhen.when_then + ")");
  // **It must come out in the field on choosing afresh**, or the settlement vanishes on a change.
  check(ks.flyPick("style-pick", "bullet"), "it can move to another style");
  check(ks.flyPick("style-pick", "amount"), "it can go back to the original style");
  check(ks.flyTick("style-when") === "Greater than",
    "choosing afresh puts the mark out again (" + ks.flyTick("style-when") + ")");
  check(ks.flyTick("style-when-then") === "strong",
    "the name of the style laid over comes out again too (" + ks.flyTick("style-when-then") + ")");
  check(ks.flyPick("style-when", "No condition"), "it can go back to no condition");
  document.getElementById("style-apply").click();
  check(app.styleData(moneyAt).when_above === undefined, "it goes back to no condition");

  // The field for how a date is shown.
  //
  // **This can be seen nowhere else**: the field is DOM inside the menu (a misspelt id breaks as
  // "choose it and it stays a number"). **It is an entry point that swaps the lot**, so the digits
  // and the texts before and after must survive choosing a date.
  openMenu("style-apply");
  check(ks.flyTick("style-dated") === "As a number",
    "the date set starts from staying a number (" + ks.flyTick("style-dated") + ")");
  check(document.getElementById("style-prefix").value === "$",
    "the text before comes out in the field");
  check(ks.flyPick("style-dated", "18 August 2026"),
    "the long form can be chosen from the date set");
  document.getElementById("style-apply").click();
  check(app.styleData(moneyAt).dated === "long",
    "the field is wired to how a date is shown (" + app.styleData(moneyAt).dated + ")");
  check(app.styleData(moneyAt).prefix === "$", "the text before does not fall away");
  // **It must come out in the field on choosing afresh**, or how it is shown vanishes on a change.
  check(ks.flyPick("style-pick", "bullet"), "it can move to another style (dates)");
  check(ks.flyPick("style-pick", "amount"), "it can go back to the original style (dates)");
  check(ks.flyTick("style-dated") === "18 August 2026",
    "choosing afresh puts the mark out again (" + ks.flyTick("style-dated") + ")");
  // The cells show a long-form date (760 days from the origin, 31 January 1972). **The needle is
  // the shape, not one month's name**: a month keyed on goes quiet once a sample number changes,
  // the shape goes red.
  check(/\d{1,2} [A-Z][a-z]+ \d{4}/.test(app.text()), "the screen becomes a long-form date");
  check(ks.flyPick("style-dated", "As a number"), "it can go back to staying a number");
  document.getElementById("style-apply").click();
  check(app.styleData(moneyAt).dated === undefined, "it goes back to staying a number");
}
