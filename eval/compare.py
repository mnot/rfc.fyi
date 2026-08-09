#!/usr/bin/env python
"""Phase 0: pick the embedding model.

The choice is irreversible -- whatever embeds the corpus must embed every
future query, and changing it means re-embedding everything and republishing
the index. So it gets measured rather than assumed.

Three numbers, because no one of them is sufficient:

  **recall@k** over the topical group, RFC-level. Ordinary retrieval
  competence, on the queries whose labels are trustworthy.

  **pair separation** over the directional and negated groups. Labels are
  RFC-level, but most real direction and polarity pairs live *inside* one RFC
  (401 vs 407 both in 9110; cache may-store vs must-not-store both in 9111),
  so recall cannot move for them however badly a model confuses the two. This
  compares the retrieved *chunks* for the two members of a pair instead:
  `1 - Jaccard(top-k, top-k)`. A model that cannot encode direction returns
  nearly the same chunks for both, and that overlap is the reject signal.
  Label-free, which is why it works where the labels cannot reach.

  **quantisation fidelity** -- mean cosine between a variant's vectors and
  its own fp32 vectors for identical text. Separates "this model is worse"
  from "this quantisation broke it".

Separation is necessary but not sufficient: a model could return different
and equally wrong chunks for both members of a pair and score well. Always
read it next to recall, and eyeball a few pairs by hand.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Sequence, Tuple

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "bin"))
from embed import Embedder  # noqa: E402  pylint: disable=wrong-import-position

DEFAULT_CANDIDATES = [
    ("bge-small", "fp32"),
    ("bge-small", "int8"),
    ("minilm-l6", "fp32"),
    ("minilm-l6", "int8"),
]


def load_chunks(path: str, limit: int) -> Tuple[List[str], np.ndarray]:
    """Chunk texts and their RFC numbers, in file order."""
    texts: List[str] = []
    rfcs: List[int] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            texts.append(rec["text"])
            rfcs.append(int(rec["rfc"]))
            if limit and len(texts) >= limit:
                break
    return texts, np.array(rfcs, dtype=np.int32)


def top_k(qvec: np.ndarray, cvecs: np.ndarray, k: int) -> np.ndarray:
    """Indices of the k highest-scoring chunks. Vectors are unit-norm, so a
    dot product is cosine similarity."""
    scores = cvecs @ qvec
    if k >= scores.size:
        return np.argsort(-scores)
    idx = np.argpartition(-scores, k)[:k]
    return idx[np.argsort(-scores[idx])]


def evaluate(
    queries: Sequence[dict],
    qvecs: np.ndarray,
    cvecs: np.ndarray,
    chunk_rfcs: np.ndarray,
    k: int,
) -> Dict[str, object]:
    by_id = {q["id"]: i for i, q in enumerate(queries)}
    hits: List[np.ndarray] = [top_k(qvecs[i], cvecs, k) for i in range(len(queries))]

    # --- recall@k on the topical group, RFC-level ---
    topical_hit = []
    for i, q in enumerate(queries):
        if q["group"] != "topical" or not q.get("relevant_rfcs"):
            continue
        want = set(q["relevant_rfcs"])
        got = set(chunk_rfcs[hits[i]].tolist())
        # Present in the sample at all? A label naming an RFC outside the
        # sampled corpus is unscoreable, not a miss.
        if not (want & set(chunk_rfcs.tolist())):
            continue
        topical_hit.append(1.0 if want & got else 0.0)

    # --- pair separation on the paired groups, chunk-level ---
    pairs: Dict[str, List[int]] = {}
    for i, q in enumerate(queries):
        if q.get("pair_id"):
            pairs.setdefault(q["pair_id"], []).append(i)
    seps: List[float] = []
    per_pair: List[Tuple[str, float]] = []
    for pid, members in sorted(pairs.items()):
        if len(members) != 2:
            continue
        a, b = set(hits[members[0]].tolist()), set(hits[members[1]].tolist())
        jaccard = len(a & b) / len(a | b) if (a | b) else 0.0
        sep = 1.0 - jaccard
        seps.append(sep)
        per_pair.append((pid, sep))

    return {
        "topical_recall": float(np.mean(topical_hit)) if topical_hit else float("nan"),
        "topical_scored": len(topical_hit),
        "separation_mean": float(np.mean(seps)) if seps else float("nan"),
        "separation_min": float(np.min(seps)) if seps else float("nan"),
        "pairs_scored": len(seps),
        "worst_pairs": sorted(per_pair, key=lambda r: r[1])[:5],
        "_unused": by_id,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chunks", default="var/chunks-sample.jsonl")
    ap.add_argument("--queries", default="eval/queries.json")
    ap.add_argument("--limit", type=int, default=4000, help="chunks to embed")
    ap.add_argument("-k", type=int, default=10)
    ap.add_argument("--json", help="write full results here")
    args = ap.parse_args()

    if not os.path.exists(args.chunks):
        raise SystemExit(
            f"no chunks at {args.chunks} -- run the chunker first "
            "(bin/chunk.py over var/rfc-text/)"
        )

    texts, chunk_rfcs = load_chunks(args.chunks, args.limit)
    queries = json.load(open(args.queries, encoding="utf-8"))["queries"]
    qtexts = [q["query"] for q in queries]
    print(
        f"{len(texts)} chunks from {len(set(chunk_rfcs.tolist()))} RFCs, "
        f"{len(queries)} queries, k={args.k}\n",
        file=sys.stderr,
    )

    fp32_cache: Dict[str, np.ndarray] = {}
    results: Dict[str, Dict[str, object]] = {}

    for model, variant in DEFAULT_CANDIDATES:
        tag = f"{model}/{variant}"
        emb = Embedder(model, variant)
        cvecs = emb.encode(texts)
        qvecs = emb.encode(qtexts, is_query=True)
        res = evaluate(queries, qvecs, cvecs, chunk_rfcs, args.k)
        res.pop("_unused", None)
        res["model_mib"] = round(emb.model_bytes() / 1048576, 1)
        res["truncated_chunks"] = emb.truncated

        if variant == "fp32":
            fp32_cache[model] = cvecs
            res["quant_fidelity"] = 1.0
        elif model in fp32_cache:
            res["quant_fidelity"] = float(
                np.mean(np.sum(cvecs * fp32_cache[model], axis=1))
            )
        results[tag] = res

        print(
            f"{tag:>20}  {res['model_mib']:>6} MiB  "
            f"recall@{args.k} {res['topical_recall']:.3f} "
            f"({res['topical_scored']} scored)  "
            f"separation {res['separation_mean']:.3f} "
            f"(min {res['separation_min']:.3f}, n={res['pairs_scored']})  "
            f"fidelity {res.get('quant_fidelity', float('nan')):.4f}  "
            f"truncated {res['truncated_chunks']}",
            file=sys.stderr,
        )

    print("\nlowest-separation pairs per candidate:", file=sys.stderr)
    for tag, res in results.items():
        worst = ", ".join(f"{p}={s:.2f}" for p, s in res["worst_pairs"])
        print(f"  {tag:>20}  {worst}", file=sys.stderr)

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(results, fh, indent=2)


if __name__ == "__main__":
    main()
