# MTad Features

MTad is a fork of [Tad](https://www.tadviewer.com) that adds data editing and manipulation on top of the core pivot-table viewer. Every edit made in the grid is applied to the underlying in-memory [DuckDb](https://duckdb.org/) database through generated SQL, so analysis views and the data stay consistent.

## Viewing and Analysis (inherited from Tad)

- Open tabular data in several formats: `.csv`, `.parquet`, `.duckdb`, `.sqlite`
- Hierarchical **pivot tables** — group rows by one or more pivot columns and compute aggregates (sum, avg, min, max, uniq, ...) for the other columns
- **Filters** — compound predicates built from logical operators (AND / OR) and per-column comparisons
- **Sorting** — single and multi-column sorts, ascending or descending
- Column **reordering** via drag-and-drop
- **Column formatting** — set decimal places and other per-column (or per-type) display properties
- **Data Sources sidebar** — browse open directories, databases, and tables
- Export filtered results as CSV or Parquet

## Cell Editing

- **Double-click** or right-click any cell and choose **Edit Cell** to edit its value in a dialog with type-aware validation (dates, numbers, booleans, strings)
- On pivot-tree rows, **Edit all** renames the pivot label everywhere it occurs
- On aggregate rows, editing an aggregate cell updates the grouped value with automatic group-by column awareness

## Row & Column Manipulation

- **Insert Row** — right-click any cell and choose **Insert Row** to append a new empty row to the table (`INSERT INTO ... DEFAULT VALUES`)
- **Insert Column** — right-click a column header and choose **Insert Column** to add a new empty column (`ALTER TABLE ... ADD COLUMN ... VARCHAR`). A dialog suggests a unique name (e.g. `column_new`, `new_column`, `new_column_2`, ...) which can be edited before confirming
- **Rename Column** — right-click a column header and choose **Rename Column** (`ALTER TABLE ... RENAME COLUMN ... TO ...`)
- Columns can be reordered by dragging their headers

## Row Operations (cell context menu)

- **Delete Row(s)** — delete the selected row(s)
- **Duplicate Row(s)** — duplicate the selected row(s)
- **Copy Cell(s) / Copy Row(s)** — copy the selected cells or rows to the clipboard (rows copy as tab-separated values including a header row)
- **Insert Row** — append a new empty row
- On aggregate rows: **Delete All Aggregate Rows** and **Duplicate All Aggregate Rows**

## Grid Interaction

- **Hover highlight** — hovering a cell draws a thick dark-blue border around it (instead of a fill), so the underlying value stays readable at all times
- **Selection-aware right-click** — right-clicking a cell that is part of an existing multi-cell selection keeps the selection intact; context-menu actions (delete, duplicate, copy, ...) act on the whole selected group rather than collapsing to the clicked cell

## CSV Materialization

- Join multiple CSV files and **materialize** the result as a new DuckDB table
- Create **virtual tables** from CSV files with automatic type detection

## Under the Hood

| Feature | SQL executed by the reltab layer |
|--------|----------------------------------|
| Insert Row | `INSERT INTO "t" DEFAULT VALUES` |
| Insert Column | `ALTER TABLE "t" ADD COLUMN "c" VARCHAR` |
| Rename Column | `ALTER TABLE "t" RENAME COLUMN "a" TO "b"` |