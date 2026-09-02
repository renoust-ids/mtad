# Confusion Matrix View — Implementation Plan

Branch: `confusion_matrix`
Status: **design approved, implementation not started**

## Objective

Add a new analytics view, **Confusion Matrix**, analogous to the existing Scatter Plot
dialog. The user picks a **row variable** and a **column variable**; the view renders a
matrix of the co-occurrence between their classes (categories or numeric bins), with:

- a count in every non-empty cell,
- a color mapping of cells by value,
- a configurable minimum-occurrence threshold,
- numeric columns auto-binned with an adjustable bin count,
- a mode toggle to switch between the raw co-occurrence matrix and a **conditional
  (asymmetric) frequency** matrix.

## Confirmed design decisions (from user)

1. **Row/column roles**: two independent axis selectors (Row / Column). Choosing the
   **same column for both** is allowed → produces the symmetric within-column
   co-occurrence matrix (off-diagonal = number of rows sharing that pair of values).

2. **Minimum-occurrence threshold**: **mask + drop from normalization**. A cell below
   the threshold is blanked (shown empty/dim, value hidden) *and* excluded from the
   conditional/row-or-column-normalized percentages, so remaining cells renormalize over
   kept cells only.

3. **Conditional mode**: **both, selectable**. A toggle chooses between:
   - **Row-normalized**: `P(col | row)` = count / row total (rows sum to 1).
   - **Column-normalized**: `P(row | col)` = count / column total (columns sum to 1).
   Toggling this switches the interpretation and makes the matrix asymmetric.

4. **Numeric aggregation**: **per-row count** — each data row contributes exactly 1 to
   the cell `(bin_row, bin_col)` it maps to (a standard 2D histogram). Binning is
   adjustable via the bin-count control.

## Feature scope

- Inputs: row variable, column variable (both optional; matrix renders once both pickers
  have a selected column), min-occurrence threshold, bin count (per numeric axis),
  conditional-mode selection, "Apply Table Filters", sampling / use-all-rows.
- Outputs: a grid of cells; each cell shows its value (count, or conditional frequency)
  and is colored by value. Class labels on both axes. Hidden (below-threshold) cells are
  blanked out.
- Numeric variables are binned (same "nice range" + integer bin-index approach as the
  existing histogram). Categorical variables use their distinct values as classes.
- The resulting reltab data must be testable (unit tests with a mocked driver + DuckDB
  integration tests).

## Architecture (mirrors existing analytics dialogs)

### 1. reltab data layer — `packages/reltab/src/confusionMatrix.ts`

New module, re-exported from `packages/reltab/src/reltab.ts`.

Public types & functions (tentative signatures, refine during implementation):

```
type CmAxisKind = "numeric" | "temporal" | "categorical";

interface CmBin { label: string; value: number | string; }
interface CmMatrixCell {
  rowBin: number;   // index into rowBins
  colBin: number;   // index into colBins
  count: number;    // raw co-occurrence count
  freq: number;     // conditional frequency (0..1) or null when blanked
}
interface ConfusionMatrixData {
  rowColId: string;
  colColId: string;
  rowKind: CmAxisKind;
  colKind: CmAxisKind;
  rowBins: CmBin[];
  colBins: CmBin[];
  cells: CmMatrixCell[];       // computed by caller from rows
  mode: "count" | "rows" | "cols";
  totalRows: number;           // = number of rows considered (per-row count)
  minOccurrence: number;
}

getConfusionMatrixData(
  dsConn, baseQuery, schema,
  rowColId, colColId,
  opts: {
    rowBinCount?, colBinCount?,
    minOccurrence,
    mode: "count" | "rows" | "cols",
    sampleLimit?, useAllRows?
  }
): Promise<ConfusionMatrixData>
```

Implementation outline:
- Determine axis kind via `splomColKind`/`columnKindIsNumeric` + `schema.columnType`.
- For each numeric/temporal axis, compute a bin spec (nice min/max/bin-width, bin count)
  reusing the histogram binning helpers (`binsForColumn`, `nice`, `binWidth`) so the two
  views agree. For categorical axes, collect the distinct values.
