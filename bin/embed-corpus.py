#!/usr/bin/env python
"""Embed every chunk in a JSONL file, reusing anything already embedded.

The full corpus is ~457k chunks and around six hours on this machine, so this
is a local job (see `make index-full`). What makes the monthly update cheap
is not resumability but the cache below.

**Keyed by content, not position.** Each vector is stored against the SHA-256
of the text it came from. An earlier design keyed the cache by row number and
skipped whole shards, which only works if new chunks land at the end of the
file -- and they do not. RFCs publish out of numeric order: a document can
sit in AUTH48 while later-numbered ones go out, so gaps are filled months
afterwards and a new chunk can appear anywhere in the corpus. Position keying
would silently misalign every vector after the insertion, or force a full
re-embed to avoid it. Hashing the text makes the order irrelevant: reordering
the corpus costs nothing, and only genuinely new text is embedded.

**Order-stable output.** Chunks are length-sorted before encoding, because
padding is batch-longest and mixing a 1,000-token chunk with thirty short
ones pads them all to 1,000 -- worth about 25%. Vectors are written back in
input order, so row N of the output always corresponds to line N of the
input, whatever the batching did.

**Resumable.** Output is still written as fixed-size shards, and a run that
dies partway leaves its completed work in the cache, so restarting re-embeds
only what it had not reached.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Dict, List

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


def digest(text: str) -> bytes:
    return hashlib.sha256(text.encode("utf-8")).digest()


def load_cache(out: str) -> Dict[bytes, np.ndarray]:
    """Every vector previously written, keyed by the hash of its source text.

    Shards and their hash sidecars are written together; a shard without one
    predates content keying and is ignored rather than trusted, since its
    rows can only be interpreted positionally.
    """
    cache: Dict[bytes, np.ndarray] = {}
    for shard in sorted(f for f in os.listdir(out) if f.startswith("shard-")):
        keys = os.path.join(out, shard.replace("shard-", "hashes-"))
        if not os.path.exists(keys):
            continue
        vecs = np.load(os.path.join(out, shard))
        raw = np.load(keys)
        for i in range(len(vecs)):
            cache[raw[i].tobytes()] = vecs[i]
    return cache


def write_shards(out: str, vecs: np.ndarray, hashes: List[bytes], shard: int) -> int:
    for s, lo in enumerate(range(0, len(vecs), shard)):
        hi = min(lo + shard, len(vecs))
        for name, data in (
            (f"shard-{s:04d}.npy", vecs[lo:hi]),
            (
                f"hashes-{s:04d}.npy",
                np.frombuffer(b"".join(hashes[lo:hi]), dtype=np.uint8).reshape(-1, 32),
            ),
        ):
            path = os.path.join(out, name)
            tmp = path + ".tmp"
            # Write through a handle: np.save appends `.npy` to a *path* that
            # lacks it, which would land the file at `.npy.tmp.npy`.
            with open(tmp, "wb") as fh:
                np.save(fh, data)
            os.replace(tmp, path)
    return (len(vecs) + shard - 1) // shard


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
    hashes = [digest(t) for t in texts]

    cache = load_cache(args.out)
    todo = [i for i, h in enumerate(hashes) if h not in cache]
    print(
        f"{len(texts):,} chunks, {len(cache):,} cached, {len(todo):,} to embed "
        f"({args.model}/{args.variant})",
        file=sys.stderr,
    )

    if todo:
        emb = Embedder(args.model, args.variant)
        started = time.time()
        # Length-sort so a batch is not padded up to its longest member.
        order = sorted(todo, key=lambda i: len(texts[i]))
        for lo in range(0, len(order), args.shard):
            part = order[lo : lo + args.shard]
            vecs = emb.encode([texts[i] for i in part], batch_size=args.batch)
            for i, row in zip(part, vecs):
                cache[hashes[i]] = row
            done = min(lo + args.shard, len(order))
            rate = done / max(time.time() - started, 1e-9)
            print(
                f"  {done:,}/{len(order):,}  {rate:.1f} chunks/s  "
                f"~{(len(order) - done) / max(rate, 1e-9) / 3600:.1f}h left  "
                f"truncated {emb.truncated:,}",
                file=sys.stderr,
                flush=True,
            )
            # Persist as we go, so an interrupted run keeps its work.
            partial = np.vstack([cache[h] for h in hashes if h in cache])
            keys = [h for h in hashes if h in cache]
            write_shards(args.out, partial, keys, args.shard)

    vecs = np.vstack([cache[h] for h in hashes])
    n = write_shards(args.out, vecs, hashes, args.shard)
    # Drop shards left over from a longer previous corpus.
    for f in sorted(os.listdir(args.out)):
        if f.startswith(("shard-", "hashes-")):
            idx = int(f.split("-")[1].split(".")[0])
            if idx >= n:
                os.remove(os.path.join(args.out, f))
    print(f"done: {len(vecs):,} vectors in {n} shards under {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
