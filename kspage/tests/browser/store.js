// Putting in and out, and the arena that remembers where a tab's document lives.

function kspageProbeStore(ks) {
  const { check, app } = ks;

  // 8. Putting in and out. **The window that chooses a file cannot open headless**, so putting text
  // in and out, and the focus going back to the input field, are looked at.
  const typed = app.text();
  const written = app.save();
  // Caution: **Do not hunt in a packed shape** (the save's shape is one value per line, with one
  // space after the key. `kspage/share/store.kspls`'s `spacing`).
  check(written.indexOf("\"kspage\": 6") >= 0, "the version goes into the text written out");
  // **The answer is the reason rather than a true or false** (`api_io.js`'s `load`): an empty
  // text is "it could be read", and a refusal names its reason, as "it cannot be read" and "too
  // large to lay down" are fixed in opposite ways.
  check(app.load("{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"elsewhere\"}]}]}") === "", "it can be read back from a text");
  check(app.text() === "elsewhere",
    "it swaps for the document read (" + app.text() + ")");
  // Caution: **Look as far as the reason.** "It refused" alone passes with the two reasons mixed
  // up, and the page says different things for them.
  check(app.load("{ broken") === "broken",
    "an unreadable text is refused, and the reason declared");
  check(app.load(written) === "" && app.text() === typed,
    "the text written out puts it back");

  // A text saved can be read as a difference.
  // Caution: **Do not pack it into one line** — then changing one word differs in the whole
  // document, and git's differences, its joins and `grep` say nothing.
  check(written.split("\n").length > 1,
    "the text saved is split into lines (" + written.split("\n").length + " lines)");

  // Read only. **This can be seen nowhere else**: folding the tools and stopping the shortcut keys
  // are the DOM's side (it breaks as "it can be written to through the folded tools' gaps").
  //
  // Caution: **Do not look at a press not acting alone.** What is looked at is that **the text
  // saved does not change by one byte** (a changed document, however it came in, shows here).
  // **Type by the same way as a person** (an `input` event, `command.js`; a key event alone is no
  // typing).
  const typeIn = (t) => ks.ime.dispatchEvent(new InputEvent("input",
    { data: t, inputType: "insertText", bubbles: true }));
  ks.pressAt(8);
  const wasRead = app.save();
  // Caution: **Switch by the same way as a person.** The core's entry point called directly skips
  // the place that folds the tools, so writing through the gaps walks past.
  check(ks.flyPick("mode-picks", "Read only"), "the band can make it read only");
  typeIn("a");
  typeIn("b");
  ks.keyIn("Backspace");
  ks.undoKey();
  check(app.save() === wasRead,
    "read only, the text changes on neither a type, an delete nor an undo");
  check(app.readOnly(), "it declares itself read only");
  // **It must not go into the document**, or a copied document tells the lie "it declares itself
  // read only and anyone can edit it".
  check(app.save().indexOf("read_only") < 0,
    "read only does not come out in the text saved");
  // It must come out on the band. **It is the reason a press does not act; unread, it looks
  // broken.** **The place that switches must be out while it only reads too** — folded, the way
  // back vanishes from the screen.
  const modeBox = document.getElementById("mode");
  check(ks.flyNow("mode-picks") === "Read only",
    "the band says it only reads (" + ks.flyNow("mode-picks") + ")");
  check(ks.flyTick("mode-picks") === "Read only", "the mode now gets the mark");
  check(modeBox.closest("[data-edit]") === null && modeBox.closest("#status") !== null,
    "the place that switches is not folded even while it only reads");
  // **The tools that rewrite must be folded** (nothing pressable that does not act).
  check(document.documentElement.dataset.read === "1", "the read-only dress is on");
  // **On the band's side one place says it** (two fall out of step when one alone changes).
  // Caution: **Look for the wording the mode set actually puts out.** Keyed on wording that is
  // nowhere, this passes however many places say the mode.
  check(document.getElementById("where").textContent.indexOf("Read only") < 0,
    "one place inside the band says the mode, and no more ("
      + document.getElementById("where").textContent + ")");
  // **It must be possible to get back to editing from the screen**, not by the entry point alone.
  check(ks.flyPick("mode-picks", "Edit"), "the band can go back to editing");
  check(!app.readOnly(), "back, it is no longer read only");
  // **The dress must come back too**, or writing is possible with the tools that write not out.
  check(document.documentElement.dataset.read === undefined,
    "the read-only dress comes off too");
  typeIn("c");
  check(app.save() !== wasRead, "back, it can be written to");
  // **It must be possible to go into read only from the screen too** (else nothing guards it before
  // lending it out).
  ks.flyPick("mode-picks", "Read only");
  check(app.readOnly() && document.documentElement.dataset.read === "1",
    "the band can go back to read only");
  ks.flyPick("mode-picks", "Edit");
  check(app.load(written) === "", "it can go back to the original text");

  // 9. The arena that remembers where the document a tab has in view lives.
  //
  // **This can be seen nowhere else**: a handle cannot be made text, so remembering it is the
  // browser's arena (IndexedDB) itself. **A made-up handle cannot be used** — structured cloning
  // refuses a plain object holding functions (`could not be cloned`). **A real handle needs no
  // window**: the private file arena per origin (`navigator.storage.getDirectory()`) wants neither
  // a chooser nor a permission.
  //
  // **The same section looks at two cases** (the same settlement as `local.js`). From `file://` the
  // origin is opaque and neither arena opens — **that side is a check too**: an answer must come
  // back where it cannot remember (gone silently quiet, the press of save never returns).
  const done = ks.hold();
  const store = kspageHandles();
  const TAB = "probe-tab";
  // A page that cannot remember. **`file://` comes here.**
  if (location.protocol === "file:") {
    store.keepWhere(TAB, null)
      .then(() => store.takeWhere(TAB))
      .then((was) => {
        check(was === null, "on a page that cannot remember nothing comes back");
        done();
      }, (e) => {
        check(false,
          "an answer comes back even on a page that cannot remember ("
            + String(e && e.message) + ")");
        done();
      });
    return;
  }
  // A page that was served: a tab's record comes back with its handle and place, can be forgotten,
  // a non-handle does not come back as one, and **shut tabs' records do not pile up** (nothing says
  // a tab is shut, so the cap bounds them). **Then a page is read again for real** (`again` below),
  // after the cap, which would otherwise let its record go.
  const nowhere = { path: "", bodyAt: null, pastAt: null };
  (async function () {
    const dir = await navigator.storage.getDirectory();
    const live = await dir.getFileHandle("kspage-probe.json", { create: true });
    await store.keepWhere(TAB, { path: "", bodyAt: live, pastAt: null });
    let was = await store.takeWhere(TAB);
    check(was !== null && was.bodyAt !== null && was.bodyAt.name === "kspage-probe.json",
      "a tab's record comes back with its handle ("
        + (was === null || was.bodyAt === null ? "none" : was.bodyAt.name) + ")");
    const place = ks.notAPath + "/kept.kspage";
    await store.keepWhere(TAB, { path: place, bodyAt: null, pastAt: null });
    was = await store.takeWhere(TAB);
    check(was !== null && was.path === place && was.bodyAt === null,
      "a tab's record comes back with its place (" + (was === null ? "none" : was.path) + ")");
    await store.keepWhere(TAB, null);
    check((await store.takeWhere(TAB)) === null, "having it remember null forgets it");
    // Caution: **Do not bring back something that is not a handle as one** (with the arena
    // broken, the reader would call it).
    await store.keepWhere(TAB, { path: "", bodyAt: "a text that is not a handle", pastAt: null });
    was = await store.takeWhere(TAB);
    check(was !== null && was.bodyAt === null, "something that is not a handle does not come back");
    await store.keepWhere(TAB, null);
    // More tabs than the cap, one after another: the newest stays, and not all of them do.
    const many = 20;
    for (let i = 0; i < many; i += 1) {
      await store.keepWhere("probe-cap-" + i, { path: place, bodyAt: null, pastAt: null });
    }
    let kept = 0;
    for (let i = 0; i < many; i += 1) {
      if ((await store.takeWhere("probe-cap-" + i)) !== null) kept += 1;
    }
    check(kept < many, "the records of shut tabs do not pile up (" + kept + " of " + many + ")");
    check((await store.takeWhere("probe-cap-" + (many - 1))) !== null,
      "the tab laid down last is the one that stays");
    for (let i = 0; i < many; i += 1) await store.keepWhere("probe-cap-" + i, null);
    await dir.removeEntry("kspage-probe.json");
    await again(dir);
  })().then(done, (e) => {
    check(false, "the handles' arena answers (" + String((e && e.stack) || e) + ")");
    done();
  });

  // 9'. A page read again comes up on the document it had open, with where it writes back.
  //
  // **This can be seen nowhere else**: the start-up is the one moment the page stands on the sample
  // with a memory at hand. A window this page opens stands for a tab.
  // Caution: **Look at what a save writes, not only at what is shown.** Come up on the sample with
  // the earlier file still attached, the first save writes the sample over that file.
  async function again(dir) {
    const server = ks.local();
    const lay = (path, text) =>
      fetch(server.at(path), { method: "PUT", headers: server.head, body: text });
    const readBack = async (path) => {
      const got = await fetch(server.at(path), { headers: server.head });
      return got.ok ? await got.text() : "";
    };
    const docOf = (mark) => "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
      + "\"inlines\":[{\"text\":\"" + mark + "\"}]}]}";
    // It waits on the other window, asking again and again. **The other side stands up
    // asynchronously**, and after a reading again its `kspage` is a new one.
    const until = async (ready, what) => {
      ks.waiting(what);
      for (let looked = 0; looked < 300; looked += 1) {
        let got = false;
        try {
          got = ready();
        } catch (_) {
          got = false;   // a window between two pages answers nothing
        }
        if (got) {
          ks.waiting("");
          return true;
        }
        await new Promise((go) => setTimeout(go, 100));
      }
      ks.waiting("");
      return false;
    };
    const readAgain = async (child) => {
      const was = child.kspage;
      child.location.reload();
      return until(() => child.kspage && child.kspage !== was
        && child.document.getElementById("note") !== null, "the window to stand up again");
    };
    const saidThere = (child, want) =>
      (child.document.getElementById("note").textContent || "").indexOf(want) >= 0;
    const placeMark = "the place read again";
    check((await lay("again.json", docOf(placeMark))).ok, "the document to read again is laid down");
    const child = window.open(location.pathname, "kspage-again");
    check(child !== null, "the window to read again can be opened");
    if (child === null) return;
    try {
      // ---- A document opened by a place ----
      check(await until(() => child.kspage && child.kspage.text() !== ""
        && !child.document.getElementById("local-row").hidden, "the other window to stand up"),
      "the other window stands up with the server there");
      // **Arrived at afresh, it comes up on the sample** (it holds no record of its own yet).
      check(child.kspage.text().indexOf(placeMark) < 0
        && child.document.getElementById("local-path").value === "",
      "a window arrived at afresh comes up on the sample, carrying no place");
      const field = child.document.getElementById("local-path");
      field.value = "again.json";
      field.dispatchEvent(new child.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      check(await until(() => child.kspage.text().indexOf(placeMark) >= 0, "the place to open"),
        "the other window opens the place");
      check(await readAgain(child), "the other window is read again");
      check(await until(() => child.kspage.text().indexOf(placeMark) >= 0, "the place reopened"),
        "a page read again comes up on the document it had open (" + child.kspage.text() + ")");
      check(child.document.getElementById("local-path").value === "again.json",
        "its path field names where that document lives ("
          + child.document.getElementById("local-path").value + ")");
      const shown = child.kspage.save();
      child.document.getElementById("save").click();
      check(await until(() => saidThere(child, "Saved (again.json"), "the save after reading again"),
        "a save after reading again writes back to that place");
      const kept = await readBack("again.json");
      check(kept === shown && kept.indexOf(placeMark) >= 0,
        "what it writes is the document it came up on, not the sample");

      // ---- A document opened by the browser's window (a handle) ----
      const handMark = "the handle read again";
      const inner = await child.navigator.storage.getDirectory();
      const picked = await inner.getFileHandle("kspage-again.kspage", { create: true });
      const out = await picked.createWritable();
      await out.write(docOf(handMark));
      await out.close();
      // **The window cannot open headless**, so what it returns is stood in for by a real handle
      // (the private arena's).
      child.showOpenFilePicker = async () => [picked];
      child.document.getElementById("open").click();
      check(await until(() => child.kspage.text().indexOf(handMark) >= 0, "the file to open"),
        "the other window opens the file chosen");
      check(await readAgain(child), "the other window is read again after opening a file");
      check(await until(() => child.kspage.text().indexOf(handMark) >= 0, "the file reopened"),
        "a page read again comes up on the file it had open, through its handle ("
          + child.kspage.text() + ")");
      check(child.document.title.indexOf("kspage-again.kspage") === 0,
        "the band names the file it writes back to (" + child.document.title + ")");
      check(child.document.getElementById("local-path").value === "",
        "a document living in a handle leaves the path field empty");
      child.document.getElementById("save").click();
      check(await until(() => saidThere(child, "Saved (kspage-again.kspage"),
        "the save through the handle after reading again"),
      "a save after reading again writes back through the handle");
      const onDisk = await (await (await dir.getFileHandle("kspage-again.kspage")).getFile()).text();
      check(onDisk.indexOf(handMark) >= 0, "what it writes through the handle is that file's document");
      // **A file that has gone does not come back**: the page stays on the sample, carrying no
      // file, and says why (recent files that break only when pressed are the complaint against
      // other products).
      // Caution: **Remove it through this page's own arena** — what the other window handed out
      // belongs to the page before the reading again, and a call on it never answers.
      await dir.removeEntry("kspage-again.kspage");
      check(await readAgain(child), "the other window is read again after its file went");
      check(await until(() => saidThere(child, "no longer there"), "the reason the file is gone"),
        "a file that has gone is said to be gone");
      // **Read the band's place, not the title** (with no file the title is the name field, not
      // where it writes).
      const placeNow = child.document.getElementById("file-at").textContent || "";
      check(child.kspage.text().indexOf(handMark) < 0 && placeNow.indexOf("No save target") >= 0,
        "and the page stays on the sample, carrying no file (" + placeNow + ")");

      // ---- A save still writing while the document in view changes ----
      //
      // Caution: **A save's place goes to the document it was made for.** With its write held back
      // and the view changed meanwhile, a blank sheet made and shut restores the earlier place, and
      // a document left in view must not take the file written.
      let holding = "";
      let letGo = null;
      const passOn = child.fetch;
      child.fetch = (url, opts) => (opts && opts.method === "PUT"
        && String(url).endsWith("?path=" + encodeURIComponent(holding))
        ? new Promise((go) => { letGo = () => go(passOn(url, opts)); }) : passOn(url, opts));
      const pathField = () => child.document.getElementById("local-path");
      const heldSave = async (path, meanwhile) => {
        holding = path;
        letGo = null;
        pathField().value = path;
        pathField().dispatchEvent(new child.Event("change", { bubbles: true }));
        child.document.getElementById("save").click();
        if (!(await until(() => letGo !== null, "the write to be held"))) return false;
        meanwhile();
        letGo();
        return until(() => saidThere(child, "Saved (" + path), "the held save");
      };
      const blank = () => child.document.getElementById("doc-new").click();
      const cameBack = await heldSave("race-back.json", () => {
        blank();
        child.kspage.docShut(child.kspage.docNow());
      });
      check(cameBack && pathField().value === "race-back.json"
        && child.kspage.pathNow() === "race-back.json",
      "a save that finishes after a document came and went keeps its place ("
        + pathField().value + ")");
      const stayed = await heldSave("race-away.json", blank);
      check(stayed && child.kspage.pathNow() === "" && pathField().value === "",
        "a document that came into view while it was written does not take the file ("
          + child.kspage.pathNow() + ")");
      child.kspage.docShut(child.kspage.docNow());
      child.fetch = passOn;
    } finally {
      child.close();
      await dir.removeEntry("kspage-again.kspage").catch(() => null);
    }
  }
}
