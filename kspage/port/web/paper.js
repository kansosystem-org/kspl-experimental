// ==========================================
// kspage's page — the paper settings and printing, and presenting one slide at a time.
// **The pages are a document setting** (not a viewer override). With a different page per viewer
// the prints stop matching, so this file touches only the document's settings.
// It is split from [`file.js`](file.js) for the 1000-line-per-file cap (Principle 3).
// ==========================================
function kspagePaper(ui) {
  const app = ui.app;
  const say = ui.say, deny = ui.deny;

  const paperBox = document.getElementById("paper");
  const paperWide = document.getElementById("paper-width");
  // The paper size and orientation, px at 96dpi (A4 = 210×297mm); **the texts and the labels live
  // only here** (in `page.html` too, there would be two). The size shows at the item's end.
  // Caution: **Do not go back to a `<select>`** — a closed field hides the choice, so it cannot be
  // read until opened (the header of `fly.js`).
  const PAPER_PICKS = [["0,0", "Do not split into pages"], ["1123,1587", "A3"],
    ["794,1123", "A4"], ["559,794", "A5"], ["688,971", "B5 (JIS)"], ["816,1056", "Letter"],
    ["816,1344", "Legal"]];
  const TURN_PICKS = [["0", "Portrait"], ["1", "Landscape"]];
  // **The fields are updated when a choice is made again** (`pickSize`, named here, runs on click).
  const paperPicks = document.getElementById("paper-picks");
  const paperSize = kspageHoldFly(paperPicks,
    { id: "paper-size", name: "Paper size", picks: PAPER_PICKS, run: () => pickSize() });
  const paperTurn = kspageHoldFly(paperPicks,
    { id: "paper-turn", name: "Print orientation", picks: TURN_PICKS, run: () => pickSize() });
  // The width and height from the chosen size and orientation; **the orientation only swaps the
  // two** (per-orientation items would double with each size added).
  const sizeOf = () => {
    const [pw, ph] = paperSize.now().split(",").map(Number);
    return paperTurn.now() === "1" ? [ph, pw] : [pw, ph];
  };
  // The recommended body width, **defined only here**: 640px fits 45 to 75 characters at 13px (the
  // range held most readable).
  const READ_WIDTH = 640;
  const textWide = document.getElementById("text-width");
  const marginOf = (side) => document.getElementById(`margin-${side}`);
  // A field's length; **empty and below 0 are 0** (unset; a negative page or margin means nothing).
  const lengthOf = (box) => (box.value === "" ? 0 : Math.max(Number(box.value), 0));
  // The settings by their saved names (`app.paper()`); **a name left out is 0**, shown empty.
  const shown = (v) => (v > 0 ? v : "");
  const showPaper = () => {
    const p = app.paper();
    paperBox.value = shown(p.page_height);
    paperWide.value = shown(p.page_width);
    for (const side of ["left", "top", "right", "bottom"]) {
      marginOf(side).value = shown(p[`margin_${side}`]);
    }
    textWide.value = shown(p.reading_width);
    // **A landscape page is found in the list too** (portrait pairs only; swapped means landscape).
    const upright = `${p.page_width || 0},${p.page_height || 0}`;
    const turned = `${p.page_height || 0},${p.page_width || 0}`;
    const has = (v) => PAPER_PICKS.some((one) => one[0] === v);
    if (has(upright)) {
      paperSize.set(upright);
      paperTurn.set("0");
    } else if (has(turned)) {
      paperSize.set(turned);
      paperTurn.set("1");
    }
  };
  // Caution: **Start from the settings read** — a saved field this form has no box for would
  // otherwise be dropped.
  const applyPaper = () => {
    const p = app.paper();
    delete p.band;
    p.page_width = lengthOf(paperWide);
    p.page_height = lengthOf(paperBox);
    for (const side of ["left", "top", "right", "bottom"]) {
      p[`margin_${side}`] = lengthOf(marginOf(side));
    }
    p.reading_width = lengthOf(textWide);
    app.setPaper(p);
    showPaper();
    say(app.paper().band === 0 ? "It will not split into pages"
      : `It comes to ${ui.count(app.paperCount(), "page")}`);
    app.focus();
  };
  showPaper();
  for (const box of [paperBox, paperWide, textWide, marginOf("left"), marginOf("top"),
    marginOf("right"), marginOf("bottom")]) {
    box.addEventListener("change", applyPaper);
  }
  // Caution: **Take the recommended width from one place too** (`READ_WIDTH`), or "Make it a
  // readable width" and the written guidance get out of step.
  document.getElementById("text-width-read").addEventListener("click", () => {
    textWide.value = READ_WIDTH;
    applyPaper();
    say(`Stopped the body's width at ${READ_WIDTH}px`);
  });
  // Caution: **Update the fields when a choice is made again** (otherwise touching a margin next
  // goes back to the earlier size). A set size makes the margins 57px (15mm); no pages, no margins.
  const pickSize = () => {
    const [pw, ph] = sizeOf();
    paperWide.value = pw === 0 ? "" : pw;
    paperBox.value = ph === 0 ? "" : ph;
    // **The number lives only here** (in step with the manual's default; 15mm = 57px).
    const pad = ph === 0 ? "" : 57;
    for (const side of ["left", "top", "right", "bottom"]) {
      marginOf(side).value = pad;
    }
    applyPaper();
  };

  // The page's header and footer, **not replaced on every keystroke** (half-typed text would go
  // in). With no top and bottom margins, they have nowhere to go and are not shown.
  for (const which of ["header", "footer"]) {
    const box = document.getElementById(`${which}-text`);
    box.value = app.chrome(which);
    box.addEventListener("change", () => {
      app.setChrome(which, box.value);
      say(box.value === "" ? "Deleted it" : "Set it");
      app.focus();
    });
  }

  // Caution: **Make one canvas per page** (one long canvas cannot span pages), **discarded after
  // printing** (the page gets heavy). **Pass the paper size with `@page`** (otherwise the browser's
  // default page is used), **with margins of 0**. The document's settings (`Paper`) hold the
  // margins, so adding them here would double them.
  const printBox = document.getElementById("sheets");
  const pageRule = document.createElement("style");
  document.head.appendChild(pageRule);
  document.getElementById("print").addEventListener("click", () => {
    // Caution: **Ask for the page printing actually uses** (`printPaper`), not the setting. A
    // document with no paper borrows one when drawn, so `@page` would get no size. Each canvas
    // would spill over the browser's own page into a blank one (`break-inside: avoid` cannot help).
    const p = app.printPaper();
    pageRule.textContent = `@page { size: ${p.page_width}px ${p.page_height}px; margin: 0 }`;
    printBox.textContent = "";
    // Caution: **Do not ask the page count each round**: `paintPages` lays out and counts once.
    app.paintPages(() => {
      const sheet = document.createElement("canvas");
      printBox.appendChild(sheet);
      return sheet;
    });
    window.print();
    printBox.textContent = "";
    app.focus();
  });

  // Presenting one at a time: **advancing and what is shown are the core's entry points** (keys,
  // the clicked place). This file only hides the chrome and redraws to the window's size.
  // Caution: **Give the keys back to the editor on success too.** Its hidden input reads the keys
  // that send on and Esc. Left on the button, the show could be neither sent on nor left.
  document.getElementById("present").addEventListener("click", () => {
    if (app.present(0) < 0) deny("This document has no slides");
    app.focus();
  });
  // **Keep showing and hiding the chrome in step with the redraw** (Esc and a click also trigger
  // it). The speaker's notes show **only while held down** (the audience sees one screen).
  // Caution: **Do not redraw from here** — called from the redraw, it would loop.
  let noteShut = true;
  const noteBand = document.getElementById("stage-note");
  const dressing = () => {
    const on = app.showing() >= 0;
    document.body.classList.toggle("presenting", on);
    // Caution: **Read the note from the slide being shown** (not from where the cursor is).
    const memo = on ? app.surfaceAside(app.showing()) : "";
    noteBand.textContent = memo;
    // **Hide the whole band for an empty note** (a black band alone looks like a mistake).
    noteBand.hidden = noteShut || memo === "";
  };
  // Showing and hiding the notes, **only while presenting** (in editing, N is a character).
  const flipNote = () => {
    noteShut = !noteShut;
    dressing();
    return app.surfaceAside(app.showing()) !== "";
  };

  return {
    dressing: dressing,
    flipNote: flipNote,
  };
}
