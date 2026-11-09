/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
/* ============================================================
 * Starting a child process (for std/subproc.kspl).
 *
 * **The one function that starts one is kspl_proc_start.** Gathering, lining up, keeping it
 * running and talking back and forth differ only in where the three standard streams go (inherit
 * / a pipe / a file). So C holds one entry taking those as arguments, plus the tools that turn
 * argv into the OS's shape. Waiting, reading and stopping are hosted_proc.c. The rendezvous is
 * assembled on the KSPL side.
 * ============================================================ */
/* Why the last start on this thread failed: the OS's error number (errno on POSIX, GetLastError on
 * Windows), or -1 where none was given. 0 after a start that succeeded. std/subproc.kspl reads it
 * after a start returned 0, so a tool can say why (kspl_proc_start_error). */
static KSPL_PER_THREAD I32 kspl_start_error = 0;
KSPL_LINK I32 kspl_proc_start_error(void) { return kspl_start_error; }

/* ============================================================
 * The Windows command line. It touches no OS, so it is built on every OS, and a test on Linux
 * reaches it through kspl_win_line_for.
 * ============================================================ */
/* A Windows command line is one string joined by spaces, each argument wrapped in "". Microsoft's
 * parser treats a backslash specially only right before a ", so that run of backslashes is doubled.
 * Otherwise a path ending in \ swallows the closing quote, and the following arguments merge (an
 * argument injection).
 * Caution: Every place calling CreateProcess must come through this function. A copied rule
 * brings the injection back the day only one copy is fixed.
 * **Confirm that the number of steps agrees with argc exactly** (the check on off at the
 * end). The reason is at the POSIX side's kspl_argv_split. */
static Bool kspl_win_build_cmdline(const U8 *argv_buf, Sz argv_buf_len, I32 argc, char *cmd,
    int cmd_cap) {
    if (argc <= 0) return false;
    int limit = cmd_cap - 192; /* one argument's margin. At the limit it fails, not cuts */
    int m = 0;
    Sz off = 0;
    for (I32 i = 0; i < argc; i++) {
        if (off > argv_buf_len || m >= limit) return false;
        const char *arg = (const char *)(argv_buf + off);
        Sz start = off;
        while (off < argv_buf_len && argv_buf[off] != '\0') off++;
        if (off >= argv_buf_len) return false;
        Sz alen = off - start;
        off++;
        if (i > 0) cmd[m++] = ' ';
        cmd[m++] = '"';
        Sz j = 0;
        while (j < alen) {
            if (m >= limit) return false;
            int nbs = 0;
            /* the run is bounded here: counted past the limit, nbs * 2 would wrap and pass */
            while (j < alen && arg[j] == '\\') {
                j++;
                if (++nbs >= limit) return false;
            }
            if (j == alen) {
                /* a trailing run of backslashes: doubled, the closing quote going right after */
                if (m + nbs * 2 >= limit) return false;
                for (int k = 0; k < nbs * 2; k++) cmd[m++] = '\\';
                break;
            } else if (arg[j] == '"') {
                /* doubles the backslashes right before, and escapes the " itself as well */
                if (m + nbs * 2 + 2 >= limit) return false;
                for (int k = 0; k < nbs * 2 + 1; k++) cmd[m++] = '\\';
                cmd[m++] = arg[j];
                j++;
            } else {
                if (m + nbs + 1 >= limit) return false;
                for (int k = 0; k < nbs; k++) cmd[m++] = '\\';
                cmd[m++] = arg[j];
                j++;
            }
        }
        cmd[m++] = '"';
    }
    if (off != argv_buf_len) return false; /* too many steps = one of the arguments holds a NUL */
    cmd[m] = '\0';
    return true;
}

/* Whether a program is a batch file, which CreateProcess hands to cmd.exe. Trailing dots and
 * spaces are dropped first, as opening a file drops them. */
