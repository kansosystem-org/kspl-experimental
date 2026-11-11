// The served page, shown again by work that ended later while the person is in the middle of
// something: typing in the find bar or in Insert Function, reading a message, composing in a cell,
// typing in a cell while a pasted image is saved, or typing in the formula bar. Each keeps what
// the person was doing.
// A table also stands still while a bar or a dialog holds the focus, so a press lands where aimed.
// The showing is made to come at a known moment: an include changes on disk, and the window is
// looked at again (`check` in `ksmd/port/web/file.js`), which fetches it and shows the tables again.
// `redraws(t)` takes `served.mjs`'s helpers, and returns its section.
import fs from "fs";
import path from "path";
import { CTRL, H, SHIFT, check } from "./drive.mjs";

// The part holds a table, so each change to it shows a table again: a table whose values stay
// is not drawn again (`apply` in `ksmd/port/web/view.js`).
const PART = (n) => `${H}Part ${n}.\n\n:::table name="p"\n| "n" |\n| ${n} |\n:::\n`;
const DOC = `${H}First paragraph.\n\n:::include path="redraw-part.ksmd"\n:::\n\n:::table name="t"\n` +
  "| \"a\" | \"b\" |\n| 1 | =A1*2 |\n| 2 | =A2*2 |\n:::\n\nLast paragraph.\n";
// The caret stands in a gap, an empty line, above the table: no text stands before it.
const GAPPED = `${H}:::include path="redraw-part.ksmd"\n:::\n\n:::table name="t"\n| "a" | "b" |\n| 1 | =A1*2 |\n:::\n`;
// Sets `window.__left` once the page has had a `selectionchange` that took the selection out of
// the document, as the focus going into a dialog or a bar does.
const LEFT = `(() => { window.__left = false; document.addEventListener("selectionchange", () => {
  const s = getSelection();
  if (s.rangeCount > 0 && !document.getElementById("doc").contains(s.focusNode)) window.__left = true;
}); })()`;
// Holds the next \`close\` event of a dialog until the check lets it go with \`window.__close()\`.
const HOLD_CLOSE = `(() => { window.addEventListener("close", (e) => {
  if (window.__close) return;
  e.stopImmediatePropagation();
  window.__close = () => e.target.dispatchEvent(new Event("close"));
}, true); })()`;
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

