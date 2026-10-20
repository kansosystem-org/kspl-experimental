// ==========================================
// kspage's page — the style menu: applying one, changing its contents, number formats, paragraph
// settings, the marker, the border and the fill.
//
// Caution: **Build the list from the document's style table** — names copied here make a second
// list, and one goes stale.
// An empty name means "the parent's". **Replacing happens only on a click** (applied on every
// change, a half-typed number would become the style).
// ==========================================
function kspageForm(ui) {
  const app = ui.app;
  const say = ui.say, tell = ui.tell, deny = ui.deny;

  // The style items to apply, and where the style to edit is chosen — **both from the document's
  // style table**, as **flyout submenus** (`fly.js`).
  // Caution: **Do not go back to a `<select>`** — a closed field hides what is applied, so it
  // cannot be read until opened. **Pass the list as a function** (the styles grow later); when they
  // grow or shrink, `paint()`.
  const pick = kspageHoldFly(document.getElementById("style-pick"),
    { id: "style-pick", name: "The style to change",
      picks: () => app.styleNames().map((name, i) => [String(i), name]),
      run: () => showFont() });
  // The color swatches for unnamed styling; a custom color is set under "Adjusting each style
  // preset".
  // Caution: **It must be able to hold "unset"**, or an applied color cannot be removed.
  const PALETTE = [
    ["#000000", "Black"], ["#808080", "Grey"], ["#ffffff", "White"], ["#c00000", "Red"],
    ["#e36c0a", "Orange"], ["#ffff00", "Yellow"], ["#00b050", "Green"], ["#0070c0", "Blue"],
    ["#7030a0", "Purple"], ["#ffc7ce", "Pink"],
  ];
  // The "inherit from the parent" item at the top of the list. **An item needs a name** (a blank
  // one does not look clickable); the blank mark for nothing applied is `fly.js`'s.
  const NONE = ["", "Unset"];
  const named = (fits) => {
    const rows = [NONE];
    app.styleNames().forEach((name, i) => {
      // Caution: **Do not list a style that cannot apply to a paragraph** (a table's or a slide's)
      // — chosen, it would be refused (Principle 5).
      if (!fits || app.styleFitsBlock(i)) rows.push([name, name]);
    });
    return rows;
  };
  // A three-way choice (the parent's / on / off). **"Off" is a setting too** — it makes this word
  // alone not bold inside a bold paragraph.
  const triple = (does, doesnt) => [NONE, ["1", does], ["0", doesnt]];
  const tri = (v) => (v === null ? "" : (v ? "1" : "0"));
  // Changes one style field. **The styling is replaced whole**, so the current settings are read
  // and only that field is changed.
  const paintOne = (which, value) => {
    const ink = app.spanInk();
    ink[which] = value === "" ? null
      : (which === "color" || which === "background" ? value : value === "1");
    const done = app.paintSpan(ink);
    tell(done, "", "There is nowhere to land a style. Select a range");
    app.focus();
  };
  // Every item that lists names. A styling item holds none, so it is never rebuilt (only the mark
  // moves).
  // Caution: **Keep them in one list** (an added item not included keeps the old names alone).
  let flies = [];
  // The groups rebuilt from the list of names, **when the list changes** (otherwise an added style
  // splits the listed names from the applied one).
  let namedFlies = [];
  // Registers a built group. **Go through this one function** — a separate `push` leaves the mark
  // in the forgotten group stale.
  const keepFly = (made, names) => {
    flies.push(made);
    if (names) namedFlies.push(made);
    return made;
  };
  // Drops the groups that left the page (**the ribbon is rebuilt**). Kept, they pile up, and every
  // keystroke **moves the mark of a group that is gone**. Whether it is attached tells them apart.
  // Caution: **Do not drop them while registering.** A group just built can be not yet attached,
  // and it would **vanish as the next group is built**.
  const dropGone = () => {
    flies = flies.filter((one) => one.box.isConnected);
    namedFlies = namedFlies.filter((one) => one.box.isConnected);
  };

  // The top level: **only "what it acts on"** (the choices open on the item pointed at), as Google
  // Docs' "Text" and "Paragraph styles".
  const top = document.getElementById("form-picks");
  const spanBox = kspageFlyout(top, { id: "span-picks", name: "Font" }).box;
  const inkFly = (host, id, name, picks, which, keys) => keepFly(kspageFlyout(host,
    { id: id, name: name, keys: keys, picks: picks,
      now: () => {
        const at = app.spanInk()[which];
        return which === "color" || which === "background" ? (at || "") : tri(at);
      },
      run: (value) => paintOne(which, value) }));
  // **In Google Docs' order** (bold, italic, underline, strikethrough), the most used on top.
  // The shortcut shows on the "yes" item (Ctrl+B toggles).
  inkFly(spanBox, "paint-bold", "Bold", () => triple("Yes", "No"), "bold",
    { "1": "Ctrl+B" });
  inkFly(spanBox, "paint-italic", "Italic", () => triple("Yes", "No"), "italic",
    { "1": "Ctrl+I" });
  inkFly(spanBox, "paint-under", "Underline", () => triple("Draw", "Do not draw"), "underline",
    { "1": "Ctrl+U" });
  inkFly(spanBox, "paint-strike", "Strikethrough", () => triple("Draw", "Do not draw"),
    "strike", {});
  // What names a style and applies it.
  // Caution: **Put it in the same group as the styling items.** An inline carries one name, and
  // the styling is applied as that name too (removing one removes both).
  keepFly(kspageFlyout(spanBox,
    { id: "style-set", name: "Character style", picks: () => named(false),
      now: () => app.style(),
      run: (value) => {
        tell(app.setStyle(value), "", "A style can be chosen after clicking on some text");
        app.focus();
      } }), true);

  // A paragraph's alignment. **It applies to the style of the current paragraph** (there are no
  // section breaks), as the columns do (`ribbon.js`'s `columnsToggle`).
  const ALIGNS = [["left", "Left"], ["center", "Centre"], ["right", "Right"],
    ["justify", "Justified"]];
  // The index of the current paragraph's style, **found from the name** (stored by name).
  const paraAt = () => {
    const face = app.blockStyle();
    return face.length <= 0 ? -1 : app.styleNames().indexOf(face);
  };

  // A group that can be shown both in the menu and on the ribbon.
  // Caution: **Do not copy the contents.** The choices and their actions live only here; copied,
  // the menu would drift (Principle 4). The caller decides only **the location and the name**
  // ("Font colour" at the top level, "Colour" inside Font). The band behind text is "Highlight"
  // wherever it is set (the style panel's "Highlight colour" too), separate from a block's "Fill".
  const MADE = {
    // **Show the reason where it is refused** (the core's refusals fall into four kinds).
    "block-style": (host, id, name) => keepFly(kspageFlyout(host,
      { id: id, name: name, picks: () => named(true),
        now: () => app.blockStyle(),
        run: (value) => {
          const why = app.setBlockStyle(value);
          if (why === "") { say(""); } else { deny(why); }
          app.focus();
        } }), true),
    "paint-color": (host, id, name) =>
      inkFly(host, id, name, () => [NONE].concat(PALETTE), "color", {}),
    "paint-back": (host, id, name) =>
      inkFly(host, id, name, () => [NONE].concat(PALETTE), "background", {}),
    "para-align": (host, id, name) => keepFly(kspageFlyout(host,
      { id: id, name: name, picks: () => ALIGNS,
        now: () => {
          const at = paraAt();
          return at < 0 ? "" : app.styleData(at).align || "left";
        },
        run: (value) => {
          const at = paraAt();
          if (at < 0) {
            deny("The alignment lands on a paragraph style. Click on some text");
            return;
          }
          const data = app.styleData(at);
          data.align = value;
          tell(app.setStyleData(at, data), "", "The alignment cannot be changed");
          app.focus();
        } })),
  };
  // **The same group can be placed twice.** The value is the document's, so either acts on it, and
  // both carry the mark (`showSpan` updates every registered group).
  const putFly = (host, kind, id, name) => MADE[kind](host, id, name);

  putFly(spanBox, "paint-color", "paint-color", "Colour");
  putFly(spanBox, "paint-back", "paint-back", "Highlight");
  putFly(top, "block-style", "block-style", "Paragraph style");
  putFly(top, "para-align", "para-align", "Alignment");
  // The document's theme.
  // Caution: **Build the list from the core** (copied here, an added theme would split the count
  // offered from the count there).
  //
  // **No mark for what is applied.** Once a color can change after a theme is applied, "the
  // current theme" could be false. Through Word's link to the template, a changed style silently
  // reverts. So `now` is always empty and the items are **actions**. **Rebuild the style fields
  // once one is applied.**
  keepFly(kspageFlyout(top,
    { id: "theme-picks", name: "The whole document's theme",
      picks: () => app.themes().map((name, i) => [String(i), name]),
      now: () => "",
      run: (value) => {
        const at = Number(value);
        const worn = app.wearTheme(at);
        paintStyles(pick.now());
        say(worn ? `Applied the theme "${app.themes()[at]}"`
          : `The theme "${app.themes()[at]}" is already applied`);
        app.focus();
      } }), true);
  // **Rebuild them once a style is created**, or the new name is in neither list.
  const paintStyles = (keep) => {
    dropGone();
    pick.paint();
    whenThen.paint();
    pick.set(String(keep === undefined ? 0 : keep));
    for (const one of namedFlies) one.paint();
    showFont();
  };
  // Rebuilds them when the list of style names changes.
  // Caution: **Rebuild them when the document is switched.** Otherwise **the earlier document's
  // names stay**, and choosing one is refused with "there is no style of that name". **Only the
  // list of names triggers it**: the contents would rebuild on every color change and close an
  // open submenu.
  let styleMark = "";
  const syncStyles = () => {
    const mark = app.styleNames().join("|");
    if (mark === styleMark) {
      return;
    }
    styleMark = mark;
    paintStyles(0);
  };

  // Shows the chosen style in the fields. **Empty means "unset"**. **Only the colors cannot be
  // empty** (`<input type="color">`), so the checkbox beside says whether one is used. The choices
  // inside a panel.
  // Caution: **Do not go back to a `<select>`.** Groups down to the second level and a field on
  // the third would show one "choose one" in two forms. A group in a panel does not close on a
  // click (a `details` stays open; the header of `fly.js`). **The list lives here** (copied into
  // `page.html`, it would be two). **Its values are the core's variant names** (`menu_pairs` in
  // `tests/support/conventions_bound.kspl` checks them).
  const ITALIC_PICKS = [["", "Italic as the parent's"], ["1", "Italic"], ["0", "Not italic"]];
  const DATED_PICKS = [["none", "As a number"], ["plain", "2026-08-18"],
    ["long", "18 August 2026"]];
  // **Justify stretches only the wrapped lines** (the last line stays left).
  const ALIGN_PICKS = [["left", "Left"], ["center", "Centre"], ["right", "Right"],
    ["justify", "Justified"]];
  const UNDER_PICKS = [["", "Underline as the parent's"], ["1", "Draw the underline"],
    ["0", "Do not draw the underline"]];
  const STRIKE_PICKS = [["", "Strikethrough as the parent's"], ["1", "Draw the strikethrough"],
    ["0", "Do not draw the strikethrough"]];
  const MARK_PICKS = [["none", "No mark"], ["bullet", "A mark"], ["number", "A number"],
    ["serial", "A running number"], ["outline", "A chapter number"]];
  const CHAPTERS_PICKS = [["1", "In the chapter row"],
    ["0", "Outside the chapter row (not in the contents or the numbering)"]];
  const COLLECT_PICKS = [["none", "Do not gather"], ["contents", "Table of contents"],
    ["notes", "Footnote list"], ["bars", "Bar chart"], ["lines", "Line chart"]];
  const WHEN_PICKS = [["none", "No condition"], ["above", "Greater than"],
    ["below", "Less than"], ["equal", "Equal to"]];
  // Builds one group inside a panel (`fly.js` holds the value).
  // Caution: **Do not return focus to the body** — a panel's fields are filled in one after another
  // (the difference from a submenu).
  const panelFly = (id, name, picks) => kspageHoldFly(document.getElementById(id),
    { id: id, name: name, picks: picks });
  const family = document.getElementById("style-family");
  const sizeBox = document.getElementById("style-size");
  const weightBox = document.getElementById("style-weight");
  const italicBox = panelFly("style-italic", "Italic", ITALIC_PICKS);
  const hasColor = document.getElementById("style-has-color");
  const colorBox = document.getElementById("style-color");
  const hasBack = document.getElementById("style-has-back");
  const backBox = document.getElementById("style-back");
  // Number formats. **They apply only where text is made from a value** (a formula's result); plain
  // typed text stays, or it would turn into a number mid-typing.
  const grouped = document.getElementById("style-grouped");
  const percent = document.getElementById("style-percent");
  const hasPlaces = document.getElementById("style-has-places");
  const placesBox = document.getElementById("style-places");
  const prefixBox = document.getElementById("style-prefix");
  const datedBox = panelFly("style-dated", "Show it as a date", DATED_PICKS);
  const suffixBox = document.getElementById("style-suffix");
  // Paragraph settings. **The space before and after is not changed from here.**
  const alignBox = panelFly("style-align", "Alignment", ALIGN_PICKS);
  const leadBox = document.getElementById("style-lead");
  const indentBox = document.getElementById("style-indent");
  const wrapBox = document.getElementById("style-wrap");
  // The page break before the paragraph.
  const breaksBox = document.getElementById("style-breaks");
  // The columns. **Empty and 1 both mean no columns** (the width comes from the count and the gap).
  const columnsBox = document.getElementById("style-columns");
  const columnGap = document.getElementById("style-column-gap");
  // The padding of the fill.
  // Caution: **Do not fake it with the line height** (that also widens the gaps between lines).
  const padBox = document.getElementById("style-pad");
  // The underline and the strikethrough. **Empty means "the parent's"** ("do not draw" is a setting
  // that removes the parent's line).
  const underBox = panelFly("style-underline", "Underline", UNDER_PICKS);
  const strikeBox = panelFly("style-strike", "Strikethrough", STRIKE_PICKS);
  // The marker. **It sits in the indent**, so a style with a marker needs an indent.
  const markBox = panelFly("style-mark", "Bullets and numbering", MARK_PICKS);
  // **The text before the number exists only for a running number** ("Figure " of "Figure 1."); the
  // core holds it for no other kind.
  const markBefore = document.getElementById("style-mark-before");
  const markText = document.getElementById("style-mark-text");
  // The heading depth and the table-of-contents setting. **Depth 0 means "not a heading".**
  const outlineBox = document.getElementById("style-outline");
  // Whether it is included in chapters, **a field separate from the depth** (depth 0 leaves the
  // outline too). A title page or a colophon turns it off.
  const chaptersBox = panelFly("style-in-chapters", "The chapter row", CHAPTERS_PICKS);
  const collectBox = panelFly("style-collect", "The way of gathering", COLLECT_PICKS);
  // The conditional look. **Only the style's name is applied** (the color is that style's).
  const whenBox = panelFly("style-when", "Condition", WHEN_PICKS);
  const whenThan = document.getElementById("style-when-than");
  // The style applied. **The first item is "Do not apply"** (empty: apply nothing).
  const whenThen = kspageHoldFly(document.getElementById("style-when-then"),
    { id: "style-when-then", name: "The style laid over",
      picks: () => [["", "Do not apply"]].concat(app.styleNames().map((name) => [name, name])) });
  // The border and the fill. **A line is drawn only with a thickness** (a color alone shows
  // nothing).
  const edgeBox = document.getElementById("style-edge");
  const edgeColor = document.getElementById("style-edge-color");
  // The shape inserted and the style's shape share one list (`command.js`'s `SHAPE_PICKS`).
  const shapeBox = panelFly("style-shape", "The shape's form", ui.shapePicks);
  const hasFill = document.getElementById("style-has-fill");
  const fillBox = document.getElementById("style-fill");
  // **The fields are read from and written into the style's saved text** (`app.styleData`), by
  // its field names (`kspage/share/store.kspl`'s `style_val`). **A field left out is unset or
  // holds its default.**
  const textOf = (v) => (v === undefined ? "" : String(v));
  const triOf = (v) => (v === undefined ? "" : (v ? "1" : "0"));
  // Sets one field, or leaves it out where the value is `undefined` (unset).
  const put = (data, key, value) => {
    if (value === undefined) {
      delete data[key];
    } else {
      data[key] = value;
    }
  };
  const numOf = (box) => (box.value === "" ? undefined : Number(box.value));
  // A length that cannot be below 0 (a column gap, the inner space, a line's thickness): **below
  // 0 is 0**, or the band would be smaller than its contents.
  const lengthOf = (box) => (box.value === "" ? undefined : Math.max(Number(box.value), 0));
  // The fields that hold a marker's texts, by its kind: the text after (or the mark itself), then
  // the text before (or the separator) for a kind with two. **Which field is present gives the
  // kind**, read in `MARK_PICKS`' order as the core reads it.
  const MARK_FIELDS = { bullet: ["bullet"], number: ["number_after"],
    serial: ["serial_after", "serial_before"], outline: ["outline_after", "outline_sep"] };
  // What a style collects: **the field named after the kind is true** (none: no field).
  const COLLECTS = COLLECT_PICKS.map((one) => one[0]).filter((kind) => kind !== "none");
  // The condition: **the field `when_<how>` holds the number compared with** (none: no field).
  const WHENS = WHEN_PICKS.map((one) => one[0]).filter((how) => how !== "none");
  function showFont() {
    const at = Number(pick.now());
    if (!(at >= 0)) return;
    const s = app.styleData(at);
    if (s === null) return;
    family.value = textOf(s.family);
    sizeBox.value = textOf(s.size_px);
    weightBox.value = textOf(s.weight);
    italicBox.set(triOf(s.italic));
    hasColor.checked = s.color !== undefined;
    hasBack.checked = s.background !== undefined;
    // Caution: With no setting, leave the color swatch alone, or the color chosen earlier is lost.
    if (s.color !== undefined) colorBox.value = s.color;
    if (s.background !== undefined) backBox.value = s.background;
    alignBox.set(s.align || "left");
    leadBox.value = textOf(s.line_spacing);
    indentBox.value = textOf(s.indent);
    wrapBox.checked = s.wrap !== false;
    breaksBox.checked = s.break_before === true;
    columnsBox.value = s.columns > 1 ? s.columns : "";
    columnGap.value = textOf(s.column_gap);
    padBox.value = textOf(s.pad);
    grouped.checked = s.grouped === true;
    percent.checked = s.percent === true;
    hasPlaces.checked = s.places !== undefined;
    placesBox.value = textOf(s.places);
    prefixBox.value = textOf(s.prefix);
    suffixBox.value = textOf(s.suffix);
    datedBox.set(s.dated || "none");
    underBox.set(triOf(s.underline));
    strikeBox.set(triOf(s.strike));
    const mark = MARK_PICKS.map((one) => one[0])
      .find((kind) => kind in MARK_FIELDS && s[MARK_FIELDS[kind][0]] !== undefined) || "none";
    const fields = MARK_FIELDS[mark] || [];
    markBox.set(mark);
    markText.value = fields.length > 0 ? textOf(s[fields[0]]) : "";
    markBefore.value = fields.length > 1 ? textOf(s[fields[1]]) : "";
    outlineBox.value = s.outline > 0 ? s.outline : "";
    chaptersBox.set(s.in_chapters === false ? "0" : "1");
    collectBox.set(COLLECTS.find((kind) => s[kind] === true) || "none");
    const how = WHENS.find((one) => s[`when_${one}`] !== undefined) || "none";
    whenBox.set(how);
    whenThan.value = how === "none" ? "" : textOf(s[`when_${how}`]);
    whenThen.set(textOf(s.when_then));
    edgeBox.value = s.rule_width > 0 ? s.rule_width : "";
    // As for the text's colors: with no line, the swatch keeps the color chosen earlier.
    if (s.rule_color !== undefined) edgeColor.value = s.rule_color;
    hasFill.checked = s.fill !== undefined;
    if (s.fill !== undefined) fillBox.value = s.fill;
    shapeBox.set(s.shape || "box");
  }
  // Choosing a color checks the use-it box too (otherwise the choice silently does nothing).
  colorBox.addEventListener("input", () => { hasColor.checked = true; });
  backBox.addEventListener("input", () => { hasBack.checked = true; });
  fillBox.addEventListener("input", () => { hasFill.checked = true; });
  // Copies the styling and style name of the current inline into the items, moving only the mark.
  // Caution: **Do not skip this**, or what is applied and the mark disagree.
  function showSpan() {
    dropGone();
    syncStyles();
    for (const one of flies) one.sync();
  }
  // The presenter's note on the current slide. **It is not in the flow**, so this field is its only
  // sign.
  const asideBox = document.getElementById("aside");
  document.getElementById("aside-apply").addEventListener("click", () => {
    tell(app.setAside(asideBox.value), "Added the note", "A note can be added after clicking inside a slide");
    app.focus();
  });
  document.getElementById("aside-clear").addEventListener("click", () => {
    asideBox.value = "";
    tell(app.setAside(""), "Deleted the note", "A note can be deleted after clicking inside a slide");
    app.focus();
  });

  // The link: **the target is the inline's and the look is the styling's** (one action applies
  // both).
  const hrefBox = document.getElementById("href");
  document.getElementById("link-apply").addEventListener("click", () => {
    const to = hrefBox.value;
    if (to === "") {
      deny("Enter a link target");
    } else {
      tell(app.setHref(to), "Set the link (Ctrl+click to go there)", "There is nowhere to set a link. Select a range");
    }
    app.focus();
  });
  document.getElementById("link-clear").addEventListener("click", () => {
    tell(app.setHref(""), "Released the link", "There is no link to release");
    app.focus();
  });

  // **Replacing happens only on a click** (the reason is in the header), **as one undo step**.
  // Caution: **Start from the style read** — a field with no box here (the space before and after,
  // a slide's size, the next style) would otherwise be dropped.
  document.getElementById("style-apply").addEventListener("click", () => {
    const at = Number(pick.now());
    const s = app.styleData(at);
    if (s === null) {
      deny("This style cannot be changed");
      app.focus();
      return;
    }
    put(s, "family", family.value === "" ? undefined : family.value);
    put(s, "size_px", numOf(sizeBox));
    put(s, "weight", numOf(weightBox));
    put(s, "italic", italicBox.now() === "" ? undefined : italicBox.now() === "1");
    put(s, "color", hasColor.checked ? colorBox.value : undefined);
    put(s, "background", hasBack.checked ? backBox.value : undefined);
    put(s, "align", alignBox.now());
    put(s, "line_spacing", numOf(leadBox));
    put(s, "indent", numOf(indentBox));
    put(s, "wrap", wrapBox.checked ? undefined : false);
    put(s, "break_before", breaksBox.checked ? true : undefined);
    put(s, "columns", numOf(columnsBox));
    put(s, "column_gap", lengthOf(columnGap));
    put(s, "pad", lengthOf(padBox));
    put(s, "places", hasPlaces.checked ? numOf(placesBox) : undefined);
    put(s, "grouped", grouped.checked ? true : undefined);
    put(s, "percent", percent.checked ? true : undefined);
    put(s, "prefix", prefixBox.value === "" ? undefined : prefixBox.value);
    put(s, "suffix", suffixBox.value === "" ? undefined : suffixBox.value);
    put(s, "dated", datedBox.now() === "none" ? undefined : datedBox.now());
    put(s, "underline", underBox.now() === "" ? undefined : underBox.now() === "1");
    put(s, "strike", strikeBox.now() === "" ? undefined : strikeBox.now() === "1");
    // Caution: **Clear every kind's fields first** (the first present gives the kind). For a
    // kind with two texts, **write the text before too** (left out, "Figure " or the separator is
    // lost and the number stands alone).
    for (const fields of Object.values(MARK_FIELDS)) {
      for (const key of fields) delete s[key];
    }
    const fields = MARK_FIELDS[markBox.now()] || [];
    if (fields.length > 0) s[fields[0]] = markText.value;
    if (fields.length > 1) s[fields[1]] = markBefore.value;
    const width = lengthOf(edgeBox);
    put(s, "rule_width", width > 0 ? width : undefined);
    put(s, "rule_color", edgeColor.value);
    put(s, "fill", hasFill.checked ? fillBox.value : undefined);
    put(s, "shape", shapeBox.now());
    put(s, "outline", numOf(outlineBox));
    put(s, "in_chapters", chaptersBox.now() === "1" ? undefined : false);
    for (const kind of COLLECTS) delete s[kind];
    if (COLLECTS.includes(collectBox.now())) s[collectBox.now()] = true;
    for (const one of WHENS) delete s[`when_${one}`];
    delete s.when_then;
    if (WHENS.includes(whenBox.now())) {
      s[`when_${whenBox.now()}`] = whenThan.value === "" ? 0 : Number(whenThan.value);
      s.when_then = whenThen.now();
    }
    tell(app.setStyleData(at, s), "Changed the style", "This style cannot be changed");
    app.focus();
  });
  // Creates a style. **Where the name exists it creates none** (a second could never be looked up).
  const nameBox = document.getElementById("style-name");
  document.getElementById("style-new").addEventListener("click", () => {
    const at = app.addStyle(nameBox.value);
    if (at === -2) {
      deny("A style's name cannot hold a space. Join the words with a hyphen (page-break)");
    } else if (at < 0) {
      deny("Enter the style's name");
    } else {
      nameBox.value = "";
      paintStyles(at);
      say("Made the style");
    }
    app.focus();
  });
  paintStyles(0);
  return {
    // What shows the same group on the ribbon too. **The contents live only here.**
    putFly: putFly,
    showSpan: showSpan,
    hrefBox: hrefBox,
    asideBox: asideBox,
  };
}
