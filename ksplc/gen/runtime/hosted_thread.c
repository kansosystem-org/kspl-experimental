/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspl. */
/* ============================================================
 * The thread / mutex primitives (for std/thread.kspl)
 * As with kspl_proc_*, a handle is opaque in an I64.
 *
 * **A mutex is not re-entrant, and misusing one stops the program** on every OS. Misuse is
 * locking it on the thread that holds it, or unlocking it or waiting on it from another thread
 * ("A mutex is locked once, by one thread" in std/docs/DESIGN-system.md). POSIX's error-checking
 * mutex reports a re-lock as an error number. **The owner is kept beside the lock on every OS**:
 * Windows's SRWLOCK reports nothing, and a signal or a broadcast asks whether the caller holds the
 * lock, which no POSIX call answers.
 * ============================================================ */

/* On a thread's trampoline, which calls the entry std/thread hands over. **The entry's parameter is
 * the thread function's own `T$@`.** It is reached through `void *(*)(void *)`, as pthread_create
 * and CreateThread reach it. So clang's `-fsanitize=function` would report the call it cannot
 * see. */
#if defined(__clang__)
#define KSPL_CALLS_THREAD_ENTRY __attribute__((no_sanitize("function")))
#else
#define KSPL_CALLS_THREAD_ENTRY
#endif

/* Stops the program on a misused lock, as a panic does (the message, then abort()). */
static void kspl_lock_misuse(const char *what) {
    fflush(stdout); /* The same reason as kspl_bounds_check in hosted.h */
    fprintf(stderr, "panic: %s\n", what);
    fflush(stderr);
    abort();
}

static const char kspl_relock_msg[] =
    "Mutex.lock: this thread already holds the lock (a Mutex is not re-entrant)";
static const char kspl_foreign_unlock_msg[] = "Mutex.unlock: this thread does not hold the lock";
static const char kspl_foreign_wait_msg[] = "Cond_var.wait: this thread does not hold the lock";
static const char kspl_foreign_signal_msg[] =
    "Cond_var.signal: this thread does not hold the lock (a wakeup could be lost)";
static const char kspl_foreign_broadcast_msg[] =
    "Cond_var.broadcast: this thread does not hold the lock (a wakeup could be lost)";

/* How many std Mutexes the calling thread holds now. A lock adds one and an unlock takes one away;
 * a wait on a Cond_var gives the lock back before it returns, so it changes nothing.
 * **A thread that ends while holding one stops the program** (kspl_thread_held_check). Otherwise
 * the next thread to lock that Mutex waits for ever, and nothing says why: the holder is gone. */
static KSPL_PER_THREAD Sz kspl_mutexes_held;

/* Called as a thread's entry returns, on the thread itself. */
static void kspl_thread_held_check(void) {
    if (kspl_mutexes_held != 0) {
        kspl_lock_misuse("Thread: the thread ended while it holds a Mutex (unlock it before the "
            "thread's function returns; the next lock would wait for ever)");
    }
}

#ifndef _WIN32
#include <pthread.h>

typedef struct { pthread_t tid; } kspl_thread_t;

/* What a new thread runs first: the crash report's share of it (hosted.c's "A crash says what
 * happened"), around entry. */
typedef struct {
    void *(*entry)(void *arg);
    void *arg;
} kspl_thread_start_t;

KSPL_CALLS_THREAD_ENTRY static void *kspl_thread_trampoline(void *p) {
    kspl_thread_start_t start = *(kspl_thread_start_t *)p;
    void *alt;
    void *ret;
    free(p);
    alt = kspl_crash_thread_enter();
    ret = start.entry(start.arg);
    kspl_thread_held_check();
    kspl_crash_thread_leave(alt);
    return ret;
}

/* Starts entry on a new thread. 0 on failure */
KSPL_LINK I64 kspl_thread_spawn(void *(*entry)(void *arg), void *arg) {
    kspl_thread_t *t = (kspl_thread_t *)malloc(sizeof(kspl_thread_t));
    kspl_thread_start_t *start = (kspl_thread_start_t *)malloc(sizeof(kspl_thread_start_t));
    if (t == NULL || start == NULL) {
        free(t);
        free(start);
        return 0;
    }
    start->entry = entry;
    start->arg = arg;
    if (pthread_create(&t->tid, NULL, kspl_thread_trampoline, start) != 0) {
        free(start);
        free(t);
        return 0;
    }
    return (I64)(intptr_t)t;
}

/* Waits for the thread to end and returns entry's return value */
KSPL_LINK void *kspl_thread_join(I64 handle) {
    if (handle == 0) return NULL;
    kspl_thread_t *t = (kspl_thread_t *)(intptr_t)handle;
    void *ret = NULL;
    pthread_join(t->tid, &ret);
    free(t);
    return ret;
}

