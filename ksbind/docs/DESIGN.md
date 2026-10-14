# ksbind — the design

`ksbind` lets a KSPL program use two C libraries that do not come with the toolchain: OpenSSL, for a TLS client (an encrypted connection, as HTTPS uses), and SQLite, for a database. Each binding is plain KSPL that calls the library's own functions.

Two requirements decide nearly all of its shape.

| Requirement | What it means for a program |
| :-- | :-- |
| **A program that binds no outside library needs nothing installed** | `std`, which every program reads, holds no binding, and the runtime every program carries holds none of these libraries' C |
| **A binding is KSPL and nothing else** | It calls the library's own functions, so `import` and `ksplc run` are all a program needs, with no C file to build and no switch to set |

## The design decisions

### The bindings stand apart from `std`

**The bindings to outside C libraries live in their own package, not in the standard library: `std` is plain KSPL over the runtime every program carries, and builds anywhere with nothing installed** (as `std` states it, "The standard library reaches only itself" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)). A program that wants them imports `ksbind/tls` or `ksbind/db`.

**Inside `std`, a binding would need a switch.** There are only two ways to have one, and both are bad:

* `std` builds only where OpenSSL and SQLite are installed; or
* each binding is compiled out by default and answers `unsupported` at run time.

The second leaves a call that compiles everywhere and does nothing until a build flag is set: writable but ineffective (Principle 5 in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)). And where a binding needs C, the only C `std` has is the runtime every program carries.

**How the standard libraries KSPL is matched against draw the line**:

| Language | TLS in the standard library | A database in the standard library |
| :-- | :-- | :-- |
| Rust, C++ | No; it comes from outside libraries | No; it comes from outside libraries |
| Go, Java | Yes, written in the language itself with no C library beneath it | Only an interface; the drivers are outside |
| Python | An `ssl` module that binds the system's OpenSSL, so what it can do follows the version of OpenSSL it was built against | A `sqlite3` module that binds SQLite, built with Python itself |

**Kanso writes no TLS of its own**: a home-made implementation of the protocol is a risk nothing here makes worth taking, so TLS is OpenSSL's. That leaves Python's shape or Rust's, and Python's puts into `std` the binding to an outside library that this design keeps out of it. So the shape is Rust's and C++'s: outside the standard library.

**There is no database interface in `std` either**, as Go and Java hold: with one driver, an interface above it would be a second way to reach the same thing (Principle 6), until a second driver gives it something to choose between.

**What it gives up**:

* **The bindings do not ship with `ksplc`.** A release carries `ksplc` and `std`; a program using `ksbind` is told where the folder stands, as any package is (`--pkg-src-dir`, "Outside parts are not fetched; only their location is stated" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).
* **A program's import names the package** (`ksbind/tls`, not `std/tls`), and its `ksplc.cfg` lists `ksbind` under `uses` where the program is a package.

### A binding calls its library directly, with no C of its own

**Each binding declares the C functions it calls inside its own `.kspls` file, and each `extern` block names its libraries with `#link`** (`ssl` and `crypto`, `sqlite3`). An `extern` block is where KSPL declares functions written in C. `#link` names the library to link, so `ksplc run` links it and no build file carries the names. No header of either library is in any translation unit (the C file a compiler turns into one object file): the declarations in the `.kspls` are the only ones C sees.

**A macro is reached through what it expands to.** A C macro is text the C preprocessor replaces before compiling, so it is not a function KSPL can call. OpenSSL spells several settings as macros over two functions, `SSL_CTX_ctrl` and `SSL_ctrl`, each taking a command number:

| The macro | What `ksbind/tls.kspls` calls |
| :-- | :-- |
| `SSL_CTX_set_min_proto_version(ctx, TLS1_2_VERSION)` | `SSL_CTX_ctrl(ctx, 123, 0x0303, null)` (`SSL_CTRL_SET_MIN_PROTO_VERSION`) |
| `SSL_set_tlsext_host_name(ssl, name)` | `SSL_ctrl(ssl, 55, 0, name)` (`SSL_CTRL_SET_TLSEXT_HOSTNAME`, `TLSEXT_NAMETYPE_host_name`) |
| `SSL_library_init()` | Nothing: OpenSSL 1.1.0 and later initialise on first use |

**The numbers are part of OpenSSL's ABI** (the binary interface: the numbers and layouts a compiled program relies on), the same in 1.1.0, 1.1.1 and 3.x, as are `SSL_VERIFY_PEER` (1) and `X509_V_OK` (0). Each stands once, as a named constant beside the declarations. SQLite's `SQLITE_TRANSIENT`, a function pointer with every bit set, is passed as the pointer-width integer `-1` (the reason is beside the constant in `ksbind/db.kspls`).

