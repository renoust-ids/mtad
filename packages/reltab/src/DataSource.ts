/**
 * Hierarchical organization of data sources.
 */

import { SQLDialect } from "./dialect";
import { QueryExp } from "./QueryExp";
import { defaultEvalQueryOptions } from "./remote/Connection";
import { Schema } from "./Schema";

import { Row, LeafSchemaMap, TableRep } from "./TableRep";
import * as log from "loglevel";
import { QueryLeafDep, TableQueryRep } from "./QueryRep";
import { ColumnStatsMap } from "./ColumnStats";

export type DataSourceKind =
  | "DataSource"
  | "Database"
  | "Dataset"
  | "Table"
  | "Directory"
  | "File";

// Static registry of globally unique DataSourceProvider names:
export type DataSourceProviderName =
  | "aws-athena"
  | "bigquery"
  | "duckdb"
  | "sqlite"
  | "snowflake"
  | "localfs"
  | "motherduck";

export interface DataSourceId {
  providerName: DataSourceProviderName;
  resourceId: string; // A provider-specific string to identify the data source (':memory', path to a directory or file, etc)
}

export interface DataSourcePath {
  sourceId: DataSourceId;
  path: string[];
  // Optional worksheet to import for an Excel (.xlsx) data source; omitted
  // means the first sheet. Rides along in the path so opening a multi-sheet
  // workbook can select a specific sheet.
  sheet?: string;
}

export interface DataSourceNode {
  id: string; // component of DataSourcePath.path, or fully qualified name for leaf nodes
  kind: DataSourceKind;
  displayName: string;
  description?: string;
  isContainer: boolean; // true iff this node can have children
}

export interface EvalQueryOptions {
  showQueries?: boolean;
}

/**
 * A driver for a particular database, capable of
 * executing SQL queries, obtaining schema info
 * for tables and queries, and enumerating
 * data catalog information
 */
export interface DbDriver {
  readonly sourceId: DataSourceId;
  readonly dialect: SQLDialect;

  runSqlQuery(sqlQuery: string): Promise<Row[]>;
  getTableSchema(tableName: string): Promise<Schema>;
  getSqlQuerySchema(sqlQuery: string): Promise<Schema>;

  getSqlQueryColumnStatsMap(sqlQuery: string): Promise<ColumnStatsMap>;

  getRootNode(): Promise<DataSourceNode>;
  getChildren(path: DataSourcePath): Promise<DataSourceNode[]>;

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string>;

  // display name for this connection
  getDisplayName(): Promise<string>;
}

/**
 * A local or remote connection to a data source.
 */
export interface DataSourceConnection {
  readonly sourceId: DataSourceId;

  evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep>;
  rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number>;

  getTableSchema(tableName: string): Promise<Schema>;

  getColumnStatsMap(query: QueryExp): Promise<ColumnStatsMap>;

  getRootNode(): Promise<DataSourceNode>;
  getChildren(path: DataSourcePath): Promise<DataSourceNode[]>;

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string>;

  // display name for this connection
  getDisplayName(): Promise<string>;

  // Execute raw SQL (for DML/DDL like UPDATE, INSERT, DELETE)
  execSql(sql: string): Promise<void>;

  // Get SQL string for a query (for materialization, etc.)
  getSqlForQuery(query: QueryExp): Promise<string>;

  // Rename a column in a table
  renameColumn(
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void>;

  // Delete a column from a table
  deleteColumn(tableName: string, columnName: string): Promise<void>;

  // Duplicate a column in a table (adds newColumn with same values as sourceColumn)
  duplicateColumn(
    tableName: string,
    sourceColumn: string,
    newColumn: string
  ): Promise<void>;

  // Delete rows matching a WHERE clause
  deleteRows(tableName: string, whereClause: string): Promise<void>;

  // Duplicate rows matching a WHERE clause (INSERT INTO ... SELECT * FROM ... WHERE)
  duplicateRows(tableName: string, whereClause: string): Promise<void>;

  // Insert a single empty row (all columns NULL) into a table
  insertRow(tableName: string): Promise<void>;

  // Add a new empty (all NULL) column to a table
  insertColumn(tableName: string, columnName: string): Promise<void>;
}

/**
 * The standard implementation of DataSourceConnection interface,
 * backed by an underlying DbDriver.
 */
export class DbDataSource implements DataSourceConnection {
  readonly sourceId: DataSourceId;

