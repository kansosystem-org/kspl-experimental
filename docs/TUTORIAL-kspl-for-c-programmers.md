# KSPL for C programmers

**This page teaches KSPL to a programmer who knows C well, by what C already does.** A step shows the C you would write, then the KSPL, then what differs and why. The C is there to compare; nothing compiles it. Each section shows one piece of the program and says what that piece teaches. At the end, `main` puts the pieces together, and the page shows what the program prints. Joined in order, the KSPL code blocks are the whole program, which the gates compile and run; it is also one file, [`../ksplc/tests/notation/tutorial_for_c.kspl`](../ksplc/tests/notation/tutorial_for_c.kspl).

**To run it, or anything of your own, the quick start is in the root [`../README.md`](../README.md).** It fetches `ksplc`, writes a first file and runs it in three steps. Nothing on this page needs more than that. To try a line, `ksplc run -` reads a program from standard input, and `ksplc run --eval='import "std/io"; fn main() { io.out().s("hi\n") }'` takes one from the command line.

**A word the page uses without explaining it**, such as *arena* or *generic*, is in "Words used throughout" in [`SPEC-documents.md`](SPEC-documents.md).

**Do not edit this page.** It is written by `make tutorial` from the program and the program's own output, and `make test-docs` refuses a page older than its program.

## The types you will meet

**A type is written after a name, with a colon**: `n: I32`. These are the ones the walk uses before it explains them.

| Written | What it is |
| :-- | :-- |
| `I32` | A 32-bit signed integer |
| `Sz` | A size or an index: a signed integer as wide as a pointer |
| `Bool` | `true` or `false` |
| `U8[]` | A string: a read-only slice (a view onto memory) of bytes |
| `T@` / `T$@` | A pointer to a `T` that only reads / that can write |
| `T!E` | A `T`, or the error `E` when the function fails |

## The steps

1. **Bringing in what the program uses** — `import`
1. **Printing** — `show`
1. **A constant instead of `#define`** — `MAX_ITEMS`
1. **Integer types, and no quiet conversion** — `mean`
1. **Declarations: immutable unless marked `$`** — `count_words`
1. **A slice instead of a pointer and a length** — `sum`
1. **Writing through a slice** — `double_all`
1. **Pointers: `@` for the address, `$` to reach through** — `bump`
1. **Pointer arithmetic, kept for C's sake** — `byte_at`
1. **`Str` instead of `sprintf`** — `label`
1. **Structs** — `Item`
1. **Methods** — `Item`
1. **Enums are not integers** — `Kind`
1. **`switch`: no fallthrough, and no case left out** — `Kind`
1. **An error is a value with a name** — `Parse_error`
1. **Failing, and a type that says so** — `parse_count`
1. **Passing a failure on with `!`** — `parse_item`
1. **An arena instead of `malloc`** — `read_items`
1. **`defer` instead of `goto cleanup`** — `report`
1. **No header file: `import`, `pub` and `priv`** — `version`
1. **`#cfg` instead of `#ifdef`** — `MODE`
1. **Calling C with `extern fn`** — `abs`
1. **Being called from C** — `total_of`
1. **Putting it together, and building it** — `main`

## Bringing in what the program uses

**An `import` names another file by its path, and the program reaches that file's names through the path's last part**: after `import "std/io"`, it writes `io.out()`. A name listed in braces (`{ List }`) is written bare instead.

```kspl
import "std/chars" // `find_char`, `sub` and `sub_from` on a `U8[]`
import "std/ds" { List }
import "std/io"
import "std/mem" { Arena }
import "std/str" { Str }
```

## Printing

In C, a value is printed through a format string:

```c
void show(const char *name, int count) { printf("%s: %d\n", name, count); }
```

```kspl
priv fn show(name: U8[], count: I32)
    io.out().s("\{name\}: \{count\}\n")
```

**`io.out()` is standard output, and `.s(…)` writes a string to it.** `\{…\}` puts a value into the text, and the value's type chooses how it is written. So no `%d` can disagree with its argument. A parameter's type comes after its name, and `U8[]` is a string.

**What you gain:** A format string can no longer disagree with its arguments. A mismatched `%d` is gone, with the crashes and warnings it brings.

## A constant instead of `#define`

In C, a constant is often a macro:

```c
#define MAX_ITEMS 8
```

