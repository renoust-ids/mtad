# STATE HANDOFF - Improve UI

## Current State
- **Branch**: `improveui` merged into `master` (merge commit `716f226`), pushed to origin. GitHub Actions run #26 (triggered by `improveui` push) completed **success** on mac/windows/linux; the `release` job was skipped (no `v*` tag). Steps 1–10 implemented AND E2E-validated by the user ("all works"). Documentation updated (README, Quick Start Guide, landing page, new `doc/features.md`). Next: optionally tag `v0.0.4` to trigger the auto-draft release.

## Goal
Implement UI improvements: column/row/cell manipulation via context menus and export options.

## Key Files
- `vibe/improveui/mission.md` — High-level mission
- `vibe/improveui/global_plan.md` — Implementation plan
- `vibe/improveui/step1.md` … `step9.md` — Steps 1–9
- `vibe/improveui/step10.md` — Insert Row/Column, hover border #5a6375, right-click multi-cell selection
- `vibe/improveui/AGENT_DEV_LOG.md` — Traceability log

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
10. **Step 10** — Insert Row (cell menu) / Insert Column (header menu + name dialog), hover = inset 2px #5a6375 border (no fill), right-click keeps multi-cell selection when hovering a selected cell

## Key Technical Context
- **Selection**: CellSelectionModel active, `getSelectedRanges()` returns `[{fromCell, toCell, fromRow, toRow}]`
- **Copy existing**: `copySelectedRange(range)` in DataGrid.tsx handles Cmd+C
- **Clipboard**: `SimpleClipboard.writeText()` only write, no read
- **execSql**: Raw SQL execution via DataSourceConnection — all DDL/DML
- **Schema refresh**: After column operations, must re-fetch schema AND update ViewParams arrays
- **Row WHERE clause**: Use all non-metadata columns (Rec, _id, _parentId, _depth, _isOpen, _pivot, _isLeaf excluded)
- **Aggregate WHERE clause**: Use vpivots[0..depth-1] columns only
- **Leaf rowid targeting (Step 8)**: hidden `_rid` column = DuckDB `rowid` threaded to leaf DataView items. Leaf edit → `WHERE rowid = <rid>`; leaf duplicate/delete → `WHERE rowid IN (...)`. Aggregate/root rows carry `_rid = NULL` → fall back to value WHERE. `_rid` is BigInt → convert with `Number(...)`. Exclude `_rid` from aggMap/stats/histograms. `DataGrid` captures `item._rid` on BOTH context-menu and double-click edit paths.
- **Aggregate WHERE clause (Step 9)**: build from the aggregate row's `_path[i]` values mapped onto `vpivots[i]` (`buildAggregateRowWhere`); NOT from `item[col]` and NOT empty for the root row (use `1=1`).
- **Sort by pivot label (Step 9)**: `_pivot` excluded from `_sortVal`; user direction drives per-depth `_path i` sort.
- **Context-menu labels (Step 9)**: pluralized by selection count; column menus say "… Column".
- **Step 10 backend**: `insertRow` = `INSERT INTO "t" DEFAULT VALUES`; `insertColumn` = `ALTER TABLE "t" ADD COLUMN "c" VARCHAR` + schema cache invalidation. Wired through remote transport (`Connection.ts` req types, `server.ts` handlers).
- **Step 10 UI**: cell menu has "Insert Row"; header menu has "Insert Column" → Blueprint name dialog (suggested unique name `{col}_new` / `new_column[_N]` via `genUniqueColumnName` in GridPane).
- **Step 10 right-click**: `onContextMenu` keeps selection if hovered cell is inside a selected range, else collapses to that cell (so menus act on the whole group).
- **Step 10 hover**: `slickgrid.scss` — hover uses `background-color: transparent; box-shadow: inset 0 0 0 2px #5a6375` instead of `#b5c7eb` fill; `:hover.selected` keeps fill + hover border.

## Conventions
- Commit: `feat(tadviewer): ...` or `feat(reltab): ...`
- Each step = one commit
- Build: reltab → tsc, tadviewer/tad-app → webpack