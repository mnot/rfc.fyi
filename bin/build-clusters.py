#!/usr/bin/env python
"""Turn embedded chunks into the published IVF index under `index/`.

The browser must never download the whole index: 457k chunks at 384 int8
dimensions is ~175 MiB of vectors alone. So the index is an IVF (inverted
file) partition. Only the cluster centroids are resident in the client
(1.5 MiB at k=4096, more once the size cap has split the dense clusters);
a query is scored against those, and then the handful of
clusters the query actually needs are fetched as ordinary whole-file HTTP
GETs. Whole files, not ranges: `cache.put()` rejects a 206, so a range
request cannot be cached by the service worker.

Two properties drive the layout:

**Scoring reads only vectors.** A 20-cluster query pulls ~2,300 chunk
vectors and displays ~10 of them. So the vectors are a contiguous
fixed-stride block that becomes one `Int8Array` with no parsing, and the
display metadata -- which only the survivors need -- is a JSON tail that
`JSON.parse()` handles in native code. Encoding the metadata in binary
would trade a fast native parse for thousands of `DataView` calls in JS,
to save bytes on the ~9% of the file that is not vectors (measured: 384
bytes of vector against 39 bytes of tail per chunk).

**Metadata is not fixed-width.** Titles are variable-length UTF-8, section
labels are absent for ~14% of chunks, and `rfc` is an integer except for a
couple of oddballs where it is a string ("17a"). Every one of those is a
special case in a fixed-width binary record and none of them is a special
case in JSON.

Centroids are frozen. A later incremental run re-runs this script with
`--reuse-centroids index/centroids.bin`, which assigns chunks to the
existing partition instead of re-clustering, so cluster ids stay stable
across builds. `assign` exposes the same computation on its own.


FILE FORMATS
============

All integers are little-endian. Both binary files start with the same
24-byte header:

    offset  size  type      field
    ------  ----  --------  ---------------------------------------------
         0     4  char[4]   magic: "RFCV" centroids, "RFCC" cluster
         4     2  uint16    format version (currently 1)
         6     2  uint16    dims (384)
         8     4  uint32    count -- rows in the vector block
        12     4  uint32    ident -- cluster id; 0 in centroids.bin
        16     4  uint32    meta_len -- bytes of JSON tail; 0 in centroids.bin
        20     4  uint32    reserved (0)

The vector block follows at offset 24: `count * dims` signed bytes,
row-major, one row per vector. Dequantise with the `quant.scale` from
manifest.json: `float = int8 * scale`. Rows are NOT re-normalised after
quantisation; for ranking that does not matter, and the error it costs is
reported as `quant.chunk_cosine_mean`.

    // centroids.bin, whole file, ~1.5 MiB
    const buf = await (await fetch('index/centroids.bin')).arrayBuffer()
    const k = new DataView(buf).getUint32(8, true)
    const cent = new Int8Array(buf, 24, k * 384)   // row j at j*384

    // clusters/NNNN.bin, whole file, ~50 KiB
    const buf = await (await fetch(`index/clusters/${id}.bin`)).arrayBuffer()
    const dv = new DataView(buf)
    const n = dv.getUint32(8, true)
    const metaLen = dv.getUint32(16, true)
    const vecs = new Int8Array(buf, 24, n * 384)   // chunk i at i*384
    const meta = JSON.parse(new TextDecoder().decode(
      new Uint8Array(buf, 24 + n * 384, metaLen)))

The JSON tail is columnar: every array has `n` entries and index `i`
describes the vector at row `i` of the block.

    {"n":   111,                       // == header count
     "id":  [12, 4053, ...],           // 0-based line number in chunks.jsonl
     "rfc": [9110, "17a", ...],        // number, or string for the oddballs
     "off": [48213, ...],              // byte offset into the RFC text file
     "len": [1180, ...],               // byte length of that range
     "sec": [3, -1, ...],              // index into "str", -1 = no section
     "title": [7, 7, ...],             // index into "str"
     "str": ["7.2", "Message Routing", ...]}

`sec` and `title` are indices into a per-file string table because a
cluster holds many chunks from the same section -- the chunker emits
several per section, and they are near-duplicates, so they land together.
Measured against real embeddings the table takes 23% off the tail. `id`
is not needed to render a
result; it is there so an incremental build can tell which chunks a
re-chunked RFC replaced, and so `verify` can prove the partition covers
every chunk exactly once.

Chunks within a file are ordered by ascending `id`, and the partition is
exactly `argmax` of the dot product against the *dequantised* centroids --
the same arithmetic the browser does -- so a client that recomputes an
assignment agrees with the build.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import struct
import sys
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

DIMS = 384
FORMAT_VERSION = 1
HEADER_SIZE = 24
HEADER_STRUCT = "<4sHHIIII"
MAGIC_CENTROIDS = b"RFCV"
MAGIC_CLUSTER = b"RFCC"

MODEL_ID = "Xenova/bge-small-en-v1.5"
MODEL_VARIANT = "int8"
QUERY_PREFIX = "Represent this sentence for searching relevant passages: "

#: Clusters to fetch per query. Only advice to the client, but the fetch
#: budget reported by `verify` is computed against it.
DEFAULT_NPROBE = 20

#: Chunker settings, mirrored into the manifest so a client (and a future
#: build) can tell what the offsets mean. Kept in step with bin/chunk.py.
CHUNK_PARAMS = {"target": 1200, "cap": 1600, "overlap_max": 500, "min": 24}

#: Rows per block in the full assignment pass. The scratch score matrix is
#: block x k floats, so this is the knob that bounds peak memory there.
ASSIGN_BLOCK = 4096


# --------------------------------------------------------------------------
# Embedding shards
# --------------------------------------------------------------------------


class ShardArray:
    """Read-only view over `shard-NNNN.npy` as one (N, dims) array.

    The shards are memory-mapped rather than concatenated: the full corpus
    is ~700 MiB of float32, this script makes several passes over it, and
    the OS page cache does a better job of that than we would. Only
    `take()` materialises anything.
    """

    def __init__(self, directory: str) -> None:
        names = sorted(
            n
            for n in os.listdir(directory)
            if n.startswith("shard-") and n.endswith(".npy")
        )
        if not names:
            raise SystemExit(f"no shard-*.npy in {directory}")
        self.parts = [np.load(os.path.join(directory, n), mmap_mode="r") for n in names]
        self.names = names
        rows = [p.shape[0] for p in self.parts]
        # Bounds[i] is the first global row of shard i; bounds[-1] is the total.
        self.bounds = np.concatenate([[0], np.cumsum(rows)]).astype(np.int64)
        self.shape = (int(self.bounds[-1]), int(self.parts[0].shape[1]))
        if self.shape[1] != DIMS:
            raise SystemExit(f"shards are {self.shape[1]}-dim, expected {DIMS}")

    def __len__(self) -> int:
        return self.shape[0]

    def block(self, lo: int, hi: int) -> np.ndarray:
        """Rows [lo, hi) as a contiguous float32 array."""
        out = np.empty((hi - lo, self.shape[1]), dtype=np.float32)
        pos = 0
        first = int(np.searchsorted(self.bounds, lo, side="right") - 1)
        for s in range(first, len(self.parts)):
            base = int(self.bounds[s])
            if base >= hi:
                break
            a, b = max(lo, base), min(hi, int(self.bounds[s + 1]))
            out[pos : pos + (b - a)] = self.parts[s][a - base : b - base]
            pos += b - a
        return out

    def take(self, idx: np.ndarray) -> np.ndarray:
        """Gather arbitrary rows, in the order given."""
        out = np.empty((len(idx), self.shape[1]), dtype=np.float32)
        shard = np.searchsorted(self.bounds, idx, side="right") - 1
        for s in np.unique(shard):
            where = np.flatnonzero(shard == s)
            out[where] = self.parts[s][idx[where] - int(self.bounds[s])]
        return out


# --------------------------------------------------------------------------
# Quantisation
# --------------------------------------------------------------------------


def quantise(vecs: np.ndarray, scale: float) -> np.ndarray:
    return np.clip(np.rint(vecs / scale), -127, 127).astype(np.int8)


def dequantise(q: np.ndarray, scale: float) -> np.ndarray:
    return q.astype(np.float32) * np.float32(scale)


def mean_cosine(vecs: np.ndarray, scale: float) -> float:
    """Mean cosine between rows and their int8 round-trip."""
    back = dequantise(quantise(vecs, scale), scale)
    num = np.einsum("ij,ij->i", vecs, back)
    den = np.linalg.norm(vecs, axis=1) * np.linalg.norm(back, axis=1)
    return float(np.mean(num / np.clip(den, 1e-12, None)))


def choose_scale(sample: np.ndarray) -> Tuple[float, List[Dict[str, float]]]:
    """Pick one global int8 scale for unit-normalised vectors.

    The vectors are unit-normalised, so their components share a
    distribution and a single scale serves the whole corpus. The only real
    choice is where to clip: mapping the absolute maximum to 127 wastes
    range on a handful of outlier components, and clipping a few of them
    buys precision everywhere else. So try a few clip points and keep
    whichever actually scores best -- it is one matrix multiply to find
    out, and guessing here costs recall silently.
    """
    absv = np.abs(sample.ravel())
    tried: List[Dict[str, float]] = []
    best: Optional[Tuple[float, float]] = None
    for pct in (100.0, 99.999, 99.99, 99.9, 99.5):
        clip = float(np.percentile(absv, pct))
        if clip <= 0:
            continue
        scale = clip / 127.0
        cos = mean_cosine(sample, scale)
        tried.append({"percentile": pct, "clip": clip, "scale": scale, "cosine": cos})
        if best is None or cos > best[1]:
            best = (scale, cos)
    assert best is not None
    return best[0], tried


# --------------------------------------------------------------------------
# Spherical k-means
# --------------------------------------------------------------------------
#
# Spherical rather than Euclidean because the vectors are already
# L2-normalised and cosine is the similarity the query uses. That makes
# assignment a plain dot product -- argmax, no centroid norms to carry --
# which is what the browser has to do against centroids.bin, and it keeps
# the centroids unit-norm so they quantise on the same scale as the chunks.


def _group_sums(vecs: np.ndarray, labels: np.ndarray) -> Tuple[np.ndarray, ...]:
    """Per-label sums and counts, without a scatter-add.

    `np.add.at` is the obvious spelling and is roughly an order of
    magnitude slower than sorting by label and using `reduceat`, which
    matters when this runs once per block of every pass.
    """
    order = np.argsort(labels, kind="stable")
    lab = labels[order]
    uniq, starts, counts = np.unique(lab, return_index=True, return_counts=True)
    sums = np.add.reduceat(vecs[order], starts, axis=0)
    return uniq, sums, counts


def _normalise(vecs: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs / np.clip(norms, 1e-12, None)


def kmeanspp(sample: np.ndarray, k: int, rng: np.random.Generator) -> np.ndarray:
    """k-means++ seeding on a subsample.

    Seeding on a sample rather than the corpus because the cost is k
    sequential passes and the corpus is 457k rows; a sample of ~10k per
    centroid gives the same spread for a fraction of the time.
    """
    n = sample.shape[0]
    cent = np.empty((k, sample.shape[1]), dtype=np.float32)
    cent[0] = sample[rng.integers(n)]
    best = sample @ cent[0]
    for j in range(1, k):
        d2 = np.maximum(2.0 - 2.0 * best, 0.0).astype(np.float64)
        total = d2.sum()
        pick = rng.integers(n) if total <= 0 else rng.choice(n, p=d2 / total)
        cent[j] = sample[pick]
        np.maximum(best, sample @ cent[j], out=best)
    return _normalise(cent)


def minibatch(
    vecs: ShardArray,
    cent: np.ndarray,
    iters: int,
    batch: int,
    rng: np.random.Generator,
    log: bool = True,
) -> np.ndarray:
    """Sculley-style minibatch spherical k-means.

    Cheap way to get the centroids most of the way there; the full Lloyd
    passes afterwards do the polishing.
    """
    counts = np.ones(cent.shape[0], dtype=np.float64)
    n = len(vecs)
    for t in range(iters):
        idx = np.sort(rng.integers(0, n, size=min(batch, n)))
        rows = vecs.take(idx)
        labels = np.argmax(rows @ cent.T, axis=1)
        uniq, sums, cnt = _group_sums(rows, labels)
        counts[uniq] += cnt
        eta = (cnt / counts[uniq])[:, None].astype(np.float32)
        means = sums / cnt[:, None].astype(np.float32)
        cent[uniq] = cent[uniq] * (1.0 - eta) + means * eta
        cent[uniq] = _normalise(cent[uniq])
        if log and (t + 1) % 50 == 0:
            print(f"  minibatch {t + 1}/{iters}", file=sys.stderr, flush=True)
    return cent


def assign_all(
    vecs: ShardArray, cent: np.ndarray, accumulate: bool = False
) -> Tuple[np.ndarray, Optional[np.ndarray], Optional[np.ndarray]]:
    """One full pass: label every row, optionally accumulating cluster sums.

    Accumulating during the same pass is what makes a Lloyd iteration one
    read of the corpus rather than two.
    """
    n = len(vecs)
    labels = np.empty(n, dtype=np.int32)
    sums = np.zeros(cent.shape, dtype=np.float32) if accumulate else None
    counts = np.zeros(cent.shape[0], dtype=np.int64) if accumulate else None
    cent_t = np.ascontiguousarray(cent.T)
    for lo in range(0, n, ASSIGN_BLOCK):
        hi = min(lo + ASSIGN_BLOCK, n)
        rows = vecs.block(lo, hi)
        lab = np.argmax(rows @ cent_t, axis=1).astype(np.int32)
        labels[lo:hi] = lab
        if accumulate:
            uniq, blk_sums, cnt = _group_sums(rows, lab)
            sums[uniq] += blk_sums  # type: ignore[index]
            counts[uniq] += cnt  # type: ignore[index]
    return labels, sums, counts


def lloyd(
    vecs: ShardArray,
    cent: np.ndarray,
    iters: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Full-corpus spherical Lloyd iterations."""
    n = len(vecs)
    for t in range(iters):
        started = time.time()
        _, sums, counts = assign_all(vecs, cent, accumulate=True)
        assert sums is not None and counts is not None
        dead = np.flatnonzero(counts == 0)
        cent = _normalise(np.where(counts[:, None] > 0, sums, cent))
        if dead.size:
            # An empty centroid contributes nothing but still costs 384
            # resident bytes in every client, so respawn it on real data.
            cent[dead] = _normalise(vecs.take(np.sort(rng.integers(0, n, dead.size))))
        print(
            f"  lloyd {t + 1}/{iters}  {time.time() - started:.1f}s  "
            f"empty {dead.size}  max cluster {counts.max():,}",
            file=sys.stderr,
            flush=True,
        )
    return cent


