/**
 *
 * Confusion matrix (2D co-occurrence) helpers using reltab.
 *
 * Given a row variable and a column variable, builds a matrix describing how
 * the source rows distribute across the pair of classes (one cell per
 * (row-bin, col-bin) pair, counting one per source row). Numeric variables are
 * binned using the same "nice range" + integer bin-index approach as the
 * histogram view; categorical variables use their distinct values as classes.
 *
 * The returned cells carry the raw count plus (optionally) a conditional
 * frequency: rows-normalized P(col | row), or columns-normalized P(row | col),
 * computed over the cells that survive the minimum-occurrence threshold.
 */

import { ColumnType, isTemporal } from "./ColumnType";
import { DataSourceConnection } from "./DataSource";
import { QueryExp } from "./QueryExp";
import { NumericSummaryStats } from "./ColumnStats";
import { Schema } from "./Schema";
import { TableRep } from "./TableRep";
import { splomColKind } from "./splom";
import { nice, thresholdSturges } from "./d3utils";
import { constVal, cast, minus, col, divide, floor, epoch, ValExp } from "./defs";
import { DuckDBDialect } from "./dialectRegistry";
import { binsForColumn, getColumnFrequencyData, getTemporalColumnNumericStats } from "./histogram";

const doubleType = DuckDBDialect.columnTypes["DOUBLE"];
const intType = DuckDBDialect.columnTypes["INTEGER"];

// Classification of a confusion-matrix axis: numeric (continuous), temporal
// (converted to epoch seconds), or categorical (discrete classes).
export type CmAxisKind = "numeric" | "temporal" | "categorical";

// A single class on one axis: a numeric bin or a categorical value. Numeric /
// temporal bins carry their low/high edges so consumers can build range
// filters; categorical bins leave them undefined (the `value` is the class).
export interface CmBin {
  label: string;
  value: number | string;
  low?: number;
  high?: number;
}

// A (rowBin, colBin) cell with its raw co-occurrence count and, when a
// conditional mode is active, the normalized frequency (0..1). freq is null in
// count mode or when no kept rows contributed.
export interface CmMatrixCell {
  rowBin: number; // index into rowBins
  colBin: number; // index into colBins
  count: number; // raw co-occurrence count
  freq: number | null; // conditional frequency (0..1) or null when blanked
}

export type CmMode = "count" | "rows" | "cols";

export interface ConfusionMatrixData {
  rowColId: string;
  colColId: string;
  rowKind: CmAxisKind;
  colKind: CmAxisKind;
  rowBins: CmBin[];
  colBins: CmBin[];
  cells: CmMatrixCell[];
  mode: CmMode;
  totalRows: number; // number of source rows that mapped to a cell
  minOccurrence: number;
}

export interface ConfusionMatrixOptions {
  rowBinCount?: number;
  colBinCount?: number;
  minOccurrence?: number;
  mode?: CmMode;
  sampleLimit?: number; // 0/undefined => all rows
  useAllRows?: boolean;
}

// Raw axis descriptor before the per-row binning/grouping is applied.
interface CmAxisSpec {
  colId: string;
  kind: CmAxisKind;
  groupCol: string; // derived column name used for grouping
  valueExp: ValExp; // expression yielding the (epoch-converted) group value
  isCategorical: boolean;
  bins: CmBin[];
  binCount: number;
  niceMinVal: number;
  binWidth: number;
  slotByCat: Map<number | string | boolean, number>;
}

const rowGroupName = "__cm_row";
const colGroupName = "__cm_col";
const freqName = "__cm_freq";
const ROW_COL_SEP = "\u001f";

const fmtNum = (n: number): string =>
  n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Build the numeric bin spec for a column (its "nice" min/max/binWidth plus a
 * per-row floor((v - niceMin) / binWidth) expression), mirroring the histogram
 * view's binning so both views agree. Returns null when the column has no
 * usable numeric range.
 */
