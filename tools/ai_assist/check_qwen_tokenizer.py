#!/usr/bin/env python3
"""Compares ksai's tokenizer with llama.cpp's on a real GGUF model, text by text.

Both read the vocabulary from the same GGUF file. ksai's side is `tokenize_lists.kspl`, which
takes the file's three lists through `Tokenizer.load_lists`, as the GGUF reader does, and splits
text by the rule the file's `tokenizer.ggml.pre` names (`qwen2` or `qwen35`). llama.cpp's side
is the `llama_cpp` package. Each text must give the same token IDs on both sides.

  python3 tools/ai_assist/check_qwen_tokenizer.py --model <file.gguf> [--ksplc out/ksplc_stage1.exe]

It needs the `gguf` and `llama_cpp` packages and a downloaded model, so it is a manual check, not
a gate. The texts are the samples below, seeded random strings and the repository's own files.
Run with no argument, it self-tests what needs neither package nor model.
"""
import argparse
import os
import random
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join("out", "tmp", "qwen_tokenizer_check")
PROGRAM = os.path.join("tools", "ai_assist", "tokenize_lists.kspl")

SAMPLES = [
    # English prose and its contractions, in either case.
    "The quick brown fox jumps over the lazy dog. It's 5 o'clock; they'll say we're late.",
    "I'M SURE YOU'VE SEEN IT. Don't, won't, can't, I'd, she'LL, 'tis, rock 'n' roll.",
    "'s 't 're 've 'm 'll 'd 'S 'T 'RE 'Ve 'x 'é ''s '",
    # Japanese: kanji, kana, full-width punctuation and digits, an ideographic space.
    "日本語の文章です。漢字と、ひらがなと、カタカナが混ざります。",
    "価格は１２３４円（税込）です。「かんそ」は　簡素　と書きます！？",
    "東京都千代田区１－１－１\n令和７年１０月２７日\r\nﾊﾝｶｸｶﾀｶﾅ ｱｲｳ",
    # Other scripts, including combining marks and digits that are not ASCII.
    "Привет, мир! Ελληνικά κείμενα. 中文测试，你好世界。한국어 문장입니다.",
    "مرحبا بالعالم ١٢٣ हिन्दी पाठ है। ภาษาไทย ทดสอบ עברית",
    "Ⅻ ½ ² ³ ⅓ ٣ ൬ 𝟘𝟙 Ⅷ-Ⅸ",
    "café naïve résumé coöperate é ä́",
    # Combining marks after letters, after punctuation and after a space; Qwen3.5's rule joins
    # them to the letter run, Qwen2's does not.
    "été a.́b x ́y Z̈̄ ñ̃ กัน हिन्दी नमस्ते",
    # Emoji, joined and modified.
    "Emoji 😀👍🏽 family 👨‍👩‍👧‍👦 flags 🇯🇵🇺🇸 keycap 1️⃣ heart ❤️",
    # Code in several languages.
    "def add(a, b):\n    return a + b\n\n\nclass Foo(object):\n\tpass\n",
    "#include <stdio.h>\nint main(void) {\n    printf(\"%d\\n\", 42);\n    return 0;\n}\n",
    "fn main() {\n    let v: Vec<u32> = (0..10).map(|x| x * x).collect();\n}\n",
    "const f = async (x) => { await fetch(`/api/${x}`); }; // done\n",
    "pub fn chunk_end(text: U8[], start: Sz): Sz //< where it ends\n    return start\n",
    "{\"name\": \"value\", \"list\": [1, 2.5, -3e10, true, null]}",
    "for i in $(seq 1 10); do echo \"$i\" >> /tmp/x.log 2>&1; done",
    "SELECT id, name FROM users WHERE age >= 18 AND name LIKE '%a%';",
    # Numbers.
    "3.14159 1,000,000 0x1F 0b1010 1e-10 -42 +7 100% $19.99 2026-10-27 12:34:56",
    "1234567890123456789012345678901234567890",
    # Runs of white space and newlines, in every combination the rule reads apart.
    "a  b   c    d\n\ne\n\n\nf \n g\t\th \t\n\ti",
    "   leading and trailing   ",
    "\n\n\n",
    "  \n  \n  x",
    "x\r\n\r\ny\r\rz\n\r",
    "end with space ",
    "end with spaces    ",
    "tabs\t\t\tthen\tword",
    ".\n\n(a) b.\n\n- c\n",
    "!!!\n\n???\r\n...   ",
    " nbsp  x 　y z\u0085w​v u",
    # Markers: user-defined ones become one ID, control ones stay text.
    "<think>\nreasoning\n</think>\n\nanswer",
    "<tool_call>\n{\"name\": \"f\", \"arguments\": {}}\n</tool_call>",
    "<|im_start|>user\nhi<|im_end|>\n<|im_start|>assistant\n",
    "a<think>b</think>c <tool_response>x</tool_response><think",
    # Mixed scripts within a word.
    "KSPLはself-hostingなcompilerです。version2.0で、速度が3倍になった。",
    "snake_case camelCase PascalCase kebab-case SCREAMING_CASE __dunder__",
    "",
    " ",
    "'",
    "a",
]

