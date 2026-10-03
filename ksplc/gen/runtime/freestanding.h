/* The "declaration half" of the C runtime's preamble header (bare metal).
 *
 * Only macros and static / static inline functions may be placed here (the reason is at
 * the head of core.h). A substance carrying external linkage is on the freestanding.c side.
 *
 * **The canon for the meaning of the four run-time checks is the head of core.h.** This side
 * only stops when one is broken; with no output it ignores `file` / `line`.
 * Caution: **Throw an unused argument away with `(void)`**, or -Wunused-parameter fires
 * (Principle 2); `KSPL_UNUSED` is empty on a target without attributes. */


#define KSPL_PANIC(msg) while(1) {}

/* What core.c keeps per thread is one copy here: bare metal's thread-local storage needs a thread
 * pointer that only a port layer could give (`__thread` is a link error on arm-none-eabi). */
#define KSPL_PER_THREAD

static inline KSPL_UNUSED ptrdiff_t kspl_bounds_check(ptrdiff_t idx, ptrdiff_t len, const char* file, int line)
{
    (void)file; (void)line;
    if (idx < 0 || idx >= len) {
        while(1) {}
    }
    return idx;
}

static inline KSPL_UNUSED int64_t kspl_div_check(int64_t divisor, const char* file, int line)
{
    (void)file; (void)line;
    if (divisor == 0) {
        while(1) {}
    }
    return divisor;
}

static inline KSPL_UNUSED int64_t kspl_shift_check(int64_t amount, int64_t width, const char* file, int line)
{
    (void)file; (void)line;
    if (amount < 0 || amount >= width) {
        while(1) {}
    }
    return amount;
}
