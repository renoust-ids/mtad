# ÉTAPE 3 : Context Menu Ligne - Delete & Duplicate

## Objectif
Ajouter les options "Delete Row" et "Duplicate Row" au context menu des cellules.

## Fonctionnalités

### Delete Row
- Clic sur "Delete Row" → Dialogue de confirmation
- Message: "Are you sure you want to delete this row?"
- Boutons: "Yes" / "Cancel"
- Construction WHERE clause: Colonnes non-métadonnées (Rec, _id, _parentId, _depth, _isOpen, _pivot)
- Exécution: `dbc.deleteRow(tableName, whereClause)`
- Refresh: Re-fetch data

### Duplicate Row
- Clic sur "Duplicate Row" → Exécute directement (pas de confirmation)
- Construction WHERE clause: Même logique que Delete
- Exécution: `dbc.duplicateRow(tableName, whereClause)`
- Refresh: Re-fetch data

## Distinguer Aggregate vs Leaf
- **Leaf rows** (`_isLeaf === true`): "Delete Row" et "Duplicate Row" disponibles
- **Aggregate rows** (`_isLeaf === false`): Ces items ne sont PAS affichés (seront dans Étape 4)

## WHERE clause
```typescript
// Exclure les colonnes métadonnées
const excludeColumns = ["Rec", "_id", "_parentId", "_depth", "_isOpen", "_pivot", "_isLeaf"];
const whereParts = Object.entries(rowData)
  .filter(([key]) => !excludeColumns.includes(key))
  .map(([key, val]) => `"${key}" = ${formatSqlValue(val)}`);
const whereClause = whereParts.join(" AND ");
```

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` - Context menu items
2. `packages/tadviewer/src/components/GridPane.tsx` - Dialog state + callbacks
3. `packages/tadviewer/src/actions.ts` - Actions deleteRow, duplicateRow

## Validation
- Build tadviewer: `cd packages/tadviewer && npx webpack --mode production`
- Test: Right-click leaf row → Delete/Duplicate fonctionne
- Test: Right-click aggregate row → Ces items ne sont pas affichés
- Commit: `feat(tadviewer): add row delete and duplicate to context menu`
