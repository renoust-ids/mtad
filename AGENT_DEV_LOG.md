# KNOWLEDGE GRAPH (KGraph) — Agent Dev Log

Branch: `kgraph` (Feature: Knowledge Graph, version app 0.0.10, release cible 0.0.11)

## Planning — PLAN + STATE_HANDOFF rédigés (DONE)
- **Recherche lib graphique** :
  - **Cosmograph** (`@cosmograph/react`) : GPU très rapide mais **CC-BY-NC-4.0 (non-commercial)** + versions payantes → écarté (app distribuée).
  - **Sigma.js + graphology** : **MIT**, WebGL, ForceAtlas2, metrics (degré/betweenness), pas de dépendance native → **recommandé + validé par l'utilisateur**.
  - d3-force/custom SVG : écarté (flexible mais lent à grande échelle).
- **Décisions design validées (2 vagues de questions)** :
  1. Lib = **Sigma.js + graphology** (MIT).
  2. **Structure des nœuds (rÉVISÉE)** : **DEFAULT = par-colonne** — chaque colonne clé est source de nœuds (chaque valeur distincte non-null = un nœud), chaque colonne prop pareil. **OPTION "Composite key"** = un nœud clé par ligne = concat des **parties non-null** (labels joints par ", "). NULL ne créent jamais de nœud.
  3. **Poids** = nœud: occurrence, arête: co-occurrence (par ligne). Taille occ + toggle occ/centralité.
  4. **Centralité** : **degré OU betweenness (les deux, sélectionnable)** via graphology-metrics.
  5. **Nœuds isolés** : masqués par défaut, rendu optionnel.
  6. **Filtres min occurrences séparés** nœuds / arêtes (min edge weight = seuil co-occurrence).
  7. **Perf cible** : ~10k nœuds / ~50k arêtes (échantillonnage + seuils sous plafond).
- **Fichiers créés** : `vibe/kgraph/KNOWLEDGE_GRAPH_PLAN.md` (plan complet, design révisé), `vibe/kgraph/STATE_HANDOFF.md` (état + décisions + prochaines étapes).
- **`vibe-instructions.md`** : MISSION ACTUELLE → Knowledge Graph (branche `kgraph`), missions archivées (Correlation Matrix `v0.0.10`), version release visée 0.0.11.
- **Deps prévues (MIT, à installer root via Lerna hoisting)** : `sigma`, `graphology`, `graphology-layout-forceatlas2`, `graphology-metrics`.

## Step 1-2 — Backend reltab + export + intégration DuckDB (DONE)
- **`packages/reltab/src/knowledgeGraph.ts`** (nouveau, commit `6ad7e80`) :
  - Types : `KnowledgeGraphNode {id, group: "key"|"prop", label, colId?, occurrence}`, `KnowledgeGraphEdge {source, target, weight}`, `KnowledgeGraphData {nodes, edges, totalRows}`, `KnowledgeGraphOptions {keyMode, sampleLimit, minNodeOccurrence, minEdgeWeight}`, `KGKeyMode = "per-column"|"composite"`.
  - `getKnowledgeGraphData(dsConn, baseQuery, schema, keyColIds, propColIds, opts?)` — SQL raw via `sqlQuery()` (pattern splom) :
    - per-column : occurrence clés (`SELECT 'k' AS __group, 'cid' AS __colid, "k" AS __v, count(*) ... WHERE "k" IS NOT NULL GROUP BY "k"`, batched UNION ALL), occurrence props (`CAST("p" AS VARCHAR)`), co-occurrence par paire (`GROUP BY "k", CAST("p" AS VARCHAR)`).
    - composite : `concat_ws(chr(31), NULLIF(CAST("k" AS VARCHAR), ''), ...)` — partie non-null uniquement (empty-string exclue), `WHERE k1 IS NOT NULL OR k2 ...` (pas de nœud si toutes clés nulles), co-occurrence avec `__pcol` ajouté au SELECT.
    - échantillonnage `SELECT * FROM ( base ) AS __kg ORDER BY random() LIMIT n` ; `totalRows` = rowCount(base) ; filtres backend minNodeOccurrence (drop nœuds + arêtes incidentes) / minEdgeWeight.
