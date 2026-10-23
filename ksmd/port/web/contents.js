// ksmd page: the contents, a panel that lists the document's headings, as GitHub's outline does.
// Each heading is a link that scrolls to it, indented by its level. The heading being read is
// marked as the page scrolls, and the list follows every edit. Headings shown from an included
// file stand in their place, marked with their file's path.
// Whether the panel shows is the viewer's choice, kept in this browser's storage and never in the
// document: another reader of the file keeps their own.
"use strict";

function ksmdContents(ks) {
  const panel = document.querySelector(".contents");
  if (!panel) return;
  const list = panel.querySelector(".contents-list");
  const KEY = "ksmd.contents";
  // The heading elements the list shows, in the document's order.
  let heads = [];
  // What the list was built from, so an edit that changes no heading builds nothing.
  let built = null;

  const shown = () => !panel.hidden;

  function build() {
    if (!shown()) return;
    heads = Array.from(ks.root.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter((h) => !h.classList.contains("gap"));
    const from = (h) => {
      const box = h.closest(".include");
      return box ? box.dataset.path : "";
    };
    const key = heads.map((h) => `${h.tagName}\u0000${h.textContent}\u0000${from(h)}`).join("\u0001");
    if (key !== built) {
      built = key;
      list.textContent = "";
      heads.forEach((h, k) => {
        const li = document.createElement("li");
        li.className = `level-${h.tagName[1]}`;
        const a = document.createElement("a");
        a.href = "#";
        a.dataset.k = String(k);
        a.textContent = h.textContent;
        li.appendChild(a);
        const path = from(h);
        if (path) {
          li.classList.add("included");
          const note = document.createElement("span");
          note.className = "from";
          note.textContent = path;
          note.title = `From the included file ${path}`;
          li.appendChild(note);
        }
        list.appendChild(li);
      });
      if (heads.length === 0) {
        const li = document.createElement("li");
        li.className = "none";
        li.textContent = "No headings yet. A heading made with Ctrl+Alt+1 to 6 shows here.";
        list.appendChild(li);
      }
    }
    current();
  }

  // Marks the last heading above the top of the reading area: the one being read.
  function current() {
    if (!shown()) return;
    const top = document.querySelector(".top");
    // A heading scrolled to stands 8 pixels under the header (`scroll-margin-top`).
    const line = (top ? top.getBoundingClientRect().bottom : 0) + 12;
    let lo = 0;
    let hi = heads.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (heads[mid].getBoundingClientRect().top <= line) lo = mid + 1;
      else hi = mid;
    }
    // Above the first heading, the first one is marked, so the list always shows a place.
    const at = Math.max(lo - 1, 0);
    for (const a of list.querySelectorAll("a[aria-current]")) a.removeAttribute("aria-current");
    const a = at >= 0 ? list.querySelector(`a[data-k="${at}"]`) : null;
    if (!a) return;
    a.setAttribute("aria-current", "location");
    const li = a.parentElement;
    if (li.offsetTop < panel.scrollTop || li.offsetTop + li.offsetHeight > panel.scrollTop + panel.clientHeight) {
      panel.scrollTop = li.offsetTop - panel.clientHeight / 2;
    }
  }

  let waiting = false;
  window.addEventListener("scroll", () => {
    if (waiting || !shown()) return;
    waiting = true;
    requestAnimationFrame(() => {
      waiting = false;
      current();
    });
  }, { passive: true });

  // A heading of the document takes the caret at its start, as Word's navigation pane does; one
  // from an included file only scrolls, since it does not edit here.
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-k]");
    if (!a) return;
    e.preventDefault();
    const h = heads[Number(a.dataset.k)];
    if (!h || !h.isConnected) return;
    const block = h.parentElement === ks.root ? ks.view.blocks().indexOf(h) : -1;
    if (block >= 0) {
      ks.root.focus({ preventScroll: true });
      ks.place([0, block, 0, 0]);
    }
    const to = block >= 0 ? ks.view.blocks()[block] : h;
    to.scrollIntoView({ block: "start" });
  });

  function show(on, remember) {
    panel.hidden = !on;
    document.body.classList.toggle("with-contents", on);
    for (const el of document.querySelectorAll('[data-cmd="contents"]')) {
      el.setAttribute("aria-checked", on ? "true" : "false");
    }
    if (remember) {
      try {
        localStorage.setItem(KEY, on ? "1" : "0");
      } catch (_) { /* storage is off: the choice lasts while the page is open */ }
    }
    built = null;
    build();
  }

  panel.querySelector(".contents-close").addEventListener("click", () => show(false, true));
  ks.rendered.push(build);
  let stored = false;
  try {
    stored = localStorage.getItem(KEY) === "1";
  } catch (_) { /* storage is off: the panel starts hidden */ }
  show(stored, false);

  ks.contents = { toggle: () => show(!shown(), true) };
}
