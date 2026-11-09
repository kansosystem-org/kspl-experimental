// The status bar: the lines and characters of the document or the selection, the chosen cell's
// address and what was typed in it, the figures for chosen cells picked by a right-click and kept by
// the browser, the document's zoom, the printed page where the caret stands, and a filter's count.
// The page count is checked against the pages the browser's own print to PDF makes of the same
// document.
// `statusBar(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, H, SHIFT, check } from "./drive.mjs";

const FENCE = "```";

export function statusBar({ page, js, settle, until, press, type, select, click, menu, load, saves,
  rightClick, openCell, drag, resize }) {
  const text = (part) => js(`(() => { const el = document.querySelector(".status-bar ${part}"); ` +
    "return el && !el.hidden && getComputedStyle(el).display !== 'none' ? el.textContent : null; })()");
  const cell = (r, c) => `#doc [data-r="${r}"][data-c="${c}"]`;
  // Waits until a part of the bar shows `want`, and checks it.
  const shows = async (part, want, what) => {
    await until(`(() => { const el = document.querySelector(".status-bar ${part}"); ` +
      `return !!el && !el.hidden && el.textContent === ${JSON.stringify(want)}; })()`, 3000);
    const got = await text(part);
    check(got === want, what, String(got));
  };
  // Opens the page again, as a person's reload does, keeping what the browser stored.
  const reload = async () => {
    await js("window.left = true; location.reload()");
    await until("!window.left && document.documentElement.dataset.ready === '1'");
  };
  // The number of pages the browser's print to PDF makes of the open document.
  const printed = async () => {
    const pdf = await page("Page.printToPDF", { preferCSSPageSize: true });
    return (Buffer.from(pdf.data, "base64").toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  };

  return {
    // A line is a line as written; table cells are left out. A character is one a person sees.
    async statusLines() {
      await load(`${H}# Scope\n\nFirst\\\nsecond\n\n日本語の段落です。\n\n- one\n- two\n\n${FENCE}\na\nb\n${FENCE}\n\n` +
        ':::table name="t"\n| "a" |\n| "cell words" |\n:::\n');
      await shows(".figures", "8 lines · 33 characters",
        "the document's lines and characters: a typed line break and a code line count, a table cell does not");
      await select(2, 0, 9);
      await press("Enter", SHIFT);
      await type("x");
      await saves("a line break is typed into the Japanese paragraph", `${H}# Scope\n\nFirst\\\nsecond\n\n` +
        `日本語の段落です。\\\nx\n\n- one\n- two\n\n${FENCE}\na\nb\n${FENCE}\n\n:::table name="t"\n| "a" |\n| "cell words" |\n:::\n`);
      await shows(".figures", "9 lines · 34 characters", "and the line break adds a line");
      await select(1, 0, 2, 8);
      await shows(".figures", "2 lines · 6 characters selected",
        "a selection across a line break counts the lines and characters it holds");
      await load(`${H}葛\u{E0100}飾 区\n`);
      await shows(".figures", "1 line · 3 characters",
        "a character with a variation selector counts once, and a space is not counted");
    },

    // The chosen cell's address and its text as typed, as Excel's name box and formula bar show them.
    async statusCell() {
      const long = '=if(A1 = "1F", "a long text that runs well past the room the status bar holds", "another one")';
      await load(`${H}Text.\n\n:::table name="t"\n| "a" | "b" | "c" |\n| "1F" | =hex_to_dec(A1) | 3 |\n` +
        `| "2E" | =hex_to_dec(A2) | ${long} |\n:::\n`);
      await click(cell(0, 1));
      await shows(".status-address", "B1", "a chosen cell shows its address");
      await shows(".status-content", "=hex_to_dec(A1)", "and its formula as typed");
      await click(cell(-1, 1));
      await shows(".status-address", "B name", "a column's name cell shows its column");
      await shows(".status-content", "b", "and the name");
      await click(cell(0, 1));
      await press("ArrowDown", SHIFT);
      await press("ArrowRight", SHIFT);
      await shows(".status-address", "B1:C2", "a range shows its address");
      await press("Escape");
      await click(cell(1, 2));
      await shows(".status-address", "C2", "a range left with Esc gives the chosen cell's address back");
      const cut = await js("(() => { const el = document.querySelector('.status-cell'); " +
        "return [el.scrollWidth > el.clientWidth, el.title, el.getAttribute('aria-label')]; })()");
      check(cut[0] && cut[1] === `Cell C2: ${long}` && cut[2] === cut[1],
        "a long formula is cut on the bar, and its tooltip and accessible name hold it whole", JSON.stringify(cut));
      await click("#doc p");
      await until("document.querySelector('.status-cell').hidden", 3000);
      check(await text(".status-cell") === null, "in the text, the bar shows no cell");
    },

    // The bar names no cell mode and no section: the open cell's keys show the mode, and the
    // contents the section. What is typed shows as it is typed.
    async statusNoMode() {
      await load(`${H}# Scope\n\nText.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`);
      check(await js("!document.querySelector('.status-mode, .status-section')"),
        "the bar holds no cell mode and no section");
      await click(cell(0, 0));
      await type("5");
      await shows(".status-content", "5", "the bar shows what is typed as it is typed");
      const said = await js("document.querySelector('.status-bar').textContent");
      check(!/\b(Ready|Enter|Edit)\b/.test(said) && !said.includes("Scope"),
        "and names neither the cell's mode nor the section", said);
      await press("Escape");
    },

    // The figures for chosen cells are picked by a right-click on the bar, and kept by the browser.
    async statusFigures() {
      const start = `${H}Text.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | "x" |\n| 4 | 2.5 |\n:::\n`;
      const chooseAll = async () => {
        await load(start);
        await click(cell(0, 0));
        await press("ArrowDown", SHIFT);
        await press("ArrowRight", SHIFT);
      };
      await chooseAll();
      await shows(".figures", "Average 2.5 · Count 4 · Sum 7.5", "Excel's figures show at first: Average, Count and Sum");
      await rightClick(".status-bar .status");
      const items = await js("Array.from(document.querySelectorAll('.status-menu [role=menuitemcheckbox]'))" +
        ".map((b) => b.textContent + '=' + b.getAttribute('aria-checked')).join()");
      check(items === "Average2.5=true,Count4=true,Numerical count3=false,Min1=false,Max4=false,Sum7.5=true",
        "a right-click on the bar lists every figure with its value, the shown ones ticked", items);
      await click('.status-menu [role=menuitemcheckbox]:nth-child(4)');
      await click('.status-menu [role=menuitemcheckbox]:nth-child(1)');
      await shows(".figures", "Count 4 · Min 1 · Sum 7.5", "ticking Min and unticking Average change the figures at once");
      await press("Escape");
      check(await js("!document.querySelector('.status-menu') && document.activeElement.matches('.figures')"),
        "Esc closes the menu, and the focus goes back to the figures");
      await press("Enter");
      check(await js("document.activeElement.matches('.status-menu [role=menuitemcheckbox]')"),
        "Enter on the figures opens the menu from the keyboard");
      await press("ArrowDown");
      await press("Enter");
      await shows(".figures", "Count 4 · Numerical count 3 · Min 1 · Sum 7.5", "and Down and Enter tick the next figure");
      await press("Escape");
      await reload();
      await chooseAll();
      await shows(".figures", "Count 4 · Numerical count 3 · Min 1 · Sum 7.5", "the browser keeps the choice");
      await js("localStorage.removeItem('ksmd.figures')");
      await reload();
    },

    // The zoom scales the document alone, is kept by the browser, and leaves the print alone.
    async statusZoom() {
      await load(`${H}Some text.\n\n:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n:::\n`);
      const sizes = () => js("[document.querySelector('#doc p').getBoundingClientRect().height, " +
        "document.querySelector('.quick').getBoundingClientRect().height, " +
        "document.querySelector('.status-bar').getBoundingClientRect().height]");
      const before = await sizes();
      await press("=", CTRL | ALT);
      await shows(".zoom-level", "110%", "Ctrl+Alt+= zooms in one step");
      await click(".zoom-in");
      await click(".zoom-in");
      await shows(".zoom-level", "150%", "and + goes on, step by step");
      const after = await sizes();
      check(Math.abs(after[0] / before[0] - 1.5) < 0.05 && after[1] === before[1] && after[2] === before[2],
        "the document grows by its zoom, and the quick access bar and the status bar keep their size",
        `${before} -> ${after}`);
      await click(".zoom-level");
      await click('.status-menu [role=menuitemradio]:first-child');
      await shows(".zoom-level", "200%", "the level's menu sets a step");
      await click(".zoom-level");
      await click(".zoom-level");
      check(await js("!document.querySelector('.status-menu')"), "a second press on the level closes its menu");
      await click(".figures");
      await click(".figures");
      check(await js("!document.querySelector('.status-menu')"), "and so does one on the figures");
      const edge = () => js("document.querySelector('#doc th.letter').getBoundingClientRect().width");
      const wide = await edge();
      await drag('#doc .col-edge[data-edge="0"]', 60);
      await until(`document.querySelector('#doc th.letter').getBoundingClientRect().width > ${wide + 30}`, 3000);
      const dragged = await edge();
      check(Math.abs(dragged - wide - 60) <= 10, "at 200%, a column's edge follows the pointer as it is dragged",
        `${wide} -> ${dragged}`);
      await press("-", CTRL | ALT);
      await shows(".zoom-level", "175%", "Ctrl+Alt+- zooms out one step");
      await reload();
      await shows(".zoom-level", "175%", "the browser keeps the level");
      await load(`${H}Some text.\n`);
      await page("Emulation.setEmulatedMedia", { media: "print" });
      const printedZoom = await js("getComputedStyle(document.getElementById('doc')).zoom");
      await page("Emulation.setEmulatedMedia", { media: "" });
      check(printedZoom === "1", "the print keeps the document's own size", printedZoom);
      await menu("zoom-reset");
      await shows(".zoom-level", "100%", "View, Zoom 100% gives the document's own size back");
      check(await js("getComputedStyle(document.getElementById('doc')).zoom") === "1", "and the document is unscaled");
    },

    // The printed page where the caret or the chosen cell stands.
    async statusPage() {
      const para = "Every clause of this part is written out in full, so that the page fills, line by line. ";
      let src = `${H}:::document paper="A5" numbers=1\n:::\n\n`;
      for (let part = 1; part <= 3; part++) {
        src += `# Part ${part}\n\n`;
        for (let topic = 1; topic <= 2; topic++) {
          src += `## Topic ${topic}\n\n`;
          for (let k = 0; k < 4; k++) src += `${para.repeat(4)}\n\n`;
        }
      }
      src += ':::table name="t"\n| "n" |\n';
      for (let r = 1; r <= 80; r++) src += `| ${r} |\n`;
      src += ":::\n";
      await load(src);
      await select(3, 0, 5);
      await until("!document.querySelector('.status-page').hidden", 5000);
      const all = await printed();
      await shows(".status-page", `Page 1 of ${all}`, "the bar shows the caret's printed page, of as many as the print to PDF makes");
      await select(32, 0, 5);
      await until(`document.querySelector('.status-page').textContent !== "Page 1 of ${all}"`, 3000);
      const later = await text(".status-page");
      check(/^Page \d+ of \d+$/.test(later) && Number(later.split(" ")[1]) > 1, "the page moves with the caret", later);
      await click(cell(79, 0));
      await shows(".status-page", `Page ${all} of ${all}`, "a chosen cell shows the page its row prints on, the last here");
      // The bar changes on the next frame, so the wait is for the last page to go: the value
      // still shown from the cell before would fail the check.
      await click(cell(0, 0));
      await until(`document.querySelector('.status-page').textContent !== "Page ${all} of ${all}"`, 3000);
      const top = await text(".status-page");
      check(/^Page \d+ of \d+$/.test(top) && Number(top.split(" ")[1]) < all, "a row above prints on an earlier page", top);
    },

    // A filter's count: how many rows of the chosen table show.
    async statusFilter() {
      const table = (filter) => `${H}Text.\n\n:::table name="t"${filter}\n| "a" | "b" |\n` +
        '| 1 | "x" |\n| 2 | "y" |\n| 3 | "x" |\n| 4 | "z" |\n:::\n';
      await load(table(""));
      await click(cell(0, 0));
      await settle();
      check(await text(".status-filter") === null, "a table no filter narrows shows no count");
      await load(table(' filter=",in:x"'));
      await click(cell(0, 0));
      await shows(".status-filter", "2 of 4 rows shown", "a filter that hides rows shows how many show");
      await click("#doc p");
      await until("document.querySelector('.status-filter').hidden", 3000);
      check(await text(".status-filter") === null, "in the text, the count goes");
    },

    // One line on a phone, with the figures and a message kept; the dark scheme's colours.
    async statusNarrow() {
      await load(`${H}Some text.\n`);
      await resize(375, 700);
      const narrow = await js("[document.querySelector('.status-bar').getBoundingClientRect().height, " +
        "getComputedStyle(document.querySelector('.status-zoom')).display, " +
        "getComputedStyle(document.querySelector('.figures')).display, document.documentElement.scrollWidth]");
      await resize();
      check(narrow[0] === 28 && narrow[1] === "none" && narrow[2] !== "none" && narrow[3] <= 375,
        "at a phone's width the bar keeps one line and the figures, drops the zoom, and the page does not scroll sideways",
        JSON.stringify(narrow));
      await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
      const dark = await js("getComputedStyle(document.querySelector('.status-bar')).backgroundColor");
      await page("Emulation.setEmulatedMedia", { features: [] });
      check(dark === "rgb(42, 43, 47)", "a dark system makes the bar dark", dark);
    },
  };
}