- **Export** (commit `61056f4`) : `packages/reltab/src/reltab.ts` + `export * from "./knowledgeGraph";`.
- **Tests** : `packages/reltab/test/knowledgeGraph.test.ts` (10 tests mock : SQL généré per-column/composite, NULL/IS NOT NULL, GROUP BY, CAST VARCHAR, comptes, sampling, seuils, agrégation ids) → **`cd packages/reltab && npm test` = 85 pass** (75+10), `npm run build` OK.
- **Intégration DuckDB** : `packages/reltab-duckdb/test/knowledgeGraph.auto.test.ts` (5 tests) + fixture `test/support/knowledge_graph.csv` (10 lignes, clés partiellement nulles, toutes nulles) → **verts** (per-column / null / composite partiellement nul / sampling / seuils).
- **Note résolution reltab** : `import ... from "reltab"` dans les auto tests nécessite le package lié (lerna bootstrap). Temp local gitignored : symlink `packages/reltab-duckdb/node_modules/reltab` → `../../reltab`. Snapshot `histo.auto` flaky pré-existant en run complet (indépendant de mes changements, vérifié) — workflow reltab-duckdb options `2>/dev/null || true`.
- **Bug corrigé en course** : composite edge target manquait `__pcol` → ajouté au SELECT (`AS __pcol`) et à l'assemblage `p:<colId>:<v>`.

**Commands** : `git add packages/reltab/src/knowledgeGraph.ts ...` → `6ad7e80` ; `git add packages/reltab/src/reltab.ts packages/reltab-duckdb/...` → `61056f4`.

## Step 3 — AppState + actions (DONE)
- `packages/tadviewer/src/AppState.ts`: added `knowledgeGraphDialogOpen: boolean` (interface + default `false` + class property).
- `packages/tadviewer/src/actions.ts`: Knowledge Graph block before Join CSV — `openKnowledgeGraph`/`closeKnowledgeGraph` (pattern openCorrelationMatrix, guard viewState), `KnowledgeGraphViewData { data: reltab.KnowledgeGraphData }`, `loadKnowledgeGraphData(dbc, query, schema, keyColIds, propColIds, opts)`.
- **Command** : commit `f4c31bf`.

## Step 4 — Dialog + assemblage graphology + ForceAtlas2 + rendu Sigma (DONE)
- **`packages/tadviewer/src/components/KnowledgeGraphDialog.tsx`** (nouveau, commit `faacb79`) :
  - 2 MultiSelect react-select (Key columns / Property columns, `MAX_KG_COLS=24` chacun, CheckboxOption, Select all/Clear), toggle **Composite key** (sur la rangée des clés), contrôles : sliders+NumericInput **Min node occurrence** / **Min edge co-occurrence**, slider **Sample 500–20000** (recomputed at release uniquement) + **Use all rows** + **Apply Table Filters**, HTMLSelect **Size** = Occurrence/Centrality + sous-sélecteur **Degree/Betweenness**, switch **Show isolated nodes**.
  - Stats line : `N nodes · M edges (sample of X) · T total rows`.
  - **Filtres min occurrences côté front uniquement** (`filterKGData` pur) → ajuster les sliders ne re-queried pas (exploration instantanée) ; le reload backend ne dépend que de key/prop cols + composite + sample + filters.
  - Assemblage : `new Graph()` (undirected simple), garde `hasEdge()` doublons, seed positions aléatoires `(rand-0.5)*10` (**FA2 → NaN sinon**), `forceAtlas2.assign({ iterations adaptatives 200/400/600, settings { ...inferSettings, edgeWeightInfluence:1 }, getEdgeWeight:"weight" })`, `degreeCentrality.assign` + `betweennessCentrality.assign` (seulement si betweenness choisi), `makeSizeScale` min-max → nœuds [2,26], arêtes [0.5,4], couleurs key `#137cbd` / prop `#d9822b`.
  - Rendu : `GraphView` (React.memo) → `new Sigma(graph, container, { renderLabels:false, renderEdgeLabels:false })`, `enterNode`/`leaveNode` → tooltip (label + Key/Property + occurrence + degré brut via `graph.degree(n)`), cleanup `off()`+`kill()`, `container.innerHTML=""` avant re-création. Message "No graph to display" si 0 nœuds.
  - Deps ajoutées à `packages/tadviewer/package.json` (deps runtime, indentation 2 espaces) : `sigma@^3.0.3`, `graphology@^0.26.0`, `graphology-layout-forceatlas2@^0.10.1`, `graphology-metrics@^2.4.2`.
