// ==========================================
// Kanso OS — the POSIX host port. It does a real context switch in Linux user space, using
// ucontext.
// It implements the ksos_port_* ABI the kernel core (ksos/kernel/task.kspl) declares.
// A new task enters the KSPL side's #export function ksos_trampoline by way of ksos_task_start.
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
// masks every interrupt. One left out runs its handler in the middle of the kernel's state.
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

// The interrupt signals as a set, for sigprocmask.
static void irq_signal_set(sigset_t* set) {
    sigemptyset(set);
    for (int i = 0; i < 2; i++) sigaddset(set, ksos_irq_signals[i]);
}

// A new task's first code: it unblocks the interrupt signals, then enters the trampoline. A new
// task starts with interrupts enabled, as a Cortex-M task does. The switch into it keeps them
// blocked until here (see ksos_port_switch). So a tick held back meanwhile runs now, on this
// task's own stack.
static void ksos_task_start(void) {
    sigset_t set;
    irq_signal_set(&set);
    sigprocmask(SIG_UNBLOCK, &set, NULL);
    ksos_trampoline();
}

// Makes, on the named stack, a context that enters ksos_task_start the first time it starts.
// Caution: **Every saved context holds the interrupt signals blocked**, a new one included (see
// ksos_port_switch). ksos_task_start unblocks them once the task really runs.
void* ksos_port_ctx_create(void* stack, long stack_size) {
    ksos_ctx* c = alloc_ctx();
    if (c == 0) {
        return 0;
    }
    for (int i = 0; i < 2; i++) sigaddset(&c->uc.uc_sigmask, ksos_irq_signals[i]);
    c->uc.uc_stack.ss_sp = stack;
    c->uc.uc_stack.ss_size = (size_t)stack_size;
    c->uc.uc_link = 0;
    makecontext(&c->uc, ksos_task_start, 0);
    return c;
}

// The scheduler's (the initial) context: where a switch comes back to.
void* ksos_port_ctx_create_main(void) {
    return alloc_ctx();
}

// Returns a deleted task's context. The task can be the one running. The kernel's next switch
// then passes a null from for it (see ksos_port_switch), so nothing goes into the freed memory.
void ksos_port_ctx_free(void* ctx) {
    free(ctx);
}

// Saves from's context and switches to to's. The interrupt signals stay blocked from before the
// save until control comes back to from. from then gets its own mask back. A null from (the
// running task was deleted) saves nothing and never comes back.
// Caution: **Do not leave the mask to swapcontext.** It installs to's mask before it loads to's
// registers. So a pending tick that the mask lets through runs its handler on from's stack, while
// the kernel counts to as current. That handler's switch saves the half-made state as to's
// context. to then never runs its own code again (it loops or hangs).
void ksos_port_switch(void* from_ctx, void* to_ctx) {
    sigset_t set, old;
    irq_signal_set(&set);
    sigprocmask(SIG_BLOCK, &set, &old);
    if (from_ctx == 0) {
        setcontext(&((ksos_ctx*)to_ctx)->uc);
    }
    swapcontext(&((ksos_ctx*)from_ctx)->uc, &((ksos_ctx*)to_ctx)->uc);
    sigprocmask(SIG_SETMASK, &old, NULL);
}

// The tick handling the KSPL kernel core #exports (a time-slice switch is swapcontext'd directly
// from inside this handler, by way of schedule()).
extern void ksos_tick(void);

// Inside the SIGALRM handler, ksos_tick() -> schedule() -> ksos_port_switch swapcontexts to another
// task. The task switched out keeps SIGALRM blocked until it resumes and its held handler call
// unwinds. No tick lands in the switch itself (see ksos_port_switch). This has the same effect as
// the Cortex-M port's SysTick and PendSV sharing a priority.
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
// already. It nests like PRIMASK's save/restore: a restore unblocks only what its save blocked. So
// inside a handler (its own signal blocked by the kernel), the handler's return unblocks that one.
uint32_t ksos_port_irq_save(void) {
    sigset_t set, old;
    uint32_t state = 0u;
    irq_signal_set(&set);
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

// Sleeps until an interrupt signal arrives and its handler has run. The kernel calls it inside a
// critical section (the signals blocked). sigsuspend unblocks them and waits in one step. So a
// signal raised after the kernel's last look is still taken. It returns with them blocked again.
void ksos_port_wait_irq(void) {
    sigset_t during;
    sigprocmask(SIG_BLOCK, NULL, &during);
    for (int i = 0; i < 2; i++) sigdelset(&during, ksos_irq_signals[i]);
    sigsuspend(&during);
}

// POSIX has no handler mode: a signal handler runs on the interrupted task's context, so waiting
// there is that task waiting. A flag raised on entering the handler would not do: swapcontext
// from ksos_tick() leaves it on the task switched to.
uint32_t ksos_port_in_isr(void) {
    return 0u;
}
