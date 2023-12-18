#!/bin/bash

# This script is for CI updates

# Check to see if it has changed
git status --short var/rfcs.json var/refs.json var/tags.json var/rfc-index.xml.etag | grep -s "M" || exit 0

# setup
git config user.email mnot@mnot.net
git config user.name mnot-bot

# Push the changes
git add var/rfc-index.xml
git add var/rfc-index.xml.etag
git add var/rfcs.json
git add var/refs.json
git add var/tags.json
git commit -m "update var"
git push origin main
