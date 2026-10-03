# kssrv — the design

kssrv (Kanso Server) is a server written in KSPL on `std` and `ksai`. It is where `ksplc` and `std` meet a real run: staying resident and handling requests without end. This document holds its decisions and their grounds. Starting it is in [kssrv](../README.md), what a client can ask for in [`SPEC-api.md`](SPEC-api.md), and what is left in [`PLAN.md`](PLAN.md).

## Contents

* [The command line and the two modes](#the-command-line-and-the-two-modes)
* [One thread, many connections](#one-thread-many-connections)
* [Files, the API and starting processes](#files-the-api-and-starting-processes)
* [The resident model](#the-resident-model)
* [The log](#the-log)
* [The car](#the-car)

---

## The command line and the two modes

### The CLI takes positional arguments, and options read by name, and nothing else

No setting comes from an environment variable. Two ways into the settings would let a server run under a value nobody can see (Principle 5). The port is read by `to_i64`, which takes only a whole number, so trailing rubbish is not let through silently.

Caution: **Read the options by name.** Told apart by the argument count, the premise "the third must be `--local`" breaks silently once there are two options.

`--page` names the file returned for `/`, which may lie outside the root: the agreement's one exception (the rule is "Where it listens" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md), and the reason is "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md)).

### Local use and outward-facing use are split by one decision

`--local` decides three things at once: the address listened on, whether a token is needed, and whether the file endpoints exist. **They are not separate options.** Made separate, "facing outward, no token needed, file endpoints open" becomes writable, and a combination that can be written is written eventually.

Facing outward, the file endpoints answer **404** rather than 401. A 401 would tell the client that a token would open something. What is not there is answered as not there.

How the token is made, passed on and compared is in the agreement ("How the token gets across" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)).

The body cap follows the same switch. Only local use, through which files are written back, takes a large one. Facing outward it stays small, since each connection holds its part-read body.

**The body cap is checked as soon as the head names the length, but the token only once the whole request has arrived.** So a client without a token can make the server hold the connection cap × the body cap (over 500MB for local use). Checking the token earlier needs `std/http` to pass on a head whose body has not arrived. That cost is not paid in advance, since local use listens on the loopback alone. The stage is in [`PLAN.md`](PLAN.md).

## One thread, many connections

### Memory robustness comes first

`kssrv/ksplc.cfg` sets `I0603 = on`. A resident process that keeps handling other people's input ranks avoiding hand-rolled ownership management ([I0603]) above the visibility of execution timing ([W0602]).

### Every socket is non-blocking and multiplexed on one thread

`std/reactor` watches the readiness of all of them together. **The blocking `http.read_request` / `http.write_response` cannot be used**: waiting partway through one connection would stop every other. Instead, receiving applies `http.parse_request` to the part-read buffer each time more arrives (`Http_error.incomplete` means wait). Sending builds the bytes with `http.format_response`, and `Conn` holds how far it has sent.

**The interests (readable/writable) are rebuilt before every wait** (`reactor.clear`, then registration). Kept by difference, they can leave a closed peer registered, or a connection never switched back from part-sent to part-read.

Caution: **Watch writable only while part-sent.** A socket whose send buffer is empty is always writable. Watched permanently, it makes `wait()` return at once, over and over, burning the CPU.

### The connection table is fixed-length, and a free slot is an ARC handle's zero value

The table is one `Rc<|Conn|>[max_conns]` (`max_conns` in `kssrv/conn.kspls`), indexed by `reactor`'s token. A free slot is `Rc.empty()`, told apart by `is_empty()`.

* **Why fixed-length**: concurrent connections need a cap anyway, or memory grows with the number of peers. A capped table need not grow, and token to slot is one subscript.
* **Why `Rc`**: a connection can be closed partway through handling its notification (the response cannot be written, or the request is broken). Closing empties the slot, but a call that took the handle by value keeps the memory alive. So no hand-built "mark it dead and sweep it later" is needed.
* **`Rc<|Conn|>` looks after the memory's lifetime and nothing else.** `conn_close` returns the socket, the arena and the two buffers explicitly (releasing an `Rc` does not follow what it points at).
* Caution: **Do not put a field holding an ARC by value on `Conn`.** For the same reason it leaks silently.

### Each connection holds an arena, rewound per request

Several requests are in flight at once, so one shared arena cannot be rewound without throwing away what other connections are using. Each connection has its own, `restore`d when a request finishes. The response has already been copied into the heap-side `outbuf`, so rewinding loses nothing.

### A response is split into 'building' and 'sending'

`queue_*` only appends to `outbuf` and never touches the socket.

Caution: **Do not let the building code write to the socket.** When not everything can be sent, nobody would own how far it got.

### One readiness notification drives a capped amount of work

`read`'s repeats and the requests handled in a row are both capped by `max_read_rounds`, and `max_request_bytes` caps the part-read bytes (values in `kssrv/main.kspls`).

Caution: **Without a cap, one client that keeps sending makes everyone else wait.** What is left stays in the buffer and continues after the next `wait()`.

### With no free slot, a new connection is closed

With no free slot, an accepted connection is closed without a response. Making it wait would mean tracking who is waiting, since when, and how many.

### `read` returning 0 does not mean the connection is over

**`read`'s 0 only means the peer closed its sending side.** It may still be waiting for the response, with its receiving half open. On a response streamed without a length (`/api/run/<id>`) this is routine: a browser closes its sending side once it has nothing more to send. Closing the connection there would stop the child it watches (nobody else reaps an unwatched child). The client would wait forever on a request that never returns, and see only "the language server does not answer".

**A half-closed connection is kept until nothing is left to send.**
* `peer_done` is raised, and the connection is not read again (EOF would come back as readable every time).
* Caution: **Do not watch it for readable.** `wait()` would return at once, over and over, burning the CPU. Once there is something to send, it is watched for writable.
* **Put the decision to close in one place** (`sweep_done`). No notification will come, so nothing else decides it, and without it the slot stays filled. A connection watching a stream or awaiting inference is kept, since it has something to send later.

**Decide it by `read`'s answer, not by the event mark.** POSIX's `poll` shows a half-close only as `POLLIN`, while `WSAPoll` raises `POLLHUP`. Folding `POLLHUP` into "it became unusable" would set off the chain above on Windows alone. `std/reactor` keeps the two marks apart (`err_or_closed`, `hangup`). kssrv reads even on `hangup` until `read` returns 0, so the environment need not be checked. `make test-conventions` checks that the marks agree on both platforms.

**Log the child's start and its stop, one line each.** Unlogged, the chain shows only as a request that never returns.

Note: The check is `half_closed_cases` in `kssrv/tests/run.kspls` (it closes only the sending side, types into the child, and waits for the answer to come through).

### The server stops when no page is holding it

**`--idle=<seconds>` stops the server once no page is holding it and nothing has been asked for that long.** The rule is "Keeping the server alive while a page is open" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md). Why a held connection, and not a timer, is in "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md). Without the option the server stays up. Facing outward no page holds it, and a server told nothing must not stop itself.

Caution: **Stamp the clock for every request, in one place** (`queue_for_request` in `kssrv/main.kspls`). Stamped per entry point, the next one added is the one forgotten.

`kssrv/tests/main.kspls` tests both halves ("a page holding it keeps it up past the wait" and "it stops itself once nothing holds it"). **Both are needed**: with only the second, a server that never stayed up would pass.

### The server stops when asked, once the answer is out

**`POST /api/stop` marks the connection that asked, and the accept loop stops once that connection is gone** (`stop_asked_by` / `open_serial` in `kssrv/conn.kspls`). A connection is dropped only after its last byte is sent, so the answer is out before the listener closes. Stopping inside the handler would close the socket with the answer still queued, and the asker would see a broken connection. The rule is "Stopping it when asked" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md); why it is a request and not a signal is in "13.10 A page asks the local machine through one protocol" in [`../../docs/DESIGN.md`](../../docs/DESIGN.md).

Caution: **Stop the children on every way out** (`shut_all` in `kssrv/proc.kspls`, deferred in `main`). A stop asked for does not wait for them, and left running nothing could reach them again.

`kssrv/tests/main.kspls` tests both halves ("a refused stop leaves it answering" and "it stops once it has answered"), for the same reason as the idle stop.

## Files, the API and starting processes

### The path is checked after the decode

The path part of the request target is percent-decoded, once, by `url.decode_component` before `fs.stays_under` checks it.

**The order is everything.** Checked first, `%2e%2e` passes the check and then becomes `..`, returning a file outside the root. A test with a raw `..` alone would not notice, so the regression in `kssrv/tests/main.kspls` sends encoded strings too.

Caution: **Use `decode_component`, not `decode_form`.** `+` means a space only in a query or a form. In a URI's path it is just a `+`, and mistaking one for the other makes a file with `+` in its name unreachable.

**A refused path returns 403, not 404.** What was refused is the path's shape; whether a file of that name exists was never checked. `fs.is_safe_relative` also refuses spellings the OS reads specially, Windows device names among them. A read or write of `COM1` never returns when nothing is attached, so one request would stop this single-loop server.

### `/api/` does not go through static serving

Everything under `/api/` is dispatched by the routing table alone, so the API takes priority even over a directory named `api` under the root.

Caution: **Do not check only one of the two.** An API taking a path in the query, such as `?path=`, goes through the same `fs.is_safe_relative` as static serving. A different entry point, but pointing outside the root is the same hole.

### The counters are held in plain global variables

The counters `/api/status` returns (uptime, requests, connections) sit in one `priv $stats`. On a one-thread server, handling a connection and reading the counters happen in the same loop, so no synchronization is needed.

Caution: **Keep the worker away from the counters.** It runs inference and training on a second thread. What it reports reaches `/api/status` through `Shared.stats` under the lock ("Training goes through the same single worker" below).

### Starting a process allows only the listed combinations

`/api/run` takes `cmd` and `args` as the agreement ([`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)) says, but **kssrv does not start them as given**. Unless they match the table in [`proc.kspls`](../proc.kspls), it answers 403. The table allows `ksplc lsp` and nothing else.

**Why it is narrowed: a breach here loses one tier more.** The file endpoints at worst read and write under the root. A started process is outside the root check: it can read beyond the root, reach the network and write anything. The defence rests on one token, and the agreement itself warns that whoever gets the token can run code with the person's privileges. So what a leaked token loses is kept small in advance.

**Do not allow `ksplc` wholesale.** `ksplc run` runs any KSPL, which is the same as allowing anything. Only `lsp`, which only reads and parses, is allowed. Before widening the table, confirm the subcommand does not run the user's code (adding `make` or `ksplc run` means "allow anything").

**The program is looked for beside kssrv itself** (or at `KSSRV_KSPLC` where set), never on PATH. A failure to start returns the places looked (`looked`). "What may be launched" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md) requires both. The variable is allowed because whoever sets it starts kssrv and can already run anything (the same trust as `KSPLC_STD_DIR`).

**Do not decide "can it be started" with `fs.is_executable`.** It reads the owner's execute bit, which Windows lacks. So the language server would never start on Windows, refused as "not found" beside a file that exists. `can_run` in `std/fs` answers (the extension on Windows, the execute bit on POSIX). `make test-conventions` catches a file that starts a child while using `fs.is_executable`.

**Stop the child when the watching connection is cut.** Otherwise every closed page leaves a language server behind, and nobody reaps them.

**A stream's response names no length**: closing the connection ends it (`Connection: close`, no `Content-Length`; `format_response_head` in `std/http`). Do not send it through `format_response`. Its `Content-Length: 0` for the empty body makes a client that follows the protocol read not one byte of the body. So the test checks the headers too (`kssrv/tests/run.kspls`).

**A finished child is drained before its end is sent.** A child that writes more than one read's worth (`sip_bytes`) and exits at once still has output in the pipe when a read first sees it gone. A read that does not fill the buffer has emptied the pipe (a read returns all there is), so reading until then drops nothing.

**Output no watcher can take piles up to a cap (`pending_cap`), and past it nothing is drained.** So the child waits where it writes, and back pressure reaches it. `stream_backlog` caps the watching connection's part-sent bytes the same way. This does not break the agreement's rule to keep draining standard error. Only that child stops, and draining resumes once a watcher comes, so nothing is dropped.

Caution: **Do not pile up without a cap.** A child started with nobody watching, plus one slow-reading client, eats memory as fast as the child writes.

**A stopped stream also ends with a closing chunk** (`{"exit":-1}`, as "Processes" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md) has it). `Piped_child.kill` clears the child away, so its own exit number cannot be asked for. With nobody watching, the child is cleared away at once.

**Past `max_procs` children it refuses with 503**, kept apart from "it could not be started" (500). Merged, the list of places looked would come back and cast suspicion on the installation. Do not make them wait (as with the inference table).

**Typing into a child (`/api/run/<id>/in`) blocks the accepting thread until the write finishes** (`Piped_child.write`). So a body larger than the pipe buffer (64 KiB on Linux), sent to a child that does not read standard input, stops all accepting until that child reads. A language server keeps reading, so this is rare, but a stalled one stalls kssrv too. A write that does not wait is not paid for in advance, since the loopback's only peer is our own page. The stage is in [`PLAN.md`](PLAN.md).

## The resident model

### Inference is driven off the accepting thread

`POST /api/infer` only queues a job. The worker thread in `kssrv/worker.kspls` generates, and after the next `wait()` the accepting thread makes the result a response.

Caution: **Generation must not happen on the accepting thread.** One takes tens of milliseconds, and every other connection would stop for that long.

**The worker does not touch a connection.** A job holds only the slot number and the connection's serial. The peer may hang up during inference and another client take the slot, so the accepting thread checks the serial before responding. If the worker touched connections, two threads would fight over a closing one's state.

**Shorten `wait()`'s timeout only while inference is pending.** Results are taken only when `wait` returns, so the default second would make each response up to a second late. An idle server keeps the default and does not spin. A self-pipe waking the accepting thread would remove the need, but adds a socket and its cleanup: not worth it for inferences this short and few.

### The job table is fixed-length, and it refuses on overflow

Pending inferences are capped at `max_jobs` (`kssrv/worker.kspls`). Past it, the server returns `503`.

Caution: **Do not make them wait.** A wait means holding since when and how many are waiting, which is itself something to attack.

### Only the quantized form of the model stays resident

It trains in F32 at start-up, then quantizes to int8 and **throws the whole F32 arena away**.

Caution: **Put the quantized copy on a different arena.** Otherwise throwing the F32 away throws the copy away too, and resident memory is not cut. That is why `ksai/quant.Tensor.quantize` takes the arena to allocate on.

**Initialize the weights randomly.** `nn.*.new` puts the same value in every element. Trained from there, only the same gradient flows and every hidden unit stays the same.

**Fix the random seed.** Weights that change on every start-up answer the same request differently, and no regression test can be written.

After `build()` only the worker touches the model. It reads it for inference and rewrites it for training, so the model needs no lock ("Training goes through the same single worker" below).

### Training goes through the same single worker

`POST /api/train` queues on the same job table as inference, and the same worker handles both in turn.

Caution: **Do not run training outside the worker or on a second thread.** Training rewrites the model. On a thread apart from inference, the model would need a lock. Through one thread in turn, it does not (in exchange, inference waits during training).

**The accepting thread does not read the model.** What `/api/status` reports of it is what the worker wrote into `Shared.stats` inside the lock. Reading the model directly would overlap with training's rewriting.

### Only the LoRA adapters are trained

The base (the three quantized layers) is frozen. Only `ksai/lora`'s adapters (the low-rank matrices A·B) are updated, by `ksai/optim`'s Adam.

* **Why the base is frozen**: it is resident as int8. Updating it would mean going back to F32, training and quantizing again. That adds quantization error on every round trip and loses much of the memory saving. The adapters, held as F32, come to about a twelfth of the base.
* **Why Adam**: `backward` / `backward_lora` apply the update themselves and are fixed to SGD, so no optimizer fits in between. `backward_grads` / `backward_lora_grads` return only the gradients, and those are used.

## The log

### The log is flushed at a fixed interval rather than per line

`stdout` stays buffered and is flushed just before `wait()` **once `flush_gap_us` has passed since the last flush** (`kssrv/main.kspls`). Only the start-up lines are written at once, before the loop, because whoever waits for the server watches for them (`kssrv/tests/start.kspls` for `kssrv: I: listening on`, `kspage/Makefile` for `kssrv: I: open `). An idle server still flushes a new line in the same round, since an arriving connection makes `wait()` return at once. A busy one is limited by the interval.

Caution: **Do not flush per line.** A flush blocks the accepting thread and happens twice per connection (accepted, closed), so a slow destination stalls static serving. The interval cuts the accepting thread's writes for the same log by more than an order of magnitude. A flush costs far more on Windows than on Linux. So a flush per line fails `static distribution does not stall even with inference jammed` in `kssrv/tests/main.kspls` on Windows first.

**A line that must show in the log after a crash is written at `error` or `warning`.** `std/log` writes a line of either severity out the moment it closes ("Error and warning lines are flushed at once" in [`../../std/docs/DESIGN.md`](../../std/docs/DESIGN.md)).

**A line written through `at` stays open until the next one starts.** Every way out of `main` runs `done` (the logger's `defer`), so the lines before a crash are written before the process ends. The accept loop's `accept failed` and `poll failed` do not end it: the loop goes on, and they close with the next line or at the flush interval.

### One buffered logger

Every line goes through one `std/log` logger, made by `prog.log_new()` and passed on. **It writes to `io.out()`** for the flush discipline above. `io.err()` is unbuffered, so a connection's two lines would each cost a call on the accepting thread.

**No logging thread is added, and none is needed.** `std/log` is a struct over a `Writer` that writes on the caller's thread. Of kssrv's two threads, the worker writes no line (its results come back through the job table; "Inference is driven off the accepting thread" above). So every line is written on the accepting thread without a lock, which is also what the counters rely on.

Caution: **Do not let the worker write.** A logger used from two threads cuts a line in two, since a line stays open until the next one starts. Anything the worker has to say goes back through the job table.

**Do not hold the logger in a file-level variable.** `Log`'s fields belong to `std/log`, so what could be held is a null pointer filled in later. That is a server that is up but may or may not be able to speak, which the command-line decision at the top refuses.

The usage text is not a log line: it has no severity and is always printed, so it stays a plain write to `io.err()`.

## The car

### The car's judgement is the server's, and the safety timeout is the car's

The MLP in `kssrv/pilot.kspls` that answers `POST /api/car` is **trained at start-up with the written rules (`rule_action`) as its teacher**.

* **Why a net**: the point is to show the decision made outside the car; the rules as written would need no PC. The net is not cleverer than the rules. It only shows that a function learned from them runs inside a control loop.
* Caution: **Do not make the rules a runtime escape hatch.** Overriding a disagreement with them makes the net an ornament and the agreement rate meaningless. The rules are only the teacher and the answer key.
* **Measure the agreement rate by stepping end to end, not by random samples.** Disagreements gather in the few tens of mm past the boundaries (150mm and 400mm). So as many random samples as training used can show "100%" without touching that band.
* **The agreement rate and the refusal at close range are tested together** (`kssrv/tests/car.kspls`). It needs 95% or more agreement at every stepped point, and no forward motion at an unmeasurable distance or at very close range. The rate alone is not enough: a fix that lowers it must still not tip toward danger.
* **The battery is not a net input.** Stopping on a flat battery is the car's own judgement, like backing off at very close range and stopping when no answer arrives. Once the link drops, the server can do nothing.

### The car's inference stays on the accepting thread

Unlike `POST /api/infer`'s, a few hundred weights take microseconds per forward pass, and a trip through the worker would stretch the control period by that round trip. After `build()` the policy is read-only and no endpoint rewrites it. **An endpoint that continues training it breaks this premise.**

### The policy shipped is a set that can be reproduced on its own

`GET /api/pilot` sends, in one safetensors file, not just the weights but **how the features are made (`far_mm`), the manoeuvre table and the format's version**.

* **Why all of it**: with the weights alone, the receiver would keep its own copy of the preprocessing and of the manoeuvres' meaning, and a copy cannot notice when the server's code is fixed. With everything needed to reproduce `decide` and the manoeuvres' meaning in one file, no disagreement arises.
* **Why safetensors**: it is the codebase's one format for storing tensors (`ksai/safetensors`), with reader and writer in place.
* **Why it is not quantized**: the weights are about a kilobyte even as F32. int8 would save about three quarters of that at a higher cost: the receiver's answers would drift from the server's. As F32, "the same observation gives the same manoeuvre" can be matched.
* **What tests it: a policy rebuilt from the shipped blob alone returns the same manoeuvre as `POST /api/car` at every swept point** (`kssrv/tests/car.kspls`). Shapes can fit while a drifted preprocessing constant or manoeuvre table changes the answer. The server computes in F32 and the checker in double precision. So points where the top two logits nearly tie are not judged, with a cap on how many (more is itself an anomaly).
* **`command_valid_ms` is not included.** It is how long a car that asks may wait for an answer, which means nothing to a car carrying the policy. That car's timeout is its own.
* **Do not forget to raise the version (`__metadata__.kspl_pilot`).** The feature order, the activation and the manoeuvre table's meaning cannot be told from a tensor's shape. Left unraised, an old reader applies new weights the old way and goes wrong silently, the shapes fitting.