```kspl
priv const MAX_ITEMS: Sz = 8
```

**A `const` is a typed name, not text that is pasted in.** It obeys scope, and the compiler works its value out. `priv` keeps the name inside this file, as `static` does in C. `Sz` is the type for sizes and indexes. It is a signed integer as wide as a pointer, as C's `ptrdiff_t` is.

**What you gain:** A constant has a type and a scope. Another file cannot redefine it, and it cannot change meaning inside an expression, as a macro without brackets can.

## Integer types, and no quiet conversion

In C, mixing `int` with `size_t` converts the `int` silently:

```c
int mean(int total, size_t count) { return total / count; } /* -6 / 3 is huge */
```

```kspl
priv fn mean(total: I32, count: Sz): I32
    if count == 0
        return 0
    return total / I32::count
```

**Every integer type names its width: `I8` to `I64`, `U8` to `U64`, and `Sz`.** A value converts by itself only where nothing can be lost, as from `I32` to `Sz`. A narrowing is written as a cast, `I32::count`. A signed and an unsigned type of one width do not mix at all.

**An overflow wraps in two's complement, signed or not.** C leaves a signed overflow undefined. To be told about one, `std/checked_int` has `checked_add` and its siblings ("6.8 Integer arithmetic" in the specification).

**What you gain:** Mixing signed and unsigned, or losing bits, is a compile error you see at once. It is not a wrong answer at run time. An overflow never lets the compiler drop your check, as C's undefined signed overflow can.

## Declarations: immutable unless marked `$`

In C, a local can change unless it says `const`:

```c
size_t n = 0;
for (; *s; s++) if (*s != ' ' && (s == start || s[-1] == ' ')) n++;
```

```kspl
priv fn count_words(text: U8[]): Sz
    $n: Sz = 0
    $inside: = false
    for c in text
        if c == ' '
            inside = false
        else if !inside
            inside = true
            n += 1
    return n
```

**`name: Type = value` declares a name, and `$` in front lets it change.** Without `$`, a name keeps its first value, which is C's `const` turned round. `$inside: = false` leaves the type to the value. `for c in text` walks the bytes, and no NUL ends the string. There is no `++`; write `n += 1`.

**What you gain:** The names that change stand out by their `$`, and the compiler refuses a write to any other. A value you meant to keep cannot be changed by a slip.

## A slice instead of a pointer and a length

In C, an array reaches a function as a pointer, and its length travels apart:

```c
int sum(const int *values, size_t n);
```

```kspl
priv fn sum(values: I32[]): I32
    $total: I32 = 0
    for v in values
        total += v
    return total
```

**`I32[]` is a slice: a pointer and a length in one value.** `values.len` is the length, and every `values[i]` is checked against it. An index out of range stops the program with a message, instead of reading past the end. No build turns the check off. "13 Conditions that stop execution at run time" in the specification lists every such check.

**What you gain:** An index out of range stops at the line at fault, with a message. It does not spoil memory and fail somewhere else later. A length can no longer be passed wrong, as it travels with the data.

## Writing through a slice

In C, a pointer can write unless it says `const`:

```c
void double_all(int *values, size_t n) { for (size_t i = 0; i < n; i++) values[i] *= 2; }
```

```kspl
priv fn double_all(values: I32$[])
    for i in Range.asc(values.len)
        values[i] *= 2
```

**`$` before `[]` lets the function write the elements.** It is the other way round from C: `I32[]` is `const int *`, and `I32$[]` is `int *`. A caller sees from the signature alone which of its data can change. `Range.asc(n)` counts from 0 up to `n - 1`.

**What you gain:** Whether a function may write is in its type, and read-only is the default. In C, a missing `const` goes unnoticed; here, a missing `$` is a compile error at the first write.

## Pointers: `@` for the address, `$` to reach through

In C, `&` takes an address and `*` follows one:

```c
void bump(int *counter) { (*counter)++; } /* the caller writes bump(&n); */
```

```kspl
priv fn bump(counter: I32$@)
    counter$ += 1
```

**`T@` is a pointer that reads, and `T$@` one that writes.** `n@` takes the address, as `&n` does, and `counter$` is the value it points at, as `*counter` is. Both are written after the name. `.` reaches a field through a pointer too, so there is no `->`.

