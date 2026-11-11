// Help while a formula is typed: the list of functions that fit the name typed, Ctrl+Space, the tip
// of the call the caret stands in, and Insert ▸ Function… (Shift+F3). Each is driven through the
// browser's own input events, as `main.mjs` drives the rest, and checked by what the cell holds
// and by the saved source. The cell's own keys are checked to act as before while the list is shut.
// While a formula is typed, its references show in colour, each with a frame round its cells.
// `formulaHelp(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { ALT, CTRL, H, SHIFT, cellAt, cellText, check } from "./drive.mjs";

const TABLE = `${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n:::\n`;

export function formulaHelp({ page, js, settle, until, press, type, click, menu, load, saves }) {
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
    await click(cellAt(r, c));
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
      await click(cellAt(1, 0));
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
      await click(cellAt(1, 1));
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

    // A formula missing its last `)` takes it on Enter, and the status bar says so. `Ctrl`+`Z`
    // right after gives back the formula as typed. Edit ▸ AutoCorrect turns it off.
    async closingBrackets() {
      const said = () => js("document.getElementById('status').textContent");
      await load(TABLE);
      await start(0, 2, "=sum(A1:B1");
      await press("Enter");
      await saves("Enter adds the ) a formula misses at its end", TABLE.replace("| 3 |", "| =sum(A1:B1) |"));
      check((await said()).startsWith("Added ) at the end so the formula reads."),
        "the status bar says what was added", await said());
      await press("z", CTRL);
      await saves("Ctrl+Z right after gives back the formula as typed", TABLE.replace("| 3 |", "| =sum(A1:B1 |"));
      await load(TABLE);
      await start(0, 2, "=1+(");
      await press("Tab");
      await saves("a formula that would not read with them keeps the text as typed",
        TABLE.replace("| 3 |", "| =1+( |"));
      check(await js("document.querySelector('.menubar [data-cmd=\"auto-brackets\"]').getAttribute('aria-checked')") ===
        "true", "Edit, AutoCorrect shows it turned on at first");
      await menu("auto-brackets");
      await load(TABLE);
      await start(0, 2, "=sum(A1:B1");
      await press("Enter");
      await saves("turned off, Enter takes the formula as typed", TABLE.replace("| 3 |", "| =sum(A1:B1 |"));
      check(await js("localStorage.getItem('ksmd.autoBrackets')") === "0", "this browser keeps the choice");
      await menu("auto-brackets");
    },

    // Text in a formula's quotes keeps every `\`, as a Windows path copied from Excel holds it, and
    // a quote inside is written twice.
    async quotedText() {
      const paths = `${H}:::table name="t"\n| "a" | "b" |\n| ".\\\\src\\\\a.c" | |\n:::\n`;
      await load(paths);
      await start(0, 1, '=like(A1, ".\\src\\*")');
      await press("Enter");
      await saves("a formula with a single \\ in its quotes goes in as typed",
        paths.replace("| |\n:::", '| =like(A1, ".\\src\\*") |\n:::'));
      check(await cellText(js, 0, 1) === "true", "and the pattern matches the path",
        await cellText(js, 0, 1));
      await start(0, 1, '=len(".\\src\\su');
      check(!(await listShown()), "a name inside quoted text after a \\ opens no list");
      await press("Enter");
      await saves("Enter closes the quote after a \\ and the bracket",
        paths.replace("| |\n:::", '| =len(".\\src\\su") |\n:::'));
      check(await cellText(js, 0, 1) === "8", "and the text counts each \\ once", await cellText(js, 0, 1));
      await start(0, 1, '="say ""hi"""');
      await press("Enter");
      check(await cellText(js, 0, 1) === 'say "hi"', "a doubled quote is one quote", await cellText(js, 0, 1));
    },

    // The bracket beside the caret and the one it pairs with are marked while a formula is typed,
    // never one inside quoted text.
    async bracketPairs() {
      const marked = () => js("Array.from(document.querySelectorAll('#doc .cell-copy:not([hidden]) " +
        ".bracket-pair')).map((e) => e.textContent).join('')");
      // The text before the first bracket marked, which says where it stands.
      const before = () => js("(() => { const m = document.querySelector('#doc .cell-copy .bracket-pair'); " +
        "let t = ''; for (let n = m.parentNode.firstChild; n !== m; n = n.nextSibling) t += n.textContent; " +
        "return t; })()");
      const caretAt = async (n) => {
        await js(`document.querySelector('#doc .cell-input').setSelectionRange(${n}, ${n})`);
        await settle();
      };
      await load(TABLE);
      await start(0, 2, "=round(sum(A1");
      check(await marked() === "", "a caret beside no bracket marks none", await marked());
      await type(")");
      await settle();
      check(await marked() === "()" && await before() === "=round(sum",
        "the ) typed and the ( it closes are marked", `${await marked()} after ${await before()}`);
      await caretAt(7);
      check(await marked() === "", "a ( that nothing closes marks none", await marked());
      await press("Escape");
      await start(1, 2, "=len(\"(\")");
      check(await marked() === "()" && await before() === "=len",
        "a bracket inside quoted text is passed over", `${await marked()} after ${await before()}`);
      await caretAt(7);
      check(await marked() === "", "and a caret beside it marks nothing", await marked());
      await press("Escape");
      await press("Escape");
    },

    async insertFunction() {
      await load(TABLE);
      await click(cellAt(1, 2));
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
        about.includes("=hex_to_dec(\"100000\") shows 1048576") && about.includes("=0x100000"),
      "the chosen function shows how it is written, its arguments, an example and the literal it does not read",
      about);
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
      await click(cellAt(1, 2));
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

    // A press on a cell of another table writes its reference with that table's name, and a drag
    // a range there. A name that is not plain is written in quotes.
    async pointOtherTable() {
      const doc = `${H}:::table name="t"\n| "a" | "b" |\n| 1 | |\n| 2 | |\n:::\n\n` +
        `:::table name="map"\n| "c" | "d" |\n| 2 | 5 |\n| 3 | 7 |\n:::\n\n` +
        `:::table name="Q1 sales"\n| "e" |\n| 9 |\n:::\n\n:::table name="a\\"b\\\\c"\n| "f" |\n| 4 |\n:::\n`;
      await load(doc);
      const other = (name, r, c) => `#doc .table[data-name=${JSON.stringify(name)}] td[data-r="${r}"][data-c="${c}"]`;
      // A name cell is pressed near its left edge, clear of its filter arrow on any OS's fonts.
      const mouse = async (type, selector) => {
        const [x, y] = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})` +
          ".getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 8), r.top + r.height / 2]; })()");
        await page("Input.dispatchMouseEvent", { type, x, y, button: "left",
          buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
      };
      await start(0, 1, "=sum(");
      await mouse("mousePressed", other("map", 0, 1));
      await mouse("mouseMoved", other("map", 1, 1));
      await mouse("mouseReleased", other("map", 1, 1));
      check(await box() === "=sum(map.B1:B2", "a drag in another table writes the range with its name", await box());
      await type(")+");
      await click(other("Q1 sales", 0, 0));
      check(await box() === '=sum(map.B1:B2)+"Q1 sales".A1',
        "a press in a table whose name is not plain writes the name in quotes", await box());
      // In the quotes, a quote is doubled and a backslash stays as it is, as in a formula's text.
      await type("+");
      await click(other('a"b\\c', 0, 0));
      check(await box() === '=sum(map.B1:B2)+"Q1 sales".A1+"a""b\\c".A1',
        "a name with a quote and a backslash is written by the formula's rule", await box());
      await press("Enter");
      await saves("Enter takes the formula",
        doc.replace("| 1 | |", '| 1 | =sum(map.B1:B2)+"Q1 sales".A1+"a""b\\c".A1 |'));
      check(await js(`document.querySelector('${cellAt(0, 1)}').textContent`) === "25",
        "which calculates from the other tables");

      // A column's name or letter writes the whole column: with the table's name in another
      // table, and bare in the formula's own, as a cell is.
      const name = (table, c) => `#doc .table[data-name=${JSON.stringify(table)}] th.name[data-c="${c}"]`;
      const letter = (table, c) => `#doc .table[data-name=${JSON.stringify(table)}] th.letter:nth-child(${c + 2})`;
      const press1 = async (selector) => {
        await mouse("mousePressed", selector);
        await mouse("mouseReleased", selector);
      };
      await start(1, 1, "=sum(");
      await press1(name("map", 1));
      check(await box() === "=sum(map.B", "a press on another table's column name writes the whole column", await box());
      await mouse("mousePressed", letter("map", 0));
      await mouse("mouseMoved", letter("map", 1));
      await mouse("mouseReleased", letter("map", 1));
      check(await box() === "=sum(map.A:B", "a drag across its letters replaces it with the columns side by side",
        await box());
      await type(")+sum(");
      await press1(name("t", 0));
      check(await box() === "=sum(map.A:B)+sum(A", "the formula's own column is written without its table's name",
        await box());
      await type(")");
      await press("Enter");
      check(await js(`document.querySelector('${cellAt(1, 1)}').textContent`) === "20",
        "and the whole columns calculate");
    },

    // `name(t.B)` shows the column's name, and follows it when the name is typed again.
    async columnName() {
      const named = TABLE.replace("| 3 |", "| =name(t.B) |");
      await load(TABLE);
      await start(0, 2, "=name(t.B)");
      await press("Enter");
      await saves("name is saved as typed", named);
      check(await cellText(js, 0, 2) === "b", "and the cell shows the column's name", await cellText(js, 0, 2));
      await click('#doc th.name[data-c="1"]');
      await type("Kind");
      await press("Enter");
      await saves("a name typed over the column's name replaces it", named.replace('"b"', '"Kind"'));
      check(await cellText(js, 0, 2) === "Kind", "and the cell shows the new name", await cellText(js, 0, 2));
    },

    // Copy formula puts the chosen cell's formula as typed on the clipboard, where Copy gives its
    // value. Text chosen in the formula bar is copied as chosen.
    // A number in hexadecimal or binary is the number, kept as typed; no function name is offered
    // after its `0b`, and the tip of `hex_to_dec` says the literal is no digit text.
    async baseLiteral() {
      await load(TABLE);
      await start(0, 2, "=0b");
      check(!(await listShown()), "=0b offers no function: the b belongs to the number", await offered());
      await press("Backspace");
      await type("x100000");
      await press("Enter");
      await saves("the literal is saved as typed", TABLE.replace("| 3 |", "| =0x100000 |"));
      check(await cellText(js, 0, 2) === "1048576", "and the cell shows its number",
        await cellText(js, 0, 2));
      await start(1, 2, "=hex_to_dec(");
      const meaning = await js("(() => { const m = document.querySelector('.fx-tip:not([hidden]) .fx-meaning'); " +
        "return m ? m.textContent : ''; })()");
      check(meaning.includes("\"100000\"") && meaning.includes("0x100000"),
        "the tip of hex_to_dec asks for digit text, not a literal", meaning);
      await type("0x10)");
      await press("Enter");
      await saves("a literal as its digits is kept as typed",
        TABLE.replace("| 3 |", "| =0x100000 |").replace("| 6 |", "| =hex_to_dec(0x10) |"));
      check(await cellText(js, 1, 2) === "#SYNTAX!", "and does not read, never giving 22",
        await cellText(js, 1, 2));
    },

    // `like` in a condition: its tip shows how it is written, and each row's code is matched
    // against the pattern without regard to case.
    async wildcards() {
      const codes = `${H}:::table name="t"\n| "code" | "n" | "sum" |\n| "INV-1" | 3 | |\n` +
        `| "Pens" | 4 | |\n| "inv-22" | 5 | |\n:::\n`;
      await load(codes);
      await start(0, 2, "=sum_if(B, like(");
      const t = await tip();
      check(!!t && t[0] === "like(t, pattern)" && t[1] === "t",
        "the tip of like shows its arguments, the text in bold", JSON.stringify(t));
      await type("A, \"inv-*\"))");
      await press("Enter");
      await saves("the formula with like is saved as typed",
        codes.replace("| 3 | |", "| 3 | =sum_if(B, like(A, \"inv-*\")) |"));
      check(await cellText(js, 0, 2) === "8", "and adds the rows whose code starts with INV-, in any case",
        await cellText(js, 0, 2));
    },

    // **An error says why it stands**: on the cell's tooltip, and on the status bar while the
    // cell is chosen. The calculator gives the reason; the page only shows it.
    async errorReason() {
      const why = "#SYNTAX!: hex_to_dec reads digits as text: 0x100000 is already the number 1048576. " +
        "Write =0x100000, or hex_to_dec(\"100000\")";
      await load(`${H}:::table name="t"\n| "a" | "b" |\n| =hex_to_dec(0x100000) | =A1 |\n| 1 | 2 |\n:::\n`);
      check(await cellText(js, 0, 0) === "#SYNTAX!", "the hex literal given as digit text does not read",
        await cellText(js, 0, 0));
      const title = (c) => js(`document.querySelector('${cellAt(0, c)}').title`);
      check(await title(0) === why, "the error's tooltip says why", await title(0));
      check(await title(1) === "#SYNTAX!: A1 shows #SYNTAX!",
        "an error carried from another cell names that cell", await title(1));
      const bar = () => js("(() => { const s = document.querySelector('.status-why'); " +
        "return s.hidden ? '' : s.textContent; })()");
      await click(cellAt(0, 0));
      await until("!document.querySelector('.status-why').hidden");
      check(await bar() === why, "the status bar says why while the cell is chosen", await bar());
      // One line is about as tall as the figures beside it; two would be twice as tall.
      const tall = await js("(() => { const s = document.querySelector('.status-why'); " +
        "const line = document.querySelector('.status-bar .figures').getBoundingClientRect().height; " +
        "return [s.title === s.textContent, s.getBoundingClientRect().height, line]; })()");
      check(tall[0] && tall[1] < 1.5 * tall[2], "it keeps to one line, and its tooltip holds it whole",
        JSON.stringify(tall));
      await click(cellAt(0, 1));
      await until("document.querySelector('.status-why').textContent === '#SYNTAX!: A1 shows #SYNTAX!'");
      await press("ArrowDown");
      await settle();
      check(await bar() === "", "a cell with no error shows no reason", await bar());
    },

    async copyFormula() {
      const formula = "=sum(A1:A2)*2";
      await load(`${H}:::table name="t"\n| "a" | "b" |\n| 1 | ${formula} |\n| 2 | |\n:::\n`);
      await js("window.copied = []; { const set = DataTransfer.prototype.setData; " +
        "DataTransfer.prototype.setData = function (type, text) { window.copied.push([type, text]); " +
        "return set.call(this, type, text); }; }");
      await click(cellAt(0, 1));
      await menu("copy-formula");
      const got = await js("JSON.stringify(window.copied)");
      check(got === JSON.stringify([["text/plain", formula]]), "Copy formula copies the formula as typed", got);
      // The formula bar holds the formula whole, and a copy there takes the text chosen in it.
      await until(`document.querySelector('.formula-bar .formula-input').value === ${JSON.stringify(formula)} && ` +
        "document.querySelector('.menu.context').hidden");
      await click(".formula-bar .formula-input");
      await until("document.activeElement === document.querySelector('.formula-bar .formula-input')");
      await js("document.activeElement.setSelectionRange(5, 10)");
      const taken = await js("(() => { const data = new DataTransfer(); const e = new ClipboardEvent('copy', " +
        "{ clipboardData: data, bubbles: true, cancelable: true }); document.activeElement.dispatchEvent(e); " +
        "return e.defaultPrevented; })()");
      check(!taken, "part of the formula chosen in the formula bar is copied as chosen, not the cell");
      await press("Escape");
    },

    // **A key that reaches a box the page has just taken away is kept.** A document's own function
    // answers and draws the table again between the press that chose a cell and the first key.
    // The page here takes the box out as such a drawing does, and the key goes into it.
    async keyAfterRedraw() {
      await load(TABLE);
      await click(cellAt(0, 0));
      await js("(() => { const box = document.activeElement; box.remove(); box.value = '2'; " +
        "box.dispatchEvent(new InputEvent('input', { data: '2', inputType: 'insertText', bubbles: true })); })()");
      await type("00");
      check(await box() === "200", "the first key, typed into a box the page took away, opens the chosen cell",
        String(await box()));
      await press("Enter");
      await saves("and the cell takes all three keys", TABLE.replace("| 1 | 2 | 3 |", "| 200 | 2 | 3 |"));
    },

    // **A late close of Insert Function leaves a cell opened since alone.** Its close event comes
    // a moment after Esc, when the person may already have pressed a cell and typed a key. The
    // check sends that event by hand after the first key.
    async lateDialogClose() {
      await load(TABLE);
      await click(cellAt(0, 0));
      await press("F3", SHIFT);
      await until("document.querySelector('.fx-dialog').open");
      await press("Escape");
      await click(cellAt(0, 0));
      await type("2");
      await js("document.querySelector('.fx-dialog').dispatchEvent(new Event('close'))");
      await type("00");
      check(await box() === "200", "a cell opened before the dialog's late close keeps its keys", String(await box()));
      await press("Enter");
      await saves("and takes all three", TABLE.replace("| 1 | 2 | 3 |", "| 200 | 2 | 3 |"));
    },
  };
}
