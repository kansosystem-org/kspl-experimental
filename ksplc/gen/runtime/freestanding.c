/* The "substance half" of the C runtime's preamble header (bare metal).
 *
 * This side **enters one translation unit only**. The macros and static functions the
 * generated body calls directly are on the freestanding.h side. */

/* The AAPCS runtime calls clang generates for a struct's zero initialization (`::{}`) or copy
 * at a 4/8-byte boundary. libgcc does not hold them, so they are provided here.
 * Caution: They must not be implemented as KSPL functions in std/mem.kspls. Where std/mem is
 * unreachable ksplc does not put it out, and __aeabi_memclr4 and the like become undefined
 * symbols (clang calls them implicitly, unseen by KSPL's reachability). The C runtime is taken
 * into every freestanding compilation unconditionally. */
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

/* Reads the current SP for the "fragment of the stack" std/sys.kl's freestanding panic() leaves
 * in the crash record (.noinit_panic). KSPL cannot write inline assembly with operands
 * (__kspl_asm_volatile takes none on the LLVM target), hence this C helper.
 * `register void *sp asm("sp")` is not guaranteed to read the current value (clang warns "used
 * uninitialized"), so an output-operand mov is issued.
 * tests/freestanding/ compiles this file for the host too, so the assembly branches per
 * architecture (ARM's "mov %0, sp" does not assemble on x86_64). */


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
