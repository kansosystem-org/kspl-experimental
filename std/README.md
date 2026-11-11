# std

**The KSPL standard library**: lists and maps, strings, files, the network, threads and more, for anyone writing KSPL. The compiler itself depends on it too. Apart from `std/lang`, each file is imported as `import "std/xxx"` and reached through its alias, the short name before the dot (`io.out()` after `import "std/io"`; ["9. Files and import" in `docs/SPEC-programming-language.md`](../docs/SPEC-programming-language.md#9-files-and-import)).

## Run it

Save this as `first.kspl`, then run `ksplc run first.kspl`. It prints `first = 42`.

```kspl
import "std/ds" { List }
import "std/io"

fn main()
    defer $nums: = List<|I32|>(null)
    nums.push(42)
    io.out().s("first = \{nums[0]\}\n")
```

`List<|I32|>(null)` puts the list's storage on the heap, so `defer` in front of the declaration frees it when `main` returns.

---

## What is here

**`ksplc doc std` lists every file and what it is for**, rendered from the sources; `ksplc doc std/<file>` gives one file's declarations. Below is only what it does not say.

### Nothing to install

**Every file builds with the toolchain alone**: the compiler and a C compiler. `std/net`, `std/http`, `std/reactor`, `std/subproc` and `std/fs` reach the operating system through the C runtime that every program links. No file binds a C library from outside the toolchain ("The standard library reaches only itself" in [`../docs/DESIGN-repository.md`](../docs/DESIGN-repository.md)).

### How many files one import brings along

Importing one file of `std` also compiles the files it imports.

**`std/lang` and `std/libc` go into every program**: `std/lang` as "9.2 Which names an import brings in" in [`../docs/SPEC-programming-language.md`](../docs/SPEC-programming-language.md#92-which-names-an-import-brings-in) says, and `libc` because `panic` writes its message and stops the program through it.

Above those two, the files form tiers by how many files one import compiles.

Caution: **Do not add line counts to this table**: every edit changes them, and `make test-thin-use` reports them with their upper bounds. The same suite checks the file counts, and that every file directly under `std/` has a row. So a file or an import added without its row fails there.

| What is used | How many come along |
| --- | ---: |
| `lang` + `libc` alone | 2 |
| `bytes` `math` `checked_int` `mem` `ring` `prng` `bignat` `log` `stack_limit` `suite` `thread` `panic_record` | 3 |
| `chars` | 3 (4 on a freestanding build, one with no operating system under it, where `mem` supplies `memcmp`) |
| `buf` `refcount` | 4 |
| `strfmt` `strnum` `sha256` | 5 (6 on a freestanding build, through `chars`) |
| `ds` (`List` / `Map`), `base64` `rand` `net` `url` `channel` | 5 |
| `seq` `reactor` `regex_node` | 6 |
| `str` `regex` | 8 |
| `io` | 9 |
| `sys` `json` `fs` `subproc` `http` `http_body` `jsonrpc` `argparse` `verdict` `fuzz`, which use those above | 9+ |

Why the tiers hold is "Why one import brings few files along" in [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md).

### `std/tests/`

std's own tests live here, in no listing above. Their entry point is `run_std` in `std/tests/all.kspl`, which `make debug` calls. Where a test goes is "A test of a unit's inside goes inside that unit" in [`docs/DESIGN-repository.md`](../docs/DESIGN-repository.md).

**`make test` runs them from this folder** with nothing but a `ksplc`, so a copy of the folder tests itself ([`std/Makefile`](Makefile)).

**`make test-fuzz` feeds broken input to std's readers** through `std/tests/read_prog.kspl`, and checks a round trip where std has a writer ("Fuzzing watches the program from outside" in [`std/docs/DESIGN-system.md`](docs/DESIGN-system.md)). The broken inputs are made from seeds: std's own writers, and the JSON files in the folder `FUZZ_SEEDS` names. That folder is this one unless `FUZZ_SEEDS` is set; the repository passes its root (`make test-std-fuzz`).

## Pitfalls

**A constructor's name says where the returned thing goes**: `alloc`, `new` and `create` are not aliases. The table of the three, with an example, is "A constructor's name says where the returned thing goes" in [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md).

---

## Further reading

The first is for anyone choosing a file; the rest are for whoever changes std.

* [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md) — the known problems of earlier implementations, and how each file handles them. Then the grounds of std's core: memory, containers, strings and numbers, regular expressions, failures and the log, and the package's shape. It also says how to split a file.
* [`std/docs/DESIGN-system.md`](docs/DESIGN-system.md) — the grounds of what reaches outside the program: the process, its children and the clock, files and paths, threads, networking and the data formats.
* [`std/SURFACE.txt`](SURFACE.txt) — the record of the API this package publishes, remade by `make surface` and held against the tree by `make test-surface` ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).
