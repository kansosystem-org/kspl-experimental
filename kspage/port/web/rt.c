/* wasm32 has no libc. clang puts out calls to memset / memcpy / memmove for struct
 * assignment and zero-filling, so they are readied here.
 *
 * Caution: **Do not add libc's other functions here.** Where something turns out to be missing,
 * look first at whether it is really needed. The more it grows, the less being freestanding means.
 *
 * **They cannot be placed in ksplc's freestanding runtime
 * (`ksplc/gen/runtime/freestanding.c`).** That one is taken in even where it links with a real
 * libc (`tests/freestanding/`), so defining the same names duplicates them. What a text shares
 * with libc goes on the side of the target that has no libc. */
typedef unsigned long Wsz;

void *memset(void *dest, int c, Wsz n) {
    unsigned char *d = (unsigned char *)dest;
    for (Wsz i = 0; i < n; i++) {
        d[i] = (unsigned char)c;
    }
    return dest;
}

void *memcpy(void *dest, const void *src, Wsz n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    for (Wsz i = 0; i < n; i++) {
        d[i] = s[i];
    }
    return dest;
}

/* Overlap is allowed.
   Caution: Drop the case of copying from the back and a shift in the growing direction breaks. */
void *memmove(void *dest, const void *src, Wsz n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    if (d == s || n == 0) {
        return dest;
    }
    if (d < s) {
        for (Wsz i = 0; i < n; i++) {
            d[i] = s[i];
        }
    } else {
        for (Wsz i = n; i > 0; i--) {
            d[i - 1] = s[i - 1];
        }
    }
    return dest;
}