static Bool kspl_win_is_batch(const char *prog) {
    size_t n = strlen(prog);
    char ext[3];
    while (n > 0 && (prog[n - 1] == '.' || prog[n - 1] == ' ')) n--;
    if (n < 4 || prog[n - 4] != '.') return false;
    for (int k = 0; k < 3; k++) {
        char c = prog[n - 3 + k];
        ext[k] = c >= 'A' && c <= 'Z' ? (char)(c - 'A' + 'a') : c;
    }
    return memcmp(ext, "bat", 3) == 0 || memcmp(ext, "cmd", 3) == 0;
}

/* Whether an argument run can be handed to cmd.exe as it is.
 * Caution: **Refuse, do not escape.** cmd.exe parses the line again by its own rules, which know
 * nothing of kspl_win_build_cmdline's `\"`. A `"` in an argument closes the quoting, and what
 * follows (`& del ...`) runs as a command of its own. `%` and `!` expand even inside quotes, and a
 * line break ends the command. With those refused, every argument stays inside its own quotes,
 * where cmd.exe takes `&|<>^()` as they are. */
static Bool kspl_win_batch_safe(const U8 *argv_buf, Sz argv_buf_len) {
    for (Sz i = 0; i < argv_buf_len; i++) {
        U8 c = argv_buf[i];
        if (c == '"' || c == '%' || c == '!' || c == '\r' || c == '\n') return false;
    }
    return true;
}

/* The command line that starts argv on Windows, written into cmd with a NUL at its end. argv is
 * an argument run as kspl_proc_start takes it, argv[0] already the program's full path. False
 * where an argument holds a NUL, the line passes cmd_cap, or kspl_win_batch_safe refuses what a
 * batch file is handed. std/tests/subproc_test.kspl checks its answers on every OS.
 * A batch file's argument keeps the backslashes doubled before its closing quote. A batch file
 * mostly hands `%1` or `%*` on to a program, which reads them so. */
KSPL_LINK Bool kspl_win_line_for(const U8 *argv_buf, Sz argv_buf_len, I32 argc, U8 *cmd,
    I32 cmd_cap) {
    if (argv_buf_len <= 0 || memchr(argv_buf, '\0', (size_t)argv_buf_len) == NULL) return false;
    if (kspl_win_is_batch((const char *)argv_buf) && !kspl_win_batch_safe(argv_buf, argv_buf_len)) {
        return false;
    }
    return kspl_win_build_cmdline(argv_buf, argv_buf_len, argc, (char *)cmd, (int)cmd_cap);
}

#ifndef _WIN32
#include <fcntl.h> /* open / O_*. No include after this section is leaned on */
#include <pthread.h>

/* Splits argv_buf (an argument run separated by NULs) into an argv array for execv, on the heap
 * with a NULL at the end; the caller frees it. NULL where it cannot be split.
 * Caution: **Size the array by argc, with no fixed cap.** The OS's own limit (ARG_MAX) is the
 * only one: exec refuses a run past it, and the start fails as any failed exec does.
 * Caution: **Confirm that the number of steps agrees with argc exactly.** A KSPL string can hold a
 * NUL, which here is the separator. One argument splits in two, and an argument the caller never
 * wrote is inserted. Only the end position against argv_buf_len tells it. In the assembled
 * buffer, a separating NUL and a content NUL look the same. */
static char **kspl_argv_split(const U8 *argv_buf, Sz argv_buf_len, I32 argc) {
    if (argc <= 0) return NULL;
    char **out = (char **)malloc(((size_t)argc + 1) * sizeof(char *));
    if (out == NULL) return NULL;
    Sz off = 0;
    Bool whole = true;
    for (I32 i = 0; i < argc && whole; i++) {
        out[i] = (char *)(argv_buf + off);
        while (off < argv_buf_len && argv_buf[off] != '\0') off++;
        whole = off < argv_buf_len; /* no terminating \0 = invalid input */
        off++;
    }
    /* too many steps = one of the arguments holds a NUL */
    if (!whole || off != argv_buf_len) {
        free(out);
        return NULL;
    }
    out[argc] = NULL;
    return out;
}

