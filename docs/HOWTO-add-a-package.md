# Adding a package

**This guide adds a new top-level package to the repository**, written here as `ksfoo/`, and wires it into the build, the checks and the documents. You need a clone that builds ([`HOWTO-build.md`](HOWTO-build.md)). Each step says what fails if it is left out; a step that says "nothing fails" is one only a reader would notice.

## The folder itself

1. **`ksfoo/ksplc.cfg` names the package and what it uses**:

   ```
   [package]
   name = ksfoo
   uses = ksai
   ```

   `uses` lists every package it imports besides itself and `std`; a package that imports `ksfoo` adds it to its own `uses`. An import the file does not list stops the compiler with `the package 'ksfoo' does not say it uses 'ksai'`. Without `name`, `make test-extract-rest` fails with "carries a Makefile but names no package in its ksplc.cfg".
2. **`ksfoo/Makefile` runs the package's own tests from its folder alone**, as `ksdb/Makefile` does (`test:` running `ksfoo/tests/main.kspl`, from the package's folder, with `$(KSPLC)`). The tools find a Makefile by its place, so no list needs an edit. Three tools pick it up. They are the `debug-` target of the package's name (as `make debug-ksdb` for ksdb), and the fuzzing pass. The third is `make test-extract-rest`, which runs the package from a copy holding nothing else.
3. **`ksfoo/README.md` is the package's entry point**, and its other documents go under `ksfoo/docs/` ("Where documents sit" in [`SPEC-documents.md`](SPEC-documents.md)). Nothing checks that they exist.

## The checks that must learn the name

4. **The static analysis**: add `ksfoo/tests/main.kspl` to `LINT_TARGETS` in `mk/lint.mk`, beside the other packages' entries. Left out, `make test-conventions` fails with "no entry point of the static analysis has leaked out".
5. **The reference directions** are in `tests/suite/docref_test.kspl`. Add `ksfoo` to `LAYER_FROM`. Add a `LAYER_TO` row that starts `"ksfoo docs std root"` and names each package it imports. Add `ksfoo` to the rows of `docs`, `root`, `tests` and `tools`, which can point at every package. Left out of `LAYER_FROM`, `make test-docref` fails with "every package folder has a row in the reference directions".
6. **The table those directions come from** is in "The layers" in [`SPEC-documents.md`](SPEC-documents.md). Add `` `ksfoo/` `` to its implementation row. Add an arrow (`ksfoo→std`) for each direction that the `layer_to` row holds. An arrow and a row that disagree fail `make test-conventions` with "the reference-direction table and the check line up".
7. **The published API, if it has one**: add `ksfoo` to `SURFACE_PKGS` in `mk/test.mk`, then write the record:

   ```sh
   make surface              # prints: wrote ksfoo/SURFACE.txt
   ```

   Listed without the file, `make test-surface` fails with "there is no ksfoo/SURFACE.txt".
8. **The SKIP lines its tests print**: `make test-extract-rest` relays them, and each needs an `Expected_skip` row in `tools/ci_gates.kspl`, or the gate fails with "a SKIP no row of `EXPECTED_SKIPS` holds" ([`HOWTO-add-a-gate.md`](HOWTO-add-a-gate.md)).

## Optional, and checked by nothing

9. **macOS's one run of it**: macOS runs no `test-extract`, so a package reaches its gates only through `make debug` (`tests/debug/main.kspl`). Add it there, unless macOS must not run it.
10. **The LLVM backend**: `make LLVM=1 debug` reaches what `make debug` does; a package outside it joins `test-llvm-pkgs` in `mk/test.mk`.
11. **The prose that counts packages**: the root [`README.md`](../README.md)'s layout table, and the count in [`DESIGN-repository.md`](DESIGN-repository.md) ("Why one repository").

## Run it

```sh
make test-conventions test-docref test-surface test-extract-rest
```

Each prints `RESULT: ALL PASS` when the package is wired in. `make ci` runs every gate your machine runs natively; only Linux runs them all ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)).
