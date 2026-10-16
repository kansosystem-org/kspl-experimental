/* The preamble part of the "substance half" of the C runtime's preamble header (an environment
 * with an OS).
 *
 * **The substance half is split per subject.** This side holds the includes and the shared
 * small pieces alone, and hosted_proc / hosted_thread / hosted_fs / hosted_spawn / hosted_net
 * join behind it **in that order** to make one translation unit (the order
 * is held by write_impl in ksplc/gen/runtime.kspl).
 * **The standard for splitting is the
 * subject on std's side** — cut by line count and reading one subject means going back and forth
 * between two files.
 * Split or not, the translation unit is one, so a static small piece placed here is visible
 * from everything behind it.
 *
 * This side **enters one translation unit only** (holding many functions with external
 * linkage). The macros and static functions the generated body calls directly are on hosted.h.
 *
 * WIN32_LEAN_AND_MEAN keeps windows.h from pulling in winsock.h (the old API), which collides in
 * types and macros with the winsock2.h further down (for std/net.kspl). Defined before the first
 * windows.h, it holds for the whole file. */
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#endif

#include <stdarg.h>

/* Keep buffered output before a check stops the program, on either backend. */
static __attribute__((noreturn)) void kspl_check_fail(const char *format, ...)
{
    va_list args;
    va_start(args, format);
    fflush(stdout);
    vfprintf(stderr, format, args);
    va_end(args);
    fflush(stderr);
    abort();
}

KSPL_LINK __attribute__((noreturn)) void kspl_bounds_fail(int64_t idx, int64_t len, const char* file, int line)
{
    kspl_check_fail("panic: index out of bounds in array (idx: %lld, len: %lld) at %s:%d\n", (long long)idx, (long long)len, file, line);
}
KSPL_LINK __attribute__((noreturn)) void kspl_div_fail(const char* file, int line)
{
    kspl_check_fail("panic: division by zero at %s:%d\n", file, line);
}
KSPL_LINK __attribute__((noreturn)) void kspl_shift_fail(int64_t amount, int64_t width, int amount_unsigned, const char* file, int line)
{
    /* The formats are %lld and %llu. The argument being 64 bits, %td does not match. */
    if (amount_unsigned) {
        kspl_check_fail("panic: shift amount out of range (amount: %llu, width: %lld) at %s:%d\n",
            (unsigned long long)amount, (long long)width, file, line);
    } else {
        kspl_check_fail("panic: shift amount out of range (amount: %lld, width: %lld) at %s:%d\n",
            (long long)amount, (long long)width, file, line);
    }
}
KSPL_LINK __attribute__((noreturn)) void kspl_tag_fail(int64_t value, const char* enum_name, const char* file, int line)
{
    kspl_check_fail("panic: enum %s has no tag %lld at %s:%d\n", enum_name, (long long)value, file, line);
}

#include <time.h>
/* The monotonically increasing real time (in microseconds). The origin is not settled — only a
 * difference has a meaning.
 * Caution: **Do not use `clock()`.** That is the CPU time, which does not advance while waiting on
 * a read, so the I/O waits vanish from what is measured.
 * **Do not use the wall clock (`time()`) either.** It winds back on an NTP correction or a clock
 * change, and wound back, a difference goes negative and a timeout waits a whole turn.
 *
 * Caution: Windows's denominator is fixed while running but not necessarily 1,000,000. Dropped to
 * seconds first the digits are lost, so the quotient and the remainder are multiplied apart. */
#ifdef _WIN32
#include <windows.h>
KSPL_LINK I64 kspl_mono_us(void) {
    LARGE_INTEGER freq, ctr;
    if (!QueryPerformanceFrequency(&freq) || freq.QuadPart == 0) return 0;
    if (!QueryPerformanceCounter(&ctr)) return 0;
    return (I64)((ctr.QuadPart / freq.QuadPart) * 1000000 +
                 ((ctr.QuadPart % freq.QuadPart) * 1000000) / freq.QuadPart);
}
#else
KSPL_LINK I64 kspl_mono_us(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (I64)ts.tv_sec * 1000000 + (I64)ts.tv_nsec / 1000;
}
#endif

/* A wait in milliseconds as every wait here reads it: 0 looks once without waiting, a positive
 * value waits at most that long, and a negative one is a time already up, so it does not wait.
 * Caution: **Pass every wait through this first.** Read raw, -1 waited for good in POSIX poll(),
 * 49 days through Windows' unsigned tick compare, and not at all on POSIX send's deadline: one
 * argument, three behaviours. There is no "forever": a silent peer would hang the caller. */
static I32 kspl_wait_ms(I32 timeout_ms) { return timeout_ms < 0 ? 0 : timeout_ms; }

