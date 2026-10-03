// ==========================================
// kspage's JS side — turning the document into text and text into a document (the same `app` as
// [`api.js`](api.js)): the saved form (JSON), exports (HTML, Markdown), text form (`.txt` and
// source) and reading them back.
// Caution: **Do not merge the reasons for refusing into one** — each has a different fix, so the
// core's answer is passed on as it is. **Read memory only after getting the arena** (wasm memory
// can grow there, leaving an earlier array on the old ArrayBuffer).
// ==========================================
function kspageApiIo(ks) {
  // **`cramps` is `api.js`'s, on `ks`** (one handler for full memory; with two, one skips cleanup).
  const { w, enc, outText, draw, cramps, handOver } = ks;
  Object.assign(ks.api, {
    // Makes HTML of the current document and its styles. **This one cannot be reloaded.**
    html() {
      const len = w.kspage_web_html();
      return outText(len);
    },
    // Makes Markdown of the current document and its styles. **Nor can this.**
    markdown() {
      const len = w.kspage_web_markdown();
      return outText(len);
    },
    // The current document as a text form; **it round-trips byte for byte** (`loadPlainText`).
    plainText() {
      const len = w.kspage_web_plain_text();
      return outText(len);
    },
    // Reads a document back from text: empty if read, otherwise **the reason for refusing** (the
    // current document stays either way).
    // Caution: **Return a reason, not a boolean, and never guess it from the size** — "cannot be
    // read" and "too large to lay out" have opposite fixes (change the text, split the document).
    load(text) {
      const bytes = enc.encode(text);
      if (!handOver(bytes)) return "too_big";
      const got = cramps(() => w.kspage_web_load(bytes.length));
      if (got === null) return "cramped";
      if (got === 0) return "broken";
      if (got < 0) return "too_big";
      draw();
      return "";
    },
    // A new document from Markdown text, answering as `load` does (**the current document is not
    // kept**: an import, not a merge).
    loadMarkdown(text) {
      const bytes = enc.encode(text);
      if (!handOver(bytes)) return "too_big";
      const got = cramps(() => w.kspage_web_load_markdown(bytes.length));
      if (got === null) return "cramped";
      if (got === 0) return "broken";
      if (got < 0) return "too_big";
      draw();
      return "";
    },
    // ---- The list of open documents ----
    // **A window shows one.** The page remembers which file each is (the core opens no files).
    docCount() { return w.kspage_web_doc_count(); },
    docNow() { return w.kspage_web_doc_now(); },
    docOpen(i) { return w.kspage_web_doc_open(i) !== 0; },
    // Caution: **Redraw once the document is switched** (the layout result is dropped).
    docUse(i) {
      const moved = w.kspage_web_doc_use(i) !== 0;
      if (moved) draw();
      return moved;
    },
    // Opens one new document and shows it, returning its index (-1 if full).
    docNew() {
      const got = w.kspage_web_doc_new();
      if (got >= 0) draw();
      return got;
    },
    // Closes document `i`. **The last one is not closed.**
    docDrop(i) {
      const shut = w.kspage_web_doc_drop(i) !== 0;
      if (shut) draw();
      return shut;
    },
    // The cursor's line and byte offset in it (**null with no cursor**), for `api.js`'s `spotNow`.
    caretSpot() {
      w.kspage_web_caret_spot(ks.scratch);
      const [line, at, found] = ks.nums(3);
      return found === 0 ? null : { line: line, at: at };
    },
    // Moves the cursor to that line and byte and scrolls it to the window's top (true if moved).
    // **Where you came from is not remembered here** but by the caller that decided to jump
    // (`markJump`); a caller opening another file first would record the target itself.
    goTo(line, at) {
      const moved = w.kspage_web_go_to(line, at) !== 0;
      if (moved) {
        draw();
        if (ks.jumpToCaret) ks.jumpToCaret();
      }
      return moved;
    },
    // A new document from a text form (`.txt`, a program's source), answering as `load` does with a
    // fourth reason: **it is not text** (it holds a NUL; open it with another tool).
    // Caution: **The declaration goes before the text in the one arena**, split by length (a text
    // can hold any character, so no separator can be used). Read memory after getting the arena.
    loadPlainText(text, spoken) {
      const head = enc.encode(spoken || "");
      const body = enc.encode(text);
      const bytes = new Uint8Array(head.length + body.length);
      bytes.set(head, 0);
      bytes.set(body, head.length);
      if (!handOver(bytes)) return "too_big";
      const got = cramps(() => w.kspage_web_load_plain_text(bytes.length, head.length));
      if (got === null) return "cramped";
      if (got === 0) return "broken";
      if (got === -2) return "not_text";
      if (got < 0) return "too_big";
      draw();
      return "";
    },
  });
}
