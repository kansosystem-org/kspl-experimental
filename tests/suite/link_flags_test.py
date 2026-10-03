#!/usr/bin/env python3
"""It pins down that the link options are gathered in one place.

The decision on what is handed over when linking an artifact (the per-platform libraries, the
stack size asked of the executable, the removal of unreferenced sections) belongs to ksplc, which
answers outward with `info link-libs` / `info exe-flags`.
Caution: Two copies remain even so.

  * `Makefile`'s LDLIBS / CFLAGS — it links ksplc itself, so ksplc cannot be asked.
  * `tests/support/link_flags.py` — it makes the first ksplc out of the seed's C, so
    it cannot be asked either (windows-msvc in `.github/workflows/ci.yml` reads it).

**Where a duplication cannot be removed, a check that catches a discrepancy is placed** — that is
this repository's way. This is that check.

Caution: **It stays in Python because what it watches over is Python** (there is nowhere to
move it to).
"""
import os
import re
import sys

# It reads the base (the reason is `tests/support/harness.py`'s opening header).
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "support"))

import harness as h  # noqa: E402  (unresolvable until the sys.path above is put through)
import link_flags  # noqa: E402


def makefile_body():
    """The Makefile's content with the comment lines removed.

    Caution: Remove the comment lines. The same characters come up in the prose explaining "why this
    flag is wanted" as well.
    """
    with open(os.path.join(h.ROOT, "Makefile"), encoding="utf-8") as f:
        return "\n".join(l for l in f.read().splitlines() if not l.lstrip().startswith("#"))


def case_link_libs_agree():
    """`ksplc info link-libs` and link_flags.c_libs() agree."""
    code, out = h.run([h.EXE, "info", "link-libs"])
    if code != 0:
        return False, f"info link-libs failed\n{out}"
    got = out.split()
    want = link_flags.c_libs()
    if got != want:
        return False, f"ksplc={got} and link_flags.py={want} disagree"
    return True, " ".join(got) or "(empty)"


def case_llvm_link_libs_agree():
    """`ksplc --target=llvm info link-libs` and link_flags.llvm_libs() agree.

    The answer is the same as the C backend's (an LLVM artifact links the same C runtime). A
    disagreement here builds the left and right of the suites that build both backends and match
    them (equiv / property) under different conditions.
    """
    code, out = h.run([h.EXE, "--target=llvm", "info", "link-libs"])
    if code != 0:
        return False, f"info link-libs failed\n{out}"
    got = out.split()
    want = link_flags.llvm_libs()
    if got != want:
        return False, f"ksplc={got} and link_flags.py={want} disagree"
    return True, " ".join(got) or "(empty)"


def case_win32_libs_agree():
    """The libraries wanted on Windows alone agree between the Makefile and link_flags.py.

    Caution: **This discrepancy does nothing at all on Linux or macOS.** "info link-libs agrees with
    link_flags.py" above compares against the real machine's answer, so away from Windows both
    come out the same (-lm -lpthread) and that difference is not looked at.
    **mingw resolves it
    from the default import library, so it builds even on windows-ucrt64** — what falls is the
    MSVC target alone, and since it is the very first step of linking the seed, in CI it comes out
    in the shape of not one suite running.
    A Windows-only line is told apart by "the stack setting that exists only on Windows is on
    the same line".
    """
    lines = [l for l in makefile_body().splitlines()
        if re.search(r"-Wl,(?:/STACK:|--stack,)", l)]
    if len(lines) != 2:
        return False, f"the Makefile's Windows LDLIBS is not two lines: {len(lines)}"
    per_line = [sorted(set(re.findall(r"-l\S+", l))) for l in lines]
    if per_line[0] != per_line[1]:
        return False, (f"the MSVC side {per_line[0]} and the GNU side {per_line[1]} disagree"
            " (add to one alone and it falls in the other's CI alone)")
    want = per_line[0]
    got = sorted(set(link_flags.WIN32_LIBS))
    if got != want:
        return False, f"Makefile={want} and link_flags.WIN32_LIBS={got} disagree"
    # Not the constant: whether c_libs() carries them on Windows (the decision is swapped so the
    # Windows branch runs on Linux too).
    saved = (link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET)
    try:
        link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET = True, False
        win = link_flags.c_libs()
        link_flags.IS_WINDOWS = False
        other = link_flags.c_libs()
    finally:
        link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET = saved
    missing = [x for x in want if x not in win]
    if missing:
        return False, f"not carried by Windows's c_libs(): {missing} / {win}"
    leaked = [x for x in want if x in other]
    if leaked:
        return False, f"must not be handed over away from Windows: {leaked}"
    return True, " ".join(want)


