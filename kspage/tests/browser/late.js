// The page's start, held back on purpose: every round runs on a start slower than any clock in the
// page, so a check that waits for it on a timer fails every round, not only on a busy machine.
// It is pasted in **ahead of the page's own texts** (`kspage/Makefile`'s `KSPAGE_PROBE_PAGE`), so
// it wraps `WebAssembly.instantiate` before `port/web/page.js` calls it.
// How it holds back: it compiles the wasm again **off the page's thread** a number of times before
// the start goes on. The dumping side's virtual clock does not see that work, just as it does not
// see a busy machine's slow compile.
// Caution: **Make each copy differ** (a custom section with a name of its own): the browser keeps
// a module it compiled once, and the same bytes again come back at once, holding nothing back.

(function () {
  const instantiate = WebAssembly.instantiate;
  const again = 50;
  // The bytes with one more custom section (id 0) at the end, named `late-<k>`.
  // Caution: **Keep the name under 127 bytes**: the section's two lengths are written as one byte.
  function copy(source, k) {
    const bytes = new Uint8Array(source.buffer || source, source.byteOffset || 0,
      source.byteLength);
    const name = new TextEncoder().encode("late-" + k);
    const out = new Uint8Array(bytes.length + 3 + name.length);
    out.set(bytes);
    out[bytes.length] = 0;
    out[bytes.length + 1] = name.length + 1;
    out[bytes.length + 2] = name.length;
    out.set(name, bytes.length + 3);
    return out;
  }
  // **Only the first call is held back** (the page's start); the original goes back in place.
  WebAssembly.instantiate = function (bytes, imports) {
    WebAssembly.instantiate = instantiate;
    let left = again;
    const one = () => {
      left -= 1;
      return left < 0 ? Promise.resolve() : WebAssembly.compile(copy(bytes, left)).then(one);
    };
    return one().then(() => instantiate.call(WebAssembly, bytes, imports));
  };
})();
