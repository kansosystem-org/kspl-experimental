// The page for a person who works with keys alone, or with a screen reader: what a chosen cell
// says, the table as a grid, the keys that reach the menu bar and move through it and the quick
// access bar, that a focused item shows, the keys of the small pop-ups, where the focus goes when
// a panel closes, and the spreadsheet's keys on a chosen or an open cell.
// What a screen reader says is checked by the names, roles and states the page gives; no screen
// reader runs here.
// `keyboard(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, H, SHIFT, cellAt, check, focusOf } from "./drive.mjs";

export function keyboard({ js, until, press, type, click, menu, load, saves, openCell, rightClick }) {
  const table = `${H}Text.\n\n:::table name="stock"\n| "item" | "n" | "price" |\n| "pear" | 3 | =B1*2 |\n` +
    `| "fig" | | 4 |\n| | | |\n| "plum" | 5 | 6 |\n:::\n`;
  const focus = () => focusOf(js);
  // The chosen range as "r1:c1-r2:c2", from the cells marked.
  const range = () => js(`(() => {
    const els = Array.from(document.querySelectorAll('#doc [aria-selected="true"]'));
    if (els.length === 0) return "";
    const rs = els.map((e) => Number(e.dataset.r));
    const cs = els.map((e) => Number(e.dataset.c));
    return Math.min(...rs) + ":" + Math.min(...cs) + "-" + Math.max(...rs) + ":" + Math.max(...cs);
  })()`);
  return {
    // A chosen cell says its value and address, and its formula and note; the table is a grid.
    async cellNames() {
      await load(table);
      check(await js("(() => { const t = document.querySelector('#doc .table table'); " +
        "return [t.getAttribute('role'), t.getAttribute('aria-label'), " +
        "document.querySelector('#doc th.row-number').getAttribute('role'), " +
        "document.querySelector('#doc th.letter').scope].join(' '); })()") === "grid stock rowheader col",
      "a table is a grid named for the table, its row numbers row headers and its letters column headers");
      await click(cellAt(0, 2));
      const said = () => js("[document.activeElement.getAttribute('aria-label'), " +
        "document.activeElement.getAttribute('aria-description') || ''].join(' | ')");
      check(await said() === "6, C1 | Formula =B1*2", "a chosen cell says its value and address, and its formula",
        await said());
      await press("ArrowDown");
      await press("ArrowDown");
      check(await said() === "empty, C3 | ", "an empty cell says so", await said());
      await press("ArrowUp");
      await press("ArrowUp");
      await press("ArrowUp");
      check(await said() === "price, name of column C | ", "a column's name says it is the name", await said());
      check(await js("document.querySelector('#doc th.chosen').getAttribute('aria-selected')") === "true",
        "the chosen cell is selected in the grid");
      await press("ArrowDown");
      await press("ArrowDown", SHIFT);
      await press("ArrowLeft", SHIFT);
      check(await range() === "0:1-1:2", "each cell of a range is selected in the grid", await range());
      check(await until("document.querySelector('.status-said').textContent === 'B1:C2 chosen'", 3000),
        "the status bar says the range to a screen reader, where the focus stays on its first cell");
      await press("Escape");
      check(await until("document.querySelector('.status-said').textContent === ''", 3000) &&
        await range() === "0:2-0:2", "one cell again says nothing there, and is the one selected", await range());
      await press("ArrowLeft");
      await js("window.prompt = () => 'Count again'");
      await menu("note");
      await click(cellAt(1, 0));
      await click(cellAt(0, 1));
      check(await said() === "3, B1 | Note: Count again", "a note goes with the cell", await said());
      check(await until("document.querySelector('.status-note').textContent === 'Note: Count again' && " +
        "!document.querySelector('.status-note').hidden", 3000),
      "and the status bar shows it while the cell is chosen, not on pointing alone");
      await click(cellAt(1, 0));
      check(await until("document.querySelector('.status-note').hidden", 3000), "a cell with none shows none");
    },

    // F10 reaches the menu bar, which is one stop of Tab; the quick access bar is one stop too.
    async menuKeys() {
      await load(table);
      const names = () => js("Array.from(document.querySelectorAll('.menu-names .menu-name'))" +
        ".map((b) => b.tabIndex).join('')");
      check(await js("(() => { const bar = document.querySelector('[role=menubar]'); " +
        "return Array.from(bar.querySelectorAll('button')).filter((b) => !b.closest('.menu'))" +
        ".every((b) => b.getAttribute('role') === 'menuitem') && !bar.contains(document.querySelector('.doc-name')); })()"),
      "the menu bar holds the menus' names as its items, and not the document's name");
      check((await names()).replace(/-1/g, "") === "0", "one name alone is a stop of Tab", await names());
      await click(cellAt(1, 0));
      await press("F10");
      check(await js("document.activeElement.classList.contains('menu-name')"),
        "F10 puts the focus on the menu bar", await focus());
      const first = await js("document.querySelector('.menu-names .menu-name').textContent");
      await press("Home");
      await press("ArrowRight");
      const second = await js("document.activeElement.textContent");
      check(second !== first && await js("document.activeElement.tabIndex === 0") &&
        (await names()).replace(/-1/g, "").length === 1,
        "Right moves to the next name, which becomes the stop of Tab", `${first} ${second}`);
      await press("End");
      check(await js("document.activeElement.textContent") === "Table", "End goes to the last name");
      await press("Home");
      check(await js("document.activeElement.textContent") === first, "Home to the first");
      await press("ArrowUp");
      check(await js("(() => { const a = document.activeElement; const m = a.closest('.menu'); " +
        "const all = Array.from(m.querySelectorAll('button')).filter((b) => !b.disabled && !b.hidden && " +
        "b.closest('.menu') === m); return all[all.length - 1] === a; })()"), "Up opens the menu on its last item");
      await press("Home");
      check(await js("(() => { const a = document.activeElement; const m = a.closest('.menu'); " +
        "return Array.from(m.querySelectorAll('button')).find((b) => !b.disabled && !b.hidden) === a; })()"),
      "Home in a menu goes to its first item");
      await press("Escape");
      check(await focus() === "1:0", "Esc closes the menu, and gives the focus back to the chosen cell",
        await focus());
      await press("F10");
      await press("F10");
      check(await focus() === "1:0", "F10 in the menu bar gives the focus back too", await focus());
      await click(cellAt(1, 0));
      await openCell(cellAt(1, 0));
      await type("x");
      await press("F10");
      await press("Escape");
      check(await focus() === "1:0", "F10 from an open cell, then Esc, gives the focus to that cell", await focus());
      await saves("and the text typed went in as the focus left it", table.replace('"fig"', '"figx"'));

      // The quick access bar: one stop of Tab, with the arrows along it.
      const stops = () => js("Array.from(document.querySelectorAll('.quick button, .quick select'))" +
        ".filter((b) => b.tabIndex === 0).length");
      check(await stops() === 1, "the quick access bar is one stop of Tab", String(await stops()));
      await js("document.querySelector('.quick [tabindex=\"0\"]').focus()");
      const at = () => js("Array.from(document.querySelectorAll('.quick button, .quick select'))" +
        ".filter((b) => !b.disabled).indexOf(document.activeElement)");
      await press("ArrowRight");
      check(await at() === 1 && await js("document.activeElement.tabIndex") === 0 && await stops() === 1,
        "Right moves to the next tool, and the stop goes with it", String(await at()));
      await press("End");
      const last = await js("Array.from(document.querySelectorAll('.quick button, .quick select'))" +
        ".filter((b) => !b.disabled).length - 1");
      check(await at() === last, "End goes to the last tool", `${await at()} ${last}`);
      await press("ArrowRight");
      check(await at() === 0, "Right past the last comes round to the first", String(await at()));
    },

    // The item the keys reach takes the mark's colour (`:focus-visible` in `page.css`). How far
    // it stands out, in both schemes, is the convention gate's (`THEME_PAIR`).
    async focusShows() {
      await load(`${H}one\n`);
      await click("#doc p");
      await press("F10");
      await press("ArrowDown");
      const [bg, ground] = await js("(() => { const a = document.activeElement; " +
        "return [getComputedStyle(a).backgroundColor, getComputedStyle(a.closest('.menu')).backgroundColor]; })()");
      check(await js("document.activeElement.matches('.menu button:focus-visible')") && bg !== ground,
        "the item the keys reach shows its focus apart from the menu", `${bg} ${ground}`);
      await press("Escape");
    },

    // Esc, Cancel and Apply in a side panel give the focus back where it was.
    async panelFocus() {
      await load(table);
      await click(cellAt(0, 1));
      await menu("column-rule");
      check(await until("!!document.querySelector('.rule-panel') && document.querySelector('.rule-panel').contains(document.activeElement)", 3000),
        "Colour by value takes the focus");
      await press("Escape");
      check(!await js("!!document.querySelector('.rule-panel')") && await focus() === "0:1",
        "Esc closes it, and the chosen cell has the focus again", await focus());
      await press("ArrowDown");
      check(await focus() === "1:1", "so the keys go on in the table", await focus());
      await click("#doc p");
      await menu("page-setup");
      check(await until("!!document.querySelector('.settings-panel')", 3000), "Page setup opens");
      await press("Escape");
      check(await focus() === "doc", "Esc closes it, and the text has the focus again", await focus());
    },

    // The small pop-ups take one set of keys (`popup.js`): in a menu, Up, Down, Home and End move,
    // and in each Esc closes it and gives the focus back. Paste Options is checked in `pasting.mjs`.
    async popupKeys() {
      await load(table);
      const label = () => js("(document.activeElement.querySelector('.label') || document.activeElement).textContent");
      const inside = (sel) => js(`!!document.activeElement.closest('${sel}')`);
      await click(cellAt(0, 0));
      await press("F10", SHIFT);
      const first = await label();
      await press("End");
      const last = await label();
      await press("Home");
      check(last !== first && await label() === first && await inside(".menu.context"),
        "in the right-click menu, End goes to the last item and Home to the first", `${first} ${last}`);
      await press("ArrowUp");
      check(await label() === last, "and Up from the first comes round to the last", await label());
      await press("Escape");
      check(await focus() === "0:0", "Esc closes it, and the cell has the focus again", await focus());

      await click(".zoom-level");
      await press("End");
      const least = await label();
      await press("Home");
      const most = await label();
      check(await inside(".status-menu") && least !== most, "in the zoom's menu, Home and End go to the first and " +
        "last steps", `${most} ${least}`);
      await press("Escape");
      check(await js("!document.querySelector('.status-menu') && document.activeElement.matches('.zoom-level')"),
        "Esc closes it, and the zoom's level has the focus again");

      await click("#doc p");
      await rightClick('.quick [data-cmd="find"]');
      check(await inside(".quick-offer"), "a right-click on a tool opens its menu, its first item in focus");
      await press("ArrowDown");
      const second = await label();
      await press("Home");
      const one = await label();
      await press("End");
      check(second === "Choose tools…" && one.startsWith("Remove") && await label() === second,
        "Down, Home and End move through the quick access bar's menu", `${one} ${second}`);
      await press("Escape");
      check(await js("!document.querySelector('.quick-offer')") && await focus() === "doc",
        "Esc closes it, and the text has the focus again", await focus());
      // A menu opened at a point near the window's bottom keeps off its edge.
      await js("document.querySelector('.quick [data-cmd=\"find\"]').dispatchEvent(new MouseEvent('contextmenu', " +
        "{ bubbles: true, cancelable: true, clientX: 10, clientY: innerHeight - 2 }))");
      check(await js("document.querySelector('.quick-offer').getBoundingClientRect().bottom <= innerHeight - 8"),
        "a menu opened at the window's foot ends 8 pixels above it");
      await press("Escape");

      await click('.quick .split[data-colour="color"] .more');
      check(await inside(".palette"), "the colour's arrow opens its palette, with the focus in it");
      await press("Escape");
      check(await js("!document.querySelector('.palette')") && await focus() === "doc",
        "Esc closes the palette, and the text has the focus again", await focus());

      await click('#doc th.name[data-c="0"] .filter-arrow');
      check(await inside(".filter-panel"), "a column's arrow opens its filter, with the focus in it");
      await press("Escape");
      check(await js("!document.querySelector('.filter-panel') && " +
        "!!document.activeElement.closest('#doc th.name[data-c=\"0\"]')"),
      "Esc closes the filter, and the column's name has the focus", await focus());
    },

    // The spreadsheet's keys on a chosen or an open cell.
    async cellKeys() {
      await load(table);
      await openCell(cellAt(2, 1));
      await type("7");
      await press("Enter", SHIFT);
      check(await focus() === "1:1", "Shift+Enter in an open cell takes it and moves up", await focus());
      await saves("and the value went in", table.replace('| "fig" | | 4 |\n| | | |', '| "fig" | | 4 |\n| | 7 | |'));
      await press("z", CTRL);
      await click(cellAt(0, 0));
      await press("ArrowDown", CTRL);
      check(await focus() === "1:0", "Ctrl+Down goes to the last value before an empty cell", await focus());
      await press("ArrowDown", CTRL);
      check(await focus() === "3:0", "and again to the next value", await focus());
      await press("ArrowDown", CTRL);
      check(await focus() === "3:0", "and stays at the table's edge", await focus());
      await press("ArrowUp", CTRL);
      check(await focus() === "1:0", "Ctrl+Up goes back over the empty cell", await focus());
      await press("ArrowUp", CTRL);
      check(await focus() === "-1:0", "and up to the names", await focus());
      await click(cellAt(1, 0));
      await press("ArrowRight", CTRL);
      check(await focus() === "1:2", "Ctrl+Right passes over an empty cell to the next value", await focus());
      await press("Home");
      check(await focus() === "1:0", "Home goes to the row's first column", await focus());
      await press("End");
      check(await focus() === "1:2", "End to its last", await focus());
      await press("Home", CTRL);
      check(await focus() === "0:0", "Ctrl+Home goes to the first data cell under the names", await focus());
      await press("End", CTRL);
      check(await focus() === "3:2", "Ctrl+End to the last row's last cell", await focus());
      await press("Home", CTRL | SHIFT);
      check(await range() === "0:0-3:2" && await focus() === "3:2", "Shift with Ctrl+Home reaches there as a range",
        await range());
      await click(cellAt(1, 1));
      await press("ArrowDown", CTRL | SHIFT);
      check(await range() === "1:1-3:1", "Ctrl+Shift+Down reaches the next value", await range());
      await click(cellAt(1, 1));
      await press(" ", SHIFT);
      check(await range() === "1:0-1:2", "Shift+Space chooses the row", await range());
      await saves("and types nothing", table);
      await click(cellAt(1, 1));
      await press(" ", CTRL);
      check(await range() === "0:1-3:1", "Ctrl+Space chooses the column's data cells", await range());

      // Ctrl+Z and Esc in a cell typed into give its value back.
      await click(cellAt(0, 0));
      await type("kiwi");
      await press("z", CTRL);
      check(await focus() === "0:0" && await js(`document.querySelector('${cellAt(0, 0)}').textContent`) === "pear",
        "Ctrl+Z in a cell typed into gives its value back, and the cell stays chosen", await focus());
      await saves("and nothing changed", table);
      await type("kiwi");
      await press("Escape");
      check(await focus() === "0:0" && await js(`document.querySelector('${cellAt(0, 0)}').textContent`) === "pear",
        "Esc does the same", await focus());
      await press("z", CTRL);
      await saves("a Ctrl+Z on the chosen cell after it undoes nothing that was not done", table);

      // A new formula with the same value leaves no box behind: its table is not drawn again.
      await click(cellAt(0, 2));
      await type("=3*2");
      await press("Enter");
      check(await js("document.querySelectorAll('#doc .cell-input').length") === 0 &&
        await js(`document.querySelector('${cellAt(0, 2)}').textContent`) === "6",
      "a formula typed over one of the same value closes its cell");
      await saves("and goes in", table.replace("=B1*2", "=3*2"));
      await press("z", CTRL);

      // Tab moves on along the rows, and past the last cell adds a row.
      await click(cellAt(0, 2));
      await press("Tab");
      check(await focus() === "1:0", "Tab past a row's last cell goes to the next row's first", await focus());
      await press("Tab", SHIFT);
      check(await focus() === "0:2", "Shift+Tab comes back", await focus());
      await click(cellAt(3, 1));
      await press("Tab");
      await type("9");
      await press("Tab");
      check(await focus() === "4:0", "Tab past the last cell adds a row and goes into it", await focus());
      await saves("the new row stands at the table's end", table.replace('| "plum" | 5 | 6 |\n', '| "plum" | 5 | 9 |\n| | | |\n'));
      await press("z", CTRL);
      await saves("one undo takes the row away", table.replace('| "plum" | 5 | 6 |\n', '| "plum" | 5 | 9 |\n'));
    },

    // An image with no alt text only decorates, and is not read as its file's name.
    async altText() {
      await load(`${H}:::image src="a.png" alt=""\n:::\n\n:::image src="b.png" alt="A chart"\n:::\n`);
      const roles = await js("Array.from(document.querySelectorAll('#doc .image')).map((el) => " +
        "`${el.getAttribute('role')}:${el.getAttribute('aria-label')}`).join(' ')");
      check(roles === "null:null img:A chart", "an image without alt text gives no name; one with it is named by it",
        roles);
    },
  };
}
