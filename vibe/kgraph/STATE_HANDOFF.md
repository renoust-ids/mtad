# KGraph - State Handoff

Branche : `kgraph` (créée depuis `master` @ `648b03e`, version app 0.0.10). Date : 2026-09-04.

## Mission
Implémenter la vue analytique **Knowledge Graph** (menu Analytics → Knowledge Graph) : graphe bipartite clé↔propriété, sélection de colonnes type Correlation Matrix, échantillonnage, occurrences min (nœuds + arêtes), poids nœuds/arêtes, layout ForceAtlas2 + rendu WebGL (Sigma.js/graphology), TDD + commits atomiques. Publier ensuite la release **0.0.11**.

## Décisions validées par l'utilisateur
1. **Lib** : **Sigma.js + graphology** (MIT). Cosmograph (CC-BY-NC-4.0 non-commercial) écarté ; d3-force/custom SVG écarté.
2. **Structure des nœuds** : **DEFAULT = par-colonne** (chaque colonne clé = son propre ensemble de nœuds ; chaque valeur distincte non-null d'une colonne clé/prop = un nœud). **OPTION "Composite key"** = regroupe les colonnes clés en UN nœud par ligne (concat des **parties non-null** uniquement, labels joints par ", "). NULL ne créent jamais de nœud.
3. **Poids** = comptes par ligne : nœud = occurrence, arête = co-occurrence.
4. **Taille** sur occurrence + toggle occurrence/centralité ; **centralité = degré OU betweenness (les deux, sélectionnable)**.
5. **Nœuds isolés** : masqués par défaut, rendu optionnel.
6. **Filtres min occurrences séparés** nœuds / arêtes (min edge weight = seuil co-occurrence).
7. **Perf cible** : ~10k nœuds / ~50k arêtes (WebGL, échantillonnage + seuils pour rester sous plafond).

## État
- Recherche + recommandation lib finalisée → **Sigma.js + graphology** confirmé.
- **Design 100 % validé** (structure par-colonne + option composite, poids, centralité degré/betweenness, nœuds isolés, filtres min occurrences séparés, perf ~10k/50k). Plus de points de design en suspens.
- Plan écrit : `vibe/kgraph/KNOWLEDGE_GRAPH_PLAN.md`.
- **Step 1 DONE (commit `6ad7e80`)** : `packages/reltab/src/knowledgeGraph.ts` (module complet) + `packages/reltab/test/knowledgeGraph.test.ts` (10 tests mock). `cd packages/reltab && npm test` → **85 pass** (75 + 10), build OK.
- **Step 2 DONE (commit `61056f4`)** : export `reltab.ts` (+1 ligne `export * from "./knowledgeGraph"`) + intégration DuckDB `packages/reltab-duckdb/test/knowledgeGraph.auto.test.ts` (5 tests) + fixture `packages/reltab-duckdb/test/support/knowledge_graph.csv` → **verts**.
  - Note : `reltab-duckdb` tests nécessitent la résolution du package `reltab` (lerna bootstrap/temp symlink `packages/reltab-duckdb/node_modules/reltab` → `../../reltab`, gitignored). Snapshot `histo.auto` pré-existant qui flakke en run complet — ignoré (workflow release : `2>/dev/null || true`).

## Décisions d'implémentation backend (issues en cours de route)
- IDs nœuds : `k:<colId>:<value>` / `p:<propColId>:<value>` (per-column) ; `k:<composite>` (composite). Label composite = parties jointes par `, ` ; séparateur interne id = `\u001f`.
- `concat_ws(chr(31), NULLIF(CAST("k" AS VARCHAR), ''), ...)` — parts non-null + empty-string exclusion. Ligne sans aucune clé non-null → pas de nœud (`WHERE k1 IS NOT NULL OR k2 ...`).
- Edge composite : ajouté `__pcol` au SELECT (target doit matcher `p:<colId>:<value>`).
- Filtres backend : `minNodeOccurrence` (drop nœuds + arêtes incidentes), `minEdgeWeight` (drop arêtes) — le front ré-applique les mêmes seuils sans re-query.
- Échantillonnage : `SELECT * FROM ( base ) AS __kg ORDER BY random() LIMIT n` avant comptes. `totalRows` = rowCount(full baseQuery).

## En cours / Bloqué
- Aucun blocage. Prochaine étape : **Step 3 — AppState + actions** (`knowledgeGraphDialogOpen`, `open/closeKnowledgeGraph`, `loadKnowledgeGraphData`).

## Prochaines étapes (ordre)
1. ~~Step 1 : backend reltab~~ DONE.
2. ~~Step 2 : export + tests~~ DONE.
3. Step 3 : AppState + actions (`knowledgeGraphDialogOpen`, `loadKnowledgeGraphData`).
4. Step 4 : Dialog (pickers colonnes + contrôles) — UI seule.
5. Step 5 : rendu Sigma + ForceAtlas2 + sizing centralité (degré/betweenness).
6. Step 6 : wiring menu + IPC + GridPane.
7. Step 7 : build/typecheck tadviewer + tad-app, tests reltab verts, commits atomiques, revue.
8. Release 0.0.11 (docs, bump, build, tag `v0.0.11`, push → CI publie GitHub release).

## Références de fichiers
- Pattern backend : `packages/reltab/src/splom.ts` (`sampleQuery`, `constantOrNullColIds`, `getCorrelationMatrix`) et `packages/reltab/src/confusionMatrix.ts` (comptes retournés, composés côté front).
- Pattern UI : `packages/tadviewer/src/components/CorrelationMatrixDialog.tsx` (`getViewQueryAndSchema`, `splomColKind`, MultiSelect groupé, slider échantillonnage `recomputeOnRelease`, avis colonnes exclues).
- Pattern reload → re-render : `packages/tadviewer/src/components/GridPane.tsx` (montage dialog conditionné + `onRequestReloadDialog`).
- Wiring : `packages/tad-app/app/appMenu.ts`, `packages/tad-app/src/electronRenderMain.tsx` (IPC `open-knowledge-graph`), AppState `knowledgeGraphDialogOpen`.
- Nouvelles deps (root, hoisting Lerna) : `sigma`, `graphology`, `graphology-layout-forceatlas2`, `graphology-metrics`.

## Gotchas
- Toutes libs MIT, pas de dépendance native → pas d'impact electron-builder.
- Backend : clé composite via `concat_ws('\u001f', ...)` + `IS NOT NULL` (toutes les colonnes clés non-null sinon ligne absente). Propriétés `CAST(... AS VARCHAR)`.
- NULL ne créent pas de nœuds.
- `npx tsc` dans tadviewer vide `dist` : re-copier `src/slickgrid.scss` → `dist/slickgrid.scss` avant `build-prod`.
- `dist` gitignoré ; ne pas committer. package.json(s) indentation 2 espaces.
- Pré-existant non commité sur master (rename `vibe/confusion/confusion-matrix-plan.md`, exemple .xlsx) : **ne pas committer**.
