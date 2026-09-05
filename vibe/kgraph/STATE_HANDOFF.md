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
- **Step 3 DONE (commit `f4c31bf`)** : `AppState.ts` (`knowledgeGraphDialogOpen` aux 3 endroits) + `actions.ts` (`openKnowledgeGraph`, `closeKnowledgeGraph`, `KnowledgeGraphViewData`, `loadKnowledgeGraphData`, pattern Correlation Matrix : `getViewQueryAndSchema`, `DataSourceConnection`, `StateRef`).
- **Step 4 DONE (commit `faacb79`)** : `packages/tadviewer/src/components/KnowledgeGraphDialog.tsx` (840 lignes) + deps `sigma@3.0.3`, `graphology@0.26.0`, `graphology-layout-forceatlas2@0.10.1`, `graphology-metrics@2.4.2` dans `packages/tadviewer/package.json`. `npm run tsc` ✓ (0 erreur), `npm run build-dev` ✓ (4.9s, 14 warnings sass pré-existants).

## Décisions d'implémentation frontend (issues en cours de route)
- **Env cassé réparé** : un `npm install` à la racine avait purgé le `node_modules` hoisté (oneref/immutable/react/etc. disparus). Restauré via `npm run bootstrap` (lerna bootstrap --hoist) → deps app + graph deps re-hoistées à la racine. Ne pas rejouer `npm install` à la racine au hasard.
- Dialog : 2 MultiSelect react-select (Key columns / Property columns), toggle "Composite key", sliders min node occurrence / min edge co-occurrence (NumericInput + Slider), slider sample 500–20000 + "Use all rows" + "Apply Table Filters", "Size" HTMLSelect occurrence/centrality (+ sous-sélecteur Degree/Betweenness), switch "Show isolated nodes". Stats line : nodes · edges · total rows.
- **Filtres min occurrences appliqués côté front uniquement** (pas dans la requête) → ajuster les sliders ne re-queried pas (exploration instantanée). `filterKGData()` pur + `useMemo counts`.
- **FA2 a besoin de positions initiales** (`Float32Array` NaN sinon) : nœuds seedés `x/y = (rand-0.5)*10` avant `forceAtlas2.assign(graph, { iterations, settings: { ...inferSettings(graph), edgeWeightInfluence: 1 }, getEdgeWeight: "weight" })`. Iterations adaptatives : 200 (>5000 nœuds) / 400 (>2000) / 600.
- Centralité : `degreeCentrality.assign` (normalisé, stocké en attr `degree` — tooltip affiche le degré brut via `graph.degree(n)`) ; `betweennessCentrality.assign` avec `getEdgeWeight: "weight"` seulement si sizeBy=centrality & betweenness.
- Graph : `new Graph()` (undirected simple), garde `hasEdge()` contre doublons, taille nœuds ∝ occurrence (`makeSizeScale` min-max → [2,26]), épaisseur arêtes ∝ co-occurrence → [0.5,4], couleurs key=`#137cbd` / prop=`#d9822b`, arêtes grises.
- Rendu : sous-composant `GraphView` (React.memo) — `new Sigma(graph, container, { renderLabels:false, renderEdgeLabels:false })`, listen `enterNode`/`leaveNode` → tooltip, cleanup `off()` + `kill()`, `container.innerHTML=""` avant re-création. Pas de rendu quand `graph.order === 0` (message "No graph to display").
- `viewSettings` mémoïsé (useMemo sur ses 5 valeurs) sinon le memo GraphView casse à chaque render parent.
- Typecheck des composants : `include` tsconfig tadviewer (`./src/*`) ne couvre pas `src/components/` ; le vrai gate est ts-loader dans le build webpack (le build dev passe). Les 2 erreurs TS7006 "pré-existantes" de `actions.ts` mentionnées au handover étaient un artefact du env cassé — avec les deps restaurées, `npm run tsc` est **0 erreur**.

## En cours / Bloqué
- Aucun blocage. Prochaine étape : **Step 5 — wiring** : menu "Knowledge Graph" dans Analytics (`appMenu.ts` → `open-knowledge-graph`), IPC `electronRenderMain.tsx`, montage + `handleCloseKnowledgeGraph` dans `GridPane.tsx`.

## Prochaines étapes (ordre)
1. ~~Step 1 : backend reltab~~ DONE.
2. ~~Step 2 : export + tests~~ DONE.
3. ~~Step 3 : AppState + actions~~ DONE (`f4c31bf`).
4. ~~Step 4 : Dialog (pickers + contrôles + assemblage graphology + FA2 + rendu Sigma)~~ DONE (`faacb79`) — inclut le rendu Sigma/FA2/centralité.
5. Step 5 : wiring menu + IPC + GridPane.
6. Step 6 : build/typecheck tadviewer + tad-app, tests reltab verts, commits atomiques, revue.
7. Release 0.0.11 (docs, bump, build, tag `v0.0.11`, push → CI publie GitHub release).

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
