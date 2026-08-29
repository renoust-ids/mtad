# AGENT DEV LOG - Histograms (Interactive Column Histogram)

## 2026-08-29

### Préparation de la mission
- **Branche** : `histograms` créée depuis `master` (v0.0.4).
- **Recherche préalable** :
  - Le fork n'a PAS encore cette feature, mais a hérité de la fondation Tad : `reltab/src/histogram.ts`, `ColumnStats.ts`, `d3utils.ts`, `NumericColumnHistogram` (Victory + brush) dans `DataGrid.tsx`, actions `setHistogramBrushFilter` / `setHistogramBrushRange` / `toggleShowColumnHistograms`, `victory@^36.6.10` déjà installé. Les mini-charts de la header row existent (fondation du 0.13.0 upstream).
  - `Schema` ctor = `(dialect, columns, columnMetadata)` ; `DuckDBDialect` singleton.
  - Connexion reltab accessible via `appState.rtc.connect(sourceId)`.
- **Décisions utilisateur (question)** :
  - Menu : item "Histogram" dans le menu contextuel d'en-tête de colonne.
  - Options d'affichage : nombre de bins, échelle log Y, nulls, brush → filtre colonne, panneau de statistiques.
  - Colonnes non-numériques : bar chart catégoriel (distribution de fréquences).
- **Fichiers créés** :
  - `vibe/histogram/mission.md`, `global_plan.md`, `STATE_HANDOFF.md`, `AGENT_DEV_LOG.md`.
- **Fichier mis à jour** : `vibe-instructions.md` (mission actuelle + références → `vibe/histogram/`).
- **Commit** : `docs: prepare histograms mission, plan and handoff (vibe/histogram)`.

### Step 1 — Terminé
- Backend reltab : `getSingleColumnHistogramData` + `getColumnFrequencyData` (TDD). Voir `step1.md`.
- **Tests** : `packages/reltab/test/histogram.test.ts` (6 tests, mock DbDriver) — verts.
- **Fix pré-existant découvert** : `parsePercentage` dans `reltab-duckdb` plantait sur le `null_percentage` numérique renvoyé par DuckDB SUMMARIZE moderne (toute la colonne stats → `{}`, ça cassait le flux histogrammes existant). Accepte maintenant string (`"17.00%"`) et number (`16.67`).
- **Validation DuckDB réel** (duckdb-async, scratch `tmp/` hors repo) :
  - `getSingleColumnHistogramData` sur colonne DOUBLE → bins réels (niceMin/niceMax/binWidth/binData/brush), retours `null` corrects pour non-numérique / stats absentes / min==max.
  - `getColumnFrequencyData` : distribution correcte (x=2, y=2, z=1, nullCount=1), tri count desc.
- **Snapshots** : `histo.auto.test.ts` (reltab-duckdb) corrigés — SQL drift (échappement quotes) + stats désormais réelles (avant `undefined`).
- **Commits** :
  - `0f9cdc8` `fix(reltab-duckdb): handle numeric null_percentage from DuckDB SUMMARIZE`
  - `3dd4e80` `feat(reltab): add single-column histogram and categorical frequency helpers`
- **Note** : la suite `basic.auto.test.ts` (reltab-duckdb) a des snapshot failures pré-existants non liés (BigInt `n` du SUM DuckDB) — hors scope, laissés tels quels.

### Step 2 — Terminé
- Backend reltab : bins explicites + stats mean/std (TDD). Voir `step2.md`.
- `columnHistogramQuery(baseQuery, colId, colType, colStats, requestedBinCount?)` honore un nombre de bins explicite (sinon Sturges).
- Nouveau : `getColumnHistogramDataForBins(dsConn, baseQuery, baseSchema, colId, binCount?, colStats?)` ; `getSingleColumnHistogramData` y délègue.
- `NumericSummaryStats` : `mean?: number | null`, `std?: number | null` ; reltab-duckdb les parse via `parseNullableNumber(...)` depuis `row.avg`/`row.std` (SUMMARIZE renvoie parfois des strings, parfois des numbers, parfois des BigInt).
- **Tests** : reltab 22/22 verts (dont 9 histogram tests); reltab-duckdb `histo.auto.test.ts` 3/3 (snapshot : TCOE mean 203980.8261, std 93806.1722 ; test : min < mean < max, std > 0).
- **Commits** :
  - `d659dc5` `feat(reltab): support explicit bin counts and mean/std column stats`
  - `61c49c0` `feat(reltab-duckdb): parse mean and std from SUMMARIZE column stats`

### Step 3 — Terminé
- tadviewer : action `loadColumnHistogramData(dbc, baseQuery, baseSchema, colId, binCount?)`.
- Branche numériques (`kind` `"integer"|"real"`) → `getColumnHistogramDataForBins`, sinon → `getColumnFrequencyData`.
- **Commit** : `a1b71f4` `feat(tadviewer): add on-demand column histogram data loading action`

