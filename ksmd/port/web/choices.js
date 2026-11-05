// ksmd page: a column's list of choices, as Excel's Data Validation list does. A cell of such a
// column offers the list while it is typed in (an HTML `datalist`, which narrows as one types), and
// the model refuses a value off the list. A cell that already holds another value is marked.
// A choice can carry colours, as a tag does in Notion or Airtable: the cell that holds it shows
// them, and so does its whole row where the table colours rows by that column (`color_rows`). A
// column's colour rule still stands over them (`rules.js`, painted after).
// The list is saved in the file (`choices` on the table); Table, Columns, Choices... sets it.
"use strict";

// The colours a choice can take by name, as Excel's ready-made styles pair a text and a fill.
const CHOICE_COLOURS = {
  red: ["#9c0006", "#ffc7ce"], yellow: ["#9c5700", "#ffeb9c"], green: ["#006100", "#c6efce"],
  blue: ["#1f4e79", "#ddebf7"], orange: ["#843c0c", "#fbe5d6"], purple: ["#5b2c6f", "#e4dfec"],
  gray: ["#3a3a3a", "#e7e6e6"],
};

function ksmdChoices(ks) {
  const lower = (s) => s.toLowerCase();

  // Paints a cell with a choice's colours; the cell's own look gives way, as to a rule.
  function tint(el, [, color, fill]) {
    if (!color && !fill) return;
    el.style.color = color || "";
    el.style.backgroundColor = fill || "";
    el.classList.add("looked");
  }

  // Notes each column's choices on a rendered table, marks the cells off their list, and paints
  // the choices' colours on their cells, or on their whole rows.
  // `lists` holds each column's choices as [text, colour, fill]; `rows` is the column whose
  // choices colour rows, or -1.
  function mark(wrap, lists, rows) {
    wrap.choices = lists.map((list) => list.map(([text]) => text));
    wrap.choiceColours = lists;
    wrap.rowColours = rows;
    lists.forEach((list, c) => {
      if (list.length === 0) return;
      const byName = new Map(list.map((one) => [lower(one[0]), one]));
      wrap.values.forEach((row, r) => {
        const v = row[c];
        const one = v && v[0] === 2 ? byName.get(lower(String(v[1]))) : undefined;
        const off = v && v.length > 1 && !one;
        const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (!el) return;
        if (off) {
          el.classList.add("off-list");
          el.title = `Not one of this column's choices: ${wrap.choices[c].join(", ")}`;
        }
        if (!one) return;
        if (c === rows) {
          for (const td of el.parentElement.querySelectorAll("td")) tint(td, one);
        } else {
          tint(el, one);
        }
      });
    });
  }

  // Gives an open cell's input its column's list, where it has one.
  function attach(wrap, column, input) {
    const list = wrap.choices && wrap.choices[column];
    if (!list || list.length === 0) return;
    const id = `choices-${wrap.u}-${column}`;
    let box = document.getElementById(id);
    if (!box) {
      box = document.createElement("datalist");
      box.id = id;
      document.body.appendChild(box);
    }
    box.textContent = "";
    for (const one of list) {
      const o = document.createElement("option");
      o.value = one;
      box.appendChild(o);
    }
    input.setAttribute("list", id);
  }

  // The colour named after a choice's last `=`, or null where that text names none. `none` names
  // no colour, and `own` the colours the choice had.
  function named(typed) {
    const at = typed.lastIndexOf("=");
    if (at < 0) return null;
    const name = lower(typed.slice(at + 1).trim());
    return Object.hasOwn(CHOICE_COLOURS, name) || name === "own" || name === "none" ?
      { text: typed.slice(0, at).trim(), name } : null;
  }

  // A choice as the person reads it in the box: its text, then `=` and its colour's name. A choice
  // with no colour whose text ends in `=` and a colour's name takes `=none`, so `written` reads
  // the same text back.
  function shown([text, color, fill]) {
    if (!color && !fill) return named(text) ? `${text}=none` : text;
    const name = Object.keys(CHOICE_COLOURS).find((n) => CHOICE_COLOURS[n][0] === color &&
      CHOICE_COLOURS[n][1] === fill);
    return `${text}=${name || "own"}`;
  }

  // A choice as the file writes it, from what was typed: `Done=green` takes the green pair, and
  // `=own` keeps the colours the choice had. Text after the last `=` that names no colour is part
  // of the choice, as in `1+1=2`.
  function written(typed, was) {
    const n = named(typed);
    if (!n) return typed.trim();
    const { text, name } = n;
    if (name === "none") return text;
    if (name === "own") {
      const old = was.find(([t]) => lower(t) === lower(text));
      if (old) return `${text};${[old[1] && `color:${old[1]}`, old[2] && `fill:${old[2]}`].filter(Boolean).join(" ")}`;
      return text;
    }
    const pair = CHOICE_COLOURS[name];
    return `${text};color:${pair[0]} fill:${pair[1]}`;
  }

  // Asks for the chosen column's choices, separated by commas; nothing clears them.
  function ask(block, column) {
    const wrap = ks.view.blocks()[block];
    const now = (wrap.choiceColours && wrap.choiceColours[column]) || [];
    const typed = window.prompt(`Choices for column ${ks.table.letters(column)}, separated by ` +
      `commas. A colour follows "=": ${Object.keys(CHOICE_COLOURS).join(", ")}, or none. Leave it ` +
      "empty to take any value.", now.map(shown).join(", "));
    if (typed === null) return null;
    const pieces = typed.split(",").filter((p) => p.trim() !== "").map((p) => written(p, now));
    return ks.act("ksmd_web_choices", block, column, ks.put(pieces.join(", ")));
  }

  // Colours the table's rows by the chosen column's choices, or stops where it does so already.
  function rows(block, column) {
    const wrap = ks.view.blocks()[block];
    return ks.act("ksmd_web_row_colors", block, wrap.rowColours === column ? -1 : column);
  }

  ks.handle("column-choices", (_, c) => ask(c.block, c.column), { table: true });
  ks.handle("column-rows", (_, c) => rows(c.block, c.column), { table: true });

  ks.choices = { mark, attach, ask, rows };
}
