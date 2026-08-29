# ÉTAPE 1 : Backend - DataSourceConnection methods

## Objectif
Ajouter les méthodes de manipulation de colonnes et lignes à l'interface DataSourceConnection et les implémenter dans le driver DuckDB.

## Méthodes à ajouter

### DataSourceConnection interface
```typescript
// Column operations
deleteColumn(tableName: string, columnName: string): Promise<void>;
duplicateColumn(tableName: string, sourceColumn: string, newColumn: string): Promise<void>;

// Row operations (multiple rows at once)
deleteRows(tableName: string, whereClause: string): Promise<void>;
duplicateRows(tableName: string, whereClause: string): Promise<void>;
```

### DbDataSource SQL
- `deleteColumn`: `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`
- `duplicateColumn`: `ALTER TABLE "${tableName}" ADD COLUMN "${newColumn}" AS "${sourceColumn}"`
- `deleteRows`: `DELETE FROM "${tableName}" WHERE ${whereClause}`
- `duplicateRows`: `INSERT INTO "${tableName}" SELECT * FROM "${tableName}" WHERE ${whereClause}`

### Remote transport
- Request interfaces in `Connection.ts`
- `RemoteDataSourceConnection` methods
- Server handlers in `server.ts`

## WHERE clause pattern (for row operations)
```typescript
// Build WHERE from primary key or all non-metadata columns
const excludeCols = ["Rec", "_id", "_parentId", "_depth", "_isOpen", "_pivot", "_isLeaf"];
// Use in action layer, not in DataSource
```

## Fichiers à modifier
1. `packages/reltab/src/DataSource.ts`
2. `packages/reltab/src/remote/Connection.ts`
3. `packages/reltab/src/remote/server.ts`

## Validation
- Build: `cd packages/reltab && npx tsc -p tsconfig-build.json`
- Commit: `feat(reltab): add deleteColumn, duplicateColumn, deleteRows, duplicateRows`
