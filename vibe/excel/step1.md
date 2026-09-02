# Step 1 — Import backend (reltab-duckdb)

Objectif : fonction `nativeXLSXImport` + `getXlsxSheetNames` en miroir de `csvimport.ts`, avec tests.

## Implémentation
- Nouveau `packages/reltab-duckdb/src/xlsximport.ts`.
- Exporter `genTableName` depuis `csvimport.ts` (rendre `export`).
- `nativeXLSXImport(db, filePath, sheet?, tableName?)` :
  - choisir `read_xlsx` (.xlsx) ou `read_xls` (.xls) ;
  - `CREATE OR REPLACE TABLE <name> AS SELECT * FROM read_xlsx('<path>'[, sheet='<sheet>'])` ;
  - tableName défaut : `genTableName(filePath)` (+ suffixe `_<sheet>` si feuille nommée fournie).
- `getXlsxSheetNames(db, filePath)` : `SELECT sheet_name FROM stored_workbooks('<path>', format='xlsx')`.
- Barrel : ajouter `export * from "./xlsximport";`.

## Tests
- `packages/reltab-duckdb/test/xlsximport.auto.test.ts` :
  - première feuille (défaut) ;
  - feuille nommée explicite ;
  - multi-feuilles → noms retournés par `getXlsxSheetNames` ;
  - types inférés (int/float/varchar) + entêtes.
- Fixtures : petits `.xlsx` (1 feuille + multi-feuilles) et `.xls` générés par script ou inclus.

## Garde
- `cd packages/reltab-duckdb && npx tsc -p tsconfig-build.json`
- `npm test` (tests concernés)
- `cd packages/reltab && npx tsc --noEmit` (non régressif)
