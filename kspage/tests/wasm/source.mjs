import { check } from "./shell.mjs";
import { material, para } from "./material.mjs";

export const subject = "The entry point that points from a document at a source.";

// What it ties to a source.
// Caution: **Make the first block a body holding text** — what is chosen is
// what gets tied, so a place for the cursor to stand and a text that can be chosen are both
// needed.
// The source it is tied to is carried by `src` below, not by the document.
//
// The style names (`heading`, `body`) are the document's own, defined by `kspage/content`'s
// sample, so they stay as they are until that side moves.
export const opens = material({
  styles: [
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0 },
    { name: "body", space_after: 12.0 },
  ],
  blocks: [
    para("body", "Typed here, tied into the source."),
    para("heading", "Reading back what it points at"),
  ],
});

// The name of the style the window and the pulls figure wear. **The page settles it, not the
// core** (`port/web/source.js` hands these very two in), so this side speaks its words.
// **The `-line` on the line's style is the core's.** It is built out of the box's name by
// `kspage/model/paint.kspls`'s `pull_line_name`, so it moves when that side moves and not with this
// file.
const windowStyle = "window";
const pullsStyle = "pulls";

// The name of the document the constants are made from.
// Caution: **One name for it.** Making them,
// asking whether they are stale, and hunting inside what was made all speak this name, so written
// apart, renaming it leaves the asking looking up a document that is nowhere — and "there is
// nothing to compare against" comes back, which is also the honest answer before anything is
// handed over.
const docName = "the sample document";
const constsFile = "settle.kspl";