const numericAxisSpec = async (
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  colId: string,
  requestedBinCount?: number
): Promise<CmAxisSpec | null> => {
  const colType: ColumnType = schema.columnType(colId);
  const temporal = isTemporal(colType);

  let stats: NumericSummaryStats | null;
  if (temporal) {
    stats = await getTemporalColumnNumericStats(dsConn, baseQuery, colId);
  } else {
    const statsMap = await dsConn.getColumnStatsMap(baseQuery);
    const s = statsMap[colId];
    stats = s != null && s.statsType === "numeric" ? s : null;
  }
  if (
    stats == null ||
    stats.min == null ||
    stats.max == null ||
    stats.min === stats.max
  ) {
    return null;
  }

  const binCount =
    requestedBinCount != null && requestedBinCount > 0
      ? requestedBinCount
      : binsForColumn(stats);
  const [niceMinVal, niceMaxVal] = nice(stats.min, stats.max, binCount);
  const binWidth = (niceMaxVal - niceMinVal) / binCount;

  const valueExp: ValExp = temporal ? epoch(col(colId)) : col(colId);

  // floor((cast(value, DOUBLE) - niceMin) / binWidth) as INTEGER
  const binExp = cast(
    floor(
      divide(
        minus(cast(valueExp, doubleType), cast(constVal(niceMinVal), doubleType)),
        cast(constVal(binWidth), doubleType)
      )
    ),
    intType
  );

  const bins: CmBin[] = [];
  for (let i = 0; i < binCount; i++) {
    const lo = niceMinVal + i * binWidth;
    const hi = niceMinVal + (i + 1) * binWidth;
    bins.push({ label: `${fmtNum(lo)} – ${fmtNum(hi)}`, value: lo, low: lo, high: hi });
  }

  return {
    colId,
    kind: temporal ? "temporal" : "numeric",
    groupCol: `${colGroupName}`,
    valueExp: binExp,
    isCategorical: false,
    bins,
    binCount,
    niceMinVal,
    binWidth,
    slotByCat: new Map(),
  };
};

/**
 * Build the categorical axis spec for a column: its distinct values (ordered
 * by frequency descending) become the classes, with a value -> slot map.
 */
const categoricalAxisSpec = async (
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  colId: string
): Promise<CmAxisSpec> => {
  const freq = await getColumnFrequencyData(dsConn, baseQuery, colId);
  const bins: CmBin[] = [];
  const slotByCat = new Map<number | string | boolean, number>();
  let slot = 0;
  for (const b of freq.binData) {
    const value = b.value as number | string | boolean;
    slotByCat.set(value, slot);
    bins.push({ label: String(b.value), value: b.value as number | string });
    slot++;
  }
  return {
    colId,
    kind: "categorical",
    groupCol: colId,
    valueExp: col(colId),
    isCategorical: true,
    bins,
    binCount: bins.length,
    niceMinVal: 0,
    binWidth: 1,
    slotByCat,
  };
};

const cmAxisKind = (ct: ColumnType): CmAxisKind => splomColKind(ct);

// Resolve a group value to its final axis index, clamping numeric bins into
// range (so the top nice boundary lands in the last bin).
const axisIndex = (axis: CmAxisSpec, groupVal: unknown): number | null => {
  if (groupVal == null) {
    return null;
  }
  if (axis.isCategorical) {
    const idx = axis.slotByCat.get(groupVal as number | string | boolean);
    return idx == null ? null : idx;
  }
  const raw = Number(groupVal);
  if (!Number.isFinite(raw)) {
    return null;
  }
  return Math.min(Math.max(raw, 0), axis.binCount - 1);
};

/**
 * Compute the confusion-matrix data for a row × column pair.
 *
 * Builds a single query that projects a derived integer group per axis
 * (numeric/temporal: the bin index; categorical: the class value) and then
 * groupBy + count over the two groups. The result rows are mapped back to bin
 * indices and assembled into cells, with conditional frequencies and the
 * minimum-occurrence threshold applied.
 */
