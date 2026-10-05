// ==========================================
// kspage's page — files: the document's name, saving and opening. **Every path that replaces the
// current document is here**; exporting to other formats, and importing what only inserts, are in
// [`inout.js`](inout.js).
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
  const kf = { openKind: KIND_JSON, docId: mintDoc(), bodyAt: null, aside: "",
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
  // The language the name declares (the extension itself); **no list here** — any name passes, and
  // the core only names the style after it (`sheet_for` in `../../share/text.kspls`).
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
  // What "Open" offers, **one list for the picker and the file field** (written twice, the field
  // of a browser without the picker hid what the picker opens).
  const OPEN_KINDS = [BODY_KIND, MD_KIND, TEXT_KIND];
  file.accept = OPEN_KINDS.flatMap((k) => Object.entries(k.accept)
    .flatMap(([type, exts]) => [...exts, type])).join(",");
  // Where the current document writes back.
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
  let keptWhere = { path: "", bodyAt: null };
  let keeping = false;
  // Stores where the document lives, **when that changed**, once per turn.
  const keepWhere = () => {
    if (keeping || !tabName) return;
    keeping = true;
    queueMicrotask(() => {
      keeping = false;
      const now = { path: kf.seen.path, bodyAt: kf.bodyAt };
      if (now.path === keptWhere.path && now.bodyAt === keptWhere.bodyAt) return;
      keptWhere = now;
      handles.keepWhere(tabName, now.path.length > 0 || now.bodyAt ? now : null);
    });
  };
  // Forgets the tab's record (a location that could not be reopened).
  const forgetWhere = () => {
    keptWhere = { path: "", bodyAt: null };
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
  // ---- Replacing the document ----
  // **A window holds one document**, so opening another replaces it, and **nothing typed is lost
  // by that**: the outgoing document's unsaved text is set aside as a draft, which "Bring the draft
  // back" lists at once (`keep.js`'s `keepAside`). To keep another document in view beside this
  // one, open it in another window.
  // Caution: **Take the draft before reading** (reading replaces the text), and **set it aside only
  // once the new document is in**: a refused read leaves the document as it was, drafted as before.
  const planOpen = () => (ui.draftNow ? ui.draftNow() : null);
  const NOWHERE = { path: "", bodyAt: null };
  // Makes the just-loaded document the current one: a new identity, where it lives (`where`), and
  // what the draft compares against, then sets `out` (`planOpen`'s) aside. **Every path that
  // replaces the document ends here** (per path, one would skip a step and lose a draft or save
  // into the previous document's file). The notice's tail for what was set aside is `kf.aside`.
  // Caution: **Mint the identity before `remember`**; **a path compares with the text read from
  // it**, the rest with their own text, so Markdown does not look changed on opening.
  const settleIn = (out, kind, where, read) => {
    kf.openKind = kind;
    kf.docId = mintDoc();
    if (kf.bodyAt !== where.bodyAt) bindBody(where.bodyAt);
    pathBox.value = where.path;
    remember(where.path, where.path.length > 0 ? read : bodyText());
    kf.aside = ui.keepAside ? ui.keepAside(out) : "";
  };
  // Loads a read document over the current one: "" if it could, else the reason (the current one
  // stays as it was).
  const layIn = (out, kind, text, name, where) => {
    const why = readAs(kind, text, name);
    if (why !== "") return why;
    settleIn(out, kind, where, text);
    return "";
  };

  // Whether the text changed since it was read (the status bar's "Unsaved"). **A document in no
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
    if (why === "withdrawn") {
      return "This document holds a window onto source code or a line joining two frames, which "
        + "kspage no longer shows. It was not opened, so nothing in it is lost";
    }
    return why === "too_big"
      ? `This document is too large to lay down (${kb(size)} / the cap that can be opened is `
        + `${kb(app.docLimit())}). Split it and then open it`
      : "It is not a shape that can be loaded";
  };

  // Caution: **Put the entry points on `kf` before passing it to `save.js`** (that file touches
  // nothing except through `kf`).
  Object.assign(kf, { KIND_JSON, KIND_MD, KIND_TEXT, app, bindBody, bodyExt, bodyText, canBind,
    deny, forgetWhere, keepName, kindOf, kindPick, layIn, nameInPath, nameOf, pathBox, pathOf,
    planOpen, recalled, remember, say, takeChosen, takeName, typeOf, ui, whyNotRead });
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

  // Opens the manual, **replacing the document the same way as every other opening** ("A document
  // is replaced by another only when nothing would be lost" in `../../docs/DESIGN.md`).
  document.getElementById("open-manual").addEventListener("click", () => {
    const out = planOpen();
    const made = app.loadManual();
    // Caution: **Decide the opening format anew per document** (an earlier Markdown document is no
    // reason to write the manual as Markdown); **it lives in no file**, so no save lands elsewhere.
    if (made) settleIn(out, KIND_JSON, NOWHERE, "");
    tell(made, "Opened the manual" + kf.aside, "The manual could not be opened");
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
  // Caution: **Do not lose the current document** — what is unsaved is set aside as a draft first
  // (`settleIn`), as on every opening (`../../docs/DESIGN.md`'s "How a blank document is started").
  // **Do not keep where it writes back**, or a save overwrites the earlier file with a blank page.
  // **Undo the read-only look** the core takes off.
  const newDoc = () => {
    const out = planOpen();
    app.loadBlank();
    // Caution: **Store the blank page's text as what it compares against** (`settleIn` does); an
    // empty text would make it look "changed", and blank drafts would pile up (`draftNow`).
    settleIn(out, KIND_JSON, NOWHERE, "");
    docName.value = "kspage";
    keepName();
    ui.dressRead();
    say("Opened a blank document" + kf.aside);
    app.focus();
  };
  // Caution: **The document at startup has something to compare against too**, or the sample itself
  // is saved as a draft and "there is an earlier draft" appears on every reload.
  remember("", bodyText());

  document.getElementById("doc-new").addEventListener("click", newDoc);

  // With a picker that can keep a handle, where it opened is where it writes back; without, the
  // file field chooses (it depends on the browser; one click runs one of them).
  document.getElementById("open").addEventListener("click", async () => {
    // **"Open" is the browser's own dialog, server or not**; where it opened is where it writes
    // back (`save.js`'s `saveToFile`); opening by path is the path field's Enter and `?doc=`.
    if (!canBind) {
      file.click();
      return;
    }
    let got = null;
    try {
      got = await window.showOpenFilePicker({ types: OPEN_KINDS });
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
    // Caution: **Do not ask for the handle again where it could not be read** — obtained within the
    // click's user activation, once dropped it cannot be obtained again.
    takeChosen(await got[0].getFile(), got[0]);
  });
  // Cleared so that choosing the same file again still fires a change.
  file.addEventListener("change", () => {
    const chosen = file.files[0];
    file.value = "";
    if (chosen) takeChosen(chosen, null);
  });
  // The function that takes a file the browser passed in, **one for the picker, the file field and
  // a drop**; `bodyAt` is its handle where the browser gave one (null otherwise).
  // Caution: **Bind the handle only once its document is loaded**: bound before, an unreadable
  // file leaves its handle on the current document, and the next save writes into a file it did not
  // come from ("A document is written back where it was opened" in `../../docs/DESIGN.md`).
  function takeChosen(body, bodyAt) {
    return body.text().then((t) => {
      // Caution: **Take the draft just before loading**, as `openDoc` does. **The name decides the
      // text's format.**
      const out = planOpen();
      const why = layIn(out, kindOf(body.name), t, body.name, { path: "", bodyAt: bodyAt });
      if (why !== "") {
        deny(whyNotRead(why, t));
        app.focus();
        return false;
      }
      // **Keep the text read through the handle**; saving compares the file with it.
      if (bodyAt) kf.seenAt.set(bodyAt, t);
      // The file's name becomes the document's name (the next save goes back to it).
      takeName(body);
      say("Loaded it" + kf.aside);
      app.focus();
      return true;
    });
  }

  // **The name goes with the comments** (empty, a comment is stored with an empty "by").
  const who = document.getElementById("who");
  who.addEventListener("input", () => { app.author = who.value; });

  return {
    // **The download function and the name are one each** ([`report.js`](report.js) borrows them).
    download: download,
    nameOf: nameOf,
    pathBox: pathBox,
    docName: docName,
    openFromUrl: openFromUrl,
    openDoc: openDoc,
    // Whether the status bar says "Unsaved".
    unsaved: unsaved,
    // The one bundle passed to the draft; **its text is null when there is nothing to lose**.
    // Caution: **Do not decide that by `unsaved`** — it deliberately says a document with no
    // location has not changed, so a document typed from a blank page would go unsaved. **One entry
    // point for the question and the content** (split, the text would be built twice per throttle),
    // in the opened format, with the identity even when there is nothing to lose.
    draftNow: () => {
      const text = bodyText();
      return { id: kf.docId, kind: kf.openKind, path: kf.seen.path, name: docName.value,
        text: text === kf.seen.body ? null : text };
    },
    // Restores a draft over the current document, **unbound** ("" or the reason): the draft can be
    // older than the file, so if bound, one click of save could revert the file to an older
    // version. What the current document has unsaved is set aside first (`settleIn`).
    draftTake: (one) => {
      const out = planOpen();
      const why = readAs(one.kind, one.text, one.name);
      if (why !== "") return whyNotRead(why, one.text);
      settleIn(out, one.kind, NOWHERE, "");
      // Caution: **It stays a draft until it is saved** (compared with nothing), or opening another
      // document over it would drop the text that was just brought back.
      remember("", "");
      docName.value = one.name || "kspage";
      keepName();
      ui.dressRead();
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
  };
}
