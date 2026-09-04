# STATE_HANDOFF — Correlation Matrix feature

Date : 2026-09-04. Branche : `correlation` (créée depuis `master`, v0.0.9).

## Objectif en une phrase
Ajouter une vue analytique "Correlation Matrix" (menu Analytics → Correlation Matrix) qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table, en réutilisant l'architecture de la Confusion Matrix (grille heat-map colorée) et les mesures + le picker de colonnes multi de la SPLOM. Chaque ligne/colonne = une colonne de la table ; la valeur = indice de corrélation. Matrice **lecture seule** (aucune interaction de filtrage).

## État
- **Plan rédigé** : `vibe/correlation/CORRELATION_MATRIX_PLAN.md` (décisions de design validées, steps d'implémentation détaillées avec chemins de fichiers et n° de lignes, tests TDD, risques).
- **Branche** : `correlation`, 2 commits de docs, **aucun code implémenté pour l'instant** :
  - `76a8488` docs(correlation): plan Correlation Matrix feature, update mission to correlation
  - `d59d9f6` docs(correlation): remove filtering interaction, matrix is read-only
- `vibe-instructions.md` **déjà mis à jour** (MISSION ACTUELLE = Correlation Matrix, branche `correlation`, plan référencé).
- Toutes les décisions de design sont prises ; le point ouvert (filtrage) a été tranché : **pas de filtrage**.

## Décisions validées (à respecter)
1. Périmètre colonnes = toutes (Pearson/eta/V comme SPLOM).
2. Toggle **Pearson / Spearman** (Spearman = corrélation de rang, paires num/temporal ; eta/V inchangées).
3. Échantillonnage optionnel **borne le calcul de corrélation lui-même** (`ORDER BY random() LIMIT n`) sauf "Use all rows".
4. Colonnes toujours-nulles / à valeur unique : exclues du picker + **liste d'avis** dans le dialog (nommées).
5. Picker de colonnes = MultiSelect react-select de la SPLOM (réutilisé).
6. **Aucune interaction de filtrage** : matrice **lecture seule** (heat-map + en-têtes), pas d'`onFilter`/`onClearFilter`.

## Prochaine étape (à faire au redémarrage)
**Step 1-2 du plan — backend reltab, en TDD** (`packages/reltab/src/splom.ts`) :
- Étendre `getCorrelationMatrix` pour accepter `CorrelationMatrixOptions { rank?, sampleLimit?, minOccurrence? }`.
- Ajouter `pairwiseRankCorrelationSql` (Spearman via `rank()`/`dense_rank()` + `corr()` sur les rangs, rangs moyens pour ex-æquo).
- Échantillonnage `ORDER BY random() LIMIT n` sur la source (`splomScatterQuery`) quand `sampleLimit > 0`.
- Blank des paires sous `minOccurrence` (forcer `strength = null`).
- Helper de détection des colonnes toujours-nulles / constantes.
- **Commencer par les tests unitaires** (Pearson, Spearman vs Pearson sur relation monotone, min-occurrence blanking, sampleLimit borne `n`, colonne constante/nulle → null).
Puis : Step 3 AppState → Step 4 actions → Step 5 Dialog → Step 6 GridPane wiring → Step 7 menu → Step 8 IPC.

## Fichiers clés (références découvertes)
- `packages/reltab/src/splom.ts` :
  - `getCorrelationMatrix(dsConn, baseQuery, schema, matrixColIds): Promise<PairCorrelation[]>` (l.317-412) — actuellement Pearson uniquement, sans options.
  - `PairCorrelation { xColId, yColId, measure: "r"|"eta"|"V", r, strength, n }` (l.59-66).
  - `splomScatterQuery(baseQuery, schema, matrixColIds, colorColId?)` (l.89-113) → `{ query, derivedNames }`.
  - `pairwiseCorrelationSql(baseSql, pairs)` (l.196-215) — `corr(x,y)` + `regr_count` batched.
  - `etaPairSql` (l.223-249), `cramerPairSql` (l.256-291) — une requête par paire.
  - `numOrNull(v)` (l.293-303) — convertit NaN→null (colonne constante/variance nulle).
  - `splomColKind(ct)` (l.24-25), `columnKindIsNumeric` (l.21-22), `SplomColKind`.
- `packages/reltab/src/reltab.ts` : `export * from "./splom"` (l.7) + `./confusionMatrix` (l.8).
- `packages/tadviewer/src/AppState.ts` : `splomDialogOpen` (l.123), `confusionMatrixDialogOpen` (l.132) ; defaults l.157/l.161 ; classes l.188/l.192. → ajouter `correlationMatrixDialogOpen`.
- `packages/tadviewer/src/actions.ts` :
  - `openSplom`/`closeSplom` (l.881-891) ; `openConfusionMatrix`/`closeConfusionMatrix` (l.1065-1081). → pattern pour `openCorrelationMatrix`/`closeCorrelationMatrix`.
  - `SplomViewData` (l.873-877), `ConfusionMatrixViewData { data }` (l.1085-1087). → `CorrelationMatrixViewData { data, constantOrNullColIds? }`.
  - `loadSplomData` (l.947-968), `loadConfusionMatrixData` (l.1089-1106). → `loadCorrelationMatrixData`.
- `packages/tadviewer/src/components/ConfusionMatrixDialog.tsx` : pattern UI (Blueprint `Dialog`, `HTMLSelect`, `Slider`, `NumericInput`, `Switch`, `Tooltip` ; `DEFAULT_SAMPLE = 20000` ; `useAllRows`/`sampleLimit` ; `minOccurrence` ; `cellColor` heat-map ; grille + en-têtes). **Ne PAS copier les props de filtrage**.
- `packages/tadviewer/src/components/SplomDialog.tsx` : column picker react-select MultiSelect (imports l.10-15, `ColOption` l.96-100, `colGroupedOptions` l.216-243, `colSelectedOptions` l.245-251, JSX MultiSelect l.767-809, grille/en-têtes l.925-972, `MAX_MATRIX_COLS`). Colonnes : `viewSchema.columns.filter(cid => !cid.startsWith("_") && cid !== "Rec")`.
- `packages/tadviewer/src/components/GridPane.tsx` : imports l.15/l.17 ; close handlers l.350-362 ; montage dialogs l.667-690 ; guard mémoïsation l.712-717. → monter `CorrelationMatrixDialog` comme `SplomDialog` (sans onFilter).
- `packages/tad-app/app/appMenu.ts` : `analyticsSubmenu` l.143-168 (… / Scatter Plot Matrix `open-splom` / … / Confusion Matrix `open-confusion-matrix`). → ajouter "Correlation Matrix" → `open-correlation-matrix`.
- `packages/tad-app/src/electronRenderMain.tsx` : handlers IPC l.331-341 → ajouter `open-correlation-matrix` → `actions.openCorrelationMatrix(stateRef)`.

## Points ouverts
- Aucun. Toutes les décisions de design sont prises.

## Commande de vérif (tests/typecheck/build)
- `cd packages/reltab && npm test`
- Typecheck tadviewer + tad-app ; `cd packages/tad-app && npm run build-prod`
