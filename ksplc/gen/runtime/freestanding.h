/* The "declaration half" of the C runtime's preamble header (bare metal).
 *
 * Only macros and static / static inline functions can be placed here (the reason is at
 * the head of core.h). A substance carrying external linkage is on the freestanding.c side.
 *
 * **The four run-time checks are core.h's.** This side only says what a breach does: it stops,
 * and with no output it ignores every argument.
 * Caution: **Throw an unused argument away with `(void)`**, or -Wunused-parameter fires
 * (Principle 2); `KSPL_UNUSED` is empty on a target without attributes. */

/* What core.c keeps per thread is one copy here. Bare metal's thread-local storage needs a thread
 * pointer that only a port layer could give (`__thread` is a link error on arm-none-eabi). */
#define KSPL_PER_THREAD

/* What a breach of `kspl_bounds_check` and the other checks in core.h does here: stop. */
static inline KSPL_UNUSED KSPL_NORETURN void kspl_bounds_breach(int64_t idx, int64_t len,
    const char* file, int line)
{
    (void)idx; (void)len; (void)file; (void)line;
    while(1) {}
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_div_breach(const char* file, int line)
{
    (void)file; (void)line;
    while(1) {}
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_shift_breach(int64_t amount, int64_t width,
    int amount_unsigned, const char* file, int line)
{
    (void)amount; (void)width; (void)amount_unsigned; (void)file; (void)line;
    while(1) {}
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_tag_breach(int64_t value, const char* enum_name,
    const char* file, int line)
{
    (void)value; (void)enum_name; (void)file; (void)line;
    while(1) {}
}
