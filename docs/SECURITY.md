# Reporting a security problem

**Do not report a vulnerability in an Issue.** Anyone can read one, so the method is public before the fix. Report it from GitHub's `Security` tab → `Report a vulnerability`, which only the administrators see.

## What counts as a vulnerability

**In scope is anything that lets an input's author take over execution or writing.**

* A crafted input makes `ksplc` execute arbitrary code, or write outside its allowed range.
* An analyzer in `std/` (JSON, URL, regex, safetensors, etc.) reads or writes out of range on such input.
* `ksos/net`'s receive path reads or writes out of range on a crafted frame.
* `kspage` writes unintentionally, depending on an opened document's contents.
* `kssrv` serves or lists a file outside its root, or reads or writes out of range on a crafted request. Under `--local`, it answers `/api/` without the token or starts a process outside the allowed combinations.

**A compiler crash on corrupted input is not by itself a vulnerability.** It is an ordinary defect, so an Issue is fine.

## Out of scope, and what goes upstream

**The optional builds TLS, DB and BLAS pass their work to OpenSSL, SQLite and OpenBLAS**, so report a problem in one of those to that project.

**`.devcontainer/` is a local tool, not something shipped**, so it is out of scope.
