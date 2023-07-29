# Contributing to rfc.fyi

We welcome contributions from the community.


## Adding and Maintaining Tag Collections

Collections (the tags you see on the front page) are intended to be useful sets
of RFCs that cover a particular topic.

New collections an be proposed by [opening an
issue](https://github.com/mnot/rfc.fyi/issues/new?template=Custom.md).

Each collection has one or more maintainers; they're responsible for curating that collection to
meet its purpose. Note that proposing a collection doesn't mean that you'll automatically be
selected as a maintainer, or that the collection will be accepted. We want to keep it
high-quality and focused.

Collections are maintained in `src/tags`; each file is a separate collection. The format is line-based:

* Lines starting with "RFC" are RFCs to include in the collection; everything after the first space is ignored.
* The first line starting with "colour" expects a hex colour after the first space, to use for that tag.
* The first line starting with "name" expects a name to use for the collection; otherwise, the filename will be used.
* Lines beginning with `#` are ignored.


## Code Contributions

This is a single HTML page using JavaScript; it loads RFCs as a compressed JSON file, and so we
try to keep the size of that (and other) files down as much as possible.

`json-rfc.py` creates the JSON from the RFC Editor's index. Try `make rfcs.json.gz`.

JavaScript should be formatted according to
[standard](https://github.com/standard/standard); try `make lint`.

