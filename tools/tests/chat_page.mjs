// ksagent's chat page, driven in a headless Chromium along the whole path a question takes: the
// page appends it to the ask file, `ksagent watch` (started by the opener with `--show`) asks a
// stand-in model server, the answer grows in the live file, and the checked answer replaces it.
// The cases: the Markdown reader alone, on usual and on hostile text; asking; the answer growing;
// the checked answer; a stopped answer; a model's answer holding markup, shown as text; Japanese;
// a save that meets another tab's write; a reload; a turn the reader cannot show; a question whose
// save is never answered, or answered late; lines ksagent
// refuses; an answer ksagent could not record; and an ask file past its cap. The browser and its
// driver are ksmd's (`ksmd/tests/browser/`).
// Usage: node tools/tests/chat_page.mjs <browser> <ksagent_chat.exe> <work folder>
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { launch } from "../../ksmd/tests/browser/cdp.mjs";
import { driver, verdict, wait, waitFor } from "../../ksmd/tests/browser/drive.mjs";
import { place, standIn } from "./chat_support.mjs";

const [browserBin, opener, work] = process.argv.slice(2);
const check = (ok, what, detail = "") => verdict.check(ok, what, detail);

const LEAVE = "# Leave\n\nA new employee receives 10 days of paid leave\nafter six months of work.\n";
const KYUKA = "# 休暇規程\n\n第3条 年次有給休暇は、入社6か月後に10日付与する。\n";

// What the stand-in answers, by the words of the question: the text, its sources, and the
// milliseconds between two pieces of the stream.
const REPLIES = [
  { when: "paid leave", ms: 120, text: "**10 days** of paid leave.\n\n- after six months\n" +
    "- unused days carry over\n\n| Kind | Days |\n| -- | --: |\n| Paid | 10 |",
    sources: [{ path: "rules/leave.md", from_line: 3, to_line: 4,
      quote: "receives 10 days of paid leave" }] },
  { when: "slowly", ms: 250, text: "This answer takes a long time to write. ".repeat(40),
    sources: [] },
  { when: "markup", ms: 20, text: "Look: <script>window.pwned = 1</script> and " +
    "<img src=x onerror=\"window.pwned = 2\"> and [bad](javascript:window.pwned=3) and " +
    "[good](https://example.com/) and ![picture](https://example.com/p.png)", sources: [] },
  { when: "recorded", ms: 120, text: "This answer will not be recorded. ".repeat(4), sources: [] },
  { when: "有給休暇", ms: 60, text: "入社6か月後に**10日**です。",
    sources: [{ path: "規程/休暇.md", from_line: 3, to_line: 3, quote: "入社6か月後に10日付与する" }] },
];

function startOpener(exe, root, modelPort) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ["--show", `--dir=${root}`, "--model-file=", `--port=${modelPort}`],
      { stdio: ["ignore", "pipe", "pipe"], detached: true });
    const log = fs.createWriteStream(path.join(work, "opener.log"));
    let seen = "";
    // A launcher that printed no URL is ended, with what it started, before the failure is told.
    const timer = setTimeout(() => {
      stopTree(child);
      reject(new Error(`no URL in 20 s: ${seen}`));
    }, 20000);
    const take = (chunk) => {
      log.write(chunk);
      seen += chunk;
      const m = /(http:\/\/127\.0\.0\.1:(\d+)\/)#t=([0-9a-f]{48})/.exec(seen);
      if (m && !child.url) {
        clearTimeout(timer);
        child.url = m[0];
        child.base = m[1];
        resolve(child);
      }
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", reject);
  });
}

// Ends the launcher and what it started: kssrv and `ksagent watch`. **On Windows, by the process
// tree** (`taskkill /T`): a process group cannot be signalled there, and a program left running
// keeps its copy under the work folder locked, so the next run cannot remove it.
function stopTree(child) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
    return;
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch (_) { /* already gone */ }
}

