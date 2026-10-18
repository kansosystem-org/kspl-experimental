/* The "declaration half" of the C runtime's preamble header (bare metal).
 *
 * Only macros and static / static inline functions can be placed here (the reason is at
 * the head of core.h). A substance carrying external linkage is on the freestanding.c side.
 *
 * **The canon for the meaning of the four run-time checks is the head of core.h.** This side
 * only stops when one is broken; with no output it ignores `file` / `line`.
 * Caution: **Throw an unused argument away with `(void)`**, or -Wunused-parameter fires
 * (Principle 2); `KSPL_UNUSED` is empty on a target without attributes. */

/* What core.c keeps per thread is one copy here. Bare metal's thread-local storage needs a thread
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

static inline KSPL_UNUSED int64_t kspl_shift_check(int64_t amount, int64_t width, int amount_unsigned,
    const char* file, int line)
{
    (void)amount_unsigned; (void)file; (void)line;
    if (amount < 0 || amount >= width) {
        while(1) {}
    }
    return amount;
}

static inline KSPL_UNUSED int64_t kspl_tag_check(int64_t value, const int64_t* tags, int64_t count,
    const char* enum_name, const char* file, int line)
{
    (void)enum_name; (void)file; (void)line;
    for (int64_t i = 0; i < count; i++) {
        if (tags[i] == value) {
            return value;
        }
    }
    while(1) {}
}
