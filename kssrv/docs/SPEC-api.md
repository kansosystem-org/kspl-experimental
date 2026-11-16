# kssrv — what a client can ask for

**This document is the agreement between the kssrv server and whoever calls it over HTTP.** It sets every request the server answers and what each answer holds, the JSON API under `/api/`, and the limits a caller writes against.

A *client* is any program that sends the server HTTP requests: a browser, `curl`, your own code, or a device such as ksos's robot car. How to start the server is in [`kssrv/README.md`](../README.md).

The endpoints a page opened in a browser uses are set one level up, in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md). Where the two documents meet, that one is the canonical source.

**The server runs in one of two modes, picked when it starts**, and several answers below depend on the mode.

| Mode | Started as | Who can reach it | What it offers besides the files |
| :-- | :-- | :-- | :-- |
| Outward-facing | `kssrv.exe <port> <root>`, with `--cert` and `--key` for HTTPS | Any machine on the network | `/api/status` |
| Local use | `kssrv.exe <port> <root> --local --page=<file>` | This machine only. Every request but the page's carries the token it prints at start-up | `/api/status`, the five endpoints for files, watching, listing, holding and stopping, and two more with `--builder` |

Words used below:

| Word | What it means here |
| :-- | :-- |
| root (`<root>`) | The folder named on the command line. The server hands out the files inside it |
| endpoint | One path under `/api/` that the server answers itself, instead of returning a file |
| head | The request line and the headers, before the body |
| token | A random secret string the server makes and prints when it starts in local mode |

## What it returns

A request for any path outside `/api/` gets a file from the root. The first table shows which file a path gives; the second shows when the server refuses instead.

| Request | Response |
|---|---|
| `GET /` | `<root>/index.html` (a 404 if there is none). With `--page`, that file |
| `GET /index.html` | the same (`--page` swaps these two and nothing else) |
| `GET /a/b.txt` | `<root>/a/b.txt` |
| `GET /sub/` (a directory) | `<root>/sub/index.html` |
| `GET /a/b.txt/` (a file named with a `/` at its end) | a 404, as if absent. **A `/` at the end names a folder**, and the file is not one |
| `GET /sub?x=1` (a directory holding `index.html`) | a 301 whose `Location` is `/sub/?x=1`: the path as sent, a `/` and the query. **Served at `/sub`, the page's relative links would resolve against the folder above** |
| `GET /a/b.txt` with `Range: bytes=…` | a 206 holding that part, named by `Content-Range` ("Parts and copies kept" below) |
| `GET /a/b.txt` with `If-None-Match` naming its `ETag` | a 304 with no body: the client's copy is current |
| `HEAD <any of the above>` | the head alone; `Content-Length` is the real length. **No answer to a HEAD carries a body**, a refusal's included |
| `GET http://<host>/a/b.txt` (the absolute form) | the same as `GET /a/b.txt`. The host in the target stands in for `Host` (RFC 9112 §3.2.2) |

| Status | When the server answers it |
|---|---|
| 405 Method Not Allowed | anything but `GET` / `HEAD`; its `Allow` header names `GET, HEAD` |
| 403 Forbidden | a path pointing outside the root, or written in a form refused on every OS ("Known limits" below) |
| 404 Not Found | not found. So is a file named with a `/` at its end, and a name longer than the file system holds |
| 412 Precondition Failed | `If-Match` names no tag the file has |
| 416 Range Not Satisfiable | a range that holds no byte of the file; `Content-Range: bytes */<size>` names its length |
| 400 Bad Request | a broken request, a broken `%XX`, a `Transfer-Encoding` other than `chunked`; plain HTTP on the HTTPS port ("HTTPS" below) |
| 411 Length Required | a body sent in chunks (`Transfer-Encoding: chunked`). The body of the answer says to send a `Content-Length` |
| 413 Content Too Large | a body over the cap (refused as soon as the head names it) |
| 431 Request Header Fields Too Large | a head past 64 KiB, or more bytes held unanswered on one connection than 64 KiB plus the body cap (64 KiB facing outward, 8 MiB with `--local`) |
| 505 HTTP Version Not Supported | a request line naming a version other than 1.x, such as `HTTP/2.0` |

