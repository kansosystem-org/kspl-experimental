/* Part of the C runtime for an environment with an OS: the Windows half of hosted_fs.c.
   Caution: **It does not build on its own** — it joins right behind hosted_fs.c, whose
 * shared part it reads, to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
#ifdef _WIN32
#include <windows.h>
#include <sys/stat.h>
#include <direct.h>
#include <fcntl.h> /* _O_BINARY */
#include <io.h> /* _open_osfhandle */
#include <wchar.h>

/* The longest path Win32 takes as it stands, the NUL counted. It is CreateDirectoryW's 248, the
 * lowest of the file functions' limits (MAX_PATH's 260 less room for an 8.3 name). */
#define KSPL_WPATH_LEGACY 248

/* Whether Win32 reads the path as absolute: a drive's `C:\` / `C:/`, or a share's `\\` / `//`. */
static int kspl_wide_is_absolute(const wchar_t *p) {
    if (p[0] != L'\0' && p[1] == L':' && (p[2] == L'\\' || p[2] == L'/')) return 1;
    return (p[0] == L'\\' || p[0] == L'/') && (p[1] == L'\\' || p[1] == L'/');
}

/* Whether it is already in the extended form (`\\?\`) or a device's (`\\.\`, `\??\`). */
static int kspl_wide_is_verbatim(const wchar_t *p) {
    if (p[0] != L'\\') return 0;
    if (p[1] == L'\\') return (p[2] == L'?' || p[2] == L'.') && p[3] == L'\\';
    return p[1] == L'?' && p[2] == L'?' && p[3] == L'\\';
}

/* Copies a path to a UTF-16 NUL terminator (settled by "the two that copy a path" at the head).
 * It uses the extended form (`\\?\C:\...`, `\\?\UNC\server\...`) where it would reach the limit
 * above.
 * The reason the narrow API is not used is in hosted.c's kspl_win_to_wide heading.
 *
 * Caution: **Put every path handed to the OS through here, and nothing that is not a path.** Handed
 * as it stands, a path of 260 or more stops every file function. But clang and lld take it (LLVM
 * widens it itself). So `ksplc run` built from objects it could then neither see, reuse nor delete
 * (measured: 278 characters under a repository in OneDrive). An argument or an environment value
 * must not gain the prefix.
 * Caution: **Resolve it before the prefix goes on.** The extended form turns the OS's reading off:
 * `/` is no separator there, `.` and `..` are names, and a relative path means nothing.
 * GetFullPathNameW does that reading as a string, the way the OS would have for a short path.
 * The form never comes back to the KSPL side (a directory entry is a bare name, and `sys.cwd()`
 * returns what the OS gives). A child's working directory is left out (hosted_spawn_win.c). */
static int kspl_path_to_wide(const U8 *path_ptr, Sz path_len, wchar_t *out, Sz out_cap) {
    wchar_t full[KSPL_WPATH_CAP];
    const wchar_t *prefix;
    const wchar_t *body;
    DWORD n;
    Sz len, prefix_len, body_len;
    if (!kspl_win_to_wide((const char *)path_ptr, path_len, out, out_cap)) return 0;
    len = (Sz)wcslen(out);
    /* Caution: **Turn each `/` after a verbatim prefix into `\`, before any other test.** The OS
     * reads no `/` there as a separator, and std/fs joins with `/`. So `\\?\C:\root/a` names no
     * file. The test for a short absolute path takes this form too, so it comes after. */
    if (kspl_wide_is_verbatim(out)) {
        for (Sz i = 4; i < len; i++) {
            if (out[i] == L'/') out[i] = L'\\';
        }
        return 1;
    }
    if (len + 1 < KSPL_WPATH_LEGACY && kspl_wide_is_absolute(out)) return 1;
    n = GetFullPathNameW(out, (DWORD)KSPL_WPATH_CAP, full, NULL);
    if (n == 0 || (Sz)n >= KSPL_WPATH_CAP) return 0;
    /* A short relative path goes as written: the OS resolves it the same way.
     * Caution: **A long path that resolves short goes resolved.** Win32 measures the path as
     * written, so `C:\root\sub` followed by 3,900 `\` fails though it names `C:\root\sub`. */
    if ((Sz)n + 1 < KSPL_WPATH_LEGACY) {
        if (len + 1 < KSPL_WPATH_LEGACY) return 1;
        if ((Sz)n + 1 > out_cap) return 0;
        memcpy(out, full, (size_t)(n + 1) * sizeof(wchar_t));
        return 1;
    }
    if (full[0] == L'\\' && full[1] == L'\\') {
        prefix = L"\\\\?\\UNC\\";
        body = full + 2;
    } else if (full[0] != L'\0' && full[1] == L':' && full[2] == L'\\') {
        prefix = L"\\\\?\\";
        body = full;
    } else {
        /* No shape the extended form has (GetFullPathNameW answers one of the two above). */
        return 1;
    }
    prefix_len = (Sz)wcslen(prefix);
    body_len = (Sz)wcslen(body);
    if (prefix_len + body_len + 1 > out_cap) return 0;
    memcpy(out, prefix, (size_t)prefix_len * sizeof(wchar_t));
    memcpy(out + prefix_len, body, (size_t)(body_len + 1) * sizeof(wchar_t));
    return 1;
}

