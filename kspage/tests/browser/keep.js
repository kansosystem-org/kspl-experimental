// The draft held back (what was written not vanishing even when the page is shut).

function kspageProbeKeep(ks) {
  const { check, app, notAPath } = ks;

  // Caution: **Do not wait out the thinning's wait** — it is the product's, so the checks alone
  // would fall the day it is shortened; the person's entry point (`keepSync`) is called by name.
  // **Swap documents in one lump with no wait inside**: sections overlap through `hold()`.
  // **Type by the same way as a person** (an `input` event, the same settlement as `store.js`).
  const typeIn = (t) => ks.ime.dispatchEvent(new InputEvent("input",
    { data: t, inputType: "insertText", bubbles: true }));

  const planted = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
    + "\"inlines\":[{\"text\":\"the draft of the round that fell\"}]}]}";
  // Caution: **Hunt by a mark, not by a whole-text match** (`save` numbers the blocks on the spot).
  // **It must be one character** — one input event does not necessarily put two in.
  const MARK = "¶";

  // ---- The lump with no wait inside ----
  // 1. The earlier round's draft comes back **in place of the document now, which is set aside**.
  const wasSaved = app.save();
  const why = app.draftTake({ kind: "json", text: planted, name: "the round that fell",
    path: notAPath + "/probe.json" });
  check(why === "", "the draft can be brought back (" + (why || "no refusal") + ")");
  check(app.text().indexOf("the draft of the round that fell") >= 0,
    "the earlier round's characters are in the document brought back ("
      + app.text().slice(0, 12) + ")");
  // 2. A document brought back **stays a draft until it is saved** (it is in no file), so opening
  // another over it does not lose it.
  app.keepSync();
  // 3. What was typed is held back, **looked at as far as the body**: the key alone lets "it comes
  // back empty" walk past, and a sheet from `save` numbers the blocks and differs even untyped.
  app.focus();
  ks.pressAt(0);
  typeIn(MARK);
  check(app.text().indexOf(MARK) >= 0,
    "the document brought back can be typed on (" + app.text().slice(0, 14) + ")");
  app.keepSync();
  // Caution: **Put the document back** (the draft brought back took its place in the window)
  // **over a blank sheet**: read over the draft itself, the draft's key would be written again
  // without the mark before the store is looked at. "New" sets the typed draft aside first.
  document.getElementById("doc-new").click();
  app.load(wasSaved);
  check(app.save() === wasSaved, "the document from before is back as it was");

  // ---- From here on it does not touch the document ----
  // **Borrow the page's connection** (IndexedDB orders transactions only inside one connection).
  // Caution: **Do not go and look until it comes out**, and **wait through `ks.fed`**: IndexedDB
  // answers off the page's thread, which the drawing-out side's clock does not see (why: `fed` in
  // `probe.js`).
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
  ks.fed(store.keepDraft({ at: PLANT, when: Date.now(), kind: "json", name: "the round that fell",
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
      // Caution: **See that the draft brought back is held under a key of its own** (under the
      // earlier one it would be thrown away with it).
      check(mine.length === 1 && mine[0].at !== PLANT,
        "the document brought back is held back under its own key ("
          + (mine.length === 1 ? mine[0].at : "none") + ")");
      // 5. It finds the earlier round's draft at start-up.
      return app.keepBoot().then((many) => {
        check(many >= 1,
          "the earlier round's draft is found at start-up (" + many + ")");
        // **The count can be brought back** holds those found and those set aside since.
        check(app.keepCount() >= many, "the count found can be counted");
        // Caution: **Tidy up what was laid down** (it would line up at the next round's start-up).
        for (const one of mine) store.dropDraft(one.at);
        store.dropDraft(PLANT);
        return null;
      });
    }))
    .then(() => done(), (e) => {
      check(false, "the drafts' entry point returns an answer (" + String((e && e.message) || e) + ")");
      done();
    });
}
