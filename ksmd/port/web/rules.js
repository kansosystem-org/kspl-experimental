// ksmd page: a column's colour rule, as Excel's conditional formatting does in its simplest form:
// one rule per column, comparing each cell's value with one value, or finding the empty cells. A
// cell that meets it takes the rule's colours over its own. The rule is saved in the file (`rules`
// on the table); Table, Columns, Colour by value... sets it in a small panel.
"use strict";

// Excel's ready-made styles, which a person picks from rather than choosing two colours.
const RULE_STYLES = [
  ["Light red fill, dark red text", "#9c0006", "#ffc7ce"],
  ["Yellow fill, dark yellow text", "#9c5700", "#ffeb9c"],
  ["Green fill, dark green text", "#006100", "#c6efce"],
  ["Red text", "#c00000", ""],
  ["Light red fill", "", "#ffc7ce"],
];

function ksmdRules(ks) {
  // Whether a calculated value meets a rule: [condition, value, colour, fill].
  function meets(rule, v) {
    const [kind, value] = rule;
    if (kind === "empty") return !v || v.length < 2 || v[0] === 0;
    if (!v || v.length < 2) return false;
    if (v[0] === 1 && kind !== "equal") return kind === "below" ? v[1] < Number(value) : v[1] > Number(value);
    if (kind !== "equal") return false;
    if (v[0] === 1) return /^-?\d/.test(value) && v[1] === Number(value);
    return v[0] === 2 && String(v[1]).toLowerCase() === value.toLowerCase();
  }

  // Colours the cells of a rendered table that meet their column's rule.
  function paint(wrap, rules) {
    wrap.rules = rules;
    rules.forEach((rule, c) => {
      if (!rule) return;
      wrap.values.forEach((row, r) => {
        if (!meets(rule, row[c])) return;
        const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (!el) return;
        if (rule[2]) el.style.color = rule[2];
        if (rule[3]) el.style.backgroundColor = rule[3];
        el.classList.add("ruled", "looked");
      });
    });
  }

  let panel = null;
  function close() {
    if (panel) panel.remove();
    panel = null;
  }

  // Opens the panel that sets the chosen column's rule, beside the chosen cell.
  function ask(block, column) {
    close();
    const wrap = ks.view.blocks()[block];
    const now = (wrap.rules && wrap.rules[column]) || null;
    panel = document.createElement("div");
    panel.className = "rule-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", `Colour column ${ks.table.letters(column)} by value`);
    const kind = document.createElement("select");
    kind.className = "rule-kind";
    for (const [v, label] of [["", "No rule"], ["below", "Below"], ["above", "Above"],
      ["equal", "Equal to"], ["empty", "Empty"]]) {
      kind.add(new Option(label, v));
    }
    const value = document.createElement("input");
    value.className = "rule-value";
    value.type = "text";
    value.setAttribute("aria-label", "Value");
    const style = document.createElement("select");
    style.className = "rule-style";
    RULE_STYLES.forEach(([label], i) => style.add(new Option(label, String(i))));
    if (now) {
      kind.value = now[0];
      value.value = now[1];
      const i = RULE_STYLES.findIndex(([, color, fill]) => color === now[2] && fill === now[3]);
      if (i >= 0) style.value = String(i);
    }
    const sync = () => {
      value.hidden = kind.value === "" || kind.value === "empty";
      style.disabled = kind.value === "";
    };
    kind.addEventListener("change", sync);
    sync();
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Apply";
    apply.className = "rule-apply";
    apply.addEventListener("click", () => {
      const [, color, fill] = RULE_STYLES[Number(style.value)];
      const sign = { below: "<", above: ">", equal: "=" }[kind.value];
      const condition = kind.value === "empty" ? "empty" : `${sign}${value.value.trim()}`;
      const look = [color && `color:${color}`, fill && `fill:${fill}`].filter(Boolean).join(" ");
      close();
      ks.act("ksmd_web_rule", block, column, ks.put(kind.value === "" ? "" : `${condition};${look}`));
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", close);
    panel.append(`Colour the cells of column ${ks.table.letters(column)} that are `, kind, value,
      " with ", style, apply, cancel);
    panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" && e.target === value) apply.click();
    });
    document.body.appendChild(panel);
    const at = wrap.getBoundingClientRect();
    panel.style.left = `${Math.max(4, at.left + window.scrollX)}px`;
    panel.style.top = `${Math.max(window.scrollY + 4, at.top + window.scrollY - panel.offsetHeight - 4)}px`;
    kind.focus();
    return null;
  }

  // A press outside the panel closes it, as a press outside a menu does.
  document.addEventListener("mousedown", (e) => {
    if (panel && !panel.contains(e.target)) close();
  }, true);

  ks.rules = { paint, ask, close };
}
