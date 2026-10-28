#!/usr/bin/env python3
"""Writes `ksai/unicode_class.kspl`: Unicode's letter, mark, number and white-space classes as
llama.cpp reads them.

ksai's tokenizer splits text by Qwen's rules, which name `\\p{L}`, `\\p{N}` and `\\s`, and in
Qwen3.5's rule `\\p{M}` too. To give the same tokens as llama.cpp, the classes must be llama.cpp's
own, not another library's: Unicode's version decides which code points are letters, and
llama.cpp's white space is a list of its own. So the table is generated from llama.cpp's
`src/unicode-data.cpp`, never from Python's `unicodedata`.

  python3 tools/ai_assist/gen_unicode_class.py <llama.cpp>/src/unicode-data.cpp
  python3 tools/ai_assist/gen_unicode_class.py <llama.cpp>/src/unicode-data.cpp --check

`--check` writes nothing: it fails when the committed file differs from what the source gives.
Run with no argument, it self-tests on a small made-up source.
"""
import argparse
import os
import re
import sys

OUT = os.path.join("ksai", "unicode_class.kspl")

# llama.cpp's flag bits (its `unicode_cpt_flags`).
FLAG_NUMBER = 0x0002
FLAG_LETTER = 0x0004
FLAG_MARK = 0x0010

# The classes the table holds. Caution: **keep them in step with the tokenizer's rule**: it reads
# the numbers through the constants the generated file declares, never as bare numbers.
OTHER, LETTER, NUMBER, SPACE, MARK = 0, 1, 2, 3, 4
CLASS_NAMES = ("OTHER", "LETTER", "NUMBER", "SPACE", "MARK")
CLASS_BITS = 3  # the low bits of a packed run that hold its class
MAX_CODEPOINTS = 0x110000

# The letters of the contractions in Qwen's rule (`'s`, `'t`, `'re`, `'ve`, `'m`, `'ll`, `'d`).
CONTRACTION_LETTERS = "stmdrevl"

WIDTH = 100  # the line width `ksplc fmt` fills an initializer to


def section(src, name):
    """The text between `<name> = {` and the `};` that closes it."""
    start = src.find(name + " = {")
    if start < 0:
        raise ValueError(f"{name} is not in the source")
    body = src[start + len(name) + 4:]
    return body[:body.find("};")]


def read_source(src):
    """The flag ranges, the white-space code points and the lower-case map of unicode-data.cpp."""
    pair = re.compile(r"\{0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)\}")
    ranges = [(int(a, 16), int(b, 16)) for a, b in pair.findall(section(src, "unicode_ranges_flags"))]
    spaces = [int(x, 16) for x in re.findall(r"0x([0-9A-Fa-f]+)", section(src, "unicode_set_whitespace"))]
    lower = [(int(a, 16), int(b, 16)) for a, b in pair.findall(section(src, "unicode_map_lowercase"))]
    return ranges, spaces, lower


def classes(ranges, spaces, lower):
    """The class of every code point, after checking what the tokenizer's rule relies on."""
    if not ranges or ranges[0][0] != 0 or ranges[-1] != (MAX_CODEPOINTS, 0):
        raise ValueError("the ranges must start at 0 and end with (0x110000, 0)")
    out = bytearray(MAX_CODEPOINTS)
    for (start, flags), (end, _) in zip(ranges, ranges[1:]):
        if flags == 0:
            # The rule reads a zero flag set as "past the end of the text" (llama.cpp's
            # `as_uint()`); inside the text it never occurs.
            raise ValueError(f"U+{start:04X} has no flag at all")
        if bin(flags & (FLAG_LETTER | FLAG_NUMBER | FLAG_MARK)).count("1") > 1:
            raise ValueError(f"U+{start:04X} is more than one of a letter, a number and a mark")
        cls = (LETTER if flags & FLAG_LETTER else NUMBER if flags & FLAG_NUMBER
               else MARK if flags & FLAG_MARK else OTHER)
        out[start:end] = bytes([cls]) * (end - start)
    for cp in spaces:
        if out[cp] != OTHER:
            raise ValueError(f"U+{cp:04X} is white space and a letter or a number")
        out[cp] = SPACE
    for upper, low in lower:
        if upper >= 0x80 and chr(low) in CONTRACTION_LETTERS:
            # The tokenizer folds only ASCII to lower case before matching a contraction.
            raise ValueError(f"U+{upper:04X} folds to {chr(low)!r}, outside ASCII")
    return out


def runs(cls):
    """Each run of one class, as (first code point, class)."""
    out = [(0, cls[0])]
    for cp in range(1, len(cls)):
        if cls[cp] != cls[cp - 1]:
            out.append((cp, cls[cp]))
    return out


def filled(head, values):
    """`head` and the values, filled line by line as `ksplc fmt` lays out an initializer."""
    lines = []
    line = head + " ::{"
    for i, v in enumerate(values):
        item = v + (" }" if i == len(values) - 1 else ",")
        if len(line) + 1 + len(item) > WIDTH:
            lines.append(line)
            line = "    " + item
        else:
            line += " " + item
    lines.append(line)
    return lines


