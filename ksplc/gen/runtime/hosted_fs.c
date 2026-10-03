/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * The filesystem's extension primitives (for std/fs.kspls). Enumeration and metadata differ
 * wholly between POSIX (opendir/readdir, stat) and Windows (FindFirstFileW/FindNextFileW,
 * _wstat64), so like kspl_proc_* a handle is opaque in an I64. Where the destination exists,
 * POSIX's rename() replaces it but Windows UCRT's fails with EEXIST.
 * **That breaks "write to another name and then replace"**: from the second time on it quietly
 * cannot write. So Windows uses MoveFileExW(MOVEFILE_REPLACE_EXISTING).
 * Caution: **Do not attach MOVEFILE_COPY_ALLOWED.** POSIX's rename() fails with EXDEV across
 * volumes, so it would split the answer the other way (and a copy is not indivisible).
 * One difference is left: POSIX renames a directory over an empty one, MoveFileExW fails; every
 * caller replaces files. Windows's remove() is file-only, so kspl_remove_path stats and turns a
 * directory over to rmdir() / _wrmdir().
 *
 * A path is copied by kspl_to_cstr (hosted.c) or kspl_path_to_wide, both returning 0 where it
 * does not fit or holds a NUL. Both are static with no KSPL declaration, so their signatures
 * can change without the seed.
 * ============================================================ */
#ifndef _WIN32
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>

I64 kspl_dir_open(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 0;
    DIR *d = opendir(path);
    return d ? (I64)(intptr_t)d : 0;
}

/* Copies the next entry's name into buf and returns the byte count (0 = the enumeration ended,
 * -1 = buf is too short). "." and ".." are skipped here. */
I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
    if (handle == 0) return 0;
    DIR *d = (DIR *)(intptr_t)handle;
    for (;;) {
        struct dirent *e = readdir(d);
        if (e == NULL) return 0;
        if (e->d_name[0] == '.' &&
            (e->d_name[1] == '\0' || (e->d_name[1] == '.' && e->d_name[2] == '\0'))) {
            continue;
        }
        size_t len = strlen(e->d_name);
        if (len > (size_t)cap) return -1;
        memcpy(buf, e->d_name, len);
        return (I32)len;
    }
}

void kspl_dir_close(I64 handle) {
    if (handle == 0) return;
    closedir((DIR *)(intptr_t)handle);
}

/* size_out = the byte count, is_dir_out = 1 for a directory, mtime_out = the modification time
 * (Unix epoch seconds). Returns false on failure (a path that does not exist, and so on). */
Bool kspl_stat(const U8 *path_ptr, Sz path_len, I64 *size_out, I32 *is_dir_out, I64 *mtime_out) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return false;
    struct stat st;
    if (stat(path, &st) != 0) return false;
    * size_out = (I64)st.st_size;
    * is_dir_out = S_ISDIR(st.st_mode) ? 1 : 0;
    * mtime_out = (I64)st.st_mtime;
    return true;
}

/* Whether the owner's execute bit is up (for std/fs.kspls's is_executable).
 * The owner's bit, not access(X_OK), which is nearly always true under root.
 * Caution: It must not be shaped as adding an output argument to kspl_stat. kspl_stat is declared
 * in both the preamble (hosted.c) and std/fs.kspls, and disagreeing with the seed's old one breaks
 * the bootstrap's link. An addition is always a separate function. */
Bool kspl_is_exec(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return false;
    struct stat st;
    if (stat(path, &st) != 0) return false;
    return (st.st_mode & S_IXUSR) ? 1 : 0;
}

/* Whether that path itself is a symbolic link. 1 = a link, 0 = not a link, -1 = unknown.
 * **Use lstat, not stat**, which follows the link and answers "not a link".
 * Caution: **Do not mix -1 with 0.** A step that could not be peeked passing as "not a link" opens
 * a road out of the root; refusing is the caller's part (has_link_on_path in std/fs.kspls).
 * A path that is not there is 0 (the function that creates one comes through here). */
