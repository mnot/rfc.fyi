
var/rfcs.json: var/rfc-index.xml bin/rfc-json.py
	cat var/rfc-index.xml | bin/rfc-json.py > var/rfcs.json

.PHONY: refs.json
var/refs.json:
	curl https://raw.githubusercontent.com/mnot/rfc-refs/main/refs.json > $@

.PHONY: var/rfc-index.xml
var/rfc-index.xml:
	curl -R --etag-save $@.etag --etag-compare $@.etag "https://www.rfc-editor.org/rfc-index.xml" -o $@

.PHONY: server
server:
	python -m http.server

.PHONY: lint
lint: client.js util.js data.js *.py
	standard --fix client.js util.js
	black *.py

.PHONY: clean
clean:
	rm -f var/rfcs.json
