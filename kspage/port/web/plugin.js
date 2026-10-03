// The plugins: programs on the local machine that take the selected text and return text.
// **kspage cannot start a program** (a page in a browser cannot), so the local server starts one
// and this side only asks; **with no server there are no plugins**, and the group is not shown.
// Caution: **Never send a path.** What is requested is a name from the list the server gave, so
// there is nothing here to forge (`kssrv/proc.kspls`'s table refuses any other name).
// **The selected text goes in and the output replaces it** — that is the whole contract, so a
// plugin knows neither kspage nor the document and can be tested with a pipe.
function kspagePlugin(ui) {
  const dec = new TextDecoder();

  // The names found, **requested once** at startup (the server reads its folder once too).
  let names = [];

  // Caution: **Cap the wait**, or a plugin that never ends makes the click look like "nothing
  // happens" forever; when cut, the reason is shown and the selection kept. **Be generous**: it is
  // a safety valve, not a speed limit (too short, a busy machine gets a false answer).
  const waitMs = 15000;

  // Parses the server's frames (`<tag><length><space><bytes>`).
  // Caution: **Split by the length** — the contents are raw bytes, so a separator would break.
  const pieces = (bytes, take) => {
    let at = 0;
    for (;;) {
      if (at >= bytes.length) return;
      let sp = -1;
      for (let i = at + 1; i < bytes.length && i < at + 24; i += 1) {
        if (bytes[i] === 0x20) { sp = i; break; }
      }
      if (sp < 0) return;
      const len = Number(dec.decode(bytes.slice(at + 1, sp)));
      if (!Number.isFinite(len) || bytes.length < sp + 1 + len) return;
      take(String.fromCharCode(bytes[at]), bytes.slice(sp + 1, sp + 1 + len));
      at = sp + 1 + len;
    }
  };

  // Runs one: **three things come back separately** (what it wrote, what it complained about, its
  // exit code); merged, "it answered nothing" and "it could not run" would look the same.
  const drive = async (name, text) => {
    const head = Object.assign({ "Content-Type": "application/json" }, ui.localHead());
    const began = await fetch("/api/run",
      { method: "POST", headers: head, body: JSON.stringify({ cmd: "plugin", args: [name], in: text }) })
      .catch(() => null);
    if (began === null || !began.ok) {
      return { why: began && began.status === 403 ? "it is not one this server knows" : "it could not be started" };
    }
    const said = await began.json().catch(() => null);
    if (!said || typeof said.id !== "number") return { why: "it could not be started" };
    const watch = await fetch(`/api/run/${said.id}`, { headers: ui.localHead(), signal: AbortSignal.timeout(waitMs) })
      .catch(() => null);
    if (watch === null || !watch.ok) return { why: "it did not answer in time" };
    const body = new Uint8Array(await watch.arrayBuffer().catch(() => new ArrayBuffer(0)));
    let out = "";
    let err = "";
    let ended = null;
    pieces(body, (tag, part) => {
      if (tag === "O") out += dec.decode(part);
      // Caution: **Keep what it complained about** (it says why; the thing a person can act on).
      if (tag === "E") err += dec.decode(part);
      if (tag === "X") {
        const m = /-?\d+/.exec(dec.decode(part));
        ended = m === null ? null : Number(m[0]);
      }
    });
    if (ended === null) return { why: "it did not answer in time" };
    if (ended !== 0) return { why: err.trim().slice(0, 200) || `it ended with ${ended}` };
    return { out: out };
  };

  return {
    // The names found. **Empty when there is no local server** (the group is then not shown).
    pluginNames: () => names,
    // Asks the server what it has and lists the names in the menu, **once at startup** after the
    // server is known; **hidden when there is none** (shown empty, it would be dead).
    pluginBoot: async () => {
      if (!ui.localHere()) return [];
      const got = await fetch("/api/plugins", { headers: ui.localHead() }).catch(() => null);
      if (got === null || !got.ok) return [];
      const said = await got.json().catch(() => null);
      names = said && Array.isArray(said.plugins) ? said.plugins : [];
      if (names.length === 0) return names;
      const items = document.getElementById("plugin-items");
      const row = document.createElement("div");
      row.className = "row";
      for (const one of names) {
        const button = document.createElement("button");
        button.type = "button";
        // **The name is the server's text.** So it goes in as text, never as markup.
        button.textContent = one;
        button.addEventListener("click", async () => {
          const why = await ui.pluginRun(one);
          ui.tell(why === "", "Ran " + one, why);
        });
        row.appendChild(button);
      }
      items.appendChild(row);
      document.getElementById("plugins").hidden = false;
      return names;
    },
    // Passes the selected text to that plugin and puts the result in its place.
    // Caution: **Replace nothing unless it exited cleanly** (a crashed plugin's complaint would
    // replace the person's text), and **name the plugin** (a group hides "which one").
    pluginRun: async (name) => {
      const text = ui.app.selectionText();
      if (text.length === 0) return "Select the text to hand over first";
      const got = await drive(name, text);
      if (got.why !== undefined) return `${name}: ${got.why}`;
      // **One undo takes it back** (text over a selection is already one step, `paste`).
      if (!ui.app.paste(got.out)) return `${name}: it answered nothing`;
      return "";
    },
  };
}
