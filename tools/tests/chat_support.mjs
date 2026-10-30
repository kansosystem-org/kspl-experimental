// What the chat tests share: a stand-in model server, and the launcher copied into a scratch folder.
// The stand-in runs in the test's own process (`standIn`), or as a program in place of
// llama-server or chat_server. As a program it takes llama-server's form (`-m <file> --port <n>`)
// or chat_server's (`<file> --port=<n>`). The model file's first word says how it acts:
//   ready  answers 503 to /health while it "loads" for LOAD_MS, then answers
//   never  loads for ever
//   crash  prints a line, as a server out of memory does, and ends at once
// It writes its arguments to `<file>.argv` and its process ID to `<file>.pid`.
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const LOAD_MS = 1500;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// One `answer` call, streamed in pieces, chosen by the words of the last question.
async function answer(body, replies, res) {
  const msgs = JSON.parse(body).messages.filter((m) => m.role === "user");
  const q = msgs.length > 0 ? String(msgs[msgs.length - 1].content) : "";
  const r = replies.find((x) => q.includes(x.when)) || { ms: 0, text: "NOT_FOUND", sources: [] };
  res.writeHead(200, { "Content-Type": "text/event-stream" });
  let gone = false;
  res.on("close", () => { gone = true; });
  const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
  const delta = (d, finish = null) => send({ choices: [{ index: 0, delta: d, finish_reason: finish }] });
  delta({ role: "assistant", content: null });
  delta({ tool_calls: [{ index: 0, id: "call_1", type: "function",
    function: { name: "answer", arguments: "" } }] });
  const args = Array.from(JSON.stringify({ text: r.text, sources: r.sources }));
  for (let at = 0; at < args.length && !gone; at += 8) {
    delta({ tool_calls: [{ index: 0, function: { arguments: args.slice(at, at + 8).join("") } }] });
    if (r.ms > 0) await wait(r.ms);
  }
  if (gone) return;
  delta({}, "tool_calls");
  res.end("data: [DONE]\n\n");
}

// A model server as llama-server answers: `GET /v1/models` at once, `GET /health` with 503 until
// it has loaded, and each chat request with one `answer` call.
export function standIn({ port = 0, replies = [], loadMs = 0, never = false } = {}) {
  const asked = [];
  const readyAt = Date.now() + loadMs;
  const loading = () => never || Date.now() < readyAt;
  const json = (res, status, o) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };
  const server = http.createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/v1/models") {
        json(res, 200, { object: "list", data: [{ id: "stand-in", object: "model" }] });
      } else if (loading()) {
        json(res, 503, { error: { code: 503, message: "Loading model", type: "unavailable_error" } });
      } else if (req.method === "GET" && req.url === "/health") {
        json(res, 200, { status: "ok" });
      } else if (req.method === "POST" && req.url === "/v1/chat/completions") {
        asked.push(body);
        answer(body, replies, res);
      } else {
        json(res, 404, { error: { code: 404, message: "no such endpoint" } });
      }
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1",
    () => resolve({ server, asked, port: server.address().port })));
}

// A port nothing listens on, as the system hands one out.
export function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

// The launcher and what it needs, copied beside it into `<work>/bin`, so its note and logs stay
// out of the repository's `out/tmp`, and its `models/` is `<work>/models`.
export function place(launcher, work) {
  const from = path.dirname(launcher);
  const bin = path.join(work, "bin");
  fs.mkdirSync(path.join(bin, "ksagent"), { recursive: true });
  for (const f of ["ksagent_chat.exe", "kssrv.exe", "ksagent.exe", path.join("ksagent", "chat.html")]) {
    fs.copyFileSync(path.join(from, f), path.join(bin, f));
    if (f.endsWith(".exe")) fs.chmodSync(path.join(bin, f), 0o755);
  }
  return path.join(bin, "ksagent_chat.exe");
}

// Writes a program at `at` that runs this file as the stand-in, with the arguments it is given.
export function standInProgram(at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, `#!/bin/sh\nexec node "${fileURLToPath(import.meta.url)}" "$@"\n`);
  fs.chmodSync(at, 0o755);
}

async function main(argv) {
  let file = "";
  let port = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "-m") file = argv[++i];
    else if (argv[i] === "--port") port = Number(argv[++i]);
    else if (argv[i].startsWith("--port=")) port = Number(argv[i].slice("--port=".length));
    else if (!argv[i].startsWith("-") && file === "") file = argv[i];
  }
  fs.writeFileSync(`${file}.argv`, JSON.stringify(argv));
  fs.writeFileSync(`${file}.pid`, String(process.pid));
  const mode = fs.readFileSync(file, "utf8").trim().split(/\s+/)[0];
  if (mode === "crash") {
    console.error("stand-in: loading the model");
    console.error("stand-in: cudaMalloc failed: out of memory");
    process.exit(1);
  }
  await standIn({ port, loadMs: LOAD_MS, never: mode === "never" });
  console.error(`stand-in: listening on http://127.0.0.1:${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
