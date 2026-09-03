import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { Schema } from "../src/Schema";
import { tableQuery } from "../src/QueryExp";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import { ColumnStatsMap } from "../src/ColumnStats";
import {
  ConfusionMatrixData,
  getConfusionMatrixData,
} from "../src/confusionMatrix";

const sourceId: DataSourceId = {
  providerName: "duckdb",
  resourceId: ":memory:",
};

const tableSchema = new Schema(
  DuckDBDialect,
  ["a", "b", "d", "c"],
  {
    a: { columnType: "DOUBLE", displayName: "a" },
    b: { columnType: "INTEGER", displayName: "b" },
    d: { columnType: "TIMESTAMP", displayName: "d" },
    c: { columnType: "VARCHAR", displayName: "c" },
    g: { columnType: "VARCHAR", displayName: "g" },
  }
);

type RunSqlQuery = jest.Mock;

const makeDriver = (
  runSqlQuery: RunSqlQuery,
  schema: Schema = tableSchema,
  stats: ColumnStatsMap = {}
): DbDriver => ({
  sourceId,
  dialect: DuckDBDialect,
  runSqlQuery,
  getTableSchema: jest.fn().mockResolvedValue(schema),
  getSqlQuerySchema: jest.fn().mockResolvedValue(schema),
  getSqlQueryColumnStatsMap: jest.fn().mockResolvedValue(stats),
  getRootNode: jest.fn(),
  getChildren: jest.fn(),
  getTableName: jest.fn(),
  getDisplayName: jest.fn(),
});

const mainSqlOf = (runSqlQuery: RunSqlQuery): string => {
  const sql = runSqlQuery.mock.calls
    .map((c) => c[0] as string)
    .find((s) => s.includes('"__cm_row"') && s.includes('"__cm_col"'));
  return sql as string;
};

// Per-axis numeric summary stats used by the binning code.
const numericStats = (
  min: number,
  max: number,
  count = 100
): ColumnStatsMap => ({
  a: { statsType: "numeric", min, max, approxUnique: null, count, pctNull: 0 },
  b: { statsType: "numeric", min, max, approxUnique: null, count, pctNull: 0 },
});