# The pool the random texts draw from: each class the rule reads apart, a few of each.
POOL = (list("abcXYZ") + list("0189") + list(" \t\n\r") + list("'.,!?-_(){}[]<>/\\\"#@") +
        ["sS", "tT", "re", "ve", "ll", "mM", "dD", "RE", "LL"] +
        list("あア漢字ｱ") + list("１２") + ["　", " ", " ", "\u0085"] +
        list("éñßДж") + ["́", "̈"] + ["😀", "👍🏽", "🇯🇵"] + list("٣Ⅻ½") +
        ["<think>", "</think>", "<tool_call>", "<|im_end|>"])


def random_texts(count, seed):
    """Seeded random strings from `POOL`, so a failing one can be found again."""
    rng = random.Random(seed)
    return ["".join(rng.choice(POOL) for _ in range(rng.randint(1, 40))) for _ in range(count)]


def repository_texts(root, limit):
    """The tracked text files of the repository, up to `limit` bytes each."""
    names = subprocess.run(["git", "ls-files"], cwd=root, capture_output=True, text=True,
                           check=True).stdout.split("\n")
    out = []
    for name in names:
        path = os.path.join(root, name)
        if not name or not os.path.isfile(path) or os.path.getsize(path) > limit:
            continue
        with open(path, "rb") as f:
            data = f.read()
        if b"\0" in data:
            continue
        try:
            out.append((name, data.decode("utf-8")))
        except UnicodeDecodeError:
            continue
    return out


def write_hex(path, entries):
    """One entry per line, as hex: the form `tokenize_lists.kspl` reads."""
    with open(path, "w") as f:
        for e in entries:
            f.write(e.hex() + "\n")


def first_difference(a, b):
    """Where two ID lists first differ, or -1 when they are equal."""
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            return i
    return -1 if len(a) == len(b) else min(len(a), len(b))


def self_test():
    """The parts that need no model: the random texts, the hex form and the comparison."""
    assert random_texts(3, 7) == random_texts(3, 7), "the same seed must give the same texts"
    assert all(t for t in random_texts(50, 1)), "a random text is never empty"
    assert first_difference([1, 2, 3], [1, 2, 3]) == -1
    assert first_difference([1, 2, 3], [1, 5, 3]) == 1
    assert first_difference([1, 2], [1, 2, 3]) == 2
    assert "日".encode().hex() == "e697a5"
    print("[self-test] the random texts, the hex form and the comparison are confirmed.")
    print("[self-test] To compare with llama.cpp, run it with --model <file.gguf>.")


def gguf_lists(model):
    """The splitting rule's name and the vocabulary's three lists, as the GGUF file holds them."""
    from gguf import GGUFReader
    r = GGUFReader(model)

    def strings(name):
        f = r.fields[name]
        return [bytes(f.parts[i]) for i in f.data]

    types = r.fields["tokenizer.ggml.token_type"]
    pre = r.fields["tokenizer.ggml.pre"]
    return (bytes(pre.parts[pre.data[0]]).decode("utf-8"), strings("tokenizer.ggml.tokens"),
            [int(types.parts[i][0]) for i in types.data], strings("tokenizer.ggml.merges"))


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", required=True, help="the GGUF file")
    ap.add_argument("--ksplc", default=os.path.join("out", "ksplc_stage1.exe"))
    ap.add_argument("--random", type=int, default=5000, help="how many random texts")
    ap.add_argument("--seed", type=int, default=20261027)
    ap.add_argument("--file-limit", type=int, default=1 << 20, help="the largest file read, in bytes")
    args = ap.parse_args()
    from llama_cpp import Llama

    os.chdir(ROOT)
    os.makedirs(WORK, exist_ok=True)
    pre, tokens, types, merges = gguf_lists(args.model)
    write_hex(os.path.join(WORK, "tokens.txt"), tokens)
    with open(os.path.join(WORK, "types.txt"), "w") as f:
        f.write("".join(f"{t}\n" for t in types))
    write_hex(os.path.join(WORK, "merges.txt"), merges)

    texts = [("sample", t) for t in SAMPLES]
    texts += [("random", t) for t in random_texts(args.random, args.seed)]
    texts += repository_texts(ROOT, args.file_limit)
    write_hex(os.path.join(WORK, "texts.txt"), [t.encode() for _, t in texts])

    exe = os.path.join(WORK, "tokenize_lists.exe")
    subprocess.run([args.ksplc, "build", PROGRAM, exe], check=True)
    got = subprocess.run([exe, pre] + [os.path.join(WORK, n) for n in
                                       ("tokens.txt", "types.txt", "merges.txt", "texts.txt")],
                         capture_output=True, text=True, check=True).stdout.split("\n")
    llama = Llama(args.model, n_ctx=512, verbose=False, vocab_only=True)

    differ = 0
    total = 0
    for i, (name, text) in enumerate(texts):
        want = llama.tokenize(text.encode(), add_bos=False, special=False)
        mine = [int(x) for x in got[i].split()]
        total += len(want)
        at = first_difference(want, mine)
        if at < 0:
            continue
        differ += 1
        if differ <= 10:
            piece = lambda ids: [llama.detokenize([t], special=True) for t in ids[at:at + 6]]
            print(f"DIFF {name}: token {at}: llama.cpp {piece(want)} ksai {piece(mine)}")
    print(f"compared {len(texts)} texts ({total} tokens from llama.cpp), split as {pre}: "
          f"{differ} differ")
    sys.exit(1 if differ else 0)


if __name__ == "__main__":
    main()
