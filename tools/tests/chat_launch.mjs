// The launcher's model server, with no browser: `ksagent_chat` started on scratch folders, with a
// stand-in in place of llama-server and chat_server (`chat_support.mjs`). The cases: a missing
// model file, a port held by something else, a server that never gets ready, one that ends early,
// starting one, reusing it, stopping only the one started, a model named in vain, Ctrl+C with
// `--model-only`, chat_server where llama-server is not on PATH, and the settings it refuses.
// Usage: node tools/tests/chat_launch.mjs <ksagent_chat.exe> <work folder>
// It prints `pass` and `FAIL` lines, and `RESULT: SOME FAILED` only where a case fails.
import { execFileSync, spawn } from "child_process";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { verdict } from "../../ksmd/tests/browser/drive.mjs";
import { freePort, place, standInProgram } from "./chat_support.mjs";

const [launcherBuilt, work] = process.argv.slice(2);
const check = (ok, what, detail = "") => verdict.check(ok, what, detail);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FIRST = "Qwen3-4B-Instruct-2507-Q4_K_M.gguf";
const models = path.join(work, "models");
const folder = path.join(work, "folder");
const withLlama = path.join(work, "path");

// Starts the launcher in a process group of its own, and gathers what it prints, into
// `<work>/launch-<n>.log` too. **It has ended once its output has closed**, not at its exit: the
// last lines it printed can arrive after that.
let runs = 0;
function start(args, env = {}) {
  const child = spawn(launcher, args, { stdio: ["ignore", "pipe", "pipe"], detached: true,
    env: { ...process.env, ...env } });
  child.seen = "";
  child.code = null;
  runs += 1;
  const log = fs.createWriteStream(path.join(work, `launch-${runs}.log`));
  const take = (chunk) => { child.seen += chunk; log.write(chunk); };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  child.ended = new Promise((resolve) => child.on("close", (code) => { child.code = code; resolve(code); }));
  return child;
}

async function until(test, ms) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(100)) {
    if (test()) return true;
  }
  return test();
}

const ended = (child, ms) => Promise.race([child.ended.then(() => true), wait(ms).then(() => false)]);
const urlOf = (port) => `--model-url=http://127.0.0.1:${port}`;
// The options as `make chat` writes them: each one always, empty where its setting is not given.
const asMake = (port, { dir = folder, model = "" } = {}) =>
  [`--dir=${dir}`, `--model-file=${model}`, `--port=${port}`];
const pidOf = (file) => Number(fs.readFileSync(`${file}.pid`, "utf8"));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (_) { return false; } };

// Whether something accepts a connection on the port.
const listening = (port) => new Promise((resolve) => {
  const s = net.connect(port, "127.0.0.1", () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
});

// The `ksagent watch` the launcher runs, by its parent's process ID.
function watchOf(parent) {
  const rows = execFileSync("ps", ["-eo", "pid=,ppid=,args="], { encoding: "utf8" }).split("\n");
  for (const row of rows) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(row);
    if (m && Number(m[2]) === parent && / watch /.test(m[3])) return { pid: Number(m[1]), args: m[3] };
  }
  return null;
}

function model(file, mode) {
  fs.mkdirSync(models, { recursive: true });
  const at = path.resolve(models, file);
  fs.writeFileSync(at, `${mode}\n`);
  return at;
}

const stop = (child) => { try { process.kill(-child.pid, "SIGINT"); } catch (_) { /* gone */ } };

// What the launcher refuses before it asks any model server, each with what to do.
async function refused() {
  verdict.part = "settings refused";
  const cases = [
    [asMake("", { dir: "" }), 1, /name the folder to ask about: make chat DIR=<folder>/, "no folder, as make gives it"],
    [asMake("eighty"), 1, /--port takes a port number from 1 to 65535/, "a port that is not a number"],
    [["--model-only", `--dir=${folder}`], 1, /--dir and --show would do nothing/, "a folder with --model-only"],
    [[folder, "--", urlOf(8081)], 2, /unexpected/, "the old form, a folder and options after --"],
  ];
  for (const [args, code, said, what] of cases) {
    const c = start(args);
    await ended(c, 10000);
    check(c.code === code && said.test(c.seen), what, c.seen);
  }
}