  readonly db: DbDriver;
  private tableMap: LeafSchemaMap;

  constructor(db: DbDriver) {
    this.db = db;
    this.sourceId = db.sourceId;
    this.tableMap = {};
  }

  async getSqlForQuery(
    query: QueryExp,
    offset?: number,
    limit?: number
  ): Promise<string> {
    await this.ensureLeafDeps(query);
    const schema = query.getSchema(this.db.dialect, this.tableMap);
    const sqlQuery = query.toSql(this.db.dialect, this.tableMap, offset, limit);
    return sqlQuery;
  }

  async evalQuery(
    query: QueryExp,
    offset?: number,
    limit?: number,
    options?: EvalQueryOptions
  ): Promise<TableRep> {
    const sqlQuery = await this.getSqlForQuery(query, offset, limit);
    const schema = query.getSchema(this.db.dialect, this.tableMap);
    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.info("evalQuery: evaluating:\n" + sqlQuery);
    }

    const rows = await this.db.runSqlQuery(sqlQuery);
    const ret = new TableRep(schema, rows);

    /*
    if (this.showQueries) {
      log.info("time to run query: %ds %dms", t3s, t3ns / 1e6);
      log.info("time to mk table rep: %ds %dms", t4s, t4ns / 1e6);
    }
    */

    return ret;
  }

  async rowCount(query: QueryExp, options?: EvalQueryOptions): Promise<number> {
    await this.ensureLeafDeps(query);
    const countSql = query.toCountSql(this.db.dialect, this.tableMap);

    const trueOptions = options ? options : defaultEvalQueryOptions;

    if (trueOptions.showQueries) {
      // log.info("time to generate sql: %ds %dms", t1s, t1ns / 1e6);
      log.debug("rowCount: evaluating: \n" + countSql);
    }

    const rows = await this.db.runSqlQuery(countSql);
    let rowCount = rows[0].rowCount as number;
    if (typeof rowCount === "bigint") {
      const rcVal = rowCount as bigint;
      rowCount = Number.parseInt(rcVal.toString());
    }
    return rowCount;
  }

  // ensure every table (or base query) mentioned in query is registered:
  async ensureLeafDeps(query: QueryExp): Promise<void> {
    const leafDepsMap = query.getLeafDeps();
    for (const [leafKey, leafQuery] of leafDepsMap.entries()) {
      if (this.tableMap[leafKey] === undefined) {
        await this.getLeafDepSchema(leafKey, leafQuery);
      }
    }
  }

  async getLeafDepSchema(
    leafKey: string,
    leafQuery: QueryLeafDep
  ): Promise<Schema> {
    let schema: Schema | undefined = this.tableMap[leafKey];
    if (!schema) {
      switch (leafQuery.operator) {
        case "table":
          schema = await this.db.getTableSchema(leafQuery.tableName);
          if (schema) {
            // add a unique physical row identifier (DuckDB rowid) as a hidden
            // column so downstream operations can target individual rows
            schema = schema.extend("_rid", {
              columnType: "integer",
              displayName: "_rid",
            });
          }
          break;
        case "sql":
          schema = await this.db.getSqlQuerySchema(leafQuery.sqlQuery);
          break;
        default:
          const invalidQuery: never = leafQuery;
          throw new Error(
            "getLeafDepInfo: Unknown operator for leaf query: " + leafQuery
          );
      }
      if (schema) {
        this.tableMap[leafKey] = schema;
      }
    }
    return schema;
  }

