# Global Plan — Excel Spreadsheet Loading & Joining

> Branche `feat/excel`, basée sur `master` (001 v0.0.6, 4c00387). Suit la convention vibe (TDD, commits atomiques).

## Étapes

### Step 1 — Import backend (reltab-duckdb)
- `packages/reltab-duckdb/src/xlsximport.ts` : `nativeXLSXImport`, `getXlsxSheetNames`, export via barrel.
- Réutiliser `genTableName` de `csvimport.ts` (l'exporter) ; gérer `.xlsx` (read_xlsx) / `.xls` (read_xls), `sheet` optionnel.
- Tests : `packages/reltab-duckdb/test/xlsximport.auto.test.ts` + fixtures `.xlsx`/`.xls`.
- Garde : `npx tsc -p tsconfig-build.json` + tests.

### Step 2 — Routage source (reltab-fs)
- `dataFileExtensions` += `xlsx`,`xls`.
- `FSDriver.getTableName` : brancher `.xlsx`/`.xls` → `nativeXLSXImport` (import + re-import), avec injection de la feuille choisie.
- Tests reltab-fs si présents ; vérif `tsc`.

### Step 3 — Chargement UI : sélecteur de feuille
- Détecter multi-feuilles à l'ouverture ; sélecteur Blueprint ; transmettre la feuille à l'import ; charger la table.
- Vérif manuelle + `tsc`.

### Step 4 — Jointure généralisée
- reltab : étendre `JoinCsvArgs` avec `rhsTableName` (+ `toSql`/`pp`) OU génération SQL directe avec RHS=table — selon feedback.
- IPC `main.ts` : `dialog:selectJoinFile`, `dialog:getJoinHeaders` (feuilles + headers réels).
- `electronRenderMain.tsx` : nouveaux handlers.
- `JoinCsvDialog.tsx` : selecteur de fichier générique + `HTMLSelect` feuille.
- `actions.confirmCsvJoin` : import Excel sheet → table puis join + matérialisation `_fused_`.
- Tests : reltab `joinCsv` table-rhs + intégration reltab-duckdb.

### Step 5 — Docs + build + release
- `doc/features.md`, `doc/analytics.md`, quickstart, doc/site.
- `git commit` atomiques ; bump version (v0.0.7) ; merge master ; tag `v0.0.7` → CI release.

## Ordre / dépendances
Step 1 → 2 → 3 (chargement), et 1/2 → 4 (jointure). 5 en dernier. Steps 3 et 4 dépendent de 1 et 2.