/* Copies (ptr, len) to a NUL terminator in out. Every narrow path and host name the OS is handed
 * goes through here.
 * Caution: **Returns 0 where it does not fit or holds a NUL.** A truncated copy, or one the OS
 * reads only up to an inner NUL, reports success for **an operation on something else** (a mkdir
 * landing shallow, a database opened at another path, a connection to another host). A negative
 * length is knocked back apart: compared with the capacity it would turn unsigned, and the memcpy
 * would make a huge copy. */
KSPL_UNUSED static int kspl_to_cstr(const U8 *ptr, Sz len, char *out, Sz out_cap) {
    if (len < 0 || (size_t)len >= (size_t)out_cap) return 0;
    if (len > 0 && memchr(ptr, '\0', (size_t)len) != NULL) return 0;
    memcpy(out, ptr, (size_t)len);
    out[len] = '\0';
    return 1;
}

/* ============================================================
 * Nothing the runtime opens passes to a child unasked
 *
 * A child holding a copy keeps what it names alive while it runs: a closed listener's port cannot
 * be bound again, a peer never sees a connection close, and a pipe's reader never sees its end.
 * So every socket, file and pipe end is opened close-on-exec (POSIX) or not inheritable (Windows),
 * and a child holds only the three streams kspl_proc_start hands it.
 * Caution: **Mark it in the call that opens it** (SOCK_CLOEXEC, accept4, pipe2, O_CLOEXEC,
 * WSA_FLAG_NO_HANDLE_INHERIT). Marked afterwards, a child started from another thread in between
 * takes the copy. Only where the OS has no such call (a socket or a pipe on macOS, an accepted
 * socket on Windows) is it marked right after. The decision is in std/docs/DESIGN-core.md.
 * ============================================================ */
#ifndef _WIN32
#include <errno.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/types.h>
#include <sys/socket.h>
#if defined(__linux__)
#define KSPL_CLOEXEC_IN_CALL 1
#if !defined(_GNU_SOURCE)
/* Caution: **Declared here rather than by raising _GNU_SOURCE** (the reason is at
 * kspl_stack_floor in hosted_thread.c). glibc and musl both carry them. */
int accept4(int fd, struct sockaddr *addr, socklen_t *addr_len, int flags);
int pipe2(int fds[2], int flags);
#endif
#else
#define KSPL_CLOEXEC_IN_CALL 0
#endif

/* Marks an fd close-on-exec, where the call that opened it could not. */
KSPL_UNUSED static void kspl_fd_cloexec(int fd) {
    int flags = fcntl(fd, F_GETFD);
    if (flags >= 0) fcntl(fd, F_SETFD, flags | FD_CLOEXEC);
}
#endif

/* ============================================================
 * The Windows route hands things over in UTF-16.
 *
 * Caution: **Do not use the narrow (ANSI) API.** A KSPL string is UTF-8, but Windows's `*A` APIs
 * interpret it in **the current code page** (under CP932 `_getcwd` returns CP932 bytes and
 * `_mkdir` takes them). That adds up inside KSPL alone, but **it breaks the moment those bytes are
 * handed to a child process**: invalid as UTF-8, they cannot become UTF-16 for its command line.
 * Python's PEP 529 drops the `*A` APIs for the same reason.
 *
 * Caution: **Do not mix them halfway.** Make only part of it UTF-8 and a path joining `sys.cwd()`'s
 * result with a name written in the source becomes a mixture of two code pages, resolvable by
 * neither API.
 *
 * **Even with everything here wide, a path handed to a third party's tool is not safe.** The CRT
 * of a program with a narrow `main` copies the UTF-16 command line to the current code page, a
 * character it cannot express collapses to `?`, and the tool fails with `Invalid argument`. So the
 * paths handed to cc / ld are made relative and the place is handed over by cwd (`under_slot` in
 * `ksplc/tools/run.kspl`).
 * ============================================================ */
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

/* The limits for a path and a command line (the OS's own, its NUL counted).
 * Caution: **They count UTF-16 elements.** Taken as UTF-8 bytes, a path of kana or kanji (three
 * bytes a character) does not fit. */
#define KSPL_WPATH_CAP 4096
#define KSPL_WCMD_MAX 32767

/* Copies a UTF-8 run to a UTF-16 NUL terminator.
 * Caution: **Returns 0 where it does not fit or holds a NUL** — an operation on a different path
 * would come back as a success (the same reason as kspl_to_cstr). */
KSPL_UNUSED static int kspl_win_to_wide(const char *utf8, Sz len, wchar_t *out, Sz out_cap) {
    int n;
    if (len < 0 || out_cap < 1) return 0;
    if (len == 0) {
        out[0] = L'\0';
        return 1;
    }
    if (memchr(utf8, '\0', (size_t)len) != NULL) return 0;
    if (len > 0x7FFFFFFF || out_cap - 1 > 0x7FFFFFFF) return 0;
    n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, (int)len, out, (int)(out_cap - 1));
    if (n <= 0) return 0;
    out[n] = L'\0';
    return 1;
}

