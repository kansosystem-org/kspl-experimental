// ==========================================
// kspage's page — the panel on the right (the slides, and the current slide's contents), the
// status bar at the bottom, and the theme.
//
// **It is not in the fixed area at the top** (the body would move down by the slide count).
// **The stacking order is the document's order**; the list's top is the frontmost.
// Caution: **Rebuild it only when the contents changed** (rebuilt on every keystroke, a name being
// typed would vanish).
// ==========================================
function kspageSide(ui) {
  const app = ui.app;
  const tell = ui.tell;
  // ---- The panel on the right ----
  // (The rules are in this file's header.)
  const objectsBox = document.getElementById("objects");
  // Caution: **Start as "not built yet".** As empty text it would equal the first mark, the build
  // would be skipped, and the guidance for empty contents would never appear.
  let objectsMark = null;
  // The label.
  // **Show a label for something without a name too** (a list of "Shape 3"s cannot be told apart).
  // A given name is shown (the "Figure" menu sets it).
  const objectName = (one) => {
    if (one.name.length > 0) return one.name;
    const kind = one.tie ? "Line" : one.hasText ? "Text box" : "Shape";
    return kind + " " + (one.index + 1);
  };
  // **The caller passes the slide count** (asked here, the layout would run once more on every
  // keystroke).
  const slidesBox = document.getElementById("slides");
  const outlineBox = document.getElementById("outline");

  // ---- The tabs (Headings / Slides / Placed) ----
  // Caution: **Do not mix them into one list** (what you look for drifts away, as in LibreOffice's
  // Navigator), **nor push the items into another panel** (like Word's "selection pane", closed
  // until opened). **Always show all the tabs**, each with its count, so what is there is visible
  // without clicking. **Do not switch the tab on a click** (choosing a shape would hide the
  // headings). **Remember it**, and **work on a page that cannot store** (read it guarded).
  const TAB_KEY = "kspage.side.tab";
  const docsBox = document.getElementById("docs");
  const panes = { outline: outlineBox, slides: slidesBox, objects: objectsBox, docs: docsBox };
  const tabs = Array.from(document.querySelectorAll("#side-tabs > button"));
  let tabAt = "outline";
  try {
    const was = localStorage.getItem(TAB_KEY);
    if (was !== null && panes[was] !== undefined) tabAt = was;
  } catch (_) { /* it works on a page that cannot remember too */ }
  const showPane = () => {
    for (const one of tabs) {
      const mine = one.dataset.pane === tabAt;
      one.setAttribute("aria-selected", mine ? "true" : "false");
      panes[one.dataset.pane].hidden = !mine;
    }
  };
  // The tab's count.
  // Caution: **Show 0 even when the contents are empty.**
  const tallyTab = (which, many) => {
    const tab = document.getElementById("side-tab-" + which);
    tab.querySelector(".tally").textContent = String(many);
  };
  for (const one of tabs) {
    one.addEventListener("click", () => {
      tabAt = one.dataset.pane;
      try {
        localStorage.setItem(TAB_KEY, tabAt);
      } catch (_) { /* it works on a page that cannot remember too */ }
      showPane();
      app.focus();
    });
  }
  showPane();
  // Whether to keep the panel collapsed.
  // Caution: **Remember it**, and **work on a page that cannot store** (read it guarded).
  // Collapsed, it stays hidden even with contents.
  const SIDE_KEY = "kspage.side";
  const side = document.getElementById("side");
  const sideKey = document.getElementById("side-toggle");
  let sideShut = false;
  try {
    sideShut = localStorage.getItem(SIDE_KEY) === "0";
  } catch (_) { /* it works on a page that cannot remember too */ }

  // ---- The panel's width ----
  // Caution: **It must be adjustable** — the right width differs per document, and fixed, a long
  // heading stays cut (as in Google's panel). **Remember it** (Word does not), and **keep it when
  // the tab switches**. **Not only by dragging** (a barrier for unsteady hands): it moves by key,
  // and a double click restores the default. **Do not write the limits here.** One place holds
  // them, `page.css`'s `--side-room` — a maximum that depends on the window's width cannot be
  // written as a number, so with both holding them one would go stale (Principle 4). This holds
  // only the remembered number and the default.
  const WIDTH_KEY = "kspage.side.width";
  const SIDE_WAS = 216;
  const grip = document.getElementById("side-grip");
  let sideWide = SIDE_WAS;
  try {
    const kept = Number(localStorage.getItem(WIDTH_KEY));
    if (kept > 0) sideWide = kept;
  } catch (_) { /* it works on a page that cannot remember too */ }
  // Announces the current width.
  // Caution: **Announce the measured width**, not the remembered number the CSS may have clamped.
  // **As a percentage**, so the default 0 to 100 holds and the limits stay in one place; the px is
  // in `aria-valuetext`.
  const tellWide = () => {
    const room = Math.round(side.getBoundingClientRect().width);
    const all = document.documentElement.clientWidth || 1;
    grip.setAttribute("aria-valuenow", String(Math.round((room / all) * 100)));
    grip.setAttribute("aria-valuetext", room + "px");
  };
  // Applies the width.
  // Caution: **Measure the body's width again too** (or its right edge hides behind the panel).
  // **It is remembered only on release**, not throughout the drag.
  const putWide = (keep) => {
    document.documentElement.style.setProperty("--side", sideWide + "px");
    ui.fit();
    tellWide();
    if (!keep) {
      return;
    }
    try {
      localStorage.setItem(WIDTH_KEY, String(sideWide));
    } catch (_) { /* it works on a page that cannot remember too */ }
  };
  putWide(false);
  // **Re-read the announced width when focus enters** (a wider window moves the CSS maximum, so the
  // applied value is stale).
  grip.addEventListener("focus", tellWide);
  // Dragging.
  // Caution: **Capture the pointer**, or a fast pointer leaving the handle cuts the drag off and
  // the body starts selecting. **Do not decide by whether capture worked** (a synthetic pointer
  // cannot be captured, as in `keys.js`); a flag of its own tracks the drag. **The width is "from
  // the panel's right edge to the pointer"** (summed deltas lag behind the limit). **Give focus
  // here** so `←` `→` work at once, **not via `preventDefault`** (it stops focus and the double
  // click) — and not back to the body (the header of `fly.js`: used step by step).
  let held = false;
  grip.addEventListener("pointerdown", (e) => {
    held = true;
    grip.classList.add("on");
    grip.focus();
    try {
      grip.setPointerCapture(e.pointerId);
    } catch (_) { /* even where it cannot be captured, the press's handling goes on */ }
  });
  grip.addEventListener("pointermove", (e) => {
    if (!held) {
      return;
    }
    sideWide = Math.max(0, Math.round(side.getBoundingClientRect().right - e.clientX));
    putWide(false);
  });
  const letGo = () => {
    if (!held) {
      return;
    }
    held = false;
    grip.classList.remove("on");
    putWide(true);
  };
  grip.addEventListener("pointerup", letGo);
  // Caution: **Handle a cancelled drag too** (or the highlight stays after release).
  grip.addEventListener("pointercancel", letGo);
  // Moving it by key.
  // **Move from the measured width** — from a remembered number out of range, the clamped width
  // would not move. The panel is on the right, so a leftward key widens it.
  grip.addEventListener("keydown", (e) => {
    const way = e.key === "ArrowLeft" ? 1 : e.key === "ArrowRight" ? -1 : 0;
    if (way === 0) {
      return;
    }
    e.preventDefault();
    sideWide = Math.round(side.getBoundingClientRect().width) + way * 16;
    putWide(true);
  });
  // A double click restores the default.
  grip.addEventListener("dblclick", () => {
    sideWide = SIDE_WAS;
    putWide(true);
    ui.say("Put the navigation's width back to the default");
  });

  // ---- The document outline ---- **It is built from the headings** (a list of its own would go
  // stale). **It rebuilds from the text and the depth alone** (with positions included, it would
  // rebuild on every keystroke). **Do not decide show / hide here** (one place, the tabs, decides
  // which list is shown; Principle 6).
  // **Return the count to the caller**, which needs it too, so the core is not asked twice.
  let outlineMark = "";
  const drawOutline = () => {
    const heads = app.headings();
    tallyTab("outline", heads.length);
    const mark = heads.map((h) => h.level + ":" + h.number + h.text).join("|");
    if (mark === outlineMark) return heads.length;
    outlineMark = mark;
    outlineBox.textContent = "";
    // Caution: **Do not make a separate item that returns to the table of contents** — its heading
    // is **an ordinary heading** (`in_chapters` is a style setting), and jumps the same way. The
    // items that jump to the document's ends **stand at their place in the list** (the start at the
    // top, the end at the bottom), and **share the keys' entry point** (Ctrl+Home / Ctrl+End).
    const edge = (label, why, run) => {
      const row = document.createElement("button");
      row.type = "button";
      // Caution: **Keep the `edge` class.** It is what tells these two items from the heading
      // items, and `kspage/tests/browser/outline.js` relies on it — going by the label instead, a
      // renamed label would make the check click an edge item as a heading. No rule styles it
      // (`--edge` in `page.css` is a color role, not this).
      row.className = "item who edge";
      row.style.paddingLeft = "6px";
      row.textContent = label;
      row.title = why;
      row.addEventListener("click", () => {
        run();
        app.focus();
      });
      outlineBox.appendChild(row);
    };
    edge("The document's head", "Moves to the document's head", () => app.goStart());

    for (let i = 0; i < heads.length; i += 1) {
      const h = heads[i];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "item who";
      // **Show the depth by indenting** (a number alone does not tell a chapter from a section).
      row.style.paddingLeft = `${(h.level - 1) * 12 + 6}px`;
      row.textContent = h.number.length > 0 ? h.number + " " + h.text : h.text;
      row.title = "Moves to this heading";
      row.addEventListener("click", () => {
        tell(app.headingGo(i), "", "This heading is no longer there");
        app.focus();
      });
      outlineBox.appendChild(row);
    }
    edge("The document's tail", "Moves to the document's tail", () => app.goEnd());
    return heads.length;
  };

  // The list of open documents.
  // Caution: **Show a draft's mark**, or "something unsaved" goes unnoticed (and closing it is
  // refused). **Provide a way to close too** (the list fills up and nothing more opens).
  let docsMark = "";
  const drawDocs = () => {
    const got = ui.docList();
    const mark = got.map((one) => one.at + (one.here ? "*" : "") + (one.unsaved ? "!" : "")
      + one.name).join("|");
    if (mark === docsMark) return got.length;
    docsMark = mark;
    docsBox.textContent = "";
    for (const one of got) {
      const row = document.createElement("div");
      row.className = one.here ? "item on" : "item";
      const who = document.createElement("button");
      who.type = "button";
      who.className = "who";
      // Caution: **Put the draft's mark next to the name** (not everyone can read color alone).
      who.textContent = (one.unsaved ? "● " : "") + one.name;
      who.title = one.path.length > 0 ? one.path : "A document whose save target is not chosen yet";
      who.addEventListener("click", () => {
        tell(ui.docGo(one.at), "", "This document is not open");
        app.focus();
      });
      row.appendChild(who);
      const shut = document.createElement("button");
      shut.type = "button";
      shut.className = "lift";
      shut.textContent = "✕";
      shut.title = "Close this document";
      shut.addEventListener("click", () => {
        ui.docShut(one.at);
        app.focus();
      });
      row.appendChild(shut);
      docsBox.appendChild(row);
    }
    return got.length;
  };

  const drawSide = (many) => {
    // Caution: **Show it where there is a shape**, slides or not (a shape can sit on the body or a
    // cell too). **With neither, the whole panel collapses** (an empty panel only narrows the
    // body).
    const got = app.objects();
    const heads = drawOutline();
    tallyTab("slides", many);
    tallyTab("objects", got.length);
    tallyTab("docs", drawDocs());
    // Caution: **Show the panel for headings alone too.** On a prose-only document with neither
    // slides nor shapes, the overview would vanish.
    // **Show the panel when there are two or more documents** (the only way back to another one).
    const room = many > 0 || got.length > 0 || heads > 0 || app.docCount() > 1;
    // **The user's choice wins**: collapsed stays collapsed, whatever is drawn.
    side.hidden = sideShut || !room;
    // **Hide the resize handle with it** (alone it is a strip that does nothing, even by key).
    grip.hidden = side.hidden;
    // **Mark on the root that the panel is shown**: the split view stops before the panel by it
    // (`page.css`).
    if (side.hidden) {
      delete document.documentElement.dataset.side;
    } else {
      document.documentElement.dataset.side = "1";
    }
    // **Where there are no contents, hide the toggle too.**
    sideKey.hidden = !room;
    sideKey.classList.toggle("on", !sideShut);
    sideKey.title = sideShut ? "Put the navigation out" : "Fold the navigation";
    if (side.hidden) {
      objectsMark = "";
      return;
    }
    // **The mark holds only what the look depends on** (with positions in it, a drag rebuilds).
    const mark = got.map((one) => objectName(one) + (one.picked ? "*" : "")).join("|");
    if (mark === objectsMark) return;
    objectsMark = mark;
    objectsBox.textContent = "";
    if (got.length <= 0) {
      const none = document.createElement("div");
      none.className = "none";
      none.textContent = "Draw a shape and they are listed here";
      objectsBox.appendChild(none);
      return;
    }
    // Caution: **Put the frontmost on top**, or raising and lowering look reversed.
    for (const one of got.slice().reverse()) {
      const row = document.createElement("div");
      row.className = one.picked ? "item on" : "item";
      const who = document.createElement("button");
      who.type = "button";
      who.className = "who";
      who.textContent = objectName(one);
      who.title = one.style.length > 0 ? "Style: " + one.style : "The style is as the parent's";
      // **With Shift held it extends the selection** (the same key as for a click in the document).
      who.addEventListener("click", (e) => {
        tell(app.pickObject(one.index), "", "It cannot be selected");
        app.focus();
      });
      row.appendChild(who);
      for (const way of [["▲", true], ["▼", false]]) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "lift";
        key.textContent = way[0];
        key.title = way[1] ? "To the front" : "To the back";
        key.addEventListener("click", () => {
          // Caution: **Select it first** — the entry point moves the selected frame (maybe
          // another).
          app.pickObject(one.index);
          tell(app.raiseObject(way[1]), "", "It cannot move any further");
          app.focus();
        });
        row.appendChild(key);
      }
      objectsBox.appendChild(row);
    }
  };

  // Shows and collapses the panel.
  // Caution: **Measure the width again** (or the body does not widen when it collapses).
  // **The two toggles must change the same one setting**, or after the corner's toggle closes it
  // the status bar's toggle still says "collapse".
  const flip = () => {
    sideShut = !sideShut;
    try {
      localStorage.setItem(SIDE_KEY, sideShut ? "0" : "1");
    } catch (_) { /* it works on a page that cannot remember too */ }
    drawSide(app.surfaceCount());
    ui.watchSide();
    ui.fit();
    app.focus();
  };
  sideKey.addEventListener("click", flip);
  document.getElementById("side-close").addEventListener("click", flip);

  // ---- The status bar ----
  // **The left shows "where you are now"**, which explains half the clicks that do nothing.
  const whereBox = document.getElementById("where");
  const tallyBox = document.getElementById("tally");
  // ---- The editing mode ----
  //
  // **It is not a property of the document** but a way of viewing: it is saved nowhere, so a copy
  // is editable. **Do not take it for protection** — it is **a guard against misclicks**, not a
  // lock (Word's "recommend read-only" gets read as "protected").
  // Caution: **Do not give it a shortcut key** — a silent switch by a mistyped key leaves no reason
  // why editing fails (LibreOffice's `Ctrl+Shift+M`). **The display of the mode and its switch are
  // one element** (the status bar's left edge).
  const MODES = [["edit", "Edit"], ["read", "Read only"]];
  const modeFly = kspageFlyout(document.getElementById("mode"), {
    id: "mode-picks", name: "The editing mode", picks: () => MODES,
    now: () => (app.readOnly() ? "read" : "edit"),
    run: (value) => {
      app.setReadOnly(value === "read");
      // **Restore the tools' hiding too** (or editing is possible with the tools hidden).
      if (ui.dressRead) ui.dressRead();
      modeFly.sync();
      ui.say(value === "read" ? "Made it read only" : "Made it editable");
      app.focus();
    },
  });

  const atBox = document.getElementById("file-at");
  const atDir = atBox.querySelector(".dir");
  const atName = atBox.querySelector(".name");

  // Shows which file is open now in the status bar.
  // Caution: **Split the path into the folder part and the name**, and shrink only the folder part
  // (one element would lose the name first). **The separator goes with the folder part.**
  // **Readable in full on hover**, or same-named files cannot be told apart. The tab's title:
  // **which document this is**, or **every tab gets the same title** across windows. Set in the
  // same one place, **the document's name first** (a tab title is cut at the end).
  const showTab = (name) => {
    const want = name ? name + " — kspage" : "kspage";
    if (document.title !== want) document.title = want;
  };
  const showPlace = () => {
    const place = ui.placeNow ? ui.placeNow() : { kind: "none", at: "" };
    atBox.classList.toggle("nowhere", place.kind === "none");
    if (place.kind === "none") {
      atDir.textContent = "";
      atName.textContent = "No save target";
      atBox.title = "This document is not yet saved to any file";
      showTab(ui.docName ? ui.docName.value.trim() : "");
      return;
    }
    // **A file the browser chose has no path** (withheld); hovering over the name says why.
    if (place.kind === "pick") {
      atDir.textContent = "";
      atName.textContent = place.at;
      atBox.title = "It is a file chosen in the browser (the browser does not hand the path over)";
      showTab(place.at);
      return;
    }
    const cut = Math.max(place.at.lastIndexOf("/"), place.at.lastIndexOf("\\"));
    atDir.textContent = cut < 0 ? "" : place.at.slice(0, cut + 1);
    atName.textContent = cut < 0 ? place.at : place.at.slice(cut + 1);
    atBox.title = place.at;
    showTab(atName.textContent);
  };
  // **The counts and the position come from the caller** (as for `drawSide`).
  const showStatus = (many, inCells, picked) => {
    const face = app.blockStyle();
    const spots = [];
    // **Do not add the current mode here** (the status bar's left edge shows it, once).
    modeFly.sync();
    // **Being a draft goes in the status bar too**; the panel can be collapsed, and then another
    // document is **opened without noticing this one is unsaved**. The mark is text, not just
    // color.
    if (ui.unsaved && ui.unsaved()) spots.push("● Unsaved");
    // **Say that images were blocked**, or an empty frame cannot be told from a failed load. The
    // item that allows them is inside "The look".
    const held = app.picturesHeld();
    if (held > 0) spots.push("Stopping " + held + " outside images");
    // **Show that a tool is armed too**, or no color cannot be told from nothing armed.
    if (app.armed) spots.push("Tool: " + (app.armed.label || app.armed.shape));
    // **Inside a frame does not only mean inside a slide** (a shape on a paragraph or a cell is a
    // frame too).
    spots.push(picked !== null ? "In a shape" : inCells ? "In a table's cell" : "In the body");
    if (face.length > 0) spots.push("Style " + face);
    whereBox.textContent = spots.join(" / ");
    const counts = [];
    if (many > 0) counts.push("Slides " + many);
    if (app.paper().band > 0) counts.push("Pages " + app.paperCount());
    if (picked !== null) {
      // Caution: **Show how many are selected** — handles attach only to the nearest frame, so
      // selecting two and moving one goes unnoticed.
      counts.push("Shape " + Math.round(picked.w) + "×" + Math.round(picked.h));
    }
    tallyBox.textContent = counts.join(" / ");
    showPlace();
  };

  // Switches the current paragraph between two columns and one.
  // **The style holds the column count**, so every paragraph of that style changes together (no
  // invisible mark such as a section break).

  // ---- The look (the theme, and how densely the tools pack), and the viewer's overrides ----
  // **The theme and the density are defined by role** (`page.css`'s `:root`). This file only swaps
  // the root's attributes, and the rules and the canvas read nothing but the role names.
  // Caution: **Do not grow the fields** (with hundreds, every new part leaves the themes behind).
  // **Remember it, guarded.** Remembering and applying are one place (`keptPick` and `keptFly` both
  // go through `kept`). A checkbox is stored as "1" / "0", distinct from empty.
  const kept = (key) => ({
    read: () => {
      try {
        return localStorage.getItem(key);
      } catch (_) {
        return null;
      }
    },
    write: (value) => {
      try {
        localStorage.setItem(key, value);
      } catch (_) { /* it works on a page that cannot remember too */ }
    },
  });
  const keptPick = (id, key, wear) => {
    const box = document.getElementById(id);
    const boxed = box.type === "checkbox";
    const store = kept(key);
    const was = store.read();
    if (was !== null) {
      if (boxed) box.checked = was === "1";
      else box.value = was;
    }
    wear(box);
    box.addEventListener("change", () => {
      store.write(boxed ? (box.checked ? "1" : "0") : box.value);
      wear(box);
      ui.app.focus();
    });
    return box;
  };
  // A submenu that remembers.
  // Caution: **Do not go back to a `<select>`** — a closed field hides what is applied (the header
  // of `fly.js`). The value is kept here, so a closed item's text stays in step.
  const keptFly = (host, id, name, key, picks, wear) => {
    const store = kept(key);
    let at = store.read() || "";
    // **Remembered text not in the list falls back to the default** (a removed choice would leave
    // the mark nowhere).
    if (at !== "" && !picks.some(([value]) => value === at)) at = "";
    wear(at);
    const fly = kspageFlyout(host, {
      id: id, name: name, picks: () => picks,
      now: () => at,
      run: (value) => {
        at = value;
        store.write(value);
        wear(at);
        fly.sync();
        ui.app.focus();
      },
    });
    return fly;
  };
  // The item that swaps the root's attributes. **Empty means "the default"** (the attribute is
  // removed and it falls back to the `:root` above).
  const rootFly = (id, name, key, at, picks) => keptFly(
    document.getElementById("look-picks"), id, name, key, picks, (value) => {
      if (value) {
        document.documentElement.dataset[at] = value;
      } else {
        delete document.documentElement.dataset[at];
      }
      // **Redraw the canvas too** (it draws in the role colors), and measure the width and the
      // tools' height again.
      ui.headRoomVar();
      ui.fit();
    });
  // **The texts live only here** (not also in `page.html`).
  // The first is the default, and its value is empty (the `:root`'s attribute is removed).
  rootFly("look-theme", "Theme", "kspage.theme", "theme", [
    ["", "Standard (fits the screen)"],
    ["Mist", "Mist (a white ground and blue)"],
    ["Ink", "Ink (a dark ground and amber)"],
    ["Page", "Page (a warm white and brown)"],
  ]);
  rootFly("look-dense", "How tightly the tools pack", "kspage.dense", "dense", [
    ["", "Standard"],
    ["Tight", "Tight (a wider body)"],
    ["Roomy", "Roomy (for touch)"],
  ]);

  // The viewer's overrides. **The document does not change** (not saved, not in the HTML or on
  // paper). The core holds the width (layout and hit testing share one expression); the page holds
  // the colors (the core knows none). **Two fields are one override** (passing one alone deletes
  // the other).
  const wearOver = () => {
    const wide = document.getElementById("over-width");
    const size = document.getElementById("over-size");
    ui.app.setOver({
      reading: wide.value === "" ? 0 : Number(wide.value),
      size: size.value === "" ? 0 : Number(size.value),
      plain: document.getElementById("over-plain").checked,
      pics: document.getElementById("over-pics").checked,
    });
  };
  keptPick("over-width", "kspage.over.width", wearOver);
  keptPick("over-size", "kspage.over.size", wearOver);
  keptPick("over-plain", "kspage.over.plain", wearOver);
  // Whether to load external images.
  // Caution: **Do not route it through `keptPick`** — remembered, it would stay allowed next time.
  // Reloading blocks them again.
  document.getElementById("over-pics").addEventListener("change", () => {
    wearOver();
    ui.app.focus();
  });
  return {
    drawSide: drawSide,
    showStatus: showStatus,
    // Caution: **Call it once whenever the location changes** — left to the redraw, the earlier
    // path stays shown after opening (loading holds the redraw back until it is done).
    showPlace: showPlace,
  };
}
