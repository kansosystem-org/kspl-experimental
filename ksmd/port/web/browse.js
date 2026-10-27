// ksmd page: the dialog that chooses where a document is saved, or which one opens. It shows one
// folder of the workspace at a time, as the local server lists it (`/api/list`), and the path
// from the workspace root down to it; a folder opens on a press.
// It shows only ksmd documents, as a word processor's Save As shows only its own kind of file.
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
  const EXT = ".ksmd";
  let mode = "save";
  let folder = "";
  let files = [];
  // The file a second press of Save replaces: { path, digest } of its bytes when it was chosen.
  let replacing = null;
  let done = null;

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

  async function go(to) {
    const got = await local.list(to);
    if (got.status !== 200) {
      note.textContent = `${to || "The workspace"} cannot be shown. ${got.status === 404 ? "No folder stands there." : got.why}`;
      return false;
    }
    folder = to;
    replacing = null;
    files = got.files.filter((f) => f.endsWith(EXT));
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
    note.textContent = got.more ? "This folder holds more names than can be shown. Type the name " +
      "of the document." : folder === "" && got.folders.length + files.length === 0 ?
      "The workspace holds no documents yet." : "";
    return true;
  }

  // Takes the typed name in the folder shown: { path, expected }, or nothing where it is not yet
  // decided. `expected` is null, or the digest of a file chosen to be replaced. **The file is read
  // when the person chooses it**, so the second press replaces only the bytes that stood then.
  async function choose() {
    let n = name.value.trim();
    if (n === "") {
      note.textContent = "Type a name for the document, such as notes.ksmd.";
      name.focus();
      return;
    }
    if (mode === "save" && !n.slice(n.lastIndexOf("/") + 1).includes(".")) n += EXT;
    const path = join(folder, n);
    const there = files.includes(n);
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
    // Opens the dialog on the folder of `start`: { path, expected } once chosen, or null.
    async pick(how, start) {
      mode = how;
      title.textContent = how === "save" ? "Save as" : "Open";
      ok.textContent = how === "save" ? "Save" : "Open";
      name.value = how === "save" ? start.slice(start.lastIndexOf("/") + 1) : "";
      note.textContent = "";
      list.textContent = "";
      const answer = new Promise((give) => {
        done = give;
      });
      box.showModal();
      name.focus();
      // A folder that has gone since the document was opened shows the workspace instead.
      if (!(await go(parentOf(start)))) await go("");
      return answer;
    },
  };
}