const RENDER_CASES = [
  ["**bold** and *em* and `code`", "<p><strong>bold</strong> and <em>em</em> and <code>code</code></p>"],
  ["2 * 3 * 4 and snake_case_name", "<p>2 * 3 * 4 and snake_case_name</p>"],
  ["line one\nline two", "<p>line one<br>line two</p>"],
  ["- a\n- b\n  - c", "<ul><li>a</li><li>b<ul><li>c</li></ul></li></ul>"],
  ["1. one\n2. two", "<ol><li>one</li><li>two</li></ol>"],
  ["# Title\n\ntext", "<h3>Title</h3><p>text</p>"],
  ["| A | B |\n| -- | --: |\n| 1 | 2 |", "<table><thead><tr><th>A</th><th style=\"text-align: right;\">B" +
    "</th></tr></thead><tbody><tr><td>1</td><td style=\"text-align: right;\">2</td></tr></tbody></table>"],
  ["```js\nlet a = 1;", "<pre><code>let a = 1;</code></pre>"],
  ["<b>x</b> & <script>y</script>", "<p>&lt;b&gt;x&lt;/b&gt; &amp; &lt;script&gt;y&lt;/script&gt;</p>"],
  ["[a](javascript:alert(1)) [b](https://x.test/) <https://y.test/>",
    "<p>a <a href=\"https://x.test/\" rel=\"noopener noreferrer\" target=\"_blank\">b</a> " +
    "<a href=\"https://y.test/\" rel=\"noopener noreferrer\" target=\"_blank\">https://y.test/</a></p>"],
  ["![p](https://x.test/p.png)", "<p><a href=\"https://x.test/p.png\" rel=\"noopener noreferrer\" " +
    "target=\"_blank\">p</a></p>"],
  ["- [x] done\n- [ ] open", "<ul><li>☑ done</li><li>☐ open</li></ul>"],
  ["> quoted\n> more", "<blockquote><p>quoted<br>more</p></blockquote>"],
  ["**half", "<p>**half</p>"],
  ["1. one\n   - sub", "<ol><li>one<ul><li>sub</li></ul></li></ol>"],
  ["| A | B |\n| -- | -- |\n| 1", "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr>" +
    "<td>1</td><td></td></tr></tbody></table>"],
  ["有給は**10日**です。\n- 一\n- 二", "<p>有給は<strong>10日</strong>です。</p><ul><li>一</li><li>二</li></ul>"],
];

// Text a hostile or runaway model can write, each of which must read throwing nothing, in at most
// HEAVY_FACTOR times the steps of plain text of the same length: marks that never close, deep
// quotes, brackets and parentheses that never close, a list with many blank lines, emphasis
// nested deep, and a table as wide as it is long. **The steps are counted, not timed**: the
// browser counts each block of the reader's code it runs (`markdownSteps`). A count is the same
// on every machine; a read that grows with the square of the length takes thousands of times more.
const HEAVY_FACTOR = 10; // the worst case today takes 2.3 times; the square, hundreds of times
const HEAVY = [
  ["unmatched marks", "\"*a \".repeat(33000)"],
  ["20,000 quote marks", "\">\".repeat(20000) + \" x\""],
  ["open brackets", "\"[\".repeat(30000) + \"x\""],
  ["open link targets", "\"[a](\".repeat(20000)"],
  ["blank lines in a list", "\"- a\\n\" + \"\\n\".repeat(30000) + \"  b\""],
  ["deep emphasis", "\"*_\".repeat(10000) + \"x\" + \"_*\".repeat(10000)"],
  ["a table as wide as it is long", "\"|\".repeat(3000) + \"\\n-|\\n\" + \"|\\n\".repeat(3000)"],
];

// The steps the Markdown reader takes to read and show `expr`'s text: each block of its code that
// runs counts one, as the browser's precise coverage counts them; null where the read throws.
// **Only the reader's own script is counted**, found by its function `blocks`: the page's timers
// run in the other script meanwhile. The work inside the engine (a pattern, a slice) is not seen.
// Caution: **Start the counting before the page loads.** A function compiled before it starts is
// counted only as a whole, so a loop inside it counts nothing.
async function markdownSteps(page, d, expr) {
  await page("Profiler.takePreciseCoverage"); // empties the counts
  const ok = await d.js("(() => { const md = ksagentMarkdown; " +
    `try { md.render(md.parse(${expr}), document.createElement('div')); return true; } ` +
    "catch (e) { return false; } })()");
  const { result } = await page("Profiler.takePreciseCoverage");
  const reader = result.find((sc) => sc.functions.some((f) => f.functionName === "blocks"));
  if (!ok || !reader) return null;
  let steps = 0;
  for (const f of reader.functions) for (const r of f.ranges) steps += r.count;
  return steps;
}

