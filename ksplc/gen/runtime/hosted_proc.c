/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * Going back and forth with a child process joined by pipes (for std/sys.kspls's Piped_child).
 * Whether the partner crashes or hangs, this side survives.
 *
 * Caution: **A read always has a timeout**, returned as a value (-1). Do not add one without —
 * the caller could no longer see why it stopped ("Three ways to start a child process, split by
 * where its output goes" in std/docs/DESIGN.md).
 * What starts one is kspl_proc_start in hosted_spawn.c (the tool assembling argv is there).
 * ============================================================ */
#ifndef _WIN32
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/wait.h>
#include <poll.h>
#include <pthread.h>
#include <signal.h>

/* to_w is the side writing to the child's standard input, and from_w / from_err the sides reading
 * the child's standard output / standard error.
 * Caution: **The standard error must be readable too**; it is where the partner says why it does
 * not answer. */
/* **Remember the ending number where it was reaped.** waitpid answers once only
 * (`kspl_proc_alive` reaps with WNOHANG). code means nothing until reaped is up. */
typedef struct {
    int pid; int to_w; int from_w; int from_err;
    int code; int reaped;
    int out_eof; int err_eof; /* The streams whose read returned EOF. poll skips them */
    int group; /* 1 where the child leads a process group of its own (kspl_proc_start's 16) */
} kspl_proc_t;

/* ============================================================
 * The groups a terminal's signals are passed on to.
 * A child leading a group of its own is out of the terminal's foreground group, so the terminal's
 * SIGINT, SIGQUIT and SIGHUP no longer reach it, and a starter they end would leave it running
 * with nobody to stop it at its time limit. So while such a child runs, those and SIGTERM are
 * passed on to every group held here, and the starter then ends by the signal as by default.
 * Caution: **Take a signal only where it is at its default** (kspl_take_default_signal): a program
 * that ignores or handles one has chosen. The blocks are never freed: the handler walks unlocked.
 * ============================================================ */
#define KSPL_GROUP_BLOCK 64
typedef struct kspl_group_block {
    volatile sig_atomic_t pid[KSPL_GROUP_BLOCK]; /* a group's number (its leader's pid), or 0 */
    struct kspl_group_block *volatile next;
} kspl_group_block;
static kspl_group_block *volatile kspl_groups = NULL;
static pthread_mutex_t kspl_group_lock = PTHREAD_MUTEX_INITIALIZER;
static const int kspl_group_signals[4] = {SIGINT, SIGQUIT, SIGHUP, SIGTERM};

static void kspl_group_pass_on(int sig) {
    for (kspl_group_block *b = kspl_groups; b != NULL; b = b->next) {
        for (int i = 0; i < KSPL_GROUP_BLOCK; i++) {
            pid_t g = (pid_t)b->pid[i];
            if (g > 0) kill(-g, sig);
        }
    }
    /* Still blocked inside the handler, the signal is taken at its default once this returns. */
    signal(sig, SIG_DFL);
    raise(sig);
}

/* Puts `to` in the first slot holding `from`: a hold is 0 → pid, a release pid → 0. Where a hold
 * finds every block full, a new block goes on the end, filled before it is linked, as the handler
 * may walk it at any moment. Returns 0 where no block could be had. */
static int kspl_group_swap(pid_t from, pid_t to) {
    static int taken = 0;
    kspl_group_block *b, *last = NULL;
    int done = 0;
    pthread_mutex_lock(&kspl_group_lock);
    if (to != 0 && !taken) {
        for (int k = 0; k < 4; k++) {
            kspl_take_default_signal(kspl_group_signals[k], kspl_group_pass_on);
        }
        taken = 1;
    }
    for (b = kspl_groups; b != NULL && !done; b = b->next) {
        for (int i = 0; i < KSPL_GROUP_BLOCK && !done; i++) {
            if ((pid_t)b->pid[i] == from) {
                b->pid[i] = (sig_atomic_t)to;
                done = 1;
            }
        }
        last = b;
    }
    if (!done && to != 0 && (b = (kspl_group_block *)calloc(1, sizeof(kspl_group_block))) != NULL) {
        b->pid[0] = (sig_atomic_t)to;
        if (last != NULL) last->next = b;
        else kspl_groups = b;
        done = 1;
    }
    pthread_mutex_unlock(&kspl_group_lock);
    return done || to == 0;
}

/* Writes all len bytes to the child's standard input: 0 when all of it went, -1 when no byte went
 * for timeout_ms in a row (what went by then stays written), -2 when the child closed its standard
 * input or ended.
 * **The limit is idle time, not the whole write**: each byte that goes moves the deadline on, so a
 * large input to a child that reads steadily but slowly is not cut off part way, while a child
 * that stops reading is still given up on.
 * Caution: **Never block on the write itself.** A child that stops reading fills the pipe, and a
 * blocking write would outlast every timeout, so the end is non-blocking and waited on by poll. */
KSPL_LINK I32 kspl_proc_send(I64 handle, const U8 *ptr, Sz len, I32 timeout_ms) {
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w < 0) return -2; /* An attempt to write after closing */
    int fl = fcntl(h->to_w, F_GETFL);
    if (fl < 0 || ((fl & O_NONBLOCK) == 0 && fcntl(h->to_w, F_SETFL, fl | O_NONBLOCK) != 0)) {
        return -2;
    }
    I64 deadline = kspl_mono_us() + (I64)timeout_ms * 1000;
    Sz off = 0;
    while (off < len) {
        ssize_t w = write(h->to_w, ptr + off, (size_t)(len - off));
        if (w > 0) {
            off += w;
            deadline = kspl_mono_us() + (I64)timeout_ms * 1000;
            continue;
        }
        if (w < 0 && errno == EINTR) continue;
        if (w < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
            I64 left = deadline - kspl_mono_us();
            struct pollfd pfd;
            if (left <= 0) return -1;
            pfd.fd = h->to_w; pfd.events = POLLOUT; pfd.revents = 0;
            if (poll(&pfd, 1, (int)((left + 999) / 1000)) < 0 && errno != EINTR) return -2;
            continue;
        }
        return -2;
    }
    return 0;
}

/* >0: the bytes read, -1: out of time, 0: EOF (the partner died), -2: an error (a stream not
 * joined by a pipe comes here too) */
static I32 kspl_proc_read_end(int fd, U8 *buf, Sz cap, I32 timeout_ms) {
    struct pollfd pfd;
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (fd < 0) return -2;
    pfd.fd = fd; pfd.events = POLLIN; pfd.revents = 0;
    int r = poll(&pfd, 1, timeout_ms);
    if (r == 0) return -1;
    if (r < 0) return -2;
    ssize_t nr;
    do {
        nr = read(fd, buf, (size_t)cap);
    } while (nr < 0 && errno == EINTR);
    /* **A failed read is not EOF**: read as 0, it would say the partner died while it lives. */
    if (nr < 0) return -2;
    return (I32)nr;
}

/* Closes the pipe ends still open and frees the handle. */
static void kspl_proc_free(kspl_proc_t *h) {
    if (h->to_w >= 0) close(h->to_w);
    if (h->from_w >= 0) close(h->from_w);
    if (h->from_err >= 0) close(h->from_err);
    free(h);
}

/* The ending number of a reaped child: its exit code, or 128 + the signal number (as in the
 * shell). */
static int kspl_proc_status_code(int st) {
    if (WIFEXITED(st)) return WEXITSTATUS(st);
    if (WIFSIGNALED(st)) return 128 + WTERMSIG(st);
    return -1;
}

/* Marks it reaped, with the number where `st` holds one (`got`), and lets its group go from the
 * signals passed on. */
static void kspl_proc_reaped(kspl_proc_t *h, int st, int got) {
    h->reaped = 1;
    if (got) h->code = kspl_proc_status_code(st);
    if (h->group) (void)kspl_group_swap((pid_t)h->pid, 0);
}

/* Closes the child's standard input to hand it an EOF.
   Caution: **Without this, "everything is handed over" cannot be told**; a filter waits for it
 * before answering. Calling it twice is harmless (-1 marks closed). */
KSPL_LINK void kspl_proc_close_stdin(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w >= 0) {
        close(h->to_w);
        h->to_w = -1;
    }
}

