/* Part of the C runtime for an environment with an OS: the Windows half of hosted_spawn.c.
   Caution: **It does not build on its own** — it joins right behind hosted_spawn.c, whose
 * shared part it reads, to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
#ifdef _WIN32
/* Whether a name is bare, to be looked up (no `\`, `/` or drive colon in it). */
static Bool kspl_win_is_bare(const char *name) {
    return strpbrk(name, "\\/:") == NULL;
}

/* The extensions a bare name with none is looked up with, in this order. **The same list as
 * RUN_EXTS in std/fs.kspl**, which says what can be started; change both together.
 * Caution: **Do not read PATHEXT**, for the reason given at RUN_EXTS. A `.bat` or `.cmd` found here
 * goes through kspl_win_batch_safe, as one named in full does. */
static const wchar_t *const kspl_win_run_exts[] = {L".exe", L".com", L".bat", L".cmd"};

/* Keeps dir + `\` + name + ext in out and says whether that names a file (ext is L"" for none). */
static Bool kspl_win_try_dir(const wchar_t *dir, size_t dlen, const wchar_t *name,
    const wchar_t *ext, wchar_t *out, size_t cap) {
    size_t nlen = wcslen(name);
    size_t elen = wcslen(ext);
    size_t m = dlen;
    DWORD a;
    if (dlen == 0) return false;
    Bool sep = dir[dlen - 1] == L'\\' || dir[dlen - 1] == L'/';
    if (dlen + 1 + nlen + elen + 1 > cap) return false;
    memcpy(out, dir, dlen * sizeof(wchar_t));
    if (!sep) out[m++] = L'\\';
    memcpy(out + m, name, nlen * sizeof(wchar_t));
    m += nlen;
    memcpy(out + m, ext, elen * sizeof(wchar_t));
    m += elen;
    out[m] = L'\0';
    a = GetFileAttributesW(out);
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY) == 0;
}

/* Copies the PATH entry at p into dir without its quotes, and returns where the next one starts
 * (NULL after the last). *dlen is 0 for an entry too long to keep, which is then skipped.
 * Caution: **A `;` inside quotes belongs to the entry** (`"C:\a;b"`). So the entry ends at the
 * first `;` outside quotes. Split at the first `;`, a quoted entry is cut in two, and neither half
 * names the folder. */
static const wchar_t *kspl_win_path_entry(const wchar_t *p, wchar_t *dir, size_t cap,
    size_t *dlen) {
    size_t n = 0;
    Bool quoted = false, fits = true;
    for (; *p != L'\0' && (quoted || *p != L';'); p++) {
        if (*p == L'"') quoted = !quoted;
        else if (n + 1 < cap) dir[n++] = *p;
        else fits = false;
    }
    *dlen = fits ? n : 0;
    return *p == L';' ? p + 1 : NULL;
}

/* Looks a bare program name up in PATH alone and keeps the full path in out; false where it is
 * nowhere. A name with no extension is tried with each of kspl_win_run_exts in one folder before
 * the next folder, as cmd.exe does.
 * Caution: **Search PATH alone, as POSIX's execvp does.** CreateProcess searches this executable's
 * directory, the current directory, the system directory and the Windows directory before PATH.
 * So `bash` names WSL's launcher in System32 in place of the bash on PATH. A `cc.exe` lying in a
 * directory a build is started from (a cloned repository) runs in place of the compiler. */
static Bool kspl_win_find_program(const wchar_t *name, wchar_t *out, size_t cap) {
    Bool has_ext = wcschr(name, L'.') != NULL;
    size_t n_ext = has_ext ? 1 : sizeof(kspl_win_run_exts) / sizeof(kspl_win_run_exts[0]);
    DWORD n = GetEnvironmentVariableW(L"PATH", NULL, 0);
    if (n == 0) return false;
    wchar_t *path = (wchar_t *)malloc((size_t)n * sizeof(wchar_t));
    wchar_t *dir = (wchar_t *)malloc(KSPL_WPATH_CAP * sizeof(wchar_t));
    Bool found = false;
    DWORD got = path != NULL && dir != NULL ? GetEnvironmentVariableW(L"PATH", path, n) : 0;
    if (got > 0 && got < n) {
        const wchar_t *p = path;
        while (!found && p != NULL) {
            size_t dlen;
            p = kspl_win_path_entry(p, dir, KSPL_WPATH_CAP, &dlen);
            for (size_t k = 0; !found && k < n_ext; k++) {
                found = kspl_win_try_dir(dir, dlen, name, has_ext ? L"" : kspl_win_run_exts[k], out,
                    cap);
            }
        }
    }
    free(dir);
    free(path);
    return found;
}

