# Knowledge Graph (KGraph) Feature - Implementation Plan

Branche : `kgraph`. Date : 2026-09-04. Version courante de l'app : 0.0.10 (cible release : 0.0.11).

## Overview
Ajouter une vue analytique **"Knowledge Graph"** (menu Analytics → Knowledge Graph) qui affiche un **graphe bipartite** entre des **nœuds clés** (valeurs distinctes de colonnes clés) et des **nœuds propriétés** (valeurs distinctes de colonnes propriétés), avec un rendu **force-directed** (layout ForceAtlas2 via graphology, rendu WebGL via Sigma.js).

Ce n'est PAS un graphe des relations du schéma : c'est un graphe d'**occurrences dans les données**. Chaque **ligne** relie ses valeurs de colonnes clés à ses valeurs de colonnes propriétés (arête = co-occurrence sur la même ligne). Poids des nœuds = **occurrence** (nb de lignes où la valeur est non-null) ; poids des arêtes = **co-occurrence** (nb de lignes où la valeur clé ET la valeur propriété sont toutes deux non-null).

## Décisions design validées (questions répondues)

### Structure des nœuds
- **DEFAUT — aucune clé composite** : chaque colonne clé sélectionnée est source de nœuds. Chaque **valeur distincte non-null** d'une colonne clé = **UN nœud clé**. Chaque valeur distincte non-null d'une colonne propriété = **UN nœud propriété**. Une ligne crée une arête entre **chacune** de ses valeurs de colonnes clés et **chacune** de ses valeurs de colonnes propriétés.
- **OPTION "Composite key" (utilisateur)** : regroupe **toutes** les colonnes clés en **UN nœud clé par ligne**, construit par concaténation de la **partie non-null uniquement**, label = valeurs jointes par `, `.
- **NULL** ne créent **jamais** de nœud (ni en mode par-colonne, ni en mode composite) et donc pas d'arêtes incidentes.
- **Clé partiellement nulle** :
  - mode par-colonne : chaque colonne traitée indépendamment (les valeurs non-null de chaque colonne clé deviennent des nœuds) ;
  - mode composite : on n'utilise que la **partie non-null** de la clé (concat des valeurs non-null ; ex. `(A=x, B=NULL)` → nœud `x`).
- **Label nœud clé composite** : valeurs jointes par `, ` (ex. `Sales, 2023`).

### Poids, taille, filtres
- **Poids** : nœud = **occurrence** (nb de lignes où la valeur est non-null) ; arête = **co-occurrence**.
- **Taille des nœuds** : ∝ **occurrence** par défaut, avec toggle **"Size by" : Occurrence / Centrality**.
- **Centralité** : **les deux, sélectionnable** — sous-sélecteur **Degree / Betweenness** quand "Size by = Centrality" (`graphology-metrics`).
- **Nœuds isolés** (aucune arête qui survit aux filtres) : **masqués par défaut**, **rendu optionnel** via toggle "Show isolated nodes".
- **Filtres min occurrences séparés** : **Min node occurrence** (threshold nœuds) ET **Min edge weight** (threshold arêtes = seuil de co-occurrence à afficher).

### Rendu & échantillonnage
- **Biblio** : **Sigma.js + graphology** (MIT). Cosmograph (CC-BY-NC-4.0 non-commercial) écarté ; d3-force/custom SVG écarté.
- **Perf cible** : ~**10k nœuds / ~50k arêtes**, pan/zoom fluide via WebGL. L'échantillonnage + les seuils min servent à rester sous ce plafond.
- **Échantillonnage** : optionnel, limite les **lignes utilisées** (`ORDER BY random() LIMIT n`, slider 500–20000, recompute au relâchement) + switch "Use all rows" + switch "Apply Table Filters" (patterns Correlation Matrix).
- **Sélection de colonnes** : deux MultiSelect `react-select` groupés (comme Correlation Matrix) : **Key columns** et **Property columns**.
- **Couleurs** : nœuds clés = une couleur, nœuds propriétés = une autre (bipartite). Épaisseur des arêtes ∝ poids.

## Key Requirements
1. **Menu Item** : "Knowledge Graph" dans Analytics (après "Correlation Matrix").
2. **Graphe bipartite** : nœuds clés + nœuds propriétés, arêtes = co-occurrence, layout ForceAtlas2, rendu WebGL.
3. **Column picker** : deux MultiSelect réutilisant le pattern Correlation Matrix, un pour les clés, un pour les propriétés.
4. **Contrôles du dialog** :
   - Mode clé : **switch "Composite key"** (défaut off = par-colonne).
   - **Échantillonnage** : slider 500–20000 (`recomputeOnRelease`) + switch "Use all rows".
   - **Switch "Apply Table Filters"** (reuse `viewState.dataViewQuery`).
   - **Min node occurrence** (threshold) et **Min edge weight** (threshold), sliders séparés.
   - **"Size by : Occurrence / Centrality"** (toggle) + sous-sélecteur **Degree / Betweenness**.
   - **"Show isolated nodes"** (toggle, défaut off).