/* Copies a UTF-16 NUL terminator to UTF-8 and returns the length without the NUL (-1 where it
 * does not fit). */
KSPL_UNUSED static int kspl_win_from_wide(const wchar_t *w, char *out, Sz out_cap) {
    int n;
    if (out_cap < 1 || out_cap > 0x7FFFFFFF) return -1;
    n = WideCharToMultiByte(CP_UTF8, 0, w, -1, out, (int)out_cap, NULL, NULL);
    if (n <= 0) return -1;
    return n - 1;
}

/* Copies a NUL-terminated UTF-8 to UTF-16 (a command line is taken here). */
KSPL_UNUSED static int kspl_win_cstr_to_wide(const char *cstr, wchar_t *out, Sz out_cap) {
    return kspl_win_to_wide(cstr, (Sz)strlen(cstr), out, out_cap);
}

/* Copies a NUL-terminated UTF-8 to a UTF-16 one on the heap, as long as it needs (an environment
 * value, a command line); NULL where it is not UTF-8 or memory is short. The caller frees it. */
KSPL_UNUSED static wchar_t *kspl_win_wide_dup(const char *utf8) {
    int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, -1, NULL, 0);
    wchar_t *w = n > 0 ? (wchar_t *)malloc((size_t)n * sizeof(wchar_t)) : NULL;
    if (w != NULL && MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, utf8, -1, w, n) != n) {
        free(w);
        w = NULL;
    }
    return w;
}

/* The reverse: a NUL-terminated UTF-16 to a UTF-8 one on the heap; NULL where it cannot be. */
KSPL_UNUSED static char *kspl_win_utf8_dup(const wchar_t *w) {
    int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL);
    char *u = n > 0 ? (char *)malloc((size_t)n) : NULL;
    if (u != NULL && WideCharToMultiByte(CP_UTF8, 0, w, -1, u, n, NULL, NULL) != n) {
        free(u);
        u = NULL;
    }
    return u;
}
#endif

/* Returns the argv the generated main took, in the shape KSPL holds (UTF-8).
 *
 * Caution: **Do not copy it again from `char **argv`.** The CRT assembles that in the current code
 * page, where a character it cannot express is already a `?` (`かんそ` becomes `???` under
 * CP1252). **It is taken again from `GetCommandLineW`**, the OS's own UTF-16, which loses neither a
 * space nor a non-ASCII character.
 * `CommandLineToArgvW` lives in `shell32`. mingw finds it in the default import library even
 * unnamed, but **the explicit `-lshell32` stays** (beside `-lws2_32`): the MSVC side needs it.
 * Caution: **Do not take it apart again by hand** — the rules for the quotes and the backslashes
 * are the reverse of the assembling side's (kspl_win_build_cmdline), and copied, only
 * one gets fixed.
 * **Put it through once only** (inside the generated main; gen/c/root.kspl). Put it through
 * on every `sys.args()` and the allocations pile up per call.
 * POSIX is UTF-8 from the start, so it passes straight through. */
KSPL_LINK char **kspl_os_argv(int argc, char **argv) {
#ifdef _WIN32
    LPWSTR *wav;
    char **out;
    int wargc = 0;
    int i;
    if (argc <= 0 || argv == NULL) return argv;
    wav = CommandLineToArgvW(GetCommandLineW(), &wargc);
    if (wav == NULL) return argv;
    /* Caution: Where the counts disagree, leave it alone: argc and argv out of step (the caller
     * indexes by argc) is worse than garbled characters. */
    if (wargc != argc) {
        LocalFree(wav);
        return argv;
    }
    out = (char **)malloc(sizeof(char *) * (size_t)(argc + 1));
    if (out == NULL) {
        LocalFree(wav);
        return argv;
    }
    for (i = 0; i < argc; i++) {
        char *u = kspl_win_utf8_dup(wav[i]);
        out[i] = u != NULL ? u : argv[i];
    }
    out[argc] = NULL;
    LocalFree(wav);
    return out;
#else
    (void)argc;
    return argv;
#endif
}

/* Sleeps for the given milliseconds.
 *
 * Caution: **Do not wait by spinning busily** (for a port to open, for a child to put a mark out):
 * it eats a whole core the entire time, so **the whole run slows**, not the waiting side alone.
 * Where a read with a timeout (kspl_proc_read) can do the waiting, that comes first; this one is
 * for a wait with nobody to read from, such as a mark appearing in a file. */
