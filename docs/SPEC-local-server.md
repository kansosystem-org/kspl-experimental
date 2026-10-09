# The local server's protocol

A web page cannot open a file on your computer by its path. This document sets how such a page asks a small program on the same machine, the *local server*, to read and write files for it, and what that program must refuse.

**This is the protocol a page in a browser uses to ask the local machine for files.** By design, a browser lets a page open a file only through a window a person chooses, and a page cannot walk folders or reach a file by its path. So one local program answers these requests. The same program serves the page, so the same-origin rule (a browser lets a page freely call only the server the page came from) does not block them. **It starts no program**: a server that starts programs on a page's request is one whose every guard must hold, for what a page can ask for there is running code.

**It describes no single implementation**: the server is meant to be replaceable, so only the rules live here. Why the protocol has its own document, and why each rule was chosen, is "13.10 A page asks the local machine through one protocol" in [`DESIGN.md`](DESIGN.md).

**Both ends are built**: `kssrv --local` answers everything below, and the page asks from `kspage/port/web/local.js`.

## Who asks whom

The page asks and the server answers; nothing goes the other way. The picture shows the two steps, both on one machine.

```mermaid
flowchart LR
    subgraph M[the local machine]
        S[the local server] -->|1. serves the page| B[the browser]
        B --> P[the page runs]
        P -->|2. asks for files and folders| S
    end
```

**Only the page asks.** The server never touches the page's contents unasked. It does not know the document either: it delivers only text and byte sequences, and the page decides where in the document they go.

**Nothing flows the other way.** Whether a file changed is asked for ("Watching" below), so no connection carries news from the server, and no WebSocket (a connection the server can push messages down) is used.

## Where it listens

The server can be reached only from this machine, only with a secret it prints at start-up, and only for files inside one folder. The rules below set each of the three limits.

Words used here: the *loopback* is the address `127.0.0.1`, which only this machine can reach. The *token* is a random secret string the server makes at start-up. The *root* (`<root>`) is the one folder whose files the server reads and writes.

| Rule | Why |
| :-- | :-- |
| **It listens on `127.0.0.1` only** | It is out of reach of other machines. Serving them is a separate matter, which this protocol refuses |
| **It answers only a request whose `Host` names the loopback** (`127.0.0.1` or `localhost`, any port), and refuses any other with 403, the page included | A web page whose name is re-pointed at `127.0.0.1` (DNS rebinding) reaches the port as its own origin and sends its own name. Without this rule it would read whatever the page can |
| **No file under the root is handed out without the token, the page alone excepted**, static serving included | A file served freely would come from the origin that keeps the token. So an HTML file in the root opened in the page's tab could read the token, and any program on this machine could read the root |
| **The server prints a token (`token`) once, at start-up, and knowing the address alone is not enough to ask.** A request without the token is refused with 401 | Only `GET /`, the page, needs none: the page is where the token is handed over |

DNS rebinding works like this: a site you visit changes what its own name points at to `127.0.0.1`. The browser then treats your local server as part of that site. The `Host` header (which names the server a request is meant for) still carries the site's name, so the server can tell.

The page reads what it shows through `GET /api/file`, a picture beside the document included. An `<img>` cannot send the token's header, so the page fetches the bytes and hands them to it.

**The page cannot reach outside the root (`<root>`)**, through any endpoint. Two refusals guard this, and both are needed:

| Refusal | What it refuses | Why it is needed |
| :-- | :-- | :-- |
| **The text** | `..` levels, an absolute path, a NUL, a Windows device name (such as `CON` or `NUL`). `%XX` is decoded exactly once (`%252e` is a name reading `%2e`, and does not become `.`) | These spellings leave the root by themselves |
| **A link inside the root** | A symbolic link at any level of the path. Each level is inspected | The text check alone cannot close this hole: `link.txt` is a legitimate name, so a check looking for `..` lets it through |

Caution: **Do not inspect only the last level**: a link on a folder would pass unseen.

**A race remains**: the server inspects the path first and opens it afterwards, and the folders can change in between. Say a request asks for `notes/a.txt`. The server finds that `notes` is a real folder, not a link. Before it opens the file, another program replaces `notes` with a link to the user's home folder, and the open follows that link out of the root. So the two refusals stop a client that can only send a path, such as a web page in the browser, which cannot make a link inside the root. They do not stop a program on the same machine that can write into the root. Closing the race needs two things together: an open that the kernel itself keeps inside the root's folder (on Linux, `openat2` with `RESOLVE_BENEATH`), and file functions that pass on the file already opened rather than the path's text, so that nothing looks the path up a second time.

**There is exactly one exception: the page named by the person who launches the server.** That person may name, at launch, the one file returned for `/` and `/index.html` (`kssrv --page=<file>`). The page still cannot point outside the root: it cannot choose that file with a string it wrote. Only one file can be named, never a folder, because a folder would be a second root that the two refusals above do not cover.

* **Naming it is the launching person's judgment.** Named while the server faces outward (without `--local`), that file is served to other machines, so treat it as a choice as weighty as choosing the root.
* **Do not start up when the named file does not exist**: a later 404 leaves nobody able to tell why the page is blank.

### How the token gets across

The token reaches the page once, inside the URL a person opens, and the page then sends it with every request.

**The server prints one line, `http://127.0.0.1:<number>/#t=<token>`, and a person opens it once.** Then:

