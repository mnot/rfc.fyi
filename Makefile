# Never leave a half-written target behind; `curl > $@` truncates $@ before
# curl runs, so a failed fetch would otherwise leave an empty file.
.DELETE_ON_ERROR:

# The published tree. This is an allowlist, deliberately: anything not named
# here is not served, which is how bin/, src/ and the 13 MB rfc-index.xml stay
# out. Adding a root-level asset means adding it here. bin/check-site.py fails
# the build if this drifts from what sw.js expects to load.
STATIC := index.html client.js data.js util.js search.js style.css sw.js manifest.json rfcfyi.png CNAME
DATA := var/rfcs.json var/refs.json var/tags.json

var:
	mkdir -p var

var/rfcs.json: var/rfc-index.xml bin/rfc-json.py
	cat var/rfc-index.xml | bin/rfc-json.py > $@

.PHONY: var/refs.json
var/refs.json: | var
	curl --fail -sS https://raw.githubusercontent.com/mnot/rfc-refs/main/refs.json > $@

.PHONY: var/rfc-index.xml
var/rfc-index.xml: | var
	curl --fail -R --etag-save $@.etag --etag-compare $@.etag "https://www.rfc-editor.org/rfc-index.xml" -o $@

tagfiles := $(wildcard src/tags/*)
var/tags.json: bin/createtags.py $(tagfiles) | var
	python bin/createtags.py $(tagfiles) > $@

# Assemble the published site. This is what CI uploads as the Pages artifact;
# nothing in it is committed.
.PHONY: site
site: $(DATA) vendor
	rm -rf _site
	mkdir -p _site/var _site/vendor
	cp $(STATIC) _site/
	cp $(DATA) _site/var/
	cp -R vendor/. _site/vendor/
	@# The semantic index, when there is one. Optional by design: it is built
	@# locally and collected from a release, so a site built without it is a
	@# working site whose full-text mode reports itself unavailable, rather
	@# than a failed deploy.
	@if [ -d index ]; then \
	  echo "cp -R index _site/ ($$(du -sh index | cut -f1))"; \
	  cp -R index _site/; \
	else \
	  echo "no index/ -- publishing without full-text search"; \
	fi
	python bin/check-site.py _site $(words $(tagfiles)) || { rm -rf _site; exit 1; }

# Third-party runtime, fetched rather than committed. Same reasoning as the
# index (#53): the wasm alone is 21 MB and does not delta-compress, so
# committing it would add that much to history on every version bump. Pinned
# by version, and the sizes are asserted so a truncated or redirected
# download fails the build instead of shipping.
TRANSFORMERS_VERSION := 3.8.1
TRANSFORMERS_CDN := https://cdn.jsdelivr.net/npm/@huggingface/transformers@$(TRANSFORMERS_VERSION)/dist

.PHONY: vendor
vendor: vendor/transformers-$(TRANSFORMERS_VERSION).min.js vendor/ort/ort-wasm-simd-threaded.jsep.wasm

vendor/transformers-$(TRANSFORMERS_VERSION).min.js:
	mkdir -p vendor
	curl --fail -sS $(TRANSFORMERS_CDN)/transformers.min.js -o $@
	@test $$(wc -c < $@) -gt 800000 || { echo "$@ looks truncated"; rm -f $@; exit 1; }

vendor/ort/ort-wasm-simd-threaded.jsep.wasm:
	mkdir -p vendor/ort
	curl --fail -sS $(TRANSFORMERS_CDN)/ort-wasm-simd-threaded.jsep.mjs \
	  -o vendor/ort/ort-wasm-simd-threaded.jsep.mjs
	curl --fail -sS $(TRANSFORMERS_CDN)/ort-wasm-simd-threaded.jsep.wasm -o $@
	@test $$(wc -c < $@) -gt 20000000 || { echo "$@ looks truncated"; rm -f $@; exit 1; }

.PHONY: server
server: site
	cd _site && python -m http.server

.PHONY: lint
lint: client.js util.js data.js search.js bin/*.py eval/*.py
	standard --fix client.js util.js data.js search.js
	black bin/*.py eval/*.py

.PHONY: clean
clean:
	rm -rf _site var

.PHONY: pwa-update
pwa-update:
	@VERSION=$$(date +%s); \
	sed -i '' "s/CACHE_NAME = 'rfcfyi-v[0-9]*'/CACHE_NAME = 'rfcfyi-v$${VERSION}'/" sw.js; \
	echo "PWA cache version updated to v$${VERSION}"


# --- semantic index -------------------------------------------------------
# Corpus text is a build input, never committed (see .gitignore). The full
# mirror is ~512 MiB; SAMPLE narrows it for development, and deliberately
# spans both the old page-oriented .txt format and modern xml2rfc-v3 output
# so the chunker is exercised on both.

RFC_TEXT := var/rfc-text
RSYNC_SRC := ftp.rfc-editor.org::rfcs-text-only
SAMPLE := 'rfc[19]*.txt'

.PHONY: rfc-text
rfc-text:
	mkdir -p $(RFC_TEXT)
	rsync -az --delete --include='rfc[0-9]*.txt' --exclude='*' $(RSYNC_SRC) $(RFC_TEXT)/

.PHONY: rfc-text-sample
rfc-text-sample:
	mkdir -p $(RFC_TEXT)
	rsync -az --include=$(SAMPLE) --exclude='*' $(RSYNC_SRC) $(RFC_TEXT)/

# --- semantic index build -------------------------------------------------
# Local jobs, never CI: `index-full` embeds 457k chunks and takes hours.
# `index` is the monthly path and only embeds what is new, which is viable
# in a runner if we ever want it there.

PY := .venv/bin/python

.PHONY: index
index: rfc-text
	$(PY) bin/chunk.py $(RFC_TEXT) > var/chunks.jsonl
	$(PY) bin/embed-corpus.py --chunks var/chunks.jsonl --out var/embeddings
	$(PY) bin/build-clusters.py build --reuse-centroids index/centroids.bin

.PHONY: index-full
index-full: rfc-text
	rm -rf var/embeddings index
	$(PY) bin/chunk.py $(RFC_TEXT) > var/chunks.jsonl
	$(PY) bin/embed-corpus.py --chunks var/chunks.jsonl --out var/embeddings
	$(PY) bin/build-clusters.py build

.PHONY: index-verify
index-verify:
	$(PY) bin/build-clusters.py verify --recall-queries 400

# Publish the built index for the deploy workflow to collect. Kept out of
# git deliberately (see .gitignore and #53): quantised vectors do not delta
# compress, so committing a regenerated 190 MiB tree monthly would grow the
# repo without bound.
.PHONY: index-release
index-release:
	@# One shell, one read. $(shell ...) expands when the recipe is expanded,
	@# which is *before* the guard below runs -- so with no index you got two
	@# Python tracebacks and an empty tag instead of the intended message.
	@set -e; \
	test -f index/manifest.json || { echo "no index; run make index-full" >&2; exit 1; }; \
	tag=index-$$($(PY) -c "import json;print(json.load(open('index/manifest.json'))['version'])"); \
	tar czf index.tar.gz index; \
	gh release create "$$tag" index.tar.gz --title "Semantic index $$tag" \
	  --notes "Built by make index-full." \
	  || gh release upload "$$tag" index.tar.gz --clobber; \
	rm -f index.tar.gz; \
	echo "published $$tag"
