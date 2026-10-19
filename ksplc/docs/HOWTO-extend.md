# Extending the compiler

**This guide gives the steps for the six changes to `ksplc` that touch several places at once.** They are a diagnostic code, an AST node kind, a primitive type, a subcommand, a target machine, and the seed. Each step names the file, the command to run, and what fails if the step is left out. You need a clone that builds (`make` passes, [`docs/HOWTO-build.md`](../../docs/HOWTO-build.md)). Read "The compiler as a whole" in [`DESIGN-compiler.md`](DESIGN-compiler.md) first.

**Every change here ends with the seed.** The compiler is built from `ksplc/seed.c`, so a change under `ksplc/` reaches the tools only after "Updating the seed" below.

## A diagnostic code (a `W`, `I` or `H` code)

1. **Emit it from sema** with its code at the head of the message: `c.warn(node, "[W0xxx] ...")`, `c.information(...)` or `c.hint(...)` (`ksplc/sema/session/ctx.kspl`; `[W0203]` in `ksplc/sema/body/stmt.kspl` is an example). Ask `c.is_code_off(node, code)` before costly work. An information or a hint prints only under `ksplc lint`.
2. **Register it** in `CODES` in [`../base/lint_codes.kspl`](../base/lint_codes.kspl), and raise the array's length. A code off by default also goes into `OFF_BY_DEFAULT`. Left out, `make test-conventions` fails with "every code the compiler writes is registered".
3. **Write its section**, `### [W0xxx] <title>`, in [`SPEC-diagnostics.md`](SPEC-diagnostics.md) under "2. The list of warnings (W)", "3. The list of information diagnostics (I)" or "4. The list of hints (H)". Left out, `make test-conventions` fails with "the diagnostic codes agree between the implementation and the spec".
4. **Add material that fires it.** Add a case in its subject's file under `ksplc/tests/lint/`, opened by `// ==== case <name>` ([`HOWTO-add-a-fixture.md`](HOWTO-add-a-fixture.md)). Give it a `// EXPECT: [W0xxx] ...` line. For a code off by default, add `// ARGS: --lint=W0xxx=on` too. Without one, `make test-conventions` fails with "every diagnostic code has material holding it"; `make test-lint` runs the material.
5. **Rebuild and check `ksplc explain`**: it prints the section from the `SPEC-diagnostics.md` built into the compiler, and `make test-cli` checks every registered code prints its own section.
6. **Run `make lint`.** A code on by default that fires on the repository's own sources fails it with `LINT FAILED`; fix those sources in the same change.

## An AST node kind

1. **Add the rule** to [`../kspl.kspeg`](../kspl.kspeg). A rule that opens, ends or keeps a block also joins the role lists in the grammar's header (`[opens]`, `[ends]`); `make test-notation` counts them.
2. **Add `k_<rule>`** to `Ast_kind` in [`../base/ast_kinds.kspl`](../base/ast_kinds.kspl), before `k_max`. A capitalised token rule also needs its case in `builtin_name`. Left out, stage1 stops at start-up with `Grammar sync error: Rule '<rule>' is defined in kspl.kspeg but missing from Ast_kind enum.`
3. **Give it one shape** in `normalize` (`ksplc/parse/normalize*.kspl`), then handle it in each stage that meets it. Why every layer can rely on one shape is "Keeping the grammar and the AST node kinds in step" in [`DESIGN-compiler.md`](DESIGN-compiler.md).
4. **Run `make test-conventions`**: "there is no remnant in Ast_kind" fails for a kind no grammar rule makes and no code tests.
5. **Update the seed before writing the new syntax anywhere** (below). `make fmt` runs the seed, so it refuses the syntax until then.

## A primitive type

1. **The grammar**: `Primitive_type` in [`../kspl.kspeg`](../kspl.kspeg).
2. **Sema**:
   * `Builtin_type_id` and the `register(...)` calls in `ksplc/sema/type/env.kspl`. `is_builtin` takes `f64_type` as its last id, so a new id past it moves that bound.
   * `is_integer`, `is_unsigned`, `is_float` and `get_primitive_bit_size` in `ksplc/sema/type/query.kspl`.
   * The literal suffixes in `ksplc/sema/body/literal.kspl` and `ksplc/sema/decl/eval.kspl`.
3. **The backends**: `prims` in `ksplc/gen/c/ctx.kspl`, `llvm_prim_name` in `ksplc/gen/llvm/types.kspl`, `c_scalar` in `ksplc/tools/interface.kspl`, and a `typedef` in `ksplc/gen/runtime/core.h`.
4. **The editor's colouring**: the primitive types' match in `.vscode/extensions/kspl/tmLanguage.json`. Left out, `make test-conventions` fails with "a keyword of ksplc's the grammar does not colour".
5. **The language specification**: the table in "3.1 Primitive types" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md). Nothing checks this row, so read it against the code once.
6. **Update the seed** (below): the grammar and the runtime are both built into the compiler.

## A subcommand

1. **`ksplc/main.kspl`**: a `Mode` variant, `p.subcommand("<name>", ...)` in `declare_options`, its branch in `read_mode`, and its case in `dispatch`.
2. **`ksplc/usage.kspl`**: a `Face` in `FACES` (raise the array's length), and the subcommand's name in the `flag_faces` row of each option it takes; one that lays values out also joins `MACHINE_FACES`.
3. **[`SPEC-tools.md`](SPEC-tools.md)**: a row in the table of commands and a section of its own. Left out, `make test-conventions` fails with "the CLI's entry points agree"; the only name let through is `UNDOCUMENTED_OK` in `tests/support/conventions_iface.kspl`.
4. **Run `make test-cli`**: `case_help_matches_behavior` tries every subcommand and option `--help` lists.
5. **Update the seed** (below).

## A target machine

1. **Add a row** to `MACHINES` in [`../base/target.kspl`](../base/target.kspl) and raise the array's length. Leave `llvm_triple` empty for a machine with 4-byte pointers: the LLVM backend lays out 8-byte pointers only.
2. **A machine ksplc can run on** must be named as `kspl_host_machine` builds the name, `KSPL_HOST_ARCH "-" KSPL_HOST_OS` in `ksplc/gen/runtime/hosted.c`; add an `#elif` there if needed. Left out, `make test-conventions` fails with "every hosted machine in the table is a name the runtime can build".
3. **Run `make test-layout-targets`**: it compiles a probe for every row and checks clang lays each value out the same. `UNLISTED_HOST` in `ksplc/tests/suite/layout_targets_test.kspl` must stay a machine with no row; move it if you add that one.
4. **Update the seed** (below): `hosted.c` is built into the compiler.

## Updating the seed

1. **Prove the stages reproduce each other**:

   ```sh
   make self-host            # last line: RESULT: ALL PASS (self-hosting, c backend)
   ```

   Where the change alters the C the compiler writes, this stays red until the seed is re-baked: run `make commit-seed`, then `make self-host` again. Still red, restore the seed with `git checkout ksplc/seed.c` and look for the cause.
2. **Re-bake it**:

   ```sh
   make commit-seed          # last line: Seed updated successfully.
   ```

3. **A new C runtime function that `std/` calls takes two re-bakes**: first without the call, then with it. "The bootstrap, and keeping the seed in step" in [`DESIGN-compiler.md`](DESIGN-compiler.md) gives the order. A changed signature cannot go this way; add the function under a new name.
4. **A language change that a suite or `make fmt` must use goes into the seed first**: both run the seed, so they know only what it knows.
5. **Run the gates**: `make ci` runs every one on Linux ([`docs/SPEC-gates.md`](../../docs/SPEC-gates.md)).