typedef struct { HANDLE h; WIN32_FIND_DATAW fd; int first; } kspl_dir_t;

KSPL_LINK I64 kspl_dir_open(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    kspl_dir_t *d;
    Sz n;
     /* FindFirstFileW has to be handed the pattern "<dir>\*".
     * Caution: Give up rather than truncate, or it enumerates another directory as a success. */
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP - 2)) return 0;
    n = (Sz)wcslen(path);
    /* A separator already at the end is not doubled: the extended form reads `\\` as an empty name
     * where a short path would have folded it.
     * Caution: **A bare drive (`C:`) takes none either.** It names that drive's working folder, as
     * `fs.join("C:", n)` gives `C:n` there. With `\\` added, `C:` would list the drive's root. */
    if (n > 0 && path[n - 1] != L'\\' && path[n - 1] != L'/' && !(n == 2 && path[1] == L':')) {
        path[n++] = L'\\';
    }
    path[n] = L'*';
    path[n + 1] = L'\0';

    d = (kspl_dir_t *)malloc(sizeof(kspl_dir_t));
    if (!d) return 0;
    d->first = 1;
    d->h = FindFirstFileW(path, &d->fd);
    if (d->h == INVALID_HANDLE_VALUE) {
        /* Caution: **A folder with no entry at all is a listing of none, not a failure.** The root
         * of an empty drive holds no `.` or `..`, so the pattern matches nothing and the error is
         * ERROR_FILE_NOT_FOUND. Asked of the folder itself, the attributes tell it from a path
         * that is not there. The read then ends at once. */
        DWORD attr;
        if (GetLastError() == ERROR_FILE_NOT_FOUND) {
            path[n] = L'\0';
            attr = GetFileAttributesW(path);
            if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY) != 0) {
                d->first = 0;
                return (I64)(intptr_t)d;
            }
        }
        free(d);
        return 0;
    }
    return (I64)(intptr_t)d;
}

KSPL_LINK I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
    kspl_dir_t *d;
    if (handle == 0) return 0;
    d = (kspl_dir_t *)(intptr_t)handle;
    if (d->h == INVALID_HANDLE_VALUE) return 0; /* a folder with no entry at all */
    for (;;) {
        const wchar_t *name;
        char utf8[KSPL_WPATH_CAP * 3];
        int len;
        /* The same contract as POSIX's: ERROR_NO_MORE_FILES alone is the end. */
        if (!d->first) {
            if (!FindNextFileW(d->h, &d->fd)) return GetLastError() == ERROR_NO_MORE_FILES ? 0 : -1;
        }
        d->first = 0;
        name = d->fd.cFileName;
        if (name[0] == L'.' && (name[1] == L'\0' || (name[1] == L'.' && name[2] == L'\0'))) continue;
        /* Caution: **Put the name back to UTF-8 too**, or a path joined from it holds UTF-16 bytes
         * and points at no file. */
        len = kspl_win_from_wide(name, utf8, (Sz)sizeof(utf8));
        if (len < 0) return -1;
        if ((Sz)len > cap) return -1;
        memcpy(buf, utf8, (size_t)len);
        return (I32)len;
    }
}

