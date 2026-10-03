/* The "declaration half" of the C runtime's preamble header (common to both targets).
 * **Only macros, typedefs, extern declarations and static inline functions**: this enters every
 * generated unit, so a definition with external linkage would be doubled (it goes in core.c).
 * **The four run-time checks** (`kspl_bounds_check`, `kspl_div_check`, `kspl_sdiv` / `kspl_smod`,
 * `kspl_shift_check`) differ per target only in what a breach does; the meaning is settled here.
 * The signed pair is below, the rest in hosted.h and freestanding.h. **Signed `/` `%` never go
 * out bare**: a minimum by -1 is undefined in C, so `a / -1` wraps to -a and `a % -1` is 0.
 * **Widths are `int64_t`, not `ptrdiff_t`**: a 32-bit target truncates an `I64`, and a non-zero
 * divisor would read as 0. A shift's `width` is counted at the portable lower bound.
 * Caution: **Take `file` / `line` in the same order on both sides**: genc puts one call out. */

#if defined(__GNUC__) || defined(__clang__)
#define KSPL_UNUSED __attribute__((unused))
#else
#define KSPL_UNUSED
#endif

/* `--omit-runtime` puts this on a definition from std, so artifacts sharing it link with the
 * duplicates dropped. **Where weak is unknown it is empty**: a duplicate then fails the link. */
#if defined(__GNUC__) || defined(__clang__)
#define KSPL_WEAK __attribute__((weak))
#else
#define KSPL_WEAK
#endif

/* The mark on a function carrying `#export`, empty but on wasm (`export_name` is wasm's alone).
 * Caution: **On wasm it is itself the list of functions exported to the host**: without it wasm-ld's
 * `--gc-sections` drops the function, and a forgotten `--export=` passes in silence. */
#if defined(__wasm__)
#define KSPL_EXPORT(name) __attribute__((export_name(#name)))
#else
#define KSPL_EXPORT(name)
#endif

// `#section("...")`'s output target. ELF takes the name as it is; Mach-O accepts only
// "segment,section", so the segment is filled in (a named section inside the data area).
#if defined(__APPLE__)
#define KSPL_SECTION(name) __attribute__((section("__DATA," name)))
#else
#define KSPL_SECTION(name) __attribute__((section(name)))
#endif

#define null NULL

typedef int8_t I8;
typedef int16_t I16;
typedef int32_t I32;
typedef int64_t I64;
typedef uint8_t U8;
typedef uint16_t U16;
typedef uint32_t U32;
typedef uint64_t U64;
typedef ptrdiff_t Sz;
typedef float F32;
typedef double F64;
typedef bool Bool;
typedef unsigned char Char;

/* What is recorded is the `?` propagation route one error followed, **one route per thread**
 * (the storage is core.c's, as each target spells KSPL_PER_THREAD). std/sys.kspls reads it back.
 * Caution: **Begin the chain at a `throw` and extend it by `?` alone.** Guessed by "did it return
 * a success", it keeps the frames of failures `catch` handled, and a later route rides on them. */
void kspl_trace_start(const char* file, const char* func, int line);
void kspl_trace_record(const char* file, const char* func, int line);

#define KSPL_RECORD_TRACE() kspl_trace_record(__FILE__, __func__, __LINE__)
#define KSPL_START_TRACE() kspl_trace_start(__FILE__, __func__, __LINE__)

/* Signed division and remainder go through these (the meaning is settled at the head).
 * Caution: Put out bare, x86 stops with SIGFPE and ARM does not. kspl_div_check is each target's,
 * defined after this file. */
static inline KSPL_UNUSED int64_t kspl_div_check(int64_t divisor, const char* file, int line);

static inline KSPL_UNUSED int64_t kspl_sdiv(int64_t a, int64_t b, const char* file, int line)
{
    if (kspl_div_check(b, file, line) == -1) {
        /* The unary minus goes through unsigned (so as not to hand signed overflow to C bare). */
        return (int64_t)((uint64_t)0 - (uint64_t)a);
    }
    return a / b;
}

static inline KSPL_UNUSED int64_t kspl_smod(int64_t a, int64_t b, const char* file, int line)
{
    if (kspl_div_check(b, file, line) == -1) {
        return 0;
    }
    return a % b;
}

/* A string literal as the slice `type` (the node's own C type: each `Slice<|U8|>` instance is its
 * own struct). The literal is written once; `sizeof` counts its bytes, a NUL inside included. */
#define KSPL_STR(type, lit) ((type){ .ptr = (uint8_t*)(lit), .len = (ptrdiff_t)(sizeof(lit) - 1) })

#define KSPL_OK(type, ...) ((type){ .val = (__VA_ARGS__), .is_err = false })
#define KSPL_ERR(type, ...) ((type){ .error_code = (__VA_ARGS__), .is_err = true })
