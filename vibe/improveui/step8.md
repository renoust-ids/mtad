# ÉTAPE 8 : Ciblage par rowid physique — Edit/Duplicate/Delete sur une ligne précise

## Objectif
Corriger le ciblage des opérations de ligne (Edit / Duplicate Rows / Delete Rows).
Les étapes 1/3/4 construisaient des clauses `WHERE` à partir des **valeurs** des
colonnes. Dès qu'une ligne est dupliquée, les copies ont des valeurs identiques,
donc la clause `WHERE valeur` matche **toutes** les copies :

- `DUPLICATE` = `INSERT INTO t SELECT * FROM t WHERE <valeur>` → chaque copie
  matche N lignes → explosion 1 → 2 → 4 → 8.
- `EDIT` avec la même clause → modifie chaque copie identique.

## Solution : colonne interne `_rid` (rowid DuckDB)
Threader le **rowid physique** de DuckDB comme colonne cachée `_rid` sur les
lignes feuilles, et l'utiliser dans les clauses `WHERE` :

- Edit feuille : `UPDATE ... WHERE rowid = <rid>` (une seule ligne).
- Duplicate/Delete feuille : `WHERE rowid IN (<rid1>, <rid2>, ...)` (une copie
  à la fois, plus d'explosion).
- Lignes agrégées / root : pas de rowid physique → repli sur la clause `WHERE`
  par valeurs (comportement historique, inchangé).

## Comment `_rid` arrive jusqu'aux lignes du grid
1. `DataSource.getLeafDepSchema` (branche "table") étend le schéma avec
   `_rid` (`columnType: "integer"`, `displayName: "_rid"`).
2. `toSql.tableQueryToSql` mappe la colonne `_rid` du schéma vers
   `SELECT rowid AS "_rid"`.
3. Les lignes feuilles du aggtree projettent `_rid` (les **lignes agrégées et
   root** matérialisent `_rid` comme **NULL typé** pour garder les colonnes du
   `UNION ALL` alignées — voir "Régression pivot").
4. `PivotRequester.mkDataView` propage `rowMap` tel quel, donc chaque item de
   DataView feuille porte `_rid`.
5. `DataGrid` capture `item._rid` (via `Number(...)`, car DuckDB retourne un
   BigInt) sur les **deux** chemins d'édition :
   - context menu droit (`CellEditStartData.rid`),
   - double-clic / édition clavier (corrigé en Step 8 — il manquait `rid`).

## Actions (tadviewer/actions.ts)
- `commitCellEdit` : pour une ligne feuille avec `rid` → `WHERE rowid = <rid>`.
- `buildRowIdWhere(rowDataList)` : construit `rowid IN (...)` **seulement** si
  toutes les lignes sont des feuilles (`_isLeaf`) et ont un `_rid` non nul ;
  sinon retourne `null` et on retombe sur la clause par valeurs.
- `deleteRows` / `duplicateRows` : `buildRowIdWhere(...) ?? buildMultiRowWhere(...)`.

## Type `_rid`
- Le rowid DuckDB est retourné en `BIGINT` → `Number(...)` au moment de la
  capture et dans `buildRowIdWhere`.
- `_rid` est **exclu** des analytics : agrégations (aggMap), stats de colonne
  et histogrammes (pour éviter les erreurs BigInt et la pollution du rollup).

## Régression pivot (résolue)
Ajouter `_rid` au `baseSchema` le mettait dans toutes les projections pivot,
mais les lignes agrégées / root groupent **sans** `_rid`. Projeter `_rid` sur
ces requêtes échouait et, via un bug latent `defaultDialect === undefined`,
crashait avec *"Cannot read properties of undefined (reading 'quoteCol')"* dès
qu'on pivotait sur une variable.

Corrections :
- `aggtree.applyPath` (branche agrégée) + `aggtree.vpivot` (rootQuery) :
  matérialisent `_rid` comme **NULL typé** (`cast(constVal(null), ridType)`)
  pour que les colonnes du `UNION ALL` restent alignées entre feuilles,
  agrégés et root. Les feuilles gardent le vrai rowid.
- `reltab/BaseSQLDialect.ts` : `require("./toSql")` **lazy** pour casser le
  cycle circulaire `defs → SQLiteDialect → BaseSQLDialect → toSql → defs` qui
  rendait `defaultDialect` indéfini.
- `reltab/toSql.ts` (projectQueryToSql) : utilise le `dialect` passé en
  paramètre (au lieu du global `defaultDialect`) pour le message d'erreur.

## Fichiers modifiés
| Package | Fichier | Modification |
|---------|---------|-------------|
| reltab | `src/DataSource.ts` | `getLeafDepSchema` ajoute `_rid` au schéma feuille |
| reltab | `src/toSql.ts` | `tableQueryToSql` émet `rowid AS "_rid"` |
| reltab | `src/BaseSQLDialect.ts` | import lazy de `toSql` (cycle cassé) |
| reltab | `src/defs.ts` | (latent, corrigé via le cycle cassé) `defaultDialect` fiable |
| aggtree | `src/aggtree.ts` | `applyPath`/`vpivot` : exclusion de `_rid` du groupBy + NULL typé sur agrégés/root |
| reltab-duckdb | `src/reltab-duckdb.ts` | `columnStatsFromSummarize` ignore `_rid` |
| tadviewer | `src/actions.ts` | `commitCellEdit` rowid, `buildRowIdWhere`, displayColumns filtrent `_` |
| tadviewer | `src/PivotRequester.ts` | `aggMap` ignore `_rid` |
| tadviewer | `src/ViewState.ts` | `CellEditState.rid` |
| tadviewer | `src/components/GridPane.tsx` | passe `rid` |
| tadviewer | `src/components/DataGrid.tsx` | capture `item._rid` sur context menu ET double-clic |

## Debug / visibilité
`_rid` est caché par défaut (colonnes préfixées `_` filtrées de
`displayColumns`). Il est visible sous **Debug → Show Hidden Columns** pour
contrôler la valeur du rowid de chaque ligne feuille.

## Validation
- Build : `reltab` (tsc) → `reltab-duckdb` (tsc) → `aggtree` (tsc) → `tadviewer` (webpack).
- Pivot sur une variable + `showRoot` on/off : aucun crash, requêtes SQL correctes.
- Duplicate répété d'une ligne : +1 copie à chaque fois (plus d'explosion 1→2→4).
- Edit d'un cellule d'une des copies : modifie **uniquement** cette copie.
- Tests : `reltab` (11 pass) et `reltab-duckdb` (28 pass, 1 skip).
- Commit : `fix: target single row by physical rowid for cell edits and row ops`
  puis `fix: pivot crash from _rid projection on aggregate rows`.
