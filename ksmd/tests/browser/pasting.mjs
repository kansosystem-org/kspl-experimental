// Cells copied in ksmd and pasted again, as in Excel: Ctrl+V with the formulas shifted, Ctrl+Shift+V
// and Paste values with the values alone, the Paste Options button that switches a paste, and F4
// turning `$` in an open cell. Text from another program pastes as before, and a copy's text is
// still the shown values. A range over rows a filter hides copies, clears and fills the rows in
// sight alone. Each is checked by the saved source and its undo.
// A copy and a paste are synthetic `copy` and `paste` events, since a headless browser has no
// clipboard; Ctrl+Shift+V is its key and the paste it starts, sent together as a browser sends them.
// `pasting(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, H, SHIFT, cellAt, check, rowsShown } from "./drive.mjs";

const CELLS = "application/x-ksmd-cells";
const rows = (second, third) => `${H}:::table name="t"\n| "a" | "b" | "c" | "d" |\n` +
  `| "x" | "1F" | =hex_to_dec(B1) | =$B$1 |\n| "y" | "2E" | ${second}\n| "z" | "3D" | ${third}\n:::\n`;
const START = rows("| |", "| |");

export function pasting({ page, js, settle, press, type, click, menu, load, saves }) {
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
    await click(cellAt(0, 2));
    await click(cellAt(0, 3), 8);
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
      await click(cellAt(1, 2));
      await paste();
      await saves("Ctrl+V pastes the formulas, a reference shifted down a row and a $ one kept",
        rows("=hex_to_dec(B2) | =$B$1 |", "| |"));
      check(await ranged() === "12,13", "the pasted cells are chosen", await ranged());
      check(await offered() && await js("document.querySelector('.paste-options').getAttribute('aria-label')") ===
        "Paste options", "and the Paste options button shows by them");
      await press("z", CTRL);
      await saves("one undo takes the paste back", START);
      check(!await offered(), "and the button goes with any other change");
      await click(cellAt(1, 2));
      await click(cellAt(2, 3), 8);
      await paste();
      await saves("a copy pasted on a range that holds it twice goes in each place, shifted from there",
        rows("=hex_to_dec(B2) | =$B$1 |", "=hex_to_dec(B3) | =$B$1 |"));
      await press("z", CTRL);
      await click(cellAt(0, 0));
      await paste();
      await saves("a reference shifted left of the table becomes #REF!",
        `${H}:::table name="t"\n| "a" | "b" | "c" | "d" |\n| =hex_to_dec(#REF!) | =$B$1 | =hex_to_dec(B1) | ` +
        '=$B$1 |\n| "y" | "2E" | | |\n| "z" | "3D" | | |\n:::\n');
    },

    async pasteValues() {
      await load(START);
      await copied();
      await click(cellAt(2, 2));
      await paste(true);
      await saves("Ctrl+Shift+V pastes the values alone: a number and the text 1F", rows("| |", "31 | \"1F\" |"));
      check(await offered(), "and the button shows for it too");
      await press("z", CTRL);
      // The browser's own Paste reads only the clipboard's text, so the page finds its own copy by it.
      await js(`Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
        readText: async () => window.__clip.plain } })`);
      check(await js("Array.from(document.querySelectorAll('.menubar [data-cmd^=\"paste\"]')).map((b) => b.dataset.cmd).join()") ===
        "paste,paste-values", "Edit holds Paste values below Paste");
      await click(cellAt(1, 2));
      await menu("paste-values");
      await settle();
      await saves("the right-click menu's Paste values pastes the values alone", rows("31 | \"1F\" |", "| |"));
      await press("z", CTRL);
      await click(cellAt(1, 2));
      await menu("paste");
      await settle();
      await saves("and Paste the formulas", rows("=hex_to_dec(B2) | =$B$1 |", "| |"));
      await press("z", CTRL);
      // Text another program copied pastes as before: its values fill the cells, and no button shows.
      await click(cellAt(2, 2));
      await paste(false, "5\t=B1\r\n");
      await saves("text from elsewhere fills the cells as typed, as before", rows("| |", "5 | =B1 |"));
      check(!await offered(), "and offers no Paste options");
    },

    async pasteOptions() {
      await load(START);
      await copied();
      await click(cellAt(1, 2));
      await paste();
      await click(".paste-options");
      check(await checked() === "Keep formulas" && await js("document.activeElement.closest('.paste-menu') !== null"),
        "the button opens its menu, Keep formulas ticked and in focus", await checked());
      await click('.paste-menu [data-values="1"]');
      await saves("Values only puts the values in place of the formulas", rows("31 | \"1F\" |", "| |"));
      check(await offered() && await ranged() === "12,13", "the button stays, and the cells stay chosen");
      await press("z", CTRL);
      await saves("and one undo takes the paste back whole", START);
      await click(cellAt(1, 2));
      await paste();
      await ctrl();
      check(await checked() === "Keep formulas" && await js("!!document.querySelector('.paste-menu')"),
        "Ctrl pressed alone opens the menu, as in Excel");
      const at = () => js("document.activeElement.dataset.values");
      await press("End");
      const end = await at();
      await press("Home");
      check(end === "1" && await at() === "0", "End goes to Values only, and Home back to Keep formulas",
        `${end} ${await at()}`);
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
      await click(cellAt(1, 2));
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
      // Its filter and number format go with it, so the column left behind hides no row.
      const set = `${H}:::table name="t" formats=",number:2," filter="is:x,,"\n| "a" | "b" | "c" |\n` +
        '| "x" | 1 | |\n| "y" | 2 | |\n| "x" | 3 | |\n:::\n';
      await load(set);
      await click(letter(2));
      await send("cut");
      await click(letter(3));
      await send("paste");
      await saves("a whole column pasted on another takes its filter and number format, and leaves none",
        `${H}:::table name="t" formats=",,number:2" filter="is:x,,"\n| "a" | "" | "b" |\n` +
        '| "x" | | 1 |\n| "y" | | 2 |\n| "x" | | 3 |\n:::\n');
      await click(letter(1));
      await send("cut");
      await click(letter(3));
      await send("paste");
      await saves("and a column pasted on one with a filter takes its place",
        `${H}:::table name="t" filter=",,is:x"\n| "" | "" | "a" |\n` +
        '| | | "x" |\n| | | "y" |\n| | | "x" |\n:::\n');
    },

    // A cut that waits, as in Excel: a copy takes its place, Paste values is refused, and a paste
    // onto hidden rows is refused. Remove row and Insert row above on a filtered range count the
    // rows in sight alone.
    async cutWaits() {
      const said = () => js("document.getElementById('status').textContent");
      const clip = (type, text = null) => js(`(() => {
        const data = new DataTransfer();
        if (${text !== null}) data.setData("text/plain", ${JSON.stringify(text)});
        document.activeElement.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: data, bubbles: true, cancelable: true }));
        return data.getData("text/plain");
      })()`);
      const plainTable = `${H}:::table name="t"\n| "a" | "b" | "c" | "d" |\n| 5 | | 5 | |\n| 7 | | =A2 | |\n:::\n`;
      await load(plainTable);
      await click(cellAt(0, 0));
      await clip("cut");
      await click(cellAt(0, 2));
      const text = await clip("copy");
      check(await js("document.querySelectorAll('#doc .cut').length") === 0,
        "a copy after a cut drops the cut, as Ctrl+C in Excel does");
      await click(cellAt(0, 3));
      await clip("paste", text);
      await saves("so a paste of the same text copies it and leaves the cut cell",
        plainTable.replace("| 5 | | 5 | |", "| 5 | | 5 | 5 |"));
      await load(plainTable);
      await click(cellAt(1, 2));
      const cut = await clip("cut");
      await click(cellAt(1, 3));
      await paste(true, cut);
      check((await said()).startsWith("Cut cells move whole"), "Paste values while a cut waits is refused, and the page says why", await said());
      check(await js("document.querySelectorAll('#doc .cut').length") > 0, "and the cut still waits");
      await saves("and nothing changes", plainTable);
      const filtered = (body) => `${H}:::table name="t" filter="is:x,"\n| "a" | "b" |\n${body}:::\n`;
      const start = filtered('| "x" | 1 |\n| "x" | 2 |\n| "x" | 3 |\n| "y" | "s" |\n| "x" | 5 |\n| "x" | =t.B4 |\n');
      await load(start);
      check(await rowsShown(js) === "111011", "the filter hides the fourth row", await rowsShown(js));
      await click(cellAt(0, 1));
      await click(cellAt(1, 1), SHIFT);
      const two = await clip("cut");
      await click(cellAt(2, 1));
      await clip("paste", two);
      check((await said()).startsWith("A cut cannot pass over hidden rows"), "a paste of a cut onto hidden rows is refused, and the page says why", await said());
      await saves("and changes nothing, so no reference to the hidden row breaks", start);
      const four = filtered('| "x" | 1 |\n| "x" | 2 |\n| "y" | "s" |\n| "x" | 4 |\n');
      await load(four);
      await click(cellAt(1, 1));
      await click(cellAt(3, 1), SHIFT);
      await menu("row-remove");
      await saves("Remove row on a filtered range removes the rows in sight alone",
        filtered('| "x" | 1 |\n| "y" | "s" |\n'));
      await menu("undo");
      await saves("and one undo brings them back", four);
      await click(cellAt(1, 1));
      await click(cellAt(3, 1), SHIFT);
      await menu("row-above");
      await saves("Insert row above inserts one row for each row in sight",
        filtered('| "x" | 1 |\n| | |\n| | |\n| "x" | 2 |\n| "y" | "s" |\n| "x" | 4 |\n'));
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
      const shown = () => rowsShown(js, "#doc .table[data-name=t]");
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
