# Plan de réalisation : Scatter Plot Matrix (SPLOM)

Suivre la spec `vibe/splom/spec.md` (décisions validées par l'utilisateur).

## Objectif global
Item "Scatter Plot Matrix" dans le menu Analytics → dialog interactif : matrice N×N (sélection manuelle, numeric/temporal/catégoriel), master-detail au clic, brush 2D → filtre, diagonale → Distribution, tooltips, corrélation SQL, couleur par catégorie, log par paire, échantillonnage.

## Architecture cible

```
Analytics ▸ Scatter Plot Matrix (appMenu.ts)
  └─ IPC "open-splom" → electronRenderMain.tsx → actions.openSplom(stateRef)
      └─ AppState.splomDialogOpen = true
          └─ GridPane.tsx → <SplomDialog appState stateRef onClose onBrushFilter onOpenDistribution>

reltab (backend, nouveau, TDD)
  splom.ts
    ├── splomColKind(ct)
    ├── splomScatterQuery(baseQuery, schema, matrixColIds, colorColId?)
    ├── getScatterPlotData(dsConn, baseQuery, schema, opts)   // points + sample
    ├── pairwiseCorrelationSql(baseSql, pairs)                 // SQL corr() UNION ALL + CTE
    ├── getCorrelationMatrix(dsConn, baseQuery, schema, cols)
    ├── getPairRegression(dsConn, baseQuery, schema, xCol, yCol)
    └── (réutilise getColumnFrequencyData pour les couleurs)
  test/splom.test.ts (mock DbDriver)
  reltab-duckdb/test/splom.auto.test.ts (intégration)

tadviewer (UI)
  SplomDialog.tsx
    ├── options : sélection colonnes (checkboxes), color by, min freq, sample, Use all, Apply Table Filters
    ├── matrice N×N (VictoryChart + VictoryScatter, mini-histo/bar diagonal, annotations r)
    ├── master-detail (grand scatter, log X/Y, RectBrushOverlay 2D, trend line, stats, tooltips)
    └── clic diagonale → onOpenDistribution (distribution existante)
```

## Étapes

### Step 1 — Backend reltab : données scatter (TDD)
- `splom.ts` : `splomColKind`, `splomScatterQuery` (temporelles → `__splom_<cid>` epoch), `getScatterPlotData` (rows → points, mapping des noms dérivés, BigInt→Number, `rowCount`).
- Échantillonnage random : wrap `SELECT * FROM (<sql>) ORDER BY random() LIMIT n` via `sqlQuery(...)`; fallback `evalQuery(query, 0, limit)`.
- Tests `test/splom.test.ts` : SQL généré (projection / epoch), mapping, nulls, sample random vs limit, catégorielles préservées.
- Vérifs : `npx tsc -p tsconfig-build.json` + `npm test` (reltab). Test d'intégration duckdb du wrap (describe + all).
- Commit : `feat(reltab): add scatter plot data helper with sampling`

### Step 2 — Backend reltab : corrélation + régression SQL (TDD)
- `pairwiseCorrelationSql`, `getCorrelationMatrix` (triangle supérieur, numeric×numeric), `getPairRegression`.
- Tests : structure SQL (`corr`, `regr_count`, WHERE non-null, UNION ALL, CTE), mapping (r/n, null pour données constantes).
- reltab-duckdb `splom.auto.test.ts` : `corr`, `regr_slope(y,x)`/`regr_intercept`, `describe WITH ...`, colonne constante → null.
- Vérifs : `npx tsc` (reltab) + `npx jest splom.auto.test.ts` (reltab-duckdb).
- Commit : `feat(reltab): add SQL correlation matrix and pair regression helpers`

### Step 3 — Actions tadviewer (état + data + filtre)
- `AppState.ts` : `splomDialogOpen`.
- `actions.ts` : `openSplom`, `closeSplom`, `loadSplomData` (points + corr + colorFreqs), `setSplomBrushFilter` (nettoie x+y + bornes temporelles typées, pattern `setHistogramBrushFilter`/`epochToTemporalString`).
- Vérifs : `npx tsc` (tadviewer).
- Commit : `feat(tadviewer): add SPLOM dialog state, data loading and 2D brush filter actions`

### Step 4 — UI : SplomDialog matrice + options
- `SplomDialog.tsx` : sélecteur colonnes (checkboxes groupées + cap 10), Color by, Min freq, Sample slider + Use all, Apply Table Filters, matrice N×N (diagonale mini-histo/bar, scatters, annotations r + fond, tooltips hover).
- Reload (debounce) à chaque changement d'option / de `tableFilterKey` (pattern `HistogramDialog`).
- États loading/vide/erreur ; message si < 2 colonnes numériques/temporelles.
- Vérifs : `npx tsc` + `npx webpack --env prod --mode production`.
- Commit : `feat(tadviewer): add interactive scatter plot matrix dialog`

### Step 5 — UI : master-detail + interactions
- Clic cellule → grand panneau de la paire : log X/Y, `RectBrushOverlay` 2D → `onBrushFilter`, trend line (`getPairRegression`), stats paire (n, r, slope, intercept, r², min/max), tooltips.
- Clic diagonale → `onOpenDistribution` (reuse `openColumnHistogram`).
- Légende du gradient de corrélation.
- Vérifs : `npx tsc` + webpack prod.
- Commit : `feat(tadviewer): add SPLOM master-detail with 2D brush, log scales and regression`

### Step 6 — Wiring, docs, CI
- `appMenu.ts` : item "Scatter Plot Matrix" → IPC `open-splom` ; `electronRenderMain.tsx` : handler → `openSplom`.
- `doc/features.md` (section SPLOM), README, quickstart ; section gradient/légende dans le dialog (tooltip d'aide).
- `.github/workflows/build.yml` : ajouter `feat/splom` aux triggers push.
- Validation E2E avec l'utilisateur (numeric, temporelle, catégoriel + color by, brush → filtre, master-detail, diagonale → Distribution, sampling, log).
- Update `AGENT_DEV_LOG` + `STATE_HANDOFF`.
- Push branche → vérifier CI multi-plateforme.
- Commit : `feat(tad-app): add SPLOM entry to Analytics menu` puis `docs: document SPLOM feature`.

## Risques / pièges
- `corr`/`regr_*` null sur constantes → "n/a", cellule grisée.
- Ordre des args `regr_slope(y, x)` et `describe WITH ...` à valider (tests intégration).
- Jamais de `corr` sur des dates brutes : passer à l'epoch avant.
- Brush 2D : mapping pixels↔data via le domain de Victory (composant dédié, pas de brush 1D Victory).
- Quoting SQL des colonnes via le dialect (pas d'interpolation manuelle).
- `sqlQuery(...)` exige `getSqlQuerySchema` (describe) : alias SQL stables (`__x`,`__y`,`__r`,`__n`).
- SPLOM orthogonal : ne pas toucher aux mini-charts header row ni au dialog Distribution.
- Snapshot BigInt SUM pré-existants (`basic.auto.test.ts`) hors scope.