KSPL_LINK void kspl_dir_close(I64 handle) {
    kspl_dir_t *d;
    if (handle == 0) return;
    d = (kspl_dir_t *)(intptr_t)handle;
    if (d->h != INVALID_HANDLE_VALUE) FindClose(d->h);
    free(d);
}

/* The POSIX side's meanings; a device (`NUL`, `CON`) is the "anything else". */
KSPL_LINK Bool kspl_path_info(const U8 *path_ptr, Sz path_len, I64 *size_out, I32 *kind_out,
    I64 *mtime_out) {
    wchar_t path[KSPL_WPATH_CAP];
    struct _stat64 st;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return false;
    if (_wstat64(path, &st) != 0) return false;
    *size_out = (I64)st.st_size;
    *kind_out = (st.st_mode & _S_IFMT) == _S_IFREG ? 0 : (st.st_mode & _S_IFMT) == _S_IFDIR ? 1 : 2;
    *mtime_out = (I64)st.st_mtime;
    return true;
}

/* The POSIX side's meaning. The time is kept in 100 ns steps from 1601, so the last two digits
 * are 0. **_wstat64 gives whole seconds only**, so it is read from the attributes.
 * Caution: GetFileAttributesExW does not follow a link. A link's own time is answered. */
KSPL_LINK Bool kspl_path_mtime_ns(const U8 *path_ptr, Sz path_len, I64 *ns_out) {
    wchar_t path[KSPL_WPATH_CAP];
    WIN32_FILE_ATTRIBUTE_DATA data;
    ULARGE_INTEGER ticks;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return false;
    if (!GetFileAttributesExW(path, GetFileExInfoStandard, &data)) return false;
    ticks.LowPart = data.ftLastWriteTime.dwLowDateTime;
    ticks.HighPart = data.ftLastWriteTime.dwHighDateTime;
    /* 116444736000000000 is 1970-01-01 in 100 ns steps from 1601-01-01. */
    *ns_out = ((I64)ticks.QuadPart - (I64)116444736000000000LL) * 100;
    return true;
}

/* Windows has no execute bit (the extension settles it); the caller judges. */
KSPL_LINK Bool kspl_is_exec(const U8 *path_ptr, Sz path_len) {
    (void)path_ptr;
    (void)path_len;
    return false;
}

/* Whether that path itself is a link. The meanings of 1/0/-1 are the same as the POSIX side's.
 * Caution: **Do not settle it by `FILE_ATTRIBUTE_REPARSE_POINT` alone.** OneDrive's and Dropbox's
 * not-yet-downloaded files raise it too. So **under a root inside OneDrive no file could be
 * read**. What is looked at is **a name surrogate** (links and junctions alone). FindFirstFileW's
 * dwReserved0 holds its tag without opening.
 *
 * Caution: **Do not change it to the shape resolving with `GetFinalPathNameByHandleW`.** That needs
 * an opened handle. It would mean opening it first in order to refuse it ("A path stays under the
 * root by refusal, not comparison" in std/docs/DESIGN-system.md). */
#ifndef IO_REPARSE_TAG_NAME_SURROGATE_BIT
#define IO_REPARSE_TAG_NAME_SURROGATE_BIT 0x20000000UL
#endif
KSPL_LINK I32 kspl_is_link(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    WIN32_FIND_DATAW fd;
    HANDLE h;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    attr = GetFileAttributesW(path);
    if (attr == INVALID_FILE_ATTRIBUTES) {
        DWORD e = GetLastError();
        return (e == ERROR_FILE_NOT_FOUND || e == ERROR_PATH_NOT_FOUND) ? 0 : -1;
    }
    if (!(attr & FILE_ATTRIBUTE_REPARSE_POINT)) return 0;
    h = FindFirstFileW(path, &fd);
    if (h == INVALID_HANDLE_VALUE) return -1;
    FindClose(h);
    return (fd.dwReserved0 & IO_REPARSE_TAG_NAME_SURROGATE_BIT) ? 1 : 0;
}

