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

// The static pool: the scheduler's (the main) context plus one per task.
#define KSOS_CM_MAX_CTX 33
static ksos_ctx g_ctx_pool[KSOS_CM_MAX_CTX];
static int g_ctx_used = 0;

static ksos_ctx* alloc_ctx(void) {
    if (g_ctx_used >= KSOS_CM_MAX_CTX) {
        return NULL;
    }
    return &g_ctx_pool[g_ctx_used++];
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

// Saves from and switches to to. The body is PendSV. In thread mode pend plus isb switches at
// once, and from handler mode (SysTick and the like) it is tail-chained after that handler returns.
void ksos_port_switch(void* from, void* to) {
    g_pendsv_from = (ksos_ctx*)from;
    g_pendsv_to = (ksos_ctx*)to;
    * (volatile uint32_t*)0xE000ED04u = (1u << 28); // SCB->ICSR: PENDSVSET
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

// The SysTick interrupt, delegating to the kernel's tick handling.
extern void ksos_tick(void);
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
