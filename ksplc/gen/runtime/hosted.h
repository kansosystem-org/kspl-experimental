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

/* `amount_unsigned` says the amount's own type is unsigned, so its 64 bits are printed as a `U64`:
 * read as `int64_t`, 2^64-1 would be reported as -1. Either way such an amount is out of range. */
static inline KSPL_UNUSED int64_t kspl_shift_check(int64_t amount, int64_t width, int amount_unsigned,
    const char* file, int line)
{
    if (amount < 0 || amount >= width) {
        fflush(stdout); /* The same reason as kspl_bounds_check */
        /* The formats are %lld and %llu. The argument being 64 bits, %td does not match. */
        if (amount_unsigned) {
            fprintf(stderr, "panic: shift amount out of range (amount: %llu, width: %lld) at %s:%d\n",
                (unsigned long long)amount, (long long)width, file, line);
        } else {
            fprintf(stderr, "panic: shift amount out of range (amount: %lld, width: %lld) at %s:%d\n",
                (long long)amount, (long long)width, file, line);
        }
        fflush(stderr);
        abort();
    }
    return amount;
}

/* A cast to an enum from a number: the value must be one of the enum's `count` tags. The tags come
 * as an array, so the cast's operand is evaluated once. */
static inline KSPL_UNUSED int64_t kspl_tag_check(int64_t value, const int64_t* tags, int64_t count,
    const char* enum_name, const char* file, int line)
{
    for (int64_t i = 0; i < count; i++) {
        if (tags[i] == value) {
            return value;
        }
    }
    fflush(stdout); /* The same reason as kspl_bounds_check */
    fprintf(stderr, "panic: enum %s has no tag %lld at %s:%d\n", enum_name, (long long)value, file, line);
    fflush(stderr);
    abort();
}

/* std/libc.kspls's `get_stdin` / `get_stdout` / `get_stderr` (the substance is in hosted.c). genc
 * puts no prototype out for std/libc's functions, a standard header having them
 * (`emit_fwd_extern_decls` in ksplc/gen/c/decl.kspls); these three are in none, so they are
 * declared here.
 * Caution: **Do not make them static inline**: the LLVM artifact borrows them from the runtime. */

KSPL_LINK void* get_stdin(void);
KSPL_LINK void* get_stdout(void);
KSPL_LINK void* get_stderr(void);
