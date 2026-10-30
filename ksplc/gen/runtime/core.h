/* The "declaration half" of the C runtime's preamble header (common to both targets).
 * **Only macros, typedefs, extern declarations and static inline functions.** This enters every
 * generated unit, so a definition with external linkage would be doubled (it goes in core.c).
 * **The five run-time checks** (`kspl_bounds_check`, `kspl_div_check`, `kspl_sdiv` / `kspl_smod`,
 * `kspl_shift_check`, `kspl_tag_check`) are all below. Each target's header gives only what a
 * breach does. **Signed `/` `%` never go out bare**: a minimum by -1 is undefined in C, so
 * `a / -1` wraps to -a and `a % -1` is 0.
 * **Widths are `int64_t`, not `ptrdiff_t`**: a 32-bit target truncates an `I64`, and a non-zero
 * divisor would read as 0. A shift's `width` is counted at the portable lower bound. The signed
 * pair has a 32-bit twin for types of 32 bits and fewer. Genc picks it by the operand's type.
 * Caution: **Take `file` / `line` in the same order on both sides**: genc puts one call out. */

#if defined(__GNUC__) || defined(__clang__)
#define KSPL_UNUSED __attribute__((unused))
#define KSPL_NORETURN __attribute__((noreturn))
#else
#define KSPL_UNUSED
#define KSPL_NORETURN
#endif

/* The linkage of the runtime's own functions and data. Under `--library` the generated C defines
 * KSPL_LIBRARY before this file. They are then `static`, as is every symbol of the library but an
 * `#export`: each library in a program keeps its own runtime. Elsewhere the word is empty.
 * Caution: **Put it on every declaration and definition of a runtime symbol.** C refuses a `static`
 * definition after a declaration without it (genc writes std's `extern` declarations with it). */
#if defined(KSPL_LIBRARY)
#define KSPL_LINK static KSPL_UNUSED
#else
#define KSPL_LINK
#endif

/* The mark on a function carrying `#export`. On wasm it is `export_name`. In a library built for
 * Windows it is `dllexport`, which a DLL needs to export it. Elsewhere it is empty.
 * Caution: **On wasm it is itself the list of functions exported to the host.** Without it,
 * wasm-ld's `--gc-sections` drops the function, and a forgotten `--export=` passes in silence. */
#if defined(__wasm__)
#define KSPL_EXPORT(name) __attribute__((export_name(#name)))
#elif defined(_WIN32) && defined(KSPL_LIBRARY)
#define KSPL_EXPORT(name) __declspec(dllexport)
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

/* What is recorded is the `?` propagation route one error followed, **one route per thread**
 * (the storage is core.c's, as each target spells KSPL_PER_THREAD). std/sys.kspl reads it back.
 * Caution: **Begin the chain at a `throw` and extend it by `?` alone.** Guessed by "did it return
 * a success", it keeps the frames of failures that `catch` handled. A later route rides on them. */
KSPL_LINK void kspl_trace_start(const char* file, const char* func, int line);
KSPL_LINK void kspl_trace_record(const char* file, const char* func, int line);

#define KSPL_RECORD_TRACE() kspl_trace_record(__FILE__, __func__, __LINE__)
#define KSPL_START_TRACE() kspl_trace_start(__FILE__, __func__, __LINE__)

/* What a breach does is each target's, defined after this file: hosted.h reports it and ends the
 * program, freestanding.h panics through std/lang (the hook runs, then it stops). */
static inline KSPL_UNUSED KSPL_NORETURN void kspl_bounds_breach(int64_t idx, int64_t len,
    const char* file, int line);
static inline KSPL_UNUSED KSPL_NORETURN void kspl_div_breach(const char* file, int line);
static inline KSPL_UNUSED KSPL_NORETURN void kspl_shift_breach(int64_t amount, int64_t width,
    int amount_unsigned, const char* file, int line);
static inline KSPL_UNUSED KSPL_NORETURN void kspl_tag_breach(int64_t value, const char* enum_name,
    const char* file, int line);

static inline KSPL_UNUSED ptrdiff_t kspl_bounds_check(ptrdiff_t idx, ptrdiff_t len, const char* file, int line)
{
    if (idx < 0 || idx >= len) {
        kspl_bounds_breach(idx, len, file, line);
    }
    return idx;
}

static inline KSPL_UNUSED int64_t kspl_div_check(int64_t divisor, const char* file, int line)
{
    if (divisor == 0) {
        kspl_div_breach(file, line);
    }
    return divisor;
}

/* `amount_unsigned` says the amount's own type is unsigned, so its 64 bits are printed as a `U64`:
 * read as `int64_t`, 2^64-1 would be reported as -1. Either way such an amount is out of range. */
static inline KSPL_UNUSED int64_t kspl_shift_check(int64_t amount, int64_t width, int amount_unsigned,
    const char* file, int line)
{
    if (amount < 0 || amount >= width) {
        kspl_shift_breach(amount, width, amount_unsigned, file, line);
    }
    return amount;
}

/* A cast to an enum from a number: the value must be one of the enum's `count` tags. The tags come
 * as an array, so the cast's operand is evaluated once. */
