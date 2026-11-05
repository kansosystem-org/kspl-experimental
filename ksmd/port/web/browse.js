// ksmd page: the dialog that chooses where a document is saved, or which one opens. It shows one
// folder of the workspace at a time, as the local server lists it (`/api/list`), and the path
// from the workspace root down to it; a folder opens on a press.
// It shows only ksmd documents, as a word processor's Save As shows only its own kind of file. For
// Insert, Functions it shows KSPL files instead. Insert, Include and Insert, Functions each take a
// file chosen, or a new name typed.
// Caution: **The listing is a help, never the check.** A name typed here goes through the same
// resolving and the same refusals as one typed in the file bar.
"use strict";

function ksmdBrowse(local) {
  const box = document.getElementById("browse");
  const title = box.querySelector(".browse-title");
  const where = box.querySelector(".browse-where");
  const list = box.querySelector(".browse-list");
  const note = box.querySelector(".browse-note");
  const name = box.querySelector(".browse-name");
  const ok = box.querySelector('[data-browse="ok"]');
  let mode = "save";
  // The kind of file the mode shows: KSPL files for a functions clause, else documents.
  const ext = () => (mode === "functions" ? ".kspl" : ".ksmd");
  let folder = "";
  let files = [];
  // The file a second press of Save replaces: { path, digest } of its bytes when it was chosen.
  let replacing = null;
  let done = null;
  // The newest listing asked for. **A choice waits for it**: the name shows at once, and pressed
  // before the folder shows, it would land in the folder shown before. A listing asked for
  // earlier that arrives after it is let go, so the folder shown is the one last pressed.
  let shown = Promise.resolve(true);
  let asked = 0;

  const join = (a, b) => (a === "" ? b : `${a}/${b}`);
  const parentOf = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");

  function item(text, kind, act, twice) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = `browse-${kind}`;
    b.textContent = text;
    b.addEventListener("click", act);
    if (twice) b.addEventListener("dblclick", twice);
    li.appendChild(b);
    list.appendChild(li);
  }

  // Shows the path down to the folder: each step opens that folder.
  function showWhere() {
    where.textContent = "";
    const steps = folder === "" ? [] : folder.split("/");
    const step = (label, to) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => go(to));
      where.appendChild(b);
    };
    step("Workspace", "");
    steps.forEach((s, i) => {
      where.appendChild(document.createTextNode(" / "));
      step(s, steps.slice(0, i + 1).join("/"));
    });
  }

  // Shows a folder: true once it shows, false where it cannot be listed, and null where a newer
  // listing was asked for meanwhile.
  function go(to) {
    asked += 1;
    shown = listing(to, asked);
    return shown;
  }

  async function listing(to, mine) {
    const got = await local.list(to);
    if (mine !== asked) return null;
    if (got.status !== 200) {
      note.textContent = `${to || "The workspace"} cannot be shown. ${got.status === 404 ? "No folder stands there." : got.why}`;
      return false;
    }
    folder = to;
    replacing = null;
    files = got.files.filter((f) => f.endsWith(ext()));
    showWhere();
    list.textContent = "";
    if (folder !== "") item("..", "folder", () => go(parentOf(folder)));
    for (const f of got.folders) item(f, "folder", () => go(join(folder, f)));
    for (const f of files) {
      item(f, "file", () => {
        name.value = f;
        replacing = null;
        note.textContent = "";
      }, () => {
        name.value = f;
        choose();
      });
    }
    const what = mode === "functions" ? "functions file" : "document";
    const starts = mode === "functions" || mode === "include";
    note.textContent = got.more ? `This folder holds more names than can be shown. Type the name ` +
      `of the ${what}.` : folder === "" && got.folders.length + files.length === 0 ?
      (starts ? `The workspace holds no ${mode === "functions" ? "KSPL files" : "documents"} yet. ` +
        "Type a name to start one." : "The workspace holds no documents yet.") : "";
    return true;
  }

  // Takes the typed name in the folder shown: { path, expected }, or nothing where it is not yet
  // decided. `expected` is null, or the digest of a file chosen to be replaced. **The file is read
  // when the person chooses it**, so the second press replaces only the bytes that stood then.
  async function choose() {
    // A folder pressed while the wait goes on asks for a newer listing, which is waited for too.
    for (let waited = null; waited !== shown;) {
      waited = shown;
      await waited;
    }
    let n = name.value.trim();
    if (n === "") {
      note.textContent = mode === "functions" ? "Type a name for the functions file, such as " +
        "mine.kspl." : "Type a name for the document, such as notes.ksmd.";
      name.focus();
      return;
    }
    if (mode !== "open" && !n.slice(n.lastIndexOf("/") + 1).includes(".")) n += ext();
    const path = join(folder, n);
    const there = files.includes(n);
    // A file to include or a functions file is used as it stands, or started where none stands.
    if (mode === "functions" || mode === "include") {
      if (!n.endsWith(ext())) {
        note.textContent = `A ${mode === "functions" ? "functions file" : "document"}'s name ends in ${ext()}.`;
        return;
      }
      finish({ path, expected: null, exists: there });
      return;
    }
    if (mode === "open" || !there) {
      finish({ path, expected: null });
      return;
    }
    if (replacing && replacing.path === path) {
      finish({ path, expected: replacing.digest });
      return;
    }
    const now = await local.read(path);
    if (now.status === 404) {
      finish({ path, expected: null });
      return;
    }
    if (now.status !== 200) {
      note.textContent = `${n} cannot be replaced. ${now.why}`;
      return;
    }
    replacing = { path, digest: await local.digest(now.bytes) };
    note.textContent = `${n} already exists. Press Save again to replace it.`;
  }

  function finish(answer) {
    box.close();
    const d = done;
    done = null;
    if (d) d(answer);
  }

  box.querySelector('[data-browse="cancel"]').addEventListener("click", () => finish(null));
  box.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish(null);
  });
  ok.addEventListener("click", choose);
  name.addEventListener("input", () => {
    replacing = null;
  });
  name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      choose();
    }
  });

  return {
    // Opens the dialog on the folder of `start`: { path, expected } once chosen, or null. In the
    // modes "functions" and "include", `exists` says whether the file chosen stands already.
    async pick(how, start) {
      mode = how;
      title.textContent = { save: "Save as", open: "Open", functions: "Functions", include: "Include" }[how];
      ok.textContent = { save: "Save", open: "Open", functions: "Insert", include: "Insert" }[how];
      name.value = how === "open" ? "" : start.slice(start.lastIndexOf("/") + 1);
      note.textContent = "";
      list.textContent = "";
      const answer = new Promise((give) => {
        done = give;
      });
      box.showModal();
      name.focus();
      // A folder that has gone since the document was opened shows the workspace instead.
      shown = go(parentOf(start)).then((ok) => (ok === false ? go("") : ok));
      await shown;
      return answer;
    },
  };
}
