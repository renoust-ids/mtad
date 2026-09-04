# Correlation Matrix Feature - Implementation Plan

Branche : `correlation`. Date : 2026-09-04.

## Overview
Ajouter une vue analytique **"Correlation Matrix"** (menu Analytics → Correlation Matrix) qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table. Le design reprend l'architecture de la **Confusion Matrix** (grille heat-map colorée, cases cliquables pour filtrer), mais chaque ligne/colonne correspond à **une colonne de la table** (pas à un bin), et la valeur de chaque case est un **indice de corrélation** mesuré exactement comme dans la **SPLOM**.

## Décisions de design validées (questions répondues)
1. **Périmètre des colonnes** : toutes les colonnes, comme la SPLOM — Pearson `r` (num×num), `eta` (cat×num), Cramér's `V` (cat×cat).
2. **Classement (rank)** : un **mode toggle** Pearson / Spearman (comme le toggle Count/Rows/Cols de la Confusion Matrix) switch toute la matrice entre `corr()` et la corrélation de rang (Spearman). Spearman s'applique aux paires num/temporal ; les paires catégorielles gardent eta/V inchangées.
3. **Échantillonnage** : optionnel, borne les **lignes utilisées pour le calcul de la corrélation elle-même** (`ORDER BY random() LIMIT n`) sauf si "Use all rows". (Contrairement à la SPLOM qui corrèle sur toutes les lignes.)
4. **Colonnes nulles/constantes** : exclues du picker, mais **affichées dans une liste d'avis** dans le dialog (chacune nommée), pour expliquer pourquoi elles sont indisponibles.

## Key Requirements
1. **Menu Item** : "Correlation Matrix" dans le menu Analytics (après "Scatter Plot Matrix").
2. **Layout grille** : matrice N×N, lignes/colonnes = colonnes de la table choisies (diagonale = 1), valeurs = corrélation, heat-map colorée type Confusion Matrix, en-têtes de lignes/colonnes = noms de colonnes (style SPLOM).
3. **Column picker réutilisé** : le MultiSelect `react-select` de la SPLOM (groupé "Numeric & temporal"/"Categorical"), comme demandé.
4. **Contrôles** :
   - Mode toggle **Pearson / Spearman** (corrélation de rang).
   - Switch **"Use all rows"** (échantillonnage optionnel).
   - Switch **"Apply Table Filters"**.
   - **Min non-null occurrence** (threshold global) : les paires avec `n` (nombre de lignes où les deux colonnes sont non-null) < threshold sont **blanquées**.
5. **Colonnes toujours-nulles / à valeur unique** : exclues du picker + liste d'avis dans le dialog.
6. **Filtrage analytics** : cliquer une case → filtre croisé sur les deux colonnes concernées (comme la Confusion Matrix, via `setAnalyticsClauses`).

## Implementation Steps

### Step 1: Backend reltab — étendre le calcul de corrélation
**File** : `packages/reltab/src/splom.ts`

Modifier/étendre `getCorrelationMatrix` (actuellement `(dsConn, baseQuery, schema, matrixColIds): Promise<PairCorrelation[]>`) pour accepter des options et supporter Spearman + échantillonnage :

```ts
export interface CorrelationMatrixOptions {
  rank?: boolean;          // true => Spearman (corrélation de rang) sur num×num
  sampleLimit?: number;    // 0/undefined => pas d'échantillonnage
  minOccurrence?: number;  // paires avec n < minOccurrence → strength null (blank)
}

export async function getCorrelationMatrix(
  dsConn, baseQuery, schema, matrixColIds,
  opts?: CorrelationMatrixOptions
): Promise<PairCorrelation[]>
```

