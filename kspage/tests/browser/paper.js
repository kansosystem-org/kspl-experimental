// Copying to paper, a page's header and footer, and the letter spacing of justification.
//
// The style names (`body`, `code`) are the document's and the placeholders `{page}` / `{pages}` are
// the core's (`kspage/port/web/paper.kspls`), so those needles follow those sides.

function kspageProbePaper(ks) {
  const { check, app, canvas, press, keyIn, ime } = ks;

  // 23. Copy to paper and it becomes black text on white paper.
  //
  // **This can be seen nowhere else**: the screen's colours come from `getComputedStyle`, so on a
  // dark screen the text is white, and copied to paper as it stands **nothing is visible on the
  // page** — told only by the canvas's pixels.
  const sheet = document.createElement("canvas");
  app.setPaper({ width: 300, height: 200, left: 20, top: 20, right: 20, bottom: 20 });
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
  // **This can be seen nowhere else**: the rows' reading is DOM inside the menu, so a misspelt row
  // leaves the wasm unhurt and breaks only as "choose it and the page does not change". **The
  // direction only swaps the vertical measure**, so landscape is looked at too.
  ks.openMenu("paper-size");
  check(ks.flyPick("paper-size", "A4"), "\"A4\" can be chosen from the paper sizes");
  const a4 = app.paper();
  check(a4.width === 794 && a4.height === 1123,
    "the size chosen goes into the document's settlement ("
      + a4.width + "x" + a4.height + ")");
  check(ks.flyNow("paper-size") === "A4",
    "the size chosen comes out to the shut row's right (" + ks.flyNow("paper-size") + ")");
  check(ks.flyPick("paper-turn", "Landscape"),
    "\"Landscape\" can be chosen from the printing directions");
  const wide = app.paper();
  check(wide.width === 1123 && wide.height === 794,
    "landscape swaps the vertical measure (" + wide.width + "x" + wide.height + ")");
  check(ks.flyPick("paper-size", "Do not split into pages"),
    "it can go back to \"Do not split into pages\"");
  check(app.paper().band === 0, "it goes back to not splitting into pages");
  // Caution: **Put the page back for the checks that follow** (below relies on a 300x200 page).
  app.setPaper({ width: 300, height: 200, left: 20, top: 20, right: 20, bottom: 20 });

  // 24. A page's header and footer come out black inside the margin.
  //
  // **This can be seen nowhere else**: the bands sit inside the margin, outside the frame cut out;
  // landed wrong, the wasm still returns the right coordinates and it draws outside the page. It
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
  // **This can be seen nowhere else**: drop the place that hands the spacing over and the text is
  // drawn packed while every coordinate stays right. The page is white, so the rightmost black
  // pixel per row is that row's last character.
  //
  // Caution: **Do not compare with the row's right edge itself.** A character's ink does not reach
  // the right edge of its advance, so the verdict changes with the fonts on the machine.
  // **Do not set one pixel row's ink against another layout's.** Latin letters do not ink their
  // whole box, so where the last character has no ink the rightmost ink is an earlier character's,
  // and a row's leftmost ink can be a cell or an indented block rather than a line's head.
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
  app.setPaper({ width: 320, height: 600, left: 20, top: 20, right: 20, bottom: 20 });
  const bodyAt = app.styleNames().indexOf("body");
  check(bodyAt >= 0, "body is in the style table");
  const wasSpec = app.stylePara(bodyAt);
  app.paintPage(sheet, 0);
  const plainEdges = inkEdges();
  app.setStylePara(bodyAt, { ...wasSpec, align: "justify" });
  check(app.stylePara(bodyAt).align === "justify",
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
  // Caution: **Do not look at it by the pixel count inside one page.** Stop the wrapping and the
  // document shortens, so more fits on the first sheet and the pixels grow; the check would fall
  // once the sample grows, though the settlement acts. It is looked at by how many sheets the whole
  // document comes to.
  const tallWas = Math.round(canvas.getBoundingClientRect().height);
  app.setStylePara(bodyAt, { ...wasSpec, wrap: false });
  check(app.stylePara(bodyAt).wrap === false,
    "the menu's taking the wrapping off goes into the style");
  app.paintPage(sheet, 0);
  const tallNow = Math.round(canvas.getBoundingClientRect().height);
  check(tallNow < tallWas,
    "not wrapping shortens the document (" + tallWas + " -> " + tallNow + "px)");
  app.setStylePara(bodyAt, wasSpec);
  check(app.stylePara(bodyAt).wrap === true, "undoing puts the wrapping back too");
  app.setPaper({});

  // 23'''. Stop it at the body's width and the row narrows inside the window.
  //
  // **This can be seen nowhere else**: that the field is wired to the style table and what was
  // stopped reaches the redraw (it breaks as "type in the field and nothing happens").
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
  check(app.paper().reading === half,
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
  check(app.paper().reading === 640,
    "pressing the width recommended stops it at 640px");
  textWide.value = "";
  textWide.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.paper().reading === 0, "emptying it stops nothing");
  check(Math.round(headLeft()) === Math.round(wasHead),
    "undoing puts the row's head back too");

  // 23''''. The viewing side's overrides (not saved, and not landing on the page).
  //
  // **This can be seen nowhere else**: that the fields are wired to the overrides, and that copying
  // to paper takes them off and puts them back (it breaks as "printed at the viewing width" and
  // "after printing the screen's width does not come back").
  const overWide = document.getElementById("over-width");
  const overPlain = document.getElementById("over-plain");
  const third = Math.round(roomWide / 3);
  overWide.value = third;
  overWide.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().reading === third,
    "the width written in the field goes into the override (" + third + ")");
  check(app.paper().reading === 0, "the document's settlement does not move");
  const overSlack = Math.round((roomWide - third) / 2);
  const overInward = Math.round(headLeft() - wasHead);
  check(Math.abs(overInward - overSlack) <= 2,
    "the row lands at the width overridden (" + overInward + " / " + overSlack + ")");
  // Caution: **Take the overrides off while copying to paper** (a page is a thing that comes out by
  // the document's settlement).
  // With no paper width settled, an override would narrow the paper by that much too.
  const paperSheet = document.createElement("canvas");
  app.paintPage(paperSheet, 0);
  check(paperSheet.width > third + 40,
    "the page does not come out at the width overridden ("
      + paperSheet.width + " / " + third + ")");
  // Caution: **Put them back after copying.** Unput-back, the screen after printing stays at the
  // document's width.
  check(app.over().reading === third, "after copying the override is still there");
  check(Math.abs(Math.round(headLeft() - wasHead) - overSlack) <= 2,
    "the screen is still landed too");
  // The body's font size. **This can be seen nowhere else**: that the field is wired to the
  // overrides, is remembered, and comes off while copying to paper.
  // Caution: **Look at it by the box's size** (reading the field's number back alone lets the shape
  // where it never reached the laying-out walk past).
  // The cursor's length follows the row's height, so whether the text grew can be read here.
  const overSize = document.getElementById("over-size");
  const caretTall = () => {
    press(1, 20);
    return caretBox.getBoundingClientRect().height;
  };
  const wasTall = caretTall();
  overSize.value = 32;
  overSize.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().size === 32,
    "the size written in the field goes into the override (" + app.over().size + ")");
  check(caretTall() > wasTall + 4,
    "the body grows at the size written (" + wasTall + " → " + caretTall() + ")");
  // Caution: **Remember it** (do not make it put in afresh every time).
  // Where it is remembered is the one place `keptPick`.
  let keptSize = null;
  try {
    keptSize = localStorage.getItem("kspage.over.size");
  } catch (_) { /* it works on a page that cannot remember too */ }
  check(keptSize === null || keptSize === "32",
    "the size put in is remembered (" + keptSize + ")");
  overSize.value = "";
  overSize.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().size === 0 && Math.abs(caretTall() - wasTall) < 1,
    "emptying it goes back to the original size (" + caretTall() + ")");
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
  const codeFill = app.styleEdge(codeAt).fill;
  check(codeFill !== null,
    "the sample's code block has a fill (" + codeFill + ")");
  const painted = fillOf([245, 245, 245]);
  check(painted > 100, "that fill is out on the canvas (" + painted + " pixels)");
  overPlain.checked = true;
  overPlain.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().plain === true, "the tick goes into the override");
  // **It does not become 0.** Pictures come out as they are — inverting pictures and highlighter on
  // a dark screen is the standard complaint, so this is "do not use the document's colours" and
  // nothing more.
  const left = fillOf([245, 245, 245]);
  check(left * 20 < painted,
    "fitting to the screen deletes the document's fill ("
      + painted + " -> " + left + " pixels)");
  check(app.styleEdge(codeAt).fill === codeFill, "the document's own fill does not move");
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
  overWide.value = "";
  overWide.dispatchEvent(new Event("change", { bubbles: true }));
  check(app.over().reading === 0 && app.over().plain === false, "both can be taken off");
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
  app.setPaper({ width: 640, height: 900, left: 30, top: 30, right: 30, bottom: 30 });
  check(app.paper().width === 640, "the paper changes");
  check(app.undo(), "it can be undone");
  check(app.paper().width === 0,
    "the undo puts the paper back (" + app.paper().width + ")");
  check(app.text().length === typed,
    "what was typed does not come back (" + app.text().length + ")");
  check(app.redo() && app.paper().width === 640, "the redo puts the paper back");
  // **Do not stack a step for the same setting.** The screen hands all seven fields over whichever
  // is touched, so stacked, steps where "a press puts nothing back" line up.
  app.setPaper({ width: 640, height: 900, left: 30, top: 30, right: 30, bottom: 30 });
  check(app.undo() && app.paper().width === 0, "the same setting stacks no step");
  app.setPaper({});

  // 23'''''. A document with no paper settled becomes a page with margins in printing too.
  //
  // **This can be seen nowhere else**: guessing the page borrowed is the JS's side (`api_show.js`'s
  // `paintPages`); the numbers are the core's (`../../model/paper.kspls`'s `a4_portrait`, watched
  // in `../wasm/paper.mjs`). **Borrow the size alone and a page with 0 margin comes out** — the
  // bands have nowhere to lay, and the body sticks to the page's break, so **the text looks cut off
  // at the break**. Plain text (a program's source), Markdown and a fresh document all have no
  // paper settled.
  const wasPaper = app.paper();
  app.setPaper({});
  check(app.paper().height === 0, "it can be put into the state with no paper settled");
  const bareSheet = document.createElement("canvas");
  app.paintPage(bareSheet, 0);
  check(bareSheet.width === 794 && bareSheet.height === 1123,
    "the page borrowed is A4 (" + bareSheet.width + "x" + bareSheet.height + ")");
  // Caution: **The measures handed to `@page` and the measures of the canvas drawn must be the
  // same.** Out of step, the canvas does not fit the page and **each sheet overflows, the overflow
  // looking like a blank page** (with no measures, the browser picks its own paper). So it asks for
  // the page printing actually uses (`api_show.js`'s `printPaper`).
  const willPrint = app.printPaper();
  check(willPrint.width > 0 && willPrint.height > 0,
    "even for a document with no paper settled, the measures of the page printing uses are "
      + "settled");
  check(willPrint.width === bareSheet.width && willPrint.height === bareSheet.height,
    "those measures are the same as the canvas drawn ("
      + willPrint.width + "x" + willPrint.height + ")");
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
  check(app.paper().height === wasPaper.height,
    "the document's settlement goes back as it was");
}
