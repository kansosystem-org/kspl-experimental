# Your first ksmd document

**This walk takes about twenty minutes. You need a browser, and a clone of this repository that builds** ([`docs/HOWTO-build.md`](../../docs/HOWTO-build.md)). It ends with a saved document that holds a heading, a table that calculates, a chart and a diagram.

On Windows, run the commands in the UCRT64 terminal that the build uses.

## 1. Build ksmd

From the repository's root:

```sh
make ksmd
```

It builds the page, the local server and the launcher. Its last lines say how to tie `.ksmd` files to ksmd:

```text
# tie it for your user:
#   make install-desktop  (make install does it too)
```

You need not tie them for this walk.

## 2. Make a document and open it

A ksmd document is a text file whose first line is `%ksmd 1`. Make an empty one in a folder of its own, then open it:

```sh
mkdir -p ~/ksmd-try
printf '%%ksmd 1\n' > ~/ksmd-try/trip.ksmd
make ksmd-open FILE=$HOME/ksmd-try/trip.ksmd
```

The browser opens the page. The menu bar reads File, Edit, View, Insert, Format and Table, and the document's name, `trip.ksmd`, stands at its right. The folder `~/ksmd-try` is the document's workspace: every file it names stays inside it.

## 3. Write a heading and a paragraph

1. Press in the empty document.
2. Press `Ctrl`+`Alt`+`1`, and type `Trip budget`. The line becomes a heading.
3. Press `Enter`, and type `Costs for the spring trip.`
4. Press `Enter` again.

The menu bar now reads "Not saved." beside the name. Your edits are held as a draft in this browser until you save.

## 4. Make a table that calculates

1. Choose Insert ▸ Table. A table of three columns and two rows appears, with its first name open.
2. Type `Item`, press `Tab`, type `Price`, press `Tab`, type `Qty`, and press `Enter`.
3. Press the first cell under Item. Type `Train`, `Tab`, `120`, `Tab`, `2`, and `Enter`.
4. Press the first cell of the second row. Type `Hotel`, `Tab`, `80`, `Tab`, `3`, and `Enter`.
5. Press a cell under Qty, and choose Table ▸ Insert column right.
6. Press the new column's name twice, type `Total`, and press `Enter`.
7. Press the first cell under Total, type `=B1*C1`, and press `Enter`.
8. Press the cell under it, type `=B2*C2`, and press `Enter`.

Both totals show `240`. Open a total's cell with two presses, and it shows its formula again.

## 5. Draw a chart of the table

Press a cell of the table, and choose Table ▸ Table ▸ Insert chart. A bar chart of the prices, labelled Train and Hotel, appears after the table. Its Edit button changes what it draws.

## 6. Draw a diagram

1. Press at the end of the line `Costs for the spring trip.`, and choose Insert ▸ Diagram. An empty drawing area appears under that line.
2. Press Box in the area's tools, then drag across the area's upper left. A box appears.
3. Press Box again, and drag across the area's upper right.
4. Press Arrow, then drag from the first box to the second. An arrow joins them.
5. Press the first box twice, type `Home`, and press `Ctrl`+`Enter`.
6. Press the second box twice, type `Station`, and press `Ctrl`+`Enter`.

Drag a box: its arrow follows it.

## 7. Save, and read the file

Press `Ctrl`+`S`. "Not saved." goes. Then, in the terminal:

```sh
cat ~/ksmd-try/trip.ksmd
```

It prints the document as ksmd writes it, ready to read and to diff:

```text
%ksmd 1

# Trip budget

Costs for the spring trip.

:::diagram size="800,400"
box id="s1" at="40,40" size="160,80" text="Home"
box id="s2" at="400,40" size="160,80" text="Station"
arrow from="s1" to="s2"
:::

:::table name="table1"
| "Item" | "Price" | "Qty" | "Total" |
| "Train" | 120 | 2 | =B1*C1 |
| "Hotel" | 80 | 3 | =B2*C2 |
:::

:::chart table="table1" kind="bar" labels="Item" values="Price"
:::
```

Where you moved a box, its `at` differs.

## 8. Print it, or save a PDF

Press `Ctrl`+`P`. The browser's print dialog shows the document without the menus, the column letters and the buttons. Its destination "Save as PDF" writes a PDF.

## 9. Stop the server

The launcher left the local server running for the workspace, so the next opening is quick. To stop it:

```sh
./out/ksmd.exe --stop-all
```

## What next

* **Look a task up** in the reference, [`SPEC-editing-page.md`](SPEC-editing-page.md). It lists every command, its key, and every function a formula can call.
* **Open a fuller example**: `make ksmd-open FILE=ksmd/examples/overview.ksmd`.
* **Write your own functions in KSPL**, and call them from a formula: "Write your own functions" in [`ksmd/README.md`](../README.md).
