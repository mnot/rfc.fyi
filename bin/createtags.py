#!/usr/bin/env python3

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
    with open(filename, 'r') as fh:
        for line in fh.readlines():
            line = line.strip()
            lcline = line.lower()
            if lcline.startswith("rfc"):
                rfc = lcline.split(None, 1)[0].upper()
                if rfc not in struct["rfcs"]:
                    struct["rfcs"].append(rfc)
            elif lcline.startswith("name") and name == filename.rsplit("/", 1)[1]:
                name = line.split(None, 1)[1]
            elif lcline.startswith("colour") and not "colour" in struct:
                struct["colour"] = lcline.split(None, 2)[1]
    return name, struct

if __name__ == "__main__":
    import json
    import sys

    print(json.dumps(processfiles(sys.argv[1:]), indent=2, sort_keys=True))