**An empty line before the request line is passed over** (RFC 9112 §2.2). **A request waiting on `Expect: 100-continue` is asked for its body only where it would be taken.** Where its method or path would be refused, the refusal comes at once, and the connection closes.

A path's `%XX` (one byte as `%` and two hex digits) is decoded once only.

| The path sent | The name looked up | Why |
| :-- | :-- | :-- |
| `/a%20b.txt` | `a b.txt` | `%20` is decoded to a space |
| `/a+b.txt` | `a+b.txt` | **A path's `+` is not a space.** A `+` for a space is the convention of HTML forms (`application/x-www-form-urlencoded`), not of a URI's path |
| `/%252e` | `%2e` | `%25` is decoded to `%`, and the result is not decoded again |

The `Content-Type` is looked up from the extension, whatever its letter case (`PHOTO.JPG` is `image/jpeg`). It knows the registered types a web site serves: pages, scripts, styles, images, fonts, sound, video, PDF and the like (`TYPES` in [`kssrv/static.kspl`](../static.kspl)). Text is named as UTF-8. **An extension it does not know is made `application/octet-stream`, not guessed at.** A receiver believes a wrong type and reads the content another way. No type is registered for safetensors, so such a file is returned this way.

### Headers on every answer

**Every answer carries `X-Content-Type-Options: nosniff`**, an error and an API answer included. A browser then reads a file only as the type named, and never runs a text file as a script.

| Header | Facing outward | Local use (`--local`) |
| :-- | :-- | :-- |
| `Date` | Sent: the time the answer was made (RFC 9110 §6.6.1) | Sent |
| `X-Content-Type-Options: nosniff` | Sent | Sent |
| `Content-Security-Policy: frame-ancestors 'none'` | Not sent | Sent: no page can frame it |
| `Referrer-Policy: no-referrer` | Not sent | Sent: a link leaves no address behind |

### Parts and copies kept

**An answer with a file's bytes names what tells this version of the file from the next**, in both modes:

| Header | What it holds |
| :-- | :-- |
| `ETag` | A strong tag made from the time the file last changed, to the nanosecond, and its size. A save changes it |
| `Last-Modified` | That time, to the second |
| `Cache-Control: no-cache` | A browser may keep a copy, but asks again before each use. It then gets a 304 while the file is unchanged |
| `Accept-Ranges: bytes` | A part of the file can be asked for |

| The client sends | It gets |
| :-- | :-- |
| `If-None-Match` naming the `ETag` (a weak `W/` tag matches too), or `*` | a 304 with no body |
| `If-Modified-Since` with the `Last-Modified` it was given, written the same | a 304 with no body |
| `If-Match` naming no tag the file has | a 412 |
| `Range: bytes=a-b`, `bytes=a-` or `bytes=-n` (the last `n` bytes), on a `GET` | a 206 holding that part, `Content-Range: bytes <first>-<last>/<size>` |
| A range holding no byte of the file | a 416 with `Content-Range: bytes */<size>` |
| Several ranges, another unit, a range ending before it starts, or a range on a `HEAD` | the whole file, a 200 |
| `If-Range` naming another tag, or a date not the `Last-Modified` | the whole file, a 200 |

**Facing outward, framing and the referrer stay the site's own choice.** A public file has no action to steal by framing, and some sites rely on being framed. The reasons for local use are "What guards the page in the browser" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

## HTTPS

**Started with `--cert` and `--key`, the port speaks HTTPS only**, and every answer above comes the same over it. The client needs TLS 1.2 or 1.3. Over TLS 1.2, only suites with an ECDHE key exchange and AES-GCM or ChaCha20-Poly1305 are taken.

