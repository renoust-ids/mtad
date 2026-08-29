# Mission: Interactive Column Histograms

## Objectif
Ajouter un item **Histogram** au menu contextuel d'un en-tête de colonne (clic droit), qui ouvre un **dialog interactif** affichant l'histogramme de la colonne avec toutes les options d'affichage.

## Contexte technique (fondation déjà présente)
Le fork a hérité de la fondation histogrammes de Tad (upstream) :
- **reltab** : `packages/reltab/src/histogram.ts` — binning SQL (`columnHistogramQuery`, `getNumericColumnHistogramData`, `getColumnHistogramMap`), `ColumnStats` (`NumericSummaryStats` : min/max/approxUnique/count/pctNull), `getColumnStatsMap` dispo sur la connexion.
- **tadviewer** : composant `NumericColumnHistogram` (Victory + `VictoryBrushContainer`) dans `DataGrid.tsx` (mini-charts dans la row d'en-tête), actions `setHistogramBrushFilter` / `setHistogramBrushRange`, toggle sidebar `showColumnHistograms`, `histoMap` dans `QueryView`.
- Dépendance `victory@^36.6.10` déjà installée dans tadviewer.

## Features (décisions utilisateur validées)
1. **Menu** : item **Histogram** dans le menu contextuel d'en-tête de colonne (à côté de Insert Column / Rename Column).
2. **Dialog interactif** (Blueprint `Dialog`) avec options d'affichage :
   - **Nombre de bins** (défaut : Sturges via `binsForColumn`, ajustable).
   - **Échelle log** sur l'axe Y.
   - **Inclusion/exclusion des nulls**.
   - **Brush → filtre** : sélectionner une plage sur le graphe applique un filtre de valeur sur la colonne (réutilise `actions.setHistogramBrushFilter`).
   - **Panneau de statistiques** : count, nulls, min, max, mean, approx_unique.
3. **Colonnes non-numériques** : afficher un **bar chart catégoriel** (distribution de fréquences par valeur) au lieu d'un histogramme numérique.

## Contraintes techniques
- TDD : logique métier reltab → tests unitaires obligatoires (mock `DbDriver`, pattern `test/dataSourceMutations.test.ts`) + `tsc -p tsconfig-build.json` + `npm test`.
- TypeScript strict, pas de `any` ; composants React fonctionnels (Hooks) ; modales BlueprintJS `<Dialog>` (pattern `CellEditModal.tsx`).
- Data fetch **à la demande pour une seule colonne** (ne dépend PAS du toggle global `showColumnHistograms`).
- Conventionnal commits, commits atomiques (backend ≠ UI), docs dans `vibe/histogram/` (`STATE_HANDOFF.md`, `AGENT_DEV_LOG.md`, `stepN.md`).
- Branche `histograms` ; ajouter `histograms` aux triggers du workflow CI (`.github/workflows/build.yml`) avant le push de fin.

## Steps
1. **Backend reltab** — helpers par colonne : histogramme numérique (`getSingleColumnHistogramData`) + distribution catégorielle (`getColumnFrequencyData`), exportés par le barrel + tests unitaires.
2. **Actions tadviewer** — fetch à la demande : `openColumnHistogram`/`closeColumnHistogram` (état AppState), chargement des données histogramme/fréquence via la connexion reltab.
3. **UI HistogramDialog** — composant `HistogramDialog.tsx` : graphe Victory interactif (brush), options bins/log/nulls, panneau stats, support catégoriel.
4. **UI menu contextuel + wiring** — item "Histogram" dans `DataGrid.tsx` (onHeaderContextMenu), prop `onColumnHistogram`, ouverture depuis `GridPane.tsx`.
5. **Docs, E2E, CI** — README/quickstart/doc, validation E2E utilisateur, push branche + vérification build CI.

## Exemple d'utilisation
```
table t(a DOUBLE, b VARCHAR)
  → clic droit sur l'en-tête "a" → Histogram
  → dialog : barchart 10 bins (Sturges), échelle log off, nulls inclus
  → brush [1.2, 3.4] → filtre a BETWEEN 1.2 AND 3.4 appliqué au grid
```