# ksplc

**The KSPL compiler**, self-hosting and written in KSPL. It reads KSPL source and writes C99 by default (`--target=c`), or LLVM IR (`--target=llvm`). This file says which folder does what; the internal design and its reasons are in [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

## Run it

```sh
ksplc hello.kspls hello.c && clang hello.c $(ksplc info link-libs) -o hello   # the default target, C99
ksplc --target=llvm hello.kspls hello.ll   # then clang hello.ll with the runtime ksplc emit-runtime puts out
```

**`make test` runs the compiler's own tests from this folder** ([`ksplc/Makefile`](Makefile)). It needs only a `ksplc` and the kspeg this package uses. It runs the compiler's answers, checked by programs it builds (`make test-answers`, [`ksplc/tests/`](tests/)), and the suites that drive this folder's compiler from outside (`make test-suites`, [`ksplc/tests/suite/`](tests/suite/)). ksplc names itself in [`ksplc/ksplc.cfg`](ksplc.cfg), so a copy of this folder runs them the same way.

**`make self-host` rebuilds this folder's compiler** from the `ksplc` it is given and requires the result to reproduce itself, as the repository's `make` does from [`seed.c`](seed.c). Building that first compiler from the seed is the repository's job, and so are the checks on the built compiler that reach past this folder (the repository's `tests/`).

## The idea

One `Ast_node` tree flows **strictly one way**, from Parse to Genc/Genllvm (why is §1.1 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md)):

```
.kspls → Parse → (Desugar) → Sema → Lower → Genc / Genllvm → .c / .ll
```

## What is here

The pipeline's folders come first, in data-flow order (the two backends and their shared runtime under `gen/`), then the four outside it: `base/`, `lsp/`, `fmt/` and `tools/`. Each folder's section names its files; the design of each stage is the chapter of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md) named at the section's end.

Directly in this folder:

* [`main.kspls`](main.kspls) — the entry point: it parses the CLI and dispatches each subcommand, with the usage text in [`usage.kspls`](usage.kspls).
* [`pipeline.kspls`](pipeline.kspls) — the `Compiler` that runs the stages in order.
* [`source_checks.kspls`](source_checks.kspls) — the checks on the source's own spelling (the indentation, a `//<` that reaches nothing, a comment's pointer), run once the declarations are collected.

### parse/ — the Parse layer

**It reads the source text, builds the abstract syntax tree and normalizes it.**

* [`load.kspls`](parse/load.kspls) — `load_and_parse_file`, the one orchestrator, which follows the `import`s itself.
* [`normalize.kspls`](parse/normalize.kspls), with [`normalize_decl.kspls`](parse/normalize_decl.kspls) and [`normalize_stmt.kspls`](parse/normalize_stmt.kspls) — normalizing the tree, declarations and statements apart.
* [`layout.kspls`](parse/layout.kspls) — turns a file in the indentation notation into the brace shape; [`line_cont.kspls`](parse/line_cont.kspls) decides what joins a line to the next, which the formatter asks too, so both read a line alike.
* [`source_fix.kspls`](parse/source_fix.kspls) — fixes the source's spelling before analysis.
* [`desugar.kspls`](parse/desugar.kspls), with [`desugar_slice.kspls`](parse/desugar_slice.kspls) and [`desugar_closure.kspls`](parse/desugar_closure.kspls) — the sugar that needs no types; [`format_spec.kspls`](parse/format_spec.kspls) reads a string interpolation's `SPEC`.
* [`ast_cache.kspls`](parse/ast_cache.kspls) — keeps the normalized AST on disk so the next parse is skipped; [`syntax_msg.kspls`](parse/syntax_msg.kspls) writes a syntax error's message.

It drives the grammar [`kspl.kspeg`](kspl.kspeg) through the engine in [kspeg](../kspeg/README.md).

```sh
make test-kspls   # the two notations of tests/kspls/tour.kspl(s) give one AST, one C, one set of positions
```

The design is chapter 3 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### sema/ — the Sema layer

