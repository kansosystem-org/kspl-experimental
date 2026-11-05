// Cells copied in ksmd and pasted again, as in Excel: Ctrl+V with the formulas shifted, Ctrl+Shift+V
// and Paste values with the values alone, the Paste Options button that switches a paste, and F4
// turning `$` in an open cell. Text from another program pastes as before, and a copy's text is
// still the shown values. A range over rows a filter hides copies, clears and fills the rows in
// sight alone. Each is checked by the saved source and its undo.
// A copy and a paste are synthetic `copy` and `paste` events, since a headless browser has no
// clipboard; Ctrl+Shift+V is its key and the paste it starts, sent together as a browser sends them.
// `pasting(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);
const CELLS = "application/x-ksmd-cells";
const rows = (second, third) => `${H}:::table name="t"\n| "a" | "b" | "c" | "d" |\n` +
  `| "x" | "1F" | =hex_to_dec(B1) | =$B$1 |\n| "y" | "2E" | ${second}\n| "z" | "3D" | ${third}\n:::\n`;
const START = rows("| |", "| |");

export function pasting({ page, js, settle, press, type, click, menu, load, saves }) {
  const cell = (r, c) => `#doc td[data-r="${r}"][data-c="${c}"]`;
  // A copy of the chosen cells, kept as the page put it on the clipboard.
  const copy = () => js(`(() => {
    const data = new DataTransfer();
    document.activeElement.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    window.__clip = { plain: data.getData("text/plain"), own: data.getData(${JSON.stringify(CELLS)}) };
    return window.__clip;
  })()`);
  // A paste of what the copy left, or of text alone; with `values`, as Ctrl+Shift+V starts it.
  const paste = (values = false, text = null) => js(`(() => {
    const data = new DataTransfer();
    if (${text === null}) {
      data.setData("text/plain", window.__clip.plain);
      data.setData(${JSON.stringify(CELLS)}, window.__clip.own);
    } else data.setData("text/plain", ${JSON.stringify(text)});
    const at = document.activeElement;
    if (${values}) at.dispatchEvent(new KeyboardEvent("keydown", { key: "V", ctrlKey: true, shiftKey: true, bubbles: true }));
    at.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  })()`);
  const offered = () => js("!document.querySelector('.paste-options').hidden");
  const checked = () => js("Array.from(document.querySelectorAll('.paste-menu [aria-checked=true] .label'))" +
    ".map((e) => e.textContent).join()");
  const ranged = () => js("Array.from(document.querySelectorAll('#doc td.in-range')).map((el) => el.dataset.r + el.dataset.c).join()");
  const box = () => js("(() => { const i = document.querySelector('#doc .cell-input'); return i ? i.value : null; })()");
  // Ctrl pressed and let go alone, as the key itself sends it.
  async function ctrl() {
    const key = { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 };
    await page("Input.dispatchKeyEvent", { ...key, type: "rawKeyDown", modifiers: CTRL });
    await page("Input.dispatchKeyEvent", { ...key, type: "keyUp", modifiers: 0 });
  }
  // Chooses C1:D1 and copies them.
  async function copied() {
    await click(cell(0, 2));
    await click(cell(0, 3), 8);
    return copy();
  }

  return {
    async pasteFormulas() {
      await load(START);
      const got = await copied();
      check(got.plain === "31\t1F\r\n", "a copy's text is the shown values, as other programs take them",
        JSON.stringify(got.plain));
      check(got.own.includes('"=hex_to_dec(B1)"') && got.own.includes('"=$B$1"'),
        "and beside it go the formulas as written, for a paste in ksmd", got.own);
      await click(cell(1, 2));
      await paste();
      await saves("Ctrl+V pastes the formulas, a reference shifted down a row and a $ one kept",
        rows("=hex_to_dec(B2) | =$B$1 |", "| |"));
      check(await ranged() === "12,13", "the pasted cells are chosen", await ranged());
      check(await offered() && await js("document.querySelector('.paste-options').getAttribute('aria-label')") ===
        "Paste options", "and the Paste options button shows by them");
      await press("z", CTRL);
      await saves("one undo takes the paste back", START);
      check(!await offered(), "and the button goes with any other change");
      await click(cell(1, 2));
      await click(cell(2, 3), 8);
      await paste();
      await saves("a copy pasted on a range that holds it twice goes in each place, shifted from there",
        rows("=hex_to_dec(B2) | =$B$1 |", "=hex_to_dec(B3) | =$B$1 |"));
      await press("z", CTRL);
      await click(cell(0, 0));
      await paste();
      await saves("a reference shifted left of the table becomes #REF!",
        `${H}:::table name="t"\n| "a" | "b" | "c" | "d" |\n| =hex_to_dec(#REF!) | =$B$1 | =hex_to_dec(B1) | ` +
        '=$B$1 |\n| "y" | "2E" | | |\n| "z" | "3D" | | |\n:::\n');
    },

    async pasteValues() {
      await load(START);
      await copied();
      await click(cell(2, 2));
      await paste(true);
      await saves("Ctrl+Shift+V pastes the values alone: a number and the text 1F", rows("| |", "31 | \"1F\" |"));
      check(await offered(), "and the button shows for it too");
      await press("z", CTRL);
      // The browser's own Paste reads only the clipboard's text, so the page finds its own copy by it.
      await js(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        readText: async () => window.__clip.plain } })`);
      check(await js("Array.from(document.querySelectorAll('.menubar [data-cmd^=\"paste\"]')).map((b) => b.dataset.cmd).join()") ===
        "paste,paste-values", "Edit holds Paste values below Paste");
      await click(cell(1, 2));
      await menu("paste-values");
      await settle();
      await saves("the right-click menu's Paste values pastes the values alone", rows("31 | \"1F\" |", "| |"));
      await press("z", CTRL);
      await click(cell(1, 2));
      await menu("paste");
      await settle();
      await saves("and Paste the formulas", rows("=hex_to_dec(B2) | =$B$1 |", "| |"));
      await press("z", CTRL);
      // Text another program copied pastes as before: its values fill the cells, and no button shows.
      await click(cell(2, 2));
      await paste(false, "5\t=B1\r\n");
      await saves("text from elsewhere fills the cells as typed, as before", rows("| |", "5 | =B1 |"));
      check(!await offered(), "and offers no Paste options");
    },

    async pasteOptions() {
      await load(START);
      await copied();
      await click(cell(1, 2));
      await paste();
      await click(".paste-options");
      check(await checked() === "Keep formulas" && await js("document.activeElement.closest('.paste-menu') !== null"),
        "the button opens its menu, Keep formulas ticked and in focus", await checked());
      await click('.paste-menu [data-values="1"]');
      await saves("Values only puts the values in place of the formulas", rows("31 | \"1F\" |", "| |"));
      check(await offered() && await ranged() === "12,13", "the button stays, and the cells stay chosen");
      await press("z", CTRL);
      await saves("and one undo takes the paste back whole", START);
      await click(cell(1, 2));
      await paste();
      await ctrl();
      check(await checked() === "Keep formulas" && await js("!document.querySelector('.paste-menu').hidden"),
        "Ctrl pressed alone opens the menu, as in Excel");
      await press("v");
      await saves("and V there chooses Values only", rows("31 | \"1F\" |", "| |"));
      await ctrl();
      await press("f");
      await saves("F goes back to the formulas", rows("=hex_to_dec(B2) | =$B$1 |", "| |"));
      await press("Escape");
      await press("ArrowDown");
      check(!await offered(), "the next key takes the button away");
    },

    async turnDollar() {
      await load(START);
      await click(cell(1, 2));
      await type("=B2");
      const turns = [];
      for (let k = 0; k < 4; k += 1) {
        await press("F4");
        turns.push(await box());
      }
      check(turns.join(" ") === "=$B$2 =B$2 =$B2 =B2",
        "F4 in an open cell turns the reference at the caret: $B$2, B$2, $B2, then B2", turns.join(" "));
      await press("F4");
      await press("Enter");
      await saves("and the cell takes the formula as turned", rows("=$B$2 | |", "| |"));
    },

    // A whole column cut by its letter and pasted on another takes a reference to the whole column
    // along, as Excel moves A:A; one to the column written over becomes #REF!.
    async cutColumn() {
      await load(`${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 5 | =sum(t.A) |\n| 2 | 6 | =sum(t.B) |\n:::\n`);
      const letter = (k) => `#doc thead tr:first-child th:nth-child(${k + 1})`;
      const send = (kind) => js(`(() => { const data = new DataTransfer();
        if ("${kind}" === "paste") data.setData("text/plain", window.__cut);
        document.activeElement.dispatchEvent(new ClipboardEvent("${kind}", { clipboardData: data, bubbles: true, cancelable: true }));
        if ("${kind}" === "cut") window.__cut = data.getData("text/plain"); })()`);
      await click(letter(1));
      await send("cut");
      await click(letter(2));
      await send("paste");
      await saves("a whole column cut by its letter and pasted on another takes =sum(t.A) along",
        `${H}:::table name="t"\n| "" | "a" | "c" |\n| | 1 | =sum(t.B) |\n| | 2 | =sum(#REF!) |\n:::\n`);
    },

    // A range over rows a filter hides: Delete, a fill and a copy act on the rows in sight alone, as
    // in Excel, and a cut is refused. A row whose value changes stays in sight until the filter is
    // chosen again.
    async hiddenRows() {
      const filtered = '| "done" | "a" | =A1&B1 |\n| "todo" | "b" | =A2&B2 |\n| "done" | "c" | =A3&B3 |\n' +
        '| "todo" | "d" | =A4&B4 |\n| "done" | "e" | =A5&B5 |\n';
      const other = ':::table name="u"\n| "p" | "q" | "r" |\n| | | |\n| | | |\n| | | |\n:::\n';
      const table = (body = filtered, attrs = ' filter="in:done,,"') =>
        `${H}:::table name="t"${attrs}\n| "s" | "v" | "w" |\n${body}:::\n\n${other}`;
      const start = table();
      const shown = () => js("Array.from(document.querySelectorAll('#doc .table[data-name=t] tbody tr')).map((r) => r.hidden ? 0 : 1).join('')");
      const at = (r, c, name = "t") => `#doc .table[data-name="${name}"] td[data-r="${r}"][data-c="${c}"]`;
      const said = () => js("document.getElementById('status').textContent");
      const clip = (type) => js(`(() => {
        const data = new DataTransfer();
        document.activeElement.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: data, bubbles: true, cancelable: true }));
        return { plain: data.getData("text/plain"), cells: data.getData(${JSON.stringify(CELLS)}) };
      })()`);
      const paste = (got) => js(`(() => {
        const data = new DataTransfer();
        data.setData("text/plain", ${JSON.stringify(got.plain)});
        data.setData(${JSON.stringify(CELLS)}, ${JSON.stringify(got.cells)});
        document.activeElement.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      })()`);
      const chooseColumn = async (c) => {
        await click(at(0, c));
        await click(at(4, c), SHIFT);
      };
      await load(start);
      check(await shown() === "10101", "the filter hides the rows that are not done", await shown());
      await chooseColumn(1);
      await press("Delete");
      await saves("Delete on a filtered range clears the rows in sight alone",
        table('| "done" | | =A1&B1 |\n| "todo" | "b" | =A2&B2 |\n| "done" | | =A3&B3 |\n' +
          '| "todo" | "d" | =A4&B4 |\n| "done" | | =A5&B5 |\n'));
      await menu("undo");
      await saves("and one undo gives them back", start);
      await chooseColumn(1);
      await press("d", CTRL);
      await saves("Ctrl+D fills the rows in sight from the top one, and leaves the hidden ones",
        table('| "done" | "a" | =A1&B1 |\n| "todo" | "b" | =A2&B2 |\n| "done" | "a" | =A3&B3 |\n' +
          '| "todo" | "d" | =A4&B4 |\n| "done" | "a" | =A5&B5 |\n'));
      await menu("undo");
      await chooseColumn(2);
      const got = await clip("copy");
      check(got.plain === "donea\r\ndonec\r\ndonee\r\n", "a copy puts the rows in sight alone on the clipboard", got.plain);
      check(JSON.stringify(JSON.parse(got.cells).rows) === "[0,2,4]", "and says where each line was copied from", got.cells);
      await click(at(0, 2, "u"));
      await paste(got);
      await saves("a paste puts the lines together, each formula moved from its own row",
        start.replace(other, ':::table name="u"\n| "p" | "q" | "r" |\n| | | =A1&B1 |\n| | | =A2&B2 |\n| | | =A3&B3 |\n:::\n'));
      await menu("undo");
      await chooseColumn(1);
      const cutGot = await clip("cut");
      check((await said()).startsWith("A cut cannot pass over hidden rows"), "a cut over hidden rows is refused, and the page says why", await said());
      check(cutGot.plain === "" && await js("document.querySelectorAll('#doc .cut').length") === 0,
        "and nothing is put on the clipboard or marked", cutGot.plain);
      await saves("and nothing changes", start);
      // A value typed or cleared leaves its row in sight, until the filter is chosen again.
      await click(at(2, 0));
      await type("zzz");
      await press("Enter");
      await saves("a value the filter does not take goes in",
        table(filtered.replace('| "done" | "c" |', '| "zzz" | "c" |')));
      check(await shown() === "10101", "and its row stays in sight", await shown());
      await click(at(4, 0));
      await press("Delete");
      check(await shown() === "10101", "a value cleared leaves its row in sight too", await shown());
      await click('#doc .table[data-name="t"] th.name[data-c="0"] .filter-arrow');
      await click(".filter-panel .filter-ok");
      check(await shown() === "10000", "OK in the filter's panel applies the filter to those rows again", await shown());
    },
  };
}
