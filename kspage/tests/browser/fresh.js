// "New", starting from a blank sheet. **What the page carries over after the press** (the name,
// where it saves, the handle) lives on the DOM's side, so the wasm alone lets "it overwrites the
// earlier file with a blank sheet" walk past.
// Caution: **Do not touch the document now**: a blank sheet opens into a new place, looked at
// alone and shut at the end.

function kspageProbeFresh(ks) {
  const { check, app, notAPath } = ks;
  const nameBox = document.getElementById("doc-name");
  const pathBox = document.getElementById("local-path");

  // **Stand up what must not be carried over before pressing** (pressed while empty, "it vanished"
  // and "it was empty to begin with" cannot be told apart).
  const wasName = nameBox.value;
  const wasPath = pathBox.value;
  const wasText = app.text();
  const wasDocs = app.docCount();
  const wasAt = app.docNow();
  nameBox.value = "before";
  pathBox.value = notAPath + "/before.json";

  // Caution: **Press it as a person does** (menu, then button); called directly, unwired passes.
  const menu = ks.openMenu("doc-new");
  document.getElementById("doc-new").click();
  menu.open = false;

  // **Do not shut the document now** ("New" grows one, leaving what is open).
  check(app.docCount() === wasDocs + 1,
    `the earlier document stays open (${app.docCount()})`);
  check(app.docNow() !== wasAt, "what is being looked at is the place newly opened");
  check(app.text() === "", `what opened is a blank sheet (${app.text()})`);
  // Caution: **Do not carry where it writes back over** (a save would overwrite the earlier file).
  check(pathBox.value === "", `it does not carry where it saves over (${pathBox.value})`);
  check(nameBox.value !== "before", `it does not carry the name over either (${nameBox.value})`);

  // **It must hold a style table** (without one, tables and slides stack as plain paragraphs).
  const styles = app.styleNames();
  check(styles.indexOf("table") >= 0,
    `a blank sheet holds a style table too (${styles.length})`);

  // **One empty paragraph must be there** (the cursor stands in it); typed by an `input` event.
  ks.pressAt(8);
  ks.ime.dispatchEvent(new InputEvent("input",
    { data: "a", inputType: "insertText", bubbles: true }));
  check(app.text() === "a", `a blank sheet can be typed on as it is (${app.text()})`);

  // Tidying up: **a blank sheet must be shuttable even as a draft** (nothing to guard).
  check(app.docShut(app.docNow()), "a blank sheet can be shut");
  check(app.docCount() === wasDocs, `shutting it puts the count back (${app.docCount()})`);
  check(app.docNow() === wasAt && app.text() === wasText,
    "the earlier document is still there as it was");
  nameBox.value = wasName;
  pathBox.value = wasPath;
}
