# Plan de réalisation : Interactive Column Histograms

## Objectif global
Ouvrir un histogramme interactif d'une colonne depuis le clic droit sur son en-tête (item "Histogram"), avec toutes les options d'affichage (bins, log, nulls, brush → filtre) et un panneau de statistiques ; bar chart catégoriel pour les colonnes non-numériques.

## Architecture cible

```
En-tête de colonne (onHeaderContextMenu, DataGrid.tsx)
    ├── Insert Column (existant)
    ├── Rename Column (existant)
    └── Histogram (nouveau) → onColumnHistogram(columnId) → GridPane

GridPane.tsx
    └── openColumnHistogram(colId) → AppState.histogramColId
        └── <HistogramDialog colId schema stateRef onBrushFilter ...>
            ├── fetch : reltab.getSingleColumnHistogramData | getColumnFrequencyData
            │          (une seule colonne, à la demande via appState.rtc)
            ├── Options : bins (Slider), log Y (Switch), nulls (Switch)
            ├── Graphe Victory + VictoryBrushContainer
            │   └── brush end → actions.setHistogramBrushFilter(cid, [min,max])
            │                 → filtre du grid (réutilise l'existant)
            └── Panneau statistiques (count, nulls, min, max, mean, approxUnique)

reltab (nouveau, backend)
    histogram.ts
        ├── getSingleColumnHistogramData(dsConn, baseQuery, schema, colId, colStats?)
        │       → NumericColumnHistogramData | null   (reuse columnHistogramQuery)
        └── getColumnFrequencyData(dsConn, baseQuery, colId)
                → CategoricalDistributionData | null  (groupBy count par valeur)
    reltab.ts barrel : export
    test/histogram.test.ts (mock DbDriver)
```

## Fichiers concernés

| Package | Fichier | Modification |
|---------|---------|-------------|
| reltab | `src/histogram.ts` | `getSingleColumnHistogramData`, `columnFrequencyQuery`, `getColumnFrequencyData`, types fréquences |
| reltab | `src/reltab.ts` | exports barrel |
| reltab | `test/histogram.test.ts` | tests unitaires (mock DbDriver) |
| tadviewer | `src/AppState.ts` | slice `histogramColId` / état dialog |
| tadviewer | `src/actions.ts` | `openColumnHistogram`, `closeColumnHistogram`, fetch données (ou helper) |
| tadviewer | `src/components/HistogramDialog.tsx` | nouveau composant dialog |
| tadviewer | `src/components/DataGrid.tsx` | item "Histogram" dans le menu d'en-tête + prop `onColumnHistogram` |
| tadviewer | `src/components/GridPane.tsx` | handler `onColumnHistogram`, rendu `<HistogramDialog>` |

## Étapes

### Step 1: Backend reltab — helpers par colonne (TDD)
- `getSingleColumnHistogramData(dsConn, baseQuery, schema, colId, colStats?)` :
  - récupère `colStats` si non fourni (`dsConn.getColumnStatsMap(baseQuery)`), construit `columnHistogramQuery`, évalue la requête, mappe via `getNumericColumnHistogramData`. Retourne `null` si colonne non-numérique, stats nulls absents, ou `min === max`.
- Fréquences catégorielles :
  - nouveau type `CategoricalDistributionData { colId, valueCounts: { value: any; count: number }[], nullCount, totalCount }`
  - `columnFrequencyQuery(baseQuery, colId)` : `groupBy` (colId) avec count (QueryExp), + tri
  - `getColumnFrequencyData(dsConn, baseQuery, colId)` : évalue et mappe (null compté séparément)
- Barrel `reltab.ts` : `export * from "./histogram"` (déjà exporté — vérifier que les nouveaux symboles le sont).
- Tests `test/histogram.test.ts` : SQL généré (SELECT groupBy count) + mapping données, cas numeric/catégoriel/nulls/min==max.
- Vérifs : `npx tsc -p tsconfig-build.json` + `npm test` (reltab).
- Commit : `feat(reltab): add single-column histogram and categorical frequency helpers`

### Step 2: Actions tadviewer — état + fetch à la demande
- `AppState.ts` : ajout de l'état du dialog (ex. `histogramDialog: { isOpen: boolean; colId: string | null }`), patterned sur `joinCsvDialog`.
- `actions.ts` :
  - `openColumnHistogram(colId, stateRef)` / `closeColumnHistogram(stateRef)`
  - helper `loadColumnHistogramData(rt, viewState, colId)` : branche numeric (histogram) vs catégoriel (fréquences) en fonction de `baseSchema.columnType(colId).kind`.
- Vérifs : `npx tsc` (tadviewer).
- Commit : `feat(tadviewer): add column histogram dialog state and data loading action`

### Step 3: UI — HistogramDialog
- Nouveau `src/components/HistogramDialog.tsx` (Blueprint `<Dialog>`) :
  - charge les données à l'ouverture (useEffect sur colId) via l'action/helper du step 2
  - options : Slider bins (recale le graphe sans requête : ré-binne à partir des données binées — ou re-requête à la volée si simple), Switch log Y, Switch nulls
  - graphe VictoryBar + VictoryBrushContainer (pattern `NumericColumnHistogram` existant), brush end → `onBrushFilter` → `actions.setHistogramBrushFilter`
  - panneau statistiques
  - état vide/erreur/loading
- Vérifs : `npx tsc` + `npx webpack --env prod --mode production`.
- Commit : `feat(tadviewer): add interactive Histogram dialog with display options`

### Step 4: UI — menu contextuel + wiring
- `DataGrid.tsx` : item "Histogram" dans `onHeaderContextMenu` (visible pour toutes les colonnes, numeric OU catégoriel — supporté), prop `onColumnHistogram?: (columnId: string) => void`.
- `GridPane.tsx` : `handleOpenHistogram(colId)` → action ; rendu `<HistogramDialog>` branché sur l'état AppState + `stateRef` + `onBrushFilter`.
- Vérifs : `npx tsc` + webpack prod.
- Commit : `feat(tadviewer): add Histogram item to column header context menu`

### Step 5: Docs, E2E, CI
- README `doc/features.md`, quickstart in-app, page `doc/site/index.html` : section Histogram.
- `.github/workflows/build.yml` : ajouter `histograms` aux triggers push.
- Validation E2E manuelle (utilisateur) : numeric, catégoriel, options, brush filter.
- Update AGENT_DEV_LOG + STATE_HANDOFF + step5.md.
- Push branche → vérifier CI multi-plateforme.

## Risques / pièges
- `Schema` ctor : `(dialect, columns, columnMetadata)`.
- `DuckDBDialect` est un singleton (`getInstance()`).
- Stats histogram : `getColumnHistogramMap` traite TOUTES les colonnes — pour le dialog on veut UNE colonne : utiliser `columnHistogramQuery` seul + `evalQuery`.
- `colType.kind` : "numeric" | "integer" | "text" | "boolean" | "datetime" | ... → branche "integer"/"numeric" = numérique, sinon catégoriel.
- Ne pas casser les mini-charts de la header row (`showColumnHistograms`) : le dialog est orthogonal.
- Brush sur données catégorielles : non pertinent pour un filtre valeur — désactiver le brush pour les colonnes catégorielles (ou filtrer par valeur cliquée).