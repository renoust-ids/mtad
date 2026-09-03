/*
 * Could almost use an intersection type of {id,type} & ColumnMetadata, but
 * properties are all optional here
 */

import { ColumnType } from "./ColumnType";
import { AggFn } from "./AggFn";
import { FilterExp } from "./FilterExp";
import { ColumnExtendExp } from "./defs";
import { ColumnMetaMap } from "./Schema";

// An AggColSpec is either a column name (for default aggregation based on column type
// or a pair of column name and AggFn
export type AggColSpec = string | [AggFn, string];

export type ColumnMapInfo = {
  id?: string;
  displayName?: string;
};

export type ColumnExtendOptions = {
  displayName?: string;
  type?: ColumnType;
};

export interface SqlQueryRep {
  operator: "sql";
  sqlQuery: string;
}

export interface TableQueryRep {
  operator: "table";
  tableName: string;
}
export interface ProjectQueryRep {
  operator: "project";
  cols: string[];
  from: QueryRep;
}
export interface GroupByQueryRep {
  operator: "groupBy";
  cols: string[];
  aggs: AggColSpec[];
  from: QueryRep;
}
export interface FilterQueryRep {
  operator: "filter";
  fexp: FilterExp;
  from: QueryRep;
}
export interface MapColumnsQueryRep {
  operator: "mapColumns";
  cmap: { [colName: string]: ColumnMapInfo };
  from: QueryRep;
}
export interface MapColumnsByIndexQueryRep {
  operator: "mapColumnsByIndex";
  cmap: { [colIndex: number]: ColumnMapInfo };
  from: QueryRep;
}
export interface ConcatQueryRep {
  operator: "concat";
  target: QueryRep;
  from: QueryRep;
}
export interface SortQueryRep {
  operator: "sort";
  keys: [string, boolean][];
  from: QueryRep;
}
export interface ExtendQueryRep {
  operator: "extend";
  colId: string;
  colExp: ColumnExtendExp;
  opts: ColumnExtendOptions;
  from: QueryRep;
}
// Join types:  For now: only left outer
export type JoinType = "LeftOuter";
export interface JoinQueryRep {
  operator: "join";
  rhs: QueryRep;
  on: string | string[];
  joinType: JoinType;
  lhs: QueryRep;
}

export type CsvJoinType = "inner" | "left" | "right" | "outer";

export interface JoinCsvArgs {
  rightTablePath: string;
  // Alternative to rightTablePath: an already-imported DuckDB table to join
  // against (e.g. an imported .xlsx sheet). When set, the RHS is referenced as
  // a table name instead of read_csv_auto(rightTablePath).
  rhsTableName?: string;
  joinType: CsvJoinType;
  leftCol: string;
  rightCol: string;
  forceStringCast: boolean;
  nullString?: string;
}

export interface JoinCsvQueryRep {
  operator: "joinCsv";
  args: JoinCsvArgs;
  rhsSchema: ColumnMetaMap;
  rhsColumns: string[];
  from: QueryRep;
}

/*
 * A single output column of a file concatenate. The result table has exactly
 * one column per ConcatCsvOutputColumn, in the order given. Each output column
 * may source its value from the original table (originalCol), from the
 * concatenated file (newCol), or both.
 *
 * - matched : value present on both sides; newCol is cast to `castType`
 *   (the selected widest/result type) when reading the concatenated file.
 * - originalOnly : column exists only in the original table; the concatenated
 *   rows contribute NULL.
 * - newOnly : column exists only in the concatenated file; the original rows
 *   contribute NULL. `newColType` is the file's inferred SQL type.
 */
export type ConcatCsvOutputColumn =
  | {
      kind: "matched";
      originalCol: string;
      newCol: string;
      castType: string;
      nullString?: string;
    }
  | {
      kind: "originalOnly";
      originalCol: string;
      // sql type of the original column, used to keep the UNION typing stable
      originalType: string;
    }
  | {
      kind: "newOnly";
      newCol: string;
      newColType: string;
      nullString?: string;
    };

export interface ConcatCsvArgs {
  rightTablePath: string;
  // Alternative to rightTablePath: an already-imported DuckDB table (e.g. an
  // imported .xlsx sheet). When set the file is referenced as a table name
  // instead of read_csv_auto(rightTablePath).
  rhsTableName?: string;
  // The full list of result columns (in final output order).
  outputColumns: ConcatCsvOutputColumn[];
}

export interface ConcatCsvQueryRep {
  operator: "concatCsv";
  args: ConcatCsvArgs;
  rhsSchema: ColumnMetaMap;
  rhsColumns: string[];
  from: QueryRep;
}

export type QueryRep =
  | SqlQueryRep
  | TableQueryRep
  | ProjectQueryRep
  | GroupByQueryRep
  | FilterQueryRep
  | MapColumnsQueryRep
  | MapColumnsByIndexQueryRep
  | ConcatQueryRep
  | SortQueryRep
  | ExtendQueryRep
  | JoinQueryRep
  | JoinCsvQueryRep
  | ConcatCsvQueryRep;

// A "leaf dependency" is either a SqlQuery or a table name
export type QueryLeafDep = SqlQueryRep | TableQueryRep;
