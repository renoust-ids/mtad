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

### Step 4d — Fix régression + menu simplifié
- **Cause** : `GridPane` est `React.memo(GridPaneInternal, gridPanePropsEqual)` ; le comparateur ne testait pas `appState.histogramDialogColId` → l'ouverture du dialog ne re-rendait plus la grille (fenêtre invisible).
- **Fix** : comparaison ajoutée dans le comparateur.
- **Menu** : suppression des sous-menus par colonne → un seul item "Analytics > Histogram" qui envoie `{ colId }` sans `colId` ; le renderer choisit alors la première colonne affichable du schema de la vue. IPC `update-histogram-menu-columns`, `histogramColumns`, `updateHistogramMenuColumns` supprimés.
- **Validation** : tadviewer `npx tsc` + webpack 17 warnings ; tad-app webpack OK.
- **Commit** : `dac433c` `fix(tadviewer): re-render GridPane when histogram dialog opens; simplify Analytics menu to single Histogram item`

### Step 4e — Couleurs barres + paramètre min occurrence (catégoriel)
- Palette : barres default `#A3D5FF`, sélectionnées `#FCD5CE` (numérique : via brush actif, une bin est mise en valeur si `[binMin, binMax]` intersecte `[brushMinVal, brushMaxVal]` ; catégoriel : `isCatSelected`). Barre null conservée `#8A9BA8`.
- Catégoriel : nouveau paramètre **Min freq** (slider 0-50% de totalCount, défaut = arrondi de 2% de totalCount) ; les valeurs < seuil sont masquées avant le cap MAX_CATEGORIES.
- **Validation** : `npx tsc` ok ; webpack 17 warnings pré-existants.
- **Commit** : `52c80f9` `feat(tadviewer): highlight selected histogram bars and add categorical min-frequency parameter`

### Step 5 — Terminé (partiel docs/CI)
- Docs : README (section "Column Histograms"), `doc/features.md`, `quickstart.html`, `doc/site/index.html` (carte feature + News 0.0.4). Commit `efe4e92`.
- `.github/workflows/build.yml` : branche `histograms` ajoutée aux triggers de push.
- Reste : E2E avec l'utilisateur, push branche `histograms`.
## 2026-08-30 — Step 6 : Renommage, sliders éditables, état vide catégoriel, colonnes temporelles

### Step 6a — reltab : support temporel (date / time / timestamp)
- `ColumnType.ts` : `temporalKinds` (`date|time|datetime|timestamp`), helpers `isTemporalKind` / `isTemporal`.
- `defs.ts` : nouvel opérateur unaire `epoch` (ValExp) ; SQL : `date_part('epoch', …)` (dialect `"duckdb"`), `strftime('%s', …)` (dialect `"sqlite"`), throw sinon. `getSchema.ts` : `epoch` → `coreColumnTypes.real`.
- Problème DuckDB rencontré : `SUMMARIZE` échoue sur `DATE` brut (`Binder Error: No function matches stddev(DATE)`). Solution : stats numériques obtenues sur la conversion epoch (`getTemporalColumnNumericStats` sur une dérivée `extend("__epoch", epoch(col))` seul).
- Autre piège : une dérivée projetée à une seule colonne (`project(["__epoch"])`) est flaténisée par l'optimiseur ; le query de tailles référençait l'alias `"__epoch"` dans le même SELECT alors que la FROM ne l'expose pas (`Binder Error: Referenced column "__epoch" not found in FROM clause`). Fix : `columnHistogramQuery` accepte désormais un `valExp` optionnel ; pour le temporel on passe `epoch(col(colId))` **inline** sur la requête de base (pas de colonne dérivée matérialisée pour l'histogramme).
- `nativeCSVImport` DOIT être utilisé avec `reltab.getConnection({providerName:"duckdb", resourceId:":memory:"})` (pas d'API `DataSource.open`) ; `getSchema(query)` exige une query.
- Tests : `test/temporal.histo.auto.test.ts` (2 tests) + fixture `test/support/tcol.csv` (id, birth_date, start_time, created_at, note). TIME = secondes depuis minuit local (~32400), date/timestamp = epoch années 2020 ; assertions ajustées en conséquence.
- **Validation** : reltab `npx tsc -p tsconfig-build.json` + `npm test` (5 suites / 22 tests) ; reltab-duckdb `histo.auto` (2 suites / 5 tests + 4 snapshots) et `temporal.histo.auto` (2 tests) au vert.

### Step 6b — tadviewer : dialog Distribution
- Renommage utilisateur "Histogram" → "Distribution" (titre du dialog `${displayName} - Distribution`, menu DataGrid + appMenu "Distribution").
- Nouveau composant `EditableNumber` : double-clic sur la valeur affichée (soulignée pointillés) → input `type=number` ; Entrée/blur commit (clampé [min,max], arrondi), Escape annule. Utilisé pour Bins (2-50) et Min freq.
- Fix état vide catégoriel (cause racine : avec le défaut 2% de totalCount, quand tous les counts < seuil, `bars.length===0` retournait un node sans contrôles) : le slider `minOccControl` + readout sont désormais toujours rendus au-dessus du message "No values above the selected minimum frequency (try lowering it).".
- `actions.ts` : `loadColumnHistogramData` route les kinds temporels vers la voie bins ; `setHistogramBrushFilter` filtre via `reltab.epoch(col(colId))` pour le temporel.
- `HistogramDialog.tsx` : détection `viewKind` + `temporal` via `getViewQueryAndSchema()` (déclarée en `function` pour le hoisting) ; `fmtX` (date→`YYYY-MM-DD`, time→`HH:MM`, timestamp→`YYYY-MM-DD HH:MM`, epoch = s×1000) pour ticks, tooltip (hover `fmtX(binMin)–fmtX(binMax)`) et stats Min/Max/Mean via `fmtStat` ; `handleBrushEnd` arrondit les valeurs temporelles/entières.
- `examples/histogram_test.csv` : 1000 lignes (schema cell_edit_test), âge/salaire gaussiens (26 salaires null), `notes` catégoriel (47 vides), 499 noms distincts.
- **Validation** : tadviewer `npx tsc` ok ; webpack prod 17 warnings pré-existants ; tad-app webpack OK.
- **Commits** :
- `5c5f30d` `feat(reltab): histogram date/time/timestamp columns over epoch-second values`
- `aeee905` `feat(tadviewer): rename Histogram to Distribution, editable slider values, temporal column support`

### Reste à faire
- E2E avec l'utilisateur (renommage, slider éditable, colonne catégorielle avec min freq à 0, colonnes date/time/timestamp sur `examples/histogram_test.csv`).
- Push branche `histograms`.
### Step 6c — Fix crash filtre temporel (0 résultat)
- **Cause** : le brush temporel créait un filtre `ge(epoch(col(colId)), constVal(…))` dont le lhs n'est pas un `ColRef` ; `FilterEditorRow` appelle `relExp.lhsCol()` au montage → `Uncaught Error: Unexpected non-colref arg expType` (crash en ouvrant l'éditeur de filtre sur une vue à 0 résultat).
- **Fix** : `setHistogramBrushFilter` filtre désormais sur `col(colId)` avec le range epoch reconverti en littéral typé (date→`YYYY-MM-DD`, time→`HH:MM:SS`, timestamp→`YYYY-MM-DD HH:MM:SS`) ; DuckDB caste implicitement le littéral (vérifié : `birth_date BETWEEN '2024-01-15' AND '2024-02-19'` → 2 lignes, `start_time 08:30-09:00` → 2 lignes). `FilterEditorRow` : garde défensive (lhs non-colref → sélecteur colonne vide au lieu de crash).
- **Validation** : tadviewer `npx tsc` ok ; webpack prod 17 warnings ; tad-app webpack OK ; probe reltab-duckdb OK.
- **Commit** : `d984ded` `fix(tadviewer): keep brush filters on raw column so filter editor survives`