**It walks the AST for type inference, symbol resolution and scopes.** The entry points are `run` in [`decl/collect.kspls`](sema/decl/collect.kspls), which registers every file's declarations first, and `run` in [`body/infer.kspls`](sema/body/infer.kspls), the main walk. The five folders, from the bottom (which way each may import is §4.2 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md)):

* [`type/`](sema/type/) — how a type and a name are expressed: `env` / `query` / `arc` (the type table and its queries), `scope` (the symbol table), `display` (the strings a diagnostic prints).
* [`session/`](sema/session/) — the records shared through one analysis: `ctx` (`Sema_ctx` itself, the diagnostics, declaring a symbol), `state`, `import_table` / `imports` (the import declarations and their ledger), `pointer` (what a comment's pointer stands for), `c_boundary` (what the generated C cannot hold), `prof` (the breakdown of sema's time).
* [`decl/`](sema/decl/) — what is there, under what name, and of what type: `collect` (the entry point), `declare`, `registry` / `layout`, `resolve`, `access`, `attrs`, `eval`, `reflect`, `type_check`, the generics (`mono*` / `subst` / `variance`), the traits (`trait_check` / `trait_default`).
* [`flow/`](sema/flow/) — which state a binding is in, and when: `track`, `stmt` (branching and joining), `release`, `report` (the diagnostics).
* [`body/`](sema/body/) — whether the code is right: `infer` (the main walk), the expressions, the statements, the calls (`generic_infer` reads a call's type arguments off its arguments), the coercions, `lint_stmt`.

```sh
make debug-ksplc   # the compiler's own tests, the type checks and the diagnostics among them
```

The design is chapter 4 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md); where a check goes and what a diagnostic points at is chapter 11 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md). The diagnostic codes this layer emits are listed in [`ksplc/docs/SPEC-tools.md`](docs/SPEC-tools.md).

### lower/ — the Lower layer

**It levels the typed AST into a shape with no dependence on a backend.** The passes run in the order §5.2 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md) gives.

* [`root.kspls`](lower/root.kspls) — the one recursive walk that flattens the control flow; [`expr.kspls`](lower/expr.kspls) hoists the expressions inside it, [`defer.kspls`](lower/defer.kspls) flattens `defer` and the exits that run it, and [`ctx.kspls`](lower/ctx.kspls) holds the walk's state.
* [`arc.kspls`](lower/arc.kspls) — inserts ARC's `retain()` / `release()` on the way.
* [`vtable.kspls`](lower/vtable.kspls) — a trait value's thunks and vtables.
* [`abi.kspls`](lower/abi.kspls) — the ABI mangling, and desugaring the method calls.
* [`prune.kspls`](lower/prune.kspls) — drops the functions and types nothing calls.
* [`verify.kspls`](lower/verify.kspls) — checks that the tree's types mesh at the exit.

```sh
make test-equiv   # the C and the LLVM outputs of one program agree, so what lower hands down is backend-neutral
```

The design is chapter 5 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md), and ARC's is chapter 12 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### gen/ — what the two backends share

**What the two outputs must agree on is written once, directly under `gen/`** (why is §6.2 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md)).

* [`runtime.kspls`](gen/runtime.kspls) — hands out the C runtime that completes either output. The runtime itself is [`gen/runtime/`](gen/runtime/): `core.*` for every target, plus either `hosted.*` (an OS beneath, split by subject into `hosted_fs` / `hosted_net` / `hosted_proc` / `hosted_spawn` / `hosted_thread` / `hosted_tls`) or `freestanding.*` (bare metal).
* [`entry.kspls`](gen/entry.kspls) — what the generated `main` does around `kspl_main`.
* [`embed.kspls`](gen/embed.kspls) — reads the file an `embed` names.

```sh
make test-emit-runtime   # the runtime handed out whole, and one entry point whichever backend built the program
```

### gen/c/ — the C99 backend

**It turns the flattened AST into C99.** The `.c` holds the C runtime too (`gen/` above), unless `--omit-runtime` leaves its bodies to the file `ksplc emit-runtime` wrote.