I32 kspl_is_link(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    if (lstat(path, &st) != 0) {
        return (errno == ENOENT || errno == ENOTDIR) ? 0 : -1;
    }
    return S_ISLNK(st.st_mode) ? 1 : 0;
}

I32 kspl_mkdir(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    return mkdir(path, 0755);
}

/* It peeks and turns a directory over to rmdir(), as the Windows side must (see the heading).
 * Caution: **Use lstat, not stat.** stat answers "a directory" for a link to one, rmdir fails with
 * ENOTDIR, and **the link can never be taken off**. */
I32 kspl_remove_path(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    struct stat st;
    if (lstat(path, &st) == 0 && S_ISDIR(st.st_mode)) {
        return rmdir(path);
    }
    return remove(path);
}

/* Renames. On POSIX it is rename() as it is.
   Caution: **The wide API is needed here** — Windows breaks a non-ASCII path outside the wide API,
 * so libc called from the KSPL side breaks there alone (hosted.c's kspl_win_to_wide heading). */
I32 kspl_rename_cstr(const U8 *old_cstr, const U8 *new_cstr) {
    return rename((const char *)old_cstr, (const char *)new_cstr);
}

/* Opens a path.
   Caution: **Do not call `fopen` directly from the KSPL side** (the same reason). */
void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    return (void *)fopen((const char *)path_cstr, (const char *)mode_cstr);
}

/* A lock on a file, the handle an fd plus one (0 = failure), for std/fs.kspls's File_lock.
   **flock, not fcntl's lock**: fcntl's goes the moment the process closes any fd on the file, and
 * a second fd in the same process never waits on it. O_CLOEXEC keeps a child from holding it on. */
I64 kspl_lock_open(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 0;
    int fd = open(path, O_RDWR | O_CREAT | O_CLOEXEC, 0644);
    return fd < 0 ? 0 : (I64)fd + 1;
}

/* Takes the lock: 0 = held, 1 = another holds it (only where `wait` is 0), -1 = refused. */
I32 kspl_lock_take(I64 handle, I32 wait) {
    for (;;) {
        if (flock((int)(handle - 1), LOCK_EX | (wait ? 0 : LOCK_NB)) == 0) return 0;
        if (errno == EINTR) continue;
        return errno == EWOULDBLOCK ? 1 : -1;
    }
}

/* Lets the lock go with the file. */
void kspl_lock_close(I64 handle) {
    close((int)(handle - 1));
}
#else
#include <windows.h>
#include <sys/stat.h>
#include <direct.h>
#include <wchar.h>

/* The longest path Win32 takes as it stands, the NUL counted: CreateDirectoryW's 248, the lowest of
 * the file functions' limits (MAX_PATH's 260 less room for an 8.3 name). */
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

/* Copies a path to a UTF-16 NUL terminator (settled by "the two that copy a path" at the head),
 * in the extended form (`\\?\C:\...`, `\\?\UNC\server\...`) where it would reach the limit above.
 * The reason the narrow API is not used is in hosted.c's kspl_win_to_wide heading.
 *
 * Caution: **Put every path handed to the OS through here, and nothing that is not a path.** Handed
 * as it stands, a path of 260 or more stops every file function while clang and lld take it (LLVM
 * widens it itself), so `ksplc run` built from objects it could then neither see, reuse nor delete
 * (measured: 278 characters under a repository in OneDrive). An argument or an environment value
 * must not gain the prefix.
 * Caution: **Resolve it before the prefix goes on.** The extended form turns the OS's reading off:
 * `/` is no separator there, `.` and `..` are names, and a relative path means nothing.
 * GetFullPathNameW does that reading as a string, the way the OS would have for a short path.
 * The form never comes back to the KSPL side (a directory entry is a bare name, and `sys.cwd()`
 * returns what the OS gives). A child's working directory is left out (hosted_spawn.c). */