static inline KSPL_UNUSED int64_t kspl_tag_check(int64_t value, const int64_t* tags, int64_t count,
    const char* enum_name, const char* file, int line)
{
    int64_t i = 0;
    while (i < count && tags[i] != value) {
        i++;
    }
    if (i == count) {
        kspl_tag_breach(value, enum_name, file, line);
    }
    return value;
}

/* Signed division and remainder go through these (the meaning is settled at the head).
 * Caution: Put out bare, x86 stops with SIGFPE and ARM does not. */

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

/* The pair at 32 bits, for `I32` and narrower (and a 32-bit target's `Sz`).
 * Caution: **Keep it apart from the `int64_t` pair.** A 32-bit core has no 64-bit divide: there
 * every `I32` division would become a call to a software one (`__aeabi_ldivmod` on Arm). */
static inline KSPL_UNUSED int32_t kspl_sdiv32(int32_t a, int32_t b, const char* file, int line)
{
    if (kspl_div_check(b, file, line) == -1) {
        return (int32_t)((uint32_t)0 - (uint32_t)a);
    }
    return a / b;
}

static inline KSPL_UNUSED int32_t kspl_smod32(int32_t a, int32_t b, const char* file, int line)
{
    if (kspl_div_check(b, file, line) == -1) {
        return 0;
    }
    return a % b;
}

/* A cast from floating point to an integer **saturates**. NaN gives 0, a value below the type's
 * range its minimum, one above its maximum. Anything else is truncated toward zero. genc
 * calls `kspl_<F32|F64>_to_<I|U><bits>` for a value known only at run time; a constant is folded.
 * Caution: **Never cast bare.** C leaves a value the type cannot hold undefined: x86 answers the
 * minimum, Arm saturates, and an optimizer can answer anything. The bounds are powers of two, so
 * `F32` holds them exactly. genllvm's `llvm.fpto[su]i.sat` gives the same answers. */
#define KSPL_FLOAT_TO_INT(F, T, LO, HI, MIN, MAX)                                                   \
    static inline KSPL_UNUSED T kspl_##F##_to_##T(F x)                                              \
    {                                                                                               \
        if (x != x) {                                                                               \
            return 0;                                                                               \
        }                                                                                           \
        if (x <= (F)(LO)) {                                                                         \
            return MIN;                                                                             \
        }                                                                                           \
        if (x >= (F)(HI)) {                                                                         \
            return MAX;                                                                             \
        }                                                                                           \
        return (T)x;                                                                                \
    }
#define KSPL_FLOAT_TO_INTS(F)                                                                       \
    KSPL_FLOAT_TO_INT(F, I8, -0x1p7, 0x1p7, INT8_MIN, INT8_MAX)                                     \
    KSPL_FLOAT_TO_INT(F, I16, -0x1p15, 0x1p15, INT16_MIN, INT16_MAX)                                \
    KSPL_FLOAT_TO_INT(F, I32, -0x1p31, 0x1p31, INT32_MIN, INT32_MAX)                                \
    KSPL_FLOAT_TO_INT(F, I64, -0x1p63, 0x1p63, INT64_MIN, INT64_MAX)                                \
    KSPL_FLOAT_TO_INT(F, U8, 0, 0x1p8, 0, UINT8_MAX)                                                \
    KSPL_FLOAT_TO_INT(F, U16, 0, 0x1p16, 0, UINT16_MAX)                                             \
    KSPL_FLOAT_TO_INT(F, U32, 0, 0x1p32, 0, UINT32_MAX)                                             \
    KSPL_FLOAT_TO_INT(F, U64, 0, 0x1p64, 0, UINT64_MAX)
KSPL_FLOAT_TO_INTS(F32)
KSPL_FLOAT_TO_INTS(F64)

/* A string literal as the slice `type` (the node's own C type: each `Slice<|U8|>` instance is its
 * own struct). The literal is written once; `sizeof` counts its bytes, a NUL inside included. */
#define KSPL_STR(type, lit) ((type){ .ptr = (uint8_t*)(lit), .len = (ptrdiff_t)(sizeof(lit) - 1) })
/* The same slice where an initializer's braces stand alone (a file-scope initializer or a member of
 * one). C99 takes no compound literal there, as it is no constant expression. */
#define KSPL_STR_INIT(lit) { .ptr = (uint8_t*)(lit), .len = (ptrdiff_t)(sizeof(lit) - 1) }

/* A function carried as a `Void$@` (a thread's entry, say) and back. **ISO C converts between a
 * function and an object pointer by no cast.** Every target ksplc builds for gives the two one
 * representation (POSIX's `dlsym` and Windows's `GetProcAddress` rely on it). So a union carries
 * the bits across. Any function pointer converts to and from `kspl_any_fn` in ISO C. */
typedef void (*kspl_any_fn)(void);
union kspl_fn_obj { kspl_any_fn fn; void *obj; };
static inline KSPL_UNUSED void *kspl_fn_to_ptr(kspl_any_fn fn) {
    union kspl_fn_obj u;
    u.fn = fn;
    return u.obj;
}
static inline KSPL_UNUSED kspl_any_fn kspl_ptr_to_fn(void *obj) {
    union kspl_fn_obj u;
    u.obj = obj;
    return u.fn;
}

