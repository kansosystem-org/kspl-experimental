// ==========================================
// kspage's page — comparing with an earlier version.
//
// **A view is a filter, not a new matching.** The core matches once (`kspage/share/compare.kspls`);
// this file only decides which kinds each view shows. Matched again per view, the same edit would
// count differently per view.
// Caution: **Show both the filtered count and the total** — the filtered count alone makes a
// difference under another view look "absent".
//
// **Draw the look for both versions with the same renderer**, so the pixels match and **no
// tolerance is needed** (setting that threshold is the common complaint about image-diff tools).
// **Not with the screen's canvas** — its cursor, selection and dotted region lines would look like
// differences; `paintPage` draws black on white with no chrome. **Lay both out at the same width**,
// or every shifted line becomes a difference.
//
// **Do not build HTML from the text** — a `<` in a block would be read as markup; the text goes
// into `textContent`.
//
// The saved versions (the earlier versions this page remembers) are here too. **Versions are saved
// only on a click and on a save** (per keystroke, an unmanageable number of versions would eat
// the storage).
// Caution: **Set a cap, discard the oldest and say that it was discarded** (Google Docs' history
// stops accepting at its cap, and only named versions can be deleted). **Provide a way to delete.**
// **Keep them separate by the origin mark**, and save no document without one — `file://` pages
// share the storage, so another document's versions would mix in. **They stay on this machine**
// (choose a file to take one elsewhere).
// ==========================================
function kspageDiff(ui) {
  const app = ui.app;
  const say = ui.say, deny = ui.deny;
  const bytes = new TextEncoder();
  const chars = new TextDecoder();
  const list = document.getElementById("diff-list");
  const note = document.getElementById("diff-note");
  // The view a difference is seen under.
  // **Do not go back to a `<select>`** — a closed field hides the chosen view, so it cannot be read
  // until opened (the header of `fly.js`).
  const LENS_PICKS = [["text", "Prose"], ["shape", "Shapes"], ["look", "Styles"]];
  const lens = kspageHoldFly(document.getElementById("diff-lens"),
    { id: "diff-view", name: "The view to compare under", picks: LENS_PICKS, run: () => drawList() });
  const shot = document.getElementById("diff-shot");
  const chooser = document.getElementById("compare-file");
  // The text compared with, **kept for the look view** (which redraws it in a second instance);
  // empty means nothing compared.
  let source = "";
  // The second instance for drawing the look, started only when the look view is chosen.
  // Caution: **Make only one and reuse it** (one per click would pile up arenas).
  let mate = null;
  // The list's message. **Two things write into one field, so only this builds it.**
  let counted = "";
  let painted = "";

  // ---- The saved versions ----
  // **Keep them separate by the origin mark** (a document without one is not saved; saving adds
  // one).
  const PAST_KEY = "kspage.past.";
  // How many to keep (**capped**: storage is limited).
  // Caution: **When it overflows, discard the oldest and say so** (vanished silently, "it should be
  // there" turns out wrong).
  const PAST_MAX = 8;
  // The item that chooses a saved version. The list is rebuilt from storage, so `picks` is read on
  // every call.
  // Caution: **Do not make it a `<select>`** — choosing compares at once, so it is **a list of
  // commands**, not a value field (`../../docs/DESIGN.md`'s "a choice that acts on the spur of the
  // press", which names this item).
  // **It holds the check mark (✓) and nothing else.** Deleting has items of its own and does not
  // read it — if it did, **the deletion would hit a choice nobody could see**.
  let pastAt = "";
  let pastFly = null;
  let dropFly = null;
  // The delete item's value for "there is none" — **neither a number nor empty** (`dropPicks` says
  // why).
  const NONE = "none";
  const pastKey = () => {
    const mark = app.origin();
    return mark === "" ? "" : PAST_KEY + mark;
  };
  // Reads the storage.
  // Caution: **Treat unreadable storage as empty** (broken storage must not stop the page).
  const readPast = () => {
    const key = pastKey();
    if (key === "") return [];
    try {
      const raw = localStorage.getItem(key);
      const kept = raw ? JSON.parse(raw) : [];
      return Array.isArray(kept) ? kept : [];
    } catch (_) {
      return [];
    }
  };
  const writePast = (kept) => {
    const key = pastKey();
    if (key === "") return false;
    try {
      localStorage.setItem(key, JSON.stringify(kept));
      return true;
    } catch (_) {
      // Comparing works even where nothing can be stored (the storage is full, or refused).
      return false;
    }
  };

  // The items for the saved versions, **newest on top** (most often the one just before). **One
  // item is shown even when there is none** — an empty group does not look clickable.
  const pastPicks = () => {
    const kept = readPast();
    const out = [["", kept.length <= 0 ? "There is no saved version yet" : "Choose a saved version"]];
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      out.push([String(i), `${kept[i].at}(${i + 1}/${kept.length})`]);
    }
    return out;
  };
  // The items that discard a saved version, labeled as in `pastPicks` so the two read as one group.
  // Caution: **Name the version on the item itself**, so nothing is remembered between two clicks.
  // **Do not give the empty item the value `""`** — `now` returns empty to mean no item, so an item
  // valued empty would match it and **get the ✓**, looking applied.
  const dropPicks = () => {
    const kept = readPast();
    if (kept.length <= 0) return [[NONE, "There is no saved version yet"]];
    const out = [];
    for (let i = kept.length - 1; i >= 0; i -= 1) {
      out.push([String(i), `${kept[i].at}(${i + 1}/${kept.length})`]);
    }
    return out;
  };
  // Rebuilds both lists of saved versions.
  // Caution: **Rebuild the delete items too** — otherwise they list a removed version, and a click
  // hits whatever now has that index. **Where the chosen version is gone, reset the mark.**
  const showPast = () => {
    const kept = readPast();
    if (pastAt !== "" && !kept[Number(pastAt)]) pastAt = "";
    if (pastFly !== null) pastFly.paint();
    if (dropFly !== null) dropFly.paint();
  };

  // Saves the current text as one version; true if saved.
  // Caution: **Do not save the same text twice.** **Do not save where there is no mark** — whose
  // version it is cannot be told, and on a `file://` page it would mix with another's.
  // Saving adds the mark (`api.js`'s `save`).
  const keepPast = () => {
    if (pastKey() === "") return false;
    const body = app.save();
    const kept = readPast();
    if (kept.length > 0 && kept[kept.length - 1].body === body) {
      showPast();
      return false;
    }
    kept.push({ at: app.now(), body: body });
    let dropped = 0;
    // Caution: **Discard the oldest**, and more while storing fails because storage is full.
    while (kept.length > PAST_MAX) {
      kept.shift();
      dropped += 1;
    }
    while (!writePast(kept)) {
      if (kept.length <= 1) {
        showPast();
        deny("This page cannot save a version (the memory is full)");
        return false;
      }
      kept.shift();
      dropped += 1;
    }
    showPast();
    say(dropped <= 0 ? "Saved the current version" : `Saved the current version (deleted the oldest ${dropped})`);
    return true;
  };

  // How a difference's kind is labeled (**the number becomes text at the boundary**:
  // `api_diff.js`'s `DIFF_KINDS`).
  const LABEL = {
    added: "Added", removed: "Deleted", moved: "Moved", edited: "Changed",
    restyled: "Style changed", reframed: "Shape moved", resheeted: "Paper setting changed",
  };
  // The kinds shown per view. **One difference may appear under several views** (an edit to both
  // the prose and the look).
  // Caution: **Do not make a kind that appears under no view** (an invisible difference).
  const LENS = {
    text: ["added", "removed", "moved", "edited"],
    shape: ["added", "removed", "moved", "reframed", "restyled"],
    look: ["added", "removed", "restyled", "reframed", "resheeted"],
  };

  // Whether to show that difference under this view. **The shapes view shows only blocks with a
  // frame** (otherwise a figure's difference drowns in the body's); **the prose view shows blocks
  // without one.** A difference with neither side is a style table's, referred to by name, so it is
  // shown only under the look view.
  const shows = (row, key) => {
    if (!LENS[key].includes(row.kind)) return false;
    const block = row.was || row.now;
    if (key === "look") return true;
    if (!block) return false;
    return key === "shape" ? row.framed : !row.framed;
  };

  // Cuts the text by bytes; **the break comes as a byte count** (aligned by the core to a character
  // boundary).
  const cut = (text, from, len) => chars.decode(bytes.encode(text).slice(from, from + len));

  // One line of one side's text, marking the changed middle.
  const sideNode = (tip, text, head, len) => {
    const box = document.createElement("div");
    box.className = "diff-side";
    const label = document.createElement("span");
    label.className = "diff-tip";
    label.textContent = tip;
    box.appendChild(label);
    box.appendChild(document.createTextNode(cut(text, 0, head)));
    if (len > 0) {
      const mid = document.createElement("mark");
      mid.textContent = cut(text, head, len);
      box.appendChild(mid);
    }
    box.appendChild(document.createTextNode(cut(text, head + len, text.length + len)));
    return box;
  };

  // One difference's row; clicked, it jumps to that place.
  const rowNode = (i, row) => {
    const line = document.createElement("div");
    line.className = "diff-row";
    const tag = document.createElement("span");
    tag.className = "diff-kind";
    tag.textContent = LABEL[row.kind] || row.kind;
    line.appendChild(tag);
    const name = app.diffName(i);
    if (name !== "") {
      // A style table's difference, **referred to by name, so there is nowhere to jump.**
      const which = document.createElement("span");
      which.textContent = `Style "${name}"`;
      line.appendChild(which);
      return line;
    }
    const style = app.diffStyle(i);
    if (style !== "") {
      const which = document.createElement("span");
      which.className = "diff-tip";
      which.textContent = style;
      line.appendChild(which);
    }
    if (row.was) {
      line.appendChild(sideNode("Before", app.diffText(i, 0), row.head, row.wasLen));
    }
    if (row.now) {
      line.appendChild(sideNode("After", app.diffText(i, 1), row.head, row.nowLen));
    }
    // A block only in the earlier version can be taken into the current document.
    // Caution: **Do not show it for a block on both sides** — with no common ancestor, taking it
    // would silently lose one change (the core refuses, but if clickable it looks like "nothing
    // happens"). **Only where the two were matched by number** (matched by text, it would add it at
    // the wrong place).
    if (row.was && !row.now && app.diffById()) {
      const take = document.createElement("button");
      take.type = "button";
      take.className = "diff-take";
      take.textContent = "Take it in";
      take.title = "Takes this section into the current document (one undo puts it back)";
      take.addEventListener("click", (e) => {
        // **Do not pass it on to the row's click** (jumping and taking would both run).
        e.stopPropagation();
        if (!app.diffTake(i)) {
          deny("This section cannot be taken in (a section on both sides, and two that cannot be matched by number, are not taken)");
          app.focus();
          return;
        }
        // Caution: **Compare again once it is taken** — a stale list makes it look "taken, yet
        // still there".
        say("Took one in from the earlier version (Ctrl+Z puts it back)");
        compareWith(source);
      });
      line.appendChild(take);
    }
    // Caution: **Say that clicking cannot jump** — a deleted block is not in the current document.
    line.addEventListener("click", () => {
      if (app.diffGo(i)) {
        say("");
      } else {
        deny("This place is not in the current document (it is what was deleted)");
      }
      app.focus();
    });
    return line;
  };

  const retell = () => {
    note.textContent = painted === "" ? counted : `${counted} - ${painted}`;
  };

  // Rebuilds the list. **Empty when nothing is compared** (the earlier result is not left shown).
  const drawList = () => {
    list.textContent = "";
    painted = "";
    const key = lens.now();
    const total = app.diffCount();
    let shown = 0;
    for (let i = 0; i < total; i += 1) {
      const row = app.diffRow(i);
      if (!shows(row, key)) continue;
      list.appendChild(rowNode(i, row));
      shown += 1;
    }
    // Caution: **Show whether it matched by number or by text** — falling back to text silently, a
    // mismatch reads as changes.
    const how = app.diffById() ? "matched by number" : "matched by body text (the two have no numbers)";
    counted = source === "" ? ""
      : total <= 0 ? `There is no difference (${how})`
      : `${shown} of ${total} in all - ${how} - typing makes it stale`;
    retell();
    shot.hidden = key !== "look" || source === "";
    if (!shot.hidden) paintLook();
  };

  // The width the look is compared at.
  // Caution: **Fix it** (at the window's width, the differences would change whenever the window
  // does).
  const LOOK_WIDTH = 640;
  // Starts the second instance for drawing the look, **on an offscreen canvas** (otherwise its
  // cursor and input field would appear on the real screen beside it).
  const raise = () => {
    if (mate !== null) return Promise.resolve(mate);
    if (!ui.boot) return Promise.resolve(null);
    return ui.boot(document.createElement("canvas")).then((made) => {
      mate = made;
      return mate;
    });
  };

  // Matches the pixels and shows one picture with the differing places marked; **no tolerance is
  // needed** (same renderer, same width).
  // Caution: **Where the sizes differ, compare only the overlap and say "the lengths differ"** (cut
  // silently, what grew would be no difference).
  const showLook = (was, now) => {
    const wide = Math.min(was.width, now.width);
    const tall = Math.min(was.height, now.height);
    if (wide <= 0 || tall <= 0) {
      deny("There is no image to compare");
      return;
    }
    const a = was.getContext("2d").getImageData(0, 0, wide, tall).data;
    const b = now.getContext("2d").getImageData(0, 0, wide, tall).data;
    const mask = new ImageData(wide, tall);
    let count = 0;
    for (let at = 0; at < a.length; at += 4) {
      if (a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] &&
        a[at + 3] === b[at + 3]) continue;
      count += 1;
      mask.data[at] = 255;
      mask.data[at + 1] = 255;
      mask.data[at + 2] = 255;
      mask.data[at + 3] = 255;
    }
    // The mark's color, **taken from the role** (no page color is written here): `#diff-shot`'s
    // `color` points at it, and the computed value is read.
    const tint = document.createElement("canvas");
    tint.width = wide;
    tint.height = tall;
    const tg = tint.getContext("2d");
    tg.putImageData(mask, 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = getComputedStyle(shot).color;
    tg.fillRect(0, 0, wide, tall);
    // **Draw the current version faintly with the marks over it** (marks alone do not say where).
    const room = 280;
    const fit = Math.min(1, room / wide);
    shot.width = Math.round(wide * fit);
    shot.height = Math.round(tall * fit);
    shot.style.width = `${shot.width}px`;
    shot.style.height = `${shot.height}px`;
    const g = shot.getContext("2d");
    g.clearRect(0, 0, shot.width, shot.height);
    g.globalAlpha = 0.25;
    g.drawImage(now, 0, 0, wide, tall, 0, 0, shot.width, shot.height);
    g.globalAlpha = 1;
    g.drawImage(tint, 0, 0, wide, tall, 0, 0, shot.width, shot.height);
    const all = wide * tall;
    const part = all <= 0 ? 0 : Math.round((count / all) * 1000) / 10;
    const grew = was.height === now.height ? "" : " - the lengths differ";
    painted = `${part}% of the pixels (${count} points) differ${grew}`;
    retell();
  };

  // Draws both at the same width and then matches them.
  const paintLook = () => {
    if (source === "") return;
    raise().then((other) => {
      // **The result is a reason, not a boolean** (`api_io.js`'s `load`): empty text means "it was
      // read", so read as a boolean, a readable version would be refused.
      if (other === null || other.load(source) !== "") {
        deny("The earlier version's styles cannot be shown");
        return;
      }
      const mine = document.createElement("canvas");
      const theirs = document.createElement("canvas");
      // Caution: **Return to the screen's width once done**, or the body stays at the compared
      // width.
      app.resize(LOOK_WIDTH);
      app.paintPage(mine, 0);
      ui.fit();
      other.resize(LOOK_WIDTH);
      other.paintPage(theirs, 0);
      showLook(theirs, mine);
    });
  };

  // Compares that text as the earlier version. **This is the one function** (with separate paths, a
  // file's text and a saved version would get out of step).
  const compareWith = (text) => {
    if (!app.compare(text)) {
      source = "";
      drawList();
      deny("It is not a form that can be read");
      app.focus();
      return false;
    }
    source = text;
    say("");
    drawList();
    app.focus();
    return true;
  };

  // ---- Click handlers ----
  // **The file picker opens only within a click's user activation** (started from the button with
  // `click()`).
  document.getElementById("compare-open").addEventListener("click", () => chooser.click());
  chooser.addEventListener("change", () => {
    const chosen = chooser.files[0];
    // Cleared so that choosing the same file again fires `change`.
    chooser.value = "";
    if (!chosen) return;
    chosen.text().then((text) => compareWith(text));
  });
  // Saves the current version. **It also saves on a save** (`file.js` calls here).
  document.getElementById("diff-keep").addEventListener("click", () => {
    if (!keepPast()) {
      if (pastKey() === "") deny("Save it first (a mark that divides the versions is put on)");
    }
    app.focus();
  });
  // Choosing a saved version compares with it. **It acts as soon as it is chosen, so it is an item
  // (a submenu).**
  pastFly = kspageFlyout(document.getElementById("diff-past"), {
    id: "diff-past-fly",
    name: "Compare with a saved version",
    picks: pastPicks,
    now: () => pastAt,
    run: (value) => {
      pastAt = value;
      pastFly.sync();
      if (value === "") return;
      const kept = readPast();
      const one = kept[Number(value)];
      if (!one) {
        showPast();
        deny("This version is no longer there");
        return;
      }
      compareWith(one.body);
    },
  });
  // Discards the clicked version.
  // Caution: **Provide a way to delete** (an undeletable history is a common complaint).
  //
  // **Take nothing from the item above** — its choice is invisible once the panel opens again, so
  // deleting by it would hit a stale one. **No mark is shown** (`now` returns empty): these are
  // commands.
  dropFly = kspageFlyout(document.getElementById("diff-drop"), {
    id: "diff-drop-fly",
    name: "Delete a saved version",
    picks: dropPicks,
    now: () => "",
    run: (value) => {
      const kept = readPast();
      // Caution: **Give the reason on the empty item too** — silent, it is an item that does
      // nothing (Principle 5).
      if (value === NONE || !kept[Number(value)]) {
        showPast();
        deny("There is no saved version yet");
        app.focus();
        return;
      }
      kept.splice(Number(value), 1);
      writePast(kept);
      // Caution: **Clear the compare item's mark** — the indices after the deleted one move down,
      // so it would sit on another version.
      pastAt = "";
      showPast();
      say("Deleted this version");
      app.focus();
    },
  });
  showPast();
  // **Provide a way to stop** — the compared text's arena is freed only when it is discarded.
  document.getElementById("diff-clear").addEventListener("click", () => {
    app.diffDrop();
    source = "";
    counted = "";
    painted = "";
    list.textContent = "";
    note.textContent = "";
    shot.hidden = true;
    say("");
    app.focus();
  });

  // Caution: **Export the saving function.** It also saves on a save, so `file.js` calls this (and
  // the caller does not call `app.save` twice).
  return { keepPast: keepPast };
}
