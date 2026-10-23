// The ksmd page served by `kssrv --local` on a scratch workspace: opening, saving and reopening,
// a change made on disk, a draft that outlives its tab, an included file edited in a tab of its
// own, images, and the refusals. Every check that writes compares the bytes on disk.
// The server is the one the repository builds; it is started on port 0 and stopped by asking it.
import { spawn } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { CTRL, driver, verdict } from "./drive.mjs";

const check = (ok, what, detail) => verdict.check(ok, what, detail);

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

const H = "%ksmd 1\n\n";
const IMAGES = ':::image src="pics/dot.png" alt="A dot"\n:::\n\n' +
  ':::image src="pics/huge.png" alt="Huge"\n:::\n\n:::image src="pics/fake.png" alt="Fake"\n:::\n\n' +
  ':::image src="pics/none.png" alt="None"\n:::\n';
const TOP = `${H}# Top\n\nFirst paragraph.\n\n:::include path="parts/notes.ksmd"\n:::\n\n${IMAGES}`;
const NOTES = `${H}Note text.\n\n:::table name="t"\n| "a" | "b" |\n| 2 | =A1*3 |\n:::\n`;

export async function served(browser, pageFile, work, kssrv) {
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
    server = await start(kssrv, root, pageFile, path.join(work, "kssrv.log"));
  } catch (e) {
    check(false, "the local server starts", e.message);
    return;
  }
  const ctx = { browser, root, server, disk: (rel) => read(root, rel) };
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
function snapshot(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(`${path.relative(root, full)}=${st.isSymbolicLink() ? "link" :
        fs.readFileSync(full).toString("base64")}`);
    }
  };
  walk(root);
  return out.join("\n");
}

// Starts kssrv on the root, and reads the URL it prints: the port and the token.
export function start(kssrv, root, pageFile, logFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(kssrv, ["0", root, "--local", `--page=${path.resolve(pageFile)}`],
      { stdio: ["ignore", "pipe", "pipe"] });
    let seen = "";
    const log = fs.createWriteStream(logFile);
    const timer = setTimeout(() => reject(new Error(`no URL in 10 s: ${seen}`)), 10000);
    const take = (chunk) => {
      log.write(chunk);
      seen += chunk;
      const m = /http:\/\/127\.0\.0\.1:(\d+)\/#t=([A-Za-z0-9_-]+)/.exec(seen);
      if (!m) return;
      clearTimeout(timer);
      const port = Number(m[1]);
      const token = m[2];
      resolve({
        port, token, child,
        url: (query = "") => `http://127.0.0.1:${port}/${query}#t=${token}`,
        async stop() {
          await request(port, "POST", "/api/stop", { Authorization: `Bearer ${token}` });
          await Promise.race([new Promise((r) => child.on("exit", r)),
            new Promise((r) => setTimeout(r, 5000))]);
          child.kill("SIGKILL");
        },
      });
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", (e) => reject(e));
  });
}

// One raw request, so a check can send a Host or no token as another program would.
function request(port, method, target, headers = {}, body = null) {
  return new Promise((resolve) => {
    const length = body ? { "Content-Length": body.length } : {};
    const req = http.request({ host: "127.0.0.1", port, method, path: target,
      headers: { Host: `127.0.0.1:${port}`, ...length, ...headers } }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => {
        body += c;
      });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.end(body ?? undefined);
  });
}

// A new tab on the page, once it has opened what its address names.
async function tab(ctx, query = "") {
  const d = driver(await ctx.browser.open(ctx.server.url(query)));
  if (!await d.until("document.documentElement.dataset.files === 'ready'")) {
    // Say what the page showed, so a failure seen once can be traced.
    const seen = await d.js("JSON.stringify({ files: document.documentElement.dataset.files, " +
      "url: location.href, said: (document.querySelector('.files .state') || {}).textContent })")
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

const said = (d) => d.js("document.getElementById('status').textContent");
const noticed = (d) => d.js("(() => { const n = document.getElementById('notice'); " +
  "return n.hidden ? '' : n.querySelector('.notice-text').textContent; })()");

// Presses the notice's button whose label starts with `label`.
async function choose(d, label) {
  await d.js(`Array.from(document.querySelectorAll('#notice button'))
    .find((b) => b.textContent.startsWith(${JSON.stringify(label)})).click()`);
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
    check(snapshot(ctx.root) === before, "opening writes nothing");
    await ctx.browser.closeTab(d.page);
  },

  async save(ctx) {
    const d = await tab(ctx, "?doc=top.ksmd");
    await typeAtEnd(d, 1, " More.");
    check(await d.js("document.querySelector('.files .state').textContent") !== "",
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
      await d.js("document.querySelector('.files .state').textContent") === "",
    "the page says it saved, and no longer says unsaved");
    await d.page("Page.reload", {});
    await d.until("document.documentElement.dataset.files === 'ready'");
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
    await choose(d, "Replace the file");
    const mine = await d.js("ksmd.source()");
    check(mine.includes("Mine.") && ctx.disk("top.ksmd") === mine,
      "choosing to replace it writes this page's version", JSON.stringify(ctx.disk("top.ksmd")));
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

  async recovery(ctx) {
    const before = ctx.disk("top.ksmd");
    const d = await tab(ctx, "?doc=top.ksmd");
    await typeAtEnd(d, 1, " Unsaved.");
    const edited = await d.js("ksmd.source()");
    check(await d.until("document.querySelector('.files .state').textContent.includes('draft')"),
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
    await f.until("document.querySelector('.files .state').textContent.includes('draft')");
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
    await c.until("document.documentElement.dataset.files === 'ready'");
    check(await c.js("ksmd.source()") === NOTES && await c.js("location.search") ===
      "?doc=parts%2Fnotes.ksmd", "that tab opens the included file alone");
    await typeAtEnd(c, 0, " Edited.");
    await c.press("s", CTRL);
    await idle(c);
    const notes = NOTES.replace("Note text.", "Note text. Edited.");
    check(ctx.disk("parts/notes.ksmd") === notes && ctx.disk("top.ksmd") === top,
      "saving it writes the included file, and the parent's bytes stay");
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
    const top = ctx.disk("top.ksmd");
    const d = await tab(ctx);
    await d.clickBelow();
    await d.type("Fresh text.");
    await d.js("document.getElementById('path').value = 'fresh.ksmd'");
    await d.click('[data-file="save"]');
    await idle(d);
    check(ctx.disk("fresh.ksmd") === `${H}Fresh text.\n`,
      "a new document saves where no file stood, when Save is pressed");
    await typeAtEnd(d, 0, " More.");
    await d.js("document.getElementById('path').value = 'top.ksmd'");
    await d.click('[data-file="save"]');
    await idle(d);
    check((await said(d)).includes("already exists") && ctx.disk("top.ksmd") === top,
      "a save to a path where another file stands is refused, and that file stays",
      await said(d));
    await d.js("document.getElementById('path').value = 'missing.ksmd'");
    await d.click('[data-file="open"]');
    await idle(d);
    check((await said(d)).startsWith("No file stands at missing.ksmd") &&
      ctx.disk("missing.ksmd") === null, "opening a missing file creates nothing", await said(d));
    await ctx.browser.closeTab(d.page);
  },

  async refusals(ctx) {
    const before = snapshot(ctx.root);
    const d = await tab(ctx);
    const opened = async (written) => {
      await d.js(`document.getElementById('path').value = ${JSON.stringify(written)}`);
      await d.click('[data-file="open"]');
      await idle(d);
      return said(d);
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
};
