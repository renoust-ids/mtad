#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20

cd "$(dirname "$0")"

echo "=== Bootstrap ==="
if [ -d node_modules/lerna ] && [ -f packages/reltab-duckdb/node_modules/duckdb/lib/binding/duckdb.node ]; then
  echo "Dependencies already installed, skipping bootstrap"
else
  npx lerna bootstrap --force-local --hoist --no-ci
fi

echo "=== Build tadviewer ==="
cd packages/tadviewer
npx webpack --mode development

echo "=== Build tad-app ==="
cd ../tad-app
npx webpack --mode development

echo "=== Launch ==="
node_modules/.bin/electron .
