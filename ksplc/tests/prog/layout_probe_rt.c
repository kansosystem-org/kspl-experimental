/* What a wasm32 module built from `layout_probe.kspl` borrows from a libc it does not have.
 * clang lowers a struct copy or a zero fill to these calls even under -ffreestanding, and wasm has
 * no library to resolve them from. Byte by byte: the probe copies a few hundred bytes. */
#include <stddef.h>

void *memset(void *dest, int c, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    while (n-- > 0) *d++ = (unsigned char)c;
    return dest;
}

void *memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    while (n-- > 0) *d++ = *s++;
    return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    if (d < s) {
        while (n-- > 0) *d++ = *s++;
    } else {
        while (n-- > 0) d[n] = s[n];
    }
    return dest;
}
