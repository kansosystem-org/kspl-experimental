#!/usr/bin/env python3
"""Writes the tiny Qwen3.5 model and the Qwen3.5 chat-template cases that ksai's tests read.

The tests need no download and no Python: both files are committed. Run this again only when a
case changes. It needs llama.cpp's Python packages, `gguf` and `llama_cpp`, and the downloaded
Qwen3.5-9B file, whose chat template the tiny model carries:

  python3 tools/ai_assist/make_qwen35_fixtures.py \
      --template-from models/Qwen3.5-9B-Q3_K_M.gguf --out-dir ksai/tests/qwen_data

It writes two files:

* `tiny_qwen35.gguf`: a Qwen3.5-shaped model of 4 blocks with random weights in F32, Q8_0, Q3_K,
  Q4_K and Q5_K. Blocks 0 and 2 are gated delta nets, and blocks 1 and 3 attend, with a gate per
  query head and RoPE on 16 of each head's 64 numbers. Its `ksai.check.scores` hold the scores
  the model gives after each token of `ksai.check.tokens`, computed here in F64 from the decoded
  weights. Each product's input is first rounded to 8 bits as llama.cpp's CPU backend rounds it:
  to Q8_0 blocks for a Q8_0 weight, to Q8_K blocks for a K weight, and not at all for F32.
* `template35_cases.json`: conversations in the shape a client sends, each with the prompt text
  llama.cpp's Jinja formatter renders from the template. The messages are first given the shape
  `llama-server` gives them before it renders: tool-call arguments sent as JSON text are parsed
  into objects (`func_args_not_string`). `enable_thinking` is true, as `llama-server --jinja`
  sets it by default, unless the case's request sends `chat_template_kwargs`.

Run with no argument, it self-tests what needs no download and no llama.cpp: the reference sees
no later token, the recurrence fed in two pieces equals it fed whole, and, where `gguf` is
installed, the model file as `gguf` reads it back. Without `gguf` every weight is F32.

The seed is fixed. Another numpy version can draw other numbers; the files then differ, and each
still agrees with itself. Where `llama_cpp` loads the tiny model, the scores are also compared with
llama.cpp's own, and the largest gap is shown.
"""
import argparse
import json
import os
import sys
import tempfile

import numpy as np

import make_qwen_fixtures as base

SEED = 20261028
ARCH = "qwen35"
N_LAYERS = 4
INTERVAL = 2  # every second block attends: blocks 1 and 3; 0 and 2 are delta nets
HIDDEN = 32
N_HEADS = 4
N_KV_HEADS = 2
HEAD_DIM = 64  # four heads of 64: the 256 numbers a K block needs, so `attn_output` can be Q3_K
ROPE_DIMS = 16  # RoPE turns the first 16 of each head's 64 numbers, as Qwen3.5 turns 64 of 256
SECTIONS = [3, 3, 2, 0]  # multimodal sections that a text position fills
K_HEADS = 2  # the delta nets' query and key heads
V_HEADS = 4  # their value heads; value head h reads key head h % K_HEADS
STATE = 64  # a head's width in the delta nets; V_HEADS × STATE = 256, so `ssm_out` can be Q5_K
KERNEL = 4  # the short convolution's positions
FFN = 256
CONTEXT = 4096
THETA = 10000000.0
EPS = 1e-6
ALIGNMENT = 64
CHANNELS = (2 * K_HEADS + V_HEADS) * STATE


def attends(i):
    """Whether block `i` attends; the others are gated delta nets."""
    return (i + 1) % INTERVAL == 0


