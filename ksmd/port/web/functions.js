// ksmd page: a person's own functions, written in KSPL. A `:::functions` clause names a `.kspl`
// file; the local server builds it (`POST /api/build`), and a worker runs it, apart from the page
// and with nothing but its own memory. **A calculation cannot wait for the worker**: a call with
// no answer yet shows `…`. This script takes those calls, has the worker answer each, hands the
// answers to the editor and shows the document again (`ksmd/port/web/bridge_own.kspl`).
// Caution: **One call at a time, each with a time limit.** A function that never ends holds its
// worker. Past `LIMIT_MS` the worker is ended, the cell shows #TIME!, and a new worker starts.
"use strict";

function ksmdFunctions(ks) {
  const LIMIT_MS = 2000; // how long one call may run
  const ROUNDS = 8; // rounds of answers per showing: a call can wait on another's answer
  const TIME_LIMIT = 1; // `ksmd_web_own_failed`'s reasons
  const STOPPED = 2;
  const dec = new TextDecoder();

  // The worker: it instantiates the module once, then answers one call per message. A panic in
  // the module reaches it through the module's one import, which throws.
  const WORKER = `"use strict";
let x = null;
const dec = new TextDecoder();
const read = (n) => new Uint8Array(x.memory.buffer, x.ksmd_own_out_ptr(), n).slice();
onmessage = (e) => {
  const m = e.data;
  try {
    if (m.module) {
      x = new WebAssembly.Instance(m.module, { env: { ksmd_own_stopped(p, n) {
        throw new Error(dec.decode(new Uint8Array(x.memory.buffer, p, n)));
      } } }).exports;
      postMessage({ names: dec.decode(read(x.ksmd_own_names())) });
      return;
    }
    const at = x.ksmd_own_in(m.call.length);
    new Uint8Array(x.memory.buffer, at, m.call.length).set(m.call);
    postMessage({ answer: read(x.ksmd_own_call(m.call.length)) });
  } catch (err) {
    postMessage({ stopped: String((err && err.message) || err) });
  }
};`;
  let workerUrl = null;

  // Each functions file by its path from the root: { bytes, state, why, module, worker, names }.
  // `state` is "building", "ready" or "broken"; `bytes` are those the build was asked for.
  const files = new Map();
  let sent = ""; // the names the editor holds, one per line
  let owner = new Map(); // each name, and the path of the file whose function it calls
  let busy = false;
  let again = false;

  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

  // Starts a worker on a file's module; resolves to its names, or null where it cannot start.
  function start(f) {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    f.worker = worker;
    return new Promise((done) => {
      worker.onmessage = (e) => done(e.data.names === undefined ? null :
        e.data.names.split("\n").filter((n) => n.length > 0));
      worker.onerror = (e) => {
        e.preventDefault();
        done(null);
      };
      worker.postMessage({ module: f.module });
    });
  }

  // Ends a file's worker, which a call ran past its time or stopped.
  function end(f) {
    if (f.worker) f.worker.terminate();
    f.worker = null;
  }

  // One call to a file's worker: { answer }, { stopped }, or { time } past the limit.
  async function ask(f, call) {
    if (!f.worker && (await start(f)) === null) return { stopped: "the module did not start" };
    const worker = f.worker;
    return new Promise((done) => {
      const timer = setTimeout(() => {
        end(f);
        done({ time: true });
      }, LIMIT_MS);
      worker.onmessage = (e) => {
        clearTimeout(timer);
        done(e.data);
      };
      worker.onerror = (e) => {
        e.preventDefault();
        clearTimeout(timer);
        done({ stopped: e.message || "the worker stopped" });
      };
      worker.postMessage({ call });
    });
  }

  // Builds a file afresh: its module, then its names from a worker.
  async function build(path, f) {
    f.state = "building";
    end(f);
    const got = await ks.local.build(path);
    if (got.status !== 200) {
      f.state = "broken";
      f.why = got.why;
      return;
    }
    try {
      f.module = await WebAssembly.compile(got.bytes);
      const names = await start(f);
      if (names === null) throw new Error("the module did not start");
      f.names = names;
      f.state = "ready";
    } catch (e) {
      f.state = "broken";
      f.why = `The built module cannot run: ${e.message || e}`;
    }
  }

  // The paths the view's clauses name, in order, each once.
  const named = () => [...new Set([...ks.root.querySelectorAll(".functions[data-to]")]
    .map((el) => el.dataset.to))];

  // Builds what is new or changed on disk, forgets what no clause names, and hands the editor the
  // names. True where the names changed, so the document shows again.
  async function follow() {
    const paths = named();
    for (const [path, f] of files) {
      if (paths.includes(path)) continue;
      end(f);
      files.delete(path);
    }
    for (const path of paths) {
      const bytes = ks.fetchedBytes(path);
      let f = files.get(path);
      if (f && same(f.bytes, bytes)) continue;
      if (!f) {
        f = { state: "building", why: "", names: [], module: null, worker: null };
        files.set(path, f);
      }
      f.bytes = bytes;
      show();
      await build(path, f);
    }
    owner = new Map();
    for (const path of paths) {
      const f = files.get(path);
      if (f.state !== "ready") continue;
      for (const n of f.names) if (!owner.has(n)) owner.set(n, path);
    }
    show();
    const text = [...owner.keys()].join("\n");
    if (text === sent) return false;
    sent = text;
    ks.call("ksmd_web_own_names", ks.put(text));
    return true;
  }

  // What each clause's box says: the names it gives, that it builds, or why it cannot be used.
  function show() {
    for (const el of ks.root.querySelectorAll(".functions[data-to]")) {
      const f = files.get(el.dataset.to);
      const state = el.querySelector(".functions-state");
      if (!f || !state) continue;
      state.classList.toggle("problem", f.state === "broken");
      if (f.state === "building") state.textContent = "Building…";
      else if (f.state === "broken") state.textContent = f.why;
      else {
        const mine = f.names.filter((n) => owner.get(n) === el.dataset.to);
        const hidden = f.names.filter((n) => owner.get(n) !== el.dataset.to);
        state.textContent = (f.names.length === 0 ? "It gives no functions." :
          `A formula can call: ${mine.join(", ")}.`) +
          (hidden.length === 0 ? "" :
            ` Another file above gives ${hidden.join(", ")} first, so this file's are not called.`);
      }
    }
  }

  // The name a call's bytes begin with: its length in four bytes, then its UTF-8.
  function nameOf(call) {
    const n = call[0] | (call[1] << 8) | (call[2] << 16) | (call[3] << 24);
    return dec.decode(call.subarray(4, 4 + n));
  }

  // Answers the calls the last showing left waiting, a round at a time, and shows the document
  // again after each round.
  async function answer() {
    for (let round = 0; round < ROUNDS; round++) {
      const n = ks.call("ksmd_web_own_take");
      if (n === 0) return;
      for (let i = 0; i < n; i++) {
        const len = ks.call("ksmd_web_own_call", i);
        if (ks.stopped) return;
        const call = new Uint8Array(ks.w.memory.buffer, ks.w.ksmd_web_out_ptr(), len).slice();
        const f = files.get(owner.get(nameOf(call)));
        const got = f && f.state === "ready" ? await ask(f, call) : { stopped: "no file gives it" };
        if (got.answer) {
          ks.call("ksmd_web_own_answer", i, ks.putBytes(got.answer));
        } else {
          // A module that stopped may hold half-changed memory, so it starts afresh.
          if (f) end(f);
          ks.call("ksmd_web_own_failed", i, got.time ? TIME_LIMIT : STOPPED);
        }
      }
      ks.act("ksmd_web_render");
    }
  }

  // Runs after each showing; a showing while it works makes it look once more.
  async function run() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        if (await follow()) ks.act("ksmd_web_render");
        await answer();
      } while (again && !ks.stopped);
    } finally {
      busy = false;
    }
  }

  ks.rendered.push(() => {
    show();
    if (ks.local && (files.size > 0 || ks.root.querySelector(".functions[data-to]"))) run();
  });
}
