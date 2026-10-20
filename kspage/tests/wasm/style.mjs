import { check, near, material, para, group, grid, shared } from "./shell.mjs";

export const subject =
  "A style's fields (the name, the way of showing, the drawing over, the colour, the line's "
  + "opening mark, the frame, the settlement that changes with the value).";

// The body's first run, and one line that does not wrap.
// Caution: **Make the material and the text hunted for one name** (apart, a change to the
// material fails only "the box is there"). **Keep the first run narrower than the width laid
// out** (300), so `find`, matching a box's text whole, has one box to match.
const lead = "Prose, tables and slides ";
const codeLine = "    io.out().s(\"Hello, Kanso!\\n\");";

// What it reaches into.
// Caution: **Make the first block a heading** (laying a style and a colour both look at box 0).
// **Make the body wrap into three lines or more at width 300** (both edges stretch the wrapped
// lines alone; with two, the check looks at one). **Line three numbered paragraphs up.** **Have
// the detail's amounts hold 120**, or the "above 100" red does not grow and it passes quietly.
//
// The style names (`heading`, `body`, `strong`, `contents`, `code`, `bullet`, `numbered`,
// `table`, `cell`, `heading-cell`, `amount`) and the amount's money sign (`$`) are the document's
// own, defined by `kspage/content`'s sample, so they stay as they are until that side moves.
export const opens = material({
  styles: [
    { ...shared.heading, outline: 1 },
    shared.body,
    shared.strong,
    { name: "contents", space_after: 12.0, indent: 16.0, contents: true },
    { name: "code", family: "monospace", space_before: 12.0, space_after: 12.0, pad: 10.0,
      wrap: false },
    { name: "bullet", indent: 24.0, bullet: "• " },
    { name: "numbered", indent: 32.0, number_after: ". " },
    shared.table,
    shared.cell,
    shared.headingCell,
    shared.amount,
  ],
  blocks: [
    para("heading", "kspage, a heading"),
    para("body", lead, ["all in one document", "strong"],
      " is what it is for writing. Only the arranging differs, and below that they are shared. "
      + "Breaking into lines, inheriting and lining baselines up are all on the core's side."),
    para("bullet", "It is a paragraph that carries a mark."),
    para("code", codeLine),
    para("numbered", "The numbers are handed out at the placing."),
    para("numbered", "They do not go into the document."),
    para("numbered", "So adding one does not make them stale."),
    grid("table",
      [para("heading-cell", ["The look", "strong"]), para("heading-cell", ["The order", "strong"])],
      [para("cell", "Prose"), para("cell", "Flowed in")]),
    grid({ style: "table", name: "detail" },
      [para("heading-cell", "Qty"), para("heading-cell", "Price"), para("heading-cell", "Amount")],
      [para("cell", "3"), para("cell", "120"), para("cell", ["=A2*B2", "amount"])],
      [para("cell", "5"), para("cell", "80"), para("cell", ["=A3*B3", "amount"])],
      [para("cell", ["Total", "strong"]), para("cell", ""),
        para("cell", ["=C2:C3.sum()", "amount"])]),
  ],
});

