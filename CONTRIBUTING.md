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

`rfc-json.py` creates the JSON from the RFC Editor's index. Try `make var/rfcs.json`.

Everything in `var/` is generated or fetched, so it isn't checked in. `make site` fetches the
inputs, builds the data files and assembles the published site into `_site/`; that directory is
what CI uploads to GitHub Pages. `make server` builds it and serves it, so what you see locally
is what gets published.

`_site` is assembled from an explicit list of files in the Makefile, so a new root-level asset
has to be added there or it won't be published. `bin/check-site.py` guards the result: it fails
the build if anything `sw.js` pre-caches is missing, if the service worker's cache name wasn't
stamped, or if the data files come back implausibly empty.

A service worker cache name is the only version its contents have, and `bin/stamp-sw.py` stamps
both of them into `_site` from a hash of what each holds — there is nothing to bump by hand.
`CACHE_NAME` covers the site and moves on any source change; `VENDOR_CACHE` covers `vendor/`
alone, so a stylesheet edit doesn't evict the 21 MB wasm. Both are served cache-first, so a
change reaches a browser by installing a worker under a new name; refreshing files individually
is what used to leave a client running one build's `client.js` against the next one's `util.js`.
`test/sw.test.js` covers the routing.

Note that `make server` serves on localhost, where the worker is deliberately network-first, so
none of that caching is exercised there. To see it, serve `_site` yourself and load it over a
`*.localhost` hostname — a secure context, but not one the worker treats as development.

JavaScript should be formatted according to
[standard](https://github.com/standard/standard); try `make lint`.