/* An inheritable copy of the parent's own standard handle, kept in *dup to close after the start;
 * NULL where the parent has none. */
static HANDLE kspl_win_std_copy(DWORD which, HANDLE *dup) {
    HANDLE h = GetStdHandle(which);
    *dup = NULL;
    if (h == NULL || h == INVALID_HANDLE_VALUE) return NULL;
    if (!DuplicateHandle(GetCurrentProcess(), h, GetCurrentProcess(), dup, 0, TRUE,
            DUPLICATE_SAME_ACCESS)) {
        *dup = NULL;
    }
    return *dup;
}

/* Starts the child handing it the three standard handles in std3 and nothing else
 * (PROC_THREAD_ATTRIBUTE_HANDLE_LIST).
 * Caution: **Do not pass bInheritHandles alone.** It hands the child every inheritable handle of
 * the process. A start on another thread holds its child's pipe ends inheritable until its own
 * CreateProcessW returns. Our child would take them. That reader would then see EOF only when ours
 * ends. */
static BOOL kspl_win_create_listed(wchar_t *wcmd, DWORD flags, const wchar_t *cwd, HANDLE *std3,
    PROCESS_INFORMATION *pi) {
    HANDLE list[3];
    DWORD n = 0;
    SIZE_T size = 0;
    STARTUPINFOEXW si;
    ZeroMemory(&si, sizeof(si));
    si.StartupInfo.cb = sizeof(si);
    si.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
    si.StartupInfo.hStdInput = std3[0];
    si.StartupInfo.hStdOutput = std3[1];
    si.StartupInfo.hStdError = std3[2];
    /* The list holds each handle once (a stream sharing one file names it twice). */
    for (int k = 0; k < 3; k++) {
        DWORD j = 0;
        while (j < n && list[j] != std3[k]) j++;
        if (std3[k] != NULL && j == n) list[n++] = std3[k];
    }
    if (n == 0) {
        return CreateProcessW(NULL, wcmd, NULL, NULL, FALSE, flags, NULL, cwd, &si.StartupInfo, pi);
    }
    InitializeProcThreadAttributeList(NULL, 1, 0, &size);
    si.lpAttributeList = (LPPROC_THREAD_ATTRIBUTE_LIST)malloc(size);
    if (si.lpAttributeList == NULL) return FALSE;
    BOOL ok = InitializeProcThreadAttributeList(si.lpAttributeList, 1, 0, &size);
    if (ok) {
        ok = UpdateProcThreadAttribute(si.lpAttributeList, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST, list,
            n * sizeof(HANDLE), NULL, NULL) &&
            CreateProcessW(NULL, wcmd, NULL, NULL, TRUE, flags | EXTENDED_STARTUPINFO_PRESENT, NULL,
            cwd, &si.StartupInfo, pi);
        DeleteProcThreadAttributeList(si.lpAttributeList);
    }
    free(si.lpAttributeList);
    return ok;
}

/* Whether a program path with a directory part is relative to the working directory: it starts
 * with neither a separator (rooted) nor a drive (`C:`). */
static Bool kspl_win_is_cwd_relative(const char *name) {
    return name[0] != '\\' && name[0] != '/' && strchr(name, ':') == NULL;
}

/* The command line for argv, on the heap (the caller frees it); NULL where it cannot be built.
 * A bare argv[0] is looked up here, and the line names the full path. So neither CreateProcess
 * nor cmd.exe (for a batch file) searches again. A relative one with a directory part is joined
 * onto cwd (where cwd_len > 0). POSIX's exec reads it after the chdir, and CreateProcessW would
 * read it from this process's own directory.
 * Caution: **Measure it in UTF-16 units, after the conversion.** The OS's limit counts those.
 * Counted as UTF-8 bytes, a line of kana (three bytes a unit) would be refused at a third of it.
 * **That limit (KSPL_WCMD_MAX) is the only cap**, on the count of arguments as on their length.
 * Caution: **Every NULL sets *why**, the Windows error that names the cause, which becomes
 * kspl_start_error. Without it, a tool can say only that the start failed. */