/* Stops and reaps it, and closes the pipes. A child leading a group of its own is stopped with
 * its whole group: what it started goes with it.
   Caution: **Do not send a signal to a child already reaped.** The OS may reuse the pid, and the
 * SIGKILL stops an unrelated process (kspl_proc_alive often reaps first). Until it is reaped, its
 * pid, and so its group's number, is still its own. */
KSPL_LINK void kspl_proc_kill(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        int st = 0;
        kill(h->group ? -h->pid : h->pid, SIGKILL);
        while (waitpid(h->pid, &st, 0) < 0 && errno == EINTR) {}
        kspl_proc_reaped(h, st, 1);
    }
    kspl_proc_free(h);
}

/* Waits until it ends and returns the number, closes the pipes and tidies up.
   Caution: **The handle cannot be used after this** (as with kspl_proc_kill). A child that died
 * by a signal is 128 + the signal number. */
KSPL_LINK I32 kspl_proc_wait(I64 handle) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        int st = 0;
        while (waitpid(h->pid, &st, 0) < 0 && errno == EINTR) {}
        kspl_proc_reaped(h, st, 1);
    }
    I32 code = (I32)h->code;
    kspl_proc_free(h);
    return code;
}

/* Waits until either the standard output's or the standard error's pipe is readable (or closed).
 * Returns the sum of the bits (2 = stdout, 4 = stderr, as kspl_proc_start's stdio), 0 on timeout,
 * -1 where no stream is piped or all read EOF.
 * Caution: **Look at the two in one go.** One at a time, the other waits out the silent one's
 * timeout too (run_capture in std/subproc.kspls gathers everything). */
