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
  | JoinCsvQueryRep;

// A "leaf dependency" is either a SqlQuery or a table name
export type QueryLeafDep = SqlQueryRep | TableQueryRep;
