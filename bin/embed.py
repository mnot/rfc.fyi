#!/usr/bin/env python
"""Embed text with an ONNX sentence encoder.

Shared by the index build and the Phase 0 model evaluation, so the corpus and
the queries are always encoded by the same code path.

ONNX Runtime rather than torch, and specifically the `Xenova/*` ONNX exports,
because those are the artifacts transformers.js downloads in the browser. A
corpus vector and a query vector then come from the same graph at the same
quantisation, instead of from two implementations that merely claim the same
model.

Two per-model details that are silent quality bugs if you get them wrong, so
they live in MODELS rather than being assumed:

  * **Pooling.** bge-small pools the CLS token; all-MiniLM-L6 mean-pools over
    the attention mask. Verified against each model's `1_Pooling/config.json`.
  * **Query prefix.** bge retrieval models are trained with an instruction
    prefix on the *query* side only. Omitting it costs real recall; applying
    it to passages costs more.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer


@dataclass(frozen=True)
class ModelSpec:
    repo: str
    pooling: str  # "cls" | "mean"
    query_prefix: str
    max_length: int = 512


#: `max_length` is each model's *declared* sequence limit, not the 512 its
#: position embeddings happen to allow. all-MiniLM-L6-v2 declares 256
#: (`sentence_bert_config.json`) and its Xenova export bakes tokeniser
#: truncation at 128; bge-small declares a genuine 512. Feeding MiniLM 512
#: runs past its trained length and quietly degrades — so this is per model,
#: and it is a real functional difference between the candidates, not a
#: footnote: at ~1200-character chunks MiniLM sees roughly half of what
#: bge-small does.
MODELS: Dict[str, ModelSpec] = {
    "bge-small": ModelSpec(
        repo="Xenova/bge-small-en-v1.5",
        pooling="cls",
        query_prefix="Represent this sentence for searching relevant passages: ",
        max_length=512,
    ),
    "minilm-l6": ModelSpec(
        repo="Xenova/all-MiniLM-L6-v2",
        pooling="mean",
        query_prefix="",
        max_length=256,
    ),
}

#: ONNX file per quantisation variant. `fp32` is the reference the others are
#: scored against; it is not a shipping candidate.
VARIANTS: Dict[str, str] = {
    "fp32": "onnx/model.onnx",
    "int8": "onnx/model_int8.onnx",
    "quantized": "onnx/model_quantized.onnx",
    "q4": "onnx/model_q4.onnx",
    "fp16": "onnx/model_fp16.onnx",
}


class Embedder:
    """One (model, variant) pair, loaded once and reused."""

    def __init__(self, model: str, variant: str = "fp32") -> None:
        if model not in MODELS:
            raise SystemExit(f"unknown model {model!r}; have {sorted(MODELS)}")
        if variant not in VARIANTS:
            raise SystemExit(f"unknown variant {variant!r}; have {sorted(VARIANTS)}")
        self.spec = MODELS[model]
        self.model = model
        self.variant = variant

        self.onnx_path = hf_hub_download(self.spec.repo, VARIANTS[variant])
        self.tokenizer = Tokenizer.from_file(
            hf_hub_download(self.spec.repo, "tokenizer.json")
        )
        self.tokenizer.enable_truncation(max_length=self.spec.max_length)
        self.tokenizer.enable_padding()

        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        # CPU only: deterministic across machines, which matters because an
        # incremental build appends vectors to an index built elsewhere.
        self.session = ort.InferenceSession(
            self.onnx_path, opts, providers=["CPUExecutionProvider"]
        )
        self.input_names = {i.name for i in self.session.get_inputs()}
        # Counts inputs that hit the token cap, so a caller can tell whether
        # its chunking is silently losing the tail of every chunk.
        self.truncated = 0
        self.encoded = 0

    def encode(
        self,
        texts: Sequence[str],
        is_query: bool = False,
        batch_size: int = 32,
    ) -> np.ndarray:
        """Return L2-normalised float32 vectors, one row per input."""
        if is_query and self.spec.query_prefix:
            texts = [self.spec.query_prefix + t for t in texts]
        out: List[np.ndarray] = []
        for start in range(0, len(texts), batch_size):
            out.append(self._encode_batch(list(texts[start : start + batch_size])))
        if not out:
            return np.zeros((0, 384), dtype=np.float32)
        return np.vstack(out)

    def _encode_batch(self, batch: List[str]) -> np.ndarray:
        encodings = self.tokenizer.encode_batch(batch)
        ids = np.array([e.ids for e in encodings], dtype=np.int64)
        mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

        self.encoded += len(batch)
        self.truncated += sum(
            1 for e in encodings if len(e.ids) >= self.spec.max_length
        )

        feeds = {"input_ids": ids, "attention_mask": mask}
        if "token_type_ids" in self.input_names:
            feeds["token_type_ids"] = np.zeros_like(ids)
        feeds = {k: v for k, v in feeds.items() if k in self.input_names}

        hidden = self.session.run(None, feeds)[0]  # (batch, seq, dim)
        if self.spec.pooling == "cls":
            pooled = hidden[:, 0]
        else:
            m = mask[..., None].astype(np.float32)
            pooled = (hidden * m).sum(axis=1) / np.clip(m.sum(axis=1), 1e-9, None)
        norms = np.linalg.norm(pooled, axis=1, keepdims=True)
        return (pooled / np.clip(norms, 1e-12, None)).astype(np.float32)

    def model_bytes(self) -> int:
        import os

        return os.path.getsize(self.onnx_path)


def token_stats(model: str, texts: Iterable[str]) -> Dict[str, float]:
    """Token-length distribution for a corpus, against a model's tokeniser.

    Chunk size is specified in characters but the cap that bites is tokens,
    and technical prose with identifiers and punctuation tokenises worse than
    plain English. This is how you find out whether the chunker is quietly
    truncating.
    """
    spec = MODELS[model]
    tok = Tokenizer.from_file(hf_hub_download(spec.repo, "tokenizer.json"))
    # Measure TRUE lengths. Some exports bake truncation into tokenizer.json
    # (MiniLM's is 128), which would otherwise make every long chunk report
    # as exactly the limit and hide the overflow we are trying to find.
    tok.no_truncation()
    lengths = np.array([len(tok.encode(t).ids) for t in texts])
    if lengths.size == 0:
        return {}
    return {
        "count": int(lengths.size),
        "mean": float(lengths.mean()),
        "median": float(np.median(lengths)),
        "p95": float(np.percentile(lengths, 95)),
        "p99": float(np.percentile(lengths, 99)),
        "max": int(lengths.max()),
        "over_limit": int((lengths >= spec.max_length).sum()),
        "over_limit_pct": float((lengths >= spec.max_length).mean() * 100),
    }


def _read_texts(path: str, field: Optional[str]) -> List[str]:
    texts: List[str] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            texts.append(json.loads(line)[field] if field else line)
    return texts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--model", default="bge-small", choices=sorted(MODELS))
    ap.add_argument("--variant", default="fp32", choices=sorted(VARIANTS))
    ap.add_argument("--in", dest="infile", required=True, help="JSONL or text")
    ap.add_argument("--field", default="text", help="JSONL field ('' for raw)")
    ap.add_argument("--out", help="write float32 .npy here")
    ap.add_argument("--tokens", action="store_true", help="report token stats only")
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    texts = _read_texts(args.infile, args.field or None)
    if args.limit:
        texts = texts[: args.limit]

    if args.tokens:
        print(json.dumps(token_stats(args.model, texts), indent=2))
        return

    emb = Embedder(args.model, args.variant)
    vecs = emb.encode(texts)
    print(
        f"{args.model}/{args.variant}: {len(texts)} texts -> {vecs.shape}, "
        f"model {emb.model_bytes() / 1048576:.1f} MiB, "
        f"{emb.truncated} truncated at {emb.spec.max_length} tokens",
        file=sys.stderr,
    )
    if args.out:
        np.save(args.out, vecs)


if __name__ == "__main__":
    main()
