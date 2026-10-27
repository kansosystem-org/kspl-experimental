// The served page's drafts and tabs: text typed in a cell still open, a draft brought back over
// newer edits, a browser that keeps no draft, a new document left for another, the images let go,
// the token, and many tabs on one server, which must still save and still let it stop.
// `drafts(t)` takes `served.mjs`'s helpers, and returns its sections.
import fs from "fs";
import path from "path";
import { CTRL, verdict } from "./drive.mjs";

const check = (ok, what, detail) => verdict.check(ok, what, detail);
const H = "%ksmd 1\n\n";
const CELLS = `${H}Text.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`;
// A browser whose settings keep no site data: its IndexedDB refuses to open.
const NO_STORE = "Object.defineProperty(window, 'indexedDB', { get() { " +
  "throw new DOMException('blocked', 'SecurityError'); } });";

export function drafts({ tab, idle, said, noticed, choose, typeAtEnd, start, openInDialog }) {
  const held = (d) => d.until("document.querySelector('.menubar .state').textContent.includes('draft')");
  const state = (d) => d.js("document.querySelector('.menubar .state').textContent");
  const docName = (d) => d.js("document.querySelector('.menubar .doc-name').textContent");

  return {
    async cellDraft(ctx) {
      fs.writeFileSync(path.join(ctx.root, "cells.ksmd"), CELLS);
      const d = await tab(ctx, "?doc=cells.ksmd");
      await d.openCell('#doc td[data-r="0"][data-c="0"]');
      await d.type("9");
      check((await state(d)).startsWith("Not saved"), "text typed in an open cell is unsaved at once",
        await state(d));
      check(await held(d) && await d.js("!!document.querySelector('#doc .cell-input')"),
        "a pause holds it as a draft, and the cell stays open");
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx, "?doc=cells.ksmd");
      await choose(e, "Bring them back");
      check(await e.js("ksmd.source()") === CELLS.replace("| 1 |", "| 19 |") &&
        ctx.disk("cells.ksmd") === CELLS, "the draft brings the cell's text back as its value, unsaved");
      await e.press("s", CTRL);
      await idle(e);
      await ctx.browser.closeTab(e.page);
      fs.rmSync(path.join(ctx.root, "cells.ksmd"), { force: true });
    },

    async bringBack(ctx) {
      fs.writeFileSync(path.join(ctx.root, "back.ksmd"), CELLS);
      const d = await tab(ctx, "?doc=back.ksmd");
      await typeAtEnd(d, 0, " Old.");
      await held(d);
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx, "?doc=back.ksmd");
      await typeAtEnd(e, 0, " New.");
      await choose(e, "Bring them back");
      check((await e.js("ksmd.source()")).includes("Text. Old.") &&
        (await said(e)).includes("edits made since the document opened are held aside"),
      "a draft brought back holds the edits made since opening aside first", await said(e));
      await e.press("s", CTRL);
      await idle(e);
      await ctx.browser.closeTab(e.page);
      const f = await tab(ctx, "?doc=back.ksmd");
      await choose(f, "Bring them back");
      check((await f.js("ksmd.source()")).includes("Text. New."),
        "and those edits come back from their own draft", await f.js("ksmd.source()"));
      await ctx.browser.closeTab(f.page);
      fs.rmSync(path.join(ctx.root, "back.ksmd"), { force: true });
    },

    // Where no draft can be held, leaving a document with unsaved edits asks first.
    async noDraftStore(ctx) {
      const d = await tab(ctx, "?doc=top.ksmd", NO_STORE);
      await typeAtEnd(d, 1, " Unkept.");
      const edited = await d.js("ksmd.source()");
      await openInDialog(d, ["parts", "notes.ksmd"]);
      check((await noticed(d)).includes("could not hold a draft") && await docName(d) === "top.ksmd" &&
        await d.js("ksmd.source()") === edited,
      "opening another document asks first, and changes nothing yet", await noticed(d));
      await choose(d, "Cancel");
      check(await d.js("ksmd.source()") === edited, "Cancel keeps the edits");
      await openInDialog(d, ["parts", "notes.ksmd"]);
      await choose(d, "Discard my edits");
      check(await docName(d) === "parts/notes.ksmd" && ctx.disk("top.ksmd") !== edited,
        "Discard opens the other document and writes nothing", await said(d));
      await ctx.browser.closeTab(d.page);
    },

    // A new document has no path: the page says how its draft comes back, and it does.
    async newDraft(ctx) {
      const d = await tab(ctx);
      await d.clickBelow();
      await d.type("Fresh draft.");
      await held(d);
      await openInDialog(d, ["top.ksmd"]);
      check((await said(d)).includes("without \"?doc=\""),
        "opening a document over a new one says how the new one's draft comes back", await said(d));
      await ctx.browser.closeTab(d.page);
      const e = await tab(ctx);
      check((await noticed(e)).startsWith("Unsaved edits to a new document"),
        "the page opened on no document offers it", await noticed(e));
      await choose(e, "Discard them");
      await ctx.browser.closeTab(e.page);
    },

    // An image's bytes and its URL go when another document opens.
    async letGo(ctx) {
      const d = await tab(ctx, "?doc=top.ksmd");
      const img = "document.querySelector('figure[data-to=\"pics/dot.png\"] img')";
      await d.until(`!!${img} && ${img}.complete`);
      const url = await d.js(`${img}.src`);
      await openInDialog(d, ["parts", "notes.ksmd"]);
      check(await d.js(`fetch(${JSON.stringify(url)}).then(() => "kept", () => "let go")`) === "let go",
        "opening another document lets go the images of the one before");
      await ctx.browser.closeTab(d.page);
    },

    // The token comes only from the fragment's own `t=`, in its own form.
    async token(ctx) {
      const d = await tab(ctx, "?doc=top.ksmd");
      for (const fragment of ["#heart=1", "#t=not-a-token"]) {
        await d.js(`location.hash = ${JSON.stringify(fragment)}`);
        check(await d.reload("document.documentElement.dataset.files === 'ready'") &&
          await d.js("sessionStorage.getItem('ksmd.token')") === ctx.server.token,
        `a reload with ${fragment} keeps the token`, await d.js("sessionStorage.getItem('ksmd.token')"));
      }
      await ctx.browser.closeTab(d.page);
    },

    // One tab holds the server for all, so six tabs leave the browser's connections for saves.
    async manyTabs(ctx) {
      const before = ctx.disk("top.ksmd");
      const tabs = [];
      for (let k = 0; k < 6; k++) tabs.push(await tab(ctx, "?doc=top.ksmd"));
      const d = tabs[0];
      await typeAtEnd(d, 1, " Six.");
      await d.press("s", CTRL);
      await idle(d);
      const mine = await d.js("ksmd.source()");
      check(mine.includes(" Six.") && ctx.disk("top.ksmd") === mine &&
        await said(d) === "Saved top.ksmd.", "with six tabs open on one server, a save goes out",
      await said(d));
      for (const t of tabs) await ctx.browser.closeTab(t.page);
      fs.writeFileSync(path.join(ctx.root, "top.ksmd"), before);
    },

    // The hold passes to another tab when its tab closes, and the server stops once none is open.
    async idleStop(ctx) {
      const server = await start(ctx.kssrv, ctx.root, ctx.pageFile, path.join(ctx.work, "idle.log"),
        ["--idle=2"]);
      let gone = false;
      server.child.on("exit", () => {
        gone = true;
      });
      const own = { ...ctx, server };
      const a = await tab(own, "?doc=top.ksmd");
      const b = await tab(own, "?doc=top.ksmd");
      // A request just before, so this check does not depend on when the server's wait starts.
      await b.js("fetch('/api/status', { headers: { Authorization: " +
        "`Bearer ${sessionStorage.getItem('ksmd.token')}` } }).then((r) => r.status)");
      await ctx.browser.closeTab(a.page);
      await new Promise((r) => setTimeout(r, 3500));
      check(!gone, "closing the tab that holds the server hands the hold to another tab");
      await ctx.browser.closeTab(b.page);
      for (let waited = 0; waited < 8000 && !gone; waited += 100) {
        await new Promise((r) => setTimeout(r, 100));
      }
      check(gone, "with no tab open, the server stops after its idle time");
      if (!gone) await server.stop();
    },
  };
}
