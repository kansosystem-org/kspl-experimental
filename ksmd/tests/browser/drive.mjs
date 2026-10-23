// What the browser checks share: the verdict lines, and driving one tab through the browser's own
// key and mouse events. `driver(page)` takes a tab from `cdp.mjs`.

// The one place that builds a verdict's line: marker, section, then what was confirmed or skipped.
export const verdict = {
  part: "",
  failed: 0,
  check(ok, what, detail = "") {
    const head = `${ok ? "pass" : "FAIL"} ${this.part}: ${what}`;
    console.log(ok || detail === "" ? head : `${head}: ${detail}`);
    if (!ok) this.failed += 1;
  },
  // A step that could not run here, named so that a green run does not hide it.
  skip(what) {
    console.log(`SKIP ${this.part}: ${what}`);
  },
};

// Keys by name: Windows's key code, and the text the key types.
const KEYS = {
  Enter: [13, "\r"], Backspace: [8, ""], Delete: [46, ""], Tab: [9, ""], Escape: [27, ""],
  ArrowUp: [38, ""], ArrowDown: [40, ""], ArrowLeft: [37, ""], ArrowRight: [39, ""], End: [35, ""],
  Home: [36, ""], F10: [121, ""],
};
export const CTRL = 2;
export const SHIFT = 8;
export const ALT = 1;

export function driver(page) {
  async function js(expression) {
    const r = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const e = r.exceptionDetails;
      throw new Error(e.exception && e.exception.description ? e.exception.description : e.text);
    }
    return r.result.value;
  }

  const settle = () => js("new Promise((r) => setTimeout(r, 20))");

  // Waits until an expression holds, up to `ms`; a page still loading counts as not holding.
  async function until(expression, ms = 10000) {
    for (let waited = 0; waited < ms; waited += 50) {
      try {
        if (await js(expression) === true) return true;
      } catch (_) { /* the page is between two documents */ }
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }

  async function press(key, modifiers = 0) {
    let vk;
    let text;
    let code;
    if (KEYS[key]) {
      [vk, text] = KEYS[key];
      code = key;
    } else if (/^[a-z0-9]$/i.test(key)) {
      vk = key.toUpperCase().charCodeAt(0);
      text = key;
      code = /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
    } else {
      // Punctuation has no key code of its own here: a code such as 33 would be Page Up.
      vk = 0;
      text = key;
      code = "";
    }
    const typing = text !== "" && (modifiers & (CTRL | ALT)) === 0;
    const event = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
    await page("Input.dispatchKeyEvent", typing ?
      { ...event, type: "keyDown", text, unmodifiedText: text } : { ...event, type: "rawKeyDown" });
    await page("Input.dispatchKeyEvent", { ...event, type: "keyUp" });
  }

  // Types ASCII text one key at a time, as a keyboard does.
  async function type(text) {
    for (const ch of text) await press(ch === "\n" ? "Enter" : ch);
  }

  // Puts the selection on text by UTF-16 offsets into a block's text (an item's in a list), as a
  // person's click or drag would.
  function select(block, item, from, to = from) {
    return js(`(() => {
      const doc = document.getElementById("doc");
      doc.focus();
      const blocks = Array.from(doc.children).filter((e) => !e.classList.contains("gap"));
      let el = blocks[${block}];
      if (el.classList.contains("list")) el = el.children[${item}];
      const at = (n) => {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let left = n;
        for (let t = walk.nextNode(); t; t = walk.nextNode()) {
          if (left <= t.data.length) return [t, left];
          left -= t.data.length;
        }
        return [el, el.childNodes.length];
      };
      const [a, ao] = at(${from});
      const [f, fo] = at(${to});
      window.getSelection().setBaseAndExtent(a, ao, f, fo);
    })()`);
  }

  async function clickAt(x, y, modifiers = 0) {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await page("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, modifiers });
    }
  }

  async function click(selector, modifiers = 0) {
    const box = await js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    await clickAt(box[0], box[1], modifiers);
  }

  // Where an element's middle stands on the page.
  const middle = (selector) => js(`(() => {
    const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);

  // Moves the pointer over the middle of an element, with no button down.
  async function point(selector) {
    const [x, y] = await middle(selector);
    await page("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  }

  // Two presses at one place, as a double-click sends them.
  async function doubleClickAt(x, y) {
    for (const clickCount of [1, 2]) {
      for (const type of ["mousePressed", "mouseReleased"]) {
        await page("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount });
      }
    }
  }

  // A press of the right button at an element's middle, which opens a context menu.
  async function rightClick(selector) {
    const [x, y] = await middle(selector);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await page("Input.dispatchMouseEvent", { type, x, y, button: "right", clickCount: 1 });
    }
  }

  // Presses a command in the menu bar as a person does: the menu's name, the flyout's name where
  // the command stands in one, then the command.
  async function menu(cmd) {
    const own = `[data-cmd="${cmd}"]`;
    const item = `.menubar ${own}`;
    await click(`.top-menu:has(${own}) > .menu-name`);
    if (await js(`!!document.querySelector('${item}').closest(".sub")`)) {
      await click(`.menubar .sub:has(${own}) > .sub-name`);
    }
    await click(item);
  }

  // A press at the middle of an element, a move to the right by `dx` pixels in two steps, and a
  // release there, as a person's drag.
  async function drag(selector, dx) {
    const [x, y] = await js(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    })()`);
    await page("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    for (const part of [0.5, 1]) {
      await page("Input.dispatchMouseEvent",
        { type: "mouseMoved", x: x + dx * part, y, button: "left", buttons: 1 });
    }
    await page("Input.dispatchMouseEvent",
      { type: "mouseReleased", x: x + dx, y, button: "left", clickCount: 1 });
  }

  // A press in the document below its last block.
  async function clickBelow() {
    const at = await js(`(() => {
      // The page's bottom can stand below the window under a tall header; it is scrolled in.
      window.scrollTo(0, document.documentElement.scrollHeight);
      const r = document.getElementById("doc").getBoundingClientRect();
      return [r.left + r.width / 2, Math.min(r.bottom, window.innerHeight - 40) - 8];
    })()`);
    await clickAt(at[0], at[1]);
  }

  return { page, js, settle, until, press, type, select, click, clickAt, clickBelow, drag, menu, point,
    doubleClickAt, rightClick };
}
