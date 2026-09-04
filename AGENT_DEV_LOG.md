# CORRELATION MATRIX — Agent Dev Log

Branch: `correlation` (Feature: Correlation Matrix, version app 0.0.9)

## Step 5-8 — Dialog UI + wiring + menu + IPC (DONE)
- **Step 5** — `packages/tadviewer/src/components/CorrelationMatrixDialog.tsx` (nouveau) :
  - Props `{ appState, stateRef, onClose }` (aucun onFilter/onClearFilter, lecture seule).
  - Picker MultiSelect react-select réutilisé depuis la SPLOM (CheckboxOption, colGroupedOptions numeric/temporal vs categorical, `MAX_MATRIX_COLS=24`) ; colonnes null/constantes exclues des options + liste d'avis Tag "Always-null / constant".
  - Contrôles : HTMLSelect **Pearson / Spearman** (`rank`), Slider+NumericInput **Min non-null occurrences** (default 1), Switches **Use all rows** (sampleLimit `DEFAULT_SAMPLE=20000`) + **Apply Table Filters**.
  - `useEffect` recharge sur `matrixKey`/`rank`/`curMinOcc`/`useAllRows`/`applyTableFilters`/`tableFilterKey`/`stateRef`, guard `selectedCols.length >= 2`; `loadCorrelationMatrixData(...)` avec `{rank, sampleLimit: useAllRows?0:DEFAULT_SAMPLE, minOccurrence}`.
  - Grille heat-map `cellColor` (diagonale 1.00, symétrique, `CorrCell` affiche valeur arrondie 3 décimales + `n` en tooltip, case vide si `strength==null`).
- **Step 6** — `packages/tadviewer/src/components/GridPane.tsx` : import `CorrelationMatrixDialog` (l.18), `handleCloseCorrelationMatrix`, montage `<CorrelationMatrixDialog appState stateRef onClose>` (après ConfusionMatrix), guard mémoïsation `gridPanePropsEqual` + `correlationMatrixDialogOpen`.
- **Step 7** — `packages/tad-app/app/appMenu.ts` : `analyticsSubmenu` + "Correlation Matrix" → `open-correlation-matrix` (après Confusion Matrix).
- **Step 8** — `packages/tad-app/src/electronRenderMain.tsx` : `ipcRenderer.on("open-correlation-matrix", () => actions.openCorrelationMatrix(stateRef))`.
- **Vérif** : 
  - `npm run build-dev`-ish de tadviewer : `npx tsc` (dist modules) + `npm run build-prod` (webpack bundle `dist/tadviewer.js`) — nécessité de re-`cp src/slickgrid.scss dist/slickgrid.scss` après `npx tsc` (tsc vide outDir, voir note infra).
  - `npx tsc --noEmit` tadviewer OK ; `npx tsc --noEmit` tad-app OK (après rebuild dist tadviewer — actions/AppState compilés).
  - `cd packages/tad-app && npm run build-prod` → **webpack compiled successfully**.
  - `cd packages/reltab && npm test` → **72 pass**.
  - **Note** : `npx tsc` dans tadviewer vide `outDir` (`dist`) et supprime les assets non-TS (`slickgrid.scss`, html/public). Restaurer avec `cp src/slickgrid.scss dist/slickgrid.scss` + `npm run build-prod` (webpack tadviewer) avant le build tad-app.

**Commands** : `git add` (fichiers source UI/menu/IPC, hors dist/hors xlsx) → commit.

## Step 3-4 — AppState + actions (DONE)
- `packages/tadviewer/src/AppState.ts`: added `correlationMatrixDialogOpen: boolean` (interface ~l.134, default `false` ~l.163, class property `public readonly ...!: boolean` ~l.194). No data fields (dialog state is local).
- `packages/tadviewer/src/actions.ts`: added Correlation Matrix block before Join CSV:
  - `openCorrelationMatrix(stateRef)` / `closeCorrelationMatrix(stateRef)` (pattern openSplom, guard viewState != null).
  - `CorrelationMatrixViewData { data: reltab.PairCorrelation[]; constantOrNullColIds?: string[] }`.
  - `loadCorrelationMatrixData(dbc, query, schema, colIds, opts)` — `Promise.all` of `reltab.getCorrelationMatrix(...)` + `reltab.constantOrNullColIds(...)`.
- **No filter actions** (matrix read-only by design).
- **Result**: `npx tsc --noEmit -p tsconfig.json` in tadviewer passes.

**Commands**: `git add packages/tadviewer/src/AppState.ts packages/tadviewer/src/actions.ts` → commit.

## Step 1-2 — Backend reltab (DONE)
Extended `packages/reltab/src/splom.ts` [TDD] to support the Correlation Matrix options:
- Added `CorrelationMatrixOptions { rank?, sampleLimit?, minOccurrence? }` interface.
- Added `pairwiseRankCorrelationSql(baseSql, pairs)` — Spearman rank correlation: ranks each operand via `rank() OVER (ORDER BY ...)` (DuckDB assigns average ranks for ties) inside a MATERIALIZED CTE, then `corr()` on the ranked columns; same single-scan batched structure as `pairwiseCorrelationSql`.
- Extended `getCorrelationMatrix(dsConn, baseQuery, schema, matrixColIds, opts?)`:
  - `rank: true` → uses `pairwiseRankCorrelationSql` for numeric/temporal pairs (eta/V categorical pairs unchanged).
  - `sampleLimit > 0` → wraps the scatter source in `SELECT * FROM (...) __splom_s ORDER BY random() LIMIT n` so the correlation is computed over the sample.
  - `minOccurrence > 0` → forces `strength`/`r` to `null` for pairs with `n < minOccurrence`.
- Added `constantOrNullColIds(dsConn, baseQuery, schema, colIds)` — one `UNION ALL` query batched over the columns; counts `count(col)` and `count(DISTINCT col)`; returns ids with zero non-null or ≤1 distinct value (always-null / constant), for exclusion from the picker + advisory list.
- Tests (new in `packages/reltab/test/splom.test.ts`): rank SQL structure, Spearman mode routing, rank leaves eta unchanged, min-occurrence blanking (below/above), sampleLimit wraps source with `ORDER BY random() LIMIT n`, constantOrNullColIds detection, empty selection.

**Result**: `cd packages/reltab && npm test` → **72 passed** (62 before + 10 new). `npm run build` passes. Commands: `git add packages/reltab/src/splom.ts packages/reltab/test/splom.test.ts packages/reltab/src/reltab.ts`.

---
# ARCHIVE — Concatenate File feature (previous mission)


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