KSPL_LINK I32 kspl_proc_poll(I64 handle, I32 timeout_ms) {
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    struct pollfd pfds[2];
    int n = 0, out_idx = -1, err_idx = -1;
    if (h->from_w >= 0 && !h->out_eof) { out_idx = n; pfds[n].fd = h->from_w; pfds[n].events = POLLIN; pfds[n].revents = 0; n++; }
    if (h->from_err >= 0 && !h->err_eof) { err_idx = n; pfds[n].fd = h->from_err; pfds[n].events = POLLIN; pfds[n].revents = 0; n++; }
    if (n == 0) return -1;
    int r = poll(pfds, (nfds_t)n, timeout_ms);
    if (r == 0) return 0;
    if (r < 0) return errno == EINTR ? 0 : -1; /* EINTR is treated as out of time */
    I32 mask = 0;
    if (out_idx >= 0 && (pfds[out_idx].revents & (POLLIN | POLLHUP | POLLERR))) mask |= 2;
    if (err_idx >= 0 && (pfds[err_idx].revents & (POLLIN | POLLHUP | POLLERR))) mask |= 4;
    return mask;
}

KSPL_LINK Bool kspl_proc_alive(I64 handle) {
    if (handle == 0) return false;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->reaped) return false;
    int st = 0;
    pid_t r = waitpid(h->pid, &st, WNOHANG);
    if (r == 0) return true;
    /* It was reaped (or there is nobody to reap).
       Caution: **The number is remembered here** — asked next time, waitpid no longer answers. */
    kspl_proc_reaped(h, st, r > 0);
    return false;
}
#else
/* The Windows implementation (CreateProcess + pipes). */
#include <windows.h>

/* Caution: **Make it the same shape as the POSIX side**, or the number differs per environment. */
typedef struct {
    HANDLE proc; HANDLE to_w; HANDLE from_w; HANDLE from_err;
    int code; int reaped;
    int out_eof; int err_eof;
    HANDLE job; /* the job object the child and what it starts are in, or NULL (the POSIX group) */
} kspl_proc_t;

/* The same contract as the POSIX side, the idle limit included. The end is put in PIPE_NOWAIT, so a
 * write takes what the pipe has room for and returns at once; it is looked at again after a pause
 * until timeout_ms pass with nothing taken.
 * **A step is 4096 bytes at most**, the size CreatePipe gives a pipe: a write wider than the room
 * may take nothing at all, and could then never go. */
