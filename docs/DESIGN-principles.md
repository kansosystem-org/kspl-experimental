# The principles behind Kanso's design

**This document says why Kanso is built the way it is, across every part of it.** It holds the Development Principles that every change answers to. It says why each purpose has one notation, and how a model reads and writes Kanso. The reasons behind the language itself are in [`DESIGN-programming-language.md`](DESIGN-programming-language.md). How the repository, its documents, its packages and its gates are organized is in [`DESIGN-repository.md`](DESIGN-repository.md).

What belongs to one folder, not to Kanso as a whole, stands in that folder. The compiler's internal design is [`ksplc/docs/DESIGN-compiler.md`](../ksplc/docs/DESIGN-compiler.md), and the standard library's is [`std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md).

## How to read this document

Start with the eight Development Principles. Kanso's design documents apply them one subject at a time, one decision per section. This document holds the principles and why each purpose has one notation ("One notation per purpose"). It also says what the whole is for ("Models write it, and AI runs in it"). [`DESIGN-programming-language.md`](DESIGN-programming-language.md) decides what a program means and how it is written down. [`DESIGN-repository.md`](DESIGN-repository.md) decides how the documents, the packages and the build are arranged.

* **Each section opens with the decision in plain words**, then gives the details, the reasons, and what the decision gives up. Reasons carry values.
* **This document holds only KSPL's decisions and their grounds**, not a survey of how other languages handle the same problems.
* **History is not written here** (Principle 7).
* **The headings carry no numbers.** A section is cited by its heading's words. A number shifts whenever a section is inserted above it, and every citation of it goes stale at once.
* **New to KSPL?** The two tables below give the notation and the words the chapters assume. The language itself is taught step by step in [`TUTORIAL.md`](TUTORIAL.md).

### The notation the examples use

KSPL reads like C written left to right. These are the forms the chapters use most; the full rules are in [`SPEC-programming-language.md`](SPEC-programming-language.md). The examples use the indentation notation (`.kspl`), where a block is its indented lines, as in Python (the chapter "The indentation notation (`.kspl`)" in [`DESIGN-notation.md`](DESIGN-notation.md)).

| You see | It means | Nearest C |
| :-- | :-- | :-- |
| `x: = 5` | Declare `x`, with its type inferred (here `I32`) | `const int x = 5;` |
| `$x: I64 = 0` | The `$` before the name lets `x` be assigned again | `int64_t x = 0;` |
| `x@` / `p$` | The address of `x` / what the pointer `p` points at | `&x` / `*p` |
| `I32@` / `I32$@` | A raw pointer to a read-only / writable `I32` | `const int*` / `int*` |
| `U8[]` / `U8$[]` | A slice: a pointer plus a length, its elements read-only / writable | a `{ptr, len}` struct |
| `U8[4]` | A fixed-length array of four bytes | `uint8_t a[4]` |
| `List<\|I32\|>` | A generic type given the type argument `I32` | C++'s `List<int>` |
| `I64::x` | Convert `x` to `I64` (a cast) | `(int64_t)x` |
| `T!E` | A result: a `T` on success, an error `E` on failure | — |
| `Sz` | The signed size and index type | `ptrdiff_t` |
| `fn m(r: Self@)` | A method; `r` is its *receiver*, the `a` in `a.m()` | `void m(const T *r)` |
| `pub` / `priv` | Visible from every file / from this file only; with neither, from this package | — |

### Words used throughout

Shared technical terms are defined in "Words used throughout" in [`SPEC-documents.md`](SPEC-documents.md). A reference to "Principle N" names one of the eight Development Principles below.

## Development Principles

Eight rules come first in every folder: in the language, the libraries, the tools and the documents alike. The table states each rule in one line. The numbered list after it gives, for each rule, why it holds and how to apply it, the most important point first. Other documents cite the list's numbers ("Principle 5").

| # | Principle | In plain words | For example | How it is checked |
| :-- | :-- | :-- | :-- | :-- |
| 1 | The Zen of Subtraction | Take a feature on only if its benefit outweighs all it costs, and remove one that stops paying its way | `Callable3` is not added. `std/seq` needs no more than two arguments, and "it would be handy" shows no price. See "Why capture is made explicit and escape is forbidden" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) | By review |
| 2 | Warning Zero | The build prints no warning, from `ksplc` or from the C compiler | A C `char*` is received as `Void@`, since `U8@` makes the C compiler warn ("What cannot be written in C's types" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | `make lint`, which passes only at zero, and `make test-c-warnings` |
| 3 | Keeping file size down and even | Keep files and functions short: split a file where its parts are read for different reasons, and merge a small file into its only user | Files and functions have size limits | `make test-conventions` for a file, `make lint` (H0803) for a function |
| 4 | Following DRY — one canonical source, copies tied together by a check | Keep each fact in one place. Where a copy must exist, a check compares it with the original | A runtime helper written in C and its LLVM counterpart are compared by `make test-conventions` ("What cannot be written in C's types" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | The check added with each copy, most of them in `make test-conventions` |
| 5 | Do not leave anything "writable but ineffective" | Whatever the compiler or a tool accepts must have an effect; otherwise it is an error | `defer` has no capture list, since one would change nothing ("Why `defer` has no capture list" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | By review; each check's own samples show that the check can fire |
| 6 | One means to one purpose | Offer one way to write each thing | No number casts to `Bool`, since `x != 0` already says it ("Why `Bool` keeps ordering and has no arithmetic" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | By review |
| 7 | Documents and comments state only "how it is now", in plain language | Write the present state and its reasons, never the history, in the short, plain sentences of [`SPEC-plain-language.md`](SPEC-plain-language.md) | This document says "X is", never "X used to be" | `make lint` for a comment's length (H0806); `make test-conventions` for a document sentence's length and phrases that tell a history; `tools/repo_stat.kspl` measures the share of comments; the rest by review |
| 8 | A check that can only be half kept is not made a guarantee | If ordinary code can slip past a check, do not let the check pose as a guarantee | There is no thread-safety marker, since a global variable bypasses it ("Why data races are not prevented by the type system" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | By review |

Each chapter below applies the principles to one subject, and [`ksplc/docs/DESIGN-compiler.md`](../ksplc/docs/DESIGN-compiler.md) applies them to the compiler's implementation.

1. **The Zen of Subtraction**

   **A feature costs more than the code it takes**: it has to be implemented, checked, documented and kept compatible, and every reader meets it. What is left after cutting is explicit and predictable. This holds for the language, a library's API and a tool's options alike.

   * **Name the price before adding.** The price is the implementation, its checks, its documentation and future compatibility. "It would be handy" names no price, so it is no reason to add.
   * **Take the feature on only if its benefit is larger.** Ask whether the cost is paid once or on every change, and whether whoever pays is whoever benefits.
   * **Do not pay for input that does not occur in practice.** Making absurd nesting depths or item counts fast is no benefit. A wrong answer is another matter: it is fixed whatever the input (Principle 5).
   * **Remove a feature that has stopped paying its way**, even one already built: being there is no reason to stay. Weigh it again once its use and upkeep can be seen. When removing it, show its replacement, or make the old notation an error. Leaving it accepted but doing nothing breaks Principle 5.

2. **Warning Zero**

   **A warning that stays hides the next one**: among warnings everyone has learned to skip, a new one goes unread. So `ksplc` prints none, and neither do `clang` and `gcc` when they build the generated C.

   * **Fix a warning before moving on to the next piece of work.**

3. **Keeping file size down and even**

   **A reader holds one file in mind at a time.** Mistakes hide in a file or a function too long to hold. A file too short to stand alone sends the reader to another file to understand it. The file, function and nesting limits are in "Principle 3 - what is counted, and how" in [`SPEC-gates.md`](SPEC-gates.md).

   * **Split where the parts are read for different reasons**, not at a line count. Cut by count, neither file can be read without the other. How to place the cut is "Choosing where to split a file" below.
   * **Plan the split before the limit is reached.** Split on the day the limit is hit, and the split lands inside an unrelated change. As a file nears the limit, write down where it will split ("Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md)) before touching it again.
   * **Merge a small file into its only user**, unless it has a reason to stand alone ("When a small file stands alone" below).
   * What `make test-conventions` counts, and its exceptions, are "What the convention checks count" in [`SPEC-gates.md`](SPEC-gates.md).

4. **Following DRY — one canonical source, copies tied together by a check**

   **Two copies of one fact drift apart.** A fix reaches one copy, and whoever made it cannot see the other. Someone else finds the difference another day. So each fact, whether data, a computation or a field, lives in one place: its canonical source. DRY stands for "don't repeat yourself".

   * **Before adding, look for what already holds the fact.** Add a field or a function only when no existing one can serve.
   * **Where a copy cannot be avoided, add the check that compares it with the original, in the same commit.**
   * **Make the check's failure name the file to fix**, as each "X matches" and "X agrees" check in `make test-conventions` does.
   * Principle 6 is the same idea applied to the ways a thing is written.

5. **Do not leave anything "writable but ineffective"**

   **What is accepted but does nothing hides a bug**: its writer believes it took effect, so nobody looks there. This covers the language's grammar, attributes and modifiers; a tool's options and configuration keys; a library's arguments.

   * **Give it an effect, or refuse it with an error.** Never accept it and ignore it.
   * **A check is something written too.** A check that runs but can never fail stays green while the rule is broken, so each check shows that it can fire. How it does so is "Showing that a check can fire" in [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md). For the compiler's diagnostics, it is a heading in [`ksplc/docs/DESIGN-diagnostics.md`](../ksplc/docs/DESIGN-diagnostics.md):
     * "The pass/fail verdict is checked apart from each diagnostic".

6. **One means to one purpose**

   **With two ways to write one thing, nobody can tell which is canonical**, and a fix made to one leaves the two different. This covers an alias for an option, two API names for one operation, and two notations with one meaning.

   * **Before adding a means, confirm that no existing one serves.**
   * Principle 4 keeps a fact in one place; this one keeps each purpose to one way of writing it.

7. **Documents and comments state only "how it is now"**

   **A reader acts on what the text says**: where it tells a history, they have to work out which part still holds. This covers source comments, READMEs, DESIGN and SPEC documents alike. History belongs in git commit messages.

   * **Write in plain language** ([`SPEC-plain-language.md`](SPEC-plain-language.md)): short sentences, one topic each, the actor first, one word for one thing. This holds for documents, comments, diagnostic messages and reports to a person. **A text is read many more times than it is written.** So a minute the writer spends on a sentence saves every reader that minute. Many readers do not have the text's language as their first one. A model reads each word as it stands. So an idiom or a vague word misleads both. Fixed rules also make one writer's text read like the next one's.
   * **Keep general writing rules independent of their field.** The plain-language specification separates its core and English rules from its software and Kanso chapters. This lets another field replace local terminology and conventions without copying project assumptions into its general rules. Kanso keeps its comment notation and checks in the project chapter.
   * **Write** the decided facts and their reasons, and what breaks if the thing is changed. Write the traps the next person is likely to hit ("A trap is written as why it is dangerous" in [`SPEC-documents.md`](SPEC-documents.md)). Write the contract seen from outside: what the arguments mean, lifetimes, the order of calls.
   * **Do not write how it came to be.** Leave out a work log, the investigation, rejected proposals and bugs already fixed. Leave out experience told in the past tense, dates, and which attempt this was.
   * **An absence is a present fact.** Where leaving something out is the decision, write what is absent and why. Then the same proposal does not come back ("Markers not carried" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) and "Notations not carried" below). Never write when or by whom it was decided.
   * **Do not write a figure that changes while nobody touches the repository**, such as a measured time. It is stale once written, and nobody can see that it is. Write the relation and the order of magnitude, and point at where the measurement and the way to retake it are.
   * **Keep each comment short.** "Comment notation and limits" in [`SPEC-plain-language.md`](SPEC-plain-language.md) sets the limits. Longer background belongs in a design document, where a reader seeks the reasons.
   * **The comment-share limit applies to the repository, rather than each file.** A file with hard logic can need more explanation than a plain one. Room under the limit is no reason to write more: keep what the code cannot say, said once and briefly.

8. **A check that can only be half kept is not made a guarantee**

   **A check that ordinary code slips past is trusted more than it deserves.** A program passes it and still breaks. Its writer trusts it the more for having passed. Half-protecting is worse than not protecting at all.

   * **Before forbidding something, confirm that no ordinary way of writing slips past the check.** Where one does, the type system does not state the rule.
     * Failure (`T!E`), the absence of a value (`Option`) and being uninitialized cannot be slipped past, so the type system states them.
     * Lifetime (who frees what, and when) and sharing (which threads can touch a value) can be, through raw pointers and top-level variables. So the type system leaves them out. See the chapters "Ownership and lifetime" and "Concurrency" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md).
   * **What the type system does not state, the type's name does.** `Rc` (one thread), `Arc` (shareable), `Mutex<|T|>`, `Atomic_sz` and `Move_only` put the choice in front of whoever calls: misuse is made visible instead of stopped.
   * **A check that sees only some forms says so.** The convention checks read literal text and miss some forms, so their rules state that a form escaping the check is still a violation. Otherwise green is read as "the rule is kept".

### Choosing where to split a file

**Put the cut where the fewest names have to cross it.** Principle 3 splits a file where its parts are read for different reasons. Among the cuts that do that, this one leaves each file readable on its own. A package's own limits are in its README. So is the plan for each of its files near the cap ("Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md)). Below, `priv` marks a name visible only inside its own file.

**First count what would cross**: the names each side needs from the other, by call sites, not by mentions. Take a part that touches none of the other part's state, or only a value fixed before the work starts. It moves out with its imports running one way. `ksplc/fmt/space.kspl` touches no part of `Formatter`, and `ksplc/fmt/style.kspl` takes only `Config`.

**Then place what the two parts share**:

| What | Where it goes | Why |
| :-- | :-- | :-- |
| The types the moved state holds | With the state | Left behind, they make the two files import each other. So `ksplc/sema/session/state.kspl` holds `Generic_arg`, `Alias_info` and `Import_symbol_info` beside the state structs |
| What both parts read | The lower file, opened from `priv` | Moved up, it makes the lower file import the file that imports it |
| A name only the moved part calls | The moved part, still `priv` | A name opened from `priv` is open to the whole package |
| Some of an `impl`'s methods | A second `impl` of the same type, in the new file | An `impl` can add methods to a type declared in another file ("9.3 Adding a method to another file's type" in [`SPEC-programming-language.md`](SPEC-programming-language.md)), as `ksplc/base/ast_place.kspl` does for `Ast_node`. Callers import the new file, and `make lint` names a missing import |

**Three cases need care**:

* **Two parts that call each other** can import each other inside one folder, as `ksplc/gen/c/expr.kspl` and `ksplc/gen/c/expr_postfix.kspl` do. The price is that neither file can be read alone.
  * Caution: **Where a package keeps its imports running one way, an `impl` the original calls back cannot move alone.** Move the state it touches with it.
* **A reader of text is not split by word order.** A form that puts the name before the document and a form that puts it after are one reading. Kept in two files, a fix to one leaves the other behind.
* **Part of a test suite goes to a support file, not to a suite of its own.** The Makefile registers each suite as one unit, so a new suite starts its own copy of whatever it drives, such as a language server. A support file takes what the suite drives as a parameter, so it starts once. Keep the part together by its fixture (the source it exercises), not by its entry point. Take one source that exercises several readers: split by entry point, it is written twice.

**After a cut, fix the documents that name what moved.** `make test-docref` checks that each named symbol is in the named file, so it fails even when only a call moved.

**What this gives up**: a cut placed by what crosses can leave one file well under the cap and the other near it. The line count is not the goal.

### When a small file stands alone

**A short file that only one other file uses joins that file, unless it has a reason to stand alone.** To understand either, a reader opens both, so the two are one part kept in two places. This is the other half of Principle 3: split where the reasons to read differ, and merge where they are the same. The small files complained about in other languages exist because a rule demanded them, not a reader. Examples are a class per file, a module's boilerplate file, an empty package marker, and a function made a package of its own.

**A file stands alone for one of four reasons**:

| Reason | What it covers |
| :-- | :-- |
| **A tool needs it whole** | It has a `main` of its own (a script, a suite, a package's entry point). Or it is a fixture that compiles only where it stands, or an asset. A fixture that is a complete program elsewhere too is a case in its subject's file instead. The suite writes that case out alone ("How a case is compiled" in [`ksplc/docs/HOWTO-add-a-fixture.md`](../ksplc/docs/HOWTO-add-a-fixture.md)) |
| **Another reader imports it** | Something needs it without the rest, such as a lower layer, or a driver offered as a part to any program |
| **It is a boundary** | `priv` stops at the file, so the file is what keeps its insides out of reach |
| **It changes for another reason** | A platform, a piece of hardware, a bring-up stage, or a cut made because the file it came from neared the cap |

**"Short" is 60 lines or fewer**, about one screen, so a merge costs no scrolling. Two kinds of import are not a use. A link-only import (an `_` alias) brings in entry points to be linked, never called. A package's test entry point (`all.kspl`) gathers files that each stand for a subject of their own.

**What it gives up**: a file that has one user today and several tomorrow is merged and later split out again. A merge is cheap to undo, so that cost is accepted over a file that stays split for a reason nobody can name.

## One notation per purpose

**If the same thing can be written two ways, one of them is withdrawn.** A *notation* is a way of spelling something in the source. With one notation per purpose, everyone writes the same source for the same job, and a writer's taste cannot make it drift apart. Python states the same aim: "There should be one obvious way to do it".

A notation is judged by three questions, in this order. *Sugar* means a short spelling that the compiler expands into a longer form you could also write by hand.

1. **Do the meanings coincide exactly?** If either can always be written with the other, one is unnecessary.
2. **Is it sugar?** If the expanded form can always be written, the sugar must give more than brevity. Used in hundreds of places, it meets a real demand for readability. Used in a handful, it is withdrawn.
3. **Count actual use.** A notation the grammar accepts and nobody uses is a liability. All it does is show the reader an option.

**Sometimes both stay**: where each form has hundreds of real uses, and removing one would cost expressiveness or readability. Three pairs stay for this reason:

* compound assignment (`x += y` beside `x = x + y`);
* the block form and the expression form of `catch`;
* the named and positional forms of a struct literal.

**A pair kept for a transition goes when the transition ends.** The type call `T(...)` once stood beside the explicit `T.new(...)`. The tree moved to `T(...)`, and then the explicit call became a compile error. A static `new` now has one spelling ("A type call selects its existing constructor" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)).

**Symmetry does not save a form nobody uses.** Two forms were once kept together. One declared several variables at once (`a: I32 = 1, b: I32 = 2;`). The other gave a C-style loop several inits and steps (`for $i: = 0, $j: = 100; …; i += 1, j -= 1`). Narrowing only the init would have made the two halves of one loop differ. The tree then held no use of either outside the compiler's own tests. Each was a second way to write what two declarations, or a variable declared before the loop and changed in its body, already write. So both went at once, and the two halves keep one rule. **A declaration names one variable, and a loop's header holds one init and one step.**

**What is given up: the code does not get shorter.** With little sugar, the same work takes more lines than in a language with shorter forms. In return, only what is written happens. The extra lines have three sources.

| # | Where the extra lines come from | What it is |
| :-- | :-- | :-- |
| 1 | **Lines that hold only a closing brace** | The price of braces that cannot be left out. They are a sizeable share of a brace language's lines. The indentation notation (the chapter "The indentation notation (`.kspl`)" in [`DESIGN-notation.md`](DESIGN-notation.md)) removes exactly those, losing no content, and its character count barely moves |
| 2 | **Code that says who owns what** | The price of not hiding ownership (which code frees which memory). It stays |
| 3 | **Functions `std/` lacks that would do a whole errand in one call** | Not a price but a gap ("Known holes, and what would fill them" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md)) |

Note: **A function doing a whole errand barely reduces the line count.** Take a round-trip function: one call that turns a struct into JSON and back. With one, `tests/tools/perf_guard.kspl` has as many code lines as without one. See the `json_struct` rows of "Known problems KSPL handles" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md). Such a function removes key names spelled twice and placeholder values filled in as defaults, not lines.

### Notations not carried

What KSPL leaves out, and what to write instead, is "Appendix A: Features not carried, and what to write instead" in [`SPEC-programming-language.md`](SPEC-programming-language.md). This section holds why, so that the same proposal does not come round again.

**The test is not whether a feature is sugar.** KSPL desugars plenty: `!`, `catch`'s expression form, the conditional value, string interpolation, operator overloading, closures. Each adds to what can be written while keeping one notation. What is turned away gives a second notation to something already writable, or adds implicit behavior.

| Not carried | Why |
| :-- | :-- |
| **try-finally** | Each resource nests a level deeper, and an early `return` sits badly. `defer` gives `finally`'s guarantee, running on every way out |
| **Automatic cleanup** | Every cleanup stands in the source, where a reader sees when it runs. `defer` in front of a declaration costs one word and says it. A type that frees itself leaves nothing on the page, and a reader has to know which types do. Shared ownership opts into `Ref_counted` |
| **Garbage collection** | When something is freed can be read from the source |
| **A cleanup joined behind its declaration** | A form behind the declaration that took any call would need a receiver filled in, as no other construct does. `defer` in front of the declaration covers `free()`, the one call a declaration fixes. See "A declaration takes `defer` in front, and only to free" below |
| **Class inheritance** | It keeps the memory layout simple |
| **Named actual arguments** | One call would have two spellings (`f(0)` and `f(offset = 0)`), and **parameter names would become published API** (Python offers the positional-only `/` to keep them out of it). Through a function-pointer type, the names in the type and in the definition can disagree |
| **Function overloading** | No tracing which of several same-named candidates is called |
| **A distinct type made from another**, and other spellings of a type's other name | One word, one meaning, one spelling. `typedef` stays a name, as in C, Rust and Swift. A type kept apart is declared as one, so a mix-up is an error at no run-time cost. See "The spelling of reserved words is taken from C" in [`DESIGN-notation.md`](DESIGN-notation.md) |
| **`?` for a result** | `!` marks the place a function can stop and hand a failure back, and `?` marks absence ("Failure" below) |
| **The abbreviated error type `T!`** | It would be a second spelling of one type |
| **Several variables in one declaration, and several inits or steps in a loop's header** | Two declarations, or a variable declared before the loop and changed in its body, already write it, and nothing used the short form. See "Symmetry does not save a form nobody uses" above |
| **The type's name in a `case`** | The subject already fixes the type, so `case Event.quit` would be a second spelling of `case .quit` |
| **Another language's word for a loop or a branch** | One word for each job, spelled as C spells it. So a keyword takes no name a writer would use. See "The spelling of reserved words is taken from C" in [`DESIGN-notation.md`](DESIGN-notation.md) |
| **`::` as a path separator** | A second mark would give a member two spellings. And `::` already has a job: `json::Value` would read like `Sz::n`. See "Why `::` stays the cast, and what it costs to parse" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) |
| **Range syntax (`a..b`)** | A call already writes it, so an operator would be a second notation. `a..b` does not show whether its bound is exclusive; `Range.new`'s argument names do |
| **A rename inside an import's braces** | A name then has a spelling of its own in one file, which a reader of another does not know. The file's own alias (`import "p" as q`) already renames, and keeps `q.` in front so the origin shows. Nothing outside the tests used it |
| **`a[i..j]` for cutting out a slice** | It keeps the language small; a method already cuts any element type |
| **Tuples** | Each returned value gets a name, so the contents can be read |
| **A named local function** | Only a closure can be written inside a function body. Its environment rides on the caller's frame. So it cannot be named and reused from several functions |
| **A closure that can be taken outside its function** | A closure keeps its captured values on the frame that built it. See "Why capture is made explicit and escape is forbidden" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md). Where the values must leave, an ordinary struct makes their lifetime the writer's to decide |
| **A trailing closure** | One call would have two spellings (`f(xs, g)` and `f(xs) g`). In the indentation notation, a closure after `if xs.any()` could not be told from the `if`'s body. See "Why a closure is not written after the call" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) |
| **A static variable inside a function** | State persisting across calls lines up at the head of the file, where what touches it can be seen |
| **`guard let`, `?.` and `??`** | `catch { … }` on an optional already takes the value or leaves, so `guard let` would be a second notation. `unwrap_or(v)` already gives a value in place of `.none`, so `??` would be a second spelling. `?.` would end a chain with no mark where it stops. See "Unwrapping an `Option`" below |
| **A separate prefixed string form for formatting** | An ordinary string literal already formats in place, so it would be a second notation for one string |
| **Block comments `/* */`** | `//` already writes every comment, so it would be a second notation |
| **A documentation comment in front of what it documents**, or inside it | A description sits on what it describes, and no name is written twice ("The documentation a declaration carries" in [`DESIGN-notation.md`](DESIGN-notation.md)) |
| **Escapes outside the ten** | "Escapes are closed at ten" below |
| **A built-in `Char` type** | "There is no `Char` type" below |
| **A multi-byte character literal** | "There is no `Char` type" below |
| **An octal literal**, and a decimal integer that starts with `0` | "A decimal integer does not start with 0" below |
| **Link flags in the source** | A flag forces one machine's link line on every machine that builds it. It can also run code at build time. A library's name carries neither. See "The library an `extern` block needs is named on the block" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) |
| **A postfix `if` / a conditional `break`** | The action before its condition runs against reading top to bottom (the condition, then the contents) |
| **A deprecation mark** | A feature that stops paying its way is removed outright, its callers changed with it (Principle 1). A period of warnings would keep two ways of doing one thing alive |