1. The page moves the token from the fragment (the part of the URL after `#`) into `sessionStorage`, the browser's storage for one tab.
2. It at once removes the token from the URL with `history.replaceState`, so the browser history keeps no token.
3. After that, every request carries it in a header (`Authorization: Bearer`).

**It survives a reload**: `sessionStorage` stays inside the tab, disappears when the tab closes, and cannot be read from another origin. So a person opens the URL once per start-up.

Caution: **Do not hand it over in the response that serves the page.** Anyone who knows the address could read it there, so "knowing the address alone is not enough to ask" would be false.

The token goes nowhere else either:

| The rule | What is done instead |
| :-- | :-- |
| **It is a fragment (`#`), not a query (`?`).** | The fragment, which a browser never sends to the server |
| **Do not make an endpoint that returns it on request**, and do not put it in a response's header: both are the same hole as the response above | Printed once, on the console |
| **Do not hand it over in a cookie.** | A header, `Authorization: Bearer` |
| **Do not take the token from the command line** | The server makes it from the OS's random source |
| **Do not stop the comparison at the first differing byte**: the response time would then reveal the token one byte at a time | Every byte is compared |

## Only three things can be asked for

A page can read and write files, watch whether a file changed, and keep the server running or stop it. Nothing else is offered.

**Do not add an endpoint that starts a program**, for building, debugging, completion or a plugin. Every one turns a request a page can make into running code. **Nor one that lists a folder**: the page asks for each file by its name, and a listing would hand the names under the root to whoever holds the token.

### Files

The page reads a file whole and writes a file whole, by its path under the root.

| Request | Response |
| :-- | :-- |
| `GET /api/file?path=<p>` | That byte sequence. 404 if absent |
| `PUT /api/file?path=<p>` | Writes the body under that name. On success, `{"wrote":<byte count>}` |

**`HEAD` is not supported**: "Watching" below returns the size and whether the file exists. The server does not guess the type; it returns `application/octet-stream` (plain bytes). The character encoding is UTF-8 only, with no way to read another.

Caution: **Do not let a write that dies halfway corrupt the original.** Write to another name, then replace. **That other name goes through the same two refusals**: a link already standing there would take the write outside the root.

**Set a ceiling.** A request over it is refused with 413, not silently cut short.

### Watching

The page asks, from time to time, whether a file changed. The server answers with the file's size and the time it last changed.

| Request | Response |
| :-- | :-- |
| `GET /api/stat?path=<p>` | `{"size":…,"changed_at":…}`. 404 if absent |

**The OS's file watching (inotify / ReadDirectoryChangesW) is not offered.** The page polls instead (asks again at intervals) and re-reads what changed. However often a file changed in between, the page catches up with its final state.

Caution: **Do not return the contents**, only whether the file changed. Where the page needs the contents, it re-reads them through the file endpoint, so the same text never arrives by two paths.

### Keeping the server alive while a page is open

An open page keeps one connection open to the server. When no page holds one, the server stops after a wait.

| Request | Response |
| :-- | :-- |
| `GET /api/here` | A response whose length is not stated, and **not one byte of it ever arrives**. It ends when the connection does |

**A page holds one connection open for as long as it is open, and the server stops once nothing holds it.** How long it waits with nothing holding it is set at launch (`--idle=<seconds>`); if no time is set, it does not stop.

**Do not use a timer on the page instead**, and do not judge use by the last request alone.

**Do not rely on the page saying goodbye.**

Caution: **Open the hold again if it ends.** A connection can break while the page stays open, and without a new hold the server counts down while a person is still writing.

#### Stopping it when asked

A page, or any program holding the token, can stop the server at once.

| Request | Response |
| :-- | :-- |
| `POST /api/stop` | `{}`, and then the server stops |

**Whoever holds the token may stop the server**, as they may ask for anything else; without it the answer is 401 and the server keeps running. Facing outward there is no token to ask with, so there is no stop either (404).

**The answer goes out before the server stops**, so the asker tells "it stopped" from "the connection broke". It stops once that answer has been sent, whatever pages hold it.

**A server is stopped by this request, not by a signal to its process.**

## How it refuses

Each refusal comes back as one of the HTTP status codes below. **A refusal must not be silent**: every refusal says what happened.

| Status | When it is returned |
| :-- | :-- |
| 400 | A malformed request, or a malformed `%XX` |
| 401 | No token, or it does not match |
| 403 | It pointed outside the root, or named a `Host` other than the loopback |
| 404 | A name that does not exist, or an unknown endpoint |
| 405 | A `HEAD`, `DELETE`, and so on to the file endpoint |
| 413 | The body exceeded the ceiling |
| 500 | It could not be written or replaced |

## When it is not connected

A page may be opened with no local server behind it. Then it hides the tools that need one and keeps the rest.

**Do not present the unconnected state as a separate mode**: the screen then could not say why a path cannot be typed.

**The page asks once whether the server is present, and hides the path tools if it is not.** No tool stays on screen that does nothing when pressed.

**Do not read "an answer came back" as "it is present"**: the same server facing outward answers too. The server states whether it is local-facing, and the page checks that.

**Do not probe endpoints to find out.**

A page opened from `file://` has no server, so it keeps only the document tools. **It is the same page**: no second version is shipped.

## Further reading

* [`README.md`](README.md) — which reader each document here is for.
* [`DESIGN.md`](DESIGN.md) — the Development Principles, which many rules here follow from, and the grounds for this protocol.
* [kssrv](../kssrv/README.md) — the server that answers.
* [kspage](../kspage/README.md) — the editing system that is the client.
