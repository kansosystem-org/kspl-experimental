// Writes the list of every menu, its commands and their keys into the editing page's reference
// (`ksmd/docs/SPEC-editing-page.md`, under "Every command and its key"), or checks that it is
// current. The list comes from `commands.js`, the one list the page builds its menus from, so
// the reference cannot name a command the page lacks, or miss one it has.
// Usage, from the repository's root: node ksmd/port/web/reference.mjs
// (`make ksmd-reference` writes it; `make test-ksmd-browser` checks it).
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SPEC = path.join(HERE, "..", "..", "docs", "SPEC-editing-page.md");
export const HEADING = "## Every command and its key";

// The page's lists, read by running `commands.js` alone: it only defines them.
function lists() {
  const source = fs.readFileSync(path.join(HERE, "commands.js"), "utf8");
  return vm.runInNewContext(`${source}\n;({ COMMANDS, MENUS, TABLE_GROUPS })`, {});
}

// One row per command, in the menu's order; a flyout's commands take its name before theirs.
function rows(items, COMMAND, under, out) {
  for (const it of items) {
    if (it === "-") continue;
    if (Array.isArray(it)) {
      rows(it[1], COMMAND, [...under, it[0]], out);
      continue;
    }
    const { label, key } = COMMAND.get(it);
    const name = [...under, label].join(" ▸ ");
    out.push(`| ${name} | ${key ? key.split("+").map((k) => `\`${k}\``).join("+") : ""} |`);
  }
}

// The section's body, from its heading to the next heading.
export function body() {
  const { COMMANDS, MENUS, TABLE_GROUPS } = lists();
  const COMMAND = new Map(COMMANDS.map(([name, label, key]) => [name, { label, key }]));
  const out = ["", "**This list is written from the page's own list of commands** (`make ksmd-reference`), " +
    "so it names every command the page has, with its key.", ""];
  for (const [menu, items] of MENUS) {
    out.push(`### ${menu}`, "", "| Command | Key |", "| :-- | :-- |");
    rows(items, COMMAND, [], out);
    out.push("");
  }
  const groups = TABLE_GROUPS.map(([name]) => name).join(", ");
  out.push("**A table's right-click menu holds Cut, Copy, Copy formula, Paste and Paste values, then the Table menu's groups.** " +
    `They are ${groups}.`, "");
  return out.join("\n");
}

// The reference with the section's body put in place of the one it holds.
export function written(text) {
  const start = text.indexOf(`\n${HEADING}\n`);
  if (start < 0) throw new Error(`${SPEC} holds no heading "${HEADING}"`);
  const from = start + HEADING.length + 2;
  const next = text.slice(from).search(/\n## /);
  const to = next < 0 ? text.length : from + next + 1;
  return `${text.slice(0, from)}${body()}${text.slice(to)}`;
}

// Run as a program, it writes the list into the reference. The browser's checks hold it current
// (`module` in `ksmd/tests/browser/main.mjs`).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  fs.writeFileSync(SPEC, written(fs.readFileSync(SPEC, "utf8")));
  console.log(`wrote the commands into ${path.relative(process.cwd(), SPEC)}`);
}
