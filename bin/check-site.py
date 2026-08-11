#!/usr/bin/env python

"""Check an assembled site before it is published.

CI deploys straight to production, so there is no diff for a human to find odd
any more. The failure this is really for is an upstream response that is
well-formed but wrong -- rfc-editor.org serving a maintenance page instead of
the index parses cleanly and yields an empty RFC set.
"""

import json
import re
import sys
from pathlib import Path

# Floors, not exact counts: the series only grows. These are here to catch an
# empty or truncated result, not to track the real numbers.
FLOORS = {"var/rfcs.json": 9000, "var/refs.json": 9000}

# References that name an RFC the index doesn't have. One is expected and real:
# RFC 4111 informatively cites RFC 3889, which the index lists as
# rfc-not-issued-entry -- it was never published. A ceiling rather than zero so
# another genuine dangling citation doesn't fail the build, but low enough that
# a naming mismatch between the two files (the doc-ids lost their zero padding
# once already, which stranded 2,674 of these) can't reach production quietly.
MAX_DANGLING_REFS = 25


def sw_assets(text):
    """The paths sw.js pre-caches, read out of its own arrays."""
    for name in ("STATIC_ASSETS", "DATA_ASSETS"):
        match = re.search(rf"{name}\s*=\s*\[(.*?)\]", text, re.S)
        if match is None:
            raise SystemExit(f"sw.js has no {name} array to check against")
        yield from re.findall(r"'/([^']*)'", match.group(1))


def rfc_name(num):
    """data.js rfcNumtoName, so this checks the names the client will build."""
    return f"RFC{int(str(num).removeprefix('RFC').removeprefix('rfc'))}"


def ref_edges(refs):
    """Every (source, target) reference pair, as client-side RFC names."""
    for num, kinds in refs.items():
        for targets in kinds.values():
            for target in targets:
                yield rfc_name(num), rfc_name(target)


def check(site, tags):
    site = Path(site)
    errors = []

    # sw.js is the client's own list of what the page loads, so this catches
    # STATIC in the Makefile drifting away from what is actually needed.
    for asset in sw_assets((site / "sw.js").read_text()):
        if asset and not (site / asset).exists():
            errors.append(f"{asset}: pre-cached by sw.js, missing from the site")

    for name, floor in FLOORS.items():
        with open(site / name) as fh:
            found = len(json.load(fh))
        if found < floor:
            errors.append(f"{name}: {found} entries, expected at least {floor}")

    with open(site / "var/tags.json") as fh:
        collections = json.load(fh)["collection"]
    if len(collections) != tags:
        errors.append(f"var/tags.json: {len(collections)} collections, expected {tags}")

    # The three files have to agree on how an RFC is named. They are built from
    # two different upstreams by two different scripts, so nothing else makes
    # them, and a mismatch is invisible at runtime -- it just silently drops
    # entries and inflates the console log.
    with open(site / "var/rfcs.json") as fh:
        rfcs = json.load(fh)

    for collection, struct in sorted(collections.items()):
        missing = [name for name in struct["rfcs"] if name not in rfcs]
        if missing:
            errors.append(
                f"var/tags.json: {collection} names "
                f"{len(missing)} RFCs missing from rfcs.json: "
                f"{', '.join(missing[:5])}"
            )

    with open(site / "var/refs.json") as fh:
        refs = json.load(fh)

    dangling = sorted({f"{a} -> {b}" for a, b in ref_edges(refs) if b not in rfcs})
    if len(dangling) > MAX_DANGLING_REFS:
        errors.append(
            f"var/refs.json: {len(dangling)} references to RFCs missing from "
            f"rfcs.json, expected at most {MAX_DANGLING_REFS}: "
            f"{', '.join(dangling[:5])}"
        )

    errors.extend(check_index(site))
    return errors


def check_index(site):
    """The semantic index, when the build included one.

    Absent is fine and deliberate: it is fetched from a release, and a site
    without it publishes with full-text search reporting itself unavailable.
    Present but wrong is the case worth catching -- a half-extracted tarball
    or a truncated download leaves a manifest that parses and a clusters
    directory that does not match it, and the failure a user sees is
    'no results', which looks like a bad query rather than a broken deploy.
    """
    root = site / "index"
    if not root.exists():
        return []

    # current.json is the only stable URL under index/; everything else lives
    # under the build it names. A client that reads a build id nothing was
    # published under gets 404s for every cluster, which looks exactly like a
    # bad query.
    pointer = root / "current.json"
    if not pointer.exists():
        return ["index/: present but has no current.json"]
    try:
        with open(pointer) as fh:
            build = json.load(fh).get("build")
    except (OSError, ValueError) as err:
        return [f"index/current.json: unreadable ({err})"]
    if not build:
        return ["index/current.json: no build id"]

    index = root / build
    errors = []
    manifest_path = index / "manifest.json"
    if not manifest_path.exists():
        return [f"index/{build}/: named by current.json but has no manifest.json"]
    try:
        with open(manifest_path) as fh:
            manifest = json.load(fh)
    except (OSError, ValueError) as err:
        return [f"index/{build}/manifest.json: unreadable ({err})"]

    if manifest.get("build") != build:
        errors.append(
            f"index/{build}/manifest.json: says build {manifest.get('build')!r}, "
            f"published under {build!r}"
        )

    expected = (manifest.get("clusters") or {}).get("count")
    clusters = index / "clusters"
    found = len(list(clusters.glob("*.bin"))) if clusters.is_dir() else 0
    if not expected:
        errors.append(f"index/{build}/manifest.json: no clusters.count to check")
    elif found != expected:
        errors.append(
            f"index/{build}/clusters: {found} files, manifest says {expected}"
        )

    centroids = index / "centroids.bin"
    if not centroids.exists():
        errors.append(f"index/{build}/centroids.bin: missing")
    elif expected:
        # 24-byte header, then count x dims signed bytes. Wrong size means a
        # centroid file that does not describe this partition, and every
        # query would then probe clusters chosen against the wrong vectors.
        dims = (manifest.get("model") or {}).get("dims")
        if not dims:
            errors.append(f"index/{build}/manifest.json: no model.dims")
        else:
            want = 24 + expected * dims
            got = centroids.stat().st_size
            if got != want:
                errors.append(
                    f"index/{build}/centroids.bin: {got} bytes, expected {want}"
                )

    # The next incremental build reads this to tell which RFCs were reissued.
    # Without it that build has to re-embed the corpus from scratch.
    if not (index / "sources.json").exists():
        errors.append(f"index/{build}/sources.json: missing")

    # Nothing should be left beside the build directory and the pointer: a
    # stray older build doubles the artifact and is never served.
    stray = sorted(
        p.name for p in root.iterdir() if p.name not in {build, "current.json"}
    )
    if stray:
        errors.append(f"index/: unexpected entries beside {build}: {', '.join(stray)}")

    return errors


if __name__ == "__main__":
    errors = check(sys.argv[1], int(sys.argv[2]))
    for error in errors:
        print(f"check-site: {error}", file=sys.stderr)
    sys.exit(1 if errors else 0)