* [`root.kspls`](gen/c/root.kspls) — `run`, the single entry.
* [`ctx.kspls`](gen/c/ctx.kspls) — the context and its fluent output API.
* [`decl.kspls`](gen/c/decl.kspls) the declarations, [`types.kspls`](gen/c/types.kspls) the types, [`stmt.kspls`](gen/c/stmt.kspls) the statements, and [`expr.kspls`](gen/c/expr.kspls) the expressions, with the postfix forms in [`expr_postfix.kspls`](gen/c/expr_postfix.kspls).
* [`literal.kspls`](gen/c/literal.kspls) — turns KSPL's literals into C strings.

### gen/llvm/ — the LLVM IR backend

**It turns the same flattened AST into LLVM IR** (`--target=llvm`). It emits no debug information. The host features' bodies are the C runtime's ([`gen/runtime/`](gen/runtime/)), which its artifact links against.

* [`module.kspls`](gen/llvm/module.kspls) — `run`, the entry, matching the C backend's.
* [`ctx.kspls`](gen/llvm/ctx.kspls) — the context at the centre: the output buffer and the SSA numbering.
* [`decl.kspls`](gen/llvm/decl.kspls) the top-level declarations, [`types.kspls`](gen/llvm/types.kspls) the types and their LLVM spellings, [`stmt.kspls`](gen/llvm/stmt.kspls) the statements, and [`expr.kspls`](gen/llvm/expr.kspls) the expressions, with the aggregates in [`expr_agg.kspls`](gen/llvm/expr_agg.kspls) and the calls in [`expr_call.kspls`](gen/llvm/expr_call.kspls).

Both backends' design, and what each refuses, is chapter 6 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### base/ — the foundation every layer stands on

**The lowest tier, below the pipeline.** Every layer opens with a line like this one; nothing here runs on its own.

```kspls
import "ksplc/base/ast" { Ast_node }
```

* The tree: [`ast.kspls`](base/ast.kspls) is the general-purpose node `Ast_node` and its verification, [`ast_kinds.kspls`](base/ast_kinds.kspls) the closed set of node kinds, [`ast_ext.kspls`](base/ast_ext.kspls) the safe accessors, [`ast_place.kspls`](base/ast_place.kspls) the place predicates, [`ast_spell.kspls`](base/ast_spell.kspls) spelling a node back, and [`ast_doc.kspls`](base/ast_doc.kspls) the `//<` a declaration carries.
* The shared state: [`core.kspls`](base/core.kspls) holds the shared arenas, the compiler's configuration and the string pool, and [`setup.kspls`](base/setup.kspls) starts and ends the layer in one go.
* The source: [`as_written.kspls`](base/as_written.kspls) keeps the text as typed before the indentation is fixed (what a diagnostic quotes), [`locate.kspls`](base/locate.kspls) says where a source comes from and its logical name, [`lines.kspls`](base/lines.kspls) finds where a line begins and ends, and [`literal.kspls`](base/literal.kspls) reads a literal's spelling.
* The diagnostics: [`diag.kspls`](base/diag.kspls) prints them, [`lint_codes.kspls`](base/lint_codes.kspls) is the registry of their codes, and [`cfg_inactive.kspls`](base/cfg_inactive.kspls) keeps the ranges a `#cfg()` left out, so the editor can say why nothing stands there.
* The names emitted: [`mangle.kspls`](base/mangle.kspls) turns KSPL's names into C and LLVM identifiers, and [`c_name.kspls`](base/c_name.kspls) avoids the C names that cannot be used plain.
* The settings and the packages: [`config_file.kspls`](base/config_file.kspls) reads `ksplc.cfg`, and [`package.kspls`](base/package.kspls) its `[package]`: a package's name, what it uses, and the logical name of a file inside it.
* The measurements: [`cache.kspls`](base/cache.kspls) places the cache on disk, and [`stats.kspls`](base/stats.kspls) counts each stage's time and arena use.

The design is chapter 1 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md); the rules for handling the AST every layer shares, and the arena model, are chapters 7 and 8 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### lsp/ — the language server

