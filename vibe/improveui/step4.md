# ÉTAPE 4 : Context Menu Lignes Agrégées - Delete/Duplicate All

## Objectif
Ajouter "Delete All Aggregate Rows" et "Duplicate All Aggregate Rows" au context menu des lignes agrégées (`_isLeaf === false`).

## Fonctionnalités

### Delete All Aggregate Rows
- Disponible UNIQUEMENT sur lignes agrégées
- Confirmation: "Are you sure you want to delete all rows in this aggregate group?"
- WHERE clause: vpivots[0..depth-1] = valeurs du groupe
- Execute: `dbc.deleteRows(tableName, whereClause)`
- Refresh: Re-fetch data

### Duplicate All Aggregate Rows
- Disponible UNIQUEMENT sur lignes agrégées
- Pas de confirmation
- WHERE clause: vpivots[0..depth-1] = valeurs du groupe
- Execute: `dbc.duplicateRows(tableName, whereClause)`
- Refresh: Re-fetch data

## WHERE clause pour lignes agrégées
```typescript
// vpivots[0..depth-1] = colonnes de groupement
const pivotCols = viewParams.vpivots.slice(0, depth);
const whereParts = pivotCols.map(col => `"${col}" = ${formatSqlValue(item[col])}`);
const whereClause = whereParts.join(" AND ");
```

## Context Menu Items (lignes agrégées)
```
Edit all                        (existant)
─ separator ─
Delete All Aggregate Rows       (nouveau)
Duplicate All Aggregate Rows    (nouveau)
─ separator ─
Delete Rows                     (Étape 3 — lignes sélectionnées)
Duplicate Rows                  (Étape 3 — lignes sélectionnées)
```

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` — Additional menu items when `isAggregate`
2. `packages/tadviewer/src/components/GridPane.tsx` — Callbacks
3. `packages/tadviewer/src/actions.ts` — Actions (réutiliser deleteRows/duplicateRows avec WHERE different)

## Validation
- Build: `cd packages/tadviewer && npx webpack --mode production`
- Test: Right-click aggregate row → "Delete All" / "Duplicate All" disponibles
- Test: Right-click leaf row → Ces items ne sont PAS affichés
- Commit: `feat(tadviewer): add aggregate row delete and duplicate to context menu`
