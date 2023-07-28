#!/bin/bash

# This script is for CI updates

# Check to see if it has changed
git status --short rfcs.json refs.json rfc-index.xml.etag | grep -s "M" || exit 0

# setup
git config user.email mnot@mnot.net
git config user.name mnot-bot
git remote set-url --push origin https://mnot:$GITHUB_TOKEN@github.com/mnot/rfc.fyi
git checkout -B main origin/master

# Push the changes
git add rfc-index.xml
git add rfc-index.xml.etag
git add rfcs.json
git add refs.json
git commit -m "update rfcs"
git push origin main
