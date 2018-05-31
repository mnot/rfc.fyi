
traceur := /usr/local/bin/traceur

rfcs.json: rfc-index.xml rfc-json.py
	cat rfc-index.xml | ./rfc-json.py > rfcs.json

.PHONY: rfc-index.xml
rfc-index.xml:
	curl "https://www.rfc-editor.org/rfc-index.xml" -o $@

rfcs-es5.js: rfcs.js util.js
	$(traceur) --out rfcs-es5.js rfcs.js

.PHONY: server
server:
	python -m SimpleHTTPServer

.PHONY: lint
lint: rfcs.js util.js
	standard --fix rfcs.js util.js

.PHONY: clean
clean:
	rm -f rfcs.json rfcs.json.gz
