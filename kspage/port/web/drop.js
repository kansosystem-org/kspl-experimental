// ==========================================
// kspage's page — dropping a file onto the screen to open it.
// Caution: **Once something is dropped, always prevent the default** — otherwise the browser
// navigates to that file and the document being edited vanishes with the page. **The whole window
// prevents it** (on the canvas alone, a drop on a panel or the ribbon escapes to the browser). The
// functions that take the file are borrowed ([`file.js`](file.js)'s `takeChosen`, and
// [`command.js`](command.js)'s `takeImage` for an image); a separate reader here would make
// dropping alone behave differently (Principle 4). Where a handle is available, Ctrl+S writes back
// to the dropped file; otherwise a save downloads a copy (`file.js`'s `canBind`).
// ==========================================
function kspageDrop(ui) {
  const canvas = ui.canvas;

  // The drop-target look, **only while something is dragged** (otherwise "where can I drop it" is
  // unclear); the class is on the root, the color is in `page.css`.
  let over = 0;
  const dress = (on) => {
    if (on) {
      document.documentElement.dataset.drop = "1";
    } else {
      delete document.documentElement.dataset.drop;
    }
  };
  // **Count enters and leaves** (a leave fires at each child crossed; a boolean would flicker).
  const enter = () => {
    over += 1;
    dress(true);
  };
  const leave = () => {
    over = over > 0 ? over - 1 : 0;
    if (over === 0) dress(false);
  };

  // Whether a file is being dragged.
  // Caution: **Do not take over a text drag** (dropping text into a field to paste would stop).
  const hasFiles = (e) => {
    const kinds = e.dataTransfer ? e.dataTransfer.types : null;
    if (!kinds) return false;
    return Array.from(kinds).indexOf("Files") >= 0;
  };

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    enter();
  });
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    // Caution: **Prevent this one too** — `dragover`'s default decides "cannot drop".
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  });
  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    leave();
  });

  // What was dropped is sorted: **an image is inserted, anything else is opened as a document**
  // (either mistake is a common complaint), **decided here only**. An image that declares no type
  // goes to opening, where the core checks the contents and refuses — never silently wrong.
  const isPicture = (f) => typeof f.type === "string" && f.type.indexOf("image/") === 0;

  window.addEventListener("drop", async (e) => {
    if (!hasFiles(e)) return;
    // Caution: **Prevent it before any await** (the code below waits; afterwards is too late).
    e.preventDefault();
    over = 0;
    dress(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length <= 0) return;
    // Caution: **Ask for the handles in the same turn** (the dropped list empties after an await).
    const asking = [];
    const items = e.dataTransfer.items;
    if (items) {
      for (const one of Array.from(items)) {
        asking.push(one.kind === "file" && typeof one.getAsFileSystemHandle === "function"
          ? one.getAsFileSystemHandle()
          : Promise.resolve(null));
      }
    }
    // An image goes where it is dropped; **only a drop on the body moves the cursor** (no jumps).
    const pictures = files.filter(isPicture);
    if (pictures.length > 0) {
      // Caution: **Place it the same way as a click** — mapping a click to the document is only
      // `keys.js`'s; copied here, the zoom and offset correction goes stale on one side.
      if (canvas.contains(e.target) || e.target === canvas) {
        canvas.dispatchEvent(new PointerEvent("pointerdown",
          { clientX: e.clientX, clientY: e.clientY, bubbles: true }));
      }
      for (const one of pictures) {
        await ui.takeImage(one);
      }
    }
    const papers = files.filter((f) => !isPicture(f));
    if (papers.length <= 0) return;
    const got = await Promise.all(asking);
    // Caution: **Match the handles by the dropped order** (without the images it is off by one).
    const handleOf = (f) => {
      const at = files.indexOf(f);
      const one = at >= 0 && at < got.length ? got[at] : null;
      return one && one.kind === "file" ? one : null;
    };
    const past = papers.find((f) => f.name.endsWith(".ksdb")) || null;
    const body = papers.find((f) => f !== past) || null;
    // Caution: **With no handle, do not bind again** (it would only drop the one already held).
    const bound = { body: handleOf(body), past: past ? handleOf(past) : null };
    ui.takeChosen(papers, bound.body || bound.past ? bound : null);
  });
}
