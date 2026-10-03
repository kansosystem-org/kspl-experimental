/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * Starting a child process (for std/subproc.kspls).
 *
 * **The one function that starts one is kspl_proc_start.** Gathering, lining up, keeping it
 * running and talking back and forth differ only in where the three standard streams go (inherit
 * / a pipe / a file), so C holds one entry taking those as arguments, plus the tools that turn argv
 * into the OS's shape. Waiting, reading and stopping are hosted_proc.c; the rendezvous is
 * assembled on the KSPL side.
 * ============================================================ */
#ifndef _WIN32
#include <fcntl.h> /* open / O_* and FD_CLOEXEC. No include after this section is leaned on */

/* Splits argv_buf (an argument run separated by NULs) into an argv array for execv. out must hold
 * room for argc+1 entries (a NULL is placed at the end). false where it cannot be split.
 *
 * Caution: **Confirm that the number of steps agrees with argc exactly.** A KSPL string can hold a
 * NUL, which here is the separator: one argument splits in two and an argument the caller never
 * wrote is inserted. Only the end position against argv_buf_len tells it, since in the assembled
 * buffer a separating NUL and a content NUL look the same. */
static Bool kspl_argv_split(const U8 *argv_buf, Sz argv_buf_len, I32 argc, char **out) {
    if (argc <= 0 || argc > 256) return false;
    Sz off = 0;
    for (I32 i = 0; i < argc; i++) {
        out[i] = (char *)(argv_buf + off);
        while (off < argv_buf_len && argv_buf[off] != '\0') off++;
        if (off >= argv_buf_len) return false; /* no terminating \0 = invalid input */
        off++;
    }
    if (off != argv_buf_len) return false; /* too many steps = one of the arguments holds a NUL */
    out[argc] = NULL;
    return true;
}

/* Closes the three pipes.
   Caution: **Do not write it per failure route.** Six fds listed by hand lose one whenever a route
 * is added, and the only symptom is "after a while it stops opening". */
static void kspl_close_pipe_pair(int *p) {
    if (p[0] >= 0) close(p[0]);
    if (p[1] >= 0) close(p[1]);
    p[0] = -1;
    p[1] = -1;
}


/* Starts one child (the one function; the section heading says why). The KSPL side
 * (std/subproc.kspls) holds the combinations.
 *   stdio … bits: 1/2/4 = pipe stdin/stdout/stderr, 8 = no console window (Windows alone).
 *   out_len / err_len > 0 … that stream to that file (created truncated); else it inherits.
 * Returns hosted_proc.c's handle (0 = failure); a stream with no pipe has end -1 (I/O returns -2).
 * Caution: **Do not specify both a file and a pipe for the same stream** (the file wins).
 * **The same path handed twice is opened once**: two opens keep separate positions and overwrite
 * each other quietly (and on Windows the second is a sharing violation). Opening happens after
 * the fork, so the parent spends no fd on it.
 * **Do not let a later child inherit an end the parent holds** (FD_CLOEXEC, as
 * SetHandleInformation on Windows); a later child holding an earlier one's stdin writer keeps
 * that child from ever seeing EOF. The child's own 0/1/2 come from dup2 and carry no mark. */