**What you gain:** A signature says whether the callee may change what it is given, and the compiler holds it to that. There is no `->` beside `.` to choose between.

**`@` and `$` stand after what they act on, so they read left to right and chain with no brackets.** `pp$$` is C's `**pp`, and `p$.count` cannot be misread, as C's `*p.count` is. Types read the same way: `I32@@` is a pointer to a pointer to `I32`, with no declarator spiral to unwind.

## Pointer arithmetic, kept for C's sake

In C, `p[i]` and `*(p + i)` are the same thing, and neither is checked:

```c
unsigned char byte_at(const unsigned char *start, ptrdiff_t i) { return start[i]; }
```

```kspl
priv fn byte_at(start: U8@, i: Sz): U8
    return (start + i)$
```

**`start + i` steps by elements, as in C, and `(start + i)$` reads there with no check.** A read outside the memory `start` points into is undefined, as in C. `start[i]` is refused on a raw pointer, since it has no length to check against. So an unchecked read always shows in the text. Use a slice wherever you can.

**What you gain:** Nothing is taken away from C here. An unchecked access has its own shape, `(p + i)$`, so a reviewer can find each one with a search.

## `Str` instead of `sprintf`

In C, a string is put together in a buffer whose size you guess:

```c
char buf[64];
snprintf(buf, sizeof buf, "%s x%d\n", name, count);
```

```kspl
priv fn label(out: Str$@, name: U8[], count: I32)
    out.s(name).s(" x\{count\}").c('\n')
```

**A string is a `U8[]`: a slice of bytes with a length, and no NUL at the end.** A `Str` collects bytes and grows as it must, so it cannot overflow. Its owner frees it, as a later step shows. `.c(…)` writes one byte, and `\{…\}` works here as it does in `io.out()`.

**What you gain:** No buffer size to guess, and no `char[]` to overflow. A string that holds a zero byte still works, since nothing looks for a NUL.

## Structs

In C:

```c
struct item { const char *name; int count; };
struct item it = { .name = "bolt", .count = 3 };
```

```kspl
priv struct Item
    name: U8[] //< the item's name: a view into the text it was read from
    count: I32
```

**A struct's name is its type, so no `typedef struct` is needed.** Its fields are laid out as C lays them out. `Item::{ .name = "bolt", .count = 3 }` builds one, as C99's designated initializers do, and a field left out is 0.

**What you gain:** Less to write than C, with the same layout, so a struct passes to C code unchanged.

## Methods

In C, a function that works on a struct takes a pointer to it:

```c
int item_is_empty(const struct item *it) { return it->count == 0; }
```

```kspl
impl Item
    fn is_empty(r: Self@): Bool
        return r.count == 0
```

**A method is a function inside `impl`, and its first parameter is the value it is called on.** `Self@` reads that value through a pointer, and `Self$@` could write it. The call is `it.is_empty()`, and `it` is passed by its address.

**What you gain:** A type's functions sit with it, and `item.is_empty()` reads in the order you think. The call is still a plain function call, with no hidden cost.

## Enums are not integers

In C, an enum is an `int`, and a value that carries data needs a tag and a union:

```c
enum kind { TOOL, FOOD, OTHER };
struct kinded { enum kind tag; union { int code; } as; };
```

```kspl
priv enum Kind
    tool
    food
    other(code: I32)
```

**A KSPL enum is one of the values listed, and nothing else.** There is no arithmetic on it, and an integer becomes one only through a cast that checks the value. A variant can carry data, as `other` carries `code`, so the tag and the union are one thing.

**What you gain:** A value outside the list cannot exist, so no `default:` is needed to guard against one. A variant's data cannot be read under the wrong tag, as a union's can.

## `switch`: no fallthrough, and no case left out

In C, each case needs its `break`, and a missing enum value is at most a warning:

```c
switch (k) { case TOOL: return "tool"; case FOOD: return "food"; default: return "?"; }
```

```kspl
impl Kind
    fn name(r: Self): U8[]
        switch r
        case .tool
            return "tool"
        case .food
            return "food"
        case .other(code)
            return "other" if code > 0 else "unknown"
```

**A `case` never falls into the next one, so there is no `break`.** The compiler checks that the cases cover every variant. Leave one out, and the program does not compile. `.other(code)` names the data the variant carries, for that case alone.

