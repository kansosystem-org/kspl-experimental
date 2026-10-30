# The local server's protocol

**This document sets the protocol between a page in a browser and a small program on the same machine, the *local server*.** The page asks it to read and write files, which a browser lets a page open only through a window a person chooses. The server also serves the page, so the same-origin rule does not block the requests. **It starts no program**: on a server that did, every request a page can make would be running code.

**It describes no single implementation**: the server is meant to be replaceable, so only the rules live here.

## Who asks whom

The picture shows the two steps, both on one machine.

```mermaid
flowchart LR
    subgraph M[the local machine]
        S[the local server] -->|1. serves the page| B[the browser]
        B --> P[the page runs]
        P -->|2. asks for files and folders| S
    end
```

**Only the page asks, and the server answers.** The server does not know the document: it delivers text and byte sequences, and the page decides where they go. **Nothing flows the other way**: whether a file changed is asked for ("Watching" below), and no WebSocket is used.

## Where it listens

Words used here: the *loopback* is the address `127.0.0.1`, which only this machine can reach. The *token* is a random secret string the server makes at start-up. The *root* (`<root>`) is the one folder whose files the server reads and writes.

| Rule | Why |
| :-- | :-- |
| **It listens on `127.0.0.1` only** | It is out of reach of other machines. Serving them is a separate matter, which this protocol refuses |
| **It answers only a request whose `Host` names the loopback** (`127.0.0.1` or `localhost`, any port), and refuses any other with 403, the page included | DNS rebinding: a site re-points its own name at `127.0.0.1`, and the browser treats this server as that site. The `Host` header still carries the site's name, so the server can tell |
| **No file under the root is handed out without the token, the page alone excepted**, static serving included | A file served freely comes from the origin that keeps the token. An HTML file in the root, opened in the page's tab, could read the token, and with it the whole root |
| **The server prints a token (`token`) once, at start-up, and knowing the address alone is not enough to ask.** A request without the token is refused with 401 | Only `GET /`, the page, needs none: the page is where the token is handed over |

The page reads what it shows through `GET /api/file`, a picture beside the document included. An `<img>` cannot send the token's header, so the page fetches the bytes and hands them to it.

**The page cannot reach outside the root (`<root>`)**, through any endpoint. Two refusals guard this, and both are needed:

| Refusal | What it refuses | Why it is needed |
| :-- | :-- | :-- |
| **The text** | `..` levels, an absolute path, a NUL, a Windows device name (such as `CON` or `NUL`). `%XX` is decoded exactly once (`%252e` is a name reading `%2e`, and does not become `.`) | These spellings leave the root by themselves |
| **A link inside the root** | A symbolic link at any level of the path. Each level is inspected | The text check alone cannot close this hole: `link.txt` is a legitimate name, so a check looking for `..` lets it through |

Caution: **Do not inspect only the last level**: a link on a folder would pass unseen.

**A race remains**: another program can replace an inspected folder with a link out of the root before the open. So the two refusals stop a client that can only send a path, as a web page can. They do not stop a local program that writes into the root. Closing the race needs two things together:

* an open that the kernel itself keeps inside the root's folder (on Linux, `openat2` with `RESOLVE_BENEATH`);
* file functions that pass on the file already opened rather than the path's text, so that nothing looks the path up a second time.

**There is exactly one exception: the page named by the person who launches the server** (`kssrv --page=<file>`), returned for `/` and `/index.html`. Only one regular file can be named. A folder would be a second root the refusals do not cover, and a FIFO's or a device's read never ends.

* **Naming it is the launching person's judgment.** Without `--local` that file is served to other machines, so it is a choice as weighty as choosing the root.
* **Do not start up when the named file does not exist**: a later 404 leaves nobody able to tell why the page is blank.

**The server checks the Host and token after reading the headers, before waiting for the body.** Only GET or HEAD for the page with no body needs no token. Syntax and size errors can be refused before authorization.

### How the token gets across

**The token reaches the page once, inside the URL a person opens: the server prints one line, `http://127.0.0.1:<number>/#t=<token>`, and a person opens it once.** Then:

1. The page reads the fragment (after `#`) once, at start, as `name=value` pairs. It moves the value of `t` into `sessionStorage`, the browser's storage for one tab.
2. It at once removes the token from the URL with `history.replaceState`, so the browser history keeps no token.
3. After that, every request carries it in a header (`Authorization: Bearer`).

**The token is 48 lowercase hexadecimal digits**, made from 24 random bytes. A page takes nothing of another form as the token, so a fragment such as `#heart=1` cannot replace it.

**It survives a reload**: `sessionStorage` stays inside the tab until it closes, and cannot be read from another origin.

Caution: **Do not hand it over in the response that serves the page.** Anyone who knows the address could read it there.

The token goes nowhere else either:

* **It is a fragment (`#`), which a browser never sends to the server, not a query (`?`).**
* **Do not return it from an endpoint or in a response's header**: that is the same hole. It is printed once, on the console.
* **Do not hand it over in a cookie**; it travels in `Authorization: Bearer`.
* **Do not take the token from the command line**; the server makes it from the OS's random source.
* **Compare every byte**: stopping at the first differing byte lets the response time reveal the token byte by byte.

## Only four things can be asked for

A page can read and write files, watch whether a file changed, list a folder, and keep the server running or stop it.

**Do not add an endpoint that starts a program**, for building, debugging, completion or a plugin. Every one turns a request a page can make into running code.

### Files

The page reads a file whole and writes a file whole, by its path under the root.

| Request | Response |
| :-- | :-- |
| `GET /api/file?path=<p>` | That byte sequence. 404 if absent |
| `PUT /api/file?path=<p>` | Writes the body under that name. On success, `{"wrote":<byte count>}` |