async function missingModel() {
  verdict.part = "a missing model file";
  const c = start(asMake(await freePort()));
  await ended(c, 10000);
  const line = (c.seen.split("\n").find((l) => l.trim().startsWith("curl ")) || "").trim();
  check(c.code === 1 && line.startsWith(`curl -L -o models/${FIRST} https://`),
    "it stops and prints the download command", c.seen);
  for (const doc of ["models/README.md", "ksagent/docs/TUTORIAL-ask-about-your-files.md"]) {
    const text = fs.existsSync(doc) ? fs.readFileSync(doc, "utf8") : "";
    check(line !== "" && text.includes(line), `${doc} holds the same command`, line);
  }
}

async function missingOther() {
  verdict.part = "a missing model file named by MODEL";
  const other = "Qwen3.5-9B-Q3_K_M.gguf";
  const c = start(asMake(await freePort(), { model: other }));
  await ended(c, 10000);
  const line = (c.seen.split("\n").find((l) => l.trim().startsWith("curl ")) || "").trim();
  check(c.code === 1 && line.startsWith(`curl -L -o models/${other} https://`) &&
    fs.readFileSync("models/README.md", "utf8").includes(line), "models/README.md holds the command it prints",
    c.seen);
}

async function portTaken() {
  verdict.part = "a port held by something else";
  const other = http.createServer((req, res) => { res.writeHead(404); res.end("not here"); });
  await new Promise((r) => other.listen(0, "127.0.0.1", r));
  const c = start(asMake(other.address().port));
  await ended(c, 10000);
  check(c.code === 1 && /answers, but not as a model server \(HTTP 404/.test(c.seen),
    "it is refused, with what to do", c.seen);
  other.close();
}

async function neverReady() {
  verdict.part = "a server that never gets ready";
  const file = model(FIRST, "never");
  const c = start(["--model-wait=3", ...asMake(await freePort())]);
  check(await ended(c, 15000), "the launcher gives up", c.seen);
  check(c.code === 1 && /was not ready after \d+ seconds, so it was stopped/.test(c.seen),
    "it says so", c.seen);
  check(/still loading/.test(c.seen) || /waiting for llama-server/.test(c.seen), "it said it waited", c.seen);
  check(await until(() => !alive(pidOf(file)), 5000), "the server it started is stopped");
}

async function crashes() {
  verdict.part = "a server that ends early";
  model(FIRST, "crash");
  const c = start(asMake(await freePort()));
  await ended(c, 15000);
  check(c.code === 1 && /stopped before it was ready/.test(c.seen) &&
    /\| stand-in: cudaMalloc failed: out of memory/.test(c.seen) && /the whole log: /.test(c.seen) &&
    /does not fit in memory/.test(c.seen), "its last lines and what to do are shown", c.seen);
}

async function startReuseStop() {
  verdict.part = "starting, reusing and stopping";
  const file = model(FIRST, "ready");
  const port = await freePort();
  const a = start(["--show", ...asMake(port)]);
  check(await until(() => /ready\. Ask on the page/.test(a.seen), 30000), "the launcher gets ready", a.seen);
  check(/nothing answers at .*so this command starts one/.test(a.seen) &&
    /starting llama-server on models\/.*\(it is on PATH, and uses the graphics card\)/.test(a.seen) &&
    /waiting for llama-server to load/.test(a.seen) && /model server: ready at/.test(a.seen),
    "it says it starts llama-server, waits, and is ready", a.seen);
  const argv = JSON.parse(fs.readFileSync(`${file}.argv`, "utf8"));
  check(argv.join(" ") === `-m ${file} --jinja -c 32768 --flash-attn on --cache-type-k q8_0 ` +
    `--cache-type-v q8_0 --port ${port}`,
    "llama-server gets the model, its options and the port", argv.join(" "));
  const server = pidOf(file);

  const b = start(["--show", ...asMake(port)]);
  check(await ended(b, 20000), "a second launcher on the folder ends, as its watch refuses", b.seen);
  check(/using the one already answering/.test(b.seen), "it uses the running server", b.seen);
  check(alive(server) && await listening(port), "and leaves the server it did not start alone");

  const named = start(asMake(port, { model: FIRST }));
  await ended(named, 10000);
  check(named.code === 1 && /would change nothing/.test(named.seen), "a model named for it is refused",
    named.seen);

  const w = watchOf(a.pid);
  check(w !== null && w.args.includes(urlOf(port)) && !w.args.includes("--timeout="),
    "ksagent watch asks the server, with its own timeout", w && w.args);
  if (w) process.kill(w.pid, "SIGTERM");
  check(await ended(a, 10000), "the launcher ends with its watch", a.seen);
  check(/stopped llama-server, which this command started/.test(a.seen), "it says it stopped it", a.seen);
  check(await until(() => !alive(server), 5000), "the server it started is stopped");
}

async function modelOnlyInterrupted() {
  verdict.part = "--model-only and Ctrl+C";
  const file = model(FIRST, "ready");
  const port = await freePort();
  const c = start(["--model-only", "--model-file=", `--port=${port}`]);
  check(await until(() => /ksagent ask and eval reach it at/.test(c.seen), 30000), "the server alone gets ready",
    c.seen);
  const server = pidOf(file);
  stop(c);
  check(await ended(c, 10000), "Ctrl+C ends the launcher", c.seen);
  check(await until(() => !alive(server), 5000), "and the server it started");
}

async function fallback() {
  verdict.part = "chat_server where llama-server is not on PATH";
  const file = model(FIRST, "ready");
  const bare = process.env.PATH.split(":").filter((d) => !fs.existsSync(path.join(d, "llama-server")));
  const port = await freePort();
  const none = start(asMake(port), { PATH: bare.join(":") });
  await ended(none, 10000);
  check(none.code === 1 && /chat_server is not built/.test(none.seen) &&
    /Install llama\.cpp/.test(none.seen) && /: make chat-server NATIVE=1/.test(none.seen),
    "with chat_server not built either, it stops and names both ways out", none.seen);
  standInProgram(path.join(path.dirname(launcher), "chat_server.exe"));
  const c = start(["--show", ...asMake(port)], { PATH: bare.join(":") });
  check(await until(() => /ready\. Ask on the page/.test(c.seen), 30000), "the launcher gets ready", c.seen);
  check(/starting chat_server on models\/.*since llama-server is not on PATH\. It runs on the CPU only/
    .test(c.seen), "it says it uses chat_server, and that it is slow", c.seen);
  const argv = JSON.parse(fs.readFileSync(`${file}.argv`, "utf8"));
  check(argv.join(" ") === `${file} --port=${port}`, "chat_server gets the model and the port", argv.join(" "));
  const w = watchOf(c.pid);
  check(w !== null && w.args.includes("--timeout=3600"), "ksagent watch waits longer for it", w && w.args);
  const server = pidOf(file);
  stop(c);
  await ended(c, 10000);
  check(await until(() => !alive(server), 5000), "Ctrl+C stops it too");
}

function sameDefault() {
  verdict.part = "the default address";
  const of = (f) => (/const DEFAULT_URL: U8\[\] = "([^"]+)"/.exec(fs.readFileSync(f, "utf8")) || [])[1];
  const ours = of("tools/model_server.kspl");
  check(ours !== undefined && ours === of("ksagent/model.kspl"), "the launcher's equals ksagent's", ours);
}