**What you gain:** Adding a variant shows every `switch` that must handle it, as compile errors. In C, it falls silently into `default`, or into nothing.

## An error is a value with a name

In C, a failure is a number: a return of `-1`, and a code in `errno`.

**The ways a function can fail are an enum.** A caller can `switch` on them, and no global holds the last one.

**What you gain:** The ways a call can fail are listed in its type, so a caller sees them all. There is no global `errno` to read too late, or after another call has changed it.

```kspl
priv enum Parse_error
    empty
    not_a_number
```

## Failing, and a type that says so

In C, the result and the failure share the return value, or the result goes out through a pointer:

```c
int parse_count(const char *s, int *out); /* returns -1 on a failure */
```

```kspl
priv fn parse_count(text: U8[]): I32!Parse_error
    if text.len == 0
        throw .empty
    $n: I32 = 0
    for c in text
        if c < '0' || c > '9'
            throw .not_a_number
        n = n * 10 + (c - '0')
    return n
```

**`I32!Parse_error` is an `I32`, or a `Parse_error`.** `return` gives the value, and `throw` gives the error. A caller cannot reach the value without deciding what a failure does. A result left unread is a compile error. Nothing unwinds the stack: `throw` is a return of the other kind.

**What you gain:** A failure cannot be lost by forgetting to check a return code: the compiler refuses a result that is never read.

## Passing a failure on with `!`

In C, every call is followed by a check that hands the failure up:

```c
if (parse_count(rest, &n) < 0) return -1;
```

```kspl
priv fn parse_item(line: U8[]): Item!Parse_error
    at: = line.find_char(' ') catch
        throw .empty
    return Item::{ .name = line.sub(0, at), .count = parse_count(line.sub_from(at + 1))! }
```

**A `!` after a call hands a failure on to the caller, and gives the value otherwise.** It is the `if (…) return -1;` line, in one character. `catch` deals with a failure on the spot instead. `find_char` gives an index, or nothing, and the block under `catch` runs on nothing.

**What you gain:** Passing an error on takes one character instead of an `if` around each call, so the usual path stays easy to read.

## An arena instead of `malloc`

In C, each allocation is freed on its own, and a forgotten one leaks:

```c
struct item *items = malloc(cap * sizeof *items); /* realloc it; free it on every exit */
```

```kspl
priv fn read_items(text: U8[], arena: Arena$@): List<|Item|>
    $items: = List<|Item|>(arena)
    for line in text.lines(arena)
        item: = parse_item(line) catch
            continue
        items.push(item)
    return items
```

**An arena hands out memory and takes all of it back at once**, when the arena is freed. The `List` here grows inside `arena`, and the lines are views into `text`. So nothing in this function is freed one by one. A line that does not parse is skipped: the `catch` block runs `continue`.

**What you gain:** Many allocations end with one free. There is no `free` per object to forget, and no leak when a loop stops early.

## `defer` instead of `goto cleanup`

In C, cleanup on every way out is often a `goto`:

```c
char *buf = malloc(256);
/* ... on a failure: goto cleanup; ... */
cleanup: free(buf);
```

```kspl
priv fn report(items: Item[]): I32
    defer $b: = Str()
    $total: I32 = 0
    for it in items
        if it.is_empty()
            continue
        label(b@, it.name, it.count)
        total += it.count
    io.out().s(b.slice())
    return total
```

**`defer` in front of a declaration frees the value when the block ends, however it ends.** Here that is the `Str`, at the `return`.

**A use after a free is refused only where one function shows it.** There is no borrow check, so a pointer kept elsewhere past the free is undefined, as in C. "8.4.5 Tracking a free" in the specification says what is caught.

**What you gain:** The cleanup stands next to what it cleans. It runs on every way out of the block, a failure passed on with `!` included. No `goto` ladder to keep in order.

## No header file: `import`, `pub` and `priv`

In C, a function another file calls is declared again in a header:

```c
int version(void); /* in stock.h, which each user includes */
```

```kspl
fn version(): I32
    return 1
```

**There is no header. `import "path"` reads the other file itself**, as the first lines of this program do. `pub` opens a name to every file. A name with no mark, as here, is open to its own package, and `priv` keeps it to its file. `ksplc doc <file>` lists what a file publishes.

