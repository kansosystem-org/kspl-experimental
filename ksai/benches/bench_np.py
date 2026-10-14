#!/usr/bin/env python3
# A numpy reference: the same three training matrix products (fwd/dW/dX) and sizes as KSPL's
# bench, outputs reused (np.matmul's out=), real time (perf_counter), min-of-7. run_bench.kspls
# sets the thread count (OPENBLAS_NUM_THREADS and the like). numpy uses its bundled OpenBLAS,
# not the system one the KSPL and C references use.
import time
import numpy as np


def step_min_us(m, k, n, iters, repeats=7):
    X = np.full((m, k), 0.5, np.float32)
    W = np.full((k, n), 0.1, np.float32)
    dY = np.full((m, n), 0.1, np.float32)
    Y = np.empty((m, n), np.float32)
    dW = np.empty((k, n), np.float32)
    dX = np.empty((m, k), np.float32)
    for _ in range(3):
        np.matmul(X, W, out=Y)
        np.matmul(X.T, dY, out=dW)
        np.matmul(dY, W.T, out=dX)
    best = None
    for _ in range(repeats):
        t0 = time.perf_counter()
        for _ in range(iters):
            np.matmul(X, W, out=Y)
            np.matmul(X.T, dY, out=dW)
            np.matmul(dY, W.T, out=dX)
        per = (time.perf_counter() - t0) / iters * 1e6
        if best is None or per < best:
            best = per
    return best


for m, k, n, it in [(32, 128, 512, 500), (64, 256, 1024, 200), (64, 512, 2048, 60), (512, 512, 512, 40)]:
    print(f"[numpy] M={m} K={k} N={n}  min={step_min_us(m, k, n, it):.0f}us/step")
