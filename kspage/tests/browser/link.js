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
  // staying put (it breaks as "it does not jump on the press" and "the text's position jumps").
  // Caution: **Do not let a window open.** A second window left open stops a headed browser drawing
  // the DOM, and it runs out of time with not one mark put out; only the attempt is held, and put
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
  // A Ctrl+press not over a link moves the cursor, so the cursor just before each press is held, to
  // look at the jumping round alone.
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
  // **This can be seen nowhere else**: whether the button is wired to the contents' entry point and
  // the style's field to the depth (a misspelt id leaves the core unhurt). The contents pick the
  // headings up, so it is told by one text growing.
  openMenu("put-toc");
  // `text()` is the laid-out boxes joined, so it grows once the entries come out (that they do not
  // go into the document is the wasm checks').
  const beforeToc = app.text().length;
  document.getElementById("put-toc").click();
  check(app.text().length > beforeToc, "a press puts the contents' entries out on the screen");
  check(app.html().indexOf("margin-left:0px\">") >= 0,
    "the contents' entries come out in what is written out");
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
  check(app.styleOutline(headAt).level === 0, "changing the field changes the depth too");
  check(ks.flyTick("style-collect") === "Do not gather",
    "the set for how it gathers gets the mark too (" + ks.flyTick("style-collect") + ")");
  check(app.html().indexOf("margin-left:0px\">") < 0,
    "taking the heading off empties the contents too");
  undoKey();
  check(app.styleOutline(headAt).level === 1, "one undo puts the depth back");

  // The fields that settle a change of look by value (a conditional style).
  //
  // **This can be seen nowhere else**: the three fields are DOM inside the menu (a misspelt id
  // breaks as "settle it and nothing changes"). What it lays over is chosen from the styles there;
  // the list is made from the style table, so a style just made is not in it.
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
  const setWhen = app.styleWhen(moneyAt);
  check(setWhen.how === "above" && setWhen.than === 100 && setWhen.then === "strong",
    "the fields are wired to the settlement ("
      + setWhen.how + "/" + setWhen.than + "/" + setWhen.then + ")");
  // **It must come out in the field on choosing afresh**, or the settlement vanishes on a change.
  check(ks.flyPick("style-pick", "bullet"), "it can move to another style");
  check(ks.flyPick("style-pick", "amount"), "it can go back to the original style");
  check(ks.flyTick("style-when") === "Greater than",
    "choosing afresh puts the mark out again (" + ks.flyTick("style-when") + ")");
  check(ks.flyTick("style-when-then") === "strong",
    "the name of the style laid over comes out again too (" + ks.flyTick("style-when-then") + ")");
  check(ks.flyPick("style-when", "No condition"), "it can go back to no condition");
  document.getElementById("style-apply").click();
  check(app.styleWhen(moneyAt).how === "none", "it goes back to no condition");

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
  check(app.styleNumber(moneyAt).dated === "long",
    "the field is wired to how a date is shown (" + app.styleNumber(moneyAt).dated + ")");
  check(app.styleNumber(moneyAt).prefix === "$", "the text before does not fall away");
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
  check(app.styleNumber(moneyAt).dated === "none", "it goes back to staying a number");
}
