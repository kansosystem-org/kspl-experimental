# Checks and diagnostics

The package-wide design and reading guide are in [DESIGN-compiler.md](DESIGN-compiler.md).

## The design rules for the checks and the diagnostics

This chapter holds the implementation's rules for the checks that produce diagnostics. Each rule stops a check that is written but does not work (Principle 5).

### A check of one kind lives in one place

**Put a verdict in one function, and have every caller look only at its return value.** If the same check is written twice, a fix reaches one copy and not the other. The cases easily missed:

* **When a `defer` body is analysed.** It runs when the scope is left (docs/DESIGN-programming-language.md "Why `defer` has no capture list"). Analysed in the state at registration, `b.free();` after `defer b.free()`, a double free, would pass. `df_stmt_block_scope` applies the registered bodies at the block's end, to the state on leaving, in reverse order of registration. **Every early exit applies them too, to its own state** (`df_check_defers_on_exit` in `sema/flow/stmt.kspl`):
  * `return`, `throw` and `!` apply the bodies of every enclosing block;
  * `break` and `continue` apply those inside the statement sema resolved the jump to (the jump's `def_node`);
  * `fallback` applies those inside its `catch`.

  Checked only at the block's end, `defer use(x)` followed by `if early { return; }` and `x = 4` would pass, and the early path would read `x` uninitialized.
* **Building the generics' registry.** A generic instance's `Struct_def` / `Enum_def` is assembled on its own path in `sema/decl/mono.kspl`. So the visibility check on fields and payloads goes there as well as in `sema/decl/collect.kspl`. Otherwise `pub struct W<|T|> { pub h: Hidden; }` leaks a `priv` type into another file.
* **The walk over the structural markers.** Deriving `Move_only` follows an `enum`'s payloads and an array's elements as well as a `struct`'s fields, in the one walk `derives_move_only` (`sema/type/arc.kspl`). Without them, a struct holding `H[2]` of owning handles can be copied silently.
* **Resolving an operator trait.** Unary and binary operators, `[]` reads and `[]=` writes all use the one `resolve_operator_call` in `sema/decl/trait_check.kspl`. Each caller handles all three `Op_method` cases (`user` / `builtin` / `failed`). A trait implemented with no method found by name is the compiler's own inconsistency, and must not fall back to the built-in path.
* **The operand an operator takes.** On the `builtin` path, `refuses_operator_operand` in `sema/body/binary.kspl` refuses a struct, a tagged union, an array, a trait value or a slice. Binary and unary operators and an array's compound assignment all ask it. So `%` on a struct, or `1 + v`, stops in ksplc, not in the C compiler.
* **The subscript's type.** `Index` / `Index_mut` / `Index_place` take it from the implementation's declaration, for reads and writes alike (`operator_index_param_id` in `sema/decl/trait_check.kspl`). Fixed at `Sz`, `m["k"]` on a `Map<|U8[], I32|>` would always fail. An instantiated method's parameter node can lack its `type_id`, so the type is resolved again in the declaring file's context.
* **`!` and `catch`.** `!` accepts a Result alone, and `catch` a Result or an Option (`sema/body/postfix.kspl`, and `infer_catch_chain` in `sema/body/expr.kspl`). Miss the check in one, and the C compiler fails with zero diagnostics from ksplc (Principle 2).

**`a[i]` on a type that implements `Index_place` is resolved before `Index` / `Index_mut`** (`infer_postfix_array` in `sema/body/postfix.kspl`, probing with `has_implemented_operator_trait`). `at` returns a pointer, but the node's `type_id` is the element type. `lower_postfix_index_operator` in `lower/expr.kspl` rebuilds the node as `a.at(i)$`. The `get` side returns a value via a temporary, so `a[i]@` there is refused.

* **Do not tell the two apart by the method's name.** Monomorphization renames `def_node`'s identifier (`std_ds_List_I32_at`). `Env.is_place_index_node` decides on the types instead: the target returns a pointer whose pointee is the node's `type_id`.
* A function declaration's name is a direct child of `k_decl_fn` after normalizing, but a `k_decl_fn_proto` can stand between (`get_attribute` takes the same detour).

**Decide "pointer or slice" before matching an explicit impl.** `has_implemented_trait_fqn` strips the pointer (`strip_ptr`) before consulting the impl table, so methods are found on a pointer receiver too. Matched first, an `H$@` would match as `H`, and copying a borrowed view would count as a move.

### Measuring what suppression costs

At receiver positions in `sema/flow/track.kspl` (a field access, a method call), one flag carries both the move verdict and the use-after-free verdict. It rightly carries the move verdict, since a receiver does not duplicate the value.

Caution: **Do not use this flag to suppress the use-after-free check as well.** Many types' `.free()` frees only an internal buffer, so other fields are legitimately read afterwards. But suppressing both leaves only the most harmless shape detected:

| The shape | Suppressed along with the receiver position |
| --- | --- |
| `p.free(); _x: = p.v;` (reading freed heap) | no diagnostic |
| `p.free(); p.v = 2;` (writing freed heap) | no diagnostic |
| `p.free(); p.get();` (a method call) | no diagnostic |
| `p.free(); _c: = p;` (a whole copy) | detected |

**Before adding a suppression, measure what it hides.** Without this one, the check reports two places in the whole code base, both a fragile order.

**A freeing is recognized in one place**: the method form (`x.free()` / `x.dealloc()`) and the function form (`dealloc(x)`), by `get_free_call_receiver` / `is_free_fn_path` in `sema/flow/release.kspl`. Copied out to each user, the verdict loses a form. To add a name for freeing, change `get_free_call_receiver` alone.

**Strip the wrapping.** `dealloc` takes a `Void$@`, so a real call nearly always carries a cast (`dealloc(Void$@::p)`). The `@` and the `::` are stripped recursively back to the original local.

**A pointer's `free()` leaves a block that `dealloc` can still name** (`p.free()` then `dealloc(Void$@::p)`, the rule in 8.4.5 of [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#845-tracking-a-free-with-manual_free)). `Df_state` keeps two may-sets:
* `freed_vars`, what is released, any use of which is refused;
* `gone_vars`, what has nothing left to give back.

`p.free()` on a pointer enters only the first. Every other release enters both, so a `free()` whose body gives back its receiver leaves nothing. Before a `dealloc` call is walked, `release_kept_block_if_any` takes its local out of `freed_vars` where it is not in `gone_vars`. **Only the cast is stripped there** (`get_dealloc_of_name`): `dealloc(p@)` gives back the variable's own address. Both sets merge as a union, so a local given back on one branch only is still refused.

### A diagnostic points at 'the position the user wrote'

**An error is reported at the line in your code that caused it, in the names you wrote.** It is never reported inside the standard library, or in the compiler's internal names. So a violated generic bound points at the instantiation the user wrote, not at the template's constraint. A beginner reads a position inside the standard library as "the error is in the standard library".

1. **A diagnostic takes its source from the node** (`file_for_node` / `source_for_node`).
   * Caution: During monomorphization the current file is the template's. A diagnostic taking "the current file" prints the template's file, line and caret. This holds for every node of another file, not only for generics.
2. **The position that caused the instantiation is recorded in `Generic_state.inst_site`.** The constraint check runs partway through the monomorphization, on the template's constraint node. Only the three entry points set it: a generic function's call, a generic type in a type expression, and a generic path inside an expression.

**It is not passed as an argument**, which would ripple through four stages; `Generic_state` already holds the current binding. Every entry point saves and restores it, since instantiations nest. Where it is `null`, the report falls back to the template's position.

**The spelling is the user's too.** `display_str` in `sema/type/display.kspl` is the only way a type is shown to a person. Build no second one showing the internal name.

| The user wrote | Shown as | Not shown as |
| :-- | :-- | :-- |
| `I32?` | `I32?` | `Option_I32` |
| a function the compiler synthesized | as the source calls it | `_anon_fn_1` |
| an environment the compiler synthesized | reworded in a note | `_anon_env_1` |
| `Names` from `typedef Names = List<\|U8[]\|>;` | `Names` | `List<\|U8[]\|>` |

An alias is shown by its own name, unresolved: resolving it would name a type the line does not spell.

### No diagnostic that depends on a generic's type argument

**Inside a generic function's body, advice whose verdict changes with the type argument is not given at all.** The worked examples are [I0301]'s unnecessary `::` cast and [I0307]'s empty block.

```kspl
fn blas_gemm<|T|>(...)
    if sizeof(T) == 4
        cblas_sgemm(..., F32$@::(a), ...)
    else
        cblas_dgemm(..., F64$@::(a), ...)
```

In the `T=F32` instance, `F32$@::(a)` is an identity cast, so [I0301] fires. In the `T=F64` instance it is a real conversion. Likewise, the folded `if sizeof(T) == 4` looks like [I0307] in one instance. **It is advice that stops the code compiling if followed**.

**The line is soundness.** These two are not reported while `Sema_ctx.is_instantiating()` is true. That covers resolving the type arguments (`inst_site`) and analysing the body from the pending queue (`in_generic_instance`). Only the latter catches a diagnostic inside the body.

**A missed finding is the cost accepted.** Reporting what is redundant in every instance would need machinery to pool diagnostics across instances. No advice is safer than wrong advice.

**The import an extension method requires is a third case, and an error rather than advice.** That rule is "A file using an extension method imports its defining file" in [`DESIGN-compiler.md`](DESIGN-compiler.md). Inside the body the receiver can be the type argument's. A generic cannot import every file that serves its bound: `put<|W, T: Formattable|>` in `std/lang` reaches each type's `fmt` wherever its `impl` stands. The ledger is still asked, so a hit marks the template file's import used for [I0401].

### An error in a generic's body names its instantiation

**A generic's body is checked once per instantiation, so an error there can come from the caller's type argument.** So the error carries one Note per instantiation it stands in, innermost first, up to the caller's own line (`instance_notes` in `sema/session/ctx.kspl`). Each Note names the instance and the line that asked for it (`in 'app.smaller<|app.Pt|>', instantiated at app.kspl:8:12`).

* **The first to ask is named.** A body is queued once (`queue_fn_body`). Its record keeps what asked for it and which body was being analysed then (`Pending_inst.site` / `from`).
* **Once per error.** An error in a body is reported once whichever instance finds it ("error in an instance" in `report_core`), so the Notes are the first instance's.
* **A closure's body names no instance of its own**: the function that writes the closure stands for it.
* **At most `max_instance_notes` levels.** A longer chain shows its inner end and says more stand above it.

### The declaration decides whether a call uses a function pointer

**`f()` can call a named function, or be an indirect call through a function-pointer value. The declaration the callee resolves to decides which, not the callee's type.**

**The reason**: a named function's symbol holds its return type in `type_id`. Given `pub typedef Cb = fn(): I32;`, a `fn cb(): Cb` looks by type exactly like a function-pointer callee. Judged by type, `f: Cb = cb();` fails, and `f: = cb();` becomes invalid C with zero diagnostics. A call taken for an indirect one also skips the argument check.

**For the same reason, a function passed as a value does not simply take the expected type.** Otherwise a `fn(x: I32): Void` goes into a `fn(x: I32): Bool` field with zero diagnostics. Only clang's `-Wincompatible-function-pointer-types` catches it, against "Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md).

**With no expected type (`f: = big;`), the binding takes the function type of the function the name names.** It is read off the declaration (`own_type_of_name` in `sema/decl/name.kspl`), which `infer_var_decl` in `sema/body/stmt.kspl` asks. A variadic function has no function type, and its binding is rejected in one place (`check_fn_value_binding` in `sema/body/stmt_escape.kspl`). The type is then made `Unknown`, so one error does not repeat at every use.

Caution: **Decide by the mark a function's name carries, not by the declaration the node resolved to.** A call's result, `x: = f(1);`, resolves to the same declaration. Only a name standing for a function carries `generic_fn_value_type_id`. The regression is the case `fn_value_variadic_binding` in `tests/negative/fn.kspl`, with `tests/fn_value_test.kspl` for the passing side.

**How it is checked**: the canonical string `fn(T1,T2):Ret` is rebuilt from the declaration and compared (`sema/decl/resolve.fn_signature_type_id`). Build both strings with that one function, or they drift and the check dies. The relaxation to `Void$@`, the opaque marker of a generic call, and variadic arguments still pass, so FFI hand-overs stay writable.

**A call through a function value reads its signature off the value's type** (`fn_type` in `Info`, whose `Fn_sig` holds the types, registered by `get_or_add` in `sema/type/env.kspl`). So `fn_sig_of` reaches it wherever the value came from (`infer_value_call_args` in `sema/body/call_args.kspl`). A named function's call is matched against its declaration, which holds the defaults.

Caution: **Do not take the signature from the declaration the callee's node carries.** Read that way, `pick()(21)` is a call of `pick`, and a generic's field has no declaration at all. Whether a name calls a function is judged in one place, `resolves_to_named_fn` in `sema/body/call.kspl`, which the LLVM backend asks too.

**A composite of a function type brackets it**, in the canonical string and in diagnostics (`(fn():I32)@`). Unbracketed, a pointer to `fn():I32` and a function returning `I32@` would share one id.

#### A generic call's arguments are checked after instantiation

**A generic call's arguments can be checked only once `T` is known, so the check runs right after the instantiation** (`check_args_against_instance`). Before it, the arguments are inferred with their expected types `unknown` (the `if is_generic_call` in `infer_call_args` in `sema/body/call.kspl`).

**Check every argument, not only the trait upcasts.** Otherwise `take<|I32|>(1, "wrong")` passes with zero diagnostics, and the generated C fails. `apply_type_coercion` judges which differences can pass: a numeric widening, an upcast to a trait, a wrap in a Result. It reports the rest, as on the non-generic path.

Caution: **A difference in write permission does not show in the generated C.** genc puts no `const` on an immutable local binding. So a `T@` passed where a `T$@` is expected escapes the C compiler too.

**An argument that passes a function's name is inferred again instead.** It carries `generic_fn_value_type_id` up to here, which means nothing to compare. Inferred again against the parameter's type, its signature is checked as anywhere else. **The inference before the instantiation reads the function type off the declaration the name resolved to** (`own_type_of_name` in `sema/decl/name.kspl`). So `pass(same<|I32|>)` binds `F` to `fn(I32):I32`. A variadic function keeps the mark, and `refuses_fn_name_binding` in `sema/body/call.kspl` reports it.

**Walk the parameters by one rule.** The check runs at the call and after the instantiation, and both walk the parameters with `Param_cursor`. The regression is the case `generic_call_arg_types` in `tests/negative/generic.kspl`.

#### A generic call's type arguments come from its arguments' structure

**Each parameter's written type is walked against its argument's type id** (`bind_type` in `sema/body/generic_infer.kspl`):
* a postfix peels a pointer, an array or a result off the argument;
* a generic's `<|…|>` is matched position by position against the argument's instance record (or the instance of that generic trait it conforms to);
* a function type is matched part by part.

A type parameter binds where it stands bare, with the found type's immutability. So a `T$@` given an immutable place's address makes the instance refuse the write. The generic's name is read with `read_written_type` in the declaring file, so an alias names the same template.

Caution: **Do not match by spelling.** A spelling does not show where a nested list starts (`Hold<|T|>[]` is `Slice<|Hold<|T|>|>`), and two spellings can name one type.

Caution: **Do not fill a slot no argument bound.** A stand-in type builds an instance whose checks report mismatches the user never wrote. Left out, the parameter's name reaches the C raw. `refuse_unbound` reports it at the call instead.

**A function's name binds last.** Where the other arguments fixed its parameter's type, it is checked against that type after the instantiation. It binds only what they left open.

#### An instantiated generic trait registers its methods by name

**Method resolution (`infer_dot_access` in `sema/body/dot.kspl`) gives the call node the found symbol's `type_id`.** A trait's methods are not in the type table's `methods`, so the name table is the only source of this type. `build_trait_registry` in `sema/decl/registry.kspl` registers a non-generic trait's methods. **An instantiated generic trait registers them the same way** (`declare_inst_trait_method` in `sema/decl/mono.kspl`). Unregistered, the "not found" path lets the call through with its type `Unknown`.

**No diagnostic comes out.** The generated C calls a slot not in the vtable, and LLVM gets no register for the return value. A position with an expected type hides the fault, so it shows only as, say, a comparison's operand. The regression is `traitret=` in `tests/prog/equiv.kspl`.

Caution: **Set the back link from the declaration node to the symbol (`sym_ptr`) as well**, as `define_symbol` in `sema/type/scope.kspl` does. `sema/body/call.kspl` takes a declaration without `sym_ptr` as a generic method's template. The output then calls a slot `call_<type argument>` that is not in the vtable.

A `priv` method is registered too. The caller checks visibility (`check_visibility_and_mark_used`), so hiding it here would drop only its return type.

#### A call's missing defaults are filled by copies

**When a call leaves out defaulted arguments, Sema adds copies of the defaults to the call.** The backends see it written out in full ([8.1.1 of `../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#811-default-arguments)). **A call can be short only by the run of defaulted parameters at the tail.** `fill_default_args` in `sema/body/call_defaults.kspl` appends the defaults to the `k_expr_args`.

* **Append a copy.** One node attached to several calls leaks the `type_id` one analysis writes into the others.
* Caution: **Do not add the `,`**: Genc emits the separators itself (`emit_comma_separated_args` in `gen/c/expr.kspl`).
* Once filled, the counts agree, so a body copied by instantiation is not refilled.

Caution: **Do not drop the `=` inside a parameter.** A default value is read as the child after the `=` (`get_param_default` in `base/ast_ext.kspl`), since some parameters write no type. `is_trivia_node` in `parse/normalize.kspl` treats `fn_param` like `expr_field_init` and keeps the `=`.

**The rejections sit in four places, which cannot be gathered into one**:

| What is rejected | Where |
| :-- | :-- |
| not at the tail, not a literal, a type containing a type argument | `report_bad_param_defaults` in `sema/decl/type_check.kspl` (at the declaration, so it does not repeat per instance) |
| a trait's methods (declaration and implementation) | `sema/decl/trait_check.kspl` |
| an `extern` function | `sema/decl/collect.kspl` |
| a closure's parameters and captures | `reject_param_defaults` in `parse/desugar_closure.kspl`. **Sema is too late**: once lifted they look like an ordinary function's parameters |

### The pass/fail verdict is checked apart from each diagnostic

**It is not enough that each diagnostic fires.** The step that turns findings into a failed build, the Makefile's `lint` target, needs a check of its own.

**`make lint` analyses entry points, and code unreachable from them is not analysed.** A generic is analysed only once instantiated. So code instantiated only from `tests/debug/main.kspl` escapes unless that file is an entry point. It is one, because it holds `fn main`: `LINT_TARGETS` in `mk/lint.mk` takes every such source. `make test-lint-gate` checks that one information diagnostic makes `make lint` exit non-zero.

**A severity and a CI policy are different things**: Hint does not stop the user's build, but findings left standing bury each new one. So the gate requires zero at Hint and above.

**A skip is reported**, never passed silently (the caution under "The shape of a per-item pass/fail line" in [`docs/SPEC-gates.md`](../../docs/SPEC-gates.md)).

**A reproduction test is added only after it is seen to fail on the broken code.** One never seen failing checks nothing.

### A type check covers every declared type

**`check_infinite_size_types` in `sema/decl/layout.kspl` refuses a struct that contains itself. It measures every declared `struct` / `enum`, used or not.** Narrowed to the types whose size was needed, a type named only by a local, a parameter or a field slips through. The user then gets the C compiler's incomplete-type error ("Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md)).

Caution: **Call this check inside Sema.** Later, `ksplc lint` would never report it. A cyclic type would first hit one of Lower's depth ceilings, whose cut-off has no position.

**This sweep does not report a too-deep but non-cyclic chain.** The layer that needs the size or the code refuses it. Reported here first, the later ceilings (`MAX_ARC_EMIT_DEPTH` in `lower/arc.kspl` and the like) would never be hit.

**Three walks follow a value's parts**, at the owning positions of the chapter "The rules for implementing ARC" in [`DESIGN-lower.md`](DESIGN-lower.md). They are the size in `sema/decl/layout.kspl`, and the ARC contents and the structural markers in `sema/type/arc.kspl`. They run in no guaranteed order, so each cuts cycles itself.

### Generic checks tell written type arguments from inferred ones

**Written type arguments (`f<|I32|>()`) must match the declaration's count; inferred ones are not counted.** `check_written_generic_arity` in `sema/decl/mono.kspl` holds the verdict and its wording for both callers: `sema/decl/resolve.kspl` for type expressions and `sema/body/call.kspl` for calls. Surplus ones would bind to nothing (Principle 5). Missing ones leave type variables in the generated C (`unknown type name 'U'`). A generic's type written with no type argument (`x: W;`) is refused for the same reason.

**A list inferred from the arguments cannot differ in count.** The inference (`inferred_type_args` in `sema/body/generic_infer.kspl`) keeps one slot per declared parameter, and refuses the call while a slot is empty.

### The static-initializer check is applied to both `var` and `const`

**A global's starting value must be computable before the program runs, for `var` and `const` alike**: both become file-scope initializers in the generated C. **Sema decides each top-level initializer once, and Lower and both backends follow that decision** (`check_static_initializer` in `sema/body/static_init.kspl`). Each part of an initializer falls into one of three classes:

| Class | What it is | What the later stages do |
| :-- | :-- | :-- |
| A folded value | A node whose type is an integer, `Bool`, character, scalar enum or float, and which folds | Both backends write the value recorded in `Static_state.values`. Lower leaves the node alone |
| A shape | A compound literal, a string, `null`, a function, a variant or a trait value. A fixed address, a slice over an array, a pointer cast and a constant of a shape count too | Each backend writes it as it stands. A conditional with a folded condition is the branch it picks (`Static_state.picks`), which Lower puts in its place |
| Refused | Anything else | ksplc reports it with its own message |

**No later stage decides again.** A second copy of the rule in Lower or a backend would disagree, and stop the C compiler or LLVM with zero diagnostics (Principle 2). So a shape is in the table only when both backends write it; anything else reaching a backend is an ICE.

**What is refused, and why:**

* **A run-time computation** (a call, a dereference, a variable's value) reports `top-level variable initializer is not a compile-time constant`.
* **A read of a part of another value** (an element, a field, a slice's `.len`) has its own message, even from a `const`. C99 has no constant expression that reads one.
* **An address reached through a pointer or a computed index** reports that only a fixed address can be taken. `is_static_place` decides which addresses are fixed, and genllvm's constant `getelementptr` writes exactly those.
* **Any other scalar that does not fold**, such as a comparison of two addresses, reports that it cannot stand there.

Caution: **Folding where a constant is used does not cover this.** A `pub const X: I32 = f();` that nothing uses is never folded there. Only this check sees it.

**Follow a constant's references**, or the cycle `const A = B; const B = A;` slips through. **The value check sits here for the same reason** (`fold_static`): an overflow or a division by zero is reported, used or not.

**Fold quietly first, then report by folding again.** The quiet fold tells "not a constant" from an overflow. Only an overflow, a division by zero or a cut chain is folded again loudly, so one reporting point names the failing step.

**Width and signedness come from the operands' type.** `I8::127 + I8::1` overflows as `I8` even where it would fit an `I64` (`fit_or_report`).

**Each constant is folded once, and its value is kept** (`Static_state.ints` and `.floats`), or `const C2 = C1 + C1` chains cost 2^n. A kept value carries its fold's depth, so the limit cuts the same chains. **A value is kept only for one typing state** (`Static_state.epoch`).

Note: **An unsigned wrap is not an overflow**: `U8::255 + U8::1` is 0, `mod 2^8`, as docs/SPEC-programming-language.md §6.8 says.

### Each depth limit is set by what breaks first

**ksplc has several depth limits, and each guards against a different breakdown.** So each keeps its own value: do not borrow one limit's value or owner for another.

| The ceiling | What it guards | How it breaks down |
| :-- | :-- | :-- |
| KSPEG's parse depth (`kspeg/rule.kspl`) | the parser's own native stack | a crash on a deep expression |
| the AST's copying / validation / walking (`base/ast.kspl`) | each walk's recursion | the same |
| the type chain, the alias chain, the layout, the monomorphization | each layer's mutual recursion | the same |
| the method table's chain (`MAX_METHOD_CHAIN_DEPTH` in `sema/decl/mono_queue.kspl`) | **the instantiation queue** | it never returns, with no diagnostic |
| the constant folding (`MAX_CONSTEXPR_DEPTH` in `sema/decl/eval.kspl`) | the folding's recursion and the translation time | a crash, or no return, at the declaration count × the depth |
| block nesting (`MAX_BLOCK_NESTING` in `sema/body/stmt.kspl`) | **the C backend's output** | the generated C exceeds the C compiler's bracket-depth limit |
| the zero initializer's braces (`MAX_ZERO_INIT_BRACES` in `gen/c/ctx.kspl`) | **the C backend's output** | the same |

**The method table's limit cannot be replaced by call depth.** The instantiation queue (`Mono_state.pending_methods`) resets `mono_depth` per item, while a chain of methods returning a deeper self advances ("Where the instantiation queue is drained" in [`DESIGN-sema.md`](DESIGN-sema.md)). **Do not set it to `MAX_MONO_DEPTH`** (128): each level builds a whole method table, so at 128 a runaway looks like a hang.

**The folding's limit cannot be replaced by the AST's depth.** A constant's references dive across declarations (`eval_ident_or_path`), deeper than one parsed expression.

**Return the cut-off apart from `not_constant`** (`Sema_error.nesting_too_deep`). Otherwise the quiet entry point (`eval_constexpr_quiet`) swallows it as "not a constant", and the user sees another diagnostic. Kept apart, the re-folding in `fold_static` (`sema/body/static_init.kspl`) reports the depth.

**A chain cut at the limit is one error, reported at the head of the fold that met it** (`report_cut_chain` in `sema/decl/eval.kspl`), as "Implementation limits" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md) asks. Each constant down the chain is checked on its own, so the constants a reported cut went through are kept (`Resolving_state.cut_reported`). An array length taken from a cut chain names the depth too.

**A refused typedef (too deep, circular) is the unknown type** (`resolve_written_type` in `sema/decl/resolve.kspl`). As a type of its own, each use added a mismatch that hid the refusal. An alias whose chain ends in a refused one is refused with no second error.

**Raising the folding's limit lengthens translation on a pathological input**, up to the declaration count × the limit. The floating-point fold (`MAX_FLOAT_FOLD_DEPTH` in `sema/decl/fold_float.kspl`) reaches as deep as the integer one.

**The bottom two exist for the C compiler.** Past them the generated C stops with `bracket nesting level exceeded` (clang's `-fbracket-depth` defaults to 256). The values sit well below 256: C's depth also counts parentheses, and MSVC and others have other limits. Block depth is read off the scope stack (`symtab.scope_stack.len`), which grows by one per block.

**A zero initializer's brace pairs are not one per type level**, nor can one `{0}` stand for them ("Genc (C99): the topological output order" in [`DESIGN-backends.md`](DESIGN-backends.md)). Each array level takes two (`zero_init_depth`). Set the limit above twice the guaranteed postfix depth. The diagnostic names the guaranteed depth, not the doubled value.

### Name resolution with no namespace goes through one function

**A name brought in by a selective import (`import "p" { A }`) becomes an FQN through one function, `Sema_ctx.imported_symbol_fqn`.** So imported types, functions and constants all work the same. Two readers resolve names, both in `sema/decl/name.kspl`:
* a written type's (`read_written_type`, "A written type's name is read once, from its tree");
* a written value's or function's (`read_written_name`, "Value and function names are read once, from their tree").

If each read the import table itself, a kind one forgot would pass the `import` line and fail at the use (Principle 5).

The lookup order for a bare name:

| Order | Where it looks |
| :-- | :-- |
| 1 | locals and generic type arguments (scopes inside the file) |
| 2 | the selective imports (`imported_symbol_fqn`) |
| 3 | any same name outside the file |

Caution: **Consult it before any same name outside the file.** Inside one file, a declaration and a selective import never share a name: `add_import_symbol` and `declare_symbol` make each a redefinition of the other. Consulted later, another file's declaration of the name wins instead.

**But consult it after locals and generic type arguments**, which are scopes inside the file.

**No generic or typedef is among the same names outside the file.** A template is keyed by its FQN alone (`register_template` in `sema/decl/declare.kspl`), and so is a typedef (`resolve_alias_sym` in `sema/decl/resolve.kspl`). Otherwise another file's `priv struct Box<|T|>` would answer this file's `Box`. A name reaches a template only through `read_written_type` or `read_written_name`.

**A name another file declares, written without the alias that reaches it, is told in one wording** (`report_without_alias` in `sema/decl/name.kspl`): `missing import alias prefix. 'twice' is declared in 'p'. This file imports it as '_m'. Write '_m.twice'`. This holds for every kind of name, and for one found under an FQN written out (`by_fqn`). The question goes to this file's import aliases (`alias_reaching`), so another file's `priv` name stays undefined.

Caution: **Do not ask the type table whether another file declares a short name.** Its short keys are whatever spelling registered first, so the answer would change with the order files are read in.

**A selector's existence is checked at the `import` line** (`check_import_symbols` in `sema/decl/access.kspl`, which also binds the name to its declaration as a use). Checked at the use, a typo would make the `import` line look as if it works.

#### A written type's name is read once, from its tree

**Every route to a type the source names reads the name with `read_written_type` in `sema/decl/name.kspl`.** Among them are a type position (`resolve_type`), an impl's target, and `bind_path` in `sema/body/generic_infer.kspl`. It reads the path's segments from the tree, not its spelling:

| it reads | as |
| :-- | :-- |
| the head | through this file: `Self`, a type parameter, a selective import under its own name or another, this file's own declaration (`resolve_fqn_for_type`) |
| the segment after an import alias | that file's name (`m.Box`) |
| the `<\|…\|>` right after the type's name | the type's arguments, from which `instance_written` makes the instance |
| a name after the type's | a member |

**Type arguments after a type that declares none bind nothing**, and `refuse_type_args_on_plain_type` in `sema/decl/type_check.kspl` refuses them where they are written. The type check and `infer_namespace_access` ask it.

**What the written type is, it answers only when asked** (`type_kind_of`). Working it out on every read would mark the names it passes through as used.

Caution: **Do not read a written name from its spelling** (the text cut at `<|` or split at `.`). The spelling cannot tell where a type's arguments end and a method's begin (`Holder<|I32|>.gm<|U8|>`). A callee's own `<|…|>` is told from its type's by `named_fn`, beside the reader.

#### Value and function names are read once, from their tree

**Every route to a value or a function the source names reads the name with `read_written_name` in `sema/decl/name.kspl`.** Among them are `infer_path_expr` in `sema/body/resolve_path.kspl`, a callee, a folded constant, and `enforce_mutability`.

The reader returns a record (`Written_name`): the symbol it names, the generic template with the instance it is reached through (`Fn_instance`), and how the name was reached. A function name's type is read off the declaration found (`own_type_of_name`).

| it reads | as |
| :-- | :-- |
| a member of a type the `.` already read (`Box<\|I64\|>.mk`, `Ints.get`, `Self.get`) | that type's generic method's template, or the instance's own method (`instance_method`) |
| a bare name | this file's scopes, its own declarations, then a selective import ("Name resolution with no namespace goes through one function"). A generic function's template is read only where the name names a function, so a local hides one |
| a path's head that is an import alias, or a type a selective import brought in | the rest within that file, the head under its original name (`read_name_in_file`) |
| any other path | this file's own `Type.member`, then a member reached through the type it begins with (`member_through_type`) |
| a `<\|…\|>` | by where it stands (`named_fn`): after the last name, the function's own; after the name before it, its type's |

**What the name is not, it answers too**:
* a head the aliased file does not hold (`absent`, so no later stage waits for it);
* a generic type's instance written whole (`instance_type`, a type and not a value);
* a declaration of another file, found under its FQN written out through no import of this one (`by_fqn`).

Caution: **Do not look a name up by its segments in a route of its own.** A route that cut the path otherwise would answer otherwise. A typedef's method (`P.mk` after `typedef P = m.Plain`) would be refused at a call while its value passes. A write to `m.total` would check a binding `m` instead of the global `total`.

### An alias prefix checks only that the next name exists

**For a qualified name `mod.Name`, only `Sema_ctx.file_has_type` decides whether `Name` exists in the file `mod` names.** It looks the name up with its qualification, at type positions (`read_written_type` in `sema/decl/name.kspl`) and value positions (`read_name_in_file`, beside it).

Caution: **Do not consult it with the qualification stripped.** A short name answers for this file's names, not the aliased file's. A phantom type such as `io.List<|I32|>` then fails far away at the use. At a value position any alias prefix would pass.

**Do not exempt every path that carries type arguments either.** The `method` of `mod.Type<|T|>.method` is not in the table until monomorphization, so only the leading segment (the type's name) is checked.

**Whether this file can see `mod.Name` is asked where it is written** (`check_and_report_type` in `sema/decl/type_check.kspl`), as no `import` line names it. `written_type_symbol` answers with every declaration of the aliased file, `priv` ones too. So a `priv` one is refused as unseeable, not passed as an unknown name.

**What `mod.Name` names is asked of its declaration too.** `file_has_type` answers for a function's or a variable's name as well. So at a type position `type_kind_of` asks `value_at` whether the FQN names a value (`m.gf<|U16|>` is "a function, not a type").

**A method reached through an instance is that instance's** (`Box<|I64|>.mk`, `Ints.get` after `typedef Ints = Box<|I64|>`, `Self.get` in `impl Box<|I64|>`). `infer_namespace_access` in `sema/body/dot.kspl` records the instance on the path's owner. `instance_method` in `sema/decl/name.kspl` takes the method from the instance's own table. **The instance is read from the path's tree** (`m.Box`), never from its last segment, which could find another file's `Box`.

### Explanations come from the specification, and only codes have one

**`ksplc explain <code>` prints that code's section of [`SPEC-diagnostics.md`](SPEC-diagnostics.md), compiled into ksplc** (`ksplc/tools/explain.kspl`). An edit to the specification reaches the command on the next build, with no second copy (Principle 6). `ksplc/base/lint_codes.kspl` says which codes exist: an unregistered code is rejected before the text is searched.

**`ksplc explain` with no code lists the codes, from the specification's section headings**, so a code given a section is listed with no other edit. The codes off by default are marked.

**A code's start does not narrow the list; it is refused as an unknown code.** A search of the list's output already filters it (Principle 6), and a mistyped code must give an error.

**Only a warning, an information or a hint has an explanation, because only they carry a code** ("An error has no number" in [`SPEC-tools.md`](SPEC-tools.md)). So an error's message itself says what went wrong and what to write instead.

**The closing summary names the command and each code that came out, once** (`Diagnostic_counts.codes`, kept by `report_core`). A text nobody is told about goes unread. A clean run names no code, and the lint gate reads only the count line above it.

**The terminal view puts the explanation before its references.** Parentheses holding document links are omitted, links show their labels, and bold and heading marks go. Prose wraps to 88 bytes; code blocks keep their text. The final line names the source document.

**It is written for a model as much as for a person**: an agent asks for one section, and no pager is used.

**Two gates hold it.** `make test-conventions` checks that every registered code has a section and every section a code (`tests/support/conventions_match.kspl`). `make test-cli` checks that each section prints alone (`case_explain` in `tests/suite/cli_test.kspl`).

**What is given up**: the executable carries the whole specification, and an edit to it rebuilds ksplc (it is in `KSPL_SRCS`). **The seed is not re-baked for an edit to the document alone**: only the seed's own binary keeps the older text, and nothing asks it.

### A line about the run goes to standard error

**Every line ksplc writes about its own run goes to standard error. Standard output holds only what the command was asked for**:
* a program's own output under `ksplc run`;
* `info`'s answer, `fmt`'s text, `doc`'s Markdown, `explain`'s text, `--help`'s usage.

The rule and its list are in [§2.3 of `SPEC-tools.md`](SPEC-tools.md#23-the-other-compiler-options).

* **A status line describes the run, not its product**: the summary, the closing line, `--stats`'s report, the folder `clean` emptied. `ksplc run script.kspl > out.txt` must not leave the compiler's lines in `out.txt`.
* **The summary stays on the diagnostics' stream**, so the count comes under the lines it counts.
* **Under `--diagnostic-format=json`, standard error stays a stream of objects**: the summary and the closing line become one closing object (the next section).

Caution: **A reader taking the count from the text matches the head of the line (`Finished with `).** A message can say `error(s)` too.

### Diagnostics for a program are one JSON object per line

**For tools and AI agents, `--diagnostic-format=json` writes each diagnostic as one line of JSON as it is found** ([§2.11 of `SPEC-tools.md`](SPEC-tools.md#211-diagnostics-a-program-reads---diagnostic-format)). An agent reads the code, the place and the message as fields, not from prose a reworded message breaks.

* **A line per diagnostic, not one document at the end**, so a compile that dies midway leaves every earlier line readable.
* **One writer for both forms**: `print_diagnostic` in `base/diag.kspl` (and `print_unplaced`, for an error with no place) passes one place to the text or the JSON.
* **The place is the file as written**: the line and columns as written, not a byte offset into the text with braces put in.
* **The code leaves the message**, so a reader of JSON does not cut it out again.
* **The run ends with a closing object**: `result`, and a count per severity (`print_json_closing` in `base/diag.kspl`). A key no diagnostic has tells it apart, so a reader need not skip a fake diagnostic.
  * **Its counts are of the objects written**, not the analysis's tally, which misses an error the parse stopped on.
  * **Only a run that reaches its verdict writes it.** A stream with no closing object ended early. `--stats` is refused beside json, since its report is text on standard error.
* **A syntax error says so in a key of its own** (`kind`), since an error carries no code. Nothing after it was analysed, so no other finding will come until it is fixed. A code family for syntax errors would let `off` silence one.

**What is given up**: SARIF is not written; a converter reading these lines can make it. Nor is there a `rendered` field holding the text form: the text is one flag away.
