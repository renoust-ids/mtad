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

// Measure of pairwise association in the upper triangle of the matrix:
//  "r"   Pearson correlation      numeric × numeric
//  "eta" correlation ratio        categorical × numeric
//  "V"   Cramér's V               categorical × categorical
// The strength value is always exposed as `strength` (0..1 for eta/V, -1..1
// for r). `r` is kept as an alias of `strength` for backward compatibility
// with the numeric-only code path.
export type PairMeasure = "r" | "eta" | "V";

export interface PairCorrelation {
  xColId: string;
  yColId: string;
  measure: PairMeasure;
  r: number | null;
  strength: number | null;
  n: number; // number of rows where both columns are non-null / matched
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

// Options controlling the correlation-matrix computation.
export interface CorrelationMatrixOptions {
  // true => Spearman (rank correlation) on numeric × numeric / temporal pairs.
  // Categorical pairs (eta/V) are unaffected.
  rank?: boolean;
  // 0/undefined => no sampling; a positive value bounds the number of rows
  // used to compute each correlation (ORDER BY random() LIMIT n).
  sampleLimit?: number;
  // Pairs whose co-observed row count (n) is strictly below this threshold are
  // blanked (strength forced to null).
  minOccurrence?: number;
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

/**
 * Same single-scan structure as pairwiseCorrelationSql, but computes Spearman
 * (rank) correlation: each operand is ranked over the source with average
 * ranks for ties (the RANK() window function in DuckDB assigns average ranks
 * to tied values), then corr() is applied to the ranked columns.
 */
export function pairwiseRankCorrelationSql(
  baseSql: string,
  pairs: Array<[xColId: string, yColId: string]>
): string {
  const srcHead = `WITH __splom_src AS MATERIALIZED (\n  ${baseSql}\n)\n`;
  if (pairs.length === 0) {
    return `${srcHead}SELECT NULL AS __x, NULL AS __y, NULL AS __r, 0 AS __n\nFROM __splom_src\nWHERE 1 = 0`;
  }
  const srcRank = `,\n__splom_ranked AS (\n  SELECT\n${pairs
    .map(([x, y]) => {
      return `    rank() OVER (ORDER BY ${quoteColName(x)}) AS __rank_${x},\n    rank() OVER (ORDER BY ${quoteColName(y)}) AS __rank_${y}`;
    })
    .join(",\n")}\n  FROM __splom_src\n)\n`;
  const selectSeqs = pairs.map(([x, y]) => {
    const rqx = `__rank_${x}`;
    const rqy = `__rank_${y}`;
    return [
      `SELECT ${sqlEscapeString(x)} AS __x, ${sqlEscapeString(y)} AS __y,`,
      `       corr(${rqx}, ${rqy}) AS __r,`,
      `       regr_count(${rqx}, ${rqy}) AS __n`,
      "FROM __splom_ranked",
    ].join("\n");
  });
  return srcHead + srcRank + selectSeqs.join("\nUNION ALL\n");
}

/**
 * SQL computing the correlation ratio (eta) for a categorical × numeric pair.
 * eta is bounded 0..1 (1 = perfect separation of group means). n is the number
 * of rows where the category is non-null and the numeric value is non-null.
 * The numeric operand is the (possibly epoch-derived) projected name.
 */
const etaPairSql = (
  baseSql: string,
  catName: string,
  numName: string
): string => {
  const qc = quoteColName(catName);
  const qn = quoteColName(numName);
  return [
    `WITH __splom_src AS MATERIALIZED (`,
    `  ${baseSql}`,
    `),`,
    `__gm AS (SELECT avg(${qn}) AS grand FROM __splom_src WHERE ${qc} IS NOT NULL AND ${qn} IS NOT NULL),`,
    `__grp AS (`,
    `  SELECT ${qc} AS g , count(*) AS nk, avg(${qn}) AS nm`,
    `  FROM __splom_src`,
    `  WHERE ${qc} IS NOT NULL AND ${qn} IS NOT NULL`,
    `  GROUP BY ${qc}`,
    `),`,
    `__sb AS (SELECT sum(nk * pow(nm - grand, 2)) AS sbtw FROM __grp, __gm),`,
    `__st AS (SELECT sum(pow(${qn} - grand, 2)) AS stot FROM __splom_src, __gm WHERE ${qc} IS NOT NULL AND ${qn} IS NOT NULL)`,
    `SELECT`,
    `  ${sqlEscapeString(catName)} AS __x, ${sqlEscapeString(numName)} AS __y,`,
    `  sqrt(sbtw / NULLIF(stot, 0)) AS __r,`,
    `  (SELECT count(*) FROM __splom_src WHERE ${qc} IS NOT NULL AND ${qn} IS NOT NULL) AS __n`,
    `FROM __sb, __st LIMIT 1`,
  ].join("\n");
};

/**
 * SQL computing Cramér's V for a categorical × categorical pair. V is bounded
 * 0..1 (1 = perfect association). n is the number of rows where both
 * categories are non-null. The two operands are the projected column names.
 */
const cramerPairSql = (
  baseSql: string,
  catAName: string,
  catBName: string
): string => {
  const qa = quoteColName(catAName);
  const qb = quoteColName(catBName);
  return [
    `WITH __splom_src AS MATERIALIZED (`,
    `  ${baseSql}`,
    `),`,
    `__ct AS (`,
    `  SELECT ${qa} AS r, ${qb} AS c, count(*) AS obs`,
    `  FROM __splom_src`,
    `  WHERE ${qa} IS NOT NULL AND ${qb} IS NOT NULL`,
    `  GROUP BY ${qa}, ${qb}`,
    `),`,
    `__rc AS (SELECT r AS r_, sum(obs) AS rtot FROM __ct GROUP BY r),`,
    `__cc AS (SELECT c AS c_, sum(obs) AS ctot FROM __ct GROUP BY c),`,
    `__n AS (SELECT sum(obs) AS n FROM __ct),`,
    `__cells AS (`,
    `  SELECT ct.obs AS o, rc.rtot * cc.ctot / n.n AS ex`,
    `  FROM __ct ct, __rc rc, __cc cc, __n n`,
    `  WHERE ct.r = rc.r_ AND ct.c = cc.c_`,
    `),`,
    `__chi AS (SELECT sum(pow(o - ex, 2) / NULLIF(ex, 0)) AS x2 FROM __cells),`,
    `__dims AS (`,
    `  SELECT (SELECT count(*) FROM __rc) AS nr, (SELECT count(*) FROM __cc) AS nc, (SELECT n FROM __n) AS n`,
    `)`,
    `SELECT`,
    `  ${sqlEscapeString(catAName)} AS __x, ${sqlEscapeString(catBName)} AS __y,`,
    `  sqrt(x2 / n / NULLIF(least(nr - 1, nc - 1), 0)) AS __r,`,
    `  (SELECT n FROM __dims) AS __n`,
    `FROM __chi, __dims LIMIT 1`,
  ].join("\n");
};

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
 * Compute the pairwise association for every pair of the upper triangle,
 * routing each pair to the statistic appropriate for its column kinds:
 *
 *   numeric × numeric            -> Pearson correlation (r),  in epoch space
 *   categorical × numeric        -> correlation ratio (eta)
 *   categorical × categorical    -> Cramér's V
 *
 * Numeric-numeric pairs are batched into a single-scan query (as before) for
 * efficiency; categorical-involving pairs are computed in dedicated queries.
 * The value is always exposed through `strength` (via `r`); see PairCorrelation.
 */
export async function getCorrelationMatrix(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  matrixColIds: string[],
  opts?: CorrelationMatrixOptions
): Promise<PairCorrelation[]> {
  if (matrixColIds.length < 2) {
    return [];
  }
  const { rank, sampleLimit, minOccurrence } = opts ?? {};
  const { query, derivedNames } = splomScatterQuery(
    baseQuery,
    schema,
    matrixColIds
  );
  const sampleLimitN =
    sampleLimit != null && sampleLimit > 0 ? Math.floor(sampleLimit) : 0;
  const queryFor = sampleLimitN > 0
    ? await sampleQuery(dsConn, query, sampleLimitN)
    : query;
  const baseSql = await dsConn.getSqlForQuery(queryFor);

  const made: PairCorrelation[] = [];
  // (name, cid) for numeric/temporal and categorical columns respectively.
  const numNames: Array<[string, string]> = [];
  const catNames: Array<[string, string]> = [];
  for (const cid of matrixColIds) {
    const kind = splomColKind(schema.columnType(cid));
    const name = derivedNames[cid] ?? cid;
    if (kind === "categorical") {
      catNames.push([name, cid]);
    } else {
      numNames.push([name, cid]);
    }
  }

  // Pearson / Spearman: numeric/temporal × numeric/temporal, batched (rank
  // mode computes the Spearman rank correlation instead of plain corr()).
  if (numNames.length >= 2) {
    const numPairs: Array<[string, string]> = [];
    for (let i = 0; i < numNames.length - 1; i++) {
      for (let j = i + 1; j < numNames.length; j++) {
        numPairs.push([numNames[i][0], numNames[j][0]]);
      }
    }
    const corrSql = rank
      ? pairwiseRankCorrelationSql(baseSql, numPairs)
      : pairwiseCorrelationSql(baseSql, numPairs);
    const res = await dsConn.evalQuery(sqlQuery(corrSql));
    for (const row of res.rowData) {
      const xName = row.__x;
      const yName = row.__y;
      if (typeof xName !== "string" || typeof yName !== "string") {
        continue;
      }
      const strength = numOrNull(row.__r);
      made.push({
        xColId: xName2Cid(numNames, xName),
        yColId: xName2Cid(numNames, yName),
        measure: "r",
        r: strength,
        strength,
        n: numOrNull(row.__n) ?? 0,
      });
    }
  }

  // eta: categorical × numeric / temporal, one query per pair.
  for (const [catName, catCid] of catNames) {
    for (const [numName, numCid] of numNames) {
      const sql = etaPairSql(baseSql, catName, numName);
      const res = await dsConn.evalQuery(sqlQuery(sql));
      const strength = numOrNull(res.rowData[0]?.__r);
      made.push({
        xColId: catCid,
        yColId: numCid,
        measure: "eta",
        r: strength,
        strength,
        n: numOrNull(res.rowData[0]?.__n) ?? 0,
      });
    }
  }

  // Cramér's V: categorical × categorical, one query per pair.
  for (let i = 0; i < catNames.length - 1; i++) {
    for (let j = i + 1; j < catNames.length; j++) {
      const [catAName, catACid] = catNames[i];
      const [catBName, catBCid] = catNames[j];
      const sql = cramerPairSql(baseSql, catAName, catBName);
      const res = await dsConn.evalQuery(sqlQuery(sql));
      const strength = numOrNull(res.rowData[0]?.__r);
      made.push({
        xColId: catACid,
        yColId: catBCid,
        measure: "V",
        r: strength,
        strength,
        n: numOrNull(res.rowData[0]?.__n) ?? 0,
      });
    }
  }

  // Blank pairs whose co-observed count is below the min-occurrence threshold.
  if (minOccurrence != null && minOccurrence > 0) {
    for (const p of made) {
      if (p.n < minOccurrence) {
        p.strength = null;
        p.r = null;
      }
    }
  }

  return made;
}

// Wrap the scatter query so the correlation is computed over a random sample
// of at most `limit` rows, bounding the cost of the correlation itself.
const sampleQuery = async (
  dsConn: DataSourceConnection,
  query: QueryExp,
  limit: number
): Promise<QueryExp> => {
  const baseSql = await dsConn.getSqlForQuery(query);
  const sampledSql = `SELECT * FROM ( ${baseSql} ) AS __splom_s ORDER BY random() LIMIT ${limit}`;
  return sqlQuery(sampledSql);
};

// Resolve a projected (derived) column name back to the original column id.
const xName2Cid = (
  numNames: Array<[string, string]>,
  name: string
): string => {
  for (const [n, cid] of numNames) {
    if (n === name) {
      return cid;
    }
  }
  return name;
};

/**
 * Identify the given columns that are "always-null" (no non-null value) or
 * "constant" (exactly one distinct non-null value). Such columns carry no
 * usable correlation signal: they are excluded from the column picker and
 * listed to the user as an advisory. Returns their column ids.
 */
export async function constantOrNullColIds(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  colIds: string[]
): Promise<string[]> {
  if (colIds.length === 0) {
    return [];
  }
  const baseSql = await dsConn.getSqlForQuery(baseQuery);
  const queries = colIds
    .map((cid) => {
      const qc = quoteColName(cid);
      return [
        `SELECT`,
        `  count(${qc}) AS __nn,`,
        `  count(DISTINCT ${qc}) AS __uniq,`,
        `  ${sqlEscapeString(cid)} AS __cid`,
        `FROM ( ${baseSql} ) __cn`,
      ].join("\n");
    })
    .join("\nUNION ALL\n");
  const res = await dsConn.evalQuery(sqlQuery(queries));
  const bad: string[] = [];
  for (const row of res.rowData) {
    const cid = row.__cid;
    const nn = numOrNull(row.__nn) ?? 0;
    const uniq = numOrNull(row.__uniq) ?? 0;
    if (typeof cid === "string" && (nn === 0 || uniq <= 1)) {
      bad.push(cid);
    }
  }
  return bad;
}

/**
 * Linear regression (and correlation) of y over x, for the master-detail trend
 * line. x and y are the original matrix column ids; temporal columns are
 * regressed in epoch space.
 *
 * Returns a null regression when either operand is categorical, since corr()/
 * regr_* require two numeric operands (a trend line is not meaningful across
 * discrete categories).
 */
export async function getPairRegression(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  xColId: string,
  yColId: string
): Promise<PairRegression> {
  const noFit = (): PairRegression => ({
    xColId,
    yColId,
    r: null,
    slope: null,
    intercept: null,
    r2: null,
    n: 0,
  });
  if (
    splomColKind(schema.columnType(xColId)) === "categorical" ||
    splomColKind(schema.columnType(yColId)) === "categorical"
  ) {
    return noFit();
  }
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
    return noFit();
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