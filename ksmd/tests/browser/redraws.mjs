// The served page, shown again by work that ended later while the person is in the middle of
// something: typing in the find bar or in Insert Function, reading a message, composing in a cell,
// or typing in a cell while a pasted image is saved. Each keeps what the person was doing.
// The showing is made to come at a known moment: an include changes on disk, and the window is
// looked at again (`check` in `ksmd/port/web/file.js`), which fetches it and shows the tables again.
// `redraws(t)` takes `served.mjs`'s helpers, and returns its section.
import fs from "fs";
import path from "path";
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const check = (ok, what, detail) => verdict.check(ok, what, detail);
const H = "%ksmd 1\n\n";
const PART = (n) => `${H}Part ${n}.\n`;
const DOC = `${H}First paragraph.\n\n:::include path="redraw-part.ksmd"\n:::\n\n:::table name="t"\n` +
  "| \"a\" | \"b\" |\n| 1 | =A1*2 |\n| 2 | =A2*2 |\n:::\n\nLast paragraph.\n";
// Counts each table drawn again, in `window.__drawn`.
const WATCH = `(() => { window.__drawn = 0; new MutationObserver((l) => {
  if (l.some((m) => [...m.addedNodes].some((x) => x.querySelector && x.querySelector("td")))) window.__drawn++;
}).observe(document.getElementById("doc"), { childList: true, subtree: true }); })()`;
// Holds each write of an image until the check lets it go with `window.__go()`.
const HOLD_IMAGES = `(() => { const send = window.fetch; window.fetch = (u, o) =>
  o && o.method === "PUT" && String(u).includes(".png") ?
    new Promise((go) => { window.__go = () => go(send(u, o)); }) : send(u, o); })()`;
