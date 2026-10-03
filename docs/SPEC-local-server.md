# The local server's protocol

**This is the protocol a page in a browser uses to ask the local machine for files and processes.** By design, a browser lets a page open a file only through a window a person chooses. A page cannot walk folders or launch a process, so it cannot build, run a debugger or open a shell. So one local program answers these requests, and the same program serves the page, so the same-origin rule does not block them.

**It describes no single implementation**: the server is meant to be replaceable, so only the rules live here. Why the protocol has its own document, and why each rule was chosen, is "13.10 A page asks the local machine through one protocol" in [`DESIGN.md`](DESIGN.md).

**Both ends are built**: `kssrv --local` answers everything below, and the page asks from `kspage/port/web/local.js` (files, folders, watching, holding) and `kspage/port/web/plugin.js` (processes).

* [Who asks whom](#who-asks-whom)
* [Where it listens](#where-it-listens) — loopback only, the token, the root
* [Only five things can be asked for](#only-five-things-can-be-asked-for) — files, folders, watching, processes, holding and stopping
* [How it refuses](#how-it-refuses)
* [When it is not connected](#when-it-is-not-connected)

## Who asks whom

```text
the local machine
  the local server ──(1) serves the page──> the browser ──> the page runs
     ↑                                                │
     └──────(2) asks for files, folders, processes ────┘
     └──────(3) sends back what changed, and output ─────────>
```

**Only the page asks.** The server never touches the page's contents unasked. It does not know the document either: it delivers only text and byte sequences, and the page decides where in the document they go.

**(3) flows the other way.** A process's output is not one request and one reply, so it arrives as a response sent in delimited pieces (`Transfer-Encoding: chunked`), which `std/http` supports as it is.

**WebSocket is not used**: typing into a process is a separate request.

## Where it listens

* **It listens on `127.0.0.1` only**, out of reach of other machines; serving them is a separate matter, which this protocol refuses.
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

## Only five things can be asked for

**Do not make a dedicated endpoint for building, debugging or completion.** Each launches a process and passes text back and forth, so it uses "Processes" below. A new tool is likewise one more process to launch. The server's language does not matter: it runs locally, so it need not be compiled to wasm.

The five are below: files, folders, watching, processes, and holding the server or stopping it.

### Files

| Request | Response |
| :-- | :-- |
| `GET /api/file?path=<p>` | That byte sequence. 404 if absent |
| `PUT /api/file?path=<p>` | Writes the body under that name. On success, `{"wrote":<byte count>}` |

**`HEAD` is not supported**: "Watching" below returns the size and whether the file exists. The server does not guess the type; it returns `application/octet-stream`. The character encoding is UTF-8 only, with no way to read another.

Caution: **Do not let a write that dies halfway corrupt the original.** Write to another name, then replace.

**Set a ceiling.** A request over it is refused with 413, not silently cut short.

### Folders

| Request | Response |
| :-- | :-- |
| `GET /api/list?path=<p>` | `{"path":…,"truncated":…,"entries":[{"name":…,"is_dir":…,"size":…}]}` |

Caution: **Say when the list was cut off** (`truncated`). If it is cut off silently, nothing tells an empty folder from a truncated list.

### Watching

| Request | Response |
| :-- | :-- |
| `GET /api/stat?path=<p>` | `{"size":…,"changed_at":…}`. 404 if absent |

**The OS's file watching (inotify / ReadDirectoryChangesW) is not offered.** The page polls instead and re-reads what changed. However often a file changed in between, the page catches up with its final state.

Caution: **Do not return the contents**, only whether the file changed. Where the page needs the contents, it re-reads them through the file endpoint, so the same text never arrives by two paths.

### Processes

| Request | Response |
| :-- | :-- |
| `GET /api/plugins` | Returns `{"plugins":["…"]}`, the names this server will launch. **None is an empty list, not a refusal** |
| `POST /api/run` | Receives `{"cmd":…,"args":[…],"cwd":…,"in":…}` and returns `{"id":…}`. `in` is typed into the child at the start |
| `GET /api/run/<id>` | The output, as a response sent in delimited pieces; at the end, `{"exit":<number>}` |
| `POST /api/run/<id>/in` | Types the body into that child |
| `DELETE /api/run/<id>` | Stops it. The stream being watched gets an ending piece and closes (the number is `-1`, since a stopped child has none) |

**What goes into a child and what comes out of it use one encoding.**

#### What may be launched

Caution: **Do not launch through a shell**: take the command and the arguments separately (`cmd` and `args`).

**Apply the root check to `cwd` too**: launching outside the root is reading outside it.

**The server may limit which combinations it will launch**: unless `cmd` and `args` match a permitted combination, the answer is 403. Allowing more adds a row to a table, not an endpoint.

**The row, not the page, decides what is launched and how it ends.** `cmd` and `args` only choose a row. The row decides what runs, which arguments it gets and whether its input is closed at the start, so a name that matches no row launches nothing.

**A row whose program reads its input to the end has that input closed right after launch** (after `in` is written). Otherwise the program waits for more input forever and prints nothing. A row that holds a conversation keeps its input open.

**A server may hold a folder of programs it will launch, and name them**: `cmd` is `plugin`, `args` is the one name, and `GET /api/plugins` lists the names.

**Do not put that folder under the root being served.** It sits beside the server, placed there by whoever runs it.

**Do not send a path out, and do not take one in**: a name is all the page needs.

**Do not mix "what may be launched" with "where it lives".** The server decides where the definition lives, never from the page's text and never from the PATH.

**When the definition is not found and nothing could be launched, return the places searched** (500 with `{"looked":[…]}`). The page words the fix, as for every refusal: the state comes from the server, the text from the page.

#### How the output comes back

**Each piece sent carries its length.** One piece is `<tag><length><one space><byte sequence>`, and the tags are `O` (standard output), `E` (standard error), and `X` (the end; its contents are `{"exit":<number>}`).

**Output is sent as bytes, not cut into lines**, so colour codes and progress lines that overwrite themselves both pass through. So do not delimit the contents by a character, least of all a newline: pieces are split by length, and the space only marks where the length ends.

**The response does not state a length**, since none is fixed: closing the connection marks the end. That is why the last piece is `X`: it tells a finish from a connection that merely closed.

**Keep draining standard error too**, under its own tag. Undrained, the pipe fills and the child stalls; discarded, nothing tells why the response came out empty.

**Do not lose a finished child's output**: drain the rest before sending the ending piece (`X`). Output that nobody is watching is not stored without a ceiling. At the ceiling the server may stop draining and let the child wait at its write; the rest flows once a watcher connects.

### Keeping the server alive while a page is open

| Request | Response |
| :-- | :-- |
| `GET /api/here` | A response whose length is not stated, and **not one byte of it ever arrives**. It ends when the connection does |

**A page holds one connection open for as long as it is open, and the server stops once nothing holds it.** How long it waits with nothing holding it is set at launch (`--idle=<seconds>`); if no time is set, it does not stop.

**Do not use a timer on the page instead**, and do not judge use by the last request alone.

**Do not rely on the page saying goodbye.**

**A child still running counts as use**: it was started to finish, even with every page gone.

Caution: **Open the hold again if it ends.** A connection can break while the page stays open, and without a new hold the server counts down while a person is still writing.

#### Stopping it when asked

| Request | Response |
| :-- | :-- |
| `POST /api/stop` | `{}`, and then the server stops |

**Whoever holds the token may stop the server**, as they may ask for anything else; without it the answer is 401 and the server keeps running. Facing outward there is no token to ask with, so there is no stop either (404).

**The answer goes out before the server stops**, so the asker tells "it stopped" from "the connection broke". It stops once that answer has been sent, whatever pages hold it.

**The children it launched stop with it.** Left running, nothing could reach them again.

**A server is stopped by this request, not by a signal to its process.**

## How it refuses

**A refusal must not be silent**: every refusal says what happened.

| Status | When it is returned |
| :-- | :-- |
| 400 | A malformed request, or a malformed `%XX` |
| 401 | No token, or it does not match |
| 403 | It pointed outside the root, or asked for a combination that is not permitted |
| 404 | A name that does not exist, an unknown endpoint, or an unknown process number |
| 405 | A `HEAD`, `DELETE`, and so on to the file endpoint |
| 409 | A stream somebody is already watching |
| 413 | The body exceeded the ceiling |
| 500 | It could not be written or replaced, or it could not be launched (the definition is absent, and so on) |
| 503 | The number of processes it can carry was exceeded |

## When it is not connected

**Do not present the unconnected state as a separate mode**: the screen then could not say why there is no terminal.

**The page asks once whether the server is present, and hides the code tools if it is not.** No tool stays on screen that does nothing when pressed.

**Do not read "an answer came back" as "it is present"**: the same server facing outward answers too. The server states whether it is local-facing, and the page checks that.

**Do not probe endpoints to find out.**

A page opened from `file://` has no server, so it keeps only the document tools. **It is the same page**: no second version is shipped.

## Further reading

* [`README.md`](README.md) — which reader each document here is for.
* [`DESIGN.md`](DESIGN.md) — the Development Principles, which many rules here follow from, and the grounds for this protocol.
* [kssrv](../kssrv/README.md) — the server that answers.
* [kspage](../kspage/README.md) — the editing system that is the client.
