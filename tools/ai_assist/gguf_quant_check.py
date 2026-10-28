#!/usr/bin/env python3
"""Takes real tensors out of GGUF files, for checking ksai's decoding on a real model.

It is a manual check, not a gate: the models are large and are not in this repository. For each
GGUF file it picks a few tensors of every format ksai reads. It writes each one as a reference
file: the tensor's raw bytes, and the numbers `gguf`'s reference decodes from them. The layout is
the one `make_quant_fixtures.py` writes, and `ksai/benches/bench_quant.kspl` reads it:

  python3 tools/ai_assist/gguf_quant_check.py --out-dir out/gguf_check \\
      qwen2.5-0.5b-instruct-q8_0.gguf qwen2.5-0.5b-instruct-q4_k_m.gguf
  out/ksplc_stage1.exe build ksai/benches/bench_quant.kspl out/bench_quant.exe
  out/bench_quant.exe out/gguf_check/*.bin

A file that is not there is skipped with a line saying so, so the same command runs anywhere.
Run with no argument, it self-tests which tensors it picks, which needs numpy alone.
"""
import argparse
import os
import sys

from types import SimpleNamespace

import numpy as np

from make_quant_fixtures import write_case

READ_BY_KSAI = ("F32", "F16", "BF16", "Q5_0", "Q8_0", "Q4_K", "Q6_K")  # the formats' gguf names
PER_FORMAT = 3  # tensors taken of each format in each file
MOST_NUMBERS = 5_000_000  # a larger tensor writes a decoded file of more than 20 MB


def picked(reader, readable):
    """Up to PER_FORMAT tensors of each format ksai reads, the largest that fit first.

    The largest come first so that an MLP weight, the matrix a model spends most time on, is among
    them.
    """
    by_type = {}
    for t in reader.tensors:
        n = int(np.prod(t.shape))
        if t.tensor_type in readable and n <= MOST_NUMBERS:
            by_type.setdefault(t.tensor_type, []).append((n, t))
    for kind in sorted(by_type):
        for _, t in sorted(by_type[kind], key=lambda p: -p[0])[:PER_FORMAT]:
            yield t


def write_tensor(t, path, quants):
    """One tensor as a reference file: rows are GGUF's second dimension and up, flattened."""
    cols = int(t.shape[0])
    rows = int(np.prod(t.shape)) // cols
    raw = np.ascontiguousarray(t.data).view(np.uint8).reshape(rows, -1)
    decoded = quants.dequantize(raw, t.tensor_type)
    write_case(path, t.tensor_type, rows, cols, [], raw, decoded)
    return rows, cols


def self_test():
    """Which tensors `picked` takes, from a stand-in file of made-up tensors."""
    def tensor(name, kind, *shape):
        return SimpleNamespace(name=name, tensor_type=kind, shape=shape)
    reader = SimpleNamespace(tensors=[
        tensor("a", 2, 256, 4), tensor("b", 2, 256, 64), tensor("c", 2, 256, 16),
        tensor("d", 2, 256, 2), tensor("e", 1, 32, 8), tensor("f", 9, 64, 8),
        tensor("huge", 1, 4096, 4096)])
    names = [t.name for t in picked(reader, {1, 2})]
    assert names == ["e", "b", "c", "a"], names
    print("[self-test] it takes the largest tensors of each format it reads, at most 3 of each.")
    print("[self-test] it leaves out a format ksai does not read, and a tensor over its size cap.")
    print("[self-test] To check real tensors, install gguf and give it --out-dir and GGUF files.")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    from gguf import GGMLQuantizationType, GGUFReader, quants
    readable = {GGMLQuantizationType[name] for name in READ_BY_KSAI}
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-dir", required=True, help="where the reference files go")
    ap.add_argument("gguf", nargs="+", help="GGUF files to take tensors from")
    args = ap.parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    for path in args.gguf:
        if not os.path.isfile(path):
            print(f"SKIP {path}: there is no such file", file=sys.stderr)
            continue
        stem = os.path.splitext(os.path.basename(path))[0]
        for t in picked(GGUFReader(path), readable):
            out = os.path.join(args.out_dir, f"{stem}.{t.name}.bin")
            rows, cols = write_tensor(t, out, quants)
            print(f"{out}: {t.tensor_type.name} {rows} x {cols}")


if __name__ == "__main__":
    main()
