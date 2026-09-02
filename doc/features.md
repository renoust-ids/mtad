# MTad Features

MTad is a fork of [Tad](https://www.tadviewer.com) that adds data editing and manipulation on top of the core pivot-table viewer. Every edit made in the grid is applied to the underlying in-memory [DuckDb](https://duckdb.org/) database through generated SQL, so analysis views and the data stay consistent.

## Viewing and Analysis (inherited from Tad)

- Open tabular data in several formats: `.csv`, `.tsv`, `.parquet`, `.xlsx`, `.duckdb`, `.sqlite`
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

## Distribution Dialog

The **Distribution** dialog (right-click a column header and choose **Distribution**, or use the **Analytics ▸ Distribution** menu) charts a single column on demand. It is computed directly from the underlying table (or from the grouped query on pivoted views), so it always reflects the current data.

The chart shape depends on the column type:

- **Numeric columns** (`integer`, `real`) get a **binned histogram**. The bin count can be adjusted with a live slider (double-click the value to type a number directly, within 2–50), with optional **log scale** and a **null bar**. A statistics panel shows count, nulls, unique, min, max, mean and std. Dragging (**brushing**) across the bars applies a numeric range filter to the grid.
- **Temporal columns** (`date`, `time`, `timestamp`) are binned over their epoch-second values and labeled (axis ticks, tooltips, min/max/mean) using type-aware formatting: `YYYY-MM-DD` for dates, `HH:MM` for times, `YYYY-MM-DD HH:MM` for timestamps.
- **Other columns** get a **categorical bar chart** of the most frequent values (top 20), with a **min-frequency** threshold (default 2% of row count) to hide rare values, a null bar, and click-to-select bars that filter the grid to the selected values (`IN` + `ISNULL` for the null bar).

Shared behaviors:

- Hovering a bar shows an overlay tooltip with the exact bin range (`123.45 – 130.00`) or the categorical value and its count.
- The **Apply Table Filters** switch (default on) computes the chart over the table-filtered subset of the data, so exploration always runs against your intended subset.
- On **pivoted views** the chart is computed over the aggregated query used by the view.

## Scatter Plot Matrix

The **Scatter Plot Matrix (SPLOM)** dialog (**Analytics ▸ Scatter Plot Matrix**) shows pairwise relationships across a user-selected set of columns in an N×N matrix. Pick which columns to include with a searchable multi-select dropdown (up to 10; numeric and temporal columns by default, categorical columns allowed) and optionally **color by** a categorical column.

- **Matrix cells** show one scatter per column pair. For numeric/temporal pairs the Pearson correlation is annotated in the corner (`r = …`) and the cell background is tinted by it (blue positive, red negative, gray near zero) in the upper triangle; categorical pairs plot the categories without a correlation. The matrix can be built from numeric, temporal, **and categorical** columns — including categorical-only selections.
- **Diagonal cells** show a mini distribution of the column; clicking one opens the **Distribution** dialog for it.
- **Off-diagonal cells** — clicking any off-diagonal scatterplot opens that X/Y pair in the standalone **Scatter Plot** dialog (mirroring how a diagonal cell opens a Distribution), with its full feature set: **2D brush** (filter the grid on both axes), **log X / log Y** toggles, the **linear regression** trend line and a stats row. Categorical axes are slot-encoded (each category an integer band with the category name as the tick label), so any column can be plotted against any other. The SPLOM stays open underneath, so closing the Scatter Plot returns directly to the matrix to continue exploring.
- Hovering a cell shows an overlay tooltip with the exact values under the cursor.
- **Sampling** (default 5 000 points, adjustable up to 20 000) bounds the number of points rendered, while the correlation matrix is always computed over the full data. **Use all rows** disables sampling.
- The **Apply Table Filters** switch (default on) computes the matrix over the table-filtered subset; a **min-frequency** slider trims rare categories in the **color by** legend.
- On **pivoted views** the matrix is computed over the aggregated query used by the view.

## Scatter Plot

The standalone **Scatter Plot** dialog (**Analytics ▸ Scatter Plot**) plots any single X/Y column pair as a 2D scatter, independent of the matrix. Choose the **X**, **Y**, and optional **Color by** columns with the dropdowns; numeric, temporal, and categorical columns can be placed on the axes (temporal columns are plotted in epoch seconds and labeled as dates).

- It is the same interactive chart that a SPLOM off-diagonal cell opens: a **2D brush** (filter the grid on both axes), **log X / log Y** toggles, the **linear regression** trend line and a stats row (`n`, `r`, `r²`, fitted line, per-axis ranges).
- **Categorical axes** are slot-encoded (each category is an integer band labeled with the category name), so any column — categorical included — can be plotted on either axis. Brushing a categorical axis filters to the brushed categories (an `IN` row in the Analytics Filters editor).
- **Color by** assigns each distinct value a palette color and renders a legend next to the plot.
- **Sampling** (default 5 000, adjustable up to 20 000) bounds the number of points; **Use all rows** disables sampling. The **Apply Table Filters** switch (default on) computes the plot over the table-filtered subset.

## Table & Analytics Filters

The footer splits filtering into two independent concepts:

- **Table Filters** — the filter that is saved with the view and drives the visible grid. It is filled **only through manual input** in the footer editor (never by View selections).
- **Analytics Filters** — ad-hoc filters created by exploration: brushing the Distribution dialog, brushing a Scatter Plot Matrix pair or a Scatter Plot, or clicking categorical bars. They are applied on top of the table filter (`filter AND analytics_filter`) and can be turned on/off with the **Apply Analytics Filters** checkbox in the footer. Every View selection funnels through a single shared entry point (`setAnalyticsClauses`) that **appends** the new criteria to the current analytics filter (an `AND` of all clauses), replacing only the clauses for the columns being re-selected while preserving criteria from other Views.

Footer behavior:

- Two tabs, **Table Filters** and **Analytics Filters**. Each tab opens its own dedicated editor form: the **Table Filter Editor** (`table-filter-editor` form class) and the **Analytics Filter Editor** (`analytics-filter-editor` form class), so the two editors remain strictly separated and independently styled/behaved. The table editor is the **only** way to populate the table filter; the analytics editor shares responsibility for its filter with View interactions (brushing, bar clicks).
- A live **SQL summary** under the tabs shows the current filter. Because Views fill the analytics filter, the summary defaults to it (prefixed `A: `) whenever it is non-empty, so each View selection is reflected immediately; otherwise it shows the active tab's filter. While hovering a tab or editing its filter, the summary is prefixed `T: ` (table) or `A: ` (analytics). Long summaries are cropped (56 chars, reduced by 4 when prefixed) so the prefix never changes the visible width.
- An **✕ icon** to the right of each tab clears that filter (table clear also propagates to the app-level `onFilter` callback).

## Excel Import

- Open `.xlsx` workbooks as data sources. The **first worksheet** is imported by default with DuckDB's type inference (numeric, `TIMESTAMP`, `DATE`, `TIME`, string).
- If the workbook has several sheets, a **worksheet picker** lets you choose which sheet to open (the open-flow sidebar prompts at click time; the Join dialog embeds a sheet dropdown).
- Sheets are imported with native DuckDB typing; when a column mixes types (e.g. mostly numeric with a stray string), MTad falls back to per-column inference so the whole sheet still imports (`INTEGER`, `DOUBLE`, `TIME`, `TIMESTAMP`, `DATE`, else `VARCHAR`).
- `.xlsx` (Excel 2007+ only) is supported; legacy `.xls` is not.

## Join & CSV Materialization

- Join a table against a CSV/TSV/Excel (`.xlsx`) file and **materialize** the result as a new editable DuckDB table (`_fused_<timestamp>`)
- The **Join** dialog accepts CSV, TSV, and Excel files; for a multi-sheet workbook a **sheet dropdown** selects the sheet to join against
- Join types: inner, left, right, outer. Options: `forceStringCast`, `nullString`
- Create **virtual tables** from CSV files with automatic type detection

## Under the Hood

| Feature | SQL executed by the reltab layer |
|--------|----------------------------------|
| Insert Row | `INSERT INTO "t" DEFAULT VALUES` |
| Insert Column | `ALTER TABLE "t" ADD COLUMN "c" VARCHAR` |
| Rename Column | `ALTER TABLE "t" RENAME COLUMN "a" TO "b"` |
| Binned histogram | `SELECT ... FROM "t" GROUP BY width_bucket("c", <niceMin>, <niceMax>, <bins>)` over the (optionally table-filtered) query |
| Temporal binned histogram | same query binned over `DATE_PART('epoch', "c")`; stats computed on the epoch conversion |
| Brush-to-filter | `WHERE "c" >= <min> AND "c" <= <max>` (typed literal for temporal columns, implicit DuckDB cast) |
| Categorical frequency | `SELECT "c", COUNT(*) GROUP BY "c" ORDER BY COUNT(*) DESC LIMIT 20` |
| Categorical bar filter | `WHERE "c" IN (...)` or `WHERE "c" IS NULL` |
| Analytics filters | combined with the table filter as `WHERE (table_filter) AND (analytics_filter)` |