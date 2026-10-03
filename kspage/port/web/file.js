// ==========================================
// kspage's page — files: the document's name, saving, opening, the change history, and the list
// of open documents. **Every path that replaces the current document is here**; exporting to
// other formats, and importing what only inserts, are in [`inout.js`](inout.js).
// Note: Pages, printing and presenting are in [`paper.js`](paper.js) (the 1000-line-per-file cap,
// Principle 3).
// **A file is written only when Save is clicked.** What is closed without saving is kept as a
// draft by [`keep.js`](keep.js) (**a draft is not a save** — the file does not change by one byte).
// ==========================================
function kspageFile(ui) {
  const app = ui.app;
  const say = ui.say, tell = ui.tell, deny = ui.deny;
  // ---- The document's name ----
  // **It is not part of the document** — the core holds no name; this is the file name the page
  // saves under, replaced on opening a file, and remembered so a newly typed name survives.
  const NAME_KEY = "kspage.name";
  const docName = document.getElementById("doc-name");
  try {
    const was = localStorage.getItem(NAME_KEY);
    if (was) docName.value = was;
  } catch (_) { /* it works on a page that cannot remember too */ }
  // Caution: **Do not use an empty name** (the file would be nothing but an extension).
  const nameOf = (ext) => (docName.value.trim() || "kspage") + ext;
  // The saved text's format, **not in the document** ("how it was opened", like read-only).
  // **Written back in the format it was opened** (as JSON, one document sits in two files with no
  // way to tell which is newer; `../../docs/DESIGN.md`'s "Markdown is edited as itself").
  const KIND_JSON = "json";
  const KIND_MD = "md";
  const KIND_TEXT = "text";

  // The identity per document. **A number cannot stand in for it** (a closed number is reused, and
  // the next document's draft would overwrite it); minted **only when the document is replaced**.
  let idAt = 0;
  const mintDoc = () => {
    idAt += 1;
    return "d" + idAt;
  };
  // What saving and loading **share, kept under one name** (scattered over the four paths, the
  // state could not be followed). `seenAt` holds, per handle, the text last read or written through
  // it, which writing back compares against (`save.js`'s `writeTo`); a handle restored after a
  // reload has nothing seen and is not guarded.
  // Caution: **Replace `seen` whole** — location and text change as a pair ("saved, yet changed").
  const kf = { openKind: KIND_JSON, docId: mintDoc(), bodyAt: null, pastAt: null,
    seen: { path: "", body: "" }, seenAt: new WeakMap() };
  // Decides from the name how to open (**a new document is kspage's JSON format**) — **in one
  // place**, or the format opened and the format written back differ per path (Principle 4). **An
  // unknown extension is plain text**; the core decides whether it is text
  // (`../../share/text.kspls`'s `texty`).
  // Caution: **Read `.json` as kspage's format too** — older documents use it, and read as text
  // their tables, formulas and styling collapse into one paragraph. Only `bodyExt` decides writing.
  const kindOf = (name) => {
    const low = (name || "").toLowerCase();
    if (low.endsWith(".md")) return KIND_MD;
    return low.endsWith(".kspage") || low.endsWith(".json") ? KIND_JSON : KIND_TEXT;
  };
  // The language the name declares (the extension itself); **no list here** — the core decides
  // whether it is known (`../../model/code.kspls`'s `colored`).
  const spokenOf = (name) => {
    const at = (name || "").lastIndexOf(".");
    return at < 0 ? "" : name.slice(at + 1).toLowerCase();
  };
  // Reads the text in that format, **returning the reason for refusing as it is**.
  const readAs = (kind, text, name) => {
    if (kind === KIND_MD) return app.loadMarkdown(text);
    return kind === KIND_TEXT ? app.loadPlainText(text, spokenOf(name)) : app.load(text);
  };
  // **Only this function decides the saved extension** (scattered, the default name and the
  // picker's declaration would split: "saved, yet cannot be opened"). **Plain text adds none**:
  // `.kspls.txt` would no longer be the file the compiler reads.
  const bodyExt = () => {
    if (kf.openKind === KIND_MD) return ".md";
    return kf.openKind === KIND_TEXT ? "" : ".kspage";
  };
  const keepName = () => {
    try {
      localStorage.setItem(NAME_KEY, docName.value.trim());
    } catch (_) { /* it works on a page that cannot remember too */ }
  };
  docName.addEventListener("change", () => renamed());
  docName.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    renamed();
    app.focus();
  });
  const takeName = (file) => {
    if (!file || !file.name) return;
    const cut = file.name.lastIndexOf(".");
    docName.value = cut > 0 ? file.name.slice(0, cut) : file.name;
    keepName();
  };

  // ---- Where it writes back ----
  // Saving is **writing back to the opened (or chosen) file**; with no handle, the user picks one.
  // **Few browsers can write back** (only desktop Chromium); elsewhere a copy is downloaded.
  // Caution: **Say so** — the same click overwriting in one place and creating a "name (1)" in
  // another is the most common complaint about other products. **Call the picker within the click's
  // user activation** (otherwise it does not open), so the text is built before any await.
  const canBind = typeof window.showSaveFilePicker === "function"
    && typeof window.showOpenFilePicker === "function";
  // **List `.json` too** (else an older document cannot be chosen); the first is what is saved.
  const BODY_KIND = { description: "A kspage document",
    accept: { "application/json": [".kspage", ".json"] } };
  const MD_KIND = { description: "A Markdown document", accept: { "text/markdown": [".md"] } };
  // **No list of extensions**: plain text can have any name, and an unlisted text would become
  // unchoosable; the picker always offers "all files" (`kindOf` decides how it is read).
  const TEXT_KIND = { description: "Plain text", accept: { "text/plain": [".txt"] } };
  const kindPick = (kind) => (kind === KIND_MD ? MD_KIND : kind === KIND_TEXT ? TEXT_KIND
    : BODY_KIND);
  const typeOf = (kind) => (kind === KIND_MD ? "text/markdown"
    : kind === KIND_TEXT ? "text/plain" : "application/json");
  const PAST_KIND =
    { description: "A kspage change history", accept: { "application/octet-stream": [".ksdb"] } };
  // Where the current document and the history write back.
  // Caution: **Clear it when a new name is typed** (`save.js`'s `renamed`).
  // **Keep the assignment here**: the tab's record is told when the handles change (`keepWhere`),
  // and a place that forgets would sometimes reopen something else after a reload.
  const handles = kspageHandles();
  // **A held target is a location too** (a chosen file has no path), so the status is updated.
  const bindBody = (at) => {
    kf.bodyAt = at;
    keepWhere();
    if (ui.showPlace) ui.showPlace();
  };
  const bindPast = (at) => { kf.pastAt = at; keepWhere(); };

  // ---- Where the shown document lives, across reloads ----
  // **It is remembered per tab** (`sessionStorage` survives a reload, and no other tab sees it):
  // under the tab's name `handle.js` stores the path and the handles. **Only a reload and going
  // back keep the name**; a page opened fresh starts on the sample.
  const TAB_KEY = "kspage.tab";
  const tabName = (() => {
    try {
      const how = (performance.getEntriesByType("navigation")[0] || {}).type;
      const was = sessionStorage.getItem(TAB_KEY);
      if (was && (how === "reload" || how === "back_forward")) return was;
      const made = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
      sessionStorage.setItem(TAB_KEY, made);
      return made;
    } catch (_) {
      return "";   // a page that cannot store anything starts on the sample every time
    }
  })();
  // What the tab's record held when the page started (null if none), **requested before anything
  // is stored**; `save.js`'s `reopen` takes it.
  const recalled = tabName ? handles.takeWhere(tabName) : Promise.resolve(null);
  let keptWhere = { path: "", bodyAt: null, pastAt: null };
  let keeping = false;
  // Stores where the document lives, **when that changed**, once per turn.
  const keepWhere = () => {
    if (keeping || !tabName) return;
    keeping = true;
    queueMicrotask(() => {
      keeping = false;
      const now = { path: kf.seen.path, bodyAt: kf.bodyAt, pastAt: kf.pastAt };
      if (now.path === keptWhere.path && now.bodyAt === keptWhere.bodyAt
        && now.pastAt === keptWhere.pastAt) return;
      keptWhere = now;
      handles.keepWhere(tabName, now.path.length > 0 || now.bodyAt || now.pastAt ? now : null);
    });
  };
  // Forgets the tab's record (a location that could not be reopened).
  const forgetWhere = () => {
    keptWhere = { path: "", bodyAt: null, pastAt: null };
    if (tabName) handles.keepWhere(tabName, null);
  };

  // ---- The local path ----
  // With the local server present, where it writes back is **a path** (relative to the served
  // folder). **The field is the state**, not stored separately (a reloaded page starts with its
  // document's path, `recalled` above).
  // Caution: **Call it a path**, the word Explorer and VS Code show (`../../docs/DESIGN.md`'s
  // "The established term stays the term"), not a word of our own.
  const pathRow = document.getElementById("local-row");
  const pathBox = document.getElementById("local-path");
  // **Empty when there is no server** (read unchecked, it would write to a path with no server).
  const pathOf = () => (ui.localHere && ui.localHere() ? pathBox.value.trim() : "");
  // The history's path, **from the document's path**, and **the same for either extension**
  // (otherwise `.kspage` and `.json` would each get a history, the older one unreadable).
  const pastPathOf = (path) => {
    for (const ext of [".kspage", ".json"]) {
      if (path.endsWith(ext)) {
        return path.slice(0, -ext.length) + ".ksdb";
      }
    }
    return path + ".ksdb";
  };
  // The path's last part, shaped as a file for `takeName` (which drops the extension).
  const nameInPath = (path) => {
    const cut = path.lastIndexOf("/");
    return { name: cut < 0 ? path : path.slice(cut + 1) };
  };
  // Enter opens the typed path, **the one way to open by path** (`save.js`'s `openFromPath`).
  pathBox.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    kf.openFromPath();
  });
  // The text last seen at that path, **so an outside change can be seen before writing back** (the
  // same file can be open in two windows): it is read back first and refused where it differs.
  // Caution: **Do not compare the time and the size** — that refuses where nothing changed (as VS
  // Code's "The content of the file is newer" can). **This is the one place that changes
  // `kf.seen`** (elsewhere, the status or the tab's record would keep the older path).
  const remember = (path, body) => {
    kf.seen = { path: path, body: body };
    if (ui.showPlace) ui.showPlace();
    keepWhere();
    // Caution: **Update the draft when what it compares against changes** — the one place the file
    // and the text meet, so out of step the draft would stay after saving (it asks `draftNow`).
    if (ui.keepSync) ui.keepSync();
  };
  // The current document as text **in the format it was opened in**, for writing back and compare.
  const bodyText = () => (kf.openKind === KIND_MD ? app.markdown()
    : kf.openKind === KIND_TEXT ? app.plainText() : app.save());
  // ---- The open documents ----
  // **Only a document that loses nothing when discarded is discarded and opened over.**
  // Caution: **Do not discard a draft silently** — with unsaved text, that document goes to the
  // drafts and a new one opens (`port/web/state.kspls`'s "The list of open documents"). **The core
  // assigns the number** and holds the document; this side remembers which file it is.
  const perDoc = new Map();
  // **Save whether it is a draft too**: a set-aside document's text lives in the core's list,
  // judged only on leaving; unjudged and called "clean", closing would discard it.
  const stashDoc = () => {
    // **Save it before leaving** (left to the throttle, the departed document's draft is lost).
    if (ui.keepSync) ui.keepSync();
    perDoc.set(app.docNow(), { path: kf.seen.path, body: kf.seen.body, kind: kf.openKind,
      bodyAt: kf.bodyAt, pastAt: kf.pastAt, name: docName.value, dirty: unsaved(),
      docId: kf.docId });
  };
  // Caution: **Where there is no saved copy, leave it alone** (a new slot is about to be loaded).
  const restoreDoc = () => {
    const had = perDoc.get(app.docNow());
    // **With no saved copy, mint a new identity**, or another document's draft takes the old one.
    if (had === undefined) {
      kf.docId = mintDoc();
      return;
    }
    // Caution: **Switch the identity before `remember`**, which updates the draft: out of order it
    // pairs the outgoing identity with the incoming comparison and discards the outgoing draft.
    kf.docId = had.docId;
    remember(had.path, had.body);
    kf.openKind = had.kind;
    bindBody(had.bodyAt);
    bindPast(had.pastAt);
    docName.value = had.name;
    pathBox.value = had.path;
  };
  // The index where that text is open (-1 if none).
  const slotOf = (path) => {
    if (path.length === 0) return -1;
    for (const [i, one] of perDoc) {
      if (app.docOpen(i) && one.path === path) return i;
    }
    return kf.seen.path === path ? app.docNow() : -1;
  };
  // The plan before opening: "switched" / "reuse" (load here) / "fresh" (new) / "full".
  const planOpen = (path) => {
    // Caution: **Save the draft before loading over the current one** (or the last typing is lost).
    const reuse = () => {
      if (ui.keepSync) ui.keepSync();
      return "reuse";
    };
    const at = slotOf(path);
    // Caution: **The text already shown is read again** ("Open" asks for a reread).
    if (at === app.docNow()) return reuse();
    if (at >= 0) {
      stashDoc();
      app.docUse(at);
      restoreDoc();
      return "switched";
    }
    // Caution: **With nothing to lose, replace it as it is** (a new slot per open fills up fast).
    if (!unsaved()) return reuse();
    stashDoc();
    if (app.docNew() < 0) {
      deny("There are too many documents open (shut one of them and then open)");
      restoreDoc();
      return "full";
    }
    return "fresh";
  };
  // Restores the plan where loading failed.
  const undoPlan = (plan) => {
    if (plan !== "fresh") return;
    app.docDrop(app.docNow());
    restoreDoc();
  };
  const NOWHERE = { path: "", bodyAt: null, pastAt: null };
  // Makes the just-loaded document the current one: a new identity, where it lives (`where`), and
  // what the draft compares against. **Every path that replaces the document ends here** (per path,
  // one would skip a step and lose a draft or save into the previous document's file).
  // Caution: **Mint the identity before `remember`**; **a path compares with the text read from
  // it**, the rest with their own text, so Markdown does not look changed on opening.
  const settleIn = (kind, where, read) => {
    kf.openKind = kind;
    kf.docId = mintDoc();
    if (kf.bodyAt !== where.bodyAt) bindBody(where.bodyAt);
    if (kf.pastAt !== where.pastAt) bindPast(where.pastAt);
    pathBox.value = where.path;
    remember(where.path, where.path.length > 0 ? read : bodyText());
  };
  // Loads a read document into `planOpen`'s slot: "" if it could, else the reason.
  const layIn = (plan, kind, text, name, where) => {
    const why = readAs(kind, text, name);
    if (why !== "") {
      undoPlan(plan);
      return why;
    }
    settleIn(kind, where, text);
    return "";
  };
  // The open documents (index, name, whether a draft); **the display reads only this**.
  const docList = () => {
    const out = [];
    for (let i = 0; i < 64; i += 1) {
      if (!app.docOpen(i)) continue;
      const mine = i === app.docNow();
      const had = perDoc.get(i);
      const path = mine ? kf.seen.path : (had === undefined ? "" : had.path);
      const name = mine ? docName.value : (had === undefined ? "" : had.name);
      out.push({ at: i, here: mine, path: path,
        name: path.length > 0 ? nameInPath(path) : (name || "Untitled document"),
        unsaved: mine ? unsaved() : (had !== undefined && had.dirty) });
      if (out.length >= app.docCount()) break;
    }
    return out;
  };

  // Whether the text changed since it was read ("may the draft be discarded"). **A document in no
  // file is "not changed"**; a handle is a location as much as a path.
  const unsaved = () => {
    if (kf.seen.path.length === 0 && !kf.bodyAt) return false;
    return bodyText() !== kf.seen.body;
  };
  // The cap is the core's (`app.docLimit`); a number written here would drift when the arena grows.
  const kb = (n) => (n / 1024).toFixed(0) + " KB";
  // Caution: **Do not guess the reason from the size** (compact text fits many more paragraphs into
  // the same bytes): the core's reason is passed on; the cap is only for the message.
  const whyNotRead = (why, text) => {
    const size = new TextEncoder().encode(text).length;
    if (why === "cramped") {
      return "It could not be opened because the memory was used up. Open the window again";
    }
    // Caution: **Report it apart from "cannot be read"** (an image needs another tool, not edits).
    if (why === "not_text") {
      return "This is not a text file (content that is not text is in it)";
    }
    return why === "too_big"
      ? `This document is too large to lay down (${kb(size)} / the cap that can be opened is `
        + `${kb(app.docLimit())}). Split it and then open it`
      : "It is not a shape that can be loaded";
  };

  // Caution: **Put the entry points on `kf` before passing it to `save.js`** (that file touches
  // nothing except through `kf`).
  Object.assign(kf, { KIND_JSON, KIND_MD, KIND_TEXT, PAST_KIND, app, bindBody, bindPast,
    bodyExt, bodyText, canBind, deny, forgetWhere, keepName, kindOf, kindPick, layIn, nameInPath,
    nameOf, pastPathOf, pathBox, pathOf, planOpen, recalled, remember, say, takeChosen, takeName,
    typeOf, ui, whyNotRead });
  kspageSave(kf);
  const { download, openDoc, openFromUrl, renamed, saveToFile, why } = kf;

  // Caution: **Show it after asking whether the server is there** (before, the no-server layout
  // flashes for an instant), **and not at all where there is none**. A `file://` page lands here.
  if (ui.localReady) {
    ui.localReady.then((there) => {
      if (there) pathRow.hidden = false;
    });
  }

  // ---- Choosing a file and reading it ----
  // **Every one of them replaces the current document** (inserting is in [`inout.js`](inout.js)).

  // Markdown imported as **a new document**, without the history (a history belongs to a document).
  const mdFile = document.getElementById("md-file");
  document.getElementById("open-md").addEventListener("click", () => mdFile.click());
  mdFile.addEventListener("change", () => {
    const chosen = mdFile.files[0];
    // Cleared so that choosing the same file again still fires a change.
    mdFile.value = "";
    if (!chosen) return;
    chosen.text().then((text) => {
      const plan = planOpen("");
      if (plan === "full") {
        app.focus();
        return;
      }
      // Caution: **Do not keep a handle** (the chosen file is read; it is not where it writes
      // back). The location is asked for at the first save.
      const why = layIn(plan, KIND_MD, text, chosen.name, NOWHERE);
      if (why === "") takeName(chosen);
      tell(why === "", "Opened the Markdown", whyNotRead(why, text));
      app.focus();
    });
  });
  // Opens the manual, **planned the same way as every other opening** ("A document is replaced by
  // another only when nothing would be lost" in `../../docs/DESIGN.md`).
  document.getElementById("open-manual").addEventListener("click", () => {
    const plan = planOpen("");
    if (plan === "full") {
      app.focus();
      return;
    }
    const made = app.loadManual();
    // Caution: **Decide the opening format anew per document** (an earlier Markdown document is no
    // reason to write the manual as Markdown); **it lives in no file**, so no save lands elsewhere.
    if (made) {
      settleIn(KIND_JSON, NOWHERE, "");
    } else {
      undoPlan(plan);
    }
    tell(made, "Opened the manual", "The manual could not be opened");
    app.focus();
  });
  // Caution: **Take over Ctrl+S** — otherwise the browser saves this HTML, not the document.
  addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      saveToFile();
    }
  });

  // ---- Starting from a blank page ----
  // Caution: **Do not close the current document** — "New" adds one, as everywhere else
  // (`../../docs/DESIGN.md`'s "How a blank document is started"). **Do not keep where
  // it writes back**, or a save overwrites the earlier file with a blank page (the guard does not
  // act, the draft being empty too). **Undo the read-only look** the core applies.
  const newDoc = () => {
    stashDoc();
    if (app.docNew() < 0) {
      deny("There are too many documents open (shut one of them and then make a new one)");
      restoreDoc();
      app.focus();
      return;
    }
    // Caution: **Store the blank page's text as what it compares against** (`settleIn` does); an
    // empty text would make it look "changed", and blank drafts would pile up (`draftNow`).
    settleIn(KIND_JSON, NOWHERE, "");
    docName.value = "kspage";
    keepName();
    ui.dressRead();
    if (ui.handWindows) ui.handWindows();
    say("Opened a blank document");
    app.focus();
  };
  // Caution: **The document at startup has something to compare against too**, or the sample itself
  // is saved as a draft and "there is an earlier draft" appears on every reload.
  remember("", bodyText());

  document.getElementById("doc-new").addEventListener("click", newDoc);

  // Caution: **Read the document before the history** (reloading it empties the history). With a
  // picker that can keep a handle, where it opened is where it writes back; without, the file field
  // chooses (it depends on the browser; one click runs one of them).
  document.getElementById("open").addEventListener("click", async () => {
    // **"Open" is the browser's own dialog, server or not**; where it opened is where it writes
    // back (`save.js`'s `saveToFile`); opening by path is the path field's Enter and `?doc=`.
    if (!canBind) {
      file.click();
      return;
    }
    let got = null;
    try {
      got = await window.showOpenFilePicker({ multiple: true,
        types: [BODY_KIND, MD_KIND, TEXT_KIND, PAST_KIND] });
    } catch (e) {
      // Caution: **Report a cancel too** (silent, it looks as if clicking does nothing).
      if (e && e.name === "AbortError") {
        say("Stopped the load");
      } else {
        deny("The file could not be chosen (" + why(e) + ")");
      }
      app.focus();
      return;
    }
    const past = got.find((at) => at.name.endsWith(".ksdb")) || null;
    const body = got.find((at) => at !== past) || null;
    // Caution: **Do not ask for the handle again where it could not be read** — obtained within the
    // click's user activation, once dropped it cannot be obtained again.
    const files = [];
    for (const at of got) {
      files.push(await at.getFile());
    }
    takeChosen(files, { body: body, past: past });
  });
  // Cleared so that choosing the same file again still fires a change.
  file.addEventListener("change", () => {
    const chosen = Array.from(file.files);
    file.value = "";
    takeChosen(chosen, null);
  });
  // The function that takes a file the browser passed in, **one for the picker, the file field and
  // a drop**.
  // Caution: **Bind the handles only once their document is loaded**: bound before, an unreadable
  // file leaves its handle on the current document, and the next save writes into a file it did not
  // come from ("A document is written back where it was opened" in
  // `../../docs/DESIGN.md`).
  function takeChosen(files, handles) {
    if (files.length <= 0) return Promise.resolve(false);
    const past = files.find((f) => f.name.endsWith(".ksdb")) || null;
    const body = files.find((f) => f !== past) || null;
    const pastAt = handles ? handles.past : null;
    if (!body) {
      takeTrail(past, pastAt);
      return Promise.resolve(false);
    }
    const bodyAt = handles ? handles.body : null;
    return body.text().then((t) => {
      // Caution: **Decide the plan just before loading**, as `openDoc` does, so a file that could
      // not be read makes no draft. **The name decides the text's format.**
      const plan = planOpen("");
      if (plan === "full") {
        app.focus();
        return false;
      }
      const why = layIn(plan, kindOf(body.name), t, body.name,
        { path: "", bodyAt: bodyAt, pastAt: pastAt });
      if (why !== "") {
        deny(whyNotRead(why, t));
        app.focus();
        return false;
      }
      // **Keep the text read through the handle**; saving compares the file with it.
      if (bodyAt) kf.seenAt.set(bodyAt, t);
      // The file's name becomes the document's name (the next save goes back to it).
      takeName(body);
      // Caution: **Read the history after the document** — loading a document empties it.
      const trail = past ? past.arrayBuffer().then((buf) => app.loadTrail(new Uint8Array(buf)))
        : Promise.resolve(true);
      return trail.then((ok) => {
        // **Pass the files to the windows of the opened document too** (the targets differ).
        if (ui.handWindows) ui.handWindows();
        tell(ok, "Loaded it", "The change history could not be read");
        app.focus();
        return true;
      });
    });
  }
  // Only a history came: it goes onto the current document, which is not replaced.
  function takeTrail(past, pastAt) {
    past.arrayBuffer().then((buf) => {
      const ok = app.loadTrail(new Uint8Array(buf));
      if (ok && pastAt) bindPast(pastAt);
      tell(ok, "Loaded it", "The change history could not be read");
      app.focus();
    });
  }

  // ---- The change history's wiring ----

  // **The name goes into the history** (empty, entries are stored with an empty "who" field).
  const who = document.getElementById("who");
  who.addEventListener("input", () => { app.author = who.value; });
  document.getElementById("show-trail").addEventListener("click", () => {
    // **Stamp before reading**, or what was just typed is not in the list.
    app.stampTrail();
    const list = document.getElementById("trail-list");
    // **Tabs cannot be seen**, so the field separators are made visible.
    list.textContent = app.trail().split("\n").filter((s) => s !== "")
      .map((s) => s.split("\t").join("  ")).join("\n");
    const lost = app.trailLost();
    if (lost > 0) {
      deny("The change history is full (" + lost + " did not go in)");
    } else {
      say(app.trailCount() > 0 ? "" : "There is no change history yet");
    }
    app.focus();
  });

  return {
    // **The download function and the name are one each** ([`report.js`](report.js) borrows them).
    download: download,
    nameOf: nameOf,
    pathBox: pathBox,
    docName: docName,
    openFromUrl: openFromUrl,
    openDoc: openDoc,
    // **How "may another document be opened and this one discarded" is decided.**
    unsaved: unsaved,
    // The one bundle passed to the draft; **null when there is nothing to lose**.
    // Caution: **Do not decide that by `unsaved`** — it deliberately says a document with no
    // location has not changed, so a document typed from a blank page would go unsaved. **One entry
    // point for the question and the content** (split, the text would be built twice per throttle),
    // in the opened format, with the identity even when there is nothing to lose.
    draftNow: () => {
      const text = bodyText();
      return { id: kf.docId, kind: kf.openKind, path: kf.seen.path, name: docName.value,
        text: text === kf.seen.body ? null : text };
    },
    // Restores a draft into a new slot, **unbound** ("" or the reason): the draft can be older than
    // the file, so if bound, one click of save could revert the file to an older version.
    draftTake: (one) => {
      stashDoc();
      if (app.docNew() < 0) {
        restoreDoc();
        return "There are too many documents open (shut one of them and then bring it back)";
      }
      const why = readAs(one.kind, one.text, one.name);
      if (why !== "") {
        app.docDrop(app.docNow());
        restoreDoc();
        return whyNotRead(why, one.text);
      }
      // Caution: **Store the restored text as what it compares against** (`settleIn` does), or
      // Markdown counts as "changed" at once and another draft of the same appears.
      settleIn(one.kind, NOWHERE, "");
      docName.value = one.name || "kspage";
      keepName();
      ui.dressRead();
      if (ui.handWindows) ui.handWindows();
      return "";
    },
    // The text open now (empty if none), **not the path field** (that can be retyped).
    pathNow: () => kf.seen.path,
    // The function that takes a file the browser passed in (dropping borrows it).
    takeChosen: takeChosen,
    // Where the current document lives: "path" (through the server) / "pick" (chosen in a browser,
    // the name only) / "none" — **never mixed** (shown as a path, a bare name would look like one).
    placeNow: () => {
      if (kf.seen.path.length > 0) return { kind: "path", at: kf.seen.path };
      if (kf.bodyAt) return { kind: "pick", at: kf.bodyAt.name };
      return { kind: "none", at: "" };
    },
    // The open documents and switching between them; **the display reads only here**.
    docList: docList,
    docGo: (i) => {
      if (i === app.docNow()) return true;
      stashDoc();
      if (!app.docUse(i)) return false;
      restoreDoc();
      return true;
    },
    // Caution: **Do not make it close only documents without a draft** — closing means "discard
    // it". With a draft it refuses once, against a misclick: save, then close.
    docShut: (i) => {
      const one = docList().find((x) => x.at === i);
      if (one !== undefined && one.unsaved) {
        deny("It does not shut because there are changes not saved (save with Ctrl+S and then "
          + "shut)");
        return false;
      }
      const here = i === app.docNow();
      if (here) stashDoc();
      if (!app.docDrop(i)) {
        deny("The last one cannot be shut");
        return false;
      }
      perDoc.delete(i);
      if (here) {
        restoreDoc();
      }
      return true;
    },
    // The current document's path, **empty without a server** (`command.js` puts images beside it).
    // Caution: **Do not read the field directly** (a second reader would miss the server check).
    docPath: pathOf,
  };
}
