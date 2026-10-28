#!/usr/bin/env python3
"""Writes the reference files that ksai's GGUF formats are tested against (`ksai/quant.kspl`).

The reference is llama.cpp's own Python package `gguf` (its module `quants`), which decodes every
format and quantizes Q8_0 as `ggml-quants.c` does. The products come from llama.cpp's C library
itself, in its package `llama_cpp`: it rounds each input row to 8 bits and multiplies in integers,
and `gguf` holds neither step. The files are committed, so the tests need no Python. Run this
again only when a format or a case changes:

  python3 -m venv .venv && . .venv/bin/activate && pip install gguf numpy llama-cpp-python
  python3 tools/ai_assist/make_quant_fixtures.py --out-dir ksai/tests/quant_data

Run with no argument, it self-tests the file layout and the half-way inputs, which need numpy
alone.

The seed is fixed, so one numpy writes the same files on every run. Another numpy version can draw
other numbers; the files then differ, and each still agrees with itself.

Each file is little-endian: the 4 bytes `KSQF`, then six U32s: the ggml type number, the rows,
the columns, how many F32 inputs follow, how many encoded bytes follow, and how many F32 decoded
numbers follow. Then come the inputs, the encoded bytes and the decoded numbers, in that order.
The inputs are what a quantizer starts from; a file without one holds 0 of them.

A product's file (`dot_<format>.bin`) has its own layout, which `write_product` gives.
"""
import argparse
import os
import struct
import sys
import tempfile

import numpy as np

Q = None  # gguf's GGMLQuantizationType, loaded by load_reference
quants = None  # gguf's module quants, loaded by load_reference

SEED = 20261027
QK_K = 256


def load_reference():
    """Loads llama.cpp's package `gguf`, which only writing the files needs."""
    global Q, quants
    from gguf import GGMLQuantizationType
    from gguf import quants as gguf_quants
    Q, quants = GGMLQuantizationType, gguf_quants


def write_case(path, qtype, rows, cols, inputs, encoded, decoded):
    """One file in the layout the module docstring gives."""
    inputs = np.asarray(inputs, dtype="<f4").ravel()
    encoded = np.asarray(encoded, dtype=np.uint8).ravel()
    decoded = np.asarray(decoded, dtype="<f4").ravel()
    assert decoded.size == rows * cols, path
    head = b"KSQF" + struct.pack("<6I", int(qtype), rows, cols, inputs.size, encoded.size,
                                 decoded.size)
    with open(path, "wb") as f:
        f.write(head + inputs.tobytes() + encoded.tobytes() + decoded.tobytes())


def half_ties(rng, n):
    """F32 numbers exactly halfway between two neighbouring halves, odd and even, normal and not."""
    out = []
    for _ in range(n):
        h = int(rng.integers(0, 0x7BFF))
        lo = np.array([h], dtype=np.uint16).view(np.float16).astype(np.float32)[0]
        hi = np.array([h + 1], dtype=np.uint16).view(np.float16).astype(np.float32)[0]
        mid = np.float32((np.float64(lo) + np.float64(hi)) / 2)
        assert np.float64(mid) * 2 == np.float64(lo) + np.float64(hi)
        out.append(mid if rng.integers(0, 2) else -mid)
    return out


def f16_case(rng, out_dir):
    """F32 numbers rounded to halves by numpy, and the halves decoded back.

    The inputs reach every kind of half: subnormal, the ties, the largest finite and infinity.
    """
    rows, cols = 2, 64
    special = [0.0, -0.0, 1.0, -2.0, 65504.0, 65519.99, 65520.0, 1e9, -1e9,
               2.0 ** -24, 2.0 ** -25, 3 * 2.0 ** -26, 2.0 ** -26, 2.0 ** -14, 6.1e-5, 1e-30]
    ties = half_ties(rng, 24)
    n_rand = rows * cols - len(special) - len(ties)
    mag = np.exp2(rng.uniform(-28.0, 17.0, n_rand)) * rng.choice([-1.0, 1.0], n_rand)
    inputs = np.array(special + ties + list(mag), dtype=np.float32)
    with np.errstate(over="ignore"):  # the overflow to infinity is a case on purpose
        encoded = inputs.astype(np.float16).view(np.uint8)
    decoded = quants.dequantize(encoded.view(np.float16), Q.F16)
    write_case(os.path.join(out_dir, "f16.bin"), Q.F16, rows, cols, inputs, encoded, decoded)


def bf16_case(rng, out_dir):
    """Random 16-bit patterns read as bfloat16, NaNs included: decoding only moves bits."""
    rows, cols = 2, 64
    encoded = rng.integers(0, 1 << 16, rows * cols, dtype=np.uint16).view(np.uint8)
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.BF16)
    write_case(os.path.join(out_dir, "bf16.bin"), Q.BF16, rows, cols, [], encoded, decoded)


