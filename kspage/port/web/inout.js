// ==========================================
// kspage's page — import and export in other formats: HTML, Markdown, CSV and constants, **separate
// from the reloadable save** (these texts hold no styles, so reading them back does not restore the
// document: the header of [`inout.kspls`](inout.kspls)).
// Caution: **Put nothing here that replaces the current document.** This file only downloads or
// inserts into the current document; opening (JSON, Markdown or text), where to write back and the
// document's name belong to [`file.js`](file.js). Split off for the 1000-line-per-file cap
// (Principle 3).
// ==========================================
function kspageInout(ui) {
  const app = ui.app;
  const tell = ui.tell, deny = ui.deny;
  // Caution: **Borrow the download and the name** ([`file.js`](file.js) holds the one copy); with
  // two, one ends up not reading the name field.
  const download = ui.download, nameOf = ui.nameOf;

  // **Exported HTML cannot be reloaded** (it is separate from the save).
  document.getElementById("export").addEventListener("click", () =>
    download(app.html(), nameOf(".html"), "text/html", "Wrote it out as HTML"));
  // Nor can Markdown; it is for putting next to code.
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
  // Constant text from a table: **the one "document → source" direction** (the other three start
  // from the source); with a link target whose text was passed in, it says whether that is stale.
  // Caution: **Do not hide a refused row** — a row whose text cannot be a name is left out.
  document.getElementById("export-consts").addEventListener("click", () => {
    const got = app.consts(nameOf(""));
    if (got === null) {
      deny("Click inside a table");
      app.focus();
      return;
    }
    if (got.rows <= 0) {
      deny("There is no row that can be a name (column 1 is the name, column 2 the value)");
      app.focus();
      return;
    }
    const stale = app.constsState(nameOf(""));
    const rest = got.refused === 0 ? ""
      : got.refused === 1 ? "(1 row cannot be a name, so it is not in)"
        : `(${got.refused} rows cannot be names, so they are not in)`;
    const age = stale === "stale" ? ". The text handed over is stale" : stale === "same" ? ". It is the same as the text handed over" : "";
    // The file name gives the notation; `share/consts.kspls` writes the default one.
    download(got.text, nameOf(".kspls"), "text/plain",
      `Wrote ${got.rows} constants out${rest}${age}`);
    app.focus();
  });

  // The link target of the table's text; **once set, the export can tell whether it is stale.**
  const aimBox = document.getElementById("consts-aim");
  document.getElementById("consts-aim-apply").addEventListener("click", () => {
    tell(app.setAimHere(aimBox.value), aimBox.value === "" ? "Released the link target" : "Made it this table's target",
      "Click inside a table, a slide or an image");
    app.focus();
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
    });
  });
  return {
    // **The redraw notification copies it into the field** (otherwise it is stale across tables).
    aimBox: aimBox,
  };
}
