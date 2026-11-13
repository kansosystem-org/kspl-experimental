// ksmd page: a person's own functions, written in KSPL. A `:::functions` clause names a `.kspl`
// file. **Nothing of it is built or run until the person allows its exact bytes**: the bar at the
// top asks, and the server keeps the answer (`/api/allow`). The server then builds it (`POST
// /api/build`), and a worker runs it, apart from the page and with nothing but its own memory. A
// call with no answer yet shows `…`. This script takes those calls, has the worker answer each,
// hands the answers to the editor and shows the document again (`bridge_own.kspl`).
// Caution: **One call at a time, each with a time limit.** A function that never ends holds its
// worker. Past `LIMIT_MS` the worker is ended, the cell shows #TIME!, and a new worker starts.
"use strict";

function ksmdFunctions(ks) {
  const LIMIT_MS = 2000; // how long one call may run
  const ROUNDS = 8; // rounds of answers per showing: a call can wait on another's answer
  const TIME_LIMIT = 1; // `ksmd_web_own_failed`'s reasons
  const STOPPED = 2;
  const NOT_ALLOWED_NOW = 3; // its file is not allowed now
  const UNBUILT = 4; // its file does not build
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
      const names = dec.decode(read(x.ksmd_own_names()));
      postMessage({ names, help: dec.decode(read(x.ksmd_own_help())) });
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

  // Each functions file by its path from the root: { bytes, state, why, module, worker, names,
  // help }, `help` being what a person reads of each function (`ksmd/calc/help.kspl`). `state` is
  // "checking", "asking" (not allowed yet), "building", "ready" or "broken"; `bytes` are those the
  // page read last. **`names` are those of its last build**, kept while it is not ready again, so
  // a file below never takes them over.
  const files = new Map();
  const later = new Set(); // the files whose question the person put off ("Not now")
  const todo = []; // the person's answers, each done in turn by `run`
  const bar = document.querySelector(".own-ask");
  let sent = ""; // what the editor holds: the unknown names' state, the names, which are ready
  let owner = new Map(); // each name, and the path of the file whose function it calls
  let busy = false;
  let again = false;

  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);

  // Starts a worker on a file's module; resolves to { names, help }, or null where it cannot start.
  function start(f) {
    if (!workerUrl) workerUrl = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    f.worker = worker;
    return new Promise((done) => {
      worker.onmessage = (e) => done(e.data.names === undefined ? null : {
        names: e.data.names.split("\n").filter((n) => n.length > 0), help: JSON.parse(e.data.help) });
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

  // Builds a file afresh: its module, then its names from a worker. **The server builds only
  // bytes the person allowed**, so a 403 means the file changed since: it asks again.
  async function build(path, f) {
    f.state = "building";
    end(f);
    const got = await ks.local.build(path);
    if (got.status === 403) {
      f.state = "asking";
      return;
    }
    if (got.status !== 200) {
      f.state = "broken";
      f.why = got.why;
      return;
    }
    try {
      f.module = await WebAssembly.compile(got.bytes);
      const started = await start(f);
      if (started === null) throw new Error("the module did not start");
      f.names = started.names;
      f.help = started.help;
      f.state = "ready";
    } catch (e) {
      f.state = "broken";
      f.why = `The built module cannot run: ${e.message || e}`;
    }
  }

  // Asks the server whether the person allowed the file's bytes, and builds them only then.
  async function check(path, f) {
    f.state = "checking";
    const got = await ks.local.allowed(path);
    if (got.status !== 200) {
      f.state = "broken";
      f.why = got.why;
    } else if (got.allowed) {
      await build(path, f);
    } else {
      f.state = "asking";
    }
  }

  // Allows the files that wait for it, each for the bytes the page read, and builds them. A file
  // that changed on disk since is refused (409), and the page says to look again.
  async function allow(paths) {
    for (const path of paths) {
      const f = files.get(path);
      if (!f || f.state !== "asking" || !f.bytes) continue;
      const got = await ks.local.allow(path, await ks.local.digest(f.bytes));
      if (got.status === 409) {
        ks.say(`${path} changed since the page read it. Choose the page again, then allow it.`);
      } else if (got.status !== 200) {
        ks.say(`${path} could not be allowed: ${got.why}`);
      } else {
        await build(path, f);
      }
    }
  }

  // Takes the allow back: the file is not built or run until the person allows it again.
  async function disallow(path) {
    const f = files.get(path);
    if (!f) return;
    const got = await ks.local.allow(path, null);
    if (got.status !== 200) {
      ks.say(`${path} is still allowed: ${got.why}`);
      return;
    }
    end(f);
    f.state = "asking";
    // **The bar does not ask again at once**: the person has just answered. The box still offers it.
    later.add(path);
  }

  // The paths the view's clauses name, in order, each once.
  const named = () => [...new Set([...ks.root.querySelectorAll(".functions[data-to]")]
    .map((el) => el.dataset.to))];

  // What a call to a name no file gives shows while a file's names are unknown: 2 while the
  // person has not allowed one (#BLOCKED!), 1 while one builds (`…`), else 0
  // (`ksmd_web_own_names`).
  function unknownState() {
    const states = [...files.values()].map((f) => f.state);
    if (states.includes("asking")) return 2;
    return states.includes("building") || states.includes("checking") ? 1 : 0;
  }

  // Asks about what is new or changed on disk, forgets what no clause names, and hands the editor
  // the names. True where the names changed, so the document shows again.
  async function follow() {
    const paths = named();
    for (const [path, f] of files) {
      if (paths.includes(path)) continue;
      end(f);
      files.delete(path);
      later.delete(path);
    }
    for (const path of paths) {
      const bytes = ks.fetchedBytes(path);
      let f = files.get(path);
      if (f && same(f.bytes, bytes)) continue;
      if (!f) {
        f = { state: "checking", why: "", names: [], help: [], module: null, worker: null };
        files.set(path, f);
      }
      f.bytes = bytes;
      end(f);
      show();
      await check(path, f);
    }
    // **A file that is not ready keeps its names**, and a call to one shows #BLOCKED!. A file that
    // waits for its allow or builds may give any name, so the files below it give none yet.
    owner = new Map();
    let known = true;
    for (const path of paths) {
      const f = files.get(path);
      if (known) for (const n of f.names) if (!owner.has(n)) owner.set(n, path);
      if (f.state !== "ready" && f.state !== "broken") known = false;
    }
    show();
    const state = unknownState();
    const text = [...owner.keys()].join("\n");
    // A file that turns ready, or stops being ready, changes the answers, so the old ones go.
    const ready = [...owner.values()].map((p) => (files.get(p).state === "ready" ? "1" : "0")).join("");
    if (`${state}\n${text}\n${ready}` === sent) return false;
    sent = `${state}\n${text}\n${ready}`;
    ks.call("ksmd_web_own_names", ks.put(text), state);
    return true;
  }

  // A button in a clause's box, which `ks.root`'s presses reach (`acted`).
  function button(label, act, path) {
    const b = ks.button(label, `functions-${act}`);
    b.dataset.to = path;
    return b;
  }

  // What each clause's box says: the names it gives, that it waits for an allow or builds, or why
  // it cannot be used. Then the bar at the top, which asks about the files not allowed yet.
  function show() {
    for (const el of ks.root.querySelectorAll(".functions[data-to]")) {
      const path = el.dataset.to;
      const f = files.get(path);
      const state = el.querySelector(".functions-state");
      if (!f || !state) continue;
      state.classList.toggle("problem", f.state === "broken");
      if (f.state === "checking") state.textContent = "Checking whether these functions are allowed…";
      else if (f.state === "asking") {
        state.textContent = "These functions are not allowed yet. They run only if you allow them.";
        state.appendChild(button("Allow", "allow", path));
      } else if (f.state === "building") state.textContent = "Building…";
      else if (f.state === "broken") state.textContent = f.why;
      else {
        const mine = f.names.filter((n) => owner.get(n) === path);
        const hidden = f.names.filter((n) => owner.has(n) && owner.get(n) !== path);
        const waiting = f.names.filter((n) => !owner.has(n));
        state.textContent = (f.names.length === 0 ? "It gives no functions." :
          mine.length > 0 ? `A formula can call: ${mine.join(", ")}.` : "A formula can call none of them now.") +
          (hidden.length === 0 ? "" :
            ` Another file above gives ${hidden.join(", ")} first, so this file's are not called.`) +
          (waiting.length === 0 ? "" :
            ` ${waiting.join(", ")} wait for a file above, which may give them first.`);
        state.appendChild(button("Stop allowing", "stop", path));
      }
    }
    const asking = [...files].filter(([p, f]) => f.state === "asking" && !later.has(p))
      .map(([p]) => p);
    bar.hidden = asking.length === 0;
    bar.querySelector(".own-ask-text").textContent = `This document has its own functions ` +
      `(${asking.join(", ")}). They run only if you allow them.`;
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
        // A file that builds answers once it is ready, when its names reach the editor again.
        if (f && (f.state === "building" || f.state === "checking")) continue;
        if (f && f.state !== "ready") {
          ks.call("ksmd_web_own_failed", i, f.state === "broken" ? UNBUILT : NOT_ALLOWED_NOW);
          continue;
        }
        const got = f ? await ask(f, call) : { stopped: "no file gives it" };
        if (got.answer) {
          ks.call("ksmd_web_own_answer", i, ks.putBytes(got.answer));
        } else {
          // A module that stopped may hold half-changed memory, so it starts afresh.
          if (f) end(f);
          ks.call("ksmd_web_own_failed", i, got.time ? TIME_LIMIT : STOPPED);
        }
      }
      ks.redraw("ksmd_web_render");
    }
  }

  // Runs after each showing; a showing while it works makes it look once more. An answer to the
  // bar or a box waits in `todo` until the work before it ends, so two never change a file at once.
  async function run() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        while (todo.length > 0) await todo.shift()();
        if (await follow()) ks.redraw("ksmd_web_render");
        await answer();
      } while ((again || todo.length > 0) && !ks.stopped);
    } finally {
      busy = false;
    }
  }
  const act = (f) => {
    todo.push(f);
    run();
  };

  // What a person reads of each of the document's own functions a formula calls, marked `own`, in
  // the shape `ksmd_web_functions` gives ksmd's own (`suggest.js`).
  ks.ownFunctions = () => [...owner].flatMap(([name, path]) =>
    files.get(path).help.filter((h) => h.name === name).map((h) => ({ ...h, own: true })));

  // What a cell that calls the document's own functions says: which, and from which file.
  function uses(names) {
    const by = new Map();
    for (const n of names) {
      const path = owner.get(n);
      if (path) by.set(path, [...(by.get(path) || []), n]);
    }
    return `Uses ${[...by].map(([path, ns]) => `${ns.join(" and ")} from ${path}`).join(", ")} ` +
      "(this document's own)";
  }

  // Marks a cell whose formula calls the document's own functions: a corner, and a tooltip that
  // names them (`table.js`, after the notes, whose tooltip it adds to).
  ks.ownMark = (wrap, list) => {
    for (const [r, c, names] of list || []) {
      const el = wrap.querySelector(`td[data-r="${r}"][data-c="${c}"]`);
      if (!el) continue;
      el.classList.add("uses-own");
      el.dataset.own = names.join(" ");
      el.title = el.title ? `${el.title}\n${uses(names)}` : uses(names);
    }
  };

  // The status bar names what the chosen cell calls. Why a cell shows #BLOCKED! is the
  // calculator's to say, as for every error (`status.js`).
  const said = document.querySelector(".status-own");
  ks.status.also(() => {
    const wrap = ks.inTable() && !ks.range.any() ? ks.view.blocks()[ks.cell.block] : null;
    const el = wrap && wrap.querySelector(`td[data-r="${ks.cell.row}"][data-c="${ks.cell.column}"]`);
    const text = el && el.dataset.own ? uses(el.dataset.own.split(" ")) : "";
    said.hidden = text === "";
    said.textContent = text;
    said.title = text;
  });

  // The bar's and the boxes' answers. "Not now" leaves the files as they are: the bar asks again
  // the next time the document opens, and each box still offers Allow.
  bar.querySelector(".own-allow").addEventListener("click", () => act(() =>
    allow([...files].filter(([p, f]) => f.state === "asking" && !later.has(p)).map(([p]) => p))));
  bar.querySelector(".own-not-now").addEventListener("click", () => {
    for (const [p, f] of files) if (f.state === "asking") later.add(p);
    show();
  });
  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".functions-allow, .functions-stop");
    if (!b) return;
    e.preventDefault();
    const path = b.dataset.to;
    act(() => (b.classList.contains("functions-allow") ? allow([path]) : disallow(path)));
  });

  ks.rendered.push(() => {
    show();
    if (ks.local
 && (files.size > 0 || ks.root.querySelector(".functions[data-to]"))) run();
  });
}
