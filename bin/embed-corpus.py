#!/usr/bin/env python
"""Embed every chunk in a JSONL file, reusing anything already embedded.

The full corpus is ~457k chunks and around six hours on this machine, so this
is a local job (see `make index-full`). What makes the monthly update cheap
is not resumability but the cache below.

**Keyed by content, not position.** Each vector is stored against the SHA-256
of its text. RFCs publish out of numeric order -- a document can sit in
AUTH48 while later-numbered ones go out -- so a new chunk can appear anywhere
in the corpus, and a row-numbered cache would misalign every vector after it.

**Order-stable output.** Chunks are length-sorted before encoding, since
padding is batch-longest and mixing one long chunk with thirty short ones
pads them all (worth ~25%). Vectors are written back in input order.

**Resumable.** A run that dies partway leaves its completed work in the
cache.

**Hydrated from the published index.** `--hydrate index/` seeds the cache
from the previous build's int8 vectors, joined on `(rfc, off, len)`.
Requantising a dequantised int8 row at the same scale returns the same byte,
so hydrating writes the same cluster bytes as keeping float32 would -- which
is what makes an update independent of the machine that ran the last one.
RFCs whose digest changed are excluded, as is everything if the chunker
changed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from typing import Dict, List, Tuple

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# pylint: disable=wrong-import-position
from embed import Embedder  # noqa: E402
from indexfmt import (  # noqa: E402
    ChunkKey,
    changed_rfcs,
    chunker_changed,
    dequantise,
    previous_vectors,
    read_sources,
    source_rfcs,
)

SHARD = 20_000

#: Refuse to embed more than this share of the corpus on a hydrated run. A
#: monthly update adds a few thousand chunks; anything near a full re-embed
#: means the hydrate source did not match.
MAX_NEW_FRACTION = 0.25


def read_chunks(path: str) -> Tuple[List[str], List[ChunkKey]]:
    """Chunk texts and their `(rfc, off, len)` keys, in file order."""
    texts: List[str] = []
    keys: List[ChunkKey] = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            texts.append(rec["text"])
            keys.append((rec["rfc"], rec["offset"], rec["length"]))
    return texts, keys


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


def hydrate(
    index_dir: str,
    sources: str,
    keys: List[ChunkKey],
    hashes: List[bytes],
    cache: Dict[bytes, np.ndarray],
) -> Dict[str, int]:
    """Seed `cache` from a previous index, skipping RFCs that have changed.

    Reads only published files -- the cluster vectors and `sources.json`
    beside them -- so a release is enough to build incrementally from.
    """
    manifest_path = os.path.join(index_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        raise SystemExit(f"--hydrate {index_dir}: no manifest.json")
    with open(manifest_path, encoding="utf-8") as fh:
        scale = float(json.load(fh)["quant"]["scale"])

    old_doc = read_sources(os.path.join(index_dir, "sources.json"))
    new_doc = read_sources(sources)
    if not old_doc:
        raise SystemExit(
            f"--hydrate {index_dir}: no sources.json, so there is no way to "
            f"tell which RFCs have been reissued since it was built. Rebuild "
            f"with `make index-full`, or hydrate from a newer release."
        )
    if not new_doc:
        raise SystemExit(f"--sources {sources}: missing or empty")

    # The chunker is half of what produced the text these vectors describe,
    # so a change to it invalidates all of them wherever offsets stayed put.
    why = chunker_changed(old_doc, new_doc)
    if why:
        raise SystemExit(
            f"--hydrate {index_dir}: {why}. The chunk text these vectors were "
            f"built from is not the text this run produces, so none of them "
            f"can be reused. Rebuild with `make index-full`."
        )

    old_digests = source_rfcs(old_doc)
    new_digests = source_rfcs(new_doc)
    changed = changed_rfcs(old_digests, new_digests)
    prev, skipped = previous_vectors(index_dir, changed)

    reused = 0
    for i, key in enumerate(keys):
        if hashes[i] in cache:
            continue
        row = prev.get(key)
        if row is not None:
            cache[hashes[i]] = dequantise(row, scale)
            reused += 1
    return {
        "reused": reused,
        "available": len(prev),
        "changed_rfcs": len(changed),
        "skipped_rows": skipped,
    }


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
    ap.add_argument(
        "--hydrate",
        help="reuse vectors from this previously built index/ directory",
    )
    ap.add_argument(
        "--sources",
        default="var/sources.json",
        help="this corpus's per-RFC digests, compared against the hydrate source",
    )
    ap.add_argument(
        "--max-new",
        type=float,
        default=MAX_NEW_FRACTION,
        help="abort a hydrated run that would embed more than this fraction",
    )
    args = ap.parse_args()

    texts, keys = read_chunks(args.chunks)
    os.makedirs(args.out, exist_ok=True)
    hashes = [digest(t) for t in texts]

    cache = load_cache(args.out)
    local = len(cache)
    if args.hydrate:
        stats = hydrate(args.hydrate, args.sources, keys, hashes, cache)
        print(
            f"hydrated {stats['reused']:,} vectors from {args.hydrate} "
            f"({stats['available']:,} available, {stats['changed_rfcs']:,} RFCs "
            f"changed so {stats['skipped_rows']:,} rows were left out)",
            file=sys.stderr,
        )

    todo = [i for i, h in enumerate(hashes) if h not in cache]
    print(
        f"{len(texts):,} chunks, {local:,} cached locally, "
        f"{len(cache) - local:,} hydrated, {len(todo):,} to embed "
        f"({args.model}/{args.variant})",
        file=sys.stderr,
    )
    if args.hydrate and texts and len(todo) > args.max_new * len(texts):
        raise SystemExit(
            f"{len(todo):,} of {len(texts):,} chunks ({len(todo) / len(texts):.0%}) "
            f"would be embedded, over the {args.max_new:.0%} limit for a hydrated "
            f"run. That usually means {args.hydrate} is not the previous build of "
            f"this corpus, or the chunker has changed and every offset moved. "
            f"Re-run with --max-new 1 to embed anyway (hours), or use "
            f"`make index-full`."
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
            done_hashes = [h for h in hashes if h in cache]
            partial = np.vstack([cache[h] for h in done_hashes])
            write_shards(args.out, partial, done_hashes, args.shard)

    vecs = np.vstack([cache[h] for h in hashes])
    n = write_shards(args.out, vecs, hashes, args.shard)
    # Drop shards left over from a longer previous corpus.
    for f in sorted(os.listdir(args.out)):
        if f.startswith(("shard-", "hashes-")):
            idx = int(f.split("-")[1].split(".")[0])
            if idx >= n:
                os.remove(os.path.join(args.out, f))
    print(
        f"done: {len(vecs):,} vectors in {n} shards under {args.out}", file=sys.stderr
    )


if __name__ == "__main__":
    main()
