// The served page's own functions: a `:::functions` clause, its file built by the local server's
// builder and run in a worker. An answer, text, too many arguments, a function that never ends,
// and a file the build refuses, each shown where a person looks: the cell and the clause's box.
// Insert, Include is here too: it picks or starts a file through the same dialog.
// `own(t)` takes `served.mjs`'s helpers, and returns its sections.
import fs from "fs";
import path from "path";
import { verdict } from "./drive.mjs";

const check = (ok, what, detail) => verdict.check(ok, what, detail);
const H = "%ksmd 1\n\n";
const MINE = `//< Functions for the test
import "std/mem" { Arena }
import "std/str"

pub fn tax(price: F64, rate: F64?): F64 //< the price with its tax
    return price * (1.0 + rate.unwrap_or(0.1))

pub fn greet(name: U8[], arena: Arena$@): U8[] //< a greeting
    return arena.text().s("hello, ").s(name).take()

pub fn forever(n: F64): F64 //< never ends
    $x: = n
    for x == x
        x += 1.0
    return x
`;
// A name ksmd already has, which the build refuses.
const TAKEN = "pub fn sum(x: F64): F64\n    return x\n";
const SHEET = `${H}:::functions path="mine.kspl"\n:::\n\n:::table name="t"\n| "a" | "b" |\n` +
  "| 100 | =tax(A1) |\n| \"kanso\" | =greet(A2) |\n| 2 | =tax(A3, 0.5, 9) |\n" +
  "| 1 | =forever(A4) |\n:::\n";
const REFUSED = `${H}:::functions path="taken.kspl"\n:::\n`;
const PLAIN = `${H}Text.\n`;

export function own({ tab, idle, said }) {
  const cell = (d, r) => d.js(`document.querySelector('#doc td[data-r="${r}"][data-c="1"]').textContent`);
  const box = (d) => d.js("document.querySelector('#doc .functions .functions-state').textContent");

  return {
    async functions(ctx) {
      if (!ctx.builder) {
        verdict.skip("no builder was given, so a document's own functions are not checked");
        return;
      }
      fs.writeFileSync(path.join(ctx.root, "mine.kspl"), MINE);
      fs.writeFileSync(path.join(ctx.root, "sheet.ksmd"), SHEET);
      const d = await tab(ctx, "?doc=sheet.ksmd");
      check(await d.until("document.querySelector('#doc .functions .functions-state')" +
        ".textContent.startsWith('A formula can call')", 60000),
      "the clause's box names the functions its file gives", await box(d));
      check(await d.until(`document.querySelector('#doc td[data-r="0"][data-c="1"]').textContent === "110"`),
        "a cell shows a person's function's answer", await cell(d, 0));
      check(await cell(d, 1) === "hello, kanso", "a function's text shows in its cell", await cell(d, 1));
      check(await cell(d, 2) === "#SYNTAX!",
        "too many arguments is a formula that does not read, as for ksmd's own", await cell(d, 2));
      check(await d.until(`document.querySelector('#doc td[data-r="3"][data-c="1"]').textContent === "#TIME!"`,
        15000), "a function that never ends shows #TIME! once its time is up", await cell(d, 3));
      await ctx.browser.closeTab(d.page);

      fs.writeFileSync(path.join(ctx.root, "taken.kspl"), TAKEN);
      fs.writeFileSync(path.join(ctx.root, "refused.ksmd"), REFUSED);
      const r = await tab(ctx, "?doc=refused.ksmd");
      check(await r.until("!!document.querySelector('#doc .functions .functions-state.problem')", 60000) &&
        (await box(r)).includes("taken.kspl") && (await box(r)).includes("`sum`"),
      "a file giving a name ksmd has is refused at its clause, naming the file and the name",
      await box(r));
      await ctx.browser.closeTab(r.page);

      // Insert, Functions starts a file where none stands, and puts its clause at the caret.
      fs.mkdirSync(path.join(ctx.root, "notes"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "notes/plain.ksmd"), PLAIN);
      const p = await tab(ctx, "?doc=notes/plain.ksmd");
      await p.select(0, 0, 5);
      await p.menu("functions");
      await p.until("document.getElementById('browse').open && " +
        "document.querySelector('#browse .browse-name').value === 'functions.kspl'");
      await p.js("document.querySelector('#browse [data-browse=\"ok\"]').click()");
      await idle(p);
      const started = ctx.disk("notes/functions.kspl");
      check(typeof started === "string" && started.includes("pub fn twice"),
        "Insert, Functions starts a functions file beside the document", String(started));
      check(await p.js("ksmd.source()").then((s) => s.includes(':::functions path="functions.kspl"')),
        "and puts its clause at the caret", await p.js("ksmd.source()"));
      check(await p.until("(document.querySelector('#doc .functions .functions-state') || {})" +
        ".textContent === 'A formula can call: twice.'", 60000),
      "and the clause's box lists the function the new file gives", await box(p));
      await ctx.browser.closeTab(p.page);
    },

    async includeInsert(ctx) {
      fs.mkdirSync(path.join(ctx.root, "host/sub"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "host/host.ksmd"), PLAIN);
      fs.writeFileSync(path.join(ctx.root, "host/sub/existing.ksmd"), `${H}Included text.\n`);
      const d = await tab(ctx, "?doc=host/host.ksmd");
      const dialog = async (name) => {
        await d.select(0, 0, 5);
        await d.menu("include");
        await d.until("document.getElementById('browse').open && " +
          `document.querySelector('#browse .browse-name').value === ${JSON.stringify(name)}`);
      };
      const button = (text) => `Array.from(document.querySelectorAll('#browse .browse-list button'))
        .find((b) => b.textContent === ${JSON.stringify(text)})`;
      const source = () => d.js("ksmd.source()");

      await dialog("part.ksmd");
      await d.js("document.querySelector('#browse [data-browse=\"ok\"]').click()");
      await idle(d);
      check(ctx.disk("host/part.ksmd") === "%ksmd 1\n",
        "Insert, Include starts an empty document beside the open one", String(ctx.disk("host/part.ksmd")));
      check((await source()).includes(':::include path="part.ksmd"'), "and puts its clause at the caret",
        await source());

      await dialog("part.ksmd");
      await d.until(`!!${button("sub")}`);
      await d.js(`${button("sub")}.click()`);
      await d.until(`!!${button("existing.ksmd")}`);
      await d.js(`${button("existing.ksmd")}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      await idle(d);
      check((await source()).includes(':::include path="sub/existing.ksmd"'),
        "a document chosen in a folder below is named from the open document's folder", await source());
      check(await d.until("Array.from(document.querySelectorAll('#doc .include .inside'))" +
        ".some((e) => e.textContent.includes('Included text.'))"),
      "and its blocks show in place");

      const before = await source();
      await dialog("part.ksmd");
      await d.until(`!!${button("host.ksmd")}`);
      await d.js(`${button("host.ksmd")}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
      await idle(d);
      check(await source() === before && (await said(d)).includes("cannot include itself"),
        "a document does not include itself, and the page says so", await said(d));
      await ctx.browser.closeTab(d.page);
    },
  };
}
