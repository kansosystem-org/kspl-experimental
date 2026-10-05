# kssrv — what a client can ask for

**The agreement between the server and whoever calls it over HTTP**: what each request returns, what the JSON API under `/api/` holds, and the limits a caller has to write against. A client is written against this document, so a change here is a change to what somebody else's code depends on.

How to start it is in [`kssrv/README.md`](../README.md), and why the server is shaped this way is in [`DESIGN.md`](DESIGN.md). The five endpoints a page opened in a browser may use are set one level up, in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md). That document is the agreement between the client page and this server and belongs to neither. Where the two documents meet, it is the canonical source.

## Contents

* [What it returns](#what-it-returns)
* [The JSON API](#the-json-api)
* [Steering the car](#steering-the-car)
* [Downloading the policy](#downloading-the-policy)
* [What a client can rely on](#what-a-client-can-rely-on)
* [Known limits](#known-limits)

---

## What it returns

| Request | Response |
|---|---|
| `GET /` | `<root>/index.html` (a 404 if there is none). With `--page`, that file |
| `GET /index.html` | the same (`--page` swaps these two and nothing else) |
| `GET /a/b.txt` | `<root>/a/b.txt` |
| `GET /sub` (a directory) | `<root>/sub/index.html` |
| `HEAD <any of the above>` | no body; `Content-Length` is the real length. **No answer to a HEAD carries a body**, a refusal's included |
| anything but `GET` / `HEAD` | 405 Method Not Allowed |
| a path pointing outside the root | 403 Forbidden |
| not found | 404 Not Found |
| a broken request, a broken `%XX` | 400 Bad Request |
| a body over the cap (refused as soon as the head names it) | 413 Content Too Large |
| a head past 64 KiB, or more bytes held unanswered on one connection than 64 KiB plus the body cap (64 KiB facing outward, 4 MiB with `--local`) | 431 Request Header Fields Too Large |

A path's `%XX` is decoded, so a file whose name holds a `%20` can be returned too. **A path's `+` is not a space.** A `+` for a space is `application/x-www-form-urlencoded`'s convention; in a URI's path a `+` is just a `+`. The decoding happens once only: `%252e` is the name `%2e` and does not become `.`.

## The JSON API

Everything under `/api/` skips static serving and is handled by a routing table. Even where a directory under the root is named `api`, the API takes priority. **Every answer under `/api/` is `application/json`, a refusal's included** (a HEAD's, which names its length and carries no body), except three: `GET /api/file` and `GET /api/pilot` answer with bytes as `application/octet-stream`, and `GET /api/here` with a head and nothing after it. A request that cannot be read at all (the 400, 413 and 431 above) is answered as `text/plain`, since its path is not known yet.

| Request | Response |
|---|---|
| `GET /api/status` | the uptime in seconds (`uptime_s`), the requests handled, the manoeuvres returned to the car (`commands`), the connection counters, the bytes the server holds on its heap (`heap_bytes`), and whether it is for local use (`local`); the root's path only for local use (`root`, empty facing outward, where it would tell anyone the machine's layout); the steering policy's figures facing outward (`pilot`, `null` for local use, which trains none) |
| `GET /api/file?path=<p>` | that file's byte sequence (only with `--local`) |
| `PUT /api/file?path=<p>` | writes the body to that name (only with `--local`) |
| `GET /api/stat?path=<p>` | the size and the last modification (only with `--local`) |
| `GET /api/here` | a head naming no length, then nothing until the client closes: the connection itself says a page is open (only with `--local`; "Keeping the server alive while a page is open" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)) |
| `POST /api/stop` | answers `{}`, then stops the server (only with `--local`) |
| `POST /api/car` | takes the car's sensors and returns the next manoeuvre (below; not with `--local`) |
| `GET /api/pilot` | returns one whole steering policy as safetensors (below; not with `--local`) |
| a method not named above for its path | `{"error":"Method Not Allowed","status":405}` |
| any other `/api/...` | `{"error":"Not Found","status":404}` |

```console
$ curl -s localhost:8080/api/status
{"root":"","local":false,"uptime_s":1802,"requests":45001,"commands":0,"connections_total":501,
 "connections_open":1,"max_connections":128,"heap_bytes":86692,"pilot":{"params":394,
 "samples":768,"train_cpu_ms":606,"agreement":0.985648918469218,"agreement_checked":4808,
 "command_valid_ms":500}}
```

**No endpoint lists a folder.** A client asks for each file by name; a listing would hand anyone the names under the root.

### The file endpoints for local use

```console
$ ./out/kssrv.exe 8080 ./public --local
kssrv: I: listening on 127.0.0.1:8080, root=./public
kssrv: I: open http://127.0.0.1:8080/#t=0123456789abcdef0123456789abcdef0123456789abcdef

$ T=0123456789abcdef0123456789abcdef0123456789abcdef
$ curl -s -H "Authorization: Bearer $T" 'localhost:8080/api/stat?path=notes.md'
{"size":19,"changed_at":1787746013}

$ curl -s -H "Authorization: Bearer $T" -X PUT --data-binary @notes.md \
    'localhost:8080/api/file?path=notes.md'
{"wrote":19}
```

Caution: **The token above is a sample. Do not paste a token you ran into a document.** The token is made again on every startup, so a pasted one would not work anyway. But a reader would take it as a value that may be pasted. A sample gets an obviously fake value.

**The token goes across in the fragment (`#`) of the URL to open.** A fragment is not sent to the server, so another process on the same machine sending a `GET /` cannot get the token. The page picks it up and clears it from the URL ("How the token gets across" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)).

**The token is not taken as a parameter.** Anyone on the same machine can see the command line through `ps`, so a token passed in has already leaked. kssrv makes it from the OS's source of randomness and prints it once; no endpoint returns it on request. There is no `HEAD /api/file`. `/api/stat` returns the size and whether the file exists, so the same thing is not done two ways (Principle 6).

**`GET /api/file` returns `application/octet-stream`.** The type is not guessed from the content, since a receiver believes a guessed type and reads the content by it. Reading it as a UTF-8 string is the client's business.

A write **goes to a different name and is then swapped in**, so a failure partway leaves the original file whole.

## Steering the car

Send **the values measured at that moment** to `POST /api/car`, and it returns one next manoeuvre. The small MLP in `kssrv/pilot.kspls` (394 weights) decides it.

```console
$ curl -s -X POST localhost:8080/api/car -d '{"dist_mm":250,"line":2,"seq":17}'
{"seq":17,"cmd":"strafe_right","lon":0,"lat":50,"rot":0,"valid_ms":500}
```

| Field | What it means |
|---|---|
| `dist_mm` | the ultrasonic distance [mm]. **0 means "it could not be measured"** (not "close") |
| `line` | the three reflective sensors as `left<<2 \| centre<<1 \| right` (1 = black). 0-7 |
| `seq` | the caller's serial. It is returned as it stands |

The `lon` / `lat` / `rot` returned are the fore-aft, side-to-side and rotation values. They can be passed to the car's `motor.drive` unchanged, with **positive = forward / right / clockwise**. `valid_ms` is "how long this instruction may be trusted". Past that, with no next answer arriving, the car stops.

| Manoeuvre | lon | lat | rot |
|---|--:|--:|--:|
| `stop` | 0 | 0 | 0 |
| `forward` | 60 | 0 | 0 |
| `back` | -45 | 0 | 0 |
| `strafe_left` / `strafe_right` | 0 | ∓50 | 0 |
| `creep` | 18 | 0 | 0 |
| `track_left` / `track_right` | 40 | ∓15 | ∓25 |
| `track_left_hard` / `track_right_hard` | 10 | ∓30 | ∓50 |

**The line-following `track_*` hold forward motion, sideways motion and rotation at once.** If every correction were a turn on the spot, the car would not move forward while correcting the drift. Instead of following the line, it would alternate between going forward and turning in place. There are two levels, so the correction's strength changes with the drift's size.

**Only the ratio of the three matters.** The car scales the three down together once one hits the cap. So this table decides which way it goes and how sharply it turns, not how fast; the car's cap decides the speed. That is why raising `rot` when the car cannot keep up with a curve has no effect: it is scaled back to the same ratio. Dropping `lon` is what raises the rotation per unit of distance travelled.

**The sideways component can be added without cutting the rotation.** With `rot` left at the maximum the scaling does not change, so the force moving it straight sideways grows by that much. On a sharp curve it is less likely to leave the line, because it can move sideways without waiting for the heading to catch up. This uses mecanum wheels' advantage.

Both `dist_mm` and `line` decide which one comes back. **The distance alone does not decide it.**

| `dist_mm` | What comes back |
|---|---|
| `0` (not measurable) | `stop` (it does not run without seeing ahead) |
| up to 150 | `back` |
| 150-400 | dodges sideways. **Where it dodges to is the side with no line**, so `strafe_left` where the right sensor is black (`line` is odd) and `strafe_right` otherwise |
| 400 and up | decided by the line (the table below) |

Where the path ahead is clear, the correction's strength changes with how far sideways the line has drifted. Only the end sensor black is a large drift; the end and the centre both black is a small one.

| `line` | The black sensors | What comes back |
|--:|---|---|
| 2 | the centre only | `forward` (it is riding on the line) |
| 6 / 3 | left and centre / centre and right | `track_left` / `track_right` (a small drift) |
| 4 / 1 | left only / right only | `track_left_hard` / `track_right_hard` (a large drift) |
| 7 | all three | `stop` (a junction or the end, and it cannot judge) |
| 0 / 5 | none of them / the two ends only | `creep` (the line's position is unknowable, so it goes slower than forward) |

**`line` being 0 is "the line is nowhere", not "on the line".** Moving at the same speed as `forward` would mean running at full speed without seeing. The observation does not keep which side the line was on before it was lost. So these rules cannot pick a direction to recover in. Picking one would need history among the features, which is a change that raises the format's version.

* This net's **teacher is the written rules** (`pilot.rule_action`). The net is not cleverer than the rules. What it shows is that the decision is made outside the car.
* At every point of a fine sweep over the measurable distances it **almost entirely agrees with the rules** (`/api/status` reports the figure as `pilot.agreement`). The disagreements are only around the boundaries (150mm and 400mm). On the 400mm side, where the rules would follow the line, the net still dodges sideways. So the net's boundary sits farther out than the rules', which is the safe side.
* **The safety timeout is in the car, not the server.** The guards against a flat battery, a very close obstacle and no answer arriving are inside the car. The server can do nothing when the link drops.
* **It answers on the accepting thread.** One forward pass takes a few microseconds, and after `build()` the policy is read-only.

The steps for connecting the car (a Freenove 4WD mecanum car + a Pico W) are in Phase 3 of [What works, and how far](../../README.md#-what-works-and-how-far).

Kssrv and ksos do not reference each other. A reference would build a dependency that one package cannot notice when the other is moved.

## Downloading the policy

`GET /api/pilot` returns **the very same whole policy** `POST /api/car` is using, in one file in safetensors format. A car that carries it can decide for itself, without asking on every observation.

```console
$ curl -s -o pilot.safetensors localhost:8080/api/pilot
$ python3 -c "import json,struct; d=open('pilot.safetensors','rb').read(); \
    n=struct.unpack('<Q',d[:8])[0]; print(sorted(json.loads(d[8:8+n])))"
['__metadata__', 'fc1.bias', 'fc1.weight', 'fc2.bias', 'fc2.weight', 'maneuvers']
```

| Content | Shape | What it means |
|---|---|---|
| `fc1.weight` / `fc1.bias` | [5, 24] / [24] | the input layer. The activation is SiLU |
| `fc2.weight` / `fc2.bias` | [24, 10] / [10] | the output layer. 10 logits |
| `maneuvers` | [10, 3] | a manoeuvre's number → `lon, lat, rot` (integers travelling as F32) |
| `__metadata__.far_mm` | — | the cap [mm] used when the distance is normalized |
| `__metadata__.kspl_pilot` | — | the format's version. Always confirm it before reading |

* **The weights are not sent alone.** A receiver holding its own copy of how the features are made (`far_mm`) and of the manoeuvres' meaning cannot notice when the server's code is fixed. So the file holds everything needed to give the same answer as `POST /api/car` (`kssrv/tests/car.kspls` matches them at 968 points).
* **`valid_ms` is not in it.** It is how long a car that asks may wait for an answer, and it means nothing to a car that carries the policy.
* Caution: **An old reader using a blob whose version rose goes wrong silently, the shapes fitting.** This version fixes the order of the features, the activation and the manoeuvre table's meaning.

The `Content-Type` is looked up from the extension. **An extension it does not know is not guessed at but made `application/octet-stream`.** A receiver believes a wrong type and reads the content another way, so saying "unknown" is safer than guessing. No type is registered for safetensors, so `/api/pilot` is returned this way too.

## What a client can rely on

| | What holds |
| :-- | :-- |
| The connection | **Kept, as HTTP/1.1's default calls for** (keep-alive). It closes where the client sent `Connection: close`, and where an error response was returned |
| At the cap | **128 connections are held at once.** One arriving at the cap is closed at once with no response. It is not queued, so a client sees a closed socket rather than a wait |
| An idle connection | **Nothing cuts it.** A client that sits silent holds its slot until it closes, so 128 idle clients keep any new one out |
| A large file | Read into memory once and copied into the response buffer, so that connection holds the whole of it until it is all sent |

## Known limits

* **`%2f` works as a separator.** It becomes a `/` after the decode, so `/a%2Fb` is the same as `/a/b`. The check for outside the root is applied after the decode, so it is not a hole.
* **The steering policy is not saved.** It is trained again on every outward-facing startup. The seed is fixed, so the same version gives the same weights every time.
* **`Range` and conditional requests (`If-Modified-Since` and the like) are not supported.** It always returns the whole thing.
* **A symbolic link is refused, not followed** (403), at any level of the path and at the name actually served: a folder is checked together with its `index.html`.
