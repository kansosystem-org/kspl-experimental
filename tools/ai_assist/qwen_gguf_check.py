#!/usr/bin/env python3
"""Checks ksai's Qwen model against llama.cpp, both running the same GGUF file.

It needs the downloaded model and llama.cpp's Python packages `llama_cpp` and `gguf`, so no gate
runs it. Build the program it drives first, then run it from the repository's root:

  out/ksplc_stage1.exe build --cflags=-O3 ksai/benches/bench_qwen.kspl out/benches/bench_qwen.exe
  python3 tools/ai_assist/qwen_gguf_check.py --model models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf
  python3 tools/ai_assist/qwen_gguf_check.py --model models/Qwen3.5-9B-Q3_K_M.gguf

Each prompt's token IDs come from llama.cpp, so the tokenizers' work does not mix in. Each check
prints `agree` or `DIFFER`:

1. **The first greedy tokens** equal llama.cpp's for each prompt. Where both agree, the smallest
   gap between the top two scores is shown; where they part, both sides' top two scores. A parting
   where each side's top two lie within `--tolerance` of each other is printed as `tie`, not `DIFFER`:
   the two sides' scores differ by that much, so either token can come first.
2. **The scores after a fixed prompt** agree within `--tolerance`. The largest difference is shown.
   Both round each product's inputs to 8 bits, so a difference in an activation's last bit can
   move a number to the next step; they never agree exactly. llama.cpp against itself, reading a
   prompt in one batch and token by token, is shown beside it as the floor.
3. **The chat template**: llama.cpp's Jinja formatter, given this file's template, renders each
   conversation of the cases file as that file holds it: `template_cases.json` for
   Qwen3-Instruct-2507, `template35_cases.json` for Qwen3.5, in `ksai/tests/qwen_data/`. Qwen3.5's
   conversations are first given the shape `llama-server` gives them. ksai's tests check that
   `chat_server` renders those same texts.

Last it prints how fast each reads the longest prompt (350 tokens) and generates 64 tokens, on
`--threads` threads: the median of `--runs` runs of each. Run with no argument, it self-tests its
own comparisons, with no model.
llama.cpp keeps its cache in F32 here, as ksai does, for the checks; its speed is measured with its
default settings.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np

import make_qwen35_fixtures

PROMPTS = [
    ("English", "The three primary colours of light are"),
    ("Japanese", "<|im_start|>user\n日本で一番高い山の名前と、その高さを教えてください。<|im_end|>\n"
                 "<|im_start|>assistant\n"),
    ("code", "def fibonacci(n):\n    \"\"\"Return the n-th Fibonacci number.\"\"\"\n"),
    ("mixed", "<|im_start|>user\nTranslate into English: 規則では、有給休暇は年に10日です。"
              "<|im_end|>\n<|im_start|>assistant\n"),
]


def top2(row):
    """The two highest scores' tokens and scores; the lower ID wins a tie, as an argmax."""
    order = np.argsort(-row, kind="stable")
    return int(order[0]), float(row[order[0]]), int(order[1]), float(row[order[1]])


def last_scores(llm):
    """The scores after the last token llama.cpp read: `llama_get_logits` of its context.

    Without `logits_all`, `Llama.scores` keeps none, and with it the scores of every position
    take gigabytes.
    """
    return np.array(np.ctypeslib.as_array(llm._ctx.get_logits(), shape=(llm.n_vocab(),)),
                    dtype=np.float64)


def llama_greedy(llm, ids, n):
    """llama.cpp's greedy tokens after `ids`, each with the top two scores; and the first scores."""
    llm.reset()
    llm.eval(ids)
    first = last_scores(llm)
    out = []
    for k in range(n):
        t = top2(last_scores(llm))
        out.append(t)
        if k + 1 < n:
            llm.eval([t[0]])
    return out, first


def llama_self_gap(llm, ids):
    """llama.cpp's scores after `ids` read in one batch, against read token by token."""
    llm.reset()
    llm.eval(ids)
    batch = last_scores(llm)
    llm.reset()
    for t in ids:
        llm.eval([t])
    one = last_scores(llm)
    return np.abs(batch - one).max(), np.abs(batch - one).mean()


def ksai_greedy(bench, model, ids, n, threads, scores_path):
    """ksai's greedy tokens after `ids`, as `bench_qwen` prints them, and its speed lines."""
    r = subprocess.run([bench, model, f"--generate={n}", f"--threads={threads}",
                        f"--scores={scores_path}"], input=" ".join(map(str, ids)),
                       capture_output=True, text=True, check=True)
    toks, speed = [], {}
    for line in r.stdout.splitlines():
        part = line.split()
        if part[0] == "TOKEN":
            toks.append((int(part[1]), float(part[2]), int(part[3]), float(part[4])))
        elif part[0] in ("PROMPT", "GENERATE"):
            speed[part[0]] = float(part[-2])
    scores = np.fromfile(scores_path, dtype="<f4").astype(np.float64)
    return toks, scores, speed


