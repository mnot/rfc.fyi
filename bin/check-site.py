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


def sw_assets(text):
    """The paths sw.js pre-caches, read out of its own arrays."""
    for name in ("STATIC_ASSETS", "DATA_ASSETS"):
        match = re.search(rf"{name}\s*=\s*\[(.*?)\]", text, re.S)
        if match is None:
            raise SystemExit(f"sw.js has no {name} array to check against")
        yield from re.findall(r"'/([^']*)'", match.group(1))


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
        found = len(json.load(fh)["collection"])
    if found != tags:
        errors.append(f"var/tags.json: {found} collections, expected {tags}")

    return errors


if __name__ == "__main__":
    errors = check(sys.argv[1], int(sys.argv[2]))
    for error in errors:
        print(f"check-site: {error}", file=sys.stderr)
    sys.exit(1 if errors else 0)
