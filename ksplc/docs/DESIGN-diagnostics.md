# Checks and diagnostics

The package-wide design and reading guide are in [DESIGN-compiler.md](DESIGN-compiler.md).

## The design rules for the checks and the diagnostics

A *diagnostic* is a message the compiler prints about your code (an error, a warning, a hint). This chapter holds the rules for writing the checks that produce them, so that a check really fires when it must. The language's reasons are in [`docs/DESIGN-principles.md`](../../docs/DESIGN-principles.md). This chapter holds **the implementation's rules**, and each stops a check that is written but does not work (Principle 5).

| Section | The rule in one line |
| :-- | :-- |
| "A check of one kind lives in one place" | one check lives in one function |
| "Measuring what suppression costs" | measure what a suppression hides before adding it |
| "A diagnostic points at 'the position the user wrote'" | a diagnostic points at the code the user wrote |
| "No diagnostic that depends on a generic's type argument" | no advice that depends on a generic's type argument |
| "An error in a generic's body names its instantiation" | an error in a generic's body names each instantiation up to the caller's line |
| "The declaration decides whether a call uses a function pointer" | whether a call goes through a function pointer comes from the declaration |
| "The pass/fail verdict is checked apart from each diagnostic" | the gate that turns diagnostics into pass/fail is itself checked |
| "A type check covers every declared type" | a type check covers every declared type |
| "Generic checks tell written type arguments from inferred ones" | a written type argument and an inferred one are checked differently |
| "The static-initializer check is applied to both `var` and `const`" | `var` and `const` get the same static-initializer check |
| "Each depth limit is set by what breaks first" | each depth limit has its own value and owner |
| "Name resolution with no namespace goes through one function" | names from a selective import go through one function, a written type's name through one reader, and a value's or function's through another |
| "An alias prefix checks only that the next name exists" | `mod.Name` is checked with its qualification |
| "Explanations come from the specification, and only codes have one" | `ksplc explain` prints the specification itself |
| "A line about the run goes to standard error" | standard output holds only what the command was asked for |
| "Diagnostics for a program are one JSON object per line" | `--diagnostic-format=json` writes one JSON object per line, and a closing one |

### A check of one kind lives in one place

**Put a verdict in one function, and have every caller look only at its return value.** If the same check is written twice, a fix reaches one copy and not the other. The cases easily missed:

* **When a `defer` body is analysed.** It runs when the scope is left (docs/DESIGN-programming-language.md "Why `defer` has no capture list"). If `sema/flow/track.kspl` analysed it in the state at registration, `b.free();` after `defer b.free()`, a double free, would pass with zero diagnostics. `df_stmt_block_scope` applies the registered bodies at the block's end, to the state on leaving, in reverse order of registration (LIFO, the order they run in). **Every early exit applies them too, to its own state** (`df_check_defers_on_exit` in `sema/flow/stmt.kspl`):
  * `return`, `throw` and `!` apply the bodies of every enclosing block;
  * `break` and `continue` apply those inside the statement sema resolved the jump to (the jump's `def_node`);
  * `fallback` applies those inside its `catch`.

  Checked only at the block's end, `defer use(x)` followed by `if early { return; }` and `x = 4` would pass. The early path would then read `x` uninitialized.
* **Building the generics' registry.** A generic instance's `Struct_def` / `Enum_def` is assembled on its own path in `sema/decl/mono.kspl`. So the visibility check on struct fields and enum payloads goes there as well as in `sema/decl/collect.kspl`. In the latter alone, generics pass, and `pub struct W<|T|> { pub h: Hidden; }` leaks a `priv` type into another file.
* **The walk over the structural markers.** Deriving `Move_only` follows an `enum`'s payloads and an array's elements as well as a `struct`'s fields, in the one walk `derives_move_only` (`sema/type/arc.kspl`). Without them, a struct that holds an array of owning handles (`H[2]`) can be copied silently.
* **Resolving an operator trait.** Unary and binary operators, `[]` reads and `[]=` writes all use the one `resolve_operator_call` in `sema/decl/trait_check.kspl`. Each caller handles all three `Op_method` cases (`user` / `builtin` / `failed`). A trait implemented with no method found by name is the compiler's own inconsistency. Silently taking the built-in path would ignore the user's implementation.
* **The operand an operator takes.** On the `builtin` path, `refuses_operator_operand` in `sema/body/binary.kspl` refuses a struct, a tagged union, an array, a trait value or a slice. The binary operator asks it for each side, and the unary operator and an array's compound assignment ask it too. So an operator with no trait (`%`, `~`, `&&`) and a struct on the right (`1 + v`) stop in ksplc, not in the C compiler.
* **The subscript's type.** `Index` / `Index_mut` / `Index_place` take it from the implementation's declaration, for reads and writes alike (`operator_index_param_id` in `sema/decl/trait_check.kspl`). Fixed at `Sz`, `m["k"]` on a `Map<|U8[], I32|>` would always fail with "expected 'Sz'". An instantiated method's parameter node can lack its `type_id` even after the names are substituted. So the type is resolved again in the declaring file's context.
* **`!` and `catch`.** `!` accepts a Result and nothing else, and `catch` a Result or an Option (`sema/body/postfix.kspl`, and `infer_catch_chain` in `sema/body/expr.kspl`). Miss the check in one, and the backends read a tag and a payload off a value that has neither. The C compiler then fails with zero diagnostics from ksplc (Principle 2).

**`a[i]` on a type that implements `Index_place` (the index that returns a place) is resolved before `Index` / `Index_mut`.** `infer_postfix_array` in `sema/body/postfix.kspl` does it, probing with `has_implemented_operator_trait`. (`check_operator_trait` reports a missing implementation, so it cannot probe.) `at` returns a mutable pointer to the element, but the node's `type_id` is the pointee (the element type). `lower_postfix_index_operator` in `lower/expr.kspl` rebuilds the node as `a.at(i)$`, a dereference in place with no temporary. So reading, assigning, compound assigning and `a[i]@` all take genc's one path for postfix `$` (`(*(...))`). The `get` side returns a value via a temporary, so `a[i]@` there would point at a temporary, and is refused.

* **Do not tell the two apart by the method's name.** Monomorphizing a generic's impl rewrites `def_node`'s identifier to a name such as `std_ds_List_I32_at`, which does not match `at`. `Env.is_place_index_node` decides on the types' relation: the resolved target's return type is a pointer whose pointee is the node's `type_id`. With `get`, the return value itself is the node's type, so the two are not confused.
* A function declaration's name is a direct child of `k_decl_fn` after normalizing, but a `k_decl_fn_proto` can stand between (`get_attribute` takes the same detour).

**Decide "pointer or slice" before matching an explicit impl.** `has_implemented_trait_fqn` strips the pointer (`strip_ptr`) before consulting the impl table, so methods are found on a pointer receiver too. If it matched first, an `H$@` (a pointer to an owning handle) would match as `H`, and copying a borrowed view would be treated as a move.

### Measuring what suppression costs

Turning a check off in one spot can hide more than intended, so before adding such an exception, count what it would hide. At receiver positions in `sema/flow/track.kspl` (a field access, a method call), one flag carries both the move verdict and the use-after-free verdict. It rightly carries the move verdict, since a receiver does not duplicate the value.

Caution: **Do not use this flag to suppress the use-after-free check as well.** The wish is genuine. Many types' `.free()` frees only the internal buffer and resets, so their other fields are legitimately read afterwards. But suppressing both leaves only the most harmless shape detected:

| The shape | Suppressed along with the receiver position |
| --- | --- |
| `p.free(); _x: = p.v;` (reading freed heap) | no diagnostic |
| `p.free(); p.v = 2;` (writing freed heap) | no diagnostic |
| `p.free(); p.get();` (a method call) | no diagnostic |
| `p.free(); _c: = p;` (a whole copy) | detected |

**Before adding a suppression, measure what it hides.** Without this one, the check reports two places in the whole code base, both a fragile order.

**A freeing is recognized in one place**: the method form (`x.free()` / `x.dealloc()`) and the function form (`dealloc(x)`), by `get_free_call_receiver` / `is_free_fn_path` in `sema/flow/release.kspl`. Copied out to each user, the verdict loses a form (`dealloc(x)`) that nothing then tracks. To add a name for freeing, change `get_free_call_receiver` and nothing else.

**Strip the wrapping.** `dealloc` takes a `Void$@`, so a real call nearly always carries a cast (`dealloc(Void$@::p)`). The `@` and the `::` are stripped recursively back to the original local. Unstripped, the check catches almost nothing.

**A pointer's `free()` leaves a block that `dealloc` can still name** (`p.free()` then `dealloc(Void$@::p)`, the rule in 8.4.5 of [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#845-tracking-a-free-with-manual_free)). `Df_state` keeps two may-sets:
* `freed_vars`, what is released, any use of which is refused;
* `gone_vars`, what has nothing left to give back.

`p.free()` on a pointer enters only the first. Every other release enters both, `dealloc(p)` and a call followed one level among them. So a `free()` whose body gives back its receiver leaves nothing. Before a `dealloc` call is walked, `release_kept_block_if_any` takes its local out of `freed_vars` where it is not in `gone_vars`. The call's own registration then puts it in both. **Only the cast is stripped there** (`get_dealloc_of_name`): `dealloc(p@)` gives back the variable's own address, not the block. Both sets merge as a union, so a local given back on one branch and only freed on the other is still refused.

### A diagnostic points at 'the position the user wrote'

**An error is reported at the line in your code that caused it, in the names you wrote.** It is never reported at a line inside the standard library, or in the compiler's internal names. So when a generic's bound is violated, the diagnostic points at the instantiation the user wrote, not at the constraint line in the template. A beginner reads a position inside the standard library as "the error is in the standard library, not in my code". This holds even when the type name is right.

1. **A diagnostic takes its source from the node** (`file_for_node` / `source_for_node`).
   * Caution: During monomorphization the current file is the template's. A diagnostic that takes "the current file" prints the template's file name, line and caret, even when it is reported on the user's node. This holds for every diagnostic whose node belongs to a file other than the current one, not only for generics.
2. **The position that caused the instantiation is recorded in `Generic_state.inst_site`.** The constraint check runs partway through the monomorphization, so its error node is the template's constraint node, which carries nothing about where the instantiation started. Only the three entry points set it: a generic function's call, a generic type in a type expression, and a generic path inside an expression.

**It is not passed as an argument.** An instantiation passes through four stages with several callers each, so adding it to every signature ripples widely. `Generic_state` already holds the current binding, and where it was requested fits beside it. Instantiations nest, so every entry point saves and restores it. Where it is `null`, the report falls back to the template's position: worse, but never lost.

**The spelling is the user's too.** `display_str` in `sema/type/display.kspl` is the only way a type is shown to a person. Build no second one showing the internal name.

| The user wrote | Shown as | Not shown as |
| :-- | :-- | :-- |
| `I32?` | `I32?` | `Option_I32` |
| a function the compiler synthesized | as the source calls it | `_anon_fn_1` |
| an environment the compiler synthesized | reworded in a note | `_anon_env_1` |
| `Names` from `typedef Names = List<\|U8[]\|>;` | `Names` | `List<\|U8[]\|>` |

Shown `Option_I32`, someone who wrote `I32?` cannot match it to their code. Synthesized names are not shown either. An alias is shown by its own name, unresolved. `Names` is what the user wrote, and resolving it would name a type the line does not spell.

### No diagnostic that depends on a generic's type argument

**Inside a generic function's body, advice whose verdict changes with the type argument is not given at all.** "This cast is unnecessary" can be true for one type and false for another. The worked examples are [I0301]'s unnecessary `::` cast and [I0307]'s empty block.

```kspl
fn blas_gemm<|T|>(...)
    if sizeof(T) == 4
        cblas_sgemm(..., F32$@::(a), ...)
    else
        cblas_dgemm(..., F64$@::(a), ...)
```

In the `T=F32` instance, `F32$@::(a)` is an identity cast, so [I0301] fires. But in the `T=F64` instance it is a real pointer conversion and cannot be removed. Likewise, `if sizeof(T) == 4` looks like [I0307] in the instance where the condition folds and the branch's contents drop away. In both, the source is right and the finding is wrong: **it is advice that stops the code compiling if followed**.

**The line is soundness.** A diagnostic is sound only where the analysis does not depend on the type argument. So these two are not reported while `Sema_ctx.is_instantiating()` is true. That covers both paths: resolving the type arguments (`inst_site`), and analysing the body later from the pending queue (`in_generic_instance`). Only the latter catches a diagnostic inside the body.

**A missed finding is the cost accepted.** Reporting only what is redundant in every instance would be more precise, but needs machinery to pool diagnostics across instances. No advice is safer than wrong advice.

**The import an extension method requires is a third case, and an error rather than advice.** That rule is "A file using an extension method imports its defining file" in [`DESIGN-compiler.md`](DESIGN-compiler.md). Inside the body the receiver can be the type argument's. A generic cannot import every file that serves its bound: `put<|W, T: Formattable|>` in `std/lang` reaches each type's `fmt` wherever its `impl` stands. So the verdict changes with the argument. The ledger is still asked. A hit marks the template file's import used, and an import left unmarked is one [I0401] would tell its reader to delete.

### An error in a generic's body names its instantiation

**A generic's body is checked once per instantiation, so an error there can come from the caller's type argument.** The template's line alone does not say which call gave it. So the error carries one Note per instantiation it stands in, innermost first, up to the caller's own line (`instance_notes` in `sema/session/ctx.kspl`). Each Note names the instance and the line that asked for it (`in 'app.smaller<|app.Pt|>', instantiated at app.kspl:8:12`).

* **The first to ask is named.** A body is queued once (`queue_fn_body`). Its record keeps what asked for it and which body was being analysed then (`Pending_inst.site` / `from`). So the chain is read back without walking the tree again.
* **Once per error.** An error in a body is reported once whichever instance finds it ("error in an instance" in `report_core`), so the Notes are the first instance's.
* **A closure's body names no instance of its own**: its environment's name is the compiler's, and the function that writes the closure stands for it.
* **At most `max_instance_notes` levels.** A long chain shows its inner end and says more stand above it. A chain that deep is generated code, and a wall of Notes hides the error.

### The declaration decides whether a call uses a function pointer

**`f()` can call a named function, or be an indirect call through a function-pointer value. To decide which, the compiler looks at the declaration the callee resolves to, not at the callee's type.**

**The reason**: a named function's symbol holds its return type in `type_id`, not the function's own type. Given `pub typedef Cb = fn(): I32;`, a `fn cb(): Cb` thus looks by type exactly like a callee of function-pointer type. Judged by type, `f: Cb = cb();` fails with `expected 'Cb', but got 'I32'`, and `f: = cb();` becomes invalid C with zero diagnostics from KSPL. The argument check rests on the same premise. A call taken for an indirect one skips resolution by name, so not even the argument count of `cb(1, 2)` is checked.

**For the same reason, a function passed as a value does not simply take the expected type.** With nothing in the symbol to compare, adopting the type lets a `fn(x: I32): Void` go into a `fn(x: I32): Bool` field with zero diagnostics. A C function pointer is a plain address, so the generated code builds too. Only clang's `-Wincompatible-function-pointer-types` catches it, against "Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md).

**With no expected type (`f: = big;`), the binding takes the function type of the function the name names.** It is read off the declaration the name resolved to (`own_type_of_name` in `sema/decl/name.kspl`). `infer_var_decl` in `sema/body/stmt.kspl` asks it, as a generic parameter's inference does. It is never the symbol's `type_id`, which would make `f` a `Bool`, the return type. A variadic function has no function type, and its binding is rejected in one place (`check_fn_value_binding` in `sema/body/stmt_escape.kspl`). The type is then made `Unknown`: carried on, one error would become a different diagnostic at every use.

Caution: **Decide by the mark a function's name carries, not by the declaration the node resolved to.** A call's result, `x: = f(1);`, resolves to the same declaration. Only a name standing for a function carries `generic_fn_value_type_id`, so a call's result keeps its own type. The regression is the case `fn_value_variadic_binding` in `tests/negative/fn.kspl`, with `tests/fn_value_test.kspl` for the passing side.

**How it is checked**: the canonical string `fn(T1,T2):Ret` is rebuilt from the declaration and compared (`sema/decl/resolve.fn_signature_type_id`). Build the annotation's string and the declaration's with that one function. Built separately, the strings drift, the comparison becomes always-equal (or always-unequal), and the check dies. The relaxation to `Void$@`, the opaque marker of a generic call, and variadic arguments still pass. Being strict here makes FFI hand-overs unwritable.

**A call through a function value reads its signature off the value's type.** A function type is a structural node in `Info` (`fn_type`, whose `Fn_sig` holds the parameter and result types). Its canonical string is read at registration (`get_or_add` in `sema/type/env.kspl`). So `fn_sig_of` reaches the signature wherever the value came from: a local, a `typedef` chain, a generic's field, a list's element, another call's result (`infer_value_call_args` in `sema/body/call_args.kspl`). A named function's call is still matched against its declaration, which holds the defaults.

Caution: **Do not take the signature from the declaration the callee's node carries.** Read that way, `pick()(21)` is a call of `pick`. And a value with no declaration of its own (a generic's field) has none, so the result defaults to `Void` and the arguments go unchecked. Whether a name calls a function is judged in one place, `resolves_to_named_fn` in `sema/body/call.kspl`, which the LLVM backend asks too.

