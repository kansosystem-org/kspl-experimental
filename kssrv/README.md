# kssrv

kssrv is a small web server written in KSPL. It hands out the files under `<root>` (the folder you name) over HTTP, or HTTPS. It also answers a JSON API under `/api/`: the server's status, and the file endpoints that a local page uses.

This page is for whoever wants to run it, call it, or change it. The quickest try is the first four lines under "Run it", then opening `http://localhost:8080/` in a browser, which shows `./public/index.html`.

## Run it

```sh
make kssrv                              # -> out/kssrv.exe
mkdir -p public                         # the folder to serve; the repository has none
echo '<h1>Hello</h1>' > public/index.html
./out/kssrv.exe 8080 ./public           # serves ./public on 0.0.0.0:8080
./out/kssrv.exe 8080 ./public --local --page=ui/app.html   # 127.0.0.1:8080. Prints a token, opens the file endpoints
./out/kssrv.exe 8080 ./docs --page=ui/app.html   # `/` is returned as this file
./out/kssrv.exe 8443 ./public --cert=cert.pem --key=key.pem   # HTTPS on 0.0.0.0:8443
```

**Building it needs OpenSSL 1.1.1 or later**, which kssrv links for HTTPS: `libssl-dev` on Debian and Ubuntu, `mingw-w64-ucrt-x86_64-openssl` on MSYS2. On macOS, install Homebrew's `openssl@3` and point `LIBRARY_PATH` at its `lib` folder ("Pitfalls" in [kstls](../lib/kstls/README.md)).

The port and the root are **positional**; no environment variable fills either in. The port is a whole number from 0 to 65535, and options follow in any order.

**Port 0 lets the system choose a free port.** The line `kssrv: I: listening on <host>:<port>` names the port the server got, and so does the URL that `--local` prints. The tests start every server this way, so two runs on one machine do not ask for the same port.

