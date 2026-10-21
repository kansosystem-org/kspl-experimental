// ==========================================
// kspage's page — the local server. It reads and writes a file by path (text, relative to the
// folder being served).
//
// **A page inside a browser cannot touch the OS** (walk folders, start a process), so it asks a
// program started locally; the contract is `../../../docs/SPEC-local-server.md`. The page
// requires this service before enabling editing.
// ==========================================
function kspageLocal(ui) {
  const say = ui.say, deny = ui.deny;

  // ---- The token ----
  // **The token comes in the URL's fragment (`#t=`)**, which is not sent to the server. So another
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
  // Caution: **Give every request a limit.** Each kspage tab holds one connection to the server
  // open (`holdOn` below), and a browser opens six to one server. So with six tabs a request waits
  // for good: a save never settles, and every later press joins the one under way.
  const WAIT_MS = 15000;
  const send = (url, how) => fetch(url,
    Object.assign({ headers: head(), signal: AbortSignal.timeout(WAIT_MS) }, how || {}));
  // Why a request got no answer, in words a person can act on.
  const lostWhy = (e) => (e && e.name === "TimeoutError"
    ? "The local server did not answer within " + WAIT_MS / 1000 + " seconds. Each kspage tab "
      + "holds one of the six connections a browser opens to one server, so close a kspage tab "
      + "and try again"
    : "Could not connect to the local server (" + String((e && e.message) || e) + ")");

  // ---- Whether it is there ----
  //
  // **It asks only once** (asked on every click, a missing server would mean a wait every time).
  // Caution: **Keep "it is there" and "it got through" apart.** A 401 means "there, but no token";
  // calling it "absent" hides that reopening the URL is all it takes.
  let here = false;   // the server is there and the token got through too
  let conditionalWrites = false;
  let told = "";      // what to tell a person (empty means there is nothing to say)
  const ask = async () => {
    let got = null;
    try {
      got = await send("/api/status");
    } catch (e) {
      // Startup reports how to connect; a request that went unanswered says why.
      if (e && e.name === "TimeoutError") told = lostWhy(e);
      return;
    }
    if (got.status === 401) {
      told = "There is a local server but no token. Open the URL kssrv showed";
      return;
    }
    if (!got.ok) return;
    // Caution: **Do not stop at "the server is there".** A kssrv not meant for local use answers
    // `/api/status` too but has no file entry points (a 404). So the tools appear **only where it
    // declares them open**. **Once this holds, the save target is the path alone** (`file.js`).
    // Loosen the declaration, and a save can land outside the served folder, where it cannot be
    // reopened by path.
    let said = null;
    try {
      said = await got.json();
    } catch (_) {
      return;   // it is a page served by something that is not kssrv
    }
    here = said.local === true;
    conditionalWrites = said.conditional_writes === true;
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
    try {
      const got = await send(at(path));
      if (!got.ok) {
        deny(reasonOf(got.status));
        return null;
      }
      // Caution: **Return bytes.** The server does not guess the type (a guessed type gets
      // believed), so the caller decides whether it is text.
      return new Uint8Array(await got.arrayBuffer());
    } catch (e) {
      deny(lostWhy(e));
      return null;
    }
  };
  // Writes to that path. Empty text if written, and the reason if not.
  const writeAt = async (path, data, expected) => {
    if (!conditionalWrites) return "Rebuild and restart kssrv to save with conflict protection";
    let got = null;
    try {
      const headers = head();
      if (expected !== undefined) {
        const digest = expected === null ? null : await crypto.subtle.digest("SHA-256",
          new TextEncoder().encode(expected));
        headers["X-Kanso-If-Content"] = digest === null ? "missing"
          : Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
      }
      got = await send(at(path), { method: "PUT", headers, body: data });
    } catch (e) {
      return lostWhy(e);
    }
    return got.status === 409 ? "conflict" : (got.ok ? "" : reasonOf(got.status));
  };
  // Whether something is at that path: true or false, and null where it could not be asked (it
  // gives the reason, as `readAt` does). **The contents are not returned** (read it again where
  // they are needed).
  // Caution: **Do not answer "absent" for a failed question.** Only a 404 says nothing is there.
  // A lost token, a refusal or a dropped connection read as absent would let a save overwrite a
  // file without the check that guards it.
  const statAt = async (path) => {
    let got = null;
    try {
      got = await send("/api/stat?path=" + encodeURIComponent(path));
    } catch (e) {
      deny(lostWhy(e));
      return null;
    }
    if (got.ok) return true;
    if (got.status === 404) return false;
    deny(reasonOf(got.status));
    return null;
  };

  // ---- Telling the server this page is still open ----
  //
  // **The server stops when nobody is using it, and this is how it knows somebody is.** It is one
  // connection held open and never answered, which closing the tab closes at once. A timer would
  // only say "somebody was there N seconds ago".
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

  // **Wait until the check is done**, or the tools flash on for an instant with no server.
  const ready = ask().then(() => {
    if (!here) deny(told || "Open the URL shown by kssrv --local to use kspage");
    if (here) holdOn();
    return here;
  });

  // ---- A picture the document names ----
  //
  // The served path a picture's source names. It is "" where it names no file here (an embedded
  // picture, `data:`, or an outside one), and null where it cannot be read. **The one place a
  // source is resolved**, for drawing and measuring alike.
  // Caution: **Read a relative source from the document's folder**, not from the page's address.
  // The server publishes either a tree or the document's own folder. Read from the page, the same
  // document would show its pictures under one and not the other. A document in no file reads
  // from the served folder's top.
  const picturePlace = (src) => {
    const doc = ui.pathNow ? ui.pathNow() : "";
    const folder = doc.split("/").slice(0, -1).map((one) => encodeURIComponent(one) + "/").join("");
    let place = null;
    try {
      place = new URL(src, location.origin + "/" + folder);
    } catch (_) {
      return null;
    }
    if (place.origin !== location.origin) return "";
    try {
      return decodeURIComponent(place.pathname.replace(/^\/+/, ""));
    } catch (_) {
      return null;
    }
  };
  // The address to load a picture from. **A picture beside the document is read through the API,
  // with the token.** The server answers no file but the page without one, and an `<img>` cannot
  // send a header. So the bytes come back as a `blob:` address. An embedded picture and an outside
  // one keep their source (whether an outside one can load is `draw.js`'s `outside`). null where
  // it cannot be read. **A `blob:` address belongs to the caller**, who releases it once done
  // (`URL.revokeObjectURL`); each call makes one.
  // Caution: **The server does not say the type** (`application/octet-stream`), so it is given
  // here from the name's end; an SVG without it does not draw.
  const PICTURE_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/vnd.microsoft.icon" };
  const pictureAt = async (src) => {
    const path = picturePlace(src);
    if (path === null) return null;
    if (path === "") return src;
    try {
      const got = await send(at(path));
      if (!got.ok) return null;
      const dot = path.lastIndexOf(".");
      const type = PICTURE_TYPES[dot < 0 ? "" : path.slice(dot + 1).toLowerCase()] || "";
      return URL.createObjectURL(new Blob([await got.arrayBuffer()], { type: type }));
    } catch (_) {
      return null;
    }
  };

  return {
    localReady: ready,
    localRead: readAt,
    localWrite: writeAt,
    localStat: statAt,
    localPicture: pictureAt,
    localPlace: picturePlace,
  };
}