export function run(ks) {
  const { w, scratch, read, out, stage, geom, boxOf, textOf, find, save, md, load,
    setTyped, leaveCell, styleNames, styleOf, setStyle, styleData, setStyleData, panelAt } = ks;
  // Changes some of style `i`'s fields and puts the whole back; a field given `undefined` is left
  // out (unset). **A style crosses as its saved text**, so the field names are the saved ones.
  const change = (i, fields) => setStyleData(i, { ...styleData(i), ...fields });

  // --- Laying a style on ---
  // **A style is a name**; the list is the document's own table of styles (no copy here).
  check(styleNames().indexOf("strong") >= 0,
    "a style's name can be taken from the document's side");
  // It chooses two characters from the heading's head. **The text is not settled by hand.**
  w.kspage_web_layout(300);
  const headBefore = textOf(0);
  w.kspage_web_click(0, 10, 0);
  check(styleOf() === "", "the heading's run is still the parent's style");
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  check(setStyle("strong"), "a style can be laid on what is chosen");
  w.kspage_web_layout(300);
  check(textOf(0) + textOf(1) === headBefore,
    `the run splits at the edge chosen (${textOf(0)}|${textOf(1)})`);
  // What is chosen stays after it is laid on (else the style laid on could not be read).
  check(styleOf() === "strong", "the name of the style laid on comes back");

  // Lay it on again while it is still chosen and the style comes off and the run returns to one.
  check(setStyle(""), "a style can be taken off");
  w.kspage_web_layout(300);
  check(textOf(0) === headBefore,
    `taken off, the runs gather back into one (${textOf(0)})`);
  check(w.kspage_web_undo() === 1 && w.kspage_web_undo() === 1,
    "both go back in one step each");
  w.kspage_web_layout(300);
  check(textOf(0) === headBefore && styleOf() === "",
    "gone back, both the text and the style return to what they were");

  // --- The way a number is shown ---
  // **It bites only where a text is made from a value** (a bare number typed stays as typed).
  const money = styleNames().indexOf("amount");
  check(money >= 0, "the material has the amount's style");
  const shown = styleData(money);
  check(shown.grouped === true && shown.places === 0,
    "the grouping and 0 decimal places can be read");
  check(shown.prefix === "$", "the text put on in front can be read");
  check(shown.suffix === undefined, "there is no text put on behind");
  // 3 x 120 = 360 comes out as a text carrying the splitter and the money sign.
  check(find("$360") >= 0, "the answer is spelt as the way of showing says");
  // A text is not dressed up (else a character being typed turns into a number).
  check(find("120") >= 0, "the price typed bare stays as it was");

  // Swap the way of showing and the text changes.
  // Caution: **Move the sign from in front to behind**, so a `$` left behind makes the whole-text
  // needle miss; another sign in front would not show "replaced whole".
  check(change(money, { places: 2, grouped: undefined, prefix: undefined, suffix: " USD" }) === 1,
    "the way of showing can be changed");
  check(find("360.00 USD") >= 0, "the text is changed by the way of showing changed");
  w.kspage_web_undo();
  check(find("$360") >= 0, "one step returns the way of showing it was");

  // --- The way a date is shown ---
  // **A date is a number, the count of days from 1970-01-01**, read and spelt as a date only
  // while the text's style says the way a date is shown.
  check(styleData(money).dated === undefined, "a bare style does not show it as a date");
  const datedAt = w.kspage_web_add_style(stage("date"));
  check(datedAt >= 0, "a style for a date can be made");
  check(change(datedAt, { dated: "plain" }) === 1, "the way a date is shown can be laid on");
  check(styleData(datedAt).dated === "plain", "the way of showing laid on can be read back");
  check(save().indexOf('"dated": "plain"') >= 0,
    "the way of showing goes into the text saved");
  // It makes the total's cell a date and builds one with a formula (swapped whole).
  const datedBox = geom(find("$760"));
  w.kspage_web_click(datedBox[0] + 1, datedBox[1] + datedBox[3] / 2, 0);
  check(w.kspage_web_set_style(stage("date")) === 1,
    "the date's style can be laid on the cell");
  setTyped("=Day.of(2026, 8, 18)");
  leaveCell();
  check(find("2026-08-18") >= 0, "the formula's answer comes out as a date");
  // A date the calendar does not hold does not become a value. **What is swapped is the text the
  // cursor is in.**
  const againAt = geom(find("2026-08-18"));
  w.kspage_web_click(againAt[0] + 1, againAt[1] + againAt[3] / 2, 0);
  setTyped("=Day.of(2026, 2, 30)");
  leaveCell();
  check(find("#VALUE!") >= 0, "a date the calendar does not hold becomes a mark");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_undo();
  leaveCell();
  check(find("$760") >= 0, "gone back, the original total returns");

  // --- A paragraph's drawing over and the space between lines ---
  // The drawing over is `Align`'s name; a default is left out of the text.
  const body = styleNames().indexOf("body");
  check(body >= 0, "the material has the body's style");
  const wasPara = styleData(body);
  check(wasPara.align === undefined, "the default is drawn left");
  check(wasPara.line_spacing === undefined,
    "the multiple for the space between lines starts from no settlement");
  // **Wrapping is the default** (false lays the body out as a lump of code).
  check(wasPara.wrap === undefined, `the default is to wrap (${wasPara.wrap})`);
  // The space in front and behind comes in the same text (the body has 12px behind).
  check(near(wasPara.space_after, 12),
    `the space in front and behind can be read (${wasPara.space_after})`);
  const wasWide = w.kspage_web_layout(300);
  check(change(body, { align: "right", line_spacing: 2 }) === 1,
    "a paragraph's settlements can be changed");
  check(w.kspage_web_layout(300) > 0 && w.kspage_web_height() > 0,
    "it can be placed afresh");
  // **A box is hunted for where its text matches whole**; a text not there gives -1, and asking
  // for that shape reads outside the memory.
  const at = find(lead);
  check(at >= 0, "the body's box is there");
  // Drawn right, the line moves right by what is left over.
  const rightAt = geom(at);
  check(rightAt[0] > 0, `drawn right, the line draws right (${rightAt[0]})`);
  const laid = styleData(body);
  check(laid.align === "right" && near(laid.line_spacing, 2),
    "the settlement changed can be read back");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(styleData(body).align === undefined, "one step returns the drawing over it was");
  check(w.kspage_web_layout(300) === wasWide, "the placing returns too");

  // Drawn to both edges. **The core settles the letter spacing box by box.** **What stretches is
  // the wrapped lines alone** (the last line is as when drawn left).
  const boxSpacing = (i) => boxOf(i)[14];
  check(change(body, { align: "justify" }) === 1, "drawing to both edges can be laid on");
  const wrapped = w.kspage_web_layout(300);
  check(styleData(body).align === "justify", "drawing to both edges can be read back");
  // **The right edges of the lines carrying letter spacing line up at the column's right edge.**
  const spreadOf = () => {
    const rights = new Map();
    const count = w.kspage_web_layout(300);
    let plain = 0;
    for (let i = 0; i < count; i += 1) {
      const one = geom(i);
      if (boxSpacing(i) <= 0) {
        plain += 1;
        continue;
      }
      const top = Math.round(one[1]);
      rights.set(top, Math.max(rights.get(top) ?? 0, one[0] + one[2]));
    }
    return { rights: [...rights.values()], plain: plain };
  };
  const spread = spreadOf();
  check(spread.rights.length >= 2,
    `there are two lines or more carrying letter spacing (${spread.rights.length})`);
  check(spread.rights.every((v) => near(v, spread.rights[0])),
    `every line ends at the same right edge (${spread.rights[0]})`);
  check(spread.plain > 0,
    "a line with no letter spacing is left too (it is the paragraph's last line)");
  w.kspage_web_undo();
  check(w.kspage_web_layout(300) === wasWide, "one step returns the placing it was");

  // A lump of code. **That it does not break when narrowed is the mark of not wrapping** (at
  // width 300 its line fits anyway).
  const codeAt = styleNames().indexOf("code");
  check(codeAt >= 0, "the material has the code's style");
  check(styleData(codeAt).wrap === false, `the code does not wrap (${styleData(codeAt).wrap})`);
  w.kspage_web_layout(80);
  const code_box = find(codeLine);
  check(code_box >= 0,
    "narrowed, the code's one line is there whole as one box");
  check(geom(code_box)[2] > 80,
    `it stretches right past the column's width (${geom(code_box)[2]})`);
  check(w.kspage_web_layout(300) === wasWide,
    "put the width back and the placing goes back too");
  check(spreadOf().rights.length === 0,
    "put back, no box is left carrying letter spacing");
  check(styleData(body).align === undefined, "the drawing over returns too");

  // --- Changing the style itself ---
  // **Change one and every place of that name changes.**
  const h1 = styleNames().indexOf("heading");
  check(h1 >= 0, "the material has the heading's style");
  const wasFont = styleData(h1);
  // The material's heading is 28px and heavy, with no typeface named.
  check(near(wasFont.size_px, 28), `the settlement of the size can be read (${wasFont.size_px})`);
  check(wasFont.family === undefined, "a field not written is left out");
  check(wasFont.color === undefined && wasFont.background === undefined,
    "the colours start from no settlement");

  check(change(h1, { size_px: 40, weight: 700, italic: undefined }) === 1,
    "a style can be changed");
  w.kspage_web_layout(300);
  check(near(geom(0)[4], 40), `the heading's size changes (${geom(0)[4]})`);
  // Italic was made "no settlement", so it is the parent's as it stands (not italic).
  check(geom(0)[6] === 0, "a field with no settlement inherits from the parent");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(near(geom(0)[4], 28), "one step returns the style it was");

  // --- The characters' and the ground's colours ---
  // **"No settlement" is a field left out** (with 0 as the mark, black could not be settled). In
  // the style a colour is `#rrggbb`; in a box it is `0xRRGGBB` (24 bits cross exactly in an F32).
  const RED = 0xff0000;
  const YELLOW = 0xffff00;
  check(change(h1, { color: "#ff0000", background: "#ffff00" }) === 1, "a colour can be settled");
  const withColor = styleData(h1);
  check(withColor.color === "#ff0000", `the text colour can be read (${withColor.color})`);
  check(withColor.background === "#ffff00",
    `the ground's colour can be read too (${withColor.background})`);
  // It has to reach the box, or the canvas draws in the default colour.
  w.kspage_web_layout(300);
  w.kspage_web_box(0, scratch);
  const headBox = read(12);
  check(headBox[8] === 1 && headBox[9] === RED, "the text colour reaches the box");
  check(headBox[10] === 1 && headBox[11] === YELLOW, "the ground's colour reaches it too");
  // **Black has to be settleable too.**
  check(change(h1, { color: "#000000", background: undefined }) === 1,
    "black can be settled too");
  check(styleData(h1).color === "#000000", "black can be told from \"no settlement\"");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(styleData(h1).color === undefined,
    "going back a step at a time, the colour's settlement goes too");
  // The text written out carries the colour, and it stays after being read back.
  change(h1, { color: "#ff0000" });
  const withInk = save();
  check(withInk.includes("#ff0000"), "the colour goes into the text written out");
  const back = load(withInk) !== 0;
  check(back, "a text carrying a colour can be read back");
  check(styleData(styleNames().indexOf("heading")).color === "#ff0000",
    "read back, the colour is still there");

  // A style can be made. The same name is not made twice.
  const hadStyles = w.kspage_web_style_count();
  const madeAt = w.kspage_web_add_style(stage("note"));
  check(madeAt >= 0 && w.kspage_web_style_count() === hadStyles + 1,
    "the styles grow by one");
  check(out(w.kspage_web_style_name(madeAt)) === "note", "it can be drawn by that name");
  w.kspage_web_undo();
  check(w.kspage_web_style_count() === hadStyles, "one step returns to before it was made");

  // A name holding a space is turned away, **and the reason comes back as its own number** (it
  // would cut a Markdown fence's language short; `kspage/docs/DESIGN-document.md`'s "A style name holds no
  // whitespace").
  // Caution: **Look at -2 and not merely at "below zero"** — the number says which refusal it is,
  // or the screen asks for a name already typed in.
  check(w.kspage_web_add_style(stage("page break")) === -2,
    "a name holding a space comes back as -2");
  check(w.kspage_web_add_style(stage("page\tbreak")) === -2,
    "a name holding a tab comes back as -2 too");
  check(w.kspage_web_style_count() === hadStyles, "neither is left on the table");
  const hyphened = w.kspage_web_add_style(stage("page-break"));
  check(hyphened >= 0 && out(w.kspage_web_style_name(hyphened)) === "page-break",
    "the same name joined with a hyphen goes in");
  w.kspage_web_undo();
  check(w.kspage_web_style_count() === hadStyles, "and that one comes off again");

  // --- The mark that opens a line ---
  // The kind is the field that holds its text (`bullet` for a mark, `number_after` for a number).
  // **A mark is not the document's text** (a box, not written out).
  const item = styleNames().indexOf("bullet");
  check(item >= 0, "the material has the bullet list's style");
  const bullet = styleData(item).bullet;
  check(bullet === "• ", `the mark can be read (${bullet})`);
  const numbered = styleNames().indexOf("numbered");
  check(styleData(numbered).number_after !== undefined, "the numbered style can be read too");
  // A number has to come out as a box that was placed.
  w.kspage_web_layout(300);
  check(find("1. ") >= 0 && find("3. ") >= 0, "the numbers are placed as boxes");
  // **They do not go into the document's text** (the typing could delete them).
  check(!save().includes("\"text\":\"1. \""), "a number does not go into the document");
  // The mark can be laid on afresh.
  check(change(body, { bullet: "- " }) === 1, "a mark can be laid on the paragraph");
  w.kspage_web_layout(300);
  check(styleData(body).bullet === "- ", "the mark laid on can be read back");
  check(find("- ") >= 0, "the mark laid on is placed");
  // **A mark does not lie over the body.** `body` carries no indent, so the body's left edge
  // moves right by the mark's worth (else the number looks gone under the first character).
  const mark = find("- ");
  const said = geom(mark);
  const next = geom(mark + 1);
  check(next[0] >= said[0] + said[2] - 0.001,
    `the body starts from the mark's right (mark ${said[0]}+${said[2]} / body ${next[0]})`);
  // **In Markdown the mark becomes the text itself** (the style's mark does not come out).
  check(md().includes("- "), "the mark goes into the Markdown written out too");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(styleData(body).bullet === undefined, "one step takes the mark away");
  check(setStyleData(999, { name: "body", bullet: "- " }) === 0,
    "it does not lay on a number that is not there");

  // --- The frame and the fill ---
  // **They cross as a band, not as a box** (a box is only where there is text). The bands come in
  // the document's order, so the inner lies on top.
  w.kspage_web_layout(300);
  // A band must not be taken for a style it is not laid on.
  const cell = styleNames().indexOf("cell");
  check(cell >= 0, "the material has the cell's style");
  const cellEdge = styleData(cell);
  check(cellEdge.rule_width === 1 && cellEdge.fill === undefined,
    "the cell's line can be read, and there is no fill");
  check(w.kspage_web_panel_count() > 3,
    `a band comes out per cell (${w.kspage_web_panel_count()})`);
  // **It has to be the cell's shape** (at the contents' height a shallow cell loses its grid).
  const cellAt = geom(find("The look"));
  w.kspage_web_click(cellAt[0] + 1, cellAt[1] + 1, 0);
  w.kspage_web_cell_frame(scratch);
  const spot = read(5);
  let shaped = false;
  for (let i = 0; i < w.kspage_web_panel_count(); i += 1) {
    const one = panelAt(i);
    if (near(one[0], spot[0]) && near(one[1], spot[1])
      && near(one[2], spot[2]) && near(one[3], spot[3])) shaped = true;
  }
  check(spot[4] === 1 && shaped, "the band is there in the cell's shape");
  // A heading's cell carries a fill too.
  // Caution: "No fill" is a field left out (so black can be filled).
  const headStyle = styleNames().indexOf("heading-cell");
  check(headStyle >= 0, "the material has the heading cell's style");
  check(styleData(headStyle).fill !== undefined, "a heading's cell carries a fill");
  // It can be laid on a paragraph afresh. No thickness puts the line out; no `fill` the fill.
  const LIGHT = 0xeeeeee;
  check(change(body, { rule_width: 3, rule_color: "#ff0000", fill: "#eeeeee" }) === 1,
    "a frame and a fill can be laid on a paragraph");
  w.kspage_web_layout(300);
  const laidEdge = styleData(body);
  check(laidEdge.rule_width === 3 && laidEdge.rule_color === "#ff0000",
    "the line's thickness and colour can be read back");
  check(laidEdge.fill === "#eeeeee", "the fill's colour can be read back too");
  let painted = null;
  for (let i = 0; i < w.kspage_web_panel_count(); i += 1) {
    const one = panelAt(i);
    if (one[4] === 3 && one[7] === LIGHT) painted = one;
  }
  check(painted !== null, "the band laid on comes out in the result of the placing");
  check(painted !== null && painted[3] > 0, "the band has a height");
  // It has to go into the text written out too, and stay after being read back.
  check(save().includes("#eeeeee"), "the fill goes into the text written out");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(styleData(body).fill === undefined, "one step takes the fill's settlement away");
  check(setStyleData(999, { name: "body", rule_width: 1 }) === 0,
    "it does not lay on a number that is not there");
  check(panelAt(999)[2] === 0,
    "asking for the band of a number that is not there does not fall");

  // --- The settlement that changes the look by the value (a style with a condition) ---
  // **It has to go into the text saved too.**
  // Caution: **Do not count the reds from 0** — an earlier section made the heading red, so look
  // at the difference from the count before.
  const redCount = () => {
    const count = w.kspage_web_layout(300);
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      w.kspage_web_box(i, scratch);
      const shape = read(14);
      if (shape[8] !== 0 && shape[9] === 0xff0000) n += 1;
    }
    return n;
  };
  const redsWere = redCount();
  const alertAt = w.kspage_web_add_style(stage("alert"));
  check(alertAt >= 0, "a style to lay over can be made");
  change(alertAt, { color: "#ff0000" });
  const whenAt = styleNames().indexOf("cell");
  check(whenAt >= 0, "the material has the cell's style");
  // The way of comparing is the field's name (`when_above`), and what against its value.
  check(change(whenAt, { when_above: 100, when_then: "alert" }) === 1,
    "the settlement can be put against it");
  check(styleData(whenAt).when_above === 100,
    "the way of comparing and what against can be read back");
  check(styleData(whenAt).when_then === "alert",
    "the name of the style laid over can be read back too");
  check(save().indexOf("\"when_above\": 100") >= 0,
    "the settlement goes into the text saved");
  const redsNow = redCount();
  check(redsNow > redsWere,
    `a cell that meets the settlement is drawn red (${redsWere} -> ${redsNow})`);
  check(change(whenAt, { when_above: undefined, when_then: undefined }) === 1,
    "the settlement can be taken off");
  check(redCount() === redsWere,
    "taken off, the red of the settlement's worth is gone");

  // --- The document's theme (dressing it in colours and typefaces as one set) ---
  //
  // **The core carries the list** (no names or count copied here), **the colours and the
  // typefaces alone** — sizes would change the count of pages per theme.
  // Note: The theme's name (`Standard`) is the core's (`kspage/write/theme.kspl`), so that needle
  // stays as it is until that side moves.
  const names = [];
  for (let i = 0; i < w.kspage_web_theme_count(); i += 1) {
    names.push(out(w.kspage_web_theme_name(i)));
  }
  check(names.length >= 2, `there are ${names.length} themes to dress it in`);
  check(names[0] === "Standard", `number 0 is the way back (${names[0]})`);
  const beforeWear = styleData(h1);
  check(w.kspage_web_wear_theme(1) === 1,
    `it can be dressed in the theme "${names[1]}"`);
  const afterWear = styleData(h1);
  check(afterWear.color !== undefined && afterWear.color !== beforeWear.color,
    "the heading's characters' colour is swapped");
  check(beforeWear.family === undefined && afterWear.family !== undefined,
    "the typeface's name that was not written goes in");
  // **The sizes do not move.**
  check(near(afterWear.size_px, beforeWear.size_px), `the sizes do not move (${afterWear.size_px})`);
  // **It has to go back whole on one undo.**
  check(w.kspage_web_undo() === 1, "it goes back in one step");
  const backWear = styleData(h1);
  check(backWear.color === beforeWear.color, "the colour returns to what it was");
  check(backWear.family === beforeWear.family, "the typeface's name returns too");
  check(w.kspage_web_wear_theme(1) === 1, "it can be dressed again");
  check(w.kspage_web_wear_theme(1) === 0,
    "dressing it in the same theme again piles nothing up");
  check(w.kspage_web_wear_theme(names.length) === 0,
    "a number that is not there does not dress it");
  check(w.kspage_web_undo() === 1, "what was dressed goes back in one step");

  // --- Whether it goes into the row of chapters ---
  //
  // **Being a heading and being a chapter are two things** (a title page, the contents, a
  // colophon).
  // Caution: **Do not settle it by making the depth 0** — 0 is "not a heading", so it would go
  // from the map of headings too.
  const headAt = styleNames().indexOf("heading");
  check(headAt >= 0, "the material has the heading's style");
  if (headAt >= 0) {
    check(styleData(headAt).in_chapters === undefined,
      "by default it goes into the row of chapters");
    const before = w.kspage_web_heading_count();
    check(before > 0, `there are headings (${before})`);
    // It counts the headings the contents on the page point at.
    // Caution: **Draw them from the line's height** (the contents' box points at no text), down
    // the whole page, as a press can land anywhere.
    const listedInContents = () => {
      w.kspage_web_layout(300);
      const seen = [];
      for (let y = 0; y < w.kspage_web_height(); y += 2) {
        const h = w.kspage_web_contents_hit(y);
        if (h >= 0 && seen.indexOf(h) < 0) seen.push(h);
      }
      return seen;
    };
    // Caution: **Insert the contents oneself** (the material has none, and "0" passes unchecked).
    // **Come out of the cell before inserting**; where the earlier section left the cursor is not
    // counted on.
    w.kspage_web_layout(300);
    w.kspage_web_click(4, 4, 0);
    check(w.kspage_web_insert_gathered(stage("contents\tcontents")) !== 0,
      "the contents can be inserted");
    const was = listedInContents();
    check(was.length > 0, `the contents line the headings up (${was.length})`);
    check(change(headAt, { in_chapters: false }) !== 0,
      "it can be taken out of the row of chapters");
    check(styleData(headAt).in_chapters === false, "that it was taken out can be read");
    // **It must not go from the map** (there would be no way of flying there).
    check(w.kspage_web_heading_count() === before,
      "taken out, it stays in the map of headings");
    // **It has to go from the contents on the page** (that is what was asked for).
    check(listedInContents().length < was.length,
      "taken out, it goes from the contents on the page");
    check(change(headAt, { in_chapters: undefined }) !== 0,
      "it can be put back into the row of chapters");
    check(listedInContents().length === was.length,
      "put back, it lines up in the contents again");
  }
}
