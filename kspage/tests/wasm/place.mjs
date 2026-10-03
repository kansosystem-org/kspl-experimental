import { check, near } from "./shell.mjs";
import { material, para, grid } from "./material.mjs";

export const subject = "Placing, pressing, typing, choosing, and going back.";

// What it places. **The heading is 5 ASCII characters** — in `fixed_font` that is 2.5em at 28px, so
// 70px, and the width's answer can be worked out by hand (mix non-ASCII in and one character
// becomes a whole em, so a miscount cannot be noticed).
// Caution: **Make the body long enough to gain lines when it is narrowed** (that narrowing grows
// the count of lines is what is looked at here).
// **Put one paragraph behind the table** — the way of breaking where a table piles up
// vertically as an ordinary paragraph comes out only through "it carries on from below the table".
//
// The style names (`heading`, `body`, `table`, `cell`) are the document's own, defined by
// `kspage/content`'s sample, so they stay as they are until that side moves.
export const opens = material({
  styles: [
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0 },
    { name: "body", space_after: 12.0 },
    { name: "table", space_before: 12.0, space_after: 12.0, arrange: "grid" },
    { name: "cell", pad: 4.0, rule_width: 1.0, rule_color: "#cccccc" },
  ],
  blocks: [
    para("heading", "kspage"),
    para("body", "Prose, tables and slides alike, it is an editing system for writing them all "
      + "as one document."),
    grid("table",
      [para("cell", "The look"), para("cell", "The order")],
      [para("cell", "Prose"), para("cell", "Flowed in")]),
    para("body", "It is the paragraph behind the table."),
  ],
});