A PUT can carry `X-Kanso-If-Content`: either `missing`, or the 64-character lowercase SHA-256 digest of the expected file bytes. `missing` permits creation only when the path does not exist. A digest permits replacement only when the existing bytes match. A mismatch returns 409 without writing; a malformed guard returns 400. Without this header, PUT replaces unconditionally.

The check and replacement run together before this server handles another request. That protects clients sharing one server, not against other processes.

`GET /api/status` declares `conditional_writes: true` when these guards are supported. A client relying on them must refuse writes when this declaration is absent.

**`HEAD` is not supported**: "Watching" below returns the size and whether the file exists. The server returns `application/octet-stream` (plain bytes), without guessing the type. The character encoding is UTF-8 only.

Caution: **Do not let a write that dies halfway corrupt the original.** Write to another name, then replace. **That other name goes through the same two refusals**: a link already standing there would take the write outside the root.

**The ceiling on a PUT body is 8 MiB (8,388,608 bytes), included.** One byte more is refused with 413, not silently cut short. A page can rely on writing back any file up to that size.

Caution: **Do not lift the ceiling, nor make it unlimited.** The server holds each body in memory until it is whole, so the ceiling bounds what a token holder can make it hold.

### Watching

The page asks whether a file is there, and the server answers with its size and the time it last changed.

| Request | Response |
| :-- | :-- |
| `GET /api/stat?path=<p>` | `{"size":…,"changed_at":…}`. 404 if absent |

**When to ask is the page's choice**: before writing over a file, before opening it again, or at intervals. **The OS's file watching (inotify / ReadDirectoryChangesW) is not offered**; the next answer gives the final state.

Caution: **Do not return the contents**, only whether the file changed. The page re-reads them through the file endpoint, so the same text never arrives by two paths.

### Listing a folder

A page lists the names in one folder, so that a Save As dialog can show where a file goes.

| Request | Response |
| :-- | :-- |
| `GET /api/list?path=<p>` | `{"folders":[…],"files":[…],"more":false}`, each list in byte order. An empty or absent path is the root. 404 if it is not a folder |

**A listing gives the holder of the token nothing new**, yet it gives as little as it can:

* **Names only.** No size, no time and no content: "Watching" and "Files" give those.
* **A link is left out**, so the dialog never offers a way out of the root. So is anything that is neither a folder nor an ordinary file.
* **A hidden name is left out**: one that starts with `.`, such as `.git`.
* **A name holding a `\` is left out.** Only POSIX allows one, and there the server refuses it in `path=`, since such a file could not be saved.
* **At most 2000 names come back.** `more` is `true` when others stand there, and the page then asks the person to type the name.

Caution: **Do not list more than one folder in one request**: a tree has no size bound.

### Keeping the server alive while a page is open

While a page is open, one connection to the server stays open. When nothing holds one, the server stops after a wait.

| Request | Response |
| :-- | :-- |
| `GET /api/here` | A response whose length is not stated, and **not one byte of it ever arrives**. It ends when the connection does |

**One tab holds the connection for every open tab of the page on that server, and the server stops once nothing holds it.** The wait is set at launch (`--idle=<seconds>`); with none set, it does not stop.

**Do not use a timer on the page instead**, and do not judge use by the last request alone. **Do not rely on the page saying goodbye.**

Caution: **Hold from one tab only.** A browser opens about six connections to one server, so a hold in each tab uses them up, and the next request waits without end. The tabs agree on one holder through the Web Locks API (`navigator.locks`). When the holder closes, another open tab takes the hold over.

Caution: **Open the hold again if it ends.** Otherwise a broken connection lets the server count down while a person is still writing.

#### Stopping it when asked

A page, or any program holding the token, can stop the server at once.

| Request | Response |
| :-- | :-- |
| `POST /api/stop` | `{}`, and then the server stops |

**Whoever holds the token can stop the server**; without it the answer is 401. Facing outward there is no token, so there is no stop either (404).

**The answer goes out before the server stops**, whatever pages hold it, so the asker tells "it stopped" from "the connection broke".

**A server is stopped by this request, not by a signal to its process.**

## How it refuses

Each refusal comes back as one of the HTTP status codes below. **A refusal must not be silent**: every refusal says what happened.

| Status | When it is returned |
| :-- | :-- |
| 400 | A malformed request (a `Host` given twice included), or a malformed `%XX` |
| 401 | No token, or it does not match. **It comes before every answer about a path other than the page's** (403 and 404 alike). So a request without the token learns nothing of the names under the root |
| 403 | It pointed outside the root, or named a `Host` other than the loopback |
| 404 | A name that does not exist, or an unknown endpoint |
| 405 | A `HEAD`, `DELETE`, and so on to the file endpoint |
| 409 | The conditional write no longer matches the file, or its target is not a regular file |
| 413 | The body exceeded the ceiling |
| 500 | It could not be written or replaced |

## When it is not connected

A client checks `/api/status` once at startup. The response must declare `local: true`; an ordinary outward-facing server is not a local file service. A 401 means the server is present but the token is missing or refused.

A client that requires file access stops startup and tells the user to open the URL the local server printed ("How the token gets across"). It does not substitute a browser file handle or a plain file fetch. The same page is shipped for every supported browser.

## Further reading

* [`README.md`](README.md) — which reader each document here is for.
* [kssrv](../kssrv/README.md) — the server that answers.
* [ksmd](../ksmd/README.md) — the document editor, whose page is a client.
* [ksagent](../ksagent/README.md) — the folder's question answerer, whose chat page is another client.
