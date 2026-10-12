// "New", starting from a blank sheet. **What the page carries over after the press** (the name,
// where it saves, the handle, what was typed) lives on the DOM's side, so the wasm alone lets "it
// overwrites the earlier file with a blank sheet" and "what was typed is gone" walk past.
// Caution: **Put the document back at the end**: the blank sheet takes its place in the window.

function kspageProbeFresh(ks) {
  const { check, app, notAPath, typeIn } = ks;
  const nameBox = document.getElementById("doc-name");
  const pathBox = document.getElementById("local-path");
  const note = document.getElementById("note");
  // **It must be one character** — one input event does not necessarily put two in. **Not the keep
  // section's mark**: that section finds its draft in the store by its mark.
  const MARK = "§";

  // **Stand up what must not be carried over before pressing** (pressed while empty, "it vanished"
  // and "it was empty to begin with" cannot be told apart).
  const wasName = nameBox.value;
  const wasPath = pathBox.value;
  const wasSaved = app.save();
  ks.pressAt(8);
  typeIn(MARK);
  const typed = app.save();
  check(typed !== wasSaved, "the document has something typed to lose before the press");
  const wasKept = app.keepCount();
  nameBox.value = "before";
  pathBox.value = notAPath + "/before.kspage";

  // Caution: **Press it as a person does** (menu, then button); called directly, unwired passes.
  const menu = ks.openMenu("doc-new");
  document.getElementById("doc-new").click();
  menu.open = false;

  check(app.text() === "", `what opened is a blank sheet (${app.text()})`);
  // **What was typed is not lost**: it is set aside, and the notice says where.
  check(app.keepCount() === wasKept + 1,
    `what was typed is set aside as a draft (${app.keepCount()})`);
  check(note.textContent.indexOf("kept as a draft") >= 0,
    `the notice says it is kept as a draft (${note.textContent})`);
  // Caution: **Do not carry where it writes back over** (a save would overwrite the earlier file).
  check(pathBox.value === "", `it does not carry where it saves over (${pathBox.value})`);
  check(nameBox.value !== "before", `it does not carry the name over either (${nameBox.value})`);

  // **It must hold a style table** (without one, tables and slides stack as plain paragraphs).
  const styles = app.styleNames();
  check(styles.indexOf("table") >= 0,
    `a blank sheet holds a style table too (${styles.length})`);

  // **One empty paragraph must be there** (the cursor stands in it); typed by an `input` event.
  ks.pressAt(8);
  typeIn("a");
  check(app.text() === "a", `a blank sheet can be typed on as it is (${app.text()})`);

  // **What was set aside comes back whole**, as a person brings it back ("Bring the draft back").
  document.getElementById("keep-take").click();
  check(app.save() === typed, "the draft brought back is the document as it was typed");
  check(app.keepCount() === wasKept + 1,
    `the blank sheet typed on is set aside in its turn (${app.keepCount()})`);

  // Tidying up: the document as it was before the section.
  // Caution: **Do not throw the drafts away** ("Throw the drafts away" takes every one): the keep
  // section is still looking for its own in the store.
  app.load(wasSaved);
  check(app.save() === wasSaved, "the earlier document is back as it was");
  nameBox.value = wasName;
  pathBox.value = wasPath;
}

// Dropping a file onto the screen and opening it. **What matters most is that the default is
// stopped** — unstopped, the browser moves to that file and the document being edited vanishes
// along with the page.
// Caution: **Do not swap the document being looked at**, nor look at the status bar or counts: this
// section waits (a drop reads asynchronously), and shared state has it read another section's
// answer as its own. What is looked at is **a text only its own drop brings** (its own picture).
// A good document opening is not looked at here (it would swap the document); a drop goes straight
// to `file.js`'s `takeChosen`, so this holds "it does not move" and "which entry point gets it".

