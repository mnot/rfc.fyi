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

# Assemble the published site. This is what gets uploaded as the Pages
# artifact; nothing here is committed.
.PHONY: site
site: $(DATA)
	@for f in $(DATA); do \
	  python -c "import json,sys; json.load(open(sys.argv[1]))" $$f || exit 1; \
	done
	rm -rf _site
	mkdir -p _site/var
	cp $(STATIC) _site/
	cp $(DATA) _site/var/

.PHONY: server
server:
	python -m http.server

.PHONY: lint
lint: client.js util.js data.js *.py
	standard --fix client.js util.js
	black *.py

.PHONY: clean
clean:
	rm -rf _site
	rm -f var/rfcs.json

.PHONY: pwa-update
pwa-update:
	@VERSION=$$(date +%s); \
	sed -i '' "s/CACHE_NAME = 'rfcfyi-v[0-9]*'/CACHE_NAME = 'rfcfyi-v$${VERSION}'/" sw.js; \
	echo "PWA cache version updated to v$${VERSION}"
