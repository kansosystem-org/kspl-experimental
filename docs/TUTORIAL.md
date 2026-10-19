# A tutorial of KSPL

**This page teaches KSPL by walking through one small program, one declaration at a time.** It is for programmers who know another language, such as Python, JavaScript or C. Each section shows one piece of the program and says what that piece teaches. At the end, `main` puts the pieces together, and the page shows what the program prints. Joined in order, the code blocks are the whole program, which the gates compile and run; it is also one file, [`../ksplc/tests/notation/tutorial.kspl`](../ksplc/tests/notation/tutorial.kspl).

**To run it, or anything of your own, the quick start is in the root [`../README.md`](../README.md).** It fetches `ksplc`, writes a first file and runs it in three steps. Nothing on this page needs more than that.

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
1. **Naming a value, and why the type is written** — `LIMIT`
1. **Saying something, and what a function looks like** — `greet`
1. **A changing binding, and the three shapes of a loop** — `count_up`
1. **Values laid side by side** — `Point`
1. **Methods of one's own** — `Point`
1. **What a type promises** — `Sized_thing`
1. **Keeping the promise** — `Point`
1. **Saying what a thing is, behind it** — `Span`
1. **One of a few, and a variant that carries something** — `Shade`
1. **Reading an enum with `switch`** — `shade_name`
1. **A generic, and a function handed over** — `twice_of`
1. **An error is a value, and it is listed** — `Step_error`
1. **Failing, and a return type that says so** — `step`
1. **Passing a failure on with `!`** — `step_twice`
1. **`defer`, right below what it cleans up** — `pick_builder`
1. **Leaving early** — `note`
1. **Where the braces have to stay** — `tally`
1. **A global, and why there is one here** — `seen`
1. **Where memory comes from, and leaving two loops** — `gather`
1. **Putting it together** — `main`

## Bringing in what the program uses

**An `import` names another file by its path, and the program reaches that file's names through the path's last part**: after `import "std/io"`, it writes `io.out()`. A name listed in braces (`{ List }`) is written bare instead. The `std/strfmt` line brings in no name the program writes. It lets `\{x\}` print each type. The `_` opening its `as` name tells the compiler the import is meant to go unused.

```kspl
import "std/ds" { List }
import "std/io"
import "std/mem" { Arena }
import "std/str" { Str_builder }
import "std/strfmt" as _strfmt // the route reaching `\{x\}`'s `fmt`; `_` asks for no `strfmt.`
```

## Naming a value, and why the type is written

**A `const` cannot be assigned to.** `Sz` is the type for sizes and counts. At the top of a file the type is written out rather than inferred. A top-level name is the file's interface, and a reader of another file has only this line to go on. Inside a function the type can be left off.

```kspl
priv const LIMIT: Sz = 4
```

## Saying something, and what a function looks like

**`io.out()` returns the writer for the terminal**, and `.s(…)` sends a string to it. A parameter's type comes after its name; `U8[]` is a string. This function returns nothing, so no return type is written.

```kspl
priv fn greet(who: U8[])
    io.out().s("hello, ").s(who).s(".\n")
```

## A changing binding, and the three shapes of a loop

**A binding (a name given to a value) is immutable unless it opens with `$`.** A loop takes one of three shapes: `for a; b; c` counts, `for x in …` walks what it is given, and a bare `for` goes round until something stops it. `continue` takes the next turn; `else if` and `else` chain as they read.

```kspl
priv fn count_up(n: Sz): Sz
    $total: Sz = 0
    for $i: Sz = 0; i < n; i += 1
        if i % 2 == 0
            total += i
        else if i == 3
            total += 10
        else
            continue
    return total
```

## Values laid side by side

**A struct is its fields and nothing else**: in memory it holds `x` and `y`, with no hidden header and no method table. It is built with `Point::{ .x = …, .y = … }`, and where the type is already known the name can be left off (`p: Point = ::{ … }`).

```kspl
priv struct Point
    x: I32
    y: I32
```

## Methods of one's own

**The receiver (the value a method is called on) is written out as the first parameter.** So whether a method can change the value is read off its signature. `Self@` is a pointer that only reads, `Self$@` one that can write. `p.moved(2)` passes `p` as `r`. A type's own function is reached with the same `.` as a module's (`Arena.new(…)`, `io.out()`). **`::` is never a path** to a name, as it is in C++ and Rust. It builds a value (`Point::{ … }`) or casts one (`I32::n`).