/* owner is the holding thread (pthread_self()), 0 while free. Only the holder writes it, so
 * another thread reading it never sees its own thread there, whatever it reads. Atomic access keeps
 * that read from being a data race.
 * Caution: **Keep it PTHREAD_MUTEX_ERRORCHECK.** The default type deadlocks a re-lock with nothing
 * said on Linux. */
typedef struct { pthread_mutex_t lock; uintptr_t owner; } kspl_mutex_t;

static uintptr_t kspl_thread_self(void) {
    return (uintptr_t)pthread_self();
}

static int kspl_mutex_held(kspl_mutex_t *m) {
    return __atomic_load_n(&m->owner, __ATOMIC_RELAXED) == kspl_thread_self();
}

static void kspl_mutex_set_owner(kspl_mutex_t *m, uintptr_t owner) {
    __atomic_store_n(&m->owner, owner, __ATOMIC_RELAXED);
}

KSPL_LINK I64 kspl_mutex_create(void) {
    kspl_mutex_t *m = (kspl_mutex_t *)malloc(sizeof(kspl_mutex_t));
    pthread_mutexattr_t attr;
    if (m == NULL) return 0;
    m->owner = 0;
    if (pthread_mutexattr_init(&attr) != 0) {
        free(m);
        return 0;
    }
    int ok = pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_ERRORCHECK) == 0 &&
        pthread_mutex_init(&m->lock, &attr) == 0;
    pthread_mutexattr_destroy(&attr);
    if (!ok) {
        free(m);
        return 0;
    }
    return (I64)(intptr_t)m;
}

KSPL_LINK void kspl_mutex_lock(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    if (pthread_mutex_lock(&m->lock) == EDEADLK) {
        kspl_lock_misuse(kspl_relock_msg);
    }
    kspl_mutex_set_owner(m, kspl_thread_self());
    kspl_mutexes_held++;
}

KSPL_LINK void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    if (!kspl_mutex_held(m)) kspl_lock_misuse(kspl_foreign_unlock_msg);
    kspl_mutex_set_owner(m, 0);
    pthread_mutex_unlock(&m->lock);
    kspl_mutexes_held--;
}

KSPL_LINK void kspl_mutex_destroy(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    pthread_mutex_destroy(&m->lock);
    free(m);
}

/* Caution: **Time a wait on the monotonic clock** (kspl_cond_wait_for). The default is the wall
 * clock, so a clock set back by NTP or a person stretches every wait by as much. macOS cannot set
 * the clock, and waits by a relative time instead. */
KSPL_LINK I64 kspl_cond_create(void) {
    pthread_cond_t *c = (pthread_cond_t *)malloc(sizeof(pthread_cond_t));
    pthread_condattr_t attr;
    int ok;
    if (c == NULL) return 0;
    if (pthread_condattr_init(&attr) != 0) {
        free(c);
        return 0;
    }
#if defined(__APPLE__)
    ok = pthread_cond_init(c, &attr) == 0;
#else
    ok = pthread_condattr_setclock(&attr, CLOCK_MONOTONIC) == 0 && pthread_cond_init(c, &attr) == 0;
#endif
    pthread_condattr_destroy(&attr);
    if (!ok) {
        free(c);
        return 0;
    }
    return (I64)(intptr_t)c;
}

/* mutex_handle must already be locked by the caller (pthread_cond_wait's premise).
 * While waiting it is unlocked inside, and relocked when a signal arrives, so the owner is cleared
 * before and set again after. */
KSPL_LINK void kspl_cond_wait(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    if (!kspl_mutex_held(m)) kspl_lock_misuse(kspl_foreign_wait_msg);
    kspl_mutex_set_owner(m, 0);
    pthread_cond_wait((pthread_cond_t *)(intptr_t)cond_handle, &m->lock);
    kspl_mutex_set_owner(m, kspl_thread_self());
}

/* kspl_cond_wait for at most timeout_ms (read through kspl_wait_ms): 0 when woken, a spurious
 * wakeup included, and 1 when the time ran out. */
KSPL_LINK I32 kspl_cond_wait_for(I64 cond_handle, I64 mutex_handle, I32 timeout_ms) {
    pthread_cond_t *c = (pthread_cond_t *)(intptr_t)cond_handle;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    struct timespec ts;
    int rc;
    if (cond_handle == 0 || mutex_handle == 0) return 1;
    if (!kspl_mutex_held(m)) kspl_lock_misuse(kspl_foreign_wait_msg);
    timeout_ms = kspl_wait_ms(timeout_ms);
#if defined(__APPLE__)
    ts.tv_sec = timeout_ms / 1000;
    ts.tv_nsec = (long)(timeout_ms % 1000) * 1000000L;
    kspl_mutex_set_owner(m, 0);
    rc = pthread_cond_timedwait_relative_np(c, &m->lock, &ts);
#else
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 1;
    ts.tv_sec += timeout_ms / 1000;
    ts.tv_nsec += (long)(timeout_ms % 1000) * 1000000L;
    if (ts.tv_nsec >= 1000000000L) {
        ts.tv_sec += 1;
        ts.tv_nsec -= 1000000000L;
    }
    kspl_mutex_set_owner(m, 0);
    rc = pthread_cond_timedwait(c, &m->lock, &ts);
#endif
    kspl_mutex_set_owner(m, kspl_thread_self());
    return rc == ETIMEDOUT ? 1 : 0;
}

