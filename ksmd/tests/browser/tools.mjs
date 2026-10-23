// The page's tools over a whole document or a range of cells. Each is driven through the
// browser's own input events, as `main.mjs` drives the rest, and checked by the saved source and
// its undo.
// `tools(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function tools({ page, js, settle, until, press, type, select, click, menu, load, saves }) {
  const text = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const found = () => text(".find-count");
  const inRange = () => js("Array.from(document.querySelectorAll('#doc .in-range'))" +
    ".map((el) => `${el.dataset.r}:${el.dataset.c}`).join(' ')");

  // A press at one place, a move to another, and a release there, as a person's drag.
  async function dragBetween(from, to) {
    const at = (selector) => js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    const [x, y] = await at(from);
    const [x2, y2] = await at(to);
    await page("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: x2, y: y2, button: "left", buttons: 1 });
    await page("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
  }

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
      await press("Escape");
      await click('#doc td[data-r="0"][data-c="1"]');
      await click('#doc td[data-r="2"][data-c="1"]', SHIFT);
      await menu("fill-down");
      await saves("Table, Fill, Fill down does the same", table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | =A3*2 |\n"));
      await menu("undo");
      await click('#doc td[data-r="0"][data-c="1"]');
      await press("Escape");
      await click('#doc td[data-r="0"][data-c="1"]');
      await settle();
      check(await js("!!document.querySelector('#doc .fill-handle')"), "a chosen cell shows the fill handle");
      await dragBetween("#doc .fill-handle", '#doc td[data-r="2"][data-c="1"]');
      await saves("a drag of the handle down fills the cells it reaches",
        table("| 1 | =A1*2 |\n| 2 | =A2*2 |\n| 3 | =A3*2 |\n"));
      await menu("undo");
      await saves("and one undo takes it back", start);
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
