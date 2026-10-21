// ==========================================
// kspage's page — saving and loading, **on the same `kf` as `file.js`**.
//
// **This file only writes text out and reads text in.** The name and the
// path belong to [`file.js`](file.js), reached through `kf`.
// **The document's state lives in `kf.doc`**; a save holds that record across its waits.
// Caution: **Go through `kf.remember` once it is saved**, or it reads "saved, yet changed" (the
// path and the text change as a pair). The boundary follows [`DESIGN-architecture.md`](../../docs/DESIGN-architecture.md)'s
// "The boundary between the core and the browser".
// ==========================================
function kspageSave(kf) {
  const { app, bodyExt, bodyText, deny, forgetWhere, keepName, kindOf,
    layIn, nameOf, NOT_UTF8, pathBox, pathOf, planOpen, recalled, remember, say,
    takeName, textOf, ui, whyNotRead } = kf;
  //
  // Caution: **Before writing, check whether that path has changed**, or it silently overwrites
  // another window's changes. **Only a save back to the document's own path asks this**
  // (`saveLocal` guards any other).
  const changedOutside = async (path, mine) => {
    if (mine.path !== path) {
      return false;
    }
    // Caution: **Ask whether it exists first** (reading a missing file shows a refusal; asking is
    // silent). Where it could not be asked, refuse as for a failed read below.
    const there = await ui.localStat(path);
    if (there === null) {
      return true;
    }
    if (!there) {
      return false;
    }
    const bytes = await ui.localRead(path);
    // Caution: **Where it could not be checked, fall back to refusing**, not overwriting (the read
    // function has said why).
    if (bytes === null) {
      return true;
    }
    // A text no longer UTF-8 is not the text read (`textOf` gives null).
    return textOf(bytes) !== mine.read;
  };
  // Where the field is.
  // **Say where it is in words**, quoting the label as the screen shows it (the field is in a
  // collapsed menu). **Do not open the menu and move focus.** The click closes it again, and a
  // flag to keep it open would have nothing to clear it after Ctrl+S.
  const pathIsAt = "\"Path for saving and opening\" under \"File\"";

  // Caution: **Do not ignore a typed name.** **Clear the path**, so the next save writes under the
  // new name (`saveLocal`). Kept, it would write the same file whatever the name.
  const renamed = () => {
    keepName();
    if (!pathOf()) return;
    pathBox.value = "";
    say("The name has changed, so the next save writes under it in the served folder, unless a path"
      + " is entered into " + pathIsAt);
  };
  // The text of the reason for a refusal.
  // Caution: **Do not mistake it for a cancel** (told apart by name below).
  const why = (e) => String((e && e.message) || e);
  // The refusal names the changed path and a way to keep both versions.
  const deniedOutside = (where) => {
    deny(where + " has been changed outside since it was opened. Save it under a different name,"
      + " then open both to bring them together");
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
  // Whether the document the save was made for is still the one shown.
  // Caution: **A save waits on the write, and the view can change meanwhile** (a failed drop
  // restores the old place; one that opens stays). So the path and the text are stored after the
  // write, and on that same document only. Otherwise another document gets a file it never came
  // from.
  const stillHere = (mine) => kf.doc === mine;
  // The note added when the shown document is not the one written (its next save asks again).
  const MOVED = ". Another document came into view while it was written, and that one does not "
    + "take this file";
  // Where a save goes: the path field, or with it empty **`kssrv`'s folder by the field's name**.
  // Asking for what is already known only adds a press. The path written goes into the field.
  // Caution: **Do not silently overwrite a file this document did not come from.** The default
  // name `kspage` can clash, and a refused open can leave its path behind. The first press
  // refuses, naming the file, and a second press on the same document and path replaces it.
  let armed = "";
  const saveLocal = async (path, first, body, mine) => {
    // Caution: **Do not write the extension here** — only `file.js`'s `bodyExt` decides it, or a
    // text document would be offered kspage's extension.
    const target = path || first;
    let expected = mine.read;
    if (target !== mine.path) {
      const there = await ui.localStat(target);
      if (there === null) {
        app.focus();
        return;   // `localStat` has said why it could not tell
      }
      expected = there ? undefined : null;
      const asked = mine.id + "\n" + target;
      if (there && armed !== asked) {
        armed = asked;
        deny(target + " is already there. Press Save again to replace it, or enter another path"
          + " into " + pathIsAt);
        app.focus();
        return;
      }
    }
    armed = "";
    await saveToPath(target, body, mine, expected);
  };

  // Writes back to the local path.
  const saveToPath = async (path, body, mine, expected) => {
    // Caution: **Where it changed outside, do not silently overwrite** (another window's write
    // would be lost); how it compares is named.
    if (await changedOutside(path, mine)) {
      deniedOutside(path);
      app.focus();
      return;
    }
    const stopped = await ui.localWrite(path, body, expected);
    if (stopped === "conflict") {
      deniedOutside(path);
      app.focus();
      return;
    }
    if (stopped) {
      deny("Could not write to the file on the local server (" + stopped + ")");
      app.focus();
      return;
    }
    // Caution: **Store the written text, and set the path, on the document the save was for**
    // (`stillHere` above). Otherwise the next save wrongly says "it changed outside".
    const here = stillHere(mine);
    if (here) {
      pathBox.value = path;
      remember(path, body);
    }
    say("Saved (" + path + ")" + (here ? "" : MOVED));
    app.focus();
  };

  const saveNow = async () => {
    // **The document the save is for** (`stillHere` above) and its target, taken before any await.
    const mine = kf.doc;
    const body = bodyText();
    await saveLocal(pathOf(), nameOf(bodyExt()), body, mine);
  };
  // Caution: **One save at a time.** A second press while one is writing (a double click, Ctrl+S
  // pressed twice) compares against a text the first has not recorded yet. It then refuses as
  // "changed outside". So the save under way answers it.
  let saving = null;
  const saveToFile = () => {
    if (saving === null) saving = saveNow().finally(() => { saving = null; });
    return saving;
  };
  document.getElementById("save").addEventListener("click", saveToFile);

  // Refuses an open, naming the path. Caution: **Put the field back to the document's own path.**
  // The field is where a save goes. Left holding the refused path, the next save would write
  // this document over the file just refused.
  const refused = (path, reason) => {
    deny(reason + " (" + path + ")");
    pathBox.value = kf.doc.path;
    app.focus();
    return false;
  };

  // Loads the read text as this page's document, setting `out` (`planOpen`'s) aside. If unreadable
  // it shows the reason, leaves the document as it was, and returns false.
  // **Both ways of opening (the path field, and text) come here**, so neither acts alone. **The
  // name decides the text's format**, which is also the format written back.
  // **The read text is kept**, under a new identity, by `layIn` for the outside-change check. **No
  // earlier destination is kept**.
  const takeDoc = (out, path, text) => {
    const why = layIn(out, kindOf(path), text, path, { path: path });
    if (why !== "") return refused(path, whyNotRead(why, text));
    // The name comes from the path's last part (the next downloaded copy gets the same name).
    takeName({ name: path.split("/").pop() });
    say("Loaded it (" + path + ")" + kf.aside);
    app.focus();
    return true;
  };

  // Opens a path. **The path is passed in** (the field, or the tab's record); true is returned where
  // the document is the one shown.
  const openPlace = async (path) => {
    const bytes = await ui.localRead(path);
    if (!bytes) {
      app.focus();   // `localRead` has already reported what happened
      return false;
    }
    const text = textOf(bytes);
    if (text === null) return refused(path, whyNotRead(NOT_UTF8, ""));
    return takeDoc(planOpen(), path, text);
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
  // The server API reads it with the token. **Keep the query** (unlike `local.js`'s
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
  // **The caller reads the URL** (`openFromUrl` below); this takes one text and checks it too. A
  // fresh page with a `?doc=` URL would put every other section on another document.
  const openDoc = async (path) => {
    if (!isSafePath(path)) {
      deny("What can be opened is a relative path as seen from the same place as this page, and "
        + "nothing else (" + path + ")");
      return false;
    }
    // **Take the draft just before loading** (what a slow read let be typed is in it).
    return openPlace(path);
  };

  // ---- Reopening the document the tab had open ----
  //
  // Loads the document the tab was showing, read again from where it lived (a path through the
  // server). true if the page reopened it.
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
      // **Ask whether it exists first** (`openPlace`'s refusal names no path, and the field is
      // empty here).
      const there = await ui.localStat(was.path);
      if (there === null) return lost(was.path, "the server could not say whether it is there");
      if (!there) return lost(was.path, "it is no longer there");
      if (await openPlace(was.path)) return true;
      forgetWhere();
      return false;   // `localRead` has already reported what happened
    }
    forgetWhere();
    return false;
  };

  // Opens the document named in the URL. Where none is named, it reopens the document the tab had
  // open (`reopen` above).
  // **A link wins over the tab's record.**
  const openFromUrl = () => {
    const path = wanted("doc");
    if (!path) return recalled.then(reopen);
    // **Set read-only before loading**, or editing is possible during the load
    // (`port/web/state.kspl`'s `new_edit`).
    if (wanted("read") !== "") {
      app.setReadOnly(true);
      ui.dressRead();
    }
    return openDoc(path);
  };

  Object.assign(kf, { download, openDoc, openFromPath, openFromUrl, openPlace, renamed,
    saveToFile, takeDoc, why });
}
