# Run prettier but don't write changes
if [[ "$OSTYPE" == "darwin"* ]]; then
  find -E . -iregex ".*\.(ts|js)" | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier --check
else
  find . -regextype posix-extended -regex '.*\.(ts|js)$' | egrep -v "(./node_modules/*|./apidoc*)" | xargs npx prettier --check
fi
