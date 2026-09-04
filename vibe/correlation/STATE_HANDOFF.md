# STATE_HANDOFF — Correlation Matrix feature

Date : 2026-09-04. Branche : `correlation` (créée depuis `master`, v0.0.9).

## Objectif en une phrase
Ajouter une vue analytique "Correlation Matrix" (menu Analytics → Correlation Matrix) qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table, en réutilisant l'architecture de la Confusion Matrix (grille heat-map colorée) et les mesures + le picker de colonnes multi de la SPLOM. Chaque ligne/colonne = une colonne de la table ; la valeur = indice de corrélation. Matrice **lecture seule** (aucune interaction de filtrage).

## État
- **Plan rédigé** : `vibe/correlation/CORRELATION_MATRIX_PLAN.md` (décisions de design validées, steps d'implémentation détaillées avec chemins de fichiers et n° de lignes, tests TDD, risques).
- **Branche** : `correlation`.
- **Step 1-2 (backend reltab) TERMINÉE** — `packages/reltab/src/splom.ts` étendu [TDD] :
  - `CorrelationMatrixOptions { rank?, sampleLimit?, minOccurrence? }` (interface).
  - `pairwiseRankCorrelationSql(baseSql, pairs)` — Spearman (rank() + corr(), MATERIALIZED CTE, single-scan batch).
  - `getCorrelationMatrix` accepte `opts?`: rank→Spearman (numeric/temporal only), sampleLimit>0→source `ORDER BY random() LIMIT n`, minOccurrence>0→force strength/r=null quand n<threshold.
  - `constantOrNullColIds(dsConn, baseQuery, schema, colIds)` — détecte colonnes toujours-null (count=0) / constantes (≤1 distinct), batched en une requête UNION ALL.
  - Tests : `packages/reltab/test/splom.test.ts` (10 nouveaux) → **72 tests passent**, `npm run build` OK.
- `vibe-instructions.md` mis à jour (MISSION ACTUELLE = Correlation Matrix, branche `correlation`).

## Décisions validées (à respecter)
1. Périmètre colonnes = toutes (Pearson/eta/V comme SPLOM).
2. Toggle **Pearson / Spearman** (Spearman = corrélation de rang, paires num/temporal ; eta/V inchangées).
3. Échantillonnage optionnel **borne le calcul de corrélation lui-même** (`ORDER BY random() LIMIT n`) sauf "Use all rows".
4. Colonnes toujours-nulles / à valeur unique : exclues du picker + **liste d'avis** dans le dialog (nommées).
5. Picker de colonnes = MultiSelect react-select de la SPLOM (réutilisé).
6. **Aucune interaction de filtrage** : matrice **lecture seule** (heat-map + en-têtes), pas d'`onFilter`/`onClearFilter`.

## Prochaine étape (à faire au redémarrage)
**Step 5 — Dialog component** (`packages/tadviewer/src/components/CorrelationMatrixDialog.tsx`, nouveau) :
- Props : `{ appState, stateRef, onClose }`. **Pas** d'`onFilter`/`onClearFilter` (matrice lecture seule).
- State local : `selectedCols: string[]` (multi), `rank: boolean` (Pearson/Spearman), `useAllRows`, `applyTableFilters`, `minOccurrence`, `data`, `loading`, `error`, `hover`. 
- Picker réutilisé depuis SPLOM (MultiSelect react-select, groupes numeric/temporal vs categorical, `MAX_MATRIX_COLS`) ; exclure les colonnes null/constantes (Step 2) de `options` + les lister dans un avis.
- Toggle Pearson/Spearman, Slider/NumericInput Min non-null occurrence (default 1), Switch "Use all rows" (sampleLimit default 20000) + "Apply Table Filters".
- Chargement : `useEffect` sur `selectedCols`/`rank`/`minOccurrence`/`useAllRows`/`applyTableFilters`, guard `selectedCols.length >= 2`, appelle `loadCorrelationMatrixData`.
- Grille heat-map `cellColor` type ConfusionMatrix + en-têtes type SPLOM, diagonale 1.00, symétrique, lecture seule.

(State 3-4 fait. AppState + actions à jour.)

## Fichiers clés (références découvertes)
- `packages/reltab/src/splom.ts` :
  - `getCorrelationMatrix(dsConn, baseQuery, schema, matrixColIds, opts?: CorrelationMatrixOptions)` (l.~370) — Pearson/eta/V + rank + sampling + minOccurrence.
  - `PairCorrelation { xColId, yColId, measure: "r"|"eta"|"V", r, strength, n }`.
  - `pairwiseCorrelationSql(baseSql, pairs)` (Pearson), `pairwiseRankCorrelationSql(baseSql, pairs)` (Spearman).
  - `splomScatterQuery(baseQuery, schema, matrixColIds, colorColId?)` → `{ query, derivedNames }`.
  - `constantOrNullColIds(dsConn, baseQuery, schema, colIds): Promise<string[]>`.
  - `numOrNull(v)`, `splomColKind(ct)`, `columnKindIsNumeric(ct)`, `SplomColKind`.
- `packages/reltab/src/reltab.ts` : `export * from "./splom"` (l.7) — déjà OK, aucun ajout nécessaire (tout dans splom.ts).
- `packages/tadviewer/src/AppState.ts` : `correlationMatrixDialogOpen` ajouté (interface ~l.134, default ~l.163, classe ~l.194). `splomDialogOpen` (l.123), `confusionMatrixDialogOpen` (l.132).
- `packages/tadviewer/src/actions.ts` :
  - `openCorrelationMatrix`/`closeCorrelationMatrix` (bloc avant Join CSV) ; `CorrelationMatrixViewData { data, constantOrNullColIds? }` ; `loadCorrelationMatrixData(dbc, query, schema, colIds, opts)`.
  - Références pattern : `openSplom`/`closeSplom` (l.881-891), `openConfusionMatrix`/`closeConfusionMatrix`, `loadSplomData`, `loadConfusionMatrixData`.
- `packages/tadviewer/src/components/ConfusionMatrixDialog.tsx` : pattern UI (Blueprint `Dialog`, `HTMLSelect`, `Slider`, `NumericInput`, `Switch`, `Tooltip` ; `DEFAULT_SAMPLE = 20000` ; `useAllRows`/`sampleLimit` ; `minOccurrence` ; `cellColor` heat-map ; grille + en-têtes). **Ne PAS copier les props de filtrage**.
- `packages/tadviewer/src/components/SplomDialog.tsx` : column picker react-select MultiSelect (imports l.10-15, `ColOption` l.96-100, `colGroupedOptions` l.216-243, `colSelectedOptions` l.245-251, JSX MultiSelect l.767-809, grille/en-têtes l.925-972, `MAX_MATRIX_COLS`). Colonnes : `viewSchema.columns.filter(cid => !cid.startsWith("_") && cid !== "Rec")`.
- `packages/tadviewer/src/components/GridPane.tsx` : imports l.15/l.17 ; close handlers l.350-362 ; montage dialogs l.667-690 ; guard mémoïsation l.712-717. → monter `CorrelationMatrixDialog` comme `SplomDialog` (sans onFilter).
- `packages/tad-app/app/appMenu.ts` : `analyticsSubmenu` l.143-168 (… / Scatter Plot Matrix `open-splom` / … / Confusion Matrix `open-confusion-matrix`). → ajouter "Correlation Matrix" → `open-correlation-matrix`.
- `packages/tad-app/src/electronRenderMain.tsx` : handlers IPC l.331-341 → ajouter `open-correlation-matrix` → `actions.openCorrelationMatrix(stateRef)`.

## Points ouverts
- Aucun. Toutes les décisions de design sont prises.

## Commande de vérif (tests/typecheck/build)
- `cd packages/reltab && npm test` → **72 pass**
- Typecheck tadviewer + tad-app ; `cd packages/tad-app && npm run build-prod`