I64 kspl_proc_start(const U8 *argv_buf, Sz argv_buf_len, I32 argc, const U8 *cwd_ptr, Sz cwd_len,
        I32 stdio, const U8 *out_ptr, Sz out_len, const U8 *err_ptr, Sz err_len) {
    char *argv_arr[257];
    char cwd_path[4096], out_path[4096], err_path[4096];
    if (!kspl_argv_split(argv_buf, argv_buf_len, argc, argv_arr)) return 0;
    if (cwd_len > 0 && !kspl_to_cstr(cwd_ptr, cwd_len, cwd_path, sizeof(cwd_path))) return 0;
    if (out_len > 0 && !kspl_to_cstr(out_ptr, out_len, out_path, sizeof(out_path))) return 0;
    if (err_len > 0 && !kspl_to_cstr(err_ptr, err_len, err_path, sizeof(err_path))) return 0;
    int one_file = (out_len > 0 && out_len == err_len && memcmp(out_ptr, err_ptr, (size_t)out_len) == 0);
    int pipe_in = (stdio & 1) != 0;
    int pipe_out = (stdio & 2) != 0 && out_len == 0;
    int pipe_err = (stdio & 4) != 0 && err_len == 0;

    int in_p[2] = {-1, -1}, out_p[2] = {-1, -1}, err_p[2] = {-1, -1};
    if (pipe_in && pipe(in_p) != 0) return 0;
    if (pipe_out && pipe(out_p) != 0) { kspl_close_pipe_pair(in_p); return 0; }
    if (pipe_err && pipe(err_p) != 0) { kspl_close_pipe_pair(in_p); kspl_close_pipe_pair(out_p); return 0; }
    kspl_proc_t *h = (kspl_proc_t *)malloc(sizeof(kspl_proc_t));
    if (h == NULL) {
        kspl_close_pipe_pair(in_p); kspl_close_pipe_pair(out_p); kspl_close_pipe_pair(err_p);
        return 0;
    }
    for (int k = 0; k < 2; k++) {
        if (in_p[k] >= 0) fcntl(in_p[k], F_SETFD, FD_CLOEXEC);
        if (out_p[k] >= 0) fcntl(out_p[k], F_SETFD, FD_CLOEXEC);
        if (err_p[k] >= 0) fcntl(err_p[k], F_SETFD, FD_CLOEXEC);
    }

    fflush(stdout);
    fflush(stderr);
    pid_t pid = fork();
    if (pid < 0) {
        free(h);
        kspl_close_pipe_pair(in_p); kspl_close_pipe_pair(out_p); kspl_close_pipe_pair(err_p);
        return 0;
    }
    if (pid == 0) {
        kspl_child_restore_signals();
        if (pipe_in && dup2(in_p[0], 0) < 0) _exit(127);
        if (pipe_out && dup2(out_p[1], 1) < 0) _exit(127);
        if (pipe_err && dup2(err_p[1], 2) < 0) _exit(127);
        if (out_len > 0 || err_len > 0) {
            int ofd = -1, efd = -1;
            if (out_len > 0) {
                ofd = open(out_path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (ofd < 0 || dup2(ofd, 1) < 0) _exit(127);
            }
            if (err_len > 0) {
                efd = one_file ? ofd : open(err_path, O_WRONLY | O_CREAT | O_TRUNC, 0644);
                if (efd < 0 || dup2(efd, 2) < 0) _exit(127);
            }
            if (ofd > 2) close(ofd);
            if (!one_file && efd > 2) close(efd);
        }
        kspl_close_pipe_pair(in_p); kspl_close_pipe_pair(out_p); kspl_close_pipe_pair(err_p);
        if (cwd_len > 0 && chdir(cwd_path) != 0) _exit(127);
        execvp(argv_arr[0], argv_arr);
        _exit(127);
    }
    /* The child's ends are closed in the parent (left open, our read does not reach EOF even
     * after the partner ends). */
    if (in_p[0] >= 0) close(in_p[0]);
    if (out_p[1] >= 0) close(out_p[1]);
    if (err_p[1] >= 0) close(err_p[1]);
    h->pid = pid; h->to_w = in_p[1]; h->from_w = out_p[0]; h->from_err = err_p[0];
    h->code = -1; h->reaped = 0; h->out_eof = 0; h->err_eof = 0;
    return (I64)(intptr_t)h;
}

#else
/* A Windows command line is one string joined by spaces, each argument wrapped in "". Microsoft's
 * parser treats a backslash specially only right before a ", so that run of backslashes is doubled;
 * otherwise a path ending in \ swallows the closing quote and the following arguments merge (an
 * argument injection).
 * Caution: Every place calling CreateProcess must come through this function; a copied rule
 * brings the injection back the day only one copy is fixed. */
/* **Confirm that the number of steps agrees with argc exactly** (the check on off at the
 * end; the reason is at the POSIX side's kspl_argv_split). */

static Bool kspl_win_build_cmdline(const U8 *argv_buf, Sz argv_buf_len, I32 argc, char *cmd,
    int cmd_cap) {
    if (argc <= 0 || argc > 256) return false;
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
            while (j < alen && arg[j] == '\\') { j++; nbs++; }
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

/* The same contract as the POSIX side (the heading is there). The parent's pipe ends are not
 * inherited (SetHandleInformation).
 * Caution: **Make bInheritHandles true** (the fifth argument), or the child holds none of the
 * handles handed over. The parent's files and the child's ends are closed right after
 * CreateProcess, or they leak per start. */
I64 kspl_proc_start(const U8 *argv_buf, Sz argv_buf_len, I32 argc, const U8 *cwd_ptr, Sz cwd_len,
        I32 stdio, const U8 *out_ptr, Sz out_len, const U8 *err_ptr, Sz err_len) {
    char cmd[KSPL_WCMD_CAP];
    wchar_t wcmd[KSPL_WCMD_CAP];
    wchar_t cwd_path[KSPL_WPATH_CAP], out_path[KSPL_WPATH_CAP], err_path[KSPL_WPATH_CAP];
    if (!kspl_win_build_cmdline(argv_buf, argv_buf_len, argc, cmd, (int)sizeof(cmd))) return 0;
    if (!kspl_win_cstr_to_wide(cmd, wcmd, KSPL_WCMD_CAP)) return 0;
    /* The working directory alone does not go through kspl_path_to_wide: the OS keeps a process's
     * current directory under MAX_PATH unless the program opts in (SetCurrentDirectoryW's limit). */
    if (cwd_len > 0 && !kspl_win_to_wide((const char *)cwd_ptr, cwd_len, cwd_path, KSPL_WPATH_CAP)) return 0;
    if (out_len > 0 && !kspl_path_to_wide(out_ptr, out_len, out_path, KSPL_WPATH_CAP)) return 0;
    if (err_len > 0 && !kspl_path_to_wide(err_ptr, err_len, err_path, KSPL_WPATH_CAP)) return 0;
    int one_file = (out_len > 0 && out_len == err_len && memcmp(out_ptr, err_ptr, (size_t)out_len) == 0);
    int pipe_in = (stdio & 1) != 0;
    int pipe_out = (stdio & 2) != 0 && out_len == 0;
    int pipe_err = (stdio & 4) != 0 && err_len == 0;
    int any = pipe_in || pipe_out || pipe_err || out_len > 0 || err_len > 0;
    /* 8 asks for no console window: without it, a console child of a console-less parent gets a
     * fresh black window of its own (CREATE_NO_WINDOW; ignored for a non-console program).
     * Caution: **Do not ask for it where the child's output is meant to reach the parent's
     * console** — its writes land nowhere, so the KSPL side asks only where both streams go to
     * files (spawn_redirect in std/subproc.kspls). Ctrl+C in the parent's console no longer
     * reaches the child either, which is why it is not the default. */
    DWORD flags = ((stdio & 8) != 0) ? CREATE_NO_WINDOW : 0;

    SECURITY_ATTRIBUTES sa;
    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    HANDLE in_r = NULL, in_w = NULL, out_r = NULL, out_w = NULL, err_r = NULL, err_w = NULL;
    HANDLE oh = NULL, eh = NULL;
    kspl_proc_t *h = (kspl_proc_t *)malloc(sizeof(kspl_proc_t));
    if (h == NULL) return 0;
    if (pipe_in && !CreatePipe(&in_r, &in_w, &sa, 0)) goto fail;
    if (pipe_out && !CreatePipe(&out_r, &out_w, &sa, 0)) goto fail;
    if (pipe_err && !CreatePipe(&err_r, &err_w, &sa, 0)) goto fail;
    if (in_w != NULL) SetHandleInformation(in_w, HANDLE_FLAG_INHERIT, 0);
    if (out_r != NULL) SetHandleInformation(out_r, HANDLE_FLAG_INHERIT, 0);
    if (err_r != NULL) SetHandleInformation(err_r, HANDLE_FLAG_INHERIT, 0);
    /* Allow a reader (`FILE_SHARE_READ`) — the side waiting for it to come up watches
     * while reading. */
    if (out_len > 0) {
        oh = CreateFileW(out_path, GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL, NULL);
        if (oh == INVALID_HANDLE_VALUE) { oh = NULL; goto fail; }
    }
    if (err_len > 0) {
        eh = one_file ? oh : CreateFileW(err_path, GENERIC_WRITE, FILE_SHARE_READ, &sa, CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL, NULL);
        if (eh == INVALID_HANDLE_VALUE) { eh = NULL; goto fail; }
    }

    STARTUPINFOW si;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    if (any) {
        si.dwFlags = STARTF_USESTDHANDLES;
        si.hStdInput = pipe_in ? in_r : GetStdHandle(STD_INPUT_HANDLE);
        si.hStdOutput = out_len > 0 ? oh : (pipe_out ? out_w : GetStdHandle(STD_OUTPUT_HANDLE));
        si.hStdError = err_len > 0 ? eh : (pipe_err ? err_w : GetStdHandle(STD_ERROR_HANDLE));
    }
    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));
    fflush(stdout);
    fflush(stderr);
    BOOL ok = CreateProcessW(NULL, wcmd, NULL, NULL, TRUE, flags, NULL, cwd_len > 0 ? cwd_path : NULL, &si, &pi);
    /* The child's ends and the parent's opened files are closed here, started or not. */
    if (in_r != NULL) CloseHandle(in_r);
    if (out_w != NULL) CloseHandle(out_w);
    if (err_w != NULL) CloseHandle(err_w);
    if (oh != NULL) CloseHandle(oh);
    if (eh != NULL && !one_file) CloseHandle(eh);
    in_r = out_w = err_w = oh = eh = NULL;
    if (!ok) goto fail;
    CloseHandle(pi.hThread);
    h->proc = pi.hProcess; h->to_w = in_w; h->from_w = out_r; h->from_err = err_r;
    h->code = -1; h->reaped = 0; h->out_eof = 0; h->err_eof = 0;
    return (I64)(intptr_t)h;
fail:
    if (in_r != NULL) CloseHandle(in_r);
    if (in_w != NULL) CloseHandle(in_w);
    if (out_r != NULL) CloseHandle(out_r);
    if (out_w != NULL) CloseHandle(out_w);
    if (err_r != NULL) CloseHandle(err_r);
    if (err_w != NULL) CloseHandle(err_w);
    if (oh != NULL) CloseHandle(oh);
    if (eh != NULL && !one_file) CloseHandle(eh);
    free(h);
    return 0;
}