Détails :
- **Pearson** : `corr(x, y)` existant (inchangé).
- **Spearman** : corrélation de rang. Remplacer `corr()` par `corr(rank(x) OVER (...), rank(y) OVER (...))` ou utiliser la formule des rangs moyens. Implémentation SQL propre dans une variante de `pairwiseCorrelationSql` (une fonction `pairwiseRankCorrelationSql`). Gérer les **rangs moyens** en cas d'ex-æquo (average rank).
- **Échantillonnage** : si `sampleLimit > 0`, appliquer `ORDER BY random() LIMIT sampleLimit` sur la source (`splomScatterQuery`) avant le calcul, pour que l'indice soit calculé sur l'échantillon. (Decision 3.)
- **Min non-null occurrence** : après calcul, pour chaque paire, si `n < minOccurrence`, forcer `strength = null` (case blanquée). `n` = `regr_count` pour num×num, `__n` pour eta/V.
- **eta / V inchangées** en mode Spearman (les paires catégorielles ne sont pas concernées par le classement).
- `numOrNull` convertit déjà NaN→null (colonne constante / variance nulle) => corrige automatiquement les colonnes à valeur unique du point de vue de la paire.
- Ajouter si besoin des helpers exportés pour détecter les colonnes toujours-nulles / constantes (voir Step 2), par ex. `constantOrNullColIds(baseQuery, schema, colIds): Promise<string[]>` ou un flag dans la réponse.

### Step 2: Backend reltab — détecter les colonnes null/constantes
**File** : `packages/reltab/src/splom.ts` (ou nouveau `correlationMatrix.ts`)

Ajouter une fonction pour identifier les colonnes "toujours-nulles" ou "à valeur unique" afin de (a) les exclure du picker et (b) les lister dans l'avis :
- col "toujours-nulle" : `count(non-null) = 0`.
- col "constante" : un seul `distinct` non-null.
Une requête par sélection de colonnes, ex. `SELECT count(<c>) ... ` par colonne, ou une requête agrégée groupée. Retourner la liste des `cid` concernées.

(IDEA : ce helper peut être réutilisé par le dialog SPLOM plus tard, mais hors scope ici.)

### Step 3: AppState
**File** : `packages/tadviewer/src/AppState.ts`
- Interface : ajouter `correlationMatrixDialogOpen: boolean` (près de `confusionMatrixDialogOpen` ~l.132).
- Default : `correlationMatrixDialogOpen: false` (~l.161).
- Classe : `public readonly correlationMatrixDialogOpen!: boolean;` (~l.192).
- **Pas de champs de données** (le data vit dans le state local du dialog, comme SPLOM/Confusion).

### Step 4: Actions
**File** : `packages/tadviewer/src/actions.ts`
- `openCorrelationMatrix(stateRef)` / `closeCorrelationMatrix(stateRef)` — pattern `openSplom`/`closeSplom` (l.881-891), gardent sur `viewState != null`.
- `CorrelationMatrixViewData` :
  ```ts
  export interface CorrelationMatrixViewData {
    data: reltab.PairCorrelation[];          // corrélations (upper triangle)
    constantOrNullColIds?: string[];         // colonnes exclues listées à l'utilisateur
  }
  ```
- `loadCorrelationMatrixData(dbc, query, schema, colIds, opts)` : appelle `reltab.getCorrelationMatrix(...)` (+ helper Step 2) et retourne `{ data, constantOrNullColIds }`.
- `setCorrelationMatrixFilter(rowArg, colArg, stateRef)` / `clearCorrelationMatrixFilter(rowColId, colColId, stateRef)` : pattern `setConfusionMatrixFilter`/`clearConfusionMatrixFilter` (l.1112-1137), passant par `setAnalyticsClauses`.

### Step 5: Dialog component
**File** : `packages/tadviewer/src/components/CorrelationMatrixDialog.tsx` (nouveau)

Props (pattern ConfusionMatrixDialog) :
```ts
interface CorrelationMatrixDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
  onFilter: (rowArg: ScatterAxisFilterArg, colArg: ScatterAxisFilterArg) => void;
  onClearFilter: (rowArg: ScatterAxisFilterArg, colArg: ScatterAxisFilterArg) => void;
}
```

