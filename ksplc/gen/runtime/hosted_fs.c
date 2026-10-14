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
 * **A read-only file is removed and replaced as on POSIX**, where its own mode does not stop
 * either: Windows refuses both, so its read-only mark is cleared first (kspl_win_writable).
 *
 * A path is copied by kspl_to_cstr (hosted.c) or kspl_path_to_wide, both returning 0 where it
 * does not fit or holds a NUL. Both are static with no KSPL declaration, so their signatures
 * can change without the seed.
 * ============================================================ */

/* Whether a mode is one std/io's open takes: `r`, `w` or `a`, then any of `+` and `b`, and `x`
 * after `w` alone (C11's set).
 * Caution: **Refuse any other letter, on both sides**, so a mode means one thing everywhere:
 * glibc skips a letter it does not know, while Windows reads `t`, `N` and `ccs=` as its own. */
static int kspl_fopen_mode_ok(const char *mode) {
    if (mode[0] != 'r' && mode[0] != 'w' && mode[0] != 'a') return 0;
    for (const char *p = mode + 1; *p != '\0'; p++) {
        if (*p != '+' && *p != 'b' && !(*p == 'x' && mode[0] == 'w')) return 0;
    }
    return 1;
}

/* How much of a file kspl_copy_file holds at a time. */
#define KSPL_COPY_PIECE 65536

#ifndef _WIN32
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h> /* geteuid */

KSPL_LINK I64 kspl_dir_open(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 0;
    DIR *d = opendir(path);
    return d ? (I64)(intptr_t)d : 0;
}

/* Copies the next entry's name into buf and returns the byte count (0 = the enumeration ended,
 * -1 = buf is too short). "." and ".." are skipped here. */
KSPL_LINK I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
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

KSPL_LINK void kspl_dir_close(I64 handle) {
    if (handle == 0) return;
    closedir((DIR *)(intptr_t)handle);
}

/* What stands at a path, following links (for std/fs.kspls's stat): size_out = the byte count,
 * kind_out = `File_kind`'s order (0 a regular file, 1 a directory, 2 anything else: a FIFO, a
 * device, a socket), mtime_out = the modification time (Unix epoch seconds). False where nothing
 * can be read there. */
KSPL_LINK Bool kspl_path_info(const U8 *path_ptr, Sz path_len, I64 *size_out, I32 *kind_out,
    I64 *mtime_out) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return false;
    if (stat(path, &st) != 0) return false;
    *size_out = (I64)st.st_size;
    *kind_out = S_ISREG(st.st_mode) ? 0 : S_ISDIR(st.st_mode) ? 1 : 2;
    *mtime_out = (I64)st.st_mtime;
    return true;
}

/* Whether the owner's execute bit is up (for std/fs.kspls's is_executable).
 * The owner's bit, not access(X_OK), which is nearly always true under root.
 * Caution: It must not be shaped as adding an output argument to kspl_path_info, which std/io.kspls
 * and std/fs.kspls both declare: disagreeing with the seed's old one breaks the bootstrap's link.
 * An addition is always a separate function. */
