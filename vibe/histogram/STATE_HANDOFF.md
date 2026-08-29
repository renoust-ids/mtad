# STATE HANDOFF - Histograms

## Current State
- **Branch** : `histograms` (créé depuis master / v0.0.4)
- **Status** : plan + instructions rédigés dans `vibe/histogram/` (mission, global_plan), dev log en cours. Step 1 (backend reltab) à démarrer.
- **Dernier commit** : (à remplir après le commit des docs)

## Goal
Item "Histogram" dans le menu contextuel d'en-tête de colonne → dialog interactif : histogramme numérique (options bins / log Y / nulls, brush → filtre colonne, panneau stats) ou bar chart catégoriel pour les colonnes non-numériques.

## Key Files
- `vibe/histogram/mission.md` — Mission
- `vibe/histogram/global_plan.md` — Plan d'implémentation
- `vibe/histogram/AGENT_DEV_LOG.md` — Journal de traçabilité
- `vibe/histogram/step1.md` … `step5.md` — Étapes

## Implementation Order
1. **Step 1** — Backend reltab : `getSingleColumnHistogramData` + `getColumnFrequencyData` (TDD, mock DbDriver, tests `test/histogram.test.ts`)
2. **Step 2** — Actions tadviewer : état dialog AppState + fetch à la demande (`openColumnHistogram` / `closeColumnHistogram` / helper de chargement)
3. **Step 3** — UI `HistogramDialog.tsx` : graphe Victory interactif (brush), options bins/log/nulls, panneau stats, support catégoriel
4. **Step 4** — Menu contextuel : item "Histogram" dans `onHeaderContextMenu` (DataGrid) + prop `onColumnHistogram` + wiring GridPane
5. **Step 5** — Docs (README/doc/quickstart/site), trigger CI `histograms`, E2E utilisateur, push

## Key Technical Context
- Fondation histogrammes DÉJÀ présente dans le fork (héritée de Tad) :
  - `packages/reltab/src/histogram.ts` : `Bin`, `binsForColumn` (Sturges), `columnHistogramQuery`, `getNumericColumnHistogramData`, `ColumnHistogramMap`, `getColumnHistogramMap`.
  - `ColumnStats`: `NumericSummaryStats { statsType, min, max, approxUnique, count, pctNull }`, `TextSummaryStats`, `ColumnStatsMap`.
  - `dsConn.getColumnStatsMap(query: QueryExp): Promise<ColumnStatsMap>` (DbDataSource + remote).
  - `NumericColumnHistogram` (Victory + `VictoryBrushContainer`) dans `DataGrid.tsx` (mini-charts header row, pilotés par `viewParams.showColumnHistograms`).
  - Actions existantes : `setHistogramBrushFilter(cid, range, stateRef)`, `setHistogramBrushRange`, `setShowColumnHistograms`, `toggleShowColumnHistograms`.
  - `viewState.queryView?.histoMap`, `viewState.baseSchema`, `viewState.baseQuery` dispo dans GridPane.
- Connexion reltab depuis actions : `appState.rtc.connect(sourceId)` → `rt` (DataSourceConnection) avec `evalQuery` / `getColumnStatsMap`.
- `victory@^36.6.10` déjà dépendance de `tadviewer`.
- Dialog Blueprint pattern : `CellEditModal.tsx`, `JoinCsvDialog.tsx`.
- `Schema` ctor : `(dialect, columns, columnMetadata)` ; `DuckDBDialect` = singleton (`getInstance()`).

## Conventions
- Commit : `feat(reltab): …` / `feat(tadviewer): …` / `docs: …`. Commits atomiques (backend ≠ UI).
- Build : reltab → `npx tsc -p tsconfig-build.json` + `npm test` ; tadviewer → `npx tsc` + `npx webpack --env prod --mode production`.
- Docs mission dans `vibe/histogram/`.

## Next Step
Démarrer **Step 1** : helpers reltab par colonne avec TDD (voir `vibe/histogram/global_plan.md`).