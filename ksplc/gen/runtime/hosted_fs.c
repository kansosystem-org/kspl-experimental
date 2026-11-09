/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
/* ============================================================
 * The filesystem's extension primitives (for std/fs.kspl). Enumeration and metadata differ
 * wholly between POSIX (opendir/readdir, stat) and Windows (FindFirstFileW/FindNextFileW,
 * _wstat64). So, like kspl_proc_*, a handle is opaque in an I64. Where the destination exists,
 * POSIX's rename() replaces it, but Windows UCRT's fails with EEXIST.
 * **That breaks "write to another name and then replace"**: from the second time on it quietly
 * cannot write. So Windows uses MoveFileExW(MOVEFILE_REPLACE_EXISTING).
 * Caution: **Do not attach MOVEFILE_COPY_ALLOWED.** POSIX's rename() fails with EXDEV across
 * volumes, so it would split the answer the other way (and a copy is not indivisible).
 * One difference is left: POSIX renames a directory over an empty one, MoveFileExW fails. Every
 * caller replaces files. Windows's remove() is file-only. So kspl_remove_path stats and turns a
 * directory over to rmdir() / _wrmdir().
 * **A read-only file is removed and replaced as on POSIX**, where its own mode does not stop
 * either. Windows refuses both, so its read-only mark is cleared first (kspl_win_writable).
 *
 * A path is copied by kspl_to_cstr (hosted.c) or kspl_path_to_wide. Both return 0 where it
 * does not fit or holds a NUL. Both are static with no KSPL declaration, so their signatures
 * can change without the seed.
 * ============================================================ */

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

/* Copies the next entry's name into buf and returns the byte count. 0 = the enumeration ended.
 * -1 = the next name cannot be handed back: buf is too short, or the directory cannot be read.
 * "." and ".." are skipped here.
 * Caution: **Clear errno before readdir.** Its NULL means both the end and a failure (EIO, a
 * directory removed while it is read). Only errno tells them apart. Without it, a failure would
 * end a listing cut short as if it were whole. */