- Build one query that projects a derived `rowBin` and `colBin` integer index per row
  (numeric: `floor((cast(value,DOUBLE)-niceMin)/binWidth)`; categorical: slot index),
  then `groupBy(["rowBin","colBin"], [["count","__freq"]])`.
- Return raw `(rowBin, colBin, count)` triples. The actor layer composes bins/labels and
  computes conditional frequencies, applying the threshold.

### 2. tadviewer data loading — `packages/tadviewer/src/actions.ts`

- `openConfusionMatrix(stateRef)` / `closeConfusionMatrix(stateRef)` — set/clear a new
  AppState flag (analogous to `openScatterPlot`).
- `ConfusionMatrixViewData` interface + `loadConfusionMatrixData(dbc, query, schema,
  rowColId, colColId, opts)` wrapping `reltab.getConfusionMatrixData`.

### 3. AppState — `packages/tadviewer/src/AppState.ts`

Add `confusionMatrixDialogOpen: boolean` (default `false`) to `AppStateProps`,
`defaultAppStateProps`, and the `AppState` class.

### 4. Renderer entry — `packages/tad-app/src/electronRenderMain.tsx` + `appMenu.ts`

- Add an `Analytics` submenu item `label: "Confusion Matrix"` in `appMenu.ts` sending
  `webContents.send("open-confusion-matrix")`.
- Add `ipcRenderer.on("open-confusion-matrix", () => actions.openConfusionMatrix(stateRef))`.

### 5. Dialog component — `packages/tadviewer/src/components/ConfusionMatrixDialog.tsx`

Follows `ScatterPlotDialog.tsx` conventions:
- Blueprint `Dialog`; `HTMLSelect` row/column pickers over `availableCols` (non-`_`,
  non-`Rec`); columns tagged `(cat)` when categorical.
- Toolbar: bin-count `Slider` (numeric axes), min-occurrence `Slider`, conditional-mode
  toggle, "Use all rows", "Apply Table Filters" toggles.
- `useEffect` keyed on `[pairKey, rowBinCount, colBinCount, minOccurrence, mode,
  applyTableFilters, tableFilterKey, stateRef]`, resolving query/schema via
  `getViewQueryAndSchema()` (pivot-aware), calling `loadConfusionMatrixData`, with the
  standard `cancelled` cleanup flag and `error` render.
- Render the matrix as a CSS grid of cells; cell fill color maps to value via the
  existing categorical/color palette conventions; below-threshold cells blanked.

### 6. Mount — `packages/tadviewer/src/components/GridPane.tsx`

Mount `<ConfusionMatrixDialog .../>` next to the other three dialogs, plumbing `onClose`
and optionally a filter callback (reusing `setAnalyticsClauses` if cell-click filtering
is desired — decide in implementation).

### 7. Tests

- Unit: `packages/reltab/test/confusionMatrix.test.ts` — mocked `makeDriver`, `tableQuery`,
  `DbDataSource`; assert generated SQL shape (bin indices, group-by) and returned data
  mapping; cover numeric×numeric, cat×cat, numeric×cat, and same-column (A vs A).
- DuckDB integration: `packages/reltab-duckdb/test/confusionMatrix.auto.test.ts` — real
  in-memory DuckDB + a new `test/support/*.csv`; assert counts, binning, conditional
  frequencies, threshold blanking.

## Open implementation questions (to resolve during coding)

- Cell-click → filter: whether clicking a cell should push a row/column filter via
  `setAnalyticsClauses` (nice-to-have; default: no, keep scope tight).
- Rendering library: use CSS grid + filled rectangles (recommended) vs Victory heatmap
  rects. Recommend CSS grid for simplicity and fast repaint.
- Temporal binning labels: reuse existing epoch-based temporal binning from
  `histogram.ts` (`temporalValueQuery`) so TIME/DATE columns behave consistently.

## Rollout / verification

1. Implement reltab layer + unit tests, typecheck.
2. Implement DuckDB integration tests, run auto suite.
3. Implement tadviewer action/state/entry wiring + dialog component.
4. Rebuild `reltab` (for package consumers), typecheck `tadviewer`.
5. Manual smoke test in the app: open dialog from Analytics menu for numeric/cat/cat
   and A-vs-A, toggle mode and threshold, adjust bins.
6. Rebuild production bundle (`tadviewer` webpack then `tad-app`) so the fix shows in app.