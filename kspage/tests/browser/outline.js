// Jumping from the right list (the headings and the contents).
// Caution: **Press a row in the list like a person**, not the entry point (a row not wired walks
// past). **Press the contents after jumping to a chapter**: a chapter's row moves the cursor and
// the contents' row only sends by height, so one fault shows only in that order.
// **Do not load the manual** (its reread does not finish inside this row of checks); inserting the
// contents is enough. **It is the last section** (the document changes).

function kspageProbeOutline(ks) {
  const app = ks.app;
  const done = ks.hold();
  const rowsOf = () => Array.from(document.querySelectorAll("#outline .item"));
  // Caution: **Poll, capped well below `--virtual-time-budget`** (`kspage/Makefile`): a settled
  // wait cannot fit a layout growing with the document, and past the budget no mark comes out.
  const until = async (ok) => {
    for (let waited = 0; waited < 1200; waited += 25) {
      if (ok()) return true;
      await new Promise((go) => setTimeout(go, 25));
    }
    return false;
  };

  // Caution: **Always let a held section go**, or it runs out of time with no mark (nor what fell).
  (async function () {
    try {
      // It inserts the contents at the head, **pressing the button like a person** (it is wired).
      ks.press(8, 8);
      ks.openMenu("put-toc");
      document.getElementById("put-toc").click();
      ks.check(await until(() => app.contentsTop() >= 0), "the contents can be inserted");
      // **The inserted box itself stays out of the list** (it would be a row with no name); to jump
      // to the contents, a heading goes above it (`in_chapters` keeps it out of the chapters).
      ks.check(!rowsOf().some((r) => r.textContent === "contents"),
        "the box that gathers does not itself come out in the list");

      const rows = rowsOf();
      // **The rows jumping to an edge sit at the row's ends** (the place tells what it links to).
      ks.check(rows.length > 2 && rows[0].textContent === "The document's head",
        "the row that jumps to the head is at the row's head");
      ks.check(rows[rows.length - 1].textContent === "The document's tail",
        "the row that jumps to the tail is at the row's end");
      // Caution: **Tell the edge rows apart by their mark** (`port/web/side.js`'s `edge`), not by
      // label: a rename would leave this filter excluding nothing, passing silently.
      const heads = rows.filter((r) => !r.classList.contains("edge"));
      ks.check(heads.length > 0 && heads.length === rows.length - 2,
        `every row but the two edges is a heading (${heads.length} of ${rows.length})`);
      const deep = heads.length > 0 ? heads[heads.length - 1] : null;
      ks.check(deep !== null, "a heading's row is there");
      if (deep === null) {
        return;
      }
      deep.click();
      const went = await until(() => window.scrollY > 100);
      ks.check(went, "pressing a heading's row sends the window (" + window.scrollY + ")");

      // It jumps to an edge **after jumping to a heading** (a heading's row moves the cursor, an
      // edge row does not). **Look at whether it reached the floor**, not "lower than before" (the
      // window may already be past the floor before the jump).
      const atBottom = () =>
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
      rows[rows.length - 1].click();
      ks.check(await until(atBottom),
        "the tail row reaches the document's very bottom (" + window.scrollY + ")");
      // The contents are at the head, so jumping to the head comes back to them.
      rows[0].click();
      ks.check(await until(() => window.scrollY === 0),
        "the head row goes back to the document's very top");
      ks.check(app.canJumpBack(), "after jumping to an edge it can still go back");
    } catch (e) {
      ks.check(false, "it can jump from the list (" + String((e && e.message) || e) + ")");
    } finally {
      done();
    }
  })();
}