/* Closes the pipes.
   Caution: **Do not write it per failure route.** Eight fds listed by hand lose one whenever a
 * route is added, and the only symptom is "after a while it stops opening". */
static void kspl_close_pipe_pair(int *p) {
    if (p[0] >= 0) close(p[0]);
    if (p[1] >= 0) close(p[1]);
    p[0] = -1;
    p[1] = -1;
}

/* Opens a pipe whose two ends no child inherits (hosted.c's "Nothing the runtime opens passes to
 * a child unasked"). The child's own 0/1/2 come from dup2, which carries no mark. */
static int kspl_pipe_cloexec(int *p) {
#if KSPL_CLOEXEC_IN_CALL
    return pipe2(p, O_CLOEXEC);
#else
    if (pipe(p) != 0) return -1;
    kspl_fd_cloexec(p[0]);
    kspl_fd_cloexec(p[1]);
    return 0;
#endif
}

/* Where a pipe is marked only after it is opened, a start on another thread forking in between
 * would hand that child the ends. Our reader would then see EOF only when the unrelated child
 * ends. So there the starts take turns, from the first pipe to the fork. */
#if KSPL_CLOEXEC_IN_CALL
#define kspl_spawn_take() ((void)0)
#define kspl_spawn_give() ((void)0)
#else
static pthread_mutex_t kspl_spawn_lock = PTHREAD_MUTEX_INITIALIZER;
#define kspl_spawn_take() pthread_mutex_lock(&kspl_spawn_lock)
#define kspl_spawn_give() pthread_mutex_unlock(&kspl_spawn_lock)
#endif

/* Ends a forked child that could not reach its exec. It tells the parent by a byte on `done` (the
 * write end of kspl_proc_start's exec_p). Only async-signal-safe calls, as after any fork. */
static void kspl_child_fail(int done) {
    /* The byte is the failing call's errno, which the parent keeps (kspl_start_error). */
    char why = (char)((errno > 0 && errno < 256) ? errno : 1);
    while (write(done, &why, 1) < 0 && errno == EINTR) {}
    _exit(127);
}

/* Starts one child (the one function; the section heading says why). The KSPL side
 * (std/subproc.kspl) holds the combinations.
 *   stdio … bits: 1/2/4 = pipe stdin/stdout/stderr, 8 = no console window (Windows alone),
 *     16 = the child leads a process group of its own (a job object on Windows). With 16, a kill
 *     stops what it started too (hosted_proc.c's "The groups a terminal's signals are passed on
 *     to").
 *   out_len / err_len > 0 … that stream to that file (created truncated); else it inherits.
 * Returns hosted_proc.c's handle (0 = failure); a stream with no pipe has end -1 (I/O returns -2).
 * Caution: **Do not specify both a file and a pipe for the same stream** (the file wins).
 * **The same path handed twice is opened once.** Two opens keep separate positions and overwrite
 * each other quietly (and on Windows the second is a sharing violation). Opening happens after
 * the fork, so the parent spends no fd on it.
 * **It returns once the child has exec'd.** Until then the forked copy still holds every fd of
 * the parent, so a listener closed right after the start could not be bound again. A child that
 * fails before its exec (no such program, a working directory or file it cannot open) is reaped.
 * The start then returns 0, as Windows's CreateProcessW fails for the same causes. */
