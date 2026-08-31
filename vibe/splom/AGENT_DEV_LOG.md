# AGENT_DEV_LOG — Mission SPLOM

Journal de traçabilité : chaque action est consignée avec heure, fichiers, commandes, résultats, problèmes.

## 2026-08-31

### Étape SPEC — Prise de connaissance & questions design

**Heure** : ~01:30

**Actions** :
1. Lecture de `vibe-instructions.md` (rôle, règle TDD/commits/handoff, mission actuelle).
2. Lecture de `vibe/histogram/STATE_HANDOFF.md`, `mission.md`, `global_plan.md` (mission Distribution terminée, release `v0.0.5`).
3. Exploration du repo :
   - `packages/tad-app/app/appMenu.ts` (menu **Analytics** → item Distribution → IPC `open-column-histogram`, ~l.135).
   - `packages/tad-app/src/electronRenderMain.tsx` (handler IPC `open-column-histogram`, ~l.260).
   - `packages/tadviewer/src/components/HistogramDialog.tsx` (dialog interactif complet : brush → `setHistogramBrushFilter`, filtre catégoriel, options, tooltips, stats).
   - `packages/tadviewer/src/AppState.ts` (`histogramDialogColId`), `actions.ts` (`openColumnHistogram`, `setHistogramBrushFilter`, `filterExpWithoutCol`, `epochToTemporalString`, `loadColumnHistogramData`), `ViewParams.ts` (`analyticsFilterExp`, `applyAnalyticsFilters`, `combinedFilterExp`), `ViewState.ts`.
   - `packages/reltab/src/histogram.ts` (helpers bins/epoch/fréquences), `QueryExp.ts` (`extend/project/groupBy/join`, `sqlQuery(sql)` leaf à la l.355, `tableQuery`), `defs.ts` (`epoch`, `cast`, etc.), `ColumnType.ts` (`kindIsNumeric`, `isTemporal`), `AggFn.ts` (enum fermé, pas de `corr`), `DataSource.ts` (`evalQuery(query, offset, limit)`, `rowCount`, `getSqlForQuery`, `getLeafDepSchema` `case "sql"`).
   - `packages/reltab-duckdb/src/reltab-duckdb.ts` (`runSqlQuery`, `getSqlQuerySchema` via `describe`, `getSqlQueryColumnStatsMap` via `summarize`).
   - `doc/features.md` (documentation features existante), autres missions `vibe/improveui`, `vibe/joincsv` (conventions de specs).
4. **Questions design posées à l'utilisateur** (6, avec recommandations) → réponses :
   1. Layout : **matrice N×N + master-detail**.
   2. Colonnes : **sélection manuelle complète, catégorielles incluses** (avec seuil min d'occurrences).
   3. Interactions : **toutes** (master-detail, brush 2D → filtre, diagonale → Distribution, tooltips, corrélation r, colorer par catégorie, échantillonnage, log par paire).
   4. Corrélation : **SQL par paire** (`corr()` DuckDB).
   5. Menu : **Analytics seulement**.
   6. Temporelles : **converties en epoch**.

**Fichiers créés** :
- `vibe/splom/mission.md`
- `vibe/splom/spec.md` — spec détaillée (modèle de données, backend, actions, UI, wiring, interactions, perf, risques, fichiers concernés)
- `vibe/splom/global_plan.md` — plan en 6 steps
- `vibe/splom/STATE_HANDOFF.md`
- `vibe/splom/AGENT_DEV_LOG.md` (ce fichier)

**Commandes exécutées** :
- `ls`, `git status`, `git branch -a`, `git log --oneline -15` → succès (head `cf9dacd`, branche `master`, arbre propre).
- Grep/lectures multiples → succès.

**Problèmes rencontrés / décisions techniques** :
- `AggFn` fermé → **pas de `corr()` natif reltab** : solution = requête SQL brute via leaf `sqlQuery(...)` + UNION ALL sur une CTE `AS MATERIALIZED` (1 scan), résolue par `getSqlQuerySchema` (describe duckdb).
- `regr_slope(y, x)` : modèle "pente de y sur x" — à confirmer par test d'intégration.
- Brush 2D : `VictoryBrushContainer` ne fait que du 1D → composant custom `RectBrushOverlay` avec mapping pixels↔data via le domain Victory.
- `describe WITH ... UNION ALL ...` à valider en DuckDB (wrapper `SELECT * FROM (WITH ...) __s` en fallback).
- QueryParams vérifiés : aucun support 2D existant à réutiliser pour la matrice ; corrélation calculée sur **toutes** les lignes (pas sur l'échantillon).

**Résultat** : spec complète écrite. En attente de validation utilisateur avant implémentation (branche `feat/splom`, step 1 TDD).