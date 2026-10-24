// ksmd page: notes on a table cell or a paragraph. A cell with a note has a red corner, as in
// Excel; a paragraph or a heading with one has a bar at its left. Pointing at either shows the note.
// The ribbon's Note asks for the note of the chosen cell, or of the paragraph the caret stands in;
// an empty answer resolves it. The table's right-click menu holds Note... and Resolve note too.
// A note is saved in the file (`note` in braces), and each change is one step of undo.
"use strict";

function ksmdNotes(ks) {
  // Marks the cells of a rendered table that hold a note.
  function mark(wrap, notes) {
    wrap.notes = new Map();
    for (const [r, c, text] of notes) {
      wrap.notes.set(`${r}:${c}`, text);
      const el = wrap.querySelector(`[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      el.classList.add("has-note");
      el.title = `Note: ${text}`;
    }
  }

  // Marks a paragraph or a heading that holds a note.
  function markBlock(el, note) {
    if (!note) return;
    el.classList.add("has-note");
    el.dataset.note = note;
    el.title = `Note: ${note}`;
  }

  // Where a note command acts: { cell } where a cell was worked in last, else { block } at the caret.
  function target() {
    if (ks.where === "cell" && ks.cell) {
      const wrap = ks.view.blocks()[ks.cell.block];
      if (wrap && wrap.classList.contains("table") && ks.cell.row >= 0) {
        return { cell: ks.cell, now: (wrap.notes && wrap.notes.get(`${ks.cell.row}:${ks.cell.column}`)) || "" };
      }
    }
    const s = window.getSelection();
    const at = s.rangeCount > 0 ? ks.view.spotAt(s.anchorNode, s.anchorOffset) : ks.sel && ks.sel.a;
    const block = at && at[0] === 0 ? at[1] : -1;
    const el = ks.view.blocks()[block];
    if (!el || !/^H[1-6]$|^P$/.test(el.tagName)) return null;
    return { block, now: el.dataset.note || "" };
  }

  function set(t, text) {
    if (t.cell) return ks.act("ksmd_web_cell_note", t.cell.block, t.cell.row, t.cell.column, ks.put(text));
    return ks.act("ksmd_web_block_note", t.block, ks.put(text));
  }

  // Asks for the note; empty resolves it. With `resolve`, takes the note away at once.
  function ask(resolve) {
    ks.flush();
    const t = target();
    if (!t) {
      ks.say("A note stands on a paragraph, a heading or a table cell. Put the caret in one first.");
      return null;
    }
    if (resolve) return t.now ? set(t, "") : null;
    const typed = window.prompt("Note. Leave it empty to resolve the note.", t.now);
    if (typed === null) return null;
    return set(t, typed.trim());
  }

  ks.notes = { mark, markBlock, ask };
}
