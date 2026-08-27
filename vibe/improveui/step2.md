# ÉTAPE 2 : Context Menu Colonne - Delete & Duplicate

## Objectif
Ajouter les options "Delete" et "Duplicate" au context menu des colonnes avec confirmation et dialogue de nom.

## Fonctionnalités

### Delete Column
- Clic sur "Delete" → Dialogue de confirmation BlueprintJS
- Message: "Are you sure you want to delete column 'X'? This will drop all its content."
- Boutons: "Yes" (exécute) / "Cancel" (annule)
- Exécution: `dbc.deleteColumn(tableName, columnName)`
- Refresh: Re-fetch schema + data

### Duplicate Column
- Clic sur "Duplicate" → Dialogue avec input pour le nom
- Nom par défaut: `${columnName}_2`
- Validation: Nom unique, pas de caractères spéciaux
- Exécution: `dbc.duplicateColumn(tableName, columnName, newName)`
- Refresh: Re-fetch schema + data

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` - Context menu items
2. `packages/tadviewer/src/components/GridPane.tsx` - Dialog state + callbacks
3. `packages/tadviewer/src/actions.ts` - Actions deleteColumn, duplicateColumn

## UI BlueprintJS
- `<Alert>` pour confirmation delete
- `<Dialog>` avec `<InputGroup>` pour duplicate name

## Validation
- Build tadviewer: `cd packages/tadviewer && npx webpack --mode production`
- Test: Right-click colonne → Delete/Duplicate fonctionne
- Commit: `feat(tadviewer): add column delete and duplicate to context menu`