| What the client does | What it gets |
| :-- | :-- |
| Sends plain HTTP to the HTTPS port | A plain-text 400 whose body says to use `https://`, then the connection closes |
| Ends a connection with `Connection: close` | The answer, then TLS's close_notify, so the stream ends whole |
| Sends no TLS handshake, or only part of one | The connection closes (the handshake's time is in "What a client can rely on" below) |

## The JSON API

Paths that start with `/api/` are not files. The server answers them itself through a routing table, even where a directory under the root is named `api`.

**Every answer under `/api/` is `application/json`, a refusal's included.** A 404 or a 405 there carries a JSON body such as `{"error":"Not Found","status":404}`. No endpoint under `/api/` takes `HEAD`, so `HEAD /api/status` gets a 405 whose head says `Content-Type: application/json` and gives the JSON's length, with no body. Three answers are not JSON:

| Answer | `Content-Type` |
| :-- | :-- |
| `GET /api/file` | bytes, as `application/octet-stream` |
| `GET /api/here` | a head and nothing after it |
| A request that cannot be read at all (the 400, 411, 413, 431 and 505 above) | `text/plain`, since its path is not known yet |

**An endpoint asked for in the other mode answers 404**, as if it did not exist.

In both modes:

| Method | Path | What it does | Answers |
| :-- | :-- | :-- | :-- |
| `GET` | `/api/status` | Reports how the server is doing | the fields in the table below the example |

```console
$ curl -s localhost:8080/api/status
{"root":"","local":false,"conditional_writes":false,"uptime_s":1802,"requests":45001,
 "connections_total":501,"connections_open":1,"connections_refused":0,"writes":45120,
 "max_connections":128,"heap_bytes":86692}
```

| Field | What it holds |
| :-- | :-- |
| `uptime_s` | the uptime in seconds |
| `requests` | the requests handled |
| `connections_total` / `connections_open` / `max_connections` | the connection counters |
| `connections_refused` | the connections refused because every slot was taken, or their peer already held its share |
| `writes` | the writes to sockets. A small file's answer takes one: its head goes with its body |
| `heap_bytes` | the bytes the server holds on its heap |
| `local` | whether it is for local use |
| `conditional_writes` | whether a `PUT` takes the `X-Kanso-If-Content` guard, which is true for local use alone ("Files" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md)) |
| `root` | the root's path, only for local use. Empty facing outward, where it would tell anyone the machine's layout |
| `fs_lookups` | how many times the server has asked the file system what stands at a path (`fs.lookups`), only for local use. Absent facing outward, where the count one request adds would tell which of its steps stand |

