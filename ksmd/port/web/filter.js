// ksmd page: filtering a table from its heading, as Excel's filter does. Each name in the heading
// row carries an arrow; pressing it opens a panel under that column. The panel holds sorting, a
// search box, the column's values each with a tick box, a condition folded away, and OK and
// Cancel.
// A filter is a way of looking, held by the page: the file keeps every row, nothing is undone, and
// it lasts until it is cleared or the page closes. Each column holds one condition, and a row shows
// when it meets every column's. A formula counts every row, shown or not.
// Typing in the search box narrows the list shown and never unticks a value. Values differing only
// in case are one value, since the matching ignores case. The row being edited stays in sight until
// the edit is taken.
"use strict";

// The most values the panel lists; past it, the panel says so.
const FILTER_LIST_CAP = 1000;

function ksmdFilter(ks) {
  // Each table's conditions, by the table's name: a Map from a column to
  // { values: Set of lower-case texts } or { op, arg }.
  const filters = new Map();
  // A cell's value as the table shows it, and how it sorts: numbers, dates, text, false and true,
  // errors, then blanks. A number in a column with a number format carries the text the format
  // shows, third. A date is written `2026-10-23`, so its text sorts by day.
  const shownText = (v) => (v.length > 2 ? v[2] :
    v.length > 1 ? (v[0] === 1 ? String(Number(v[1].toPrecision(15))) : v[1]) : "");
  const group = (v) => [5, 0, 2, 4, 3, 1][v[0]];
  function compare(a, b) {
    if (group(a) !== group(b)) return group(a) - group(b);
    if (a[0] === 1) return a[1] - b[1];
    const x = shownText(a).toLowerCase();
    const y = shownText(b).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }

  const OPS = [["is", "is"], ["not", "is not"], ["contains", "contains"], ["above", "is greater than"],
    ["below", "is less than"], ["empty", "is empty"], ["filled", "is not empty"]];

  function meets(cond, v) {
    const text = shownText(v).toLowerCase();
    if (cond.values) return cond.values.has(text);
    const arg = cond.arg.toLowerCase();
    const number = Number(cond.arg);
    const numeric = v[0] === 1 && cond.arg.trim() !== "" && Number.isFinite(number);
    switch (cond.op) {
      case "is": return text === arg;
      case "not": return text !== arg;
      case "contains": return text.includes(arg);
      case "above": return numeric ? v[1] > number : text > arg;
      case "below": return numeric ? v[1] < number : text < arg;
      case "empty": return text === "";
      default: return text !== "";
    }
  }

  // Hides the rows a table's conditions do not meet, marks each narrowed column's arrow, and says
  // how many rows are shown.
  function apply(wrap) {
    const conds = filters.get(wrap.dataset.name);
    const rows = Array.from(wrap.querySelector("tbody").rows);
    const block = ks.view.blocks().indexOf(wrap);
    const kept = ks.table.editing();
    let shown = 0;
    rows.forEach((tr, r) => {
      let ok = true;
      if (conds) for (const [c, cond] of conds) if (!meets(cond, wrap.values[r][c])) ok = false;
      // A hidden group's rows stay hidden whatever the filter shows.
      if (wrap.folded && wrap.folded[r]) ok = false;
      if (kept && kept.block === block && kept.row === r) ok = true;
      tr.hidden = !ok;
      if (ok) shown += 1;
    });
    for (const arrow of wrap.querySelectorAll(".filter-arrow")) {
      arrow.classList.toggle("on", !!conds && conds.has(Number(arrow.dataset.c)));
    }
    let note = wrap.querySelector(".filter-note");
    if (!conds) {
      if (note) note.remove();
      return;
    }
    if (!note) {
      note = document.createElement("div");
      note.className = "filter-note";
      wrap.insertBefore(note, wrap.querySelector("table"));
    }
    note.textContent = `Showing ${shown} of ${rows.length} rows. `;
    const all = document.createElement("button");
    all.type = "button";
    all.className = "filter-clear";
    all.textContent = "Show all rows";
    note.appendChild(all);
  }

  function set(block, column, cond) {
    const wrap = ks.view.blocks()[block];
    const name = wrap.dataset.name;
    const conds = filters.get(name) || new Map();
    if (cond) conds.set(column, cond);
    else conds.delete(column);
    if (conds.size > 0) filters.set(name, conds);
    else filters.delete(name);
    apply(wrap);
  }

  function clearAll(block) {
    const wrap = ks.view.blocks()[block];
    filters.delete(wrap.dataset.name);
    apply(wrap);
  }

  // The panel open now: { el, block, column } or null.
  let panel = null;

  function close() {
    if (!panel) return;
    panel.el.remove();
    panel = null;
  }

  function button(label, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (cls) b.className = cls;
    return b;
  }

  // Opens the panel under a column's heading cell.
  function open(block, column) {
    close();
    ks.table.take();
    const wrap = ks.view.blocks()[block];
    const heading = wrap.querySelector(`th.name[data-c="${column}"]`);
    ks.cell = { block, row: -1, column };
    const conds = filters.get(wrap.dataset.name);
    const cond = conds && conds.get(column);
    const el = document.createElement("div");
    el.className = "filter-panel";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", `Filter column ${ks.table.letters(column)}`);

    const sorts = document.createElement("div");
    sorts.className = "filter-sorts";
    const up = button("Sort ascending (A to Z, 0 to 9)");
    const down = button("Sort descending");
    const clear = button("Clear filter from this column");
    clear.disabled = !cond;
    sorts.append(up, down, clear);
    el.appendChild(sorts);

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search";
    search.setAttribute("aria-label", "Search the values");
    el.appendChild(search);

    // The column's distinct values, ignoring case, in the order the column sorts in.
    const distinct = new Map();
    for (const row of wrap.values) {
      const v = row[column];
      const key = shownText(v).toLowerCase();
      if (!distinct.has(key)) distinct.set(key, v);
    }
    const values = Array.from(distinct.entries()).sort((a, b) => compare(a[1], b[1]));
    const list = document.createElement("div");
    list.className = "filter-values";
    const allBox = document.createElement("label");
    const all = document.createElement("input");
    all.type = "checkbox";
    allBox.append(all, " (Select all)");
    list.appendChild(allBox);
    const boxes = [];
    for (const [key, v] of values.slice(0, FILTER_LIST_CAP)) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = key;
      box.checked = !cond || (cond.values ? cond.values.has(key) : meets(cond, v));
      label.append(box, ` ${key === "" ? "(Blanks)" : shownText(v)}`);
      list.appendChild(label);
      boxes.push(box);
    }
    el.appendChild(list);
    if (values.length > FILTER_LIST_CAP) {
      const capped = document.createElement("p");
      capped.className = "filter-capped";
      capped.textContent = `Only the first ${FILTER_LIST_CAP.toLocaleString("en")} of ${values.length.toLocaleString("en")} values are listed. Search to find the others.`;
      el.appendChild(capped);
    }

    const more = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Condition";
    const op = document.createElement("select");
    op.setAttribute("aria-label", "Condition");
    for (const [value, label] of OPS) {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      op.appendChild(o);
    }
    const arg = document.createElement("input");
    arg.type = "text";
    arg.setAttribute("aria-label", "Value of the condition");
    if (cond && cond.op) {
      more.open = true;
      op.value = cond.op;
      arg.value = cond.arg;
    }
    more.append(summary, op, arg);
    el.appendChild(more);

    const ends = document.createElement("div");
    ends.className = "filter-ends";
    const ok = button("OK", "filter-ok");
    const cancel = button("Cancel");
    ends.append(ok, cancel);
    el.appendChild(ends);

    // (Select all) shows whether every listed value in sight is ticked, and ticks or unticks them.
    const inSight = () => boxes.filter((b) => !b.parentElement.hidden);
    const sync = () => {
      const seen = inSight();
      const on = seen.filter((b) => b.checked).length;
      all.checked = seen.length > 0 && on === seen.length;
      all.indeterminate = on > 0 && on < seen.length;
    };
    sync();
    list.addEventListener("change", (e) => {
      if (e.target === all) for (const b of inSight()) b.checked = all.checked;
      sync();
    });
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      for (const b of boxes) b.parentElement.hidden = q !== "" && !b.parentElement.textContent.toLowerCase().includes(q);
      sync();
    });

    const sortBy = (descending) => {
      close();
      ks.act("ksmd_web_sort", block, column, descending ? 1 : 0);
    };
    up.addEventListener("click", () => sortBy(false));
    down.addEventListener("click", () => sortBy(true));
    clear.addEventListener("click", () => {
      close();
      set(block, column, null);
    });
    cancel.addEventListener("click", close);
    const take = () => {
      const argNeeded = op.value !== "empty" && op.value !== "filled";
      if (more.open && (!argNeeded || arg.value !== "")) {
        set(block, column, { op: op.value, arg: arg.value });
      } else if (boxes.every((b) => b.checked) && values.length <= FILTER_LIST_CAP) {
        set(block, column, null);
      } else {
        set(block, column, { values: new Set(boxes.filter((b) => b.checked).map((b) => b.value)) });
      }
      close();
    };
    ok.addEventListener("click", take);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        heading.focus();
      } else if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
        e.preventDefault();
        take();
      }
    });

    document.body.appendChild(el);
    const r = heading.getBoundingClientRect();
    const w = el.getBoundingClientRect();
    el.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - w.width - 4))}px`;
    el.style.top = `${r.bottom + window.scrollY}px`;
    // Near the window's bottom, the value list grows shorter, so OK stays in sight.
    const over = el.getBoundingClientRect().bottom - window.innerHeight + 4;
    if (over > 0) list.style.maxHeight = `${Math.max(80, list.getBoundingClientRect().height - over)}px`;
    panel = { el, block, column };
    search.focus();
  }

  // A press outside the panel closes it, as Cancel does.
  document.addEventListener("mousedown", (e) => {
    if (panel && !panel.el.contains(e.target) && !(e.target.closest && e.target.closest(".filter-arrow"))) close();
  }, true);

  ks.root.addEventListener("mousedown", (e) => {
    const arrow = e.target.closest && e.target.closest(".filter-arrow");
    if (!arrow || arrow.closest(".include")) return;
    e.preventDefault();
    e.stopPropagation();
    const block = ks.view.blocks().indexOf(arrow.closest(".table"));
    const column = Number(arrow.dataset.c);
    if (panel && panel.block === block && panel.column === column) close();
    else open(block, column);
  }, true);

  ks.root.addEventListener("click", (e) => {
    const all = e.target.closest && e.target.closest(".filter-clear");
    if (all) clearAll(ks.view.blocks().indexOf(all.closest(".table")));
  });

  ks.filter = {
    apply,
    shown: shownText,
    open,
    close,
    clearAll,
    // Shows only the rows whose value in the column is the value of that cell.
    only: (block, row, column) => {
      const v = ks.view.blocks()[block].values[row][column];
      set(block, column, { values: new Set([shownText(v).toLowerCase()]) });
    },
    on: (block) => {
      const wrap = ks.view.blocks()[block];
      return !!wrap && filters.has(wrap.dataset.name);
    },
    // A table renamed keeps its filter.
    renamed: (was, now) => {
      if (!filters.has(was)) return;
      filters.set(now, filters.get(was));
      filters.delete(was);
    },
  };
}
