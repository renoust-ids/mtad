import * as reltab from "reltab";
import { DataSourceConnection, DbDataSource } from "reltab";
import { getConfusionMatrixData } from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";

let testCtx: DbDataSource;

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx as DbDataSource;

  const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;

  await reltabDuckDB.nativeCSVImport(
    duckDbDriver.db,
    "test/support/confusion.csv"
  );

  return testCtx;
});

const q1 = reltab.tableQuery("confusion");

const countOf = (
  data: reltab.ConfusionMatrixData,
  rowVal: string | number,
  colVal: string | number
): number => {
  const cell = data.cells.find(
    (c) =>
      data.rowBins[c.rowBin].value === rowVal &&
      data.colBins[c.colBin].value === colVal
  );
  return cell == null ? 0 : cell.count;
};

test("categorical × categorical counts co-occurrences", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "alpha", "beta", {
    minOccurrence: 1,
  });
  expect(data.rowKind).toBe("categorical");
  expect(data.colKind).toBe("categorical");
  expect(data.totalRows).toBe(12);
  expect(countOf(data, "a", "x")).toBe(3);
  expect(countOf(data, "a", "y")).toBe(3);
  expect(countOf(data, "b", "x")).toBe(2);
  expect(countOf(data, "b", "y")).toBe(4);
  // every source row lands in exactly one cell
  expect(data.cells.reduce((acc, c) => acc + c.count, 0)).toBe(12);
});

test("numeric × categorical bins on the numeric axis", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "val", "beta", {
    rowBinCount: 3,
  });
  expect(data.rowKind).toBe("numeric");
  expect(data.colKind).toBe("categorical");
  expect(data.rowBins).toHaveLength(3);
  expect(data.totalRows).toBe(12);
  expect(data.cells.reduce((acc, c) => acc + c.count, 0)).toBe(12);
});

test("A-vs-A same column produces a diagonal co-occurrence matrix", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "alpha", "alpha", {});
  expect(data.rowKind).toBe("categorical");
  expect(data.colKind).toBe("categorical");
  // a maps to itself 6 times, b maps to itself 6 times
  expect(countOf(data, "a", "a")).toBe(6);
  expect(countOf(data, "b", "b")).toBe(6);
  expect(data.totalRows).toBe(12);
  // no off-diagonal cells exist
  expect(data.cells.every((c) => c.rowBin === c.colBin)).toBe(true);
});

test("threshold blanking excludes low cells and renormalizes rows", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "alpha", "beta", {
    minOccurrence: 3,
    mode: "rows",
  });
  // (b,x) has count 2 and is dropped from both display and normalization
  expect(countOf(data, "b", "x")).toBe(0);
  expect(data.cells.length).toBe(3);

  const cellA = data.cells.find(
    (c) => data.rowBins[c.rowBin].value === "a" && data.colBins[c.colBin].value === "x"
  )!;
  const cellB = data.cells.find(
    (c) => data.rowBins[c.rowBin].value === "b" && data.colBins[c.colBin].value === "y"
  )!;
  // row a keeps (a,x)=3 and (a,y)=3 -> each 0.5
  expect(cellA.freq).toBeCloseTo(0.5, 5);
  expect(cellB.freq).toBeCloseTo(1, 5);
});

test("column-normalized mode conditions on column totals", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "alpha", "beta", {
    mode: "cols",
  });
  // column x total = 5 (3 a + 2 b); column y total = 7
  const ax = data.cells.find(
    (c) => data.rowBins[c.rowBin].value === "a" && data.colBins[c.colBin].value === "x"
  )!;
  expect(ax.freq).toBeCloseTo(3 / 5, 5);
  const by = data.cells.find(
    (c) => data.rowBins[c.rowBin].value === "b" && data.colBins[c.colBin].value === "y"
  )!;
  expect(by.freq).toBeCloseTo(4 / 7, 5);
});

test("temporal axis bins in epoch space", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getConfusionMatrixData(testCtx, q1, schema, "dt", "alpha", {
    rowBinCount: 3,
  });
  expect(data.rowKind).toBe("temporal");
  expect(data.colKind).toBe("categorical");
  expect(data.rowBins).toHaveLength(3);
  expect(data.totalRows).toBe(12);
});