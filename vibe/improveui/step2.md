# ÉTAPE 2 : Context Menu Colonne - Delete & Duplicate

## Objectif
Ajouter "Delete" et "Duplicate" au context menu des colonnes (header right-click).

## Fonctionnalités

### Delete Column
- Right-click header → "Delete"
- Confirmation Alert: "Are you sure you want to delete column 'X'? This will drop all its content."
- Buttons: "Yes" / "Cancel"
- Execute: `dbc.deleteColumn(tableName, columnName)`
- Update ViewParams: remove from displayColumns, vpivots, sortKey, aggMap
- Refresh: Re-fetch schema + data

### Duplicate Column
- Right-click header → "Duplicate"
- Dialog with input, default: `${columnName}_2`
- Validation: Unique name in schema
- Execute: `dbc.duplicateColumn(tableName, columnName, newName)`
- Update ViewParams: add to displayColumns after original
- Refresh: Re-fetch schema + data

## Context Menu Items (after changes)
```
Rename          (existant)
Delete          (nouveau)
Duplicate       (nouveau)
```

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` — Context menu DOM
2. `packages/tadviewer/src/components/GridPane.tsx` — Dialog state
3. `packages/tadviewer/src/actions.ts` — Actions deleteColumn, duplicateColumn

## Validation
- Build: `cd packages/tadviewer && npx webpack --mode production`
- Test: Right-click header → Rename/Delete/Duplicate work
- Commit: `feat(tadviewer): add column delete and duplicate to context menu`
