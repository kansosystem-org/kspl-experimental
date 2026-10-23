// The ksmd page in a headless Chromium: typing, composition, selection, paste, undo, blocks,
// formatting, the menus, tables, sorting and filtering, each driven through the browser's own input events and checked by the
// canonical source the page gives back. The tools over a whole document or a range of cells are
// `tools.mjs`.
// An input method's composition is driven as one sends it (`Input.imeSetComposition`, then
// `Input.insertText` to commit); a real input method on a real keyboard is not checked here.
// Paste is a synthetic `paste` event holding plain text, since a headless browser has no clipboard.
// Served by the local server, the same page opens and saves files: `served.mjs`.
// Usage: node tests/browser/main.mjs <chromium> <ksmd.html> <work folder> [<kssrv>]
// (`make test-browser`). Without a kssrv, the served sections are reported as skipped.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { launch } from "./cdp.mjs";
import { ALT, CTRL, SHIFT, driver, verdict } from "./drive.mjs";
import { served } from "./served.mjs";
import { tools } from "./tools.mjs";

const [binary, pageFile, work, kssrv] = process.argv.slice(2);
const check = (ok, what, detail) => verdict.check(ok, what, detail);

const browser = await launch(binary, work);
const page = browser.page;
const { js, settle, until, press, type, select, click, clickBelow, drag, menu, point, doubleClickAt,
  rightClick } = driver(page);

async function load(source) {
  const r = await js(`ksmd.load(${JSON.stringify(source)})`);
  if (!r.ok) throw new Error(`the test source was refused: ${r.why}`);
}

const source = () => js("ksmd.source()");

async function saves(what, want) {
  await settle();
  const got = await source();
  check(got === want, what, JSON.stringify(got));
}

const H = "%ksmd 1\n\n";