/* A wakeup is given under the lock the waiters take. Given without it, it can come between a
 * waiter's check of its condition and its wait, and that waiter sleeps on. */
KSPL_LINK void kspl_cond_wake_one(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    if (!kspl_mutex_held((kspl_mutex_t *)(intptr_t)mutex_handle)) {
        kspl_lock_misuse(kspl_foreign_signal_msg);
    }
    pthread_cond_signal((pthread_cond_t *)(intptr_t)cond_handle);
}

KSPL_LINK void kspl_cond_wake_all(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    if (!kspl_mutex_held((kspl_mutex_t *)(intptr_t)mutex_handle)) {
        kspl_lock_misuse(kspl_foreign_broadcast_msg);
    }
    pthread_cond_broadcast((pthread_cond_t *)(intptr_t)cond_handle);
}


KSPL_LINK void kspl_cond_destroy(I64 handle) {
    if (handle == 0) return;
    pthread_cond_t *c = (pthread_cond_t *)(intptr_t)handle;
    pthread_cond_destroy(c);
    free(c);
}
#else
/* The Windows implementation (CreateThread + SRWLOCK). */
#include <windows.h>

typedef struct { HANDLE h; void *(*entry)(void *arg); void *arg; void *result; } kspl_thread_t;

KSPL_CALLS_THREAD_ENTRY static DWORD WINAPI kspl_thread_trampoline(LPVOID param) {
    kspl_thread_t *t = (kspl_thread_t *)param;
    kspl_crash_thread_enter();
    t->result = t->entry(t->arg);
    kspl_thread_held_check();
    return 0;
}

KSPL_LINK I64 kspl_thread_spawn(void *(*entry)(void *arg), void *arg) {
    kspl_thread_t *t = (kspl_thread_t *)malloc(sizeof(kspl_thread_t));
    if (t == NULL) return 0;
    t->entry = entry;
    t->arg = arg;
    t->result = NULL;
    t->h = CreateThread(NULL, 0, kspl_thread_trampoline, t, 0, NULL);
    if (t->h == NULL) {
        free(t);
        return 0;
    }
    return (I64)(intptr_t)t;
}

KSPL_LINK void *kspl_thread_join(I64 handle) {
    if (handle == 0) return NULL;
    kspl_thread_t *t = (kspl_thread_t *)(intptr_t)handle;
    WaitForSingleObject(t->h, INFINITE);
    CloseHandle(t->h);
    void *ret = t->result;
    free(t);
    return ret;
}

/* owner is the holding thread's id, 0 while free. Only the holder writes its own id there, so
 * another thread reading it never sees its own id, whatever it reads.
 * Caution: **Not CRITICAL_SECTION**: it is re-entrant, so a re-lock returns and the data is
 * touched again half-updated, where POSIX stops. */
typedef struct { SRWLOCK lock; volatile LONG owner; } kspl_mutex_t;

static LONG kspl_thread_self(void) {
    return (LONG)GetCurrentThreadId();
}

KSPL_LINK I64 kspl_mutex_create(void) {
    kspl_mutex_t *m = (kspl_mutex_t *)malloc(sizeof(kspl_mutex_t));
    if (m == NULL) return 0;
    InitializeSRWLock(&m->lock);
    m->owner = 0;
    return (I64)(intptr_t)m;
}

KSPL_LINK void kspl_mutex_lock(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    if (m->owner == kspl_thread_self()) kspl_lock_misuse(kspl_relock_msg);
    AcquireSRWLockExclusive(&m->lock);
    InterlockedExchange(&m->owner, kspl_thread_self());
    kspl_mutexes_held++;
}

KSPL_LINK void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_unlock_msg);
    InterlockedExchange(&m->owner, 0);
    ReleaseSRWLockExclusive(&m->lock);
    kspl_mutexes_held--;
}

/* An SRWLOCK has no destroy function; free() is all. */
KSPL_LINK void kspl_mutex_destroy(I64 handle) {
    if (handle == 0) return;
    free((void *)(intptr_t)handle);
}

KSPL_LINK I64 kspl_cond_create(void) {
    CONDITION_VARIABLE *cv = (CONDITION_VARIABLE *)malloc(sizeof(CONDITION_VARIABLE));
    if (cv == NULL) return 0;
    InitializeConditionVariable(cv);
    return (I64)(intptr_t)cv;
}

