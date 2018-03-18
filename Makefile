
rfcs.json.gz: rfcs.json
	gzip -9 -k -f rfcs.json

.PHONY: rfcs.json
rfcs.json:
	curl "https://www.rfc-editor.org/rfc-index.xml" | ./rfc-json.py > rfcs.json
	
.PHONY: server
server:
	python -m SimpleHTTPServer