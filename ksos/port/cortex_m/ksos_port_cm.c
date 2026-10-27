// ==========================================
// Kanso OS — the ARM Cortex-M port (making a context, starting a switch, the preemptive tick).
// The threads run on PSP and the exception handlers on MSP. The switch itself is PendSV
// (switch.S).
// For a microcontroller with no malloc, contexts are taken from a static pool.
// ==========================================
#include <stdint.h>
#include <stddef.h>

// The linker bounds RAM. A panic near its end must not read a full stack fragment past it.
extern unsigned char _sdata[], _estack[];
intptr_t kspl_panic_stack_words(intptr_t sp, intptr_t capacity) {
    uintptr_t address = (uintptr_t)sp;
    uintptr_t end = (uintptr_t)_estack;
    if (capacity <= 0 || address < (uintptr_t)_sdata || address >= end ||
        address % sizeof(intptr_t) != 0) {
        return 0;
    }
    intptr_t words = (intptr_t)((end - address) / sizeof(intptr_t));
    return words < capacity ? words : capacity;
}

// The context shared with switch.S / PendSV: it holds the saved PSP at its head.
typedef struct {
    void* sp;
} ksos_ctx;

extern void ksos_trampoline(void); // the task's starting point, #exported by the KSPL kernel

// The context of the thread running now, and the one PendSV switches to (external linkage is
// needed: switch.S reads both).
// **Only PendSV writes g_pendsv_running**, as it switches (and ksos_port_ctx_free, to the discard).
// The kernel's own idea of the running task cannot stand in for it. The kernel counts the task it
// picked as current at once, while the switch waits for PendSV. And PENDSVSET cannot tell a caller
// whether a switch is still to come. An interrupt above PendSV's priority can run after PendSV has
// become active (PENDSVSET reads 0), before its first instruction masks interrupts.
ksos_ctx* g_pendsv_running;
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

// The scheduler's (the main) context, which is running when it is made (start_scheduler makes it
// before the first switch). PendSV saves sp into it on that switch away.
void* ksos_port_ctx_create_main(void) {
    ksos_ctx* c = alloc_ctx();
    g_pendsv_running = c;
    return c;
}

// Returns a deleted task's context to the pool (the kernel calls it in a critical section). If it
// is the running thread's, the next PendSV would still save that thread into it. So that save goes
// to the discard instead. Otherwise a create that takes the slot first would lose its new frame.
void ksos_port_ctx_free(void* ctx) {
    ksos_ctx* c = (ksos_ctx*)ctx;
    if (g_pendsv_running == c) {
        g_pendsv_running = &g_ctx_discard;
    }
    g_ctx_busy[c - g_ctx_pool] = 0;
}

// Switches to to. The body is PendSV. In thread mode, pend plus isb switches at once. From
// handler mode (SysTick and the like), it is tail-chained after that handler returns.
// **from is not read**: PendSV saves the thread really running (g_pendsv_running). That differs
// from the from handed in when a second schedule() comes before PendSV has switched. (A handler
// can give after another's schedule(), or during PendSV's first instruction.) So
// a second call changes only the destination. A null from (the running task was deleted) needs
// nothing here: ksos_port_ctx_free has already sent its save to the discard.
void ksos_port_switch(void* from, void* to) {
    (void)from;
    g_pendsv_to = (ksos_ctx*)to;
    *(volatile uint32_t*)0xE000ED04u = (1u << 28); // SCB->ICSR: PENDSVSET
    __asm__ volatile("dsb; isb");
}

// Starts SysTick at a period of reload cycles, and sets PendSV's priority too.
void ksos_port_tick_start(uint32_t reload) {
    // SHPR3: PendSV (bits23:16) and SysTick (bits31:24) share the lowest priority. So SysTick
    // tail-chains after a PendSV in progress rather than preempting it.
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

// Sleeps until an interrupt. The kernel calls it with interrupts masked. WFI wakes on a pending
// interrupt even under PRIMASK, so one arriving after the kernel's last look is not missed. The
// handler runs in the short unmasked window that follows. The mask is back on return.
void ksos_port_wait_irq(void) {
    __asm__ volatile("dsb\n\twfi\n\tcpsie i\n\tisb\n\tcpsid i" ::: "memory");
}

// The default handler for NVIC IRQ0 (UART0's RX interrupt on the mps2-an385). The vector table
// always refers to it; being weak, it stays this empty one where no program defines its own.
void __attribute__((weak)) uart0_irq0_handler(void) {
}
