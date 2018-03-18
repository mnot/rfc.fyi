# Tags for RFCs


## Tags


## RFCs

The list of RFCs is kept in rfcs.json, and is generated from the XML RFC index kept by the RFC editor. It can be updated like this:

> curl "https://www.rfc-editor.org/rfc-index.xml" | ./rfc-json.py > rfcs.json

or just

> make rfcs.json

The output is a bit big for a Web page, so the result needs to be compressed (as it is by the Makefile).