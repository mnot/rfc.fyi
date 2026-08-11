#!/usr/bin/env python
"""The published index's on-disk format, shared by the scripts that touch it.

`build-clusters.py` writes these files and `embed-corpus.py` reads the
previous build's back to avoid re-embedding text it has already seen, so the
format lives here rather than inside either of them.


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
    const buf = await (await fetch('centroids.bin')).arrayBuffer()
    const k = new DataView(buf).getUint32(8, true)
    const cent = new Int8Array(buf, 24, k * 384)   // row j at j*384

    // clusters/NNNN.bin, whole file, ~50 KiB
    const buf = await (await fetch(`clusters/${id}.bin`)).arrayBuffer()
    const dv = new DataView(buf)
    const n = dv.getUint32(8, true)
    const metaLen = dv.getUint32(16, true)
    const vecs = new Int8Array(buf, 24, n * 384)   // chunk i at i*384
    const meta = JSON.parse(new TextDecoder().decode(
      new Uint8Array(buf, 24 + n * 384, metaLen)))

The JSON tail is columnar: every array has `n` entries and index `i`
describes the vector at row `i` of the block.

    {"n":   111,                       // == header count
     "rfc": [9110, "17a", ...],        // number, or string for the oddballs
     "off": [48213, ...],              // byte offset into the RFC text file
     "len": [1180, ...],               // byte length of that range
     "sec": [3, -1, ...],              // index into "str", -1 = no section
     "title": [7, 7, ...],             // index into "str"
     "str": ["7.2", "Message Routing", ...]}

`sec` and `title` are indices into a per-file string table because a
cluster holds many chunks from the same section -- the chunker emits
several per section, and they are near-duplicates, so they land together.
Measured against real embeddings the table takes 23% off the tail.

`(rfc, off, len)` identifies a chunk's source text. RFC text files do not
change within a publication version, so the same triple in a later build
denotes the same bytes, which is what lets that build reuse this one's
vectors; `index/sources.json` records a digest per RFC so a reissue can be
told apart. The triple is stable where a row number is not -- RFCs publish
out of numeric order, so an insertion renumbers everything after it.

Chunks within a file are ordered by ascending chunk id, and the partition
is exactly `argmax` of the dot product against the *dequantised* centroids
-- the same arithmetic the browser does -- so a client that recomputes an
assignment agrees with the build.
"""

from __future__ import annotations

import json
import os
import re
import struct
from typing import Any, Dict, Iterator, Optional, Set, Tuple

import numpy as np

DIMS = 384
FORMAT_VERSION = 1
HEADER_SIZE = 24
HEADER_STRUCT = "<4sHHIIII"
MAGIC_CENTROIDS = b"RFCV"
MAGIC_CLUSTER = b"RFCC"

#: A chunk's identity: the RFC it came from and the byte range within it.
ChunkKey = Tuple[Any, int, int]


# --------------------------------------------------------------------------
# Quantisation
# --------------------------------------------------------------------------


def quantise(vecs: np.ndarray, scale: float) -> np.ndarray:
    return np.clip(np.rint(vecs / scale), -127, 127).astype(np.int8)


def dequantise(q: np.ndarray, scale: float) -> np.ndarray:
    return q.astype(np.float32) * np.float32(scale)


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------


def header(magic: bytes, count: int, ident: int, meta_len: int) -> bytes:
    return struct.pack(
        HEADER_STRUCT, magic, FORMAT_VERSION, DIMS, count, ident, meta_len, 0
    )


def write_centroids(path: str, cent_q: np.ndarray) -> int:
    blob = header(MAGIC_CENTROIDS, cent_q.shape[0], 0, 0) + cent_q.tobytes()
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
        header(MAGIC_CLUSTER, vecs_q.shape[0], ident, len(tail))
        + vecs_q.tobytes()
        + tail
    )
    tmp = path + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(blob)
    os.replace(tmp, path)
    return len(blob)


def read_cluster(path: str) -> Tuple[np.ndarray, Dict[str, Any], int]:
    """Reference reader for `clusters/NNNN.bin`; mirrors the JS above."""
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


