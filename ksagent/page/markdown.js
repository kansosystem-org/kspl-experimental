// ksagent's chat page: a lenient reader of the Markdown a model writes. The build puts it inside
// `chat.html`. It never refuses, and reads a half-written answer too, so an unclosed code fence
// runs to the end. It builds a tree of allowed elements only; `render` turns that tree into nodes,
// its text always as text nodes. Raw HTML stays text, a link goes only to http, https or mailto,
// and no image is ever loaded.
"use strict";
const ksagentMarkdown = (() => {
  const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t#]*$/;
  const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
  const QUOTE = /^ {0,3}> ?(.*)$/;
  const ITEM = /^( {0,3})([-*+]|(\d{1,9})[.)])(?:[ \t]+(.*))?$/;
  const blank = (s) => s.trim() === "";
  const indentOf = (s) => s.length - s.trimStart().length;
  // **Quotes, lists and emphasis nest at most this deep**; deeper, they read as text. A reply of
  // 20,000 `>` would otherwise nest the reader as deep, and overflow the browser's stack.
  const MAX_NEST = 8;
  // **A table holds at most this many columns**; a header with more reads as text. Each row is
  // filled out to the header's width, so a header of N `|` over N short rows would make N² cells:
  // 90 KB of text would run the tab out of memory.
  const MAX_COLUMNS = 64;

  function item(line) {
    const m = ITEM.exec(line);
    if (!m) return null;
    return { indent: m[1].length, ordered: m[3] !== undefined, start: Number(m[3] || 1),
      text: m[4] || "" };
  }
  function cells(line) {
    let s = line.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
    const out = [];
    let cur = "";
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; } else if (s[i] === "|") {
        out.push(cur.trim()); cur = "";
      } else cur += s[i];
    }
    out.push(cur.trim());
    return out;
  }
  const isDelimiter = (line) => line.includes("-") &&
    cells(line).every((c) => /^:?-+:?$/.test(c));
  const startsBlock = (line) => FENCE.test(line) || HEADING.test(line) || RULE.test(line) ||
    QUOTE.test(line) || item(line) !== null;

  function blocks(lines, depth = 0) {
    if (depth >= MAX_NEST) return [{ t: "p", c: lines.flatMap((l, k) => (k > 0 ? [{ t: "br", c: [] }, l] : [l])) }];
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (blank(line)) { i++; continue; }
      if ((m = FENCE.exec(line))) {
        const body = [];
        const close = new RegExp(`^ {0,3}${m[1][0] === "`" ? "`" : "~"}{${m[1].length},}[ \\t]*$`);
        for (i++; i < lines.length && !close.test(lines[i]); i++) body.push(lines[i]);
        i++;
        out.push({ t: "pre", c: [{ t: "code", c: [body.join("\n")] }] });
      } else if ((m = HEADING.exec(line))) {
        out.push({ t: `h${Math.min(6, m[1].length + 2)}`, c: inline(m[2] || "") });
        i++;
      } else if (RULE.test(line)) {
        out.push({ t: "hr", c: [] });
        i++;
      } else if (QUOTE.test(line)) {
        const inner = [];
        for (; i < lines.length && (m = QUOTE.exec(lines[i])); i++) inner.push(m[1]);
        out.push({ t: "blockquote", c: blocks(inner, depth + 1) });
      } else if (item(line)) {
        i = list(lines, i, out, depth);
      } else if (line.includes("|") && i + 1 < lines.length && isDelimiter(lines[i + 1]) &&
        cells(line).length <= MAX_COLUMNS) {
        i = table(lines, i, out);
      } else {
        const c = [];
        for (; i < lines.length && !blank(lines[i]) && (c.length === 0 || !startsBlock(lines[i])); i++) {
          if (c.length > 0) c.push({ t: "br", c: [] });
          c.push(...inline(lines[i].trim()));
        }
        out.push({ t: "p", c });
      }
    }
    return out;
  }

  // A list, and each item's body read as blocks again: a line indented two or more past the
  // item's marker belongs to the item, so nesting by two, three or four spaces all reads.
  function list(lines, i, out, depth) {
    const first = item(lines[i]);
    const node = { t: first.ordered ? "ol" : "ul", start: first.start, c: [] };
    while (i < lines.length) {
      const m = item(lines[i]);
      if (!m || m.ordered !== first.ordered || m.indent > first.indent + 1) break;
      const deeper = m.indent + 2;
      const body = [m.text];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (blank(l)) {
          // A run of blank lines is read once, so many of them cost time in step with their count.
          const k = filledFrom(lines, j);
          if (k === lines.length || indentOf(lines[k]) < deeper) break;
          for (; j < k - 1; j++) body.push("");
          body.push("");
        } else if (indentOf(l) >= deeper) body.push(l.slice(Math.min(indentOf(l), deeper)));
        else if (startsBlock(l)) break;
        else body.push(l.trim());
      }
      let text = body.join("\n");
      let box = "";
      const task = /^\[([ xX])\][ \t]+/.exec(text);
      if (task) { box = task[1] === " " ? "☐ " : "☑ "; text = text.slice(task[0].length); }
      // A tight item, with no blank line inside, shows its first paragraph without a margin.
      const inner = blocks(text.split("\n"), depth + 1);
      const c = inner.length > 0 && inner[0].t === "p" && !body.includes("") ?
        [...inner[0].c, ...inner.slice(1)] : inner;
      if (box) c.unshift(box);
      node.c.push({ t: "li", c });
      i = j;
      const k = filledFrom(lines, i);
      if (k < lines.length && item(lines[k])) i = k;
    }
    out.push(node);
    return i;
  }
  const filledFrom = (lines, j) => { // the first line at `j` or after that is not blank
    let k = j;
    while (k < lines.length && blank(lines[k])) k++;
    return k;
  };

  function table(lines, i, out) {
    const head = cells(lines[i]);
    const align = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ?
      "center" : "right") : ""));
    const row = (t, cs) => ({ t: "tr", c: head.map((_, k) => ({ t, align: align[k] || "",
      c: inline(cs[k] || "") })) });
    const body = [];
    for (i += 2; i < lines.length && !blank(lines[i]) && lines[i].includes("|"); i++) {
      body.push(row("td", cells(lines[i])));
    }
    out.push({ t: "table", c: [{ t: "thead", c: [row("th", head)] },
      { t: "tbody", c: body }] });
    return i;
  }

  function safeHref(url) {
    try {
      const u = new URL(url.trim());
      return ["http:", "https:", "mailto:"].includes(u.protocol) ? u.href : null;
    } catch (_) {
      return null;
    }
  }

  // The target in `(...)` at `at`: { url, end } past the `)`, or null.
  function target(s, at, sc) {
    const k = s[at] === "(" ? sc.paren.get(at) : undefined;
    if (k === undefined) return null;
    let url = s.slice(at + 1, k).trim().replace(/\s+"[^"]*"$/, "");
    if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);
    return { url, end: k + 1 };
  }

  const MARKS = ["**", "__", "~~", "*", "_"];
  const TAGS = { "**": "strong", "__": "strong", "~~": "del", "*": "em", "_": "em" };
  const word = (ch) => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

  // What reading one text inline needs, each found in one pass: where each mark can close, and
  // each bracket's and parenthesis's match. **No opening scans the rest of the text**, so a reply
  // of many unmatched marks takes time in step with its length.
  function scan(s) {
    const inCode = new Uint8Array(s.length);
    for (let k = 0; k < s.length; k++) {
      if (s[k] !== "`") continue;
      let e = k;
      while (e < s.length && s[e] === "`") e++;
      const end = s.indexOf(s.slice(k, e), e);
      if (end > 0) inCode.fill(1, k, end + e - k);
      k = (end > 0 ? end + e - k : e) - 1;
    }
    // A closing mark is preceded by a character that is not a space, and stands outside code.
    const can = Object.fromEntries(MARKS.map((m) => [m, []]));
    for (let k = 1; k < s.length; k++) {
      if (inCode[k] || /\s/.test(s[k - 1])) continue;
      for (const m of MARKS) {
        if (s.startsWith(m, k) && !(m.length === 1 && s[k + 1] === m) &&
          !(m[0] === "_" && word(s[k + m.length]))) can[m].push(k);
      }
    }
    const bracket = new Map();
    const paren = new Map();
    const open = [];
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "\\") k++;
      else if (s[k] === "[") open.push(k);
      else if (s[k] === "]" && open.length > 0) bracket.set(open.pop(), k);
    }
    open.length = 0;
    for (let k = 0; k < s.length; k++) {
      if (s[k] === "(") open.push(k);
      else if (s[k] === ")" && open.length > 0) paren.set(open.pop(), k);
    }
    return { can, bracket, paren };
  }

  // Where the closing `mark` for an opening at `at` stands, or -1. An opening must be followed,
  // and a closing preceded, by a character that is not a space, so `2 * 3 * 4` stays as it is.
  function closer(s, at, mark, sc) {
    const from = at + mark.length;
    if (from >= s.length || /\s/.test(s[from])) return -1;
    if (mark[0] === "_" && word(s[at - 1])) return -1;
    const can = sc.can[mark];
    let lo = 0;
    let hi = can.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (can[mid] <= from) lo = mid + 1; else hi = mid;
    }
    return lo < can.length ? can[lo] : -1;
  }

  function inline(s, depth = 0) {
    if (depth >= MAX_NEST) return s ? [s] : [];
    const sc = scan(s);
    const out = [];
    let text = "";
    const flush = () => { if (text) out.push(text); text = ""; };
    for (let i = 0; i < s.length;) {
      const ch = s[i];
      if (ch === "\\" && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
        text += s[i + 1]; i += 2; continue;
      }
      if (ch === "`") {
        const run = /^`+/.exec(s.slice(i))[0];
        const end = s.indexOf(run, i + run.length);
        if (end > 0) {
          let code = s.slice(i + run.length, end);
          if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ")) code = code.slice(1, -1);
          flush(); out.push({ t: "code", c: [code] }); i = end + run.length; continue;
        }
        text += run; i += run.length; continue;
      }
      const image = ch === "!" && s[i + 1] === "[";
      if (ch === "[" || image) {
        const open = image ? i + 1 : i;
        const close = sc.bracket.has(open) ? sc.bracket.get(open) : -1;
        const to = close > 0 ? target(s, close + 1, sc) : null;
        if (to) {
          const label = s.slice(open + 1, close);
          const href = safeHref(to.url);
          flush();
          const c = label ? inline(label, depth + 1) : [to.url];
          out.push(...(href ? [{ t: "a", href, c }] : c));
          i = to.end;
          continue;
        }
      }
      if (ch === "<") {
        const m = /^<([a-z][a-z0-9+.-]*:[^\s<>]+)>/i.exec(s.slice(i));
        const href = m && safeHref(m[1]);
        if (href) { flush(); out.push({ t: "a", href, c: [m[1]] }); i += m[0].length; continue; }
      }
      const mark = MARKS.find((mk) => s.startsWith(mk, i));
      if (mark) {
        const end = closer(s, i, mark, sc);
        if (end > 0) {
          flush();
          out.push({ t: TAGS[mark], c: inline(s.slice(i + mark.length, end), depth + 1) });
          i = end + mark.length;
          continue;
        }
        text += mark; i += mark.length; continue;
      }
      text += ch; i++;
    }
    flush();
    return out;
  }

  const ALLOWED = new Set(["p", "h3", "h4", "h5", "h6", "ul", "ol", "li", "pre", "code",
    "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr", "br", "strong", "em",
    "del", "a"]);
  function render(nodes, into) {
    for (const n of nodes) {
      if (typeof n === "string") { into.appendChild(document.createTextNode(n)); continue; }
      if (!ALLOWED.has(n.t)) continue;
      const el = document.createElement(n.t);
      if (n.t === "a") { el.href = n.href; el.rel = "noopener noreferrer"; el.target = "_blank"; }
      if (n.t === "ol" && n.start !== 1) el.start = n.start;
      if (n.align) el.style.textAlign = n.align;
      render(n.c, el);
      into.appendChild(el);
    }
    return into;
  }
  const parse = (text) => blocks(String(text).replace(/\r\n?/g, "\n").split("\n"));
  return { parse, render };
})();