State local : `selectedCols: string[]` (multi), `rank: boolean` (Pearson/Spearman), `useAllRows`, `applyTableFilters`, `minOccurrence`, `data`, `loading`, `error`, `hoverInfo`/`selectedCell`.

Layout (Blueprint `Dialog`, style ConfusionMatrixDialog) :
```
┌──────────────────────────────────────────────────────────────┐
│ Correlation Matrix                                            │
├──────────────────────────────────────────────────────────────┤
│ Matrix columns (4/24)  [ MultiSelect react-select ...       ] │
│   ⚠ Always-null / constant columns (not usable): Rec, Tmp   │ ← avis
│                                                              │
│ Correlation: (◉ Pearson  ○ Spearman)                         │
│ Min non-null occurrence: [slider/NumericInput]               │
│ ☐ Use all rows     ☐ Apply Table Filters                     │
│                                                              │
│        [ colA ] [ colB ] [ colC ]                            │
│ [colA]   [1.00]   [0.87]   [0.12]                            │
│ [colB]   [0.87]   [1.00]   [0.03]                            │
│ [colC]   [0.12]   [0.03]   [1.00]                            │
│  … heat-map cellColor, diagonal 1.00, cells cliquables …     │
├──────────────────────────────────────────────────────────────┤
│ [Close]                                                      │
└──────────────────────────────────────────────────────────────┘
```

Détails UI :
- **Column picker** : réutiliser le MultiSelect `react-select` de la SPLOM (groupes numeric/temporal vs categorical, `ColOption`, `CheckboxOption`, `MAX_MATRIX_COLS`). Les colonnes null/constantes (Step 2) sont **exclues** de `options` et du picker.
- **Avis** : liste des colonnes exclues (nom affiché) affichée dans le dialog (Decision 4).
- **Mode toggle** : `HTMLSelect` ou groupe Radio "Pearson / Spearman" → `rank` (Decision 2).
- **Min non-null occurrence** : `NumericInput`/`Slider`, default 1 (pattern `minOccurrence` ConfusionMatrix).
- **Sampling** : `Switch "Use all rows"` (pattern ConfusionMatrix `useAllRows`) + `sampleLimit` par défaut `DEFAULT_SAMPLE = 20000`.
- **Grille** : layout grid type SPLOM (en-têtes rotatifs −45°) mêlé au heat-map ConfusionMatrix (`cellColor`). Diagonale = 1.00. Symétrique : value(i,j) = corrélation de la paire (peu importe le triangle, on renvoie la même valeur).
- **Chargement** : `useEffect` sur `matrixKey`/`rank`/`minOccurrence`/`useAllRows`/`applyTableFilters`, guard sur `selectedCols.length >= 2`, appelle `loadCorrelationMatrixData`. Blank tant que selectedCols < 2.
- **Filtrage** : cellule cliquée → `onFilter(rowArg, colArg)` avec `ScatterAxisFilterArg` (`{ colId, range?, values? }`). Pour des colonnes numériques, un filtre de plage n'a pas de sens sur une longueur de corrélation — voir Points ouverts (filtrer sélectionne probablement la paire de colonnes via un état). `onClearFilter` via bouton dans le dialog.

### Step 6: Wiring GridPane
**File** : `packages/tadviewer/src/components/GridPane.tsx`
- Importer `CorrelationMatrixDialog` (près l.17).
- `handleCloseCorrelationMatrix = () => actions.closeCorrelationMatrix(stateRef)` (près l.350-362).
- Monter le dialog (près l.667-690) avec `appState`, `stateRef`, `onClose`, `onFilter`, `onClearFilter` (pattern ConfusionMatrixDialog).
- Ajouter `oldProps.appState.correlationMatrixDialogOpen === nextProps.appState.correlationMatrixDialogOpen` au guard de mémoïsation `gridPanePropsEqual` (l.712-717).

