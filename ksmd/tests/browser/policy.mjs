// What a page's Content-Security-Policy must hold, for each page that lets only its own scripts
// run: ksmd's page (`main.mjs`, `hostile.mjs`) and ksagent's chat page
// (`tools/tests/chat_page.mjs`). The build writes one hash for each script (`__SCRIPT_HASHES__` in
// `kssrv/page/bundle.kspl`); these checks hold the built page and the browser to it.
import crypto from "crypto";
import fs from "fs";
import { check } from "./drive.mjs";

// Markup put straight into the page, as a slip in the page's escaping would put it, runs nothing.
// A handler, an SVG's handler, a script element made to run, and a `javascript:` link are each
// refused by the policy alone. `js` evaluates in the page; `page` and `browser` are `cdp.mjs`'s.
export async function markupRunsNothing(js, page, browser) {
  const before = browser.blocked.length;
  const dialogs = page.dialogs.length;
  // Caution: **Make the markup from a timer, not from the driver's call**: the browser lets code
  // the driver evaluates break the policy, as it lets its own console.
  await js(`(() => { setTimeout(() => {
    const box = document.createElement("div");
    box.className = "slipped";
    document.body.appendChild(box);
    box.insertAdjacentHTML("beforeend", '<img src=x onerror="window.pwned=90">' +
      '<svg onload="alert(91)"></svg>');
    box.appendChild(document.createRange().createContextualFragment("<script>window.pwned=92</script>"));
    box.insertAdjacentHTML("beforeend", '<a href="javascript:window.pwned=93">a</a>');
    box.querySelector("a").click();
  }, 0); })()`);
  await new Promise((r) => setTimeout(r, 300));
  const refused = browser.blocked.slice(before);
  check(await js("window.pwned === undefined") && page.dialogs.length === dialogs,
    "markup put into the page runs no handler, script or javascript: link",
    `${await js("String(window.pwned)")} ${page.dialogs.slice(dialogs).join(" ")}`);
  check(refused.filter((b) => b.includes("script-src")).length >= 3,
    "the page's policy is what refused them", refused.join(" | "));
  // These were the test's own; any other a later check counts against the page.
  browser.blocked.splice(before);
  await js("document.querySelectorAll('.slipped').forEach((box) => box.remove())");
}

// The built page's policy lets exactly its own scripts run: one hash for each inline script, the
// sources `others` names (ksmd's page: its wasm), and none of the words that would let any
// script run. So an edit that adds a script without the build's hash, or widens the policy,
// fails here.
export function policyListsItsScripts(pageFile, others) {
  const html = fs.readFileSync(pageFile, "utf8");
  const meta = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  check(meta !== null, "the built page carries its policy in a <meta>");
  if (meta === null) return;
  const parts = Object.fromEntries(meta[1].split(";").map((d) => d.trim().split(/\s+/))
    .map(([name, ...sources]) => [name, sources]));
  // The browser's parser reads every line end as `\n` before a script sees its text.
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  const want = scripts.map(([, , body]) => "'sha256-" + crypto.createHash("sha256")
    .update(body.replace(/\r\n?/g, "\n")).digest("base64") + "'");
  const hashes = (parts["script-src"] || []).filter((s) => s.startsWith("'sha256-"));
  const other = (parts["script-src"] || []).filter((s) => !s.startsWith("'sha256-"));
  check(scripts.length > 1 && scripts.every(([, attrs]) => attrs === ""),
    "every script of the built page stands inline", scripts.map(([, a]) => a).join(" | "));
  check(JSON.stringify([...hashes].sort()) === JSON.stringify([...want].sort()),
    "the policy lists the hash of each of the page's scripts, and no other",
    `${hashes.length} listed, ${want.length} scripts`);
  check(JSON.stringify(other) === JSON.stringify(others),
    "the policy lets no other script run", other.join(" "));
  check(!("script-src-elem" in parts) && !("script-src-attr" in parts) &&
    JSON.stringify(parts["default-src"]) === JSON.stringify(["'none'"]),
  "no other rule widens what may run", meta[1].slice(0, 200));
}
