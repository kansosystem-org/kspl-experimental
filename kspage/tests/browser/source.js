// Where the document points at the source (handing it over, tying, pressing to see).
//
// The banner `This text is what was made` hunted for in the constants section is the core's
// (`kspage/share/consts.kspls`), so that needle follows that side. The document's name and the file
// it aims at are this side's own, the same words as `../wasm/source.mjs`.

function kspageProbeSource(ks) {
  const { check, app, canvas, ime, spot, pressAt, openMenu, hold } = ks;
  // Caution: **Hold the marks back** (reading a handed-over text is asynchronous; the reason is
  // `probe.js`'s `hold`).
  const free = hold();

  // **This can be seen nowhere else**: handing a file over, Ctrl+press putting a panel out rather
  // than a window, and a refusal where nothing was handed over (all break as "press it and nothing
  // comes out").
  const note = document.getElementById("source-note");
  const view = document.getElementById("source-view");
  // The set of files referred to is a `fly.js` set, **not a `<select>`**, so its rows are counted.
  const picked = () => ks.flyLabels("source-pick").length;
  const chooser = document.getElementById("source-file");
  const nameBox = document.getElementById("source-name");

  // The text handed over.
  // Caution: **The columns must be the same as the real thing** (what cuts is a column).
  const src = [
    "import \"std/io\";",
    "",
    "pub struct Aim {",
    "  pub file: U8[];",
    "}",
    "",
    "impl Aim {",
    "  pub fn empty(r: Self@): Bool {",
    "    return r.file.len <= 0;",
    "  }",
    "}",
    "",
  ].join("\n");

  openMenu("source-link");
  // It makes a range to select. **Unselected, the whole run is tied**, so the range's path is
  // looked at too.
  pressAt(8);
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "ArrowRight", shiftKey: true, bubbles: true, cancelable: true }));

  // --- It ties before handing over, and that nothing was handed over comes out ---
  check(app.linkSource("kspage/model/doc.kspls", "Inline.text"), "it can tie to the source");
  const aim = app.sourceAim();
  check(aim !== null && aim.file === "kspage/model/doc.kspls", "what it points at can be got");
  check(aim !== null && aim.name === "Inline.text", "the symbol's name can be got too");
  app.onSource(aim);
  check(note.textContent.indexOf("Not handed over yet") >= 0,
    `it says nothing was handed over (${note.textContent})`);
  check(view.hidden, "the text's panel does not come out");

  // --- Hand it over and it comes out ---
  // How what chooses is roused is `probe.js`'s `pickFile`.
  ks.pickFile(chooser, src, "aim.kspl", "text/plain");

  // Caution: **Do not look once and give up** (the load is asynchronous).
  // **Do not write the length of the wait here** (the reason is `probe.js`'s `waitFor`).
  const done = { read: false };
  ks.waitFor(() => picked() > 0, "the handed-over text comes out in the list", function () {
    if (picked() === 0) {
      done.read = true;
      free();
      return;
    }

    // Tie afresh and press, and that symbol's text comes out.
    check(app.linkSource("aim.kspl", "Aim.empty"), "it can tie to the handed-over text");
    app.onSource(app.sourceAim());
    check(!view.hidden, "the text's panel comes out");
    check(view.textContent.indexOf("pub fn empty(") >= 0,
      "that symbol's text comes out");
    check(view.textContent.indexOf("pub struct Aim") < 0, "the other symbols do not come out");
    check(note.textContent.indexOf("From line 8") >= 0,
      `it says which line it is from (${note.textContent})`);

    // **A symbol that is not there must be said to be "not there"** (not an empty panel).
    check(app.linkSource("aim.kspl", "nowhere"), "it can tie to a symbol that is not there too");
    app.onSource(app.sourceAim());
    check(note.textContent.indexOf("There is no such symbol") >= 0,
      `a symbol that is not there is said to be so (${note.textContent})`);
    check(view.hidden, "for a symbol that is not there it puts no panel out");

    // It can tie from the menu's keys too.
    // **The field and the button must be wired.**
    check(ks.flyPick("source-pick", "aim.kspl"),
      "it can choose from the set of files referred to");
    nameBox.value = "Aim";
    document.getElementById("source-link").click();
    check(app.sourceAim().name === "Aim", "the key is wired to the core");
    check(document.activeElement === ime,
      "after the press the focus goes back to the input field");
    check(!view.hidden && view.textContent.indexOf("pub struct Aim") >= 0,
      "that text comes out on the beat of tying");

    // --- Ctrl+press does not open a window ---
    //
    // **This is the point.** Handed to a window, `src:` flies to a link that cannot be opened (and
    // a headless window left open stops the DOM being drawn out).
    const realOpen = window.open;
    let went = "";
    window.open = (to) => { went = to; return null; };
    // It takes the shower over and counts the rounds that arrived.
    // Caution: **Uncounted it is missed** — "the window did not open" passes even without one press
    // over a link.
    const realShow = app.onSource;
    let shown = 0;
    app.onSource = (one) => { shown += 1; return realShow(one); };
    const box = canvas.getBoundingClientRect();
    for (let y = 8; y < box.height && shown === 0; y += 4) {
      for (let x = 4; x < 200 && shown === 0; x += 8) {
        canvas.dispatchEvent(new PointerEvent("pointerdown",
          Object.assign({}, spot(x, y), { ctrlKey: true })));
      }
    }
    app.onSource = realShow;
    window.open = realOpen;
    check(shown > 0, "a Ctrl+press reaches the shower");
    check(went === "", "for a link to the source it opens no window");

    document.getElementById("source-shut").click();
    check(view.hidden && note.textContent === "", "it can be folded");

    // --- The window (laying a symbol's text inside the document) ---
    //
    // **This can be seen nowhere else**: whether the handed-over text reaches the window and is
    // laid down afresh on going in (both break as "put it in and nothing comes out").
    pressAt(8);
    check(ks.flyPick("source-pick", "aim.kspl"),
      "the window's side can choose from the same set");
    nameBox.value = "Aim.empty";
    const wasText = app.text();
    document.getElementById("source-window").click();
    check(app.text() !== wasText, "putting a window in changes the document");
    check(app.aims().length >= 1,
      `what the document points at can be counted (${app.aims().length})`);
    // **The text does not go into the document** (it does not come out in the save).
    check(app.save().indexOf("pub fn empty(") < 0,
      "the borrowed text does not go into the save");
    check(app.save().indexOf("src:aim.kspl#Aim.empty") >= 0,
      "what it points at goes into the save");
    // **It must come out on the screen** (the content handed over, not the target's text).
    check(app.text().indexOf("pub fn empty(") >= 0,
      "the handed-over text comes out in the window");
    // --- The pulls ---
    //
    // **This can be seen nowhere else**: whether the key is wired to the core, and the box comes
    // out on going in.
    document.getElementById("source-pulls").click();
    check(app.text().indexOf("std/io") >= 0, "what it pulls in comes out in the box");
    check(app.save().indexOf("std/io") < 0, "the box built does not go into the save");
    ks.undoKey();

    // --- Checking what it points at ---
    //
    // **This can be seen nowhere else**: whether the three answers (not handed over / found / the
    // symbol is absent) come out on the panel.
    check(app.linkSource("aim.kspl", "Aim.empty"), "it ties afresh to a target it reaches");
    document.getElementById("source-check").click();
    // Caution: **Look at them one at a time.** The one-line tiding alone lets the "reached" check
    // walk past in a document with other targets unreached (earlier sections tied some).
    const reached = app.aims().filter((one) => one.file === "aim.kspl");
    check(reached.length >= 1 && reached.every((one) => one.state === 1),
      `a target reached is "found" (${reached.length})`);
    check(view.textContent.indexOf("Found\taim.kspl") >= 0,
      "what it points at lines up in the check's list");
    // Caution: **Say a symbol having gone apart from a forgotten hand-over** (the ways to fix them
    // are opposite).
    check(app.linkSource("aim.kspl", "nowhere"), "it ties to a symbol that is not there");
    document.getElementById("source-check").click();
    check(note.textContent.indexOf("symbols are absent") >= 0,
      `where a symbol is absent it says so (${note.textContent})`);
    check(app.linkSource("nowhere.kspl", ""), "it ties to a file not handed over");
    document.getElementById("source-check").click();
    check(note.textContent.indexOf("not handed over yet") >= 0,
      `where nothing was handed over it says so (${note.textContent})`);
    document.getElementById("source-shut").click();

    // --- Making a constants text from a table (the one direction "document → source") ---
    //
    // **This can be seen nowhere else**: whether it refuses outside a table, and whether the
    // link-target field is wired to the core.
    const at = ks.findCell();
    check(at > 0, "a cell can be hunted for");
    document.getElementById("consts-aim").value = "settle.kspl";
    document.getElementById("consts-aim-apply").click();
    check(app.aimHere() === "settle.kspl",
      `the link-target field is wired to the core (${app.aimHere()})`);
    const built = app.consts("the sample document");
    check(built !== null, "a constants text can be made from a table");
    check(built !== null && built.text.indexOf("This text is what was made") >= 0,
      "the origin's mark goes in");
    // **While nothing is handed over there is nothing to compare against** (it does not say old).
    check(app.constsState("the sample document") === "none",
      "before handing over there is nothing to compare against");
    ks.undoKey();

    // Caution: **Finish with both the document and the link-target field put back** (later sections
    // look at the same document).
    ks.undoKey();
    app.setHref("");
    done.read = true;
    free();
  });

  // **Say that it could not wait it out**, or it runs out of time with not one mark put out.
  // Caution: **Do not write the length** (by hand it comes out shorter than the wait; the
  // settlement is `probe.js`'s `netFor`).
  ks.netFor("the source checks finish",
    () => Object.keys(done).filter((one) => !done[one]), free);
}
