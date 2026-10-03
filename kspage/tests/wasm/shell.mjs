// It hands the wasm's entry points over in a shape each section's text can call.
//
// Caution: **Tie them per instance.** The memory is separate per instance, so one set of entry
// points reused measures the first one's memory the moment a second is made.
// **Return the values copied.** An array peeking into the wasm's memory is rewritten by the next
// read (it points at the same place).

const dec = new TextDecoder();
const enc = new TextEncoder();

// The count of what failed.
// Caution: **Gather it into one.** Counted per section, every text added grows another place that
// adds to the total.
export const score = { failed: 0 };

// The tab of the section now.
// Caution: **Run the sections in order and wait** (`await` inside the `for`). Overlapping, a mark
// arriving later attaches another section's tab.
let part = "";

export function inPart(name) {
  part = name;
}

// The head of one line. **Building the line's shape is this one place** (the canon is the table
// of where a line is built, which `make test-conventions` holds this place to). Scattered, the
// marks' wording and spacing split per gate, and a failing mark other than `FAIL` is not raised
// into `mk/ci.mk`'s summary (which picks up `^FAIL `).
function head(mark, what) {
  return `${mark} ${part.length > 0 ? part + ": " : ""}${what}`;
}

export function check(ok, what) {
  if (ok) {
    console.log(head("pass", what));
  } else {
    console.log(head("FAIL", what));
    score.failed += 1;
  }
}

export const near = (a, b) => Math.abs(a - b) < 0.001;

// The same settlement as kspage/model/fixed_font.kspls.
export function widthOf(text, sizePx) {
  let em = 0;
  for (const ch of text) em += ch.codePointAt(0) < 128 ? 0.5 : 1.0;
  return em * sizePx;
}

// Hand one text over and an entry point that makes one instance comes back.
//
// **The measures are settled values put in** (the same settlement as
// kspage/model/fixed_font.kspls). The browser's own measuring moves with the machine and the
// version, and the check would fall with nothing broken.
export function opener(wasm) {
  return async () => {
    const host = {};
    // How many times the width was measured, and the vertical measures asked for.
    // Caution: **Count both.** Both cross the wasm's boundary, so these counts settle the cost of
    // laying out afresh (in a browser `measureText` measures the real thing, and the vertical
    // measures go to fetch the typeface too).
    host.measured = 0;
    host.vmetrics = 0;
    const peek = (p, l) => dec.decode(new Uint8Array(host.mem.buffer, p, l));
    const imports = { env: {
      kspage_js_measure: (fp, fl, size, weight, it, tp, tl) => {
        host.measured += 1;
        return widthOf(peek(tp, tl), size);
      },
      // The entry point for stopping with the memory used up.
      // Caution: **Always throw** (unthrown it stops in a `for {}` and node never returns). The
      // page's side is the same shape (`kspage/port/web/kspage.js`).
      kspage_js_gave_up: (mp, ml) => {
        throw new Error("kspage: " + peek(mp, ml));
      },
      kspage_js_vmetrics: (fp, fl, size, weight, it, out) => {
        host.vmetrics += 1;
        const o = new Float32Array(host.mem.buffer, out, 3);
        o[0] = size * 0.8;
        o[1] = size * 0.2;
        o[2] = size * 0.2;
      },
    }};
    const src = await WebAssembly.instantiate(wasm, imports);
    host.w = src.instance.exports;
    host.mem = host.w.memory;
    return entryPoints(host);
  };
}