**A composite of a function type brackets it**, in the canonical string and in diagnostics alike (`(fn():I32)@`), as the surface syntax does. Unbracketed, a pointer to `fn():I32` would spell `fn():I32@`, a function returning `I32@`, and the two would share one id.

#### A generic call's arguments are checked after instantiation

**The arguments of a call to a generic function can only be checked once `T` is known. So the check runs right after the function is instantiated** (`check_args_against_instance`). The arguments are inferred with their expected types still `unknown`, since `T`/`U` are not bound at that point. This is the `if is_generic_call` in `infer_call_args` in `sema/body/call.kspl`. The instantiation runs after that inference. So directly after it is the only chance to compare the arguments with the substituted parameter types.

**Check every argument, not only the trait upcasts.** Narrowed to the upcasts, a generic call's argument types go unchecked. `take<|I32|>(1, "wrong")` passes with zero diagnostics from ksplc, and the generated C fails with `passing 'kspl_U8_Slice' to parameter of incompatible type 'I32'` (against "Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md)). `apply_type_coercion` judges which differences can pass: a numeric widening, an upcast to a trait, a wrap in a Result. It reports the rest, as on the non-generic path. Nothing converts twice, since on the generic path no conversion has been applied before this.

Caution: **A difference in write permission does not show in the generated C.** genc puts no `const` on an immutable local binding. So passing a `T@` where a `T$@` is expected escapes the C compiler too; only the KSPL side can catch it.

**An argument that passes a function's name is inferred again instead.** The expected type cannot reach it, so the name carries `generic_fn_value_type_id` (the mark of holding no signature) up to here. Comparing that mark with a function type means nothing. Inferred again with the parameter's type as the expected one, its signature is checked as anywhere else. **The inference before the instantiation reads the function type off the declaration the name resolved to.** That is `own_type_of_name` in `sema/decl/name.kspl`, or an instance's for a written specialization. So `pass(same<|I32|>)` binds `F` to `fn(I32):I32`. A variadic function keeps the mark, as no function type holds its `...`. `refuses_fn_name_binding` in `sema/body/call.kspl` reports it: an instance built on the mark could neither be called nor spelled in C.

