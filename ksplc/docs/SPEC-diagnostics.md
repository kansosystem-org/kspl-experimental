# The ksplc diagnostics specification

This document lists every diagnostic code `ksplc` reports, what each points at, and how to fix it. **`ksplc explain <code>` prints its sections.** How a code is switched on, off or promoted to an error, and the four weights, are "5. Static analysis and the linter (ksplc lint)" in [`SPEC-tools.md`](SPEC-tools.md).

---

## 1. Diagnostic codes, and the errors that have none

A diagnostic code's letter gives the weight ("5.2 The diagnostics' four weights" in [`SPEC-tools.md`](SPEC-tools.md#52-the-diagnostics-four-weights)), and each code is explained in [2](#2-the-list-of-warnings-w) / [3](#3-the-list-of-information-diagnostics-i) / [4](#4-the-list-of-hints-h).

**`ksplc explain <code>` prints that code's section** (the code in either case). **`ksplc explain` with no code lists every code**, one line each with its title, and marks the codes off by default. **Any other word is refused**, a code's start (`W`, `I03`) included. A compile or lint that printed a coded diagnostic names the command under its summary.

The terminal view omits parenthetical document references and Markdown link targets. It wraps prose, preserves code examples, and names this document once at the end.

**Eight shapes are errors with no code**, so no setting can silence them. An error has no section: its message explains itself.

| The shape | What goes wrong |
| :-- | :-- |
| a division or remainder by `0` | changes what runs |
| a bit shift by the left side's type width or more, or by a negative amount | changes what runs |
| an integer literal outside its range (`U8 = 300` and the like) | changes what runs |
| a line in the indentation notation whose column matches no block | the reader and the compiler would disagree. `ksplc fmt` rebuilds the columns from the tree, so no formatted source meets it |
| an `#export` on a `priv` | written but does nothing: `priv` makes the generated C `static`, so the exported name still links to nothing outside |
| a `;` at the end of a statement's line in the indentation notation | a second way of writing the line's end, which already ends the statement. `ksplc fmt` drops it |
| a `;` right after the `}` of a block written on one line, where that block ends its statement (`if c { f() }; g()`) | a second way of writing that end. A block inside a value (`x: = f() catch { 0 }; g(x)`) ends no statement, and its `;` stays |
| a method a trait requires, written in another block of the type than `impl T: Trait` (`'Arena: Manual_free' requires 'free'. Move 'fn free' (line 650) into this block`) | the conformance block no longer shows what meets the trait. The error names the line the method stands on now |

The language rules are "2.3 Literals" and "6.8 Integer arithmetic: folding, overflow, division, shifts" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md). For `#export` the rule is "11.3 Exposing a KSPL function to C (`#export`)", and for a trait's methods "5.3 Checking trait conformance", in the same document.

## 2. The list of warnings (W)

### [W0101] An out-of-bounds array access
A constant index lies outside a fixed-length array (`a[5]` on an `I32[3]`, or `a[-1]`).
* **Fix**: correct the index, or it panics at run time.

### [W0102] A side effect lost in an array length
An array's `.len` is evaluated at compile time, so its subject expression never runs, and a side effect there is discarded.
* **Fix**: move the side effect into its own statement, keep its result in a variable, and take `.len` from that.

### [W0103] A digit-accumulating loop with no ceiling check
A loop builds a number digit by digit and never checks a limit, so a long input overflows it. It fires where a `for` accumulates in one of these patterns, and no `if` in the loop tests the variable:
1. `x = x * <an integer literal> + <an expression>` (on signed integers)
2. `x *= <an expression>` (a compound multiplication; on unsigned integers and `Sz` as well)
* **Fix**: compare the variable against the permitted ceiling, and treat exceeding it as an error (see `parse_number` in `std/json.kspl` and `content_length` in `std/jsonrpc.kspl`).

### [W0104] A pointer from an arena handed to a free
A pointer from `arena.alloc()` / `arena.alloc_as<|T|>()` / `arena.create<|T|>()` is passed to `mem.dealloc()`. An arena's memory is freed all at once, not piece by piece.
* **Only the free function counts**: the method form (`x.free()`) releases `x`'s contents, and is not reported.
* **Only a binding that is never reassigned is tracked.**
* The verdict goes by the receiver's type (`std.mem.Arena` itself), so another type with a method of the same name is not caught.
* **Fix**: free the whole arena with `arena.free()`, or roll back with `arena.save()` / `arena.restore()` to discard part of it early.

