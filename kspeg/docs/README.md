# kspeg/docs

**The documents `kspeg` carries, and three example grammars.** Start from the package's entry point, [`kspeg/README.md`](../README.md), which says what kspeg is and how to run it.

## What is here

* [`kspeg/docs/DESIGN.md`](DESIGN.md) — why the engine took this shape, and what each choice gives up.
* [`kspeg/docs/SPEC-notation.md`](SPEC-notation.md) — how to write a grammar (Part I), and what an engine must do (Part II).
* [`kspeg/docs/kspeg.kspeg`](kspeg.kspeg) — the notation written in itself: the normative grammar (the one that defines the notation) that `SPEC-notation.md` refers to.
* [`kspeg/docs/json.kspeg`](json.kspeg) — JSON, the shortest complete grammar: read it before writing one.
* [`kspeg/docs/script.kspeg`](script.kspeg) — a small scripting language: keywords, comments, operator precedence and string interpolation.

The package's API is not listed here. `ksplc doc kspeg` lists every file, and `ksplc doc kspeg/<file>` prints the declarations one file publishes, read from the source each time.

## Further reading

* [`kspeg/README.md`](../README.md) — what the package is, and the smallest way to use it.
* [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md) — what each kind of document is for, and the direction references may run in.
