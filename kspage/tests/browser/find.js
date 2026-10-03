// Hunting and replacing; copying, cutting and pasting.
//
// What it hunts for (`document`) is the sample document's own text, so that needle moves when
// `kspage/content` does. The word it replaces in is this side's own. What it pastes is non-ASCII on
// purpose (the reason is where it is pasted).

function kspageProbeFind(ks) {
  const { check, app, canvas, ime, pressAt, undoKey } = ks;

  // 18. Hunting and replacing.
  //
  // **This can be seen nowhere else**: whether Ctrl+F is taken over, the focus moves to the field,
  // and goes back to the body after the press. Untaken, the browser's own hunt runs over a body
  // inside the canvas, so **not one hit is found**.
  // **There is no row.** The hunt field sits on the band's right side, so Ctrl+F jumps to the field
  // (a row folding and unfolding makes the body leap on every press).
  const findBox = document.getElementById("find-text");
  const findKey = new KeyboardEvent("keydown",
    { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
  window.dispatchEvent(findKey);
  check(findKey.defaultPrevented, "Ctrl+F is taken over");
  check(document.activeElement === findBox, "the focus moves to the hunt field");
  check(findBox.closest("#bar") !== null, "the hunt field is inside the band (it eats no row)");
  // The count comes out while typing.
  //
  // **This can be seen nowhere else**: counting is the wasm's, but the keystrokes' wiring to the
  // field needs the DOM (it breaks as "the count does not come out on the press").
  // Caution: **Put 0 out too** (left empty, whether it counted or the answer is 0 cannot be told).
  const tallyBox = document.getElementById("find-tally");
  const typeFind = (t) => {
    findBox.value = t;
    findBox.dispatchEvent(new InputEvent("input", { bubbles: true }));
  };
  typeFind("document");
  check(/^[1-9]\d* found$/.test(tallyBox.textContent),
    "typing puts the count out (" + tallyBox.textContent + ")");
  typeFind("a text that cannot be there");
  check(tallyBox.textContent === "0 found",
    "with none there, 0 comes out (" + tallyBox.textContent + ")");
  typeFind("");
  check(tallyBox.textContent === "", "with the field empty nothing comes out");

  // It hunts and selects.
  // In the hunt field Enter is "next".
  findBox.value = "document";
  findBox.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Enter", bubbles: true, cancelable: true }));
  check(app.selectionText() === "document",
    "what was found is selected (" + app.selectionText() + ")");
  // Caution: Say that nothing was found; gone quiet, it looks as though nothing happens.
  findBox.value = "a text that cannot be there";
  document.getElementById("find-next").click();
  check(document.getElementById("note").textContent === "Not found",
    "with none there it says so");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  // It replaces and puts it back.
  findBox.value = "document";
  document.getElementById("find-with").value = "papers";
  const wasBody = app.text();
  document.getElementById("find-swap-all").click();
  check(app.text() !== wasBody, "replace all changes the body");
  check(document.getElementById("note").textContent.indexOf("Replaced") >= 0,
    "it says how many");
  // Caution: **Count again after replacing**, or the old count reads as "there are still some".
  check(tallyBox.textContent === "0 found",
    "after replacing it becomes 0 (" + tallyBox.textContent + ")");
  undoKey();
  check(app.text() === wasBody, "one undo goes back to before the replace");
  // Esc folds it and goes back to the body.
  findBox.focus();
  findBox.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Escape", bubbles: true, cancelable: true }));
  check(document.activeElement === ime, "after Esc the focus goes back to the body");
  pressAt(8);

  // 19. Copy, cut and paste are wired to the body.
  //
  // **This can be seen nowhere else**: `clipboardData` exists only in a real browser, and the
  // hidden input field's taking over needs the DOM. The keys are not pressed (a scripted keystroke
  // starts no default copy); the way from a key is kept by the `else { return; }` that does not
  // take over.
  const clip = (kind) => {
    const e = new ClipboardEvent(kind, {
      clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
    });
    ime.dispatchEvent(e);
    return e;
  };
  pressAt(8);
  const wasText = app.text();
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  const picked = app.selectionText();
  check(picked.length > 0, "the selected range's text can be got (" + picked + ")");
  const copied = clip("copy");
  check(copied.defaultPrevented, "the copy is taken over");
  check(copied.clipboardData.getData("text/plain") === picked,
    "the selected text goes into the clipboard");
  // With nothing selected it does not take over (copying text from outside the page stays open).
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", bubbles: true, cancelable: true }));
  check(!clip("copy").defaultPrevented, "with nothing selected the copy walks past");

  // Caution: **Take the paste over too.** Left to the default it goes into the hidden input field
  // and never reaches the body.
  // **Keep the pasted character non-ASCII.** The clipboard is a way apart from the IME's
  // (`input.js`), so with ASCII a byte count lost on the way would pass.
  const pasted = new ClipboardEvent("paste", {
    clipboardData: new DataTransfer(), bubbles: true, cancelable: true,
  });
  pasted.clipboardData.setData("text/plain", "貼");
  ime.dispatchEvent(pasted);
  check(pasted.defaultPrevented, "the paste is taken over");
  check(app.text().indexOf("貼") >= 0, "the pasted text goes into the body");
  check(ime.value === "", "it does not go into the hidden input field");
  undoKey();
  check(app.text() === wasText, "one undo puts it back");

  // Cutting is copying and deleting.
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));
  const cut = clip("cut");
  check(cut.clipboardData.getData("text/plain").length > 0,
    "the cut text goes into the clipboard");
  check(app.text().length === wasText.length - 1, "the body shortens by what was cut");
  undoKey();
  check(app.text() === wasText, "one undo puts the cut back too");
  pressAt(8);
}
