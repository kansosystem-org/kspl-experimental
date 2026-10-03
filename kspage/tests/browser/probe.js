// On top of a real browser, it confirms kspage's entry points for input: this side lines the
// sections up and turns them. **It looks at what can be seen nowhere else, and nothing more** (the
// focus, whether an element counts as visible, how often one keystroke goes in); a headless
// browser has no input method, so only "can composition begin here" is asked of it.
// It opens the built-up page with each section's text pasted behind it (`kspage/Makefile`'s
// `KSPAGE_PROBE`) and reads the marks: the `file://` side by `--dump-dom`, the served side by what
// `handBack` below writes back. **Fall over while the text is read and not one mark comes out**
// (the DOM still does, so suspect a misspelling first).
// Caution: **Each section is to make its own**: relying on what an earlier one left, a settlement
// acting and an earlier section differing cannot be told apart; **the tools come in one bag**.

(function () {
  const lines = [];
  let failed = 0;

  // The other way the page speaks: one line at a time, through the browser's standard error.
  // Caution: **The `file://` side hands nothing back** and its DOM comes out at the end alone, so a
  // cut round leaves not one line; standard error is its one channel (`kspage/Makefile` cuts the
  // marks out of it). **Open every line with the name** (the gate tells the page's trace from the
  // browser's by it alone) and **flatten the newlines** (a split stack loses the name).
  function speak(line) {
    console.log("kspage-probe: " + line.split("\n").join(" | "));
  }

  // Where a mark is laid down: **both ways of speaking are fed from here** (else they drift apart).
  function mark(line) {
    lines.push(line);
    speak(line);
  }

  // What it waits on now, naming where the marks stop on a cut round; **not stacked onto the
  // marks** (a wait swaps many times; the last will do), **silent when let go** (`waiting("")`).
  let waitingFor = "";
  function waiting(what) {
    waitingFor = what;
    if (what.length > 0) {
      speak(".... waiting: " + what);
    }
    handBack();
  }

  // The head of one line. **Building the line's shape is this one place** (`make test-conventions`
  // holds the table of where a line is built); a failing line in another shape does not reach
  // `mk/ci.mk`'s summary (it picks up `^FAIL `).
  function head(mark, tag, what) {
    return mark + " " + (tag.length > 0 ? tag + ": " : "") + what;
  }

  function check(ok, what, tag) {
    mark(head(ok ? "pass" : "FAIL", tag || "", what));
    if (!ok) {
      failed += 1;
    }
    handBack();
  }

  // It hands a set with the tab tied over, per section.
  // Caution: **Do not remember one "section running now"** — a section can put its end off with
  // `hold()`, so a later mark would carry another's tab. **An underlay, not a copy**
  // (`Object.create`), so an entry point changed later reaches the section.
  function forPart(ks, name) {
    const mine = Object.create(ks);
    mine.check = (ok, what) => check(ok, what, name);
    return mine;
  }

  // The count of sections carrying asynchronous work.
  // Caution: **Do not put the marks out while a section still waits** (a check yet to arrive looks
  // like "all passed"); the last to finish puts them out, so always let a held section go.
  let holds = 0;
  let wanted = false;
  function hold() {
    holds += 1;
    return function () {
      holds -= 1;
      if (holds <= 0 && wanted) {
        report();
      }
    };
  }

  // A wait that looks until it comes out, and a safety net that says it could not be waited out.
  // Caution: **Do not write the length of the wait per section** — a hand-written net comes out
  // shorter than the real wait, names no bad wait, and fails rounds that were in time; this one
  // place holds the length, and the sections write no milliseconds.
  const lookMs = 25;
  const looks = 40;
  // Until one wait gives up. **It gives up on the one after the `looks`th, so it is +1.**
  const waitMs = lookMs * (looks + 1);

  // The count of waits in flight. **The safety net looks at this** (`netFor` below).
  let waits = 0;

  // Caution: **Do not look once and give up** (the load and the redraw are asynchronous), and **go
  // on to `then` even having given up** — a broken chain drops the checks behind it, unseen.
  function waitFor(ready, what, then) {
    waits += 1;
    let looked = 0;
    const watch = setInterval(function () {
      looked += 1;
      if (!ready() && looked <= looks) {
        return;
      }
      clearInterval(watch);
      check(ready(), what);
      // Caution: **Drop the count only after `then` begins the next wait** (early, the net reads
      // "no longer waiting" mid-chain); in a `finally`, so the net names what is left if it threw.
      try {
        then();
      } finally {
        waits -= 1;
      }
    }, lookMs);
  }

  // **Do not cut it by a length** (a net from the chain's steps falls short once a step is added):
  // **while a wait is in flight it waits again**, and it **says what is left by name**.
  // Caution: **Where nothing is left, say nothing** (a passing round's mark would land behind the
  // answer). Only a `waitFor` section uses it: a wait on an event is not on the count, so it reads
  // 0 once armed (`outside.js` is that shape and keeps its length by hand).
  function netFor(what, left, free) {
    const look = () => {
      if (left().length === 0) {
        return;
      }
      if (waits > 0) {
        setTimeout(look, waitMs);
        return;
      }
      check(false, what + " (" + left().join(" ") + " was left)");
      free();
    };
    setTimeout(look, waitMs);
  }

  // If the server is there, it returns the marks as a file too: drawing the DOM out waits for the
  // browser to settle, so a round waiting on real time is cut before the marks are written, and the
  // served gate waits for `BROWSER-RESULT` here instead (`kspage/Makefile`'s `test-served`).
  // Caution: **Use the token this page holds** (taken from the same place as `local.js`), **return
  // them one at a time and never overlapping** (PUTs land in no settled order), ending at a line
  // end. The waiting line carries the page's clock (real when served, virtual when dumped).
  const began = Date.now();
  function handBackText() {
    if (waitingFor === "") return lines.join("\n") + "\n";
    return lines.join("\n") + "\n.... waiting: " + waitingFor + " (clock " + (Date.now() - began)
      + " ms)\n";
  }

  let flying = false;
  let grew = false;
  // The local server's address, as one place: **the token, the address and the header restate
  // `../../../docs/SPEC-local-server.md`** for `handBack` and every section asking for a file
  // (written per caller, one lags when the header moves, reading as a real refusal). The token is
  // empty from `file://` (no server), so callers look at `token` first.
  function localHere() {
    let token = "";
    try {
      token = sessionStorage.getItem("kspage.local.token") || "";
    } catch (_) {
      token = "";
    }
    return {
      token: token,
      at: (path) => "/api/file?path=" + encodeURIComponent(path),
      head: { Authorization: "Bearer " + token },
    };
  }

  function handBack() {
    const server = localHere();
    if (server.token.length === 0) return;
    if (flying) {
      grew = true;
      return;
    }
    flying = true;
    const landed = () => {
      flying = false;
      if (grew) {
        grew = false;
        handBack();
      }
    };
    fetch(localHere().at("kspage-probe.txt"),
      { method: "PUT", headers: localHere().head, body: handBackText() })
      .then(landed, landed);
  }

  let reported = false;
  function report() {
    if (reported) return;
    if (holds > 0) {
      wanted = true;
      return;
    }
    reported = true;
    const pre = document.createElement("pre");
    pre.id = "kspage-probe";
    mark(failed === 0 ? "BROWSER-RESULT: ALL PASS" : "BROWSER-RESULT: " + failed + " FAILED");
    waitingFor = "";
    pre.textContent = lines.join("\n");
    document.body.appendChild(pre);
    handBack();
  }

  // Stopped by an exception, the marks do not come out, so it is caught and carried onto the marks
  // with the stack (the one place that says which entry point a fall inside the wasm came in by).
  window.addEventListener("error", function (e) {
    const trail = (e.error && e.error.stack) || "";
    check(false, "the checks stopped on an exception (" + (e.message || e.error) + ")\n" + trail);
    report();
  });

  // The window on the opened side: **the opening side alone turns this check** (the same text runs
  // in both, and a second run writes the same files on the server); it answers only when asked.
  if (window.opener) {
    // The documents handed over from the opening side, **counted here, not in the page** (a field
    // for the checks alone would stay in the product); the text alone cannot say "not handed over".
    let handedDocs = 0;
    window.addEventListener("message", function (ev) {
      if (!ev.data) return;
      if (ev.data.kspage === "doc") handedDocs += 1;
      if (!window.kspage) return;
      if (ev.data.probe === "text?") {
        ev.source.postMessage({ probe: "text", body: window.kspage.text() }, "*");
      }
      // Caution: **Keep it apart from the key asking a twin for its text** (a section waiting on a
      // twin would read another window's `probe: "text"` answer as its own).
      if (ev.data.probe === "solo?") {
        ev.source.postMessage({
          probe: "solo", body: window.kspage.text(), handed: handedDocs,
        }, "*");
      }
    });
    // It may declare itself at once: the opening side listens before letting the window open.
    window.opener.postMessage({ probe: "here" }, "*");
    return;
  }

  // It builds the tools handed over per section.
  // Caution: **Build where it presses from the canvas's position now** — a remembered position goes
  // stale as the window follows the cursor, and later presses land elsewhere.
  function tools(app) {
    const canvas = document.getElementById("page");
    const ime = app.inputElement;
    const spot = (x, y) => {
      const now = canvas.getBoundingClientRect();
      return { clientX: now.left + x, clientY: now.top + y, bubbles: true };
    };
    const press = (x, y) => canvas.dispatchEvent(new PointerEvent("pointerdown", spot(x, y)));
    // Caution: **Put the keys into the input field.** Put into the canvas, they go another way than
    // a real keystroke. It returns the event, so the caller looks at the taking over.
    const keyIn = (name, mods) => {
      const ev = new KeyboardEvent("keydown",
        Object.assign({ key: name, bubbles: true, cancelable: true }, mods || {}));
      ime.dispatchEvent(ev);
      return ev;
    };
    // Caution: **Undo by the key** (called directly, a key not wired to the body walks past); it
    // returns the event, as `keyIn` does.
    const undoKey = () => keyIn("z", { ctrlKey: true });
    // Menus. **Press the knob to open one, in the same order as a person** (`click()` reaches the
    // content even shut, and merely standing `open` up skips the way the other menus shut).
    const menuOf = (id) => document.getElementById(id).closest("details.menu");
    const openMenu = (id) => {
      const m = menuOf(id);
      m.querySelector("summary").click();
      return m;
    };
    // Submenus that jut out (`fly.js`), followed **in the same order as a person** (press the row,
    // then the choice; on the ribbon's first row it opens on a press, `page.css`'s `.fly-on`). This
    // does not tell whether the panel is visible (`click()` reaches hidden ones; `ribbon.js` does).
    const flyOf = (id) => document.getElementById(id);
    const flyRows = (id) => Array.from(flyOf(id).querySelectorAll(".fly-pick"));
    const flyLabels = (id) => flyRows(id).map((one) =>
      one.querySelector(".fly-label").textContent);
    // The text on that row now; **empty where inherited from the parent** (nothing landed).
    const flyNow = (id) => flyOf(id).querySelector(".fly-now").textContent;
    // The name of the choice carrying the mark; **empty where there is none**.
    const flyTick = (id) => {
      for (const one of flyRows(id)) {
        if (one.getAttribute("aria-checked") === "true") {
          return one.querySelector(".fly-label").textContent;
        }
      }
      return "";
    };
    // Caution: **It presses a choice by name only where it is there** — taken as pressed, a missing
    // name walks past with the default on, so whether it pressed is returned.
    const flyPick = (id, label) => {
      for (const one of flyRows(id)) {
        if (one.querySelector(".fly-label").textContent === label) {
          flyOf(id).querySelector(".fly-open").click();
          one.click();
          return true;
        }
      }
      return false;
    };
    // It hunts for a table's cell and presses it (at real measures it cannot be settled up front):
    // the y, or 0 where none. **A cell is told by the frame** (a formula in the body opens fields).
    const pressAt = (y) => press(8, y);
    const findCell = () => {
      const tall = canvas.getBoundingClientRect().height;
      for (let y = 8; y < tall; y += 8) {
        pressAt(y);
        if (app.cellFrame() !== null) {
          return y;
        }
      }
      return 0;
    };
    // It hunts for a paragraph with a named style and presses it, as `findCell` does (y, or -1).
    // Caution: **Do not rely on the start-up document's rows** (`kspage/content/sample.kspls`: a
    // paragraph added at the head moves the press, failing as "0 pixels").
    const findBlock = (name) => {
      const tall = canvas.getBoundingClientRect().height;
      for (let y = 4; y < tall; y += 4) {
        pressAt(y);
        if (app.blockStyle() === name) {
          return y;
        }
      }
      return -1;
    };
    // The head of a place a fixture speaks of, **not opening with a folder this repo carries**
    // (`make test-docref` would read it as a citation of a missing file).
    const notAPath = "notes";
    return {
      notAPath: notAPath,
      local: localHere,
      check: check, waiting: waiting, report: report, app: app, canvas: canvas, ime: ime,
      spot: spot, press: press, pressAt: pressAt, keyIn: keyIn, undoKey: undoKey,
      menuOf: menuOf, openMenu: openMenu, findCell: findCell, findBlock: findBlock,
      flyLabels: flyLabels, flyNow: flyNow, flyTick: flyTick, flyPick: flyPick,
      dpr: window.devicePixelRatio || 1,
      // A section carrying asynchronous work holds with this and calls what it returns when done.
      hold: hold,
      // The wait and the safety net; **no milliseconds in a section** (why: `waitFor`'s comment).
      waitFor: waitFor, netFor: netFor,
      pickFile: pickFile,
    };
  }

  // It rouses the way onward from a file chosen: **the choosing window cannot open headless**, but
  // its result can be made (`files` from a `DataTransfer`, then `change`), so the page's way runs.
  // Caution: **Make the content real** (a picture, read in by its measures, refuses bad text).
  function pickFile(el, body, name, type) {
    const move = new DataTransfer();
    move.items.add(new File([body], name, { type: type }));
    el.files = move.files;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // It waits for the page to stand up before starting.
  // Caution: **Do not look once and give up** — the initialising is asynchronous (`kspage.js`'s
  // `WebAssembly.instantiate(...).then`), and a fixed wait fails as a real failure once it grows.
  function runProbe() {
    const app = window.kspage;
    if (!app) {
      check(false, "the page has stood up (there is no window.kspage)");
      report();
      return;
    }
    const ks = tools(app);
    // The same bag under another tab, **for a section cut in two by the line limit** (the half that
    // came away runs inside the other's chain, keeping the order, and still names itself).
    // Caution: **Do not use it to run a section alongside another** (the row below sets the order).
    ks.tagged = (name) => forPart(ks, name);
    // The row of sections, the tabs named here (from the sections, they drift from the file names).
    // **Do not change the order**: a later section runs on the document an earlier one laid down,
    // and the last puts the marks out. **`outline` is last** (the document does not remain) and
    // **`keep` first** (its swap throws away "compare with the earlier version"'s partner).
    const parts = [["keep", kspageProbeKeep], ["input", kspageProbeInput],
      ["store", kspageProbeStore],
      ["menu", kspageProbeMenu], ["cell", kspageProbeCell], ["show", kspageProbeShow],
      ["insert", kspageProbeInsert], ["pin", kspageProbePin], ["filter", kspageProbeFilter],
      ["find", kspageProbeFind], ["paint", kspageProbePaint],
      ["paper", kspageProbePaper], ["link", kspageProbeLink], ["note", kspageProbeNote],
      ["keys", kspageProbeKeys], ["ribbon", kspageProbeRibbon], ["diff", kspageProbeDiff],
      ["source", kspageProbeSource], ["fresh", kspageProbeFresh], ["drag", kspageProbeDrag],
      ["local", kspageProbeLocal],
      ["outside", kspageProbeOutside], ["outline", kspageProbeOutline]];
    for (const [name, run] of parts) {
      run(forPart(ks, name));
    }
  }

  // Caution: **Lay a cap down** (a page never standing up would run out of time with no mark and
  // the reason nowhere); at the cap it gives up and `runProbe` writes the failure.
  const settleMs = 700;
  const readyLimitMs = 5000;
  const pollMs = 50;
  setTimeout(function () {
    let waited = 0;
    const ready = setInterval(function () {
      waited += pollMs;
      if (window.kspage || waited >= readyLimitMs) {
        clearInterval(ready);
        runProbe();
      }
    }, pollMs);
  }, settleMs);
})();
