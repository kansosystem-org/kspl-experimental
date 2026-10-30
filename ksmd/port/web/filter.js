// ksmd page: filtering a table from its heading, as Excel's filter does. Each name in the heading
// row carries an arrow; pressing it opens a panel under that column. The panel holds sorting, a
// search box, the column's values each with a tick box, a condition folded away, and OK and
// Cancel.
// A filter is kept in the file (`filter` in `ksmd/model/filter.kspl`), so a document opens with
// the rows it was left with; each change is one step of undo. The file still holds every row, and
// a formula counts every row, shown or not. Each column holds one condition, and a row shows when
// it meets every column's. In Read-only a filter is the viewer's alone, and the file keeps its own.
// Typing in the search box narrows the list shown and never unticks a value. Values differing only
// in case are one value, since the matching ignores case. The row being edited stays in sight until
// the edit is taken.
// A column's dates stand in a tree, as Excel's: years, then months, then days, each folded until
// its button opens it. A year's or a month's box ticks every day under it, and shows a mix where
// only some are ticked. The column's other values stand after the tree, as a list.
"use strict";

// The most values the panel lists; past it, the panel says so.
const FILTER_LIST_CAP = 1000;

function ksmdFilter(ks) {
  // In Read-only, the conditions a viewer set, by the table's name: a Map from a column to
  // { values: Set of lower-case texts } or { op, arg }. They stand over the file's own.
  const viewed = new Map();
  // A value in an entry: `%`, `,` and `|` written as escapes, since they separate the entries.
  const enc = (t) => t.replace(/%/g, "%25").replace(/,/g, "%2C").replace(/\|/g, "%7C");
  const dec = (t) => t.replace(/%2C/g, ",").replace(/%7C/g, "|").replace(/%25/g, "%");
  // A column's entry as the file holds it, read into a condition, or null for none.
  function condOf(entry) {
    if (!entry) return null;
    if (entry === "empty" || entry === "filled") return { op: entry, arg: "" };
    const at = entry.indexOf(":");
    const kind = entry.slice(0, at);
    const rest = entry.slice(at + 1);
    if (kind === "in") return { values: new Set(rest.split("|").map((v) => dec(v).toLowerCase())) };
    return { op: kind, arg: dec(rest) };
  }
  function entryOf(cond) {
    if (!cond) return "";
    if (cond.values) return `in:${Array.from(cond.values).map(enc).join("|")}`;
    if (cond.op === "empty" || cond.op === "filled") return cond.op;
    return `${cond.op}:${enc(cond.arg.toLowerCase())}`;
  }
  // A table's conditions now: the viewer's in Read-only, else the file's; null for none.
  function condsOf(wrap) {
    if (ks.readOnly && viewed.has(wrap.dataset.name)) return viewed.get(wrap.dataset.name);
    const conds = new Map();
    (wrap.filterEntries || []).forEach((entry, c) => {
      const cond = condOf(entry);
      if (cond) conds.set(c, cond);
    });
    return conds.size > 0 ? conds : null;
  }
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
    const conds = condsOf(wrap);
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

  // Sets one column's condition, or none: in the file as one step, or in Read-only for the viewer.
  function set(block, column, cond) {
    const wrap = ks.view.blocks()[block];
    if (!ks.readOnly) return ks.act("ksmd_web_set_filter", block, column, ks.put(entryOf(cond)));
    const conds = new Map(condsOf(wrap) || []);
    if (cond) conds.set(column, cond);
    else conds.delete(column);
    viewed.set(wrap.dataset.name, conds.size > 0 ? conds : new Map());
    apply(wrap);
    return null;
  }

  function clearAll(block) {
    const wrap = ks.view.blocks()[block];
    if (!ks.readOnly) return ks.act("ksmd_web_set_filter", block, -1, ks.put(""));
    viewed.set(wrap.dataset.name, new Map());
    apply(wrap);
    return null;
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
    const conds = condsOf(wrap);
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
    // Each value's box; a box the search leaves out has `out` set.
    const boxes = [];
    const valueBox = (key, v, text) => {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = key;
      box.checked = !cond || (cond.values ? cond.values.has(key) : meets(cond, v));
      label.append(box, ` ${text}`);
      boxes.push(box);
      return label;
    };
    const listed = values.slice(0, FILTER_LIST_CAP);
    const tree = dateTree(listed.filter(([, v]) => v[0] === 5), valueBox);
    if (tree) list.appendChild(tree);
    for (const [key, v] of listed) {
      if (v[0] !== 5) list.appendChild(valueBox(key, v, key === "" ? "(Blanks)" : shownText(v)));
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

    // (Select all) shows whether every value the search leaves in is ticked, and ticks or unticks
    // them; a year's or a month's box does the same for the days under it. A day in a folded month
    // still counts: folding hides it from sight, not from the filter.
    const inSight = (within = list) => boxes.filter((b) => !b.out && within.contains(b));
    const mark = (box, seen) => {
      const on = seen.filter((b) => b.checked).length;
      box.checked = seen.length > 0 && on === seen.length;
      box.indeterminate = on > 0 && on < seen.length;
    };
    const sync = () => {
      for (const node of list.querySelectorAll("[role=treeitem]")) {
        mark(node.querySelector(":scope > .tree-row input"), inSight(node.querySelector(":scope > .tree-kids")));
      }
      mark(all, inSight());
      // With no value ticked no row would show, so OK waits for a tick or a condition, as in Excel.
      ok.disabled = !more.open && !boxes.some((b) => b.checked);
    };
    sync();
    list.addEventListener("change", (e) => {
      const node = e.target.closest(".tree-row") && e.target.closest("[role=treeitem]");
      if (e.target === all || node) {
        for (const b of inSight(node ? node.querySelector(":scope > .tree-kids") : list)) b.checked = e.target.checked;
      }
      sync();
    });
    search.addEventListener("input", () => {
      const q = search.value.toLowerCase();
      for (const b of boxes) {
        // A day matches by its whole date, as `2026-01-15` or as its format shows it.
        const text = b.dataset.date || b.parentElement.textContent;
        b.out = q !== "" && !text.toLowerCase().includes(q);
        b.parentElement.hidden = b.out;
      }
      // A year or a month shows while a day under it matches, and opens while the search finds one.
      for (const node of Array.from(list.querySelectorAll("[role=treeitem]")).reverse()) {
        const kids = node.querySelector(":scope > .tree-kids");
        const left = inSight(kids).length;
        node.hidden = left === 0;
        if (q !== "") fold(node, left === 0);
      }
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

  // Opens or folds a year or a month of the date tree.
  function fold(node, folded) {
    node.setAttribute("aria-expanded", String(!folded));
    node.querySelector(":scope > .tree-row .tree-twist").textContent = folded ? "\u25B8" : "\u25BE";
    node.querySelector(":scope > .tree-kids").hidden = folded;
  }

  // The tree of a column's dates, or null where it holds none: one node per year and per month,
  // folded, and a box per day made by `valueBox`. A month is named in the browser's language.
  function dateTree(dates, valueBox) {
    if (dates.length === 0) return null;
    const tree = document.createElement("div");
    tree.className = "date-tree";
    tree.setAttribute("role", "tree");
    tree.setAttribute("aria-label", "Dates by year and month");
    const node = (key, text, label) => {
      const n = document.createElement("div");
      n.setAttribute("role", "treeitem");
      n.dataset.key = key;
      const row = document.createElement("div");
      row.className = "tree-row";
      const twist = document.createElement("button");
      twist.type = "button";
      twist.className = "tree-twist";
      twist.tabIndex = -1;
      twist.setAttribute("aria-label", label);
      const box = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      box.append(input, ` ${text}`);
      row.append(twist, box);
      const kids = document.createElement("div");
      kids.className = "tree-kids";
      kids.setAttribute("role", "group");
      n.append(row, kids);
      fold(n, true);
      return n;
    };
    const month = (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleString(navigator.language || "en",
      { month: "long", timeZone: "UTC" });
    let year = null;
    let monthNode = null;
    for (const [key, v] of dates) {
      const iso = v[1];
      const [y, m, d] = [iso.slice(0, 4), iso.slice(5, 7), iso.slice(8, 10)];
      if (!year || year.dataset.key !== y) {
        year = node(y, String(Number(y)), `Open or fold ${Number(y)}`);
        tree.appendChild(year);
        monthNode = null;
      }
      if (!monthNode || monthNode.dataset.key !== `${y}-${m}`) {
        const name = month(Number(y), Number(m));
        monthNode = node(`${y}-${m}`, name, `Open or fold ${name} ${Number(y)}`);
        year.querySelector(":scope > .tree-kids").appendChild(monthNode);
      }
      const day = valueBox(key, v, d);
      day.firstChild.dataset.date = shownText(v) === iso ? iso : `${iso} ${shownText(v)}`;
      monthNode.querySelector(":scope > .tree-kids").appendChild(day);
    }
    tree.addEventListener("click", (e) => {
      const twist = e.target.closest(".tree-twist");
      if (!twist) return;
      const n = twist.closest("[role=treeitem]");
      fold(n, n.getAttribute("aria-expanded") === "true");
    });
    // Right opens a year or a month from its box, and Left folds it, as a tree in a file manager.
    tree.addEventListener("keydown", (e) => {
      const n = e.target.closest(".tree-row") && e.target.closest("[role=treeitem]");
      if (!n || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
      e.preventDefault();
      fold(n, e.key === "ArrowLeft");
    });
    return tree;
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
      return !!wrap && !!condsOf(wrap);
    },
    // Read-only turned on or off: the viewer's filters go, and every table shows the file's.
    readOnly: () => {
      viewed.clear();
      for (const wrap of ks.view.blocks()) if (wrap.classList.contains("table")) apply(wrap);
    },
  };
}
