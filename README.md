# MTad

MTad is a fork of [Tad](https://www.tadviewer.com), an application for viewing and analyzing tabular data sets, with additional features for data editing and manipulation.

The MTad desktop application enables you to quickly view and explore tabular data in several of the most popular
tabular data file formats: CSV, Parquet, and SQLite and DuckDb database files.
Internally, the application is powered by an in-memory instance of [DuckDb](https://duckdb.org/), a fast, embeddable database engine optimized for analytic queries.

The core of MTad is a React UI component that implements a hierarchical pivot table that allows you to specify a combination of pivot, filter, aggregate, sort, column selection, column ordering and basic column formatting operations. MTad delegates to a SQL database for storage and analytics, and generates SQL queries to perform all
analytic operations specified in the UI.

MTad can be launched from the command line like this:

    $ ./run.sh --reltab

Or to open a specific file:

    $ cd packages/tad-app && npm start -- path/to/file.csv

This will open a window with a scrollable view of the full contents of the CSV file:

![Tad screenshot](doc/screenshots/tad-metobjects-unpivoted.png "Unpivoted view of CSV file")

MTad uses [SlickGrid](http://slickgrid.net/) for rendering the data grid. This allows MTad to support efficient linear
scrolling of the entire file, even for very large (millions of rows) data sets.

A few additional mouse clicks on the above view yields this view, pivoted by a few
columns (`Department`, `Classification`, `Period` and `Culture`), sorted by the `Object Start Date` column, and
with columns re-ordered:

![tad screenshot](doc/screenshots/tad-metobjects-pivoted.png "Met Museum Objects with Pivots")

## New Features in MTad

The sections below summarize what MTad adds on top of the original Tad. See [doc/features.md](doc/features.md) for a full feature reference, including the SQL executed behind each operation.

### Cell Editing

MTad supports editing cell values directly in the data grid:

- **Double-click** on any editable cell to open an edit modal with type-aware validation
- **Right-click** on cells to access a context menu with editing options
- Edit **pivot labels** on aggregate rows (renames all occurrences of the pivot value)
- Edit **aggregate cells** to update values grouped by pivot columns

### Row & Column Insertion

- **Right-click** on any cell and choose **Insert Row** to append a new empty row to the table (executes `INSERT INTO ... DEFAULT VALUES`)
- **Right-click** on a column header and choose **Insert Column** to add a new empty column; a dialog suggests a unique name (e.g. `<column>_new`, `new_column`, `new_column_2`, ...) that you can edit before confirming (executes `ALTER TABLE ... ADD COLUMN`)

### Column Management

- **Right-click** on column headers to rename columns (executes `ALTER TABLE RENAME COLUMN`)
- Column reorder via drag-and-drop
- Column sorting (ascending/descending)

### Grid Interaction Refinements

- **Hover highlight** — hovering a cell draws a thick dark blue border around it instead of filling it, so the underlying value stays readable at all times
- **Selections survive right-clicks** — right-clicking a cell that is part of an existing multi-cell selection keeps the selection intact, so context menu actions (delete, duplicate, copy, ...) act on the whole selected group rather than collapsing to a single cell

### Distribution Dialog

- **Right-click** a column header (or use the **Analytics ▸ Distribution** menu) to open an interactive **Distribution** chart for that column, computed on demand
- **Numeric columns** get a binned histogram with a live-updating bin-count control (double-click the value to type it directly), an optional log scale, a null bar, and a statistics panel (count, nulls, unique, min, max, mean, std)
- **Temporal columns** (date / time / timestamp) are binned over their epoch values and labeled with the original type-aware format (`YYYY-MM-DD`, `HH:MM`, ...)
- **Non-numeric columns** get a categorical bar chart of the most frequent values with a configurable **min-frequency** threshold and click-to-select bars that filter the grid
- **Brush to filter**: drag across the bars to apply a numeric range filter to the grid in real time
- **Pivot-aware**: on pivoted views the chart is computed over the grouped query results
- See [doc/analytics.md](doc/analytics.md) for the full walkthrough and screenshots

### Confusion Matrix

- **Analytics ▸ Confusion Matrix** opens a co-occurrence matrix between a chosen **row variable** and **column variable** (a 2D histogram of two columns)
- Numeric and temporal columns are auto-binned with adjustable **row/col bin** counts; categorical columns use their distinct values as classes; selecting the **same column twice** gives a within-column co-occurrence matrix
- Cells are heat-mapped by value and by default show their **count**; a mode selector switches to **conditional on rows** `P(col|row)` or **conditional on columns** `P(row|col)`
- A **minimum-occurrence** threshold blanks out rare cells (and excludes them from normalization); empty rows/columns disappear as it changes
- **Click a cell** to filter the grid on both axes (a bin range, or the categorical value); clicking it again removes the filter
- **Apply Table Filters / Use all rows** switches, a **swap-axes** button, and pivot-aware computation
- See [doc/features.md](doc/features.md) and [doc/analytics.md](doc/analytics.md)

### Table & Analytics Filters

MTad distinguishes between the query filter of the view and ad-hoc exploration filters:

- The footer groups filters into two tabs: **Table Filters** (persisted with the view) and **Analytics Filters** (created by brushing the Distribution dialog or clicking categorical bars)
- Each tab shows a live **SQL summary** of its filter; hovering a tab or editing its filter prefixes the summary with `T: ` (table) or `A: ` (analytics), and an **✕ icon** next to each tab clears that filter
- An **Apply Analytics Filters** checkbox in the footer controls whether analytics filters affect the current view
- The Distribution dialog has its own **Apply Table Filters** switch so exploration always runs against your intended subset

### Join File

- **File ▸ Join File** opens a dialog to join the current table against an external file (CSV, TSV, or an Excel `.xlsx` sheet) and **materialize** the result as a new editable DuckDB table (`_fused_<timestamp>`)
- Join types: inner, left, right, outer; options for forcing a string cast and specifying the null-string placeholder

### Concatenate File

- **File ▸ Concatenate File** appends the rows of an external file (CSV/TSV/XLSX) to the current table and materializes the result as a new editable DuckDB table
- Columns are **auto-matched by name** (case-insensitive) and, when types differ, cast to a **common type using DuckDB's coercion rules** (`TRY_CAST` for safety)
- The dialog shows the full column mapping — matched, original-only, and new columns — with a live indication when a cast is applied, a **+** button for custom mappings, and a **per-column null-string** input
- MTad's internal columns (e.g. `_rid`, `Rec`) are excluded from the concatenated result

### Virtual Tables

- Create virtual tables from CSV files with automatic type detection

# Installing MTad

The easiest way to install the MTad desktop app is to build from source. See [Building from Source](#building-mtad-from-source) below.

For pre-packaged releases of the original Tad, see [The Tad Landing Page](http://tadviewer.com/#news) or the [releases](./releases) page.

# Building MTad from Source

## Pre-requisites

- [Node.js](https://nodejs.org/) v20 or later
- npm (included with Node.js)
- Lerna (installed via npm)

## Quick Start

```bash
# Clone the repository
git clone https://github.com/renoust-ids/mtad.git
cd tad

# Install dependencies and build
./run.sh --reltab
```

This will:
1. Bootstrap all monorepo packages via Lerna
2. Build the reltab SQL generation layer
3. Build tadviewer and tad-app bundles

## Development Workflow

### Using run.sh (Recommended)

```bash
# Full build (bootstrap + reltab + bundles)
./run.sh --reltab

# Quick rebuild (skip bootstrap if already done)
./run.sh --reltab
```

### Manual Build Steps

```bash
# Bootstrap packages
npx lerna bootstrap --force-local --hoist --no-ci

# Build reltab (SQL generation layer)
cd packages/reltab && npx tsc -p tsconfig-build.json

# Build tadviewer (React component)
cd ../tadviewer && npx webpack --mode production

# Build tad-app (Electron desktop app)
cd ../tad-app && npx webpack --mode production
```

### Running in Development

```bash
# Launch the app with reltab backend
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

## Logs

Log files (via [electron-log](https://www.npmjs.com/package/electron-log)):

- macOS: `~/Library/Logs/mtad/main.log`
- Linux: `~/.config/mtad/main.log`
- Windows: `%USERPROFILE%\AppData\Roaming\mtad\main.log`

## The Essential Packages

The core packages that are used to build MTad are found in the [packages](./packages) sub-directory. These are the packages
used to build the MTad desktop application:

- [**reltab**](./packages/reltab) - The core abstraction used in MTad for programmatically constructing and executing relational SQL queries. This also defines the driver interface implemented by specific database back-ends, and a small, transport-agnostic remoting layer to allow queries and results to be transmitted between a web browser
  (or electron renderer process) and a reltab backend server.
  - Key methods: `execSql()` for DML statements, `getSqlForQuery()` for SQL generation, `renameColumn()` for schema changes, `insertRow()` and `insertColumn()` for adding rows and columns
  - Binned and categorical single-column distribution queries, including temporal (date/time/timestamp) columns
  - Two-dimensional co-occurrence (confusion-matrix) queries via `getConfusionMatrixData()`
- [**reltab-duckdb**](./packages/reltab-duckdb/) -- reltab driver for DuckDb
- [**aggtree**](./packages/aggtree/) - A library built on top of reltab for constructing pivot trees from relational queries.
- [**tadviewer**](./packages/tadviewer/) - The core MTad pivot table UI as a standalone, embeddable React component.
  - Cell editing with double-click and right-click context menu
  - Insert rows and columns from the right-click context menus
  - Column rename via header context menu
  - Pivot-aware editing (aggregate rows vs leaf rows)
  - Multi-cell selections preserved on right-click; hover draws a thick border highlight
  - Interactive Distribution dialog (binned histograms, categorical bars, temporal columns) with brush-to-filter
  - Scatter Plot Matrix, Scatter Plot, and Confusion Matrix analytics dialogs with brush/click-to-filter
  - Join File and Concatenate File dialogs with auto column matching and type casting
  - Split Table / Analytics filters with live SQL summaries and apply toggles
- [**tad-app**](./packages/tad-app/) - The MTad desktop application, built with Electron

## Original Tad Packages

These packages are from the original Tad project and are maintained for compatibility:

- [**reltab-sqlite**](./packages/reltab-sqlite/) -- reltab driver for SQLite
- [**tadweb-app**](./packages/tadweb-app/) - A minimal web app built with [tadviewer](./packages/tadviewer/), to demonstrate Tad running in a web browser.
- [**tadweb-server**](./packages/tadweb-server/) - A reference web server for serving the Tad web app and providing the reltab back end.
- [**reltab-aws-athena**](./packages/reltab-aws-athena/) - reltab driver for AWS Athena
- [**reltab-bigquery**](./packages/reltab-bigquery/) - reltab driver for Google BigQuery
- [**reltab-snowflake**](./packages/reltab-snowflake/) - reltab driver for Snowflake
