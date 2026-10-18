/* The C runtime definitions for bare metal, included in one translation unit only.
 * freestanding.h holds the macros and static functions that generated code calls directly. */

/* Clang inserts these AAPCS calls to initialize or copy structs at 4-byte or 8-byte boundaries.
 * libgcc does not provide them. Every freestanding compilation includes this runtime.
 * Caution: Keep these helpers out of std/mem.kspl. Clang's implicit calls are absent from KSPL's
 * call graph. If std/mem is unreachable, ksplc omits it and the linker cannot find the helpers. */
static void kspl_zero_bytes(void *dest, Sz n) {
    unsigned char *d = (unsigned char *)dest;
    for (Sz i = 0; i < n; i++) {
        d[i] = 0;
    }
}

static void kspl_copy_bytes(void *dest, const void *src, Sz n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    for (Sz i = 0; i < n; i++) {
        d[i] = s[i];
    }
}

void __aeabi_memclr(void *dest, Sz n) { kspl_zero_bytes(dest, n); }
void __aeabi_memclr4(void *dest, Sz n) { kspl_zero_bytes(dest, n); }
void __aeabi_memclr8(void *dest, Sz n) { kspl_zero_bytes(dest, n); }
void __aeabi_memcpy(void *dest, const void *src, Sz n) { kspl_copy_bytes(dest, src, n); }
void __aeabi_memcpy4(void *dest, const void *src, Sz n) { kspl_copy_bytes(dest, src, n); }
void __aeabi_memcpy8(void *dest, const void *src, Sz n) { kspl_copy_bytes(dest, src, n); }

/* Reads the stack pointer (SP) for std/lang.kspl's panic record in .noinit_panic.
 * KSPL's __kspl_asm_volatile accepts no operands on the LLVM target, so this helper uses C.
 * A register variable bound to "sp" does not reliably read its value. Use an output operand.
 * The freestanding tests also compile this file for the host, so each architecture needs its
 * own assembly. Unsupported architectures return 0. */
Sz kspl_get_sp(void) {
#if defined(__arm__)
    Sz sp;
    __asm__ volatile ("mov %0, sp" : "=r" (sp));
    return sp;
#elif defined(__x86_64__)
    Sz sp;
    __asm__ volatile ("mov %%rsp, %0" : "=r" (sp));
    return sp;
#else
    return 0;
#endif
}

/* A port supplies the readable word count, capped at capacity. Unknown bounds mean no read. */
__attribute__((weak)) Sz kspl_panic_stack_words(Sz sp, Sz capacity) {
    (void)sp;
    (void)capacity;
    return 0;
}

/* Returns the calling thread's lowest stack address for std/stack_limit, or 0 if unknown.
 * wasm32's linker places the stack between __stack_low and __stack_high. Without --stack-first,
 * the page's memory lies below the stack. Recursive code must stop before crossing that boundary.
 * Bare-metal linker scripts define their stack bounds, but this helper does not read them. */
#if defined(__wasm__)
extern unsigned char __stack_low;
KSPL_LINK Sz kspl_stack_floor(void) { return (Sz)&__stack_low; }
#else
KSPL_LINK Sz kspl_stack_floor(void) { return 0; }
#endif