/* The POSIX side's meanings. **A short name (`GIT~1` for `.git`) gives its long name**, which
 * FindFirstFileW reports for the entry whatever name found it. **Every byte the directory search
 * reads as a wildcard is refused**: `*` and `?`, and the DOS forms `<`, `>` and `"`, which the NT
 * search matches like `*`, `?` and `.`. Each would match other names, and another entry's name
 * would come back. No file name may hold one of them. */
KSPL_LINK I32 kspl_long_name(const U8 *path_ptr, Sz path_len, U8 *buf, Sz cap) {
    static const char wildcards[] = "*?<>\"";
    wchar_t path[KSPL_WPATH_CAP];
    WIN32_FIND_DATAW fd;
    char utf8[MAX_PATH * 3 + 1];
    HANDLE h;
    int len;
    for (Sz i = 0; i < path_len; i++) {
        if (memchr(wildcards, path_ptr[i], sizeof(wildcards) - 1) != NULL) return -1;
    }
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    h = FindFirstFileW(path, &fd);
    if (h == INVALID_HANDLE_VALUE) return -1;
    FindClose(h);
    len = kspl_win_from_wide(fd.cFileName, utf8, (Sz)sizeof(utf8));
    if (len < 0 || (Sz)len > cap) return -1;
    memcpy(buf, utf8, (size_t)len);
    return (I32)len;
}

/* The POSIX side's meanings. Windows keeps no permission bits. Who can read the copy is the ACL it
 * takes from its folder, as a file kspl_create_owned makes. What is carried over is the read-only
 * mark, put on once the contents are in (a read-only file takes no writes). CREATE_NEW makes it
 * new. A directory, which needs FILE_FLAG_BACKUP_SEMANTICS, does not open. */
KSPL_LINK I32 kspl_copy_file(const U8 *from_ptr, Sz from_len, const U8 *to_ptr, Sz to_len) {
    wchar_t from[KSPL_WPATH_CAP];
    wchar_t to[KSPL_WPATH_CAP];
    BY_HANDLE_FILE_INFORMATION info;
    HANDLE in, out;
    char *buf;
    int ok = 1;
    if (!kspl_path_to_wide(from_ptr, from_len, from, KSPL_WPATH_CAP)) return -1;
    if (!kspl_path_to_wide(to_ptr, to_len, to, KSPL_WPATH_CAP)) return -1;
    in = CreateFileW(from, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (in == INVALID_HANDLE_VALUE) return 1;
    buf = (char *)malloc(KSPL_COPY_PIECE);
    if (buf == NULL || !GetFileInformationByHandle(in, &info) || GetFileType(in) != FILE_TYPE_DISK) {
        free(buf);
        CloseHandle(in);
        return -1;
    }
    out = CreateFileW(to, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (out == INVALID_HANDLE_VALUE) {
        free(buf);
        CloseHandle(in);
        return -1;
    }
    for (;;) {
        DWORD got = 0;
        if (!ReadFile(in, buf, (DWORD)KSPL_COPY_PIECE, &got, NULL)) ok = 0;
        if (!ok || got == 0) break;
        for (DWORD done = 0; ok && done < got;) {
            DWORD n = 0;
            if (!WriteFile(out, buf + done, got - done, &n, NULL) || n == 0) ok = 0;
            done += n;
        }
        if (!ok) break;
    }
    if (!CloseHandle(out)) ok = 0;
    CloseHandle(in);
    free(buf);
    if (ok && (info.dwFileAttributes & FILE_ATTRIBUTE_READONLY) != 0 &&
        !SetFileAttributesW(to, FILE_ATTRIBUTE_READONLY)) {
        ok = 0;
    }
    if (!ok) DeleteFileW(to);
    return ok ? 0 : -1;
}

KSPL_LINK I32 kspl_mkdir(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    return _wmkdir(path);
}

/* The POSIX side's meanings. **CREATE_NEW decides that it is new.** Who can read it is the ACL it
 * takes from its folder, which this does not set (the reason is at write_unique in
 * std/fs.kspl). No security attributes, so the handle is not inheritable (hosted.c's "Nothing the
 * runtime opens passes to a child unasked"), as O_CLOEXEC on the POSIX side. */
KSPL_LINK I32 kspl_create_owned(const U8 *path_ptr, Sz path_len, const U8 *data, Sz len) {
    wchar_t path[KSPL_WPATH_CAP];
    HANDLE h;
    Sz done = 0;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    h = CreateFileW(path, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return GetLastError() == ERROR_FILE_EXISTS ? 1 : -1;
    while (done < len) {
        DWORD step = (len - done) > 0x40000000 ? 0x40000000 : (DWORD)(len - done);
        DWORD n = 0;
        if (!WriteFile(h, data + done, step, &n, NULL) || n == 0) {
            CloseHandle(h);
            DeleteFileW(path);
            return -1;
        }
        done += (Sz)n;
    }
    if (!CloseHandle(h)) {
        DeleteFileW(path);
        return -1;
    }
    return 0;
}

/* The POSIX side's meanings. A directory is 4, "not checked": who can write it is an ACL, which
 * this does not read. */
KSPL_LINK I32 kspl_dir_trust(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 1;
    attr = GetFileAttributesW(path);
    if (attr == INVALID_FILE_ATTRIBUTES || (attr & FILE_ATTRIBUTE_DIRECTORY) == 0) return 1;
    return 4;
}

/* The POSIX side's meanings. A regular file is 4, "not checked", for the reason above. */
KSPL_LINK I32 kspl_secret_trust(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 1;
    attr = GetFileAttributesW(path);
    if (attr == INVALID_FILE_ATTRIBUTES || (attr & FILE_ATTRIBUTE_DIRECTORY) != 0) return 1;
    return 4;
}

/* Clears the read-only mark where one is set, so a removal or a replacement goes through as on
 * POSIX (the heading). Returns the attributes it found, INVALID_FILE_ATTRIBUTES where none. */
static DWORD kspl_win_writable(const wchar_t *path) {
    DWORD attr = GetFileAttributesW(path);
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_READONLY) != 0) {
        SetFileAttributesW(path, attr & ~(DWORD)FILE_ATTRIBUTE_READONLY);
    }
    return attr;
}

/* Puts back what kspl_win_writable cleared, where the operation then failed. */
static void kspl_win_restore_attr(const wchar_t *path, DWORD attr) {
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_READONLY) != 0) {
        SetFileAttributesW(path, attr);
    }
}

