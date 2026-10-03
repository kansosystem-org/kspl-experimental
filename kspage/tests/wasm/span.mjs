import { check, near } from "./shell.mjs";
import { material, para } from "./material.mjs";

export const subject = "The decoration laid on what is chosen, and the link and the line.";

// The head of what it is laid on.
// Caution: **Make the material and the text hunted for one name.** Written apart, the day one
// character of the material is changed only "the box is there" falls — and reading the fallen side
// does not tell what broke.
// **Keep it narrower than the width laid out** (300 here). `find` matches a box's text
// whole, so a run wide enough to break over two lines is two boxes and is found by nothing — it
// really was so, and the fallen side said "the box is there" while the box was there twice over.
const lead = "Prose, tables and slides ";
const tail = ").";

// The names of the styles.
// **One name here too.** A style's name is written three times over (the sheet, the run
// that wears it, and what is hunted for), so written apart, renaming one leaves `find` hunting for
// what is nowhere and `indexOf` handing back -1 — and the check falls saying "the material has no
// such style", which tells nothing about the rename.
// These four are the document's own names, defined by `kspage/content`'s sample, so they stay
// as they are until that side moves. The `decoration-` names below are built by the core out of the
// specification handed in, so they move with the core and not with this file.
const bodyStyle = "body";
const boldStyle = "strong";
const underStyle = "underline";
const strikeStyle = "strikethrough";

// What it is laid on.
// Caution: **Split the first paragraph into two runs or more.** Written as one run, the only way
// taken is the one where the run splits at the place laid on (the way where the original run is
// left to the left and the right of that place is missed).
// **Put in both a style that carries a line and a paragraph's style that carries none.**
// That a run's specification beats the paragraph's, and that a paragraph's specification puts the
// line out, are seen only when both are there.
export const opens = material({
  styles: [
    { name: bodyStyle, space_after: 12.0 },
    { name: boldStyle, weight: 700 },
    { name: underStyle, underline: true },
    { name: strikeStyle, strike: true },
  ],
  blocks: [
    para(bodyStyle, lead, ["all in one document", boldStyle],
      " — the system for editing them."),
    para(bodyStyle, "A line of decoration is a style too (", [underStyle, underStyle], " and ",
      [strikeStyle, strikeStyle], tail),
  ],
});

