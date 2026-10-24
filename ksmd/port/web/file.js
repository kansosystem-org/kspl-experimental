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
  let doc = { path: "", base: null, clean: "", id: newId() };
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
  function showFileItems() {
    for (const el of fileMenu.querySelectorAll('[data-cmd^="file-"], .file-only')) el.hidden = false;
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

  // ---- Opening ----

  // Resolves a typed path by the workspace's rules: the path, or null after saying why not.
  function resolve(written, doing) {
    const r = json("ksmd_web_resolve", ks.put(written));
    if (r && !r.ok) ks.say(`${written} cannot be ${doing}: ${r.why}.`);
    return r && r.ok ? r.path : null;
  }

  async function open(written) {
    const path = resolve(written, "opened");
    if (path === null) return;
    const got = await local.read(path);
    if (got.status !== 200) {
      ks.say(got.status === 404 ? `No file stands at ${path}. To start a document there, type ` +
        "it, then choose File, Save as." : `${path} cannot be opened. ${got.why}`);
      return;
    }
    const left = doc;
    const aside = await holdAside();
    if (await take(path, got.bytes) && aside && left.path !== path) {
      ks.say(`Opened ${path}. Your unsaved edits to ${left.path || "the new document"} are held ` +
        "aside as a draft. Open it again to bring them back.");
    }
  }

  // Lays a file's bytes in as the open document; false where the editor refuses them.
  async function take(path, bytes) {
    ks.call("ksmd_web_place", ks.put(path));
    const max = limit();
    const said = api.load(bytes.length > max + 1 ? bytes.subarray(0, max + 1) : bytes);
    // A stopped editor says so, and nothing may say the file opened.
    if (ks.stopped) return false;
    if (!said.ok) {
      ks.call("ksmd_web_place", ks.put(doc.path));
      await fill();
      ks.say(`${path} cannot be opened: ${said.line ? `line ${said.line}, column ` +
        `${said.column}: ` : ""}${said.why}.`);
      return false;
    }
    doc = { path, base: await local.digest(bytes), clean: model(), id: newId() };
    named.textContent = path;
    document.title = `${path} - ksmd`;
    history.replaceState(null, "", `${location.pathname}?doc=${encodeURIComponent(path)}`);
    quiet();
    showState(false);
    await fill();
    if (ks.stopped) return false;
    ks.say(`Opened ${path}.`);
    await offerDraft();
    return true;
  }

  // ---- What includes and images show ----

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

  // Saves the open document to its own file. A document that has no file yet is placed with Save
  // As (`saveOrPlace`), so Save never asks for a path itself.
  async function save() {
    const text = api.source();
    if (doc.base === null) {
      await place(doc.path, text, false);
      return;
    }
    const now = await local.read(doc.path);
    if (now.status === 404) {
      askGone();
      return;
    }
    if (now.status !== 200) {
      ks.say(`${doc.path} could not be saved. ${now.why}`);
      return;
    }
    const d = await local.digest(now.bytes);
    if (d !== doc.base) {
      askChanged(now.bytes, d);
      return;
    }
    await write(text, d);
  }

  // Saves to a new place. A file is written only where none stands, so no other file is replaced,
  // unless the person chose to replace it: then only the bytes that stood there when asked.
  async function place(path, text, replace) {
    const bytes = ks.enc.encode(text);
    let expected = null;
    if (replace) {
      const now = await local.read(path);
      if (now.status === 200) expected = await local.digest(now.bytes);
      else if (now.status !== 404) {
        ks.say(`${path} could not be saved. ${now.why}`);
        return;
      }
    }
    const got = await local.write(path, bytes, expected);
    if (got.status === 409) {
      ks.say(replace ? `${path} changed while you chose it. Nothing was written. Choose again.` :
        `${path} already exists. Open it, or type another path for this document.`);
    } else if (got.status !== 200) {
      ks.say(`${path} could not be saved. ${got.why}`);
    } else {
      await saved(path, bytes, text);
    }
  }

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
      if (path === null) return;
      if (path === doc.path && doc.base !== null) await save();
      else await place(path, api.source(), got.replace);
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

  // Writes the document's own file, if it still holds what `expected` names (null: no file).
  async function write(text, expected) {
    const bytes = ks.enc.encode(text);
    const got = await local.write(doc.path, bytes, expected);
    if (got.status === 409) {
      const now = await local.read(doc.path);
      if (now.status === 200) askChanged(now.bytes, await local.digest(now.bytes));
      else askGone();
      return;
    }
    if (got.status !== 200) {
      ks.say(`${doc.path} could not be saved. ${got.why}`);
      return;
    }
    await saved(doc.path, bytes, text);
  }

  async function saved(path, bytes, text) {
    const left = doc;
    doc = { path, base: await local.digest(bytes), clean: text, id: left.id };
    await keep.drop(root, left.path, left.id);
    if (left.path !== path) {
      named.textContent = path;
      document.title = `${path} - ksmd`;
      history.replaceState(null, "", `${location.pathname}?doc=${encodeURIComponent(path)}`);
      ks.call("ksmd_web_place", ks.put(path));
      await fill();
    }
    quiet();
    showState(model() !== doc.clean);
    ks.say(`Saved ${path}.`);
  }

  function askChanged(bytes, d) {
    ask(`${doc.path} was changed on disk after this page opened it. Your edits are not saved.`, [
      ["Replace the file with this version", () => write(api.source(), d)],
      ["Load the file's version; keep mine as a draft", async () => {
        await holdAside();
        await take(doc.path, bytes);
      }],
      ["Keep editing", quiet],
    ]);
  }

  function askGone() {
    ask(`${doc.path} is no longer on disk. Your edits are not saved.`, [
      ["Save it there again", () => write(api.source(), null)],
      ["Keep editing", quiet],
    ]);
  }

  // When the page is looked at again: a file changed on disk shows at once, or asks where this
  // page holds edits; includes and images are fetched again.
  async function check() {
    if (doc.path !== "" && doc.base !== null) {
      const now = await local.read(doc.path);
      if (now.status === 404 && model() !== doc.clean) {
        askGone();
      } else if (now.status === 200) {
        const d = await local.digest(now.bytes);
        if (d !== doc.base) {
          if (model() !== doc.clean) {
            askChanged(now.bytes, d);
          } else {
            await take(doc.path, now.bytes);
            ks.say(`${doc.path} was changed on disk. The page shows it as it is now.`);
            return;
          }
        }
      }
    }
    await refresh();
  }

  // ---- Drafts ----

  let timer = null;
  let first = 0;
  // Holds the unsaved source aside, or lets the draft go where nothing is unsaved. True where a
  // draft is held.
  async function holdAside() {
    clearTimeout(timer);
    timer = null;
    if (root === "") return false;
    const mine = doc;
    const text = model();
    if (text === mine.clean) {
      showState(false);
      await keep.drop(root, mine.path, mine.id);
      return false;
    }
    const held = await keep.put({ root, path: mine.path, id: mine.id, text, base: mine.base });
    if (doc === mine) showState(true, held !== null);
    return held !== null;
  }

  async function offerDraft() {
    const found = await keep.of(root, doc.path, doc.id);
    if (found.length === 0) return;
    const d = found[0];
    const more = found.length > 1 ? ` ${found.length - 1} older drafts are held too.` : "";
    ask(`Unsaved edits to ${d.path || "a new document"} from ${new Date(d.at).toLocaleString()} ` +
      `are held aside as a draft.${more}`, [
      ["Bring them back", async () => {
        if (!api.load(d.text).ok) return;
        doc = { ...doc, base: d.base };
        await holdAside();
        await keep.drop(d.root, d.path, d.id);
        quiet();
        await fill();
        ks.say(`The draft of ${d.path || "the new document"} is back. It is not saved yet.`);
      }],
      ["Discard them", async () => {
        await keep.drop(d.root, d.path, d.id);
        quiet();
        await offerDraft();
      }],
    ]);
  }

  // ---- Start ----

  ks.rendered.push(showImages);
  ks.changed.push(() => {
    showState(true);
    const now = Date.now();
    if (timer === null) first = now;
    clearTimeout(timer);
    // A pause of a second holds a draft, and so does typing that has gone on five seconds.
    timer = setTimeout(() => one(holdAside), now - first >= 5000 ? 0 : 1000);
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
    doc = { path: "", base: null, clean: model(), id: newId() };
    ks.call("ksmd_web_place", ks.put(""));
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
    window.addEventListener("pagehide", () => one(holdAside));
    const linked = new URLSearchParams(location.search).get("doc");
    await one(() => (linked ? open(linked) : offerDraft()));
  })();
}