def cluster_paths(index_dir: str) -> Iterator[str]:
    directory = os.path.join(index_dir, "clusters")
    for name in sorted(os.listdir(directory)):
        if name.endswith(".bin"):
            yield os.path.join(directory, name)


# --------------------------------------------------------------------------
# Build identity
# --------------------------------------------------------------------------


def build_id(built: str) -> str:
    """`2026-08-10T07:56:03Z` -> `20260810T075603Z`.

    The compact form is what the index is published under, as a path segment
    and as a release tag. Colons are illegal in a git ref and awkward in a
    URL, and dropping them leaves something that still sorts lexically as it
    does chronologically.
    """
    compact = re.sub(r"[^0-9TZ]", "", built)
    if not re.fullmatch(r"\d{8}T\d{6}Z", compact):
        raise SystemExit(f"cannot form a build id from {built!r}")
    return compact


# --------------------------------------------------------------------------
# Per-RFC source digests
# --------------------------------------------------------------------------


def read_sources(path: str) -> Dict[str, Any]:
    """A whole sources.json, or empty if there isn't one.

        {"digest": "sha256",
         "chunker": {"code": "<sha256>", "opts": {...}},
         "rfcs": {"9111": "<sha256>", ...}}

    `rfcs` digests each RFC's text file. `chunker` identifies the code and
    settings that turned those bytes into chunks -- see `chunker_changed`.
    """
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as fh:
        return dict(json.load(fh))


def source_rfcs(doc: Dict[str, Any]) -> Dict[str, str]:
    return dict(doc.get("rfcs") or {})


def write_sources(path: str, doc: Dict[str, Any]) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, indent=1, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)


def chunker_changed(old: Dict[str, Any], new: Dict[str, Any]) -> Optional[str]:
    """Why the two builds' chunkers differ, or None if they do not.

    A chunk's text is a *cleaned* rendering of its byte range, so it is a
    function of the file bytes and of the chunker. Digesting only the bytes
    would let a change to the cleaning rules alter thousands of chunks
    without moving a single offset -- which the `(rfc, off, len)` key cannot
    see, and which no size guard would catch either, since the corpus looks
    identical. Reuse has to be refused on this as well.
    """
    before, after = old.get("chunker"), new.get("chunker")
    if not before or not after:
        return "one of the builds recorded no chunker fingerprint"
    if before.get("code") != after.get("code"):
        return (
            f"chunker code {str(before.get('code'))[:12]} -> "
            f"{str(after.get('code'))[:12]}"
        )
    if before.get("opts") != after.get("opts"):
        return f"chunker settings {before.get('opts')} -> {after.get('opts')}"
    return None


def changed_rfcs(old: Dict[str, str], new: Dict[str, str]) -> Set[str]:
    """RFCs whose source text differs, or whose digest either side lacks.

    An RFC missing from either map counts as changed: without a digest on
    both sides there is nothing to compare, and reusing a vector on that
    basis is exactly the silent staleness the digests exist to prevent.
    """
    return {rfc for rfc in set(old) | set(new) if old.get(rfc) != new.get(rfc)}


# --------------------------------------------------------------------------
# Reusing a previous build's vectors
# --------------------------------------------------------------------------


def previous_vectors(
    index_dir: str, skip: Set[str]
) -> Tuple[Dict[ChunkKey, np.ndarray], int]:
    """Every int8 vector in `index_dir`, keyed by `(rfc, off, len)`.

    Chunks belonging to an RFC in `skip` are left out: their text may have
    changed underneath the key, which is the one case where the key lies.

    Returns the map and the number of rows skipped.
    """
    out: Dict[ChunkKey, np.ndarray] = {}
    skipped = 0
    for path in cluster_paths(index_dir):
        rows, meta, _ = read_cluster(path)
        rfcs, offs, lens = meta["rfc"], meta["off"], meta["len"]
        for i in range(meta["n"]):
            rfc = rfcs[i]
            if str(rfc) in skip:
                skipped += 1
                continue
            out[(rfc, offs[i], lens[i])] = rows[i]
    return out, skipped