def compare_tokens(name, mine, ref, tie):
    """Whether two greedy runs agree, and the line that says so.

    The line gives the smallest gap between the top two scores where they agree, and both sides'
    top two where they part.
    """
    same = 0
    while same < len(ref) and mine[same][0] == ref[same][0]:
        same += 1
    gaps = [min(ref[i][1] - ref[i][3], mine[i][1] - mine[i][3]) for i in range(same)]
    small = f"{min(gaps):.3f}" if gaps else "none"
    if same == len(ref):
        return True, (f"agree   {name}: {same} of {len(ref)} greedy tokens equal llama.cpp's; "
                      f"the smallest gap between the top two is {small}")
    a, b = ref[same], mine[same]
    near = a[1] - a[3] <= tie and b[1] - b[3] <= tie
    return near, (f"{'tie    ' if near else 'DIFFER '} {name}: the tokens part at token {same} of "
                   f"{len(ref)}; the smallest "
                   f"gap before is {small}. llama.cpp: {a[0]} ({a[1]:.3f}) over {a[2]} "
                   f"({a[3]:.3f}); ksai: {b[0]} ({b[1]:.3f}) over {b[2]} ({b[3]:.3f})")


def architecture(model):
    """The file's `general.architecture`: `qwen3`, `qwen35` and the like."""
    from gguf import GGUFReader
    field = GGUFReader(model).fields["general.architecture"]
    return bytes(field.parts[field.data[0]]).decode("utf-8")


def default_cases(arch):
    """The template cases of a family's chat template."""
    name = "template35_cases.json" if arch == "qwen35" else "template_cases.json"
    return os.path.join("ksai", "tests", "qwen_data", name)


def rendered(fmt, arch, request):
    """One request rendered by the formatter, as `llama-server` renders it for that family."""
    if arch != "qwen35":
        return fmt(messages=request["messages"], tools=request.get("tools")).prompt
    kwargs = request.get("chat_template_kwargs", {"enable_thinking": True})
    return fmt(messages=make_qwen35_fixtures.as_llama_server(request["messages"]),
               tools=request.get("tools"), **kwargs).prompt


def check_template(model, cases_path):
    """Renders each case with llama.cpp's formatter from the file's template, against the file."""
    from gguf import GGUFReader
    from llama_cpp.llama_chat_format import Jinja2ChatFormatter
    field = GGUFReader(model).fields["tokenizer.chat_template"]
    template = bytes(field.parts[field.data[0]]).decode("utf-8")
    print(f"      the file's chat template has the SHA-256 "
          f"{hashlib.sha256(template.encode('utf-8')).hexdigest()}")
    fmt = Jinja2ChatFormatter(template, eos_token="<|im_end|>", bos_token="")
    arch = architecture(model)
    with open(cases_path, encoding="utf-8") as f:
        cases = json.load(f)
    bad = [i for i, c in enumerate(cases) if rendered(fmt, arch, c["request"]) != c["prompt"]]
    if bad:
        print(f"DIFFER  the template: llama.cpp renders cases {bad} otherwise than {cases_path}")
        return False
    print(f"agree   the template: llama.cpp renders all {len(cases)} cases as {cases_path} holds them")
    return True


def llama_speed(llama_cpp, model, ids, n, threads, runs):
    """llama.cpp's tokens a second reading `ids` and generating `n`, the median of `runs` runs.

    Its settings are the defaults; its first run also warms the file into memory.
    """
    llm = llama_cpp.Llama(model, n_ctx=4096, n_threads=threads, n_threads_batch=threads,
                          verbose=False)
    prompts, gens = [], []
    for _ in range(runs):
        llm.reset()
        began = time.monotonic()
        llm.eval(ids)
        prompts.append(len(ids) / (time.monotonic() - began))
        began = time.monotonic()
        for _ in range(n):
            llm.eval([int(np.argmax(last_scores(llm)))])
        gens.append(n / (time.monotonic() - began))
    return float(np.median(prompts)), float(np.median(gens))


def ksai_speed(bench, model, ids, n, threads, runs):
    """ksai's tokens a second reading `ids` and generating `n`, the median of `runs` runs."""
    prompts, gens = [], []
    for _ in range(runs):
        r = subprocess.run([bench, model, f"--generate={n + 1}", f"--threads={threads}"],
                           input=" ".join(map(str, ids)), capture_output=True, text=True,
                           check=True)
        for line in r.stdout.splitlines():
            part = line.split()
            if part[0] == "PROMPT":
                prompts.append(float(part[-2]))
            elif part[0] == "GENERATE":
                gens.append(float(part[-2]))
    return float(np.median(prompts)), float(np.median(gens))


