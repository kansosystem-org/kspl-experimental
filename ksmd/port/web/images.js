// ksmd page: an image's own tools beside the drawing ones: its width, its caption and its
// alternate text.
// An image's width is a share of the text width. Its height follows, so the picture
// keeps its shape. A drag of the handle at the picture's lower right corner sets it, and so does
// Width… in the image's tools, as a number; an empty answer fits the image to the text again.
// Images side by side that each have a width share a row while their widths fit, as pictures in
// a line of Word's text do (`.figure.sized` in `page.css`). The file keeps it as `width="40%"`
// on the image's clause (`set_image_width` in `ksmd/edit/editor_drawings.kspl`).
// Caption… gives the image a caption, which a reference names (`[#](#caption)`), and Alt text…
// the words a screen reader says. An image goes in with neither, so nothing is asked then.
"use strict";

function ksmdImages(ks) {
  const blockOf = (fig) => ks.view.blocks().indexOf(fig);
  // The width a share is of: the text's, inside the document's padding.
  const textWidth = (fig) => {
    const doc = fig.parentElement;
    const s = getComputedStyle(doc);
    return doc.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
  };
  const set = (fig, percent) => ks.act("ksmd_web_image_width", blockOf(fig), percent);

  // Each image the page can edit gets its handle and its Width… button, once per drawing.
  function add() {
    for (const fig of ks.root.querySelectorAll("#doc > .figure")) {
      const pic = fig.querySelector(".picture");
      const bar = fig.querySelector(".draw-tools");
      if (!pic || !bar || pic.querySelector(".size-handle")) continue;
      const handle = document.createElement("span");
      handle.className = "size-handle";
      handle.title = "Drag to change the image's width";
      pic.appendChild(handle);
      for (const [cls, label, title] of [
        ["image-width", "Width…", "The image's width, as a share of the text width"],
        ["image-caption", "Caption…", "A caption under the image, which a reference can name"],
        ["image-alt", "Alt text…", "Words that describe the image for someone who cannot see it"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.textContent = label;
        b.title = title;
        bar.appendChild(b);
      }
    }
  }
  ks.rendered.push(add);

  // Caption… and Alt text… ask for words, the image's own as they stand now; an empty answer
  // takes them away.
  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".image-caption, .image-alt");
    if (!b || ks.readOnly) return;
    const fig = b.closest(".figure");
    const caption = b.classList.contains("image-caption");
    const now = caption ? (fig.querySelector("figcaption") || { textContent: "" }).textContent
      : fig.dataset.alt || "";
    const typed = window.prompt(caption ? "The caption under the image. Leave it empty for none." :
      "Describe the image for someone who cannot see it. Leave it empty if it only decorates.", now);
    if (typed === null) return;
    const words = typed.replace(/\s+/g, " ").trim();
    const r = ks.act("ksmd_web_image_words", blockOf(fig), caption ? 1 : 0, ks.put(words));
    if (r && !r.ok) ks.say(r.why);
  });

  ks.root.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".image-width");
    if (!b || ks.readOnly) return;
    const fig = b.closest(".figure");
    const now = fig.classList.contains("sized") ? parseInt(fig.style.getPropertyValue("--image-width"), 10) : "";
    const typed = window.prompt("The image's width, in percent of the text width, 1 to 100. " +
      "Leave it empty to fit the text width.", String(now));
    if (typed === null) return;
    const text = typed.trim().replace(/%$/, "");
    const n = Number(text);
    if (text !== "" && !(Number.isInteger(n) && n >= 1 && n <= 100)) {
      ks.say("The width is a whole number from 1 to 100, the percent of the text width.");
      return;
    }
    set(fig, text === "" ? 0 : n);
  });

  // A drag of the handle shows the new width as it goes, and sends it when the button comes up.
  ks.root.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest && e.target.closest(".size-handle");
    if (!handle || ks.readOnly || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const fig = handle.closest(".figure");
    const full = textWidth(fig);
    const start = fig.querySelector(".picture").getBoundingClientRect();
    const x0 = e.clientX;
    let percent = null;
    const move = (m) => {
      const px = Math.max(16, start.width + m.clientX - x0);
      percent = Math.max(1, Math.min(100, Math.round((px / full) * 100)));
      fig.classList.add("sized");
      fig.style.setProperty("--image-width", `${percent}%`);
      ks.say(`Width ${percent}% of the text`);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      if (percent !== null) set(fig, percent);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }, true);
}