export function run(ks) {
  const { w, read, out, stage, feed, type, geom, textOf, save, load, scratch } = ks;

  // The text handed over (a shaped sample of KSPL).
  // Caution: **The columns have to be the real
  // thing's** (what it cuts by is the column).
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

  const fileOf = () => out(w.kspage_web_source_aim(0));
  const nameOf = () => out(w.kspage_web_source_aim(1));

  // --- While it points at nothing, nothing comes out ---
  // **Press before looking.** The cursor points nowhere.
  w.kspage_web_layout(300);
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_source_aim(0) === 0, "pointing at no source it is 0");

  // --- Tying what is chosen to a source ---
  type("kanso");
  w.kspage_web_layout(300);
  check(w.kspage_web_link_source(stage("kspage/model/doc.kspls\tInline.text")) === 1,
    "what is chosen can be tied to a source");
  check(fileOf() === "kspage/model/doc.kspls", `the file's name comes out (${fileOf()})`);
  check(nameOf() === "Inline.text", `the symbol's name comes out (${nameOf()})`);
  // **Where it goes is the same field as an ordinary link's** (it does not carry two fields).
  check(out(w.kspage_web_href()) === "src:kspage/model/doc.kspls#Inline.text",
    "where it goes is one text opening with `src:`");
  // Write no symbol and it is the whole file.
  check(w.kspage_web_link_source(stage("kspage/share/store.kspls\t")) === 1,
    "the symbol may be empty");
  check(nameOf() === "", "with the symbol empty it is empty");
  check(fileOf() === "kspage/share/store.kspls", "it becomes the file's name alone");
  // **With no file name it does not tie.**
  check(w.kspage_web_link_source(stage("\tInline.text")) === 0,
    "with no file name it is refused");
  check(w.kspage_web_link_source(0) === 0, "empty is refused too");

  // --- An ordinary link is not a source ---
  check(w.kspage_web_set_href(stage("https://example.com/")) === 1,
    "an ordinary link goes on too");
  check(w.kspage_web_source_aim(0) === 0, "an ordinary link points at no source");
  check(out(w.kspage_web_href()) === "https://example.com/", "where it goes stays as it was");

  // --- It can be drawn from the place pressed ---
  check(w.kspage_web_link_source(stage("a/b.kspl\tAim.empty")) === 1, "it can be tied again");
  w.kspage_web_layout(300);
  const box = geom(0);
  const at = w.kspage_web_source_at(box[0] + 2, box[1] + box[3] / 2, 0);
  check(at > 0 && out(at) === "a/b.kspl",
    `it can be drawn from the place pressed too (${out(at)})`);
  check(w.kspage_web_source_at(-50, -50, 0) === 0, "press outside it and it is 0");

  // --- Where the symbol sits inside the text handed over ---
  // Caution: **Lay the text down first** (taking memory grows the memory, so the typing arena's
  // place has to be asked for afresh).
  const spot = (name) => {
    const len = feed(src);
    const nameLen = stage(name);
    const found = w.kspage_web_source_spot(len, nameLen, scratch);
    const [at2, wide, line] = read(3);
    return { found: found === 1, at: at2, len: wide, line: line };
  };
  const struct = spot("Aim");
  check(struct.found, "the struct is found");
  check(struct.line === 3, `it says which line it starts from (line ${struct.line})`);
  const bytes = new TextEncoder().encode(src);
  const text = (got) => new TextDecoder().decode(bytes.slice(got.at, got.at + got.len));
  check(text(struct).startsWith("pub struct Aim {"), "it starts at the line that declares it");
  check(text(struct).endsWith("}"), "it ends at the closing on the same column");
  check(text(struct).indexOf("impl Aim") < 0, "the next declaration does not go in");

  const method = spot("Aim.empty");
  check(method.found, "a function inside an impl is found too");
  check(text(method).startsWith("  pub fn empty("),
    "it starts at the declaring line on column 2");

  // Caution: **Say "there is none" for a name that is not there** (return empty and nobody notices
  // that the symbol is gone).
  const gone = spot("nowhere");
  check(!gone.found, "a name that is not there is not found");
  check(gone.at === 0 && gone.len === 0 && gone.line === 0, "the numbers are 0 as well");
  // With the name empty it is the whole file.
  const whole = spot("");
  check(whole.found && whole.at === 0 && whole.len === bytes.length,
    "with the name empty it is the whole of it");

  // --- The window (it borrows the text of the symbol pointed at on every placing) ---
  //
  // **The text does not go into the document** (that it does not come out in the saving is what
  // is looked at). **Do not leave it empty while nothing has been handed over, either.**
  const handSource = (name, text) => {
    const len = feed(text);
    const nameLen = stage(name);
    return w.kspage_web_hand_source(nameLen, len);
  };
  // It inserts one window.
  w.kspage_web_click(0, 10, 0);
  check(w.kspage_web_insert_window(stage(windowStyle + "\taim.kspl\tAim.empty")) === 1,
    "a window can be inserted");
  // **A link goes into the same row** (count the three apart and the looking-over sees one side
  // only).
  const aimAt = (want) => {
    for (let i = 0; i < w.kspage_web_aim_count(); i += 1) {
      if (out(w.kspage_web_aim(i, 0)) === want) return i;
    }
    return -1;
  };
  check(w.kspage_web_aim_count() >= 2,
    `what it points at can be counted (${w.kspage_web_aim_count()}, the window and the link both)`);
  const win = aimAt("aim.kspl");
  check(win >= 0, "the file the window points at can be asked for");
  // **While nothing has been handed over it is "not handed over yet"** (tell it apart from "the
  // symbol is not there").
  check(w.kspage_web_aim_state(win) === 0, "before handing over it is \"not handed over yet\"");
  check(out(w.kspage_web_aim(win, 1)) === "Aim.empty",
    "the symbol the window points at can be asked for too");
  check(w.kspage_web_aim(99, 0) === 0, "a number that is not there is 0");

  // Before handing over, the text of what it points at comes out. **It is not left empty.**
  w.kspage_web_layout(400);
  const shownAt = (want) => {
    for (let i = 0; i < w.kspage_web_layout(400); i += 1) {
      if (textOf(i).indexOf(want) >= 0) return i;
    }
    return -1;
  };
  check(shownAt("src:aim.kspl#Aim.empty") >= 0,
    "before handing over, the text of what it points at comes out");

  // Handed over, that symbol's text comes out.
  check(handSource("aim.kspl", src) === 1, "the source can be handed over");
  check(shownAt("pub fn empty(") >= 0, "handed over, that symbol's text comes out");
  check(w.kspage_web_aim_state(aimAt("aim.kspl")) === 1, "handed over it becomes \"found\"");
  check(shownAt("pub struct Aim") < 0, "no other symbol comes out");
  // **The text does not go into the saving.**
  const kept = save();
  check(kept.indexOf("pub fn empty(") < 0, "the text borrowed does not go into the saving");
  check(kept.indexOf("src:aim.kspl#Aim.empty") >= 0, "what it points at goes into the saving");
  // **Handed over again it is swapped out** (piled up, the older text is found first).
  check(handSource("aim.kspl", src.replace("r.file.len <= 0", "r.file.len <= 1")) === 1,
    "the same name can be handed over again");
  check(shownAt("r.file.len <= 1") >= 0, "the text changed comes out on the next placing");
  // Caution: **Say "the symbol is not there" once the symbol is gone** (tell it apart from
  // forgetting to hand it over — the way to fix the two is the exact opposite).
  check(handSource("aim.kspl", src.replace("pub fn empty(", "pub fn gone(")) === 1,
    "a text with the symbol renamed can be handed over");
  check(w.kspage_web_aim_state(aimAt("aim.kspl")) === 2,
    "renamed, it becomes \"the symbol is not there\"");
  check(handSource("aim.kspl", src) === 1, "it can be put back to the original text");

  // Forgotten, it returns to the text of what it points at.
  w.kspage_web_drop_sources();
  check(shownAt("src:aim.kspl#Aim.empty") >= 0,
    "forgotten, it returns to the text of what it points at");
  check(w.kspage_web_undo() !== 0, "a window inserted goes back in one step");

  // --- The pulls figure (it assembles what is pulled in on every placing) ---
  //
  // **Neither the boxes nor the lines go into the document** (that they do not come out in the
  // saving is what is looked at).
  const pulls = [
    "import \"std/io\";",
    "import \"std/ds\" { List };",
    "import \"std/io\" as _io;",
    "fn main() {}",
  ].join("\n");
  check(w.kspage_web_insert_pulls(stage(pullsStyle + "\tpulls.kspl")) === 1,
    "a pulls figure can be inserted");
  check(handSource("pulls.kspl", pulls) === 1, "that file can be handed over");
  w.kspage_web_layout(600);
  check(shownAt("std/io") >= 0, "what is pulled in comes out in a box");
  // **Do not draw the same one twice** (however many ways of pulling are written, the
  // pulling between the two is one).
  let twice = 0;
  for (let i = 0; i < w.kspage_web_layout(600); i += 1) {
    if (textOf(i) === "std/io") twice += 1;
  }
  check(twice === 1, `the same one is there once only (${twice})`);
  const drawn = save();
  check(drawn.indexOf("std/ds") < 0, "the boxes assembled do not go into the saving");
  check(drawn.indexOf("src:pulls.kspl") >= 0, "what it points at goes into the saving");
  // **Two styles come of it** (the box and its lines). The line's name is built out of the box's.
  const styles = [];
  for (let i = 0; i < w.kspage_web_style_count(); i += 1) {
    styles.push(out(w.kspage_web_style_name(i)));
  }
  check(styles.indexOf(pullsStyle) >= 0 && styles.indexOf(pullsStyle + "-line") >= 0,
    "two styles come of it, the box's and the line's");
  check(w.kspage_web_undo() !== 0, "a figure inserted goes back in one step too");

  // --- Making the text of constants out of a table (the one bearing of "document to source") ---
  //
  // **Do not silence the rows refused** (a row whose text cannot be a name does not go
  // into what is made).
  // **Unless the style arranges as `grid` it does not become a cell** (not a cell, and
  // which table it sits in is not settled either).
  const table = "{\"kspage\":6,\"sheet\":{\"styles\":[{\"name\":\"table\"," +
    "\"arrange\":\"grid\"}]},\"blocks\":[{\"style\":\"table\"," +
    `"aim":"src:${constsFile}","children":[` +
    "{\"style\":\"row\",\"children\":[{\"style\":\"cell\",\"inlines\":[{\"text\":\"Name\"}]}," +
    "{\"style\":\"cell\",\"inlines\":[{\"text\":\"Value\"}]}]}," +
    "{\"style\":\"row\",\"children\":[{\"style\":\"cell\",\"inlines\":[{\"text\":\"greeting\"}]}," +
    "{\"style\":\"cell\",\"inlines\":[{\"text\":\"Hello\"}]}]}," +
    "{\"style\":\"row\",\"children\":[{\"style\":\"cell\",\"inlines\":[{\"text\":\"2nd\"}]}," +
    "{\"style\":\"cell\",\"inlines\":[{\"text\":\"no good\"}]}]}]}]}";
  check(load(table) === 1, "a document holding a table can be read");
  w.kspage_web_layout(400);
  // **Press inside a cell** (which table it sits in is not known until it is placed).
  const cell = ks.find("greeting");
  check(cell >= 0, "the cell can be hunted for");
  w.kspage_web_click(ks.geom(cell)[0] + 2, ks.geom(cell)[1] + 2, 0);
  const wrote = w.kspage_web_consts(stage(docName), scratch);
  const [rows, refused] = read(2);
  check(wrote > 0 && rows === 1, `only a row that can be a name becomes a constant (${rows})`);
  check(refused === 1, `a row that cannot be a name is said by number (${refused})`);
  const made = out(wrote);
  // Note: The banner is written by the core (`kspage/share/consts.kspls`), so this needle stays as it
  // is until that side moves.
  check(made.indexOf("This text is what was made") >= 0,
    "the mark of where it came from goes in");
  check(made.indexOf(docName) >= 0, "which document it came from goes in");
  // What is made is the default notation, so a `pub const` line closes on the newline
  // (`kspage/share/consts.kspls`). Look for a `;` at the tail and this check comes to nothing.
  check(made.indexOf("pub const greeting: U8[] = \"Hello\"\n") >= 0, "the constant comes out");
  check(made.indexOf("2nd") < 0, "the row refused does not go in");
  // Caution: **There has to be a way of looking at how fresh what was made is.** While nothing has
  // been handed over there is nothing to compare against.
  check(w.kspage_web_consts_stale(stage(docName)) === 0,
    "before handing over there is nothing to compare against");
  check(handSource(constsFile, made) === 1, "the text made can be handed over as it stands");
  check(w.kspage_web_consts_stale(stage(docName)) === 1,
    "the same as the text handed over, it is \"the same\"");
  check(handSource(constsFile, "// an older text\n") === 1, "an older text can be handed over");
  check(w.kspage_web_consts_stale(stage(docName)) === 2, "at odds, it is \"different\"");
  w.kspage_web_drop_sources();
}