For local use only, the endpoints a page uses: `GET` and `PUT` on `/api/file`, and `GET /api/stat`, `GET /api/list`, `GET /api/here` and `POST /api/stop`. With a builder, also `GET`, `POST` and `DELETE` on `/api/allow`, and `POST /api/build`. What each takes and answers is set in "Only five things can be asked for" in [`../../docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

Anything else under `/api/`:

| Request | Answers |
| :-- | :-- |
| a method not named above for its path | `{"error":"Method Not Allowed","status":405}`, with an `Allow` header naming the path's methods (`GET, PUT` for `/api/file`) |
| any other `/api/...` | `{"error":"Not Found","status":404}` |

**Facing outward, no endpoint lists a folder.** A listing would hand anyone the names under the root.

### The file endpoints for local use

Started with `--local`, the server lets a program on the same machine read and write files under the root, with the token it prints.

**These endpoints are the protocol's, and their rules stand there.** They cover the token and its header, which paths are refused, and why there is no `HEAD`. They also cover the type a file comes back as, and how a write keeps the original whole. They are "Where it listens", "Only five things can be asked for" and "How it refuses" in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).

```console
$ ./out/kssrv.exe 8080 ./public --local --page=ui/app.html
kssrv: I: listening on 127.0.0.1:8080, root=./public
kssrv: I: page=ui/app.html
kssrv: I: open http://127.0.0.1:8080/#t=0123456789abcdef0123456789abcdef0123456789abcdef

$ T=0123456789abcdef0123456789abcdef0123456789abcdef
$ curl -s -H "Authorization: Bearer $T" 'localhost:8080/api/stat?path=notes.md'
{"size":19,"changed_at":1787746013}

$ curl -s -H "Authorization: Bearer $T" -X PUT --data-binary @notes.md \
    'localhost:8080/api/file?path=notes.md'
{"wrote":19}
```

Caution: **The token above is a sample. Do not paste a token you ran into a document**: a reader would take it as a value to paste.

## What a client can rely on

These hold for every connection, in both modes.

| | What holds |
| :-- | :-- |
| The connection | **Kept, as HTTP/1.1's default calls for** (keep-alive: one connection carries many requests). It closes where `close` is among the client's `Connection` tokens, and where an HTTP/1.0 client did not list `keep-alive` there. **A 403, 404, 405, 412 or 416 keeps it**: the request was read whole, so the next one starts where it ended. Any other error closes it |
| At the cap | **128 connections are held at once.** A new one at the cap closes the connection idle the longest. Idle means waiting for its next request, with nothing partly read or still to send, and no page holding it. **With none idle, the new one is closed at once with no response**, not queued |
| From one address | **Facing outward, 16 at most.** At this cap the address's connection idle the longest is closed, or with none idle the new one. With `--local` only the cap of 128 applies |
| An idle connection | **Closed once it has passed no byte either way for 30 seconds**, a page's hold (`GET /api/here`) excepted |
| A request arriving slowly | **Closed if it has not arrived whole 30 seconds after its first byte**, however its bytes trickle in |
| A TLS handshake, with `--cert` | **Closed if it has not finished 10 seconds after the connection was accepted** |
| A large file | **Sent in chunks as the connection drains.** A file that shrinks while it is sent ends the connection before the length the head named, so the client sees the body cut short |

## Known limits

These are the places where the server does less than a client can expect.

* **`%2f` works as a separator.** It becomes a `/` after the decode, so `/a%2Fb` is the same as `/a/b`. The check for outside the root comes after the decode, so it is not a hole.
* **One range is answered in part, and several are answered whole.** A body of several parts helps no browser.
* **`If-Modified-Since` matches only the `Last-Modified` it was given**, written the same; any other date gets the file. **`If-Unmodified-Since` is not read**: a client guarding a change sends `If-Match`.
* **A request body is not read in chunks** (411). It is sent with a `Content-Length`.
* **A symbolic link is refused, not followed** (403), at any level of the path and at the name actually served. A folder is checked together with its `index.html`. The root itself can be a link (macOS's `/tmp` is one).
* **A name longer than the file system holds answers 404**, as if absent, on every OS. Linux and macOS hold 255 bytes, Windows 255 UTF-16 units, so 100 kana (300 bytes) fit on Windows alone. No file can stand at such a name, so it is not found, not refused.
* **Only a regular file is served.** A FIFO or a device in the root answers 404, as if absent, since its read can go on forever.
* **A name starting with a dot is not served** (404, as if absent), at any level of the path: `/.git/config`, `/.env`, `/sub/.hidden`. `/.well-known/` is the exception (RFC 8615). In `path=`, `GET /api/file` reads a dot name, and `PUT /api/file` and `GET /api/list` refuse one with 403.
* **A path in a form that Windows reads as another name is refused** (403) on every OS, both here and in `path=`. These are a `\`, an empty segment (`/a//b`), a `:`, a name ending in `.` or a space, and a device name (`CON`). So are a name shaped like a short name (`GIT~1`, `A~1.TXT`) and a wildcard (`*`, `?`). One `/` at the end names a folder: `/sub/` is its index, `/sub` is sent there, and a file named so (`/sub/f.txt/`) is a 404. So a file whose name holds one of these forms is not served, and `GET /api/list` leaves it out.
