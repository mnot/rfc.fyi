#!/usr/bin/env python3

import json

def processfiles(filenames):
    with open("var/rfcs.json") as jfh:
        rfcs = json.load(jfh)
    for filename in filenames:
        with open(filename, 'r') as fh:
            outlines = []
            for line in fh.readlines():
                line = line.strip()
                lcline = line.lower()
                if lcline.startswith("rfc"):
                    rfc = lcline.split(None, 1)[0].upper()
                    if rfc != lcline:
                        title = rfcs[rfc]['title']
                        if title:
                            line = f"{rfc} {title}"
                outlines.append(line)
        with open(filename, 'w') as fh:
            fh.write("\n".join(outlines))

if __name__ == "__main__":
    import sys

    processfiles(sys.argv[1:])
