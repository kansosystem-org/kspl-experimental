/* The "declaration half" of the C runtime's preamble header (bare metal).
 *
 * Only macros and static / static inline functions can be placed here (the reason is at
 * the head of core.h). A substance carrying external linkage is on the freestanding.c side.
 *
 * **The four run-time checks are core.h's.** This side only says what a breach does: it builds
 * the message hosted.c prints, without the `panic: ` and the place, and stops as std/lang's
 * `panic` does.
 * Caution: **Throw an unused argument away with `(void)`**, or -Wunused-parameter fires
 * (Principle 2); `KSPL_UNUSED` is empty on a target without attributes. */

/* What core.c keeps per thread is one copy here. Bare metal's thread-local storage needs a thread
 * pointer that only a port layer could give (`__thread` is a link error on arm-none-eabi). */
#define KSPL_PER_THREAD

/* What a breach of `kspl_bounds_check` and the other checks in core.h does here: it is a panic.
 * std/lang's `check_panic` writes the panic record and calls the program's `panic_hook` once, then
 * stops. **Do not stop in a loop of one's own**: a hook that stops the motors would be skipped, and
 * an index out of range would leave them turning. The place is left out, as `panic` leaves it out
 * of the record (a path takes the message's room). genc defines `kspl_check_panic` as a call of
 * std/lang's function (`emit_check_panic` in gen/c/root.kspl).
 * Caution: **Code that must not leave RAM carries no check that can fire** (a Flash window, as
 * ksos's `send_window`): a breach there calls into Flash. ksos's `make test-ksos-ramtext` finds
 * the call. */
KSPL_NORETURN void kspl_check_panic(U8 *msg_ptr, Sz msg_len);

/* The message's room: std/lang's `PANIC_MSG_CAP`, all the record keeps. A longer one is cut. */
#define KSPL_CHECK_MSG_CAP 128

static inline KSPL_UNUSED Sz kspl_msg_text(U8 *buf, Sz at, const char *text)
{
    while (*text != 0 && at < KSPL_CHECK_MSG_CAP) buf[at++] = (U8)*text++;
    return at;
}

/* A number in decimal; `negative` puts the `-` before the magnitude, so the minimum prints too. */
static inline KSPL_UNUSED Sz kspl_msg_digits(U8 *buf, Sz at, uint64_t magnitude, int negative)
{
    char digits[21];
    int n = 0;
    do {
        digits[n++] = (char)('0' + (int)(magnitude % 10));
        magnitude /= 10;
    } while (magnitude != 0);
    if (negative && at < KSPL_CHECK_MSG_CAP) buf[at++] = '-';
    while (n > 0 && at < KSPL_CHECK_MSG_CAP) buf[at++] = (U8)digits[--n];
    return at;
}

static inline KSPL_UNUSED Sz kspl_msg_i64(U8 *buf, Sz at, int64_t v)
{
    return kspl_msg_digits(buf, at, v < 0 ? 0 - (uint64_t)v : (uint64_t)v, v < 0);
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_bounds_breach(int64_t idx, int64_t len,
    const char* file, int line)
{
    U8 buf[KSPL_CHECK_MSG_CAP];
    Sz at = kspl_msg_text(buf, 0, "index out of bounds in array (idx: ");
    (void)file; (void)line;
    at = kspl_msg_i64(buf, at, idx);
    at = kspl_msg_text(buf, at, ", len: ");
    at = kspl_msg_i64(buf, at, len);
    at = kspl_msg_text(buf, at, ")");
    kspl_check_panic(buf, at);
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_div_breach(const char* file, int line)
{
    U8 buf[KSPL_CHECK_MSG_CAP];
    (void)file; (void)line;
    kspl_check_panic(buf, kspl_msg_text(buf, 0, "division by zero"));
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_shift_breach(int64_t amount, int64_t width,
    int amount_unsigned, const char* file, int line)
{
    U8 buf[KSPL_CHECK_MSG_CAP];
    Sz at = kspl_msg_text(buf, 0, "shift amount out of range (amount: ");
    (void)file; (void)line;
    at = amount_unsigned ? kspl_msg_digits(buf, at, (uint64_t)amount, 0)
        : kspl_msg_i64(buf, at, amount);
    at = kspl_msg_text(buf, at, ", width: ");
    at = kspl_msg_i64(buf, at, width);
    at = kspl_msg_text(buf, at, ")");
    kspl_check_panic(buf, at);
}

static inline KSPL_UNUSED KSPL_NORETURN void kspl_tag_breach(int64_t value, const char* enum_name,
    const char* file, int line)
{
    U8 buf[KSPL_CHECK_MSG_CAP];
    Sz at = kspl_msg_text(buf, 0, "enum ");
    (void)file; (void)line;
    at = kspl_msg_text(buf, at, enum_name != NULL ? enum_name : "?");
    at = kspl_msg_text(buf, at, " has no tag ");
    at = kspl_msg_i64(buf, at, value);
    kspl_check_panic(buf, at);
}
