// The page's tools over a whole document or a range of cells. Each is driven through the
// browser's own input events, as `main.mjs` drives the rest, and checked by the saved source and
// its undo.
// `tools(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function tools({ browser, page, js, settle, until, press, type, select, click, menu, load,
  saves, dragTo, rightClick, openCell }) {
  const text = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const found = () => text(".find-count");
  const inRange = () => js("Array.from(document.querySelectorAll('#doc .in-range'))" +
    ".map((el) => `${el.dataset.r}:${el.dataset.c}`).join(' ')");

  return {
    async find() {
      const table = ':::table name="t"\n| "w" | "n" |\n| "Words" | =1+2 |\n:::\n';
      const start = `${H}Some **bold**words here.\n\nMore words\n\n${table}`;
      await load(start);
      await select(0, 0, 0);
      await press("f", CTRL);
      check(await js("!document.querySelector('.find').hidden && " +
        "document.activeElement.classList.contains('find-text')"),
      "Ctrl+F opens the find bar, with the focus in its box");
      check(await js("document.querySelector('.find .replace-part').hidden"),
        "and without the replace part");
      await type("words");
      check(await found() === "1 of 3", "typing finds the matches in text and in cells, ignoring case",
        await found());
      await saves("typing in the find box never changes the document", start);
      check(await js("CSS.highlights.get('ksmd-found').size === 1 && " +
        "CSS.highlights.get('ksmd-found-now').size === 1"),
      "matches in text are highlighted without changing the page's text");
      check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"0\"]').classList.contains('found')"),
        "and a cell that holds one is marked");
      await press("Enter");
      check(await found() === "2 of 3", "Enter goes to the next match");
      await press("Enter", SHIFT);
      check(await found() === "1 of 3", "Shift+Enter to the one before");
      await click(".find .find-case");
      check(await found() === "2 of 2" || await found() === "1 of 2", "Match case leaves out 'Words'",
        await found());
      await click(".find .find-case");
      await js(`(() => { const b = document.querySelector('.find-text'); b.value = "boldw";
        b.dispatchEvent(new Event("input")); })()`);
      check(await found() === "1 of 1", "a match can cross a mark: **bold**words holds 'boldw'");
      await js(`(() => { const b = document.querySelector('.find-text'); b.value = "1+2";
        b.dispatchEvent(new Event("input")); })()`);
      check(await found() === "1 of 1", "a formula's source is searched, not its value");

      await press("h", CTRL);
      check(await js("!document.querySelector('.find .replace-part').hidden"),
        "Ctrl+H shows the replace part");
      await js("document.querySelector('.replace-text').focus()");
      await type("2+2");
      await press("Enter");
      await saves("Enter in the replace box replaces the match: here a formula's source",
        start.replace("=1+2", "=2+2"));
      check(await text('#doc td[data-r="0"][data-c="1"]') === "4", "and the cell calculates it");
      await menu("undo");
      await saves("one undo takes it back", start);

      await js(`(() => { const b = document.querySelector('.find-text'); b.value = "words";
        b.dispatchEvent(new Event("input")); })()`);
      await js("document.querySelector('.replace-text').value = 'terms'");
      await click('.find [data-find="replace"]');
      await saves("Replace changes the current match only, keeping its mark",
        start.replace("**bold**words", "**bold**terms"));
      check(await found() === "1 of 2", "and the next match becomes the current one", await found());
      await click('.find [data-find="all"]');
      await saves("Replace all changes every match left, in text and in cells",
        `${H}Some **bold**terms here.\n\nMore terms\n\n${table.replace('"Words"', '"terms"')}`);
      check((await text("#status")).startsWith("Replaced 2 matches"), "and says how many");
      await menu("undo");
      await saves("one undo takes the whole Replace all back",
        start.replace("**bold**words", "**bold**terms"));
      await menu("undo");
      await saves("and the next the single Replace", start);

      await js(`(() => { const b = document.querySelector('.find-text'); b.value = "more";
        b.dispatchEvent(new Event("input")); })()`);
      await js("document.querySelector('.find-text').focus()");
      await press("Escape");
      check(await js("document.querySelector('.find').hidden"), "Esc closes the bar");
      const sel = await js("JSON.stringify(ksmd.selection())");
      check(sel.startsWith('{"a":[0,1,0,0],"f":[0,1,0,4]'), "and the match it showed is selected", sel);
      check(await js("!CSS.highlights.has('ksmd-found') && !document.querySelector('#doc .found, #doc .found-now')"),
        "and the highlights go");
    },

    async ranges() {
      const table = (rows) => `${H}:::table name="t"\n| "a" | "b" | "c" |\n${rows}:::\n`;
      const start = table("| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n| 7 | 8 | 9 |\n");
      await load(start);
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("ArrowDown", SHIFT);
      await press("ArrowRight", SHIFT);
      check(await inRange() === "0:0 0:1 1:0 1:1", "Shift and the arrow keys choose a range from the open cell",
        await inRange());
      await press("ArrowDown", SHIFT);
      check(await inRange() === "0:0 0:1 1:0 1:1 2:0 2:1", "and reach further at each press");
      await press("ArrowUp", SHIFT);
      await press("Delete");
      await saves("Delete clears the range's cells, as one action",
        table("| | | 3 |\n| | | 6 |\n| 7 | 8 | 9 |\n"));
      await menu("undo");
      await saves("and one undo gives them back", start);
      await click("#doc tbody tr:nth-child(2) th.row-number");
      check(await inRange() === "1:0 1:1 1:2", "a press on a row number chooses the row");
      await click("#doc thead th.letter:nth-child(3)");
      check(await inRange() === "0:1 1:1 2:1", "a press on a column letter its data cells", await inRange());
      await click("#doc thead th.letter:nth-child(4)", SHIFT);
      check(await inRange() === "0:1 0:2 1:1 1:2 2:1 2:2", "and Shift+press reaches across columns",
        await inRange());
      const copied = await js(`(() => {
        const data = new DataTransfer();
        document.activeElement.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
        return data.getData("text/plain");
      })()`);
      check(copied === "2\t3\r\n5\t6\r\n8\t9\r\n", "a copy gives the range as tab-separated rows",
        JSON.stringify(copied));
      await js(`(() => {
        const data = new DataTransfer();
        data.setData("text/plain", "0");
        document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      })()`);
      await saves("a paste of one value fills every cell of the range",
        table("| 1 | 0 | 0 |\n| 4 | 0 | 0 |\n| 7 | 0 | 0 |\n"));
      await menu("undo");
      // The range keeps to its rows: a row added above moves it down with them.
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("ArrowDown", SHIFT);
      await menu("row-above");
      check(await inRange() === "1:0 2:0", "a range stays on its rows when a row goes in above them",
        await inRange());
      await menu("undo");
      check(await inRange() === "0:0 1:0", "and follows them back on undo", await inRange());
    },

    async fill() {
      const table = (rows) => `${H}:::table name="t"\n| "a" | "b" |\n${rows}:::\n`;
      const start = table("| 1 | =A1*2 |\n| 2 | |\n| 3 | |\n");
      await load(start);
      await click('#doc td[data-r="0"][data-c="1"]');
      await press("ArrowDown", SHIFT);
      await press("ArrowDown", SHIFT);
      await press("d", CTRL);
      await saves("Ctrl+D fills the range down from its top cell, shifting the references",
        table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | =A3*2 |\n"));
      check(await text('#doc td[data-r="2"][data-c="1"]') === "6", "and the copies calculate");
      await menu("undo");
      await saves("one undo takes the whole fill back", start);
      await click('#doc td[data-r="1"][data-c="1"]');
      await press("d", CTRL);
      await saves("Ctrl+D in one open cell copies the cell above it",
        table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | |\n"));
      await menu("undo");
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("ArrowRight", SHIFT);
      await press("r", CTRL);
      await saves("Ctrl+R fills right from the left cell", table("| 1 | 1 |\n| 2 | |\n| 3 | |\n"));
      await menu("undo");
      await click('#doc td[data-r="0"][data-c="1"]');
      await click('#doc td[data-r="0"][data-c="1"]');
      await click('#doc td[data-r="2"][data-c="1"]', SHIFT);
      await menu("fill-down");
      await saves("the right-click menu's Fill down does the same", table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | =A3*2 |\n"));
      await menu("undo");
      await click('#doc td[data-r="0"][data-c="1"]');
      await click('#doc td[data-r="0"][data-c="1"]');
      await settle();
      check(await js("!!document.querySelector('#doc .fill-handle')"), "a chosen cell shows the fill handle");
      await dragTo("#doc .fill-handle", '#doc td[data-r="2"][data-c="1"]');
      await saves("a drag of the handle down fills the cells it reaches",
        table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | =A3*2 |\n"));
      await menu("undo");
      await saves("and one undo takes it back", start);
      const counts = `${H}:::table name="n"\n| "n" |\n| 1 |\n| 2 |\n| |\n| |\n:::\n`;
      await load(counts);
      await click('#doc td[data-r="0"][data-c="0"]');
      await click('#doc td[data-r="1"][data-c="0"]', SHIFT);
      await settle();
      await dragTo("#doc .fill-handle", '#doc td[data-r="3"][data-c="0"]');
      await saves("a drag of the handle from 1 and 2 goes on with 3 and 4",
        `${H}:::table name="n"\n| "n" |\n| 1 |\n| 2 |\n| 3 |\n| 4 |\n:::\n`);
    },

    // A long table's heading rows stay under the header while the page scrolls, and print as the
    // browser prints a table's heading.
    async frozen() {
      let rows = "";
      for (let i = 1; i <= 80; i++) rows += `| "row ${i}" | ${i} |\n`;
      await load(`${H}# Long\n\n:::table name="t"\n| "name" | "n" |\n${rows}:::\n\nAfter.\n`);
      await js("window.scrollTo(0, 1500)");
      await settle();
      const at = await js(`JSON.stringify([document.querySelector('.top').getBoundingClientRect().bottom,
        document.querySelector('#doc thead').getBoundingClientRect().top])`);
      const [bottom, top] = JSON.parse(at);
      check(Math.abs(bottom - top) < 1.5, "scrolled into a long table, its heading rows stand under the header", at);
      check(await js(`(() => {
        const r = document.querySelector('#doc th.name').getBoundingClientRect();
        return document.elementFromPoint(r.left + 10, r.top + r.height / 2).closest('th.name') !== null;
      })()`), "and nothing covers the names");
      check(await js(`(() => {
        const r = document.querySelector('#doc .col-edge').getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el.classList.contains('col-edge');
      })()`), "the edges that resize the columns stay where a press reaches them");
      await page("Emulation.setEmulatedMedia", { media: "print" });
      check(await js("getComputedStyle(document.querySelector('#doc thead')).position") === "static" &&
        await js("getComputedStyle(document.querySelector('#doc thead')).display") === "table-header-group",
      "printed, the heading is the table's own, which the browser repeats on each page");
      await page("Emulation.setEmulatedMedia", { media: "" });
      await js("window.scrollTo(0, 0)");
    },

    // Groups of rows hide and show from the outline beside the row numbers, and are saved.
    async groups() {
      const rows = "| 1 |\n| 2 |\n| 3 |\n| 4 |\n| 5 |\n| 6 |\n:::\n";
      const table = (groups) => `${H}:::table name="t"${groups ? ` groups="${groups}"` : ""}\n| "n" |\n${rows}`;
      const hidden = () => js("Array.from(document.querySelectorAll('#doc tbody tr'))" +
        ".map((tr, r) => (tr.hidden ? r + 1 : '')).filter(String).join(' ')");
      const toggles = () => js("Array.from(document.querySelectorAll('#doc .outline-toggle'))" +
        ".map((b) => `${b.dataset.from}-${b.dataset.to}:${b.textContent}`).join(' ')");
      await load(table("rows 2-4 closed"));
      check(await hidden() === "2 3 4" && await toggles() === "1-3:+",
        "a hidden group's rows do not show, and a + stands on the row above them",
        `${await hidden()} | ${await toggles()}`);
      await click("#doc .outline-toggle");
      await saves("a press on + shows the rows, and the file keeps that", table("rows 2-4"));
      check(await hidden() === "" && await toggles() === "1-3:\u2212" &&
        await js("document.querySelectorAll('#doc .outline-line').length === 2 && " +
          "document.querySelectorAll('#doc .outline-end').length === 1"),
      "a group that shows has a − and a line beside its rows", await toggles());
      await click('#doc td[data-r="4"][data-c="0"]');
      await click('#doc td[data-r="5"][data-c="0"]', SHIFT);
      await menu("group-rows");
      await saves("the right-click menu's Group rows makes the chosen rows a group of their own",
        table("rows 2-4, rows 5-6"));
      await menu("group-hide");
      await saves("Hide detail hides the group of the chosen row", table("rows 2-4, rows 5-6 closed"));
      check(await hidden() === "5 6", "and its rows go out of sight", await hidden());
      await click('#doc td[data-r="2"][data-c="0"]');
      await press("ArrowLeft", ALT | SHIFT);
      check(await js("document.activeElement.closest('td[data-r=\"2\"]') !== null"),
        "the cell stays open for the next key");
      await saves("Alt+Shift+Left in a cell ungroups its rows", table("rows 5-6 closed"));
      await click('#doc td[data-r="2"][data-c="0"]');
      await press("ArrowRight", ALT | SHIFT);
      await saves("and Alt+Shift+Right groups them again", table("rows 3, rows 5-6 closed"));
      for (let i = 0; i < 4; i++) await menu("undo");
      await saves("undo takes each step back", table("rows 2-4"));
    },

    // A table downloads as CSV: names, then calculated values, quoted where a value needs it.
    async csv() {
      await load(`${H}:::table name="Q1 sales" formats=",grouped:2"\n| "item" | "cost" |\n` +
        `| "Pens, blue" | 1234.5 |\n| "say \\"hi\\"" | =B1*2 |\n| "two\\nlines" | |\n:::\n`);
      await js("window.__file = null; window.__name = ''; URL.createObjectURL = (b) => { window.__file = b; return 'blob:x'; };" +
        "HTMLAnchorElement.prototype.click = function () { window.__name = this.download; };");
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("table-csv");
      // Decoding as text would drop the byte order mark, so the bytes are read.
      const got = await js("window.__file.arrayBuffer().then((b) => JSON.stringify([window.__name, " +
        "Array.from(new Uint8Array(b).slice(0, 3)).join(' '), new TextDecoder('utf-8', { ignoreBOM: true }).decode(b)]))");
      check(got === JSON.stringify(["Q1 sales.csv", "239 187 191",
        "\uFEFFitem,cost\r\n\"Pens, blue\",1234.5\r\n\"say \"\"hi\"\"\",2469\r\n\"two\nlines\",\r\n"]),
      "Export as CSV writes the names and the calculated values, numbers without their format", got);
    },

    // A column's choices: offered while a cell is typed in, kept to, and set from the menu.
    async choices() {
      const table = (choices, rows) => `${H}:::table name="t"${choices}\n| "task" | "status" |\n${rows}:::\n`;
      await load(table(' choices=",Open|Done"', '| "Write" | "Maybe" |\n| "Read" | |\n'));
      check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').classList.contains('off-list')"),
        "a cell off its column's list is marked");
      await openCell('#doc td[data-r="1"][data-c="1"]');
      const offered = await js("(() => { const i = document.querySelector('#doc .cell-input'); " +
        "return Array.from(document.getElementById(i.getAttribute('list')).options, (o) => o.value).join('|'); })()");
      check(offered === "Open|Done", "an open cell of the column offers its choices", offered);
      await type("done");
      await press("Enter");
      await saves("a typed choice takes the list's spelling", table(' choices=",Open|Done"',
        '| "Write" | "Maybe" |\n| "Read" | "Done" |\n'));
      await click('#doc td[data-r="1"][data-c="1"]');
      await type("Later");
      await press("Enter");
      check((await js("document.getElementById('status').textContent")).includes("only its choices"),
        "a value off the list is refused, and the page says why");
      check(await js("document.querySelector('#doc .cell-input').value") === "Later",
        "and it stays in its cell to be put right");
      await press("Escape");
      browser.answerPrompts("Open, Done, Later");
      await menu("column-choices");
      browser.answerPrompts(null);
      await saves("Choices... sets the column's list from a line of commas", table(' choices=",Open|Done|Later"',
        '| "Write" | "Maybe" |\n| "Read" | "Done" |\n'));
    },

    // A column's colour rule: the cells that meet it take its colours, and the panel sets it.
    async rules() {
      const table = (rules) => `${H}:::table name="t"${rules}\n| "item" | "n" |\n| "Pens" | -2 |\n| "Ink" | 5 |\n:::\n`;
      await load(table(' rules=",<0;color:#9c0006 fill:#ffc7ce"'));
      const fill = (r) => js(`getComputedStyle(document.querySelector('#doc td[data-r="${r}"][data-c="1"]')).backgroundColor`);
      check(await fill(0) === "rgb(255, 199, 206)" && await fill(1) === "rgba(0, 0, 0, 0)",
        "a cell that meets its column's rule takes the rule's colours, and one that does not keeps its own",
        `${await fill(0)} ${await fill(1)}`);
      await click('#doc td[data-r="1"][data-c="1"]');
      await menu("column-rule");
      check(await js("document.querySelector('.rule-panel .rule-kind').value") === "below",
        "Colour by value... opens a panel that shows the column's rule");
      await js(`(() => {
        const p = document.querySelector('.rule-panel');
        p.querySelector('.rule-kind').value = 'above';
        p.querySelector('.rule-kind').dispatchEvent(new Event('change'));
        p.querySelector('.rule-value').value = '3';
        p.querySelector('.rule-style').value = '2';
      })()`);
      await click(".rule-panel .rule-apply");
      await saves("Apply saves the rule the panel shows", table(' rules=",>3;color:#006100 fill:#c6efce"'));
      check(await fill(1) === "rgb(198, 239, 206)" && await fill(0) === "rgba(0, 0, 0, 0)",
        "and the cells follow it at once", `${await fill(0)} ${await fill(1)}`);
      await menu("undo");
      await saves("one undo gives the rule before back", table(' rules=",<0;color:#9c0006 fill:#ffc7ce"'));
    },

    // A typed date is a date: it shows as typed, adds days in a formula, and the handle goes on.
    async dates() {
      await load(`${H}:::table name="t"\n| "day" | "next" |\n| | |\n| | |\n:::\n`);
      await click('#doc td[data-r="0"][data-c="0"]');
      await type("2026-10-30");
      await press("Tab");
      await type("=A1+7");
      await press("Enter");
      await saves("a typed date stands bare in the file", `${H}:::table name="t"\n| "day" | "next" |\n` +
        "| 2026-10-30 | =A1+7 |\n| | |\n:::\n");
      const shown = await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').textContent");
      check(shown === "2026-11-06", "a date plus days shows as a date", shown);
      await click('#doc td[data-r="0"][data-c="0"]');
      await settle();
      await dragTo("#doc .fill-handle", '#doc td[data-r="1"][data-c="0"]');
      await saves("the handle goes on with the next day", `${H}:::table name="t"\n| "day" | "next" |\n` +
        "| 2026-10-30 | =A1+7 |\n| 2026-10-31 | |\n:::\n");
    },

    // A chart of a table: inserted from the menu, drawn from the values, changed in its panel.
    async charts() {
      const table = ':::table name="t"\n| "item" | "cost" |\n| "Pens" | 3 |\n| "Ink" | 8 |\n:::\n';
      await load(`${H}${table}`);
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("table-chart");
      await saves("Insert chart puts a bar chart of the table after it",
        `${H}${table}\n:::chart table="t" kind="bar" labels="item" values="cost"\n:::\n`);
      const bars = () => js("Array.from(document.querySelectorAll('#doc .chart rect'), " +
        "(r) => Math.round(Number(r.getAttribute('height')))).join(' ')");
      const before = await bars();
      check(before.split(" ").length === 2 && Number(before.split(" ")[1]) > Number(before.split(" ")[0]),
        "it draws one bar per row, as tall as the value", before);
      await click('#doc td[data-r="0"][data-c="1"]');
      await type("16");
      await press("Enter");
      const after = await bars();
      check(after !== before && Number(after.split(" ")[0]) > Number(after.split(" ")[1]),
        "an edit to the table draws the chart again", after);
      await click("#doc .chart .chart-edit");
      await js(`(() => {
        const p = document.querySelector('.chart-panel');
        p.querySelector('.chart-kind').value = 'line';
        p.querySelector('.chart-title').value = 'Costs';
      })()`);
      await click(".chart-panel .chart-apply");
      await saves("the panel sets the kind and the title", `${H}${table.replace("| 3 |", "| 16 |")}\n` +
        ':::chart table="t" kind="line" labels="item" values="cost" title="Costs"\n:::\n');
      check(await js("!!document.querySelector('#doc .chart path') && " +
        "document.querySelector('#doc .chart figcaption').textContent === 'Costs'"),
      "a line chart draws a line, under its title");
      await click("#doc .chart .block-remove");
      await saves("Remove takes the chart away, and the table stays", `${H}${table.replace("| 3 |", "| 16 |")}`);
    },

    // Notes on a cell and on a paragraph: added, shown, and resolved.
    async notes() {
      const table = (cell) => `${H}Plan text.\n\n:::table name="t"\n| "a" |\n| ${cell} |\n:::\n`;
      await load(table("1"));
      await click('#doc td[data-r="0"][data-c="0"]');
      browser.answerPrompts("Why one?");
      await menu("note");
      browser.answerPrompts(null);
      await saves("the ribbon's Note gives the chosen cell a note", table('1 {note="Why one?"}'));
      check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"0\"]').classList.contains('has-note') && " +
        "document.querySelector('#doc td[data-r=\"0\"][data-c=\"0\"]').title === 'Note: Why one?'"),
      "the cell is marked, and pointing at it shows the note");
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("note-resolve");
      await saves("Resolve note takes it away", table("1"));
      await click("#doc p");
      browser.answerPrompts("Too short?");
      await menu("note");
      browser.answerPrompts(null);
      await saves("in text, Note gives the paragraph a note", `${H}{note="Too short?"}\nPlan text.\n\n` +
        ':::table name="t"\n| "a" |\n| 1 |\n:::\n');
      check(await js("document.querySelector('#doc p.has-note').title") === "Note: Too short?",
        "and the paragraph is marked");
      await menu("undo");
      await saves("one undo takes the note back off", table("1"));
    },

    // A checklist ticked by a press on its box, a quote, and a divider put in and taken out.
    async blocks() {
      await load(`${H}Buy pens\n\nCall Sam\n`);
      await select(0, 0, 0);
      await menu("checks");
      await saves("the ribbon's Checklist makes a checklist item", `${H}- [ ] Buy pens\n\nCall Sam\n`);
      await js(`(() => {
        const li = document.querySelector('#doc .li[data-check]');
        const r = li.getBoundingClientRect();
        window.__box = [r.left + 4, r.top + r.height / 2];
      })()`);
      const [x, y] = await js("window.__box");
      await page("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await page("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await settle();
      await saves("a press on the box ticks it", `${H}- [x] Buy pens\n\nCall Sam\n`);
      await select(1, 0, 0);
      await js("(() => { const k = document.querySelector('.ribbon [data-ribbon=\"kind\"]'); " +
        "k.value = 'quote'; k.dispatchEvent(new Event('change')); })()");
      await saves("Kind of block, Quote makes a quote", `${H}- [x] Buy pens\n\n> Call Sam\n`);
      check(await js("!!document.querySelector('#doc blockquote')"), "and the page shows it set apart");
      await select(1, 0, 8);
      await menu("divider");
      await saves("Divider puts a line after the caret's block", `${H}- [x] Buy pens\n\n> Call Sam\n\n---\n`);
      await click("#doc .divider .block-remove");
      await saves("its Remove button takes it away", `${H}- [x] Buy pens\n\n> Call Sam\n`);
    },

    // The status line's figures: a range's sum, average and count, or the document's words.
    async figures() {
      await load(`${H}Two words.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | "x" |\n| 4 | 2.5 |\n:::\n`);
      const shown = () => js("document.querySelector('.figures').textContent");
      check(await until("document.querySelector('.figures').textContent === '2 words · 9 characters'"),
        "with no range, the status line counts the document's words and characters", await shown());
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("ArrowDown", SHIFT);
      await press("ArrowRight", SHIFT);
      check(await until("document.querySelector('.figures').textContent === 'Sum 7.5 · Average 2.5 · Count 4'"),
        "with a range, it shows the sum and average of its numbers and the count of its values", await shown());
      await press("Escape");
    },

    // A system set to dark makes the page dark; a cell's own fill keeps dark text on it.
    async dark() {
      await load(`${H}Text.\n\n:::table name="t"\n| "a" | "b" |\n| 1 {fill="#ffff00"} | 2 |\n:::\n`);
      const looks = () => js(`JSON.stringify([getComputedStyle(document.body).backgroundColor,
        getComputedStyle(document.querySelector('#doc td[data-r="0"][data-c="0"]')).color,
        getComputedStyle(document.querySelector('#doc td[data-r="0"][data-c="1"]')).color])`);
      await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
      const dark = await looks();
      await page("Emulation.setEmulatedMedia", { features: [] });
      check(dark === '["rgb(30, 31, 34)","rgb(29, 29, 31)","rgb(227, 227, 227)"]',
        "a dark system makes the page dark, and a filled cell keeps dark text", dark);
      check(await looks() === '["rgb(255, 255, 255)","rgb(29, 29, 31)","rgb(29, 29, 31)"]',
        "and a light one gives the light page back", await looks());
    },

    // A table command's key stands beside its item in the right-click menu, and runs it from a cell.
    async keys() {
      const table = (formats, note) => `${H}:::table name="t"${formats}\n| "a" |\n| 0.5${note} |\n| 2 |\n:::\n`;
      await load(table("", ""));
      await click('#doc td[data-r="0"][data-c="0"]');
      await press("%", CTRL | SHIFT);
      await saves("Ctrl+Shift+% in an open cell gives its column the percent format", table(' formats="percent:0"', ""));
      check(await js("document.activeElement.matches('#doc td.chosen[data-r=\\'0\\']')"),
        "and the cell stays chosen, so the next key reaches it");
      await press("~", CTRL | SHIFT);
      await saves("Ctrl+Shift+~ gives it back the general format", table("", ""));
      browser.answerPrompts("Check");
      await press("F2", SHIFT);
      browser.answerPrompts(null);
      await saves("Shift+F2 asks for the cell's note", table("", ' {note="Check"}'));
      await press("ArrowDown", ALT);
      check(await js("!!document.querySelector('.filter-panel')"), "Alt+Down opens the column's filter");
      await press("Escape");
      await press("Escape");
      await click('#doc td[data-r="0"][data-c="0"]');
      await page("Input.dispatchMouseEvent", { type: "mousePressed", button: "right", clickCount: 1,
        ...(await js("(() => { const r = document.querySelector('#doc td.chosen').getBoundingClientRect(); " +
          "return { x: r.left + 4, y: r.top + 4 }; })()")) });
      await page("Input.dispatchMouseEvent", { type: "mouseReleased", button: "right", clickCount: 1,
        ...(await js("(() => { const r = document.querySelector('#doc td.chosen').getBoundingClientRect(); " +
          "return { x: r.left + 4, y: r.top + 4 }; })()")) });
      const shown = await js("Array.from(document.querySelectorAll('.menu.context [data-cmd] kbd'), " +
        "(k) => `${k.parentElement.dataset.cmd}=${k.textContent}`).join(' ')");
      check(shown.includes("note=Shift+F2") && shown.includes("format-percent=Ctrl+Shift+%") &&
        shown.includes("filter-column=Alt+\u2193") && shown.includes("fill-down=Ctrl+D"),
        "the right-click menu and its flyouts show each key beside its item", shown);
      await press("Escape");
    },

    // AutoSum: a cell gets the sum of the column above it, open to check; a range gets totals.
    async autosum() {
      const table = (rows) => `${H}:::table name="t"\n| "a" | "b" |\n${rows}:::\n`;
      await load(table('| 1 | 2 |\n| "x" | 3 |\n| 4 | |\n| | |\n'));
      await click('#doc td[data-r="3"][data-c="0"]');
      await press("=", ALT);
      const typed = await js("(() => { const i = document.querySelector('#doc .cell-input'); " +
        "return `${i.value}|${i.value.slice(i.selectionStart, i.selectionEnd)}`; })()");
      check(typed === "=sum(A1:A3)|A1:A3",
        "Alt+= types the sum of the whole column above, its range selected, text and all", typed);
      await press("Enter");
      await saves("and Enter takes it", table('| 1 | 2 |\n| "x" | 3 |\n| 4 | |\n| =sum(A1:A3) | |\n'));
      await click('#doc td[data-r="0"][data-c="1"]');
      await press("ArrowDown", SHIFT);
      await press("ArrowDown", SHIFT);
      await press("=", ALT);
      await saves("a range whose last row is empty gets its total there",
        table('| 1 | 2 |\n| "x" | 3 |\n| 4 | =sum(B1:B2) |\n| =sum(A1:A3) | |\n'));
      await click('#doc td[data-r="0"][data-c="1"]');
      await press("ArrowDown", SHIFT);
      await press("=", ALT);
      check(await js("document.getElementById('status').textContent").then((t) => t.startsWith("The row under")),
        "a row under the range that holds a value is never written over");
      await click('#doc td[data-r="0"][data-c="0"]');
      for (let k = 0; k < 3; k++) await press("ArrowDown", SHIFT);
      await menu("autosum-max");
      await saves("past the table's end a total adds a row, and the flyout gives Max too",
        table('| 1 | 2 |\n| "x" | 3 |\n| 4 | =sum(B1:B2) |\n| =sum(A1:A3) | |\n| =max(A1:A4) | |\n'));
      await menu("undo");
      await saves("one undo takes it back", table('| 1 | 2 |\n| "x" | 3 |\n| 4 | =sum(B1:B2) |\n| =sum(A1:A3) | |\n'));
    },

    // Print and PDF: what only editing uses goes, and so does a block left out of print.
    async print() {
      const calc = ':::table name="calc" invisible="printing"\n| "a" |\n| 1 |\n:::\n\n';
      const t = ':::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n| 3 | 4 |\n:::\n\n';
      const start = `${H}Intro.\n\n${calc}${t}---\n\nEnd.\n`;
      await load(start);
      check(await js("(() => { const b = document.querySelectorAll('#doc > .b.table'); " +
        "return b[0].classList.contains('print-hidden') && !b[1].classList.contains('print-hidden'); })()"),
      "a table left out of print is marked while editing");
      await click('#doc .table[data-name="t"] td[data-r="0"][data-c="0"]');
      await menu("filter-value");
      await page("Emulation.setEmulatedMedia", { media: "print" });
      const shown = await js(`JSON.stringify((() => {
        const d = (el) => (el ? getComputedStyle(el).display : "absent");
        const t = document.querySelector('#doc .table[data-name="t"]');
        return [d(document.querySelector('#doc .table[data-name="calc"]')), d(t),
          d(t.querySelector('thead tr')), t.querySelector('th.row-number').getBoundingClientRect().width < 1,
          d(t.querySelector('.table-name')),
          d(t.querySelector('.filter-arrow')), d(document.querySelector('.top')),
          Array.from(t.querySelectorAll('tbody tr')).filter((r) => d(r) !== 'none').length,
          getComputedStyle(document.querySelector('#doc .divider')).breakAfter,
          Array.from(t.querySelectorAll('th.name'), (th, c) => th.getBoundingClientRect().left ===
            t.querySelector('tbody tr:not([hidden]) td[data-c="' + c + '"]').getBoundingClientRect().left)
            .every(Boolean)];
      })())`);
      await page("Emulation.setEmulatedMedia", { media: "" });
      check(shown === '["none","block","none",true,"none","none","none",1,"page",true]',
        "in print the left-out table, the letters, row numbers, controls and menus go, a filter's " +
        "hidden row stays hidden, a divider ends the page, and each value stands under its name", shown);
      await click('#doc .table[data-name="t"] td[data-r="0"][data-c="0"]');
      await menu("filter-clear");
      await menu("table-print");
      await saves("the table menu's Leave out of print marks the table in the file",
        `${H}Intro.\n\n${calc}:::table name="t" invisible="printing"\n| "a" | "b" |\n| 1 | 2 |\n| 3 | 4 |\n:::\n\n` +
        "---\n\nEnd.\n");
      await menu("undo");
      await menu("table-chart");
      await click("#doc .chart .block-print");
      await saves("a chart's own button leaves it out of print",
        `${H}Intro.\n\n${calc}${t}:::chart table="t" kind="bar" labels="a" values="b" invisible="printing"\n:::\n\n` +
        "---\n\nEnd.\n");
      check(await js("!document.querySelector('.files [data-cmd=\"print\"]').hidden"),
        "File holds Print, which saves a PDF through the browser's dialog");
    },

    // View, Read-only: the document shows and takes no edit; finding and filters still work.
    async readOnly() {
      const start = `${H}Words.\n\n:::table name="t"\n| "a" |\n| 1 |\n| 2 |\n:::\n`;
      await load(start);
      await menu("read-only");
      check(await js("document.body.classList.contains('read-only') && " +
        "document.getElementById('doc').contentEditable === 'false' && " +
        "getComputedStyle(document.querySelector('.ribbon')).display === 'none' && " +
        "getComputedStyle(document.querySelector('.read-only-mark')).display !== 'none'"),
      "View, Read-only takes the ribbon away and marks the page read-only");
      await click("#doc p");
      await type("x");
      await click('#doc td[data-r="0"][data-c="0"]');
      check(await js("!document.querySelector('#doc .cell-input') && " +
        "!!document.querySelector('#doc td.chosen[data-r=\"0\"]')"),
      "a press on a cell chooses it without opening it");
      await press("Delete");
      await saves("typing and Delete change nothing", start);
      await rightClick('#doc td.chosen');
      check(await js("document.querySelector('.menu.context [data-cmd=\"row-above\"]').disabled && " +
        "!document.querySelector('.menu.context [data-cmd=\"filter-value\"]').disabled"),
      "the table menu leaves only what looks: a filter, not a new row");
      await press("Escape");
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("filter-value");
      check(await js("Array.from(document.querySelectorAll('#doc tbody tr')).filter((r) => !r.hidden).length") === 1,
        "a filter still narrows the rows");
      await menu("filter-clear");
      await menu("read-only");
      await click("#doc p");
      await type("x");
      check((await js("ksmd.source()")) !== start, "View, Read-only again turns editing back on");
      check(await js("Array.from(document.querySelectorAll('.ribbon [data-cmd], .menu [data-cmd=\"replace\"]'))" +
        ".filter((b) => b.disabled && b.dataset.cmd !== 'undo' && b.dataset.cmd !== 'redo').length === 0"),
      "and every tool of the ribbon can be pressed again");
    },

    // Repeat: with nothing to redo, Ctrl+Y and F4 do the last command again, where the person is.
    async repeat() {
      const width = () => js("document.querySelector('#doc .table thead tr:last-child').cells.length - 1");
      const redo = () => js("(() => { const b = document.querySelector('.ribbon [data-cmd=\"redo\"]'); " +
        "return `${b.lastChild.data.trim()}:${b.disabled}`; })()");
      await load(`${H}One two\n\n:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`);
      await click('#doc td[data-r="0"][data-c="0"]');
      await menu("column-right");
      check(await width() === 3 && await redo() === "Repeat:false",
        "after a command, Redo becomes Repeat", `${await width()} ${await redo()}`);
      await press("y", CTRL);
      check(await width() === 4, "Ctrl+Y inserts another column", String(await width()));
      await press("F4");
      check(await width() === 5, "and so does F4", String(await width()));
      await menu("undo");
      check(await redo() === "Redo:false", "after an undo it is Redo again", await redo());
      await press("y", CTRL);
      check(await width() === 5, "and Ctrl+Y redoes", String(await width()));
      await click("#doc p");
      await select(0, 0, 0, 3);
      await press("b", CTRL);
      await select(0, 0, 4, 7);
      await press("F4");
      check((await js("ksmd.source()")).includes("**One** **two**"),
        "in text, F4 repeats a mark on a new selection", await js("ksmd.source()"));
      await select(0, 0, 7);
      await type("!");
      check(await redo() === "Redo:true", "typing forgets what would be repeated", await redo());
    },

    // A press chooses a cell and a double press opens it, as in a spreadsheet.
    async cellPress() {
      const table = (v) => `${H}:::table name="t"\n| "a" |\n| ${v} |\n:::\n`;
      await load(table('"Pens"'));
      await click('#doc td[data-r="0"][data-c="0"]');
      check(await js("!document.querySelector('#doc .cell-input') && " +
        "document.activeElement.matches('#doc td.chosen[data-r=\"0\"]')"),
      "a press chooses the cell without opening it");
      await type("Ink");
      await press("Enter");
      await saves("typing on a chosen cell replaces its value", table('"Ink"'));
      await openCell('#doc td[data-r="0"][data-c="0"]');
      check(await js("(() => { const i = document.querySelector('#doc .cell-input'); " +
        "return !!i && i.selectionStart === 3 && i.selectionEnd === 3; })()"),
      "a double press opens it, the caret after its text");
      await type("s");
      await press("Enter");
      await saves("so typing there adds to the value", table('"Inks"'));
    },

    // A touch screen: a long press opens the table's menu, and a double tap opens the cell.
    async touch() {
      await load(`${H}:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`);
      // Where cell B1 stands now: choosing a cell can take the empty line above the table away.
      const where = async () => {
        const at = await js("(() => { const r = document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]')" +
          ".getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
        return [{ x: at[0], y: at[1] }];
      };
      let point = await where();
      const tap = async () => {
        await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
        await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      await page("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
      try {
        await page("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
        await new Promise((r) => setTimeout(r, 700));
        await page("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        check(await js("!document.querySelector('.menu.context').hidden && " +
          "document.querySelector('#doc td.chosen').dataset.c === '1'"),
        "a long press on a cell chooses it and opens the table's menu");
        await press("Escape");
        point = await where();
        await tap();
        await tap();
        check(await until("document.activeElement.getAttribute('aria-label') === 'Cell B1'"),
          "a double tap opens the cell");
        await press("Escape");
      } finally {
        await page("Emulation.setTouchEmulationEnabled", { enabled: false });
      }
    },

    async contents() {
      const start = `${H}# One\n\nText.\n\n## Two\n\nMore.\n\n### Three\n\nEnd.\n`;
      await load(start);
      const listed = () => js("Array.from(document.querySelectorAll('.contents-list li'))" +
        ".map((li) => `${li.className}:${li.textContent}`).join('|')");
      check(await js("document.querySelector('.contents').hidden"), "the contents start hidden");
      await menu("contents");
      check(await listed() === "level-1:One|level-2:Two|level-3:Three",
        "View, Contents lists the headings, each by its level", await listed());
      check(await js("localStorage.getItem('ksmd.contents')") === "1", "and the choice is kept in the browser");
      await select(1, 0, 0);
      await press("2", CTRL | ALT);
      check(await listed() === "level-1:One|level-2:Text.|level-2:Two|level-3:Three",
        "a paragraph made a heading joins the list at once", await listed());
      await saves("the contents change nothing in the document",
        `${H}# One\n\n## Text.\n\n## Two\n\nMore.\n\n### Three\n\nEnd.\n`);
      await menu("undo");
      await js("document.body.style.minHeight = '3000px'");
      await click('.contents-list a[data-k="2"]');
      await settle();
      const sel = await js("JSON.stringify(ksmd.selection().a)");
      check(sel === "[0,4,0,0]", "a press on a heading puts the caret at its start", sel);
      // The mark follows the `scroll` event, which the browser sends with a later frame.
      check(await until("document.querySelector('.contents-list a[aria-current]').textContent === 'Three'"),
        "and the heading scrolled to is marked as the one being read",
        await js("document.querySelector('.contents-list a[aria-current]').textContent"));
      await js("document.body.style.minHeight = ''");
      await page("Page.reload", {});
      await until("document.documentElement.dataset.ready === '1'");
      check(await js("!document.querySelector('.contents').hidden"), "a page opened again shows the contents still");
      await click(".contents-close");
      check(await js("document.querySelector('.contents').hidden && localStorage.getItem('ksmd.contents') === '0'"),
        "its close button hides them, and that choice is kept too");
    },
  };
}
