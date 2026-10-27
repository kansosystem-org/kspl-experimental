// A headless Chromium driven over the DevTools protocol, through the pipe the browser opens on
// file descriptors 3 and 4 (`--remote-debugging-pipe`). No port is opened, so two runs on one
// machine do not meet, and no library beyond node is needed.
// Caution: **Answer a dialog from the event, never from the call that opened it**: that call does
// not return while the dialog stands.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const CALL_LIMIT_MS = 20000;

export async function launch(binary, work) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  const args = [
    "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
    "--remote-debugging-pipe", `--user-data-dir=${path.join(work, "profile")}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--window-size=1200,900", "about:blank",
  ];
  const log = fs.openSync(path.join(work, "browser.log"), "w");
  const child = spawn(binary, args, { stdio: ["ignore", log, log, "pipe", "pipe"] });
  const toBrowser = child.stdio[3];
  const fromBrowser = child.stdio[4];
  let next = 1;
  const waiting = new Map();
  const listeners = [];
  let buffer = "";
  fromBrowser.setEncoding("utf8");
  fromBrowser.on("data", (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id && waiting.has(message.id)) {
        const { resolve, reject, timer } = waiting.get(message.id);
        waiting.delete(message.id);
        clearTimeout(timer);
        if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
        else resolve(message.result);
      } else if (message.method) {
        for (const f of listeners) f(message);
      }
    }
  });
  const gone = new Promise((resolve) => child.on("exit", resolve));

  function send(method, params = {}, sessionId = undefined) {
    const id = next++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(id);
        reject(new Error(`${method} got no answer in ${CALL_LIMIT_MS} ms`));
      }, CALL_LIMIT_MS);
      waiting.set(id, { resolve, reject, timer });
      toBrowser.write(JSON.stringify(message) + "\0");
    });
  }

  // The text the next prompt is answered with; null dismisses it.
  let answer = null;
  // Each tab the browser made, and the tabs this driver made or took already.
  const created = [];
  const known = new Set();
  listeners.push((m) => {
    if (m.method === "Target.targetCreated" && m.params.targetInfo.type === "page") {
      created.push(m.params.targetInfo.targetId);
    }
  });

  // A page to drive: a function that sends a call to it, with its target's id.
  async function attach(targetId) {
    known.add(targetId);
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const page = (method, params) => send(method, params, sessionId);
    // What went wrong in the page, kept so a check that fails can say why.
    page.errors = [];
    // The kind of each dialog the page opened, such as "beforeunload".
    page.dialogs = [];
    listeners.push((m) => {
      if (m.sessionId === sessionId && m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        page.errors.push(d.exception && d.exception.description ? d.exception.description : d.text);
      }
      if (m.sessionId === sessionId && m.method === "Page.javascriptDialogOpening") {
        page.dialogs.push(m.params.type);
        page("Page.handleJavaScriptDialog", answer === null ? { accept: false } :
          { accept: true, promptText: answer }).catch(() => {});
      }
    });
    await page("Page.enable");
    await page("Runtime.enable");
    page.targetId = targetId;
    return page;
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const page = await attach(targetId);
  await send("Target.setDiscoverTargets", { discover: true });
  // The tabs standing at the start are no tab a page opened.
  await new Promise((r) => setTimeout(r, 100));
  for (const t of created) known.add(t);

  return {
    page,
    answerPrompts(text) {
      answer = text;
    },
    // Opens a new tab on `url`.
    async open(url) {
      const made = await send("Target.createTarget", { url });
      return attach(made.targetId);
    },
    // A tab a page opened by itself, not taken before, or null after `ms`.
    async opened(ms = 5000) {
      for (let waited = 0; waited < ms; waited += 50) {
        const id = created.find((t) => !known.has(t));
        if (id) return attach(id);
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    },
    // Closes a tab, as a person closes it.
    async closeTab(p) {
      await send("Target.closeTarget", { targetId: p.targetId });
    },
    async close() {
      try {
        await send("Browser.close");
      } catch (e) {
        child.kill("SIGKILL");
      }
      await Promise.race([gone, new Promise((r) => setTimeout(r, 5000))]);
      child.kill("SIGKILL");
    },
  };
}