async function main() {
  verdict.part = "chat page";
  const root = path.join(work, "folder");
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  fs.mkdirSync(path.join(root, "規程"), { recursive: true });
  fs.writeFileSync(path.join(root, "rules/leave.md"), LEAVE);
  fs.writeFileSync(path.join(root, "規程/休暇.md"), KYUKA);
  const model = await standIn({ replies: REPLIES });
  const child = await startOpener(place(opener, work), root, model.port);
  const disk = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch (_) { return ""; } };
  // From here the launcher runs, so every way out ends it, a browser that fails to start included.
  let browser = null;
  try {
    browser = await launch(browserBin, path.join(work, "browser"));
    const d = driver(browser.page);
    // **The page's words follow the browser's language** (`ja` in `ksagent/page/chat.html`), and
    // these checks read the English ones. A browser takes its language from the OS: on a Japanese
    // Windows every badge and note came out in Japanese. So the language is set here.
    const { userAgent } = await browser.page("Browser.getVersion");
    await browser.page("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: "en-US" });
    await browser.page("Profiler.enable");
    await browser.page("Profiler.startPreciseCoverage", { callCount: true, detailed: true });
    await browser.page("Page.navigate", { url: child.url });
    check(await d.until("document.documentElement.dataset.chat === 'ready'"), "the page gets ready");
    check(await d.js("navigator.language") === "en-US", "the page reads its language as English",
      await d.js("navigator.language"));
    const name = await d.js("new URLSearchParams(location.search).get('chat')");
    check(/^chat-\d{8}-\d{6}$/.test(name || ""), "an empty folder opens a new conversation", name);

    for (const [text, want] of RENDER_CASES) {
      const got = await d.js(`ksagentMarkdown.render(ksagentMarkdown.parse(${JSON.stringify(text)}), ` +
        "document.createElement('div')).innerHTML");
      check(got === want, `Markdown read: ${JSON.stringify(text)}`, got);
    }
    for (const [what, expr] of HEAVY) {
      const plainOf = `'plain text '.repeat(Math.ceil((${expr}).length / 11)).slice(0, (${expr}).length)`;
      const hostile = await markdownSteps(browser.page, d, expr);
      const plain = await markdownSteps(browser.page, d, plainOf);
      check(hostile !== null && plain > 0 && hostile <= HEAVY_FACTOR * plain,
        `hostile Markdown reads in step with plain text, throwing nothing: ${what}`,
        hostile !== null ? `${hostile} steps, plain text ${plain} steps` : "it threw");
    }
    await browser.page("Profiler.stopPreciseCoverage");
    check(await d.js("ksagentMarkdown.render(ksagentMarkdown.parse('> '.repeat(12) + 'x'), " +
      "document.createElement('div')).querySelectorAll('blockquote').length") === 8,
      "quotes nest 8 deep, and the rest reads as text");
    // A table's columns stop at MAX_COLUMNS in `ksagent/page/chat.html`: a row has that many cells.
    const columns = (n) => d.js("(() => { const md = ksagentMarkdown; " +
      `const s = '|' + ' a |'.repeat(${n}) + '\\n|' + ' - |'.repeat(${n}) + '\\n| 1 |'; ` +
      "const t = md.render(md.parse(s), document.createElement('div')).querySelector('table'); " +
      "return t ? t.rows[1].cells.length : 0; })()");
    check(await columns(64) === 64, "a table of 64 columns is a table, its short row filled out",
      await columns(64));
    check(await columns(65) === 0, "a header of 65 columns reads as text", await columns(65));

    // **A check of what the page shows waits for it** (`d.until`): the page reads its files on its
    // own beat, so a reading taken once can fall before the change it checks. What holds only for
    // a moment, as the growing answer, is read in the same evaluation that sees the moment.
    const turn = (n) => `document.querySelectorAll('.turn')[${n}]`;
    const stateOf = (n) => `(${turn(n)} || {dataset: {}}).dataset.state`;
    async function ask(text) {
      await d.js("document.getElementById('text').focus()");
      await browser.page("Input.insertText", { text });
      await d.press("Enter");
    }

    // Asking, the answer growing, then the checked answer in its place.
    await ask("How much paid leave does a new employee get?");
    check(await d.until(`${stateOf(0)} === 'writing' && ${turn(0)}.querySelector('.unchecked') !== null &&
      (window.badgeWriting = ${turn(0)}.querySelector('.badge').textContent) !== null`),
      "the answer grows on the page while it is written", await d.js(stateOf(0)));
    check(await d.js("window.badgeWriting") === "Being written: sources not checked yet",
      "the growing answer says it is not checked", await d.js("window.badgeWriting"));
    check(await d.until(`${stateOf(0)} === 'checked'`, 30000), "the checked answer replaces it",
      await d.js(stateOf(0)));
    check(await d.until(`(() => { const t = ${turn(0)};
      return t.querySelector('.md strong').textContent === '10 days' &&
        t.querySelectorAll('.md li').length === 2 && t.querySelector('.md table') !== null &&
        t.querySelector('.sources code').textContent === 'rules/leave.md' &&
        t.querySelector('.unchecked') === null && t.querySelector('.badge').textContent === 'Sources checked'; })()`,
      15000), "it shows bold text, a list, a table and its checked source, and nothing unchecked");
    const ask0 = disk(`${name}.ask.jsonl`);
    check(/"type":"question","id":"[0-9a-f-]{36}","text":"How much paid leave/.test(ask0),
      "the question stands in the ask file the page wrote", ask0);

    // A stopped answer.
    await ask("Answer this slowly, please");
    check(await d.until(`${stateOf(1)} === 'writing' && ${turn(1)}.querySelector('.unchecked') !== null`,
      15000), "a second answer starts growing", await d.js(stateOf(1)));
    // **The growth is checked on this long answer**, whose text streams for most of a minute: the
    // first one's text is done within seconds, so on a loaded machine both readings could fall
    // after its end. And it waits for the growth rather than for a fixed time.
    const grown = `(${turn(1)}.querySelector('.unchecked') || {textContent: ''}).textContent.length`;
    const first = await d.js(grown);
    check(await d.until(`${grown} > ${first}`, 15000), "the growing text gets longer",
      `${first} then ${await d.js(grown)}`);
    // **Stop stays one button while the answer grows**, and every press of it is a click. Built
    // again each second, a press whose release met the new button was no click, and the focus on
    // it was lost. Each click is counted, and held back so it stops nothing. The text part gets a
    // fixed height here, so the button stands still under the pointer while the text grows.
    await d.js(`(() => {
      const style = document.head.appendChild(document.createElement("style"));
      style.id = "still";
      style.textContent = '.turn[data-id="${await d.js(`${turn(1)}.dataset.id`)}"] .part ' +
        "{ height: 12rem; overflow: hidden; }";
      window.stopButton = ${turn(1)}.querySelector(".actions button");
      window.stopClicks = 0;
      window.countStop = (e) => {
        const b = e.target.closest && e.target.closest(".actions button");
        if (b && b.textContent === "Stop") { window.stopClicks++; e.stopPropagation(); }
      };
      document.addEventListener("click", window.countStop, true);
    })()`);
    const PRESSES = 16;
    const drawnBefore = await d.js(grown);
    for (let k = 0; k < PRESSES; k++) {
      const [x, y] = await d.js("(() => { const r = window.stopButton.getBoundingClientRect(); " +
        "return [r.left + r.width / 2, r.top + r.height / 2]; })()");
      const press = { x, y, button: "left", clickCount: 1 };
      await browser.page("Input.dispatchMouseEvent", { type: "mousePressed", ...press });
      await wait(150);
      await browser.page("Input.dispatchMouseEvent", { type: "mouseReleased", ...press });
      await wait(100);
    }
    check(await d.js(grown) > drawnBefore && await d.js("window.stopClicks") === PRESSES &&
      await d.js(`window.stopButton === ${turn(1)}.querySelector(".actions button")`),
      `each of ${PRESSES} presses on Stop while the answer grows is a click on the same button`,
      `${await d.js("window.stopClicks")} clicks; text ${drawnBefore} then ${await d.js(grown)}`);
    await d.js("window.stopButton.focus(); window.stopClicks = 0");
    const focusedAt = await d.js(grown);
    check(await d.until(`${grown} > ${focusedAt} && document.activeElement === window.stopButton`,
      15000), "the focus stays on Stop while the answer grows", await d.js("document.activeElement.tagName"));
    await d.press("Enter");
    check(await d.until("window.stopClicks === 1", 5000), "Enter then presses that Stop",
      await d.js("window.stopClicks"));
    await d.js(`document.removeEventListener("click", window.countStop, true);
      document.getElementById("still").remove()`);
    // **A stop whose save gets no answer must not promise a resend**: the page sends it once. The
    // first press's save never reaches the server; the second reaches it, but its answer never
    // comes back. The page's limit is cut to 300 ms, so the check need not wait its 15 s.
    const stopNotice = "document.getElementById('notice').textContent";
    await d.js(`(() => {
      const plain = window.stopFetch = window.fetch;
      window.stopTimeout = AbortSignal.timeout;
      AbortSignal.timeout = () => window.stopTimeout.call(AbortSignal, 300);
      const never = (how) => new Promise((_, no) =>
        how.signal.addEventListener("abort", () => no(how.signal.reason)));
      window.fetch = (url, how = {}) => {
        if (how.method !== "PUT") return plain(url, how);
        if (window.stopPut === "late") plain(url, { ...how, signal: undefined });
        return never(how);
      };
      window.stopPut = "drop";
    })()`);
    await d.js(`${turn(1)}.querySelector('.actions button').click()`);
    check(await d.until(`${stopNotice}.includes('stop may not be saved')`, 15000),
      "a stop whose save gets no answer says it may not be saved", await d.js(stopNotice));
    check((await d.js(stopNotice)).includes("press Stop again") &&
      !(await d.js(stopNotice)).includes("asks again"),
      "it says to press Stop again, and promises no resend the page does not make", await d.js(stopNotice));
    check(await d.js(stateOf(1)) === "writing", "the answer goes on", await d.js(stateOf(1)));
    await d.js(`window.stopPut = "late"; ${turn(1)}.querySelector('.actions button').click()`);
    check(await d.until(`${stateOf(1)} === 'stopped'`, 15000), "Stop ends it, and it shows as stopped",
      await d.js(stateOf(1)));
    check(await d.until(`!${stopNotice}.includes('may not be saved')`, 15000),
      "once the stop stands in the ask file, the notice clears", await d.js(stopNotice));
    await d.js("window.fetch = window.stopFetch; AbortSignal.timeout = window.stopTimeout");
    check(await d.until(`(() => { const t = ${turn(1)};
      return t.querySelector('.badge').textContent === 'Stopped' && t.querySelector('.sources') === null &&
        t.querySelector('.unchecked') !== null; })()`, 15000),
      "a stopped answer shows its partial text as unchecked, and no source",
      await d.js(`${turn(1)}.textContent`));
    // The page shows it stopped from the live file, before ksagent records it.
    const stoppedRecord = () => disk(`${name}.chat.jsonl`).includes("\"state\":\"stopped\"") &&
      disk(`${name}.chat.jsonl`).includes("stopped on the page");
    check(await waitFor(stoppedRecord, 15000), "the chat file records it as stopped",
      disk(`${name}.chat.jsonl`));

    // A model's answer holding markup stays text.
    await ask("Show some markup");
    check(await d.until(`${stateOf(2)} === 'unverified'`, 15000), "an answer with no source is unverified",
      await d.js(stateOf(2)));
    check(await d.until(`(() => { const t = ${turn(2)};
      return t.querySelector('script, img, iframe') === null && window.pwned === undefined &&
        t.querySelector('a[href^="javascript"]') === null &&
        t.querySelector('a[href="https://example.com/"]') !== null &&
        t.querySelector('a[href="https://example.com/p.png"]') !== null &&
        t.querySelector('.md').textContent.includes('<script>window.pwned = 1</script>') &&
        t.querySelector('.md').textContent.includes('onerror'); })()`, 15000),
      "a <script> and an <img onerror> stay text, a javascript: link is no link, nothing ran");

    // Japanese.
    await ask("有給休暇は何日ですか?");
    check(await d.until(`${stateOf(3)} === 'checked'`, 15000), "a Japanese question gets a checked answer",
      await d.js(stateOf(3)));
    check(await d.until(`${turn(3)}.querySelector('.q').textContent === '有給休暇は何日ですか?' &&
      ${turn(3)}.querySelector('.md strong').textContent === '10日'`, 15000),
      "the Japanese question and answer show as written", await d.js(`${turn(3)}.textContent`));
    check(disk(`${name}.chat.jsonl`).includes("\"lang\":\"ja\""), "the chat file records its language");

    // A save that meets another tab's write: just before the page's write goes out, a write of
    // its own, as another tab's, adds a record. The page's write is then refused (409), so it
    // reads the file again and appends again.
    await d.js(`(() => {
      const plain = window.fetch;
      window.fetch = async (url, how = {}) => {
        if (how.method === "PUT" && !window.otherTab) {
          window.otherTab = "wrote";
          const had = await (await plain(url, { headers: how.headers })).text();
          const put = await plain(url, { method: "PUT", headers: { Authorization: how.headers.Authorization },
            body: had + '{"type":"question","id":"other-tab","text":"Asked in another tab"}\\n' });
          const mine = await plain(url, how);
          window.otherTab = put.ok ? \`refused \${mine.status}\` : "failed";
          return mine;
        }
        return plain(url, how);
      };
    })()`);
    await ask("Asked while another tab writes");
    await d.until("document.querySelectorAll('.turn').length >= 6", 15000);
    const bothAsked = () => disk(`${name}.ask.jsonl`).includes("other-tab") &&
      disk(`${name}.ask.jsonl`).includes("Asked while another tab writes");
    await waitFor(bothAsked, 15000);
    const asked = disk(`${name}.ask.jsonl`);
    check(await d.js("window.otherTab") === "refused 409" && bothAsked(),
      "the write that meets another tab's is refused, and both questions then stand in the file",
      `${await d.js("window.otherTab")}: ${asked}`);

    // A reload shows the conversation again.
    check(await d.reload("document.documentElement.dataset.chat === 'ready'"), "the page reloads");
    check(await d.until(`${stateOf(0)} === 'checked' && ${stateOf(1)} === 'stopped' && ` +
      `${stateOf(3)} === 'checked'`), "after a reload each turn shows as it ended");

    // A turn the reader cannot show says so, and the page goes on answering.
    const count = () => d.js("document.querySelectorAll('.turn').length");
    const broke = await count();
    await d.js("window.plainParse = ksagentMarkdown.parse; " +
      "ksagentMarkdown.parse = () => { throw new Error('the reader broke'); }");
    await ask("Ask while the reader breaks");
    check(await d.until(`${stateOf(broke)} === 'failed' && ` +
      `${turn(broke)}.textContent.includes('cannot be shown: the reader broke')`, 15000),
      "a turn whose reading throws says it cannot be shown", await d.js(stateOf(broke)));
    await d.js("ksagentMarkdown.parse = window.plainParse");
    await ask("How much paid leave, once more?");
    check(await d.until(`${stateOf(broke + 1)} === 'checked'`, 15000),
      "the page goes on: the next question is answered", await d.js(stateOf(broke + 1)));

    // A request the local server takes and never answers ends at the page's time limit, the page
    // says so, and the next look that gets through clears the notice. The limit is cut to 300 ms
    // here, so the check need not wait the page's 15 s; the limit the page asked for is recorded.
    // A request with no limit would never end, and the notice would never come.
    const notice = "document.getElementById('notice').textContent";
    await d.js(`(() => {
      const plain = window.fetch;
      window.plainTimeout = AbortSignal.timeout;
      window.limits = new Set();
      AbortSignal.timeout = (ms) => { window.limits.add(ms); return window.plainTimeout.call(AbortSignal, 300); };
      window.fetch = (url, how = {}) => (window.hang && String(url).startsWith("/api/stat") ?
        new Promise((_, no) => how.signal && how.signal.addEventListener("abort", () => no(how.signal.reason))) :
        plain(url, how));
      window.hang = true;
    })()`);
    check(await d.until(`${notice}.includes('did not answer within 15 seconds')`, 15000),
      "a request the local server never answers ends, and the page says so", await d.js(notice));
    check(await d.js("[...window.limits].join()") === "15000", "every request asks for a 15 s limit",
      await d.js("[...window.limits].join()"));
    await d.js("window.hang = false; AbortSignal.timeout = window.plainTimeout");
    check(await d.until(`!${notice}.includes('did not answer')`, 15000),
      "the next look that gets through clears the notice", await d.js(notice));

    // A question whose save the local server never answers. **Its text must not be lost**, the
    // notice must not promise a resend the page does not make, and asking it again must write it
    // once. `window.put` sets what the page's save meets: "drop" never reaches the server, "late"
    // reaches it but its answer never comes back, as when the server is slow. The limit is cut to
    // 300 ms as above.
    const box = "document.getElementById('text').value";
    const times = (text) => disk(`${name}.ask.jsonl`).split(text).length - 1;
    await d.js(`(() => {
      const plain = window.plainFetch = window.fetch;
      AbortSignal.timeout = () => window.plainTimeout.call(AbortSignal, 300);
      const never = (how) => new Promise((_, no) =>
        how.signal.addEventListener("abort", () => no(how.signal.reason)));
      window.fetch = (url, how = {}) => {
        if (how.method === "PUT" && window.put === "drop") return never(how);
        if (how.method === "PUT" && window.put === "late") {
          plain(url, { ...how, signal: undefined });
          return never(how);
        }
        return window.hang && String(url).startsWith("/api/stat") ? never(how) : plain(url, how);
      };
      window.put = "drop";
    })()`);
    // **Count the turns only once the page shows every question the ask file holds.** Read while
    // the page still drew the turns of the looks before, under a full run's load, the count was
    // short, and the three questions below then seemed to show more than once.
    const questionsSaved = () => new Set(disk(`${name}.ask.jsonl`).split("\n").map((line) => {
      try { const r = JSON.parse(line); return r && r.type === "question" ? r.id : null; } catch (_) { return null; }
    }).filter((id) => id !== null)).size;
    check(await d.until(`document.querySelectorAll('.turn').length === ${questionsSaved()}`, 15000),
      "before the lost saves, the page shows a turn for each question in the ask file", await count());
    const before = await count();
    await ask("A question whose save is lost");
    check(await d.until(`${notice}.includes('may not be saved')`, 15000),
      "a save that is never answered says the question may not be saved", await d.js(notice));
    check(!(await d.js(notice)).includes("asks again"), "it promises no resend the page does not make",
      await d.js(notice));
    check(await d.js(box) === "A question whose save is lost", "the question is back in the text box",
      await d.js(box));
    await d.js("window.put = ''; document.getElementById('text').focus()");
    await d.press("Enter");
    check(await d.until(`!${notice}.includes('may not be saved') && ${box} === ''`, 15000),
      "asked again, it is saved, and the notice clears", await d.js(notice));
    check(await waitFor(() => times("A question whose save is lost") === 1, 15000),
      "the ask file holds it once", disk(`${name}.ask.jsonl`));
    // The save reaches the file late: the page sees it there, empties the box and clears the
    // notice, and writes nothing more.
    await d.js("window.put = 'late'");
    await ask("A question saved late");
    check(await d.until(`!${notice}.includes('may not be saved') && ${box} === '' && ` +
      `document.querySelectorAll('.turn').length === ${before + 2}`, 15000),
      "a save that reaches the file late shows as saved, and the notice clears", await d.js(notice));
    // Asked again before the page sees the late save (its looks hang meanwhile): written once.
    await d.js("window.hang = true");
    await ask("A question saved late, asked again");
    check(await d.until(`${notice}.includes('may not be saved')`, 15000),
      "the second late save says it may not be saved", await d.js(notice));
    await d.js("window.put = ''");
    check(await waitFor(() => times("A question saved late, asked again") === 1, 15000),
      "the late save reaches the file", disk(`${name}.ask.jsonl`));
    check(await d.js(box) === "A question saved late, asked again",
      "the page has not seen it yet, so the question is still in the text box", await d.js(box));
    await d.js("document.getElementById('text').focus()");
    await d.press("Enter");
    check(await d.until(`${box} === ''`, 15000), "asking it again goes through", await d.js(box));
    await d.js("window.hang = false");
    check(await d.until(`!${notice}.includes('may not be saved') && !${notice}.includes('did not answer')`,
      15000), "the notice clears", await d.js(notice));
    check(times("A question saved late, asked again") === 1,
      "a late save and the same question asked again are written once", disk(`${name}.ask.jsonl`));
    check(await d.until(`document.querySelectorAll('.turn').length === ${before + 3}`, 15000) &&
      questionsSaved() === before + 3, "each of the three questions shows once",
      `${await count()} turns, ${questionsSaved()} questions saved`);
    await d.js("window.fetch = window.plainFetch; AbortSignal.timeout = window.plainTimeout");

    // Lines ksagent passes over are named on the page with ksagent's own reasons.
    const askFile = path.join(root, `${name}.ask.jsonl`);
    const firstId = /"id":"([0-9a-f-]{36})"/.exec(disk(`${name}.ask.jsonl`))[1];
    fs.appendFileSync(askFile, [`{"type": "question", "id": "x y", "text": "A space"}`,
      `{"type": "question", "id": "e1", "text": "  "}`, `{"type": "stop", "id": "never"}`,
      `{"type": "edit", "id": "e2"}`, `{"type": "question", "id": "${firstId}", "text": "Again"}`,
      `{"type": "question", "id": "${"a".repeat(65)}", "text": "Long id"}`].join("\n") + "\n");
    const told = () => {
      const log = fs.readFileSync(path.join(work, "opener.log"), "utf8");
      const re = new RegExp(`${name}\\.ask\\.jsonl, (line \\d+: [^\\n]*?); that line is passed over`, "g");
      return [...new Set([...log.matchAll(re)].map((m) => m[1]))];
    };
    await waitFor(() => told().length >= 6, 15000);
    const said = told();
    // **The page reads the ask file on its own beat**, so it may name the lines after ksagent has.
    await d.until(`(() => { const n = document.getElementById('notice').textContent;
      return ${JSON.stringify(said)}.every((x) => n.includes(x)); })()`, 15000);
    const named = await d.js(notice);
    check(said.length === 6 && said.every((x) => named.includes(x)),
      "each line ksagent passes over is named on the page, in ksagent's words",
      `ksagent: ${said.join(" / ")}; page: ${named}`);
    check(await count() === broke + 5, "no line it passes over shows as a question");

    // An answer ksagent could not record shows as stopped, with why, and can be asked again.
    await ask("An answer that will not be recorded");
    const lost = broke + 5;
    check(await d.until(`${stateOf(lost)} === 'writing'`, 15000), "that answer starts growing");
    fs.appendFileSync(path.join(root, `${name}.chat.jsonl`), "{broken\n");
    check(await d.until(`${stateOf(lost)} === 'stopped'`, 30000),
      "once ksagent gives up recording it, the turn shows as stopped", await d.js(stateOf(lost)));
    check(await d.until(`(() => { const t = ${turn(lost)}; const n = t.querySelector('.notes');
      return n !== null && n.textContent.includes('could not record an answer') &&
        n.textContent.includes('not one JSON value') &&
        t.querySelector('.unchecked') !== null && t.querySelector('.actions button') !== null; })()`, 15000),
      "it says why, keeps its text unchecked, and offers Ask again", await d.js(`${turn(lost)}.textContent`));

    // Switching to another conversation while the old one's chat file is read. **The old
    // conversation's turns must not show in the new one**: the read that comes back late is
    // dropped. The page's read of the old chat file is held for 1.5 s.
    const otherAsk = path.join(root, "other.ask.jsonl");
    fs.writeFileSync(otherAsk, '{"type": "question", "id": "other-1", "text": "Asked in the other conversation"}\n');
    check(await d.reload("document.documentElement.dataset.chat === 'ready'"), "the page reloads with the other conversation listed");
    const shownIds = "[...document.querySelectorAll('.turn')].map((t) => t.dataset.id).join()";
    await d.until(`document.querySelectorAll('.turn').length === ${lost + 1}`, 15000);
    await d.js(`(() => {
      const plain = window.fetch;
      window.fetch = async (url, how = {}) => {
        if (window.slowChat && String(url) === "/api/file?path=${name}.chat.jsonl") {
          window.slowChat = false;
          window.slowHit = true;
          await new Promise((r) => setTimeout(r, 1500));
          const got = await plain(url, how);
          window.slowDone = Date.now();
          return got;
        }
        return plain(url, how);
      };
      window.slowChat = true;
    })()`);
    fs.appendFileSync(path.join(root, `${name}.chat.jsonl`),
      '{"type": "question", "id": "late-1", "text": "Recorded while the page switched"}\n');
    check(await d.until("window.slowHit === true", 15000), "the page starts reading the old chat file");
    await d.js("[...document.querySelectorAll('#chats a')].find((a) => a.textContent === 'other').click()");
    check(await d.until("window.slowDone !== undefined && Date.now() - window.slowDone > 2500", 15000),
      "the held read comes back, and two looks pass");
    check(await d.js(shownIds) === "other-1",
      "the other conversation shows only its own turn", await d.js(shownIds));
    // A turn whose question goes from the files goes from the page too. Its stop comes with it, so
    // ksagent never takes it, and only the ask file holds it.
    fs.appendFileSync(otherAsk, '{"type": "question", "id": "other-2", "text": "Asked, then taken out"}\n' +
      '{"type": "stop", "id": "other-2"}\n');
    check(await d.until(`${shownIds} === "other-1,other-2"`, 15000), "a question added shows",
      await d.js(shownIds));
    fs.writeFileSync(otherAsk, '{"type": "question", "id": "other-1", "text": "Asked in the other conversation"}\n');
    check(await d.until(`${shownIds} === "other-1"`, 15000),
      "a question taken out of the ask file goes from the page", await d.js(shownIds));

    // With the local server gone, the notice says so once, though both a look and a save failed,
    // and New conversation still opens one, with no error left unhandled.
    await d.js("window.liveFetch = window.fetch; " +
      "window.fetch = () => Promise.reject(new TypeError('Failed to fetch'))");
    check(await d.until(`${notice}.includes('Failed to fetch')`, 15000),
      "with the server gone, the page says so", await d.js(notice));
    await ask("Asked while the server is gone");
    check(await d.until(`document.getElementById('text').value === 'Asked while the server is gone'`, 15000) &&
      (await d.js(notice)).split("\n").filter((l) => l.includes("Failed to fetch")).length === 1,
      "a save that fails too leaves one line saying so, and the question back in the text box",
      await d.js(notice));
    const errorsBefore = browser.page.errors.length;
    const oldTitle = await d.js("document.title");
    await d.js("document.getElementById('new').click()");
    check(await d.until(`document.title !== ${JSON.stringify(oldTitle)} && document.title.startsWith('chat-')`,
      15000) && await d.until(`${notice}.includes('Failed to fetch')`, 15000),
      "New conversation opens one, and the notice still says the server is gone", await d.js(notice));
    await wait(500);
    check(browser.page.errors.length === errorsBefore, "New conversation leaves no error unhandled",
      browser.page.errors.slice(errorsBefore).join("; "));
    await d.js("window.fetch = window.liveFetch");

    // An ask file past its cap is not answered, and the page says why.
    fs.writeFileSync(path.join(root, "big.ask.jsonl"),
      `{"type": "question", "id": "big1", "text": "${"x".repeat(1100000)}"}\n`);
    await browser.page("Page.navigate", { url: `${child.base}?chat=big` });
    check(await d.until("document.getElementById('notice').textContent.includes('larger than 1 MiB')",
      20000), "a conversation whose ask file is past its cap says so on the page",
      await d.js("document.getElementById('notice').textContent"));

    // A live file that stops changing, as one that a ksagent stopped by Ctrl+C leaves: the turn
    // asks the person to check that ksagent watch runs. The ask file holds a byte that is not
    // UTF-8, so ksagent passes it over and never writes this live file. The page's clock is put
    // 20 seconds on, so the check need not wait the page's 15 s.
    const quietLive = path.join(root, "quiet.live.json");
    fs.writeFileSync(path.join(root, "quiet.ask.jsonl"), Buffer.concat([
      Buffer.from('{"type": "question", "id": "quiet-1", "text": "Asked as ksagent stops"}\n'),
      Buffer.from([0xff, 0x0a])]));
    fs.writeFileSync(quietLive, '{"id": "quiet-1", "phase": "writing", "tools": "", "text": "Half an answer"}\n');
    await browser.page("Page.navigate", { url: `${child.base}?chat=quiet` });
    const quietTurn = "(document.querySelector('.turn') || { textContent: '', dataset: {} })";
    check(await d.until(`${quietTurn}.dataset.state === 'writing'`, 15000),
      "the turn whose live file says writing shows as written", await d.js(`${quietTurn}.textContent`));
    check(!(await d.js(`${quietTurn}.textContent`)).includes("written nothing"),
      "while the live file is new, it says nothing more", await d.js(`${quietTurn}.textContent`));
    await d.js("window.realNow = Date.now; Date.now = () => window.realNow.call(Date) + 20000");
    check(await d.until(`${quietTurn}.textContent.includes('ksagent has written nothing for over 15 seconds')`,
      15000), "once the live file is older than 15 seconds, the turn says to check ksagent watch",
      await d.js(`${quietTurn}.textContent`));
    const later = new Date(Date.now() + 60000);
    fs.utimesSync(quietLive, later, later);
    check(await d.until(`!${quietTurn}.textContent.includes('written nothing')`, 15000),
      "a live file written again takes the line away", await d.js(`${quietTurn}.textContent`));
    await d.js("Date.now = window.realNow");
    check(browser.page.errors.length === 0, "the page threw nothing", browser.page.errors.join("; "));
  } finally {
    if (browser) await browser.close();
    stopTree(child);
    model.server.close();
  }
}

main().then(() => {
  console.log(verdict.failed === 0 ? "RESULT: ALL PASS" : `RESULT: SOME FAILED (${verdict.failed})`);
  process.exit(verdict.failed === 0 ? 0 : 1);
}, (e) => {
  console.log(`FAIL chat page: the run ended early: ${e.stack || e.message}`);
  console.log("RESULT: SOME FAILED (1)");
  process.exit(1);
});
