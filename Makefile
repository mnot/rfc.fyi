# Never leave a half-written target behind; `curl > $@` truncates $@ before
# curl runs, so a failed fetch would otherwise leave an empty file.
.DELETE_ON_ERROR:

# The published tree. This is an allowlist, deliberately: anything not named
# here is not served, which is how bin/, src/ and the 13 MB rfc-index.xml stay
# out. Adding a root-level asset means adding it here. bin/check-site.py fails
# the build if this drifts from what sw.js expects to load.
STATIC := index.html client.js data.js util.js style.css sw.js manifest.json rfcfyi.png CNAME
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
site: $(DATA)
	rm -rf _site
	mkdir -p _site/var
	cp $(STATIC) _site/
	cp $(DATA) _site/var/
	python bin/check-site.py _site $(words $(tagfiles)) || { rm -rf _site; exit 1; }

.PHONY: server
server: site
	cd _site && python -m http.server

.PHONY: lint
lint: client.js util.js data.js bin/*.py
	standard --fix client.js util.js
	black bin/*.py

.PHONY: clean
clean:
	rm -rf _site var

.PHONY: pwa-update
pwa-update:
	@VERSION=$$(date +%s); \
	sed -i '' "s/CACHE_NAME = 'rfcfyi-v[0-9]*'/CACHE_NAME = 'rfcfyi-v$${VERSION}'/" sw.js; \
	echo "PWA cache version updated to v$${VERSION}"
