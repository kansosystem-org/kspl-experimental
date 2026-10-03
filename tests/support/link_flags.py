#!/usr/bin/env python3
# The platform decision for the libraries handed over when linking the C / LLVM IR ksplc put out.
#
# The one source for the reasons is the comment around LDLIBS in the Makefile; this copies it to
# the Python side.
# Caution: Do not copy the decision into each test: the third copy drops something, and Windows
# CI fails on unresolved `__imp_socket` and the like.
#
# Points:
#   * Windows: TCP/UDP go through winsock2, so -lws2_32 is always wanted (the whole preamble of
#     hosted.c always comes in, network or not).
#   * Windows: `CommandLineToArgvW` lives in shell32, so -lshell32 is always wanted too (the
#     generated main takes argv back from UTF-16; hosted.c's kspl_os_argv).
# Caution: **mingw resolves it from the default import library, so it builds even with this
#     dropped**; only the MSVC target falls, at the seed's first link, on an unresolved
#     `__imp_CommandLineToArgvW`.
#   * clang on an MSVC target: the maths functions are in the CRT and no m.lib exists, so -lm is a
#     link error.
#   * Linux: below glibc 2.34 the pthread_* are in libpthread, so -lpthread is wanted.
#   * macOS: pthread is in libSystem and there is no libpthread, so -lpthread is an error.
#
# Only "what makes the link fail if absent" is held here; an option that changes how it builds
# (removing unreferenced sections) is answered by ksplc (`info exe-flags`).
import os, subprocess, sys

CC = os.environ.get("CC", "clang")

# sys.platform cannot decide Windows: MSYS2's "msys" Python says "msys" and Cygwin "cygwin". The
# environment variable OS==Windows_NT is inherited by every Windows shell (the same basis as the
# Makefile's $(OS) decision).
IS_WINDOWS = os.environ.get("OS") == "Windows_NT" or sys.platform == "win32"
IS_MACOS = sys.platform == "darwin"

# An MSVC target (link.exe) and a GNU target (mingw/GNU ld) want different libraries even for the
# same "clang", so the actual target triple is read with -dumpmachine.
_target_triple = subprocess.run([CC, "-dumpmachine"], capture_output=True,
    text=True).stdout
IS_MSVC_TARGET = "msvc" in _target_triple

MATH_LIB = [] if IS_MSVC_TARGET else ["-lm"]
PTHREAD_LIB = [] if (IS_WINDOWS or IS_MACOS) else ["-lpthread"]

# The libraries wanted on Windows alone.
# Caution: **Hold the run alone, with no decision mixed in**: folded into `if IS_WINDOWS else []` it
# is empty on Linux, and link_flags_test.py **loses what it matches against locally**. c_libs()
# decides at call time.
WIN32_LIBS = ["-lws2_32", "-lshell32"]


def c_libs():
    """The libraries handed over when linking the C backend's output.

    Caution: Place them **behind** the source files. GNU ld resolves arguments one way from the left
    alone, so placed in front they pass through in a state of "there is no unresolved symbol yet"
    and make a link error.
    IS_WINDOWS is read at call time (the checking side swaps it so the Windows branch can be
    confirmed on Linux too).
    """
    return MATH_LIB + PTHREAD_LIB + (WIN32_LIBS if IS_WINDOWS else [])


def llvm_libs():
    """The libraries handed over when linking the LLVM backend's output.

    The same as the C backend's: an LLVM artifact links the same C runtime that `ksplc
    emit-runtime` puts out, so what is wanted does not change. It is held under a second name so
    the caller can read which back it is from what it wrote, not to change the answer.
    """
    return c_libs()


# The stack size [bytes] asked of the executable, levelled with Linux/macOS's default (8MB).
#
# **The Windows linker reserves only 1MB by default**, so Windows alone would hit **a real stack
# exhaustion** before the depth cap. **The option differs per linker** (`/STACK` for link.exe,
# `--stack` for GNU ld).
# **Dropping it does nothing at all on Linux and macOS**; on Windows a process dying with piped,
# fully buffered output leaves not one byte, so **every check fails with the reason empty**.
# link_flags_test.py's "the Windows stack setting matches the Makefile" watches it.
STACK_BYTES = 8388608


def stack_flags():
    """The linker flags asking for the executable's stack size. Empty where not handed them.

    Caution: **Only harness_build.build_exe adds them.** Make it the shape of adding them per caller and
    the one line that forgot builds at 1MB — and since nothing at all happens on Linux, it cannot
    be noticed.
    """
    if not IS_WINDOWS:
        return []
    if IS_MSVC_TARGET:
        return [f"-Wl,/STACK:{STACK_BYTES}"]
    return [f"-Wl,--stack,{STACK_BYTES}"]

