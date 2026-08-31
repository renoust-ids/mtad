/**
 *
 * Scatter plot matrix (SPLOM) helpers using reltab
 *
 */

import { ColumnType, colIsNumeric, isTemporal } from "./ColumnType";
import { DataSourceConnection } from "./DataSource";
import { QueryExp, sqlQuery } from "./QueryExp";
import { Schema } from "./Schema";
import { TableRep, Row } from "./TableRep";
import { epoch, col } from "./defs";

// Classification of a matrix column: numeric (continuous axis), temporal
// (converted to epoch seconds), or categorical (discrete axis / color).
export type SplomColKind = "numeric" | "temporal" | "categorical";

export const columnKindIsNumeric = (ct: ColumnType): boolean =>
  colIsNumeric(ct) || isTemporal(ct);

export const splomColKind = (ct: ColumnType): SplomColKind =>
  colIsNumeric(ct) ? "numeric" : isTemporal(ct) ? "temporal" : "categorical";

// A single scatter point: values keyed by (original) matrix column id, plus the
// color-column value when one is set. Values are numbers (epoch seconds for
// temporal columns), strings/booleans for categorical columns, or null.
export interface ScatterPoint {
  [colId: string]: number | string | boolean | null;
}

export interface ScatterPlotData {
  colIds: string[];
  colKinds: SplomColKind[];
  points: ScatterPoint[];
  sampled: boolean;
  totalRows: number;
  colorColId?: string | null;
}

export interface ScatterPlotOptions {
  matrixColIds: string[];
  colorColId?: string | null;
  sampleLimit?: number; // 0/undefined => no sampling
  randomSample?: boolean; // default true: ORDER BY random() LIMIT n
}

// Name of the derived column carrying the epoch-second value of a temporal
// column in the scatter query.
const scatterDerivedPrefix = "__splom_";

/**
 * Build the query whose rows are one point per source row: the matrix columns
 * (temporal ones converted to epoch seconds via a derived column) plus the
 * optional color column. Returns the mapping from original column id to the
 * (possibly derived) projected name.
 */
export function splomScatterQuery(
  baseQuery: QueryExp,
  schema: Schema,
  matrixColIds: string[],
  colorColId?: string | null
): { query: QueryExp; derivedNames: Record<string, string> } {
  let query = baseQuery;
  const derivedNames: Record<string, string> = {};
  const projectCols: string[] = [];
  for (const cid of matrixColIds) {
    const ct = schema.columnType(cid);
    if (isTemporal(ct)) {
      const derived = `${scatterDerivedPrefix}${cid}`;
      query = query.extend(derived, epoch(col(cid)));
      derivedNames[cid] = derived;
      projectCols.push(derived);
    } else {
      projectCols.push(cid);
    }
  }
  if (colorColId != null) {
    projectCols.push(colorColId);
  }
  return { query: query.project(projectCols), derivedNames };
}

const numVal = (v: unknown): number | string | boolean | null => {
  if (typeof v === "bigint") {
    return Number(v);
  }
  return v as number | string | boolean | null;
};

/**
 * Fetch scatter points for the given matrix columns (plus optional color
 * column), sampling when sampleLimit is set and the source has more rows.
 * totalRows reflects the full row count; correlation is computed separately
 * over the full data, so the sample only bounds the rendering cost.
 */
export async function getScatterPlotData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  opts: ScatterPlotOptions
): Promise<ScatterPlotData> {
  const { matrixColIds, colorColId, sampleLimit, randomSample } = opts;
  const useRandomSample = randomSample ?? true;
  const colKinds = matrixColIds.map((cid) =>
    splomColKind(schema.columnType(cid))
  );
  const totalRows = await dsConn.rowCount(baseQuery);
  let sampled = false;
  let points: ScatterPoint[] = [];

  if (matrixColIds.length > 0) {
    const { query, derivedNames } = splomScatterQuery(
      baseQuery,
      schema,
      matrixColIds,
      colorColId
    );
    let res: TableRep;
    const useSample =
      sampleLimit != null && sampleLimit > 0 && totalRows > sampleLimit;
    if (useSample && useRandomSample) {
      sampled = true;
      const baseSql = await dsConn.getSqlForQuery(query);
      const sampledSql = `SELECT * FROM ( ${baseSql} ) AS __splom_s ORDER BY random() LIMIT ${Math.floor(
        sampleLimit
      )}`;
      res = await dsConn.evalQuery(sqlQuery(sampledSql));
    } else if (useSample) {
      sampled = true;
      res = await dsConn.evalQuery(query, 0, sampleLimit);
    } else {
      res = await dsConn.evalQuery(query);
    }
    const colorAlias =
      colorColId != null && colorColId.length > 0 ? colorColId : null;
    points = res.rowData.map((row: Row) => {
      const pt: ScatterPoint = {};
      for (const cid of matrixColIds) {
        const name = derivedNames[cid] ?? cid;
        pt[cid] = numVal(row[name]);
      }
      if (colorAlias != null) {
        pt[colorAlias] = numVal(row[colorAlias]);
      }
      return pt;
    });
  }

  return {
    colIds: matrixColIds,
    colKinds,
    points,
    sampled,
    totalRows,
    colorColId: colorColId ?? null,
  };
}