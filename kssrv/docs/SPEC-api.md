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

**Every final answer carries `X-Content-Type-Options: nosniff`**, an error and an API answer included. The interim `100 Continue` is a status line alone. A browser then reads a file only as the type named, and never runs a text file as a script.

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
| `If-Range` naming another tag, a date not the `Last-Modified`, or the `Last-Modified` of a file changed within the last second (RFC 9110 §8.8.2.2) | the whole file, a 200 |

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

## The answers, request by request

**Each row below is a request, and the answer kssrv gives it facing outward.** The rows show the rules above at work. `make test-server-claims` sends every row to kssrv, in order, and fails on any other answer.

**The rows start from this state.** The server runs facing outward, as `kssrv.exe <port> <root>`, with no `--cert`. The file `outside.txt` stands beside the root, outside it. The root holds these files:

| File | It holds |
| :-- | :-- |
| `index.html` | `home` |
| `note.txt` | `note` |
| `sub/index.html` | `sub home` |
| `sub/deep.txt` | `deep` |
| `sub/.hidden` | `hidden` |
| `.env` | `dot` |
| `.well-known/x.txt` | `known` |
| `PHOTO.JPG` | `jpg` |
| `model.safetensors` | `weights` |
| `a b.txt` | `space` |
| `a+b.txt` | `plus` |
| `%2e` | `pct` |
| `api/status` | `a file` |
| `style.css` | `p{}` |

The columns read as follows:

* **Request**: the method and the target. A version written after the target replaces `HTTP/1.1`.
* **Token**: what `Authorization: Bearer` carries. Facing outward no request needs one, so every row here says `none`. The column keeps the form of the tables in [`docs/SPEC-local-server.md`](../../docs/SPEC-local-server.md).
* **Headers**: other header lines the request sends. A row that names no `Host` sends `Host: 127.0.0.1`.
* **Body**: the body sent, as text or as a count of bytes. A row that names a `Content-Length` or a `Transfer-Encoding` sends that header and no body.
* **Answer**: the status, then the whole body where the row names one. After `holding`, each text is a part the body holds. After `with`, each `Name: value` is a header the answer carries. After `without`, each name is a header it does not carry.

Three more points tell how a row reads:

* **`<N bytes>`**, in a target or a header, stands for that many bytes of `x`.
* **`<the ETag>` and `<the Last-Modified>`** stand for that header of the answer to a plain `GET` of the same target, sent just before.
* **An answer to a `HEAD` is read as a head alone**, so its row names no body.

**Every answer in these tables keeps two rules besides its own row.**

* It carries the headers of "Headers on every answer".
* A refusal (a status of 400 or more) says what happened in its body, unless it answers a `HEAD`.

### Nothing outside the root

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /../outside.txt` | none | — | — | 403 with `Connection: keep-alive` |
| `GET /%2e%2e/outside.txt` | none | — | — | 403 |
| `GET /%2E%2E/outside.txt` | none | — | — | 403 |
| `GET /..%2Foutside.txt` | none | — | — | 403 |
| `GET /%2e%2e%2Foutside.txt` | none | — | — | 403 |
| `GET /sub/../../outside.txt` | none | — | — | 403 |
| `GET http://127.0.0.1/../outside.txt` | none | — | — | 403 |
| `HEAD /../outside.txt` | none | — | — | 403 |

### Names that Windows reads as another

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /sub%5Cdeep.txt` | none | — | — | 403 |
| `GET /sub//deep.txt` | none | — | — | 403 |
| `GET /note.txt:x` | none | — | — | 403 |
| `GET /note.txt.` | none | — | — | 403 |
| `GET /note.txt%20` | none | — | — | 403 |
| `GET /CON` | none | — | — | 403 |
| `GET /sub/NUL.txt` | none | — | — | 403 |
| `GET /NOTE~1.TXT` | none | — | — | 403 |
| `GET /*` | none | — | — | 403 |
| `GET /note%3F` | none | — | — | 403 |