def split_oversized(
    vecs: ShardArray,
    cent: np.ndarray,
    scale: float,
    cap: int,
    rounds: int,
    rng: np.random.Generator,
) -> Tuple[np.ndarray, np.ndarray, List[Dict[str, int]]]:
    """Split runaway clusters, then reassign, until every cluster fits.

    A cluster is split by re-clustering its own members into as many
    sub-centroids as it needs, which keeps the published invariant intact:
    the partition is still plain argmax over one flat centroid list, so a
    client needs no notion of a split.

    The cost is that k grows past the requested value, and on a corpus
    with real density contrast that is not a rounding error -- expect
    +10-25%, so budget the resident centroid download against the k this
    reports, not against the k you asked for. Splitting converges because
    each round strictly reduces the largest cluster; `--split-rounds`
    bounds it anyway, and any cluster still over the cap when the rounds
    run out is reported in the manifest as `clusters.over_cap` rather than
    forced (forcing it would break the argmax invariant above).

    Assignment inside the loop uses the *dequantised* centroids, so the
    partition that comes out is the one a browser reproduces from
    centroids.bin rather than one that merely resembles it.
    """
    # Aim below the cap so the reassignment that follows a split has room
    # to move points around without immediately breaching it again.
    target = max(1, int(cap * 0.75))
    history: List[Dict[str, int]] = []
    labels = np.empty(0, dtype=np.int32)
    for rnd in range(rounds):
        labels, _, _ = assign_all(vecs, dequantise(quantise(cent, scale), scale))
        sizes = np.bincount(labels, minlength=cent.shape[0])
        over = np.flatnonzero(sizes > cap)
        history.append(
            {"round": rnd, "clusters": int(cent.shape[0]), "over_cap": int(over.size)}
        )
        if over.size == 0:
            break
        extra: List[np.ndarray] = []
        for j in over:
            members = np.flatnonzero(labels == j)
            rows = vecs.take(members)
            parts = min(int(math.ceil(members.size / target)), members.size)
            sub = kmeanspp(rows, max(parts, 2), rng)
            for _ in range(10):
                lab = np.argmax(rows @ sub.T, axis=1)
                uniq, sums, _ = _group_sums(rows, lab)
                sub[uniq] = _normalise(sums)
            cent[j] = sub[0]
            extra.append(sub[1:])
        cent = np.vstack([cent] + extra)
        print(
            f"  split round {rnd}: {over.size} clusters over {cap:,} -> "
            f"k={cent.shape[0]:,}",
            file=sys.stderr,
            flush=True,
        )

    # Reassign against the centroids actually being returned.
    #
    # `labels` above is computed at the *top* of each round, so it describes
    # the centroid set as it stood *before* that round's split. When the loop
    # converges (`over.size == 0`) that is the final set and the labels are
    # correct. When it exhausts its rounds with clusters still over the cap --
    # the normal outcome on this corpus -- the labels are one split behind the
    # `cent` returned alongside them, and publishing that pair puts about 5% of
    # chunks in a cluster no client would probe first for them. It also made a
    # full build and a --reuse-centroids build disagree on identical input,
    # which is what surfaced this.
    #
    # The cost is that this reassignment can push a cluster back over the cap.
    # That is the right trade, and it matches the docstring above: the argmax
    # invariant is what makes a chunk findable at all, the cap is only a
    # fetch-size comfort, and over-cap clusters are reported in the manifest
    # rather than forced.
    labels, _, _ = assign_all(vecs, dequantise(quantise(cent, scale), scale))
    return cent, labels, history


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------


