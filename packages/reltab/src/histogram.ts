/**
 *
 * Column histograms using reltab
 */

import { ColumnType, colIsNumeric } from "./ColumnType";
import { DataSourceConnection } from "./DataSource";
import { QueryExp } from "./QueryExp";
import { ColumnStatsMap, NumericSummaryStats } from "./ColumnStats";
import { Schema } from "./Schema";
import { TableRep } from "./TableRep";
import { nice, thresholdSturges } from "./d3utils";
import { constVal, cast, minus, col, divide, floor, Scalar } from "./defs";
import { DuckDBDialect } from "./dialectRegistry";

export interface Bin {
  lower: number;
  upper: number;
}

export function binsForColumn(colStats: NumericSummaryStats): number {
  const nullsCount = colStats.pctNull
    ? Math.ceil(colStats.pctNull * colStats.count)
    : 0;
  const valuesCount = colStats.count - nullsCount;
  const numBins = thresholdSturges(valuesCount) + 1;
  return numBins;
}

// TODO: adjust to work with any dialect:
// grab dialect.coreColumnTypes.real
const doubleType = DuckDBDialect.columnTypes["DOUBLE"];
const intType = DuckDBDialect.columnTypes["INTEGER"];

// Query and metadata needed to form histogram query for a single column
// We return this way so that we can combine multiple histogram queries
// into a single query.
export interface NumericColumnHistogramQuery {
  colId: string;
  histoQuery: QueryExp; // query to compute histogram
  minVal: number;
  maxVal: number;
  niceMinVal: number;
  niceMaxVal: number;
  binCount: number;
  binWidth: number;
}

export function columnHistogramQuery(
  baseQuery: QueryExp,
  colId: string,
  colType: ColumnType,
  colStats: NumericSummaryStats
): NumericColumnHistogramQuery | null {
  const minVal = colStats.min;
  const maxVal = colStats.max;

  if (minVal == null || maxVal == null || minVal === maxVal) {
    return null;
  }
  const binCount = binsForColumn(colStats);

  const [niceMinVal, niceMaxVal] = nice(minVal, maxVal, binCount);

  const binWidth = (niceMaxVal - niceMinVal) / binCount;

  // add a column with bin number:
  const binQuery = baseQuery
    .extend("column", constVal(colId))
    .extend(
      "bin",
      cast(
        floor(
          divide(
            minus(
              cast(col(colId), doubleType),
              cast(constVal(niceMinVal), doubleType)
            ),
            cast(constVal(binWidth), doubleType)
          )
        ),
        intType
      )
    );

  const histoQuery = binQuery
    .extend("binCount", constVal(1))
    .project(["column", "bin", "binCount"])
    .groupBy(["column", "bin"], [["count", "binCount"]]);

  const ret = {
    colId,
    histoQuery,
    minVal,
    maxVal,
    niceMinVal,
    niceMaxVal,
    binCount,
    binWidth,
  };
  return ret;
}

// histogram data for rendering a single column histogram
export interface NumericColumnHistogramData {
  colId: string;
  niceMinVal: number;
  niceMaxVal: number;
  binCount: number;
  binWidth: number;
  binData: number[];
  brushMinVal: number;
  brushMaxVal: number;
}

/*
 *
 * Given the result of running a histogram query, extract the histogram data for a single column
 */
export function getNumericColumnHistogramData(
  colId: string,
  histoQuery: NumericColumnHistogramQuery,
  queryRes: TableRep
): NumericColumnHistogramData {
  const { niceMinVal, niceMaxVal, binCount, binWidth } = histoQuery;
  const numBins = Math.max(Math.ceil((niceMaxVal - niceMinVal) / binWidth), 1);
  const binData = new Array(numBins).fill(0);
  const { rowData } = queryRes;
  // we could do better by partitioning by column id, but unlikely to be a lot of data for now
  for (const row of rowData) {
    if (row.column === colId) {
      const bin = row.bin as number;
      const binCount = row.binCount;
      binData[bin] = Number(binCount);
    }
  }
  const brushMinVal = niceMinVal;
  const brushMaxVal = niceMaxVal + binWidth;
  return {
    colId,
    niceMinVal,
    niceMaxVal,
    binCount,
    binWidth,
    binData,
    brushMinVal,
    brushMaxVal,
  };
}

export type ColumnHistogramMap = {
  [colId: string]: NumericColumnHistogramData;
};

/*
 *
 * Single-column histogram data for one column, computed on demand.
 * Returns null if the column is not numeric, has no stats, or has empty range.
 */
