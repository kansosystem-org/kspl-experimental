/* The C half of narrow_c_abi.kspl: clang builds it at -O2, `make test-llvm-abi` links them.
 * Each function reads a narrow value as clang does on x86-64 and Apple arm64: it takes the
 * register as already widened by the caller, and gives back its own narrow result widened. */
#include <stdbool.h>
#include <stdint.h>

#define PROBE __attribute__((noinline))

/* A value whose low bits are what the KSPL side passes on, and whose high bits are not zero. */
PROBE int64_t narrow_c_abi_src(int64_t i) { return 0x123456780000FFF0LL + i; }

PROBE int32_t narrow_c_abi_u8(uint8_t c) { return c; }
PROBE int32_t narrow_c_abi_i8(int8_t c) { return c; }
PROBE int32_t narrow_c_abi_u16(uint16_t c) { return c; }
PROBE int64_t narrow_c_abi_i16(int16_t c) { return c; }
PROBE int32_t narrow_c_abi_bool(bool b) { return b; }

/* The other direction: KSPL defines these (`extern "C"`) and C relies on the result widened. */
uint8_t narrow_c_abi_back_u8(int64_t v);
int16_t narrow_c_abi_back_i16(int64_t v);
bool narrow_c_abi_back_bool(int64_t v);

PROBE int64_t narrow_c_abi_call_back(int64_t v) {
    int64_t sum = narrow_c_abi_back_u8(v);
    sum += narrow_c_abi_back_i16(v);
    sum += narrow_c_abi_back_bool(v);
    return sum;
}
