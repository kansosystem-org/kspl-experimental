// ==========================================
// kspage's page — the local server. It reads and writes a file by path (text, relative to the
// folder being served).
//
// **A page inside a browser cannot touch the OS** (walk folders, start a process), so it asks a
// program started locally; the contract is `../../../docs/SPEC-local-server.md`. **Its absence is
// normal** (a page opened from `file://` has no server): then the path tools are **not shown**,
// and it is not a separate mode (two versions are not served).
// ==========================================
function kspageLocal(ui) {
  const say = ui.say, deny = ui.deny;

  // ---- The token ----
  // **The token comes in the URL's fragment (`#t=`)**, which is not sent to the server, so another
  // process on the same machine cannot get it by requesting the same address (a query `?` goes in
  // the request line).
  // Caution: **Delete it from the URL as soon as it is read**, or it stays in the history.
  // It is kept in the tab's session storage: it survives a reload, goes with the tab, and other
  // origins cannot read it.
  const KEY = "kspage.local.token";
  const takeToken = () => {
    const hash = location.hash || "";
    const at = hash.indexOf("t=");
    if (at < 0) return "";
    const got = hash.slice(at + 2).split("&")[0];
    if (got === "") return "";
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch (_) { /* the token works even on a page whose URL cannot be rewritten */ }
    return decodeURIComponent(got);
  };
  const remember = (t) => {
    try {
      if (t) sessionStorage.setItem(KEY, t);
    } catch (_) { /* on a page that cannot remember, a reload means being asked again */ }
  };
  const recall = () => {
    try {
      return sessionStorage.getItem(KEY) || "";
    } catch (_) {
      return "";
    }
  };
  let token = takeToken();
  if (token) {
    remember(token);
  } else {
    token = recall();
  }

  // ---- Requests ----
  // **The token goes in the header** (the browser would attach a cookie to a malicious page's
  // requests too).
  // Caution: **Do not put it in the query** (it stays in the logs).
  const head = () => (token ? { Authorization: "Bearer " + token } : {});
  const at = (path) => "/api/file?path=" + encodeURIComponent(path);

  // ---- Whether it is there ----
  //
  // **It asks only once** (asked on every click, a missing server would mean a wait every time).
  // Caution: **Keep "it is there" and "it got through" apart.** A 401 means "there, but no token";
  // calling it "absent" hides that reopening the URL is all it takes.
  let here = false;   // the server is there and the token got through too
  let told = "";      // what to tell a person (empty means there is nothing to say)
  const ask = async () => {
    let got = null;
    try {
      got = await fetch("/api/status", { headers: head() });
    } catch (_) {
      // It does not connect. **This is normal** (a page opened from `file://` is this case).
      return;
    }
    if (got.status === 401) {
      told = "There is a local server but no token. Open the URL kssrv showed";
      return;
    }
    if (!got.ok) return;
    // Caution: **Do not stop at "the server is there".** A kssrv not meant for local use answers
    // `/api/status` too but has no file entry points (a 404), so the tools appear **only where it
    // declares them open**. **Once this holds, the save target is the path alone** (`file.js`);
    // loosen the declaration and a save can land outside the served folder, where it cannot be
    // reopened by path.
    let said = null;
    try {
      said = await got.json();
    } catch (_) {
      return;   // it is a page served by something that is not kssrv
    }
    here = said.local === true;
  };

  // Reads the bytes at that path; where they cannot be read it returns null and gives the reason.
  // Caution: **Do not drop the reason** — "it could not be read" alone cannot tell a missing name
  // from a path outside the root.
  const reasonOf = (status) => {
    if (status === 401) return "The token did not get through. Open the URL kssrv showed";
    if (status === 403) return "This place is outside the folder kssrv publishes";
    if (status === 404) return "There is no such name";
    if (status === 400) return "The place's setting cannot be read";
    if (status === 413) return "It is too large to be taken";
    return "The local server refused it (" + status + ")";
  };
  const readAt = async (path) => {
    let got = null;
    try {
      got = await fetch(at(path), { headers: head() });
    } catch (e) {
      deny("Could not connect to the local server (" + String((e && e.message) || e) + ")");
      return null;
    }
    if (!got.ok) {
      deny(reasonOf(got.status));
      return null;
    }
    // Caution: **Return bytes.** The server does not guess the type (a guessed type gets believed),
    // so the caller decides whether it is text; a document and a history go through the same path.
    return new Uint8Array(await got.arrayBuffer());
  };
  // Writes to that path. Empty text if written, and the reason if not.
  const writeAt = async (path, data) => {
    let got = null;
    try {
      got = await fetch(at(path), { method: "PUT", headers: head(), body: data });
    } catch (e) {
      return "Could not connect (" + String((e && e.message) || e) + ")";
    }
    return got.ok ? "" : reasonOf(got.status);
  };
  // Whether it changed. null if it does not exist. **The contents are not returned** (read it again
  // where they are needed).
  const statAt = async (path) => {
    try {
      const got = await fetch("/api/stat?path=" + encodeURIComponent(path), { headers: head() });
      return got.ok ? await got.json() : null;
    } catch (_) {
      return null;
    }
  };

  // ---- Telling the server this page is still open ----
  //
  // **The server stops when nobody is using it, and this is how it knows somebody is**: one
  // connection held open and never answered, which closing the tab closes at once (a timer would
  // only say "somebody was there N seconds ago").
  // Caution: **Reconnect if it ends.** A connection can break with the tab still open, and the
  // server would count down while a person is writing.
  const HOLD_AGAIN_MS = 5000;
  const holdOn = async () => {
    for (;;) {
      try {
        const got = await fetch("/api/here", { headers: head() });
        if (got.ok && got.body) {
          const reader = got.body.getReader();
          // Nothing arrives; the wait is the hold, ending when the server goes.
          for (;;) {
            const step = await reader.read();
            if (step.done) break;
          }
        }
      } catch (_) { /* it has gone or the connection broke; it is taken again below */ }
      await new Promise((go) => setTimeout(go, HOLD_AGAIN_MS));
    }
  };

  return {
    // **Wait until the check is done**, or the tools flash on for an instant with no server.
    localReady: ask().then(() => {
      if (told) deny(told);
      if (here) holdOn();
      return here;
    }),
    localHere: () => here,
    // **The header carrying the token is built in one place.** With two, one path alone forgets the
    // token and gets a 401. The plugin requests borrow it (`plugin.js`).
    localHead: head,
    localRead: readAt,
    localWrite: writeAt,
    localStat: statAt,
  };
}