**It drives the pipeline from outside, once per request from the editor.**

* [`server.kspls`](lsp/server.kspls) — the supervisor of a child worker.
* [`worker.kspls`](lsp/worker.kspls) — builds the state a request is answered from, and routes each method from one table.
* [`state.kspls`](lsp/state.kspls) — what lasts between requests (the open documents' texts, the analysed state, the arena's rewind point).
* [`msg.kspls`](lsp/msg.kspls) — reads and writes the JSON-RPC messages.
* Each answer has its own file, reading the state alone, never the dispatch: navigation ([`nav.kspls`](lsp/nav.kspls)), how a declaration's types and signature are spelt ([`spell.kspls`](lsp/spell.kspls)), hover ([`hover.kspls`](lsp/hover.kspls)), completion ([`complete.kspls`](lsp/complete.kspls)), references and renaming ([`uses.kspls`](lsp/uses.kspls)), the call hierarchy ([`call_hier.kspls`](lsp/call_hier.kspls)), semantic tokens ([`semtok.kspls`](lsp/semtok.kspls)), and which files are in the workspace ([`workspace.kspls`](lsp/workspace.kspls)).

```sh
make test-lsp   # starts the server once and drives every request against it
```

The design is §10.1 to §10.12 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md). What the editor may rely on is [`ksplc/docs/SPEC-tools.md`](docs/SPEC-tools.md), "The language server (ksplc lsp)".

### fmt/ — the formatter

**It turns the Parse layer's AST back into formatted source text.**

