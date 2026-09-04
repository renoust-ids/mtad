# STATE_HANDOFF — Concatenate File feature

Date : 2026-09-04. Branche : `concatenate`.

## Objectif en une phrase
Permettre d'ajouter les lignes d'un fichier externe (CSV/TSV/XLSX) à la table actuelle via File → Concatenate File..., avec alignement automatique des colonnes par nom (insensible à la casse), casting de types selon les règles DuckDB (`TRY_CAST`), et matérialisation dans une nouvelle table éditable.

## État
- **Mission terminée et validée.** Backend + UI implémentés, testés (62 tests reltab passent, typecheck tadviewer + tad-app OK).
- Quatre commits sur la branche `concatenate`.
- Docs à jour : `vibe-instructions.md`, `AGENT_DEV_LOG.md`, plan archivé dans `vibe/concatenate/CONCATENATE_FILE_PLAN.md`.

## Commits
- `31ab6b9` - `feat(reltab): add ConcatCsv AST node and SQL generation`
- `cee1cdd` - `feat(tad-app): add Concatenate File dialog and menu`
- `d0c0602` - `fix(tad-app): exclude MTad internal columns from concatenate dialog and result`

## Points d'insertion clés (découverts)
- reltab : `QueryRep.ts` (`ConcatCsvArgs`/`ConcatCsvQueryRep`), `QueryExp.ts` (`concatCsv()`), `getSchema.ts` (`concatCsvGetSchema`), `toSql.ts` (`concatCsvQueryToSql`), `SQLQuery.ts` (`SQLFromCsvConcat`, champ `rawSql`), `pp.ts`.
- tadviewer : `AppState.ts` (`ConcatCsvDialogState`/`ConcatCsvMapping`), `actions.ts` (`confirmConcatCsv` et actions dialog), `components/ConcatCsvDialog.tsx`, `utils/concatColumnMatcher.ts`, `components/AppPane.tsx`.
- tad-app : `app/appMenu.ts` (menu item), `app/main.ts` (IPC `getCsvHeaders` → types, `getCsvColumnTypes`, `getXlsxSheetTypes`), `src/electronRenderMain.tsx` (IPC `start-csv-concatenate`, filtrage `_rid`/`Rec`).

## Décisions validées
1. Règles de casting DuckDB natives (aucune règle custom) — `TRY_CAST` pour la sécurité.
2. Correspondance des colonnes par nom, insensible à la casse.
3. Dialog ouvre automatiquement le sélecteur de fichier.
4. Résultat = nouvelle table DuckDB éditable.
5. Colonnes internes MTad (`_rid`, `Rec`, préfixées `_`) exclues du résultat.

## Fichier de test
- `examples/*.xlsx` : classeur artificiel multi-feuilles (~20 colonnes de types variés, encodages multiples, ~10000 lignes) pour tester l'import/manipulation XLSX.

## Points ouverts
- Aucun. Mission close.
