#!/usr/bin/env python3
"""The shared implementation of reading and writing safetensors.

It handles the same format as `Safetensors_writer` / `Safetensors` in `ksai/safetensors.kspls`:
[8B LE header length][the JSON header (right-padded with spaces to an 8-byte boundary)]
[each tensor's raw bytes joined in order].
Both `export_qwen_to_kspl.py` and `lora_finetune_external.py` share it
(the representation at hand — a numpy array or a flat Python list — is turned into
 a (name, shape, raw_bytes) triple by the caller before being handed over).

Caution: **Read the format and write to it; do not copy the KSPL side's implementation.** Copy it and,
where the format is read wrongly, both go wrong the same way and matching them up means nothing
(this is a deliberate second implementation).
"""
import json
import struct


def write_safetensors(entries, path):
    """entries: an iterable of (name, shape:list[int], raw_bytes:bytes) (F32, row-major)."""
    header, blobs, offset = {}, [], 0
    for name, shape, raw in entries:
        header[name] = {"dtype": "F32", "shape": list(shape),
                         "data_offsets": [offset, offset + len(raw)]}
        blobs.append(raw)
        offset += len(raw)
    header_bytes = json.dumps(header).encode("utf-8")
    header_bytes += b" " * ((-len(header_bytes)) % 8)
    with open(path, "wb") as f:
        f.write(struct.pack("<Q", len(header_bytes)))
        f.write(header_bytes)
        for b in blobs:
            f.write(b)


def read_safetensors(data):
    """Unpacks the bytes into (meta:dict[str,str], tensors:dict[name -> (shape, values)]).

    values is a flat list with the F32 widened into Python's float (double precision).
    Caution: **It does not match, strictly, a result computed in F32 throughout.** The values themselves
    carry over exactly, but the arithmetic from there on runs in double precision, so at a point
    right on the boundary a rounding difference can split the verdict.
    """
    if len(data) < 8:
        raise ValueError(f"safetensors is too short: {len(data)} bytes")
    header_len = struct.unpack("<Q", data[:8])[0]
    if header_len > len(data) - 8:
        raise ValueError(f"header length {header_len} is past the body's {len(data)}")
    header = json.loads(data[8:8 + header_len])
    base = 8 + header_len
    meta, tensors = header.get("__metadata__", {}), {}
    for name, info in header.items():
        if name == "__metadata__":
            continue
        if info.get("dtype") != "F32":
            raise ValueError(f"{name}: a dtype other than F32: {info.get('dtype')}")
        start, end = info["data_offsets"]
        if base + end > len(data):
            raise ValueError(f"{name}: data_offsets is past the body")
        raw = data[base + start:base + end]
        tensors[name] = (info["shape"], list(struct.unpack(f"<{len(raw) // 4}f", raw)))
    return meta, tensors
