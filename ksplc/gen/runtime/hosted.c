/* The preamble part of the "substance half" of the C runtime's preamble header (an environment
 * with an OS).
 *
 * **The substance half is split per subject.** This side holds the includes and the shared
 * small pieces alone, and hosted_proc / hosted_thread / hosted_fs / hosted_spawn / hosted_net /
 * hosted_tls join behind it **in that order** to make one translation unit (the order
 * is held by write_impl in ksplc/gen/runtime.kspls).
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
 * types and macros with the winsock2.h further down (for std/net.kspls). Defined before the first
 * windows.h, it holds for the whole file. */
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#endif

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
I64 kspl_mono_us(void) {
    LARGE_INTEGER freq, ctr;
    if (!QueryPerformanceFrequency(&freq) || freq.QuadPart == 0) return 0;
    if (!QueryPerformanceCounter(&ctr)) return 0;
    return (I64)((ctr.QuadPart / freq.QuadPart) * 1000000 +
                 ((ctr.QuadPart % freq.QuadPart) * 1000000) / freq.QuadPart);
}
#else
I64 kspl_mono_us(void) {
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (I64)ts.tv_sec * 1000000 + (I64)ts.tv_nsec / 1000;
}
#endif

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
 * `ksplc/tools/run.kspls`).
 * ============================================================ */
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#include <wchar.h>

/* The limits for a path and a command line.
 * Caution: **They count UTF-16 elements.** Taken as UTF-8 bytes, a path of kana or kanji (three
 * bytes a character) does not fit. */
#define KSPL_WPATH_CAP 4096
#define KSPL_WCMD_CAP 8192

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
 * **Put it through once only** (inside the generated main; gen/c/root.kspls). Put it through
 * on every `sys.args()` and the allocations pile up per call.
 * POSIX is UTF-8 from the start, so it passes straight through. */
