
rfcs.json.gz: rfcs.json
	gzip -9 -k -f rfcs.json

rfcs.json: rfc-index.xml rfc-json.py
	cat rfc-index.xml | ./rfc-json.py > rfcs.json

rfc-index.xml:
	curl "https://www.rfc-editor.org/rfc-index.xml" -o $@
	
.PHONY: server
server:
	python -m SimpleHTTPServer

.PHONY: lint
lint:
	standard --fix *.js

.PHONY: clean
clean:
	rm -f rfcs.json rfcs.json.gz