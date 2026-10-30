# Adding a package

**This guide adds a new top-level package, written here as `ksfoo/`, and wires it into the build, the checks and the documents.** You need a clone that builds ([`HOWTO-build.md`](HOWTO-build.md)). Each step says what fails if it is left out.

## The folder itself

1. **`ksfoo/ksplc.cfg` names the package and what it uses**:

   ```
   [package]
   name = ksfoo
   uses = ksai
   ```

   `uses` lists every package it imports besides itself and `std`; a package that imports `ksfoo` adds it to its own `uses`. An import the file does not list stops the compiler with `the package 'ksfoo' does not say it uses 'ksai'`. Without `name`, `make test-extract-rest` fails with "carries a Makefile but names no package in its ksplc.cfg".
2. **`ksfoo/Makefile` runs the package's own tests from its folder alone**, as `ksdb/Makefile` does (`test:` running `ksfoo/tests/main.kspl` with `$(KSPLC)`). The tools find it by its place, so no list needs an edit. The `debug-` target of the package's name (`make debug-ksdb` for ksdb) picks it up. So do the fuzzing pass and `make test-extract-rest`, which runs the package from a copy holding nothing else. `make lint` finds `ksfoo/tests/main.kspl` by its `fn main`.
3. **`ksfoo/README.md` is the package's entry point**, and its other documents go under `ksfoo/docs/` ("Where documents sit" in [`SPEC-documents.md`](SPEC-documents.md)). Nothing checks that they exist.

## The checks that must learn the name

4. **The reference directions** are in `tests/suite/docref_test.kspl`. Add `ksfoo` to `LAYER_FROM`, and a `LAYER_TO` row that starts `"ksfoo docs std root"` and names each package it imports. Add `ksfoo` to the rows of `docs`, `root`, `tests` and `tools`. Left out of `LAYER_FROM`, `make test-docref` fails with "every package folder has a row in the reference directions".
5. **The table those directions come from** is "The layers" in [`SPEC-documents.md`](SPEC-documents.md). Add `` `ksfoo/` `` to its implementation row, and an arrow (`ksfoo→std`) for each direction of the `layer_to` row. A mismatch fails `make test-conventions` with "the reference-direction table and the check line up".
6. **The published API, if it has one**: create an empty `ksfoo/SURFACE.txt`, then write the record:

   ```sh
   touch ksfoo/SURFACE.txt
   make surface              # prints: wrote ksfoo/SURFACE.txt
   ```

   The file itself enrolls the package (`SURFACE_PKGS` in `mk/test.mk`). Without it, no gate compares the package's API with a record.
7. **The SKIP lines its tests print**: `make test-extract-rest` relays them, and each needs an `Expected_skip` row in `tools/ci_gates.kspl`. Otherwise the gate fails with "a SKIP no row of `EXPECTED_SKIPS` holds" ([`HOWTO-add-a-gate.md`](HOWTO-add-a-gate.md)).

## Optional, and checked by nothing

8. **macOS's one run of it**: macOS runs no `test-extract`, so a package reaches its gates only through `make debug` (`tests/debug/main.kspl`). Add it there, unless macOS must not run it.
9. **The LLVM backend**: `make LLVM=1 debug` reaches what `make debug` does; a package outside it joins `test-llvm-pkgs` in `mk/test.mk`.
10. **The prose that counts packages**: the root [`README.md`](../README.md)'s layout table, and the count in [`DESIGN-repository.md`](DESIGN-repository.md) ("Why one repository").

## Run it

```sh
make test-conventions test-docref test-surface test-extract-rest
```

Each prints `RESULT: ALL PASS` when the package is wired in. `make ci` runs every gate your machine runs natively; only Linux runs them all ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)).
