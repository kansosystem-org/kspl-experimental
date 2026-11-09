// The question before a document's own functions run: opening one builds nothing until the person
// allows that exact functions file. Allow, Not now, a reload, a changed file, taking the allow back,
// and a page that asks the server to build anyway. Then the corner that marks a cell computed by
// the document's own code, and what the status bar says of it.
// `trust(t)` takes `served.mjs`'s helpers through `own.mjs`, and returns its sections.
import fs from "fs";
import path from "path";
import { H, check, verdict } from "./drive.mjs";

const MINE = "pub fn tax(price: F64): F64 //< the price with its tax\n    return price * 1.1\n";
// The same file after a colleague changed it in a shared folder.
const CHANGED = "pub fn tax(price: F64): F64 //< the price with its tax\n    return price * 1.2\n";
const SHEET = `${H}:::functions path="mine.kspl"\n:::\n\n:::table name="t"\n| "a" | "b" |\n` +
  "| 100 | =tax(A1) |\n| 7 | =A2 * 2 |\n:::\n";
// Records, before the page's own scripts run, each address the page fetches.
const ASKED = "window.__asked = []; { const f = window.fetch; " +
  "window.fetch = (u, o) => { window.__asked.push(String(u)); return f(u, o); }; }";

export function trust({ tab }) {
  const B1 = '#doc td[data-r="0"][data-c="1"]';
  const cell = (d) => d.js(`document.querySelector('${B1}').textContent`);
  const box = (d) => d.js("document.querySelector('#doc .functions .functions-state').textContent");
  const bar = (d) => d.js("(() => { const b = document.querySelector('.own-ask'); " +
    "return b.hidden ? '' : b.querySelector('.own-ask-text').textContent; })()");
  const status = (d) => d.js("(() => { const s = document.querySelector('.status-own'); " +
    "return s.hidden ? '' : s.textContent; })()");
  const asked = (d) => d.js("window.__asked.filter((u) => u.startsWith('/api/build')).length");
  // What the server answers a page that asks it directly, with the token, to build the file.
  const direct = (d) => d.js(`fetch("/api/build?path=trust%2Fmine.kspl", { method: "POST",
    headers: { Authorization: "Bearer " + sessionStorage.getItem("ksmd.token") } }).then((r) => r.status)`);
  const open = (ctx, script = null) => tab(ctx, "?doc=trust/sheet.ksmd", script);
  const blocked = (d) => d.until(`document.querySelector('${B1}').textContent === "#BLOCKED!"`, 20000);
  const calculated = (d, want) => d.until(`document.querySelector('${B1}').textContent === "${want}"`, 60000);

  return {
    async trust(ctx) {
      if (!ctx.builder) {
        verdict.skip("no builder was given, so the question before own functions run is not checked");
        return;
      }
      fs.mkdirSync(path.join(ctx.root, "trust"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "trust/mine.kspl"), MINE);
      fs.writeFileSync(path.join(ctx.root, "trust/sheet.ksmd"), SHEET);

      // **Opening asks, and builds nothing.**
      const d = await open(ctx, ASKED);
      check(await d.until("!document.querySelector('.own-ask').hidden", 20000) &&
        (await bar(d)).includes("(trust/mine.kspl). They run only if you allow them."),
      "opening a document with its own functions asks, naming the file", await bar(d));
      check(await blocked(d), "a cell that calls one of them shows #BLOCKED!", await cell(d));
      const tip = await d.js(`document.querySelector('${B1}').title`);
      check(tip.includes("not allowed yet"), "the mark explains itself on the cell's tooltip", tip);
      check((await box(d)).includes("not allowed yet") &&
        await d.js("!!document.querySelector('#doc .functions .functions-allow')"),
      "the clause's box says they are not allowed yet, with Allow", await box(d));
      check(await d.js('document.querySelector(\'#doc td[data-r="1"][data-c="1"]\').textContent') === "14",
        "a cell that calls none of them calculates as ever");
      check(await asked(d) === 0, "nothing is built before the person allows it",
        await d.js("window.__asked.join(' ')"));
      check(await direct(d) === 403, "the server refuses to build it, even when the page asks directly");
      await d.click(B1);
      const why = () => d.js("document.querySelector('.status-why').textContent");
      check(await d.until("!document.querySelector('.status-why').hidden") &&
        (await why()).startsWith("#BLOCKED!: tax may be this document's own function"),
      "the status bar says why the cell is blocked", await why());

      await d.js("document.querySelector('.own-ask .own-allow').focus()");
      check(await d.js("document.activeElement.classList.contains('own-allow') && " +
        "document.querySelector('.own-ask').getAttribute('aria-label') !== null"),
      "the bar's Allow is reachable from the keyboard, and the bar is labelled");

      // **Allow builds it**, and the cells calculate.
      await d.click(".own-ask .own-allow");
      check(await calculated(d, "110"), "Allow builds the file, and the cell calculates", await cell(d));
      check(await bar(d) === "" && (await box(d)).startsWith("A formula can call: tax."),
        "the bar goes, and the box names the functions", `${await bar(d)} | ${await box(d)}`);
      check(await asked(d) > 0, "the page builds once allowed");
      check(await d.js(`document.querySelector('${B1}').classList.contains('uses-own')`),
        "a cell computed by the document's own code has its corner mark");
      await d.click('#doc td[data-r="1"][data-c="0"]');
      await d.click(B1);
      check(await d.until("document.querySelector('.status-own').textContent === " +
        "'Uses tax from trust/mine.kspl (this document\\'s own)'"),
      "the status bar names the function and its file", await status(d));
      await ctx.browser.closeTab(d.page);

      // **A reload keeps the allow**: the server holds it, not the tab.
      const again = await open(ctx);
      check(await calculated(again, "110") && await bar(again) === "",
        "opened again, an allowed file builds without asking", `${await cell(again)} | ${await bar(again)}`);
      await ctx.browser.closeTab(again.page);

      // **Changed bytes ask again.** "Not now" puts it off for this opening alone.
      fs.writeFileSync(path.join(ctx.root, "trust/mine.kspl"), CHANGED);
      const changed = await open(ctx, ASKED);
      check(await changed.until("!document.querySelector('.own-ask').hidden", 20000) && await blocked(changed),
        "a file changed since it was allowed asks again, and runs nothing", await cell(changed));
      check(await asked(changed) === 0, "and nothing is built");
      await changed.click(".own-ask .own-not-now");
      check(await changed.until("document.querySelector('.own-ask').hidden") && await cell(changed) === "#BLOCKED!" &&
        (await box(changed)).includes("not allowed yet"), "Not now hides the bar; the cells stay blocked",
      await box(changed));
      await ctx.browser.closeTab(changed.page);
      const later = await open(ctx);
      check(await later.until("!document.querySelector('.own-ask').hidden", 20000),
        "after Not now, the next opening asks again", await bar(later));

      // **The box's Allow does the same**, and its Stop allowing takes the allow back.
      await later.click("#doc .functions .functions-allow");
      check(await calculated(later, "120"), "the box's Allow builds the changed file", await cell(later));
      await later.click("#doc .functions .functions-stop");
      check(await blocked(later) && (await box(later)).includes("not allowed yet") && await bar(later) === "",
        "Stop allowing blocks the cells again, and the box offers Allow", await box(later));
      check(await direct(later) === 403, "and the server refuses to build the file again");
      await ctx.browser.closeTab(later.page);
      const taken = await open(ctx);
      check(await taken.until("!document.querySelector('.own-ask').hidden", 20000) && await blocked(taken),
        "a file whose allow was taken back asks again when opened", await bar(taken));
      await ctx.browser.closeTab(taken.page);
      fs.rmSync(path.join(ctx.root, "trust"), { recursive: true, force: true });
    },
  };
}
