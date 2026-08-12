#!/usr/bin/env python

"""Stamp the service worker's cache names with hashes of what they hold.

A cache name is the only version marker its contents have. The worker serves
them cache-first, so a file already in a cache is never looked at again, and
a deploy reaches a browser only by installing a worker under a new name.
Bumping that name was a hand-run make target, so most deploys did not, and
clients instead refreshed assets one at a time -- which is how one ends up
running client.js from one build against util.js from the next.

Two names, because the two sets move on different clocks:

CACHE_NAME covers the site, and takes in sw.js itself, so changing the
worker's logic bumps it as well as changing what it caches. sw.js is hashed
with its names reduced to their placeholders; that is what stops the
self-reference from chasing its own tail, and what makes a second run over
the same tree produce the same answer.

VENDOR_CACHE covers vendor/ alone, which changes only with
TRANSFORMERS_VERSION. Folding it into the site's name would evict 22 MiB,
most of it the ort wasm, on every stylesheet edit.
"""

import hashlib
import re
import sys
from pathlib import Path

LENGTH = 12

# Reduced to before hashing, and what the committed sw.js carries. Named
# rather than blank so an unstamped worker reaching the site is
# recognisable; check-site.py rejects one.
NAMES = {
    "CACHE_NAME": ("rfcfyi-v", "rfcfyi-vunstamped"),
    "VENDOR_CACHE": ("rfcfyi-vendor-", "rfcfyi-vendor-unstamped"),
}


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


def digest(files):
    """Hash a sequence of (name, bytes). The name as well as the bytes: a
    rename changes what is served even when no file's contents do."""
    out = hashlib.sha256()
    for name, data in files:
        out.update(name.encode())
        out.update(data)
    return out.hexdigest()[:LENGTH]


def site_files(site, text):
    yield "sw.js", text.encode()
    # '/' is index.html under another name; hashing it twice says no more.
    for asset in sorted(set(static_assets(text)) - {""}):
        path = site / asset
        if not path.exists():
            raise SystemExit(f"stamp-sw: {asset}: named by sw.js, not in the site")
        yield asset, path.read_bytes()


def vendor_files(site):
    vendor = site / "vendor"
    # Its absence would otherwise stamp a name for an empty set, and the
    # worker would serve full-text search out of a cache of nothing.
    if not vendor.is_dir():
        raise SystemExit("stamp-sw: no vendor/ in the site; run make vendor")
    for path in sorted(p for p in vendor.rglob("*") if p.is_file()):
        yield str(path.relative_to(site)), path.read_bytes()


def stamp(site):
    site = Path(site)
    worker = site / "sw.js"
    text = worker.read_text()

    for const, (_, placeholder) in NAMES.items():
        text, count = re.subn(
            rf"{const} = '[^']*'", f"{const} = '{placeholder}'", text, count=1
        )
        if not count:
            raise SystemExit(f"stamp-sw: sw.js has no {const} line to stamp")

    stamped = {
        "CACHE_NAME": NAMES["CACHE_NAME"][0] + digest(site_files(site, text)),
        "VENDOR_CACHE": NAMES["VENDOR_CACHE"][0] + digest(vendor_files(site)),
    }
    for const, name in stamped.items():
        text = text.replace(f"{const} = '{NAMES[const][1]}'", f"{const} = '{name}'", 1)
    worker.write_text(text)
    return stamped


if __name__ == "__main__":
    for const, name in stamp(sys.argv[1]).items():
        print(f"sw.js {const} {name}")