**C's `long` crosses without C as well.** The two `ctrl` functions take a `long` and return one, and so does `SSL_get_verify_result`, each value fitting in 32 bits. A `long` parameter is declared `Sz` (KSPL's pointer-sized unsigned integer) and a `long` result `I32`, which is right on every target KSPL builds for (the rule and why are "What cannot be written in C's types" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

**What it gives up**:

* **OpenSSL before 1.1.0 is not bound**: `TLS_client_method` and `SSL_set1_host` begin there.
* **A future OpenSSL renumbering a command would go unnoticed until a run.** The tests drive both `ctrl` calls on every connection, and a refused one fails the connection as `ctx_failed`, so a run notices; the compile does not.
* **The MSVC toolchain does not link `ksbind/tls`**: it names OpenSSL's libraries `libssl` and `libcrypto`, and no `#cfg` names the toolchain ("The library an `extern` block needs is named on the block" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

### What each binding guards against

Each binding closes off one well-known way that code using the library directly goes wrong. The table names the danger and what ksbind does; the paragraphs after it give the details and what each choice gives up.

| File | The usual way to do it | The known problem | How ksbind handles it |
| :-- | :-- | :-- | :-- |
| `tls` | Calling OpenSSL directly | **Forgotten verification.** Not calling `SSL_CTX_set_verify`, or setting SNI (`SSL_set_tlsext_host_name`) without the host name check (`SSL_set1_host`), are the standard mistakes | A client context always verifies (`SSL_VERIFY_PEER`, the default CA store), at TLS 1.2 or above; SNI and the host name check are both set |
| `tls` (the end of a stream) | `SSL_read` | **A cut stream read as a proper end.** `SSL_read` returns 0 both for the peer's close_notify and for a TCP connection dropped without one | `read` returns 0 only after a close_notify; a connection ending any other way is `io_failed` |
| `tls` (a peer that is gone) | `SSL_set_fd`, OpenSSL writing to the socket itself | **A write to a peer that is gone kills the program.** OpenSSL writes with no `MSG_NOSIGNAL` and offers no way to ask for it, so SIGPIPE is raised; a program that has not set it aside dies. A KSPL program ignores it, but the program a KSPL library is linked into may not | OpenSSL reads and writes memory, and every byte crosses the socket through `std/net`, whose write never raises SIGPIPE: a write to a peer that is gone fails as `io_failed` |
| `db` | SQLite's C API | **SQL injection.** An API building queries by concatenating strings gets misused | Only placeholders: `prepare` plus `bind_i64`/`bind_f64`/`bind_text`/`bind_null` |
| `db` (several statements) | `sqlite3_prepare_v2` | **Every statement after the first dropped without a word.** It prepares one statement and points past it, so `exec` of two `CREATE TABLE`s would make only the first | `prepare` and `exec` refuse SQL holding a second statement (`several_statements`), before anything runs |
| `db` (closing) | `sqlite3_close` | **A connection closed while a statement is open stays open.** It answers `SQLITE_BUSY` and closes nothing, so a caller that drops the answer leaks the connection, its file and its lock for as long as the process runs | `Db.free` closes with `sqlite3_close_v2`: the connection closes at once, or once its last statement is freed, so the two frees may come in either order |
| `db` (a whole row) | `serde`'s derive / Swift's `Codable` / Jackson's annotations | **A column's name is written twice, once for the writer and once for the reader**, and fixing only one silently fills in the default | `Statement.bind_row` / `Statement.read_row` match a struct's fields to columns by name, and refuse what does not match |

**`tls`: forgotten verification.** Verifying means checking that the server's certificate was signed by a trusted authority (a CA) and names the host you asked for. SNI tells the server which host name you want; it checks nothing by itself.

* The floor of TLS 1.2 holds whatever openssl.cnf says.
* **The verification's own answer decides the error**: a certificate that does not verify stops the handshake, and is reported as `cert_verify_failed`, apart from a peer that speaks no TLS (`handshake_failed`).
* A host name holding a NUL, or longer than OpenSSL takes, **fails rather than being cut** (cut, it would verify a different host).

**`tls`: the end of a stream.** A close_notify is the message a TLS peer sends to say "I am finished". Taking a dropped TCP connection as the end too lets whoever can drop the connection cut a reply short unnoticed (a truncation attack).

* `read` knows the close_notify came when `SSL_get_error` says `SSL_ERROR_ZERO_RETURN`.
* **A cut is not told apart from a reset**: both leave what arrived unconfirmed, and telling them apart would mean reading OpenSSL's error codes, laid out differently in 1.1.1 and 3.x.

**`tls`: a peer that is gone.** On Linux a write to a socket whose peer has gone raises SIGPIPE unless the call passes `MSG_NOSIGNAL`, and its default ends the process. `std/net` passes it (`SO_NOSIGPIPE` on the socket where the OS has no such flag), so the rule lives there once. So OpenSSL is handed two memory buffers rather than the socket, and the binding moves the bytes between them and the `std/net` connection: whatever OpenSSL sends goes out by `std/net`'s write.

* **The process's signal setting is never touched.** It is the host program's: a library that set SIGPIPE aside, even for one call, would change it for every thread of a program that chose otherwise.
* **Blocking SIGPIPE for the calling thread around each call is not used either.** It touches every OpenSSL call that may write (the handshake, a read answering the peer, the close as well as a write), and a signal blocked is not one ignored: it stays pending, and has to be drained without taking one another thread was owed.
* **What it gives up**: each record is copied once more, through the memory buffer, and a read or write drives OpenSSL in a loop of its own rather than letting it wait on the socket.

**`db`: SQL injection.** A query built by joining strings lets a value such as `'; DROP TABLE t; --` run as SQL. With a placeholder (`?` or `:name` in the SQL), the value is passed apart from the SQL text, so it is never read as SQL.

**`db`: several statements.** The check of what follows the first statement allows only spaces, semicolons and comments. **SQLite's own parser judges the rest** (it is prepared, and must hold no statement), so no second reading of SQL's comments stands here. There is no call running several: each statement goes on its own.

**`db`: closing.** KSPL has no borrow checker, so nothing stops a `Db` from being freed before a `Statement` it prepared, and two values freed at the end of a scope or held in one struct come apart in either order. So the order is made not to matter, rather than refused.

* **A statement whose database was freed still works until it is freed**: SQLite keeps the connection until then. Nothing dangles, since the statement holds the connection, not the `Db`.
* **`free` neither finalizes the statements nor fails.** Finalized behind the caller's back, a `Statement` would hold a handle already gone, and its own `free` would finalize it twice. A failure has nowhere to go: `free` returns nothing, and a `defer` could not act on it.
* **What it gives up**: a statement never freed keeps its file open with nothing said, as any leaked value keeps what it owns.

**`db`: a whole row.** `bind_row` and `read_row` walk `std/reflect`'s table (the list of a struct's fields), which ksplc synthesizes from an empty `impl X: reflect.Reflectable {}`.

