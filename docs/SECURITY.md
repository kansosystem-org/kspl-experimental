# Reporting a security problem

**Do not report a vulnerability in an Issue**, which anyone can read before the fix. Report it from GitHub's `Security` tab → `Report a vulnerability`, which only the administrators see.

## What counts as a vulnerability

**A vulnerability is anything that lets the author of an input take over execution or writing.** A crafted file, frame or request makes the program run code, or reach memory or files, that it must not. These are in scope:

| Part | In scope when a crafted input makes it … |
| :-- | :-- |
| `ksplc` (the compiler) | Execute arbitrary code, or write outside its allowed range |
| An analyzer in `std/` (JSON, URL, regex, etc.), or `ksai`'s safetensors reader | Read or write out of range |
| `ksos/net`'s receive path (the OS's network code), on a crafted frame | Read or write out of range |
| `ksmd` (the document editor) | Read or write a file outside its workspace, write unintentionally, or run a script in the page, depending on an opened document's contents |
| `kssrv` (the server), on a crafted request | Serve or list a file outside its root, or read or write out of range |
| `kssrv` under `--local` | Answer `/api/` without the token |
| A document's own functions (`kssrv --builder`, and ksmd's worker) | Build or run any of a document's own code before the person allows that exact file: its path and its bytes. Read a file outside the closed build, or run anything on the machine but the build. Or, from the worker, reach the page, the files or the network |

**Nothing of a document's own code is built or run until you allow that exact file.** A build or a run of bytes not allowed is in scope, whatever asked for it.

**A compiler crash on corrupted input is not by itself a vulnerability.** It is an ordinary defect, so an Issue is fine.

## Out of scope, and what goes upstream

| Where the problem is | What to do |
| :-- | :-- |
| OpenSSL, which `kstls` passes its work to | Report it to that project |
| OpenBLAS, which the optional BLAS build passes its work to | Report it to that project |
| `.devcontainer/`, a local tool and not something shipped | Out of scope |
