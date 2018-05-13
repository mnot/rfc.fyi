# Contributing to EveryRFC

We welcome contributions from the community. 


## Adding and Maintaining Collections

Collections (the tags you see on the front page) are intended to be useful sets
of RFCs that cover a particular topic.

New collections an be proposed by [opening an
issue](https://github.com/EveryRFC/everyRFC/issues/new?template=Custom.md).

Each collection has one or more maintainers; they're responsible for curating that collection to
meet its purpose. Note that proposing a collection doesn't mean that you'll automatically be
selected as a maintainer, or that the collection will be accepted. We want to keep everyRFC
high-quality and focused.

Collections are maintained in `tags.json`; see that file for the (hopefully obvious) format. In the
future, they might be moved to discrete files, if this becomes unwieldy.



## Code Contributions

EveryRFC is a single HTML page using JavaScript; it loads RFCs as a compressed JSON file, and so we
try to keep the size of that (and other) files down as much as possible.

`json-rfc.py` creates the JSON from the RFC Editor's index. Try `make rfcs.json.gz`.

JavaScript should be formatted according to
[standard](https://github.com/standard/standard); try `make standard`.

