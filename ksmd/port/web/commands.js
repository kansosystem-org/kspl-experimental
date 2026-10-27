// ksmd page: every command once, with its name, its key and its icon. The menu bar, the table's
// right-click menu, the quick access bar and its chooser are all built from these lists, so a
// command's name, key and icon cannot differ between them.
// Caution: **Add a command here, and nowhere else.** A command that stands in no menu cannot be
// found, and one listed twice drifts apart.
"use strict";

// Each command: [name, label, key]. The key is the one the page already acts on; the item shows it.
const COMMANDS = [
  ["file-open", "Open…", "Ctrl+O"], ["file-save", "Save", "Ctrl+S"],
  ["file-save-as", "Save as…", "Ctrl+Shift+S"], ["print", "Print or save as PDF…", "Ctrl+P"],
  ["undo", "Undo", "Ctrl+Z"], ["redo", "Redo", "Ctrl+Y"],
  ["find", "Find…", "Ctrl+F"], ["replace", "Replace…", "Ctrl+H"],
  ["contents", "Contents"], ["width-full", "Full width"], ["width-reading", "Reading width"],
  ["read-only", "Read-only"], ["quick-choose", "Quick access bar…"],
  ["table", "Table"], ["divider", "Divider"], ["link", "Link…", "Ctrl+K"],
  ["date", "Today's date", "Ctrl+;"], ["time", "Time now", "Ctrl+:"],
  ["p", "Paragraph"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"],
  ["h4", "Heading 4"], ["h5", "Heading 5"], ["h6", "Heading 6"], ["c", "Code block"],
  ["quote", "Quote"],
  ["strong", "Strong", "Ctrl+B"], ["emphasis", "Emphasis", "Ctrl+I"], ["code", "Inline code", "Ctrl+E"],
  ["color", "Font colour…"], ["fill", "Fill colour…"],
  ["size-default", "Default size"], ["size-9", "9 pt"], ["size-10", "10 pt"], ["size-11", "11 pt"],
  ["size-12", "12 pt"], ["size-14", "14 pt"], ["size-18", "18 pt"], ["size-24", "24 pt"],
  ["look-clear", "Clear format"],
  ["align-left", "Align left"], ["align-center", "Centre"], ["align-right", "Align right"],
  ["bullets", "Bulleted list"], ["numbers", "Numbered list"], ["checks", "Checklist"],
  ["indent", "Indent", "Tab"], ["outdent", "Outdent", "Shift+Tab"],
  ["row-above", "Insert row above"], ["row-below", "Insert row below"], ["row-remove", "Remove row"],
  ["column-left", "Insert column left"], ["column-right", "Insert column right"],
  ["column-remove", "Remove column"], ["column-fit", "Fit column width"],
  ["column-choices", "Choices…"], ["column-rule", "Colour by value…"],
  ["fill-down", "Fill down", "Ctrl+D"], ["fill-right", "Fill right", "Ctrl+R"],
  ["sort-up", "Sort ascending (A to Z, 0 to 9)"], ["sort-down", "Sort descending"],
  ["filter-column", "Filter this column…", "Alt+↓"], ["filter-value", "Show only rows with this value"],
  ["filter-clear", "Show all rows"],
  ["format-none", "General: as calculated", "Ctrl+Shift+~"], ["format-number", "Number: 1234.50"],
  ["format-grouped", "Thousands: 1,234.50", "Ctrl+Shift+!"], ["format-percent", "Percent: 12%", "Ctrl+Shift+%"],
  ["format-currency", "Currency…", "Ctrl+Shift+$"], ["format-more", "More decimal places"],
  ["format-fewer", "Fewer decimal places"], ["format-date", "Date: 2026-10-26"],
  ["format-date-slash", "Date: 2026/10/26"],
  ["group-rows", "Group rows", "Alt+Shift+→"], ["ungroup-rows", "Ungroup rows", "Alt+Shift+←"],
  ["group-hide", "Hide detail"], ["group-show", "Show detail"],
  ["autosum-sum", "Sum", "Alt+="], ["autosum-average", "Average"], ["autosum-count", "Count numbers"],
  ["autosum-max", "Max"], ["autosum-min", "Min"],
  ["note", "Note…", "Shift+F2"], ["note-resolve", "Resolve note"],
  ["table-rename", "Rename table…"], ["table-chart", "Insert chart"], ["table-csv", "Export as CSV"],
  ["table-print", "Leave out of print"], ["table-remove", "Remove table"],
];
const COMMAND = new Map(COMMANDS.map(([name, label, key]) => [name, { label, key }]));

// The table's commands, in groups, as the Table menu and the right-click menu both show them. A
// group marked `true` is a flyout, so the menu fits a laptop's screen; Excel's cell menu holds Sort
// and Filter as flyouts too. Rows, Columns and Note stay open, as the most used.
const TABLE_GROUPS = [
  ["Rows", ["row-above", "row-below", "row-remove"]],
  ["Columns", ["column-left", "column-right", "column-remove", "column-fit", "column-choices",
    "column-rule"]],
  ["Fill", ["fill-down", "fill-right"], true],
  ["Sort", ["sort-up", "sort-down"], true],
  ["Filter", ["filter-column", "filter-value", "filter-clear"], true],
  ["Number format", ["format-none", "format-number", "format-grouped", "format-percent",
    "format-currency", "format-more", "format-fewer", "format-date", "format-date-slash"], true],
  ["Group", ["group-rows", "ungroup-rows", "group-hide", "group-show"], true],
  ["AutoSum", ["autosum-sum", "autosum-average", "autosum-count", "autosum-max", "autosum-min"], true],
  ["Note", ["note", "note-resolve"]],
  ["Table", ["table-rename", "table-chart", "table-csv", "table-print", "table-remove"], true],
];

// The menu bar: each menu's name and its items. "-" is a line between groups, and [name, items] a
// flyout. Every command stands in one of them, so the quick access bar's chooser lists them all.
const MENUS = [
  ["File", ["file-open", "file-save", "file-save-as", "-", "print"]],
  ["Edit", ["undo", "redo", "-", "find", "replace"]],
  ["View", ["contents", "-", "width-full", "width-reading", "-", "read-only", "-", "quick-choose"]],
  ["Insert", ["table", "divider", "link", "-", "date", "time", "-", "note"]],
  ["Format", [["Kind of block", ["p", "h1", "h2", "h3", "h4", "h5", "h6", "c"]], "-",
    "strong", "emphasis", "code", "-", "color", "fill",
    ["Font size", ["size-default", "size-9", "size-10", "size-11", "size-12", "size-14", "size-18", "size-24"]],
    "look-clear", "-", "align-left", "align-center", "align-right", "-",
    "bullets", "numbers", "checks", "quote", "indent", "outdent"]],
  ["Table", TABLE_GROUPS.flatMap(([name, items, nested], k) =>
    [...(k > 0 && !(nested && TABLE_GROUPS[k - 1][2]) ? ["-"] : []), ...(nested ? [[name, items]] : items)])],
];

// How a View choice shows that it is on: a tick, or a dot among choices that exclude each other.
const CHECKED = { contents: "menuitemcheckbox", "read-only": "menuitemcheckbox",
  "width-full": "menuitemradio", "width-reading": "menuitemradio" };

// The quick access bar's tools that are not commands: two lists to choose a kind or a size from.
const QUICK_LISTS = [["kind-list", "Kind of block list"], ["size-list", "Font size list"]];

// What the quick access bar holds until a person chooses: saving, undo, and the most used looks.
const QUICK_DEFAULT = ["file-save", "undo", "redo", "find", "kind-list", "strong", "emphasis",
  "color", "fill", "align-left", "align-center", "align-right", "bullets", "table", "autosum-sum"];

// Each command's icon: the inside of a 16 by 16 drawing in the colour of the text. Lines are drawn
// by default; `class="f"` fills a shape, and a <text> is a letter or a figure.
const T = (text, size = 9, extra = "", y = size >= 11 ? 13.5 : 11.5) =>
  `<text x="8" y="${y}" text-anchor="middle" font-size="${size}" ${extra}>${text}</text>`;
const GRID = "M2 3h12v10H2z M2 6.5h12 M6 3v10 M10 3v10";
const FUNNEL = "M2 3h12l-4.5 5v5l-3-1.5V8z";
const LINES = (xs) => xs.map(([x1, x2], k) => `M${x1} ${3 + k * 3.5}h${x2 - x1}`).join(" ");
const ICONS = {
  "file-open": `<path d="M1.5 4h4.5l1.5 1.5h6.5v8h-12.5z"/>`,
  "file-save": `<path d="M2.5 2.5h9l2 2v9h-11z M5 2.5v3h5.5v-3 M4.5 13.5v-4h7v4"/>`,
  "file-save-as": `<path d="M2.5 2.5h8l2 2v3 M2.5 2.5v11h5 M5 2.5v3h4.5v-3 M9 14.5l.5-2 4-4 1.5 1.5-4 4z"/>`,
  print: `<path d="M4.5 6V2.5h7V6 M4.5 11.5h-2v-5.5h11v5.5h-2 M4.5 9.5h7v4.5h-7z"/>`,
  undo: `<path d="M5 3.5L2 6.5l3 3 M2 6.5h7.5a3.5 3.5 0 0 1 0 7H6"/>`,
  redo: `<path d="M11 3.5l3 3-3 3 M14 6.5H6.5a3.5 3.5 0 0 0 0 7H10"/>`,
  find: `<circle cx="6.5" cy="6.5" r="4"/><path d="M9.5 9.5l4.5 4.5"/>`,
  replace: `<path d="M2 5h9l-2.5-2.5 M14 11H5l2.5 2.5"/>`,
  contents: `<path d="M2 3h1.5 M5.5 3h8.5 M2 6.5h1.5 M5.5 6.5h8.5 M3.5 10h1.5 M7 10h7 M3.5 13.5h1.5 M7 13.5h7"/>`,
  "width-full": `<path d="M1.5 2.5v11 M14.5 2.5v11 M4 8h8 M6 6l-2 2 2 2 M10 6l2 2-2 2"/>`,
  "width-reading": `<path d="M4.5 2.5v11 M11.5 2.5v11 M6.5 5h3 M6.5 8h3 M6.5 11h3"/>`,
  "read-only": `<path d="M3.5 7.5h9v6.5h-9z M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5"/>`,
  "quick-choose": `<path d="M2 4h12 M2 8h12 M2 12h12"/><circle class="f" cx="5" cy="4" r="1.6"/><circle class="f" cx="11" cy="8" r="1.6"/><circle class="f" cx="7" cy="12" r="1.6"/>`,
  table: `<path d="${GRID}"/>`,
  divider: `<path d="M1.5 8h13 M4 4.5h8 M4 11.5h8"/>`,
  link: `<path d="M7 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-1 1 M9 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l1-1"/>`,
  date: `<path d="M2.5 3.5h11v10h-11z M2.5 6.5h11 M5.5 2v3 M10.5 2v3"/><path class="f" d="M5 9h2v2H5z"/>`,
  time: `<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>`,
  p: T("¶", 16),
  h1: T("H1", 8), h2: T("H2", 8), h3: T("H3", 8), h4: T("H4", 8), h5: T("H5", 8), h6: T("H6", 8),
  c: `<path d="M5.5 4L2 8l3.5 4 M10.5 4L14 8l-3.5 4"/>`,
  quote: T("“", 24, "", 20),
  strong: T("B", 15, 'font-weight="bold"'),
  emphasis: T("I", 15, 'font-style="italic" font-family="serif"'),
  code: `<path d="M5 5L2 8l3 3 M11 5l3 3-3 3 M9.5 4l-3 8"/>`,
  color: T("A", 13, 'font-weight="bold"', 11) + `<path class="f swatch-color" d="M2 12.5h12v2.5H2z"/>`,
  fill: `<path d="M3 7.5l4.5-4.5 4.5 4.5-4.5 4.5z M12 9.5s1.5 1.5 1.5 2.5a1.5 1.5 0 0 1-3 0c0-1 1.5-2.5 1.5-2.5"/>` +
    `<path class="f swatch-fill" d="M2 13.5h12v2H2z"/>`,
  "size-default": T("A", 13), "size-9": T("9"), "size-10": T("10", 8), "size-11": T("11", 8),
  "size-12": T("12", 8), "size-14": T("14", 8), "size-18": T("18", 8), "size-24": T("24", 8),
  "look-clear": `<path d="M9 2.5l4.5 4.5-6 6.5H4.5l-2-2z M6 6l4.5 4.5 M7.5 13.5h6"/>`,
  "align-left": `<path d="${LINES([[2, 14], [2, 10], [2, 14], [2, 10]])}"/>`,
  "align-center": `<path d="${LINES([[2, 14], [4, 12], [2, 14], [4, 12]])}"/>`,
  "align-right": `<path d="${LINES([[2, 14], [6, 14], [2, 14], [6, 14]])}"/>`,
  bullets: `<circle class="f" cx="3" cy="4" r="1.3"/><circle class="f" cx="3" cy="8" r="1.3"/><circle class="f" cx="3" cy="12" r="1.3"/><path d="M6 4h8 M6 8h8 M6 12h8"/>`,
  numbers: `<text x="0.5" y="6" font-size="5.5">1</text><text x="0.5" y="10" font-size="5.5">2</text><text x="0.5" y="14" font-size="5.5">3</text><path d="M6 4h8 M6 8h8 M6 12h8"/>`,
  checks: `<path d="M1.5 2.5h4v4h-4z M1.5 9.5h4v4h-4z M2.5 11.5l1 1 1.5-2.5 M8 4.5h6 M8 11.5h6"/>`,
  indent: `<path d="M7 3h7 M7 8h7 M7 13h7 M2 5.5l3 2.5-3 2.5"/>`,
  outdent: `<path d="M7 3h7 M7 8h7 M7 13h7 M5 5.5L2 8l3 2.5"/>`,
  "row-above": `<path d="M2 8.5h12v5H2z M8 1.5v5 M5.5 4L8 1.5 10.5 4"/>`,
  "row-below": `<path d="M2 2.5h12v5H2z M8 9.5v5 M5.5 12L8 14.5 10.5 12"/>`,
  "row-remove": `<path d="M2 5.5h12v5H2z M5.5 6.5l5 3 M10.5 6.5l-5 3"/>`,
  "column-left": `<path d="M8.5 2h5v12h-5z M1.5 8h5 M4 5.5L1.5 8 4 10.5"/>`,
  "column-right": `<path d="M2.5 2h5v12h-5z M9.5 8h5 M12 5.5l2.5 2.5-2.5 2.5"/>`,
  "column-remove": `<path d="M5.5 2h5v12h-5z M6.5 5.5l3 5 M9.5 5.5l-3 5"/>`,
  "column-fit": `<path d="M2 2v12 M14 2v12 M4.5 8h7 M6.5 6l-2 2 2 2 M9.5 6l2 2-2 2"/>`,
  "column-choices": `<path d="M2.5 2.5h11v11h-11z M5 6l3 3 3-3"/>`,
  "column-rule": `<path class="f" d="M2 3h4v4H2z"/><path d="M2 9h4v4H2z M10 3h4v4h-4z"/><path class="f" d="M10 9h4v4h-4z"/>`,
  "fill-down": `<path d="M3 2.5h10v3H3z M8 7v7 M5 11l3 3 3-3"/>`,
  "fill-right": `<path d="M2.5 3h3v10h-3z M7 8h7 M11 5l3 3-3 3"/>`,
  "sort-up": `<text x="1" y="7" font-size="6">A</text><text x="1" y="14.5" font-size="6">Z</text><path d="M12 14V2.5 M9.5 5L12 2.5 14.5 5"/>`,
  "sort-down": `<text x="1" y="7" font-size="6">Z</text><text x="1" y="14.5" font-size="6">A</text><path d="M12 2v11.5 M9.5 11L12 13.5 14.5 11"/>`,
  "filter-column": `<path d="${FUNNEL}"/>`,
  "filter-value": `<path class="f" d="${FUNNEL}"/>`,
  "filter-clear": `<path d="M1.5 3h9l-3.5 4v5l-2-1V7z M10.5 9.5l4 4 M14.5 9.5l-4 4"/>`,
  "format-none": T("123", 7),
  "format-number": T("0.0", 7.5),
  "format-grouped": T("1,0", 7.5),
  "format-percent": T("%", 13),
  "format-currency": T("¤", 14),
  "format-more": `<text x="0.5" y="7" font-size="6">.0</text><text x="6" y="14.5" font-size="6">.00</text><path d="M1.5 12h3 M3.5 10.5l1.5 1.5-1.5 1.5"/>`,
  "format-fewer": `<text x="0.5" y="7" font-size="6">.00</text><text x="8" y="14.5" font-size="6">.0</text><path d="M7 12H3.5 M5 10.5L3.5 12 5 13.5"/>`,
  "format-date": `<path d="M2.5 3.5h11v10h-11z M2.5 6.5h11 M5.5 2v3 M10.5 2v3 M6 10h4"/>`,
  "format-date-slash": `<path d="M2.5 3.5h11v10h-11z M2.5 6.5h11 M5.5 2v3 M10.5 2v3 M9.5 8.5l-3 3.5"/>`,
  "group-rows": `<path d="M3 2v12 M3 2h2 M3 14h2 M7.5 4h6.5 M7.5 8h6.5 M7.5 12h6.5"/>`,
  "ungroup-rows": `<path d="M3 2v4 M3 10v4 M3 2h2 M3 14h2 M7.5 4h6.5 M7.5 8h6.5 M7.5 12h6.5"/>`,
  "group-hide": `<path d="M2.5 2.5h11v11h-11z M5 8h6"/>`,
  "group-show": `<path d="M2.5 2.5h11v11h-11z M5 8h6 M8 5v6"/>`,
  "autosum-sum": T("Σ", 14),
  "autosum-average": T("x̄", 14, 'font-style="italic" font-family="serif"'),
  "autosum-count": T("#", 13),
  "autosum-max": `<path d="M8 13.5V3 M4.5 6.5L8 3l3.5 3.5 M3 13.5h10"/>`,
  "autosum-min": `<path d="M8 2.5V13 M4.5 9.5L8 13l3.5-3.5 M3 2.5h10"/>`,
  note: `<path d="M2 2.5h12v8.5H7l-3.5 3v-3H2z"/>`,
  "note-resolve": `<path d="M2 2.5h12v8.5H7l-3.5 3v-3H2z M5 6.5l2 2 4-4"/>`,
  "table-rename": `<path d="M1.5 4h8v8h-8z M5.5 4v8 M10.5 13.5l.5-2 3-3 1.5 1.5-3 3z"/>`,
  "table-chart": `<path d="M2 14h12 M2 2v12"/><path class="f" d="M4 9h2.5v5H4z M7.5 5h2.5v9H7.5z M11 7.5h2.5V14H11z"/>`,
  "table-csv": `<path d="M3 1.5h7l3 3v10H3z M10 1.5v3h3"/>${T("CSV", 4.5, "", 11.5)}`,
  "table-print": `<path d="M4.5 6V2.5h7V6 M4.5 11.5h-2v-5.5h11v5.5h-2 M4.5 9.5h7v4.5h-7z M1.5 1.5l13 13"/>`,
  "table-remove": `<path d="${GRID} M9 9l5.5 5.5 M14.5 9L9 14.5"/>`,
  "kind-list": T("¶", 16),
  "size-list": T("A", 8) + `<text x="9" y="12.5" font-size="11">A</text>`,
};

// Makes a command's icon. An icon that is missing shows as an empty square, so a test finds it.
function ksmdIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "glyph");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] || '<path d="M2.5 2.5h11v11h-11z"/>';
  return svg;
}
