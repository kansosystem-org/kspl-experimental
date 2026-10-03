# kspeg/docs

**The documents `kspeg` carries.** Each is reached from the package's entry point, [`kspeg/README.md`](../README.md).

## What is here

* [`kspeg/docs/DESIGN.md`](DESIGN.md) — why the engine took this shape, and what each choice gives up.
* [`kspeg/docs/SPEC-notation.md`](SPEC-notation.md) — the notation, and the requirements an engine has to meet.
* [`kspeg/docs/kspeg.kspeg`](kspeg.kspeg) — the notation written in itself: the normative grammar `SPEC-notation.md` refers to.
* [`kspeg/docs/json.kspeg`](json.kspeg) — JSON, as a complete grammar to read before writing one.
* [`kspeg/docs/script.kspeg`](script.kspeg) — a small scripting language: keywords, comments, operator precedence and string interpolation.

What the package publishes is not written here: `ksplc doc kspeg` lists every file, and `ksplc doc kspeg/<file>` gives one file's declarations, rendered from the sources when asked.

## Further reading

* [`kspeg/README.md`](../README.md) — what the package is, and the smallest way to use it.
* [`docs/SPEC-documents.md`](../../docs/SPEC-documents.md) — what each kind of document is for, and the direction references may run in.
