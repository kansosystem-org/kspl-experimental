// A table's column widths and row heights, as a spreadsheet keeps them: a drag of a column
// letter's right edge or a row number's bottom edge, a double-click there, Alt+Left and Alt+Right,
// and Column width… and Row height… typed in. Text runs on over empty cells, a number too wide
// shows ###, and a wide table scrolls sideways with its first column in sight. Each is driven
// through the browser's own input events, as `main.mjs` drives the rest, and checked by the saved
// source and its undo.
// `sizes(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function sizes({ page, js, settle, until, press, click, drag, menu, load, saves, source, openCell,
  doubleClickAt, rightClick }) {
  return {
  // Column widths and row heights, as a spreadsheet keeps them: a drag of a column letter's right
  // edge or of a row number's bottom edge, a double-click there, and Alt+Left and Alt+Right in a
  // cell. Each is one undo step, and the cells stay as they were. A text runs on over the empty
  // cells to its right, and a number too wide for its column shows ###.
  // Caution: **Wait for what each event shows** before the next step: a press can be handled after
  // the call that sent it returns, and reading the source takes the open cell, as a save does.
  async widths() {
    const rows = `| "a" | "b" | "c" |\n| 1 | 2 | =A1+B1 |\n:::\n`;
    const sized = `${H}:::table name="t" char_widths="10,10,20"\n${rows}`;
    const widths = async () => {
      const m = (await source()).match(/ char_widths="([0-9.,]*)"/);
      return m ? m[1].split(",").map(Number) : [];
    };
    const shownWidths = "Array.from(document.querySelectorAll('#doc col')).map((c) => c.style.width).join()";
    // Runs a step, and waits until the widths the page shows differ from those before it.
    const resized = async (step) => {
      const was = await js(shownWidths);
      await step();
      return until(`${shownWidths} !== ${JSON.stringify(was)}`, 3000);
    };
    // Alt+Left outside a cell goes back in the browser's history, so a cell that does not open
    // stops the section.
    const openAt = async (column) => {
      await openCell(`#doc td[data-r="0"][data-c="${column}"]`);
      const name = `Cell ${"ABC"[column]}1`;
      if (!await until(`document.activeElement.getAttribute("aria-label") === "${name}"`, 3000)) {
        throw new Error(`${name} did not open; the focus is on ${await js("document.activeElement.outerHTML.slice(0, 80)")}`);
      }
    };
    const px = (c) => js(`document.querySelectorAll("#doc th.letter")[${c}].getBoundingClientRect().width`);
    const cellsKept = async (what) => {
      const got = await source();
      check(got.endsWith(`\n${rows}`) &&
        await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "3",
      what, got);
    };

    await load(sized);
    const before = [await px(0), await px(1)];
    await resized(() => drag('#doc .col-edge[data-edge="0"]', 60));
    const dragged = await widths();
    check(dragged.length === 3 && dragged[0] > 10 && dragged[1] === 10 && dragged[2] === 20,
      "dragging column A's right edge widens A alone, in characters", JSON.stringify(dragged));
    const after = [await px(0), await px(1)];
    check(Math.abs(after[0] - before[0] - 60) <= 8 && Math.abs(after[1] - before[1]) < 1,
      "column A grows by the distance dragged, and B keeps its width", `${before} -> ${after}`);
    await cellsKept("the cells and the formula's value stay as they were");
    await menu("undo");
    await saves("one undo gives the widths before the drag back", sized);
    await menu("redo");
    await settle();
    check((await widths()).join() === dragged.join(), "and redo the dragged ones again");
    await drag('#doc .col-edge[data-edge="0"]', 0);
    await settle();
    check((await widths()).join() === dragged.join(),
      "a press on the edge that does not move changes nothing");
    const window = await js("window.innerWidth");
    await load(`${H}:::table name="t" char_widths="200,10,20"\n${rows}`);
    const wide = await js("document.querySelector('#doc .table table').getBoundingClientRect().width");
    check(wide > window, "a table as wide as its columns reaches past a narrower window",
      `${wide} in ${window}`);

    await load(sized);
    check(await js("document.getElementById('doc').firstElementChild.classList.contains('gap')"),
      "an opened document that starts with a table puts the caret on an empty line above it");
    await openAt(1);
    check(true, "a press on a cell opens it, although the empty line above the table goes");
    await resized(() => press("ArrowRight", ALT));
    check(await until("document.activeElement.getAttribute('aria-label') === 'Cell B1'", 3000),
      "the cell stays open after Alt+Right");
    await resized(() => press("ArrowRight", ALT));
    check((await widths()).join() === "10,12,20", "Alt+Right in a cell makes its column one character wider",
      (await widths()).join());
    await menu("undo");
    await settle();
    check((await widths()).join() === "10,11,20", "each press is one undo step", (await widths()).join());
    await openAt(1);
    for (let i = 0; i < 3; i++) await resized(() => press("ArrowLeft", ALT));
    check((await widths()).join() === "10,8,20", "Alt+Left makes it narrower", (await widths()).join());
    for (let i = 0; i < 4; i++) await menu("undo");
    await saves("undo goes back one press at a time", sized);
    // On a chosen cell too: left to the browser, Alt+Left goes back a page, out of the editor.
    await click('#doc td[data-r="0"][data-c="1"]');
    const href = await js("location.href");
    await resized(() => press("ArrowRight", ALT));
    check((await widths()).join() === "10,11,20" && await js("location.href") === href &&
      await js("!!document.querySelector('#doc td.chosen[data-c=\"1\"]')"),
    "Alt+Right on a chosen cell makes its column wider, and the page stays");
    await cellsKept("the cells stay as they were");

    // A table without widths: each column fits its text, and a drag gives one column a width.
    await load(`${H}:::table name="t"\n${rows}`);
    await resized(() => drag('#doc .col-edge[data-edge="1"]', 40));
    const made = await widths();
    check(made.length === 3 && made[0] === 0 && made[1] > 3 && made[2] === 0,
      "a table without widths gives the dragged column one, and the others still fit their text",
      JSON.stringify(made));
    await cellsKept("and its cells stay as they were");

    // A double-click on a column's edge fits it to its widest value; on a row's edge, the row to
    // its lines. A drag of a row's edge gives it a height in points.
    const long = `${H}:::table name="t" char_widths="2,2"\n| "a" | "b" |\n| "a long value here" | 12345678 |\n` +
      `| | "x" |\n:::\n`;
    await load(long);
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').classList.contains('narrow')"),
      "a number too wide for its column shows ###, as in Excel");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"0\"]').classList.contains('clip')"),
      "a text is cut where the next cell holds a value");
    const middleOf = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})
      .getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    await doubleClickAt(...await middleOf('#doc .col-edge[data-edge="0"]'));
    await settle();
    const fitted = await widths();
    check(fitted[0] >= 8 && fitted[1] === 2, "a double-click on A's edge fits A to its widest value",
      JSON.stringify(fitted));
    // With every cell chosen by Ctrl+A, a double-click on one column's edge fits every column.
    await menu("undo");
    await settle();
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("a", CTRL);
    await doubleClickAt(...await middleOf('#doc .col-edge[data-edge="0"]'));
    await settle();
    const all = await widths();
    check(all[0] >= 8 && all[1] >= 4, "with every cell chosen, a double-click on A's edge fits every column, as in Excel",
      JSON.stringify(all));
    await click('#doc td[data-r="0"][data-c="0"]');
    const tall = () => js("Math.round(document.querySelectorAll('#doc tbody tr')[0].getBoundingClientRect().height)");
    const was = await tall();
    await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: 0, y: 0 });
    const [ex, ey] = await middleOf('#doc .row-edge[data-edge="0"]');
    await page("Input.dispatchMouseEvent", { type: "mousePressed", x: ex, y: ey, button: "left", clickCount: 1 });
    await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: ex, y: ey + 30, button: "left", buttons: 1 });
    await page("Input.dispatchMouseEvent", { type: "mouseReleased", x: ex, y: ey + 30, button: "left", clickCount: 1 });
    await settle();
    const height = (await source()).match(/ heights="(\d+),"/);
    check(!!height && Math.abs(Number(height[1]) / 0.75 - was - 30) <= 4,
      "dragging row 1's bottom edge down gives it a height in points", `${was} ${height && height[1]}`);
    check(Math.abs(await tall() - Number(height ? height[1] : 0) / 0.75) <= 1, "and the row stands that tall",
      String(await tall()));
    await doubleClickAt(...await middleOf('#doc .row-edge[data-edge="0"]'));
    await settle();
    check(!(await source()).includes("heights="), "a double-click on the edge fits the row to its lines again");
  },

  // Column width and row height typed as numbers, as Excel's dialogs take them: a column's width
  // in characters, and a row's height in points, which cuts what is taller.
  async sizes() {
    const tall0 = () => js("Math.round(document.querySelector('#doc tbody tr').getBoundingClientRect().height)");
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
    await answer("12");
    await menu("column-width");
    await saves("Column width 12 gives the column a width of 12 characters, and the others fit their text",
      t3(' char_widths="12,,"'));
    const chars = await js(`(() => { const w = document.querySelector("#doc .table");
      const th = w.querySelector("thead tr").cells[1];
      return Math.round(10 * (th.getBoundingClientRect().width - w.metrics.pad) / w.metrics.ch) / 10; })()`);
    check(Math.abs(chars - 12) <= 0.2, "and the page shows twelve characters of the digit 0", String(chars));
    for (const wrong of ["256", "0", "abc", "12.25"]) {
      await answer(wrong);
      await menu("column-width");
      check((await status()).includes("0.5 to 255"), `a width of ${wrong} is refused, and the page says why`, await status());
    }
    await saves("so nothing changes", t3(' char_widths="12,,"'));
    await click('#doc td[data-r="1"][data-c="1"]');
    await answer("30");
    await menu("row-height");
    await saves("Row height 30 gives the chosen row a height of 30 points", t3(' char_widths="12,," heights=",30"'));
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
    await saves("an empty answer takes the height away", t3(' char_widths="12,,"'));
    await answer(null);
    await menu("row-height");
    await saves("and Cancel changes nothing", t3(' char_widths="12,,"'));
    await menu("undo");
    await menu("undo");
    await menu("undo");
    await saves("each change was one step of undo", t3(""));
    // Every column chosen takes the width, and an empty answer lets them fit their text again.
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("a", CTRL);
    await answer("8.5");
    await menu("column-width");
    await saves("with every column chosen, each takes the width", t3(' char_widths="8.5,8.5,8.5"'));
    await answer("");
    await menu("column-width");
    await saves("and an empty answer lets each fit its text again", t3(""));
    // Row height: the names row takes the height its text needs, and rows a filter hides keep theirs.
    // Row height on the names row asks nothing and changes nothing.
    const heightOff = async (start) => {
      await js("window.__asked = false; window.prompt = () => { window.__asked = true; return '30'; }");
      await menu("row-height");
      const off = !await js("window.__asked") && await js("ksmd.source()") === start;
      // The item cannot be pressed, so its menu stays open; Esc closes it before the next press,
      // which would land on the menu instead.
      await press("Escape");
      await until("document.querySelector('.menu.context').hidden", 3000);
      return off;
    };
    await click('#doc th.name[data-c="0"]');
    check(await heightOff(t3("")), "Row height cannot be pressed on the names row");
    const t1 = (attrs) => `${H}:::table name="t"${attrs}\n| "a" |\n| 1 |\n| 2 |\n| 3 |\n:::\n`;
    await load(t1(' filter="not:2"'));
    await click('#doc td[data-r="0"][data-c="0"]');
    // Shift+click reaches from the chosen cell, so the first must be chosen before it.
    check(await until("!!document.querySelector('#doc td.chosen[data-r=\"0\"]')", 3000),
      "a press chooses the first row's cell");
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
    // A row lower than its text cuts it, as Excel's does.
    await load(`${H}:::table name="t" heights="12"\n| "a" |\n| "one\\ntwo\\nthree" |\n:::\n`);
    check(await tall0() <= 17, "a row of 12 points cuts a cell of three lines", String(await tall0()));
  },

  // Wrap text, as Excel's: Format, Wrap text breaks a chosen cell's text into lines at its column's
  // width, its row grows to show them, and pressed again it stops.
  async wrapText() {
    const long = `"a text much longer than its column is wide"`;
    const t = (look) => `${H}:::table name="t" char_widths="10,10"\n| "a" | "b" |\n| ${long}${look} | |\n:::\n`;
    const tall = () => js("Math.round(document.querySelector('#doc tbody tr').getBoundingClientRect().height)");
    const td = "document.querySelector('#doc td[data-r=\"0\"][data-c=\"0\"]')";
    await load(t(""));
    const one = await tall();
    check(await js(`${td}.scrollWidth > ${td}.clientWidth`), "a long text runs on past its column");
    await click('#doc td[data-r="0"][data-c="0"]');
    await menu("wrap-text");
    await saves("Wrap text marks the chosen cell", t(' {wrap="on"}'));
    check(await tall() >= one * 3 && await js(`${td}.scrollWidth <= ${td}.clientWidth + 1`),
      "its text breaks into lines at the column's width, and the row grows to show them", `${one} -> ${await tall()}`);
    check(await js("!!document.querySelector('.menu.context [data-cmd=\"wrap-text\"]')"),
      "the right-click menu holds Wrap text too");
    await click('#doc td[data-r="0"][data-c="0"]');
    await menu("wrap-text");
    await saves("pressed again on a cell that wraps, it stops", t(""));
    check(await tall() === one, "and the row is one line tall again", String(await tall()));
    await load(`${H}:::table name="t" char_widths="10" heights="15"\n| "a" |\n| ${long} {wrap="on"} |\n:::\n`);
    check(await tall() <= 21, "a row with a height keeps it, and cuts the wrapped lines", String(await tall()));
  },

  // In a window shorter than the right-click menu, it scrolls, so its last item can still be
  // reached, and a flyout opened from it stands whole in the window.
  async shortMenu() {
    // A paragraph stands first, so the first press moves no table up a line.
    await load(`${H}Text.\n\n:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n:::\n`);
    await page("Emulation.setDeviceMetricsOverride", { width: 800, height: 400, deviceScaleFactor: 1, mobile: false });
    // Each step waits for what it shows, as a busy machine lays the narrower window out late.
    await until("window.innerHeight === 400", 3000);
    await settle();
    await click('#doc td[data-r="1"][data-c="0"]');
    await until("!!document.querySelector('#doc td.chosen[data-r=\"1\"][data-c=\"0\"]')", 3000);
    await rightClick('#doc td[data-r="1"][data-c="0"]');
    if (!await until("!document.querySelector('.menu.context').hidden", 3000)) {
      await page("Emulation.clearDeviceMetricsOverride", {});
      check(false, "the right-click menu opens in a window 400 pixels tall");
      return;
    }
    const short = await js(`(() => { const m = document.querySelector('.menu.context');
      const r = m.getBoundingClientRect(); m.scrollTop = m.scrollHeight;
      const subs = m.querySelectorAll(':scope > .sub'); const last = subs[subs.length - 1];
      return [r.bottom <= innerHeight, m.scrollHeight > m.clientHeight,
        last.getBoundingClientRect().bottom <= innerHeight]; })()`);
    // The scroll's own event closes any flyout; wait the frames it takes, or a slow machine
    // closes the flyout opened next.
    await js("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))");
    // Pointing at the name opens the flyout and never closes it, as a press would were a pointer
    // already over it (on Windows the window's own pointer can be).
    await js("(() => { const subs = document.querySelectorAll('.menu.context > .sub'); " +
      "subs[subs.length - 1].firstElementChild.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); })()");
    await settle();
    short.push(await js(`(() => { const subs = document.querySelectorAll('.menu.context > .sub');
      const f = subs[subs.length - 1].querySelector('.menu.flyout').getBoundingClientRect();
      return f.height > 0 && f.top >= 0 && f.bottom <= innerHeight && f.right <= innerWidth; })()`));
    await press("Escape");
    await page("Emulation.clearDeviceMetricsOverride", {});
    check(short.every((ok) => ok),
      "in a window 400 pixels tall the right-click menu scrolls, its last item is reached, and its flyout fits",
      JSON.stringify(short));
  },

  // A wide table keeps its row numbers and first column in sight while the page scrolls
  // sideways, and View, One line per cell shows each cell's lines on one.
  async wideTable() {
    const names = Array.from({ length: 30 }, (_, c) => `"n${c}"`).join(" | ");
    const row = Array.from({ length: 30 }, (_, c) => `"${c} a text of\\ntwo lines"`).join(" | ");
    await load(`${H}:::table name="t"\n| ${names} |\n| ${row} |\n| ${row} |\n:::\n`);
    const left = (sel) => js(`document.querySelector('${sel}').getBoundingClientRect().left`);
    const before = await left('#doc td[data-r="0"][data-c="0"]');
    await js("window.scrollBy(2000, 0)");
    const after = await left('#doc td[data-r="0"][data-c="0"]');
    const number = await js("document.querySelector('#doc th.row-number').getBoundingClientRect().right");
    check(await js("window.scrollX") > 0 && after === number && before !== after,
      "scrolled sideways, the first column stays right of the row numbers", `${before} ${after} ${number}`);
    await js("window.scrollTo(0, 0)");
    const tall = () => js("document.querySelector('#doc tbody tr').getBoundingClientRect().height");
    const wrapped = await tall();
    await menu("one-line");
    check(await tall() < wrapped && await js("document.body.classList.contains('one-line')"),
      "One line per cell keeps each row of two lines one line tall", `${wrapped} -> ${await tall()}`);
    check(await js("localStorage.getItem('ksmd.oneLine')") === "1", "and this browser keeps the choice");
    await menu("one-line");
    check(await tall() === wrapped, "pressed again, the rows show their lines as before");
  },
  };
}
