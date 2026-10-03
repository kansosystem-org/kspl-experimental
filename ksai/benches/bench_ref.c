// A C reference implementation: for a controlled comparison that hits "the same system OpenBLAS" as
// KSPL+BLAS directly. The same three training matrix products (fwd/dW/dX) as KSPL's bench, the same
// sizes, the outputs reused, real time, min-of-7.
// Where KSPL+BLAS and this C version agree, the difference sits in the caller rather than in
// the library, and that can be told apart.
//   The build: clang -std=c99 -O3 ksai/benches/bench_ref.c -lopenblas -o out/bench_ref.exe
#define _ISOC11_SOURCE 1 // makes aligned_alloc (C11) declared even under -std=c99
#include <stdio.h>
#include <stdlib.h>
#include <cblas.h>
/* Real time (monotonic).
   Caution: **Do not use `clock()`**: CPU time sums BLAS's threads, so throughput stops comparing.
 * KSPL's `mono_us` in `std/sys` is the same CLOCK_MONOTONIC. */
#define _POSIX_C_SOURCE 199309L
#include <time.h>
static long bench_wall_ns(void) {
    struct timespec t;
    clock_gettime(CLOCK_MONOTONIC, &t);
    return (long)t.tv_sec * 1000000000L + t.tv_nsec;
}

static long step_min_us(int m, int k, int n, int iters, int repeats) {
    float *X = aligned_alloc(64, (size_t)m * k * 4);
    float *W = aligned_alloc(64, (size_t)k * n * 4);
    float *dY = aligned_alloc(64, (size_t)m * n * 4);
    float *Y = aligned_alloc(64, (size_t)m * n * 4);
    float *dW = aligned_alloc(64, (size_t)k * n * 4);
    float *dX = aligned_alloc(64, (size_t)m * k * 4);
    for (long i = 0; i < (long)m * k; i++) X[i] = 0.5f;
    for (long i = 0; i < (long)k * n; i++) W[i] = 0.1f;
    for (long i = 0; i < (long)m * n; i++) dY[i] = 0.1f;
    for (int w = 0; w < 3; w++) {
        cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans, m, n, k, 1, X, k, W, n, 0, Y, n);
        cblas_sgemm(CblasRowMajor, CblasTrans, CblasNoTrans, k, n, m, 1, X, k, dY, n, 0, dW, n);
        cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasTrans, m, k, n, 1, dY, n, W, n, 0, dX, k);
    }
    long best = 0;
    for (int rep = 0; rep < repeats; rep++) {
        long t0 = bench_wall_ns();
        for (int it = 0; it < iters; it++) {
            cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans, m, n, k, 1, X, k, W, n, 0, Y, n);
            cblas_sgemm(CblasRowMajor, CblasTrans, CblasNoTrans, k, n, m, 1, X, k, dY, n, 0, dW, n);
            cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasTrans, m, k, n, 1, dY, n, W, n, 0, dX, k);
        }
        long per = (bench_wall_ns() - t0) / iters;
        if (rep == 0 || per < best) best = per;
    }
    return best / 1000;
}

int main(void) {
    int cfg[][4] = {{32,128,512,500},{64,256,1024,200},{64,512,2048,60},{512,512,512,40}};
    for (int i = 0; i < 4; i++) {
        int m = cfg[i][0], k = cfg[i][1], n = cfg[i][2], it = cfg[i][3];
        printf("[ref-C] M=%d K=%d N=%d  min=%ldus/step\n", m, k, n, step_min_us(m, k, n, it, 7));
    }
    return 0;
}
