// ksmd page: a column's colour rule, as Excel's conditional formatting does in its simplest form:
// one rule per column, comparing each cell's value with one value, or finding the empty cells. A
// cell that meets it takes the rule's colours over its own. A colour scale fills each number's
// cell from white to a colour, and the columns that share one scale compare as one block. The rule is saved in the file (`rules`
// on the table); Table, Look, Colour by value... sets it in a small panel.
"use strict";

// Excel's ready-made styles, which a person picks from rather than choosing two colours.
const RULE_STYLES = [
  ["Light red fill, dark red text", "#9c0006", "#ffc7ce"],
  ["Yellow fill, dark yellow text", "#9c5700", "#ffeb9c"],
  ["Green fill, dark green text", "#006100", "#c6efce"],
  ["Red text", "#c00000", ""],
  ["Light red fill", "", "#ffc7ce"],
];

// A scale's colour at the greatest number; the least is white. Excel's two-colour scales.
const SCALE_COLOURS = [["Yellow", "#ffef9c"], ["Green", "#63be7b"], ["Red", "#f8696b"], ["Blue", "#5a8ac6"]];

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

  // A colour `t` of the way from one `#rrggbb` to another.
  function between(from, to, t) {
    const part = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    return `rgb(${[0, 1, 2].map((i) => Math.round(part(from, i) + (part(to, i) - part(from, i)) * t)).join(",")})`;
  }

  // Fills the number cells of the columns that share one colour scale, from its first colour at
  // their least number to its second at their greatest.
  function scale(wrap, rules, rule) {
    const columns = rules.map((r, c) => (r && r[0] === "scale" && r[2] === rule[2] && r[3] === rule[3] ? c : -1))
      .filter((c) => c >= 0);
    const numbers = columns.flatMap((c) => wrap.values.map((row) => row[c]).filter((v) => v && v[0] === 1)
      .map((v) => v[1]));
    if (numbers.length === 0) return;
    const lo = Math.min(...numbers);
    const span = Math.max(...numbers) - lo;
    for (const c of columns) {
      wrap.values.forEach((row, r) => {
        const v = row[c];
        const el = v && v[0] === 1 && wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
        if (!el) return;
        el.style.backgroundColor = between(rule[2], rule[3], span > 0 ? (v[1] - lo) / span : 1);
        el.classList.add("ruled", "looked");
      });
    }
  }

  // Colours the cells of a rendered table that meet their column's rule.
  function paint(wrap, rules) {
    wrap.rules = rules;
    const scaled = new Set();
    rules.forEach((rule, c) => {
      if (!rule) return;
      if (rule[0] === "scale") {
        const key = `${rule[2]} ${rule[3]}`;
        if (!scaled.has(key)) scale(wrap, rules, rule);
        scaled.add(key);
        return;
      }
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

  // Opens the panel that sets the chosen column's rule, beside the chosen cell.
  function ask(block, column) {
    const wrap = ks.view.blocks()[block];
    const now = (wrap.rules && wrap.rules[column]) || null;
    const panel = ks.panel("rule-panel", `Colour column ${ks.table.letters(column)} by value`, () => {
      const [, color, fill] = styles[Number(style.value)];
      const sign = { below: "<", above: ">", equal: "=" }[kind.value];
      const condition = kind.value === "empty" ? "empty" : `${sign}${value.value.trim()}`;
      const look = [color && `color:${color}`, fill && `fill:${fill}`].filter(Boolean).join(" ");
      const entry = kind.value === "" ? "" : kind.value === "scale" ?
        `scale;from:${low} to:${high.value}` : `${condition};${look}`;
      ks.act("ksmd_web_rule", block, column, ks.put(entry));
    });
    const kind = ks.el("select", "rule-kind");
    for (const [v, label] of [["", "No rule"], ["below", "Below"], ["above", "Above"],
      ["equal", "Equal to"], ["empty", "Empty"], ["scale", "A colour scale"]]) {
      kind.add(new Option(label, v));
    }
    const value = ks.el("input", "rule-value");
    value.type = "text";
    value.setAttribute("aria-label", "Value");
    // Colours written in the file that no offered choice holds are offered too, and chosen, so
    // the panel never changes a colour the person did not change.
    const scaled = !!now && now[0] === "scale";
    const styles = RULE_STYLES.slice();
    if (now && !scaled && !styles.some(([, color, fill]) => color === now[2] && fill === now[3])) {
      styles.push(["The colours the file names", now[2], now[3]]);
    }
    const style = ks.el("select", "rule-style");
    styles.forEach(([label], i) => style.add(new Option(label, String(i))));
    if (now) {
      kind.value = now[0];
      value.value = now[1];
      const i = styles.findIndex(([, color, fill]) => color === now[2] && fill === now[3]);
      if (i >= 0) style.value = String(i);
    }
    // A scale's two colours: the one at the least number, white for a new scale, and the one at
    // the greatest, which the person picks.
    const low = scaled ? now[2] : "#ffffff";
    const high = ks.el("select", "rule-scale");
    high.setAttribute("aria-label", "The colour of the greatest number");
    const highs = SCALE_COLOURS.slice();
    if (scaled && !highs.some(([, hex]) => hex === now[3])) highs.push(["The colour the file names", now[3]]);
    for (const [label, hex] of highs) high.add(new Option(label, hex));
    if (scaled) high.value = now[3];
    const sync = () => {
      value.hidden = kind.value === "" || kind.value === "empty" || kind.value === "scale";
      style.hidden = kind.value === "scale";
      high.hidden = kind.value !== "scale";
      style.disabled = kind.value === "";
    };
    kind.addEventListener("change", sync);
    sync();
    panel.el.append(`Colour the cells of column ${ks.table.letters(column)} that are `, kind, value,
      " with ", style, high);
    panel.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target === value) panel.apply.click();
    });
    panel.show();
    const at = wrap.getBoundingClientRect();
    panel.el.style.left = `${Math.max(4, at.left + window.scrollX)}px`;
    panel.el.style.top = `${Math.max(window.scrollY + 4, at.top + window.scrollY - panel.el.offsetHeight - 4)}px`;
    kind.focus();
    return null;
  }

  ks.handle("column-rule", (_, c) => ask(c.block, c.column), { table: true });

  ks.rules = { paint };
}
