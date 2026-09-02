# SPEC — Excel Spreadsheet Loading & Joining

> Statut : **spec** — à valider par l'utilisateur avant implémentation.
> Branche cible : `feat/excel`.
> Package concernés : `reltab-duckdb` (import), `reltab-fs` (routage source), `tadviewer` (UI join + sélecteur de feuille), `tad-app` (menu/Open + IPC).

## 1. Vue d'ensemble

Le but est double :

1. **Chargement** — un classeur `.xlsx` / `.xls` peut être ouvert comme source de données. La **première feuille** est importée par défaut ; si le classeur a plusieurs feuilles, un **sélecteur de feuille** permet d'en choisir une autre. Le résultat est une table DuckDB éditable, comme un CSV aujourd'hui.
2. **Jointure** — le dialog **"Join"** (actuellement "Join CSV...") est généralisé pour accepter un classeur Excel comme **fichier droit**, avec sélection de feuille si multi-feuilles, et produit un résultat matérialisé éditable `_fused_<ts>` exactement comme la jointure CSV actuelle.

Moteur d'import : **DuckDB natif** (`read_xlsx` / `read_xls`, extension excel), aucune nouvelle dépendance JS.

---

## 2. Backend — import Excel (`packages/reltab-duckdb`)

Nouveau module `packages/reltab-duckdb/src/xlsximport.ts`, exporté par le barrel `reltab-duckdb.ts`, miroir de `csvimport.ts`.
**Périmètre : `.xlsx` uniquement** (DuckDB 1.4.2 n'a pas `read_xls`).

### 2.1 Types / helpers
- `excelFileExtensions = ["xlsx"]`.
- Helper `getXlsxSheetNames(filePath): string[]` — lit `xl/workbook.xml` dans le ZIP du `.xlsx` via un **lecteur ZIP pur Node** (`zlib.inflateRawSync`, zéro dépendance), retourne les noms de feuilles dans l'ordre du classeur. (DuckDB n'expose aucune fonction d'énumération de feuilles — `stored_workbooks` absent.)

### 2.2 Import
```ts
export const nativeXLSXImport = async (
  db: Database,
  filePath: string,
  sheet?: string,        // nom de feuille ou undefined → première feuille
  tableName?: string
): Promise<string>
```
- `tableName` par défaut : `genTableName(filePath)` (réutilisé de `csvimport.ts`, exporté), avec suffixe `_<sheet>` si feuille nommée fournie.
- SQL : `CREATE OR REPLACE TABLE <tableName> AS SELECT * FROM read_xlsx('<filePath>', sheet='<sheet>')` (ou sans `sheet=` pour la première feuille).
- Inférence de types par DuckDB (décision validée). Pas de force-cast à l'import.

### 2.3 Tests
- `packages/reltab-duckdb/test/xlsximport.auto.test.ts` (+ petits fichiers `.xlsx`/`.xls` de test générés ou fixtures) : première feuille, feuille nommée, multi-feuilles, types inférés, noms de colonnes.

---

## 3. Routage source (`packages/reltab-fs`)

### 3.1 `dataFileExtensions` (l.25)
Ajouter `"xlsx"`. Effet automatique : dialog d'ouverture (`appWindow.ts` concat) + énumération sidebar dossier (`getChildren`).

### 3.2 `FSDriver.getTableName` (l.171-219)
Dans les branches "import" et "re-import" :
- si `.xlsx` → `reltabDuckDB.nativeXLSXImport(this.dbc.db, targetPath[, sheet])` ;
- sinon comportement actuel (parquet / csv).

**Gestion de la feuille choisie :** le flux d'ouverture d'un classeur doit pouvoir transmettre la feuille. `getTableName(dsPath)` reçoit un `DataSourcePath`. Pour la feuille, on s'appuie sur l'**ID du nœud** : un classeur multi-feuilles est représenté par le fichier (feuille par défaut) et, après choix, on ouvre la feuille en passant une variante du chemin (`dsPath.path` ou l'id). Décision d'implémentation : stocker la feuille choisie dans le `DataSourcePath` (ex. `path: ["Sheet1"]`) ou via un token interne à `FSDriver.importMap`. À confirmer au step 3 (chargement UI).

---

## 4. Chargement UI — sélecteur de feuille

- Quand un classeur multi-feuilles est ouvert (`replaceCurrentView`), détecter > 1 feuille (`getXlsxSheetNames`) et ouvrir un petit sélecteur Blueprint `<Dialog>`/menu déroulant : "Feuille : [première feuille ▾]".
- Le choix est transmis à l'import (step 3.2) puis le view se charge sur la table de cette feuille.
- Cas simple (1 feuille) : aucun sélecteur, chargement immédiat.

---

## 5. Jointure — généralisation du dialog ("Join")

### 5.1 IPC (`packages/tad-app/app/main.ts`)
- `"dialog:selectJoinFile"` : remplacer `dialog:selectCsvForJoin` (filtre `["csv","tsv"]`) par `["csv","tsv","xlsx"]` ; titre "Select file to Join" (générique).
- `"dialog:getJoinHeaders"` (nouveau) : si `.xlsx`/`.xls` → énumérer les feuilles + headers réels par feuille ; si CSV/TSV → comportement actuel. Retourne `{ columns, types, sheets?: string[] }`.

### 5.2 Dialog (`packages/tadviewer/src/components/JoinCsvDialog.tsx`)
- Titre "Join" (générique) ; option "Fichier".
- Si le fichier sélectionné est un classeur multi-feuilles, un **`HTMLSelect` de feuille** apparaît (avant la sélection de colonnes) ; le changement de feuille recharge les colonnes.
- Colonnes droites chargées depuis les headers réels de la feuille choisie.
- Frozen comportements existants : join type (inner/left/right/outer), `forceStringCast`, `nullString`.

### 5.3 Action (`packages/tadviewer/src/actions.ts confirmCsvJoin`)
Étendre pour Excel :
1. Si RHS `.xlsx`/`.xls` : importer la feuille choisie en table DuckDB via `nativeXLSXImport` (en amont, dans `dialog` ou ici via un appel d'import) → `rhsTableName`.
2. Construire la jointure en référençant cette **table** comme RHS au lieu de `read_csv_auto('<path>')`.

**Implémentation reltab (additive, préserve CSV) :**
- `QueryRep.ts` : étendre `JoinCsvArgs` avec `rhsTableName?: string` (table DuckDB déjà importée) et/ou garder `rightTablePath` (CSV).
- `toSql.ts` / `pp.ts` : dans `SQLFromCsvJoin`, si `rhsTableName` présent → émettre `JOIN <rhsTableName> t2 ON <cast>=<cast>` au lieu de `JOIN read_csv_auto('<path>', opts) t2 ON ...`. `csvJoinTypeToSql` réutilisé → inner/left/right/outer identiques.
- `getSchema.ts` `joinCsvGetSchema` : inchangé (rhsSchema tout-VARCHAR fourni par l'UI, mêmes colonnes).
- Matérialisation `CREATE TABLE "_fused_<ts>" AS ...` + re-pointage du view (`reltab.tableQuery`) : **inchangé**.

**Alternative (si on préfère ne pas toucher reltab) :** dans `confirmCsvJoin`, générer la SQL `FUSION` directement avec la table RHS importée (équivalent du SQL produit par `joinCsvQueryToSql` mais RHS = nom de table). Moins DRY ; détaillé selon feedback au step 4.

---

## 6. Menu & flux d'ouverture (`packages/tad-app`)
- "Open File..." / "Open Directory..." : automatiquement étendus via `dataFileExtensions` (aucun changement de code requis au-delà de la liste).
- Menu "Join CSV..." → renommé "Join..." (texte) pour couvrir Excel ; IPC `start-csv-join` conservé (nom interne inchangé).
- CLI `srcfile` / `handleOpen` : accepte naturellement `.xlsx`/`.xls` car ils passent par `openType:"fspath"` (extension non DB → `encodeFileOpenParams`).

---

## 7. Docs
- `doc/features.md` : section Excel (chargement + sélecteur de feuille) ; section Join mise à jour ("Join" accepte CSV/TSV/Excel avec feuille).
- `doc/analytics.md` : mention Excel dans la jointure.
- `packages/tad-app/html/userdocs/quickstart.html` : extension de la notice Join / chargement.
- `doc/site/index.html` : entrée Release Notes / News pour la prochaine version (v0.0.7).

---

## 8. Hors périmètre
- Jointure multi-clés ; export Excel ; expansion récursive des feuilles dans la sidebar (chaque feuille = nœud) ; parsing via lib JS ; `.xlsb` / `.ods`.