KSPL_LINK I64 kspl_proc_start(const U8 *argv_buf, Sz argv_buf_len, I32 argc, const U8 *cwd_ptr, Sz cwd_len,
        I32 stdio, const U8 *out_ptr, Sz out_len, const U8 *err_ptr, Sz err_len) {
    kspl_start_error = 0;
    char cwd_path[4096], out_path[4096], err_path[4096];
    if (cwd_len > 0 && !kspl_to_cstr(cwd_ptr, cwd_len, cwd_path, sizeof(cwd_path))) return 0;
    if (out_len > 0 && !kspl_to_cstr(out_ptr, out_len, out_path, sizeof(out_path))) return 0;
    if (err_len > 0 && !kspl_to_cstr(err_ptr, err_len, err_path, sizeof(err_path))) return 0;
    /* Freed in the parent once the fork is past; the child's copy goes with its exec. */
    char **argv_arr = kspl_argv_split(argv_buf, argv_buf_len, argc);
    if (argv_arr == NULL) return 0;
    int one_file = (out_len > 0 && out_len == err_len && memcmp(out_ptr, err_ptr, (size_t)out_len) == 0);
    int pipe_in = (stdio & 1) != 0;
    int pipe_out = (stdio & 2) != 0 && out_len == 0;
    int pipe_err = (stdio & 4) != 0 && err_len == 0;
    int group = (stdio & 16) != 0;

    kspl_proc_t *h = (kspl_proc_t *)malloc(sizeof(kspl_proc_t));
    if (h == NULL) {
        free(argv_arr);
        return 0;
    }
    int in_p[2] = {-1, -1}, out_p[2] = {-1, -1}, err_p[2] = {-1, -1}, exec_p[2] = {-1, -1};
    kspl_spawn_take();
    if ((pipe_in && kspl_pipe_cloexec(in_p) != 0) || (pipe_out && kspl_pipe_cloexec(out_p) != 0) ||
        (pipe_err && kspl_pipe_cloexec(err_p) != 0) || kspl_pipe_cloexec(exec_p) != 0) {
        kspl_spawn_give();
        goto fail;
    }
    fflush(stdout);
    fflush(stderr);
    pid_t pid = fork();
    if (pid == 0) {
        int done = exec_p[1];
        kspl_child_restore_signals();
        if (group && setpgid(0, 0) != 0) kspl_child_fail(done);
        if (pipe_in && dup2(in_p[0], 0) < 0) kspl_child_fail(done);
        if (pipe_out && dup2(out_p[1], 1) < 0) kspl_child_fail(done);
        if (pipe_err && dup2(err_p[1], 2) < 0) kspl_child_fail(done);
        if (out_len > 0 || err_len > 0) {
            int ofd = -1, efd = -1;
            if (out_len > 0) {
                ofd = open(out_path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (ofd < 0 || dup2(ofd, 1) < 0) kspl_child_fail(done);
            }
            if (err_len > 0) {
                efd = one_file ? ofd : open(err_path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (efd < 0 || dup2(efd, 2) < 0) kspl_child_fail(done);
            }
            if (ofd > 2) close(ofd);
            if (!one_file && efd > 2) close(efd);
        }
        if (cwd_len > 0 && chdir(cwd_path) != 0) kspl_child_fail(done);
        /* Caution: **A path with a `/` goes to execv, not execvp.** Where the file is not a
         * program the OS can start (ENOEXEC), execvp hands it to /bin/sh. A damaged or empty file
         * would then run as a shell script, or as nothing with exit 0. execv refuses it, and the
         * start fails. Only a bare name is searched for in PATH, as a shell does. */
        if (strchr(argv_arr[0], '/') != NULL) execv(argv_arr[0], argv_arr);
        else execvp(argv_arr[0], argv_arr);
        kspl_child_fail(done);
    }
    kspl_spawn_give();
    free(argv_arr);
    argv_arr = NULL;
    if (pid < 0) goto fail;
    /* exec_p's write end closes when the child execs; a byte on it says the child failed first. */
    close(exec_p[1]);
    exec_p[1] = -1;
    {
        char why;
        ssize_t got;
        /* Held from here, so a signal passed on reaches it from its exec on. */
        int held = !group || kspl_group_swap(0, pid);
        while ((got = read(exec_p[0], &why, 1)) < 0 && errno == EINTR) {}
        if (got > 0 || !held) {
            kspl_start_error = got > 0 ? (I32)(unsigned char)why : -1;
            if (got <= 0) kill(-pid, SIGKILL);
            while (waitpid(pid, NULL, 0) < 0 && errno == EINTR) {}
            if (group && held) (void)kspl_group_swap(pid, 0);
            goto fail;
        }
    }
    kspl_close_pipe_pair(exec_p);
    /* The child's ends are closed in the parent (left open, our read does not reach EOF even
     * after the partner ends). */
    if (in_p[0] >= 0) close(in_p[0]);
    if (out_p[1] >= 0) close(out_p[1]);
    if (err_p[1] >= 0) close(err_p[1]);
    h->pid = pid; h->to_w = in_p[1]; h->from_w = out_p[0]; h->from_err = err_p[0];
    h->code = -1; h->reaped = 0; h->out_eof = 0; h->err_eof = 0; h->group = group;
    return (I64)(intptr_t)h;
fail:
    if (kspl_start_error == 0) kspl_start_error = errno > 0 ? (I32)errno : -1;
    kspl_close_pipe_pair(in_p); kspl_close_pipe_pair(out_p); kspl_close_pipe_pair(err_p);
    kspl_close_pipe_pair(exec_p);
    free(argv_arr);
    free(h);
    return 0;
}

#endif /* the Windows half is hosted_spawn_win.c */

/* Counts the bits set in a word of an affinity mask. */
static I32 kspl_bits_set(unsigned long long x) {
    I32 n = 0;
    for (; x != 0; x &= x - 1) n++;
    return n;
}

#if defined(__linux__) && !defined(_GNU_SOURCE)
/* Caution: **Declared here rather than by raising _GNU_SOURCE** (the reason is at
 * kspl_stack_floor in hosted_thread.c). glibc and musl both carry it. */
int sched_getaffinity(pid_t pid, size_t size, void *mask);
#endif

/* The number of CPUs this process can run on (for std/sys.kspl's cpu_count). Returns 1 where it
 * is unknown.
 * Caution: Do not return 0 or a negative; the caller divides by it.
 * **Ask the affinity first** (`taskset`, a job object, `start /affinity`): the online count says
 * how many the machine has, and that many workers then share the few allowed. A container's CPU
 * quota is not read.
 * `_SC_NPROCESSORS_ONLN` is not a POSIX.1 constant but an extension. It is visible on macOS
 * because the preamble header raises `_DARWIN_C_SOURCE`, and dropping that breaks this (the
 * reason is write_decls in ksplc/gen/runtime.kspl). */
KSPL_LINK I32 kspl_cpu_count(void) {
#ifdef _WIN32
    /* Both masks are 0 where the process spans processor groups; then every group is counted. */
    DWORD_PTR mine = 0, all = 0;
    if (GetProcessAffinityMask(GetCurrentProcess(), &mine, &all) && mine != 0) {
        return kspl_bits_set((unsigned long long)mine);
    }
    DWORD n = GetActiveProcessorCount(ALL_PROCESSOR_GROUPS);
    return n > 0 ? (I32)n : 1;
#else
#if defined(__linux__)
    unsigned long mask[1024 / (8 * sizeof(unsigned long))];
    memset(mask, 0, sizeof(mask));
    if (sched_getaffinity(0, sizeof(mask), (void *)mask) == 0) {
        I32 allowed = 0;
        for (size_t i = 0; i < sizeof(mask) / sizeof(mask[0]); i++) allowed += kspl_bits_set(mask[i]);
        if (allowed > 0) return allowed;
    }
#endif
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return n > 0 ? (I32)n : 1;
#endif
}

/* Writes the working directory's path into buf and returns the length written (for
 * std/sys.kspl's cwd). Returns 0 where it cannot be taken or does not fit.
 * Caution: The terminating NUL is not counted in the length (the KSPL side takes a slice).
 * The separator is the OS's own (`\` on Windows); comparing paths must absorb it. */
KSPL_LINK Sz kspl_cwd(U8 *buf, Sz cap) {
    Sz n = 0;
    if (buf == NULL || cap <= 1) return 0;
#ifdef _WIN32
    {
        /* Caution: **Put it back to UTF-8.** `_getcwd` returns the current code page, which a
         * child process would read as a different path (hosted.c's heading). */
        wchar_t wbuf[KSPL_WPATH_CAP];
        if (_wgetcwd(wbuf, KSPL_WPATH_CAP) == NULL) return 0;
        if (kspl_win_from_wide(wbuf, (char *)buf, cap) < 0) return 0;
    }
#else
    if (getcwd((char *)buf, (size_t)(cap - 1)) == NULL) return 0;
#endif
    while (n < cap && buf[n] != '\0') n++;
    return n;
}

#if defined(__APPLE__)
#include <mach-o/dyld.h> /* _NSGetExecutablePath */
#endif

/* Writes this process's executable path, its links resolved, into buf and returns the length
 * written (for std_dir in ksplc/base/locate.kspl). 0 where it cannot be taken or does not fit,
 * and on a POSIX system other than Linux and macOS.
 * Caution: **Do not take it from argv[0].** Started through PATH it holds the bare name, and
 * through a link it names the link's folder, not the one the executable stands in.
 * Windows's GetModuleFileNameW resolves no link; the separator is the OS's own, as kspl_cwd's. */
KSPL_LINK Sz kspl_exe_path(U8 *buf, Sz cap) {
    Sz n = 0;
    if (buf == NULL || cap <= 1) return 0;
#if defined(_WIN32)
    {
        wchar_t wbuf[KSPL_WPATH_CAP];
        DWORD got = GetModuleFileNameW(NULL, wbuf, KSPL_WPATH_CAP);
        if (got == 0 || got >= KSPL_WPATH_CAP) return 0;
        if (kspl_win_from_wide(wbuf, (char *)buf, cap) < 0) return 0;
    }
#elif defined(__linux__)
    {
        ssize_t got = readlink("/proc/self/exe", (char *)buf, (size_t)(cap - 1));
        if (got <= 0 || (Sz)got >= cap - 1) return 0; /* a full buffer can be a cut one */
        buf[got] = '\0';
    }
#elif defined(__APPLE__)
    {
        char raw[4096];
        uint32_t size = sizeof raw;
        char *real;
        if (_NSGetExecutablePath(raw, &size) != 0) return 0;
        real = realpath(raw, NULL);
        if (real == NULL) return 0;
        n = (Sz)strlen(real);
        if (n >= cap) n = 0;
        else memcpy(buf, real, (size_t)n + 1);
        free(real);
        return n;
    }
#else
    buf[0] = '\0';
#endif
    while (n < cap && buf[n] != '\0') n++;
    return n;
}

/* Sets an environment variable (for std/sys.kspl's set_env). true on success.
 * POSIX's setenv and Windows's _wputenv_s differ in name and argument order; absorbed here.
 * name/value arrive NUL-terminated (std/sys.kspl refuses an input holding a NUL).
 * Caution: **It is never called with an empty value.** Windows's CRT reads an assignment of an
 * empty value as "erase it", so the caller (set_env in std/sys.kspl) refuses an empty one. */
KSPL_LINK Bool kspl_set_env(const U8 *name, const U8 *value) {
#ifdef _WIN32
    /* Place it through the wide side. UTF-8 handed to the narrow side is read as the
     * current code page and disagrees with the reader (hosted.c's kspl_win_to_wide). */
    {
        wchar_t *wname = kspl_win_wide_dup((const char *)name);
        wchar_t *wval = kspl_win_wide_dup((const char *)value);
        Bool ok = wname != NULL && wval != NULL && _wputenv_s(wname, wval) == 0;
        free(wname);
        free(wval);
        return ok;
    }
#else
    return setenv((const char *)name, (const char *)value, 1) == 0;
#endif
}

#ifdef _WIN32
/* Every value kspl_get_env has handed out on Windows, one copy per distinct text, kept for the
 * life of the process. */
typedef struct kspl_env_held { struct kspl_env_held *next; char text[]; } kspl_env_held;
static SRWLOCK kspl_env_lock = SRWLOCK_INIT;
static kspl_env_held *kspl_env_list = NULL;
#endif

/* Reads an environment variable (for std/sys.kspl's env). NULL where there is none. name
 * arrives NUL-terminated.
 * Caution: **Do not call `libc.getenv` directly from the KSPL side.** Windows's narrow side returns
 * the current code page, mixing two encodings. Windows takes the wide API here and converts.
 * **What it returns stays readable after the next read**, the guarantee std/sys.kspl's get_env
 * states. POSIX lends the environment's own string, which a read does not move. Windows converts
 * into a copy it never frees. A copy freed at the next read would leave a caller holding two
 * values (`CC` in a link's argv, then `CC` again), with one pointing into freed memory. */
KSPL_LINK const U8 *kspl_get_env(const U8 *name) {
#ifdef _WIN32
    {
        wchar_t *wname = kspl_win_wide_dup((const char *)name);
        wchar_t *wbuf = NULL;
        DWORD n = 1;
        DWORD got;
        int found = 0;
        char *text;
        kspl_env_held *e;
        /* Sized on demand: a short buffer answers the size the value needs, counting the NUL. A
         * value growing in between answers a larger one.
         * Caution: **A return of 0 means both "empty" and "absent".** Only the last error tells
         * them apart. Read as absent, a variable set to "" would be missing on Windows alone. */
        while (wname != NULL) {
            wbuf = (wchar_t *)malloc((size_t)n * sizeof(wchar_t));
            if (wbuf == NULL) break;
            SetLastError(ERROR_SUCCESS);
            got = GetEnvironmentVariableW(wname, wbuf, n);
            if (got == 0 && GetLastError() == ERROR_ENVVAR_NOT_FOUND) break;
            if (got < n) {
                wbuf[got] = 0;
                found = 1;
                break;
            }
            free(wbuf);
            wbuf = NULL;
            n = got;
        }
        free(wname);
        text = found ? kspl_win_utf8_dup(wbuf) : NULL;
        free(wbuf);
        if (text == NULL) return NULL;
        AcquireSRWLockExclusive(&kspl_env_lock);
        for (e = kspl_env_list; e != NULL && strcmp(e->text, text) != 0; e = e->next) {}
        if (e == NULL) {
            e = (kspl_env_held *)malloc(sizeof(kspl_env_held) + strlen(text) + 1);
            if (e != NULL) {
                strcpy(e->text, text);
                e->next = kspl_env_list;
                kspl_env_list = e;
            }
        }
        ReleaseSRWLockExclusive(&kspl_env_lock);
        free(text);
        return e != NULL ? (const U8 *)e->text : NULL;
    }
#else
    return (const U8 *)getenv((const char *)name);
#endif
}

/* Erases an environment variable (for std/sys.kspl's unset_env). true on success, also where it
 * is absent. POSIX's unsetenv and Windows's _wputenv_s(name, L"") are absorbed here.
 * Caution: **This is the only road that erases.** set_env in std/sys.kspl refuses an empty
 * value, so "assign an empty value to erase it" passes on no platform. name arrives NUL-terminated.
 */

KSPL_LINK Bool kspl_unset_env(const U8 *name) {
#ifdef _WIN32
    {
        wchar_t *wname = kspl_win_wide_dup((const char *)name);
        Bool ok = wname != NULL && _wputenv_s(wname, L"") == 0;
        free(wname);
        return ok;
    }
#else
    return unsetenv((const char *)name) == 0;
#endif
}