export function run(ks) {
  const { w, geom, textOf, find, cursor, type, compose } = ks;

  // --- Placing ---
  const n = w.kspage_web_layout(300);
  check(n > 0, `boxes come out at width 300 (${n})`);
  check(textOf(0) === "kspage", "the heading's text can be read");
  // The heading is 28px and heavy. 6 ASCII characters = 3em = 84px (ASCII is half a character
  // wide).
  check(near(geom(0)[2], 84), "the heading's width is as settled");
  check(near(geom(0)[4], 28) && near(geom(0)[5], 700),
    "the heading's size and weight are passed on");
  // The height used covers the lowest box.
  // Caution: **Do not merely paste the number in** — a pasted
  // number is rewritten every time one row of material is added, so whoever rewrote it cannot
  // tell whether it is right.
  // That it covers is a settlement that does not lean on the material (the page makes the
  // canvas this tall).
  let lowest = 0;
  for (let i = 0; i < n; i += 1) {
    lowest = Math.max(lowest, geom(i)[1] + geom(i)[3]);
  }
  check(w.kspage_web_height() >= lowest,
    `the height used covers the lowest box (${w.kspage_web_height()} >= ${lowest})`);

  // --- A table inside flowing prose ---
  // **That it is a table is said by the style, not by the document.** Break this and the table
  // piles up vertically as an ordinary paragraph (as many boxes come out, so counting them alone
  // cannot notice it).
  const left = find("The look");
  const right = find("The order");
  check(left >= 0 && right >= 0, "the table's heading cells become boxes");
  check(near(geom(left)[1], geom(right)[1]),
    "two cells of the same row line up at the same height");
  check(geom(right)[0] > geom(left)[0] + geom(left)[2],
    "the second column goes into the column right of the first");
  check(geom(n - 1)[1] > geom(left)[1],
    "the paragraph behind the table carries on from below the table");

  // How many times the width is measured when placing for the first time.
  // **It has to stay within the same order as the count of boxes.** Measuring is what
  // calls across the boundary, so the first time's cost is settled all but entirely by this count
  // (in a browser it goes to measure the real typeface). **Turn it back into a way of writing that
  // measures one // character onward at a time and this leaps** (it crosses one order past the
  // count of boxes).
  // Most of what is measured here is the widths of the table's columns.
  // Caution: **Read afresh before measuring.** The second placing has every remembrance hit and
  // comes to 0, so left as it is this becomes an empty check that passes whatever the ceiling
  // (`store.mjs`'s "how many times one keystroke measures the width" is the side that looks at the
  // second placing).
  // Reading afresh throws each run's remembrance away along with the document.
  // **Keep the ceiling pasted at the value it stands at.** Left loose, it can quietly
  // fatten by the whole of that slack — and it does not fall on the round that fattened, so there
  // is no chance of noticing that it is loose at all.
  const spent = ks.measured();
  ks.load(opens);
  const cold = w.kspage_web_layout(300);
  const cost = ks.measured() - spent;
  check(cost < cold * 4.5,
    `the first time measures the width under 4.5 times the count of boxes `
      + `(boxes ${cold} / measures ${cost})`);

  // Change the width and it places afresh. Narrowed, the lines grow.
  const narrow = w.kspage_web_layout(150);
  check(narrow > n, `narrowed, the lines grow (${n} -> ${narrow})`);
  w.kspage_web_layout(300);

  // --- Pressing and typing ---
  // Press behind the heading's "ks" (at 28px one ASCII character is 14px, so around 28px).
  w.kspage_web_click(28, 10, 0);
  let cur = cursor();
  check(cur[3] !== 0, "the cursor stands where it was pressed");

  type("Z");
  w.kspage_web_layout(300);
  check(textOf(0) === "ksZpage", `what was typed goes in (${textOf(0)})`);

  w.kspage_web_backspace();
  w.kspage_web_layout(300);
  check(textOf(0) === "kspage", "deleted, it returns to what it was");

  // --- Crossing over, and going up and down ---
  // Stand at the heading's end and then go right.
  // Caution: It has to cross a paragraph's seam.
  w.kspage_web_click(1000, 10, 0);
  let before = cursor();
  w.kspage_web_move(1, 0);
  let after = cursor();
  check(after[1] > before[1], "→ crosses from the heading into the next paragraph");

  // Down and up move the line.
  w.kspage_web_click(20, 50, 0);
  const row = cursor()[1];
  w.kspage_web_move_line(1, 0);
  check(cursor()[1] > row, "↓ goes down one line");
  w.kspage_web_move_line(-1, 0);
  check(near(cursor()[1], row), "↑ returns to the line it was on");

  // --- While being composed ---
  // The composed texts stay non-ASCII on purpose: composing is what an input method does to
  // reach a character that no key carries, so an ASCII fixture would look at nothing.
  w.kspage_web_click(28, 10, 0);
  compose("にほんご");
  w.kspage_web_layout(300);
  check(textOf(0) === "ksにほんごpage", `the text being composed can be seen (${textOf(0)})`);
  check(geom(0)[7] !== 0, "the box being composed carries a mark");

  // While being composed it is swapped out (it does not pile up).
  compose("日本語");
  w.kspage_web_layout(300);
  check(textOf(0) === "ks日本語page", `the text being composed is swapped out (${textOf(0)})`);

  // Called off, it is gone.
  w.kspage_web_compose_cancel();
  w.kspage_web_layout(300);
  check(textOf(0) === "kspage", "called off, the text being composed is gone");

  // Settled, it stays and the mark falls away.
  compose("日本語");
  w.kspage_web_compose_commit();
  w.kspage_web_layout(300);
  check(textOf(0) === "ks日本語page", "the text settled stays");
  check(geom(0)[7] === 0, "settled, the mark of being composed falls away");

  // Once settled it can be deleted as an ordinary character (by the character, not by the byte).
  w.kspage_web_backspace();
  w.kspage_web_layout(300);
  check(textOf(0) === "ks日本page", `one character alone is deleted (${textOf(0)})`);

  // --- Choosing ---
  // Stand at the heading's head, then choose two characters' worth to the right.
  w.kspage_web_click(0, 10, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  w.kspage_web_layout(300);
  check(w.kspage_web_selection_count() > 0, "a rectangle comes out over what is chosen");

  // Type while something is chosen and what is chosen is replaced.
  type("X");
  w.kspage_web_layout(300);
  check(textOf(0) === "X日本page", `what is chosen is replaced by what was typed (${textOf(0)})`);
  check(w.kspage_web_selection_count() === 0, "after typing, the choosing is folded away");

  // Choose and then delete, and only what is chosen goes (not one character further).
  w.kspage_web_click(0, 10, 0);
  w.kspage_web_move(1, 1);
  w.kspage_web_move(1, 1);
  w.kspage_web_backspace();
  w.kspage_web_layout(300);
  check(textOf(0) === "本page", `only what is chosen goes (${textOf(0)})`);

  // --- Going back, and doing it again ---
  check(w.kspage_web_undo() === 1, "where it could go back it returns 1");
  w.kspage_web_layout(300);
  check(textOf(0) === "X日本page", `going back returns to before the deleting (${textOf(0)})`);

  check(w.kspage_web_redo() === 1, "where it could be done again it returns 1");
  w.kspage_web_layout(300);
  check(textOf(0) === "本page", `done again it goes on to after the deleting (${textOf(0)})`);

  // What was typed on in one run goes back together in one step.
  w.kspage_web_click(0, 10, 0);
  type("a");
  type("b");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(textOf(0) === "本page", `what was typed in one run goes back together (${textOf(0)})`);

  // Cut the seam and it goes back one at a time. Cutting is the outside's part (the core carries
  // no clock).
  w.kspage_web_click(0, 10, 0);
  type("a");
  w.kspage_web_break_undo_group();
  type("b");
  w.kspage_web_undo();
  w.kspage_web_layout(300);
  check(textOf(0) === "a本page", `cut at the seam it goes back one at a time (${textOf(0)})`);

  // Gone all the way back it returns to the first text, and past that it returns 0.
  for (let i = 0; i < 100 && w.kspage_web_undo() === 1; i += 1);
  check(w.kspage_web_undo() === 0, "where there is nowhere to go back it returns 0");
  w.kspage_web_layout(300);
  check(textOf(0) === "kspage",
    `gone all the way back it returns to the first text (${textOf(0)})`);
}
