// A table as a whole, and its columns and rows by number: selecting, copying, pasting and removing a
// whole table, the caret after a block is removed, a column's width and a row's height typed in,
// the filter's tree of dates, a filter on more values than its panel lists, and the edits that change what a filter matches. Each is driven
// through the browser's own input events, as `main.mjs` drives the rest, and checked by the saved
// source and its undo.
// `tables(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function tables({ page, js, settle, press, type, select, click, menu, load, saves, rightClick, dragTo, openCell }) {
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
      // In a table with no data rows, the names row alone reaches every row and column; it is
      // still cells, not the whole table.
      const bare = `${H}Intro\n\n:::table name="e"\n| "a" |\n:::\n`;
      await load(bare);
      await click('#doc th.name[data-c="0"]');
      check(!await whole(), "a press on the name of a table with no data rows chooses the cell alone");
      await press("Delete");
      check((await js("ksmd.source()")).includes(':::table name="e"'),
        "so Delete there leaves the table in place", await js("ksmd.source()"));
      await load(bare);
      await click('#doc th.name[data-c="0"]');
      await clip("cut");
      check((await js("ksmd.source()")).includes(':::table name="e"'), "and so does a cut",
        await js("ksmd.source()"));
      await load(bare);
      await click('#doc th.name[data-c="0"]');
      await menu("table-select");
      check(await whole(), "Select table still chooses such a table whole");
      await press("Delete");
      await saves("and Delete then removes it", `${H}Intro\n`);
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
      // With every column chosen, nothing is left to share, so the shares must add to 100.
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("a", CTRL);
      await answer("30");
      await menu("column-width");
      check((await status()).includes("add to 100%"), "with every column chosen, a share that does not add to 100 is refused",
        await status());
      await saves("so nothing changes", t3(""));
      // Row height: the names row takes the height its text needs, and rows a filter hides keep theirs.
      // Row height on the names row asks nothing and changes nothing.
      const heightOff = async (start) => {
        await js("window.__asked = false; window.prompt = () => { window.__asked = true; return '30'; }");
        await menu("row-height");
        return !await js("window.__asked") && await js("ksmd.source()") === start;
      };
      await click('#doc th.name[data-c="0"]');
      check(await heightOff(t3("")), "Row height cannot be pressed on the names row");
      const t1 = (attrs) => `${H}:::table name="t"${attrs}\n| "a" |\n| 1 |\n| 2 |\n| 3 |\n:::\n`;
      await load(t1(' filter="not:2"'));
      await click('#doc td[data-r="0"][data-c="0"]');
      await click('#doc td[data-r="2"][data-c="0"]', SHIFT);
      await answer("30");
      await menu("row-height");
      await saves("Row height across a row a filter hides leaves that row as it was",
        t1(' heights="30,,30" filter="not:2"'));
      await menu("undo");
      await saves("in one step of undo", t1(' filter="not:2"'));
      await load(`${H}:::table name="e"\n| "a" |\n:::\n`);
      await click('#doc th.name[data-c="0"]');
      check(await heightOff(`${H}:::table name="e"\n| "a" |\n:::\n`), "nor on a table with no data rows");
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
      // A cell's own format can show its date otherwise than the column's; the tree still sorts
      // by the day, so each year stands once.
      await load(`${H}:::table name="d"\n| "when" |\n| 2025-11-07 {format="date:yyyy/mm/dd"} |\n| 2026-01-15 |\n| 2025-12-01 |\n:::\n`);
      await click('#doc th.name[data-c="0"] .filter-arrow');
      check(await listed(".filter-panel [role=treeitem]") === "2025,2026",
        "a date in a format of its own stands in its year, which is listed once", await listed(".filter-panel [role=treeitem]"));
      await press("Escape");
    },

    // A filter and the edits that change what it matches: a new row, a change of number format,
    // and a panel with nothing that OK could take.
    async filterSteps() {
      const table = (attrs, rows = "| 1.5 | \"x\" |\n| 2 | \"y\" |\n") =>
        `${H}:::table name="t"${attrs}\n| "n" | "s" |\n${rows}:::\n`;
      const shown = () => js("Array.from(document.querySelectorAll('#doc tbody tr')).map((r) => r.hidden ? 0 : 1).join('')");
      await load(table(' filter=",in:x"'));
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("row-below");
      await saves("a new row on a filtered table takes the filter away with the row",
        table("", "| 1.5 | \"x\" |\n| | |\n| 2 | \"y\" |\n"));
      check(await shown() === "111", "so the new row can be seen", await shown());
      await menu("undo");
      await saves("and one undo brings back the filter and takes the row away", table(' filter=",in:x"'));
      check(await shown() === "10", "with the rows it showed", await shown());
      // A value filter matches the text a format shows, so a new format takes it away.
      await load(table(' filter="in:1.5,"'));
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("format-number");
      await saves("a number format on a filtered column takes its filter away in the same step",
        table("", "| 1.5 {format=\"number:2\"} | \"x\" |\n| 2 | \"y\" |\n"));
      await menu("undo");
      await saves("and one undo brings both back", table(' filter="in:1.5,"'));
      // OK takes ticked values or a condition with its value; with neither, it waits.
      await click('#doc th.name[data-c="1"] .filter-arrow');
      await js("document.querySelectorAll('.filter-values input').forEach((b) => { b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); })");
      const okOff = () => js("document.querySelector('.filter-panel .filter-ok').disabled");
      await click(".filter-panel summary");
      await settle();
      check(await okOff(), "with no value ticked, opening the condition with no value leaves OK off");
      await click(".filter-panel details input");
      await type("x");
      check(!await okOff(), "typing the condition's value lets OK be pressed");
      await press("Backspace");
      check(await okOff(), "and taking it away again turns OK off");
      await press("Enter");
      check(!!await js("document.querySelector('.filter-panel')"), "so Enter there takes nothing either");
      await js("(() => { const s = document.querySelector('.filter-panel select'); s.value = 'empty'; s.dispatchEvent(new Event('change')); })()");
      check(!await okOff(), "is empty needs no value, so OK can be pressed");
      await click(".filter-panel summary");
      await settle();
      check(await okOff(), "and folding the condition away turns OK off again");
      await press("Escape");
      await saves("nothing was saved", table(' filter="in:1.5,"'));
    },

    // A column with more values than the panel lists: a value never listed is never hidden, and the
    // search finds a value past the list's end.
    async manyValues() {
      const rows = Array.from({ length: 1201 }, (_, k) => `| "v${String(k + 1).padStart(4, "0")}" |\n`).join("");
      const table = (attrs) => `${H}:::table name="t"${attrs}\n| "v" |\n${rows}:::\n`;
      const hidden = () => js("Array.from(document.querySelectorAll('#doc tbody tr')).flatMap((r, k) => r.hidden ? [k + 1] : []).join()");
      const arrow = '#doc th.name[data-c="0"] .filter-arrow';
      await load(table(""));
      await click(arrow);
      check(await js("document.querySelectorAll('.filter-values input').length") === 1001,
        "the panel lists 1,000 values and (Select all)");
      await click(".filter-panel .filter-ok");
      await saves("OK with nothing changed keeps no filter", table(""));
      check(await hidden() === "", "and every row shows", await hidden());
      await click(arrow);
      await click('.filter-panel input[value="v0005"]');
      await click(".filter-panel .filter-ok");
      await saves("unticking one value keeps it as left out", table(' filter="out:v0005"'));
      check(await hidden() === "5", "and hides that value's row alone", await hidden());
      await click(arrow);
      await type("v1100");
      const found = () => js("Array.from(document.querySelectorAll('.filter-values input')).slice(1).map((b) => b.value).join()");
      check(await found() === "v1100", "the search finds a value past the 1,000th", await found());
      await click('.filter-panel input[value="v1100"]');
      await click(".filter-panel .filter-ok");
      await saves("which can be unticked too", table(' filter="out:v0005|v1100"'));
      check(await hidden() === "5,1100", "and only those two rows are hidden", await hidden());
      await click(arrow);
      check(!await js("document.querySelector('.filter-panel input[value=\"v0005\"]').checked"),
        "the panel opened again shows the value left out unticked");
      await click(".filter-values > label input");
      check(await js("(() => { const b = document.querySelector('.filter-values > label input'); return b.checked && !b.indeterminate; })()"),
        "(Select all) ticks the values left out");
      await click(".filter-values > label input");
      check(await js("document.querySelector('.filter-panel .filter-ok').disabled"),
        "and unticks every value, listed or not, so OK waits for a tick");
      await click('.filter-panel input[value="v0002"]');
      await click(".filter-panel .filter-ok");
      await saves("unticking all and ticking one keeps the one value ticked", table(' filter="in:v0002"'));
      check(await hidden() === Array.from({ length: 1201 }, (_, k) => k + 1).filter((k) => k !== 2).join(),
        "and shows its row alone");
      await menu("undo");
      await saves("one undo goes back a step", table(' filter="out:v0005|v1100"'));
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

    // Cells cut stay where they are, marked, until a paste moves them, as in Excel. Rows chosen by
    // their numbers, or columns by their letters, can also go in by Insert cut rows or Insert cut
    // columns, which stand in place of Insert row above and Insert column left.
    async cutLines() {
      const start = `${H}:::table name="t"\n| "n" | "f" |\n| 1 | =A1*10 |\n| 2 | |\n| 3 | |\n| 4 | =sum(A1:A2) |\n:::\n`;
      await load(start);
      const rowNumber = (k) => `#doc tbody tr:nth-child(${k}) th.row-number`;
      const letter = (k) => `#doc thead tr:first-child th:nth-child(${k + 1})`;
      const cell = (r, c) => `#doc td[data-r="${r}"][data-c="${c}"]`;
      const labelOf = (cmd) => js(`(() => { const el = document.querySelector('.menu.context [data-cmd="${cmd}"]');
        return el && el.getClientRects().length > 0 ? el.querySelector(".label").textContent : ""; })()`);
      const marked = () => js("Array.from(document.querySelectorAll('#doc .cut')).map((el) => el.dataset.r + el.dataset.c).join()");
      const ranged = () => js("Array.from(document.querySelectorAll('#doc td.in-range')).map((el) => el.dataset.r + el.dataset.c).join()");
      // A cut keeps what it put on the clipboard, and a paste hands back what it is given.
      const cut = () => js(`(() => { const data = new DataTransfer();
        document.activeElement.dispatchEvent(new ClipboardEvent("cut", { clipboardData: data, bubbles: true, cancelable: true }));
        window.__cut = data.getData("text/plain"); })()`);
      const paste = (text) => js(`(() => { const data = new DataTransfer();
        data.setData("text/plain", ${text === undefined ? "window.__cut" : JSON.stringify(text)});
        document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })); })()`);
      // The browser's clipboard as a page reads it: refused, or holding text.
      const clipboard = (text) => js(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        readText: async () => { if (${text === null}) throw new Error("refused"); return ${JSON.stringify(text)}; } } })`);
      const said = () => js("document.getElementById('status').textContent");
      const chooseRows = async (a, b) => {
        await click(rowNumber(a));
        await click(rowNumber(b), SHIFT);
      };
      await rightClick(rowNumber(1));
      check(await labelOf("row-above") === "Insert row above" && await labelOf("column-left") === "Insert column left",
        "with nothing cut, the menu holds Insert row above and Insert column left");
      check(await js("Array.from(document.querySelectorAll('.menu.context > [data-cmd]')).slice(0, 3).map((el) => el.dataset.cmd).join()") === "cut,copy,paste",
        "Cut, Copy and Paste stand first in the right-click menu, as in Excel");
      await press("Escape");
      await chooseRows(3, 4);
      await cut();
      check(await marked() === "20,21,30,31", "a cut of rows chosen by their numbers marks them", await marked());
      await saves("and removes nothing", start);
      await rightClick(rowNumber(1));
      check(await labelOf("row-above") === "Insert cut rows" && await labelOf("column-left") === "Insert column left",
        "Insert row above then reads Insert cut rows, in the same place, and Insert column left stays");
      await click('.menu.context [data-cmd="row-above"]');
      const moved = `${H}:::table name="t"\n| "n" | "f" |\n| 3 | |\n| 4 | =sum(A3:A4) |\n| 1 | =A3*10 |\n| 2 | |\n:::\n`;
      await saves("Insert cut rows moves them above the row, and formulas follow their rows", moved);
      check(await marked() === "", "the mark goes", await marked());
      check(await js("Array.from(new Set(Array.from(document.querySelectorAll('#doc td.in-range')).map((el) => el.dataset.r))).join()") === "0,1",
        "and the moved rows stay chosen at their new place");
      await menu("undo");
      await saves("one undo puts them back", start);
      await chooseRows(1, 2);
      await cut();
      await rightClick(rowNumber(2));
      await click('.menu.context [data-cmd="row-above"]');
      await saves("rows inserted into themselves stay where they are", start);
      check(await marked() === "00,01,10,11", "and stay cut", await marked());
      await press("Escape");
      check(await marked() === "", "Esc drops the cut", await marked());
      await rightClick(rowNumber(4));
      check(await labelOf("row-above") === "Insert row above", "and the item reads Insert row above again");
      await press("Escape");
      await chooseRows(1, 1);
      await cut();
      await click(cell(3, 0));
      await type("9");
      await press("Enter");
      check(await marked() === "", "any other edit drops the cut too", await marked());
      await rightClick(rowNumber(2));
      check(await labelOf("row-above") === "Insert row above", "so the item inserts an empty row again");
      await press("Escape");

      // A paste while a cut waits moves the cut cells there, and references to them follow.
      await load(start);
      await click(cell(0, 0));
      await click(cell(1, 0), SHIFT);
      await cut();
      check(await marked() === "00,10", "a cut of a range of cells marks it", await marked());
      await saves("and clears nothing", start);
      await click(cell(1, 1));
      await paste();
      const shifted = `${H}:::table name="t"\n| "n" | "f" |\n| | =B2*10 |\n| | 1 |\n| 3 | 2 |\n| 4 | =sum(B2:B3) |\n:::\n`;
      await saves("a paste moves the cells there, and the references to them follow", shifted);
      check(await marked() === "" && await ranged() === "11,21", "the cut ends, and the moved cells stay chosen", await ranged());
      await menu("undo");
      await saves("the move is one step of undo", start);
      await click(cell(2, 1));
      await paste("7");
      await saves("after the paste the cut is gone, so a paste pastes again", start.replace("| 3 | |", "| 3 | 7 |"));
      await load(start);
      await click(cell(0, 0));
      await cut();
      await click(cell(2, 1));
      await paste("9");
      await saves("text copied since in another program pastes as usual", start.replace("| 3 | |", "| 3 | 9 |"));
      check(await marked() === "", "and the cut drops", await marked());

      // Paste in the menus reads the clipboard, and acts as Ctrl+V does there.
      await load(start);
      await click(cell(2, 1));
      await clipboard(null);
      await menu("paste");
      check(await said() === "Press Ctrl+V to paste.", "where the browser refuses the clipboard, Paste asks for Ctrl+V", await said());
      await saves("and changes nothing", start);
      await clipboard("x\ty");
      await click(cell(1, 0));
      await menu("paste");
      await saves("where it reads the clipboard, Paste fills the cells as Ctrl+V does",
        start.replace("| 2 | |", '| "x" | "y" |'));
      await load(start);
      await clipboard(null);
      await click(cell(1, 0));
      await cut();
      await click(cell(2, 1));
      await menu("paste");
      await saves("with the clipboard refused, Paste still moves the cells a cut left waiting",
        start.replace("| 2 | |\n| 3 | |", "| | |\n| 3 | 2 |"));

      // Whole rows cut and pasted on a row write over it, and leave their own rows empty.
      await load(start);
      await chooseRows(3, 4);
      await cut();
      await click(cell(0, 1));
      await paste();
      await saves("whole rows pasted on a row take its place; references to rows written over become #REF!",
        `${H}:::table name="t"\n| "n" | "f" |\n| 3 | |\n| 4 | =sum(#REF!) |\n| | |\n| | |\n:::\n`);
      check(await js("Array.from(new Set(Array.from(document.querySelectorAll('#doc td.in-range')).map((el) => el.dataset.r))).join()") === "0,1",
        "and the rows stay chosen at their new place");

      // Cut cells move only inside their own table.
      const two = `${start}\n:::table name="s"\n| "x" |\n| 5 |\n:::\n`;
      await load(two);
      await click(cell(0, 0));
      await cut();
      await click('#doc .table ~ .table td[data-r="0"][data-c="0"]');
      await paste();
      check((await said()).startsWith("Cut cells move only inside their own table"), "a paste in another table is refused", await said());
      await saves("and changes nothing", two);
      await press("Escape");

      // Columns, chosen by their letters, likewise.
      const columns = `${H}:::table name="t" widths="1,3"\n| "a" | "b" |\n| 1 | =A1 |\n:::\n`;
      await load(columns);
      await click(letter(2));
      await menu("cut");
      check(await marked() === "-11,01", "Cut from the right-click menu on a column chosen by its letter marks it, name and all", await marked());
      await saves("and removes nothing", columns);
      await rightClick(letter(1));
      check(await labelOf("column-left") === "Insert cut columns" && await labelOf("row-above") === "Insert row above",
        "Insert column left then reads Insert cut columns, and Insert row above stays");
      await click('.menu.context [data-cmd="column-left"]');
      await saves("Insert cut columns moves it left of the column, with its name, width and references",
        `${H}:::table name="t" widths="3,1"\n| "b" | "a" |\n| =B1 | 1 |\n:::\n`);
      await menu("undo");
      await saves("in one step of undo", columns);
    },

    // While a formula is typed, a press on a cell writes its reference at the caret, and a drag a
    // range, as Excel's point mode does. Where no reference can go, a press ends the edit as before.
    async pointing() {
      const start = `${H}:::table name="t"\n| "a" | "b" |\n| 1 | |\n| 2 | |\n| 3 | |\n:::\n`;
      await load(start);
      const cell = (r, c) => `#doc td[data-r="${r}"][data-c="${c}"]`;
      const typed = () => js("(() => { const i = document.querySelector('#doc .cell-input'); return i ? i.value : null; })()");
      const outlined = () => js("document.querySelectorAll('#doc .pointed').length");
      const mouse = async (type, selector) => {
        const [x, y] = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
          return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
        await page("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
      };
      await click(cell(0, 1));
      await type("=sum(");
      await mouse("mousePressed", cell(0, 0));
      await mouse("mouseMoved", cell(1, 0));
      check(await typed() === "=sum(A1:A2", "a drag after =sum( writes the range at the caret", await typed());
      check(await outlined() === 2, "and outlines the cells while the button is down", String(await outlined()));
      await mouse("mouseReleased", cell(1, 0));
      check(await outlined() === 0, "the outline goes when the button comes up");
      await type(")");
      check(await typed() === "=sum(A1:A2)", "the cell stays open, the caret after the range", await typed());
      await press("Enter");
      const summed = start.replace("| 1 | |", "| 1 | =sum(A1:A2) |");
      await saves("Enter takes the formula", summed);
      check(await js(`document.querySelector('${cell(0, 1)}').textContent`) === "3", "which gives the sum");
      await click(cell(1, 1));
      await type("=");
      await click(cell(0, 0));
      check(await typed() === "=A1", "a press after = writes the cell's reference", await typed());
      await click(cell(2, 0));
      check(await typed() === "=A3", "a second press replaces the reference just written", await typed());
      await type("*");
      await click(cell(0, 0));
      check(await typed() === "=A3*A1", "after typing, a press writes a new reference", await typed());
      await press("Escape");
      await saves("Esc drops the edit as before", summed);
      await click(cell(2, 1));
      await type("=1+2");
      await click(cell(0, 0));
      check(await typed() === null, "a press when the caret stands after a number ends the edit");
      await saves("and takes the formula, as before", summed.replace("| 3 | |", "| 3 | =1+2 |"));
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