const sections = {
  // Only the actions the script calls go out of the module, and only one function comes in.
  async module() {
    const bytes = fs.readFileSync(path.join(path.dirname(pageFile), "ksmd.wasm"));
    const mod = new WebAssembly.Module(bytes);
    const out = WebAssembly.Module.exports(mod).map((e) => e.name);
    // `memory` is the linker's; `memcmp` is std's, exported for the calls the compiler emits.
    const stray = out.filter((n) => !n.startsWith("ksmd_web_") && n !== "memory" && n !== "memcmp");
    check(stray.length === 0, "only the page's actions are exported", stray.join(" "));
    const into = WebAssembly.Module.imports(mod).map((e) => e.name);
    check(into.length === 1 && into[0] === "ksmd_js_gave_up", "only the stop call is imported",
      into.join(" "));
    check(await until("document.documentElement.dataset.files === 'none'") &&
      await js("document.querySelector('.files').hidden"),
    "a page opened from a file offers no file controls; a host gives it a source");
  },

  async typing() {
    await load(`${H}Hello\n`);
    await select(0, 0, 5);
    await press("!");
    await saves("one key inserts one character", `${H}Hello!\n`);
    check(await js("document.querySelector('#doc p').textContent") === "Hello!",
      "and the page shows it once");
    await type(" and #1 *x*");
    await saves("typed '#' and '*' stay text", `${H}Hello! and #1 \\*x\\*\n`);
    await select(0, 0, 0, 5);
    await type("Bye");
    await saves("typing over a selection replaces it", `${H}Bye! and #1 \\*x\\*\n`);
    await js("window.changes = 0; ksmd.onchange = () => { window.changes += 1; }");
    await press("?");
    await clickBelow();
    check(await js("window.changes") === 1, "the host learns of a change, and not of a caret move");
    await js("ksmd.onchange = null");
  },

  async composition() {
    await load(`${H}Kanso\n`);
    await select(0, 0, 5);
    await js("window.composed = document.querySelector('#doc p')");
    await page("Input.imeSetComposition", { text: "か", selectionStart: 1, selectionEnd: 1 });
    await page("Input.imeSetComposition", { text: "かん", selectionStart: 2, selectionEnd: 2 });
    check(await js("window.composed === document.querySelector('#doc p') && " +
      "window.composed.isConnected"), "the element being composed in is not rebuilt");
    await page("Input.insertText", { text: "かんそ" });
    await saves("the committed text is inserted once", `${H}Kansoかんそ\n`);
    check(await js("document.querySelector('#doc p').textContent") === "Kansoかんそ",
      "and the page shows it once");
    await press("!");
    await saves("typing after it goes on at the caret", `${H}Kansoかんそ!\n`);
    await press("z", CTRL);
    await press("z", CTRL);
    await saves("undo takes the composition back as one step", `${H}Kanso\n`);
    await load(`${H}`);
    await clickBelow();
    await page("Input.imeSetComposition", { text: "日本", selectionStart: 2, selectionEnd: 2 });
    await page("Input.insertText", { text: "日本語" });
    await saves("a composition in an empty document makes a paragraph", `${H}日本語\n`);
  },

  async selection() {
    await load(`${H}Hello world\n`);
    await select(0, 0, 6, 11);
    await type("there");
    await saves("a selection is replaced by what is typed", `${H}Hello there\n`);
    await select(0, 0, 0, 6);
    await press("Backspace");
    await saves("Backspace removes a selection", `${H}there\n`);
    await select(0, 0, 5);
    await js(`(() => {
      const data = new DataTransfer();
      data.setData("text/plain", " one\\r\\ntwo");
      data.setData("text/html", "<b>one</b>");
      document.getElementById("doc").dispatchEvent(new ClipboardEvent("paste",
        { clipboardData: data, bubbles: true, cancelable: true }));
    })()`);
    await saves("pasted plain text stays text; a line break starts a paragraph",
      `${H}there one\n\ntwo\n`);
    check((await js("document.getElementById('status').textContent")).startsWith(
      "Pasted as plain text"), "a paste that held formatting says it was not kept");
  },

  async undo() {
    await load(`${H}Start\n`);
    await select(0, 0, 5);
    await type(" more words");
    await press("z", CTRL);
    await saves("one undo takes back the last word", `${H}Start more\n`);
    await press("z", CTRL);
    await saves("the next takes back the word before it", `${H}Start\n`);
    await press("y", CTRL);
    await press("y", CTRL);
    await saves("redo gives both back", `${H}Start more words\n`);
    await menu("undo");
    await saves("the toolbar's Undo does the same", `${H}Start more\n`);
    await menu("redo");
    await saves("and its Redo", `${H}Start more words\n`);
  },

  async blocks() {
    await load(`${H}One two\n`);
    await select(0, 0, 3);
    await press("Enter");
    await saves("Enter splits a paragraph; the space starting a line is not saved", `${H}One\n\ntwo\n`);
    await press("Backspace");
    await saves("Backspace at a block's start joins it to the one before", `${H}One two\n`);
    await select(0, 0, 7);
    await press("Enter");
    await type("Three");
    await saves("Enter at the end, then typing, adds a paragraph", `${H}One two\n\nThree\n`);
    await select(1, 0, 5);
    await press("Enter", SHIFT);
    await type("Four");
    await saves("Shift+Enter breaks the line inside the paragraph", `${H}One two\n\nThree\\\nFour\n`);
    await select(0, 0, 0, 7);
    await press("Delete");
    await type("Zero");
    await saves("a block emptied and typed into again keeps its place",
      `${H}Zero\n\nThree\\\nFour\n`);
  },

  async formatting() {
    await load(`${H}one two three\n`);
    await select(0, 0, 4, 7);
    await press("b", CTRL);
    await saves("Ctrl+B makes strong emphasis", `${H}one **two** three\n`);
    await press("i", CTRL);
    await saves("Ctrl+I adds emphasis inside it", `${H}one ***two*** three\n`);
    await press("b", CTRL);
    await press("i", CTRL);
    await saves("pressed again, each comes off", `${H}one two three\n`);
    await select(0, 0, 8, 13);
    await menu("code");
    await saves("the Code button makes inline code", `${H}one two \`three\`\n`);
    await select(0, 0, 0, 3);
    browser.answerPrompts("https://kanso.example/one");
    await press("k", CTRL);
    await saves("Ctrl+K makes a link to the address given", `${H}[one](https://kanso.example/one) two \`three\`\n`);
    browser.answerPrompts(null);
    await select(0, 0, 0);
    await press("2", CTRL | ALT);
    await saves("Ctrl+Alt+2 makes a heading", `${H}## [one](https://kanso.example/one) two \`three\`\n`);
    await menu("p");
    await saves("Format, Kind of block, Paragraph makes it a paragraph again", `${H}[one](https://kanso.example/one) two \`three\`\n`);
    await menu("c");
    await saves("and code, which keeps the text and drops the marks", `${H}\`\`\`\none two three\n\`\`\`\n`);
    await load(`${H}a\n\nb\n`);
    await select(0, 0, 0);
    await menu("bullets");
    await saves("Format, List, Bulleted list makes a list item", `${H}- a\n\nb\n`);
    await select(1, 0, 0);
    await menu("bullets");
    await saves("a list item made next to the list joins it", `${H}- a\n- b\n`);
    await press("Tab");
    await saves("Tab nests an item", `${H}- a\n  - b\n`);
    await menu("numbers");
    await press("Tab", SHIFT);
    await saves("the numbered list and Shift+Tab", `${H}- a\n\n1. b\n`);
    await select(1, 0, 1);
    await press("Enter");
    await type("c");
    await saves("Enter at an item's end makes the next item", `${H}- a\n\n1. b\n1. c\n`);
  },

  async tables() {
    const table = `:::table name="t"\n| "a" |\n| 1 |\n:::\n`;
    await load(`${H}${table}`);
    await clickBelow();
    await type("After");
    await saves("a press below the last table, then typing, adds prose at the end",
      `${H}${table}\nAfter\n`);
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("ArrowUp");
    await press("ArrowUp");
    await type("Before");
    await saves("leaving the table upward puts the caret before it", `${H}Before\n\n${table}\nAfter\n`);
    await load(H);
    await clickBelow();
    await menu("table");
    await type("Item");
    await press("Tab");
    await type("Count");
    await press("Tab");
    await type("Total");
    await press("Enter");
    await saves("a new table, its names typed in", `${H}:::table name="table1"\n| "Item" | "Count" | ` +
      `"Total" |\n| | | |\n| | | |\n:::\n`);
    await click('#doc td[data-r="0"][data-c="0"]');
    await type("2");
    await press("Tab");
    await type("3");
    await press("Tab");
    await type("=A1*B1");
    await press("Enter");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "6",
      "a formula shows its calculated value");
    check(await js(`(() => {
      const td = document.querySelector('#doc td[data-r="0"][data-c="2"]');
      const r = td.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === td;
    })()`), "and nothing on the page covers it");
    await click('#doc td[data-r="0"][data-c="0"]');
    await type("5");
    await press("Enter");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "15",
      "editing a value calculates the formula again");
    await click('#doc td[data-r="0"][data-c="2"]');
    check(await js("document.activeElement.value") === "=A1*B1", "a formula cell edits its formula");
    await type("=A1+B1");
    await press("Enter");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "8",
      "an edited formula shows its new value");
    await menu("undo");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "15",
      "and undo gives the old formula's value back");
    await click('#doc td[data-r="0"][data-c="0"]');
    await menu("row-above");
    await saves("a row inserted above moves the formula's references with it",
      `${H}:::table name="table1"\n| "Item" | "Count" | "Total" |\n| | | |\n| 5 | 3 | =A2*B2 |\n| | | |\n:::\n`);
    await menu("undo");
    await saves("undo takes the row back out", `${H}:::table name="table1"\n| "Item" | "Count" | ` +
      `"Total" |\n| 5 | 3 | =A1*B1 |\n| | | |\n:::\n`);
    await click('#doc td[data-r="0"][data-c="1"]');
    await menu("column-remove");
    await saves("removing a column turns its references into #REF!",
      `${H}:::table name="table1"\n| "Item" | "Total" |\n| 5 | =A1*#REF! |\n| | |\n:::\n`);
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').textContent") ===
      "#REF!", "and the cell shows the error");
    await menu("undo");
    check(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"2\"]').textContent") === "15",
      "undo brings the column and the value back");
    await click('#doc td[data-r="0"][data-c="2"]');
    await menu("column-right");
    await click('#doc td[data-r="1"][data-c="0"]');
    await menu("row-remove");
    await saves("a column added after the last, and the last row removed",
      `${H}:::table name="table1"\n| "Item" | "Count" | "Total" | "" |\n| 5 | 3 | =A1*B1 | |\n:::\n`);
    await click('#doc td[data-r="0"][data-c="0"]');
    await menu("table-remove");
    await saves("removing the table", "%ksmd 1\n");
    await menu("undo");
    await saves("and undoing that", `${H}:::table name="table1"\n| "Item" | "Count" | "Total" | "" |` +
      `\n| 5 | 3 | =A1*B1 | |\n:::\n`);
  },

  // While a person works in a table, the page draws no caret in the text. No empty line then opens
  // above the table, so the table stays where it is after each action, and the keys act on it.
  async tableCaret() {
    const rows = `| "a" | "b" |\n| 1 | =A1*2 |\n| 2 | |\n| 3 | |\n:::\n\nAfter.\n`;
    const top = () => js("document.querySelector('#doc .table table').getBoundingClientRect().top");
    const cell = (r, c) => js(`document.querySelector('#doc td[data-r="${r}"][data-c="${c}"]').textContent`);
    // Where the keys go: the chosen cell as "row:column", an open cell by its name, or "doc".
    const focus = () => js(`(() => {
      const a = document.activeElement;
      if (a.id === "doc") return "doc";
      if (a.matches("#doc td.chosen")) return a.dataset.r + ":" + a.dataset.c;
      return a.getAttribute("aria-label") || a.tagName;
    })()`);
    // No empty line stands, and the table has not moved.
    const stays = async (what, at) => {
      await settle();
      const now = await top();
      check(await js("!document.querySelector('#doc .gap')") && now === at, what, `${at} -> ${now}`);
    };
    await load(`${H}:::table name="t"\n${rows}`);
    await click('#doc td[data-r="0"][data-c="1"]');
    const at = await top();
    await press("ArrowDown", SHIFT);
    await press("ArrowDown", SHIFT);
    await stays("Shift and an arrow key choose a range, and the table stays where it is", at);
    await press("d", CTRL);
    await stays("a fill down opens no empty line above the table", at);
    check(await cell(2, 1) === "6" && await focus() === "0:1", "and the keys still go to the chosen cell",
      await focus());
    await press("z", CTRL);
    await stays("Ctrl+Z on the chosen cell undoes the fill, and the table stays", at);
    check(await cell(2, 1) === "" && await focus() === "0:1", "and the cell stays chosen", await focus());
    await press("Delete");
    await stays("Delete on a range clears it, and the table stays", at);
    check(await cell(0, 1) === "" && await focus() === "0:1", "and the cell stays chosen", await focus());
    await menu("undo");
    await stays("an undo from the menu leaves the table where it is", at);
    check(await cell(0, 1) === "2" && await focus() === "0:1", "and gives the keys back to the chosen cell",
      await focus());
    await click("#doc tbody tr:nth-child(2) th.row-number");
    await stays("a press on a row number chooses the row, and the table stays", at);
    check(await focus() === "1:0", "and the keys go to its first cell", await focus());
    await press("ArrowDown");
    check(await focus() === "Cell A3", "an arrow key on the chosen cell opens the next one", await focus());
    await press("Escape");
    check(await focus() === "2:0", "Esc in an open cell leaves it chosen", await focus());
    await press("Enter");
    check(await focus() === "Cell A3", "Enter on the chosen cell opens it", await focus());
    await press("Escape");
    await press("7");
    await press("Tab");
    check(await cell(2, 0) === "7", "typing on the chosen cell opens it with that character");
    await stays("and the table stays where it is", at);
    await click('#doc td[data-r="0"][data-c="0"]');
    await type("9");
    await press("Enter");
    await menu("undo");
    await stays("an undo of a cell's edit leaves the table where it is", at);
    check(await cell(0, 0) === "1" && await focus() === "1:0", "and the cell the edit went on to stays chosen",
      await focus());
    await press("Escape");
    check(await focus() === "doc" && await js("!document.querySelector('#doc .chosen')"),
      "Esc on a chosen cell leaves the table for the text", await focus());
    check(await js("!!document.querySelector('#doc .gap') && getSelection().focusNode.closest('.gap') !== null"),
      "and the caret comes back where it stood, on the empty line above the table");
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("Escape");
    await click("#doc p");
    await press("End");
    check(await focus() === "doc" && await js("getSelection().focusNode.parentElement.matches('#doc p')"),
      "a press in the text below takes the caret there", await focus());
    await type("!");
    await saves("and typing goes into the text",
      `${H}:::table name="t"\n${rows.replace("After.", "After.!").replace("| 3 |", "| 7 |")}`);
  },

  // Formulas that choose and total by a condition, typed into cells as a person types them.
  async formulas() {
    await load(`${H}:::table name="t"\n| "item" | "n" | "x" |\n| "Pens" | 2 | |\n| "Ink" | 0 | |\n` +
      `| "pens" | 3 | |\n:::\n`);
    const shown = (r, c) => js(`document.querySelector('#doc td[data-r="${r}"][data-c="${c}"]').textContent`);
    const enter = async (r, c, text) => {
      await click(`#doc td[data-r="${r}"][data-c="${c}"]`);
      await type(text);
      await press("Enter");
    };
    await enter(0, 2, '=if(B1 = 0, "none", 6 / B1)');
    check(await shown(0, 2) === "3", "if takes the branch its condition chooses", await shown(0, 2));
    await enter(1, 2, '=if(B2 = 0, "none", 6 / B2)');
    check(await shown(1, 2) === "none", "and shows its text, not #DIV/0!, when B2 is 0", await shown(1, 2));
    await enter(2, 2, '=sum_if(B1:B3, A1:A3 = "Pens")');
    check(await shown(2, 2) === "5", "sum_if adds the rows whose item is Pens, in any case", await shown(2, 2));
    await enter(1, 1, "4");
    check(await shown(1, 2) === "1.5" && await shown(2, 2) === "5",
      "a changed count takes the other branch, and the total keeps to its rows");
    await enter(1, 2, "=B2 > 3 and A2 <> \"Pens\"");
    check(await shown(1, 2) === "true", "a condition shows true or false", await shown(1, 2));
    await saves("the formulas save as they were typed", `${H}:::table name="t"\n| "item" | "n" | "x" |\n` +
      `| "Pens" | 2 | =if(B1 = 0, "none", 6 / B1) |\n| "Ink" | 4 | =B2 > 3 and A2 <> "Pens" |\n` +
      `| "pens" | 3 | =sum_if(B1:B3, A1:A3 = "Pens") |\n:::\n`);

    // today() is the date the page opened the document. A stand-in clock gives the page its date.
    const clock = (y, m, d) => js(`(() => {
      const Real = window.RealDate || Date;
      window.RealDate = Real;
      const at = () => new Real(${y}, ${m - 1}, ${d}, 12);
      window.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(at().getTime()); }
        static now() { return at().getTime(); }
      };
    })()`);
    const due = `${H}:::table name="t"\n| "due" | "state" |\n| "2031-02-01" | =if(A1 < today(), "late", "") |` +
      `\n| | =today() |\n:::\n`;
    try {
      await clock(2031, 2, 3);
      await load(due);
      check(await shown(1, 1) === "2031-02-03", "today() shows the date the page opened the document",
        await shown(1, 1));
      check(await shown(0, 1) === "late", "and compares with a date typed as text");
      await clock(2031, 2, 4);
      await enter(1, 0, "x");
      check(await shown(1, 1) === "2031-02-03", "it stays the same while the document is open, after an edit",
        await shown(1, 1));
      await load(due);
      check(await shown(1, 1) === "2031-02-04", "and moves at the next opening", await shown(1, 1));
    } finally {
      await js("if (window.RealDate) window.Date = window.RealDate");
    }
  },

  // The menu bar: a press opens a menu, pointing switches while one is open, a flyout opens on
  // pointing, and Esc, a press outside and a chosen command close it. The keys work it too.
  async menus() {
    await load(`${H}one\n`);
    const shown = (sel) => js(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      return !!el && !el.hidden && el.getBoundingClientRect().height > 0;
    })()`);
    const format = '.top-menu:has([data-cmd="strong"])';
    const insert = '.top-menu:has([data-cmd="table"])';
    await click(`${format} > .menu-name`);
    check(await shown(`${format} > .menu`), "a press on a menu's name opens its drop-down menu");
    await point(`${insert} > .menu-name`);
    check(await shown(`${insert} > .menu`) && !await shown(`${format} > .menu`),
      "pointing at another name while a menu is open opens that one instead");
    await press("Escape");
    check(!await shown(`${insert} > .menu`) && await js("document.activeElement.id === 'doc'"),
      "Esc closes it, and the focus is back in the document");
    await click(`${format} > .menu-name`);
    await point(`${format} .sub:has([data-cmd="h2"]) > .sub-name`);
    check(await shown(`${format} .sub:has([data-cmd="h2"]) > .menu`),
      "pointing at a flyout's name opens the flyout beside it");
    const right = await js(`(() => {
      const fly = document.querySelector('${format} .sub:has([data-cmd="h2"]) > .menu').getBoundingClientRect();
      const menu = document.querySelector('${format} > .menu').getBoundingClientRect();
      return fly.left >= menu.right - 2;
    })()`);
    check(right, "and the flyout stands to the right of its menu");
    await clickBelow();
    check(!await shown(`${format} > .menu`), "a press outside closes every menu");
    await select(0, 0, 0, 3);
    await js(`document.querySelector('${format} > .menu-name').focus()`);
    await press("ArrowDown");
    check(await js("document.activeElement.classList.contains('sub-name')"),
      "Down on a menu's name opens it and takes the first item");
    await press("ArrowRight");
    check(await js("document.activeElement.dataset.cmd === 'p'"), "Right opens the flyout and takes its first item");
    await press("ArrowDown");
    await press("ArrowDown");
    await press("Enter");
    await saves("Enter presses the item, on the selection the document had", `${H}## one\n`);
    check(!await shown(`${format} > .menu`), "and the menu closes");
    await click(".top-menu:has([data-cmd='sort-up']) > .menu-name");
    check(await js("document.querySelector('.menubar [data-cmd=\"sort-up\"]').disabled"),
      "with no cell chosen, the table commands cannot be pressed");
    await press("Escape");
  },

  // Moving between cells, sorting and filtering, the right-click menu, and fitting a column.
  async tableTools() {
    const table = (rows) => `${H}:::table name="t"\n| "fruit" | "n" |\n${rows}:::\n`;
    const start = table(`| "pear" | 3 |\n| "fig" | 1 |\n| "apple" | 2 |\n`);
    await load(start);
    const label = () => js("document.activeElement.getAttribute('aria-label')");
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("ArrowRight");
    check(await label() === "Cell B1", "Right moves to the next cell, as Down moves to the next row");
    await press("ArrowLeft");
    check(await label() === "Cell A1", "and Left moves back");
    await type("x");
    await press("ArrowLeft");
    check(await label() === "Cell A1", "after typing, Left moves the caret inside the text first");
    await press("Escape");
    await click('#doc td[data-r="0"][data-c="1"]');
    await menu("sort-up");
    await saves("Table, Sort, ascending orders the rows by the chosen column",
      table(`| "fig" | 1 |\n| "apple" | 2 |\n| "pear" | 3 |\n`));
    await menu("undo");
    await saves("and undo puts them back", start);
    await rightClick('#doc td[data-r="1"][data-c="0"]');
    check(await js("!document.querySelector('.menu.context').hidden"),
      "a right-click on a cell opens the table menu");
    await click('.menu.context [data-cmd="sort-down"]');
    await saves("its Sort descending orders by that cell's column, Z to A",
      table(`| "pear" | 3 |\n| "fig" | 1 |\n| "apple" | 2 |\n`));
    check(await js("document.querySelector('.menu.context').hidden"), "and the menu closes");
    await rightClick('#doc td[data-r="1"][data-c="0"]');
    await click('.menu.context [data-cmd="filter-value"]');
    const visible = () => js("Array.from(document.querySelectorAll('#doc tbody tr')).filter((r) => !r.hidden).length");
    check(await visible() === 1, "Show only rows with this value hides the other rows");
    check(await js("document.querySelector('.filter-note').textContent.startsWith('Showing 1 of 3 rows')"),
      "and a line above the table says how many rows are shown");
    await saves("and the file still holds every row", table(`| "pear" | 3 |\n| "fig" | 1 |\n| "apple" | 2 |\n`));
    await click(".filter-note .filter-clear");
    check(await visible() === 3, "Show all rows shows them again");
    // The column's own panel, as Excel's filter: untick a value and press OK.
    await click('#doc th.name[data-c="0"] .filter-arrow');
    check(await js("!!document.querySelector('.filter-panel') && document.activeElement.type === 'search'"),
      "the arrow in a heading cell opens its column's panel, with the search box ready");
    check(await js("Array.from(document.querySelectorAll('.filter-values label')).map((l) => l.textContent.trim()).join()") ===
      "(Select all),apple,fig,pear", "the panel lists the column's values in sorted order");
    await type("i");
    check(await js("Array.from(document.querySelectorAll('.filter-values label')).filter((l) => !l.hidden).map((l) => l.textContent.trim()).join()") ===
      "(Select all),fig", "typing in the search box narrows the list shown");
    await click(".filter-values label:not([hidden]) input[value='fig']");
    await click(".filter-panel .filter-ok");
    check(await visible() === 2, "unticking fig and pressing OK hides the fig row");
    check(await js("document.querySelector('#doc th.name[data-c=\"0\"] .filter-arrow').classList.contains('on')"),
      "and the column's arrow shows that it is narrowed");
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("ArrowDown");
    check(await label() === "Cell A3", "Down passes over a row the filter hides");
    await press("Escape");
    await click('#doc th.name[data-c="1"] .filter-arrow');
    await click(".filter-panel summary");
    await js(`(() => {
      const op = document.querySelector(".filter-panel select");
      op.value = "above";
      document.querySelector(".filter-panel details input").value = "2";
    })()`);
    await click(".filter-panel .filter-ok");
    check(await visible() === 1, "a condition on a second column narrows further: n is greater than 2");
    await click('#doc th.name[data-c="1"] .filter-arrow');
    await press("Escape");
    check(await js("!document.querySelector('.filter-panel')"), "Esc closes the panel and changes nothing");
    check(await visible() === 1, "so the rows stay as they were");
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("Escape");
    await menu("row-below");
    check(await visible() === 4, "a new row shows every row again, so the new row can be seen");
    await menu("undo");
    await click('#doc td[data-r="0"][data-c="1"]');
    await press("Escape");
    await click('#doc td[data-r="0"][data-c="1"]');
    await press(";", CTRL);
    await press("Enter");
    check(/^\d{4}-\d{2}-\d{2}$/.test(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').textContent")),
      "Ctrl+; in a cell types today's date");
    await click('#doc td[data-r="0"][data-c="1"]');
    await press(":", CTRL | SHIFT);
    await press("Enter");
    check(/^\d{2}:\d{2}$/.test(await js("document.querySelector('#doc td[data-r=\"0\"][data-c=\"1\"]').textContent")),
      "and Ctrl+: the time");
    browser.answerPrompts("Q1 sales");
    await menu("table-rename");
    browser.answerPrompts(null);
    check((await source()).includes(':::table name="Q1 sales"'), "a table can be named with capitals and spaces");
    const narrow = await js("document.querySelector('#doc th.row-number').getBoundingClientRect().width");
    check(narrow < 40, "the row numbers take only the room their digits need", String(narrow));
    check(await js(`getComputedStyle(document.querySelector('#doc th.name')).backgroundColor !==
      getComputedStyle(document.querySelector('#doc th.letter')).backgroundColor`),
      "the heading row of names looks apart from the column letters");
    await load(start);
    const px = (c) => js(`document.querySelectorAll("#doc th.letter")[${c}].getBoundingClientRect().width`);
    const before = await px(0);
    const edge = await js(`(() => {
      const r = document.querySelector('#doc .col-edge').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    await doubleClickAt(edge[0], edge[1]);
    await until(`document.querySelectorAll("#doc th.letter")[0].getBoundingClientRect().width !== ${before}`, 3000);
    const fitted = await px(0);
    const widest = await js(`(() => {
      let w = 0;
      for (const el of document.querySelectorAll('#doc [data-c="0"]')) {
        const s = document.createElement("span");
        s.className = "measure";
        s.textContent = el.textContent;
        el.appendChild(s);
        w = Math.max(w, s.getBoundingClientRect().width);
        s.remove();
      }
      return w;
    })()`);
    check(fitted < before && fitted >= widest, "a double-click on a column's border fits the column " +
      "to its widest value", `${before} -> ${fitted}, widest ${widest}`);
    check(/ widths="/.test(await source()), "and the widths are saved, as a drag saves them");
    await menu("undo");
    const cell = await js(`(() => {
      const r = document.querySelector('#doc td[data-r="0"][data-c="0"]').getBoundingClientRect();
      return [r.right - 2, r.top + r.height / 2];
    })()`);
    await doubleClickAt(cell[0], cell[1]);
    check(await until(`/ widths="/.test(ksmd.source())`, 3000),
      "a double-click on the border between two cells fits the column too");
  },

  // The ribbon, looks on text and cells, and copying and pasting cells as Excel does.
  async ribbon() {
    const pasteInto = (selector, text) => js(`(() => {
      const data = new DataTransfer();
      data.setData("text/plain", ${JSON.stringify(text)});
      document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new ClipboardEvent("paste",
        { clipboardData: data, bubbles: true, cancelable: true }));
    })()`);
    await load(`${H}abcdef\n`);
    await select(0, 0, 1, 4);
    await click('.ribbon .split[data-colour="color"] .apply');
    await saves("the ribbon's font colour colours the selected text", `${H}a[bcd]{color="#c00000"}ef\n`);
    check(await js("getComputedStyle(document.querySelector('#doc span.look')).color") === "rgb(192, 0, 0)",
      "and the page shows the colour");
    await select(0, 0, 0, 6);
    await click('.ribbon .split[data-colour="fill"] .more');
    await click('.palette .swatches button[title="#92d050"]');
    await saves("a colour chosen in the palette fills the selection",
      `${H}[a]{fill="#92d050"}[bcd]{color="#c00000" fill="#92d050"}[ef]{fill="#92d050"}\n`);
    await js(`(() => {
      const size = document.querySelector('.ribbon [data-ribbon="size"]');
      size.value = "14";
      size.dispatchEvent(new Event("change"));
    })()`);
    await select(0, 0, 0, 6);
    await click('.ribbon [data-cmd="look-clear"]');
    await saves("Clear takes colours and sizes away in one step", `${H}abcdef\n`);
    await menu("undo");
    await saves("and one undo gives them back",
      `${H}[a]{fill="#92d050" size=14}[bcd]{color="#c00000" fill="#92d050" size=14}[ef]{fill="#92d050" size=14}\n`);
    await select(0, 0, 0);
    await click('.ribbon [data-cmd="align-center"]');
    check((await source()).startsWith(`${H}{align="center"}\n`), "Centre aligns the paragraph");
    check(await js("document.querySelector('#doc p').style.textAlign") === "center", "and the page shows it");
    check(await js("document.querySelector('.ribbon .table-group').hidden"),
      "the ribbon's Table group stands only while a cell is worked in");

    const table = `${H}:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n| 3 | 4 |\n:::\n`;
    await load(table);
    await click('#doc td[data-r="0"][data-c="0"]');
    check(!await js("document.querySelector('.ribbon .table-group').hidden"), "and stands once a cell is opened");
    // The open cell takes the caret out of the gap above the table, and the gap goes at once.
    // Left to `selectionchange`, which can come a frame later, the table would move up between
    // the measure of the next cell and the press there, and the press would land below the table.
    check(await js("!document.querySelector('#doc .gap')"), "and the gap the caret stood in goes at once");
    await click('#doc td[data-r="1"][data-c="1"]', SHIFT);
    check(await js("document.querySelectorAll('#doc .in-range').length") === 4,
      "Shift+click chooses a range of cells");
    await click('.ribbon .split[data-colour="fill"] .apply');
    await saves("a fill on a range fills every cell of it", `${H}:::table name="t"\n| "a" | "b" |\n` +
      `| 1 {fill="#92d050"} | 2 {fill="#92d050"} |\n| 3 {fill="#92d050"} | 4 {fill="#92d050"} |\n:::\n`);
    check(await js(`getComputedStyle(document.querySelector('#doc td[data-r="0"][data-c="0"]')).backgroundColor`) ===
      "rgb(146, 208, 80)", "and the cells show it");
    await click('.ribbon [data-cmd="align-right"]');
    check((await source()).includes('| 1 {fill="#92d050" align="right"} |'), "Right aligns the range's cells");
    const copied = await js(`(() => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData("text/plain");
    })()`);
    check(copied === "1\t2\r\n3\t4\r\n", "a copy of a range gives tab-separated rows, as Excel takes them",
      JSON.stringify(copied));

    await load(table);
    await click('#doc td[data-r="0"][data-c="0"]');
    await pasteInto('#doc .cell-input', 'Pens\t"1,234.5"\t=A1\r\n"two\nlines"\t\t12%\r\n');
    await saves("cells copied from Excel fill the table from the open cell, which grows",
      `${H}:::table name="t"\n| "a" | "b" | "" |\n| "Pens" | 1234.5 | =A1 |\n| "two\\nlines" | | "12%" |\n:::\n`);
    await menu("undo");
    await saves("and one undo takes the paste away", table);
    await load(`${H}Text\n`);
    await select(0, 0, 4);
    await pasteInto("#doc", "Item\tCount\r\nPens\t2\r\n");
    await saves("cells pasted into text make a new table, the first row its names",
      `${H}Text\n\n:::table name="table1"\n| "Item" | "Count" |\n| "Pens" | 2 |\n:::\n`);
  },

  // Column widths: a drag of the edge between two column letters, and Alt+Left and Alt+Right in a
  // cell. Each is one undo step, and the cells stay as they were.
  // Caution: **Wait for what each event shows** before the next step: a press can be handled after
  // the call that sent it returns, and reading the source takes the open cell, as a save does.
  async widths() {
    const rows = `| "a" | "b" | "c" |\n| 1 | 2 | =A1+B1 |\n:::\n`;
    const weighted = `${H}:::table name="t" widths="1,1,2"\n${rows}`;
    const widths = async () => {
      const m = (await source()).match(/ widths="([0-9,]+)"/);
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
    const openCell = async (column) => {
      await click(`#doc td[data-r="0"][data-c="${column}"]`);
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

    await load(weighted);
    const before = await px(0);
    await resized(() => drag('#doc [data-edge="0"]', 60));
    const dragged = await widths();
    check(dragged.length === 3 && dragged[0] > dragged[1] && dragged[0] + dragged[1] === dragged[2],
      "dragging the edge between A and B gives A width from B, and C keeps its share",
      JSON.stringify(dragged));
    const after = await px(0);
    check(Math.abs(after - before - 60) <= 8, "column A grows by the distance dragged",
      `${before} -> ${after}`);
    await cellsKept("the cells and the formula's value stay as they were");
    await menu("undo");
    await saves("one undo gives the widths before the drag back", weighted);
    await menu("redo");
    await settle();
    check((await widths()).join() === dragged.join(), "and redo the dragged ones again");
    await drag('#doc [data-edge="0"]', 0);
    await settle();
    check((await widths()).join() === dragged.join(),
      "a press on the edge that does not move changes nothing");

    await load(weighted);
    check(await js("document.getElementById('doc').firstElementChild.classList.contains('gap')"),
      "an opened document that starts with a table puts the caret on an empty line above it");
    await openCell(1);
    check(true, "a press on a cell opens it, although the empty line above the table goes");
    await resized(() => press("ArrowRight", ALT));
    check(await until("document.activeElement.getAttribute('aria-label') === 'Cell B1'", 3000),
      "the cell stays open after Alt+Right");
    await resized(() => press("ArrowRight", ALT));
    const more = await widths();
    check(more.length === 3 && more[1] > more[0] && more[0] * 3 === more[1] + more[2],
      "Alt+Right in a cell makes its column wider, from the column on its right",
      JSON.stringify(more));
    await menu("undo");
    await settle();
    const wider = await widths();
    check(wider[1] > wider[0] && more[1] / (more[1] + more[2]) > wider[1] / (wider[1] + wider[2]),
      "each press is one undo step, and a second press makes it wider again", JSON.stringify(wider));
    await openCell(1);
    for (let i = 0; i < 3; i++) await resized(() => press("ArrowLeft", ALT));
    const narrower = await widths();
    check(narrower[1] < narrower[0] && narrower[0] * 3 === narrower[1] + narrower[2],
      "Alt+Left makes it narrower", JSON.stringify(narrower));
    for (let i = 0; i < 4; i++) await menu("undo");
    await saves("undo goes back one press at a time", weighted);
    await openCell(2);
    await resized(() => press("ArrowRight", ALT));
    const last = await widths();
    check(last[2] / (last[1] + last[2]) > 2 / 3 && last[0] * 3 === last[1] + last[2],
      "in the last column, Alt+Right takes the width from the column on its left",
      JSON.stringify(last));
    await cellsKept("the cells stay as they were");

    await load(`${H}:::table name="t"\n${rows}`);
    await resized(() => drag('#doc [data-edge="1"]', -40));
    const made = await widths();
    check(made.length === 3 && made[1] < made[2] && made.every((n) => n >= 1 && n <= 10000),
      "a table without widths takes them at its first resize", JSON.stringify(made));
    await cellsKept("and its cells stay as they were");
    const single = `${H}:::table name="t"\n| "a" |\n| 1 |\n:::\n`;
    await load(single);
    await openCell(0);
    await press("ArrowRight", ALT);
    check(await until("document.getElementById('status').textContent.startsWith('A table with one column')",
      3000), "a table of one column has no width to share, and the page says so");
    await saves("and nothing changes", single);
  },

  // A column's number format: what the cells show, the cell's own number when it opens, undo,
  // the source, and a copy that keeps every digit.
  async numberFormats() {
    const table = `${H}:::table name="t"\n| "a" | "b" |\n| 1234.5 | =A1/10000 |\n| "x" | |\n:::\n`;
    const td = (r, c) => js(`document.querySelector('#doc td[data-r="${r}"][data-c="${c}"]').textContent`);
    await load(table);
    await click('#doc td[data-r="0"][data-c="0"]');
    await press("Escape");
    await menu("format-grouped");
    await saves("Thousands gives the chosen column a format in the source",
      `${H}:::table name="t" formats="grouped:2,"\n| "a" | "b" |\n| 1234.5 | =A1/10000 |\n| "x" | |\n:::\n`);
    check(await td(0, 0) === "1,234.50" && await td(1, 0) === "x",
      "the number shows with a separator and two places; text shows as it is");
    await click('#doc td[data-r="0"][data-c="1"]');
    await press("Escape");
    await menu("format-percent");
    check(await td(0, 1) === "12%" && await td(1, 1) === "", "a formula's result shows as a percent; an empty cell stays empty");
    await menu("format-more");
    check(await td(0, 1) === "12.3%", "More decimal places shows one more");
    browser.answerPrompts("jpy");
    await menu("format-currency");
    browser.answerPrompts(null);
    check(await td(0, 1) === "¥0", "a currency typed in lower case is taken, with the places its money has");
    await menu("undo");
    check(await td(0, 1) === "12.3%", "each change is one step of undo");
    await click('#doc td[data-r="0"][data-c="0"]');
    check(await js("document.querySelector('#doc .cell-input').value") === "1234.5",
      "an open cell edits the number it holds, not the shown text");
    await press("Escape");
    const copied = await js(`(() => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData("text/plain");
    })()`);
    check(copied === "1234.5\r\n", "a copy takes the number as calculated, so no digit is lost", JSON.stringify(copied));
    await menu("format-none");
    await click('#doc td[data-r="0"][data-c="1"]');
    await press("Escape");
    await menu("format-none");
    await saves("General on each column leaves the format out of the source", table);
  },

  async examples() {
    const overview = `${H}# Office supplies\n\n:::table name="budget"\n| "Item" | "Total" |\n` +
      `| "Pens" | 30 |\n| "Sum" | =sum(B1:B1) |\n:::\n\n:::include path="notes.ksmd"\n:::\n\n` +
      `:::image src="cat.png" alt="A cat" caption="Our cat"\n:::\n`;
    await load(overview);
    check(await js("document.querySelector('#doc .include').textContent").then((t) =>
      t.includes("notes.ksmd")), "an include shows as a marked place naming its path");
    check(await js("document.querySelector('#doc figure').textContent").then((t) =>
      t.includes("cat.png") && t.includes("Our cat")), "an image shows its path and caption");
    check(await js("document.querySelector('#doc td[data-r=\"1\"][data-c=\"1\"]').textContent") === "30",
      "a table shows calculated values");
    await saves("opening and saving changes nothing", overview);
    const refused = await js(`ksmd.load("%ksmd 2\\n")`);
    check(!refused.ok && refused.line === 1, "a source the reader refuses is not opened, and its " +
      "place is named");
    await saves("and the open document stays", overview);

    // The examples of the first contract, as they stand in `ksmd/examples/`.
    const example = (name) => fs.readFileSync(new URL(`../../examples/${name}`, import.meta.url), "utf8");
    const cell = (r, c) => js(`document.querySelector('#doc td[data-r="${r}"][data-c="${c}"]').textContent`);
    for (const name of ["overview.ksmd", "notes.ksmd", "literals.ksmd"]) {
      await load(example(name));
      await saves(`the example ${name} opens and saves unchanged`, example(name));
    }
    await load(example("overview.ksmd"));
    check([await cell(0, 3), await cell(1, 3), await cell(2, 3)].join() === "30,10,40",
      "the overview's budget shows D1 30, D2 10 and D3 40");
    await load(example("literals.ksmd"));
    check([await cell(0, 1), await cell(2, 1), await cell(3, 1)].join("|") === "left|right|0012|=1+2",
      "a pipe in quoted text stays in its cell, and 0012 and =1+2 stay text");
    check(await js("document.querySelector('#doc pre').textContent.startsWith(':::include')"),
      "the fenced clause stays code");
  },
};

Object.assign(sections, tools({ page, js, settle, until, press, type, select, click, menu, load, saves }));

try {
  const opened = await page("Page.navigate", { url: pathToFileURL(path.resolve(pageFile)).href });
  // A page that never starts fails once, saying what the browser showed, rather than in every
  // section after it.
  if (opened.errorText || !await until("document.documentElement.dataset.ready === '1'")) {
    const seen = await js("JSON.stringify({ url: location.href, state: document.readyState, " +
      "ready: document.documentElement.dataset.ready, scripts: document.scripts.length })")
      .catch((e) => `unreadable: ${e.message}`);
    verdict.part = "start";
    check(false, "the page opened from a file starts",
      [opened.errorText || "no navigation error", seen, ...page.errors.slice(0, 3)].join("; "));
  } else {
    for (const [name, run] of Object.entries(sections)) {
      verdict.part = name;
      try {
        await run();
      } catch (e) {
        check(false, "the section ran to its end", e.message);
      }
    }
  }
  await served(browser, pageFile, path.join(work, "served"), kssrv);
} finally {
  await browser.close();
}
console.log(verdict.failed === 0 ? "RESULT: ALL PASS" : `RESULT: SOME FAILED (${verdict.failed})`);
process.exit(verdict.failed === 0 ? 0 : 1);
