# Mission: Excel Spreadsheet Loading & Joining

## Objectif
Ajouter le support des feuilles de calcul **Excel** (`.xlsx` / `.xls`) à MTad sur deux axes :
1. **Chargement** : ouvrir / monter un classeur comme source de données, importé comme table DuckDB (comme les CSV/Parquet existants).
2. **Jointure** : permettre de joindre la vue courante avec un classeur Excel (généraliser la fonctionnalité "Join CSV..." existante).

## Décisions de design validées par l'utilisateur
1. **Moteur de parsing** : **DuckDB natif `read_xlsx`** (extension excel), en miroir de `nativeCSVImport`/`nativeParquetImport`. Aucune nouvelle dépendance JS. **Périmètre `.xlsx` uniquement** — `read_xls` n'existe pas dans DuckDB 1.4.2 (vérifié), le format légacy `.xls` est donc hors périmètre.
2. **Feuilles multiples** : **première feuille par défaut + sélecteur de feuille** si le classeur en contient plusieurs.
3. **Jointure** : **généraliser le dialog "Join" existant** pour accepter `.xlsx`/`.xls` comme fichier droit (avec sélection de feuille si multi-feuilles), en réutilisant les types de jointure (inner/left/right/full outer), `forceStringCast`, `nullString` et le résultat matérialisé éditable.
4. **Clé de jointure** : **une seule paire de clés** (colonne gauche = colonne droite), cohérente avec CSV.
5. **Types de colonnes** : **inférence de types par DuckDB** à l'import, + la case `force string cast` existante pour les jointures.

## Contexte technique (fondation existante)
- **Chargement** : `packages/reltab-fs/src/reltab-fs.ts` — `dataFileExtensions` (l.25) contrôle dialog d'ouverture + sidebar dossier ; `FSDriver.getTableName` (l.171-219) route `.parquet`→`nativeParquetImport`, sinon→`nativeCSVImport`, avec `importMap` pour ré-importer et jeter les modifs de session.
- **Import DuckDB** : `packages/reltab-duckdb/src/csvimport.ts` — `nativeCSVImport` (`CREATE OR REPLACE TABLE ... AS SELECT * FROM read_csv_auto(...)`), `nativeParquetImport` (VIEW sur `parquet_scan`), `genTableName`/`mapIdent`/`uniquify` (nom de table ≤16 caractères).
- **DuckDB** : `duckdb`/`duckdb-async` `^1.4.2` — `read_xlsx(path[, sheet='<name>', all_varchar=...])` disponible ; **pas de** `read_xls`, **pas de** fonction d'énumération de feuilles (`stored_workbooks` absent). Énumération des feuilles par **lecteur ZIP pur Node** (`zlib.inflateRawSync`, zéro dépendance) de `xl/workbook.xml` — vérifié fonctionnel.
- **Jointure actuelle** : menu "Join CSV..." → `listen` IPC `start-csv-join` → `openJoinCsvDialog` (`actions.ts:1066`) ; dialog `tadviewer/src/components/JoinCsvDialog.tsx` ; IPC `dialog:selectCsvForJoin` + `dialog:getCsvHeaders` (parser naïf 1re ligne CSV, `tad-app/app/main.ts:153-181`) ; `confirmCsvJoin` (`actions.ts:1168-1240`) → `baseQuery.joinCsv(...)` → SQL `LEFT JOIN read_csv_auto(...)` exécuté par DuckDB → matérialisation dans une table `_fused_<ts>` éditable.
- **reltab joinCsv** : `QueryRep.ts` `JoinCsvArgs`/`JoinCsvQueryRep` (LeftOuter + `CsvJoinType`), `toSql.ts` `joinCsvQueryToSql` (RHS = `read_csv_auto('<path>')`), `pp.ts` `csvJoin`/`csvJoinTypeToSql`, `getSchema.ts` `joinCsvGetSchema` (rhsSchema tout-VARCHAR fourni par l'UI).

## Périmètre
- Oui : extension `dataFileExtensions` (xlsx/xls), nouvel import DuckDB excel, gestion des feuilles (1re + sélecteur), routage `getTableName`, généralisation du dialog Join + IPC (sélecteur de fichier/feuille + headers réels), `confirmCsvJoin` adapté aux classeurs, docs (`doc/features.md`, `doc/analytics.md`, `doc/site`, quickstart), tests unitaires + intégration reltab-duckdb.
- Non : jointure multi-clés ; refonte du modèle "un fichier = une table" en expansion récursive des feuilles dans la sidebar ; export Excel ; parsing via lib JS.

## Contraintes techniques
- TDD : logique métier `reltab` → tests unitaires (mock `DbDriver`) + `npx tsc -p tsconfig-build.json` ; tests d'intégration `packages/reltab-duckdb` (pattern `joinCsv.auto.test.ts` / `csvimport`).
- TypeScript strict, pas de `any` ; composants React fonctionnels (Hooks) ; modales BlueprintJS `<Dialog>`.
- Conventional commits atomiques (backend ≠ UI ≠ docs). Branche `feat/excel`. Docs dans `vibe/excel/` (`STATE_HANDOFF.md`, `AGENT_DEV_LOG.md`, `spec.md`, `global_plan.md`, `stepN.md`).

## Steps (résumé)
1. Backend reltab / reltab-duckdb — import Excel (`nativeXLSXImport`, énumération des feuilles) + tests.
2. `reltab-fs` — `dataFileExtensions` + routage `getTableName` vers l'import Excel.
3. Chargement UI — sélecteur de feuille (1re par défaut) dans le flux d'ouverture.
4. Jointure — généraliser `JoinCsvDialog`/IPC/`confirmCsvJoin` pour les classeurs (sélection de feuille + headers réels).
5. Docs + build + release (pattern v0.0.7).