function kspageProbeDrag(ks) {
  const { check, app } = ks;
  const canvas = ks.canvas;
  const here = location.href;
  const free = ks.hold();

  // It builds one drop, **added from `items`** (`files` is read-only).
  const carry = (...files) => {
    const box = new DataTransfer();
    for (const one of files) box.items.add(one);
    return box;
  };
  const paper = (text) => new File([text], "dropped.kspage", { type: "application/json" });
  // Caution: **A real picture** (a 1x1 red GIF; the core asks for the measures, so a fake is
  // refused), **differing from every other section's** — the same picture's text would read
  // another section's insertion as its own answer, **a check that cannot fall**.
  const DOT = "R0lGODlhAQABAPAAAAAA/wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  const dot = () => {
    const raw = atob(DOT);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return new File([bytes], "dot.gif", { type: "image/gif" });
  };
  const fire = (name, box, onto) => {
    const ev = new DragEvent(name,
      { dataTransfer: box, bubbles: true, cancelable: true, clientX: 30, clientY: 60 });
    (onto || window).dispatchEvent(ev);
    return ev;
  };
  const until = async (ok) => {
    for (let waited = 0; waited < 1200; waited += 25) {
      if (ok()) return true;
      await new Promise((go) => setTimeout(go, 25));
    }
    return false;
  };

  // **The mark must come out while it is being dragged** (else where to drop is unclear).
  check(fire("dragover", carry(paper("{}"))).defaultPrevented,
    "dragging a file makes it a place that can be dropped on");
  fire("dragenter", carry(paper("{}")));
  check(document.documentElement.dataset.drop === "1",
    "the mark comes out while it is being dragged");

  // Caution: **Do not take a text's drag away** (it could not be dropped into a field and pasted).
  const words = new DataTransfer();
  words.setData("text/plain", "elsewhere");
  check(!fire("dragover", words).defaultPrevented, "a text's drag is not taken over");

  (async function () {
    try {
      // **Always stop the default on a drop** (the header's reason); unreadable, nothing moves.
      const put = fire("drop", carry(paper("{ broken")));
      check(put.defaultPrevented, "a drop does not move to another file");
      check(document.documentElement.dataset.drop === undefined,
        "the mark goes on a drop");
      check(location.href === here, "a drop does not change where it is");

      // Caution: **Insert a picture rather than opening it** (sent to the opening side, one picture
      // makes the earlier document vanish); this section's own picture's text is hunted for.
      ks.pressAt(8);
      fire("drop", carry(dot()), canvas);
      check(await until(() => app.save().indexOf(DOT) >= 0),
        "a dropped picture goes into the document rather than being opened");
      // Caution: **Do not undo what was put in**: the undo record is shared too, so a waiting
      // section's undo puts another's rewrite back. The picture only adds, so it may stay.

      // **A file that cannot be read once dropped is refused out loud** (removed or locked after
      // it was chosen); a rejection no one catches reaches only the console. Every text the status
      // note takes is watched, so another section's later notice cannot hide this one's.
      const told = [];
      const note = document.getElementById("note");
      const watch = new MutationObserver(() => told.push(note.textContent));
      watch.observe(note, { childList: true, characterData: true, subtree: true });
      let loose = false;
      const onLoose = (e) => {
        if (String(e.reason && e.reason.message).indexOf("drag-unreadable") >= 0) loose = true;
      };
      window.addEventListener("unhandledrejection", onLoose);
      const gone = new File(["{}"], "gone.kspage", { type: "application/json" });
      gone.text = () => Promise.reject(new Error("drag-unreadable"));
      fire("drop", carry(gone));
      const refused = await until(() => told.some((t) => t.indexOf("drag-unreadable") >= 0));
      watch.disconnect();
      window.removeEventListener("unhandledrejection", onLoose);
      check(refused && !loose, "a dropped file that cannot be read is refused, with its reason");
    } finally {
      free();
    }
  })();
}

// Pictures: drawn when put in, and an outside one not fetched unasked.

function kspageProbeOutside(ks) {
  const { check, report, app, canvas, ime } = ks;

  // 29. It puts a picture in — is it drawn on the canvas?
  //
  // **This can be seen nowhere else**: reading a picture and drawing it are the page's side (it
  // breaks as "it went in and nothing comes out"). A `data:` picture is used, as a headless browser
  // has no network.
  const RED_DOT = "data:image/gif;base64," +
    "R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  document.getElementById("image-src").value = RED_DOT;
  document.getElementById("image-w").value = "40";
  document.getElementById("image-h").value = "20";
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  document.getElementById("put-image").click();
  check(app.save().indexOf("\"image\": \"data:image/gif") >= 0,
    "the button is wired to inserting a picture");
  check(app.save().indexOf("\"image_w\": 40") >= 0, "the size goes into the document too");
  // **Until it is loaded there is a frame alone**; read, it is drawn afresh, so it waits that far.
  const redInCanvas = () => {
    const g = canvas.getContext("2d");
    const p = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i] > 200 && p[i + 1] < 80 && p[i + 2] < 80) n += 1;
    }
    return n;
  };

  // It waits for the picture to be drawn, then puts the marks out.
  // Caution: **Do not look once and give up** (the load is asynchronous); the looks are capped, so
  // a picture that never draws still ends the section.
  let looked = 0;
  const watch = setInterval(function () {
    looked += 1;
    const red = redInCanvas();
    if (red > 0 || looked > 40) {
      clearInterval(watch);
      check(red > 0, "the picture put in comes out on the canvas (" + red + " pixels)");
      report();
    }
  }, 50);

  // 30b. A picture on an outside server is not fetched on the beat of opening.
  //
  // **This can be seen nowhere else**: fetching is the page's side.
  // Caution: **It breaks in the shape of leaking silently** — fetched, that the document was
  // opened, and where, both go to the other side with nothing on the screen (a tracking pixel).
  // With no network, "could it be read" tells them apart, by **the count stopped**.
  document.getElementById("image-src").value = "https://example.invalid/pixel.png";
  document.getElementById("image-w").value = "10";
  document.getElementById("image-h").value = "10";
  document.getElementById("put-image").click();
  const heldPics = ks.hold();
  setTimeout(function () {
    app.resize(canvas.clientWidth || 800);
    check(app.picturesHeld() > 0,
      "an outside picture is not fetched by default (" + app.picturesHeld() + ")");
    // Permit it and it is fetched.
    // Note: **Not remembering it** is that side's settlement
    // (`port/web/side.js`).
    const box = document.getElementById("over-pics");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    app.resize(canvas.clientWidth || 800);
    check(app.picturesHeld() === 0, "permitted, it is fetched");
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    heldPics();
  }, 300);
}
