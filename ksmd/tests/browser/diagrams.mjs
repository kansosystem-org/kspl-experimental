// A diagram: Insert, Diagram, its tools that draw shapes and the arrows between them, moving a
// shape with its arrows, a group carrying what it holds, a shape's words, Delete and undo. Each is
// driven through the browser's own input events, as `main.mjs` drives the rest, and checked by the
// saved source.
// `diagrams(t)` takes the driver's calls and `main.mjs`'s helpers, and returns its sections.
import { CTRL, H, check } from "./drive.mjs";


export function diagrams({ page, js, settle, press, type, click, menu, load, saves, source }) {
  // A place in the diagram's own pixels, on the page.
  const at = async (x, y) => {
    const [left, top] = await js("(() => { const r = document.querySelector('#doc .diagram svg')" +
      ".getBoundingClientRect(); return [r.left, r.top]; })()");
    return [left + x, top + y];
  };
  const mouse = (type, [x, y], buttons = 0) =>
    page("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
  // A press at one place in the diagram, a move to another in steps, and a release there.
  async function dragIn(x0, y0, x1, y1) {
    const a = await at(x0, y0);
    const b = await at(x1, y1);
    await mouse("mousePressed", a, 1);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      await mouse("mouseMoved", [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], 1);
    }
    await mouse("mouseReleased", b);
    await settle();
  }
  async function pressIn(x, y) {
    const p = await at(x, y);
    await mouse("mousePressed", p, 1);
    await mouse("mouseReleased", p);
    await settle();
  }
  // The diagram's lines in the saved source, without its opening and closing lines.
  const parts = async () => {
    const lines = (await source()).split("\n");
    const from = lines.findIndex((l) => l.startsWith(":::diagram"));
    return lines.slice(from + 1, lines.indexOf(":::", from)).join("|");
  };

  return {
    async diagram() {
      await load(`${H}Intro\n`);
      await click("#doc p");
      await menu("diagram");
      check(/:::diagram size="800,400"\n:::\n/.test(await source()), "Insert, Diagram puts an empty diagram in",
        await source());
      await click('#doc .diagram [data-tool="box"]');
      await dragIn(40, 40, 200, 120);
      await click('#doc .diagram [data-tool="box"]');
      await pressIn(400, 200);
      check(await parts() === 'box id="s1" at="40,40" size="160,80"|box id="s2" at="400,200" size="160,80"',
        "the Box tool draws a box by a drag, and one of its own size by a press", await parts());
      await click('#doc .diagram [data-tool="arrow"]');
      await dragIn(100, 80, 470, 240);
      check((await parts()).endsWith('|arrow from="s1" to="s2"'), "the Arrow tool joins the two shapes it is dragged between",
        await parts());
      await dragIn(470, 240, 570, 270);
      check((await parts()).includes('box id="s2" at="500,230"') && (await parts()).endsWith('arrow from="s1" to="s2"'),
        "a moved box keeps its arrow", await parts());
      // Two presses on a shape write its words; Ctrl+Enter takes them.
      await pressIn(100, 80);
      await pressIn(100, 80);
      check(await js("document.activeElement.classList.contains('diagram-text')"),
        "a second press on a shape opens a box for its words");
      await type("MENU");
      await press("Enter");
      await type("1.SET");
      await press("Enter", CTRL);
      await settle();
      check((await parts()).includes('box id="s1" at="40,40" size="160,80" text="MENU\\n1.SET"'),
        "its words take the lines typed", await parts());
      await click('#doc .diagram [data-act="mono"]');
      check((await parts()).includes('text="MENU\\n1.SET" font="mono"'), "Mono gives them a fixed-width font",
        await parts());
      await pressIn(560, 250);
      await press("Delete");
      check(await parts() === 'box id="s1" at="40,40" size="160,80" text="MENU\\n1.SET" font="mono"',
        "Delete takes the chosen box away, and its arrow with it", await parts());
      await press("z", CTRL);
      check((await parts()).endsWith('arrow from="s1" to="s2"'), "one undo brings both back", await parts());
      // A group carries the shapes it holds whole.
      await load(`${H}:::diagram size="600,300"\ngroup id="g" at="20,20" size="300,200"\n` +
        'box id="a" at="40,60" size="100,60"\n:::\n');
      await dragIn(250, 190, 300, 210);
      await saves("a moved group carries the box inside it", `${H}:::diagram size="600,300"\n` +
        'group id="g" at="70,40" size="300,200"\nbox id="a" at="90,80" size="100,60"\n:::\n');
      check(await js("document.querySelectorAll('#doc .diagram svg [data-fig]').length") === 2,
        "the page draws each shape");
    },
  };
}
