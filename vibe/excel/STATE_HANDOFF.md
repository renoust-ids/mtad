# STATE_HANDOFF — Excel Spreadsheet Loading & Joining

Date : 2026-09-01. Branche : `feat/excel` (créée depuis `master` `4c00387`).

## Objectif en une phrase
Charger et joindre des classeurs Excel (`.xlsx`/`.xls`) dans MTad via l'import DuckDB natif + généralisation du dialog Join, sans nouvelle dépendance.

## État
- **Planning terminé.** Design validé par l'utilisateur (5 décisions) — voir `mission.md` section « Décisions de design validées ».
- Aucun code d'implémentation écrit. Working tree propre, uniquement les docs `vibe/excel/` ajoutées.
- Versions : repo `0.0.6` (master + `feat/excel`). CI/release v0.0.6 déjà déclenchée indépendamment.

## Décisions validées
1. DuckDB natif `read_xlsx`/`read_xls` (pas de lib JS).
2. Première feuille par défaut + sélecteur de feuille si multi-feuilles.
3. Généraliser le dialog "Join" existant aux classeurs (types inner/left/right/outer, forceStringCast, nullString, matériel `_fused_`).
4. Clé de jointure unique (paire LHS/RHS).
5. Inférence de types DuckDB + forceStringCast existant pour les joins.

## Points d'insertion clés (découverts)
- `packages/reltab-fs/src/reltab-fs.ts:25` (`dataFileExtensions`), `:171` (`getTableName`).
- `packages/reltab-duckdb/src/csvimport.ts` (pattern à répliquer) ; barrel `reltab-duckdb.ts`.
- `packages/tad-app/app/main.ts:153-181` (IPC selectCsvForJoin / getCsvHeaders).
- `packages/tad-app/src/electronRenderMain.tsx:159-181,254-258`.
- `packages/tadviewer/src/components/JoinCsvDialog.tsx` ; `actions.ts:1066-1240`.
- reltab : `QueryRep.ts` `JoinCsvArgs`, `toSql.ts:508-563`, `pp.ts:160-185`, `getSchema.ts:313-339`.

## Points ouverts / à trancher pendant implémentation
- Mécanisme exact pour joindre une table Excel RHS : (a) étendre `JoinCsvArgs`/`SQLFromCsvJoin` avec `rhsTableName`, ou (b) générer la SQL FUSION directement (RHS = nom de table) — recommandé (a), détaillé `spec.md` §5.3 ; demander validation avant le step 4.
- Représentation de la feuille choisie dans `DataSourcePath`/`FSDriver.importMap` (step 3) — choix technique.

## Prochaine action
Écrire `step1.md` (import backend reltab-duckdb + tests) et l'implémenter.
