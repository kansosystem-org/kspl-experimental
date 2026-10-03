// Pictures and the HTML written out.
//
// The style names (`heading`, `code`) and the table name (`detail`) are the document's, so those
// needles follow `kspage/content`.

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
  check(app.html().indexOf("<img src=\"data:image/gif") >= 0,
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

  // **From here on there are three asynchronous things.** Put the marks out only once all are in,
  // or the rest are read before their results.
  const done = { html: false, drawn: false };
  // The sign of progress. **The net looks at this and casts itself again** (`net` below). It is a
  // wait on an event, so not in the "count of waits in flight" of `probe.js`'s `netFor`.
  let moved = 0;
  function maybeReport() {
    moved += 1;
    if (done.html && done.drawn) {
      report();
    }
  }

  // It waits for the picture to be drawn.
  // Caution: **Do not look once and give up** (the load is asynchronous).
  let looked = 0;
  const watch = setInterval(function () {
    looked += 1;
    const red = redInCanvas();
    if (red > 0 || looked > 40) {
      clearInterval(watch);
      check(red > 0, "the picture put in comes out on the canvas (" + red + " pixels)");
      done.drawn = true;
      maybeReport();
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

  // 31. Is the HTML written out drawn by a real browser?
  //
  // **This can be seen nowhere else**: whether the class names and the CSS rules mesh (a wrong
  // escape of a name breaks as "the rules alone do not land").
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:400px;height:200px;border:0";
  frame.addEventListener("load", function () {
    const d = frame.contentDocument;
    const h1 = d.querySelector(".heading");
    check(h1 !== null, "a style's name can be got as a class");
    if (h1) {
      const css = frame.contentWindow.getComputedStyle(h1);
      check(css.fontSize === "28px",
        "a style's setting lands as a CSS rule (" + css.fontSize + ")");
      // Not writing an unset field rides straight onto CSS's inheritance.
      const body = frame.contentWindow.getComputedStyle(d.body);
      check(css.fontFamily === body.fontFamily,
        "an unset field is inherited from the parent (" + css.fontFamily + ")");
    }
    // The line height's ratio. **This can be seen nowhere else. CSS's `line-height` number lands on
    // the font size, while this ratio lands on the font's own, taller line height**, so written as
    // it stands it packs the lines; it must come out taller than the font size × the ratio.
    const code = d.querySelector(".code");
    if (code) {
      const look = frame.contentWindow.getComputedStyle(code);
      const tall = parseFloat(look.lineHeight);
      const size = parseFloat(look.fontSize);
      check(tall > size * 1.35,
        "the line height's ratio lands on the same thing as the screen ("
          + tall + "px / character " + size + "px × 1.35)");
    }
    // **The count is not counted** (it would fall whenever the sample changes); the shape is.
    const cells = d.querySelectorAll("td");
    check(cells.length > 0 && cells.length === d.querySelectorAll("table tr td").length,
      "the cells line up as td inside rows (" + cells.length + ")");
    check(d.body.textContent.indexOf("760") >= 0,
      "a formula cell comes out as the value reckoned");
    // **Where a colgroup can be laid is settled**: written after the rows, the parser moves it, so
    // the nesting got whole is looked at.
    // **A style's name is a class and a table's name is an id**; in the same field a formula
    // pointing by name drags the style in.
    check(d.querySelector("table#detail") !== null, "a table's name can be got as an id");
    const col = d.querySelector("table > colgroup > col");
    check(col !== null,
      "a column's width is parsed as a colgroup directly under the table");
    if (col) {
      check(col.style.width === "64px",
        "the width settled rides on the col (" + col.style.width + ")");
    }
    done.html = true;
    maybeReport();
  });
  // Caution: **Put the text in before adding it to the page.** Added first, a load of the empty
  // page fires ahead and looks where there is no content.
  frame.srcdoc = app.html();
  document.body.appendChild(frame);
  // Finish without waiting it out and no marks come out. It drops it and says so.
  //
  // Caution: **Do not settle the length by hand.** A fixed length races the real load, so in a slow
  // environment **it falls though it has finished**.
  // **While there is progress it casts again**, dropping only after one round with no progress; the
  // outer cap is the `--virtual-time-budget` (`kspage/Makefile`'s `KSPAGE_DUMP_FLAGS`).
  const netMs = 3000;
  let netSeen = -1;
  const net = function () {
    if (moved !== netSeen) {
      netSeen = moved;
      setTimeout(net, netMs);
      return;
    }
    // Caution: **Where nothing is left, say nothing.** The two below name which one is stuck; said
    // on a round where both are in, they attach **behind the result line** -- a place nobody reads
    // (the same settlement as `netFor` in `probe.js`).
    if (done.html && done.drawn) {
      return;
    }
    check(done.html, "the HTML written out is loaded");
    check(done.drawn, "the picture's load finishes");
    done.html = true;
    done.drawn = true;
    report();
  };
  setTimeout(net, netMs);
}
