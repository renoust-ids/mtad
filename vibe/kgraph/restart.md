Reprends le développement de la fonctionnalité **Knowledge Graph** dans le repo MTad (monorepo Lerna : `packages/reltab`, `packages/tadviewer`, `packages/tad-app`).

**Préalable absolu (obligatoire)** : lis en tout premier le fichier `vibe-instructions.md` à la racine, puis `vibe/kgraph/STATE_HANDOFF.md`. C'est mon journal d'état. Suis les règles strictes (TypeScript strict, TDD, commits atomiques en Conventional Commits, un commit par étape validée, backend puis UI séparés).

**Branche** : `kgraph` (créée depuis `master` @ `648b03e`, app version 0.0.10 ; release cible 0.0.11). C'est déjà la branche courante.

**Plan complet** : `vibe/kgraph/KNOWLEDGE_GRAPH_PLAN.md`. Lis-le en entier. Le design a été entièrement validé avec l'utilisateur — ne remets pas en question les décisions.

**Fonctionnalité** : vue analytique "Knowledge Graph" (menu Analytics → Knowledge Graph) = graphe **bipartite** entre nœuds clés et nœuds propriétés, rendu force-directed. **Points clés du design validé** :
- **Défaut = par-colonne** : chaque colonne clé est source de nœuds (une valeur distincte non-null = un nœud clé) ; chaque colonne propriété pareil. Une ligne relie chacune de ses valeurs de clés à chacune de ses valeurs de propriétés.
- **Option "Composite key"** : regroupe les colonnes clés en UN nœud par ligne, concat des **parties non-null uniquement**, labels joints par `, `.
- **Poids** : nœud = occurrence (nb de lignes non-null) ; arête = co-occurrence (nb de lignes où clé ET prop non-null). NULL ne créent jamais de nœud.
- **Taille** : ∝ occurrence + toggle occurrence/centralité (**degré OU betweenness**, sélectionnable).
- Nœuds isolés : masqués par défaut + toggle "Show isolated nodes".
- Filtres min occurrences **séparés** nœuds / arêtes (min edge weight = seuil co-occurrence).
- Échantillonnage slider 500–20000 + "Use all rows" + "Apply Table Filters".
- **Biblio** : **Sigma.js + graphology** (MIT) — layout ForceAtlas2, metrics. Perf ~10k nœuds / ~50k arêtes.

**Étapes (TDD, dans cet ordre)** :
1. **Backend** : `packages/reltab/src/knowledgeGraph.ts` (nouveau, exporté depuis `reltab.ts`) avec `getKnowledgeGraphData(dsConn, baseQuery, schema, keyColIds, propColIds, opts)` où `opts.keyMode: "per-column"|"composite"`, retourne `{nodes, edges, totalRows}`. SQL : per-column (occurrence par colonne, co-occurrence par paire) et composite (`concat_ws('\u001f', NULLIF(...))` sur parties non-null, `WHERE ... OR ...` pas de ligne toute-nulle). Réutilise `sampleQuery`/`splomScatterQuery` de `splom.ts` pour l'échantillonnage. Tests dans `packages/reltab/test/knowledgeGraph.test.ts` : unit (SQL généré, comptes, NULL) + intégration DuckDB (per-column, composite partiellement nulle, échantillonnage, seuils). **Vérifie : `cd packages/reltab && npm test`**.
2. Export `reltab.ts` + tests verts.
3. **Frontend tadviewer** : AppState `knowledgeGraphDialogOpen` + actions (`open/closeKnowledgeGraph`, `loadKnowledgeGraphData`) dans `actions.ts`, pattern du Correlation Matrix (`getViewQueryAndSchema`, `splomColKind`).
4. **Dialog** `packages/tadviewer/src/components/KnowledgeGraphDialog.tsx` : 2 MultiSelect react-select (Key/Property columns) + contrôles (composite, sample, min occ, min edge, size by, show isolated) + assemblage `graphology.Graph` + ForceAtlas2 + rendu `Sigma` (conteneur ref-managed, cleanup). Patterns : `CorrelationMatrixDialog.tsx`, DataGrid renderer.
5. **Wiring** : menu "Knowledge Graph" dans Analytics (`appMenu.ts` → `open-knowledge-graph`), IPC `electronRenderMain.tsx`, montage + `handleCloseKnowledgeGraph` dans `GridPane.tsx`.
6. **Build/typecheck tadviewer + tad-app** (+ tests reltab verts), commits atomiques, revue, puis **release 0.0.11**.

**Gotchas à connaître (lues dans le handover)** : toutes libs MIT, pas de dépendance native (électron-builder OK). `npx tsc` dans tadviewer vide `dist` → re-`cp src/slickgrid.scss dist/slickgrid.scss` avant `build-prod`. `dist` gitignoré (ne pas committer). package.json(s) indentation 2 espaces. Ne pas committer les fichiers pré-existants non commités (`examples/Buddha Face*.xlsx`).

Travaille méthode TDD, à chaque étape validée tu fais un commit atomique puis tu mets à jour `vibe/kgraph/STATE_HANDOFF.md` et `AGENT_DEV_LOG.md`.
