/* The "substance half" of the C runtime's preamble header (common to both targets).
 *
 * This side **enters one translation unit only**. The declarations are on core.h, and that
 * one enters every translation unit, so a substance with external linkage is placed here. */


#ifndef KSPL_MAX_TRACE_DEPTH
#define KSPL_MAX_TRACE_DEPTH 64
#endif

typedef struct {
    const char* file;
    const char* func;
    int line;
} kspl_trace_frame;

/* The error route core.h describes.
 * Caution: **Keep it per thread** (KSPL_PER_THREAD): shared, two threads failing at once write
 * over each other's route, and print_trace shows a mix of the two. */
static KSPL_PER_THREAD kspl_trace_frame kspl_error_trace_data[KSPL_MAX_TRACE_DEPTH];
static KSPL_PER_THREAD int kspl_error_trace_count;

KSPL_LINK void kspl_trace_record(const char* file, const char* func, int line) {
    if (kspl_error_trace_count < KSPL_MAX_TRACE_DEPTH) {
        kspl_error_trace_data[kspl_error_trace_count].file = file;
        kspl_error_trace_data[kspl_error_trace_count].func = func;
        kspl_error_trace_data[kspl_error_trace_count].line = line;
        kspl_error_trace_count++;
    }
}

KSPL_LINK void kspl_trace_start(const char* file, const char* func, int line) {
    kspl_error_trace_count = 0;
    kspl_trace_record(file, func, line);
}

/* The two readers std/sys.kspl declares, which gives them their prototypes.
 * Caution: **Spell the types as it does** (`U8@$@` is `const U8**`), or it is `conflicting types`. */
KSPL_LINK int kspl_error_trace_depth(void) {
    return kspl_error_trace_count;
}

KSPL_LINK void kspl_get_trace_frame_info(int index, const U8** out_file, const U8** out_func, int* out_line) {
    *out_file = (const U8*)kspl_error_trace_data[index].file;
    *out_func = (const U8*)kspl_error_trace_data[index].func;
    *out_line = kspl_error_trace_data[index].line;
}

/* Where the calling thread's stack is now, for std/stack_limit to compare with kspl_stack_floor.
 * Caution: **Not a local's address.** The address sanitizer moves a local whose address is taken
 * onto a stack of its own on the heap, to catch a use after return, so that address says nothing
 * of how deep the thread's stack is. A frame's own address is always on the thread's stack. */
KSPL_LINK Sz kspl_stack_here(void) {
    return (Sz)(intptr_t)__builtin_frame_address(0);
}

/* The atomic operations (std/mem.kspl's Arc<T> and the freestanding heap's spinlock,
 * std/thread.kspl's Atomic_sz) on the clang/gcc builtins, needing no <stdatomic.h> at -std=c99.
 * Caution: On a core holding no LDREX/STREX (Armv6-M: Cortex-M0+, the RP2040) they are **not
 * defined**: the builtin would become a library call, and only the port layer knows the chip's
 * inter-core exclusion. POINTER_LOCK_FREE judges it (Sz is pointer-wide; 2 = always lock-free),
 * **asked by both names**: clang targeting MSVC leaves the GCC one undefined. */
#if __GCC_ATOMIC_POINTER_LOCK_FREE == 2 || __CLANG_ATOMIC_POINTER_LOCK_FREE == 2
KSPL_LINK Sz kspl_atomic_add(Sz *ptr, Sz delta) {
    return __atomic_fetch_add(ptr, delta, __ATOMIC_SEQ_CST);
}

/* Returns what was in *ptr either way (success is the return value == expected). Weak_arc<T>'s
 * upgrade() adds 1 only while strong is not 0, which fetch-add cannot do without a race. */
KSPL_LINK Sz kspl_atomic_cas(Sz *ptr, Sz expected, Sz new_val) {
    Sz actual = expected;
    __atomic_compare_exchange_n(ptr, &actual, new_val, 0, __ATOMIC_SEQ_CST, __ATOMIC_SEQ_CST);
    return actual;
}

KSPL_LINK Sz kspl_atomic_load(Sz *ptr) {
    return __atomic_load_n(ptr, __ATOMIC_SEQ_CST);
}

KSPL_LINK void kspl_atomic_store(Sz *ptr, Sz val) {
    __atomic_store_n(ptr, val, __ATOMIC_SEQ_CST);
}
#endif /* POINTER_LOCK_FREE == 2 */
