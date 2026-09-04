# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.10] - 2026-09-04

### Added

- **Correlation Matrix** — **Analytics ▸ Correlation Matrix** renders an N×N heat-map of pairwise association indices between the columns you select (up to 24), one heading per table column, diagonal always 1.
  - **SPLOM measures** — numeric×numeric pairs use **Pearson `r`**, categorical×numeric pairs use **eta**, and categorical×categorical pairs use **Cramér's V**.
  - **Pearson / Spearman toggle** — a selector switches the numeric pairs to the **rank correlation** (Spearman, computed over ranked columns); categorical pairs keep eta/V unchanged.
  - **Sampling** — an optional random sample bounds the rows used for each index (**Sample** slider 500–20 000, recomputed when released); **Use all rows** disables it.
  - **Min non-null occurrence** — pairs with too few co-observed rows are blanked out.
  - **Unusable columns** — always-null, constant, and **ID-like** (all non-null values distinct) columns are excluded from the picker and listed as *Not usable (null / constant / ID)*.
  - **Remove on right-click** — a context-menu **Remove** action drops a row/column from the matrix; the matrix itself is **read-only** (no cell-click filtering).
- **reltab correlation layer** — `getCorrelationMatrix()` extended with `CorrelationMatrixOptions` (`rank`, `sampleLimit`, `minOccurrence`), a Spearman implementation, and `constantOrNullColIds()` for null/constant/ID-column detection, with unit tests.

## [0.0.9] - 2026-09-04

### Added

- **Concatenate File** — **File ▸ Concatenate File** appends the rows of an external file (CSV/TSV/Excel `.xlsx`) to the current table and materializes the result as a new editable DuckDB table.
  - **Auto column matching** — columns are matched by name (case-insensitive) in an interactive mapping dialog that lists matched, original-only, and new columns; a **+** button adds custom mappings.
  - **DuckDB type casting** — matched/new columns are cast to a common type using DuckDB's coercion rules (`TRY_CAST` so incompatible values become `NULL`), with the cast indicated live in the dialog.
  - **Per-column null string** — a placeholder text is mapped to `NULL` (compared as text before casting).
  - **Internal-column exclusion** — MTad bookkeeping columns (`_rid`, `Rec`, `_`-prefixed) are excluded from the result; a fresh `_rid` is re-added when the new table loads.
- **reltab `concatCsv` layer** — `concatCsv()` query operator (`ConcatCsvArgs`, SQL `UNION ALL` generation, schema inference) and `concatCsvGetSchema`, with unit + DuckDB integration tests.

## [0.0.8] - 2026-09-03

### Added

- **Confusion Matrix** — Analytics ▸ Confusion Matrix renders a co-occurrence (2D histogram) matrix between a chosen **row variable** and **column variable**. Numeric and temporal columns are auto-binned (adjustable row/col bin counts, default 5 on open), categorical columns use their distinct values as classes; each cell shows its count and is heat-mapped by value.
  - **Conditional modes** — toggle between raw count, row-normalized `P(col|row)`, and column-normalized `P(row|col)`.
  - **Minimum-occurrence threshold** — cells below the threshold are blanked (hidden) and excluded from the conditional normalization; empty rows/columns disappear as the bin count or threshold changes.
  - **Cell-click analytics filtering** — click any cell to filter the grid on both axes (a numeric/temporal bin range, or the categorical value); clicking the selected cell again removes the filter. Highlighting follows the distribution-selection color scheme.
  - **Apply Table Filters / Use all rows** switches, a **swap axes** button, and pivot-aware computation, mirroring the Scatter Plot dialog. Choosing the same column for both axes yields a within-column co-occurrence matrix.
- **reltab confusion-matrix layer** — `getConfusionMatrixData()` in `packages/reltab/src/confusionMatrix.ts` (exported from `reltab`), with unit tests and DuckDB integration tests.
- **SPLOM categorical association stats** — the matrix now reports `eta` for categorical×numeric pairs and Cramér's V for categorical×categorical pairs.
- **Soft check-for-updates** — a **Help ▸ Check for Updates** menu item points to the latest release page.

### Changed

- **Join File** — the "Join CSV" menu label was renamed to "Join File" to reflect the broader file-type support.
- **Release automation** — the CHANGELOG now drives per-version release notes, and GitHub releases are published automatically when a version tag is pushed.

### Fixed

