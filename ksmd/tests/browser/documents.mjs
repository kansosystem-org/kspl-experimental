// The document as a whole: its own settings (`:::document`), the numbers of its headings and
// captions, the references that show them, and the repeated values a table shows once. Each is
// driven through the browser's own input events, as `main.mjs` drives the rest, and checked by
// the saved source and its undo.
// `documents(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function documents({ js, press, click, menu, load, saves }) {
  return {
    // Ctrl+End and Ctrl+Home reach past a table or a chart that ends or starts the document, which
    // the browser's own caret cannot stand beside.
    async ends() {
      const chart = ':::table name="t"\n| "a" | "b" |\n| "x" | 1 |\n:::\n\n' +
        ':::chart table="t" kind="bar" labels="a" values="b"\n:::\n';
      await load(`${H}# Trip\n\n${chart}`);
      await click("#doc h1");
      await press("End", CTRL);
      await menu("divider");
      await saves("Ctrl+End after a last chart puts the caret after it", `${H}# Trip\n\n${chart}\n---\n`);
      await load(`${H}${chart}\nText\n`);
      await click("#doc p");
      await press("Home", CTRL);
      await menu("divider");
      await saves("Ctrl+Home before a first table puts the caret before it", `${H}---\n\n${chart}\nText\n`);
    },
    // Headings number themselves from the level the settings name, captions take a number by
    // chapter, and a link whose text is `#` shows the number of what it names.
    async numbers() {
      const body = "# Title\n\n## One\n\nSee [#](#Two) and [#](#Modes).\n\n## Two\n\n### Deep\n\n" +
        ':::table name="t" caption="Modes"\n| "a" |\n| 1 |\n:::\n';
      const doc = (settings) => `${H}${settings}${body}`;
      await load(doc(':::document numbers=2 table_label="表"\n:::\n\n'));
      const numbers = () => js("JSON.stringify(Array.from(document.querySelectorAll('#doc h1, #doc h2, #doc h3'), " +
        "(h) => h.dataset.number || ''))");
      check(await numbers() === JSON.stringify(["", "1", "2", "2.1"]),
        "headings number themselves from level 2, the title left as it is", await numbers());
      const refs = () => js("JSON.stringify(Array.from(document.querySelectorAll('#doc a.ref'), (a) => a.dataset.ref))");
      check(await refs() === JSON.stringify(["2", "表 2-1"]),
        "a reference shows the number of the heading or the table it names", await refs());
      check(await js("document.querySelector('#doc .table-caption').dataset.number") === "表 2-1",
        "a table's caption takes the chapter's number");
      check(await js("getComputedStyle(document.querySelector('#doc h2'), '::before').content").then((c) => c.includes("1")),
        "the number is drawn before the heading, not written into its text");
      await load(doc(""));
      check(await numbers() === JSON.stringify(["", "", "", ""]) && await refs() === JSON.stringify(["Two", "Modes"]),
        "without settings nothing is numbered, and a reference shows the name", await refs());
    },

    // File, Page setup... sets the paper, the header and footer, and the numbers, as one step.
    async pageSetup() {
      const body = "# Title\n";
      await load(`${H}${body}`);
      await menu("page-setup");
      await js(`(() => {
        const p = document.querySelector('.settings-panel');
        p.querySelector('.settings-paper').value = 'A3';
        p.querySelector('.settings-orientation').value = '1';
        p.querySelector('.settings-header').value = '[Confidential]';
        p.querySelector('.settings-footer').value = 'No.12 ({page}/{pages})';
        p.querySelector('.settings-numbers').value = '1';
      })()`);
      await click(".settings-panel .settings-apply");
      const set = `${H}:::document paper="A3" orientation="landscape" header="[Confidential]" ` +
        'footer="No.12 ({page}/{pages})" numbers=1\n:::\n\n' + body;
      await saves("Page setup writes the document's settings first", set);
      const style = await js("document.getElementById('ksmd-paper').textContent");
      check(style.includes("size: A3 landscape") && style.includes('"[Confidential]"') &&
        style.includes('"No.12 (" counter(page) "/" counter(pages) ")"'),
      "the paper, the header and the footer reach the page's print style", style);
      check(await js("document.querySelector('#doc h1').dataset.number") === "1", "and the heading is numbered");
      await click("#doc .settings .block-remove");
      await saves("Remove takes the settings away", `${H}${body}`);
      await menu("undo");
      await saves("and undo brings them back", set);
    },

    // A merged column shows a value repeated down it once; the data keeps every value.
    async mergedColumns() {
      const table = (merge) => `${H}:::table name="t"${merge}\n| "kind" | "mode" |\n| "lock" | "A" |\n` +
        '| "lock" | "A" |\n| "link" | "A" |\n:::\n';
      await load(table(' merge="A,B"'));
      const marked = () => js("JSON.stringify(Array.from(document.querySelectorAll('#doc td.merged-repeat'), " +
        "(td) => `${td.dataset.r}:${td.dataset.c}`))");
      check(await marked() === JSON.stringify(["1:0", "1:1"]),
        "a repeat shows once, and a column right of another merges only inside its group", await marked());
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("column-merge");
      await saves("Merge repeated values on a merged column turns it off", table(' merge="B"'));
      check(await marked() === JSON.stringify(["1:1", "2:1"]), "and the other column merges alone", await marked());
      await press("z", CTRL);
      await saves("undo turns it on again", table(' merge="A,B"'));
    },
  };
}
