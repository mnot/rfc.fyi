#!/usr/bin/env python

import json
import sys
import xml.sax

rfc_index_ns = "http://www.rfc-editor.org/rfc-index"

try:
    filename = sys.argv[2]
    fh = open(filename, 'r')
except IndexError:
    fh = sys.stdin

class RfcIndexHandler(xml.sax.handler.ContentHandler):
    entry_tags = ['rfc-entry']
    interesting_tags = ['title', 'current-status', 'stream', 'area', 'wg_acronym']
    invisible_tags = ['obsoleted-by', 'is-also']
    def __init__(self):
        self.feature_namespaces = True
        self.tags = []
        self.content = ''
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
            if tag == 'doc-id':
                self.doc_id = self.content.strip()
            elif tag in self.interesting_tags:
                assert not self.entry.has_key(tag)
                self.entry[tag] = self.content.strip()

        elif tag == 'doc-id' and self.tags[-1] in self.invisible_tags:
            self.entry[self.tags[-1]] = self.content.strip()

        self.content = ''
            

parser = xml.sax.make_parser()
handler = RfcIndexHandler()
parser.setContentHandler(handler)
parser.parse(fh)
print json.dumps(handler.output, indent=1)