
traceur := /usr/local/bin/traceur

rfcs.json: rfc-index.xml rfc-json.py
	cat rfc-index.xml | ./rfc-json.py > rfcs.json

.PHONY: refs.json
refs.json:
	curl https://raw.githubusercontent.com/mnot/rfc-refs/main/refs.json > $@

.PHONY: rfc-index.xml
rfc-index.xml:
	curl -R -z $@ "https://www.rfc-editor.org/rfc-index.xml" -o $@

client-es5.js: client.js util.js
	$(traceur) --out client-es5.js client.js

.PHONY: server
server:
	python -m SimpleHTTPServer

.PHONY: lint
lint: client.js util.js *.py
	standard --fix client.js util.js
	black *.py

.PHONY: clean
clean:
	rm -f rfcs.json rfcs.json.gz
