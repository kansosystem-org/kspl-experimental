/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * The thread / mutex primitives (for std/thread.kspls)
 * As with kspl_proc_*, a handle is opaque in an I64.
 *
 * **A mutex is not re-entrant, and misusing one stops the program** on every OS: locking it on the
 * thread that holds it, unlocking it or waiting on it from a thread that does not ("A mutex is
 * locked once, by one thread" in std/docs/DESIGN.md). POSIX's error-checking mutex reports each
 * as an error number; Windows's SRWLOCK reports nothing, so the owner is kept beside it.
 * ============================================================ */

/* On a thread's trampoline, which calls the entry std/thread hands over. **The entry's parameter is
 * the thread function's own `T$@`**, reached through `void *(*)(void *)` as pthread_create and
 * CreateThread reach it, so clang's `-fsanitize=function` would report the call it cannot see. */
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

/* Caution: **Keep it PTHREAD_MUTEX_ERRORCHECK.** The default type deadlocks a re-lock with nothing
 * said on Linux, and its unlock from another thread is undefined. */
KSPL_LINK I64 kspl_mutex_create(void) {
    pthread_mutex_t *m = (pthread_mutex_t *)malloc(sizeof(pthread_mutex_t));
    pthread_mutexattr_t attr;
    if (m == NULL) return 0;
    if (pthread_mutexattr_init(&attr) != 0) {
        free(m);
        return 0;
    }
    int ok = pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_ERRORCHECK) == 0 &&
        pthread_mutex_init(m, &attr) == 0;
    pthread_mutexattr_destroy(&attr);
    if (!ok) {
        free(m);
        return 0;
    }
    return (I64)(intptr_t)m;
}

KSPL_LINK void kspl_mutex_lock(I64 handle) {
    if (handle == 0) return;
    if (pthread_mutex_lock((pthread_mutex_t *)(intptr_t)handle) == EDEADLK) {
        kspl_lock_misuse(kspl_relock_msg);
    }
}

KSPL_LINK void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    if (pthread_mutex_unlock((pthread_mutex_t *)(intptr_t)handle) == EPERM) {
        kspl_lock_misuse(kspl_foreign_unlock_msg);
    }
}

KSPL_LINK void kspl_mutex_destroy(I64 handle) {
    if (handle == 0) return;
    pthread_mutex_t *m = (pthread_mutex_t *)(intptr_t)handle;
    pthread_mutex_destroy(m);
    free(m);
}

KSPL_LINK I64 kspl_cond_create(void) {
    pthread_cond_t *c = (pthread_cond_t *)malloc(sizeof(pthread_cond_t));
    if (c == NULL) return 0;
    if (pthread_cond_init(c, NULL) != 0) {
        free(c);
        return 0;
    }
    return (I64)(intptr_t)c;
}

/* mutex_handle must already be locked by the caller (pthread_cond_wait's premise).
 * While waiting it is unlocked inside, and relocked when a signal arrives. */
KSPL_LINK void kspl_cond_wait(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    if (pthread_cond_wait((pthread_cond_t *)(intptr_t)cond_handle,
            (pthread_mutex_t *)(intptr_t)mutex_handle) == EPERM) {
        kspl_lock_misuse(kspl_foreign_wait_msg);
    }
}

KSPL_LINK void kspl_cond_signal(I64 handle) {
    if (handle == 0) return;
    pthread_cond_signal((pthread_cond_t *)(intptr_t)handle);
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
    t->result = t->entry(t->arg);
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
}

KSPL_LINK void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    kspl_mutex_t *m = (kspl_mutex_t *)(intptr_t)handle;
    if (m->owner != kspl_thread_self()) kspl_lock_misuse(kspl_foreign_unlock_msg);
    InterlockedExchange(&m->owner, 0);
    ReleaseSRWLockExclusive(&m->lock);
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

KSPL_LINK void kspl_cond_signal(I64 handle) {
    if (handle == 0) return;
    WakeConditionVariable((CONDITION_VARIABLE *)(intptr_t)handle);
}

/* A CONDITION_VARIABLE has no destroy function; free() is all. */
KSPL_LINK void kspl_cond_destroy(I64 handle) {
    if (handle == 0) return;
    free((void *)(intptr_t)handle);
}
#endif

/* ============================================================
 * Where the calling thread's stack ends (for std/stack_limit.kspls)
 * The lowest address the stack may grow down to, above the guard the thread's bounds carry; 0
 * where the OS does not say. A level's cost moves with the backend, so a walk compares its
 * position with this rather than counting levels.
 * **It is not cheap** (on Linux the main thread reads /proc/self/maps): ask once per walk and keep
 * the answer (`Stack_limit.new`).
 * ============================================================ */
#if defined(_WIN32)
/* Caution: **The bounds are the whole reservation, and its bottom is never the program's**: the
 * last page is never committed, the guard page stands above it, and the stack guarantee is kept for
 * the overflow handler. **The guarantee asked for is not the one kept**: it answers 0 unless set,
 * while Windows keeps 8KB at least (4KB on 32 bits), as Rust's `stacker` measured on Windows 10. */
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

