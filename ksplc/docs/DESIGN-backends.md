# ksplc's backends and the runtime ABI

**This document holds the design of ksplc's last layer, the two backends, and the ABI the runtime shares with them.** It is one chapter of the compiler's internal design. [`DESIGN-compiler.md`](DESIGN-compiler.md) holds the rest: the map of the whole compiler, the AST rules every layer shares, the arena, the conventions and the glossary. Read "The compiler as a whole" in [`DESIGN-compiler.md`](DESIGN-compiler.md) first.

## The backends (Genc / Genllvm) and the runtime ABI

A *backend* is the last stage of the compiler: it turns the finished tree into code for a target. ksplc has two. **Genc** writes C99 source, and every shipped program is built through it. **Genllvm** writes LLVM IR, the text form that the LLVM toolchain (clang's back half) compiles. It exists to check the stages above it, and is not shipped.

```mermaid
flowchart LR
    T["the flat tree<br/>from Lower"] --> GC["Genc<br/>writes C99"]
    T --> GL["Genllvm<br/>writes LLVM IR"]
    GC --> C[".c file<br/>runtime included"] --> CC["any C compiler"] --> E1["program<br/>(shipped)"]
    GL --> LL[".ll file<br/>no runtime inside"] --> LK["clang, linked with the runtime<br/>from ksplc emit-runtime"] --> E2["program<br/>(tests only)"]
```

**Why two are held**: a C compiler exists on nearly every platform, bare-metal ARM included, so nothing beats generated C for portability. The LLVM IR backend (`--to=llvm` / `make LLVM=1`) has two roles:

1. **It proves that the layers above the backends (parse / sema / lower) are neutral.** When two outputs from the same AST behave alike (`make test-equiv` / `make test-llvm-abi`), no backend dependency has leaked upstream.
2. **It keeps an option open**, so a target with no C compiler does not start from zero.

**The LLVM backend is a mirror, not an exit**: shipping uses C99 alone (Principle 6).

**Only the C runtime holds the bodies of `kspl_*` symbols.** The *runtime* is the C code every program needs besides its own (files, sockets, threads, the clock and the like), in `gen/runtime/`. The IR only emits `declare`s from `std/`'s `extern "C"` declarations, and is linked with the runtime `ksplc emit-runtime` writes (`STAGE1_RT` under `make LLVM=1`; `tests/support/harness_build.kspl` for the tests). The IR's own share is only the `main` entry point and what is `static inline` on the C side: the bounds, division and shift checks. `make test-conventions`'s "there is no `kspl_*` body on LLVM's side" holds this. Both backends spell the entry point's work from `gen/entry.kspl` ("What the two generators share: the decisions, not the spelling").

**An LLVM artifact is not shipped, because it carries no debug information** ("Genllvm (LLVM IR): why the structure differs, and managing SSA"). Shipping one needs debug information first.

| | Genc (C99) | Genllvm (LLVM IR) |
| :-- | :-- | :-- |
| Role | the output that ships | a mirror that checks the layers above |
| Runtime | written into every `.c` | linked in from `ksplc emit-runtime` |
| Debug information | `#line` before every statement | none |
| `ksplc run`, `--split`, `--library`, `commit-seed` | yes | refused |
| Machines | every row of `MACHINES` in `base/target.kspl` | those with 8-byte pointers, by their `target triple`; refused otherwise |

**genllvm lays out only 8-byte pointers and `Sz`**, so `check_machine` in `cli.kspl` refuses `--to=llvm` for a machine whose row has no LLVM triple. The IR names the row's `target triple` and no `target datalayout`: LLVM derives the layout from the triple, and clang replaces a module's own layout anyway.

### What they answer for

The backends only translate, as the first stage that knows the target. They receive a normalized, plain AST with mangling and thunk generation done. They are **pure emitters** ("A backend writes straight out rather than assembling" in [`DESIGN-compiler.md`](DESIGN-compiler.md)), with no logic for type inference, control flow or method resolution. Both start from the same `switch target` in `pipeline.kspl` on the same flattened `root_file`.

### What the two generators share: the decisions, not the spelling

**What the two outputs must agree on is written once, in a shared file directly under `gen/`**, and each backend writes it in its own language. Neither imports the other.

| What is shared | The file | What it holds |
| :-- | :-- | :-- |
| the C runtime that completes either output | `gen/runtime.kspl` | The embedded `gen/runtime/` files in order. Also the version symbol that stops a runtime of another version from linking ("The runtime written alone, and its version symbol"). |
| what the generated `main` does around `kspl_main` | `gen/entry.kspl` | the startup calls and their order, how the return value becomes an exit code, and the kind of error a failure passes to the runtime's `kspl_main_fail` |
| reading the file an `embed` names | `gen/embed.kspl` | finding it as an import is found, refusing one that cannot be read |

**A decision written twice drifts with no warning until someone runs the other backend.** A `main` written per backend can lack the call that puts standard output into binary mode ("Standard output carries the bytes a program writes" in [`../../docs/DESIGN-programming-language.md`](../../docs/DESIGN-programming-language.md)). And a symbol one backend owns would make the other import it.

**An `embed` with no path in the tree stops with an ICE** (an internal compiler error, [the glossary](DESIGN-compiler.md#the-glossary)). The parser always gives an `embed` its path, so a missing one is a broken invariant. Returning silently would be the stopgap "Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md) forbids.

**Where the spelling differs, the table belongs to the backend.** The functions the LLVM preamble declares or defines itself form one table, `PREAMBLE_FNS` in `gen/llvm/ctx.kspl`. It drives both the `declare`s and the skipping of `std`'s own declarations, so the two cannot disagree. `make test-conventions` holds its hand-defined entries against the `define`s in `gen/llvm/module.kspl`.

**The emission itself is not shared**; the bodies overlap in only a few short windows.

| The overlap | How it is handled |
| :-- | :-- |
| the composite types' de-duplication (10 lines × 3 places) | **gathered** in `Mangle_seen` in `ksplc/sema/type/naming.kspl` (the key is the output name, so it sits with its spelling) |
| `clear_scratch` / `take_scratch` (6 lines × 2 places) | not gathered: each is one statement, and a shared function would need as many lines at each caller |

**There is no trait for the output destination**: the shared files never touch the output buffer, so plain functions are enough.

### The runtime memory layout and the ABI specification

Every KSPL value has one fixed layout, which Sema fixes and both backends follow, so C output and LLVM output can call each other. This is the *ABI* ("Words used throughout" in [`../../docs/DESIGN-principles.md`](../../docs/DESIGN-principles.md#words-used-throughout)).

| KSPL value | Its layout | Note |
| :-- | :-- | :-- |
| a pointer | LLVM's untyped `ptr` (opaque pointers, LLVM 15+) | Sema alone answers for pointer type safety, so the backend needs no casts |
| a slice `T[]` | `{ ptr, i64 }` | the elements and their count |
| a trait value | a fat pointer `{ ptr obj, ptr vtable }` | the object and its vtable (the table of its methods) |
| an enum with a payload | a tagged union: a tag, then a buffer | more below |
| an enum without a payload | its base type | as in genc's `typedef` of it |
| a struct | `{ <the fields> }` | more below |

A Result (`T!E`) is `std/lang`'s enum `Result<|T, E|>`, laid out as any enum with a payload. A payload field of type `Void` is not carried, so `Void!E`'s `ok` holds nothing.

* **Enums**: an enum with a payload is a *tagged union*: a tag that says which variant is active, then room for the largest payload. The tag has the enum's base type (`I32` where none is written; genc's `tag` field is that type too, not a C `enum`). On LLVM it is `{ <tag>, [N x iW] }`, the words `W` bytes wide for the alignment (8 at most), so the type has sema's size. **A payload field is reached by its byte offset** from the value's start (`enum_payload_offset` plus `payload_field_offset`; `payload_field_ptr` in `gen/llvm/types.kspl`). A struct of the payload's types would be laid out by LLVM's own alignments.
* **Structs**: on LLVM a struct is `{ <the fields> }`, laid out by LLVM's own alignments, which agree with C's. **One that is, or holds, an `#align(N)` struct, or a tagged union aligned past 8, is laid instead** (`is_laid` in `gen/llvm/types.kspl`). No LLVM type carries such an alignment, so the struct is written *packed* (no automatic gaps). Each field sits at sema's offset, with `i8` padding bytes between and after. A field's element index is counted past the padding (`field_index`), and every alloca and global of it is told the alignment (`get_struct_align`). Unlaid, a field after it would sit elsewhere than C and `offsetof` say.

#### A field of a `#packed` struct is reached byte-wise

**A field of a `#packed` struct sits at any byte. So each load and store of it is made at the alignment it keeps, and nothing makes a pointer to it.** One function answers what that alignment is: `packed_place_align` in `sema/decl/layout.kspl`. It walks the place's path (`.` and an array's `[]`); a step through a pointer starts afresh at the type's own alignment. It gives the alignment where it is below the type's own, else 0. Each reader asks it:

| Who | What it does with the answer |
| :-- | :-- |
| sema | Refuses whatever would take the address (`refuse_packed_address` / `refuse_packed_receiver`), and an ARC-managed field, whose helpers take it (`check_packed_managed_fields`); why is "Why a field `#packed` leaves under-aligned has no address" in [`../../docs/DESIGN-programming-language.md`](../../docs/DESIGN-programming-language.md) |
| genc | Leaves the access to C, which knows the packing from the member path. Only the target an assignment fixes first (`_kspl_dst_N` in `emit_assign_stmt`, `gen/c/stmt.kspl`) is held through a pointer to a one-field packed struct, never a `T*` |
| genllvm | Writes `, align N` on the load or store (`op_load_place` / `op_store_place` in `gen/llvm/types.kspl`), and on a struct literal's field store (`packed_field_align`) |
| lower | Fixing an operand's address early (`hoist_address` in `lower/order.kspl`) fixes the struct holding the field instead (`hoist_packed_holder`) |
| lower's exit check | An `@` of such a field is an ICE (`lower/verify.kspl`): sema refuses every form a writer can write, so one there was made by lower |

Caution: **An LLVM load or store with no `align`, and a C `T*`, promise the type's own alignment**, which x86 does not check. `make test-equiv` builds its program's C with C's alignment trap and reads the IR's `align` (`check_traps` / `check_packed_ir` in `tests/suite/equiv_test.kspl`).

**What is given up**: an index between the holding struct and the field, in an operand fixed early (`p[f()].grid[j][g()] += 1`), moves into a temporary by value. So its bounds check runs where the field is used, after the operands that follow it.

### Embedding the runtime, and what a library keeps to itself

**ksplc carries the C runtime (`gen/runtime/`) inside itself and writes it into every generated `.c` as a preamble, so the output builds with nothing else installed.** Here the arena model ("Memory management: the arena model" in [`DESIGN-compiler.md`](DESIGN-compiler.md)) and the ABI become C. The runtime has three parts:

| Part | Used | What it holds |
| :-- | :-- | :-- |
| `core.*` | always | primitive type aliases, the linkage and export marks, the error-route trace, signed division and the atomic operations |
| `hosted.*` | where there is an OS | files, sockets, threads and the rest of what needs libc and the OS API |
| `freestanding.*` | under `--freestanding` (bare metal) | nothing OS-dependent; a breached run-time check stops in an endless loop, and the like |

The sources `ksplc/gen/runtime/{core,hosted,freestanding}.{h,c}` are built into ksplc with `embed` (as in "Keeping the grammar and the AST node kinds in step" in [`DESIGN-compiler.md`](DESIGN-compiler.md)). genc writes the hosted or the freestanding set into every generated `.c`, unconditionally. **So their reachability differs from an ordinary KSPL file's**, which reaches the output only if the entry file imports it, directly or not.

That matters for the calls clang inserts where the KSPL source shows none, such as `__aeabi_memclr4` (ARM's AAPCS helpers) and `kspl_bounds_check`. Written as a KSPL `pub fn`, such a helper vanishes whenever its file is unreachable. So the helpers that must not appear in KSPL's call graph live in `runtime/*.c` (`kspl_atomic_add` / `kspl_atomic_cas`, the AAPCS memclr/memcpy family, `kspl_get_sp` and so on).

**Each target is split into a declaration half (`.h`) and a body half (`.c`).**

| Half | What it holds | Where it goes |
| :-- | :-- | :-- |
| declaration half (`.h`) | macros, typedefs, `extern` declarations, `static inline` functions | every generated *translation unit* (one `.c` the C compiler reads) |
| body half (`.c`) | functions with external linkage, globals with initializers | exactly one translation unit, or `--split` ("Split compilation: emitting one program as several translation units (`--split`)") meets duplicate definitions at link time |

The declaration half copies only what the generated body calls directly; genc emits the prototypes of functions KSPL declares with `extern fn kspl_...`. hosted's body half is split by subject into files attached in a fixed order (`write_impl` in `ksplc/gen/runtime.kspl`), not translation units of their own. Its declaration half stays one file, `hosted.h`.

The diagram shows the order of one generated `.c`, top to bottom.

```mermaid
flowchart TB
    H["1. declaration half<br/>core.h + hosted.h or freestanding.h"] --> B["2. the generated body<br/>your program's code"] --> R["3. body half<br/>runtime functions, system headers"]
```

**The generated C runs declaration half → generated body → body half** (`run` in `ksplc/gen/c/root.kspl`). The body reaches the body half through the declaration half's `extern` declarations.

Caution: **Do not put the body half before the generated body.** It includes everything from `<fcntl.h>` to `<netinet/in.h>`, and the names those headers `#define` clobber names in the generated body. The user sees not a KSPL diagnostic but the C compiler's `expected member name` (Principle 5).

**Do not grow the escaping list (`is_preamble_macro` in `ksplc/base/c_name.kspl`) to cover them**: hundreds of names (`st_mtime`, `O_RDONLY` …) would clash, differing per platform. Two gates hold this: `tests/suite/emit_runtime_test.kspl` checks the order, and `ksplc/tests/c_keyword_names.kspl` checks the names themselves.

**A small remainder comes from the declaration half's own includes.** `<stdint.h>` (needed by the `I8` to `U64` typedefs in `gen/runtime/core.h`), `<signal.h>`, `<time.h>`, `<math.h>` and `<stdio.h>` cannot move to the body half. The next section covers each name they define.

#### The names a declaration-only header `#define`s

`std/` calls libc directly from the generated body, and genc emits no `extern "C"` prototypes for it (`write_decls` in `gen/runtime.kspl`; a build with `-Werror=implicit-function-declaration` confirms it). **So the headers' object-form macros collide with the same names written in KSPL** where those come out as plain C names. Such names are a local, a parameter, a struct field, an enum's payload, a trait's method and a closure's capture. (An object-form macro is a `#define NAME …` with no parameter list, so every later `NAME` is replaced.) The user gets a C compiler error far from the cause (`member reference base type 'int' is not a structure`).

**Each such name gets exactly one of three covers.**

| the cover | what it covers | where |
| :-- | :-- | :-- |
| erased with `#undef` | names neither the runtime nor the generated C reads (POSIX's `si_*` / `sa_*` / `sigev_*` / `L_tmpnam` / `math_errhandling`; the Windows CRT's `environ` / `popen` / `strcasecmp` / `sys_errlist`) | `write_decls` in `gen/runtime.kspl` |
| given a suffix by the escaping list | names that cannot be erased (`typedef bool Bool;` uses `bool`; the runtime uses `NULL` / `EOF` / `errno` / `stdin` / `stdout` / `stderr`) | `is_preamble_macro` in `base/c_name.kspl` |
| turned away by the naming check | names that are not snake_case (`SIGINT` / `L_ctermid`): written at a plain-name position, [I0502] always reports them | `sema`'s naming check |

**Try `#undef` first**: a suffix hides the original name from whoever reads the generated C. An `#undef` of an undefined macro is valid C, so POSIX's and Windows's names share one run.

**The same name expands differently per target**: glibc's `#define stdin stdin` expands to itself, the Windows CRT's `stderr` to a function call. So check on every target.

Caution: **Do not keep the list by hand**: which names collide changes with the libc version. `tests/suite/decl_macros_test.kspl` collects them from the target's headers and checks that every remaining name is under one of the three covers. An `#undef`'d name vanishes from `-dM -E`'s output, so what it collects is exactly the names left unerased. The check at every position is `ksplc/tests/c_keyword_names.kspl`.

#### How linkage is chosen: one artifact, one program or library

**The runtime's body half and std's definitions go into every artifact**, for two reasons. `ksplc/seed.c` must build in one C compiler run ("The bootstrap, and keeping the seed in step" in [`DESIGN-compiler.md`](DESIGN-compiler.md)). And whatever builds the generated C builds the runtime with it, so ksplc carries no prebuilt runtime per target.

**A program's symbols take the linkage their visibility gives**: `priv` is `static` and the rest external, so `--split`'s units reach each other (`has_file_local_c_symbol` in `gen/c/decl.kspl`). The runtime's `kspl_*` are external, since one program holds one runtime.

**A library's are all `static` but its `#export`s** (`--library`; what can be relied on is [`SPEC-tools.md` §2.10.1](SPEC-tools.md#2101-building-a-library---library)). "A KSPL library crosses as C, holding its own runtime" in [`../../docs/DESIGN-programming-language.md`](../../docs/DESIGN-programming-language.md) says why a library takes a private copy. It also says why `static` beats a hidden visibility or an export list. This section holds how the generated C and the runtime make it so.

| What | How it becomes `static` |
| :-- | :-- |
| genc's functions | `has_file_local_c_symbol` answers yes for everything but an `#export` |
| genc's variables, constants and embeds | `global_word` in `gen/c/ctx.kspl`; the forward declaration is a `static` tentative definition, written once the types are complete (C refuses an incomplete type there) |
| the runtime's functions and data | `KSPL_LINK` on each declaration and definition in `gen/runtime/`, which is `static` where the generated C defined `KSPL_LIBRARY` before the preamble (`run` in `gen/c/root.kspl`) |
| std's `extern "C"` declarations of them | `KSPL_LINK` too (`extern_word` in `gen/c/decl.kspl`): C refuses a `static` definition after an `extern` declaration |

Caution: **Put `KSPL_LINK` on every runtime definition with external linkage.** One left out stays visible, and two libraries collide on it or bind to each other's copy. `tests/suite/ship_test.kspl` lists what a library's object leaves visible.

**A library runs none of a program's start-up**: it has no generated `main`. Under `KSPL_LIBRARY` the runtime also leaves out `hosted.c`'s SIGPIPE constructor, the re-raise after a write that found no reader, and the crash handler. What each means for the program linking the library is in SPEC-tools.md §2.10.1.

**Size is not part of the price**: `--gc-sections` and the C compiler drop what nobody calls.

**Functions the generated `main` calls directly as raw C belong in the declaration half** (the head of `hosted.h`). The body half comes after the generated body, so without a declaration the call is an implicit declaration.

#### The runtime written alone, and its version symbol

**The LLVM route needs the runtime as a separate C file**, which `ksplc emit-runtime` writes as one translation unit. It gives out source, not a prebuilt `.a`, which would make ksplc carry every combination of targets.

**A runtime of another version must not link silently.** The IR only declares the `kspl_*` it calls, and a runtime whose bodies changed defines the same names. So `write_unit` in `gen/runtime.kspl` ends the runtime with an empty function named after a hash of the runtime's whole source (`append_abi_symbol`). The IR's `main` calls it first. A runtime of another version lacks the name, and the link stops on an undefined symbol.

Caution: **Keep the reference a call.** A `declare` alone, or one listed in `@llvm.used`, is dropped before the linker resolves it, and the mismatched link passes. `tests/suite/emit_runtime_test.kspl` links an IR file with a runtime whose symbol is renamed, and checks that the link fails.

### Genc (C99): the topological output order

C needs a name declared before it is used. So `emit_file_node` writes everything in a strict *topological* order, each item after what it needs. The C compiler's forward-reference errors (undeclared identifier, incomplete type) are ruled out by construction.

1. **Forward declarations** (`emit_forward_declarations`) of structs, enums, compound types, aliases and externs.
2. **Bodies in dependency order** (`collect_pending_nodes` → `resolve_pending_queues`). Struct, enum and trait bodies, and the compound-type structs (slice, array), pass through a dependency queue (`dep_queue`) and come out topologically sorted. A true cycle falls back to forced output.
   * **A function type's typedef goes on the same queue** (`emit_single_complex_type`). C cannot name a function-pointer type without one, and a generic's field, a return type or an inferred local writes the type by name. A typedef has no forward form, so whatever names one, even through a pointer, waits for it (`fn_typedef_named_by` in `ksplc/gen/c/root.kspl`). The typedef itself waits only for other function types, since a declarator can name an incomplete struct.
3. **All function prototypes** (`emit_function_prototypes`), always before the variables and constants, so a generated vtable constant can name a thunk in its initializer.
4. **Global variables and vtable constants** (`emit_top_level_vars`), also in dependency order. A C static initializer can only name what is defined above it. `const M: Sz = n * 3;` with `n` declared later would fail with "initializer element is not a compile-time constant". Step 2's work-list scheme emits a variable once its initializer names nothing unemitted, and emits a cycle as it stands (sema's `check_static_initializer` reports it). Type annotations are not examined: sema has folded array lengths to numbers.
5. **Function and method bodies**, and the stmt_blocks (`emit_functions_and_impls`).
6. **`main`** (`emit_main_function`).

**The call chain** dispatches on `kind_id` in three tiers (`file` / `stmt` / `expr`) and returns to `Ast_node.emit` (`ksplc/gen/c/root.kspl`) between them: `emit_functions_and_impls` → `emit_fn_def` (`gen/c/decl.kspl`) → `emit_stmt` (`gen/c/stmt.kspl`, reached through `Ast_node.emit`'s default branch) → `emit_expr` (`gen/c/expr.kspl`). The emitters of declaration bodies (`emit_struct_decl` / `emit_enum_decl` / `emit_trait_decl` / `emit_impl_decl`) live in `gen/c/types.kspl`. Type strings are formatted in `gen/c/ctx.kspl` (`t()` / `map_c_type_to`).

**A value return omits C's outer `const`, including one hidden inside a fixed-array typedef.** Such a return spells the alias's unqualified target: C ignores the qualifier on a returned value, and GCC warns if it stays. Pointee qualifiers and qualifiers on stored values stay in place.

**A `#line` goes before every statement, not only where the line changes** (`emit_stmt` in `gen/c/stmt.kspl`). C counts each line past a directive as one more source line. Lower expands one line into several statements (`x: = f()!` becomes a temporary, an `if` and a `throw`). So the `throw`'s `KSPL_RECORD_TRACE()` would read two lines past the `!`. A loop's `for` gets one of its own after its init. **The route a `!` records is genllvm's too**: it calls the same runtime functions with the line `sema.line_of` gives and the file `recorded_name_to` writes (`base/locate.kspl`).

**The generated C is kept free of warnings**, or a new one goes unnoticed. `make test-c-warnings` (`tests/suite/c_warnings_test.kspl`) compiles the generated C of ksplc, of `make debug`'s executable and of `--freestanding` with `-std=c99 -pedantic -Wall -Wextra -O2 -fsyntax-only` on every C compiler found, and fails on a single warning. `-pedantic` holds the C to ISO C99 ("The generated C is ISO C99, not GNU C").

Caution: **Do not drop `--freestanding`, `-Wextra` or `-O2`.** Each catches cases that produce a wrong answer at run time:

| Flag | What only it catches |
| :-- | :-- |
| `--freestanding` | under hosted the system headers' declarations apply, so the `extern` declarations genc writes itself are seen only under freestanding. A mismatch between such a declaration and a call shows only there |
| `-Wextra` | `-Wsign-compare` is not in `-Wall`. C's usual arithmetic conversions go to unsigned, so a comparison involving a negative `Sz` inverts KSPL's meaning |
| `-O2` | `-Wstrict-aliasing` works only with optimization raised. Reinterpreting a type through a pointer garbles the value only in an optimized build |

Only `-Wmissing-field-initializers` and `-Woverlength-strings` are left out. The `{0}` genc writes is correct C, and 4095 bytes in one string literal is a floor a C99 compiler must take, not a rule. An `embed`'s text goes out as one literal, a line of it per line of the file.

**Correct meaning is not enough**; Genc avoids two sources of warnings:

* **Parentheses** (`needs_warning_silencing_parens` in `ksplc/gen/c/expr.kspl`): C's precedence makes some optional, but compilers warn on pairs that "look confusing".
  * Caution: **Do not test on clang alone.** gcc also warns where clang stays quiet: an addition, subtraction or comparison as an operand of a bitwise operator.
* **Braces in a zero initializer** (`emit_zero_init` in `ksplc/gen/c/ctx.kspl`): when the first element is an aggregate, the braces must nest once per level. Too few gives `-Wmissing-braces`, too many `-Wbraced-scalar-init`. An array is a `{ T data[N]; }` struct, so one array makes two levels.

**Aliases become C `typedef`s.** Their forward declarations (`emit_fwd_aliases`) come before the array and compound-type definitions, and among themselves go in dependency order (the work-list scheme of `emit_top_level_vars`). Dependencies are compared by type id, since `emit_resolved_type` builds the name from the `type_id` (`type_mentions_waiting` sees through pointers, slices, arrays, marks and aliases). A function-pointer right-hand side (`fn(I32): I32`) puts the alias's name in the middle of the C declaration (`typedef void (*Name)(int32_t);`), so `emit_c_decl` detects a `type_fn_sig` and uses its own walk and format.

#### Genc orders its type definitions after stripping immutability marks

**Genc decides which type definition must be written first by whether an element type is still in the pending set. It looks at the types with their immutability marks stripped.** The element type of a `Row[2]` is `const_of(Row)`, not `Row`. Unstripped, it matches nothing pending, the wrapper struct comes before the element's definition, and C fails with `array has incomplete element type`. There is no KSPL diagnostic, and a `Row[2]` that is not `const` is unaffected.

**An immutable slice's `ptr` is not `const` in the generated C.** genc writes `U8@` as `const U8 *`, but an immutable slice's C type is the alias `Const_U8_Slice = U8_Slice`, whose `ptr` is non-const. An `impl`'s target is always declared on the mutable side. Without one struct and ABI in C, a method call through an immutable value would fail on a type mismatch. The asymmetry needs two rules:

* **Do not emit an implicit `::` cast to restore the immutability.** The representations are identical in C and in LLVM. A cast would give `.ptr = (const U8 *)buf`, a discarded-qualifier warning.
* **Where the value really is a `const T *` (from KSPL's `T@`), cast explicitly to non-const.** This is emitted only for the `.ptr` of an immutable slice's descriptor literal (`gen/c/expr.kspl`; the same convention as `emit_slice_cast_prefix` for array-to-slice).

#### A switch reaches the backends grouped, its subject named

**The value a `switch` tests (its subject) must arrive at genc as a plain name: an identifier or a one-segment path (`is_plain_name` in `base/ast_ext.kspl`).** Genc's `switch` and each payload read write it more than once. **Lower makes it one, and only Lower**: `lower_stmt_switch` binds any other subject to a `let` temporary. A subject that reaches genc as anything else is an ICE; spelled as a name, it would emit broken C such as `switch (.tag)`.

**Lower also resolves every arm, so neither backend walks the patterns** (`group_switch_arms` in `lower/root.kspl`):

* Each `case` or `default` becomes one `switch_arm` node: its labels, then its block (`build_switch_arm` in `base/ast.kspl`).
* A label that names a variant of the subject's enum stays its `case_pattern`, with the variant's index in `ival`. Both backends read the variant back with `variant_at` in `sema/type/query.kspl`: genc for its enumerator's name, genllvm for its tag. Any other label is its constant value.
* A variant's payload bindings are ordinary declarations at the head of the arm's block. Each reads its field through a `payload_access` node (`build_payload_access`). Genc writes it as `<subject>.payload.<variant>.<field>`, and genllvm loads it at the field's offset (`payload_field_ptr` in `gen/llvm/types.kspl`).
* A declaration keeps its binding's identity (`def_node`), so the references and ARC's count for the binding (`register_arc_arm_bindings` in `lower/arc.kspl`) name the same local.

A `switch` whose arms are not grouped reaches a backend as an ICE.

Caution: **A `switch` built after Lower's walk binds its subject and groups its arms itself**, since nothing lowers it. The chained release ARC synthesizes for an enum (`emit_managed_enum_op` in `lower/arc.kspl`) binds its `p$` with `build_let_decl`, then calls `group_switch_arms`.

#### How the generated code makes overflow wrap around

The specification defines overflow as `mod 2^N`, signed or unsigned ("6.8 Integer arithmetic: folding, overflow, division, shifts" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)). C gives neither directly, so **the generated code names the wrapping type explicitly**, for a different reason per signedness.

| KSPL type | What C does by itself | What the generated C does |
| :-- | :-- | :-- |
| narrower than 32 bits (`U8` / `U16` / `I8` / `I16`) | promotes to the signed `int`: the excess bits stay, and `U16::65535 * U16::65535` overflows `int`, which is *undefined behaviour* | computes in `unsigned` and converts the result back to the type |
| signed `I32` / `I64` / `Sz` | overflow is undefined behaviour: the optimizer can assume it never happens | computes in the unsigned type of the same width |
| `U32` and wider unsigned | wraps at its own width | nothing extra |

**For the narrow types, the excess stays after promotion**, so a following `/`, `%`, `>>` or magnitude comparison would see the value before the wrap. The operands are converted to `unsigned` first, where the excess wraps instead of being undefined, and the result is converted back. `unsigned` is at least 32 bits on every target ksplc knows, so the excess never reaches its own wrap.

Caution: **For the signed types, C makes overflow undefined.** The optimizer relies on that, so emitted plainly, the answer changes with the optimization level. Once it assumes `i *= 2` never overflows, `i > 0` becomes always true and the loop never ends. So the operands are converted to the unsigned type of the same width and computed there.

* The conversion back is implementation-defined in C99, not undefined, and clang, gcc and MSVC all define it as a two's-complement wrap.
* **Use the unsigned type of the same width.** All in `U64` would be 64-bit arithmetic on a 32-bit target, and `Sz` maps to C's `size_t`. Division and remainder cannot be moved, since an unsigned division gives a different answer. Their only overflow is the type's minimum divided by `-1`, answered by the dividend itself (remainder `0`). Branching on it reads the divisor twice, so they go to a run-time entry point taking both operands (`kspl_sdiv` / `kspl_smod`), in the operands' width. A type of 32 bits or fewer goes to `kspl_sdiv32` / `kspl_smod32`, since a 32-bit core has no 64-bit divide. That entry point checks for 0 as well, so the divisor-only entry point (`kspl_div_check`) serves only the unsigned types.
* Note: **The fast path remains.** A divisor that is a translation-time constant other than `0` and `-1` cannot overflow, so a plain `/` or `%` is emitted (the verdict is `divisor_cannot_overflow` in `sema/body/binary.kspl`).
* **The check's width is `int64_t` / `i64`**, the same in both backends. As `ptrdiff_t`, a `U64` or `I64` divisor is truncated on a 32-bit target, and a non-zero value can look like `0` (or the reverse).

**A plain assignment does not show it** (`d: U8 = u8x + u8y;` adds, then narrows). Reading after the wrap does: `(u8x + u8y) / 2U8` gives 150 instead of 22.

The verdict is two functions in `gen/c/expr.kspl`, used by both `emit_binary_expr` and `emit_unary_expr`: `can_exceed_width` (only `+` `-` `*` `<<`) and `wrap_twin` (the type the operands move to). `narrow_unsigned` serves `~` alone, whose result needs only the conversion back.

* **A compound assignment counts too.** `i += 1`, `-=`, `*=` and `<<=` are emitted as `i = (I32)((U32)(i) + (U32)(1))` (`emit_wrapped_compound` in `gen/c/stmt.kspl`). `make test-property` runs both forms at `-O0` and `-O2`.
* **The unary operators count too.** For the unsigned types both `~` and unary minus exceed the width; for the signed types only unary minus does (negating the type's minimum). `!` yields a `Bool` and is out.
* **Parenthesize a converted operand**: C's cast binds only to the next unary expression.
* With `&` `|` `^` `/` `%` `>>`, operands that fit the width give a result that fits. C computes the unsigned types of `U32` and wider at their own width, so they need no conversion back.
* **genllvm is right from the start**: `add i8` and `add i32` both wrap at their width. The folding (`fit_result`) produces `mod 2^N` too.
* Caution: **Self-hosting cannot notice it**: ksplc itself hardly ever reads after a wrap.
* `ksplc/tests/const_fold_width_test.kspl` checks fixed shapes: a global `const` through the folding, and a local through the generated code. `tests/suite/property_test.kspl` checks random expressions over the eight integer types. **Do not rely on the shape that only assigns back into the same width**: it passes even when the conversion back is forgotten.
* **A check at `-O0` does not catch a signed wrap**, since plain C wraps too at `-O0`. Property 3 in `tests/suite/property_test.kspl` checks that `-O0` and `-O2` give the same answer, because the failure is a loop that never ends. `make test-equiv` also builds its program's C with C's signed-overflow trap (`TRAP_CFLAGS` in `tests/suite/equiv_test.kspl`).

#### In a top-level initializer, a constant becomes its value

**In a top-level initializer, both backends write a number as the value sema folded, never as the expression.** Sema decides each initializer once ("The static-initializer check is applied to both `var` and `const`" in [`DESIGN-diagnostics.md`](DESIGN-diagnostics.md)). Its record (`static_value`) is what genc's `emit_expr` and genllvm's `emit_llvm_const_init` read. So a reference to another constant, a division by `-1`, a `&&` and a conditional all reach C and LLVM as one number. C99 requires a constant expression in a file-scope initializer, and the name of an object is not one. gcc and clang accept it as an extension; other C compilers refuse it.

* **A literal or an enum variant keeps its spelling in genc.** It is a C constant already, so the generated C stays readable.
* **A value is not expanded as an expression**, or a chain `const A1 = A0 + 1;` would nest past C's parenthesis limit.
* **A `sizeof` or `offsetof` is the number ksplc's layout model gives**, laid out for the machine named. The C compiler checks that number ("A layout is computed when it is first asked for" in [`DESIGN-sema.md`](DESIGN-sema.md)).

**A constant of any other shape is written as its initializer** (`emit_const_ref_inline` in `ksplc/gen/c/expr.kspl`, `named_const_init` in `gen/llvm/decl.kspl`). A struct, a string or a tagged union has no single number. `const_init_expr` in `sema/decl/eval.kspl` resolves the constant, and genc's record of the path cuts a cycle.

* **A name whose address is taken stays a name.** `&name` is a C99 address constant, while the address of the value written out is no constant, or a copy's. The root of the place under `@`, and of an array turned into a slice (`T[]::table`), is kept by name (`Genc_ctx.addr_root`). genllvm writes the same address as `ptr @name`, and a field's or an element's (`g.v@`, `g[2]@`) as a constant `getelementptr` from it (`emit_const_place_addr` in `gen/llvm/decl.kspl`).
* **A tagged union is written as its initializer, never as a number.** Folded to `0`, it would put an integer where `{ tag, payload }` belongs.

#### The generated C is ISO C99, not GNU C

**Genc writes C that a C99 compiler takes with no extension, so a strict compiler builds what gcc and clang build.** gcc and clang accept several GNU forms without a word, while another compiler refuses them. `make test-c-warnings` compiles with `-pedantic`, which reports each.

| Where | What genc writes | Why not the shorter form |
| :-- | :-- | :-- |
| A file-scope initializer, and each member of one | Plain braces: `const P g = { .x = 1 };`, a string as `KSPL_STR_INIT("…")` (`Genc_ctx.brace_init`) | A compound literal (`(P){ .x = 1 }`) is no constant expression in C99, which a file-scope initializer must be: "initializer element is not constant" |
| A trait whose vtable has no slot (a marker such as `Move_only`) | A member `char kspl_no_slot;` (`emit_trait_decl` in `gen/c/types.kspl`) | C99 has no empty struct |
| A cast between a function and an object pointer (a function passed as a `Void$@`, a thread's entry) | `kspl_fn_to_ptr` / `kspl_ptr_to_fn`, a union in `runtime/core.h` | ISO C has no conversion between the two; every target ksplc builds for gives them one representation, which POSIX's `dlsym` and Windows's `GetProcAddress` rely on too |
| A cast whose target is an aggregate (an immutable element read as its own type) | The operand alone (`emit_as_cast` in `gen/c/expr_postfix.kspl`) | C casts to a scalar type only |

* **A cast in a file-scope initializer stays a cast.** A call is no constant expression, so a function's address stored in a global `Void$@` keeps the plain cast. `-pedantic` reports it, and nothing in the repository writes one.
* **What stays compiler-specific is named and guarded.** `KSPL_UNUSED`, `KSPL_EXPORT` and `KSPL_SECTION` expand to GNU attributes or nothing (`runtime/core.h`). The runtime's attributes, `__thread` (`KSPL_PER_THREAD`), `__atomic_*` builtins, `__builtin_frame_address` and `asm_volatile`'s `__asm__ volatile` are GNU C, which gcc and clang both take. MSVC's `cl.exe` takes none of them, so Kanso's build refuses that toolchain.

### Genc writes less code, not fewer bytes

**The C compiler's time follows the amount of code in function bodies, not the file's size.** Three everyday shapes are written shorter, cutting clang's work on the seed by about 8% at `-g -O0`.

| Shape | Written as | Where | Saving |
| :-- | :-- | :-- | --: |
| A string slice | A `static const` named `kspl_lit_N`, written once per unit before the first function using it | `name_string_literals` in `gen/c/literal.kspl` | about 4% |
| `a && b`, `a \|\| b` | C's own operator where the right side hoists nothing | `lower_logical_op` in `lower/expr.kspl` | about 3% |
| A `for … in` over a slice | The element read as `(coll.ptr + idx)$`; the loop condition already bounds the index | `build_index_loop` in `sema/body/for_in.kspl` | about 1% |

* **genllvm keeps the expanded `&&` / `||`**: it has no short-circuit of its own.
* Names took 78% of the seed's bytes, yet shortening them saved no compile time: the C compiler reads a name once.

### Genllvm (LLVM IR): why the structure differs, and managing SSA

**Genllvm emits no debug information** (no `DIFile` / `DILocation`, no `!dbg`), so stepping through a `--to=llvm` build shows no source line. That is an unimplemented feature, not a fault; only macOS's `ld64` warns about it. `tests/suite/debug_line_test.kspl` checks the C side only.

LLVM IR allows forward references to `%struct` types and `@function` symbols, so `gen_llvm_module.run` has **no forward-declaration phase and no dependency-order work list**. Its stages run in this order:

```mermaid
flowchart LR
    A[emit_slice_base_types] --> B[emit_type_decls] --> C[emit_globals] --> D[emit_fn_defs] --> F[emit_runtime_and_main] --> G["emit_string_pool<br/>(the strings gathered lazily, put out in one lot at the end)"]
```

The call chain mirrors Genc's: `emit_llvm_fn_def` (`ksplc/gen/llvm/decl.kspl`) → `block.emit_llvm_stmt` (`ksplc/gen/llvm/stmt.kspl`) → `node.emit_llvm_expr` / `emit_llvm_lvalue` (`ksplc/gen/llvm/expr.kspl`). In *SSA* form every value gets a fresh numbered register (`%1`, `%2`, …) that is assigned once; an *alloca* reserves a stack slot for a local variable.

* `next_reg()` / `next_label()` in `ksplc/gen/llvm/ctx.kspl` are plain increasing counters, reset per function (`reset_fn_state()`).
* **Allocas are hoisted with two buffers**, `Emit_state{alloca_out, body_out, target}`. `emit_alloca` switches `target` to `alloca_out` and straight back. Once the body is done, `emit_llvm_fn_def` joins `alloca_out` before `body_out`, so every alloca sits at the head of the entry block.

**The expression files are mutually recursive, not layered**: `emit_llvm_expr` in `gen/llvm/expr.kspl` passes aggregates to `gen/llvm/expr_agg.kspl` and calls to `emit_llvm_call` in `gen/llvm/expr_call.kspl`, which calls back for its arguments.

#### Stores and arguments are emitted at 'the receiver's type'

**Genllvm converts a value to the type the field or parameter expects before it stores or passes it**, as C does on assignment. KSPL's integer literals default to `I32`, so `store i32 2` into an `i64` field writes 4 of the 8 bytes. An `i32` passed to an `Sz` parameter is worse, since nothing zero-fills the rest.

```llvm
define void @..._load_raw(ptr %sret, ptr %src, i64 %in_dim, i64 %out_dim, i64 %rank, ptr %arena)
call   void @..._load_raw(ptr %tmp,  ptr %flash,  i32 4,      i32 6,       i32 2,     ptr %sa)
```

**Why the verifier accepts it**: with opaque pointers, a call takes its signature from the call instruction's own text.

**Why it differs between platforms**: an argument in a register comes out right by luck, through a 32-bit operation's zero extension. An argument on the stack breaks: `movl` writes 4 bytes, and the upper 4 keep their old value.

| Platform ABI | Integer argument registers | The call above |
| :-- | :-- | :-- |
| Win64 | 4 | the fifth argument (of six, the `sret` included) goes on the stack, so it breaks |
| SysV (Linux / macOS) | 6 | no stack argument, so it works by luck |

**Why the literal stays `I32`**: on a generic call, sema leaves the arguments' expected types unknown ("A generic call's arguments are checked after instantiation" in [`DESIGN-diagnostics.md`](DESIGN-diagnostics.md)).

**The countermeasure**: convert a numeric scalar to the callee's parameter type before passing. Aggregates are passed by pointer, and taking the parameter's type for one gives a mismatch LLVM rejects.

**The gate checks the IR**: Linux and macOS run-time tests cannot see this mismatch, and LLVM's verifier ignores it. `tests/tools/llvm_ir_abi_check.kspl` compares every direct call's argument types with its `define`'s parameter types (and the `ret`'s type too). It runs over both `ksplc/main.kspl` and `tests/debug/main.kspl` ("Self-hosting does not test a feature ksplc does not use"). A diagnostic prints a value that identifies the caller, such as `arena_used`, not only the broken value.

#### Correctness is not entrusted to zero filling

A `store zeroinitializer` at the head of a compound literal lets the backend narrow a following store, so correctness would rest on the zero fill. **So where a compound literal fills every byte of its memory, the leading zero fill is left out.** That holds only for a fixed-length array whose element type has no internal padding, filled element by element with no index given. Do not include structs: the padding between fields stays uninitialized, and a `memcmp` or a raw-byte persistence reads an indeterminate value.

#### Runtime checks share their failure reports

Bounds, division, shift and enum-tag checks keep their comparisons inline, so each optimizer can remove checks it proves unnecessary. On hosted targets, a failed check calls the runtime's `kspl_*_fail` function with the original operands and source position. That function owns the message: it flushes stdout, writes and flushes stderr, then aborts. Freestanding checks keep their target's failure policy.

**A `main` that returns an error is reported the same way.** Both backends call `kspl_main_fail` in `gen/runtime/hosted.c` with the error's kind (`Main_err` in `gen/entry.kspl`), the error as a 64-bit integer and an enum variant's name. The runtime owns the failure line and the exit status; only the choice of the variant's name stays in each backend.

#### Passing an aggregate is an explicit internal ABI

**genllvm passes every aggregate as a bare `ptr`, as a return value and as an argument, on every platform.** An aggregate is a slice, an array, an enum with a payload (a Result among them), a struct or a trait value. One place decides it: `ret_needs_sret` / `is_llvm_aggregate`. LLVM IR can put a multi-field first-class aggregate straight into a `ret` or an argument. **But no ABI lays down which registers or memory it is assigned to.** clang classifies per target by the C ABI and lowers explicitly before emitting IR. Written as a first-class value on Win64, a 24-byte `Arena` rides in three registers. Yet the Win64 ABI passes any aggregate over 16 bytes through a hidden pointer.

**The `sret(%T)` / `byval(%T)` attributes are not used**, since they return the choice to the backend. A dedicated temporary slot per call gives the callee its own copy.

* The caller allocates the destination among the allocas at the function's head. Placed in a loop's body, it would grow the stack on every iteration.
* Every `ret` goes through `Genllvm_ctx.emit_ret_value`. A path that writes a `ret` directly mixes a value-returning `ret` into an sret function and breaks the IR.
* `is_llvm_aggregate`'s branches must match the type-string output one to one. Kept as two tables, the ABI would drift silently ("the type is i64, yet it is treated as an aggregate").

**It stops at the C boundary**: with `#export` the C compiler classifies, so the LLVM backend cannot pass any struct across by value. The reason is "The FFI boundary check looks inside the type" in docs/DESIGN-programming-language.md.

**Do not give one option two meanings**: the thunks, vtable constants and ARC drop glue that `lower` synthesizes already carry their final names.

Caution: Do not borrow `is_export` to prevent a double prefix. `is_export` also means "pass by the C ABI", so the thunks alone would use the C ABI, and caller and callee would disagree. The symptom is "`io.out().s(...)` prints nothing". The meanings are split into `is_premangled` (emit the name as it is) and `is_export` / `is_ext` (pass by the C ABI).

#### A huge aggregate is not handled as a first-class value

**At `-O0`, SelectionDAG (LLVM's instruction selector) expands a first-class aggregate into as many instructions as there are elements.** Suppose a compound literal is built in a temporary and then loaded as a value. A single `Sz$[4096] = ::{}` then takes about three times the stack frame of carrying it by pointer. With more elements, clang itself crashes with SIGSEGV (`Sz$[65536] = ::{}`), with no KSPL diagnostic. There are two countermeasures:

1. Build directly into the declared memory, with no temporary and no load.
2. Zero-fill a large aggregate with `llvm.memset` from 256B up. Freestanding cannot resolve memset, so there it is still expanded.

#### genllvm rebuilds a global initializer as an LLVM constant

**A global's starting value must be a constant that LLVM understands, so genllvm rebuilds it as an LLVM constant expression itself.** genc can pass `T x = <expression>;` to C as it is.

**A failure to lower it would become 0 with no warning.** Hit on the FQN constants in `sema/type/arc.kspl`, every ARC-related verdict would compare unequal.

There are four requirements:

1. Handle an initializer the same way for `const` and `$var`.
2. Put a string literal in the string pool, emitted as `{ ptr, len }` for a slice type and as an address for a pointer type.
3. Reorder a compound literal into declaration order (LLVM requires every element, in order).
4. Write the array under a slice literal (`T[]::{ … }`) as a private constant `@.arr.N`, and point the slice at it.

**genllvm writes only the shapes sema classified** (`sema/body/static_init.kspl`). A number is the value sema folded, a float included (`fold_float` in `sema/decl/fold_float.kspl`). A trait value is written as the object's address and the vtable's, a pointer cast of an integer as `inttoptr`. **A form sema did not classify is an ICE**: sema refuses what neither backend can write, so reaching one is ksplc's own fault.

**A value holding a tagged union is written as packed bytes** (`emit_llvm_laid_const` in `gen/llvm/decl.kspl`), since no constant can fill a tag and raw words field by field. Such a global gets a packed struct type of its own, every piece at ksplc's layout offset (`field_offset_of`, `enum_payload_offset`, `payload_field_offset`). The code reads it at the same offsets.

Caution: Do not let an initializer that cannot be evaluated silently fall back to `zeroinitializer`. **A backend that generates nothing is safer than one that changes the meaning of what it generates.**

**A test holds the backends equivalent**: `tests/prog/equiv.kspl` builds one program with both C and LLVM and compares the standard output. Only this catches a bug where one backend alone breaks.

### A function pointer breaks differently in each backend

**A function pointer is a kind of its own inside the compiler (`is_fn_ptr` in `sema/type/query.kspl`)**, outside the composite classification (`.pointer` / `.slice` / `.array` / `.result`). **So every branch on "is it a pointer" lets it slip past**, and it chokes in a different place in each backend.

**genc: the `const` cannot go before the type name.** `const I32 (*p)(I32)` is a pointer to a function returning a const I32, not an immutable binding. The `const` belongs inside the *declarator*, the part of a declaration around the name: `I32 (* const p)(I32)`.

Caution: **Decide the position on the same grounds as the code that emits the declarator.** `emit_c_decl` decides by the type node written (`is_type_fn_ptr`), which can disagree with the resolved type ID. Through `typedef Op = fn(a: I32): I32`, C gets the typedef name, so the `const` goes before it. Judged by type ID, the `const` silently vanishes, and the value leaves `.rodata`. The verdict is `const_goes_before_type` / `const_goes_in_declarator` in `gen/c/decl.kspl`, shared by the forward declaration (`gen/c/decl.kspl`) and the body (`gen/c/stmt.kspl`).

A raw pointer leaves out the leading `const` for another reason: its type name already emits `const T*` (`emits_c_const` / `type_name_carries_const` in `gen/c/ctx.kspl`).

**genllvm: a function's address is written by name.** A function has no folded value, so `emit_llvm_const_init` writes it as the path a run-time reference takes (`emit_llvm_lvalue`). That path alone tells a global from a local; a local read as a global points at a different symbol.

The regression test is `tests/prog/equiv.kspl`: a `const`, a mutable and a `null` function pointer in globals, **the `const` through an alias and written directly**.

### An attribute: interpreted in both backends, or refused in one

**An attribute such as `#inline` must work under both backends, or be an error under the one that cannot do it. So never let only one backend read `has_attribute`.** Otherwise `#inline` (on `List.push/get/set/at` in `std/ds.kspl`), `#noreturn`, `#naked`, `#section(...)` and `#align(N)` would be silently dropped under `--to=llvm` (Principle 5). There are two ways:

1. **Implement it in both backends.** A function attribute nearly always maps to one LLVM IR word: `#inline`→`inlinehint`, `#noreturn`→`noreturn`, `#naked`→`naked`, `#section("s")`→`section "s"`. `emit_llvm_fn_attributes` in `gen/llvm/decl.kspl` emits them in the attribute position of `define ... ) <attributes> {`; a global variable's `section` adds `, section "s"` after the initializer.
   * Follow LangRef's order (LLVM's language reference: fn attrs → section → align). Reversed, `llvm-as` reports a syntax error.
   * Do not map `#inline` to `alwaysinline`: that forces inlining even at `-O0`, so debugging behaves differently from genc's output.
2. **Declare it single-backend and make it a compile error**, only where there is no portable counterpart. `#interrupt` is a per-machine calling convention with no LLVM IR form. An `#align(N)` placed directly on a function or a variable reaches C as an expression genc copies, so no constant exists to pass to LLVM. On a struct, sema folds it into `Struct_def.align_attr`, and it works on both backends. `attr_rule` in `sema/decl/attrs.kspl` marks these two C-only, which makes them an error under `--to=llvm`.

**Every new attribute takes one of the two ways.** `#cfg` and `#link` are read before either backend, so the backends cannot differ on them. Normalization drops the declaration, and the libraries a kept `extern` block names are written from the tree (`write_libs_file` in `tools/libs.kspl`). The canonical source for the decision is the "Backends supported" column of the attribute table in `docs/SPEC-programming-language.md`. The regression tests are the cases `attr_interrupt_llvm_backend` and `attr_fn_align_llvm_backend` in `tests/negative/attr.kspl` (both with `// ARGS: --to=llvm`).

**The LLVM backend's missing debug information is a gap of the same kind.** It stays open because `-g` is a build flag, not an attribute: there is nothing to refuse.

**`#section("name")` passes the string through unchanged** to `KSPL_SECTION("name")`, which prefixes `__DATA,` under `__APPLE__` alone, since Mach-O takes only `segment,section`. A section the linker script names `.name` must be written `#section(".name")`, dot included. Otherwise the linker places it as an orphan, and `(NOLOAD)` and the like silently stop applying.

### A sanitizer reaches LLVM IR through the marks ksplc writes

**clang's `-fsanitize=address`, `thread` and `memory` instrument only a function marked for them** (`sanitize_address`, `sanitize_thread`, `sanitize_memory`), and clang's own front end writes the mark as it reads C. `--to=llvm`'s IR passes through no front end, so without a mark, a sanitized build watches only the runtime's C. `--sanitize=<names>` is ksplc doing the front end's share: `emit_sanitize_attrs` in `gen/llvm/ctx.kspl` writes the marks on **every** `define`, the hand-written ones too (`emit_by_hand` in `gen/llvm/module.kspl` for the run-time checks, and `main`). A naked function is marked as well, as clang marks a C one.

**Asked for, not written always.** A mark is not free where no sanitizer runs: LLVM then declines to read memory earlier or wider than the program does.

**One way to ask, on the subcommand that needs it** (Principles 5 and 6). Which subcommands take `--sanitize`, and what is refused, is §2.2.2 of [`SPEC-tools.md`](SPEC-tools.md). The reasons:

* A compile that writes C has nothing to mark: its C compiler marks the C it reads.
* In `ksplc build`, the same word in `--cflags` would be a second way to ask (`check_sanitize` in `cli.kspl`). The packages' fuzz builds ask through `--sanitize`.
* `ksplc run` caches one program a script, which a sanitized build would have to be kept apart from.
* **`undefined` has no mark**: clang's front end writes each of its checks into the code, knowing C's types, which IR has lost. KSPL's own checks in both backends cover what it defines as a stop. Writing clang's checks into the IR would be a second implementation of them.
* A sanitizer's runtime works through the OS, so `--freestanding` is refused. Which hosted machine has which sanitizer is the C compiler's to say; a copy in ksplc would drift.

**A compile with `--to=llvm` cannot check that the C compiler is told the same.** The link is the user's, as with `--machine`: the marks alone change nothing, and `-fsanitize=` alone watches only the runtime. The specification says to name both.

**The regression tests**: `tests/suite/sanitize_test.kspl` reads past a heap allocation through a raw pointer, which no bounds check sees. Built through LLVM with the marks, the address sanitizer must report it; built without them, nothing must be reported. ksplc's own tests are built through LLVM with the marks and must report nothing. `ksplc/tests/support/cli_sanitize.kspl` checks that every `define` is marked and each refusal.

### Split compilation: emitting one program as several translation units (`--split`)

With `--split=N` (N > 1), Genc walks the same `root_file` N+1 times and writes one shared header plus N unit `.c` files (`pipeline.Compiler.emit_c_units`). The C compiler can then work on them in parallel. **Only code generation and C compilation are split**; Parse, Sema and Lower are untouched.

The diagram shows what `--split=3` writes and how the files meet.

```mermaid
flowchart TB
    H["shared header<br/>types, prototypes, extern globals"]
    H --> U0["unit 0<br/>+ runtime body half + main"]
    H --> U1["unit 1"]
    H --> U2["unit 2"]
    U0 --> L["the linker joins the objects"]
    U1 --> L
    U2 --> L
```

| Walk | `gen_c_ctx.Emit_part` | Output |
| :-- | :-- | :-- |
| 1st | `shared_decls` | system headers, the runtime's declaration half, forward declarations, type bodies, non-`static` prototypes, `extern` declarations of globals |
| 2nd onward | `unit` (by `unit_index`) | `#include` of the shared header, then its own share's `static` prototypes, global bodies and function bodies |

`--split=1` (the default) is `whole`: declarations and bodies in one file.

**A definition's unit is decided by its file path's hash alone** (`gen_c_ctx.unit_for`). Balancing by size, or dealing out in order of appearance, would let an unrelated edit move definitions between units and invalidate every cached object. A monomorphized body carries the template's file in `loc.file` (`propagate_loc_file` in `sema/decl/mono.kspl`), so it goes to the unit of the file that defines the generic.

**`priv` does not decide what becomes `static`.** ARC's `retain` / `release` are `priv fn`s in `std/refcount`, but Lower synthesizes their calls in the user's file. Only a name unique within its own file can be made `static` (`Sema_symbol.has_program_unique_c_name` in `sema/type/scope.kspl`, `Ast_node.has_file_local_c_symbol` in `gen/c/decl.kspl`), never a method or a generic instance.

Caution: **Keep this answer the same as whether the mangling adds a file prefix (`is_private_symbol` in `lower/abi.kspl`).** If one changes alone, a name without the prefix becomes `static`, and the link breaks only when the split count changes. The grounds are "Visibility and linkage are separate axes" in [`../../docs/DESIGN-programming-language.md`](../../docs/DESIGN-programming-language.md).

**Emit the prototype and the body to the same unit** (`proto_belongs_here` in `gen/c/decl.kspl`). An impl's methods are placed by the impl's `loc`, not their own, and a mismatch leaves a unit holding a `static` declaration with no definition.

**Unit 0 alone** takes the runtime's body half and the `main` wrapper (`Genc_ctx.owns_singleton`).

**Splitting pays only when the units compile in parallel.** Every unit rereads the shared header, so splitting increases the total C clang reads.

Caution: **Do not write a figure here.** It depends on the core count, `CFLAGS` and the size of the generated C. To measure, time C compilation plus link, serially and in parallel, with and without `--split`, and keep the result with its conditions.

**For small generated C, splitting by the core count is a loss, and that is accepted (a decision).** A small script puts nearly everything into unit 0, and `ksplc run` chooses `--split=N` before generation (`pick_unit_count` in `ksplc/tools/run.kspl`). The loss on a small program is small and the gain on a large one far larger, so one rule serves both (Principle 6).

**The self-host build splits, one unit per core.** Each stage writes into a folder of its own under one name (`out/gen/stage1/ksplc.*`), since every unit names its header. The check compares the stages byte for byte. **The seed and the shipped build take stage2's C whole**, since `-O2` inlines only within one unit.

**Only the C backend splits.** genllvm has no forward-declaration phase and writes the string pool in one piece at the end, so its output cannot be split into translation units.

### Self-hosting does not test a feature ksplc does not use

**Self-hosting (the compiler compiling itself to a byte-identical result) proves only the features ksplc's own source uses. A feature it never uses can be broken while that check stays green.**

Caution: **After adding a backend, do not stop at "it can compile itself": run the whole run-time suite on that backend too.** `make LLVM=1 debug` (the run-time tests through LLVM) fails at once on such a defect.

For example, genllvm's type mapping applies `strip_const` before judging, since LLVM IR has no const. A path that bypasses it names a type that is never declared, a hole genc's string type names do not have. **Each backend breaks differently, so one passing proves nothing.**
