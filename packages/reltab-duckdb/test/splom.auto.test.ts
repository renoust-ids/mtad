import * as reltab from "reltab";
import {
  DataSourceConnection,
  DbDataSource,
  getCorrelationMatrix,
  getPairRegression,
  getScatterPlotData,
  splomScatterQuery,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as util from "./testUtils";

let testCtx: DbDataSource;

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx as DbDataSource;

  const dbds = ctx as DbDataSource;
  const duckDbDriver = dbds.db as reltabDuckDB.DuckDBDriver;

  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/barttest.csv"
  );
  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/splom_lin.csv"
  );
  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/splom_const.csv"
  );

  return testCtx;
});

const q1 = reltab.tableQuery("barttest");

test("splom scatter query runs against DuckDB and converts to epoch", async () => {
  const schema = await testCtx.getSchema(q1);
  expect(schema.columns).toContain("Base");
  expect(schema.columns).toContain("TCOE");
  const { query } = splomScatterQuery(q1, schema, ["Base", "TCOE"]);
  const res = await testCtx.evalQuery(query);
  expect(res.rowData.length).toBeGreaterThan(0);
  for (const row of res.rowData) {
    // DuckDB returns integers as bigint; the Number conversion happens in
    // getScatterPlotData.
    expect(typeof row.Base === "number" || typeof row.Base === "bigint").toBe(true);
    expect(typeof row.TCOE === "number" || typeof row.TCOE === "bigint").toBe(true);
  }
});

test("getScatterPlotData samples with ORDER BY random() LIMIT", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getScatterPlotData(testCtx, q1, schema, {
    matrixColIds: ["Base", "TCOE"],
    sampleLimit: 5,
  });
  expect(data.colIds).toEqual(["Base", "TCOE"]);
  expect(data.totalRows).toBeGreaterThan(5);
  expect(data.sampled).toBe(true);
  expect(data.points.length).toBeLessThanOrEqual(5);
  for (const pt of data.points) {
    expect(typeof pt.Base).toBe("number");
    expect(typeof pt.TCOE).toBe("number");
  }
});

test("getScatterPlotData without sample returns all rows", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getScatterPlotData(testCtx, q1, schema, {
    matrixColIds: ["Base", "TCOE"],
  });
  expect(data.sampled).toBe(false);
  expect(data.points.length).toBe(data.totalRows);
});

test("getCorrelationMatrix runs the WITH materialized query on DuckDB", async () => {
  const schema = await testCtx.getSchema(q1);
  const corr = await getCorrelationMatrix(testCtx, q1, schema, [
    "Base",
    "TCOE",
  ]);
  expect(corr).toHaveLength(1);
  const c = corr[0];
  expect(c.xColId).toBe("Base");
  expect(c.yColId).toBe("TCOE");
  expect(c.n).toBeGreaterThan(0);
  expect(c.r).not.toBeNull();
  expect(Math.abs(c.r as number)).toBeLessThanOrEqual(1);
});

test("regr_slope(y, x) regresses y over x on DuckDB", async () => {
  const lin = reltab.tableQuery("splom_lin");
  const schema = await testCtx.getSchema(lin);
  const reg = await getPairRegression(testCtx, lin, schema, "x", "y");
  expect(reg.n).toBe(4);
  expect(reg.slope).toBeCloseTo(2, 5);
  expect(reg.intercept).toBeCloseTo(0, 4);
  expect(reg.r).toBeCloseTo(1, 5);
  expect(reg.r2).toBeCloseTo(1, 5);
});

test("constant column yields null correlation but non-zero n", async () => {
  const cq = reltab.tableQuery("splom_const");
  const schema = await testCtx.getSchema(cq);
  const corr = await getCorrelationMatrix(testCtx, cq, schema, ["x", "y"]);
  expect(corr).toHaveLength(1);
  expect(corr[0].r).toBeNull();
  expect(corr[0].n).toBe(3);
  const reg = await getPairRegression(testCtx, cq, schema, "x", "y");
  // DuckDB maps constant data to NaN for corr() (→ null) and falls back to
  // slope 0 / mean intercept for regr_*.
  expect(reg.r).toBeNull();
  expect(reg.slope).toBe(0);
  expect(reg.intercept).toBe(5);
  expect(reg.n).toBe(3);
});

test("eta is computed for a categorical × numeric pair and lies in [0,1]", async () => {
  const schema = await testCtx.getSchema(q1);
  const corr = await getCorrelationMatrix(testCtx, q1, schema, [
    "Job Family",
    "Base",
  ]);
  expect(corr).toHaveLength(1);
  const c = corr[0];
  expect(c.measure).toBe("eta");
  expect(c.xColId).toBe("Job Family");
  expect(c.yColId).toBe("Base");
  expect(c.n).toBeGreaterThan(0);
  expect(c.strength).not.toBeNull();
  expect(c.strength as number).toBeGreaterThanOrEqual(0);
  expect(c.strength as number).toBeLessThanOrEqual(1);
});

test("Cramér's V is computed for a categorical × categorical pair", async () => {
  const schema = await testCtx.getSchema(q1);
  const corr = await getCorrelationMatrix(testCtx, q1, schema, [
    "Job Family",
    "Union",
  ]);
  expect(corr).toHaveLength(1);
  const c = corr[0];
  expect(c.measure).toBe("V");
  expect(c.xColId).toBe("Job Family");
  expect(c.yColId).toBe("Union");
  expect(c.n).toBeGreaterThan(0);
  expect(c.strength).not.toBeNull();
  expect(c.strength as number).toBeGreaterThanOrEqual(0);
  expect(c.strength as number).toBeLessThanOrEqual(1);
});