// A PNG of one pixel.
const DOT = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function redraws({ tab }) {
  return {
    async redraws(ctx) {
      let n = 0;
      let k = 0;
      const part = path.join(ctx.root, "redraw-part.ksmd");
      const open = async () => {
        n += 1;
        fs.writeFileSync(part, PART(0));
        fs.writeFileSync(path.join(ctx.root, `redraw-${n}.ksmd`), DOC);
        const d = await tab(ctx, `?doc=redraw-${n}.ksmd`);
        await d.until("!!document.querySelector('#doc td')");
        await d.js(WATCH);
        return d;
      };
      // The include changes, and the window is looked at again: the tables are shown again soon.
      const later = async (d, ms = 10000) => {
        k += 1;
        fs.writeFileSync(part, PART(k));
        const before = await d.js("window.__drawn");
        await d.js("window.dispatchEvent(new Event('focus'))");
        return d.until(`window.__drawn > ${before}`, ms);
      };
      const line = async (d, i) => (await d.js("ksmd.source()")).split("\n")[i];
      const rows = async (d) => JSON.stringify((await d.js("ksmd.source()")).split("\n").filter((l) => l.startsWith("|")));

      // **Keys typed in the find bar stay there**: putting the caret back in the document took
      // the focus, and the next keys went into the text.
      let d = await open();
      await d.select(0, 0, 5);
      await d.press("f", CTRL);
      await d.until("!document.querySelector('.find').hidden && document.activeElement.classList.contains('find-text')");
      await d.type("par");
      let drawn = await later(d);
      await d.type("ag");
      check(drawn && await d.js("document.querySelector('.find-text').value") === "parag" &&
        await line(d, 2) === "First paragraph.", "keys typed in the find bar while the tables are shown again stay in it",
      `drawn ${drawn}; box ${await d.js("document.querySelector('.find-text').value")}; line ${await line(d, 2)}`);
      await ctx.browser.closeTab(d.page);

      // Insert Function's search likewise: a key there was lost.
      d = await open();
      await d.select(0, 0, 5);
      await d.press("F3", SHIFT);
      await d.until("document.activeElement && document.activeElement.closest && !!document.activeElement.closest('dialog')");
      await d.type("su");
      drawn = await later(d);
      await d.type("m");
      const searched = await d.js("document.activeElement.value");
      check(drawn && searched === "sum" && await line(d, 2) === "First paragraph.",
        "keys typed in Insert Function's search while the tables are shown again stay in it",
        `drawn ${drawn}; box ${searched}; line ${await line(d, 2)}`);
      await ctx.browser.closeTab(d.page);

      // **A message stays**: a showing nobody asked for cleared it, seconds after a document
      // with its own functions opened.
      d = await open();
      await d.js("document.getElementById('status').textContent = 'Saved x.'");
      drawn = await later(d);
      const status = await d.js("document.getElementById('status').textContent");
      check(drawn && status === "Saved x.", "the status bar's message stays while the tables are shown again",
        `drawn ${drawn}; status ${JSON.stringify(status)}`);
      await ctx.browser.closeTab(d.page);

      // **A composition in an open cell goes in once.** Moving the box being composed in ended
      // the composition, and what was composed went in twice ("かん漢素"). The showing waits until
      // the composition ends.
      d = await open();
      await d.openCell('#doc td[data-r="0"][data-c="0"]');
      await d.until("!!document.querySelector('#doc .cell-input')");
      await d.js("document.querySelector('#doc .cell-input').select()");
      await d.page("Input.imeSetComposition", { text: "かん", selectionStart: 2, selectionEnd: 2 });
      const before = await d.js("window.__drawn");
      // Shown at once where it does not wait: the fetch takes milliseconds.
      await later(d, 3000);
      const during = await d.js(`window.__drawn > ${before}`);
      await d.page("Input.imeSetComposition", { text: "かんそ", selectionStart: 3, selectionEnd: 3 });
      await d.page("Input.insertText", { text: "漢素" });
      drawn = await d.until(`window.__drawn > ${before}`, 10000);
      const box = await d.js("(document.querySelector('#doc .cell-input') || { value: null }).value");
      await d.press("Enter");
      await d.settle();
      check(!during && drawn && box === "漢素" && (await rows(d)).includes('| \\"漢素\\" |'),
        "a composition in an open cell goes in once, and the tables are shown again after it ends",
        `shown during ${during}; after ${drawn}; box ${JSON.stringify(box)}; rows ${await rows(d)}`);
      await ctx.browser.closeTab(d.page);

      // **A pasted image goes where it was pasted, and a cell typed in while it is saved keeps
      // what is typed.** The image went where the cell was, before the table, and the cell's
      // text was lost.
      d = await open();
      await d.js(HOLD_IMAGES);
      await d.select(0, 0, 16);
      await d.js(`(() => {
        const b = Uint8Array.from(atob("${DOT}"), (c) => c.charCodeAt(0));
        const data = new DataTransfer();
        data.items.add(new File([b], "dot.png", { type: "image/png" }));
        document.getElementById("doc").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      })()`);
      await d.until("!!window.__go", 10000);
      await d.openCell('#doc td[data-r="0"][data-c="0"]');
      await d.until("!!document.querySelector('#doc .cell-input')");
      await d.js("document.querySelector('#doc .cell-input').select()");
      await d.type("12");
      await d.js("window.__go()");
      // Caution: **Watch the page, not `ksmd.source()`**: reading the source takes the open cell.
      await d.until("!!document.querySelector('#doc .figure')", 10000);
      await d.type("3");
      await d.press("Enter");
      await d.settle();
      const lines = (await d.js("ksmd.source()")).split("\n");
      const at = (start) => lines.findIndex((l) => l.startsWith(start));
      check((await rows(d)).includes("| 123 |"), "a cell typed in while a pasted image is saved keeps what is typed",
        await rows(d));
      check(at(":::image") > at("First") && at(":::image") < at(":::include"),
        "a pasted image goes where it was pasted, though a cell was opened while it was saved",
        JSON.stringify(lines));
      await ctx.browser.closeTab(d.page);
      for (let i = 1; i <= n; i++) fs.rmSync(path.join(ctx.root, `redraw-${i}.ksmd`), { force: true });
      fs.rmSync(path.join(ctx.root, `redraw-${n}-images`), { recursive: true, force: true });
      fs.rmSync(part, { force: true });
    },
  };
}
