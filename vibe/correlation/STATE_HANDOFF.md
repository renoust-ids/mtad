# STATE_HANDOFF — Correlation Matrix feature

Date : 2026-09-04. Branche : `correlation` (créée depuis `master`, v0.0.9).

## Objectif en une phrase
Ajouter une vue analytique "Correlation Matrix" (menu Analytics → Correlation Matrix) qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table, en réutilisant l'architecture de la Confusion Matrix (grille heat-map colorée) et les mesures + le picker de colonnes multi de la SPLOM. Chaque ligne/colonne = une colonne de la table ; la valeur = indice de corrélation. Matrice **lecture seule** (aucune interaction de filtrage).

## État
- **Plan rédigé** : `vibe/correlation/CORRELATION_MATRIX_PLAN.md`.
- **Branche** : `correlation`.
- **Toutes les étapes implémentées** : Step 1-2 (backend reltab, tests TDD), Step 3-4 (AppState + actions), Step 5 (Dialog UI), Step 6 (GridPane wiring), Step 7 (menu), Step 8 (IPC).
- **Vérifications finales** : reltab `npm test` → **72 pass** ; typecheck tadviewer + tad-app OK ; tad-app `npm run build-prod` → **compiled successfully**.
- `vibe-instructions.md` déjà mis à jour.

## Décisions validées (à respecter)
1. Périmètre colonnes = toutes (Pearson/eta/V comme SPLOM).
2. Toggle **Pearson / Spearman** (Spearman = corrélation de rang, paires num/temporal ; eta/V inchangées).
3. Échantillonnage optionnel **borne le calcul de corrélation lui-même** (`ORDER BY random() LIMIT n`) sauf "Use all rows".
4. Colonnes toujours-nulles / à valeur unique : exclues du picker + **liste d'avis** dans le dialog (nommées).
5. Picker de colonnes = MultiSelect react-select de la SPLOM (réutilisé).
6. **Aucune interaction de filtrage** : matrice **lecture seule** (heat-map + en-têtes), pas d'`onFilter`/`onClearFilter`.

## Prochaine étape (à faire au redémarrage)
**Terminé** — toutes les étapes du plan sont implémentées et vérifiées (72 tests reltab, typecheck tadviewer/tad-app, `npm run build-prod` tad-app OK). Reste : **test manuel** (vibe-instructions : "table simple, diagonal=1, symétrie, toggle change valeurs, colonne nulle → avis") puis, si approuvé, mise à jour de la mission/release.

**⚠ Gotcha build (important)** : `npx tsc` dans `packages/tadviewer` vide `outDir` (`dist`) et supprime les assets non-TS. Pour rebuilder proprement un `dist` consommable par tad-app :
1. `cd packages/tadviewer && npx tsc` (recompile les modules `dist/*.js` : actions.js, AppState.js, …)
2. `cp src/slickgrid.scss dist/slickgrid.scss` (restaurer l'asset que tsc a supprimé)
3. `cd packages/tadviewer && npm run build-prod` (rebundle `dist/tadviewer.js` avec le Dialog)
4. Puis `cd packages/tad-app && npm run build-prod`.

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
- `packages/tadviewer/src/components/CorrelationMatrixDialog.tsx` (nouveau) : props `{ appState, stateRef, onClose }` (lecture seule, pas de filtrage) ; picker react-select SPLOM ; HTMLSelect Pearson/Spearman ; Slider+NumericInput Min occurrences ; Switches Use all rows + Apply Table Filters ; grille heat-map `cellColor` diag=1 symétrique + avis null/constant.
- `packages/tadviewer/src/components/GridPane.tsx` : import `CorrelationMatrixDialog` (l.18) ; `handleCloseCorrelationMatrix` ; montage `<CorrelationMatrixDialog appState stateRef onClose>` (après ConfusionMatrix) ; guard `gridPanePropsEqual` + `correlationMatrixDialogOpen`.
- `packages/tad-app/app/appMenu.ts` : `analyticsSubmenu` + "Correlation Matrix" → `open-correlation-matrix` (après "Confusion Matrix").
- `packages/tad-app/src/electronRenderMain.tsx` : `ipcRenderer.on("open-correlation-matrix", () => actions.openCorrelationMatrix(stateRef))`.

## Points ouverts
- Aucun. Toutes les décisions de design sont prises.

## Commande de vérif (tests/typecheck/build)
- `cd packages/reltab && npm test` → **72 pass**
- Typecheck tadviewer + tad-app ; `cd packages/tad-app && npm run build-prod`

