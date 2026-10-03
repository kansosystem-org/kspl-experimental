#!/usr/bin/env python3
"""The base the Python suites use.

Caution: **Look at `harness.kspls` before adding here.** The suites are on the KSPL side, and what is
left in Python is the few that watch over Python itself ("The reason it stays" in
`../docs/DESIGN.md`). Place the same tool in both and only the one you thought you mended
is mended.

Conventions:
  * A verdict comes out as one `pass` / `FAIL` / `SKIP` line per case, with a
    `RESULT:` line last. A case that could not be run comes out as `SKIP` (the count
    and the names appear on the `RESULT:` line too).
  * The exit code is how the verdict reaches the Makefile (the `RESULT:` line is for
    people and logs).
  * `EXE` defaults to out/ksplc_stage1.exe. KANSO_CC_EXE swaps it (CI uses that).
  * The output is fixed to UTF-8, so a message carrying anything outside ASCII may be
    printed as it stands (the reason is at the reconfigure below).

Caution: **To read it from a suite, put `sys.path` through.** A suite runs from `tests/suite/`, so
`tests/support/` is not among Python's default search places (the script's folder). The one line
that puts it through goes at the suite's head (the "A typical use" below).

A typical use:
    import os, sys
    sys.path.insert(0, os.path.join(
        os.path.dirname(os.path.abspath(__file__)), os.pardir, "support"))

    import harness as h

    h.check("a name", a condition, "the detail on failure")
    h.finish()
"""
import os
import subprocess
import sys

# A verdict line can carry characters outside ASCII (an em dash, echoed file content), so the output
# is fixed to UTF-8: bare Python on Windows writes cp1252 to a pipe, and one such line becomes a
# UnicodeEncodeError traceback in place of the failure's real reason.
# Caution: **Send it out line by line** (`line_buffering`). Fully buffered, it goes out mid-line, so
# when `ci` bundles suites into one pipe a cut line joins another suite's (the reason on the KSPL
# side is `begin` in `harness.kspls`).
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)

def _find_root(start):
    """It walks up looking for the folder holding the marks (`Makefile` and `ksplc/`).

    Caution: **Do not count the steps.** This file lives in `tests/support/`, but mending the step count
    every time the place changes means writing the same mistake as `root()` in harness.kspls in two
    places.
    """
    d = start
    while True:
        if os.path.isfile(os.path.join(d, "Makefile")) and os.path.isdir(os.path.join(d, "ksplc")):
            return d
        up = os.path.dirname(d)
        if up == d:
            return start
        d = up


ROOT = os.environ.get("KANSO_ROOT") or _find_root(os.path.dirname(os.path.abspath(__file__)))
EXE = os.environ.get("KANSO_CC_EXE") or os.path.join(ROOT, "out/ksplc_stage1.exe")

_failures = []
_skipped = []


# ==========================================
# Recording and reporting the verdict
# ==========================================
# The label carried on each per-item line.
# Caution: **This one place assembles the string** (the origin is the table in
# `tests/support/conventions_line.kspls`). **Do not have the suite side write it**: the source is
# the one table in `mk/test.mk`, and a copy goes out of step. It is empty when run directly.
def _tag() -> str:
    name = os.environ.get("KANSO_SUITE", "")
    return f"{name}: " if name else ""


def check(name, ok, detail=""):
    """It puts one case's result out on one line and records a failure. ok comes back as it is.

    Caution: **Hand a case that does not hold on that target over as ok=None.** Hand it over as True and
    a case that confirmed nothing becomes the same one `pass` line as one that did,
    indistinguishable from the log. The reason it does not hold goes in detail (it appears on the
    `SKIP` line).
    """
    if ok is None:
        print(f"SKIP {_tag()}{name}: {detail}")
        _skipped.append(name)
        return None
    print(f"{'pass' if ok else 'FAIL'} {_tag()}{name}{'' if ok else ': ' + detail}")
    if not ok:
        _failures.append(name)
    return ok


def finish():
    """It puts the `RESULT:` line out and ends, the verdict as the exit code (it does not
    return).

    Caution: Put the names of the skipped cases out too. With the count alone, which was left
    unconfirmed cannot be told from the log.
    """
    if _failures:
        print(f"RESULT: SOME FAILED ({len(_failures)}) -> " + ", ".join(_failures))
        sys.exit(1)
    if _skipped:
        print(f"RESULT: ALL PASS ({len(_skipped)} skipped) -> " + ", ".join(_skipped))
        sys.exit(0)
    print("RESULT: ALL PASS")
    sys.exit(0)


# ==========================================
# Raising a process
# ==========================================
def run(argv, cwd=ROOT, env_extra=None, drop_env=(), timeout=None):
    """It runs argv and returns (exit code, stdout+stderr).

    A diagnostic comes out on either stdout or stderr depending on the compiler's version and
    road, so the two are always joined and returned, lest the deciding side drop one.

    Caution: **A program whose relative path carries a separator is resolved from cwd.** subprocess uses
    cwd only as "the child's working directory", not for finding the executable. Without levelling
    that here, an argument's path is from cwd while the program's path is from the caller — one
    path in two states of meaning.
    """
    argv = list(argv)
    if os.sep in argv[0] or "/" in argv[0]:
        if not os.path.isabs(argv[0]):
            argv[0] = os.path.join(cwd, argv[0])
    env = None
    if env_extra or drop_env:
        env = dict(os.environ)
        for k in drop_env:
            env.pop(k, None)
        env.update(env_extra or {})
    p = subprocess.run(argv, capture_output=True, cwd=cwd, env=env, timeout=timeout,
        encoding="utf-8", errors="replace")
    return p.returncode, p.stdout + p.stderr