#endif

/* The number of usable CPUs (for std/sys.kspls's cpu_count). Returns 1 where it is unknown.
 * Caution: Do not return 0 or a negative; the caller divides by it.
 * `_SC_NPROCESSORS_ONLN` is not a POSIX.1 constant but an extension. It is visible on
 * macOS because the preamble header raises `_DARWIN_C_SOURCE`, and dropping that breaks this (the
 * reason is write_decls in ksplc/gen/runtime.kspls). */
I32 kspl_cpu_count(void) {
#ifdef _WIN32
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    return si.dwNumberOfProcessors > 0 ? (I32)si.dwNumberOfProcessors : 1;
#else
    long n = sysconf(_SC_NPROCESSORS_ONLN);
    return n > 0 ? (I32)n : 1;
#endif
}

/* Writes the working directory's path into buf and returns the length written (for
 * std/sys.kspls's cwd). Returns 0 where it cannot be taken or does not fit.
 * Caution: The terminating NUL is not counted in the length (the KSPL side takes a slice).
 * The separator is the OS's own (`\` on Windows); comparing paths must absorb it. */
Sz kspl_cwd(U8 *buf, Sz cap) {
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
 * written (for std_dir in ksplc/base/locate.kspls). 0 where it cannot be taken or does not fit,
 * and on a POSIX system other than Linux and macOS.
 * Caution: **Do not take it from argv[0].** Started through PATH it holds the bare name, and
 * through a link it names the link's folder, not the one the executable stands in.
 * Windows's GetModuleFileNameW resolves no link; the separator is the OS's own, as kspl_cwd's. */
Sz kspl_exe_path(U8 *buf, Sz cap) {
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
        if (got <= 0 || (Sz)got >= cap - 1) return 0; /* a full buffer may be a cut one */
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

/* Sets an environment variable (for std/sys.kspls's set_env). true on success.
 * POSIX's setenv and Windows's _wputenv_s differ in name and argument order; absorbed here.
 * name/value arrive NUL-terminated (std/sys.kspls refuses an input holding a NUL).
 * Caution: **It is never called with an empty value.** Windows's CRT reads an assignment of an
 * empty value as "erase it", so the caller (set_env in std/sys.kspls) refuses an empty one. */
Bool kspl_set_env(const U8 *name, const U8 *value) {
#ifdef _WIN32
    /* Place it through the wide side. UTF-8 handed to the narrow side is read as the
     * current code page and disagrees with the reader (hosted.c's kspl_win_to_wide). */
    {
        wchar_t wname[KSPL_WPATH_CAP];
        wchar_t wval[KSPL_WPATH_CAP];
        if (!kspl_win_cstr_to_wide((const char *)name, wname, KSPL_WPATH_CAP)) return false;
        if (!kspl_win_cstr_to_wide((const char *)value, wval, KSPL_WPATH_CAP)) return false;
        return _wputenv_s(wname, wval) == 0;
    }
#else
    return setenv((const char *)name, (const char *)value, 1) == 0;
#endif
}

/* Reads an environment variable (for std/sys.kspls's env). NULL where there is none. name
 * arrives NUL-terminated.
 * Caution: **Do not call `libc.getenv` directly from the KSPL side.** Windows's narrow side returns
 * the current code page, mixing two encodings; Windows takes the wide API here and converts.
 * Windows returns a fresh copy, POSIX a borrow into the environment: **treat either as "valid
 * until the environment is next touched".** */
const U8 *kspl_get_env(const U8 *name) {
#ifdef _WIN32
    {
        wchar_t wname[KSPL_WPATH_CAP];
        wchar_t wbuf[KSPL_WPATH_CAP];
        DWORD n;
        static char *held = NULL;
        if (!kspl_win_cstr_to_wide((const char *)name, wname, KSPL_WPATH_CAP)) return NULL;
        n = GetEnvironmentVariableW(wname, wbuf, KSPL_WPATH_CAP);
        if (n == 0 || n >= KSPL_WPATH_CAP) return NULL;
        free(held);
        held = (char *)malloc(KSPL_WPATH_CAP * 4);
        if (held == NULL) return NULL;
        if (kspl_win_from_wide(wbuf, held, (Sz)(KSPL_WPATH_CAP * 4)) < 0) {
            free(held);
            held = NULL;
            return NULL;
        }
        return (const U8 *)held;
    }
#else
    return (const U8 *)getenv((const char *)name);
#endif
}

/* Erases an environment variable (for std/sys.kspls's unset_env). true on success, also where it
 * is absent. POSIX's unsetenv and Windows's _wputenv_s(name, L"") are absorbed here.
 * Caution: **This is the only road that erases.** set_env in std/sys.kspls refuses an empty
 * value, so "assign an empty value to erase it" passes on no platform. name arrives NUL-terminated.
 */

Bool kspl_unset_env(const U8 *name) {
#ifdef _WIN32
    {
        wchar_t wname[KSPL_WPATH_CAP];
        if (!kspl_win_cstr_to_wide((const char *)name, wname, KSPL_WPATH_CAP)) return false;
        return _wputenv_s(wname, L"") == 0;
    }
#else
    return unsetenv((const char *)name) == 0;
#endif
}