KSPL_LINK I32 kspl_dir_read(I64 handle, U8 *buf, Sz cap) {
    if (handle == 0) return 0;
    DIR *d = (DIR *)(intptr_t)handle;
    for (;;) {
        errno = 0;
        struct dirent *e = readdir(d);
        if (e == NULL) return errno == 0 ? 0 : -1;
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

/* What stands at a path, following links (for std/fs.kspl's stat).
 *   size_out = the byte count.
 *   kind_out = `File_kind`'s order (0 a regular file, 1 a directory, 2 anything else: a FIFO, a
 *     device, a socket).
 *   mtime_out = the modification time (Unix epoch seconds).
 * False where nothing can be read there. */
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

/* The modification time in nanoseconds since the Unix epoch, following links (for std/fs.kspl's
 * mtime_ns). False where nothing can be read there.
 * **A separate function, not a field of kspl_path_info** (the reason is at kspl_is_exec below).
 * A file system that keeps whole seconds gives a multiple of 10^9. */
KSPL_LINK Bool kspl_path_mtime_ns(const U8 *path_ptr, Sz path_len, I64 *ns_out) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return false;
    if (stat(path, &st) != 0) return false;
#if defined(__APPLE__)
    *ns_out = (I64)st.st_mtimespec.tv_sec * 1000000000 + (I64)st.st_mtimespec.tv_nsec;
#else
    *ns_out = (I64)st.st_mtim.tv_sec * 1000000000 + (I64)st.st_mtim.tv_nsec;
#endif
    return true;
}

/* Whether the owner's execute bit is up (for std/fs.kspl's is_executable).
 * The owner's bit, not access(X_OK), which is nearly always true under root.
 * Caution: It must not be shaped as adding an output argument to kspl_path_info. std/io.kspl and
 * std/fs.kspl both declare that one. Disagreeing with the seed's old one breaks the bootstrap's
 * link.
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
 * a road out of the root. Refusing is the caller's part (has_link_on_path in std/fs.kspl).
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

/* Writes the name the file system keeps for a path's last segment into buf, for std/fs.kspl's
 * long_name, and returns its length. -1 = nothing stands at the path, or the name does not fit.
 * POSIX keeps one name per entry, so it is the last segment as written. */
KSPL_LINK I32 kspl_long_name(const U8 *path_ptr, Sz path_len, U8 *buf, Sz cap) {
    char path[4096];
    struct stat st;
    Sz start = path_len;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    if (lstat(path, &st) != 0) return -1;
    while (start > 0 && path_ptr[start - 1] != '/') start--;
    if (path_len - start > cap) return -1;
    memcpy(buf, path_ptr + start, (size_t)(path_len - start));
    return (I32)(path_len - start);
}

/* Copies one file to a name that does not stand yet, with the source's permission bits (for
 * std/fs.kspl's copy_tree). 0 = done, 1 = the source cannot be opened, -1 = refused.
 * **The bits are the copy's from its first byte.** Created wider and narrowed afterwards, a private
 * file would stand readable by others while it is written. Where the narrowing fails, it would
 * stay so for good. O_EXCL makes it new, so a link planted at the name is not followed. The umask
 * can only narrow the bits at the creation, and fchmod then gives them exactly. Only a regular
 * file is copied, a piece at a time. What fails partway is removed.
 * **The source opens with O_NONBLOCK, and its kind is checked before any read.** A plain open of a
 * FIFO waits for a writer, for good. The flag is cleared once the file is known to be regular. */
KSPL_LINK I32 kspl_copy_file(const U8 *from_ptr, Sz from_len, const U8 *to_ptr, Sz to_len) {
    char from[4096];
    char to[4096];
    struct stat st;
    int ok = 1;
    if (!kspl_to_cstr(from_ptr, from_len, from, sizeof(from))) return -1;
    if (!kspl_to_cstr(to_ptr, to_len, to, sizeof(to))) return -1;
    int in = open(from, O_RDONLY | O_CLOEXEC | O_NONBLOCK);
    if (in < 0) return 1;
    char *buf = (char *)malloc(KSPL_COPY_PIECE);
    int flags = fcntl(in, F_GETFL);
    if (buf == NULL || fstat(in, &st) != 0 || !S_ISREG(st.st_mode) || flags < 0 ||
        fcntl(in, F_SETFL, flags & ~O_NONBLOCK) != 0) {
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
 * into it (for std/fs.kspl's write_unique). 0 = written, 1 = the name is taken, -1 = refused.
 * **O_EXCL decides that it is new**, so a link planted at the name is not followed. 0600 is the
 * mode from the first byte (a chmod after creating leaves a moment others could open it).
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

/* Flushes an open file or directory through to the disk: 0 = flushed.
 * **macOS takes F_FULLFSYNC**: its fsync stops at the drive's own cache, which a power cut loses.
 * A volume that refuses it (ENOTSUP, most network shares) gets fsync, which is all it offers. */
static int kspl_sync_fd(int fd) {
    int r;
#if defined(__APPLE__)
    if (fcntl(fd, F_FULLFSYNC) == 0) return 0;
    if (errno != ENOTSUP) return -1;
#endif
    do {
        r = fsync(fd);
    } while (r != 0 && errno == EINTR);
    return r;
}

/* Flushes the directory holding `path`, so the name a rename put there survives a power cut too.
 * A file system that cannot sync a directory (EINVAL, EBADF) has nothing more to give, so that is
 * no failure. */
static int kspl_sync_parent(const char *path) {
    char dir[4096];
    const char *slash = strrchr(path, '/');
    size_t n = slash == NULL ? 0 : (slash == path ? 1 : (size_t)(slash - path));
    if (n == 0) {
        dir[0] = '.';
        n = 1;
    } else {
        memcpy(dir, path, n);
    }
    dir[n] = '\0';
    int fd = open(dir, O_RDONLY | O_CLOEXEC);
    if (fd < 0) return -1;
    int r = kspl_sync_fd(fd);
    int err = errno;
    close(fd);
    return r == 0 || err == EINVAL || err == EBADF ? 0 : -1;
}

/* Puts an open stream's data on the disk, for std/io.kspl's File_stream.sync_to_disk: 0 = done.
 * The flush first hands the C library's buffer to the OS, and a write refused before fails it. */
KSPL_LINK I32 kspl_stream_sync_disk(void *stream) {
    FILE *f = (FILE *)stream;
    if (fflush(f) != 0 || ferror(f)) return -1;
    return kspl_sync_fd(fileno(f)) == 0 ? 0 : -1;
}

/* Puts data at `path` so a crash leaves the old content or the new. The new is on the disk at 0
 * (for std/fs.kspl's replace_file): 0 = replaced, 1 = the part's name is taken, -1 = refused.
 * Caution: **Keep the order: write the part, sync it, rename, sync the folder.** Renamed before its
 * data is on the disk, a crash can leave the file empty (XFS, btrfs, ext4 without auto_da_alloc).
 * O_EXCL and 0600 keep a planted link and other readers out of the part. It takes the replaced
 * file's bits once written. A new `kept` file is made as a plain write makes one. */
KSPL_LINK I32 kspl_replace_file(const U8 *part_ptr, Sz part_len, const U8 *path_ptr, Sz path_len,
    const U8 *data, Sz len, I32 owner_only) {
    char part[4096];
    char path[4096];
    struct stat st;
    Sz done = 0;
    int ok = 1;
    if (!kspl_to_cstr(part_ptr, part_len, part, sizeof(part))) return -1;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return -1;
    int had = !owner_only && stat(path, &st) == 0 && S_ISREG(st.st_mode);
    int fd = open(part, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, owner_only || had ? 0600 : 0666);
    if (fd < 0) return errno == EEXIST ? 1 : -1;
    while (ok && done < len) {
        ssize_t n = write(fd, data + done, (size_t)(len - done));
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) ok = 0;
        else done += (Sz)n;
    }
    if (ok && had && fchmod(fd, st.st_mode & 07777) != 0) ok = 0;
    if (ok && kspl_sync_fd(fd) != 0) ok = 0;
    if (close(fd) != 0) ok = 0;
    if (ok && rename(part, path) != 0) ok = 0;
    if (!ok) {
        unlink(part);
        return -1;
    }
    return kspl_sync_parent(path) == 0 ? 0 : -1;
}

/* Who besides the current user could change what a directory holds (for std/fs.kspl's
 * dir_trust).
 *   0 = no one, 1 = not a directory or unreadable, 2 = another user owns it,
 *   3 = its group or everyone can write it, 4 = not checked here (the Windows side).
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

/* Who besides the current user could read or change a file holding a secret (for std/fs.kspl's
 * secret_trust). The answers are kspl_dir_trust's, for a regular file: 3 means its group or
 * everyone can read or write it. It follows a link, as the reader of the file does. */
KSPL_LINK I32 kspl_secret_trust(const U8 *path_ptr, Sz path_len) {
    char path[4096];
    struct stat st;
    if (!kspl_to_cstr(path_ptr, path_len, path, sizeof(path))) return 1;
    if (stat(path, &st) != 0 || !S_ISREG(st.st_mode)) return 1;
    if (st.st_uid != geteuid()) return 2;
    if ((st.st_mode & (S_IRGRP | S_IWGRP | S_IROTH | S_IWOTH)) != 0) return 3;
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
 * unasked"). It calls open() with O_CLOEXEC, then fdopen() on the mode's shape alone.
 * Caution: **Do not add `e` to fopen's mode instead**: macOS's fopen drops the letter in silence.
 * **Nor call `fopen` directly from the KSPL side** (the same reason as kspl_rename_cstr). */
KSPL_LINK void *kspl_fopen_cstr(const U8 *path_cstr, const U8 *mode_cstr) {
    const char *mode = (const char *)mode_cstr;
    char shape[3] = {0, 0, 0};
    I32 plan = kspl_fopen_plan(mode_cstr);
    if (plan < 0) return NULL;
    /* both bits come only from a `+` */
    int plus = (plan & KSPL_OPEN_READ) != 0 && (plan & KSPL_OPEN_WRITE) != 0;
    int flags = plus ? O_RDWR : ((plan & KSPL_OPEN_READ) != 0 ? O_RDONLY : O_WRONLY);
    if ((plan & KSPL_OPEN_CREATE) != 0) flags |= O_CREAT;
    if ((plan & KSPL_OPEN_TRUNCATE) != 0) flags |= O_TRUNC;
    if ((plan & KSPL_OPEN_APPEND) != 0) flags |= O_APPEND;
    if ((plan & KSPL_OPEN_NEW) != 0) flags |= O_EXCL;
    int fd = open((const char *)path_cstr, flags | O_CLOEXEC, 0666);
    if (fd < 0) return NULL;
    shape[0] = mode[0];
    shape[1] = plus ? '+' : '\0';
    FILE *f = fdopen(fd, shape);
    if (f == NULL) close(fd);
    return (void *)f;
}

/* A lock on a file, the handle an fd plus one (0 = failure), for std/fs.kspl's File_lock.
   **flock, not fcntl's lock.** fcntl's lock goes the moment the process closes any fd on the file.
 * A second fd in the same process never waits on it. O_CLOEXEC keeps a child from holding it on. */
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
#endif /* the Windows half is hosted_fs_win.c */
