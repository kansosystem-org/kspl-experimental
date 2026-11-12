// The browser's client for `kssrv --local`: the token, the requests, and the hold. The protocol
// and what the server refuses are `docs/SPEC-local-server.md`. ksmd's page and ksagent's chat page
// each take this file into their one file (`kssrv/page/bundle.kspl`), and say what a refusal
// means in their own words.
// Caution: **Never put the token in a query, a cookie or the page.** It arrives once in the URL's
// fragment, moves to this tab's storage, and goes out only in the `Authorization` header.
"use strict";

// `name` keeps one page's token and hold apart from another's: the token is `<name>.token` in
// the tab's storage, and the hold takes the lock `<name>-hold`.
function kssrvLocal(name) {
  const KEY = `${name}.token`;
  // The token's one form: 48 lowercase hexadecimal digits ("How the token gets across").
  const TOKEN = /^[0-9a-f]{48}$/;
  // A request past this many milliseconds gives up. The server runs on this computer, so 15 s is
  // ample. Without a limit, a server that takes a request and never answers stops the page with
  // no word.
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
  // A request with the token. **No answer comes from the browser's cache**: a file read twice
  // may have changed between. A request with no answer within `wait` milliseconds throws.
  // Caution: **Only the hold passes `wait` 0**: its request stays open on purpose (`hold`).
  const send = (url, how = {}, wait = WAIT_MS) => fetch(url, { ...how, cache: "no-store",
    headers: { ...head(), ...(how.headers || {}) },
    ...(wait > 0 ? { signal: AbortSignal.timeout(wait) } : {}) });
  // The address of one of the protocol's requests about a path, such as `ask("file", "a.txt")`.
  const ask = (api, path) => `/api/${api}?path=${encodeURIComponent(path)}`;

  // The SHA-256 digest of bytes, as 64 lowercase hex digits: what a conditional write names.
  async function digest(bytes) {
    const d = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(d), (n) => n.toString(16).padStart(2, "0")).join("");
  }

  return {
    token,
    WAIT_MS,
    send,
    ask,
    digest,
    // A file's bytes: { status: 200, bytes }, else { status }. A request with no answer throws.
    async read(path) {
      const got = await send(ask("file", path));
      if (!got.ok) return { status: got.status };
      return { status: 200, bytes: new Uint8Array(await got.arrayBuffer()) };
    },
    // What stands at a path: { status: 200, size, at }, with `at` the second it last changed,
    // else { status }. A request with no answer throws.
    async stat(path) {
      const got = await send(ask("stat", path));
      if (!got.ok) return { status: got.status };
      const said = await got.json();
      return { status: 200, size: Number(said.size), at: Number(said.changed_at) };
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
            const got = await send("/api/here", {}, 0);
            if (got.ok && got.body) {
              const reader = got.body.getReader();
              while (!(await reader.read()).done) { /* nothing arrives; the wait is the hold */ }
            }
          } catch (_) { /* the server went, or the connection broke */ }
          await new Promise((go) => setTimeout(go, 5000));
        }
      };
      if (navigator.locks) navigator.locks.request(`${name}-hold`, holding);
      else holding();
    },
  };
}
