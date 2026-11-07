// The document as a whole: its own settings (`:::document`), the numbers of its headings and
// captions, the references that show them, and the repeated values a table shows once. Each is
// driven through the browser's own input events, as `main.mjs` drives the rest, and checked by
// the saved source and its undo.
// `documents(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function documents({ page, js, press, click, menu, load, saves, source }) {
  // A press at the first point, moves through the others with the button down, and a release at the
  // last, with the modifier keys held throughout.
  async function dragPath(points, modifiers = 0) {
    const [x0, y0] = points[0];
    await page("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", clickCount: 1, modifiers });
    for (const [x, y] of points.slice(1)) {
      await page("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1, modifiers });
    }
    const [x1, y1] = points[points.length - 1];
    await page("Input.dispatchMouseEvent", { type: "mouseReleased", x: x1, y: y1, button: "left", clickCount: 1, modifiers });
  }
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
    // Blank lines: Enter after a paragraph, then Enter again, keeps a blank line, written as a
    // line holding only `\`. It stays when the caret leaves, and Backspace after it takes it away.
    async blankLines() {
      await load(`${H}One line.\n\nNext part.\n`);
      await click("#doc p");
      await press("End");
      await press("Enter");
      await press("Enter");
      await press("Enter");
      await saves("Enter twice after a paragraph keeps two blank lines", `${H}One line.\n\n\\\n\n\\\n\nNext part.\n`);
      await press("ArrowDown");
      await saves("and they stay when the caret moves on", `${H}One line.\n\n\\\n\n\\\n\nNext part.\n`);
      check(await js("document.querySelectorAll('#doc .blank').length") === 2, "the page shows each as an empty line");
      await click("#doc p:last-of-type");
      await press("Home");
      await press("Backspace");
      await saves("Backspace at the start of the text after one takes it away", `${H}One line.\n\n\\\n\nNext part.\n`);
    },
    // An image's width, as a share of the text width: Width… sets it, and two images whose widths
    // fit stand side by side.
    async imageWidths() {
      const two = (a, b) => `${H}:::image src="a.png" alt="A"${a}\n:::\n\n:::image src="b.png" alt="B"${b}\n:::\n`;
      await load(two("", ' width="45%"'));
      await js("window.prompt = () => '45'");
      await click("#doc > .figure .image-width");
      await saves("Width… gives the image its share of the text width", two(' width="45%"', ' width="45%"'));
      check(await js("(() => { const f = document.querySelectorAll('#doc > .figure'); " +
        "const a = f[0].getBoundingClientRect(), b = f[1].getBoundingClientRect(); " +
        "return Math.abs(a.top - b.top) < 2 && b.left >= a.right - 1; })()"),
      "two images whose widths fit stand side by side");
      await js("window.prompt = () => ''");
      await click("#doc > .figure .image-width");
      await saves("an empty answer fits the image to the text again", two("", ' width="45%"'));
      await js("window.prompt = () => '150'");
      await click("#doc > .figure .image-width");
      await saves("a width past 100 is refused, and nothing changes", two("", ' width="45%"'));
      await js("window.prompt = () => 'First'");
      await click("#doc > .figure .image-caption");
      await saves("Caption… gives the image a caption a reference can name", two(' caption="First"', ' width="45%"'));
      await js("window.prompt = () => 'A dot'");
      await click("#doc > .figure .image-alt");
      await saves("and Alt text… its description", two(' caption="First"', ' width="45%"').replace('alt="A"', 'alt="A dot"'));
    },
    // The contents fold a heading's part away and back, and Alt folds every heading of that level.
    async contentsFold() {
      await load(`${H}# Office\n\n## Todo\n\n## Link\n\n# BAN\n\n## Clock\n\n### Pin\n\n# End\n`);
      const was = await js("document.querySelector('.contents').hidden");
      if (was) await menu("contents");
      const shown = () => js("Array.from(document.querySelectorAll('.contents-list li')).filter((l) => !l.hidden)" +
        ".map((l) => l.querySelector('a').textContent).join()");
      check(await js("document.querySelectorAll('.contents-list .fold').length") === 3,
        "each heading with headings under it has a fold button", String(await js("document.querySelectorAll('.contents-list .fold').length")));
      await click(".contents-list li:nth-child(1) .fold");
      check(await shown() === "Office,BAN,Clock,Pin,End", "pressed, it folds the headings under it away", await shown());
      await click(".contents-list li:nth-child(1) .fold");
      check(await shown() === "Office,Todo,Link,BAN,Clock,Pin,End", "pressed again, it unfolds them", await shown());
      await js("document.querySelector('.contents-list li:nth-child(1) .fold').dispatchEvent(" +
        "new MouseEvent('click', { bubbles: true, altKey: true }))");
      check(await shown() === "Office,BAN,End", "with Alt, every heading of that level folds", await shown());
      await js("document.querySelector('.contents-list li:nth-child(1) .fold').dispatchEvent(" +
        "new MouseEvent('click', { bubbles: true, altKey: true }))");
      if (was) await menu("contents");
    },
    // The pen draws a free line over a chart, kept as its points, and Shift keeps a rectangle square.
    async penDrawing() {
      const chart = `${H}:::table name="t"\n| "a" | "n" |\n| "x" | 1 |\n:::\n\n:::chart table="t" kind="bar" labels="a" values="n"\n`;
      await load(`${chart}:::\n`);
      const box = () => js("(() => { const r = document.querySelector('#doc .chart svg.drawings').getBoundingClientRect(); " +
        "return [r.left, r.top, r.width, r.height]; })()");
      const [x, y, w, h] = await box();
      const at = (fx, fy) => [x + w * fx, y + h * fy];
      await click('#doc .chart .draw-tools [data-shape="pen"]');
      await dragPath([at(0.1, 0.2), at(0.2, 0.3), at(0.3, 0.25), at(0.4, 0.4)]);
      const src = await source();
      check(/draw shape="pen" points="\d+,\d+( \d+,\d+)+"/.test(src), "the pen keeps a free line as its points", src);
      await click('#doc .chart .draw-tools [data-shape="rect"]');
      await dragPath([at(0.5, 0.2), at(0.9, 0.3)], SHIFT);
      const rect = (await source()).match(/draw shape="rect" from="(\d+),(\d+)" to="(\d+),(\d+)"/);
      check(!!rect && Math.abs(Math.abs(rect[3] - rect[1]) - Math.abs(rect[4] - rect[2])) <= 1,
        "with Shift held, a rectangle is a square", rect && rect[0]);
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