def k_weight(rng, rows, cols, qtype, block_bytes, halves):
    """A K weight of random blocks with small F16 scales: its bytes and their numbers.

    Any bytes form a valid block, and `gguf` quantizes none of these formats, so the blocks are
    drawn. `halves` gives each F16 scale's offset in a block and its value.
    """
    blocks = rng.integers(0, 256, (rows, cols // 256, block_bytes), dtype=np.uint8)
    for off, value in halves:
        blocks[:, :, off:off + 2] = np.array([value], dtype=np.float16).view(np.uint8)
    data = blocks.reshape(rows, -1)
    return data, base.quants.dequantize(data, qtype).astype(np.float64)


def weights(rng, vocab, quantized=True):
    """Every tensor: name -> (bytes or F32 array, ggml type, decoded F64 numbers).

    With `quantized` false, every weight is F32 and has no ggml type, so `gguf` is not needed.
    """
    w = {}
    Q = base.Q
    F32 = Q.F32 if quantized else None

    def put(name, made, qtype):
        w[name] = (made[0], qtype, made[1])

    def f32(rows, cols, scale):
        return base.f32(rng, rows, cols, scale), F32

    def q8(rows, cols, scale):
        if quantized:
            return base.q8_0(rng, rows, cols, scale), Q.Q8_0
        return base.f32(rng, rows, cols, scale), None

    def kq(rows, cols, kind):
        if not quantized:
            return base.f32(rng, rows, cols, 0.01), None
        if kind == "q3_k":
            return k_weight(rng, rows, cols, Q.Q3_K, 110, [(108, 0.0004)]), Q.Q3_K
        if kind == "q5_k":
            return k_weight(rng, rows, cols, Q.Q5_K, 176, [(0, 0.00002), (2, 0.0003)]), Q.Q5_K
        return base.q4_k(rng, rows, cols), Q.Q4_K

    def vec(name, values):
        values = np.asarray(values, dtype=np.float32)
        put(name, (values, values.astype(np.float64)), F32)

    put("token_embd.weight", *q8(vocab, HIDDEN, 1.0))
    for i in range(N_LAYERS):
        p = f"blk.{i}."
        vec(p + "attn_norm.weight", base.gain(rng, HIDDEN))
        if attends(i):
            put(p + "attn_q.weight", *q8(2 * N_HEADS * HEAD_DIM, HIDDEN, 0.3))
            put(p + "attn_k.weight", *q8(N_KV_HEADS * HEAD_DIM, HIDDEN, 0.3))
            put(p + "attn_v.weight", *f32(N_KV_HEADS * HEAD_DIM, HIDDEN, 0.3))
            put(p + "attn_output.weight", *kq(HIDDEN, N_HEADS * HEAD_DIM, "q3_k"))
            vec(p + "attn_q_norm.weight", base.gain(rng, HEAD_DIM))
            vec(p + "attn_k_norm.weight", base.gain(rng, HEAD_DIM))
        else:
            put(p + "attn_qkv.weight", *q8(CHANNELS, HIDDEN, 0.3))
            put(p + "attn_gate.weight", *f32(V_HEADS * STATE, HIDDEN, 0.3))
            put(p + "ssm_alpha.weight", *q8(V_HEADS, HIDDEN, 0.3))
            put(p + "ssm_beta.weight", *q8(V_HEADS, HIDDEN, 0.3))
            conv = rng.normal(0.0, 0.5, (CHANNELS, KERNEL)).astype(np.float32)
            put(p + "ssm_conv1d.weight", (conv, conv.astype(np.float64)), F32)
            vec(p + "ssm_dt.bias", rng.normal(0.0, 1.0, V_HEADS))
            vec(p + "ssm_a", -np.exp(rng.normal(0.0, 0.5, V_HEADS)))
            vec(p + "ssm_norm.weight", base.gain(rng, STATE))
            put(p + "ssm_out.weight", *kq(HIDDEN, V_HEADS * STATE, "q5_k"))
        vec(p + "post_attention_norm.weight", base.gain(rng, HIDDEN))
        put(p + "ffn_gate.weight", *q8(FFN, HIDDEN, 0.3))
        put(p + "ffn_up.weight", *f32(FFN, HIDDEN, 0.3))
        put(p + "ffn_down.weight", *kq(HIDDEN, FFN, "q4_k" if i % 2 == 0 else "q3_k"))
    vec("output_norm.weight", base.gain(rng, HIDDEN))
    put("output.weight", *q8(vocab, HIDDEN, 0.5))
    return w


def rms(x, g):
    """RMS norm over the last axis, then the gain."""
    return x / np.sqrt(np.mean(x * x, axis=-1, keepdims=True) + EPS) * g


def silu(x):
    return x / (1.0 + np.exp(-x))


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def softplus(x):
    """`log(1 + e^x)`, and `x` itself above 20, as ggml's."""
    return np.where(x > 20.0, x, np.log1p(np.exp(np.minimum(x, 20.0))))


def rope(x, pos):
    """NeoX-style RoPE on each head's first ROPE_DIMS numbers; the rest stay."""
    half = ROPE_DIMS // 2
    freq = THETA ** (-np.arange(half) * 2.0 / ROPE_DIMS)
    ang = pos * freq
    c, s = np.cos(ang), np.sin(ang)
    a, b = x[..., :half], x[..., half:ROPE_DIMS]
    return np.concatenate([a * c - b * s, b * c + a * s, x[..., ROPE_DIMS:]], axis=-1)


class Model:
    """The tiny model's forward pass in F64, with the delta nets' state kept between calls."""

    def __init__(self, w):
        self.w = w
        self.reset()

    def reset(self):
        """A sequence from position 0: no cached keys, empty states."""
        self.pos = 0
        self.keys = {i: np.zeros((0, N_KV_HEADS, HEAD_DIM)) for i in range(N_LAYERS)}
        self.values = {i: np.zeros((0, N_KV_HEADS, HEAD_DIM)) for i in range(N_LAYERS)}
        self.hist = {i: np.zeros((KERNEL - 1, CHANNELS)) for i in range(N_LAYERS)}
        self.state = {i: np.zeros((V_HEADS, STATE, STATE)) for i in range(N_LAYERS)}

    def d(self, name):
        return self.w[name][2]

    def mul(self, x, name):
        """`x` times weight `name`'s rows, its input rounded as the weight's format asks."""
        qtype = self.w[name][1]
        Q = base.Q
        if qtype is not None and qtype != Q.F32:
            x = base.round_q8_0(x) if qtype == Q.Q8_0 else base.round_q8_k(x)
        return x @ self.d(name).T

    def attention(self, i, h):
        """Block `i`'s gated attention over every position so far, these rows included."""
        p = f"blk.{i}."
        n = h.shape[0]
        qg = self.mul(h, p + "attn_q.weight").reshape(n, N_HEADS, 2, HEAD_DIM)
        q, gate = qg[:, :, 0], qg[:, :, 1]
        k = self.mul(h, p + "attn_k.weight").reshape(n, N_KV_HEADS, HEAD_DIM)
        v = self.mul(h, p + "attn_v.weight").reshape(n, N_KV_HEADS, HEAD_DIM)
        q = rms(q, self.d(p + "attn_q_norm.weight"))
        k = rms(k, self.d(p + "attn_k_norm.weight"))
        pos = (self.pos + np.arange(n))[:, None, None]
        q, k = rope(q, pos), rope(k, pos)
        self.keys[i] = np.concatenate([self.keys[i], k])
        self.values[i] = np.concatenate([self.values[i], v])
        keys, values = self.keys[i], self.values[i]
        groups = N_HEADS // N_KV_HEADS
        out = np.zeros((n, N_HEADS, HEAD_DIM))
        for hd in range(N_HEADS):
            sc = q[:, hd] @ keys[:, hd // groups].T / np.sqrt(HEAD_DIM)
            seen = self.pos + np.arange(n)
            sc = np.where(np.arange(len(keys))[None, :] <= seen[:, None], sc, -np.inf)
            e = np.exp(sc - sc.max(axis=1, keepdims=True))
            out[:, hd] = (e / e.sum(axis=1, keepdims=True)) @ values[:, hd // groups]
        out = out * sigmoid(gate)
        return self.mul(out.reshape(n, -1), p + "attn_output.weight")

    def delta_net(self, i, h):
        """Block `i`'s gated delta net over these rows, moving its state on."""
        p = f"blk.{i}."
        n = h.shape[0]
        mixed = self.mul(h, p + "attn_qkv.weight")
        z = self.mul(h, p + "attn_gate.weight")
        al = self.mul(h, p + "ssm_alpha.weight")
        be = self.mul(h, p + "ssm_beta.weight")
        conv_w = self.d(p + "ssm_conv1d.weight")
        inp = np.concatenate([self.hist[i], mixed])
        conv = np.stack([(inp[t:t + KERNEL] * conv_w.T).sum(axis=0) for t in range(n)])
        self.hist[i] = inp[n:]
        c = silu(conv)
        kd = K_HEADS * STATE
        q = c[:, :kd].reshape(n, K_HEADS, STATE)
        k = c[:, kd:2 * kd].reshape(n, K_HEADS, STATE)
        v = c[:, 2 * kd:].reshape(n, V_HEADS, STATE)
        q = q / np.sqrt((q * q).sum(axis=-1, keepdims=True) + EPS)
        k = k / np.sqrt((k * k).sum(axis=-1, keepdims=True) + EPS)
        g = softplus(al + self.d(p + "ssm_dt.bias")) * self.d(p + "ssm_a")
        beta = sigmoid(be)
        s = self.state[i]
        o = np.zeros((n, V_HEADS, STATE))
        for t in range(n):
            for hd in range(V_HEADS):
                kh = hd % K_HEADS
                s[hd] *= np.exp(g[t, hd])
                delta = (v[t, hd] - s[hd] @ k[t, kh]) * beta[t, hd]
                s[hd] += np.outer(delta, k[t, kh])
                o[t, hd] = s[hd] @ q[t, kh] / np.sqrt(STATE)
        o = rms(o, self.d(p + "ssm_norm.weight")) * silu(z.reshape(n, V_HEADS, STATE))
        return self.mul(o.reshape(n, -1), p + "ssm_out.weight")

    def forward(self, tokens):
        """The scores after each of `tokens`, read at the next positions."""
        n = len(tokens)
        x = self.d("token_embd.weight")[tokens]
        for i in range(N_LAYERS):
            p = f"blk.{i}."
            h = rms(x, self.d(p + "attn_norm.weight"))
            x = x + (self.attention(i, h) if attends(i) else self.delta_net(i, h))
            h = rms(x, self.d(p + "post_attention_norm.weight"))
            g = self.mul(h, p + "ffn_gate.weight")
            u = self.mul(h, p + "ffn_up.weight")
            x = x + self.mul(silu(g) * u, p + "ffn_down.weight")
        self.pos += n
        return self.mul(rms(x, self.d("output_norm.weight")), "output.weight")


def write_model(path, template, rng):
    """The tiny model file; returns the check tokens and the reference scores."""
    tokens, types, merges = base.vocabulary()
    w = weights(rng, len(tokens))
    ids = base.check_tokens(tokens)
    scores = Model(w).forward(ids)
    gw = base.GGUFWriter(path, ARCH)
    gw.add_custom_alignment(ALIGNMENT)
    gw.add_name("tiny-qwen35")
    gw.add_uint32(f"{ARCH}.block_count", N_LAYERS)
    gw.add_uint32(f"{ARCH}.context_length", CONTEXT)
    gw.add_uint32(f"{ARCH}.embedding_length", HIDDEN)
    gw.add_uint32(f"{ARCH}.feed_forward_length", FFN)
    gw.add_uint32(f"{ARCH}.attention.head_count", N_HEADS)
    gw.add_uint32(f"{ARCH}.attention.head_count_kv", N_KV_HEADS)
    gw.add_uint32(f"{ARCH}.attention.key_length", HEAD_DIM)
    gw.add_uint32(f"{ARCH}.attention.value_length", HEAD_DIM)
    gw.add_array(f"{ARCH}.rope.dimension_sections", SECTIONS)
    gw.add_float32(f"{ARCH}.rope.freq_base", THETA)
    gw.add_float32(f"{ARCH}.attention.layer_norm_rms_epsilon", EPS)
    gw.add_uint32(f"{ARCH}.rope.dimension_count", ROPE_DIMS)
    gw.add_uint32(f"{ARCH}.full_attention_interval", INTERVAL)
    gw.add_uint32(f"{ARCH}.ssm.conv_kernel", KERNEL)
    gw.add_uint32(f"{ARCH}.ssm.state_size", STATE)
    gw.add_uint32(f"{ARCH}.ssm.group_count", K_HEADS)
    gw.add_uint32(f"{ARCH}.ssm.time_step_rank", V_HEADS)
    gw.add_uint32(f"{ARCH}.ssm.inner_size", V_HEADS * STATE)
    gw.add_tokenizer_model("gpt2")
    gw.add_tokenizer_pre("qwen35")
    gw.add_token_list(tokens)
    gw.add_token_types(types)
    gw.add_token_merges(merges)
    gw.add_eos_token_id(tokens.index("<|im_end|>"))
    gw.add_pad_token_id(tokens.index("<|endoftext|>"))
    gw.add_add_bos_token(False)
    gw.add_chat_template(template)
    gw.add_key_value("ksai.check.tokens", ids, base.GGUFValueType.ARRAY,
                     base.GGUFValueType.INT32)
    gw.add_key_value("ksai.check.scores", [float(v) for v in scores.astype(np.float32).ravel()],
                     base.GGUFValueType.ARRAY, base.GGUFValueType.FLOAT32)
    for name, (data, qtype, _) in w.items():
        if qtype == base.Q.F32:
            gw.add_tensor(name, data)
        else:
            gw.add_tensor(name, data, raw_dtype=qtype)
    gw.write_header_to_file()
    gw.write_kv_data_to_file()
    gw.write_tensors_to_file()
    gw.close()
    return ids, scores


def compare_with_llama(path, ids, scores):
    """llama.cpp's scores for the same tokens, against the F64 reference; says the largest gap."""
    try:
        import llama_cpp
    except ImportError:
        print("SKIP: llama_cpp is not installed, so llama.cpp's scores are not compared")
        return
    llm = llama_cpp.Llama(path, n_ctx=64, n_threads=1, verbose=False, type_k=0, type_v=0)
    got = []
    for t in ids:
        llm.eval([t])
        got.append(np.ctypeslib.as_array(llm._ctx.get_logits(), shape=(llm.n_vocab(),)).copy())
    got = np.array(got, dtype=np.float64)
    gap = np.abs(got - scores).max()
    agree = (got.argmax(axis=1) == scores.argmax(axis=1)).mean()
    print(f"llama.cpp against the F64 reference: largest gap {gap:.2e} over scores up to "
          f"{np.abs(scores).max():.2f}; the top token agrees at {agree:.0%} of positions")


TOOLS = base.TOOLS
call = base.call

CASES = [
    # A whole round with tools, as ksagent sends it: arguments are JSON text.
    {"messages": [
        {"role": "system", "content": "You answer from the files."},
        {"role": "user", "content": "How much leave? 休暇"},
        {"role": "assistant", "content": None,
         "tool_calls": [call("call_1", "search", "{\"text\": \"leave\"}")]},
        {"role": "tool", "tool_call_id": "call_1", "content": "rules/leave.md:3: ten days"},
        {"role": "tool", "tool_call_id": "call_1", "content": "no more hits"},
        {"role": "assistant", "content": "Ten days."},
        {"role": "user", "content": "And sick days?"}], "tools": TOOLS},
    # Tools and no system message; text before two calls, arguments as an object and as text,
    # with a number, a list and an object among them.
    {"messages": [
        {"role": "user", "content": "  Read it.\n"},
        {"role": "assistant", "content": "I will look.",
         "tool_calls": [call("a", "search", {"text": "x", "path": ""}),
                        call("b", "read", "{\"path\":\"a.md\",\"from_line\":12,"
                                          "\"lines\":[1, 2],\"opt\":{\"deep\": \"休\"}}")]},
        {"role": "tool", "content": "a.md:1: x"},
        {"role": "tool", "content": "1: x\n"}], "tools": TOOLS},
    # No tools, no system message.
    {"messages": [{"role": "user", "content": "Hi"}]},
    # No tools; a system message with spaces round it, and a null content.
    {"messages": [
        {"role": "system", "content": "  Be brief.\n\n"},
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hello."},
        {"role": "user", "content": None}]},
    # Tools and a system message that is only white space: the template adds nothing for it.
    {"messages": [
        {"role": "system", "content": " \n "},
        {"role": "user", "content": "Go."}], "tools": TOOLS},
    # The last message is the assistant's after the last question: an empty thinking block.
    {"messages": [
        {"role": "user", "content": "Count to two."},
        {"role": "assistant", "content": "One,"}]},
    # A thinking block written in the content, and one given as `reasoning_content`.
    {"messages": [
        {"role": "user", "content": "First?"},
        {"role": "assistant", "content": "<think>\nhmm\n</think>\n\nYes."},
        {"role": "user", "content": "Second?"},
        {"role": "assistant", "content": "Maybe.", "reasoning_content": "\nlet me see\n"},
        {"role": "tool", "content": "done"}]},
    # A user message that is a tool response does not count as the last question.
    {"messages": [
        {"role": "user", "content": "Go."},
        {"role": "assistant", "content": "", "tool_calls": [call("c", "search", "{}")]},
        {"role": "user", "content": "<tool_response>\nnothing\n</tool_response>"},
        {"role": "assistant", "content": "Done.", "reasoning_content": "checked"}],
     "tools": TOOLS},
    # Thinking turned off by the request, as `llama-server` reads `chat_template_kwargs`.
    {"messages": [{"role": "user", "content": "Quick: 2+2?"}],
     "chat_template_kwargs": {"enable_thinking": False}},
]


def as_llama_server(messages):
    """The messages as `llama-server` hands them to the template: arguments parsed from JSON."""
    out = json.loads(json.dumps(messages))
    for m in out:
        for c in m.get("tool_calls") or []:
            f = c.get("function", c)
            if isinstance(f.get("arguments"), str):
                f["arguments"] = json.loads(f["arguments"])
    return out


def write_cases(path, template):
    """Each case with the prompt llama.cpp's Jinja formatter renders for it."""
    from llama_cpp.llama_chat_format import Jinja2ChatFormatter
    fmt = Jinja2ChatFormatter(template, eos_token="<|im_end|>", bos_token="")
    out = []
    for case in CASES:
        kwargs = case.get("chat_template_kwargs", {"enable_thinking": True})
        prompt = fmt(messages=as_llama_server(case["messages"]), tools=case.get("tools"),
                     **kwargs).prompt
        request = {"model": "local", "stream": False, "messages": case["messages"]}
        if "tools" in case:
            request["tools"] = case["tools"]
        if "chat_template_kwargs" in case:
            request["chat_template_kwargs"] = case["chat_template_kwargs"]
        out.append({"request": request, "prompt": prompt})
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")


def self_test():
    """What needs neither the download nor llama.cpp; the file only where `gguf` is installed."""
    tokens, _, _ = base.vocabulary()
    have_gguf = base.load_reference()
    w = weights(np.random.default_rng(SEED), len(tokens), quantized=have_gguf)
    ids = base.check_tokens(tokens)
    whole = Model(w).forward(ids)
    start = Model(w).forward(ids[:5])
    assert np.allclose(whole[:5], start, rtol=0, atol=1e-9), "a position sees no later token"
    m = Model(w)
    m.forward(ids[:5])
    rest = m.forward(ids[5:])
    assert np.allclose(whole[5:], rest, rtol=0, atol=1e-9), "two pieces give the scores of one"
    msgs = as_llama_server(CASES[1]["messages"])
    assert msgs[1]["tool_calls"][1]["function"]["arguments"]["from_line"] == 12, "parsed arguments"
    print("[self-test] make_qwen35_fixtures: a reference that sees no later token, and a state "
          "carried across two pieces")
    if not have_gguf:
        print("[self-test] To write and read back the model file, install gguf.")
        return
    with tempfile.TemporaryDirectory() as out:
        path = os.path.join(out, "tiny.gguf")
        write_model(path, "{{ messages }}", np.random.default_rng(SEED))
        r = base.GGUFReader(path)
        assert len(r.tensors) == 3 + 2 * (9 + 5) + 2 * (6 + 5), "the tensors"
        assert len(r.fields["ksai.check.scores"].data) == len(ids) * len(tokens), "the scores"
    print("[self-test] make_qwen35_fixtures: the model file written and read back")


def main():
    if len(sys.argv) == 1:
        self_test()
        return
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--template-from", required=True,
                    help="the Qwen3.5 GGUF file whose chat template is taken")
    ap.add_argument("--out-dir", required=True)
    a = ap.parse_args()
    if not base.load_reference():
        sys.exit("make_qwen35_fixtures: writing the files needs gguf: pip install gguf")
    field = base.GGUFReader(a.template_from).fields["tokenizer.chat_template"]
    template = bytes(field.parts[field.data[0]]).decode("utf-8")
    os.makedirs(a.out_dir, exist_ok=True)
    path = os.path.join(a.out_dir, "tiny_qwen35.gguf")
    ids, scores = write_model(path, template, np.random.default_rng(SEED))
    print(f"wrote {path}: {os.path.getsize(path)} bytes, {len(ids)} check tokens")
    compare_with_llama(path, ids, scores)
    cases = os.path.join(a.out_dir, "template35_cases.json")
    write_cases(cases, template)
    print(f"wrote {cases}: {len(CASES)} conversations")


if __name__ == "__main__":
    main()