static wchar_t *kspl_win_command_line(const U8 *argv_buf, Sz argv_buf_len, I32 argc,
    const U8 *cwd_ptr, Sz cwd_len, DWORD *why) {
    char prog[KSPL_WPATH_CAP * 3];
    U8 *found_buf = NULL;
    char *cmd = NULL;
    wchar_t *wcmd = NULL;
    /* an argument holding a NUL, or none at all */
    *why = ERROR_BAD_ARGUMENTS;
    if (argv_buf_len <= 0 || memchr(argv_buf, '\0', (size_t)argv_buf_len) == NULL) return NULL;
    Sz arg0_len = (Sz)strlen((const char *)argv_buf);
    *why = ERROR_FILENAME_EXCED_RANGE;
    if (arg0_len >= (Sz)sizeof(prog)) return NULL;
    memcpy(prog, argv_buf, (size_t)arg0_len + 1);
    if (kspl_win_is_bare(prog)) {
        wchar_t wname[KSPL_WPATH_CAP], wfound[KSPL_WPATH_CAP];
        *why = ERROR_INVALID_NAME;
        if (!kspl_win_cstr_to_wide(prog, wname, KSPL_WPATH_CAP)) return NULL;
        /* 2, as POSIX's execvp gives ENOENT for a name on no PATH */
        *why = ERROR_FILE_NOT_FOUND;
        if (!kspl_win_find_program(wname, wfound, KSPL_WPATH_CAP)) return NULL;
        *why = ERROR_INVALID_NAME;
        if (kspl_win_from_wide(wfound, prog, (Sz)sizeof(prog)) < 0) return NULL;
    } else if (cwd_len > 0 && kspl_win_is_cwd_relative(prog)) {
        Bool sep = cwd_ptr[cwd_len - 1] == '\\' || cwd_ptr[cwd_len - 1] == '/';
        Sz head = cwd_len + (sep ? 0 : 1);
        *why = ERROR_FILENAME_EXCED_RANGE;
        if (head + arg0_len >= (Sz)sizeof(prog)) return NULL;
        memmove(prog + head, prog, (size_t)arg0_len + 1);
        memcpy(prog, cwd_ptr, (size_t)cwd_len);
        if (!sep) prog[cwd_len] = '\\';
    }
    /* argv[0] changed: the run is built again with the new one in front. */
    Sz prog_len = (Sz)strlen(prog);
    *why = ERROR_NOT_ENOUGH_MEMORY;
    if (prog_len != arg0_len || memcmp(prog, argv_buf, (size_t)arg0_len) != 0) {
        Sz rest = argv_buf_len - arg0_len;
        found_buf = (U8 *)malloc((size_t)(prog_len + rest));
        if (found_buf == NULL) return NULL;
        memcpy(found_buf, prog, (size_t)prog_len);
        memcpy(found_buf + prog_len, argv_buf + arg0_len, (size_t)rest);
        argv_buf = found_buf;
        argv_buf_len = prog_len + rest;
    }
    /* Quoting at most doubles a byte, and each argument adds two quotes and a space; the builder
     * keeps a margin of its own on top. */
    Sz cap = argv_buf_len * 2 + (Sz)argc * 3 + 256;
    *why = ERROR_FILENAME_EXCED_RANGE;
    if (cap >= 0x7FFFFFFF) goto done;
    *why = ERROR_NOT_ENOUGH_MEMORY;
    cmd = (char *)malloc((size_t)cap);
    if (cmd == NULL) goto done;
    /* a batch file's arguments that cmd.exe would read as commands, or an argument holding a NUL */
    *why = ERROR_BAD_ARGUMENTS;
    if (!kspl_win_line_for(argv_buf, argv_buf_len, argc, (U8 *)cmd, (I32)cap)) goto done;
    /* an argument that is not UTF-8 has no UTF-16 form */
    *why = ERROR_NO_UNICODE_TRANSLATION;
    wcmd = kspl_win_wide_dup(cmd);
    if (wcmd == NULL) goto done;
    /* the same error CreateProcessW gives for a line past its limit */
    *why = ERROR_FILENAME_EXCED_RANGE;
    if (wcslen(wcmd) >= KSPL_WCMD_MAX) {
        free(wcmd);
        wcmd = NULL;
    }
done:
    free(found_buf);
    free(cmd);
    return wcmd;
}

