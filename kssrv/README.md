# kssrv

kssrv is a small web server written in KSPL. It hands out the files under `<root>` (the folder you name) over HTTP, or HTTPS. It also answers a JSON API under `/api/`: the server's status, and the file endpoints that a local page uses.

This page is for whoever wants to run it, call it, or change it. The quickest try is the first two lines under "Run it", then opening `http://localhost:8080/` in a browser, which shows `./public/index.html`.

## Run it

```sh
make kssrv                              # -> out/kssrv.exe
./out/kssrv.exe 8080 ./public           # serves ./public on 0.0.0.0:8080
./out/kssrv.exe 8080 ./public --local   # 127.0.0.1:8080. Prints a token and opens the file endpoints
./out/kssrv.exe 8080 ./docs --page=ui/app.html   # `/` is returned as this file
./out/kssrv.exe 8443 ./public --cert=cert.pem --key=key.pem   # HTTPS on 0.0.0.0:8443
```

**Building it needs OpenSSL 1.1.1 or later**, which kssrv links for HTTPS: `libssl-dev` on Debian and Ubuntu, `mingw-w64-ucrt-x86_64-openssl` on MSYS2. On macOS, install Homebrew's `openssl@3` and point `LIBRARY_PATH` at its `lib` folder ("Pitfalls" in [ksbind](../ksbind/README.md)).

The port and the root are **positional**; no environment variable fills either in. The port is a whole number from 0 to 65535, and options follow in any order.

**Port 0 lets the system choose a free port.** The line `kssrv: I: listening on <host>:<port>` names the port the server got, and so does the URL that `--local` prints. The tests start every server this way, so two runs on one machine do not ask for the same port.