### [W0105] A borrow used outside the lock
`thread.Mutex<|T|>.lock()` returns a mutable pointer (a borrow) to the protected value. The borrow is either:
* (A) used after the matching `unlock()` (a data race: two threads can change the value at once), or
* (B) `return`ed to the caller.

It walks one function's straight-line code, and stops at a branch, a loop or a nested block. A guard type of the same shape is caught too, and an alias (`q: = p;`) inherits the tracking.
* **Fix**: for (A), use the borrow before the `unlock()`, or `lock()` again just before the use. For (B), copy out the value needed while holding the lock, and return the copy.

### [W0106] A lock taken and not released
After `thread.Mutex<|T|>.lock()`, neither an `unlock()` nor a `defer` releasing it is found before the scope is left. Another thread waiting for the lock then waits forever. It uses [W0105]'s straight-line walk, with the same limits.
* **Fix**: call `g.unlock()` when done, or `defer g.unlock()` right after locking, which releases on every exit.

### [W0107] A method that frees outside a release contract
The use-after-free check reads "freed" only when the receiver's type conforms to `Manual_free` and the method called is `free`. So a `pub` method that frees its receiver otherwise lets `x.close(); x.read();` compile silently. It is reported where the name differs (`close` / `destroy` / `deinit` / `dispose` / `shutdown` / `delete` / `teardown`). It is also reported where the name is `free` but the type has no `impl X: Manual_free {}`.
* **Fix**: name it `free` and add `impl X: Manual_free {}`. That `free` returns no failure, so a clean-up whose result must be checked (a flush) goes in a separate method. An operation that frees no receiver, or takes an argument (`delete(key)`), is out of scope.

### [W0108] A bit operation's operand is compared without brackets
The result of `&` / `|` / `^` is compared without brackets, as in `a & b == c`. KSPL reads it `(a & b) == c`. **C reads it the other way** (`a & (b == c)`), and neither the types nor a run-time check catch it. The precedence table is "6.1 The operator list and precedence" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#61-the-operator-list-and-precedence).
* **Fix**: bracket the intended grouping (`(a & b) == c`). [H0301] does not look at binary operations, so both can be followed.

### [W0109] A value made here that some path leaves unfreed
A value whose type conforms to `Manual_free` is made here (its initializer is a call or a struct literal), and some path leaks it. It is ended where it is freed, or handed on: returned, thrown, stored whole, passed by value, `take()`, `keep()`, or to a call that always frees it. Three shapes are reported:
* **It is never freed** before its block ends. The finding sits on the declaration.
* **It is not freed on every path.** The finding sits on the declaration.
* **A way out leaves before it is ended**: a `!`, `return`, `throw`, or a `break` / `continue` out of its block. The finding sits on the way out. Where a later `defer` in the block frees it, the message names that line.