#ifdef _WIN32
KSPL_LINK void kspl_sleep_ms(I32 ms) {
    if (ms > 0) Sleep((DWORD)ms);
}
#else
KSPL_LINK void kspl_sleep_ms(I32 ms) {
    if (ms <= 0) return;
    struct timespec ts;
    ts.tv_sec = (time_t)(ms / 1000);
    ts.tv_nsec = (long)(ms % 1000) * 1000000L;
    nanosleep(&ts, NULL);
}
#endif

/* Whether this is Windows, for a KSPL source (a test and the like) that branches at run time on
 * the OS's paths (skipping a test that leans on a POSIX path such as /bin/echo). */
#ifdef _WIN32
KSPL_LINK Bool kspl_is_windows(void) { return true; }
#else
KSPL_LINK Bool kspl_is_windows(void) { return false; }
#endif

/* The machine this program was compiled for, as a triple built from the C compiler's own macros
 * (its architecture, then its OS), into buf; returns the length, or 0 where cap is too small.
 * ksplc looks it up in its table of machines (`ksplc/base/target.kspl`) and refuses, naming it, a
 * machine the table has no row for. A part the macros do not tell is `unknown`.
 * Caution: **Spell each part as the table's rows do**, or a machine the table holds is refused
 * (every gate compiles with the default, on each platform CI runs). */
#if defined(__x86_64__) || defined(_M_X64)
#define KSPL_HOST_ARCH "x86_64"
#elif (defined(__aarch64__) || defined(_M_ARM64)) && defined(__APPLE__)
#define KSPL_HOST_ARCH "arm64"
#elif defined(__aarch64__) || defined(_M_ARM64)
#define KSPL_HOST_ARCH "aarch64"
#elif defined(__riscv) && defined(__LP64__)
#define KSPL_HOST_ARCH "riscv64"
#elif defined(__i386__) || defined(_M_IX86)
#define KSPL_HOST_ARCH "i686"
#elif defined(__arm__)
#define KSPL_HOST_ARCH "arm"
#else
#define KSPL_HOST_ARCH "unknown"
#endif
#if defined(__APPLE__)
#define KSPL_HOST_OS "apple-darwin"
#elif defined(_WIN32)
#define KSPL_HOST_OS "w64-windows-gnu"
#elif defined(__linux__)
#define KSPL_HOST_OS "linux-gnu"
#elif defined(__FreeBSD__)
#define KSPL_HOST_OS "unknown-freebsd"
#else
#define KSPL_HOST_OS "unknown"
#endif
KSPL_LINK Sz kspl_host_machine(U8 *buf, Sz cap) {
    static const char name[] = KSPL_HOST_ARCH "-" KSPL_HOST_OS;
    Sz n = (Sz)(sizeof name - 1);
    if (buf == NULL || cap <= n) return 0;
    memcpy(buf, name, (size_t)n);
    return n;
}
#undef KSPL_HOST_ARCH
#undef KSPL_HOST_OS

/* The OS's random source for std/rand.kspl's CSPRNG (fill/bytes/u64). POSIX reads /dev/urandom;
 * Windows has none, so rand_s() (UCRT/MSVCRT, CNG's RNG inside; its premise is ctx.kspl's
 * _CRT_RAND_S definition) is called four bytes at a time. Not bcrypt.h: under <windows.h> alone
 * some environments lack its types (LONG/ULONG/PUCHAR), and rand_s needs no extra link. */
#ifndef _WIN32
KSPL_LINK Bool kspl_rand_fill(U8 *buf, Sz len) {
    int fd = open("/dev/urandom", O_RDONLY | O_CLOEXEC);
    if (fd < 0) return false;
    Sz pos = 0;
    while (pos < len) {
        ssize_t n = read(fd, buf + pos, (size_t)(len - pos));
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) break;
        pos += (Sz)n;
    }
    close(fd);
    return pos == len;
}
#else
KSPL_LINK Bool kspl_rand_fill(U8 *buf, Sz len) {
    Sz pos = 0;
    while (pos < len) {
        unsigned int v;
        if (rand_s(&v) != 0) return false;
        Sz n = (len - pos) < (Sz)sizeof(v) ? (len - pos) : (Sz)sizeof(v);
        memcpy(buf + pos, &v, (size_t)n);
        pos += n;
    }
    return true;
}
#endif

/* Windows's CRT opens the three standard streams in text mode, where a \n written becomes \r\n
 * behind the program's back — so a "\r\n" the program wrote itself lands as "\r\r\n".
 * Content-Length framing holds raw "\r\n" in its headers and is destroyed by it, and any other
 * program handing bytes to a stream is too. Every generated program calls this once before
 * kspl_main (emit_main_function in gen/c/root.kspl), so what a KSPL program writes is what lands,
 * on standard error as on standard output. */
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
KSPL_LINK void kspl_io_set_stdio_binary(void) {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
    _setmode(_fileno(stderr), _O_BINARY);
}
#else
KSPL_LINK void kspl_io_set_stdio_binary(void) {}
#endif