/* How many times, and how many milliseconds apart, a rename is tried again (kspl_win_move). */
#define KSPL_MOVE_TRIES 5
#define KSPL_MOVE_PAUSE_MS 50

/* MoveFileExW, tried again a few times where another process holds the file for a moment.
 * **A virus scanner or a search indexer opens a new file to read it**, often without
 * FILE_SHARE_DELETE, so a rename fails with a sharing or access error for a few milliseconds. Any
 * other error, and a hold that lasts, fails as before. `ksplc run` tries a start again on the
 * same three errors (held_by_another_on in ksplc/tools/run_start.kspl). */
static BOOL kspl_win_move(const wchar_t *from, const wchar_t *to, DWORD flags) {
    for (int i = 0;; i++) {
        if (MoveFileExW(from, to, flags)) return TRUE;
        DWORD e = GetLastError();
        if (i + 1 >= KSPL_MOVE_TRIES || (e != ERROR_SHARING_VIOLATION && e != ERROR_ACCESS_DENIED &&
            e != ERROR_LOCK_VIOLATION)) {
            return FALSE;
        }
        Sleep(KSPL_MOVE_PAUSE_MS);
    }
}

/* The POSIX side's meanings. FlushFileBuffers needs the stream opened for writing. */
KSPL_LINK I32 kspl_stream_sync_disk(void *stream) {
    FILE *f = (FILE *)stream;
    if (fflush(f) != 0 || ferror(f)) return -1;
    HANDLE h = (HANDLE)_get_osfhandle(_fileno(f));
    if (h == INVALID_HANDLE_VALUE) return -1;
    return FlushFileBuffers(h) ? 0 : -1;
}

/* The POSIX side's meanings, with no folder to sync. FlushFileBuffers puts the part on the disk,
 * and MOVEFILE_WRITE_THROUGH returns once the rename is on it. Who can read the file is the ACL it
 * takes from its folder under either rule (the reason is at write_unique in std/fs.kspl). `kept`
 * carries the replaced file's read-only mark, put on once the contents are in. */
