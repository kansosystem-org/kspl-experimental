// ==========================================
// Kanso OS — the POSIX host port. It does a real context switch in Linux user space, using
// ucontext.
// It implements the ksos_port_* ABI the kernel core (ksos/kernel/task.kspls) declares.
// The KSPL side's #export function ksos_trampoline is used as makecontext's entry.
// ==========================================
#define _GNU_SOURCE
#include <signal.h>
#include <stdint.h>
#include <stdlib.h>
#include <sys/time.h>
#include <ucontext.h>

typedef struct {
    ucontext_t uc;
} ksos_ctx;

// The signals that stand in for interrupts: the tick (SIGALRM) and the external interrupt the
// demos raise (SIGUSR1). Caution: **Block every one of them in a critical section**, as PRIMASK
// masks every interrupt; one left out runs its handler in the middle of the kernel's state.
static const int ksos_irq_signals[2] = {SIGALRM, SIGUSR1};

// The task-starting trampoline the KSPL kernel core #exports.
extern void ksos_trampoline(void);

// Takes a ksos_ctx and captures uc (the groundwork shared by ctx_create and ctx_create_main).
static ksos_ctx* alloc_ctx(void) {
    ksos_ctx* c = (ksos_ctx*)malloc(sizeof(ksos_ctx));
    if (c == 0) {
        return 0;
    }
    getcontext(&c->uc);
    return c;
}

// Makes, on the named stack, a context that enters ksos_trampoline the first time it starts.
// Caution: **A new task starts with the interrupt signals unblocked**, as a Cortex-M task starts
// with interrupts enabled. Task.create runs in a critical section, so the mask getcontext captured
// there would otherwise stay on the task for good, and no tick or interrupt would reach it.
void* ksos_port_ctx_create(void* stack, long stack_size) {
    ksos_ctx* c = alloc_ctx();
    if (c == 0) {
        return 0;
    }
    for (int i = 0; i < 2; i++) sigdelset(&c->uc.uc_sigmask, ksos_irq_signals[i]);
    c->uc.uc_stack.ss_sp = stack;
    c->uc.uc_stack.ss_size = (size_t)stack_size;
    c->uc.uc_link = 0;
    makecontext(&c->uc, ksos_trampoline, 0);
    return c;
}

// The scheduler's (the initial) context: where a switch comes back to.
void* ksos_port_ctx_create_main(void) {
    return alloc_ctx();
}

// Saves from's context and switches to to's.
void ksos_port_switch(void* from_ctx, void* to_ctx) {
    swapcontext(&((ksos_ctx*)from_ctx)->uc, &((ksos_ctx*)to_ctx)->uc);
}

// The tick handling the KSPL kernel core #exports (a time-slice switch is swapcontext'd directly
// from inside this handler, by way of schedule()).
extern void ksos_tick(void);

// Inside the SIGALRM handler, ksos_tick() -> schedule() -> ksos_port_switch swapcontexts to another
// task. swapcontext saves and restores uc_sigmask, so SIGALRM stays blocked for this task until
// its held handler call unwinds: the same effect as the Cortex-M port's SysTick and PendSV sharing
// a priority (the next tick cannot interrupt a switch).
static void ksos_sigalrm_handler(int sig) {
    (void)sig;
    ksos_tick();
}

// Starts the periodic timer (SIGALRM/setitimer) at a period of reload **microseconds** (the
// Cortex-M port's reload is SysTick cycles).
void ksos_port_tick_start(uint32_t reload) {
    struct sigaction sa;
    sa.sa_handler = ksos_sigalrm_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = 0; // SA_NODEFER is not attached: SIGALRM itself is blocked automatically while
                     // this handler runs
    sigaction(SIGALRM, &sa, NULL);

    struct itimerval tv;
    tv.it_value.tv_sec = reload / 1000000u;
    tv.it_value.tv_usec = reload % 1000000u;
    tv.it_interval = tv.it_value;
    setitimer(ITIMER_REAL, &tv, NULL);
}

// The critical section: it blocks those signals and returns, a bit per signal, which were blocked
// already. It nests like PRIMASK's save/restore: a restore unblocks only what its save blocked, so
// inside a handler (its own signal blocked by the kernel) the handler's return unblocks that one.
uint32_t ksos_port_irq_save(void) {
    sigset_t set, old;
    uint32_t state = 0u;
    sigemptyset(&set);
    for (int i = 0; i < 2; i++) sigaddset(&set, ksos_irq_signals[i]);
    sigprocmask(SIG_BLOCK, &set, &old);
    for (int i = 0; i < 2; i++) {
        if (sigismember(&old, ksos_irq_signals[i])) state |= 1u << i;
    }
    return state;
}

void ksos_port_irq_restore(uint32_t state) {
    sigset_t set;
    sigemptyset(&set);
    for (int i = 0; i < 2; i++) {
        if ((state & (1u << i)) == 0u) sigaddset(&set, ksos_irq_signals[i]);
    }
    sigprocmask(SIG_UNBLOCK, &set, NULL);
}

// POSIX has no handler mode: a signal handler runs on the interrupted task's context, so waiting
// there is that task waiting. A flag raised on entering the handler would not do: swapcontext
// from ksos_tick() leaves it on the task switched to.
uint32_t ksos_port_in_isr(void) {
    return 0u;
}
