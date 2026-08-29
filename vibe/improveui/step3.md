# ÉTAPE 3 : Context Menu Cellules - Delete/Duplicate Rows

## Objectif
Ajouter "Delete Rows" et "Duplicate Rows" au context menu des cellules, opérant sur les lignes contenant des cellules sélectionnées.

## Sélection active
Le grid utilise un **CellSelectionModel** (pas de RowSelectionModel). Quand l'utilisateur sélectionne des cellules, `onSelectedRangesChanged` fournit des ranges `{fromCell, toCell, fromRow, toRow}`. Pour obtenir les lignes sélectionnées, on extrait les row indices uniques de tous les ranges.

## Fonctionnalités

### Delete Rows
- Extraire les rows uniques depuis `selectionModel.getSelectedRanges()`
- Confirmation: "Are you sure you want to delete {n} row(s)?"
- Pour chaque ligne: construire WHERE clause (colonnes non-métadonnées)
- Optionnel: `DELETE FROM WHERE row_id IN (val1, val2, ...)` pour optimiser
- Execute: `dbc.deleteRows(tableName, whereClause)`
- Refresh: Re-fetch data

### Duplicate Rows
- Extraire les rows uniques depuis les ranges
- Pas de confirmation
- Pour chaque ligne: construire WHERE clause
- Execute: `dbc.duplicateRows(tableName, whereClause)`
- Refresh: Re-fetch data

## WHERE clause (par ligne)
```typescript
const excludeCols = ["Rec", "_id", "_parentId", "_depth", "_isOpen", "_pivot", "_isLeaf"];
function buildRowWhere(rowData: any): string {
  return Object.entries(rowData)
    .filter(([k]) => !excludeCols.includes(k))
    .map(([k, v]) => `"${k}" = ${formatSqlValue(v)}`)
    .join(" AND ");
}
// Combiner pour plusieurs lignes: WHERE (clause1) OR (clause2) OR ...
```

## Context Menu Items (pour cellules, tout type de ligne)
```
Edit / Edit all      (existant)
─ separator ─
Delete Rows          (nouveau)
Duplicate Rows       (nouveau)
─ separator ─
Copy (cells)         (Étape 5)
Copy (rows)          (Étape 5)
```

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` — Context menu items, getSelectedRanges()
2. `packages/tadviewer/src/components/GridPane.tsx` — Callbacks
3. `packages/tadviewer/src/actions.ts` — Actions deleteRows, duplicateRows

## Validation
- Build: `cd packages/tadviewer && npx webpack --mode production`
- Test: Select range of cells → right-click → Delete Rows / Duplicate Rows
- Commit: `feat(tadviewer): add delete/duplicate rows from cell selection`
