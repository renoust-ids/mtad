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

# 2. Build all packages in dependency order
echo "--- Building reltab ---"
cd packages/reltab && npx tsc -p tsconfig-build.json && cd ../..
echo "--- Building aggtree ---"
cd packages/aggtree && npx tsc -p tsconfig-build.json && cd ../..
echo "--- Building reltab-duckdb ---"
cd packages/reltab-duckdb && npx tsc -p tsconfig-build.json && cd ../..
echo "--- Building reltab-fs ---"
cd packages/reltab-fs && npx tsc -p tsconfig-build.json && cd ../..
echo "--- Building reltab-bigquery ---"
cd packages/reltab-bigquery && npx tsc && cd ../..

# 3. Build tadviewer production
echo "--- Building tadviewer (production) ---"
cd packages/tadviewer
npx webpack --mode production
cd ../..

# 4. Build tad-app production
echo "--- Building tad-app (production) ---"
cd packages/tad-app
npm run build-assets
npx webpack --mode production

# 5. Clean dist/ of old artifacts before packaging
echo "--- Cleaning dist/ of old build artifacts ---"
rm -rf dist/mac dist/mac-arm64 dist/win dist/win-unpacked dist/linux dist/linux-unpacked dist/*.dmg dist/*.zip dist/*.blockmap dist/latest-*.yml 2>/dev/null || true

# 6. Package with electron-builder (both arm64 + x64 for Mac)
echo "--- Packaging with electron-builder (arm64 + x64) ---"
npx electron-builder --mac --arm64 --x64 --publish=never

echo ""
echo "=== Done ==="
echo "Artifacts are in: packages/tad-app/dist/"
ls -lh dist/*.dmg 2>/dev/null || echo "(DMG not found, check dist/ for other outputs)"
