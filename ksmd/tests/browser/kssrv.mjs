// The local server for the checks that serve the page: `kssrv --local` started on a workspace,
// and one raw request to it. `served.mjs` and `measure.mjs` use it.
import { spawn } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";

// Starts kssrv on the root, and reads the URL it prints: the port and the token. `more` holds
// further options, such as `--idle=<seconds>`.
export function start(kssrv, root, pageFile, logFile, more = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(kssrv, ["0", root, "--local", `--page=${path.resolve(pageFile)}`, ...more],
      { stdio: ["ignore", "pipe", "pipe"] });
    let seen = "";
    const log = fs.createWriteStream(logFile);
    // A server that printed no URL is ended before the failure is told: one left running keeps
    // its executable locked on Windows, and every later run fails to write it.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`no URL in 10 s: ${seen}`));
    }, 10000);
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
export function request(port, method, target, headers = {}, body = null) {
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
