// A table as a whole, and its columns and rows by number: selecting, copying, pasting and removing a
// whole table, the caret after a block is removed, a column's width and a row's height typed in,
// and the filter's tree of dates. Each is driven through the browser's own input events, as
// `main.mjs` drives the rest, and checked by the saved source and its undo.
// `tables(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function tables({ page, js, settle, press, type, select, click, menu, load, saves }) {
  const sel = () => js("JSON.stringify(ksmd.selection().f)");
  // Whether the caret's block stands inside the window, below the header.
  const caretInSight = () => js(`(() => {
    const s = window.getSelection();
    if (s.rangeCount === 0) return false;
    let r = s.getRangeAt(0).getBoundingClientRect();
    if (r.height === 0) {
      const n = s.focusNode.nodeType === 1 ? s.focusNode : s.focusNode.parentElement;
      r = n.getBoundingClientRect();
    }
    const top = document.querySelector(".top").getBoundingClientRect().bottom;
    return r.top >= top - 1 && r.bottom <= window.innerHeight + 1;
  })()`);
  const filler = Array.from({ length: 60 }, (_, k) => `Line ${k + 1}`).join("\n\n");
  const table = ':::table name="t"\n| "a" |\n| 1 |\n:::\n';

  return {
    // A whole table is chosen by Ctrl+A twice, the corner left of its letters, or Select table. It
    // copies as ksmd's own table, as tab-separated text and as HTML; it pastes after the caret's
    // paragraph with a name of its own; and it cuts and deletes as one step.
    async wholeTable() {
      const clause = (name, ref) => `:::table name="${name}" widths="1,2" formats=",number:2"\n` +
        `| "a" | "b" |\n| 1 | =${ref}.A1*2 |\n| 3 | =A2+1 |\n:::\n`;
      const start = `${H}Intro\n\n${clause("t", "t")}\nAfter\n`;
      await load(start);
      const ranged = () => js("document.querySelectorAll('#doc .in-range').length");
      const whole = () => js("!!document.querySelector('#doc .table.whole-table')");
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("a", CTRL);
      check(await ranged() === 4 && !await whole(), "Ctrl+A in a table chooses its data cells", String(await ranged()));
      await press("a", CTRL);
      check(await ranged() === 6 && await whole(), "and Ctrl+A again the whole table, names and all");
      await press("Escape");
      await click('#doc .table thead tr:first-child th:first-child');
      check(await whole(), "a press on the corner left of the column letters chooses the whole table");
      await press("Escape");
      await click('#doc td[data-r="1"][data-c="1"]');
      await menu("table-select");
      check(await whole(), "and so does the Table menu's Select table");
      const clip = (type) => js(`(() => {
        const data = new DataTransfer();
        document.activeElement.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: data, bubbles: true, cancelable: true }));
        window.__clip = { plain: data.getData("text/plain"), html: data.getData("text/html"), own: data.getData("application/x-ksmd") };
        return window.__clip;
      })()`);
      const got = await clip("copy");
      check(got.own === `${H}${clause("t", "t")}`, "a copy carries the table as ksmd's own source", got.own);
      check(got.plain === "a\tb\r\n1\t2\r\n3\t4\r\n", "and as tab-separated rows for a spreadsheet", JSON.stringify(got.plain));
      check(/<table>[\s\S]*<th>a<\/th>[\s\S]*<td>1<\/td>/.test(got.html), "and as an HTML table for a word processor", got.html);
      await saves("a copy changes nothing", start);
      const paste = (data) => js(`(() => {
        const d = new DataTransfer();
        for (const [k, v] of Object.entries(${JSON.stringify(data)})) d.setData(k, v);
        document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: d, bubbles: true, cancelable: true }));
      })()`);
      await click("#doc > p");
      await select(0, 0, 2);
      await paste({ "application/x-ksmd": got.own, "text/plain": got.plain });
      const pasted = `${H}Intro\n\n${clause("t_2", "t_2")}\n${clause("t", "t")}\nAfter\n`;
      await saves("a paste in prose puts the same table after the caret's paragraph, with a name of its own, " +
        "its formulas, formats and widths", pasted);
      await menu("undo");
      await saves("and one undo takes it out", start);
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("a", CTRL);
      await press("a", CTRL);
      await clip("cut");
      await saves("a cut of the whole table takes it out", `${H}Intro\n\nAfter\n`);
      check(await js("window.__clip.own") === `${H}${clause("t", "t")}`, "and leaves it on the clipboard");
      await menu("undo");
      await saves("and one undo brings it back", start);
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("a", CTRL);
      await press("a", CTRL);
      await press("Delete");
      await saves("Delete on the whole table removes it", `${H}Intro\n\nAfter\n`);
      check(await sel() === "[0,1,0,0]", "and the caret takes its place", await sel());
      await menu("undo");
      await saves("in one step of undo", start);
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("a", CTRL);
      await press("Delete");
      await saves("Delete on the data cells only clears them", start.replace("| 1 | =t.A1*2 |\n| 3 | =A2+1 |", "| | |\n| | |"));
      await menu("undo");
      await select(2, 0, 5);
      await paste({ "application/x-ksmd": "%ksmd 1\n\nNot a table\n", "text/plain": "Not a table" });
      await saves("clipboard text that is no ksmd table pastes as its plain text",
        `${H}Intro\n\n${clause("t", "t")}\nAfterNot a table\n`);
    },

    // Column width and row height typed as numbers, as Excel's dialogs take them: a column's share
    // of the table in percent, and a row's least height in points.
    async sizes() {
      const t3 = (attrs) => `${H}:::table name="t"${attrs}\n| "a" | "b" | "c" |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n:::\n`;
      await load(t3(""));
      check(await js("!!document.querySelector('.menubar [data-cmd=\"column-width\"]') && " +
        "!!document.querySelector('.menu.context [data-cmd=\"row-height\"]')"),
      "the Table menu and the right-click menu hold Column width and Row height");
      const tallMenu = await js("(() => { const m = document.querySelector('.menu.context'); m.hidden = false; " +
        "const h = m.getBoundingClientRect().height; m.hidden = true; return Math.round(h); })()");
      check(tallMenu <= 600, "and the right-click menu still fits a window 600 pixels tall", String(tallMenu));
      const answer = (text) => js(`window.prompt = () => ${JSON.stringify(text)}`);
      const status = () => js("document.getElementById('status').textContent");
      await click('#doc td[data-r="0"][data-c="0"]');
      await answer("50");
      await menu("column-width");
      await saves("Column width 50 gives the column half the table, the others the rest in their shares",
        t3(' widths="2,1,1"'));
      const share = await js(`(() => { const t = document.querySelector("#doc .table table");
        const th = t.tHead.rows[0].cells; let all = 0; for (let k = 1; k < th.length; k++) all += th[k].getBoundingClientRect().width;
        return Math.round(100 * th[1].getBoundingClientRect().width / all); })()`);
      check(share === 50, "and the page shows it so", String(share));
      for (const wrong of ["100", "0", "abc", "12.25"]) {
        await answer(wrong);
        await menu("column-width");
        check((await status()).includes("1 to 99"), `a width of ${wrong} is refused, and the page says why`, await status());
      }
      await saves("so nothing changes", t3(' widths="2,1,1"'));
      await click('#doc td[data-r="1"][data-c="1"]');
      await answer("30");
      await menu("row-height");
      await saves("Row height 30 gives the chosen row a height of 30 points", t3(' widths="2,1,1" heights=",30"'));
      const tall = () => js("Math.round(document.querySelectorAll('#doc tbody tr')[1].getBoundingClientRect().height)");
      check(await tall() === 40, "and the row stands 40 pixels tall", String(await tall()));
      await page("Emulation.setEmulatedMedia", { media: "print" });
      check(await tall() === 40, "on paper too", String(await tall()));
      await page("Emulation.setEmulatedMedia", { media: "" });
      for (const wrong of ["5", "410", "x", "20.5"]) {
        await answer(wrong);
        await menu("row-height");
        check((await status()).includes("6 to 409"), `a height of ${wrong} is refused, and the page says why`, await status());
      }
      await answer("");
      await menu("row-height");
      await saves("an empty answer takes the height away", t3(' widths="2,1,1"'));
      await answer(null);
      await menu("row-height");
      await saves("and Cancel changes nothing", t3(' widths="2,1,1"'));
      await menu("undo");
      await menu("undo");
      await menu("undo");
      await saves("each change was one step of undo", t3(""));
    },

    // A column of dates filters by a tree, as Excel's does: years, then months, then days, each with
    // a box that ticks what it holds and shows a mix. Other values stand after the tree.
    async dateFilter() {
      const rows = ["2025-11-06", "2025-11-07", "2025-12-01", "2026-01-15", '"n/a"', ""];
      const start = `${H}:::table name="d"\n| "when" |\n${rows.map((r) => (r ? `| ${r} |\n` : "| |\n")).join("")}:::\n`;
      await load(start);
      await click('#doc th.name[data-c="0"] .filter-arrow');
      const listed = (sel) => js(`Array.from(document.querySelectorAll(${JSON.stringify(sel)}))
        .filter((el) => el.offsetParent !== null).map((el) => el.dataset.key).join()`);
      check(await listed(".filter-panel [role=treeitem]") === "2025,2026",
        "a column of dates lists its years, folded", await listed(".filter-panel [role=treeitem]"));
      check(await js("Array.from(document.querySelectorAll('.filter-values > label')).map((l) => l.textContent.trim()).join()") ===
        "(Select all),n/a,(Blanks)", "and its other values after them, blanks last");
      await click('.filter-panel [data-key="2025"] > .tree-row .tree-twist');
      check(await listed(".filter-panel [role=treeitem]") === "2025,2025-11,2025-12,2026",
        "the year's button shows its months", await listed(".filter-panel [role=treeitem]"));
      check(await js("document.querySelector('.filter-panel [data-key=\"2025\"]').getAttribute('aria-expanded')") === "true",
        "and says that it is open");
      const box = (key) => `.filter-panel [data-key="${key}"] > .tree-row input`;
      const state = (key) => js(`(() => { const b = document.querySelector(${JSON.stringify(box(key))});
        return b.indeterminate ? "mixed" : b.checked ? "on" : "off"; })()`);
      await click(box("2025"));
      check(await state("2025-11") === "off" && await state("2025-12") === "off",
        "unticking the year unticks its months");
      check(await js("document.querySelector('.filter-values > label input').indeterminate"),
        "and (Select all) shows a mix");
      await click('.filter-panel [data-key="2025-11"] > .tree-row .tree-twist');
      await click('.filter-panel input[value="2025-11-06"]');
      check(await state("2025-11") === "mixed" && await state("2025") === "mixed",
        "ticking one day shows its month and year as mixed");
      await click(".filter-panel .filter-ok");
      const shown = () => js("Array.from(document.querySelectorAll('#doc tbody tr')).map((r) => r.hidden ? 0 : 1).join('')");
      check(await shown() === "100111", "OK shows the day ticked, the other year, the text and the blanks",
        await shown());
      await click('#doc th.name[data-c="0"] .filter-arrow');
      check(await state("2025") === "mixed", "the panel opened again shows the filter as it stands");
      await type("2026");
      check(await listed(".filter-panel [role=treeitem]") === "2026,2026-01",
        "the search box narrows the tree, and opens what it finds", await listed(".filter-panel [role=treeitem]"));
      check(await js("Array.from(document.querySelectorAll('.filter-values > label, .tree-kids > label'))" +
        ".filter((l) => l.offsetParent !== null).map((l) => l.textContent.trim()).join()") === "(Select all),15",
      "down to the day, and leaves the other values out");
      await js("(() => { const b = document.querySelector('.filter-panel input[type=search]'); b.value = ''; b.dispatchEvent(new Event('input')); })()");
      await js(`document.querySelector(${JSON.stringify(box("2026"))}).focus()`);
      await press("ArrowRight");
      check(await js("document.querySelector('.filter-panel [data-key=\"2026\"]').getAttribute('aria-expanded')") === "true",
        "Right on a year's box opens it");
      await press("ArrowLeft");
      check(await js("document.querySelector('.filter-panel [data-key=\"2026\"]').getAttribute('aria-expanded')") === "false",
        "and Left folds it again");
      await press("Escape");
      const kept = start.replace(':::table name="d"', ':::table name="d" filter="in:2025-11-06|2026-01-15|n/a|"');
      await saves("the file keeps the filter: the days ticked, the text and the blanks", kept);
      await load(kept);
      check(await shown() === "100111", "and a document opened again shows the same rows", await shown());
    },

    // A table's filter is kept in the file, as Excel keeps it, so the document opens as it was left.
    // The line above the table says how many rows show, and Show all rows takes the filter away.
    async keptFilter() {
      const table = (attrs) => `${H}:::table name="t"${attrs}\n| "a" | "n" |\n| "pear" | 3 |\n| "fig" | 1 |\n| "Apple" | 2 |\n:::\n`;
      const shown = () => js("Array.from(document.querySelectorAll('#doc tbody tr')).map((r) => r.hidden ? 0 : 1).join('')");
      const note = () => js("(document.querySelector('#doc .filter-note') || {}).textContent || ''");
      await load(table(""));
      await click('#doc td[data-r="1"][data-c="0"]');
      await menu("filter-value");
      await saves("Show only rows with this value saves the filter in the file", table(' filter="in:fig,"'));
      await load(table(' filter="in:fig,"'));
      check(await shown() === "010", "a document opened again shows only those rows", await shown());
      check((await note()).startsWith("Showing 1 of 3 rows"), "and the line above the table says so", await note());
      await click('#doc th.name[data-c="1"] .filter-arrow');
      await click(".filter-panel summary");
      await js(`(() => { document.querySelector(".filter-panel select").value = "above";
        document.querySelector(".filter-panel details input").value = "2"; })()`);
      await click(".filter-panel .filter-ok");
      await saves("a condition is kept too, beside the values", table(' filter="in:fig,above:2"'));
      await menu("undo");
      await saves("each change of the filter is one step of undo", table(' filter="in:fig,"'));
      await click('#doc th.name[data-c="0"] .filter-arrow');
      await js("document.querySelectorAll('.filter-values input').forEach((b) => { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); })");
      check(await js("document.querySelector('.filter-panel .filter-ok').disabled"),
        "with no value ticked, OK cannot be pressed, as in Excel");
      await press("Escape");
      await page("Emulation.setEmulatedMedia", { media: "print" });
      check(await js("Array.from(document.querySelectorAll('#doc tbody tr')).map((r) => getComputedStyle(r).display === 'none' ? 0 : 1).join('')") === "010",
        "print shows the rows the filter shows");
      await page("Emulation.setEmulatedMedia", { media: "" });
      await click(".filter-note .filter-clear");
      await saves("Show all rows takes the filter out of the file", table(""));
      check(await shown() === "111" && await note() === "", "and every row shows again, with no line above");
      await menu("undo");
      await menu("read-only");
      await click(".filter-note .filter-clear");
      check(await shown() === "111", "in Read-only, Show all rows still shows every row", await shown());
      await saves("for this viewer alone: the file keeps its own filter", table(' filter="in:fig,"'));
      await menu("read-only");
      check(await shown() === "010", "and editing again shows the file's filter", await shown());
    },

    // Whatever removes a block, the caret takes its place: on the block after it, else on the one
    // before, else in the empty document. It stays in sight, far down a long document too.
    async removing() {
      const removes = async (what, start, act, at, typed) => {
        await load(start);
        await act();
        await settle();
        check(await sel() === at, `${what}: the caret stands where the block was`, await sel());
        check(await caretInSight(), `${what}: and the page shows it`,
          await js("String(window.scrollY)"));
        await type("X");
        await saves(`${what}: so typing goes there`, typed);
        await menu("undo");
        await menu("undo");
        await saves(`${what}: and two undos bring the block back`, start);
      };
      const chosen = async () => {
        await js("document.querySelector('#doc td[data-r=\"0\"]').scrollIntoView({ block: 'center' })");
        await click('#doc td[data-r="0"][data-c="0"]');
      };
      await removes("Remove table, with a paragraph after it", `${H}${filler}\n\n${table}\nAfter\n`,
        async () => {
          await chosen();
          await menu("table-remove");
        }, "[0,60,0,0]", `${H}${filler}\n\nXAfter\n`);
      await removes("Remove table, last in the document", `${H}${filler}\n\n${table}`, async () => {
        await chosen();
        await menu("table-remove");
      }, "[0,59,0,7]", `${H}${filler.replace(/Line 60$/, "Line 60X")}\n`);
      await removes("Remove table, alone in the document", `${H}${table}`, async () => {
        await chosen();
        await menu("table-remove");
      }, "[1,0,0,0]", `${H}X\n`);
      const button = (kind) => async () => {
        await js(`document.querySelector('#doc .${kind} .block-remove').scrollIntoView({ block: 'center' })`);
        await click(`#doc .${kind} .block-remove`);
      };
      await removes("a divider's Remove", `${H}${filler}\n\n---\n\nAfter\n`, button("divider"),
        "[0,60,0,0]", `${H}${filler}\n\nXAfter\n`);
      await removes("an image's Remove", `${H}${filler}\n\n:::image src="a.png" alt="A"\n:::\n\nAfter\n`,
        button("figure"), "[0,60,0,0]", `${H}${filler}\n\nXAfter\n`);
      await removes("an include's Remove", `${H}${filler}\n\n:::include path="b.ksmd"\n:::\n\nAfter\n`,
        button("include"), "[0,60,0,0]", `${H}${filler}\n\nXAfter\n`);
      await removes("a chart's Remove",
        `${H}${filler}\n\n${table}\n:::chart table="t" kind="bar" labels="a" values="a"\n:::\n\nAfter\n`,
        button("chart"), "[0,61,0,0]", `${H}${filler}\n\n${table}\nXAfter\n`);
    },
  };
}