/* Returns an open stream's size in bytes, -1 where it cannot be read; after any seek that
 * succeeded the position is back at the head (a stream that cannot seek, a pipe, stays put).
 * Caution: **Do not call fseek / ftell directly from KSPL.** Their `long` is 32-bit on Windows
 * (LLP64) and 64-bit on Linux (LP64), and KSPL cannot write `long`: declared as `I64`, a failing
 * `-1L` reads on Windows x86-64 as 4294967295 and slips past the `< 0` check.
 * **Nor use them here**: past 2 GiB, Windows's ftell fails. The 64-bit pair is taken instead. */
#ifdef _WIN32
#define kspl_fseek64 _fseeki64
#define kspl_ftell64 _ftelli64
#else
#define kspl_fseek64 fseeko
#define kspl_ftell64 ftello
#endif
KSPL_LINK int64_t kspl_file_size(void* stream) {
    FILE* f = (FILE*)stream;
    int64_t end;
    if (kspl_fseek64(f, 0, SEEK_END) != 0) {
        return -1;
    }
    end = (int64_t)kspl_ftell64(f);
    rewind(f);
    return end < 0 ? -1 : end;
}

/* Lines the console's output and input code pages up with UTF-8, and on Windows sets how an
 * abort() ends (kspl_end_on_abort). The generated main calls it once before kspl_main
 * (emit_main_function in gen/c/root.kspl).
 *
 * Caution: **A KSPL string literal is a run of UTF-8 bytes**, and Windows's CRT hands it to
 * WriteConsoleA, which reads it in the console's code page (under CP932 `ソースを整形する`
 * comes out as `繧ｽ繝ｼ繧ｹ繧呈紛蠖｢縺吶ｋ`). Only **a real console handle** garbles (ConPTY, as in
 * VS Code's terminal, or PowerShell/cmd); mintty (MSYS2) is a pipe. No terminal can be relied on
 * to be the safe kind, so it is lined up on the program's side. **Line up both sides**: typed
 * input would otherwise arrive in the old code page, and mix with UTF-8 in one program.
 *
 * Caution: Put them back once done, on exit and after a panic too (abort() skips atexit, and
 * raises SIGABRT first). A code page is the whole console's state and outlives the process, so left
 * behind it breaks the output of the next program run there. */
#ifdef _WIN32
#include <windows.h>
#include <stdlib.h> /* atexit */
/* Whether that standard stream has nowhere to go. A windowing-subsystem program started with no
 * redirection has none; redirected, it has one and must be left alone. */
static int kspl_win_no_handle(DWORD which) {
    HANDLE h = GetStdHandle(which);
    return h == NULL || h == INVALID_HANDLE_VALUE;
}
static UINT kspl_saved_out_cp = 0;
static UINT kspl_saved_in_cp = 0;
static void kspl_restore_console_cp(void) {
    if (kspl_saved_out_cp != 0) SetConsoleOutputCP(kspl_saved_out_cp);
    if (kspl_saved_in_cp != 0) SetConsoleCP(kspl_saved_in_cp);
}
/* abort() raises SIGABRT first, in msvcrt and UCRT alike, and this ends the process there with
 * the code __fastfail gives (STATUS_STACK_BUFFER_OVERRUN), which a parent reads as SIGABRT's 134
 * ("A child's end is one code on every OS" in std/docs/DESIGN-system.md).
 * Caution: **Do not leave the end to the CRT.** msvcrt's abort() exits 3, which an exit(3) gives
 * too, and UCRT's depends on its fault-reporting setting; a panic and the run-time checks would
 * read differently per CRT. TerminateProcess raises no error-report dialog, as __fastfail can. */
static void kspl_end_on_abort(int sig) {
    (void)sig;
    kspl_restore_console_cp();
    TerminateProcess(GetCurrentProcess(), 0xC0000409u);
}
KSPL_LINK void kspl_io_init_console(void) {
    UINT out = GetConsoleOutputCP();
    UINT in = GetConsoleCP();
    signal(SIGABRT, kspl_end_on_abort);
    /* 0 is "not joined to a console" (a redirect / a pipe). There is no need to touch it, and
     * touching it leaves nobody to put it back. */
    if (out != 0 && out != CP_UTF8 && SetConsoleOutputCP(CP_UTF8)) kspl_saved_out_cp = out;
    if (in != 0 && in != CP_UTF8 && SetConsoleCP(CP_UTF8)) kspl_saved_in_cp = in;
    if (kspl_saved_out_cp == 0 && kspl_saved_in_cp == 0) return;
    atexit(kspl_restore_console_cp);
}
#else
KSPL_LINK void kspl_io_init_console(void) {}
#endif

