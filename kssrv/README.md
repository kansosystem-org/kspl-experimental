# kssrv

**A server written in KSPL**: static serving of files under `<root>` over HTTP, a JSON API under `/api/`, and inference by a small resident model.

## Run it

```sh
make kssrv                              # -> out/kssrv.exe
./out/kssrv.exe 8080 ./public           # serves ./public on 0.0.0.0:8080
./out/kssrv.exe 8080 ./public --local   # 127.0.0.1:8080. Prints a token and opens the file endpoints
./out/kssrv.exe 8080 ./docs --page=ui/app.html   # `/` is returned as this file
```

The port and the root are **positional**; no environment variable fills either in. The port must be a whole number, and options follow in any order.

**`--local` makes it a local server.** The file endpoints (`/api/file`, `/api/stat`) and the process endpoint (`/api/run`) exist only under it. The rules are [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md)'s, and the grounds [`kssrv/docs/DESIGN.md`](docs/DESIGN.md)'s.

**`--page=<file>` names the one file returned for `/` and `/index.html`.** It may sit outside the root ("Where it listens" in [`docs/SPEC-local-server.md`](../docs/SPEC-local-server.md) says what naming it weighs).

## What is here

| File | What it holds |
| :-- | :-- |
| [`kssrv/main.kspls`](main.kspls) | The command line, the accept loop and static serving |
| [`kssrv/conn.kspls`](conn.kspls) | One connection's state, and how a response is queued |
| [`kssrv/api.kspls`](api.kspls) | The endpoints under `/api/` and their routing table |
| [`kssrv/proc.kspls`](proc.kspls) | Starting a process on the local machine (`/api/run`), and the combinations allowed |
| [`kssrv/worker.kspls`](worker.kspls) | The worker thread that runs inference and training away from the accept loop |
| [`kssrv/model.kspls`](model.kspls) | The small model kept resident, trained at startup and quantized to int8 |
| [`kssrv/pilot.kspls`](pilot.kspls) | How the steering returned to the car (`POST /api/car`) is decided |
| [`kssrv/prog.kspls`](prog.kspls) | The product's name, and the one logger it speaks through |
| [`kssrv/tests/`](tests/) | The tests `make test` runs ("The tests" below) |
| [`kssrv/docs/`](docs/README.md) | The client agreement, the design and the plan ("Further reading" below) |

## What the console says

Each connection logs its opening and its closing, with the peer's address and how many are open. curl gives a pair per request, while a keep-alive client (a car, say) stays open while connected.

```
kssrv: I: conn #4 from 192.168.137.50:54323 (open 2)
kssrv: I: conn #4 closed (open 1)
```

Every line gives the product's name, the severity (`E` error, `W` warning, `I` information, `H` hint) and what happened, in `std/log`'s format. So a run can keep only the lines severe enough.

A child started through `/api/run` gets a line when it starts and when it ends or is stopped:

```
kssrv: I: proc #1 started (ksplc lsp)
kssrv: I: proc #1 ended by itself (exit 0)
kssrv: I: proc #1 stopped (the connection watching it closed)
```

## How it holds up under load

Idle, it uses no CPU. With many connections open and small and large files requested over and over on keep-alive, **resident memory stays flat**, even with clients that never finish a request, keep sending headers, or disconnect mid-response ([`kssrv/tests/main.kspls`](tests/main.kspls) checks it).

## The tests

**`make test` runs them from this folder** ([`kssrv/Makefile`](Makefile)) with a `ksplc`, the `ksai` it uses (found through `KSPLC_PKG_SRC_DIR`) and a C compiler. It builds the server, starts it again and again, and checks from outside what it answers ([`kssrv/tests/main.kspls`](tests/main.kspls)). kssrv names itself in [`kssrv/ksplc.cfg`](ksplc.cfg), so a copy of this folder runs them the same way. `make` alone builds the server into this folder's `out/`.

**A failing check does not stop the run.** The closing `RESULT:` line is printed after every server the run started has stopped. So none is left on its port for the next run to trip over ([`std/verdict.kspls`](../std/verdict.kspls)).

**`make check-pilot-copy COPY=<file>`** compares a copy of the pilot policy kept elsewhere with the one this server sends, at every point of the car's sweep ([`kssrv/tests/copy.kspls`](tests/copy.kspls)). The server does not know where copies are kept. Whoever keeps one names it.

## Further reading

| Document | What it is for | Who reads it |
| :-- | :-- | :-- |
| [`kssrv/docs/SPEC-api.md`](docs/SPEC-api.md) | What each request returns, the JSON API under `/api/`, and the limits a caller writes against. | Whoever calls the server from their own code, with a running `kssrv` to try the calls against |
| [`kssrv/docs/DESIGN.md`](docs/DESIGN.md) | Why it is shaped this way — one-thread multiplexing, the connection table, arena rewinding — and what pins each decision. | Whoever changes kssrv |
| [`kssrv/docs/PLAN.md`](docs/PLAN.md) | What is left, and what marks each stage as done. | Whoever changes kssrv |
| [std](../std/README.md) | The `net` / `reactor` / `http` / `json` it is built on; `ksplc doc std` lists every file std publishes. | Whoever changes kssrv |
| [ksai](../ksai/README.md) | The inference code it is built on: `tensor`, `nn`, `safetensors` and the rest. | Whoever changes kssrv |
