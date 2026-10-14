/* A 128-bit product, which wasm32 has no instruction for: clang calls its helper `__multi3`, found
 * only in clang's own builtins library for wasm32. clang 22 also makes one of a 64-by-64 product
 * written in 32-bit halves (std/bignat's `mul_wide`), so a module that links without that library
 * fails as soon as it formats a float. The operands are volatile, so the product is not folded. */
static volatile unsigned long long wide_a = 0xFFFFFFFFFFFFFFFFULL;
static volatile unsigned long long wide_b = 0xFFFFFFFFFFFFFFFFULL;

__attribute__((export_name("wide_hi"))) long long wide_hi(void) {
    unsigned __int128 p = (unsigned __int128)wide_a * wide_b;
    return (long long)(p >> 64);
}