* [`printer.kspls`](fmt/printer.kspls) — the printer, advancing monotonically through the original text.
* [`trivia.kspls`](fmt/trivia.kspls) the comments and blank lines between the tokens, [`space.kspls`](fmt/space.kspls) the whitespace and wrapping (carrying a string onto the next line among them), and [`style.kspls`](fmt/style.kspls) the settings `--style` reads.
* What it reads from, kept apart: [`kinds.kspls`](fmt/kinds.kspls) sorts the node kinds and the token spellings, [`source.kspls`](fmt/source.kspls) reads the original text around a position, and [`measure.kspls`](fmt/measure.kspls) a node's shape and width.
* [`import.kspls`](fmt/import.kspls) — puts the run of `import`s into name order before the printer runs.
* [`text.kspls`](fmt/text.kspls) — the one path through a text that both `ksplc fmt` and the lint take (the imports' order, the printer, the rounds that put parentheses in).
* [`file.kspls`](fmt/file.kspls) — one file's round trip around it for `ksplc fmt`: taking off and putting back the BOM, the line terminator and the shebang, and writing back.

```sh
make fmt    # every tracked .kspl / .kspls, each in its own notation
```

What `ksplc fmt` and `--style` promise is [`ksplc/docs/SPEC-tools.md`](docs/SPEC-tools.md), "3. The formatter (ksplc fmt)". The formatter's own decisions (the `import`s reordered as text before the printer, nothing folded by default, blank lines and the line terminator) are §10.13 to §10.15 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### tools/ — the tools that work on the pipeline's artifact

**Commands built on what the pipeline produces, and the tools that inspect the compiler's own parts.**

* [`keywords.kspls`](tools/keywords.kspls) — derives the keyword list from the grammar.
* [`decls.kspls`](tools/decls.kspls) — assembles only the declarations, for handing out (`--emit-decls=`).
* [`surface.kspls`](tools/surface.kspls) — the record of the API a package offers (`--emit-surface=`).
* [`doc.kspls`](tools/doc.kspls) — what a file, an entry or a folder publishes, rendered from the source as the reference to read (`ksplc doc`).
* [`explain.kspls`](tools/explain.kspls) — prints a diagnostic code's section of the tools specification (`ksplc explain`).
* [`run.kspls`](tools/run.kspls) — `ksplc run`.

```sh
make lint   # the static analysis alone; zero down to hints is a pass
```

The CLI options, and the formatter, the language server and the linter as seen from outside, are specified in [`ksplc/docs/SPEC-tools.md`](docs/SPEC-tools.md). Why lint is switched per code and where the settings file sits is chapter 13 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

### kspl.kspeg / seed.c — the grammar and the seed

`ksplc/kspl.kspeg` is the canonical text of KSPL's own grammar, a build input `ksplc/main.kspls` embeds, not documentation. Its KSPEG notation is specified in [`kspeg/docs/SPEC-notation.md`](../kspeg/docs/SPEC-notation.md), and the engine that interprets it is in `kspeg/`.

`ksplc/seed.c` is the bootstrap's seed compiler (generated C). After any change under `ksplc/` (`ksplc/kspl.kspeg` included), update the seed with `make commit-seed`, following §1.2/§1.3 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md).

## The suites' folders, and adding a fixture

**A suite is run by one ksplc and inspects another.** [`ksplc/Makefile`](Makefile) names them `RUNNER` (the compiler that runs the suite) and `UNDER` (the compiler under inspection), and `SCRATCH` is where a suite writes its files; the repository fills the three with its seed, its stage1 and a place of its own. `make test-<name>` runs one suite, here or from the repository's root. The names are `SUITES` in [`ksplc/Makefile`](Makefile), and what each suite checks is its opening comment, in the file its `suite_<name>` line names.

| Folder | What lives there |
|---|---|
| [`tests/suite/`](tests/suite/) | One suite, `<name>_test.kspls`, run by `make test-<name>` |
| [`tests/support/`](tests/support/) | Code the suites read: `harness*`, shared by every suite, and `<suite name>_<subject>`, one suite's own piece |
| [`tests/negative/`](tests/negative/) [`tests/lint/`](tests/lint/) [`tests/runtime/`](tests/runtime/) | The fixtures `test-negative`, `test-lint` and `test-runtime` read, one case (or a few) per file |
| [`tests/prog/`](tests/prog/) | A one-file program under inspection, which a suite builds on both backends or reads a line-number landmark from |
| [`tests/filepath/`](tests/filepath/) | `test-file-path`'s material. **It takes two files**: with one, the unspecified-visibility path is never taken |
| [`tests/kspls/`](tests/kspls/) | `test-kspls`'s twins: one source in both notations, which must give the same C. The language tour is written from one of them |

**The shared foundation is split by the reason for reading it**: `harness`, `harness_build` (the only caller of the C compiler and the linker), `harness_expect`, `harness_markers` and `harness_grow`, each saying in its opening comment what it holds.

A fixture is a source with its expectation in the opening comment. The three folders share the marks (read by `harness_markers.markers()`):

```kspls
//< Write in 1 to 4 lines what is being pinned down (why it breaks if it is otherwise).
// ARGS: --target=llvm          the arguments to prefix to the compiler (omissible)
// EXPECT: <what the output must contain>
// EXPECT-NOT: <what the output must not contain>
program
```

**The description holds at most four lines of text**, a bare `//<` parting aside, and `make test-conventions` refuses more: the cases are a few lines each, so a longer one outgrows what it describes. A trap one case guards goes beside that case, as a `//` above it.

* `tests/negative/`: runs `ksplc [ARGS] <file> <out.c>` and also demands **a non-zero exit**.
* `tests/lint/`: runs `ksplc lint [ARGS] <file>`; lint exits 0 even with diagnostics, so the exit code is not looked at.
* `tests/runtime/`: the compile must pass; it then links and runs the program, matches its own output, and also demands **a non-zero exit** (this folder pins down stopping at run time).
  * **Write the subscript and the like so that it is decided at run time.** A constant subscript inside the range emits no check (`index_is_static_in_range` in `sema/body/postfix.kspls`), so the test would never take the run-time path.
  * The exception is a fixture pinning down "the boundary that may be omitted" (`tests/runtime/array_index_constant_out_of_bounds.kspls`).
  * Caution: **Put the position (`at <file>:`) in `EXPECT` too.** Matching the sentence alone lets a wrongly spelt file name slip past (LLVM puts it in the string pool, where its head and tail drop if the wrapping is wrong). A fixture here is this package's, so the position names it by its logical name (`ksplc/tests/runtime/<name>`).
  * Each fixture runs on both C and LLVM, so write marks that **hold on both** (where the output holds an address, which changes every run, leave that part out of the marks). There, writing a constant has a meaning.
  * **A fixture imports nothing beyond what this package uses.** It is compiled as part of package `ksplc`, so a stop only another package's code can reach is that package's to pin.
* Do not repeat an `EXPECT-NOT:` string in the same file's comments: a diagnostic quotes the source line, so the comment appears in the output and fails its own check.
* A file may hold several cases (`tests/negative/readonly_write.kspls`, `offsetof.kspls`, …): each case is one function, `fn case_<name>()`, with every case's marks together at the head. **Only checks raised inside a function body may share a file**, and only where the compile really reports every case. Several checks (a cycle check among them) report the first hit and say nothing of the rest. Such a check stays one per file: merged, the rest are lost silently and the gate stays green. Prove a merge by the marks: the multiset of `EXPECT` lines over `tests/negative/` must read the same before and after.

## Files near the limit and how they split

**Each file near the cap, and how it splits.** `tests/negative/deep_*` is material that confirms a limit itself, so once split, the test would no longer hold (the check excludes it by name).

* [`ksplc/tests/suite/fmt_test.kspls`](tests/suite/fmt_test.kspls): what splits out is the material: the `src_*` constants, pairs of an input and its expected output, which are data read only by the cases below them. Where it goes is a new `fmt_material.kspls` under `ksplc/tests/support/`.
* [`ksplc/tests/suite/std_dir_test.kspls`](tests/suite/std_dir_test.kspls): what splits out is the band of a package that names itself (`[package]` in its folder's `ksplc.cfg`: the `named_*` material and the cases on it), which asks nothing about where `std` is. Where it goes is a new `std_dir_named.kspls` under `ksplc/tests/support/`. The helpers both halves call (`case_dir`, `run_exe` and `ksplc_env`) go down with it, and the suite imports them back.

**How to choose the cut is "Choosing where to split a file" in [`docs/DESIGN.md`](../docs/DESIGN.md).** This package adds two constraints of its own:

* **`make fmt` and `make test-fmt-tree` use the seed**, so in a split that touches the grammar, run `make commit-seed` first (why is §1.2 of [`ksplc/docs/DESIGN.md`](docs/DESIGN.md)).
* **A suite splits where what it reads splits.** What only the repository's whole tree can show (a common word read across every package, a rename reaching another package's files) is not asked here, since a copy of this folder has no such tree; the queries this folder can answer for itself stay in `lsp`, with this folder as the workspace.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`ksplc/docs/README.md`](docs/README.md) | The index of this package's documents. | Whoever looks for one of them |
| [`ksplc/docs/SPEC-tools.md`](docs/SPEC-tools.md) | The CLI options, the formatter, the language server and the linter as seen from outside, and what each diagnostic code means. | Whoever writes KSPL and runs the tools. Needs a built `ksplc` to try them against |
| [`ksplc/docs/DESIGN.md`](docs/DESIGN.md) | The compiler's internal design, data flow and implementation conventions, and why it is built this way. | Whoever changes ksplc. **Read at least chapter 1 and chapter 2 before touching anything here** |
| [`docs/SPEC-language.md`](../docs/SPEC-language.md) | The language specification being implemented. | Whoever writes KSPL, and whoever changes ksplc |
| [`docs/HOWTO-build.md`](../docs/HOWTO-build.md) | The build procedure and the two-stage bootstrap. | Whoever changes ksplc. Needs a C compiler |
| [`docs/SPEC-gates.md`](../docs/SPEC-gates.md) | What every gate checks, per platform. | Whoever changes ksplc |
| [std](../std/README.md) | The standard library the compiler is itself written on; every file it publishes is listed by `ksplc doc std`. | Whoever changes ksplc |
| [kspeg](../kspeg/README.md) | The engine that drives `kspl.kspeg`, the grammar. | Whoever changes how the language is read |
