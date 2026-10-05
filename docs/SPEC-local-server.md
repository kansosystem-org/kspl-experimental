# The local server's protocol

**This is the protocol a page in a browser uses to ask the local machine for files.** By design, a browser lets a page open a file only through a window a person chooses, and a page cannot walk folders or reach a file by its path. So one local program answers these requests, and the same program serves the page, so the same-origin rule does not block them. **It starts no program**: a server that starts programs on a page's request is one whose every guard must hold, for what a page can ask for there is running code.

**It describes no single implementation**: the server is meant to be replaceable, so only the rules live here. Why the protocol has its own document, and why each rule was chosen, is "13.10 A page asks the local machine through one protocol" in [`DESIGN.md`](DESIGN.md).

**Both ends are built**: `kssrv --local` answers everything below, and the page asks from `kspage/port/web/local.js`.

* [Who asks whom](#who-asks-whom)
* [Where it listens](#where-it-listens) — loopback only, the token, the root
* [Only three things can be asked for](#only-three-things-can-be-asked-for) — files, watching, holding and stopping
* [How it refuses](#how-it-refuses)
* [When it is not connected](#when-it-is-not-connected)

## Who asks whom

```text
the local machine
  the local server ──(1) serves the page──> the browser ──> the page runs
     ↑                                                │
     └──────(2) asks for files and folders ────────────┘
```

**Only the page asks.** The server never touches the page's contents unasked. It does not know the document either: it delivers only text and byte sequences, and the page decides where in the document they go.

**Nothing flows the other way.** Whether a file changed is asked for ("Watching" below), so no connection carries news from the server, and no WebSocket is used.

## Where it listens

* **It listens on `127.0.0.1` only**, out of reach of other machines; serving them is a separate matter, which this protocol refuses.
* **It answers only a request whose `Host` names the loopback** (`127.0.0.1` or `localhost`, any port), and refuses any other with 403, the page included. A web page whose name is re-pointed at `127.0.0.1` (DNS rebinding) reaches the port as its own origin and sends its own name, so without this it would read whatever the page can.
* **No file under the root is handed out without the token, the page alone excepted**, static serving included. A file served freely would come from the origin that keeps the token, so an HTML file in the root opened in the page's tab could read the token, and any program on this machine could read the root. The page reads what it shows through `GET /api/file`, a picture beside the document included (an `<img>` cannot send the header, so the page hands it the bytes).
* **The server prints a token (`token`) once, at start-up, and knowing the address alone is not enough to ask.** A request without the token is refused with 401. Only `GET /`, the page, needs none: the page is where the token is handed over.
* **The page cannot reach outside the root (`<root>`)**, through any endpoint. Two refusals guard this, and both are needed:
  * **The text** … `..` levels, an absolute path, a NUL, a Windows device name.
    * `%XX` is decoded exactly once (`%252e` is a name reading `%2e`, and does not become `.`).
  * **A link inside the root** … the text check alone cannot close this hole: `link.txt` is a legitimate name, so a check looking for `..` lets it through. Each level is inspected, and a link at any level is refused.
    * Caution: **Do not inspect only the last level**: a link on a folder would pass unseen.
  * **A race remains**: a level swapped between the inspection and the open defeats the check, so nothing defends against someone who can write to the root. Closing the race needs an open that the kernel keeps inside the root's subtree (the `openat2(RESOLVE_BENEATH)` family), on an API that passes on what was opened rather than the text.
* **There is exactly one exception: the page named by the person who launches the server.** That person may name, at launch, the one file returned for `/` and `/index.html` (`kssrv --page=<file>`). The page still cannot point outside the root: it cannot choose that file with a string it wrote. Only one file can be named, never a folder, because a folder would be a second root that the two refusals above do not cover.
  * **Naming it is the launching person's judgment.** Named while the server faces outward (without `--local`), that file is served to other machines, so treat it as a choice as weighty as choosing the root.
  * **Do not start up when the named file does not exist**: a later 404 leaves nobody able to tell why the page is blank.

### How the token gets across

**The server prints one line, `http://127.0.0.1:<number>/#t=<token>`, and a person opens it once.** The page moves the token from the fragment into `sessionStorage` and at once removes it from the URL with `history.replaceState`, so the browser history keeps no token. After that, every request carries it in a header (`Authorization: Bearer`).

**It is a fragment (`#`), not a query (`?`).**

Caution: **Do not hand it over in the response that serves the page.** Anyone who knows the address could read it there, so "knowing the address alone is not enough to ask" would be false.

**Do not make an endpoint that returns it on request**, and do not put it in a response's header: both are the same hole.

**Do not hand it over in a cookie.**

**Do not take the token from the command line**; the server makes it from the OS's random source.

**Do not stop the comparison at the first differing byte**: the response time would then reveal the token one byte at a time.

**It survives a reload**: `sessionStorage` stays inside the tab, disappears when the tab closes, and cannot be read from another origin. So a person opens the URL once per start-up.

## Only three things can be asked for

**Do not add an endpoint that starts a program**, for building, debugging, completion or a plugin. Every one turns a request a page can make into running code. **Nor one that lists a folder**: the page asks for each file by its name, and a listing would hand the names under the root to whoever holds the token.

The three are below: files, watching, and holding the server or stopping it.

### Files

| Request | Response |
| :-- | :-- |
| `GET /api/file?path=<p>` | That byte sequence. 404 if absent |
| `PUT /api/file?path=<p>` | Writes the body under that name. On success, `{"wrote":<byte count>}` |

**`HEAD` is not supported**: "Watching" below returns the size and whether the file exists. The server does not guess the type; it returns `application/octet-stream`. The character encoding is UTF-8 only, with no way to read another.

Caution: **Do not let a write that dies halfway corrupt the original.** Write to another name, then replace. **That other name goes through the same two refusals**: a link already standing there would take the write outside the root.

**Set a ceiling.** A request over it is refused with 413, not silently cut short.

### Watching

| Request | Response |
| :-- | :-- |
| `GET /api/stat?path=<p>` | `{"size":…,"changed_at":…}`. 404 if absent |

**The OS's file watching (inotify / ReadDirectoryChangesW) is not offered.** The page polls instead and re-reads what changed. However often a file changed in between, the page catches up with its final state.

Caution: **Do not return the contents**, only whether the file changed. Where the page needs the contents, it re-reads them through the file endpoint, so the same text never arrives by two paths.

### Keeping the server alive while a page is open

| Request | Response |
| :-- | :-- |
| `GET /api/here` | A response whose length is not stated, and **not one byte of it ever arrives**. It ends when the connection does |

**A page holds one connection open for as long as it is open, and the server stops once nothing holds it.** How long it waits with nothing holding it is set at launch (`--idle=<seconds>`); if no time is set, it does not stop.

**Do not use a timer on the page instead**, and do not judge use by the last request alone.

**Do not rely on the page saying goodbye.**

Caution: **Open the hold again if it ends.** A connection can break while the page stays open, and without a new hold the server counts down while a person is still writing.

#### Stopping it when asked

| Request | Response |
| :-- | :-- |
| `POST /api/stop` | `{}`, and then the server stops |

**Whoever holds the token may stop the server**, as they may ask for anything else; without it the answer is 401 and the server keeps running. Facing outward there is no token to ask with, so there is no stop either (404).

**The answer goes out before the server stops**, so the asker tells "it stopped" from "the connection broke". It stops once that answer has been sent, whatever pages hold it.

**A server is stopped by this request, not by a signal to its process.**

## How it refuses

**A refusal must not be silent**: every refusal says what happened.

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