**What you gain:** No header to keep in step with its source, and no include order to get right. `pub` marks exactly what other files may use.

## `#cfg` instead of `#ifdef`

In C, the preprocessor keeps or drops a range of lines:

```c
#ifdef VERBOSE
static const char *mode = "verbose";
#endif
```

```kspl
#cfg(verbose)
priv const MODE: U8[] = "verbose"
#cfg(!verbose)
priv const MODE: U8[] = "quiet"
```

**`#cfg(flag)` keeps the declaration or statement under it only when the flag is set.** The option `--define=verbose` sets it, and `#cfg(!flag)` keeps one only when it is not set. It never cuts through the middle of a construct, as a range of lines can. There are no macros: write a function, and mark it `#inline` where speed needs that.

**What you gain:** No second language of macros beside the language. A flag keeps or drops a whole declaration or statement, which a reader sees at a glance.

## Calling C with `extern fn`

In C, a library's function is declared by its header:

```c
#include <stdlib.h> /* int abs(int); */
```

```kspl
extern fn abs(value: I32): I32
```

**`extern fn` with no body declares a C function, and the call goes straight to it.** The types must be C's own: `I32` is `int32_t`, and `Void@` is `const void *`.

**`Sz` is not `size_t`.** So a function that the C headers declare with `size_t`, such as `qsort`, cannot be declared this way. A library other than libc is named in the file with `##link("name")`. "11 C interoperability" in the specification has the rest.

**What you gain:** An existing C library stays usable, with one declaration for each function you call and no wrapper to generate.

## Being called from C

In C, the caller sees this declaration:

```c
int32_t total_of(const int32_t *values, ptrdiff_t count);
```

```kspl
extern fn total_of(values: I32@, count: Sz): I32
    return sum(I32[]::{ .ptr = values, .len = count })
```

**`extern` on a function with a body keeps its C name**, so C can call it. Without `extern`, the name carries its file's path, and C could not name it. A slice cannot cross to C, so a pointer and a length do, and the function makes them a slice again. The compile option `--library=<FILE>` writes the C header for every such function.

**What you gain:** KSPL can enter a C program one function at a time, so a project need not be rewritten at once.

## Putting it together, and building it

In C, the program is compiled and linked by a build file or a command:

```c
/* cc -Wall -o stock stock.c && ./stock */
int main(int argc, char **argv);
```

```kspl
fn main(): I32
    defer arena: = Arena(64 * 1024)
    show("items at most", I32::MAX_ITEMS)
    show("mean", mean(-6, 3))
    show("words", I32::count_words("two words"))
    $values: I32[3] = ::{ 1, 2, 3 }
    double_all(I32$[]::values)
    show("sum", sum(I32[]::values))
    show("from C's side", total_of(values[0]@, 3))
    $n: I32 = 0
    bump(n@)
    show("bumped", n)
    show("byte", byte_at("KSPL".ptr, 1))
    $items: = read_items("bolt 3\nnut x\nwasher 0\nscrew 12\n", arena)
    show("total", report(items.slice()))
    show(Kind.other(7).name(), version())
    show(Kind.food.name(), parse_count("") catch -1)
    show("abs", abs(-5))
    show(MODE, 0)
    return 0
```

**`ksplc run stock.kspl` compiles and runs a program in one step.** `ksplc stock.kspl stock` leaves an executable. No build file names the sources, since the imports do. `main` takes no parameters; `sys.args()` gives the command line. What `main` returns is the exit status.

**What you gain:** One command builds or runs a program. There is no Makefile or list of header dependencies to keep up.

## What it prints

```
items at most: 8
mean: -2
words: 2
sum: 12
from C's side: 12
bumped: 1
byte: 83
bolt x3
screw x12
total: 15
other: 1
food: -1
abs: 5
quiet: 0
```

## Where to go from here

| You want to | Read |
| :-- | :-- |
| Look a rule up: the language rule by rule, not for reading through | [`SPEC-programming-language.md`](SPEC-programming-language.md) |
| Set a project of your own up. That covers an executable to hand out and a program split over files. It also covers VS Code with the language server and the debugger | [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) |
| Find what the standard library offers: every file, then one file's names | `ksplc doc std`, then `ksplc doc std/io` |
| Understand a message from the compiler that carries a code, such as `W0207` | `ksplc explain <code>` |
