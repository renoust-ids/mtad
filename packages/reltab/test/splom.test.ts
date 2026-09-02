import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { Schema } from "../src/Schema";
import { tableQuery } from "../src/QueryExp";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import {
  getCorrelationMatrix,
  getPairRegression,
  getScatterPlotData,
  pairwiseCorrelationSql,
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

const makeDriver = (
  runSqlQuery: RunSqlQuery,
  schema: Schema = tableSchema
): DbDriver => ({
  sourceId,
  dialect: DuckDBDialect,
  runSqlQuery,
  getTableSchema: jest.fn().mockResolvedValue(schema),
  getSqlQuerySchema: jest.fn().mockResolvedValue(schema),
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

describe("pairwiseCorrelationSql", () => {
  test("builds a single-scan WITH + UNION ALL correlation query", () => {
    const sql = pairwiseCorrelationSql("SELECT \"a\", \"b\"\nFROM t", [
      ["a", "b"],
      ["a", "c"],
    ]);
    expect(sql).toContain("WITH __splom_src AS MATERIALIZED");
    expect(sql).toContain("SELECT \"a\", \"b\"\nFROM t");
    expect(sql).toContain("corr(\"a\", \"b\") AS __r");
    expect(sql).toContain("regr_count(\"a\", \"b\") AS __n");
    expect(sql).toContain("'a' AS __x, 'b' AS __y");
    expect(sql).toContain("UNION ALL");
    expect(sql).toContain("corr(\"a\", \"c\")");
  });

  test("escapes quotes in identifiers and literals", () => {
    const sql = pairwiseCorrelationSql("SELECT 1", [["a\"b", "c'd"]]);
    expect(sql).toContain('corr("a""b", "c\'d")');
    expect(sql).toContain("'a\"\"b' AS __x");
    expect(sql).toContain("'c''d' AS __y");
  });

  test("returns an empty result query when there are no pairs", () => {
    const sql = pairwiseCorrelationSql("SELECT 1", []);
    expect(sql).toContain("WITH __splom_src AS MATERIALIZED");
    expect(sql).toContain("WHERE 1 = 0");
  });
});

describe("getCorrelationMatrix", () => {
  // runSqlQuery mock that returns rows keyed by the SQL body: one set for the
  // Pearson (corr) query, one for the eta query, one for the Cramér's V query.
  const mkIface = (
    pearson: unknown[],
    eta: unknown[] | null = null,
    cramer: unknown[] | null = null
  ) => {
    const runSqlQuery = jest.fn().mockImplementation((query: string) => {
      if (eta != null && /sbtw/.test(query)) return Promise.resolve(eta);
      if (cramer != null && /least\(nr - 1, nc - 1\)/.test(query))
        return Promise.resolve(cramer);
      return Promise.resolve(pearson);
    });
    const ds = new DbDataSource(makeDriver(runSqlQuery));
    return { ds, runSqlQuery };
  };

  test("computes Pearson correlations for numeric pairs and skips categorical in that query", async () => {
    const { ds, runSqlQuery } = mkIface([
      { __x: "a", __y: "b", __r: 0.5, __n: BigInt(10) },
    ]);

    const corr = await getCorrelationMatrix(
      ds,
      tableQuery("t"),
      tableSchema,
      ["a", "b", "c"]
    );

    expect(corr).toContainEqual({
      xColId: "a",
      yColId: "b",
      measure: "r",
      r: 0.5,
      strength: 0.5,
      n: 10,
    });
    const pearsonSql = runSqlQuery.mock.calls
      .map((c) => c[0] as string)
      .find((s) => s.includes("corr("));
    expect(pearsonSql).toContain("WITH __splom_src AS MATERIALIZED");
    expect(pearsonSql).toContain('corr("a", "b")');
    expect(pearsonSql).not.toContain('corr("c"');
    // the categorical (a, c) pair is handled by the eta query, not corr()
  });

  test("correlates temporal columns in epoch space and maps back names", async () => {
    const { ds, runSqlQuery } = mkIface([
      { __x: "a", __y: "__splom_d", __r: 0.7, __n: BigInt(8) },
    ]);

    const corr = await getCorrelationMatrix(
      ds,
      tableQuery("t"),
      tableSchema,
      ["a", "d"]
    );

    expect(corr).toEqual([
      {
        xColId: "a",
        yColId: "d",
        measure: "r",
        r: 0.7,
        strength: 0.7,
        n: 8,
      },
    ]);
    const pearsonSql = runSqlQuery.mock.calls
      .map((c) => c[0] as string)
      .find((s) => s.includes("corr("));
    expect(pearsonSql).toContain('corr("a", "__splom_d")');
  });

  test("reports eta for a categorical × numeric pair", async () => {
    const { ds, runSqlQuery } = mkIface(
      [],
      [{ __x: "c", __y: "a", __r: 0.63, __n: BigInt(12) }]
    );

    const corr = await getCorrelationMatrix(
      ds,
      tableQuery("t"),
      tableSchema,
      ["a", "c"]
    );

    expect(corr).toEqual([
      {
        xColId: "c",
        yColId: "a",
        measure: "eta",
        r: 0.63,
        strength: 0.63,
        n: 12,
      },
    ]);
    const etaSql = runSqlQuery.mock.calls
      .map((c) => c[0] as string)
      .find((s) => /sbtw/.test(s));
    expect(etaSql).toMatch(/sum\(nk \* pow\(nm - grand, 2\)\)/);
    expect(etaSql).toContain("sqrt(sbtw / NULLIF(stot, 0))");
  });

  test("reports Cramér's V for a categorical × categorical pair", async () => {
    const catSchema = new Schema(
      DuckDBDialect,
      ["hue", "size_"],
      {
        hue: { columnType: "VARCHAR", displayName: "hue" },
        size_: { columnType: "VARCHAR", displayName: "size_" },
      }
    );
    const runSql = jest.fn().mockResolvedValue([
      { __x: "hue", __y: "size_", __r: 0.4, __n: BigInt(20) },
    ]);
    const ds = new DbDataSource(
      makeDriver(
        runSql,
        catSchema
      )
    );

    const corr = await getCorrelationMatrix(
      ds,
      tableQuery("t"),
      catSchema,
      ["hue", "size_"]
    );

    expect(corr).toEqual([
      {
        xColId: "hue",
        yColId: "size_",
        measure: "V",
        r: 0.4,
        strength: 0.4,
        n: 20,
      },
    ]);
    const vSql = runSql.mock.calls
      .map((c) => c[0] as string)
      .find((s) => /least\(nr - 1, nc - 1\)/.test(s));
    expect(vSql).toMatch(/least\(nr - 1, nc - 1\)/);
    expect(vSql).toContain("__cells");
  });

  test("keeps r null when corr() returns null", async () => {
    const { ds } = mkIface([{ __x: "a", __y: "b", __r: null, __n: BigInt(1) }]);

    const corr = await getCorrelationMatrix(
      ds,
      tableQuery("t"),
      tableSchema,
      ["a", "b"]
    );

    expect(corr).toEqual([
      { xColId: "a", yColId: "b", measure: "r", r: null, strength: null, n: 1 },
    ]);
  });
});

describe("getPairRegression", () => {
  test("regresses y over x and maps the result", async () => {
    const runSqlQuery = jest.fn().mockResolvedValue([
      {
        __r: 0.6,
        __slope: 1.5,
        __intercept: -2,
        __r2: 0.36,
        __n: BigInt(20),
      },
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const reg = await getPairRegression(
      ds,
      tableQuery("t"),
      tableSchema,
      "a",
      "b"
    );

    expect(reg).toEqual({
      xColId: "a",
      yColId: "b",
      r: 0.6,
      slope: 1.5,
      intercept: -2,
      r2: 0.36,
      n: 20,
    });
    const regrSql = runSqlQuery.mock.calls[0][0] as string;
    expect(regrSql).toContain('regr_slope("b", "a") AS __slope');
    expect(regrSql).toContain('regr_intercept("b", "a") AS __intercept');
    expect(regrSql).toContain('regr_r2("b", "a") AS __r2');
    expect(regrSql).toContain('"a" IS NOT NULL AND "b" IS NOT NULL');
    expect(regrSql).toContain("FROM ( ");
  });
});