KSPL_LINK I32 kspl_replace_file(const U8 *part_ptr, Sz part_len, const U8 *path_ptr, Sz path_len,
    const U8 *data, Sz len, I32 owner_only) {
    wchar_t part[KSPL_WPATH_CAP];
    wchar_t path[KSPL_WPATH_CAP];
    HANDLE h;
    Sz done = 0;
    int ok = 1;
    if (!kspl_path_to_wide(part_ptr, part_len, part, KSPL_WPATH_CAP)) return -1;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    DWORD had = owner_only ? INVALID_FILE_ATTRIBUTES : GetFileAttributesW(path);
    h = CreateFileW(part, GENERIC_WRITE, 0, NULL, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return GetLastError() == ERROR_FILE_EXISTS ? 1 : -1;
    while (ok && done < len) {
        DWORD step = (len - done) > 0x40000000 ? 0x40000000 : (DWORD)(len - done);
        DWORD n = 0;
        if (!WriteFile(h, data + done, step, &n, NULL) || n == 0) ok = 0;
        done += (Sz)n;
    }
    if (ok && !FlushFileBuffers(h)) ok = 0;
    if (!CloseHandle(h)) ok = 0;
    if (ok && had != INVALID_FILE_ATTRIBUTES && (had & FILE_ATTRIBUTE_READONLY) != 0 &&
        !SetFileAttributesW(part, FILE_ATTRIBUTE_READONLY)) {
        ok = 0;
    }
    if (ok) {
        DWORD attr = kspl_win_writable(path);
        if (!kspl_win_move(part, path, MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
            kspl_win_restore_attr(path, attr);
            ok = 0;
        }
    }
    if (!ok) {
        SetFileAttributesW(part, FILE_ATTRIBUTE_NORMAL);
        DeleteFileW(part);
        return -1;
    }
    return 0;
}

/* Windows's UCRT remove() is file-only, so a directory goes to _wrmdir().
 * Caution: **Use GetFileAttributesW, not _wstat64**, which follows a link. _wstat64 fails on **a
 * broken link**, and a link to a directory would go to _wremove and never come off. The link's own
 * attributes carry FILE_ATTRIBUTE_DIRECTORY for a directory link, which RemoveDirectoryW removes
 * (as lstat on the POSIX side). */
KSPL_LINK I32 kspl_remove_path(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    int r;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    attr = kspl_win_writable(path);
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY)) {
        r = _wrmdir(path);
    } else {
        r = _wremove(path);
    }
    if (r != 0) kspl_win_restore_attr(path, attr);
    return r;
}

/* Renames.
   Caution: **Do not use `_wrename`**, which fails with EEXIST (the heading says why that breaks).
 * **Nor ANSI C's rename() from the KSPL side**: narrow, it reads a non-ASCII path as the current
 * code page. It takes NUL-terminated paths and returns 0 for success, as on POSIX (MoveFileExW's
 * success is non-zero). */

KSPL_LINK I32 kspl_rename_cstr(const U8 *old_cstr, const U8 *new_cstr) {
    wchar_t oldp[KSPL_WPATH_CAP];
    wchar_t newp[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(old_cstr, (Sz)strlen((const char *)old_cstr), oldp, KSPL_WPATH_CAP)) {
        return -1;
    }
    if (!kspl_path_to_wide(new_cstr, (Sz)strlen((const char *)new_cstr), newp, KSPL_WPATH_CAP)) {
        return -1;
    }
    DWORD attr = kspl_win_writable(newp);
    if (kspl_win_move(oldp, newp, MOVEFILE_REPLACE_EXISTING)) return 0;
    kspl_win_restore_attr(newp, attr);
    return -1;
}

/* Opens a path, with the POSIX side's meanings for the mode.
 * **Always binary**: in text mode the CRT stops a read at byte 0x1A and turns `\n` into `\r\n`
 * on a write, so the bytes would differ from what POSIX reads and writes.
 * **Every sharing flag is given**, as POSIX has no sharing modes. Without FILE_SHARE_DELETE, a
 * reader holding the file would make a rename or a removal over it fail (`fs.replace_file`). No
 * security attributes, so the handle is not inheritable (hosted.c's "Nothing the runtime opens
 * passes to a child unasked"); the CRT's `fopen` hands it to every child.
 * Caution: **Do not call `fopen` directly from the KSPL side** (the same reason). */
