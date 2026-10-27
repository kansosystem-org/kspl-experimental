// The page's menus and quick access bar, and the table's own tools: moving between cells, sorting,
// filtering, the right-click menu, fitting a column, looks, copying and pasting, and removing a
// whole block. Each is driven through the browser's own input events, as `main.mjs` drives the
// rest, and checked by the saved source and its undo.
// `menus(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, SHIFT, verdict } from "./drive.mjs";

const H = "%ksmd 1\n\n";
const check = (ok, what, detail) => verdict.check(ok, what, detail);

export function menus({ browser, js, until, press, type, select, click, clickBelow, menu, point,
  rightClick, doubleClickAt, dragTo, load, saves, source, openCell }) {
  return {
  // The menu bar: a press opens a menu, pointing switches while one is open, a flyout opens on
  // pointing, and Esc, a press outside and a chosen command close it. The keys work it too.
  async menus() {
    await load(`${H}one\n`);
    const shown = (sel) => js(`(() => {
      const el = document.querySelector(${JSON.stringify(sel)});
      return !!el && !el.hidden && el.getBoundingClientRect().height > 0;
    })()`);
    const names = await js("Array.from(document.querySelectorAll('.menubar .top-menu:not([hidden]) > .menu-name'))" +
      ".map((b) => b.textContent).join(' ')");
    check(names === "File Edit View Insert Format Table",
      "opened from a file, the menu bar holds File (for Print), Edit, View, Insert, Format and Table", names);
    const missing = await js("Array.from(document.querySelectorAll('.menubar .menu [data-cmd], .menubar .sub-name'))" +
      ".filter((b) => !b.querySelector('svg.glyph path, svg.glyph text, svg.glyph circle')).map((b) => b.textContent)");
    check(missing.length === 0, "every item of every menu carries its icon", missing.join(", "));
    const table = await js("Array.from(document.querySelectorAll('.menu.context [data-cmd]')).map((b) => b.dataset.cmd).join(' ')");
    const tableMenu = await js("Array.from(document.querySelectorAll('.top-menu:has([data-cmd=\"row-above\"]) [data-cmd]'))" +
      ".map((b) => b.dataset.cmd).join(' ')");
    check(table.length > 0 && table === tableMenu, "the Table menu holds the right-click menu's commands", tableMenu);
    const edit = '.top-menu:has([data-cmd="find"])';
    const view = '.top-menu:has([data-cmd="contents"])';
    await click(`${edit} > .menu-name`);
    check(await shown(`${edit} > .menu`), "a press on a menu's name opens its drop-down menu");
    await point(`${view} > .menu-name`);
    check(await shown(`${view} > .menu`) && !await shown(`${edit} > .menu`),
      "pointing at another name while a menu is open opens that one instead");
    await press("Escape");
    check(!await shown(`${view} > .menu`) && await js("document.activeElement.id === 'doc'"),
      "Esc closes it, and the focus is back in the document");
    await click(`${edit} > .menu-name`);
    await clickBelow();
    check(!await shown(`${edit} > .menu`), "a press outside closes every menu");
    await select(0, 0, 0);
    await js(`document.querySelector('${view} > .menu-name').focus()`);
    await press("ArrowDown");
    check(await js("document.activeElement.dataset.cmd === 'contents'"),
      "Down on a menu's name opens it and takes the first item");
    await press("Enter");
    check(await shown(".contents") && !await shown(`${view} > .menu`), "Enter presses the item, and the menu closes");
    await menu("contents");
    await saves("no menu changes the document", `${H}one\n`);
  },

  // Moving between cells, sorting and filtering, the right-click menu, and fitting a column.
  async tableTools() {
    const table = (rows) => `${H}:::table name="t"\n| "fruit" | "n" |\n${rows}:::\n`;
    const start = table(`| "pear" | 3 |\n| "fig" | 1 |\n| "apple" | 2 |\n`);
    await load(start);
    const label = () => js("document.activeElement.getAttribute('aria-label')");
    const chosen = (r, c) => js(`document.activeElement.matches('#doc td.chosen[data-r="${r}"][data-c="${c}"] > .cell-catch')`);
    await openCell('#doc td[data-r="0"][data-c="0"]');
    await press("ArrowRight");
    check(await chosen(0, 1), "Right at the end of an open cell's text moves on to the next cell");
    await press("ArrowLeft");
    check(await chosen(0, 0), "and Left on a chosen cell moves back");
    await press("F2");
    await type("x");
    await press("ArrowLeft");
    check(await label() === "Cell A1", "in an open cell, Left moves the caret inside the text first");
    await press("Escape");
    await click('#doc td[data-r="0"][data-c="1"]');
    await menu("sort-up");
    await saves("the right-click menu's Sort ascending orders the rows by the chosen column",
      table(`| "fig" | 1 |\n| "apple" | 2 |\n| "pear" | 3 |\n`));
    await menu("undo");
    await saves("and undo puts them back", start);
    await rightClick('#doc td[data-r="1"][data-c="0"]');
    check(await js("!document.querySelector('.menu.context').hidden"),
      "a right-click on a cell opens the table menu");
    await click('.menu.context .sub:has([data-cmd="sort-down"]) > .sub-name');
    await click('.menu.context [data-cmd="sort-down"]');
    await saves("its Sort descending orders by that cell's column, Z to A",
      table(`| "pear" | 3 |\n| "fig" | 1 |\n| "apple" | 2 |\n`));
    check(await js("document.querySelector('.menu.context').hidden"), "and the menu closes");
    await rightClick('#doc td[data-r="1"][data-c="0"]');
    await click('.menu.context .sub:has([data-cmd="filter-value"]) > .sub-name');
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
    check(await js("document.activeElement.matches('#doc td.chosen[data-r=\"2\"][data-c=\"0\"] > .cell-catch')"),
      "Down passes over a row the filter hides");
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
    await menu("row-below");
    check(await visible() === 4, "a new row shows every row again, so the new row can be seen");
    await menu("undo");
    await click('#doc td[data-r="0"][data-c="1"]');
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

  // The quick access bar, looks on text and cells, and copying and pasting cells as Excel does.
  async quickBar() {
    const pasteInto = (selector, text) => js(`(() => {
      const data = new DataTransfer();
      data.setData("text/plain", ${JSON.stringify(text)});
      document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new ClipboardEvent("paste",
        { clipboardData: data, bubbles: true, cancelable: true }));
    })()`);
    await load(`${H}abcdef\n`);
    // A right-click on a menu's item adds it to the bar, and the chooser takes it off again. The
    // choice is kept in this browser.
    const onBar = (cmd) => js(`!!document.querySelector('.quick [data-cmd="${cmd}"]')`);
    check(!await onBar("divider"), "the bar starts without Divider");
    const tools = () => js("Array.from(document.querySelectorAll('.quick > *')).map((e) => " +
      "e.classList.contains('sep') ? '|' : e.dataset.cmd || e.dataset.colour || e.dataset.quick).join(' ')");
    check(await tools() === "undo redo find | table | kind-list strong emphasis color fill align-left align-center " +
      "align-right bullets | autosum-sum", "the bar keeps the menus' order, a line between two menus' tools, " +
      "and no Save where the menu has none", await tools());
    await click('.top-menu:has([data-cmd="divider"]) > .menu-name');
    await rightClick('.menubar [data-cmd="divider"]');
    await click(".quick-offer button");
    check(await onBar("divider") && await js("JSON.parse(localStorage.getItem('ksmd.quick')).includes('divider')"),
      "a right-click on a menu's item adds it to the bar, and this browser keeps the choice");
    check((await tools()).includes("| table divider |"), "where its menu puts it, whenever it was added",
      await tools());
    await select(0, 0, 6);
    await click('.quick [data-cmd="divider"]');
    check((await source()).includes("---"), "and its tool on the bar runs it", await source());
    await menu("undo");
    await menu("quick-choose");
    check(await js("document.querySelector('.quick-choose').open && " +
      "document.querySelector('.quick-choose input[value=\"divider\"]').checked"),
      "View, Quick access bar opens the chooser, with the bar's tools ticked");
    await click('.quick-choose input[value="divider"]');
    check(!await onBar("divider"), "taking the tick away takes the tool off the bar");
    await js("document.querySelector('.quick-choose input[value=\"table-csv\"]').scrollIntoView({ block: 'center' })");
    await click('.quick-choose input[value="table-csv"]');
    check(await onBar("table-csv"), "and any command can be put on it");
    await click(".quick-choose .quick-buttons button");
    check(!await onBar("table-csv"), "Reset brings back the tools the bar starts with");
    await click(".quick-choose .quick-buttons button:last-child");
    check(!await js("document.querySelector('.quick-choose').open"), "and Close closes the chooser");
    // The bar shows what stands at the caret, as Word's does.
    await load(`${H}# T*odo*\n\nab **cd** ef\n\n\`\`\`\ncode\n\`\`\`\n`);
    const pressed = (cmd) => js(`document.querySelector('.quick [data-cmd="${cmd}"]').getAttribute('aria-pressed') === 'true'`);
    const kind = () => js("document.querySelector('.quick [data-quick=\"kind-list\"]').value");
    const state = (k, cmd) => until(`document.querySelector('.quick [data-quick="kind-list"]').value === '${k}' && ` +
      `document.querySelector('.quick [data-cmd="${cmd}"]').getAttribute('aria-pressed') === 'true'`);
    await select(0, 0, 3);
    check(await state("h1", "emphasis") && !await pressed("strong"),
      "in an italic word of a heading, the kind list shows Heading 1 and Emphasis is pressed in",
      `${await kind()} ${await pressed("emphasis")}`);
    await select(1, 0, 4);
    check(await state("p", "strong") && !await pressed("emphasis"), "in a strong word of a paragraph, Strong is");
    await select(1, 0, 1, 7);
    check(await until("document.querySelector('.quick [data-cmd=\"strong\"]').getAttribute('aria-pressed') === 'false'"),
      "over text only part of which is strong, Strong is not pressed in");
    await select(2, 0, 2);
    check(await until("document.querySelector('.quick [data-quick=\"kind-list\"]').value === 'c'") &&
      await js("document.querySelector('.quick [data-cmd=\"strong\"]').disabled && " +
        "document.querySelector('.menubar [data-cmd=\"emphasis\"]').disabled"),
      "in a code block, which holds literal text, the marks cannot be pressed");
    await select(0, 0, 1);
    check(await until("!document.querySelector('.quick [data-cmd=\"strong\"]').disabled"),
      "and in a heading they can");

    // Clear takes a text's colour away, and an alignment or a list pressed again turns off.
    await load(`${H}a[bcd]{color="#c00000"}ef\n`);
    await select(0, 0, 0, 6);
    await menu("look-clear");
    await saves("in text, Clear takes the colour away too", `${H}abcdef\n`);
    await select(0, 0, 1);
    await click('.quick [data-cmd="align-center"]');
    await saves("Centre centres the paragraph", `${H}{align="center"}\nabcdef\n`);
    await click('.quick [data-cmd="align-center"]');
    await saves("and Centre pressed again takes the alignment off, as in Excel and Word", `${H}abcdef\n`);
    await menu("bullets");
    await saves("Bulleted list makes a list item", `${H}- abcdef\n`);
    await menu("bullets");
    await saves("and pressed again, a paragraph", `${H}abcdef\n`);
    await load(`${H}:::table name="t"\n| "a" |\n| 1 |\n:::\n`);
    await click('#doc td[data-r="0"][data-c="0"]');
    await click('.quick [data-cmd="align-right"]');
    await saves("Right aligns the chosen cell", `${H}:::table name="t"\n| "a" |\n| 1 {align="right"} |\n:::\n`);
    await click('.quick [data-cmd="align-right"]');
    await saves("and pressed again takes the cell's alignment off", `${H}:::table name="t"\n| "a" |\n| 1 |\n:::\n`);

    await load(`${H}abcdef\n`);
    await select(0, 0, 1, 4);
    check(await js("document.querySelector('.quick [data-colour=\"fill\"] .apply').disabled && " +
      "document.querySelector('.menubar [data-cmd=\"size-14\"]').disabled"),
    "in text, the fill and size tools cannot be pressed: they act on table cells");
    await click('.quick [data-colour="color"] .apply');
    await saves("the font colour colours the selected text", `${H}a[bcd]{color="#c00000"}ef\n`);
    check(await js("getComputedStyle(document.querySelector('#doc span.coloured')).color") === "rgb(192, 0, 0)",
      "and the page shows it in that colour");
    await menu("undo");
    await select(0, 0, 0);
    await click('.quick [data-cmd="align-center"]');
    check((await source()).startsWith(`${H}{align="center"}\n`), "Centre aligns the paragraph");
    check(await js("document.querySelector('#doc p').style.textAlign") === "center", "and the page shows it");
    await menu("look-clear");
    await saves("in text, Clear takes the alignment away", `${H}abcdef\n`);

    const table = `${H}:::table name="t"\n| "a" | "b" |\n| 1 | 2 |\n| 3 | 4 |\n:::\n`;
    await load(table);
    await click('#doc td[data-r="0"][data-c="0"]');
    // The open cell takes the caret out of the gap above the table, and the gap goes at once.
    // Left to `selectionchange`, which can come a frame later, the table would move up between
    // the measure of the next cell and the press there, and the press would land below the table.
    check(await js("!document.querySelector('#doc .gap')"), "and the gap the caret stood in goes at once");
    await click('#doc td[data-r="1"][data-c="1"]', SHIFT);
    check(await js("document.querySelectorAll('#doc .in-range').length") === 4,
      "Shift+click chooses a range of cells");
    await click('.quick .split[data-colour="fill"] .more');
    await click('.palette .swatches button[title="#92d050"]');
    await saves("a colour chosen in the palette fills every cell of the range", `${H}:::table name="t"\n| "a" | "b" |\n` +
      `| 1 {fill="#92d050"} | 2 {fill="#92d050"} |\n| 3 {fill="#92d050"} | 4 {fill="#92d050"} |\n:::\n`);
    check(await js(`getComputedStyle(document.querySelector('#doc td[data-r="0"][data-c="0"]')).backgroundColor`) ===
      "rgb(146, 208, 80)", "and the cells show it");
    await click('.quick [data-cmd="align-right"]');
    check((await source()).includes('| 1 {fill="#92d050" align="right"} |'), "Right aligns the range's cells");
    const sizes = await js("Array.from(document.querySelectorAll('.menubar [data-cmd^=\"size-\"]'))" +
      ".map((b) => b.dataset.cmd.slice(5)).filter((v) => /^\\d/.test(v)).join(' ')");
    check(sizes === "9 10 11 12 14 18 24", "Format, Font size offers the few sizes people choose", sizes);
    await menu("size-14");
    check((await source()).includes('| 4 {fill="#92d050" size=14 align="right"} |'), "and a size sizes the range's cells");
    const copied = await js(`(() => {
      const data = new DataTransfer();
      document.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData("text/plain");
    })()`);
    check(copied === "1\t2\r\n3\t4\r\n", "a copy of a range gives tab-separated rows, as Excel takes them",
      JSON.stringify(copied));

    await load(table);
    await openCell('#doc td[data-r="0"][data-c="0"]');
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

  // Whole blocks removed by their button, a range dragged across cells, the page's width, and the
  // right-click menu's flyouts.
  async blocksAndView() {
    await load(`${H}One\n\n:::include path="notes.ksmd"\n:::\n\n:::image src="a.png" alt=""\n:::\n\nTwo\n`);
    await click("#doc .include .block-remove");
    await saves("an include's Remove button takes the include out, with no text editor",
      `${H}One\n\n:::image src="a.png" alt=""\n:::\n\nTwo\n`);
    await click("#doc .figure .block-remove");
    await saves("and an image's", `${H}One\n\nTwo\n`);
    await menu("undo");
    await menu("undo");
    check((await source()).includes(':::include path="notes.ksmd"'), "undo brings them back");

    await load(`${H}:::table name="t"\n| "a" | "b" | "c" |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n:::\n`);
    // A first press takes the gap above the table away, so the table stands still for the drag.
    await click('#doc td[data-r="0"][data-c="0"]');
    await dragTo('#doc td[data-r="0"][data-c="0"]', '#doc td[data-r="1"][data-c="1"]');
    check(await js("document.querySelectorAll('#doc .in-range').length") === 4,
      "a drag across cells chooses the range between them, as in a spreadsheet");
    check(await js("!document.querySelector('#doc .cell-input')"), "and leaves no cell open");
    await rightClick('#doc td[data-r="0"][data-c="0"]');
    check(await js("!!document.querySelector('.menu.context .sub > .sub-name')"),
      "the right-click menu holds Number format as a flyout");
    await point(".menu.context .sub > .sub-name");
    check(await js("!document.querySelector('.menu.context .sub > .menu').hidden"),
      "which opens on pointing");
    await press("Escape");

    const width = () => js("document.getElementById('doc').getBoundingClientRect().width");
    const full = await width();
    await menu("width-reading");
    const reading = await width();
    check(reading < full, "View, Reading width keeps lines short", `${full} -> ${reading}`);
    await menu("width-full");
    check(await width() === full, "and Full width fills the window again");
    check(await js("document.querySelectorAll('.quick [data-cmd^=\"align-\"] svg').length") === 3,
      "each alignment tool draws its own lines");
  },

  // Each table and format command that no other check presses, pressed once from its menu where
  // it can act: it must change the source.
  async everyCommand() {
    const table = `${H}:::table name="t" formats=",number:2"\n| "a" | "b" |\n| 1 | 2 |\n| 3 | 4 |\n| | |\n:::\n`;
    const grouped = `${H}:::table name="t" groups="rows 2-3"\n| "n" |\n| 1 |\n| 2 |\n| 3 |\n:::\n`;
    const cell = (r, c) => click(`#doc td[data-r="${r}"][data-c="${c}"]`);
    const twoRows = async () => {
      await cell(0, 0);
      await press("ArrowDown", SHIFT);
    };
    // Show detail acts on a hidden row, which only the menu bar reaches.
    const fromBar = async (cmd) => {
      const own = `[data-cmd="${cmd}"]`;
      await click(`.top-menu:has(${own}) > .menu-name`);
      await click(`.menubar .sub:has(${own}) > .sub-name`);
      await click(`.menubar ${own}`);
    };
    const cases = [
      ["format-number", table, () => cell(0, 0)],
      ["format-fewer", table, () => cell(0, 1)],
      ["column-left", table, () => cell(0, 0)],
      ["group-show", grouped, async () => {
        await cell(1, 0);
        await menu("group-hide");
      }, fromBar],
      ["autosum-average", table, twoRows],
      ["autosum-count", table, twoRows],
      ["autosum-min", table, twoRows],
      ...["9", "10", "11", "12", "18", "24"].map((n) => [`size-${n}`, table, () => cell(0, 0)]),
      ["size-default", table, async () => {
        await cell(0, 0);
        await menu("size-9");
      }],
      ...["h3", "h4", "h5", "h6"].map((h) => [h, `${H}Text.\n`, () => select(0, 0, 2)]),
    ];
    for (const [cmd, start, ready, how = menu] of cases) {
      await load(start);
      await ready();
      const before = await source();
      await how(cmd);
      const after = await source();
      check(after !== before, `${cmd} changes the document`, JSON.stringify(after));
    }
  },

  };
}
