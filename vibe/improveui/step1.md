# ÉTAPE 1 : Backend - DataSourceConnection methods

## Objectif
Ajouter les méthodes de manipulation de colonnes et lignes à l'interface DataSourceConnection et les implémenter dans le driver DuckDB.

## Méthodes à ajouter

### DataSourceConnection interface
```typescript
deleteColumn(tableName: string, columnName: string): Promise<void>;
duplicateColumn(tableName: string, sourceColumn: string, newColumn: string): Promise<void>;
deleteRow(tableName: string, whereClause: string): Promise<void>;
duplicateRow(tableName: string, whereClause: string): Promise<void>;
deleteAllAggregateRows(tableName: string, whereClause: string): Promise<void>;
duplicateAllAggregateRows(tableName: string, whereClause: string): Promise<void>;
```

### DbDataSource implementation
- `deleteColumn`: `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`
- `duplicateColumn`: `ALTER TABLE "${tableName}" ADD COLUMN "${newColumn}" AS "${sourceColumn}"`
- `deleteRow`: `DELETE FROM "${tableName}" WHERE ${whereClause}`
- `duplicateRow`: `INSERT INTO "${tableName}" SELECT * FROM "${tableName}" WHERE ${whereClause}`
- `deleteAllAggregateRows`: `DELETE FROM "${tableName}" WHERE ${whereClause}`
- `duplicateAllAggregateRows`: `INSERT INTO "${tableName}" SELECT * FROM "${tableName}" WHERE ${whereClause}`

### Remote transport
- Request interfaces dans Connection.ts
- RemoteDataSourceConnection methods
- Server handlers dans server.ts

## Fichiers à modifier
1. `packages/reltab/src/DataSource.ts` - Interface + DbDataSource
2. `packages/reltab/src/remote/Connection.ts` - Request interfaces + Remote methods
3. `packages/reltab/src/remote/server.ts` - Server handlers

## Validation
- Build reltab: `cd packages/reltab && npx tsc -p tsconfig-build.json`
- Commit: `feat(reltab): add deleteColumn, duplicateColumn, deleteRow, duplicateRow methods`
