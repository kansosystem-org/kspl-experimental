// Menus and buttons, the formula field, the icons' shortcuts, and Tab. The style name `bullet` is
// the document's, so that needle moves with `kspage/content`.

function kspageProbeMenu(ks) {
  const { check, app, canvas, ime, pressAt, keyIn, undoKey, openMenu, findCell } = ks;

  // 10. Menus and buttons: whether a menu opens, whether a press shuts it, and whether the focus
  // goes back to the input field (else "it cannot be typed on after the press"). Like a person, it
  // opens a menu and then presses (`click()` reaches the content even shut).
  // Caution: **Shut it before pressing** — an earlier section can leave one open (a save with the
  // local server and an empty path field shows that field), and pressing an open one shuts it.
  ks.menuOf("save").open = false;
  const fileMenu = openMenu("save");
  check(fileMenu.open, "pressing the knob opens the menu");
  // One alone opens. With two open, the later menu hides behind the earlier and cannot be pressed.
  const styleMenu = openMenu("style-apply");
  check(styleMenu.open && !fileMenu.open,
    "opening another menu shuts the earlier menu");
  // **What is pressed is not "Save"**: holding no file, Save opens a window to choose a place,
  // which opens only inside a person's press (a headless browser has none); a command answering in
  // the same press is looked at, and real overwriting is confirmed by hand (`kspage/README.md`).
  openMenu("export");
  document.getElementById("export").focus();
  document.getElementById("export").click();
  check(document.getElementById("note").textContent === "Wrote it out as HTML",
    "the command's tiding comes out");
  // The debug log: **the document's content must not go in**; the falling text is read by taking
  // `URL.createObjectURL` over (a real fall cannot be seen in a headless browser).
  const realBlob = URL.createObjectURL;
  let carried = null;
  URL.createObjectURL = (blob) => {
    if (carried === null) carried = blob;
    return realBlob.call(URL, blob);
  };
  openMenu("report");
  document.getElementById("report").click();
  URL.createObjectURL = realBlob;
  check(document.getElementById("note").textContent.indexOf("Downloaded the debug log") >= 0,
    "the debug log falls");
  check(carried !== null, "the falling text is built");
  if (carried !== null) {
    const done = ks.hold();
    carried.text().then((text) => {
      // Caution: **Both the names lined up and the document's styles go in** (the drift is there).
      check(text.indexOf("The document's styles:") >= 0
        && text.indexOf("The paragraph styles listed in the menu:") >= 0,
        "both the document's styles and the row of rows go into the log");
      check(text.indexOf("Change history") >= 0, "the change history goes into the log");
      // Caution: **The text typed must not go in** (the needle is `kspage/content`'s own text).
      check(text.indexOf("all in one document") < 0,
        "the document's content does not go into the log");
      done();
    });
  }
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  check(!fileMenu.open, "pressing a command shuts the menu");
  // It must shut on a press outside too. Unshut, where it pressed hides behind the menu.
  openMenu("save");
  canvas.dispatchEvent(new PointerEvent("pointerdown",
    { clientX: 10, clientY: 10, bubbles: true }));
  check(!fileMenu.open, "a press outside shuts the menu");
  // Caution: **It must shut on Esc too** (as in other products); the keystroke's way and the menu's
  // contend for the same key (else deleting a composition shuts the menu).
  openMenu("save");
  keyIn("Escape");
  check(!fileMenu.open, "Esc shuts the menu");
  check(document.activeElement === ime,
    "after it shuts the focus goes back to the input field");
  // **An Esc during composition is undoing the composition**, so do not touch the menu.
  openMenu("save");
  ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Escape", isComposing: true, bubbles: true, cancelable: true }));
  check(fileMenu.open, "an Esc during composition does not shut the menu");
  keyIn("Escape");
  // Help sits at the band's right edge; **the left edge is "File"'s**, the most used (⌃ a button).
  const barMenus = Array.from(document.querySelectorAll("#bar > .menu"));
  const helpAt = barMenus.indexOf(document.getElementById("help"));
  check(helpAt >= 0 && helpAt > barMenus.length / 2,
    "\"?\" sits on the band's right side (" + (helpAt + 1) + "/" + barMenus.length + ")");
  check(barMenus[0].id !== "help", "the left edge is not \"?\"");
  // Caution: **A menu must not grow too far down** (it covers the canvas); a set with many fields
  // folds into a nested `<details>`, and the 400px cap is a settled value.
  let tallest = 0;
  let tallestAt = "";
  for (const m of document.querySelectorAll("#bar > .menu")) {
    m.querySelector("summary").click();
    const high = m.querySelector(".items").getBoundingClientRect().height;
    if (high > tallest) {
      tallest = high;
      tallestAt = m.querySelector("summary").textContent;
    }
    m.open = false;
  }
  check(tallest > 0 && tallest <= 400,
    "an opened menu does not pass 400px ("
      + tallestAt + " is " + Math.round(tallest) + "px)");

  // No box that carries a submenu winds anything up (`overflow` cuts off absolutely placed
  // descendants, hiding a submenu inside).
  // Caution: **Counting the DOM does not notice it** (only the look shows: a band winding sideways,
  // the deep rows out of reach), so **every submenu inside the band is looked at**, not one set.
  const clipped = [];
  for (const fly of document.querySelectorAll("#bar .fly")) {
    for (let up = fly.parentElement; up !== null && up.id !== "bar"; up = up.parentElement) {
      const how = getComputedStyle(up);
      if (how.overflowX !== "visible" || how.overflowY !== "visible") {
        clipped.push((up.id || up.className || up.tagName) + " winds "
          + (fly.id || "a set with no name") + " up");
      }
    }
  }
  check(clipped.length === 0,
    "there is no box that winds a submenu up ("
      + (clipped.join(" / ") || "none") + ")");

  // The first row's length: **height alone is not enough** — a short menu with the commands flat on
  // the first row gives no clue to "which acts on what" (`fly.js`'s opening header, "keep the first
  // row short"), so **the count** is looked at too (the cap of 4 is settled).
  // Caution: **Do not count by depth** (a command sits inside a `.row` and inside a set inside one,
  // so "directly under `.items`" misses a row forgotten into a set): a button in neither a submenu
  // nor a panel counts, a row pointing at a set (`.fly-open`) does not, nor `…` (`#spill`).
  const flat = [];
  for (const m of document.querySelectorAll("#bar > .menu:not(#spill)")) {
    const how = Array.from(m.querySelectorAll(".items button")).filter((b) =>
      !b.classList.contains("fly-open") && b.closest(".fly-items") === null
      && b.closest("details.sub") === null).length;
    if (how > 4) {
      flat.push(m.querySelector("summary").textContent + " has " + how);
    }
  }
  check(flat.length === 0,
    "the commands lined up directly on a menu's first row go to 4 ("
      + (flat.join(" / ") || "none") + ")");

  // Caution: **Do not lay a `<select>` inside a menu** — choosing one would line up in two guises,
  // and **which acts on the beat of a press cannot be read**. **Inside a panel too a set, not a
  // field** (a panel is a `details`, so a press does not shut it: `../../port/web/fly.js`'s
  // opening header).
  const loose = [];
  for (const box of document.querySelectorAll("#bar select")) {
    loose.push(box.id || "a field with no name");
  }
  check(loose.length === 0,
    "no `<select>` is left in a menu (" + (loose.join(" / ") || "none") + ")");

  // **Two rows at most, and no row that folds one thing only**: **two keep the first row to "what
  // it acts on"** (Google Docs's `Format ▸ Text ▸ Bold`). A set (`fly-nest`) holds no choices and
  // a leaf lines up ✓ rows; a leaf on the second row is fine, **a set inside a set makes a third
  // row**.
  const nested = [];
  for (const box of document.querySelectorAll("#bar .fly-items.fly-nest")) {
    const up = box.parentElement.parentElement.closest(".fly-items.fly-nest");
    if (up !== null) {
      nested.push((box.parentElement.id || "a set with no name")
        + " is a set inside a set");
    }
  }
  check(nested.length === 0,
    "no set is made inside a set (" + (nested.join(" / ") || "none") + ")");

  // Caution: **Do not use a folded panel (`details.sub`) in place of a submenu** — a panel is for a
  // set touched on and on (text to read, fields filled in turn); as a submenu, one touch sends the
  // focus to the body and it shuts (`fly.js`'s opening header). Looked at after the JS fills lists.
  const panels = [];
  for (const sub of document.querySelectorAll("#bar details.sub")) {
    const reads = sub.querySelector("pre, p.hint") !== null;
    const fields = sub.querySelectorAll("input, select").length;
    if (!reads && fields < 3) {
      panels.push(sub.querySelector("summary").textContent);
    }
  }
  check(panels.length === 0,
    "a folded panel is a \"touched on and on\" set and nothing else ("
      + (panels.join(" / ") || "none") + ")");

  // **Every row pointing at a set looks the same** before opening (one aimed by id reads as odd).
  const looks = new Map();
  for (const open of document.querySelectorAll("#bar .fly > .fly-open")) {
    const at = getComputedStyle(open);
    const mark = at.borderTopWidth + " " + at.borderTopColor + " / " + at.backgroundColor
      + " / " + at.display;
    if (!looks.has(mark)) { looks.set(mark, []); }
    looks.get(mark).push(open.querySelector(".fly-name").textContent);
  }
  const odd = Array.from(looks.entries()).map(([mark, who]) => who.length + " at " + mark);
  check(looks.size <= 1,
    "the rows that point at a submenu look the same (" + odd.join(" ≠ ") + ")");

  // Whether it can go down to the deep rows.
  ks.openMenu("form-picks");
  // **Look at the `.fly-items` inside, not the `.fly`** (a bare container, passing with the fault).
  const group = document.getElementById("span-picks");
  const groupBox = group === null ? null : group.querySelector(".fly-items");
  check(groupBox !== null, "the box of the characters set is there");
  if (groupBox) {
    const wrap = getComputedStyle(groupBox);
    check(wrap.overflowX === "visible" && wrap.overflowY === "visible",
      "a set's box does not wind up (" + wrap.overflowX + "/" + wrap.overflowY + ")");
    // It opens the third row (Style → Characters → Bold), which must be inside the window.
    // Caution: **Put the focus in from the outside inward** (it opens on `:focus-within`; a shut
    // row's child takes no focus), and **`click()` does not open it** (it moves no focus).
    group.querySelector(".fly-open").focus();
    const boldFly = document.getElementById("paint-bold");
    check(boldFly !== null, "the third row's bold is there");
    if (boldFly) {
      boldFly.querySelector(".fly-open").focus();
      const deep = boldFly.querySelector(".fly-items").getBoundingClientRect();
      check(deep.width > 0 && deep.height > 0,
        "the third row opens holding measures (" + Math.round(deep.width) + "x" +
        Math.round(deep.height) + ")");
      check(deep.left >= 0 && deep.right <= window.innerWidth + 1,
        "the third row fits inside the window (left=" + Math.round(deep.left) + " right=" +
        Math.round(deep.right) + " window=" + window.innerWidth + ")");
    }
  }

  // A row inside a set does not fold: **its length is settled by `min-width`** (a submenu's box
  // floats beside its row, so narrow, a set's row folds to two or three; `page.css` says the same).
  // Caution: **Measure after opening** (while shut the measures are 0); the row's length is
  // compared with the tallest field inside.
  openMenu("put-shape");
  const shapeGroup = document.getElementById("put-shape-fly");
  check(shapeGroup !== null, "the figures set is there");
  if (shapeGroup) {
    shapeGroup.querySelector(".fly-open").focus();
    const folded = [];
    for (const row of shapeGroup.querySelectorAll(".fly-items > .row")) {
      const tall = row.getBoundingClientRect().height;
      let one = 0;
      for (const kid of row.children) {
        one = Math.max(one, kid.getBoundingClientRect().height);
      }
      if (tall > one + 4) {
        folded.push(Math.round(tall) + "px (the field is " + Math.round(one) + "px)");
      }
    }
    check(folded.length === 0,
      "a row inside a set does not fold (" + (folded.join(" / ") || "none") + ")");
  }

  // The fields of "change the style itself" land on one press, all together: **a misspelt field id
  // leaves the wasm unhurt** and breaks only as "the style does not change".
  openMenu("style-apply");
  const itemAt = app.styleNames().indexOf("bullet");
  check(itemAt >= 0, "the sample holds an item style");
  check(ks.flyPick("style-pick", "bullet"),
    "the bullet-list style can be chosen from the set of styles to change");
  check(ks.flyTick("style-mark") === "A mark",
    "the kind of mark landed gets the mark (" + ks.flyTick("style-mark") + ")");
  document.getElementById("style-mark-text").value = "‣";
  document.getElementById("style-apply").click();
  check(document.getElementById("note").textContent === "Changed the style",
    "the fields land all together (" + document.getElementById("note").textContent + ")");
  check(app.styleMark(itemAt).text === "‣", "the sign typed goes into the style");
  // **One press comes back in one** (a step stacked for an unchanged field would undo nothing).
  undoKey();
  check(app.styleMark(itemAt).text === "• ", "one undo returns to the original sign");
  // The serial-number fields: **a misspelt id leaves the core unhurt**, dropping "Fig. " alone.
  check(ks.flyPick("style-mark", "A running number"),
    "\"A running number\" can be chosen from the kinds of mark");
  document.getElementById("style-mark-before").value = "Fig. ";
  document.getElementById("style-mark-text").value = ". ";
  document.getElementById("style-apply").click();
  const serial = app.styleMark(itemAt);
  check(serial.kind === "serial" && serial.before === "Fig. " && serial.text === ". ",
    "the texts before and after the number go in from the fields ("
      + serial.before + "|" + serial.text + ")");
  // **Count over the whole document.** With body text in between it does not go back to 1.
  check(app.html().indexOf("Fig. 1. ") >= 0 && app.html().indexOf("Fig. 2. ") >= 0,
    "the serial numbers come out in what is written out");
  undoKey();
  check(app.styleMark(itemAt).kind === "bullet",
    "one undo returns to the original kind of mark");

  // 11. The formula field: **not rewritten while typed on**, and the focus back after the swap.
  const bar = document.getElementById("formula");
  const box = canvas.getBoundingClientRect();
  // Where it presses is built from the canvas's position **now**.
  // Caution: **Do not remember a position** (the window follows the cursor, so it goes stale; the
  // height may stay). Over a heading it is not a cell, and left open it swaps the whole run.
  pressAt(8);
  check(bar.disabled, "over the body the formula field is shut");
  const cellY = findCell();
  check(cellY > 0, "a table's cell can be pressed");
  check(!bar.disabled, "inside a cell the formula field opens");

  // While it is being typed on it is not rewritten.
  bar.focus();
  bar.value = "=1+1";
  app.inputElement.dispatchEvent(new InputEvent("input",
    { data: "z", inputType: "insertText", bubbles: true }));
  check(bar.value === "=1+1",
    "the formula field is not rewritten while it is being typed on");

  // Enter swaps it, and the focus goes back to the body.
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  bar.dispatchEvent(enter);
  check(enter.defaultPrevented, "Enter is taken over");
  check(document.activeElement === ime, "after the swap the focus goes back to the body");

  // The cell being typed on shows the formula, elsewhere the value (**the value reckoned is not put
  // into the document**; the text is inside the canvas).
  check(app.text().indexOf("=1+1") >= 0, "the cell being typed on shows the formula");
  pressAt(8);
  check(app.text().indexOf("=1+1") < 0, "move elsewhere and the formula stops showing");
  check(app.text().indexOf("2") >= 0, "the value shows instead");
  // Undo returns to the original formula; **the texts must not mix** (the value is never stored).
  undoKey();
  check(app.text().indexOf("=1+1") < 0, "one undo takes the formula off");

  // 10'. The icons' shortcuts go the same way as the menus (a misspelt id leaves the wasm unhurt).
  // Caution: **Do not make a way apart from the menus'** — one alone changed puts them out of step,
  // so the shortcut must give the same result as the menu.
  const tools = document.getElementById("ribbon");
  check(tools !== null && tools.querySelectorAll("button").length > 0,
    "the row of shortcuts is there ("
      + (tools === null ? 0 : tools.querySelectorAll("button").length) + ")");
  const tableCount = () => app.html().split("<table").length;
  pressAt(8);
  const toolWas = tableCount();
  // The Table shortcut inserts at the size landed on Insert's grid (2 × 2 until pressed).
  document.getElementById("tool-table").click();
  check(tableCount() === toolWas + 1, "the shortcut grows one table");
  // The undo shortcut goes through the same entry point as the key.
  document.getElementById("tool-undo").click();
  check(tableCount() === toolWas, "the undo shortcut puts it back");
  check(document.activeElement === ime, "after the press the focus goes back to the input field");
  document.getElementById("tool-redo").click();
  check(tableCount() === toolWas + 1, "the redo shortcut grows it again");
  document.getElementById("tool-undo").click();
  check(tableCount() === toolWas, "undoing returns to the original document");
  pressAt(8);

  // 11''. The menu of the spot, put out by a right-click: whether the browser's menu was stopped,
  // where, and whether the rows swap for where it is now (else "right-click and nothing comes out"
  // or "the spellcheck vanished in a field").
  const rightAt = (into, x, y) => {
    const now = into.getBoundingClientRect();
    const ev = new MouseEvent("contextmenu",
      { clientX: now.left + x, clientY: now.top + y, bubbles: true, cancelable: true });
    into.dispatchEvent(ev);
    return ev;
  };
  const hereBox = document.getElementById("here");
  const hereNames = () =>
    Array.from(hereBox.querySelectorAll(".fly-label")).map((one) => one.textContent);
  check(hereBox !== null && hereBox.closest("#bar") === null,
    "the menu of the spot sits outside the menu band");
  // Over the body it stops the browser's menu and puts its own panel out.
  pressAt(8);
  check(rightAt(canvas, 8, 8).defaultPrevented,
    "over the body it stops the browser's menu");
  check(!hereBox.hidden && hereNames().length > 0,
    "the menu of the spot comes out (" + hereNames().join(" / ") + ")");
  // **Do not make a row that exists only here** (Apple HIG); the one named sits inside a menu.
  const looseRow = hereNames().filter((name) =>
    !Array.from(document.querySelectorAll("#bar button, #bar .fly-name"))
      .some((one) => one.textContent.trim() === name));
  check(looseRow.length === 0,
    "every row is in a menu too (" + looseRow.join(" / ") + ")");
  // **Not stopped over a field being typed in or the tools** (the spellcheck and translation go).
  check(!rightAt(document.getElementById("find-text"), 4, 4).defaultPrevented,
    "in a field being typed in the browser's menu comes out as it is");
  check(!rightAt(document.getElementById("status"), 4, 4).defaultPrevented,
    "on the status bar too the browser's menu comes out as it is");
  // Esc shuts it. **It must be shuttable by key** (it is other products' manner).
  keyIn("Escape");
  check(hereBox.hidden, "Esc shuts the menu of the spot");
  // The rows swap for where it is: **row and column rows inside a cell alone** (they act there).
  const cellRows = (() => {
    pressAt(findCell());
    rightAt(canvas, 8, 8);
    const got = hereNames();
    keyIn("Escape");
    return got;
  })();
  pressAt(8);
  rightAt(canvas, 8, 8);
  const bodyRows = hereNames();
  keyIn("Escape");
  check(cellRows.length > bodyRows.length,
    "inside a cell the rows grow (body " + bodyRows.length
      + " -> cell " + cellRows.length + ")");
  // Caution: **Do not carry cut, copy and paste** (a paste cannot be called from a press; Principle
  // 5), hunted by **the wording the rows carry** (keyed on wording that is nowhere, this passes).
  const dead = cellRows.filter((name) =>
    name === "Cut" || name === "Copy" || name === "Paste");
  check(dead.length === 0,
    "no row that does not act on a press is carried (" + dead.join(" / ") + ")");

  // 11'. Tab moves between cells (taking the key is the DOM side's call), **not taken outside a
  // table**, or the page cannot be walked by key alone; the move is seen by the cell's frame.
  const tabKey = (back) => ime.dispatchEvent(new KeyboardEvent("keydown",
    { key: "Tab", shiftKey: back, bubbles: true, cancelable: true }));
  pressAt(cellY);
  const wasCell = app.cellFrame();
  check(wasCell !== null, "it is over a cell");
  check(tabKey(false) === false, "inside a cell Tab is taken over");
  const nextCell = app.cellFrame();
  check(nextCell !== null && nextCell[0] > wasCell[0],
    "it moves to the next cell ("
      + (nextCell === null ? "" : wasCell[0] + " -> " + nextCell[0]) + ")");
  check(tabKey(true) === false && app.cellFrame()[0] === wasCell[0],
    "Shift+Tab goes back");
  // Outside a table it is not taken over (the focus must move on the default).
  pressAt(8);
  check(app.cellFrame() === null, "it is over the body");
  check(tabKey(false) === true, "outside a table Tab is not taken over");
}