### Step 6d — Table Filters / Analytics Filters séparés + toggles
- **ViewParams** : nouveaux champs `analyticsFilterExp` (défaut vide) et `applyAnalyticsFilters` (défaut `true`) + `combinedFilterExp()` qui AND la filter table (toujours appliquée) avec la filter analytics (seulement si coché). `deserialize` gère les 2 champs (sessions anciennes → défauts).
- **Footer** : remplacé l'unique lien "Filter" par deux onglets adjacents **Table Filters** et **Analytics Filters** (même `FilterEditor`). Onglet analytics : checkbox **Apply Analytics Filters** (défaut coché) qui pilote `applyAnalyticsFilters` ; le résumé SQL affiché correspond à l'onglet actif. Cancel/Apply/Done par onglet (snapshots `prevTable`/`prevAnalytics`).
- **Distribution interactions** : `setHistogramBrushFilter` et `setCategoryHistogramFilter` écrivent désormais dans `analyticsFilterExp` (plus dans `filterExp`). Nouvelles actions `setAnalyticsFilter` / `setApplyAnalyticsFilters`.
- **PivotRequester** : le query de vue utilise `viewParams.combinedFilterExp()` (la vue applique donc table + (facult.) analytics filters). Vérifié en DuckDB : `(age>=25) AND (name IN (...))`.
- **Distribution dialog** : nouveau switch **Apply Table Filters** (défaut coché). Vue plate : le histogramme est calculé sur `baseQuery.filter(tableFilter)` ; les analytics filters sont volontairement exclues (auto-référentiel). Vue pivotée : inchangée (le query de vue embarque déjà les filters). `tableFilterKey` (hash SQL du table filter) ajouté aux deps des effets → rechargement live quand le table filter change. Vue à 0 résultat : géré (stats null → message, catégoriel → état vide avec contrôles).
- **Validation** : tadviewer `npx tsc` ok ; webpack prod 17 warnings ; tad-app webpack OK ; probe duckdb combiné OK (ids 1,2,4,5).
- **Commit** :- `ce0116f` `feat(tadviewer): split Table and Analytics Filters with apply toggles`
### Step 6e — Résumé filter lié au survol des onglets
- Survol "Table Filters" → chaîne table préfixée `T: ` ; survol "Analytics Filters" → chaîne analytics préfixée `A: `. Sans survol, chaîne de l'onglet actif (inchangée). États `hoverTab` + handlers `onMouseEnter`/`onMouseLeave`.
- **Validation** : `npx tsc` ok ; webpack prod 17 warnings ; tad-app webpack OK.
- **Commit** :