/* The same contract as the POSIX side (the heading is there). The parent's pipe ends are not
 * inherited (SetHandleInformation), and the child is handed its three alone
 * (kspl_win_create_listed). The parent's files, the child's ends and the copies of the parent's
 * own standard handles are closed right after CreateProcess, or they leak per start. */
KSPL_LINK I64 kspl_proc_start(const U8 *argv_buf, Sz argv_buf_len, I32 argc, const U8 *cwd_ptr, Sz cwd_len,
        I32 stdio, const U8 *out_ptr, Sz out_len, const U8 *err_ptr, Sz err_len) {
    kspl_start_error = 0;
    wchar_t cwd_path[KSPL_WPATH_CAP], out_path[KSPL_WPATH_CAP], err_path[KSPL_WPATH_CAP];
    /* The working directory alone does not go through kspl_path_to_wide. The OS keeps a process's
     * current directory under MAX_PATH unless the program opts in (SetCurrentDirectoryW's limit). */
    /* Caution: **Set kspl_start_error before every early return**, as the fail label does. */
    if ((cwd_len > 0 && !kspl_win_to_wide((const char *)cwd_ptr, cwd_len, cwd_path, KSPL_WPATH_CAP)) ||
        (out_len > 0 && !kspl_path_to_wide(out_ptr, out_len, out_path, KSPL_WPATH_CAP)) ||
        (err_len > 0 && !kspl_path_to_wide(err_ptr, err_len, err_path, KSPL_WPATH_CAP))) {
        /* not UTF-8, holding a NUL, or too long */
        kspl_start_error = ERROR_INVALID_NAME;
        return 0;
    }
    DWORD why = 0;
    wchar_t *wcmd = kspl_win_command_line(argv_buf, argv_buf_len, argc, cwd_ptr, cwd_len, &why);
    if (wcmd == NULL) {
        kspl_start_error = (I32)why;
        return 0;
    }
    int one_file = (out_len > 0 && out_len == err_len && memcmp(out_ptr, err_ptr, (size_t)out_len) == 0);
    int pipe_in = (stdio & 1) != 0;
    int pipe_out = (stdio & 2) != 0 && out_len == 0;
    int pipe_err = (stdio & 4) != 0 && err_len == 0;
    /* 8 asks for no console window. Without it, a console child of a console-less parent gets a
     * fresh black window of its own (CREATE_NO_WINDOW; ignored for a non-console program).
     * Caution: **Do not ask for it where the child's output is meant to reach the parent's
     * console.** Its writes land nowhere. So the KSPL side asks only where both streams go to
     * files (spawn_redirect in std/subproc.kspl). Ctrl+C in the parent's console no longer
     * reaches the child either, which is why it is not the default. */
    DWORD flags = ((stdio & 8) != 0) ? CREATE_NO_WINDOW : 0;

    SECURITY_ATTRIBUTES sa;
    ZeroMemory(&sa, sizeof(sa));
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;

    HANDLE in_r = NULL, in_w = NULL, out_r = NULL, out_w = NULL, err_r = NULL, err_w = NULL;
    HANDLE oh = NULL, eh = NULL, job = NULL;
    kspl_proc_t *h = (kspl_proc_t *)malloc(sizeof(kspl_proc_t));
    if (h == NULL) {
        free(wcmd);
        kspl_start_error = ERROR_NOT_ENOUGH_MEMORY;
        return 0;
    }
    /* 16: a job object of its own, the POSIX side's group. The child starts suspended and runs
     * only once it is in the job, so nothing it starts can begin outside. No kill on close: a
     * kill is kspl_proc_kill's, and what is left at the end runs on, as on POSIX. */
    if ((stdio & 16) != 0) {
        job = CreateJobObjectW(NULL, NULL);
        if (job == NULL) goto fail;
        flags |= CREATE_SUSPENDED;
    }
    if (pipe_in && !CreatePipe(&in_r, &in_w, &sa, 0)) goto fail;
    if (pipe_out && !CreatePipe(&out_r, &out_w, &sa, 0)) goto fail;
    if (pipe_err && !CreatePipe(&err_r, &err_w, &sa, 0)) goto fail;
    if (in_w != NULL) SetHandleInformation(in_w, HANDLE_FLAG_INHERIT, 0);
    if (out_r != NULL) SetHandleInformation(out_r, HANDLE_FLAG_INHERIT, 0);
    if (err_r != NULL) SetHandleInformation(err_r, HANDLE_FLAG_INHERIT, 0);
    /* Every sharing flag, as on POSIX: a reader watches the file while the child writes it, and
     * a rename or a removal over it goes through while the child still holds it. */
    DWORD share = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
    if (out_len > 0) {
        oh = CreateFileW(out_path, GENERIC_WRITE, share, &sa, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL,
            NULL);
        if (oh == INVALID_HANDLE_VALUE) { oh = NULL; goto fail; }
    }
    if (err_len > 0) {
        eh = one_file ? oh : CreateFileW(err_path, GENERIC_WRITE, share, &sa, CREATE_ALWAYS,
            FILE_ATTRIBUTE_NORMAL, NULL);
        if (eh == INVALID_HANDLE_VALUE) { eh = NULL; goto fail; }
    }

    /* A stream left to inherit gets a copy of the parent's own handle, so the list names it. */
    HANDLE dups[3] = {NULL, NULL, NULL};
    HANDLE std3[3];
    std3[0] = pipe_in ? in_r : kspl_win_std_copy(STD_INPUT_HANDLE, &dups[0]);
    std3[1] = out_len > 0 ? oh : (pipe_out ? out_w : kspl_win_std_copy(STD_OUTPUT_HANDLE, &dups[1]));
    std3[2] = err_len > 0 ? eh : (pipe_err ? err_w : kspl_win_std_copy(STD_ERROR_HANDLE, &dups[2]));
    PROCESS_INFORMATION pi;
    ZeroMemory(&pi, sizeof(pi));
    fflush(stdout);
    fflush(stderr);
    BOOL ok = kspl_win_create_listed(wcmd, flags, cwd_len > 0 ? cwd_path : NULL, std3, &pi);
    /* The child's ends, the parent's opened files and the copies are closed here, started or not. */
    for (int k = 0; k < 3; k++) {
        if (dups[k] != NULL) CloseHandle(dups[k]);
    }
    if (in_r != NULL) CloseHandle(in_r);
    if (out_w != NULL) CloseHandle(out_w);
    if (err_w != NULL) CloseHandle(err_w);
    if (oh != NULL) CloseHandle(oh);
    if (eh != NULL && !one_file) CloseHandle(eh);
    in_r = out_w = err_w = oh = eh = NULL;
    free(wcmd);
    wcmd = NULL;
    if (!ok) goto fail;
    if (job != NULL && (!AssignProcessToJobObject(job, pi.hProcess) ||
            ResumeThread(pi.hThread) == (DWORD)-1)) {
        TerminateProcess(pi.hProcess, 1);
        WaitForSingleObject(pi.hProcess, INFINITE);
        CloseHandle(pi.hThread);
        CloseHandle(pi.hProcess);
        goto fail;
    }
    CloseHandle(pi.hThread);
    h->proc = pi.hProcess; h->to_w = in_w; h->from_w = out_r; h->from_err = err_r;
    h->code = -1; h->reaped = 0; h->out_eof = 0; h->err_eof = 0; h->job = job;
    return (I64)(intptr_t)h;
fail:
    if (kspl_start_error == 0) {
        DWORD e = GetLastError();
        kspl_start_error = e != 0 ? (I32)e : -1;
    }
    if (in_r != NULL) CloseHandle(in_r);
    if (in_w != NULL) CloseHandle(in_w);
    if (out_r != NULL) CloseHandle(out_r);
    if (out_w != NULL) CloseHandle(out_w);
    if (err_r != NULL) CloseHandle(err_r);
    if (err_w != NULL) CloseHandle(err_w);
    if (oh != NULL) CloseHandle(oh);
    if (eh != NULL && !one_file) CloseHandle(eh);
    if (job != NULL) CloseHandle(job);
    free(wcmd);
    free(h);
    return 0;
}
#endif