* **They match by name** (`:field` when binding, the column's name when reading). Matched by position, reordering the SQL's columns would silently read the wrong one wherever the types agree.
* A missing column and a `NULL` one are refused with different values (`missing_column` / `column_type`).
* **An integer the field cannot hold is refused** (`column_type`), not narrowed: 5000000000 into an `I32`, 300 or -1 into a `U8`, and on writing a `U64` past SQLite's signed 64-bit integer. Whether it fits is `std/reflect`'s `fits_int`.

### The tests run only through this package's own `make test`

**The tests link OpenSSL and SQLite, so they run from this folder's own `make test`, not from the `make debug` every environment runs**, and `make test-extract` runs that `make test` from a copy of the folder.

**Where the libraries do not link, the run skips and says so; on Linux it fails instead** (`KSBIND_REQUIRE_LIBS`), since the image the gates run in holds both.

| Situation | Result |
| :-- | :-- |
| A library is not installed (not on Linux) | The run says `SKIPPED` and names the library |
| A library is not installed, on Linux | The run fails |
| A binding names a function wrongly | The run fails wherever the libraries are |

The test of "do they link" is an empty program linked against the libraries the sources name (`--emit-libs`). So a library that is not installed skips, while a binding that names a function wrongly fails everywhere the libraries are.

**The TLS peer makes its keys and certificates in memory, through OpenSSL.** No private key stands in the repository, and no `openssl` command is needed. The key is Ed25519, which asks for no parameters and so for no `ctrl` macro; it needs OpenSSL 1.1.1, one version later than the binding itself.

**A connection that succeeds is made through a CA the test makes.** The diagram shows how the test reaches the client without changing `ksbind/tls`.

```mermaid
sequenceDiagram
    participant T as the test
    participant P as the TLS peer (127.0.0.1)
    participant C as the client (ksbind/tls)
    T->>T: make a CA, write its certificate to a scratch file
    T->>T: set SSL_CERT_FILE to that file
    T->>P: start, with a certificate for localhost or another name
    C->>P: connect to localhost
    P-->>C: its certificate
    C->>C: check it against the CA from SSL_CERT_FILE, and the host name
```

The CA's certificate (not its key) is written to a scratch file that `SSL_CERT_FILE` names for the length of the test. OpenSSL reads the variable when the client loads the default store, so the client runs as a program runs it, with no call added to `ksbind/tls` for the tests. The peer answers at `127.0.0.1` with a certificate for `localhost` or for another name, and the client connects to `localhost`, so the host name check is tested without editing the machine's host table.

**What it gives up**: on Windows and macOS, where the gates' machines have neither library, the bindings are analysed by `make lint`, and on Windows compiled by `make test-c-warnings`, but never linked or run.
