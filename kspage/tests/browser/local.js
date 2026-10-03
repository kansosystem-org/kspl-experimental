// It confirms what asks the local server (`kssrv --local`) for a file.
//
// **The same section looks at two cases**: from `file://` there is no server and the tools do not
// come out; served by `kssrv --local`, they do. **The side with none is a check too** — only there
// shows that nothing pressable is put out that does not act.
// Caution: **Do not call an entry point directly** — press a button like a person (calling alone
// lets an unwired button walk past). **Read back with its own `fetch`** — through the page's
// wrapper, a wrapper wrong the same way on both sides passes.

function kspageProbeLocal(ks) {
  const row = document.getElementById("local-row");
  const box = document.getElementById("local-path");
  const note = document.getElementById("note");
  // The local server's address. **It is not derived here** — `probe.js`'s `local` holds it, and
  // `handBack` reads the same one (Principle 6).
  const server = ks.local();
  const token = server.token;
  const head = server.head;
  const done = ks.hold();
  const at = server.at;
  // It picks up the text put out on the status bar without dropping any.
  //
  // Caution: **Do not peek at what is in it at the time.** The bar's one slot is overwritten by
  // other sections as they finish, and events arrive gathered into a microtask, so a text missed so
  // is **the same mark as a real failure**; stack **the text the event carried**. **Do not make it
  // a settled wait either** (saving slows as the document grows).
  const heard = [];
  new MutationObserver((recs) => {
    for (const r of recs) {
      for (const node of r.addedNodes) {
        heard.push(node.textContent || "");
      }
      if (r.type === "characterData") heard.push(r.target.textContent || "");
    }
  }).observe(note, { childList: true, characterData: true, subtree: true });
  // **Give up at a cap** — waited on, it runs out of time with not one mark put out.
  // Caution: **Leave what it is waiting for before waiting.** A request that never returns cuts the
  // section here; left behind, the waiting line names where it stopped.
  const untilSays = async (want) => {
    ks.waiting(want);
    for (let waited = 0; waited < 4000; waited += 50) {
      for (const msg of heard) {
        if (msg.indexOf(want) >= 0) {
          ks.waiting("");
          return true;
        }
      }
      await new Promise((go) => setTimeout(go, 50));
    }
    ks.waiting("");
    return false;
  };
  // Caution: **Throw what was picked up away before pressing**, or an earlier press's tiding reads
  // as this one's answer.
  const clear = () => { heard.length = 0; };
  // Ctrl+S as a person presses it: whether the page took it over. Untaken, the browser's own "save
  // the page" runs, and this HTML falls rather than the document.
  // Caution: **Press it in this section alone.** Taken over, it really saves, and the save waits on
  // the server, so pressed from another section it lands in the middle of this one's saves and
  // writes its own place into the field (the later save to finish wins).
  const saveKey = () => {
    const key = new KeyboardEvent("keydown",
      { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(key);
    return key.defaultPrevented;
  };

  // The way onward from where a file at hand was chosen (roused by `probe.js`'s `pickFile`).
  // Caution: **It must be a real picture** (its size is settled by loading it, so an unreadable
  // text is refused).
  const onePixelPng = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="),
    (c) => c.charCodeAt(0));
  const pickImage = (fileName) =>
    ks.pickFile(document.getElementById("image-file"), onePixelPng, fileName, "image/png");
  // The text that goes into the document when it is embedded.
  // Caution: **Do not look at it by a count.** This section overlaps the later ones, so **a picture
  // another section put in between** rides on a before-and-after count; hunted by its own picture's
  // text, it does not sway.
  const asEmbedded = "data:image/png;base64," + btoa(
    String.fromCharCode.apply(null, Array.from(onePixelPng)));

  // A page with no server there. **`file://` comes here.**
  //
  // **The side with none is a check too.** A picture from a file at hand **goes in by another
  // shape** by whether the server is there (laid next to the document, or embedded); unlooked at,
  // the embedding vanishing goes unnoticed.
  if (row.hidden) {
    ks.check(token === "", "with no server there there is no token either");
    ks.check(location.protocol === "file:" || token === "",
      "on a page that is not served the path field is not put out");
    ks.check(saveKey(), "Ctrl+S is taken over");
    (async function () {
      ks.pressAt(8);
      clear();
      pickImage("mårk.png");
      // Caution: **Say how large what was embedded is.** Unsaid, a few photographs hit the cap that
      // can be opened, and nobody sees what is heavy.
      ks.check(await untilSays("into the document"),
        "with no server there it embeds into the document");
      ks.check(ks.app.save().indexOf(asEmbedded) >= 0,
        "the picture itself goes into the text saved");
      ks.undoKey();
    })().then(done, (e) => {
      ks.check(false,
        "the section finishes without falling (" + String((e && e.stack) || e) + ")");
      done();
    });
    return;
  }

  // --- From here, a page served by `kssrv --local` ---
  ks.check(token !== "", "the token is picked up from the URL's fragment");
  // Caution: **It must be deleted from the URL.** Undeleted, it stays in the history.
  ks.check(location.hash === "" || location.hash.indexOf("t=") < 0,
    "the token picked up is deleted from the URL");

  (async function () {
    // **Do not let it fall to the browser's window even while it is empty** — fallen, it can save
    // outside the folder served, where it cannot be reopened by place. The arena is the folder
    // `kssrv` was roused on and the name is the menu bar's field, so it writes without asking.
    const name = document.getElementById("doc-name");
    name.value = "firstsave";
    name.dispatchEvent(new Event("change", { bubbles: true }));
    box.value = "";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    // **The first save is Ctrl+S** (the button is pressed from here on).
    ks.check(saveKey(), "Ctrl+S is taken over");
    // **Match as far as the extension, not the closing bracket** (a document with a history
    // declares that arena along with it). The default is `.kspage` (the settlement is
    // `kspage/docs/DESIGN.md`'s "The extension is kspage's own, and does not name the format
    // inside"); the `.json` typed below watches **that an extension saved earlier still opens**.
    ks.check(await untilSays("Saved (firstsave.kspage"),
      "with the path empty it writes directly under the folder by the menu bar's name");
    // After writing, it is in the field, so it goes to the same place from then on, visibly.
    ks.check(box.value === "firstsave.kspage",
      "the place written goes into the field");
    // Caution: **Do not overwrite silently what is already there.** The name's default is the same
    // for everyone, so it can collide; on a collision it refuses and says where the field is.
    box.value = "";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("is already there"),
      "with the same name there it does not overwrite silently");
    ks.check(await untilSays("Path for saving and opening"),
      "the refusal says where the field is");

    // It saves. **This field is where it saves** (the press stays one).
    box.value = "probe/saved.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    // It looks at **its not having been written** (the arena's folder is not there).
    ks.check(await untilSays("Could not write to the file"),
      "a save into a folder that is not there refuses with a reason");

    // It saves directly under the root.
    box.value = "saved.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    const want = ks.app.save();
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved ("), "it can save to the path");
    // It reads back with its own `fetch` (not through the page's wrapper).
    const back = await fetch(at("saved.json"), { headers: head });
    const got = back.ok ? await back.text() : "";
    ks.check(back.ok, "the place saved can be read from the server");
    ks.check(got === want, "the text written comes back as a byte row");

    // Opening by a place is the field's Enter (a location bar's shape). **"Open" is the browser's
    // window**, with or without the server, as whoever arrived by a double-click expects.
    const enter = () => box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    clear();
    enter();
    ks.check(await untilSays("Loaded it ("), "Enter in the path field opens that place");
    ks.check(document.getElementById("doc-name").value === "saved",
      "the tail of the place opened becomes the document's name");

    // **A different entry point alone makes the same hole**: pointing outside the root must refuse.
    box.value = "../secret.txt";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    enter();
    ks.check(await untilSays("outside the folder"),
      "outside the folder being served it refuses with a reason");

    // **Enter with the path empty must say where the field is** (not "nothing happens on the
    // press").
    box.value = "";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    enter();
    ks.check(await untilSays("Enter the place to open"),
      "opening with the path empty says where the field is");

    // ---- "Open" pops the window even with the server there, and the save follows the file ----
    // **The window cannot be driven from here**, so a stand-in returns a handle whose writing is
    // caught, and the save after it must go to that handle, not the path (**where it opened is
    // where it writes back**). A place is left in the field first, so the window is seen to win.
    const realOpen = window.showOpenFilePicker;
    let gotByHandle = null;
    const text = ks.app.save();
    // What the stand-in's file holds now; **writing changes it**, as a real file's does.
    let onDisk = text;
    const fake = {
      kind: "file", name: "picked.kspage",
      getFile: async () => new File([onDisk], "picked.kspage", { type: "application/json" }),
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      createWritable: async () => ({
        write: async (d) => { gotByHandle = d; onDisk = String(d); }, close: async () => {} }),
    };
    window.showOpenFilePicker = async () => [fake];
    try {
      box.value = "saved.json";
      box.dispatchEvent(new Event("change", { bubbles: true }));
      clear();
      document.getElementById("open").click();
      ks.check(await untilSays("Loaded it"), "\"Open\" pops the window even with a place standing");
      ks.check(box.value === "", "a document opened by the window clears the place field");
      ks.check(document.getElementById("doc-name").value === "picked",
        "the window's file names the document");
      clear();
      document.getElementById("save").click();
      ks.check(await untilSays("Saved (picked.kspage"),
        "the save goes to the file opened by the window, not to the place");
      ks.check(gotByHandle !== null && String(gotByHandle).length > 0,
        "the handle received the text");
      // ---- Writing back through the handle to a file that changed outside after it was read ----
      // Caution: **Do not overwrite silently through a handle either.** The same file can be chosen
      // in two windows; what plays "outside" is the stand-in's file changing under the page.
      const written = onDisk;
      const byOther = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
        + "\"inlines\":[{\"text\":\"a text another window wrote through its own handle\"}]}]}";
      onDisk = byOther;
      clear();
      document.getElementById("save").click();
      ks.check(await untilSays("has been changed outside"),
        "where the file behind the handle changed outside it says so");
      ks.check(onDisk === byOther, "the outside text behind the handle stays as it is");
      // **Do not refuse where nothing changed.** Put back to what the page last wrote, it writes.
      onDisk = written;
      clear();
      document.getElementById("save").click();
      ks.check(await untilSays("Saved (picked.kspage"),
        "where the file behind the handle is as it was written, it writes");
    } finally {
      window.showOpenFilePicker = realOpen;
    }

    // ---- Pointing at a document by text and opening it (the same way as `kspage.html?doc=…`)
    // ----
    //
    // **This can be seen nowhere else**: what reads is a plain `fetch`, which a page opened from
    // `file://` cannot run.
    // Caution: **Do not shape it as standing the page up afresh with a `?doc=` URL** — every other
    // section would run on a different document; `openDoc` calls the same way with one text.
    // **Point at a text no other section holds open.** One already open is shown where it is
    // ("Showed it"), which is not the reading.
    await fetch(at("pointed.json"), { method: "PUT", headers: head,
      body: "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
        + "\"inlines\":[{\"text\":\"a document pointed at by text\"}]}]}" });
    clear();
    ks.check(await ks.app.openDoc("pointed.json"),
      "a document pointed at by text can be opened");
    ks.check(await untilSays("Loaded it (pointed.json)"),
      "it names the text opened when it tells");
    ks.check(box.value === "pointed.json",
      "where it read becomes where it writes back too");
    // Caution: **Take a relative path of the same origin alone.** Unrefused, **one link handed over
    // makes this page read anywhere it likes and show the content.**
    for (const bad of ["https://example.com/x.json", "//example.com/x.json", "../secret.txt"]) {
      clear();
      ks.check(!(await ks.app.openDoc(bad)),
        "it does not open somewhere else (" + bad + ")");
      ks.check(await untilSays("a relative path as seen from the same place"),
        "the refusal says the reason (" + bad + ")");
    }
    // **A text that is not there must be refused with a reason** (not "nothing happens on the
    // press").
    clear();
    ks.check(!(await ks.app.openDoc("nosuch.json")),
      "a text that is not there is not opened");
    ks.check(await untilSays("This document could not be loaded"),
      "a text that is not there says the reason too");

    // ---- Putting a picture in from a file at hand ----
    //
    // **This can be seen nowhere else**: only with the server does it **lay it next to the document
    // and point at it by place** (the side with none embeds).
    // Caution: **See that it is not embedded into the document** — "it went in" passes embedded
    // too. **The place alone goes into the text saved**, and **what was laid down reads from the
    // server**.
    box.value = "saved.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    ks.pressAt(8);
    clear();
    pickImage("mårk.png");
    ks.check(await untilSays("it refers to"),
      "a picture is laid in the same folder as the document and pointed at by place");
    const put = await fetch(at("mårk.png"), { headers: head });
    ks.check(put.ok, "the picture laid down can be read from the server");
    ks.check(put.ok && (await put.arrayBuffer()).byteLength === onePixelPng.length,
      "the byte count of the picture laid down is the same as the original");
    // Caution: **The place alone must go into the document** (embedded, a few photographs hit the
    // cap that can be opened).
    const withPic = ks.app.save();
    ks.check(withPic.indexOf("\"image\": \"mårk.png\"") >= 0,
      "the place goes into the text saved");
    ks.check(withPic.indexOf(asEmbedded) < 0,
      "the same picture itself does not go into the text saved");
    // Caution: **Do not overwrite silently what is there** (the name is the chosen file's own, so
    // it can collide).
    clear();
    pickImage("mårk.png");
    ks.check(await untilSays("An image of the same name is already there"),
      "a picture of the same name is not overwritten silently");
    ks.undoKey();

    // ---- Writing back to a file that changed outside after it was read ----
    //
    // **This can be seen nowhere else** (whether it changed outside takes asking the server). This
    // check's own `fetch` plays "outside", as another window holding the same file would.
    // Caution: **Do not wait for a tiding** — this section overlaps the later ones, so the wait
    // lands inside a later section's tiding. **Whether it wrote back is told by reading the file
    // back.**
    box.value = "saved.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved ("), "it saves first itself");
    const mine = ks.app.save();
    // Someone outside rewrites it.
    // Caution: **Change the content and the length** (so a length-only check is caught too).
    const byOther = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
      + "\"inlines\":[{\"text\":\"a text another window wrote\"}]}]}";
    const put2 = await fetch(at("saved.json"),
      { method: "PUT", headers: head, body: byOther });
    ks.check(put2.ok, "it can be rewritten from outside");
    // Caution: **Do not overwrite silently** — what the other window wrote would be gone. It is
    // read back from the file, not waited for (refusing, not one byte changes).
    clear();
    document.getElementById("save").click();
    await new Promise((go) => setTimeout(go, 600));
    const after = await fetch(at("saved.json"), { headers: head });
    const nowOnDisk = after.ok ? await after.text() : "";
    ks.check(nowOnDisk !== mine,
      "where it changed outside it does not overwrite");
    ks.check(nowOnDisk === byOther, "the outside text stays as it is");
    // **Change the name and it must be writable**, or a draft has nowhere to go (the refusal's text
    // names this way).
    box.value = "mine.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved (mine.json"),
      "changing the name lets it write");
    // **Do not refuse where nothing changed** — the most complaints against other products,
    // comparing time and size (compared by text, nothing is refused by mistake). It presses twice
    // and looks at the second writing too.
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved (mine.json"),
      "pressing again in a row does not refuse");
    const twice = await fetch(at("mine.json"), { headers: head });
    ks.check(twice.ok && (await twice.text()) === ks.app.save(),
      "the second time too the text now is written");

    // ---- Opening a different document in a different window ----
    //
    // **This can be seen nowhere else**: an opened window declares itself to the opener, and one
    // that takes the other's document then lets the `?doc=` document **vanish silently**.
    // Caution: **Settle it by whether it is pointed at** (by whether it could be read, one that
    // could not becomes the other's twin).
    // The opened side's DOM cannot be drawn out, so it asks for the text (**a key apart from the
    // twin's**, `probe: "solo?"`). **Do not settle it by the first answer**: the other side answers
    // once `window.kspage` stands, before the `?doc=` document loads, so the first answer is **the
    // sample**. At the cap the last answer goes onto the marks, telling "no answer" from "a
    // different document".
    const soloText = (child, mark) => new Promise((got) => {
      let last = { text: "", handed: -1 };
      const ear = (ev) => {
        if (!ev.data || ev.data.probe !== "solo") return;
        last = { text: String(ev.data.body || ""), handed: ev.data.handed };
        if (last.text.indexOf(mark) < 0) return;
        clearInterval(ring);
        window.removeEventListener("message", ear);
        got(last);
      };
      window.addEventListener("message", ear);
      let asked = 0;
      const ring = setInterval(() => {
        asked += 1;
        // Caution: **Ask again and again** (the other side answers only once its asynchronous
        // start-up is done).
        child.postMessage({ probe: "solo?" }, "*");
        if (asked > 300) {
          clearInterval(ring);
          window.removeEventListener("message", ear);
          got(last);
        }
      }, 100);
    });
    // It makes one other document ready.
    // Caution: **Make it a text tellable from the document now.**
    const soloMark = "another document";
    const soloDoc = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
      + "\"inlines\":[{\"text\":\"" + soloMark + "\"}]}]}";
    // **Lay it down with its own `fetch`** (the reason is in the header).
    const wrote = await fetch(at("solo.json"),
      { method: "PUT", headers: head, body: soloDoc });
    ks.check(wrote.ok, "the other document can be laid down");
    const here = ks.app.text();
    const child = window.open(location.href + "?doc=solo.json", "kspage-solo");
    ks.check(child !== null, "the other document's window can be opened");
    if (child !== null) {
      const said = await soloText(child, soloMark);
      ks.check(said.text.indexOf(soloMark) >= 0,
        "the window opened holds the document pointed at ("
          + said.text.slice(0, 20) + ")");
      // Caution: **See that nothing was handed over.** The text is whichever came later, so it can
      // look right with something handed over (**in another opening order the document pointed at
      // vanishes**). Not letting it declare itself is the settlement here.
      ks.check(said.handed === 0,
        "the window opened is handed no document of the other's ("
          + said.handed + ")");
      ks.check(ks.app.text() === here,
        "the opening side's document does not move");
      child.close();
    }

    // ---- Editing a Markdown text as it stands ----
    //
    // **This can be seen nowhere else**: writing back in the shape it was opened in is the page's,
    // so the wasm misses "it was writing back as JSON".
    // Caution: **Read the text written back with its own `fetch`** (the reason is in the header).
    const md = "# A title\n\nBody with `code` and [`link.md`](link.md).\n";
    const mdPut = await fetch(at("doc.md"),
      { method: "PUT", headers: head, body: md });
    ks.check(mdPut.ok, "the Markdown text can be laid down");
    clear();
    ks.check(await ks.app.openDoc("doc.md"), "the Markdown text can be opened");
    ks.check(ks.app.text().indexOf("A title") >= 0,
      "the content goes in (" + ks.app.text().slice(0, 8) + ")");
    // Caution: **Write it back in the shape it was opened in.** Written back as JSON, the same
    // thing sits in two files with nothing to settle which is the newer.
    box.value = "doc.md";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved ("), "the Markdown document can be saved");
    const mdBack = await fetch(at("doc.md"), { headers: head });
    const mdGot = mdBack.ok ? await mdBack.text() : "";
    ks.check(mdGot.indexOf("# A title") >= 0,
      "the text written back is Markdown");
    ks.check(mdGot.indexOf("\"kspage\"") < 0, "it does not write back as JSON");
    // **The code text must not fall away** (it is the round trip's point).
    ks.check(mdGot.indexOf("`code`") >= 0 && mdGot.indexOf("[`link.md`](link.md)") >= 0,
      "the code text and the link both write back");
    // **Do not grow a history file next to it** (not the manner of a folder of texts).
    const mdPast = await fetch(at("doc.ksdb"), { headers: head });
    ks.check(!mdPast.ok,
      "no history file is written for a Markdown document");

    // ---- Editing the plain text shape (`.txt` and source) as it stands ----
    //
    // **This can be seen nowhere else**: the page settles the shape from the name (as for Markdown
    // above). **Write it back without changing one byte** — a text is the compiler's input, and a
    // dropped trailing space makes a different file; the shapes easiest to drop are put in on
    // purpose.
    const src = "fn main(): I32 {\n\treturn 0;   \n}\n\n\n# this is no heading\n- nor a bullet";
    const srcPut = await fetch(at("main.kspl"),
      { method: "PUT", headers: head, body: src });
    ks.check(srcPut.ok, "the source text can be laid down");
    clear();
    ks.check(await ks.app.openDoc("main.kspl"), "the source text can be opened");
    ks.check(ks.app.text().indexOf("fn main") >= 0,
      "the content goes in (" + ks.app.text().slice(0, 10) + ")");
    box.value = "main.kspl";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    clear();
    document.getElementById("save").click();
    ks.check(await untilSays("Saved ("), "the source document can be saved");
    const srcBack = await fetch(at("main.kspl"), { headers: head });
    const srcGot = srcBack.ok ? await srcBack.text() : "";
    ks.check(srcGot === src,
      "it writes back without changing one byte ("
        + src.length + " -> " + srcGot.length + " bytes)");
    ks.check(srcGot.indexOf("\"kspage\"") < 0, "it does not write back as JSON");
    // **That the colours reach the canvas can be seen nowhere else** — split into boxes but unread
    // by the drawing side, they are not drawn.
    // Note: A word's colour is #d73a49 (`kspage/model/code.kspls`'s `role_ink`).
    const redOf = () => {
      const sheet = document.getElementById("page");
      const band = sheet.getContext("2d")
        .getImageData(0, 0, sheet.width, Math.min(sheet.height, 400)).data;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (Math.abs(band[i] - 0xd7) < 24 && Math.abs(band[i + 1] - 0x3a) < 24
          && Math.abs(band[i + 2] - 0x49) < 24) n += 1;
      }
      return n;
    };
    ks.check(redOf() > 20,
      "a word's colour reaches as far as the canvas (" + redOf() + " pixels)");
    // Caution: **Where the ground is dark the text's colours must swap too** — with one settled
    // set, **the text sinks into a dark ground and cannot be read**. A word on the dark side is
    // #569cd6 (`kspage/model/code.kspls`'s `role_ink`). **It wears the theme by pressing the row.**
    const blueOf = () => {
      const sheet = document.getElementById("page");
      const band = sheet.getContext("2d")
        .getImageData(0, 0, sheet.width, Math.min(sheet.height, 400)).data;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (Math.abs(band[i] - 0x56) < 24 && Math.abs(band[i + 1] - 0x9c) < 24
          && Math.abs(band[i + 2] - 0xd6) < 24) n += 1;
      }
      return n;
    };
    ks.check(ks.flyPick("look-theme", "Ink (a dark ground and amber)"),
      "the dark theme can be chosen");
    ks.check(blueOf() > 20 && redOf() === 0,
      "on a dark ground a word's colour becomes the dark side's set ("
        + blueOf() + " pixels)");
    ks.check(ks.flyPick("look-theme", "Standard (fits the screen)"),
      "the theme can be put back");
    ks.check(redOf() > 20,
      "put back, it returns to the bright side's set (" + redOf() + " pixels)");
    // **Colouring must not change the text** (it only splits the boxes); the joined text carries
    // the line-number marks, so one row's worth is compared.
    ks.check(ks.app.text().indexOf("fn main(): I32 {") >= 0,
      "joining the boxes split gives the original row back");
    // **Do not grow a history file next to it** (the same settlement as Markdown).
    const srcPast = await fetch(at("main.ksdb"), { headers: head });
    ks.check(!srcPast.ok,
      "no history file is written for a source document");

    // ---- The file open comes out on the band ----
    //
    // **This can be seen nowhere else** (what opens and the adornment's rules in step): **the name
    // always remains** and **pointing at it reads the whole thing**.
    await fetch(at("lib/deep.kspl"), { method: "PUT", headers: head,
      body: "fn deep(): I32 {\n  return 3;\n}\n" });
    clear();
    ks.check(await ks.app.openDoc("lib/deep.kspl"),
      "a document inside a folder can be opened");
    const deepBox = document.getElementById("file-at");
    ks.check(deepBox.title === "lib/deep.kspl",
      "pointing at it reads the whole path (" + deepBox.title + ")");
    // Caution: **Put the front and the name into separate frames.** Made one, the name's side
    // vanishes when it folds.
    ks.check(deepBox.querySelector(".dir").textContent === "lib/",
      "the front part goes into a separate frame");
    ks.check(deepBox.querySelector(".name").textContent === "deep.kspl",
      "the name goes into a separate frame");

    // ---- A draft document goes to the drafts ----
    //
    // **This can be seen nowhere else** (what opens and the core's row in step): **nothing is
    // lost** and **it can be gone back to**.
    const scratchText = "fn one(): I32 {\n  return 1;\n}\n";
    // Whether this page can hold drafts at all: **a page that cannot remember holds none**, so
    // there a missing draft says nothing (as in the keep probe).
    const keeps = ks.app.keepStore;
    const PLANT = "b-probe-local/0";
    await keeps.keepDraft({ at: PLANT, when: Date.now(), kind: "json", name: "planted", from: "",
      text: "planted" });
    const canKeep = (await keeps.takeDrafts()).some((one) => one && one.at === PLANT);
    await keeps.dropDraft(PLANT);
    // The drafts held back now whose text holds `mark` (none where the page cannot remember).
    const heldWith = async (mark) => (await keeps.takeDrafts())
      .filter((one) => one && typeof one.text === "string" && one.text.indexOf(mark) >= 0);
    await fetch(at("keepme.kspl"), { method: "PUT", headers: head, body: scratchText });
    await fetch(at("other.kspl"), { method: "PUT", headers: head,
      body: "fn two(): I32 {\n  return 2;\n}\n" });
    clear();
    ks.check(await ks.app.openDoc("keepme.kspl"),
      "the document to make a draft of can be opened");
    const wasDocs = ks.app.docCount();
    // It types, and opens another document without saving.
    ks.press(8, 8);
    ks.keyIn("End");
    ks.app.type("zz");
    ks.check(ks.app.text().indexOf("zz") >= 0, "what was typed goes in");
    // Caution: **Being a draft must come out on the band** (the list can be folded, so marked only
    // there, not having saved goes unnoticed).
    ks.check(document.getElementById("where").textContent.indexOf("Unsaved") >= 0,
      "being unsaved comes out on the status bar");
    // **Which file is open must come out on the band too**, and the unshaved shape (pointed at) is
    // always the path itself.
    const placeBox = document.getElementById("file-at");
    ks.check(placeBox.querySelector(".name").textContent === "keepme.kspl",
      "the name of the file open comes out on the band ("
        + placeBox.querySelector(".name").textContent + ")");
    ks.check(placeBox.title === "keepme.kspl",
      "pointing at it reads the whole path (" + placeBox.title + ")");
    ks.check(!placeBox.classList.contains("nowhere"),
      "with one open it does not say there is nowhere to save");
    ks.check(await ks.app.openDoc("other.kspl"), "another document can be opened");
    ks.check(ks.app.text().indexOf("fn two(") >= 0,
      "the document opened is visible");
    // **The document gone to the drafts keeps its held-back draft.** Loaded under the earlier
    // naming, the next document levels that draft as "in step" and throws it away, leaving what was
    // typed guarded by the row alone.
    const keptZz = await heldWith("zz");
    ks.check(!canKeep || keptZz.some((one) => one.from === "keepme.kspl"),
      "the draft of the document gone to the drafts stays held back ("
        + (canKeep ? keptZz.length : "this page cannot remember") + ")");
    ks.check(ks.app.docCount() === wasDocs + 1,
      "the draft document goes to the drafts (" + ks.app.docCount() + ")");
    // **A document that went to the drafts must come out in the list**, or where it went cannot be
    // read.
    const listed = document.querySelectorAll("#docs .item");
    ks.check(listed.length === ks.app.docCount(),
      "the documents open line up in the list (" + listed.length + " rows)");
    ks.check(document.getElementById("docs").textContent.indexOf("●") >= 0,
      "the draft document gets the mark");
    // **What was typed must still be there on going back** (a draft is no reread).
    ks.check(await ks.app.openDoc("keepme.kspl"),
      "the document that went to the drafts can be gone back to");
    ks.check(ks.app.text().indexOf("zz") >= 0, "what was typed is still there");
    // **Do not shut it while it is still a draft** (a mispress would throw it away for good).
    ks.check(!ks.app.docShut(ks.app.docNow()), "a draft document is not shut");
    // **The undo must be per document too** (a draft holds the editing field along with it).
    ks.keyIn("z", { ctrlKey: true });
    ks.check(ks.app.text().indexOf("zz") < 0,
      "the undo acts where it went back to as well");
    const shutFrom = ks.app.docCount();
    ks.check(ks.app.docShut(ks.app.docNow()),
      "once there is no draft it can be shut");
    ks.check(ks.app.docCount() === shutFrom - 1,
      "shutting it takes the count down (" + ks.app.docCount() + ")");

    // ---- Opening through the window, over a document with something to lose ----
    //
    // **This can be seen nowhere else**: the window hands a file to the page, so what it opens over
    // and where the document then lives are the page's to keep in step.
    // Caution: **Plan it the same as opening by a place.** Laid over the document now, it crushes
    // what was typed and keeps the earlier place — the band names the wrong file and the draft is
    // levelled against the wrong text.
    clear();
    ks.check(await ks.app.openDoc("keepme.kspl"),
      "a document is open by a place before the window");
    const byPlace = ks.app.docCount();
    ks.press(8, 8);
    ks.keyIn("End");
    ks.app.type("yy");
    const chosenText = "{\"kspage\":6,\"sheet\":{},\"blocks\":[{\"style\":\"body\","
      + "\"inlines\":[{\"text\":\"a document the window chose\"}]}]}";
    let chosenOnDisk = chosenText;
    const chosen = {
      kind: "file", name: "chosen.kspage",
      getFile: async () => new File([chosenOnDisk], "chosen.kspage", { type: "application/json" }),
      queryPermission: async () => "granted",
      requestPermission: async () => "granted",
      createWritable: async () => ({
        write: async (d) => { chosenOnDisk = String(d); }, close: async () => {} }),
    };
    const openWas = window.showOpenFilePicker;
    window.showOpenFilePicker = async () => [chosen];
    try {
      clear();
      document.getElementById("open").click();
      ks.check(await untilSays("Loaded it"), "the window opens a document over one being typed in");
      ks.check(ks.app.text().indexOf("a document the window chose") >= 0,
        "the document the window chose is the one shown");
      ks.check(ks.app.docCount() === byPlace + 1,
        "the document typed in goes to the drafts (" + ks.app.docCount() + ")");
      ks.check(ks.app.pathNow() === "",
        "a document the window chose has no path (" + ks.app.pathNow() + ")");
      const chosenName = document.getElementById("file-at").querySelector(".name").textContent;
      ks.check(chosenName === "chosen.kspage",
        "the band names the file the window chose (" + chosenName + ")");
      ks.check(box.value === "", "the place field is empty for a document the window chose");
      // **A save through the handle levels what the draft compares against**, or the saved document
      // comes back as unsaved at the next start.
      clear();
      document.getElementById("save").click();
      ks.check(await untilSays("Saved (chosen.kspage"),
        "the document the window chose saves through its handle");
      ks.app.keepSync();
      const heldChosen = await heldWith("a document the window chose");
      ks.check(!canKeep || heldChosen.length === 0,
        "a document saved through the window is not held back (" + heldChosen.length + ")");
      ks.check(!ks.app.docList().some((one) => one.here && one.unsaved),
        "a document saved through the window does not read as unsaved");
    } finally {
      window.showOpenFilePicker = openWas;
    }
    const typedAt = () => ks.app.docList().find((one) => one.path === "keepme.kspl");
    ks.check(typedAt() !== undefined && ks.app.docGo(typedAt().at)
      && ks.app.text().indexOf("yy") >= 0,
      "what was typed before the window opened is still there");
    // **Markdown taken in plans the same way.**
    const byMd = ks.app.docCount();
    clear();
    ks.pickFile(document.getElementById("md-file"),
      new TextEncoder().encode("# Taken in\n\nA line taken in.\n"), "taken.md", "text/markdown");
    ks.check(await untilSays("Opened the Markdown"),
      "Markdown is taken in over a document typed in");
    ks.check(ks.app.docCount() === byMd + 1,
      "the document typed in goes to the drafts when Markdown is taken in (" + ks.app.docCount()
        + ")");
    ks.check(ks.app.pathNow() === "" && box.value === "", "Markdown taken in lives in no file");
    // **The manual plans the same way, and asks nothing** (a panel that asks stops a checking
    // browser for good). Laid over under the earlier naming, it crushes that draft, and a save
    // writes the manual into the earlier file.
    ks.check(typedAt() !== undefined && ks.app.docGo(typedAt().at),
      "the document typed in can be gone back to before the manual");
    const byManual = ks.app.docCount();
    clear();
    document.getElementById("open-manual").click();
    ks.check(await untilSays("Opened the manual"), "the manual opens over a document typed in");
    ks.check(ks.app.docCount() === byManual + 1,
      "the document typed in goes to the drafts when the manual opens (" + ks.app.docCount()
        + ")");
    ks.check(ks.app.pathNow() === "" && box.value === "",
      "the manual lives in no file (" + ks.app.pathNow() + ")");
    ks.app.keepSync();
    const keptYy = await heldWith("yy");
    ks.check(!canKeep || keptYy.some((one) => one.from === "keepme.kspl"),
      "the draft of the document typed in stays held back ("
        + (canKeep ? keptYy.length : "this page cannot remember") + ")");
    // It tidies up: what was typed is undone, and the places it opened are shut (each is clean by
    // then), leaving the document typed in.
    ks.check(typedAt() !== undefined && ks.app.docGo(typedAt().at)
      && ks.app.text().indexOf("yy") >= 0, "what was typed is still there after the manual");
    ks.keyIn("z", { ctrlKey: true });
    ks.app.keepSync();
    for (const one of ks.app.docList().filter((d) => !d.here)) ks.app.docShut(one.at);
    for (const one of await heldWith("yy")) await keeps.dropDraft(one.at);

    // ---- A language with a token that crosses lines ----
    //
    // Caution: **Look at the second line.** The first alone cannot tell a crossing comment from an
    // unclosed one ending there. A comment's colour is #6a737d.
    const inkCount = (want) => {
      const sheet = document.getElementById("page");
      const band = sheet.getContext("2d")
        .getImageData(0, 0, sheet.width, Math.min(sheet.height, 400)).data;
      let n = 0;
      for (let i = 0; i < band.length; i += 4) {
        if (Math.abs(band[i] - want[0]) < 24 && Math.abs(band[i + 1] - want[1]) < 24
          && Math.abs(band[i + 2] - want[2]) < 24) n += 1;
      }
      return n;
    };
    const cCode = "int main(void) {\n  /* from here\n     to here is a comment */\n  return 0;\n}\n";
    await fetch(at("probe.c"), { method: "PUT", headers: head, body: cCode });
    clear();
    ks.check(await ks.app.openDoc("probe.c"), "the C source can be opened");
    ks.check(inkCount([0x6a, 0x73, 0x7d]) > 40,
      "a crossing comment carries the colour on to the second line ("
        + inkCount([0x6a, 0x73, 0x7d]) + " pixels)");
    ks.check(inkCount([0xd7, 0x3a, 0x49]) > 20,
      "C's words get colours too (" + inkCount([0xd7, 0x3a, 0x49]) + " pixels)");

    // ---- A plugin works on the text chosen ----
    //
    // **This can be seen nowhere else**: starting a program is the server's and choosing the text
    // the page's, so **only a real server with a real plugin shows them meeting**.
    // Caution: **Press the same entry point a person presses** (`app.pluginRun`); asking the server
    // straight stays green once the menu's wiring is cut.
    ks.check(ks.app.pluginNames().indexOf("sort") >= 0,
      "the plugin beside the server is found (" + ks.app.pluginNames().join(",") + ")");
    clear();
    ks.app.loadPlainText("pear\nfig\napple\n", "");
    ks.app.focus();
    ks.keyIn("a", { ctrlKey: true });
    const why = await ks.app.pluginRun("sort");
    ks.check(why === "", "the plugin runs without refusing (" + why + ")");
    ks.check(ks.app.text().indexOf("apple") < ks.app.text().indexOf("pear"),
      "what it gave back took the chosen text's place (" + ks.app.text().slice(0, 20) + ")");
    // **One undo puts it back**; made two steps, a plugin pressed by mistake takes two undos and
    // leaves the person unsure it is back.
    ks.keyIn("z", { ctrlKey: true });
    ks.check(ks.app.text().indexOf("pear") < ks.app.text().indexOf("apple"),
      "one undo puts what was there back (" + ks.app.text().slice(0, 20) + ")");
    const noSuch = await ks.app.pluginRun("no-such-plugin");
    ks.check(noSuch.indexOf("no-such-plugin") >= 0,
      "a plugin that is not there is refused, naming it (" + noSuch + ")");

    // Caution: **Take the path off once the name is typed afresh**, or it keeps writing to the old
    // place.
    box.value = "saved.json";
    box.dispatchEvent(new Event("change", { bubbles: true }));
    name.value = "another";
    name.dispatchEvent(new Event("change", { bubbles: true }));
    ks.check(box.value === "", "changing the name takes the path off");
  })().then(done, (e) => {
    // Caution: **Always let go, even on falling** — held, it runs out of time with not one mark put
    // out, and **which check fell is not left behind either** (`probe.js`'s `hold`).
    ks.check(false,
      "the section finishes without falling (" + String((e && e.stack) || e) + ")");
    done();
  });
}