static int kspl_path_to_wide(const U8 *path_ptr, Sz path_len, wchar_t *out, Sz out_cap) {
    wchar_t full[KSPL_WPATH_CAP];
    const wchar_t *prefix;
    const wchar_t *body;
    DWORD n;
    Sz len, prefix_len, body_len;
    if (!kspl_win_to_wide((const char *)path_ptr, path_len, out, out_cap)) return 0;
    len = (Sz)wcslen(out);
    if (len + 1 < KSPL_WPATH_LEGACY && kspl_wide_is_absolute(out)) return 1;
    if (kspl_wide_is_verbatim(out)) return 1;
    n = GetFullPathNameW(out, (DWORD)KSPL_WPATH_CAP, full, NULL);
    if (n == 0 || (Sz)n >= KSPL_WPATH_CAP) return 0;
    /* A relative path that resolves short goes as written: the OS resolves it the same way. */
    if ((Sz)n + 1 < KSPL_WPATH_LEGACY) return 1;
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

I64 kspl_dir_open(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    kspl_dir_t *d;
    Sz n;
     /* FindFirstFileW has to be handed the pattern "<dir>\*".
     * Caution: Give up rather than truncate, or it enumerates another directory as a success. */
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP - 2)) return 0;
    n = (Sz)wcslen(path);
    /* A separator already at the end is not doubled: the extended form reads `\\` as an empty name
     * where a short path would have folded it. */
    if (n > 0 && path[n - 1] != L'\\' && path[n - 1] != L'/') path[n++] = L'\\';
    path[n] = L'*';
    path[n + 1] = L'\0';

    d = (kspl_dir_t *)malloc(sizeof(kspl_dir_t));
    if (!d) return 0;
    d->first = 1;
    d->h = FindFirstFileW(path, &d->fd);
    if (d->h == INVALID_HANDLE_VALUE) {
        free(d);
        return 0;
    }
    return (I64)(intptr_t)d;
}