export function run(ks) {
  const { w, scratch, read, out, stage, geom, boxOf, find, save, html, styleNames } = ks;

  // --- Laying a decoration on what is chosen ---
  // **Do not have a run carry a colour directly.** The style's name is built out of the
  // specification and then laid on, so the mapping onto `class` does not break in the HTML
  // written out either.
  const wasStyleCount = w.kspage_web_style_count();
  w.kspage_web_layout(300);
  const at = find(lead);
  check(at >= 0, "the body's box is there");
  const leadAt = geom(at);
  w.kspage_web_click(leadAt[0] + 1, leadAt[1] + 1, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  check(w.kspage_web_paint_span(1, 0xff0000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) === 1,
    "a decoration can be laid on what is chosen");
  check(w.kspage_web_style_count() === wasStyleCount + 1, "the styles grow by one");
  check(styleNames().includes("decoration-cff0000"),
    `the name is built out of the specification (${styleNames().slice(-1)})`);
  // Laid on again with the same specification, it does not grow.
  w.kspage_web_layout(300);
  w.kspage_web_click(leadAt[0] + 30, leadAt[1] + 1, 0);
  w.kspage_web_move(1, 1);
  check(w.kspage_web_paint_span(1, 0xff0000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) === 1,
    "it can be laid on again");
  check(w.kspage_web_style_count() === wasStyleCount + 1,
    "the same specification does not grow the styles");
  // The colour reaches the box. **Do not hunt by text** (the run splits at the place laid on, so
  // the text is shorter than it was).
  const litCount = w.kspage_web_layout(300);
  let litBoxes = 0;
  for (let i = 0; i < litCount; i += 1) {
    if (boxOf(i)[8] === 1 && boxOf(i)[9] === 0xff0000) litBoxes += 1;
  }
  check(litBoxes > 0, `the colour reaches the boxes laid on (${litBoxes})`);
  // Bold and italic go on through the same entry point. **The weight changes the measures**, so it
  // has to reach the box's weight as well.
  const spanOf = () => {
    w.kspage_web_span_ink(scratch);
    return read(12);
  };
  w.kspage_web_layout(300);
  w.kspage_web_click(leadAt[0] + 1, leadAt[1] + 1, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  check(w.kspage_web_paint_span(0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0) === 1, "bold can be laid on");
  check(styleNames().includes("decoration-w1"),
    `the name lines the weight's field up too (${styleNames().slice(-1)})`);
  check(spanOf()[8] === 1 && spanOf()[9] === 1, "the bold laid on can be read back");
  const heavy = w.kspage_web_layout(300);
  let bolds = 0;
  for (let i = 0; i < heavy; i += 1) {
    if (boxOf(i)[5] >= 700) bolds += 1;
  }
  check(bolds > 0, `the boxes laid on turn heavy (${bolds})`);
  // "Do not make it bold" is a specification too (it becomes a name apart from no specification).
  w.kspage_web_click(leadAt[0] + 1, leadAt[1] + 1, 0);
  w.kspage_web_move(1, 1);
  check(w.kspage_web_paint_span(0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0) === 1,
    "\"do not make it bold\" can be laid on");
  check(styleNames().includes("decoration-w0"), "the not-so side has a name of its own");
  check(spanOf()[8] === 1 && spanOf()[9] === 0, "the not-so specification can be read back");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);

  // One laying-on goes back in one undo.
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(w.kspage_web_style_count() === wasStyleCount,
    "in two steps the table of styles returns to what it was");
  check(find(lead) >= 0, "the runs gather back too");

  // --- The link ---
  // **The run carries where the link goes, the style carries how it looks.** Mixed, only the
  // links pointing at the same place come to share a style (or else taking the decoration off
  // takes the link with it).
  const setHref = (s) => w.kspage_web_set_href(stage(s));
  const hrefNow = () => out(w.kspage_web_href());
  w.kspage_web_layout(300);
  const linkLead = geom(find(lead));
  w.kspage_web_click(linkLead[0] + 1, linkLead[1] + 1, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  check(setHref("https://example.com/") === 1, "what is chosen can be made a link");
  check(hrefNow() === "https://example.com/", "where the link goes can be read back");
  check(styleNames().includes("decoration-c0000ee-u1"), "how it looks is a decoration's style");
  // **Draw the link at the place pressed, without reaching around it.** Reaching around makes a
  // press on the margin alone fly off.
  const linkedAt = w.kspage_web_layout(300);
  let linkBox = -1;
  for (let i = 0; i < linkedAt; i += 1) {
    if (boxOf(i)[8] === 1 && boxOf(i)[9] === 0x0000ee) linkBox = i;
  }
  check(linkBox >= 0, "the link's box is there");
  const linkGeom = geom(linkBox);
  check(out(w.kspage_web_href_at(linkGeom[0] + 1, linkGeom[1] + 1))
    === "https://example.com/", "on the box, where the link goes can be drawn");
  check(w.kspage_web_href_at(linkGeom[0] - 50, linkGeom[1] - 50) === 0,
    "outside it nothing can be drawn");
  // It goes into both the text written out and the HTML.
  check(save().includes("\"href\": \"https://example.com/\""),
    "where the link goes goes into the text written out");
  check(html().includes("<a href=\"https://example.com/\">"),
    "in the HTML written out it becomes an a");
  // Taken off, both where it goes and how it looks return.
  check(setHref("") === 1, "the link can be taken off");
  check(hrefNow() === "", "where the link goes is gone");
  w.kspage_web_undo();
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(hrefNow() === "", "in two steps it returns to before it was laid on");

  // --- The underline and the strike-through ---
  // **It has to reach the box.** Into the style but not passed to the box, and the canvas
  // draws no line.
  // What comes to the box is a resolved 0 or 1 ("no specification" is not drawing).
  const decorOf = (i) => {
    w.kspage_web_style_decor(i, scratch);
    return read(4);
  };
  const underAt = styleNames().indexOf(underStyle);
  check(underAt >= 0, "the material has the underline's style");
  const bodyAt = styleNames().indexOf(bodyStyle);
  check(bodyAt >= 0, "the material has the body's style");
  const lined = decorOf(underAt);
  check(lined[0] === 1 && lined[1] === 1, "the underline's specification can be read");
  check(lined[2] === 0, "the strike-through carries no specification");
  w.kspage_web_layout(300);
  const linedBox = find(underStyle);
  check(linedBox >= 0, "the box the underline was laid on is there");
  check(boxOf(linedBox)[12] === 1, "the underline reaches the box");
  check(boxOf(linedBox)[13] === 0, "a line not laid on is 0");
  // **"Do not draw" is one of the specifications.** Make 0 the mark of no specification and the
  // parent's line cannot be put out.
  check(w.kspage_web_set_style_decor(bodyAt, 1, 0, 1, 1) === 1,
    "a line's specification can be laid on the paragraph");
  const off = decorOf(bodyAt);
  check(off[0] === 1 && off[1] === 0, "\"do not draw the underline\" can be read back");
  check(off[2] === 1 && off[3] === 1, "the strike-through is drawn");
  w.kspage_web_layout(300);
  // The paragraph says "do not draw", so only the run the underline was laid on carries one.
  check(boxOf(linedBox)[12] === 1, "the run's specification beats the paragraph's");
  check(boxOf(find(tail))[12] === 0, "the paragraph's specification puts the underline out");
  check(boxOf(find(tail))[13] === 1, "the strike-through is inherited from the paragraph");
  // A line does not change the measures (it is not put into the typeface, so the width and the
  // height are the same).
  const wasWidth = boxOf(linedBox)[2];
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(decorOf(bodyAt)[0] === 0, "in one step the line's specification is gone");
  check(near(boxOf(linedBox)[2], wasWidth), "putting the line out does not change the width");
  check(html().includes("text-decoration-line: underline"),
    "the line goes into the HTML written out too");
}
