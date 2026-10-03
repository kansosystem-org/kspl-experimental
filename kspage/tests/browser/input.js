// The focus, the look, the cursor, keystrokes, and IME composition.
//
// Caution: **The composition fixtures stay Japanese.** An IME hands a reading over and then a
// settled text (`にほん` → `日本`), and no ASCII stand-in exercises that way; a document holds any
// characters at all.

function kspageProbeInput(ks) {
  const { check, app, canvas, ime, press, keyIn, undoKey, openMenu } = ks;

  // 1. The focus. Landed on the canvas, an IME does not rouse.
  check(document.activeElement === ime, "at start-up the focus is on the input field");
  check(canvas.getAttribute("tabindex") === null,
    "there is no way for the focus to land on the canvas");

  // 2. The look. On an element that cannot be seen, composition sometimes does not begin.
  const cs = getComputedStyle(ime);
  check(cs.opacity !== "0", "the input field is not at opacity 0");
  check(cs.visibility !== "hidden", "the input field is not visibility:hidden");
  check(cs.display !== "none", "the input field is not display:none");

  // 3. The input field follows where it was pressed. Apart, the conversion candidates' window comes
  //    out away from the body.
  const r = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent("pointerdown",
    { clientX: r.left + 40, clientY: r.top + 14, bubbles: true }));
  check(document.activeElement === ime, "after the press the focus is still on the input field");
  const left = parseFloat(ime.style.left);
  check(left > 0, "the input field is landed at the cursor (left=" + ime.style.left + ")");

  // 3'. The cursor's sheet follows the cursor, blinking.
  //
  // **This can be seen nowhere else**: it is not drawn on the canvas, so counting pixels misses it,
  // and the blink is a real browser's animation.
  const caret = app.caretElement;
  check(caret !== undefined && caret.isConnected, "the cursor's sheet is on the page");
  const caretStyle = getComputedStyle(caret);
  check(caretStyle.display !== "none", "the cursor is out");
  check(parseFloat(caretStyle.height) > 0,
    "the cursor has a length (" + caretStyle.height + ")");
  check(Math.abs(parseFloat(caret.style.left) - left) < 2,
    "the cursor sits in the same place as the input field (" + caret.style.left + ")");
  // **The blink must switch in an instant**; a smooth fade leaves a thin line half-vanished.
  const flick = caret.getAnimations();
  check(flick.length === 1, "one blink is landed (" + flick.length + ")");
  check(flick.length === 1 && flick[0].playState === "running", "the blink is running");
  // **It must be visible right after being moved**, or typing on the beat it is gone loses where it
  // is. It is put back to the head, so the time after the press is 0.
  canvas.dispatchEvent(new PointerEvent("pointerdown",
    { clientX: r.left + 60, clientY: r.top + 14, bubbles: true }));
  check(caret.getAnimations()[0].currentTime === 0, "a press puts the blink back to the head");

  // 3''. Where it was typed going outside the window, it sends that far (the window's side, in
  // neither the canvas's pixels nor the wasm).
  // Caution: **Send only where it went outside** (else a window moved to read goes back on every
  // keystroke). It narrows the row so the document outgrows the window and looks at the promise,
  // "the cursor is inside the window, not behind the tools" (**the upper edge is not enough**).
  const caretInside = () => {
    const at = caret.getBoundingClientRect();
    const room = app.headRoom ? app.headRoom() : 0;
    return at.top >= room - 1 && at.bottom <= window.innerHeight;
  };
  const wideAt = canvas.getBoundingClientRect().width;
  app.resize(120);
  window.scrollTo(0, 0);
  const tall = canvas.getBoundingClientRect().height;
  check(tall > window.innerHeight,
    "narrowed, the document is taller than the window (" + Math.round(tall) + ")");
  press(20, tall - 8);
  check(window.scrollY > 0,
    "it sends as far as a cursor that went outside the window ("
      + Math.round(window.scrollY) + ")");
  check(caretInside(), "after the send the cursor is inside the window");
  const held = window.scrollY;
  app.type("z");
  check(window.scrollY === held, "while it is visible it does not send (" + Math.round(held) + ")");
  undoKey();
  // It sends when it goes off the top too: the window is moved down, then the document's head is
  // pressed.
  window.scrollTo(0, Math.round(tall / 2));
  press(20, 4);
  check(window.scrollY < Math.round(tall / 2),
    "it goes back as far as a cursor that went off the top");
  check(caretInside(), "after going back the cursor is inside the window too");
  app.resize(wideAt);
  window.scrollTo(0, 0);

  // 3'''. The tools are not dragged along by the body.
  //
  // **This can be seen nowhere else**: whether they stay is the page's adornment, told neither by
  // running the wasm nor by the canvas.
  const chrome = document.getElementById("chrome");
  // **Make the document taller than the window before looking**; with the tools packed down the
  // sample fits the window at the wide row, leaving nowhere to send.
  app.resize(240);
  window.scrollTo(0, 200);
  const chromeAt = chrome.getBoundingClientRect();
  check(Math.abs(chromeAt.top) <= 1,
    "sending the body leaves the tools at the window's top (" + Math.round(chromeAt.top) + ")");
  check(document.getElementById("stage").getBoundingClientRect().top < chromeAt.bottom,
    "the body goes under the tools");
  app.resize(wideAt);
  window.scrollTo(0, 0);
  // Caution: **Where a press does not go in, the reason must come out somewhere visible** — a press
  // that puts nothing out is read as "nothing happens".
  // What takes a frame off does not act in the body, so the refusal is looked at there.
  const told = document.getElementById("note");
  press(20, 20);
  openMenu("drop-frame");
  document.getElementById("drop-frame").click();
  check(told.textContent.length > 0,
    "pressing a row that does not act puts the reason out (" + told.textContent + ")");
  const pillAt = told.getBoundingClientRect();
  check(pillAt.width > 0 && pillAt.top >= 0 && pillAt.bottom <= window.innerHeight,
    "that tiding is visible inside the window");
  // **A shape goes in over the body too** (Word and Excel both lay one over the body). What went in
  // is put back; later sections rely on the sample document.
  press(20, 20);
  const wasObjects = app.objects().length;
  openMenu("put-shape");
  document.getElementById("put-shape").click();
  check(app.objects().length === wasObjects + 1,
    "a shape goes in over the body too (" + app.objects().length + ")");
  undoKey();
  check(app.objects().length === 0, "undoing takes it off");

  // 4. One keystroke puts one character in, and no more.
  //
  // **A real browser puts out both keydown and input per keystroke.** Put in on both, it goes in
  // twice (with an IME, the raw reading and the settled characters side by side).
  const before = app.text();
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
  ime.dispatchEvent(new InputEvent("input",
    { data: "a", inputType: "insertText", bubbles: true }));
  const after = app.text();
  check(after.length === before.length + 1,
    "one keystroke puts one character in (" + before.length + " -> " + after.length + ")");

  // 5. The composition's run goes through, and it can be deleted until it is settled.
  ime.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
  ime.dispatchEvent(new CompositionEvent("compositionupdate",
    { data: "にほん", bubbles: true }));
  const composing = app.text();
  check(composing.indexOf("にほん") >= 0, "the text being composed is visible");
  ime.dispatchEvent(new CompositionEvent("compositionend", { data: "日本", bubbles: true }));
  const committed = app.text();
  check(committed.indexOf("日本") >= 0, "the settled text stays");
  check(committed.indexOf("にほん") < 0, "the text being composed does not stay");

  // 5'. A composition broken off does not become a break in the undo.
  //
  // **This can be seen nowhere else**: breaking off shows only as `compositionend` with an empty
  // `data`. Let an empty one through as a settlement and the step breaks there, so what was typed
  // before and after comes back separately ("it comes back a keystroke at a time").
  const typeIn = (t) => ime.dispatchEvent(new InputEvent("input",
    { data: t, inputType: "insertText", bubbles: true }));
  const kept = app.text();
  typeIn("X");
  ime.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
  ime.dispatchEvent(new CompositionEvent("compositionupdate",
    { data: "かんそ", bubbles: true }));
  ime.dispatchEvent(new CompositionEvent("compositionend", { data: "", bubbles: true }));
  check(app.text().length === kept.length + 1,
    "the text of a composition broken off does not stay");
  typeIn("Y");
  undoKey();
  check(app.text() === kept,
    "what was typed across the break comes back in one");

  // 6. A key during composition is not taken over. Taken, the composition does not go on.
  ime.dispatchEvent(new CompositionEvent("compositionstart", { data: "", bubbles: true }));
  const during = app.text();
  const key = new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true });
  ime.dispatchEvent(key);
  check(!key.defaultPrevented, "a key during composition is not taken over");
  check(app.text() === during, "a key during composition does not change the text");
  ime.dispatchEvent(new CompositionEvent("compositionend", { data: "", bubbles: true }));

  // 7. The undo key is wired to the body.
  //
  // **Untaken over, the input field's own undo runs**: the hidden field's text alone comes back and
  // the body does not move.
  ime.dispatchEvent(new InputEvent("input",
    { data: "Q", inputType: "insertText", bubbles: true }));
  const typed = app.text();
  const undo = undoKey();
  check(undo.defaultPrevented, "Ctrl+Z is taken over");
  check(app.text().length === typed.length - 1, "Ctrl+Z brings what was typed back");
  keyIn("z", { ctrlKey: true, shiftKey: true });
  check(app.text() === typed, "Ctrl+Shift+Z redoes it");
}