5. **Interaction du canvas** : pan/zoom (Sigma), hover → tooltip (label + occurrence/weight), taille des nœuds ∝ occurrence ou centralité, épaisseur des arêtes ∝ poids.

## Implementation Steps

### Step 1: Backend reltab — comptes d'occurrence et de co-occurrence
**File** : `packages/reltab/src/knowledgeGraph.ts` (nouveau), exporté depuis `reltab.ts`.

```ts
export type KGNodeGroup = "key" | "prop";
export type KGKeyMode = "per-column" | "composite";

export interface KnowledgeGraphNode {
  id: string;            // id stable : "k:<colId>:<value>" (per-column) ou "k:<composite>" (composite) ; "p:<propColId>:<value>"
  group: KGNodeGroup;
  label: string;         // valeur, ou clé composite jointe par ", "
  colId?: string;        // colonne d'origine (per-column)
  occurrence: number;    // nb de lignes où la valeur est non-null
}

export interface KnowledgeGraphEdge {
  source: string;        // id nœud clé
  target: string;        // id nœud prop
  weight: number;        // co-occurrence (nb de lignes clé+prop non-null)
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  totalRows: number;
}

export interface KnowledgeGraphOptions {
  keyMode?: KGKeyMode;    // "per-column" (défaut) | "composite"
  sampleLimit?: number;   // >0 => échantillonnage ORDER BY random() LIMIT n
  minNodeOccurrence?: number; // filtre nœuds côté backend
  minEdgeWeight?: number; // filtre arêtes (co-occurrence) côté backend
}

export async function getKnowledgeGraphData(
  dsConn, baseQuery, schema, keyColIds: string[], propColIds: string[],
  opts?: KnowledgeGraphOptions
): Promise<KnowledgeGraphData>
```

#### SQL généré (base = requête pivot-aware échantillonnée, patterns `splomScatterQuery`/`sampleQuery`)
- **Mode « per-column » (défaut)** : occurrence des valeurs clés par colonne, occurrence des valeurs propriétés par colonne, et co-occurrence par paire (colonne clé × colonne propriété) :
  ```sql
  -- Occurrence nœuds clés (par colonne clé "k1") :
  SELECT "k1" AS __v, count(*) AS __occ FROM ( base ) AS __kg WHERE "k1" IS NOT NULL GROUP BY "k1";
  -- Occurrence nœuds propriétés (par colonne prop "p") :
  SELECT CAST("p" AS VARCHAR) AS __v, count(*) AS __occ FROM ( base ) AS __kg WHERE "p" IS NOT NULL GROUP BY CAST("p" AS VARCHAR);
  -- Co-occurrence (arêtes) paire (colonne clé "k1", colonne prop "p") :
  SELECT "k1" AS __k, CAST("p" AS VARCHAR) AS __v, count(*) AS __w
  FROM ( base ) AS __kg WHERE "k1" IS NOT NULL AND "p" IS NOT NULL GROUP BY "k1", CAST("p" AS VARCHAR);
  ```
- **Mode « composite »** : clé = concat de la **partie non-null** des colonnes clés :
  ```sql
  -- Occurrence nœuds clés composites (sauf ligne où TOUTES les clés sont nulles) :
  SELECT concat_ws('\u001f', NULLIF(CAST("k1" AS VARCHAR),''), NULLIF(CAST("k2" AS VARCHAR),'')) AS __k, count(*) AS __occ
  FROM ( base ) AS __kg WHERE "k1" IS NOT NULL OR "k2" IS NOT NULL GROUP BY __k;
  -- Label = valeurs non-null jointes par ", " ; id = concat avec séparateur interne échappé.
  -- Co-occurrence (arêtes) :
  SELECT concat_ws('\u001f', NULLIF(CAST("k1" AS VARCHAR),''), NULLIF(CAST("k2" AS VARCHAR),'')) AS __k,
         CAST("p" AS VARCHAR) AS __v, count(*) AS __w
  FROM ( base ) AS __kg WHERE ("k1" IS NOT NULL OR "k2" IS NOT NULL) AND "p" IS NOT NULL
  GROUP BY __k, CAST("p" AS VARCHAR);
  ```
