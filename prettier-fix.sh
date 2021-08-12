#!/bin/bash
if [[ "$OSTYPE" == "darwin"* ]]; then
  find -E . -iregex ".*\.(ts|js|vue)" | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier --write
else
  find . -regextype posix-extended -regex '.*\.(ts|js|vue)$' | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier --write
fi
