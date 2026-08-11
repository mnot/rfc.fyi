#!/usr/bin/env python
"""Compare per-RFC ranking schemes against the labelled query set.

Reproduces the numbers behind the row scoring in `client.js`. The retrieval
half is held fixed -- IVF over the published int8 clusters at the manifest's
nprobe, which is what the browser does -- and only the way chunk scores become
an RFC ordering varies.

    ./eval/rerank.py                      # against index/
    ./eval/rerank.py --index index --folds 2

Reports recall@10, MRR and the median rank of the first relevant RFC, plus
the position of one watched RFC for one watched query, which is how the
default scheme was chosen. With --folds it also scores each fold separately:
a scheme that only wins overall is fitting the coefficients to the query set.

Note this applies no obsolete filter, while the UI hides obsoleted RFCs by
default, so positions here sit lower than the ones a user sees.
"""

import argparse
import collections
import json
import math
import os
import sys

import numpy as np

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bin")
)
# pylint: disable=wrong-import-position
from embed import Embedder  # noqa: E402
from indexfmt import (  # noqa: E402
    cluster_paths,
    dequantise,
    read_centroids,
    read_cluster,
)


def load_index(index_dir):
    """Published vectors, their RFC ids, the centroids, and cluster membership."""
    with open(os.path.join(index_dir, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    scale = manifest["quant"]["scale"]
    blocks, rfcs, spans = [], [], []
    for path in cluster_paths(index_dir):
        vecs, meta, _ = read_cluster(path)
        blocks.append(vecs)
        spans.append((len(rfcs), meta["n"]))
        rfcs.extend(meta["rfc"])
    vectors = dequantise(np.vstack(blocks), scale)
    centroids = dequantise(
        read_centroids(os.path.join(index_dir, "centroids.bin")), scale
    )
    members = [np.arange(start, start + n) for start, n in spans]
    ids = np.array([r if isinstance(r, int) else -1 for r in rfcs])
    return manifest, vectors, ids, centroids, members


def incoming_citations(path):
    """How many RFCs cite each RFC. What the site's reference counts show."""
    with open(path, encoding="utf-8") as fh:
        refs = json.load(fh)
    counts = collections.Counter()
    for kinds in refs.values():
        for targets in kinds.values():
            for target in targets:
                num = str(target).upper().removeprefix("RFC")
                if num.isdigit():
                    counts[int(num)] += 1
    return counts


def load_titles(path):
    with open(path, encoding="utf-8") as fh:
        rfcs = json.load(fh)
    return {
        int(name.removeprefix("RFC")): entry["title"]
        for name, entry in rfcs.items()
        if name.removeprefix("RFC").isdigit()
    }


def schemes(titles, citations):
    """Ranking functions, each (chunk scores, query, rfc) -> score."""

    def title_overlap(query, rfc):
        haystack = titles.get(rfc, "").lower()
        words = [w for w in query.lower().split() if len(w) > 2]
        if not words:
            return 0.0
        return sum(1 for w in words if w in haystack) / len(words)

    def cited(rfc):
        return math.log1p(citations.get(rfc, 0))

    def top(scores, n=3):
        return sorted(scores, reverse=True)[:n]

    return {
        "best chunk": lambda s, q, r: max(s),
        "mean top-3": lambda s, q, r: sum(top(s)) / min(len(s), 3),
        "three sections": lambda s, q, r: sum(top(s)) / 3,
        "+ 0.02 citations": lambda s, q, r: sum(top(s)) / 3 + 0.02 * cited(r),
        "+ 0.05 citations": lambda s, q, r: sum(top(s)) / 3 + 0.05 * cited(r),
        "+ 0.05 title": lambda s, q, r: sum(top(s)) / 3 + 0.05 * title_overlap(q, r),
        "+ 0.10 title": lambda s, q, r: sum(top(s)) / 3 + 0.10 * title_overlap(q, r),
        "+ 0.15 title": lambda s, q, r: sum(top(s)) / 3 + 0.15 * title_overlap(q, r),
        "+ 0.20 title": lambda s, q, r: sum(top(s)) / 3 + 0.20 * title_overlap(q, r),
        "0.10 title + cites": lambda s, q, r: (
            sum(top(s)) / 3 + 0.10 * title_overlap(q, r) + 0.02 * cited(r)
        ),
        # What client.js implements.
        "shipped": lambda s, q, r: (
            sum(top(s)) / 3 + 0.20 * title_overlap(q, r) + 0.02 * cited(r)
        ),
    }


def candidates(query_vec, vectors, ids, centroids, members, nprobe):
    """Chunk scores per RFC, from the clusters a query would actually fetch."""
    probes = np.argsort(-(centroids @ query_vec))[:nprobe]
    picked = np.concatenate([members[c] for c in probes if members[c].size])
    scores = vectors[picked] @ query_vec
    per_rfc = collections.defaultdict(list)
    for index, score in zip(picked, scores):
        per_rfc[int(ids[index])].append(float(score))
    return per_rfc


def score_scheme(fn, cases, indices):
    recall, mrr, ranks = [], [], []
    for i in indices:
        query, per_rfc = cases[i]
        order = sorted(per_rfc, key=lambda r: -fn(per_rfc[r], query["query"], r))
        at = {rfc: pos for pos, rfc in enumerate(order)}
        want = set(query["relevant_rfcs"])
        hits = [at[rfc] for rfc in want if rfc in at]
        recall.append(sum(1 for h in hits if h < 10) / max(len(want), 1))
        mrr.append(1 / (min(hits) + 1) if hits else 0.0)
        ranks.append(min(hits) + 1 if hits else 10**6)
    return float(np.mean(recall)), float(np.mean(mrr)), int(np.median(ranks))


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--index", default="index")
    ap.add_argument("--queries", default=os.path.join(here, "queries.json"))
    ap.add_argument("--refs", default="var/refs.json")
    ap.add_argument("--rfcs", default="var/rfcs.json")
    ap.add_argument("--nprobe", type=int, default=0, help="default: the manifest's")
    ap.add_argument("--folds", type=int, default=2, help="0 to skip the split")
    ap.add_argument("--watch-query", default="HTTP caching")
    ap.add_argument("--watch-rfc", type=int, default=9111)
    args = ap.parse_args()

    manifest, vectors, ids, centroids, members = load_index(args.index)
    nprobe = args.nprobe or manifest["clusters"]["nprobe"]
    print(
        f"{len(vectors):,} vectors, {len(members):,} clusters, nprobe={nprobe}",
        file=sys.stderr,
    )

    with open(args.queries, encoding="utf-8") as fh:
        queries = json.load(fh)["queries"]
    ranking = schemes(load_titles(args.rfcs), incoming_citations(args.refs))

    embedder = Embedder(
        manifest["model"]["id"].split("/")[-1].replace("-en-v1.5", ""),
        manifest["model"]["variant"],
    )
    vecs = embedder.encode(
        [q["query"] for q in queries] + [args.watch_query], is_query=True
    )
    cases = [
        (q, candidates(vecs[i], vectors, ids, centroids, members, nprobe))
        for i, q in enumerate(queries)
    ]
    watched = candidates(vecs[-1], vectors, ids, centroids, members, nprobe)

    folds = (
        [
            [i for i in range(len(cases)) if i % args.folds == f]
            for f in range(args.folds)
        ]
        if args.folds > 1
        else []
    )

    head = f"{'scheme':<18} {'recall@10':>9} {'MRR':>6} {'median':>7}"
    head += "".join(f"{'fold ' + chr(65 + f):>8}" for f in range(len(folds)))
    print(f"\n{head}   RFC {args.watch_rfc} for {args.watch_query!r}")
    print("-" * (len(head) + 34))
    for name, fn in ranking.items():
        recall, mrr, median = score_scheme(fn, cases, range(len(cases)))
        row = f"{name:<18} {recall:>9.3f} {mrr:>6.3f} {median:>7}"
        for fold in folds:
            row += f"{score_scheme(fn, cases, fold)[0]:>8.3f}"
        order = sorted(watched, key=lambda r: -fn(watched[r], args.watch_query, r))
        seen = order.index(args.watch_rfc) + 1 if args.watch_rfc in order else None
        print(f"{row}   #{seen}")


if __name__ == "__main__":
    main()