**Walk the parameters by one rule.** The check runs twice, at the call and directly after the instantiation, and both walk the parameters with `Param_cursor`. Written separately, the two drift: only one of them could offset for the receiver, for instance. The regression is the case `generic_call_arg_types` in `tests/negative/generic.kspl`.

#### A generic call's type arguments come from its arguments' structure

**Each parameter's written type is walked against its argument's type id** (`bind_type` in `sema/body/generic_infer.kspl`):
* a postfix peels a pointer, an array or a result off the argument;
* a generic's `<|…|>` is matched position by position against the argument's instance record (or the instance of that generic trait it conforms to);
* a function type is matched part by part.

A type parameter binds where it stands bare, to the type found there with its immutability. So a `T$@` given an immutable place's address makes `T` immutable, and the instance refuses the write. The generic's name is read with `read_written_type` in the declaring file, so an import alias or a renamed import names the same template.

Caution: **Do not match by spelling.** A written type's spelling does not show where a nested list starts (`Hold<|T|>[]` is `Slice<|Hold<|T|>|>`). Two spellings can name one type (an import alias, a renamed import). So a match by text binds the wrong type or none.

Caution: **Do not fill a slot no argument bound.** Whatever type stands in builds an instance. Its own checks then report a mismatch the user never wrote. With the slot left out, the parameter's name reaches the C raw. `refuse_unbound` reports it at the call instead, at the argument whose type did not have its parameter's shape where there is one.

**A function's name binds last.** It takes its type from where it is written. Where the other arguments fixed its parameter's type, it is checked against that type after the instantiation, with the diagnostic that check gives. It binds only what they left open.

#### An instantiated generic trait registers its methods by name

When a generic trait is instantiated, its methods are registered by name like any other trait's, or calls to them lose their return type. Method resolution (`infer_dot_access` in `sema/body/dot.kspl`) looks `<type name>.<method name>` up in the name table. **It gives the call node the found symbol's `type_id`.** A trait's methods are not in the type table's `methods` (that holds the `impl` side), so the name table is the only source of this type.

`build_trait_registry` in `sema/decl/registry.kspl` registers a non-generic trait's methods. **An instantiated generic's trait registers them the same way** (`declare_inst_trait_method` in `sema/decl/mono.kspl`). Unregistered, resolution takes the "not found" path. That path checks only visibility and lets the call through without filling its type, so the node stays `Unknown`.

**No diagnostic comes out.** The generated C calls a slot name that is not in the vtable. LLVM prints `icmp sgt ptr 0, 0` without making a register for the return value. Worse, a position with an expected type, such as `return f.call(a);`, fills the type from context and hides the fault. So it shows only in a position such as a comparison's operand. The regression is `traitret=` in `tests/prog/equiv.kspl`.

Caution: **Set the back link from the declaration node to the symbol (`sym_ptr`) as well**, as `define_symbol` in `sema/type/scope.kspl` does. `sema/body/call.kspl` takes a resolved declaration without `sym_ptr` as the mark of a generic method's template. Without it, the prototype goes on to monomorphization, and the output calls a slot `call_<type argument>` that is not in the vtable.

A `priv` method is registered too. The caller checks visibility (`check_visibility_and_mark_used`), so hiding it here would drop only its return type, with no diagnostic.

#### A call's missing defaults are filled by copies

