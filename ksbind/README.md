# ksbind

**Bindings to C libraries that come from outside the toolchain (KSPL's compiler and the C compiler it uses): a TLS client over OpenSSL, and SQLite.** A *binding* lets KSPL code call a library written in C. TLS is the encryption behind `https://`; SQLite is a small database kept in one file. Each binding is KSPL calling the library's own functions, with no C of its own; the library has to be installed where the program is built.

They are for whoever needs an encrypted connection or a SQL database from KSPL. They are not in `std`, which builds anywhere with nothing installed. Why they stand apart, and how OpenSSL's macros are reached without a header, is [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md).

## Run it

**`make test` runs the tests from this folder** with a `ksplc`, a C compiler and the libraries ([`ksbind/Makefile`](Makefile)). Where the libraries do not link, it says `SKIPPED` and names them. ksbind names itself in [`ksbind/ksplc.cfg`](ksplc.cfg), so a copy of this folder alone runs them the same way.

A program uses a binding like this: it opens an in-memory database, makes a table, stores 42 and reads it back, printing `n=42`. `ksplc run` links the library the binding names.

```kspl
import "ksbind/db"
import "std/io"

fn main()
    conn: = db.Db.open(":memory:") catch
        return
    defer conn.free()
    conn.exec("CREATE TABLE t (n INTEGER)") catch
        return
    conn.exec("INSERT INTO t (n) VALUES (42)") catch
        return
    stmt: = conn.prepare("SELECT n FROM t") catch
        return
    defer stmt.free()
    stmt.step() catch
        return
    io.out().s("n=\{stmt.column_i64(0)\}\n")
```

## What is here

Each file is one binding, and the table says what you must install to use it.

| File | Content | What it needs installed |
| :-- | :-- | :-- |
| [`ksbind/tls.kspl`](tls.kspl) | A TLS client on top of a `std/net` connection, verifying the certificate and the host name | OpenSSL 1.1.0 or later (`libssl-dev`) |
| [`ksbind/db.kspl`](db.kspl) | One SQLite connection: prepared statements, bound values, rows read back, and a struct bound or read as a whole row | SQLite 3 (`libsqlite3-dev`) |
| [`ksbind/tests/`](tests/) | The tests, on the loopback and an in-memory database; the TLS peer makes its own certificate in memory | OpenSSL 1.1.1 or later, for the peer's Ed25519 key |

What each file publishes is what `ksplc doc ksbind/<file>` prints.

## Pitfalls

Both traps concern linking: the step after compiling, where the C compiler joins the program with its libraries.

* **A library the linker does not find fails the link, not the compile**, and the linker's message names `-l<name>`. Where it is installed outside the linker's search path (Homebrew's OpenSSL on macOS, say), tell the C compiler with `LIBRARY_PATH`.
* **OpenSSL is linked as `ssl` and `crypto`**, the names on Linux, macOS and MSYS2. The MSVC toolchain names them `libssl` and `libcrypto`, and does not link this binding.

## Further reading

* [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) — why the bindings stand apart from `std`, how KSPL reaches a C macro and C's `long` type, and what each binding guards against.
* [`ksbind/SURFACE.txt`](SURFACE.txt) — the record of the published API, written by `make surface` and checked by `make test-surface` ("The record of a published API" in [`docs/SPEC-gates.md`](../docs/SPEC-gates.md)).
* [std](../std/README.md) — the way in to `ksbind`'s only KSPL dependency; every file it publishes is listed by `ksplc doc std`.
