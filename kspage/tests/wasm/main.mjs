// Runs kspage built as wasm and makes sure of placing and editing at the wasm boundary. **What
// comes out on the canvas is not looked at**; placing and editing themselves are the golden tests'
// beside this folder (`tests/*_test.kspls`, which `make test` runs).
// **Each part is given its own body and its own document.** On a document the previous part left
// behind, a failure cannot tell whether the decision took effect or the document differed. **So do
// not let the order carry meaning.**
// Caution: **Do not use the document at startup as material** (the reason is at the head of
// `material.mjs`, which assembles it). **A part names its own document, so forgetting to name is
// felled here** (a decision merely written down is not kept).
// Usage: node tests/wasm/main.mjs <kspage.wasm> (`make test-wasm` in `kspage/Makefile`)
import fs from "fs";
import { check, inPart, opener, score } from "./shell.mjs";
import * as place from "./place.mjs";
import * as store from "./store.mjs";
import * as table from "./table.mjs";
import * as paper from "./paper.mjs";
import * as style from "./style.mjs";
import * as span from "./span.mjs";
import * as shape from "./shape.mjs";
import * as edit from "./edit.mjs";
import * as diff from "./diff.mjs";
import * as source from "./source.mjs";

const wasm = fs.readFileSync(process.argv[2]);

// **No entry point too many goes outward.** The text's `#export` settles them and no list is held
// by hand (`kspage/Makefile`; a held list lets a missed line pass in silence), so "has an internal
// function come out too" is looked at here.
// `memory` is the linker's. `memcmp` is a std function carrying `#export` (on a target with no
// libc, the call the compiler itself puts out wants that name), so it comes out outward as well.
const linkerMade = ["memory"];
const cNamed = ["memcmp"];
const outward = WebAssembly.Module.exports(new WebAssembly.Module(wasm)).map((one) => one.name);
const stray = outward.filter((name) => !name.startsWith("kspage_web_") &&
  !linkerMade.includes(name) && !cNamed.includes(name));
check(stray.length === 0, `only entry points carrying #export go outward (${stray.join(" ")})`);
const entryPoints = outward.length - linkerMade.length - cNamed.length;
check(entryPoints > 100, `there are ${entryPoints} entry points to call from JS (#export settles them)`);

// How it refuses when asked about outside the range.
// Caution: **Refuse without falling.** The screen's side sends a number past the placed count, or
// -1, and **on wasm, falling on a run-time check is an infinite loop** ("Conditions that stop
// execution at run time" in `../../../docs/SPEC-language.md`): the screen freezes and the draft is
// lost. **The subscript's type is signed**, so refuse the negative side too. **Before placing is
// the same** (there is no page until the first `kspage_web_layout`).
inPart("edge");
const edge = await (opener(wasm))();
check(edge.w.kspage_web_height() === 0, "the height before placing is 0");
check(edge.geom(0).every((v) => v === 0), "the box before placing is a row of 0");
check(edge.w.kspage_web_box_text_len(0) === 0, "the box's text before placing is empty");
const placed = edge.w.kspage_web_layout(300);
check(edge.geom(placed).every((v) => v === 0), `a box past the placed count is 0s (no ${placed})`);
check(edge.geom(-1).every((v) => v === 0), "box no -1 is a row of 0 as well");
check(edge.w.kspage_web_box_text_len(placed) === 0 && edge.w.kspage_web_box_text_len(-1) === 0,
  "the text outside the range is empty");
check(edge.w.kspage_web_box_family_len(placed) === 0, "the typeface name outside is empty too");
check(edge.w.kspage_web_selection_count() === 0, "with nothing chosen there are 0 rectangles");

// One body is raised per part, and the document that part named is read and handed over; a part
// that connects raises a second itself, so the entry point to raise is handed over too.
// Caution: **Do not let a part that does not name `opens` through.** It would run on the sample at
// startup and fall the day the sample has a paragraph changed. Only the part that looks at the
// sample itself names `null`.
const open = opener(wasm);
// The key is the label (give it a separate writing and it drifts from the name being read).
for (const [name, part] of Object.entries({ place, store, table, paper, style, span, shape, edit,
  diff, source })) {
  inPart(name);
  console.log(`# ${part.subject}`);
  const ks = await open();
  if (!("opens" in part)) {
    check(false, `${part.subject} does not name the document it reads`);
    continue;
  }
  if (part.opens !== null) {
    check(ks.load(part.opens) === 1, `${part.subject}'s material can be read`);
    ks.w.kspage_web_layout(300);
  }
  await part.run(ks, open);
}

console.log(score.failed === 0 ? "RESULT: ALL PASS" : `RESULT: ${score.failed} FAILED`);
process.exit(score.failed === 0 ? 0 : 1);
