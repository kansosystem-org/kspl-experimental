// ==========================================
// kspage's page — import and export in other formats: Markdown and CSV, **separate
// from the reloadable save** (these texts hold no styles, so reading them back does not restore the
// document: the header of [`inout.kspls`](inout.kspls)).
// Caution: **Put nothing here that replaces the current document.** This file only downloads or
// inserts into the current document; opening (JSON or text), where to write back and the
// document's name belong to [`file.js`](file.js). Split off for the 1000-line-per-file cap
// (Principle 3).
// ==========================================
function kspageInout(ui) {
  const app = ui.app;
  const tell = ui.tell, deny = ui.deny;
  // Caution: **Borrow the download, the name and the wording of a reason** ([`file.js`](file.js)
  // holds the one copy); with two, one ends up not reading the name field.
  const download = ui.download, nameOf = ui.nameOf, why = ui.why;

  // **Exported Markdown cannot be reloaded** (it is separate from the save); it is for putting
  // next to code.
  document.getElementById("export-md").addEventListener("click", () =>
    download(app.markdown(), nameOf(".md"), "text/markdown", "Wrote it out as Markdown"));

  // Downloads the table as CSV; **nothing outside a table** (which table would be unclear).
  document.getElementById("export-csv").addEventListener("click", () => {
    const text = app.csv();
    if (text === "") {
      deny("To write out as CSV, click inside a table's cell");
      app.focus();
      return;
    }
    download(text, nameOf(".csv"), "text/csv", "Wrote it out as CSV");
  });
  const csvFile = document.getElementById("csv-file");
  document.getElementById("open-csv").addEventListener("click", () => csvFile.click());
  csvFile.addEventListener("change", () => {
    const chosen = csvFile.files[0];
    // Cleared so that choosing the same file again fires `change`.
    csvFile.value = "";
    if (!chosen) return;
    chosen.text().then((text) => {
      // **The style's name belongs to the document, not to this page**: `table` is what the sample,
      // the manual and `command.js` use, so a translated name would create a second style.
      tell(app.insertCsv(text, "table"), "", "It cannot be inserted inside a table's cell");
      app.focus();
    }, (e) => {
      // A file removed or locked after it was chosen: said, not left to the console.
      deny("The file could not be read (" + why(e) + ")");
      app.focus();
    });
  });
  return {};
}

// ==========================================
// kspage's JS side — the button that downloads a debug log.
// Caution: **Do not include the document's contents.** A fix needs "what is listed" and "what was
// refused", not the written text — only what its recipient may read goes in.
// It borrows the download and the naming of [`file.js`](file.js).
// ==========================================
function kspageReport(ui) {
  const app = ui.app;
  const { docName, pathBox, nameOf, download } = ui;
  // **Laid out so a mismatch can be seen**: the names listed in a field and the document's style
  // names go side by side. It downloads as one text, to be pasted as it is.
  document.getElementById("report").addEventListener("click", () => {
    const lines = [];
    const add = (k, v) => lines.push(k + ": " + v);
    add("kspage's debug log", new Date().toISOString());
    add("Opened from", location.protocol + "//" + location.host + location.pathname);
    add("Local server", ui.localHere && ui.localHere() ? "present" : "absent");
    add("Path for saving and opening", pathBox.value.trim() || "(empty)");
    // The pixel density too: only the browser's zoom shows up there (the page cannot read it).
    add("Window", window.innerWidth + "x" + window.innerHeight
      + " pixel ratio " + (window.devicePixelRatio || 1));
    add("The document's name", docName.value);
    add("The document's styles", app.styleNames().join(","));
    // Read the lists from the menu itself: asking the core again would hide the mismatch sought.
    const rowsOf = (id) => Array.from(
      document.getElementById(id).querySelectorAll(".fly-items .fly-label"))
      .map((one) => one.textContent).filter((one) => one !== "Unset").join(",");
    add("The character styles listed in the menu", rowsOf("style-set"));
    add("The paragraph styles listed in the menu", rowsOf("block-style"));
    add("The current paragraph style", app.blockStyle() || "(none)");
    add("The current character style", app.style() || "(none)");
    add("The count of headings", String(app.headings().length));
    add("The count of slides", String(app.surfaceCount()));
    add("Paper", JSON.stringify(app.paper()));
    // Caution: **Include where the cursor is**: the history holds only changes, so "the cursor does
    // not move" would arrive with nothing to diagnose it.
    add("Where the cursor stands", app.caretReport());
    // The room left before it breaks matters most: "it froze" splits into causes by it.
    const room = app.room();
    add("Memory", `${(room.used / 1048576).toFixed(2)} / ${(room.all / 1048576).toFixed(0)} MiB`
      + ` (the cap that can be opened is ${(app.docLimit() / 1024).toFixed(0)} KB)`);
    // The keys that ran a command, newest last; **not the typed characters** (the contents).
    lines.push("");
    const keys = app.pressedKeys ? app.pressedKeys() : [];
    lines.push("The keys pressed that carry a command (oldest first, the characters typed do not "
      + "go in):");
    lines.push(keys.length > 0 ? keys.join(" ") : "(nothing has been pressed yet)");
    lines.push("");
    lines.push("The messages that came out in the status bar (oldest first):");
    const said = ui.sayTrail ? ui.sayTrail() : [];
    lines.push(said.length > 0 ? said.join("\n") : "(nothing has come out yet)");
    download(lines.join("\n") + "\n", nameOf("-debug-log.txt"), "text/plain",
      "Downloaded the debug log (the document's contents are not in it)");
  });
}
