// ksmd page: the file lifecycle, where the local server serves the page. It opens a document by
// its path in the workspace, shows each include and image in place, saves the canonical source
// back to the document's own file, notices a change made outside the page, and holds drafts.
// Caution: **A save reads the file again first, and the server checks it once more.** If the file
// no longer holds what this page last read or wrote there, nothing is written and the page asks.
// **Run every step through `one`**: a save and a check that interleave would compare against a
// file the other has just changed.
"use strict";

function ksmdFiles(ks, api) {
  const fileMenu = document.querySelector(".menubar .files");
  const named = document.querySelector(".menubar .doc-name");
  const state = document.querySelector(".menubar .state");
  const notice = document.getElementById("notice");
  const local = ksmdLocal();
  const keep = ksmdKeep();
  const browse = ksmdBrowse(local);
  const page = document.documentElement;
  // The open document: its path, the digest of the bytes last read or written there (null where
  // no file holds it yet), its canonical source then, and this opening's id, which keys its draft.
  // **After the start, change it only through `become`**: the editor, the menu bar and the address
  // follow it there.
  let doc = { path: "", base: null, clean: "", id: newId() };
  // What the page last saw on disk at the open document's path: { path, size, at, sure, digest }.
  // `size` and `at` were asked before the bytes that `digest` names were read. `sure` means they
  // were asked in a later second than `at`, so any later write changes `at`.
  let seen = null;
  // Whether a draft holds the edits as they are now: false from an edit until a draft is written.
  let heldNow = true;
  const MAX_IMAGE = 8 * 1024 * 1024; // the local server's ceiling on a write
  const MAX_NAMES = 999; // the names `addImage` tries before it gives up
  let root = "";
  let busy = Promise.resolve();
  let pending = 0;
  let choosing = false; // whether the dialog is open
  let sources = new Map(); // each included source's path, and what the server answered for it
  let images = new Map(); // each image's path, and its bytes
  const shown = new Map(); // each image's path, and what its clause shows: { url } or { why }

  // Open and Save stand in the File menu only where the local server opens files; Print always does.
  // The quick access bar shows them where the menu does.
  function showFileItems() {
    for (const el of fileMenu.querySelectorAll('[data-cmd^="file-"], .file-only')) el.hidden = false;
    ks.quick.render();
  }

  function newId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => n.toString(16)).join("");
  }
  const json = (name, ...args) => {
    const n = ks.call(name, ...args);
    return ks.stopped ? null : JSON.parse(ks.out(n));
  };
  const model = () => ks.out(ks.call("ksmd_web_source"));
  const limit = () => ks.call("ksmd_web_source_limit");
  // Whether the page holds edits its file lacks: in the document, or typed in a cell still open.
  const unsaved = () => model() !== doc.clean || ks.table.pending() !== null;

  // Runs steps one at a time; `data-files` is "busy" until the last has ended.
  function one(step) {
    pending += 1;
    page.dataset.files = "busy";
    busy = busy.then(step).catch((e) => ks.say(`Something went wrong: ${e.message || e}`))
      .finally(() => {
        pending -= 1;
        if (pending === 0) page.dataset.files = "ready";
      });
    return busy;
  }

  function showState(unsaved, held = false) {
    state.textContent = !unsaved ? "" : held ? "Not saved. A draft is held in this browser." :
      "Not saved.";
  }

  // A notice that does not stop editing: what happened, and buttons for each way on.
  function ask(text, choices) {
    notice.hidden = false;
    notice.querySelector(".notice-text").textContent = text;
    const box = notice.querySelector(".notice-choices");
    box.textContent = "";
    for (const [label, act] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => one(act));
      box.appendChild(b);
    }
  }
  const quiet = () => {
    notice.hidden = true;
  };

  // Shows which document is open: in the menu bar, the window's title and the address.
  function show() {
    named.textContent = doc.path;
    document.title = doc.path ? `${doc.path} - ksmd` : "ksmd";
    history.replaceState(null, "", location.pathname +
      (doc.path ? `?doc=${encodeURIComponent(doc.path)}` : ""));
  }

  // Hands the editor the path it reads each include and image from. It forgets what was fetched
  // before, so `fill` fetches each file again.
  let placed = null;
  function placeEditor(path) {
    ks.call("ksmd_web_place", ks.put(path));
    placed = path;
  }

  // Makes `next` the open document, in the editor, the menu bar and the address. The editor keeps
  // what it fetched where it holds that path already.
  function become(next) {
    if (next.path !== placed) placeEditor(next.path);
    doc = next;
    show();
  }

  // Reads a document's file: what `local.read` answers, with `digest` naming the bytes and
  // `seen` for the record above. The size is asked first, so bytes newer than it count as a
  // change at the next ask, and none is missed. `polled` is { size, at, asked } asked already.
  async function readDoc(path, polled = null) {
    const asked = polled ? polled.asked : Date.now();
    const info = polled || await local.stat(path);
    const got = await local.read(path);
    got.digest = got.status === 200 ? await local.digest(got.bytes) : null;
    const known = info !== null && (got.status === 200 || got.status === 404);
    got.seen = !known ? null : { path, size: info.size, at: info.at,
      sure: Math.floor(asked / 1000) > info.at, digest: got.digest };
    return got;
  }

  // ---- Opening ----

  // Resolves a typed path by the workspace's rules: the path, or null after saying why not.
  function resolve(written, doing) {
    const r = json("ksmd_web_resolve", ks.put(written));
    if (r && !r.ok) ks.say(`${written} cannot be ${doing}: ${r.why}.`);
    return r && r.ok ? r.path : null;
  }

  // Opens a document in place of the open one: true once it is open. Unsaved edits go aside as a
  // draft; where none can be held, the page asks first, unless the person chose to `discard` them.
  // A path that does not open leaves the address, which names only the open document.
  async function open(written, discard = false) {
    const path = resolve(written, "opened");
    if (path === null) {
      show();
      return false;
    }
    const got = await readDoc(path);
    if (got.status !== 200) {
      ks.say(got.status === 404 ? `No file stands at ${path}. To start a document there, type ` +
        "it, then choose File, Save as." : `${path} cannot be opened. ${got.why}`);
      show();
      return false;
    }
    const left = doc;
    const aside = await holdAside();
    if (!discard && !aside && unsaved()) {
      askLeave(path);
      return false;
    }
    if (!await take(path, got.bytes)) {
      show();
      return false;
    }
    seen = got.seen;
    if (!aside || left.path === path) return true;
    // A new document has no path to open it by: the page offers its draft where it opens on none.
    ks.say(`Opened ${path}. Your unsaved edits to ${left.path || "the new document"} are held ` +
      "aside as a draft. " + (left.path ? "Open it again to bring them back." :
      "To bring them back, open this page's address without \"?doc=\" and the path after it."));
    return true;
  }

  // Where no draft could be held, opening another document would lose the edits: the page asks.
  function askLeave(path) {
    const name = doc.path || "the new document";
    const choices = [];
    if (doc.base !== null) {
      choices.push([`Save ${name}, then open ${path}`, async () => {
        if (await save()) await open(path);
      }]);
    }
    choices.push([`Discard my edits and open ${path}`, () => open(path, true)], ["Cancel", quiet]);
    ask(`Your edits to ${name} are not saved, and this browser could not hold a draft of them.` +
      (doc.base === null ? " To keep them, choose Cancel, then File, Save as." : ""), choices);
  }

  // Lays a file's bytes in as the open document; false where the editor refuses them, after
  // saying why and then `after`. The editor takes the path before the bytes, so the view it shows
  // at once reads includes from the new folder; a refusal gives it the old path back. Text in a
  // cell still open that the editor refuses opens nothing (`api.load`), and the view stays as it
  // is, so the cell stays open with it.
  async function take(path, bytes, after = "") {
    const base = await local.digest(bytes);
    const cellTaken = ks.table.take("stay");
    if (cellTaken) placeEditor(path);
    const max = limit();
    const said = api.load(bytes.length > max + 1 ? bytes.subarray(0, max + 1) : bytes);
    // A stopped editor says so, and nothing may say the file opened.
    if (ks.stopped) return false;
    if (!said.ok) {
      if (cellTaken) {
        placeEditor(doc.path);
        await fill();
      }
      ks.say(`${path} cannot be opened: ${said.line ? `line ${said.line}, column ` +
        `${said.column}: ` : ""}${said.why}.${after}`);
      return false;
    }
    become({ path, base, clean: model(), id: newId() });
    forget();
    quiet();
    showState(false);
    await fill();
    if (ks.stopped) return false;
    ks.say(`Opened ${path}.`);
    await offerDraft();
    return true;
  }

  // ---- What includes and images show ----

  // Lets go what was fetched for the document before: the files' bytes and the images' URLs.
  function forget() {
    for (const s of shown.values()) if (s.url) URL.revokeObjectURL(s.url);
    shown.clear();
    sources = new Map();
    images = new Map();
  }

  // Fetches what the view lacks, a round per level of includes, then shows the whole document.
  async function fill() {
    for (let round = 0; round < 20; round++) {
      const wanted = json("ksmd_web_wanted");
      if (!wanted || wanted.length === 0) break;
      for (const w of wanted) await fetchOne(w.p, w.i === 1);
    }
    ks.act("ksmd_web_render");
  }

  // Asks the server for one file, and hands its answer to the editor. A refused path comes back
  // as 403: the server refuses a link along it. A folder comes back as 404, so it is asked again.
  async function fetchOne(path, image) {
    const got = await local.read(path);
    let status = 0;
    let bytes = new Uint8Array(0);
    if (got.status === 200) {
      if (image) images.set(path, got.bytes);
      else bytes = got.bytes.subarray(0, Math.min(got.bytes.length, limit() + 1));
    } else if (got.status === 404) {
      status = (await local.stands(path)) ? 4 : 1;
    } else {
      status = got.status === 403 ? 2 : 3;
    }
    if (!image) sources.set(path, status === 0 ? await local.digest(got.bytes) : `${status}`);
    const name = ks.enc.encode(path);
    ks.putBytes(name, bytes);
    ks.call("ksmd_web_hold", name.length, bytes.length, status);
  }

  // Fetches every include and image again, and shows the document again where one changed.
  async function refresh() {
    const before = sources;
    const pictures = images;
    sources = new Map();
    images = new Map();
    ks.call("ksmd_web_forget");
    for (let round = 0; round < 20; round++) {
      const wanted = json("ksmd_web_wanted");
      if (!wanted || wanted.length === 0) break;
      for (const w of wanted) await fetchOne(w.p, w.i === 1);
    }
    let changed = before.size !== sources.size;
    for (const [path, d] of sources) changed = changed || before.get(path) !== d;
    for (const [path, bytes] of images) {
      const old = pictures.get(path);
      if (old && old.length === bytes.length && old.every((b, i) => b === bytes[i])) continue;
      const s = shown.get(path);
      if (s && s.url) URL.revokeObjectURL(s.url);
      shown.delete(path);
      changed = true;
    }
    if (changed || pictures.size !== images.size) ks.act("ksmd_web_render");
  }

  // Reads an image's size from its header, a window at a time, before the browser decodes it.
  function measure(path) {
    const bytes = images.get(path);
    if (!bytes) return { why: "this image was not fetched. Open the document again" };
    let at = 0;
    for (let step = 0; step < 4096; step++) {
      const end = Math.min(bytes.length, at + 65536);
      const r = json("ksmd_web_image", at, bytes.length, ks.putBytes(bytes.subarray(at, end)));
      if (!r) return { why: "the editor stopped" };
      if (r.more !== undefined) {
        at = r.more;
        continue;
      }
      if (r.why) return { why: r.why };
      return { url: URL.createObjectURL(new Blob([bytes], { type: r.t })) };
    }
    return { why: "this image's header is too long to read. Save the image again" };
  }

  // ---- An image pasted or dropped ----

  // Writes the image beside the document under the first free name, `<name>-image-<n>.png`, and
  // puts its clause at the caret. The write names no file, so a taken name is never written over.
  async function addImage(file) {
    const ext = { "image/png": "png", "image/jpeg": "jpg" }[file.type];
    if (!ext) return ks.say("Only a PNG or a JPEG image can go in a document.");
    if (doc.path === "") return ks.say("Save the document first, so the image has a folder to go in.");
    if (file.size > MAX_IMAGE) return ks.say("The image is larger than 8 MiB, which the local server takes.");
    const alt = window.prompt("Describe the image for someone who cannot see it. Leave this empty if " +
      "it only decorates.", "");
    if (alt === null) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const slash = doc.path.lastIndexOf("/");
    const stem = doc.path.slice(slash + 1).replace(/\.ksmd$/, "");
    for (let n = 1; n <= MAX_NAMES; n++) {
      const name = `${stem}-image-${n}.${ext}`;
      const got = await local.write(doc.path.slice(0, slash + 1) + name, bytes, null);
      if (got.status === 409) continue;
      if (got.status !== 200) return ks.say(`The image was not saved. ${got.why}`);
      await fetchOne(doc.path.slice(0, slash + 1) + name, true);
      ks.sync();
      const s = ks.enc.encode(name);
      return ks.act("ksmd_web_insert_image", s.length, ks.putBytes(s, ks.enc.encode(alt)) - s.length);
    }
    return ks.say(`The image was not saved: ${MAX_NAMES} images of this document stand there already.`);
  }

  function showImages() {
    for (const fig of ks.root.querySelectorAll("figure[data-to]:not([data-shown])")) {
      fig.dataset.shown = "1";
      if (fig.dataset.why !== undefined) continue;
      const path = fig.dataset.to;
      if (!shown.has(path)) shown.set(path, measure(path));
      const s = shown.get(path);
      const place = fig.querySelector(".image");
      if (s.why) {
        place.textContent = `This image cannot be shown: ${s.why}.`;
        place.classList.add("problem");
        continue;
      }
      const img = document.createElement("img");
      img.src = s.url;
      img.alt = place.getAttribute("aria-label") || "";
      place.replaceWith(img);
    }
  }

  // ---- Saving ----

  // The source a save writes, or null where text in a cell still open cannot go in. The text then
  // stays in its cell and in the draft, and nothing is written.
  function toSave() {
    const text = api.source();
    if (ks.table.pending() === null) return text;
    ks.say("Nothing was saved: the text in the open cell cannot go in. Change it, or press Esc to " +
      "drop it.");
    return null;
  }

  // Saves the open document to its own file: true once it is written. A document that has no
  // file yet is placed with Save As (`saveOrPlace`), so Save never asks for a path itself.
  async function save() {
    const text = toSave();
    if (text === null) return false;
    if (doc.base === null) return place(doc.path, text, null);
    const now = await readDoc(doc.path);
    if (now.status !== 200) {
      if (now.status === 404) askGone();
      else ks.say(`${doc.path} could not be saved. ${now.why}`);
      seen = now.seen || seen;
      return false;
    }
    if (now.digest !== doc.base) {
      seen = now.seen;
      await askChanged(now.bytes, now.digest);
      return false;
    }
    return write(text, now.digest);
  }

  // Saves to a new place: true once it is written. A file is written only where none stands, so
  // no other file is replaced, unless the person chose to replace it. Then `expected` names the
  // bytes that stood there when it was chosen, and only those are replaced.
  async function place(path, text, expected) {
    const bytes = ks.enc.encode(text);
    const got = await local.write(path, bytes, expected);
    if (got.status === 409) {
      ks.say(expected !== null ? `${path} changed after you chose it. Nothing was written. ` +
        "Choose again." : `${path} already exists. Open it, or type another path for this document.`);
      return false;
    }
    if (got.status !== 200) {
      ks.say(`${path} could not be saved. ${got.why}`);
      return false;
    }
    await saved(path, bytes, text);
    return true;
  }

  const folderOf = (path) => path.slice(0, path.lastIndexOf("/") + 1);

  // Save As, and Open with the dialog. **The dialog is open outside `one`**, so a check or a draft
  // waiting behind it still runs; only what is chosen runs as a step.
  async function saveAs() {
    if (choosing) return;
    choosing = true;
    const got = await browse.pick("save", doc.path || "notes.ksmd");
    choosing = false;
    if (got === null) return;
    await one(async () => {
      const path = resolve(got.path, "saved");
      if (path === null || toSave() === null) return;
      if (path === doc.path && doc.base !== null) {
        await save();
        return;
      }
      // An include's or an image's path is read from the document's folder, so saved in another
      // folder, each path is written again to name the same file. One undo takes that back.
      const from = folderOf(doc.path).replace(/\/$/, "");
      const to = folderOf(path).replace(/\/$/, "");
      let moved = false;
      if (from !== to) {
        const f = ks.enc.encode(from);
        const r = ks.act("ksmd_web_move_paths", f.length, ks.putBytes(f, ks.enc.encode(to)) - f.length);
        moved = !!r && r.changed === 1;
      }
      // A save that does not happen leaves the paths as they were, for the document's own folder.
      if (!(await place(path, api.source(), got.expected)) && moved) ks.act("ksmd_web_undo");
    });
  }

  // Save: to the document's own file, or with Save As where the document has no path yet.
  function saveOrPlace() {
    if (doc.path === "") saveAs();
    else one(save);
  }

  async function openChosen() {
    if (choosing) return;
    choosing = true;
    const got = await browse.pick("open", doc.path);
    choosing = false;
    if (got !== null) await one(() => open(got.path));
  }

  // Writes `text` to the document's own file, if it still holds what `expected` names (null: no
  // file). True once it is written; a null `text` writes nothing.
  async function write(text, expected) {
    if (text === null) return false;
    const bytes = ks.enc.encode(text);
    const got = await local.write(doc.path, bytes, expected);
    if (got.status === 409) {
      const now = await readDoc(doc.path);
      seen = now.seen || seen;
      if (now.status === 200) await askChanged(now.bytes, now.digest);
      else askGone();
      return false;
    }
    if (got.status !== 200) {
      ks.say(`${doc.path} could not be saved. ${got.why}`);
      return false;
    }
    await saved(doc.path, bytes, text);
    return true;
  }

  // What is asked after a write can already hold another program's write, so it is not `sure`:
  // the next ask reads the bytes once.
  async function saved(path, bytes, text) {
    const left = doc;
    const base = await local.digest(bytes);
    const info = await local.stat(path);
    seen = info && { path, size: info.size, at: info.at, sure: false, digest: base };
    become({ path, base, clean: text, id: left.id });
    await keep.drop(root, left.path, left.id);
    if (left.path !== path) await fill();
    quiet();
    showState(unsaved());
    ks.say(`Saved ${path}.`);
  }

  // Where no draft could be held, the choice to load the file's version says that it discards
  // the page's edits. Where it says it keeps them, it loads nothing unless a draft holds them.
  async function askChanged(bytes, d) {
    const kept = await holdAside();
    ask(`${doc.path} was changed on disk after this page opened it. Your edits are not saved.`, [
      ["Replace the file with this version", () => write(toSave(), d)],
      [kept ? "Load the file's version; keep mine as a draft" : "Load the file's version; discard " +
        "mine", async () => {
        if (!await holdAside() && kept && unsaved()) {
          ks.say("Nothing was loaded: your edits could not be held as a draft. Save them first.");
          return;
        }
        await take(doc.path, bytes);
      }],
      ["Keep editing", quiet],
    ]);
  }

  function askGone() {
    ask(`${doc.path} is no longer on disk. Your edits are not saved.`, [
      ["Save it there again", () => write(toSave(), null)],
      ["Keep editing", quiet],
    ]);
  }

  // When the page is looked at again, or `watch` saw its file change: a file changed on disk shows
  // at once, or asks where this page holds edits; includes and images are fetched again.
  // `polled` is what `watch` asked already.
  async function check(polled = null) {
    if (doc.path !== "" && doc.base !== null) {
      const now = await readDoc(doc.path, polled);
      seen = now.seen || seen;
      if (now.status === 404 && unsaved()) {
        askGone();
      } else if (now.status === 200 && now.digest !== doc.base) {
        if (unsaved()) {
          await askChanged(now.bytes, now.digest);
        } else if (await take(doc.path, now.bytes, " It was changed on disk. The page shows " +
          "the version it opened.")) {
          ks.say(`${doc.path} was changed on disk. The page shows it as it is now.`);
          return;
        }
      }
    }
    await refresh();
  }

  // While the page is looked at, asks the server every two seconds whether the open document's
  // file changed, and runs `check` where it did. Each change is checked once, so a notice the
  // person closed does not come back for it.
  const WATCH_MS = 2000;
  const same = (a, b) => a.size === b.size && a.at === b.at;
  async function watch() {
    if (doc.path === "" || doc.base === null) return;
    const asked = Date.now();
    const info = await local.stat(doc.path);
    if (info === null) return;
    const polled = { ...info, asked };
    const known = seen !== null && seen.path === doc.path && same(seen, info) ? seen : null;
    if (known && known.sure) return;
    // Not `sure`: a later write of the same size in the same second leaves both alike, so the
    // bytes decide.
    if (known) {
      const now = await readDoc(doc.path, polled);
      if (now.status === 200 && now.digest === known.digest) {
        seen = now.seen;
        return;
      }
    }
    await check(polled);
  }

  // ---- Drafts ----

  let timer = null;
  let first = 0;
  // Holds the unsaved source aside, or lets the draft go where nothing is unsaved. True where a
  // draft is held. **A cell still open is held as it is**: taking it would close it under the
  // person's typing, and a value the model refuses would be lost.
  async function holdAside() {
    clearTimeout(timer);
    timer = null;
    if (root === "") return false;
    const mine = doc;
    const text = model();
    const cell = ks.table.pending();
    heldNow = true;
    if (text === mine.clean && cell === null) {
      showState(false);
      await keep.drop(root, mine.path, mine.id);
      return false;
    }
    const held = await keep.put({ root, path: mine.path, id: mine.id, text, cell, base: mine.base });
    // An edit made while the draft was written is not in it, and has set `heldNow` false.
    heldNow = heldNow && held !== null;
    if (doc === mine) showState(true, held !== null);
    return held !== null;
  }

  // Brings a draft back in place of the open document. Edits made since it opened go aside first,
  // as a draft of their own, so neither version is lost.
  async function bringBack(d) {
    const since = unsaved();
    if (since && !await holdAside()) {
      ks.say("The draft was not brought back: your edits since the document opened cannot be held " +
        "aside. Save them first.");
      return;
    }
    const said = api.load(d.text);
    if (!said.ok) {
      if (!ks.stopped) ks.say(`The draft was not brought back: ${said.why}.`);
      return;
    }
    become({ ...doc, base: d.base, id: newId() });
    quiet();
    await fill();
    // The text of a cell that was open goes in as the cell's value, as taking the cell does. A
    // value the editor refuses stays in its open cell, so the new draft holds it too.
    const c = d.cell;
    const r = c ? ks.act("ksmd_web_set_cell", c.block, c.row, c.column, ks.put(c.text)) : null;
    if (r && !r.ok) ks.table.openWith(c.block, c.row, c.column, c.text, c.text.length, c.text.length);
    // The old draft goes only once a new one holds what came back.
    if (!await holdAside() && unsaved()) {
      ks.say("The draft is back, but this browser could not hold it again, so the old draft stays. " +
        "Save the document.");
      return;
    }
    await keep.drop(d.root, d.path, d.id);
    ks.say(`The draft of ${d.path || "the new document"} is back. It is not saved yet.` +
      (r && !r.ok ? ` The text typed in a cell stays open in its cell: ${r.why}` : "") + (since ?
      " Your edits made since the document opened are held aside as a draft." : ""));
  }

  async function offerDraft() {
    const found = await keep.of(root, doc.path, doc.id);
    if (found.length === 0) return;
    const d = found[0];
    const more = found.length > 1 ? ` ${found.length - 1} older drafts are held too.` : "";
    ask(`Unsaved edits to ${d.path || "a new document"} from ${new Date(d.at).toLocaleString()} ` +
      `are held aside as a draft.${more}`, [
      ["Bring them back", () => bringBack(d)],
      ["Discard them", async () => {
        await keep.drop(d.root, d.path, d.id);
        quiet();
        await offerDraft();
      }],
    ]);
  }

  // ---- Start ----

  ks.rendered.push(showImages);
  // An edit, in the document or in a cell still open, is unsaved until a save.
  const edited = () => {
    heldNow = false;
    showState(true);
    const now = Date.now();
    if (timer === null) first = now;
    clearTimeout(timer);
    // A pause of a second holds a draft, and so does typing that has gone on five seconds.
    timer = setTimeout(() => one(holdAside), now - first >= 5000 ? 0 : 1000);
  };
  ks.changed.push(edited);
  ks.root.addEventListener("input", (e) => {
    if (e.target.classList && e.target.classList.contains("cell-input")) edited();
  });
  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".include-open");
    if (!b) return;
    // The included file opens in a tab of its own: its own history, its own save, its own draft.
    window.open(`${location.pathname}?doc=${encodeURIComponent(b.dataset.to)}` +
      `#t=${encodeURIComponent(local.token)}`, "_blank", "noopener");
  });

  return (async () => {
    const s = await local.status();
    if (!s.root) {
      if (s.why) {
        for (const b of fileMenu.querySelectorAll('[data-cmd^="file-"]')) b.disabled = true;
        showFileItems();
        ks.say(s.why);
      }
      page.dataset.files = "none";
      return;
    }
    root = s.root;
    showFileItems();
    local.hold();
    keep.prune();
    // The new document is open, and the address keeps the one to open until it opens.
    placeEditor("");
    doc = { path: "", base: null, clean: model(), id: newId() };
    ks.addImage = (file) => one(() => addImage(file));
    ks.fileCommand = (name) => {
      if (name === "file-open") openChosen();
      else if (name === "file-save-as") saveAs();
      else saveOrPlace();
      return null;
    };
    document.addEventListener("keydown", (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        if (e.shiftKey) saveAs();
        else saveOrPlace();
      } else if (k === "o" && !e.shiftKey) {
        e.preventDefault();
        openChosen();
      }
    }, true);
    // Focus and visibility often come together: a check still waiting to run answers both.
    let waiting = false;
    const lookAgain = () => {
      if (waiting) return;
      waiting = true;
      one(() => {
        waiting = false;
        return check();
      });
    };
    window.addEventListener("focus", lookAgain);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) one(holdAside);
      else lookAgain();
    });
    // A hidden page asks nothing, and the check above answers when it is shown again. No ask
    // starts while one is still out.
    let watching = false;
    setInterval(() => {
      if (document.visibilityState !== "visible" || watching || waiting) return;
      watching = true;
      one(() => watch().finally(() => {
        watching = false;
      }));
    }, WATCH_MS);
    window.addEventListener("pagehide", () => one(holdAside));
    // A draft written as the page goes may not land, so leaving asks while no draft holds the edits.
    window.addEventListener("beforeunload", (e) => {
      if (heldNow || !unsaved()) return;
      e.preventDefault();
      e.returnValue = "";
    });
    const linked = new URLSearchParams(location.search).get("doc");
    // A linked document that does not open leaves the new document, whose draft is then offered.
    await one(async () => {
      if (!linked || !await open(linked)) await offerDraft();
    });
  })();
}
