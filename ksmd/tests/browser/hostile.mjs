// A crafted document that tries to run script in the page, in every construct that shows text, a
// link or an image: `<script>`, `onerror=` and `onload=` attributes, SVG holding a script, and
// `javascript:` and `data:` links. The page must show the markup as text, and the reader must
// refuse a link to any other kind of address. Nothing may run, and no dialog may open.
// **The page's policy (`page.html`) is the second wall**: it lets only the page's own scripts run,
// each named by its hash. So markup that got past the first wall runs nothing either, and the
// checks put such markup in the page themselves to show it. They look for script that ran, not
// only for what the policy refused.
// Served by the local server, the same document is opened from a file of the workspace
// (`served.mjs`), where an image is shown as its pixels.
import { H, check } from "./drive.mjs";
import { markupRunsNothing } from "./policy.mjs";

// What each attempt sets, or opens, where it runs.
const SCRIPT = (n) => `<script>window.pwned=${n}</script>`;
const ONERROR = (n) => `<img src=x onerror=window.pwned=${n}>`;
const SVG = (n) => `<svg onload=alert(${n})><script>alert(${n})</script></svg>`;
const q = (text) => JSON.stringify(text);

// The attempts, each in a construct the page shows; the document's clause stands first, as it must.
export const HOSTILE = `%ksmd 2\n\n:::document header=${q(SCRIPT(1) + ONERROR(2))} footer=${q(SVG(3))}\n:::\n\n` +
  `{note=${q(ONERROR(4))}}\n# ${SCRIPT(5)} ${ONERROR(6)}\n\n` +
  `A ${SCRIPT(7)} ${ONERROR(8)} ${SVG(9)} <iframe srcdoc="x"></iframe> <a href="javascript:alert(10)">a</a>\n\n` +
  `*${SCRIPT(11)}* **${ONERROR(12)}** \`${SVG(13)}\` [${ONERROR(14)}]{color="#c00000"} ` +
  `[${SCRIPT(15)}](https://a.test/x)\n\n` +
  `- ${SCRIPT(16)}\n- [x] ${ONERROR(17)}\n\n1. ${SVG(18)}\n\n> ${ONERROR(19)}\n\n` +
  "```html\n" + SCRIPT(20) + ONERROR(21) + "\n```\n\n" +
  `:::table name="t" caption=${q(ONERROR(22))}\n| ${q(SCRIPT(23))} | "n" |\n` +
  `| ${q(ONERROR(24))} {note=${q(SVG(25))}} | 1 |\n` +
  `| ${q(SVG(26))} {link="https://a.test/y"} | ="<img src=x onerror=alert(27)>" |\n:::\n\n` +
  `:::chart table="t" kind="bar" labels=${q(SCRIPT(23))} values="n" title=${q(ONERROR(28))}\n:::\n\n` +
  `:::image src="pics/dot.png" alt=${q(ONERROR(29))} caption=${q(SCRIPT(30))}\n` +
  `draw shape="rect" from="1,1" to="9,9" text=${q(ONERROR(31))}\n:::\n\n` +
  `:::image src=${q("pics/" + ONERROR(32) + ".png")} alt="x"\n:::\n\n` +
  ':::image src="javascript:alert(33)" alt="x"\n:::\n\n' +
  ':::image src="data:image/svg+xml,<svg onload=alert(34)>" alt="x"\n:::\n\n' +
  `:::include path=${q(ONERROR(35) + ".ksmd")}\n:::\n\n` +
  `:::diagram size="600,300"\nbox id="a" at="40,60" size="100,60" text=${q(SCRIPT(36))}\n` +
  `note id="b" at="320,60" size="120,80" text=${q(ONERROR(37))}\narrow from="a" to="b" text=${q(SVG(38))}\n:::\n`;

// Texts that must show as written, each where its construct puts it.
const SHOWN = [
  ["the heading", "#doc h1", `${SCRIPT(5)} ${ONERROR(6)}`],
  ["the paragraph", "#doc p", `A ${SCRIPT(7)} ${ONERROR(8)} ${SVG(9)} <iframe srcdoc="x"></iframe>`],
  ["emphasis, code, colour and a link's label", "#doc p:nth-of-type(2)",
    `${SCRIPT(11)} ${ONERROR(12)} ${SVG(13)} ${ONERROR(14)} ${SCRIPT(15)}`],
  ["a list", "#doc .list", SCRIPT(16)],
  ["a ticked item", "#doc .list", ONERROR(17)],
  ["a numbered item", "#doc .list", SVG(18)],
  ["a quote", "#doc blockquote", ONERROR(19)],
  ["a code block", "#doc pre", SCRIPT(20) + ONERROR(21)],
  ["a table's caption", "#doc .table", ONERROR(22)],
  ["a table's header", "#doc table", SCRIPT(23)],
  ["a text cell", "#doc table", ONERROR(24)],
  ["a linked cell", "#doc table", SVG(26)],
  ["a formula's text", "#doc table", "<img src=x onerror=alert(27)>"],
  ["a chart's title", "#doc", ONERROR(28)],
  ["an image's path", "#doc", `pics/${ONERROR(32)}.png`],
  ["an include's path", "#doc", ONERROR(35)],
  ["a diagram's words", "#doc", SCRIPT(36) + ONERROR(37) + SVG(38)],
];