let launcher = "";
async function main() {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "leave.md"), "A new employee receives 10 days of paid leave.\n");
  launcher = place(launcherBuilt, work);
  sameDefault();
  await refused();
  await missingModel();
  await missingOther();
  await portTaken();
  // **The cases that start a model server need POSIX here**: the stand-in is a shell script, which
  // Windows does not start as `llama-server`, and Ctrl+C and the started `ksagent watch` are
  // reached through process groups and `ps`. On Windows, a real llama-server checks them by hand
  // (ksagent/docs/TUTORIAL-ask-about-your-files.md).
  const started = [["a server that never gets ready", neverReady], ["a server that ends early", crashes],
    ["starting, reusing and stopping", startReuseStop], ["--model-only and Ctrl+C", modelOnlyInterrupted],
    ["chat_server where llama-server is not on PATH", fallback]];
  if (process.platform === "win32") {
    for (const [part] of started) {
      verdict.part = part;
      verdict.skip("the stand-in model server is a shell script, which Windows does not start as a program");
    }
    return;
  }
  standInProgram(path.join(withLlama, "llama-server"));
  // **The stand-in comes first on PATH**, before any llama-server the machine has.
  process.env.PATH = `${withLlama}:${process.env.PATH}`;
  for (const [, run] of started) await run();
}

main().then(() => {
  if (verdict.failed > 0) console.log(`RESULT: SOME FAILED (${verdict.failed})`);
  process.exit(verdict.failed === 0 ? 0 : 1);
}, (e) => {
  console.log(`FAIL launcher: the run ended early: ${e.stack || e.message}`);
  console.log("RESULT: SOME FAILED (1)");
  process.exit(1);
});
