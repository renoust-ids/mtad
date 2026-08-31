# STATE HANDOFF - SPLOM (Scatter Plot Matrix)

## Current State
- **Branche active** : `master` (spec SPLOM en cours d'écriture dans `vibe/splom/`). La branche `feat/splom` n'existe pas encore.
- **HEAD master** : `cf9dacd` — `docs: record histogram merge, docs and v0.0.5 release in dev log`. Release `v0.0.5` (histograms/Distribution) fusionnée ; arbre propre.
- **Statut** : **Phase SPEC terminée** — 5 fichiers créés dans `vibe/splom/` (mission, spec détaillée, plan, handoff, log). Aucune implémentation démarrée.

## Goal
Item **SPLOM** ("Scatter Plot Matrix") dans le menu **Analytics** → dialog interactif : matrice N×N (sélection manuelle numeric/temporal/catégoriel), master-detail au clic, brush rectangulaire 2D → filtre analytics, diagonale → Distribution, tooltips, corrélation de Pearson (SQL `corr()`), couleur par colonne catégorielle, log par paire, échantillonnage.

## Decision Summary (validé par l'utilisateur)
1. Layout : **matrice N×N + master-detail**.
2. Colonnes : **sélection manuelle complète**, catégorielles incluses (seuil min d'occurrences pour cacher les catégories rares).
3. Interactions (toutes) : master-detail, brush 2D → filtre, diagonale → Distribution, tooltips, corrélation r (texte + fond coloré), colorer par catégorie, contrôle d'échantillonnage, log par paire.
4. Corrélation : **SQL par paire** via `corr()`/`regr_*` DuckDB.
5. Menu : **Analytics seulement**. Libellé : **"Scatter Plot Matrix"**.
6. Temporelles : converties en **epoch-secondes**, labels formatés (pattern `fmtX`).
7. **Ouverture : sélection vide** (message "Select at least 2 numeric or temporal columns" ; pas de présélection).

## Key Files
- `vibe/splom/mission.md` — mission (objectifs + décisions)
- `vibe/splom/spec.md` — **spec détaillée** (modèle de données, backend, actions, UI, wiring, interactions, risques)
- `vibe/splom/global_plan.md` — plan d'implémentation en 6 steps
- `vibe/splom/STATE_HANDOFF.md` — ce fichier
- `vibe/splom/AGENT_DEV_LOG.md` — journal de traçabilité

## Key Technical Context (découvert / à réutiliser)
- **reltab** :
  - `sqlQuery(sqlString)` = leaf SQL brut (`QueryExp.ts:355`), résolu par `DbDataSource.getLeafDepSchema` (`case "sql"` → `db.getSqlQuerySchema`). reltab-duckdb l'implémente via `describe <sql>`.
  - `evalQuery(query, offset?, limit?)` (`DataSource.ts:171`), `rowCount`, `getSqlForQuery`.
  - `histogram.ts` : `temporalValueQuery`, `getTemporalColumnNumericStats`, `getColumnFrequencyData` (fréquences catégorielles pour la couleur), `epoch(col())`, `sqlQuery`.
  - `AggFn` est un enum fermé (`avg|count|min|max|sum|uniq|null|nullstr`) → **pas de `corr` natif** : passer par `sqlQuery` brute + UNION ALL (CTE `__splom_src AS MATERIALIZED`).
  - `evalQuery` accepte offset/limit ; sample random = wrap `SELECT * FROM (<sql>) ORDER BY random() LIMIT n`.
  - Tests : pattern `test/histogram.test.ts` (mock `DbDriver` avec `getSqlQuerySchema` fourni).
- **reltab-duckdb** : `runSqlQuery` (`conn.all`), `getSqlQuerySchema` (`describe`), `getSqlQueryColumnStatsMap` (`summarize`). Agregats stats DuckDB : `corr(x,y)`, `regr_slope(y,x)`, `regr_intercept(y,x)`, `regr_r2(y,x)`, `regr_count`.
- **tadviewer** :
  - Dialog : `HistogramDialog.tsx` (pattern options apply-filters/log/nulls, tooltip `HoverInfo`, stats Tags, `fmtX` temporel, en-tête HTMLSelect colonnes).
  - Filtres : `ViewParams.analyticsFilterExp` + `applyAnalyticsFilters` (combinedFilterExp, footer tabs) ; actions `setHistogramBrushFilter`, `filterExpWithoutCol`, `epochToTemporalString` (bornes temporelles typées), `setCategoryHistogramFilter`.
  - État dialog : `AppState.histogramDialogColId` ; actions `openColumnHistogram/closeColumnHistogram`. AppState = `Immutable.Record(defaultAppStateProps)`.
  - `GridPane.tsx` rend `<HistogramDialog>` ; `DataGrid.tsx` menu contextuel en-tête (item "Distribution"). **Ne pas modifier** le menu contextuel (décision : Analytics seulement).
- **tad-app** : `appMenu.ts` `analyticsSubmenu` (~l.135, item Distribution → `webContents.send("open-column-histogram")`) ; `electronRenderMain.tsx` (~l.260, handler IPC).

## Implementation Order
1. ✅ **Spec** (`vibe/splom/*.md`) — fait (validé par l'utilisateur).
2. ✅ **Step 1** — Backend reltab `splom.ts` : données scatter + sampling (TDD).
3. ✅ **Step 2** — Backend reltab : matrice de corrélation SQL + régression (TDD).
4. ✅ **Step 3** — Actions tadviewer : état + `loadSplomData` + `setSplomBrushFilter`.
5. ⏳ **Step 4** — UI `SplomDialog` : matrice + options.
6. ⏳ **Step 5** — UI : master-detail, brush 2D, diagonale → Distribution, tooltips, log.
7. ⏳ **Step 6** — Wiring menu Analytics + IPC, docs, CI, E2E.

## Conventions
- Branche : `feature/splom` à créer (`git checkout -b feat/splom`). Commits atomiques Conventional Commits : `feat(reltab): ...`, `feat(tadviewer): ...`, `feat(tad-app): ...`, `docs: ...`.
- Build : reltab → `npx tsc -p tsconfig-build.json` + `npm test` ; reltab-duckdb → `npx tsc -p tsconfig-build.json` + `npx jest splom.auto.test.ts` ; tadviewer → `npx tsc` + `npx webpack --env prod --mode production`.
- TypeScript strict (pas de `any`), React fonctionnel + Hooks, modales Blueprint `<Dialog>`.
- Snapshot BigInt SUM pré-existants (`basic.auto.test.ts`) hors scope.

## Next Step
Démarrer **Step 4** : UI `SplomDialog.tsx` — sélecteur colonnes (checkboxes groupées, cap 10), Color by, Min freq, Sample + "Use all", Apply Table Filters, matrice N×N (diagonale mini-histo, scatters, annotations r + fond, tooltips), reload debounce sur `tableFilterKey`, ouverture vide "Select at least 2 numeric or temporal columns". Hash au commit : `06e63bb` (step 2), branche `feat/splom`.