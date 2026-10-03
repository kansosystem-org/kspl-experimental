// kspage — the bridge to a browser, JS side. It does only three things: passes the wasm the sizes
// the canvas's measureText gives, draws the laid-out boxes with fillText, and passes on the click,
// the key and the text being composed. Layout and editing decisions are the wasm's.
// Caution: Do not make it an ES module; to open on file://, it is embedded whole into one page.

function kspageBoot(canvas, wasmBytes) {
  const utf8 = new TextDecoder("utf-8");
  const enc = new TextEncoder();
  const ctx = canvas.getContext("2d");
  let mem = null;


  // A color crosses the boundary as a `0xRRGGBB` number, and in the DOM and the canvas it is
  // `#rrggbb`. **Pad it to six digits**: neither the canvas nor a color input reads fewer.
  const colorText = (rgb) => `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;
  const colorNum = (text) => parseInt(text.slice(1), 16) || 0;

  // The canvas's font string: CSS's order, and neither the size nor the name can be left out.
  const fontString = (family, sizePx, weight, italic) =>
    `${italic ? "italic " : ""}${weight} ${sizePx}px ${family}`;

  // Caution: **Make the view on every read** (wasm memory becomes a new ArrayBuffer as it grows).
  const str = (ptr, len) => utf8.decode(new Uint8Array(mem.buffer, ptr, len));

  // The vertical sizes come from the font only (from the characters, lines would differ).
  function vmetrics(family, sizePx, weight, italic) {
    ctx.font = fontString(family, sizePx, weight, italic);
    const m = ctx.measureText("M");
    // Without fontBoundingBox it is derived from the em (0.8/0.2). **The canvas gives no gap
    // between lines**, so it is set here: 0.17 matches other products; **do not raise it**.
    return {
      ascent: m.fontBoundingBoxAscent || sizePx * 0.8,
      descent: m.fontBoundingBoxDescent || sizePx * 0.2,
      lineGap: sizePx * 0.17,
    };
  }

  const imports = { env: {
    kspage_js_measure(fp, fl, sizePx, weight, italic, tp, tl) {
      ctx.font = fontString(str(fp, fl), sizePx, weight, italic);
      return ctx.measureText(str(tp, tl)).width;
    },
    // Called once when the core stops for lack of memory. **It must throw**, or the freestanding
    // panic's `for {}` freezes the screen; the handler (`api.js`'s `cramps`) cleans up.
    kspage_js_gave_up(mp, ml) {
      throw new Error("kspage: " + str(mp, ml));
    },
    kspage_js_vmetrics(fp, fl, sizePx, weight, italic, outPtr) {
      const v = vmetrics(str(fp, fl), sizePx, weight, italic);
      const out = new Float32Array(mem.buffer, outPtr, 3);
      out[0] = v.ascent;
      out[1] = v.descent;
      out[2] = v.lineGap;
    },
  }};

  return WebAssembly.instantiate(wasmBytes, imports).then((src) => {
    const w = src.instance.exports;
    mem = w.memory;
    // Caution: **Ask the wasm how many numbers fit** — hard-coded, the day the buffer shrinks it
    // silently reads the neighbour. **Keep one reader of it** (`nums`).
    const scratch = w.kspage_web_nums();
    const numsCap = w.kspage_web_nums_cap();
    const nums = (n) => {
      if (n > numsCap) {
        throw new Error("kspage: " + n + " numbers do not fit in the memory (" + numsCap + ")");
      }
      return new Float32Array(mem.buffer, scratch, n);
    };
    // The text an entry point just wrote out, `len` bytes of it; "" where it wrote none. **The
    // address is asked after writing** (writing grows the memory and moves it).
    const outText = (len) => (len > 0 ? str(w.kspage_web_out_ptr(), len) : "");

    // Caution: **Put what gets rewritten here** (the width, the slide shown, composing); kept per
    // part, the copies get out of step. Parts take the rest by name (`mem` too: what grows is
    // `mem.buffer`). **The users are set up last** (drawing, then keys, then entry points).
    const ks = {
      w: w, mem: mem, canvas: canvas, ctx: ctx, enc: enc,
      str: str, outText: outText, colorText: colorText, colorNum: colorNum, fontString: fontString,
      vmetrics: vmetrics,
      // Where box shapes and the cursor are read from, **asked of the wasm**.
      // Caution: **Do not borrow below `__heap_base`** (C's stack: a deep call overwrites it).
      scratch: scratch,
      nums: nums,
      // **The one place that passes text into the wasm's arena**: too big gives null (address 0
      // is C's stack, never written). **Make the view after getting the arena** (memory can grow).
      handOver: (bytes) => {
        const ptr = w.kspage_web_load_buffer(bytes.length);
        if (ptr === 0) return false;
        new Uint8Array(mem.buffer, ptr, bytes.length).set(bytes);
        return true;
      },
      // The width to lay out at; 0 is the container's width (the page passes it).
      width: 0,
      // The slide being presented. **-1 is the normal editing screen.**
      showing: -1,
      // The band being dragged to draw a shape; **null while not pressed**.
      drawn: null,
      // Whether composing is in progress (the keys then belong to the IME).
      composing: false,
      // Whether to draw in the screen's colors (the viewer's override). **The document does not
      // change**, and prints and the list's images keep the document's colors.
      plain: false,
      // The slide grabbed in the list, moved where it is released; **null means none**.
      dragThumb: null,
      // Caution: **External images stay unloaded by default, and this is not remembered** (loading
      // a document resets it), or permitting once would silently fetch for a later document.
      outsidePics: false,
      // The entry points for the outside, filled in by the entry-point files.
      api: {},
    };
    kspageDraw(ks);
    kspageDrawCrop(ks);
    kspagePin(ks);
    kspageNarrow(ks);
    kspageKeys(ks);
    kspageApi(ks);
    kspageApiIo(ks);
    kspageApiLook(ks);
    kspageApiDiff(ks);
    kspageApiShow(ks);
    return ks.api;
  });
}
