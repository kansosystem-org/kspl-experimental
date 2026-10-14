#!/usr/bin/env python3
"""Stage 3  Turns a real Qwen2.5 (Llama-family) model into safetensors KSPL's native side can read.

It puts it into the format `Qwen_model.load` in `ksai/examples/qwen_infer/main.kspls` expects:
- naming: embed.weight / norm.weight / lm_head.weight /
        layers.{i}.attn_norm.weight / .ffn_norm.weight /
        layers.{i}.attn.{wq,wk,wv,wo}.weight (+ wq/wk/wv.bias) /
        layers.{i}.mlp.{gate,up,down}.weight / cfg([9] F32)
- weights: PyTorch's nn.Linear is [out,in] (y=x·Wᵀ). KSPL's Linear is [in,out] (y=x·W), so every
        Linear weight is transposed. The embedding is a lookup, so it stays [vocab,hidden].
        With tie_word_embeddings, lm_head is the embedding transposed, [hidden,vocab].

Running it (on a machine with a GPU/CPU and transformers installed):
  python3 tools/ai_assist/export_qwen_to_kspl.py \
      --base-model Qwen/Qwen2.5-Coder-0.5B --out out/qwen_kspl.safetensors

The self-test (no GPU or torch needed): python3 tools/ai_assist/export_qwen_to_kspl.py
  It confirms on synthesized HF-layout weights that the logits of "the HF-style forward" and "the
  converted weights through the KSPL-style forward" agree, checking the transpose, tie and naming.
"""
import argparse
import sys
import numpy as np

from tools.ai_assist.safetensors_io import write_safetensors


def build_kspl_tensors(hf, cfg):
    """hf: {name: np.ndarray(float32)} (HF layout), cfg: dict -> {kspl_name: np.ndarray}."""
    nl = cfg["num_hidden_layers"]
    out = {}
    out["cfg"] = np.array([nl, cfg["hidden_size"], cfg["num_attention_heads"],
                           cfg["num_key_value_heads"], cfg["head_dim"],
                           cfg["intermediate_size"], cfg["vocab_size"],
                           cfg["rope_theta"], cfg["rms_norm_eps"]], dtype=np.float32)
    emb = hf["model.embed_tokens.weight"]  # [vocab, hidden] as it stands, for the lookup
    out["embed.weight"] = emb
    out["norm.weight"] = hf["model.norm.weight"]
    # With tie_word_embeddings, lm_head is the embedding; KSPL wants [hidden, vocab], transposed.
    lm = hf.get("lm_head.weight", emb)  # [vocab, hidden]
    out["lm_head.weight"] = np.ascontiguousarray(lm.T)  # [hidden, vocab]
    for i in range(nl):
        p = f"model.layers.{i}"
        q = f"layers.{i}"
        out[f"{q}.attn_norm.weight"] = hf[f"{p}.input_layernorm.weight"]
        out[f"{q}.ffn_norm.weight"] = hf[f"{p}.post_attention_layernorm.weight"]
        # A Linear weight is transposed. A bias is 1D, so it stays as it is.
        out[f"{q}.attn.wq.weight"] = np.ascontiguousarray(hf[f"{p}.self_attn.q_proj.weight"].T)
        out[f"{q}.attn.wk.weight"] = np.ascontiguousarray(hf[f"{p}.self_attn.k_proj.weight"].T)
        out[f"{q}.attn.wv.weight"] = np.ascontiguousarray(hf[f"{p}.self_attn.v_proj.weight"].T)
        out[f"{q}.attn.wo.weight"] = np.ascontiguousarray(hf[f"{p}.self_attn.o_proj.weight"].T)
        out[f"{q}.attn.wq.bias"] = hf[f"{p}.self_attn.q_proj.bias"]
        out[f"{q}.attn.wk.bias"] = hf[f"{p}.self_attn.k_proj.bias"]
        out[f"{q}.attn.wv.bias"] = hf[f"{p}.self_attn.v_proj.bias"]
        out[f"{q}.mlp.gate.weight"] = np.ascontiguousarray(hf[f"{p}.mlp.gate_proj.weight"].T)
        out[f"{q}.mlp.up.weight"] = np.ascontiguousarray(hf[f"{p}.mlp.up_proj.weight"].T)
        out[f"{q}.mlp.down.weight"] = np.ascontiguousarray(hf[f"{p}.mlp.down_proj.weight"].T)
    return {k: v.astype(np.float32) for k, v in out.items()}


