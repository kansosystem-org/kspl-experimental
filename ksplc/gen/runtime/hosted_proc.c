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
#include <unistd.h>
#include <sys/wait.h>
#include <poll.h>
#include <signal.h>

/* to_w is the side writing to the child's standard input, and from_w / from_err the sides reading
 * the child's standard output / standard error.
 * Caution: **The standard error must be readable too**; it is where the partner says why it does
 * not answer. */
/* **Remember the ending number where it was reaped.** waitpid answers once only
 * (`kspl_proc_alive` reaps with WNOHANG). code is -1 until reaped is up. */
typedef struct {
    int pid; int to_w; int from_w; int from_err;
    int code; int reaped;
    int out_eof; int err_eof; /* The streams whose read returned EOF. poll skips them */
} kspl_proc_t;

I32 kspl_proc_write(I64 handle, U8 *ptr, Sz len) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w < 0) return -1; /* An attempt to write after closing */
    Sz off = 0;
    while (off < len) {
        ssize_t w = write(h->to_w, ptr + off, (size_t)(len - off));
        if (w <= 0) return -1;
        off += w;
    }
    return (I32)len;
}

/* >0: the bytes read, -1: out of time, 0: EOF (the partner died), -2: an error (a stream not
 * joined by a pipe comes here too) */
static I32 kspl_proc_read_end(int fd, U8 *buf, Sz cap, I32 timeout_ms) {
    struct pollfd pfd;
    if (fd < 0) return -2;
    pfd.fd = fd; pfd.events = POLLIN; pfd.revents = 0;
    int r = poll(&pfd, 1, timeout_ms);
    if (r == 0) return -1;
    if (r < 0) return -2;
    ssize_t nr = read(fd, buf, (size_t)cap);
    if (nr <= 0) return 0;
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

/* Closes the child's standard input to hand it an EOF.
   Caution: **Without this, "everything is handed over" cannot be told**; a filter waits for it
 * before answering. Calling it twice is harmless (-1 marks closed). */
void kspl_proc_close_stdin(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w >= 0) {
        close(h->to_w);
        h->to_w = -1;
    }
}

/* Stops and reaps it, and closes the pipes.
   Caution: **Do not send a signal to a child already reaped.** The OS may reuse the pid, and the
 * SIGKILL stops an unrelated process (kspl_proc_alive often reaps first). */
void kspl_proc_kill(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        kill(h->pid, SIGKILL);
        waitpid(h->pid, NULL, 0);
    }
    kspl_proc_free(h);
}

/* Waits until it ends and returns the number, closes the pipes and tidies up.
   Caution: **The handle cannot be used after this** (as with kspl_proc_kill). A child that died
 * by a signal is 128 + the signal number. */
I32 kspl_proc_wait(I64 handle) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        int st = 0;
        while (waitpid(h->pid, &st, 0) < 0 && errno == EINTR) {}
        h->reaped = 1;
        h->code = kspl_proc_status_code(st);
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
I32 kspl_proc_poll(I64 handle, I32 timeout_ms) {
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

Bool kspl_proc_alive(I64 handle) {
    if (handle == 0) return false;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->reaped) return false;
    int st = 0;
    pid_t r = waitpid(h->pid, &st, WNOHANG);
    if (r == 0) return true;
    /* It was reaped (or there is nobody to reap).
       Caution: **The number is remembered here** — asked next time, waitpid no longer answers. */
    h->reaped = 1;
    if (r > 0) h->code = kspl_proc_status_code(st);
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
} kspl_proc_t;

I32 kspl_proc_write(I64 handle, U8 *ptr, Sz len) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w == NULL) return -1; /* An attempt to write after closing */
    Sz off = 0;
    while (off < len) {
        DWORD wrote = 0;
        if (!WriteFile(h->to_w, ptr + off, (DWORD)(len - off), &wrote, NULL) || wrote == 0) return -1;
        off += wrote;
    }
    return (I32)len;
}

/* >0: the bytes read, -1: out of time, 0: EOF (the partner died), -2: an error
 * A Windows anonymous pipe cannot wait for readable, so it peeks and sleeps 1 ms while empty. */
static I32 kspl_proc_read_end(HANDLE pipe, U8 *buf, Sz cap, I32 timeout_ms) {
    DWORD start = GetTickCount();
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
    if (h->to_w != NULL) CloseHandle(h->to_w);
    if (h->from_w != NULL) CloseHandle(h->from_w);
    if (h->from_err != NULL) CloseHandle(h->from_err);
    free(h);
}

/* Closes the child's standard input to hand it an EOF (the same contract as the POSIX side). */
void kspl_proc_close_stdin(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->to_w != NULL) {
        CloseHandle(h->to_w);
        h->to_w = NULL;
    }
}

void kspl_proc_kill(I64 handle) {
    if (handle == 0) return;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    TerminateProcess(h->proc, 1);
    WaitForSingleObject(h->proc, INFINITE);
    kspl_proc_free(h);
}

/* The same contract as the POSIX side (wait until it ends, return the number, tidy up). */
I32 kspl_proc_wait(I64 handle) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) {
        DWORD st = 0;
        WaitForSingleObject(h->proc, INFINITE);
        h->reaped = 1;
        h->code = GetExitCodeProcess(h->proc, &st) ? (int)st : -1;
    }
    I32 code = (I32)h->code;
    kspl_proc_free(h);
    return code;
}

/* The same contract as the POSIX side.
   Caution: It peeks and sleeps as kspl_proc_read_end does. A stream whose peek failed has its
 * bit raised as closed (a read then returns 0 = EOF). */
I32 kspl_proc_poll(I64 handle, I32 timeout_ms) {
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

Bool kspl_proc_alive(I64 handle) {
    if (handle == 0) return false;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (h->reaped) return false;
    if (WaitForSingleObject(h->proc, 0) == WAIT_TIMEOUT) return true;
    /* **The number is remembered here** (as on the POSIX side). */

    DWORD st = 0;
    h->reaped = 1;
    h->code = GetExitCodeProcess(h->proc, &st) ? (int)st : -1;
    return false;
}
#endif

/* The rest is one text for both: the fields it touches have one name on each side. */

I32 kspl_proc_read(I64 handle, U8 *buf, Sz cap, I32 timeout_ms) {
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    I32 n = kspl_proc_read_end(h->from_w, buf, cap, timeout_ms);
    if (n == 0) h->out_eof = 1;
    return n;
}

I32 kspl_proc_read_err(I64 handle, U8 *buf, Sz cap, I32 timeout_ms) {
    if (handle == 0) return -2;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    I32 n = kspl_proc_read_end(h->from_err, buf, cap, timeout_ms);
    if (n == 0) h->err_eof = 1;
    return n;
}

/* The ending number.
   Caution: **It is -1 while it has not ended** (0 means "it ended normally"). */
I32 kspl_proc_exit_code(I64 handle) {
    if (handle == 0) return -1;
    kspl_proc_t *h = (kspl_proc_t *)(intptr_t)handle;
    if (!h->reaped) (void)kspl_proc_alive(handle);
    return h->reaped ? (I32)h->code : -1;
}

