import { check } from "./shell.mjs";
import { material, para } from "./material.mjs";

export const subject = "The entry point that compares with an earlier version.";

// **Two paragraphs or more** — "the text changed" and "it was added" are looked at apart, and
// one paragraph gives only one of them.
// Caution: **Do not write the numbers.** Only two with the same origin's mark resolve by number,
// so this section puts the numbers and the mark in itself.
export const opens = material({
  styles: [
    { name: "heading", size_px: 28.0, weight: 700, space_after: 8.0 },
    { name: "body", space_after: 12.0 },
  ],
  blocks: [
    para("heading", "The document compared"),
    para("body", "It is the earlier paragraph."),
    para("body", "It is the later paragraph."),
  ],
});

export function run(ks) {
  const { w, textOf, type, save, load, feed, out, stage, read, scratch } = ks;

  const rowOf = (i) => {
    w.kspage_web_diff(i, scratch);
    return read(8);
  };
  const leftOf = (i) => out(w.kspage_web_diff_text(i, 0));
  const rightOf = (i) => out(w.kspage_web_diff_text(i, 1));
  // The kind's number, **the same row as `state.kspls`'s `diff_order`** (the numbers are frozen).
  const ADDED = 0;
  const EDITED = 3;

  // --- While nothing has been compared there is nothing ---
  check(w.kspage_web_diff_count() === 0, "before comparing it is 0");
  check(rowOf(0)[0] === 0, "asking for a number that is not there does not fall");

  // --- What was typed comes out as "the text changed" ---
  // Caution: **Put the mark in first** (the reason is at `opens` above).
  check(w.kspage_web_set_origin(stage("amark")) === 1, "the origin's mark can be put in");
  const before = save();
  w.kspage_web_layout(300);
  const was = textOf(0);
  // **Press before typing.** Unpressed, the cursor points nowhere and what is typed falls away.
  w.kspage_web_click(0, 10, 0);
  type("Q");
  w.kspage_web_layout(300);
  const now = textOf(0);
  check(was !== now, "the text has changed by what was typed");

  check(w.kspage_web_compare(feed(before)) === 1, "the earlier version can be read");
  check(w.kspage_web_diff_by_id() === 1,
    "it resolves by number (they are two with the same mark)");
  check(w.kspage_web_diff_count() >= 1,
    `a difference comes out (${w.kspage_web_diff_count()})`);
  // **Comparing does not move the document now** (it is no reread).
  w.kspage_web_layout(300);
  check(textOf(0) === now, "comparing does not move the document now");

  // Where in the row it comes out is not settled, so it hunts by kind.
  let edited = -1;
  for (let i = 0; i < w.kspage_web_diff_count(); i += 1) {
    if (rowOf(i)[0] === EDITED) edited = i;
  }
  check(edited >= 0, "the one where the text changed is there");
  const row = rowOf(edited);
  check(row[1] === 1 && row[2] === 1, "the left and the right are both there");
  check(row[4] > 0, `the right's number is attached (${row[4]})`);
  check(leftOf(edited) !== rightOf(edited), "the left and right texts differ");
  // The changed middle. **What matches from the front does not go into the changed part.**
  const head = row[5];
  check(leftOf(edited).length >= 0 && head >= 0,
    "the start of the changed part comes out");
  const bytes = (t) => new TextEncoder().encode(t);
  check(bytes(leftOf(edited)).length - head - row[6] === bytes(rightOf(edited)).length - head -
    row[7], "the matching length at the back is the same on left and right");

  // Where it jumps. **It can jump only to a difference with a right side.**
  check(w.kspage_web_diff_go(edited) === 1, "it can jump to that place");
  check(w.kspage_web_diff_go(9999) === 0, "it cannot jump to a number that is not there");

  // --- It can be thrown away ---
  w.kspage_web_diff_drop();
  check(w.kspage_web_diff_count() === 0, "thrown away it becomes 0");

  // --- An unreadable text is refused, and the earlier result is not kept either ---
  check(w.kspage_web_compare(feed(before)) === 1, "it can compare again");
  check(w.kspage_web_compare(feed("{ broken")) === 0,
    "an unreadable text returns 0");
  check(w.kspage_web_diff_count() === 0,
    "where it refused the earlier result is not kept either");

  // --- Reread the document and the differences are thrown away ---
  // **A difference points at the document now's blocks** (with the arena thrown away it would
  // point somewhere unreadable).
  check(w.kspage_web_compare(feed(before)) === 1, "it can compare afresh");
  check(w.kspage_web_diff_count() >= 1, "there is a difference");
  check(load(before) === 1, "the earlier version can be reread");
  check(w.kspage_web_diff_count() === 0,
    "a reread throws the differences away");

  // --- Two with no mark resolve by text ---
  // The numbers cannot be relied on, so it resolves by an anchor (a text that comes out once)
  // and by position.
  const plain = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"a\"}]},{\"style\":\"body\",\"inlines\":[{\"text\":\"b\"}]}]}";
  const plainer = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"a\"}]},{\"style\":\"body\",\"inlines\":[{\"text\":\"b\"}]}," +
    "{\"style\":\"body\",\"inlines\":[{\"text\":\"c\"}]}]}";
  check(load(plainer) === 1, "a text with no numbers can be read");
  check(w.kspage_web_compare(feed(plain)) === 1,
    "an earlier version with no numbers can be compared too");
  check(w.kspage_web_diff_by_id() === 0,
    "it does not resolve by number (there is no mark)");
  let added = 0;
  for (let i = 0; i < w.kspage_web_diff_count(); i += 1) {
    if (rowOf(i)[0] === ADDED) added += 1;
  }
  check(added === 1, `the one that was added comes out (${added})`);

  // --- Taking one node from the earlier version (a joining with limits) ---
  //
  // **What can be taken is a node that is on the other side alone** (a node on both sides is
  // refused). The settlement and its grounds are at the head of `kspage/write/merge.kspls`.
  const REMOVED = 1;
  const mark = "\"origin\":\"amark\",\"next_id\":4,";
  const node = (id, text) =>
    `{"style":"body","id":${id},"inlines":[{"text":"${text}"}]}`;
  const mine = `{"kspage":6,${mark}"sheet":{},"blocks":[${node(1, "a")},${node(2, "c")}]}`;
  const both = `{"kspage":6,${mark}"sheet":{},"blocks":[${node(1, "a")},${node(3, "b")},` +
    `${node(2, "c")}]}`;
  check(load(mine) === 1, "its own version can be read");
  check(w.kspage_web_compare(feed(both)) === 1,
    "the other side's version can be compared");
  check(w.kspage_web_diff_by_id() === 1, "it resolves by number");
  let gone = -1;
  for (let i = 0; i < w.kspage_web_diff_count(); i += 1) {
    if (rowOf(i)[0] === REMOVED) gone = i;
  }
  check(gone >= 0, "a node on the other side alone comes out as \"deleted\"");
  check(w.kspage_web_diff_take(gone) === 1, "that node can be taken");
  w.kspage_web_layout(300);
  check(textOf(0) + textOf(1) + textOf(2) === "abc",
    `it goes into the same place in the row as the other side's `
      + `(${textOf(0)}${textOf(1)}${textOf(2)})`);
  // The number is there already, so it is a node on both sides now.
  check(w.kspage_web_diff_take(gone) === 0, "it is not taken twice");
  // **What was taken goes from the differences** (the numbers are the same, so it resolves as
  // "the same thing").
  check(w.kspage_web_compare(feed(both)) === 1, "it can compare afresh");
  check(w.kspage_web_diff_count() === 0, "after taking it there is no difference");
  check(w.kspage_web_undo() !== 0, "one undo puts it back");
  w.kspage_web_layout(300);
  check(textOf(0) + textOf(1) === "ac", "put back, it is the original row");

  // It does not take from two resolved by text. **It would come to adding at the wrong place.**
  const plainer2 = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"d\"}]},{\"style\":\"body\",\"inlines\":[{\"text\":\"e\"}]}]}";
  check(load("{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\"," +
    "\"inlines\":[{\"text\":\"d\"}]}]}") === 1,
    "a text with no numbers can be read");
  check(w.kspage_web_compare(feed(plainer2)) === 1,
    "two with no numbers can be compared too");
  check(w.kspage_web_diff_by_id() === 0, "it does not resolve by number");
  let plain_gone = -1;
  for (let i = 0; i < w.kspage_web_diff_count(); i += 1) {
    if (rowOf(i)[0] === REMOVED) plain_gone = i;
  }
  check(plain_gone >= 0, "a node on the other side alone does come out");
  check(w.kspage_web_diff_take(plain_gone) === 0,
    "it does not take from a pair resolved by text");
}
