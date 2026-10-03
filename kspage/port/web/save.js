// ==========================================
// kspage's page — saving and loading, **on the same `kf` as `file.js`**.
//
// **This file only writes text out and reads text in.** The name, the write-back handle, the path
// and the open documents belong to [`file.js`](file.js), reached through `kf`.
// **The fields that change live only in `kf`** (`openKind` / `bodyAt` / `pastAt` / `seen` /
// `seenAt`); a `let` here would split the current state.
// Caution: **Go through `kf.remember` once it is saved**, or it reads "saved, yet changed" (the
// path and the text change as a pair). The boundary follows [`DESIGN.md`](../../docs/DESIGN.md)'s
// "The boundary between the core and the browser".
// ==========================================
function kspageSave(kf) {
  const { KIND_JSON, KIND_MD, KIND_TEXT, PAST_KIND, app, bindBody, bindPast, bodyExt,
    bodyText, canBind, deny, forgetWhere, keepName, kindOf, kindPick, layIn, nameInPath, nameOf,
    pastPathOf, pathBox, pathOf, planOpen, recalled, remember, say, takeChosen, takeName, typeOf,
    ui, whyNotRead } = kf;
  //
  // Caution: **Before writing, check whether that path has changed**, or it silently overwrites
  // another window's changes. To the handle, else the path, else it downloads a copy.

  const changedOutside = async (path) => {
    if (kf.seen.path !== path || kf.seen.body === "") {
      return false;
    }
    // Caution: **Ask whether it exists first** (reading a missing file shows a refusal; asking is
    // silent).
    if (!(await ui.localStat(path))) {
      return false;
    }
    const bytes = await ui.localRead(path);
    // Caution: **Where it could not be checked, fall back to refusing**, not overwriting (the read
    // function has said why).
    if (bytes === null) {
      return true;
    }
    return new TextDecoder().decode(bytes) !== kf.seen.body;
  };
  // Where the field is.
  // **Say where it is in words**, quoting the label as the screen shows it (the field is in a
  // collapsed menu). **Do not open the menu and move focus** — the click closes it again, and a
  // flag to keep it open would have nothing to clear it after Ctrl+S.
  const pathIsAt = "\"Path for saving and opening\" under \"File\"";

  // Caution: **Do not ignore a typed name** — the target is cleared and asked for again at the next
  // save. **Clear the path too**, or it writes the same file whatever the name.
  const renamed = () => {
    keepName();
    const path = pathOf();
    if (!kf.bodyAt && !kf.pastAt && !path) return;
    bindBody(null);
    bindPast(null);
    if (path) pathBox.value = "";
    say("The name has changed, so the save target will be confirmed at the next save");
  };
  // The text of the reason for a refusal.
  // Caution: **Do not mistake it for a cancel** (told apart by name below).
  const why = (e) => String((e && e.message) || e);
  // The refusal when the file changed outside after it was read. **One message for both kinds of
  // location** (a path and a handle), and it names how it compares.
  const deniedOutside = (where) => {
    deny(where + " has been changed outside since it was opened. Confirm it with [Share]'s"
      + " [Compare with an earlier version], or save it under a different name");
  };
  // What `writeTo` returns when the file changed outside (every other refusal is its reason).
  const OUTSIDE = "changed outside since it was read";
  // Writes back to the held target: empty text if written, else the reason (**keep the target**).
  // **Ask for permission again** — it lapses while the handle is held.
  // Caution: **With `guard`, compare the file with the text last seen through the handle before
  // writing** (`kf.seenAt`). The same file can be chosen in two windows, so a silent overwrite
  // deletes what the other wrote — the same rule as a path's `changedOutside`. **Read it after the
  // permission** (reading needs it too). **A missing file has not changed**; any other read failure
  // falls back to refusing, since nothing is written.
  const writeTo = async (at, data, guard) => {
    const ask = { mode: "readwrite" };
    try {
      if ((await at.queryPermission(ask)) !== "granted"
        && (await at.requestPermission(ask)) !== "granted") {
        return "The permission was not given";
      }
      if (guard && kf.seenAt.has(at)) {
        let now = null;
        try {
          now = await (await at.getFile()).text();
        } catch (e) {
          if (!e || e.name !== "NotFoundError") throw e;
        }
        if (now !== null && now !== kf.seenAt.get(at)) return OUTSIDE;
      }
      const to = await at.createWritable();
      await to.write(data);
      await to.close();
      return "";
    } catch (e) {
      return why(e);
    }
  };
  // Asks the user to choose one write-back target. null if none is chosen.
  // **A cancel is not a failure** (it is not turned into a refusal).
  // Caution: **Report everything else**, or the click looks dead (outside a click's user activation
  // it refuses with a `SecurityError`, after a wait).
  const askFor = async (name, kind) => {
    try {
      return await window.showSaveFilePicker({ suggestedName: name, types: [kind] });
    } catch (e) {
      if (e && e.name === "AbortError") {
        say("Stopped the save");
      } else {
        deny("The save target could not be chosen (" + why(e) + ")");
      }
      return null;
    }
  };

  // Makes a file of the text and downloads it.
  // Caution: **Make it a Blob** (a data: URL limits long text). **A button takes the focus**, so
  // return it to the input field or typing stops.
  function download(text, name, type, msg) {
    const url = URL.createObjectURL(new Blob([text], { type: type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Caution: Do not revoke it at once, or an empty file downloads.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say(msg);
    app.focus();
  }
  // Downloads the document and the history.
  // **Stamp what was just typed first**, or the history misses it. **The history is a separate
  // file**, left out when empty. Saving with the local server present:
  // **Where no question is needed, do not ask** — with the path empty, **it writes under `kssrv`'s
  // folder by the field's name**, and that path goes into the field.
  // Caution: **Do not silently overwrite an existing file** (the default name `kspage` can clash):
  // it refuses and says where the field is. What was dropped is reported on its own line.
  const sayLost = (lost) => {
    if (lost > 0) {
      deny("There are " + lost + " settings Markdown cannot hold, and they were lost from the file written out");
    }
  };

  // Whether the document the save was made for is still the one shown.
  // Caution: **A save waits on the write, and the view can change meanwhile** (a failed drop
  // restores the old place; one that opens stays). So the path and the text are stored after the
  // write and on that same document only, or another document gets a file it never came from.
  const stillHere = (mine) => kf.docId === mine;
  // The note added when the shown document is not the one written (its next save asks again).
  const MOVED = ". Another document came into view while it was written, and that one does not "
    + "take this file";
  const saveLocal = async (body, past, mine) => {
    const path = pathOf();
    if (path) {
      await saveToPath(path, body, past, mine);
      return;
    }
    // Caution: **Do not write the extension here** — only `file.js`'s `bodyExt` decides it, or a
    // Markdown or text document would be offered kspage's extension.
    const first = nameOf(bodyExt());
    if (await ui.localStat(first)) {
      deny(first + " is already there. To overwrite it, enter it into " + pathIsAt);
      app.focus();
      return;
    }
    await saveToPath(first, body, past, mine);
  };

  // Writes back to the local path.
  // **Write the document first**, or a newer history would get ahead of it on the next read.
  const saveToPath = async (path, body, past, mine) => {
    // Caution: **Where it changed outside, do not silently overwrite** (another window's write
    // would be lost); how it compares is named.
    if (await changedOutside(path)) {
      deniedOutside(path);
      app.focus();
      return;
    }
    const stopped = await ui.localWrite(path, body);
    if (stopped) {
      deny("Could not write to the file on the local server (" + stopped + ")");
      app.focus();
      return;
    }
    // Caution: **Store the written text, and set the path, on the document the save was for**
    // (`stillHere` above), or the next save wrongly says "it changed outside". The version is
    // stored **after the save** (which sets the origin mark).
    const here = stillHere(mine);
    if (here) {
      pathBox.value = path;
      remember(path, body);
      if (ui.keepPast) ui.keepPast();
    }
    const tail = here ? "" : MOVED;
    if (!past) {
      say("Saved (" + path + ")" + tail);
      app.focus();
      return;
    }
    const to = pastPathOf(path);
    const halted = await ui.localWrite(to, past);
    if (halted) {
      deny("The document was saved, but the history's file could not be written (" + halted + ")");
      app.focus();
      return;
    }
    say("Saved (" + path + " and " + to + ")" + tail);
    app.focus();
  };

  const saveToFile = async () => {
    // **The document the save is for** (`stillHere` above) and its target, taken before any await.
    const mine = kf.docId;
    const pastAt0 = kf.pastAt;
    app.stampTrail();
    // **Build the text before any await** (an await ends the click's user activation).
    const body = bodyText();
    // Caution: **Where anything will be dropped, say so before writing**, or **nobody notices what
    // vanished** from a Markdown document (`api.js`'s `markdownDropped`).
    const lost = kf.openKind === KIND_MD ? app.markdownDropped() : 0;
    // **No history file next to a document kept as text** (a growing .ksdb does not belong in a
    // folder kept as text, under git and the like).
    const past = kf.openKind === KIND_JSON && app.trailCount() > 0 ? app.trailBytes() : null;
    // **Where it opened is where it writes back**: a handle from the dialog, else the path; with
    // the path empty, under the served folder by name (the dialog could land outside it, where no
    // path reopens it). The path then goes into the field and the tab's record.
    if (ui.localHere && ui.localHere() && !kf.bodyAt) {
      await saveLocal(body, past, mine);
      sayLost(lost);
      return;
    }
    if (!canBind) {
      download(body, nameOf(bodyExt()), typeOf(kf.openKind),
        "Downloaded a copy (this browser cannot write back to a file)");
      sayLost(lost);
      // Stores the saved form as a version.
      // Caution: **Call it after the save** (which sets the origin mark). The same text is not
      // stored twice.
      if (ui.keepPast) ui.keepPast();
      if (past) {
        download(past, nameOf(".ksdb"), "application/octet-stream", "Downloaded the change history too");
      }
      return;
    }
    // **A target just chosen in the dialog is written as it is** — choosing an existing file is the
    // person's own "replace it" (the dialog asks). Every other handle is compared first.
    const fresh = !kf.bodyAt;
    if (fresh) {
      const chosen = await askFor(nameOf(bodyExt()), kindPick(kf.openKind));
      if (!chosen) {
        app.focus();  // `askFor` has already reported what happened
        return;
      }
      // **A target chosen for a document no longer shown is not bound to the one shown.**
      if (!stillHere(mine)) {
        deny("Another document came into view while the file was chosen, so nothing was saved");
        app.focus();
        return;
      }
      bindBody(chosen);
      takeName(kf.bodyAt);
    }
    const at = kf.bodyAt;
    const stopped = await writeTo(at, body, !fresh);
    // Caution: **Keep the handle when it changed outside.** It is still the right target; what is
    // needed is a comparison, or another name.
    if (stopped === OUTSIDE) {
      deniedOutside(at.name);
      app.focus();
      return;
    }
    if (stopped) {
      if (stillHere(mine)) bindBody(null);
      deny("Could not write to the file (" + stopped + "). Save again and the target can be chosen");
      app.focus();
      return;
    }
    // **Store the written text** through `kf.remember` (see the header), or the next save wrongly
    // says "it changed outside" and the saved document looks unsaved.
    kf.seenAt.set(at, body);
    const here = stillHere(mine);
    if (here) {
      remember("", body);
      if (ui.keepPast) ui.keepPast();
    }
    if (!past) {
      say("Saved (" + at.name + ")" + (here ? "" : MOVED));
      sayLost(lost);
      app.focus();
      return;
    }
    // **The history is a separate file**, so its target is asked for separately, once, and only
    // while that document is shown.
    let pastAt = pastAt0;
    if (!pastAt && here) {
      pastAt = await askFor(nameOf(".ksdb"), PAST_KIND);
      if (pastAt && stillHere(mine)) bindPast(pastAt);
    }
    if (!pastAt) {
      deny("Saved the document (" + at.name + "). The change history's save target is not chosen");
      app.focus();
      return;
    }
    const halted = await writeTo(pastAt, past);
    if (halted) {
      if (stillHere(mine)) bindPast(null);
      deny("The document was saved, but the history's file could not be written (" + halted + ")");
      app.focus();
      return;
    }
    say("Saved (" + at.name + " and " + pastAt.name + ")" + (stillHere(mine) ? "" : MOVED));
    app.focus();
  };
  document.getElementById("save").addEventListener("click", saveToFile);

  // Loads the read text as this page's document, into the slot `plan` decided. If unreadable it
  // shows the reason, restores the slot (`layIn`), and returns false.
  // **Both ways of opening (the path field, and text) come here**, so neither acts alone. **The
  // name decides the text's format**, which is also the format written back.
  // **The read text is kept**, under a new identity, by `layIn` for the outside-change check. **No
  // handle is kept** (an older one would write somewhere other than where it opened from).
  const takeDoc = (plan, path, text) => {
    const why = layIn(plan, kindOf(path), text, path, { path: path, bodyAt: null, pastAt: null });
    if (why !== "") {
      deny(whyNotRead(why, text) + "(" + path + ")");
      return false;
    }
    // The name comes from the path's last part (the next downloaded copy gets the same name).
    takeName(nameInPath(path));
    return true;
  };

  // Opens a path.
  // Caution: **Read the history along with it**, where there is one. **Read the document first**
  // (reading it empties the history). Ask `/api/stat` whether a history exists, or a 404 shows as
  // a refusal. **The path is passed in** (the field, or the tab's record); true is returned where
  // the document is the one shown.
  const openPlace = async (path) => {
    const bytes = await ui.localRead(path);
    if (!bytes) {
      app.focus();   // `localRead` has already reported what happened
      return false;
    }
    const text = new TextDecoder().decode(bytes);
    const plan = planOpen(path);
    if (plan === "full") {
      app.focus();
      return false;
    }
    if (plan === "switched") {
      say("Showed it (" + path + ")");
      app.focus();
      return true;
    }
    if (!takeDoc(plan, path, text)) {
      app.focus();
      return false;
    }
    const to = pastPathOf(path);
    const info = ui.localStat ? await ui.localStat(to) : null;
    if (info) {
      const trail = await ui.localRead(to);
      if (trail && !app.loadTrail(trail)) deny("The change history could not be read (" + to + ")");
    }
    // Caution: **Pass the files to the opened document's windows again too** (they differ per
    // document).
    if (ui.handWindows) ui.handWindows();
    say("Loaded it (" + path + ")");
    app.focus();
    return true;
  };
  const openFromPath = () => {
    const path = pathOf();
    if (!path) {
      deny("Enter the place to open into " + pathIsAt + " (for example docs/notes.kspage)");
      app.focus();
      return Promise.resolve(false);
    }
    return openPlace(path);
  };

  // ---- Opening a document named in the URL ----
  //
  // `kspage.html?doc=docs/design.kspage` starts with that document open: **a link to a document
  // from a README or a PR**. `&read=1` opens it read-only.
  //
  // Caution: **Accept only a relative path on the same origin.** A scheme (`https:` / `data:`),
  // `//` and `..` are refused — **otherwise one link could make this page read and show anything**.
  // A plain `fetch` reads it, so any static server will do. **Keep the query** (unlike `local.js`'s
  // `#t=` token it is not a secret, and a reload returning to the document is the link's point).
  const wanted = (key) => new URLSearchParams(location.search).get(key) || "";
  // Whether it is a path fit to open. **Do not let it point outside the served folder.** **Check
  // after percent-decoding too** (the server decodes it, so `%2e%2e%2f` = `../`), **and check `\`**
  // (a separator on Windows). A scheme (`http:` and the like) is refused too.
  const isSafePath = (path) => {
    if (path.length <= 0 || path.indexOf("//") === 0) return false;
    let plain = path;
    try {
      plain = decodeURIComponent(path);
    } catch (_) {
      return false;
    }
    for (const one of [path, plain]) {
      if (one.indexOf(":") >= 0 || one.indexOf("\\") >= 0) return false;
      if (one.split("/").indexOf("..") >= 0) return false;
    }
    return true;
  };
  // Opens a document named by a text. true if it could.
  //
  // **The caller reads the URL** (`openFromUrl` below); this takes one text and checks it too (a
  // fresh page with a `?doc=` URL would put every other section on another document).
  const openDoc = async (path) => {
    if (!isSafePath(path)) {
      deny("What can be opened is a relative path as seen from the same place as this page, and "
        + "nothing else (" + path + ")");
      return false;
    }
    const answer = await fetch(path).catch(() => null);
    if (answer === null || !answer.ok) {
      deny("This document could not be loaded (" + path + ")");
      return false;
    }
    const text = await answer.text();
    // **Decide the plan just before loading** (no draft for an unreadable document).
    const plan = planOpen(path);
    if (plan === "full") return false;
    if (plan === "switched") {
      say("Showed it (" + path + ")");
      return true;
    }
    if (!takeDoc(plan, path, text)) return false;
    if (ui.handWindows) ui.handWindows();
    say("Loaded it (" + path + ")");
    return true;
  };

  // ---- Reopening the document the tab had open ----
  //
  // Loads the document the tab was showing, read again from where it lived (a path through the
  // server, or the handles). true if the page reopened it.
  // Caution: **Never restore a location without its document** — on the sample, the first save
  // would write it over a file it never came from, unguarded. **Where it cannot be read again the
  // record is dropped**, it says why, and the page stays on the sample, in no file.
  const reopen = async (was) => {
    if (!was) return false;
    const lost = (what, why) => {
      forgetWhere();
      deny(what + ", open before the page was read again, could not be opened again (" + why + ")");
      app.focus();
      return false;
    };
    if (was.path.length > 0) {
      if (!ui.localReady || !(await ui.localReady)) {
        return lost(was.path, "the local server is not there");
      }
      // **Ask whether it exists first** (`openPlace`'s refusal names no path, and the field is
      // empty here).
      if (!(await ui.localStat(was.path))) return lost(was.path, "it is no longer there");
      if (await openPlace(was.path)) return true;
      forgetWhere();
      return false;   // `localRead` has already reported what happened
    }
    if (!was.bodyAt) {
      forgetWhere();
      return false;
    }
    let body = null;
    try {
      body = await was.bodyAt.getFile();
    } catch (e) {
      // **A restarted browser has dropped the read permission**, which only a click can ask for
      // again, so the file is opened again from "Open".
      return lost(was.bodyAt.name, e && e.name === "NotFoundError" ? "it is no longer there"
        : "the browser wants it chosen again: open it from \"Open\"");
    }
    // The history comes along where it can still be read, and is dropped where it cannot.
    let past = null;
    try {
      past = was.pastAt ? await was.pastAt.getFile() : null;
    } catch (_) {
      past = null;
    }
    return takeChosen(past ? [body, past] : [body], { body: was.bodyAt,
      past: past ? was.pastAt : null });
  };

  // Opens the document named in the URL. Where none is named, it reopens the document the tab had
  // open (`reopen` above).
  // **A link wins over the tab's record.**
  const openFromUrl = () => {
    const path = wanted("doc");
    if (!path) return recalled.then(reopen);
    // **Set read-only before loading**, or editing is possible during the load
    // (`port/web/state.kspls`'s `new_edit`).
    if (wanted("read") !== "") {
      app.setReadOnly(true);
      ui.dressRead();
    }
    return openDoc(path);
  };

  Object.assign(kf, { download, openDoc, openFromPath, openFromUrl, openPlace, renamed,
    saveToFile, takeDoc, why });
}
