// ==========================================
// Kanso OS — the atomic operations for the RP2040 (Armv6-M). They are made with SIO's hardware
// spinlock.
//
// Armv6-M has no exclusive-access instructions (LDREX/STREX), so ksplc's runtime
// (ksplc/gen/runtime/core.c) **defines no** atomic helper for this architecture. That is
// why std/mem's heap (mem.alloc), Arc and std/thread's Atomic_sz could not link, with "undefined
// symbol: kspl_atomic_cas". This fills that hole. It is particular to the RP2040, so it is put in
// the port layer rather than on ksplc's side (ksplc does not know the target CPU).
//
// Caution: **The interrupt mask alone must not stand in for it.** PRIMASK stops only its own core,
// so it breaks quietly once core1 is used; SIO's spinlock holds between the cores.
//
// **PRIMASK is needed together with it.** The spinlock is not re-entrant: an interrupt reaching
// here while it is held freezes waiting for itself. So interrupts stop before taking it and come
// back after releasing it.
//
// It protects one read-modify-write alone: mem.alloc from an ISR while std/mem's heap spinlock is
// held still freezes, which is why ksos/kernel/heap.kspls puts irq_save/irq_restore around it.
// ==========================================
#include <stdint.h>
#include <stddef.h>

// Caution: It **has to be the same width** as the `Sz` (= ptrdiff_t) in the C ksplc generates. The
// KSPL side's extern "C" declarations (std/mem.kspls, std/thread.kspls) are written with Sz.
typedef ptrdiff_t Sz;

// It asks by the same condition as ksplc/gen/runtime/core.c, the side it stands in for.
#if __GCC_ATOMIC_POINTER_LOCK_FREE == 2 || __CLANG_ATOMIC_POINTER_LOCK_FREE == 2
#error "ksos_atomic_sio.c is only for cores without LDREX/STREX (Armv6-M). On a target whose atomic builtins are lock-free, ksplc/gen/runtime/core.c already defines these and the symbols would collide."
#endif

// SIO_BASE + 0x100 is SPINLOCK0, and from there in steps of 4 bytes up to SPINLOCK31 (the RP2040
// data sheet's 2.3.1.7 / the SIO register listing). Reading it tries to take it and returns
// **non-zero once taken, and 0 where it was not**. Writing it (with any value) releases it.
#define SIO_BASE 0xd0000000u
#define SIO_SPINLOCK0_OFFSET 0x100u

// The lock number used: outside pico-sdk's 0 to 23 (PICO_SPINLOCK_ID_STRIPED_LAST), should the
// two ever be linked together.
#define KSOS_ATOMIC_SPINLOCK_ID 31u

// Caution: Get the address wrong and the link and the start-up get through and **it freezes on the
// first lock** (a missing register reads 0, "somebody else holds it"), seen only on the real
// thing; so the computed result is pinned down at build time.
_Static_assert(SIO_BASE + SIO_SPINLOCK0_OFFSET + KSOS_ATOMIC_SPINLOCK_ID * 4u == 0xd000017cu,
               "SIO spinlock address changed: check SIO_BASE / SPINLOCK0 offset / lock id");

extern uint32_t ksos_port_irq_save(void);
extern void ksos_port_irq_restore(uint32_t state);

static inline volatile uint32_t *ksos_atomic_lock_reg(void) {
    return (volatile uint32_t *)(uintptr_t)(SIO_BASE + SIO_SPINLOCK0_OFFSET +
                                            KSOS_ATOMIC_SPINLOCK_ID * 4u);
}

// Stops interrupts and then takes the spinlock. The return value is the PRIMASK handed to
// ksos_atomic_unlock.
static inline uint32_t ksos_atomic_lock(void) {
    uint32_t state = ksos_port_irq_save();
    volatile uint32_t *lock = ksos_atomic_lock_reg();
    while (*lock == 0u) {
        // Each read tries to take it. While 0 comes back, somebody else holds it.
    }
    __asm__ volatile("dmb" ::: "memory");
    return state;
}

static inline void ksos_atomic_unlock(uint32_t state) {
    __asm__ volatile("dmb" ::: "memory");
    * ksos_atomic_lock_reg() = 0u; // writing releases it (the value is not asked about)
    ksos_port_irq_restore(state);
}

Sz kspl_atomic_add(Sz *ptr, Sz delta) {
    uint32_t state = ksos_atomic_lock();
    Sz old = *ptr;
    * ptr = old + delta;
    ksos_atomic_unlock(state);
    return old;
}

// It returns **the value observed** either way (the caller compares against expected), as
// hosted.c's and freestanding.c's do.
Sz kspl_atomic_cas(Sz *ptr, Sz expected, Sz new_val) {
    uint32_t state = ksos_atomic_lock();
    Sz actual = *ptr;
    if (actual == expected) {
        * ptr = new_val;
    }
    ksos_atomic_unlock(state);
    return actual;
}

// load and store take no spinlock: an aligned 32-bit access is single-copy atomic on Armv6-M, so
// only the ordering (dmb) is needed.
Sz kspl_atomic_load(Sz *ptr) {
    Sz v = *(volatile Sz *)ptr;
    __asm__ volatile("dmb" ::: "memory");
    return v;
}

void kspl_atomic_store(Sz *ptr, Sz val) {
    __asm__ volatile("dmb" ::: "memory");
    * (volatile Sz *)ptr = val;
    __asm__ volatile("dmb" ::: "memory");
}
