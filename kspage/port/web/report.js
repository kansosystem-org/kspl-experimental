// ==========================================
// kspage's JS side — the button that downloads a debug log.
// Caution: **Do not include the document's contents.** A fix needs "what is listed" and "what was
// refused", not the written text — only what its recipient may read goes in.
// It is split from [`file.js`](file.js) (the 1000-line cap), and borrows its download and naming.
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
    // The change history: what was done just before it broke matters most.
    // Caution: **Do not rely on `.ksdb` alone** — it is written only on save, so people would have
    // to save to report. Only "when, who and what" go in, not the typed text. Stamp before reading,
    // or what was just typed does not appear.
    app.stampTrail();
    lines.push("");
    // Read the count after stamping, or unstamped items are lost and the lines and count differ.
    lines.push("Change history: " + ui.count(app.trailCount(), "item")
      + " (oldest first. The characters typed do not go in):");
    const deeds = app.trail().split("\n").filter((one) => one !== "")
      .map((one) => one.split("\t").join("  "));
    // Caution: **Cap it** (a long session makes thousands of lines); the most recent are kept.
    const deedMax = 80;
    if (deeds.length > deedMax) {
      lines.push(deeds.length - deedMax === 1 ? "(the oldest item is left out)"
        : "(the oldest " + (deeds.length - deedMax) + " items are left out)");
    }
    lines.push(deeds.length > 0 ? deeds.slice(-deedMax).join("\n") : "(there is nothing yet)");
    const lost = app.trailLost();
    if (lost > 0) {
      lines.push("Caution: The count that could not be recorded because memory was full: " + lost);
    }
    download(lines.join("\n") + "\n", nameOf("-debug-log.txt"), "text/plain",
      "Downloaded the debug log (the document's contents are not in it)");
  });
}
