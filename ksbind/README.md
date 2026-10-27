# ksbind

ksbind provides a binding for OpenSSL. A *binding* lets KSPL code call a C library. OpenSSL provides Transport Layer Security (TLS), the encryption used by `https://`. The binding contains only KSPL code and calls the library directly. Install the library where you build the program.

Use ksbind for encrypted connections. This library is separate from the toolchain: KSPL's compiler and the C compiler it uses. It remains outside `std`, which requires no additional libraries. [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains this separation and access to OpenSSL macros without headers.

## Run it

Run `make test` from this folder with `ksplc`, a C compiler, and the library installed ([`ksbind/Makefile`](Makefile)). If a library cannot link, the tests report `SKIPPED` and name it. [`ksbind/ksplc.cfg`](ksplc.cfg) declares the package name. A copy of this folder runs the same tests independently.

## What is here

Each source file provides one binding. The table lists the required library.

| File | Content | What it needs installed |
| :-- | :-- | :-- |
| [`ksbind/tls.kspl`](tls.kspl) | A TLS client using a `std/net` connection. It verifies the certificate and host name | OpenSSL 1.1.0 or later (`libssl-dev`) |
| [`ksbind/tests/`](tests/) | Tests using loopback connections. The TLS peer creates its certificate in memory | OpenSSL 1.1.1 or later, for the peer's Ed25519 key |

Run `ksplc doc ksbind/<file>` to list a file's published API.

## Pitfalls

**Only the connection and the TLS handshake have a deadline.** `Tls_stream.connect` opens the TCP connection as `std/net`'s `Tcp_stream.connect` does, with that call's wait. It then gives the handshake `handshake_ms` milliseconds, and fails with `handshake_timed_out` past that time. Reads, writes, and closing the TLS stream have no deadline. A peer that stops responding can leave the caller waiting indefinitely there. Do not use this API where every network operation must finish within a fixed time.

Linking combines the compiled program with its libraries. These limitations apply:

* A missing library causes a link failure after compilation. The linker message names `-l<name>`. If the library is outside the search path, set `LIBRARY_PATH`. Homebrew's OpenSSL on macOS is one example.
* The binding links OpenSSL as `ssl` and `crypto` on Linux, macOS, and MSYS2. The MSVC toolchain uses `libssl` and `libcrypto`, so it cannot link this binding.

## Further reading

* [`ksbind/docs/DESIGN-bindings.md`](docs/DESIGN-bindings.md) explains the separation from `std`, access to C macros and `long`, and each binding's checks.
* [`ksbind/SURFACE.txt`](SURFACE.txt) records the published API. `make surface` writes it. `make test-surface` checks it. See [`docs/SPEC-gates.md`](../docs/SPEC-gates.md).
* [std](../std/README.md) introduces ksbind's only KSPL dependency. `ksplc doc std` lists its published files.