  async getSchema(query: QueryExp): Promise<Schema> {
    await this.ensureLeafDeps(query);
    const schema = query.getSchema(this.db.dialect, this.tableMap);
    return schema;
  }

  getTableSchema(tableName: string): Promise<Schema> {
    const leafDep: TableQueryRep = { operator: "table", tableName };
    const leafKey = JSON.stringify(leafDep);
    return this.getLeafDepSchema(leafKey, leafDep);
  }

  async getColumnStatsMap(query: QueryExp): Promise<ColumnStatsMap> {
    const sqlQuery = await this.getSqlForQuery(query);
    const columnStatsMap = await this.db.getSqlQueryColumnStatsMap(sqlQuery);
    return columnStatsMap;
  }

  getRootNode(): Promise<DataSourceNode> {
    return this.db.getRootNode();
  }

  getChildren(path: DataSourcePath): Promise<DataSourceNode[]> {
    return this.db.getChildren(path);
  }

  // Get a table name that can be used in queries:
  getTableName(path: DataSourcePath): Promise<string> {
    return this.db.getTableName(path);
  }

  // display name for this connection
  getDisplayName(): Promise<string> {
    return this.db.getDisplayName();
  }

  async execSql(sql: string): Promise<void> {
    await this.db.runSqlQuery(sql);
  }

  async renameColumn(
    tableName: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    const sql = `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}"`;
    await this.db.runSqlQuery(sql);
    // Invalidate cached schema for this table
    const leafDep = { operator: "table", tableName } as const;
    const leafKey = JSON.stringify(leafDep);
    delete this.tableMap[leafKey];
  }

  async deleteColumn(tableName: string, columnName: string): Promise<void> {
    const sql = `ALTER TABLE "${tableName}" DROP COLUMN "${columnName}"`;
    await this.db.runSqlQuery(sql);
    const leafDep = { operator: "table", tableName } as const;
    const leafKey = JSON.stringify(leafDep);
    delete this.tableMap[leafKey];
  }

  async duplicateColumn(
    tableName: string,
    sourceColumn: string,
    newColumn: string
  ): Promise<void> {
    // Two-step approach: add column, then copy values
    const addSql = `ALTER TABLE "${tableName}" ADD COLUMN "${newColumn}" VARCHAR`;
    await this.db.runSqlQuery(addSql);
    const updateSql = `UPDATE "${tableName}" SET "${newColumn}" = "${sourceColumn}"`;
    await this.db.runSqlQuery(updateSql);
    const leafDep = { operator: "table", tableName } as const;
    const leafKey = JSON.stringify(leafDep);
    delete this.tableMap[leafKey];
  }

  async deleteRows(tableName: string, whereClause: string): Promise<void> {
    const sql = `DELETE FROM "${tableName}" WHERE ${whereClause}`;
    await this.db.runSqlQuery(sql);
  }

  async duplicateRows(tableName: string, whereClause: string): Promise<void> {
    const sql = `INSERT INTO "${tableName}" SELECT * FROM "${tableName}" WHERE ${whereClause}`;
    await this.db.runSqlQuery(sql);
  }

  async insertRow(tableName: string): Promise<void> {
    const sql = `INSERT INTO "${tableName}" DEFAULT VALUES`;
    await this.db.runSqlQuery(sql);
  }

  async insertColumn(tableName: string, columnName: string): Promise<void> {
    const sql = `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" VARCHAR`;
    await this.db.runSqlQuery(sql);
    // Invalidate cached schema for this table
    const leafDep = { operator: "table", tableName } as const;
    const leafKey = JSON.stringify(leafDep);
    delete this.tableMap[leafKey];
  }
}

export interface DataSourceProvider {
  readonly providerName: DataSourceProviderName;
  connect(resourceId: string): Promise<DataSourceConnection>;
}