/* Joins the console the program was started from, where the program has none of its own. The
 * generated main calls it once, before kspl_io_init_console (emit_main_function in
 * gen/c/root.kspl), because the code page can only be set on a console that is there.
 *
 * A windowing-subsystem program shows no console on a double-click, which is the point, but **run
 * from a terminal it would say nothing at all**: it starts with no standard output.
 *
 * Caution: **Only where the stream has nowhere to go** — `prog > out.txt` has a handle already
 * (redirection is set with or without a console), and pointing it at the console would throw the
 * redirection away. **And do the three streams together**, or the program prints its question and
 * can never be answered.
 *
 * A console program (attached already) and a double-clicked one (no parent console) both fail the
 * attach and do nothing, which is right for both. */
#ifdef _WIN32
KSPL_LINK void kspl_io_attach_console(void) {
    /* Caution: **Ask before the joining, not after.** Joining sets the standard handles, so asked
     * afterwards every stream looks alike, whether it has nowhere to go or points at a file. */
    int in_free = kspl_win_no_handle(STD_INPUT_HANDLE);
    int out_free = kspl_win_no_handle(STD_OUTPUT_HANDLE);
    int err_free = kspl_win_no_handle(STD_ERROR_HANDLE);
    if (!AttachConsole(ATTACH_PARENT_PROCESS)) return;
    if (in_free) (void)freopen("CONIN$", "r", stdin);
    if (out_free) (void)freopen("CONOUT$", "w", stdout);
    if (err_free) (void)freopen("CONOUT$", "w", stderr);
}
#else
KSPL_LINK void kspl_io_attach_console(void) {}
#endif

/* ============================================================
 * Writing when nobody is left to read it (SIGPIPE)
 *
 * POSIX sends a SIGPIPE where a write goes to a pipe or socket whose reader has closed, and the
 * default handling **ends the process**: left bare, a program is dragged down merely because its
 * partner has gone, **putting nothing out**, so not one clue to the cause appears anywhere.
 *
 * **The decision: ignore it and return it to the writer as EPIPE.** Every writing call
 * returns a failure as a value (`kspl_proc_send` returns -2, `kspl_net_send` send's return value),
 * so the side receiving it can treat it as a refusal.
 *
 * Caution: **But do not let the output vanish unnoticed.** Where standard output is joined to
 * `head`, Unix's promise is **to finish quietly**; merely ignored, the program runs on with its
 * output silently thrown away (a common complaint). So **where a write sees EPIPE,
 * the default is put back and the signal sent again** (kspl_io_broken_pipe below; the same shape
 * as Go).
 *
 * Caution: **Do not carry it over to a child.** The ignoring setting **is inherited** across
 * execve, so a child (`git`, `clang`, a shell's pipeline) stops dying too and `yes | head -1`
 * never ends. It is put back after the fork and before the exec (kspl_child_restore_signals below,
 * called by kspl_proc_start in hosted_spawn.c).
 * ============================================================ */
#ifndef _WIN32
#include <signal.h>
/* No include after this section is leaned on (the preamble comes first). */
#include <errno.h> /* the EPIPE judgement below */

/* Caution: **Make it take effect before `main`.** Called from the generated `main`, it would miss
 * the `main` the LLVM backbone writes by hand (gen/llvm/module.kspl); both join this runtime.
 * **A library leaves the signal to the program that links it** (KSPL_LIBRARY): its handling is
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

/* In a library a failed write stays a failure: ending the process is the program's choice. */
KSPL_LINK void kspl_io_broken_pipe(void) {
#if !defined(KSPL_LIBRARY)
    /* Caution: **Do nothing for anything but EPIPE.** A write also comes out short on a full disk
     * or a removed device, and killing the process there takes away the refusal returned as a
     * value. */
    if (errno != EPIPE) return;
    signal(SIGPIPE, SIG_DFL);
    raise(SIGPIPE);
#endif
}
#else
/* Windows has no SIGPIPE. A write to a closed named pipe merely returns a failure. */
KSPL_LINK void kspl_io_broken_pipe(void) {}
#endif

