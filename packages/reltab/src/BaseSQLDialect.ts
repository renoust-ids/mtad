import { SQLDialect } from "./dialect";
import { QueryRep } from "./QueryRep";
import { SQLQueryAST } from "./SQLQuery";
import { ColumnType, CoreColumnTypes, ColumnTypeMap } from "./ColumnType";
import { LeafSchemaMap } from "./TableRep";

function escapeQuotes(s: string): string {
  return s.replace(/"/g, '""');
}

export abstract class BaseSQLDialect implements SQLDialect {
  abstract readonly dialectName: string;
  readonly requireSubqueryAlias: boolean = false;
  readonly allowNonConstExtend: boolean = false;

  quoteCol(cid: string): string {
    return '"' + escapeQuotes(cid) + '"';
  }

  ppAggNull(aggStr: string, subExpStr: string, expType: ColumnType): string {
    return "null";
  }

  queryToSql(
    tableMap: LeafSchemaMap,
    query: QueryRep,
    offset?: number,
    limit?: number
  ): SQLQueryAST {
    // lazy require to break the circular dependency toSql -> defs -> dialects
    const toSql = require("./toSql") as typeof import("./toSql");
    return toSql.pagedQueryToSql(this, tableMap, query, offset, limit);
  }

  abstract readonly coreColumnTypes: CoreColumnTypes;
  abstract columnTypes: ColumnTypeMap;
}
