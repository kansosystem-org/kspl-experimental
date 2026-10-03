# The design policy of the standard library

Every file in `std/` starts from a widely used API, but does not simply inherit it. The criticism the API met over years of use, the vulnerabilities reported against it and the misuse it could not prevent are studied. Where KSPL's type system can prevent one, the design changes.

**The document holds two things.** First, a table of earlier implementations' known problems and how each file handles them, with the holes still open. Then, by subject, the choices in `std/`'s own API that invite "why this way". When adding or changing a file, check whether the table can gain a row; if not, confirm the file has not become a plain inheritance. The language's own grounds are in [`../../docs/DESIGN.md`](../../docs/DESIGN.md); what each file is for is what `ksplc doc std` lists, and how many files one import brings along is [`std/README.md`](../README.md).

## Contents

* [What was inherited, and what was changed](#what-was-inherited-and-what-was-changed)
  * [Known problems KSPL handles](#known-problems-kspl-handles)
  * [Known holes, and what would fill them](#known-holes-and-what-would-fill-them)
* [Memory and ownership](#memory-and-ownership)
  * [The names of the reference-counting types](#the-names-of-the-reference-counting-types)
  * [A container owns its elements' ARC counts](#a-container-owns-its-elements-arc-counts)
  * [A constructor's name says where the returned thing goes](#a-constructors-name-says-where-the-returned-thing-goes)
  * [The receiver aligns the start of a buffer it is given](#the-receiver-aligns-the-start-of-a-buffer-it-is-given)
* [Strings, numbers and bytes](#strings-numbers-and-bytes)
  * [String functions are split by whether they allocate](#string-functions-are-split-by-whether-they-allocate)
  * [A string allocated and returned is returned read-only](#a-string-allocated-and-returned-is-returned-read-only)
  * [`dedent`, which removes common indentation, empties a whitespace-only line](#dedent-which-removes-common-indentation-empties-a-whitespace-only-line)
  * [The destination is always named. There are three shapes, and no more are added](#the-destination-is-always-named-there-are-three-shapes-and-no-more-are-added)
  * [The digits of a floating-point number are assembled here](#the-digits-of-a-floating-point-number-are-assembled-here)
  * [Converting a string to F64 is not left to libc](#converting-a-string-to-f64-is-not-left-to-libc)
  * [Format-specifier dispatch per type stays as an impl per type](#format-specifier-dispatch-per-type-stays-as-an-impl-per-type)
  * [Hexadecimal is written with a format specifier, and only `0x` and a fixed digit count stay on the wrapper type](#hexadecimal-is-written-with-a-format-specifier-and-only-0x-and-a-fixed-digit-count-stay-on-the-wrapper-type)
  * [Converting between bytes and integers holds no format string](#converting-between-bytes-and-integers-holds-no-format-string)
* [Containers and iteration](#containers-and-iteration)
  * [What a container requires of a type is written as a trait](#what-a-container-requires-of-a-type-is-written-as-a-trait)
  * [A function that returns every entry does not build a nested generic](#a-function-that-returns-every-entry-does-not-build-a-nested-generic)
  * [Iteration has one notation, `for x in`](#iteration-has-one-notation-for-x-in)
  * [Why the chain's stages cannot be folded](#why-the-chains-stages-cannot-be-folded)
  * [Only `where` and `select` ride on the chain, and a predicate is a `Callable1`](#only-where-and-select-ride-on-the-chain-and-a-predicate-is-a-callable1)
  * [Indexing costs one comparison, and the stop is called out of line](#indexing-costs-one-comparison-and-the-stop-is-called-out-of-line)
  * [The ring buffer neither blocks nor locks](#the-ring-buffer-neither-blocks-nor-locks)
* [Failures and the log](#failures-and-the-log)
  * [A failure is returned as `T?E`](#a-failure-is-returned-as-te)
  * [Logs and diagnostics share level names, not meaning](#logs-and-diagnostics-share-level-names-not-meaning)
  * [A line that is not emitted is not built](#a-line-that-is-not-emitted-is-not-built)
  * [The destination is the caller's, not a global](#the-destination-is-the-callers-not-a-global)
  * [A log line ends when the next one opens](#a-log-line-ends-when-the-next-one-opens)
  * [Error and warning lines are flushed at once](#error-and-warning-lines-are-flushed-at-once)
  * [The caller's position reaches `say` as a default argument, and printing it is the logger's setting](#the-callers-position-reaches-say-as-a-default-argument-and-printing-it-is-the-loggers-setting)
  * [A comma is a separator, not a format](#a-comma-is-a-separator-not-a-format)
  * [No time is stamped here](#no-time-is-stamped-here)
* [The process: its arguments, its output, its children and the clock](#the-process-its-arguments-its-output-its-children-and-the-clock)
  * [How an argument's destination is declared, and why anything unknown is an error](#how-an-arguments-destination-is-declared-and-why-anything-unknown-is-an-error)
  * [A program does not lose its own output on an abnormal exit](#a-program-does-not-lose-its-own-output-on-an-abnormal-exit)
  * [A run of checks goes on past a failure, and names what failed on its last line](#a-run-of-checks-goes-on-past-a-failure-and-names-what-failed-on-its-last-line)
  * [Fuzzing watches the program from outside](#fuzzing-watches-the-program-from-outside)
  * [Writing to a closed pipe returns an error value, and output whose destination is gone ends quietly](#writing-to-a-closed-pipe-returns-an-error-value-and-output-whose-destination-is-gone-ends-quietly)
  * [The output of children started in parallel is received through files, not pipes](#the-output-of-children-started-in-parallel-is-received-through-files-not-pipes)
  * [Three ways to start a child process, split by where its output goes](#three-ways-to-start-a-child-process-split-by-where-its-output-goes)
  * [The clock has separate functions for 'elapsed' and 'date-time'](#the-clock-has-separate-functions-for-elapsed-and-date-time)
  * [A date-time that does not fit a fixed-length date-time format is refused as a value](#a-date-time-that-does-not-fit-a-fixed-length-date-time-format-is-refused-as-a-value)
* [Files and paths](#files-and-paths)
  * [Paths are held in UTF-8, and converted to the wide API on Windows](#paths-are-held-in-utf-8-and-converted-to-the-wide-api-on-windows)
  * [A long path is handed to Windows in the extended form](#a-long-path-is-handed-to-windows-in-the-extended-form)
  * [A path is kept under the root by refusing, not by resolving and comparing](#a-path-is-kept-under-the-root-by-refusing-not-by-resolving-and-comparing)
  * [A predicate asking 'may this be followed' returns true when it cannot tell](#a-predicate-asking-may-this-be-followed-returns-true-when-it-cannot-tell)
  * [Making a directory refuses an existing name, and removing a tree is not offered](#making-a-directory-refuses-an-existing-name-and-removing-a-tree-is-not-offered)
  * [A path is made absolute by its spelling alone](#a-path-is-made-absolute-by-its-spelling-alone)
* [Threads, networking and the data formats](#threads-networking-and-the-data-formats)
  * [A mutex makes the lock and what it protects one thing](#a-mutex-makes-the-lock-and-what-it-protects-one-thing)
  * [The lock and the condition variable are value types](#the-lock-and-the-condition-variable-are-value-types)
  * [Threads and the reactor are both kept](#threads-and-the-reactor-are-both-kept)
  * [A walk that must not exhaust its stack asks where the stack ends](#a-walk-that-must-not-exhaust-its-stack-asks-where-the-stack-ends)
  * [Connecting by name tries the candidates overlapped](#connecting-by-name-tries-the-candidates-overlapped)
  * [The frame is kept apart from the transport, and a broken frame is returned as a value too](#the-frame-is-kept-apart-from-the-transport-and-a-broken-frame-is-returned-as-a-value-too)
  * [The field table holds a number's width as data, and nests by pointing](#the-field-table-holds-a-numbers-width-as-data-and-nests-by-pointing)
  * [JSON's numbers hold integers and decimals separately](#jsons-numbers-hold-integers-and-decimals-separately)
* [Regular expressions](#regular-expressions)
  * [A capture group's end is observed with a marker node](#a-capture-groups-end-is-observed-with-a-marker-node)
  * [There are two rewinds, and neither covers the other](#there-are-two-rewinds-and-neither-covers-the-other)
  * [A repeated group holds the rest of the current round in a single-use node](#a-repeated-group-holds-the-rest-of-the-current-round-in-a-single-use-node)
  * [Every match is returned in a `List`. No lazy iterator is made](#every-match-is-returned-in-a-list-no-lazy-iterator-is-made)
  * [A group reassembles the sequence per attempt, so it has no effect in a per-line use](#a-group-reassembles-the-sequence-per-attempt-so-it-has-no-effect-in-a-per-line-use)
  * [After `\`, an alphanumeric is accepted only in a defined escape](#after--an-alphanumeric-is-accepted-only-in-a-defined-escape)
  * [A notation that is refused stays refused](#a-notation-that-is-refused-stays-refused)
  * [`.` does not match a newline, counts are written as `{m,n}`, and broken shapes are refused](#-does-not-match-a-newline-counts-are-written-as-mn-and-broken-shapes-are-refused)
* [The shape of the package](#the-shape-of-the-package)
  * [Why one import brings few files along](#why-one-import-brings-few-files-along)
  * [A folder is made only for a unit with its own README](#a-folder-is-made-only-for-a-unit-with-its-own-readme)
  * [Whether `pub` is needed is not settled by walking the references](#whether-pub-is-needed-is-not-settled-by-walking-the-references)

---

## What was inherited, and what was changed

### Known problems KSPL handles

| File | The earlier implementation | The known problem | How KSPL handles it |
| :-- | :-- | :-- | :-- |
| `str` | C's strings | **The poison NUL byte.** Converting a length-carrying string to a NUL-terminated C string silently drops everything after the NUL; PHP and Java had path checks bypassed this way | `to_cstr()` returns `Option<\|U8$@\|>`, `.none` on input containing a NUL, and `switch`'s exhaustiveness makes the caller handle it. `contains_nul()` is public too |
| `net` | POSIX `send(2)` / Go's `io.Writer` / Rust's `Write` | **The short write.** `write` may not write everything, yet callers keep discarding its return value (why Go and Rust hold a separate "write everything" API) | Both `write` (returns the partial count) and `write_all` (sends it all), so the name states the intent. `std/http` uses `write_all` |
| `http` | HTTP/1.1 implementations in general | **Request smuggling** (`Content-Length` and `Transfer-Encoding` read differently, or `Content-Length` duplicated) and response splitting (CRLF injected into a header value) | Refuses any `Transfer-Encoding`, and a duplicated `Content-Length` whose values disagree. Refuses at write time a CRLF in a header name or value, the method, the target or the reason phrase |
| `jsonrpc` | LSP clients in general (`lsp4j` / `lsp-server` / `pylspclient`) | **Nothing comes back for a broken frame or a dropped response.** On a frame missing `Content-Length`, `lsp4j` sends no response, only a log line ([#210](https://github.com/eclipse-lsp4j/lsp4j/issues/210)); on a dropped response, `pylspclient` cannot look up the id and throws | A frame declaring no length, or over the limit, returns `Rpc_end.broken` **as a value**, and its broken head is dropped from the pool so it cannot repeat forever ("The frame is kept apart from the transport" below) |
| `tls` | Calling OpenSSL directly | **Forgotten verification.** Not calling `SSL_CTX_set_verify`, or setting SNI (`SSL_set_tlsext_host_name`) without the host name check (`SSL_set1_host`), are the standard mistakes | A client context is always `SSL_VERIFY_PEER` with the default CA store; both SNI and the host name check are set, and the result is checked after connecting, throwing `cert_verify_failed`. A host name too long or containing a NUL **fails rather than being truncated** (truncated, it would verify a different host) |
| `db` | SQLite's C API | **SQL injection.** An API building queries by concatenating strings gets misused | Only placeholders: `prepare` plus `bind_i64`/`bind_f64`/`bind_text`/`bind_null` |
| `json` / `db` | `serde`'s derive / Swift's `Codable` / Jackson's annotations / nlohmann's macros | **A key's name is written twice, once for the writer and once for the reader.** n fields take 2n lines, and fixing only one silently fills in the default | Round-trip functions (`json.from_struct` / `json.into_struct`, `Statement.bind_row` / `Statement.read_row`) walk `std/reflect`'s table, and **ksplc synthesizes the table and `fields()` from an empty `impl X: reflect.Reflectable {}`** ([3.2.5 in `../../docs/DESIGN.md`](../../docs/DESIGN.md)). Synthesized, the table cannot drift from the type's declaration; a drift would give no diagnostic and show as reading and writing the neighbouring field. A key cannot be given another name: it is the field's name. db matches by name (`:field` when binding, the column name when reading). Matched by position, reordering the SQL's columns silently reads the wrong one wherever the types agree. A missing key or column and a `null` one are refused with different values (`missing_field` / `field_type`, `missing_column` / `column_type`), so no sentinel default such as `as_int64(-1)` folds two causes into one value |
| `json` | JSON parsers in general | **Stack exhaustion from deep nesting** (the billion-laughs family) and duplicate keys: implementations read `{"a":1,"a":2}` differently, so two parsers given the same document see different values | Nesting stops at `max_nesting_depth = 500` with a `Json_error`, not a panic. Duplicate keys are not refused: RFC 8259's uniqueness is only a SHOULD, and refusing would drop legitimate requests over the sender's implementation quirks. Reading is first wins, and `dump` keeps the duplicates. `Obj_builder.set` replaces (appending would write a value `get` cannot see). `Val.get` walks a linked list, and `max_nesting_depth` does not bound the member count |
| `checked_int` | C's integer arithmetic | **Signed overflow is undefined behavior**, so optimization changes the result | The plain operators wrap `mod 2^N` whatever the signedness (the generated code goes through the unsigned type of the same width, erasing C's undefined behavior); **only detection is chosen by type** (`Ci8` through `Cu64`). There is no wrapping type — the plain operators are that |
| `option` | A raw pointer's `null` | **Null references**: a forgotten check compiles | `Option<\|T\|>`'s content comes out only through `switch`. The linter's [H0704] proposes `Option<\|T\|>` for a raw pointer returned as `null` |
| `mem` | `malloc`/`free` | **Double free and use after free** | The arena (`Arena`) is the main route, and `defer` shows in the code where memory is freed. The compiler traces the paths for a use after the free |
| `prng` / `rand` | Java's `Random` / `SecureRandom`, Python's `random` / `secrets` | **A weak random number used for a key** (CWE-330). Both languages hold both kinds, but the names are close, and `Random` or `random` keeps being used for tokens and keys | **The name declares "pseudo"**: the reproducible side is `std/prng`'s `Prng`, the safe side `std/rand`. The plain name `rand` goes to the safe side, so "I need a random number" lands there. Neither is removed: Swift has no weak side, so it cannot rerun training or sampling with the same results |
| `prng` (a number in a range) | Java's `nextInt(bound)`, Python's `randrange`, C++'s `uniform_int_distribution` | **Taking a remainder favours low values** whenever the count does not divide the generator's range. C++'s distributions are each library's own, so one seed gives different numbers on libstdc++, libc++ and MSVC | `below` redraws past the last whole multiple of n; `between` keeps both ends and covers all of `I64`. Both are written in KSPL, so a seed gives the same numbers on every platform |
| `thread` | POSIX threads | **Nothing says which types may cross threads**, so a non-atomic reference count or a raw pointer gets handed over casually | **Not handled.** Constraining `spawn`'s argument types guarantees nothing: it checks only the argument, sharing through a global goes unchecked, and "the constraint is met" would not mean safe (the grounds are "5.1 Why data races are not prevented by the type system" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md#51-why-data-races-are-not-prevented-by-the-type-system)). What exists is choosing by type name (`Rc` / `Arc`, `Mutex<\|T\|>` / a plain value) |

### Known holes, and what would fill them

| File | The issue | The decision |
| :-- | :-- | :-- |
| `reflect` | **Only a container of containers (`List<\|List<\|T\|>\|>`) and an option holding a container or an option cannot be walked** | **One hole stops both.** A kind whose content kind refers to itself needs a payload on `Field_kind`, which `--target=llvm` cannot lower: a global's type is named, so its initializer must be of that type. Filling it needs either bit-packed constants or a second lowering from a layout to an LLVM type, and neither is taken. Lowering only the shapes reflection needs would let only some types' payloads through. The kind is not added ahead of time, since a shape that cannot be walked would then be writable (Principle 5; the mechanism is [3.2.5 in `../../docs/DESIGN.md`](../../docs/DESIGN.md)) |
| `Map` | **Hash flooding.** Many attacker-chosen keys force collisions, an algorithmic-complexity attack (PHP, Python, Ruby and Java all issued CVEs and added hash randomization) | Not handled, because no attacker's key reaches a `Map`. The packages taking keys from outside do not use `Map` (`http` keeps its headers in a linked list too); `make test-conventions` holds which packages those are. **When that check fails, design the seed then**: it fails exactly where a key from outside gets in.<br>How the seed would go in is decided too. `str.hash` is FNV-1a plus extra mixing with a fixed seed, and `Hashable`'s `hash(r: Self): U32` cannot take one, so the signature changes to pass a per-`Map` seed. Randomizing by default is ruled out: the compiler uses `Map` heavily, and an iteration order changing per run makes the generated C non-deterministic and breaks self-hosting's zero-difference check |

## Memory and ownership

### The names of the reference-counting types

Caution: **Do not confuse `Arc` with ARC in a document.** ARC (upper case) is Automatic Reference Counting, the mechanism by which the compiler inserts retain/release; a specification using the three letters always means it. `Arc<|T|>` (a type name) is Atomically Reference Counted, the type shareable between threads, with the role and name of Rust's `Arc<T>`.

**Why the short names** `Rc<|T|>` (one thread) and `Arc<|T|>`, in `std/refcount.kspls`: code needing reference counting repeats the type name constantly, and a long one spends lines and pushes the subject aside in every annotation. `Rc` / `Arc` come from Rust and are widely recognized.

**Why `Weak_arc`**: a weak handle's name is `Weak_` plus its owner's type name, so stripping the prefix gives the owner (`Rc` / `Arc`) and the pairing reads from the text.

**The zero value is an empty that owns nothing**, which retain/release skip. So a table of empty slots such as `Rc<|T|>[N] = ::{}` is written plainly and survives the compiler's chained release over zeroed storage. `empty()` / `is_empty()` spell it out.

**release does not follow what it points at.** Where an `Rc<|T|>`'s T holds ARC by value, return that ownership by hand before the last owner lets go, so a list or tree built from `Rc` is taken apart from the root. Following it would run a recursion of unpredictable depth at the end of a lifetime.

### A container owns its elements' ARC counts

An ARC value put into `List<|T|>` / `Map<|K, V|>` keeps its count balanced through taking out, overwriting, growing, `remove` and `free`. The caller cannot reach the storage, so anything the container fails to release is a leak nobody can fix. The implementation keeps two promises:

* **Zero freshly allocated capacity** (`mem.zero`). Storing an element is an ordinary assignment, so the compiler inserts the overwritten value's release, and releasing garbage as ARC crashes.
* **Return the ownership when discarding.** `free` assigns an empty (the zero value) to the remaining elements, `remove` to the removed one, and a growing `resize` to the old slots it moved from. `mem.zero` runs no release: without an assignment the compiler has nowhere to insert one.

**The promise does not reach through an `Rc<|T|>` element** ("release does not follow what it points at", above): a container holds its elements, not what they point at.

### A constructor's name says where the returned thing goes

`alloc` / `new` / `create` are not aliases: they are split by **where the returned thing goes**, so a call needs no look at the signature first. The table of the three is "Pitfalls" in [std](../README.md); this section holds the rules that come with it.

**The arena `new` receives is where the content goes**: `List.new(a)` returns a `List` value whose elements go in `a`. To place the `List` itself in the arena, carried as a pointer, use `create(a)`; to put an arena in the caller's variable (for a configuration with no malloc), use `Arena.from_buffer`, which returns a value.

**An arena is always the last parameter**, defaulting to `= null` where it can be omitted (`List.new(arena)` and `List.new()` are one function). The signature says whether a function takes one, so the name does not say it again.

Caution: **Do not mark an arena parameter with a suffix**, least of all `_in`, which also means "in that place" (`harness.run_in(argv, cwd)`) and "inside a thing" (`index_in(row, cell)`) and so cannot be read as pointing at an arena.

**`mem.alloc_in(arena, size)` keeps its `_in`.** It cannot merge into `mem.alloc` with a default value. The arena is the first parameter and a default can only go last, while reordering would touch both `alloc` definitions, split by `#cfg`. So the name tells the two apart. Do not rename it as a leftover. A function outside `std` in the same case (a value returned against a pointer) keeps `_in` for the same reason, and says so where it is defined.

**Do not take an arena only to discard it.** The signature is the one mark that a function takes an arena, so the caller reads one there as "I handed over where the content goes", and a discarded one misleads them about whether clean-up is needed.

**Only a function that takes an arena allocates.** In `std/str`, `trim_*` / `strip_*` and `chars.sub` / `sub_from` take no arena and return a view; `replace` / `join` take one and return a copy; `split` / `lines` put the returned `List` in their arena, and its elements stay views.

Caution: **Do not judge by `U8[]` against `U8$[]`.** `sub_mut` returns a writable view without allocating, so the return type cannot tell; the arguments can.

### The receiver aligns the start of a buffer it is given

`mem.init_freestanding_heap()` and `Arena.from_buffer()` use the caller's static buffer as it stands, and **nothing guarantees its head is aligned**. It is usually a plain byte array such as `$buf: U8[4096]`, aligned to 1, whose address depends on the ordering in `.bss`. One 1-byte variable just before it puts it at an odd address.

Misaligned, a header's `Sz` or a pointer straddles a boundary. A host mostly tolerates it. Cortex-M raises an alignment fault and drops into the default handler's infinite loop, **freezing with no output at all**, so the symptom hides the cause.

Caution: **It shows only when an unrelated change adds one byte**, because the ordering decides whether it works.

So **the receiver** aligns it (`align_pad` in `std/mem.kspls`), rather than asking the caller to place the buffer on an 8-byte boundary: the caller cannot control a `U8[N]`'s alignment. Rounding only the chunk header's size up to a multiple of 8 is not enough: every address handed out stays misaligned, since the head itself is.

## Strings, numbers and bytes

### String functions are split by whether they allocate

`std/chars` only looks; `std/str` allocates and makes. **The split is by whether a function allocates, not by line count.** A file that cannot afford the whole string set, such as `std/base64` or `std/sha256`, can still use single-character tests and slicing, since `chars` needs neither `std/mem` nor `std/ds`.

Caution: **Do not make `chars` point at `str`.** `str` imports `chars`, so the cycle would merge the tiers into one lump (`make test-thin-use`).

Two functions cannot move to `chars`. `equals` is one of `Hashable`'s required methods, so it must sit in that impl block, since a trait's implementation is one block. Hence `Map<|U8[], V|>` needs `std/str`. `to_cstr` allocates. `std/strfmt` (a value to characters) and `std/strnum` (a string to a number) are split on the same axis.

### A string allocated and returned is returned read-only

A function that **returns a newly allocated string** (`fs.join`, `str.replace`, `json.Val.as_str`, `sys.get_env` and the rest) returns a `U8[]`. One returns a `U8$[]` only where a writable buffer was asked for (`arena.dup_str` / `Str_builder.slice` / `chars.sub_mut`, and the buffer `rand.fill` receives).

**Write permission spreads through generics.** The read-only conversion (`U8$[]` → `U8[]`) applies to one level of a built-in type constructor only. `List<|U8$[]|>` cannot become `List<|U8[]|>`, since user-written generics are invariant ("6.4 Type conversion (`::`) and implicit casts" in `docs/SPEC-language.md`). Had `fs.walk_files` returned a `List<|U8$[]|>`, the caller would carry the `$` into every variable, field and argument, and could not pass the list to a function taking `List<|U8[]|>`. One character in the return type fixes every type the caller writes.

**"The caller frees it" is no reason to return it mutable**: freeing needs no write permission (`dealloc` takes it through an explicit cast). A caller that needs to rewrite the string uses a function that fills a buffer (`rand.fill`) or one that copies (`arena.dup_str`).

C puts this in the type rather than the binding: since `strdup` returns `char *`, every type in the caller becomes `char *`. KSPL carries axis 2 (the `$` just before `[]`) in the type, so it would get stuck the way C does. **Axis 1 (the binding's `$`) remains**: with a `U8[]` returned, whether the variable later takes a different string is still the caller's choice.

### `dedent`, which removes common indentation, empties a whitespace-only line

`std/str`'s `dedent` leaves whitespace-only lines out when computing the minimum indentation, and empties them in the output; a whitespace-only CRLF line becomes `\r\n`.

**A kept whitespace-only line leaves invisible trailing whitespace**: where the line is longer than the minimum width, the excess stays behind. The text looks aligned, and only a diff or a hash disagrees. Python's `textwrap.dedent` and Java's `String.stripIndent` empty it too.

Caution: **Do not change how a newline is written**: `dedent` lines up indentation and nothing else. Otherwise a path that reads a CRLF document and writes it back would differ exactly where the text passed through `dedent`. An indentation function that also fixes newlines is a second means of normalizing them (Principle 6).

**Do not treat `\r` as a character**, or a whitespace-only `\r\n` line would set the minimum width while the other lines keep theirs (`"    a\r\n  \r\n    b"` would leave two spaces before `b`).

**Do not let the final empty line set the minimum width**, or nothing would be stripped from a string ending in a newline.

### The destination is always named. There are three shapes, and no more are added

String interpolation (`\{x\}`) can stream anywhere, but **no shape lets the destination go unwritten**.

| What is wanted | The notation | The memory |
| :-- | :-- | :-- |
| Stream it | `w.s("n=\{n\}")` | The destination holds it |
| Write into the caller's array | `Buf_writer.new(U8$[]::buf).s("n=\{n\}").slice()` | The caller's array; nothing is allocated |
| Allocate and keep it | `arena.text().s("n=\{n\}").take()` | The arena (`take` lets the builder go) |

It is Zig's three-way split (`w.print` / `bufPrint` / `allocPrint`) without the allocator argument: a `Str_builder` allocates on its own. **Interpolation that yields a value (Python's f-string, Go's `Sprintf`, C++'s `std::format`) is not taken.** That notation returns a new string whose memory something else frees: the garbage collector in Python and Go, `std::string`'s destructor in C++. KSPL frees nothing it was not told to. So the same notation would hide an allocation and a lifetime (to the end of the enclosing block), against `docs/DESIGN.md`'s "Responsibility can only be assigned for what the writer can see". Before adding a fourth shape, confirm it cannot be written with the three.

Why two writers, `std/str`'s growing `Str_builder` and `std/buf`'s `Buf_writer`, which writes into the caller's array and never allocates? Some places cannot allocate (freestanding), and some must not inside a loop: a `Str_builder.new()` with its `defer b.free()` in a control loop costs a malloc/free every round. Yet output of unpredictable length, forced into a fixed buffer, spreads the truncation decision across its callers. Both are `Writer`s, so interpolation works with either. **The choice is "may it allocate" and nothing else**: splitting by speed or by an upper bound would make two ways to one purpose.

**Why an overflow is not a panic**: the length is unknown until the text is assembled, and stopping a program because a display string outgrew its buffer is out of proportion. `Buf_writer` counts what it dropped and reports it through `overflowed()`. That serves the purpose of C's `snprintf` returning the length it could have written, but the count is held in the writer, since partway along a chain no return value can be checked.

### The digits of a floating-point number are assembled here

`std/strfmt` does not take a floating-point number's digits from libc's `%f`. It assembles them exactly with `std/bignat`'s multiple precision (Steele & White / Burger & Dybvig's free format, plus a cut at a fixed place), in one implementation for hosted and freestanding alike. What it prints is "3.6.1 The default notation for primitives" and "3.6.2 Format specifiers" in `docs/SPEC-language.md`; this section holds why.

**Why here**: freestanding has no libc. Yet `Str_builder` conforms to `Writer`, and the vtable references every method's thunk. So `snprintf` would be linked into a bare-metal program that never writes a float (`--gc-sections` cannot drop a thunk).

**The default is the shortest representation that reads back to the same value**, as Rust, Swift, Python, Java's `Double.toString` and C++'s `std::format` print. It switches to the exponent form at JSON's and JavaScript's boundaries. Where the languages differ, KSPL follows JSON, the most common output format, so `\{x\}` and `std/json` print by one rule. An F32 is shortest at its own width, or `0.1F32` would print as `0.10000000149011612`.

**`.N` comes from the same generator**, exactly: `1e300` at `.2` gets all 301 integer digits right, as libc's `%.2f` does. It rounds ties to even like `printf`'s default, since rounding half away from zero would print `%.0f` of `0.5` as `"1"`, a visible disagreement. `make test-freestanding-math` compares against the real `snprintf` as strings: every precision from 0 to 19 agrees, `1e300` and subnormals included.

No table: Ryu / Schubfach / Dragonbox are fast with a table of powers of ten (about 600 entries of 128 bits). Multiple precision alone spares every program handling strings that memory, and lets the parser (`to_f64`) share the base. It is fast enough for formatting. **It uses about 3KB of stack** (four multiple-precision values), which a bare-metal program formatting a float on a small stack must allow for.

NaN and infinity (`nan` / `inf` / `-inf`) pad to a width with spaces, since the `0` flag and the digit separator mean something only for a run of digits.

`%p` cannot match the host (glibc prints lower case with `0x`, MSVC's UCRT upper case zero-padded without it). Bare metal fixes `0x` plus lower-case hexadecimal as **its own contract**, and the harness checks that contract, not agreement with libc.

### Converting a string to F64 is not left to libc

`std/strnum`'s `to_f64` does not call `strtod`: a decimal-to-F64 conversion written in KSPL serves **both targets**.

Why: left to `strtod`, `to_f64` could exist only under `cfg(!freestanding)`. Since `std/json` and `std/argp` call it, **a build for a microcontroller would fail at type checking**. One implementation returning the same value everywhere outweighs accepting strings that vary with the environment.

**What is given up**: `strtod`'s `inf`, `nan` and hexadecimal floating point, which JSON's numbers never hold and a configuration value holds only ambiguously.

**Every text is rounded correctly** (to the nearest F64, ties to an even mantissa). A text of at most 19 significant digits, with a mantissa below 2^53 and a power of ten within ±22, takes one exact step. Any other is approximated, compared with the midpoint to its neighbour in `std/bignat`'s multiple precision, and moved 1 ulp at a time (Clinger's AlgorithmR). Why those limits, and why reading 768 digits of mantissa is enough, is `pow10_max` / `f64_exact_digits` in `std/strnum.kspls`. So regression tests may compare for equality, against literals the C compiler rounded correctly.

No table here either: Rust's `dec2flt` and Go's `strconv` widen the fast path with a table of powers of ten (Eisel-Lemire, about 650 entries of 128 bits), but KSPL sends every other text to multiple precision. **The same implementation runs freestanding**, so sparing a program that merely reads strings the table's memory outweighs slowness on outlying texts (a long mantissa, a power beyond ±22).

Caution: **Cap both the mantissa and the scaling**, or a 20th digit overflows U64 and `1e999999999` spins forever, though the result can only be infinity or 0. The caps and their reasons are `f64_mantissa_digits` / `f64_exp_limit` / `f64_exp_digits_limit` in `std/strnum.kspls`.

### Format-specifier dispatch per type stays as an impl per type

`std/strfmt.kspls` implements `fmt_spec` / `fmt_prec` / `fmt_hex` / `fmt_char` separately for twelve built-in types, each delegating to the shared `int_fmt_spec` / `hex_fmt_spec` / `float_fmt_spec`, so the impls read as one shape repeated. **They are not folded, because the return type differs per type**: `Int_fmt` (signed, and `U8` through `U32`), `Uint_fmt` (`U64`), `Float_fmt` (`F32` / `F64`). A default body declares one return type.

Note: `std/checked_int.kspls`'s eight types stay apart for the same reason. There the promoted type and the boundary value differ per type, and they are the body itself. Generics would need a trait holding an associated type and constant (Rust's associated type / const, Swift's `static var max`), and KSPL has neither. When they arrive, `checked_int` is the first to use them.

### Hexadecimal is written with a format specifier, and only `0x` and a fixed digit count stay on the wrapper type

The rules of the hexadecimal specifier (`\{v:x\}` / `\{v:08x\}`, with no `0x`) are "3.6.2 Format specifiers" in `docs/SPEC-language.md`; this section holds why.

**Each specifiable item has its own method**: `fmt_spec` (width, `0`, `,`), `fmt_prec` (plus digits after the point) and `fmt_hex` (hexadecimal). Only a type the item applies to implements it. As arguments to one method, a type with nothing to apply them to could only ignore them, and a `:x` on a float or a `:.2` on an integer would be accepted with no message. Split, the interpolation calls a method the type lacks and stops with "there is no such method".

`hex` in `std/strfmt.kspls` exists for one thing only: a leading `0x` (`\{strfmt.hex(addr, 8)\}` writes `0x10000144`). Without the prefix a specifier says it all (`\{v:08x\}`). **No wrapper stands beside a specifier for width, zero padding, grouping or digits after the point**: a second spelling of the same output goes against Principle 6 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md). Where the width is known only at run time, the method a specifier desugars to is called directly (`v.fmt_hex(n, true, false)`, `v.fmt_spec(n, true, false)`).

**A signed value goes through the unsigned type of the same width**, because hexadecimal shows the bits the type holds. Widened straight to `U64`, sign extension would fill the high bits with 1s and print `I32`'s `-1` in 16 digits (C's `%x` prints 8). `Sz` has no same-width unsigned name, so it widens to `U64`.

**The extension-method shape `impl Writer { fn hex(...) }` cannot be taken**: a method added to a trait has no vtable slot, and the compiler rejects it at the declaration. To extend a trait, use a free function or a conforming wrapper such as `Hex_fmt`.

### Converting between bytes and integers holds no format string

`std/bytes` is a row of **functions carrying the width and byte order in their names** (`get_u32_be(at)` / `put_u16_le(at, v)`), with no format string like Python's `struct.pack(">HH", a, b)`.

**Why**: KSPL has no type checking for variadic arguments. With a format string, the format and the arguments' count and types could drift apart and still compile, failing only at run time. That is the structure behind `struct`'s standard misuse. Naming the position and width once each costs a few lines, but a mistake stops the compilation.

**Why the byte order has no default**: a mix-up silently garbles the value and no type catches it, so the intended order is written every time.

**Why there is no checked version**: out of range panics, as a slice index does. Returning a `Result` would put a `?` on most calls, whose bounds are already known, and bury them. Where the input's length cannot be trusted, check `len` before the call.

**Why it holds `crc32`**: it has two users (the image checksum a boot ROM requires, and an append-only log's record check). It does no pre- or post-processing: the initial value and the final inversion differ by purpose. The boot ROM also reverses the bit order of input and result against the standard, so any default would silently give one caller a different value. Bit reversal stays out while it has one caller (Principle 1; std can take it once there are several).

**Why it holds `fill` / `copy_from`**: filling with zeros and copying a range are common, and `mem.copy` takes a `Void$@` and a byte count, so no bounds check applies. `copy_from` behaves as memmove, not memcpy, because shifting a range within one buffer is a real use.

## Containers and iteration

### What a container requires of a type is written as a trait

What `Map<|K, V|>` requires of its key type (`hash` and `equals`) is the trait `ds.Hashable<|Key|>`.

Caution: **Do not express a requirement by name agreement alone.** It is then written nowhere, and a key type failing it gets a distant error inside `std/ds.kspls`. Where there is a requirement, express it as a trait (the rule is ② in `docs/DESIGN.md` §3.2.1). Every key type declares its conformance (std's own are `I32` / `Sz` / `U8[]`). `Map`'s constraint `K: Hashable<|K|>` then reports a type that does not conform as not implementing this trait, where the user wrote it, rather than as `has no field or method named 'hash'` inside std.

**`Hashable.equals` and `Eq` are different requirements.** `Eq` is what `==` desugars to; `Hashable.equals` asks, by an explicit call, whether two keys are the same. `U8[]` deliberately does not implement `Eq`. `a == b` would become an O(N) content comparison, and a reader could not tell whether `==` compares contents or pointers (the reason `switch` cannot take a `U8[]` subject; `docs/SPEC-language.md` §6.1).

The other key arrives as the type argument `Key`, as in `std/lang`'s `Add` / `Eq`, because `Self` cannot be written on an argument other than the receiver (`docs/DESIGN.md` §3.1). The compiler rejects such a `Self` at the definition rather than let it fail in the C compiler with no KSPL diagnostic.

**The built-in types' conformances go in std.** In the compiler, an implementation that exists to make a type a key of std's containers would invert the layers. So `Sz`'s `Hashable` sits in `std/ds.kspls` beside what requires it.

`ds.fmix32` is the one place the mixing lives, so no key type copies it. Without it, a key whose low bits do not differ crowds one bucket, and `Map` degrades into a linear search (the masking is described at `fmix32` in `std/ds.kspls`). **Measure before adding it — adding it everywhere is a mistake.** In a `hash` on the innermost loop the extra operation outweighs the diffusion, so a parser's memo lookup and a key of token IDs, whose low bits already differ, leave it out.

### A function that returns every entry does not build a nested generic

`Map` is walked by an iterator, `items()`, not by a listing (`List<|Map_entry<|K, V|>$@|>`). A listing is nested generics, so every `Map` type would specialize **a whole set of `List`** (`std/ds`'s container and `std/seq`'s chain) at that element type. The cost lands on specialization. In a large program, a single nine-line function returning a listing shows in translation time, bodies analyzed, peak memory and generated C size. Every caller builds the listing, walks it once and drops it, so an iterator loses nothing.

**The test is whether the return type takes another generic as a type argument.** `List<|U8[]|>` does not (`U8[]` is a built-in array, not a generic). Where even one caller needs `.len` or an index, a listing is fine; the one kept inside `std/ds` is there because sorting needs all of it.

### Iteration has one notation, `for x in`

`for x in` expands two ways, and the subject's type chooses, not the writer. A type with a `.len` field and an index expands to indexing; one declaring `std/lang`'s `Iter<|T|>` (`next(): Option<|T|>`) expands to `next()`. The rule is `docs/SPEC-language.md` 7.2, the reasoning `docs/DESIGN.md` 9.2.

**Do not make a `has_next` / `next` pair.** It would bring a second notation into std, `for it.has_next() { x: = it.next(); … }`. That is also why `Iter` holds only `next`: split in two, calling only one of them becomes writable.

**A function returning elements in order that may allocate them all is eager, returning a `List`** (`str.split` / `json.Val.arr_list` / `fs.read_dir`). A `List` carries `.len` and an index, so `for x in` walks it by index; it is not given `Iter`, which would win over the index. Each `std/seq` operation needing the whole (`order_by` / `reversed` / `distinct`) is eager too. Only `where` / `select` are lazy, driven by `for x in`, `to_list(arena)` or `count()`. The eager side allocates more, so only code tolerating a slowdown (tools, example code) may rely on it. Where it may not, `std/` itself included, is for `docs/DESIGN.md` 8.3 to say.

**`order_by` is the one sort, and it is stable** (its algorithm is described at `order_by` in `std/seq.kspls`). Equal keys keep their order, so an answer built from a sorted list (completions, references) is the same on every run, and sorting by a second key after a first gives the expected listing. There is no unstable variant: its one gain, sorting in place without a second buffer, is not what `std/seq`'s eager operations are for, since they return a new list anyway.

**What eagerness costs** is the list's own storage (16 bytes per element), allocated up front (the elements are not copied); a caller streaming a huge input must allow for it. These functions take an `arena`. With `null` they allocate from the global heap (as `List.new` does), and the caller frees the result with a `defer`. So `for x in s.split(…)` can be written directly only when an arena is passed: with `null`, nothing could free the temporary the loop uses.

### Why the chain's stages cannot be folded

`std/seq`'s `Keep` and `Conv` each write `where` / `select` / `to_list` per stage; only `count`, which needs nothing but `next`, is a trait's default body, on `std/lang`'s `Iter`. **The three stay per stage for different reasons.**

* **`where` / `select` cannot move.** Their return type puts `Self` in a type-argument position (`Keep<|Self, T|>`). A trait holding that shape cannot be implemented even when the method has a default body: in the body copied into a generic implementation such as `Keep<|S, T|>`'s, that `Self` is not resolved.
* **`to_list` could move, and stays by choice.** Its return, `List<|T|>`, holds no `Self`. `std/lang`'s `Iter` cannot take it, since that file imports only `std/libc` and so cannot name `List` / `Arena`. A trait in `std/seq` itself can, and one body serves both stages: the trait's type parameter becomes each stage's element type, `T` for `Keep` and `U` for `Conv` ("5.1 Traits (`trait`)" in [`../../docs/SPEC-language.md`](../../docs/SPEC-language.md)).

**Folding `to_list` alone saves one of its two bodies**, not enough to pay off with two kinds of stage. Fold once the kinds grow, since that is when the count multiplies; `where` / `select` can join only once that `Self` is resolved.

**A chain can be driven any number of times**: the receiver is taken by value, so `for` and `to_list` each advance their own copy, whereas a Python generator is empty after one pass.

Caution: **Assemble and consume a chain in the same frame.** A predicate's environment sits on the caller's frame, so a chain returned from a function points at a dead frame ([`../../docs/DESIGN.md`](../../docs/DESIGN.md) §8.1).

### Only `where` and `select` ride on the chain, and a predicate is a `Callable1`

Operations needing the whole (`order_by` / `reversed` / `distinct`) and those returning one answer (`first` / `any` / `all` / `min_by`) live on `List<|T|>`. There is no `sum`: without overloading it would be one method per numeric type, each the same three-line loop a `for` writes directly. **Only `where` and `select` ride on the chain**, because the stages' types nest. Each new kind of stage multiplies the code that keeps every operation callable from every stage, since the ones returning a stage cannot become a trait's methods (the section above).

A predicate, selector or comparator is taken as `Callable1` / `Callable2`, so a caller passes a closure as it is.

Caution: **Do not turn it back into a function pointer.** `where` / `any` / `all` / `first_where` are useless unless the predicate can be given what is searched for: "does it contain this node" could not be written, and a plain `for` would replace them. A function value with a capture carries the function and its environment, which one function pointer cannot hold ([`../../docs/SPEC-language.md`](../../docs/SPEC-language.md) 8.1, "Closures").

**Whether a callback is a function pointer or a `Callable` depends on whether it needs a capture** (the rule is [`../../docs/DESIGN.md`](../../docs/DESIGN.md) §8.2). `std/fs`'s `skip_dir` makes do with a constant set of names, so it takes a function pointer. `std/thread`'s `spawn` has no choice, since its `entry` crosses the C boundary. Do not reason "it is a predicate, so a `Callable`": taking a `Callable` where no capture is needed stops one named predicate from being passed to several functions.

### Indexing costs one comparison, and the stop is called out of line

`xs[i]` on a `List` calls `at`, which compares `i` with the length and calls `bounds_panic` (`std/lang.kspls`) when it is out of range. **`at` is meant to vanish into its caller**, leaving the comparison and the address arithmetic, so it carries `#inline`.

**`bounds_panic` carries `#noinline` for that to happen.** The C compiler judges whether a function is small enough to copy into its caller after it has copied that function's own callees into it. Copied into `at`, the message building (`Panic_msg`, three numbers turned into text) made `at` too big, so every `xs[i]` stayed a call. Nothing else changed in the program, since the stop runs only when the index is wrong. Taking that copy away turns every `xs[i]` of an optimized build into the comparison inline; a program that indexes lists throughout runs measurably fewer instructions.

Caution: **Do not move the message building back into `at`.** The cost does not show in a test or a diagnostic, only in every loop over a list.

### The ring buffer neither blocks nor locks

`std/ring.kspls`'s `Ring<|const cap: Sz|>` underlies the path where an interrupt writes a little at a time and a task reads in bulk.

**Why it does not wait**: waiting needs something that knows whom to wake (a scheduler), which would make it unusable right after a bare-metal start-up and inside an interrupt handler. Instead `write` / `read` return how much went in or came out, and the caller decides.

**Why it does not lock**: the right exclusion depends on where it sits — disabling interrupts between a handler and a task, a hardware spinlock between cores, nothing on a single-threaded host. Any one built in is too much or too little elsewhere.

**Why the capacity is a const generic and the caller supplies the buffer**: a container touched from an interrupt handler cannot live on the heap (`alloc` takes a lock, so an ISR calling it freezes). With the capacity in the type, `% cap` is a constant in the generated C, so even a target without hardware division (Armv6-M) calls no software division.

**The wraparound is not guaranteed by a type.** Wrapping the index in a modular type would stop a forgotten `% cap`, but the type spreads into signatures and needs a conversion at every boundary. Rust's `std::num::Wrapping` shows this: methods such as `wrapping_add` are the usual way there. Instead `head` / `tail` are `priv` and only `step` advances them. Tests, not the type, catch a forgotten one: `make debug`'s ring tests always cross the wraparound, since writes that do not cross pass with or without `% cap`.

Caution: **Only the wraparound is guaranteed, not the memory's bounds.** `Ring<|cap|>.new` receives only the head address of a `U8[cap]`, so a `Ring<|512|>` over a `U8[8]` writes out of range with no diagnostic. Matching the sizes is the caller's job, so do not read the type argument as watching the bounds.

**Why `peek()` returns a slice into the buffer**: most embedded send paths stream what accumulated straight to the device, and copying it out would add a working buffer. The cost: `peek()` returns only the contiguous part up to the wraparound, so a caller taking everything goes round `peek` → `consume` twice. Joining the parts inside would need a memmove, defeating the point.

## Failures and the log

### A failure is returned as `T?E`

Every file reports failures the same way. Returned as a `Bool` or an `Option`, they would make the caller read each signature for the function's style. `std/fs.kspls` returns every failure as `?Fs_error`, as `std/io.kspls` does with `?Io_error`.

Caution: **Do not mix `Option`, `Bool` and `?Fs_error` in one file**, or the caller must remember per function how to receive a failure.

**A predicate stays a `Bool`.** `fs.exists` / `fs.is_dir` answer a question, and "it does not exist" is a normal answer; as `?Fs_error` they would put a `catch` on every normal path. Do not conflate a failure with a no.

**Do not split into variants what cannot be told apart.** `fs.Fs_error.operation_failed` does not distinguish "already exists", "no permission" and "the parent is missing", because the C runtime (`ksplc/gen/runtime/hosted.c`) does not pass errno up. To subdivide it, pass errno up first. A variant pretending to know leads the caller to write a wrong branch.

### Logs and diagnostics share level names, not meaning

`std/log` has four levels, **the diagnostic ladder's own**: error / warning / information / hint. One set of names serves both ladders, so a weight is the same word wherever it is met.

**The question still differs, and the word does not say which**: a diagnostic's `warning` asks for action, a log line's says only that the line passed the filter.

The price: **`hint` is the level turned on while chasing a problem**, where Rust's `log`, Python's `logging` and slf4j say `debug`, so a reader from any of them looks for that word in vain.

**The mark is one letter** (`E` / `W` / `I` / `H`), so its column keeps one width for the eye and for a spreadsheet's filter. `rank` and `word` are `Level`'s own methods: what a weight is worth and which mark it prints are the enum's business, and nothing outside needs either.

### A line that is not emitted is not built

**`at` is the primary entry point, not an optimization.** KSPL's interpolation streams into a writer and cannot produce a value: `say(.hint, "conn #\{n\}")` is rejected ("string interpolation can only be written as the argument of a writer chain"). So every line carrying a value goes through `at`.

**The shape gets the cost for free.** Elsewhere `log.debug("x=\{heavy()\}")` builds the text and discards it when the level is off. The two escapes other libraries use, a macro (Rust) and a second formatting language (Python, slf4j), do not exist in KSPL.

**So the level check returns the destination, or nothing:**

```kspls
if w: = log.at(.debug)
  w.s("x=\{heavy()\}")
```

With the level off, the body does not run, so nothing is interpolated or allocated. That is Rust's guarantee, with no macro, no second way of writing a value, and no new notation, since `if <name>: = <expr>` binding an Option is the language's own idiom. `say(lv, text)` remains for a literal or a `U8[]` already available: the narrower path, not the cheaper one.

**`Option<|Writer|>` is not worth a typedef.** `typedef Opt_w = Option<|Writer|>` would name the same type, but a shorter name pays only where the type is written, and a caller writes `if w: = lg.at(.error)`, naming no type.

### The destination is the caller's, not a global

Rust's `log`, Python's `logging` and slf4j reach their destination through global state, and that causes the complaints: a facade with no implementation installed emits nothing, and "which handler did this line go to" means walking a tree the program never wrote down. `Log` is a struct the caller builds and holds. So the destination is chosen explicitly in one place, and no vtable is reached behind the caller's back.

**A top-level variable cannot hold one**: its initializer must be a compile-time constant, and a `Writer` is a trait value. A program logging from several files passes a `Log$@` down instead of reaching for a global name.

### A log line ends when the next one opens

`at` opens a line and the caller writes its body; **the line ends when the next one opens, or at `done()`**. The caller never has to remember a newline: this repository refuses a step that is easy to forget and silent when forgotten. The price: the destination must not be shared mid-line, which is stated rather than promised (`Log` in `std/log.kspls`; Principle 8 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

### Error and warning lines are flushed at once

An `error` or `warning` line is handed to the destination the moment it closes; `information` and `hint` lines are left to pile up as the destination sees fit. **Nothing turns this off**: a setting nobody would turn off is a second means to one purpose (Principle 6 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

**The reason is what piling loses**: when the run is killed, the tail that never went out is gone, and those are exactly the lines that said something went wrong.

**Closing a line pushes it, not opening it**, since a line `at` opens is still being written. `end_line` does it, and both ways into a line close through it. The cost lands only on the heavy levels, rare by construction, and a logger writing into a `Str_builder` pays nothing, since its flush does nothing.

### The caller's position reaches `say` as a default argument, and printing it is the logger's setting

`say` and `at` end with `file: U8[] = caller_file, line: Sz = caller_line`, so the caller's position arrives without the call spelling it out ("The caller's position" in [`../../docs/SPEC-language.md`](../../docs/SPEC-language.md) 8.1.1). `assert` uses the same mechanism. **Whether the position is printed is `new`'s `place`, set once per logger**, with no second way in.

Caution: **Do not make it a per-call choice.** One row would carry three fields and the next five, and a spreadsheet cannot filter a column that moves, which is the whole reason for the separator. A ragged row is worse than one with no place.

**It goes back one step only**, so `say` passes the two to `at` explicitly, and so must a wrapper of your own; left to default, every line would name the wrapper.

**They cannot be made mandatory**: `caller_file` and `caller_line` can be written only as a default value (at a call site the compiler answers `undefined path or identifier`). So a mandatory position would be a literal file name and line, hand-written by every caller of `at`, the recommended path for a costly body, and stale at the next edit.

### A comma is a separator, not a format

Passing `","` as `new`'s `sep` (by default `": "`) gives rows a spreadsheet filters by column: the tag, the mark, the place when `place` is on, and the body.

**The body is written exactly as the caller wrote it, on purpose.** Nothing quotes it, so a caller that needs columns of its own writes them: `say(.error, "row 1 value,row 2 value")` makes three columns, not one. Quoting would take that away and make every line pay for doubling quotes whether or not anything reads the log as a table.

Caution: **So the caller owns the row's shape past the fields written here.** A body holding a newline breaks the row, and one holding a quote is not what a strict reader expects: the logger separates fields, it does not escape them. The check is `test_log_parts_its_fields_with_the_separator_given` in [`tests/log_test.kspls`](../tests/log_test.kspls).

### No time is stamped here

`std/time` needs libc, which would shut out a device with no debugger, where a log is worth most. `std/log` imports nothing, so it builds under `--freestanding`; a destination that needs a time writes one itself.

## The process: its arguments, its output, its children and the clock

### How an argument's destination is declared, and why anything unknown is an error

Each declared item receives **a pointer to the caller's variable**, so the default value is that variable's initial value.

```kspls
$out: U8[] = "out/result.jsonl" // the default is the variable's initial value itself
$vocab: I64 = 2000
$verbose: = false
p: = argp.Parser.create("build_corpus", "build a corpus", arena)
p.str_opt("--out", out@, "where to write")
p.int_opt("--vocab", vocab@, "the target vocabulary size")
p.flag("--verbose", verbose@, "show the progress")
p.parse_or_exit(sys.args(), arena)
```

The destination carries `$` because argp rewrites it (without it the diagnostic is `expected 'Bool$@', but got 'Bool@'`), and the `$` also tells the reader the variable changes later. **There is no lookup by name** (`get_str("--out")`), so a misspelt name, or a mismatched type, is caught at compile time, not at run time.

Caution: **Anything starting with `-` that no declaration knows is an error, never let through silently.** Besides misspellings, it catches the shell's word-split fragments of a path holding a space; ignored, they cause an untraceable failure. The price: a negative number such as `-5` cannot be a positional argument (the convention that everything after `--` is positional is not implemented). A lone `-` is positional, meaning standard input by convention.

**A value is joined with `=`, and only so** (`--out=result.jsonl`); `--out result.jsonl` is refused with "needs a value, written as '--out=<value>'". Two spellings of one option are two ways to write the same thing (Principle 6 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)), and the spaced one has to guess. Is the next argument the value or another option? In `--root --show`, taking `--show` serves a folder that does not exist, which shows 30 seconds later as the server failing to start. And may a value start with `-`? Joined, the value is whatever follows the first `=`, `-7` and an empty value included, and an option never takes the argument after it. Positional arguments are taken only where declared (`p.positional`, read from `p.rest`), since a word-split fragment can also arrive in the positional shape.

**An item has one name, and there are no short names.** An `--in-place` has no `-i`, and a `--define` no `-D`. Two spellings of one option are two ways to write the same thing (Principle 6 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)): a script, a document and a model's answer each pick one, and the reader must know they are the same. A short letter also means different things from tool to tool (`-i` is in place for `sed` and `clang-format`, ignoring case for `grep`, asking first for `cp`). Joining a value to it (`-Dflag`) needs its own matching rule. The cost is typing, and the lines repeating an option are in build files and scripts, written once. `--help` has no `-h` either: a rule with one exception is two rules to learn. And `-h` means something else elsewhere (`ls -h`, `df -h`: human-readable sizes; `grep -h`: no file names). A `-h` is refused as an unknown option, and the refusal prints the usage, so the reader still gets what they came for.

### A program does not lose its own output on an abnormal exit

`panic` (`std/lang`) flushes standard output before `abort()`, but **the log's last line is not necessarily where the program died**. Into a pipe (CI's log collection, `| tee`) the C library buffers fully, and an abnormal exit, death by a signal included, loses everything unflushed. So a program whose main clue is how far it got, such as the test harness, calls `io.set_line_buffered()`. Its flush at each newline means the same on both backends and every platform, where `setvbuf`'s `_IOLBF` (1 on glibc and macOS, 0x40 on MSVC's UCRT) would put another mode into genllvm's IR on Windows.

Caution: **The code that keeps the panic record must not itself crash.** freestanding's `panic` sets the message, the SP and a stack fragment aside in `.noinit_panic`. But `kspl_get_sp` is per-architecture inline assembly that returns 0 where an architecture lacks it. Reading address 0 crashes that read, and not one word about why the program stopped survives: on wasm this turns "there is not enough space" into `memory access out of bounds`. So when `sp == 0` the fragment is not read, and `take_panic_record` returns a `stack_len` of 0.

### A run of checks goes on past a failure, and names what failed on its last line

`std/verdict` runs tests one at a time (`start` / `pass` / `skip`, stopping at `std/lang`'s panic) or as **a run of checks** (`begin` / `check` / `finish`). A run of checks goes on past a `FAIL` line and ends on one `RESULT:` line naming each failed check; the exit code is the verdict. The second shape is for a run with something to stop before it ends (a server still listening on its port), and for many independent checks, where the first failure is not the only one worth reading.

**The names on the `RESULT:` line are copied into the tally's own room** (`Names` in `std/verdict.kspls`). A name passed to `check` is often built in the caller's scratch arena and freed straight after, so a view kept until `finish` would read freed memory. An allocation would make the tally the one part of a failing run that can itself fail.

**A child's run is read here too** (`run_child` / `run_children`), since a check on a compiler or a tool asks two things of it: how it ended and what it wrote. Its stdout and stderr come back as one text, since a diagnostic appears on either, by version and path. A run that could not start or was killed says so in that text, so the code alone never passes for "it ended non-zero". `run_child` waits at most `default_timeout_ms` unless the check passes its own limit. `run_children` runs `jobs()` children side by side and returns them in the input's order, so the code that judges has one form, sequential or parallel.

**A finding is indented on the lines below its `FAIL` line**: the gates read a line by its head (`FAIL `, `RESULT:`), so a finding at a line's head could be read as a verdict.

Why a walk that walked nothing fails is at `check_list` in `std/verdict.kspls`; why this stands in `std` at all is "13.6 What tests share stands in std" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md). The check is `make debug`, which runs each shape as a child and holds its whole output.

### Fuzzing watches the program from outside

**A round of `std/fuzz` is one run of the program, judged from outside by how it ended** (its exit code, an announced stop, or no end within the wait). Nothing is built into the program: no coverage instrumentation, no entry point called in the fuzzer's own process.

**Why**: in another process a crash is seen, while inside the fuzzer's process it would take the tally down with it. With nothing built in, the same fuzzing runs on all three platforms with the C compiler as it is, while a coverage-guided fuzzer needs a runtime the toolchain may not carry. The same seed, seeds and count give the same rounds: `std/prng` is written in KSPL, so a round generated on Linux is generated on Windows too. A gate's failure is reproduced at a desk from the two numbers it prints. A gate can also run a fixed count, where a coverage-guided fuzzer runs until stopped.

**A round past its wait is run again with five times the wait** before it counts as not ending, since a crowded machine slows a finite round, and the target is a program that never stops. `check_reach` keeps a run that tried nothing from passing: checking only for crashes, a mutation that broke every seed at the parser's entry would go green.

**What this gives up**: coverage and speed. A coverage-guided fuzzer keeps an input that opened a new path and mutates it further, reaching deep paths a blind one reaches only by luck. Here the seeds carry the depth, so the suites gather real files and write seeds from each writer. And a process per round is far slower than a call.

### Writing to a closed pipe returns an error value, and output whose destination is gone ends quietly

POSIX terminates a process writing to a pipe whose reader has closed (SIGPIPE's default). So a server whose peer leaves, an ordinary event, dies **printing nothing**: from outside no request comes back, and nothing points at the cause.

**The runtime ignores SIGPIPE, and a writing function returns the refusal as a value** (`Piped_child.write` returns false, `std/net`'s send a failure).

**Standard output is the exception**: Unix promises that `prog | head` ends quietly. So once a write comes up short, `std/io` restores SIGPIPE's default and raises it on itself. A buffered `fwrite` reports that it wrote, so the flush passes the same check, the only place the loss shows.

Caution: **Do not stop at merely ignoring it.** The output is then silently discarded, and the program runs on to the end having lost its destination.

**Do not carry the ignoring setting over to a child**: it survives exec, so `git`, `clang` or a shell pipeline would not die either, and the `yes | head -1` family would never finish. It is restored between the fork and the exec.

The implementation is "Writing when nobody is left to read it" in [`../../ksplc/gen/runtime/hosted.c`](../../ksplc/gen/runtime/hosted.c). The check is `make test-broken-pipe`.

### The output of children started in parallel is received through files, not pipes

`std/subproc`'s `run_many` sends each child's two output streams to files in the caller's directory, and reads them after reaping it.

**Why not pipes**: a pipe fills before the parent reads it, and the child stops. Watching every child's pipe at once needs a `poll` set or threads, which only the C runtime could hold. A file does not fill, so starting and waiting in order is enough, and the scheduling stays in KSPL. The cost is the trip through the disk, which rules it out when measuring the output's latency.

**Why not `run_capture` on threads**: `alloc` updates the global usage counter non-atomically, so allocating from several threads races (the same constraint as `spawn_async`'s note); processes side by side keep every allocation on the parent's one thread.

**Why results are reaped in submission order**: they then match the input, so the caller carries no mapping. The cost: one slow item at the front leaves the slots behind it idle; reaping in completion order would keep the slots full, but leave restoring the order to the caller.

### Three ways to start a child process, split by where its output goes

`std/subproc` **does not put the variations for starting a child on one function as options**.

| What is wanted | The function | Where the output goes |
| :-- | :-- | :-- |
| Run it and collect everything | `run_capture(argv, cwd, timeout_ms, cap, arena)` | The parent's memory (cut at the cap) |
| Run many side by side and collect everything | `run_many(jobs, …)` | Files in a directory (the section above) |
| Keep it running | `spawn_redirect(argv, cwd, out_path, err_path)` | Files the caller named |
| Talk back and forth | `spawn_piped(argv, cwd)` + `read(buf, timeout_ms)` | A pipe (with a timeout) |

Why not options on one function: Python's `subprocess` and Java's `ProcessBuilder` take that shape, which is easier to start writing. But **the shape cannot stop the combinations that deadlock**: waiting for the child to finish while still attached to its pipe stalls once the buffer fills. Both leave the avoidance to the user's discipline, by documentation alone. Split by purpose, that combination cannot be written.

**Why only the back-and-forth function takes a timeout**: only a pipe's buffer can fill. So the timeout is an argument of the read, with no form that omits it. Its expiry comes back as a value, which makes the stall a diagnostic at once; Java expresses a timeout as `waitFor`'s false return value, which can be overlooked. The timeout also tells a slow child from a dead one (a dead one returns 0, as EOF).

**Why `spawn_redirect` has nothing to read with**: its output goes only to files, so a read function would leave open which to read from. In Java, `getInputStream()` silently returns empty once `redirectOutput` is used.

**Why `spawn_redirect` alone asks for no console window**: on Windows, a console program started by a program without its own console gets a new console window. `spawn_redirect`'s child already writes both streams to files, so the window would show nothing, and the child is meant to outlive its starter. The collecting functions must not ask: Ctrl+C in the starter's console does not reach a detached child, which for a parallel build means orphaned compilers.

**Reading a finished child's output as one text is a way of reading the result, not another function** (`Run_result.text`).

**The split is on the KSPL side**: C starts a child one way, `kspl_proc_start` (the arguments, the working directory, and a pipe or a file for each standard stream). The four functions combine it in KSPL with `kspl_proc_poll` / `kspl_proc_read` / `kspl_proc_wait` / `kspl_proc_kill`, the collection cap, the timeout and the kill on a timeout included.

Caution: **Do not add a per-purpose way of starting to C.** C code is written twice, for POSIX and for Windows, and the Windows copy cannot be run locally. C keeps only what needs the OS's API directly (`fork` / `CreateProcessW`, creating a pipe, Windows's command-line quoting, the UTF-16 conversion).

### The clock has separate functions for 'elapsed' and 'date-time'

`std/sys`'s `mono_us()` is a monotonic clock, meaningful only as differences; `std/time`'s `now()` is the wall clock's epoch seconds.

Caution: **Do not measure elapsed time with the wall clock.** Rewound by NTP or a user, it gives a negative difference, which a timeout reads as "not yet" and so waits a whole round.

**No function for CPU time is held**: CPU time does not advance while waiting, so used as elapsed time it erases whole spans spent reading the source. If "how much was computed" is needed, add it under a different name; merged into `mono_us`, one name would mean different things per environment. Zig, Rust and Go make the same split. C has only `time()` and `clock()`, neither correct for elapsed time, so everyone calls `clock_gettime` directly.

### A date-time that does not fit a fixed-length date-time format is refused as a value

`std/time`'s `write_rfc1123` / `write_iso8601` write into the caller's fixed-length array (why they take no `Writer` is "Why one import brings few files along" below). RFC 1123 and RFC 3339 fix the year at 4 digits (`date-fullyear = 4DIGIT`). So the year 10000 and dates BC **cannot be written in these formats**, and are refused with a `Time_error`.

Caution: **Do not silently write the low 4 digits.** The year 10000 written as `0000` reads back as the year 0, and a negative year makes the per-digit remainder negative and writes non-digit bytes: both change the value with no diagnostic (Principle 5).

**Nor is the format extended** (ISO 8601's extended notation `+10000-01-01`): a variable-length format does not fit a fixed-length array.

## Files and paths

### Paths are held in UTF-8, and converted to the wide API on Windows

KSPL's strings are UTF-8 in every environment, like the source text and POSIX. **No Windows narrow (ANSI) API is used**: those read the current code page, so under CP932 `_getcwd` returns CP932 bytes and `_mkdir` takes them.

**Inside KSPL the narrow API reads back what it wrote, so nothing shows until the bytes reach a child process.** CP932 bytes from `sys.cwd()` cannot be converted to UTF-16, so the command line for `CreateProcessW` cannot be built and the child cannot start at all. The symptom is a link or start-up failure, far from its cause in `sys.cwd()`.

**It cannot be converted halfway**: with only part of it UTF-8, a path joining `sys.cwd()`'s result with a name written in the source mixes two code pages, which neither API can resolve. So the boundary is one place: the round trip goes through `kspl_win_to_wide` / `kspl_win_from_wide` in `ksplc/gen/runtime/hosted.c`.

**The inbound side is converted too, since fixing only the outbound side is worse than no fix.** Three things arrive from the OS narrow: `argv` (which the CRT moves to the current code page before the generated main receives it), the environment variables (`getenv`), and `getcwd` plus directory enumeration. With only the outbound calls (`CreateProcessW` and the like) wide, `sys.args()[0]` is invalid UTF-8 the moment a program puts it on a child's command line, and again the child cannot start. So `argv` goes through `kspl_os_argv` just once, inside the generated main (on every `sys.args()` the allocations would pile up). The environment variables go through `kspl_get_env` / `kspl_set_env`.

**One gap remains that the wide API cannot close: a receiving program with a narrow `main`.** Its CRT moves the UTF-16 command line from Windows to the current code page to build `argv`. A character it cannot represent collapses into `?`, which no file name can hold, so the tool fails with `Invalid argument` (under CP1252, `かんそ` becomes `???`). Nothing on the sending side can close it: KSPL's own calls (`_wmkdir` / `_wstat64` …) are wide, but `cc` and `ld` are third-party tools, and mingw's GNU binutils takes a narrow `main`.

**So a third-party tool is given relative paths, with their base directory as `cwd`.** The OS sets `cwd` without going through `argv`, so non-ASCII in it survives. That is why `spawn_wait` / `spawn_async` take a `cwd` too: all five starting functions take one, since a single function without it would make "hand it over relative" impossible to write.

CMake makes the same move (the Ninja generator writes paths relative to the build directory).

**The C standard's path functions are not used**: `fopen` and `rename` are narrow, so `std/libc`'s versions break on Windows alone. `std/fs`'s `rename_path` and `std/io`'s `open` go through `kspl_rename_cstr` / `kspl_fopen_cstr`, which keep the per-environment branch in one place in C. `std/libc`'s `fopen` / `rename` carry a do-not-use mark; they stay as the companions of `fclose` / `fread`, which work on an already open `FILE*`. Python abolished all use of the `*A` APIs for the same reason. The path is passed NUL-terminated so it goes to `fopen` / `rename` as it is, where a `ptr` plus length pair would need repacking in C.

**An OS function is not declared directly with `extern "C"`, because its declaration differs per environment**: `shutdown` is `int shutdown(int, int)` on POSIX and `int shutdown(SOCKET, int)` on Windows (`SOCKET` is 64-bit unsigned). A declaration matching one makes that one line fail to compile on the other (winsock2.h: `conflicting types for 'shutdown'`).

Caution: **It cannot be noticed on POSIX.** What fails is the Windows job or a user's machine. `std/net`'s `shut_write` goes through `kspl_net_shutdown_write`, which keeps even the constant (`SHUT_WR` / `SD_SEND`) in one place in C.

**A new `kspl_*` function has its body in the compiler's C runtime (`ksplc/gen/runtime/`), and the seed must carry that body before `std/` calls it**: otherwise the bootstrap does not build, since stage1's link fails on an undefined symbol.

**Where the environments answer one call differently, one answer is chosen for all.** `rename` onto an existing destination replaces it silently on POSIX, but fails with `EEXIST` in Windows UCRT's `rename` / `_wrename`. That breaks "write under another name, then replace": only the first round succeeds, and every later one silently fails to write. A server writing the files it serves, and a cache kept on disk, both take this shape. It must not be aligned on the failing side: `rename_path` is contracted to replace, through `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` on Windows. `MOVEFILE_COPY_ALLOWED` is not added: POSIX fails with `EXDEV` across volumes, so it would split the answer the other way, and a copy is not atomic.

Note: One difference remains. POSIX renames a directory over an empty one, while `MoveFileExW` fails if the destination exists; every caller replaces a file, so this is left. **`make debug` pins the contract**; Linux passes it regardless, so what catches a break is the real Windows runner (`make debug` is a gate shared by Linux and Windows).

### A long path is handed to Windows in the extended form

**A path of 248 UTF-16 units or more goes to the OS as `\\?\C:\…`, or as `\\?\UNC\server\…` on a share.** Passed as it is, every file function stops at 260 (`CreateDirectoryW` at 248), the limit Windows keeps unless both the machine and the program opt out. A build cache inside a OneDrive folder easily puts files past that depth. clang and lld widen a path themselves and write them, but without the extended form `std/fs` can neither see, reuse nor delete them. Nothing on Linux or on CI's shorter checkout can show it.

**The OS's switch is not relied on**: it needs `LongPathsEnabled` for the whole machine, which takes an administrator, and a manifest in every program, so a program relying on it breaks on most machines, far from the cause.

**The prefix goes on in the one place a path becomes UTF-16 for the OS**, so no function can miss it; the path is resolved first, and the form never comes back to KSPL (the rules are at `kspl_path_to_wide` in `ksplc/gen/runtime/hosted_fs.c`). Rust's `fs::canonicalize` returns it, and not every tool can read such a path.

Note: **A child's working directory stays under 260.** The OS keeps a process's current directory within MAX_PATH unless the program opts in, so a program that gives a child a deep directory as its working directory hits the limit there (`kspl_proc_start` in `ksplc/gen/runtime/hosted_spawn.c` passes the directory as it is).

### A path is kept under the root by refusing, not by resolving and comparing

**The one function that keeps an untrusted relative path under the root is `fs.stays_under(root, rel)`.** It checks the path's text and every step from `root` for a link. The text check alone cannot block a link, since `link.txt` is a legitimate name that a check looking for `..` lets through.

**Resolving the path and comparing prefixes is not taken, because the answer splits on Windows.** "Is it a link" is one call on each system (`lstat`, `GetFileAttributesW`). But where POSIX resolves with `realpath`, Windows's `_fullpath` does not resolve reparse points, and `GetFinalPathNameByHandleW` needs an open handle: it would open first to refuse.

**Either way a race remains**: a step swapped between the look and the open breaks it, so a party that can write to the root cannot be stopped. Stopping it needs the kernel to guarantee the open cannot leave the root (`openat2(RESOLVE_BENEATH)` / Go's `os.Root`), and presupposes an API carrying the opened handle rather than a path. The current threat model (another page that learned the address) excludes a party that can write to the root.

Caution: **Do not look at `FILE_ATTRIBUTE_REPARSE_POINT` alone on Windows.** OneDrive's and Dropbox's not-yet-downloaded files carry it too, so refusing on it makes every file under a root inside OneDrive unreadable. `kspl_is_link` looks at the name-surrogate tag, which only a link and a junction carry (`FindFirstFileW`'s `dwReserved0` holds it, so it is read without opening).

**Do not merge "cannot tell" into "not a link"**: letting through a step that could not be inspected opens a path out of the root. So `kspl_is_link` returns 1/0/-1, and -1 counts towards refusing. The LLVM backend's degenerate case is -1 too (made 0, it would land on the unsafe side).

### A predicate asking 'may this be followed' returns true when it cannot tell

`fs.is_link` returns true for a path it could not inspect. **The predicate asks "is it a link", but the caller needs to know "may it be followed"**, and false (= may be followed) sends every caller the costlier way.

* `stays_under` blocks paths out of the root, so letting through a step it could not inspect opens a hole.
* A check's clean-up (the function removing the workspace) removes a tree, so descending into a path it could not inspect removes beyond the workspace.

`is_dir` / `exists` do the reverse, answering false when they cannot tell. **The same "cannot tell" lands on opposite sides because one question guards destruction and the other permission**; do not mix the two up when writing them side by side.

Caution: **Do not substitute `stat`.** It follows a link, answering "a directory" for a link to one, so `rmdir` always fails and the link can never be removed; `remove_path` looks at the link itself on both systems (`kspl_remove_path` in `ksplc/gen/runtime/hosted_fs.c`).

### Making a directory refuses an existing name, and removing a tree is not offered

**`mkdir_unique` decides "new" by making, not by looking first**: between a look and the making, another process could slip a link in. A taken name is retried with another random tail, as Python's `mkdtemp` and Go's `os.MkdirTemp` do. `write_tree` refuses a name that climbs out before writing anything, so a list of names taken from outside cannot write beside the tree.

**`copy_tree` refuses a destination that already stands**: a copy mixed with an earlier run's leftovers is not the tree copied, and nothing says so. Python's `copytree` refuses the same by default, and Go's `CopyFS` refuses to overwrite a file that exists.

**Removing a tree is not offered.** Checking whether an entry is a link, then descending into it, is how Rust's `remove_dir_all` (CVE-2022-21658), libc++'s `remove_all`, Python's `rmtree` before 3.3 and Go's `RemoveAll` (golang/go#52745) were all attacked: between the check and the removal a directory is swapped for a link, and the removal runs outside the tree. Each fixed it by removing relative to a directory it holds open and refusing to follow links. That needs the runtime to open and remove relative to a handle, on POSIX and Windows alike. Without that, removing is the caller's job, over a tree it made and nobody else writes into.

### A path is made absolute by its spelling alone

`absolute` joins a relative path onto the working directory and resolves nothing. Folding `a/link/..` into `a` would name another place wherever `link` points elsewhere. Python's `os.path.abspath` does that, and it is the reason Rust's `std::path::absolute` keeps `..` on Unix.

## Threads, networking and the data formats

### A mutex makes the lock and what it protects one thing

The only mutex KSPL publishes is `thread.Mutex<|T|>`; the OS's lock itself (`Raw_mutex`) is a `priv` part of `std/thread`.

**Why**: with the lock and the data held apart, the compiler cannot notice a caller forgetting `lock()` and touching the data directly. `Mutex<|T|>` keeps `value` `priv`, so `lock()`'s return value is the only way to the content; publishing the plain lock beside it would make the bypass writable again. Rust's std, which publishes no lock on its own, makes the same judgement.

| Rust | KSPL |
| :-- | :-- |
| `Mutex<T>` (the lock plus the data) | `thread.Mutex<\|T\|>` |
| `MutexGuard<'a, T>` (the RAII guard) | None |
| The lock on its own (not in std) | `Raw_mutex` (priv) |

**No guard type, because the release is already guaranteed**: `defer mx.unlock()` releases the lock on leaving the scope, and lint [W0107] catches forgetting it. A guard type would add one-line sugar, not the guarantee. `Cond_var.wait` takes a `Mutex<|T|>`, since a condition variable must be given the lock while it waits and the plain lock is not published; being in the same file, it can reach the handle inside.

### The lock and the condition variable are value types

`Raw_mutex` and `Cond_var` hold one number (`I64`) naming the OS-side object, and need not stay at one address. So `new()` returns a value with no heap allocation, and `Mutex<|T|>` holds it by value too: one allocation and one indirection fewer than returning a pointer (`Mutex<|I32|>.new()` adds 0 bytes to the heap). `free()` destroys only the OS-side object; the value itself lives as long as the place it sits in. **As a value type, a copy could free twice**, so both conform to `Move_only`, which forbids copying.

### Threads and the reactor are both kept

`std/thread.kspls` and `std/reactor.kspls` can both "handle many connections", but they suit different situations.

| | `std/thread.kspls` | `std/reactor.kspls` |
| :-- | :-- | :-- |
| Where it suits | CPU-bound parallel work. Calling a blocking API as it is. Few connections, a thread for each | Many connections (hundreds or more), without a stack for each. Waiting that is almost all I/O |
| The cost | A stack per connection. Shared state needs a lock | One thread, so no synchronization, but the caller must make the socket `set_nonblocking()` (its failure comes back as `?Net_error`: do not discard it, or [W0701] fires) |

Both can be used together: accept with the reactor, and hand only the heavy work to a worker thread.

### A walk that must not exhaust its stack asks where the stack ends

**A count of levels guards a recursion only on the build it was measured on.** One level's stack cost moves with the backend, the toolchain, the optimization and the thread. A walk that fits in 8 MB from clang's C spends about twice that when the LLVM backend or MSVC's toolchain built it, and a thread other than the main one may hold far less. So a count right for one build dies of an exhausted stack on another, the complaint raised against other products' count limits.

**`std/stack_limit` asks the OS where the calling thread's stack ends, and a walk compares its own position with that** (`Stack_limit.new(margin)` once per walk, `near()` at each level; the per-OS calls are in `kspl_stack_floor` in [`../../ksplc/gen/runtime/hosted_thread.c`](../../ksplc/gen/runtime/hosted_thread.c)). The margin is the caller's: what runs after the walk refuses (the unwinding, building the message) runs below where it stopped, and only the walk knows how much that is.

**Not taken: growing the stack** (rustc's `stacker`, Go's goroutines). It lifts the limit instead of reporting it, but it needs a way of switching stacks the language lacks, and a debugger and a profiler lose the thread across the switch. Not taken either: running the walk on a thread whose stack size is chosen. The size must still be guessed from what a level costs, the very number that moves.

**The count stays too**: "Implementation limits" in [`../../docs/SPEC-language.md`](../../docs/SPEC-language.md) requires the guaranteed depth to be the same on every target, and only a count is the same everywhere. The stack is watched so that a refusal beyond the count's reach is a diagnostic rather than a crash. So a walk holds both, the count and the limit, and refuses at whichever comes first.

### Connecting by name tries the candidates overlapped

`std/net`'s `Tcp_stream.connect` takes a host name or an address string, over IPv4 and IPv6 alike: `getaddrinfo` resolves a name with `AF_UNSPEC`, and the candidates are started overlapped, 250ms apart, taking the first that connects (RFC 8305's §4 and §5).

**The schedule is written in KSPL, in `std/net`** (`connect_over`), over what the C runtime offers one socket at a time: start a non-blocking connect to one address, wait on several sockets at once, ask one whether it connected. The reactor drives the same three, so the connect needs nothing of its own in C. The runtime keeps what needs the OS's types: resolving a name, which hands each candidate back as address text with its scope (`fe80::1%eth0`) so connecting to the text reaches the same socket address, and putting the winner back to blocking. The delay, the order and how many attempts run at once then read and change in one language, and a test hands `connect_over` candidates of its own (one that refuses before one that accepts), where a name's answer differs per machine.

Caution: **Do not wait for one candidate's reply before trying the next.** Where the IPv6 path is silently down, that stalls until the OS gives up, which can take minutes against the overlapped shape's quarter-second. A sequential connect, such as Python's `socket.create_connection`, is open to that failure.

**Do not re-order them as "IPv6 first"**: the resolver orders them under RFC 6724 by the local connectivity, which a machine can know even where a family does not work. The order within a family is kept, and only the interleaving is rebuilt, starting from whichever family came first. The resolver's order as it stands, one family in a long run, cannot proceed where that family is down until those candidates are used up. Java's default, fixed to IPv4 first, is a third answer, blind to the local conditions.

**RFC 8305's §3 (overlapping the queries themselves, A and AAAA sent apart with a 50ms wait) is not taken**: it needs a resolver asked per family, and `getaddrinfo` answers both in one call. Name resolution itself has no timeout (glibc's default is 5 seconds twice, and a lookup in progress cannot be cancelled).

**Do not decide a connection's failure by `poll`'s reply**: Windows's `WSAPoll` does not report a failed connection (curl does not rely on it either), so an empty wait cannot be told from a refusal. The socket's own answer decides a failure (`SO_ERROR`), checked every round; the wait is taken in slices, never given an infinite timeout.

**A success needs both answers**: the wait reported the socket writable, and `getpeername` succeeds on it. The socket's answer alone is not enough on Windows, where an attempt still in flight can pass it, and the first such attempt in the order would win over the one that connected. `Tcp_stream.is_connected` asks only the socket, because its caller calls it after the reactor reported the stream writable.

**Failures are split into "the name does not resolve" and "it resolved but does not connect"**; only the per-candidate reasons are folded (a fixed number of entries, allocating no buffer).

Caution: **Do not fold across that line.** It decides whether the caller fixes the name or checks the peer.

**`connect` takes no timeout of its own.** A timeout given to each candidate in full is not the shape to add, since the wait would grow with their number; Go divides one timeout among them.

**An empty string is not a name, so the connecting side refuses it**, as `resolve_failed` everywhere, before the OS sees it. Linux answers there is no such name, but Windows returns every address the machine holds. So a program that forgot its destination would connect to itself on Windows alone, linking and running with only the peer wrong. On the listening side an empty string still means "all interfaces".

**The listening side takes only one candidate**: one socket binds one address, the one the resolver put first. A socket listening on `"::"` does not accept IPv4 clients. The default differs per environment (Linux accepts, Windows and OpenBSD do not), and OpenBSD cannot change it, so it is fixed explicitly to IPv6 alone; a server that needs both opens two sockets.

**A listening socket's options are chosen by meaning, per OS.** POSIX's `SO_REUSEADDR` lets a new run bind despite a previous run's TIME_WAIT, and never takes over a socket somebody else is listening on. Windows's option of that name lets a later socket cut in on one somebody else is listening on, after which the socket an incoming connection reaches is undefined. So Windows gets `SO_EXCLUSIVEADDRUSE`, which cannot be taken over.

**Do not pass the same option everywhere for uniform code**: it would share the socket on one OS only. The exclusive option sometimes cannot rebind until the accepted connections have fully closed, and is taken even so: waiting is visible and fixable, whereas a shared socket breaks as only half the incoming connections arriving, with the cause invisible.

**`Udp_socket.send_to` alone takes no name, only an address string**: a name is resolved once with `resolve_one` and the result carried, so no datagram hides a lookup. KSPL caches no resolver answers; Java caches in the language, and then misses a party whose address changes. An address buffer shorter than `addr_text_max` is refused rather than truncated: a truncated `2001:db8::1` looks like another address, `2001:db8:`.

### The frame is kept apart from the transport, and a broken frame is returned as a value too

`std/jsonrpc` holds the Content-Length frame and JSON-RPC's id, and `std/subproc`'s `Piped_child` carries them. **The layers are split by file, with no point of substitution**: `Client` holds a `Piped_child` directly and calls `spawn_piped` itself, so it cannot be used over a socket. Earlier implementations put an abstraction here (Swift wraps a `DataChannel` in the frame, and clangd took in a change carving out a `Transport`). KSPL does not, because the only carrier is a child process (the same reason as "Three ways to start a child process, split by where its output goes" above).

**Why a broken frame is returned as a value**: `lsp4j` returns nothing for a frame declaring no length, leaving the sender with only "nothing comes back", and nothing coming back cannot tell slow from dead from broken. So `broken` is returned.

Caution: **Drop the broken header from the buffer then.** Kept, every later read sees the same header and returns the same failure forever, with no way to resynchronize.

**Why limits stand in two places**: one is one frame's body, since waiting out a declared length as it stands lets a peer merely declaring 4GB start an endless wait. The other is the number of notifications skipped for one request: on a round whose response was dropped, it would read notifications forever, since the timeout applies per `read_msg` call and they keep coming. In both, "there is a timeout, so it is fine" does not hold, and each must be bound by a count apart from the timeout.

**Why the wait for a whole frame is bound by a timeout rather than a count**: `std/subproc`'s timeout is per read, so a peer streaming one byte at a time keeps the reads going without the frame completing. Bounding the number of reads would make the real time to the limit vary with the peer's speed. `read_msg`'s timeout bounds the real time of one call: past the time the caller passed, it returns `timed_out`, however the peer streams, so no count limit is held beside it (Principle 6).

**Why the client drains standard error**: that is where the peer writes why it does not answer. Left undrained, the pipe fills and stops the peer too; discarded, nothing is left to tell why the response came out empty.

Caution: **Hold separate buffers for standard output and standard error.** Shared, draining one treads on what was read from the other (the symptom is only "the frame breaks now and then").

**Why it drains while waiting too**: a peer whose standard-error pipe fills during a wait on standard output stops there, and the client does not move until the timeout runs out. So the wait is taken in slices (`read_slice_ms`), draining between them. A slice running out is not a failure; the call ends at its own timeout. The usual answers are a thread per stream, `select` or asynchronous I/O, machinery KSPL lacks. Merging the two streams is not an option: non-frame bytes entering standard output break the frame, as under "Why a broken frame is returned as a value" above. Nor is discarding standard error, which loses the peer's account. Slicing the timeout avoids both with no machinery.

**Why no second, hand-writable frame is held**: clangd keeps a newline-delimited frame so lit's tests can be written by hand. KSPL assembles the frame in KSPL too (`frame_into`), so its tests are written in the same language, and a second frame for the same purpose would create a place where only one of the two gets fixed.

### The field table holds a number's width as data, and nests by pointing

**Nesting is a table pointing at a table**, since flattening never ends on a recursive type such as `Tree { left: Tree$@ }`. Keys nest with it (`{"cold":{"ms":1}}`), never flat (`"cold.ms"`).

**A container (`List<|T|>`) can be described because `ptr` / `len` / `cap` / `arena` are `pub`**, so `offsetof` gives their positions. They do not depend on `T`, so the walker asks one representative instantiation, and an element's stride is `sizeof(T)`.

**A number's width is `Field_extra.width`, not part of the kind.** The kinds are signed integer, unsigned integer and floating point, and the width is the declaration's `sizeof`. So `Sz`, whose width varies with the environment, fits as it is.

**There is no kind per width.** The ten from `i8` to `f64` would swell the `switch` in each walker (`std/json_struct` and `std/db`), against Principle 6 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md). So only `std/reflect`'s read and write functions branch on width.

**Signed and unsigned are separate kinds for reading**: a `U32`'s `0xFFFFFFFF`, read with sign extension, is `-1`. Writing only truncates to the width, so one path serves both.

**Other encoders spell out every width because they are collections of methods** (serde's `serialize_i8` … `serialize_f64`, the overloads of Swift's `Codable`). Static dispatch puts the width in their API. KSPL's table is data walked at run time, so it holds the width as a number. Rounding the width instead, as Jackson's `NumberType` does, loses `short` versus `int` across the round trip.

### JSON's numbers hold integers and decimals separately

`json.Val` holds `int_val(I64)` and `float_val(F64)` as separate variants. All F64 would silently round an integer over 53 bits (an in-file offset in safetensors and the like), and integers only could not read ordinary JSON holding a decimal. The text's shape tells them apart (a `.` or an `e` makes it a decimal). An integer with more digits than I64 holds becomes a decimal: lost precision showing in the type is better than a truncated value.

**The reader accepts only RFC 8259's shapes.** A raw control character inside a string (`"a<newline>b"`) and a comma before the closing bracket (`[1,]`, `{"a":1,}`) are refused, the latter as `trailing_comma`; reported as `invalid_string` at a key's position, it would not lead the writer to the trailing comma. Unlike the others, KSPL holds no option to loosen this: a loose reader lets the sender's broken output take hold unseen.

**Writing takes the shortest representation that reads back as the same F64** (`write_json_float` in `std/json.kspls`). An integral value keeps its `.0`, so it does not come back as the integer variant, and the switch to the `1e+21` shape sits where JS's `Number::toString` puts it, so a round trip through JS does not move the text.

## Regular expressions

### A capture group's end is observed with a marker node

`std/regex` matches by naive backtracking, but **does not hold the continuation in a closure**: `match_group` builds a temporary sequence, an alternative's atoms followed by the outer sequence's remainder, and matches it from the head. That shape erases the group's end, since nothing in the joined sequence shows where the group stops and the remainder begins. So a `.group_end` marker node is inserted at the seam, and the position when matching reaches it is the group's end.

Caution: **Make one marker at compile time and have the `.group` node hold it.** `match_group` rebuilds the sequence on every attempt, so making it there would allocate once per attempt.

### There are two rewinds, and neither covers the other

**Both erase the captures, by different mechanisms**.

| Where | When | The case it covers |
| :-- | :-- | :-- |
| `find`'s `reset_slots` | Per start position, and per alternative of **the whole pattern** | `(a)(b)\|c` matching `c` keeps no earlier attempt's values in groups 1 and 2 |
| `match_group`'s save and restore | Per alternative **inside a group** | `((a)x\|ab)c` matching through `ab` keeps no group 2 from the failed `(a)x` |

Note: The tests cover the two separately (`make debug`), since **a test for one still passes with the other erased**.

**The whole set of positions is saved**: restoring per group would mean walking into the failed alternative's nested groups too. With the group count capped at `max_groups` (9), copying the whole is cheap.

### A repeated group holds the rest of the current round in a single-use node

In the joining shape, `(ab)*` is "the body once + **itself** + the outer remainder".

Caution: **Do not join the node itself here.** The joined sequence is flat, so the outside has nowhere to pass "which round is this" or "where did the previous round start". The node's fields cannot hold it either: under backtracking the same node stands at several positions at once, so an inner attempt overwrites the outer one's values.

So what is joined is **a single-use shallow copy** carrying the position its round started at; reached at the same position, the round consumed nothing. The copy's `sub` shares the compile-time tree, so it must not be freed deeply (`drop_repeat_step`).

**`(a?)*`'s cut-off affects the answer, not the speed**: without it, every failing position descends to the depth limit and spends the backtracking budget shared across the whole `find`. That ends in `too_complex` and misses a genuine match further along. So the test checks "is it found", not "is it fast" (`make debug`'s `late_match_start`).

**A round that matched empty is not undone; only the repetition stops**, so `(a?)*b`'s group holds the empty string, as Python's `re` and PCRE answer.

**`(…)?` is not a repetition** but an empty alternative, wrapped from outside in a non-capturing group, so that `(ab)?c` matching `c` leaves the group "not participating", as Python's `re` and PCRE answer.

**Each round descends one more level of recursion**, unlike a quantifier on a single character, which merely counts, so input whose count reaches the limit silently fails to match. It is meant for a few rounds within one line.

### Every match is returned in a `List`. No lazy iterator is made

`find_all(text, arena)` is eager and returns a `List<|Match|>` (following "Iteration has one notation, `for x in`" above).

**It returns `Match`es, not strings** (nor tuples where there are groups): strings would lose the groups' positions. A `Match` holds the groups too, so one function serves both "only the span" and "the groups too".

**The function, not the caller, steps one byte past a zero-length match**; left to the caller, the mistake of spinning in place would be written every time. It steps as Python's `re.finditer` does: `a*` on "baa" gives the three entries (0,0) (1,3) (3,3).

**The positions are indices into the original string**: the search moves its start (`find_from`) rather than cutting the string and searching again. Cutting would leave even the groups' positions for the caller to add back, and forgetting it leaves the match itself correct, so it goes unnoticed (`make debug`'s `test_regex_find_all` catches it by reading the second entry's group from the original string).

The backtracking budget (`max_match_steps`) restarts per match, as when calling `find` again by hand, since one budget shared across a long string would make correct input `too_complex`. **The cost**: each entry holds a whole `Slots`, heavier than the span alone, which a caller streaming through a huge input accounts for.

### A group reassembles the sequence per attempt, so it has no effect in a per-line use

`match_group` rebuilds "the alternative's content + the group-end marker + the outer remainder" **into a new `List` on every attempt** and recurses, holding the continuation as data ("A capture group's end is observed with a marker node" above).

One group makes matching several times slower, and each added alternative grows the cost nearly in proportion. Looking at the string by hand (`starts_with` and an index) is over an order of magnitude faster than a pattern holding a group. **So for "line by line, over hundreds of thousands of lines", look by hand.** A regular expression suits few applications of a complex pattern, such as a few searches over one log.

A pattern whose every alternative starts with `^` does not move the start position (`anchored`), but **this does not cancel the group's cost**: the difference above holds with the start position fixed.

### After `\`, an alphanumeric is accepted only in a defined escape

**Do not leave a branch that swallows it as a literal.** Under "if it is not a known notation, then the character itself", `\t` becomes the character `t` and `\b` the character `b`. The pattern compiles, only the match fails, and all the writer sees is "somehow it does not match". So an alphanumeric always lands in one of four cases.

| The notation | How it is handled |
| :-- | :-- |
| `\d` `\w` `\s` and their negations | Expanded into a character class |
| `\t` `\n` `\r` | That control character |
| `\b` `\B` | A word boundary (**it holds no width**; a quantifier cannot be attached) |
| An alphanumeric absent from the above (`\q` `\z`) | **Refused** with `invalid_escape` |

A symbol is itself (`\.` `\*` `\[`), and **must not be refused**: that is what escaping is for. `\b` is refused inside a character class. Python's `re` and PCRE read it there as a backspace (0x08), a notation not held here, and refusing it is more correct than swallowing it as the plain character `b`. `\b`'s word test uses the same range as `\w`, or a pattern writing both, such as `\w+\b`, would fail to break where the boundary should be.

**`std/str`'s `unescape_to_arena` holds the same rule**, for the same reason: it refuses an unknown alphanumeric escape (`\x41`, `\q`) with `invalid_format` and lets a symbol through as itself. The caller's list decides which symbols are accepted (`std/json`'s `is_json_escape`, say). Letting an alphanumeric through as "the character itself" would turn `\x41` into `x41`, the `\` silently gone.

### A notation that is refused stays refused

Caution: **`\1` is refused as a backreference** (`unsupported_backreference`). Swallowed as a literal, `(a)\1` silently becomes another pattern, "`a` followed by the character `1`", and all the writer sees is "it does not match". The only function that reads a captured string is `Match.group`; a pattern cannot refer to one.

A pattern with more than 9 capture groups is refused with `too_many_groups` too: stopping the count would leave the tenth group onward returning empty.

### `.` does not match a newline, counts are written as `{m,n}`, and broken shapes are refused

**`.` does not match `\n`.** Python, Java, Rust's `regex` and C++'s `std::regex` do not match one by default either, and matching newlines takes an option (`(?s)` / DOTALL) written elsewhere. KSPL holds no options, so a newline is matched with `[\s\S]`. Differing here would make a `.*` spanning lines return another answer, which someone bringing a pattern from another implementation sees only as the matched span growing.

**The counted repetitions `{n}` `{n,}` `{n,m}` are held** (the `\d{4}-\d{2}` shape is needed daily for a date or an ID). `*` `+` `?` are shorthands for them on one tree (`.repeat`'s minimum and maximum counts); with `a{0,}` and `a*` as different trees, a difference in the answer would split across two paths. A count on a group uses the same mechanism (`group_repeat`'s remaining count). Only `(ab){0,1}` takes `(ab)?`'s "wrap in an empty alternative" shape (that one is not a count). The upper bound is `max_repeat_count` (1000, as in RE2 and Go), and a group's repetition, descending one level of recursion per round, hits the depth limit first.

**A `{` not in a count's shape is refused** (`invalid_repeat`): swallowed as a character, `a{3` would silently match "the three characters `a{3`" (the reason in "A notation that is refused stays refused" above). A literal `{` is written `\{` or `[{]`, and `}` alone is a character (Python's `re` and PCRE read it so).

**A malformed range is refused too** (`invalid_range`). The reversed `[z-a]` could pass as an empty range, but a class matching nothing would then be built with no error. A `-` beside a set (`[\d-z]`) reads as neither a range nor a character, so a shape that reads neither way is refused. A literal `-` goes at the head or the tail, or is written `\-`.

## The shape of the package

### Why one import brings few files along

Importing one std file compiles that file and the files it imports, and no more; the tiers this gives are the table "How many files one import brings along" in [std](../README.md).

**Each std file builds imported on its own** (`make test-thin-use` watches it). A conformance is the trap: `impl I32: Formattable` holds wherever `std/strfmt` is in the program. So a file using interpolation without importing `std/strfmt` breaks only for an outside user importing that file alone. Such a file imports the conformance's file as an anchor, as in `as _strfmt` ("9.3 Adding a method to another file's type" in [`../../docs/SPEC-language.md`](../../docs/SPEC-language.md#93-adding-a-method-to-another-files-type)).

**No std file is inside an import cycle** (`make test-thin-use` again): with a cycle, using one brings the other along, the tiers collapse, and nothing can be selected.

The cause is often small: one error type in a signature brings its whole file along. `strfmt` comes along with `str`, which imports it for `to_hex_lower` and as the anchor bringing `\{x\}`'s conformances into every program using `str`. `io` stays out of what `str` brings: the `Writer` / `Formattable` contract is in `std/lang`, so string-only code is spared file I/O (the reverse, `io` bringing `str` along, remains). `ds`, `sha256` and `time` stay outside the lump because they take no `Writer`: `ds` builds its message with `Panic_msg`, and `sha256` / `time` write straight into the caller's array. **Do not add a function taking a `Writer` for convenience**: it brings the whole lump along.

These counts are **at compile time**. `--gc-sections` drops what nothing references at link time, so no artifact, hosted or freestanding, grows by them. The exceptions are the `Writer` vtable's thunks ("The digits of a floating-point number are assembled here" above) and Windows, whose PE linker keeps unreferenced sections. `make test-thin-use` pins with upper bounds the size of `std/lang` + `std/libc`, the files that bring only themselves, and the three lumps. Adding to `std/lang` costs every program, and adding an import to a file in a lump widens it.

### A folder is made only for a unit with its own README

`std/` is flat: **every file a user imports sits directly beneath it**.

Caution: **Do not cut by area (networking, cryptography, strings) — that makes two axes.** What `std/` promises its readers is the tier, how many files come along when one is imported ("Why one import brings few files along" above; the upper bound is `make test-thin-use`), and an area cuts across it, giving two maps.

**The one folder, `std/tests/`, holds std's own tests and is on no user's map**: nobody imports it (only `make debug` calls it), and neither `SURFACE.txt` nor `std/README.md`'s listing shows it, so it does not cut across the tiers. Where a test goes is "13.1 A test inspecting the inside of a unit goes inside that unit" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md).

**A group large enough to hold its own README becomes a package at the root, not a folder**: a group holding its own table is also "a unit distributed together" (the table in the root [`../../README.md`](../../README.md)). A group of two or three files meets neither condition, so `regex` and `regex_node` stay uncut.

**Moving a file out leaves every call as it is**: an import's alias is the path's last element (`a/b/engine` moved to `b/engine` keeps the alias `engine`). What changes is the import line and the `priv` symbols' C-name prefix (derived from the file's path), so the seed must be retaken and the fixed point confirmed.

### Whether `pub` is needed is not settled by walking the references

Caution: **Do not take a `pub` in `std/` off as "unused".** `std/` is distributed, `pub` is the contract with its users outside, and no reference inside the repository does not mean no contract.

**The failure type shows what a walk cannot decide**: a caller that only receives a `T?E` with `catch e` never writes `E`'s name. `std/regex`'s `Regex_error`, the failure type of `compile` / `find` / `find_all` themselves, appears nowhere outside `std/regex.kspls`, so a walk calls it "a `pub` nobody uses"; a result struct and a trait fare the same.

**So [I0402], which flags a `pub` used only within its package, is not enabled in `std/`**: judging by the references one compilation sees, it calls the published API itself, with no users yet, "unneeded". It may be enabled in a unit building an executable (which ones is "13.1 A test inspecting the inside of a unit goes inside that unit" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

Caution: **To narrow a published API, decide from the promise's side, not by walking**: decide that an entry point leaves the promise, then take it off. Done the other way round, the entry points whose names never appear go first.