- **Env réparé** : un `npm install` à la racine avait purgé le `node_modules` racine hoisté (oneref/immutable/react/webpack…). Restauré via `npm run bootstrap` (lerna bootstrap --hoist). Vérifié : react/oneref/immutable/loglevel/webpack/sigma/graphology/… de retour à la racine + tadviewer `tsc` **0 erreur** + tadviewer `build-dev` **compiled** (4.9s, 14 warnings sass pré-existants).
  - **Note** : les 2 erreurs TS7006 `actions.ts:160/1677` relevées au handover étaient un artefact de ce env cassé (deps manquantes) — avec les deps restaurées, plus aucune erreur.
- **Command** : commit `faacb79`.

## PROCHAINES ÉTAPES (implémentation TDD, à exécuter)
1. ~~Backend `packages/reltab/src/knowledgeGraph.ts` + tests~~ DONE (6ad7e80).
2. ~~Export `reltab.ts` + tests reltab verts~~ DONE (61056f4).
3. ~~AppState + actions~~ DONE (f4c31bf).
4. ~~Dialog `KnowledgeGraphDialog.tsx` + contribute graphology + FA2 + rendu Sigma~~ DONE (faacb79).
5. Wiring menu (`open-knowledge-graph`) + IPC + GridPane.
6. Build/typecheck tadviewer + tad-app, tests reltab, commits atomiques, revue.
7. **Release 0.0.11** (docs + bump 3 fichiers + CHANGELOG + tag `v0.0.11` + push → CI).

---

# CORRELATION MATRIX — Agent Dev Log

Branch: `correlation` (Feature: Correlation Matrix, version app 0.0.9)

## RELEASE 0.0.10 — docs + bump + tag (DONE)
- **Version cible** : `0.0.10` (release next après `0.0.9` sur master).
- **Docs mises à jour** :
  - `README.md` : section "Correlation Matrix" (après Confusion Matrix) + bullets packages reltab/tadviewer.
  - `doc/features.md` : section "Correlation Matrix" + 5 lignes SQL dans "Under the Hood".
  - `doc/analytics.md` : section "Correlation Matrix" + intro + bullet "Under the hood".
  - `doc/site/index.html` (guide utilisateur/site) : carte feature, news "MTad 0.0.10", section release notes 0.0.10.
  - `CHANGELOG.md` : section `## [0.0.10] - 2026-09-04` (Added Correlation Matrix + reltab layer), `[Unreleased]` vide en haut, liens compare mis à jour (`v0.0.10`).
- **Bump** : `package.json` racine, `package-lock.json` (2 lignes "version" du haut), `packages/tad-app/package.json` → `0.0.10`.
- **Release via CI** : le tag `v0.0.10` déclenche `.github/workflows/build.yml` (mac/win/linux) ; le job `release` extrait la section `## [0.0.10]` de `CHANGELOG.md` comme corps + publie la release (`make_latest`).
- **Remarque** : pas de `gh` CLI disponible → la "publication" se fait par push du tag (CI). Ne pas committer `examples/Buddha Face*.xlsx` (untracked, hors scope).

