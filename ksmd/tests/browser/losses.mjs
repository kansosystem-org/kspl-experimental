// The served page, at each place where unsaved edits could be lost or a file overwritten: a
// document the reader refuses, a file changed while a save waits, a reload, a step the source
// limits refuse, a cell value the editor refuses, a draft the browser cannot hold, and leaving
// the page with nothing held. `losses(t)` takes `served.mjs`'s helpers, and returns its sections.
import fs from "fs";
import path from "path";
import { CTRL, verdict } from "./drive.mjs";

const check = (ok, what, detail) => verdict.check(ok, what, detail);
const H = "%ksmd 1\n\n";
const CELLS = `${H}Text.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`;
// A file the reader refuses: its version is not one ksmd reads.
const REFUSED = "%ksmd 9\n\nA later version.\n";
// A formula longer than the 4,096 bytes a cell can hold.
const LONG = `=${"1+".repeat(2100)}1`;
// A browser whose settings keep no site data: its IndexedDB refuses to open.
const NO_STORE = "Object.defineProperty(window, 'indexedDB', { get() { " +
  "throw new DOMException('blocked', 'SecurityError'); } });";
// A browser whose storage is full: drafts open, but none can be written.
const FULL = "IDBObjectStore.prototype.put = function () { " +
  "throw new DOMException('full', 'QuotaExceededError'); };";
// Holds each write back until the check lets it go with `window.putGo()`, or frees them all.
const HOLD_WRITES = "(() => { const send = window.fetch; window.fetch = function (url, how) { " +
  "if (!how || how.method !== 'PUT' || window.putFree) return send.call(window, url, how); " +
  "return new Promise((go) => { window.putGo = () => go(send.call(window, url, how)); }); }; })();";

