// ksmd page: the contents, a panel that lists the document's headings, as GitHub's outline does.
// Each heading is a link that scrolls to it, indented by its level. The heading being read is
// marked as the page scrolls, and the list follows every edit. Headings shown from an included
// file stand in their place, marked with their file's path.
// Whether the panel shows, and how wide it is, are the viewer's choices, kept in this browser's
// storage and never in the document: another reader of the file keeps their own.
// The edge between the panel and the document drags, as VS Code's side bar does. Left and Right
// move it while it has the focus, Home and End go to the limits, and a double-click gives the first
// width back. The document always keeps 400 pixels; a window too narrow lays the panel over it.
"use strict";

function ksmdContents(ks) {
  const panel = document.querySelector(".contents");
  if (!panel) return;
  const list = panel.querySelector(".contents-list");
  const edge = document.querySelector(".contents-edge");
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
    edge.hidden = !on;
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

  // The panel's width in pixels: from 160 to 480, and never so wide that the document beside it
  // has fewer than 400. Below 48rem the panel lies over the document, which keeps 48 pixels.
  const WIDTH_KEY = "ksmd.contents-width";
  const FIRST = 240;
  const LEAST = 160;
  let width = FIRST;
  const most = () => {
    const over = window.matchMedia("(max-width: 48rem)").matches;
    return Math.max(LEAST, Math.min(480, window.innerWidth - (over ? 48 : 400)));
  };
  function setWidth(px, remember) {
    width = Math.round(Math.max(LEAST, Math.min(most(), px)));
    document.documentElement.style.setProperty("--contents-width", `${width}px`);
    edge.setAttribute("aria-valuenow", String(width));
    edge.setAttribute("aria-valuemin", String(LEAST));
    edge.setAttribute("aria-valuemax", String(most()));
    if (remember) {
      try {
        localStorage.setItem(WIDTH_KEY, String(width));
      } catch (_) { /* storage is off: the width lasts while the page is open */ }
    }
  }
  edge.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    if (e.detail >= 2) {
      setWidth(FIRST, true);
      return;
    }
    const x0 = e.clientX;
    const w0 = width;
    edge.classList.add("dragging");
    const move = (m) => setWidth(w0 + m.clientX - x0, false);
    const up = (u) => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      edge.classList.remove("dragging");
      setWidth(w0 + u.clientX - x0, true);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
  edge.addEventListener("keydown", (e) => {
    const to = { ArrowLeft: width - 16, ArrowRight: width + 16, Home: LEAST, End: most() }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    setWidth(to, true);
  });
  // A window made narrower keeps the document's room.
  window.addEventListener("resize", () => setWidth(width, false));
  try {
    const kept = Number(localStorage.getItem(WIDTH_KEY));
    setWidth(kept > 0 ? kept : FIRST, false);
  } catch (_) {
    setWidth(FIRST, false);
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
