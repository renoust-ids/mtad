# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Automatic release notes: each GitHub release now lists the feature summary for its version, extracted from this changelog by the release workflow.

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

[Unreleased]: https://github.com/renoust-ids/mtad/compare/v0.0.7...HEAD
[0.0.7]: https://github.com/renoust-ids/mtad/compare/v0.0.6...v0.0.7
[0.0.6]: https://github.com/renoust-ids/mtad/compare/v0.0.5...v0.0.6
[0.0.5]: https://github.com/renoust-ids/mtad/compare/v0.0.4...v0.0.5
[0.0.4]: https://github.com/renoust-ids/mtad/compare/v0.0.3...v0.0.4
[0.0.3]: https://github.com/renoust-ids/mtad/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/renoust-ids/mtad/releases/tag/v0.0.2