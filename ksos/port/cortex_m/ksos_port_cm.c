// ==========================================
// Kanso OS — the ARM Cortex-M port (making a context, starting a switch, the preemptive tick).
// The threads run on PSP and the exception handlers on MSP. The switch itself is PendSV
// (switch.S).
// For a microcontroller with no malloc, contexts are taken from a static pool.
// ==========================================
#include <stdint.h>
#include <stddef.h>

// The context shared with switch.S / PendSV: it holds the saved PSP at its head.
typedef struct {
    void* sp;
} ksos_ctx;

extern void ksos_trampoline(void); // the task's starting point, #exported by the KSPL kernel

// The switch's from and to for PendSV (set by ksos_port_switch; external linkage is needed).
ksos_ctx* g_pendsv_from;
ksos_ctx* g_pendsv_to;

// The static pool: the scheduler's (the main) context plus one per task. A deleted task's context
// is marked free (ksos_port_ctx_free) and taken again by a later create.
#define KSOS_CM_MAX_CTX 33
static ksos_ctx g_ctx_pool[KSOS_CM_MAX_CTX];
static uint8_t g_ctx_busy[KSOS_CM_MAX_CTX];

// Where PendSV saves a thread whose context is gone (a task that deleted itself); nothing reads it.
static ksos_ctx g_ctx_discard;

static ksos_ctx* alloc_ctx(void) {
    for (int i = 0; i < KSOS_CM_MAX_CTX; i++) {
        if (!g_ctx_busy[i]) {
            g_ctx_busy[i] = 1;
            return &g_ctx_pool[i];
        }
    }
    return NULL;
}

// PENDSVSET reads 1 while PendSV is pending.
static int pendsv_pending(void) {
    return (*(volatile uint32_t*)0xE000ED04u & (1u << 28)) != 0u; // SCB->ICSR
}

// Makes, on the named stack, an initial frame PendSV can restore. PendSV pops {r4-r11}, and the
// exception return that follows pops {r0-r3,r12,lr,pc,xPSR} and enters pc (= ksos_trampoline).
void* ksos_port_ctx_create(void* stack, long stack_size) {
    ksos_ctx* c = alloc_ctx();
    if (c == NULL) {
        return NULL;
    }
    uintptr_t top = ((uintptr_t)stack + (uintptr_t)stack_size) & ~(uintptr_t)7;
    uint32_t* sp = (uint32_t*)top - 16; // {r4-r11}(8) + {r0-r3,r12,lr,pc,xPSR}(8)
    for (int i = 0; i < 16; i++) {
        sp[i] = 0; // r4-r11, r0-r3, r12 = 0
    }
    sp[13] = 0xFFFFFFFFu;                          // lr (a task does not return)
    sp[14] = (uint32_t)(uintptr_t)ksos_trampoline;  // pc = the trampoline
    sp[15] = 0x01000000u;                          // xPSR (the T bit)
    c->sp = sp;
    return c;
}

// The scheduler's (the main) context; PendSV saves sp on the first switch away.
void* ksos_port_ctx_create_main(void) {
    return alloc_ctx();
}

// Returns a deleted task's context to the pool (the kernel calls it in a critical section). A
// pending switch may still be about to save the thread running into it: that save goes to the
// discard instead, or a create taking the slot first would have its new frame overwritten.
void ksos_port_ctx_free(void* ctx) {
    ksos_ctx* c = (ksos_ctx*)ctx;
    if (pendsv_pending() && g_pendsv_from == c) {
        g_pendsv_from = &g_ctx_discard;
    }
    g_ctx_busy[c - g_ctx_pool] = 0;
}

// Saves from and switches to to. The body is PendSV. In thread mode pend plus isb switches at
// once, and from handler mode (SysTick and the like) it is tail-chained after that handler returns.
// While a switch is still pending, the thread running is the pending switch's from, not the from
// handed in (the kernel already counts the pending switch's to as current), so only to changes.
// It happens when a second schedule() comes before PendSV runs: an interrupt handler giving
// between another handler's schedule() and PendSV. A null from (the running task was deleted)
// saves into the discard.
void ksos_port_switch(void* from, void* to) {
    if (!pendsv_pending()) {
        g_pendsv_from = from != NULL ? (ksos_ctx*)from : &g_ctx_discard;
    }
    g_pendsv_to = (ksos_ctx*)to;
    *(volatile uint32_t*)0xE000ED04u = (1u << 28); // SCB->ICSR: PENDSVSET
    __asm__ volatile("dsb; isb");
}

// Starts SysTick at a period of reload cycles, and sets PendSV's priority too.
void ksos_port_tick_start(uint32_t reload) {
    // SHPR3: PendSV (bits23:16) and SysTick (bits31:24) share the lowest priority, so SysTick
    // tail-chains after a PendSV in progress and g_pendsv_from/to is not broken mid-switch.
    * (volatile uint32_t*)0xE000ED20u |= (0xFFu << 16) | (0xFFu << 24);
    * (volatile uint32_t*)0xE000E014u = reload;          // SysTick->LOAD
    * (volatile uint32_t*)0xE000E018u = 0;               // SysTick->VAL
    * (volatile uint32_t*)0xE000E010u = 0x7u;            // SysTick->CTRL: ENABLE|TICKINT|CLKSOURCE
}

// The critical section: it forbids interrupts (cpsid i) and returns the previous PRIMASK, which
// restore puts back, so it nests.
uint32_t ksos_port_irq_save(void) {
    uint32_t primask;
    __asm__ volatile("mrs %0, primask\n\tcpsid i" : "=r"(primask)::"memory");
    return primask;
}

void ksos_port_irq_restore(uint32_t primask) {
    __asm__ volatile("msr primask, %0" ::"r"(primask) : "memory");
}

// Whether it is handler mode (IPSR is 0 in thread mode); the kernel stops "waiting inside an ISR"
// with it.
uint32_t ksos_port_in_isr(void) {
    uint32_t ipsr;
    __asm__ volatile("mrs %0, ipsr" : "=r"(ipsr));
    return ipsr != 0u;
}

// The kernel's tick handling. **It is weak**: `ksos/kernel/task.kspl` exports the real one, and
// a probe that runs no scheduler links this empty one instead of writing its own.
void __attribute__((weak)) ksos_tick(void) {
}

// The SysTick interrupt, delegating to the kernel's tick handling.
void SysTick_Handler(void) {
    ksos_tick();
}

// WFI rests the CPU until the next interrupt. A demo uses it to show an interrupt-driven driver
// really is woken by an interrupt (with the NVIC set up wrong, it never returns).
void ksos_port_wfi(void) {
    __asm__ volatile("wfi");
}

// The default handler for UART0's RX interrupt (NVIC IRQ0, on the mps2-an385). The vector table
// always refers to it; being weak, it stays this empty one where the interrupt-driven UART driver
// is not linked.
void __attribute__((weak)) uart0_irq0_handler(void) {
}