/* ============================================================
 * A crash says what happened (SIGSEGV / SIGBUS, Windows's access violation and stack overflow)
 *
 * Left to the OS, a program touching memory it may not ends **without a word**: a shell prints
 * "Segmentation fault" at best, and a parent sees the code alone. So the runtime writes one line,
 * `crash: null pointer dereference (SIGSEGV at address 0x0)`, and ends the program as the fault
 * would have: POSIX puts the signal back to its default and raises it again (139, a core dump
 * where one is enabled), Windows ends with the exception's code (read as 139, "A child's end is
 * one code on every OS" in std/docs/DESIGN-system.md). A library takes nothing: its host owns the signals.
 *
 * Caution: **Only async-signal-safe calls in the handler** (write, signal, raise): the fault may
 * strike inside malloc or stdio, holding their locks. So standard output is not flushed, and a
 * program whose last lines matter is line-buffered ("A program does not lose its own output on an
 * abnormal exit" in std/docs/DESIGN-system.md).
 * Caution: **A stack overflow needs a stack of its own** (sigaltstack) for the handler to run on.
 * The main thread's is set at start-up, a std/thread thread's as it starts; a thread C code starts
 * has none, and its overflow ends with 139 and no line.
 * ============================================================ */
#if !defined(KSPL_LIBRARY)
/* One crash line, built with no allocation and no stdio (either may be what broke). */
typedef struct {
    char text[160];
    size_t len;
} kspl_crash_line;

static void kspl_crash_put(kspl_crash_line *l, const char *s) {
    while (*s != '\0' && l->len < sizeof(l->text)) l->text[l->len++] = *s++;
}

static void kspl_crash_hex(kspl_crash_line *l, uintptr_t v) {
    char digits[2 * sizeof(uintptr_t)];
    size_t n = 0;
    kspl_crash_put(l, "0x");
    do {
        digits[n++] = "0123456789abcdef"[v & 15u];
        v >>= 4;
    } while (v != 0);
    while (n > 0 && l->len < sizeof(l->text)) l->text[l->len++] = digits[--n];
}

/* `crash: <what> (<why> at address <addr>)`; the address is left out where has_addr is 0. */
static void kspl_crash_compose(kspl_crash_line *l, const char *what, const char *why, int has_addr,
    uintptr_t addr) {
    l->len = 0;
    kspl_crash_put(l, "crash: ");
    kspl_crash_put(l, what);
    kspl_crash_put(l, " (");
    kspl_crash_put(l, why);
    if (has_addr) {
        kspl_crash_put(l, " at address ");
        kspl_crash_hex(l, addr);
    }
    kspl_crash_put(l, ")\n");
}

/* What a fault at addr was. An overflow's fault lands near the stack's end (floor; 0 where it is not
 * known), in the guard below it, which on Linux's main thread is 1 MiB; an address in the first
 * page is a null pointer with a field's offset added. */
static const char *kspl_crash_what(uintptr_t addr, uintptr_t floor, const char *other) {
    if (floor != 0 && (addr > floor ? addr - floor : floor - addr) < ((uintptr_t)1 << 20)) {
        return "stack overflow";
    }
    return addr < 4096 ? "null pointer dereference" : other;
}
#endif

#if !defined(_WIN32) && !defined(KSPL_LIBRARY)
#include <sys/resource.h>
KSPL_LINK Sz kspl_stack_floor(void);

#define KSPL_ALT_STACK_SIZE 65536
static char kspl_main_alt_stack[KSPL_ALT_STACK_SIZE];
static int kspl_crash_taken = 0; /* whether the handler is in place, so a thread sets a stack */
static KSPL_PER_THREAD uintptr_t kspl_crash_floor = 0; /* where this thread's stack ends, or 0 */

static void kspl_crash_handler(int sig, siginfo_t *info, void *context) {
    kspl_crash_line l;
    const char *name = sig == SIGBUS ? "SIGBUS" : "SIGSEGV";
    const char *p;
    size_t left;
    (void)context;
    if (info->si_code == SI_USER) {
        kspl_crash_compose(&l, "sent by another process", name, 0, 0);
    } else {
        uintptr_t addr = kspl_fault_addr(info);
        const char *other = sig == SIGBUS ? "bus error" : "invalid memory access";
        kspl_crash_compose(&l, kspl_crash_what(addr, kspl_crash_floor, other), name, 1, addr);
    }
    for (p = l.text, left = l.len; left > 0;) {
        ssize_t n = write(2, p, left);
        if (n <= 0) break;
        p += n;
        left -= (size_t)n;
    }
    /* Still blocked inside the handler, the signal is taken at its default once this returns. */
    signal(sig, SIG_DFL);
    raise(sig);
}

/* Gives the calling thread mem as its alternate stack, unless it has one; 1 where it took it. */
static int kspl_crash_alt_stack(void *mem, size_t size) {
    stack_t now, ss;
    if (sigaltstack(NULL, &now) != 0 || (now.ss_flags & SS_DISABLE) == 0) return 0;
    ss.ss_sp = mem;
    ss.ss_size = size;
    ss.ss_flags = 0;
    return sigaltstack(&ss, NULL) == 0;
}

