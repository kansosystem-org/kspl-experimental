# The KSPL language specification

## 1. Overview

KSPL is a statically typed language for systems programming: code that runs close to the machine, such as a compiler, an operating system or a server. Statically typed means every value's type is known when the program is compiled, so a type mistake stops the build, not the running program.

**Only what is written happens**: code runs, and memory is allocated and freed, exactly where the code says. There is no garbage collector working in the background, for example.

The core is small. Type features on top of it (generics, traits and the like) are taken one part at a time, only as far as the program being built needs them. A feature only some kinds of work need is a standard-library part, not a language rule. The reasons for this shape are the [Development Principles](DESIGN.md#development-principles) in `DESIGN.md`.

The compiler, `ksplc`, translates KSPL into C (or into LLVM IR), and a C compiler turns that into the program. So some rules below mention "the generated C": the C text `ksplc` writes for your program.

These marks appear in examples from the first chapter on. Each is defined in the section named.

| Written | What it means | Defined in |
| :-- | :-- | :-- |
| `x: = 1` / `x: I32 = 1` | Declare `x`. Without a type, it is taken from the value | [4.1](#41-declaration-patterns) |
| `$x: = 1` | `x` may be given a new value later; without `$` it cannot | [4.2](#42-the-two-axes-of-mutability) |
| `T@` / `x@` | A pointer to a `T` / the address of `x` | [3.2](#32-derived-types), [4.3.1](#431-the-mutability-of-taking-an-address-x-is-fixed-by-xs-declaration-alone) |
| `p$` | What the pointer `p` points at | [6.2](#62-pointer-arithmetic-and-implicit-dereferencing) |
| `T[]` / `T[N]` | A slice (a pointer plus a length) / a fixed-length array of `N` elements | [3.2](#32-derived-types) |
| `T$[]` / `T$@` | A slice whose elements, or a pointer whose target, may be written | [3.2](#32-derived-types) |
| `List<\|I32\|>` | A generic type with its type argument | [3.3](#33-structs-struct) |
| `T::x` / `T::{ … }` | Convert `x` to `T` / build a value of `T` from its parts | [6.4](#64-type-conversion--and-implicit-casts), [6.6](#66-initialization-and-construction) |
| `T!E` | A function's result: a `T` on success, or an error `E` | [8.3](#83-error-handling) |
| `.kspls` / `.kspl` | A source file in the indentation notation / the brace notation | [2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations) |

---

## 2. Lexical structure

This chapter says how the compiler reads the raw text: comments, names, values written directly (literals), commas, and where blocks and statements end.

Source code is encoded in UTF-8.

### 2.1 Comments

KSPL has one kind of comment: `//` to the end of the line. A comment opening with `//<` documents the thing on its own line, and tools show it.

| Written | What it is |
| :-- | :-- |
| `// text` | **Line comment**: from `//` to the end of the line, and the only kind of comment. There is no block comment `/* */` (the reason is in [`docs/DESIGN.md` "Notations not carried"](DESIGN.md)) |
| `//< text` | **Documentation comment** (below) |
| `///` or `//!` | **Not a documentation comment.** The compiler warns about a comment opening with either, and does not read it (`ksplc explain W0212`) |
| `////` (four or more slashes) | An ordinary comment |
| `#!` on a file's first line | A shebang, skipped like a comment, so the file can run as a script with `ksplc run` |

**A documentation comment** describes the thing on its own line: a declaration, a field, a variant, a parameter or the return type. It stands after what it describes, not before it:

```kspls
priv fn demangle( //< strips the mangling off a symbol
    raw: U8[], //< the mangled symbol as it was written
    file: U8[], //< the source the symbol came from
): U8[] //< the original name, or the input unchanged
    return raw
```

* **A parameter's description goes on the parameter's line, a field's on the field's, and the return's on the return type's line.**
* **A run**: a line holding only a `//<` and its text continues the description above it. Such lines together are a run. A continuing line stands one step deeper than the line it continues. Any other line ends the run, a blank line or a plain `//` included. If the thing described has braces, the run goes inside them; otherwise it stands below, one step in.
* **The summary**: inside a run, a `//<` with no text separates the summary (above it) from the detail (below it). An editor's hover and `ksplc doc` show the summary first. It is one line, and it does not open with a `Caution:` or `Note:` label (`ksplc explain W0213`).
* **The anchor shape**: a description longer than one line stands below a `//<` with no text, which separates nothing; it only anchors the run (it marks the line the run hangs off).
* **A head that wraps**: a declaration's head is everything before its body: the name, the parameters and the return type. When the parameters are written one per line, the head closes on a later line, the one holding `)`. The declaration's run then hangs off that closing line: the lines right under the first line are the parameters, and a run there would sit among them. On the closing line, a `//<` with no text anchors the declaration's run, and a `//<` with text describes the return type (the table after the examples below).
* The compiler warns about a `//<` that continues nothing, and about an anchor with nothing under it (`ksplc explain W0209`, `W0210`).
* **A file's description** is a `//<` run before its first line of code, above its imports, with nothing over it but blank lines.

The anchor and the summary together look like this:

```kspls
priv fn clamp(n: I32, low: I32, high: I32): I32 //<
    //< n, kept between low and high
    //<
    //< The two bounds are not checked against each other.
    if n < low
        return low
    return high if n > high else n
```

When a head wraps, whether the `//<` on its closing line has text decides what it describes. In `twice` it has no text, so it anchors the declaration's run below it. In `half` it has text, so it describes what comes back, and the declaration's own summary stands on the first line:

```kspls
priv fn twice(
    n: I32, //< the number to double
): I32 //<
    //< n doubled
    //<
    //< A negative is doubled the same way, and nothing is clamped.
    return n * 2

priv fn half( //< n halved, rounded toward zero
    n: I32, //< the number to halve
): I32 //< the half
    return n / 2
```

| Where the `//<` stands | What it describes |
| :-- | :-- |
| On a head's first line, with text | The declaration |
| On a wrapped head's closing line, with no text | The declaration: its run is the lines below |
| On a wrapped head's closing line, with text | The return type |

The reasons are in "The documentation a declaration carries" in [`DESIGN.md`](DESIGN.md).

A `#!` line (a shebang) is skipped like a comment **on a file's first line only**; `#!` has no other meaning (a directive is `##`, an attribute `#`).

### 2.2 Identifiers and naming rules

An identifier (a name) starts with a letter (`A-Z`, `a-z`) or `_`, followed by letters, digits or underscores. KSPL's reserved words (keywords) cannot be identifiers.

This naming is recommended; **the compile does not refuse a name that breaks it**, and `ksplc lint` reports one (I0502).

| Style | Used for | Example |
| :-- | :-- | :-- |
| `Capital_snake_case` | Types, structs (`struct`), enums (`enum`), typedefs (`typedef`) | `File_descriptor` |
| `snake_case` | Variables, constants (`const`), functions (`fn`), methods, fields, file names | `open_file`, `max_buffer_size` |
| `snake_case` too, unlike C | An enum's variants. With no run of capitals, they stand apart from the type name | `not_found` |

```kspls
// examples of the naming rules
const max_buffer_size = 1024

struct File_descriptor
    file_id: I32
    is_open: Bool

fn open_file(file_name: U8[]): File_descriptor!Io_error
    ...

```

**C's reserved words (`int` / `long` / `goto` and so on) are usable as identifiers**, except those that are also KSPL's own: `struct` / `enum` / `typedef` / `const` / `if` / `else` / `for` / `switch` / `return` / `break` / `continue` / `case` / `default` / `extern` / `sizeof` / `offsetof`.

Such a name would clash with C in the generated C, so `ksplc` adds the suffix `_kw` to it there. Only local variables, parameters and struct fields keep their bare names in the generated C, so only those get the suffix. Type and function names always carry a prefix made from their file's path, so they never collide. It is a compile error only when the suffixed name already exists in the same scope (`goto` beside `goto_kw`).

**Two more groups get `_kw` and are usable too:**

| Group | Examples | Why it needs the suffix |
| :-- | :-- | :-- |
| **Names the headers of the generated C's preamble `#define` as object-like macros** | `NULL` / `EOF` / `errno` from libc (the C standard library); `far` / `near` / `pascal` from Windows' `windef.h` | Emitted bare, the C preprocessor would replace them with something else. A function-like macro (`max(a,b)`) expands only before a `(`, so this group leaves them out |
| **The words a C compiler keeps for itself** | Every name opening with `__`, or with `_` and a capital letter; Microsoft's one-underscore synonyms (`_try` for `__try`, `_int64`); `static_assert`; `L__FUNCTION__` / `L__FUNCSIG__` | C99 keeps that space for the compiler: clang reads `__cdecl` as a keyword even on Linux, GCC reads `__thread`, and C11 defines `_Atomic`. The suffixed form opens the same way and gets `_kw` in turn, so `__try` beside `__try_kw` is not an error |

Names only OS headers define (`st_mtime` / `O_RDONLY` / `AF_INET`) are usable too, and get no suffix. The order of the generated C keeps them apart, not this list.

**A debugger shows such a variable with its suffix** (`int` becomes `int_kw`), since it shows the generated C's names. The suffix is always `_kw`; drop it when reading.

### 2.3 Literals

A literal is a value written directly into the source. There are these seven kinds and no others.

| Category | Example notation | Type / notes |
| --- | --- | --- |
| **Integer** | `123`, `-10`<br>`0xFF` (hex)<br>`0b1010` (binary) | Defaults to `I32`; a suffix states the type (`123U8`, `100Sz`). |
| **Floating point** | `3.14`, `-0.5`<br>`2.5e-10` (exponent notation) | Defaults to `F64`; a suffix states the type (`1.0F32`). IEEE 754 (the usual binary floating-point format). |
| **Boolean** | `true`, `false` | `Bool`. |
| **Null** | `null` | **Becomes any pointer type**: the expected type if that is a pointer type, and with no expected type the generic pointer `Void@` (C's `void*`). |
| **Character** | `'a'`, `'\n'`, `'A'` | `U8`: exactly one byte. `'あ'` (3 bytes in UTF-8) and `'ab'` (2 bytes) are compile errors; longer text is a string (`U8[]`).<br>**There is no character type**: one byte is a number, so code handling byte sequences needs no cast. The format specifier `\{b:c\}` writes the byte as a character ([3.6](#36-the-expansion-specification-for-string-interpolation); the grounds are in [`DESIGN.md`](DESIGN.md), "Notations not carried"). A C `char*` is received as `Void@` ([11.1](#111-types-that-cannot-cross-the-c-boundary)). |
| **Ordinary string** | `"Hello\n"`<br>`"Line 1`<br>`Line 2"`<br>`"Hello, \{name\}!"` | `U8[]`, or an interpolated string.<br>Escape sequences are interpreted, and **a newline may be written as-is**. A `\{expression\}` makes it an interpolated string ([3.6](#36-the-expansion-specification-for-string-interpolation)). |
| **Raw string** | `"""Path\To\File"""` | `U8[]`, between `"""` and `"""`, with no escapes and no interpolation. Immutable like an ordinary string, and null-terminated. A newline right after the opening `"""` is dropped, and **every line inside ends `\n`**, whatever line ends the file uses. |

**Line ends are the file's spelling, not the program's, and are fixed before the analysis.** A source with `\r\n` line ends (Windows) and the same source with `\n` are one program. So a text that must hold a `\r` writes the escape in an ordinary string ([`DESIGN.md`](DESIGN.md), "The line terminator is the file's spelling, not the program's").

A numeric literal may carry the digit separator `_` anywhere but first (`1_000_000`).

**A decimal integer does not start with `0` unless it is `0` itself**: `0755`, `09` and `0_1` are syntax errors. KSPL has no octal (base 8) literal, but C and Java read that spelling as octal. So it is refused rather than read as a number its writer may not have meant, and the error names both readings (`755`, or `0x1ed` for the octal one). A floating-point literal is always decimal and may start with `0` (`0.5`, `007.5`).

#### 2.3.1 The rules that fix a literal's type

**A literal's type is fixed by where it is placed.** A number written with no suffix has no type of its own until its position gives it one.

The type a position calls for is the *expected type*: a variable declaration's annotation, an assignment's left side, or a function's argument. The expected type propagates to the right side.

| Where the literal stands | The type it takes | Example |
| :-- | :-- | :-- |
| It carries a suffix | The suffix's type | `300U8` (a compile error: out of range) |
| Where a type is expected | The expected type, if the literal is within its range | `b: U8 = 255`, `for $i: Sz = 0; i < len; i += 1` |
| An integer operand where the two sides would have no common type | The other operand's integer type | `u < 1` with `u: U32` compares at `U32`, so `u < -1` is out of range |
| An integer operand, and the outer expected type is the other operand's type | That type | For `x: U8`, the `1` of `y: U8 = x + 1` is a `U8` |
| Any other operand of a numeric binary operation | Its default; then the operands are promoted to the side holding the other | `x + 100` with `x: I8` (below) |
| Nowhere a type is expected | `I32` for an integer, `F64` for a floating-point number | `x: = 1` |

**A floating-point literal takes only a floating-point type**: placed where an integer is expected (`x: I32 = 2.5`, an `I32` argument, a `catch` substitute for an `I32`), it stays `F64`, and the implicit conversion is a compile error. **An integer literal likewise takes only an integer type**: `f: F64 = 2` and `x * 2` with `x: F64` are compile errors; write `2.0`.

**An integer literal outside the range is a compile error** (`b: U8 = 300;` / `n: I32 = 2147483648;` / `u: U32 = -1;`). A value is never silently changed, just as with implicit narrowing and sign conversion (§6.4). For truncation or a bit pattern, write an explicit cast (`U8::300`, `U32::0xFFFFFFFF`).

* A literal whose type is fixed is checked against that type. A suffix fixes it (`300U8`), and so does an expected type from a declaration, argument, field and so on.
* A literal with no fixed type is checked against the type actually computed (below).
* A literal with more digits than any integer type holds (beyond 64 bits) is an error whatever the expected type.

**The expected type is not propagated into a numeric binary operation**, as a rule. Operands of differing types are promoted to the side holding the other ([6.4](#64-type-conversion--and-implicit-casts)): the narrower one is widened to the wider one's type, and the operation runs at that width. Take `x: I8` holding `100`, and `y: I32 = x + 100;`. The `100` keeps its default `I32`, `x` is widened to `I32`, and the sum is `200`. Had the `100` taken `x`'s type, the sum would run in 8 bits, where `200` does not fit, and would wrap to `-56` before being widened for `y`.

The exception is an integer literal with no fixed type (the third and fourth rows of the table). Where the two sides would have no common type, it takes the other operand's integer type. It takes the outer expected type only when that type is the same as the other operand's: in `y: I32 = x + 100;` above the two differ, so the `100` stays `I32`. Such a literal then has a fixed type, so the range check applies (`y: U8 = x + 300;` is a compile error). So `x + 1` and `1 + x` both need no suffix. **Shifts are outside the exception** (the right side is a shift amount, whose type is independent of the left side's).

**To write the type, use a suffix** (`x + 300U8`). A prefix cast (`x + U8::300`) gives the same type, but it skips the range check and silently truncates (`300U8` is an error, `U8::300` is accepted). Use it only when truncation is the intent.

**An integer literal with no type written must fit the type actually computed**, or it is a compile error. It is judged against one of two types:

* **Inside a binary operation**: the type after promoting both sides. Against a `v: U32`, `v * 0x85ebca6b` is correct as `U32` (`0x85ebca6b` does not fit `I32`), and `x: U64 = 4294967296 + 1;` is correct as `U64`. But `x: = 4294967296 + 1;` stays at the default `I32` after promotion, so it is an error.
* **A declaration with no type annotation**: the initializer's type becomes the declaration's type, so `x: = 2147483648;` does not fit the default `I32` and is an error.

Both are fixed the same way: write the width with a suffix, or write the variable's type (`2147483648U32` / `x: I64 = ...`). A literal is not judged alone, since a wider type may still come later.

#### 2.3.2 Escape sequences

An escape sequence is a `\` followed by a code that stands for one byte, such as `\n` for a newline. In an ordinary string literal and a character literal, only these ten may follow `\`. In a string, a line terminator may follow it too ([2.3.4](#234-a--at-a-lines-end-carries-a-string-onto-the-next-line)). A raw string (`"""…"""`) interprets no escapes: each `\` of `"""Path\To\File"""` is a backslash beside a letter.

| Notation | Byte | Notation | Byte |
| :-- | :-- | :-- | :-- |
| `\n` | 10 (newline) | `\'` | 39 (`'`) |
| `\r` | 13 (carriage return) | `\"` | 34 (`"`) |
| `\t` | 9 (tab) | `\\` | 92 (`\`) |
| `\0` | 0 (NUL) | `\{` / `\}` | 123 / 125 (`{` / `}`) |
| `\uXXXX` | The 1 to 3 bytes representing code point U+XXXX in UTF-8 | | |

**A notation absent from the table is a compile error** (`"\b"` / `"\x41"` / `"\101"`; the reason is in [`DESIGN.md` "Notations not carried"](DESIGN.md)). For the character itself, write no backslash; for the backslash itself, write `\\`. There is no octal or hex notation: a byte written as a number is `0x41U8`.

**In a string, `\{` and `\}` open and close interpolation** (§3.6); only in a character literal do they denote `{` and `}` (`'\{'`). A bare `{` or `}` is written directly in a string, with no doubling.

#### 2.3.3 Writing a code point with `\uXXXX`

`\u` followed by four hex digits writes one Unicode character by its number (its code point). **The hex is exactly four digits** (`"\u00E9"` is `é`, `"\u3042"` is `あ`). Too few is a compile error, and a fifth digit is not taken in (`"\u00410"` is the two characters `A` and `0`).

| Where, or which code point | Result |
| :-- | :-- |
| In a string | **A UTF-8 byte sequence**, which `.len` counts (`"\u3042".len` is 3) |
| In a character literal | **One byte, so only up to U+007F** (`'\u00E9'` is a compile error, and so is `'あ'` written directly) |
| A surrogate code point (U+D800–U+DFFF) | **Cannot be written**: mapped to UTF-8, it gives an invalid byte sequence |
| Above U+FFFF | **Cannot be written with `\u`**: write the character itself into the source, which is UTF-8 (an emoji is accepted as one character) |
| In a comment or a raw string | Nothing: `\u` is expanded only where a literal's bytes are decided |

#### 2.3.4 A `\` at a line's end carries a string onto the next line

**Inside an ordinary string literal, a `\` at the end of the line carries the text on, and stands for no byte.** The line terminator goes with it, and so does the whitespace at the start of the next line, so

```kspls
long: U8[] = "one \
    two"
```

holds exactly `"one two"`, however deeply its block is indented. **The indentation belongs to the layout, never to the text.**

* **The space at the seam is the writer's.** Nothing is added or removed: a break between two words keeps the space already there, and a break inside a word joins it up (`"ab\` + `cd"` is `"abcd"`).
* **Only a string has it**: in a character literal, a `\` at the line's end is a notation absent from the table, so a compile error.
* **A raw string has no escapes**, so a `\` before its line terminator is a backslash followed by a newline.
* **Interpolation is unaffected**: a `\{ … \}` may stand on either side of the seam.

Note: **Diagnostics name the lines as written.** A carried string is still open where the line ends, so the line below keeps its own number. The indentation notation reads the same line ends ([2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations)).

`ksplc fmt` (the formatter) uses the mark to bring a line that runs past the file's width back inside it. Why a mark and not two literals side by side is in [`DESIGN.md`](DESIGN.md), "Carrying a long string literal across lines".

### 2.4 Trailing commas

A comma may also follow the last element of a comma-separated list: a function's arguments, struct and array compound literals, a variant's payload, generic arguments. Adding an element then changes one line of the diff, and reordering lines disturbs no other.

Note: **Declarations inside `{ … }` are not a comma-separated list.** A struct's fields and an enum's variants alike end with `;` ([2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations)). A comma separates only things listed within one notation, such as a payload's fields.

### 2.5 Blocks and statement ends (brace and indentation notations)

**A program is written in one of two notations, which mean the same.** In the brace notation (`.kspl`), `{` `}` and `;` mark blocks and ends, as in C. In the indentation notation (`.kspls`), indentation, dedentation and newlines mark them, as in Python. `ksplc fmt --to=kspl` and `--to=kspls` turn one into the other. The examples in this specification use the indentation notation. Why both are kept is in "The indentation notation (`.kspls`)" in [`DESIGN.md`](DESIGN.md).

One function in the brace notation:

```kspl
fn add(a: I32, b: I32): I32 {
    return a + b;
}
```

The same function in the indentation notation:

```kspls
fn add(a: I32, b: I32): I32
    return a + b
```

**Only blocks and terminators disappear in the indentation notation**; every other brace and `;` stays.

| The job of a brace or `;` | Where it is written | In `.kspls` |
| :-- | :-- | :-- |
| A block | `fn` / `struct` / `enum` / `trait` / `impl` / `extern` / `if` / `else` / `for` / `switch`'s `case` and `default` / `defer` / a labelled block / `catch` and `fn(…)` inside an expression | Indentation |
| A value | `T::{ … }`, `::{ … }`, `import … { … }`, string interpolation `"\{ … \}"` | **Unchanged** |
| A terminator | The `;` of declarations and statements | A newline, or the `}` of a block written on one line |
| A separator | The `;` of a C-style loop header (`for init; cond; step`), before a closure's captures (`fn(x: I32; n: I32)`), and between two statements on one line (`{ a(); b() }`) | **Unchanged** |

**Every declaration inside a block ends with `;`, the last one too**: a `struct`'s fields and an `enum`'s values alike (in `.kspls`, a newline). `,` separates only what is listed within one notation: a payload's fields, arguments, compound literals and generic arguments. A `,` between fields or values is a compile error, and so is an `enum` with no value.

```kspls
struct Reading
    ok: Bool
    value: U32

enum Shade
    light
    mid(level: I32, tone: U8)
```

**A newline ends a statement unless the line continues.** A block's heading carries no mark (no `:` as in Python). A line continues onto the next in these cases:

| # | The line continues when | For example |
| :-- | :-- | :-- |
| 1 | The newline is inside brackets (`(` `[` `{`). Inside brackets a newline never opens a block | A call whose arguments run over several lines |
| 2 | The line ends in an operator, `,`, `=` or `:`, or in `as`, `in` or `catch` | `total: = a +` with `b` on the next line |
| 3 | The next line starts with `.`, a closing bracket or an operator | A chain of calls with each `.s(…)` on a line of its own |

**A comment line or a blank line in between changes nothing**: rules 2 and 3 read the next line with code, so a comment may stand between an `=` and its value, or between two links of a chain.

**After `catch`, the column decides.** After `f() catch` or `f() catch e`, a next line at the statement's own column continues the statement, and a deeper line opens the handler (the code run on an error, [8.3](#83-error-handling)). So a line is not broken right after `catch`: `ksplc fmt` lets such a line run past the width instead.

**A line holding only `return`, `throw` or `fallback` is a statement of its own.** A `!` at a line's end is a rethrow (`f()!`, passing an error on to the caller) and ends the statement; a `!` at a line's start continues the line before (a wrapped `T!E` type).

**A value split where no mark continues it goes in parentheses.** This applies to a conditional value (`a if c else b`), and to the value of a `return`, `throw` or `fallback`, whose keyword alone is a statement. A break outside every bracket is a compile error whose message names the parentheses, and `ksplc fmt` puts them in.

```kspls
return (func_name.sub_from(mod_prefix.len) if func_name.starts_with(mod_prefix.slice())
    else func_name)
```

**Only a heading's column counts.** A block's body may be indented by any amount, and blocks indented by different widths may stand in one file. A line whose column matches no block is a compile error with no code: it is deeper than a block's heading but shallower than the block's members.

**Indentation is written with spaces.** A tab, U+3000, U+00A0, a form feed or a vertical tab does not count as a column, so a line indented with one is read at column 0.

**A block with no heading carries a label**, in both notations. A label is a name and a `:` on the line above the block (`release_on_exit:`). A lone `{ … }` is a compile error. A block that needs no name takes the label `_`. It may appear any number of times in one scope, so `break` or `continue` to `_` is a compile error.

**Two forms keep their braces in `.kspls`**:

* a closure (a function written inside an expression) with a multi-line body inside a call's arguments, since a newline inside brackets is not a block;
* an empty block, and a block fitting on one line (`f() catch {}`, `fn f() {}`, `case .x {}`). A block holding only a comment counts as empty. No terminator follows such a block, and its last statement takes no `;` (`fn one(x: I32): I32 { return x + 1 }`), so `.kspls` shows a `;` only between two statements on one line.

**`switch` carries no block**: its `case` and `default` do. In `.kspls` each `case` and `default` stands at the `switch`'s column, the first on the line below the `switch`.

```kspls
switch e
case .spawn_failed
    io.err().s("could not start\n")
case .timed_out
    io.err().s("timed out\n")
```

**The `switch`'s line goes on into a `case` at its own column**, as a later arm goes on from the block before it. The line it goes on into is the next line with code, so a comment line or a blank line between them changes nothing. Only that shape continues it:

* **A `case` indented deeper is a compile error**: it would open a block under the `switch`, which has none.
* **A `case` at a shallower column belongs to the level outside**, so the `switch` ends without an arm, which is a compile error.
* **A `default` cannot be the first arm**, so it does not continue the `switch`'s line either.

The first `case` may also stand on the `switch`'s own line (`switch e case .spawn_failed`); `ksplc fmt` moves it to the line below.

**Line numbers are the same in both notations.** Reading `.kspls` adds no line: the `{` goes at the end of the heading's line, and the `}` at the end of the block's last line. So a diagnostic, a jump to a definition and a hover point at the line written.

---

## 3. The type system

A type fixes the width a value occupies (how many bytes) and what can be done with it. Types are primitive ([3.1](#31-primitive-types)), derived from others ([3.2](#32-derived-types)), or declared (`struct` / `enum` / `typedef`). A group of types sharing a behavior is a `trait` ([5. Implementations and traits](#5-implementations-and-traits)).

### 3.1 Primitive types

The primitive types are the built-in numbers, `Bool` and `Void`. Every other type is built from them.

| Category | Type name | Size (bits) | Description |
| --- | --- | --- | --- |
| **Signed integer** | `I8`, `I16`, `I32`, `I64` | 8 ... 64 | Two's complement (the usual binary form for negative numbers). |
| **Unsigned integer** | `U8`, `U16`, `U32`, `U64` | 8 ... 64 |  |
| **Size** | `Sz` | 32, 64 | A **signed integer** for pointer sizes, array indices and memory offsets (C's `ptrdiff_t`). Its width depends on the architecture and is at least 32 bits ([14.1](#141-implementation-defined---the-value-is-fixed-but-differs-per-target)). A function receiving a length or an index must reject negative values itself ([`DESIGN.md`](DESIGN.md), "Why the size and index type `Sz` is signed"). |
| **Floating point** | `F32`, `F64` | 32, 64 | IEEE 754 single and double precision. |
| **Boolean** | `Bool` | 8 | `true` (1) or `false` (0). |
| **Empty** | `Void` | 0 | Size zero: holds no value. |

**The sign of one byte is not left to the implementation**, unlike C's `char` (signed on x86, unsigned on Arm). KSPL's one byte is `U8`, unsigned on every target (`unsigned char` in the generated C). Otherwise widening `U8::200` to `I32` would give `-56` on one target and `200` on another, and the two backends (the C and the LLVM IR output) would disagree ([14.3](#143-what-must-be-the-same-in-every-implementation)).

**Byte order is decided by the implementation** ([14.1](#141-implementation-defined---the-value-is-fixed-but-differs-per-target)). Byte order is which byte of a multi-byte number comes first in memory. The target's order is used as-is, and the language never reorders. x86-64 and Arm are little-endian (lowest byte first).

**Do not make an expression that reads or writes a value depend on byte order.** Data whose order is fixed (network protocols, file formats, register dumps) is read and written with functions that name the order, such as `std/bytes`'s `get_u32_be` / `put_u32_le` (big-endian / little-endian).

Caution: Those have no default order. `_be` / `_le` is always written, since a wrong order silently yields a wrong value that no type catches.

Byte order shows only when a multi-byte value is viewed as bytes: through a hand-built descriptor, or a `mem.copy` into a byte sequence ([6.2.1](#621-member-access-and-indexing-through-a-pointer) refuses a slice cast changing the element size). Both put "this is treated as bytes" into the text.

### 3.2 Derived types

Six kinds of type are built from a **base type** (a primitive type or a struct). The diagram shows each one's notation; each is described below it. The `T!E` type is in [8.3](#83-error-handling).

```mermaid
flowchart LR
    T(["base type T<br/>(I32 / U8 / struct / enum …)"])
    T --> SL["T[]<br/>slice (ptr+len, bounds-checked)"]
    T --> AR["T[N]<br/>fixed-length array (value type)"]
    T --> AT["T@<br/>raw pointer (address only, unchecked)"]
    T --> IM["T$[] / T$@<br/>mutability marker (what it points at is writable)"]
    T --> RE["T!E<br/>a type holding success or failure (-> §8.3)"]
    T --> OP["T?<br/>a value that may be absent: Option&lt;|T|&gt;"]
    FN["fn(Args): Ret<br/>function type (a pointer to a function)"]
```

1. **Slice (`T[]`)**:

* **Definition**: a safe view onto a memory region that something else owns. It is a *fat pointer*: a pointer and a length together. It has two read-only fields: `.ptr`, a raw pointer to the first element (`T@`), and `.len`, the element count (`Sz`).
* **The only spelling**: it is `std/lang`'s `Slice<|$T|>`, but `Slice<|T|>` written as a type is a compile error naming `T[]` (`T$[]` for writable elements), an `impl`'s target included.
* **Safety**: every read or write by index is checked against the range at run time.
* **Constraint**: there is no slicing syntax (a subarray written like `arr[start .. end]`). Instead, `std/chars`'s `sub(start, len)` / `sub_from(start)` / `sub_mut(start, len)` return zero-copy views. The element type does not matter: they are generic methods on `impl<|T|> T[]`, so an `I32[]` and a `U8[][]` are sliced alike.

2. **Fixed-length array (`T[N]`)**:

* **Definition**: `N` is a compile-time constant (`U8[10]`). An array variable is the contiguous memory itself, not a pointer to its first element: a value type, copied whole when assigned or passed.
* **Letting the compiler count the elements (`T[_]`)**: when the right side is a compound literal `::{ ... }` (a list of initial values), `_` in place of the count takes the number of initial values written.
  * **Only in a variable declaration.** `T[_]` as a struct field's type is a compile error (the field layout needs the size first).

3. **Raw pointer (`T@`)**:

* **Definition**: a value holding only a memory address, written with the postfix `@` on a type. It carries no length, so no bounds check is possible.
* **Use**: C interoperation and hand-written allocators, where no checks apply.
* `ptr[i]` is forbidden on a raw pointer; unchecked access is written `(ptr + i)$` ([6.2.1](#621-member-access-and-indexing-through-a-pointer)).

4. **Function type (`fn(Args...): Ret`)**:

* A pointer to a function, as in `typedef Callback = fn(val: I32): Void;`.
* **It stands wherever a type can**: a parameter, a field, a return, a local, a type argument (`List<|fn(x: I32): I32|>`), an array's element. A call through such a value is checked against the type, whatever holds the value.
* **A postfix after a function type belongs to its result.** `fn(x: I32): I32@` returns a pointer. To apply a postfix to the function type itself, bracket it: `(fn(x: I32): I32)@` is a pointer to a function pointer, and `(fn(x: I32): I32)[4]` an array of four. Diagnostics spell such types the same way.
* **A parameter writes both a name and a type.** A bare name inside `fn(...)` is the parameter's name. So `fn(T): T`, meant as `fn(I32): I32`, is "a parameter named `T` with no type" (a compile error). Inside generics this form can pass silently, since only the return's `T` resolves.

5. **Mutability modifier (`T$[]` / `T$@`)**:

* **Definition**: a `$` directly before a slice's `[]` or a pointer's `@` makes what it points at writable; unmarked is read-only (C's `const T*`). So `U8[]` is a read-only byte slice, `U8$[]` has writable elements, and `U8$@` has a writable target. It is the same idea as the `$` before a name (axis 1 of [4.2](#42-the-two-axes-of-mutability)).
  * Note: Dereferencing's `p$` ([6.2](#62-pointer-arithmetic-and-implicit-dereferencing)) uses the same symbol, but never in the same position. In a type it stands only directly before `@` or `[`; in an expression, only directly after the expression.
* **A receiver taken by value carries the `$` on its name** (`$r: Self`; axis 1 of [4.2](#42-the-two-axes-of-mutability)), since it has no `[]` or `@` to mark. A receiver is the value a method is called on.
* **Mutable converts to read-only** implicitly, not the reverse, and only at the outermost step ([6.4](#64-type-conversion--and-implicit-casts)).
* **A read-only type is not a constant**: `$` concerns the type, whether what it points at may be rewritten. A named compile-time constant is a `const` declaration (`const PI = 3.14;`).

6. **Optional (`T?`)**:

* **Definition**: `T?` is `std/lang`'s `Option<|T|>`, a value that may be absent ("Null safety" in [3.4](#34-enums-enum)). `Option<|T|>` written as a type is a compile error naming `T?`, an `impl`'s target included (`impl<|T|> T?`), and a diagnostic writes the short one.
* **Marks apply from the left**, as `[]` and `@` do: `U8[]?` is an optional slice, `U8?[]` a slice of optional bytes, and `Node$@?` an optional pointer.
* **With a result**: `T?!E` is a result whose value may be absent, and an optional result is bracketed, `(T!E)?`. `T!E?` is a compile error, since the `?` would make the error type optional.
* **A `?` marks a type only.** After a value it is a syntax error: `f()!` passes a failure on, and `if v: = x` takes an optional's value out. Where an expression names the type, it is written `Option<|T|>` (`Option<|I32|>.none`), or left to the place (`.none`).

**`null` with no expected type** takes `Void@`, like C's `NULL` ([2.3](#23-literals)).

```kspls
// with no expected type the type is Void@
p: = null

// OK: the type is stated
p: User@ = null
```

With a raw pointer's `null`, the writer must guarantee there are contents when dereferencing. For presence and absence **in the type system**, with a compile error where the absent case is not handled, use `T?` ("Null safety" in [3.4](#34-enums-enum)).

### 3.3 Structs (`struct`)

A struct gathers named fields into one type. It can be generic: it can take parameters, written between `<|` and `|>`, that are types or values fixed at compile time.

**Memory layout**: fields are laid out in declaration order. Size, alignment and field offsets follow the target's C ABI, the rules C compilers on that platform use for laying out data (the generated C and the LLVM IR agree; [14.1](#141-implementation-defined---the-value-is-fixed-but-differs-per-target)). So a struct can be passed straight across an `extern "C"` boundary to C code.

Caution: Code relying on the layout (converting to and from a byte sequence, and the like) must state it with `#packed` / `#align(N)` ([10](#10-compiler-directives-and-attributes)), because the default alignment changes with the target.

**A `struct` has at least one field.** `struct S;`, with `;` in place of the fields, is a compile error outside an `extern` block, where it declares a C type held by pointer ([11.2](#112-external-functions-and-opaque-structs)). `struct S {}` cannot be written either.

**It cannot hold itself directly** as a field (a compile error): its size would grow without bound. To point at itself it holds a raw pointer (`Self@`).

**Visibility**: a field is reachable only from files in the same package unless it carries `pub`. Fields do not inherit the struct's own visibility: inside a `pub struct`, a field without `pub` still does not leave the package.

```kspls
pub struct Matrix<|T, const rows: Sz, const cols: Sz|>
    data: T[rows*cols] // the default is within the package
    pub id: I32 // a public field
```

**A member's visibility cannot be written wider than its enclosing declaration's** (a compile error). This covers a struct's fields, and the methods of an `impl` and a `trait`. Code that cannot name the type cannot reach its members either, so the `pub` in `priv struct S { pub x: I32; }` would widen nothing (Principle 5 in [`DESIGN.md`](DESIGN.md)). Narrower is accepted (a `priv` field inside a `pub struct`).

**A generic type's function without a receiver** (a `new` that builds a value, say) is called as `Type<|type arguments|>.function_name(...)`: `List<|I32|>.new(null)`, `Map<|U8[], V|>.new(arena)`. The type arguments are written on the type, and the call's arguments do not supply them: `List.new(null)` is a compile error that says what to write ([`docs/DESIGN.md` "Inferring a generic's type arguments from the actual arguments is kept"](DESIGN.md)).

**Type arguments after a type that declares none are a compile error**, in a type position and before a member alike (`p: Plain<|I32|>`, `Plain<|I32|>.mk(3)`): they would bind nothing, as after a function that declares none ([8.1](#81-definitions)).

**A method can introduce its own type parameters**: `fn select<|U|>(...)` can be written inside `impl<|T|> List<|T|>`, as `std/seq`'s `select` is. The call site binds `U` from its actual arguments, not the receiver (`xs.select(f)`; `xs.select<|Sz|>(f)` is also allowed). Called through its type, the type's type arguments go on the type and the method's own after the method, written or bound from the actual arguments the same way: `List<|I32|>.select(xs@, f)` and `List<|I32|>.select<|Sz|>(xs@, f)`. The enclosing `impl`'s type arguments cannot be written at a method's call site (`q.get<|U8|>()`). The receiver's instantiation has already fixed them, so write them on the type (`Plain<|I32|>`).

**`impl<|T, U|> List<|T|>` cannot be written** (a compile error): `List<|I32|>` says nothing about `U`, so nothing at the impl position binds it. A free function taking the receiver as its first argument (`map` / `and_then` in `std/lang`) also has every type argument fixed at the call site, but there both type arguments must be written.

**What can be written where a value is passed as a type argument**:

| Written as the type argument | Accepted? | Example |
| :-- | :-- | :-- |
| An integer or boolean literal | Yes | `Ring<\|512\|>` |
| A negated integer literal | Yes | `Ring<\|-3\|>` |
| The name of a `const` declaration | Yes | `Ring<\|tx_ring_size\|>` |
| A value fixed at run time (a local variable) | No: a compile error | |
| An expression computing a value | No: a compile error. Declare a `const` holding it and pass its name | `Ring<\|2 + 1\|>` |
| A value its parameter's type does not hold | **No: a compile error at the use** | `Ring<\|3000000000\|>` for `const n: I32`, and `Ring<\|true\|>` for an integer |

Notations with the same value give the same type: `Ring<|4|>` and `Ring<|cap|>` given `const cap: Sz = 4` are one type.

**The mutable mark (`$`) on a type argument**: a `$` before a type parameter in a declaration (`struct Slice<|$T|>`) makes that position carry immutability onto the actual argument. Unmarked, the argument is immutable.

```kspls
priv struct Box<|$T|>
    p: T$@

b: Box<|$I32|> = ::{ .p = slot@ } // what it points at is mutable (b.p$ = 9 goes through)
r: Box<|I32|> = ::{ .p = slot@ } // what it points at is immutable (r.p$ = 9 is a compile error)
```

* **A `$` written at a position the declaration did not mark is a compile error** (`Plain<|$I32|>`). If it were ignored, its writer would believe the target mutable.
* **At a marked position, one step of weakening is accepted** (`Box<|$I32|>` → `Box<|I32|>`), only in that direction (`Box<|I32|>` → `Box<|$I32|>` is a compile error). The scope and reason are those of the built-in `T$[]` → `T[]` ([6.4](#64-type-conversion--and-implicit-casts)).
* **The two instantiations share one representation in C**: immutability lives only in KSPL's types. They share one C struct (and its tag), `sizeof` is equal, and the conversion emits no cast.
* **A `$` written on an `impl`'s target attaches the `impl` to that instantiation only.** Put the methods that write there.

```kspls
impl<|T|> Box<|$T|> // attaches to the mutable version only
    fn poke(r: Self, v: T)
        r.p$ = v
impl<|T|> Box<|T|> // attaches to both
    fn read(r: Self): T
        return r.p$
```

* **A method's body is specialized per instantiation**, so writing to the element in an `impl` that attaches to both is a compile error on the immutable instantiation.
* **A `$` written on an `impl`'s own type parameter is a compile error** (`impl<|$T|> Box<|T|>`). Only the target's type expression decides which instantiation the `impl` attaches to, so the mark would change nothing ("The mutability marker takes effect only on the target side" in [`DESIGN.md`](DESIGN.md)).
* Calling a mutable-only method on an immutable instantiation is an error saying the method does not exist.
* A `const` type parameter (`<|const N: Sz|>`) takes no `$`: it is a value, with no mutability.

### 3.4 Enums (`enum`)

An enum is a type whose value is one of a fixed list of variants. It comes in two kinds:

| Kind | What it is | `==` |
| :-- | :-- | :-- |
| **Simple enum** | Only picks one of several. Its value can be handled like an integer | Compares like an integer |
| **Tagged union** | Its variants can each carry different data (a *payload*). A hidden number, the tag, records which variant a value holds (Rust's `enum`; C's `union` plus a tag) | None built in (below) |

A tag value written by hand (`ok = 0`) may be any expression fixed at compile time, which the compiler computes: a number, a constant's name, a cast, a character, a `sizeof`. A variant with none written takes the previous variant's tag plus one (the first takes 0).

* **On a tagged union the base type is the tag's own type** (`enum E: U8` holds a one-byte tag before its payload).
* **Every tag fits the enum's base type**, a counted one included: `b` after `a = 255` in an `enum E: U8` is a compile error, as is `a = 300`. A base type wider than `I32` holds tags past it (`enum E: U32` with `a = 0x80000000`).
* **No two variants share a tag.** A `switch` could not tell them apart, so the second is a compile error.

```kspls
// 1. a simple enum (a base type may be given; I32 when omitted)
enum Status: U8
    ok = 0
    err = 1

// 2. a tagged union
enum Event
    quit // no data
    message(text: U8[]) // holds a pointer
    click(x: I32, y: I32) // holds coordinate data
    max // the total element count, for convenience

// 3. a generic enum (a tagged union with type parameters)
enum Tree<|T|>
    leaf(value: T)
    node(left: Tree<|T|>@, right: Tree<|T|>@)
```

**A variant's name comes from `variant_name()`**: the compiler synthesizes `fn variant_name(): U8[]` on every `enum`. It returns the name as declared, without the payload, and string interpolation `\{e\}` uses it too.

```kspls
enum Io_kind
    not_found
    permission_denied(path: U8[])

k: = Io_kind.not_found
io.err().s("failed: \{k\}\n") // failed: not_found
name: = k.variant_name()       // "not_found"
```

On a type with a hand-written `fmt`, that one wins (only `variant_name` is synthesized, never `fmt`). **Interpolation uses `variant_name` only when the interpolated expression is written as a name** (`\{e\}`). For another expression, such as `\{x.field\}`, write `\{x.field.variant_name()\}`. An `enum` with a hand-written `variant_name` gets nothing synthesized (it would be a double definition).

**Generic enums** declare type parameters `<|T|>` as a struct does. The user fills them in (`Tree<|I32|>`), and one copy of the code is built per filled-in type (monomorphization). A value is built with `Tree<|I32|>.leaf(0)` and taken apart with `switch`.

**A tagged union has no built-in `==`.** A simple enum compares like an integer. On an enum whose variants carry data, `==` and `!=` are refused unless it implements `Eq` ("its variants carry data, so it has no built-in '=='; take it apart with 'switch'"). To ask which variant a value is, `switch` on it, or compare `variant_name()`.

**Null safety (`T?`, that is `Option<|T|>`)**: `std/lang`'s `Option<|T|>` (`some(value: T)` / `none`), written `T?` ([3.2](#32-derived-types)), expresses "there may be no value" with a type, not with a raw pointer's `null` (Rust's `Option<T>`, Swift's `Optional<T>`). Its contents come out only through `switch`, and a `switch` missing a case is a compile error ([7.1](#71-branching)). So the `.none` case cannot be forgotten, and an absent value cannot be touched.

Note: **There is exactly one shorter notation, `if name: = expression`** ("An `if` that binds an `Option`" in [7.1](#71-branching)); there is no `guard let`, `?.` or `??`.

```kspls
switch find(id)
case .some(u)
    use(u)
case .none {} // the absent case must be written too
```

### 3.5 Typedefs (`typedef`)

A typedef gives an existing type another name: to shorten a long one, or to give a hard-to-read function-pointer type a meaningful name.

* **Syntax**: `(pub | priv)? typedef NewTypeName = an existing type expression;`
* **The word is C's, the order is not.** The new name comes first. C's `typedef I32 Id;` is a syntax error whose note writes the line in this order.

#### 3.5.1 Visibility

A typedef carries a visibility like any other declaration ([9.4](#94-circular-imports-and-visibility)): `pub` (any file), `priv` (this file only), or nothing (this package).

```kspls
pub typedef Id = I32 // a public typedef
priv typedef Handler = fn(status: I32): Void // a function pointer limited to this file
```

**A typedef's visibility cannot be wider than that of any name on its right-hand side** (a compile error; the reason is in [`DESIGN.md`](DESIGN.md), "Why a typedef cannot be published wider than its target"). It goes through the check of "The visibility rules at positions where a value leaves" in [9.4](#94-circular-imports-and-visibility) (returns, fields, top-level declarations). That check walks inside the type expression: with `Hidden` `priv`, both `pub typedef A = Hidden;` and `pub typedef Cb = fn(h: Hidden);` are refused. A built-in type can be named from any file, so `pub typedef Id = I32;` is accepted.

**"Keep the implementation closed and publish only the name" is written on the type itself**: declare it `pub` under the public name, with no `pub` on its fields. A library's C interface then writes it, reached through a pointer, as a handle without its fields ([11.3](#113-exposing-a-kspl-function-to-c-export)).

#### 3.5.2 A typedef is only another name

A typedef is the same type as the type it names: a typedef and its type, or two typedefs of one type, stand in for each other everywhere with no diagnostic. **A type the compiler keeps apart from another is a struct with one field** (`struct User_id { v: I32 }`). Passing an `Order_id` where a `User_id` is needed is then an error, at no run-time cost.

```kspls
// 1. a typedef of a primitive type
typedef User_id = I32
raw: I32 = 10
uid: User_id = raw // the same type: nothing is reported

// 2. a typedef of a function-pointer type (useful for defining a callback's type)
typedef Callback = fn(status: I32): Void

// 3. a typedef of a generic type (filling in the type arguments to get a concrete type)
typedef String_map = Map<|U8[], I32|>
```

**A type's members are reached through its typedef as through the type itself**: a variant (`Tone.dark` after `typedef Tone = Shade`), a static function (`Nums.new(null)` after `typedef Nums = List<|I32|>`) and a struct literal (`Pt::{ .x = 1, .y = 2 }`).

**Typedefs may be written in any order, and one may name another** ([4.4.1](#441-top-level-variables)): the compiler follows a chain of typedefs to the underlying type.

```kspls
typedef App_id = Node_id
typedef Node_id = I32
// resolves correctly to I32 even with the definition order reversed
```

**A cycle cannot be written**: a typedef that leads back to itself, directly or through other typedefs, is a compile error (it never reaches an underlying type).

```kspls
typedef A = B // error: circular typedef: 'A' leads back to itself
typedef B = A // error: the same cycle
```

### 3.6 The expansion specification for string interpolation

`\{expression\}` inside a string writes the expression's value there. It is not text substitution. At compile time the string becomes **a chain of method calls on the write destination** `w`:

| Written in the string | Becomes |
| :-- | :-- |
| A run of characters | `w.s("...")` |
| `\{x\}` | `put(w, x)`: a free function in `std/lang` |
| `"Value: \{x\}"` | `put(w.s("Value: "), x)` |

The destination (the `Writer` from `io.out()`, a `Str_builder`, …) must therefore implement the `Writer` trait, which carries writing methods such as `s()`. Each interpolated value's type must implement the `Formattable` trait, which carries `fmt(w: Writer): Writer` (`Str_builder` implements both). A trait is a named set of methods a type promises to have ([5.1](#51-traits-trait)).

`put` returns the destination it was given, at its own type. So interpolation on a `Str_builder` keeps the concrete type and can chain `Str_builder`'s own methods (`b.s("n=\{n\}").slice()`). Do not use `Formattable.fmt`'s return value: called through the trait, it has collapsed to `Writer`.

The chain always begins with an `s(...)` on the destination; when `\{…\}` comes first, a step writing the empty string is inserted. Without that step, a destination held by value (the `b` of `$b: = Str_builder.new()`) would reach `put` as a copy, and `b`'s own length would not advance. Only a method's receiver takes an address implicitly.

**Interpolation pours into a Writer; it does not build a value.** It can be written only as an argument in a Writer chain (`io.out().s("...")` / `b.s("...")` / `w.s("...")`). In an assignment to a variable, or as an argument to a plain function, it is a compile error. Where it pours is always written in the source: out to a peer, into the caller's array, or into memory allocated and kept. For the string itself, keep it in an arena (a block of memory freed all at once, [8.4](#84-the-memory-management-model-defer--arc--arenas)) with `arena.text().s("...").take()`, or write into a `Str_builder` / `Buf_writer` and chain `.slice()`.

```kspls
import "std/io"
import "std/str" { Str_builder }

priv fn take(s: U8[])
    io.out().s(s)

n: = 7
io.out().s("n=\{n\}\n") // OK: a Writer chain
$b: = Str_builder.new()
defer b.free()
take(b.s("n=\{n\}").slice()) // OK: chain a slice when a value is needed
x: U8[] = "n=\{n\}" // error: it cannot build a value
take("n=\{n\}") // error: the same reason
```

#### 3.6.1 The default notation for primitives

Under `\{x\}`, a type with no hand-written `fmt` comes out as follows.

| Type | What comes out |
| :-- | :-- |
| `I8` `I16` `I32` `I64` `Sz` | Decimal, with a leading `-` when negative |
| `U8` `U16` `U32` `U64` | Decimal; `U8` too is **a number** ([3.1](#31-primitive-types)), written as a character by `\{b:c\}` |
| `Bool` | `true` / `false` |
| `F32` `F64` | **The shortest round trip**: the fewest digits that read back as the same value, with `.0` even for an integral value (`1.5` / `0.1` / `100.0` / `0.30000000000000004`). An `F32` is shortest at `F32`'s width (`0.1F32` gives `0.1`). Exponential below 10^-6 and at or above 10^21 (`1.5e-7` / `1e+21`; JSON's boundaries). `.N` fixes the digit count |
| `U8[]` (a string) | The contents as-is |
| `enum` | The variant's name (a hand-written `fmt` wins) |

**An unsigned value with its top bit set also comes out correctly in decimal** (`4294967295` for `U32`, `18446744073709551615` for `U64`). Unsigned arithmetic wraps `mod 2^N` ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)), so such a value can arise and must print.

**A format specifier does not change the answer**: `\{x\}` and `\{x:6\}` differ only in width, never in the number.

#### 3.6.2 Format specifiers

A format specifier controls how one value is written: its width, padding and base. It follows a `:` after the interpolated expression. Its shape is `[0]?[width]?[,]?[.precision]?[xX]?`, or `c` on its own: each item is optional, and the items that are written keep this order.

| Specifier | Effect | Applies to |
|---|---|---|
| A leading `0` | Zero padding (space padding without it), placed **inside** the sign (`-0042` / `-0003.50`) | Integers, floating point |
| A digit (for example `5`) | The minimum width; a value that does not fit is written whole | Integers, floating point |
| `,` | A comma every three digits (in the integer part only, for floating point) | Integers, floating point |
| `.N` (for example `.2`) | N digits after the decimal point (the digits of C's `%.Nf`; an exact half goes to even; N up to 19, and more is a compile error, since no more digits are written) | Floating point only (without it, the shortest round trip of [3.6.1](#361-the-default-notation-for-primitives)) |
| A trailing `x` / `X` | Hexadecimal (`X` gives `A`-`F`), with no `0x` | Integers only |
| `c` (on its own) | That one byte **as a character** | `U8` only |

Examples (notations, not a program):

```text
"\{n:02\}"       zero-padded width 2      e.g. 7 -> "07"
"\{n:5\}"        space-padded width 5     e.g. 7 -> "    7"
"\{big:,\}"      comma separated          e.g. 1234567 -> "1,234,567"
"\{pi:.2\}"      2 digits after the point e.g. 3.14159 -> "3.14"
"\{v:x\}"        hexadecimal (lower case) e.g. 0xDEADBEEF -> "deadbeef"
"\{v:X\}"        hexadecimal (upper case) e.g. 0xDEADBEEF -> "DEADBEEF"
"\{v:08x\}"      zero-padded width 8 + hexadecimal      e.g. 0xAF -> "000000af"
"\{pi:08.2\}"    zero-padded width 8 + 2 decimal digits e.g. 3.14159 -> "00003.14"
"\{b:c\}"        one byte as a character  e.g. 65 -> "A"
```

A specifier that breaks one of these rules is a compile error. Each specifier gets one error, the first thing wrong with it.

| Rule | Refused, for example | Why, or what to write instead |
| :-- | :-- | :-- |
| **The items go in the order above** (zero padding → width → comma → precision → `x`/`X`) | `\{n:.2,05\}`, reported as "`,05` cannot be read" | A discarded item would vanish without a trace (the reason [10](#10-compiler-directives-and-attributes) refuses an unknown attribute) |
| **Hexadecimal combines only with zero padding and width** | `,` or `.N` beside `x` | |
| **A `0` pads to a width**, so it needs a width after it | `\{n:0\}`, `\{n:0.2\}` | |
| A `:` needs a specifier after it | `\{n:\}` | |
| A character the shape does not read is named | `\{n:q\}`: "could not read 'q'" | |
| **`c` stands on its own** | A width, zero padding, `,` or `.N` beside `c` | |
| `c` is written only on a `U8` | `\{n:c\}` on an `I32` stops with `format spec: type 'I32' does not take 'c'` | Pass a multi-byte character as text (`U8[]`) |

**In hexadecimal too the width is a minimum** (as in C's `%x`): `\{v:2x\}` on `0xDEADBEEF` writes eight digits. Cutting to the low digits would silently change the value whenever the width was mistaken for the type.

**A signed integer in hexadecimal writes its type's bits as they are**: `-1` as an `I32` is `ffffffff`, not sixteen digits. `Sz`'s width changes with the target ([3.1](#31-primitive-types)), and so does its digit count.

Note: **For a `0x`, or a digit count fixed regardless of the type, use `strfmt.hex(v, digits)` from `std/strfmt`** ([`../std/README.md`](../std/README.md)).

**The width counts the display after rounding**: `\{x:1.1\}` on `9.99` gives `10.0`, including the digit rounding added.

**A file writing a specifier imports `std/strfmt`.** A specifier desugars (is rewritten by the compiler) to a method `std/strfmt` adds to the number types: `\{n:x\}` calls `n.fmt_hex(…)`. Such a method needs its file imported ("An extension method requires the import" in [9.3](#93-adding-a-method-to-another-files-type)). Without the import, the error names the item as written: `format spec: writing 'x' / 'X' calls 'fmt_hex' in 'std/strfmt', which this file does not import`. A plain `\{x\}` needs no import of its own: it calls `put` in `std/lang`.

The expansion runs before types are fixed, so an interpolation with a specifier becomes **a method call that does not look at the type**. Ordinary method resolution then picks the implementation, in four ways by what was written:

| What was written | Expands to | Implementing types |
|---|---|---|
| Width / `0` / `,` only | `value.fmt_spec(width, zero, comma)` | Integers, floating point |
| Contains `.N` | `value.fmt_prec(width, zero, comma, precision)` | Floating point only |
| Contains `x` / `X` | `value.fmt_hex(width, zero, upper)` | Integers only |
| `c` | `value.fmt_char()` | `U8` only |

**The methods are split per item so that a specifier with nothing to apply to is a compile error.** `\{n:.2\}` on an integer calls a method integers do not implement, and stops at the interpolation's position. One method taking every item as an argument would have to ignore `.2` silently.

## 4. Variables and constants

This chapter fixes how a value is given a name, and whether it can be read or written through that name.

**Unmarked is immutable, and `$` is written only where rewriting is allowed.** Where it goes, and the three terms every rule below uses, are in [4.2](#42-the-two-axes-of-mutability).

### 4.1 Declaration patterns

A name is given in two ways: a variable, whose value goes in at run time, and a `const`, whose value is fixed at translation time (when the program is compiled).

#### 4.1.1 The shape of a declaration

Declaring a variable needs no keyword such as `var`. The `:` right after the name marks a declaration (the same `name: Type` as a struct's field or a function's parameter), and the `=` marks the initial value. They are separate marks, hence the gap in `x: = 1;`.

Several variables can be declared at once, separated by `,`, each with its own initializer or type (`a: = 1, b: U8 = 2;` / `x: I32, y: I32;`). A C-style loop's first field uses the same shape (`for $i: = 0, $j: = 100; …`; the grounds are in [`docs/DESIGN.md` "One notation per purpose"](DESIGN.md)).

**The type annotation can be omitted only on a local variable and a local `const` inside a function.** The compiler then infers the type from the value. On a top-level declaration (`const` / a variable / an `extern` variable) it is mandatory. Omitting it is the compile error `top-level declaration '<name>' requires a type annotation` (the grounds are in [`docs/DESIGN.md` "Why type inference is limited to local variables"](DESIGN.md)).

```kspls
import "std/io"

fn main()
    x: = 2.5 // OK: a local variable is inferred as F64
    const n = 8 // OK: a local const is inferred too (I32)
    io.out().s("\{x\} \{n\}\n")

g: = 2.5 // error: a type annotation is mandatory at the top level
g_ok: F64 = 2.5 // OK
const top_n: Sz = 8 // OK
```

| Notation | Evaluated | Description |
| --- | --- | --- |
| `x: T = v;` / `x: = v;` | Run time | **The default**: `x = …` cannot put a different value back in later. Either the type annotation or the initializer suffices; omitting both is a compile error |
| `$x: T = v;` / `$x: = v;` | Run time | A `$` immediately before the name allows putting a value back in with `x = …`. It is **the only notation** for this |
| `const a = 0xff;` | Compile time | A constant whose value is fixed at compile time ([4.1.2](#412-const-compile-time-constants)) |

#### 4.1.2 `const` (compile-time constants)

A `const` is a constant whose value is fixed at compile time. The word `const` is mandatory, and it can be declared at the top level or inside a function.

Where the value is placed depends on where the `const` is declared:

| Declared | Placed in |
| :-- | :-- |
| At the top level (a string slice's contents included) | Memory that cannot be written: ROM, such as the `.rodata` section of the program file |
| Inside a function | The value itself goes on the stack (RAM) |

To decide the placement yourself, add the `#section` attribute ([10](#10-compiler-directives-and-attributes)).

**A `const` and a mutable mark ([4.2](#42-the-two-axes-of-mutability)) cannot be written together** (a compile error): a `const`'s contents are immutable, so the mark would be writable but ineffective.

```kspls
const ok: U8[] = "abc" // OK
const bad: U8$[] = "abc" // error: const 'bad' declares writable elements, ...
```

A `const` slice can be initialized only from a string literal, whose data is read-only too.

This check walks the `const`'s type, step by step, looking for a `$`:

* **Only the array and slice steps are walked**, nesting included, so an array of mutable slices (`const a: U8$[][4]`) is refused as well. A fixed-length array's element cannot carry a `$` at all ([4.2](#42-the-two-axes-of-mutability)), so any `$` this check meets is on a slice step.
* **It does not descend through a pointer.** What a pointer points at is a separate entity and may be in RAM. So `const p: I32$@ = ram_var@;` is legitimate: the pointer is in ROM, and what it points at is in RAM and rewritable.
* **It does not descend into a `struct`'s fields either.** A `const h: H` against `struct H { pub buf: U8$[]; }` is accepted. Whether a field can be written is decided by its holder (axis 1), so `h.buf[0] = 'X'` is refused at the use site as `cannot assign to immutable variable 'h'`.

### 4.2 The two axes of mutability

`$` can be written in two positions, and they answer two different questions. Before the name, it means "the value this name holds may be put back in". Inside the type, it means "what this value points at may be rewritten". The two are independent: either can be allowed alone, or both (`$p: I32$@`).

#### 4.2.1 Terms: the name, the value, what it points at

The rules of this chapter use three words, shown here for the declaration `p: I32$@ = n@;` (`p` holds the address of a variable `n`):

```mermaid
flowchart LR
    N["the name<br/>p"] -->|"holds"| V["the value<br/>n's address<br/>(put back in only with $p: axis 1)"]
    V -->|"points at"| W["what it points at<br/>the contents of n<br/>(written only with I32$@: axis 2)"]
```

| Term | What it refers to | In the example `p: I32$@ = n@;` |
| --- | --- | --- |
| **The name** | The identifier written in the source | `p` |
| **The value** (= that name's binding) | What that name holds right now: an integer, a whole struct, a pointer value, a slice descriptor (ptr+len) | `n`'s address |
| **What it points at** | What that value **points at as a separate place**: a pointer's referent, a slice's elements | The contents of the variable `n` |

**A binding is the tie between a name and the value it holds right now.** "The binding is immutable" means "a different value cannot be put back into that name". It does not mean that what it points at is frozen too. Conversely, a name whose target is immutable can still take a different pointer (given a `$`).

```
  $x: U8$[]
  ^     ^
  |     +--- axis 2: the $ inside the type … "what it points at, its elements" may be rewritten
  +--------- axis 1: the $ before the name … "the value x itself holds" may be put back in
```

1. **Axis 1 (the `$` before the name)**: `x: = 1;` cannot be put back in, `$x: = 1;` can. A parameter's name follows the same rule, and a by-value mutable receiver is written `$r: Self`. This axis also covers rewriting part of the value: assigning to a struct's field or to a fixed-length array's element, and calling a method that does either.
2. **Axis 2 (the `$` immediately before `[]` / `@`)**: the `T$[]` / `T$@` of §3.2, which allows writing to a pointer's referent and to a slice's elements.

**The list of combinations (when the name holds a *pointer or a slice*)**:

| Declaration | Putting a different value back into `p` | Writing to what it points at, or its elements |
| --- | --- | --- |
| `p: T@` / `p: T[]` | **No** | **No** |
| `$p: T@` / `$p: T[]` | Yes | **No** (the type decides this; a `$` before the name does not reach it) |
| `p: T$@` / `p: T$[]` | **No** | Yes |
| `$p: T$@` / `$p: T$[]` | Yes | Yes |

#### 4.2.2 The position of `$` differs between a fixed-length array and a slice

**A fixed-length array's elements are axis 1, and a slice's elements are axis 2.** A fixed-length array's elements are part of the array itself (like a struct's field). A slice's elements live apart from the descriptor (ptr+len).

| Notation | Meaning |
| --- | --- |
| `$a: U8[4]` | A fixed-length array whose elements can be written (and the whole array swapped out) |
| `a: U8[4]` | A fixed-length array whose elements cannot be written |
| `s: U8$[]` | A slice whose elements can be written **even though nothing can be put back into the name** |
| `a: U8$[4]` | **A compile error**: a type-side `$` cannot be written on a fixed-length array's element |

An array is copied when passed, so its permission can sit on the name. A slice or a pointer passes the caller's own elements, so its permission has to travel in the type.

When a struct's field is a fixed-length array, **the receiver** decides whether its elements can be written, as for any other field: with `fn m(r: Self$@)` they can, with `fn m(r: Self@)` they cannot. An enum payload's fixed-length array is the same: the binding holding the enum decides, so a mutable one can be assigned a whole new value.

**A copy of a fixed-length array as a value does not ask about the elements' immutability.** An array is always duplicated on argument passing and assignment, so the destination's name decides whether the copy's elements can be written. A `U8[4]` value can go into a `$dst: U8[4]`. What the elements point at (a `T@` element's target) is still matched: relaxing that would let a read-only pointer move into an array of mutable pointers.

### 4.3 Places, and the rules for when they may be written

A **place** is an expression referring to where a value is, roughly what C calls an lvalue. Only these four expressions make a place; anything else (a call's return value, an arithmetic result, a literal, a compound literal) does not.

| Expression | The place it refers to |
| --- | --- |
| A name `x` | The value that binding holds |
| `x.f` | A field inside the receiver's place |
| `x[i]` | An element inside the receiver's place: a fixed-length array's, or that of a type implementing `Index_place` / `Index_ref`, as `std/lang`'s slice `Slice<\|$T\|>` does (§6.1) |
| `p$` | What a pointer points at |

**Three operations touch a place, and the same three rules decide all three.**

```mermaid
flowchart LR
    W["write<br/>place = value"] --> R
    A["take a mutable pointer<br/>place@ passed to a T$@"] --> R
    M["call a rewriting method<br/>place.m(), m takes Self$@"] --> R
    R{"the same three rules:<br/>the path, the root,<br/>the step's type"} -->|"all hold"| OK["allowed"]
    R -->|"one fails"| NO["compile error"]
```

| Operation | Notation |
| --- | --- |
| Write | `place = value` |
| Take as a mutable pointer | Pass `place@` to a `T$@` position |
| Call a method that rewrites the value | `place.m()` (where `m` takes `Self$@`) |

| Rule | Content |
| --- | --- |
| **The path** | No read-only pointer (`T@`) is crossed on the way to the place. **A shape whose type cannot be walked counts as crossed too**: defaulting to allow would leave a hole wherever the permission drops along the path |
| **The root** | The root binding, reached without crossing a pointer or a slice, is mutable (`$x`). Where one is crossed, what gets rewritten is what it points at, not the binding, so this rule does not apply |
| **The step's type** | The type of the step being touched is not immutability-qualified (`T$[]` for an element, `T$@` for what it points at) |

Caution: **The three operations must not reach conflicting conclusions.** Blocking only one leaves the others as escape routes: an assignment is refused but the address taken, or `cs.n = 9` is refused but `cs.bump()` let through. A new operation that touches a place applies these three rules as they are.

**Context does not change the answer.** Whether a place can be written is decided by the expression's shape and type alone. Its position (left-hand side or argument) and the expected type play no part.

#### 4.3.1 The mutability of taking an address `x@` is fixed by `x`'s declaration alone

`x@` is a mutable pointer (`T$@`) **only when there is a `$` before the name `x`**. `x@` points at the variable `x` itself, so the "Putting a different value back into `p`" column of the list above applies. Relaxing this would let an output argument (a pointer parameter the function writes its result through) rewrite an immutable variable.

```kspls
priv fn f(p: Sz$@)
    p$ += 1

n: Sz = 0
f(n@) // error: it cannot be passed to f(p: Sz$@)
$m: Sz = 0
f(m@) // OK
```

* **The expected type at the position has no influence**: the address of a read-only element is always a read-only pointer, and cannot be passed where a mutable pointer is needed.

  ```kspls
  const ro: U8[4] = ::{ 1, 2, 3, 4 }
  priv fn writes(p: U8$@)
      p$ = 9

  writes(ro[0]@) // error: expected 'U8$@', but got 'U8@'
  ```

* **A pointer and a slice are no exception.** The `s@` of `s: U8[]` is a `U8[]@` and cannot be passed to an output argument (`f(out: U8[]$@)`). A type-side `$` answers only whether what it points at, or its elements, can be written.
* Conversely, the `p@` of `$p: I32@` may be an `I32@$@`: what gets rewritten is the pointer value `p` holds, not what that points at.
* Demoting mutable to immutable (`T$@` → `T@`; [6.4](#64-type-conversion--and-implicit-casts)) holds across a typedef too (`M$@` → `M@`, with `typedef M = I32`).

#### 4.3.2 The path to a write destination is checked all the way

A write is allowed only when **every step** on the path there allows writing. What each step rewrites differs:

| Step | What gets rewritten | Requirement |
| --- | --- | --- |
| `p$ = v` | What it points at | `p` is a mutable pointer (`T$@`) |
| `p.f = v` | A field of what it points at | The same (if `p` is a value, a `$` before the name) |
| `p[i] = v` | **An element** | For a slice, the elements are mutable (`T$[]`), whatever the descriptor's mutability: the elements of a `U8$[]@` (an immutable pointer to a mutable slice) can be written. For a fixed-length array, the root binding is mutable (`$a`; `T$[N]` cannot be written, [4.2](#42-the-two-axes-of-mutability)) |
| `(p + i)$ = v` | What it points at | `p` is a mutable pointer: pointer arithmetic does not descend a step, so it keeps `p`'s permission |

```kspls
$buf: U8[4] = ::{ 1, 2, 3, 4 }
mut_view: = U8$[]::buf
imm_view: = U8[]::buf
const ro: U8[4] = ::{ 1, 2, 3, 4 }
pm: U8$[]@ = mut_view@
pm[3] = 'W' // OK: the elements are mutable
pi: U8[]@ = imm_view@
pi[0] = 'Z' // error: the elements are immutable
p: U8@ = ro[0]@
(p + 1)$ = 9 // error: what it points at is immutable
```

* A write through an immutable `T@` is refused as `cannot write through a read-only pointer (use '$@' to allow writing through it)`. A write through an immutable `T[]` is refused as `cannot write to an element of a read-only slice or array (use '$[]' to allow writing to elements)`.
* **A fixed-size array's elements are written with the permission of the path that reaches them.** They are part of the value that holds them, so across a read-only pointer they cannot be written: a method holding `r: Self@` (the promise not to write) cannot rewrite an array field's elements. A slice (`T$[]`) or a pointer refers to a different object, so its own `$` decides, as `pm[3]` above shows: a `U8$[]` field can be written through `r: Self@`.
* **A mutable mark takes effect only on the step it was written on** (an unmarked step is read-only), so each step of nested view types is given independently:

| Type | Meaning | `p$ = other_slice;` (swapping the descriptor) | `p[0] = v;` (writing to an element) |
| --- | --- | --- | --- |
| `U8$[]$@` | A mutable pointer to a mutable slice | Yes | Yes |
| `U8[]$@` | A mutable pointer to a slice of **immutable elements** | Yes | No |
| `U8$[]@` | An **immutable pointer** to a mutable slice (the descriptor is read-only) | **No** | Yes |
| `U8[]@` | Both read-only | No | No |

#### 4.3.3 The same rule applies to method calls

A method's receiver is the value it is called on. An `impl`'s receiver is written `r: Self@` for reads only and `r: Self$@` to update fields ([5.2](#52-implementations-impl-and-receivers)).

**A method taking `Self$@` implicitly takes the receiver's address**, so it cannot be called on a read-only place. A method that takes `Self@` has declared that it does not write, so it can.

```kspls
struct Box
    n: I32
impl Box
    fn bump(r: Self$@)
        r.n += 1
    fn peek(r: Self@): I32
        return r.n

const cs: Box = ::{ .n = 1 }
cs.bump() // error (bump takes Self$@)
cs.peek() // OK (peek takes Self@)
```

**If the receiver is a value (neither a pointer nor a slice), a `$` is needed before the name.** A `Self$@` call rewrites that value itself: the same rule as `v.f = x` needing a `$v`.

```kspls
$b: = Str_builder.new() // ← the '$' is needed
b.s("hello") // s() takes Self$@ and rewrites b's contents

p: Builder$@ = b@
p.s("world") // OK: what gets rewritten is what it points at. '$p' is not needed
```

So a reader can tell whether a variable can change from its `$` alone. The lint [I0601] (an unnecessary `$`) judges by the same rule, so it does not report the `$` of a name on which a mutable method is called. A lint is a check `ksplc lint` runs for code that is legal but worth a second look.

#### 4.3.4 Stripping immutability with an explicit cast

A cast to a mutable pointer, `T$@::(...)`, strips immutability and allows writing through that pointer. The need is real at the boundary with a machine register or an external API, and writing `::` is itself the statement of intent.

Only the binding's immutability can be stripped. A mutable slice or pointer cannot be made from memory that is itself read-only (a `const` declaration, a string literal). Writing there would make the generated C rewrite `.rodata` (ROM on a freestanding target, one with no operating system) and fail with no diagnostic. So the compiler stops it as `cannot cast a 'const' declaration to the mutable slice type`.

**Put a `$` on an array a mutable view is made from.** The `U8$[]::buf` of `$buf: U8[64]` is accepted. Drop the `$` and the generated C declaration gains a `const`, so the same cast points at read-only memory. [I0601] counts this `$` as in use, though the write goes through the view and never rewrites the name.

### 4.4 Initialization rules and definite initialization

The initialization rules differ with where a variable is declared:

| Declared | Without an initializer | What an initializer may be |
| :-- | :-- | :-- |
| At the top level ([4.4.1](#441-top-level-variables)) | Filled with zeros at program start | Only a value fixed at compile time |
| Inside a block ([4.4.2](#442-local-variables)) | Allowed, but it must be assigned on every path before it is read | Any expression |

#### 4.4.1 Top-level variables

**Without an initializer, a top-level (global) variable is zero-initialized** at program start, as in C's BSS section (the part of a program's memory the loader fills with zeros). The variable sits in static memory, so an initializer must have a value fixed at compile time. A run-time computation (a function call, reading another variable, dereferencing a pointer) is refused as `top-level variable initializer is not a compile-time constant`. For run-time initialization, call an initialization function from `main`.

**Top-level declarations are not bound by their order.** KSPL compiles in several passes, so code can refer to a function, type or constant defined later in the file. An initializer or an array's length may refer to a `const` declared later in the same file (so may `sizeof`; [6.7](#67-built-in-operators)). Only constants referring to each other are refused, as `circular constant definition detected`.

**The order of initialization is not observable.** Every initializer is computed at compile time, and can read only a `const` or an address, never another top-level variable's value (the error above). An address does not depend on the order. So no expression can depend on which variable was initialized first. There is no counterpart to C++'s static initialization order problem, where one global's start-up code reads another global not yet set up.

```kspls
const base: I32 = 3
struct Config
    n: I32
fn compute(): Sz
    return 8

count: I32 = base + 4 // OK: settled at compile time
buffer: U8[64] // OK: zero-initialized
table: Config = ::{ .n = 1 } // OK: every element of the compound literal is constant
cursor: U8@ = null // OK
first: U8@ = buffer@ // OK: taking an address is constant (C's "address constant")
word_size: Sz = sizeof(I32) // OK: sizeof is settled at compile time

alias_of_count: I32 = count // error: reading a variable is not constant
computed: Sz = compute() // error: a function call is not constant
```

A `const` names the value itself and has no address; a top-level variable has memory. Both compute their initializer at compile time.

**Zero initialization does not ask what is inside the type.** Even a type with invisible fields ("Visibility" in [3.3](#33-structs-struct)) is filled with zeros, and its author cannot stop this. A type that cannot be built with `::{ ... }` ([6.6.3](#663-what-a-literal-cannot-build)) can still have a place declared for it. A zero appears in three shapes:

* A top-level binding with no initializer (`priv $g: sync.Mutex;`)
* An array or slice literal (`$slots: Rc<|Conn|>[8] = ::{};`, and any element left unfilled)
* A struct literal omitting visible fields (when something invisible sits **inside** such a field)

That is what allocating memory is. Where there is no allocator, the standard shape is to declare `priv $g: sync.Mutex;` and call `g.init()` at startup. The zero value of an ARC handle (`Rc` / `Arc`, a reference-counted pointer, [8.4](#84-the-memory-management-model-defer--arc--arenas)) is a defined state, "owning nothing". `std/ds`'s containers use it as an empty slot: letting an element go assigns the zero value. Zero filling can break only an invariant the type sets for itself (a condition its own code relies on always holding).

Caution: **A type holding an invariant must therefore express the "not yet opened" state in its own API.** Publish `init`, and define the state until it is called. The type can be called in the zero state, and only the type can tell its user that it cannot be used until opened.

A local binding needs no such defense: definite initialization ([4.4.2](#442-local-variables)) refuses a read before a value goes in. Only the top level cannot be defended.

#### 4.4.2 Local variables

**A variable inside a block need not be initialized at its declaration, but must be initialized on every execution path before the value might be read** (definite initialization). The compiler follows every path through the code, and any possible use before initialization is a compile error. A declaration split from its initialization needs a `$` before the name, because the value is put in later (§4.2).

```kspls
import "std/io"

const pi: F64 = 3.14159 // a compile-time constant
global_count: I32 // a top-level variable is implicitly initialized to 0

fn main()
    $x: I32, $y: I32 // uninitialized. `$` is needed because it is assigned later. The type annotation goes on each variable

    io.out().s("\{x\}\n") // error: 'x' is read before it is initialized

    x = 10
    y = 20
    io.out().s("\{x + y\}\n") // OK
```

### 4.5 Scope and shadowing

A name declared inside a block is visible only inside that block (its scope). Declaring the same name again in an inner block hides the outer one there; this is shadowing, and it is allowed. **Redeclaring a variable within the same scope is a compile error**, which prevents overwriting a variable by accident.

```kspls
x: = "10" // x is U8[]
x: = x.len // error: redeclaring a variable within the same scope is forbidden

// the inner scope carries a label — a block with no heading cannot be told from a
// continuation of the line above, so a bare one is writable in neither notation
inner:
    x: = x.len // OK: shadowing in an inner scope is allowed
```

**A local or a parameter named like a module the file imports hides that module the same way**, for the rest of its scope. Below `io: = 5`, `io.out()` reads the local, since a module's member and a value's are both reached with `.`. It stays legal, and gets a warning at its declaration (`ksplc explain W0502`). A name the file does not bind as a module is free: `import "std/mem" { Arena }` binds `Arena` alone.

### 4.6 Embedding resources

`embed "file path" as identifier;` reads an external binary file at compile time and defines it as a read-only byte array (`U8[]`). The file's bytes become part of the program, so it needs no file at run time.

```kspls
// defines a U8[] holding icon.png's contents (a constant array inside), from the assets/ beside this file
embed "./assets/icon.png" as icon
// a package's file, found wherever the package stands
embed "mylib/data/table.bin" as table
```

**The file is found the way an import's is**: by the three rules of [9.1](#91-import-syntax-and-path-resolution), and within the same `uses` limit (a reach past it is a compile error at the `embed`). The one difference is that nothing is added to the name, since an embedded file spells its own extension. It is never the folder the compiler runs in (the grounds are in [`docs/DESIGN.md` "A package names itself, and names what it uses"](DESIGN.md)).

---

## 5. Implementations and traits

KSPL has no classes and no inheritance. `impl` attaches functions to a type, and `trait` names a behaviour that several types share, so code can accept "any type that can do this".

This chapter uses five words throughout.

| Word | What it is | The nearest thing in other languages |
| :-- | :-- | :-- |
| **method** | A function attached to a type, called as `value.name(…)` | A method of a class |
| **receiver** | The value a method acts on, written as its first parameter (`r`) | Python's `self`, JavaScript's `this` |
| **`impl` block** | A block that attaches methods to one type | The body of a class |
| **`trait`** | A list of methods a type must have to join a group | An interface in Java or TypeScript |
| **trait value** | A value whose type is a trait: the address of a concrete value, paired with a table of that type's methods | A variable whose type is an interface |

### 5.1 Traits (`trait`)

A trait lists the methods a type must have: each one's name, parameter types and return type. A type that has them all *conforms* to the trait.

A method whose first parameter is a receiver is called on a value. A method with no receiver is called on the type itself. No parameter's type can be left out, the receiver's included.

**The receiver is written as a bare `Self`. `Self@` / `Self$@` are compile errors** (§5.3; the grounds are in [`docs/DESIGN.md` "Why a trait's receiver is fixed to a bare `Self`"](DESIGN.md)). `Self` stands for whichever type implements the trait; that implementation decides whether it receives a copy or a pointer (§5.3). To return one's own type so that calls can be chained, use `Self` as the return type (`std/io`'s `Writer` has this shape).

```kspls
trait Drawable
    fn draw(r: Self)
    fn is_visible(r: Self): Bool
```

**A method can have a default body.** Write a body in place of the `;`, and each implementation that does not write that method gets a copy of the body. An implementation that writes a method of the same name uses its own instead.

The copy sits inside the `impl` block, so `Self` and the `impl`'s own type parameters mean there what they mean in the rest of that block. The trait's type parameters are replaced by the type arguments the `impl` wrote. If `impl<|X, Y|> Pair<|X, Y|>: Seqish<|Y|>` implements `trait Seqish<|E|>`, the `E` inside the body is `Y`.

**A method with a default body holds no slot in a trait value's table.** A call through a trait value looks the method up in that table, so such a call is a compile error. Call the method on a concrete type instead, or through a type parameter bound by the trait (`<|T: Seqish<|E|>|>`).

```kspls
trait Seqish<|E|>
    fn head(r: Self): E?
    fn head_or(r: Self, alt: E): E // a default body. It may call a declaration-only method
        if v: = r.head()
            return v
        return alt
```

**State the visibility on a method called from outside the package** (`pub fn head_or(…) { … }`). Copied into an `impl`'s block, an unmarked default body takes that block's default visibility, which is "inside the package". A call from outside is then the compile error `cannot access symbol`, reported at the call.

**A copied body does not become wider than the type that implemented it**: a `priv` type inheriting a `pub` default body reaches only as far as that type does ("Visibility" in [3.3](#33-structs-struct)).

**A method including `Self` as a type argument in its return cannot be implemented** (`fn chain(r: Self): Wrap<|Self|>`; the error stands at each `impl`). Two reasons close both routes:

* **Without a body**, the method needs a slot in the table, and that slot's type would differ from one implementation to the next.
* **With a default body**, there is no slot, but the body could not be copied into a generic implementation, where `Self` is not yet a known type.

Write such a chaining method separately on each type.

Do not confuse this with a method that returns `Self` itself. That one is accepted when the implementation returns a pointer (`Self$@`; §5.3), so its fix is the opposite, and its error has different wording.

**A method's visibility**: each method inherits the `trait`'s own visibility, and `pub` / `priv` written before it takes precedence (never wider than the `trait`). A `struct`'s fields, by contrast, do not inherit ("Visibility" in [3.3](#33-structs-struct)).

The visibility controls calls through a trait value. It plays no part in checking that a type conforms, so the conforming `impl` chooses its methods' visibility independently. This makes one shape possible: a published trait whose methods only the compiler or the declaring file calls (the shape of §8.4.2's `Ref_counted`).

```kspls
pub trait Ref_counted
    priv fn retain(r: Self) // the type name is public, but only the declaring file can write a call
    priv fn release(r: Self) // (only the calls the compiler inserts reach it)
```

### 5.2 Implementations (`impl`) and receivers

`impl TargetType` attaches methods to a type. `impl TargetType: Trait` does the same and also declares that the type has every method the trait requires. Inside the block, **`Self`** is another name for the target type.

**Only the original value type can be written as an `impl`'s target** (`U8` / `Vector` / `U8[]` and so on). An `impl` directly on a pointer type (`@` / `$@`) is a compile error. A slice may carry the mark: `impl U8$[]` attaches to the mutable instantiation ([9.3](#93-adding-a-method-to-another-files-type)).

**How the receiver is written decides two things, and nothing else does**: whether the method gets a copy of the value or a pointer to it, and whether it may change what it gets. These are the two axes of [4.2](#42-the-two-axes-of-mutability), applied as they are: a `$` before the name lets the name take a new value, and a `$` before `@` lets the method write to what the pointer points at.

| Receiver | How it is received | Rebinding `r` | Writing to what it points at, or to the copy |
| --- | --- | --- | --- |
| `r: Self` | A copy of the value | No | No |
| `$r: Self` | A copy of the value | Yes | Yes (the copy only) |
| `r: Self@` | A pointer | No | No |
| `r: Self$@` | A pointer | No | **Yes** (the most common shape of an updating method) |
| `$r: Self@` | A pointer | Yes (a different pointer) | No |

**The call of a method whose receiver is taken by pointer (`Self@` / `Self$@`) implicitly takes an address.** A pointer is passed as it is. A value (a `struct` or a slice) gets the equivalent of `&` added for you. Whether a value that has no variable can be the receiver depends on whether the method declared that it writes:

| The receiver | A call's result, a literal, a computed value as receiver | Why |
| :-- | :-- | :-- |
| `Self@` (reads only) | **Accepted** (`f().m()` / `xs.where(p).to_list(a)`) | The compiler places a copy in an automatic variable in the call's block and passes its address. Its lifetime is the same as writing `x: = f(); x.m();`, and nothing is allocated on the heap ("When a temporary can be the receiver" in [`DESIGN.md`](DESIGN.md)) |
| `Self$@` (writes) | **Refused** (`cannot call a method that writes its receiver`) | The write would go to a copy that is thrown away, so `make_point().set_n(5)` would do nothing |

**The dividing line is "does it write the receiver's own memory", not whether `Self` is mutable.** `impl U8$[]`'s `fill(r: Self@, …)` is accepted because its receiver is `Self@`. Its write reaches the bytes the slice points at, not the slice's descriptor (the pointer and length pair). Only the descriptor is copied, so `buf.sub_mut(0, 4).fill(0)` does fill the caller's memory.

A function whose first parameter has nothing to do with its own type takes no receiver. It is a *static function*, called on the type (`Vector.new(1, 2)`).

Named through its type without a call (`Vector.length_sq`), a method is a function value whose first parameter is the receiver ([8.1](#81-definitions)).

**Visibility**: a function inside an `impl` block is closed to the package by default. Put `pub` on each one callable from outside the package; it cannot be wider than the target type ("Visibility" in [3.3](#33-structs-struct)).

There are two kinds of implementation.

1. **An inherent implementation**: methods are added to the type directly.

```kspls
pub struct Vector
    x: F32
    y: F32

impl Vector
    // a constructor (a static method)
    pub fn new(x: F32, y: F32): Vector
        return Vector::{ .x = x, .y = y }

    // a method (using automatic dereferencing via dot access)
    pub fn length_sq(r: Self@): F32
        return r.x * r.x + r.y * r.y
```

2. **A trait implementation**: written `impl Type: Trait`.

```kspls
impl Vector: Drawable
    fn draw(r: Self@) {
        // the drawing work
    }
    fn is_visible(r: Vector@): Bool
        // received as an immutable reference
        return true
```

### 5.3 Checking trait conformance

For `impl Type: Trait`, the compiler checks that the type has every method the trait requires, with matching parameters and returns. The table says what has to match.

| What is compared | What must hold | Why |
| :-- | :-- | :-- |
| **The method** | It is present and takes the same number of parameters, the receiver included | - |
| **Each parameter after the receiver** | The same type. `Self` is compared after being replaced by the target type | By value and by pointer (`@`) differ, since these arguments are not converted at the call |
| **The return type** | The same underlying type. A value against a pointer is allowed | - |
| **A return of `Self`** | The implementation returns a pointer (`Self$@`); anything else is a compile error | Below |

**When the return is `Self`, the implementation returns a pointer** (`Self$@`; a compile error otherwise), as every implementation of `std/io`'s `Writer` does. A call through a trait value goes through a *thunk*: a small intermediary function the compiler inserts between the trait value and the implementation. The thunk repacks the return into a trait value, and a trait value needs an address that stays valid. A returned value would leave it pointing at a temporary, and keeping the value in a lasting place would cost a hidden allocation, which the language rules out. To return one's own type by value, express it with a type argument instead of `Self` (the shape of `trait Cast<|Output|>`).

**The trait still writes a bare `Self`** (`Self@` / `Self$@` cannot be written), because the caller receives a trait value (`Writer`), not a pointer. Receiving it as a concrete type's pointer is a type error. The grounds are those for the receiver ([`docs/DESIGN.md` "Why a trait's receiver is fixed to a bare `Self`"](DESIGN.md)).

**The implementation can receive the receiver in any shape**, though the trait writes a bare `Self` ([5.1](#51-traits-trait)). A method declared `r: Self` may be implemented with `r: Self$@` and rewrite the receiver. The change reaches the caller's object, because the thunk converts between value and pointer when the method is called through the trait.

The diagram shows a call through a trait value. The trait value carries the object's address, so the implementation can reach the original object.

```mermaid
flowchart LR
    CALL["b.bump()<br/>(b is a trait value)"] --> TV["trait value:<br/>the object's address<br/>+ the table of methods"]
    TV --> TH["thunk<br/>(inserted by the compiler)"]
    TH -->|"passes the address"| IMPL["impl C: bump(r: Self$@)"]
    IMPL -->|"r.n += 1"| OBJ["the caller's object"]
```

**`Self` cannot be written on a parameter other than the receiver** (a compile error). The thunk does not convert an ordinary argument, so the trait value would be passed straight to a position expecting the implementation's concrete type. To receive one's own type, use a type argument (`trait Eq<|Other|> { fn eq(r: Self, other: Other): Bool; }`).

As a result, **a trait cannot declare that "this method does not rewrite the caller's object"**. A trait value points at the object itself, not at a copy, so `r: Self` in the trait does not mean a copy is passed. Only the implementation's receiver shape decides whether the caller's object gets rewritten.

```kspls
trait Bumpable
    fn bump(r: Self) // it looks like a value receiver, but…
impl C: Bumpable
    pub fn bump(r: Self$@)
        r.n += 1 // if the implementation rewrites, it reaches the original
```

To guarantee by type that nothing is written, call the concrete type's method directly, with the receiver `r: Self@`, instead of going through the trait (why, and how other languages handle it: [`docs/DESIGN.md` "Why a trait's receiver is fixed to a bare `Self`"](DESIGN.md)).

On a generic trait (such as `Add<|Rhs, Output|>`), a type argument not yet fixed at this check is left out of the comparison, so nothing is wrongly called non-conforming.

**Marker traits (a `trait` with no methods)** mark that a type "has a certain property". Conformance is declared with an empty body, `impl Type: Marker {}`. The generic constraint `<|T: Marker|>` then makes passing a type without the property a compile error. There is no run-time cost: the conformance is used only in type checking.

### 5.4 Worked example: forbidding copies with `Move_only`

Some values must never be copied, such as a handle to an operating-system lock. The standard library's marker trait `Move_only` marks such a type. When a binding of a conforming type is passed elsewhere **as a value**, the compiler treats it as a *move*: the value goes to its new place, and the original binding cannot be used from then on.

```kspls
import "std/thread"

$mx: = thread.Mutex<|I32|>.new(0) catch
    return
copy: = mx // a move (Mutex<|T|> holds a Move_only Raw_mutex by value)
mx.free() // error: 'mx' was moved out of and cannot be used again
```

A binding of a `Move_only` type moves between two states:

```mermaid
stateDiagram-v2
    [*] --> Usable: declared with a value
    Usable --> Moved: passed elsewhere as a value
    Moved --> Usable: assigned a new value (mx = ...)
    Usable --> Usable: read as a receiver, @, $ or [i]
```

* **What it is for**: an owning handle that would be freed twice if it were duplicated. `thread.Mutex<|T|>` is a value type holding one OS lock handle. Two copies could both call `free()` and destroy the same OS object twice (a *double free*).
* **Reads that are not moves**: a method's or field's receiver (`mx.lock()`, `mx.h`), and the target of taking an address, dereferencing, or indexing (`mx@`, `p$`, `a[i]`). None duplicates the value, so ownership does not move. To lend the value without moving it, pass a pointer with `@`.
* **Revival**: assigning a different value back into the binding (`mx = ...`) makes it usable again.
* **Structural derivation**: a type with no explicit `impl` is still `Move_only` if even one part of its value is, since copying it causes the same double free. The parts that count are listed below. Pointers and slices are not walked: they are borrowed views, not owning handles, and copying one adds no responsibility to free.

  | The type | The parts that count |
  | :-- | :-- |
  | A `struct` | Its fields |
  | An `enum` | The payloads of all its variants |
  | An array | Its elements |
  | A Result (`T!E`) | The success value. `Handle!E` moves as `Handle?` does; the error side is an error enum's tag |

* **The limit**: paths across branches and loops are tracked, but duplication by way of a pointer (writing `p$` elsewhere, and the like) is not detected. With no tracking of how long a borrow lives, the check is not *sound*: passing it does not prove that no copy exists.

Only `std.Move_only` **itself** is derived structurally. A trait of the same name declared in your own file needs an explicit `impl`, like any ordinary trait (as with `Ref_counted`; §8.4.2).

**The type system places no constraint on values crossing a thread boundary.** Nothing is required of the `T` of `thread.Thread.spawn<|T|>`. So these all compile:

* code touching a single-thread-only `Rc<|T|>` (a reference count that is not atomic) from several threads;
* code passing a type that holds a raw pointer to another thread;
* code rewriting a top-level variable (a global) from several threads.

Such a *data race* (two threads touching the same memory at once, at least one of them writing) is undefined ([14.2](#142-undefined---no-answer-is-fixed)). There is no marker like Rust's `Send` / `Sync`, which mark the types allowed to cross threads; the means of preventing races, and the grounds, are in `docs/DESIGN.md` "Why data races are not prevented by the type system".

### 5.5 Worked example: synthesizing a field table with `Reflectable`

Declare that a type conforms to `std/reflect`'s `Reflectable` with an **empty body**, and the compiler writes a description of the type's fields for you. Code such as a JSON reader can then walk the fields by name at run time.

The compiler builds two things from the type's declaration: a field table (a `const` of `Field_info`: each field's name, offset and kind) and the body of `fields()`. `std/json`'s `from_struct` / `into_struct` and `ksbind/db`'s `bind_row` / `read_row` walk it ([`docs/DESIGN.md` "Why the round trip between a container and an external form is a trait returning a table"](DESIGN.md)).

```kspls
import "std/ds" { List }
import "std/reflect"

priv struct Metrics
    compile_ms: I64
    peak_bytes: I64
priv struct Baseline
    label: U8[]?
    cold: Metrics
    runs: List<|Metrics|>
impl Baseline: reflect.Reflectable {} // the compiler assembles the table and fields() (nesting and containers included)
```

* **A key is the field's name itself**; nothing maps it to a different spelling.
* **The types covered are the integers (`I8` / `I16` / `I32` / `I64` / `U8` / `U16` / `U32` / `U64` / `Sz`), `F32` / `F64` / `Bool` / `U8[]`, and a nested `struct` built from them.** So are their `List<|T|>` and `T?`. In JSON they take these shapes:

  | Field type | In JSON |
  | :-- | :-- |
  | A nested `struct` | A nested object (`{"cold":{"ms":1}}`; keys are not flattened) |
  | `List<\|T\|>` | An array |
  | `T?` | `.none` writes no key. An absent key reads as `.none`, and an explicit `null` is refused as a kind mismatch |

  * A type holding any other field **is a compile error naming that field**; the field is never silently dropped from the table. Nested and contained types alike are checked: a container of containers (`List<|List<|T|>|>`), an option whose contents are a container or an option, a non-`struct` type and a generic type are all refused.
* **Nothing is synthesized on an `impl` with a body written**: write `fields()` yourself to change the key mapping or to hold a type not covered (the same treatment as `variant_name`; [3.4](#34-enums-enum)).
* **Conformance is matched by fully qualified name** (the trait's full path, `std.reflect.Reflectable`): a `trait Reflectable` declared in your own file does not make derivation work (the same reason as `Ref_counted`; [`docs/DESIGN.md` "Why compiler-known traits are confined to `std/lang`"](DESIGN.md)).
## 6. Expressions and operators

An expression is anything that produces a value, such as `a + b` or `f(x)`. This chapter fixes the operators and how strongly they bind ([6.1](#61-the-operator-list-and-precedence)), pointers ([6.2](#62-pointer-arithmetic-and-implicit-dereferencing)), type conversion ([6.4](#64-type-conversion--and-implicit-casts)), how a value is assembled ([6.6](#66-initialization-and-construction)) and what integer arithmetic answers ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)). Assignment is a statement, not an expression, so it is not in the precedence table ([6.5](#65-assignment-and-compound-assignment)).

### 6.1 The operator list and precedence

The table lists every operator and how tightly it binds (its *precedence*). A smaller number binds more tightly, so `a + b * c` is `a + (b * c)`.

| Precedence | Operators | Description | Associativity |
| --- | --- | --- | --- |
| **1 (high)** | `.`, `[]`, `()`, `@`, `$`, `!` | Member, index, call, take an address, dereference, error propagation | Left |
| **2** | `!`, `~`, `-`, `sizeof`, `offsetof`, `Type::expr` | Logical not, bitwise not, negation, take a size, take a position, type cast (prefix) | Right |
| **3** | `*`, `/`, `%`, `&`, `<<`, `>>` | Multiply and divide, remainder, **bitwise and**, shift | Left |
| **4** | `+`, `-`, `\|`, `^` | Add and subtract, **bitwise or / xor** | Left |
| **5** | `==`, `!=`, `<`, `<=`, `>`, `>=` | Comparison | Left |
| **6** | `&&` | Logical and | Left |
| **7** | `\|\|` | Logical or | Left |
| **8** | `catch` | Catch an error and put a value in its place | Cannot be chained |
| **9 (low)** | `if else` | **The ternary operator** | Right |

Some strengths differ from C. `&` binds more tightly than `+` (it sits with `*`), the other way round from C. **`&` `|` `^` bind more tightly than comparison, the reverse of C**:

| Text | KSPL reads it as | C reads it as |
| :-- | :-- | :-- |
| `a & b == c` | `(a & b) == c` | `a & (b == c)` |
| `6 & 4 == 4` | true | false |

The same text compiles in both languages and only the answer changes. Neither the type nor a run-time check catches it, so write the grouping with parentheses. The check is [W0108] in the development tools specification.

**`Bool` has no arithmetic and no shifts.** An operator outside the allowed list is refused at translation time (when the compiler reads the program) if an operand is `Bool`.

| Operators | On a `Bool` |
| :-- | :-- |
| `!`, `&&` `\|\|` (short-circuiting: the right side runs only when needed) | Allowed |
| `&` `\|` `^` (not short-circuiting) | Allowed |
| `==` `!=` `<` `<=` `>` `>=` (`false < true`) | Allowed |
| `+` `-` `*` `/` `%` `<<` `>>`, unary `-` `~` | Refused |

To count a `Bool` as a number, convert it first with `I32::flag`. Allowing the rest would silently change answers, since `Bool` is `_Bool` in the generated C:

* `+` would be a second spelling of `||`, and `*` of `&&`.
* `false - true` would truncate `-1` into `true`.
* `b1 / b2` with a false divisor would kill the whole process instead of a `panic`, since the divide-by-zero check is attached only to numeric types.

**A function value takes `==` and `!=` alone**, and a function's name takes the other side's type in either order ([8.1](#81-definitions)).

**A cast is on the same level as a unary operator.** `Type::` binds as strongly as `!` or `-` and can take another unary as its operand (both `I32::-x` and `-I32::x` can be written).

**`catch` does not associate** ([8.3.2](#832-catching-an-error-catch)).

**The ternary operator** is written `a if cond else b`, as in Python. The side not chosen is not evaluated. Sides of different numeric types are converted to the wider one, which loses no value (`I32` for an `I8` and an `I32`). Split across lines, it goes in parentheses: `x: = (a if cond` on one line and `else b)` on the next. `ksplc fmt` puts them in ([2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations)).

#### 6.1.1 Operator overloading

Implement a prescribed trait (`Add` or `Eq` in `std/lang`, and so on), and `+` and `==` work on a type of your own. The compiler rewrites the operator into the matching method call (*desugaring*: turning a short notation into the longer code it stands for), so nothing is added at run time.

* **Binary and unary operators**: `a + b` becomes `a.add(b)` and `-a` becomes `a.neg()`. Comparisons (`!=` / `<` / `<=` / `>` / `>=`) and unary `!` / `-` are replaced the same way.
* **A prefix cast**: `Dest::a` becomes a call to `a.cast()` if the source type implements `Cast<|Dest|>` ([6.4](#64-type-conversion--and-implicit-casts)).

#### 6.1.2 Indexing

`a[i]` on a type of your own calls a method you supply. Three traits give it three meanings: a copy of the element, a place you can write through, or a place you can only read. A *place* is an expression that names where a value lives, so it can be assigned to or have its address taken ([4.3](#43-places-and-the-rules-for-when-they-may-be-written)). This section fixes what each trait allows and which one is chosen.

| Trait | What `a[i]` becomes | What works on `a[i]` |
| :-- | :-- | :-- |
| `Index` / `Index_mut` | A read is `a.get(i)`; a write `a[i] = v` is `a.set(i, v)` | Read and assign only |
| `Index_place` | `a.at(i)$` | Read, assign, compound-assign, take an address |
| `Index_ref` | `a.at_ref(i)$` | Read and take an address only |

* **`Index` / `Index_mut` exchange "a value", not "an element's place" ([4.3](#43-places-and-the-rules-for-when-they-may-be-written))**: a read `a[i]` becomes `a.get(i)`, and a write `a[i] = v` becomes `a.set(i, v)`. On a type implementing only these, two shapes are compile errors:
  * **Taking an element's address** `a[i]@`: `get` returns a copy, so the `@` would be the address of a temporary.
  * **Compound assignment** `a[i] += v`: a read-modify-write cannot be built from a `get`/`set` pair. Write `a.set(i, a.get(i) + v)`.
* **Indexing that returns an element's place (`Index_place`)**: a type implements `Index_place<|Idx, Output|>`, which carries `fn at(r: Self$@, index: Idx): Output$@`. Then `a[i]` is a "place" just like a built-in slice or array ([4.3](#43-places-and-the-rules-for-when-they-may-be-written)). All four shapes work (read, assign, compound-assign, take an address), and a field of a struct element is updated directly, with no copy (`a[i].f = v`). The compiler desugars `a[i]` to `a.at(i)$`.
  * It takes precedence over `Index`/`Index_mut` on a type implementing both; `at` alone covers reading and writing.
  * In the standard library, `List<|T|>` implements it naming `Self$@`, and `Slice<|$T|>` / `Tensor<|T|>` naming `Self@`.
  * **The receiver shape an implementation declared decides whether it is chosen when the receiver is read-only**. `at(r: Self$@, …)` touches the descriptor itself, so it needs a writable receiver. It is not chosen across a read-only place such as `xs: List<|T|>@`, and the choice goes to the next one, `Index_ref`. `at(r: Self@, …)` only reads the descriptor and returns the mutable pointer inside. So it is chosen across a read-only place too, and the elements can be written. A bare `Self` (received by value) counts as needing a writable receiver.
  * **Once it is chosen, the returned pointer's type also decides whether a write is allowed** (the path rule in [4.3](#43-places-and-the-rules-for-when-they-may-be-written)). Through `at(r: Self@, …)`, the returned `Output$@` speaks for the permission, not the path reaching the receiver. That is how a pointer field is already written. Take a read-only `x` (a parameter received by value, or a variable declared without `$`) whose field `p` is a `T$@`: `x.p$ = v` is accepted, because the write lands where `p` points, not in `x`, so `p`'s own `$` decides. `x[i] = v` through `at(r: Self@, …)` also lands where a returned pointer points, so it is accepted in the same function on the same terms. With `at(r: Self$@, …)` the same `x[i] = v` is refused, while `x.p$ = v` still passes. Why a borrowed view and an owning container answer differently is in [`DESIGN.md`](DESIGN.md), "Where permission lives changes with whether it is owned".
* **Indexing that returns a read-only place (`Index_ref`)**: a type implements `Index_ref<|Idx, Output|>`, which carries `fn at_ref(r: Self, index: Idx): Output@`. Then `a[i]` is a read-only "place". Reading and taking an address are accepted (`a[i]@` is an `Output@`). Assignment and compound assignment are refused because the element type is immutable. The compiler desugars `a[i]` to `a.at_ref(i)$`.
  * **A container whose referent is immutable can implement only this one.** `Index_place.at` promises an `Output$@`, which a type holding only a read-only referent such as `ptr: T@` cannot give. Where the elements' immutability rides on a type argument (`Slice<|T|>`), the declaration does not show it. So it is checked per instantiation and made a compile error. Write a `$` on the `impl`'s target so `Index_place` attaches to the mutable version only ([3.3](#33-structs-struct)).
  * Unlike `Index`, **no copy appears**. `get` duplicates the element, so `a[i].f` carries the whole element to read one field. `Index_ref` is a place, and works in the same shape whatever the element's size.
* On a built-in slice or array, `s[i]` is a "place" from the start, so all four shapes can be written.

On a type implementing all three, the order of choice is `Index_place` **when it can be chosen** (by the receiver-shape rule above). Next comes `Index_ref` when it cannot, then `Index`/`Index_mut` when neither is present. `List<|T|>` in the standard library implements all three. The diagram shows the order.

```mermaid
flowchart TD
    A["a[i] on your own type"] --> P{"Index_place implemented,<br/>and its receiver shape<br/>fits this receiver?"}
    P -->|yes| AT["a.at(i)$"]
    P -->|no| R{"Index_ref implemented?"}
    R -->|yes| ATR["a.at_ref(i)$"]
    R -->|no| G["Index / Index_mut:<br/>a.get(i) / a.set(i, v)"]
```

Desugaring applies only to conformance to the `std/lang` trait **itself**, not to a trait of the same name (`Add` and so on) declared in your own file ([9.2](#92-which-names-an-import-brings-in)).

### 6.2 Pointer arithmetic and implicit dereferencing

A pointer holds an address. In KSPL a value and a pointer to it are different types, but you rarely write a dereference: **only a field access with `.` and a method call need no written dereference**. One `.` serves a value and a pointer alike, so there is no counterpart to C's `->`.

* **Taking an address (`@`)**: a postfix operator giving the address of a "place" ([4.3](#43-places-and-the-rules-for-when-they-may-be-written)).
* **Dereferencing (`$`)**: a postfix operator reaching what a pointer points at. It is written where `.` does not reach: to read or write the pointee itself.

```kspls
val: = 100
ptr: I32@ = val@ // taking an address: I32 -> I32@ (a pointer type)

x: = ptr$ // an explicit dereference: I32@ -> I32

// in the case of a struct pointer
struct Point
    x: I32
p: Point$@ = ... // `$@` because it writes to what it points at

p.x = 10    // OK: dot access on a pointer is dereferenced automatically
val: = p$.x // OK: dereferencing explicitly is fine too

```

**Pointer arithmetic has only three shapes.**

| Notation | The answer | How it counts |
| :-- | :-- | :-- |
| `p + i` / `p - i` | A pointer | `i` is **how many elements** (not a byte count) |
| `p - q` (pointing at the same type) | `Sz` | **How many elements** lie between the two (as C's `ptrdiff_t`) |
| `p += i` / `p -= i` | - | Moves `p` by the same counting (as `p = p + i`) |

**Anything else is a compile error**:

| Refused shape | Example |
| :-- | :-- |
| The integer on the left | `i + p` |
| Adding two pointers | `p + q` |
| Subtracting pointers whose referent types differ | - |
| Other operators | `*` `/` `%` |
| Compound assignments other than `+=` `-=` | `p *= 2` |
| Advancing by something other than an integer | `p += q`, since it does not say "how many elements" |

For a byte count, multiply by `sizeof`: a difference counts elements, not bytes.

```kspls
cells: I32[4] = ::{ 10, 20, 30, 40 }
d: Sz = cells[3]@ - cells[0]@ // 3 (three elements' worth; not 12)
```

#### 6.2.1 Member access and indexing through a pointer

**`.` and `[]` reach through pointers for you: they dereference the receiver's pointer automatically, regardless of the number of steps.** `p.f` is exactly the same code as `p$.f`, and `p[i]` as `p$[i]`; a multiple pointer such as `p: T@@` is peeled down to the entity. Writing the `$` changes nothing, and the linter reports it as unnecessary (`[I0309]`).

But **`[]` is allowed only when what it points at carries its own length**. A *bounds check* compares the index with that length before the access.

| Receiver | `p[i]` | Reason |
| :-- | :-- | :-- |
| `T$[]@` / `T[]@` (a pointer to a slice) | ✅ | The slice carries `len`, so the bound can be checked |
| A pointer to a type implementing `Index` / `Index_place` / `Index_ref` | ✅ | The implementation defines the index's meaning and range |
| `T$@` (a raw pointer to a scalar) | ❌ | No length, so the index's range cannot be checked |

**A cast to a slice cannot change the element size.** `T[]::x` keeps `x`'s pointer and length. With another element size, the same `len` would cover another number of bytes, and the bounds check would let reads pass the end: `I32[]::small` on a `small: U8[8]` would read 8 elements, 32 bytes. A reinterpretation at equal size (`U8[]` ↔ `I8[]`, `U32[]` ↔ `I32[]`) keeps the element count and is accepted. To reinterpret as bytes, build the descriptor yourself (`U8$[]::{ .ptr = ..., .len = ... }`), so the text shows that the hand-written length is unchecked.

**`[]` is kept apart from `(p + i)$`**, which walks a raw pointer. C's `p[i]` is `*(p+i)`, so a bounds-checked access and an unchecked address computation share one text, and only the receiver's type tells them apart. KSPL keeps `[]` for the checked side. Go does the same: it allows an index only on `*[N]T`, and puts `unsafe.Add` / `unsafe.Slice` in a separate vocabulary.

```kspls
s: U8$[] = ...
ps: U8$[]@ = s@
ps[1] = 'X'     // OK: what it points at is a slice = it carries a length
n: = ps.len     // OK: `.` is peeled the same way (the same as `ps$.len`)

raw: I32$@ = ...
v: = raw[0]     // error: a pointer with no length cannot be indexed
v: = (raw + 0)$ // OK: an unchecked address computation is written with this text
```

A type that does not implement `Index` cannot be read with `[]`, as a value or through a pointer alike. `std/ds`'s `Map` implements only `Index_mut` (`set`), so reading uses `.get()`.

**A pointer to a fixed-length array (`T[N]@` / `T[N]$@`) cannot be made.** As in C, `a@` decays to a pointer to the first element (`T$@`), so no expression produces a value of that type. Writing it as a type is a compile error, so that no type exists that can be declared but never assigned. To carry a length around, use a slice (`T$[]`).

### 6.3 Method calls and namespaces

**One `.` does both jobs: it calls a method on a value or a pointer alike (`vec.length_sq()`), and it walks down from a type's name or an import's alias to a name held there (`Vector.new(1, 2)`, `io.out().s("Hi\n")`).** The compiler tells which is meant from the left side, so there is no choosing between `::` and `.`.

**A type's name walks down; on its own it is not a value.** `Vector.new(1, 2)` and `Sz.width()` read a name held on the type. Written where a value goes (`x: = Vector`, `x: = Sz`), it is rejected: a type names a kind of value and holds none, so the declaration has nothing to take its type from. Build a value instead (`Vector.new(...)`, `Vector::{ ... }`), or write the value itself.

**The other way round, a value's name is not a type.** Written where a type goes, the name of a function (`x: twice`, `same<|I32|>`), a variable (`y: g`) or a member reached through a type (`Point.x`, `Box<|I32|>.keep`) is a compile error. A pointer to a function has a function type, `fn(x: I32): I32` ([8.1](#81-definitions)).

### 6.4 Type conversion (`::`) and implicit casts

You convert a value to another type by writing the type and `::` before it. A few safe conversions happen without being written; this section lists both.

An explicit cast is `Type::expression`. It converts between numeric types (narrowing a width, changing the signedness) and to a different pointer type. **The cast takes a unary operator and a run of postfix operators as its operand** (`::` is on the unary level; [6.1](#61-the-operator-list-and-precedence)), and casts can be written in a row (`Type::a::b`). To include something like an addition, enclose it in parentheses (`Type::(a + b)`).

The example below also writes to a fixed address. That is *MMIO* (memory-mapped I/O): a hardware register reached by reading or writing one address.

```kspls
f: = F32::10
b: = U8::255

// an example of writing to an absolute address (MMIO)
const UART_TX_REG: U32 = 0xFFFFFFF0
(U32@::UART_TX_REG)$ = 0x01
```

**A cast from floating point to an integer has a fixed meaning only when the truncated value fits the destination type.**

| The value | The result |
| :-- | :-- |
| Fits once truncated | Truncated toward zero: `2.9` gives `2`, `-2.9` gives `-2` |
| Does not fit (`I32::1.0e300`), or `NaN` | Undefined ([14.2](#142-undefined---no-answer-is-fixed)) |

An undefined answer follows each target's conversion instruction (on x86-64, the destination type's minimum). A constant is no different, since the target implementation folds it. So the answer also changes with the optimization level and the backend (the part of the compiler that writes the output, C or LLVM).

Caution: Whether it fits the range is for the writer to confirm.

**There is no cast to `Bool`**: `Bool::x` is a compile error unless `x` is a `Bool`. Write the comparison that is meant (`x != 0`, `p != null`); a number has no truth value of its own. The other way is a cast: `I32::b` is `0` or `1`. **A struct, a slice, an array, a tagged union or a Result does not cast to a number** either; read the field that holds the value.

**Casting to a struct, and `Cast`**: `Type::expression` becomes a plain C value cast. So a cast to a struct type is a compile error unless the source and the destination are the same concrete type; it would generate invalid C. Build a struct with a constructor or a compound literal (§6.6).

The one exception is a source type implementing `std/lang`'s `Cast<|Output|>` (`fn cast(r: Self): Output;`). Then `Output::expression` resolves at compile time to that `cast()` call. So an existing value type (such as `I32`) can offer a constructor-like conversion in the prefix-cast notation, with nothing changed on the struct's side.

```kspls
// std/checked_int.kspls: I32 already implements Cast to Ci32
impl I32: Cast<|Ci32|>
    pub fn cast(r: Self$@): Ci32
        return Ci32::{ .val = r$ }

a: = Ci32::123 // OK: resolves to the equivalent of 123.cast()
b: = Ci32::(10 + 20) // OK: an expression enclosed in parentheses can be the receiver too
```

**A fixed-length array `T[N]` casts explicitly to a slice `T[]`** of the same base type (`s: = I32[]::a;`). This gives a slice over the whole array (its first address and its length), with no allocation. The length comes from the type.

Caution: Do not build the descriptor by hand. `T[]::{ .ptr = a@, .len = 4 }` fixes the length as a literal, which does not follow when the array is widened.

**Implicit casts**: only these conversions, which lose no data and carry no undefined behavior, happen without a written `::`.

1. **A safe numeric widening**, such as `I8` to `I32`, `F32` to `F64`, or `U8` to `I32`.
   * `I32` to `Sz` is likewise guaranteed as a safe sign extension, with no value loss or sign inversion, on the 32-bit and 64-bit environments KSPL presupposes.
   * **Conversion from unsigned or huge types is forbidden.** An implicit conversion to `Sz` from a type that may hold a huge value (`U32`, `U64`, `I64`) needs an explicit `::`. So does a narrowing such as `I32` to `I8`, since an overflow can invert the value.
   * **Between integers and floating point there is none**, either way and for a literal too (`2` is not an `F64`; [2.3.1](#231-the-rules-that-fix-a-literals-type)).
2. **Generalizing a pointer**: from any pointer type (`T@`) to the generic pointer (`Void@`).
3. **From mutable to read-only**: from a mutable reference type carrying `$` (a pointer, a slice, and so on) to its read-only version (without `$`). So an immutable type's method can be called on a mutable value (a `U8[]` method on a `U8$[]`).

   **Only the outermost step of what it points at, or of the elements, can be made immutable implicitly.** This is the same range as Rust's `&mut T` → `&T`, and it does not propagate inside a type constructor (a type built from another, such as `Box<|T|>`). The conversion does not happen in generics a user wrote: `Box<|U8$@|>` to `Box<|U8@|>` is refused, and only the built-in type constructors (`@` / `$@` / `[]` / `$[]`) carry the weakening (the grounds are in [`DESIGN.md`](DESIGN.md), "Where permission lives changes with whether it is owned"). The one exception is a position where the declaration named mutability (`struct Box<|$T|>`), which takes the same single step of weakening ([3.3](#33-structs-struct)).

   | Conversion | Accepted? |
   | :-- | :-- |
   | `U8$[]` → `U8[]`, `U8$@` → `U8@` (the outermost step) | Yes |
   | `U8$[]$[]` → `U8[]$[]`, `U8$@@` → `U8@@` (an inner step) | No |
   | `U8$[][]` → `U8[][]` | No |
   | `Box<\|U8$@\|>` → `Box<\|U8@\|>` (inside a user's generic) | No |

   Weakening an inner step is a compile error. Passing a `U8$[]$[]` as a `U8[]$[]` would keep the outer slice writable while its elements turn read-only. The callee could then store a read-only slice into one of those elements, such as a slice over a string literal or `const` data, which lives in read-only memory (ROM on a microcontroller). Back in the caller the same element still has the type `U8$[]`, so the caller could write through it into the literal:

   ```kspls
   fn fills(dst: U8[]$[])
       dst[0] = "abc" // a string literal: read-only memory

   fn main(): I32
       $in_a: U8[4] = ::{ 1, 2, 3, 4 }
       $sl_a: U8$[][1] = ::{ U8$[]::in_a }
       slots: = U8$[]$[]::sl_a
       fills(slots) // error: only the outermost step can be made read-only implicitly
       slots[0][0] = 9 // the caller would write into "abc"
       return 0
   ```

   Even `U8$[][]` → `U8[][]` is refused, though it is sound in principle, since every step of the path is read-only. A nested view type is a different struct in C, and no conversion can be emitted.

   An inner step is made read-only in one of three ways: **declare the element type read-only from the start** (`U8[]$[]`, the standard library's shape), lend at the descriptor step (`List<|T|>@`, or a single-step `U8$[]` → `U8[]`), or cast explicitly (`U8[][]::(x)`). A generic-type or struct conversion such as `List<|U8$[]|>` to `List<|U8[]|>` is never accepted, since a different element type is a different type (generic types are *invariant*: their type arguments must match exactly).

**Two numeric operands of different types** (a binary operator, a ternary's two branches) **compute in the one that converts the other by rule 1**. The result is always one of the two operand types.

| Operands | Computed in |
| :-- | :-- |
| `U8 + I16` | `I16` |
| `I32 + Sz` | `Sz` |
| `Sz + I64` | `I64` |
| `F32 + F64` | `F64` |

**Where neither holds every value of the other, it is a compile error**: a signed and an unsigned type of one width (`I32` with `U32`, `I8` with `U8`, `I64` with `U64`), a signed type with a wider unsigned one (`I8` with `U16`), `Sz` with `U32` or `U64`, and any integer with a float. Cast one side to say which reading is meant (`I64::a < I64::b`). A shift is outside this: its amount keeps its own type.

### 6.5 Assignment and compound assignment

**Assignment changes a value in place, and it and compound assignment are statements of their own, never part of a larger expression**: they return no value, so they cannot be chained (`a = b = 0`) or embedded in an expression.

* **Assignment**: `=`
* **Arithmetic compound assignment**: `+=`, `-=`, `*=`, `/=`, `%=`
* **Bitwise compound assignment**: `&=`, `|=`, `^=`, `<<=`, `>>=`

**`a op= b` takes the operands `a = a op b` takes**, and the place must be a number or a `Bool` (on a `Bool`, `&=` `|=` `^=` alone). A pointer takes `+=` and `-=` alone, counting elements. **On a type of your own, write `a = a + b`**: an operator trait ([6.1.1](#611-operator-overloading)) rewrites the binary operator, not its compound form.

#### 6.5.1 Evaluation order

**Subexpressions are evaluated in the order written in the source (left to right).** This matters when they have side effects, such as printing or changing a variable.

| Shape | Order |
| :-- | :-- |
| `f(a(), b())` | `a()` → `b()` |
| `a() + b()` | `a()` → `b()` |
| `f(x, g())` / `x + g()` | `x` is read → `g()` (a read is part of the order) |
| `o.m(a()).m(b())` | `a()` → `b()` (a receiver before the arguments) |
| `S::{ .p = a(), .q = b() }` | `a()` → `b()` |
| `place = value` / `place op= value` | **The place's subexpressions** → the value |
| `a[i()] = v()` | `i()` → `v()` |

Caution: **No order may be left to the C implementation.** C leaves the order unspecified for an assignment's two sides, a call's arguments, an operator's operands and a compound literal's fields. From the same generated C, gcc takes a call's arguments from the right and clang from the left. For an assignment, clang evaluates the value first and gcc the destination. So side effects would give an answer that depends on the C compiler. KSPL guarantees that its C and LLVM backends agree, so the language fixes the order.

The short-circuiting operators (`&&` / `||`) and the conditional expression (`x if c else y`) are not exceptions to this rule but an addition to it. The left is evaluated, and depending on the result the right is **not evaluated** ([7](#7-control-flow)).

### 6.6 Initialization and construction

A struct's or an array's value is built with a **compound literal**: `::{ … }` holding the values of its fields or elements. This section gives its forms ([6.6.1](#661-compound-literal-forms)), where its type may be left out ([6.6.2](#662-where-the-type-may-be-omitted)), and what it cannot build ([6.6.3](#663-what-a-literal-cannot-build)).

#### 6.6.1 Compound literal forms

**With the type written, `::{ ... }` follows the type name.** A struct's field must be written with a leading `.` (`.field_name = value`), which tells it apart from a variable of the same name. An array's element is `[index] = value`.

```kspls
p: = Point::{ .x = 10, .y = 20 }
arr: = I32[4]::{[0] = 100, [3] = 400 }
```

**Values may stand with no names.** Field names (`.name =`) and indices (`[i] =`) may be left out, so the values alone stand in a row. They go in declaration order: a struct's field order, and from index 0 for an array. Named and unnamed elements can be mixed. After an element with a name or an index, the unnamed elements continue from the position after it (the same counting as C).

```kspls
// an example of initializing an array
fib: I32[5] = ::{ 1, 1, 2, 3, 5 } // assigned in order from [0]
sparse: I32[5] = ::{ 1, 2, [4] = 99 } // becomes [0]=1, [1]=2, [4]=99

// the compiler counts the element count
inferred: I32[_] = ::{ 10, 20, 30 } // becomes I32[3]
inferred_sparse: I32[_] = ::{[9] = 100 } // inferred as I32[10]

// an example of initializing a struct
struct Component
    id: I32
    active: Bool
    tags: U8[][2]
// assigned in declaration order (id, active, tags)
// ::{} can be used recursively to initialize a nested array too
comp1: Component = ::{ 100, true, ::{ "UI", "Player" } }

// an example of a mixed specification
comp2: Component = ::{ 200, .tags = ::{ "Enemy", "Boss" } } // id=200, active takes the default (false), tags is given
```

* **A field or element not written is filled with 0.**
* **An index and a field cannot be joined in one step**: `[0].x = 10` cannot be written; write it per step, `[0] = ::{ .x = 10 }`.
* **A run passed to a slice type is a sequence of elements.** `T[]::{ v1, v2, … }` gives a slice over an array made from those elements (the same as `T[]::(T[_]::{ v1, v2, … })`). A slice's descriptor (`.ptr` / `.len`) built by hand needs the names written. Filling its two fields by position from a run with no names is not allowed, since the notation would not tell a reader which is which.

    ```kspls
    fn keywords(xs: U8[][])
        ...
    keywords(U8[][]::{ "fn", "struct", "impl" }) // OK: a sequence of elements
    s: = U8[]::{ .ptr = buf[0]@, .len = 4 }      // OK: a descriptor is named
    ```

    **The array that results is an unnamed temporary.** It lives in the function's frame (the memory holding the function's local variables, freed when the function returns), so a slice over it points at freed memory once the function ends. The compiler writes that slice's pointer itself, with no `@` in the source, so it refuses to let the slice leave the function by `return` or `throw`. The refusal covers three sources, also where one stands inside the value returned (`return Holder::{ .s = U8[]::a }`):

    * a run of elements, `T[]::{ v1, v2, … }`;
    * a local fixed-length array cast to a slice, `T[]::a`;
    * a local variable set from either, by its declaration or by a later `x = …`, directly or through another such variable.

    ```kspls
    priv fn chain(): U8[] // error: its return hands out a slice over its own array
        a: U8[4] = ::{ 1, 2, 3, 4 }
        s: = U8[]::a
        t: = s
        return t // refused: `t` was set from `s`, which was set from `U8[]::a`
    ```

    The check follows names only. A copy made any other way passes unchecked, and is the writer's to get right: a slice stored into a struct's field after the struct is built (`h.s = U8[]::a`), one passed through a call (`return id(s)`), or one reached through a pointer (the line is in [`docs/DESIGN.md` "Why dangling is stopped only on the paths that create an invisible pointer"](DESIGN.md)). To return a slice, point it at arena or heap memory, or have the caller pass in the memory to write to. A run for a mutable slice (`T$[]`) cannot be written: writable memory needs a binding's `$`, and this array has no name ([4.2](#42-the-two-axes-of-mutability)).

#### 6.6.2 Where the type may be omitted

**You may write `::{ … }`, or an enum's `.variant`, without a type name only where the expected type ([2.3](#23-literals)) is fixed to one.** There are nine such places:

1. **The right-hand side of a variable declaration**
2. **The right-hand side of `=`**, which takes the type of the place assigned (`held = .some(3)`); a compound assignment such as `+=` is not one
3. **A direct argument of a function or method call**, a generic one's too where its type arguments are written (`Box<|P|>.make(::{ .x = 2 })`, and an integer literal in `larger<|U8|>(200, 100)` is a `U8`); where they are inferred from the arguments, the argument fixes them and so needs its type
4. **A payload of an enum's variant**, which takes the type the variant declares for it (`.some(.green)`)
5. **A field's value in a struct literal**, which takes the field's declared type (`Slot::{ .kind = .big(1) }`)
6. **An element of an array or slice literal**, which takes the element type (`ks: Kind[2] = ::{ .small, .big(3) }`)
7. **The value a `catch` stands in for**, written after `catch` or after `fallback` in its block, which takes the type of the value it replaces (`sized(n) catch .small`)
8. **The right-hand side of a `return` statement**
9. **The right-hand side of a `throw` statement**, which takes the function's error type, the `E` of its `T!E` (`throw .lost`)

```kspls
p: Point = ::{ .x = 10, .y = 20 } // OK: the type is known from the left-hand side

fn draw(pt: Point)
    ...
draw(::{ .x = 0, .y = 0 }) // OK: known from the argument type

arr: I32[2] = ::{ [0] = 10, [1] = 20 } // OK: an array can be inferred too

status: Status = .ok
// OK: an enum's variant can be inferred too
```

**An `if … else` expression standing in one of these places passes the place's type to both of its sides**, so each side may leave the name out: `return .some(n) if n > 0 else .none` in a function returning `I32?`, `held = .some(3) if ok else .none`.

**Anywhere else it is a compile error**, since the expected type is not fixed to one. Examples are inside a comparison (`if x == .ok`), either side of an `if … else` whose own place fixes no type (`v: = .ok if cond else .err`), and a standalone expression statement. There, write from the type name (`Status.ok`).

#### 6.6.3 What a literal cannot build

A compound literal fills fields, so it is refused where filling fields would bypass a type's own rules or where there are no fields to fill.

* **A struct with invisible fields cannot be built with a literal.** Every field must be visible where the literal is written, the fields not written included (a compile error otherwise). Omitted fields are zero-filled, so code that cannot read the type could otherwise build and pass around a value breaking the type's own invariant (a condition its own code relies on always being true). Use what the declaring file publishes (its constructor function).
* Note: **Only the fields of the struct the literal writes are inspected.** Invisible fields further inside a visible field's type (a wrapping struct, an array's elements) are not inspected, and are accepted as zero initialization ([4.4.1](#441-top-level-variables)).
* **Fields cannot be written on a type that has no fields** (a compile error). Numbers, `Bool`, enums, and `Result` (`T!E`) itself give `::{ ... }` nothing to fill. Write the value itself (`n: I32 = 0;`).
  * An empty `::{}` writes nothing, so it is accepted on these types too, meaning zero.
* **A `Result` cannot be built from fields.** Its success side is the value written as it is or with `return`, and its failure side is `throw`; it is read with `!` and `catch`. Its three inner fields (`is_err` / `error_code` / `val`) are absent from the surface. They are refused here, as they are when reading ([8.3](#83-error-handling)).
  * If the success side is a struct, a `::{ ... }` writing that struct's fields is accepted (`p: Point!E = ::{ .x = 1, .y = 2 };` writes `Point`'s fields).

### 6.7 Built-in operators

`sizeof` and `offsetof` ask the compiler about sizes and positions in memory. They look like functions but never become run-time calls: the answer is fixed at compile time.

| Operator | Answers | Takes |
| :-- | :-- | :-- |
| `sizeof(…)` | The size in bytes, as an `Sz` | A type or an expression (not evaluated) |
| `offsetof(Type, field)` | The byte offset of `field` inside `Type`, as an `Sz` | A `struct` type and a field name |

* **`sizeof(a type or an expression)`**: the size in bytes that a type or an expression occupies, as an `Sz` fixed at compile time. An expression passed is not evaluated; only its type is analyzed. **A name reads as a variable or a constant where one of that name is in scope**, and as a type otherwise: `sizeof(x)`, `sizeof(x.a)`, `sizeof(a[0])` and `sizeof(x@)` take the value's type, as C reads a name a local variable hides a typedef with.
* **A function's name has no size**: `sizeof(twice)`, `sizeof(same<|I32|>)` and `sizeof(Meter.twice)` are compile errors ([8.1](#81-definitions)). The size of a pointer to a function is `sizeof` of a function type (`sizeof(fn(x: I32): I32)`, or a typedef of one) or of a variable holding one, and it is the same for every function type: the target machine's pointer width, 8 bytes on a 64-bit machine and 4 on a 32-bit one. A field reached through its type (`sizeof(Point.x)`) is a compile error too: write the field's type, or reach it through a value (`sizeof(p.x)`).

**A size is the target machine's: the one the compile is for, not the one the compiler runs on.** ksplc is told the machine with `--machine` (the machine it runs on where none is named), and lays every type out by that machine's widths: a pointer's, `Sz`'s, a function pointer's, and the alignment of `I64` / `U64` / `F64`. **A size folded into the output is checked by the C compiler**: wherever an answer becomes a number in the generated C (an array's length, a constant built from another, a static `if`, `##error`, a `case` label, reflection's offsets), the C states the number beside a compile-time check against the C compiler's own layout. C compiled for another machine than the one named is refused at that line, never built with wrong sizes.

**`sizeof` does not depend on the declaration order.** `sizeof` of a type declared later in the same file can stand in an array's length, a typedef, a function's return type, or another type's field. But a shape whose size depends on itself cannot be written, such as the pair `struct A { f: U8[sizeof(B)] }` and `struct B { g: U8[sizeof(A)] }`. Hold one of them with `@`, or write the length directly.

```kspls
import "std/io"

buf: U8[sizeof(Later)] = ::{} // OK: Later may be declared after this
priv struct Later
    priv a: I64
    priv b: I64

fn main()
    size: = sizeof(I32) // 4
    x: = 100
    size_var: = sizeof(x) // 4 (the size of x's type, I32)
    io.out().s("\{size\} \{size_var\} \{buf.len\}\n") // 4 4 16
```

* **`offsetof(Type, field)`**: the byte offset at which `field` starts within `Type`, as a compile-time `Sz`. The first argument is limited to a type, unlike `sizeof`: it asks about the declaration's layout, not a value, and a value's name there (`offsetof(twice, a)`) is a compile error. The second is the field name itself, not an expression (a local variable of the same name has no influence).

**It differs from adding up the fields' sizes.** A field is placed at a position rounded up to its own alignment (the address multiple its type needs), so unused bytes (*padding*) can go between it and the field before. `#packed` stops the padding, and `#align(N)` changes the struct's alignment. So ask for a position with `offsetof` instead of counting it ([`docs/DESIGN.md` "Why the round trip between a container and an external form is a trait returning a table"](DESIGN.md)).

**It can be written only on a `struct`.** An enum's variants are values, not places, so `offsetof(E, a)` is a compile error, as is a name absent from the target type's fields.

```kspls
priv struct Row
    a: U8
    b: I64
    c: U8
first: = offsetof(Row, a) // 0
second: = offsetof(Row, b) // 8  (not 1; `b` rounds up to its own alignment of 8)
third: = offsetof(Row, c) // 16
whole: = sizeof(Row) // 24 (the tail rounds up to the struct's alignment too)
```

### 6.8 Integer arithmetic: folding, overflow, division, shifts

Integer arithmetic gives the same answer whether the compiler works it out ahead of time or the running program computes it. The one difference is that a signed overflow the compiler can see is an error. This section fixes those answers, and which operands are refused or stop execution. How a literal's type is fixed is [2.3.1](#231-the-rules-that-fix-a-literals-type).

Three words are used below:

| Word | Meaning |
| :-- | :-- |
| *folding* | The compiler computing a constant expression itself, so the program holds only the answer |
| *overflow* | A result too large or too small for its type |
| *wrap `mod 2^N`* | Keep only the low `N` bits of the result, where `N` is the type's width in bits. For a signed type this is *two's complement*: past the maximum comes the minimum |

**Folding a constant expression gives the same answer as run time.** The operands' types fix the width and the signedness: a binary operation uses the wider of its two operands' types (an unsuffixed literal takes the other side's), and a shift its left operand's. A comparison is judged at its operands' type, not at its result's `Bool`. **A cast folds as it converts at run time**: an integer keeps the target type's low bits (`U8::300` is `44`, `I8::200` is `-56`, `I32::(U8::(0 - 1))` is `255`). Where nothing is typed yet (an array length, an enum tag), the types are read from what is written: a literal's suffix, a cast's target, a constant's declared type.

* **Unsigned wraps `mod 2^N`** (`1U32 - 2U32` is `4294967295`), as it does at run time, so it is not refused as a constant.
* **A signed overflow is a compile error** (`integer overflow in compile-time constant expression`), although it wraps `mod 2^N` at run time. An overflow visible at translation time is almost certainly a mistake in writing, so the wrapped value is not silently adopted. It is judged at the operands' type width, intermediate results included: `(2147483647 + 1) - 1` fits in `I32` in the end, but overflows along the way and is an error.
* **Division, remainder, right shift, and ordering comparisons change their answer with signedness.** On an unsigned type everything is evaluated as unsigned (`(1U32 - 2U32) >> 1U32` is `2147483647`, not an arithmetic shift of `-1`).
* **A shift amount must be smaller than the operand's width** (`shift amount is out of range in compile-time constant expression`): `1U64 << 40` can be written, `1U32 << 40` cannot.

**The folding rules above take effect in two places.** One is a context that cannot go on without the value (an array length, an enum tag, a generic's `const` argument). The other is a top-level initializer, which is folded only to inspect it for overflow. An ordinary expression inside a function (`x: I32 = a + b;`) is generated unfolded, and so follows the next rule.

**A run-time overflow wraps `mod 2^N`, signed or not**, though C leaves signed overflow undefined. When `+` `-` `*` `<<` or unary minus exceeds the type's width, the value wraps in two's complement. Adding `1` to `I32`'s maximum gives its minimum, and unary minus on `I32`'s minimum gives that minimum itself.

**Division's and remainder's overflow follows the same rule**, though C and LLVM leave it undefined. The type's minimum divided by `-1` does not fit the type, so it wraps, the dividend comes back unchanged, and the remainder is `0`. At `I32`, `min / -1` is `min` and `min % -1` is `0`.

**Unsigned types narrower than `int` (`U8` / `U16`) wrap at the operands' width too.** With `a: U8 = 255; b: U8 = 1;`, `a + b` is `0`, and passing it into a wider context does not change that (`I32::(a + b)` is `0`, and `(a + b) == U8::0` is true).

* **To wrap at a bound other than `2^N`**, write `% bound` yourself; there is no dedicated type (`std/ring`'s `Ring<|cap|>` folds it inside for a ring buffer's index).
* **When detection is needed**, use `Ci8` … `Cu64` from `std/checked_int` (`checked_*` returns a failure, and the plain operators stop). Plain `+` `-` `*` carry no detection because they appear in nearly every expression, unlike an index, a shift amount or a divisor ([13](#13-conditions-that-stop-execution-at-run-time)). Wrapping itself costs nothing at run time, so whether to detect is a choice of type.

**An integer division's or remainder's divisor must not be `0`** (`/` `%` `/=` `%=` alike), and **a shift amount must be inside the left-hand side type's width (at or above `0`, below the width)** (`<<` `>>` `<<=` `>>=` alike). Otherwise a shift's answer would not be fixed: C and LLVM leave such a shift undefined, so it changes with optimization. For both rules, what happens when one is broken depends on when the value is fixed:

| Broken rule | Value fixed at translation time | Value fixed at run time |
| :-- | :-- | :-- |
| A divisor of `0` | A compile error (`division or modulo by zero`) | Execution stops ([13](#13-conditions-that-stop-execution-at-run-time)) |
| A shift amount out of range | A compile error (`shift count 40 is out of range for the left-hand side type 'I32' (must be 0..31)`) | Execution stops ([13](#13-conditions-that-stop-execution-at-run-time)) |

A run-time shift amount is judged at its own type, before anything narrows it: `1 << m` with `m: U64` holding `2^32` stops rather than shifting by `0`. In a generic's template body the left-hand side's width changes with the type argument, so there even a constant amount is checked at run time.

**Floating point is outside this rule**: IEEE 754 (the standard for floating-point arithmetic) fixes `1.0 / 0.0` as `+inf` and `0.0 / 0.0` as `NaN`, so neither is made an error or a stop. **`%` and `%=` do not apply to floating point**: a float remainder's sign has two readings (truncating, as C's `fmod`, or flooring, as Python's `%`), so the one meant is written out (`a - b * F64::(I64::(a / b))` truncates).

**A shift's type is fixed by the left operand alone** (the shift amount's type is independent). So the outer expected type passes to the left-hand side unchanged: the `1` of `x: I64 = 1 << 40;` is an `I64`.

**`Sz`'s width is judged at the lower bound every target guarantees (32 bits).** `Sz` depends on the environment (equivalent to `ptrdiff_t`, as in [3.1](#31-primitive-types)). So an expression that is fine on a 64-bit environment could be undefined behavior on a 32-bit microcontroller.

* `1Sz << 40` is therefore a compile error, and a literal that does not fit 32 bits, such as `4294967296Sz`, cannot be written; use `U64` / `I64` for a 64-bit width.
* The lower bound is used only for checking shift amounts and literal ranges. The run-time check counts at it too, so `1Sz << n` stops at the same place on a 64-bit machine as on a 32-bit one.
* The generated code's width (`sizeof`, LLVM's `zext`/`trunc`) is the environment's actual `Sz`.

---
## 7. Control flow

Control flow decides which statement runs next. Branching is `if` and `switch` ([7.1](#71-branching)), repetition is the single word `for` ([7.2](#72-loops)), and a label escapes from somewhere deep all at once ([7.3](#73-labelled-blocks-and-breaking-out-of-nested-constructs)).

A condition is written without parentheses `()`, and a block is always written: in braces in the brace notation, one level deeper in the indentation notation ([2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations)). **A block's last expression never becomes the return value**; write `return` to return a value.

### 7.1 Branching

`if` chooses by a condition, and `switch` chooses by a value. Unlike C, a `switch` must name every possible value, or the program does not compile.

* **`if` / `else`**: the ordinary conditional branch.
* **`switch`**: branches by value. The expression follows the `switch` keyword, then `case` or `default` clauses. No braces `{}` enclose the whole.
* **Unlike C's `switch`, it never falls through to the next `case`** (no `break` ends a branch). Several candidates on one `case` are separated by commas `,`, and the case is entered if any of them matches.
* **A case value is a compile-time constant, and no two cases name one value**: `case 'a'` beside `case 97` is a compile error, as is `case one` beside `case 1` for `const one: I32 = 1`.
* **What `switch` can be applied to**: only something expressible as one value: an integer, a `Bool` or an enum, read-only or not (`switch r$` on an `r: Self@`). A string (`U8[]`) cannot be the subject of a `switch`: a comparison whose cost grows with the string's length would slip in without appearing in the text. Compare strings with `if` and `.equals()`.
* **An omission is a compile error.** The compiler checks that the cases cover every value (an *exhaustiveness* check), as the table shows. It counts the type-name form (`Event.click`) and the abbreviated form (`.click`) alike, so the day a variant is added, the places to fix are known.

  | Subject | What must be written |
  | :-- | :-- |
  | An enum | Every variant, or a `default` clause |
  | A `Bool` | Both `true` and `false`, or a `default` |
  | An integer | A `default` |

* **Attached data is extracted once**: variants lined up with commas may hold attached data of the same shape. Then `(variable_name)` written once after the first candidate reads the contents under that name, whichever candidate was entered.
  * **Write the shape that extracts the contents in the abbreviated form (`.variant(...)`)**. `Enum.variant` followed by `(...)` is read as a function call, so it cannot extract (it still counts for the omission check).
* **Write the payload only when it is needed**: on a variant holding a payload, if the payload is not used inside, omit the `(...)` altogether and write `.variant` (the exhaustiveness check still takes effect).
  * **Do not line up discarding names such as `(_a, _b)`.** To a reader they can only look like an extraction. And the day a variant's attached data grows, even the places that do not use it have to be rewritten.
  * **Variants with differently shaped payloads can be folded together with commas too** (nothing is bound, so the shapes need not agree). "Do nothing for the rest" is written as one clause, as follows.

```kspls
// Caution: Line the variants up rather than using default. A default silently swallows "a variant that was added" too.
switch change
case .size(axis, index, _v)
    return Size_at::{ .axis = axis, .index = index, .found = true }
case .add, .cut, .open, .close, .face, .link, .note, .remark, .name, .refer {}
```

```kspls
ui_event: switch event
case Event.quit
    return
case .click(x, y) // extract the attached data (the abbreviated form only)
    if x < 0
        break ui_event // a labelled escape to the outside
    io.out().s("\{x\}\n")
default {
    // the rest
}

// an example of extracting data of the same shape once
switch token
case .identifier(text), .string, .keyword
    io.out().s("Parsed token: ").s(text).s("\n")
case .eof
    return
```

* **An `if` that binds an `Option`**: `if name: = expression { … }` binds and enters when a value is present, and does nothing when there is none. An added `else` is the branch for none. An `else if name: = expression` binds the same way, at any place in an `else if` chain. At translation time it expands mechanically into `switch expression case .some(name) { … } case .none { … }`.

```kspls
// these two are the same thing.
if run: = block.first_run()
    io.out().s(run.text).s("\n")

switch block.first_run()
case .some(run)
    io.out().s(run.text).s("\n")
case .none {}
```

**It takes effect on an optional (`T?`) only**; written on another `enum`, it is refused at translation time. `Option` is fixed at two variants, so "do nothing on the absent side" is safe. A user's `enum` can gain variants, and the day one is added, such an `if` would pass silently. On another `enum`, name every variant in a `switch`, so an added variant fails there and forces a review.

**A `typedef` over an `Option` is one too.** `typedef Opt = I32?` names the same type, so its value binds here exactly as `Option`'s does, as with `switch`. A typedef over another `enum` is still refused: the check looks at the type the name resolves to, not at the name.

**Neither a `$` nor a type annotation can be written** (the binding only reads, and the `Option`'s contents fix the type).

### 7.2 Loops

Every loop is written with one keyword, `for`. It has four notations, which cover what C splits into `for` / `while` / `do-while`, since all of them serve the same purpose.

| Notation | Form | C equivalent |
| :-- | :-- | :-- |
| 1. C style | `for init; condition; step` | `for (…; …; …)` |
| 2. While style | `for condition` | `while (condition)` |
| 3. Infinite | `for` | `for (;;)` |
| 4. For-in | `for item in sequence` | - (Python's `for item in sequence`) |

```kspls
// 1. the C style (init; condition; step)
outer: for $i: = 0; i < 10; i += 1
    for $j: = 0; j < 10; j += 1
        if i == 5
            break outer // escape the outer loop all at once with a label

// 2. the while style (a condition only)
for remaining > 0
    remaining -= step

// 3. an infinite loop
outer_loop: for
    if check()
        break outer_loop

// 4. the for-in style (walking each element of a collection)
for item in list
    io.out().s("\{item\}\n")

// in the C style, several variables can be declared too
for $i: = 0, $j: = 10; i < j; i += 1, j -= 1 {
    // ...
}
```

`for item in sequence` is **the only notation** that takes elements out in order. At compile time it expands mechanically into one of two shapes. The sequence's type decides which; the writer cannot choose. The expression serving as the sequence is evaluated only once: it is taken into a temporary, so a function call written there is not called repeatedly.

| Shape | Which types take it | What it expands into |
| :-- | :-- | :-- |
| 1. Driven by an index (the default) | A type with a `.len: Sz` field that can be indexed with `[i]` | A C-style `for` over `i`, reading `collection[i]` |
| 2. Driven by `next()` | A type implementing `std/lang`'s `Iter<\|T\|>` | `for { switch collection.next() case .some(item) { … } case .none { break; } }` |

1. **The shape driven by an index (the default)**: a type that carries a `.len: Sz` field and can be indexed with `[i]`. It expands into an index-based `for` (the C style, 1 above), taking each element as `collection[i]`. Built-in slices and arrays are walked this way, and so is a type implementing any one of `Index` / `Index_place` / `Index_ref` ([6.1](#61-the-operator-list-and-precedence)). The call target is never chosen at run time, so it runs as fast as an index loop written by hand.
2. **The shape driven by `next()`**: a type implementing `std/lang`'s `trait Iter<|T|> { fn next(r: Self): T?; }`. It expands into `for { switch collection.next() case .some(item) { …the body… } case .none { break; } }`. A sequence holding neither a length nor a current position (one built by layering filters and transformations) is this kind. `.len` cannot be asked of it, so it cannot be walked in the index shape.
   * Here too the call target is fixed at compile time.

```kspls

// a type naming `Iter` is walked, from the writer's point of view, in the same notation as a `List`.
impl Countdown: Iter<|I32|>
    fn next(r: Self$@): I32?
        if r.n <= 0
            return .none
        r.n -= 1
        return .some(r.n)
for v in Countdown::{ .n = 4 } // 3, 2, 1, 0
    ...
```

There is no shape for driving the iteration yourself, such as `for it.has_next() { x: = it.next(); … }`. `Iter` carries only `next`, with no separate entry point for asking "is there more" (the grounds for this and the next rule are in [`DESIGN.md`](DESIGN.md), "One mechanism per purpose").

**On a type satisfying both shapes, `Iter` wins.**

Caution: **Do not have a type you want walked by index name `Iter`**: `.len` and `[]` still work when written directly, but `for x in` goes to the `next()` side.

**Repetition that only counts integers**: anything carrying `.len` and an index is walked, container or not. So `std/lang`'s `Range` writes a C-style forward or backward loop in the same `for … in …` shape.

```kspls

for i in Range.asc(n) // equivalent to C's for (i = 0; i < n; i++)
    ...
for i in Range.desc(n) // equivalent to C's for (i = n-1; i >= 0; i--)
    ...
for i in Range.new(2, 10, 3) // an arbitrary start, end (exclusive), and step (2,5,8)
    ...
```

`Range` is an ordinary struct in `std/lang.kspls` with no special treatment from the compiler, and there is no dedicated operator such as `..`. When the step is 0, or the direction of travel disagrees with the order of the start and the end, the element count is 0; execution does not stop.

**A `for` with no condition that no `break` leaves never ends.** Control does not pass beyond it, so a function returning a value may end on it with no `return` after it ([8.1](#81-definitions)), and a statement after it is unreachable (the warning `ksplc explain W0201`).

```kspls
fn first_big(n: I32): I32
    $i: I32 = 0
    for
        if i * i > n
            return i
        i += 1
```

* **What leaves it is a `break` that targets it** ([7.3](#73-labelled-blocks-and-breaking-out-of-nested-constructs)): an unlabelled one not inside an inner `for`, or one naming its label. A `break` naming a construct around the loop leaves that construct, and control goes on after it. `continue` does not leave the loop.
* **A condition makes it a loop that can end**, even a constant `true`. `for true` is warned about (`ksplc explain W0205`), and the fix drops the condition.
* **`for x in` can end**: the `next()` shape's expansion holds a `break` for when nothing is left.

### 7.3 Labelled blocks and breaking out of nested constructs

A *label* is a name written before a construct (`my_label:`). `break my_label` jumps out of that construct from any depth, so no `goto` is needed. `for` / `switch` / `if` and a plain block `{}` can carry a label. `break` and `continue` mean the following.

| Statement | Where control goes |
| :-- | :-- |
| `break;` (unlabelled) | Out of the nearest `for`, passing straight through any `switch`, `if` or block in between |
| `break my_label;` | Out of whatever carries that label (a `for` / `switch` / `if` / block) |
| `continue;` (unlabelled) | To the next round of the nearest `for` |
| `continue my_label;` | To the next round of the `for` carrying that label |

```kspls
// 1. a labelled block (escaping from somewhere deep without using goto)
my_block:
    if condition
        break my_block // escape the block to the outside
    // ...

// 2. the transparency of an unlabelled break
for
    switch event
    case .quit
        break // ignore the switch and escape the for
```

However it escapes, every `defer` registered along the way runs ([8.4.1](#841-the-defer-statement)).

---
## 8. Functions and error handling

This chapter fixes how a function is written ([8.1](#81-definitions)), where a program begins ([8.2](#82-the-entry-point)), how a failure is returned ([8.3](#83-error-handling)), and how allocated memory is let go ([8.4](#84-the-memory-management-model-defer--arc--arenas)).

### 8.1 Definitions

A function is defined with `fn`, always at the top level or inside an `impl` block. Each parameter's type is written out.

**The receiver**: a method receives the value it acts on as its first argument, in a shape written by hand ([5.2](#52-implementations-impl-and-receivers)).

* **Generics and their constraints**: a *generic* function works for many types. `fn name<|T|>(...): return type` declares a type parameter `T`, which each use fills with a real type. `<|T: Trait|>` admits only types implementing that trait, and `+` joins several constraints (`<|T: Drawable + Serializable|>`).

```kspls
// it writes to what they point at, so the pointers must be `T$@` (mutable) (§3.2)
fn swap_items<|T|>(a: T$@, b: T$@)
    temp: = a$
    a$ = b$
    b$ = temp

// accepts only types satisfying both Drawable and Serializable
fn process_item<|T: Drawable + Serializable|>(item: T)
    item.draw()
```

* **A generic function used as a value is one specialization, named by its type arguments**: `f: fn(x: I32): I32 = same<|I32|>` holds the `I32` copy of `fn same<|T|>(x: T): T`, and it is checked against the expected function type as any function's name is. The bare name (`f: fn(x: I32): I32 = same`, or `pass(same)` to a generic parameter) is a compile error: a value has no actual arguments to infer `T` from, and the expected type does not supply it ([`docs/DESIGN.md` "A generic function used as a value names its specialization"](DESIGN.md)).
* **Type arguments after a function that declares none are a compile error**, at a call and on a value alike (`twice<|I32|>(2)`, `f: Op = twice<|I32|>`). A method declaring none is the same (`Meter.twice<|I32|>`).
* **A method used as a value is named through its type**, and is the function whose first parameter is the receiver as the method declares it ([5.2](#52-implementations-impl-and-receivers)): `f: fn(r: Meter@): I32 = Meter.read`. A generic type's type arguments go on the type and a generic method's own after the method (`Keeper<|I32|>.pair<|U8|>`), and leaving out either is a compile error. Two other shapes are compile errors ([`docs/DESIGN.md` "A method used as a value is named through its type"](DESIGN.md)):
  * through a value, not called (`p.read`): a function value holds no receiver. Call it, or name it through its type and pass the receiver as the first argument;
  * through a trait (`Shape.area`): each conforming type has its own function. Name one type's.
* **A function's name takes its type from where it is written.** Each of these stands for one function: a non-generic function's name (`twice`), a written specialization (`same<|I32|>`), a method named through its type (`Meter.read`) and an anonymous function ([8.1.2](#812-anonymous-functions)). Used as a value ([`docs/DESIGN.md` "A generic function used as a value names its specialization"](DESIGN.md)):
  * where a function type is expected (a typed variable, an argument, a field, a returned value, the other side of `==`), it is checked against that type;
  * passed to a parameter whose type is a type parameter of the called generic (`fn pass<|F|>(f: F): F`), it gives that type parameter the function type of the function it names, as any actual argument gives its own: `pass(same<|I32|>)` binds `F` to `fn(x: I32): I32`, and `pass(Meter.read)` to `fn(r: Meter@): I32`. A variadic function is a compile error there, since no function type holds its `...`; write the type argument;
  * bound to a declaration with no type, it gives the declaration the function type of the function it names in the same way: `f: = twice` makes `f` a `fn(x: I32): I32`, `f: = same<|I32|>` the same, and `f: = Meter.read` a `fn(r: Meter@): I32`. A variadic function is a compile error there too, and so is a bare generic name (`f: = same`), which names no one function;
  * anywhere else nothing gives it a type, and it is a compile error: two names compared with each other, and `sizeof` (below).
* **A function's name compared with `==` or `!=` takes the other side's function type**, on whichever side it is written: `twice == f` and `f == twice` are one comparison, and the name is checked against `f`'s type as any function's name is. Two names (`twice == thrice`) give neither a type and are a compile error: bind one side to a variable of a function type first ([`docs/DESIGN.md` "A function's name in a comparison takes the other side's type"](DESIGN.md)).
* **A function's name is not a type, and has no size**: `x: twice` and `sizeof(twice)` are compile errors. A pointer to a function has a function type (`fn(x: I32): I32`), and `sizeof` of that type gives its size ([6.7](#67-built-in-operators), [`docs/DESIGN.md` "A function's name has no size"](DESIGN.md)).
* **A function value takes `==` and `!=` alone.** Ordering (`<`), arithmetic, a unary operator (`-f`, `!f`) and a compound assignment (`f += g`) on it are compile errors; a null check is `f == null`.

* **Variadic arguments**: `...` at the end of the argument list receives a variable number of arguments as C does, for interoperating with C.
* **A function returning a value must not reach the end of its body** (a compile error). Every path ends in `return` or `throw`. These also count as an end:
  * a `for` that never ends ([7.2](#72-loops));
  * an `if` with an `else`, or a `switch`, each of whose branches ends so.

  A statement a `break` leaves does not count, whatever its inside does: in `blk: { if c { break blk; } return 1; }`, the `break` reaches the end.

#### 8.1.1 Default arguments

A parameter may end in `= literal`, and a call may then leave that argument out.

```kspls
fn starts_with(r: U8[], prefix: U8[], offset: Sz = 0): Bool
    …

s.starts_with(head)    // offset is 0
s.starts_with(head, 3) // the written value wins
```

A default value is **a single literal** only (a number, `true` / `false`, a character, a string, `null`). An expression cannot be written (both `= 1 + 1` and `= max_depth` are refused), so that no allocation or side effect happens without showing in the call ([`docs/DESIGN.md` "A default argument is allowed only for a foldable constant"](DESIGN.md)).

Each of these placements is a compile error:

| The shape written | Why it is refused |
| --- | --- |
| Not at the end (`fn f(a: I32 = 1, b: I32)`) | Call positions would not map to parameters uniquely |
| The **implementation** of a `trait` method | A call on the concrete type and one through the `trait` would resolve to different declarations, giving one spelling of a call two values. The `trait`'s declaration may carry it (below) |
| A parameter whose type contains a type argument (`fn f<\|T\|>(a: T = 0)`) | A literal of `T` cannot be written |
| A closure's parameters and captures | Nothing calls it by name, so a default would have no effect |
| An `extern` function | C has no default values |

An omitted argument takes the declaration's default **at the call's position**: the default is evaluated per call, never once at the declaration and shared.

##### A default written on a `trait`'s declaration

A default value is **written on the `trait`'s declaration**. The implementation declares the same parameters without `=`, and the compiler passes the declared default to each implementation, so the same call gives the same value.

```kspls
priv trait Sited
    fn where_from(r: Self, file: U8[] = caller_file, line: Sz = caller_line): Site

impl Marker: Sited
    fn where_from(_r: Self, file: U8[], line: Sz): Site // Caution: do not write '='
        return Site::{ .file = file, .line = line }
```

* It applies both to a call on the concrete type (`m.where_from()`) and to one through a `trait` value (`t.where_from()`).
* Indexing (`a[i]`) works the same way. In the standard library, `Index_place` and `Index_ref` receive the caller's position, so `List<|T|>`'s out-of-range error names **the use site** (`index out of bounds in List.at (idx: 9, len: 1) at file:12`).
* **`Index` / `Index_mut`, which exchange values, do not receive it.** It would impose two parameters on implementations that do not use the position (`Map` returns a `Result` instead of stopping on out-of-range).

##### The caller's position (`caller_file` / `caller_line`)

Two names give a function the file and line it was called from, so an error message can point at the caller's code. They can be written only as a default value: `caller_file` becomes the caller's file name (`U8[]`), and `caller_line` its line number (`Sz`, 1-based).

```kspls
pub fn assert(cond: Bool, msg: U8$[], file: U8[] = caller_file, line: Sz = caller_line)
    if !cond
        panic(msg, file, line) // Caution: forward them (leaving it to the default gives this line)
```

* They take **the call's position**: call the `assert` above from two places and each gets its own line.
* **They go back only one step.** To carry the position down a chain of calls, have each function in between take the same two parameters and pass them on explicitly (the `panic(msg, file, line)` above). Otherwise that function becomes the "caller".
* An explicit argument overrides them (`where_am_i("C", "other.kspls", 99)`), as with any default argument.
* They work on a `trait`'s method too ("A default written on a `trait`'s declaration" above). **An entry point that does not receive the position emits none** (`std/ds`'s `bounds_panic` is passed an empty one), since the standard library's own line would make a user's mistake look like the library's.
* Note: The out-of-range check on a built-in slice or array embeds the position in the generated code instead ([13. Conditions that stop execution at run time](#13-conditions-that-stop-execution-at-run-time)); both print the same `at <file>:<line>`.

#### 8.1.2 Anonymous functions

A function can be written without a name, right where it is used: `fn(arguments): return { body }` is an **expression**. Its type is the function-pointer type of the same shape (`fn(arguments): return`), so it can be passed wherever a function pointer is taken.

```kspls
// `unwrap_or_else` takes an `fn(): T` (a function pointer), so it can be passed as it is
n: = maybe.unwrap_or_else(fn(): I32 {
    return expensive_default();
})
```

* **The argument and return types cannot be omitted**; they are not inferred from where it is passed (as with a top-level declaration, a parameter, a return and a `struct`'s field).
* **The body is written as a named function's is**: a value is returned only with `return` ([7](#7-control-flow)).
* **Bound with no type written** (`p: = fn(x: I32): Bool { … };`), it gives the declaration its own function type, as a named function's name does ([8.1](#81-definitions)). A closure with a capture list has a type of its own, `Callable`.

**It captures no outer names (it is not a closure).** The body is lifted to a top-level function at compile time, so it sees only its own arguments and the file's top-level declarations. Referring to the enclosing function's locals, parameters or type parameters, or to an `impl`'s receiver, is a compile error; pass the values as arguments.

```kspls
priv fn take(pred: fn(x: I32): Bool): Bool
    return pred(9)
priv fn take_with(pred: fn(x: I32, limit: I32): Bool, limit: I32): Bool
    return pred(9, limit)

n: = 5
bad: = take(fn(x: I32): Bool { // error: n is not visible
    return x > n;
})
// pass it as an argument
ok: = take_with(fn(x: I32, limit: I32): Bool {
    return x > limit;
}, n)
```

**Choose by reuse**: name a function called from two or more places. An anonymous function keeps a predicate or comparison used at only one call site close to that site.

#### 8.1.3 Closures

A *closure* is an anonymous function that can also use values from the code around it. You list those values in a **capture list**, written after a `;` that follows the arguments. The body refers to a captured name as it is.

```kspls

priv fn count_over(xs: I32[4], pred: Callable1<|I32, Bool|>): Sz
    …

n: = 5
c: = count_over(a, fn(x: I32; n: I32): Bool { return x > n; })
```

The two kinds of nameless function differ as follows; the rules after the table give the details and the reasons.

| | Anonymous function `fn(x: I32): Bool { … }` | Closure `fn(x: I32; n: I32): Bool { … }` |
| :-- | :-- | :-- |
| Its type | A function pointer, `fn(x: I32): Bool` | `Callable1<\|I32, Bool\|>` / `Callable2<\|…\|>` |
| Uses outer values | No (pass them as arguments) | Yes: the names in its capture list, read-only |
| Number of arguments | Any | One or two |
| Can stand at the top level | Yes | No: only inside a function's body |
| The enclosing type parameters (`T`) | Cannot be written | Can be written |
| Bound to a variable | The type must be written | Needs no type written |

**The `;` fixes the type.** Without it the function is a function pointer ("Anonymous functions" above). With it, the function is a `Callable1<|argument, return|>` / `Callable2<|argument1, argument2, return|>` (as the receiving function writes it), which carries the place of its captured values along with the function ([`docs/DESIGN.md` "Why capture is made explicit and escape is forbidden"](DESIGN.md)). Even with zero captures, the `;` makes it a `Callable`, for an API that takes no function pointer, such as `std/seq`'s:

```kspls
big: = xs.where(fn(x: I32; ): Bool {
    return x > 5;
}, arena)
sorted: = big.order_by(fn(a: U8[], b: U8[]; ): I32 {
    return a.compare(b);
}, arena)
```

* **Write the type on a capture too** (`n: I32`). Only a local variable may omit its type ([4.1](#41-declaration-patterns)); a capture in a signature is treated as a parameter.
* **It takes one or two arguments**, as `Callable1` / `Callable2` do; for three or more, move the rest into captures or write a named function.
* **A capture is read-only.** It cannot carry `$`, and rewriting it in the body is a compile error; receive what is to be rewritten as a pointer argument.
* **A captured value is read as it stands at the call**, since a capture is the entity the name refers to, not a copy. Rewrite the original variable after building the closure, and the call sees the new value. Read-only does not mean frozen; copy the value yourself when needed (the same rule as `defer`; [8.4.1](#841-the-defer-statement)).

**A closure cannot leave its function.** The place of its captured values is on the building function's frame (its own memory, which is gone once it returns). So returning a closure with `return` / `throw` is a compile error, as for a trait value. It can only be passed for the duration of a call. For the same reason it cannot cross the C boundary ([11.1](#111-types-that-cannot-cross-the-c-boundary)).

```kspls
priv fn make(): Callable1<|I32, Bool|> // error: the place of the captured values vanishes with the function
    n: = 5
    return fn(x: I32; n: I32): Bool
        return x > n
```

**A closure can be written only inside a function's body**, even with zero captures. Its captured values ride on the caller's frame, so it cannot stand in a top-level `const` or a variable's initializer. An anonymous function, being a function pointer, can stand at the top level. So one named predicate cannot be reused from several functions: write a closure in each, or have the API take a function pointer instead of a `Callable`.

**The enclosing declaration's type parameters can be written** in a closure's parameters, return and captures, inside a generic function or a generic `impl`. An anonymous function cannot use them. A generic function's code exists as *specializations*, one copy for each concrete type it is used with (`T = I32`, `T = F64`, …). An anonymous function becomes one plain, non-generic function, and its value is a bare function pointer, which carries no type argument to say which copy it means. A closure's value is a struct the compiler makes generic over the same `T`, so it is specialized along with the function around it. Writing `T` in an anonymous function gives an error asking for a capture list: with one, even an empty one (`fn(x: T; ): T { … }`), it is a closure and may use `T`.

```kspls
impl<|T|> Holder<|T|>
    pub fn largest(r: Self$@, floor: T): T
        // T can be written in a closure
        return pick<|T|>(r.v, fn(x: T; floor: T): T {
            return x if x > floor else floor;
        })
```

**A closure cannot be captured.** To combine closures, pass one as an argument: make the receiving function take a `Callable2`, and take the inner result as its second argument.

#### 8.1.4 A function is defined where it is declared

**Every function is written with its body; there are no separate header declarations as in C.** A `;` in place of it is a compile error, for a free function and for a method in an `impl` alike. A signature stands alone in two places only: a trait's required method ([5.1](#51-traits-trait)) and a function in an `extern "C"` block ([11](#11-c-interoperability)).

**A function defined in another artifact is reached through C**: it is declared in an `extern "C"` block, as a library built from KSPL ships its interface ([11.3](#113-exposing-a-kspl-function-to-c-export)). (An *artifact* is a separately built program or library.) KSPL code reaches another package's KSPL functions, generics and methods included, through its source.

### 8.2 The entry point

A program begins at `main`, which takes no arguments (command-line arguments are read with `sys.args()`). What `main` returns becomes the program's exit status.

**`main` cannot be `priv`** (`main() cannot be 'priv'`): the start-up code calls it from another file, and a `priv` function is internal to its own file in the generated C.

Caution: **Do not write more than one `main` in a program.** Two or more across all the files in the compilation are refused (`this program defines main() N times`), whether or not they stand in the entry file. So importing a file that holds a `main` is refused too. A rule choosing one would silently drop the others.

**The return type must be one that can become the process's exit status** (the number a program hands back to the shell when it ends; `0` means success).

| `main`'s return | The exit status |
| :-- | :-- |
| None (`fn main()`) | Always `0` |
| An integer (`fn main(): I32` and so on) | **That value** |
| `Void!E` | `0` on success, `E` on failure (when numeric; otherwise `1`) |
| `I32!E` and so on | **That value** on success, as above on failure |

Any other type (`Bool` / `U8[]` / `F64` / a struct) is **a compile error**: it has no meaningful conversion to C's `int main`, and accepting it would silently discard the value (Principle 5 in [`DESIGN.md`](DESIGN.md)).

When `main` returns the failure side (`!E`), the error's value and the path it came through are written to standard error before exiting.

```kspls
import "std/sys"

// the shape returning nothing. The exit status is always 0.
fn main()
    count: = sys.args().len
    // use sys.exit() to end with an arbitrary code partway through
    if count < 2
        sys.exit(1)
```

```kspls
// the shape returning an integer. The value returned becomes the exit status as it is.
import "std/sys"

fn main(): I32
    return 0 if sys.args().len > 1 else 1
```

### 8.3 Error handling

**A function that may fail says so in its return type, `T!E`: no exception leaves a function without appearing there**, so whether a call can fail is read from the type, and the caller cannot overlook it. (In Python or JavaScript, by contrast, an exception can escape a function whose signature does not mention it.) It returns with `return` on success and `throw` on failure ([8.3.1](#831-success-and-failure-return-vs-throw)). The caller takes the contents out with `catch` ([8.3.2](#832-catching-an-error-catch)) or `!` ([8.3.3](#833-error-propagation-)).

* **The `T!E` type** holds either the success value, `T`, or the failure value, `E`.
* **The error type cannot be omitted**: there is no short form `T!`, which would be a second spelling of one type ([`docs/DESIGN.md` "Notations not carried"](DESIGN.md)). For a type compatible with C's `int`, write `T!I32`.
* **`E` can be any type** (a number, an enum, a struct), and need not be an error: it can be any token returned to the caller, as `kspeg/`'s parser uses it. When it is a struct, decide yourself who frees its contents and when.
* **The fields inside cannot be touched**: `.val` / `.is_err` / `.error_code` are compile errors, since they would let the success value be read despite a failure. Only `!` and `catch` take the contents out.

Building a result (`return` / `throw`) and receiving it (`!` / `catch` / `fallback`) fit together as follows.

```mermaid
flowchart TD
    RET["return value"] --> U["the `T?E` type (T?E)"]
    THROW["throw error"] --> U
    U --> H{"the caller must handle it<br/>(the fields inside are not touched)"}
    H -->|"? (propagate)"| P["success → take T out<br/>failure → throw E to the caller at once (an early return)"]
    H -->|"catch e { ... }"| C["catch it and handle it<br/>leave with throw/return, or a substitute value with fallback"]
    H -->|"catch expression"| CE["write the value for failure on the spot"]
```

#### 8.3.1 Success and failure (`return` vs `throw`)

In a function returning a `T!E`, `return` hands back the success value and `throw` the failure value.

* **`return value;`** returns the success value `T` (for `Void`, simply `return;`).
* **`throw error value;`** returns the failure value `E`.

```kspls
// return an Enum on failure
fn check_value(v: I32): Void!My_error
    if v < 0
        throw My_error.invalid
    return // success (Void)

fn read_file(): Handle!My_error
    // ...
    return Handle::{ .id = 1 }
```

#### 8.3.2 Catching an error (`catch`)

`catch` takes the contents out of a `T!E` value. The value cannot be used without it, so nothing proceeds until success or failure is decided.

`catch` can be written **only on a `T!E` left-hand side** (the same restriction as `!`); on an expression that cannot fail, it is a compile error. Indexing is covered too: `a[i] catch v` requires `Index` / `Index_place` / `Index_ref` to return a `T!E`.

`catch` either takes another route on failure or supplies a substitute value. It has two forms:

| Form | Written | On failure |
| :-- | :-- | :-- |
| Block | `catch e { … }` | Runs the block with the failure value named `e` |
| Expression | `catch substitute` | Uses `substitute` as the value |

* **The block form (`catch e { ... }`)** runs the block with the failure value named `e`. The block leaves with `throw` / `return` / `break` / `continue`, or passes on a substitute value with `fallback`.
  * **A block whose value can be read is refused if control can reach its end**, as a function that can reach its end without returning is. Allowing it would silently pass on the zero value, while the same letters on one line (`catch alt()`) pass on `alt()`'s value. A call to a `#noreturn` function (`sys.exit`, `panic`) ends the block, so a handler closing on one needs no `fallback`.
  * **Where nobody can read the value, no `fallback` is needed.** That holds for a `catch` standing as its own statement, a binding whose name opens with `_`, and a subject producing nothing (a `Void!E`). There the block runs for its effect, and `catch { }` says exactly that.
* **The expression form (`catch substitute`)** writes the value for failure inline, without `{}` (it means `catch e { fallback substitute; }`).
  * **The substitute must have the success side's type** (`T` for a `T!E`). The one exception is a call to a `#noreturn` function (`#noreturn` in [10](#10-compiler-directives-and-attributes)), a function that never returns. Control never comes back, so the value is never used, and `text: = io.read_file(path) catch panic("cannot read: \{path\}");` fits on one line.
* **There is at most one `catch` per expression.** Chaining, as in `a() catch b() catch c`, is a syntax error. Once the first `catch` has resolved the `T!E`, the second one's subject is a `T`, which needs no further substitute.

```kspls
// 1. the block form (flow control)
file: = open("data.bin") catch e
    io.err().s("Failed to open\n")
    throw e // or return;

// 2. the block form (a fallback with work attached)
port: = parse_port(str) catch e
    io.out().s("Invalid port, using default.\n")
    fallback 8080 // return a value and complete the catch block

// 3. the expression form (using a default value)
port: = parse_port(str) catch 8080
```

#### 8.3.3 Error propagation (`!`)

**`!`** takes the value out on success; on failure it `throw`s the failure from the function at once, handing it to the caller. These two mean the same:

```kspls
x: = parse_data()!
x: = parse_data() catch e
    throw e
```

**`!` can be written only inside a function returning a `T!E`**, since it passes the failure straight to the caller.

**The failure types must agree** (`!` on an `EB` failure inside a function returning `I32!EA` is a compile error). When they differ, take the failure with `catch`, convert it yourself, and `throw` it.

### 8.4 The memory management model: `defer` / ARC / arenas

There is no garbage collector (a run-time system that finds and frees unused memory by itself). Instead there are three ways of deciding when memory is let go, **chosen per type** and mixable within one program.

| Method | Where it fits | When it frees |
| :-- | :-- | :-- |
| **A raw pointer (`T@`) + `defer`** ([8.4.1](#841-the-defer-statement)) | FFI with C (calling C code), bare metal (running with no operating system): where maximal control is needed | Where its `defer x.free()` was written. Tracking ownership is the programmer's job |
| **An arena (`Arena`)** ([8.4.3](#843-arenas-arena)) | Data whose lifetime is one bundle, such as one request or one compilation unit | All at once at the end of the scope. Nothing is tracked, so tracking costs nothing |
| **ARC (`Ref_counted` conformance)** ([8.4.2](#842-automatic-reference-counting-via-ref_counted-conformance)) | Data shared by several owners, whose lifetime does not fit one scope | When the last owner disappears. The compiler inserts the counting |

**All three work on bare metal with no `malloc`**: pass one static buffer to `mem.init_freestanding_heap()` in the startup routine. Ordinary heap allocation, `Rc`/`Arc` included, then works.

**A lint reports a notation departing from the chosen policy.** An ARC-managed type in a local variable or an argument is [W0601], and a struct with a hand-built reference count is [I0602]. Both are off by default. How to enable them, and the `ksplc.cfg` that applies them across a directory tree, are in the Lint section of the development tools specification.

#### 8.4.1 The `defer` statement

`defer` schedules a statement to run when the current scope ends, however it ends. It is mostly used to free what was just allocated.

* **Syntax**: `defer statement`. One statement goes bare (`defer buf.free()`); several go in a block (`defer { … }`, or a deeper level in the indentation notation). `ksplc fmt` writes a one-statement block the bare way, so one cleanup has one spelling.
* **When it runs**: at the end of the scope, or on leaving it with `return`, `throw`, `break`, `continue` and the like, in reverse order of registration (the last one registered runs first).
* **Nothing escapes from inside a `defer`**: cleanup must run to its end. So `return` / `throw` / `fallback` inside it, a `break` / `continue` aimed at an outer scope, and a `!` that may fail are compile errors.
* **Values are read when it runs, not when it is registered.** An outer variable the block names takes its value at the moment of leaving. So `defer f(x)` reads `x` again then, where Go's evaluates `x` at registration. A closure's capture reads at the call by the same rule ("Closures" in [8.1](#81-definitions)). The grounds are in [`docs/DESIGN.md` "Why `defer` has no capture list"](DESIGN.md).
  * **To use the value at registration, copy it yourself**; the language keeps no such value.

    ```kspls
    snapshot: = ptr // save it yourself before registering
    defer free(snapshot) // snapshot does not move even if ptr is swapped later
    ```
  * **A capture list (`defer a, b { ... }`) cannot be written** (a compile error).

* **A `defer` is a statement of its own**, on the line after the binding it cleans up, naming it (`defer buf.free()`). It does not ride on the end of a declaration, and nothing is filled in for it: `.free()` with nothing in front is a compile error on any line.
  * **Put it right after the binding.** A statement that can leave the scope (`!`, `return`, `throw`, or a `break` / `continue` out of it) placed between the two leaves before the `defer` is registered. What was acquired is then never cleaned up. For a value whose type conforms to `Owned`, the check is [W0109] in the development tools specification.

```kspls
fn work()
    buf: = Str_builder.new()
    defer buf.free() // it runs on leaving the scope

    buf.s("hello") // even if the internal buffer grows, what is freed is the entity at the point of leaving
    io.out().s(buf.slice()).s("\n")
```

#### 8.4.2 Automatic reference counting via `Ref_counted` conformance

*Reference counting* keeps a count of how many owners a value has, and frees the value when the count drops to zero. With ARC (Automatic Reference Counting) the compiler writes the counting for you. On a struct conforming to the `Ref_counted` trait, the compiler inserts a `retain()` raising the count when the value is copied, and a `release()` lowering it on leaving a scope, as Swift does. It frees the value when the count reaches 0.

The sequence below follows one shared value through its life.

```mermaid
sequenceDiagram
    participant Code as your code
    participant V as the shared value
    Code->>V: created (count 1)
    Code->>V: copied into a second variable, retain() (count 2)
    Code->>V: the copy leaves its scope, release() (count 1)
    Code->>V: the original leaves its scope, release() (count 0)
    Note over V: freed
```

**ARC in capitals and the type name `Arc` are different things.** ARC in this document always means Automatic Reference Counting: the compiler inserting retain/release. `Arc<|T|>` is Atomically Reference Counted: a reference-counting type that can be shared between threads (the role of Rust's `Arc<T>`).

**How conformance is written**: conform to the `Ref_counted` that `std/lang` declares. It is a `pub trait` with `priv` methods, so the type name can be written but `retain`/`release` cannot be called.

```kspls
import "std/mem"

// make the conforming impl's methods priv too (otherwise a direct call on the concrete type would go through).
impl My_handle: Ref_counted
    priv fn retain($r: Self$@)
        r.ctrl.count += 1
    priv fn release($r: Self$@)
        ...
```

`Ref_counted` is **a trait known to the compiler**, but only conformance to `std.Ref_counted` itself counts: a trait of the same name declared in your own file does not enable ARC. `std/mem` can be imported from a freestanding build (one with no operating system) too, so bare metal uses the same declaration.

Caution: **Do not call `retain` / `release` by hand.** Such a call doubles up with the compiler's, whose `release` then writes into freed memory. `priv` on the trait blocks a call through a trait value (`d: Ref_counted = a; d.release();`), and `priv` on the `impl` a direct call on the type. The compiler's own calls, inserted after the visibility check, still reach them.

`std/mem.kspls` offers these concrete types:

| Type | What it is |
| :-- | :-- |
| **`Rc<\|T\|>`** | A reference count for use within one thread |
| **`Arc<\|T\|>`** | A reference count several threads may touch (raising and lowering it cannot be interrupted) |
| **`Weak_rc<\|T\|>` / `Weak_arc<\|T\|>`** | Point without holding a count, to break the cycles in which things pointing at each other are never freed |

**A type holding an ARC-managed type by value is counted too.** An ordinary type that does not implement `Ref_counted` itself still has its contents' counts raised on copy and lowered on leaving a scope. This holds when it has an ARC-managed type as a value in:

* a `struct`'s fields
* an `enum`'s variant payload (the run-time tag is inspected, and only the live variant's payload counts)
* an array's elements
* a `Result`'s (`T!E`'s) success payload (freed even when discarded without `catch`/`!`)

Held through a pointer or a slice (a field of `Rc<|T|>$@` and the like), it is borrowed, not owned, and not counted. Nesting is walked to any depth (an enum wrapping a struct holding an array, and so on).

```kspls
enum Wrap
    empty
    filled(v: Rc<|I32|>)

// a bare block carries a label (with no heading it cannot be told from a continuation of
// the line above, in either notation)
held:
    w: = Wrap.filled(Rc<|I32|>.new(1)) // filled's payload, and
    a: Rc<|I32|>[2] = ::{ Rc<|I32|>.new(1), Rc<|I32|>.new(2) }
// are release'd in a chain on leaving the scope
```

**A value no variable takes is counted too.**

* A call made a statement (`mk(5)`, `pass(mk(6))`) is released at once, as is the success value a statement's `catch` throws away (`maybe(2) catch {}`).
* A value built in place and only read from (`mk(8).id`, `Holder::{ … }.a`, `switch Wrap.filled(mk(9))`, a method called on `mk(3)`) lives as if bound to a hidden variable there, to the end of the enclosing block. So a field or a view read off it stays valid that long. A field holding an ARC-managed value is a copy that gets a count of its own.

**A function call on the left-hand side of an assignment to an ARC-managed place is a compile error** (`rc.get().field = x`). The assignment must lower the overwritten value's count. Doing so would run the call twice, and not doing so would leave the old value unfreed; neither is visible in the source. Take the place into a variable first.

```kspls
import "std/refcount" { Rc }

priv struct Holder
    field: Rc<|I32|>

$rc: = Rc<|Holder|>.new(Holder::{ .field = Rc<|I32|>.new(1) })
x: = Rc<|I32|>.new(2)
rc.get().field = x // error: cannot assign to an ARC-managed location whose left side contains a call

// ✓ take the place first
p: = rc.get()
p.field = x
```

**A container holds the counts of its elements.** An ARC-managed value put into a `List<|T|>` / `Map<|K, V|>` keeps its count balanced on every path (taking out, overwriting, growing, `remove`, `free`), since the caller cannot reach the contents to fix a leak. An element that is itself an `Rc<|T|>` takes its value apart when its last owner goes (below).

**The last owner of an `Rc<|T|>` / `Arc<|T|>` takes the value apart.** When the count reaches 0, every ARC-managed value `T` holds by value is released too, to any depth, as when a `T` leaves a scope. Three consequences are the writer's to keep in mind:

* **The time goes where the last owner goes.** Leaving one scope can free a whole tree, at a line that shows no call.
* **A long chain recurses once per link.** A list of a million `Rc` nodes, let go at its head, can run the stack out. Walk such a chain in a loop (`head = head.get().next`), which frees one node per step.
* **The release runs where the last owner goes**: on that thread for an `Arc`, and inside an interrupt handler if it goes there. An `Rc` held inside an `Arc`'s value is then released from another thread, which is a data race ([14.2](#142-undefined---no-answer-is-fixed)).

A cycle of owners is never released; make one side a `Weak_rc` / `Weak_arc`. A value that is not ARC-managed (a `List`, a file) is not freed by this; it keeps its own `free()`.

For these APIs, see [Appendix B](#appendix-b-the-standard-library).

#### 8.4.3 Arenas (`Arena`)

An arena is one large block of memory that hands out pieces of itself, and lets everything go at once when its boundary comes, following no individual lifetime. Allocation only advances a pointer, so it is fast. `save()` notes a position and `restore()` rewinds to it, for throwaway data inside a loop.

#### 8.4.4 What may be handed to `dealloc`

**`mem.dealloc` frees only memory that `mem.alloc` itself gave out, and nothing else.** The three methods of §8.4 handle the same `T$@`, so the origin cannot be told from the type. Three things must not be passed to it:

| What must not be handed to it | Examples |
| :-- | :-- |
| A pointer apportioned from an arena | `arena.alloc_as<\|T\|>()` / `arena.create(v)`. An arena is let go all at once with `Arena.free()` |
| A pointer to the **inside** of an allocation | `rc.get()`, the address of a field or an array element: not the start of an allocation, so not freeable |
| Static or automatic memory | A static buffer handed to `Arena.from_buffer`, the address of a local variable |

**Passing an arena pointer to `dealloc` is mostly caught at translation time.** A binding that is never rewritten (`p: = arena.alloc(n);`) keeps the origin its declaration shows, so passing it to `dealloc(p)` is reported as `[W0104]`.

Caution: **It stays silent on a binding carrying `$`**, which can later point at another allocation, so its initializer does not fix what it points at; the run-time check below covers it. Nor does it cover `x.free()`, which lets go of `x`'s contents, not `x`'s address, so freeing the contents of a container placed in an arena is correct.

**A mistake does not break quietly.** `mem.alloc` records its own address inside the block it returns, and `dealloc` stops without touching the heap unless that record agrees. On bare metal it also checks that the address lies within the heap. Do not count on libc's diagnostics: whether libc notices depends on how the mistake lands, and bare metal has no libc.

The record uses a free field in the header, so **an allocation takes no extra bytes**. Passing the same pointer twice mostly stops here (through a local variable, at translation time: [8.4.5](#845-tracking-a-free-with-owned)).

#### 8.4.5 Tracking a free with `Owned`

The compiler notices when a local variable is used after it was freed. It recognizes a free by the variable's type conforming to `Owned`, or by a call to `dealloc`.

**Touching memory whose lifetime has ended is undefined** ([14.2](#142-undefined---no-answer-is-fixed)). KSPL has no borrow check (a compile-time proof, as in Rust, that no pointer outlives what it points at). So returning a local's address to dangle, as in `return x@;`, can be written without a diagnostic. The one exception is an upcast to a `trait` (converting a value to a trait value), stopped because no `@` appears in the source. Not touching such memory is the writer's responsibility.

**Whether something was freed is tracked through the type's contract.** In place of a borrow check, KSPL reads `x.free()` on a local variable of a type conforming to `Owned` (and the free function `dealloc(x)`, which frees raw bytes) as "what that variable points at was freed". A path reaching that variable after the free is refused as `variable 'x' may already be freed here (use-after-free or double free)`. A free registered with `defer` counts at the point of leaving the scope.

```kspls
pub struct Buf
    …
impl Buf
    pub fn free(r: Self$@)
        …
impl Buf: Owned {} // without this the check does not work (an empty block keeps its braces)
```

* **A non-conforming type is not tracked.** With the name `free` alone as the mark, renaming it would silently switch the check off; conformance makes the compiler confirm the required shape too. The linter reports, at the declaration, a type whose conformance was forgotten, and a type freeing under another name such as `close`.
* **`Owned`'s `free` returns no failure**: a free runs from a `defer` or partway along an escape path, where the caller could do nothing with one. Put cleanup that needs confirming in a separate method (`sync(): Void!Io_error` for `io.File_stream`).
* Only a **bare local variable** is inspected. A per-field free such as `r.field.free()`, and a free through an index, are not tracked, so a shape that cannot be tracked is never wrongly counted as freed.
* A free wrapped in another function is followed **one level only**. If the callee's body always frees the matching parameter, in the `x.free()` or the `dealloc(x)` shape, the caller's argument counts as freed. A method shape (`x.close_it()`) is followed the same way, with the receiver as the first parameter.
  * So a body that frees the parameter itself is tracked even when its name is not `free` and its type does not conform to `Owned`. `Owned` is needed for a type whose `free()` frees **a field** instead of the parameter (such as `Str_builder`).

---

## 9. Files and import

A KSPL program is made of files. To use something declared in another file, you `import` that file ([9.1](#91-import-syntax-and-path-resolution)). To decide who else may use your own declarations, you mark them `pub` or `priv`, or leave them unmarked ([9.4](#94-circular-imports-and-visibility)).

**`import`'s counterpart is not `#export`.** The two look like a pair, but they act on different things, and their effects never meet. `import` and `pub` work on *names*: what another KSPL file may write. `#export` works on *symbols*: the names the linker sees (the linker is the tool that joins compiled files into one program), which is how C code reaches a function. So `#export` does not make a declaration importable and callable from another file, and `pub` does not make it callable from C.

The table sets the three axes side by side.

| Axis | Bringing in | Publishing | What it fixes |
| :-- | :-- | :-- | :-- |
| **A name** (between KSPL files) | `import` | `pub` (unmarked: within the package; `priv`: within the file) | From where the name can be named |
| **A symbol** (the C / wasm ABI: the binary calling rules that C code and a WebAssembly host follow) | `extern "C" { … }` ([11](#11-c-interoperability)) | `#export` ([11.3](#113-exposing-a-kspl-function-to-c-export)) | Whether the name the linker sees is decorated (KSPL adds the file's position to it unless `#export` is written) |
| **A file → a value** | `embed "…" as name` ([4.6](#46-embedding-resources)) | (absent) | Turns a file's contents into a read-only byte sequence |

So the opposite of "publish" is "hide", not "bring in". **A combination across the axes that would have no effect is refused**: an `#export` on a `priv` is a compile error ([11.3](#113-exposing-a-kspl-function-to-c-export)).

### 9.1 import syntax and path resolution

An `import` line names another file by its path, in double quotes. This section says how the path may be written, which name you then write for the file, and how the compiler finds the file.

**Syntax**: `import "path" (as identifier)?` imports the whole file at that path.

**The path is a plain string literal** in one pair of double quotes. A path names a file at compile time; it is not a value.

| The path written | Accepted? | Why |
| :-- | :-- | :-- |
| `import "std/io"` | Yes | A plain string literal |
| `import "std/\{x\}"` (string interpolation) | No, a compile error | A path is not a value, so nothing can be computed into it |
| `import """std/io"""` (a raw string) | No, a compile error | The same |
| `import "../lib/x"`, `import "switch"` | Yes | Being a file path and not an identifier, it can hold `/` (elsewhere the division operator), `.` and `..`, and name a file spelt like a keyword (`switch.kspls` / `defer.kspls`) |

**Write `as` only to change the name.** Without `as`, the alias (the name you write before the dot) is the path's last segment.

| You write | The alias | What it means |
| :-- | :-- | :-- |
| `import "std/io"` | `io` | Write `io.out()` |
| `import "std/io" as io` | `io` | Exactly the unmarked form, so [I0310] reports that the `as` adds nothing |
| `import "ksplc/base/ast" as base_ast` | `base_ast` | `as` renames |
| `import "std/strfmt" as _strfmt` | `_strfmt` | An alias that starts with `_` lets the import go unused |

**One alias cannot name two different files.** Two `import`s in one file that give the same alias are a compile error: `import alias 'ctx' already points at 'a/ctx'`. This holds whether the alias comes from the last segment (`import "a/ctx"` and `import "b/ctx"`) or from `as` (`import "std/mem" as m` and `import "std/str" as m`). If it were allowed, the later line would silently win, by the order of the import lines. The formatter sets that order, so running `fmt` could change what `ctx.X` names. Rename with `as` to fix it (`import "ksplc/gen/c/ctx" as gen_c_ctx`).

Two cases are not refused. The same path on several lines is accepted. So is an `import` under an inactive `#cfg` ([10.1](#101-dropping-in-bulk-with-cfg)), which drops out first: files with the same last segment under `#cfg(windows)` and `#cfg(posix)` are accepted.

**The three strict rules of path resolution**: an import path is never searched for implicitly; it resolves by exactly these three rules. The diagram shows which rule a path takes, and the list after it gives each rule's details.

```mermaid
flowchart TD
    P["the path in quotes"] --> A{"starts with / or \ or a drive (C:)?"}
    A -->|yes| E["compile error<br/>(an absolute path)"]
    A -->|no| S{"starts with std/ ?"}
    S -->|yes| R1["1. the standard library"]
    S -->|no| K{"holds a / and does not<br/>start with . ?"}
    K -->|yes| R2["2. the package its first segment names"]
    K -->|no| R3["3. relative to the importing file<br/>(no /, or . at the head)"]
```

1. **The standard library**: a path beginning with `"std/"` resolves to the standard library the compiler offers.
   * **The standard library is closed**: an `import` or `embed` in one of its files names one of its own files, and a path beginning with `std/` holds no `..` segment. Either kind of reach out of it is a compile error at that line.
   * **A file standing in its place is one of its files.** Open a file inside the folder the standard library is read from, as the entry file or as an editor's document, and that file is named `std/…`, as an import names it, whichever folder the compiler runs from.
2. **By the package it names**: in a path that contains `/` and does not begin with `.` (for example `"ksplc/base/ast"`), the first segment names a package ([9.4](#94-circular-imports-and-visibility) says exactly what a package is).
   * **A package that names itself** has `name = <package>` in a `[package]` section of the `ksplc.cfg` (the compiler's settings file) at its top folder. It finds its own files in that folder, wherever the folder stands, whatever it is called, and whichever folder the compiler runs from. Its files are still named `<package>/…`, so unmarked visibility and every other rule see the same package as from the workspace's root.
   * **Any other package** is found in a folder of its name under the root of the current workspace (the current directory at run time), or where the compiler is told packages are.
   * **A package that names itself imports only itself, `std`, and what it lists under `uses`** in the same section (`uses = ksai ksdb`). Importing any other package is a compile error at that `import`, before the named file is read.
3. **Relative to the importing file**: every other path resolves relative to the importing file's directory. That is a path with no `/` (a file name alone, for example `"context"`), or one beginning with `.`: `"./x"`, `"../x"`, and also `".lib/x"`.

**An absolute path is none of the three, and a compile error** at that line, for an `import` and an `embed` alike. An absolute path begins with `/` or `\` (`"//host/share/x"` included) or with a drive (`"C:/x"`). It is refused before anything is opened: on Windows, opening a path on another machine already offers that machine the user's credentials.

**Every spelling of a file's path gives one logical name**, so one file never becomes two modules. A logical name is the name the compiler gives a file inside the program. Three steps make it (the grounds are in [`docs/DESIGN.md` "A path's `..` is resolved by its spelling"](DESIGN.md)):

| Step | Written | Logical name |
| :-- | :-- | :-- |
| The separator becomes `/` | `a\b` | `a/b` |
| A `.` segment is dropped | `./x`, `a/./x` | `x`, `a/x` |
| Each `x/..` is folded by spelling | `sub/../lib/n` | `lib/n` |

**Two `..` are kept.** The fold reads the spelling alone, so it keeps a `..` wherever the name does not say which folder that `..` leads to:

* **A `..` at the head**, as in `../lib/n`. It names the folder above the one the name is read from, and nothing in the name says what that folder is called.
* **A `..` right after a package read from a place of its own**: `std` (read from the standard library's folder), a package that names itself (read from its own folder), or one found where the compiler is told packages are. Such a package's folder need not stand at its name, so `ksdb/../x` stays as written: folded to `x`, it would name a file in the current folder, not one beside `ksdb`'s folder. Under `std/` such a name is the compile error above.

**Which package holds a file is read the same way.** A file named by its path (the entry file, or a document open in an editor) belongs to the package named in the `ksplc.cfg` of the nearest folder at or above it that names one. The compiler walks up from the file's folder to find it, and folds each `x/..` by spelling before it starts. So `pkg/../other/x.kspls` is walked as `other/x.kspls`: the walk never looks inside `pkg`, and neither `pkg`'s name nor its `ksplc.cfg` reaches a file whose path only passes through `pkg`. For the same reason a package's own file has one name however its path is spelt (`pkg/main.kspls` and `pkg/../pkg/main.kspls` are one file). The fold does not look at the disk. Where `link` is a symbolic link to another folder, `a/link/..` is read as `a`, although the operating system would open the folder above the one `link` points at.

**The entry file's name follows the same rules**: `main.kspls`, `./main.kspls` and `.\main.kspls` are one logical name.

**An import that writes no extension opens the indentation notation first** ([2.5](#25-blocks-and-statement-ends-brace-and-indentation-notations)). `import "lib"` opens `lib.kspls`, or failing that `lib.kspl`, and from then on the file is named as found. Only `.kspls` is dropped from a logical name; a `.kspl` keeps its extension, so `a.kspl` and `a.kspls` in one folder are two names. The extension is not part of the alias either: both files are `lib`, so a file importing both gives each an alias.

### 9.2 Which names an import brings in

After an import, you reach the file's names through its alias (`math.sin()`). Or you list the names you want in braces, and write them with nothing in front. The table shows each form.

| You write | You can then write | You cannot write |
| :-- | :-- | :-- |
| `import "std/math"` | `math.sin()` | `sin()` |
| `import "std/checked_int" { Ci32 }` | `Ci32` | `checked_int.Ci32` |
| `import "std/mem" + { Arena, dealloc }` | `Arena`, `dealloc`, and `mem.` before any name | |
| `import "std/mem" as m + { Arena }` | `Arena`, and `m.` before any name | |
| `import "std/mem" as m { Arena }` | (nothing: a compile error) | |

**The alias always goes in front**: a whole file's names cannot be used without its alias, so importing does not flood a file with names.

**Bringing in selected names (`{ }`)**: `import "path" { name (as alias)?, ... }` makes only the selected names usable, with nothing in front, since the `import` line already says where they came from.

* **Anything the file publishes can be selected**: a type (`struct` / `enum` / `trait` / `typedef`), a function, or a constant. An enum's variants (`Checked_error.overflow`) can then be written with nothing in front too.
* **Visibility does not change.** What is not visible (a `priv`, or an unmarked declaration seen from another package) cannot be selected: that `import` line is a compile error (`cannot access symbol`, [`docs/DESIGN.md` "A name the file cannot see is refused where it is selected"](DESIGN.md)).
* **Generics get the same type too.** A type written with a selected name and one written with the alias in front (`Map<|U8[], I32|>` and `ds.Map<|U8[], I32|>`) are the same type. An `impl`'s matching and a trait's constraint check give the same result for both. Otherwise a second instantiation (the compiler's copy of a generic for one set of type arguments) could lose a slice's default immutability (`U8[]` immutable, `U8$[]` mutable), and a type implementing `Hashable<|U8[]|>` would be rejected as not implementing it.
* **Selecting a name that does not exist makes that `import` line a compile error** (`file 'p' has no symbol named 'X'`), so a misspelling is caught even if the name is never used.
* **A selected name colliding with another declaration in the same file** (an ordinary `struct`/`typedef` and so on) or with another selective import is always a compile error, as an ordinary redefinition is. No first-wins or last-wins precedence applies.

**`+` brings in the qualified name as well** (`import "std/mem" + { Arena, dealloc }`). It means "in addition to the selected names", as it does in a generic's constraint (`<|T: Drawable + Serializable|>`), and nothing more. Without it, only the selected names enter, and `mem.` cannot be written; being able to choose that is why `+` is optional. Combine it with `as` to rename (`import "std/mem" as m + { Arena }`). `as` without `+` is a compile error (`'as' names the file, so the selector list needs '+'`): `as` asks to call the file by a name, while braces without `+` say "bare names only".

**`std/lang` is in every file without being written**, and writing `import "std/lang"` is a compile error. It alone enters every file as a selective import of everything it publishes, together with the alias `lang`.

* **An implicit name is the weakest.** The file's own declarations and the names a selective import lists come first: declare `Owned` or `Ref_counted` in your own file, and the unqualified name refers to yours.
* **`lang.X` always refers to `std/lang`'s declaration**, so `impl My_type: lang.Ref_counted` conforms to `std/lang`'s trait even when your own declaration holds the name. The compiler matches the traits it knows (`Ref_counted` / `Move_only` / `Owned` / `Callable1` / `Callable2` and the operator group) by FQN, the fully qualified name: the name together with the file that declares it. So in such a file, dropping the qualification makes the name mean your own declaration, and the type loses what the trait gives: ARC (the counting the compiler inserts, [8.4](#84-the-memory-management-model-defer--arc--arenas)) or operator desugaring (turning `a + b` into a method call). For `Ref_counted` / `Move_only` / `Owned` the linter reports it as W0501; for an operator trait the operator's use is an error (`Operator '+' requires 'V' to implement 'Add' interface`).
* **Write `lang.` only when the unqualified name is blocked**; otherwise `Option` and `lang.Option` would be two names for one thing (`make test-conventions` checks this).
* When the file declares a name `lang`, the alias does not enter (your own declaration wins).

### 9.3 Adding a method to another file's type

An `impl` block can add methods to a type declared in another file. This section fixes **from where** such a method can be called, and which types an `impl` may target. The rules of `impl` itself are in [5.2](#52-implementations-impl-and-receivers).

**An extension method requires the import**: an extension method is one that an `impl` block adds to a type defined in another file. To call it, the calling file must `import` the file that defines it. So no dependency is implicit: there is nothing like C++'s argument-dependent lookup (ADL), which finds a function through its arguments' types. Files stay independent.

```kspls
import "std/io"
import "std/str" // `equals` on U8[] is added by std/str, so this import is needed

fn main()
    s: = "kanso"
    if s.equals("kanso")
        io.out().s("same\n")
```

* **A built-in type counts as `std/lang`'s.** A type no declaration names (a scalar, a slice, a fixed-length array, a `Result`) is taken as declared in the file every file imports. The methods `std/lang` adds to it need nothing. One that another file adds (`impl U8[]` in `std/str`, `impl I32` in `std/strfmt`) needs that file imported. So `s.equals(...)` needs `import "std/str"`, and a format specifier needs `import "std/strfmt"` ([3.6.2](#362-format-specifiers)).
* **It does not matter whether another file brought the definer into the program** (the grounds are in [`docs/DESIGN.md` "Why a method on a built-in type needs its file imported"](DESIGN.md)). An import that makes such a call valid counts as used, so [I0401] names only an import nothing needs.
* **Any form of import satisfies it**: the whole file (`import "m"` / `import "m" as _m`) or a selective import (`import "m" { X }`), which state the origin equally.
* It applies to every `impl` on a type defined in another file, including a generic method (`pub fn m<|T|>(...)`) and an `impl` on a generic type (`impl<|T|> m.Box<|T|>`). Visibility (`priv` / unmarked) applies as usual.
* **Not inside a generic's instantiation**, where the receiver can be the type argument's: `put<|W, T: Formattable|>` reaches each type's `fmt` wherever its `impl` stands. A conformance (`impl I32: Formattable`) holds wherever its file is part of the program. A file imported only so that its conformances hold is used by nothing written, so it takes a `_` alias (`import "std/strfmt" as _strfmt`).

**Which types an `impl` may target** is set by the table. Generic code is monomorphized: the compiler builds one separate copy of it for each concrete type it is used with.

| Target written | Accepted? | What it attaches to, or why it is refused |
| :-- | :-- | :-- |
| `impl<\|T\|> Checked<\|T\|>` | Yes | A template: every instantiation |
| `impl Checked<\|I32\|> { ... }` | Yes | That one instantiation only |
| `impl Map<\|U8[], T\|>` | Yes | A partial specification (the rule below) |
| `impl<\|T\|> T$[] { ... }` | Yes | Every slice at once: an ordinary generics impl, since `T$[]` is sugar for `Slice<\|$T\|>`. Its methods are monomorphized per element type, and what the body may do, and how constraints apply, are as for any other |
| `impl U8[] { ... }` | Yes | One instantiation, by the rule below (`std/str`'s byte-sequence methods have this shape) |
| Type arguments on a non-generic type | No: `'X' is not a generic type, so it takes no type arguments here` | Allowing a misspelling would leave the `impl` block attached to nothing |
| `impl<\|T: Trait\|> T: Other_trait { ... }` (a blanket impl) | No, a compile error | A blanket impl has a type parameter itself as its target, and implements for every type that satisfies a constraint at once. Monomorphization builds one definition per concrete type, and a type parameter gives it none to build. Write an `impl` per type (`impl Ci8: Add<\|Ci8, Ci8\|> { ... }`), or put the constraint on a generic free function (`fn f<\|T: Trait\|>(x: T)`) |

**One instantiation of a generic type can be an impl's target**: `impl Checked<|I32|> { ... }` attaches the methods to that instantiation only. An impl's target is a type expression. One that contains the impl's own type parameters is a template (`impl<|T|> Checked<|T|>`), and one without them names that single instantiation. It is judged per position: a position holding one of the impl's own type parameters binds to anything, and a concrete type must match the instantiation's same position. So a partial specification such as `impl Map<|U8[], T|>` works too.

* On a type whose immutability rides on a type argument (`struct Slice<|$T|>`), the `$` on the target's type argument decides the instantiation ("The mutable mark (`$`) on a type argument" in [3.3](#33-structs-struct)).
* Write `$` on the target for a method that **writes** to the elements (`impl U8$[]`). An unmarked target (`impl U8[]`) attaches to the immutable version, which a mutable slice reaches by the implicit conversion of [6.4](#64-type-conversion--and-implicit-casts).
* **Two `impl`s placing the same method name are a compile error** (`method 'm' is already defined for this type`); no implicit choice is made.

Caution: The blanket impl and type arguments on a non-generic type are both refused for one reason: **if they could be written, the `impl` block would be silently discarded**. Only a far-away use site would then report the method you thought you implemented as missing. So they are refused where the `impl` is defined (Principle 5 in [`DESIGN.md`](DESIGN.md): whatever is accepted must have an effect).

### 9.4 Circular imports and visibility

Files in one folder may import each other in a circle; files in different folders may not. Each declaration is visible from its own file, from its package, or from everywhere, depending on what is written before it.

* **Within the same folder, files may import each other**: A importing B while B imports A is fine, since the compiler reads the whole source before resolving names. Importing each other across folders is a compile error, since it would leave undecided which folder is above the other.
* **From where it is visible**: there are three levels. A package here is the file's logical name up to the first `/` (`ksplc` for `ksplc/sema/decl/access`, `ksai` for `ksai/tensor`), not the folder itself, so the folders below it belong to the same unit. Files with no `/` (directly under the project) form one unit. So do files outside the project that no package claims, which are named by their path from the root (`C:/…` too). A unit corresponds to one bundle shipped on its own.

| You write | Visible from |
| :-- | :-- |
| Nothing (within the package) | Only the files in the same package. This is the default, so an entry point used only inside the unit need not be put outside |
| `priv` (within that file) | Only that file, not even other files in the same package |
| `pub` (from anywhere) | Any file |

From narrowest to widest, the levels are `priv`, unmarked, `pub`.

**The visibility rules at positions where a value leaves**: a type narrower than the position cannot be written in a function's return, a `struct`'s field, or the type annotation of a top-level declaration (`const` / `var`). This is a compile error. Otherwise, code that cannot name the type could still receive and use the value (`f: = io.open(path);`, `x: = s.slot;`).

* What is compared is the position's effective visibility. For a method, that is the narrower of the function and the `impl`'s target type; for a field, the narrower of the field and the `struct`. An unmarked method of a `priv struct S` cannot be called from code that cannot name `S`, so it is effectively `priv`; a `pub` there is refused by [3.3](#33-structs-struct).
* Every named type in the position's type expression is checked, generic type arguments included.
* **Not covered** are a function's argument positions and non-`pub` fields: neither lets the type leak outside ([`docs/DESIGN.md` "Why a narrow type may not sit in a position with wide visibility"](DESIGN.md)).

```kspls
priv struct Hidden
    v: I32

pub fn make(): Hidden // error: Hidden is narrower than make
    return Hidden::{ .v = 1 }
priv fn make_ok(): Hidden
    return Hidden::{ .v = 1 } // OK: the visibilities balance

pub struct Holder
    pub slot: Hidden // error: Hidden is narrower than a pub field
    priv other: Hidden // OK: not pub, so it cannot be touched from outside

pub $g: Hidden = ::{} // error: Hidden is narrower than a pub global
priv $h: Hidden = ::{} // OK: the visibilities balance
```

**`pub` / `priv` cannot be written on a block itself** (before `extern "C" { ... }` or `impl { ... }`). Write them on each item inside, so that which items are published can be read from the items alone.

The program below puts the import forms of [9.2](#92-which-names-an-import-brings-in) together.

```kspls
// reading a whole file in at file scope (the alias is "io" when omitted)
// to use only particular symbols with no namespace, select them with { } (cannot be combined with as)
import "std/checked_int" { Ci32, Cu32 as My_cu32 }
// use as only when an alias is wanted
import "std/ds" as hash_map
import "std/io"

fn main()
    $m: = hash_map.Map<|U8[], I32|>.new(null)
    defer m.free()
    a: = Ci32::10 // exactly the same type as checked_int.Ci32
    b: = My_cu32::5U32
    io.out().s("Hello \{m.len\} \{a.val\} \{b.val\}\n")
```

---

## 10. Compiler directives and attributes

A notation beginning with `#` speaks to the compiler: it checks something at compile time, chooses what is compiled, or gives an optimization hint. **Deleting every line carrying a `#` leaves the program's logic unchanged**, without exception. So nothing that makes a definition (an `import` connecting an external function, an `embed` taking a file in) is written in this form.

There are two kinds, told apart only by the number of `#`s. Both are written before their target.

| Kind | A directive | An attribute |
| :-- | :-- | :-- |
| Written as | Two `#`: `##error(…)` | One `#`: `#inline`, `#cfg(debug)` |
| Acts on | What encloses it: the file | What comes next: one declaration or statement |

**The `#` or `##` must touch the name** (they are one token), so `# cfg` is a syntax error. The grounds for telling the two apart by the count and not by `!`, and for the adjacency, are "Why directives are `##` and attributes are `#`" in [`DESIGN.md`](DESIGN.md).

**A directive (`##`)** instructs the compiler itself and stands alone as one statement. Its notation overlaps a shebang's (the `#!` first line that lets a Unix shell run a script directly), so only a line where `/` follows the `#!` is a shebang (`#!/usr/bin/env -S ksplc run`).

| Notation | Target | Description |
| --- | --- | --- |
| `##error(cond, msg)` | A top-level statement | **A compile-time assertion**: when `cond` is false, compilation stops at once and shows `msg`. |
| `##warning(cond, msg)` | A top-level statement | **A compile-time warning**: when `cond` is false, `msg` is shown as a warning and compilation continues. |
| `##lint(CODE = level, ...)` | A top-level statement | **A level per diagnostic code**: `off` (not emitted), `on` (emitted at the default severity; this enables a code that is off by default) or `error` (promoted to an error). It acts on the whole file, wherever in the file it is written (it takes effect before the diagnostics). An unknown code or level is a compile error. An error-severity diagnostic carries no code, so this cannot silence a real defect. Details are in the Lint section of the development tools specification. |

**A directive name absent from this table is a compile error** (`unknown directive '##foo'`), as an unknown attribute is: the grammar accepts any `##<name>(...)`, and this table is the single list of names. The argument shape is matched per name as well: `##error(CODE = level)` and `##lint(<expression>)` are both errors. An attribute name written as a directive (`##cfg(x)`) gets a note to write `#cfg`.

**An attribute (`#`)** goes before its target, ahead of `pub` / `priv`, with one `#` per attribute and no separator (`#deprecated #inline`).

**An attribute is written on a declaration or a statement**, and the table shows which attributes each position takes.

| Position | Attributes it takes |
| :-- | :-- |
| A declaration at the top level, inside an `impl`, or inside an `extern` block | Those whose "Target" column below lists it |
| A `struct` inside an `extern` block | `#cfg` only (the reason is below) |
| A statement in a function body | `#cfg` only: nothing reads the others there, so they are compile errors as a position violation |
| A declaration's part: a parameter, a field, an enumerator | None: there is no `fn f(#cfg(x) a: I32)` |
| An expression | None: there is no `f(#cfg(x) a, b)` |

A declaration's parts take no `#cfg`, because a `#cfg` dropping one part would change the run with the flag (a function's argument count, for one). Every call, struct literal or `switch` using it would then need a `#cfg` of its own. Write `#cfg` on the declaration, and two declarations when needed.

The attributes, what each may stand before, and which backend honors it (a backend is the part of the compiler that writes the output: C source, or LLVM IR for the LLVM toolchain):

| Notation | Target | Backends supported | Description |
| --- | --- | --- | --- |
| `#cfg(flag)` | Every position an attribute can be written | C / LLVM | **Conditional compilation**: compiled only when the flag is defined on the command line (`ksplc --define=flag`), or with `!flag` only when it is absent. What is left out does not appear at all in later processing ([10.1](#101-dropping-in-bulk-with-cfg)). |
| `#deprecated` | A function, a variable, a `const`, a `struct`, an `enum` | C / LLVM | Marks the declaration **deprecated** (an old API, say), so the compiler warns the code that uses it. |
| `#inline` | A function | C / LLVM | **An optimization hint** strongly recommending inlining (copying the body into each caller instead of calling it); the behavior does not change. `inline` in the C output, the function attribute `inlinehint` in the LLVM output. |
| `#export` | A function (free functions only), a variable, a `const` | C / LLVM | **Disables name mangling (FFI)**: emitted under its name as defined, with no file position woven in, so C can call it directly ([11.3](#113-exposing-a-kspl-function-to-c-export)). FFI is the foreign function interface: calls between languages. |
| `#link("name")` | An `extern` block | C / LLVM | **Names the library the block's declarations are found in** ([11.5](#115-naming-the-library-an-extern-block-needs-link)). |
| `#section("name")` | A function, a variable, a `const` | C / LLVM | **Places it in a named linker section**: a region the linker's layout names, such as a ROM bank or a fixed RAM region on bare metal. `__attribute__((section("name")))` in the C output, `section "name"` in the LLVM output. The name is letters, digits, `_` and `.` in a plain string; anything else is a compile error, since the name reaches the C and the assembler as written. It passes through with no leading dot added, so it must match the section name in the linker's layout exactly (such as `.foo`). A mismatched section has nowhere to go, and the linker places it at the default location. On a function it must be paired with `#noinline` (a compile error otherwise): inlined, nothing would be left in the section. |
| `#noinline` | A function | C / LLVM | **Forbids inlining**: exactly one definition, never expanded into a caller. `__attribute__((noinline))` in the C output, the function attribute `noinline` in the LLVM output. Required with `#section` on a function; a compile error with `#inline`. |
| `#interrupt` | A function | **C only** | **A hardware interrupt handler**, for bare metal: `__attribute__((interrupt))`. A compile error under `--to=llvm`: it is a calling convention that differs per machine, with no portable counterpart in LLVM IR. |
| `#naked` | A function | C / LLVM | **No compiler-built prologue or epilogue** (the entry and exit code that sets up and removes the function's stack frame), for code that writes its own, such as a homemade OS's context switch: `__attribute__((naked))`, `naked` in the LLVM output. Its body holds only `__kspl_asm_volatile(...)` statements, and the assembly returns by itself (there is no frame for anything else). |
| `#noreturn` | A function | C / LLVM / type checking | **The function never returns** (an infinite loop, a panic handler): `__attribute__((noreturn))`, the function attribute `noreturn` in the LLVM output. Type checking honors it in one position: a call standing as a `catch`'s substitute value (the expression form or the `fallback` statement) is not asked for a type. This is Rust's `!`, Swift's `Never` and Kotlin's `Nothing`, narrowed to where the value is known to be discarded. Anywhere else its type is asked as usual: `return panic(…);` is an error, since if it were allowed, the generated C would return a `Void`. The promise is not checked, as with C's attribute. If the function does return, execution continues with no value, and no implicit `return;` is emitted (it would set off `-Winvalid-noreturn`). |
| `#packed` | A struct | C / LLVM | **No padding**: the fields are packed with no gaps between them. |
| `#align(N)` | A struct, a function, a variable, a `const` | C / LLVM<br>(**C only** for anything but a struct) | **Forces an alignment of `N` bytes**: `__attribute__((aligned(N)))` in the C output. `N` must be a positive constant and a power of two (a compile error otherwise); the upper bound is the target C's, not the language's. Only on a struct does it take effect on both backends, folded into the definition as a per-definition `align N` in the LLVM output. On anything else it is a compile error under `--to=llvm`. |

**Any name parses as an attribute**: the grammar's form is the open `Identifier ("(" expression ("," expression)* ")")?` (the `attribute` rule in `ksplc/kspl.kspeg`), and no name is reserved at the lexical or syntactic stage. An attribute name absent from the table is nevertheless a compile error:

```
error: unknown attribute '#inlne'; the compiler would silently ignore it
```

Ignored without a message, a misspelling (`#inlne`) or an unimplemented name (`#no_mangle`) would be written and do nothing. The table is the single canonical source: a new attribute goes into the table and the compiler alike.

**An attribute in a position its "Target" column does not list is a compile error too**, as an unknown name is. A `#packed` on a parameter, an `#inline` on a field or a `#deprecated` on a `typedef` would be read by nobody (`make test-negative` holds this and the refusals below).

```
error: attribute '#inline' does nothing here; it applies to functions
```

`#deprecated` cannot go on a `typedef` or a `trait`: neither appears as a name inside an expression, so there is no use site to warn at.

**No attribute is interpreted by one backend and silently ignored by the other.** One whose backends column says "C only" is a compile error under `--to=llvm` (Principle 5 in [`DESIGN.md`](DESIGN.md)).

**A `struct` inside an `extern` block takes no attribute but `#cfg`** (a compile error otherwise). The generated C emits only its forward declaration (`typedef struct X X;`), so neither a layout attribute nor a mark on the name has anywhere to go. Its layout belongs to the C header, so hold it by pointer (`@`). A C type held by value is declared outside the block, with its fields ([3.3](#33-structs-struct)).

**No attribute keeps ARC-managed types off a real-time path**: raise lint [W0601] to `error` instead (`--lint=W0601=error` or `ksplc.cfg`; `docs/DESIGN.md` "Markers not carried").

```kspls
// a size check (a compile error when it fails)
##error(sizeof(Sz) == 8, "Sz mismatch: 64-bit required")

// attributes go before the declaration, lined up with a `#` on each (there is no separator)
#deprecated #inline
fn process_helper()
    ...

// compiled only when the "debug" flag is enabled
#cfg(debug)
fn print_debug_info()
    ...

```

### 10.1 Dropping in bulk with `#cfg`

`#cfg` is written per declaration and per statement, but **a construct that gathers things drops whole with it**. There is no range of lines as in C's `#if`, since a range could cut through the middle of a construct. Four constructs take it:

| Notation | What drops |
| --- | --- |
| `#cfg(blas) impl T { ... }` | Every method in that block |
| `#cfg(blas) extern "C" { ... }` | Every prototype in that block |
| `#cfg(rp2040) import "..." as m` | The whole import. **The file is not even read** (a nonexistent path is accepted while the flag is unset). The alias (`as m`) drops with it |
| `#cfg(debug) { ... }` | Every statement in the block: the way to gather statements inside a function body |

The `import` row is how to choose per file: put a per-machine or per-backend implementation in a file of its own, and choose it in the importing file. No notation lets a file drop itself (that would be a second means to the same end).

On a statement, `#cfg` drops that one statement, as syntax counts it: on an `if` / `for` / `switch` the contents drop with it, and there is no keeping only an `if`'s `else`.

**`#cfg`'s argument is one flag name, optionally with a leading `!`.** A logical combination such as `all(a, b)` / `any(a, b)` / `a && b` is a compile error. If it were accepted, `cfg(all(a, b))` would test a flag named `all` and, with no such flag, drop the declaration silently. For two conditions, add one more flag and combine them on the build side.

---

## 11. C interoperability

KSPL calls C through declarations in an `extern` block, and C calls KSPL through functions marked `#export`. `import` reads only KSPL files: it cannot take an external artifact (a compiled C library), which carries no type information.

The diagram shows the two directions and where each is specified.

```mermaid
flowchart LR
    K["your KSPL code"] -->|"calls a function declared in an extern C block (11.2)"| C["a C library<br/>(named with #link, 11.5)"]
    C -->|"calls a function marked #export (11.3)"| K
```

### 11.1 Types that cannot cross the C boundary

Only simple values can be passed to or returned from a C function. A type whose memory layout is KSPL's own cannot be written as an argument or a return at the C boundary (`extern "C"`); that is a compile error.

| Type | Can it cross? |
| :-- | :-- |
| A single value, such as a number or a `Bool` | Yes |
| A raw pointer (`T@`) | Yes |
| A plain `struct` | Yes, if every field can cross. Under `--to=llvm` not by value: pass it by pointer (`T@`) |
| The `T!E` type | No |
| A slice (`T[]`) | No |
| An array (`T[N]`) | No |
| A trait value (an address paired with a table of call targets) | No |
| An `enum` holding attached data | No |

To cross with one of the refused types, pass a raw pointer (`T@`) and the size as separate arguments. **The check walks inside a `struct`**: wrapping, as in `W { items: U8[] }`, does not let a type cross. The grounds for this and for the LLVM rule are "The FFI boundary check looks inside the type" in [`DESIGN.md`](DESIGN.md).

A KSPL string (`U8[]`) carries its length, while a C function takes **a null-terminated pointer** (one whose end is marked by a zero byte). `slice.to_cstr()` allocates one and returns a `U8$@?` (`.none` when the input contains a NUL).

Caution: The caller must `dealloc` it.

**Declare the receiving parameter `Void@`, not `U8@`.** `U8@`'s signedness disagrees with C's on one of the two kinds of target, hosted or bare metal ("What cannot be written in C's types" in [`DESIGN.md`](DESIGN.md)). A string literal can be written directly at a `Void@` position (`libc.fprintf(err, "hi %d\n", 42)`).

### 11.2 External functions and opaque structs

Declare each C function you call inside an `extern "C"` block. To carry C or C++ data (a class, a large struct) around by pointer without knowing its contents, declare it as an opaque struct: a `struct` with no fields.

```kspls
// libc.kspls (a wrapper)
extern "C"
    // 1. declaring opaque structs (a C++ object whose internal layout need not be known, and the like)
    struct llama_model
    struct llama_context

    // 2. declaring external functions
    pub fn malloc(size: Sz): Void@
    pub fn free(ptr: Void@)
    // Caution: receive a format with `Void@` (the signedness does not agree with `U8@`; see 11.1).
    pub fn printf(fmt: Void@, ...): I32

    // an example of handing a C++ class pointer back and forth
    pub fn kai_init(model_path: Void@): llama_model@

    // 3. declaring an external variable (binding a C global variable)
    pub errno: I32
```

### 11.3 Exposing a KSPL function to C (`#export`)

A KSPL function that C is to call carries `#export`. Without it, KSPL weaves the file's position into the symbol's name (name mangling), and C cannot name it.

```kspls
// defining a callback function passed as a C function pointer
#export
fn my_kanso_callback(status: I32)
    io.out().s("Called from C!\n")
```

**`#export` touches only the symbol's name; visibility decides whether the symbol connects**, a separate axis (the table in [9](#9-files-and-import)). For the C or wasm boundary alone, unmarked visibility (within the package) is enough. `pub` is needed to publish a name to another KSPL package.

**`#export` on a method inside an `impl` or a `trait` is a compile error.** A method's name is not unique once its type is stripped (`bump` may exist once per type), so it cannot be the symbol as written. To have C call one, wrap it in a free function. `#export` on a `priv` is a compile error too: the generated C makes it `static`, so it would reach neither C nor a wasm32 exit.

**A library built from KSPL is reached through its `#export` functions.** Built with `--library=<FILE>` (in the development tools specification), a program becomes a library that other programs link against. Only its `#export` functions can be seen from outside; everything else, its own copy of the runtime and of std included, stays private to it.

**The same compilation writes the library's interface** to the file `--library=` names: the one file a caller needs in order to call the library. The option can be repeated, one file per form. For a C caller it is a C header (`greet.h`); for a KSPL caller it is a KSPL file holding an `extern "C"` block, which the caller imports. It lists every `#export` function and the types their signatures name, each with its `//<` summary. A `struct` passed by value is written with its fields, and an `enum` with no payload with its constants. A `struct` reached only through a pointer is written as a *handle*: its name without its fields, so a caller can hold and pass the pointer but cannot look inside. Where every field of it is `pub` and can cross to C, its fields are written after all. The grounds are "A library built from KSPL crosses as C" in [`DESIGN.md`](DESIGN.md).

* **A library cannot hold a `main`, or an `#export` variable or constant, and must export at least one function** (compile errors). The program that links the library has its own `main`, and enters the library through its `#export` functions; with none, the library would hold nothing a caller can reach. A variable is refused because of Windows. There, code that reads a variable out of a DLL (a library the program loads when it starts) must declare it with the mark `__declspec(dllimport)`, and code that reads the same variable from a static library (one copied into the program when it is linked) must not. Which of the two a caller does is decided when the caller links, after the header is written, so no one header is right for both. A function needs no such mark, since a call reaches it either way. To share a value, export a function that returns it.
* **Every `#export` is the library's interface**, a callback passed to C included, so it is named as an API name is: a library's C names share one space with every other library's.

**On wasm32 (32-bit WebAssembly), `#export` also makes the function an entry point exposed outside the assembled wasm.** No C is linked in afterwards, so the only caller of a plainly named symbol is the host. The generated C marks each `#export` function `KSPL_EXPORT` (`export_name` on wasm, empty on other targets). So `--gc-sections` (the linker option that drops unreferenced code) keeps it, and the link step need not list the entry points. An `#export` called only from inside (such as the `memcmp` a target without libc needs) is exported too, since it has a name.

### 11.4 Bare-metal primitives

OS and driver code reads and writes hardware registers that sit at fixed memory addresses (MMIO, memory-mapped I/O), and sometimes needs one machine instruction. The language offers these as built-in functions. They compile to C's `volatile` operations and inline assembler with zero overhead.

| Built-in | What it does | Backends |
| :-- | :-- | :-- |
| `__kspl_read_volatile(ptr: T@): T` | Always reads the address afresh: the compiler never drops a read as repeating the last one. For polling a register the hardware changes by itself | C / LLVM |
| `__kspl_write_volatile(ptr: T@, value: T): Void` | Always writes the address: the compiler never drops a write as overwritten later | C / LLVM |
| `__kspl_asm_volatile(asm_str: String, ...)` | Embeds an assembler instruction in place. The first argument must be a string literal holding the instruction; values can follow C-style from the second argument on | C. **Under `--to=llvm` only an instruction taking no values** (`hlt` / `nop` / `wfi` and so on), since the C-style notation does not translate mechanically into LLVM's. Passing values there is a compile error: use `__kspl_inline_c` when values are needed |
| `__kspl_inline_c(code: String)` | Embeds the written string verbatim into the generated C source. The last resort for a special macro or a C implementation's own extension that `__kspl_asm_volatile` cannot express | **C output only**: C source cannot go into LLVM IR, so it is a compile error under `--to=llvm` |

```kspls
// an example of operating an interrupt controller's register
const UART_TX_REG: U32 = 0xFFFFFFF0
status: = __kspl_read_volatile(U32@::UART_TX_REG)
__kspl_write_volatile(U32@::UART_TX_REG, 0x01)

// the CPU's Halt instruction via inline assembly
__kspl_asm_volatile("hlt")

// embedding raw C code (no escaping needed when a raw string is used)
__kspl_inline_c("""__asm__ volatile("outb %0, %1" : : "a"(data), "Nd"(port));""")
```

### 11.5 Naming the library an `extern` block needs (`#link`)

**`#link` on an `extern` block names the C library that defines the block's functions.** A program taking the block in takes its library with it, and no build file carries the name.

```kspls
// the gemm OpenBLAS defines, kept (and linked) only by a `--define=blas` build
#cfg(blas) #link("openblas")
extern "C"
    fn cblas_sgemm(order: I32, ta: I32, tb: I32, m: I32, n: I32, k: I32, alpha: F32, a: F32$@,
        lda: I32, b: F32$@, ldb: I32, beta: F32, c: F32$@, ldc: I32)
```

**The name is the one `-l` takes.** `#link("openblas")` links whichever of `libopenblas.so`, `libopenblas.a` or `libopenblas.dylib` the linker finds, and `openblas.lib` on an MSVC target.

**One name per attribute, as a plain string** of letters, digits and `_` `+` `.` `-`, beginning with a letter, a digit or `_`.

| Written | Accepted? |
| :-- | :-- |
| `"openblas"` | Yes: a library name |
| `"-lopenblas"` | No, a compile error: a flag |
| `"/opt/blas/openblas"` | No, a compile error: a path |
| `"libopenblas.so"` | No, a compile error: a file name |

Two libraries take two `#link`s, each before the ones it uses (`#link("ssl") #link("crypto")`).

* **Only a block the compile keeps names its library.** A block `#cfg` drops names nothing, so the library follows the flag that keeps its declarations. A kept block names its library whether or not a call reaches it.
* **The order**: a file's libraries stand before those of the files it imports, and within a file in the order written. A library named twice is linked once, at its first place.
* **Where the library is looked for is the environment's choice** (`LIBRARY_PATH`, `LIB`, a `-L` passed to the link). Static or dynamic linking is the linker's usual choice. The source can state neither.

**`ksplc run` links the names itself.** A build that links by hand has the compiler write them out (`--emit-libs` in the development tools specification), and passes that file to the C compiler.

---

## 12. Implementation limits

Every KSPL compiler must accept nesting at least as deep as the table below says. The grammar itself does not limit nesting, but the compiler spends its own stack on each level it walks, so it must cut off somewhere. This section fixes where the cutoff may be: **a KSPL implementation must accept at least the following depths**, and may accept deeper.

| What is nested | The depth guaranteed | Example |
| :-- | --: | :-- |
| Blocks `{ }` | 64 | `{ { { … } } }` inside a function body |
| An expression's parentheses `( )` | 64 | `x: = ((((…1…))))` |
| A type's postfix steps (`@` / `[]` / `[N]` / `!`) | 64 | `I32@@@…@` |
| A `struct` embedded as a field | 64 | A run of `struct S64 { inner: S63; }` |
| A generic's type arguments | 64 | `List<\|List<\|…I32…\|>\|>` |
| A chain of typedefs | 256 | `typedef A256 = A255; … typedef A1 = I32;` |
| A chain of references between constants | 256 | `const C256 = C255; … const C1 = C0;` |

**A chain of references between constants is measured where its value must be fixed at translation time** (compile time: an array length, an enum tag, `#align`). A run-time expression gets by without walking the chain, so compiling one does not show the guarantee holds.

**Every place that counts a depth must allow at least the guaranteed value.** A later stage cutting off what an earlier one accepted reports no cutoff. It passes on a half-peeled type or a half-built structure, and the user sees an unrelated diagnostic, such as a type mismatch, with depth named nowhere.

Caution: **Input beyond the guaranteed value must be refused with a diagnostic naming depth as the cause**, neither cut off silently nor left to overflow the stack. Both are "writable but ineffective" (Principle 5 in [`DESIGN.md`](DESIGN.md)).

**Up to the guaranteed value, every target must accept the same input**, so only that much is portable. Beyond it, the accepted depth may vary with the output language's limits (a C compiler's parenthesis depth and the like). But the implementation must still diagnose the cutoff itself; the output compiler's error must not reach the user.

**The guaranteed values are not a guide to comfortable writing**: readable code is far shallower (Principle 3 gives 8 levels of nesting as a guide). They bound where the implementation behaves predictably on machine-generated code or abnormal input.

## 13. Conditions that stop execution at run time

The rules that **cannot be decided at translation time** (compile time) are checked while the program runs. A program breaking one stops at once; it never continues with a wrong value. With an OS, it writes one line to standard error and calls `abort` (which ends the process abnormally); on bare metal, it enters an infinite loop.

| Rule | What comes out when it is broken |
| :-- | :-- |
| A slice's or fixed-length array's index is at or above `0` and below `len` ([6.2.1](#621-member-access-and-indexing-through-a-pointer)) | `panic: index out of bounds in Slice.at_ref (idx: 4, len: 4)`. **`in <what>` names what stopped it**: for a container its implementation (`Slice.at` / `List.at` / `Tensor.at`), for a fixed-length array `array` |
| A shift amount is inside the left-hand side type's width ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)) | `panic: shift amount out of range (amount: 32, width: 32)` |
| An integer division's or remainder's divisor is not `0` ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)) | `panic: division by zero` |

**Every stop has one notation**: the prefix `panic: `, a wording that begins in lower case, and the position at the end as `at <file>:<line>`, as `std/lang`'s `panic` emits it (the caller's position in [8.1.1](#811-default-arguments)). It must not vary with what emitted it, or one event would have two strings to grep for; `make test-conventions` holds it.

**Stopping is the only outcome.** No value is rounded into range (the shift amount taken modulo the width, the index truncated), and nothing proceeds undefined. Rounding would give one rule two answers: refused at translation time, and silently another value at run time.

**Only this table is checked at run time.** Overflow wraps `mod 2^N` unchecked, `I32::MIN / -1` included ("A run-time overflow" in [6.8](#68-integer-arithmetic-folding-overflow-division-shifts)).

**The checks cannot be removed.** Trading them for speed would demote the rules above to "they probably hold", and the design built on this table presumes they always run. Why `[]` is the safe spelling, and an unchecked address computation is set apart as `(p + i)$`, is in [6.2.1](#621-member-access-and-indexing-through-a-pointer).

**A shift amount or an index fixed at translation time is caught then**: the shift amount by a compile error ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)), the index by the warning `[W0101]`. The run-time check is not a fallback for what those miss, but the output for an amount fixed only at run time.

## 14. What the implementation decides

The same source may mean different things per implementation or target. This chapter indexes where. **The rules live in the body**; this chapter shows only each one's category and where to look.

| Category | What it means | Can a program rely on it? | Listed in |
| :-- | :-- | :-- | :-- |
| Implementation-defined | The value is fixed, but differs per target | Yes, on its target, by asking (`sizeof`) rather than writing the number | [14.1](#141-implementation-defined---the-value-is-fixed-but-differs-per-target) |
| Undefined | No answer is fixed; anything may happen | No: these shapes must not be written | [14.2](#142-undefined---no-answer-is-fixed) |

There are only these two categories. **There is no "unspecified" category.** A middle ground where the implementation chooses freely, without even showing what it chose, would leave every rule in it examined by no one.

### 14.1 Implementation-defined - the value is fixed but differs per target

| What is fixed | Where it is fixed |
| :-- | :-- |
| The width of `Sz` and of a pointer (32 / 64) | [3.1](#31-primitive-types). It is the target machine's, the one named to the compiler, and a size folded from it is checked by the C compiler ([6.7](#67-built-in-operators)). A constant expression is **checked** against the lower bound every target guarantees, 32 bits ([6.8](#68-integer-arithmetic-folding-overflow-division-shifts)) |
| A `struct`'s size, alignment, and field offsets | [3.3](#33-structs-struct). Laid out by the target machine's widths, as its C compiler lays the struct out; a folded size or offset is checked by the C compiler ([6.7](#67-built-in-operators)) |
| The byte order of a multi-byte value (endianness) | [3.1](#31-primitive-types) |
| Which notations touching hardware directly can be used | `__kspl_inline_c`, and `__kspl_asm_volatile` carrying values, are for the C backend only ([11.4](#114-bare-metal-primitives)) |

A program may rely on the value on its target.

Caution: **Do not burn it into the source.** An expression assuming `Sz` is 8 bytes breaks silently on a 32-bit target; ask with `sizeof` ([6.7](#67-built-in-operators)).

### 14.2 Undefined - no answer is fixed

These shapes must not be written. The implementation need not diagnose them, and anything may happen at run time.

| Shape | Where it is written |
| :-- | :-- |
| A cast from floating point to an integer where the truncated value does not fit (`NaN` included) | [6.4](#64-type-conversion--and-implicit-casts) |
| A write to read-only data (`.rodata` / ROM) | [4.3](#43-places-and-the-rules-for-when-they-may-be-written) |
| A dangling pointer (one to memory already freed), use after free | [8.4](#84-the-memory-management-model-defer--arc--arenas) |
| A data race: two threads touching one place, at least one writing, with no lock or atomic operation ordering them | [5.4](#54-worked-example-forbidding-copies-with-move_only) |

**What is fixed at translation time is not left undefined.** Of the shapes above, those whose value is visible at translation time are compile errors (a constant expression's overflow, a shift amount and a divisor: [6.8](#68-integer-arithmetic-folding-overflow-division-shifts)). Of those fixed only at run time, only what [13. Conditions that stop execution at run time](#13-conditions-that-stop-execution-at-run-time) lists is checked.

### 14.3 What must be the same in every implementation

Every KSPL implementation, and both of the compiler's backends, must agree on these three points.

* **The two backends, C and LLVM, must give the same answer** for the same source, which is stronger than "it works on both". What C leaves open, such as an assignment's evaluation order, is fixed by the language ([6.5.1](#651-evaluation-order)).
* **The lower bounds of [12. Implementation limits](#12-implementation-limits) must be accepted.**
* **[13. Conditions that stop execution at run time](#13-conditions-that-stop-execution-at-run-time) must be checked.**

## Appendix A: Features not carried, and what to write instead

Many languages have features KSPL leaves out on purpose. The table names each one, what to write in KSPL instead, and why it is left out.

At the root are simplicity and language design by subtraction. **The test is not whether a feature is syntactic sugar** (a shorter way to write something the language can already say). KSPL desugars plenty, rewriting a short form into plain code: `!`, `catch`'s expression form, the ternary operator, string interpolation, operator overloading, closures. Each is accepted because it adds to what can be written while keeping one notation. What is turned away gives a second notation to something already writable, or adds implicit behavior ([`DESIGN.md`](DESIGN.md), "One notation per purpose"). Read the "Why" column by this test.

| Feature | The alternative in KSPL | Why |
| --- | --- | --- |
| **try-finally** | The `defer` statement. | With try-finally, each resource nests a level deeper, and returning early with `return` sits badly. `defer` runs on every way out (`return` / `throw` / `break` / `continue`), which is `finally`'s guarantee (§8.4.1). |
| **A destructor (`Drop`)**, a method run automatically when a value goes away | An explicit free via `defer`; for a type conforming to `Ref_counted` (such as `Rc` / `Arc`), the compiler inserts the counting (§8.4.2). | No hidden calls by default, so behavior stays deterministic. A use with frequent allocation and freeing (concurrency, shared ownership) chooses reference counting per type. No GC or ARC covers every type. |
| **Garbage collection** (GC: a runtime that finds and frees unused memory by itself) | `defer`, and values kept on the stack. | When something is freed can be read from the source. |
| **A cleanup joined onto its declaration** (C#'s `using var`, Lombok's `@Cleanup`, GCC's `cleanup` attribute) | A `defer` of its own on the line after the binding, naming it: `defer buf.free()` ([8.4.1](#841-the-defer-statement)). | One form for every cleanup, naming what it cleans up. A form bound to the declaration fixes what runs (`Dispose`, `close`, the attribute's function). One that took any call would need a receiver filled in, as no other construct does ([`DESIGN.md`](DESIGN.md), "Notations not carried"). |
| **Class inheritance** | Hold a struct inside another, and gather common behavior in a `trait`. | Keeps the memory layout simple. |
| **Named actual arguments** (`f(offset = 0)`) | Take the settings as a struct, written `::{ .name = value }` (an omitted field is 0). | One call would have two spellings (`f(0)` and `f(offset = 0)`), and **parameter names would become published API** (Python offers the positional-only `/` to keep them out of it). Through a function-pointer type, the names in the type and in the definition may disagree. |
| **Function overloading** (several functions with one name, told apart by their parameters) | Make it generic, or give each its own name. | No tracing which of several same-named candidates is called. |
| **A distinct type made from another** (Go's `type Id int`, Haskell's `newtype`), or another language's spelling of another name for a type (`type Id = I32` in Rust, Go and Python; `typealias` in Swift and Kotlin; `using Id = I32;` in C++; `alias` in D; C's own order, `typedef I32 Id;`) | For a distinct type, a struct with one field (`struct User_id { v: I32 }`). For another name, `typedef Id = I32` ([3.5](#35-typedefs-typedef)): C's word, the new name first, the type after `=`. Each of those other spellings is a syntax error whose note writes this line. A `typedef` is only another name, indistinguishable from its type ([3.5.2](#352-a-typedef-is-only-another-name)). | One word, one meaning, one spelling. `typedef` stays a name, as in C, Rust and Swift, and a type kept apart is declared as one, so a mix-up is an error at no run-time cost. The order keeps the new name at the head of the line. C puts it after the type, or inside it for a function pointer (`typedef I32 (*Op)(I32);`). |
| **`?` for a result** (Rust's `f()?`, and `T?E` for its type) | `f()!` passes the failure on and `T!E` is the type ([8.3](#83-error-handling)). `T?` is an optional ([3.2](#32-derived-types)); a `?` after a value, or a name after `T?`, is a syntax error whose note names the `!` form. | `!` marks the place a function may stop and hand a failure back, and `?` marks absence, as other languages spell an optional value ([`DESIGN.md`](DESIGN.md), "Failure"). |
| **Another language's word for a loop or a branch** (`while` in C, Java, Python and Swift; Rust's `loop`; `match` in Rust, Python and Scala) | `for` with a condition alone (`for x > 0`) in place of `while`; a bare `for`, which repeats until a `break` leaves it, in place of `loop`; `switch x case ...` in place of `match` ([7.1](#71-branching), [7.2](#72-loops)). Each is a syntax error whose note writes the KSPL head. The three words stay usable as names. | One word for each job, spelled as C spells it, so a keyword takes no name a writer would use ([`DESIGN.md`](DESIGN.md), "The spelling of reserved words is taken from C"). |
| **`::` as a path separator** (`Arena::new(1024)`, `io::out()`, `Shade::dark`) | `.`, which reaches a module's member, a type's own and a value's alike: `Arena.new(1024)`, `io.out()`, `Shade.dark`. `::` is the cast (`I32::n`) and a literal's type (`T::{ … }`); written as a path, it is an error naming the `.` spelling. | A second mark would give a member two spellings, and `::` already has a job: `json::Val` would read like `Sz::n`. A local named like an imported module hides it, and gets a warning at its declaration ([4.5](#45-scope-and-shadowing)). |
| **Range syntax (`a..b`)** | `for x in` over `std/lang`'s `Range` (`Range.asc(n)` / `Range.desc(n)` / `Range.new(start, stop, step)`). | A call already writes it, so an operator would be a second notation. `a..b` does not show whether its bound is exclusive; `Range.new`'s argument names do (`stop` is exclusive). |
| **`a[i..j]` for cutting out a slice** | `s.sub(start, len)` / `s.sub_from(start)` from `std/chars`, which the calling file imports: a view, not a copy (the writable one is `sub_mut`). | Keeps the language small. It cuts any element type alike ([3.2](#32-derived-types)); `std/seq`'s `take` / `skip` are another entry point, copying into a `List`. |
| **Tuples** (unnamed groups of values, such as `(1, "a")`) | A struct (`struct`). | Each returned value gets a name, so the contents can be read. |
| **A named local function** | Bind a closure ([8.1](#81-definitions)), or a non-public method inside an `impl`. | Only a closure can be written inside a function body, and it cannot be named and reused from several functions (its environment rides on the caller's frame). Move a reused predicate to the top level. |
| **A closure that can be taken outside its function** | A `struct` holding the values to capture, passed as an argument. | A closure ([8.1](#81-definitions)) keeps its captured values on the frame that built it, so it cannot leave the function. Where they must leave, hold them in an ordinary struct and decide its lifetime yourself. |
| **A trailing closure** (Swift's `xs.sorted { … }`, Kotlin's `xs.filter { … }`) | The closure inside the call's parentheses, `count_over(xs, fn(x: I32; n: I32): Bool { return x > n })`, or bound to a name first and the name passed ([8.1.3](#813-closures)). A `fn` right after a call's `)` is an error naming both. | One call would have two spellings (`f(xs, g)` and `f(xs) g`). The last parameter, which a trailing closure fills, is where the standard library takes the arena. And in the indentation notation, a closure after `if xs.any()` could not be told from the `if`'s body ([`DESIGN.md`](DESIGN.md), "Why a closure is not written after the call"). |
| **A static variable inside a function** | A top-level variable whose name shows its purpose. | State persisting across calls lines up at the head of the file, where what touches it can be seen. |
| **A counterpart to `guard let` / `?.` / `??`** | Return early with `return` ([7.1](#71-branching)); to take an `Option` in a condition, `if name: = expression`. | Keeps the flow of control plain. **`if name: = expression` is the one exception**, and it merely expands into a `switch`, working on nothing but an `Option`. |
| **A documentation comment in front of what it documents** (`///`, `/** */`, a `@param x` tag), or inside it (`//!`) | `//<` after the thing, on its own line, a parameter's on the parameter: `fn add(a: I32, b: I32): I32 //< adds two numbers`; a file's own is `//<` before its first line of code ([2.1](#21-comments)). | A description sits on what it describes, and no name is written twice. Everywhere else, `///` and `//!` point at the next thing and at the enclosing one, so here they are a warning, not documentation. |
| **Link flags in the source** (Go's `#cgo LDFLAGS`, MSVC's `#pragma comment(linker, ...)`) | `#link("name")` on the `extern` block, one library name each; a search path and every other flag stay with the build ([11.5](#115-naming-the-library-an-extern-block-needs-link)). | A flag in the source forces one machine's link line on every machine that builds it, and a flag can run code at build time (Go narrows its `#cgo` flags with an allowlist for that). A name carries neither. |
| **A postfix `if` / a conditional `break`** (`break if done`) | `break` / `continue` inside an ordinary `if` block. | The action before its condition runs against reading top to bottom (the condition, then the contents). |

## Appendix B: The standard library

The standard library under `std/` is part of the language's foundation, which the compiler itself depends on too. How an import is written, and that only `std/lang` enters implicitly, are in ["9. Files and import"](#9-files-and-import). [`../std/README.md`](../std/README.md) lists the files by purpose, with the way into each file's design grounds.
