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
import { epoch, col, sqlEscapeString } from "./defs";

const quoteColName = (cid: string): string =>
  '"' + cid.replace(/"/g, '""') + '"';

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

// Correlation of a numeric pair (upper triangle of the matrix). r is null when
// corr() is NULL (constant column / fewer than 2 non-null pairs).
export interface PairCorrelation {
  xColId: string;
  yColId: string;
  r: number | null;
  n: number; // regr_count: pairs where x AND y are non-null
}

// Linear regression of a pair, used for the master-detail trend line.
export interface PairRegression {
  xColId: string;
  yColId: string;
  r: number | null;
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  n: number;
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

/**
 * Build a single-scan SQL query computing Pearson correlation (r) and the
 * non-null pair count (n) for every (x, y) pair. A MATERIALIZED CTE over the
 * base SQL avoids re-scanning the source once per pair.
 */
export function pairwiseCorrelationSql(
  baseSql: string,
  pairs: Array<[xColId: string, yColId: string]>
): string {
  const srcHead = `WITH __splom_src AS MATERIALIZED (\n  ${baseSql}\n)\n`;
  if (pairs.length === 0) {
    return `${srcHead}SELECT NULL AS __x, NULL AS __y, NULL AS __r, 0 AS __n\nFROM __splom_src\nWHERE 1 = 0`;
  }
  const selectSeqs = pairs.map(([x, y]) => {
    const qx = quoteColName(x);
    const qy = quoteColName(y);
    return [
      `SELECT ${sqlEscapeString(x)} AS __x, ${sqlEscapeString(y)} AS __y,`,
      `       corr(${qx}, ${qy}) AS __r,`,
      `       regr_count(${qx}, ${qy}) AS __n`,
      "FROM __splom_src",
    ].join("\n");
  });
  return srcHead + selectSeqs.join("\nUNION ALL\n");
}

const numOrNull = (v: unknown): number | null => {
  if (typeof v === "bigint") {
    return Number(v);
  }
  if (v == null) {
    return null;
  }
  const n = v as number;
  // DuckDB returns NaN for corr on constant data / insufficient variance
  return Number.isNaN(n) ? null : n;
};

/**
 * Compute the correlation for every eligible pair of the upper triangle.
 * Pairs are counted when both columns are numeric or temporal (temporal ones
 * are correlated in epoch space); any categorical column involved is skipped
 * (the UI shows "n/a" for those cells).
 */
export async function getCorrelationMatrix(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  matrixColIds: string[]
): Promise<PairCorrelation[]> {
  if (matrixColIds.length < 2) {
    return [];
  }
  const nameToCid: Record<string, string> = {};
  const names: string[] = [];
  const { query, derivedNames } = splomScatterQuery(baseQuery, schema, matrixColIds);
  for (const cid of matrixColIds) {
    if (!columnKindIsNumeric(schema.columnType(cid))) {
      continue;
    }
    const name = derivedNames[cid] ?? cid;
    nameToCid[name] = cid;
    names.push(name);
  }
  if (names.length < 2) {
    return [];
  }
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < names.length - 1; i++) {
    for (let j = i + 1; j < names.length; j++) {
      pairs.push([names[i], names[j]]);
    }
  }
  const baseSql = await dsConn.getSqlForQuery(query);
  const corrSql = pairwiseCorrelationSql(
    baseSql,
    pairs
  );
  const res = await dsConn.evalQuery(sqlQuery(corrSql));
  const correlations: PairCorrelation[] = [];
  for (const row of res.rowData) {
    const xName = row.__x;
    const yName = row.__y;
    if (typeof xName !== "string" || typeof yName !== "string") {
      continue;
    }
    correlations.push({
      xColId: nameToCid[xName] ?? xName,
      yColId: nameToCid[yName] ?? yName,
      r: numOrNull(row.__r),
      n: numOrNull(row.__n) ?? 0,
    });
  }
  return correlations;
}

/**
 * Linear regression (and correlation) of y over x, for the master-detail trend
 * line. x and y are the original matrix column ids; temporal columns are
 * regressed in epoch space.
 */
export async function getPairRegression(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  xColId: string,
  yColId: string
): Promise<PairRegression> {
  const { query, derivedNames } = splomScatterQuery(baseQuery, schema, [
    xColId,
    yColId,
  ]);
  const baseSql = await dsConn.getSqlForQuery(query);
  const xName = derivedNames[xColId] ?? xColId;
  const yName = derivedNames[yColId] ?? yColId;
  const qx = quoteColName(xName);
  const qy = quoteColName(yName);
  const regrSql = [
    `SELECT corr(${qx}, ${qy}) AS __r,`,
    `       regr_slope(${qy}, ${qx}) AS __slope,`,
    `       regr_intercept(${qy}, ${qx}) AS __intercept,`,
    `       regr_r2(${qy}, ${qx}) AS __r2,`,
    `       regr_count(${qy}, ${qx}) AS __n`,
    "FROM ( " + baseSql + " ) __s",
    `WHERE ${qx} IS NOT NULL AND ${qy} IS NOT NULL`,
  ].join("\n");
  const res = await dsConn.evalQuery(sqlQuery(regrSql));
  const row = res.rowData[0];
  if (!row) {
    return { xColId, yColId, r: null, slope: null, intercept: null, r2: null, n: 0 };
  }
  return {
    xColId,
    yColId,
    r: numOrNull(row.__r),
    slope: numOrNull(row.__slope),
    intercept: numOrNull(row.__intercept),
    r2: numOrNull(row.__r2),
    n: numOrNull(row.__n) ?? 0,
  };
}