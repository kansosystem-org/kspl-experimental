import { check, near } from "./shell.mjs";
import { material, para, grid } from "./material.mjs";

export const subject = "Taking a document in and out, and writing it out as HTML.";

// What it takes in and out.
// Caution: **Give it one of everything that comes out in the HTML's mapping** (a grid, a cell, a
// named run, a sized style, a formula), or the one missed breaks with nobody looking. **Make the
// first block a paragraph holding text** (box 0). **Give the formula a style that shapes it**, so
// "$360" shows the value came out, not the formula.
//
// The style names (`heading`, `body`, `strong`, `table`, `cell`, `amount`) and the amount's
// money sign (`$`) are the document's own, defined by `kspage/content`'s sample, so they stay as
// they are until that side moves (the HTML needles below hold the same names).
export const opens = material({
  styles: [
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0 },
    { name: "body", space_after: 12.0 },
    { name: "strong", weight: 700 },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
    { name: "amount", places: 0, grouped: true, prefix: "$", pad: 4.0 },
  ],
  blocks: [
    para("body", "It is the first paragraph. ", ["Here it is stressed", "strong"], "."),
    para("heading", "It is a heading."),
    grid("table",
      [para("cell", "Qty"), para("cell", "Price"), para("cell", "Amount")],
      [para("cell", "3"), para("cell", "120"), para("cell", ["=A2*B2", "amount"])]),
  ],
});

