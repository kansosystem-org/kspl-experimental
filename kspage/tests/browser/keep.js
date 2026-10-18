// The draft held back (what was written not vanishing even when the page is shut).

function kspageProbeKeep(ks) {
  const { check, app, notAPath, typeIn } = ks;

  // Caution: **Do not wait out the thinning's wait.** It is the product's, so the checks alone
  // would fall the day it is shortened. The person's entry point (`keepSync`) is called by name.
  // **Swap documents in one lump with no wait inside**: sections overlap through `hold()`.

  const planted = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
    + "\"inlines\":[{\"text\":\"the draft of the round that fell\"}]}]}";
  // Caution: **Hunt by a mark, not by a whole-text match** (`save` numbers the blocks on the spot).
  // **It must be one character** — one input event does not necessarily put two in.
  const MARK = "¶";

  // ---- The lump with no wait inside ----
  // 1. The earlier round's draft comes back **in place of the document now, which is set aside**.
  const wasSaved = app.save();
  const why = app.draftTake({ kind: "json", text: planted, name: "the round that fell",
    path: notAPath + "/probe.kspage" });
  check(why === "", "the draft can be brought back (" + (why || "no refusal") + ")");
  check(app.text().indexOf("the draft of the round that fell") >= 0,
    "the earlier round's characters are in the document brought back ("
      + app.text().slice(0, 12) + ")");
  // 2. A document brought back **stays a draft until it is saved** (it is in no file), so opening
  // another over it does not lose it.
  app.keepSync();
  // 3. What was typed is held back, **looked at as far as the body**. The key alone lets "it comes
  // back empty" walk past. A sheet from `save` numbers the blocks and differs even untyped.
  app.focus();
  ks.pressAt(0);
  typeIn(MARK);
  check(app.text().indexOf(MARK) >= 0,
    "the document brought back can be typed on (" + app.text().slice(0, 14) + ")");
  // **Leaving the page writes what is waiting**: the pause the draft waits for may never come
  // before the page goes. **Ask the store at once**, before "New" below sets the draft aside
  // anyway (one connection answers in the order asked).
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  const leftWith = app.keepStore.takeDrafts();
  // Caution: **Put the document back** (the draft brought back took its place in the window)
  // **over a blank sheet**. Read over the draft itself, the draft's key would be written again
  // without the mark before the store is looked at. "New" sets the typed draft aside first.
  document.getElementById("doc-new").click();
  app.load(wasSaved);
  check(app.save() === wasSaved, "the document from before is back as it was");

  // ---- From here on it does not touch the document ----
  // **Borrow the page's connection** (IndexedDB orders transactions only inside one connection).
  const done = ks.hold();
  const store = app.keepStore;
  // By content, not by count: an earlier round's draft is ordinary, so a count falls later.
  const having = (got, body) => (Array.isArray(got)
    ? got.filter((one) => one && one.text.indexOf(body) >= 0) : []);
  const shown = (got) => (Array.isArray(got)
    ? got.map((one) => one.at + ":" + one.text.length + "B").join(" ") : "not a row");
  // A stand-in for an earlier start-up's draft, **keyed outside this start-up**. What it laid
  // down itself is not "something lost earlier" (`keep.js`), so under the same key it is not found.
  const PLANT = "b-probe-keep/0";

  // **A page that cannot remember passes too** (a private window can refuse IndexedDB). But not
  // remembering and a broken holding back look the same, so **it looks for the arena first**.
  store.keepDraft({ at: PLANT, when: Date.now(), kind: "json", name: "the round that fell",
    from: notAPath + "/probe.kspage", text: planted })
    .then(() => store.takeDrafts())
    .then((got) => {
      if (having(got, "the draft of the round that fell").length < 1) {
        check(having(got, MARK).length === 0,
          "a page that cannot remember holds no drafts (the arena cannot be opened)");
        return null;
      }
      // 4. What was typed goes into the drafts, **looked at as far as the body** (step 3's reason).
      const mine = having(got, MARK);
      check(mine.length === 1,
        "what was typed goes into the drafts (" + mine.length + ": " + shown(got) + ")");
      check(mine.length === 1 && mine[0].kind === "json",
        "the draft remembers the opening shape too ("
          + (mine.length === 1 ? mine[0].kind : "none") + ")");
      // Caution: **See that the draft brought back is held under a key of its own.** Under the
      // earlier one, it would be thrown away with it.
      check(mine.length === 1 && mine[0].at !== PLANT,
        "the document brought back is held back under its own key ("
          + (mine.length === 1 ? mine[0].at : "none") + ")");
      // 5. It finds the earlier round's draft at start-up.
      return leftWith.then((left) => {
        check(having(left, MARK).length === 1,
          "leaving the page writes the draft waiting (" + shown(left) + ")");
        return app.keepBoot();
      }).then((many) => {
        check(many >= 1,
          "the earlier round's draft is found at start-up (" + many + ")");
        // **The count can be brought back** holds those found and those set aside since.
        check(app.keepCount() >= many, "the count found can be counted");
        // Caution: **Tidy up what was laid down** (it would line up at the next round's start-up).
        for (const one of mine) store.dropDraft(one.at);
        store.dropDraft(PLANT);
        return null;
      });
    })
    .then(() => done(), (e) => {
      check(false, "the drafts' entry point returns an answer (" + String((e && e.message) || e) + ")");
      done();
    });
}

// Jumping from the right list (the headings and the contents).
// Caution: **Press a row in the list like a person**, not the entry point (a row not wired walks
// past). **Press the contents after jumping to a chapter.** A chapter's row moves the cursor, and
// the contents' row only sends by height, so one fault shows only in that order.
// **Do not load the manual** (its reread does not finish inside this row of checks); inserting the
// contents is enough. **It is the last section** (the document changes).

function kspageProbeOutline(ks) {
  const app = ks.app;
  const done = ks.hold();
  const rowsOf = () => Array.from(document.querySelectorAll("#outline .item"));
  // Caution: **Poll, with a cap.** A settled wait cannot fit a layout growing with the document,
  // and a wait with no cap never lets the marks out.
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
      // Read from the saved text (the screen cannot say the box is there: it holds no text).
      const hasContents = () => {
        const doc = JSON.parse(app.save());
        const gathers = new Set(doc.sheet.styles.filter((s) => s.contents).map((s) => s.name));
        return doc.blocks.some((b) => gathers.has(b.style));
      };
      ks.check(await until(hasContents), "the contents can be inserted");
      // **The inserted box itself stays out of the list** (it would be a row with no name). To
      // jump to the contents, a heading goes above it (`in_chapters` keeps it out of the chapters).
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
      // **Back returns to the tail it jumped from** (the place before the last jump).
      ks.check(app.jumpBack() && await until(atBottom),
        "after jumping to an edge, Back returns to where it was (" + window.scrollY + ")");
    } catch (e) {
      ks.check(false, "it can jump from the list (" + String((e && e.message) || e) + ")");
    } finally {
      done();
    }
  })();
}
