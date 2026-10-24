// What a document costs in the page, in a headless Chromium: opening it, a key press, a cell edit,
// a column resize and a save, on the documents `tests/measure.kspl` writes. Each step runs five
// times, and the middle time is printed. An edit is timed from the browser's input event to the
// end of the page's change, the page's layout included; painting is not.
// Usage: node tests/browser/measure.mjs <chromium> <ksmd.html> <work folder> <documents> [<kssrv>]
// (`make measure`). Without a kssrv, the served page is not measured.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { launch } from "./cdp.mjs";
import { ALT, driver } from "./drive.mjs";
import { start } from "./served.mjs";

const [binary, pageFile, work, folder, kssrv] = process.argv.slice(2);
const RUNS = 5;
const browser = await launch(binary, work);
const d = driver(browser.page);

const middle = (times) => times.slice().sort((a, b) => a - b)[Math.floor(times.length / 2)];
const shown = (what, times) => console.log(`  ${what}: ${middle(times).toFixed(1)} ms`);

// The time from the next event of `type` on the document to the end of the change it makes.
const stopwatch = (type) => d.js(`(() => {
  window.took = null;
  document.addEventListener(${JSON.stringify(type)}, () => { window.began = performance.now(); },
    { capture: true, once: true });
  ksmd.onchange = () => {
    document.getElementById("doc").getBoundingClientRect();
    window.took = performance.now() - window.began;
  };
})()`);
const took = async () => {
  await d.until("window.took !== null", 20000);
  return d.js("window.took");
};

// A page of its own for each opening: the editor holds the open document while it reads the next,
// so the large one opens only beside a small one.
async function fresh() {
  await d.page("Page.navigate", { url: pathToFileURL(path.resolve(pageFile)).href });
  await d.until("document.documentElement.dataset.ready === '1'");
}

async function inPage(name) {
  const text = fs.readFileSync(path.join(folder, name), "utf8");
  const open = [];
  for (let i = 0; i < RUNS; i++) {
    await fresh();
    await d.js(`window.measured = ${JSON.stringify(text)}; true`);
    open.push(await d.js(`(() => {
      const t = performance.now();
      const r = ksmd.load(window.measured);
      document.getElementById("doc").getBoundingClientRect();
      if (!r.ok) throw new Error(r.why);
      return performance.now() - t;
    })()`));
  }
  const key = [];
  for (let i = 0; i < RUNS; i++) {
    await d.js(`(() => {
      const doc = document.getElementById("doc");
      const last = doc.lastElementChild;
      last.scrollIntoView();
      doc.focus();
      const text = last.lastChild;
      window.getSelection().setBaseAndExtent(text, text.length, text, text.length);
    })()`);
    await stopwatch("beforeinput");
    await d.press("x");
    key.push(await took());
  }
  // A count in the middle of the first table, then the cell below it, and so on.
  const rows = await d.js("document.querySelector('#doc table').tBodies[0].rows.length");
  const cell = `#doc .table td[data-r="${Math.floor(rows / 2)}"][data-c="1"]`;
  await d.js(`document.querySelector('${cell}').scrollIntoView({ block: "center" })`);
  await d.click(cell);
  await d.until("document.activeElement.classList.contains('cell-input')");
  const edit = [];
  for (let i = 0; i < RUNS; i++) {
    await d.type("7");
    await stopwatch("keydown");
    await d.press("Enter");
    edit.push(await took());
    await d.until("document.activeElement.classList.contains('cell-input')");
  }
  const resize = [];
  for (let i = 0; i < RUNS; i++) {
    await stopwatch("keydown");
    await d.press(i % 2 === 0 ? "ArrowRight" : "ArrowLeft", ALT);
    resize.push(await took());
    await d.until("document.activeElement.classList.contains('cell-input')");
  }
  const save = [];
  for (let i = 0; i < RUNS; i++) {
    save.push(await d.js("(() => { const t = performance.now(); ksmd.source(); return performance.now() - t; })()"));
  }
  await d.js("ksmd.onchange = null; window.measured = null; true");
  console.log(`${name}, opened from a file:`);
  shown("open: read, calculate and show every block", open);
  shown("a key typed at the end: the transaction and the blocks shown again", key);
  shown("a cell's value entered: the transaction, every table calculated and shown again", edit);
  shown("Alt+Right or Alt+Left in a cell: the widths set and the table shown again", resize);
  shown("the canonical source a save writes", save);
}

// Polls every 10 ms, so a time here is good to about 10 ms.
async function waited(page, expression) {
  const t = Date.now();
  for (;;) {
    if (await page.js(expression).catch(() => false) === true) return Date.now() - t;
    if (Date.now() - t > 60000) throw new Error(`waited a minute for ${expression}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

async function served(server, name) {
  const open = [];
  const save = [];
  for (let i = 0; i < RUNS; i++) {
    const t = Date.now();
    const p = driver(await browser.open(server.url(`?doc=${name}`)));
    await waited(p, "document.documentElement.dataset.files === 'ready'");
    open.push(Date.now() - t);
    // A document the editor's memory cannot hold is reported, and not timed further.
    if (!await p.js("!!document.getElementById('doc').lastElementChild")) {
      console.log(`${name}, served by kssrv --local: did not open after ${open[0]} ms: ` +
        `${await p.js("document.getElementById('status').textContent")}`);
      await browser.closeTab(p.page);
      return;
    }
    await p.js(`(() => {
      const doc = document.getElementById("doc");
      const text = doc.lastElementChild.lastChild;
      doc.focus();
      window.getSelection().setBaseAndExtent(text, text.length, text, text.length);
    })()`);
    await p.press("x");
    // The draft is held a second after typing stops; the save is timed after it.
    await waited(p, "document.querySelector('.menubar .state').textContent.includes('draft')");
    const s = Date.now();
    await p.press("s", 2);
    await waited(p, "document.documentElement.dataset.files === 'ready' && " +
      "document.querySelector('.menubar .state').textContent === ''");
    save.push(Date.now() - s);
    await browser.closeTab(p.page);
  }
  console.log(`${name}, served by kssrv --local:`);
  shown("open: the page, its wasm, the files fetched, read, assembled, calculated and shown", open);
  shown("Ctrl+S: read the file again, compare, write it, and show the result", save);
}

try {
  await fresh();
  console.log(`browser: ${await d.js("navigator.userAgent")}`);
  for (const name of ["typical.ksmd", "medium.ksmd", "large.ksmd"]) await inPage(name);
  if (!kssrv) {
    console.log("No kssrv was given, so the served page is not measured.");
  } else {
    const server = await start(kssrv, folder, pageFile, path.join(work, "kssrv.log"));
    try {
      for (const name of ["typical.ksmd", "medium.ksmd", "large.ksmd"]) await served(server, name);
    } finally {
      await server.stop();
    }
  }
} finally {
  await browser.close();
}
