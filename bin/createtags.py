#!/usr/bin/env python3

import re
import sys

# Tag files are hand-written, so both "RFC748" and the older zero-padded
# "RFC0748" show up. rfc-index.xml doc-ids are unpadded, so normalise to that
# -- a padded name matches nothing in rfcs.json and the tag silently loses an
# entry.
RFC_NAME = re.compile(r"^rfc0*(\d+)$")


def processfiles(filenames):
    out = {"collection": {}}
    for filename in filenames:
        name, struct = processfile(filename)
        out["collection"][name] = struct
    return out


def processfile(filename):
    name = filename.rsplit("/", 1)[1]
    struct = {"rfcs": []}
    colour = None
    with open(filename, "r") as fh:
        for line in fh.readlines():
            line = line.strip()
            lcline = line.lower()
            if lcline.startswith("rfc"):
                match = RFC_NAME.match(lcline.split(None, 1)[0])
                if match is None:
                    # Losing an entry silently is the failure this whole
                    # function is guarding against, so say so.
                    print(
                        f"createtags: {filename}: skipping unparseable RFC line: {line}",
                        file=sys.stderr,
                    )
                    continue
                rfc = f"RFC{match.group(1)}"
                if rfc not in struct["rfcs"]:
                    struct["rfcs"].append(rfc)
            elif lcline.startswith("name") and name == filename.rsplit("/", 1)[1]:
                name = line.split(None, 1)[1]
            elif lcline.startswith("colour") and not "colour" in struct:
                struct["colour"] = lcline.split(None, 2)[1]
    return name, struct


if __name__ == "__main__":
    import json

    print(json.dumps(processfiles(sys.argv[1:]), indent=2, sort_keys=True))