KSPL_LINK I32 kspl_proc_send(I64 handle, const U8 *ptr, Sz len, I32 timeout_ms) {
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w == NULL) return -2; /* An attempt to write after closing */
    DWORD mode = PIPE_READMODE_BYTE | PIPE_NOWAIT;
    if (!SetNamedPipeHandleState(h->to_w, &mode, NULL, NULL)) return -2;
    ULONGLONG start = GetTickCount64();
    Sz off = 0;
    while (off < len) {
        DWORD want = (len - off > 4096) ? 4096 : (DWORD)(len - off);
        DWORD wrote = 0;
        if (!WriteFile(h->to_w, ptr + off, want, &wrote, NULL)) return -2;
        if (wrote > 0) {
            off += wrote;
            start = GetTickCount64();
            continue;
        }
        if (GetTickCount64() - start >= (ULONGLONG)timeout_ms) return -1;
        Sleep(1);
    }
    return 0;
}

/* >0: the bytes read, -1: out of time, 0: EOF (the partner died), -2: an error
 * A Windows anonymous pipe cannot wait for readable, so it peeks and sleeps 1 ms while empty. */
static I32 kspl_proc_read_end(HANDLE pipe, U8 *buf, Sz cap, I32 timeout_ms) {
    DWORD start = GetTickCount();
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (pipe == NULL) return -2; /* A stream not joined by a pipe */
    for (;;) {
        DWORD avail = 0;
        if (!PeekNamedPipe(pipe, NULL, 0, NULL, &avail, NULL)) return 0; /* disconnected = dead */
        if (avail > 0) {
            DWORD got = 0;
            DWORD want = ((DWORD)cap < avail) ? (DWORD)cap : avail;
            if (!ReadFile(pipe, buf, want, &got, NULL) || got == 0) return 0;
            return (I32)got;
        }
        if ((DWORD)(GetTickCount() - start) >= (DWORD)timeout_ms) return -1;
        Sleep(1);
    }
}

/* Closes the process handle and the pipe ends still open, and frees the handle. */
static void kspl_proc_free(kspl_proc_t *h) {
    CloseHandle(h->proc);
    if (h->job != NULL) CloseHandle(h->job); /* no kill on close: what is left runs on, as on POSIX */
    if (h->to_w != NULL) CloseHandle(h->to_w);
    if (h->from_w != NULL) CloseHandle(h->from_w);
    if (h->from_err != NULL) CloseHandle(h->from_err);
    free(h);
}

/* Closes the child's standard input to hand it an EOF (the same contract as the POSIX side). */
KSPL_LINK void kspl_proc_close_stdin(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w != NULL) {
        CloseHandle(h->to_w);
        h->to_w = NULL;
    }
}

/* The same contract as the POSIX side: a child in a job is stopped with the whole job, and one
 * already seen to end is only tidied, as the POSIX side can no longer name its group. */
KSPL_LINK void kspl_proc_kill(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        if (h->job != NULL) TerminateJobObject(h->job, 1);
        else TerminateProcess(h->proc, 1);
        WaitForSingleObject(h->proc, INFINITE);
    }
    kspl_proc_free(h);
}

/* The ending number of an ended child, in the POSIX side's terms: a crash Windows reports as an
 * NTSTATUS is 128 + the signal POSIX raises for the same fault, and any other code is its own.
 * Caution: **Keep one case per line, each NTSTATUS named, and the code a literal**: make
 * test-conventions compares this table with the one in "A child's end is one code on every OS" in
 * std/docs/DESIGN.md, where the reasons are. Exit code 3 is not here, as an exit(3) gives it too. */
