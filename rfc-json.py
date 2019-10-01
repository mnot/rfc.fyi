#!/usr/bin/env python

import json
import sys
import xml.sax

rfc_index_ns = "http://www.rfc-editor.org/rfc-index"

try:
    filename = sys.argv[2]
    fh = open(filename, "r")
except IndexError:
    fh = sys.stdin


class RfcIndexHandler(xml.sax.handler.ContentHandler):
    entry_tags = ["rfc-entry"]
    interesting_tags = ["title", "current-status", "stream", "area", "wg_acronym"]
    invisible_tags = ["obsoleted-by", "is-also"]

    def __init__(self):
        self.feature_namespaces = True
        self.tags = []
        self.content = ""
        self.doc_id = None
        self.entry = {}
        self.output = {}
        xml.sax.handler.ContentHandler.__init__(self)

    def startElement(self, name, attrs):
        self.tags.append(name)

    def characters(self, content):
        self.content += content

    def endElement(self, name):
        tag = self.tags.pop()
        assert tag == name
        if tag in self.entry_tags:
            # This is an entry.
            self.output[self.doc_id] = self.entry
            self.entry = {}

        elif len(self.tags) > 1 and self.tags[-1] in self.entry_tags:
            # We're at the top level of an entry.
            if tag == "doc-id":
                self.doc_id = self.content.strip()
            elif tag in self.interesting_tags:
                assert tag not in self.entry
                self.entry[tag] = self.content.strip()

        elif tag == "doc-id" and self.tags[-1] in self.invisible_tags:
            self.entry[self.tags[-1]] = self.content.strip()

        elif tag == "kw" and self.tags[-1] == "keywords":
            if "keywords" in self.entry:
                self.entry["keywords"].append(self.content.strip())
            else:
                self.entry["keywords"] = [self.content.strip()]

        self.content = ""


level_lookup = {
    "INTERNET STANDARD": "std",
    "DRAFT STANDARD": "std",
    "BEST CURRENT PRACTICE": "bcp",
    "HISTORIC": "historic",
    "EXPERIMENTAL": "experimental",
    "UNKNOWN": "unknown",
    "INFORMATIONAL": "informational",
    "PROPOSED STANDARD": "std",
}


def fixup(raw):
    output = {}
    for key, value in list(raw.items()):
        output[key] = {
            "status": "obsoleted-by" in value and "obsoleted" or "current",
            "level": level_lookup[value["current-status"]],
            "stream": value["stream"].lower(),
            "title": value["title"],
            "keywords": value.get("keywords", []),
        }
        if "wg_acronym" in value and value["wg_acronym"] != "NON WORKING GROUP":
            output[key]["wg"] = value["wg_acronym"]
        if "area" in value:
            output[key]["area"] = value["area"]
    return output


def main():
    parser = xml.sax.make_parser()
    handler = RfcIndexHandler()
    parser.setContentHandler(handler)
    parser.parse(fh)
    print(json.dumps(fixup(handler.output), indent=1))


if __name__ == "__main__":
    main()
