// The draft held back (what was written not vanishing even when the page is shut).

function kspageProbeKeep(ks) {
  const { check, app, notAPath } = ks;

  // Caution: **Do not wait out the thinning's wait** — it is the product's, so the checks alone
  // would fall the day it is shortened; the person's entry point (`keepSync`) is called by name.
  // **Swap documents in one lump with no wait inside**: sections overlap through `hold()`, and a
  // swap throws away `diff`'s partner (`kspage/port/web/api_diff.js`), so `probe.js` runs it first.
  // **Type by the same way as a person** (an `input` event, the same settlement as `store.js`).
  const typeIn = (t) => ks.ime.dispatchEvent(new InputEvent("input",
    { data: t, inputType: "insertText", bubbles: true }));

  const planted = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
    + "\"inlines\":[{\"text\":\"the draft of the round that fell\"}]}]}";
  // Caution: **Hunt by a mark, not by a whole-text match** (`save` numbers the blocks on the spot).
  // **It must be one character** — one input event does not necessarily put two in.
  const MARK = "¶";

  // ---- The lump with no wait inside ----
  // 1. The earlier round's draft comes back **beside the document now, not over it**.
  const was = app.docNow();
  const why = app.draftTake({ kind: "json", text: planted, name: "the round that fell",
    path: notAPath + "/probe.json" });
  check(why === "", "the draft can be brought back (" + (why || "no refusal") + ")");
  check(app.docNow() !== was,
    "the draft brought back opens into another place (it does not crush the document now)");
  check(app.text().indexOf("the draft of the round that fell") >= 0,
    "the earlier round's characters are in the document brought back ("
      + app.text().slice(0, 12) + ")");
  // 2. A document with nothing to lose is not held back (no "saved, and a draft is still there").
  const rested = app.save();
  app.keepSync();
  // 3. What was typed is held back, **looked at as far as the body**: the key alone lets "it comes
  // back empty" walk past, and a sheet from `save` numbers the blocks and differs even untyped.
  app.focus();
  ks.pressAt(0);
  typeIn(MARK);
  check(app.text().indexOf(MARK) >= 0,
    "the document brought back can be typed on (" + app.text().slice(0, 14) + ")");
  app.keepSync();
  // Caution: **Return to the original number** (shutting moves to the smallest number).
  check(app.docShut(app.docNow()), "the document brought back can be shut");
  if (app.docNow() !== was) app.docGo(was);
  check(app.docNow() === was, "after shutting it returns to the original document");

  // ---- From here on it does not touch the document ----
  // **Borrow the page's connection** (IndexedDB orders transactions only inside one connection).
  // Caution: **Do not go and look until it comes out** — the drawing-out side's budget does not run
  // dry while a request is unhandled, so it runs out of time without writing the mark.
  const done = ks.hold();
  const store = app.keepStore;
  // By content, not by count: an earlier round's draft is ordinary, so a count falls later.
  const having = (got, body) => (Array.isArray(got)
    ? got.filter((one) => one && one.text.indexOf(body) >= 0) : []);
  const shown = (got) => (Array.isArray(got)
    ? got.map((one) => one.at + ":" + one.text.length + "B").join(" ") : "not a row");
  // A stand-in for an earlier start-up's draft, **keyed outside this start-up**: what it laid down
  // itself is not "something lost earlier" (`keep.js`), so under the same key it is not found.
  const PLANT = "b-probe-keep/0";

  // **A page that cannot remember passes too** (a private window can refuse IndexedDB), but not
  // remembering and a broken holding back look the same, so **it looks for the arena first**.
  store.keepDraft({ at: PLANT, when: Date.now(), kind: "json", name: "the round that fell",
    from: notAPath + "/probe.json", text: planted })
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
      // Caution: **See that a shut document's draft survives** (a reused number overwrites it).
      check(mine.length === 1 && mine[0].at !== PLANT,
        "a shut document's draft is not deleted by a number being reused ("
          + (mine.length === 1 ? mine[0].at : "none") + ")");
      // **The unchanged brought-back document has no draft**: counted by the side without the mark.
      const still = having(got, "the draft of the round that fell")
        .filter((one) => one.text.indexOf(MARK) < 0);
      check(still.length === 1,
        "a document that has not changed is not held back (" + still.length + ")");
      // 5. It finds the earlier round's draft at start-up.
      return app.keepBoot().then((many) => {
        check(many >= 1,
          "the earlier round's draft is found at start-up (" + many + ")");
        check(app.keepCount() === many, "the count found can be counted");
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
