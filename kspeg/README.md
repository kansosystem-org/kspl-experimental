# kspeg

**A parser that reads a PEG grammar and runs it directly**, with no code generation.

## Run it

Read the grammar once, and build one `Target` per input that borrows it. Calling `parse_grammar` per `Target` would rebuild the rule table and a memo table each time. **`Target`s that borrow one grammar parse one at a time**, since they share its memo table (`Target.share_grammar_from`).

```kspls
import "kspeg/engine" as kspeg
import "kspeg/notation" as kspeg_notation

$meta: = kspeg_notation.Meta.new(grammar_text, arena)
parser: = meta.parse_grammar()?
defer parser.free_memo()

$t: = kspeg.Target.new(source, arena)
defer t.free_memo()
t.share_grammar_from(parser)
node: = t.parse_rule("program")?
```

**`make test` runs the tests from this folder** with only a `ksplc` ([`kspeg/Makefile`](Makefile)). kspeg names itself in [`kspeg/ksplc.cfg`](ksplc.cfg), so a copy of this folder alone runs them the same way. A grammar that defines `_Space` and `_Boundary` itself never runs the defaults the engine adds, so only [`kspeg/tests/engine_test.kspls`](tests/engine_test.kspls) tests them. Three complete grammars sit in [`kspeg/docs/`](docs/README.md): the notation's own, JSON's and a small scripting language's.

## What is here

Caution: The dependencies run one way, downward; do not add an `import` in the reverse direction, which makes a cycle.

| File | Role |
| :-- | :-- |
| [`kspeg/notation.kspls`](notation.kspls) | **Reads a `.kspeg` text** into the rule tree and returns a `Target`. |
| [`kspeg/engine.kspls`](engine.kspls) | **Applies the rule tree to input** — backtracking, memoization, whitespace skipping, the profile. |
| [`kspeg/memo.kspls`](memo.kspls) | **What each rule answered at each position** — one table for every input of a grammar, emptied by starting a new generation rather than by zeroing. |
| [`kspeg/expected.kspls`](expected.kspls) | The position that failed and **what could have been written** there; it never advances the input. |
| [`kspeg/rule.kspls`](rule.kspls) | **The rule tree's representation**, and the operations on it alone. |

## Pitfalls

* **Do not mix the two readers.** `kspeg/notation.kspls` is a hand-written recursive descent parser for `.kspeg`'s own notation, separate from `kspeg/engine.kspls`.
* **kspeg reaches only what `std` publishes.** The compiler rejects a name under `std/` not marked `pub` (`cannot access symbol`). Making one `pub` in `std` is a decision to weigh: an engine that only interprets a grammar cannot be swapped out once it depends on `std/`'s internals.
* **Only `try_parse` in `kspeg/engine.kspls` swallows a backtracking signal** ("A backtracking signal may be swallowed, a real failure may not" in [`kspeg/docs/SPEC-notation.md`](docs/SPEC-notation.md)).

## Files near the limit and how they split

No file in kspeg exceeds 900 lines; the nearest is [`kspeg/engine.kspls`](engine.kspls). **Before adding to it, write here what will be split out and where it goes** (`make test-conventions` checks this). How to choose where to cut is "Choosing where to split a file" in [`docs/DESIGN.md`](../docs/DESIGN.md). How kspeg's files are split is "How the engine is split across files" in [`kspeg/docs/DESIGN.md`](docs/DESIGN.md).

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kspeg/docs/SPEC-notation.md`](docs/SPEC-notation.md) | The notation, and the requirements an engine has to meet. | Whoever writes a grammar (Part I alone); whoever writes an engine (the rest) |
| [`kspeg/docs/DESIGN.md`](docs/DESIGN.md) | Why the engine took this shape, and what each choice gives up. | Whoever changes kspeg |
| [`kspeg/docs/README.md`](docs/README.md) | Every document this package carries. | Anyone |
| [`kspeg/SURFACE.txt`](SURFACE.txt) | The record of the published API, remade by `make surface` and held against the tree by `make test-surface` ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)). | Whoever changes kspeg |
| [std](../std/README.md) | The standard library kspeg builds on; `ksplc doc std` lists every file it publishes. | Whoever changes kspeg |