export function redraws({ withTab }) {
  return {
    async redraws(ctx) {
      let n = 0;
      let k = 0;
      const part = path.join(ctx.root, "redraw-part.ksmd");
      // Runs `fn` on a new tab on `doc`, written to a file of its own, once its table shows.
      const inTab = (doc, fn) => {
        n += 1;
        fs.writeFileSync(part, PART(0));
        fs.writeFileSync(path.join(ctx.root, `redraw-${n}.ksmd`), doc);
        return withTab(ctx, `?doc=redraw-${n}.ksmd`, async (d) => {
          await d.until("!!document.querySelector('#doc td')");
          await d.js(WATCH);
          return fn(d);
        });
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
      await inTab(DOC, async (d) => {
        await d.select(0, 0, 5);
        await d.press("f", CTRL);
        await d.until("!document.querySelector('.find').hidden && document.activeElement.classList.contains('find-text')");
        await d.type("par");
        const drawn = await later(d);
        await d.type("ag");
        check(drawn && await d.js("document.querySelector('.find-text').value") === "parag" &&
          await line(d, 2) === "First paragraph.", "keys typed in the find bar while the tables are shown again stay in it",
        `drawn ${drawn}; box ${await d.js("document.querySelector('.find-text').value")}; line ${await line(d, 2)}`);
      });

      // Insert Function's search likewise: a key there was lost.
      await inTab(DOC, async (d) => {
        await d.select(0, 0, 5);
        await d.press("F3", SHIFT);
        await d.until("document.activeElement && document.activeElement.closest && !!document.activeElement.closest('dialog')");
        await d.type("su");
        const drawn = await later(d);
        await d.type("m");
        const searched = await d.js("document.activeElement.value");
        check(drawn && searched === "sum" && await line(d, 2) === "First paragraph.",
          "keys typed in Insert Function's search while the tables are shown again stay in it",
          `drawn ${drawn}; box ${searched}; line ${await line(d, 2)}`);
      });

      // **A message stays**: a showing nobody asked for cleared it, seconds after a document
      // with its own functions opened.
      await inTab(DOC, async (d) => {
        await d.js("document.getElementById('status').textContent = 'Saved x.'");
        const drawn = await later(d);
        const status = await d.js("document.getElementById('status').textContent");
        check(drawn && status === "Saved x.", "the status bar's message stays while the tables are shown again",
          `drawn ${drawn}; status ${JSON.stringify(status)}`);
      });

      // **A composition in an open cell goes in once.** Moving the box being composed in ended
      // the composition, and what was composed went in twice ("かん漢素"). The showing waits until
      // the composition ends.
      await inTab(DOC, async (d) => {
        await d.openCell('#doc .table[data-name="t"] td[data-r="0"][data-c="0"]');
        await d.until("!!document.querySelector('#doc .cell-input')");
        await d.js("document.querySelector('#doc .cell-input').select()");
        await d.page("Input.imeSetComposition", { text: "かん", selectionStart: 2, selectionEnd: 2 });
        const before = await d.js("window.__drawn");
        // Shown at once where it does not wait: the fetch takes milliseconds.
        await later(d, 3000);
        const during = await d.js(`window.__drawn > ${before}`);
        await d.page("Input.imeSetComposition", { text: "かんそ", selectionStart: 3, selectionEnd: 3 });
        await d.page("Input.insertText", { text: "漢素" });
        const drawn = await d.until(`window.__drawn > ${before}`, 10000);
        const box = await d.js("(document.querySelector('#doc .cell-input') || { value: null }).value");
        await d.press("Enter");
        await d.settle();
        check(!during && drawn && box === "漢素" && (await rows(d)).includes('| \\"漢素\\" |'),
          "a composition in an open cell goes in once, and the tables are shown again after it ends",
          `shown during ${during}; after ${drawn}; box ${JSON.stringify(box)}; rows ${await rows(d)}`);
      });

      // **A pasted image goes where it was pasted, and a cell typed in while it is saved keeps
      // what is typed.** The image went where the cell was, before the table, and the cell's
      // text was lost.
      await inTab(DOC, async (d) => {
        await d.js(HOLD_IMAGES);
        await d.select(0, 0, 16);
        await d.js(`(() => {
          const b = Uint8Array.from(atob("${DOT}"), (c) => c.charCodeAt(0));
          const data = new DataTransfer();
          data.items.add(new File([b], "dot.png", { type: "image/png" }));
          document.getElementById("doc").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
        })()`);
        await d.until("!!window.__go", 10000);
        await d.openCell('#doc .table[data-name="t"] td[data-r="0"][data-c="0"]');
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
      });

      // **An edit in the formula bar keeps its text, its caret and the focus.** The bar is not
      // drawn again, and the cell's copy of its text comes back in the table drawn again.
      await inTab(DOC, async (d) => {
        const bar = ".formula-bar .formula-input";
        await d.click('#doc .table[data-name="t"] td[data-r="0"][data-c="0"]');
        await d.until("document.querySelector('.formula-address').textContent === 'A1'");
        await d.click(bar);
        await d.until(`document.activeElement === document.querySelector('${bar}')`);
        await d.js("document.activeElement.setSelectionRange(1, 1)");
        await d.type("2");
        const drawn = await later(d);
        await d.type("3");
        const kept = await d.js(`[document.activeElement === document.querySelector('${bar}'), ` +
          "document.activeElement.value, (document.querySelector('#doc .cell-mirror') || { value: null }).value]");
        await d.press("Enter");
        await d.settle();
        check(drawn && kept[0] && kept[1] === "123" && kept[2] === "123" && (await rows(d)).includes("| 123 | =A1*2 |"),
          "an edit in the formula bar keeps its text, its caret and the focus while the tables are shown again",
          `drawn ${drawn}; kept ${JSON.stringify(kept)}; rows ${await rows(d)}`);
      });

      // **The table stays where it stands while the focus is in a bar or a dialog.** The caret's
      // empty line above the table went when the focus left the document, and came back with
      // it, so the table moved up a line and back down. A press made as Insert Function closed
      // landed a row too high, on the column's name, and what was typed renamed the column.
      const a1 = '#doc .table[data-name="t"] td[data-r="0"][data-c="0"]';
      // Where the cell stands in the document, which a bar at the top moves as a whole.
      const top = (dd) => dd.js(`Math.round(document.querySelector('${a1}').getBoundingClientRect().top -
        document.getElementById("doc").getBoundingClientRect().top)`);
      await inTab(GAPPED, async (d) => {
        await d.js(LEFT);
        const gapped = await d.js("!!document.querySelector('#doc .gap')");
        const t0 = await top(d);
        await d.press("F3", SHIFT);
        const left = await d.until("window.__left && !!document.activeElement.closest('dialog')");
        const t1 = await top(d);
        await d.js(HOLD_CLOSE);
        await d.press("Escape");
        const held = await d.until("!!window.__close");
        // The press is aimed where the cell stands as the dialog's close event comes.
        const [x, y] = await d.js(`(() => { const r = document.querySelector('${a1}').getBoundingClientRect(); ` +
          "return [r.left + r.width / 2, r.top + r.height / 2]; })()");
        await d.js("window.__close()");
        for (const type of ["mousePressed", "mouseReleased"]) {
          await d.page("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
        }
        await d.type("5");
        await d.press("Enter");
        await d.settle();
        check(gapped && left && held && t1 === t0 && (await rows(d)).includes("| 5 | =A1*2 |"),
          "a press made as Insert Function closes chooses the cell aimed at, the table standing still",
          `gap ${gapped}; left ${left}; held ${held}; top ${t0} then ${t1}; rows ${await rows(d)}`);
      });

      // The tables shown again while the person types in the find bar keep the empty line too.
      await inTab(GAPPED, async (d) => {
        await d.js(LEFT);
        const s0 = await top(d);
        await d.press("f", CTRL);
        const finding = await d.until("window.__left && document.activeElement.classList.contains('find-text')");
        const s1 = await top(d);
        const drawn = await later(d);
        const s2 = await top(d);
        await d.press("Escape");
        const back = await d.until("document.activeElement === document.getElementById('doc')");
        const s3 = await top(d);
        check(finding && drawn && back && s1 === s0 && s2 === s0 && s3 === s0,
          "the table stands still while the find bar is open and the tables are shown again",
          `find ${finding}; drawn ${drawn}; back ${back}; top ${s0}, ${s1}, ${s2}, ${s3}`);
      });
      for (let i = 1; i <= n; i++) fs.rmSync(path.join(ctx.root, `redraw-${i}.ksmd`), { force: true });
      fs.rmSync(path.join(ctx.root, `redraw-${n}-data`), { recursive: true, force: true });
      fs.rmSync(part, { force: true });
    },
  };
}
