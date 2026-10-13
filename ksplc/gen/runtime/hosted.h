/* The "declaration half" of the C runtime's preamble header (an environment with an OS).
 * Only macros, extern declarations and static inline functions (the reason is at the head of
 * core.h; the rest is in hosted.c), and only what the generated body calls directly: a KSPL
 * `extern fn kspl_...` (kspl_atomic_add and the like) gets its prototype from genc. */

/* What core.c keeps one of for each thread. The runtime is built by clang or gcc alone, which
 * both read `__thread` on every hosted target (C99 has no `_Thread_local`). */
#define KSPL_PER_THREAD __thread

/* The four below are called by the generated main directly (each one's reason is in hosted.c).
 * Caution: **Put their prototypes here**: the body half comes after the generated body, so without
 * a declaration the generated C is an implicit-declaration error. */
KSPL_LINK void kspl_io_init_console(void);

/* One step earlier: a windowing-subsystem program still answers in the terminal it ran from. */
KSPL_LINK void kspl_io_attach_console(void);

/* argv passes through this. */
KSPL_LINK char **kspl_os_argv(int argc, char **argv);
/* So that what a KSPL program writes to standard output is what lands. */
KSPL_LINK void kspl_io_set_stdio_binary(void);

static inline KSPL_UNUSED ptrdiff_t kspl_bounds_check(ptrdiff_t idx, ptrdiff_t len, const char* file, int line)
{
    if (idx < 0 || idx >= len) {
        /* Piped (as in CI) stdout is fully buffered: without the flush the program's own output is
         * lost, and the last line seen is not the crash site. */
        fflush(stdout);
        fprintf(stderr, "panic: index out of bounds in array (idx: %td, len: %td) at %s:%d\n", idx, len, file, line);
        fflush(stderr);
        abort();
    }
    return idx;
}

static inline KSPL_UNUSED int64_t kspl_div_check(int64_t divisor, const char* file, int line)
{
    if (divisor == 0) {
        fflush(stdout); /* The same reason as kspl_bounds_check */
        fprintf(stderr, "panic: division by zero at %s:%d\n", file, line);
        fflush(stderr);
        abort();
    }
    return divisor;
}

static inline KSPL_UNUSED int64_t kspl_shift_check(int64_t amount, int64_t width, const char* file, int line)
{
    if (amount < 0 || amount >= width) {
        fflush(stdout); /* The same reason as kspl_bounds_check */
        /* The format is %lld. The argument being int64_t, %td does not match. */
        fprintf(stderr, "panic: shift amount out of range (amount: %lld, width: %lld) at %s:%d\n",
            (long long)amount, (long long)width, file, line);
        fflush(stderr);
        abort();
    }
    return amount;
}

/* std/libc.kspls's `get_stdin` / `get_stdout` / `get_stderr` (the substance is in hosted.c). genc
 * puts no prototype out for std/libc's functions, a standard header having them
 * (`emit_fwd_extern_decls` in ksplc/gen/c/decl.kspls); these three are in none, so they are
 * declared here.
 * Caution: **Do not make them static inline**: the LLVM artifact borrows them from the runtime. */

KSPL_LINK void* get_stdin(void);
KSPL_LINK void* get_stdout(void);
KSPL_LINK void* get_stderr(void);
