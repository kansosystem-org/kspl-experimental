// Putting in and out, and the arena that remembers where a tab's document lives.

function kspageProbeStore(ks) {
  const { check, app, typeIn } = ks;

  // 8. Putting in and out. **The window that chooses a file cannot open headless.** So the checks
  // look at putting text in and out, and at the focus going back to the input field.
  const typed = app.text();
  const written = app.save();
  // Caution: **Do not hunt in a packed shape** (the save's shape is one value per line, with one
  // space after the key. `kspage/share/store.kspl`'s `SPACING`).
  check(written.indexOf("\"kspage\": 6") >= 0, "the version goes into the text written out");
  // **The answer is the reason rather than a true or false** (`api.js`'s `load`). An empty
  // text is "it could be read", and a refusal names its reason. "It cannot be read" and "too
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

  // Read only. **This can be seen nowhere else.** Folding the tools and stopping the shortcut keys
  // are the DOM's side (it breaks as "it can be written to through the folded tools' gaps").
  //
  // Caution: **Do not look at a press not acting alone.** What is looked at is that **the text
  // saved does not change by one byte** (a changed document, however it came in, shows here).
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

  // Tab locations persist as paths and remain bounded.
  const done = ks.hold();
  const store = app.keepStore;
  const TAB = "probe-tab";
  (async function () {
    const place = ks.notAPath + "/kept.kspage";
    await store.keepWhere(TAB, { path: place });
    let was = await store.takeWhere(TAB);
    check(was !== null && was.path === place,
      "a tab's record comes back with its place (" + (was === null ? "none" : was.path) + ")");
    await store.keepWhere(TAB, null);
    check((await store.takeWhere(TAB)) === null, "having it remember null forgets it");
    await store.keepWhere(TAB, { path: "", bodyAt: "obsolete handle" });
    check((await store.takeWhere(TAB)) === null, "an old record without a path is ignored");
    await store.keepWhere(TAB, null);
    // More tabs than the cap, one after another: the newest stays, and not all of them do.
    const many = 20;
    for (let i = 0; i < many; i += 1) {
      await store.keepWhere("probe-cap-" + i, { path: place });
    }
    let kept = 0;
    for (let i = 0; i < many; i += 1) {
      if ((await store.takeWhere("probe-cap-" + i)) !== null) kept += 1;
    }
    check(kept < many, "the records of shut tabs do not pile up (" + kept + " of " + many + ")");
    check((await store.takeWhere("probe-cap-" + (many - 1))) !== null,
      "the tab laid down last is the one that stays");
    for (let i = 0; i < many; i += 1) await store.keepWhere("probe-cap-" + i, null);
    await again();
    await letGo();
  })().then(done, (e) => {
    check(false, "the handles' arena answers (" + String((e && e.stack) || e) + ")");
    done();
  });

  // 9''. The page lets its connection go when another page opens a later version of the store. It
  // opens it again at its next use. Held, that opening stops at `blocked`.
  // Caution: **Abort the upgrade once it is reached**, and **do not delete the store**. The other
  // sections keep drafts in it meanwhile. A later version left behind would shut this page's
  // own version out.
  async function letGo() {
    const now = (await indexedDB.databases()).find((one) => one.name === "kspage");
    const how = await new Promise((go) => {
      const ask = indexedDB.open("kspage", (now ? now.version : 0) + 1);
      ask.onblocked = () => go("blocked");
      ask.onupgradeneeded = () => {
        ask.transaction.abort();
        go("let go");
      };
      ask.onsuccess = () => {
        ask.result.close();
        go("no upgrade");
      };
      ask.onerror = () => go("failed");
    });
    check(how === "let go", "the page lets its storage go for a later version (" + how + ")");
    await store.keepWhere(TAB, { path: "after.kspage" });
    const was = await store.takeWhere(TAB);
    check(was !== null && was.path === "after.kspage", "and opens it again at its next use");
    await store.keepWhere(TAB, null);
  }

  // 9'. A page read again comes up on the document it had open, with where it writes back.
  //
  // **This can be seen nowhere else**: the start-up is the one moment the page stands on the sample
  // with a memory at hand. A window this page opens stands for a tab.
  // Caution: **Look at what a save writes, not only at what is shown.** Come up on the sample with
  // the earlier file still attached, the first save writes the sample over that file.
  async function again() {
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
    check((await lay("again.kspage", docOf(placeMark))).ok, "the document to read again is laid down");
    const child = window.open(location.pathname, "kspage-again");
    check(child !== null, "the window to read again can be opened");
    if (child === null) return;
    try {
      // ---- A document opened by a place ----
      // `kspage` stands only once the server has answered (`port/web/page.js`).
      check(await until(() => child.kspage && child.kspage.text() !== "",
        "the other window to stand up"),
      "the other window stands up with the server there");
      // **Arrived at afresh, it comes up on the sample** (it holds no record of its own yet).
      check(child.kspage.text().indexOf(placeMark) < 0
        && child.document.getElementById("local-path").value === "",
      "a window arrived at afresh comes up on the sample, carrying no place");
      // A reload can abort the pending IndexedDB write. Wait for its transaction to finish,
      // not merely for the document to appear on screen.
      const store = child.kspage.keepStore;
      const keepWhere = store.keepWhere;
      let placed = null;
      store.keepWhere = (tab, where) => {
        placed = keepWhere(tab, where);
        return placed;
      };
      const field = child.document.getElementById("local-path");
      field.value = "again.kspage";
      field.dispatchEvent(new child.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      check(await until(() => child.kspage.text().indexOf(placeMark) >= 0, "the place to open"),
        "the other window opens the place");
      check(placed !== null, "opening the document asks to keep its place");
      await placed;
      check(await readAgain(child), "the other window is read again");
      check(await until(() => child.kspage.text().indexOf(placeMark) >= 0, "the place reopened"),
        "a page read again comes up on the document it had open (" + child.kspage.text() + ")");
      check(child.document.getElementById("local-path").value === "again.kspage",
        "its path field names where that document lives ("
          + child.document.getElementById("local-path").value + ")");
      const shown = child.kspage.save();
      child.document.getElementById("save").click();
      check(await until(() => saidThere(child, "Saved (again.kspage"), "the save after reading again"),
        "a save after reading again writes back to that place");
      const kept = await readBack("again.kspage");
      check(kept === shown && kept.indexOf(placeMark) >= 0,
        "what it writes is the document it came up on, not the sample");

      // A save retains its baseline even when the same path is reopened while its read waits.
      const beforeRace = child.fetch;
      let releaseRead = null;
      child.fetch = (url, opts) => {
        if (releaseRead === null && String(url).startsWith("/api/stat?")) {
          return new Promise((go) => { releaseRead = () => go(beforeRace(url, opts)); });
        }
        return beforeRace(url, opts);
      };
      child.document.getElementById("save").click();
      check(await until(() => releaseRead !== null, "the save's read to wait"),
        "the save can wait while its path is reopened");
      const outside = docOf("changed while the save waited");
      await lay("again.kspage", outside);
      check(await child.kspage.openDoc("again.kspage"), "the same path reopens with changed text");
      if (releaseRead) releaseRead();
      check(await until(() => saidThere(child, "changed outside"), "the old save to refuse"),
        "the old save retains its original comparison text");
      check(await readBack("again.kspage") === outside, "reopening does not authorize the old save");
      child.fetch = beforeRace;

      // ---- A save still writing while the document in view changes ----
      //
      // Caution: **A save's place goes to the document it was made for.** With its write held back
      // and a blank sheet made meanwhile, the blank sheet must not take the file written.
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
      const stayed = await heldSave("race-away.kspage", blank);
      check(stayed && child.kspage.pathNow() === "" && pathField().value === "",
        "a document that came into view while it was written does not take the file ("
          + child.kspage.pathNow() + ")");
      child.fetch = passOn;
    } finally {
      child.close();
    }
    const refused = window.open(location.pathname + "#t=invalid-probe-token", "kspage-refused");
    check(refused !== null, "the startup-refusal window opens");
    if (refused !== null) {
      try {
        check(await until(() => saidThere(refused, "The page could not start"),
          "startup to refuse the invalid token"), "a refused server connection stops startup");
        check(!refused.kspage, "the editor is not published after failed startup");
      } finally {
        refused.close();
      }
    }
  }
}
