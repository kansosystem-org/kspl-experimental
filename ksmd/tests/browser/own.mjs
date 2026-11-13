// The served page's own functions: a `:::functions` clause, its file built by the local server's
// builder and run in a worker. An answer, text, too many arguments, a function that never ends, a
// panic, a file the build refuses, and one that reaches outside its build, each shown where a
// person looks: the cell and the clause's box.
// Insert, Include is here too: it picks or starts a file through the same dialog.
// Each file is allowed first, as a person does at the bar (`trust.mjs` checks the question).
// `own(t)` takes `served.mjs`'s helpers, and returns its sections and those of `trust.mjs`.
import fs from "fs";
import path from "path";
import { H, SHIFT, cellText, check, verdict } from "./drive.mjs";
import { trust } from "./trust.mjs";

const read = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (_) {
    return null;
  }
};
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

pub fn boom(n: F64): F64 //< stops with a panic
    if n > 0.0
        panic("boom")
    return n
`;
// A name ksmd already has, which the build refuses.
const TAKEN = "pub fn sum(x: F64): F64\n    return x\n";
const SHEET = `${H}:::functions path="mine.kspl"\n:::\n\n:::table name="t"\n| "a" | "b" |\n` +
  "| 100 | =tax(A1) |\n| \"kanso\" | =greet(A2) |\n| 2 | =tax(A3, 0.5, 9) |\n" +
  "| 1 | =forever(A4) |\n| 3 | =boom(A5) |\n:::\n";
const REFUSED = `${H}:::functions path="taken.kspl"\n:::\n`;
const PLAIN = `${H}Text.\n`;
// Records, in the page, each focus, key, input and new table as it comes, in `window.__seen`.
const RECORD = `(() => {
  const seen = window.__seen = [];
  const who = (t) => (t && (t.className || t.tagName)) || "none";
  for (const k of ["focusin", "keydown", "beforeinput", "input"]) {
    document.addEventListener(k, (e) => seen.push(k + ":" + (e.key || e.data || "") + "@" + who(e.target) +
      (e.target && "value" in e.target ? "=" + e.target.value : "")), true);
  }
  new MutationObserver((list) => {
    if (list.some((m) => [...m.addedNodes].some((n) => n.querySelector && n.querySelector("td"))))
      seen.push("drawn");
  }).observe(document.getElementById("doc"), { childList: true, subtree: true });
})()`;

export function own(helpers) {
  const { withTab, idle, said } = helpers;
  // Allows the open document's functions at the bar, once it asks.
  const allow = async (d) => {
    await d.until("!document.querySelector('.own-ask').hidden", 20000);
    await d.click(".own-ask .own-allow");
  };
  const cell = (d, r) => cellText(d.js, r, 1);
  const box = (d) => d.js("document.querySelector('#doc .functions .functions-state').textContent");

  return {
    async functions(ctx) {
      if (!ctx.builder) {
        verdict.skip("no builder was given, so a document's own functions are not checked");
        return;
      }
      // **A build the server killed leaves its scratch folder**, so the next build removes one
      // older than the server's limit, and leaves a younger one, which a build may still use.
      const scratch = path.join(path.dirname(path.resolve(ctx.builder)), "tmp");
      const left = (name) => {
        const own = path.join(scratch, name, "own");
        fs.mkdirSync(own, { recursive: true });
        fs.writeFileSync(path.join(own, "functions.kspl"), MINE);
        return path.join(scratch, name);
      };
      const stale = left("own-build-stale-test");
      const young = left("own-build-young-test");
      const past = new Date(Date.now() - 120000);
      fs.utimesSync(stale, past, past);
      const before = fs.readdirSync(scratch).filter((n) => n.startsWith("own-build-"));
      fs.writeFileSync(path.join(ctx.root, "mine.kspl"), MINE);
      fs.writeFileSync(path.join(ctx.root, "sheet.ksmd"), SHEET);
      await withTab(ctx, "?doc=sheet.ksmd", async (d) => {
        await allow(d);
        check(await d.until("document.querySelector('#doc .functions .functions-state')" +
          ".textContent.startsWith('A formula can call')", 60000),
        "the clause's box names the functions its file gives", await box(d));
        check(!fs.existsSync(stale) && fs.existsSync(young),
          "a build removes a scratch folder older than the server's limit, and keeps a younger one",
          fs.readdirSync(scratch).join(" "));
        const after = fs.readdirSync(scratch).filter((n) => n.startsWith("own-build-"));
        check(after.every((n) => before.includes(n)), "a build removes its own scratch folder",
          after.join(" "));
        fs.rmSync(young, { recursive: true, force: true });
        check(await d.until(`document.querySelector('#doc td[data-r="0"][data-c="1"]').textContent === "110"`),
          "a cell shows a person's function's answer", await cell(d, 0));
        // Insert ▸ Function… lists them too, with what their doc comments say, marked as the
        // document's own.
        await d.press("F3", SHIFT);
        await d.type("tax");
        const about = await d.js("document.querySelector('.fx-about').textContent");
        check(about.includes("tax(price, [rate])") && about.includes("the price with its tax") &&
          about.includes("This document's own"),
        "Insert function shows a person's function from its own doc comment", about);
        await d.press("Escape");
        check(await cell(d, 1) === "hello, kanso", "a function's text shows in its cell", await cell(d, 1));
        check(await cell(d, 2) === "#SYNTAX!",
          "too many arguments is a formula that does not read, as for ksmd's own", await cell(d, 2));
        check(await d.until(`document.querySelector('#doc td[data-r="3"][data-c="1"]').textContent === "#TIME!"`,
          15000), "a function that never ends shows #TIME! once its time is up", await cell(d, 3));
        check(await d.until(`document.querySelector('#doc td[data-r="4"][data-c="1"]').textContent === "#STOPPED!"`,
          15000), "a function that panics shows #STOPPED!", await cell(d, 4));
        // The worker that stopped starts afresh, so the next call still answers.
        // A failure says where the typed keys went: what the open cell held before Enter, where the
        // focus stood, and the row as the document holds it. Twice on Windows the row came out
        // empty or as text, which the worker alone cannot do.
        // A failure also gives the record of where each key and each focus went, and when the table
        // was drawn again: the third failure showed the first key alone lost, the box holding `00`.
        // The fourth showed every key in the box and the row unchanged: the press had landed on the
        // column's name, as the table moved down a line when Insert Function closed (`redraws.mjs`).
        await d.js(RECORD);
        await d.click('#doc td[data-r="0"][data-c="0"]');
        await d.type("200");
        const typed = await d.js("JSON.stringify({ open: (document.querySelector('#doc .cell-input') || " +
          "{ value: null }).value, focus: document.activeElement.className || document.activeElement.tagName, " +
          "seen: window.__seen.join(' ') })");
        await d.press("Enter");
        check(await d.until(`document.querySelector('#doc td[data-r="0"][data-c="1"]').textContent === "220"`,
          15000), "after a panic, a later call answers from a new worker",
        `${await cell(d, 0)}; typed ${typed}; row ` +
          await d.js("ksmd.source().split('\\n').find((l) => l.includes('=tax(A1)'))"));
        // **A cell open while its table is drawn again keeps what is typed.** A call that runs past
        // its time is answered while the person types in another cell, and the answer draws the
        // table again between two keys. The box went with the old table on Windows: the keys typed
        // before were lost, and the next one opened the cell afresh.
        await d.click('#doc td[data-r="3"][data-c="0"]');
        await d.type("5");
        await d.press("Enter");
        await d.click('#doc td[data-r="0"][data-c="0"]');
        await d.type("3");
        const mark = await d.js("window.__seen.length");
        const drawn = await d.until(`window.__seen.slice(${mark}).includes("drawn")`, 15000);
        await d.type("00");
        await d.press("Enter");
        check(drawn && await d.until(`document.querySelector('#doc td[data-r="0"][data-c="1"]').textContent === "330"`,
          15000), "a cell open while its table is drawn again keeps what was typed, the caret after it",
        `drawn ${drawn}; ${await cell(d, 0)}; seen ${await d.js("window.__seen.slice(-12).join(' ')")}`);
      });

      fs.writeFileSync(path.join(ctx.root, "taken.kspl"), TAKEN);
      fs.writeFileSync(path.join(ctx.root, "refused.ksmd"), REFUSED);
      await withTab(ctx, "?doc=refused.ksmd", async (r) => {
        await allow(r);
        check(await r.until("!!document.querySelector('#doc .functions .functions-state.problem')", 60000) &&
          (await box(r)).includes("taken.kspl") && (await box(r)).includes("`sum`"),
        "a file giving a name ksmd has is refused at its clause, naming the file and the name",
        await box(r));
      });

      // Insert, Functions starts a file where none stands, and puts its clause at the caret.
      fs.mkdirSync(path.join(ctx.root, "notes"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "notes/plain.ksmd"), PLAIN);
      await withTab(ctx, "?doc=notes/plain.ksmd", async (p) => {
        await p.select(0, 0, 5);
        await p.menu("functions");
        // The data folder does not stand yet: the dialog shows the document's folder, with the
        // data folder in the name.
        await p.until("document.getElementById('browse').open && " +
          "document.querySelector('#browse .browse-name').value === 'plain-data/functions.kspl'");
        await p.js("document.querySelector('#browse [data-browse=\"ok\"]').click()");
        await idle(p);
        const started = ctx.disk("notes/plain-data/functions.kspl");
        check(typeof started === "string" && started.includes("pub fn twice"),
          "Insert, Functions starts a functions file in the document's data folder", String(started));
        check(await p.js("ksmd.source()").then((s) => s.includes(':::functions path="plain-data/functions.kspl"')),
          "and puts its clause at the caret", await p.js("ksmd.source()"));
        await p.until("!!document.querySelector('#doc .functions .functions-allow')", 20000);
        await p.click("#doc .functions .functions-allow");
        check(await p.until("(document.querySelector('#doc .functions .functions-state') || {})" +
          ".textContent.startsWith('A formula can call: twice.')", 60000),
        "and the clause's box lists the function the new file gives", await box(p));
      });
    },

    // The build is closed: a functions file that embeds a file beside it, imports another
    // package or hands the assembler text is refused at its clause, and the file outside never
    // reaches the page.
    async closedBuild(ctx) {
      if (!ctx.builder) {
        verdict.skip("no builder was given, so the closed build is not checked");
        return;
      }
      const secret = "KSMD-SECRET-7f3a91";
      fs.mkdirSync(path.join(ctx.root, "closed"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "secret.txt"), secret);
      // Each case: the file's name, its text, what the build's refusal says, and what the check says.
      const cases = [
        ["embed", 'embed "../secret.txt" as secret //< a file outside the build\n\n' +
          "pub fn leak(n: F64): F64 //< the secret's length\n    return n + F64::(secret.len)\n",
        "climbs out of the package", "an embed of a file outside the build"],
        ["import", 'import "kssrv/api"\n\npub fn other(n: F64): F64 //< uses another package\n    return n\n',
          "does not say it uses 'kssrv'", "an import of another package"],
        // **The assembler's `.include` reads any file**, and its error quotes the file's lines.
        ["asm", "pub fn peek(n: F64): F64 //< asks the assembler for a file outside the build\n" +
          `    __kspl_asm_volatile(".include \\"${path.resolve(ctx.root, "secret.txt").replace(/\\/g, "/")}\\"")\n` +
          "    return n\n",
        "cannot be written in the package 'own'", "assembler text that includes a file outside the build"],
        // Not closed but refused too: a formula reads only lowercase names, so it could never call `myTax`.
        ["upper", "pub fn myTax(n: F64): F64 //< a name no formula can call\n    return n\n",
          "Formula names are lowercase", "a name that is not lowercase"],
      ];
      for (const [name, text, why, what] of cases) {
        fs.writeFileSync(path.join(ctx.root, `closed/${name}.kspl`), text);
        fs.writeFileSync(path.join(ctx.root, `closed/${name}.ksmd`), `${H}:::functions path="${name}.kspl"\n:::\n`);
        await withTab(ctx, `?doc=closed/${name}.ksmd`, async (d) => {
          await allow(d);
          const refused = await d.until("!!document.querySelector('#doc .functions .functions-state.problem')", 60000);
          const shown = await box(d);
          check(refused && shown.includes(`closed/${name}.kspl`) && shown.includes(why),
            `a functions file with ${what} is refused at its clause, naming the file and why`, shown);
          const answer = await d.js(`fetch("/api/build?path=${encodeURIComponent(`closed/${name}.kspl`)}",
            { method: "POST", headers: { Authorization: "Bearer " + sessionStorage.getItem("ksmd.token") } })
            .then((r) => r.text(), (e) => "no answer: " + e.message)`);
          // Once on Windows the request got no answer at all. The server's last lines say why.
          const log = answer.startsWith("no answer: ") ? ` | kssrv: ${(read(path.join(ctx.work, "kssrv.log")) || "")
            .trim().split("\n").slice(-6).join(" / ")}` : "";
          check(!(await d.js("document.documentElement.outerHTML")).includes(secret) && !answer.includes(secret) &&
            !answer.startsWith("no answer: "), "and nothing of the file outside reaches the page", answer + log);
        });
      }
      fs.rmSync(path.join(ctx.root, "closed"), { recursive: true, force: true });
      fs.rmSync(path.join(ctx.root, "secret.txt"), { force: true });
    },

    ...trust(helpers),

    async includeInsert(ctx) {
      fs.mkdirSync(path.join(ctx.root, "host/sub"), { recursive: true });
      fs.writeFileSync(path.join(ctx.root, "host/host.ksmd"), PLAIN);
      fs.writeFileSync(path.join(ctx.root, "host/sub/existing.ksmd"), `${H}Included text.\n`);
      await withTab(ctx, "?doc=host/host.ksmd", async (d) => {
        const dialog = async (name) => {
          await d.select(0, 0, 5);
          await d.menu("include");
          await d.until("document.getElementById('browse').open && " +
            `document.querySelector('#browse .browse-name').value === ${JSON.stringify(name)}`);
        };
        const button = (text) => `Array.from(document.querySelectorAll('#browse .browse-list button'))
          .find((b) => b.textContent === ${JSON.stringify(text)})`;
        const source = () => d.js("ksmd.source()");

        await dialog("host-data/part.ksmd");
        await d.js("document.querySelector('#browse [data-browse=\"ok\"]').click()");
        await idle(d);
        check(ctx.disk("host/host-data/part.ksmd") === "%ksmd 2\n",
          "Insert, Include starts an empty document in the open one's data folder",
          String(ctx.disk("host/host-data/part.ksmd")));
        check((await source()).includes(':::include path="host-data/part.ksmd"'), "and puts its clause at the caret",
          await source());

        // The data folder stands now: the dialog opens in it, and `..` leads back to the document's.
        await dialog("part.ksmd");
        check(await d.until(`!!${button("..")} && !${button("host.ksmd")}`),
          "the next Insert, Include opens in the data folder that now stands");
        await d.js(`${button("..")}.click()`);
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
        await d.until(`!!${button("..")}`);
        await d.js(`${button("..")}.click()`);
        await d.until(`!!${button("host.ksmd")}`);
        await d.js(`${button("host.ksmd")}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
        await idle(d);
        check(await source() === before && (await said(d)).includes("cannot include itself"),
          "a document does not include itself, and the page says so", await said(d));
      });
    },
  };
}
