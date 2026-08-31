import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { Schema } from "../src/Schema";
import { tableQuery } from "../src/QueryExp";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import {
  getScatterPlotData,
  splomColKind,
  splomScatterQuery,
} from "../src/splom";

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
  }
);

type RunSqlQuery = jest.Mock;

const makeDriver = (runSqlQuery: RunSqlQuery): DbDriver => ({
  sourceId,
  dialect: DuckDBDialect,
  runSqlQuery,
  getTableSchema: jest.fn().mockResolvedValue(tableSchema),
  getSqlQuerySchema: jest.fn().mockResolvedValue(tableSchema),
  getSqlQueryColumnStatsMap: jest.fn().mockResolvedValue({}),
  getRootNode: jest.fn(),
  getChildren: jest.fn(),
  getTableName: jest.fn(),
  getDisplayName: jest.fn(),
});

describe("splomColKind", () => {
  test("classifies numeric, temporal, and categorical columns", () => {
    expect(splomColKind(tableSchema.columnType("a"))).toBe("numeric");
    expect(splomColKind(tableSchema.columnType("b"))).toBe("numeric");
    expect(splomColKind(tableSchema.columnType("d"))).toBe("temporal");
    expect(splomColKind(tableSchema.columnType("c"))).toBe("categorical");
  });
});

describe("splomScatterQuery", () => {
  test("projects numeric and categorical columns as-is", () => {
    const { query, derivedNames } = splomScatterQuery(
      tableQuery("t"),
      tableSchema,
      ["a", "c"]
    );
    const rep = (query as any)._rep;
    expect(rep.operator).toBe("project");
    expect(rep.cols).toEqual(["a", "c"]);
    expect(derivedNames).toEqual({});
    const sql = query.toSql(DuckDBDialect, {
      [JSON.stringify({ operator: "table", tableName: "t" })]: tableSchema,
    });
    expect(sql).toContain('"a"');
    expect(sql).toContain('"c"');
  });

  test("converts temporal columns to epoch via a derived column", () => {
    const { query, derivedNames } = splomScatterQuery(
      tableQuery("t"),
      tableSchema,
      ["d", "b"]
    );
    expect(derivedNames).toEqual({ d: "__splom_d" });
    const rep = (query as any)._rep;
    expect(rep.operator).toBe("project");
    expect(rep.cols).toEqual(["__splom_d", "b"]);
    const sql = query.toSql(DuckDBDialect, {
      [JSON.stringify({ operator: "table", tableName: "t" })]: tableSchema,
    });
    expect(sql).toContain('__splom_d');
    expect(sql).toContain("date_part('epoch'");
  });

  test("includes the color column when requested", () => {
    const { query } = splomScatterQuery(
      tableQuery("t"),
      tableSchema,
      ["a"],
      "c"
    );
    const rep = (query as any)._rep;
    expect(rep.cols).toEqual(["a", "c"]);
  });
});

describe("getScatterPlotData", () => {
  test("maps rows to points, preserving nulls and converting BigInt", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      { a: 1.5, b: 3, c: "red" },
      { a: null, b: 4, c: "blue" },
      { a: 2.5, b: BigInt(3000000000), c: "red" },
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getScatterPlotData(ds, tableQuery("t"), tableSchema, {
      matrixColIds: ["a", "b"],
      colorColId: "c",
    });

    expect(data.colIds).toEqual(["a", "b"]);
    expect(data.colKinds).toEqual(["numeric", "numeric"]);
    expect(data.sampled).toBe(false);
    expect(data.points).toEqual([
      { a: 1.5, b: 3, c: "red" },
      { a: null, b: 4, c: "blue" },
      { a: 2.5, b: 3000000000, c: "red" },
    ]);
  });

  test("fetches the total row count", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    const countSql = jest
      .fn()
      .mockResolvedValue([{ rowCount: 42 }]);
    // rowCount runs a COUNT query through runSqlQuery; provide schema for it
    runSqlQuery.mockReturnValueOnce(countSql());

    const data = await getScatterPlotData(ds, tableQuery("t"), tableSchema, {
      matrixColIds: ["a"],
    });
    expect(data.totalRows).toBe(42);
  });

  test("uses a random LIMIT sample when the source exceeds sampleLimit", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([{ rowCount: BigInt(100) }])
      .mockResolvedValueOnce([
        { a: 1.0, b: 2.0 },
        { a: 3.0, b: 4.0 },
      ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getScatterPlotData(ds, tableQuery("t"), tableSchema, {
      matrixColIds: ["a", "b"],
      sampleLimit: 10,
    });

    expect(data.sampled).toBe(true);
    expect(data.points).toEqual([
      { a: 1.0, b: 2.0 },
      { a: 3.0, b: 4.0 },
    ]);
    // two runSqlQuery calls: the COUNT (rowCount) then the sampled scatter query
    const sampledSql = runSqlQuery.mock.calls[1][0] as string;
    expect(sampledSql).toContain("ORDER BY random()");
    expect(sampledSql).toContain("LIMIT 10");
  });

  test("does not sample when the source fits within sampleLimit", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([{ rowCount: 5 }])
      .mockResolvedValueOnce([{ a: 1.0, b: 2.0 }]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getScatterPlotData(ds, tableQuery("t"), tableSchema, {
      matrixColIds: ["a", "b"],
      sampleLimit: 500,
    });

    expect(data.sampled).toBe(false);
    const scatterSql = runSqlQuery.mock.calls[1][0] as string;
    expect(scatterSql).not.toContain("ORDER BY random()");
    expect(scatterSql).not.toContain("LIMIT");
  });

  test("falls back to a plain LIMIT when randomSample is false", async () => {
    const runSqlQuery = jest.fn();
    runSqlQuery
      .mockResolvedValueOnce([{ rowCount: 100 }])
      .mockResolvedValueOnce([{ a: 1.0, b: 2.0 }]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getScatterPlotData(ds, tableQuery("t"), tableSchema, {
      matrixColIds: ["a", "b"],
      sampleLimit: 10,
      randomSample: false,
    });

    expect(data.sampled).toBe(true);
    const scatterSql = runSqlQuery.mock.calls[1][0] as string;
    expect(scatterSql).toContain("LIMIT");
    expect(scatterSql).not.toContain("ORDER BY random()");
  });
});