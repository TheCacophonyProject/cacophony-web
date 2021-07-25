if [[ "$OSTYPE" == "darwin"* ]]; then
  find -E . -iregex ".*\.(ts|js)" | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier
else
  find . -regextype posix-extended -regex '.*\.(ts|js)$' | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier
fi
