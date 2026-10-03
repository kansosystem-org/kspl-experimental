// Where it compares with an earlier version (the list, the lens, where it jumps, the look's
// pixels). The table's text (`The look`) is the sample document's, so that needle moves when
// `kspage/content` does; what it types is this side's own, and nothing reads it back.

function kspageProbeDiff(ks) {
  const { check, app, press, hold } = ks;
  // Caution: **Hold the marks back** (two asynchronous things run here; `probe.js`'s `hold`).
  const free = hold();

  // **This can be seen nowhere else**: building the list of differences, a pressed row jumping to
  // its place, and the two looks together. **Press in the same order as a person** (the row to open
  // it, then the choice), seeing the press land (a name not there passes on the earlier lens).
  const lensPick = (label) => check(ks.flyPick("diff-view", label),
    "\"" + label + "\" can be chosen from the lens to compare by");
  const list = document.getElementById("diff-list");
  const note = document.getElementById("diff-note");
  const shot = document.getElementById("diff-shot");
  const chooser = document.getElementById("compare-file");
  const rows = () => list.querySelectorAll(".diff-row");

  // An earlier version; **saving puts the mark in** (versions resolve by number with one mark).
  const before = app.save();
  press(8, 20);
  app.type("D");
  check(app.save() !== before, "the text has changed by what was typed");

  // The versions held back **need the mark** (saving puts it); a page that cannot remember refuses.
  check(app.origin() !== "", "saving puts the origin's mark on");
  const keep = document.getElementById("diff-keep");
  // **A submenu, not a `<select>`** (it compares on choosing; it is no field for a value).
  const pastBox = document.getElementById("diff-past");
  const kinds = () => pastBox.querySelectorAll(".fly-pick").length;
  const was = kinds();
  keep.click();
  const kept = kinds();
  check(kept > was, `the version held back comes out in the list (${kept - 1} to choose from)`);
  // Caution: **Do not hold the same text back twice** (each press would line the same version up).
  keep.click();
  check(kinds() === kept, "the same text is not held back afresh");
  // No difference against the version just held back; **the newer is on top** (not by value).
  const newest = () => pastBox.querySelectorAll(".fly-pick")[1];
  newest().click();
  check(app.diffCount() === 0,
    `against the version just held back there is no difference (${app.diffCount()})`);
  check(note.textContent.indexOf("There is no difference") >= 0,
    `it says there is no difference (${note.textContent})`);
  // After typing a difference comes out.
  app.type("H");
  newest().click();
  check(app.diffCount() >= 1,
    `after typing a difference from the version held back comes out (${app.diffCount()})`);
  // It can be thrown away (**a history that cannot be deleted is a standard complaint**).
  // Caution: **Hold two versions back and say which one went** — a delete reading the comparing
  // row's choice passes the easy checks while it silently throws the oldest away, so the newer is
  // deleted and **the older is proved to be the survivor** (a wrong one is the current text, 0).
  keep.click();
  const two = kinds();
  check(two > kept, `a second version is held back (${two - 1} to choose from)`);
  pastBox.querySelectorAll(".fly-pick")[0].click();
  check(pastBox.querySelector(".fly-now").textContent === "",
    "the comparing row's choice can be put back to none");
  const dropBox = document.getElementById("diff-drop");
  const drops = () => dropBox.querySelectorAll(".fly-pick");
  check(drops().length === two - 1,
    `the deleting set lines the versions up on its own (${drops().length})`);
  // **No mark is put out** (these are commands, and none of them is laid on).
  check(dropBox.querySelector(".fly-now").textContent === "",
    "the deleting set puts no mark out");
  drops()[0].click();
  check(kinds() < two, "the version pressed is thrown away with nothing chosen above");
  // The one left is the older, so against the text as it stands a difference comes out.
  newest().click();
  check(app.diffCount() >= 1,
    `the version left is the older one and not the newer (${app.diffCount()})`);
  // The last one goes too, and **the set does not empty**: it falls back to the one row that says
  // so (an empty set does not look pressable; `diff.js`'s `dropPicks`), so the count is 1.
  drops()[0].click();
  check(drops().length === 1 && drops()[0].textContent.indexOf("no saved version") >= 0,
    `with the last version gone the row says so (${drops()[0].textContent})`);
  // Caution: **Look at the mark after the deleting too** — an empty row matching `now`'s value
  // would land the ✓ on "there is no saved version yet", its text beside the set's name as laid on.
  check(drops()[0].querySelector(".fly-tick").textContent === "" &&
    dropBox.querySelector(".fly-now").textContent === "",
    "the row that says there is none carries no mark");
  document.getElementById("diff-clear").click();

  // It has the earlier version's file chosen (roused as in `probe.js`'s `pickFile`).
  const hand = (text) =>
    ks.pickFile(chooser, text, "before.json", "application/json");

  // Caution: **Do not look once and give up** (reading the file and rousing the second body are
  // asynchronous), **nor write the wait's length here** (`probe.js`'s `waitFor` says why).
  const waitFor = ks.waitFor;

  const done = { list: false, look: false, took: false };
  hand(before);
  waitFor(() => note.textContent.indexOf("in all") >= 0,
    "a difference comes out for the file chosen", () => {
      check(app.diffById(), "it resolves by number");
      check(rows().length >= 1, `rows come out in the list (${rows().length})`);
      check(note.textContent.indexOf("matched by number") >= 0,
        `it says it matched by number (${note.textContent})`);
      // The changed middle gets a mark, **as elements, never HTML built from text**.
      check(list.querySelector("mark") !== null, "the changed middle gets a mark");
      check(list.querySelector(".diff-side") !== null,
        "the before and after texts line up");

      // A pressed row jumps there, **typeable after** (the focus goes back to the input field).
      const first = list.querySelector(".diff-row");
      if (first) {
        first.click();
        check(document.activeElement === app.inputElement,
          "after the press the focus goes back to the input field");
      }

      // The lens changes the narrowing, **not the matching** (the overall count does not move).
      const all = app.diffCount();
      // Caution: **Draw afresh where it was pressed** (the list changes with the lens); a separate
      // way of drawing afresh, passing alone, reads as "change it and nothing changes".
      lensPick("Shapes");
      const shaped = rows().length;
      check(app.diffCount() === all,
        "changing the lens does not change the count of differences");
      check(shaped <= all, `the shapes lens narrows it (${shaped} rows)`);
      done.list = true;

      // The look's lens **brings together two sheets drawn by one drawer** (no tolerance wanted).
      lensPick("Styles");
      waitFor(() => shot.height > 1, "the look's sheet comes out", () => {
        check(note.textContent.indexOf("of the pixels") >= 0,
          `it says how many pixels differ (${note.textContent})`);
        // Caution: **The difference must not be 0.** The same drawer drew both at the same width,
        // so one character typed always differs in pixels (0 means it is not comparing).
        check(note.textContent.indexOf("0% of the pixels") < 0,
          "what was typed comes out as a difference in pixels");

        // Give up and it goes empty.
        document.getElementById("diff-clear").click();
        check(rows().length === 0, "giving up empties the list");
        check(app.diffCount() === 0, "giving up throws the differences away too");
        check(shot.hidden, "the look's sheet is folded too");
        done.look = true;
        // Caution: **Hand over to the next asynchronous thing held** (let go, marks come early).
        takeBack();
      });
    });

  // It takes back from the earlier version (a joining with limits): the "take" key comes out and
  // the list is rebuilt after the press. It deletes the table whole and takes it back.
  // Caution: **Put the document back before finishing** (later sections look at the same document).
  const takeBack = () => {
    const at = ks.findCell();
    if (at <= 0 || !app.dropHolder()) {
      check(false, "the table can be deleted (somewhere to take back into is wanted)");
      done.took = true;
      free();
      return;
    }
    hand(before);
    // Reading the file is asynchronous, so it waits for the rebuild before pressing.
    waitFor(() => list.querySelector(".diff-take") !== null, "the take key comes out", () => {
      const took = list.querySelector(".diff-take");
      if (took === null) {
        // Caution: **Let go here too**, or it waits to the safety net with not one mark put out,
        // and the failure named above goes **behind the answer** (a place nobody reads).
        done.took = true;
        free();
        return;
      }
      const wasRows = rows().length;
      took.click();
      check(rows().length < wasRows,
        `taking it rebuilds the list (${wasRows} -> ${rows().length} rows)`);
      check(app.text().indexOf("The look") >= 0,
        "the deleted table comes back from the earlier version");
      document.getElementById("diff-clear").click();
      done.took = true;
      free();
    });
  };

  // Caution: **Say that it could not wait it out**, or it runs out of time with no mark; **do not
  // write the length**: the wait is a chain of three (a difference → the look's sheet → the take
  // key), and a net written by hand is shorter than the chain (`probe.js`'s `netFor`).
  ks.netFor("the difference checks finish",
    () => Object.keys(done).filter((one) => !done[one]), free);
}