def q8_0_case(rng, out_dir):
    """F32 blocks quantized to Q8_0 and decoded back, by `gguf`'s copy of ggml's reference.

    The blocks: ordinary numbers, all zeros, halves that round away from 0 (largest 127, so
    `d` is 1), numbers so small that `d` is a subnormal half, and large numbers.
    """
    rows, cols = 3, 128
    x = rng.standard_normal((rows * cols // 32, 32)).astype(np.float32)
    x[1] = 0.0
    x[2] = np.array([127.0, -127.0] + [k + 0.5 for k in range(-15, 15)], dtype=np.float32)
    x[3] *= np.float32(1e-5)
    x[4] *= np.float32(3000.0)
    x[5] = np.round(x[5] * 8) / 8
    inputs = x.reshape(rows, cols)
    encoded = quants.quantize(inputs, Q.Q8_0)
    decoded = quants.dequantize(encoded, Q.Q8_0)
    write_case(os.path.join(out_dir, "q8_0.bin"), Q.Q8_0, rows, cols, inputs, encoded, decoded)


def random_blocks(rng, n_blocks, block_bytes, half_offsets):
    """Random blocks with each F16 scale replaced by a finite one, some of them subnormal.

    Every other byte stays random, so every bit of the packed scales and numbers is reached.
    """
    blocks = rng.integers(0, 256, (n_blocks, block_bytes), dtype=np.uint8)
    for b in range(n_blocks):
        for off in half_offsets:
            if rng.integers(0, 4) == 0:
                h = np.uint16(rng.integers(1, 0x400))  # a subnormal half
            else:
                h = np.float16(rng.uniform(-0.05, 0.05)).view(np.uint16)
            blocks[b, off:off + 2] = np.array([h], dtype=np.uint16).view(np.uint8)
    return blocks


def q5_0_case(rng, out_dir):
    """Random Q5_0 blocks decoded by `gguf`. GGUF files use Q5_0 for rows that 256 does not divide."""
    rows, cols = 2, 128
    encoded = random_blocks(rng, rows * cols // 32, 22, [0])
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.Q5_0)
    write_case(os.path.join(out_dir, "q5_0.bin"), Q.Q5_0, rows, cols, [], encoded, decoded)


def q4_k_case(rng, out_dir):
    """Random Q4_K blocks decoded by `gguf`, and F32 inputs for ksai's own quantizer.

    `gguf` has no Q4_K quantizer, so the test bounds the error of ksai's against these inputs.
    """
    rows, cols = 2, 2 * QK_K
    encoded = random_blocks(rng, rows * cols // QK_K, 144, [0, 2])
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.Q4_K)
    inputs = rng.standard_normal((rows, cols)).astype(np.float32)
    inputs[1, :32] = 0.0
    inputs[1, 32:64] = np.abs(inputs[1, 32:64]) + np.float32(2.0)
    write_case(os.path.join(out_dir, "q4_k.bin"), Q.Q4_K, rows, cols, inputs, encoded, decoded)


def q6_k_case(rng, out_dir):
    """Random Q6_K blocks decoded by `gguf`."""
    rows, cols = 2, 2 * QK_K
    encoded = random_blocks(rng, rows * cols // QK_K, 210, [208])
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.Q6_K)
    write_case(os.path.join(out_dir, "q6_k.bin"), Q.Q6_K, rows, cols, [], encoded, decoded)


def q3_k_case(rng, out_dir):
    """Random Q3_K blocks decoded by `gguf`. Q3_K_M files hold most of their weights in it."""
    rows, cols = 2, 2 * QK_K
    encoded = random_blocks(rng, rows * cols // QK_K, 110, [108])
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.Q3_K)
    write_case(os.path.join(out_dir, "q3_k.bin"), Q.Q3_K, rows, cols, [], encoded, decoded)


def q5_k_case(rng, out_dir):
    """Random Q5_K blocks decoded by `gguf`."""
    rows, cols = 2, 2 * QK_K
    encoded = random_blocks(rng, rows * cols // QK_K, 176, [0, 2])
    decoded = quants.dequantize(encoded.reshape(rows, -1), Q.Q5_K)
    write_case(os.path.join(out_dir, "q5_k.bin"), Q.Q5_K, rows, cols, [], encoded, decoded)


# ==========================================
# The products. llama.cpp rounds each input row to 8 bits (Q8_K blocks for the K formats, Q8_0
# blocks for Q8_0 and Q5_0) and multiplies in integers. `gguf` holds neither step, so these cases
# call llama.cpp's own C functions, from the libraries in its Python package `llama_cpp`.
# ==========================================

Q8_K_BYTES = 4 + QK_K + 2 * QK_K // 16  # ggml's `sizeof(block_q8_K)`: d, qs, bsums
Q8_0_BYTES = 34
# Each weight format: its ggml type, its block length and bytes, the F16 scales' offsets, the
# block the inputs are rounded to, and llama.cpp's reference dot product.
PRODUCTS = {
    "q4_k": (12, QK_K, 144, [0, 2], "q8_K", "ggml_vec_dot_q4_K_q8_K_generic"),
    "q6_k": (14, QK_K, 210, [208], "q8_K", "ggml_vec_dot_q6_K_q8_K_generic"),
    "q5_0": (6, 32, 22, [0], "q8_0", "ggml_vec_dot_q5_0_q8_0_generic"),
    "q8_0": (8, 32, 34, [0], "q8_0", "ggml_vec_dot_q8_0_q8_0_generic"),
    "q3_k": (11, QK_K, 110, [108], "q8_K", "ggml_vec_dot_q3_K_q8_K_generic"),
    "q5_k": (13, QK_K, 176, [0, 2], "q8_K", "ggml_vec_dot_q5_K_q8_K_generic"),
}
# The formats added later draw their numbers after the others', so the earlier files stay as
# they were.
FIRST_PRODUCTS = ("q4_k", "q6_k", "q5_0", "q8_0")


def load_ggml():
    """llama.cpp's CPU library, from the package `llama_cpp`, with ggml-base loaded under it."""
    import ctypes
    import glob
    import llama_cpp
    lib_dir = os.path.join(os.path.dirname(llama_cpp.__file__), "lib")

    def lib(stem):
        found = sorted(glob.glob(os.path.join(lib_dir, stem + ".*")))
        assert found, f"{stem} is not in {lib_dir}"
        return ctypes.CDLL(found[0], mode=ctypes.RTLD_GLOBAL)
    lib("libggml-base")  # ggml-cpu takes its symbols from it
    cpu = lib("libggml-cpu")
    # It fills the table that turns an F16 into an F32; without it every scale reads as 0.
    cpu.ggml_cpu_init()
    # The quantizers the CPU backend runs on the inputs, not the reference ones that make weights.
    for name in ("quantize_row_q8_K", "quantize_row_q8_0"):
        getattr(cpu, name).argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int64]
    for _, _, _, _, _, dot in PRODUCTS.values():
        getattr(cpu, dot).argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_size_t,
                                      ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p,
                                      ctypes.c_size_t, ctypes.c_int]
    return cpu


def round_row(cpu, kind, row):
    """One input row rounded to llama.cpp's blocks, `q8_K` or `q8_0`, as the bytes ggml writes.

    Its CPU backend's own quantizers do it. On x86, Q8_0's is the AVX one, which rounds halves to
    even; the generic one rounds them away from 0. A library built for another CPU gives other
    files.
    """
    row = np.ascontiguousarray(row, dtype=np.float32)
    size = Q8_K_BYTES * row.size // QK_K if kind == "q8_K" else Q8_0_BYTES * row.size // 32
    out = np.zeros(size, dtype=np.uint8)
    getattr(cpu, f"quantize_row_{kind}")(row.ctypes.data, out.ctypes.data, row.size)
    return out


def product_inputs(rng, n, cols):
    """Input rows of the kinds a model gives, and the corners of rounding to 8 bits.

    Row 0 holds a block of zeros. In row 1 the largest magnitude comes twice with opposite signs,
    so the first one must set the sign of the scale. Its third block of 32 scales by exactly 1,
    so its halves show how each rounding treats a tie. Row 2 is a few large numbers among small
    ones, as an attention output can be.
    """
    x = rng.standard_normal((n, cols)).astype(np.float32)
    x[0, :QK_K] = 0.0
    x[1, 3] = np.float32(-6.0)
    x[1, 40] = np.float32(6.0)
    x[1, QK_K:QK_K + 32] = np.array([127.0, -127.0] + [k + 0.5 for k in range(-15, 15)],
                                    dtype=np.float32)
    x[2] *= np.float32(0.01)
    x[2, ::97] = np.float32(20.0)
    return x


def write_product(path, qtype, rows, cols, inputs, rounded, weights, products):
    """One product case: the magic `KSQP`, four U32s, then the five parts in that order.

    The U32s are the weight's ggml type, its rows, its columns and the input rows. The parts are
    the F32 inputs, their rounded blocks as ggml's bytes, the weight's bytes, and the products as
    F32, `[input row][weight row]`.
    """
    inputs = np.asarray(inputs, dtype="<f4").ravel()
    products = np.asarray(products, dtype="<f4").ravel()
    head = b"KSQP" + struct.pack("<4I", int(qtype), rows, cols, inputs.size // cols)
    with open(path, "wb") as f:
        f.write(head + inputs.tobytes() + np.asarray(rounded, np.uint8).tobytes()
                + np.asarray(weights, np.uint8).tobytes() + products.tobytes())


def product_case(rng, out_dir, cpu, name):
    """Random weight blocks times rounded inputs, by llama.cpp's reference dot product."""
    qtype, blen, bbytes, halves, kind, dot = PRODUCTS[name]
    rows, cols, n = 6, 3 * QK_K, 3
    weights = random_blocks(rng, rows * cols // blen, bbytes, halves)
    inputs = product_inputs(rng, n, cols)
    rounded = [round_row(cpu, kind, inputs[t]) for t in range(n)]
    row_bytes = cols // blen * bbytes
    products = np.zeros((n, rows), dtype=np.float32)
    s = np.full(1, np.nan, dtype=np.float32)
    for t in range(n):
        for i in range(rows):
            w = np.ascontiguousarray(weights[i * cols // blen:(i + 1) * cols // blen]).ravel()
            assert w.size == row_bytes
            getattr(cpu, dot)(cols, s.ctypes.data, 0, w.ctypes.data, 0, rounded[t].ctypes.data, 0, 1)
            products[t, i] = s[0]
    assert np.isfinite(products).all() and (products != 0).any(), f"{dot} wrote no products"
    write_product(os.path.join(out_dir, f"dot_{name}.bin"), qtype, rows, cols, inputs,
                  np.concatenate(rounded), weights, products)


def self_test():
    """The layout `write_case` writes, read back field by field, and the half-way inputs."""
    rng = np.random.default_rng(SEED)
    inputs = rng.standard_normal(32).astype(np.float32)
    encoded = rng.integers(0, 256, 34, dtype=np.uint8)
    decoded = rng.standard_normal(32).astype(np.float32)
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "case.bin")
        write_case(path, 8, 1, 32, inputs, encoded, decoded)
        with open(path, "rb") as f:
            data = f.read()
    assert data[:4] == b"KSQF"
    assert struct.unpack("<6I", data[4:28]) == (8, 1, 32, 32, 34, 32)
    body = data[28:]
    assert len(body) == 32 * 4 + 34 + 32 * 4
    assert np.array_equal(np.frombuffer(body[:128], "<f4"), inputs)
    assert bytes(body[128:162]) == encoded.tobytes()
    assert np.array_equal(np.frombuffer(body[162:], "<f4"), decoded)
    print("[self-test] the header, then the inputs, the encoded bytes and the decoded numbers.")
    ties = half_ties(rng, 64)
    assert len(ties) == 64
    print("[self-test] each half-way input stands exactly between two neighbouring halves.")
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "dot.bin")
        weights = rng.integers(0, 256, 2 * 34, dtype=np.uint8)
        products = rng.standard_normal(2).astype(np.float32)
        write_product(path, 8, 2, 32, inputs.reshape(1, 32), encoded, weights, products)
        with open(path, "rb") as f:
            data = f.read()
    assert data[:4] == b"KSQP" and struct.unpack("<4I", data[4:20]) == (8, 2, 32, 1)
    body = data[20:]
    assert len(body) == 32 * 4 + 34 + 68 + 2 * 4
    assert bytes(body[128:162]) == encoded.tobytes() and bytes(body[162:230]) == weights.tobytes()
    assert np.array_equal(np.frombuffer(body[230:], "<f4"), products)
    print("[self-test] a product's file: the header, inputs, rounded blocks, weights, products.")
    print("[self-test] To write the files, install gguf and llama-cpp-python and run it with "
          "--out-dir.")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-dir", required=True, help="where the files go: ksai/tests/quant_data")
    args = ap.parse_args()
    load_reference()
    os.makedirs(args.out_dir, exist_ok=True)
    rng = np.random.default_rng(SEED)
    for case in (f16_case, bf16_case, q8_0_case, q4_k_case, q6_k_case, q5_0_case):
        case(rng, args.out_dir)
    # After the cases above, so their files stay as they were.
    cpu = load_ggml()
    for name in FIRST_PRODUCTS:
        product_case(rng, args.out_dir, cpu, name)
    for case in (q3_k_case, q5_k_case):
        case(rng, args.out_dir)
    for name in PRODUCTS:
        if name not in FIRST_PRODUCTS:
            product_case(rng, args.out_dir, cpu, name)


if __name__ == "__main__":
    main()
