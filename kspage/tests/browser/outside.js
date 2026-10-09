// Pictures: drawn when put in, and an outside one not fetched unasked.

function kspageProbeOutside(ks) {
  const { check, report, app, canvas, ime } = ks;

  // 29. It puts a picture in — is it drawn on the canvas?
  //
  // **This can be seen nowhere else**: reading a picture and drawing it are the page's side (it
  // breaks as "it went in and nothing comes out"). A `data:` picture is used, as a headless browser
  // has no network.
  const RED_DOT = "data:image/gif;base64," +
    "R0lGODlhAQABAIAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
  document.getElementById("image-src").value = RED_DOT;
  document.getElementById("image-w").value = "40";
  document.getElementById("image-h").value = "20";
  ime.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  document.getElementById("put-image").click();
  check(app.save().indexOf("\"image\": \"data:image/gif") >= 0,
    "the button is wired to inserting a picture");
  check(app.save().indexOf("\"image_w\": 40") >= 0, "the size goes into the document too");
  // **Until it is loaded there is a frame alone**; read, it is drawn afresh, so it waits that far.
  const redInCanvas = () => {
    const g = canvas.getContext("2d");
    const p = g.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i] > 200 && p[i + 1] < 80 && p[i + 2] < 80) n += 1;
    }
    return n;
  };

  // It waits for the picture to be drawn, then puts the marks out.
  // Caution: **Do not look once and give up** (the load is asynchronous); the looks are capped, so
  // a picture that never draws still ends the section.
  let looked = 0;
  const watch = setInterval(function () {
    looked += 1;
    const red = redInCanvas();
    if (red > 0 || looked > 40) {
      clearInterval(watch);
      check(red > 0, "the picture put in comes out on the canvas (" + red + " pixels)");
      report();
    }
  }, 50);

  // 30b. A picture on an outside server is not fetched on the beat of opening.
  //
  // **This can be seen nowhere else**: fetching is the page's side.
  // Caution: **It breaks in the shape of leaking silently** — fetched, that the document was
  // opened, and where, both go to the other side with nothing on the screen (a tracking pixel).
  // With no network, "could it be read" tells them apart, by **the count stopped**.
  document.getElementById("image-src").value = "https://example.invalid/pixel.png";
  document.getElementById("image-w").value = "10";
  document.getElementById("image-h").value = "10";
  document.getElementById("put-image").click();
  const heldPics = ks.hold();
  setTimeout(function () {
    app.resize(canvas.clientWidth || 800);
    check(app.picturesHeld() > 0,
      "an outside picture is not fetched by default (" + app.picturesHeld() + ")");
    // Permit it and it is fetched.
    // Note: **Not remembering it** is that side's settlement
    // (`port/web/side.js`).
    const box = document.getElementById("over-pics");
    box.checked = true;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    app.resize(canvas.clientWidth || 800);
    check(app.picturesHeld() === 0, "permitted, it is fetched");
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    heldPics();
  }, 300);
}