export function run(ks) {
  const { w, textOf, type, save, html, load, out, stage, measured, vmetrics } = ks;

  // --- A blank document ---
  //
  // Caution: **It has to be seen where there is no browser too** (`../browser/fresh.js` walks past
  // without one). **Look at one box coming out** — with a block and no run, **a blank cannot be
  // typed on**. **Look at the table of styles too** (else tables and slides pile up as
  // paragraphs). **Look at the earlier document staying too.**
  const wasDocs = w.kspage_web_doc_count();
  check(w.kspage_web_doc_new() >= 0, "one blank document can be opened");
  check(w.kspage_web_doc_count() === wasDocs + 1,
    `the earlier document stays open (${w.kspage_web_doc_count()})`);
  check(w.kspage_web_layout(300) === 1,
    `a blank puts one box out (${w.kspage_web_layout(300)})`);
  check(textOf(0) === "", `that box is empty (${textOf(0)})`);
  const blankStyles = w.kspage_web_style_count();
  check(blankStyles > 0, `a blank carries a table of styles too (${blankStyles})`);
  w.kspage_web_click(1, 4, 0);
  type("a");
  // **Place afresh after typing** (a box is the result of placing).
  w.kspage_web_layout(300);
  check(textOf(0) === "a", `a blank can be typed on as it stands (${textOf(0)})`);
  // Caution: **Put it back where it was** (leaving the document the sections after this look at).
  check(w.kspage_web_doc_drop(w.kspage_web_doc_now()) === 1, "a blank can be shut");
  check(w.kspage_web_doc_count() === wasDocs,
    `shut, it returns to the count it was (${w.kspage_web_doc_count()})`);

  // --- Taking it in and out ---
  // **A text crosses the boundary as a pointer and a length** (the entry points are shell.mjs's).
  type("Y");
  w.kspage_web_layout(300);
  const typed = textOf(0);
  const written = save();
  check(written.indexOf("\"kspage\": 6") >= 0, "the version goes into the text");
  check(written.indexOf(typed) >= 0, "what was typed goes into the text");

  // Another text can be read and then this one put back.
  check(load("{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"a document from elsewhere\"}]}]}") === 1,
    "where it could be read it returns 1");
  w.kspage_web_layout(300);
  check(textOf(0) === "a document from elsewhere",
    `it swaps to the document read (${textOf(0)})`);

  check(load(written) === 1, "the text written out can be read back");
  w.kspage_web_layout(300);
  check(textOf(0) === typed, `read back it returns to the original text (${textOf(0)})`);
  check(save() === written, "read back and written again it is the same text");

  // It can be typed on after being read back too (the field for editing is remade).
  w.kspage_web_click(0, 10, 0);
  type("Z");
  w.kspage_web_layout(300);
  check(textOf(0) === "Z" + typed, `a document read back can be typed on (${textOf(0)})`);

  // An unreadable text is refused, and the document now does not move.
  check(load("{ broken") === 0, "an unreadable text returns 0");
  check(load("{\"kspage\":99,\"blocks\":[]}") === 0, "a version it does not know returns 0 too");
  w.kspage_web_layout(300);
  check(textOf(0) === "Z" + typed, "where it refused, the document now does not move");

  // --- However many times it is repeated, what is taken does not pile up ---
  // **Taking is from a free list over a static arena** (wasm has no malloc). Placing or writing
  // out on the document's arena would pile up on every keystroke until the memory is used up, so
  // it is looked at by repeating and not falling.
  const wasSteady = w.kspage_web_layout(300);
  for (let i = 0; i < 300; i += 1) {
    w.kspage_web_layout(300);
    w.kspage_web_save();
    w.kspage_web_html();
  }
  check(w.kspage_web_layout(300) === wasSteady,
    "placed afresh hundreds of times the same answer comes out");

  // --- Writing it out as HTML ---
  // **It uses the same arena over again** (the next writing out ends the earlier one).
  const page = html();
  check(page.indexOf("<!doctype html>") === 0, "it becomes one HTML that opens as it stands");
  check(page.indexOf("<table class=\"table\">") >= 0, "a grid's style becomes a table");
  check(page.indexOf("<td class=\"cell\">") >= 0, "a cell becomes a td");
  check(page.indexOf("<span class=\"strong\">") >= 0, "a run carrying a name becomes a span");
  check(page.indexOf(".heading { font-size: 28px;") >= 0,
    "a style's name becomes a rule in the CSS");
  // What comes out in the writing is the value, not the formula.
  check(page.indexOf("=A2*B2") < 0 && page.indexOf(">$360<") >= 0,
    "the HTML written out holds the value and not the formula");
  check(save() !== page, "the writing out and the saving are different texts");

  // --- The number that points at the same thing, and the mark of where it came from ---
  // **It is not the core that makes the mark** (no clock nor die); this test plays the page side.
  const marked = load("{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"a\"}]},{\"style\":\"body\",\"inlines\":[{\"text\":\"b\"}]}]}");
  check(marked === 1, "a text carrying neither number nor mark can be read");
  check(out(w.kspage_web_origin()) === "", "in a document carrying no mark it is empty");
  check(w.kspage_web_set_origin(stage("amark")) === 1, "a mark can be put in");
  check(out(w.kspage_web_origin()) === "amark", "the mark put in comes back");
  // **A mark that is there is not written over** (else each opening calls it another document).
  check(w.kspage_web_set_origin(stage("bmark")) === 0, "a mark that is there is not written over");
  check(out(w.kspage_web_origin()) === "amark", "where it refused the mark does not move");

  const numbered = save();
  check(numbered.indexOf("\"origin\": \"amark\"") >= 0, "the mark goes into the text");
  // Caution: **Do not hunt for it packed** (the saved shape is one value to a line, with one space
  // behind the key).
  check(numbered.indexOf("\"id\": ") >= 0, "the number goes into the text");
  check(numbered.indexOf("\"next_id\": ") >= 0, "the next number goes into the text");
  // **Saved again the numbers do not move** (this is where Word breaks).
  w.kspage_web_layout(300);
  check(save() === numbered, "placed afresh or saved afresh the text is the same");
  check(load(numbered) === 1, "a text carrying numbers can be read back");
  check(out(w.kspage_web_origin()) === "amark", "read back the mark comes back too");
  check(save() === numbered,
    "read back and written again it is the same text, numbers and all");

  // --- A document that does not fit is refused ---
  //
  // Caution: **Refuse rather than fall** — memory used up stops the wasm and freezes the screen,
  // and what was being written goes. **Look at the document now staying when it is refused too.**
  // The ceiling is the core's (`kspage_web_doc_limit`). **Hand it just above the ceiling** (a huge
  // text is slow to assemble in JS).
  const limit = w.kspage_web_doc_limit();
  check(limit > 0, `the ceiling for opening comes out (${Math.round(limit / 1024)} KB)`);
  const room = w.kspage_web_heap_room();
  check(room > limit,
    `the arena is the wider of the two (${Math.round(room / 1048576)} MiB)`);
  check(w.kspage_web_heap_used() > 0 && w.kspage_web_heap_used() < room,
    `how much is in use can be read (${Math.round(w.kspage_web_heap_used() / 1048576)} MiB)`);
  const before = save();
  // Caution: **Hand it something right as a text**, or it is refused as "unreadable" instead:
  // right JSON padded with spaces past the ceiling by one byte. **Keep it ASCII** (the ceiling is
  // in bytes, a JS length in UTF-16 units).
  const head = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"big\"}]}]}";
  const padded = head + " ".repeat(limit + 1 - head.length);
  check(load(padded) === 0, "a document past the ceiling is refused");
  w.kspage_web_layout(300);
  check(save() === before, "refused, the document now is still there");
  // **Exactly the ceiling has to pass.**
  check(load(head + " ".repeat(limit - head.length)) === 1,
    "a document of exactly the ceiling can be opened");

  // --- Inside the ceiling too, a document that cannot be placed is refused ---
  //
  // **A ceiling in bytes cannot guard it**: the cost per byte swings with the shape by well over
  // an order of magnitude (a table of empty cells worst), so what refuses is the count of
  // sections (`port/web/state.kspls`'s `room_per_block`).
  // Caution: **Return it apart from "unreadable"** (-1; the two are fixed the opposite way).
  // **Look at the document now staying after it refuses too.**
  const kept = save();
  const rep = (one, n) => new Array(n).fill(one).join(",");
  const cell = '{"children":[{"style":"body","inlines":[{"text":"c"}]}]}';
  const grids = (n) =>
    '{"kspage":6,"sheet":{"styles":[{"name":"grid","arrange":"grid"},{"name":"body"}]},'
    + '"blocks":[' + rep('{"style":"grid","children":[' + rep(cell, 4) + ']}', n) + "]}";
  // Caution: **Hand it just below the ceiling** (past it the byte count refuses instead).
  let many = 100;
  for (;;) {
    if (new TextEncoder().encode(grids(many + 20)).length > limit - 3000) { break; }
    many += 20;
  }
  const dense = grids(many);
  const denseKb = Math.round(new TextEncoder().encode(dense).length / 1024);
  check(new TextEncoder().encode(dense).length <= limit,
    `a table document inside the ceiling was assembled `
      + `(${denseKb} KB / ceiling ${Math.round(limit / 1024)} KB)`);
  check(load(dense) === -1,
    "inside the ceiling too, a document that cannot be placed is refused");
  check(save() === kept,
    "refused as unplaceable, the document now is still there");
  check(w.kspage_web_layout(300) > 0, "it can be placed afresh after being refused too");
  // Caution: **Do not refuse too much** — ordinary documents must pass. **Do not look at a grid
  // and a flow by the same value** (`port/web/state.kspls`'s `room_per_flow` / `room_per_grid`),
  // or **ordinary prose gets a fraction of its ceiling**. So prose of about the table's bytes
  // has to pass.
  const plainOf = (n) => '{"kspage":6,"sheet":{"styles":[{"name":"body"}]},"blocks":['
    + rep('{"style":"body","inlines":[{"text":"It is a document with ordinary paragraphs lined '
      + 'up. Characters are added here to match the length."}]}', n) + "]}";
  // Caution: **Keep it inside the ceiling in bytes** (past it the byte sieve refuses instead).
  let paras = 1000;
  for (;;) {
    if (new TextEncoder().encode(plainOf(paras + 500)).length > limit - 3000) { break; }
    paras += 500;
  }
  const plain = plainOf(paras);
  const plainKb = Math.round(new TextEncoder().encode(plain).length / 1024);
  check(plainKb >= denseKb - 200,
    `prose of about the same size as the table document refused was assembled `
      + `(${plainKb} KB / table ${denseKb} KB)`);
  check(load(plain) === 1,
    `at the same size, prose passes (${plainKb} KB, ${paras} paragraphs)`);
  // What is looked at is that it could be placed (it wraps, so boxes outnumber paragraphs).
  const placed = w.kspage_web_layout(300);
  check(placed >= paras, `a document that passed can be placed (boxes ${placed})`);

  // --- Even with the memory used up, it refuses rather than freezing ---
  //
  // **This is the last net.** **The reading itself** is guarded by the byte ceiling alone (the
  // count of sections is not yet known), and a packed text (`{}` lined up) can eat the arena
  // inside it; a ceiling fit to that worst would cut every ordinary document.
  // **What is looked at is that it does not freeze**: the core's JS entry point throws through
  // the wasm's frame (`shell.mjs`'s `kspage_js_gave_up`); unhanded, it spins in a `for {}`.
  // Caution: **Look at the arena coming back on the clearing up too** (what happens if it does not
  // is in `bridge.kspls`'s `kspage_web_recover` at its head).
  const safe = save();
  const packed = '{"kspage":6,"sheet":{},"blocks":[' + rep("{}", 150000) + "]}";
  let said = "";
  try {
    load(packed);
    w.kspage_web_layout(300);
  } catch (e) {
    said = String(e);
  }
  check(said.indexOf("kspage:") >= 0,
    `used up, it refuses without freezing (${said.slice(0, 44) || "no refusal came out"})`);
  const back = w.kspage_web_recover();
  check(back > 0,
    `the arena comes back on the clearing up (${Math.round(back / 1048576)} MiB)`);
  check(w.kspage_web_heap_used() < room,
    `after handing it back there is room to spare `
      + `(${Math.round(w.kspage_web_heap_used() / 1048576)} / ${Math.round(room / 1048576)} MiB)`);
  // **Look at the document now staying** (swapped only once read; `port/web/inout.kspls`).
  check(save() === safe, "used up and refused, the document now is still there");
  check(w.kspage_web_layout(300) === placed,
    "after the clearing up it can be placed afresh just as far");

  // --- How many times one keystroke measures the width does not lean on the document's size ---
  //
  // Caution: **Do not measure the whole document afresh** — a measure calls across the boundary,
  // so a grown document would make every keystroke wait. An unchanged run keeps its width
  // (`kspage/model/doc.kspls`'s `wide`). **Do not look at it by time**: a count is the same for
  // the same input on any machine (as `make perf-log`). **Look at two sizes of one shape** (one
  // cannot show it does not grow), **and at a document that wraps too** (else a wrapping run's
  // remembrance is never hit). No table is mixed in (its columns are measured apart).
  const flatDoc = (n, wraps) => {
    const rows = [];
    const line = wraps
      ? (i) => `line ${i} is a text long enough that it wraps at this width here.`
      : (i) => `line ${i}`;
    for (let i = 0; i < n; i += 1) {
      rows.push(`{"style":"body","id":${i + 1},"inlines":[{"text":"${line(i)}"}]}`);
    }
    return `{"kspage":6,"sheet":{},"blocks":[${rows.join(",")}]}`;
  };
  // How many times one keystroke measures.
  // Caution: **Put the cursor into the body**, or typing puts nothing in and it passes at 0.
  // **Count the vertical measures too** (they cross the boundary as well, though the typeface
  // alone settles them).
  const keyCost = (n, wraps) => {
    check(load(flatDoc(n, wraps)) === 1, `a document of ${n} paragraphs can be opened`);
    const boxes = w.kspage_web_layout(300);
    const want = wraps ? n * 2 : n;
    check(boxes === want, `${n} paragraphs become ${want} boxes (${boxes})`);
    w.kspage_web_click(10, 8, 0);
    const wide = measured();
    const tall = vmetrics();
    type("x");
    w.kspage_web_layout(300);
    return { wide: measured() - wide, tall: vmetrics() - tall };
  };
  // Caution: **Put both shapes through the same check**, or a break in the other goes unnoticed.
  for (const wraps of [false, true]) {
    const how = wraps ? "wrapping" : "unwrapping";
    const small = keyCost(20, wraps);
    const large = keyCost(60, wraps);
    check(small.wide > 0,
      `in a ${how} document one keystroke measures the width (${small.wide} times on 20)`);
    check(small.wide === large.wide,
      `in a ${how} document the times the width is measured does not lean on the size `
        + `(20 paragraphs ${small.wide} / 60 paragraphs ${large.wide})`);
    check(small.tall === large.tall,
      `in a ${how} document the times the vertical is asked does not lean on the size `
        + `(20 paragraphs ${small.tall} / 60 paragraphs ${large.tall})`);
    check(large.tall <= 4,
      `in a ${how} document the vertical is asked once per typeface (${large.tall} times on 60)`);
  }
}
