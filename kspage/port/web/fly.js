// kspage's page — the flyout submenu (point at an item and the choices open to the right).
// **This is where "which one is applied now" is shown**: a label and a `<select>` hide it inside a
// closed field, which cannot be read until opened (Google Docs, Word and Pages all mark the
// applied choice). **Inheriting is a choice too**, "Unset"; nothing shows right of a closed item.
// Without `spec.picks` it makes **a group** (a submenu inside), **keeping the menu's top level
// short** (an opened menu over 400px covers the canvas). **A group used step by step is a panel**
// (`details.sub`), not a submenu: a submenu ends with one choice (the click returns focus to the
// body), so **text to be read does not go into a group**, nor fields filled in turn.
// **Do not list commands flat at the top level** (the cap is four), **nor use a panel for a
// submenu**; `kspage/tests/browser/menu.js` checks both.
function kspageFlyout(host, spec) {
  const put = (into, kind, why) => {
    const one = document.createElement(kind);
    one.className = why;
    into.appendChild(one);
    return one;
  };
  const fly = document.createElement("div");
  fly.className = "fly";
  fly.id = spec.id;
  // Caution: **One button fills the item pointed at**, its text not clickable (with a clickable
  // span, whether to close the menu would depend on the contents' shape; `page.css`).
  const open = put(fly, "button", "fly-open");
  open.type = "button";
  open.setAttribute("aria-haspopup", "true");
  put(open, "span", "fly-name").textContent = spec.name;
  const now = put(open, "span", "fly-now");
  put(open, "span", "fly-arrow").textContent = "▸";
  const box = put(fly, "div", "fly-items");
  box.setAttribute("role", "menu");
  host.appendChild(fly);
  // With no room it opens to the left — **a deep level always reaches past the window** (180px to
  // the right per level). Measure after opening (closed, the dimensions are 0).
  const place = () => {
    fly.classList.remove("fly-flip");
    const room = box.getBoundingClientRect();
    if (room.width > 0 && room.right > window.innerWidth - 4) {
      fly.classList.add("fly-flip");
    }
  };
  fly.addEventListener("mouseenter", () => requestAnimationFrame(place));
  fly.addEventListener("focusin", () => requestAnimationFrame(place));
  // A group holds no contents and **shows no mark**; **its box does not scroll** (`overflow` would
  // clip the submenus inside, as in `page.css`), only the innermost level of choices does.
  if (spec.picks === undefined) {
    box.classList.add("fly-nest");
    return { box: box };
  }

  let rows = [];
  // Rebuilds the choice items **from `spec.picks()` only** (copied names drift from the applied).
  const paint = () => {
    box.textContent = "";
    rows = spec.picks().map(([value, label]) => {
      const one = put(box, "button", "fly-pick");
      one.type = "button";
      one.setAttribute("role", "menuitemradio");
      const tick = put(one, "span", "fly-tick");
      // Caution: **Show the color itself, not only the name** ("Pink" and "Orange" cannot be told
      // apart by name); the value's form (`#rrggbb`) decides, so the menu and the ribbon agree.
      if (/^#[0-9a-f]{6}$/i.test(value)) put(one, "span", "fly-chip").style.background = value;
      put(one, "span", "fly-label").textContent = label;
      put(one, "span", "fly-key").textContent = (spec.keys || {})[value] || "";
      one.addEventListener("click", () => spec.run(value));
      return { value: value, label: label, row: one, tick: tick };
    });
  };
  // Moves the mark to what is applied.
  const sync = () => {
    const at = spec.now();
    let found = null;
    for (const one of rows) {
      const on = one.value === at;
      one.tick.textContent = on ? "✓" : "";
      one.row.setAttribute("aria-checked", on ? "true" : "false");
      if (on) found = one;
    }
    now.textContent = at === "" || found === null ? "" : found.label;
  };
  paint();
  sync();
  return { paint: () => { paint(); sync(); }, sync: sync, box: box };
}

// A submenu that holds one choice.
// Caution: **Do not go back to a `<select>`** (see the header above). The value is kept here, so
// the text right of an item and the value passed agree; **a value not in the list falls back to
// the first** (otherwise the mark could be nowhere). `set` copies the document's value without
// `spec.run` (otherwise just opening would change the document). `spec.picks` is a list or a
// function returning one (a growing list, such as the style names), **rebuilt with `paint()`**.
function kspageHoldFly(host, spec) {
  const list = () => (typeof spec.picks === "function" ? spec.picks() : spec.picks);
  const has = (value) => list().some((one) => one[0] === value);
  // Caution: **Taking the list's first must not fail on an empty list** — a function's list is
  // empty before the document is loaded (`form.js`'s style names fill in with `paint()`).
  const first = () => {
    const rows = list();
    return rows.length > 0 ? rows[0][0] : "";
  };
  let at = has(spec.was) ? spec.was : first();
  const fly = kspageFlyout(host, {
    id: spec.id,
    name: spec.name,
    picks: list,
    now: () => at,
    // Caution: **`spec.run` must be optional** — a group that only holds a value has nothing to do
    // on the click, and if required, empty functions would pile up per caller.
    run: (value) => {
      at = value;
      if (spec.run !== undefined) {
        spec.run(value);
      }
      fly.sync();
    },
  });
  return {
    now: () => at,
    set: (value) => {
      at = has(value) ? value : first();
      fly.sync();
    },
    sync: fly.sync,
    // Caution: **Call it when the list grows or shrinks** (needed only for a function). A current
    // value no longer in the list falls back to the first, so the mark is never nowhere.
    paint: () => {
      if (!has(at)) {
        at = first();
      }
      fly.paint();
    },
  };
}

// Turns a group written in the HTML into a submenu: **the item pointed at is made in one place,
// above** (copied into the HTML, one goes stale; Principle 4), so the HTML holds
// `data-fly="the name"` and only the contents.
// Caution: **Leave the fields and explanations in the HTML** (`placeholder`, `title`), and **move
// the contents into the box**, or they flow under the item and each closed group widens the menu.
function kspageFlyGroups(root) {
  for (const host of Array.from(root.querySelectorAll("[data-fly]"))) {
    // **Put the id on the group itself** — on the container, `getElementById` returns the
    // `position:relative` box and the size check passes without looking at the contents.
    const id = host.id;
    host.removeAttribute("id");
    const rows = Array.from(host.childNodes);
    const box = kspageFlyout(host, { id: id, name: host.dataset.fly }).box;
    for (const row of rows) box.appendChild(row);
  }
}

// The grid for choosing a table's size: pointing highlights every cell up to it, the count shows
// beside it, and a click sets the size — **Word's form** (Insert ▸ Table), **columns first**
// ("4 × 3" is four across). `spec.cols` × `spec.rows` is its extent (Word stops at 10 × 8),
// `spec.was` the `[rows, cols]` applied first, `spec.run(rows, cols)` the click.
// Caution: **Pointing is not choosing** — leaving the grid, the highlight goes back to the applied.
function kspageGridPick(host, spec) {
  const box = document.createElement("div");
  box.className = "grid-pick";
  box.id = spec.id;
  box.setAttribute("role", "grid");
  box.style.gridTemplateColumns = `repeat(${spec.cols}, var(--grid-cell))`;
  const say = document.createElement("div");
  say.className = "grid-say";
  let at = spec.was.slice();
  const cells = [];
  const light = (r, c) => {
    for (const one of cells) {
      one.el.classList.toggle("on", one.r <= r && one.c <= c);
    }
    say.textContent = `${c} × ${r}`;
    say.title = `${c} columns × ${r} rows`;
  };
  for (let r = 1; r <= spec.rows; r += 1) {
    for (let c = 1; c <= spec.cols; c += 1) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "grid-cell";
      el.setAttribute("aria-label", `${c} columns × ${r} rows`);
      el.addEventListener("mouseenter", () => light(r, c));
      el.addEventListener("focus", () => light(r, c));
      el.addEventListener("click", () => {
        at = [r, c];
        light(r, c);
        spec.run(r, c);
      });
      cells.push({ r: r, c: c, el: el });
      box.appendChild(el);
    }
  }
  box.addEventListener("mouseleave", () => light(at[0], at[1]));
  host.appendChild(box);
  host.appendChild(say);
  light(at[0], at[1]);
  return {
    now: () => at.slice(),
    set: (r, c) => {
      at = [r, c];
      light(r, c);
    },
  };
}
