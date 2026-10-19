# std

**The KSPL standard library**: lists and maps, strings, files, the network, threads and more, for anyone writing KSPL. The compiler itself depends on it too. Apart from `std/lang`, each file is imported as `import "std/xxx"` and reached through its alias, the short name before the dot (`io.out()` after `import "std/io"`; ["9. Files and import" in `docs/SPEC-programming-language.md`](../docs/SPEC-programming-language.md#9-files-and-import)).

## Run it

Save this as `first.kspl`, then run `ksplc run first.kspl`. It prints `first = 42`.

```kspl
import "std/ds" { List }
import "std/io"

fn main()
    $nums: = List<|I32|>.new(null)
    defer nums.free()
    nums.push(42)
    io.out().s("first = \{nums[0]\}\n")
```

`List.new(null)` puts the list's storage on the heap, so `defer nums.free()` frees it when `main` returns.

---

## What is here

**`ksplc doc std` lists every file and what it is for**, rendered from the sources when asked; `ksplc doc std/<file>` gives one file's declarations. Below is only what it does not say.

### Nothing to install

**Every file builds with the toolchain alone**: the compiler and a C compiler, with no library to install. `std/net`, `std/http`, `std/reactor`, `std/subproc` and `std/fs` reach the operating system through the C runtime that every program links. No file binds a C library from outside the toolchain ("The standard library reaches only itself" in [`../docs/DESIGN-repository.md`](../docs/DESIGN-repository.md)).

### How many files one import brings along

Importing one file of `std` also compiles the files it imports, and this section says how many that is.

**`std/lang` and `std/libc` go into every program.** `std/lang` goes in as "9.2 Which names an import brings in" in [`../docs/SPEC-programming-language.md`](../docs/SPEC-programming-language.md#92-which-names-an-import-brings-in) says. `libc` goes in because `panic` writes its message and stops the program through it. `std/lang`'s names can be written bare in every file (`Option`, `Owned`). **`lang.` is needed only where the file declares or imports a name of its own that hides one of them.** In a file declaring its own `Owned`, the bare `Owned` is that file's, and `lang.Owned` is `std/lang`'s. The compiler gives some of `std/lang`'s traits special treatment, and only under their `std/lang` names. So a missing `lang.` there loses that treatment. Two checks catch it. For `Ref_counted` / `Move_only` / `Owned`, the linter's [W0501] warns that the type conforms to a look-alike. An operator such as `+` or `==` becomes a call to an operator trait (`Add`, `Eq` and the like). For such a trait, desugaring reports an error where the operator is used. Desugaring is the compiler's step that rewrites shorthand into plain calls.

Above those two, the files form tiers by how many files one import compiles.

Caution: **Do not add line counts to this table**: every edit changes them, and `make test-thin-use` reports them with their upper bounds. The file counts are checked by the same suite, so an import added without its row fails there.

| What is used | How many come along |
| --- | ---: |
| `lang` + `libc` alone | 2 |
| `bytes` `math` `checked_int` `mem` `buf` `reflect` `ring` `prng` `bignat` `log` `stack_limit` | 3 |
| `chars` | 3 (4 on a freestanding build, one with no operating system under it, where `mem` supplies `memcmp`) |
| `thread` | 4 |
| `strfmt` `strnum` `sha256` | 5 (6 on a freestanding build, through `chars`) |
| `ds` (`List` / `Map`), `base64` `rand` `net` `url` | 5 |
| `seq` | 6 |
| `str` `regex` | 8 |
| `io` | 9 |
| `sys` `json` `fs` and the like, which use those above | 9+ |

Why the tiers hold, and what keeps them from collapsing, is "Why one import brings few files along" in [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md).

### `std/tests/`

std's own tests live here, in no listing above. Their entry point is `run_std` in `std/tests/all.kspl`, which `make debug` calls. Where a test goes is "A test of a unit's inside goes inside that unit" in [`docs/DESIGN-repository.md`](../docs/DESIGN-repository.md).

**`make test` runs them from this folder** with nothing but a `ksplc`, against the `std` this folder holds, so a copy of the folder tests itself ([`std/Makefile`](Makefile)).

**`make test-fuzz` feeds broken input to std's readers** (the JSON reader and the like) through `std/tests/read_prog.kspl`. Where std has a writer for the input, that file checks that what it read comes back the same through the writer. How a round is judged is "Fuzzing watches the program from outside" in [`std/docs/DESIGN-system.md`](docs/DESIGN-system.md). The broken inputs are made from seeds: std's own writers, and the JSON files in the folder `FUZZ_SEEDS` names. That folder is this one unless `FUZZ_SEEDS` is set. The repository passes its root (`make test-std-fuzz`).

## Pitfalls

**A constructor's name says where the returned thing goes**: `alloc`, `new` and `create` are not aliases. An *arena* is one block of memory that many values share. It is freed all at once. The *heap* is memory that each value frees on its own.

| Name | Where the returned thing goes | What is returned | Examples |
| --- | --- | --- | --- |
| `alloc*` | It only allocates, **leaving the content uninitialized** | A pointer | `mem.alloc` / `Arena.alloc_as<\|T\|>` |
| `new*` | **Anywhere but the arena handed over** (the caller's variable, or the heap) | A value, or a pointer for what goes on the heap (`Arena.new`) | `List<\|T\|>.new` / `Rc<\|T\|>.new` |
| `create*` | **The arena handed over** (as an argument or as the receiver) | A pointer into it | `Arena.create<\|T\|>` / `List<\|T\|>.create` |

The same arena, given to `new` and to `create`:

```kspl
import "std/ds" { List }
import "std/io"
import "std/mem" { Arena }

fn main()
    arena: = Arena.new(4096)
    defer arena.free()

    // new: the list is the value in your variable; it keeps its items in the arena.
    $mine: = List<|I32|>.new(arena)
    mine.push(1)

    // create: the list itself is placed in the arena, and you get a pointer to it.
    shared: = List<|I32|>.create(arena)
    shared.push(2)

    io.out().s("\{mine[0]\} \{shared[0]\}\n")
```

Where the arena goes among the parameters, and when a function takes one, is "A constructor's name says where the returned thing goes" in [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md).

---

## Files near the limit and how they split

One file here has its split planned before it reaches the line limit for a file. This section says what moves out of it and where. How to choose where to cut is "Choosing where to split a file" in [`docs/DESIGN-principles.md`](../docs/DESIGN-principles.md). What follows is std's plan and the constraints of std alone.

* [`std/strfmt.kspl`](strfmt.kspl): **the exact assembly of decimal digits from a binary value** moves to a new `strfmt_digits.kspl` under `std/`. That is `Binary_float` and the decomposition, the loop that runs `Bignat` and emits one digit at a time, the carry, and fixing the digit count.
  * The cut lies between making the digits and writing them out. `write_float` / `write_float32` stay, since moving them too would make both files need `Writer`.

**Name a new file with a word no value uses.** `rc.kspl` for the reference-counting handles would make its alias collide with the variable name `rc`, hence [`std/refcount.kspl`](refcount.kspl).

**Do not cut a folder.** What is split out goes directly under `std/` too ("Only a unit with its own README gets a folder" in [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md)).

**Names the compiler holds do not move alone.** `Arena` stays in `std/mem.kspl`, since `ksplc/sema/flow/release.kspl` names `std.mem.Arena`. The compiler matches the trait names in [`std/lang.kspl`](lang.kspl) by their exact FQN, the fully qualified name such as `std.lang.Ref_counted`. It does so in `ksplc/sema/type/arc.kspl` and `ksplc/sema/type/env.kspl`. So renaming or moving one means a change in `ksplc/`.

Note: The reference-counting handles can move freely. The compiler recognizes an ARC type (one whose owners are counted automatically) by `Ref_counted`'s FQN in [`std/lang.kspl`](lang.kspl), not by where the handles live.

---

## Further reading

The first is for anyone choosing a file; the rest are for whoever changes std.

* [`std/docs/DESIGN-core.md`](docs/DESIGN-core.md) — the known problems of earlier implementations, and how each file handles them. Then the grounds of std's core: memory and ownership, containers and iteration, and strings, numbers and bytes. Also regular expressions, failures and the log, and the package's shape.
* [`std/docs/DESIGN-system.md`](docs/DESIGN-system.md) — the grounds of what reaches outside the program: the process, its children and the clock, files and paths, threads, networking and the data formats.
* [`std/SURFACE.txt`](SURFACE.txt) — the record of the API this package publishes, remade by `make surface` and held against the tree by `make test-surface` ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).
