# ÉTAPE 4 : Context Menu Lignes Agrégées - Delete All & Duplicate All

## Objectif
Ajouter les options "Delete All Aggregate Rows" et "Duplicate All Aggregate Rows" au context menu des lignes agrégées.

## Fonctionnalités

### Delete All Aggregate Rows
- Disponible UNIQUEMENT sur les lignes agrégées (`_isLeaf === false`)
- Clic sur "Delete All Aggregate Rows" → Dialogue de confirmation
- Message: "Are you sure you want to delete all rows in this aggregate group?"
- Boutons: "Yes" / "Cancel"
- Construction WHERE clause: Colonnes pivot (vpivots[0..depth-1]) = valeurs du groupe
- Exécution: `dbc.deleteAllAggregateRows(tableName, whereClause)`
- Refresh: Re-fetch data

### Duplicate All Aggregate Rows
- Disponible UNIQUEMENT sur les lignes agrégées
- Clic sur "Duplicate All Aggregate Rows" → Exécute directement
- Construction WHERE clause: Même logique que Delete All
- Exécution: `dbc.duplicateAllAggregateRows(tableName, whereClause)`
- Refresh: Re-fetch data

## WHERE clause pour lignes agrégées
```typescript
// vpivots[0..depth-1] sont les colonnes de groupement
const pivotCols = viewParams.vpivots.slice(0, depth);
const whereParts = pivotCols.map(col => 
  `"${col}" = ${formatSqlValue(item[col])}`
);
const whereClause = whereParts.join(" AND ");
```

## Context Menu Items
Sur une ligne agrégée, le menu affiche:
- "Edit all" (existant)
- "Delete All Aggregate Rows" (nouveau)
- "Duplicate All Aggregate Rows" (nouveau)

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` - Context menu items pour aggregate rows
2. `packages/tadviewer/src/components/GridPane.tsx` - Dialog state + callbacks
3. `packages/tadviewer/src/actions.ts` - Actions deleteAllAggregateRows, duplicateAllAggregateRows

## Validation
- Build tadviewer: `cd packages/tadviewer && npx webpack --mode production`
- Test: Right-click aggregate row → Les 3 items sont affichés
- Test: Right-click leaf row → Seul "Edit" est affiché
- Commit: `feat(tadviewer): add aggregate row delete and duplicate to context menu`