- **Bare `TIME` values** — rendering a time-only column (e.g. from an Excel import) no longer logs spurious `Invalid time value` conversion errors.
- **`_rid` duplication** — table leaf schemas that already expose a `_rid` column no longer get a duplicate.
- **SPLOM regression line** — the trend line and regression stats are skipped when either operand is categorical.
- **`findDOMNode` deprecation** — the grid's Blueprint `ResizeSensor` was replaced with a ref-based `ResizeObserver`, removing one source of the deprecation warning.

### Chores

- Route xlsx inference-fallback logs through `loglevel`; remove stray debug `console.log` calls from the normal UI flow; stop auto-opening/closing DevTools on window creation; remove the redundant diagonal-distribution label in SPLOM.

## [0.0.7] - 2026-09-02

### Added

- **Excel (.xlsx) import** — open Excel workbooks as data sources, imported through DuckDB with native type inference (numeric, `TIMESTAMP`, `DATE`, `TIME`, string).
- **Worksheet picker** — when a workbook has several sheets, a picker dialog (and a sheet dropdown in the Join dialog) chooses which worksheet to open/join, routing each sheet to its own table.
- **Mixed-type column fallback** — if a column mixes types, per-column inference (`INTEGER`, `DOUBLE`, `TIME`, `TIMESTAMP`, `DATE`, else `VARCHAR`, empty → `NULL`) imports the whole sheet.
- **Excel joins** — the Join dialog now accepts `.xlsx` sheets alongside CSV/TSV files and materializes the joined result as an editable DuckDB table.

## [0.0.6] - 2026-09-01

### Added

- **Scatter Plot Matrix (SPLOM)** — Analytics ▸ Scatter Plot Matrix shows pairwise scatters across up to 10 numeric, temporal or categorical columns, with Pearson correlation annotations, categorical coloring, sampling, and a searchable multi-select.
- **Scatter Plot** — Analytics ▸ Scatter Plot (or an off-diagonal SPLOM cell) opens any single X/Y pair as a 2D scatter with 2D brush-to-filter, log X/Y toggles, linear regression trend line and stats row.
- **Strict Table / Analytics filter separation** — the footer uses two independent editors; table filters are set only manually, while analytics filters also come from View interactions (brushing, bar clicks).
- **Categorical-only SPLOM** — the matrix can be built from categorical-only column selections.

## [0.0.5] - 2026-08-31

### Added

- **Temporal Distribution charts** — the Distribution dialog charts date/time/timestamp columns with type-aware labels (`YYYY-MM-DD`, `HH:MM`, `YYYY-MM-DD HH:MM`).
- **Editable bin counts** — double-click the bin-count value to type a number directly; categorical charts get a min-frequency threshold to hide rare values.
- **Table & Analytics Filters split** — the footer separates the two filters into their own editors with live SQL summaries, apply toggles, and one-click clear buttons.

## [0.0.4] - 2026-08-29

### Added

- **Interactive column histograms** — right-click a column header (or Analytics ▸ Distribution) for a binned histogram with a bin-count slider, log scale, null bar, statistics panel, and brush-to-filter into the grid.

## [0.0.3] - 2026-08-27

### Added

- **Insert Row / Insert Column** — right-click a cell to append an empty row, or a column header to add a column with an auto-suggested unique name.
- **Hover highlight** — hovering a cell draws a thick dark-blue border instead of a fill, keeping values readable.
- **Selection-aware context menus** — right-clicking inside a multi-cell selection keeps the selection intact so delete/duplicate/copy act on the whole group.

## [0.0.2] - 2026-08-25

### Added

- **Cell editing** — double-click or right-click cells to edit with type-aware validation (dates, numbers, booleans, strings).
- **Pivot label editing** — rename pivot values across all occurrences ("Edit all").
- **Aggregate cell editing** — update grouped values with automatic group-by column awareness.
- **Column rename** — right-click a column header (`ALTER TABLE ... RENAME COLUMN`).
- **CSV join materialization** — join CSV files and materialize the result as a DuckDB table.
- **Cell context menu** — edit / edit-all options on right-click; improved date/time display formatting.

[Unreleased]: https://github.com/renoust-ids/mtad/compare/v0.0.10...HEAD
[0.0.10]: https://github.com/renoust-ids/mtad/compare/v0.0.9...v0.0.10
[0.0.9]: https://github.com/renoust-ids/mtad/compare/v0.0.8...v0.0.9
[0.0.8]: https://github.com/renoust-ids/mtad/compare/v0.0.7...v0.0.8
[0.0.7]: https://github.com/renoust-ids/mtad/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/renoust-ids/mtad/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/renoust-ids/mtad/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/renoust-ids/mtad/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/renoust-ids/mtad/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/renoust-ids/mtad/releases/tag/v0.0.2