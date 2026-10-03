# The rationale behind Kanso's design

This document records **why Kanso is the way it is**. It answers "why is this different from other languages" and "why does this restriction exist". What the language *is* belongs to the specification, [`SPEC-language.md`](SPEC-language.md), which is all you need for the rules alone. Read this when two readings of the specification disagree, and before proposing a change to it.

What belongs to one folder, not to Kanso as a whole, stands in that folder. The compiler's internal design is [`ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md), and each standard-library file's is [`std/docs/DESIGN.md`](../std/docs/DESIGN.md).

## How to read this document

* **Each section is written decision → reason → what it gives up.** Reasons carry values.
* **This document holds only KSPL's decisions and their grounds**, not a survey of how other languages handle the same problems.
* **History is not written here** (Principle 7).
* **Numbering restarts in each chapter** (`9.2.1` is "chapter 9, section 2, item 1"), so inserting a section renumbers only that chapter.

| Band | Chapter | What it decides |
| :-- | :-- | :-- |
| | [Development Principles](#development-principles) | The eight that come first, in every folder |
| **The language**: what a program means | [1. Symbols and syntax](#1-symbols-and-syntax) | Why `@` and `$` are postfix, and why immutability is the default |
| | [2. The type system](#2-the-type-system) | How far inference reaches, where conversion applies, the rules slices and generics share, and why the size type is signed |
| | [3. Traits and markers](#3-traits-and-markers) | How a contract is carried, and when to use an attribute rather than a trait |
| | [4. Ownership and lifetime](#4-ownership-and-lifetime) | What is protected in a language with no borrow checker |
| | [5. Concurrency](#5-concurrency) | What the type system does not guarantee, and what stands in its place |
| | [6. Visibility](#6-visibility) | Closing the holes where `priv` does not reach |
| | [7. The boundary with C](#7-the-boundary-with-c) | Which types may cross, which of C's types cannot be written, where a binding names its library, and what standard output carries |
| | [8. Function values](#8-function-values) | Why capture is explicit and escape is forbidden |
| **The notation**: how a program is written down | [9. One notation per purpose](#9-one-notation-per-purpose) | Not carrying several means to the same end |
| | [10. The indentation notation (`.kspls`)](#10-the-indentation-notation-kspls) | Why a second notation is kept, and why its rules are what they are |
| | [11. How the source text is written](#11-how-the-source-text-is-written) | Names, reserved words, line ends, long literals, what a declaration says of itself, and where an enum's functions live |
| **The project**: how the documents, the packages and the build are arranged | [12. Documents](#12-documents) | What each kind of document is for, where it sits, how it points at the source, and how the tour is kept true |
| | [13. What crosses a package boundary](#13-what-crosses-a-package-boundary) | What is published, what is taken in, how a package is found, and how a page asks the local machine |
| | [14. Why one repository](#14-why-one-repository) | What splitting would cost, and what would have to happen first |
| | [15. The build and the gates](#15-the-build-and-the-gates) | Why only a shipped executable is optimized, where CI's time goes, what 'supported' rests on, and which toolchain builds the Windows executable |
| **The aim**: what the whole is for | [16. Models write it, and AI runs in it](#16-models-write-it-and-ai-runs-in-it) | Why a model can write and check KSPL, and why AI runs in it |

---

## Development Principles

These eight come first in every folder. Each chapter below applies them to one subject. [`ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md) applies them to **the compiler's implementation**, under "The Development Principles" and from "The design rules for the checks and the diagnostics" onward.

1. **The Zen of Subtraction**
   Cut a feature that makes the implementation unreasonably complex before taking it on, in a language's specification, a library's API or a tool's CLI, returning to a form that is explicit and predictable.
   * **"It would be handy" is not a reason to add.** Pass over an addition that cannot show its price (implementation, checks, documentation, future compatibility).
   * **A price, once shown, must also balance.** If the cost outweighs the convenience, do not take the feature on. Ask whether the cost is paid once or on every touch, whether the payer is the one who benefits, and who actually meets it.
   * **A cost paid for input that never occurs in practice does not balance.** Do not speed up pathological depths, digit counts or item counts, unless correctness changes. Then fix it, as under Principle 5.
   * **A feature whose balance has broken is a candidate for removal, even after it is implemented.** Being there already is no reason to stay. Review it once its use and upkeep can be seen.
   * Caution: When removing a feature, either show its replacement or withdraw the notation entirely and make it an error. Silently making it ineffective goes against Principle 5.
2. **Warning Zero**
   `ksplc` may print no warning, and neither may `clang`/`gcc` when building the generated C. Do not move on to the next piece of work while a warning remains.
3. **Keeping file size down and even**
   Split by feature into loosely coupled pieces. The upper limits are 1000 lines per file, 300 lines per function and 8 levels of block nesting. Do not mass-produce tiny files either; consider merging them. **Split because the reasons to read differ, not for the line count.** Cut on line count alone, neither file can be understood without the other. Nor does hitting the limit mean splitting then: an unrelated change drags the split along, and that day's fix and that day's split land in different places.
   * So decide where to split as the limit approaches, and **write the plan down before touching the file again** ("Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md)). How to choose the cut is "Choosing where to split a file" below.
   * The check is `make test-conventions`. Its counting, its exceptions and the C side are in [`SPEC-gates.md`](SPEC-gates.md), "What the convention checks count".
4. **Following DRY — one canonical source, copies tied together by a check**
   Eliminate duplicated processing and data. When adding a feature especially, do not add a field casually; first see whether an existing one can serve.
   * Caution: **If something must sit in two places, add the check that compares them in the same commit.** With an unchecked copy, a fix reaches only one side. Whoever fixed it cannot see this; someone else notices another day.
   * Shape the check so that its failure **names the file to fix**, as every "X matches" and "X agrees" in `make test-conventions` does.
5. **Do not leave anything "writable but ineffective"**
   Whatever is accepted must take effect: a language's grammar, attributes and modifiers; a tool's CLI options and configuration-file keys; a library's arguments. What can be written but does nothing **hides a latent bug**, because its writer believes it took effect. If it cannot be given an effect, withdraw the notation and make it an error.
   * The checking tools have the same hole. That a diagnostic fires, and that the firing becomes a pass/fail verdict, are fixed separately (`ksplc/docs/DESIGN.md` §11.6).
   * The convention checks (`make test-conventions`) have it too. **They are green when the repository is clean, and they stay green when a check is broken.** So each check shows that it can fire (how: "Showing that a check can fire" in [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md)).
6. **One means to one purpose**
   Do not make the same thing writable two ways (an alias for a CLI option, a synonymous API, a copy of the same decision).
   * **When adding, first confirm that no existing means suffices.** With two, the reader cannot tell which is canonical, and a fix made to one alone leaves them different.
   * Principle 4 (DRY) watches duplication in the implementation; this one watches it in **how a thing is written**. Copying one decision into two places breaks both.
7. **Documents and comments state only "how it is now"**
   This applies equally to source comments, README, DESIGN and SPEC.
   * **What to write**: decided facts; what breaks if the thing is not in this form; the traps the next person is likely to hit; the contract seen from outside (what the arguments mean, lifetimes, the order of calls).
   * **What not to write**: a work log or history; the process of investigation and discovery; rejected proposals; explanations of fixed bugs; phrasings that narrate experience in the past tense; records of counts, dates, or which attempt this was. History belongs in git commit messages only.
   * **The only exception is where "not having it" is itself the decision.** `§3.2.3 Markers not carried` and `§9.1 Notations not carried` stay, so that the same proposal does not come back again and again. They say only "it is absent" and "why it is absent", never when, by whom or how it was decided.
   * **Do not write figures that change on their own.** The test: does it move while nobody touches the repository? If so, it is stale the moment it is written, and nobody can see that it is. Where a figure is needed, write only the relation and the order of magnitude, and point at material holding the measurement and the procedure for retaking it.
   * A comment may run to 6 lines, and a file's opening header to 10. **A blank line does not start a new comment.** Every comment line before the next line of code counts, so splitting a block does not earn the cap twice. A section divider (a line opening with `---` or `===`) does start one: it marks that a new thing begins, and nobody can slip it in unseen. Longer background goes to DESIGN.md, under the same rules.
   * The check is `make test-conventions`. The forbidden phrasings and where measurements go are in [`SPEC-gates.md`](SPEC-gates.md), "What the convention checks count". How a trap is written is "A trap is written as why it is dangerous" in [`SPEC-documents.md`](SPEC-documents.md).
   * **Comments take 30% or less of the source as a whole.** The measure is `cmt%` on the `total (hand-written)` line that [`tools/repo_stat.kspls`](../tools/repo_stat.kspls) prints. The cap is on the whole, not on each file: a file with hard logic may run above it, and a plain one below. Room under the cap is no licence to write more. Keep what the code cannot say itself, said once and briefly, and cut what restates the code or rambles. No gate checks this; run the tool.
8. **A check that can only be half kept is not made a guarantee**
   Before the compiler or a tool forbids something, confirm that **no ordinary way of writing slips past it**. If one does, do not forbid it in the type system: a program could pass the check and still break, and its writer would trust it more for having passed. Half-protecting is worse than not protecting at all.
   * Failure (`T?E`), the absence of a value (`Option`) and being uninitialized cannot be slipped past, so the type system states them. Lifetime (who frees what, and when) and sharing (which threads may touch a value) can be, through raw pointers and top-level variables. Those are ordinary ways of writing, so the type system leaves them out (the grounds are in chapters 4 and 5). **What the type system does not state, the type's name does.** `Rc` (one thread), `Arc` (shareable), `Mutex<|T|>`, `Atomic_sz` and `Move_only` put the choice into the calling code. Instead of stopping misuse, make it legible.
   * Caution: **Do not let a check that sees only part of the picture be read as a guarantee.** The convention checks (`make test-conventions`) read literal text and miss some forms. So the rule states that a form which escapes is still a violation. Otherwise green is read as "the rule is being kept".

### Choosing where to split a file

**A file is split where the reasons to read it differ, and the cut goes where the least crosses it** (Principle 3). What follows holds in every package. A package's own limits, and the plan for each file near the cap, are in its README ("Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md)).

* **How much state crosses decides the cut.** A part that touches none of the other part's state, or only a value fixed before the work starts, moves out with its imports running one way. `ksplc/fmt/space.kspls` touches no part of `Formatter`, and `ksplc/fmt/style.kspls` takes only `Config`.
* **Moving a foundation down moves what it carries.** The types the moved state holds go with it. Left above, they make the two files import each other. That is why `ksplc/sema/session/state.kspls` holds `Generic_arg`, `Alias_info` and `Import_symbol_info` beside the state structs.
* **What both halves read stays with the lower one.** Moved up, it makes the lower file import the file that imports it. Open it from `priv` instead.
* **Count the names that really cross before opening any, and count call sites, not mentions.** A name opened from `priv` is open to the whole package. A name only the moved side calls stays `priv` there.
* **When only part of an `impl` moves, open the `impl` again in the new file.** An `impl` may add methods to a type declared in another file ("9.3 Adding a method to another file's type" in [`SPEC-language.md`](SPEC-language.md)), as `ksplc/base/ast_place.kspls` opens its own `impl Ast_node`. A caller of the moved methods imports the new file, and `make lint` refuses a missing import by name.
* **Two halves that call each other import each other.** Imports may run both ways inside one folder, as between `ksplc/gen/c/expr.kspls` and `ksplc/gen/c/expr_postfix.kspls`. The price is a cut that cannot be read from one side alone.
  * Caution: **Where a package keeps its imports running one way, an `impl` the original calls back cannot move alone.** Move the state it touches with it, so the imports still run one way.
* **Do not split a reader of text by the word order it matches.** A form that puts the name before the document and a form that puts it after are one reading. Kept in separate files, a fix to one leaves the other behind.
* **A band of a test suite goes to a support file, not to a suite of its own.** The Makefile registers each suite as one unit, so a new suite starts its own copy of whatever it drives, such as a language server. A support file takes what the suite holds as a parameter, so what it drives starts once.
* **A band is held together by its fixture, not by its entry point.** One source that exercises several readers stays one source. Split by entry point, it would be written twice.
* **After a cut, fix the documents that name what moved.** `make test-docref` checks that a named symbol is in the named file, so it fails even when only a call moved.

**What this way of splitting gives up**: a cut placed by what crosses can leave one file well under the cap and the other near it. The line count is not the goal (Principle 3).

---

## 1. Symbols and syntax

**The symbols were not chosen for looks.** Each is what is left once the ambiguous candidates are struck out.

### 1.1 Why taking an address and dereferencing are postfix

KSPL writes taking an address as `val@` and dereferencing as `ptr$`. Both are **postfix** (docs/SPEC-language.md §6.2), so the operations line up left to right, in the direction the data flows:

```kspls
val: = 100
ptr: I32@ = val@ // "of val, the address"
x: = ptr$ // "of ptr, what it points at"
z: = p$.x // "of what p points at, the field x" - straight through, left to right
```

C's prefix `&` / `*` has three well-known problems, and postfix keeps none of them:

1. **C's precedence is counter-intuitive**: `*p++` is `*(p++)`, and `*a.b` is `*(a.b)`. KSPL has no `++` / `--` (only `+= 1`), and its postfix operators apply left to right.
2. **C needs an extra operator**: `(*p).x` is cumbersome, so C added `->`. KSPL's `.` dereferences automatically, so `p.x` works on a value and a pointer alike.
3. **C's declarations mislead the reader**: the `b` in `int *a, b;` is not a pointer, and `int (*fp)(void)` reads from the inside out. Declaring and taking an address are prefix, member access infix. KSPL's expressions and types run one way: `val@` has the type `I32@`, both postfix.

**The grammar closes in one rule**: `.` `[]` `()` `@` `$` `?` all fit `expr_postfix = expr_primary ( … )*`. Parentheses are needed only to apply a postfix to the result of a binary operation (`(ptr + i)$`), where the meaning needs them anyway.

### 1.2 Why the symbols are `@` and `$`

A postfix operator appears directly after a complete expression, which is also where a binary operator appears. So its symbol must meet three conditions:

1. **It is not a binary operator.** If dereferencing were `p*`, the `*` in `a * b` could be "`a` dereferenced" or multiplication, and neither the parser nor the reader could tell. → `*` `&` `%` `^` `|` `+` `-` `/` `<` `>` are out.
2. **It has no compound assignment `X=`.** Dereferencing is most often an assignment target, `p$ = v`. With `^`, `p^ = v` (assigning through a dereference) and `p ^= v` (XOR assignment) would differ only by a space. → `!` (there is `!=`) is out too.
3. **It is not already taken.** `#` is attributes, `'` `"` `\` are characters and strings, `` ` `` sits badly with the surrounding tools, and `~` is prefix bitwise NOT.

Exactly two ASCII symbols pass. `@`, read as "at" (an address), takes the address, and `$`, the inverse, dereferences. Error propagation's `?` meets the same conditions (there is no `?=`), so it too can be postfix.

The one operator deliberately made **prefix** is the type cast `T::v`. Its left side is a *type*, which no reader mistakes for an expression. What it still costs the parser, and why `::` does not go to paths instead, is 1.2.3 below.

#### 1.2.1 Why directives are `##` and attributes are `#`

An attribute (`#inline` / `#cfg(flag)`) applies to what comes next, and a directive (`##error` / `##warning` / `##lint`) to what encloses it, the file. Both stand before their target, so **the number of `#`, not the position, fixes the scope**.

**Do not separate them with `!`.** Pairing `#!` against `#` costs twice:

* It reads like the negation in `#cfg(!flag)`, so `#!lint` is misread as "`#` with a negation attached".
* It overlaps the shebang (`#!/usr/bin/env -S ksplc run`), so the lexer must tell the two apart by lookahead. A wrong guess gives no diagnostic at all: the first line's directive becomes a line comment, and the writer has no clue.

`##` **cannot be read as an operator**: no prefix, infix or postfix `##` exists. `@` and `$`, all that §1.2's conditions leave, are spent. Counting `#`, the shebang test is only "does it start with `#!`, and is the next character `/`", which a directive never matches. So a silent failure cannot be written.

Caution: **Keep the symbol and the name one token** (`Attribute_prefix` / `Directive_prefix`), not a sequence of elements. The grammar's whitespace skipping also skips newlines and line comments. So a name on the line after a lone `#` would join it, while the reader reads that line as an expression. As one token under the capital-initial rule, the separated form does not exist in the syntax.

**Names are not written into the grammar.** It stops at `Directive_prefix "(" ... ")"`, and `directive_shape` in `ksplc/sema/decl/attrs.kspls` holds which names exist, as attributes manage with the single rule `( "#" attribute )+`.

Otherwise each new name would go in four places: the grammar rule, the `decl_top` alternatives, the AST kind and its name, and the normalization list. Missing one leaves a declaration writable but read by no stage.

Caution: **State the price honestly.** The arguments' shape differs per name: `##error` takes a foldable expression, `##lint` takes `CODE = level`. `=` is not an expression, so the grammar accepts both shapes for both names, and `check_directive` must reject the crossings. Without it, `##error(CODE = level)` loses its assertion, and `##lint(<expression>)` is accepted with no level setting in effect. That is a step back from "not writable is stronger", pinned down by `ksplc/tests/negative/directive_argument_shape.kspls`.

#### 1.2.2 Why type arguments are `<|…|>`

**Do not go back to angle brackets for familiarity.** `<` is also a comparison, so `a < b` and `Vec<T>` share their first character, and stay ambiguous until the rest is read. `<|` splits them at the second character. `a < b` is a comparison because `|` does not follow `<`, and `Vec<|T|>` is type arguments once `<|` is seen, with no backtracking or context.

**Angle brackets make someone else pay**: a special case in the lexer or the grammar. Every language that chose them pays, in the notation, the grammar or the implementation. KSPL pays one character in the writing and holds no special case.

Note: `type_args` in `ksplc/kspl.kspeg` fails at once unless it sees `"<|"`, so trying it at every identifier costs almost nothing. With angle brackets it would read a whole type-argument list there and discard it.

**The price is unfamiliarity.** Anyone arriving from another language writes it wrong once, while the ambiguity would be paid every time it is written.

#### 1.2.3 Why `::` stays the cast, and what the cast costs to parse

**The parser still pays for the prefix cast.** A type and a value begin alike (`Arena` can be either). So at every operand the parser tries `type_expr "::"` and backs out, and does the same for the type in front of a literal (`T::{ … }`). Few of those operands are casts. Taking the forms out of the grammar gives, on files that hold neither (the PEG parse alone, built at `-O2`; `ksplc --stats` counts the rule calls):

| Taken out of the grammar | Rule calls | Parse time |
| :-- | :-- | :-- |
| The cast, and the type in front of a literal | about a fifth fewer | about a fifth less |
| The cast alone | under a tenth fewer | within the noise |
| The type in front of a literal alone | a few percent fewer | within the noise |

Guards gain little. A lookahead before both tries cuts the calls, and the time, by a few percent at most. First-token guards cut more calls and no time: the calls they save are cheap.

**Giving `::` to paths would not buy this back.** The cost is the attempt at an operand's head, not the separator, and no product has measured a separator costing parse time. Nor would a second mark buy more than Rust's split of the namespaces, since type arguments that open with `<|` need no turbofish. A cast moved elsewhere still needs a mark, and every mark costs somewhere.

**The parse time is saved in the memo table instead.** One table serves every file of a run, emptied by a generation stamp and sized from one slot per byte ([`../kspeg/memo.kspls`](../kspeg/memo.kspls)). It takes clearly fewer instructions and less time than a table zeroed per file, saving more than taking the cast out would, with no change to the language. Parsing dominates a cold self-compile, and takes milliseconds once the syntax-tree cache is warm.

**What keeping `::` costs the writer, and the answer**: a Rust or C++ writer's `Arena::new(1024)`, read as a cast, gives three errors, none naming the fix. So where `T` is a module, or a type holding `name`, and `name` is nothing in scope, `T::name` is read as the path meant. It is reported as one error naming `Arena.new`. A cast of a value in scope (`I32::count`) is left alone.

**The one weakness of `.` everywhere** is that a local named like an imported module hides the module: below `io: = 5`, `io.out()` reads the local. Such a local or parameter is a warning at its declaration (`[W0505]` in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)), not an error, since shadowing stays legal ("4.5 Scope and shadowing" in [`SPEC-language.md`](SPEC-language.md)). A second separator for modules (Swift 6.3's `Module::name`) would collide with the cast. `json::Val` and `Sz::n` have one shape, and only name resolution could tell them apart.

### 1.3 Why immutability is the default

KSPL makes **immutability the default** and puts `$` only where rewriting is allowed (docs/SPEC-language.md §4.2):

1. **A marker goes on the minority side.** In this repository most local declarations and parameters are immutable (to recount, grep a tree that `ksplc lint` passes). Marking them would waste much.
2. **Writing shows up in the type.** With mutability the default, the source does not say what can be written, and nobody notices a write through a pointer that slips past the checks.
3. **It matches what readers expect and where other languages are heading.** `$` reads as "variable" from Perl and the shells. Rust's `&mut` / `let mut`, Swift's `let` default and Kotlin's recommended `val` all mark the mutable side.

**The marker is the same `$` as dereferencing**, because only `@` and `$` pass §1.2's conditions; another symbol would only move the overloading. The two never meet. In an expression `$` appears only in `expr_postfix`. Its three marker positions are directly before a declaration's identifier, on a parameter, and directly before a type's postfix `@`/`[`. None can hold a dereference, so the grammar decides each uniquely, and neither the implementation nor the reader hesitates.

#### 1.3.1 Why the mutability marker on a type argument is prefix

A declaration's type argument takes the marker in front (`struct Slice<|$T|>`; the rule is `docs/SPEC-language.md`, 3.3), not behind (`Slice<|T$|>`):

1. **`$`'s position keeps its meaning.** The three marker positions of §1.3 are all prefix and all mean "mutable", while postfix `$` is dereferencing in expressions.
2. **Postfix requires lookahead.** A `$` inside a type starts `$[` or `$@` (`Box<|I32$|>` is rejected with `expected '[' or '@'`). Admitting `T$` makes what follows `$` one of three things: `[`, `@`, or the end of the type. A type argument can also be an expression (`type_arg = type_expr | expr`; `<|4|>` and `<|bound|>` are in actual use), where a postfix `$` would overlap `p$`.
3. **Postfix is unreadable when nested.** `U8$[]$[]` would become `Slice<|Slice<|U8$|>$|>`, with the `$` wedged between closing brackets and no telling which level it belongs to. Prefix gives `Slice<|$Slice<|$U8|>|>`, with the marker directly before what it modifies.

**The desugaring moves the marker** from the constructor (`$[]` in `U8$[]`) to the type argument, because the type system carries immutability on the element type (`U8[]` is `make_slice(make_const(U8))`). The move is unavoidable, so the only question is how to write a modifier on a type. Other languages likewise write modifiers in front (`const T` / `&mut T`) and constructors behind (`T*` / `T&`).

**The declaration states whether it accepts the marker** (`struct Slice<|$T|> { … }`). So a `List<|$U8|>` against a type that does not declare it is a type error, not a lint found after the fact.

---

## 2. The type system

**One rule runs through this chapter: a type says what it is, and nothing is inferred that a reader would have to guess at.**

### 2.1 Why type inference is limited to local variables

Top-level declarations (`const`, variables, `extern` variables) must carry a type annotation, and only local variables are inferred (docs/SPEC-language.md §4.1), because:

1. **It follows an existing line.** Parameters, return values, `struct` fields and enum payloads all state their type. A top-level declaration is the file's interface, not a local variable. So requiring the annotation joins existing policy and adds no restriction.
2. **Inferring it would bring in a new failure mode.** Inference runs in declaration order, so a function body before a global would see a stale type. Avoiding that needs a pass typing every global before any function body. Globals depend on one another (`pub const b = a * 2;`), so it also needs resolution in dependency order and cycle detection. That is the ground of C++'s static initialization order problem.
3. **It does not balance.** It saves one type name, and gains only brevity.

**What is given up**: omitting a type name at the top level.

#### 2.1.1 A type is redundant only where it is written twice

**A local's annotation is reported as redundant only where its initializer already says the type.** That is the same type written at the initializer's head (`p: Point = Point::{ … }`, `n: U8 = U8::v`, `k: Kind = Kind.small`, `xs: List<|I32|> = List<|I32|>.new(arena)`), or `Bool` over `true` / `false`. It is [H0312], a hint on by default, so the tree holds none (its section is in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

* **Inferable is not redundant.** In `count: Sz = items.len` the annotation is the one place the type stands in the text. A model reads the text and cannot hover (§12.4 below). A person in KSPL's editor sees it only by hovering. So removing every inferable type would take it from the readers least able to recover it.
* **Deleting it keeps the type.** An annotation doing work is not reported: a literal takes its type from it (`$i: Sz = 0` would be `I32`), a conversion follows it (`wide: I64 = small`), and `::{ … }` or `.small` are typed by it. Nor is a cast that [I0301] calls unnecessary, since deleting both would leave the value's own type.
* **The verdict holds for every type argument.** The check compares what is written, so a generic's line reads the same in each instantiation. A call is the exception: its type is its callee's, which an impl for one instance can change, so a call inside a generic is left alone.

**What is given up**: leaving out every type that could be left out. `count: Sz = items.len` stays, and so does an annotation written from habit.

### 2.2 Why implicit conversion stops at what loses nothing

The permitted range is in [`docs/SPEC-language.md`, 6.4](SPEC-language.md).

Rust and Swift allow no implicit numeric conversion, though both keep reference coercions implicit (`&mut T` → `&T`, Deref coercion). Rust has not accepted proposals to make widening implicit. Chiefly, a mixed-width expression (`Foo(x * (y + z))`) **computes at the narrow width and then widens**, which hides the overflow.

**That reason does not apply to KSPL.** The expected type propagates down through the operator, so a wider receiver widens before computing. For `a: I32 = 100000`, `f: I64 = a * a` gives 10000000000, and the generated C is `(I64)((U64)((I64)a) * (U64)((I64)a))`. Received as `I32`, the same expression computes narrow and overflows. So KSPL may leave lossless widening implicit.

**Between integers and reals it is forbidden both ways.** Java's implicit `int` → `float` rounds an integer beyond 24 bits, and a line at "only what loses nothing" cannot accept that.

#### 2.2.1 Conversion also applies inside a Result

When the expected type is `T?E`, the value is converted to the success type `T`, then wrapped.

```kspls
priv fn f(): Shape?Err
  p: = mem.alloc_as<|Sq|>()
  return p // the Sq$@ -> Shape upcast works inside a Result too
```

**Do not wrap only on an exact match.** Then no value needing conversion could pass under a Result, and `fn f(): Trait?Err` could only `throw`: its type writable, its success unreturnable (writable but ineffective). Diagnostics speak of the success type too: `return "str";` gives `expected 'I32'`, not `expected 'I32?E'`.

### 2.3 A slice is a std struct, and the rules for generics apply to it unchanged

#### 2.3.1 `T[]` is sugar for `Slice<|$T|>`

There is no built-in slice. `std/lang` declares `struct Slice<|$T|> { ptr: T$@; len: Sz; }`; `U8$[]` desugars to `Slice<|$U8|>`, and `U8[]` to `Slice<|U8|>`. `ksplc/parse/desugar.kspls` desugars **the type expression as written**, folding the postfixes from the left. So `U8$[][]` is an immutable-element slice of mutable-element slices; reverse the order and the markers swap. A postfix carrying a size (`[N]`) is a fixed-length array and is not folded.

**Diagnostics show the sugar** (`ksplc/sema/type/display.kspls`), not a type name the user never wrote, such as `std_lang_Slice_U8_Const`.

**Being a struct spares three special cases.** A descriptor literal (`::{ .ptr = …, .len = … }`) is an ordinary struct literal, the C type name is mangled like any other generic's, and the layout follows from the fields. An out-of-bounds index, too, stops through the one `bounds_panic` in `std/lang`.

#### 2.3.2 `impl<|T|> T$[]` is an ordinary generic impl

`T$[]` is sugar for `Slice<|$T|>`, so this is no different from adding a method to `List<|T|>` (docs/SPEC-language.md §9.3).

#### 2.3.3 Immutable and mutable instances share one C struct, but stay two KSPL types

`Slice<|$U8|>` passes where `Slice<|U8|>` is declared (docs/SPEC-language.md §3.3), yet **as KSPL types they stay two**. Immutability rides on the field's type, so the `p` of `Box<|$I32|>` is `I32$@` and that of `Box<|I32|>` is `I32@`. In C they are one struct, so the one step of weakening emits no cast. With a struct each, the generated C would refuse to pass one where the other is declared. How the C name drops the mark belongs to the compiler ("How immutability marks are expressed in a type" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

**The body is instantiated per instance**, so a write to the element inside the immutable version is rejected at translation time, not at run time.

#### 2.3.4 Making a single instantiation the target of an impl

`impl Slice<|U8|> { ... }` needs **no new notation**. An impl's target is a type expression: a template when it holds the impl's own type argument, and that one instance when it does not. The matching rules are docs/SPEC-language.md §9.3 (the check is `impl_target_rejects` in `ksplc/sema/decl/mono.kspls`).

**Overlap is rejected.** Otherwise the template's table would overwrite by name, keeping whichever impl was collected later (Principle 5). Swift's "the more specialized one wins" is not adopted: a reader cannot tell which one is in effect.

**The designs people complain about make you write the same thing a different way.** KSPL already has `impl<|T|> Box<|$T|>`, and a concrete target follows from the same rule.

### 2.4 A type argument with nothing to bind to is rejected

**A type argument is written where something binds it**: the receiver's instance, or the actual arguments at the call. Three positions have neither. Each is rejected where it stands, not passed on to a later stage as a name bound to nothing (Principle 5).

#### 2.4.1 A name on the impl that the receiver does not fix

`impl<|T, U|> List<|T|>` cannot be written (docs/SPEC-language.md §3.3): **the receiver's type does not determine `U`**, since `List<|I32|>` says nothing about it.

Caution: **It must not pass silently.** The grammar accepts it, so `collect_impl_decl` in `ksplc/sema/decl/collect.kspls` rejects it at the declaration.

**A method's own type arguments can be written** (`impl<|T|> List<|T|> { fn select<|U|>(…) }`). The call site binds `U`, and it has actual arguments.

```kspls
impl<|T|> Holder<|T|>
  fn to<|U|>(r: Self, u: U): Holder<|U|>
    …
h.to(true)          // U is determined from the actual argument
h.to<|Bool|>(true)  // may also be written
```

**Such a method is instantiated at the call site**, since the receiver's type arguments alone cannot instantiate it. It can be written because the method table is built when it is looked up. A table built along with the type would have nothing to fix `U` with. How the compiler finds and instantiates it is "Where the instantiation queue is drained" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

#### 2.4.2 A mutability marker on the impl, and a type argument at the call site

**The mutability marker takes effect only on the target side.** A `$` on the impl's own type argument (`impl<|$T|> Box<|T|>`) changes nothing. `apply_arg_mut_mark` reads the marker from the declaration that declared that position (the variance of `struct Box<|$T|>`). An impl's list only names what to bind, and the target type expression alone decides which instance the impl attaches to. Writable but ineffective, it is made unwritable (Principle 5). So, for the same reason, is a type argument written at the call site on a generic type's method.

Caution: **This is not only about the marker.** A method's type arguments belong to the enclosing `impl`, and the receiver's instance has already fixed them. A `q.get<|U8|>()` on a `Plain<|I32|>` value has nothing to bind to, and accepting it would discard it silently.

A method that declares **its own** type arguments (`fn m<|$T|>(…)`) can be written. It is instantiated from a template, so both the count and the markers can be matched.

**Rust and Swift reject it too.** The complaints there are about the notation, not the rule, so KSPL takes the same rule. It adds only the diagnostic's content: where the type argument came from, and where it should be written.

### 2.5 Inferring a generic's type arguments from the actual arguments is kept

**Keep writing `f(x)` and working `T` back from the actual argument's type; do not swing to "always require it explicitly".** Calls that omit the type argument outnumber those that write it by an order of magnitude, and most of them are `arena.create(x)`. Requiring it would mean writing nested generics such as `arena.create<|List<|U8[]|>|>(…)`. That costs clearly more than reading the type in the text gains. The design already infers what is determined and asks for the rest. Where `T` is the parameter's type itself (`Arena.create<|T|>(init_val: T)`), working back is unique; where `T` appears only in the return (`alloc_as<|T|>()`), it must be written. No cheap part is left to cut.

**The price is that instantiation comes after the arguments' inference.** Right after instantiating, the actual arguments must be checked again against the substituted parameter types ([ksplc/docs/DESIGN.md 11.5.1](../ksplc/docs/DESIGN.md#1151-a-generic-calls-arguments-are-checked-against-the-parameter-types-after-instantiation)). Skip that, and broken C comes out with zero diagnostics.

### 2.6 Generics also take translation-time constants as type arguments

A type argument may also be a translation-time constant, as in `Ring<|512|>` (what may be written is in [`docs/SPEC-language.md`, "3.3 Structs (`struct`)"](SPEC-language.md#33-structs-struct)).

**It is the only way to embed fixed-capacity memory in a type where no heap is available.** The declaration alone fixes the size of `struct Buf<|const n: Sz|> { data: U8[n]; }`. So it works where `alloc` cannot be called: in an interrupt handler, before the scheduler starts, right after a freestanding boot. With the value on the type, `% n` is also a constant in the generated C, so no software division is called, even on a target without hardware divide.

**Arithmetic cannot be written in the argument position**, because the notation as written is the canonical name. Naming by the folded value would turn `true` into `1` and land a `Bool` type argument on a different type. Write the arithmetic in the `const`'s definition: a `Foo<|n|>` given `const n: Sz = 4 * 2;` is the same type as `Foo<|8|>`. The array-length position (`T[rows * cols]`) creates no canonical name, so arithmetic is accepted there: the only place two positions treat the same value differently.

**A capacity on the type guarantees the memory's size only where the memory is embedded in the type.** Where it is passed separately (`std/ring.kspls`'s `Ring` receives the head address of a `U8[cap]`), a capacity that differs from the actual buffer goes unseen at translation time and writes out of bounds. A type argument protects only the index's wrapping; the memory's bounds are the caller's.

**What is given up:**

* **A separate body per value.** `Ring<|4|>` and `Ring<|8|>` are different types, so a type and its functions are emitted into the generated C once per value used.
* **The declaration-synthesizing features skip it.** `variant_name` is not synthesized for an `enum` carrying a const generic, because the type arguments' notation is not reconstructed ([`ksplc/docs/DESIGN.md`, "Synthesizing an `enum`'s `variant_name`"](../ksplc/docs/DESIGN.md#36-synthesizing-an-enums-variant_name)). Every new declaration-synthesizing feature needs the same exception.
* **No inference from the actual arguments (§2.5).** An actual argument's type cannot determine a value type variable. So the call site writes the type arguments of a declaration containing a const generic.

### 2.7 Whatever returns a view returns an immutable view

**If the input is immutable, so is the output.** Every slicing function in `std/str` returns an immutable view.

```kspls
pub fn sub(r: U8[], start: Sz, len: Sz): U8[]
pub fn sub_from(r: U8[], start: Sz): U8[]
pub fn split(r: U8[], delimiter: U8, ...): List<|U8[]|>
pub fn lines(r: U8[], ...): List<|U8[]|>
```

Caution: **Do not return a mutable view from an immutable input.** `U8$[]::{ .ptr = <immutable pointer> }` is a hole in immutability, through which the caller writes into a read-only region. Exactly one function writes into a slice: `sub_mut(r: U8$[], start, len): U8$[]`, which takes a mutable receiver. So no path leads from an immutable receiver to a mutable view.

Immutable accepts mutable, so widening a declaration toward the immutable side never breaks a caller.

#### 2.7.1 The clamping of a range is held in one place

**A function carving out a view must not assemble the descriptor itself.** `T$[]::{ .ptr = xs.ptr + s, .len = xs.len - s }` gives a negative length when `xs` is empty, and whoever trusts `len` advances without limit. Neither the type system nor the checks stop it. One place decides how many elements a range really holds: `sub_count(count, start, len)` (`std/lang`). Every slice's `sub` / `sub_from` / `sub_mut` (`std/chars`) and `std/ds`'s `List.sub` / `List.sub_from` go through it. It makes two decisions:

| What is inspected | What happens if it is dropped |
| :-- | :-- |
| The **lower** side of `start` | `Sz` is signed, so a negative `start` points before the beginning |
| **Not** comparing with `start + len` | An enormous `len` wraps the addition itself and slips past the clamp |

**Out of range returns empty; it does not panic.** Indexing (`xs[i]`) panics because the caller can compute the range from `len`. Slicing asks whether a range exists, and if it does not, empty is the answer.

**A slice being a struct whose immutability rides on its element type has two consequences inside the compiler**: how a descriptor literal's fields are checked, and why an immutable slice's `ptr` is not `const` in the generated C. Both belong to the compiler ("How immutability marks are expressed in a type" and "The output order of genc's type definitions is decided after the immutability marks are stripped" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

### 2.8 Where permission lives changes with whether it is owned

**A receiver's immutability speaks for its elements only in a container that owns the region.** A borrowed view does not own what it points at, so there the two are separate axes. So whether `a[i] = v` passes through a read-only receiver is decided by the receiver that the `Index_place` implementation declares (`index_stops_permission_walk` in `ksplc/sema/decl/access.kspls`; the rule is docs/SPEC-language.md §6.1.2):

| Container | What it declares | What speaks for permission |
| :-- | :-- | :-- |
| `Slice<\|$T\|>` | `at(r: Self@, …)` | The returned `T$@`: borrowed, holding only `ptr` and `len` |
| `Tensor<\|T\|>` | `at(r: Self@, …)` | The returned `T$@`: passed by value, sharing what `data` points at |
| `List<\|T\|>` | `at(r: Self$@, …)` | The receiver: it owns the region it allocated |

`Tensor` is on the borrowed side because ksai treats it so. `matmul_into` takes its output by value as `out: Tensor<|T|>` and writes into what `out.data` points at. `view_rows` and `safetensors.get_tensor` return views pointing at another tensor's `data`. If `at` declared `Self$@`, `(out.data + i)$ = v` would pass in the same function where `out[i] = v` is rejected.

**So `List` gets no mutability marker.** Receiving `List<|T|>@` already says "do not touch the contents", and `List<|$T|>` would be a second means to the same purpose (chapter 9). A slice, passed around by value, needs the marker because it has no axis but its type.

**A read-only slot does not mean nothing can be written through it.** The walk up the path to the root stops at a pointer type and answers with the immutability of what it points at. So for `x: H@`, `x.p$ = 22` (a field of a bare pointer) passes. Indexing follows the same rule, with the return type of `at` stopping the walk. Where the compiler walks the path is "Where immutability's two axes are enforced" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

#### 2.8.1 The receiver of a read-only method is `Self@`

None of `std/seq`'s methods rewrite the receiver: they return a new `List` or count a value. So their receiver is `Self@`, as is that of `std/ds`'s `List.get`. `Self$@` would **force a `$` onto the caller's binding though nothing is written**, leaving the lie "this gets rewritten" in the text.

Caution: **Keep `slice` / `at` / `entry_list` as `Self$@`.** Each returns a writable pointer or slice into the receiver, so calling it on a read-only receiver would wash away const. Only `get`, which returns a value, can safely be relaxed.

#### 2.8.2 Whether an index may resolve to a 'place' is decided by the receiver's permission

`a[i]` resolves first to `Index_place`'s `at`, a mutable pointer to the element.

Caution: **Do not choose it when the receiver is read-only.** `at` takes `Self$@`, so through a read-only place such as `xs: List<|T|>@` the generated C discards const, with zero diagnostics from ksplc (against Principle 2). `for x in xs` expands to indexing and takes the same path. Reads go to `Index.get` instead (safe, as it returns a value), and writes to `Index_mut.set`. How the compiler keeps this choice in one place is "Where immutability's two axes are enforced" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

### 2.9 A typedef is only another name

A typedef is the type it names. A type the compiler keeps apart from another is a struct with one field ("3.5 Typedefs (`typedef`)" in [`SPEC-language.md`](SPEC-language.md)).

**The reason**: a typedef told apart from its type would be "the same type, but remembered". Every value would carry one of two spellings, and every feature would have to say which: a variant built through the typedef, a function called through it, a value returned where the typedef is declared. Rust's `type`, Swift's `typealias`, C's `typedef` and Go's `type A = B` all name the same type. A language needing a separate type declares one (Rust's and Haskell's newtype, Go's defined type). KSPL already has that means, a struct with one field. It costs nothing at run time and makes the mix an error, not a warning (Principle 6).

**What is given up**: a typedef carries intent the compiler does not check. `User_id` and `Order_id` over `I32` mix silently; where that matters, declare structs.

### 2.10 Why `Bool` keeps ordering and has no arithmetic

`Bool` is ordered (`false < true`) and takes no arithmetic and no shifts. The operators it takes, and the answers arithmetic would silently change, are in "6.1 The operator list and precedence" in [`SPEC-language.md`](SPEC-language.md).

**The reason ordering stays**: `false < true` has one fixed meaning, and sorting on a boolean key is genuinely needed.

**What is given up**: a flag is counted only through a conversion, `I32::flag`.

### 2.11 Why the size and index type `Sz` is signed

`Sz` is signed, the reverse of C's `size_t` and Rust's `usize`. The `size_t` row of §7.2 rests on this decision.

1. **A difference fits in the type.** Indices and lengths get subtracted (`remaining = len - start`, reverse loops, the distance between two positions). Unsigned, an `a - b` below zero becomes an enormous positive value passing as a length or an index. Signed, it stays negative, and one bound comparison catches it.
2. **It can count down.** `Range.desc(n)` stops just past 0. With an unsigned index, "one before 0" is the maximum value, and a downward loop cannot be written plainly.
3. **The width matches at the C boundary**: a pointer difference is `ptrdiff_t` in C too.

**What is given up**: the representable maximum halves, and every interface taking a length or an index has to reject negative values itself. A check of the upper bound alone (`start < count`) lets a negative `start` through. The interfaces that carve out a range share that decision, `sub_count` (§2.7.1).

Caution: **A proposal to make it unsigned must answer all three points above.** Point 1 can be replaced by "check the order before taking the difference", but forgetting that check still silently yields an enormous length.

---

## 3. Traits and markers

**A trait is the only thing in KSPL that rides on the type system**, so a property pasted onto a type is either a trait or an attribute.

### 3.1 Why a trait's receiver is fixed to a bare `Self`

A `trait` method's receiver **is written only as a bare `Self`**; `Self@` / `Self$@` are compile errors (docs/SPEC-language.md §5.3). The implementation may receive it in any form.

```kspls
pub trait Writer
  fn s(r: Self, val: U8[]): Self // the receiver is always a bare Self

impl Builder: Writer
  pub fn s(r: Self$@, s: U8[]): Self$@ // the impl may receive Self$@ and rewrite it
    …
```

**In a trait's receiver position, `$@` would not mean what it means elsewhere in a type** (value or pointer, and whether what it points at is rewritten):

* **It would bind nothing on the implementation.** The conformance check ignores the receiver's notation, and the thunk on a call through the trait bridges value and pointer. So an implementation may take `Self$@` and rewrite the receiver. A trait value is a fat pointer to `v` (object pointer + vtable), not a copy, so the rewrite reaches the original.
* **It would bind only the caller.** A declared `Self$@` engages the lvalue check in `ksplc/sema/body/call.kspls`, which rejects a temporary as the receiver, as in `io.out().s("x")`.

**Enforcing agreement, as Rust does, is not open.** The declaration must be `Self` for `io.out().s(…)` to be writable, and the implementation must be `Self$@` to rewrite. The two must differ, which is why the thunk exists, so the choice is removed instead.

**Elsewhere a receiver on the trait is either absent or enforced.** Go, Swift, Java and C# write none there (Swift's `mutating` is a method modifier, and enforced). Rust enforces exact agreement (E0053), and C++ enforces the `const` of `virtual void f() const;`. With one form, KSPL sits with Go. The asymmetry with the impl is sound: what means different things is written differently.

**What is given up**: a trait cannot state "this method requires an lvalue receiver". No working protection is lost: whether a rewrite reaches the caller was always the implementation's choice, by taking `Self$@` or not.

**A guarantee that "the receiver is not rewritten"** would need a marker per method (for example `fn draw(r: Self) # readonly;`). The receiver's type cannot carry that contract: the thunk makes the receiver rewritable, and the fat pointer makes no copy.

Omitting a parameter's type, and `Self` on a parameter **other than the receiver**, are separate rules (docs/SPEC-language.md §5.1, §5.3). The second exists because a thunk would pass the fat pointer where a concrete type is expected. That fails at the C stage with no KSPL diagnostic (`ksplc/docs/DESIGN.md` chapter 4).

#### 3.1.1 When a temporary can be the receiver

A call's result as the receiver (`f().m()`) is accepted when `m` takes `Self@` (reads) and rejected when it takes `Self$@` (writes) (docs/SPEC-language.md §5.2).

**Accepting it allocates nothing.** Receiver position takes an address implicitly, so the compiler copies the value into an automatic variable in the call's block and passes its address (`P t = f(); m(&t);`). The lifetime and the size are those of `x: = f(); x.m();`, so the rule of no implicit heap allocation still holds.

**Rejecting a writing receiver**: the slot is a copy. A write through `Self$@` would vanish where the caller cannot see it, and `make_point().set_n(5)` would be a call doing nothing (Principle 5).

**So a receiver takes `$` only when the method rewrites the receiver's own memory.** A write to what a descriptor points at does not need it, since only the descriptor is copied (the `fill` example is in docs/SPEC-language.md §5.2). The line is "was it declared as writing", so it can be read off the declaration of `m` alone, and the protection needs no borrow checker.

**Operators and casts use the same slot**: `a + b` desugars to `a.add(b)` and `Dest::x` to `x.cast()`, whose receivers can be temporaries too.

**Do not split the decision across the three notations**, or `P.new(1) + P.new(2)` could pass while `P.new(1).get()` is rejected (Principle 6). It lives in one place, `receiver_needs_hoist` in `ksplc/base/ast_place.kspls`.

Rust extends the temporary's lifetime to the end of the statement and accepts the call; its borrow checker does not stop the write being discarded. C++ binds a temporary to `const&` but not to a non-`const` lvalue reference, which is in effect KSPL's line. Swift, Java and Python have reference semantics, so the question does not arise.

### 3.2 Whether a marker is expressed as an attribute or as a trait

A marker changing the compiler's behavior for a type or a declaration has two means: an attribute (`#inline`) or a compiler-known trait (`Ref_counted` / `Move_only` / `Owned`, and the operator group in `std/lang`). Often either fits, so the order of decision is fixed.

#### 3.2.1 The order of decision

**First, see whether a type can carry the property instead**, as `Rc<|T|>` and `Ci32` do. That is stronger than a marker and adds no language machinery. A marker is needed only to add a property to an existing type afterwards, or to let users add it to their own types.

**(1) Is the subject a type, or a declaration or a site?** A trait attaches only to a type. So it is not an option for `#naked` / `#interrupt` / `#noreturn` / `#inline` / `#export` / `#section` (a function), `#align` / `#packed` (a struct's layout) or `#cfg` (any declaration). A choice arises only for "this type is such-and-such".

**(2) If something is required of the type, a trait.** A conformance check enforces the methods' existence, argument count and types; an attribute cannot (3.2.2). A library is no different: what `Map<|K, V|>` requires of its key is the trait `ds.Hashable<|Key|>` (`std/docs/DESIGN.md`, "What a container requires of a type is written as a trait").

**(3) Even a pure marker with no requirement is a trait if it propagates through types.** Only a trait rides on the type system. So only a trait can be derived structurally from a type's parts (fields, an `enum`'s payload, an array's elements), written as a generic's constraint (`fn f<|T: some.Marker|>`), and checked at instantiation. An attribute is a flag per declaration with no rule for composing, and `fn f<|T: #arc|>` cannot be written.

**(4) If it carries a value, an attribute.** `#align(16)` / `#section(".isr")` / `#cfg(tls)` take parameters; a marker trait cannot carry a value.

**(5) If (1) to (4) do not decide it, a trait:**

* The attribute table's rule keeps no exceptions: removing an attribute leaves the executable's logical structure unchanged (docs/SPEC-language.md chapter 10). That rule is what gives the gate "an unknown attribute is an error" its meaning.
* A marker that later grows a method requirement gains one prototype, and the user's code does not change. The cost is one FQN constant and a conformance call, not a check written by hand.

**The trait's costs are accepted:**

* **The compiler depends on a name in the standard library**: `ksplc/sema/type/arc.kspls` holds the string `"std.Ref_counted"`, against the layer direction (3.2.4 contains the damage).
* **A marker-only trait's conformance check is empty.** It sees only that the marker is attached, and guarantees nothing about the type's shape (as with Rust's `Send` / `Sync` / `Copy`).
* **The user writes more**: `impl X: Move_only {}` instead of `#move_only`, though with no import line, since `Move_only` comes in with `std/lang`.

#### 3.2.2 Why ARC is expressed as a trait

Automatic reference counting (ARC) applies to the types that conform to `Ref_counted` (docs/SPEC-language.md §8.4.2). An attribute such as `#arc` fails on three counts.

**1. An attribute cannot check the requirement.** ARC means "provide retain/release". To synthesize the calls, the compiler looks up `<type name>.retain` / `<type name>.release` by name, and inserts nothing if the lookup fails. An attribute on a type lacking them would disable ARC with no diagnostic, where a trait's conformance check stops it (3.2.1 (2)).

**2. It would break the attribute rule**: removing `#arc` would change the executable's logical structure (3.2.1 (5)).

**3. A trait already drives code generation.** `Add` desugars `a + b` to `a.add(b)`, and `Index_place` desugars `a[i]` to `a.at(i)$`. Inserting "retain on copy, release on leaving scope" is the same shape, not a new mechanism.

**The methods are `priv`**, because a call by hand doubles up with the inserted ones: an automatic `release` after an explicit one writes into freed memory. `priv` on the conforming impl refuses the direct call, and on the trait it closes the path through an upcast. The synthesized calls are inserted after the visibility check, so they still reach.

**The trait itself is `pub`.** A `priv trait`'s name could not be written, and every file defining an ARC-managed type would redeclare a trait of the same name. With only the methods `priv`, every file shares one declaration and the calls stay closed.

**Only `std.Ref_counted` itself counts (an exact FQN match).** Matching the suffix `.Ref_counted` would switch ARC on for any same-named trait made for another purpose. Retain/release inserted into a type counted by hand write into freed memory with no diagnostic. `Move_only` and the operator group in `std/lang` are matched by FQN for the same reason.

**The vtable cost**: a trait with methods gives the conforming type a vtable. `--gc-sections` reclaims it when nothing uses it dynamically, so the linked size does not grow. The exception is Windows (PE) linkers, which keep unreferenced sections.

#### 3.2.3 Markers not carried

**There is no `#arc` attribute.** ARC is conformance to `Ref_counted`; why an attribute is the wrong shape is 3.2.2.

**There is no `#deterministic`** (an attribute making an ARC-managed parameter, return value or local variable a compile error in one function). By 3.2.1 (1) an attribute would be the right shape, since the subject is a function, but the existing machinery suffices. It is needed only where one binary mixes paths with and without ARC, and a hard error must hold the paths without it. Raising the lint [W0602] to `error` does that. `ksplc.cfg` is read up the directory tree with the innermost winning, so the `error` can be scoped to the real-time path's directory.

**There is no `Thread_shareable`**; chapter 5 gives the reason.

#### 3.2.4 Why compiler-known traits are confined to `std/lang`

The traits the compiler names by FQN (the operator traits, and `Ref_counted` / `Move_only` / `Owned` / `Callable1` / `Callable2`) stand only in `std/lang`, with one exception, under "When it may sit outside `std/lang`" below.

**The motive**: 3.2.1's cost "the compiler depends on a name in the standard library" cannot be removed, since a name is the only tie. What is left is to show by placement which names bear the load.

Caution: Mixed into a general-purpose file, a name whose renaming silently disables a feature cannot be told from one safe to rename.

**`Option` / `Range` / `panic` stand there too**, because the language's syntax requires them directly: `Option` for `switch`'s exhaustiveness, `Range` for `for item in collection`, and `panic` for bounds checks and `assert`.

**Do not add for convenience.** Every program pays for this file (`make test-thin-use` guards its size).

**When it may sit outside `std/lang`**: when the whole file exists for that mechanism. `std/reflect` holds only `Reflectable` / `Field_info` / `Field_kind`, and its name declares the mechanism, which meets the motive. Mixed into `std/lang`, it would be harder to tell apart. `std/lang` holds only what the syntax requires, and `impl X: reflect.Reflectable` is written out, so reflection does not belong there.

**The direction of dependency**: `std/lang.kspls` may import only `std/libc`. Routing `panic`'s output through `std/io` would cycle (`lang → io → mem → lang`) and make every program pay for strings and IO. The other way round, `std/refcount` (the `Rc`/`Arc` conformances) and `std/thread` (`Raw_mutex`/`Mutex`) depend on it.

**The way out for a file that declared the same name**: `std/lang` also gives every file the import alias `lang`. So a file declaring its own `Ref_counted` still conforms to the lang one with `impl My_type: lang.Ref_counted`. Unqualified, the name means the file's own declaration: the conformance target changes, type checking passes, and ARC and operator desugaring stop working with no diagnostic.

Conversely, do not write `lang.` where the unqualified form is not blocked. That is two ways of writing one thing (chapter 9), and `make test-conventions` watches for it.

**What moving a file does not resolve**: it removes only the coupling by type name. The compiler also looks up methods and functions by name, and placement does not fix those.

| Name | Purpose | What backs it |
| :-- | :-- | :-- |
| `retain` / `release` | ARC's synthesized calls | `Ref_counted`'s conformance check requires them |
| `fields` | Where `Reflectable`'s synthesized table goes (3.2.5) | `Reflectable`'s conformance check requires it |
| `fmt` | String interpolation (called inside `\{x\}` → `put(w, x)`) | If missing, `Formattable`'s conformance check stops it |
| `put` | What string interpolation desugars to; a free function in `std/lang`, so **its unqualified name is taken in every file** | If missing, "undefined identifier" |
| `len` | `for`-`in`, and slices | As above |
| `get` / `at` / `set` | Indexing | Reached through `Index` / `Index_place`, so it follows the type-name coupling |
| `free` / `dealloc` | Detecting use-after-free | **Nothing. A pure name-match heuristic** |

The last is the weakest coupling: it can misfire on an unrelated method named `free`. Moving it onto a trait such as `Deallocating` would mean a conformance on every type with a freeing method. The cost does not balance, so it stays, stated as a heuristic.

#### 3.2.5 Why the round trip between a container and an external form is a trait returning a table

With a bare interface, `json` and `db` would each write a field's key twice, once to write and once to read (`std/docs/DESIGN.md`). KSPL folds that into **one trait that returns a table of fields**.

```kspls
pub trait Reflectable
  fn fields(r: Self): Field_info[]
```

`Field_info` (in `std/reflect`) holds the name, the offset, the kind, a nested table and `Field_extra` (a number's width, and the like). `std/json`'s `from_struct` / `into_struct` and `std/db`'s `bind_row` / `read_row` walk it in ordinary KSPL.

**A trait rather than an attribute**, by (3) of §3.2.1. Whether a type can round-trip is derived structurally from its fields' types (`Outer` only when `Inner` can), and it must be writable as a generic's constraint (`fn save<|T: Reflectable|>`). Nor is it an empty marker: `fields()` is called directly under that constraint, so no second mechanism looks up a name (chapter 9).

**A table rather than a body per library.** `Json_codable { fn to_json(…) }` names a `std/json` type in its signature. Once ksplc synthesized its body, it would be a compiler-known trait. 3.2.4 puts those in `std/lang`, which may import only `std/libc`. A table's signature needs only `U8[]`, `Sz` and an enum, so it can live anywhere: in `std/reflect`, not `std/lang` (3.2.4). And one mechanism serves both `json` and `db`.

**The compiler writes the table only for an `impl` with an empty body**, as a person would write it, and leaves an `impl` with a body alone (the rule is "5.5 Worked example: synthesizing a field table with `Reflectable`" in [`SPEC-language.md`](SPEC-language.md)). A body written by hand is the way out for another key mapping, or for a type the table cannot express. The trait is matched by FQN, as every compiler-known trait is (3.2.4). How the compiler builds the table is ksplc's (`synthesize_reflect_impls` in `ksplc/sema/decl/reflect.kspls`, and pass 2a' under "4.3 The internal flow: registering every file up front → the main type-inference walk → draining the work list of generic instantiations" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)). The table's own shape (nesting, widths, containers) is `std`'s ("The field table holds a number's width as data, and nests by pointing" in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md)).

**`offset` is in the table** because adding up sizes from `kind` cannot give it. Padding intervenes (the `b` of `struct { a: U8; b: I64; }` is at 8, not 1), `#packed` stops the padding, `#align(N)` overrides a struct's alignment, and `#size(N)` sets a bodiless struct's size. One place in ksplc interprets those and the alignment rules ("4.3.1 A layout is computed when it is first asked for" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)). A walker that added up sizes would be a second implementation of the layout rules, and a divergence would produce no diagnostic. Given `offset`, the walker needs only "where" and "how to convert", never "how many bytes".

**An `Option<|T|>` field that is `.none` writes no key**, and an explicit `null` is refused as a difference in kind. serde, Swift's `Codable` and Jackson read a missing key and a `null` as one state, and a user who needs the difference reaches for a double wrapper. Here the two are already different values, and `null` is not made a second spelling of "missing" (chapter 9).

**A container of containers, and an option holding a container or an option, are not covered.** A form that can be written but not walked would be "writable but ineffective" (Principle 5). What blocks them is in "Known holes, and what would fill them" in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md).

**The table is not a translation-time value (no `fieldsof(T)`).** Constant folding answers an `I64` (`ksplc/sema/decl/eval.kspls`), and an aggregate would be a new kind of translation-time value. `offsetof` is one more scalar beside `sizeof`, one notation (chapter 9).

**An `offsetof` it cannot answer is rejected**, neither left undefined nor answered with a stand-in (the cases are docs/SPEC-language.md §6.7). With neither inheritance nor virtual function tables, every `struct` has a fixed layout. So nothing forces an undefined case, and a request with no answer becomes an error (Principle 5).

**No mechanism renames keys.** The mapping is fixed as "field name = key, type = the value's kind". To change it, write the `impl` body by hand so no synthesis applies.

**It applies only where the external form is the declaration itself.** A key written in two places is not enough. It does not apply where the writer decides the key by any of these:

* **Flattening** (a nested struct adding its keys to the parent object).
* **Renaming** (`Paper.height` → `page_height`).
* **Omitting a default value** (on a non-`Option` field).
* **An enum expressed by a key's presence or by a name's spelling**.
* **A value written differently from its type** (a color written as an `#rrggbb` string).
* **No source struct to copy from** (the value is assembled from several sources; `kssrv/api.kspls`, `ksplc/lsp/msg.kspls`).

**These are not added to the mechanism.** Two hands would then decide how a key is written, and "no mechanism renames keys" would collapse (chapter 9). Each is a deliberate decision by the writer, and bending it to fit the mechanism has the order backwards.

### 3.3 No syntax equivalent to concepts is added

C++'s concepts check a template's constraints **before instantiation**. Without them, diagnostics are reported from deep inside instantiations. KSPL checks a generic's body per instantiation, so it could pay the same price; the measurement below decides.

| What concepts gave | Where KSPL stands |
| :-- | :-- |
| (1) Constraints checked before instantiation, ending diagnostics reported from the depths | **Present.** A violation of `<\|T: Trait\|>` is rejected naming the instantiated type, and **the body of an instantiation known to violate is not type-checked**, so no errors derive from it (pinned by `EXPECT-NOT` in `ksplc/tests/negative/generic_constraint_via_static_call.kspls`) |
| (2) Choosing an overload by constraint (replacing SFINAE; subsumption) | **Not needed.** KSPL has no function overloading, and an impl targeting a type argument itself is rejected, so **there is nothing to choose between** |
| (3) The requirements shown in the signature | Partly: `<\|T: Trait\|>` can be written but is **not required** |

**Measured**: a method the type lacks, called three levels deep in generics calling generics, gives exactly one message, naming the concrete type and pointing into the body. A body failing for several types gives one per type. The cascade C++ shows without concepts does not occur.

* **So the syntax is not added.** (1) is present and (2) has nothing to act on. A mandatory (3) would check generics once against the constraints, limiting a body to what they guarantee.
* **What is given up is a diagnostic detail**: an unconstrained body that fails does not say which call bound the type argument. The position that caused the instantiation is recorded for the constraint check, not for the body's later analysis ("A diagnostic points at 'the position the user wrote'" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)). So the gap is a missing note on the diagnostic, not a gap in the type system.

---

## 4. Ownership and lifetime

**With no borrow checker, what the language protects has to be chosen.** It protects what local data flow alone can follow, and states the rest as the writer's responsibility (Principle 8).

**Raw pointers are set apart rather than banned.** `T@` is a first-class type, and unchecked access has its own form, `(p + i)$` (docs/SPEC-language.md §6.2.1), so C-level control need not move into a library.

**What is given up: how a type's memory is managed has to be read from its name.** Raw pointers and ARC live side by side, so the reader checks which one manages a type. Consistency is chosen per project, not by the language. The lints [W0602] and [I0603], off by default, find code departing from the chosen policy ([`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

### 4.1 Why there is no borrow checker, only a move-only marker

Conformance to `Move_only` forbids implicitly copying an owning handle, such as an OS lock or a file descriptor, where a duplicate means a double free (docs/SPEC-language.md §5.4). Rust's borrow checker is not adopted.

**Why no borrow checker**: it tracks an order of magnitude more (region inference over references' lifetimes, plus alias exclusion). It also collides with KSPL's routine use of raw pointers. Move-only tracks one thing, "this binding can no longer be read", and local data flow suffices for that.

**Why a move rather than a ban on copying**: a ban makes construction impossible. `Mutex<|T|>::{ .mutex = m, … }` copies `m`, and so does binding the result of `Raw_mutex.new()`. Ownership passes there and leaves no duplicate, so what fits is a move invalidating the original.

**Which reads are moves**: the rule lists the reads that do not duplicate: a method's or field's receiver and the target of `@` / `$` / `[` (docs/SPEC-language.md §5.4). Every other read as a value is a move. Listing the moves instead (assignment, arguments, struct literals, `return`) would be longer, and a position added later would be easy to miss.

**What is given up**: duplication through a pointer goes undetected, so the check is not sound (the limit is stated in docs/SPEC-language.md §5.4).

### 4.2 Why `defer` has no capture list

A `defer` carries only its body, which reads outer variables **on leaving the scope** (docs/SPEC-language.md §8.4.1). Nothing freezes them at registration.

**Freezing at registration would be wrong**: for a value struct, freeing the frozen copy does not free the real thing.

```kspls
b: = Str_builder.new() // at this point ptr = null, cap = 0
defer b                // <- frozen, this captures a copy with cap = 0
  b.free()
b.s("...")             // allocates and grows the internal buffer (the original b is updated)
```

`Builder.free()` frees only when `cap > 0`, so the frozen copy frees nothing and the whole grown buffer leaks. The standard library is full of this shape. With freezing, ksplc itself would leak megabytes in a single compilation.

**The uses agree.** A `defer` that releases a resource almost always calls `.free()` / `dealloc()` / `fclose()`, and each must free what it holds on leaving. Not one needs freezing.

**"Immediate is safer" does not hold.** It looks better when the variable is swapped to another resource after registration. But then immediate leaks the new resource and deferred leaks the old. Either way one leaks, so that code is wrong in itself.

Go's `defer` is immediate only in evaluating its arguments. Its block form, which `defer { … }` corresponds to, is deferred. Immediate looks safe there because Go defers a pointer or a handle. What breaks here is a **value struct** that owns heap memory, such as `Str_builder`.

**Why there is no capture list**: reading on leaving, a capture list would do nothing at run time. It would still tell the reader which variables the block touches, but unenforced it is a comment: writable but ineffective (Principle 5).

**To keep a value from registration time**, copy it yourself (the idiom is in [`docs/SPEC-language.md`, 8.4](SPEC-language.md)).

Caution: **Should freezing at registration ever be needed, do not spell it `defer a, b { … }`.** It could not be told from the existing `defer`, which reads on leaving, and would break silently. Give it its own notation.

### 4.3 Why dangling is stopped only on the paths that create an invisible pointer

Returning a local's address to dangle, as in `return x@;`, is the writer's responsibility, with no diagnostic. Only two cases are stopped at `return` / `throw`: a trait value, and a slice descriptor built over a frame's array (`return U8[]::a;`, `return U8[]::{ … };`).

**The reason: no `@` appears in the source.** A trait value is an `{obj, vtable}` pair, so upcasting a value makes the compiler synthesize `&value`.

```kspls
priv fn make(): Shape
  $s: = Sq::{ .n = 7 }
  return s // <- not one pointer operation is written
```

It lowers to `return (Shape){ .obj = (void*)&s, … };`, yet `Shape` looks like a value type and no `@` or `$@` is written. `return x@;` shows its danger on the page; here the language makes a pointer nobody sees. **Responsibility can only be assigned for what the writer can see.** A slice is the same: casting a fixed-length array to a slice, or building one from a run of elements, makes the compiler synthesize the descriptor's pointer.

**Put the line at this point only.** `return a[0]@;` and `return U8[]::{ .ptr = a[0]@, .len = 4 };` show their danger on the page, so they are the writer's responsibility and pass.

Caution: **Do not reject a call's result either, and do not widen the check to "do not return a slice".** The compiler does not know where `builder.slice()` or `arena.alloc()` points, and returning allocated memory is legitimate.

**Only `return` and `throw` are checked.** Both fold the frame, and at both the danger is easy to detect and always wrong. An indirect escape, such as storing into a struct field and returning that, needs real escape analysis and is out of scope (§4.1's line: follow only what is cheap and certainly correct).

**Three forms pass**: a global (static storage), an upcast of a pointer (no `&` is synthesized), and what a pointer points at (`p$`, whose address lies in the heap or elsewhere).

### 4.4 Why an early exit before a `defer` is warned about, and how narrowly

**A `?`, `return`, `throw`, `break` or `continue` between an `Owned` value's binding and the `defer` that frees it in the same block is [W0110].** That path leaves before the `defer` is registered, so what was acquired leaks. The language does not stop it, since a `defer` is its own statement (§9.1).

* **It asks only where a later `defer` in the same block frees the value.** A value freed by hand, passed on or kept has another shape, and calling it a leak would be a false report (the exemptions are under [W0110] in `ksplc/docs/SPEC-tools.md`).
* **A shape rather than every path.** Checkers that follow a resource along every path pay in false reports. A rule read off the code as written, like Error Prone's `MustBeClosed`, does not. The gap before a `defer` is such a rule.
* **`Owned` says which values are asked about.** It is the same contract the use-after-free check reads (docs/SPEC-language.md §8.4.5), so a type taking part in one takes part in the other.

**What is given up**: a value with no later `defer` in the block, never freed at all, is not this warning's to find.

---

## 5. Concurrency

### 5.1 Why data races are not prevented by the type system

KSPL's type system **places no constraint on values crossing a thread boundary**. `thread.Thread.spawn<|T|>` requires nothing of `T`, and there is no marker like Rust's `Send` / `Sync` or Swift's `Sendable` (`Thread_shareable`).

**The reason: only one of the two channels can be checked.** Threads share data through `spawn`'s arguments or through a top-level variable (a global), and a marker binds only the first. A closure cannot leave its function (§8.1), so it cannot be passed to `spawn`. A global becomes the natural way to show two threads the same data. The bypass is not a loophole but the main path.

**The shape that passes**: put a non-conforming type in a global, give `spawn` a small conforming argument, and have the worker touch only the global. `ksplc lint` reports nothing, and the program breaks. A global counter ends below the expected count. So does a struct with a raw pointer in a field, which fails to conform even under structural derivation. `push` onto a `List<|I32|>` loses the pushed elements.

Worse, the single-thread `Rc<|T|>` also passes in a global, and running it SIGSEGVs (a use-after-free from racing counts). Its non-atomic count is the case the marker most ought to protect. **What slips past fails harder than what the marker would catch** (numbers going wrong).

**The difference from Rust**: Rust's `Send` is incomplete but sound because every path across threads goes through it. `static` requires `Sync`, and `static mut` requires `unsafe`. KSPL has no such closure, so the same marker would only filter part of one channel.

**Closing the hole is not taken on either.** Soundness would require every mutable global in a spawning program to conform (Rust's `static` rule). `ksplc` itself, whose shared arena is a raw pointer, would fail that, and the cost extends to changing the compiler's architecture.

**Structural derivation decides it.** Derivation counts a type nobody reviewed as conforming. `struct Counter { n: I32 }` conforms, and `c.n += 1` racing from two threads passes with no diagnostic and still ends below the count. Where it does not protect, the marker would manufacture false assurance (Principle 8).

**What is given up, and what stands in its place**: the type system cannot stop the one point `spawn(worker, rc@)`, so the type's name carries the choice instead (Principle 8, 3.2.1).

**A gate finds the races the tests reach.** `make test-race` builds the programs that start threads with ThreadSanitizer and fails on any report (what it runs is "What each platform runs" in [`SPEC-gates.md`](SPEC-gates.md)). Without it a race shows only as a wrong result some runs later, a counter ending low or an `Rc` crashing, with nothing naming the two accesses.

* **It watches every channel at once.** A marker would see `spawn`'s argument alone; the sanitizer sees an access through a global, an argument or a raw pointer alike, the bypass above included, and names both accesses by their `.kspls` lines and the threads they came from.
* **It is a check on what ran, not a guarantee** (Principle 8). A race no test reaches stays unseen, so the gate is not read as "the program has no race", only as "no test hit one".
* **Nothing is suppressed.** std, the runtime and the program are compiled from source into one unit, so nothing the sanitizer watches is uninstrumented. The false reports that a prebuilt library gives in C++, and an uninstrumented standard library in Rust, do not arise, and a report is a finding to fix.
* **The price is paid by the gate, not the language**: a sanitized run takes several times the time and memory, so the gate runs once, in the Linux job, whose image holds the sanitizer. A program left out of it is named with its reason, so what the gate does not run stays visible.

**`Move_only` escapes this criticism**: a global does not bypass the local data flow it follows (§4.1).

---

## 6. Visibility

**`priv` answers one question: which files may write this name.** §6.1 and §6.2 close holes where the mark could be written and not hold. §6.3 separates it from the question it is most often confused with. §6.4 is the other gate on reaching a name: a method another file adds is reached only where that file is imported.

### 6.1 Why a narrow type may not sit in a position with wide visibility

A `priv` type in a `pub` function's return (`pub fn open(): File_stream$@`) passes the value to code that cannot name the type. That code binds it (`f: = io.open(path);`), calls its methods and reads its fields. Meanwhile whoever wrote `priv` believes the type is closed to the file. **A marker that is writable but ineffective** is an error.

**Only positions where a value leaves are covered**: a function's return, a `struct`'s `pub` fields, an `enum`'s payload, a `trait`'s method prototypes, and a top-level declaration's type annotation.

**Left out, and why**:

* **A parameter.** The outside cannot make a value of the narrow type, so it cannot call the function. That is inconvenient, but not a lie, and nothing leaks.
* **A non-`pub` field.** Its access is checked at the use site, so the value does not leave, whatever its type. Only a `pub struct`'s `pub` field leaks.

**What is compared is effective visibility**: a member reaches no wider than what encloses it (docs/SPEC-language.md §9.4). Without that, every `pub` member of a type closed to its file would be a false report.

**A `priv` type in a `pub struct`'s `pub` field is never what is wanted**; one of the two marks is wrong. Narrow the field if the outside does not read it, and widen the type if it does. An opaque handle is a `pub` type with non-`pub` members, and its name can then appear in a diagnostic.

**A generic's type arguments pass through**: `List<|Secret|>.get()` with `priv struct Secret` in the calling file gives no diagnostic. The monomorphized method is analyzed in the template's file, where the caller's `priv` symbol does not resolve. That is right: `Secret` is visible where it is instantiated, so nothing leaks.

### 6.2 Why a typedef cannot be published wider than its target

**A typedef is no wider than any name on its right**, walking inside the type expression (the rule and its examples are "3.5.1 Visibility" in [`SPEC-language.md`](SPEC-language.md)).

**The reason**: a typedef puts a type's name outward. A wider one lets code that cannot name the target receive its value through the typedef. That is the state §6.1 forbids, in the shape of a `priv` on one declaration overridden by another. With visibility decided away from the declaration, how far a type reaches could no longer be read from its declaration alone.

**To keep the implementation closed and publish only the name, mark the type itself** (the same section), so no typedef is needed for it.

**Rust (E0364 / E0365), Swift and Kotlin refuse an alias wider than its target too.** Rust's `pub use` facade works because the declaration itself is public and only the path to it is hidden. KSPL nests no names in a hierarchy, so there is no path to hide and the idiom does not carry over.

### 6.3 Visibility and linkage are separate axes

"**Which translation units may use this symbol**" is a different question from the one `priv` answers.

Caution: **Mixing them makes a correct program fail to build only when the number of splits changes.** ARC's `retain` / `release` are `priv fn` in `std/refcount` (§3.2.2), yet the compiler synthesizes their calls in the user's file. Mapping `priv` straight to C's `static` makes such a call reach outside its translation unit. So it fails under `ksplc run`, which splits by core count, and passes under `ksplc a.kspls a.c`, a single unit.

**A symbol is closed to its translation unit only when its name is unique within the file and not beyond it.** A method is already unique program-wide through its type's FQN, and a generic's instantiation through its type arguments. A type's FQN carries its file's logical path as a prefix, and the compiler rejects two files that add a same-named method to one type.

**Decide together what makes a name unique and what closes a symbol** (Principle 6). Adding only one gives an unprefixed name made `static`.

**`priv` loses nothing**: the rule decides only what the linker sees.

**Rust and Swift keep the two apart too**, each for its own constraint. KSPL reads the whole program at once, so no function gets two bodies, and whether a name is globally unique can be read off the declaration.

**In C++, which mixes them, the link fails silently, by configuration.** So the check must change the number of splits and actually link and run (`ksplc/tests/prog/split.kspls` and `ksplc/tests/suite/split_test.kspls`). A check reading the generated C lets this failure through.

### 6.4 Why a method on a built-in type needs its file imported

A method another file adds to a type is called only where that file is imported ("An extension method requires the import" in [`SPEC-language.md`, 9.3](SPEC-language.md#93-adding-a-method-to-another-files-type)). **A built-in type is no exception: it counts as `std/lang`'s**, the file every file imports. So the methods written there need nothing, and one that `std/str` adds needs `std/str`.

**Exempting built-in types would break two things.** A method on one would then resolve in every file once any file of the program loaded its definer:

* **The unused-import hint would advise breaking the build.** To the lint, the file's own import of the definer holds nothing up, so [I0401] calls it unused. Deleting it breaks the file wherever nothing else loads the definer. A `_` alias on each such import would silence the hint and hide the dead ones.
* **Whether a call compiles would depend on files it never names.** `"abc".contains_nul()` would compile because `std/io` → `std/str` → `std/chars` loads the method, and stop when that chain changes.

Swift closes the same hole with `MemberImportVisibility`, and Rust, C# and Kotlin tie the call to an import in the calling file.

**A format specifier is included.** `\{n:x\}` desugars to `n.fmt_hex(…)`, which `std/strfmt` adds, so the file imports `std/strfmt`. The error names the specifier written, not a `fmt_hex` the source never holds. An exemption would be a second path to the same methods, shown by no import line (Principle 6).

**A generic's instantiation is excluded.** Its receiver can be the type argument's, and `put<|W, T: Formattable|>` in `std/lang` cannot import every file serving its bound, so the requirement would vary with the argument. A conformance (`impl I32: Formattable`) holds wherever its file is in the program, and a call through it is the generic's.

**What is given up**: one import line per file using a method another file adds to a built-in type, stating a dependency the call already has.

---

## 7. The boundary with C

**Everything Kanso passes to C or receives from it crosses one boundary.**

### 7.1 The FFI boundary check looks inside the type

An `#export` signature cannot hold a type whose layout is Kanso's own (the list is docs/SPEC-language.md §11.1).

Caution: **Do not look at the outermost layer only.** Merely wrapping (`struct W { items: U8[] }`) would slip past. When the reason is its layout, refusing a bare slice but passing one inside a struct makes no sense. A struct's fields are followed recursively.

**Pointers are not followed.** A pointer is a pointer in C too, and what it points at matters only if the C code touches it. Following would fail nearly every `#export`, self-referential structs included. Cycles are cut twice over, by a visited set and a depth limit.

**The LLVM backend is stricter still**: it cannot pass even a plain struct by value across the C boundary. genllvm does not implement the per-target C ABI classification (Win64 uses a hidden pointer beyond 8 bytes, SysV x86-64 works in eightbytes around a 16-byte boundary, AAPCS has the HFA case, and so on). The C backend passes it, since the C compiler does the classification ([`ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md), "Passing an aggregate is an explicit internal ABI").

### 7.2 What cannot be written in C's types

Three of C's types have no Kanso spelling. In an `extern` declaration, which one applies decides how it is received.

| C type | Why it cannot be written | How to receive it |
|---|---|---|
| `char*` / `FILE*` | Kanso's byte is `U8` (`unsigned char`), and C's plain `char` is a third type, distinct from both `signed char` and `unsigned char` | As `Void$@` / `Void@`: the same representation and calling convention, so nothing breaks |
| `size_t` | Kanso's size type `Sz` is signed (`ptrdiff_t`; §2.11) | As `Sz`: the width, and so the ABI, always match, and only the sign differs. Do not pass a negative value |
| `long` / `clock_t` / `time_t` | Its width varies per target (64-bit on LP64 Linux, **32-bit on LLP64 Windows**), and Kanso has only fixed-width types | **Do not write it in an `extern`.** Convert the width inside a small function on the C side |

Caution: **Writing `long` as `I64` breaks silently on Windows.** The 32-bit return value is read as 64 bits. x86-64 zero-fills the upper 32 bits on a write to EAX, so `-1L` (failure) becomes `4294967295`. It slips past a "negative means failure" check, with no crash to notice.

`kspl_file_size` / `kspl_mono_us` (`ksplc/gen/runtime/hosted.c`) and `kspl_stat` / `kspl_remove_path` (`ksplc/gen/runtime/hosted_fs.c`) take the third row's way out: only fixed-width types cross. Adding one needs its LLVM backend counterpart too (`ksplc/gen/llvm/module.kspls`; `make test-conventions` watches the pair).

**Do not receive a `char*` as `U8@`.** The declaration is stdio.h's when hosted and the one genc prints when freestanding. One of the two always differs in sign (`-Wpointer-sign`, against Principle 2).

**No type for plain `char` is added.** `Void@` already receives a `char*`, and plain `char`'s sign is implementation-defined. Matching it would mean carrying a type whose sign varies per target, only for the look of an `extern` (Principle 1).

### 7.3 The library an `extern` block needs is named on the block

**`#link("openblas")` on an `extern` block names the library its declarations are found in.** So a program taking in a binding takes its library with it, and no build file carries the name. The rules are "11.5 Naming the library an `extern` block needs (`#link`)" in [`SPEC-language.md`](SPEC-language.md); this section holds why.

1. **A name, never a flag or a place.** A flag in the source is one machine's link line forced on every machine that builds it. Go narrows its `#cgo` flags with an allowlist, because a flag can run code at build time. A name carries no search path, plugin or option. Where to look and whether to link statically belong to the building machine, so they stay with the environment.
2. **On the block, under the block's own `#cfg`.** `#cfg` keeps or drops the block whole, so the library follows the flag that keeps its declarations, written once. Apart from the block (on a line of its own at the file's head), it would link the library into a build that dropped every declaration needing it.
3. **The source is the one place the name is written.** The compile writes the names of the blocks it kept, and `ksplc run` and a build linking by hand both take them from there. A copy in a Makefile would be tied to it by a comment alone, and changing one would leave the other linking the old library.
4. **The order is the one a linker reading once from the left needs**: a library before the ones it uses, which is the order of a file's imports. Rust also passes a crate's libraries before its dependencies', and CMake also drops a repeat at its later place.

`#link` keeps the attribute rule of 3.2.1 (5). Deleting it changes nothing the program does, only whether the link finds the definitions, as with `#export`.

**What is given up**:

* **A library named differently per OS cannot be one `#link`.** OpenSSL is `ssl` and `crypto` on a Unix-like system but `libssl` and `libcrypto` for the MSVC toolchain. No `#cfg` names the OS (the flags come from the build), so it stays in the build file. A name that agrees works on both: clang's driver turns `-lopenblas` into `openblas.lib` on an MSVC target.
* **`std/tls` stays with the build files.** Its `extern` block declares C runtime functions (`kspl_tls_*` in `ksplc/gen/runtime/hosted_tls.c`) whose bodies compile only under a macro the build defines (`KSPL_TLS`), and OpenSSL is the library of the first point. The name alone would link libssl with the runtime's TLS half compiled out, so the Makefile's `TLS_LIB` stays beside its macro. `std/db` calls SQLite's own functions with nothing of the runtime between, and `sqlite3` is the library's name on every platform, so its block names it (`#link("sqlite3")`).
* **Nothing is searched for, and static or dynamic is not chosen.** A library not where the linker looks fails the link, and the linker's own message names `-l<name>`.
* **A kept block links its library whether or not a call reaches it.** Tied to use, the link line would move with the pruning of unused functions, and an edit elsewhere could drop a library the program still names.

### 7.4 Standard output carries the bytes a program writes

**On Windows, the generated `main` puts standard output into binary mode**, after `argc`/`argv` and before the program's own code (`emit_main_function` in [`../ksplc/gen/c/root.kspls`](../ksplc/gen/c/root.kspls)). The C runtime's standard output is in text mode there. Every `\n` becomes `\r\n` behind the program's back, and a line that already ends `\r\n` becomes `\r\r\n`, shown as a blank line between lines. What a program writes has to be what lands, for every KSPL program and not for the tool alone. The console is unaffected, since it makes a lone `\n` a new line itself.

**Deciding it per program does not work.** An opt-in call in one program's `main` covers that program alone. Another KSPL program speaking the same `Content-Length` framing writes `\r\r\n`, and its reader finds no `\r\n\r\n` to cut the header at. The exchange ends as "the peer closed", with nothing naming the cause. That is correct to read and wrong on one platform, the shape Principle 5 refuses. The entry point every hosted program shares leaves nothing to remember and nothing to forget.

---

## 8. Function values

**A function value is one of two things, and how it is written shows which.** With no capture list it is a function pointer; with one it is a trait value carrying an environment.

### 8.1 Why capture is made explicit and escape is forbidden

An anonymous function (`fn(x: I32): Bool { … }`) is lifted to a top-level `priv fn`. A closure (`fn(x: I32; n: I32): Bool { … }`) gets a synthesized struct pointing at its captures and an impl of `Callable1`/`Callable2` (`desugar_fn_lit` / `desugar_closure` in `ksplc/parse/desugar_closure.kspls`).

**That the `;` changes the type is intended.** A function plus an environment does not fit one C function pointer. With the kind visible in the notation, a reader can tell what may go to C without following the types. Even with zero captures, a `;` makes a `Callable`. So a predicate needing no captures can reach an API that takes no function pointer: KSPL has no overloading, so the callee cannot take both.

**Captures are held by place (a pointer).** Copied by value, they would break as a `defer` frozen at registration does (§4.2). Through a pointer, a call reads the body as it is then.

**Escape is forbidden in exchange.** A captured place dangles once the environment leaves the function. With no borrow checker (§4.1) that cannot be tracked. But a closure is a trait value, so §4.3's escape prohibition applies, and `check_ffi_safety` already stops it at the C boundary. Closures need no check of their own: the trait value's constraints are exactly the two needed.

**An enclosing type argument reaches a closure, but not an anonymous function.** A closure's synthesized declarations copy across the ones its signature touches (ksplc/docs/DESIGN.md §3.5.1). An anonymous function is a function-pointer value, and nothing fixes the instantiation where a value is passed. This follows from the `;` rule, which the text does not show, so the error asks for a capture list (`ksplc/tests/negative/anon_fn_generic_param.kspls`).

**Captures are typed because the environment is a struct, whose fields need types.** Inferring them would invert the phases. Types come from the body's inference (`sema_body_infer.run`), while a struct's fields are resolved before it (Pass 3 of `sema_decl_collect.run`). A written type lets desugaring decide it alone, on the line §2.1 already holds.

**Whether a type can be omitted differs by position**, since the phase inversion blocks only "omit it and infer it".

| Position omitted | Possible | Reason |
| :-- | :-- | :-- |
| `return` (a tail expression) | Requires no information | Decided by syntax alone |
| A capture's type | A route exists | Made a **type argument** of the synthesized declarations and taken in the environment-building function's parameter, it binds from that actual argument (no phase is crossed) |
| A parameter's or return's type | No route | The type argument does not appear in the environment-building function's parameters. So it would need **a route back from the use site's expected type to the value's type argument**, and there is none |
| The capture list itself | Against the design | The `;` separates a function pointer from a trait value. Made implicit, an expression's type would silently vary with its body, and whether it can go to C would vanish from the text |

**A route existing is not a reason to take it.** Closures with captures are few in the tree, and omitting all four would save no lines and a negligible share of characters.

Note: This is revisited only under §8.2's condition, "when a caller needing captures appears". The mechanism, and why no route leads back from an expected type, are "3.5.1 Synthesizing a closure makes a KSPL source string and puts it through the same parser" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

**Only one- and two-argument `Callable`s exist** (`std/lang.kspls`). With no variadic generics, `Callable` cannot take the argument count as a type argument. `std/seq` needs no more than two, so `Callable3` and beyond are not added ahead on "it would be handy".

**What is given up**:

* **It cannot be carried out.** Where the writer must decide the environment's lifetime, put the captures in a `struct` and pass that as an argument (docs/SPEC-language.md appendix A).
* **The call goes through a vtable**, one level more than an anonymous function's direct call.
* **A closure cannot be captured.** A capture points at the body a name refers to, so it would take in the environment struct, not a `Callable` (composition passes an argument instead; docs/SPEC-language.md §8.1.3). Say so in the diagnostic, or the user reads `_anon_env_N`, a type name they never wrote (`append_closure_capture_note` in `ksplc/sema/session/ctx.kspls`).
* **It cannot be placed at the top level**, even with zero captures: the environment is a temporary on the caller's frame (`block_depth` in `ksplc/parse/desugar.kspls` decides it, and a diagnostic says so). So a reused predicate cannot be given a name. A function pointer can be named once and passed from several functions, while an API taking a `Callable` needs a closure in each function using it.
* **Diagnostics can name synthesized declarations absent from the source** (`_anon_env_N` / `_anon_env_new_N` / `_anon_env_v_N`), placed where the closure was written.
* **An outer name used in an anonymous function's body gives `undefined path or identifier`.** That suggests a typo, so the diagnostic adds that capture is impossible (`append_anon_fn_capture_note` in `ksplc/sema/session/ctx.kspls`).
  * A failed name has two reporting points (an undefined identifier, an undefined callee), so the wording is held in one place.

**The notation does not collide with the function-pointer type.** The type `fn(args): return` and an anonymous function differ only in whether a body block follows. The missing name after `fn` sets both apart from a definition (`decl_fn`), so one token of lookahead decides it.

**The function-pointer type cannot be withdrawn.** It serves an `extern "C"` signature, a hook stored in a `struct` field or a top-level variable, and a context with no allocator. None of these has anywhere to put an environment, for the reason a trait value cannot cross the C boundary (§7.1).

### 8.2 Whether a callback is received as a function pointer or as a `Callable`

**One question decides it: does the callback need captures?** Being a predicate does not make it a `Callable`. Keeping both kinds is selective extensibility, not duplication.

| Does it need them | How it is received | Example |
| :-- | :-- | :-- |
| Yes | `Callable1` / `Callable2` | `std/seq`'s `where` / `select` / `any` / `all` / `first_where` (without captures the predicate cannot be given what is searched for, leaving a bare `for`) |
| No | A function pointer | `std/fs`'s `skip_dir` (its natural predicate is a fixed set of names such as `.git` / `out`), `ksos`'s `on_idle` |
| It crosses the C boundary | A function pointer, **with no choice** | `std/thread.spawn`'s `entry`, which goes to `pthread_create` (`check_ffi_safety` stops a trait value) |

**Moving a callback that needs no captures to `Callable` shrinks what can be written**, since a closure cannot be named and reused (§8.1). `ksos`'s `on_idle` takes `semihost_console`'s `exit` from each demo's `ksos_main`; as a `Callable` it would need the same closure in every one.

**The judgment changes only "when a caller needing captures appears".** Only then is a zero-capture closure in a top-level `const` (a closure that can be named) worth weighing. Do not add it first. The LLVM backend lacks the ground for it (a fat pointer cannot be folded into a static initializer, stopping with `this global initializer is not a compile-time constant`), so it would cost about as much as making a function pointer placeable at global scope.

### 8.3 Where it is fine to move to `std/seq`

**A chain of `where` / `select` adds no allocation** (§9.2.1), so it does the work of a hand-written `for`. Only `to_list` allocates. A place using the chain twice needs it, since a second pass runs the predicate again per element. `order_by` / `reversed` / `distinct` stay eager and allocate a `List`.

Do not bring these into `ksplc`'s inner loops (tens of thousands of runs per compilation), nor into `std/` or `ksos/`. `ksai/`, with its examples `ksai/examples/qwen_infer` and `ksai/examples/llama_engine`, is out of scope too: it does inference and training per layer, token and element throughout.

**Only a loop that filters, maps or counts a `List` is replaced.** `std/seq` extends `List<|T|>`, so a loop over a slice (a `json.Val$[]`, a `U8[]`) stays. So does one that uses the index itself (`rejoin_replaced(lines, i, …)`), since `std/seq` has no variant passing a position.

### 8.4 Why a closure is not written after the call

**A closure passed to a call goes inside its parentheses, or is bound to a name first and the name passed.** There is no trailing closure (Swift's `xs.sorted { … }`, Kotlin's `xs.filter { … }`).

* **It would give one call a second spelling** (`f(xs, g)` and `f(xs) g`), which §9 turns away, to save a pair of parentheses.
* **The place it fills is taken.** A trailing closure fills the last parameter, where the standard library passes the arena (`order_by(cmp, arena)`). Either every such signature turns around, or the language takes on rules for which parameter it fills.
* **A condition could not be told from its body.** The indentation notation writes a condition without parentheses, so a closure after `if xs.any()` would open a level that reads as the `if`'s own.
* **A `return` inside would read two ways.** In what looks like a statement's body it reads as leaving the function, yet it leaves the closure.

When the body runs to several lines, the closure is bound first, its body indented under it:

```kspls
over: = fn(x: I32; floor: I32): Bool
  return x > floor
big: = count_over(xs, over)
```

A `fn` right behind a call's `)` is an error whose Note names both forms (`forbidden_spelling_hint` in `ksplc/parse/syntax_msg.kspls`). "Features not carried" in [`SPEC-language.md`](SPEC-language.md) lists it.

**What would reopen it**: calls that read as statements of their own, written many times over (SwiftUI's view builders, Kotlin's type-safe builders), where naming each closure first would become the bulk of the text. KSPL writes none.

---

## 9. One notation per purpose

**If the same thing can be written two ways, one of them is withdrawn.** So everyone produces the same source, and a writer's taste leaves the notation no room to diverge (Python's "There should be one obvious way to do it").

The decision goes in this order.

1. **Do the meanings coincide exactly?** If either can always be written with the other, one is unnecessary.
2. **Is it sugar?** If the expanded form can always be written, does the sugar give more than brevity? Used in hundreds of places, it meets a real demand for readability; used in a handful, it is withdrawn.
3. **Count actual use.** A notation the grammar accepts and nobody uses is a liability that only shows the reader an option.

**Sometimes both stay**: where each form has hundreds of real uses and removing one would cost expressiveness or readability. Compound assignment (`x += y`), `catch`'s block and expression forms, and struct literals' named and positional forms stay for this reason.

**Symmetry outranks the use count.** Declaring several variables in one statement (`a: I32 = 1, b: I32 = 2;`) has no real use at statement level, yet it stays. A C-style loop's init uses the same grammar rule (`decl_var`), and `for $i: = 0, $j: = 100; …` depends on it. The step can list several with `,`, so narrowing the init alone to one declaration would make init and step asymmetric within one loop. The rules a writer remembers would grow from one ("they can be listed with `,`") to two ("the step can be listed, the init cannot"). That costs more understanding than removing one option gains.

**What is given up: the code does not get shorter.** With little sugar, the same work takes more lines than where shorter forms are allowed; in return, only what is written happens. The extra lines have three sources.

1. **Lines that hold only a closing brace**, the price of braces that cannot be left out. They are a sizeable share of the brace notation's lines (convert any file with `ksplc fmt --to=kspl` and count them). The indentation notation (chapter 10) removes exactly those, losing no content, and its character count barely moves.
2. **Code that says who owns what**, the price of not hiding ownership, which stays.
3. **Functions `std/` lacks that would do a whole errand in one call**: not a price but a gap ("Known holes, and what would fill them" in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md)).

Note: **Even filling gap 3 barely reduces the line count.** With a round-trip function, `tests/tools/perf_guard.kspls` has as many code lines as without one (the `json` / `db` row of "Known problems KSPL handles" in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md)). Such a function removes duplicated key spellings and sentinel values filled in as defaults, not lines.

### 9.1 Notations not carried

| Notation not carried | The form that writes the same thing |
| :-- | :-- |
| `Fstring` (an `expr_primary` alternative) | `Literal` (a string literal) |
| Block comments `/* */` | Line comments `//` |
| The abbreviated error type `T?` | `T?I32` |
| Escapes outside the ten (`\b` `\x41` `\101`) | The character itself, with no backslash (`\\` for a backslash, `\uXXXX` for a code point) |
| A built-in `Char` type | `U8`, printed as a character with the format specifier `\{b:c\}` |
| Multi-byte character literals (`'あ'` / `'ab'`) | A string (`U8[]`); a character literal holds exactly one byte |
| A `defer` joined onto a declaration (`buf: = Str_builder.new() defer .free()`) | A `defer` of its own on the next line, naming what it cleans up (`defer buf.free()`) |

**Withdrawing a notation removes it from every place the source is read**: the grammar, and the compiler's own skipping of whitespace and comments. Removed from only one, a form the grammar refuses passes silently. Where the compiler reads comments apart from the grammar is "3.9 Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

#### 9.1.1 Escapes are closed at ten

**The escapes after `\` are closed at ten** ("2.3.2 Escape sequences" in [`SPEC-language.md`](SPEC-language.md)). Taking an unknown one as "the character itself" would make `\b` and `b` two spellings of one byte (Principle 6). A `'\b'` copied from C would silently pass as `'b'`, not 8 (Principle 5). The compiler holds the rejection in one place (`is_known_escape` in `ksplc/base/literal.kspls`), and `make test-negative` holds it.

**`\{` and `\}` are among the ten because interpolation is written `\{` … `\}`.** A bare `{` stands in the text as it is, with none of the doubling (`{{`) that Python's f-strings and C# require. `'\{'` is its counterpart in a character literal.

**`\uXXXX` takes exactly four hex digits** ("2.3.3 Writing a code point with `\uXXXX`" in [`SPEC-language.md`](SPEC-language.md)). A greedy form (C/C++'s and Python's `\x`) changes meaning when another hex digit follows. KSPL has no hex escape at all, so a fixed count closes that hole by itself. The braced form (Rust's, Swift's) is not taken, because `\u{0041}` would be confusable with interpolation's `\{` … `\}`.

**Nothing above U+FFFF and no surrogate is written with `\u`.** Java's surrogate pair belongs to UTF-16, and in KSPL's UTF-8 strings a pair is only an invalid byte sequence. Such a character is written into the UTF-8 source directly.

**`\u` is expanded only where a literal's bytes are decided, never before lexing**, so comments and raw strings pass through untouched. Java expands it before lexing, so a `\u000A` inside a comment breaks the file.

#### 9.1.2 There is no `Char` type

**A character literal holds exactly one byte.** If accepted, `'あ'` would silently give only its first byte. The same character written with `\u` is rejected, so two ways of writing one thing would give different answers. One rule judges the escaped and unescaped forms (`literal_fault` in `ksplc/base/literal.kspls`).

**There is no `Char` type because it would carry exactly one job.** It would have `U8`'s representation and values, and differ only in printing as a character in interpolation (`\{x\}`). Where one byte carries two readings, "as a number" and "as a character", the line between them belongs to how it is written. Split by type, one pass through a `U8` interface turns `A` into `65`, and the type guarantees nothing. `\{b:c\}` puts the line where it is written and says the same without a type (Principle 1 and Principle 6). It adds one notation and removes one type, so it is not an addition.

**Only `U8` carries `fmt_char`** (`std/strfmt.kspls`), for the reason hex has its own `fmt_hex`, so `:c` on another type is refused (docs/SPEC-language.md §3.6.2). Do not let `c` take a width, zero padding or thousands separators. With nothing to apply to, they would be written and do nothing (`char_alone` in `ksplc/parse/format_spec.kspls`).

**A character type may return, but not as eight bits.** A text type guaranteeing valid UTF-8, kept apart from `U8[]`, would yield a code point (32 bits) when iterated. Its name is undecided, and `Char` is not the leading candidate: the word names five different things across languages and suggests one byte (Go uses `rune` rather than reuse it). No word is reserved for it. A reservation works only once the name is decided, and then it is the design of the type. Holding `Char` would protect a candidate not in the lead. Holding a list grows the vocabulary for a type nobody has decided to build (Principle 1). A word reserved later breaks the code that used it, as Rust's `try` and `gen` do even with editions and `r#`. Here the breakage is the cheapest kind: a compile error at the declaration, fixed by one rename.

**If a word is reserved anyway, reserve it in sema's name check, not in the grammar.** A word blocked by the grammar's `_Keyword` gets the same "expected 'character class'" as `struct I32`, which does not say why it cannot be written.

#### 9.1.3 A `defer` is not joined onto a declaration

**Frequent use does not keep the joined `defer`.** Step 2 keeps a sugar used in hundreds of places, but this one saves only a name and a line, and it costs three things:

* **It would be the one statement that carries on behind a closed level.** Under `x: = f() catch` over a deeper `fallback` line, a `defer .free()` back at `x`'s column joins `x`'s statement. The indentation reader would need an exception for a line opening with `defer .`, the kind of word-keyed rule the conditional value gives up for brackets (§10.2).
* **It fills in a receiver nothing else fills in.** Everywhere else a leading `.` names an enum value (`.ok`), so a `defer .free()` moved to a line of its own would meet "cannot infer enum type".
* **It is written nowhere else.** A `defer` of its own on the next line is what Go, Zig and C's draft `defer` write, and what a model writes unprompted. No form bound to a declaration fills a receiver into an arbitrary call.

**The joined form guaranteed that nothing comes between an acquisition and its cleanup; that is the writer's to keep.** [W0110] asks about a way out in between (§4.4), and Go and Zig carry the same exposure. The specification says to write the `defer` on the next line (8.4.1 in [`SPEC-language.md`](SPEC-language.md)).

`defer` takes one statement, so the separate line costs only the name. With a block alone, the form would be `defer { buf.free(); }`, the one `;` the indentation notation would show. **What holds it**: a `defer` behind a statement is refused with the line to write (`append_trailing_defer_hint` in [`../ksplc/parse/syntax_msg.kspls`](../ksplc/parse/syntax_msg.kspls)). A `defer .free()` standing alone is refused by name (`reject_receiverless_cleanup` in [`../ksplc/sema/body/stmt.kspls`](../ksplc/sema/body/stmt.kspls)). `make test-negative` holds both.

### 9.2 One mechanism per purpose

**Two mechanisms that serve one purpose are also gathered into one**, for the same reason: with two, the reader must work out from a type or a signature which convention a place follows. Record the form not carried as well as where it was gathered, or the same proposal comes round again.

**What has been gathered is recorded with how a departure is noticed.** Iteration, failure, unwrapping an `Option` and translation-time conditions need more than a row, and follow the table.

| Purpose | Where it was gathered | How a departure is noticed |
| :-- | :-- | :-- |
| Importing a file | `as` only to rename; unmarked when the name stays | lint [I0310] |
| Iterating n times | `for x in Range.asc(n)`; a C-style three-part loop only when the body changes the index or the bound | — (the count would be evaluated differently, so it cannot be gathered mechanically) |
| Heap allocation | `alloc_as<\|T\|>()` / `arena.alloc_as<\|T\|>()` / `heap_alloc_as<\|T\|>()`; `alloc(<byte count>)` for raw bytes only | `alloc_as` in `std/mem.kspls` |
| Boolean conjunction and disjunction | `&&` / `\|\|`; `&` / `\|` when both sides must be evaluated. `*` / `+` would work identically over `_Bool`, so they are rejected at translation time | `make test-negative` (what is rejected) and `ksplc/tests/bool_ops_test.kspls` (what is kept) |

#### 9.2.1 Iteration

**There is one way to write iteration, `for x in`.** It expands by index or by `std/lang`'s `Iter<|T|>`, but the writer chooses neither; the type decides (docs/SPEC-language.md, 7.2). The point is not to add notations: no form drives an iterator by hand (`for it.has_next() { … }`). `Iter` has only `next` for the same reason, since a separate "is there more" would make it possible to call only one of the two.

**`Iter` wins on a type satisfying both** (the rule is docs/SPEC-language.md, 7.2), because a structural match alone must not silently disable what was declared explicitly (Principle 5).

**Which `std` APIs are eager and which lazy**, what each costs, and why a chain can be driven any number of times are `std`'s own design ("Iteration has one notation" in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md)). Do not add terminals. Counting, folding and searching are all written with `for x in`, so each one added is a second way of doing the same thing.

**Nothing is eager because closures cannot be held.** A struct holding a predicate can be written, since the environment rides on the caller's frame (§8.1). It lives while the chain is built and consumed there. What cannot be written is a function creating a closure and returns it (§4.3).

**The lazy chain rests on four properties of the language.** The first is the `Iter` above, which puts even a sequence with no `.len` onto `for x in`. The other three let the chain be written with methods.

* **A method can return its own type one level deeper** (`Seq<|S|>.where(): Seq<|Wh<|S|>|>`), and a level advances only as far as the user wrote.
* **A method can introduce a new type argument** (`fn select<|U|>`), bound at the call site ([§2.4](#24-a-type-argument-with-nothing-to-bind-to-is-rejected)).
* **A closure literal passed directly still fixes the type argument.** Its type, a synthesized environment (`_anon_env_N`), declares no generics of its own. So the argument is taken from the instantiation of the `Callable1` it declares (`implemented_trait_key_of` in `ksplc/sema/type/env.kspls`).

**The stage types nest** (`Conv<|Keep<|List_seq<|T|>, T|>, T, U|>`), and every stage repeats `where` / `select` / `to_list`. So a new kind of stage grows `std/seq` multiplicatively. Rust's `Iterator`, Java's `Stream` and Swift's `Sequence` remove this repetition with default bodies. Which of the three a trait's default body could take in KSPL, and why each stays per stage, are std's own design (["Why the chain's stages cannot be folded"](../std/docs/DESIGN.md#why-the-chains-stages-cannot-be-folded) in [`../std/docs/DESIGN.md`](../std/docs/DESIGN.md)).

#### 9.2.2 Failure

**There is one way to convey failure, `T?E`**: `?Io_error` in `std/io.kspls` and `?Fs_error` in `std/fs.kspls`, with no `Option` or `Bool` mixed into the same file. `exists` / `is_dir` stay `Bool`. They answer a question, and "does not exist" is a normal answer, not a failure.

#### 9.2.3 Unwrapping an `Option`

**There is one `if` for unwrapping an `Option`, `if name: = expression`.** The form declaring a name inside the condition with `;` (`if v: = X; v == .some`) is not carried. The two serve different purposes: `;` says where a name lives (scoping), and `if name: =` how the contents come out (unwrapping). The `;` form binds the `Option` itself, so most real uses would gain a line of unwrapping each. Nor does the `v == .some` checked in the condition carry into the block. That leaves a check writable and ineffective (Principle 5); making it effective needs type narrowing. Scoping alone does not justify it either. Shadowing is rejected (lint [I0501]), a bare `{ … }` already scopes, and chaining while keeping the contents bound is the `,` form's job.

#### 9.2.4 Translation-time conditions

**Translation-time conditions keep removing and reporting apart, and unequal.** `#cfg(flag)` drops a declaration and takes one flag name, with no comparison and no `&&` (docs/SPEC-language.md §10.1). `##error` / `##warning` emit a diagnostic and take a foldable expression (`sizeof(Sz) == 8`).

* **A mistake shows in opposite ways.** Misread the condition, and `#cfg` drops the declaration with no message, while `##error` emits a diagnostic. Richness on the silent one alone erases the clue to the mistake.
* **They run at different stages.** `#cfg` drops before declarations are gathered (`ksplc/parse/normalize.kspls`). Neither names nor types are resolved then, so the material for a comparison is absent. `##error` is evaluated after types are attached (`ksplc/sema/body/infer.kspls`). A comparison in `#cfg` would need arithmetic apart from the language at a stage with no types, the preprocessor's shape.

**An attribute is either interpreted by both backends or explicitly rejected by one.** None is silently ignored under `--target=llvm` ("An attribute is either interpreted in both backends, or refused outright in one" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

#### 9.2.5 Things that look like duplication and are not

**Two things suited to different situations both stay.** `std/thread.kspls` and `std/reactor.kspls` can both "handle many connections", and which to use is in `std/docs/DESIGN.md`. `Index` / `Index_mut` / `Index_place` are each needed (docs/SPEC-language.md §6.1). They serve elements with no address (`Range` / `sys.Args`), a write whose destination does not exist yet (a new key into a `Map`), and a body that becomes an lvalue (`List`).

**Two forms whose writable positions exclude each other are not two ways of writing one thing either.** Gathering them leaves a position where nothing can be written.

| Purpose | The two forms | The position where only one can be written |
| :-- | :-- | :-- |
| Typing an integer | The suffix `5I64` / the prefix cast `I64::5` | The suffix **checks the range** (`300U8` is an error); the cast is an instruction to **truncate** and does not check (`U8::300` passes). The requirements are opposite, so neither can be written with the other |
| An enum variant | Implicit `.some(x)` / type-qualified `T.some(x)` | The implicit form needs an expected type to descend (`y: = .some(1)` is refused with `cannot infer enum type for implicit variant`); there, only the type-qualified form can be written |

**Nor is a `const` inside a function.** It looks like an unmarked immutable binding (`n: Sz = 4;`). But only a `const`, fixed at compile time and holding no memory, can size an array (`I32$[n]`; the unmarked one is refused with `array size must be a positive constant expression`).

**A raw pointer's `null` remains in three places only.** `Option<|T|>` says whether a value is present, and lint [H0704] finds a raw pointer's `null` being returned. `T?E` is not an option here: it says "it failed, and this is why", not "there is no value" (the "one way to convey failure" above).

| Where it remains | Reason |
| :-- | :-- |
| Under `std/` | Foundational primitives: moving to `Option` would require rewriting every caller |
| Functions carrying `#export` | The FFI boundary with C: `Option<\|T\|>` is not ABI-compatible with C's null convention |
| Tree walking in `ksplc/base` (`find_child` / `unwrap_top_level` / generating notation) | The same reason, suppressed with its grounds in the file-opening `##lint(H0704 = off)` |

**No unmigrated case can exist outside these three**: the repository requires zero even at Hint level (`make lint`).

### 9.3 A default argument is allowed only for a foldable constant

**A parameter at the end of the list may carry `= literal`, and the caller may then omit it** (docs/SPEC-language.md §8.1.1).

One ground is real demand, meeting the "hundreds of places" of step 2. Almost every call of `str.starts_with` passes `0` for `offset` (to recount, `grep -c "starts_with(.*, 0)"`). The other is symmetry. A struct literal may omit a field and get the type's zero. A parameter that could not be omitted would grow the rules a writer remembers from one ("a named slot may be omitted") to two ("a field may, a parameter may not").

**It is not the same rule as omitting a field.** An omitted field gets the zero the type decides, while a default argument is the writer's choice. The difference is held to "one constant appears", so only a single literal is allowed. An expression would let allocation or side effects happen without appearing in how the call is written.

**"Is it a foldable constant" is the condition for entry, not the reason to enter.** The second guard is whether the shorter call lies to the reader. `null` is a constant, but an arena `= null` hides "omit it and it allocates on the global heap, with the caller owning the free" behind the shorter call.

**Where it cannot be placed**, and why, is the table in docs/SPEC-language.md §8.1.1. Each is rejected with a diagnostic (`ksplc/tests/negative/param_default_*.kspls`). A trait's declaration may carry one (the same section; `Index_place.at` in `std/lang` takes this form).

**Where defaults stand**: `Block.add_text`'s `style`, `calc.recalc`'s `editing`, `strfmt.write_int`'s `width` / `fill` / `comma`, `strnum.parse_size`'s `start`, and editing's `extend` / `back`. What the second guard turned away is recorded, so the same discussion is not had twice. The list is an arena (`Map.entry_list`; above), an environment's timing (`delay_us`), a grab tolerance (`drag_edge`'s `10.0`), a character to search for (`seek`'s `']'`), and a person's name. Each is a foldable constant whose omitted value is itself the judgment.

**What is given up**: a call's text does not show how many arguments it passes, so the reader looks at the declaration. Distributed with `--emit-decls`, a client with a stale declaration file builds with the stale default. So one program ends up with two defaults and no diagnostic. Being literals, defaults copy across as written (the same set as `render_const_value` in `ksplc/tools/decls.kspls`).

### 9.4 Why `import` and `#export` are not made a matched pair of words

**They look like a pair, but act on different axes.** The opposite of bringing a name in (`import`) is hiding one (not writing `pub`). The opposite of emitting a symbol (`#export`) is using an outside one (`extern "C"`). Two axes are not expressed with one pair of words; the list of axes is in [`SPEC-language.md`](SPEC-language.md), "9. Files and import".

**The only languages that pair the words are C++20 (`export module` / `import`) and Java's `module-info` (`exports` / `requires`), and in each the pair reaches past naming.** Java makes visibility the product of two declarations, and C++'s modules give up the premise that a translation unit is independent.

**The words do not change.** A keyword like Zig's `export fn` would make `#export` look as if it decided linkage too. Visibility decides that, and `#export` touches only the symbol's name. Nor is it renamed `#c_name`: on wasm32 the attribute also means "make it an export", so `c` would be a lie ([`SPEC-language.md`](SPEC-language.md), "11.3 Exposing a KSPL function to C (`#export`)").

**A combination that becomes ineffective across the axes is rejected** (docs/SPEC-language.md §11.3): `#export` on a `priv`, whose generated C is `static`, and on a method. For a method the reason is the uniqueness of the name, not visibility. Symbols share one namespace across every link target, so only a name unique on its own can go out bare. A method's name is not unique without its type (`bump` can exist once per type).

**This is a language rule, not a lint.** A lint runs only when run, and only over the target files, so the same notation in another file would be accepted. It carries no code, like the other spellings that bring nothing about ("The list of diagnostic codes" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

### 9.5 Every item in a declaration block ends with `;`

**Declarations lined up inside `{ … }`, a `struct`'s fields and an `enum`'s values alike, end with `;`, the last one too.** So a block has exactly one mark that says "end". The rule is "2.5 Blocks and statement ends (brace and indentation notations)" in [`SPEC-language.md`](SPEC-language.md).

**`,` keeps its own job.** `;` is the end of a declaration, and `,` is a list within one notation. So the rule allowing a trailing `,` ("2.4 Trailing commas" in [`SPEC-language.md`](SPEC-language.md)) applies only to lists.

**The C family's shape is not taken.** There, `,` separates names inside an `enum` that is one whole declaration closed by `;`. KSPL's `enum` sits at the same level as `struct` with no closing `;`, so that footing is absent. A list mark inside a block would make the mark that says "end" vary from block to block.

**The formatter never keeps two on one line** (`enum E { a; b; }` is always split), so a value's `,` has no job of separating within a line either.

**The rejection of a `,` there carries a Note stating the rule.** The expected set alone (`expected …, or ';'`) does not read as "it is `;`, not `,`" (`forbidden_spelling_hint` in [`../ksplc/parse/syntax_msg.kspls`](../ksplc/parse/syntax_msg.kspls)).

---

## 10. The indentation notation (`.kspls`)

**The same program can be written in `.kspl` (braces) or in `.kspls` (indentation).** There, indentation, dedentation and newlines say what `{` `}` `;` say. The rules for both are "2.5 Blocks and statement ends (brace and indentation notations)" in [`SPEC-language.md`](SPEC-language.md); this chapter holds why the second notation is kept and why its rules are what they are. The reader ([`../ksplc/parse/layout.kspls`](../ksplc/parse/layout.kspls)) rewrites it into the brace notation before parsing (§10.5). The grammar holds, in the names of its rules, which symbols it replaces (§10.1).

**Both notations are kept**, through the decision order of chapter 9:

1. **The meanings coincide exactly.** Each can be produced mechanically from the other (`ksplc fmt --to=kspl` / `--to=kspls`).
2. **It is sugar.** The expanded form (braces) can always be written.
3. **Actual use meets the bar for indentation, not for braces.** The repository is written in indentation, every package included. What is written in braces is material, not code that runs. It is the sources in `ksplc/tests/negative/` broken on purpose, a lint case in `ksplc/tests/lint/`, and the twin pairs in `ksplc/tests/kspls/`. Some of the broken sources break before parsing, so no tool can convert them; some expect a diagnostic naming a `{`, `}` or `;` outright.

**So the default is the indentation notation**: a logical name with no extension means `.kspls` (§10.5).

**The brace notation is kept as the exception**, on a ground the count does not give: the material is written in it. The shapes the indentation notation refuses (a block with no body, a ragged column, a forgotten `;`) can be shown only there. It is also how a reader from C, Rust or Swift reads KSPL.

**The condition for revisiting**: once outside use becomes countable, count which notation it is written in. Neither notation is folded while the material still needs braces to say what it says.

**There is one canonical source and two appearances**, held by a check, not by prose (`make test-kspls-trip`, §10.6).

**No rule says which notation to write in**, not even "one or the other per folder". Aligning them does not change that two ways exist, so this principle gains nothing. Aligning within a folder for readability is the writer's freedom.

### 10.1 What disappears, and what does not

**Only blocks and terminators disappear**, and every other brace or `;` stays as it is written. The table of which is which is in "2.5 Blocks and statement ends (brace and indentation notations)" of [`SPEC-language.md`](SPEC-language.md).

Note: **The grammar names them too.** A block's opening and closing braces and the terminating `;` are the rules `Block_open` / `Block_close` / `Stmt_end`, listed in the header of [`../ksplc/kspl.kspeg`](../ksplc/kspl.kspeg). How that list is kept in step with the tree is "Keeping the grammar and the AST node kinds in step" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md).

**No mark (`:`) is placed on a block's heading.** Python opens a block with `:`, but KSPL's `:` already serves type annotations and labels, and this would be a third meaning. Instead, a wrapped line and a block are told apart by how they are written; the three cases in which a line continues are in the specification's section above. Python's "only inside brackets" is not enough, because formatting also wraps outside brackets (starting the line after `b.s(…)` with `.s(…)`).

**`catch` is the one word that both continues a line and opens a block, and the one form the symbols alone do not decide: the column decides.** So a line is never broken after `catch`. A break there would put the two readings at the same column: the handler would be read as the block's first statement, and the value it stood for would be lost. `ksplc fmt` refuses that break and runs past the width instead ("The formatting settings (`--style`)" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). `ksplc/tests/kspls/tour.kspls` and its twin carry the shape, so the refusal cannot be dropped unnoticed.

### 10.2 How a column is read

**Only the heading's column is stacked**; how deep a block's body is indented is not remembered (`Frame` in `ksplc/parse/layout.kspls`). So no width has to be fixed: a block indented by 2 and one indented by 4 can mix in the same file.

**The price would be that a depth matching no block enters the inner block.** Take a block whose heading is at column 2 and whose body is at 6. A line at 4 would join the block, while the reader sees it stand shallower than its siblings and reads it as outside. Two readings give two programs.

**So it is refused.** Python stacks the body's column too and cuts the same shape off with `IndentationError`. Here the line is compared with the block's own members instead. That leaves wrapping free, since a continuation is folded into its logical line before any column is looked at. The refusal carries no code: a code can be switched off by a project setting, and what would go quiet is a difference in what runs ("5.4 The list of diagnostic codes" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md) names the others handled so). `ksplc fmt` rebuilds the columns, so no formatted source meets it. The reader returns what it finds as a value, and the compiler prints it once, with every other diagnostic (how: "3.9 Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

**Indentation is written with spaces.** Several characters look like a space and are not, and none of them counts as a column, so such a line leaves the block enclosing it. Do not make a tab count. Its width is the editor's setting, so counting it would allow a line that lines up on screen while the columns differ. The tab gets no diagnostic code: a line pushed out to column 0 gets a syntax error first, so a code would never fire. The rewriting stage does find it, and `ksplc/tests/layout_indent_test.kspls` pins that.

Note: **Japanese input most easily slips in the ideographic space.** The syntax error it causes says nothing about the cause, since on screen the line looks correctly indented. So `odd_indent_name` in `ksplc/parse/syntax_msg.kspls` adds a Note naming the character, as Python names it in `invalid non-printable character U+00A0`. It is a Note rather than a lint because the syntax error comes first and never reaches sema.

**A lone `return`, `throw` or `fallback`, and a `?` at a line's end, end the statement.** A bare `return` returns nothing, and `f()?` is a rethrow, so neither waits for more. A `?` at the start of a line continues one (a wrapped `T?E` type). That is the one place where a line's end and its start are read differently.

**A value that splits where no mark continues it goes in parentheses.** Two values are written with words that also stand alone. In a conditional value (`a if c else b`), an `if` / `else` at a line's head or end reads as a statement's heading. In the value of a `return` / `throw` / `fallback`, the keyword alone is a bare statement. A newline inside brackets is never a level, so the parentheses carry either across lines with no rule of their own.

* **Why not a word-keyed rule for each.** Such rules are `else` / `if` at a line's end continuing it except behind a `}`, a lone `return` taking a deeper line below as its value, and the reverse of `catch`'s reading of the same shape. A writer would have to know which break points are read back (after `else` yes, before it no), while those not read back say nothing about why. The products that key exceptions on a line's leading word (F#, Scala 3) keep adding to the list.
* **Why the value still comes first.** A condition-first form (`if c then a else b`) starts the value with `if`. So every value moved to a line of its own would put `if` at the line's head, which is the misreading the rule removes. `a if c else b` never starts with its `if`, and every reader from Python already knows it.
* **`ksplc fmt` puts them in.** A conditional value that must split outside every bracket gets parentheses, and breaks between its choices, never between an `if` and its condition. A `return`'s value stays on the `return`'s line, with a string carried on and a call broken inside its own brackets (`paren_spans` in [`../ksplc/fmt/printer.kspls`](../ksplc/fmt/printer.kspls)). A break a writer puts outside the brackets is refused, and the message names the parentheses (`append_split_value_hint` in [`../ksplc/parse/syntax_msg.kspls`](../ksplc/parse/syntax_msg.kspls)). `ksplc/tests/negative/laid_choice_split_*.kspls`, `ksplc/tests/negative/laid_value_below_return.kspls`, and the formatter's case "a value too long for its line" in `make test-fmt` hold it.

### 10.3 The forms whose notation is fixed

**A block with no name declares itself with `_`**, though naming it is better where it can be named (below). `break` / `continue` to a `_` label are not possible. `_` can be written any number of times in the same scope, so what it points at is not fixed (`ksplc/tests/negative/break_to_no_name_label.kspls` pins the refusal).

**A bare block carries a label**, because a block with no heading cannot be told from a continuation of the previous statement. The label states what the block exists for. A bare block always exists so that something runs on exit, and that something becomes the name (`release_on_exit` / `while_locked` / `until_exit`). Do not generate names mechanically. A meaningless name (`scope1`) changes the text across a round trip, and leaves the reason unknown until the inside is read. The rule applies to the brace notation too, since splitting it between the notations would leave only one of them to go stale. The compiler holds it: `stmt` does not use `stmt_block` (`ksplc/kspl.kspeg`), so a bare block parses in neither notation, and the message names the label to put on. `ksplc/tests/negative/bare_block_without_label.kspl`, and the one-line shape beside it, pin the message.

**Two forms keep their braces in `.kspls`.**

* **A closure with a multi-line body inside a call's arguments**, since a newline inside brackets does not become a block.
* **An empty block, and a block fitting on one line**, since indentation cannot say "there are no contents", and a comment line does not make a block. No word such as `pass` is added. Python needs one because it has no brace notation, and here it would split the grammar per notation (Principle 1 and Principle 6).
  * No terminator follows such a block (`fn f() {};` is not in the grammar). The heading word tells it apart from `x: = T::{ … }`, which also ends in `}` but is a value and needs a terminator.
  * **The last statement of such a block takes no `;`**. Otherwise that `;` would be the one terminator the notation still shows, and a writer who types the block the way Go or Swift spells it would get `expected ';'`. The reader puts it back before the `}`, by the rule a line's end follows: a statement ending in `}` takes one unless its heading opens a block (`supply_block_end` in [`../ksplc/parse/layout.kspls`](../ksplc/parse/layout.kspls)). Only a `}` on the same line supplies one, so no line break changes what a statement means, as JavaScript's does when a `return` ends its line. `ksplc fmt` leaves it out in `.kspls` and writes it in `.kspl`. The grammar is not touched, so the brace notation keeps its one spelling.

### 10.4 No lines are added, and `switch` gets no block

**No lines are added, so line numbers agree in both notations.** A diagnostic's line, a jump-to-definition target, and a hover position all point at the line of the `.kspls` the writer is looking at.

Columns shift only at the end of a line (back by what was inserted), so the columns before an end-of-line comment do not change. **The `;` a one-line block leaves out stands in the space before its `}`**, so it moves no column either. With no space there it is inserted, and the rest of that line reads one column late until `ksplc fmt` puts the space in.

**Do not make a block under `switch`.** `switch` carries no braces (its `case` and `default` do). So the first `case` goes on the same line as `switch`, and each later one at the `switch`'s column, which is the column of the brace notation's `} case … {`.

**Do not align with Python.** Its `match` carries a block of its own, so one level is required. KSPL's `switch` does not, so a level there creates a block where no brace exists. That departs from "only blocks and terminators disappear" (§10.1), and makes the reader carry a special case for `switch`.

### 10.5 Only one stage rewrites, and only before the parser

**Only one stage, before the parser, rewrites anything.** `ksplc` reads `.kspls` directly ([`../ksplc/parse/layout.kspls`](../ksplc/parse/layout.kspls)). The grammar, the tree and every later stage stay one. What is passed on is ordinary KSPL notation, so semantic analysis, generation and the language server do not know the difference. The rewriting runs exactly once at each place a source enters, the disk and the editor, which the compiler holds ("3.9 Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

**Only the default extension is dropped from a logical name** (the rule is "9.1 import syntax and path resolution" in [`SPEC-language.md`](SPEC-language.md)). A logical name is a file's identity, so `a.kspl` and `a.kspls` in the same folder must not look like the same name. The name carrying nothing is the default one: a `.kspls` drops its extension, and a `.kspl` keeps it.

Caution: **Do not place two files that differ only in notation under the same name in the same folder.** An `import` without an extension looks for the indentation notation first, so one would silently be read as the other. Only the twins in [`../ksplc/tests/kspls/`](../ksplc/tests/kspls/) share a name, and they are pairs checked to be the same program.

**So an import that writes no extension asks for the default first and the other next, then names the file as found** (`name_as_found` in [`../ksplc/base/locate.kspls`](../ksplc/base/locate.kspls)). A file read under one name and spelled out again under another would cause a diagnostic pointing at a missing file. Its symbols would not be the ones it makes when built as an entry point. Writing the extension skips the asking, which costs one `stat` per import name.

**Which extension is dropped and which is added back are one decision, not two.** Wherever a logical name is written out again (a diagnostic, a `#line`, the language server's document URI), the default is added back. So dropping the other one would have each of them name a missing file. Both read `default_ext` in [`../ksplc/base/core.kspls`](../ksplc/base/core.kspls).

Note: `make test-kspls` watches that the twins are the same program, and that squiggles, hovers and jump-to-definition point at the indentation notation's lines.

### 10.6 Formatting, and the round trip that holds the two notations to one program

**Formatting erases raggedness.** `ksplc fmt` rebuilds indentation from the tree. So once `make fmt` runs, unintended raggedness shows as a diff, lined up to the compiler's understanding.

Note: So the ragged column's material (`../ksplc/tests/negative/laid_ragged_sibling.kspls`) sits where the formatting gate does not reach (`mk/lint.mk`). Formatting it would line the columns up and stop it being material.

Formatting emits the same notation as its input, so both notations sit inside the same formatting gate (`make fmt` / `make test-fmt-tree`). How `--to` changes the notation, and why `--in-place` cannot write a changed one back, are in ksplc/docs/SPEC-tools.md §3.1. **Do not put only one of them in the gate**: the one left out becomes "a notation nobody formats", and each writer's habits stay in it.

**A round trip returns the bytes it was given.** `make test-kspls-trip` puts every tracked source into the other notation and back. It refuses one that comes back differing by a byte, naming the first line that differs. All of them go through, since samples give no answer to "may this be widened" (Principle 8). What is compared is the source itself, not a second round trip: a reading that goes wrong reaches a fixed point as firmly as one that goes right.

**One thing the brace notation can write has no line in the indentation notation, and it is reported, not refused or moved.** A comment behind a `}` that the indentation notation leaves out lands on another line there, and does not come back. It is a lint (`[I0805]`, in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)) rather than an error, because where a comment stands changes nothing that runs. The formatter does not move it. In the brace notation that placing is the writer's own (`if c { n += 1; } // only when c`), and a new one would say something else. The indentation notation gets no closing mark for such a comment to stand behind, because that would give a block's end a second spelling (Principle 6). The lint asks the formatter which comments it moves (`note_displaced` in [`../ksplc/fmt/trivia.kspls`](../ksplc/fmt/trivia.kspls)), so the report and the conversion cannot disagree. The question costs a parse and a printing per file written in braces. It costs nothing for one written by indentation, which never wrote a closing line.

**A comment behind a `}` that the indentation notation keeps stays where it stands**, since that `}` is typed in both notations. Only a `}` the reader put in passes its comment to the line before, because the reader puts one behind a line's code, never at a line's head (`pull_trailing_comment` in [`../ksplc/fmt/trivia.kspls`](../ksplc/fmt/trivia.kspls)).

Note: Static analysis (`make lint`) takes either notation, so `tools/` sits in this gate too.

**The editor extension holds no copy.** The colouring rules, brackets, auto-closing and comment notation are the same in both notations, so they point at the same file (the `.kspls` grammar merely imports `source.kspls`). Only the snippets differ in content, since braces and `;` disappearing is what this notation is. `make test-vscode` watches that their roster (`prefix`) agrees in both. The language ids are separate, and both are sent. The extension sends the language server only documents whose id it knows, so placing `.kspls` with no id would bring neither squiggles nor hovers.

---

## 11. How the source text is written

**Nothing this chapter decides changes what a program does**, and a gate, not habit, holds each rule.

### 11.1 A name's prefix is added only when the name cannot state its own origin

A prefix (the `io.` of `io.out()`) is **part of the name, showing at the use site**. Where the name alone says what the thing is, the prefix says it twice. Where it does not, fix the name, not the prefix.

**A name may enter the unprefixed space (selective import; docs/SPEC-language.md §9) only if all three hold:**

1. **Its spelling says what the thing is.** `Arena`, `Tensor`, `Option` and `Str_builder` do; `Node`, `Val`, `Entry`, `Config`, `run`, `init` and `out` do not.
2. **Its spelling is unique across the program.** A collision is always a compile error, so a colliding name cannot enter.
3. **Its origin carries no design information.** Only a reference crossing layers does (`ksplc/`'s `parse` / `sema` / `lower` / `gen`); coming from `ksplc/base/` or `std/` tells the reader nothing. A name crossing layers enters with the layer in the name (`Sema_ctx`, `Genc_ctx`).

**A name's spelling is fixed once per name, not per file.** `mod.Name` in one place and `Name` in another is one thing written two ways, which chapter 9 forbids. Inside one file it looks like two things.

**No line can be fixed by kind.** Types and functions alike can be legible (`Arena`, `percent_decode`) or not (`Node`, and `run` or `init`, which many files declare), so the conditions apply to both.

**What is given up**:

* **An unprefixed name loses its origin at the use site.** The reader finds it on the file's `import` lines, where a selective import lists the names it brings.
* **A name legible unprefixed is redundant with a prefix** (`base_ast.Ast_node` says it twice), so each name goes one way.
* **Condition 2 breaks if the same spelling appears elsewhere**, as a compile error, never as a silent pointer to something else.

### 11.2 The spelling of reserved words is taken from C

**Syntax doing C's job takes C's spelling** (`switch` branches, `for` repeats), not C's behavior. `switch` does not fall through, and `for` covers C's `for` / `while` / `do-while` and sequence iteration in one word (`docs/SPEC-language.md`, 7.1 and 7.2). There are two reasons.

1. **The names left to a writer do not shrink.** C's reserved words are usable as identifiers (`docs/SPEC-language.md`, 2.2). A keyword of KSPL's own would take one more word out of the identifier space, where C's spelling takes words that overlap with C's. `match` and `loop` are common nouns, needed exactly where one names a match's result, or a loop.
2. **The reader does not look it up again.** A reader of C reads `switch` and `for` on sight; a new spelling for the same meaning must be looked up once.

**Being one word and being spelled `for` are separate decisions.** The first follows from "every repetition serves the same purpose" (`docs/SPEC-language.md`, 7.2), with Go's single `for` as the precedent. The second is this section's rule.

**One word costs the checks nothing.** Whether a loop ever ends is read from its shape, not from a keyword: a `for` with no condition that no `break` leaves never ends, so a function may end on it, and what follows it is unreachable (`docs/SPEC-language.md`, 7.2). A separate word for the endless loop would give the checks nothing the shape does not, while the writer would have one more word to choose between. Where each `break` goes is settled once, when the compiler resolves the `break`, and the missing-return check and the unreachable-code warning read one judgement of it (`is_endless_loop` in `ksplc/base/ast_ext.kspls`), so they cannot disagree (Principle 6).

* **A constant `true` is a condition.** Reading `for true` as endless would make the check fold constants, and give one meaning two spellings. `for true` gets a warning instead, whose fix is the bare `for`.
* **The shape spares the writer a dead `return`.** Were the loop read as one that can end, a `return` that never runs would be demanded after it, nothing would warn that it never runs, and loops would be bent into a flag and a `break` to avoid it.

**Another name for a type is `typedef`, name first** (`typedef Id = I32`; `docs/SPEC-language.md`, 3.5). The job is exactly C's: a KSPL typedef is only another name ([2.9](#29-a-typedef-is-only-another-name)), as C's `typedef` "does not introduce a new type, only a synonym" (C11, 6.7.8), and the C backend writes one for each. The order is not C's. C puts the name where a variable's would stand in a declarator (last in `typedef int Id;`, mid-way in `typedef int (*Op)(int);`). KSPL writes a type whole (`fn(x: I32): I32`), so C's order would only put the name behind it. Rust, Swift, Go and C++'s `using` put the name first too, and reason 1 holds: `alias` and `type` stay free for a writer, where Rust's `type` costs every field called `type`.

**What is given up**: `typedef` reads as "define a type" and defines none, which C's standard itself must say. A reader from C takes it as meant, and one who expects a new type finds the one-field struct in Appendix A of `docs/SPEC-language.md`. A C writer's `typedef I32 Id;`, and the other languages' spellings of an alias, fail with a note writing the line in KSPL's order (`append_typedef_spelling_hint` in `ksplc/parse/syntax_msg.kspls`).

Caution: **Where the spelling is the same but the behavior differs, the specification must say so by name.** The same spelling invites the reading "presumably the same", and silence lets that misreading through (`docs/SPEC-language.md`, 7.1 names that `switch` does not fall through).

### 11.3 The line terminator is the file's spelling, not the program's

**Every `\r\n` becomes `\n` where the source enters** (`to_lf` in [`../ksplc/parse/source_fix.kspls`](../ksplc/parse/source_fix.kspls)), beside the BOM and the shebang, which are likewise the file's spelling. A `"""` text holds its bytes, line terminators included. Otherwise one source would be two programs, one per way an editor ends a line, and no check would see it: both checkouts build, pass, and disagree. Every language with a multi-line literal fixes it at the same place.

**Writing it back is the other half.** `ksplc fmt` writes `\r\n` back where the file used it, as it does the BOM ("The formatting settings" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). So a Windows checkout does not show every line as changed, the whole-file diff Prettier's move to `endOfLine: "lf"` met.

**Every place a source enters takes this step**: the disk, the formatter and the language server. A place that skips it answers about a different program from the one a compile sees. They share one step, `settle` in [`../ksplc/parse/source_fix.kspls`](../ksplc/parse/source_fix.kspls), so none can be skipped (the places are listed in "3.9 Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)).

**What a program writes is the output half of the same question**, and on Windows it is decided for every program at its entry point (§7.4).

### 11.4 Carrying a long string literal across lines

**A string literal is the one thing on a line a formatter cannot narrow by itself**, because its bytes are the program. Without a way to carry a string on, a formatter breaks everything else on the line and stops at the literal. Narrowing it then means splitting the call by hand into several `.s(…)`, changing code to fix layout. The width check misses it too, since it reads only lines that *begin* with `//`.

**A `\` at a line's end carries the text on, stands for no byte, and takes the next line's indent with it** ("Escape sequences" in [`SPEC-language.md`](SPEC-language.md)). So indenting the block moves no byte, and `ksplc fmt` can lay a literal out like anything else. What is carried on stands one step in from its opening line, as a `//<` run does. At the opener's column it would look like a line beginning something of its own.

**A mark, not two literals side by side.** C, C++ and Python join adjacent literals, and clang-format, the one formatter in wide use that narrows a literal, relies on that. But `U8[][2]::{ "a"` with the comma forgotten and `"b" }` below it is a syntax error. Adjacency would make it a one-element array that compiles. That is a daily exposure in a tree that writes `::{ "a", "b" }` in every test file, and a common complaint that lint rules are written against. Turning a refusal into a silent merge is the shape Principle 8 refuses. Exempting `::{ … }` would be a rule with a hole in it, needed every day.

**Nor is `+` the spare path.** `"one" + "two"` is refused with its own sentence (*slices have no arithmetic or ordering*). Reopening it for literals would give `+` one meaning on a literal and another on a value, the second means Principle 6 refuses.

**The space at the seam cannot be seen** (`"… for it. \` against `"… for it.\`, at the right margin). The answer: only the formatter writes a seam. One edited by hand is broken again elsewhere, and `make test-fmt-tree` shows the file as changed. A check on the seam would not answer it. Nothing tells a dropped space from a deliberate break inside a long word, so it would need an exemption, and an exemption is how a check stops saying anything.

**KSPL formats around what it cannot narrow rather than going quiet**, which is a common complaint against formatters. What stays over the width is what has no seam: a literal with no space (a URL, a JSON fixture, one long identifier), one whose only spaces are inside a `\{ … \}`, a word longer than the line (half a word is worse than a long line), and an overrun that is not a literal ("The formatting settings" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

**The formatter counts bytes and the width check counts display columns**, so a line holding CJK breaks early. That is safe, not exact: a code point never takes more columns than bytes. One measure is kept, not two: the bytes `write_raw` in [`../ksplc/fmt/printer.kspls`](../ksplc/fmt/printer.kspls) counts.

### 11.5 The documentation a declaration carries

**One marker, `//<`, describes the thing on its own line, and a `//<` with no text separates the summary from the detail.** One marker spares the writer a question that does not matter to a reader: whether a sentence is about the line or about its contents. Where each kind of declaration takes it is "2.1 Comments" in [`SPEC-language.md`](SPEC-language.md). `Rule_prof` in `kspeg/engine.kspls` shows a summary with its detail below, and `Mode` in `ksplc/main.kspls` the anchor shape.

**The description sits behind the thing it describes**, so no name is written twice and no pair gets out of step: a renamed parameter takes its description along. Javadoc and Doxygen restate the name in a `@param x`. Behind rather than in front, because prose in front pushes the signature down, and the reader meets the description before the shape. That is why Python puts it after the `def` line.

**A run stands one step in** from the line it continues. At the declaration's column it would have the shape of a comment block over the *next* declaration, and only the mark would say which way it points. That is also why Python's docstring takes the body's indent. Where the declaration has braces, the run goes inside them, or a marker trait written `pub trait Move_only {}` would be described from outside. `make test-conventions` holds this.

**A `//<` with no text separates the summary from what follows.** That is Python's rule (PEP 257: a summary line, a blank line, the elaboration), and Rust and Swift take the first paragraph the same way. A first sentence cut at a `.` is not taken. Javadoc and Doxygen's `AUTOBRIEF` do that, and the cut lands at `e.g.`, at `Dr.` and inside version numbers. That is why Javadoc also offers `{@summary}` to mark the summary explicitly.

**The summary is one line that says what the thing is.** It is what the hover, the completion list and `ksplc doc` open with, and a run with no separator carries all of itself there. It would also slip past the six-line cap, which counts only what stands past the separator. The compiler warns about a longer one (`[W0213]`, in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)), asked of the same reader the hover walks. One line rather than one sentence cut at a `.`, for the reason above; Go's doc comments and PEP 257 open with one line too.

**Where the head closes on a later line, the run hangs off that line.** The opening line belongs to the parameters below it, and a run there would read as the last parameter's.

**A description longer than one line stands below a mark with no text.** Begun behind the declaration, it would start wherever the declaration ends and wrap to the run's column, ragged, and reflow on every rename. One that fits stays on the line, since the anchor spends a line saying nothing. Length decides the shape, not preference, so it is one rule and not two spellings. `ksplc fmt` moves a description that does not fit into the anchor shape and never the reverse, since the anchor is also how a writer groups a run about to grow ("The formatting settings" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)).

**The width asked is the brace notation's in both notations**, so a round trip cannot give one program two shapes ("The formatting settings" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). One program has one shape, at the cost of a few lines that carry their description below where their own width would have kept it.

**The run is joined onto one line**, since the record holds one entry per line. The record's fourth column and the hover read the same words whichever shape the source has. Where the summary meets the rest, a full stop is put in, since a `//<` is written as a fragment. None is put in after a summary that already closes a sentence, looking past a closing backtick, bracket, quote or bold mark. Inside a run none is added: its lines are one paragraph wrapped.

**A continuation that continues nothing, and an anchor with nothing under it, are refused.** The first writes a sentence that reaches neither the hover nor the record. The second publishes an entry saying nothing. Whoever wrote either believes it took effect, the state Principle 5 refuses. Both are compiler warnings, not convention checks (`[W0209]` and `[W0210]` in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)), so they reach the editor they were written in and can be set per file. The refusal asks "does this continue something" of the predicate the reader walks by, so the two cannot drift apart (Principle 4).

**No third marker is added for a description below the code.** Haddock's `-- ^` means "the code above me". Written the wrong way round, it attaches the description to the neighbouring field, and nothing reports it (Principle 8).

**`///` is refused rather than read, and `//<` is not respelled `///` either.** Every product with `///` points it at the thing *after* it, so a writer or a model from Rust, Swift, C# or Zig types it first, before the declaration. Read as describing the contents, a field's sentence would become the enclosing type's. Read as nothing, a function's would vanish. Either way nobody is told (Principle 5). Giving `///` the meaning of `//<` only moves the fault. The same spelling with the opposite direction is the misreading the caution in "The spelling of reserved words is taken from C" names, and a `///` above a declaration would continue the one before it. So `///` is a compiler warning too (`[W0212]`). So is `//!`, Rust's and Zig's mark for the enclosing thing, which such a writer puts at a file's head. Four slashes or more make an ordinary comment, as in Rust.

**Three things hold this up, none of them new grammar.**

* **`//<` is an ordinary line comment**, so editors, `grep` and every existing tool keep working on it.
* **`fmt` keeps the shape.** A signature broken one parameter per line stays broken, the trailing comma deciding it (black's magic trailing comma). Decided on width alone, the shape is lost on the next run, which is what a marker behind each parameter meets in practice.
* **One reader serves four consumers.** The record (`ksplc --emit-surface`'s fourth column), the declaration file (`--emit-decls`), the hover and the completion list all read `ksplc/base/ast_doc.kspls` (Principle 6). The summary crosses the artefact boundary, so a client holding only the distributed headers still gets it in its editor.

**Every published entry says what it is.** A record where every entry is silent still matches its API, so the drift check cannot see it. `make test-surface` names each entry with no fourth column.

Caution: **Count against the current shape, not against the record.** The record is what was committed. A declaration added and published in the same round would be judged against a row not there yet, and the entry that most needs a sentence is the one let through.

**The detail does not travel to a declaration file**, which holds headings, not contents. It carries the run's first paragraph and stops at the separator. A run with no separator publishes the lot, and what keeps a detail in its place is the six-line cap on what stands past the separator, which `make test-conventions` counts. Nor does a parameter's description reach the record: a parameter is not an entry, so its description is for the source and the editor to show. The return's stands in the same place, read by `return_doc` beside `param_docs`.

**Do not add a third marker for "the file as a whole".** It would be a second means to one end (Principle 6), which Rust's `//!` pays for with two rules the reader must hold apart. So a file says what it is with the same `//<`, opening the file above its imports, with nothing over it but blank lines. A banner over the run pushes what the file is for off the screen, and `make test-conventions` refuses that order.

**The run takes what a *caller* needs, and the banner below it keeps what an *editor* needs.** A caller needs what is in here, what it costs, what it refuses; an editor, which import must not be added, which shape must not be folded into a generic, and where the substance is delegated. A table or a worked example stays in the banner too, since the run is joined into one line. The run does not restate the file's name: `ksplc doc` titles the file's reference with it and shows it beside the summary in the package's listing. Prose repeating it says it twice, and goes stale on a rename with nothing to catch it.

### 11.6 A function of one enum is its method

**A function whose first parameter is an enum declared in the same file stands in that enum's `impl`, taking `Self`.** It is called from the value (`state.text()`, `a.same_role(b)`). What an enum does is found where the enum is, the name need not repeat the type (as 11.1 asks of any name), and the call reads in the order the value flows.

**An enum of another file or package is left out.** Its `impl` would hold another package's reading of it (kspage's readers of std's `json.Val` stay in kspage), against the reference direction ("What crosses a package boundary", chapter 13 of this document).

**The language allows both shapes; this is the repository's rule for its own sources.** `make test-conventions` checks it (`check_enum_functions` in [`../tests/support/conventions_spell.kspls`](../tests/support/conventions_spell.kspls)), leaving out fixtures whose text a test compiles. It reads one line at a time, so a signature it does not recognize still breaks the rule (Principle 8).

---

## 12. Documents

**What a document is for, and whom it is for, are decided before it is opened**: by its name, and for a document belonging to no package, by its row in `docs/README.md`. What it may hold *of the source* is a separate question, since there the code is canonical and the document only points.

### 12.1 A document's name says what it is for

**A reader opens a document in one of a few modes**: arriving, learning, carrying out a task, looking a rule up, understanding why, or seeing what is left. The reader needs to know which before opening it. Readers do not complain where the mode is in the name, and do where it cannot be told. So the kinds are a closed set of six, and the kind is the file's name ("Document naming" in [`SPEC-documents.md`](SPEC-documents.md)). A folder's listing is then its reading order, with nothing to learn first.

**One of the kinds is Kanso's own, and it keeps something out of `DESIGN.md`.** A `PLAN.md` holds what is left. A plan changes with every step taken, and a rationale only when a decision changes. Inside the slower document a plan reads as done, a common complaint about future-work sections. There is one plan per package, in its `docs/`, so a package carved out takes what is left of it along ("How it would be split, if it were" below). [`PLAN.md`](PLAN.md) here holds only what spans packages, with one table routing to the rest. What is given up is every package's stages on one page; that table names each package's plan and what it covers.

**What is done is deleted from the plan, not marked.** A done stage's result is a commit, and its consequences land in the documents of their kind: the rule in the `SPEC-`, the grounds in the `DESIGN.md`, what works in the `README.md`. So the plan is never read against the code. What is given up is one list of what was achieved; that is `git log`'s.

**"One file, one kind" is a judgment, gated only where a count decides it** ("Document naming" in [`SPEC-documents.md`](SPEC-documents.md)). Whether a paragraph of why belongs in a how-to is a person's call. Policing it page by page is a common complaint, and Principle 8 names the rest as the gap it is.

**The grounds are edited in place, not appended**, so the reader reads the state rather than replaying records. A record of decisions carries each one's state in a status field. Here the kind carries it: what is not done stands in a `PLAN.md`, and what stands is the `DESIGN.md`'s. What is given up is the path to that state inside the document; it is git's.

**A package's entry point is its own `README.md`, and the root one is the front door.** One README holding every package costs every reader a page nobody reads through, a common complaint about front pages. A seam between packages gets its own document ([`SPEC-local-server.md`](SPEC-local-server.md) is one, and §13.10 below holds why). So the root `README.md` holds what Kanso is, how far it works, one way to start, and where everything is. What is given up is the one-file search: a reader who does not know which package holds a thing reads the layout table first.

**A README's headings come from one skeleton** ("What every README contains" in [`SPEC-documents.md`](SPEC-documents.md)). So a reader who knows one package's README finds the same part under the same heading in the next. The skeleton is offered rather than required. Otherwise a folder with no common change or no trap would grow an empty section, which sends the reader looking for something that is not there.

**The kind carries the reader, so no second axis is added.** Inside a package the folder is the subject, so the kind answers who reads. A `SPEC-` is for whoever relies on the subject from outside, a `DESIGN.md` for whoever changes it. The documents that belong to no package share no subject, so their entry point's table names the reader (§12.2 below). The reader is not marked per file: a document honestly serving two readers would need one label, and the argument moves to which, the standing complaint against documentation cut by persona. The kind makes one misplacement visible: facts about something outside Kanso in a document for whoever changes Kanso. A board's pin table belongs in [`../ksos/docs/SPEC-board.md`](../ksos/docs/SPEC-board.md), not in ksos's rationale.

**What the reader must already have is said where the kind cannot say it**: in a `HOWTO-`'s first sentence, and in a column of a README's table only where the documents differ ("Document naming" in [`SPEC-documents.md`](SPEC-documents.md)). The reader needs a checklist (a terminal, a toolchain, a car on the desk), not a persona. A column answering the same all the way down is noise the reader learns to skip. The check reaches the name, not the row: which documents earn a row is the "one file, one kind" judgment.

**A document gets no line cap.** A specification is as long as its subject and is looked up rather than read through. The two kinds read through are bounded by what they are: a `README.md` routes and explains nothing, and a `TOUR.md` is one program. A cap would be a number with no grounds behind it and no gate under it (Principle 8).

### 12.2 Who reads a document is said by a column, not a folder

**The documents that belong to no package sit directly in `docs/`, with no folder inside it, the shape of every package's `docs/`.** Whom each is for is the last column of the table in `docs/README.md`, the one place that question is answered.

**The column says what a folder cannot.** It names two readers where a document honestly serves two: the project how-to is for whoever writes KSPL, its last section for whoever wants a document to open from the file manager. It also names what the reader must already have (a C compiler for the build how-to). A folder picks one reader and says no more. Folders cut by reader beside the column would answer one question twice, kept in step by hand (Principle 6).

**The column names the reader, not the subject.** A subject splits again once one document covers two, and then nothing decides where it belongs; a reader does not split. Other products put the reader in a title or a hostname, and both must be learnt.

**No folder needs an exception.** GitHub finds `CONTRIBUTING.md` and `SECURITY.md` in `docs/` ("Documents whose name is fixed from outside" in [`SPEC-documents.md`](SPEC-documents.md)). So they stand where every other document does, and the language specification and this document cite each other by bare name.

**What it gives up is the reader's name in the path.** A link to `docs/DESIGN.md` says what the document is, not whom it is for, and a reader who does not know the kinds finds that in `docs/README.md`. The products praised for keeping readers apart pay with two places to keep in step. Where both share one folder, a common complaint is documents with no status and a catch-all group. Here every name carries its kind from a closed set, and every document says only how things stand now. So the two are told apart before either is opened, and nothing is left over.

**The rules for the documents are a document of their own.** A document that routes cannot also be canonical for a rule. So `docs/README.md` routes, and the rules are [`SPEC-documents.md`](SPEC-documents.md), held up by `make test-docref` and `make test-conventions`.

### 12.3 Linking a design document to the source (no round trip)

**The source is the one canonical source, a document points only toward it, and a check fails a divergence** (the rules are "Linking documents to source" in [`SPEC-documents.md`](SPEC-documents.md)). A design document only points, shows through a window, or assembles and shows; it never copies code. A deleted or renamed name is visible only through a check.

**How far a machine can guard decides what each part holds.** A machine guards names (symbols, files, headings), a run guards examples, and only a person guards prose. So prose carries the why and points at the source for the what.

**The word "round trip" is kept out of this design.** Under a tool that synchronizes both ways, the model and the code drift apart. The diagram goes stale once writing begins, and then stops being trusted (what UML's CASE tools and model-driven development lost), a corollary of Principle 6. Do not mix the document and the source into one file either. The mixed forms (literate programming, notebooks) lose every other tool: line numbers shift, diffs become unreadable, debuggers and `grep` stop working. The name links the two, not the container.

**There are only four ways of linking.**

| Way of linking | What it holds | Who is canonical |
| :-- | :-- | :-- |
| **A link** | Which symbol in which file, by name | The source |
| **A window** | Only the symbol's name; the notation is read afresh wherever it is placed | The source |
| **A diagram** | Only what it is of; it is assembled from the relations wherever it is placed | The source |
| **Generation from a table** | The table holds the values, and the notation is generated | The table |

**A window and a diagram hold no contents**, like a table of contents or chapter numbers: copied into the document, they go stale where nobody can see it. A window names the symbol, never a range of lines, which would carve out something else the day the function moves. Generation is kept to where a table is canonical, such as the list of diagnostic codes, never general-purpose code generation (what model-driven development lost). Always place a check on the generated artifact's freshness beside it, or a hand edit to the artifact silently vanishes at the next generation.

#### 12.3.1 No marker is added per symbol

**No attribute or directive tying a symbol to a design document is attached to the symbol.** It is derivable: the document names the symbol, so a check can assemble the reverse index, and one fact written in two places is what Principle 6 forbids. There would be many, and a marker per symbol becomes decoration the source's reader skips every time. It breaks weakly. A forgotten marker is lost quietly, while a link in the document fails a check the moment its target disappears.

**Visibility already says which symbols a design document shows**: `pub` marks them, so no marker says it again.

#### 12.3.2 A running example is obtained by pointing at a test

**A document shows a running example by pointing at a function in a test**, because an example copied into a document goes stale. Rust's doctest and Python's `doctest` are strong because when the code changes the document breaks, and when the document breaks the build fails. A test's function shown through a window has that property without a test notation in the language, and is the very thing CI runs every time.

**An explanatory fragment, its surrounding context left out, is written in the document**, and `make test-docsnippet` checks only whether it is readable. Do not mix the two: whether a piece runs on its own decides which side it is on.

**What linking this way gives up**:

* **A diagram cannot be rearranged by hand**, being assembled from the source. The ugliness of automatic layout is accepted in exchange for diagrams that cannot go stale.
* **Code cannot be fixed from the design document**; the source is rewritten instead.
* **Renaming a symbol fails the document**, and each rename needs a hand edit in the document. That is also the point: a pointer made not to fail loses its target with nobody noticing.

#### 12.3.3 A comment that points is checked as a document is

**A comment naming a symbol in another file is read by the same check as a document's link, with no mark of its own.** A stale pointer where the code's reader stands costs what a stale link costs. Other tools check a pointer only when it is a marked link, and leave a plain name in backquotes unread. A mark would be a second way to write one pointer (Principle 6), and the unmarked one is what goes stale. So the spelling a pointer takes anyway, `` `name` in `file` ``, is the one read. The member is read as well as the owner. A method moved to another file leaves its type named in the old one, and a check reading the owner alone stays green on a pointer that leads nowhere.

**A pointer that names no file is read through the commenting file's own scope.** In the packages' `//<` lines, `` `Owner.member` `` is the more common spelling, and only the compiler holds the scope it relies on. So the compiler reads it as the code beside the comment would, and a missing member is a warning in the editor as it is typed (`[W0211]` in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). The same reader turns the name into a link in the hover and the completion list, so a name is never linked in one place and called stale in another. The API pages link it to the entry carrying it.

**Each spelling has one reader.** A name tied to its file is the document check's, and is the way to point at a method added by a file outside the compilation. A name naming no file is the compiler's. A name introduced as another product's ("Python's `` `json.dumps` ``") is nobody's. KSPL has no mark to tell a pointer from a plain name in backquotes (above), so the wording tells them apart.

**What is given up**: the check reads literal text, so a pointer worded another way escapes it. That form is still a violation (Principle 8), as "Linking documents to source" in [`SPEC-documents.md`](SPEC-documents.md) says. And the scope is the compilation's, so the editor's single document can call stale a method that only a file it does not import adds. The pointer naming its file answers that.

### 12.4 The reader may be a model

**An agent works on this repository, and a model writes KSPL for whoever asked it to; both read what is written here.** What a model lacks decides what they need.

* **It cannot ask.** What it needs is written down, or can be had from a command, never held in someone's head.
* **KSPL is in no model's training.** A model falls back on the habits of Rust, Swift and C. So what KSPL leaves out, and what to write instead, has to stand where a model reads it.
* **Its context is short, and costs.** One precise piece on request beats a document read whole: `ksplc explain <code>` prints one diagnostic's section ("An explanation is printed from the specification, and only a code has one" in [`../ksplc/docs/DESIGN.md`](../ksplc/docs/DESIGN.md)). An instruction file carries only what cannot be read from the code, as the one measurement of such files found.
* **It believes what it reads.** A stale pointer or a copied fact misleads it with confidence. So what it reads is generated from the canonical source and held by a check: Principle 4's rule, with less forgiveness.

**A document that restates a canonical source loses value**, since a model restates on demand and the copy goes stale. One that holds what no source holds gains value: a decision and its grounds, a rule, a comparison with its complaints. A model can neither infer that nor make it up correctly. So no second, hand-written copy of a document is made "for AI"; where a model needs another shape, it is generated from the same source.

#### 12.4.1 No file for models

**No file for models is kept** (`llms.txt`, `llms-full.txt`). What one would hold already has a canonical source a model can read: what KSPL leaves out (Appendix A of [`SPEC-language.md`](SPEC-language.md)), the tour ([`TOUR.md`](TOUR.md)), the grammar, the API pages and each diagnostic's section (`ksplc explain <code>`). So the file would only repeat them, in two files if both the convention and GitHub's rendering are to find it. An agent working on this repository reads those sources whole.

**What is given up**: one file to give a model that cannot read the repository. Such a model is given the specification and the tour instead.

### 12.5 The tour is a program, one declaration per step

**The tour is one program, and each step is one of its declarations, in an order chosen for teaching** ([`TOUR.md`](TOUR.md)). Each step's prose is that declaration's `//<` comment. `make tour` writes the page from the program and what it prints, and `make test-docs` refuses a page older than its program.

**The motive is a tour that cannot drift.** A tour is the one document a newcomer reads before they can tell that it is wrong, and a tour kept by hand drifts as far as its team is small. Checking only the code examples leaves the prose between them to go stale. Generated from a program the gates compile and run in both notations, the code and the words that explain it sit in one file and are checked together.

**A generated page still needs an order chosen for the learner.** A page generated from source tends to follow the features' own order and to read as a reference. So the program's declarations stand in teaching order, smallest first, each one idea small enough to hold in your head, with the code of the step beside its prose.

**The page ends by naming where to go next.** A common complaint about tutorials is their end, where a reader who has finished does not know what to read. The brace notation is shown on one step, not the whole program twice. The two notations are one language, so one step in the other spelling shows the difference, and the whole program in braces is one link away.

**What it gives up**:

* **A step can teach only what one declaration of a running program shows.** What needs a program of its own, such as splitting a program over files, belongs to the project how-to ([`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md)).
* **A step's prose is a comment, held to a comment's limit** (Principle 7). A step that needs more is split into two declarations, or points at the specification.

---

## 13. What crosses a package boundary

**A package's promise to whoever is outside it is exactly its `pub` names.**

### 13.1 A test inspecting the inside of a unit goes inside that unit

**A test inspecting the inside of a unit goes into a `tests/` under that unit.** There it is the same unit, so it reaches what it inspects unspecified, with not one `pub`. It also stays out of the artifact, since a file nobody imports is not compiled. The language needs no change: `package_of` in `ksplc/base/locate.kspls` takes a file's unit from the first separator of its logical path, so `kspage/tests/flow_test.kspls` is in unit `kspage`. From the root's `tests/`, a package of its own, the same test would need its target `pub`, and nothing tells that `pub` from an unnecessary one. [I0402] sees only the references in one compilation, and the entry point that builds the product uses nothing in `tests/`.

**A test looking at two packages goes to the one that imports the other.** A randomness test of both `std/prng` and `ksai/sampler` in `std/tests/` would make std depend on ksai, a direction `make test-docref` does not allow. So the part choosing the next word sits in `ksai/tests/sampler_test.kspls`.

**`ksplc/tests/` imports nothing from `ksplc/`.** It inspects the answers the compiler produced, from inside a program the compiler built and through a suite under `ksplc/tests/suite/`. That suite runs the compiler this folder builds as a child, and another `ksplc` runs the suite. A test of an internal function would go there, but the whole compiler then enters that executable. Measure `make debug`'s translation time before adding one.

**What is used from outside a unit stays in `tests/`: such tests, the gates, and their materials.** That is Rust's line between unit and integration tests, and Go's between `package foo` and `package foo_test`. What stays is the tests that stand on what walks the repository root and git (`tests/support/harness.kspls`), and on what starts a child process to build (`harness_build.kspls`). Those tools must not be moved into `std/` (§13.6 below). Other large trees divide on the same line, LLVM's top-level `cross-project-tests/` among them.

**Do not bring in what the destination does not depend on.** A test that does leaks into the distributed unit, which is why Rust keeps `core`'s tests outside `core`. Here that is a moved test using what its package does not depend on, which `make test-docref`'s direction check watches.

#### 13.1.1 Where the entry points are

**Every package has its own `tests/`, and `tests/debug/parts.kspls`, the one place that knows how to call them, only calls each entry point in turn.** So no copied call keeps an old argument shape. The `$(error)` in `mk/test.mk` stops make at start when a package's `tests/all` and the forms in `tests/debug/pkg/` diverge. `make debug-<name>` runs one package where `make debug` runs all. That gives a shorter wait for the first answer, not less to confirm: what to run before pushing is `make ci-linux`. A package carrying its own `Makefile` has a second door, its `<package>/tests/main.kspls`. It passes its own compiler where a run takes one (`run_kspage(builds)`, `run_std(ksplc, arena)`). The parameter types hold both doors to one shape, and both are compiled on every round (`make debug` and `make test-extract`).

**Each package's entry point is `<package>/tests/all.kspls`, and its opening comment says what the package's tests inspect.**

**The two remaining boundaries are closed in two ways.**

1. **Open exactly one entry point as `pub`**: one function that runs everything, like `run_kspage` in `kspage/tests/all.kspls`.
   * **Do not add inspection interfaces here.** Each is one more contract put outside the unit.
2. **Take what works only inside the unit as a function pointer.** The interface that has the real compiler read something lives in `tools/ai_assist`, a leaf `kspage/` cannot depend on (the directions are the table in [`SPEC-documents.md`](SPEC-documents.md)). So `kspage/tests/consts_test.kspls` takes "a function answering whether it builds" as a parameter, which `tests/debug/parts.kspls` passes. Only the `tests/` side can start the compiler, and the shape shows it.

#### 13.1.2 Where an unneeded `pub` is reported

**[I0402] can be enabled for `kspage/`, `ksos/` and `tools/` as well as `ksplc/` and `kssrv/`, but not for the units distributed and used elsewhere (`std/`, `ksdb/`, `ksai/`).** Their `pub` is a contract with outside users that references inside the repository cannot judge. So keeping to one entry point there is a matter of form, and adding more brings no diagnostic. Read the header of `all.kspls` before adding.

**The diagnostic is turned off in exactly one place**, `##lint(I0402 = off)` in `tools/ai_assist/ksplc_oracle.kspls`. Its `compiles` is a `pub` that `tests/debug/parts.kspls` uses in form 2 of §13.1.1 above, invisible from the entry point building the tool. Closed to one file, it leaves the unit's other `pub` count at zero.

**Inside `tests/` itself it is the reverse.** No package imports that leaf, so a `pub` there has no user outside the unit, and its tests reach each other while unspecified, being one unit. So the diagnostic can be enabled there too (`tests/ksplc.cfg`). A `pub` inside the materials is not reported: the forms in `negative/` and `lint/`, and those held in `"""…"""` inside a test. They are written to make a visibility diagnostic fire.

**In `ksos/demo/`, only part of a unit is an entry point, and a `pub` there has no user outside the unit either.** But the diagnostic cannot apply to the demo alone. The configuration is found from the entry point's file. So turning it on for the demo also reports the `pub` names of the kernel and the drivers in the same build, and those stay ("The guidance for adding an API or an implementation" in [`../ksos/docs/DESIGN.md`](../ksos/docs/DESIGN.md)). `make test-conventions` checks the demo's text instead.

### 13.2 The published API is recorded in the repository

**A package's published API is one text file, committed to the repository, and a gate cuts off its drift** (`ksplc --emit-surface`, regenerated by `make surface`, with `make test-surface` rejecting drift; "Writing out the published API" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). Without it, deleting a `pub` whose user lives in another repository keeps this build green, with no record of what changed. Being comparable by a tool and being recorded under version control are different things. Without the record, the only thing to compare against is whoever still has the previous version.

**How other tools do it**: Rust's `cargo-public-api` keeps the record in the repository for review, and its diff carries auto-derives and blanket impls. Here they stay out of it from the start: what counts as API is the declarations actually written, with no instantiated body. Swift's shape, where the toolchain itself emits the record, is taken, since a separate analyzer would drift with nobody noticing. Swift's needs the whole SDK; here one entry-point file suffices.

**Do not merge the record with the distributed declarations** (`--emit-decls`). It looks like Principle 6, but the purposes differ. The declarations drop what cannot be distributed, and write ABI-determined numbers for by-value classification. A record that held those numbers would look as though the API changed merely from compiling for another target. One that dropped things would make a deleted declaration indistinguishable from one that could not be emitted.

### 13.3 Outside parts are not fetched; only their location is stated

**There is no package manager, only a way to state where a part is** (`--pkg-src-dir=` and the environment variable `KSPLC_PKG_SRC_DIR`). The resolution order, and the rule that a local copy wins, are "The source of a package other than `std`" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md). Nothing is fetched, no versions are solved, and nothing runs at import time.

**The motive**: a part requested by name becomes, the moment it is requested, someone else's code that nobody has read. Fetching brings four questions: where it came from, which version, what comes along with it, and what runs at import time. None of them is visible to whoever requested it. Kanso holds no hidden work at build time any more than at run time.

**Common complaints are about code running at import time and dependencies that bring in dependencies.** Where a manifest is language code, solving dependencies means building and running it. Other common complaints are that one part brings hundreds along, and that a registry has no namespaces. Elsewhere the tooling does not agree on one shape. Nor is this C/C++'s shape, where no standard is set and many tools each answer the question. The interface is narrowed to the single `--pkg-src-dir=`, and only fetching is absent.

**What it gives up**:

* **Someone else's part is brought over by hand**, and which version was brought is yours to note. An update goes unnoticed unless you look for it.
* **A dependency's own dependencies are followed by hand.**
* **Fewer parts are available than anywhere else.** That is the price of taking on neither dependency resolution nor the risks outside parts bring in.

**What was brought over can still be read.** A part shipping a `SURFACE.txt` shows what disappeared when matched against the previous version (§13.2 above). This is revisited when KSPL packages that people want by name appear outside this repository, not because nobody has built a fetcher. Until then a fetcher would have nowhere to fetch from.

### 13.4 A package names itself, and names what it uses

**A package's name is the package's to state, and its place is the environment's.** It names itself in its top folder's `ksplc.cfg` (`[package]`, `name = ksdb`). It lists under `uses` what it imports besides itself and `std`. Its files and its `embed`s are read from that folder wherever it stands and whatever it is called. A used package's place is told as any place is (§13.3 above; the rule is "9.1 import syntax and path resolution" in [`SPEC-language.md`](SPEC-language.md)).

**The motive**: a package found as a folder of its name, under the folder the compiler runs in, compiles only from the repository's root. From its own folder, its import of itself is looked for one level too deep, and a copy under another name cannot build. So whether a package can be lifted out is answered only by trying. Common complaints are about cases where the place decides: imports that resolve by how the program was started, a fixed workspace folder, module paths that name a location. A name with no place in it causes none of them: nothing in `ksdb/log` says where ksdb stands.

**Naming what it uses lets a reach be refused where it is made.** An import past the list is a compile error at the `import`. It is caught here, where every package happens to be present, rather than in a copy where it is not.

**What it gives up**:

* A package that names itself says so in one more file, and a new dependency is written twice, in the `import` and in `uses`.
* **A used package is still found as a folder of its name**, locally or under `--pkg-src-dir`. Only the package being worked on is freed from its folder's name.

### 13.5 The standard library reaches only itself

**A file of `std` names only `std`'s files, and a name under `std/` holds no `..`.** Either reach out of it is refused at the line that writes it ("9.1 import syntax and path resolution" in [`SPEC-language.md`](SPEC-language.md)).

**The motive**: `std` is found by its place, not by a name, so no `uses` (§13.4 above) holds it. Without the rule, a `std` file importing another package would compile clean. It would show up only as a "not found" pointing at `std` from inside another package's copy. `std/../x` would let a file from outside be read as `std`'s, into its unit of visibility and its linkage.

**Why a rule and not a name**: naming `std` would state a second time what its place already states, and the two could disagree. The list it would carry is always empty. A list in a settings file can be widened by editing it, where a rule of the language cannot. Go and Rust name `std` in a manifest because their build tools build it as one more module. KSPL's compiler never builds `std` through the package path.

**What it gives up**: a `std` passed with `--std-dir` cannot import the user's packages. One that did would have to travel with every compiler, making it part of the standard library in all but name.

### 13.6 What tests share stands in std

**The part of a test harness that knows no repository stands in `std`, and the part that knows one stays in that repository's `tests/`.** The first spans three files. `std/verdict` runs checks on past a failure, with their lines and a closing `RESULT:` line. It also reads a child's run as a check: its exit code and outputs as one text, for one child or several side by side. `std/fs` gives a scratch folder and writes and copies a tree, and `std/fuzz` scatters broken input at a program. The second part walks the repository's root and git and knows where its compiler lives (`tests/support/harness.kspls`, built on the first).

**The motive**: a package's tests reach only what the package reaches: itself, what it names under `uses`, and `std` (§13.4 and §13.5 above). With the whole harness in the root's `tests/`, a test standing on it could run from the repository's root alone, never from a copy of the package. Such tests are the checks on the compiler a package built, and the packages' fuzz suites. A package lifting its tests out would write its own tally, a second copy.

**Why `std` and not a package of test helpers**: such a package would need a test-only `uses`, and `std`'s own tests could not use it, since `std` reaches only itself. Other tools' complaints sit on that path: a test-only dependency leaking into the product, or resolved for every user. A harness in or beside the standard library (Go's `testing`, Rust's `libtest`) avoids them, and gives every package's tests the one shape the gates read. The complaint at the other end is a standard harness too thin to use. It is kept off because this repository's own suites run on it, so what they need is added where every package's tests have it.

**What it gives up**:

* `std`'s published API grows by names a program testing nothing never calls. They cost nothing to build (a file nobody imports is not compiled), but they are a contract like any other `pub` of `std`'s.
* The shape of a verdict line becomes `std`'s to keep. Changing it is a change to `std`'s API, and every package's tests move with it.

### 13.7 A path's `..` is resolved by its spelling

**A path's `..` is folded by spelling, in the walk up to the folder a file stands in and in the file's name alike.** `pkg/../other/x.kspls` stands in `other`'s folder, never in `pkg`'s, and `sub/../lib/n` is named `lib/n` ("9.1 import syntax and path resolution" in [`SPEC-language.md`](SPEC-language.md)).

**The motive**: a walk cutting off one name at a time steps from `pkg/..` back into `pkg`, a folder below the one the path names. Run from inside a package, a file in the folder beside it, named through `..`, would pass for one of the package's own, named `pkg/../other/main` and held to the package's lint levels. A package's file spelt through `..` would give its folder as `pkg/probe/..` in every `#line`. The name folds too, since a name kept as written is two names for one file. Reached as `lib/n` and as `sub/../lib/n`, a file would compile twice, as two modules with a counter each. The second name puts it in `sub`, whose files would reach its unmarked symbols.

**By spelling, not by asking the filesystem.** Every language keeps both ways. The filesystem's way needs the file to exist and brings surprises of its own. The fold by spelling has one documented caveat, a symbolic link followed by `..`. That is the price taken here, as Python's `normpath` and Go's `filepath.Abs` take it.

**A `..` that climbs out of a package read from a place of its own stays.** Such places are `std`'s, a package that names itself, and one under `--pkg-src-dir`. That folder need not stand at its name: `ksdb/../x` folded to `x` would name a file beside the project, not beside the package.

**What it gives up**: a package, or a file, reached through a symbolic link followed by `..` is read at the spelling's place, not at the folder above where the link points.

### 13.8 A package's examples and benchmarks stand inside it

**A program written against one package's parts alone, an example or a benchmark, stands inside that package** (`ksai/examples/`, `ksai/benches/`). The package's own `make test` builds the examples and holds them to what they print. A program that needs more than one package and `std`, such as one that uses the whole repository as material or the compiler as a child, stays a tool (`tools/ai_assist/`).

**The motive**: kept in a leaf of their own, `ksai`'s examples would be a second package that travels apart from the engine. A copy of `ksai` would carry none of them. And `ksos`, which embeds the weights one of them trains, would need an arrow from implementation to leaf, which the direction table does not allow. A common complaint is about examples kept out of the library's build, found broken only by whoever runs them; Cargo builds a crate's examples on every `cargo test`. Here the weights' arrow is `ksos→ksai`, one the table already has.

**What it gives up**:

* **The examples take the package's lint settings.** A leaf of their own could turn I0402 on, as nothing imports a leaf. Inside `ksai`, whose `pub` is a contract with outside users (§13.1.2 above), it stays off. A common complaint about this shape is that an example cannot have settings of its own.
* **The package's `make test` needs a C compiler**, to build the examples it runs.

### 13.9 What a recipient is owed is one table, held by a gate

**Every notice owed, and where every binary file comes from, stands in one table, `THIRD-PARTY-NOTICES.md`, and `make test-conventions` holds the tree against it.** The rules the check holds are listed at the head of that file.

**The motive**: a caution in that file alone ("once a file that declares an origin is added, add it here too") would be a rule nothing checks (Principle 8). A missing notice is found by a recipient, after the release. A common complaint is about a license header in every file. One table read against the files keeps the record in one place, and still catches the file that slipped past it. The binaries are in because a model's weights carry a license: converted Qwen weights committed by mistake would go out under Apache-2.0 with no attribution.

**What it gives up**:

* **Code rewritten from another's without its words is not caught.** The gate sees a license's words, not an origin told in prose. That half stays the author's, as the table's caution says.
* **The release's contents are named twice**, in `.github/workflows/release.yml` and in the gate's list of what it carries. Adding a bundled folder means adding it to both.

### 13.10 A page asks the local machine through one protocol

**A page in a browser asks a program on the same machine for files and processes through one protocol, written in a document of its own** ([`SPEC-local-server.md`](SPEC-local-server.md)). The page (`kspage`) asks and the server (`kssrv --local`) answers, so the protocol belongs to neither package: a seam between packages gets its own document (§12.1 above). The server is meant to be replaceable, so the document holds only the rules, and their grounds stand here.

**The server does not know the document.** Knowing it would put the document model in two places, with nothing to tell which is canonical. So the server moves only text and bytes, and the page decides where they go.

**The transport is built on what `std` already has.**

* **Output comes back as a response sent in pieces, and WebSocket is not used.** A WebSocket handshake needs SHA-1, and `std` carries only SHA-256 among its hashes. A hash added for one transport becomes a decision for the whole of Kanso, so the trade does not balance (Principle 1). What is given up is one connection carrying both ways: typing into a process is a request of its own.
* **There is no entry point per tool.** Building, debugging, completion and error reporting each launch a process and pass text back and forth, so an entry point for one would be a second way of doing the same thing (Principle 6).
* **`HEAD` is not carried.** Watching already returns the size and whether the file exists, and two entry points that differ only in name leave the page unsure which to use (Principle 6).
* **The type is not guessed, and the encoding is UTF-8 only.** The receiver believes a guess and reads the bytes by it, and a wrong guess shows only where it misses.
* **Output is bytes split by length.** Raw bytes can hold any delimiter, and newlines as delimiters would mix the output's own newlines with them. The last piece is `X`, so a finish is told apart from a connection that merely closed. A stopped child's ending piece carries `-1`: a stopped child has no exit number, and `0` would read as a normal finish.
* **What goes into a child and what comes out use one encoding.** With two, the text mixes them, which is worse than either alone.
* **Output nobody watches stops at a ceiling.** The child then waits where it writes, so memory stays bounded and nothing is dropped.

**Watching is the page asking, not the OS telling.** The OS's notification (inotify, ReadDirectoryChangesW) needs one implementation per OS, and porting cost would gather there. Asking loses how many times a file changed but returns how it is now, so the page always catches up to the final state. What is given up is cheap watching of a whole large folder, where asking is heavy.

**The token goes across once, in the fragment, and stays in the tab.**

* **A fragment, not a query**: a fragment is never sent to the server, so another process on the same machine cannot get the token by sending `GET /`.
* **Not in the response that serves the page**, nor on request, nor in a response header: anyone who knows the address could read it there. Only a malicious page inside a browser, which cannot read the response, would be kept out. Once process launching is open, whoever holds the token can run code with the person's privileges.
* **Not in a cookie**: the browser attaches a cookie on its own, to a malicious page's requests too. That is why the token rides in a header.
* **Not on the command line**, where `ps` shows it to anyone on the machine.
* **Compared in full**: a page in a browser can send requests to the loopback address, and a difference in return time would let it guess the token a byte at a time.
* **What it gives up**: a person opens one URL once per start-up. Jupyter's local server asks the same, and leaves the token in the browser's history as well; here `history.replaceState` removes it.

**The page named at launch may sit outside the root** (`kssrv --page=<file>`), because the page and the document are separate. The document is in the person's folder and the page is with the server. Requiring the page under the root would mean copying it into that folder, or the document could not be opened.

**What is launched is decided by the server, never by the page's text.**

* **No shell**: one quoting mistake in a shell command runs a different command.
* **A row of the server's table decides what runs**, and the page's `cmd` and `args` only pick the row, so a forged request launches nothing the server did not list.
* **The folder of launchable programs sits beside the server, not under the root.** Under the root, a tree the person fetched could carry a program, and merely opening an editor on that tree would line it up ready to press.
* **No path crosses the protocol.** What is on the machine is not the page's to learn, and a name is all it needs, so a request cannot even carry a forged path.
* **Not from the PATH**: whoever can change the PATH would launch something else.
* **A launch that fails returns the places looked at.** Whatever names a location can name a wrong one, and "cannot launch" alone leaves the page unable to tell what about the layout is wrong.

**The server stops when no page holds a connection open.** Something has to end it, and the console cannot: a server opened by a double-click has no console to press anything in. The held connection carries nothing, so there is nothing in it to parse or get wrong, and closing the tab closes it.

* **Not a timer**: a timer only tells that somebody was there some seconds ago, and every choice of the wait is wrong somewhere. Too short, the server stops while someone reads; too long, it lingers.
* **Not the last request**: a page where someone is writing asks for nothing between saves.
* **Not a goodbye**: a killed tab, a stopped browser or a sleeping machine sends none.

**The wait named at launch only bridges two gaps**: before the first page arrives, while a browser starts cold, and after the last page leaves. The second gap is worth keeping, since a person who closes one document and opens the next within the wait reuses the same server.

**Whoever holds the token can also stop the server at once, by asking it** (`POST /api/stop`). A server left running for the next document needs a way to end it that does not wait out the idle time, and asking is chosen over killing its process.

* **Not by process number**: a number outlives its process and is handed to the next one, so a stale record would end an unrelated program.
* **Not by a signal**: Windows has none to send, so killing would be a second way per platform.
* **Through the same guard as every request**: the token decides who may, so a page from another site still cannot end it.
* **The answer goes out first**, so the asker knows the stop took effect, rather than guessing from a connection that closed.
* **What it gives up**: a server that has stopped answering cannot be stopped this way; that is left to the operating system's own tools.

**Whether the server is there is asked, not guessed.** The server says whether it is local-facing, since the same implementation facing outward answers too. Probing entry points to guess from the refusal numbers would gain one more way of guessing with every entry point added.

**What it gives up**: the protocol serves one machine only. Use from another machine needs a protocol of its own, and this one refuses it.

### 13.11 The reference is rendered when asked, not committed

**What a package publishes is read with `ksplc doc`, which renders it from the source each time, and no rendering of it is committed** (the command is 7.5 in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). The record (`SURFACE.txt`, §13.2) stays committed: two versions are matched by it, and a reference is not.

**The grounds**:

* **A committed rendering is a second copy of every description.** A gate can hold it to the source, but a reader then meets the same sentence in two places. And every change to how it is rendered rewrites thousands of lines that publish nothing new.
* **One page per file is one small file per source file**, and one page per package instead runs to many thousands of lines, read only by searching it.
* **An entry point returning one piece serves a person and a model alike** (chapter 16). `ksplc doc std/mem.Arena.alloc` returns that entry and nothing else, where a page has to be read down. It runs wherever `ksplc` runs, the release's zip included. It answers at once, as it parses the one file asked about and analyses nothing.
* **On a repository host the source is the reference.** A description stands on the line of what it describes, so the file holding a declaration also holds what is said of it.

**What it gives up**: a rendered, linked reference to browse without a toolchain. `make surface` writes one under `out/docs/` for whoever has the toolchain, and it is `ksplc doc`'s answers and nothing else. A link from one file's reference to another file's entry is given up too: that name stays text, and `ksplc doc` on the other file shows it.

---

## 14. Why one repository

Kanso holds eight packages (`ksai` / `ksdb` / `kspage` / `ksos` / `kspeg` / `ksplc` / `kssrv` / `std`) in one repository. **This is not "not split yet" but the decision not to split.**

### 14.1 What happens if it is split

**Whether to split is decided by the share of changes that cross packages**, not by "they are independent, so separate repositories". The import direction says whether packages are independent. What decides the cost is how many packages one change reaches: how many packages' files the most recent commits touched, merges excluded (`git log --name-only`). It can be measured again, so no number is copied here (Principle 7).

**Once split, a change crossing two or more packages becomes work across repositories in a fixed order**: fix in the child, push the child, update the parent's reference, push the parent. Forget any one of the four and neither repository builds on its own.

### 14.2 `std` cannot be separated from `ksplc`

**This is decisive.** The bootstrap seed ([`../ksplc/seed.c`](../ksplc/seed.c)) is `ksplc` and `std` compiled together, holding thousands of `std`'s function bodies. So fixing `std` means rebuilding the seed, and the seed belongs to `ksplc`. In separate repositories every change to `std` would straddle two.

Caution: **Get the order wrong and the seed is left holding a stale `std`.** `make self-host` then fails, not for whoever made the change but for the next person who pulls.

**There is no cycle in the import direction** (the table in [`SPEC-documents.md`](SPEC-documents.md)). What keeps the packages together is not the shape of their dependencies but the seed, and the volume of crossing changes.

### 14.3 How other large projects arrange their repositories

**LLVM, Rust and Zig each keep one repository**, and Swift keeps many, with its own tools to manage them. Submodules are not adopted, for four drawbacks reported on them, the first being the four steps above.

### 14.4 How it would be split, if it were

**Even when split, the work stays in one repository, and only the distributed copy is carved out.** Do not create two writable copies: nothing would decide which is canonical.

The carving is `make carve PKG=<package>` (`tests/tools/carve.kspls`). `git subtree split --prefix=<package>` gives a history rooted at that folder, carrying only the history that touched it. The carving lands it in its own repository with one commit on top, pushed to a read-only copy. **Never push to the copy.** That is the shape Symfony has long run, with issues and pull requests closed on the copy.

**A reference leaving the package is re-pointed when the copy is made.** It points at this repository's page for what it named, pinned to the commit the package last changed in. From the copy, a relative link climbing out of the folder opens nothing. A naming read from the root opens the copy's own file of that name, if it holds one.

* **Rewritten at carving, not written that way here.** Inside the repository, `make test-docref` holds a relative link to landing. An address written into a document by hand is held by nothing, and opens a branch as it stands on the day it is opened.
* **Pinned to the package's last commit**, so the documents open as they stood when the package's content was written. Pinned to a branch, a link opens whatever the file has since become. Pinned to the carving's `HEAD`, carving again after an unrelated commit would change every address in a copy whose package did not change.
* **What each becomes**: a link's target is replaced, a naming in a document's prose becomes a link keeping its words, and a naming in a source's comment becomes the address. Code is never rewritten: a path in a string literal is data a program reads.
* **Read by the reference check's own reader** (`tests/support/harness_refs.kspls`). So the carving moves exactly what the check holds, never a second reading of what a reference is. `make test-carve` holds every package's references to landing from its copy, and ksdb's copy to testing from a fresh clone.

**The copy only moves forward.** Carving into the same place again stands the new commit on the last one, and a state the copy already holds adds nothing, so whoever cloned it pulls without a conflict. The commit takes the name and date of the package's last committer, so one state carves to one commit on any machine. Nothing is sent anywhere: publishing the copy, and at which address, is a person's decision.

**A package that names itself builds from its carving alone**, with nothing but a `ksplc`. It carries its own `Makefile`, and `make test-extract` runs its tests on every change from a copy of its folder holding nothing else (beside the folders of what it uses). So the carving is known to build before it is made. `std` is held without naming itself: found by its place (§13.5 above), its own `make test` reads the folder it stands in as `std`, and a copy tests itself. What its carving cannot carry is the way into the compiler. A change to `std` reaches `ksplc` only by re-baking the seed (§14.2 above), so the carving distributes source, not the means to build.

### 14.5 The conditions for splitting

**Write not "it should be split" but what has to happen before it is split.** Without that written down, the same question means measuring again every time it comes up.

* **Changes crossing two or more packages have dropped far enough.** Before that, splitting only turns them into multi-repository work
* **Packages need releasing at different versions.** While they are released at one version, splitting only adds steps to releasing
* **Different people come to touch only one.** While the same people touch them all, splitting does not change what anyone reads

**Judge each by "is it so now".** Split on "it surely will be", and the cost is paid up front for a gain that may never arrive (Principle 1).

### 14.6 What to finish before splitting

Three things are worth having whether or not it is split, and **become premises** when it is.

* **Tests are inside their package.** "13.1.1 Where the entry points are" above holds that state
* **The published API is recorded and drift is failed** (`make surface` / `make test-surface`).
  * Caution: **Without the promises between packages visible as a diff**, the other repository's changes arrive silently once split
* **The package names itself and builds from a copy of its folder alone** (§13.4 and §14.4 above). Without it, a path or an import reaching outside the folder is found on the day the copy is made. A check holding one package against another stays in the root `tests/`, where both stand ("What stays in the root tests folder" in [`tests/docs/DESIGN.md`](../tests/docs/DESIGN.md)), so a carved package leaves it behind with the repository

**The reference check presumes one repository.** `make test-docref`, which watches "Reference direction between documents" in [`SPEC-documents.md`](SPEC-documents.md), reads the whole tree. So a split makes it unrunnable without fetching the other repository. A split is the moment to decide this check's canonical source again.

---

## 15. The build and the gates

**The build is two builds, with opposite options** (§15.1). What each gate checks is in [`SPEC-gates.md`](SPEC-gates.md), and how to run them is in [`HOWTO-build.md`](HOWTO-build.md).

### 15.1 A shipped executable is built optimized, and the development cycle is not

**The development cycle (the stage1 / stage2 that `make` builds) is `-O0`. Do not raise `CFLAGS`.** Megabytes of generated C are rebuilt for every line fixed in the compiler. `clang`'s time grows by an order of magnitude, and a round building both stages pays it twice.

**Shipping is the reverse**: built once, it is fast every time for whoever uses it. So what `make install` puts in place, and what the release ships (`.github/workflows/release.yml`), is a copy rebuilt with `SHIP_CFLAGS` (`-O2`, `out/ksplc_ship.exe`). Compiling ksplc itself from the same stage2 C, it translates in roughly half the time and is roughly half the size. The generated C does not change by one byte (matched on the output of the same stage2). So nothing moves: not the self-hosting fixed point, not the tests' results, not the stage1 numbers the performance guard inspects.

**Only the C a person reads is tidied.** Clang-Format runs on the generated C of `make debug-file` and `make commit-seed`. The C that the bootstrap and `make debug` leave is not tidied, since nobody reads it and tidying it costs more than compiling it.

Caution: **Do not drop `-g`.** When a shipped executable dies, that is the only place a position comes from.

### 15.2 Where CI's time goes, and what shrinks it

**Do not write the seconds here** (Principle 7). Each run lists its own seconds per stage at its tail ("How a run is read" in [`SPEC-gates.md`](SPEC-gates.md)). The order of cost is test-suites > self-host ×2 > lint > perf-log, and those four stages are the bulk of it.

**`-j` barely takes effect on GitHub's runners.** Only the gates given a `-j` (`test-suites` / `lint` / `lint-cfg` / `link_abi`) take several times as long as locally, and one core locally reproduces that. So a runner is effectively one core, and the only route to faster gates is less total work. The reproduction is `taskset -c 0 env KANSO_TEST_JOBS=1 make -j1 test-suites`. Both limits are given because `sys.cpu_count` uses `sysconf`, which does not see the affinity.

| Stage | Can it be shrunk |
|---|---|
| self-host ×2 (C and LLVM) | **Do not attach `-B`.** It redoes even the seed's compilation, making the seed newer than the later stages, and `perf-log` rebuilds C's stage1 wholesale. `self-host`'s own recipe emits the verification marker on an incremental build too. Emitted from `$(DIFF_TXT)`'s recipe instead, a round that needs no rebuild would emit no marker, and `ci_check` would return "passed without verifying" |
| perf-log | **Measure both times**: on an empty cache (cold), then on the same cache (warm). Time differs severalfold and peak memory clearly, so one alone leaves the other half unchecked. The cache sits in a dedicated location, so the shared cache is not erased (which would make every following gate cold) |
| test-suites | With the runner's cores full, **the total amount of work** fixes it, and a higher `-j` does not shrink it. What does is a smaller total, or dealing the suites out between the jobs that already stand. **No job is added for them**: every job pays its own start-up and its own billing, so another job raises the cost while the total work stays the same ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)). The launch order sets the speed, so `SUITES` is kept longest first (the grounds are at `SUITES` in `mk/test.mk`) |
| test-ksos-qemu | The demos that grab a fixed resource are serial ("How the gates are arranged" in [`SPEC-gates.md`](SPEC-gates.md)) |

**Do not merge fine-grained suites "because there are many of them".** Merging runs not one byte less, so the wall clock does not shrink (the total fixes it), while a fine-grained name points straight at the cause when it fails. Only the same property inspected in two places may be merged.

**When reducing the total, look at the heavy individuals, not the count.** The time is skewed per suite and per case. `ksplc/tests/negative/` is mostly a handful of cases that poke the depth safety valve. Their input must exceed a 1000-level ceiling and costs quadratically in the level count, so a large count does not mean a large amount of time.

### 15.3 'Supported' means someone uses it

**Each environment Kanso runs in is placed at one of three levels by what stands behind it: supported, built in CI but not confirmed, or untested.** The table and what each level promises are "Where it is supported" in the root [`README.md`](../README.md), the one place they are written. This section holds why they are set so.

**A green CI job is not enough for "supported".** CI runs weekly and on request, not on every commit ("How CI runs" in [`SPEC-gates.md`](SPEC-gates.md)), so it shows what ran that day. And a gate sees only what it was written to look at. Typing into a terminal, a file name the real filesystem holds, an input method and a debugger are met by someone who uses the environment day to day, and by no gate. So the top level needs both: the gates running there, and development done there.

**The C compiler is part of the environment.** ksplc emits C, and what becomes of it is the C compiler's: the warnings, the libraries a link needs, the object format, what C leaves unspecified. So a row names an operating system, an architecture and a C compiler together, and "Linux" alone is no row. No gate builds the generated C with GCC. So Principle 2's warning zero is kept on clang only, and GCC stands among the untested (Principle 8: a check seeing part is not read as the whole).

**A level is named by what stands behind it, not numbered.** A number, or "it builds", tells a reader nothing about whether their program runs, and a reader not told rounds it up to "supported".

**What no row names is written down as untested.** Translating to C99 means a new environment needs only a C compiler, not a port of the toolchain. A reader takes that for "it runs everywhere", and meets the gap as a bug.

Caution: **Do not raise a level because a CI job went green.** A new job places its environment at "built in CI". It moves up only once someone develops on it, and down once nobody does.

**What is given up**: an environment that would work is still listed as untested until someone runs it, so macOS reads as lower than its green job suggests. Nothing checks the table against who develops where. That is a fact about people, so the table is kept by hand, and a change of who works where changes it in the same commit.

### 15.4 The Windows executable is built on UCRT64

**The Windows `ksplc.exe` that ships is built by MSYS2 UCRT64's clang**, the toolchain Windows development runs on, not by LLVM's own clang targeting MSVC.

**The grounds**:

* **What ships is what is used.** "Supported" rests on someone developing there (§15.3). Built on another toolchain, the file users download would be the one Windows build nobody runs day to day. What no gate looks at (a console, a file name, a real keyboard) would break there unseen.
* **It needs nothing installed beside Windows.** UCRT is Windows 10's own C runtime, and the runtime uses Windows threads, not MSYS2's `winpthreads`. So the executable imports only DLLs Windows carries (the `api-ms-win-crt-*` set, `KERNEL32`, `SHELL32`, `WS2_32`). The release refuses an import found under MSYS2's tree (`.github/workflows/release.yml`, "Refuse a DLL that only MSYS2 carries"). A DLL such as `libwinpthread-1.dll` is present on the machine that built it and on no user's.
* **Building it needs no Visual Studio.** MSYS2 installs from its own packages. The MSVC target links against Microsoft's libraries, which a Build Tools install brings.
* **Nothing it links calls for MSVC.** That target's usual reason is linking with software Visual Studio built, which is why rustup recommends it. ksplc links no C++, so the reason does not arise.

**MSYS2 holds two kinds of tool, and the build uses both.** The tools with no prefix in `/usr/bin` (`bash`, `make`, `git`, `find`, `grep`, `sed`, `python`) are linked against `msys-2.0.dll`, a POSIX layer derived from Cygwin. They drive the build: POSIX paths (`/c/Work/...`), fork, signals, wait statuses, and argv and the environment byte for byte. They never touch the bytes of what ships. The tools named `mingw-w64-ucrt-x86_64-…` in `/ucrt64/bin` (`clang`, `ld.lld`, `llvm-objcopy`, `lldb`) are plain Windows programs. They build what ships and share its C runtime (UCRT). Built by the POSIX tools instead, `ksplc.exe` would depend on `msys-2.0.dll`. `MSYSTEM=UCRT64` chooses only which native tools come first on the PATH, and the shell always comes from the POSIX tools (`/ucrt64/bin/bash` does not exist).

**What is given up**: the MSVC target is not what ships, and stays "built in CI" (the `windows-msvc` job). A user whose clang is LLVM's own Windows build still compiles their program's C for it. Debug information from this toolchain is DWARF, not a PDB. So it is read with LLDB (as the release's bundled `.vscode/` does), not with Visual Studio's debugger.

**A tool taken from the wrong kind breaks later, far from its cause, after everything seemed to work.** So the Makefile refuses to run outside the UCRT64 shell, and refuses `mingw-w64-ucrt-x86_64-make`. Outside that shell the build breaks in ways that are hard to read. Windows's own `find.exe` shadows GNU `find` (`File not found - *.kspls`). The console's code page (CP932 in most Japanese environments) garbles `make`'s UTF-8 output. And WinSock goes unlinked because Python's `sys.platform` is not `"win32"`.

---

## 16. Models write it, and AI runs in it

**This chapter decides two things**: a model writes, reads and checks KSPL (§16.1), and AI runs in KSPL (§16.2). The grounds are the same for both: only what is written happens, so neither a model nor a microcontroller has to guess.

### 16.1 A model writes it, and the compiler judges it

* **A function can be judged from its text.** Nothing is allocated implicitly and no failure is missing from a type (`T?E`, `Option<|T|>`). So a model reviewing or generating code needs no knowledge of hidden run-time behaviour.
* **Generated code converges on one spelling.** One means per purpose (Principle 6) and one formatter (`ksplc fmt`) leave a model no equivalent spellings to drift between.
* **The verdict is mechanical.** Not one warning is let stand (Principle 2). A warning, an information or a hint carries a code that `ksplc explain <code>` expands on request, and an error says in its own message what to write instead. So a generated completion is judged by whether `ksplc` accepts it, not by opinion.
* **An agent reads the verdict as fields.** `--diagnostic-format=json` writes each diagnostic as one JSON object per line, with its code, place and message apart ("2.11 Diagnostics a program reads" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). So no reworded message breaks the reader.
* **What a model reads stays true.** The API pages and records are generated from the source and held to it by checks. The rules for a reader that is a model are in §12.4 above.

### 16.2 AI runs in it

* **The engine is KSPL alone** ([`ksai/`](../ksai/README.md)): tensors, inference, training, LoRA, the tokenizer and safetensors, with no second language beneath the model.
* **The same code runs from a microcontroller to a server.** On bare metal it takes its weights through `embed` and needs no heap; on a server one flag sends the matrix product to OpenBLAS.
* **The model, its tooling and the checking are one language.** So a kernel, the program calling it, and the compiler judging a generated program share one debugger and one set of rules.

### 16.3 What it costs

* **KSPL is in no model's training**, so every session pays context to read what KSPL leaves out (§12.4).
* **The engine runs on the CPU alone**, and each layer's backward pass is written by hand ([`ksai/docs/DESIGN.md`](../ksai/docs/DESIGN.md)).