def read_rope_theta(c, default=1000000.0):
    """Where config.rope_theta lives can change with transformers' version
    (a flat attribute / the rope_parameters dict / the rope_scaling dict, and so on). It tries
    several candidates and, where none is there, falls back to the default (the Qwen2.5 family's
    published value) with a warning.
    """
    if hasattr(c, "rope_theta") and c.rope_theta is not None:
        return float(c.rope_theta)
    for attr in ("rope_parameters", "rope_scaling"):
        d = getattr(c, attr, None)
        if isinstance(d, dict) and "rope_theta" in d:
            return float(d["rope_theta"])
    print(f"[warn] no rope_theta was found in config, so the default {default} is used. "
          f"what config actually holds: {c}", file=sys.stderr)
    return default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", required=True)
    ap.add_argument("--out", default="out/qwen_kspl.safetensors")
    args = ap.parse_args()
    try:
        import torch
        from transformers import AutoModelForCausalLM
    except ImportError as e:
        print(f"[error] transformers/torch are needed: {e}", file=sys.stderr)
        sys.exit(1)
    model = AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype=torch.float32)
    c = model.config
    cfg = {"num_hidden_layers": c.num_hidden_layers, "hidden_size": c.hidden_size,
           "num_attention_heads": c.num_attention_heads,
           "num_key_value_heads": c.num_key_value_heads,
           "head_dim": getattr(c, "head_dim", c.hidden_size // c.num_attention_heads),
           "intermediate_size": c.intermediate_size, "vocab_size": c.vocab_size,
           "rope_theta": read_rope_theta(c), "rms_norm_eps": float(c.rms_norm_eps)}
    hf = {k: v.detach().to(torch.float32).cpu().numpy() for k, v in model.state_dict().items()}
    # With tie_word_embeddings the state_dict can hold no lm_head.weight (the build side takes it).
    kspl = build_kspl_tensors(hf, cfg)
    write_safetensors(((name, arr.shape, np.ascontiguousarray(arr).tobytes())
                        for name, arr in kspl.items()), args.out)
    print(f"exported {len(kspl)} tensors -> {args.out}  (layers={cfg['num_hidden_layers']}, "
          f"hidden={cfg['hidden_size']}, heads={cfg['num_attention_heads']}/"
          f"{cfg['num_key_value_heads']}, head_dim={cfg['head_dim']})")


# ---- The self-test (no torch): the transpose, tie and naming checked with numpy alone ----
def _silu(z):
    return z / (1.0 + np.exp(-z))


def _rmsnorm(x, w, eps):
    return (x / np.sqrt(np.mean(x * x) + eps)) * w


def _rope(vec, pos, hd, theta):
    # The NeoX-style (split-half) rotation on (j, j+half) pairs, as HF Llama/Qwen's rotate_half,
    # not the original RoPE paper's alternating (2j, 2j+1) pairs.
    out = vec.copy()
    half = hd // 2
    for base in range(0, len(vec), hd):
        for j in range(half):
            ang = pos * (theta ** (-(2.0 * j) / hd))
            c, s = np.cos(ang), np.sin(ang)
            x1, x2 = vec[base + j], vec[base + j + half]
            out[base + j] = x1 * c - x2 * s
            out[base + j + half] = x2 * c + x1 * s
    return out


def _forward(get_lin, get_vec, emb, lm_T, tokens, cfg, hf_layout):
    """get_lin(name)->a Linear weight. With hf_layout=True it is y=x·Wᵀ, with False y=x·W."""
    nl, NH = cfg["num_hidden_layers"], cfg["num_attention_heads"]
    NKV, HD = cfg["num_key_value_heads"], cfg["head_dim"]
    theta, eps = cfg["rope_theta"], cfg["rms_norm_eps"]
    QD, groups = NH * HD, NH // NKV
    scale = 1.0 / np.sqrt(HD)

    def lin(name, x):
        w = get_lin(name)
        return x @ (w.T if hf_layout else w)

    kc = [[] for _ in range(nl)]
    vc = [[] for _ in range(nl)]
    logits = None
    for pos, tok in enumerate(tokens):
        h = emb[tok].copy()
        for i in range(nl):
            hn = _rmsnorm(h, get_vec(f"L{i}.an"), eps)
            q = _rope(lin(f"L{i}.q", hn) + get_vec(f"L{i}.bq"), pos, HD, theta)
            k = _rope(lin(f"L{i}.k", hn) + get_vec(f"L{i}.bk"), pos, HD, theta)
            v = lin(f"L{i}.v", hn) + get_vec(f"L{i}.bv")
            kc[i].append(k)
            vc[i].append(v)
            attn = np.zeros(QD)
            for hh in range(NH):
                qo, ko = hh * HD, (hh // groups) * HD
                sc = np.array([q[qo:qo + HD] @ kc[i][t][ko:ko + HD] * scale
                               for t in range(pos + 1)])
                sc -= sc.max()
                w = np.exp(sc)
                w /= w.sum()
                acc = sum(w[t] * vc[i][t][ko:ko + HD] for t in range(pos + 1))
                attn[qo:qo + HD] = acc
            h = h + lin(f"L{i}.o", attn)
            hn2 = _rmsnorm(h, get_vec(f"L{i}.fn"), eps)
            m = lin(f"L{i}.down", _silu(lin(f"L{i}.gate", hn2)) * lin(f"L{i}.up", hn2))
            h = h + m
        hn = _rmsnorm(h, get_vec("norm"), eps)
        logits = hn @ (emb.T if lm_T is None else lm_T)
    return logits


def _selftest():
    np.random.seed(3)
    cfg = {"num_hidden_layers": 2, "hidden_size": 8, "num_attention_heads": 4,
           "num_key_value_heads": 2, "head_dim": 2, "intermediate_size": 16,
           "vocab_size": 10, "rope_theta": 1000000.0, "rms_norm_eps": 1e-6}
    H, NH, NKV, HD, IM, V = 8, 4, 2, 2, 16, 10
    QD, KVD = NH * HD, NKV * HD

    def R(*s):
        return np.random.uniform(-1, 1, s).astype(np.float32)

    # Synthesize an HF-layout state_dict (a Linear is [out,in])
    hf = {"model.embed_tokens.weight": R(V, H), "model.norm.weight": R(H) * 0.1 + 1.0}
    for i in range(2):
        p = f"model.layers.{i}"
        hf[f"{p}.input_layernorm.weight"] = R(H) * 0.1 + 1.0
        hf[f"{p}.post_attention_layernorm.weight"] = R(H) * 0.1 + 1.0
        hf[f"{p}.self_attn.q_proj.weight"] = R(QD, H)
        hf[f"{p}.self_attn.k_proj.weight"] = R(KVD, H)
        hf[f"{p}.self_attn.v_proj.weight"] = R(KVD, H)
        hf[f"{p}.self_attn.o_proj.weight"] = R(H, QD)
        hf[f"{p}.self_attn.q_proj.bias"] = R(QD)
        hf[f"{p}.self_attn.k_proj.bias"] = R(KVD)
        hf[f"{p}.self_attn.v_proj.bias"] = R(KVD)
        hf[f"{p}.mlp.gate_proj.weight"] = R(IM, H)
        hf[f"{p}.mlp.up_proj.weight"] = R(IM, H)
        hf[f"{p}.mlp.down_proj.weight"] = R(H, IM)
    tokens = [3, 1, 4]

    # The HF-style forward (the original layout, y=x·Wᵀ)
    hf_lin = {"L0.q": "0.self_attn.q_proj", "L0.k": "0.self_attn.k_proj",
              "L0.v": "0.self_attn.v_proj", "L0.o": "0.self_attn.o_proj",
              "L0.gate": "0.mlp.gate_proj", "L0.up": "0.mlp.up_proj", "L0.down": "0.mlp.down_proj",
              "L1.q": "1.self_attn.q_proj", "L1.k": "1.self_attn.k_proj",
              "L1.v": "1.self_attn.v_proj", "L1.o": "1.self_attn.o_proj",
              "L1.gate": "1.mlp.gate_proj", "L1.up": "1.mlp.up_proj", "L1.down": "1.mlp.down_proj"}
    hf_vec = {"L0.an": "0.input_layernorm", "L0.fn": "0.post_attention_layernorm",
              "L1.an": "1.input_layernorm", "L1.fn": "1.post_attention_layernorm"}

    def hf_getlin(n):
        return hf[f"model.layers.{hf_lin[n]}.weight"]

    def hf_getvec(n):
        if n == "norm":
            return hf["model.norm.weight"]
        if n.endswith(".bq"):
            return hf[f"model.layers.{n[1]}.self_attn.q_proj.bias"]
        if n.endswith(".bk"):
            return hf[f"model.layers.{n[1]}.self_attn.k_proj.bias"]
        if n.endswith(".bv"):
            return hf[f"model.layers.{n[1]}.self_attn.v_proj.bias"]
        return hf[f"model.layers.{hf_vec[n]}.weight"]

    logits_hf = _forward(hf_getlin, hf_getvec, hf["model.embed_tokens.weight"], None,
                         tokens, cfg, hf_layout=True)

    # Convert, then forward in the KSPL layout (y=x·W). It is tied, so lm is emb.T
    kspl = build_kspl_tensors(hf, cfg)
    kmap = {"L0.q": "layers.0.attn.wq", "L0.k": "layers.0.attn.wk", "L0.v": "layers.0.attn.wv",
            "L0.o": "layers.0.attn.wo", "L0.gate": "layers.0.mlp.gate", "L0.up": "layers.0.mlp.up",
            "L0.down": "layers.0.mlp.down", "L1.q": "layers.1.attn.wq", "L1.k": "layers.1.attn.wk",
            "L1.v": "layers.1.attn.wv", "L1.o": "layers.1.attn.wo", "L1.gate": "layers.1.mlp.gate",
            "L1.up": "layers.1.mlp.up", "L1.down": "layers.1.mlp.down"}

    def k_getlin(n):
        return kspl[f"{kmap[n]}.weight"]

    def k_getvec(n):
        if n == "norm":
            return kspl["norm.weight"]
        if n.endswith(".bq"):
            return kspl[f"layers.{n[1]}.attn.wq.bias"]
        if n.endswith(".bk"):
            return kspl[f"layers.{n[1]}.attn.wk.bias"]
        if n.endswith(".bv"):
            return kspl[f"layers.{n[1]}.attn.wv.bias"]
        return kspl[f"layers.{n[1]}.{'attn_norm' if n.endswith('an') else 'ffn_norm'}.weight"]

    logits_kspl = _forward(k_getlin, k_getvec, kspl["embed.weight"], kspl["lm_head.weight"],
                          tokens, cfg, hf_layout=False)

    max_diff = np.max(np.abs(logits_hf - logits_kspl))
    assert max_diff < 1e-5, f"the HF and KSPL layouts' logits disagree: {max_diff}"
    print(f"[self-test] OK: through the transpose/tie/naming conversion the HF forward's and the "
          f"KSPL forward's logits agree "
          f"(max diff {max_diff:.2e})")
    print("[self-test] checked this far with no torch. To convert a real model, run it with "
          "--base-model.")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        main()
    else:
        _selftest()
