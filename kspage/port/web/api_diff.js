// ==========================================
// kspage's JS side — the change history and comparing with an earlier version (the same `app` as
// [`api.js`](api.js)). **Each keeps a text apart from the document, which reloading the document
// clears.** The history travels as a separate file (`kspage.ksdb`; git is not needed).
// ==========================================
function kspageApiDiff(ks) {
  const { w, mem, enc, outText, draw, stage, nums, scratch, nowText, handOver } = ks;
  // A difference's kind; **the index is the number** (`diff_order` in `port/web/state.kspls`).
  const DIFF_KINDS = ["added", "removed", "moved", "edited", "restyled", "reframed",
    "resheeted"];
  const api = ks.api;
  Object.assign(api, {
    // ---- The change history ----
    // The user's name. **The page sets it** (empty, entries are stored with an empty who field).
    author: "",
    // Caution: **Stamp where typing pauses, and before a save**, or the next stamp's time is used.
    stampTrail() {
      const len = stage(nowText() + "\t" + api.author);
      return len <= 0 ? 0 : w.kspage_web_trail_stamp(len);
    },
    // The history, oldest first: **one line per item, fields separated by tabs (when, who, what).**
    trail() {
      const len = w.kspage_web_trail();
      return outText(len);
    },
    // The counts stored and lost to a full arena; **the lost are reported**, not silently dropped.
    trailCount() { return w.kspage_web_trail_count(); },
    trailLost() { return w.kspage_web_trail_lost(); },
    // Caution: **Return a copy** of the stored form (the view changes at the next write).
    trailBytes() {
      const len = w.kspage_web_trail_bytes();
      return new Uint8Array(mem.buffer, w.kspage_web_out_ptr(), len).slice();
    },
    // Reads the history back from the stored form (true if read), **after the document** (loading
    // that empties the history); read only after getting the arena, as `load` does.
    loadTrail(bytes) {
      if (bytes.length <= 0) return false;
      if (!handOver(bytes)) return false;
      return w.kspage_web_load_trail(bytes.length) !== 0;
    },
    // ---- Comparing with an earlier version ----
    // **It compares with "the earlier version"**: the current document (right, after) against the
    // text passed in (left, before), **which stays as it is**; false if unreadable (drops the old).
    compare(text) {
      const bytes = enc.encode(text);
      if (!handOver(bytes)) return false;
      return w.kspage_web_compare(bytes.length) !== 0;
    },
    // The number of differences. **0 when nothing was compared** (0 also means "no difference").
    diffCount() { return w.kspage_web_diff_count(); },
    // Whether the two were matched by number (**false: by text**, which the viewer is told).
    diffById() { return w.kspage_web_diff_by_id() !== 0; },
    // Difference `i` (the kind names are `Kind`'s variants in `kspage/share/compare.kspls`).
    diffRow(i) {
      w.kspage_web_diff(i, scratch);
      const at = nums(8);
      return {
        kind: DIFF_KINDS[at[0]] || DIFF_KINDS[0],
        was: at[1] !== 0, now: at[2] !== 0, framed: at[3] !== 0, id: at[4],
        // The changed middle, in bytes, **on a character boundary** (the core aligns it).
        head: at[5], wasLen: at[6], nowLen: at[7],
      };
    },
    // One side of difference `i`'s text (0 left, 1 right); **the missing side is empty.**
    diffText(i, side) {
      const len = w.kspage_web_diff_text(i, side);
      return outText(len);
    },
    // Difference `i`'s style name. **Empty means it is a block's difference.**
    diffName(i) {
      const len = w.kspage_web_diff_name(i);
      return outText(len);
    },
    diffStyle(i) {
      const len = w.kspage_web_diff_style(i);
      return outText(len);
    },
    // Takes difference `i`'s block in (true if taken): **only a block on one side, matched by
    // number** (otherwise a change silently vanishes). One undo restores it; compare again.
    diffTake(i) {
      const took = w.kspage_web_diff_take(i) !== 0;
      if (took) draw();
      return took;
    },
    // Moves the cursor to difference `i`. **A removed block cannot be jumped to.**
    diffGo(i) {
      const moved = w.kspage_web_diff_go(i) !== 0;
      if (moved) draw();
      return moved;
    },
    // Drops the comparison's result. **The other version's arena is freed here too.**
    diffDrop() { w.kspage_web_diff_drop(); },
  });
}