def _header(magic: bytes, count: int, ident: int, meta_len: int) -> bytes:
    return struct.pack(
        HEADER_STRUCT, magic, FORMAT_VERSION, DIMS, count, ident, meta_len, 0
    )


def write_centroids(path: str, cent_q: np.ndarray) -> int:
    blob = _header(MAGIC_CENTROIDS, cent_q.shape[0], 0, 0) + cent_q.tobytes()
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(blob)
    os.replace(tmp, path)
    return len(blob)


def read_centroids(path: str) -> np.ndarray:
    with open(path, "rb") as fh:
        raw = fh.read()
    magic, version, dims, count, _, _, _ = struct.unpack_from(HEADER_STRUCT, raw)
    if magic != MAGIC_CENTROIDS:
        raise SystemExit(f"{path}: bad magic {magic!r}")
    if version != FORMAT_VERSION:
        raise SystemExit(f"{path}: format version {version}, expected {FORMAT_VERSION}")
    want = HEADER_SIZE + count * dims
    if len(raw) != want:
        raise SystemExit(f"{path}: {len(raw)} bytes, expected {want}")
    return np.frombuffer(raw, dtype=np.int8, offset=HEADER_SIZE).reshape(count, dims)


def write_cluster(
    path: str, ident: int, vecs_q: np.ndarray, meta: Dict[str, Any]
) -> int:
    tail = json.dumps(meta, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    blob = (
        _header(MAGIC_CLUSTER, vecs_q.shape[0], ident, len(tail))
        + vecs_q.tobytes()
        + tail
    )
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(blob)
    os.replace(tmp, path)
    return len(blob)


def read_cluster(path: str) -> Tuple[np.ndarray, Dict[str, Any], int]:
    """Reference reader for `clusters/NNNN.bin`; mirrors the JS in the docstring."""
    with open(path, "rb") as fh:
        raw = fh.read()
    magic, version, dims, count, ident, meta_len, _ = struct.unpack_from(
        HEADER_STRUCT, raw
    )
    if magic != MAGIC_CLUSTER:
        raise SystemExit(f"{path}: bad magic {magic!r}")
    if version != FORMAT_VERSION:
        raise SystemExit(f"{path}: format version {version}, expected {FORMAT_VERSION}")
    end = HEADER_SIZE + count * dims
    if len(raw) != end + meta_len:
        raise SystemExit(f"{path}: {len(raw)} bytes, expected {end + meta_len}")
    vecs = np.frombuffer(raw, dtype=np.int8, offset=HEADER_SIZE, count=count * dims)
    meta = json.loads(raw[end:].decode("utf-8"))
    if meta["n"] != count:
        raise SystemExit(f"{path}: tail says n={meta['n']}, header says {count}")
    return vecs.reshape(count, dims), meta, ident


# --------------------------------------------------------------------------
# Chunk metadata
# --------------------------------------------------------------------------


def load_chunk_meta(path: str, limit: int = 0) -> Dict[str, List[Any]]:
    """Read chunks.jsonl, dropping `text` -- it is 95% of the file.

    Titles and section labels are interned, because consecutive chunks
    share them and holding 457k separate copies is most of the memory this
    script would otherwise use.
    """
    rfc: List[Any] = []
    off: List[int] = []
    length: List[int] = []
    sec: List[Optional[str]] = []
    title: List[str] = []
    pool: Dict[str, str] = {}

    def intern(value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        got = pool.get(value)
        if got is None:
            pool[value] = value
            got = value
        return got

    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            rfc.append(rec["rfc"])
            off.append(rec["offset"])
            length.append(rec["length"])
            sec.append(intern(rec.get("section")))
            title.append(intern(rec.get("title")) or "")
            if limit and len(rfc) >= limit:
                break
    return {"rfc": rfc, "off": off, "len": length, "sec": sec, "title": title}


def cluster_tail(meta: Dict[str, List[Any]], ids: np.ndarray) -> Dict[str, Any]:
    strs: List[str] = []
    seen: Dict[str, int] = {}

    def sid(value: str) -> int:
        got = seen.get(value)
        if got is None:
            got = len(strs)
            seen[value] = got
            strs.append(value)
        return got

    sec_idx: List[int] = []
    title_idx: List[int] = []
    for i in ids:
        section = meta["sec"][i]
        sec_idx.append(-1 if section is None else sid(section))
        title_idx.append(sid(meta["title"][i]))
    return {
        "n": int(ids.size),
        "id": [int(i) for i in ids],
        "rfc": [meta["rfc"][i] for i in ids],
        "off": [meta["off"][i] for i in ids],
        "len": [meta["len"][i] for i in ids],
        "sec": sec_idx,
        "title": title_idx,
        "str": strs,
    }


def highest_rfc(rfcs: Sequence[Any]) -> int:
    """Largest numeric RFC number; the string oddballs are not a maximum."""
    numeric = [r for r in rfcs if isinstance(r, int)]
    return max(numeric) if numeric else 0


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------


def size_report(sizes: np.ndarray) -> Dict[str, float]:
    return {
        "count": int(sizes.size),
        "total": int(sizes.sum()),
        "mean": float(sizes.mean()),
        "median": float(np.median(sizes)),
        "p95": float(np.percentile(sizes, 95)),
        "max": int(sizes.max()),
        "min": int(sizes.min()),
        "empty": int((sizes == 0).sum()),
    }


def fetch_budget(
    vecs: ShardArray,
    cent_f: np.ndarray,
    file_bytes: np.ndarray,
    nprobe: int,
    samples: int,
    rng: np.random.Generator,
) -> Dict[str, float]:
    """Bytes an nprobe-cluster query really fetches.

    Sampled with corpus vectors as the queries rather than random unit
    vectors: real queries land in dense regions of the space, so random
    directions would flatter the number.
    """
    idx = np.sort(rng.integers(0, len(vecs), size=min(samples, len(vecs))))
    rows = vecs.take(idx)
    totals = []
    for lo in range(0, rows.shape[0], 256):
        scores = rows[lo : lo + 256] @ cent_f.T
        top = np.argpartition(-scores, nprobe - 1, axis=1)[:, :nprobe]
        totals.append(file_bytes[top].sum(axis=1))
    tot = np.concatenate(totals)
    return {
        "nprobe": nprobe,
        "samples": int(tot.size),
        "mean_bytes": float(tot.mean()),
        "median_bytes": float(np.median(tot)),
        "p95_bytes": float(np.percentile(tot, 95)),
        "max_bytes": int(tot.max()),
    }


def _topk(scores: np.ndarray, k: int) -> np.ndarray:
    part = np.argpartition(-scores, k - 1, axis=1)[:, :k]
    rows = np.arange(scores.shape[0])[:, None]
    return part[rows, np.argsort(-scores[rows, part], axis=1)]


def recall_report(
    vecs: ShardArray,
    cent_f: np.ndarray,
    owner: np.ndarray,
    nprobe: int,
    topk: int,
    samples: int,
    rng: np.random.Generator,
) -> Dict[str, float]:
    """Recall of the IVF top-k against an exhaustive scan.

    This is the number that says whether the cluster count is right, and
    it is not inferable from the file sizes -- an index can be beautifully
    balanced and still send the query to the wrong 20 clusters.

    Queries here are corpus vectors, which is a proxy: a real query is a
    short question embedded with the model's query prefix, and it sits
    further from every chunk than a chunk does. So treat this as an upper
    bound on recall, and re-measure with real queries before trusting it.
    The query's own chunk is excluded from both sides, since it is
    trivially in its own cluster.
    """
    n = len(vecs)
    order = np.argsort(owner, kind="stable")
    starts = np.concatenate([[0], np.cumsum(np.bincount(owner, minlength=len(cent_f)))])
    q_idx = np.sort(rng.choice(n, size=min(samples, n), replace=False))
    queries = vecs.take(q_idx)

    # Exhaustive: block the corpus, keep each block's top-k, merge at the end.
    keep_s: List[np.ndarray] = []
    keep_i: List[np.ndarray] = []
    block = 65536
    for lo in range(0, n, block):
        rows = vecs.block(lo, min(lo + block, n))
        scores = queries @ rows.T
        sel = _topk(scores, min(topk + 1, scores.shape[1]))
        keep_s.append(np.take_along_axis(scores, sel, axis=1))
        keep_i.append(sel + lo)
    cat_s = np.concatenate(keep_s, axis=1)
    cat_i = np.concatenate(keep_i, axis=1)
    sel = _topk(cat_s, topk + 1)
    exact = np.take_along_axis(cat_i, sel, axis=1)

    probes = _topk(queries @ cent_f.T, nprobe)
    hits = 0.0
    scanned = 0
    for qi in range(queries.shape[0]):
        members = np.concatenate([order[starts[c] : starts[c + 1]] for c in probes[qi]])
        scanned += members.size
        scores = vecs.take(members) @ queries[qi]
        top = members[np.argsort(-scores)[: topk + 1]]
        got = set([int(x) for x in top if x != q_idx[qi]][:topk])
        want = [int(x) for x in exact[qi] if x != q_idx[qi]][:topk]
        hits += len(got.intersection(want)) / max(len(want), 1)
    return {
        "queries": int(queries.shape[0]),
        "top_k": topk,
        "nprobe": nprobe,
        "recall": hits / queries.shape[0],
        "mean_candidates": scanned / queries.shape[0],
        "corpus_fraction_scanned": scanned / queries.shape[0] / n,
    }


def human(n: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB"):
        if abs(n) < 1024 or unit == "GiB":
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GiB"


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------


def _frozen_scale(centroids_path: Optional[str]) -> Optional[float]:
    """The scale the frozen centroids were written with, if we can find it."""
    if not centroids_path:
        return None
    sibling = os.path.join(os.path.dirname(centroids_path), "manifest.json")
    if not os.path.exists(sibling):
        return None
    with open(sibling, encoding="utf-8") as fh:
        return float(json.load(fh)["quant"]["scale"])


def cmd_build(args: argparse.Namespace) -> None:
    rng = np.random.default_rng(args.seed)
    vecs = ShardArray(args.embeddings)
    meta = load_chunk_meta(args.chunks)
    n_chunks = len(meta["rfc"])
    if n_chunks != len(vecs):
        if not args.allow_partial:
            raise SystemExit(
                f"{n_chunks:,} chunks but {len(vecs):,} embedded rows "
                f"({len(vecs.names)} shards). The embed job is probably still "
                f"running; pass --allow-partial to index the covered prefix."
            )
        print(
            f"PARTIAL: indexing the first {len(vecs):,} of {n_chunks:,} chunks",
            file=sys.stderr,
        )
        if len(vecs) > n_chunks:
            raise SystemExit(
                f"{len(vecs):,} embedded rows for only {n_chunks:,} chunks -- "
                f"the shards do not belong to this chunks.jsonl"
            )
        n_chunks = len(vecs)
        meta = {key: col[:n_chunks] for key, col in meta.items()}

    sample = vecs.take(np.sort(rng.integers(0, len(vecs), size=min(50_000, len(vecs)))))
    scale, scale_tried = choose_scale(sample)
    frozen = _frozen_scale(args.reuse_centroids)
    if frozen is not None and frozen != scale:
        # Frozen centroids are int8; the scale is how they are read. Deriving
        # a fresh one from a grown corpus would move every centroid slightly
        # and silently repartition chunks that were meant to stay put.
        print(
            f"keeping the frozen scale {frozen:.8f} (this corpus would have "
            f"chosen {scale:.8f})",
            file=sys.stderr,
        )
        scale = frozen
    print(
        f"quantisation: scale {scale:.8f} "
        f"(clip {scale * 127:.4f}), sample cosine {mean_cosine(sample, scale):.6f}",
        file=sys.stderr,
    )

    cent_cos: Optional[float] = None
    if args.reuse_centroids:
        cent_q = read_centroids(args.reuse_centroids)
        cent_f = dequantise(cent_q, scale)
        print(
            f"reusing {cent_q.shape[0]:,} frozen centroids from "
            f"{args.reuse_centroids}",
            file=sys.stderr,
        )
        labels, _, _ = assign_all(vecs, cent_f)
        split_history: List[Dict[str, int]] = []
        cap = int(args.cap_factor * n_chunks / cent_q.shape[0])
    else:
        k = args.clusters
        n_init = min(len(vecs), args.init_sample or 10 * k)
        started = time.time()
        init = vecs.take(np.sort(rng.choice(len(vecs), size=n_init, replace=False)))
        cent = kmeanspp(init, k, rng)
        print(
            f"k-means++ init: k={k:,} from {n_init:,} sampled rows "
            f"({time.time() - started:.1f}s)",
            file=sys.stderr,
        )
        cent = minibatch(vecs, cent, args.minibatch_iters, args.batch, rng)
        cent = lloyd(vecs, cent, args.full_iters, rng)

        cap = int(args.cap_factor * n_chunks / k)
        print(f"cluster size cap: {cap:,} ({args.cap_factor}x mean)", file=sys.stderr)
        cent, labels, split_history = split_oversized(
            vecs, cent, scale, cap, args.split_rounds, rng
        )
        cent_cos = mean_cosine(cent, scale)
        cent_q = quantise(cent, scale)
        cent_f = dequantise(cent_q, scale)

    k = cent_q.shape[0]
    if k > 9999:
        raise SystemExit(f"k={k} does not fit the 4-digit cluster filename")

    os.makedirs(os.path.join(args.out, "clusters"), exist_ok=True)
    cent_bytes = write_centroids(os.path.join(args.out, "centroids.bin"), cent_q)

    # Stable-sort by label: clusters come out grouped, and each file's
    # members stay in ascending chunk id, which is what the format promises.
    order = np.argsort(labels, kind="stable")
    sizes = np.bincount(labels, minlength=k)
    starts = np.concatenate([[0], np.cumsum(sizes)])
    file_bytes = np.zeros(k, dtype=np.int64)
    written = 0
    for cid in range(k):
        ids = order[starts[cid] : starts[cid + 1]]
        rows = vecs.take(ids) if ids.size else np.zeros((0, DIMS), dtype=np.float32)
        path = os.path.join(args.out, "clusters", f"{cid:04d}.bin")
        file_bytes[cid] = write_cluster(
            path, cid, quantise(rows, scale), cluster_tail(meta, ids)
        )
        written += 1
        if written % 500 == 0:
            print(f"  wrote {written:,}/{k:,} clusters", file=sys.stderr, flush=True)

    chunk_cos = mean_cosine(sample, scale)
    manifest = {
        "version": FORMAT_VERSION,
        "built": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": {
            "id": MODEL_ID,
            "variant": MODEL_VARIANT,
            "dims": DIMS,
            "pooling": "cls",
            "max_length": 512,
            "query_prefix": QUERY_PREFIX,
        },
        "chunks": dict(CHUNK_PARAMS, count=int(n_chunks)),
        "quant": {
            "dtype": "int8",
            "scale": scale,
            "clip": scale * 127.0,
            "chunk_cosine_mean": chunk_cos,
            "centroid_cosine_mean": cent_cos,
            "candidates": scale_tried,
        },
        "clusters": {
            "count": k,
            "requested": args.clusters,
            "nprobe": DEFAULT_NPROBE,
            "path": "clusters/{id:04d}.bin",
            "cap": cap,
            "over_cap": int((sizes > cap).sum()),
            "sizes": size_report(sizes),
            "bytes": size_report(file_bytes),
            "splits": split_history,
        },
        "centroids": {"path": "centroids.bin", "bytes": cent_bytes},
        "rfc_max": highest_rfc(meta["rfc"][:n_chunks]),
    }
    with open(os.path.join(args.out, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")

    total = cent_bytes + int(file_bytes.sum())
    print(
        f"wrote {k:,} clusters + centroids to {args.out}: {human(total)} total, "
        f"centroids {human(cent_bytes)}, cluster files mean "
        f"{human(file_bytes.mean())} / max {human(file_bytes.max())}",
        file=sys.stderr,
    )


def assign(vecs: np.ndarray, cent_q: np.ndarray, scale: float) -> np.ndarray:
    """Cluster id for each row, against frozen int8 centroids.

    This is the whole of the incremental story and the whole of the
    client's cluster selection: dequantise the centroids, dot, argmax.
    """
    return np.argmax(vecs @ dequantise(cent_q, scale).T, axis=1).astype(np.int32)


def cmd_assign(args: argparse.Namespace) -> None:
    with open(args.manifest, encoding="utf-8") as fh:
        scale = json.load(fh)["quant"]["scale"]
    cent_q = read_centroids(args.centroids)
    if args.vectors:
        rows = np.load(args.vectors).astype(np.float32)
        ids = assign(rows, cent_q, scale)
    else:
        vecs = ShardArray(args.embeddings)
        lo = args.offset
        hi = min(lo + args.limit, len(vecs)) if args.limit else len(vecs)
        ids = assign(vecs.block(lo, hi), cent_q, scale)
    if args.out:
        np.save(args.out, ids)
    sizes = np.bincount(ids, minlength=cent_q.shape[0])
    print(
        json.dumps(
            {"assigned": int(ids.size), "clusters_touched": int((sizes > 0).sum())},
            indent=2,
        )
    )


def cmd_verify(args: argparse.Namespace) -> None:
    rng = np.random.default_rng(args.seed)
    with open(os.path.join(args.out, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    scale = manifest["quant"]["scale"]
    k = manifest["clusters"]["count"]
    cent_q = read_centroids(os.path.join(args.out, "centroids.bin"))
    cent_f = dequantise(cent_q, scale)
    vecs = ShardArray(args.embeddings)
    n_chunks = manifest["chunks"]["count"]
    report: Dict[str, Any] = {"clusters": k, "chunks": n_chunks}

    # Coverage: every chunk in exactly one file, and the file it is in is
    # the one argmax puts it in.
    seen = np.zeros(n_chunks, dtype=np.int8)
    owner = np.full(n_chunks, -1, dtype=np.int32)
    file_bytes = np.zeros(k, dtype=np.int64)
    sizes = np.zeros(k, dtype=np.int64)
    dup = 0
    for cid in range(k):
        path = os.path.join(args.out, "clusters", f"{cid:04d}.bin")
        file_bytes[cid] = os.path.getsize(path)
        rows, meta, ident = read_cluster(path)
        if ident != cid:
            raise SystemExit(f"{path}: header cluster id {ident}, expected {cid}")
        ids = np.array(meta["id"], dtype=np.int64)
        if ids.size and not np.all(np.diff(ids) > 0):
            raise SystemExit(f"{path}: ids are not strictly ascending")
        for key in ("rfc", "off", "len", "sec", "title"):
            if len(meta[key]) != meta["n"]:
                raise SystemExit(
                    f"{path}: {key} has {len(meta[key])}, want {meta['n']}"
                )
        if max(meta["sec"] + meta["title"], default=-1) >= len(meta["str"]):
            raise SystemExit(f"{path}: string table index out of range")
        dup += int(seen[ids].sum())
        seen[ids] = 1
        owner[ids] = cid
        sizes[cid] = rows.shape[0]
    report["coverage"] = {
        "in_a_cluster": int(seen.sum()),
        "missing": int((seen == 0).sum()),
        "duplicated": dup,
        "ok": bool(seen.all() and dup == 0 and sizes.sum() == n_chunks),
    }

    # Round trip: dequantise from what was actually written and compare
    # against the float32 the embedder produced.
    cos: List[float] = []
    for cid in rng.choice(k, size=min(args.sample_clusters, k), replace=False):
        rows, meta, _ = read_cluster(
            os.path.join(args.out, "clusters", f"{int(cid):04d}.bin")
        )
        if not meta["n"]:
            continue
        ids = np.array(meta["id"], dtype=np.int64)
        orig = vecs.take(ids)
        back = dequantise(rows, scale)
        num = np.einsum("ij,ij->i", orig, back)
        den = np.linalg.norm(orig, axis=1) * np.linalg.norm(back, axis=1)
        cos.extend((num / np.clip(den, 1e-12, None)).tolist())
    arr = np.array(cos) if cos else np.zeros(1, dtype=np.float32)
    report["round_trip"] = {
        "vectors": int(arr.size),
        "cosine_mean": float(arr.mean()),
        "cosine_min": float(arr.min()),
        "cosine_p01": float(np.percentile(arr, 1)),
    }

    # Frozen centroids reproduce the build's partition.
    n_held = min(args.sample_assign, n_chunks)
    held = np.sort(rng.choice(n_chunks, size=n_held, replace=False))
    got = assign(vecs.take(held), cent_q, scale)
    agree = int((got == owner[held]).sum())
    report["assignment"] = {
        "sampled": int(held.size),
        "agree": agree,
        "disagree": int(held.size - agree),
        "ok": agree == held.size,
    }

    report["sizes"] = size_report(sizes)
    report["file_bytes"] = size_report(file_bytes)
    cent_bytes = os.path.getsize(os.path.join(args.out, "centroids.bin"))
    report["on_disk"] = {
        "centroids_bytes": cent_bytes,
        "clusters_bytes": int(file_bytes.sum()),
        "manifest_bytes": os.path.getsize(os.path.join(args.out, "manifest.json")),
        "total_bytes": int(file_bytes.sum()) + cent_bytes,
    }
    report["query"] = fetch_budget(
        vecs, cent_f, file_bytes, args.nprobe, args.sample_queries, rng
    )
    report["query"]["resident_bytes"] = cent_bytes
    if args.recall_queries and report["coverage"]["ok"]:
        report["recall"] = recall_report(
            vecs, cent_f, owner, args.nprobe, args.top_k, args.recall_queries, rng
        )
    print(json.dumps(report, indent=2))
    ok = report["coverage"]["ok"] and report["assignment"]["ok"]
    sys.exit(0 if ok else 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="cluster and write index/")
    b.add_argument("--chunks", default="var/chunks.jsonl")
    b.add_argument("--embeddings", default="var/embeddings")
    b.add_argument("--out", default="index")
    b.add_argument("-k", "--clusters", type=int, default=4096)
    b.add_argument("--cap-factor", type=float, default=3.0)
    b.add_argument("--split-rounds", type=int, default=6)
    b.add_argument("--init-sample", type=int, default=0, help="default 10k rows")
    b.add_argument("--minibatch-iters", type=int, default=300)
    b.add_argument("--batch", type=int, default=8192)
    b.add_argument("--full-iters", type=int, default=8)
    b.add_argument("--seed", type=int, default=0)
    b.add_argument(
        "--reuse-centroids",
        help="freeze this centroids.bin and only assign (incremental build)",
    )
    b.add_argument(
        "--allow-partial",
        action="store_true",
        help="index the embedded prefix when shards are incomplete",
    )
    b.set_defaults(func=cmd_build)

    a = sub.add_parser("assign", help="cluster ids against frozen centroids")
    a.add_argument("--centroids", default="index/centroids.bin")
    a.add_argument("--manifest", default="index/manifest.json")
    a.add_argument("--embeddings", default="var/embeddings")
    a.add_argument("--vectors", help="assign this .npy instead of the shards")
    a.add_argument("--offset", type=int, default=0)
    a.add_argument("--limit", type=int, default=0)
    a.add_argument("--out", help="write cluster ids as .npy")
    a.set_defaults(func=cmd_assign)

    v = sub.add_parser("verify", help="check a built index and report its costs")
    v.add_argument("--out", default="index")
    v.add_argument("--embeddings", default="var/embeddings")
    v.add_argument("--nprobe", type=int, default=DEFAULT_NPROBE)
    v.add_argument("--sample-clusters", type=int, default=64)
    v.add_argument("--sample-assign", type=int, default=20000)
    v.add_argument("--sample-queries", type=int, default=2000)
    v.add_argument("--recall-queries", type=int, default=200, help="0 to skip")
    v.add_argument("--top-k", type=int, default=10)
    v.add_argument("--seed", type=int, default=1)
    v.set_defaults(func=cmd_verify)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