describe("getConfusionMatrixData", () => {
  test("numeric × numeric: bins via floor((v - niceMin)/binWidth), groups and counts, clamps top edge", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { __cm_row: BigInt(0), __cm_col: BigInt(1), __cm_freq: BigInt(3) },
      // raw bin index 4 lies past the last nice bin and is clamped into bin 3
      { __cm_row: BigInt(4), __cm_col: BigInt(0), __cm_freq: BigInt(1) },
      // null bin values are excluded from the matrix
      { __cm_row: null, __cm_col: BigInt(2), __cm_freq: BigInt(5) },
    ]);
    const ds = new DbDataSource(
      makeDriver(runSqlQuery, tableSchema, numericStats(0, 100))
    );

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      "b",
      { rowBinCount: 4, colBinCount: 4 }
    );

    expect(data.rowKind).toBe("numeric");
    expect(data.colKind).toBe("numeric");
    // nice(0, 100, 4) => [0, 100], binWidth 25
    expect(data.rowBins).toHaveLength(4);
    expect(data.rowBins[0].label).toMatch(/^0/);
    expect(data.rowBins[3].value).toBe(75);
    expect(data.cells).toEqual([
      { rowBin: 0, colBin: 1, count: 3, freq: null },
      { rowBin: 3, colBin: 0, count: 1, freq: null },
    ]);
    expect(data.totalRows).toBe(4);
    expect(data.mode).toBe("count");
    expect(data.minOccurrence).toBe(0);

    const sql = mainSqlOf(runSqlQuery);
    // row/col group columns carry the floor((v - niceMin)/binWidth) expressions
    expect(sql).toContain('"__cm_row"');
    expect(sql).toContain('"__cm_col"');
    expect(sql).toContain('GROUP BY "__cm_row", "__cm_col"');
    expect(sql).toContain('floor(');
    expect(sql).toContain('CAST("a" AS DOUBLE)');
    expect(sql).toContain('CAST(25 AS DOUBLE)');
  });

  test("categorical × categorical: slot indices map distinct values; same column (A vs A) is allowed", async () => {
    const runSqlQuery = jest.fn();
    // With the same column for both axes, the categorical axis spec is cached,
    // so only one frequency query runs; then the main groupBy query.
    runSqlQuery
      .mockResolvedValueOnce([
        { __col: "c", c: "red", __freq: BigInt(2) },
        { __col: "c", c: "blue", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __cm_row: "red", __cm_col: "blue", __cm_freq: BigInt(2) },
        { __cm_row: "red", __cm_col: "red", __cm_freq: BigInt(1) },
      ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "c",
      "c",
      {}
    );

    expect(data.rowKind).toBe("categorical");
    expect(data.colKind).toBe("categorical");
    // red -> slot 0, blue -> slot 1
    expect(data.rowBins).toEqual([
      { label: "red", value: "red" },
      { label: "blue", value: "blue" },
    ]);
    expect(data.cells).toEqual([
      { rowBin: 0, colBin: 1, count: 2, freq: null },
      { rowBin: 0, colBin: 0, count: 1, freq: null },
    ]);
    expect(data.totalRows).toBe(3);

    const sql = mainSqlOf(runSqlQuery);
    // even for the same column twice, grouping uses two distinct group columns
    expect(sql).toContain('GROUP BY "__cm_row", "__cm_col"');
  });

  test("numeric × categorical: mixed bin indices and slot values", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([
        { __col: "c", c: "red", __freq: BigInt(3) },
        { __col: "c", c: "blue", __freq: BigInt(2) },
        { __col: "c", c: "green", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __cm_row: BigInt(0), __cm_col: "red", __cm_freq: BigInt(2) },
        { __cm_row: BigInt(1), __cm_col: "blue", __cm_freq: BigInt(1) },
        { __cm_row: BigInt(1), __cm_col: "green", __cm_freq: BigInt(1) },
      ]);
    const ds = new DbDataSource(
      makeDriver(runSqlQuery, tableSchema, numericStats(0, 100))
    );

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      "c",
      { rowBinCount: 2 }
    );

    expect(data.rowKind).toBe("numeric");
    expect(data.colKind).toBe("categorical");
    expect(data.rowBins).toHaveLength(2);
    expect(data.colBins.map((b) => b.value)).toEqual(["red", "blue", "green"]);
    expect(data.cells).toEqual([
      { rowBin: 0, colBin: 0, count: 2, freq: null },
      { rowBin: 1, colBin: 1, count: 1, freq: null },
      { rowBin: 1, colBin: 2, count: 1, freq: null },
    ]);
    expect(data.totalRows).toBe(4);
  });

  test("temporal columns are binned in epoch space", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { __cm_row: BigInt(0), __cm_col: BigInt(0), __cm_freq: BigInt(2) },
    ]);
    // temporal stats are keyed by the "__epoch" derived column
    const ds = new DbDataSource(
      makeDriver(runSqlQuery, tableSchema, {
        __epoch: {
          statsType: "numeric",
          min: 0,
          max: 100,
          approxUnique: null,
          count: 100,
          pctNull: 0,
        },
        a: {
          statsType: "numeric",
          min: 0,
          max: 100,
          approxUnique: null,
          count: 100,
          pctNull: 0,
        },
      })
    );

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "d",
      "a",
      { rowBinCount: 3 }
    );

    expect(data.rowKind).toBe("temporal");
    expect(data.colKind).toBe("numeric");
    expect(data.rowBins).toHaveLength(3);
    const sql = mainSqlOf(runSqlQuery);
    expect(sql).toContain("date_part('epoch',");
  });

  test("threshold blanking drops low cells and renormalizes rows", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([
        { __col: "c", c: "a", __freq: BigInt(1) },
        { __col: "c", c: "b", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __col: "g", g: "x", __freq: BigInt(1) },
        { __col: "g", g: "y", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __cm_row: "a", __cm_col: "x", __cm_freq: BigInt(4) },
        { __cm_row: "a", __cm_col: "y", __cm_freq: BigInt(1) },
        { __cm_row: "b", __cm_col: "x", __cm_freq: BigInt(1) },
        { __cm_row: "b", __cm_col: "y", __cm_freq: BigInt(4) },
      ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "c",
      "g",
      { minOccurrence: 2, mode: "rows" }
    );

    // below-threshold cells are dropped entirely, and the percentage is
    // computed over the retained cells only (row 'a' sums to 1 over its
    // single kept cell).
    expect(data.cells).toEqual([
      { rowBin: 0, colBin: 0, count: 4, freq: 1 },
      { rowBin: 1, colBin: 1, count: 4, freq: 1 },
    ]);
    expect(data.mode).toBe("rows");
    expect(data.minOccurrence).toBe(2);
  });

  test("column-normalized mode conditions on column totals", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([
        { __col: "c", c: "a", __freq: BigInt(1) },
        { __col: "c", c: "b", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __col: "g", g: "x", __freq: BigInt(1) },
        { __col: "g", g: "y", __freq: BigInt(1) },
      ])
      .mockResolvedValueOnce([
        { __cm_row: "a", __cm_col: "x", __cm_freq: BigInt(4) },
        { __cm_row: "a", __cm_col: "y", __cm_freq: BigInt(1) },
        { __cm_row: "b", __cm_col: "x", __cm_freq: BigInt(1) },
        { __cm_row: "b", __cm_col: "y", __cm_freq: BigInt(4) },
      ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "c",
      "g",
      { mode: "cols" }
    );

    // column x total = 5, column y total = 5
    expect(data.cells).toEqual([
      { rowBin: 0, colBin: 0, count: 4, freq: 4 / 5 },
      { rowBin: 0, colBin: 1, count: 1, freq: 1 / 5 },
      { rowBin: 1, colBin: 0, count: 1, freq: 1 / 5 },
      { rowBin: 1, colBin: 1, count: 4, freq: 4 / 5 },
    ]);
  });

  test("useAllRows=false with a sampleLimit constrains the eval", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { __cm_row: BigInt(0), __cm_col: BigInt(0), __cm_freq: BigInt(2) },
    ]);
    const ds = new DbDataSource(
      makeDriver(runSqlQuery, tableSchema, numericStats(0, 100))
    );
    // evalQuery is invoked with a limit; the DbDataSource applies it as a
    // positional argument to getSqlForQuery, so verify the returned data.
    const data = await getConfusionMatrixData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      "b",
      { rowBinCount: 2, useAllRows: false, sampleLimit: 50 }
    );
    expect(data.totalRows).toBe(2);
  });
});