**When a call leaves out arguments that have default values, Sema adds copies of the defaults to the call.** So the backends see a call written out in full (the language's ruling is [8.1.1 of `../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#811-default-arguments)). **A call can be short of arguments by no more than the run of defaulted parameters at the tail.** There, `fill_default_args` in `sema/body/call_defaults.kspl` appends the declaration's default values to the `k_expr_args`.

**Append a copy.** One node attached to several calls leaks the `type_id` one analysis writes into the others.

Caution: **Do not add the `,`**: Genc emits the separators between arguments itself (`emit_comma_separated_args` in `gen/c/expr.kspl`).

Once filled, the counts agree, so a body copied by instantiation is not refilled.

**Genc and Genllvm know nothing of it**: the call's tree has the shape of one written out in full.

Caution: **Do not drop the `=` inside a parameter.** A default value is read as the child after the `=` (`get_param_default` in `base/ast_ext.kspl`). Some parameters write no type, so position cannot decide it. `is_trivia_node` in `parse/normalize.kspl` treats `fn_param` like `expr_field_init` and keeps the `=`.

**The rejections sit in four places, which cannot be gathered into one**:

| What is rejected | Where |
| :-- | :-- |
| not at the tail, not a literal, a type containing a type argument | `report_bad_param_defaults` in `sema/decl/type_check.kspl` (at the declaration, so it does not repeat per instance) |
| a trait's methods (declaration and implementation) | `sema/decl/trait_check.kspl` |
| an `extern` function | `sema/decl/collect.kspl` |
| a closure's parameters and captures | `reject_param_defaults` in `parse/desugar_closure.kspl`. **Sema is too late**: once lifted they look like an ordinary function's parameters and pass the check at the declaration |

### The pass/fail verdict is checked apart from each diagnostic

**It is not enough that each diagnostic fires.** The step that turns "there were findings" into a failed build needs a separate check, that the tool itself has not broken. Even with every diagnostic confirmed to fire, CI passes if the part that turns them into a pass/fail verdict is broken. That part is the Makefile's `lint` target.

**`make lint` analyses entry points, and code unreachable from them is not analysed.** A generic is analysed only once instantiated. So code instantiated only from `tests/debug/main.kspl` escapes unless that file is an entry point, and its information diagnostics pile up, dozens under `std/` alone. It is one, because it holds `fn main`: `LINT_TARGETS` in `mk/lint.mk` takes every such source. `make test-lint-gate`, among the repository's own suites beside the target it judges, checks that a file holding one information diagnostic makes `make lint` exit non-zero.

**A severity and a CI policy are different things**: Hint means "does not stop the user's build", not "can be left standing in our repository". Outside the gate, findings pile up and bury each new one, so the gate requires zero at Hint and above. A diagnostic that can be allowed to pile up is not worth emitting.

**A skip is reported**, never passed silently (the caution under "The shape of a per-item pass/fail line" in [`docs/SPEC-gates.md`](../../docs/SPEC-gates.md)).

**A reproduction test is added only after it is seen to fail on the broken code.** One never seen failing before the fix is a gate that checks nothing.

### A type check covers every declared type

**One check refuses a type of infinite size (a struct that contains itself): `check_infinite_size_types` in `sema/decl/layout.kspl`. It measures every declared `struct` / `enum`, used or not.** Narrowed to the types whose size was needed, a type referred to only by a local, a parameter or another type's field slips through. An infinite-size struct then reaches the generated C, and the user gets the C compiler's incomplete-type error. That error is far from the KSPL source in both position and cause ("Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md)).

Caution: **Call this check inside Sema.** After Lower and code generation, the diagnostic would come only once a broken `.c` is written, never from `ksplc lint`. And a cyclic type would first hit one of Lower's own depth ceilings (retain/release insertion, name mangling). Its position-less cut-off would take the proper diagnostic's place.

**This sweep does not report a too-deep but non-cyclic chain.** The layer that refuses it is decided where that layer needs the size or the code. Reported here first, the later stages' ceilings (`MAX_ARC_EMIT_DEPTH` in `lower/arc.kspl` and the like) would never be hit by anything.

**Three walks follow a value's parts**, at the four owning positions of the chapter "The rules for implementing ARC" in [`DESIGN-lower.md`](DESIGN-lower.md). They are the size in `sema/decl/layout.kspl`, and the ARC contents and the structural markers in `sema/type/arc.kspl`. Each cuts cycles itself, since the walks run in no guaranteed order. One that does not reaches the depth ceiling before the infinite-size report, and ends in a cut-off with no position.

### Generic checks tell written type arguments from inferred ones

**If you write the type arguments yourself (`f<|I32|>()`), their number must match the declaration. If the compiler infers them, it does not check the count.** `check_written_generic_arity` in `sema/decl/mono.kspl` holds the verdict and its wording for both callers: `sema/decl/resolve.kspl` for type expressions and `sema/body/call.kspl` for calls. A wrong count is refused. Surplus type arguments would bind to nothing (Principle 5). Missing ones would leave unsubstituted type variables in the generated C (`unknown type name 'U'`, against "Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md)). A generic's type written with no type argument (`x: W;`) is refused for the same reason.

**A list inferred from the arguments needs no count check: it cannot differ.** The inference (`inferred_type_args` in `sema/body/generic_infer.kspl`) keeps one slot per declared parameter. It refuses the call while a slot is empty ("A generic call's type arguments come from its arguments' structure").

### The static-initializer check is applied to both `var` and `const`

**A global's starting value must be computable before the program runs. This is checked for both `var` and `const`**: both sit in static memory, and both become file-scope initializers in the generated C. **Sema decides each top-level initializer once, and Lower and both backends follow that decision** (`check_static_initializer` in `sema/body/static_init.kspl`). Each part of an initializer falls into one of three classes:

| Class | What it is | What the later stages do |
| :-- | :-- | :-- |
| A folded value | A node whose type is an integer, `Bool`, character, scalar enum or float, and which folds | Both backends write the value recorded in `Static_state.values`. Lower leaves the node alone |
| A shape | A compound literal, a string, `null`, a function, a variant or a trait value. A fixed address, a slice over an array, a pointer cast and a constant of a shape count too | Each backend writes it as it stands. A conditional with a folded condition is the branch it picks (`Static_state.picks`), which Lower puts in its place |
| Refused | Anything else | ksplc reports it with its own message |

**No later stage decides again.** A guard in Lower, a fold in genc or a list of writable constants in genllvm would be a second copy of the rule. Copies disagree, and code that one copy lets through stops in the C compiler or in LLVM with zero diagnostics from ksplc (Principle 2). So a shape is in the table only when both backends write it, and a backend meets an unclassified form only as an ICE.

**What is refused, and why:**

* **A run-time computation** (a call, a dereference, a variable's value) reports `top-level variable initializer is not a compile-time constant`.
* **A read of a part of another value** (an element, a field, a slice's `.len`) has its own message, even from a `const`. C99 has no constant expression that reads one, and the fold reads none.
* **An address reached through a pointer or a computed index** reports that only a fixed address can be taken. `is_static_place` decides which addresses are fixed, and genllvm's constant `getelementptr` writes exactly those.
* **Any other scalar that does not fold** reports that it cannot stand in a top-level initializer. A comparison of two addresses is an example.

Caution: **Folding where a constant is used does not cover this.** A `pub const X: I32 = f();` that nothing uses as a constant expression is never folded there. Only this check sees it.

**Follow a constant's references**, or the cycle `const A = B; const B = A;` slips through. Folding cuts cycles too, but only this check reports them. Folding runs only where a constant is used. So reporting there would miss cycles among unused constants, or among constants that cannot fold (a string, a `::{}`).

**The value check sits here for the same reason** (`fold_static`). A scalar is folded on the spot, and an overflow or a division by zero is reported. Otherwise an unused `pub const X: I32 = 2147483647 + 1;` would never be reported.

**Fold quietly first, then report by folding again.** The quiet fold tells "not a constant" from an overflow. Only an overflow, a division by zero or a cut chain is folded again loudly, so one reporting point names the failing step.

**Width and signedness come from the operands' type**, so the declaration's type need not be passed. `I8::127 + I8::1` overflows as `I8` even where it would fit an `I64` (`fit_or_report`).

**Each constant is folded once, and its value is kept** (`Static_state.ints` and `.floats`). A chain such as `const C2 = C1 + C1` names each constant twice, so a fold that walks every name again costs 2^n. A kept value carries how deep its own fold went. A reuse adds that depth, so the depth limit cuts the same chains as without the cache. **A value is kept only for one typing state** (`Static_state.epoch`): a fold reads the operands' types, so each newly typed initializer makes the kept values stale.

Note: **An unsigned wrap is not an overflow**: `U8::255 + U8::1` is 0, `mod 2^8`, as docs/SPEC-programming-language.md §6.8 says.

### Each depth limit is set by what breaks first

**ksplc has several depth limits.** Each stops it with a clear error when something is nested too deeply, and each guards against a different breakdown. **So each keeps its own value**: do not borrow one limit's value or owner for another.

| The ceiling | What it guards | How it breaks down |
| :-- | :-- | :-- |
| KSPEG's parse depth (`kspeg/rule.kspl`) | the parser's own native stack | a crash on a deep expression |
| the AST's copying / validation / walking (`base/ast.kspl`) | each walk's recursion | the same |
| the type chain, the alias chain, the layout, the monomorphization | each layer's mutual recursion | the same |
| the method table's chain (`MAX_METHOD_CHAIN_DEPTH` in `sema/decl/mono_queue.kspl`) | **the instantiation queue** | it never returns, with no diagnostic |
| the constant folding (`MAX_CONSTEXPR_DEPTH` in `sema/decl/eval.kspl`) | the folding's recursion and the translation time | a crash, or no return, at the declaration count × the depth |
| block nesting (`MAX_BLOCK_NESTING` in `sema/body/stmt.kspl`) | **the C backend's output** | the generated C exceeds the C compiler's bracket-depth limit |
| the zero initializer's braces (`MAX_ZERO_INIT_BRACES` in `gen/c/ctx.kspl`) | **the C backend's output** | the same |

**The method table's limit cannot be replaced by call depth.** The instantiation queue (`Mono_state.pending_methods`) turns recursion into iteration, so the call depth (`mono_depth`) returns to 0 with each item. But chaining "a generic method returning a self one level deeper" advances as many levels as are chained. "Where the instantiation queue is drained" in [`DESIGN-sema.md`](DESIGN-sema.md) says how a level advances, and why the body and the table share one count.

**Do not set it to `MAX_MONO_DEPTH`.** That limit is 128 because legitimate nesting can go deep, while the chain is held to 32 (`MAX_METHOD_CHAIN_DEPTH` in `sema/decl/mono_queue.kspl`). Each level of the chain builds a whole method table. So at 128, cutting off a runaway takes so long that it looks like a hang.

**The folding's limit cannot be replaced by the AST's depth.** A constant's references dive across declarations (`eval_ident_or_path`), so they can go deeper than the one expression the parser accepted.

**Return the cut-off apart from `not_constant`** (`Sema_error.nesting_too_deep`). As the same value, the quiet folding entry point (`eval_constexpr_quiet`) swallows it as "not a constant". The user then sees a different diagnostic, such as an error in an array size. Kept apart, the re-folding in `fold_static` (`sema/body/static_init.kspl`) picks it up and reports the depth.

**A chain cut at the limit is one error, reported at the head of the fold that met it** (`report_cut_chain` in `sema/decl/eval.kspl`). "Implementation limits" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md) asks this of every cutoff. Each constant down a long chain is checked on its own (`fold_static`), and every one past the limit is cut again. Reported where each walk stopped, one chain gave an error per constant, each on a line that says nothing of the chain. So the constants a reported cut went through are kept (`Resolving_state.cut_reported`), and a cut through any of them is the same chain. An array length taken from a cut chain names the depth too, not "a size that is not positive".

**A refused typedef (too deep, circular) is the unknown type** (`resolve_written_type` in `sema/decl/resolve.kspl`). Named as a type of its own, each use added a mismatch (`expected 'A999', but got 'I32'`) that hid the refusal. An alias whose chain ends in a refused one is refused with no second error.

**Raising the folding's limit lengthens translation on a pathological input.** Every top-level constant is folded (`fold_static`). A kept value saves the walk below it, so the chain's cost is at most the declaration count × the limit. The floating-point fold (`MAX_FLOAT_FOLD_DEPTH` in `sema/decl/fold_float.kspl`) reaches as deep as the integer one, since a float that does not fold cannot stand in a top-level initializer.

**The bottom two exist for the C compiler, not for ksplc.** Past them the generated C exceeds the C compiler's limit (clang's `-fbracket-depth` defaults to 256) and stops with `bracket nesting level exceeded`. The user then gets the C compiler's error, not a KSPL diagnostic ("Failing fast through an exception or an ICE" in [`DESIGN-compiler.md`](DESIGN-compiler.md)). The values sit below 256 because C's depth also counts an expression's parentheses. They sit well below because MSVC and others have other limits. Block depth needs no counter of its own: the scope stack (`symtab.scope_stack.len`) grows by one per block, and that is what is checked.

**A zero initializer's brace pairs are not one per type level**, nor can one `{0}` stand for them ("Genc (C99): the topological output order" in [`DESIGN-backends.md`](DESIGN-backends.md)). Each array level takes two (`zero_init_depth`). Set the limit above twice the guaranteed postfix depth. The diagnostic names the guaranteed depth, since the doubled value would suggest more levels than can be written.

### Name resolution with no namespace goes through one function

**A name brought in by a selective import (`import "p" { A }`) is turned into an FQN by one function everywhere, `Sema_ctx.imported_symbol_fqn`.** So types, functions and constants imported this way all work the same. Two readers resolve names, both in `sema/decl/name.kspl`:
* a written type's (`read_written_type`, "A written type's name is read once, from its tree");
* a written value's or function's (`read_written_name`, "Value and function names are read once, from their tree").

If each read the import table itself, a kind one of them forgot would pass the `import` line. It would then fail at the use with `undefined path or identifier` (Principle 5). Typically, types resolve while functions, constants and aliases do not.

The lookup order for a bare name:

| Order | Where it looks |
| :-- | :-- |
| 1 | locals and generic type arguments (scopes inside the file) |
| 2 | the selective imports (`imported_symbol_fqn`) |
| 3 | any same name outside the file |

Caution: **Consult it before any same name outside the file.** Inside one file, an ordinary declaration and a selective import never share a name: `add_import_symbol` and `declare_symbol` make each a redefinition of the other. So consulting it first confuses nothing. Consulted later, a same-named declaration in another file wins instead, or a name the alias resolution left in the type table.

**But consult it after locals and generic type arguments**, which are scopes inside the file.

**No generic is among the same names outside the file.** A template is keyed by its FQN alone (`register_template` in `sema/decl/declare.kspl`), a generic type's and its methods' as a generic function's. The template table is one for the whole build, while a short name names a declaration only inside its file. Suppose templates were keyed by the short name too:
* another file's `priv fn same<|T|>` would answer a call of this file's own `same` ("missing import alias prefix");
* another file's `priv struct Box<|T|>` would answer this file's `Box<|I32|>`.

The check would then report "undefined type 'Box'" while the instance was still made from that file's template. Each use of it would report again ("cannot access symbol", "less visible than the field"). **A written type's name reaches a template only through `read_written_type`** ("A written type's name is read once, from its tree"). **A value's or function's reaches one only through `read_written_name`** ("Value and function names are read once, from their tree"). A bare name finds this file's own declaration, then a selective import's. **Nor is a typedef among them.** `resolve_alias_sym` in `sema/decl/resolve.kspl` registers one in the type table under its FQN alone. So another file's `priv typedef Num` is an undefined type here, as its generic counterpart is.

**A name another file declares, written without the alias that reaches it, is told in one wording** (`report_without_alias` in `sema/decl/name.kspl`). This holds for a function, a value, a generic type and a plain type alike: `missing import alias prefix. 'twice' is declared in 'p'. This file imports it as '_m'. Write '_m.twice'`. A name found under another file's FQN written out (`by_fqn`, "Value and function names are read once, from their tree") is told the same way. Three wordings for one mistake leave the writer to work out that they share a cure. The three are "undefined path or identifier", "undefined type" and "missing import alias prefix". Whether another file declares the name is asked of this file's written import aliases (`alias_reaching`). That counts only what this file can see, so another file's `priv` name stays undefined here.

Caution: **Do not ask the type table whether another file declares a short name.** Its short keys are whatever spelling a position registered first, so the answer would change with the order files are read in.

**A selector's existence is checked at the `import` line** (`check_import_symbols` in `sema/decl/access.kspl`, which also binds the name in the braces to that declaration, as a use). Checked at the use, a typo causes no diagnostic until the name is used, and the `import` line looks as if it works.

#### A written type's name is read once, from its tree

**Every route to a type the source names reads the name with `read_written_type` in `sema/decl/name.kspl`.** The routes are these:
* a type position (`resolve_type`) and its check (`validate_all_type_exprs`);
* the type before a member's name (`infer_namespace_access` in `sema/body/dot.kspl`, `member_through_type` in the value reader);
* a value naming a type's instance (`read_instance_type`);
* an impl's target (`impl_target_fqn`) and its trait;
* a generic parameter type a call's argument is matched against (`bind_path` in `sema/body/generic_infer.kspl`);
* reflection's tests, and the declaration an editor jumps to.

It reads the path's segments from the tree, not its spelling:

| it reads | as |
| :-- | :-- |
| the head | through this file: `Self`, a type parameter, a selective import under its own name or another, this file's own declaration (`resolve_fqn_for_type`) |
| the segment after an import alias | that file's name (`m.Box`) |
| the `<\|…\|>` right after the type's name | the type's arguments, from which `instance_written` makes the instance |
| a name after the type's | a member |

**Type arguments after a type that declares none bind nothing.** The name is that type, and they are refused where they are written. `refuse_type_args_on_plain_type` in `sema/decl/type_check.kspl` refuses them, asked by the type check and by `infer_namespace_access`. Made an instance of nothing, the position would name a type no declaration holds, and each use of it would report again.

**What the written type is, it answers only when asked** (`type_kind_of`, which the type check asks). Working it out on every read would mark the names it passes through as used.

Caution: **Do not read a written name from its spelling** (the path's text cut at `<|` or split at `.`). The spelling cannot tell where a type's arguments end and a method's begin (`Holder<|I32|>.gm<|U8|>`). A route that cut it otherwise would answer otherwise: a type position would find a type its check reports undefined. A callee's own `<|…|>` is told from its type's by `named_fn`, beside the reader.

#### Value and function names are read once, from their tree

**Every route to a value or a function the source names reads the name with `read_written_name` in `sema/decl/name.kspl`.** The routes are these:
* a value's path (`infer_path_expr` in `sema/body/resolve_path.kspl`), and through it a comparison's side, a generic call's argument and a declaration's initializer;
* a call's callee (`sema/body/call.kspl`);
* the left of a `.` (`sema/body/postfix.kspl`);
* a constant folded before any body is inferred, and a `sizeof` naming a value (`sema/decl/eval.kspl`);
* an assignment's target (`enforce_mutability`) and the frame-escape checks (`sema/body/stmt_escape.kspl`);
* the test for std/lang's `put` (`try_rewrite_enum_fmt`);
* the declaration an editor jumps to from a call.

A function's name can stand where nothing expects a type: in a declaration with no type, or for a generic parameter. The type it gives there is read off the declaration the reader found (`own_type_of_name`). The reader reads the tree, not the spelling, and returns a record (`Written_name`). The record holds:
* the symbol it names (a local, a global, a constant, a function, a method, an enum variant, a type);
* the generic function's or method's template, with the instance it is reached through (`Fn_instance`);
* how the name was reached.

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

Caution: **Do not look a name up by its segments in a route of its own.** A route that cut the path otherwise would answer otherwise. A typedef's method (`P.mk` after `typedef P = m.Plain`) would be refused at a call while its value passes. And a write to `m.total` would check a binding `m`, which names no value, instead of the global `total`.

### An alias prefix checks only that the next name exists

**For a qualified name `mod.Name`, only `Sema_ctx.file_has_type` decides whether `Name` really exists in the file `mod` names.** It looks the name up with its qualification. This holds for type positions (`read_written_type` in `sema/decl/name.kspl`) and value positions (`read_name_in_file`, beside it) alike.

Caution: **Do not consult it with the qualification stripped.** A short name answers for what this file names so (its own declaration, a selective import), not for what the aliased file holds. At a type position a phantom type such as `io.List<|I32|>` appears. Nothing is reported at the declaration, and it fails far away at the use with "that type has no such method". At a value position the qualification is silently ignored, so any alias prefix passes.

**Do not exempt every path that carries type arguments either.** The `method` of `mod.Type<|T|>.method` is not in the table until monomorphization, so judging the whole path rejects a legitimate spelling. Only the leading segment (the type's name) is checked. If that is absent, later stages will not resolve it either.

**Whether this file can see `mod.Name` is asked where it is written.** No `import` line names it, as a selective import's does, so the type check asks at the use (`check_and_report_type` in `sema/decl/type_check.kspl`). `written_type_symbol` answers with every declaration of the aliased file, `priv` ones too. So that one is refused as unseeable rather than passed as an unknown name.

**What `mod.Name` names is asked of its declaration too.** `file_has_type` answers for a function's or a variable's name as well. So at a type position `type_kind_of` asks `value_at` whether the FQN names a value (`m.gf<|U16|>` is "a function, not a type"). It does the same for this file's own names and a selective import's.

**A method reached through an instance is that instance's** (`Box<|I64|>.mk`, `Ints.get` after `typedef Ints = Box<|I64|>`, `Self.get` in `impl Box<|I64|>`). `infer_namespace_access` in `sema/body/dot.kspl` records the instance on the path's owner. `instance_method` in `sema/decl/name.kspl` then takes the method from the instance's own table, as a call through a value does. Looked up as the template's `Box.mk` with the type's `<|I64|>` as its type arguments, it held only in one case. The impl's type parameters had to be the type's arguments in order. A method of `impl Box<|I64|>` declares none, and a renaming import or a typedef spells a name no template has. **The instance is read from the path's tree** (`m.Box`, "A written type's name is read once, from its tree"), never from its last segment `Box`. Looked up as this file's, `Box` would find another file's `Box` of the same name, and the program would run its body.

### Explanations come from the specification, and only codes have one

**`ksplc explain <code>` prints that code's section of the diagnostics specification, [`SPEC-diagnostics.md`](SPEC-diagnostics.md), compiled into ksplc** (`ksplc/tools/explain.kspl`). `ksplc explain W0207` prints W0207's. So an edit to the specification reaches the command on the next build, with no second copy to drift (Principle 6). `ksplc/base/lint_codes.kspl` says which codes exist: an unregistered code is rejected before the text is searched.

**`ksplc explain` with no code lists the codes.** A reader does not have to know a code to ask about it. **The list is the specification's section headings.** So a code given a section is listed with no other edit, and the title listed is the one `explain <code>` prints. **One command answers both questions**, "which codes are there" and "what does this one mean", so a reader who finds one finds the other. The codes off by default are marked, since a reader choosing what to switch on needs that most.

**A code's start does not narrow the list; it is refused as an unknown code.** A filter on the list is a second way to find a code, and a search of the list's output already does it (Principle 6). Taken as a filter, a mistyped code would print a list instead of an error.

**Only a warning, an information or a hint has an explanation, because only they carry a code** ("An error has no number" in [`SPEC-tools.md`](SPEC-tools.md)). So an error's message must say what went wrong and what to write instead, in the line the reader already has. Elm does this for every message.

**The closing summary names the command and each code that came out, once** (`Diagnostic_counts.codes`, kept by `report_core` as diagnostics print). A text nobody is told about goes unread, which is why rustc puts the same line under its summary. A clean run names no code, and the lint gate reads only the count line above it.

**The terminal view puts the explanation before its references.** Parentheses containing document links are omitted; other parentheses stay. Inline links show their labels, and bold and heading marks are removed. Prose wraps at spaces to 88 bytes; code blocks keep their text and indentation. A long word stays whole. The final line names the source document. This is one rendering of the embedded specification, not a second explanation to maintain. A section runs to the next heading outside a code block.

**It is written for a model as much as for a person.** An agent that meets `[W0207]` asks for that one section instead of reading the whole specification into its context. It cannot use a pager, so none is used.

**Two gates hold it.** `make test-conventions` checks that every registered code has a section and every section a code (`tests/support/conventions_match.kspl`). `make test-cli` checks that each section prints alone, without running into the next (`case_explain` in `tests/suite/cli_test.kspl`).

**What is given up**: the executable carries the whole specification to print a few lines of it. And an edit to that document rebuilds ksplc (it is in `KSPL_SRCS`). **The seed is not re-baked for an edit to the document alone.** Every compiler built from the sources embeds the text as it is. Only the seed's own binary keeps the older text until the next re-bake, and no command asks it for an explanation.

### A line about the run goes to standard error

**Every line ksplc writes about its own run goes to standard error. So standard output holds only what the command was asked for**:
* a program's own output under `ksplc run`;
* `info`'s answer, `fmt`'s text, `doc`'s Markdown, `explain`'s text, `--help`'s usage.

The rule and its list are in [§2.3 of `SPEC-tools.md`](SPEC-tools.md#23-the-other-compiler-options).

* **A status line describes the run, not its product.** The summary, the closing line (`sema/analysis_failed: compilation terminated …`), `--stats`'s report and the folder `clean` emptied say what happened. Whoever redirects standard output wants the product, and under `ksplc run` that is the program's output. `ksplc run script.kspl > out.txt` must not leave the compiler's lines in `out.txt`, whether the script failed to compile or compiled with a warning.
* **The summary stays beside the diagnostics it counts.** On one stream they come out in order, the count under the lines it counts. Split over two streams, a terminal interleaves them as each buffer is flushed.
* **Under `--diagnostic-format=json`, standard error stays a stream of objects**: the summary and the closing line become one closing object (the next section). A reader learns from it that the compile reached its verdict, and which, without the exit code.

Caution: **A reader taking the count from the text matches the head of the line (`Finished with `).** The summary shares its stream with the diagnostics, and a message can say `error(s)` too.

### Diagnostics for a program are one JSON object per line

**For tools and AI agents, `--diagnostic-format=json` writes each diagnostic as one line of JSON as it is found** ([§2.11 of `SPEC-tools.md`](SPEC-tools.md#211-diagnostics-a-program-reads---diagnostic-format)). So an agent reads the code, the place and the message as fields, instead of cutting them out of prose that a reworded message breaks.

* **A line per diagnostic, not one document at the end.** A reader acts on the first before the compile ends, and a compile that dies midway leaves every line before it readable. A document written at exit gives nothing until then, and nothing valid if the process dies.
* **One writer for both forms**: `print_diagnostic` in `base/diag.kspl` counts the place once and passes it to the text or the JSON. `print_unplaced` does the same for an error with no place in a source. A second writer would let the two forms name different text.
* **The place is the file as written.** A `.kspl` is analysed with its braces put in, so a byte offset would count bytes the file does not hold. The line and the columns come from the line as written, as the text form's carets do.
* **The code leaves the message.** `[CODE]` is how the text form carries it, and a reader of JSON would otherwise cut it out of the message again.
* **The run ends with a closing object**, the JSON form of the summary and the closing line: `result`, and a count per severity (`print_json_closing` in `base/diag.kspl`). A key no diagnostic has tells it apart. A summary shaped as one more diagnostic, with no place, would be one a reader acting on diagnostics has to recognise and skip.
  * **Its counts are of the objects written**, not the analysis's tally, which an error the parse stopped on never enters. A reader counting the lines so gets the same numbers.
  * **Only a run that reaches its verdict writes it.** A refusal, an unreadable input or a breakdown ends with a text line instead, so a stream with no closing object ended early. `--stats`, whose report is text on standard error, is refused beside json.
* **A syntax error says so in a key of its own** (`kind`), since an error carries no code ("An error has no number" in [`SPEC-tools.md`](SPEC-tools.md)). A reader acting on the diagnostics needs to know that the text could not be read at all. Nothing after the mistake was analysed, so no other finding will come until it is fixed. A code family for syntax errors would put them under the levels a code has, where `off` would silence one. A kind is a fact about the diagnostic, with nothing to set.

**What is given up**: SARIF, which GitHub's code scanning reads, is not written. A converter reading these lines can make it where something needs it. Nor is there a `rendered` field holding the text form, as rustc gives. The text is one flag away, and the fields hold what it shows.