### Names starting with a dot

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /.env` | none | — | — | 404 |
| `GET /sub/.hidden` | none | — | — | 404 |
| `HEAD /.env` | none | — | — | 404 |
| `GET /.well-known/x.txt` | none | — | — | 200 `known` |

### Files and folders

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /` | none | — | — | 200 `home` with `Content-Type: text/html; charset=utf-8` without `Content-Security-Policy` `Referrer-Policy` |
| `GET /index.html` | none | — | — | 200 `home` |
| `GET /note.txt` | none | — | — | 200 `note` with `Cache-Control: no-cache` `Accept-Ranges: bytes` `Connection: keep-alive` |
| `GET /sub/` | none | — | — | 200 `sub home` |
| `GET /sub/deep.txt` | none | — | — | 200 `deep` |
| `GET /note.txt/` | none | — | — | 404 |
| `GET /sub` | none | — | — | 301 with `Location: /sub/` |
| `GET /sub?x=1` | none | — | — | 301 with `Location: /sub/?x=1` |
| `GET http://127.0.0.1/note.txt` | none | — | — | 200 `note` |
| `GET /missing.txt` | none | — | — | 404 with `Connection: keep-alive` without `Content-Security-Policy` `Referrer-Policy` |
| `HEAD /note.txt` | none | — | — | 200 with `Content-Length: 4` |
| `HEAD /missing.txt` | none | — | — | 404 |
| `GET /<300 bytes>` | none | — | — | 404 |

### Names as sent

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /a%20b.txt` | none | — | — | 200 `space` |
| `GET /a+b.txt` | none | — | — | 200 `plus` |
| `GET /%252e` | none | — | — | 200 `pct` |
| `GET /sub%2Fdeep.txt` | none | — | — | 200 `deep` |

### Types

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /note.txt` | none | — | — | 200 `note` with `Content-Type: text/plain; charset=utf-8` |
| `GET /PHOTO.JPG` | none | — | — | 200 `jpg` with `Content-Type: image/jpeg` |
| `GET /style.css` | none | — | — | 200 `p{}` with `Content-Type: text/css; charset=utf-8` |
| `GET /model.safetensors` | none | — | — | 200 `weights` with `Content-Type: application/octet-stream` |

### Methods

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `POST /note.txt` | none | — | — | 405 with `Allow: GET, HEAD` `Connection: keep-alive` |
| `PUT /note.txt` | none | — | `abc` | 405 with `Allow: GET, HEAD` |
| `DELETE /note.txt` | none | — | — | 405 with `Allow: GET, HEAD` |
| `OPTIONS /note.txt` | none | — | — | 405 with `Allow: GET, HEAD` |
| `PUT /note.txt` | none | `Expect: 100-continue` `Content-Length: 5` | — | 405 with `Connection: close` |

### Requests that cannot be read

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /a%zz` | none | — | — | 400 with `Connection: close` `Content-Type: text/plain; charset=utf-8` |
| `GET /note.txt` | none | `Transfer-Encoding: gzip` | — | 400 with `Connection: close` |
| `GET /api/status` | none | `Transfer-Encoding: gzip` | — | 400 with `Content-Type: text/plain; charset=utf-8` |
| `PUT /note.txt` | none | `Transfer-Encoding: chunked` | — | 411 holding `Content-Length` with `Connection: close` |
| `POST /note.txt` | none | — | 65,536 bytes | 405 |
| `POST /note.txt` | none | — | 65,537 bytes | 413 with `Connection: close` |
| `GET /note.txt` | none | `Content-Length: 70000` | — | 413 |
| `GET /note.txt` | none | `X-Fill: <65,000 bytes>` | — | 200 `note` |
| `GET /note.txt` | none | `X-Fill: <66,000 bytes>` | — | 431 with `Connection: close` |
| `GET / HTTP/2.0` | none | — | — | 505 with `Connection: close` |

### The connection

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /note.txt` | none | `Connection: close` | — | 200 `note` with `Connection: close` |
| `GET /note.txt HTTP/1.0` | none | — | — | 200 `note` with `Connection: close` |
| `GET /note.txt HTTP/1.0` | none | `Connection: keep-alive` | — | 200 `note` with `Connection: keep-alive` |

