# The principles behind Kanso's design

**This document says why Kanso is built the way it is, across every part of it.** It holds the eight Development Principles that every change answers to. It says why each purpose has one notation, and what the whole is for. The reasons behind the language are in [`DESIGN-programming-language.md`](DESIGN-programming-language.md). How the documents, packages and gates are arranged is in [`DESIGN-repository.md`](DESIGN-repository.md). What belongs to one folder stands in that folder, such as [`ksplc/docs/DESIGN-compiler.md`](../ksplc/docs/DESIGN-compiler.md) and [`std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md).

## How to read this document

Start with the eight Development Principles. The design documents apply them one subject at a time, one decision per section.

* **Each section opens with the decision in plain words**, then gives the details, the reasons, and what the decision gives up.
* **This document holds only KSPL's decisions and their grounds**, not a survey of other languages. History is not written here (Principle 7).
* **The headings carry no numbers.** A section is cited by its heading's words, since a number shifts whenever a section is inserted above it.
* **New to KSPL?** The two tables below give the notation and the words the chapters assume. The tour is [`TUTORIAL-programming-language.md`](TUTORIAL-programming-language.md).

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

Eight rules come first in every folder: in the language, the libraries, the tools and the documents alike. The table states each rule in one line. The numbered list after it says why each holds and how to apply it. Other documents cite the list's numbers ("Principle 5").

| # | Principle | In plain words | For example | How it is checked |
| :-- | :-- | :-- | :-- | :-- |
| 1 | The Zen of Subtraction | Take a feature on only if its benefit outweighs all it costs, and remove one that stops paying its way | `Callable3` is not added, since `std/seq` needs no more than two arguments | By review |
| 2 | Warning Zero | The build prints no warning, from `ksplc` or from the C compiler | A C `char*` is received as `Void@`, since `U8@` makes the C compiler warn | `make lint`, which passes only at zero, and `make test-c-warnings` |
| 3 | Keeping file size down and even | Keep files and functions short: split a file where its parts are read for different reasons, and merge a small file into its only user | Files and functions have size limits | `make test-conventions` for a file, `make lint` (H0803) for a function |
| 4 | Following DRY — one canonical source, copies tied together by a check | Keep each fact in one place. Where a copy must exist, a check compares it with the original | A runtime helper in C and its LLVM counterpart are compared by `make test-conventions` | The check added with each copy, most of them in `make test-conventions` |
| 5 | Do not leave anything "writable but ineffective" | Whatever the compiler or a tool accepts must have an effect; otherwise it is an error | `defer` has no capture list, since one would change nothing ("Why `defer` has no capture list" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | By review; each check's own samples show that the check can fire |
| 6 | One means to one purpose | Offer one way to write each thing | No number casts to `Bool`, since `x != 0` already says it | By review |
| 7 | Documents and comments state only "how it is now", in plain language | Write the present state and its reasons, never the history, in the short, plain sentences of [`SPEC-plain-language.md`](SPEC-plain-language.md) | This document says "X is", never "X used to be" | `make lint` for a comment's length (H0806); `make test-conventions` for a document sentence's length and phrases that tell a history; `tools/repo_stat.kspl` measures the share of comments; the rest by review |
| 8 | A check that can only be half kept is not made a guarantee | If ordinary code can slip past a check, do not let the check pose as a guarantee | There is no thread-safety marker, since a global variable bypasses it ("Why data races are not prevented by the type system" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) | By review |

1. **The Zen of Subtraction**

   **A feature costs more than the code it takes**: it is implemented, checked, documented and kept compatible, and every reader meets it. This holds for the language, a library's API and a tool's options alike.

   * **Name the price before adding.** "It would be handy" names no price, so it is no reason to add.
   * **Take the feature on only if its benefit is larger.** Ask whether the cost is paid once or on every change, and whether whoever pays is whoever benefits.
   * **Do not pay for input that does not occur in practice**, such as absurd nesting depths. A wrong answer is another matter: it is fixed whatever the input (Principle 5).
   * **Remove a feature that has stopped paying its way**, even one already built. Show its replacement, or make the old notation an error; leaving it accepted but doing nothing breaks Principle 5.

2. **Warning Zero**

   **A warning that stays hides the next one.** So `ksplc` prints none, and neither do `clang` and `gcc` when they build the generated C. Fix a warning before moving on to the next piece of work.

3. **Keeping file size down and even**

   **A reader holds one file in mind at a time.** Mistakes hide in a file too long to hold, and a file too short to stand alone sends the reader elsewhere. The limits are in "Principle 3 - what is counted, and how" in [`SPEC-gates.md`](SPEC-gates.md).

   * **Split where the parts are read for different reasons**, not at a line count ("Choosing where to split a file" below).
   * **Plan the split before the limit is reached**, or it lands inside an unrelated change. Write down where the file will split ("Where a file's splitting plan is written" in [`SPEC-documents.md`](SPEC-documents.md)).
   * **Merge a small file into its only user**, unless it has a reason to stand alone ("When a small file stands alone" below).
   * What `make test-conventions` counts, and its exceptions, are "What the convention checks count" in [`SPEC-gates.md`](SPEC-gates.md).

4. **Following DRY — one canonical source, copies tied together by a check**

   **Two copies of one fact drift apart**: a fix reaches one copy, and whoever made it cannot see the other. So each fact, whether data, a computation or a field, lives in its canonical source. DRY stands for "don't repeat yourself".

   * **Before adding, look for what already holds the fact.**
   * **Where a copy cannot be avoided, add the check that compares it with the original, in the same commit.** Make the check's failure name the file to fix.
   * Principle 6 is the same idea applied to the ways a thing is written.

5. **Do not leave anything "writable but ineffective"**

   **What is accepted but does nothing hides a bug**: its writer believes it took effect, so nobody looks there. This covers grammar, attributes, modifiers, a tool's options and configuration keys, and a library's arguments.

   * **Give it an effect, or refuse it with an error.** Never accept it and ignore it.
   * **A check is something written too.** A check that can never fail stays green while the rule is broken, so each check shows that it can fire. How is "Showing that a check can fire" in [`tests/docs/HOWTO-write-a-suite.md`](../tests/docs/HOWTO-write-a-suite.md). For diagnostics, it is "The pass/fail verdict is checked apart from each diagnostic" in [`ksplc/docs/DESIGN-diagnostics.md`](../ksplc/docs/DESIGN-diagnostics.md).

6. **One means to one purpose**

   **With two ways to write one thing, nobody can tell which is canonical**, and a fix made to one leaves the two different. This covers an alias for an option, two API names for one operation, and two notations with one meaning. Before adding a means, confirm that no existing one serves.

7. **Documents and comments state only "how it is now"**

   **A reader acts on what the text says**: where it tells a history, they have to work out which part still holds. This covers comments, READMEs, DESIGN and SPEC documents alike. History belongs in git commit messages.

   * **Write in plain language** ([`SPEC-plain-language.md`](SPEC-plain-language.md)), in documents, comments, diagnostic messages and reports alike. A text is read many more times than it is written. Many readers do not have its language as their first one, and a model reads each word as it stands.
   * **Keep general writing rules independent of their field.** The plain-language specification keeps its core and English rules apart from its software and Kanso chapters, so another field can replace the local ones.
   * **Write** the decided facts and their reasons, and what breaks if the thing is changed. Write the traps the next person is likely to hit ("A trap is written as why it is dangerous" in [`SPEC-documents.md`](SPEC-documents.md)). Write the contract seen from outside.
   * **Do not write how it came to be**: no work log, investigation, rejected proposal, fixed bug, date, or experience told in the past tense.
   * **An absence is a present fact.** Where leaving something out is the decision, write what is absent and why, so the same proposal does not come back ("Notations not carried" below).
   * **Do not write a figure that changes while nobody touches the repository**, such as a measured time. Write the relation and the order of magnitude, and point at how to measure it again.
   * **Keep each comment short.** "Comment notation and limits" in [`SPEC-plain-language.md`](SPEC-plain-language.md) sets the limits; longer background belongs in a design document.
   * **The comment-share limit applies to the repository, rather than each file.** Room under the limit is no reason to write more.

8. **A check that can only be half kept is not made a guarantee**

   **A check that ordinary code slips past is trusted more than it deserves.** A program passes it and still breaks, and its writer trusts it the more for having passed.

   * **Before forbidding something, confirm that no ordinary way of writing slips past the check.** Where one does, the type system does not state the rule.
     * Failure (`T!E`), absence (`Option`) and being uninitialized cannot be slipped past, so the type system states them.
     * Lifetime and sharing can be, through raw pointers and top-level variables, so the type system leaves them out. See the chapters "Ownership and lifetime" and "Concurrency" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md).
   * **What the type system does not state, the type's name does.** `Rc` (one thread), `Arc` (shareable), `Mutex<|T|>`, `Atomic_sz` and `Move_only` make misuse visible instead of stopping it.
   * **A check that sees only some forms says so.** The convention checks read literal text, so their rules state that a form escaping the check is still a violation.

### Choosing where to split a file

**Put the cut where the fewest names have to cross it.** Among the cuts that Principle 3 allows, this one leaves each file readable on its own. A package's limits, and the plan for each of its files near the cap, are in its README. Below, `priv` marks a name visible only inside its own file.

**First count what would cross**: the names each side needs from the other, by call sites. A part that touches none of the other part's state moves out cleanly. So does one that reads only a value fixed before the work starts. `ksplc/fmt/space.kspl` touches no part of `Formatter`, and `ksplc/fmt/style.kspl` takes only `Config`.

**Then place what the two parts share**:

| What | Where it goes | Why |
| :-- | :-- | :-- |
| The types the moved state holds | With the state | Left behind, they make the two files import each other (`ksplc/sema/session/state.kspl` holds `Generic_arg` beside the state structs) |
| What both parts read | The lower file, opened from `priv` | Moved up, it makes the lower file import the file that imports it |
| A name only the moved part calls | The moved part, still `priv` | A name opened from `priv` is open to the whole package |
| Some of an `impl`'s methods | A second `impl` of the same type, in the new file | "9.3 Adding a method to another file's type" in [`SPEC-programming-language.md`](SPEC-programming-language.md) allows it, as `ksplc/base/ast_place.kspl` does for `Ast_node`. `make lint` names a missing import |

**Three cases need care**:

* **Two parts that call each other** can import each other inside one folder, as `ksplc/gen/c/expr.kspl` and `ksplc/gen/c/expr_postfix.kspl` do. Neither file can then be read alone.
  * Caution: **Where a package keeps its imports running one way, an `impl` the original calls back cannot move alone.** Move the state it touches with it.
* **A reader of text is not split by word order.** Two forms that put a name before or after a document are one reading, and kept apart, a fix to one leaves the other behind.
* **Part of a test suite goes to a support file, not to a suite of its own.** Each suite starts its own copy of whatever it drives, such as a language server. Keep the part together by its fixture, not by its entry point.

**After a cut, fix the documents that name what moved.** `make test-docref` fails even when only a call moved.

**What this gives up**: one file can end well under the cap and the other near it. The line count is not the goal.

### When a small file stands alone

**A short file that only one other file uses joins that file, unless it has a reason to stand alone.** To understand either, a reader opens both, so the two are one part kept in two places. Small files that exist because a rule demanded them, not a reader, are what this avoids: a class per file, or an empty package marker.

**A file stands alone for one of four reasons**:

| Reason | What it covers |
| :-- | :-- |
| **A tool needs it whole** | It has a `main` of its own, or it is a fixture that compiles only where it stands, or an asset. A fixture that is a complete program elsewhere too is a case in its subject's file ("How a case is compiled" in [`ksplc/docs/HOWTO-add-a-fixture.md`](../ksplc/docs/HOWTO-add-a-fixture.md)) |
| **Another reader imports it** | Something needs it without the rest, such as a lower layer, or a driver offered to any program |
| **It is a boundary** | `priv` stops at the file, so the file keeps its insides out of reach |
| **It changes for another reason** | A platform, a piece of hardware, a bring-up stage, or a cut made because the file it came from neared the cap |

**"Short" is 60 lines or fewer**, about one screen. Two kinds of import are not a use: a link-only import (an `_` alias), and a package's test entry point (`all.kspl`).

**What it gives up**: a file with one user today and several tomorrow is merged and later split out again. A merge is cheap to undo.

## One notation per purpose

**If the same thing can be written two ways, one of them is withdrawn.** A *notation* is a way of spelling something in the source. With one notation per purpose, everyone writes the same source for the same job.

A notation is judged by three questions, in this order. *Sugar* means a short spelling that the compiler expands into a longer form you could also write by hand.

1. **Do the meanings coincide exactly?** If either can always be written with the other, one is unnecessary.
2. **Is it sugar?** The sugar must give more than brevity. Used in hundreds of places, it meets a real demand for readability. Used in a handful, it is withdrawn.
3. **Count actual use.** A notation the grammar accepts and nobody uses is a liability.

**Sometimes both stay**: where each form has hundreds of real uses, and removing one would cost expressiveness or readability. Three pairs stay: compound assignment (`x += y` beside `x = x + y`), the block and expression forms of `catch`, and the named and positional forms of a struct literal.

**A pair kept for a transition goes when the transition ends.** A static `new` has one spelling, the type call `T(...)` ("A type call selects its existing constructor" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)).

**Symmetry does not save a form nobody uses.** **A declaration names one variable, and a loop's header holds one init and one step.** The short forms (`a: I32 = 1, b: I32 = 2;`, or several inits and steps in a C-style loop) would each repeat what two declarations write. Withdrawing only one would make the two halves of a loop differ, so neither is carried.

**What is given up: the code does not get shorter.** In return, only what is written happens. The extra lines have three sources.

| # | Where the extra lines come from | What it is |
| :-- | :-- | :-- |
| 1 | **Lines that hold only a closing brace** | The indentation notation (the chapter "The indentation notation (`.kspl`)" in [`DESIGN-notation.md`](DESIGN-notation.md)) removes exactly those |
| 2 | **Code that says who owns what** | The price of not hiding which code frees which memory. It stays |
| 3 | **Functions `std/` lacks that would do a whole errand in one call** | Not a price but a gap ("Known holes, and what would fill them" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md)) |

Note: **A function doing a whole errand barely reduces the line count.** With a JSON round-trip function, `tests/tools/perf_guard.kspl` has as many code lines as without one. It removes key names spelled twice, not lines (the `json_struct` rows of "Known problems KSPL handles" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md)).

### Notations not carried

What KSPL leaves out, and what to write instead, is "Appendix A: Features not carried, and what to write instead" in [`SPEC-programming-language.md`](SPEC-programming-language.md). This section holds why, so that the same proposal does not come round again.

**The test is not whether a feature is sugar.** KSPL desugars plenty: `!`, `catch`'s expression form, string interpolation, operator overloading, closures. What is turned away gives a second notation to something already writable, or adds implicit behavior.

| Not carried | Why |
| :-- | :-- |
| **try-finally** | Each resource nests a level deeper. `defer` gives `finally`'s guarantee on every way out |
| **Automatic cleanup** | Every cleanup stands in the source, where a reader sees when it runs. `defer` in front of a declaration costs one word. Shared ownership opts into `Ref_counted` |
| **Garbage collection** | When something is freed can be read from the source |
| **A cleanup joined behind its declaration** | It would fill in a receiver, as no other construct does. See "A declaration takes `defer` in front, and only to free" below |
| **Class inheritance** | It keeps the memory layout simple |
| **Named actual arguments** | One call would have two spellings (`f(0)` and `f(offset = 0)`), and **parameter names would become published API**. A function-pointer type and its definition could disagree on them |
| **Function overloading** | No tracing which of several same-named candidates is called |
| **A distinct type made from another**, and other spellings of a type's other name | `typedef` stays a name, as in C. A type kept apart is declared as one. See "The spelling of reserved words is taken from C" in [`DESIGN-notation.md`](DESIGN-notation.md) |
| **`?` for a result** | `!` marks where a function can hand a failure back, and `?` marks absence ("Failure" below) |
| **The abbreviated error type `T!`** | It would be a second spelling of one type |
| **Several variables in one declaration, and several inits or steps in a loop's header** | See "Symmetry does not save a form nobody uses" above |
| **The type's name in a `case`** | The subject already fixes the type, so `case Event.quit` would repeat `case .quit` |
| **Another language's word for a loop or a branch** | One word for each job, spelled as C spells it ("The spelling of reserved words is taken from C" in [`DESIGN-notation.md`](DESIGN-notation.md)) |
| **`::` as a path separator** | A member would have two spellings, and `json::Value` would read like the cast `Sz::n` ("Why `::` stays the cast, and what it costs to parse" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) |
| **Range syntax (`a..b`)** | A call already writes it, and `Range.new`'s argument names show whether a bound is exclusive |
| **A rename inside an import's braces** | The name would have a spelling of its own in one file. The file's alias (`import "p" as q`) already renames, and keeps the origin visible |
| **`a[i..j]` for cutting out a slice** | A method already cuts any element type |
| **Tuples** | Each returned value gets a name, so the contents can be read |
| **A named local function** | A closure's environment rides on the caller's frame, so it cannot be named and reused from several functions |
| **A closure that can be taken outside its function** | Its captures live on the frame that built it ("Why capture is made explicit and escape is forbidden" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)). An ordinary struct makes the lifetime the writer's |
| **A trailing closure** | One call would have two spellings. After `if xs.any()`, it could not be told from the `if`'s body ("Why a closure is not written after the call" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)) |
| **A static variable inside a function** | State persisting across calls lines up at the head of the file, where what touches it can be seen |
| **`guard let`, `?.` and `??`** | `catch { … }` and `unwrap_or(v)` already write the first two, and `?.` would end a chain with no mark where it stops. See "Unwrapping an `Option`" below |
| **A separate prefixed string form for formatting** | An ordinary string literal already formats in place |
| **Block comments `/* */`** | `//` already writes every comment |
| **A documentation comment in front of what it documents**, or inside it | A description sits on what it describes ("The documentation a declaration carries" in [`DESIGN-notation.md`](DESIGN-notation.md)) |
| **Escapes outside the ten** | "Escapes are closed at ten" below |
| **A built-in `Char` type** | "There is no `Char` type" below |
| **A multi-byte character literal** | "There is no `Char` type" below |
| **An octal literal**, and a decimal integer that starts with `0` | "A decimal integer does not start with 0" below |
| **Link flags in the source** | A flag forces one machine's link line on every machine, and can run code at build time. See "The library an `extern` block needs is named on the block" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md) |
| **A postfix `if` / a conditional `break`** | The action before its condition runs against reading top to bottom |
| **A deprecation mark** | A feature that stops paying its way is removed outright (Principle 1). A period of warnings would keep two ways alive |

**Withdrawing a notation removes it from every place the source is read**: the grammar, and the compiler's own code that skips whitespace and comments. Otherwise a refused form would pass silently through the other ("Every place a source enters reads it the same way" in [`../ksplc/docs/DESIGN-parse.md`](../ksplc/docs/DESIGN-parse.md)).

#### Escapes are closed at ten

**Only ten escapes can follow a `\` in a literal; any other, such as C's `\b`, is an error, not a plain `b`** ("2.3.2 Escape sequences" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). Reading an unknown one as the character itself would give one byte two spellings (Principle 6). And a `'\b'` copied from C, the backspace, would silently become `'b'` (Principle 5). The rejection stands in one place (`is_known_escape` in `ksplc/base/literal.kspl`).

**`\{` and `\}` are among the ten because interpolation is written `\{` … `\}`**, as in `"n=\{n\}"`. So a bare `{` stands as it is, with no doubling (`{{`). `'\{'` is the matching form in a character literal.

**`\uXXXX` takes exactly four hex digits** ("2.3.3 Writing a code point with `\uXXXX`" in [`SPEC-programming-language.md`](SPEC-programming-language.md)). A greedy `\x` changes meaning when another hex digit follows, so KSPL has no hex escape. A braced `\u{0041}` would be confusable with interpolation's `\{`.

**Nothing above U+FFFF and no surrogate is written with `\u`.** A surrogate half is UTF-16's, and in UTF-8 it is only an invalid byte sequence. Such a character is written directly into the UTF-8 source.

**`\u` is expanded only where a literal's bytes are decided, never before lexing.** So comments and raw strings pass through untouched, and a `\u000A` inside a comment cannot break the file.

#### There is no `Char` type

**A character literal such as `'a'` holds exactly one byte (`U8`).** If accepted, `'あ'` (three bytes) would silently give its first byte, while the same character written with `\u` is rejected. One rule judges both forms (`literal_fault` in `ksplc/base/literal.kspl`).

**There is no `Char` type because it would carry exactly one job**: printing as a character in interpolation. One byte has two readings, as a number and as a character, and the line between them belongs to how it is printed. Split by type, it breaks: pass a `Char` once through a `U8` parameter, and `A` prints as `65`. `\{b:c\}` puts the line where the value is printed (Principles 1 and 6).

**Only `U8` carries `fmt_char`** (`std/strfmt.kspl`), so `:c` on another type is refused (docs/SPEC-programming-language.md §3.6.2). `c` takes no width, padding or separators, since one character has nothing for them to apply to (`char_alone` in `ksplc/parse/format_spec.kspl`).

**A character type can return, but not as eight bits.** It would be a text type that guarantees valid UTF-8 and gives a code point per step. Its name is undecided; `Char` is not the leading candidate.

**No word is reserved for it.** A reservation works only once the name is decided, which is the design of the type. A word reserved later costs a compile error at the declaration, fixed by one rename. If one is reserved anyway, reserve it in sema's name check, not in the grammar, whose error would not say why.

#### A declaration takes `defer` in front, and only to free

A value freed when its block ends is declared with `defer` in front: `defer $buf: = List<|I32|>(null)`. It means the declaration followed by `defer buf.free()`. Any other cleanup is a `defer` statement of its own, on the next line.

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

**The call goes through the trait `Manual_free`, matched by its full name.** A method merely named `free` does not count, so the word in front always means the same call. A type with nothing to free is refused at the declaration.

**One way stays canonical.** `defer x.free()` on the line after the declaration draws a hint ([H0303]) asking for the form in front. The two-line form stays for every other cleanup (`unlock`, a child's `wait`, an arena's `restore`).

**The form behind the declaration, `buf: = … defer .free()`, stays out.**

| Cost of the form behind | How the form in front avoids it |
| :-- | :-- |
| **It would carry on behind a closed level.** Under a `catch` block, a `defer .free()` back at the declaration's column would need an exception in the indentation reader | It starts the line, so a `catch` block under the declaration closes as usual ("How a column is read" in [`DESIGN-notation.md`](DESIGN-notation.md)) |
| **It fills in a receiver.** Elsewhere a leading `.` names an enum value (`.ok`) | Nothing is filled in. The name is the declared one, and the call is the trait's |
| **It is written nowhere else** | It has the shape of a declaration that frees what it binds, which a model reads at sight |

**Nothing can come between an acquisition and its cleanup in the form in front.** A value declared with `defer` is freed when its block ends, so handing it over is refused. Declare it without `defer` to return or store it.

**What holds it**: a `defer` behind a statement is refused, and for a `.free()` the message gives the form in front (`append_trailing_defer_hint` in [`../ksplc/parse/syntax_msg.kspl`](../ksplc/parse/syntax_msg.kspl)). A lone `defer .free()` is refused by name (`reject_receiverless_cleanup` in [`../ksplc/sema/body/stmt.kspl`](../ksplc/sema/body/stmt.kspl)).

#### A decimal integer does not start with 0

**`0755` is a syntax error: a leading `0` on a decimal integer is not a decimal digit and not an octal mark.** Write `0x1ed` for a bit pattern, or `755` for the decimal number ("2.3 Literals" in [`SPEC-programming-language.md`](SPEC-programming-language.md)).

C, C++ and Java read `0755` as octal (493), while Rust and Swift read it as decimal. Whichever reading KSPL took, a writer from the other half would get a different number with no diagnostic. A file mode is the usual case, and a model trained on C writes it that way too. Refusing it, as Python 3 does, leaves no one with a silent wrong value. Octal is not carried, because hexadecimal already writes bit patterns (Principle 6). The grammar refuses the spelling (`Integer` in `ksplc/kspl.kspeg`), and the error's note names both readings.

### One mechanism per purpose

**Not only spellings but whole mechanisms are kept to one per purpose**: one loop form over a collection, one way to report failure. With two, the reader must work out which convention a place follows. Record the form not carried as well as where it was gathered.

**Each gathering is recorded with how a departure from it is noticed.** (A *lint* is a check that `ksplc lint` runs; codes like [I0310] name one.)

| Purpose | Where it was gathered | How a departure is noticed |
| :-- | :-- | :-- |
| Importing a file | `as` only to rename; unmarked when the name stays | lint [I0310] |
| Iterating n times | `for x in Range.asc(n)`, or `for x in xs` where the index only reads the element; a C-style loop only when the body changes the index or the bound | lint [I0314], silent where it cannot tell |
| Heap allocation | `alloc_as<\|T\|>()` / `arena.alloc_as<\|T\|>()` / `heap_alloc_as<\|T\|>()`; `alloc(<byte count>)` for raw bytes only | `alloc_as` in `std/mem.kspl` |
| Boolean conjunction and disjunction | `&&` / `\|\|`; `&` / `\|` when both sides must be evaluated. `*` / `+` over `_Bool` are rejected | `make test-negative` and `ksplc/tests/lang_limits_test.kspl` |

#### Iteration

**Every loop over a sequence is written `for x in xs`.** The type of `xs` decides whether the compiler expands it by index or through `std/lang`'s `Iter<|T|>` (docs/SPEC-programming-language.md, 7.2). No form drives an iterator by hand. `Iter` has only `next`, since a separate "is there more" method could be called alone.

**`Iter` wins on a type that satisfies both** (docs/SPEC-programming-language.md, 7.2). Indexing matches by shape, while `Iter` is declared on purpose, and a structural match must not silently disable it (Principle 5).

**Which `std` APIs are eager and which lazy is `std`'s design** ("Iteration has one notation" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md)). Do not add terminals, the methods that consume a chain and return one value: `for x in` already counts, folds and searches.

**Nothing is eager because closures cannot be held.** A struct holding a predicate lives while the chain is built and consumed in the caller's frame. What cannot be written is a function returning a closure ("Which pointers into a frame are stopped from leaving it" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)).

**The lazy chain rests on four properties of the language**: the `Iter` above, and three that let it be written as method calls.

* **A method can return its own type one level deeper** (`Seq<|S|>.where(): Seq<|Wh<|S|>|>`).
* **A method can introduce a new type argument** (`fn select<|U|>`), bound at the call site (["A type argument with nothing to bind to is rejected" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)](DESIGN-programming-language.md#a-type-argument-with-nothing-to-bind-to-is-rejected)).
* **A closure literal passed directly still fixes the type argument**, taken from the `Callable1` its environment declares (`implemented_trait_instance` in `ksplc/sema/type/env.kspl`).

**The stage types nest, and every stage repeats `where` / `select` / `to_list`.** Why default method bodies cannot fold this is std's design: ["Why the chain's stages cannot be folded"](../std/docs/DESIGN-core.md#why-the-chains-stages-cannot-be-folded) in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md).

#### Failure

**There is one way to convey failure, `T!E`** (a `T`, or an error `E`). `std/io.kspl` uses `!Io_error` and `std/fs.kspl` uses `!Fs_error`, with no `Option` or `Bool` mixed in for failure. `exists` / `is_dir` stay `Bool`: "does not exist" is an answer, not a failure.

**A result is marked with `!`, in its type (`T!E`) and where its failure is passed on (`f()!`), and `?` marks nothing.** `!` marks a place where the function can stop and hand a failure back. `?` means absence, as Swift, Kotlin and C# spell an optional value ("`T?` is sugar for `Option<|T|>`" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md)).

* **Two rules make it parse without ambiguity.** A postfix `!` is read only where no `=` follows it, so `a!=b` compares. A `!` at a line's end ends the statement, and one at a line's start continues the line before.
* **What is given up**: elsewhere `x!` reads as "assume it is present", and Rust's `?`, which means what KSPL's `!` does, is not shared.

**A result is an ordinary value**: `T!E` is `std/lang`'s enum `Result<|T, E|>`, as `T?` is `Option<|T|>`. The rules are "8.3 Error handling" in [`SPEC-programming-language.md`](SPEC-programming-language.md). Why, and why a result nobody takes apart is a compile error, is "`T!E` is sugar for `Result<|T, E|>`" in [`DESIGN-programming-language.md`](DESIGN-programming-language.md).

#### Unwrapping an `Option`

**There is one `if` for using the value inside an `Option`, `if name: = expression`; inside the block, `name` holds the value.** The form that declares a name in the condition with `;` (`if v: = X; v == .some`) is not carried. It binds the `Option` itself, so most uses would need another line to unwrap it. And the `v == .some` checked would not carry into the block, which is writable and ineffective (Principle 5). Scoping alone does not justify it: shadowing is rejected (lint [I0501]), and a bare block already scopes. Chaining while keeping the contents bound is the `,` form's job.

**`catch { … }` takes an `Option`'s value or leaves, as it takes a result's.** Without it, each use would need a `switch` of about six lines. On an optional, the block must leave in every position:

* **The name is always bound after the `catch`.**
* **A block that gave a value would repeat `unwrap_or(v)`.** So `fallback` and `opt catch v` are refused, and the note writes `unwrap_or` (Principle 6).
* **`.none` carries nothing, so the block names nothing.** A result's block can give a value, because its error can decide it.

#### Translation-time conditions

**`#cfg(flag)` leaves a declaration out of the build, and `##error` stops the build. They stay two tools, and `#cfg` stays the weaker one on purpose.** (*Translation time* is while the compiler runs.)

| | `#cfg(flag)` | `##error` |
| :-- | :-- | :-- |
| What it does | Drops a declaration | Emits a diagnostic |
| What it takes | One flag name, with no comparison and no `&&` (docs/SPEC-programming-language.md §10.1) | A foldable expression (`sizeof(Sz) == 8`) |
| If the condition is misread | The declaration vanishes, with no message | A diagnostic appears |
| When it runs | Before declarations are gathered (`ksplc/parse/normalize.kspl`), with no names or types resolved | After types are attached (`ksplc/sema/body/infer.kspl`) |

* **A mistake shows in opposite ways.** A rich condition on the silent one would erase the clue to the mistake.
* **They run at different stages.** A comparison in `#cfg` would need arithmetic apart from the language, at a stage with no types: the C preprocessor's shape.

**A translation-time condition has no warning form.** A warning that stays would hide the next one (Principle 2).

**An attribute is either interpreted by both backends or explicitly rejected by one.** None is silently ignored under `--to=llvm` ("An attribute: interpreted in both backends, or refused in one" in [`../ksplc/docs/DESIGN-backends.md`](../ksplc/docs/DESIGN-backends.md)).

#### Things that look like duplication and are not

**Some pairs look like two ways of doing one thing, but each covers cases the other cannot, so both stay.** `std/thread.kspl` and `std/reactor.kspl` both handle many connections; which to use is in `std/docs/DESIGN-core.md`. The four indexing traits are each needed (docs/SPEC-programming-language.md §6.1):

| Trait | The case only it serves | Example |
| :-- | :-- | :-- |
| `Index` | Elements with no address | `Range` / `sys.Args` |
| `Index_mut` | A write whose destination does not exist yet | A new key into a `Map` |
| `Index_place` | A body that becomes an lvalue | `List` |
| `Index_ref` | A read-only receiver, read with no copy | `Slice<\|T\|>` over immutable content |

**Two forms whose writable positions exclude each other are not two ways of writing one thing either.**

| Purpose | The two forms | The position where only one can be written |
| :-- | :-- | :-- |
| Typing an integer | The suffix `5I64` / the prefix cast `I64::5` | The suffix **checks the range** (`300U8` is an error); the cast **truncates** (`U8::300` passes) |
| An enum variant | Implicit `.some(x)` / type-qualified `T.some(x)` | With no expected type (`y: = .some(1)` is refused), only the qualified form can be written |

**Nor is a `const` inside a function.** Only a `const`, fixed at compile time and holding no memory, can size an array (`I32$[n]`).

**A raw pointer's `null` remains in three places only.** Elsewhere `T?` says whether a value is present, and lint [H0701] finds a raw pointer's `null` being returned. `T!E` is not the answer here: it says "it failed", not "there is no value".

| Where it remains | Reason |
| :-- | :-- |
| `std/mem` and `std/libc` | Memory and C speak in raw pointers: a failed allocation and C's "none" are a null. The rest of `std` returns `T?` |
| Functions carrying `#export` | At the C boundary, `T?` does not match C's null convention in memory |
| Tree walking in `ksplc/base` (`find_child` / `unwrap_top_level` / generating notation) | The same reason, suppressed with its grounds in the file-opening `##lint(H0701 = off)` |

### A default argument is allowed only for a foldable constant

**The last parameters of a function can have a default, written `= literal` (such as `offset: Sz = 0`), and a caller can then leave them out** (docs/SPEC-programming-language.md §8.1.1). A *foldable constant* is a value the compiler knows without running anything.

* **Real demand.** Most calls of `starts_with` in `std/chars` look at the start of the text. To recount, compare `grep -o "starts_with([^,()]*)"` with `grep -o "starts_with("` over the tracked sources.
* **Symmetry.** A struct literal can omit a field. Otherwise a writer would remember two rules: a field can be omitted, a parameter cannot.

**Only a single literal is allowed.** An omitted field gets the type's zero, while a default is the writer's choice. An expression would let allocation or side effects happen unseen in the call.

**Being a foldable constant is the condition for entry, not the reason to enter.** The second test is whether the shorter call lies to the reader. An arena parameter with `= null` would hide "omit it and it allocates on the global heap, and you owe the free".

**An arena parameter carries no default. Where an API supports heap allocation, a caller requests it explicitly with `null`.** `List<|I32|>(null)`, `base64.encode(data, null)` and `json.parse(text, null)` read alike. Where the elements go, and whether a `free()` is owed, is then on the call's line.

| Shape not taken | Why not |
| :-- | :-- |
| **A second constructor for the heap** (`new_on_heap()` beside `new(arena)`) | `new(null)` stays writable, so the heap would have two spellings ("A constructor's name says where the returned thing goes" in [`../std/docs/DESIGN-core.md`](../std/docs/DESIGN-core.md)) |
| **The arena on each growing call** (`xs.push(arena, x)`) | Every `push` would carry it, and `free()` would need it back |
| **A default arena per thread or per scope** | The call would again not show where it allocates |

**An API can require a real arena.** Compound objects with shared storage need one lifetime, and a heap fallback would add cleanup rules. Such constructors reject `null`, and non-public fields prevent raw construction.

**The linter holds it** (`[I0702]`): it reports an arena parameter that carries a default, read through typedefs.

**Where a default cannot be placed**, and why, is the table in docs/SPEC-programming-language.md §8.1.1 (the cases `param_default_*` in `ksplc/tests/negative/fn.kspl`). A trait's declaration can carry one (`Index_place.at` in `std/lang`).

**Where defaults stand is not listed here.** Each package's `SURFACE.txt` holds the published ones, and `ksplc doc --surface-scope=all <file>` shows every one a file reaches ("Writing out the published API" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)). The second test turned these away, since the value left out is a judgment the caller must make. They are an arena, an environment's timing (`delay_us`), a grab tolerance (`drag_edge`'s `10.0`), a character to search for (`seek`'s `']'`), and a person's name.

**What is given up**: a call's text does not show how many arguments it passes.

### Why `import` and `#export` are not made a matched pair of words

**`import` and `#export` look like a pair, but act on different axes.**

| Axis | One end | The other end |
| :-- | :-- | :-- |
| Naming: which names a file can see | Bringing a name in (`import`) | Hiding one (not writing `pub`) |
| Linking: which symbols the compiled output shares with other code | Emitting a symbol (`#export`) | Using an outside one (`extern "C"`) |

The list of axes is "9. Files and import" in [`SPEC-programming-language.md`](SPEC-programming-language.md). Where other languages pair the words (C++20 modules, Java's `module-info`), the pair reaches past naming.

**The words do not change.** A keyword like `export fn` would look as if it decided linkage, which visibility decides. Nor is it renamed `#c_name`: on wasm32 it also makes a module export ("11.3 Exposing a KSPL function to C (`#export`)" in [`SPEC-programming-language.md`](SPEC-programming-language.md)).

**A combination that becomes ineffective across the axes is rejected**, as that section lists. On a method the cause is the name's uniqueness: symbols share one namespace, so only a name unique on its own can go out bare.

**This is a language rule, not a lint**, since a lint runs only over the files it is given. It carries no diagnostic code ("1. Diagnostic codes, and the errors that have none" in [`../ksplc/docs/SPEC-diagnostics.md`](../ksplc/docs/SPEC-diagnostics.md)).

### Every item in a declaration block ends with `;`

**Inside `{ … }`, every field and every enum value ends with `;`, the last one too. A `,` there is an error.** So a block has exactly one mark that says "end". The rule is "2.5 Blocks and statement ends" in [`SPEC-programming-language.md`](SPEC-programming-language.md).

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

**`,` keeps its own job**: it separates the items of a list within one notation. So the trailing `,` rule ("2.4 Trailing commas" in [`SPEC-programming-language.md`](SPEC-programming-language.md)) applies only to lists.

**The C family's shape is not taken.** There, `,` separates names inside an `enum` that is one declaration closed by `;`. KSPL's `enum` sits at the level of `struct`, with no closing `;`. The formatter never keeps two items on one line, so a `,` has no job there either.

**The rejection of a `,` there carries a Note stating the rule** (`forbidden_spelling_hint` in [`../ksplc/parse/syntax_msg.kspl`](../ksplc/parse/syntax_msg.kspl)).

## Models write it, and AI runs in it

**This chapter decides two things.** A model writes, reads and checks KSPL ("A model writes it, and the compiler judges it"), and AI runs in KSPL ("AI runs in it"). The grounds are the same: only what is written happens, so neither a model nor a microcontroller has to guess.

### A model writes it, and the compiler judges it

| Property | What it gives a model |
| :-- | :-- |
| **A function can be judged from its text.** Nothing is allocated implicitly, and no failure is missing from a type | No knowledge of hidden run-time behaviour is needed |
| **Generated code converges on one spelling**, through Principle 6 and one formatter (`ksplc fmt`) | No equivalent spellings to drift between |
| **The verdict is mechanical.** No warning is let stand (Principle 2), `ksplc explain <code>` expands a code, and an error says what to write instead | A completion is judged by whether `ksplc` accepts it |
| **An agent reads the verdict as fields.** `--diagnostic-format=json` writes one object per diagnostic ("2.11 Diagnostics a program reads" in [`../ksplc/docs/SPEC-tools.md`](../ksplc/docs/SPEC-tools.md)) | No reworded message breaks the reader |
| **What a model reads stays true.** The API pages and records are generated from the source and held to it by checks | See "The reader can be a model" in [`DESIGN-repository.md`](DESIGN-repository.md) |

### AI runs in it

* **The engine is KSPL alone** ([`ksai/`](../ksai/README.md)): tensors, inference, training, LoRA fine-tuning, the tokenizer and safetensors weights.
* **The same code runs from a microcontroller to a server.** On bare metal it takes its weights through `embed` and needs no heap. On a server, one flag sends the matrix product to OpenBLAS.
* **The model, its tooling and the checking are one language**, with one debugger and one set of rules.

### What it costs

* **KSPL is in no model's training**, so every session pays context to read what KSPL leaves out ("The reader can be a model" in [`DESIGN-repository.md`](DESIGN-repository.md)).
* **The engine runs on the CPU alone.** Each layer's backward pass is written by hand ([`ksai/docs/DESIGN-learning.md`](../ksai/docs/DESIGN-learning.md)). That is the training step that computes how to change the weights.