### Step 7: Menu
**File** : `packages/tad-app/app/appMenu.ts`
- Ajouter `{ label: "Correlation Matrix", click: () => focusedWindow?.webContents.send("open-correlation-matrix", {}) }` dans `analyticsSubmenu` (après "Scatter Plot Matrix", l.162-167).

### Step 8: IPC handler
**File** : `packages/tad-app/src/electronRenderMain.tsx`
- `ipcRenderer.on("open-correlation-matrix", () => actions.openCorrelationMatrix(stateRef));` (près l.331-341).

## Tests (TDD)
1. `packages/reltab/src/splom.ts` / ou `__tests__` : tests unitaires du calcul de corrélation avec options :
   - Pearson num×num (valeur attendue).
   - **Spearman** vs Pearson sur des données monotones non linéaires (les deux diffèrent, Spearman = 1 sur relation monotone stricte).
   - **Min non-null occurrence** : paire avec beaucoup de nulls → blank (strength null) sous le seuil.
   - **Échantillonnage** : sampleLimit borne `n` (pas supérieur à la limite) ; avec `sampleLimit=0` n = count total.
   - Colonne constante / toujours-nulle → strength null (NaN→null) + helper constant/null detection.
2. Typecheck : `npm test` dans `reltab`, puis typecheck `tadviewer` + `tad-app`, build prod `tad-app`.
3. Test manuel : table simple, vérifier diagonal=1, symétrie, toggle Pearson/Spearman change les valeurs, feuille avec colonne nulle/constante → avis affiché.

## Files to Create/Modify
1. **Modify** : `packages/reltab/src/splom.ts` (+ éventuellement `correlationMatrix.ts` nouveau, exporté dans `reltab.ts`)
2. **Modify** : `packages/tadviewer/src/AppState.ts`
3. **Modify** : `packages/tadviewer/src/actions.ts`
4. **Create** : `packages/tadviewer/src/components/CorrelationMatrixDialog.tsx`
5. **Modify** : `packages/tadviewer/src/components/GridPane.tsx`
6. **Modify** : `packages/tad-app/app/appMenu.ts`
7. **Modify** : `packages/tad-app/src/electronRenderMain.tsx`
8. **Modify** : `packages/reltab/src/reltab.ts` (si nouveau fichier backend)

## Dependencies
- Existant : `getCorrelationMatrix`, `splomScatterQuery`, `pairwiseCorrelationSql`, `etaPairSql`, `cramerPairSql`, `numOrNull`, `splomColKind` (SPLOM) ; `ConfusionMatrixDialog` (pattern UI + `setAnalyticsClauses`) ; react-select (déjà présent) ; BlueprintJS.

## Risks & Mitigations
1. **Spearman SQL** : corrélation de rang avec ex-æquo (rangs moyens) délicate en pur SQL DuckDB (`rank() OVER`). → Implémenter avec `rank()`/`dense_rank()` sur chaque colonne et `corr()` sur les rangs ; valider par test unitaire contre une référence (ex. scipy/numpy en commentaire de test).
2. **Échantillonnage ≈ corrélation approximative** : assumé (Decision 3). Le tooltip/de l'UI peut indiquer "sampled".
3. **Colonnes toujours-nulles** : le helper de détection doit gérer les tables vides (count=0). → Retourner liste vide et laisser la grille vide.
4. **Filtrage de cellule sur corrélation** : une case = une paire de colonnes, pas une plage de valeurs. → Voir Points ouverts : le filtre croisé "sélectionne" la paire (highlight) plutôt qu'un filtre de plage numérique classique.

## Next Steps
1. Step 1-2 (backend reltab) + tests unitaires.
2. Step 3-4 (AppState + actions).
3. Step 5 (Dialog UI).
4. Step 6-8 (wiring, menu, IPC).
5. Typecheck + build + test manuel.