/* The lock is released while waiting, so the owner is cleared before and set again after. */
KSPL_LINK void kspl_cond_wait(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_wait_msg);
    InterlockedExchange(&m->owner, 0);
    SleepConditionVariableSRW((CONDITION_VARIABLE *)(intptr_t)cond_handle, &m->lock, INFINITE, 0);
    InterlockedExchange(&m->owner, kspl_thread_self());
}

/* The POSIX side's contract. The timeout is relative, so no clock setting stretches it. */
KSPL_LINK I32 kspl_cond_wait_for(I64 cond_handle, I64 mutex_handle, I32 timeout_ms) {
    if (cond_handle == 0 || mutex_handle == 0) return 1;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_wait_msg);
    InterlockedExchange(&m->owner, 0);
    BOOL woke = SleepConditionVariableSRW((CONDITION_VARIABLE *)(intptr_t)cond_handle, &m->lock,
        (DWORD)kspl_wait_ms(timeout_ms), 0);
    InterlockedExchange(&m->owner, kspl_thread_self());
    return woke ? 0 : 1;
}

/* The POSIX side's contract: the caller holds the lock the waiters take. */
KSPL_LINK void kspl_cond_wake_one(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_signal_msg);
    WakeConditionVariable((CONDITION_VARIABLE *)(intptr_t)cond_handle);
}

KSPL_LINK void kspl_cond_wake_all(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)mutex_handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_broadcast_msg);
    WakeAllConditionVariable((CONDITION_VARIABLE *)(intptr_t)cond_handle);
}


/* A CONDITION_VARIABLE has no destroy function; free() is all. */
KSPL_LINK void kspl_cond_destroy(I64 handle) {
    if (handle == 0) return;
    free((void *)(intptr_t)handle);
}
#endif

/* ============================================================
 * Where the calling thread's stack ends (for std/stack_limit.kspl)
 * The lowest address the stack can grow down to, above the guard the thread's bounds carry; 0
 * where the OS does not say. A level's cost moves with the backend. So a walk compares its
 * position with this rather than counting levels.
 * **It is not cheap** (on Linux the main thread reads /proc/self/maps). Ask once per walk and keep
 * the answer (`Stack_limit.new`).
 * ============================================================ */
#if defined(_WIN32)
/* Caution: **The bounds are the whole reservation, and its bottom is never the program's.** The
 * last page is never committed, and the guard page stands above it. The stack guarantee is kept
 * for the overflow handler. **The guarantee asked for is not the one kept.** It answers 0 unless
 * set, but Windows keeps 8KB at least (4KB on 32 bits), as Rust's `stacker` measured on
 * Windows 10. */
KSPL_LINK Sz kspl_stack_floor(void) {
    ULONG_PTR low = 0;
    ULONG_PTR high = 0;
    GetCurrentThreadStackLimits(&low, &high);
    SYSTEM_INFO info;
    GetSystemInfo(&info);
    ULONG guarantee = 0; /* 0 asks for the current guarantee and leaves it as it is */
    if (!SetThreadStackGuarantee(&guarantee)) guarantee = 0;
    ULONG least = sizeof(void *) == 8 ? 0x2000 : 0x1000;
    ULONG kept = guarantee > least ? guarantee : least;
    return (Sz)(low + 2 * (ULONG_PTR)info.dwPageSize + kept);
}
#elif defined(__APPLE__)
KSPL_LINK Sz kspl_stack_floor(void) {
    pthread_t self = pthread_self();
    char *top = (char *)pthread_get_stackaddr_np(self);
    return (Sz)(intptr_t)(top - pthread_get_stacksize_np(self));
}
#elif defined(__linux__)
/* Caution: **Declared here rather than by raising _GNU_SOURCE.** The preamble raises
 * _POSIX_C_SOURCE alone, and _GNU_SOURCE over the whole unit swaps other declarations with it
 * (strerror_r among them). glibc and musl both carry the function. */
int pthread_getattr_np(pthread_t thread, pthread_attr_t *attr);
KSPL_LINK Sz kspl_stack_floor(void) {
    pthread_attr_t attr;
    void *low = NULL;
    size_t size = 0;
    size_t guard = 0;
    if (pthread_getattr_np(pthread_self(), &attr) != 0) return 0;
    int got = pthread_attr_getstack(&attr, &low, &size) == 0;
    if (pthread_attr_getguardsize(&attr, &guard) != 0) guard = 0;
    pthread_attr_destroy(&attr);
    return got ? (Sz)(intptr_t)((char *)low + guard) : 0;
}
#else
KSPL_LINK Sz kspl_stack_floor(void) {
    return 0;
}
#endif

