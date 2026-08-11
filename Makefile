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
	@# The index is optional: without it the site still deploys and full-text
	@# reports itself unavailable. Published under its build id so every file
	@# is immutable and current.json is the only thing an update changes.
	@if [ -d index ]; then \
	  build=$$(python -c "import json;print(json.load(open('index/manifest.json'))['build'])"); \
	  echo "cp -R index _site/index/$$build ($$(du -sh index | cut -f1))"; \
	  mkdir -p _site/index; \
	  cp -R index _site/index/$$build; \
	  printf '{"build":"%s"}\n' "$$build" > _site/index/current.json; \
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
lint: client.js util.js data.js search.js bin/*.py
	standard --fix client.js util.js data.js search.js
	black bin/*.py

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

#: Index releases to keep, so a consumer mid-download of the superseded one
#: is not left with a dead URL.
INDEX_KEEP := 2

#: Index releases, newest first, as "tag<TAB>whether it carries the asset".
#: An interrupted publish leaves a tag with no index.tar.gz; it must not be
#: taken for the current index just because it sorts highest.
RELEASES = gh api repos/{owner}/{repo}/releases --paginate -q \
	'.[] | select(.tag_name | startswith("index-")) \
	     | [.tag_name, (any(.assets[]?; .name == "index.tar.gz") | tostring)] \
	     | @tsv' | sort -r

.PHONY: index
index: rfc-text
	test -f index/manifest.json || { \
	  echo "no index/ to build on -- run 'make index-fetch' or 'make index-full'" >&2; \
	  exit 1; }
	$(PY) bin/chunk.py $(RFC_TEXT) --sources var/sources.json > var/chunks.jsonl
	$(PY) bin/embed-corpus.py --chunks var/chunks.jsonl --out var/embeddings \
	  --hydrate index --sources var/sources.json
	$(PY) bin/build-clusters.py build --reuse-centroids index/centroids.bin \
	  --sources var/sources.json

.PHONY: index-full
index-full: rfc-text
	rm -rf var/embeddings index
	$(PY) bin/chunk.py $(RFC_TEXT) --sources var/sources.json > var/chunks.jsonl
	$(PY) bin/embed-corpus.py --chunks var/chunks.jsonl --out var/embeddings
	$(PY) bin/build-clusters.py build --sources var/sources.json

# Collect the published index, so an incremental build does not depend on
# having produced the previous one on this machine.
.PHONY: index-fetch
index-fetch:
	@set -e; \
	tag=$$($(RELEASES) | awk -F'\t' '$$2=="true"' | head -1 | cut -f1); \
	if [ -z "$$tag" ]; then echo "no index-* release to fetch" >&2; exit 1; fi; \
	gh release download "$$tag" --pattern 'index.tar.gz' --dir . --clobber; \
	rm -rf index; \
	tar xzf index.tar.gz; \
	rm -f index.tar.gz; \
	echo "fetched $$tag: $$(du -sh index | cut -f1)"

.PHONY: index-verify
index-verify:
	$(PY) bin/build-clusters.py verify --recall-queries 400

# Publish the built index for the deploy workflow to collect. Kept out of
# git (see .gitignore and #53): quantised vectors do not delta compress, so
# committing a regenerated 190 MiB tree monthly would grow the repo without
# bound. Tagged by build id, keeping the newest INDEX_KEEP.
#
# Recipe comments are macro-expanded, so keep make functions out of them.
#
# COPYFILE_DISABLE: macOS tar writes an AppleDouble `._name` member for every
# file carrying an xattr, and the cluster files all have com.apple.provenance.
# macOS hides them when listing, GNU tar on the runner extracts them as real
# files, and `._0000.bin` matches `clusters/*.bin`.
.PHONY: index-release
index-release:
	@set -e; \
	test -f index/manifest.json || { echo "no index; run make index-full" >&2; exit 1; }; \
	tag=index-$$($(PY) -c "import json;print(json.load(open('index/manifest.json'))['build'])"); \
	newest=$$($(RELEASES) | head -1 | cut -f1); \
	if [ -n "$$newest" ] && [ "$$tag" != "$$newest" ] && \
	   [ "$$(printf '%s\n%s\n' "$$tag" "$$newest" | sort -r | head -1)" != "$$tag" ]; then \
	  echo "refusing to publish $$tag: it sorts older than $$newest, so every" >&2; \
	  echo "consumer would keep the other one and the prune would delete this." >&2; \
	  echo "Check this machine's clock." >&2; \
	  exit 1; \
	fi; \
	COPYFILE_DISABLE=1 tar czf index.tar.gz index; \
	gh release create "$$tag" index.tar.gz --title "Semantic index $$tag" \
	  --notes "Built by make index. Unpack over index/ and run make site." \
	  || gh release upload "$$tag" index.tar.gz --clobber; \
	rm -f index.tar.gz; \
	echo "published $$tag"; \
	all=$$($(RELEASES)); \
	keep=$$(printf '%s\n' "$$all" | awk -F'\t' '$$2=="true"' | head -$(INDEX_KEEP) | cut -f1); \
	printf '%s\n' "$$all" | cut -f1 | while read -r old; do \
	  case " $$(echo $$keep) " in *" $$old "*) continue;; esac; \
	  echo "pruning $$old"; \
	  gh release delete "$$old" --yes --cleanup-tag; \
	done