KSPL_LINK void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    wchar_t path[KSPL_WPATH_CAP];
    const char *mode = (const char *)mode_cstr;
    char shape[4] = {0, 0, 0, 0};
    DWORD access, creation;
    int plus, fd, osflags;
    HANDLE h;
    FILE *f;
    I32 plan = kspl_fopen_plan(mode_cstr);
    if (plan < 0) return NULL;
    if (!kspl_path_to_wide(path_cstr, (Sz)strlen((const char *)path_cstr), path, KSPL_WPATH_CAP)) {
        return NULL;
    }
    plus = (plan & KSPL_OPEN_READ) != 0 && (plan & KSPL_OPEN_WRITE) != 0; /* only from a `+` */
    access = ((plan & KSPL_OPEN_READ) != 0 ? GENERIC_READ : 0) |
        ((plan & KSPL_OPEN_WRITE) != 0 ? GENERIC_WRITE : 0);
    if ((plan & KSPL_OPEN_NEW) != 0) creation = CREATE_NEW;
    else if ((plan & KSPL_OPEN_TRUNCATE) != 0) creation = CREATE_ALWAYS;
    else if ((plan & KSPL_OPEN_CREATE) != 0) creation = OPEN_ALWAYS;
    else creation = OPEN_EXISTING;
    h = CreateFileW(path, access, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
        creation, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return NULL;
    osflags = plus ? 0 : ((plan & KSPL_OPEN_READ) != 0 ? _O_RDONLY : 0);
    if ((plan & KSPL_OPEN_APPEND) != 0) osflags |= _O_APPEND;
    fd = _open_osfhandle((intptr_t)h, osflags | _O_BINARY);
    if (fd < 0) {
        CloseHandle(h);
        return NULL;
    }
    shape[0] = mode[0];
    shape[1] = plus ? '+' : 'b';
    shape[2] = plus ? 'b' : '\0';
    f = _fdopen(fd, shape);
    if (f == NULL) _close(fd);
    return (void *)f;
}

/* A lock on a file, the handle a HANDLE (0 = failure), for std/fs.kspl's File_lock.
   Every sharing flag is given, so the file itself is never what blocks: only the lock does. The
 * handle is not inheritable, so a child does not hold it on.
 * **A link at the lock's name is opened as itself and refused**, as O_NOFOLLOW on the POSIX side.
 * Followed, a link planted there would have the lock create or open another file.
 * Caution: **Refuse by the name-surrogate tag, not the reparse attribute alone**, as kspl_is_link
 * does: a OneDrive file not yet downloaded carries the attribute too. A tag that cannot be read
 * is refused. */
KSPL_LINK I64 kspl_lock_open(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    FILE_ATTRIBUTE_TAG_INFO tag;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 0;
    HANDLE h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE,
                           FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, NULL);
    if (h == INVALID_HANDLE_VALUE) return 0;
    if (!GetFileInformationByHandleEx(h, FileAttributeTagInfo, &tag, sizeof(tag)) ||
        ((tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 &&
         IsReparseTagNameSurrogate(tag.ReparseTag))) {
        CloseHandle(h);
        return 0;
    }
    return (I64)(intptr_t)h;
}

/* Takes the lock on the first byte: 0 = held, 1 = another holds it (only where `wait` is 0),
 * -1 = refused. A byte past the end can be locked, so the file stays empty. */
KSPL_LINK I32 kspl_lock_take(I64 handle, I32 wait) {
    OVERLAPPED ov;
    memset(&ov, 0, sizeof(ov));
    DWORD flags = LOCKFILE_EXCLUSIVE_LOCK | (wait ? 0 : LOCKFILE_FAIL_IMMEDIATELY);
    if (LockFileEx((HANDLE)(intptr_t)handle, flags, 0, 1, 0, &ov)) return 0;
    return GetLastError() == ERROR_LOCK_VIOLATION ? 1 : -1;
}

/* Lets the lock go with the file. */
KSPL_LINK void kspl_lock_close(I64 handle) {
    CloseHandle((HANDLE)(intptr_t)handle);
}
#endif
