# Reporting a security problem

**Do not report a vulnerability in an Issue.** Anyone can read an Issue, so the way to attack would be public before the fix. Report it from GitHub's `Security` tab → `Report a vulnerability`, which only the administrators see.

## What counts as a vulnerability

**A vulnerability is anything that lets the author of an input take over execution or writing**: a crafted file, frame or request makes the program run code it should not, or read or write memory or files outside what it is allowed. These are in scope:

| Part | In scope when a crafted input makes it … |
| :-- | :-- |
| `ksplc` (the compiler) | Execute arbitrary code, or write outside its allowed range |
| An analyzer in `std/` (JSON, URL, regex, safetensors, etc.) | Read or write out of range |
| `ksos/net`'s receive path (the OS's network code), on a crafted frame | Read or write out of range |
| `kspage` (the document editor) | Write unintentionally, depending on an opened document's contents |
| `kssrv` (the server), on a crafted request | Serve or list a file outside its root, or read or write out of range |
| `kssrv` under `--local` | Answer `/api/` without the token, or start a process outside the allowed combinations |

**A compiler crash on corrupted input is not by itself a vulnerability.** It is an ordinary defect, so an Issue is fine.

## Out of scope, and what goes upstream

**Some problems belong to another project or to a tool that is not shipped**, so they are not reported here.

| Where the problem is | What to do |
| :-- | :-- |
| OpenSSL or SQLite, which `ksbind` passes its work to | Report it to that project |
| OpenBLAS, which the optional BLAS build passes its work to | Report it to that project |
| `.devcontainer/`, a local tool and not something shipped | Out of scope |