A pointer to such a value (`Arena(…)`'s result) is read only up to a `defer` later in its block that frees it. A call does not say whether a pointer it returns owns what it points at (`arena.create(…)`).
* **Not reported**:
  * a value declared with `defer` in front, which its block's end frees;
  * a parameter, which the caller made;
  * a value whose initializer passes an arena other than the literal `null` (`List<|I32|>(arena)`): the arena frees it;
  * a value that keeps its arena in a field (a `List`, a `Map`, a `json.Doc`), made by a call that passes no literal `null`;
  * an arena held by value, which stands over a buffer its caller owns (`Arena.from_buffer`);
  * an element read out of a container that holds such values (`rows.get(i)`);
  * an exit inside a closure, which leaves only the closure;
  * in a generic body, a value whose type is a type argument itself (`v: T`): in one instance it can be an `I32`.
* **A generic body is checked in each instance the program uses.** A finding is printed once, at the line written.
* **Not seen**: a field or a value reached through a pointer, a generic body no instance uses, or an arena variable `null` at run time.
* **Fix**: put `defer` in front of the declaration (`defer $b: = Str_builder()`), which frees it on every way out. Where the value is handed on along some paths, free it by hand on the others.

### [W0201] Unreachable code
Code after a `return`, a `throw`, a `for` that never ends, a `#noreturn` call (`sys.exit`, `panic`) or the like. What follows a labelled `switch`, `if` or block that a `break` to its label leaves is reachable.
* **Fix**: delete it. A function returning a value needs no `return` after a `for` that never ends ("Loops" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#72-loops)), nor after a `#noreturn` call. A `catch` block ending in one needs no `fallback` ("8.3.2 Catching an error (`catch`)" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#832-catching-an-error-catch)).

### [W0202] An unused expression with no side effect
An expression's result is not stored, and it has no side effect (a call, an assignment), so it does nothing. Examples are `1 + 1;` and a bare variable reference.

### [W0203] A meaningless self-assignment
A variable is assigned its own value, as in `a = a;`.

### [W0204] A meaningless comparison
A variable is compared with itself, as in `a == a` or `b <= b`, so the result is fixed.

### [W0205] A constant condition
An `if` or `for` condition is a boolean literal, as in `if true` / `if false` or `for true` / `for false`.
* **Fix**: drop the condition from `for true`, leaving a bare `for`, and delete `for false` (it never runs).

### [W0206] An unused private symbol
A `priv` function, struct or the like is never referred to within its file.
* **Fix**: delete it, or, where it is kept on purpose for later, start its name with `_`.
* **Every file the compile reads is checked**, an imported one too. So a lint of one entry point finds a dead helper in any file it imports.
* **Not reported**:
  * a helper that only a generic's body names, although no caller instantiates the generic;
  * a method that a conformance (`impl T: Trait`) requires, called or not.
* **A `#cfg` leaves out what one build does not hold.** A helper that only a hosted function calls is unused in a freestanding build. Put the same `#cfg` on the helper.

### [W0207] A local variable or parameter nobody reads
A local variable or a parameter is **never read**. Reading counts, not the name appearing. A fixed-length array's `.len` folds to a constant at translation time. So an `a: Sz[3] = ::{ 1, 2, 3 };` used only through `a.len` fires it.
* **Fix**: delete the variable, or, where a trait's constraint requires the parameter, start its name with `_` (`_x`). Where only the length is needed, declare a `const` rather than an array.

### [W0208] A variable assigned but never read
A value is assigned to a variable and never read afterwards.
* **Fix**: where it is deliberate, start the name with `_`.

### [W0209] A `//<` continuation that continues nothing
A line holding only a `//<` and its text continues the `//<` above it, as part of that declaration's summary. A run must be contiguous: a blank line or a plain `//` comment ends it. Where no `//<` stands on the line above, there is no run to join. The text then reaches neither the editor's hover nor the record: a mark written with no effect.
* **Fix**: put the `//<` the run continues on the line above (behind the declaration or the member itself). Where the text is not that declaration's documentation, make it a plain `//` comment.

### [W0210] A `//<` anchor with nothing continuing it
A `//<` behind a declaration can carry no text and leave the description to the `//<` lines below it (the anchor shape in [2.1 of `SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#21-comments)). Where no such line follows, the entry is published with no description.
* **Fix**: write the description on `//<` lines under the mark, or behind the mark where it fits the line. Where there is nothing to say, remove the `//<`.
* **It is reached by deleting**: remove the continuations and the anchor is left with nothing under it.

### [W0211] A name a comment points at leads nowhere
A dotted name in backticks in a comment (`` `Map.entry_list` ``, `` `io.out()` ``) is read as the code beside it would read it. The head is resolved through the enclosing function's names, the file's declarations, its imports and the prelude. Each later part is a member of the one before. Where the owner lacks the member (a method renamed, say), a reader finds nothing, and a model believes the name exists.
* **Fix**: point at what exists.
  * A method another file adds to the type can be missing from the compilation. Tie such a method to its file (`` `List.order_by` in `std/seq` ``); `make test-docref` reads it instead.
  * Introduce a name another product owns as its own ("Python's `` `json.dumps` ``").
* **Not reported**:
  * a name whose head is a parameter or local of the enclosing function, or unknown to the file (a plain word);
  * a name introduced as another product's or tied to its file;
  * a name `#cfg` left out of this compilation but declared for another configuration;
  * a name holding anything but dotted parts and call brackets (`` `io.out().s("x")` `` is a code fragment).

  A name whose last part is a file extension and names nothing (`` `edit.kspl` ``) is read as a file.
* **The scope is the compilation's**: members are looked up across every file compiled together. So the lint gate sees what the editor's single document cannot.

### [W0212] A comment opening with `///` or `//!`, which is not read
`///` (other languages' marker for the thing *after* it) and `//!` (for the thing it stands *inside*) are plain comments in KSPL. KSPL's marker is `//<`, behind the thing it describes. So the text reaches neither the editor's hover nor the reference pages.
* **Fix**: move the sentence behind the thing it describes, as `//<` (`fn add(a: I32, b: I32): I32 //< adds two numbers`), continued below in `//<` lines one step in. A file's `//!` becomes the `//<` run above the imports. A remark for whoever edits the code is a plain `//`.
* **Not reported**:
  * four or more slashes (a banner, as in Rust);
  * a mark inside a string;
  * a shebang, whose `#!` the analysis reads rewritten to `//`.

### [W0213] A `//<` summary opening with a label
The summary, the first line of a `//<` run, is what the hover, the completion list and `ksplc doc` show. It is **one line that says what the thing is**, not a `Caution:` or `Note:`.
* **Fix**: write a line above the label saying what the thing is. The label then opens the detail.
* **Not reported**: a label further down the run, in the detail.

### [W0214] A test that no suite runs
A function named `test_…` stands in a file that only files with no suite import, so no suite runs it. A suite (`impl S: suite.Suite`) runs the tests of its own file and of the files it imports ("8.5 Tests: functions named `test_`, run by a suite" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **Fix**: import the test's file from the file that holds the suite, or move the test into a file that file imports.
* **Not reported**: a compile with no `main`. A file compiled alone is not the program that runs its tests.

### [W0501] Conformance to a look-alike of a known trait
The `X` of `impl <type>: X` names a different declaration with the same name as a trait the compiler knows (`Ref_counted` / `Move_only` / `Manual_free`). The known traits are matched by FQN (`std.lang.Ref_counted` and so on). So the look-alike turns on none of ARC, the move checks, free tracking or `defer` in front of a declaration. **Nothing else reports this for these three.**
* **Fix**: to conform to the real trait, qualify it with `lang.`, as in `impl <type>: lang.Ref_counted` (the `std/lang` item in ["9. Files and import" in `../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#9-files-and-import)). Where the name serves an unrelated purpose, rename it, or write `##lint(W0501 = off)` in that one file.

### [W0502] A local or parameter hiding an imported module
A local or parameter has the name an import line binds to a module (`import "std/io"` binds `io`, and `import "std/json" + { Value }` binds `json`). In its scope `io.out()` reads the local, and fails far from the cause or reads the wrong member. Shadowing stays legal ("4.5 Scope and shadowing" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **Fix**: rename the local. Where the file uses the module only for names a selective import could bring (`json.Value`), import those names instead (`import "std/json" { Value }`).
* **Not reported**:
  * a name no import line binds (a selective import without `+` binds only the names it lists);
  * the prelude's `lang`, which no line imports;
  * a name starting with `_`.

### [W0503] An uncalled function in a file of tests
A top-level function stands in a file of tests, nothing calls it, and its name does not start with `test_`. A suite finds a test by its name ("8.5 Tests: functions named `test_`, run by a suite" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)). So a misspelt test (`tset_sum`) never runs, and this is the one sign of it. A file of tests is the suite's own file, or a file it imports that holds a test.
* **Fix**: if it is a test, give it a name that starts with `test_`. Otherwise call it, or remove it.
* **Not reported**: a method, `main`, a name that starts with `_`, a function the compiler made, and a compile with no `main`.

### [W0601] The use of an ARC-managed type
Off by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). ARC (automatic reference counting) inserts `retain()`/`release()` calls that run invisibly, a risk where execution timing must stay visible. It is reported where a local's or parameter's type is ARC-managed (conforms to `Ref_counted`), or holds one as a value field at any depth.
* **Fix**: consider explicit ownership through an arena or `defer`. A deliberate exception can stay. To exclude one file while it is enabled, write `##lint(W0601 = off);`.

## 3. The list of information diagnostics (I)

### [I0301] An unnecessary `::` cast
A `::` cast that the compiler would do anyway:
* a cast to the same type (`I32` to `I32`);
* a lossless numeric widening (`I8` to `I32`);
* a cast that only drops the write permission `$` (`U8$[]` to `U8[]`, `U8$@` to `U8@`).

* **Fix**: drop the `::` (the implicit casts in "6.4 Type conversion (`::`) and implicit casts" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **The verdict is made against the expected type.** It is reported only where the surroundings fix the type (an argument, a return value, an annotated binding), not in `x: = U8[]::f();`.

### [I0302] A redundant boolean comparison
A comparison with a boolean literal, as in `is_open == true` or `is_valid != false`.
* **Fix**: write `is_open` or `!is_valid`.

### [I0303] A redundant logical operation
A logical operation with a boolean literal on one side, as in `a && true` or `b || false`.
* **Fix**: the result is always that of `a` or `b` itself, so drop the operation.

### [I0304] A redundant default case
A `switch` over an enum has a `default` clause although `case`s cover every variant.
* **Fix**: delete the `default`. Left in, it would silently take a variant added later.

### [I0305] A redundant `return;`
A `return;` at the end of a `Void` function.
* **Fix**: KSPL supplies it implicitly; delete it.

### [I0306] A redundant continue
A `continue;` as the last statement of a loop body.
* **Fix**: the loop moves to the next iteration anyway; delete it.

### [I0307] A meaningless empty block
An empty `stmt_block`: a `defer {}`, an `if {}` with no `else`, an empty `else {}`, an empty `for { }` and so on. The fix given fits the context.
* **Fix**: deleting it usually suffices. Where only the `if`'s `then` side is empty, invert the condition with `!` and fold the `else` body into the `then` side. An empty `for` can hang forever: add a body or a break condition.

### [I0308] A redundant if-return
A branch that could return a boolean directly, as in `if cond { return true; } else { return false; }`.
* **Fix**: `return cond;`.

### [I0309] An unnecessary explicit `$`
`.` dereferences a pointer receiver automatically, so an explicit `$` just before it is redundant (`(p$).field`, `p$.method()`). The `.` strips every level of a multiple pointer (`T@@` and the like).
* **Fix**: delete the `$` (`p.field`).

### [I0310] An import's `as` that changes no name
The `as io` of `import "std/io" as io` adds nothing: the bare `import "std/io"` derives the same alias from the path's last part.
* **Fix**: drop the `as`. It stays for imports that change the name (`import "ksplc/base/ast" as base_ast`, or `import "std/strfmt" as _strfmt`), so each import has one spelling.

### [I0312] A `lang.` that changes no name
A name is written after `lang.`, but the file can write it alone and mean the same declaration. `std/lang` enters every file: its alias `lang`, and each name it publishes with `pub` ("9.2 Which names an import brings in" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **Fix**: drop the `lang.`.
* **Not reported**, since there the bare name is blocked:
  * a name the file declares itself, or a written import brings in (`lang.Ref_counted` beside a `Ref_counted` of your own);
  * a name a parameter or a local of the enclosing function takes;
  * a declaration of `std/lang` without `pub`, which only `lang.` reaches.

### [I0313] A payload that nothing reads
A `case` binds a variant's payload, but reads none of the names it binds (`case .add(_a, _b)`). A name starting with `_` is reported too: to a reader it looks like an extraction. The rule is "Write the payload only when it is needed" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md).
* **Fix**: write the variant alone (`case .add`). The switch still checks that every variant is handled. Variants with payloads of different shapes fold into one `case` with commas.
* **Not reported**:
  * a payload one of whose names is read (`case .size(axis, _n)`);
  * a payload holding a value it matches;
  * the binding the compiler writes for `if v: = …` and for a `for` loop, which [W0207] reports where nothing reads it.

  [W0207] does not report a name of a payload this reports.

### [I0314] A counting loop written in three parts
A C-style loop only counts (`for $i: = 0; i < xs.len; i += 1`): a constant start, `i < bound`, `i += 1`. Its body writes neither the index nor anything the bound reads. Counting is written with `for … in` over a `Range` or over the sequence ("7.2 Loops" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md)).
* **Fix**: the message names the form to write.
  * Where the body reads the index only as `xs[i]` or `xs.get(i)`, and the bound is `xs.len`: `for x in xs`, and `x` for the element.
  * From 0: `for i in Range.asc(bound)`.
  * From another constant: `for i in Range(start, bound, 1)`.

  The index of a `Range` is an `Sz`; cast it where the body needs another type (`I32::i`). An index the body never reads takes a leading `_` (`for _i in Range.asc(n)`).
* **Not reported**, since the three parts are then the only way to say it:
  * a body that may write the index or a variable the bound reads (an assignment, `x@`, a `Self$@` method, a hand-over as a pointer or slice). Writing an element of the measured sequence (`xs[k] = v`) does not count;
  * a bound that reads a global variable or calls a function;
  * a body holding a closure, whose captures are not followed;
  * a step other than `+= 1`, a comparison other than `<`, or a start that is not an integer literal;
  * an index typed other than `Sz` (`$i: I32 = 0`), or a bound that does not widen to `Sz` by itself (a `U32`, an `I64`).

  Where the check cannot tell, it says nothing.

### [I0401] An unused import
Something an `import` brought in is never used in that file: a whole file's alias (`import "path" as name`), or one symbol of a selective import (`import "path" { A, B }`, `docs/SPEC-programming-language.md` §9).
* **The verdict covers that one file alone**: whether the file writes the name. A use inside a generic template never instantiated counts.
* An alias counts only at the head of a qualified name (`io.out()`, `ds.List`), not as a field (`p.io`) or a function (`io()`) spelled the same.
* An import an extension method's call needs ("An extension method requires the import" in [§9](../../docs/SPEC-programming-language.md)) counts as used. This holds for a built-in type's method (`import "std/str"` for `s.equals(...)`) and a format specifier (`import "std/strfmt"` for `\{n:x\}`).
* **Fix**: delete the import. Where loading it is deliberate, mark it ignored with a `_` on the alias (`import "p" as _p`).
  * A file can be imported only so that its conformances hold (`import "std/strfmt" as _strfmt` for the `fmt` each type's `\{x\}` reaches). The call is made inside `put`'s instantiation, so give it the `_`.
  * A name inside a declaration `#cfg` dropped is not counted. For a symbol used in one build only, put the same `#cfg` on the import, **on the line directly before it** (`ksplc fmt` moves it there anyway).

```kspl
#cfg(freestanding)
import "std/sys" { panic }
```

### [I0402] A `pub` used only from inside its package
Off by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). A `pub` symbol is referred to only from inside its package, so it need not be public. **Only the entry file's package is examined.** Top-level declarations and an `impl`'s methods (`Type.method`) are reported; a `struct`'s fields never are.
* **Fix**: remove the `pub`.
  * Caution: **Do not enable it on a unit handed out as a library.** It sees only that compilation's references, so it would report the published API itself. Use it where the unit is closed, as for an executable.
  * A trait method's `pub` inherits the trait's visibility, so it need not be fixed even where reported.

### [I0501] Shadowing
An inner block scope redeclares a variable an outer scope already defines.
* **Fix**: shadowing is legal. To avoid declaring a new variable while meaning to update the outer one, prefer a different name (`inner_x`).

### [I0502] A naming-convention violation
An identifier breaks KSPL's standard naming conventions.
* **Fix**: rename it to follow these:

  | The kind of name | The convention |
  | :-- | :-- |
  | a type, a struct, an enum, a typedef | `Initial_upper_snake_case`: only the first letter is uppercase; all later letters are lowercase |
  | an explicit constant (`const`) | `UPPER_SNAKE_CASE`: all letters are uppercase |
  | an ordinary binding, a function, a method, a field, an enum variant | `snake_case`: all letters are lowercase |

### [I0503] A function of one enum outside its `impl`
A top-level function takes, as its first parameter, an enum declared in the same file, by value. It belongs in the enum's `impl`.
* **Fix**: move it into the enum's `impl` as a method that takes `Self` (`fn text(r: Self): U8[]`), and call it as `x.text()`.
* **Not reported**:
  * an enum of another file or package;
  * a pointer to the enum (`State@`), a slice of it, or the enum taken second;
  * a generic function, a function C calls (`#export`), and a method already in an `impl`.

### [I0601] An unnecessary mutability marker
A variable or parameter declared with the mutability marker `$` is never reassigned within its scope (Rust's `unused_mut`). A declaration that cannot take a `$`, such as a for-in loop's variable, is out of scope.
* **The criterion**: whether the value the name itself holds is rewritten (`is_reassigned` in `sema/flow/track.kspl`). A write through a pointer or a slice to something else does not count.
* **Why a write can need no `$` before the name**: the two places to write `$` allow different things ("4.2 The two axes of mutability" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md#42-the-two-axes-of-mutability)). I0601 asks only about the first.

  | Where the `$` stands | Example | What it allows |
  | :-- | :-- | :-- |
  | Before the name | `$p: I32@ = a@` | Putting another value into `p` (`p = b@`) |
  | Inside the type | `p: I32$@ = a@` | Writing to what `p` points at (`p$ = 5`), while `p` itself stays fixed |

  A struct's fields and a fixed-length array's elements are part of the name's value. What a pointer points at, and a slice's elements, are not; the type's `$` (`T$@`, `T$[]`) allows writing them.

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
* **Fix**: remove the `$` (`$x: = ...` → `x: = ...`). The type system then guarantees the variable is never reassigned.

### [I0701] Error propagation using '!' is recommended
A `catch` that only rethrows the caught error, as in `catch e { throw e; }`.
* **Fix**: replace the whole `catch` block with the `!` operator, which hands the error to the caller.

### [I0702] An arena parameter with a default
A parameter that takes an arena has a default (`a: Arena$@ = null`). A call that leaves it out does not show where it allocates, nor whether the caller owes a `free()`.
* **Fix**: remove the default. A caller that wants the global heap passes `null` (`List<|I32|>(null)`).
* The type is read as resolved, so an arena behind a typedef or a pointer (`Arena@`, `Arena$@`) is found.

### [I0801] A second plain `impl` block in one file
A file holds a second plain `impl` block (one naming no trait) for a type, which a reader who found the first misses. The information names the line of the first block.
* **Fix**: move the methods into the first block. A banner comment that headed a group can stay inside the block, above that group.
* **Not reported**:
  * a block that names a trait (`impl T: Trait`), which holds that trait's methods ("5.3 Checking trait conformance" in [`../../docs/SPEC-programming-language.md`](../../docs/SPEC-programming-language.md));
  * a block in another file than the first one;
  * a block for one instance of a generic type (`impl Box<|I32|>`) beside `impl<|T|> Box<|T|>`. Two blocks for the same instance, or two `impl<|T|> Box<|T|>`, are reported.

## 4. The list of hints (H)

### [H0301] Unnecessary brackets
Brackets `()` that change nothing, in one of two places:
* around the condition of an `if`, a `for`, a `switch` and the like;
* around the receiver of a postfix operator (`.`/`[`/`(`/`@`/`$`/`::`/`!`) that binds the same without them: an identifier, a path, a literal, a postfix chain (`(fc1_lora$).forward(x)`, `(r::U8).is_space()`).

* **Fix**: delete the brackets. A binary, unary or ternary operation, a `catch`, a `sizeof` or an upcast binds differently without them, and is out of scope.

### [H0302] A type written twice
A type written where the line, or the place the value goes, already says it. It has two shapes, each with its own message.

* **A local's annotation that its initializer already says** at its head, as one of these:
  * a struct literal (`p: Point = Point::{ … }`);
  * a cast (`n: U8 = U8::v`);
  * an enum variant (`k: Kind = Kind.small`);
  * a call made through the type (`xs: List<|I32|> = List<|I32|>(arena)`).

  The annotation can also be `Bool` over `true` / `false`. **Only a type the text shows is reported**, not `count: Sz = items.len`.
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

  Either side of an `if … else` standing there counts too. The variant's type is the one the place expects: a `T!E` function's `T` for a `return`, its `E` for a `throw`.
* **Fix**: delete the type the editor dims. That is the annotation (`p: = Point::{ … }`; a `const` loses its `:` with it, `const K = Kind.small`). Or it is the variant's type up to its `.` (`kinds.push(.small)`, `return .some(n)`, `throw .lost`, `catch .small`).
* **Not reported**:
  * an annotation doing work: a literal taking its type from it (`$i: Sz = 0`), a conversion it drives (`wide: I64 = small`), or a right side typed by it (`::{ … }`, `.small`);
  * another name for the type (`spot: Spot = Point::{ … }`, `Spot` a typedef);
  * a cast [I0301] calls unnecessary, which is left to [I0301];
  * a call through a type inside a generic (`b: Box<|T|> = Box<|T|>.make(v)`).

  An `impl Box<|I32|>` can give `make` another return type, so there the annotation can be needed.
* **Not reported at a variant**:
  * a declaration whose annotation is reported (`k: Kind = Kind.small` loses the annotation, so the line has one fix);
  * every place outside the nine, where the name stays.

  Outside the nine are, for example, `k: = Kind.small`, `same(Kind.small)` for a generic, `mode == Mode.on` and `+=`. A struct literal keeps its type there too.

### [H0303] A free written on the line after its declaration
`defer x.free()` is the statement right after the declaration of `x`, whose type conforms to `Manual_free`. `defer` in front of the declaration says the same in one line (`defer $x: = …`).
* **Not reported**: a `defer` that runs another cleanup (`unlock`, `wait`) or does more than the free, or one with a statement between it and the declaration.
* **Fix**: put `defer` in front of the declaration, and remove the `defer x.free()` line.

### [H0701] `T?` proposed for a raw pointer that can be null
A function returning a raw pointer (`T@`) can hand back null, so a caller can forget to check. Three shapes are reported:
* `return null`;
* a `return` of an `if … else` with a `null` side (`return null if c else p`);
* a `return` of a local the function declares or assigns as `null` anywhere.

The last is not followed through the flow. It is on by default ("5.3" in [`SPEC-tools.md`](SPEC-tools.md#53-enabling-disabling-or-promoting-a-diagnostic-to-an-error-lint----lint--ksplccfg)). Out of scope:
* `std/mem` and `std/libc` (memory and C, whose contract is a raw null);
* a function with `#export`, the FFI boundary, where C cannot read `T?`'s memory layout.

* **Not reported**:
  * a local whose address is lent (`fill(p@)`), since a write through the address goes unseen;
  * a `return` after a `#noreturn` call in the same block, which an internal-error stop still needs.
* **Fix**: return `T?` instead, as `.some(value)` / `.none`. The `switch`'s exhaustiveness check then makes callers handle the absent value.

### [H0801] A guard clause is recommended
An `if` block always leaves, and an `else` block follows. It leaves by one of these:
* a `return`, a `throw` or a `fallback`;
* a `break` or `continue` of a loop or of an enclosing label;
* a call declared not to return (`panic`);
* a `for` that never ends;
* an inner `if` or `switch` all of whose branches leave.

* **Not reported**: an `if` that a `break` to its own label leaves (`ui: if c`). Without the `else`, its body would run after `break ui` too.
* **Fix**: the code after the `if` already acts as the `else`. Remove the `else` to reduce the indentation ("reject first and leave").

### [H0802] A wrapping call inside an argument or a subject
A call whose argument list wraps over several lines stands where its wrap tangles with another wrap. A chain wrapping at a method boundary (`x.method()\n    .chain()`) is not judged. The two places:
* **An argument of another call whose argument list wraps too** (`borrows.push(base_core.arena.create(Lock_borrow::{ .borrow = id.text,\n    .guard = g, ... }))`).
* **The subject of a `switch` or an `if`** (`switch x.foo(a, b,\n    c) case ...`).
* **Fix**: move the call into a named temporary, and pass that or make it the subject (`lb: = base_core.arena.create(Lock_borrow::{ ... }); borrows.push(lb);`).

### [H0803] A function exceeds 300 lines
A function or method exceeds 300 lines. The limit is defined in "Principle 3 - what is counted, and how" in [`../../docs/SPEC-gates.md`](../../docs/SPEC-gates.md).
* **Fix**: split it into small helpers by task.

### [H0805] A function nests blocks past 8 levels
A function's blocks nest deeper than 8 levels. The limit is defined in "Principle 3 - what is counted, and how" in [`../../docs/SPEC-gates.md`](../../docs/SPEC-gates.md). The body is level 0, and each `if`, `for`, `switch` case or bare block opens one more. It is reported once per function, with the depth reached.
* **Fix**: move the innermost part into a helper, or reject first and leave ([H0801]).

### [H0806] A comment past its cap
A comment holds more lines before the next code line than its cap: 6, or 10 for a file's header ("Comment notation and limits" in [`../../docs/SPEC-plain-language.md`](../../docs/SPEC-plain-language.md)).
* **What counts**: every comment line up to the next line of code. **A blank line ends nothing.**
* **What does not count**:
  * the summary of a `//<` run, its first line with text;
  * a line a gate reads, such as `// EXPECT:` (an upper-case name of three letters or more, then a colon);
  * a line inside a string.
* **What ends a comment early**: a section divider (a comment whose text opens with `---` or `===`). An empty `//<` parts two paragraphs of a run's detail, and the count starts again after it.
* **The header**: the first comment past 6 lines before any declaration takes the cap of 10. An `import` line and a `#!` line are no declaration.
* **Fix**: shorten the comment, or move the background to its subject's design document and point at it.

### [H0807] A `//<` run below a `{}`
A `//<` run goes on below a line whose code ends in `{}` (`impl Row: Move_only {} //< …`), so it stands outside the declaration it describes. A declaration without braces (a field, a constant, a `typedef`) keeps its run below it, indented, and is not reported.
* **Fix**: open the braces, and put the `//<` lines between them.

### [H0808] A file's description below a banner
A file's `//<` run before its first line of code has another comment above it. A banner there pushes what the file is for off the reader's first screen. A `#!` line is not counted as a banner.
* **Fix**: move the `//<` run to the top of the file, and put the other comment below it.
