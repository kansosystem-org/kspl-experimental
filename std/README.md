# std

**The KSPL standard library**, which the compiler itself depends on too. Apart from `std/lang`, each file is imported as `import "std/xxx";` and reached through its alias (["9. Files and import" in `docs/SPEC-language.md`](../docs/SPEC-language.md#9-files-and-import)).

## Run it

```kspls
import "std/ds" as ds
import "std/io"

fn main()
  nums: = List<|I32|>.create()
  nums.push(42)
  io.out().s("first = \{nums[0]\}\n")
```

---

## What is here

**`ksplc doc std` lists every file and what it is for**, rendered from the sources when asked; `ksplc doc std/<file>` gives one file's declarations. Below is only what it does not say.

### The files carrying an optional dependency

These two stay out of the default build until named, under **selective extensibility**: a feature only some programs need is not put into the language specification, but offered as a file those programs `import`.

| File | What it needs | How it is built |
| --- | --- | --- |
| **`std/tls`** | OpenSSL (`libssl-dev`) | `make TLS=1` |
| **`std/db`** | SQLite (`libsqlite3-dev`) | `make DB=1` |

Every other file builds with the toolchain alone; `std/net`, `std/http`, `std/reactor`, `std/subproc` and `std/fs` reach the OS through the always-linked C runtime.

### How many files one import brings along

**`std/lang` and `std/libc` go into every program.** `std/lang` goes in as "9.2 Which names an import brings in" in [`../docs/SPEC-language.md`](../docs/SPEC-language.md#92-which-names-an-import-brings-in) says, and `libc` as `panic`'s destination. Where a needed `lang.` is missing, the linter's [W0504] catches it for `Ref_counted` / `Move_only` / `Owned`, and desugaring reports an error for an operator trait.

Above those two, the files form tiers by how many files one import compiles.

Caution: **Do not add line counts to this table**: every edit changes them, and `make test-thin-use` reports them with their upper bounds.

| What is used | How many come along |
| --- | ---: |
| `lang` + `libc` alone | 2 |
| `bytes` `math` `checked_int` `time` `mem` `buf` `reflect` `ring` `prng` `bignat` | 3 |
| `chars` | 3 (4 on a freestanding build, where `mem` supplies `memcmp`) |
| `strfmt` | 4 |
| `strnum` | 5 |
| `ds` (`List` / `Map`), `sha256` `base64` `rand` `thread` `net` `db` | 4 |
| `seq` `regex` `tls` | 5 |
| `str` | 7 |
| `io` | 8 |
| `sys` `json` `fs` and the like, which use those above | 8+ |

Why the tiers hold, and what keeps them from collapsing, is "Why one import brings few files along" in [`std/docs/DESIGN.md`](docs/DESIGN.md).

### `std/tests/`

std's own tests, in no listing above. Their entry point is `run_std` in `std/tests/all.kspls`, which `make debug` calls. Where a test goes is "13.1 A test inspecting the inside of a unit goes inside that unit" in [`docs/DESIGN.md`](../docs/DESIGN.md). **`make test` runs them from this folder** with nothing but a `ksplc`, against the `std` this folder holds, so a copy of the folder tests itself ([`std/Makefile`](Makefile)).

**`make test-fuzz` feeds broken input to std's readers** through `std/tests/read_prog.kspls`. How a round is judged is "Fuzzing watches the program from outside" in [`std/docs/DESIGN.md`](docs/DESIGN.md). The seeds come from std's own writers and the JSON files under `FUZZ_SEEDS`. That is this folder unless set; the repository passes its root (`make test-std-fuzz`).

## Pitfalls

**A constructor's name says where the returned thing goes**: `alloc`, `new` and `create` are not aliases.

| Name | Where the returned thing goes | What is returned | Examples |
| --- | --- | --- | --- |
| `alloc*` | It only allocates, **leaving the content uninitialized** | A pointer | `mem.alloc` / `Arena.alloc_as<\|T\|>` |
| `new*` | **Anywhere but the arena handed over** (the caller's variable, or the heap) | A value, or a pointer for what goes on the heap (`Arena.new`) | `List<\|T\|>.new` / `Rc<\|T\|>.new` |
| `create*` | **The arena handed over** (as an argument or as the receiver) | A pointer into it | `Arena.create<\|T\|>` / `List<\|T\|>.create` |

Where the arena goes among the parameters, and when a function takes one, is "A constructor's name says where the returned thing goes" in [`std/docs/DESIGN.md`](docs/DESIGN.md).

---

## Files near the limit and how they split

How to choose where to cut is "Choosing where to split a file" in [`docs/DESIGN.md`](../docs/DESIGN.md). What follows is std's plan and the constraints of std alone.

* [`std/strfmt.kspls`](strfmt.kspls): **the exact assembly of decimal digits from a binary value** moves to a new `strfmt_digits.kspls` under `std/`. That is `Binary_float` and the decomposition, the loop that runs `Bignat` and emits one digit at a time, the carry, and fixing the digit count.
  * The cut lies between making the digits and writing them out. `write_float` / `write_float32` stay, since moving them too would make both files need `Writer`.
* [`std/tests/sys_test.kspls`](tests/sys_test.kspls): **the filesystem tests** (`test_fs_ops` / `test_fs_wide_path` / `test_fs_walk` / `test_fs_mkdir_all_race` / `test_fs_path_guard` / `test_fs_long_path`, and their helpers) move to a new `fs_test.kspls` under `std/tests/`.
  * The cut follows the question each test asks. What stays covers environment variables, signals, the clock, a path's extension and child processes; what moves asks about non-ASCII names, the length limit, racing creation and the depth limit.
  * Caution: **Once it moves, move its `import` and its call in [`std/tests/all.kspls`](tests/all.kspls) too.** A file that no entry point calls is invisible to `make debug`, so forgetting this still shows green.

**Name a new file with a word no value uses.** `rc.kspls` for the reference-counting handles would make its alias collide with the variable name `rc`, hence [`std/refcount.kspls`](refcount.kspls).

**Do not cut a folder.** What is split out goes directly under `std/` too ("A folder is made only for a unit with its own README" in [`std/docs/DESIGN.md`](docs/DESIGN.md)).

**Names the compiler holds do not move alone.** `Arena` stays in `std/mem.kspls`, since `ksplc/sema/flow/release.kspls` names `std.mem.Arena`. The trait names in [`std/lang.kspls`](lang.kspls) are matched by exact FQN (`ksplc/sema/type/arc.kspls` and `ksplc/sema/type/env.kspls`), so renaming or moving one means a change in `ksplc/`.

Note: The reference-counting handles can move freely. The compiler recognizes an ARC type by `Ref_counted`'s FQN in [`std/lang.kspls`](lang.kspls), not by where the handles live.

---

## Further reading

The first is for anyone choosing a file; the rest are for whoever changes std.

* [`std/docs/DESIGN.md`](docs/DESIGN.md) — the known problems of earlier implementations and how each file handles them, then the grounds of std's API choices.
* [`std/docs/README.md`](docs/README.md) — every document this package carries.
* [`std/SURFACE.txt`](SURFACE.txt) — the record of the API this package publishes, remade by `make surface` and held against the tree by `make test-surface` ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).
