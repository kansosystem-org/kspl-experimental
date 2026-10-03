# A tour of KSPL

**One step at a time, and every step is code that runs.** The walk below is one program: each section is one declaration of it, with what that step teaches beside the code. The whole of it is [`../ksplc/tests/kspls/tour.kspls`](../ksplc/tests/kspls/tour.kspls), and the same program written with braces is [`../ksplc/tests/kspls/tour.kspl`](../ksplc/tests/kspls/tour.kspl); `make test-kspls` holds the two to one C.

**To run it, or anything of your own, the quick start is in the root [`../README.md`](../README.md)** — it fetches `ksplc`, writes a first file and runs it in three steps. Nothing on this page needs more than that.

**Do not edit this page.** It is written by `make tour` from the program and the program's own output, and `make test-docs` refuses a page older than its program.

## The steps

* **A name for a value, and why the type is written** — `limit`
* **Saying something, and what a function looks like** — `greet`
* **A binding that changes, and the three shapes of a loop** — `count_up`
* **Values laid side by side** — `Point`
* **Methods of one's own** — `Point`
* **What a type promises** — `Sized_thing`
* **Keeping the promise** — `Point`
* **Saying what a thing is, behind it** — `Span`
* **One of a few, and a variant that carries something** — `Shade`
* **Reading an enum with `switch`** — `shade_name`
* **A generic, and a function handed over** — `twice_of`
* **An error is a value, and it is listed** — `Step_error`
* **Failing, and a return type that says so** — `step`
* **Passing a failure on with `?`** — `step_twice`
* **`defer`, right below what it cleans up** — `pick_builder`
* **Leaving early** — `note`
* **Where the braces have to stay** — `tally`
* **A global, and why there is one here** — `seen`
* **Where memory comes from, and leaving two loops** — `gather`
* **Putting it together** — `main`

## A name for a value, and why the type is written

**A `const` cannot be assigned to.** The type (`Sz`, a size) is written out rather than inferred, because a top-level name is the file's interface and a reader of another file has only this line to go on. Inside a function the type may be left off.

```kspls
priv const limit: Sz = 4
```

## Saying something, and what a function looks like

**`io.out()` returns the writer for the terminal**, and `.s(…)` sends a string to it. A parameter's type comes after its name. This one returns nothing, so no return type is written.

```kspls
priv fn greet(who: U8[])
  io.out().s("hello, ").s(who).s(".\n")
```

## A binding that changes, and the three shapes of a loop

**A binding is immutable unless it opens with `$`.** `for a; b; c` counts, `for x in …` walks what it is given, and a bare `for` goes round until something stops it. `continue` takes the next turn; `else if` and `else` chain as they read.

```kspls
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

**A struct is its fields and nothing else** — no hidden header, no method table. It is built with `Point::{ .x = …, .y = … }`, and where the type is already known the name can be left off (`p: Point = ::{ … }`).

```kspls
priv struct Point
  x: I32
  y: I32
```

## Methods of one's own

**The receiver is written out**, so whether a method may rewrite the value is read off its signature: `Self@` is a pointer that only reads, `Self$@` one that may write. `p.moved(2)` passes `p` as `r`. A type's own function is reached with the same `.`, as a module's is (`Arena.new(…)`, `io.out()`): **`::` is never a path** — it builds a value (`Point::{ … }`) or casts one (`I32::n`).

```kspls
impl Point
  fn moved(r: Self@, by: I32): Point
    return Point::{ .x = r.x + by, .y = r.y + by }
```

## What a type promises

**A trait is a row of signatures.** Whoever asks for a `Sized_thing` may call `area` and knows nothing else about the value. `Self` stands for whichever type keeps the promise.

```kspls
trait Sized_thing
  fn area(r: Self): I32
```

## Keeping the promise

**The promise is kept in a block of its own**, named for the trait. Leave a signature out and the compiler refuses here, at the place that claimed to keep it, rather than at the call.

```kspls
impl Point: Sized_thing
  fn area(r: Self@): I32
    return r.x * r.y
```

## Saying what a thing is, behind it

**A description stands behind what it describes, on that thing's own line, marked `//<`**: a field's on the field, a parameter's on the parameter, the whole's on the opening line. The first line is the summary an editor's hover and `ksplc doc` open with; a `//<` with nothing after it parts it from the detail. **`///` and `//!` are not read**: elsewhere they point at the next thing and at the enclosing one, so the compiler warns rather than guess.

```kspls
priv struct Span
  from: Sz //< where it begins
  to: Sz //< just past where it ends
```

## One of a few, and a variant that carries something

**A variant may carry values**, so `mid(level: I32)` is "mid, and how mid". An enum is not a number: there is no arithmetic on it, and a value not listed cannot be made.

```kspls
priv enum Shade
  dark
  mid(level: I32)
  light
```

## Reading an enum with `switch`

**A `case` binds what its variant carries** — `.mid(level)` names the payload for that arm alone. `default` takes the rest. The `if … else` here is the expression form: it stands where a value is wanted, not where a statement is.

```kspls
priv fn shade_name(s: Shade): U8[]
  switch s case .dark
    return "dark"
  case .mid(level)
    return "mid" if level > 0 else "mid0"
  default
    return "light"
```

## A generic, and a function handed over

**`<|T|>` is a type the caller chooses**, and it is chosen at the call (`twice_of<|I32|>`). The second parameter is a function value: its type is its signature, so anything of that shape may be passed.

```kspls
priv fn twice_of<|T|>(v: T, add: fn(a: T, b: T): T): T
  return add(v, v)
```

## An error is a value, and it is listed

