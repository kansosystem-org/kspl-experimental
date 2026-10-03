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
  const paper = (text) => new File([text], "dropped.json", { type: "application/json" });
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
    } finally {
      free();
    }
  })();
}
