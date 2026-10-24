// ksmd page: the local server. The page reads and writes the workspace's files by asking
// `kssrv --local`, by each file's path from the workspace root. The protocol and what the server
// refuses are `docs/SPEC-local-server.md`; the page holds no file handle of its own.
// Caution: **Never put the token in a query, a cookie or the page.** It arrives once in the URL's
// fragment, moves to this tab's storage, and goes out only in the `Authorization` header.
"use strict";

function ksmdLocal() {
  const KEY = "ksmd.token";
  // A request past this many milliseconds says why: a browser opens six connections to one
  // server, and each tab holds one of them (`hold`).
  const WAIT_MS = 15000;

  function takeToken() {
    const hash = location.hash || "";
    const at = hash.indexOf("t=");
    if (at < 0) return "";
    const got = decodeURIComponent(hash.slice(at + 2).split("&")[0]);
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (_) { /* the token still works where the address cannot be rewritten */ }
    try {
      if (got) sessionStorage.setItem(KEY, got);
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
    `The local server did not answer within ${WAIT_MS / 1000} seconds. A browser opens six ` +
      "connections to one server, and each ksmd tab holds one. Close a ksmd tab, then try again." :
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

  return {
    token,
    reason,
    digest,
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
      try {
        const got = await send(`/api/stat?path=${encodeURIComponent(path)}`);
        return got.ok ? true : got.status === 404 ? false : null;
      } catch (_) {
        return null;
      }
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
    // Holds one connection open while the page is open, so the server stops only once no page
    // holds it. **It opens again when it ends**, as a connection can break with the tab open.
    async hold() {
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
    },
  };
}
