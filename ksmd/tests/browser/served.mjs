// The ksmd page served by `kssrv --local` on a scratch workspace: opening, saving and reopening,
// a change made on disk, seen at once while the page is looked at, a draft that outlives its tab,
// an included file edited in a tab of its own, images, and the refusals. Every check that writes
// compares the bytes on disk. Drafts and many tabs are `drafts.mjs`; each way the page could lose
// edits is `losses.mjs`.
// The server is the one the repository builds; it is started on port 0 and stopped by asking it
// (`kssrv.mjs`).
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { CTRL, H, check, driver, verdict } from "./drive.mjs";
import { request, start } from "./kssrv.mjs";
import { drafts } from "./drafts.mjs";
import { losses } from "./losses.mjs";
import { own } from "./own.mjs";
import { redraws } from "./redraws.mjs";


// A 1 by 1 PNG that a browser decodes.
const DOT = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAC" +
  "hwGA60e6kgAAAABJRU5ErkJggg==", "base64");

// A PNG's signature and IHDR chunk naming a size; nothing after it is ever decoded.
function pngHeader(width, height) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  b[24] = 8;
  b[25] = 2;
  return b;
}

// A grey PNG that a browser decodes, of any size: one byte per pixel, each row unfiltered.
function grayPng(width, height) {
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const b = Buffer.alloc(body.length + 8);
    b.writeUInt32BE(data.length, 0);
    body.copy(b, 4);
    b.writeUInt32BE(crc(body), body.length + 4);
    return b;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8;
  const rows = Buffer.alloc((width + 1) * height, 0xee);
  for (let r = 0; r < height; r++) rows[r * (width + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const IMAGES = ':::image src="pics/dot.png" alt="A dot"\n:::\n\n' +
  ':::image src="pics/huge.png" alt="Huge"\n:::\n\n:::image src="pics/fake.png" alt="Fake"\n:::\n\n' +
  ':::image src="pics/none.png" alt="None"\n:::\n';
const TOP = `${H}# Top\n\nFirst paragraph.\n\n:::include path="parts/notes.ksmd"\n:::\n\n${IMAGES}`;
const NOTES = `${H}Note text.\n\n## Notes heading\n\n:::table name="t"\n| "a" | "b" |\n| 2 | =A1*3 |\n:::\n`;

export async function served(browser, pageFile, work, kssrv, builder) {
  verdict.part = "served";
  if (!kssrv) {
    verdict.skip("no kssrv was given, so opening and saving files is not checked");
    return;
  }
  const root = path.join(work, "ws");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, "parts"), { recursive: true });
  fs.mkdirSync(path.join(root, "pics"), { recursive: true });
  fs.writeFileSync(path.join(root, "top.ksmd"), TOP);
  fs.writeFileSync(path.join(root, "parts/notes.ksmd"), NOTES);
  fs.writeFileSync(path.join(root, "pics/dot.png"), DOT);
  fs.writeFileSync(path.join(root, "pics/huge.png"), pngHeader(5000, 5000));
  fs.writeFileSync(path.join(root, "pics/fake.png"), "GIF89a, not a PNG though named one");
  let server;
  try {
    // **The builder is named where it is given**, as the launcher names it.
    server = await start(kssrv, root, pageFile, path.join(work, "kssrv.log"),
      builder ? [`--builder=${path.resolve(builder)}`, `--allowed=${path.resolve(work, "allowed.txt")}`] : []);
  } catch (e) {
    check(false, "the local server starts", e.message);
    return;
  }
  const ctx = { browser, root, server, kssrv, builder, pageFile, work,
    disk: (rel) => read(root, rel) };
  try {
    for (const [name, run] of Object.entries(SECTIONS)) {
      verdict.part = `served ${name}`;
      try {
        await run(ctx);
      } catch (e) {
        check(false, "the section ran to its end", e.message);
      }
    }
  } finally {
    await server.stop();
  }
}

function read(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch (_) {
    return null;
  }
}

// Every file under the root, with its bytes, so a check sees that nothing else was written.
// Each name is written with `/`, as a document names a file, on Windows too.
function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(`${path.relative(root, full).split(path.sep).join("/")}=${st.isSymbolicLink() ? "link" :
        fs.readFileSync(full).toString("base64")}`);
    }
  };
  walk(root);
  return out.join("\n");
}

// A new tab on the page, once it has opened what its address names. `script` runs in the page
// before the page's own, as a browser's settings would take effect.
async function tab(ctx, query = "", script = null) {
  let page;
  if (script === null) {
    page = await ctx.browser.open(ctx.server.url(query));
  } else {
    page = await ctx.browser.open("about:blank");
    await page("Page.addScriptToEvaluateOnNewDocument", { source: script });
    await page("Page.navigate", { url: ctx.server.url(query) });
  }
  const d = driver(page);
  if (!await d.until("document.documentElement.dataset.files === 'ready'")) {
    // Say what the page showed, so a failure seen once can be traced.
    const seen = await d.js("JSON.stringify({ files: document.documentElement.dataset.files, " +
      "url: location.href, said: (document.querySelector('.menubar .state') || {}).textContent })")
      .catch((e) => `unreadable: ${e.message}`);
    throw new Error(`the served page did not get ready: ${seen}`);
  }
  return d;
}

// Waits for the page's file steps to end, after a key or a press started one.
async function idle(d) {
  await d.settle();
  return d.until("document.documentElement.dataset.files === 'ready'");
}