// The arena that takes the numbers.
// Caution: **Ask the wasm's side.** Below `__heap_base` is C's stack, where a deep call inside the
// same entry point overwrites the numbers written out.
// The place does not move as the memory grows, so asking once is enough; the array that peeks
// goes stale as it grows, so it is made afresh every time.
function entryPoints(host) {
  const w = host.w;
  const mem = host.mem;
  const scratch = w.kspage_web_nums();
  const str = (p, l) => dec.decode(new Uint8Array(mem.buffer, p, l));
  const read = (n) => Array.from(new Float32Array(mem.buffer, scratch, n));

  // Caution: **Write the text out and then ask for the place** (writing out widens the memory and
  // the place changes). Put both in one call's arguments and JS, going left to right, asks first.
  const out = (len) => str(w.kspage_web_out_ptr(), len);

  // It lays a text into the typing arena and returns its length. **The arena is a settled size**
  // (a long text is carried on the loading arena's side).
  const stage = (t) => {
    const bytes = enc.encode(t);
    new Uint8Array(mem.buffer, w.kspage_web_input_buffer(), w.kspage_web_input_cap()).set(bytes);
    return bytes.length;
  };

  // It lays a text into the loading arena and returns its length, or 0 where it does not fit.
  // **Take the place and then peek** — taking memory grows it, and a window made earlier goes
  // stale.
  // Caution: **Do not write where it was refused** (null back, `kspage/port/web/inout.kspls`).
  // Address 0 is C's stack, so writing there **breaks the page's inside and it never returns**
  // (the same promise as `kspage.js`'s `handOver` on the page's side).
  const feed = (t) => {
    const bytes = typeof t === "string" ? enc.encode(t) : t;
    const ptr = w.kspage_web_load_buffer(bytes.length);
    if (ptr === 0) return 0;
    new Uint8Array(mem.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  };

  const geom = (i) => {
    w.kspage_web_box(i, scratch);
    return read(8);
  };
  // All 15 of a box's shape; `geom` is the first 8 (the colour, the line and the letter spacing
  // follow).
  const boxOf = (i) => {
    w.kspage_web_box(i, scratch);
    return read(15);
  };
  const textOf = (i) =>
    str(w.kspage_web_box_text(i), w.kspage_web_box_text_len(i));
  const find = (t) => {
    const count = w.kspage_web_layout(300);
    for (let i = 0; i < count; i += 1) {
      if (textOf(i) === t) return i;
    }
    return -1;
  };
  const cursor = () => {
    w.kspage_web_cursor(scratch);
    return read(4);
  };

  const type = (s) => w.kspage_web_type(stage(s));
  const compose = (s) => w.kspage_web_compose(stage(s));

  // **The cell being typed on shows the formula.** To see the value, move to another text (it
  // lays out afresh after moving).
  const leaveCell = () => {
    w.kspage_web_click(0, 10, 0);
    w.kspage_web_layout(300);
  };

  const styleNames = () => {
    const names = [];
    for (let i = 0; i < w.kspage_web_style_count(); i += 1) {
      names.push(out(w.kspage_web_style_name(i)));
    }
    return names;
  };

  return {
    w: w,
    mem: mem,
    // How many times the width was measured. **It only reads** (what counts is the place that
    // makes the entry points).
    measured: () => host.measured,
    vmetrics: () => host.vmetrics,
    scratch: scratch,
    str: str,
    read: read,
    out: out,
    stage: stage,
    feed: feed,
    geom: geom,
    boxOf: boxOf,
    textOf: textOf,
    find: find,
    cursor: cursor,
    type: type,
    compose: compose,
    save: () => out(w.kspage_web_save()),
    html: () => out(w.kspage_web_html()),
    md: () => out(w.kspage_web_markdown()),
    csv: () => out(w.kspage_web_csv()),
    load: (text) => w.kspage_web_load(feed(text)),
    typed: () => out(w.kspage_web_typed()),
    setTyped: (text) => w.kspage_web_set_typed(stage(text)),
    leaveCell: leaveCell,
    styleNames: styleNames,
    styleOf: () => out(w.kspage_web_style()),
    setStyle: (name) => w.kspage_web_set_style(stage(name)) !== 0,
    paraOf: (i) => {
      w.kspage_web_style_para(i, scratch);
      return read(8);
    },
    panelAt: (i) => {
      w.kspage_web_panel(i, scratch);
      return read(9);
    },
    surfaceAt: (i) => {
      w.kspage_web_surface(i, scratch);
      return read(4);
    },
  };
}