def case_stack_flags_agree():
    """The stack size asked of Windows agrees between the Makefile and link_flags.py.

    Caution: **Dropping it does nothing at all on Linux or macOS.** The Windows linker's default (1MB)
    is smaller than Linux's 8MB, so the fixtures that take deep recursion alone die of **a real
    stack exhaustion** before reaching the depth cap.
    **The output is fully buffered on a pipe,
    so a process that died leaves not one byte** — it comes out as "every check failing with the
    reason empty", a shape from which the cause cannot be traced.
    """
    want = sorted(set(re.findall(r"-Wl,(?:/STACK:|--stack,)\d+", makefile_body())))
    if len(want) != 2:
        return False, f"the Makefile lacks both the MSVC and GNU options: {want}"
    # Not the constant: whether stack_flags() carries them on both targets.
    saved = (link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET)
    try:
        link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET = True, True
        msvc = link_flags.stack_flags()
        link_flags.IS_MSVC_TARGET = False
        gnu = link_flags.stack_flags()
        link_flags.IS_WINDOWS = False
        other = link_flags.stack_flags()
    finally:
        link_flags.IS_WINDOWS, link_flags.IS_MSVC_TARGET = saved
    got = sorted(set(msvc + gnu))
    if got != want:
        return False, f"Makefile={want} and link_flags.stack_flags()={got} disagree"
    if other:
        return False, f"must not be handed over away from Windows: {other}"
    return True, " ".join(got)


# The files that may line the options up themselves: link_flags.py (the Python side's source),
# this suite (its checks above), cli_test.kspls (it looks at the query itself), vscode_test.kspls
# (it holds the editor's build task, which cannot ask, to the libraries per platform).
# Caution: **harness_build.kspls hands the subject over in a variable, so it is not wanted here**;
# add it and a later direct listing goes unnoticed.
LINK_OWNERS = {"link_flags.py", "link_flags_test.py", "cli_test.kspls", "vscode_test.kspls"}

# The platform libraries a KSPL caller must not type by hand: the ones link_flags.py can answer.
PLATFORM_LIBS = sorted({"-lm", "-lpthread", *link_flags.WIN32_LIBS})

# The options that must not appear in a caller. Python asks link_flags.py for the decision,
# and KSPL asks ksplc, rather than asking by name or typing a platform library as a string.
KSPL_SPELLING = (r"info (?:link-libs|exe-flags)|\"(?:"
    + "|".join(re.escape(lib) for lib in PLATFORM_LIBS) + r")\"")
SPELLINGS = {".py": r"\b(c_libs|llvm_libs|stack_flags)\(\)",
    ".kspl": KSPL_SPELLING, ".kspls": KSPL_SPELLING}


def case_links_go_through_build_exe():
    """The linking of executables is gathered in harness_build.build_exe.

    **Line them up per caller and the one line that forgot builds under different conditions.**
    Carry the stack size on one backend alone and the left and right of the suites that build both
    and match them (backend_equiv / property) come under different conditions, and that difference
    comes out **as a difference between the backends' output**.
    Caution: **Nothing at all happens on Linux or macOS, so it cannot be noticed locally.**
    Handing libraries over = making an executable, so looking at the caller is enough
    (compiling as far as `-c` hands no libs over, so it does not appear here).
    The comment lines are removed. The same characters come up in the prose saying "build_exe
    adds them".
    """
    bad = []
    # The build helper and the suites calling it stand in ksplc's folder.
    for base in ("tests", "tools", os.path.join("ksplc", "tests")):
        for dirpath, _dirs, files in os.walk(os.path.join(h.ROOT, base)):
            for name in sorted(files):
                ext = os.path.splitext(name)[1]
                if ext not in SPELLINGS or name in LINK_OWNERS:
                    continue
                with open(os.path.join(dirpath, name), encoding="utf-8") as f:
                    body = "\n".join(l for l in f.read().splitlines()
                        if not l.lstrip().startswith(("#", "//")))
                hits = sorted(set(re.findall(SPELLINGS[ext], body)))
                if hits:
                    rel = os.path.relpath(os.path.join(dirpath, name), h.ROOT)
                    bad.append(f"{rel}: {', '.join(hits)}")
    if bad:
        return False, ("take the linking through harness_build.build_exe:\n  "
            + "\n  ".join(bad))
    return True, "ok"


def main():
    h.check("info link-libs agrees with link_flags.py", *case_link_libs_agree())
    h.check("--target=llvm's info link-libs agrees with link_flags.py",
        *case_llvm_link_libs_agree())
    h.check("the libraries wanted on Windows alone agree with the Makefile",
        *case_win32_libs_agree())
    h.check("the Windows stack setting agrees with the Makefile", *case_stack_flags_agree())
    h.check("the linking of executables is gathered in harness_build.build_exe",
        *case_links_go_through_build_exe())
    h.finish()


main()
