# STATE HANDOFF - Improve UI

## Current State
- **Branch**: `improveui` (created from master v0.0.3)
- **Status**: Implementation complete (steps 1–9 done). Remaining: final commit cleanup of stray `examples/modified*.csv` and `package-lock.json` (left uncommitted).

## Goal
Implement UI improvements: column/row/cell manipulation via context menus and export options.

## Key Files
- `vibe/improveui/mission.md` — High-level mission
- `vibe/improveui/global_plan.md` — Implementation plan
- `vibe/improveui/step1.md` — Backend DataSourceConnection methods
- `vibe/improveui/step2.md` — Column context menu: Delete & Duplicate
- `vibe/improveui/step3.md` — Row operations from cell selection: Delete/Duplicate Rows
- `vibe/improveui/step4.md` — Aggregate row operations: Delete All / Duplicate All
- `vibe/improveui/step5.md` — Copy operations: Copy (cells) + Copy (rows)
- `vibe/improveui/step6.md` — Export: Visible columns + order checkboxes
- `vibe/improveui/step7.md` — Build & E2E testing
- `vibe/improveui/step8.md` — Rowid targeting: Edit/Duplicate/Delete on a precise row + pivot regression fix
- `vibe/improveui/step9.md` — Aggregate row duplication fix, sort by pivot label, context-menu label disambiguation

## Implementation Order
1. **Step 1** — Backend DataSourceConnection methods (reltab)
2. **Step 2** — Column context menu: Delete & Duplicate (tadviewer)
3. **Step 3** — Row operations: Delete/Duplicate Rows from cell selection (tadviewer)
4. **Step 4** — Aggregate row operations: Delete All / Duplicate All (tadviewer)
5. **Step 5** — Copy operations: Copy (cells) + Copy (rows) (tadviewer)
6. **Step 6** — Export: Visible columns + order checkboxes (tadviewer + tad-app)
7. **Step 7** — Build & E2E testing
8. **Step 8** — Rowid targeting (hidden `_rid` column) + pivot regression fix
9. **Step 9** — Aggregate row duplication fix + sort by pivot label + context-menu label disambiguation

## Key Technical Context
- **Selection**: CellSelectionModel active, `getSelectedRanges()` returns `[{fromCell, toCell, fromRow, toRow}]`
- **Copy existing**: `copySelectedRange(range)` in DataGrid.tsx handles Cmd+C
- **Clipboard**: `SimpleClipboard.writeText()` only write, no read
- **execSql**: Raw SQL execution via DataSourceConnection — all DDL/DML
- **Schema refresh**: After column operations, must re-fetch schema AND update ViewParams arrays
- **Row WHERE clause**: Use all non-metadata columns (Rec, _id, _parentId, _depth, _isOpen, _pivot, _isLeaf excluded)
- **Aggregate WHERE clause**: Use vpivots[0..depth-1] columns only
- **Leaf rowid targeting (Step 8)**: hidden `_rid` column = DuckDB `rowid` threaded to leaf DataView items. Leaf edit → `WHERE rowid = <rid>`; leaf duplicate/delete → `WHERE rowid IN (...)`. Aggregate/root rows carry `_rid = NULL` → fall back to value WHERE. `_rid` is BigInt → convert with `Number(...)`. Exclude `_rid` from aggMap/stats/histograms. `DataGrid` captures `item._rid` on BOTH context-menu and double-click edit paths.
- **Aggregate WHERE clause (Step 9)**: build from the aggregate row's `_path[i]` values mapped onto `vpivots[i]` (`buildAggregateRowWhere`); NOT from `item[col]` (that holds aggregated values on aggregate rows) and NOT empty for the root row (use `1=1`).
- **Sort by pivot label (Step 9)**: `_pivot` is a computed label with no base column — exclude it from the `_sortVal` mechanism and drive the per-depth `_path i` sort with the user's direction instead.
- **Context-menu labels (Step 9)**: pluralize by selection count — Delete/Duplicate/Copy Row(s), Copy Cell(s); column menus say "… Column"; leaf cell edit says "Edit Cell".

## Conventions
- Commit: `feat(tadviewer): ...` or `feat(reltab): ...`
- Each step = one commit
- Build: reltab → tsc, tadviewer/tad-app → webpack
