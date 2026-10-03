// ==========================================
// kspage's page — the saved draft (so that what was written does not vanish when the page closes).
// **This is not a save**: the file does not change by one byte, so it is called **a draft**, never
// saved. It writes when typing pauses (`beforeunload` misses a crashing tab).
// [`handle.js`](handle.js) holds the storage; this file decides when to write, discard and tell.
// **There is one entry point, `keepSync`**: it asks only `draftNow`, and null means discard.
// **Restoring happens only on a click** (restored at startup, a draft thought discarded would come
// back to life).
// ==========================================
function kspageKeep(ui) {
  const app = ui.app;
  const store = kspageHandles();

  // Caution: **Do not make it too short** (the whole document is serialized each time); it is
  // longer than the delay before re-asking for the semantic colors, which someone is waiting on.
  const SETTLE_MS = 2000;
  // Caps on age and count: unbounded, the quota overflows and **writing silently fails**.
  const KEEP_DAYS = 30;
  const KEEP_MAX = 32;

  // Caution: **Unique per startup and per window** (by number alone, a reload or a second window
  // would overwrite a draft); forgotten, it leaves the previous startup's drafts to restore.
  const bootId = "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  // **Keyed by the document's identity** (`file.js`'s `mintDoc`): numbers are reused.
  const keyOf = (id) => bootId + "/" + id;

  // The last text written, per number: **never the same twice** (not every redraw is typing).
  const wrote = new Map();
  let settle = null;

  // The drafts found at startup, **kept until clicked** (restoring reads them).
  let found = [];

  // Brings the stored draft in line with the current one; **one entry point** (see the header).
  const keepSync = () => {
    if (!ui.draftNow) return;
    const one = ui.draftNow();
    const at = keyOf(one.id);
    if (one.text === null) {
      if (wrote.has(at)) {
        wrote.delete(at);
        store.dropDraft(at);
      }
      return;
    }
    if (wrote.get(at) === one.text) return;
    wrote.set(at, one.text);
    store.keepDraft({ at: at, when: Date.now(), kind: one.kind, name: one.name,
      from: one.path, text: one.text });
  };

  // Caution: **Do not write on every redraw** (`keepSync` serializes the whole text synchronously).
  const keepLater = () => {
    if (settle !== null) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = null;
      keepSync();
    }, SETTLE_MS);
  };

  // Caution: **Show the time** — "there is a draft" alone does not say whether to restore it.
  const said = (one) => {
    const when = new Date(one.when);
    const clock = String(when.getHours()).padStart(2, "0") + ":"
      + String(when.getMinutes()).padStart(2, "0");
    const name = one.from || one.name || "an untitled document";
    return name + "(" + (when.getMonth() + 1) + "/" + when.getDate() + " " + clock + ")";
  };

  // At startup it counts the drafts, **discarding the old ones and the overflow here**.
  const keepBoot = () => store.takeDrafts().then((got) => {
    const stale = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
    // Caution: **Do not touch what this startup wrote** — counted, the open document reads as lost;
    // discarded, **the draft being protected is gone**.
    const mine = (one) => typeof one.at === "string" && one.at.startsWith(bootId + "/");
    const whole = (one) => typeof one.text === "string" && typeof one.when === "number";
    const live = got.filter((one) => one && whole(one) && one.when > stale && !mine(one));
    // Caution: **Keep the newest** (cut the oldest first, or the one needed most is lost).
    live.sort((a, b) => b.when - a.when);
    for (const one of got) {
      if (!one || mine(one)) continue;
      if (!whole(one) || one.when <= stale) store.dropDraft(one.at);
    }
    for (const one of live.slice(KEEP_MAX)) store.dropDraft(one.at);
    found = live.slice(0, KEEP_MAX);
    if (found.length === 0) return 0;
    // Caution: **Say "not saved" plainly** ("can be recovered" reads as saved, and gets closed).
    ui.say("There are " + found.length + " unsaved drafts: " + said(found[0])
      + (found.length > 1 ? " and others" : "") + ". Open them from \"Bring the draft back\" under \"File\"");
    return found.length;
  });

  // Caution: **One draft at a time**: all at once, when space runs out, how far it got is unclear.
  const keepRestore = () => {
    if (found.length === 0) {
      ui.deny("There is no draft to bring back");
      return false;
    }
    const one = found[0];
    const why = ui.draftTake(one);
    if (why !== "") {
      ui.deny(why);
      return false;
    }
    found = found.slice(1);
    wrote.delete(one.at);
    store.dropDraft(one.at);
    // Caution: **Say where it came from** — it is unbound, and the first save asks for a location.
    ui.say("Brought the draft back (from: " + (one.from || "it was in no file")
      + "). Where to save will be asked at the first save" + (found.length > 0
        ? ". " + found.length + " left" : ""));
    app.focus();
    return true;
  };

  // Discards every draft. **Clicking it says "I do not need them"**, so no confirmation.
  const keepDrop = () => {
    const many = found.length;
    for (const one of found) store.dropDraft(one.at);
    found = [];
    ui.say(many > 0 ? "Threw " + many + " held-back drafts away" : "There is no draft to throw away");
    app.focus();
  };

  // **The clicks are wired here** (as `file.js` wires "New"), so one entry point is one file.
  document.getElementById("keep-take").addEventListener("click", keepRestore);
  document.getElementById("keep-drop").addEventListener("click", keepDrop);

  return { keepSync: keepSync, keepLater: keepLater, keepBoot: keepBoot,
    keepRestore: keepRestore, keepCount: () => found.length,
    // The draft storage itself. **The check uses this connection**: IndexedDB orders transactions
    // only within one connection, so a second would leave the write and the read unordered.
    // Caution: **Do not fill it with repeated polling waits** — the test driver's budget does not
    // run out while a request is pending, so it times out before the mark.
    keepStore: store };
}
