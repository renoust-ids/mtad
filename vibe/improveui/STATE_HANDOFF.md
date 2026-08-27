# STATE HANDOFF - Improve UI

## Current State
- **Branch**: `improveui` (created from master v0.0.3)
- **Status**: Planning complete, awaiting implementation

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

## Implementation Order
1. **Step 1** — Backend DataSourceConnection methods (reltab)
2. **Step 2** — Column context menu: Delete & Duplicate (tadviewer)
3. **Step 3** — Row operations: Delete/Duplicate Rows from cell selection (tadviewer)
4. **Step 4** — Aggregate row operations: Delete All / Duplicate All (tadviewer)
5. **Step 5** — Copy operations: Copy (cells) + Copy (rows) (tadviewer)
6. **Step 6** — Export: Visible columns + order checkboxes (tadviewer + tad-app)
7. **Step 7** — Build & E2E testing

## Key Technical Context
- **Selection**: CellSelectionModel active, `getSelectedRanges()` returns `[{fromCell, toCell, fromRow, toRow}]`
- **Copy existing**: `copySelectedRange(range)` in DataGrid.tsx handles Cmd+C
- **Clipboard**: `SimpleClipboard.writeText()` only write, no read
- **execSql**: Raw SQL execution via DataSourceConnection — all DDL/DML
- **Schema refresh**: After column operations, must re-fetch schema AND update ViewParams arrays
- **Row WHERE clause**: Use all non-metadata columns (Rec, _id, _parentId, _depth, _isOpen, _pivot, _isLeaf excluded)
- **Aggregate WHERE clause**: Use vpivots[0..depth-1] columns only

## Conventions
- Commit: `feat(tadviewer): ...` or `feat(reltab): ...`
- Each step = one commit
- Build: reltab → tsc, tadviewer/tad-app → webpack
