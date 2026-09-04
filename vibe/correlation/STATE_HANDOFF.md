# STATE_HANDOFF — Correlation Matrix feature

Date : 2026-09-04. Branche : `correlation` (créée depuis `master`, v0.0.9).

## Objectif en une phrase
Ajouter une vue analytique "Correlation Matrix" (menu Analytics → Correlation Matrix) qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table, en réutilisant l'architecture de la Confusion Matrix (grille heat-map, cases cliquables) et le picker de colonnes multi de la SPLOM.

## État
- **Plan rédigé** : `vibe/correlation/CORRELATION_MATRIX_PLAN.md` (décisions de design validées par l'utilisateur, steps d'implémentation, tests, risques).
- **Branche** : `correlation` créée. Aucun code implémenté pour l'instant.
- Design validé : toutes colonnes (Pearson/eta/V comme SPLOM), toggle Pearson/Spearman, échantillonnage borne le calcul de corrélation, colonnes null/constantes exclues du picker + listées dans un avis.
- `vibe-instructions.md` à mettre à jour (mission courante + version) — voir TODO ci-dessous.

## Prochaine étape
1. **Étendre le backend reltab** (`packages/reltab/src/splom.ts`) : `getCorrelationMatrix` accepte `CorrelationMatrixOptions { rank?, sampleLimit?, minOccurrence? }`, ajouter `pairwiseRankCorrelationSql` (Spearman via `rank()` + `corr()`), échantillonnage `ORDER BY random() LIMIT n` sur la source, blank des paires sous `minOccurrence`, + helper de détection colonnes toujours-nulles/constantes. **Commencer par les tests unitaires (TDD).**
2. Puis AppState → actions → Dialog → wiring/menu/IPC.

## Fichiers clés (références découvertes)
- `packages/reltab/src/splom.ts` :
  - `getCorrelationMatrix(dsConn, baseQuery, schema, matrixColIds): Promise<PairCorrelation[]>` (l.317-412) — actuellement Pearson uniquement, pas d'options.
  - `PairCorrelation { xColId, yColId, measure: "r"|"eta"|"V", r, strength, n }` (l.59-66).
  - `splomScatterQuery(baseQuery, schema, matrixColIds, colorColId?)` (l.89-113) renvoie `{ query, derivedNames }`.
  - `pairwiseCorrelationSql(baseSql, pairs)` (l.196-215) — `corr(x,y)` + `regr_count` batched.
  - `etaPairSql` (l.223-249), `cramerPairSql` (l.256-291) — una requête par paire.
  - `numOrNull(v)` (l.293-303) — convertit NaN→null (colonne constante/variance nulle).
  - `splomColKind(ct)` (l.24-25), `columnKindIsNumeric` (l.21-22), `SplomColKind`.
- `packages/reltab/src/reltab.ts` : `export * from "./splom"` (l.7) + `./confusionMatrix` (l.8).
- `packages/tadviewer/src/AppState.ts` : `splomDialogOpen` (l.123), `confusionMatrixDialogOpen` (l.132) ; defaults l.157/l.161 ; classes l.188/l.192.
- `packages/tadviewer/src/actions.ts` :
  - `openSplom`/`closeSplom` (l.881-891) ; `openConfusionMatrix`/`closeConfusionMatrix` (l.1065-1081).
  - `SplomViewData` (l.873-877), `ConfusionMatrixViewData { data }` (l.1085-1087).
  - `loadSplomData` (l.947-968), `loadConfusionMatrixData` (l.1089-1106).
  - `setConfusionMatrixFilter` (l.1112), `clearConfusionMatrixFilter` (l.1131) → `setAnalyticsClauses(colIds, constraints, stateRef)` (l.660-688).
  - `AnalyticsConstraint { colId, add }` (l.581), `ScatterAxisFilterArg { colId, range?, values? }` (défini dans `categoricalAxis.ts` l.110-114).
- `packages/tadviewer/src/components/ConfusionMatrixDialog.tsx` : pattern UI (Blueprint `Dialog`, `HTMLSelect`, `Slider`, `NumericInput`, `Switch`, `Tooltip` ; `DEFAULT_SAMPLE = 20000` ; `useAllRows`/`sampleLimit` ; `minOccurrence` ; `cellColor` heat-map ; grille + en-têtes). Props : `appState, stateRef, onClose, onFilter(rowArg,colArg), onClearFilter(rowColId,colColId)`.
- `packages/tadviewer/src/components/SplomDialog.tsx` : column picker react-select MultiSelect (imports l.10-15, `ColOption` l.96-100, `colGroupedOptions` l.216-243, `colSelectedOptions` l.245-251, JSX MultiSelect l.767-809, grille/en-têtes l.925-972, `MAX_MATRIX_COLS`). Filtre colonnes : `viewSchema.columns.filter(cid => !cid.startsWith("_") && cid !== "Rec")`.
- `packages/tadviewer/src/components/GridPane.tsx` : imports l.15/l.17 ; close handlers l.350-362 ; montage dialogs l.667-690 ; guard mémoïsation l.712-717.
- `packages/tad-app/app/appMenu.ts` : `analyticsSubmenu` l.143-168 (Distribution / Scatter Plot Matrix `open-splom` / Scatter Plot / Confusion Matrix `open-confusion-matrix`).
- `packages/tad-app/src/electronRenderMain.tsx` : handlers IPC l.331-341 (`open-splom`, `open-scatter-plot`, `open-confusion-matrix`) → `actions.open*(stateRef)`.

## Décisions validées (à respecter)
1. Périmètre colonnes = toutes (Pearson/eta/V comme SPLOM).
2. Toggle Pearson / Spearman (Spearman = corrélation de rang, paires num/temporal ; eta/V inchangées).
3. Échantillonnage optionnel borne le calcul de corrélation lui-même (`ORDER BY random() LIMIT n`) sauf "Use all rows".
4. Colonnes toujours-nulles / à valeur unique : exclues du picker + **liste d'avis** dans le dialog (nommées).
5. Picker de colonnes = MultiSelect react-select de la SPLOM.
6. **Aucune interaction de filtrage** : matrice **lecture seule** (heat-map + en-têtes), pas d'`onFilter`/`onClearFilter`.

## Points ouverts
- Aucun. (Décision : pas de filtrage par clic de cellule.)

## TODO immédiat
- [ ] Mettre à jour `vibe-instructions.md` : MISSION ACTUELLE → Correlation Matrix (branche `correlation`), et version restant 0.0.9.
- [ ] Commit du plan/docs sur `correlation`.