export function losses({ tab, idle, said, noticed, choose, typeAtEnd, openInDialog }) {
  const held = (d) => d.until("document.querySelector('.menubar .state').textContent.includes('draft')");
  const state = (d) => d.js("document.querySelector('.menubar .state').textContent");
  const docName = (d) => d.js("document.querySelector('.menubar .doc-name').textContent");
  // Reloads the page, and waits for the new one, unless a dialog kept the old one.
  const reload = (d) => d.reload("document.documentElement.dataset.files === 'ready'", 3000);
  const focus = async (d) => {
    await d.js("window.dispatchEvent(new Event('focus'))");
    await idle(d);
  };

  return {
    // A refused document never becomes the one a save writes to.
    async refusedOpen(ctx) {
      const before = ctx.disk("top.ksmd");
      fs.writeFileSync(path.join(ctx.root, "later.ksmd"), REFUSED);
      const d = await tab(ctx, "?doc=top.ksmd");
      await typeAtEnd(d, 1, " Kept.");
      const edited = await d.js("ksmd.source()");
      await openInDialog(d, ["later.ksmd"]);
      check((await said(d)).startsWith("later.ksmd cannot be opened") && await docName(d) === "top.ksmd" &&
        await d.js("location.search") === "?doc=top.ksmd" && await d.js("ksmd.source()") === edited,
      "a document the reader refuses does not open: the open one stays, with its edits", await said(d));
      await d.press("s", CTRL);
      await idle(d);
      check(ctx.disk("top.ksmd") === edited && ctx.disk("later.ksmd") === REFUSED,
        "a save after it writes the open document's own file, and leaves the refused one");
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
      await ctx.browser.closeTab(d.page);

      // Opened from the address, the refused path leaves it, so a reload finds the new document's draft.
      const e = await tab(ctx, "?doc=later.ksmd");
      check((await said(e)).startsWith("later.ksmd cannot be opened") && await e.js("location.search") === "",
        "a refused document named in the address leaves the address", await e.js("location.search"));
      await e.clickBelow();
      await e.type("Begun.");
      await held(e);
      await reload(e);
      check((await noticed(e)).startsWith("Unsaved edits to a new document"),
        "a reload then offers the draft of the new document typed there", await noticed(e));
      await choose(e, "Discard them");
      await ctx.browser.closeTab(e.page);
      fs.rmSync(path.join(ctx.root, "later.ksmd"), { force: true });
    },

    // A file changed on disk into one the reader refuses: the page keeps what it showed.
    async refusedChange(ctx) {
      const before = ctx.disk("top.ksmd");
      const d = await tab(ctx, "?doc=top.ksmd");
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), REFUSED);
      await focus(d);
      check(await d.js("ksmd.source()") === before && !(await said(d)).includes("as it is now") &&
        (await said(d)).includes("cannot be opened"),
      "a file changed into one the reader refuses is not said to be shown", await said(d));
      await typeAtEnd(d, 1, " Mine.");
      await d.press("s", CTRL);
      await idle(d);
      check((await noticed(d)).includes("changed on disk") && ctx.disk("top.ksmd") === REFUSED,
        "a save then asks before it replaces that file", await noticed(d));
      await choose(d, "Replace the file");
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
      await ctx.browser.closeTab(d.page);
    },

    // The server compares the file once more as it writes, so a change made meanwhile stays.
    async changeWhileSaving(ctx) {
      const before = ctx.disk("top.ksmd");
      const d = await tab(ctx, "?doc=top.ksmd", HOLD_WRITES);
      await typeAtEnd(d, 1, " Waiting.");
      await d.press("s", CTRL);
      await d.until("typeof window.putGo === 'function'");
      const theirs = `${before}\nAdded while the save waited.\n`;
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), theirs);
      await d.js("window.putGo()");
      await idle(d);
      check(ctx.disk("top.ksmd") === theirs && (await noticed(d)).includes("changed on disk"),
        "a file changed while a save waits is not overwritten, and the page asks",
        `${await noticed(d)} | ${await said(d)} | ${ctx.disk("top.ksmd").slice(10, 50)}`);
      await d.js("window.putFree = true");
      await choose(d, "Replace the file");
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
      await ctx.browser.closeTab(d.page);
    },

    // A step the source limits refuse changes nothing, so nothing waits to be saved.
    async refusedStep(ctx) {
      fs.writeFileSync(path.join(ctx.root, "steps.ksmd"), `${H}Text.\n`);
      const d = await tab(ctx, "?doc=steps.ksmd");
      await d.select(0, 0, 5);
      await d.js(`(() => {
        const data = new DataTransfer();
        data.setData("text/plain", "x\\n".repeat(100001));
        document.getElementById("doc").dispatchEvent(new ClipboardEvent("paste",
          { clipboardData: data, bubbles: true, cancelable: true }));
      })()`);
      await d.settle();
      check(await d.js("ksmd.source()") === `${H}Text.\n` && await state(d) === "",
        "a paste past 100,000 blocks is refused, and the page does not say unsaved", await said(d));
      await ctx.browser.closeTab(d.page);
      fs.rmSync(path.join(ctx.root, "steps.ksmd"), { force: true });
    },

    // A cell value the editor refuses stays in its cell, in the draft, and when the draft comes back.
    async refusedCell(ctx) {
      fs.writeFileSync(path.join(ctx.root, "long.ksmd"), CELLS);
      const open = "document.querySelector('#doc .cell-input')";
      const d = await tab(ctx, "?doc=long.ksmd");
      await d.openCell('#doc td[data-r="0"][data-c="0"]');
      await d.js(`(() => { const i = ${open}; i.value = ${JSON.stringify(LONG)}; ` +
        "i.dispatchEvent(new Event('input', { bubbles: true })); })()");
      await d.press("Enter");
      await d.settle();
      check(await d.js(`!!${open} && ${open}.value.length`) === LONG.length,
        "a formula longer than a cell holds stays in its open cell", await said(d));
      await held(d);
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx, "?doc=long.ksmd");
      await choose(e, "Bring them back");
      check(await e.js(`!!${open} && ${open}.value`) === LONG && ctx.disk("long.ksmd") === CELLS,
        "the draft brings it back into its open cell, not into the document", await said(e));
      check(await held(e), "and a draft still holds it", await state(e));
      await ctx.browser.closeTab(e.page);
      const f = await tab(ctx, "?doc=long.ksmd");
      check((await noticed(f)).includes("held aside as a draft"), "so it outlives that tab too");
      await choose(f, "Discard them");
      await ctx.browser.closeTab(f.page);
      fs.rmSync(path.join(ctx.root, "long.ksmd"), { force: true });
    },

    // A save, or a document that does not open, leaves a cell value the editor refuses in its cell.
    async refusedCellStays(ctx) {
      fs.writeFileSync(path.join(ctx.root, "long.ksmd"), CELLS);
      fs.writeFileSync(path.join(ctx.root, "later.ksmd"), REFUSED);
      const open = "document.querySelector('#doc .cell-input')";
      const d = await tab(ctx, "?doc=long.ksmd");
      await d.openCell('#doc td[data-r="0"][data-c="0"]');
      await d.js(`(() => { const i = ${open}; i.value = ${JSON.stringify(LONG)}; ` +
        "i.dispatchEvent(new Event('input', { bubbles: true })); })()");
      await held(d);
      await d.press("s", CTRL);
      await idle(d);
      check(await d.js(`!!${open} && ${open}.value`) === LONG && ctx.disk("long.ksmd") === CELLS &&
        !(await said(d)).startsWith("Saved"),
      "a save writes nothing while the open cell holds text the editor refuses, and the text stays",
      await said(d));
      check(await held(d), "and a draft still holds it", await state(d));
      await d.menu("file-save");
      await idle(d);
      check(await d.js(`!!${open} && ${open}.value`) === LONG && ctx.disk("long.ksmd") === CELLS,
        "File, Save in the menu leaves the text in its cell as well", await said(d));
      // Ctrl+O opens the dialog; File, Open would first take the cell, and so does nothing.
      await d.press("o", CTRL);
      const later = "Array.from(document.querySelectorAll('#browse .browse-list button'))" +
        ".find((b) => b.textContent === 'later.ksmd')";
      await d.until(`!!${later}`);
      await d.js(`${later}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      await idle(d);
      check(await d.js(`!!${open} && ${open}.value`) === LONG && await docName(d) === "long.ksmd" &&
        (await said(d)).includes("open cell"),
      "a document that does not open leaves the text in its cell too", await said(d));
      await d.js("document.dispatchEvent(new Event('visibilitychange'))");
      await idle(d);
      check(await held(d), "and a draft still holds it", await state(d));
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx, "?doc=long.ksmd");
      check((await noticed(e)).includes("held aside as a draft"), "so the next tab offers it", await noticed(e));
      await choose(e, "Discard them");
      await ctx.browser.closeTab(e.page);
      fs.rmSync(path.join(ctx.root, "long.ksmd"), { force: true });
      fs.rmSync(path.join(ctx.root, "later.ksmd"), { force: true });
    },

    // The browser keeps drafts, but its storage is full: no step may act as if one were held.
    async fullStore(ctx) {
      const before = ctx.disk("top.ksmd");
      const d = await tab(ctx, "?doc=top.ksmd", FULL);
      await typeAtEnd(d, 1, " Unheld.");
      const edited = await d.js("ksmd.source()");
      await openInDialog(d, ["parts", "notes.ksmd"]);
      check((await noticed(d)).includes("could not hold a draft") && await docName(d) === "top.ksmd" &&
        await d.js("ksmd.source()") === edited,
      "opening another document asks first where no draft could be held", await noticed(d));
      await choose(d, "Cancel");
      const theirs = `${before}\nAdded on disk.\n`;
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), theirs);
      await focus(d);
      const labels = await d.js("Array.from(document.querySelectorAll('#notice button'))" +
        ".map((b) => b.textContent).join('|')");
      check(labels.includes("discard mine") && !labels.includes("keep mine"),
        "a change on disk does not offer to keep the edits as a draft that cannot be held", labels);
      await choose(d, "Keep editing");
      check(await d.js("ksmd.source()") === edited, "and the edits stay");
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
      await ctx.browser.closeTab(d.page);
    },

    // Leaving the page asks first while no draft holds the edits: none can be held, or the last
    // edits are not in it yet. A draft written as the page goes may not land.
    async leave(ctx) {
      const d = await tab(ctx, "?doc=top.ksmd", NO_STORE);
      await typeAtEnd(d, 1, " Unkept.");
      const edited = await d.js("ksmd.source()");
      await d.js("new Promise((r) => setTimeout(r, 1500))");
      await reload(d);
      check(d.page.dialogs.includes("beforeunload") && await d.js("ksmd.source()") === edited,
        "leaving with edits no draft can hold asks first, and staying keeps them", d.page.dialogs.join(" "));
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx, "?doc=top.ksmd");
      await typeAtEnd(e, 1, " Quick.");
      const quick = await e.js("ksmd.source()");
      await reload(e);
      check(e.page.dialogs.includes("beforeunload") && await e.js("ksmd.source()") === quick,
        "leaving straight after typing, before a draft holds it, asks first", e.page.dialogs.join(" "));
      await held(e);
      await reload(e);
      check(e.page.dialogs.length === 1 && (await noticed(e)).includes("held aside"),
        "once a draft holds the edits, leaving does not ask, and the draft comes back", await noticed(e));
      await choose(e, "Bring them back");
      check(await e.js("ksmd.source()") === quick, "with every edit in it", await e.js("ksmd.source()"));
      // A save lets the draft go; the file is then put back.
      const before = ctx.disk("top.ksmd");
      await e.press("s", CTRL);
      await idle(e);
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
      await ctx.browser.closeTab(e.page);
    },
  };
}
