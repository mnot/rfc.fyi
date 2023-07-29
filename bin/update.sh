#!/bin/bash

# This script is for CI updates

# Check to see if it has changed
git status --short var/rfcs.json var/refs.json var/rfc-index.xml.etag | grep -s "M" || exit 0

# setup
git config user.email mnot@mnot.net
git config user.name mnot-bot
git remote set-url --push origin https://mnot:$GITHUB_TOKEN@github.com/mnot/rfc.fyi
git checkout -B main origin/main

# Push the changes
git add var/rfc-index.xml
git add var/rfc-index.xml.etag
git add var/rfcs.json
git add var/refs.json
git add var/tags.json
git commit -m "update rfcs"
git push origin main