def self_test():
    """The comparisons on made-up runs: a tie, two equal runs, and two that part."""
    assert top2(np.array([1.0, 3.0, 3.0, 2.0])) == (1, 3.0, 2, 3.0), "the lower ID wins a tie"
    ref = [(5, 9.0, 6, 8.0), (7, 4.0, 1, 3.5)]
    agree, line = compare_tokens("equal", list(ref), ref, 0.2)
    assert agree and "2 of 2" in line and "0.500" in line, line
    agree, line = compare_tokens("parted", [ref[0], (1, 3.9, 7, 3.8)], ref, 0.2)
    assert not agree and line.startswith("DIFFER") and "1 (3.900)" in line, line
    agree, line = compare_tokens("tied", [ref[0], (1, 3.9, 7, 3.8)], ref, 1.0)
    assert agree and line.startswith("tie"), line
    print("[self-test] qwen_gguf_check: the top two, an agreement, a parting and a tie are found as made")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", default="models/Qwen3-4B-Instruct-2507-Q4_K_M.gguf")
    ap.add_argument("--bench", default="out/benches/bench_qwen.exe")
    ap.add_argument("--cases", default="",
                    help="the template cases; by default the file's family's in ksai/tests/qwen_data")
    ap.add_argument("--generate", type=int, default=32)
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--tolerance", type=float, default=1.0,
                    help="the largest difference allowed between the two sides' scores")
    ap.add_argument("--runs", type=int, default=3, help="the runs each speed is the median of")
    ap.add_argument("--speed-generate", type=int, default=64,
                    help="the tokens generated when the speed is measured")
    a = ap.parse_args()
    import llama_cpp
    if not a.cases:
        a.cases = default_cases(architecture(a.model))
    ok = check_template(a.model, a.cases)
    llm = llama_cpp.Llama(a.model, n_ctx=4096, n_threads=a.threads, n_threads_batch=a.threads,
                          verbose=False, type_k=0, type_v=0)
    with open(a.cases, encoding="utf-8") as f:
        tool_prompt = json.load(f)[0]["prompt"]
    prompts = PROMPTS + [("a conversation with tools", tool_prompt)]
    longest = []
    with tempfile.TemporaryDirectory() as tmp:
        scores_path = os.path.join(tmp, "scores.f32")
        for i, (name, text) in enumerate(prompts):
            ids = llm.tokenize(text.encode("utf-8"), add_bos=False, special=True)
            ref, ref_scores = llama_greedy(llm, ids, a.generate)
            mine, scores, _ = ksai_greedy(a.bench, a.model, ids, a.generate, a.threads,
                                          scores_path)
            agree, line = compare_tokens(f"{name} ({len(ids)} prompt tokens)", mine, ref,
                                         a.tolerance)
            print(line)
            ok = agree and ok
            if i == 0:
                gap = np.abs(scores - ref_scores).max()
                verdict = "agree " if gap <= a.tolerance else "DIFFER"
                print(f"{verdict}  the scores after the {name} prompt: the largest difference is "
                      f"{gap:.4f} (tolerance {a.tolerance}), the mean "
                      f"{np.abs(scores - ref_scores).mean():.4f}, over scores from "
                      f"{ref_scores.min():.2f} to {ref_scores.max():.2f}")
                ok = ok and gap <= a.tolerance
            if name == "mixed":
                most, mean = llama_self_gap(llm, ids)
                print(f"        llama.cpp against itself after the {name} prompt, read in one batch "
                      f"and token by token: the largest difference is {most:.4f}, the mean "
                      f"{mean:.4f}")
            if len(ids) > len(longest):
                longest = ids
    del llm
    load = os.getloadavg()[0]
    prompt, gen = llama_speed(llama_cpp, a.model, longest, a.speed_generate, a.threads, a.runs)
    mine_prompt, mine_gen = ksai_speed(a.bench, a.model, longest, a.speed_generate, a.threads,
                                       a.runs)
    print(f"speed on {a.threads} threads, {len(longest)} prompt tokens and {a.speed_generate} "
          f"generated, the median of {a.runs} runs, load average {load:.1f}:")
    print(f"      reading the prompt: ksai {mine_prompt:.2f} tokens/s, llama.cpp {prompt:.2f} "
          f"tokens/s, {prompt / mine_prompt:.2f} times faster")
    print(f"      generating:         ksai {mine_gen:.2f} tokens/s, llama.cpp {gen:.2f} "
          f"tokens/s, {gen / mine_gen:.2f} times faster")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