**What a function may fail with is an enum like any other.** A caller can `switch` on it, so there is nothing to match on a message or a number.

```kspls
priv enum Step_error
  too_far
```

## Failing, and a return type that says so

**`I32?Step_error` reads "an `I32`, or a `Step_error`".** The failure is in the signature, so a caller cannot ignore it by accident — there is no road that quietly returns 0.

```kspls
priv fn step(n: I32): I32?Step_error
  if n > 100
    throw Step_error.too_far
  return n + 1
```

## Passing a failure on with `?`

**A `?` says "or give up here and hand the failure to my caller".** It needs this function to be able to fail too, which its return type says. A `?` at a line's end does not carry the line on: the `return` below it is a statement of its own.

```kspls
priv fn step_twice(n: I32): I32?Step_error
  once: = step(n)?
  return step(once)?
```

## `defer`, right below what it cleans up

**`defer` runs when the block ends, however it ends.** It takes one statement that names what it cleans up (`defer b.free()` in `main` below), so it sits on the line after the binding; a cleanup of more than one statement goes in a block. A bare `.free()` has nothing in front of it and is refused.

```kspls
priv fn pick_builder(ok: Bool): Str_builder?Step_error
  if !ok
    throw Step_error.too_far
  return Str_builder.new()
```

## Leaving early

**A line holding `return` alone ends the function.** A value always starts on the `return`'s own line, so a line below is never read as one; a long value is split inside parentheses.

```kspls
priv fn note(on: Bool)
  if !on
    return
  seen += 1
```

## Where the braces have to stay

**A block holding a comment and nothing else cannot be written by indentation**, since a comment makes no step, so the braces are kept for that arm alone. The first `case` sits on the `switch`'s own line; the rest come at the `switch`'s column.

```kspls
priv fn tally(s: Shade)
  switch s case .dark
    seen += 1
  case .mid(_level) {
    // A variant that is not counted. As a sample it holds no content.
  } default
    seen += 2
```

## A global, and why there is one here

**A top-level `$` is mutable for the whole program.** It is here so the steps above have somewhere to leave a mark; a program of your own is better off handing the count along than reaching for one of these.

```kspls
priv $seen: Sz = 0
```

## Where memory comes from, and leaving two loops

**An arena hands out memory and takes it all back at once**, so a `List` built on one is let go with it and nothing is freed one by one. A label on a `for` lets `break` name which loop it leaves.

```kspls
priv fn gather(arena: Arena$@): List<|U8[]|>
  $out: = List<|U8[]|>.new(arena)
  for w in U8[][]::{ "a", "b", "c" }
    out.push(w)
    seen += 1
  outer: for
    for k in Range.asc(limit)
      if k == 2
        break outer
  return out
```

## Putting it together

**`main` is where a program starts, and what it returns is the exit code.** `catch` takes the failure a `?`-returning call may return: with a value after it, that value is used; with a block, the block runs and `fallback` gives the value. `\{…\}` puts a value into a string.

```kspls
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
  // closed on `catch <name>`: broken there, the handler lands at the block's own column and is
  // read as its first statement ("The formatting settings (`--style`)" in `ksplc/docs/SPEC-
  // tools.md`).
  far: =
    step(1000 + moved.x + moved.y + p.x + p.y + p.area() + moved.area() + p.moved(1).x) catch refusal_reason
    switch refusal_reason case .too_far
      io.out().s("too far.\n")
    fallback -2
  $b: = pick_builder(true) catch
    io.out().s("the place to assemble into could not be taken.\n")
    fallback Str_builder.new()
  defer b.free()
  b.s("held")
  note(true)
  note(false)
  tally(Shade.dark)
  tally(Shade.mid(1))
  words: = gather(arena)
  // **It carries a label.** A block with no heading cannot be told from a continuation of the
  // statement before it, so a bare `{ … }` is writable in neither notation.
  while_locked:
    io.out().s("a labelled block passes too.\n")
  defer io.out().s("defer comes out last.\n")
  io.out().s("area=\{p.area()\} moved=(\{moved.x\},\{moved.y\})\n")
  io.out().s("span=\{span.to - span.from\}\n")
  io.out().s("shade=\{shade_name(Shade.mid(1))\}/\{shade_name(Shade.dark)\}\n")
  io.out().s("step=\{ok\}/\{bad\}/\{far\} twice=\{twice_of<|I32|>(5, add_i32)\}\n")
  io.out().s("count=\{count_up(6)\} words=\{words.len\} seen=\{seen\} b=\{b.slice()\}\n")
  io.out().s("twice=\{step_twice(1) catch -1\}/\{step_twice(999) catch -1\}\n")
  return 0
```

## The same program, written with braces

**KSPL is written either way, and the two are one language.** A `.kspls` file is laid out by indentation, a `.kspl` file with braces and `;`; `ksplc fmt --to=` goes between them, and the compiler puts out the same C for both. One step, in the other spelling:

```kspl
priv fn shade_name(s: Shade): U8[] {
  switch s case .dark {
    return "dark";
  } case .mid(level) {
    return "mid" if level > 0 else "mid0";
  } default {
    return "light";
  }
}
```

The whole of it that way is [`../ksplc/tests/kspls/tour.kspl`](../ksplc/tests/kspls/tour.kspl).

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

The language rule by rule, for looking a thing up rather than reading through, is [`SPEC-language.md`](SPEC-language.md). To set a project of your own up — an executable to hand out, a program split over files, VS Code with the language server and the debugger — the steps are [`HOWTO-set-up-a-project.md`](HOWTO-set-up-a-project.md).