| Option | What it does |
| :-- | :-- |
| (none) | Faces outward: any machine on the network can fetch the files |
| `--local` | **Makes it a local server**, reachable from this machine only. Only then do the endpoints a local page uses exist (`/api/file`, `/api/stat`, `/api/list`, `/api/here`, `/api/stop`). It prints a token (a secret string) that every request but the page must carry |
| `--page=<file>` | **Names the one file returned for `/` and `/index.html`.** The server does not start when it names a folder, a FIFO or a device, or nothing. It can sit outside the root ("Where it listens" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |
| `--idle=<seconds>` | **Stops the server once no page has held it, and nothing has been asked, for that long.** Absent, it stays up ("Keeping the server alive while a page is open" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |
| `--cert=<file>` | **Answers HTTPS on the port, with this PEM certificate chain**: the server's own certificate first, then each one that issued the one before it. It needs `--key`, and cannot go with `--local` |
| `--key=<file>` | **The private key of `--cert`**, in PEM, with no passphrase, readable by this account alone ("Serve HTTPS" below) |

## Serve HTTPS

**With `--cert` and `--key`, the port answers HTTPS only.** A plain HTTP request there gets a 400 in plain text that says to use `https://`. A local server (`--local`) takes no certificate, since its traffic never leaves the machine.

**kssrv checks the files before it takes the port, and does not start when one is wrong.** Its error line says what to do. It refuses:

* a key file that its group or everyone can read or change (not checked on Windows, where an ACL decides);
* a key under a passphrase: kssrv never asks for one, so a restart never waits for a person;
* a key that does not belong to the certificate;
* a certificate that has expired, or is not valid yet.

It warns when the certificate expires within 30 days, and again while it runs once that day comes. It also warns when the file holds one certificate that another issued: a client that lacks that issuer refuses it.

To make a certificate for a test, with OpenSSL 1.1.1 or later:

1. Make a key and a certificate that the key signs itself. Put your server's name in both places:

   ```sh
   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -days 90 \
     -subj /CN=myhost.example -addext subjectAltName=DNS:myhost.example \
     -keyout key.pem -out cert.pem
   ```

2. Make the key readable by you alone: `chmod 600 key.pem`.
3. Start kssrv with `--cert=cert.pem --key=key.pem`.

**A browser warns about such a certificate, because no authority it trusts signed it.** For other people's browsers, get a certificate from an authority. Let's Encrypt gives `fullchain.pem`, which holds the intermediate certificate, and `privkey.pem`.

To take the passphrase off a key, run `openssl pkey -in locked.pem -out key.pem`, type the passphrase once, then `chmod 600 key.pem`. `openssl x509 -in cert.pem -noout -enddate` prints when a certificate expires.

## What is here

| File | What it holds |
| :-- | :-- |
| [`kssrv/main.kspl`](main.kspl) | The command line and the accept loop (the loop that takes new connections and serves the open ones). Also static serving, and the one logger that a run writes through |
| [`kssrv/conn.kspl`](conn.kspl) | One connection's state, and how a response is queued |
| [`kssrv/api.kspl`](api.kspl) | The endpoints under `/api/` and their routing table |
| [`kssrv/https.kspl`](https.kspl) | The checks on the certificate and key at start, and each connection's bytes through TLS |
| [`kssrv/tests/`](tests/) | The tests `make test` runs ("The tests" below) |
| [`kssrv/docs/`](docs/) | The client agreement and the design ("Further reading" below) |

## What the console says

The server prints one line when a connection opens and one when it closes, with the peer's address and how many are open.

```
kssrv: I: conn #4 from 192.168.137.50:54323 (open 2)
kssrv: I: conn #4 closed (open 1)
```

Every line gives the product's name, the severity (`E` error, `W` warning, `I` information, `H` hint) and what happened, in `std/log`'s format. So a run can keep only the lines severe enough.

## How it holds up under load

Idle, it uses no CPU. **What it holds on its heap comes back to the same figure** after waves of badly behaved clients. They never finish a request, send headers past the cap, or disconnect mid-response. The run `memory` ([`kssrv/tests/memory.kspl`](tests/memory.kspl)) reads `heap_bytes` from `/api/status` after each wave.

## The tests

**`make test` runs them from this folder** ([`kssrv/Makefile`](Makefile)). It needs a `ksplc`, a C compiler and OpenSSL 1.1.1 or later, which kssrv links for HTTPS through [ksbind](../ksbind/README.md) (`libssl-dev` on Debian and Ubuntu). It builds the server, starts it again and again, and checks from outside what it answers ([`kssrv/tests/main.kspl`](tests/main.kspl)). kssrv names itself in [`kssrv/ksplc.cfg`](ksplc.cfg), so a copy of this folder runs them the same way. `make` alone builds the server into this folder's `out/`.

**A failing check does not stop the run.** The closing `RESULT:` line is printed after every server the run started has stopped, so none is left on its port for the next run ([`std/verdict.kspl`](../std/verdict.kspl)).

## Files near the limit and how they split

How to choose where to cut is "Choosing where to split a file" in [`docs/DESIGN-principles.md`](../docs/DESIGN-principles.md).

* [`kssrv/main.kspl`](main.kspl): **static serving** moves to a new `static.kspl` beside it. That is the section "Resolving a static file" and `queue_for_request`. The accept loop calls three names across the cut: `queue_for_request`, `asks_for_page` and `names_this_server`. The command line, the connection's driving and the loop stay.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kssrv/docs/SPEC-api.md`](docs/SPEC-api.md) | What each request returns, the JSON API under `/api/`, and the limits a caller writes against. | Whoever calls the server from their own code |
| [`kssrv/docs/DESIGN-server.md`](docs/DESIGN-server.md) | Why it is shaped this way: one thread for every connection, a fixed-size connection table, and an arena per connection. | Whoever changes kssrv |
| The "kssrv" section of [`docs/PLAN.md`](../docs/PLAN.md) | What is left, and what marks each stage as done. | Whoever changes kssrv |
| [std](../std/README.md) | The `net` / `reactor` / `http` / `json` it is built on; `ksplc doc std` lists every file std publishes. | Whoever changes kssrv |
