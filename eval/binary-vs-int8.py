#!/usr/bin/env python
"""Does storing binary codes in the cluster files cost too much recall?

This is the one decision that materially moves per-query cost: int8 cluster
files are ~423 B/chunk and a 20-cluster fetch runs ~1.5 MiB, while binary
codes are 48 B/vector and would put the same fetch near 170 KiB and the whole
index around 30 MiB. It is also the difference between ~20 MiB and ~3 MiB of
git churn a month.

The measurement is end to end rather than per-component, because that is what
a user experiences: ground truth is an exact float32 search over the whole
corpus, and each candidate encoding is scored on how much of that top-k it
recovers *after* IVF has already narrowed the field. Reporting quantisation
error alone would flatter binary, since IVF has thrown away most of the
corpus by the time the encoding matters.

Queries are the real evaluation set, encoded with the model's query prefix --
not corpus chunks standing in for queries, which sit far closer to their
neighbours than a short question does and would overstate every number here.
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from typing import List

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin"))
from embed import Embedder  # noqa: E402  pylint: disable=wrong-import-position


def load_vectors() -> np.ndarray:
    shards = sorted(glob.glob("var/embeddings/shard-*.npy"))
    return np.vstack([np.load(s) for s in shards])


def pack_bits(vecs: np.ndarray) -> np.ndarray:
    """Sign-bit binary codes, packed. 384 dims -> 48 bytes."""
    return np.packbits(vecs > 0, axis=1)


def hamming_scores(qbits: np.ndarray, cbits: np.ndarray) -> np.ndarray:
    """Higher is better: 384 - hamming distance."""
    xor = np.bitwise_xor(cbits, qbits[None, :])
    return 384 - np.unpackbits(xor, axis=1).sum(axis=1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--queries", default="eval/queries.json")
    ap.add_argument("--nprobe", type=int, default=20)
    ap.add_argument("-k", type=int, default=10)
    args = ap.parse_args()

    print("loading vectors...", file=sys.stderr)
    vecs = load_vectors()
    manifest = json.load(open("index/manifest.json", encoding="utf-8"))
    scale = manifest["quant"]["scale"]

    # Cluster assignment, recomputed the same way the build does it.
    # Both binary files carry a 24-byte header; the vector block follows it.
    raw = np.fromfile("index/centroids.bin", dtype=np.uint8)
    n_cent = int(np.frombuffer(raw[8:12].tobytes(), dtype="<u4")[0])
    cent = raw[24:].view(np.int8).reshape(n_cent, 384)
    centf = cent.astype(np.float32) * scale
    centf /= np.clip(np.linalg.norm(centf, axis=1, keepdims=True), 1e-12, None)
    print(f"{len(vecs):,} vectors, {len(centf):,} clusters", file=sys.stderr)

    assign = np.empty(len(vecs), dtype=np.int32)
    for i in range(0, len(vecs), 50_000):
        assign[i : i + 50_000] = np.argmax(vecs[i : i + 50_000] @ centf.T, axis=1)
    members = [np.where(assign == c)[0] for c in range(len(centf))]

    # The two candidate encodings, built from the same float32 source.
    q8 = np.clip(np.round(vecs / scale), -127, 127).astype(np.int8)
    qb = pack_bits(vecs)

    queries = json.load(open(args.queries, encoding="utf-8"))["queries"]
    emb = Embedder("bge-small", "int8")
    qv = emb.encode([q["query"] for q in queries], is_query=True)
    qbits = pack_bits(qv)

    hits = {"int8": [], "binary": [], "ivf_ceiling": []}
    for i in range(len(queries)):
        truth = set(np.argsort(-(vecs @ qv[i]))[: args.k].tolist())

        probes = np.argsort(-(centf @ qv[i]))[: args.nprobe]
        cand = np.concatenate([members[c] for c in probes if members[c].size])
        if cand.size == 0:
            continue

        # Ceiling: exact float32, but only over what IVF actually fetched.
        exact = cand[np.argsort(-(vecs[cand] @ qv[i]))[: args.k]]
        hits["ivf_ceiling"].append(len(truth & set(exact.tolist())) / args.k)

        s8 = (q8[cand].astype(np.float32) * scale) @ qv[i]
        top8 = cand[np.argsort(-s8)[: args.k]]
        hits["int8"].append(len(truth & set(top8.tolist())) / args.k)

        sb = hamming_scores(qbits[i], qb[cand])
        topb = cand[np.argsort(-sb)[: args.k]]
        hits["binary"].append(len(truth & set(topb.tolist())) / args.k)

    n_chunks = len(vecs)
    print(f"\n{len(hits['int8'])} real queries, nprobe={args.nprobe}, k={args.k}")
    print(f"{'encoding':<14}{'recall@k':>10}{'bytes/chunk':>14}{'index':>11}{'per query':>12}")
    for name, per_chunk in (("ivf_ceiling", None), ("int8", 423), ("binary", 48)):
        r = float(np.mean(hits[name]))
        if per_chunk is None:
            print(f"{name:<14}{r:>10.3f}{'--':>14}{'--':>11}{'--':>12}")
            continue
        idx = n_chunks * per_chunk / 1048576
        # Per-query bytes scale with the same ratio as the vector block.
        pq = 1.52 * (per_chunk / 423)
        print(f"{name:<14}{r:>10.3f}{per_chunk:>14}{idx:>10.0f}M{pq:>11.2f}M")


if __name__ == "__main__":
    main()
