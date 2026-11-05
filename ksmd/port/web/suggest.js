// ksmd page: help while a formula is typed in a cell, as Excel's Formula AutoComplete and its
// ScreenTip. Where a function's name can start, the letters typed open a list of the functions
// whose names fit; Ctrl+Space opens it with nothing typed too. Up and Down move in it, Tab or
// Enter writes the chosen name and its `(`, and Esc closes the list alone. While the caret stands
// inside a call, a tip shows the function's arguments, the one being typed in bold.
// What the list and the tip say comes from the functions' own doc comments: ksmd's through
// `ksmd_web_functions` in `ksmd/port/web/bridge_tables.kspl`, from `ksmd/calc/help.kspl`, and the
// document's own through `functions.js`.
// Caution: **Take a key only while the list is open, and never during an input method's
// composition.** The cell's own keys (`keys` in `table.js`) must act as before whenever it is shut.
"use strict";

function ksmdSuggest(ks) {
  let builtIn = null; // ksmd's own functions, read once from the editor
  let input = null; // the cell's box the list and the tip serve
  let shown = []; // the functions the open list offers, in order; empty while it is shut
  let at = 0; // the chosen entry of the list
  let word = null; // where the name being typed stands: { from, to, prefix }
  let forced = false; // Ctrl+Space opened the list, so it stays open with no letter typed

  const list = document.createElement("div");
  list.className = "fx-list";
  list.id = "fx-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "Functions");
  list.hidden = true;
  const tip = document.createElement("div");
  tip.className = "fx-tip";
  tip.id = "fx-tip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(list, tip);
  // A press in either keeps the focus in the cell, so the edit goes on.
  for (const el of [list, tip]) el.addEventListener("mousedown", (e) => e.preventDefault());

  // Every function a formula can call, by name: ksmd's own, and the document's own marked `own`.
  function all() {
    if (!builtIn) builtIn = JSON.parse(ks.out(ks.call("ksmd_web_functions")));
    const own = ks.ownFunctions ? ks.ownFunctions() : [];
    return builtIn.concat(own).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }
  const byName = (name) => all().find((f) => f.name === name) || null;
  // An argument as the reference writes it: `[width]` can be left out, and `xs…` takes the rest.
  const argText = (a) => (a.optional ? `[${a.name}]` : a.rest ? `${a.name}…` : a.name);
  const signature = (f) => `${f.name}(${f.args.map(argText).join(", ")})`;
  // Adds a doc comment's text to an element, each span in backquotes as code.
  function rich(el, text) {
    text.split("`").forEach((part, i) => {
      if (i % 2 === 0) {
        el.append(part);
      } else {
        const code = document.createElement("code");
        code.textContent = part;
        el.appendChild(code);
      }
    });
    return el;
  }
  // What a function gives, in a line; the document's own say so.
  const summary = (el, f) => rich(el, f.own ? `${f.summary} (this document's own)` : f.summary);

  // Whether text that ends here is inside quotes, as `point.js` reads it.
  function quoted(before) {
    let inside = false;
    for (let i = 1; i < before.length; i++) {
      if (inside && before[i] === "\\") i++;
      else if (before[i] === '"') inside = !inside;
    }
    return inside;
  }

  // Where a function's name can stand at the caret: { from, to, prefix }, or null. A name is
  // lowercase, and an uppercase letter starts a cell's reference, so only lowercase letters count.
  // After a letter, a digit, `.`, `$` or a quote the caret is inside another word.
  function nameAt(text, caret) {
    if (!text.startsWith("=")) return null;
    const before = text.slice(0, caret);
    if (quoted(before)) return null;
    const m = /[a-z][a-z0-9_]*$/.exec(before);
    const prefix = m ? m[0] : "";
    const from = caret - prefix.length;
    if (from > 1 && /[A-Za-z0-9_.$"]/.test(before[from - 1])) return null;
    const rest = /^[a-z0-9_]*/.exec(text.slice(caret))[0];
    return { from, to: caret + rest.length, prefix };
  }

  // The functions a prefix finds: those whose names start with it first, then those with a part
  // after `_` that does, so `dec` finds `dec_to_hex` and then `hex_to_dec`.
  function matches(prefix) {
    const fns = all();
    if (prefix === "") return fns;
    const first = fns.filter((f) => f.name.startsWith(prefix));
    const parts = fns.filter((f) => !f.name.startsWith(prefix) && `_${f.name}`.includes(`_${prefix}`));
    return first.concat(parts);
  }

  // The call the caret stands in: { f, arg }, the function and which argument from 0, or null.
  function callAt(text, caret) {
    if (!text.startsWith("=")) return null;
    const calls = [];
    let inside = false;
    for (let i = 1; i < caret; i++) {
      const c = text[i];
      if (inside) {
        if (c === "\\") i++;
        else if (c === '"') inside = false;
      } else if (c === '"') {
        inside = true;
      } else if (c === "(") {
        const m = /(^|[^A-Za-z0-9_.$"])([a-z][a-z0-9_]*)\s*$/.exec(text.slice(0, i));
        calls.push({ name: m ? m[2] : null, arg: 0 });
      } else if (c === ")") {
        calls.pop();
      } else if (c === "," && calls.length > 0) {
        calls[calls.length - 1].arg += 1;
      }
    }
    for (let k = calls.length - 1; k >= 0; k--) {
      const f = calls[k].name && byName(calls[k].name);
      if (f) return { f, arg: calls[k].arg };
    }
    return null;
  }

  // Puts the list or the tip under the cell's box, inside the window.
  function place(el) {
    const r = input.getBoundingClientRect();
    el.style.left = `${Math.max(0, Math.min(r.left, window.innerWidth - el.offsetWidth))}px`;
    const below = r.bottom + 2;
    el.style.top = `${below + el.offsetHeight > window.innerHeight ? Math.max(0, r.top - el.offsetHeight - 2) : below}px`;
  }

  function shut() {
    shown = [];
    forced = false;
    list.hidden = true;
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
  }

  function hideTip() {
    tip.hidden = true;
    if (input) input.removeAttribute("aria-describedby");
  }

  // Shows the list of the functions that fit the name at the caret; false where none fit.
  function open(w) {
    const found = matches(w.prefix);
    if (found.length === 0) {
      shut();
      return false;
    }
    const was = shown[at] && shown[at].name;
    word = w;
    shown = found;
    at = Math.max(0, shown.findIndex((f) => f.name === was));
    draw();
    return true;
  }

  function draw() {
    list.textContent = "";
    shown.forEach((f, i) => {
      const row = document.createElement("div");
      row.className = "fx-option";
      row.id = `fx-option-${i}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(i === at));
      const name = document.createElement("span");
      name.className = "fx-name";
      name.textContent = f.name;
      const what = document.createElement("span");
      what.className = "fx-summary";
      summary(what, f);
      row.append(name, what);
      row.addEventListener("click", () => {
        at = i;
        insert();
      });
      list.appendChild(row);
    });
    const chosen = shown[at];
    const foot = document.createElement("div");
    foot.className = "fx-chosen";
    foot.textContent = signature(chosen);
    const more = document.createElement("button");
    more.type = "button";
    more.className = "fx-more";
    more.tabIndex = -1;
    more.textContent = "All functions… (Shift+F3)";
    more.addEventListener("click", () => ks.command("insert-function"));
    list.append(foot, more);
    list.hidden = false;
    hideTip();
    input.setAttribute("aria-expanded", "true");
    input.setAttribute("aria-activedescendant", `fx-option-${at}`);
    place(list);
    list.querySelector(`#fx-option-${at}`).scrollIntoView({ block: "nearest" });
  }

  // Writes the chosen name and its `(` in place of the word typed; a `(` there already stays.
  function insert() {
    const f = shown[at];
    const text = input.value;
    const paren = text[word.to] === "(";
    input.setRangeText(paren ? f.name : `${f.name}(`, word.from, word.to, "end");
    if (paren) input.setSelectionRange(word.from + f.name.length + 1, word.from + f.name.length + 1);
    shut();
    // The box's height and the draft learn of the change as of typing.
    input.dispatchEvent(new Event("input", { bubbles: true }));
    refresh(false);
  }

  // Shows the tip of the call the caret stands in, while the list is shut.
  function showTip() {
    const call = shown.length === 0 && input.selectionStart === input.selectionEnd &&
      callAt(input.value, input.selectionStart);
    if (!call) {
      hideTip();
      return;
    }
    const { f, arg } = call;
    const restAt = f.args.findIndex((a) => a.rest);
    const current = restAt >= 0 && arg >= restAt ? restAt : arg;
    tip.textContent = "";
    const line = document.createElement("div");
    line.className = "fx-signature";
    const name = document.createElement("button");
    name.type = "button";
    name.className = "fx-link";
    name.tabIndex = -1;
    name.title = "Read about this function (Shift+F3)";
    name.textContent = f.name;
    name.addEventListener("click", () => ks.catalog.open(f.name));
    line.append(name, "(");
    f.args.forEach((a, i) => {
      if (i > 0) line.append(", ");
      const part = document.createElement(i === current ? "strong" : "span");
      part.textContent = argText(a);
      line.appendChild(part);
    });
    line.append(")");
    const gives = document.createElement("div");
    gives.className = "fx-summary";
    summary(gives, f);
    tip.append(line, gives);
    const a = f.args[current];
    if (a && a.meaning) {
      const meaning = document.createElement("div");
      meaning.className = "fx-meaning";
      rich(meaning, `${a.name}: ${a.meaning}`);
      tip.appendChild(meaning);
    }
    tip.hidden = false;
    input.setAttribute("aria-describedby", "fx-tip");
    place(tip);
  }

  // Reads the box again after a change: the list follows the name typed, and opens on a letter
  // typed where `typed` says one was; the tip follows the caret. With no letter before the caret,
  // as after `=sum(`, the list shuts unless Ctrl+Space opened it: a list left open there would
  // take Enter and Tab, and cover the cells a person points at.
  function refresh(typed) {
    if (!input || !input.isConnected || document.activeElement !== input) {
      shut();
      hideTip();
      return;
    }
    const w = input.selectionStart === input.selectionEnd ? nameAt(input.value, input.selectionStart) : null;
    if (!w || (w.prefix === "" && !forced) || (shown.length === 0 && !(typed && w.prefix !== ""))) shut();
    else open(w);
    showTip();
  }

  function keydown(e) {
    if (e.isComposing || e.keyCode === 229) return;
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
    const take = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    if (e.key === " " && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      // Ctrl+Space in an empty cell starts a formula, so every function is offered.
      if (input.value === "") {
        input.value = "=";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
      const w = nameAt(input.value, input.selectionStart);
      if (!w) return;
      take();
      if (open(w)) forced = true;
      return;
    }
    if (shown.length === 0) {
      // The cell's own key may close it; the tip goes with it.
      setTimeout(() => refresh(false), 0);
      return;
    }
    if (plain && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "PageDown" || e.key === "PageUp")) {
      take();
      const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 }[e.key];
      at = Math.max(0, Math.min(shown.length - 1, at + step));
      draw();
    } else if ((e.key === "Tab" && plain && !e.shiftKey) || (e.key === "Enter" && plain)) {
      take();
      insert();
    } else if (e.key === "Escape") {
      take();
      shut();
      showTip();
    }
  }

  // Serves a cell's box while it is open.
  function attach(box) {
    shut();
    hideTip();
    input = box;
    box.setAttribute("aria-autocomplete", "list");
    box.setAttribute("aria-controls", "fx-list");
    box.setAttribute("aria-expanded", "false");
    box.addEventListener("keydown", keydown);
    box.addEventListener("input", (e) => {
      if (box === input && !e.isComposing) refresh(typeof e.inputType === "string" && e.inputType.startsWith("insert"));
    });
    box.addEventListener("compositionend", () => setTimeout(() => refresh(true), 0));
    box.addEventListener("click", () => refresh(false));
    box.addEventListener("blur", () => {
      if (box !== input) return;
      shut();
      hideTip();
    });
  }

  // A showing of the document can take the cell's box away.
  ks.rendered.push(() => {
    if (input && !input.isConnected) {
      shut();
      hideTip();
    }
  });

  ks.suggest = {
    attach,
    all,
    signature,
    argText,
    rich,
    nameAt,
    // Reads the open cell's box again, as after typing, so the tip shows where the caret stands.
    refresh: () => refresh(false),
  };
}
