// ksmd page: drafts. A draft is the unsaved source of a document, held aside in the browser's
// storage so that a closed tab or a crash loses at most a few seconds of typing. A draft is never
// written to the document's file, and the page never calls it saved.
// A draft is kept per workspace, path and opening (`id`), so two tabs on one document keep two.
// Caution: **The browser keeps drafts per address**, the local server's port included. Started on
// another port, the page finds none of them.
"use strict";

function ksmdKeep() {
  const DB = "ksmd";
  const STORE = "drafts";
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  let opened = null;

  // The store, or null where the browser keeps nothing: then no draft is held, and nothing waits.
  function db() {
    if (!opened) {
      opened = new Promise((done) => {
        let ask;
        try {
          ask = indexedDB.open(DB, 1);
        } catch (_) {
          done(null);
          return;
        }
        ask.onupgradeneeded = () => ask.result.createObjectStore(STORE, { keyPath: "key" });
        ask.onsuccess = () => done(ask.result);
        ask.onerror = () => done(null);
      });
    }
    return opened;
  }

  // Runs one request in a transaction, and gives its result, or null where it failed.
  async function run(mode, make) {
    const d = await db();
    if (!d) return null;
    return new Promise((done) => {
      try {
        const t = d.transaction(STORE, mode);
        const r = make(t.objectStore(STORE));
        t.oncomplete = () => done(r.result === undefined ? true : r.result);
        t.onerror = () => done(null);
        t.onabort = () => done(null);
      } catch (_) {
        done(null);
      }
    });
  }

  return {
    // Holds a draft: { root, path, id, text, base }. `base` names the file's bytes the edits
    // started from, so a draft brought back is compared with the file before it is saved.
    put(d) {
      return run("readwrite", (s) => s.put({ ...d, key: `${d.root}\n${d.path}\n${d.id}`,
        at: Date.now() }));
    },
    drop(root, path, id) {
      return run("readwrite", (s) => s.delete(`${root}\n${path}\n${id}`));
    },
    // The drafts of one document other than those of the opening `id`, newest first.
    async of(root, path, id) {
      const all = (await run("readonly", (s) => s.getAll())) || [];
      return all.filter((d) => d.root === root && d.path === path && d.id !== id)
        .sort((a, b) => b.at - a.at);
    },
    // Lets go drafts older than 30 days, at start; a draft nobody brought back by then is stale.
    async prune() {
      const all = (await run("readonly", (s) => s.getAll())) || [];
      const old = Date.now() - MAX_AGE_MS;
      for (const d of all) if (d.at < old) await run("readwrite", (s) => s.delete(d.key));
    },
  };
}
