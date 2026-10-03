// ==========================================
// kspage's page — the split view that shows another part of the same document at the same time.
// **It is a read-only window**: the core has one cursor (`Editor` in `write/edit.kspls`), so it
// pins the clicked place while editing goes on in the body. **The width is the body's**, so there
// is one layout and the split view only crops and draws it (`draw.js`'s `paintCrop`); with two,
// both would lay out on every keystroke. **Another document is another window**
// (`../../docs/DESIGN.md`'s "Accepted limit 2: another document cannot be shown inside one
// window").
// ==========================================
function kspagePeek(ui) {
  const app = ui.app;
  const say = ui.say, deny = ui.deny;
  const band = document.getElementById("peek");
  const face = document.getElementById("peek-page");
  const at = document.getElementById("peek-at");

  // The pinned place, **in document coordinates** (the window's scroll changes with the browser's
  // zoom, so it would show a different place the moment the page is zoomed).
  let top = 0;
  let open = false;

  // The document height at the body window's top edge, **measured from below the pinned header**
  // (it covers the canvas; not counted, it would pin above what is visible).
  const nowAtTop = () => {
    const page = document.getElementById("page");
    const room = app.headRoom ? app.headRoom() : 0;
    const rect = page.getBoundingClientRect();
    return Math.max(0, room - rect.top);
  };

  // Draws the split view; **nothing when it is closed** (nothing is cropped for a closed window).
  const paint = () => {
    if (!open) {
      return;
    }
    const tall = face.clientHeight || 160;
    app.paintPeek(face, top, tall);
    at.textContent = `from ${Math.round(top)}px`;
  };

  // Caution: **The menu item must say which state it is in now** ("Split view" alone cannot tell
  // opening from closing, and an item inside a submenu shows no check mark).
  const flipKey = document.getElementById("peek-flip");
  const showFlip = () => {
    flipKey.textContent = open ? "Close" : "Pin it below";
    flipKey.title = open ? "Closes the split view" : "Pins the position shown now below";
  };
  showFlip();

  const flip = () => {
    open = !open;
    band.hidden = !open;
    showFlip();
    if (!open) {
      say("Closed the split view");
      app.focus();
      return;
    }
    top = nowAtTop();
    paint();
    say("Pinned the position shown now into the split view");
    app.focus();
  };

  // A way to pin it again (otherwise looking elsewhere means closing and reopening).
  const pin = () => {
    if (!open) {
      deny("The split view is closed");
      return;
    }
    top = nowAtTop();
    paint();
    say("Pinned the split view again to the position shown now");
    app.focus();
  };

  // The wheel over the split view moves the pinned place (else a small shift means pinning again).
  // Caution: **Do not scroll the body** (the event is stopped for that).
  face.addEventListener("wheel", (e) => {
    if (!open) {
      return;
    }
    e.preventDefault();
    top = Math.max(0, Math.min(top + e.deltaY, Math.max(0, app.docHeight() - 1)));
    paint();
  }, { passive: false });

  flipKey.addEventListener("click", flip);
  document.getElementById("peek-pin").addEventListener("click", pin);

  return { peekPaint: paint };
}
