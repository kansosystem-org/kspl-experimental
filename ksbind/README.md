# ksbind

ksbind provides a binding for OpenSSL. A *binding* lets KSPL code call a C library. OpenSSL provides Transport Layer Security (TLS), the encryption used by `https://`. The binding contains only KSPL code and calls the library directly. Install the library where you build the program.

Use ksbind for encrypted connections. The library is not part of the toolchain (KSPL's compiler and the C compiler it uses), so ksbind stays outside `std`, which needs no additional libraries. [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains this separation and how OpenSSL's macros are reached without headers.

## Run it

Run `make test` from this folder with `ksplc`, a C compiler, and the library installed ([`ksbind/Makefile`](Makefile)). If a library cannot link, the tests report `SKIPPED` and name it. [`ksbind/ksplc.cfg`](ksplc.cfg) declares the package name. A copy of this folder runs the same tests independently.

## What is here

| File | Content | What it needs installed |
| :-- | :-- | :-- |
| [`ksbind/tls.kspl`](tls.kspl) | A TLS client using a `std/net` connection. It verifies the certificate and host name | OpenSSL 1.1.0 or later (`libssl-dev`) |
| [`ksbind/tls_server.kspl`](tls_server.kspl) | The server half: a PEM certificate chain and its key, and one connection's TLS on a non-blocking `std/net` connection | OpenSSL 1.1.1 or later |
| [`ksbind/tests/`](tests/) | Tests using loopback connections. [`ksbind/tests/cert.kspl`](tests/cert.kspl) makes each key and certificate in memory, and a package that uses ksbind can take them for its own tests | OpenSSL 1.1.1 or later, for the Ed25519 keys |

Run `ksplc doc ksbind/<file>` to list a file's published API.

## Pitfalls

**Only the connection and the TLS handshake have a deadline.** `Tls_stream.connect` opens the TCP connection with the wait of `std/net`'s `Tcp_stream.connect`. It then gives the handshake `handshake_ms` milliseconds, and fails with `handshake_timed_out` past that time. Reads, writes, and closing the TLS stream have no deadline, so a silent peer can leave the caller waiting indefinitely. Do not use this API where every network operation must finish within a fixed time.

**The server half never waits, so its caller keeps every deadline.** Each call on a `Tls_session` returns `would_block` where the socket is not ready. The caller waits for the socket, and closes a connection whose handshake takes too long.

**The server half never asks for a passphrase.** `Tls_server.load` refuses a key protected by one as `key_encrypted`, so no start waits for a person at the keyboard.

Linking combines the compiled program with its libraries:

* A missing library causes a link failure after compilation, and the linker message names `-l<name>`. If the library is outside the search path, such as Homebrew's OpenSSL on macOS, set `LIBRARY_PATH`.
* The binding links OpenSSL as `ssl` and `crypto` on Linux, macOS, and MSYS2. The MSVC toolchain uses `libssl` and `libcrypto`, so it cannot link this binding.

## Further reading

* [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains the separation from `std`, access to C macros and `long`, and each binding's checks.
* [`ksbind/SURFACE.txt`](SURFACE.txt) records the published API. `make surface` writes it. `make test-surface` checks it. See [`docs/SPEC-gates.md`](../docs/SPEC-gates.md).
* [std](../std/README.md) introduces ksbind's only KSPL dependency. `ksplc doc std` lists its published files.