/* The main thread's stack end is its limit below this frame: asking the OS for it reads
 * /proc/self/maps on Linux, too dear for every start (kspl_stack_floor in hosted_thread.c). What
 * stands above this frame (the arguments, the environment) moves the guess by far less than the
 * window kspl_crash_what allows. Before `main`, for the reason at kspl_sigpipe_init. */
__attribute__((constructor)) static void kspl_crash_init(void) {
    struct rlimit limit;
    char here = 0;
    uintptr_t top = (uintptr_t)&here;
    kspl_crash_taken = kspl_take_default_fault(SIGSEGV, kspl_crash_handler);
    kspl_crash_taken |= kspl_take_default_fault(SIGBUS, kspl_crash_handler);
    if (!kspl_crash_taken) return;
    (void)kspl_crash_alt_stack(kspl_main_alt_stack, sizeof(kspl_main_alt_stack));
    if (getrlimit(RLIMIT_STACK, &limit) == 0 && limit.rlim_cur != RLIM_INFINITY &&
        (uintptr_t)limit.rlim_cur < top) {
        kspl_crash_floor = top - (uintptr_t)limit.rlim_cur;
    }
}

/* A std/thread thread's share as it starts: its stack's end, and an alternate stack to hand back
 * to kspl_crash_thread_leave as it ends (NULL where none was set). */
static void *kspl_crash_thread_enter(void) {
    void *mem;
    if (!kspl_crash_taken) return NULL;
    kspl_crash_floor = (uintptr_t)kspl_stack_floor();
    mem = malloc(KSPL_ALT_STACK_SIZE);
    if (mem != NULL && !kspl_crash_alt_stack(mem, KSPL_ALT_STACK_SIZE)) {
        free(mem);
        mem = NULL;
    }
    return mem;
}

static void kspl_crash_thread_leave(void *mem) {
    stack_t off;
    if (mem == NULL) return;
    off.ss_sp = NULL;
    off.ss_size = 0;
    off.ss_flags = SS_DISABLE;
    (void)sigaltstack(&off, NULL);
    free(mem);
}
#elif !defined(_WIN32)
/* A library takes no signal (the heading above), so a thread has nothing to set. */
static void *kspl_crash_thread_enter(void) { return NULL; }
static void kspl_crash_thread_leave(void *mem) { (void)mem; }
#endif

#if defined(_WIN32) && !defined(KSPL_LIBRARY)
/* Asked only where no handler took the exception, so a C library's own __try still sees its
 * faults first; one this does not name goes on to the filter it replaced. No alternate stack is
 * needed: Windows leaves the overflowing thread its guard's room to report in. */
static LPTOP_LEVEL_EXCEPTION_FILTER kspl_crash_prev_filter = NULL;

static LONG WINAPI kspl_crash_filter(EXCEPTION_POINTERS *info) {
    EXCEPTION_RECORD *rec = info->ExceptionRecord;
    kspl_crash_line l;
    DWORD wrote = 0;
    if (rec->ExceptionCode == EXCEPTION_STACK_OVERFLOW) {
        kspl_crash_compose(&l, "stack overflow", "STATUS_STACK_OVERFLOW", 0, 0);
    } else if (rec->ExceptionCode == EXCEPTION_ACCESS_VIOLATION && rec->NumberParameters >= 2) {
        uintptr_t addr = (uintptr_t)rec->ExceptionInformation[1];
        kspl_crash_compose(&l, kspl_crash_what(addr, 0, "invalid memory access"),
            "STATUS_ACCESS_VIOLATION", 1, addr);
    } else {
        return kspl_crash_prev_filter != NULL ? kspl_crash_prev_filter(info)
                                              : EXCEPTION_CONTINUE_SEARCH;
    }
    WriteFile(GetStdHandle(STD_ERROR_HANDLE), l.text, (DWORD)l.len, &wrote, NULL);
    kspl_restore_console_cp();
    TerminateProcess(GetCurrentProcess(), rec->ExceptionCode);
    return EXCEPTION_CONTINUE_SEARCH;
}

__attribute__((constructor)) static void kspl_crash_init(void) {
    kspl_crash_prev_filter = SetUnhandledExceptionFilter(kspl_crash_filter);
}
#endif

KSPL_LINK I32 argc = 0;
KSPL_LINK U8 **argv = null;

/* stdin / stdout / stderr being macros, they are wrapped in functions (get_stdin / get_stdout /
 * get_stderr in std/libc.kspl).
 * Caution: They must have external linkage (the reason is on hosted.h's declaration
 * side). */
KSPL_LINK void* get_stdin(void) { return (void*)stdin; }
KSPL_LINK void* get_stdout(void) { return (void*)stdout; }
KSPL_LINK void* get_stderr(void) { return (void*)stderr; }