| Option | What it does |
| :-- | :-- |
| (none) | Faces outward: any machine on the network can fetch the files |
| `--local` | **Makes it a local server**, reachable from this machine only. Only then do the endpoints a local page uses exist (`/api/file`, `/api/stat`, `/api/list`, `/api/here`, `/api/stop`, and `/api/allow` and `/api/build` with `--builder`). It prints a token (a secret string) that every request but the page must carry. **It needs `--page`**: the token's URL opens the page, and a file the root holds must not get it |
| `--page=<file>` | **Names the one file returned for `/` and `/index.html`.** The server does not start when it names a folder, a FIFO or a device, or nothing. It can sit outside the root ("Where it listens" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |
| `--idle=<seconds>` | **Stops the server once no page has held it, and nothing has been asked, for that long.** It takes 1 to 604800 (one week); the server does not start on another value. Absent, it stays up ("Keeping the server alive while a page is open" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |
| `--builder=<program>` | **Names the program that builds a page's own functions** for `POST /api/build`. It needs `--local` and `--allowed`, and the server does not start when the program cannot be run. Absent, `/api/allow` and `/api/build` answer 404 ("Building a page's own functions" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |
| `--allowed=<file>` | **Names the file that records which functions files the person allowed to build.** It goes with `--builder`, and its folder must stand. **The server does not start with a file under `<root>`**, since anyone who can write the root could then allow their own file |
| `--cert=<file>` | **Answers HTTPS on the port, with this PEM certificate chain**: the server's own certificate first, then each one that issued the one before it. It needs `--key`, and cannot go with `--local` |
| `--key=<file>` | **The private key of `--cert`**, in PEM, with no passphrase, readable by this account alone ("Serve HTTPS" below) |

## Serve HTTPS

**With `--cert` and `--key`, the port answers HTTPS only.** A plain HTTP request there gets a 400 in plain text that says to use `https://`. A local server (`--local`) takes no certificate, since its traffic never leaves the machine.

**kssrv checks the files before it takes the port, and does not start when one is wrong.** Its error line says what to do. It refuses a key that does not belong to the certificate. Each other check and warning, and why it is made, is in "HTTPS" in [`kssrv/docs/DESIGN-server.md`](docs/DESIGN-server.md#https).

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

## Keep it running as a service

**After a panic, kssrv stops and does not start itself again.** For a site that must stay up, let the service manager of the OS start it and restart it. The reason is "A panic ends the server; the service manager restarts it" in [`kssrv/docs/DESIGN-server.md`](docs/DESIGN-server.md#a-panic-ends-the-server-the-service-manager-restarts-it).

### On Linux, with systemd

1. Make an account for the server alone, and install the program:

   ```sh
   sudo useradd --system --no-create-home --shell /usr/sbin/nologin kssrv
   sudo install -m 755 out/kssrv.exe /usr/local/bin/kssrv
   ```

2. Give the key to that account, readable by it alone. kssrv does not start with a key that others can read, or that another account owns:

   ```sh
   sudo mkdir -p /etc/kssrv
   sudo cp fullchain.pem privkey.pem /etc/kssrv/
   sudo chown kssrv:kssrv /etc/kssrv/privkey.pem
   sudo chmod 600 /etc/kssrv/privkey.pem
   ```

3. Write this unit to `/etc/systemd/system/kssrv.service`. Change the port, the folder and the file names to yours. Keep the folder out of `/home`, which the unit hides:

   ```ini
   [Unit]
   Description=kssrv web server
   After=network-online.target
   Wants=network-online.target
   # At most 5 starts in 60 seconds; then the unit stays failed until a person acts.
   StartLimitIntervalSec=60
   StartLimitBurst=5

   [Service]
   User=kssrv
   Group=kssrv
   ExecStart=/usr/local/bin/kssrv 443 /srv/www --cert=/etc/kssrv/fullchain.pem --key=/etc/kssrv/privkey.pem
   Restart=on-failure
   RestartSec=2
   # Ports below 1024 need this capability, and the server gets no other.
   AmbientCapabilities=CAP_NET_BIND_SERVICE
   CapabilityBoundingSet=CAP_NET_BIND_SERVICE
   NoNewPrivileges=true
   ProtectSystem=strict
   ProtectHome=true
   PrivateTmp=true
   ReadOnlyPaths=/srv/www /etc/kssrv

   [Install]
   WantedBy=multi-user.target
   ```

4. Start it now and at each boot: `sudo systemctl enable --now kssrv`. `journalctl -u kssrv` shows its log.

**What each line buys:**

* **`Restart=on-failure`** starts the server again after a panic, a signal, or an exit code other than 0. `systemctl stop` is not a failure, so a stop stays a stop.
* **`StartLimitBurst` bounds a crash loop.** A key that kssrv refuses fails each start at once. After five tries in a minute, systemd stops trying and `systemctl status kssrv` shows why.
* **The rest takes away what kssrv never needs.** It writes no file and starts no program facing outward. So the whole file system can be read-only for it, `/tmp` its own, and `/home` hidden.
* **Leave out `--cert` and `--key` for plain HTTP**, and the key's steps with them.

**A renewed certificate takes effect at the next start.** Copy the new files as in step 2, then run `sudo systemctl restart kssrv`. A renewal tool's deploy hook can do both.

### On Windows

**kssrv is a console program, with no Windows service of its own.** Windows's service manager cannot start it directly. Task Scheduler restarts a task only when it fails to start, not when it ends with an error. A service wrapper fills the gap. WinSW, for example, restarts the program with this in its XML file:

```xml
<service>
  <id>kssrv</id>
  <name>kssrv</name>
  <description>kssrv web server</description>
  <executable>C:\kssrv\kssrv.exe</executable>
  <arguments>443 C:\www --cert=C:\kssrv\fullchain.pem --key=C:\kssrv\privkey.pem</arguments>
  <onfailure action="restart" delay="10 sec"/>
</service>
```

**On Windows kssrv does not check who can read the key**, since an ACL decides that. Give the service's account alone the right to read the key file.

## What is here

| File | What it holds |
| :-- | :-- |
| [`kssrv/main.kspl`](main.kspl) | The command line and the accept loop (the loop that takes new connections and serves the open ones). Also the one logger that a run writes through |
| [`kssrv/static.kspl`](static.kspl) | Every request's first step, which sends `/api/` to `api.kspl`, and static serving: which file a request names under the root, and the answer that returns it |
| [`kssrv/conn.kspl`](conn.kspl) | One connection's state, and how a response is queued |
| [`kssrv/api.kspl`](api.kspl) | The endpoints under `/api/` and their routing table |
| [`kssrv/https.kspl`](https.kspl) | The checks on the certificate and key at start, and each connection's bytes through TLS |
| [`kssrv/page/`](page/) | The browser's side of the local protocol (`client.js`), and the step that builds a page into the one file `--page` names (`bundle.kspl`). ksmd's page and ksagent's chat page are built with both |
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

**`make test` runs them from this folder** ([`kssrv/Makefile`](Makefile)). It needs a `ksplc`, a C compiler and OpenSSL 1.1.1 or later, which kssrv links for HTTPS through [kstls](../lib/kstls/README.md) (`libssl-dev` on Debian and Ubuntu). It builds the server, starts it again and again, and checks from outside what it answers ([`kssrv/tests/main.kspl`](tests/main.kspl)). kssrv names itself in [`kssrv/ksplc.cfg`](ksplc.cfg), so a copy of this folder runs them the same way. `make` alone builds the server into this folder's `out/`.

**The run `paths` throws generated paths at every endpoint that takes one** ([`kssrv/tests/paths.kspl`](tests/paths.kspl)). It checks that nothing outside the root is reached, and that no write lands on a dot name. `make test` replays one fixed seed. `make test-fuzz` sends ten times as many paths, and `FUZZ_ARGS="--seed=N --trials=N"` picks others. A failure prints the line that runs it again.

**A failing check does not stop the run.** The closing `RESULT:` line is printed after every server the run started has stopped, so none is left on its port for the next run ([`std/verdict.kspl`](../std/verdict.kspl)).

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kssrv/docs/SPEC-api.md`](docs/SPEC-api.md) | What each request returns, the JSON API under `/api/`, and the limits a caller writes against. | Whoever calls the server from their own code |
| [`kssrv/docs/DESIGN-server.md`](docs/DESIGN-server.md) | Why it is shaped this way: one thread for every connection, a fixed-size connection table, and an arena per connection. | Whoever changes kssrv |
| [std](../std/README.md) | The `net` / `reactor` / `http` / `json` it is built on; `ksplc doc std` lists every file std publishes. | Whoever changes kssrv |
