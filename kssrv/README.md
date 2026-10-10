# kssrv

kssrv is a small web server written in KSPL. It hands out the files under `<root>` (the folder you name) over HTTP, and answers a JSON API under `/api/`: the file endpoints a local page uses, and the car's steering.

This page is for whoever wants to run it, call it, or change it. The quickest try is the first two lines under "Run it", then opening `http://localhost:8080/` in a browser, which shows `./public/index.html`.

## Run it

```sh
make kssrv                              # -> out/kssrv.exe
./out/kssrv.exe 8080 ./public           # serves ./public on 0.0.0.0:8080
./out/kssrv.exe 8080 ./public --local   # 127.0.0.1:8080. Prints a token and opens the file endpoints
./out/kssrv.exe 8080 ./docs --page=ui/app.html   # `/` is returned as this file
```

The port and the root are **positional**; no environment variable fills either in. The port must be a whole number, and options follow in any order.

| Option | What it does |
| :-- | :-- |
| (none) | Faces outward: any machine on the network can fetch the files, and the car can ask for its steering |
| `--local` | **Makes it a local server**, reachable from this machine only. The endpoints a local page uses (`/api/file`, `/api/stat`, and `/api/here` and `/api/stop`, which keep it up and stop it) exist only under it. It starts no program, and it trains nothing, so it answers as soon as it starts. It prints a token (a secret string) that every request but the page must carry |
| `--page=<file>` | **Names the one file returned for `/` and `/index.html`.** It may sit outside the root ("Where it listens" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md) says what naming it weighs) |
| `--idle=<seconds>` | **Stops the server once no page has held it, and nothing has been asked, for that long.** Absent, it stays up. A page holds it through `/api/here` ("Keeping the server alive while a page is open" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)) |

The rules of local use are [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)'s, and the grounds [`kssrv/docs/DESIGN.md`](docs/DESIGN.md)'s.

## What is here

| File | What it holds |
| :-- | :-- |
| [`kssrv/main.kspls`](main.kspls) | The command line, the accept loop (the loop that takes new connections and serves the open ones), static serving, and the one logger a run speaks through |
| [`kssrv/conn.kspls`](conn.kspls) | One connection's state, and how a response is queued |
| [`kssrv/api.kspls`](api.kspls) | The endpoints under `/api/` and their routing table |
| [`kssrv/pilot.kspls`](pilot.kspls) | How the steering returned to the car (`POST /api/car`) is decided |
| [`kssrv/tests/`](tests/) | The tests `make test` runs ("The tests" below) |
| [`kssrv/docs/`](docs/) | The client agreement, the design and the plan ("Further reading" below) |

## What the console says

The server prints one line when a connection opens and one when it closes, with the peer's address and how many are open.

```
kssrv: I: conn #4 from 192.168.137.50:54323 (open 2)
kssrv: I: conn #4 closed (open 1)
```

`curl` gives a pair per request. A keep-alive client (one that sends many requests over one connection, a car, say) stays open while connected.

Every line gives the product's name, the severity (`E` error, `W` warning, `I` information, `H` hint) and what happened, in `std/log`'s format. So a run can keep only the lines severe enough.

## How it holds up under load

Idle, it uses no CPU. **What it holds on its heap comes back to the same figure** after waves of badly behaved clients, beside one that behaves. The waves are clients that never finish a request, send headers past the cap, or disconnect mid-response. The run `memory` ([`kssrv/tests/memory.kspls`](tests/memory.kspls)) reads `heap_bytes` from `/api/status` after each wave.

## The tests

**`make test` runs them from this folder** ([`kssrv/Makefile`](Makefile)). It needs a `ksplc`, the `ksai` it uses (found through `KSPLC_PKG_SRC_DIR`) and a C compiler. It builds the server, starts it again and again, and checks from outside what it answers ([`kssrv/tests/main.kspls`](tests/main.kspls)). kssrv names itself in [`kssrv/ksplc.cfg`](ksplc.cfg), so a copy of this folder runs them the same way. `make` alone builds the server into this folder's `out/`.

**A failing check does not stop the run.** The closing `RESULT:` line is printed after every server the run started has stopped. So none is left on its port for the next run to trip over ([`std/verdict.kspls`](../std/verdict.kspls)).

**`make check-pilot-copy COPY=<file>`** compares a copy of the pilot policy (the car's steering network) kept elsewhere with the one this server sends, at every point of the car's sweep ([`kssrv/tests/copy.kspls`](tests/copy.kspls)). The server does not know where copies are kept. Whoever keeps one names it.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kssrv/docs/SPEC-api.md`](docs/SPEC-api.md) | What each request returns, the JSON API under `/api/`, and the limits a caller writes against. | Whoever calls the server from their own code, with a running `kssrv` to try the calls against |
| [`kssrv/docs/DESIGN.md`](docs/DESIGN.md) | Why it is shaped this way — one thread serving every connection, the fixed-size connection table, one block of memory (an arena) reused for each request — and what pins each decision. | Whoever changes kssrv |
| [`kssrv/docs/PLAN.md`](docs/PLAN.md) | What is left, and what marks each stage as done. | Whoever changes kssrv |
| [std](../std/README.md) | The `net` / `reactor` / `http` / `json` it is built on; `ksplc doc std` lists every file std publishes. | Whoever changes kssrv |
| [ksai](../ksai/README.md) | What the car's steering policy is built on: `tensor`, `nn`, `safetensors` and the rest. | Whoever changes kssrv |
