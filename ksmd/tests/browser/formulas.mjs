// Help while a formula is typed: the list of functions that fit the name typed, Ctrl+Space, the tip
// of the call the caret stands in, and Insert ▸ Function… (Shift+F3). Each is driven through the
// browser's own input events, as `main.mjs` drives the rest, and checked by what the cell holds
// and by the saved source. The cell's own keys are checked to act as before while the list is shut.
// While a formula is typed, its references show in colour, each with a frame round its cells.
// `formulaHelp(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);
const TABLE = `${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n:::\n`;

export function formulaHelp({ page, js, settle, press, type, click, menu, load, saves }) {
  const cell = (r, c) => `#doc td[data-r="${r}"][data-c="${c}"]`;
  const box = () => js("(() => { const i = document.querySelector('#doc .cell-input'); " +
    "return i ? i.value : null; })()");
  const offered = () => js("Array.from(document.querySelectorAll('.fx-list:not([hidden]) .fx-name'))" +
    ".map((e) => e.textContent).join()");
  const chosen = () => js("(() => { const o = document.querySelector('.fx-list:not([hidden]) " +
    "[aria-selected=true] .fx-name'); return o ? o.textContent : null; })()");
  const listShown = () => js("!document.querySelector('.fx-list').hidden");
  const tip = () => js("(() => { const t = document.querySelector('.fx-tip'); return t.hidden ? null : " +
    "[t.querySelector('.fx-signature').textContent, (t.querySelector('strong') || {}).textContent]; })()");
  // Chooses a cell and types into it, as a person starts a formula in a spreadsheet.
  async function start(r, c, text) {
    await click(cell(r, c));
    await type(text);
    await settle();
  }

  return {
    async suggestions() {
      await load(TABLE);
      await start(0, 2, "=hex_");
      check(await offered() === "hex_to_bin,hex_to_dec",
        "letters typed after = open the list of the functions they fit", await offered());
      await press("Escape");
      await press(" ", CTRL);
      await settle();
      check(await offered() === "hex_to_bin,hex_to_dec" && await box() === "=hex_",
        "Ctrl+Space opens it again after Esc, and keeps the cell open", await offered());
      check((await js("document.querySelector('.fx-chosen').textContent")) ===
        "hex_to_bin(digits, [width])", "the chosen entry shows how it is written");
      await type("to_d");
      await settle();
      check(await offered() === "hex_to_dec", "typing narrows the list", await offered());
      for (let i = 0; i < 4; i += 1) await press("Backspace");
      await settle();
      check(await offered() === "hex_to_bin,hex_to_dec", "and Backspace widens it again", await offered());
      await press("ArrowDown");
      check(await chosen() === "hex_to_dec", "Down chooses the next entry", await chosen());
      await press("Tab");
      await settle();
      check(await box() === "=hex_to_dec(" && !(await listShown()),
        "Tab writes the chosen name and its bracket in place of what was typed, and shuts the list",
        await box());
      const t = await tip();
      check(!!t && t[0] === "hex_to_dec(digits, [width])" && t[1] === "digits",
        "inside the brackets a tip shows the arguments, the one being typed in bold", JSON.stringify(t));
      await type("\"FF\", ");
      await settle();
      const t2 = await tip();
      check(!!t2 && t2[1] === "[width]", "after a comma the next argument is the bold one",
        JSON.stringify(t2));
      await type("d");
      await settle();
      const found = (await offered()).split(",");
      check(found[0] === "date" && found.includes("hex_to_dec") &&
        found.indexOf("dec_to_hex") < found.indexOf("hex_to_dec"),
      "a name that starts with what is typed comes before one with a part that does", found.join());
      await press("Escape");
      await settle();
      check(!(await listShown()) && await box() === "=hex_to_dec(\"FF\", d",
        "Esc shuts the list alone; the cell stays open with its text", await box());
      await press("Backspace");
      await type("8)");
      await press("Enter");
      await saves("with the list shut, Enter takes the formula as before",
        TABLE.replace("| 3 |", "| =hex_to_dec(\"FF\", 8) |"));
    },

    async suggestionKeys() {
      await load(TABLE);
      await start(0, 2, "=sum");
      await press("Enter");
      await settle();
      check(await box() === "=sum(", "Enter while the list is open writes the chosen name",
        await box());
      await type("A1:B1)");
      await press("Tab");
      await settle();
      await type("=rou");
      await settle();
      await click(".fx-list .fx-option:nth-child(3)");
      await settle();
      check(await box() === "=round_up(", "a press on an entry writes it", await box());
      await press("Escape");
      await press("Escape");
      await saves("with the list shut, Tab takes the formula and moves right, and Esc drops an edit",
        TABLE.replace("| 3 |", "| =sum(A1:B1) |"));
      // No letter typed after a reference: the arrow keys move between cells as before.
      await start(1, 0, "=B1");
      check(!(await listShown()), "an uppercase letter starts a reference, not a name");
      await press("ArrowDown");
      await saves("an arrow key takes the formula and moves on, as before",
        TABLE.replace("| 3 |", "| =sum(A1:B1) |").replace("| 4 |", "| =B1 |"));
      await start(1, 1, "\"su");
      check(!(await listShown()), "text that is no formula opens no list");
      await press("Escape");
    },

    // With no letter before the caret the list shuts, so Enter, Tab and a press act on the cell.
    async noLetter() {
      for (const key of ["Enter", "Tab"]) {
        await load(TABLE);
        await start(0, 2, "=round(");
        check(!(await listShown()), `the ( that ends a name shuts the list, so ${key} acts on the cell`);
        await type("A1");
        await press(key);
        await saves(`${key} then takes the formula`, TABLE.replace("| 3 |", "| =round(A1 |"));
      }
      await load(TABLE);
      await start(0, 2, "=sum(");
      await click(cell(1, 0));
      await settle();
      check(await box() === "=sum(A2", "a press after =sum( points at the cell, not at a function", await box());
      await press(" ", CTRL);
      await settle();
      check(!(await listShown()), "after a reference Ctrl+Space finds no place for a name");
      await type(",");
      await press(" ", CTRL);
      await settle();
      check(await listShown(), "after a comma Ctrl+Space opens the list with no letter typed");
      await press("Escape");
      await type("1)&");
      await click(cell(1, 1));
      await settle();
      check(await box() === "=sum(A2,1)&B2", "a press after & points too, as & is an operator", await box());
      await press("Escape");
      await press("Escape");
      await start(1, 2, "=");
      await press("Enter");
      await settle();
      check((await js("document.getElementById('status').textContent")).startsWith("This formula is empty."),
        "an = alone says the formula is empty", await js("document.getElementById('status').textContent"));
      await press("Escape");
      await press("Escape");
      await start(1, 2, "1e400");
      await press("Enter");
      await saves("a number too large for a cell stays the text typed", TABLE.replace("| 6 |", '| "1e400" |'));
    },

    async insertFunction() {
      await load(TABLE);
      await click(cell(1, 2));
      await press("F3", SHIFT);
      await settle();
      check(await js("document.querySelector('.fx-dialog').open && " +
        "document.activeElement === document.querySelector('.fx-search')"),
      "Shift+F3 opens Insert function, its search box taking the keys");
      await type("hexadecimal");
      await settle();
      const names = await js("Array.from(document.querySelectorAll('.fx-names option')).map((o) => o.value).join()");
      check(names.split(",").includes("hex_to_dec") && names.split(",").includes("dec_to_hex"),
        "the search finds functions by what their descriptions say", names);
      await js("(() => { const s = document.querySelector('.fx-search'); s.value = ''; " +
        "s.dispatchEvent(new Event('input')); })()");
      await type("hex_to_d");
      await settle();
      const about = await js("document.querySelector('.fx-about').textContent");
      check(about.includes("hex_to_dec(digits, [width])") && about.includes("the hexadecimal digits") &&
        about.includes("=hex_to_dec(\"FF\") shows 255"),
      "the chosen function shows how it is written, its arguments and an example", about);
      await press("Enter");
      await settle();
      check(await box() === "=hex_to_dec(" && await js("!document.querySelector('.fx-dialog').open && " +
        "document.activeElement === document.querySelector('#doc .cell-input')"),
      "Insert puts the function in the chosen cell, open to type its arguments", await box());
      await type("\"1F\")");
      await press("Enter");
      await saves("and the formula goes in as typed", TABLE.replace("| 6 |", "| =hex_to_dec(\"1F\") |"));
      // A cell being edited stays open, and the name goes at its caret.
      await start(0, 2, "=1+");
      await menu("insert-function");
      await settle();
      await type("len");
      await press("Enter");
      await settle();
      check(await box() === "=1+len(", "Insert puts the name at the caret of the cell being edited",
        await box());
      await press("F3", SHIFT);
      await type("su");
      await press("Escape");
      await settle();
      check(await js("!document.querySelector('.fx-dialog').open && " +
        "document.activeElement === document.querySelector('#doc .cell-input')") &&
        await box() === "=1+len(",
      "Esc closes the dialog, a search typed or not, and the focus goes back to the cell");
      await press("Escape");
    },

    // Each reference in an open formula takes a colour, in the order written, and a frame of that
    // colour stands round its cells. The colours follow the typing and go when the cell closes.
    async referenceColours() {
      await load(`${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | |\n| 3 | 4 | |\n| 5 | 6 | |\n` +
        `| 7 | 8 | |\n:::\n\n:::table name="u"\n| "x" |\n| 9 |\n:::\n`);
      // The coloured parts of the open cell's text, each as text and colour number.
      const parts = () => js("Array.from(document.querySelectorAll('#doc .cell-copy:not([hidden]) .ref-text'))" +
        ".map((e) => `${e.textContent}=${e.dataset.ref}`).join()");
      // Each frame, as its colour number and the table, rows and columns it stands round.
      const frames = () => js("Array.from(document.querySelectorAll('#doc .ref-frame'))" +
        ".map((f) => `${f.dataset.ref}:${f.dataset.cells}`).join()");
      const tinted = () => js("(() => { const i = document.querySelector('#doc .cell-input'); " +
        "return !!i && i.classList.contains('tinted'); })()");
      await start(0, 2, "=A2-A4");
      check(await parts() === "A2=1,A4=2", "two references take the first two colours", await parts());
      check(await frames() === "1:0 1 0 1 0,2:0 3 0 3 0", "and a frame of each colour stands round its cell",
        await frames());
      const looks = await js(`(() => {
        const at = (sel) => document.querySelector(sel);
        const [a, b] = document.querySelectorAll('#doc .ref-text');
        const [f, g] = document.querySelectorAll('#doc .ref-frame');
        const near = (x, y) => Math.abs(x - y) <= 1;
        const on = (frame, cell) => { const r = frame.getBoundingClientRect(); const c = at(cell).getBoundingClientRect();
          return near(r.left, c.left) && near(r.top, c.top) && near(r.right, c.right) && near(r.bottom, c.bottom); };
        const colour = (e) => getComputedStyle(e).color;
        const edge = (e) => getComputedStyle(e).borderTopColor;
        return [colour(a) !== colour(b), colour(a) === edge(f), colour(b) === edge(g),
          on(f, '#doc .table td[data-r="1"][data-c="0"]'), on(g, '#doc .table td[data-r="3"][data-c="0"]'),
          getComputedStyle(at('#doc .cell-input')).color];
      })()`);
      check(looks[0] && looks[1] && looks[2], "the two colours differ, and each frame takes its text's colour",
        JSON.stringify(looks));
      check(looks[3] && looks[4], "the frames sit on the cells named", JSON.stringify(looks));
      check(looks[5] === "rgba(0, 0, 0, 0)", "the box's own text is transparent over the coloured copy", looks[5]);
      await type("+A2*sum(B1:B3)");
      await settle();
      check(await parts() === "A2=1,A4=2,A2=1,B1:B3=3", "cells named again keep their colour, and a new reference takes the next",
        await parts());
      check(await frames() === "1:0 1 0 1 0,2:0 3 0 3 0,3:0 0 1 2 1", "a range is framed whole, once for each cells named",
        await frames());
      await type("+u.A1+Z9");
      await settle();
      check(await parts() === "A2=1,A4=2,A2=1,B1:B3=3,u.A1=4",
        "a reference to another table is coloured; one that names no cell is not", await parts());
      check((await frames()).endsWith(",4:1 0 0 0 0"), "and the other table's cell is framed too", await frames());
      await press("Escape");
      await settle();
      check(await frames() === "" && await js("!document.querySelector('#doc .cell-copy')"),
        "Esc closes the cell, and every colour and frame goes");
      await start(0, 2, '="日本"&A1&"B2"');
      check(await parts() === "A1=1", "text in quotes is no reference, and text before it does not shift the colour",
        await parts());
      await press("Enter", ALT);
      await type("&A2");
      await settle();
      const lines = await js(`(() => { const i = document.querySelector('#doc .cell-input');
        const c = document.querySelector('#doc .cell-copy'); return [c.textContent.includes("\\n"),
        Math.abs(c.offsetHeight - i.offsetHeight) <= 1, i.offsetHeight > 30]; })()`);
      check(await parts() === "A1=1,A2=2" && lines.every((x) => x),
        "after Alt+Enter the copy keeps the line break, and grows with the box", `${await parts()} ${JSON.stringify(lines)}`);
      await press("Escape");
      await start(1, 2, "=B4");
      await press("Enter");
      check(await frames() === "", "Enter takes the formula, and the frames go");
      await saves("the formula goes in as typed", `${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | |\n` +
        '| 3 | 4 | =B4 |\n| 5 | 6 | |\n| 7 | 8 | |\n:::\n\n:::table name="u"\n| "x" |\n| 9 |\n:::\n');
    },

    // An input method composes in the box's own text, and the colours come back once it commits.
    // The list of functions still opens and writes a name.
    async referenceColoursInput() {
      await load(TABLE);
      await start(0, 2, "=A1&");
      await page("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
      await settle();
      check(!await js("document.querySelector('#doc .cell-input').classList.contains('tinted')") &&
        await js("document.querySelector('#doc .cell-copy').hidden"),
      "while an input method composes, the box shows its own text");
      await page("Input.insertText", { text: "かんそ" });
      await settle();
      await settle();
      check(await box() === "=A1&かんそ" &&
        await js("document.querySelector('#doc .cell-input').classList.contains('tinted')"),
      "once it commits, the colours come back", await box());
      await press("Escape");
      await click(cell(1, 2));
      await page("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
      await settle();
      check(await js("(() => { const i = document.querySelector('#doc .cell-input'); " +
        "return !!i && !i.classList.contains('tinted'); })()"),
      "a composition that opens a chosen cell goes on in the box's own text");
      await page("Input.insertText", { text: "か" });
      await settle();
      check(await box() === "か", "and commits there", await box());
      await press("Escape");
      await start(0, 2, "=A1+sum");
      check(await listShown(), "the list of functions opens over a coloured formula");
      await press("Tab");
      await type("B1:B2)");
      await settle();
      check(await box() === "=A1+sum(B1:B2)" && await js("Array.from(document.querySelectorAll('#doc .ref-text'))" +
        ".map((e) => e.textContent).join()") === "A1,B1:B2", "and the name it writes leaves the references coloured",
      await box());
      await press("Escape");
    },
  };
}
