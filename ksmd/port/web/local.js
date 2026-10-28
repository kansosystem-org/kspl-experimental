// ksmd page: the local server. The page reads and writes the workspace's files by asking
// `kssrv --local`, by each file's path from the workspace root. The protocol and what the server
// refuses are `docs/SPEC-local-server.md`; the page holds no file handle of its own.
// Caution: **Never put the token in a query, a cookie or the page.** It arrives once in the URL's
// fragment, moves to this tab's storage, and goes out only in the `Authorization` header.
"use strict";

function ksmdLocal() {
  const KEY = "ksmd.token";
  // The token's one form: 48 lowercase hexadecimal digits ("How the token gets across").
  const TOKEN = /^[0-9a-f]{48}$/;
  // A request past this many milliseconds gives up and says so.
  const WAIT_MS = 15000;

  // Takes the token from the fragment's `t=` once, when the page starts. **Read it as name=value
  // pairs**: `#heart=1` holds no token. Text of another form never replaces the token kept.
  function takeToken() {
    const got = new URLSearchParams((location.hash || "").slice(1)).get("t");
    if (got === null) return "";
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (_) { /* the token still works where the address cannot be rewritten */ }
    if (!TOKEN.test(got)) return "";
    try {
      sessionStorage.setItem(KEY, got);
    } catch (_) { /* without storage, a reload asks for the URL again */ }
    return got;
  }
  function recall() {
    try {
      return sessionStorage.getItem(KEY) || "";
    } catch (_) {
      return "";
    }
  }
  const token = takeToken() || recall();
  const head = () => ({ Authorization: `Bearer ${token}` });
  const at = (path) => `/api/file?path=${encodeURIComponent(path)}`;
  const send = (url, how = {}) => fetch(url,
    { ...how, headers: { ...head(), ...(how.headers || {}) }, signal: AbortSignal.timeout(WAIT_MS) });

  // Why a request got no answer, in words a person can act on.
  const lost = (e) => (e && e.name === "TimeoutError" ?
    `The local server did not answer within ${WAIT_MS / 1000} seconds. Try again. If it still ` +
      "does not answer, start ksmd on the folder again, then open the URL it shows." :
    "The local server cannot be reached. Start ksmd on the folder again, then open the URL it shows.");

  // What a refusal means for a file, by its status.
  function reason(status) {
    if (status === 401) return "The page has no valid token. Open the URL the local server showed.";
    if (status === 403) return "The local server refused the path: a link stands along it.";
    if (status === 404) return "No file stands there.";
    if (status === 413) return "The file is too large for the local server to take.";
    return `The local server refused it (${status}).`;
  }

  // The SHA-256 digest of bytes, as 64 lowercase hex digits: what a conditional write names.
  async function digest(bytes) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(d), (n) => n.toString(16).padStart(2, "0")).join("");
  }

  // What stands at a path: { size, at }, with `at` the second it last changed. Nothing there is
  // { size: -1, at: -1 }, and null means it could not be asked.
  async function stat(path) {
    try {
      const got = await send(`/api/stat?path=${encodeURIComponent(path)}`);
      if (got.status === 404) return { size: -1, at: -1 };
      if (!got.ok) return null;
      const said = await got.json();
      return { size: Number(said.size), at: Number(said.changed_at) };
    } catch (_) {
      return null;
    }
  }

  return {
    token,
    reason,
    digest,
    stat,
    // Whether a local server answers with file access: { root } or { why }.
    async status() {
      if (location.protocol !== "http:" && location.protocol !== "https:") return { why: "" };
      let got;
      try {
        got = await send("/api/status");
      } catch (e) {
        return { why: lost(e) };
      }
      if (got.status === 401) return { why: reason(401) };
      let said = null;
      try {
        said = await got.json();
      } catch (_) { /* not the local server's answer */ }
      if (!got.ok || !said || said.local !== true || said.conditional_writes !== true) {
        return { why: "This server does not open files for ksmd. Start ksmd with kssrv --local." };
      }
      return { root: String(said.root) };
    },
    // A file's bytes: { status, bytes } on 200, else { status, why }.
    async read(path) {
      try {
        const got = await send(at(path));
        if (!got.ok) return { status: got.status, why: reason(got.status) };
        return { status: 200, bytes: new Uint8Array(await got.arrayBuffer()) };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Whether anything stands at a path: true, false, or null where it could not be asked.
    async stands(path) {
      const got = await stat(path);
      return got === null ? null : got.size >= 0;
    },
    // The names in one folder: { status, folders, files, more } on 200, else { status, why }.
    async list(path) {
      try {
        const got = await send(`/api/list?path=${encodeURIComponent(path)}`);
        if (!got.ok) return { status: got.status, why: reason(got.status) };
        const said = await got.json();
        return { status: 200, folders: said.folders, files: said.files, more: said.more === true };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Replaces a file only if it still holds what `expected` names: a digest of its bytes, or
    // null for no file at all. { status, why }; 409 means the file is not what was expected.
    async write(path, bytes, expected) {
      try {
        const got = await send(at(path), { method: "PUT", body: bytes,
          headers: { "X-Kanso-If-Content": expected === null ? "missing" : expected } });
        return { status: got.status, why: got.ok ? "" : reason(got.status) };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Holds one connection open while a tab of the page is open, so the server stops only once
    // none is. **One tab of this address holds it**: a browser opens six connections to one
    // server, and a hold in each tab would use them up, so no save could go out. The other tabs
    // wait for the lock, and one takes over when the holder closes. The hold opens again when it
    // ends, as a connection can break with the tab open.
    hold() {
      const holding = async () => {
        for (;;) {
          try {
            const got = await fetch("/api/here", { headers: head() });
            if (got.ok && got.body) {
              const reader = got.body.getReader();
              while (!(await reader.read()).done) { /* nothing arrives; the wait is the hold */ }
            }
          } catch (_) { /* the server went, or the connection broke */ }
          await new Promise((go) => setTimeout(go, 5000));
        }
      };
      if (navigator.locks) navigator.locks.request("ksmd-hold", holding);
      else holding();
    },
  };
}
