import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { ColumnStatsMap } from "../src/ColumnStats";
import { Schema } from "../src/Schema";
import { tableQuery } from "../src/QueryExp";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import {
  columnFrequencyQuery,
  columnHistogramQuery,
  getColumnFrequencyData,
  getColumnHistogramDataForBins,
  getSingleColumnHistogramData,
} from "../src/histogram";

const sourceId: DataSourceId = {
  providerName: "duckdb",
  resourceId: ":memory:",
};

const tableSchema = new Schema(DuckDBDialect, ["a", "b"], {
  a: { columnType: "DOUBLE", displayName: "a" },
  b: { columnType: "VARCHAR", displayName: "b" },
});

const numericStats = {
  statsType: "numeric",
  min: 1,
  max: 5,
  approxUnique: 5,
  count: 10,
  pctNull: 0,
} as const;

const defaultStatsMap: ColumnStatsMap = { a: numericStats, b: null };

type RunSqlQuery = jest.Mock;

const makeDriver = (
  runSqlQuery: RunSqlQuery,
  statsMap: ColumnStatsMap = defaultStatsMap
): DbDriver => ({
  sourceId,
  dialect: DuckDBDialect,
  runSqlQuery,
  getTableSchema: jest.fn().mockResolvedValue(tableSchema),
  getSqlQuerySchema: jest.fn().mockResolvedValue(tableSchema),
  getSqlQueryColumnStatsMap: jest.fn().mockResolvedValue(statsMap),
  getRootNode: jest.fn(),
  getChildren: jest.fn(),
  getTableName: jest.fn(),
  getDisplayName: jest.fn(),
});

const getSql = (mock: RunSqlQuery): string => mock.mock.calls[0][0] as string;

describe("categorical frequency helpers", () => {
  test("columnFrequencyQuery builds a groupBy over the value column", () => {
    const q = columnFrequencyQuery(tableQuery("t"), "b");
    const rep = (q as any)._rep;
    expect(rep.operator).toBe("groupBy");
    expect(rep.cols).toEqual(["__col", "b"]);
    expect(rep.aggs).toEqual([["count", "__freq"]]);
    const sql = q.toSql(DuckDBDialect, {
      [JSON.stringify({ operator: "table", tableName: "t" })]: tableSchema,
    });
    expect(sql).toContain('count("__freq") as "__freq"');
    expect(sql).toContain('GROUP BY "__col", "b"');
  });

  test("getColumnFrequencyData maps rows, separates nulls, sorts by count", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { __col: "b", b: "red", __freq: 3 },
      { __col: "b", b: "blue", __freq: 5 },
      { __col: "b", b: null, __freq: 2 },
      { __col: "b", b: "green", __freq: 1 },
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getColumnFrequencyData(ds, tableQuery("t"), "b");

    expect(data.colId).toBe("b");
    expect(data.binData).toEqual([
      { value: "blue", count: 5 },
      { value: "red", count: 3 },
      { value: "green", count: 1 },
    ]);
    expect(data.nullCount).toBe(2);
    expect(data.totalCount).toBe(11);
    expect(getSql(runSqlQuery)).toContain('GROUP BY "__col", "b"');
  });
});

describe("getSingleColumnHistogramData", () => {
  test("fetches column stats when not provided and returns histogram data", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { column: "a", bin: 0, binCount: 3 },
      { column: "a", bin: 1, binCount: 4 },
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getSingleColumnHistogramData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a"
    );

    expect(data).not.toBeNull();
    expect(data!.colId).toBe("a");
    expect(data!.binData).toHaveLength(data!.binCount);
    expect(data!.binData[0]).toBe(3);
    expect(data!.binData[1]).toBe(4);
    expect(data!.brushMinVal).toBe(data!.niceMinVal);
    expect(data!.brushMaxVal).toBe(data!.niceMaxVal + data!.binWidth);
  });

  test("returns null for a non-numeric column", async () => {
    const runSqlQuery = jest.fn();
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    const data = await getSingleColumnHistogramData(
      ds,
      tableQuery("t"),
      tableSchema,
      "b"
    );
    expect(data).toBeNull();
  });

  test("returns null when stats are missing from the stats map", async () => {
    const runSqlQuery = jest.fn();
    const ds = new DbDataSource(
      makeDriver(runSqlQuery, { b: null })
    );
    const data = await getSingleColumnHistogramData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a"
    );
    expect(data).toBeNull();
  });

  test("returns null when min equals max", async () => {
    const runSqlQuery = jest.fn();
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    const flatStats = { ...numericStats, min: 4, max: 4 };
    const data = await getSingleColumnHistogramData(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      flatStats
    );
    expect(data).toBeNull();
  });
});

describe("explicit bin count", () => {
  test("columnHistogramQuery honors a requested bin count", () => {
    const intType = DuckDBDialect.columnTypes["INTEGER"];
    const info = columnHistogramQuery(
      tableQuery("t"),
      "a",
      intType,
      numericStats,
      10
    );
    expect(info).not.toBeNull();
    expect(info!.binCount).toBe(10);
    const binWidth = (info!.niceMaxVal - info!.niceMinVal) / 10;
    expect(info!.binWidth).toBeCloseTo(binWidth);
  });

  test("getColumnHistogramDataForBins runs the query with the requested bins", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { column: "a", bin: 0, binCount: 2 },
      { column: "a", bin: 1, binCount: 3 },
      { column: "a", bin: 2, binCount: 1 },
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getColumnHistogramDataForBins(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      3
    );

    expect(data).not.toBeNull();
    expect(data!.binCount).toBe(3);
    expect(data!.binData).toEqual([2, 3, 1]);
    expect(getSql(runSqlQuery)).toContain('GROUP BY "column", "bin"');
  });

  test("getColumnHistogramDataForBins returns null for non-numeric columns", async () => {
    const runSqlQuery = jest.fn();
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    const data = await getColumnHistogramDataForBins(
      ds,
      tableQuery("t"),
      tableSchema,
      "b",
      5
    );
    expect(data).toBeNull();
  });
});