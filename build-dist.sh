#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20

cd "$(dirname "$0")"

echo "=== Production Build ==="

# 1. Bootstrap if needed
if [ ! -d node_modules/lerna ] || [ ! -f packages/reltab-duckdb/node_modules/duckdb/lib/binding/duckdb.node ]; then
  echo "--- Bootstraping dependencies ---"
  npx lerna bootstrap --force-local --hoist --no-ci
fi

# 2. Build tadviewer production
echo "--- Building tadviewer (production) ---"
cd packages/tadviewer
npx webpack --mode production
cd ../..

# 3. Build tad-app production
echo "--- Building tad-app (production) ---"
cd packages/tad-app
npx webpack --mode production

# 4. Package with electron-builder (both arm64 + x64 for Mac)
echo "--- Packaging with electron-builder (arm64 + x64) ---"
npx electron-builder --mac --arm64 --x64 --publish=never

echo ""
echo "=== Done ==="
echo "Artifacts are in: packages/tad-app/dist/"
ls -lh dist/*.dmg 2>/dev/null || echo "(DMG not found, check dist/ for other outputs)"
