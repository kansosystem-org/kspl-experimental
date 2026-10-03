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
  // Drops the groups that left the page (**the ribbon is rebuilt**); kept, they pile up and every
  // keystroke **moves the mark of a group that is gone**. Whether it is attached tells them apart.
  // Caution: **Do not drop them while registering** — a group just built may not be attached yet,
  // and would **vanish as the next group is built**.
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
  // Caution: **Put it in the same group as the styling items** — an inline carries one name, and
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
          return at < 0 ? "" : app.stylePara(at).align;
        },
        run: (value) => {
          const at = paraAt();
          if (at < 0) {
            deny("The alignment lands on a paragraph style. Click on some text");
            return;
          }
          const spec = Object.assign({}, app.stylePara(at));
          spec.align = value;
          tell(app.setStylePara(at, spec), "", "The alignment cannot be changed");
          app.focus();
        } })),
  };
  // **The same group may be placed twice** — the value is the document's, so either acts on it and
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
  // **No mark for what is applied** — once a color can change after a theme is applied, "the
  // current theme" could be false (through Word's link to the template, a changed style silently
  // reverts). So `now` is always empty and the items are **actions**. **Rebuild the style fields
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
  // Caution: **Rebuild them when the document is switched**, or **the earlier document's names
  // stay** and choosing one is refused with "there is no style of that name". **Only the list of
  // names triggers it** (the contents would rebuild on every color change and close an open
  // submenu).
  let styleMark = "";
  const syncStyles = () => {
    const mark = app.styleNames().join("|");
    if (mark === styleMark) {
      return;
    }
    styleMark = mark;
    paintStyles(0);
  };

  // Shows the chosen style's look in the fields. **Empty means "unset"**; **only the colors cannot
  // be empty** (`<input type="color">`), so the checkbox beside says whether one is used. The
  // choices inside a panel.
  // Caution: **Do not go back to a `<select>`** — groups down to the second level and a field on
  // the third would show one "choose one" in two forms. A group in a panel does not close on a
  // click (a `details` stays open; the header of `fly.js`). **The list lives here** (copied into
  // `page.html`, it would be two), **its values match the core's** (`menu_pairs` in
  // `tests/support/conventions_bound.kspls` checks them).
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
  // **The same list as `command.js`'s `SHAPE_PICKS`** (the shape inserted there, the style's here);
  // both are checked against the core's list.
  const STYLE_SHAPE_PICKS = [["box", "Rectangle"], ["round_box", "Rounded rectangle"],
    ["ellipse", "Ellipse"], ["triangle", "Triangle"], ["diamond", "Diamond"],
    ["fall_line", "Line, down-right"], ["rise_line", "Line, up-right"],
    ["fall_arrow", "Arrow, down-right"], ["rise_arrow", "Arrow, up-right"],
    ["fall_arrow_back", "Arrow, down-right reversed"],
    ["rise_arrow_back", "Arrow, up-right reversed"]];
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
  // The page break, **separate from the paragraph-settings entry point** (not grown to ten
  // arguments).
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
  const shapeBox = panelFly("style-shape", "The shape's form", STYLE_SHAPE_PICKS);
  const hasFill = document.getElementById("style-has-fill");
  const fillBox = document.getElementById("style-fill");
  function showFont() {
    const at = Number(pick.now());
    if (!(at >= 0)) return;
    const spec = app.styleLook(at);
    family.value = spec.family === null ? "" : spec.family;
    sizeBox.value = spec.sizePx === null ? "" : spec.sizePx;
    weightBox.value = spec.weight === null ? "" : spec.weight;
    italicBox.set(spec.italic === null ? "" : (spec.italic ? "1" : "0"));
    hasColor.checked = spec.color !== null;
    hasBack.checked = spec.background !== null;
    // Caution: With no setting, leave the color swatch alone, or the color chosen earlier is lost.
    if (spec.color !== null) colorBox.value = spec.color;
    if (spec.background !== null) backBox.value = spec.background;
    const para = app.stylePara(at);
    alignBox.set(para.align);
    leadBox.value = para.spacing === 0 ? "" : para.spacing;
    indentBox.value = para.indent === 0 ? "" : para.indent;
    wrapBox.checked = para.wrap;
    breaksBox.checked = app.styleBreaks(at);
    columnsBox.value = para.columns > 1 ? para.columns : "";
    columnGap.value = para.columnGap === 0 ? "" : para.columnGap;
    padBox.value = para.pad === 0 ? "" : para.pad;
    const num = app.styleNumber(at);
    grouped.checked = num.grouped;
    percent.checked = num.percent;
    hasPlaces.checked = num.places !== null;
    placesBox.value = num.places === null ? "" : num.places;
    prefixBox.value = num.prefix;
    suffixBox.value = num.suffix;
    datedBox.set(num.dated);
    const decor = app.styleDecor(at);
    underBox.set(decor.underline === null ? "" : (decor.underline ? "1" : "0"));
    strikeBox.set(decor.strike === null ? "" : (decor.strike ? "1" : "0"));
    const mark = app.styleMark(at);
    markBox.set(mark.kind);
    markBefore.value = mark.before;
    markText.value = mark.text;
    const heading = app.styleOutline(at);
    outlineBox.value = heading.level === 0 ? "" : heading.level;
    chaptersBox.set(app.styleInChapters(at) ? "1" : "0");
    collectBox.set(heading.collect);
    const when = app.styleWhen(at);
    whenBox.set(when.how);
    whenThan.value = when.how === "none" ? "" : when.than;
    whenThen.set(when.then);
    const edge = app.styleEdge(at);
    edgeBox.value = edge.width === 0 ? "" : edge.width;
    edgeColor.value = edge.color;
    hasFill.checked = edge.fill !== null;
    if (edge.fill !== null) fillBox.value = edge.fill;
    shapeBox.set(edge.shape);
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
  // The memo on the current container. **It is not in the flow**, so this field is its only sign.
  const asideBox = document.getElementById("aside");
  document.getElementById("aside-apply").addEventListener("click", () => {
    tell(app.setAside(asideBox.value), "Added the note", "A note can be added after clicking inside a slide or a table");
    app.focus();
  });
  document.getElementById("aside-clear").addEventListener("click", () => {
    asideBox.value = "";
    tell(app.setAside(""), "Deleted the note", "A note can be deleted after clicking inside a slide or a table");
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

  // **Replacing happens only on a click** (the reason is in the header).
  document.getElementById("style-apply").addEventListener("click", () => {
    const at = Number(pick.now());
    // Caution: **Carry the current space before and after over** — they have no field, so 0 would
    // delete them.
    const was = app.stylePara(at);
    const num = (box) => (box.value === "" ? null : Number(box.value));
    const done = app.setStyleLook(at, {
      family: family.value === "" ? null : family.value,
      sizePx: num(sizeBox),
      weight: num(weightBox),
      italic: italicBox.now() === "" ? null : italicBox.now() === "1",
      color: hasColor.checked ? colorBox.value : null,
      background: hasBack.checked ? backBox.value : null,
    });
    const laid = app.setStylePara(at, {
      align: alignBox.now(),
      spacing: leadBox.value === "" ? 0 : Number(leadBox.value),
      spaceBefore: was.spaceBefore,
      spaceAfter: was.spaceAfter,
      indent: indentBox.value === "" ? 0 : Number(indentBox.value),
      wrap: wrapBox.checked,
      columns: columnsBox.value === "" ? 0 : Number(columnsBox.value),
      columnGap: columnGap.value === "" ? 0 : Number(columnGap.value),
      pad: padBox.value === "" ? 0 : Number(padBox.value),
    });
    app.setStyleBreaks(at, breaksBox.checked);
    const shown = app.setStyleNumber(at, {
      places: hasPlaces.checked && placesBox.value !== "" ? Number(placesBox.value) : null,
      grouped: grouped.checked,
      percent: percent.checked,
      prefix: prefixBox.value,
      suffix: suffixBox.value,
      dated: datedBox.now(),
    });
    const lined = app.setStyleDecor(at, {
      underline: underBox.now() === "" ? null : underBox.now() === "1",
      strike: strikeBox.now() === "" ? null : strikeBox.now() === "1",
    });
    const marked = app.setStyleMark(at, {
      kind: markBox.now(),
      before: markBefore.value,
      text: markText.value,
    });
    const edged = app.setStyleEdge(at, {
      width: edgeBox.value === "" ? 0 : Number(edgeBox.value),
      color: edgeColor.value,
      fill: hasFill.checked ? fillBox.value : null,
      shape: shapeBox.now(),
    });
    const outlined = app.setStyleOutline(at, {
      level: outlineBox.value === "" ? 0 : Number(outlineBox.value),
      collect: collectBox.now(),
    });
    // **A separate entry point** (an added argument lets a caller's wrong order pass the type check
    // — `face_edit.kspls`'s `kspage_web_style_breaks`).
    const chaptered = app.setStyleInChapters(at, chaptersBox.now() === "1");
    const whened = app.setStyleWhen(at, {
      how: whenBox.now(),
      than: whenThan.value === "" ? 0 : Number(whenThan.value),
      then: whenThen.now(),
    });
    const all =
      done && shown && laid && edged && marked && lined && outlined && chaptered && whened;
    tell(all, "Changed the style", "This style cannot be changed");
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