- **Échantillonnage** : si `sampleLimit > 0`, appliquer `ORDER BY random() LIMIT sampleLimit` sur la source avant les comptes (réutiliser `sampleQuery` de `splom.ts`).
- **Filtres** : `minNodeOccurrence` (sur `__occ` des nœuds) et `minEdgeWeight` (sur `__w` des arêtes) appliqués côté backend (HAVING) et/ou post-traitement ; le front ré-applique les mêmes seuils pour permettre des ajustements sans re-requête.

### Step 2: Tests backend (TDD)
**File** : `packages/reltab/test/knowledgeGraph.test.ts`
- Tests unitaires avec driver mock : vérifie le SQL généré (per-column vs composite, `IS NOT NULL`, `concat_ws` non-null only, `CAST AS VARCHAR`, GROUP BY), les comptes retournés, la gestion NULL.
- Tests d'intégration DuckDB avec un petit CSV :
  - mode per-column : occurrence nœuds clés + nœuds propriétés, co-occurrence des arêtes, valeur nulle pas de nœud ;
  - mode composite : une clé partiellement nulle → nœud = partie non-null uniquement ; toutes clés nulles → pas de nœud ;
  - échantillonnage (`n <= sampleLimit`) ; filtres minNodeOccurrence / minEdgeWeight.

### Step 3: Frontend tadviewer — actions + AppState + dialog
**Files** : `packages/tadviewer/src/actions.ts`, `AppState.ts`, nouveau `packages/tadviewer/src/components/KnowledgeGraphDialog.tsx`.
- AppState : champ `knowledgeGraphDialogOpen`.
- Actions : `openKnowledgeGraph`, `closeKnowledgeGraph`, `KnowledgeGraphViewData { data: reltab.KnowledgeGraphData }`, `loadKnowledgeGraphData(dbc, query, schema, keyColIds, propColIds, opts) -> Promise<KnowledgeGraphViewData>` (réutilise `getViewQueryAndSchema`/`splomColKind` du Correlation Matrix).
- Dialog `KnowledgeGraphDialog.tsx` :
  - Deux **MultiSelect react-select** ("Key columns", "Property columns"), groupés par kind (pattern `CorrelationMatrixDialog`).
  - Contrôles : "Composite key" (toggle), sample slider 500–20000 `recomputeOnRelease`, "Use all rows", "Apply Table Filters", min node occurrence, min edge weight, "Size by Occurrence/Centrality", sous-sélecteur Degree/Betweenness, "Show isolated nodes".
  - **Assemblage du graphe** : builder de `graphology.Graph` (nœuds clés + nœuds prop, arêtes pondérées, filtre nœuds isolés, seuils), **ForceAtlas2** (`graphology-layout-forceatlas2`), sizing par occurrence ou **centralité** (degré ou betweenness via `graphology-metrics/centrality`).
  - **Rendu Sigma** : conteneur ref-managed, `new Sigma(graph, container)` avec cleanup au démontage (pattern du DataGrid renderer), pan/zoom, hover tooltip, taille/épaisseur ∝ poids.

### Step 4: Wiring — menu + IPC + GridPane
- `packages/tad-app/app/appMenu.ts` : item "Knowledge Graph" dans Analytics (après "Correlation Matrix") → `focusedWindow?.webContents.send("open-knowledge-graph", {})`.
- `packages/tad-app/src/electronRenderMain.tsx` : `ipcRenderer.on("open-knowledge-graph", () => actions.openKnowledgeGraph(stateRef))`.
- `packages/tadviewer/src/components/GridPane.tsx` : montage de `KnowledgeGraphDialog` conditionné par `knowledgeGraphDialogOpen` + `handleCloseKnowledgeGraph`.

## Dépendances à ajouter (packages/tadviewer/package.json)
Toutes **MIT** (à installer au niveau racine via Lerna hoisting, `npm install` à la racine) :
- `sigma` (WebGL renderer)
- `graphology` (modèle de données graphe)
- `graphology-layout-forceatlas2` (layout force-directed)
- `graphology-metrics` (centralité degré/betweenness)

**Compat Electron/webpack** : pure JS/TypeScript, pas de dépendance native → compatible electron-builder (pas de rebuild natif). Vérifier au build que le bundle webpack inclut bien sigma/graphology (pas de `externals` requis).

## Étapes / commits prévus (TDD, atomiques sur `kgraph`)
1. Backend `knowledgeGraph.ts` + tests (SQL per-column/composite + intégration DuckDB).
2. Export depuis `reltab.ts` + typecheck/tests reltab verts.
3. AppState + actions (`knowledgeGraphDialogOpen`, `loadKnowledgeGraphData`).
4. Dialog (pickers colonnes + contrôles) — UI seule.
5. Rendu Sigma + ForceAtlas2 + sizing centralité (degré/betweenness).
6. Wiring menu + IPC + GridPane.
7. Build/typecheck tadviewer + tad-app, tests reltab, revue, commits atomiques.
