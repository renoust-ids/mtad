# ÉTAPE 1 : Backend reltab — helpers histogramme/fréquences par colonne

## Objectif
Ajouter dans `packages/reltab/src/histogram.ts` deux helpers qui servent le dialog "Histogram" à la demande, **par colonne** (le dialog ne doit pas dépendre du toggle global `showColumnHistograms` ni de `getColumnHistogramMap` qui traite toutes les colonnes) :

1. **`getSingleColumnHistogramData`** — histogramme numérique d'une seule colonne.
2. **`getColumnFrequencyData`** (+ `columnFrequencyQuery`) — distribution de fréquences catégorielle (bar chart pour colonnes non-numériques).

TDD : tests unitaires d'abord (mock `DbDriver`, pattern `test/dataSourceMutations.test.ts`), puis implémentation.

## 1. Nouveaux symboles dans `histogram.ts`

### getSingleColumnHistogramData
```ts
export async function getSingleColumnHistogramData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema,
  colId: string,
  colStats?: NumericSummaryStats
): Promise<NumericColumnHistogramData | null>
```
- Si `colStats` non fourni → `await dsConn.getColumnStatsMap(baseQuery)` et prendre `baseSchema` → `columnStatsMap[colId]` (cast `NumericSummaryStats`).
- Si la colonne n'est pas numérique (`colIsNumeric(colType)` faux) → `null`.
- Si stats absentes / `min == null || max == null || min === max` → `null` (comme `columnHistogramQuery`).
- Sinon : `columnHistogramQuery(baseQuery, colId, colType, colStats)` → `evalQuery(histoQuery)` → `getNumericColumnHistogramData(colId, histoInfo, res)`.

### Types fréquences catégorielles
```ts
export type CategoricalBin = { value: string | number | boolean | null; count: number };
export interface CategoricalDistributionData {
  colId: string;
  binData: CategoricalBin[];   // trié par count décroissant
  nullCount: number;           // compte des valeurs null séparé
  totalCount: number;          // nombre total de lignes (y compris nulls)
}
```

### columnFrequencyQuery
```ts
export function columnFrequencyQuery(
  baseQuery: QueryExp,
  colId: string
): QueryExp
```
- `baseQuery.extend("col", constVal(colId)).extend("freq", constVal(1)).project(["col", <colId>, "freq"])` … attention : la colonne de valeur doit garder son nom pour le mapping.
- Alternative propre avec l'API reltab : `baseQuery
    .extend("__col", constVal(colId))
    .groupBy(["__col", colId], [["count", "freq"]])`.
- Inspecter les opérateurs disponibles (`groupBy`, `extend`, `project`) dans `QueryExp.ts` / `defs.ts` et les dialectes pour produire un SQL de type :
  ```sql
  SELECT '__col' AS "__col", "colId" AS "colId", COUNT("freq") AS "count"
  FROM ( ... baseQuery ... )
  GROUP BY "__col", "colId"
  ```

### getColumnFrequencyData
```ts
export async function getColumnFrequencyData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  colId: string
): Promise<CategoricalDistributionData>
```
- `const res = await dsConn.evalQuery(columnFrequencyQuery(baseQuery, colId))`.
- Mapper `res.rowData` : valeur = `row[colId]`, count = `Number(row["count"])`. Les lignes où valeur === null → incrémenter `nullCount` (ne pas le mettre dans `binData`). Trier `binData` par count décroissant.
- `totalCount = sum(counts) + nullCount`.

### Barrel
Vérifier que `packages/reltab/src/reltab.ts` exporte bien les nouveaux symboles (`export * from "./histogram"` existe déjà → OK si les nouveaux types/fonctions sont exportés depuis `histogram.ts`).

## 2. Tests — `packages/reltab/test/histogram.test.ts`
Réutiliser le mock de `dataSourceMutations.test.ts` (`makeDriver`). `getSqlQueryColumnStatsMap` doit être mocké pour `getSingleColumnHistogramData` (retourner un `ColumnStatsMap` avec `NumericSummaryStats`).

Cas à couvrir :
1. `columnFrequencyQuery` génère un SQL contenant `GROUP BY` + `"colId"` et `COUNT`.
2. `getColumnFrequencyData` mappe correctement les lignes retournées par `evalQuery` (valeurs + counts), sépare les nulls, trie par count décroissant, calcule `totalCount`.
3. `getSingleColumnHistogramData` :
   - invoque `getColumnStatsMap` quand colStats non fourni ;
   - retourne `null` si la colonne n'est pas numérique (schema avec colonne texte) ;
   - retourne `null` si stats absent de la map ;
   - retourne `null` si `min === max` ;
   - cas nominal : vérifier la requête évaluée (`evalQuery` mock retourne des lignes `{column, bin, binCount}`) → `binData` rempli, `brushMinVal/brushMaxVal` corrects.

Notes :
- `Schema(dialect, columns, columnMetadata)` — `columnMetadata` = map `{ colId: { columnType: "DOUBLE"|"VARCHAR", ... } }` (cf. `validateColumnMetadata`).
- `colIsNumeric` depuis `ColumnType.ts`.

## 3. Vérifications
```bash
cd packages/reltab
npx tsc -p tsconfig-build.json
npm test
```

## 4. Commit
`feat(reltab): add single-column histogram and categorical frequency helpers`