def render(cls):
    """The text of `ksai/unicode_class.kspl`."""
    # In decimal: a hex literal ending in F32 or F64 would read as a float suffix.
    packed = [str((start << CLASS_BITS) | c) for start, c in runs(cls)]
    lines = [
        "//< Unicode's letter, mark, number and white-space classes, as llama.cpp reads them",
        "//< Caution: **Generated: do not edit.** `tools/ai_assist/gen_unicode_class.py` writes it",
        "//< from llama.cpp's `src/unicode-data.cpp`, and its `--check` compares the two.",
        "",
    ]
    for i, name in enumerate(CLASS_NAMES):
        lines.append(f"const CLASS_{name}: U8 = {i}")
    lines += ["", "// The class of each code point below 0x80."]
    lines += filled("const ASCII_CLASS: U8[128] =", [str(cls[cp]) for cp in range(0x80)])
    lines += [
        "",
        "// Each run of one class: its first code point shifted left by 3, the class in the low 3",
        "// bits. Ascending from 0; a run lasts until the next one starts, the last one to 10FFFF.",
    ]
    lines += filled(f"const CLASS_RUNS: U32[{len(packed)}] =", packed)
    return "\n".join(lines) + "\n"


def generate(src_path):
    with open(src_path, encoding="utf-8") as f:
        src = f.read()
    return render(classes(*read_source(src)))


def self_test():
    """A made-up source: ASCII as llama.cpp has it, a few ranges above it, and its checks firing."""
    src = (
        "unicode_ranges_flags = {\n{0x000000, 0x0080},\n{0x000020, 0x0008},\n{0x000021, 0x0020},\n"
        "{0x000030, 0x0002},\n{0x00003A, 0x0020},\n{0x000041, 0x0004},\n{0x00005B, 0x0020},\n"
        "{0x000061, 0x0004},\n{0x00007B, 0x0020},\n{0x00007F, 0x0080},\n{0x000300, 0x0010},\n"
        "{0x000370, 0x0080},\n{0x003041, 0x0004},\n"
        "{0x003097, 0x0001},\n{0x00FF10, 0x0002},\n{0x00FF1A, 0x0001},\n{0x110000, 0x0000},\n};\n"
        "unicode_set_whitespace = {\n0x000009, 0x00000A, 0x000020, 0x003000,\n};\n"
        "unicode_map_lowercase = {\n{0x000041, 0x000061},\n{0x000053, 0x000073},\n};\n")
    cls = classes(*read_source(src))
    assert cls[ord("a")] == LETTER and cls[ord("Z")] == LETTER and cls[ord("_")] == OTHER
    assert cls[ord("7")] == NUMBER and cls[ord(" ")] == SPACE and cls[0x0A] == SPACE
    assert cls[0x3042] == LETTER and cls[0xFF11] == NUMBER and cls[0x3000] == SPACE
    assert cls[0x10FFFF] == OTHER and cls[0x301] == MARK and cls[0x370] == OTHER
    text = render(cls)
    assert "const CLASS_RUNS: U32[" in text and "const ASCII_CLASS: U8[128]" in text
    assert max(len(line) for line in text.split("\n")) <= WIDTH
    assert " 98825," in text, "U+3041 starts a letter run: 0x3041 << 3 | 1"
    assert " 6148," in text, "U+0300 starts a mark run: 0x300 << 3 | 4"
    for bad, why in ((src.replace("{0x110000, 0x0000}", "{0x10FFFF, 0x0000}"), "the end"),
                     (src.replace("{0x003097, 0x0001}", "{0x003097, 0x0006}"), "letter and number"),
                     (src.replace("{0x000300, 0x0010}", "{0x000300, 0x0014}"), "letter and mark"),
                     (src.replace("0x003000,", "0x003042,"), "white space inside a letter run"),
                     (src.replace("{0x000053, 0x000073}", "{0x00017F, 0x000073}"), "fold to s")):
        try:
            classes(*read_source(bad))
        except ValueError:
            continue
        raise AssertionError(f"a source breaking {why} was taken")
    print("[self-test] the classes, the packed runs and each refusal are confirmed on a made-up")
    print("[self-test] source. To generate the table, name llama.cpp's src/unicode-data.cpp.")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="llama.cpp's src/unicode-data.cpp")
    ap.add_argument("--out", default=OUT)
    ap.add_argument("--check", action="store_true", help="compare with the file instead of writing")
    args = ap.parse_args()
    text = generate(args.source)
    if args.check:
        with open(args.out, encoding="utf-8") as f:
            if f.read() != text:
                print(f"{args.out} differs from what {args.source} gives; run without --check",
                      file=sys.stderr)
                sys.exit(1)
        print(f"{args.out} matches {args.source}")
        return
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
