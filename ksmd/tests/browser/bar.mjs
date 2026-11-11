// The formula bar: the chosen cell's address and whole text, and the same edit as the cell's,
// typed in the bar. Enter, Esc, the list of functions, the closing brackets and the marked pair
// act there as in the cell. It is a stop of Tab, and it takes no edit where none is allowed.
// A table drawn again while the bar holds the edit is checked with the served page
// (`redraws.mjs`), whose drawing comes at a known moment.
// `formulaBar(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { H, SHIFT, cellAt, check } from "./drive.mjs";

const LONG = '=if(A1 = "1F", "a long text that runs well past the room the formula bar holds in one line", ' +
  '"another text, long enough to wrap onto a third line of the bar")';
const DOC = `${H}Text.\n\n:::table name="t"\n| "a" | "b" | "c" |\n| "1F" | =hex_to_dec(A1) | 3 |\n` +
  `| "2E" | =hex_to_dec(A2) | ${LONG} |\n:::\n`;

export function formulaBar({ js, settle, until, press, type, click, menu, load, saves }) {
  const BOX = ".formula-bar .formula-input";
  const bar = () => js(`(() => { const b = document.querySelector('${BOX}'); return { address: ` +
    "document.querySelector('.formula-address').textContent, text: b.value, readOnly: b.readOnly, " +
    "focused: document.activeElement === b, editing: document.querySelector('.formula-bar').classList" +
    ".contains('editing'), mirror: (document.querySelector('#doc .cell-mirror') || { value: null }).value, " +
    "label: b.getAttribute('aria-label') }; })()");
  // Waits until the bar shows `address`, and gives what it shows.
  const showing = async (address) => {
    await until(`document.querySelector('.formula-address').textContent === ${JSON.stringify(address)}`, 3000);
    return bar();
  };
  // Presses the bar's box: the chosen cell opens for editing there.
  const intoBar = async () => {
    await click(BOX);
    await until(`document.activeElement === document.querySelector('${BOX}')`, 3000);
    await settle();
  };
  const lineHeight = 18;

  return {
    // The chosen cell's address and its whole text, as Excel's name box and formula bar show them.
    async formulaBarShows() {
      await load(DOC);
      await click(cellAt(0, 1));
      let b = await showing("B1");
      check(b.text === "=hex_to_dec(A1)" && !b.readOnly, "a chosen cell shows its address and its formula as typed",
        JSON.stringify(b));
      await click("#doc th.name[data-c=\"1\"]");
      b = await showing("B name");
      check(b.text === "b", "a column's name cell shows its column and the name", JSON.stringify(b));
      await click(cellAt(0, 1));
      await press("ArrowDown", SHIFT);
      await press("ArrowRight", SHIFT);
      b = await showing("B1:C2");
      check(b.text === "" && b.readOnly, "a range shows its address, and the box takes no edit", JSON.stringify(b));
      await press("Escape");
      await click(cellAt(1, 2));
      b = await showing("C2");
      const tall = await js(`document.querySelector('${BOX}').getBoundingClientRect().height`);
      check(b.text === LONG && tall < 2 * lineHeight, "a long formula stands whole in the box, on one line",
        `${tall}px; ${b.text}`);
      check(await js("!document.querySelector('.status-bar .status-address, .status-bar .status-content')"),
        "the status bar no longer repeats the chosen cell");
      await click("#doc p");
      b = await showing("");
      check(b.text === "" && b.readOnly, "in the text, the bar shows no cell and takes no edit", JSON.stringify(b));
    },

    // A press in the bar opens the chosen cell there; the cell shows a copy of what is typed.
    async formulaBarEdit() {
      await load(DOC);
      await click(cellAt(0, 2));
      await showing("C1");
      await intoBar();
      await press("End");
      await type("+1");
      await settle();
      let b = await bar();
      check(b.focused && b.editing && b.text === "3+1" && b.mirror === "3+1" && b.label === "Formula bar, Cell C1",
        "a press in the bar opens the chosen cell there, and the cell shows what is typed", JSON.stringify(b));
      await press("Enter");
      await saves("Enter takes the text typed in the bar", DOC.replace("| 3 |", '| "3+1" |'));
      b = await showing("C2");
      check(!b.focused && !b.editing && await js("!!document.querySelector('#doc td.chosen[data-r=\"1\"][data-c=\"2\"]')"),
        "and the next cell down is chosen, the keys back on the table", JSON.stringify(b));
      await click(cellAt(0, 0));
      await showing("A1");
      await intoBar();
      await type("x");
      await press("Escape");
      await saves("Esc drops the edit typed in the bar", DOC.replace("| 3 |", '| "3+1" |'));
      b = await bar();
      check(!b.focused && b.text === "1F" && await js("document.getElementById('doc').contains(document.activeElement)"),
        "and the focus goes back to the cell", JSON.stringify(b));
      // An edit open in the cell moves into the bar with its text.
      await click(cellAt(0, 2));
      await type("7");
      await intoBar();
      await type("8");
      b = await bar();
      check(b.text === "78" && b.mirror === "78", "an edit open in the cell moves into the bar with its text",
        JSON.stringify(b));
      await press("Tab");
      await saves("Tab takes it, as in the cell", DOC.replace("| 3 |", "| 78 |"));
    },

    // The list of functions, the closing brackets and the marked pair act in the bar as in the cell.
    async formulaBarHelp() {
      await load(DOC);
      await click(cellAt(0, 2));
      await showing("C1");
      await intoBar();
      await js(`document.querySelector('${BOX}').select()`);
      await type("=hex_to_d");
      await settle();
      const offered = await js("Array.from(document.querySelectorAll('.fx-list:not([hidden]) .fx-name'))" +
        ".map((e) => e.textContent).join()");
      check(offered === "hex_to_dec", "letters typed in the bar open the list of functions", offered);
      await press("Tab");
      await type("A2");
      await settle();
      const marked = () => js("Array.from(document.querySelectorAll('.formula-field .cell-copy:not([hidden]) " +
        ".ref-text, .formula-field .cell-copy:not([hidden]) .bracket-pair')).map((e) => e.textContent).join()");
      check((await bar()).text === "=hex_to_dec(A2" && await marked() === "A2",
        "Tab writes the name in the bar, and the reference typed there takes its colour", await marked());
      await press("Enter");
      await saves("Enter closes the formula typed in the bar", DOC.replace("| 3 |", "| =hex_to_dec(A2) |"));
      await click(cellAt(0, 2));
      await showing("C1");
      await intoBar();
      await press("End");
      check(await marked() === "(,A2,)", "the caret beside a bracket in the bar marks the pair", await marked());
      await press("Escape");
    },

    // A long formula wraps in the bar while it is edited there, and scrolls past eight lines.
    async formulaBarLong() {
      await load(DOC);
      await click(cellAt(1, 2));
      await showing("C2");
      await intoBar();
      const [tall, most, scrolls] = await js(`(() => { const b = document.querySelector('${BOX}'); ` +
        "return [b.getBoundingClientRect().height, parseFloat(getComputedStyle(b).maxHeight), " +
        "b.scrollWidth <= b.clientWidth]; })()");
      check(tall > 2 * lineHeight && tall <= most && scrolls,
        "a long formula wraps onto several lines while it is edited in the bar", `${tall}px of ${most}px`);
      await press("Escape");
      // The bar puts a fresh box in place once it is shown again after the edit.
      await until(`!document.querySelector('.formula-bar').classList.contains('editing')`, 3000);
      const back = await js(`document.querySelector('${BOX}').getBoundingClientRect().height`);
      check(back < 2 * lineHeight, "and the bar is one line again once the edit ends", `${back}px`);
    },

    // The bar is a stop of Tab after the quick access bar, and names the cell it edits.
    async formulaBarKeys() {
      await load(DOC);
      await click(cellAt(0, 1));
      await showing("B1");
      await press("F10");
      await press("Tab");
      await press("Tab");
      await until(`document.activeElement === document.querySelector('${BOX}')`, 3000);
      await settle();
      const b = await bar();
      check(b.focused && b.editing && b.mirror === "=hex_to_dec(A1)" && b.label === "Formula bar, Cell B1",
        "F10, then Tab twice, reaches the bar after the quick access bar, open on the chosen cell", JSON.stringify(b));
      check(await js(`(() => { const b = document.querySelector('${BOX}'); ` +
        "return b.selectionStart === b.value.length && b.selectionEnd === b.value.length; })()"),
      "the caret stands at the end, as F2 puts it");
      await press("Escape");
      check(await js("document.getElementById('doc').contains(document.activeElement)"),
        "Esc gives the keys back to the cell");
    },

    // Where no edit is allowed, the bar shows the text and takes no edit.
    async formulaBarReadOnly() {
      await load(DOC);
      await menu("read-only");
      await click(cellAt(0, 1));
      await showing("B1");
      await click(BOX);
      await settle();
      await type("9");
      const b = await bar();
      check(b.readOnly && !b.editing && b.mirror === null && b.text === "=hex_to_dec(A1)",
        "in Read-only the bar shows the formula and takes no edit", JSON.stringify(b));
      await menu("read-only");
      await saves("and nothing changes", DOC);
    },
  };
}