// Waits until a file on disk holds `want`, or the cap passes. **A file step started by a dialog's
// button can begin after `idle` has looked**, so a check that reads the disk at once can come
// before the write it checks.
async function onDisk(ctx, rel, want, ms = 10000) {
  const end = Date.now() + ms;
  while (ctx.disk(rel) !== want && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
  return ctx.disk(rel) === want;
}

const said = (d) => d.js("document.getElementById('status').textContent");
const noticed = (d) => d.js("(() => { const n = document.getElementById('notice'); " +
  "return n.hidden ? '' : n.querySelector('.notice-text').textContent; })()");

// Presses the notice's button whose label starts with `label`.
async function choose(d, label) {
  await d.js(`Array.from(document.querySelectorAll('#notice button'))
    .find((b) => b.textContent.startsWith(${JSON.stringify(label)})).click()`);
  await idle(d);
}

// Opens a document through File, Open: each folder by a press, then the document by a double press.
async function openInDialog(d, steps) {
  await d.menu("file-open");
  for (const [k, name] of steps.entries()) {
    const button = `Array.from(document.querySelectorAll('#browse .browse-list button'))
      .find((b) => b.textContent === ${JSON.stringify(name)})`;
    await d.until(`!!${button}`);
    await d.js(k < steps.length - 1 ? `${button}.click()` :
      `${button}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  }
  await idle(d);
}

async function typeAtEnd(d, block, text) {
  const len = await d.js(`Array.from(document.getElementById('doc').children)
    .filter((e) => !e.classList.contains('gap'))[${block}].textContent.length`);
  await d.select(block, 0, len);
  await d.type(text);
  await d.settle();
}

const SECTIONS = {
  async open(ctx) {
    const before = snapshot(ctx.root);
    const d = await tab(ctx, "?doc=top.ksmd");
    check(await d.js("location.href.indexOf('#') < 0 && location.search === '?doc=top.ksmd'"),
      "the token leaves the address once read; the document's path stays");
    check(await d.js("ksmd.source()") === TOP, "the file opens as it stands on disk");
    const inside = await d.js("document.querySelector('#doc .include .inside').textContent");
    check(inside.includes("Note text.") && await d.js(
      "document.querySelector('#doc .include td[data-r=\"0\"][data-c=\"1\"]').textContent") === "6",
    "the included file shows in place, its table calculated", inside);
    check(await d.until("(() => { const i = document.querySelector('figure[data-to=\"pics/dot.png\"] " +
      "img'); return !!i && i.complete && i.naturalWidth === 1; })()"),
    "a PNG beside the document shows decoded at its clause");
    const shown = (src) => d.js(`document.querySelector('figure[data-to="${src}"]').textContent`);
    check((await shown("pics/huge.png")).includes("more than 16 million pixels"),
      "an image over 16 million pixels is refused at its clause, read from its header",
      await shown("pics/huge.png"));
    check((await shown("pics/fake.png")).includes("not a PNG or JPEG"),
      "a file that is not PNG or JPEG is refused, whatever its name", await shown("pics/fake.png"));
    check((await shown("pics/none.png")).includes("no file stands at this path"),
      "a missing image is an error at its clause", await shown("pics/none.png"));
    // The printed page's header: the document's name in the middle, and the time of the print.
    const printed = (name) => d.js(`getComputedStyle(document.documentElement).getPropertyValue('${name}').trim()`);
    check(await printed("--print-name") === '"top.ksmd"', "a printed page's header names the open document",
      await printed("--print-name"));
    await d.js("window.dispatchEvent(new Event('beforeprint'))");
    check(/\d/.test(await printed("--print-date")), "and gives the time of the print", await printed("--print-date"));
    await d.menu("contents");
    const listed = await d.js("Array.from(document.querySelectorAll('.contents-list li'))" +
      ".map((li) => `${li.className}:${li.textContent}`).join('|')");
    check(listed === "level-1:Top|level-2 included:Notes headingparts/notes.ksmd",
      "the contents list an included file's heading in its place, marked with its file", listed);
    await d.menu("contents");
    check(snapshot(ctx.root) === before, "opening writes nothing");
    await ctx.browser.closeTab(d.page);
  },

  async save(ctx) {
    const d = await tab(ctx, "?doc=top.ksmd");
    await typeAtEnd(d, 1, " More.");
    check(await d.js("document.querySelector('.menubar .state').textContent") !== "",
      "an edit shows that the document is not saved");
    await d.press("s", CTRL);
    await idle(d);
    const want = TOP.replace("First paragraph.", "First paragraph. More.");
    check(ctx.disk("top.ksmd") === want, "Ctrl+S writes the canonical source to its own file",
      JSON.stringify(ctx.disk("top.ksmd")));
    check(ctx.disk("parts/notes.ksmd") === NOTES, "saving the parent leaves the included file");
    const names = snapshot(ctx.root).split("\n").map((l) => l.split("=")[0]).join(" ");
    check(names === "parts/notes.ksmd pics/dot.png pics/fake.png pics/huge.png top.ksmd",
      "a save leaves no other file, a part file included", names);
    check((await said(d)) === "Saved top.ksmd." &&
      await d.js("document.querySelector('.menubar .state').textContent") === "",
    "the page says it saved, and no longer says unsaved");
    await d.reload("document.documentElement.dataset.files === 'ready'");
    check(await d.js("ksmd.source()") === want, "a reload opens the saved file again");
    await ctx.browser.closeTab(d.page);
  },

  async external(ctx) {
    const d = await tab(ctx, "?doc=top.ksmd");
    const theirs = ctx.disk("top.ksmd").replace("# Top", "# Their title");
    fs.writeFileSync(path.join(ctx.root, "top.ksmd"), theirs);
    await d.js("window.dispatchEvent(new Event('focus'))");
    await idle(d);
    check(await d.js("ksmd.source()") === theirs,
      "a change on disk shows when the page is looked at again, where nothing is unsaved");
    await typeAtEnd(d, 1, " Mine.");
    const second = theirs.replace("First paragraph.", "Their paragraph.");
    fs.writeFileSync(path.join(ctx.root, "top.ksmd"), second);
    await d.press("s", CTRL);
    await idle(d);
    check((await noticed(d)).includes("changed on disk") && ctx.disk("top.ksmd") === second,
      "a save over a file changed on disk writes nothing and asks", await noticed(d));
    // A double press: the second press must not write again over the file the first one wrote.
    await d.js(`(() => {
      const b = Array.from(document.querySelectorAll('#notice button'))
        .find((x) => x.textContent.startsWith("Replace the file"));
      b.click();
      b.click();
    })()`);
    await idle(d);
    const mine = await d.js("ksmd.source()");
    check(mine.includes("Mine.") && ctx.disk("top.ksmd") === mine,
      "choosing to replace it writes this page's version", JSON.stringify(ctx.disk("top.ksmd")));
    check(await noticed(d) === "" && await said(d) === "Saved top.ksmd.",
      "a notice runs one choice: a double press saves once, and no change on disk is reported",
      `${await noticed(d)} | ${await said(d)}`);
    await typeAtEnd(d, 1, " Again.");
    const third = mine.replace("# Their title", "# Third title");
    fs.writeFileSync(path.join(ctx.root, "top.ksmd"), third);
    await d.js("window.dispatchEvent(new Event('focus'))");
    await idle(d);
    check((await noticed(d)).includes("changed on disk"),
      "looked at again with unsaved edits, the page asks before anything is replaced");
    await choose(d, "Load the file's version");
    check(await d.js("ksmd.source()") === third && ctx.disk("top.ksmd") === third,
      "choosing the file's version shows it and writes nothing");
    check((await noticed(d)).includes("held aside as a draft"),
      "and this page's version is held aside as a draft", await noticed(d));
    await choose(d, "Discard them");
    await ctx.browser.closeTab(d.page);
  },

  // A key typed while the page loads a file changed on disk is never overwritten. The page holds
  // the second digest it takes, the first after it decided that nothing is unsaved, and the key
  // is typed while it is held. Before the fix, `take` took that digest just before laying in the
  // file's bytes, so the bytes replaced the key, and no draft held it.
  async typedWhileLoading(ctx) {
    const file = path.join(ctx.root, "top.ksmd");
    const before = ctx.disk("top.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    await d.js(`window.digests = 0;
      window.held = null;
      const real = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = (...args) => {
        window.digests += 1;
        if (window.digests !== 2) return real(...args);
        return new Promise((r) => { window.held = () => r(real(...args)); });
      };`);
    const theirs = before.replace("First paragraph.", "Their paragraph.");
    fs.writeFileSync(file, theirs);
    await d.js("window.dispatchEvent(new Event('focus'))");
    await d.until("window.held !== null", 3000);
    await typeAtEnd(d, 1, " Typed.");
    await d.js("window.held && window.held()");
    await idle(d);
    check((await d.js("ksmd.source()")).includes(" Typed."),
      "a key typed while a file changed on disk is loaded stays on the page");
    await d.press("s", CTRL);
    await idle(d);
    fs.writeFileSync(file, before);
    await ctx.browser.closeTab(d.page);
  },

  // While the page is looked at, it notices a change on disk by itself: no focus event is sent,
  // and none may arrive. Hidden, it asks nothing until it is shown again.
  async watched(ctx) {
    const file = path.join(ctx.root, "top.ksmd");
    const before = ctx.disk("top.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    await d.page("Emulation.setFocusEmulationEnabled", { enabled: true });
    await idle(d);
    await d.js(`window.focused = 0;
      window.shown = 0;
      window.addEventListener("focus", () => { window.focused += 1; });
      document.addEventListener("visibilitychange", () => { window.shown += 1; });
      window.fetched = [];
      const send = window.fetch;
      window.fetch = function (url, how) {
        if (!how || !how.method) window.fetched.push(String(url));
        return send.call(window, url, how);
      };`);
    // The source changes before the step that loads it ends and says so.
    const shows = (text) => d.until(`ksmd.source() === ${JSON.stringify(text)} && ` +
      "document.documentElement.dataset.files === 'ready'", 10000);
    check(await d.js("document.visibilityState === 'visible' && document.hasFocus()"),
      "the page is visible and has the focus");
    const theirs = before.replace("First paragraph.", "An answer another program wrote.");
    fs.writeFileSync(file, theirs);
    check(await shows(theirs) && (await said(d)).includes("The page shows it as it is now"),
      "a change on disk shows within ten seconds while the page is looked at", await said(d));
    // A change time not yet past when the page asks cannot rule out a later write of the same
    // size in that second. So the page compares the bytes, and finds the second write.
    const ahead = new Date(Date.now() + 3600 * 1000);
    const second = theirs.replace("An answer", "A reply,");
    fs.writeFileSync(file, second);
    fs.utimesSync(file, ahead, ahead);
    check(await shows(second), "a change whose time is still ahead shows too");
    // The same size as `second`, so only the bytes tell them apart.
    const third = second.replace("A reply,", "A third,");
    fs.writeFileSync(file, third);
    fs.utimesSync(file, ahead, ahead);
    check(await shows(third), "and so does a write of the same size and the same change time");
    check(await d.js("window.focused + window.shown") === 0, "and no focus or visibility event came",
      String(await d.js("window.focused + window.shown")));

    // Hidden, the page asks nothing; shown again, it reads its file at once.
    await d.js(`Object.defineProperty(document, "visibilityState", { configurable: true,
      get: () => "hidden" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));`);
    await idle(d);
    const hidden = third.replace("A third,", "Unseen,");
    fs.writeFileSync(file, hidden);
    const asked = await d.js("window.fetched.length");
    await d.js("new Promise((r) => setTimeout(r, 4500))");
    check(await d.js("ksmd.source()") === third && await d.js("window.fetched.length") === asked,
      "a hidden page asks the server nothing, and shows the file as it was",
      (await d.js("window.fetched.slice(-3).join(' ')")) || "");
    await d.js(`delete document.visibilityState; delete document.hidden;
      document.dispatchEvent(new Event("visibilitychange"));`);
    check(await shows(hidden), "shown again, it shows the file as it is now");

    // The page's own save is no change: nothing but the file itself is read again.
    await typeAtEnd(d, 1, " Saved here.");
    await d.press("s", CTRL);
    await idle(d);
    const mine = await d.js("ksmd.source()");
    await d.js("window.fetched = []");
    await d.js("new Promise((r) => setTimeout(r, 4500))");
    const after = await d.js("window.fetched.filter((u) => !u.includes('top.ksmd'))" +
      ".map((u) => decodeURIComponent(u)).join(' ')");
    check(ctx.disk("top.ksmd") === mine && after === "" && (await said(d)) === "Saved top.ksmd.",
      "the page's own save is not taken for a change on disk", `${after} | ${await said(d)}`);

    // With edits unsaved, the change asks once, as a save would, and the edits stay.
    await typeAtEnd(d, 1, " Unsaved.");
    const edited = await d.js("ksmd.source()");
    const outside = mine.replace("Saved here.", "Changed there.");
    fs.writeFileSync(file, outside);
    check(await d.until("!document.getElementById('notice').hidden", 10000) &&
      (await noticed(d)).includes("changed on disk") && await d.js("ksmd.source()") === edited &&
      ctx.disk("top.ksmd") === outside,
    "with edits unsaved, the change shows the notice, and neither version is lost", await noticed(d));
    await choose(d, "Keep editing");
    await d.js("new Promise((r) => setTimeout(r, 4500))");
    check(await d.js("document.getElementById('notice').hidden") &&
      await d.js("ksmd.source()") === edited, "the notice does not come back for the same change");
    check(await d.js("window.focused") === 0, "no focus event came in the whole section");
    await d.press("s", CTRL);
    await idle(d);
    await choose(d, "Replace the file");
    fs.writeFileSync(file, before);
    await ctx.browser.closeTab(d.page);
  },

  async recovery(ctx) {
    const before = ctx.disk("top.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    await typeAtEnd(d, 1, " Unsaved.");
    const edited = await d.js("ksmd.source()");
    check(await d.until("document.querySelector('.menubar .state').textContent.includes('draft')"),
      "a pause in typing holds a draft in the browser");
    await ctx.browser.closeTab(d.page);
    check(ctx.disk("top.ksmd") === before, "a draft is never written to the document's file");
    const e = await tab(ctx, "?doc=top.ksmd");
    check((await noticed(e)).includes("held aside as a draft"),
      "the document opened again offers the draft of the closed tab", await noticed(e));
    await choose(e, "Bring them back");
    check(await e.js("ksmd.source()") === edited && ctx.disk("top.ksmd") === before,
      "the draft comes back as unsaved edits");
    await e.press("s", CTRL);
    await idle(e);
    check(ctx.disk("top.ksmd") === edited, "and saves as any edit does");
    await ctx.browser.closeTab(e.page);
    const f = await tab(ctx, "?doc=top.ksmd");
    await typeAtEnd(f, 1, " Crashed.");
    const lost = await f.js("ksmd.source()");
    await f.until("document.querySelector('.menubar .state').textContent.includes('draft')");
    try {
      await f.page("Page.crash", {});
    } catch (_) { /* the tab is gone */ }
    await ctx.browser.closeTab(f.page).catch(() => {});
    const g = await tab(ctx, "?doc=top.ksmd");
    await choose(g, "Bring them back");
    check(await g.js("ksmd.source()") === lost && ctx.disk("top.ksmd") === edited,
      "a draft outlives a tab that crashed");
    await g.press("s", CTRL);
    await idle(g);
    await ctx.browser.closeTab(g.page);
    const h = await tab(ctx, "?doc=top.ksmd");
    await idle(h);
    check(await h.js("document.getElementById('notice').hidden"),
      "a saved or brought back draft is not offered again");
    await ctx.browser.closeTab(h.page);
  },

  async include(ctx) {
    const top = ctx.disk("top.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    await d.click("#doc .include-open");
    const child = await ctx.browser.opened();
    check(child !== null, "the include's button opens the included file in a tab of its own");
    if (child === null) return;
    const c = driver(child);
    if (!await c.until("!!window.ksmd && document.documentElement.dataset.files === 'ready'", 30000)) throw new Error("its tab did not load in 30 s");
    check(await c.js("ksmd.source()") === NOTES && await c.js("location.search") ===
      "?doc=parts%2Fnotes.ksmd", "that tab opens the included file alone");
    await typeAtEnd(c, 0, " Edited.");
    await c.press("s", CTRL);
    await idle(c);
    const notes = NOTES.replace("Note text.", "Note text. Edited.");
    check(await onDisk(ctx, "parts/notes.ksmd", notes) && ctx.disk("top.ksmd") === top,
      "saving it writes the included file, and the parent's bytes stay",
      JSON.stringify([ctx.disk("parts/notes.ksmd"), ctx.disk("top.ksmd")]));
    await c.press("z", CTRL);
    await c.settle();
    check(await c.js("ksmd.source()") === NOTES && await d.js("ksmd.source()") === top,
      "its undo is its own: the parent's document does not change");
    await d.js("window.dispatchEvent(new Event('focus'))");
    await idle(d);
    check((await d.js("document.querySelector('#doc .include .inside').textContent"))
      .includes("Edited."), "the parent looked at again shows the saved change in place");
    check(await d.js("ksmd.source()") === top && ctx.disk("top.ksmd") === top,
      "and the parent's own source and file are unchanged");
    await ctx.browser.closeTab(child);
    await ctx.browser.closeTab(d.page);
  },

  async create(ctx) {
    const d = await tab(ctx);
    await d.clickBelow();
    await d.type("Fresh text.");
    await d.press("s", CTRL);
    check(await d.until("document.getElementById('browse').open") &&
      await d.js("document.querySelector('#browse .browse-name').value") === "notes.ksmd",
    "Ctrl+S on a document with no file yet asks where it goes, as Save as does");
    await d.js("document.querySelector('#browse .browse-name').value = 'fresh'");
    await d.click('#browse [data-browse="ok"]');
    await idle(d);
    check(await onDisk(ctx, "fresh.ksmd", `${H}Fresh text.\n`), "and saves it where no file stood");
    await typeAtEnd(d, 0, " More.");
    await d.press("s", CTRL);
    await idle(d);
    check(!await d.js("document.getElementById('browse').open") &&
      ctx.disk("fresh.ksmd") === `${H}Fresh text. More.\n`,
    "once it has a file, Ctrl+S saves there without asking");
    await ctx.browser.closeTab(d.page);
    const m = await tab(ctx, "?doc=missing.ksmd");
    check((await said(m)).startsWith("No file stands at missing.ksmd") &&
      ctx.disk("missing.ksmd") === null, "opening a missing file creates nothing", await said(m));
    await ctx.browser.closeTab(m.page);
  },

  // Save As and Open choose the place in a dialog that lists the workspace's folders.
  async saveAs(ctx) {
    const notes = ctx.disk("parts/notes.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    const shown = () => d.js("Array.from(document.querySelectorAll('#browse .browse-list button'), " +
      "(b) => b.textContent).join(' ')");
    // The list comes from the server after each move, so a press waits for its name to show.
    const press = async (label) => {
      const button = `Array.from(document.querySelectorAll('#browse .browse-list button'))
        .find((b) => b.textContent === ${JSON.stringify(label)})`;
      await d.until(`!!${button}`);
      await d.js(`${button}.click()`);
      await d.settle();
    };
    const pressOk = async () => {
      await d.click('#browse [data-browse="ok"]');
      await idle(d);
    };
    const dialogOpen = () => d.js("document.getElementById('browse').open");
    await d.menu("file-save-as");
    await d.until("document.querySelector('#browse .browse-list button') !== null");
    check(await dialogOpen() && await shown() === "parts pics fresh.ksmd top.ksmd" &&
      await d.js("document.querySelector('#browse .browse-name').value") === "top.ksmd",
    "Save as opens a dialog on the document's folder: its folders, then its documents",
    await shown());
    await press("parts");
    // The folder's list comes by a request to the server, so the check waits for it.
    const where = "document.querySelector('#browse .browse-where').textContent";
    check(await d.until("Array.from(document.querySelectorAll('#browse .browse-list button'), (b) => b.textContent)" +
      `.join(' ') === '.. notes.ksmd' && ${where} === 'Workspace / parts'`, 5000),
    "a press on a folder opens it, and the path to it shows above", `${await shown()} | ${await d.js(where)}`);
    await d.js("document.querySelector('#browse .browse-name').value = 'copy'");
    await pressOk();
    // An include's or an image's path is read from the document's folder, so each is written
    // again to name the same file from the new one.
    const copy = ctx.disk("parts/copy.ksmd") || "";
    const top = ctx.disk("top.ksmd");
    check(!await dialogOpen() &&
      await d.js("document.querySelector('.menubar .doc-name').textContent") === "parts/copy.ksmd",
    "Save as writes in the chosen folder, adds .ksmd, and the page goes on there", await said(d));
    check(copy.includes(':::include path="notes.ksmd"') && copy.includes('src="../pics/dot.png"') &&
      !copy.includes('"pics/') && top.includes('path="parts/notes.ksmd"'),
    "and the paths of its includes and images name the same files from the new folder", copy);
    check(await d.until("(document.querySelector('#doc .include') || {}).textContent.includes('Note text.')"),
      "so the include still shows its file there");
    await typeAtEnd(d, 0, " Again.");
    const asked = "document.querySelector('#browse .browse-note').textContent.includes('already exists')";
    const onto = async () => {
      await d.menu("file-save-as");
      await d.until("document.querySelector('#browse .browse-list button') !== null");
      await press("notes.ksmd");
      await d.click('#browse [data-browse="ok"]');
      return d.until(asked);
    };
    check(await onto() && await dialogOpen() && ctx.disk("parts/notes.ksmd") === notes,
      "Save as onto a document that stands asks before it replaces it",
      await d.js("document.querySelector('#browse .browse-note').textContent + ' | ' + " +
        "document.getElementById('status').textContent"));
    await d.click('#browse [data-browse="cancel"]');
    await d.settle();
    check(!await dialogOpen() && ctx.disk("parts/notes.ksmd") === notes,
      "Cancel closes the dialog and writes nothing");
    await onto();
    const theirs = `${notes}\nChanged while the dialog asked.\n`;
    fs.writeFileSync(path.join(ctx.root, "parts/notes.ksmd"), theirs);
    await pressOk();
    check(ctx.disk("parts/notes.ksmd") === theirs && (await said(d)).includes("changed after you chose it"),
      "the second press replaces only the bytes that stood when the file was chosen", await said(d));
    fs.writeFileSync(path.join(ctx.root, "parts/notes.ksmd"), notes);

    // A Save As into another folder that fails, with text typed while the write is out: the text
    // stays, and the paths stay written for the document's own folder.
    await d.js(`window.heldWrite = null;
      const realFetch = window.fetch;
      window.fetch = (url, how) => {
        if (!how || how.method !== "PUT" || window.heldWrite) return realFetch(url, how);
        return new Promise((r) => { window.heldWrite = () => r(realFetch(url, how)); });
      };
      true;`);
    await d.menu("file-save-as");
    await press("..");
    await press("top.ksmd");
    await d.click('#browse [data-browse="ok"]');
    await d.until(asked);
    await d.click('#browse [data-browse="ok"]');
    await d.until("window.heldWrite !== null");
    await typeAtEnd(d, 0, " During.");
    const before = await d.js("ksmd.source()");
    const topNow = `${top}\nChanged while the write was out.\n`;
    fs.writeFileSync(path.join(ctx.root, "top.ksmd"), topNow);
    await d.js("window.heldWrite()");
    await idle(d);
    const after = await d.js("ksmd.source()");
    check(after === before && after.includes(" During.") && after.includes(':::include path="notes.ksmd"') &&
      ctx.disk("top.ksmd") === topNow && await d.js("document.querySelector('.menubar .doc-name').textContent") ===
        "parts/copy.ksmd",
    "a Save As into another folder that fails keeps the text typed during the write, and changes no path",
    after);
    fs.writeFileSync(path.join(ctx.root, "top.ksmd"), top);

    // A folder pressed, then Save at once: the save waits for the folder, and lands there.
    await d.js(`window.fetch = ((realFetch) => (url, how) => String(url).includes("/api/list?path=parts")
      ? new Promise((r) => setTimeout(() => r(realFetch(url, how)), 400)) : realFetch(url, how))(window.fetch);
      true;`);
    await d.menu("file-save-as");
    await press("..");
    await d.js(`Array.from(document.querySelectorAll('#browse .browse-list button'))
      .find((b) => b.textContent === "parts").click()`);
    await d.js("document.querySelector('#browse .browse-name').value = 'quick'");
    await d.click('#browse [data-browse="ok"]');
    await idle(d);
    check(await onDisk(ctx, "parts/quick.ksmd", await d.js("ksmd.source()")) && ctx.disk("quick.ksmd") === null,
      "Save pressed while a folder's listing is on its way saves in that folder", await said(d));
    fs.rmSync(path.join(ctx.root, "parts/quick.ksmd"), { force: true });
    // A slow listing that arrives after a newer one does not show its folder.
    await d.menu("file-save-as");
    await press("..");
    await d.js(`Array.from(document.querySelectorAll('#browse .browse-list button'))
      .find((b) => b.textContent === "parts").click()`);
    await press("pics");
    await new Promise((r) => setTimeout(r, 600));
    check(await d.js("document.querySelector('#browse .browse-where').textContent") === "Workspace / pics",
      "the folder pressed last shows, whichever listing arrives last",
      await d.js("document.querySelector('#browse .browse-where').textContent"));
    await d.click('#browse [data-browse="cancel"]');
    await d.settle();
    await openInDialog(d, ["..", "top.ksmd"]);
    check(await d.js("document.querySelector('.menubar .doc-name').textContent") === "top.ksmd" &&
      await d.js("ksmd.source()") === top, "Open shows the same dialog; a double press opens",
    `${await said(d)} | ${await shown()}`);
    fs.rmSync(path.join(ctx.root, "parts/copy.ksmd"), { force: true });
    await ctx.browser.closeTab(d.page);
  },

  async refusals(ctx) {
    const before = snapshot(ctx.root);
    const d = await tab(ctx);
    // A path reaches the page in its address, as a link or the desktop opens a document.
    const opened = async (written) => {
      const t = await tab(ctx, `?doc=${encodeURIComponent(written)}`);
      const got = await said(t);
      await ctx.browser.closeTab(t.page);
      return got;
    };
    check((await opened("../outside.ksmd")).includes("climbs out of the workspace"),
      "a path out of the workspace is refused by the workspace's rules");
    check((await opened("CON.ksmd")).includes("Windows reads as another file"),
      "a name Windows reads as a device is refused on every system");
    let linked = true;
    try {
      fs.symlinkSync(path.join(ctx.root, "top.ksmd"), path.join(ctx.root, "alias.ksmd"));
    } catch (_) {
      linked = false;
    }
    if (linked) {
      check((await opened("alias.ksmd")).includes("a link stands along it"),
        "a link inside the workspace is refused by the local server");
      fs.unlinkSync(path.join(ctx.root, "alias.ksmd"));
    } else {
      verdict.skip("a link cannot be made here, so its refusal is not checked");
    }
    const port = ctx.server.port;
    const token = ctx.server.token;
    const bare = await request(port, "GET", "/api/file?path=top.ksmd");
    check(bare.status === 401, "a request without the token is refused", String(bare.status));
    const host = await request(port, "GET", "/api/file?path=top.ksmd",
      { Host: "attacker.example", Authorization: `Bearer ${token}` });
    check(host.status === 403, "a request naming another host is refused, token or not",
      String(host.status));
    const pageItself = await request(port, "GET", "/");
    check(pageItself.status === 200 && !pageItself.body.includes(token),
      "the page is handed out without the token, and does not hold it");
    check(snapshot(ctx.root) === before, "no refusal writes a file");
    await ctx.browser.closeTab(d.page);
  },

  // An image pasted is written in the document's data folder under a free name, and its clause goes in.
  async pasteImage(ctx) {
    fs.writeFileSync(path.join(ctx.root, "paste.ksmd"), `${H}Text.\n`);
    fs.mkdirSync(path.join(ctx.root, "paste-data"), { recursive: true }); fs.writeFileSync(path.join(ctx.root, "paste-data/image-1.png"), "taken");
    const d = await tab(ctx, "?doc=paste.ksmd");
    await d.select(0, 0, 5);
    ctx.browser.answerPrompts("A dot");
    await d.js(`(() => {
      const dt = new DataTransfer();
      const bytes = Uint8Array.from(atob(${JSON.stringify(DOT.toString("base64"))}), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], "image.png", { type: "image/png" }));
      document.querySelector("#doc p").dispatchEvent(new ClipboardEvent("paste",
        { clipboardData: dt, bubbles: true, cancelable: true }));
    })()`);
    await idle(d);
    ctx.browser.answerPrompts(null);
    const file = path.join(ctx.root, "paste-data/image-2.png");
    check(fs.existsSync(file) && fs.readFileSync(file).equals(DOT) && ctx.disk("paste-data/image-1.png") === "taken",
      "a pasted PNG is written in the document's data folder, past a name already taken");
    const source = await d.js("ksmd.source()");
    check(source === `${H}Text.\n\n:::image src="paste-data/image-2.png" alt=""\n:::\n`,
      "its clause goes in after the caret's paragraph, asking for no description", JSON.stringify(source));
    check(await d.until("(() => { const i = document.querySelector('figure[data-to=\"paste-data/image-2.png\"] img'); " +
      "return !!i && i.complete && i.naturalWidth === 1; })()"), "and the image shows at once");
    await ctx.browser.closeTab(d.page);
    for (const name of ["paste.ksmd", "paste-data"]) {
      fs.rmSync(path.join(ctx.root, name), { force: true, recursive: true });
    }
  },

  // Insert ▸ Image… opens the system's chooser; the file chosen goes in as a pasted one does, and a
  // chooser cancelled writes nothing.
  async insertImage(ctx) {
    fs.writeFileSync(path.join(ctx.root, "pick.ksmd"), `${H}Text.\n`);
    // **The browser reads the file chosen, so its path is absolute**: the work folder is relative.
    const picked = path.resolve(ctx.work, "picked.png");
    fs.writeFileSync(picked, DOT);
    const d = await tab(ctx, "?doc=pick.ksmd");
    await d.select(0, 0, 5);
    const before = snapshot(ctx.root);
    ctx.browser.chooseFiles(null);
    await d.menu("image");
    await idle(d);
    check(d.page.choosers === 1 && snapshot(ctx.root) === before,
      "Insert, Image opens a file chooser, and a chooser cancelled writes nothing", `${d.page.choosers} chooser(s)`);
    ctx.browser.answerPrompts("A chosen dot");
    ctx.browser.chooseFiles([picked]);
    await d.menu("image");
    const file = path.join(ctx.root, "pick-data/image-1.png");
    check(await d.until("ksmd.source().includes('pick-data/image-1.png')") && fs.existsSync(file) &&
      fs.readFileSync(file).equals(DOT), "the image chosen is written in the document's data folder",
    await said(d));
    ctx.browser.answerPrompts(null);
    ctx.browser.chooseFiles(null);
    const source = await d.js("ksmd.source()");
    check(source === `${H}Text.\n\n:::image src="pick-data/image-1.png" alt=""\n:::\n`,
      "its clause goes in after the caret's paragraph, asking for no description", JSON.stringify(source));
    check(await d.until("(() => { const i = document.querySelector('figure[data-to=\"pick-data/image-1.png\"] img'); " +
      "return !!i && i.complete && i.naturalWidth === 1; })()"), "and the image shows at once");
    await ctx.browser.closeTab(d.page);
    for (const name of ["pick.ksmd", "pick-data"]) fs.rmSync(path.join(ctx.root, name), { force: true, recursive: true });
  },

  // The editor's limit and the server's ceiling are two numbers; this ties them together.
  async largest(ctx) {
    const d = await tab(ctx);
    const max = await d.js("ksmd.sourceLimit()");
    await ctx.browser.closeTab(d.page);
    const put = await request(ctx.server.port, "PUT", "/api/file?path=largest.ksmd",
      { Authorization: `Bearer ${ctx.server.token}` }, Buffer.alloc(max, "x"));
    const file = path.join(ctx.root, "largest.ksmd");
    const size = fs.existsSync(file) ? fs.statSync(file).size : -1;
    check(put.status === 200 && size === max,
      "the local server takes a save as large as the largest source the editor holds",
      `limit ${max}, status ${put.status}, ${size} bytes on disk`);
    fs.rmSync(file, { force: true });
  },

  // An open shows each block once: after the include's file comes, only the include is shown again.
  async renderOnce(ctx) {
    const lines = Array.from({ length: 50 }, (_, k) => `Line ${k + 1}.`).join("\n\n");
    fs.writeFileSync(path.join(ctx.root, "many.ksmd"), `${H}${lines}\n\n:::include path="parts/notes.ksmd"\n:::\n`);
    const d = await tab(ctx, "?doc=many.ksmd", "window.__added = 0; new MutationObserver((list) => { for (const m of " +
      "list) if (m.target.id === 'doc') window.__added += m.addedNodes.length; }).observe(document, { childList: true, subtree: true });");
    check(await d.until("(document.querySelector('#doc .include') || {}).textContent.includes('Note text.')"),
      "the include shows its file once it has come");
    const [added, blocks] = [await d.js("window.__added"), await d.js("document.getElementById('doc').children.length")];
    check(added <= blocks + 2, "an open puts each block on the page once, and the include again", `${added} for ${blocks} blocks`);
    await ctx.browser.closeTab(d.page);
    fs.rmSync(path.join(ctx.root, "many.ksmd"), { force: true });
  },

  // A wide table an include shows keeps its first column right of its row numbers, as the
  // document's own tables do.
  async includedWide(ctx) {
    const names = Array.from({ length: 30 }, (_, c) => `"n${c}"`).join(" | ");
    const row = Array.from({ length: 30 }, (_, c) => `"${c} a long text that would wrap in a narrow cell"`).join(" | ");
    fs.writeFileSync(path.join(ctx.root, "parts/wide.ksmd"), `${H}:::table name="w"\n| ${names} |\n| ${row} |\n:::\n`);
    fs.writeFileSync(path.join(ctx.root, "widehost.ksmd"), `${H}Host.\n\n:::include path="parts/wide.ksmd"\n:::\n`);
    const d = await tab(ctx, "?doc=widehost.ksmd");
    const first = "document.querySelector('#doc .include td[data-r=\"0\"][data-c=\"0\"]')";
    await d.until(`!!${first}`);
    await d.js("window.scrollBy(2000, 0)");
    const left = await d.js(`${first}.getBoundingClientRect().left`);
    const number = await d.js("document.querySelector('#doc .include th.row-number').getBoundingClientRect().right");
    check(await d.js("window.scrollX") > 0 && left === number,
      "scrolled sideways, an included table's first column stays right of its row numbers", `${left} ${number}`);
    await ctx.browser.closeTab(d.page);
    fs.rmSync(path.join(ctx.root, "parts/wide.ksmd"), { force: true });
    fs.rmSync(path.join(ctx.root, "widehost.ksmd"), { force: true });
  },

  // A shape drawn on an image wider than the reader's largest coordinate stays within it, so the
  // file takes it.
  async wideImage(ctx) {
    fs.writeFileSync(path.join(ctx.root, "pics/wide.png"), grayPng(30000, 500));
    fs.writeFileSync(path.join(ctx.root, "wideimg.ksmd"), `${H}:::image src="pics/wide.png" alt="Wide"\n:::\n`);
    const d = await tab(ctx, "?doc=wideimg.ksmd");
    const img = "document.querySelector('#doc .figure .picture img')";
    await d.until(`!!${img} && ${img}.complete && ${img}.naturalWidth === 30000`, 15000);
    await d.click('#doc .figure .draw-tools button[data-shape="rect"]');
    const [left, top, width, height] = JSON.parse(await d.js("JSON.stringify((({ left, top, width, height }) => " +
      "[left, top, width, height])(document.querySelector('#doc .figure svg.drawings').getBoundingClientRect()))"));
    const mouse = (type, fx, fy) => d.page("Input.dispatchMouseEvent", { type, x: left + width * fx,
      y: top + height * fy, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
    await mouse("mousePressed", 0.6, 0.2);
    await mouse("mouseMoved", 0.8, 0.5);
    await mouse("mouseReleased", 0.95, 0.8);
    await d.settle();
    const source = await d.js("ksmd.source()");
    check(/draw shape="rect" from="1\d{4},\d+" to="20000,\d+"/.test(source),
      "a shape drawn past 20,000 pixels on an image stops there, and the file takes it", `${source} | ${await said(d)}`);
    await ctx.browser.closeTab(d.page);
    fs.rmSync(path.join(ctx.root, "pics/wide.png"), { force: true });
    fs.rmSync(path.join(ctx.root, "wideimg.ksmd"), { force: true });
  },

  // An image's scale is a share of its own pixels, and the text's width stops it.
  async scaledImage(ctx) {
    fs.writeFileSync(path.join(ctx.root, "pics/gray.png"), grayPng(400, 100));
    fs.writeFileSync(path.join(ctx.root, "scaled.ksmd"), `${H}:::image src="pics/gray.png" alt="Gray"\n:::\n`);
    const d = await tab(ctx, "?doc=scaled.ksmd");
    const img = "document.querySelector('#doc .figure .picture img')";
    const shownWidth = () => d.js(`${img}.getBoundingClientRect().width`);
    await d.until(`!!${img} && ${img}.complete && ${img}.naturalWidth === 400`, 15000);
    await d.js("window.prompt = () => '50'");
    await d.click("#doc > .figure .image-scale");
    await d.until(`!!${img} && ${img}.complete && ${img}.getBoundingClientRect().width < 300`, 15000);
    const half = await shownWidth();
    check((await d.js("ksmd.source()")).includes(' scale="50%"') && Math.abs(half - 200) < 1,
      "Scale… at 50 shows the picture at half its own width", `${half} | ${await d.js("ksmd.source()")}`);
    await d.js("window.prompt = () => '400'");
    await d.click("#doc > .figure .image-scale");
    await d.until(`!!${img} && ${img}.getBoundingClientRect().width > 300`, 15000);
    const text = await d.js("(() => { const doc = document.getElementById('doc'), s = getComputedStyle(doc); " +
      "return doc.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); })()");
    const wide = await shownWidth();
    check(Math.abs(wide - text) < 1 && wide < 1600, "at 400 it stops at the text's width", `${wide} ${text}`);
    await ctx.browser.closeTab(d.page);
    fs.rmSync(path.join(ctx.root, "pics/gray.png"), { force: true });
    fs.rmSync(path.join(ctx.root, "scaled.ksmd"), { force: true });
  },
};

const helpers = { tab, idle, said, noticed, choose, typeAtEnd, start, openInDialog };
Object.assign(SECTIONS, drafts(helpers), losses(helpers), own(helpers), redraws(helpers));
