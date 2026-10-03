// ==========================================
// kspage's page — startup and the frame: **only what every part needs** (notices, opening and
// closing menus, the shared wiring, the redraw notification, startup).
// Caution: **The parts reach each other only through `ui`**, and only for what the others need; a
// field grabbed directly silently breaks the day the setup order changes. Not an ES module
// (embedded whole into one page, it opens on file://). **The inclusion order is the template's**
// (`page.html`'s `__KSPAGE_FILE:…__`); this file sets up the parts, so it goes last.
// ==========================================

(function () {
  // **The template holds the texts** (`page.html`); a mark written here is not filled in.
  const b64 = kspageWasmBase64;
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

  const canvas = document.getElementById("page");
  kspageBoot(canvas, bytes).then((app) => {
    const side = document.getElementById("side");
    const sideRoom = () => (side.hidden ? 0 : side.getBoundingClientRect().width);
    const fit = () => {
      if (app.showing() >= 0) { app.present(app.showing()); return; }
      app.resize(document.body.clientWidth - 48 - sideRoom());
    };
    // Where the slide list is shown. **Without it, the list does not appear.**
    app.slideStrip = document.getElementById("slides");
    // Caution: **Pass the tools' bottom edge, with nothing added**: without it, following the
    // cursor stops behind the tools; with slack, it never reaches the body's first line.
    const chrome = document.getElementById("chrome");
    app.headRoom = () => chrome.getBoundingClientRect().bottom;
    // Ctrl+K and the ribbon reach a panel's field here (the key handler knows only the document).
    app.reach = (at, to) => ui.reach(at, to);
    // Shows a key's refusal with its reason (F4) in the status bar; empty text clears the line.
    app.words = (why) => { if (why) { ui.deny(why); } else { ui.say(""); } };
    // Caution: **The right panel's top is the tools' bottom, passed as a CSS variable** (it moves).
    const headRoomVar = () => {
      document.documentElement.style.setProperty("--head",
        Math.round(chrome.getBoundingClientRect().bottom) + "px");
    };
    addEventListener("resize", () => { headRoomVar(); fit(); });
    // Caution: **Measure the width again when the panel shows or hides** (else the edge hides).
    let sideWas = side.hidden;
    const watchSide = () => {
      headRoomVar();
      if (side.hidden === sideWas) return;
      sideWas = side.hidden;
      fit();
    };
    headRoomVar();
    fit();

    const note = document.getElementById("note");
    const file = document.getElementById("file");
    // The notice of a click's result, **only in the status bar**; empty text removes it.
    // Caution: **Give a refusal a different color**, or a click that did nothing goes unnoticed.
    // The log keeps every notice (what came before is the clue), capped, with no content.
    const trail = [];
    const trailMax = 60;
    const say = (msg, bad) => {
      note.textContent = msg;
      note.className = msg && bad ? "warn" : "";
      if (msg) {
        trail.push((bad ? "Error: " : "Notice: ") + msg);
        if (trail.length > trailMax) trail.shift();
      }
    };
    // A refusal: **the reason it did nothing goes through here** (uncolored, it goes unread).
    const deny = (msg) => say(msg, true);
    // Colors by success or refusal. **Both must have text** (empty removes the notice).
    const tell = (ok, good, bad) => { if (ok) { say(good); } else { deny(bad); } };

    // ---- The menus ----
    // Caution: **Only one opens** (the one behind cannot be clicked); **close it once a command is
    // clicked**, but not in a field being typed in. **One function closes them**, ribbon panels
    // too, looked up on the spot (the ribbon is rebuilt). **Include `…`**: it sits in the ribbon's
    // row, so "the bar's menus" miss it.
    const menus = Array.from(document.querySelectorAll("#bar > .menu, #spill"));
    const shutTools = (except) => {
      for (const m of menus) {
        if (m !== except) m.open = false;
      }
      for (const m of document.querySelectorAll("#ribbon details.menu[open]")) {
        if (m !== except) m.open = false;
      }
      // **Every panel opened on purpose** (shortcuts and ribbon buttons open the bar's, `reach`).
      for (const f of document.querySelectorAll(".fly.fly-on")) {
        if (f !== except) f.classList.remove("fly-on");
      }
    };
    for (const m of menus) {
      // **Close the others before opening** (`toggle` fires later, with two open); keys too.
      m.querySelector("summary").addEventListener("click", () => {
        if (!m.open) shutTools(m);
      });
      // Caution: **Not on a knob that opens a submenu** (the menu would vanish as it opened).
      m.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON"
          && !e.target.classList.contains("fly-open")) shutTools(null);
      });
    }
    // Caution: **Close it on a click outside**, or it hides where the click landed. **Inside an
    // open panel is not "outside"**, or it vanishes before a color is chosen.
    const TOOLS = "#bar > .menu, #spill, #ribbon details.menu, #ribbon .fly";
    addEventListener("pointerdown", (e) => {
      if (e.target.closest === undefined || !e.target.closest(TOOLS)) {
        shutTools(null);
      }
    });
    // **Close it once something is chosen**, but not on the knobs that open submenus (it would
    // never open); a ribbon button that goes to a field stops its own click (`ribbon.js`).
    document.getElementById("ribbon").addEventListener("click", (e) => {
      if (e.target.closest(".fly-open, summary") === null) shutTools(null);
    });
    // Caution: **Close it on Esc too** (WAI-ARIA), **not while composing** (that Esc cancels
    // composing: `isComposing`, Chrome's `keyCode` 229). **Catch it in the capture phase and stop
    // once closed** — Esc has three jobs (menu, armed tool, selection), one at a time from the top.
    const openTools = () => document.querySelectorAll(
      "#bar > .menu[open], #spill[open], #ribbon details.menu[open], #ribbon .fly.fly-on");
    addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.isComposing || e.keyCode === 229) return;
      if (openTools().length <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      shutTools(null);
      app.focus();
    }, true);

    // Caution: **One helper for a click's result, not one per part** (focus and color would drift).
    const putButton = (id, run, missed) => {
      document.getElementById(id).addEventListener("click", () => {
        if (run()) { say(""); } else { deny(missed); }
        app.focus();
      });
    };
    const lineButton = (id, run) => {
      document.getElementById(id).addEventListener("click", () => {
        tell(run(), "", "Click inside a table's cell");
        app.focus();
      });
    };
    // The same for a refusal with its reason: `run` returns "" if it acted, else the message.
    const whyButton = (id, run) => {
      document.getElementById(id).addEventListener("click", () => {
        const why = run();
        if (why === "") { say(""); } else { deny(why); }
        app.focus();
      });
    };
    // The read-only look **only hides the entry points that change the document**; the core refuses
    // (`kspage/write/edit.kspls`'s `shut`), shortcuts and pasting too.
    // Caution: **Put the class on the root** (`page.css`'s `[data-edit]` hides), **measure the
    // width again**, and **work in both directions** (or the tools stay hidden after read-only).
    const dressRead = () => {
      const read = app.readOnly();
      if (read) {
        document.documentElement.dataset.read = "1";
      } else {
        delete document.documentElement.dataset.read;
      }
      headRoomVar();
      fit();
    };

    // The handles for the parts, **set up bottom up** (later parts use earlier entry points).
    const ui = {
      app: app, canvas: canvas, say: say, tell: tell, deny: deny,
      // Goes to a group inside a menu, or a field inside it (without `to`, the group's own item).
      // **One path** for the ribbon and the context menu alike (two would drift).
      reach: (at, to) => {
        const box = to === undefined ? document.querySelector("#" + at + " > .fly-open")
          : document.getElementById(to);
        if (box === null) return;
        // Caution: **Open every level before setting the focus**: a closed menu or panel is laid
        // out as nothing, and a box not laid out takes no focus (the click reads as dead). A panel
        // opened on purpose has `fly-on` (`page.css`); `shutTools` closes it again.
        for (let up = box.parentElement; up !== null; up = up.parentElement) {
          if (up.tagName === "DETAILS") up.open = true;
          if (up.classList !== undefined && up.classList.contains("fly")) up.classList.add("fly-on");
        }
        box.focus();
        if (box.select) box.select();
      },
      // A count with agreeing number (`3 places`, `1 place`), **one function for every message**;
      // an irregular plural is passed in (`count(n, "entry", "entries")`). A verb or clause that
      // must agree too is written out in both forms at the call.
      count: (n, one, many) => `${n} ${n === 1 ? one : (many || one + "s")}`,
      putButton: putButton, lineButton: lineButton, whyButton: whyButton, shutTools: shutTools,
      fit: fit, watchSide: watchSide, headRoomVar: headRoomVar,
      dressRead: dressRead,
      // The log of the status bar's texts (the debug log reads it). **It only reads.**
      sayTrail: () => trail.slice(),
      // Caution: **Start another instance from the same bytes** (comparing looks needs a second
      // renderer), **on an offscreen canvas** (or its cursor shows).
      boot: (target) => kspageBoot(target, bytes),
    };
    // **Turn the HTML's groups into submenus before wiring**, or the contents move away from it
    // (the ids do not change, so later `getElementById`s still find them).
    kspageFlyGroups(document.getElementById("bar"));
    // **Set up the local server before the files** (they use its entry points).
    Object.assign(ui, kspageLocal(ui));
    Object.assign(ui, kspageFile(ui));
    // Caution: **After the files** (it borrows from them; they call `ui.keepSync` only if present).
    Object.assign(ui, kspageKeep(ui));
    // **Set it up after the files** (it borrows the download and the name).
    Object.assign(ui, kspageInout(ui));
    // **Set it up after the files** (printing borrows the download and the name).
    Object.assign(ui, kspagePaper(ui));
    kspageReport(ui);
    Object.assign(ui, kspageCommand(ui));
    // **Set it up after the local server** (it borrows the header that carries the token).
    Object.assign(ui, kspagePlugin(ui));
    Object.assign(ui, kspageForm(ui));
    Object.assign(ui, kspageRibbon(ui));
    Object.assign(ui, kspageSide(ui));
    // **Set it up after `app.headRoom` is set** (the split view measures from it).
    Object.assign(ui, kspagePeek(ui));
    Object.assign(ui, kspageDiff(ui));
    Object.assign(ui, kspageSource(ui));
    // **After the menus**: an item names a menu's button; before them, items silently go missing.
    Object.assign(ui, kspageHere(ui));
    // **Set it up after what opens files and what inserts an image** (drops go to them).
    kspageDrop(ui);
    // **Pass on the click handler for sources**, or a link to the source does nothing when clicked.
    app.onSource = ui.showSource;
    // Caution: **After the parts are set up**, it opens the URL's document (`?doc=…`) or the one
    // the tab had open before a reload (it touches the path field and the windows).
    const opened = ui.openFromUrl().catch(() => false);
    // It reports an earlier draft **once the document is open** (shown first, "Loaded it" replaces
    // it), **not in a window this page opened** (the opener is alive and still writing that draft).
    if (window.opener === null) opened.then(() => ui.keepBoot());
    // The plugins: **the check calls the ones a person uses**, so broken wiring cannot stay green.
    app.pluginNames = ui.pluginNames;
    app.pluginRun = ui.pluginRun;
    // **Ask for the plugins after the server is known** (with none, the group stays hidden).
    if (ui.localReady) {
      ui.localReady.then(() => ui.pluginBoot());
    }

    const formula = document.getElementById("formula");
    // Caution: **Do not rewrite a field mid-typing** (the typed text disappears), **nor wire clicks
    // in the redraw** (one click would act many times). The rows the cursor's table shows **while a
    // filter hides some** (unsaid, rows look lost).
    const narrowedBox = document.getElementById("narrowed");
    const sayNarrowing = () => {
      const got = app.rowsShown ? app.rowsShown() : null;
      narrowedBox.textContent = got !== null && got[2]
        ? `${got[0]} of ${ui.count(got[1], "row")} shown` : "";
    };
    app.onRedraw = () => {
      ui.dressing();
      sayNarrowing();
      // Caution: **Re-ask for the semantic colors and save the draft here**: a redraw is the only
      // sign that the text changed; throttling is their job (`keep.js`'s `keepLater`).
      ui.keepLater();
      // **Redraw the split view too**, or it shows an old picture; closed, it does nothing.
      ui.peekPaint();
      if (document.activeElement !== ui.hrefBox) {
        ui.hrefBox.value = app.href();
      }
      if (document.activeElement !== ui.noteBox) {
        ui.noteBox.value = app.note();
      }
      // Who wrote the comment is shown beside it, **not in a field** (not editable).
      if (ui.aimBox && document.activeElement !== ui.aimBox) {
        ui.aimBox.value = app.aimHere();
      }
      if (document.activeElement !== ui.remarkBox) {
        ui.remarkBox.value = app.remark();
      }
      ui.remarkBy.textContent = app.remarkBy();
      if (document.activeElement !== ui.frameNameBox) {
        ui.frameNameBox.value = app.name();
      }
      if (document.activeElement !== ui.asideBox) {
        ui.asideBox.value = app.aside();
      }
      // The contextual groups: **one row, shown only where they act** (a group may be absent).
      const picked = app.frameRect();
      const inCells = app.cellFrame() !== null;
      // Caution: **Put the collapsed groups back first too**, or they stay in `…` when the window
      // widens (`fitRibbon` collapses after the groups are decided).
      for (const box of document.querySelectorAll("#ribbon .group")) {
        box.hidden = box.dataset.when === undefined ? false
          : box.dataset.when === "frame" ? picked === null : !inCells;
      }
      ui.fitRibbon();
      // Caution: **Ask the slide count once, here** (twice runs extra layouts on every keystroke).
      const faces = app.surfaceCount();
      ui.drawSide(faces);
      watchSide();
      ui.showStatus(faces, inCells, picked);
      if (picked !== null) {
        for (const pair of ui.frameBoxes) {
          const box = ui.framePart(pair[0]);
          // Caution: **Do not rewrite it mid-typing** (the same reason as the formula field).
          if (box !== null && document.activeElement !== box) {
            box.value = Math.round(picked[pair[1]]);
          }
        }
        const stepBox = ui.framePart("frame-step");
        if (stepBox !== null && document.activeElement !== stepBox) {
          stepBox.value = app.frameStep();
        }
      }
      // Caution: **Copy the cells' sizes only inside a table** (outside, the fields are hidden).
      if (inCells) {
        ui.showCellSizes();
      }
      // **Count the matches again**, since typing changes them (an empty field does not count).
      ui.retally();
      if (app.showing() >= 0) return;
      // **Copy the style and color here into the fields**, or choosing again would strip them.
      ui.showSpan();
      if (document.activeElement === formula) return;
      const usable = app.takesFormula();
      // Caution: **Hide the whole row where it cannot be used** (it would waste a row).
      document.getElementById("formula-row").hidden = !usable;
      formula.disabled = !usable;
      formula.value = usable ? app.typed() : "";
    };
    formula.addEventListener("keydown", (e) => {
      // It is replaced only on Enter (on blur, clicking elsewhere would change the text).
      if (e.key === "Enter") {
        e.preventDefault();
        tell(app.setTyped(formula.value), "Changed the formula", "The formula is too long");
        app.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        formula.value = app.typed();
        app.focus();
      }
    });

    // A finished drag: **report a failure too** (outside a slide, silence reads as dead).
    app.onDraw = (ok) => { tell(ok, "Drew the shape", "A shape is placed inside a slide. Click a slide and then drag"); };
    // Caution: **Report a refusal from full memory** (silent, the click looks dead); not the bytes.
    app.onCramped = () => {
      deny("The memory is used up. Divide the document, or reopen the window");
    };
    // Showing and hiding the speaker's notes, **called from the key** (N).
    app.onNote = () => {
      tell(ui.flipNote(), "", "This slide has no note");
    };
    // Marks the armed tool, **and unmarks it once it is used**.
    app.onArm = (tool) => {
      // **Mark the collapsed list's knob too** (`group`, named by the shape), or it hides.
      for (const key of ui.ribbon.querySelectorAll("button, summary")) {
        const armed = tool !== null && tool !== undefined
          && (key.id === tool.id || key.id === tool.group);
        key.classList.toggle("on", armed);
      }
      ui.showStatus(app.surfaceCount(), app.cellFrame() !== null, app.frameRect());
    };
    // **Apply the chrome once** — the first redraw came before the notification was wired.
    app.onRedraw();
    // **Focus the hidden input, never the canvas** (not an editing element: no IME).
    app.focus();
    // The one handle for driving it from outside; it opens a document from text too (as `?doc=…`).
    // Caution: **The check does not start the page with a URL**, or every section would change.
    app.openDoc = ui.openDoc;
    // Which text is open now, **for back and forward** ("which file, and where").
    app.pathNow = ui.pathNow;
    // The open documents and switching among them, **for outside** (the page's list uses `ui`).
    app.docList = ui.docList;
    app.docGo = ui.docGo;
    app.docShut = ui.docShut;
    // Saving and restoring a draft: **the check calls the ones a person uses**, and `keepSync` by
    // name so as not to wait out the throttle (it would break the day the delay changes).
    app.keepSync = ui.keepSync;
    app.keepBoot = ui.keepBoot;
    app.keepRestore = ui.keepRestore;
    app.keepCount = ui.keepCount;
    // One draft back without a wait (**`keepRestore` waits on the storage**); loading drops the
    // compared version (`api_diff.js`), so the check calls it before the other sections.
    app.draftTake = ui.draftTake;
    // The draft storage, **so the check does not open its own** (why: `keep.js`'s `keepStore`).
    app.keepStore = ui.keepStore;
    // Caution: **Do not call the core's `docUse` directly** — it changes only the index, and the
    // name, the path and the handle stay (the next save goes elsewhere). Needed after closing:
    // `docDrop` moves to **the smallest index** (`port/web/state.kspls`'s `slot_drop`).
    app.docGo = ui.docGo;
    window.kspage = app;
  });
})();