**Withdrawing a notation removes it from every place the source is read.** That is the grammar, and the compiler's own code that skips whitespace and comments. Removed from only one, a form the grammar refuses would pass silently through the other. Where the compiler reads comments apart from the grammar is "Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN-parse.md`](../ksplc/docs/DESIGN-parse.md).

#### Escapes are closed at ten

**Only ten escapes can follow a `\` in a literal; any other, such as C's `\b`, is an error, not a plain `b`** ("2.3.2 Escape sequences" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). Reading an unknown one as "the character itself" would make `\b` and `b` two spellings of one byte, which Principle 6 (one means to one purpose) forbids. Worse, a `'\b'` copied from C (where it is the backspace, byte 8) would silently become `'b'`, which is what Principle 5 (nothing "writable but ineffective") forbids. The compiler holds the rejection in one place (`is_known_escape` in `ksplc/base/literal.kspl`), and `make test-negative` holds it.

**`\{` and `\}` are among the ten because interpolation is written `\{` … `\}`.** *Interpolation* puts a value inside a string: `"n=\{n\}"`. So a bare `{` stands in the text as it is. There is no doubling (`{{`), which Python's f-strings and C# require. `'\{'` is the matching form in a character literal.

**`\uXXXX` takes exactly four hex digits** ("2.3.3 Writing a code point with `\uXXXX`" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). A *code point* is a character's number in Unicode. The table compares the shapes other languages use.

| Shape | Where | What goes wrong | KSPL |
| :-- | :-- | :-- | :-- |
| Greedy hex escape (`\x` takes every hex digit that follows) | C/C++ and Python's `\x` | The meaning changes when another hex digit follows the escape | No hex escape at all, so a fixed count of four closes the hole by itself |
| Braced code point (`\u{0041}`) | Rust, Swift | Confusable with interpolation's `\{` … `\}` | Not taken |

**Nothing above U+FFFF and no surrogate is written with `\u`.** A *surrogate pair* is how UTF-16, Java's string encoding, stores a character above U+FFFF in two halves. KSPL's strings are UTF-8, where such a half is only an invalid byte sequence. A character above U+FFFF is written directly into the UTF-8 source.

**`\u` is expanded only where a literal's bytes are decided, never before lexing** (*lexing* is the first step of compiling, which cuts the text into words). So comments and raw strings pass through untouched. Java expands `\u` before lexing, so a `\u000A` (a newline) inside a comment breaks the file.

#### There is no `Char` type

**A character literal such as `'a'` holds exactly one byte (`U8`).** If accepted, `'あ'` (three bytes in UTF-8) would silently give only its first byte. The same character written with `\u` is rejected, so the two ways of writing one thing would give different answers. One rule judges the escaped and unescaped forms alike (`literal_fault` in `ksplc/base/literal.kspl`).

**There is no `Char` type because it would carry exactly one job.** It would have `U8`'s representation and values, and differ only in printing as a character in interpolation (`\{x\}`). One byte has two readings, "as a number" and "as a character". The line between them belongs to how it is written, not to its type. Split by type, the line breaks easily: pass a `Char` once through a function that takes `U8`, and `A` prints as `65`. So the type would guarantee nothing. `\{b:c\}` puts the line where the value is printed, and says the same without a type (Principle 1, the Zen of Subtraction, and Principle 6). It adds one notation and removes one type, so it is not an addition.

**Only `U8` carries `fmt_char`** (`std/strfmt.kspl`), for the same reason hex has its own `fmt_hex`. So `:c` on another type is refused (docs/SPEC-programming-language.md §3.6.2). Do not let `c` take a width, zero padding or thousands separators. One character has nothing for them to apply to, so they would be written and do nothing (`char_alone` in `ksplc/parse/format_spec.kspl`).

**A character type can return, but not as eight bits.** It would be a text type that guarantees valid UTF-8, kept apart from `U8[]`, and it would give a code point (32 bits) per step when iterated. Its name is undecided, and `Char` is not the leading candidate. The word names five different things across languages and suggests one byte (Go uses `rune` rather than reuse it).

**No word is reserved for it.** The grounds:

* A reservation works only once the name is decided, and deciding the name is the design of the type.
* Holding `Char` would protect a candidate that is not in the lead.
* Holding a list of candidates grows the vocabulary for a type nobody has decided to build (Principle 1).
* A word reserved later breaks the code that used it, as Rust's `try` and `gen` do even with editions and `r#`. Here that breakage is the cheapest kind: a compile error at the declaration, fixed by one rename.

**If a word is reserved anyway, reserve it in sema's name check, not in the grammar.** (*Sema*, semantic analysis, is the compiler stage that resolves names and types.) A word blocked by the grammar's `_Keyword` gets the same "expected 'character class'" error as `struct I32`, which does not say why it cannot be written.

#### A declaration takes `defer` in front, and only to free

A value that is freed when its block ends is declared with `defer` in front: `defer $buf: = List<|I32|>(null)`. It means the declaration followed by `defer buf.free()`. A cleanup other than `free()` is a `defer` statement of its own, on the next line, naming what it cleans up.

`defer` runs a statement when the enclosing block exits; it is how a file is closed or memory freed on every way out.

```kspl
import "std/ds" { List }
import "std/thread"

priv fn greet()
    defer $buf: = List<|I32|>(null)
    buf.push(1)

priv fn count(m: thread.Mutex<|I32|>$@)
    n: = m.lock()
    defer m.unlock()
    n$ += 1
```

**The call goes through the trait `Manual_free`, matched by its full name.** A method that is only named `free` does not count, and no parameter names another method. So the one word in front always means the same call, and a type that has nothing to free is refused at the declaration.

**One way stays canonical.** `defer x.free()` on the line after `x`'s declaration says the same thing in two lines, so a hint ([H0303]) asks for the form in front. The two-line form stays for every other cleanup (`unlock`, a child's `wait`, an arena's `restore`).

**The form behind the declaration, `buf: = … defer .free()`, stays out.** It costs three things, and the form in front avoids each.

| Cost of the form behind | How the form in front avoids it |
| :-- | :-- |
| **It would be the one statement that carries on behind a closed level.** Under `x: = f() catch`, with a deeper `fallback` line, a `defer .free()` back at `x`'s column would join `x`'s statement. The indentation reader would need an exception for a line opening with `defer .` | It starts the line. The indentation reader already reads a `defer` with no block after it as one statement. So a `catch` block under the declaration closes as it does without `defer` ("How a column is read" in [`DESIGN-notation.md`](DESIGN-notation.md)) |
| **It fills in a receiver nothing else fills in.** Everywhere else a leading `.` names an enum value (`.ok`). So a `defer .free()` moved to a line of its own would meet "cannot infer the enum type" | Nothing is filled in. The name is the declared one, and the call is the trait's |
| **It is written nowhere else.** No form bound to a declaration fills a receiver into an arbitrary call | It has the shape of a declaration that frees what it binds, which other languages write too, and which a model reads at sight |

**Nothing can come between an acquisition and its cleanup in the form in front.** The two-line form leaves that to the writer, and [W0109] asks about a way out in between. A value declared with `defer` is freed when its block ends, so handing it over is refused. Declare it without `defer` to return or store it.

**What holds it**: a `defer` behind a statement is refused. For a `.free()`, the refusal gives the form in front as the line to write (`append_trailing_defer_hint` in [`../ksplc/parse/syntax_msg.kspl`](../ksplc/parse/syntax_msg.kspl)). A `defer .free()` standing alone is refused by name (`reject_receiverless_cleanup` in [`../ksplc/sema/body/stmt.kspl`](../ksplc/sema/body/stmt.kspl)). `make test-negative` holds both.

#### A decimal integer does not start with 0

**`0755` is a syntax error: a leading `0` on a decimal integer is not a decimal digit and not an octal mark.** Write `0x1ed` for a bit pattern, or `755` for the decimal number ("2.3 Literals" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). Languages split on this spelling:

| Reading of `0755` | Languages |
| :-- | :-- |
| Octal (base 8), so 493 | C, C++, Java |
| Decimal, so 755 | Rust, Swift |
| Refused | Python 3, KSPL |

Whichever reading KSPL took, a writer from the other half would get a different number with no diagnostic. A file mode written `0755` is the usual case, and a model trained on C writes it that way too. Refusing it is the one answer that leaves no one with a silent wrong value; Python 3 refuses it for the same reason. Octal itself is not carried, because hexadecimal already writes bit patterns (Principle 6). The grammar refuses the spelling (`Integer` in `ksplc/kspl.kspeg`), so an array length or a constant refuses it just as an expression does. The syntax error's note names both readings.

### One mechanism per purpose

**Not only spellings but whole mechanisms are kept to one per purpose.** Two mechanisms that serve one purpose are gathered into one, for the same reason as two spellings. For example, there is one loop form over a collection and one way to report failure. With two, the reader must work out from a type or a signature which convention a place follows. Record the form not carried as well as where it was gathered, or the same proposal comes round again.

**Each gathering is recorded with how a departure from it is noticed.** Iteration, failure, unwrapping an `Option` and translation-time conditions need more than a row, so they follow the table. (A *lint* is a check that `ksplc lint` runs for style and likely mistakes; codes like [I0310] name one.)

| Purpose | Where it was gathered | How a departure is noticed |
| :-- | :-- | :-- |
| Importing a file | `as` only to rename; unmarked when the name stays | lint [I0310] |
| Iterating n times | `for x in Range.asc(n)`, or `for x in xs` where the index only reads the element; a C-style three-part loop only when the body changes the index or the bound | lint [I0314], which says nothing where it cannot tell whether the body changes them |
| Heap allocation | `alloc_as<\|T\|>()` / `arena.alloc_as<\|T\|>()` / `heap_alloc_as<\|T\|>()`; `alloc(<byte count>)` for raw bytes only | `alloc_as` in `std/mem.kspl` |
| Boolean conjunction and disjunction | `&&` / `\|\|`; `&` / `\|` when both sides must be evaluated. `*` / `+` would work identically over `_Bool`, so they are rejected at translation time | `make test-negative` (what is rejected) and `ksplc/tests/lang_limits_test.kspl` (what is kept) |

#### Iteration

**Every loop over a sequence is written `for x in xs`, the one way to write iteration.** The compiler expands it either by index or through `std/lang`'s `Iter<|T|>` (a trait with one method, `next`). The writer chooses neither; the type of `xs` decides (docs/SPEC-programming-language.md, 7.2). The point is not to add notations, so no form drives an iterator by hand (`for it.has_next() { … }`). For the same reason `Iter` has only `next`. A separate "is there more" method would make it possible to call only one of the two.

**`Iter` wins on a type that satisfies both** (the rule is docs/SPEC-programming-language.md, 7.2). A type can be walked by index just by having the right shape, while `Iter` is declared on purpose. A structural match alone must not silently disable what was declared explicitly (Principle 5).

**Which `std` APIs are eager and which lazy** is `std`'s own design. So are what each costs, and why a chain can be driven any number of times. See "Iteration has one notation" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md). (*Eager* builds the whole result at once; *lazy* produces one element each time the loop asks.) Do not add terminals, the methods that consume a chain and return one value. Counting, folding and searching are all written with `for x in`, so each terminal added is a second way of doing the same thing.

**Nothing is eager because closures cannot be held.** A struct holding a predicate (a function that answers yes or no) can be written. The closure's captured variables live in the caller's frame ("Why capture is made explicit and escape is forbidden" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)). The struct lives while the chain is built and consumed there. What cannot be written is a function that creates a closure and returns it ("Which pointers into a frame are stopped from leaving it" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)).

**The lazy chain rests on four properties of the language.** The first is the `Iter` above, which puts even a sequence with no `.len` onto `for x in`. The other three let the chain be written as method calls:

* **A method can return its own type one level deeper** (`Seq<|S|>.where(): Seq<|Wh<|S|>|>`), and a level advances only as far as the user wrote.
* **A method can introduce a new type argument** (`fn select<|U|>`), bound at the call site (["A type argument with nothing to bind to is rejected" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)](DESIGN-programming-language.md#a-type-argument-with-nothing-to-bind-to-is-rejected)).
* **A closure literal passed directly still fixes the type argument.** Its type is a synthesized environment (`_anon_env_N`) that declares no generics of its own. So the argument is taken from the instantiation of the `Callable1` it declares (`implemented_trait_instance` in `ksplc/sema/type/env.kspl`).

**The stage types nest** (`Conversion<|Keep<|List_seq<|T|>, T|>, T, U|>`), and every stage repeats `where` / `select` / `to_list`. So each new kind of stage multiplies the code in `std/seq`. Rust's `Iterator`, Java's `Stream` and Swift's `Sequence` remove this repetition with default method bodies. Which of the three a trait's default body could take in KSPL is std's own design. So is why each stays per stage. See ["Why the chain's stages cannot be folded"](../std/docs/DESIGN-core.md#why-the-chains-stages-cannot-be-folded) in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md).

#### Failure

**There is one way to convey failure, `T!E`** (a result that is either a `T` or an error `E`). `std/io.kspl` uses `!Io_error` and `std/fs.kspl` uses `!Fs_error`, with no `Option` or `Bool` mixed into the same file for failure. `exists` / `is_dir` stay `Bool`: they answer a question, and "does not exist" is a normal answer, not a failure.

**A result is marked with `!`, in its type (`T!E`) and where its failure is passed on (`f()!`), and `?` marks nothing.** `!` reads as what it is: a place where the function can stop and hand a failure back. `?` means absence, as Swift, Kotlin and C# spell an optional value. See `T?` and "`T?` is sugar for `Option<|T|>`" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md).

* **Two rules make it parse without ambiguity.** A postfix `!` is read only where no `=` follows it, so `a!=b` compares and `f()! == x` needs its space. A `!` at a line's end ends the statement. A `!` at a line's start continues the line before (a wrapped `T!E`). A statement never begins with a prefix `!`, whose value would be thrown away.
* **What is given up**: a reader of Swift, Kotlin, C# or TypeScript reads `x!` as "assume it is present". That is a crash or an unchecked promise, where KSPL's `f()!` quietly passes a failure up. And Rust's `?`, which means exactly what KSPL's `!` does, is not shared.

**A result is an ordinary value, so one mechanism serves it and the optional**: `T!E` is `std/lang`'s enum `Result<|T, E|>`, as `T?` is `Option<|T|>`. The rules are "8.3 Error handling" in [`SPEC-programming-language.md`](SPEC-programming-language.md). Why the result is a library type is "`T!E` is sugar for `Result<|T, E|>`" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md). That section also says why a result nobody takes apart is a compile error.

#### Unwrapping an `Option`

**There is one `if` for using the value inside an `Option` (unwrapping it), `if name: = expression`; inside the block, `name` holds the value.** The form that declares a name inside the condition with `;` (`if v: = X; v == .some`) is not carried. The two serve different purposes: `;` says where a name lives (scoping), and `if name: =` says how the contents come out (unwrapping). The `;` form binds the `Option` itself, so most real uses would need one more line to unwrap it. Nor does the `v == .some` checked in the condition carry into the block, so a check would be writable and ineffective (Principle 5). Making it effective would need type narrowing (the compiler learning a variable's narrower type from a condition). Scoping alone does not justify the form either:

* shadowing (a new name hiding an outer one of the same spelling) is rejected (lint [I0501]);
* a bare `{ … }` already scopes;
* chaining while keeping the contents bound is the `,` form's job.

**`catch { … }` takes an `Option`'s value or leaves, as it takes a result's.** Most uses of an optional do one of the two at once. Without a form for that, each use would need a `switch` of about six lines. `T?` and `T!E` are both library enums, so one mechanism serves both, and no notation is added. On an optional, the block must leave in every position, a statement's block included:

* **The name is always bound after the `catch`.** No reader has to ask whether a value came.
* **A block that gave a value would repeat `unwrap_or(v)`.** So `fallback` and the expression form `opt catch v` are refused, and the note writes `unwrap_or`. One purpose keeps one spelling (Principle 6).
* **`.none` carries nothing, so the block names nothing.** A result's block may give a value, because the error it names can decide that value. An optional's block has nothing to decide by.

#### Translation-time conditions

**`#cfg(flag)` leaves a declaration out of the build, and `##error` stops the build. These translation-time conditions stay two separate tools. `#cfg` stays the weaker one on purpose.** (*Translation time* is while the compiler runs, before the program does.)

| | `#cfg(flag)` | `##error` |
| :-- | :-- | :-- |
| What it does | Drops a declaration | Emits a diagnostic |
| What it takes | One flag name, with no comparison and no `&&` (docs/SPEC-programming-language.md §10.1) | A foldable expression (`sizeof(Sz) == 8`): one the compiler can compute |
| If the condition is misread | The declaration vanishes, with no message | A diagnostic appears |
| When it runs | Before declarations are gathered (`ksplc/parse/normalize.kspl`), when no names or types are resolved yet | After types are attached (`ksplc/sema/body/infer.kspl`) |

Two grounds follow from the table.

* **A mistake shows in opposite ways.** A rich condition on the silent one alone would erase the clue to the mistake.
* **They run at different stages.** When `#cfg` runs, the material for a comparison is absent. A comparison there would need arithmetic apart from the language, at a stage with no types: the C preprocessor's shape.

**A translation-time condition has no warning form.** A condition that fails stops the build. A warning that stays would hide the next one (Principle 2).

**An attribute is either interpreted by both backends or explicitly rejected by one.** (A *backend* turns the checked program into output: ksplc has one that writes C and one that writes LLVM IR.) None is silently ignored under `--to=llvm` ("An attribute: interpreted in both backends, or refused in one" in [`../ksplc/docs/DESIGN-backends.md`](../ksplc/docs/DESIGN-backends.md)).

#### Things that look like duplication and are not

**Some pairs look like two ways of doing one thing, but each covers cases the other cannot, so both stay.** `std/thread.kspl` and `std/reactor.kspl` can both "handle many connections", and which to use is in `std/docs/DESIGN-core.md`. The four indexing traits are each needed (docs/SPEC-programming-language.md §6.1):

| Trait | The case only it serves | Example |
| :-- | :-- | :-- |
| `Index` | Elements with no address | `Range` / `sys.Args` |
| `Index_mut` | A write whose destination does not exist yet | A new key into a `Map` |
| `Index_place` | A body that becomes an lvalue (something that can be assigned to) | `List` |
| `Index_ref` | A read-only receiver, read with no copy | `Slice<\|T\|>` over immutable content |

**Two forms whose writable positions exclude each other are not two ways of writing one thing either.** Gathering them would leave a position where nothing can be written.

| Purpose | The two forms | The position where only one can be written |
| :-- | :-- | :-- |
| Typing an integer | The suffix `5I64` / the prefix cast `I64::5` | The suffix **checks the range** (`300U8` is an error); the cast is an instruction to **truncate** and does not check (`U8::300` passes). The requirements are opposite, so neither can be written with the other |
| An enum variant | Implicit `.some(x)` / type-qualified `T.some(x)` | The implicit form needs an expected type to descend (`y: = .some(1)` is refused with `cannot infer the enum type for an implicit variant`); there, only the type-qualified form can be written |

**Nor is a `const` inside a function.** It looks like an unmarked immutable binding (`n: Sz = 4;`). But only a `const`, fixed at compile time and holding no memory, can size an array (`I32$[n]`; the unmarked one is refused with `array size must be a positive constant expression`).

**A raw pointer's `null` remains in three places only.** Elsewhere, `T?` says whether a value is present, and lint [H0701] finds a raw pointer's `null` being returned. `T!E` is not the answer here: it says "it failed, and this is why", not "there is no value" (the "one way to convey failure" above).

| Where it remains | Reason |
| :-- | :-- |
| `std/mem` and `std/libc` | Memory and C speak in raw pointers: an allocation that fails is a null, and so is C's "none". The rest of `std` returns `T?`, as any package does. A list that can be empty is a value with methods, not a pointer to its first node. Examples are `http.Headers`, `url.Query` and a JSON array's `json.Array` |
| Functions carrying `#export` | The FFI boundary with C (where C code calls KSPL). `T?` is not ABI-compatible with C's null convention. That is, its memory layout differs from what C expects |
| Tree walking in `ksplc/base` (`find_child` / `unwrap_top_level` / generating notation) | The same reason, suppressed with its grounds in the file-opening `##lint(H0701 = off)` |

**Outside these three, no raw pointer's `null` is returned**: the repository requires zero diagnostics even at Hint level (`make lint`).

### A default argument is allowed only for a foldable constant

**The last parameters of a function can have a default, written `= literal` (such as `offset: Sz = 0`), and a caller can then leave them out** (docs/SPEC-programming-language.md §8.1.1). The default is one literal value, and some parameters (an arena) must never have one. A *foldable constant* is a value the compiler knows without running anything.

There are two grounds for allowing it.

* **Real demand**, meeting the "hundreds of places" of step 2. Most calls of `starts_with` in `std/chars` look at the start of the text, and they omit `offset` rather than write `0`. To recount, set the count of `grep -o "starts_with([^,()]*)"` against that of `grep -o "starts_with("` over the tracked sources.
* **Symmetry.** A struct literal can omit a field and get the type's zero. Suppose a parameter could not be omitted. Then the rules a writer remembers would grow from one ("a named slot can be omitted") to two ("a field can, a parameter cannot").

**It is not the same rule as omitting a field.** An omitted field gets the zero the type decides, while a default argument is the writer's choice. The difference is held to "one constant appears", so only a single literal is allowed. An expression would let allocation or side effects happen without appearing in how the call is written.

**"Is it a foldable constant" is the condition for entry, not the reason to enter.** The second test is whether the shorter call lies to the reader. `null` is a constant. But take an arena parameter with `= null`. Behind the shorter call, it would hide "omit it and it allocates on the global heap, and the caller owns the free". (An *arena* is a block of memory that many allocations share and that is freed all at once.)

**An arena parameter carries no default. Where an API supports heap allocation, a caller requests it explicitly with `null`.** Compare `List<|I32|>(null)` with `List<|I32|>(arena)`; `base64.encode(data, null)`, `fs.read_dir(path, null)` and `json.parse(text, null)` read the same way. Where the elements go, and whether a `free()` is owed, is then on the call's line. The other shapes are not taken:

| Shape not taken | Why not |
| :-- | :-- |
| **A second constructor for the heap** (`new_on_heap()` beside `new(arena)`) | `new(null)` stays writable, so the heap would have two spellings. A suffix on the arena's form instead (`new_in(arena)`) is the mark std's naming refuses. See "A constructor's name says where the returned thing goes" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md). And every constructor would come in pairs |
| **The arena on each growing call, the container holding none** (`xs.push(arena, x)`) | It would rule out handing the wrong arena to one call. But every `push` and `set` would carry it, and `free()` would need it back. A `List` keeps the one it was made with |
| **A default arena held per thread or per scope** | The call would again not show where it allocates, which is what this rule removes |

**An API can require a real arena.** Compound objects with shared storage need one lifetime; supporting heap fallback as well would add independent cleanup rules and ownership flags. Such constructors reject `null`, and callers release the arena after all views are finished. Allocation details belong behind constructors, with non-public fields preventing raw construction; plain data records can still use public literals. This changes library contracts without adding a second allocation spelling or removing low-level heap allocation.

**The linter holds it** (`[I0702]`): it reports a parameter whose type is an arena and that carries a default. It reads the type as the compiler resolved it, so an arena behind a typedef is found too.

**Where a default cannot be placed**, and why, is the table in docs/SPEC-programming-language.md §8.1.1. Each such place is rejected with a diagnostic (the cases `param_default_*` in `ksplc/tests/negative/fn.kspl`). A trait's declaration can carry one (the same section; `Index_place.at` in `std/lang` takes this form).

**Where defaults stand is not listed here.** A default is part of its declaration's spelling. So each package's `SURFACE.txt` holds the published ones. `ksplc doc --surface-scope=all <file>` shows every one a file reaches ("Writing out the published API" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). What the second test turned away is recorded, so the same discussion is not had twice:

* an arena (above);
* an environment's timing (`delay_us`);
* a grab tolerance (`drag_edge`'s `10.0`);
* a character to search for (`seek`'s `']'`);
* a person's name.

Each is a foldable constant, but the value left out is itself a judgment the caller must make.

**What is given up**: a call's text does not show how many arguments it passes, so the reader looks at the declaration.

### Why `import` and `#export` are not made a matched pair of words

**`import` and `#export` look like a pair, but act on different axes.** `import` is about which names your code can see. `#export` is about what name a function gets in the compiled output.

| Axis | One end | The other end |
| :-- | :-- | :-- |
| Naming: which names a file can see | Bringing a name in (`import`) | Hiding one (not writing `pub`) |
| Linking: which symbols the compiled output shares with other code | Emitting a symbol (`#export`) | Using an outside one (`extern "C"`) |

Two axes are not expressed with one pair of words; the list of axes is in [`SPEC-programming-language.md`](SPEC-programming-language.md), "9. Files and import".

**The only languages that pair the words are C++20 (`export module` / `import`) and Java's `module-info` (`exports` / `requires`), and in each the pair reaches past naming.** Java makes visibility the product of two declarations. C++'s modules give up the premise that a translation unit (one source file and what it includes) is compiled independently.

**The words do not change.** A keyword like Zig's `export fn` would make `#export` look as if it decided linkage too. Visibility decides that, and `#export` touches only the symbol's name. Nor is it renamed `#c_name`: on wasm32 the attribute also means "make it an export", so `c` would be a lie ([`SPEC-programming-language.md`](SPEC-programming-language.md), "11.3 Exposing a KSPL function to C (`#export`)").

**A combination that becomes ineffective across the axes is rejected**; which ones are is "11.3 Exposing a KSPL function to C (`#export`)" in [`SPEC-programming-language.md`](SPEC-programming-language.md). On a method the cause is the name's uniqueness, not visibility. Symbols share one namespace across every link target. So only a name unique on its own can go out bare.

**This is a language rule, not a lint.** A lint runs only when someone runs it, and only over the files it is given. So the same notation in another file would be accepted. Like the other spellings that bring nothing about, it carries no diagnostic code ("1. Diagnostic codes, and the errors that have none" in [`../ksplc/docs/SPEC-diagnostics.md`](../ksplc/docs/SPEC-diagnostics.md)).

### Every item in a declaration block ends with `;`

Inside `{ … }`, every field and every enum value ends with `;`, the last one too. A `,` there is an error.

```ksplb
enum Color {
    red;
    green;
}

struct Point {
    x: I32;
    y: I32;
}
```

**Declarations lined up inside `{ … }`, a `struct`'s fields and an `enum`'s values alike, end with `;`, the last one too.** So a block has exactly one mark that says "end". The rule is "2.5 Blocks and statement ends" in [`SPEC-programming-language.md`](SPEC-programming-language.md).

**`,` keeps its own job.** `;` ends a declaration, and `,` separates the items of a list within one notation. So the rule allowing a trailing `,` ("2.4 Trailing commas" in [`SPEC-programming-language.md`](SPEC-programming-language.md)) applies only to lists.

**The C family's shape is not taken.** There, `,` separates names inside an `enum` that is one whole declaration closed by `;`. KSPL's `enum` sits at the same level as `struct`, with no closing `;`, so that footing is absent. A list mark inside a block would make the mark that says "end" vary from block to block.

**The formatter never keeps two on one line** (`enum E { a; b; }` is always split), so a value's `,` has no job of separating within a line either.

**The rejection of a `,` there carries a Note stating the rule.** The expected set alone (`expected …, or ';'`) does not read as "it is `;`, not `,`" (`forbidden_spelling_hint` in [`../ksplc/parse/syntax_msg.kspl`](../ksplc/parse/syntax_msg.kspl)).

## Models write it, and AI runs in it

**This chapter decides two things.** A model writes, reads and checks KSPL ("A model writes it, and the compiler judges it"). And AI runs in KSPL ("AI runs in it"). The grounds are the same for both: only what is written happens, so neither a model nor a microcontroller has to guess.

### A model writes it, and the compiler judges it

| Property | What it gives a model |
| :-- | :-- |
| **A function can be judged from its text.** Nothing is allocated implicitly, and no failure is missing from a type (`T!E`, `T?`) | A model reviewing or generating code needs no knowledge of hidden run-time behaviour |
| **Generated code converges on one spelling.** One means per purpose (Principle 6) and one formatter (`ksplc fmt`) | No equivalent spellings to drift between |
| **The verdict is mechanical.** Not one warning is let stand (Principle 2). A warning, an information or a hint carries a code that `ksplc explain <code>` expands on request. An error says in its own message what to write instead | A generated completion is judged by whether `ksplc` accepts it, not by opinion |
| **An agent reads the verdict as fields.** `--diagnostic-format=json` writes each diagnostic as one JSON object per line, with its code, place and message apart ("2.11 Diagnostics a program reads" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)) | No reworded message breaks the reader |
| **What a model reads stays true.** The API pages and records are generated from the source and held to it by checks | The rules for a reader that is a model are in "The reader can be a model" in [`DESIGN-repository.md`](DESIGN-repository.md) |

### AI runs in it

* **The engine is KSPL alone** ([`ksai/`](../ksai/README.md)), with no second language beneath the model. That covers tensors, inference, training and LoRA (a cheap way to fine-tune a model). It also covers the tokenizer and safetensors (a file format for weights).
* **The same code runs from a microcontroller to a server.** On bare metal (with no operating system), it takes its weights through `embed` and needs no heap. On a server, one flag sends the matrix product to OpenBLAS.
* **The model, its tooling and the checking are one language.** So a kernel, the program calling it, and the compiler judging a generated program share one debugger and one set of rules.

### What it costs

* **KSPL is in no model's training**, so every session pays context to read what KSPL leaves out ("The reader can be a model" in [`DESIGN-repository.md`](DESIGN-repository.md)).
* **The engine runs on the CPU alone.** Each layer's backward pass is written by hand ([`ksai/docs/DESIGN-learning.md`](../ksai/docs/DESIGN-learning.md)). The backward pass is the step of training that computes how to change the weights.
