# ksbind

ksbind provides bindings for OpenSSL and SQLite. A *binding* lets KSPL code call a C library. OpenSSL provides Transport Layer Security (TLS), the encryption used by `https://`. SQLite provides a small database stored in one file. The bindings contain only KSPL code and call the libraries directly. Install each library where you build the program.

Use ksbind for encrypted connections or SQL databases. These libraries are separate from the toolchain: KSPL's compiler and the C compiler it uses. They remain outside `std`, which requires no additional libraries. [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains this separation and access to OpenSSL macros without headers.

## Run it

Run `make test` from this folder with `ksplc`, a C compiler, and the libraries installed ([`ksbind/Makefile`](Makefile)). If a library cannot link, the tests report `SKIPPED` and name it. [`ksbind/ksplc.cfg`](ksplc.cfg) declares the package name. A copy of this folder runs the same tests independently.

This example opens a database in memory and creates a table. It stores 42, reads the value, and prints `n=42`. `ksplc run` links the library named by the binding.

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

Each source file provides one binding. The table lists the required libraries.

| File | Content | What it needs installed |
| :-- | :-- | :-- |
| [`ksbind/tls.kspl`](tls.kspl) | A TLS client using a `std/net` connection. It verifies the certificate and host name | OpenSSL 1.1.0 or later (`libssl-dev`) |
| [`ksbind/db.kspl`](db.kspl) | A SQLite connection with prepared statements, bound values, and row access. It can bind or read a structure as a whole row | SQLite 3 (`libsqlite3-dev`) |
| [`ksbind/tests/`](tests/) | Tests using loopback connections and a database in memory. The TLS peer creates its certificate in memory | OpenSSL 1.1.1 or later, for the peer's Ed25519 key |

Run `ksplc doc ksbind/<file>` to list a file's published API.

## Pitfalls

**TLS operations have no deadline.** `Tls_stream.connect` waits for the TLS handshake after opening the TCP connection. A peer that stops responding can leave the caller waiting indefinitely. Reads, writes, and closing the TLS stream can also wait for the peer. Do not use this API where network operations must finish within a fixed time.

Linking combines the compiled program with its libraries. These limitations apply:

* A missing library causes a link failure after compilation. The linker message names `-l<name>`. If the library is outside the search path, set `LIBRARY_PATH`. Homebrew's OpenSSL on macOS is one example.
* The binding links OpenSSL as `ssl` and `crypto` on Linux, macOS, and MSYS2. The MSVC toolchain uses `libssl` and `libcrypto`, so it cannot link this binding.

## Further reading

* [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains the separation from `std`, access to C macros and `long`, and each binding's checks.
* [`ksbind/SURFACE.txt`](SURFACE.txt) records the published API. `make surface` writes it. `make test-surface` checks it. See [`docs/SPEC-gates.md`](../docs/SPEC-gates.md).
* [std](../std/README.md) introduces ksbind's only KSPL dependency. `ksplc doc std` lists its published files.
