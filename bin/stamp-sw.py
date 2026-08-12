#!/usr/bin/env python

"""Stamp the service worker's cache name with a hash of what it serves.

The cache name is the site's only version marker. The worker serves its
static set cache-first, so a file already in a cache is never looked at
again, and a deploy reaches a browser only by installing a worker under a
new name. Bumping that name was a hand-run make target, so most deploys
did not, and clients instead refreshed assets one at a time -- which is how
one ends up running client.js from one build against util.js from the next.

Hashes sw.js itself along with everything it names, so changing the
worker's own logic bumps the name as well as changing what it caches. sw.js
is read with its placeholder still in place; that is what stops the
self-reference from chasing its own tail.
"""

import hashlib
import re
import sys
from pathlib import Path

PREFIX = "rfcfyi-v"
LENGTH = 12

# The name the committed sw.js carries, and what the cache name is reduced to
# before hashing. Named rather than blank so an unstamped worker reaching the
# site is recognisable; check-site.py rejects one.
PLACEHOLDER = f"{PREFIX}unstamped"


def static_assets(text):
    """The paths sw.js pre-caches.

    DATA_ASSETS is deliberately not among them: var/*.json is rebuilt daily
    and served stale-while-revalidate, so folding it in would reinstall the
    worker every morning to no purpose.
    """
    match = re.search(r"STATIC_ASSETS\s*=\s*\[(.*?)\]", text, re.S)
    if match is None:
        raise SystemExit("stamp-sw: sw.js has no STATIC_ASSETS array")
    return re.findall(r"'/([^']*)'", match.group(1))


def cached_files(site, text):
    """Every file the worker will hold under this cache name.

    vendor/ is in here because it is served cache-first too and nothing in
    its names pins a version -- ort-wasm-simd-threaded.jsep.wasm keeps that
    name across transformers.js releases, so only the bytes distinguish
    them.
    """
    # '/' is index.html under another name; hashing it twice says no more.
    for asset in sorted(set(static_assets(text)) - {""}):
        path = site / asset
        if not path.exists():
            raise SystemExit(
                f"stamp-sw: {asset}: named by sw.js, missing from the site"
            )
        yield asset, path

    vendor = site / "vendor"
    for path in sorted(p for p in vendor.rglob("*") if p.is_file()):
        yield str(path.relative_to(site)), path


def stamp(site):
    site = Path(site)
    worker = site / "sw.js"
    text = worker.read_text()

    # Reduce the cache name before hashing, so stamping is idempotent: a
    # second run over the same tree would otherwise hash the first run's
    # stamp and rename a cache whose contents had not moved.
    text, count = re.subn(
        r"CACHE_NAME = '[^']*'", f"CACHE_NAME = '{PLACEHOLDER}'", text, count=1
    )
    if not count:
        raise SystemExit("stamp-sw: sw.js has no CACHE_NAME line to stamp")

    digest = hashlib.sha256()
    digest.update(text.encode())
    for name, path in cached_files(site, text):
        # The name as well as the bytes: a rename changes what is served
        # even when no file's contents do.
        digest.update(name.encode())
        digest.update(path.read_bytes())

    name = f"{PREFIX}{digest.hexdigest()[:LENGTH]}"
    worker.write_text(text.replace(f"'{PLACEHOLDER}'", f"'{name}'", 1))
    return name


if __name__ == "__main__":
    print(f"sw.js cache name {stamp(sys.argv[1])}")
