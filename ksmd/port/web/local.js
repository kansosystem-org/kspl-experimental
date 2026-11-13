// ksmd page: the local server. The page reads and writes the workspace's files by asking
// `kssrv --local`, by each file's path from the workspace root. The token, the requests and the
// hold are kssrv's client (`kssrv/page/client.js`); this file says what each answer means to the
// person, and adds the requests only ksmd's page makes. The page holds no file handle of its own.
"use strict";

function ksmdLocal() {
  const client = kssrvLocal("ksmd");
  const { token, send, ask, digest } = client;
  // A build may take this long: the server's own limit (60 s), and the answer's way back.
  const BUILD_MS = 70000;
  // What a server that builds no functions means, for the clause to show.
  const NO_BUILDER = "This local server builds no functions. Open the document with ksmd, whose " +
    "server builds them, or with a kssrv started with --builder and --allowed.";

  // Why a request got no answer, in words a person can act on.
  const lost = (e) => (e && e.name === "TimeoutError" ?
    `The local server did not answer within ${client.WAIT_MS / 1000} seconds. Try again. ` +
      "If it still does not answer, start ksmd on the folder again, then open the URL it shows." :
    "The local server cannot be reached. Start ksmd on the folder again, then open the URL it shows.");

  // What a refusal means for a file, by its status.
  function reason(status) {
    if (status === 401) return "The page has no valid token. Open the URL the local server showed.";
    if (status === 403) return "The local server refused the path: a link stands along it.";
    if (status === 404) return "No file stands there.";
    if (status === 413) return "The file is too large for the local server to take.";
    return `The local server refused it (${status}).`;
  }

  // What stands at a path: { size, at }, with `at` the second it last changed. Nothing there is
  // { size: -1, at: -1 }, and null means it could not be asked.
  async function stat(path) {
    try {
      const got = await client.stat(path);
      if (got.status === 404) return { size: -1, at: -1 };
      return got.status === 200 ? { size: got.size, at: got.at } : null;
    } catch (_) {
      return null;
    }
  }

  return {
    token,
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
        const got = await client.read(path);
        return got.status === 200 ? got : { status: got.status, why: reason(got.status) };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Builds a file of a person's own functions: { status: 200, bytes } with the module, else
    // { status, why }. A 422 is the file's own error, which the clause shows as it is.
    async build(path) {
      try {
        const got = await send(ask("build", path), { method: "POST" }, BUILD_MS);
        if (got.ok) return { status: 200, bytes: new Uint8Array(await got.arrayBuffer()) };
        if (got.status === 422) return { status: 422, why: String((await got.json()).error) };
        if (got.status === 404) return { status: 404, why: NO_BUILDER };
        return { status: got.status, why: reason(got.status) };
      } catch (e) {
        return { status: 0, why: e && e.name === "TimeoutError" ?
          `The build did not end within ${BUILD_MS / 1000} seconds.` : lost(e) };
      }
    },
    // Whether the person allowed a functions file's bytes as it holds them now: { status: 200,
    // allowed }, else { status, why }. **The server decides**, by the bytes it would build.
    async allowed(path) {
      try {
        const got = await send(ask("allow", path));
        if (got.ok) return { status: 200, allowed: (await got.json()).allowed === true };
        return { status: got.status, why: got.status === 404 ? NO_BUILDER : reason(got.status) };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Allows a functions file's bytes, named by their digest, or with `digest` null takes the
    // allow back: { status, why }. A 409 means the file no longer holds those bytes.
    async allow(path, digest) {
      try {
        const got = await send(ask("allow", path), digest === null ?
          { method: "DELETE" } : { method: "POST", headers: { "X-Kanso-If-Content": digest } });
        return { status: got.status, why: got.ok ? "" : reason(got.status) };
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
        const got = await send(ask("list", path));
        if (!got.ok) return { status: got.status, why: reason(got.status) };
        const said = await got.json();
        return { status: 200, folders: said.folders, files: said.files, more: said.more === true };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    // Replaces a file only if it still holds what `expected` names: a digest of its bytes, or
    // null for no file at all. { status, why, cause }; a 409 without `cause` means the file is not
    // what was expected. With `cause`, nothing can be written there, and `why` is the server's
    // own words.
    async write(path, bytes, expected) {
      try {
        const got = await send(ask("file", path), { method: "PUT", body: bytes,
          headers: { "X-Kanso-If-Content": expected === null ? "missing" : expected } });
        if (got.status !== 409) return { status: got.status, why: got.ok ? "" : reason(got.status) };
        let said = null;
        try {
          said = await got.json();
        } catch (_) { /* no reason given */ }
        const cause = said && typeof said.cause === "string" ? said.cause : "";
        return { status: 409, why: cause ? String(said.error) : reason(409), cause };
      } catch (e) {
        return { status: 0, why: lost(e) };
      }
    },
    hold: client.hold,
  };
}