export async function getConfusionMatrixData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  rowColId: string,
  colColId: string,
  opts: ConfusionMatrixOptions
): Promise<ConfusionMatrixData> {
  const {
    rowBinCount,
    colBinCount,
    minOccurrence = 0,
    mode = "count",
    useAllRows = true,
    sampleLimit,
  } = opts;

  const rowKind = cmAxisKind(schema.columnType(rowColId));
  const colKind = cmAxisKind(schema.columnType(colColId));

  const empty = (): ConfusionMatrixData => ({
    rowColId,
    colColId,
    rowKind,
    colKind,
    rowBins: [],
    colBins: [],
    cells: [],
    mode,
    totalRows: 0,
    minOccurrence,
  });

  let rowAxis: CmAxisSpec | null;
  let colAxis: CmAxisSpec | null;
  // Cache axis specs per column id so an A-vs-A (same column twice) pair reuses
  // one categorical ordering - otherwise tied category frequencies could give
  // the row and column axes different permutations of the same classes.
  const axisCache = new Map<string, CmAxisSpec | null>();
  const axisFor = async (
    colId: string,
    kind: CmAxisKind,
    binCount?: number
  ): Promise<CmAxisSpec | null> => {
    if (axisCache.has(colId)) {
      return axisCache.get(colId) ?? null;
    }
    const spec =
      kind === "categorical"
        ? await categoricalAxisSpec(dsConn, baseQuery, colId)
        : await numericAxisSpec(dsConn, baseQuery, schema, colId, binCount);
    axisCache.set(colId, spec);
    return spec;
  };
  rowAxis = await axisFor(rowColId, rowKind, rowBinCount);
  colAxis = await axisFor(colColId, colKind, colBinCount);
  if (rowAxis == null || colAxis == null) {
    return empty();
  }

  // Distinct group column names so an A-vs-A (same column twice) query still
  // groups over two independent derived columns.
  const rowGroup = rowGroupName;
  const colGroup = colGroupName;

  let query = baseQuery;
  query = query.extend(rowGroup, rowAxis.valueExp);
  query = query.extend(colGroup, colAxis.valueExp);
  query = query
    .extend(freqName, constVal(1))
    .project([rowGroup, colGroup, freqName])
    .groupBy([rowGroup, colGroup], [["count", freqName]]);

  const useLimit =
    !useAllRows && sampleLimit != null && sampleLimit > 0 ? sampleLimit : 0;
  const res: TableRep = await dsConn.evalQuery(query, 0, useLimit || undefined);

  // Accumulate counts per (clamped) bin pair.
  const cellMap = new Map<string, number>();
  let totalRows = 0;
  for (const r of res.rowData) {
    const ri = axisIndex(rowAxis, r[rowGroup]);
    const ci = axisIndex(colAxis, r[colGroup]);
    if (ri == null || ci == null) {
      continue;
    }
    const count = Number(r[freqName]) || 0;
    const key = `${ri}${ROW_COL_SEP}${ci}`;
    cellMap.set(key, (cellMap.get(key) ?? 0) + count);
    totalRows += count;
  }

  const rawCells: CmMatrixCell[] = [];
  for (const [key, count] of cellMap) {
    const sep = key.indexOf(ROW_COL_SEP);
    rawCells.push({
      rowBin: Number(key.slice(0, sep)),
      colBin: Number(key.slice(sep + 1)),
      count,
      freq: null,
    });
  }

  // Threshold blanking: drop cells below minOccurrence from both display and
  // normalization.
  const kept = rawCells.filter((c) => c.count >= minOccurrence);

  const rowTotals = new Map<number, number>();
  const colTotals = new Map<number, number>();
  for (const c of kept) {
    rowTotals.set(c.rowBin, (rowTotals.get(c.rowBin) ?? 0) + c.count);
    colTotals.set(c.colBin, (colTotals.get(c.colBin) ?? 0) + c.count);
  }

  const cells = kept.map((c) => {
    let freq: number | null = null;
    if (mode === "rows") {
      const rt = rowTotals.get(c.rowBin);
      freq = rt != null && rt > 0 ? c.count / rt : null;
    } else if (mode === "cols") {
      const ct = colTotals.get(c.colBin);
      freq = ct != null && ct > 0 ? c.count / ct : null;
    }
    return { ...c, freq };
  });

  return {
    rowColId,
    colColId,
    rowKind,
    colKind,
    rowBins: rowAxis.bins,
    colBins: colAxis.bins,
    cells,
    mode,
    totalRows,
    minOccurrence,
  };
}
