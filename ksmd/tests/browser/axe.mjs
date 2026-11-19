// axe-core, the automated accessibility checker, run inside a page that a browser check drives:
// ksmd's page (`main.mjs`) and ksagent's chat page (`tools/tests/chat_page.mjs`). It finds what a
// check written by hand would miss: a control with no name, a role that its element may not take,
// an `id` that ARIA points at twice, contrast too low, a heading that skips a level.
// **The checker is bundled beside this file** (`axe.min.js`, axe-core 4.14.0, MPL-2.0, listed in
// `THIRD-PARTY-NOTICES.md`), so Linux and Windows run the same bytes with no download and no
// npm. Its SHA-256 is checked before it runs, so a file changed by hand or by a checkout fails
// here, by name.
// Caution: **To move to another version, change the file and `AXE_SHA256` together**, taking the
// hash from axe-core's own `sri-history.json` of that version.
import crypto from "crypto";
import fs from "fs";
import { check } from "./drive.mjs";

const AXE_FILE = new URL("./axe.min.js", import.meta.url);
const AXE_SHA256 = "20c09fe157a8a34a30e241aaa1fcdade657734f08ab379ecfbeb7d45cc46e878";

// The rules run: WCAG 2.1's levels A and AA, and the best practices that judge what a page states
// rather than how its author chose to lay it out.
// Two best practices are left out, for every page. `region` asks that all content stand in a
// landmark, and `page-has-heading-one` that the page hold an `<h1>`. On the editing page the
// headings are the document's own, which its writer chooses, and both pages name their parts as
// landmarks already (checked by hand in each page's own checks).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const NOT_TAKEN = ["region", "page-has-heading-one"];

let source = null;

// The checker's text, once its hash has been checked; null where the file is not the one named.
function axeSource() {
  if (source !== null) return source;
  const bytes = fs.readFileSync(AXE_FILE);
  const got = crypto.createHash("sha256").update(bytes).digest("hex");
  check(got === AXE_SHA256, "the bundled axe-core is the version named in axe.mjs", got);
  source = got === AXE_SHA256 ? bytes.toString("utf8") : "";
  return source;
}

// The violations axe finds in the page as it stands now, one line each: the rule, then each
// element it names, by axe's selector.
// **No rule is waived for one element**: none needs it, so none is let pass unseen.
export async function violations(js) {
  const text = axeSource();
  if (text === "") return ["axe-core: the bundled file is not the version named"];
  // **The checker is put into the page anew after each load**, since a reload drops it. It runs
  // as the driver's code, so the page's own policy does not apply to it.
  if (!await js("typeof window.axe === 'object'")) await js(`${text};true`);
  const options = { runOnly: { type: "tag", values: TAGS },
    rules: Object.fromEntries(NOT_TAKEN.map((r) => [r, { enabled: false }])), resultTypes: ["violations"] };
  return js(`axe.run(document, ${JSON.stringify(options)}).then((r) => r.violations.map((v) =>
    v.id + ": " + v.nodes.map((n) => n.target.join(" ")).join(", ")))`);
}

// A check that axe finds nothing in the page in the state `what` names.
export async function accessible(js, what) {
  const found = await violations(js);
  check(found.length === 0, `axe-core finds no violation: ${what}`, found.join(" | ").slice(0, 2000));
}

// **The checker can fail**: a button with no name, put into the page, is named by its rule and its
// element. The button is taken out again, so it counts against nothing after.
export async function planted(js) {
  await js("(() => { const b = document.createElement('button'); b.id = 'axe-planted'; " +
    "document.body.appendChild(b); })()");
  const found = await violations(js);
  await js("document.getElementById('axe-planted').remove()");
  check(found.some((v) => v.startsWith("button-name: ") && v.includes("#axe-planted")),
    "axe-core names a button with no name, planted in the page, by its rule and its element",
    found.join(" | ").slice(0, 500));
}
