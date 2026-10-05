// "New", starting from a blank sheet. **What the page carries over after the press** (the name,
// where it saves, the handle, what was typed) lives on the DOM's side, so the wasm alone lets "it
// overwrites the earlier file with a blank sheet" and "what was typed is gone" walk past.
// Caution: **Put the document back at the end**: the blank sheet takes its place in the window.

function kspageProbeFresh(ks) {
  const { check, app, notAPath } = ks;
  const nameBox = document.getElementById("doc-name");
  const pathBox = document.getElementById("local-path");
  const note = document.getElementById("note");
  // **Type by the same way as a person** (an `input` event, the same settlement as `store.js`).
  const typeIn = (t) => ks.ime.dispatchEvent(new InputEvent("input",
    { data: t, inputType: "insertText", bubbles: true }));
  // **It must be one character** — one input event does not necessarily put two in. **Not the keep
  // section's mark**: that section finds its draft in the store by its mark.
  const MARK = "§";

  // **Stand up what must not be carried over before pressing** (pressed while empty, "it vanished"
  // and "it was empty to begin with" cannot be told apart).
  const wasName = nameBox.value;
  const wasPath = pathBox.value;
  const wasSaved = app.save();
  ks.pressAt(8);
  typeIn(MARK);
  const typed = app.save();
  check(typed !== wasSaved, "the document has something typed to lose before the press");
  const wasKept = app.keepCount();
  nameBox.value = "before";
  pathBox.value = notAPath + "/before.json";

  // Caution: **Press it as a person does** (menu, then button); called directly, unwired passes.
  const menu = ks.openMenu("doc-new");
  document.getElementById("doc-new").click();
  menu.open = false;

  check(app.text() === "", `what opened is a blank sheet (${app.text()})`);
  // **What was typed is not lost**: it is set aside, and the notice says where.
  check(app.keepCount() === wasKept + 1,
    `what was typed is set aside as a draft (${app.keepCount()})`);
  check(note.textContent.indexOf("kept as a draft") >= 0,
    `the notice says it is kept as a draft (${note.textContent})`);
  // Caution: **Do not carry where it writes back over** (a save would overwrite the earlier file).
  check(pathBox.value === "", `it does not carry where it saves over (${pathBox.value})`);
  check(nameBox.value !== "before", `it does not carry the name over either (${nameBox.value})`);

  // **It must hold a style table** (without one, tables and slides stack as plain paragraphs).
  const styles = app.styleNames();
  check(styles.indexOf("table") >= 0,
    `a blank sheet holds a style table too (${styles.length})`);

  // **One empty paragraph must be there** (the cursor stands in it); typed by an `input` event.
  ks.pressAt(8);
  typeIn("a");
  check(app.text() === "a", `a blank sheet can be typed on as it is (${app.text()})`);

  // **What was set aside comes back whole**, as a person brings it back ("Bring the draft back").
  document.getElementById("keep-take").click();
  check(app.save() === typed, "the draft brought back is the document as it was typed");
  check(app.keepCount() === wasKept + 1,
    `the blank sheet typed on is set aside in its turn (${app.keepCount()})`);

  // Tidying up: the document as it was before the section.
  // Caution: **Do not throw the drafts away** ("Throw the drafts away" takes every one): the keep
  // section is still looking for its own in the store.
  app.load(wasSaved);
  check(app.save() === wasSaved, "the earlier document is back as it was");
  nameBox.value = wasName;
  pathBox.value = wasPath;
}