char **kspl_os_argv(int argc, char **argv) {
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
        int n = WideCharToMultiByte(CP_UTF8, 0, wav[i], -1, NULL, 0, NULL, NULL);
        char *u = (n > 0) ? (char *)malloc((size_t)n) : NULL;
        if (u == NULL || WideCharToMultiByte(CP_UTF8, 0, wav[i], -1, u, n, NULL, NULL) <= 0) {
            free(u);
            out[i] = argv[i];
            continue;
        }
        out[i] = u;
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
void kspl_sleep_ms(I32 ms) {
    if (ms > 0) Sleep((DWORD)ms);
}
#else
void kspl_sleep_ms(I32 ms) {
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
Bool kspl_is_windows(void) { return true; }
#else
Bool kspl_is_windows(void) { return false; }
#endif

/* The OS's random source for std/rand.kspls's CSPRNG (fill/bytes/u64). POSIX reads /dev/urandom;
 * Windows has none, so rand_s() (UCRT/MSVCRT, CNG's RNG inside; its premise is ctx.kspls's
 * _CRT_RAND_S definition) is called four bytes at a time. Not bcrypt.h: under <windows.h> alone
 * some environments lack its types (LONG/ULONG/PUCHAR), and rand_s needs no extra link. */
#ifndef _WIN32
Bool kspl_rand_fill(U8 *buf, Sz len) {
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f) return false;
    Sz pos = 0;
    Bool ok = true;
    while (pos < len) {
        size_t n = fread(buf + pos, 1, (size_t)(len - pos), f);
        if (n == 0) { ok = false; break; }
        pos += (Sz)n;
    }
    fclose(f);
    return ok;
}
#else
Bool kspl_rand_fill(U8 *buf, Sz len) {
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

/* Windows's CRT opens stdin/stdout in text mode, where a \n written becomes \r\n behind the
 * program's back — so a "\r\n" the program wrote itself lands as "\r\r\n". Content-Length framing
 * holds raw "\r\n" in its headers and is destroyed by it, and any other program handing bytes to
 * standard output is too. Every generated program calls this once before kspl_main
 * (emit_main_function in gen/c/root.kspls), so what a KSPL program writes is what lands. */
#ifdef _WIN32
#include <io.h>
#include <fcntl.h>
void kspl_io_set_stdio_binary(void) {
    _setmode(_fileno(stdin), _O_BINARY);
    _setmode(_fileno(stdout), _O_BINARY);
}
#else
void kspl_io_set_stdio_binary(void) {}
#endif

/* Returns an open stream's size in bytes and puts the position back to the head; -1 where it
 * cannot be read.
 * Caution: **Do not call fseek / ftell directly from KSPL.** Their `long` is 32-bit on Windows
 * (LLP64) and 64-bit on Linux (LP64), and KSPL cannot write `long`: declared as `I64`, a failing
 * `-1L` reads on Windows x86-64 as 4294967295 and slips past the `< 0` check. The width is
 * converted here, on the C side. */
int64_t kspl_file_size(void* stream) {
    FILE* f = (FILE*)stream;
    long end;
    if (fseek(f, 0L, SEEK_END) != 0) {
        return -1;
    }
    end = ftell(f);
    if (end < 0L) {
        return -1;
    }
    rewind(f);
    return (int64_t)end;
}

/* Lines the console's output code page up with UTF-8. The generated main calls it once before
 * kspl_main (emit_main_function in gen/c/root.kspls).
 *
 * Caution: **A KSPL string literal is a run of UTF-8 bytes**, and Windows's CRT hands it to
 * WriteConsoleA, which reads it in the console's code page (under CP932 `ソースを整形する`
 * comes out as `繧ｽ繝ｼ繧ｹ繧呈紛蠖｢縺吶ｋ`). Only **a real console handle** garbles (ConPTY, as in
 * VS Code's terminal, or PowerShell/cmd); mintty (MSYS2) is a pipe. No terminal can be relied on
 * to be the safe kind, so it is lined up on the program's side.
 *
 * Caution: Put it back once done. The code page is the whole console's state and outlives the
 * process, so left behind it breaks the output of the next program run there. */
#ifdef _WIN32
#include <windows.h>
#include <stdlib.h> /* atexit */
/* Whether that standard stream has nowhere to go. A windowing-subsystem program started with no
 * redirection has none; redirected, it has one and must be left alone. */
static int kspl_win_no_handle(DWORD which) {
    HANDLE h = GetStdHandle(which);
    return h == NULL || h == INVALID_HANDLE_VALUE;
}
static UINT kspl_saved_console_cp = 0;
static void kspl_restore_console_cp(void) {
    if (kspl_saved_console_cp != 0) SetConsoleOutputCP(kspl_saved_console_cp);
}
void kspl_io_init_console(void) {
    UINT cur = GetConsoleOutputCP();
    /* 0 is "not joined to a console" (a redirect / a pipe). There is no need to touch it, and
     * touching it leaves nobody to put it back. */
    if (cur == 0 || cur == CP_UTF8) return;
    if (!SetConsoleOutputCP(CP_UTF8)) return;
    kspl_saved_console_cp = cur;
    atexit(kspl_restore_console_cp);
}
#else
void kspl_io_init_console(void) {}
#endif

/* Joins the console the program was started from, where the program has none of its own. The
 * generated main calls it once, before kspl_io_init_console (emit_main_function in
 * gen/c/root.kspls), because the code page can only be set on a console that is there.
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
void kspl_io_attach_console(void) {
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
void kspl_io_attach_console(void) {}
#endif

/* ============================================================
 * Writing when nobody is left to read it (SIGPIPE)
 *
 * POSIX sends a SIGPIPE where a write goes to a pipe or socket whose reader has closed, and the
 * default handling **ends the process**: left bare, a program is dragged down merely because its
 * partner has gone, **putting nothing out**, so not one clue to the cause appears anywhere.
 *
 * **The decision: ignore it and return it to the writer as EPIPE.** Every writing call
 * returns a failure as a value (`kspl_proc_write` returns -1, `kspl_net_send` send's return value),
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

/* Caution: **Make it take effect before `main`.** Shaped as being called from the generated `main`,
 * the LLVM backbone puts its own `main` out by hand (gen/llvm/module.kspls) and **one side alone
 * does not take effect**. The runtime's C is what both backbones join the same of, so placed here
 * it lines up in one place. */
__attribute__((constructor)) static void kspl_sigpipe_init(void) {
    signal(SIGPIPE, SIG_IGN);
}

/* Puts it back to the default on the child's side, after the fork and before the exec
 * (the caution above). */
static void kspl_child_restore_signals(void) {
    signal(SIGPIPE, SIG_DFL);
}

void kspl_io_broken_pipe(void) {
    /* Caution: **Do nothing for anything but EPIPE.** A write also comes out short on a full disk
     * or a removed device, and killing the process there takes away the refusal returned as a
     * value. */
    if (errno != EPIPE) return;
    signal(SIGPIPE, SIG_DFL);
    raise(SIGPIPE);
}
#else
/* Windows has no SIGPIPE. A write to a closed named pipe merely returns a failure. */
void kspl_io_broken_pipe(void) {}
#endif

I32 argc = 0;
U8 **argv = null;

/* stdout / stderr being macros, they are wrapped in functions (get_stdout / get_stderr in
 * std/libc.kspls).
 * Caution: They must have external linkage (the reason is on hosted.h's declaration
 * side). */
void* get_stdout(void) { return (void*)stdout; }
void* get_stderr(void) { return (void*)stderr; }

