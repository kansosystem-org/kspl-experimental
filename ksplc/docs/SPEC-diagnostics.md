# The ksplc diagnostics specification

This document lists every diagnostic code `ksplc` reports: what each points at, and how to fix it. **It is the text `ksplc explain <code>` prints**, embedded in the compiler, so the explanation is at hand where the diagnostic appeared. How a code is switched on, off or promoted to an error, and the four weights, are "5. Static analysis and the linter (ksplc lint)" in [`SPEC-tools.md`](SPEC-tools.md).

---

## 1. Diagnostic codes, and the errors that have none

A diagnostic code's letter gives the weight ("5.2 The diagnostics' four weights" in [`SPEC-tools.md`](SPEC-tools.md#52-the-diagnostics-four-weights)), and each code is explained in [2](#2-the-list-of-warnings-w) / [3](#3-the-list-of-information-diagnostics-i) / [4](#4-the-list-of-hints-h).

**`ksplc explain <code>` prints that code's section** (the code in either case), so the explanation is available where the diagnostic appeared. A compile or lint that printed a coded diagnostic names the command under its summary. An error, having no code, has no section: its message explains itself.

**Seven shapes are errors with no code**, so no setting can silence them (only a coded diagnostic has a level, "5.2 The diagnostics' four weights" in [`SPEC-tools.md`](SPEC-tools.md#52-the-diagnostics-four-weights)). The first four silently change what runs. The fifth is written but does nothing. The last two are a second way of writing what the notation already says:

| The shape | What goes wrong |
| :-- | :-- |
| a division or remainder by `0` | changes what runs |
| a bit shift by the left side's type width or more, or by a negative amount | changes what runs |
| an integer literal outside its range (`U8 = 300` and the like) | changes what runs |
| a line in the indentation notation whose column matches no block | the reader and the compiler would disagree. `ksplc fmt` rebuilds the columns from the tree, so no formatted source meets it |
| an `#export` on a `priv` | written but does nothing: `priv` makes the generated C `static`, so the exported name still links to nothing outside (the attribute-combination check refuses it) |
| a `;` at the end of a statement's line in the indentation notation | a second way of writing the line's end, which already ends the statement. `ksplc fmt` drops it |
| a `;` right after the `}` of a block written on one line, where that block ends its statement (`if c { f() }; g()`) | a second way of writing that end, which the `}` already made. A block inside a value (`x: = f() catch { 0 }; g(x)`) ends no statement, and its `;` stays |

The language rules are "2.3 Literals" and "6.8 Integer arithmetic: folding, overflow, division, shifts" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md), and for `#export`, "11.3 Exposing a KSPL function to C (`#export`)" in the same document.

## 2. The list of warnings (W)

### [W0101] An out-of-bounds array access
A constant index on a fixed-length array lies outside it: past its end (`a[5]` on an `I32[3]`) or below 0 (`a[-1]`).
* **Fix**: correct the index, or it panics (stops the program with a message) at run time.

### [W0102] A side effect lost in an array length
An array's `.len` is evaluated at compile time, so its subject expression never runs. A side effect there (a function call, say) is discarded.
* **Fix**: move the side effect into its own statement, keep its result in a variable, and take `.len` from that.

### [W0103] A digit-accumulating loop with no ceiling check
A loop builds a number digit by digit and never checks that it stays under a limit, so a long input overflows it. The warning fires where a `for` accumulates in one of these two patterns, and no `if` in that loop tests the accumulated variable (a ceiling check):
1. `x = x * <an integer literal> + <an expression>` (on signed integers)
2. `x *= <an expression>` (a compound multiplication; on unsigned integers and `Sz` as well)
* **Fix**: compare the variable against the permitted ceiling around the accumulation, and treat exceeding it as an error (see `parse_number` in `std/json.kspl` and `content_length` in `std/jsonrpc.kspl`).

### [W0104] A pointer from an arena handed to a free
Memory from an arena (a block that hands out pieces and is freed all at once) is freed piece by piece. A pointer from `arena.alloc()` / `arena.alloc_as<|T|>()` / `arena.create<|T|>()` is passed to `mem.dealloc()` (the free function that releases a byte run).
* **Only the free function counts**: the method form (`x.free()`), which releases `x`'s contents rather than `x`'s address, is not reported.
* **Only a binding that is never reassigned is tracked** (a `$p` reassigned to another allocation is not).
* The verdict goes by the receiver's type (`std.mem.Arena` itself), so another type with a method of the same name is not caught.
* **Fix**: do not free arena memory piece by piece. Free the whole arena with `arena.free()`, or roll back with `arena.save()` / `arena.restore()` to discard part of it early.

### [W0105] A borrow used outside the lock
A value protected by a lock is reached outside the lock. `thread.Mutex<|T|>.lock()` returns a mutable pointer (a borrow) to the protected value. The borrow is either:
* (A) used after the matching `unlock()` (access without the lock, a data race: two threads can change the value at once), or
* (B) `return`ed to the caller.

It walks one function's straight-line code. A user-defined guard type of the same shape is caught too, and a simple alias (`q: = p;`) inherits the tracking. The tracking stops at a branch, a loop or a nested block, so it catches the typical mistake rather than guaranteeing soundness.
* **Fix**: for (A), use the borrow before the `unlock()`, or `lock()` again just before the use. For (B), copy out the value needed while holding the lock, and return the copy.

### [W0106] A lock taken and not released
After `thread.Mutex<|T|>.lock()`, neither an `unlock()` nor a `defer` releasing it is found before the scope is left. Another thread waiting for the lock then waits forever. It uses [W0105]'s straight-line walk, with the same limits. A registered `defer g.unlock()` releases on every exit, so it is not reported.
* **Fix**: call `g.unlock()` when done, or, more safely, `defer g.unlock()` right after locking, which releases on every exit, `return`, `throw` and `break` included.

### [W0107] A method that frees outside a release contract
A method frees its object, but the compiler cannot tell, so using the object afterwards goes unreported. The use-after-free check reads "freed" only when the receiver's type conforms to `Manual_free` or `Drop` and the method called is `free`. So a `pub` method that frees its receiver outside that contract lets `x.close(); x.read();` compile with zero diagnostics. It is reported where the name differs (one of `close` / `destroy` / `deinit` / `dispose` / `shutdown` / `delete` / `teardown`), or where it does not conform (the name is `free`, but the type has no `impl X: Manual_free {}`).
* **Fix**: where it frees, name it `free` and add `impl X: Manual_free {}`. `Manual_free`'s `free` returns no failure, so move a clean-up whose result must be checked (a flush, say) into a separate method. An operation that does not free the receiver, or that takes an argument (`delete(key)`), is out of scope.

### [W0108] A bit operation's operand is compared without brackets
The result of `&` / `|` / `^` is compared without brackets, as in `a & b == c`. KSPL binds all three more tightly than comparison, so it reads `(a & b) == c`. **C reads it the other way** (`a & (b == c)`), and neither the types nor a run-time check catch it. Where each operator stands is the table in "6.1 The operator list and precedence" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#61-the-operator-list-and-precedence).
* **Fix**: bracket the intended grouping (`(a & b) == c`). [H0301]'s "unneeded brackets" does not look at binary operations, so both can be followed.

### [W0109] An early exit before the `defer` that frees a `Manual_free` value
A value that must be freed can leave the function before its `defer` is reached, so it leaks. The `defer` is the statement that frees it at the end of the block. A `!`, `return`, `throw`, or a `break` / `continue` out of the block stands between binding a value whose type conforms to `Manual_free` and the `defer name.free()` later in the same block. That path leaves before the `defer` is registered, so the value is never freed. The finding sits on the exit and names both lines.
Automatic owners receive no such warning: their cleanup already covers every exit.
* **Only a later `defer` in the same block starts the question.** A value freed by hand, passed on or kept has another shape. It is not read as a leak.
* **Not reported**:
  * a `return` that returns the value itself (the caller owns it then);
  * a statement freeing it by hand on the exiting path (`if bad { x.free(); return }`);
  * an exit inside a closure, which leaves only the closure.
* **Fix**: put the `defer` on the line right after the binding, so it runs on every exit. A type that allocates only on its first write (`Str_builder.new()`) leaks nothing on that path, but moving the `defer` up costs nothing there either.

### [W0201] Unreachable code
Code that never runs, because it follows a `return`, a `throw`, a `for` that never ends (no condition, and no `break` leaves it) or the like. What follows a labelled `switch`, `if` or block that a `break` to its label leaves is reachable, whatever its branches end in.
* **Fix**: delete it. A function returning a value needs no `return` after a `for` that never ends ("Loops" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#72-loops)).

### [W0202] An unused expression with no side effect
An expression is evaluated, but its result is not stored. It holds no side effect (a function call, an assignment), so it does nothing. Examples are a plain `1 + 1;` and a bare variable reference.

### [W0203] A meaningless self-assignment
A variable is assigned its own value, as in `a = a;`.

### [W0204] A meaningless comparison
A variable is compared with itself, as in `a == a` or `b <= b`, so the result is fixed.

### [W0205] A constant condition
An `if` or `for` condition is a boolean literal, as in `if true` / `if false` or `for true` / `for false`.
* **Fix**: drop the condition from `for true`, leaving a bare `for` that goes round until something leaves it, and delete `for false` (it never runs).

### [W0206] An unused private symbol
A `priv` function, struct or the like is never referred to within its file.
* **Fix**: delete it, or, where it is kept on purpose for later, start its name with `_`.
* **The scope is per file compiled or linted**: a `priv` in an imported file is not reported. An uninstantiated generic's helper can look unused in the library, though a caller elsewhere uses it. To check every file, lint each one as the entry point.

### [W0207] A local variable or parameter nobody reads
A local variable or a parameter is **never read**. Reading counts, not the name appearing. A fixed-length array's `.len` folds to a constant at translation time. So an `a: Sz[3] = ::{ 1, 2, 3 };` used only through `a.len` fires it: nobody reads the elements, only the folded value remains, and the array is dead.
* **Fix**: delete the variable, or, where a trait's constraint requires the parameter, start its name with `_` (`_x`) to ignore it explicitly. Where only the length is needed, declare a `const` rather than an array.

### [W0208] A variable assigned but never read
A value is assigned to a variable and never read afterwards.
* **Fix**: where it is deliberate, start the name with `_`.

### [W0209] A `//<` continuation that continues nothing
A `//<` line meant to continue a description has nothing to continue, so its text is shown nowhere. A line holding only a `//<` and its text continues the `//<` above it, as part of that declaration's summary. A run must be contiguous: a blank line or a plain `//` comment ends it. Where the line above has no `//<` (one of those stands between, or nothing is above), there is no run to join. The text then reaches neither the editor's hover nor the record. The mark is written and the sentence is not read. That is the "writable, and with no effect" shape that is refused.
* **Fix**: put the `//<` the run continues on the line above (behind the declaration or the member itself). Where the text is not that declaration's documentation, make it a plain `//` comment.

### [W0210] A `//<` anchor with nothing continuing it
A `//<` behind a declaration can carry no text and leave the whole description to the `//<` lines below it. This is the anchor shape defined in [2.1 of `SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#21-comments). Where no such line follows, the run is empty and the entry is published with no description. It mirrors [W0209]: there the sentence has no mark, here the mark has no sentence.
* **Fix**: write the description on `//<` lines under the mark, or behind the mark where it fits the line. Where there is really nothing to say, remove the `//<`.
* **It is reached by deleting**: remove the continuations and the anchor is left with nothing under it.

### [W0211] A name a comment points at leads nowhere
A comment names, in backticks, something the code does not hold, such as a method under its old name. A dotted name in backticks in a comment (`` `Map.entry_list` ``, `` `io.out()` ``) is read as the code beside the comment would read it. The head is resolved through the file's own declarations, its imports and the prelude, a parameter or local of the enclosing function first. Each later part is read as a member of the one before. Where the owner is found but lacks the member (a method renamed, a field moved, a function made a method), the pointer leads nowhere. A reader finds nothing, and a model believes the name exists.
* **Fix**: point at what exists.
  * Another file can add a method to the type while that file is not in the compilation. Tie such a method to its file (`` `List.order_by` in `std/seq` ``); the document check reads it instead (`make test-docref`).
  * Introduce a name another product owns as its own ("Python's `` `json.dumps` ``").
* **Not reported**:
  * a name whose head is a parameter or local of the enclosing function, or unknown to the file (a plain word);
  * a name introduced as another product's or tied to its file;
  * a name `#cfg` left out of this compilation but declared for another configuration;
  * a name holding anything but dotted parts and call brackets (`` `io.out().s("x")` `` is a code fragment).

  A name whose last part is a file extension and names nothing (`` `edit.kspl` ``) is read as a file.
* **The scope is the compilation's**: members are looked up across every file compiled together. So the lint gate, which compiles each entry point whole, sees what the editor's single document cannot.

### [W0212] A comment opening with `///` or `//!`, which is not read
A documentation comment written in another language's style is ignored by KSPL. A line comment opening with `///` (before a declaration or a field, or behind code) is the documentation marker of Rust, Swift, C#, Zig and Doxygen. In every one of them it describes the thing *after* it. `//!` is Rust's and Zig's marker for the thing it stands *inside* (at a file's head, the file). KSPL's marker is `//<`, behind the thing it describes. So neither reaches the editor's hover or the reference pages. Meanwhile, whoever wrote it believes the description took effect.
* **Fix**: move the sentence behind the thing it describes, on that thing's own line, as `//<` (`fn add(a: I32, b: I32): I32 //< adds two numbers`). A longer description runs on below in `//<` lines one step in. A `//!` saying what a file is for becomes the `//<` run before the file's first line of code, above the imports. A remark for whoever edits the code, rather than a description for its callers, is a plain `//`.
* **Not reported**:
  * four or more slashes (a banner, as in Rust);
  * a mark inside a string;
  * a shebang. The analysis reads its `#!` rewritten to `//`, so followed by its path it would read `///`.

### [W0213] A long `//<` summary, or one opening with a label
The summary is the first paragraph of a `//<` run: everything before the first `//<` carrying no text. It is what the editor's hover, the completion list and `ksplc doc` show, so it is **one line that says what the thing is**. A summary running over several lines crowds those places. One opening with `Caution:` or `Note:` tells the reader what to beware of before it says what the thing is.
* **Fix**: keep the first line and end the summary there with an empty `//<`. The rest runs on below it as the detail, which the six-line cap counts. Where the first line is a label, write a line above it saying what the thing is, then the empty `//<`.
* **Not reported**: a run whose summary is one line, however long the detail below the parting mark.

### [W0501] Conformance to a look-alike of a known trait
A type claims a trait that only looks like one the compiler treats specially, so the special treatment never happens. The `X` of `impl <type>: X` names a different declaration with the same name as a trait the compiler knows (`Ref_counted` / `Move_only` / `Manual_free` / `Drop`). The known traits are matched by FQN, the name with its full module path (`std.lang.Ref_counted` and so on). So conforming to the look-alike turns on none of ARC's `retain`/`release`, automatic cleanup, move checks or free tracking. **Nothing else reports this for these four.**
* **Fix**: to conform to the real trait, qualify it with `lang.`, as in `impl <type>: lang.Ref_counted` (the `std/lang` item in ["9. Files and import" in `../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#9-files-and-import)). Where the name serves an unrelated purpose, rename it, or silence this for that one file with `##lint(W0501 = off)`.

### [W0502] A local or parameter hiding an imported module
A local variable or parameter has the name an import line binds to a module (`import "std/io"` binds `io`, and `import "std/json" + { Value }` binds `json` beside `Value`). A module's members and a value's are both reached with `.`, so from the declaration to the end of its scope `io.out()` reads the local. It then fails as a missing member far from the cause. Where the local has a member of that name, it silently reads the wrong thing. It is a warning, not an error, because shadowing stays legal ("4.5 Scope and shadowing" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **Fix**: rename the local. The file can use the module only for names a selective import could bring (a type in signatures, `json.Value`). Then import those names instead (`import "std/json" { Value }`), so no module name is bound for a local to hide.
* **Not reported**:
  * a name no import line binds (a selective import without `+` binds only the names it lists);
  * the prelude's `lang`, which no line imports;
  * a name starting with `_`.

### [W0601] The use of an ARC-managed type
Off by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). ARC (automatic reference counting) has the compiler insert `retain()`/`release()` calls that count a value's owners. They run invisibly, a risk where execution timing must stay visible. It is reported where a local variable's or parameter's type is ARC-managed (conforms to `Ref_counted`). It is also reported where that type is a struct holding one as a value field at any depth.
* **Fix**: consider explicit ownership through an arena or `defer`. It is not there to forbid ARC: a deliberate exception can stay. To exclude one file while it is enabled, write `##lint(W0601 = off);`.

### [W0702] The use of a deprecated symbol
A function or type marked `#deprecated` is used.

## 3. The list of information diagnostics (I)

### [I0301] An unnecessary `::` cast
A `::` cast (KSPL's explicit type conversion) that the compiler would do anyway. It is one of these:
* a cast to the same type (`I32` to `I32`);
* a lossless numeric widening (`I8` to `I32`);
* a cast that only drops the write permission `$` (`U8$[]` to `U8[]`, `U8$@` to `U8@`).

* **Fix**: drop the `::`; the conversion happens without it (the implicit casts in "6.4 Type conversion (`::`) and implicit casts" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **The verdict is made against the expected type.** It is reported only where the surroundings fix the type (an argument, a return value, an annotated binding). It is not reported where the cast is what fixes the binding's type, as in `x: = U8[]::f();`.

### [I0302] A redundant boolean comparison
A comparison with a boolean literal, as in `is_open == true` or `is_valid != false`.
* **Fix**: evaluate it directly, as simply `is_open` or `!is_valid`.

### [I0303] A redundant logical operation
A logical operation with a boolean literal on one side, as in `a && true` or `b || false`.
* **Fix**: the result is always that of `a` or `b` itself, so drop the operation.

### [I0304] A redundant default case
A `switch` over an enum has a `default` clause although `case`s cover every variant.
* **Fix**: delete the `default`. Left in, it would hide a variant added later, which would go to it silently.

### [I0305] A redundant `return;`
A `return;` at the end of a `Void` function.
* **Fix**: KSPL supplies it implicitly; delete it.

### [I0306] A redundant continue
A `continue;` as the last statement of a loop body.
* **Fix**: the loop moves to the next iteration at its end anyway; delete it.

### [I0307] A meaningless empty block
An empty `stmt_block` (a block statement): a `defer {}`, an `if {}` with no `else`, an empty `else {}`, an empty `for { }` and so on. One check gives the fix that fits the context (`defer`/`if`/`else`/`for`).
* **Fix**: deleting it usually suffices. Where only the `if`'s `then` side is empty and the `else` does the work, invert the condition with `!` and fold the `else` body into the `then` side. An empty `for` can hang forever: add a body, or consider a break condition.

### [I0308] A redundant if-return
A branch that could return a boolean directly, as in `if cond { return true; } else { return false; }`.
* **Fix**: return the condition itself: `return cond;`.

### [I0309] An unnecessary explicit `$`
`.` (a field access or method call) dereferences a pointer receiver automatically (follows the pointer to the value), so an explicit `$` just before it is redundant (`(p$).field`, `p$.method()`). The `.` strips every level of a multiple pointer (`T@@` and the like).
* **Fix**: delete the `$` and let `.` dereference (`p.field`).

### [I0310] An import's `as` that changes no name
The `as io` of `import "std/io" as io` adds nothing: the bare `import "std/io"` derives the same alias from the path's last part. The two are entirely synonymous: two ways to write one thing.
* **Fix**: drop the `as`: `import "std/io"`. The `as` itself is kept for imports that change the name (`import "ksplc/base/ast" as base_ast`, or `import "std/strfmt" as _strfmt`, whose leading `_` lets it go unused). Confined to them, it leaves one spelling per import.

### [I0401] An unused import
Something an `import` brought in is never used in that file. It comes in two shapes with one fix: a whole file's alias (`import "path" as name`) or one symbol of a selective import (`import "path" { A, B }`, the selective import of `docs/SPEC-programming-language.md` §9).
* **The verdict covers that one file alone.** It rests only on whether the file writes the name, so a use inside a generic template never instantiated counts.
* An alias counts only at the head of a qualified name (`io.out()`, `ds.List`), not as a field (`p.io`) or a function (`io()`) spelled the same.
* An import an extension method's call needs ("An extension method requires the import" in [§9](../../docs/SPEC-programming-language.md)) counts as used. This holds for a method on a built-in type too (`import "std/str"` for `s.equals(...)`) and for a format specifier (`import "std/strfmt"` for `\{n:x\}`).
* **Fix**: delete the import. Where loading it is deliberate, mark it ignored: a `_` on the alias, or a `_` leading the local name for a selective one (`{ A as _a }` and the like).
  * A file can be imported only so that its conformances hold (`import "std/strfmt" as _strfmt` for the `fmt` each type's `\{x\}` reaches). The importing file writes nothing that uses it: the call is made inside `put`'s instantiation, which asks for no import. Give it the `_`.
  * A name inside a declaration `#cfg` dropped is not counted, since that build lacks the declaration. For a symbol used in only one of the builds, put the same `#cfg` on the import, **on the line directly before it**. Written on the same line, it is moved to its own line by `ksplc fmt` anyway.

```kspl
#cfg(freestanding)
import "std/sys" { panic }
```

### [I0402] A `pub` used only from inside its package
Off by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). A `pub` symbol is referred to only from inside its package, so it need not be public. **Only the entry file's package is examined**; another unit (`std/` and the like) is out of scope. A `struct`'s fields are never reported (they sit in another table); top-level declarations and an `impl`'s methods (named `Type.method`) are.
* **Fix**: remove the `pub`, leaving the visibility unset.
  * Caution: **Do not enable it on a unit handed out as a library.** It sees only the references in that compilation, so it calls a `pub` with no outside users yet unneeded, though that `pub` is the published API itself. Use it where the unit is closed, as for an executable.
  * A trait method's `pub` inherits the trait's own visibility, so removing it changes nothing (it need not be fixed even where reported).

### [I0501] Shadowing
An inner block scope redeclares a variable an outer scope already defines.
* **Fix**: shadowing is legal in KSPL. But to avoid declaring a new variable while meaning to update the outer one, prefer a different name (`inner_x`) wherever possible.

### [I0502] A naming-convention violation
An identifier breaks KSPL's standard naming conventions.
* **Fix**: rename it to follow these:

  | The kind of name | The convention |
  | :-- | :-- |
  | a type, a struct, an enum, a typedef | `Initial_upper_snake_case`: only the first letter is uppercase; all later letters are lowercase |
  | an explicit constant (`const`) | `UPPER_SNAKE_CASE`: all letters are uppercase |
  | an ordinary binding, a function, a method, a field, an enum variant | `snake_case`: all letters are lowercase |

### [I0601] An unnecessary mutability marker
A variable or parameter declared with the mutability marker `$` is never reassigned within its scope (Rust's `unused_mut`). A declaration that cannot take a `$`, such as a for-in loop's variable (`for x in collection { ... }`), is out of scope.
* **The criterion**: whether the value the name itself holds is rewritten (`is_reassigned` in `sema/flow/track.kspl`). A write that goes through a pointer or a slice to something else does not count.
* **Why a write can need no `$` before the name**: KSPL has two places to write `$`, and they allow different things. I0601 asks only about the first. The full rule is "4.2 The two axes of mutability" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#42-the-two-axes-of-mutability).

  | Where the `$` stands | Example | What it allows |
  | :-- | :-- | :-- |
  | Before the name | `$p: I32@ = a@` | Putting another value into `p` (`p = b@`) |
  | Inside the type | `p: I32$@ = a@` | Writing to what `p` points at (`p$ = 5`), while `p` itself stays fixed |

  So a write needs the `$` before the name only where it changes the value the name holds. A struct's fields and a fixed-length array's elements are part of that value. What a pointer points at, and a slice's elements, are not: they live elsewhere, and the type's `$` (`T$@`, `T$[]`) allows writing them.

  | The write | Is a `$` before the name needed | Why |
  | :-- | :-- | :-- |
  | `p = other;` | **yes** | The name is given another value |
  | `p.f = v` / `p$ = v`, `p` a pointer | no | What `p` points at changes, not `p`; `p`'s type `T$@` allows it |
  | `s[i] = v`, `s` a slice | no | An element changes, not `s`; `s`'s type `T$[]` allows it |
  | `v.f = v2`, `v` a struct held **by value** (not through a pointer) | **yes** | The field is part of `v`'s own value |
  | `s.ptr = p`, `s` a slice | **yes** | A slice's own value is its pointer and length (its descriptor), so this rewrites `s` itself |
  | `v.m()`, `v` held **by value** and `m` taking `Self$@` | **yes** | The method can rewrite `v`'s own value, as `v.f = v2` does |
  | `p.m()`, `p` a pointer or a slice | no | The method rewrites what `p` points at |
  | `v.m()`, `m` taking `Self@` or `Self` | no | The method only reads `v` |
  | `p$` / `s[i]` / `s[i].m()` read or called, `p` a pointer and `s` a slice | no | Nothing of the name's own value is written |
  | `a[i] = v`, `a` a **fixed-length array** (`I32[4]`) | **yes** | The elements are part of the array's own value |
  | `x@` (taking an address) | **yes** | `x@` is a pointer that can write (`T$@`) only when `x` has the `$`, so the `$` decides what the pointer can do |
  | `U8$[]::buf` (a writable slice made from the array `buf`) | **yes** | Without the `$`, `buf` becomes read-only memory in the generated C, and a write through the slice would hit it |
* **Fix**: remove the `$` (`$x: = ...` → `x: = ...`). Unmarked is immutable, so the type system then guarantees the variable is never reassigned.

### [I0602] Detecting a hand-made ownership struct
Off by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). Reported where a struct not conforming to `Ref_counted` holds a raw-pointer field and defines its own `free` method: hand-made ownership. Structs under `std/` are out of scope (ARC's own primitives, such as `Arena` and `List`, would make the advice circular).
* **Fix**: following `Rc<|T|>` / `Arc<|T|>`, consider conforming it to `Ref_counted` so that reference counting manages its lifetime ("8.4 Memory management" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).

### [I0701] Error propagation using '!' is recommended
A `catch` that only rethrows the caught error, as in `catch e { throw e; }`.
* **Fix**: replace the whole `catch` block with the `!` operator, which propagates the error (hands it to the caller) more safely and concisely.

## 4. The list of hints (H)

### [H0301] Unnecessary brackets
Brackets `()` that change nothing. They stand in one of two places:
* around the condition of an `if`, a `for`, a `switch` and the like;
* around the receiver of a postfix operator (`.`/`[`/`(`/`@`/`$`/`::`/`!`) that binds the same without them. Such a receiver is an identifier, a path, a literal, an existing postfix chain and so on (`(fc1_lora$).forward(x)`, `(r::U8).is_space()`).

* **Fix**: delete the brackets. Some expressions bind differently without them: a binary, unary or ternary operation, a `catch`, a `sizeof`, an upcast. They are out of scope, since there the brackets are needed.

### [H0302] A type written twice
A type written where the line, or the place the value goes, already says it. It has two shapes, each with its own message.

* **A local's annotation that its initializer already says.** The same type is written at the initializer's head. It is written as one of these:
  * a struct literal (`p: Point = Point::{ … }`);
  * a cast (`n: U8 = U8::v`);
  * an enum variant (`k: Kind = Kind.small`);
  * a call made through the type (`xs: List<|I32|> = List<|I32|>.new(arena)`).

  The annotation can also be `Bool` over `true` / `false`. Deleting it leaves the variable's type as it is. **Only a type the text shows is reported.** `count: Sz = items.len` is not reported: there the annotation is the one place a reader without hover sees the type.
* **An enum's type written at its variant where the place already gives it.** The places are the nine where the type name can be left out ("6.6.2 Where the type may be omitted" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)):
  1. the right side of a declaration with a written type (`const USUAL: Kind = Kind.small`);
  2. the right side of `=` (`held = Option<|I32|>.some(3)`);
  3. a direct argument of a call (`kinds.push(Kind.small)`, a call through a function value's too);
  4. a variant's payload (`.some(Kind.small)`);
  5. a struct literal's field (`Slot::{ .kind = Kind.small }`);
  6. an array literal's element (`::{ Kind.small, Kind.big(3) }`);
  7. what a `catch` stands in for (`sized(n) catch Kind.small`, or after `fallback`);
  8. the right side of `return` (`return Option<|I32|>.some(n)` in a function returning `I32?`);
  9. the right side of `throw` (`throw Fault.lost`).

  In each, either side of an `if … else` standing there counts too (`return Option<|I32|>.some(n) if ok else Option<|I32|>.none`). The variant's type is the one the place expects: a `T!E` function's `T` for a `return`, its `E` for a `throw`. So `.small` finds the same variant and the program does not change.
* **Fix**: delete the type the editor dims. That is the annotation (`p: = Point::{ … }`; a `const` loses its `:` with it, `const K = Kind.small`). Or it is the variant's type up to its `.` (`kinds.push(.small)`, `return .some(n)`, `throw .lost`, `catch .small`).
* **Not reported**:
  * an annotation doing work: a literal taking its type from it (`$i: Sz = 0`), a conversion it drives (`wide: I64 = small`), or a right side typed by it (`::{ … }`, `.small`);
  * another name for the type (`spot: Spot = Point::{ … }`, `Spot` a typedef);
  * a cast [I0301] calls unnecessary, which is left to [I0301]. Deleting both would leave the value's own type;
  * a call through a type inside a generic (`b: Box<|T|> = Box<|T|>.make(v)`).

  The compiler checks a generic's body once per instantiation (once per set of type arguments it is used with). An `impl` written for one instantiation alone (`impl Box<|I32|>`) can give `make` another return type there. So the annotation can repeat the type for one instantiation and be needed for another. The advice, however, is about the one line both share. The other shapes name their type in the text, which is the same for every instantiation. So they are reported, once per line however many instantiations check it.
* **Not reported at a variant**:
  * a declaration whose annotation is reported (`k: Kind = Kind.small` loses the annotation, so the line has one fix);
  * every place outside the nine, where the name stays.

  The places outside the nine are an inferred declaration (`k: = Kind.small`) and an argument a generic infers its type from (`same(Kind.small)`). They are also a comparison (`mode == Mode.on`), either side of an `if … else` standing outside the nine, and a compound assignment such as `+=`. A struct literal keeps its type at these places too (`return Point::{ … }`).

### [H0701] `T?` proposed for a raw pointer that can be null
A function returning a raw pointer (`T@`) can hand back null on some path, so a caller can forget to check for null. Three shapes are reported:
* `return null`;
* a `return` of an `if … else` with a `null` side (`return null if c else p`);
* a `return` of a local the function declares or assigns as `null` anywhere (a list's head kept null until the first push).

The last is not followed through the flow. So a local set to null and then filled on every path is reported too. It is on by default, whatever is being built ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). Out of scope:
* `std/mem` and `std/libc` (memory and C, whose contract is a raw null);
* a function with `#export`. That is the FFI boundary with C, where `T?` is not ABI-compatible: C cannot read its memory layout.

* **Not reported**:
  * a local whose address is lent (`fill(p@)`), since what is written through the address goes unseen;
  * a `return` after a call declared `#noreturn` in the same block, which is never reached. It is the `return` an internal-error stop still needs.
* **Fix**: return `T?` instead, as `.some(value)` / `.none`. The `switch`'s exhaustiveness check then stops callers from forgetting to handle the absent value.

### [H0801] A guard clause is recommended
An `if` block always leaves, so control never reaches the code after the `if` from it, and an `else` block follows. It leaves by one of these:
* a `return`, a `throw` or a `fallback`;
* a `break` or `continue` of a loop or of an enclosing label;
* a call declared not to return (`panic`);
* a `for` that never ends;
* an inner `if` or `switch` all of whose branches leave.

* **Not reported**: an `if` that a `break` to its own label leaves (`ui: if c`). `break ui` continues after the `if`, so without the `else` its body would run after the `break` as well, and a `break ui` inside the `else` would be left with no label.
* **Fix**: the code after the `if` already acts as the `else`. Remove the `else` to reduce the indentation, into the "reject first and leave" shape.

### [H0802] A wrap at a call inside an argument
A call is passed as an argument to another call, and the outer argument list wraps over several lines, tangling with the inner call's wrapping (`borrows.push(base_core.arena.create(Lock_borrow::{ .borrow = id.text,\n    .guard = g, ... }))`). **The inner call's own argument list must wrap too.** Where only the outer one wraps, the inner call stays on one line as a single argument and does not tangle. Only the argument list's own wrapping is judged (as with [H0804]), so a chained call at a method boundary is out of scope.
* **Fix**: move the inner call into a named temporary and pass that (`lb: = base_core.arena.create(Lock_borrow::{ ... }); borrows.push(lb);`).

### [H0803] A function exceeds 300 lines
A function or method exceeds 300 lines. The limit is defined in "Principle 3 - what is counted, and how" in [`../../docs/SPEC-gates.md`](../../docs/SPEC-gates.md).
* **Fix**: split it into small helpers by task.

### [H0804] A direct wrap of a multi-line call
The subject of a `switch` or `if` directly wraps a call whose argument list spans several lines (`switch x.foo(a, b,\n    c) case ...`). The wrapping tangles with the `switch`/`case` or the `if`'s condition and is hard to read. Out of scope: a chained call wrapping between the receiver and the method name (`x.method()\n    .chain()`), and a single struct literal as the argument.
* **Fix**: assign the call to a temporary and make that the subject (`result: = x.foo(a, b, c); switch result case ...`); the call itself can still wrap.
* It urges splitting for readability, not correctness, so it is a Hint, like H0802, which gives the same advice.

### [H0805] A function nests blocks past 8 levels
A function's blocks nest deeper than 8 levels. The limit is defined in "Principle 3 - what is counted, and how" in [`../../docs/SPEC-gates.md`](../../docs/SPEC-gates.md). The function body is level 0, so each `if`, `for`, `switch` case or bare block inside it opens one more. It is reported once per function, at the function, with the depth it reached.
* **Fix**: move the innermost part into a helper, or reject first and leave ([H0801]) so the rest needs no `else`.
