# Mission: Interactive Scatter Plot Matrix (SPLOM)

## Objectif
Ajouter un item **SPLOM** ("Scatter Plot Matrix") au menu **Analytics** de l'application, ouvrant un **dialog interactif** affichant une matrice de scatter plots pour un ensemble de colonnes choisi manuellement, avec toutes les interactions d'exploration : brush rectangulaire 2D → filtre, master-detail au clic, diagonale → Distribution, tooltips, corrélation de Pearson (SQL), couleur par colonne catégorielle, échelles log par paire, contrôles d'échantillonnage.

## Décisions de design validées par l'utilisateur
1. **Layout** : matrice N×N complète (diagonale = distribution, hors-diagonale = scatter) **+ master-detail** au clic sur une cellule.
2. **Choix des colonnes** : **sélection manuelle complète**, incluant les variables **catégorielles** (avec seuil de nombre minimal d'occurrences pour masquer les catégories rares).
3. **Intégrations** (toutes retenues) :
   - Master-detail au clic sur une cellule.
   - Brush rectangulaire 2D → filtre analytics (colX ∈ [xmin,xmax] AND colY ∈ [ymin,ymax]).
   - Clic sur la diagonale → ouvre le dialog **Distribution** existant.
   - Hover tooltips (x, y, couleur).
   - Corrélation de Pearson (r) affichée + fond coloré.
   - Colorer les points par une colonne catégorielle.
   - Contrôle d'échantillonnage (downsampling).
   - Échelle log par paire (master-detail).
4. **Backend corrélation** : **SQL par paire** via `corr()` DuckDB (agrégats statistiques DuckDB : `corr`, `regr_slope`, `regr_intercept`, `regr_count`, `regr_r2`).
5. **Menu** : **uniquement** le menu Analytics (Electron, `appMenu.ts`), item **"Scatter Plot Matrix"**. Pas d'entrée dans le menu contextuel d'en-tête.
6. **Colonnes temporelles** : converties en **epoch-secondes** (pattern `temporalValueQuery` de `histogram.ts`), étiquettes formatées par type (date/time/timestamp) via le pattern `fmtX` de `HistogramDialog.tsx`.
7. **Ouverture du dialog** : **sélection de colonnes vide** — message invitant à sélectionner au moins 2 colonnes numériques/temporelles (pas de présélection automatique).

## Contexte technique (fondation existante)
- **reltab** : `packages/reltab/src/histogram.ts` — helpers histogramme/fréquences (TDD, mock `DbDriver` dans `test/histogram.test.ts`), `temporalValueQuery`, `epoch()`, `sqlQuery(sql)` (feuille SQL brute, résolue par `DbDataSource.getSqlQuerySchema`), `evalQuery(query, offset, limit)`.
- **reltab-duckdb** : `runSqlQuery`, `getSqlQuerySchema` (`describe <sql>`), `getSqlQueryColumnStatsMap` (`summarize <sql>`), agrégats statistiques DuckDB (`corr`, `regr_*`) disponibles.
- **tadviewer** : `HistogramDialog.tsx` (brush → `setHistogramBrushFilter`, filtre catégoriel → `setCategoryHistogramFilter`, panneau stats, options Apply Table Filters / Log Y / Show nulls, template HoverInfo tooltip), `actions.openColumnHistogram`, `ViewParams.analyticsFilterExp` + `applyAnalyticsFilters` (footer), `GridPane`/`DataGrid`.
- **tad-app** : `appMenu.ts` (menu Analytics → IPC `open-column-histogram`), `electronRenderMain.tsx` (handler IPC).

## Périmètre
- Oui : backend reltab (query scatter + matrice de corrélation SQL + regression), actions tadviewer, dialog `SplomDialog.tsx`, wiring menu Analytics + IPC, docs (`doc/features.md`, README, quickstart), tests unitaires + tests d'intégration reltab-duckdb.
- Non : remplacement du dialog Distribution ; export SPLOM ; entrées de menu contextuel d'en-tête.

## Contraintes techniques
- TDD : logique métier `reltab` → tests unitaires obligatoires (mock `DbDriver`, pattern `test/histogram.test.ts`) + `tsc -p tsconfig-build.json` + `npm test`.
- TypeScript strict, pas de `any` ; composants React fonctionnels (Hooks) ; modales BlueprintJS `<Dialog>`.
- Data fetch **à la demande** (pas de dépendance au toggle `showColumnHistograms`).
- Conventional commits atomiques (backend ≠ UI ≠ docs). Branche `feat/splom`. Docs dans `vibe/splom/` (`STATE_HANDOFF.md`, `AGENT_DEV_LOG.md`, `spec.md`, `global_plan.md`, `stepN.md`).

## Steps (résumé)
1. Backend reltab — scatter data (`scatterDataQuery`, `getScatterData`, échantillonnage) + tests.
2. Backend reltab — matrice de corrélation SQL (`pairwiseCorrelationSql`, `getCorrelationMatrix`) + tests.
3. Actions tadviewer — état SPLOM, `loadSplomData`, `setSplomBrushFilter`.
4. UI `SplomDialog` — matrice N×N, sélecteur colonnes, options (couleur, échantillonnage, min-occurrence, Apply Table Filters).
5. UI `SplomDialog` — master-detail, brush 2D, diagonale → Distribution, tooltips, log.
6. Wiring menu Analytics + IPC, docs, E2E, CI (`.github/workflows/build.yml` triggers `feat/splom`).

## Exemple d'utilisation
```
table t(a DOUBLE, b DOUBLE, c VARCHAR, d DATE)
  → menu Analytics ▸ Scatter Plot Matrix
  → sélection manuelle : [a, b, d] (d temporelle → epoch), color by = c
  → matrice 3×3 : diagonale = mini-histogrammes, hors-diagonale = scatters
  → clic sur cellule (a,b) → grand panneau, r = 0.83, trend line, log X/Y
  → brush [1.2,3.4]×[10,20] sur (a,b) → filtre analytics
      a BETWEEN 1.2 AND 3.4 AND b BETWEEN 10 AND 20 appliqué au grid
```