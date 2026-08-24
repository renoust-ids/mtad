#!/bin/bash
set -e

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 20

cd "$(dirname "$0")"

echo "=== Step 1: Bootstrap ==="
npx lerna bootstrap --force-local --hoist --no-ci --ignore-prepublish

echo "=== Step 2: Build reltab ==="
cd packages/reltab && npx tsc -p tsconfig-build.json && cd ../..

echo "=== Step 3: Build aggtree ==="
cd packages/aggtree && npx tsc -p tsconfig-build.json && cd ../..

echo "=== Step 4: Build reltab-duckdb ==="
cd packages/reltab-duckdb && npx tsc -p tsconfig-build.json && cd ../..

echo "=== Step 5: Build reltab-fs ==="
cd packages/reltab-fs && npx tsc -p tsconfig-build.json && cd ../..

echo "=== Step 6: Build reltab-bigquery ==="
cd packages/reltab-bigquery && npx tsc && cd ../..

echo "=== Step 7: Build tadviewer ==="
cd packages/tadviewer && npx webpack --mode production && cd ../..

echo "=== Step 8: Build tad-app ==="
cd packages/tad-app
npm run build-assets
npx webpack --mode production

echo "=== Step 9: Package ==="
npx electron-builder --mac --arm64 --x64 --publish=never

echo ""
echo "=== SUCCESS ==="
ls -lh dist/*.dmg 2>/dev/null
