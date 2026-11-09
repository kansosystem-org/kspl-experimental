/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
/* ============================================================
 * Writing when nobody is left to read it (SIGPIPE)
 *
 * POSIX sends a SIGPIPE where a write goes to a pipe or socket whose reader has closed. The
 * default handling **ends the process**. Left bare, a program is dragged down merely because its
 * partner has gone. It **puts nothing out**, so not one clue to the cause appears anywhere.
 *
 * **The decision: ignore it and return it to the writer as EPIPE.** Every writing call
 * returns a failure as a value (`kspl_proc_send` returns -2, `kspl_net_send` send's return value).
 * So the side receiving it can treat it as a refusal.
 *
 * Caution: **But do not let the output vanish unnoticed.** Where standard output is joined to
 * `head`, Unix's promise is **to finish quietly**. Merely ignored, the program runs on with its
 * output silently thrown away (a common complaint). So **where a write sees EPIPE,
 * the default is put back and the signal sent again** (kspl_io_broken_pipe below; the same shape
 * as Go).
 *
 * Caution: **Do not carry it over to a child.** The ignoring setting **is inherited** across
 * execve. So a child (`git`, `clang`, a shell's pipeline) stops dying too, and `yes | head -1`
 * never ends. It is put back after the fork and before the exec (kspl_child_restore_signals below,
 * called by kspl_proc_start in hosted_spawn.c).
 * ============================================================ */
#ifndef _WIN32
#include <signal.h>
/* No include after this section is leaned on (the preamble comes first). */
#include <errno.h> /* the EPIPE judgement below */

/* Caution: **Make it take effect before `main`.** Called from the generated `main`, it would miss
 * the `main` the LLVM backbone writes by hand (gen/llvm/module.kspl). Both join this runtime.
 * **A library leaves the signal to the program that links it** (KSPL_LIBRARY). Its handling is
 * process-wide, and that program has chosen it for its own writes. */
#if !defined(KSPL_LIBRARY)
__attribute__((constructor)) static void kspl_sigpipe_init(void) {
    signal(SIGPIPE, SIG_IGN);
}
#endif

/* Puts it back to the default on the child's side, after the fork and before the exec
 * (the caution above). */
static void kspl_child_restore_signals(void) {
    signal(SIGPIPE, SIG_DFL);
}

/* Why std/io's last write was refused, kept for the check at exit (below). */
static int kspl_last_write_errno = 0;

/* In a library a failed write stays a failure: ending the process is the program's choice. */
KSPL_LINK void kspl_io_broken_pipe(void) {
    kspl_last_write_errno = errno;
#if !defined(KSPL_LIBRARY)
    /* Caution: **Do nothing for anything but EPIPE.** A write also comes out short on a full disk
     * or a removed device. Killing the process there takes away the refusal returned as a
     * value. */
    if (errno != EPIPE) return;
    signal(SIGPIPE, SIG_DFL);
    raise(SIGPIPE);
#endif
}
#else
#include <errno.h> /* the EPIPE judgement below */
static int kspl_last_write_errno = 0;
/* Windows has no SIGPIPE. A write to a closed named pipe merely returns a failure; the reason is
 * kept for the check at exit (below). */
KSPL_LINK void kspl_io_broken_pipe(void) {
    kspl_last_write_errno = errno;
}
#endif

/* ============================================================
 * Standard output that could not be written fails the exit
 *
 * A write to standard output that the OS refuses for another reason than a closed pipe (a full
 * disk, a removed device) returns no value: a `Writer` cannot report it (std/io.kspl). Left so,
 * `prog > out.txt` on a full disk exits 0 with the file empty or cut, and the caller takes the
 * cut file as whole.
 *
 * **The decision: check standard output once, at the exit.** On a normal return from `main` and on
 * `sys.exit`, this flushes standard output and asks the stream whether a write failed. If one did,
 * it writes one line to standard error and ends with 1.
 *
 * Caution: **A closed pipe stays quiet**, as "Writing when nobody is left to read it" above
 * decides: on POSIX it ends by SIGPIPE, on Windows with the program's own code.
 * Caution: **End with `_exit`, not `exit`.** This runs inside `exit` already, and C does not allow a
 * second call there. The flush is done, so nothing waits for `exit`'s own.
 * A panic or a crash does not come here: abort() and the crash handler skip atexit.
 * ============================================================ */
#include <string.h> /* strerror */
#ifdef _WIN32
#include <io.h> /* _exit */
#include <process.h>
#else
#include <unistd.h> /* _exit */
#endif

static void kspl_check_stdout_at_exit(void) {
    errno = 0;
    int flushed = fflush(stdout) == 0;
    if (flushed && !ferror(stdout)) return;
    /* A write refused earlier left its reason with kspl_io_broken_pipe; this flush has none. That
     * reason may be another stream's, which changes the words of the line, or on Windows where
     * that one was a closed pipe, keeps the line back. */
    int err = flushed ? kspl_last_write_errno : errno;
    if (err == EPIPE) {
        kspl_io_broken_pipe();
        return;
    }
    fprintf(stderr, "[Kanso] Error: standard output could not be written%s%s%s\n",
        err != 0 ? " (" : "", err != 0 ? strerror(err) : "", err != 0 ? ")" : "");
    _exit(1);
}

/* ============================================================
 * The modes std/io's open takes
 *
 * kspl_fopen_cstr (hosted_fs.c and hosted_fs_win.c) opens a file on each OS from the one answer
 * below, so a mode cannot mean one thing on POSIX and another on Windows.
 * ============================================================ */
/* What an open asks of the file for a mode, in KSPL_OPEN_* bits; -1 where std/io's open does not
 * take the mode. It takes `r`, `w` or `a`, then any of `+` and `b`, and `x` after `w` alone (C11).
 * Caution: **Refuse any other letter, on both sides**, so a mode means one thing everywhere.
 * glibc skips a letter it does not know, while Windows reads `t`, `N` and `ccs=` as its own.
 * **Both sides open by these bits**, so `r+` creates nothing and `wx` replaces nothing on either.
 * It touches no OS and is not static, so std's tests check every mode on every OS (io_test). */
#define KSPL_OPEN_READ 1
#define KSPL_OPEN_WRITE 2
#define KSPL_OPEN_CREATE 4 /* create the file where it is missing */
#define KSPL_OPEN_TRUNCATE 8 /* empty the file where it exists */
#define KSPL_OPEN_APPEND 16 /* every write goes to the end */
#define KSPL_OPEN_NEW 32 /* fail where the file exists */
KSPL_LINK I32 kspl_fopen_plan(const U8 *mode_cstr) {
    const char *mode = (const char *)mode_cstr;
    I32 plan;
    if (mode[0] == 'r') plan = KSPL_OPEN_READ;
    else if (mode[0] == 'w') plan = KSPL_OPEN_WRITE | KSPL_OPEN_CREATE | KSPL_OPEN_TRUNCATE;
    else if (mode[0] == 'a') plan = KSPL_OPEN_WRITE | KSPL_OPEN_CREATE | KSPL_OPEN_APPEND;
    else return -1;
    for (const char *p = mode + 1; *p != '\0'; p++) {
        if (*p == '+') plan |= KSPL_OPEN_READ | KSPL_OPEN_WRITE;
        else if (*p == 'x' && mode[0] == 'w') plan |= KSPL_OPEN_NEW;
        else if (*p != 'b') return -1;
    }
    return plan;
}
