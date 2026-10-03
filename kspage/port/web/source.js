// ==========================================
// kspage's page — pointing from the document at the source (passing it in, linking, clicking to
// see it). **A browser cannot read a file by name alone**, only what a person passed in, so it
// needs a way to pass it in and a way to say it has not been (without stopping the page). **The
// text is not copied into the document**: the document holds two names, and the text is read and
// shown on the click ("Linking a design document to the source" in `../../../docs/DESIGN.md`).
// Caution: **Keep it as bytes.** The core returns positions in bytes, so cut as a JS string it
// shifts by however much the non-ASCII comments add up to.
// ==========================================

function kspageSource(ui) {
  const app = ui.app;
  const tell = ui.tell;
  const deny = ui.deny;
  // The text passed in. Name → bytes. **It is remembered only while this page is open** (kept in
  // storage, copies of the source would pile up).
  const handed = new Map();
  // The window's style name. **The page decides the name** (the same rule as a table, a slide and a
  // chart; the core holds no style name).
  const windowStyle = "window";
  const pullsStyle = "pulls";
  const chooser = document.getElementById("source-file");
  // Which text to refer to.
  // Caution: **Do not go back to a `<select>`** — a closed field hides the chosen name, so it
  // cannot be read until opened (the header of `fly.js`). The list is made from what was passed in,
  // so it is passed as a function.
  const pickHost = document.getElementById("source-pick");
  const pick = kspageHoldFly(pickHost,
    { id: "source-pick", name: "The file to refer to",
      picks: () => Array.from(handed.keys()).map((name) => [name, name]) });
  const nameBox = document.getElementById("source-name");
  const note = document.getElementById("source-note");
  const view = document.getElementById("source-view");

  // Lists the names passed in.
  // Caution: **Keep the chosen name** (otherwise the choice would jump each time more is passed
  // in).
  const drawList = () => {
    const was = pick.now();
    pick.paint();
    if (handed.has(was)) pick.set(was);
    pickHost.hidden = handed.size === 0;
  };

  // Picks the target text from among those passed in.
  // Caution: **Match on the end of the path** — the browser decides the passed-in name (a whole
  // folder gives `kspage/model/doc.kspls`, one file `doc.kspls`), so an exact match comes first,
  // then the end; **refuse where two or more match** ("which one is unclear" beats a wrong text).
  const findFile = (want) => {
    if (handed.has(want)) return { name: want, many: false };
    const tail = (one) => one.endsWith("/" + want) || want.endsWith("/" + one) || one === want;
    const got = Array.from(handed.keys()).filter(tail);
    if (got.length === 1) return { name: got[0], many: false };
    return { name: "", many: got.length > 1 };
  };

  // Shows the target place.
  // Caution: **Report "not passed in" and "the symbol is missing" separately** (neither may end as
  // "nothing appears").
  const show = (aim) => {
    if (aim === null) return false;
    const what = aim.name.length > 0 ? aim.file + " # " + aim.name : aim.file;
    const got = findFile(aim.file);
    if (got.name === "") {
      view.hidden = true;
      note.textContent = got.many
        ? `Two or more texts of the same name are handed over (${aim.file})`
        : `Not handed over yet (${what})`;
      return true;
    }
    const bytes = handed.get(got.name);
    const spot = app.sourceSpot(bytes, aim.name);
    if (spot === null) {
      view.hidden = true;
      note.textContent = `There is no such symbol (${what})`;
      return true;
    }
    view.textContent = new TextDecoder().decode(bytes.slice(spot.at, spot.at + spot.len));
    view.hidden = false;
      note.textContent = `From line ${spot.line} of ${got.name} (${what})`;
    return true;
  };

  // **Reading is asynchronous.** Do not rebuild the list until the files are all passed in (an
  // empty list would appear).
  chooser.addEventListener("change", () => {
    const files = Array.from(chooser.files || []);
    if (files.length === 0) return;
    Promise.all(files.map((one) =>
      one.arrayBuffer().then((buf) => {
        // Where a whole folder was passed in, the path inside it becomes part of the name.
        handed.set(one.webkitRelativePath || one.name, new Uint8Array(buf));
      })
    )).then(() => {
      drawList();
      // Caution: **Pass it to the windows too, at the same time.** Otherwise a window keeps showing
      // the text of its target (and it looks like "passed in, but nothing appears").
      const got = handWindows();
      tell(true, got.missing > 0
        ? `Handed ${handed.size} sources over (there are ${got.missing} windows not handed over yet)`
        : `Handed ${handed.size} sources over`, "");
      // When files are passed in, the target of the current place is shown again.
      show(app.sourceAim());
    });
    chooser.value = "";
  });

  document.getElementById("source-open").addEventListener("click", () => {
    chooser.click();
  });

  // Links the selection to the source. **The core builds the text** (`src:` is not written in the
  // page).
  document.getElementById("source-link").addEventListener("click", () => {
    const file = pick.now();
    if (file === "") {
      deny("Have the source read in first");
    } else {
      tell(app.linkSource(file, nameBox.value),
        "Tied it to the source (Ctrl+click opens it)",
        "There is nowhere to tie. Select a range");
      show(app.sourceAim());
    }
    app.focus();
  });

  // Passes in only the files that are pointed at.
  // Caution: **Do not pass in everything** (unread text piles up inside the wasm too), and **pass
  // them in again** whenever the document is reopened or a window is inserted.
  const handWindows = () => {
    let sent = 0;
    let missing = 0;
    for (const one of app.aims()) {
      const got = findFile(one.file);
      if (got.name === "") {
        missing += 1;
        continue;
      }
      if (app.handSource(one.file, handed.get(got.name))) sent += 1;
    }
    return { sent: sent, missing: missing };
  };

  // Inserts one window. **The contents do not go into the document** (they are cut from the
  // borrowed text at every layout).
  document.getElementById("source-window").addEventListener("click", () => {
    const file = pick.now();
    if (file === "") {
      deny("Have the source read in first");
    } else if (!app.insertWindow(windowStyle, file, nameBox.value)) {
      deny("There is nowhere to insert a source window");
    } else {
      const got = handWindows();
      tell(true, got.missing > 0
        ? `Put a window in (there ${got.missing === 1 ? "is" : "are"} `
          + `${ui.count(got.missing, "file")} not handed over)`
        : "Inserted the source window (change the source and it shows the next time it is opened)", "");
    }
    app.focus();
  });

  // Inserts one imports figure. **No symbol is needed** (imports belong to a whole file).
  document.getElementById("source-pulls").addEventListener("click", () => {
    const file = pick.now();
    if (file === "") {
      deny("Have the source read in first");
    } else if (!app.insertPulls(pullsStyle, file)) {
      deny("There is nowhere to insert a pulls figure");
    } else {
      handWindows();
      tell(true, "Inserted the pulls figure (change the source and it shows the next time it is opened)", "");
    }
    app.focus();
  });

  // Checks the targets.
  // Caution: **Report "not passed in" and "the symbol is missing" separately** — the fixes are
  // opposite (pass it in / change the document). If a live worked example is shown from a test's
  // function, this says "the symbol is missing" the day that test is renamed (that is what makes
  // the link fail when its target is gone).
  const STATES = ["Not read in yet", "Found", "This symbol is absent"];
  document.getElementById("source-check").addEventListener("click", () => {
    const got = app.aims();
    if (got.length === 0) {
      view.hidden = true;
      note.textContent = "This document refers to no source";
      app.focus();
      return;
    }
    const lost = got.filter((one) => one.state === 2).length;
    const away = got.filter((one) => one.state === 0).length;
    view.textContent = got.map((one) =>
      `${STATES[one.state]}\t${one.file}${one.name === "" ? "" : " # " + one.name}`).join("\n");
    view.hidden = false;
    note.textContent = lost > 0
      ? `${lost} of the ${got.length} symbols are absent (change the document)`
      : away > 0
        ? `${away} of the ${got.length} are not handed over yet`
        : `All ${got.length} were found`;
    app.focus();
  });

  document.getElementById("source-shut").addEventListener("click", () => {
    view.hidden = true;
    note.textContent = "";
  });

  // Caution: **Keep a way to open it from the clicked place.** Openable only from the menu, a link
  // in the document becomes "text that does nothing when clicked".
  return {
    showSource: show,
    // **Call it once the document is reopened** (the targets change).
    handWindows: handWindows,
  };
}
