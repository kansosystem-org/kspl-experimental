/* Part of the C runtime for an environment with an OS.
   Caution: **It does not build on its own** — it
 * joins behind hosted.c (the preamble) to make one translation unit. The joining order is held by
 * write_impl in ksplc/gen/runtime.kspls. */
/* ============================================================
 * The thread / mutex primitives (for std/thread.kspls)
 * As with kspl_proc_*, a handle is opaque in an I64.
 * ============================================================ */
#ifndef _WIN32
#include <pthread.h>

typedef struct { pthread_t tid; } kspl_thread_t;

/* Starts entry on a new thread. 0 on failure */
I64 kspl_thread_spawn(void *(*entry)(void *arg), void *arg) {
    kspl_thread_t *t = (kspl_thread_t *)malloc(sizeof(kspl_thread_t));
    if (pthread_create(&t->tid, NULL, entry, arg) != 0) {
        free(t);
        return 0;
    }
    return (I64)(intptr_t)t;
}

/* Waits for the thread to end and returns entry's return value */
void *kspl_thread_join(I64 handle) {
    if (handle == 0) return NULL;
    kspl_thread_t *t = (kspl_thread_t *)(intptr_t)handle;
    void *ret = NULL;
    pthread_join(t->tid, &ret);
    free(t);
    return ret;
}

I64 kspl_mutex_create(void) {
    pthread_mutex_t *m = (pthread_mutex_t *)malloc(sizeof(pthread_mutex_t));
    if (pthread_mutex_init(m, NULL) != 0) {
        free(m);
        return 0;
    }
    return (I64)(intptr_t)m;
}

void kspl_mutex_lock(I64 handle) {
    if (handle == 0) return;
    pthread_mutex_lock((pthread_mutex_t *)(intptr_t)handle);
}

void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    pthread_mutex_unlock((pthread_mutex_t *)(intptr_t)handle);
}

void kspl_mutex_destroy(I64 handle) {
    if (handle == 0) return;
    pthread_mutex_t *m = (pthread_mutex_t *)(intptr_t)handle;
    pthread_mutex_destroy(m);
    free(m);
}

I64 kspl_cond_create(void) {
    pthread_cond_t *c = (pthread_cond_t *)malloc(sizeof(pthread_cond_t));
    if (pthread_cond_init(c, NULL) != 0) {
        free(c);
        return 0;
    }
    return (I64)(intptr_t)c;
}

/* mutex_handle must already be locked by the caller (pthread_cond_wait's premise).
 * While waiting it is unlocked inside, and relocked when a signal arrives. */
void kspl_cond_wait(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    pthread_cond_wait((pthread_cond_t *)(intptr_t)cond_handle, (pthread_mutex_t *)(intptr_t)mutex_handle);
}

void kspl_cond_signal(I64 handle) {
    if (handle == 0) return;
    pthread_cond_signal((pthread_cond_t *)(intptr_t)handle);
}

void kspl_cond_broadcast(I64 handle) {
    if (handle == 0) return;
    pthread_cond_broadcast((pthread_cond_t *)(intptr_t)handle);
}

void kspl_cond_destroy(I64 handle) {
    if (handle == 0) return;
    pthread_cond_t *c = (pthread_cond_t *)(intptr_t)handle;
    pthread_cond_destroy(c);
    free(c);
}
#else
/* The Windows implementation (CreateThread + CRITICAL_SECTION). */
#include <windows.h>

typedef struct { HANDLE h; void *(*entry)(void *arg); void *arg; void *result; } kspl_thread_t;

static DWORD WINAPI kspl_thread_trampoline(LPVOID param) {
    kspl_thread_t *t = (kspl_thread_t *)param;
    t->result = t->entry(t->arg);
    return 0;
}

I64 kspl_thread_spawn(void *(*entry)(void *arg), void *arg) {
    kspl_thread_t *t = (kspl_thread_t *)malloc(sizeof(kspl_thread_t));
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

void *kspl_thread_join(I64 handle) {
    if (handle == 0) return NULL;
    kspl_thread_t *t = (kspl_thread_t *)(intptr_t)handle;
    WaitForSingleObject(t->h, INFINITE);
    CloseHandle(t->h);
    void *ret = t->result;
    free(t);
    return ret;
}

I64 kspl_mutex_create(void) {
    CRITICAL_SECTION *cs = (CRITICAL_SECTION *)malloc(sizeof(CRITICAL_SECTION));
    InitializeCriticalSection(cs);
    return (I64)(intptr_t)cs;
}

void kspl_mutex_lock(I64 handle) {
    if (handle == 0) return;
    EnterCriticalSection((CRITICAL_SECTION *)(intptr_t)handle);
}

void kspl_mutex_unlock(I64 handle) {
    if (handle == 0) return;
    LeaveCriticalSection((CRITICAL_SECTION *)(intptr_t)handle);
}

void kspl_mutex_destroy(I64 handle) {
    if (handle == 0) return;
    CRITICAL_SECTION *cs = (CRITICAL_SECTION *)(intptr_t)handle;
    DeleteCriticalSection(cs);
    free(cs);
}

I64 kspl_cond_create(void) {
    CONDITION_VARIABLE *cv = (CONDITION_VARIABLE *)malloc(sizeof(CONDITION_VARIABLE));
    InitializeConditionVariable(cv);
    return (I64)(intptr_t)cv;
}

void kspl_cond_wait(I64 cond_handle, I64 mutex_handle) {
    if (cond_handle == 0 || mutex_handle == 0) return;
    SleepConditionVariableCS((CONDITION_VARIABLE *)(intptr_t)cond_handle,
        (CRITICAL_SECTION *)(intptr_t)mutex_handle, INFINITE);
}

void kspl_cond_signal(I64 handle) {
    if (handle == 0) return;
    WakeConditionVariable((CONDITION_VARIABLE *)(intptr_t)handle);
}

void kspl_cond_broadcast(I64 handle) {
    if (handle == 0) return;
    WakeAllConditionVariable((CONDITION_VARIABLE *)(intptr_t)handle);
}

/* A CONDITION_VARIABLE has no destroy function; free() is all. */
void kspl_cond_destroy(I64 handle) {
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
Sz kspl_stack_floor(void) {
    ULONG_PTR low = 0;
    ULONG_PTR high = 0;
    GetCurrentThreadStackLimits(&low, &high);
    return (Sz)low;
}
#elif defined(__APPLE__)
Sz kspl_stack_floor(void) {
    pthread_t self = pthread_self();
    char *top = (char *)pthread_get_stackaddr_np(self);
    return (Sz)(intptr_t)(top - pthread_get_stacksize_np(self));
}
#elif defined(__linux__)
/* Caution: **Declared here rather than by raising _GNU_SOURCE.** The preamble raises
 * _POSIX_C_SOURCE alone, and _GNU_SOURCE over the whole unit swaps other declarations with it
 * (strerror_r among them). glibc and musl both carry the function. */
int pthread_getattr_np(pthread_t thread, pthread_attr_t *attr);
Sz kspl_stack_floor(void) {
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
Sz kspl_stack_floor(void) {
    return 0;
}
#endif