// Links the reader must refuse: a document holding one does not open.
export const REFUSED = [
  ["a javascript: link", `${H}[x](javascript:window.pwned=40)\n`],
  ["a javascript: link in capitals", `${H}[x](JavaScript:window.pwned=41)\n`],
  ["a data: link", `${H}[x](data:text/html,x)\n`],
  ["a vbscript: link", `${H}[x](vbscript:msgbox)\n`],
  ["a javascript: link on a cell", `${H}:::table name="t"\n| "a" {link="javascript:window.pwned=42"} |\n:::\n`],
  ["a colour that is CSS, not a colour", `${H}[x]{color="red;background:url(https://a.test/p)"}\n`],
];

// What shows that nothing ran: no flag set, no dialog, and no script, frame, handler or link to
// another kind of address in the document. `where` names the page in each check.
export async function nothingRan(js, page, dialogsBefore, where) {
  // An image's error comes after it is drawn, so the page is given time to report one.
  await new Promise((r) => setTimeout(r, 300));
  check(await js("window.pwned === undefined") && page.dialogs.length === dialogsBefore,
    `${where}: no script in the document runs, and no dialog opens`,
    `${await js("String(window.pwned)")} ${page.dialogs.slice(dialogsBefore).join(" ")}`);
  const stray = await js(`JSON.stringify((() => {
    const out = [];
    for (const el of document.querySelectorAll("#doc *")) {
      if (/^(script|iframe|object|embed|foreignobject)$/i.test(el.localName)) out.push(el.localName);
      for (const a of el.attributes) if (/^on/i.test(a.name)) out.push(el.localName + " " + a.name);
      if (el.localName === "a" && el.hasAttribute("href") && !el.getAttribute("href").startsWith("#") &&
        !/^(https|http|mailto):$/.test(el.protocol)) out.push("a " + el.getAttribute("href"));
      if (el.localName === "img" && !el.src.startsWith("blob:")) out.push("img " + el.getAttribute("src"));
    }
    return out;
  })())`);
  check(stray === "[]", `${where}: the document holds no script, frame, handler, foreign link or image`,
    stray);
}

export function hostile({ page, browser, js, settle, load }) {
  return {
    async scripts() {
      const dialogs = page.dialogs.length;
      await load(HOSTILE);
      await settle();
      await nothingRan(js, page, dialogs, "opened from a file");
      for (const [what, selector, text] of SHOWN) {
        const got = await js(`Array.from(document.querySelectorAll(${q(selector)}))` +
          ".map((e) => e.textContent).join(' | ')");
        check(got.includes(text), `the markup in ${what} shows as text`, got.slice(0, 300));
      }
      const header = await js("document.getElementById('doc').textContent");
      check(header.includes(SCRIPT(1) + ONERROR(2)) && header.includes(SVG(3)),
        "the markup in the printed header and footer shows as text", header.slice(0, 200));
      for (const [what, source] of REFUSED) {
        const r = await js(`JSON.stringify(ksmd.load(${q(source)}))`);
        check(JSON.parse(r).ok === false, `the reader refuses ${what}`, r);
      }
      check(await js("window.pwned === undefined"), "and nothing a refused document holds runs");
      // The policy is in force: the page loads nothing from outside, and evaluates no text as code.
      const before = browser.blocked.length;
      // Caution: **Run `eval` from a timer, not from the driver's call**: the browser lets code the
      // driver evaluates break the policy, as it lets its own console.
      await js("(() => { const img = new Image(); img.src = 'https://a.test/p.png'; " +
        "document.body.appendChild(img); window.evalRan = false; " +
        "setTimeout(() => { try { eval('window.evalRan = true'); } catch (_) {} }, 0); })()");
      await new Promise((r) => setTimeout(r, 300));
      const refused = browser.blocked.slice(before);
      check(refused.includes("file img-src https://a.test/p.png") && refused.some((b) => b.includes("script-src")) &&
        await js("window.evalRan") === false,
      "the page's policy refuses an image from outside and text run as code", refused.join(" | "));
      // These were the test's own; any other a later check counts against the page.
      browser.blocked.splice(before);
      await js("document.querySelectorAll('body > img').forEach((img) => img.remove())");
      await markupRunsNothing(js, page, browser);
    },
  };
}