export async function getSingleColumnHistogramData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema,
  colId: string,
  colStats?: NumericSummaryStats
): Promise<NumericColumnHistogramData | null> {
  const colType = baseSchema.columnType(colId);
  if (!colIsNumeric(colType)) {
    return null;
  }

  let stats = colStats;
  if (stats == null) {
    const statsMap = await dsConn.getColumnStatsMap(baseQuery);
    const s = statsMap[colId];
    if (s == null || s.statsType !== "numeric") {
      return null;
    }
    stats = s;
  }

  const histoInfo = columnHistogramQuery(baseQuery, colId, colType, stats);
  if (histoInfo == null) {
    return null;
  }
  const histoRes = await dsConn.evalQuery(histoInfo.histoQuery);
  return getNumericColumnHistogramData(colId, histoInfo, histoRes);
}

// a single categorical value with its frequency
export type CategoricalBin = {
  value: Exclude<Scalar, bigint>;
  count: number;
};

// categorical distribution data for rendering a bar chart (non-numeric columns)
export interface CategoricalDistributionData {
  colId: string;
  binData: CategoricalBin[]; // sorted by count descending
  nullCount: number;
  totalCount: number;
}

/**
 * Build the QueryExp that computes per-value frequencies for a single column.
 * Produces SQL of the form:
 *   SELECT "__col", "colId", count("__freq") as "__freq"
 *   FROM ( ... ) GROUP BY "__col", "colId"
 */
export function columnFrequencyQuery(
  baseQuery: QueryExp,
  colId: string
): QueryExp {
  return baseQuery
    .extend("__col", constVal(colId))
    .extend("__freq", constVal(1))
    .groupBy(["__col", colId], [["count", "__freq"]]);
}

/**
 * Evaluate the frequency query for a single column and map the result to
 * CategoricalDistributionData. Null values are counted separately.
 */
export async function getColumnFrequencyData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  colId: string
): Promise<CategoricalDistributionData> {
  const freqQuery = columnFrequencyQuery(baseQuery, colId);
  const res = await dsConn.evalQuery(freqQuery);

  const binData: CategoricalBin[] = [];
  let nullCount = 0;
  let totalCount = 0;

  for (const row of res.rowData) {
    const value = row[colId];
    const count = Number(row.__freq);
    totalCount += count;
    if (value == null || typeof value === "bigint") {
      nullCount += count;
    } else {
      binData.push({ value, count });
    }
  }

  binData.sort((l, r) => r.count - l.count);

  return { colId, binData, nullCount, totalCount };
}

/**
 * Get the monster query for creating the full column histogram map for all
 * query columns.
 * Exposed primarily for testing; most reltab users should call `getColumnHistogramMap`,
 * which runs the query and provides a useful map of all histogram data.
 * returns: array of NumericColumnHistogramQuery, and combined QueryExp
 */

export function getColumnHistogramMapQuery(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema,
  columnStatsMap: ColumnStatsMap
): [NumericColumnHistogramQuery[], QueryExp | null] {
  const histoMap: ColumnHistogramMap = {};
  const histoCols: string[] = [];

  let histoQuery: QueryExp | null = null;
  let histoInfos: NumericColumnHistogramQuery[] = [];
  for (const colId of baseSchema.columns) {
    const colType = baseSchema.columnType(colId);
    if (colIsNumeric(colType)) {
      const colStats = columnStatsMap[colId];
      if (colStats != null) {
        const histoInfo = columnHistogramQuery(
          baseQuery,
          colId,
          colType,
          colStats as NumericSummaryStats
        );
        if (histoInfo) {
          if (histoQuery == null) {
            histoQuery = histoInfo!.histoQuery;
          } else {
            histoQuery = histoQuery.concat(histoInfo!.histoQuery);
          }
          histoInfos.push(histoInfo);
        }
      }
    }
  }
  return [histoInfos, histoQuery];
}

export async function getColumnHistogramMap(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  baseSchema: Schema,
  columnStatsMap: ColumnStatsMap
): Promise<ColumnHistogramMap> {
  const histoMap: ColumnHistogramMap = {};

  const [histoInfos, histoQuery] = getColumnHistogramMapQuery(
    dsConn,
    baseQuery,
    baseSchema,
    columnStatsMap
  );
  if (histoQuery) {
    const histoRes = await dsConn.evalQuery(histoQuery!);
    for (const histoInfo of histoInfos) {
      const histoData = getNumericColumnHistogramData(
        histoInfo.colId,
        histoInfo,
        histoRes
      );
      histoMap[histoInfo.colId] = histoData;
    }
  }
  return histoMap;
}
