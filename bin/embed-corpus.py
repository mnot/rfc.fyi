#!/usr/bin/env python
"""Embed every chunk in a JSONL file. Resumable, shard by shard.

The full corpus is ~457k chunks and around five hours on this machine, so
this is a once-ever local job (see `make index-full`). Two properties matter
more than raw speed at that duration:

**Resumable.** Vectors are written as fixed-size shards under
`var/embeddings/`. A shard already on disk is skipped, so an interrupted run
resumes at the shard boundary rather than from the beginning.

**Order-stable.** Chunks are length-sorted *within* a shard before encoding,
because padding is batch-longest and mixing a 1,000-token chunk with thirty
short ones pads them all to 1,000 -- worth about 25%. Vectors are written
back in the shard's original order, so row N of the output always corresponds
to line N of the input, whatever the batching did.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from typing import List

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from embed import Embedder  # noqa: E402  pylint: disable=wrong-import-position

SHARD = 20_000


def read_texts(path: str) -> List[str]:
    texts: List[str] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                texts.append(json.loads(line)["text"])
    return texts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--chunks", default="var/chunks.jsonl")
    ap.add_argument("--out", default="var/embeddings")
    ap.add_argument("--model", default="bge-small")
    ap.add_argument("--variant", default="int8")
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--shard", type=int, default=SHARD)
    args = ap.parse_args()

    texts = read_texts(args.chunks)
    os.makedirs(args.out, exist_ok=True)
    n_shards = (len(texts) + args.shard - 1) // args.shard
    print(
        f"{len(texts):,} chunks, {n_shards} shards of {args.shard:,} "
        f"({args.model}/{args.variant})",
        file=sys.stderr,
    )

    emb = Embedder(args.model, args.variant)
    started = time.time()
    done_chunks = 0

    for s in range(n_shards):
        path = os.path.join(args.out, f"shard-{s:04d}.npy")
        lo, hi = s * args.shard, min((s + 1) * args.shard, len(texts))
        if os.path.exists(path):
            continue
        part = texts[lo:hi]
        # Length-sort for padding efficiency, then invert to restore order.
        order = sorted(range(len(part)), key=lambda i: len(part[i]))
        vecs = emb.encode([part[i] for i in order], batch_size=args.batch)
        restored = np.empty_like(vecs)
        restored[np.array(order)] = vecs
        # Write via a temp file so an interrupted write cannot leave a
        # truncated shard that a resume would trust.
        tmp = path + ".tmp"
        # Write through a file handle: np.save appends `.npy` to a *path*
        # that lacks it, which would land the shard at `.npy.tmp.npy` and
        # leave the rename with nothing to move.
        with open(tmp, "wb") as fh:
            np.save(fh, restored)
        os.replace(tmp, path)

        done_chunks += len(part)
        rate = done_chunks / max(time.time() - started, 1e-9)
        remaining = (len(texts) - hi) / max(rate, 1e-9)
        print(
            f"  shard {s + 1}/{n_shards}  {hi:,}/{len(texts):,}  "
            f"{rate:.1f} chunks/s  ~{remaining / 3600:.1f}h left  "
            f"truncated {emb.truncated:,}",
            file=sys.stderr,
            flush=True,
        )

    print(
        f"done: {n_shards} shards in {args.out}, "
        f"{emb.truncated:,} of {emb.encoded:,} encoded chunks truncated",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
