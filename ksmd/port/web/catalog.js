// ksmd page: Insert ▸ Function… (Shift+F3), as Excel's Insert Function dialog. It lists every
// function a formula can call, by group and by a search of names and descriptions, and shows the
// chosen one: its arguments and what each takes, what it gives, and an example. Insert writes
// `=name(` into the chosen cell, or the name at the caret of the cell being edited, which stays
// open meanwhile (`hold` in `table.js`). Esc or Cancel closes it, and the focus goes back.
// What it shows is the list `suggest.js` reads, from the functions' own doc comments.
"use strict";

function ksmdCatalog(ks) {
  const ALL = "All groups";
  const OWN = "This document's own";
  let d = null; // the dialog, made when first opened
  let parts = null; // its parts: { search, group, names, about, note, insert }
  let fns = []; // every function, as the dialog opened
  let held = null; // the open cell's box the dialog writes into, or null
  // Where its caret stood. **Kept as the dialog opens**: the browser's own return of the focus as
  // the dialog closes can put the caret at the start of the text.
  let caret = [0, 0];
  let inserted = false; // whether Insert closed the dialog

  const groupOf = (f) => (f.own ? OWN : f.group);

  function make() {
    d = document.createElement("dialog");
    d.className = "fx-dialog";
    d.setAttribute("aria-labelledby", "fx-dialog-title");
    const title = document.createElement("h2");
    title.id = "fx-dialog-title";
    title.textContent = "Insert function";
    const find = document.createElement("div");
    find.className = "fx-find";
    const search = document.createElement("input");
    search.type = "search";
    search.className = "fx-search";
    search.spellcheck = false;
    search.autocomplete = "off";
    search.placeholder = "A name or what it does, such as hex";
    const searchLabel = document.createElement("label");
    searchLabel.append("Search ", search);
    const group = document.createElement("select");
    group.className = "fx-group";
    const groupLabel = document.createElement("label");
    groupLabel.append("Group ", group);
    find.append(searchLabel, groupLabel);
    const body = document.createElement("div");
    body.className = "fx-body";
    const names = document.createElement("select");
    names.className = "fx-names";
    names.size = 12;
    names.setAttribute("aria-label", "Functions");
    const about = document.createElement("div");
    about.className = "fx-about";
    about.setAttribute("aria-live", "polite");
    body.append(names, about);
    const note = document.createElement("p");
    note.className = "fx-note";
    note.setAttribute("role", "status");
    const buttons = document.createElement("div");
    buttons.className = "fx-buttons";
    const insert = ks.button("Insert", "fx-insert");
    const cancel = ks.button("Cancel");
    buttons.append(insert, cancel);
    d.append(title, find, body, note, buttons);
    document.body.appendChild(d);
    parts = { search, group, names, about, note, insert };

    search.addEventListener("input", () => fill(null));
    group.addEventListener("change", () => fill(null));
    // The arrow keys in the search box move in the list, as in a combo box; Enter inserts.
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const to = names.selectedIndex + (e.key === "ArrowDown" ? 1 : -1);
        names.selectedIndex = Math.max(0, Math.min(names.options.length - 1, to));
        show();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose();
      } else if (e.key === "Escape") {
        // A search box's own Esc only empties it; here Esc closes the dialog at once.
        e.preventDefault();
        d.close();
      }
    });
    names.addEventListener("change", show);
    names.addEventListener("dblclick", choose);
    names.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        choose();
      }
    });
    insert.addEventListener("click", choose);
    cancel.addEventListener("click", () => d.close());
    d.addEventListener("close", back);
  }

  // The functions the search and the group let through: names that fit first, then those whose
  // description holds every word typed.
  function found() {
    const words = parts.search.value.trim().toLowerCase().split(/\s+/).filter((w) => w !== "");
    const g = parts.group.value;
    const inGroup = fns.filter((f) => g === ALL || groupOf(f) === g);
    if (words.length === 0) return inGroup;
    const named = inGroup.filter((f) => words.every((w) => `_${f.name}`.includes(`_${w}`)))
      .sort((a, b) => b.name.startsWith(words[0]) - a.name.startsWith(words[0]));
    const told = inGroup.filter((f) => !named.includes(f) && words.every((w) =>
      [f.name, f.summary, f.detail, ...f.args.map((a) => a.meaning)].join(" ").toLowerCase().includes(w)));
    return named.concat(told);
  }

  // Lists what the search finds, keeping the chosen function where it is still listed.
  function fill(name) {
    const was = name || (parts.names.value || "");
    const list = found();
    parts.names.textContent = "";
    for (const f of list) parts.names.add(new Option(f.own ? `${f.name} (own)` : f.name, f.name));
    const keep = list.findIndex((f) => f.name === was);
    parts.names.selectedIndex = list.length === 0 ? -1 : Math.max(0, keep);
    show();
  }

  // Shows the chosen function: how it is written, what it gives, its arguments and an example.
  function show() {
    const f = fns.find((x) => x.name === parts.names.value);
    const about = parts.about;
    about.textContent = "";
    parts.insert.disabled = !f || ks.readOnly || !(held || chosenCell());
    if (!f) {
      about.textContent = "No function fits the search.";
      return;
    }
    const add = (tag, cls, text, parent = about) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      ks.suggest.rich(el, text);
      parent.appendChild(el);
      return el;
    };
    add("code", "fx-about-signature", ks.suggest.signature(f));
    add("p", "fx-about-summary", `It gives ${f.summary}.`);
    if (f.own) add("p", "fx-about-own", "This document's own function, from its functions file.");
    if (f.args.length > 0) {
      add("h3", "", "Arguments");
      const dl = add("dl", "fx-about-args", "");
      for (const a of f.args) {
        add("dt", "", ks.suggest.argText(a), dl);
        add("dd", "", a.meaning || "no description", dl);
        if (a.optional) add("dd", "fx-about-how", "It can be left out.", dl);
        if (a.rest) add("dd", "fx-about-how", "It takes any number of values, cells or ranges.", dl);
      }
    }
    if (f.example) {
      add("h3", "", "For example");
      const ex = add("p", "fx-about-example", "");
      const code = document.createElement("code");
      code.textContent = `=${f.example}`;
      ex.appendChild(code);
      if (f.gives) ex.append(` shows ${f.gives}`);
    }
    if (f.detail) add("p", "fx-about-detail", f.detail);
  }

  // The chosen cell of a table, where no cell is open: { block, row, column }, or null.
  function chosenCell() {
    const c = ks.cell;
    const el = c && ks.view.blocks()[c.block];
    return el && el.classList.contains("table") && c.row >= 0 ? c : null;
  }

  // Opens the dialog, on the function `name` where one is given.
  function open(name) {
    if (!d) make();
    if (d.open) return null;
    fns = ks.suggest.all();
    const editing = ks.table.editing();
    held = editing && editing.row >= 0 ? editing.input : null;
    if (held) {
      ks.table.hold(true);
      caret = [held.selectionStart, held.selectionEnd];
    }
    inserted = false;
    const groups = [...new Set(fns.map(groupOf))].sort((a, b) =>
      (a === OWN) - (b === OWN) || (a < b ? -1 : a > b ? 1 : 0));
    parts.group.textContent = "";
    for (const g of [ALL, ...groups]) parts.group.add(new Option(g, g));
    parts.search.value = "";
    // A name typed in the cell, or the call the caret stands in, is where the list starts.
    if (!name && held) {
      const w = ks.suggest.nameAt(held.value, held.selectionStart);
      if (w && w.prefix) parts.search.value = w.prefix;
    }
    fill(name);
    parts.note.textContent = held || chosenCell() ? "" :
      "Choose a cell of a table first: Insert puts the function there.";
    d.showModal();
    parts.search.focus();
    return null;
  }

  // Inserts the chosen function and closes the dialog.
  function choose() {
    const f = fns.find((x) => x.name === parts.names.value);
    if (!f || parts.insert.disabled) return;
    inserted = true;
    const box = held;
    d.close();
    if (box && box.isConnected) {
      box.focus();
      box.setSelectionRange(caret[0], caret[1]);
      // The text of an open cell keeps what was typed: the name goes at the caret, in place of a
      // name begun there. Text that is no formula gives way to it, as a value typed over does.
      if (!box.value.startsWith("=")) {
        box.value = `=${f.name}(`;
      } else {
        const w = ks.suggest.nameAt(box.value, box.selectionStart);
        const paren = w && box.value[w.to] === "(";
        box.setRangeText(paren ? f.name : `${f.name}(`, w ? w.from : box.selectionStart,
          w ? w.to : box.selectionEnd, "end");
        if (paren) box.setSelectionRange(w.from + f.name.length + 1, w.from + f.name.length + 1);
      }
      box.dispatchEvent(new Event("input", { bubbles: true }));
      ks.suggest.refresh();
      return;
    }
    const c = chosenCell();
    if (!c) return;
    const text = `=${f.name}(`;
    ks.table.openWith(c.block, c.row, c.column, text, text.length, text.length);
    const now = ks.table.editing();
    if (now) now.input.dispatchEvent(new Event("input", { bubbles: true }));
    ks.suggest.refresh();
  }

  // The focus goes back where it was: the open cell, the chosen cell or the document.
  // Caution: **Leave a cell opened since alone.** The dialog's close event comes a moment after
  // Esc, and the person may already have pressed a cell and typed its first key. Taking the focus
  // from that cell closed it with that key alone: `200` became `00`.
  function back() {
    const box = held;
    held = null;
    if (box) ks.table.hold(false);
    if (inserted && !box) return;
    const open = ks.table.editing();
    if (open && open.input !== box) return;
    if (box && box.isConnected) {
      box.focus();
      if (!inserted) box.setSelectionRange(caret[0], caret[1]);
      ks.suggest.refresh();
    } else {
      ks.focusBack(null);
    }
  }

  // It runs before an open cell is taken, so the cell stays open; Read-only can still look.
  ks.handle("insert-function", () => open(null), { direct: true, looks: true });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "F3" || !e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    ks.command("insert-function");
  }, true);

  ks.catalog = { open };
}