### Step 4 — Terminé
- tadviewer : `HistogramDialog.tsx` (Blueprint `<Dialog>`, Victory Chart + VictoryBrushContainer, Slider bins 2-50 avec `onRelease` pour requêter, Switch Log Y / Show nulls, Tags stats : Bins/Rows/Nulls/Unique/Min/Max/Mean/Std, MAX_CATEGORIES=20 pour le catégoriel).
- Détection numérique/catégoriel à l'exécution via `"binWidth" in data`.
- Brush : real → round 2 décimales, integer → round int ; réutilise `actions.setHistogramBrushFilter`.
- GridPane : état local `histogramColId` + `handleOpenHistogram`/`handleCloseHistogram` + `<HistogramDialog onBrushFilter={onHistogramBrushFilter}>`.
- DataGrid : prop `onColumnHistogram?: (columnId: string) => void` + item "Histogram" (avec divider) après "Duplicate Column".
- Le repo n'a PAS de fichiers CSS (blueprint importé ailleurs) → styles inline, pas de classes `.HistogramDialog-*`.
- **Validation** : `npx tsc` et `npx webpack --env prod --mode production` (≈4 s, 17 warnings de perf pré-existants, bundle 2.37 MiB).
- **Commit** : `5c67711` `feat(tadviewer): add interactive Histogram dialog and header menu item`

### Step 4b — Améliorations UI (retour utilisateur)
- Hover sur une barre → tooltip Victory (`VictoryTooltip`) : plage de bins exacte (`123.45 – 130.00`) ou valeur catégorielle + `count`.
- Slider bins : valeur courante affichée en direct (colonne "Bins → {n}") pendant le drag.
- Sélecteur de colonne : `HTMLSelect` en haut du body listant les colonnes de `baseSchema` (filtre `_`/`Rec` comme Insert Column) ; prop `onSelectColumn` câblée dans GridPane → `setHistogramColId`.
- Fenêtre redimensionnable : `style={{ resize: "both", overflow: "auto", min/max }}` appliqué au `.bp4-dialog` (Blueprint applique `style` directement sur `div.bp4-dialog`, pas de CSS repo nécessaire).
- **Validation** : `npx tsc` ok ; `npx webpack --env prod --mode production` 17 warnings pré-existants, ≈4.7 s.
- **Commit** : `18d9f14` `feat(tadviewer): add bin tooltips, live bin count, column selector and resizable histogram dialog`

### Step 4c — Retour utilisateur : tooltip épinglé, menu Analytics, sélection bars catégorielles, pivot
- **F1 Tooltip épinglé à l'échelle du dialog** : remplace VictoryTooltip par un overlay HTML `position:absolute` (z-index élevé, suivi souris) qui reste affiché quand le curseur quitte le graphe pour le selector — effacé seulement à la sortie du `bp4-dialog-body`. Géométrie par bandes (binW = plot/binCount) pour trouver la bin sous le curseur (numérique ET catégoriel).
- **F2 Menu Analytics (barre de menu Electron)** : menu natif "Analytics > Histogram" listant les colonnes. Renderer pousse les colonnes (schema de la vue) via `ipcRenderer.send("update-histogram-menu-columns", cols)` sur changement d'état ; main (`ipcMain.on`) → `appMenu.updateHistogramMenuColumns` (mémorise + `createMenu()`). Clic sur une colonne → `focusedWindow.webContents.send("open-column-histogram", { colId })` → renderer `actions.openColumnHistogram`.
- Dialog piloté par l'état : `AppState.histogramDialogColId` + actions `openColumnHistogram`/`closeColumnHistogram` ; GridPane n'a plus d'état local.
- **F3 Sélection de bars catégorielles** : clic sur une barre → toggle sélection (fill #137CBD si sélectionnée sinon #BFCCD6), filtre appliqué via nouvelle action `setCategoryHistogramFilter` (`IN` + `ISNULL`), nettoyage des clauses `colId` (BinRelExp ET UnaryRelExp via `filterExpWithoutCol`). Barre `(null)` → principe ISNULL. Re-clic sur sélectionnée → retrait du filtre.
- **F4 Pivot (cellules agrégées)** : `getViewQueryAndSchema()` — si `viewParams.vpivots.length > 0` et `queryView` dispo → histogramme sur `queryView.query` (tree query agrégée) + `dataView.schema` (schema agrégé, fallback baseSchema) ; sinon baseQuery/baseSchema (comportement inchangé). Selector de colonnes + titre utilisent le schema de la vue. Brush/filtre gardés sur baseQuery → pré-agrégation (guard : colId absent de baseSchema → pas de filtre).
- `loadColumnHistogramData` : signature changée en `(dbc, query, schema, colId, binCount?)`.
- **Validation** : tadviewer `npx tsc` ok + webpack 17 warnings ; tad-app `npx webpack --mode production` compilé avec succès.
- **Commits** : `979b878` `feat(tadviewer): add pinned tooltip, Analytics menu, categorical bar filter and pivot-aware histograms`

### Step 5 — En cours
- Docs : README (section "Column Histograms"), `doc/features.md`, `quickstart.html`, `doc/site/index.html` (carte feature + News 0.0.4).
- `.github/workflows/build.yml` : branche `histograms` ajoutée aux triggers de push.
- Reste : commit docs/CI + AGENT_DEV_LOG/STATE_HANDOFF, E2E avec l'utilisateur, push branche `histograms`.