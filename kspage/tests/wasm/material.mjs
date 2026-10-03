// It builds the documents the sections load themselves.
//
// Caution: **Do not make the document at start-up the material.** That is the product's sample
// (`kspage/content/sample.kspls`), and it changes when what is to be shown changes: **changing one
// paragraph of the sample makes a check sticking to it fall**, and the fallen side does not tell
// whether "a settlement broke" or "the sample changed". Held here, the material moves only with
// the checks.
//
// **Do not copy the key names over here.** What is taken is dropped into JSON as it stands, so a
// field growing in the shape saved leaves nothing here to change (the canon is
// `kspage/share/store.kspls`).
// **Do not share one document between sections** — a paragraph added for one section moves
// another's measures (the same way of breaking as sticking to the sample). The tools that build
// them are what is shared.
//
// The style names the sections reach for are the document's (`kspage/content`'s sample and
// `kspage/share/markdown_look.kspls`), so they stay as they are until those sides move.

// A head is a style's name alone, or the fields (a block holding `name` / `columns` / `frame`
// takes the fields).
const head_of = (head) => typeof head === "string" ? { style: head } : head;

// A run is its text alone, or one holding a style (`["the text", "the style"]`).
const run_of = (r) => typeof r === "string" ? { text: r } : { text: r[0], style: r[1] };

// A block holding text.
export const para = (head, ...runs) =>
  ({ ...head_of(head), inlines: runs.map(run_of) });

// A block holding children (nesting, columns, a slide's slide, a table).
export const group = (head, ...kids) => ({ ...head_of(head), children: kids });

// A table. **A row is a block holding no style** (a settlement of the shape saved, and this is
// the one place that knows it). Each row is handed over as an array of the cells' blocks.
export const grid = (head, ...rows) =>
  group(head, ...rows.map((cells) => group("", ...cells)));

// One text a section loads. **The version is the version of the shape saved**
// (`kspage/share/store.kspls`).
export const material = ({ root, styles, blocks }) =>
  JSON.stringify({ kspage: 6, sheet: { root: root, styles: styles }, blocks: blocks });