static int kspl_proc_status_code(DWORD st) {
    switch (st) {
    case 0xC0000005u: /* STATUS_ACCESS_VIOLATION */
    case 0xC00000FDu: /* STATUS_STACK_OVERFLOW */
        return 139; /* SIGSEGV */
    case 0xC000001Du: /* STATUS_ILLEGAL_INSTRUCTION */
        return 132; /* SIGILL */
    case 0xC000008Du: /* STATUS_FLOAT_DENORMAL_OPERAND */
    case 0xC000008Eu: /* STATUS_FLOAT_DIVIDE_BY_ZERO */
    case 0xC000008Fu: /* STATUS_FLOAT_INEXACT_RESULT */
    case 0xC0000090u: /* STATUS_FLOAT_INVALID_OPERATION */
    case 0xC0000091u: /* STATUS_FLOAT_OVERFLOW */
    case 0xC0000092u: /* STATUS_FLOAT_STACK_CHECK */
    case 0xC0000093u: /* STATUS_FLOAT_UNDERFLOW */
    case 0xC0000094u: /* STATUS_INTEGER_DIVIDE_BY_ZERO */
    case 0xC0000095u: /* STATUS_INTEGER_OVERFLOW */
        return 136; /* SIGFPE */
    case 0xC0000409u: /* STATUS_STACK_BUFFER_OVERRUN */
        return 134; /* SIGABRT */
    case 0xC000013Au: /* STATUS_CONTROL_C_EXIT */
        return 130; /* SIGINT */
    case 0xC0000135u: /* STATUS_DLL_NOT_FOUND */
        return 127; /* the loader's exit code */
    default:
        return (int)st;
    }
}

/* The same contract as the POSIX side (wait until it ends, return the number, tidy up). */
KSPL_LINK I32 kspl_proc_wait(I64 handle) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        DWORD st = 0;
        WaitForSingleObject(h->proc, INFINITE);
        h->reaped = 1;
        h->code = GetExitCodeProcess(h->proc, &st) ? kspl_proc_status_code(st) : -1;
    }
    I32 code = (I32)h->code;
    kspl_proc_free(h);
    return code;
}

/* The same contract as the POSIX side.
   Caution: It peeks and sleeps as kspl_proc_read_end does. A stream whose peek failed has its
 * bit raised as closed (a read then returns 0 = EOF). */
KSPL_LINK I32 kspl_proc_poll(I64 handle, I32 timeout_ms) {
    timeout_ms = kspl_wait_ms(timeout_ms);
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    int watch_out = h->from_w != NULL && !h->out_eof;
    int watch_err = h->from_err != NULL && !h->err_eof;
    if (!watch_out && !watch_err) return -1;
    DWORD start = GetTickCount();
    for (;;) {
        I32 mask = 0;
        DWORD avail = 0;
        if (watch_out && (!PeekNamedPipe(h->from_w, NULL, 0, NULL, &avail, NULL) || avail > 0)) mask |= 2;
        avail = 0;
        if (watch_err && (!PeekNamedPipe(h->from_err, NULL, 0, NULL, &avail, NULL) || avail > 0)) mask |= 4;
        if (mask != 0) return mask;
        if ((DWORD)(GetTickCount() - start) >= (DWORD)timeout_ms) return 0;
        Sleep(1);
    }
}

KSPL_LINK Bool kspl_proc_alive(I64 handle) {
    if (handle == 0) return false;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->reaped) return false;
    if (WaitForSingleObject(h->proc, 0) == WAIT_TIMEOUT) return true;
    /* **The number is remembered here** (as on the POSIX side). */

    DWORD st = 0;
    h->reaped = 1;
    h->code = GetExitCodeProcess(h->proc, &st) ? kspl_proc_status_code(st) : -1;
    return false;
}
#endif

/* The rest is one text for both: the fields it touches have one name on each side. */

KSPL_LINK I32 kspl_proc_read(I64 handle, U8 *buf, Sz cap, I32 timeout_ms) {
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    I32 n = kspl_proc_read_end(h->from_w, buf, cap, timeout_ms);
    if (n == 0) h->out_eof = 1;
    return n;
}

KSPL_LINK I32 kspl_proc_read_err(I64 handle, U8 *buf, Sz cap, I32 timeout_ms) {
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    I32 n = kspl_proc_read_end(h->from_err, buf, cap, timeout_ms);
    if (n == 0) h->err_eof = 1;
    return n;
}

/* Whether it has ended, with the ending number in *code where it has.
   Caution: **Do not fold the two into one number.** Every I32 is some child's exit code (Windows's
 * exit(-1) is -1), so a value set aside for "still running" would also be one child's ending. */
KSPL_LINK Bool kspl_proc_ended(I64 handle, I32 *code) {
    if (handle == 0) return false;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) (void)kspl_proc_alive(handle);
    if (h->reaped) *code = (I32)h->code;
    return h->reaped != 0;
}
