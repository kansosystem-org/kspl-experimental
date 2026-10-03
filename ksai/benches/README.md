# ksai/benches

**The speed bench for one training step of a Linear layer**, which is three matrix products (forward `Y=X@W`, backward `dW=Xᵀ@dY` and `dX=dY@Wᵀ`). It runs pure KSPL, KSPL passing `matmul` to OpenBLAS, a C reference and numpy on exactly the same work, at the same sizes, in float32. It is an indirect check of "training faster means finishing the same work on less energy".

## Run it

```sh
make                                         # build the stage1 compiler first (out/ksplc_stage1.exe)
ksplc run ksai/benches/run_bench.kspls 1     # pinned to one core (a fair kernel comparison)
ksplc run ksai/benches/run_bench.kspls 4     # 4 cores (how each library scales with threads)
python3 ksai/benches/bench_pure.py           # for reference: pure Python (a triple loop, the language itself)
```

Run it from the repository's root. It prints μs per step for each size and each backend. Without `python3` or numpy, it says so and skips the numpy reference.

## The idea

`run_bench.kspls` is shaped to keep a shared machine's noise out.

- **Real time (wall)**: `sys.mono_us()`, a clock that only goes up. CPU time adds up every thread of a multi-threaded run, so it misreads throughput. The C reference (`bench_ref.c`) reads the same `CLOCK_MONOTONIC`.
- **Pinned cores**: `taskset` stops the scheduler moving the work.
- **min-of-7**: each size runs 7 times, and the fastest run counts (the least contention is closest to the true speed).
- **Reused output buffers** (the `*_into` API), so allocation cost stays out.
- **A controlled comparison**: KSPL+BLAS and the C reference link the same system OpenBLAS. Where the two agree, any difference lies in the code that calls the library, not in the library. numpy carries its own OpenBLAS, so it stands beside them for reference.

## What is here

| File | What it is |
| :-- | :-- |
| [`run_bench.kspls`](run_bench.kspls) | The harness: it pins cores, sets the thread count, and builds and runs every backend. |
| [`bench_train.kspls`](bench_train.kspls) | The KSPL training bench (`*_into` reuse; pure KSPL by default, BLAS with `--define=blas`). |
| [`bench_ref.c`](bench_ref.c) | The C reference, calling the system OpenBLAS directly. |
| [`bench_np.py`](bench_np.py) | The numpy reference. |
| [`bench_pure.py`](bench_pure.py) | Pure Python, the language's own speed without BLAS. |

## What the results show

**The figures are one machine's, for one kernel.** They change with the hardware, the OpenBLAS and numpy versions, and the compiler's code generation, so none is written here. Run the bench to measure them. They say nothing about training a whole model. Read the relations, which hold across runs:

- **KSPL+BLAS, the C reference and numpy come within a few percent of each other**, on one thread and on four. All three call an OpenBLAS gemm, so only the calling code differs. KSPL's wrapper costs a few percent at most.
- **KSPL+BLAS scales with the core count as the others do** on the same OpenBLAS, and the larger the matrix, the better it scales.
- **Pure KSPL `matmul` is about an order of magnitude slower than BLAS.** That is the difference a hand-tuned SIMD kernel makes.

Which backend to pick, and why, is "The matrix backend is chosen where it is deployed" in [`ksai/docs/DESIGN.md`](../docs/DESIGN.md).

## Further reading

* [ksai](../README.md) — the package's entry point. `make BLAS=1`, explained under "Reading order" there, works on the examples too.
* [`ksai/docs/DESIGN.md`](../docs/DESIGN.md) — why `matmul` is pure KSPL by default and BLAS on request.
