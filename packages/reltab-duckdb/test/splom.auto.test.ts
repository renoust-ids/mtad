import * as reltab from "reltab";
import {
  DataSourceConnection,
  DbDataSource,
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