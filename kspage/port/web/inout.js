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
  // Caution: **Borrow the download and the name** ([`file.js`](file.js) holds the one copy); with
  // two, one ends up not reading the name field.
  const download = ui.download, nameOf = ui.nameOf;

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
    });
  });
  return {};
}