## Header visibility + context menu "Remove" (DONE)
- **En-têtes de colonnes visibles** : rotation −45° (origin bottom-left) + `display:flex; alignItems:flex-end` + `height: headerH` (headroom = `max(40, min(⌈longName*4.5⌉+14, 200))`) → le texte en diagonale a assez de place au-dessus et n'est plus coupé par le conteneur `overflow:auto`. Headroom ≠ lié au nb de colonnes (chaque en-tête a son propre origin).
- **Menu contextuel** : clic droit (en-tête colonne OU ligne) → ouvre un `Menu` Blueprint positionné fixe avec l'item **"Remove «colonne»"** (icône trash) qui appelle `removeCol(cid)`. Fermeture sur clic à l'extérieur / Escape / blur / scroll.
- Remplace l'ancien comportement "suppression immédiate au clic droit" par une étape de menu « Remove ».
- Vérifs : typecheck tadviewer + tad-app OK ; `build-prod` tad-app **compiled successfully**. Commit `git add`.

## Post-fix tuning — sample slider recompute on release only (DONE)
- Slider d'échantillonnage : `onChange` met à jour uniquement la valeur visuelle (`sampleSliderVal`), `onRelease` commite dans `sampleLimit` (déclenche le recalcul). L'effet dépend de `curSample = sampleLimit`, donc pas de recalcul pendant le déplacement du curseur. Pattern identique à ScatterPlotDialog/SplomDialog.
- Vérifs : typecheck + `build-prod` tad-app OK (aucun test backend affecté).

## Fix round (post-review) — DONE
User-requested fixes implemented:
1. **Colonnes toujours visibles** : retrait de `overflow:hidden`/`textOverflow`/`maxWidth` sur les en-têtes de colonnes (rotation −45°) et les labels de lignes → les noms s'affichent en entier.
2. **Contrôle de la taille d'échantillonnage** : slider "Sample: N" (`min 500 / max 20000 / step 500`, state `sampleLimit`/`sampleSliderVal`), désactivé quand "Use all rows" ; le `useEffect` dépend de `curSample`.
3. **Ajout de toutes les colonnes** : boutons "Select all" / "Clear" sous le picker (sélectionne jusqu'à `MAX_MATRIX_COLS=24` colonnes pickables).
4. **Pas de corrélation pour les colonnes de type ID** : `constantOrNullColIds` étendu pour flaguer les colonnes "id-like" (`count(non-null) == count(distinct)`, valeurs toutes uniques) en plus des toujours-nulles et constantes → exclues du picker + liste d'avis "Not usable (null / constant / ID)".
5. **Pas de calcul symétrique en double** : vérifié + test unitaire — le backend calcule déjà chaque paire non ordonnée une seule fois (batched upper-triangle pour num-num ; eta/V une fois par paire). Test : `corr(` apparaît une seule fois.
6. **Suppression ligne/colonne au clic droit** : `onContextMenu` sur les en-têtes (colonne + ligne) → retire la colonne de `selectedCols` (`removeCol`).

- Tests backend : `packages/reltab/test/splom.test.ts` (4 tests nouveaux/modifiés) → **75 pass**.
- Vérifs : typecheck tadviewer + tad-app OK ; tad-app `npm run build-prod` → **compiled successfully**.
- **Note** : un `lerna bootstrap` (déclenchés par le build) a temporairement hoisté les deps dans le `package.json` racine + créé `package.json.lerna_backup` — **reverté** (hors scope), commit conservé atomique.

**Commands** : `git add packages/reltab/src/splom.ts packages/reltab/test/splom.test.ts packages/tadviewer/src/components/CorrelationMatrixDialog.tsx` → commit.

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