### Parts and copies kept, at work

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /note.txt` | none | `If-None-Match: <the ETag>` | — | 304 |
| `GET /note.txt` | none | `If-None-Match: W/<the ETag>` | — | 304 |
| `GET /note.txt` | none | `If-None-Match: *` | — | 304 |
| `HEAD /note.txt` | none | `If-None-Match: <the ETag>` | — | 304 |
| `GET /note.txt` | none | `If-None-Match: "other"` | — | 200 `note` |
| `GET /note.txt` | none | `If-Modified-Since: <the Last-Modified>` | — | 304 |
| `GET /note.txt` | none | `If-Modified-Since: Thu, 01 Jan 2099 00:00:00 GMT` | — | 200 `note` |
| `GET /note.txt` | none | `If-Match: "other"` | — | 412 with `Connection: keep-alive` |
| `GET /note.txt` | none | `If-Match: <the ETag>` | — | 200 `note` |
| `GET /note.txt` | none | `If-Unmodified-Since: Thu, 01 Jan 1970 00:00:00 GMT` | — | 200 `note` |
| `GET /note.txt` | none | `Range: bytes=1-2` | — | 206 `ot` with `Content-Range: bytes 1-2/4` |
| `GET /note.txt` | none | `Range: bytes=1-` | — | 206 `ote` with `Content-Range: bytes 1-3/4` |
| `GET /note.txt` | none | `Range: bytes=-2` | — | 206 `te` with `Content-Range: bytes 2-3/4` |
| `GET /note.txt` | none | `Range: bytes=9-` | — | 416 with `Content-Range: bytes */4` `Connection: keep-alive` |
| `GET /note.txt` | none | `Range: bytes=0-0,2-3` | — | 200 `note` |
| `GET /note.txt` | none | `Range: lines=1-2` | — | 200 `note` |
| `GET /note.txt` | none | `Range: bytes=3-1` | — | 200 `note` |
| `HEAD /note.txt` | none | `Range: bytes=1-2` | — | 200 with `Content-Length: 4` |
| `GET /note.txt` | none | `Range: bytes=1-2` `If-Range: <the ETag>` | — | 206 `ot` |
| `GET /note.txt` | none | `Range: bytes=1-2` `If-Range: "other"` | — | 200 `note` |
| `GET /note.txt` | none | `Range: bytes=1-2` `If-Range: Thu, 01 Jan 2099 00:00:00 GMT` | — | 200 `note` |

### The JSON API, at work

| Request | Token | Headers | Body | Answer |
| :-- | :-- | :-- | :-- | :-- |
| `GET /api/status` | none | — | — | 200 holding `"local":false` and `"conditional_writes":false` and `"root":""` and `"max_connections":128` with `Content-Type: application/json` |
| `GET /api/status` | none | — | — | 200 holding `"uptime_s":` and `"requests":` and `"connections_total":` and `"connections_open":` and `"connections_refused":` and `"writes":` and `"heap_bytes":` |
| `HEAD /api/status` | none | — | — | 405 with `Content-Type: application/json` `Content-Length: 43` `Allow: GET` |
| `POST /api/status` | none | — | — | 405 `{"error":"Method Not Allowed","status":405}` with `Allow: GET` |
| `GET /api/missing` | none | — | — | 404 `{"error":"Not Found","status":404}` with `Content-Type: application/json` |
| `GET /api/file?path=note.txt` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `PUT /api/file?path=note.txt` | none | — | `abc` | 404 `{"error":"Not Found","status":404}` |
| `GET /api/stat?path=note.txt` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `GET /api/list?path=sub` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `GET /api/here` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `POST /api/stop` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `GET /api/allow` | none | — | — | 404 `{"error":"Not Found","status":404}` |
| `POST /api/build` | none | — | — | 404 `{"error":"Not Found","status":404}` |
