// ksmd page: AutoSum, as Excel's Σ button and Alt+= give it. In one chosen cell it types a sum
// of the column above, or of the row to the left where nothing stands above, and leaves the cell
// open with the range selected, so Enter takes it and typing changes it. The range takes the
// whole column above: `sum` leaves out empty cells and text, so a gap never cuts it short and the
// names' row never joins it. With a range chosen, each column gets its total under its numbers.
"use strict";

function ksmdAutosum(ks) {
  const FUNCTIONS = { "autosum-sum": "sum", "autosum-average": "average", "autosum-count": "count",
    "autosum-max": "max", "autosum-min": "min" };
  const wrapOf = (block) => ks.view.blocks()[block];
  const isNumber = (v) => !!v && v[0] === 1;
  const isEmpty = (v) => !v || v[0] === 0;
  const at = (column, row) => `${ks.table.letters(column)}${row + 1}`;

  function one(c, fn) {
    const values = wrapOf(c.block).values;
    let range = "";
    if (values.slice(0, c.row).some((row) => isNumber(row[c.column]))) {
      range = `${at(c.column, 0)}:${at(c.column, c.row - 1)}`;
    } else if (values[c.row].slice(0, c.column).some(isNumber)) {
      range = `${at(0, c.row)}:${at(c.column - 1, c.row)}`;
    }
    const text = `=${fn}(${range})`;
    ks.table.openWith(c.block, c.row, c.column, text, fn.length + 2, text.length - 1);
    return null;
  }

  // The totals go in the range's last row where it is empty, or else in the row under the range,
  // which the table gains where it ends. A row under it that holds a value is never written over.
  function many(r, fn) {
    const values = wrapOf(r.block).values;
    const first = Math.max(r.r1, 0);
    const columns = Array.from({ length: r.c2 - r.c1 + 1 }, (_, k) => r.c1 + k);
    const lastEmpty = r.r2 > first && columns.every((c) => isEmpty(values[r.r2][c]));
    const target = lastEmpty ? r.r2 : r.r2 + 1;
    const end = lastEmpty ? r.r2 - 1 : r.r2;
    if (target < values.length && !columns.every((c) => isEmpty(values[target][c]))) {
      ks.say("The row under the range holds values. Choose the range with an empty row below its numbers.");
      return null;
    }
    const row = columns.map((c) => (values.slice(first, end + 1).some((line) => isNumber(line[c])) ?
      `=${fn}(${at(c, first)}:${at(c, end)})` : ""));
    if (row.every((t) => t === "")) {
      ks.say("The range holds no numbers to total.");
      return null;
    }
    return ks.act("ksmd_web_paste_cells", r.block, target, r.c1, ks.put(JSON.stringify([row])));
  }

  ks.autosum = {
    run(name, c) {
      const fn = FUNCTIONS[name];
      const r = ks.range.any() ? ks.range.rect() : null;
      if (r && r.r2 >= 0) return many(r, fn);
      if (r || c.row < 0) {
        ks.say("AutoSum puts a total in a row of values, not among the names.");
        return null;
      }
      return one(c, fn);
    },
  };
}
