// ksagent's chat page, driven in a headless Chromium along the whole path a question takes: the
// page appends it to the ask file, `ksagent watch` (started by the opener with `--show`) asks a
// stand-in model server, the answer grows in the live file, and the checked answer replaces it.
// The cases: the Markdown reader alone, on usual and on hostile text; asking; the answer growing;
// the checked answer; a stopped answer; a model's answer holding markup, shown as text; Japanese;
// a save that meets another tab's write; a reload; a turn the reader cannot show; lines ksagent
// refuses; an answer ksagent could not record; and an ask file past its cap. The browser and its
// driver are ksmd's (`ksmd/tests/browser/`).
// Usage: node tools/tests/chat_page.mjs <browser> <ksagent_chat.exe> <work folder>
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { launch } from "../../ksmd/tests/browser/cdp.mjs";
import { driver, verdict } from "../../ksmd/tests/browser/drive.mjs";
import { place, standIn } from "./chat_support.mjs";

const [browserBin, opener, work] = process.argv.slice(2);
const check = (ok, what, detail = "") => verdict.check(ok, what, detail);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Waits until a test on the files holds, up to `ms`, as `d.until` waits on the page.
async function diskUntil(holds, ms) {
  for (const end = Date.now() + ms; !holds(); await wait(100)) if (Date.now() > end) return false;
  return true;
}

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
    const timer = setTimeout(() => reject(new Error(`no URL in 20 s: ${seen}`)), 20000);
    const take = (chunk) => {
      log.write(chunk);
      seen += chunk;
      const m = /(http:\/\/127\.0\.0\.1:(\d+)\/)#t=([0-9a-f]{48})/.exec(seen);
      if (m && !child.url) {
        clearTimeout(timer);
        child.url = m[0];
        child.token = m[3];
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

// Text a hostile or runaway model can write, each of which must read within HEAVY_MS and throw
// nothing: marks that never close, deep quotes, brackets and parentheses that never close, a list
// with many blank lines, and emphasis nested deep.
const HEAVY_MS = 3000;
const HEAVY = [
  ["unmatched marks", "\"*a \".repeat(33000)"],
  ["20,000 quote marks", "\">\".repeat(20000) + \" x\""],
  ["open brackets", "\"[\".repeat(30000) + \"x\""],
  ["open link targets", "\"[a](\".repeat(20000)"],
  ["blank lines in a list", "\"- a\\n\" + \"\\n\".repeat(30000) + \"  b\""],
  ["deep emphasis", "\"*_\".repeat(10000) + \"x\" + \"_*\".repeat(10000)"],
];

async function main() {
  verdict.part = "chat page";
  const root = path.join(work, "folder");
  fs.mkdirSync(path.join(root, "rules"), { recursive: true });
  fs.mkdirSync(path.join(root, "規程"), { recursive: true });
  fs.writeFileSync(path.join(root, "rules/leave.md"), LEAVE);
  fs.writeFileSync(path.join(root, "規程/休暇.md"), KYUKA);
  const model = await standIn({ replies: REPLIES });
  const child = await startOpener(place(opener, work), root, model.port);
  const browser = await launch(browserBin, path.join(work, "browser"));
  const disk = (f) => { try { return fs.readFileSync(path.join(root, f), "utf8"); } catch (_) { return ""; } };
  try {
    const d = driver(browser.page);
    // **The page's words follow the browser's language** (`ja` in `ksagent/page/chat.html`), and
    // these checks read the English ones. A browser takes its language from the OS: on a Japanese
    // Windows every badge and note came out in Japanese. So the language is set here.
    const { userAgent } = await browser.page("Browser.getVersion");
    await browser.page("Emulation.setUserAgentOverride", { userAgent, acceptLanguage: "en-US" });
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
      const ms = await d.js(`(() => { const t = performance.now(); try { ksagentMarkdown.render(` +
        `ksagentMarkdown.parse(${expr}), document.createElement('div')); } catch (e) { return -1; } ` +
        "return performance.now() - t; })()");
      check(ms >= 0 && ms < HEAVY_MS, `hostile Markdown reads in time, throwing nothing: ${what}`,
        `${Math.round(ms)} ms`);
    }
    check(await d.js("ksagentMarkdown.render(ksagentMarkdown.parse('> '.repeat(12) + 'x'), " +
      "document.createElement('div')).querySelectorAll('blockquote').length") === 8,
      "quotes nest 8 deep, and the rest reads as text");

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
    await d.js(`${turn(1)}.querySelector('.actions button').click()`);
    check(await d.until(`${stateOf(1)} === 'stopped'`, 15000), "Stop ends it, and it shows as stopped",
      await d.js(stateOf(1)));
    check(await d.until(`(() => { const t = ${turn(1)};
      return t.querySelector('.badge').textContent === 'Stopped' && t.querySelector('.sources') === null &&
        t.querySelector('.unchecked') !== null; })()`, 15000),
      "a stopped answer shows its partial text as unchecked, and no source",
      await d.js(`${turn(1)}.textContent`));
    // The page shows it stopped from the live file, before ksagent records it.
    const stoppedRecord = () => disk(`${name}.chat.jsonl`).includes("\"state\":\"stopped\"") &&
      disk(`${name}.chat.jsonl`).includes("stopped on the page");
    check(await diskUntil(stoppedRecord, 15000), "the chat file records it as stopped",
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
    await diskUntil(bothAsked, 15000);
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
    const deadline = Date.now() + 15000;
    while (told().length < 6 && Date.now() < deadline) await wait(250);
    const said = told();
    // **The page reads the ask file on its own beat**, so it may name the lines after ksagent has.
    await d.until(`(() => { const n = document.getElementById('notice').textContent;
      return ${JSON.stringify(said)}.every((x) => n.includes(x)); })()`, 15000);
    const notice = await d.js("document.getElementById('notice').textContent");
    check(said.length === 6 && said.every((x) => notice.includes(x)),
      "each line ksagent passes over is named on the page, in ksagent's words",
      `ksagent: ${said.join(" / ")}; page: ${notice}`);
    check(await count() === broke + 2, "no line it passes over shows as a question");

    // An answer ksagent could not record shows as stopped, with why, and can be asked again.
    await ask("An answer that will not be recorded");
    const lost = broke + 2;
    check(await d.until(`${stateOf(lost)} === 'writing'`, 15000), "that answer starts growing");
    fs.appendFileSync(path.join(root, `${name}.chat.jsonl`), "{broken\n");
    check(await d.until(`${stateOf(lost)} === 'stopped'`, 30000),
      "once ksagent gives up recording it, the turn shows as stopped", await d.js(stateOf(lost)));
    check(await d.until(`(() => { const t = ${turn(lost)}; const n = t.querySelector('.notes');
      return n !== null && n.textContent.includes('could not record an answer') &&
        n.textContent.includes('not one JSON value') &&
        t.querySelector('.unchecked') !== null && t.querySelector('.actions button') !== null; })()`, 15000),
      "it says why, keeps its text unchecked, and offers Ask again", await d.js(`${turn(lost)}.textContent`));

    // An ask file past its cap is not answered, and the page says why.
    fs.writeFileSync(path.join(root, "big.ask.jsonl"),
      `{"type": "question", "id": "big1", "text": "${"x".repeat(1100000)}"}\n`);
    await browser.page("Page.navigate", { url: `${child.base}?chat=big` });
    check(await d.until("document.getElementById('notice').textContent.includes('larger than 1 MiB')",
      20000), "a conversation whose ask file is past its cap says so on the page",
      await d.js("document.getElementById('notice').textContent"));
    check(browser.page.errors.length === 0, "the page threw nothing", browser.page.errors.join("; "));
  } finally {
    await browser.close();
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
