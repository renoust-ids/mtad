# Agent Dev Log — Concatenate File feature

Branch: `concatenate`

## Step 1 — Branch + research
- Created branch `concatenate` (`git checkout -b concatenate`).
- Explored Join File (`joinCsv`) feature end-to-end to mirror architecture:
  - reltab: `JoinCsvArgs`/`JoinCsvQueryRep` in `QueryRep.ts`, `joinCsv()` in `QueryExp.ts`, `joinCsvGetSchema` in `getSchema.ts`, `joinCsvQueryToSql` in `toSql.ts` + `SQLFromCsvJoin` in `SQLQuery.ts` + pp.ts rendering.
  - tadviewer: `JoinCsvDialogState` in `AppState.ts`, actions in `actions.ts` (`confirmCsvJoin`), `JoinCsvDialog.tsx`, mounted in `AppPane.tsx`.
  - tad-app: menu in `appMenu.ts`, IPC in `app/main.ts` and `src/electronRenderMain.tsx`.
- Type system: `ColumnType.ts` (`ColumnKind`), `DuckDBDialect.ts` `columnTypes` map, `Schema.ts` `ColumnMetadata` (`columnType` = SQL type name).
- Clarified design decisions with user (file formats, NULL handling, cast precedence = prefer original else widest wins with user override + null-on-error, exact case-insensitive name matching, per-column null string).

## Step 2 — reltab layer (in progress)
Adding `concatCsv` operator mirroring `joinCsv`.

## Step 3 — reltab layer (done)
Completed the `concatCsv` operator in reltab:
- `ConcatCsvArgs` + `ConcatCsvQueryRep` in `QueryRep.ts`
- `concatCsv()` method in `QueryExp.ts`
- `concatCsvGetSchema` in `getSchema.ts`
- `concatCsvQueryToSql` in `toSql.ts`
- `SQLFromCsvConcat` in `SQLQuery.ts` (adds `rawSql` field to `SQLSelectListItem`)
- `pp.ts` handles `csvConcat` expType
- `reltab.ts` exports new types
- Test file: `packages/reltab/test/concatCsv.test.ts` (9 tests, all passing)

## Step 4 — View layer (mostly done)
Backend `concatCsv` support is complete and all reltab tests pass (62/62).

UI layer implemented:
- `AppState.ts`: Added `ConcatCsvDialogState` + `ConcatCsvMapping` interfaces
- `utils/concatColumnMatcher.ts`: Column matching + type widening logic
- `actions.ts`: Added all concatCsv dialog actions (`openConcatCsvDialog`, `setConcatCsvPath`, `confirmConcatCsv`, etc.)
- `components/ConcatCsvDialog.tsx`: The dialog UI
- `components/AppPane.tsx`: Mounted the dialog
- `appMenu.ts`: Added "Concatenate File..." menu item
- `electronRenderMain.tsx`: Added IPC handler + `onConcatCsvConfirmed`
- `main.ts`: Enhanced `getCsvHeaders` to return types for CSV/xlsx

## Step 5 — Fix: exclude MTad internal columns from result
After testing, the concatenation included MTad's internal `_rid` and `Rec` columns in the result. Fixed in commit `d0c0602`:

- **`electronRenderMain.tsx`**: filter out `Rec` and any `_`-prefixed column (e.g. `_rid`, `_depth`, `_pivot`, `_isRoot`) when building the `originalColumns` map passed to the concat dialog. This prevents `_rid`/`Rec` from being auto-matched as candidate columns in the dialog.
- **`actions.ts` (`confirmConcatCsv`)**: filter `displayColumns` in the created `ViewParams` to exclude `_`-prefixed and `Rec` columns, so the new view only shows real data columns.

The reltab backend only selects columns present in `args.outputColumns`, so once the UI stops offering `_rid`/`Rec`, they never appear in the materialized table. A fresh internal `_rid` is re-added by DuckDB/MTad when the new table is loaded (correct behavior).

## Final State
All commits are in place on branch `concatenate`:
- `31ab6b9` - `feat(reltab): add ConcatCsv AST node and SQL generation`
- `cee1cdd` - `feat(tad-app): add Concatenate File dialog and menu`
- `d0c0602` - `fix(tad-app): exclude MTad internal columns from concatenate dialog and result`

La mission est close : la fonctionnalité **Concatenate File...** est complète (backend + UI), testée (62 tests reltab passent), et la documentation (`vibe-instructions.md` + `AGENT_DEV_LOG.md`) est à jour.

Le plan d'implémentation est archivé dans `vibe/concatenate/CONCATENATE_FILE_PLAN.md`.

All 62 reltab tests pass. Typecheck passes for tadviewer and tad-app.

### Feature Summary
The "Concatenate File..." feature allows users to append rows from an external file to their current table:
- **Menu**: File → Concatenate File...
- **Dialog**: Auto-opens file picker, shows column mapping table with auto-matched columns
- **Matching**: Case-insensitive column name matching with type widening (DuckDB casting rules)
- **Casting**: TRY_CAST used for safety, casting shown in the dialog with warning tag
- **Custom mapping**: "+" button to add custom mappings
- **Null values**: Per-column null string specification
- **Result**: Materializes into a new editable table with all columns available (internal `_rid`/`Rec` excluded)

### Files Created
- `packages/tadviewer/src/utils/concatColumnMatcher.ts` - column matching + type widening logic
- `packages/tadviewer/src/components/ConcatCsvDialog.tsx` - the concatenation dialog UI
- `packages/reltab/test/concatCsv.test.ts` - backend tests for the concatCsv operator
