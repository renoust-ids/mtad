# Plan de réalisation : UI Improvements

## Objectif global
Ajouter des fonctionnalités de manipulation de colonnes/lignes via les context menus et améliorer l'interface d'export avec des options de filtrage et d'ordre des colonnes.

## Architecture cible

```
Context Menu Colonne
    ├── Delete Column → DELETE COLUMN DDL → execSql()
    └── Duplicate Column → ADD COLUMN DDL → execSql()

Context Menu Ligne
    ├── Delete Row → DELETE FROM WHERE → execSql()
    └── Duplicate Row → INSERT INTO SELECT WHERE → execSql()

Context Menu Lignes Agrégées
    ├── Delete All Aggregate Rows → DELETE FROM WHERE → execSql()
    └── Duplicate All Aggregate Rows → INSERT INTO SELECT WHERE → execSql()

Export Interface
    ├── Visible Columns Only → Filtrer displayColumns
    └── Column Order → Utiliser displayColumns order
```

## Fichiers concernés

| Package | Fichier | Modification |
|---------|---------|-------------|
| reltab | `src/DataSource.ts` | Nouvelles méthodes: deleteColumn, duplicateColumn, deleteRow, duplicateRow, deleteAllAggregateRows, duplicateAllAggregateRows |
| reltab | `src/remote/Connection.ts` | Request interfaces + RemoteDataSourceConnection methods |
| reltab | `src/remote/server.ts` | Server handlers pour les nouvelles opérations |
| tadviewer | `src/actions.ts` | Nouvelles actions: deleteColumn, duplicateColumn, deleteRow, duplicateRow, deleteAllAggregateRows, duplicateAllAggregateRows |
| tadviewer | `src/components/DataGrid.tsx` | Context menu colonnes: Delete, Duplicate. Context menu cellules: Delete Row, Duplicate Row, Delete All, Duplicate All |
| tadviewer | `src/components/GridPane.tsx` | State dialogs + callbacks pour colonnes et lignes |
| tadviewer | `src/components/AppPane.tsx` | Export dialog: checkboxes Visible Columns Only, Column Order |
| tadviewer | `src/AppState.ts` | Nouveaux champs: exportVisibleOnly, exportColumnOrder |

## Étapes

### Étape 1: Backend - DataSourceConnection methods
- Ajouter les signatures de méthode à l'interface DataSourceConnection
- Implémenter dans DbDataSource avec raw SQL
- Wire through remote transport (Connection.ts + server.ts)

### Étape 2: Context Menu Colonne - Delete & Duplicate
- Ajouter Delete Column avec confirmation
- Ajouter Duplicate Column avec dialogue de nom

### Étape 3: Context Menu Ligne - Delete & Duplicate
- Ajouter Delete Row avec confirmation
- Ajouter Duplicate Row
- Gérer aggregate vs leaf rows

### Étape 4: Context Menu Lignes Agrégées
- Ajouter Delete All Aggregate Rows
- Ajouter Duplicate All Aggregate Rows

### Étape 5: Export Interface
- Ajouter checkbox Visible Columns Only
- Ajouter checkbox Column Order
