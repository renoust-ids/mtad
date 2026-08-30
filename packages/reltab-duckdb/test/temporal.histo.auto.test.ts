import * as reltab from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import { DbDataSource } from "reltab";

let testCtx: DbDataSource;

const q1 = reltab.tableQuery("tcol");
const temporalCols = ["birth_date", "start_time", "created_at"];

beforeAll(async (): Promise<void> => {
  const ctx = (await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  })) as DbDataSource;

  testCtx = ctx;
  const duckDbDriver = ctx.db as reltabDuckDB.DuckDBDriver;

  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/tcol.csv"
  );
});

test("date/timestamp columns histogram over epoch-second bins", async () => {
  const schema = await testCtx.getSchema(q1);
  for (const colId of temporalCols) {
    const hd = await reltab.getColumnHistogramDataForBins(
      testCtx,
      q1,
      schema,
      colId
    );
    expect(hd).not.toBeNull();
    expect(hd!.binCount).toBeGreaterThanOrEqual(1);
    expect(hd!.binWidth).toBeGreaterThan(0);
    // STATS COVERS the expected epoch range for this column type:
    //   - date / timestamp: year 2024 (epoch seconds ~1.7e9)
    //   - time: seconds since local midnight (small, < 86400)
    const isTimeOnly = colId === "start_time";
    if (isTimeOnly) {
      expect(hd!.niceMinVal).toBeGreaterThanOrEqual(0);
      expect(hd!.niceMaxVal).toBeLessThanOrEqual(86400);
    } else {
      // nice() rounding can extend below Jan 1 2024; verify the epoch range
      // sits in the plausible 2020s decade rather than seconds-of-day.
      expect(hd!.niceMinVal).toBeGreaterThan(Date.UTC(2023, 0, 1) / 1000);
      expect(hd!.niceMaxVal).toBeLessThan(Date.UTC(2026, 0, 1) / 1000);
    }
    expect(hd!.brushMaxVal).toBeGreaterThan(hd!.brushMinVal);
  }
});

test("temporal columns get numeric stats from the converted column", async () => {
  const s = await reltab.getTemporalColumnNumericStats(testCtx, q1, "birth_date");
  expect(s).not.toBeNull();
  // epoch seconds for Jan-Apr 2024
  expect(s!.min).toBeGreaterThan(Date.UTC(2024, 0, 1) / 1000);
  expect(s!.max).toBeLessThan(Date.UTC(2024, 6, 1) / 1000);
});