```kspl
impl Point
    fn moved(r: Self@, by: I32): Point
        return Point::{ .x = r.x + by, .y = r.y + by }
```

## What a type promises

**A trait is a list of function signatures that a type promises to have**, as an interface is in Java. Whoever asks for a `Sized_thing` can call `area` and knows nothing else about the value. `Self` stands for whichever type keeps the promise.

```kspl
trait Sized_thing
    fn area(r: Self): I32
```

## Keeping the promise

**The promise is kept in a block of its own**, named for the trait (`impl Point: Sized_thing`). Leave a signature out and the compiler refuses here, at the place that claimed to keep it, rather than at the call.

```kspl
impl Point: Sized_thing
    fn area(r: Self@): I32
        return r.x * r.y
```

## Saying what a thing is, behind it

**A description stands behind what it describes, on that thing's own line, marked `//<`.** A field's stands on the field, a parameter's on the parameter, the whole's on the opening line. The first line is the summary an editor's hover and `ksplc doc` open with; a `//<` with nothing after it parts the summary from the detail. **`///` and `//!` are not read.** In other languages they describe the next thing and the enclosing one. So the compiler warns rather than guess which is meant.

```kspl
priv struct Span
    from: Sz //< where it begins
    to: Sz //< just past where it ends
```

## One of a few, and a variant that carries something

**An enum is one of a fixed list of values, and a variant can carry values**, so `mid(level: I32)` is "mid, and how mid". An enum is not a number: there is no arithmetic on it, and a value not listed cannot be made.

```kspl
priv enum Shade
    dark
    mid(level: I32)
    light
```

## Reading an enum with `switch`

**A `case` binds what its variant carries**: `.mid(level)` names the payload (the value the variant carries) for that arm alone. `default` takes the rest. The `if … else` here is the expression form: it stands where a value is wanted, not where a statement is.

```kspl
priv fn shade_name(s: Shade): U8[]
    switch s
    case .dark
        return "dark"
    case .mid(level)
        return "mid" if level > 0 else "mid0"
    default
        return "light"
```

## A generic, and a function handed over

**`<|T|>` is a type the caller chooses**, so one definition serves every type (a generic). The type is chosen at the call (`twice_of<|I32|>`). The second parameter is a function value: its type is its signature, so any function of that shape can be passed.

```kspl
priv fn twice_of<|T|>(v: T, add: fn(a: T, b: T): T): T
    return add(v, v)
priv fn add_i32(a: I32, b: I32): I32
    return a + b
```

## An error is a value, and it is listed

**What a function can fail with is an enum like any other.** A caller can `switch` on it, so there is no message text or error number to match on.

```kspl
priv enum Step_error
    too_far
```

## Failing, and a return type that says so

**`I32!Step_error` reads "an `I32`, or a `Step_error`".** `throw` hands the error back to the caller as the result; nothing unwinds the stack. The failure is in the signature, so a caller cannot ignore it by accident: nothing quietly returns 0 instead.

```kspl
priv fn step(n: I32): I32!Step_error
    if n > 100
        throw .too_far
    return n + 1
```

## Passing a failure on with `!`

**A `!` after a call says "if this failed, give up here and hand the failure to my caller".** It needs this function to be able to fail too, which its return type says. A `!` at a line's end does not carry the line on: the `return` below it is a statement of its own.

```kspl
priv fn step_twice(n: I32): I32!Step_error
    once: = step(n)!
    return step(once)!
```

## `defer`, right below what it cleans up

**`defer` runs when the block ends, however it ends**: at its last line, or at a `return` or a `!` that leaves early. It takes one statement that names what it cleans up (`defer b.free()` in `main` below). So it sits on the line after the binding. A cleanup of more than one statement goes in a block. A bare `.free()` has nothing in front of it and is refused.

```kspl
priv fn pick_builder(ok: Bool): Str_builder!Step_error
    if !ok
        throw .too_far
    return Str_builder.new()
```

## Leaving early

**A line holding `return` alone ends the function.** A returned value always starts on the `return`'s own line, so a line below is never read as one. A long value is split inside parentheses.

```kspl
priv fn note(on: Bool)
    if !on
        return
    seen += 1
```

