// ksmd page: a column's list of choices, as Excel's Data Validation list does. A cell of such a
// column offers the list while it is typed in (an HTML `datalist`, which narrows as one types), and
// the model refuses a value off the list. A cell that already holds another value is marked.
// The list is saved in the file (`choices` on the table); Table, Columns, Choices... sets it.
"use strict";

function ksmdChoices(ks) {
  const lower = (s) => s.toLowerCase();

  // Notes each column's choices on a rendered table, and marks the cells off their list.
  function mark(wrap, lists) {
    wrap.choices = lists;
    lists.forEach((list, c) => {
      if (list.length === 0) return;
      const allowed = new Set(list.map(lower));
      wrap.values.forEach((row, r) => {
        const v = row[c];
        const off = v && v.length > 1 && !(v[0] === 2 && allowed.has(lower(String(v[1]))));
        const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (el && off) {
          el.classList.add("off-list");
          el.title = `Not one of this column's choices: ${list.join(", ")}`;
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

  // Asks for the chosen column's choices, separated by commas; nothing clears them.
  function ask(block, column) {
    const wrap = ks.view.blocks()[block];
    const now = (wrap.choices && wrap.choices[column]) || [];
    const typed = window.prompt(`Choices for column ${ks.table.letters(column)}, separated by ` +
      "commas. Leave it empty to take any value.", now.join(", "));
    if (typed === null) return null;
    return ks.act("ksmd_web_choices", block, column, ks.put(typed));
  }

  ks.choices = { mark, attach, ask };
}
