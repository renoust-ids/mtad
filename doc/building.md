# Building MTad from Sources

## Pre-requisites: Node, Npm and Lerna

To build MTad, you should have [Node.js](https://nodejs.org/) v20 or later and `npm` (included when you install Node.js) installed.

```bash
$ node --version
v20.x.x
$ npm --version
10.x.x
```

## Quick Start

The easiest way to build MTad is using the `run.sh` script:

```bash
# Full build (bootstrap + reltab + bundles)
./run.sh --reltab
```

This will:
1. Bootstrap all monorepo packages via Lerna
2. Build the reltab SQL generation layer
3. Build tadviewer and tad-app bundles

## Manual Build Steps

### 1. Install Dependencies

```bash
npm install
npx lerna bootstrap --force-local --hoist --no-ci
```

### 2. Build reltab (SQL Generation Layer)

```bash
cd packages/reltab
npx tsc -p tsconfig-build.json
```

### 3. Build tadviewer (React Component)

```bash
cd packages/tadviewer
npx webpack --mode production
```

### 4. Build tad-app (Electron Desktop App)

```bash
cd packages/tad-app
npx webpack --mode production
```

## Running the Application

### Development Mode

```bash
# Launch with reltab backend (recommended)
./run.sh --reltab

# Or launch directly via Electron
cd packages/tad-app && npm start -- path/to/data.csv
```

### Iterating During Development

Keep these running in separate terminals:

```bash
# Terminal 1: Watch tadviewer (auto-rebuild on changes)
cd packages/tadviewer && npm run watch

# Terminal 2: Watch tad-app (auto-rebuild on changes)
cd packages/tad-app && npm run watch
```

Then restart the Electron app to see changes. For changes to reltab or other packages, run the full build.

## Packaging for Distribution

```bash
cd packages/tad-app
npx electron-builder --mac dir --arm64 --publish=never
```

## Useful Commands

```bash
# Run tests
cd packages/reltab && npm test
cd packages/reltab-duckdb && npm test

# Clean and rebuild
npx lerna clean --yes
npx lerna bootstrap --force-local --hoist --no-ci

# Build all packages
npx lerna run build
```

## Logs

Log files (via [electron-log](https://www.npmjs.com/package/electron-log)):

- macOS: `~/Library/Logs/mtad/main.log`
- Linux: `~/.config/mtad/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\mtad\main.log`

## Experimental Backends

You can try out the experimental backends by setting appropriate environment variables:

### Snowflake Credentials

Set `$RELTAB_SNOWFLAKE_ACCOUNT`, `$RELTAB_SNOWFLAKE_USERNAME` and `$RELTAB_SNOWFLAKE_PASSWORD`.

### BigQuery Credentials

Set `$GOOGLE_APPLICATION_CREDENTIALS` to the path of a BigQuery credentials JSON file.

### AWS Athena

Configure AWS credentials and set appropriate environment variables.