KSPL_LINK Bool kspl_is_exec(const U8 *path_ptr, Sz path_len) {
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
KSPL_LINK I32 kspl_is_link(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    if (lstat(path, &st) != 0) {
        return (errno == ENOENT || errno == ENOTDIR) ? 0 : -1;
    }
    return S_ISLNK(st.st_mode) ? 1 : 0;
}

/* Copies one file to a name that does not stand yet, with the source's permission bits (for
 * std/fs.kspls's copy_tree): 0 = done, 1 = the source cannot be opened, -1 = refused.
 * **The bits are the copy's from its first byte**: created wider and narrowed afterwards, a private
 * file would stand readable by others while it is written, and for good where the narrowing fails.
 * O_EXCL makes it new, so a link planted at the name is not followed; the umask can only narrow
 * the bits at the creation, and fchmod then gives them exactly. Only a regular file is copied
 * (read, a FIFO would wait for good), a piece at a time, and what fails partway is removed. */
KSPL_LINK I32 kspl_copy_file(const U8 *from_ptr, Sz from_len, const U8 *to_ptr, Sz to_len) {
    char from[4096];
    char to[4096];
    struct stat st;
    int ok = 1;
    if (!kspl_to_cstr(from_ptr, from_len, from, sizeof(from))) return -1;
    if (!kspl_to_cstr(to_ptr, to_len, to, sizeof(to))) return -1;
    int in = open(from, O_RDONLY | O_CLOEXEC);
    if (in < 0) return 1;
    char *buf = (char *)malloc(KSPL_COPY_PIECE);
    if (buf == NULL || fstat(in, &st) != 0 || !S_ISREG(st.st_mode)) {
        free(buf);
        close(in);
        return -1;
    }
    int out = open(to, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, st.st_mode & 0777);
    if (out < 0) {
        free(buf);
        close(in);
        return -1;
    }
    for (;;) {
        ssize_t got = read(in, buf, KSPL_COPY_PIECE);
        if (got < 0 && errno == EINTR) continue;
        if (got <= 0) {
            ok = got == 0;
            break;
        }
        for (ssize_t done = 0; ok && done < got;) {
            ssize_t n = write(out, buf + done, (size_t)(got - done));
            if (n < 0 && errno == EINTR) continue;
            if (n <= 0) ok = 0;
            else done += n;
        }
        if (!ok) break;
    }
    if (ok && fchmod(out, st.st_mode & 07777) != 0) ok = 0;
    if (close(out) != 0) ok = 0;
    close(in);
    free(buf);
    if (!ok) unlink(to);
    return ok ? 0 : -1;
}

KSPL_LINK I32 kspl_mkdir(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    return mkdir(path, 0755);
}

/* Creates a file that did not stand, readable and writable by its owner alone, and writes data
 * into it (for std/fs.kspls's write_unique): 0 = written, 1 = the name is taken, -1 = refused.
 * **O_EXCL decides that it is new**, so a link planted at the name is not followed, and 0600 is
 * the mode from the first byte (a chmod after creating leaves a moment others could open it).
 * What fails partway is removed, so no half-written file stands under the name. */
KSPL_LINK I32 kspl_create_owned(const U8 *path_ptr, Sz path_len, const U8 *data, Sz len) {
    char path[4096];
    Sz done = 0;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    int fd = open(path, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
    if (fd < 0) return errno == EEXIST ? 1 : -1;
    while (done < len) {
        ssize_t n = write(fd, data + done, (size_t)(len - done));
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) {
            close(fd);
            unlink(path);
            return -1;
        }
        done += (Sz)n;
    }
    if (close(fd) != 0) {
        unlink(path);
        return -1;
    }
    return 0;
}

/* Who besides the current user could change what a directory holds (for std/fs.kspls's
 * dir_trust): 0 = no one, 1 = not a directory or unreadable, 2 = another user owns it, 3 = its
 * group or everyone may write it, 4 = not checked here (the Windows side).
 * It follows a link, so a cache folder linked onto another disk is judged by what it reaches. */
KSPL_LINK I32 kspl_dir_trust(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 1;
    if (stat(path, &st) != 0 || !S_ISDIR(st.st_mode)) return 1;
    if (st.st_uid != geteuid()) return 2;
    if ((st.st_mode & (S_IWGRP | S_IWOTH)) != 0) return 3;
    return 0;
}

/* It peeks and turns a directory over to rmdir(), as the Windows side must (see the heading).
 * Caution: **Use lstat, not stat.** stat answers "a directory" for a link to one, rmdir fails with
 * ENOTDIR, and **the link can never be taken off**. */
KSPL_LINK I32 kspl_remove_path(const U8 *path_ptr, Sz path_len) {
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
KSPL_LINK I32 kspl_rename_cstr(const U8 *old_cstr, const U8 *new_cstr) {
    return rename((const char *)old_cstr, (const char *)new_cstr);
}

/* Opens a path, close-on-exec (hosted.c's "Nothing the runtime opens passes to a child
 * unasked"): open() with O_CLOEXEC, then fdopen() on the mode's shape alone.
 * Caution: **Do not add `e` to fopen's mode instead**: macOS's fopen drops the letter in silence.
 * **Nor call `fopen` directly from the KSPL side** (the same reason as kspl_rename_cstr). */
KSPL_LINK void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    const char *mode = (const char *)mode_cstr;
    char shape[3] = {0, 0, 0};
    if (!kspl_fopen_mode_ok(mode)) return NULL;
    int plus = strchr(mode, '+') != NULL;
    int flags = plus ? O_RDWR : (mode[0] == 'r' ? O_RDONLY : O_WRONLY);
    if (mode[0] == 'w') flags |= O_CREAT | O_TRUNC;
    if (mode[0] == 'a') flags |= O_CREAT | O_APPEND;
    if (strchr(mode, 'x') != NULL) flags |= O_EXCL;
    int fd = open((const char *)path_cstr, flags | O_CLOEXEC, 0666);
    if (fd < 0) return NULL;
    shape[0] = mode[0];
    shape[1] = plus ? '+' : '\0';
    FILE *f = fdopen(fd, shape);
    if (f == NULL) close(fd);
    return (void *)f;
}

/* A lock on a file, the handle an fd plus one (0 = failure), for std/fs.kspls's File_lock.
   **flock, not fcntl's lock**: fcntl's goes the moment the process closes any fd on the file, and
 * a second fd in the same process never waits on it. O_CLOEXEC keeps a child from holding it on. */
KSPL_LINK I64 kspl_lock_open(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 0;
    /* O_NOFOLLOW: a link planted at the lock's name would have it create or open another file. */
    int fd = open(path, O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW, 0600);
    return fd < 0 ? 0 : (I64)fd + 1;
}

/* Takes the lock: 0 = held, 1 = another holds it (only where `wait` is 0), -1 = refused. */
KSPL_LINK I32 kspl_lock_take(I64 handle, I32 wait) {
    for (;;) {
        if (flock((int)(handle - 1), LOCK_EX | (wait ? 0 : LOCK_NB)) == 0) return 0;
        if (errno == EINTR) continue;
        return errno == EWOULDBLOCK ? 1 : -1;
    }
}

/* Lets the lock go with the file. */
KSPL_LINK void kspl_lock_close(I64 handle) {
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

KSPL_LINK I64 kspl_dir_open(const U8 *path_ptr, Sz path_len) {
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

KSPL_LINK I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
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

KSPL_LINK void kspl_dir_close(I64 handle) {
    kspl_dir_t *d;
    if (handle == 0) return;
    d = (kspl_dir_t *)(intptr_t)handle;
    FindClose(d->h);
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

/* Windows has no execute bit (the extension settles it); the caller judges. */
KSPL_LINK Bool kspl_is_exec(const U8 *path_ptr, Sz path_len) {
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
 * an opened handle, which means opening it first in order to refuse it ("A path is kept under the
 * root by refusing, not by resolving and comparing" in std/docs/DESIGN.md). */
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

/* The POSIX side's meanings. Windows keeps no permission bits: who may read the copy is the ACL it
 * takes from its folder, as a file kspl_create_owned makes, and what is carried over is the
 * read-only mark, put on once the contents are in (a read-only file takes no writes). CREATE_NEW
 * makes it new, and a directory, which needs FILE_FLAG_BACKUP_SEMANTICS, does not open. */
KSPL_LINK I32 kspl_copy_file(const U8 *from_ptr, Sz from_len, const U8 *to_ptr, Sz to_len) {
    wchar_t from[KSPL_WPATH_CAP];
    wchar_t to[KSPL_WPATH_CAP];
    BY_HANDLE_FILE_INFORMATION info;
    HANDLE in, out;
    char *buf;
    int ok = 1;
    if (!kspl_path_to_wide(from_ptr, from_len, from, KSPL_WPATH_CAP)) return -1;
    if (!kspl_path_to_wide(to_ptr, to_len, to, KSPL_WPATH_CAP)) return -1;
    in = CreateFileW(from, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL, NULL);
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

/* The POSIX side's meanings. **CREATE_NEW decides that it is new.** Who may read it is the ACL it
 * takes from its folder, which this does not set (the reason is at write_unique in
 * std/fs.kspls). No security attributes, so the handle is not inheritable (hosted.c's "Nothing the
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

/* The POSIX side's meanings. A directory is 4, "not checked": who may write it is an ACL, which
 * this does not read. */
KSPL_LINK I32 kspl_dir_trust(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    DWORD attr;
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 1;
    attr = GetFileAttributesW(path);
    if (attr == INVALID_FILE_ATTRIBUTES || (attr & FILE_ATTRIBUTE_DIRECTORY) == 0) return 1;
    return 4;
}

/* Clears the read-only mark where one is set, so a removal or a replacement goes through as on
 * POSIX (the heading); returns the attributes it found, INVALID_FILE_ATTRIBUTES where none. */
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

/* Windows's UCRT remove() is file-only, so a directory goes to _wrmdir().
 * Caution: **Use GetFileAttributesW, not _wstat64**, which follows a link: it fails on **a broken
 * link**, and a link to a directory would go to _wremove and never come off. The link's own
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
    if (MoveFileExW(oldp, newp, MOVEFILE_REPLACE_EXISTING)) return 0;
    kspl_win_restore_attr(newp, attr);
    return -1;
}

/* Opens a path. `N` makes the handle not inheritable (hosted.c's "Nothing the runtime opens
 * passes to a child unasked"); the CRT's default hands it to every child.
 * Caution: **Do not call `fopen` directly from the KSPL side** (the same reason). */
KSPL_LINK void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    wchar_t path[KSPL_WPATH_CAP];
    wchar_t mode[16];
    size_t n;
    if (!kspl_fopen_mode_ok((const char *)mode_cstr)) return NULL;
    if (!kspl_path_to_wide(path_cstr, (Sz)strlen((const char *)path_cstr), path, KSPL_WPATH_CAP)) {
        return NULL;
    }
    if (!kspl_win_cstr_to_wide((const char *)mode_cstr, mode, 15)) return NULL;
    n = wcslen(mode);
    mode[n] = L'N';
    mode[n + 1] = L'\0';
    return (void *)_wfopen(path, mode);
}

/* A lock on a file, the handle a HANDLE (0 = failure), for std/fs.kspls's File_lock.
   Every sharing flag is given, so the file itself is never what blocks: only the lock does. The
 * handle is not inheritable, so a child does not hold it on. */
KSPL_LINK I64 kspl_lock_open(const U8 *path_ptr, Sz path_len) {
    wchar_t path[KSPL_WPATH_CAP];
    if (!kspl_path_to_wide(path_ptr, path_len, path, KSPL_WPATH_CAP)) return 0;
    HANDLE h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE,
                           FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    return h == INVALID_HANDLE_VALUE ? 0 : (I64)(intptr_t)h;
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
