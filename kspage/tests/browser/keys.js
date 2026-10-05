// Delete, bold and italic, Home and End, the name comments are written under.

function kspageProbeKeys(ks) {
  const { check, app, ime, pressAt, undoKey, openMenu } = ks;

  // 28. Whether the Delete key is wired to the next character (a misspelled key name leaves the
  // core unhurt: "nothing happens on the press"). It types, goes back left and deletes that one
  // character, since what sits next to the place pressed depends on earlier sections.
  pressAt(8);
  ime.dispatchEvent(new InputEvent("input",
    { data: "◆", inputType: "insertText", bubbles: true }));
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  const withMark = app.text();
  check(withMark.indexOf("◆") >= 0, "the mark typed goes in");
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
  check(app.text().indexOf("◆") < 0, "Delete deletes the next character");
  undoKey();
  check(app.text() === withMark, "Ctrl+Z brings the deleted character back");
  undoKey();
  check(app.text().indexOf("◆") < 0, "what was typed goes back too");

  // 28'. Ctrl+B and Ctrl+I, and the icons' shortcuts, are wired to bold and italic.
  // Caution: **Do not move the positions the later sections rely on** — bold changes the measures
  // and splits a run, so this section comes after the ones looking at the text's positions.
  // **Read the decoration landed before swapping the fields** (unread, the colour and the underline
  // fall away). Each press goes to and fro between "land it" and "as the parent has it".
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true,
    bubbles: true, cancelable: true }));
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true,
    bubbles: true, cancelable: true }));
  const boldKey = () => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "b", ctrlKey: true, bubbles: true, cancelable: true }));
  check(boldKey() === false, "Ctrl+B is taken over");
  check(app.spanInk().bold === true, "bold lands");
  // **The name is rebuilt with the decoration now landed** (the strength field at the back).
  check(app.style().indexOf("-w1") >= 0,
    "the strength field lines up behind the name (" + app.style() + ")");
  check(boldKey() === false && app.spanInk().bold === null,
    "pressing again goes back to as the parent has it");
  // Caution: **Where a text is put out on the row, see that it acts too.** The run here is a link,
  // underlined from the start, so it is looked at **swapping** (not from nothing landed), and
  // going back on another press.
  const underKey = () => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "u", ctrlKey: true, bubbles: true, cancelable: true }));
  const wasUnder = app.spanInk().underline;
  check(underKey() === false, "Ctrl+U is taken over");
  check(app.spanInk().underline !== wasUnder,
    "the shortcut swaps the underline (" + wasUnder + " → " + app.spanInk().underline + ")");
  check(underKey() === false && app.spanInk().underline === wasUnder,
    "pressing again goes back");
  // The icons' shortcuts go the same way, and a colour landed does not fall away.
  app.paintSpan({ color: "#ff0000" });
  document.getElementById("tool-italic").click();
  check(app.spanInk().italic === true, "the shortcut lands italic");
  check(app.spanInk().color === "#ff0000", "the colour that was landed does not fall away");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // The menu's row **mirrors what is settled now** (else choosing one afresh drops the rest).
  openMenu("paint-italic");
  check(ks.flyTick("paint-italic") === "Yes", "the menu's row mirrors the italic");
  check(ks.flyNow("paint-italic") === "Yes", "what is settled now comes out to the row's right too");
  // **Taking it off takes both off** (a run holds one name, so one operation is enough).
  check(ks.flyPick("style-set", "Unset"), "the Unset row is lined up");
  check(app.spanInk().italic === null && app.spanInk().color === null,
    "taking it off takes both off");
  pressAt(8);

  // 28''. Home and End, and Ctrl+A: **taken over by the page** (untaken, Home and End roll the
  // window and Ctrl+A selects the whole page without the body). The input field following the
  // cursor shows its move.
  const edgeKey = (key, shift) => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: key, shiftKey: shift === true, bubbles: true, cancelable: true }));
  check(edgeKey("End") === false, "End is taken over");
  const endLeft = parseFloat(ime.style.left);
  check(edgeKey("Home") === false, "Home is taken over");
  const headLeft = parseFloat(ime.style.left);
  check(headLeft < endLeft,
    "the cursor's place differs at the row's head and end (" + headLeft + "→" + endLeft + ")");
  check(edgeKey("End", true) === false, "Shift+End is taken over too");
  const lined = app.selectionText();
  check(lined.length > 0, "it can select on from head to end (" + lined + ")");
  const allKey = () => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "a", ctrlKey: true, bubbles: true, cancelable: true }));
  check(allKey() === false, "Ctrl+A is taken over");
  // **The length is not counted** (it would fall as the sample changes); more than one row is.
  check(app.selectionText().length > lined.length,
    "the whole document selects more than one row");
  pressAt(8);
  check(app.selectionText() === "", "pressing again takes the selection off");

  // 28'''. The name a comment is written under: the field wired to the page's `author`, which the
  // wasm cannot tell (`note.js` looks at the comment carrying it).
  const menu = openMenu("who");
  const who = document.getElementById("who");
  const wasAuthor = app.author;
  who.value = "Alice";
  who.dispatchEvent(new Event("input", { bubbles: true }));
  check(app.author === "Alice", "the name put in is the one comments are written under");
  menu.open = false;
  app.author = wasAuthor;
  who.value = wasAuthor;
}