## Where the braces have to stay

**A block holding only a comment cannot be written by indentation.** A comment is not a statement, so laid out by indentation the block would be empty. The braces are kept for that arm alone. Every `case` and `default` sits at the `switch`'s column, the first on the line below it.

```kspl
priv fn tally(s: Shade)
    switch s
    case .dark
        seen += 1
    case .mid(_level) {
        // A variant that is not counted. As a sample it holds no content.
    } default
        seen += 2
```

## A global, and why there is one here

**A top-level `$` is a global variable: mutable, and shared by the whole program.** It is here so the steps above have somewhere to leave a mark. A program of your own is better off handing the count along than reaching for one of these.

```kspl
priv $seen: Sz = 0
```

## Where memory comes from, and leaving two loops

**An arena hands out memory and takes it all back at once.** So a `List` (a list that grows) built on one is let go with it, and nothing is freed one by one. A label on a `for` (`outer:`) lets `break` name which loop it leaves.

```kspl
priv fn gather(arena: Arena$@): List<|U8[]|>
    $out: = List<|U8[]|>.new(arena)
    for w in U8[][]::{ "a", "b", "c" }
        out.push(w)
        seen += 1
    outer: for
        for k in Range.asc(LIMIT)
            if k == 2
                break outer
    return out
```

## Putting it together

**`main` is where a program starts, and what it returns is the exit code.** `catch` handles the failure a call can return. With a value after it, that value is used instead; with a block, the block runs and `fallback` gives the value. `\{…\}` puts a value into a string.

```kspl
fn main(): I32
    arena: = Arena.new(1024 * 1024)
    defer arena.free()
    greet("Kanso")
    p: Point = ::{ .x = 3, .y = 4 }
    span: Span = ::{ .from = 2, .to = 5 }
    moved: = p.moved(2)
    ok: = step(9) catch 0
    bad: = step(999) catch
        io.out().s("step refused.\n")
        fallback -1
    // **A handler names the error.** The line is written past the width on purpose and still is not
    // closed on `catch <name>`. Broken there, the handler lands at the block's own column and is
    // read as its first statement ("The formatting settings (`--style`)" in `ksplc/docs/SPEC-
    // tools.md`).
    far: =
        step(1000 + moved.x + moved.y + p.x + p.y + p.area() + moved.area() + p.moved(1).x) catch refusal_reason
        switch refusal_reason
        case .too_far
            io.out().s("too far.\n")
        fallback -2
    $b: = pick_builder(true) catch
        io.out().s("the place to assemble into could not be taken.\n")
        fallback Str_builder.new()
    defer b.free()
    b.s("held")
    note(true)
    note(false)
    tally(.dark)
    tally(.mid(1))
    words: = gather(arena)
    // **It carries a label.** A block with no heading cannot be told from a continuation of the
    // statement before it. So a block of its own is written only with a label in front.
    while_locked:
        io.out().s("a labelled block passes too.\n")
    defer io.out().s("defer comes out last.\n")
    io.out().s("area=\{p.area()\} moved=(\{moved.x\},\{moved.y\})\n")
    io.out().s("span=\{span.to - span.from\}\n")
    io.out().s("shade=\{shade_name(.mid(1))\}/\{shade_name(.dark)\}\n")
    io.out().s("step=\{ok\}/\{bad\}/\{far\} twice=\{twice_of<|I32|>(5, add_i32)\}\n")
    io.out().s("count=\{count_up(6)\} words=\{words.len\} seen=\{seen\} b=\{b.slice()\}\n")
    io.out().s("twice=\{step_twice(1) catch -1\}/\{step_twice(999) catch -1\}\n")
    return 0
```

## What it prints

```
hello, Kanso.
step refused.
too far.
a labelled block passes too.
area=12 moved=(5,6)
span=3
shade=mid/dark
step=10/-1/-2 twice=10
count=16 words=3 seen=5 b=held
twice=3/-1
defer comes out last.
```

## Where to go from here

| You want to | Read |
| :-- | :-- |
| Look a rule up: the language rule by rule, not for reading through | [`SPEC-programming-language.md`](SPEC-programming-language.md) |
| Set a project of your own up. That covers an executable to hand out and a program split over files. It also covers VS Code with the language server and the debugger | [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md) |
