// ==========================================
// kspage's page — the storage kept across reloads: **where a tab's document lives** (so a reload
// comes back to it) and **the saved draft** (so what was written does not vanish). **This file only
// holds the storage**; which tab, when to reload and what to say belong to [`file.js`](file.js)
// and [`save.js`](save.js), the drafts' timing to [`keep.js`](keep.js).
// Storage failure answers with no record so opening and saving never wait indefinitely.
// ==========================================
function kspageHandles() {
  const DB_NAME = "kspage";
  // Caution: **Raise it when a store is added or its records change shape**, or on the earlier
  // version a draft silently fails where it is written (`NotFoundError`).
  const DB_VERSION = 3;
  // Where each tab's document lives, keyed by the tab's name.
  const STORE = "handles"; // Keep the old store name so existing tab paths survive.
  // Caution: **Cap the number of tabs remembered** — nothing tells a closed tab from a reload, so
  // records would pile up one per tab. Past the cap the oldest go (that tab reopens on the sample).
  const KEPT_TABS = 16;
  // The drafts, **keyed by the `at` inside each** (`keyPath`), so a listed draft carries its key.
  const DRAFTS = "drafts";

  // Caution: **Open it only once** (otherwise one page holds several connections to one store):
  // **call this function once per page** and share what it returns (`page.js`'s `ui.handles`). A
  // failure is remembered too (otherwise a private window waits on every click).
  let opening = null;
  const openDb = () => {
    if (opening) return opening;
    opening = new Promise((done) => {
      let ask = null;
      let answered = false;
      const answer = (db) => {
        answered = true;
        done(db);
      };
      try {
        ask = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (_) {
        answer(null);
        return;
      }
      // Caution: **Check that it exists before creating it** (creating it again fails the upgrade
      // with `ConstraintError`).
      ask.onupgradeneeded = () => {
        const db = ask.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        if (!db.objectStoreNames.contains(DRAFTS)) {
          db.createObjectStore(DRAFTS, { keyPath: "at" });
        }
      };
      ask.onsuccess = () => {
        const db = ask.result;
        // An open answered as blocked that goes through later is closed: unused, it would block
        // the next upgrade in turn.
        if (answered) {
          db.close();
          return;
        }
        // Caution: **Let go when a newer version is opened elsewhere** (another window of a later
        // page): held, that window's upgrade waits at `blocked`. The next use opens it again.
        db.onversionchange = () => {
          db.close();
          opening = null;
        };
        db.onclose = () => {
          opening = null;
        };
        answer(db);
      };
      ask.onerror = () => answer(null);
      // Caution: **Answer when it is blocked too** — with another window holding the old version
      // open it stops at `blocked`, and the save's click would never return.
      ask.onblocked = () => answer(null);
    });
    return opening;
  };

  // The connection to use now. Caution: **Take it again where it was let go meanwhile**
  // (`opening` no longer the one waited on): a transaction on a closed connection throws, and the
  // write would be lost in silence.
  const liveDb = () => {
    const was = openDb();
    return was.then((db) => (opening === was ? db : liveDb()));
  };

  // Caution: **Waiting on one transaction never throws** (not remembering is not a failed save).
  const inStore = (name, mode, use) => liveDb().then((db) => {
    if (!db) return null;
    return new Promise((done) => {
      let deal = null;
      let ask = null;
      // Caution: **Catch what `use` throws as well** — `put` refuses an uncloneable value
      // immediately (`DataCloneError`), and uncaught it is a rejection nobody waits on.
      try {
        deal = db.transaction(name, mode);
        ask = use(deal.objectStore(name));
      } catch (_) {
        try {
          if (deal) deal.abort();
        } catch (_e) {
          // already finished: nothing is left to undo
        }
        done(null);
        return;
      }
      deal.onabort = () => done(null);
      deal.onerror = () => done(null);
      if (!ask) {
        deal.oncomplete = () => done(null);
        return;
      }
      ask.onsuccess = () => done(ask.result === undefined ? null : ask.result);
      ask.onerror = () => done(null);
    });
  });

  return {
    // Remembers a tab's path; null forgets it, and past the cap the oldest tabs go.
    keepWhere(tab, where) {
      if (!where) return inStore(STORE, "readwrite", (store) => store.delete(tab));
      const one = { path: where.path, when: Date.now() };
      return inStore(STORE, "readwrite", (store) => {
        store.put(one, tab);
        // Caution: **Never drop the record just written** (it is the current tab); records in the
        // same millisecond tie on time, so it is kept by its key.
        const held = [];
        const walk = store.openCursor();
        walk.onsuccess = () => {
          const at = walk.result;
          if (at) {
            if (at.key !== tab) held.push({ key: at.key, when: (at.value && at.value.when) || 0 });
            at.continue();
            return;
          }
          held.sort((a, b) => b.when - a.when);
          for (const old of held.slice(KEPT_TABS - 1)) store.delete(old.key);
        };
        return null;
      });
    },
    // Returns the stored path, ignoring obsolete handle-only records.
    takeWhere(tab) {
      return inStore(STORE, "readonly", (store) => store.get(tab)).then((one) => {
        if (!one || typeof one.path !== "string" || !one.path) return null;
        return { path: one.path };
      });
    },
    // Stores one draft, **which must carry an `at`** (the key).
    keepDraft(one) {
      if (!one || typeof one.at !== "string") return Promise.resolve(null);
      return inStore(DRAFTS, "readwrite", (store) => store.put(one));
    },
    // Returns every stored draft (empty if none), **not only this tab's**: a startup after a crash
    // is another tab, and an orphaned draft is exactly the one to restore.
    takeDrafts() {
      return inStore(DRAFTS, "readonly", (store) => store.getAll())
        .then((got) => (Array.isArray(got) ? got : []));
    },
    // Discards one draft, once it is saved or restored.
    dropDraft(at) {
      return inStore(DRAFTS, "readwrite", (store) => store.delete(at));
    },
  };
}