I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
    kspl_dir_t *d;
    if (handle == 0) return 0;
    d = (kspl_dir_t *)(intptr_t)handle;
    for (;;) {
        const wchar_t *name;
        char utf8[KSPL_WPATH_CAP * 3];
        int len;
        if (!d->first) {
            if (!FindNextFileW(d->h, &d->fd)) return 0;
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

void kspl_dir_close(I64 handle) {
    kspl_dir_t *d;
    if (handle == 0) return;
    d = (kspl_dir_t *)(intptr_t)handle;
    FindClose(d->h);
    free(d);
}

Bool kspl_stat(const U8 *path_ptr, Sz path_len, I64 *size_out, I32 *is_dir_out, I64 *mtime_out) {
    wchar_t path[KSPL_WPATH_CAP];
    struct _stat64 st;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return false;
    if (_wstat64(path, &st) != 0) return false;
    * size_out = (I64)st.st_size;
    * is_dir_out = (st.st_mode & _S_IFDIR) ? 1 : 0;
    * mtime_out = (I64)st.st_mtime;
    return true;
}

/* Windows has no execute bit (the extension settles it); the caller judges. */
Bool kspl_is_exec(const U8 *path_ptr, Sz path_len) {
    (void)path_ptr;
    (void)path_len;
    return false;
}

/* Whether that path itself is a link. The meanings of 1/0/-1 are the same as the POSIX side's.
 * Caution: **Do not settle it by `FILE_ATTRIBUTE_REPARSE_POINT` alone.** OneDrive's and Dropbox's
 * not-yet-downloaded files raise it too, so **under a root inside OneDrive no file could be
 * read**. What is looked at is **a name surrogate** (links and junctions alone), whose tag
 * FindFirstFileW's dwReserved0 holds without opening.
 *
 * Caution: **Do not change it to the shape resolving with `GetFinalPathNameByHandleW`.** That needs
 * an opened handle, which means opening it first in order to refuse it ("Keeping things under the
 * root is \"refuse\"" in std/docs/DESIGN.md). */
#ifndef IO_REPARSE_TAG_NAME_SURROGATE_BIT
#define IO_REPARSE_TAG_NAME_SURROGATE_BIT 0x20000000UL
#endif
I32 kspl_is_link(const U8 *path_ptr, Sz path_len) {
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

I32 kspl_mkdir(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    return _wmkdir(path);
}

/* Windows's UCRT remove() is file-only, so a directory goes to _wrmdir().
 * Caution: **Use GetFileAttributesW, not _wstat64**, which follows a link: it fails on **a broken
 * link**, and a link to a directory would go to _wremove and never come off. The link's own
 * attributes carry FILE_ATTRIBUTE_DIRECTORY for a directory link, which RemoveDirectoryW removes
 * (as lstat on the POSIX side). */
I32 kspl_remove_path(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return -1;
    attr = GetFileAttributesW(path);
    if (attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY)) {
        return _wrmdir(path);
    }
    return _wremove(path);
}

/* Renames.
   Caution: **Do not use `_wrename`**, which fails with EEXIST (the heading says why that breaks).
 * **Nor ANSI C's rename() from the KSPL side**: narrow, it reads a non-ASCII path as the current
 * code page. It takes NUL-terminated paths and returns 0 for success, as on POSIX (MoveFileExW's
 * success is non-zero). */

I32 kspl_rename_cstr(const U8 *old_cstr, const U8 *new_cstr) {
    wchar_t oldp[KSPL_WPATH_CAP];
    wchar_t newp[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(old_cstr, (Sz)strlen((const char *)old_cstr), oldp, KSPL_WPATH_CAP)) {
        return -1;
    }
    if (!kspl_path_to_wide(new_cstr, (Sz)strlen((const char *)new_cstr), newp, KSPL_WPATH_CAP)) {
        return -1;
    }
    return MoveFileExW(oldp, newp, MOVEFILE_REPLACE_EXISTING) ? 0 : -1;
}

/* Opens a path.
   Caution: **Do not call `fopen` directly from the KSPL side** (the same reason). */
void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    wchar_t path[KSPL_WPATH_CAP];
    wchar_t mode[16];
    if (!kspl_path_to_wide(path_cstr, (Sz)strlen((const char *)path_cstr), path, KSPL_WPATH_CAP)) {
        return NULL;
    }
    if (!kspl_win_cstr_to_wide((const char *)mode_cstr, mode, 16)) return NULL;
    return (void *)_wfopen(path, mode);
}

/* A lock on a file, the handle a HANDLE (0 = failure), for std/fs.kspls's File_lock.
   Every sharing flag is given, so the file itself is never what blocks: only the lock does. The
 * handle is not inheritable, so a child does not hold it on. */
I64 kspl_lock_open(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 0;
    HANDLE h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE,
                           FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    return h == INVALID_HANDLE_VALUE ? 0 : (I64)(intptr_t)h;
}

/* Takes the lock on the first byte: 0 = held, 1 = another holds it (only where `wait` is 0),
 * -1 = refused. A byte past the end can be locked, so the file stays empty. */
I32 kspl_lock_take(I64 handle, I32 wait) {
    OVERLAPPED ov;
    memset(&ov, 0, sizeof(ov));
    DWORD flags = LOCKFILE_EXCLUSIVE_LOCK | (wait ? 0 : LOCKFILE_FAIL_IMMEDIATELY);
    if (LockFileEx((HANDLE)(intptr_t)handle, flags, 0, 1, 0, &ov)) return 0;
    return GetLastError() == ERROR_LOCK_VIOLATION ? 1 : -1;
}

/* Lets the lock go with the file. */
void kspl_lock_close(I64 handle) {
    CloseHandle((HANDLE)(intptr_t)handle);
}
#endif
