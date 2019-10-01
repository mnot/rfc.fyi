#!/bin/bash

# Check to see if it has changed.
git status --short rfcs.json | grep -s "M" || exit 0

# setup
git config user.email mnot@mnot.net
git config user.name mnot-bot
git remote set-url --push origin https://mnot:$GITHUB_TOKEN@github.com/everyRFC/everyRFC
git checkout -B master origin/master

# Push the changes
git add rfc-index.xml
git add rfcs.json
git commit -m "update rfcs"
git push origin master