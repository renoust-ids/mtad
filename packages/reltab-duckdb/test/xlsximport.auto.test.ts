import * as reltab from "reltab";
import {
  DataSourceConnection,
  DbDataSource,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";

let testCtx: DbDataSource;

const SUPPORT = "test/support";

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });
  testCtx = ctx as DbDataSource;
  return testCtx;
});

const rowsOf = async (tableName: string): Promise<any[]> => {
  const res = await testCtx.evalQuery(reltab.tableQuery(tableName));
  return res.rowData;
};

describe("getXlsxSheetNames", () => {
  test("returns the single sheet of a one-sheet workbook", () => {
    const names = reltabDuckDB.getXlsxSheetNames(`${SUPPORT}/products.xlsx`);
    expect(names).toEqual(["Products"]);
  });

  test("returns sheets in workbook order for a multi-sheet workbook", () => {
    const names = reltabDuckDB.getXlsxSheetNames(
      `${SUPPORT}/workbook_multi.xlsx`
    );
    expect(names).toEqual(["Employees", "Salaries"]);
  });
});

describe("nativeXLSXImport", () => {
  test("imports the first sheet by default with native type inference", async () => {
    const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;
    const tableName = await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/products.xlsx`
    );
    const schema = await testCtx.getTableSchema(tableName);
    expect(schema.columnType("Name").kind).toBe("string");
    // DuckDB's excel reader infers numeric cells as DOUBLE
    expect(schema.columnType("Price").kind).toBe("real");
    expect(schema.columnType("Qty").kind).toBe("real");

    const rows = await rowsOf(tableName);
    expect(rows.map((r) => ({ Name: r["Name"], Price: r["Price"], Qty: r["Qty"] }))).toEqual([
      { Name: "Apple", Price: 1.2, Qty: 10 },
      { Name: "Banana", Price: 0.5, Qty: 20 },
      { Name: "Cherry", Price: 2.75, Qty: 5 },
    ]);
  });

  test("imports a typed sheet with numeric, timestamp, date and time columns", async () => {
    const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;
    const tableName = await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/typed.xlsx`
    );
    const schema = await testCtx.getTableSchema(tableName);
    expect(schema.columnType("ID").kind).toBe("real");
    expect(schema.columnType("Price").kind).toBe("real");
    expect(schema.columnType("Qty").kind).toBe("real");
    expect(schema.columnType("Name").kind).toBe("string");
    expect(schema.columnType("When").kind).toBe("timestamp");
    expect(schema.columnType("Day").kind).toBe("timestamp");
    expect(schema.columnType("At").kind).toBe("timestamp");
  });

  test("falls back to per-column inference when a mixed column breaks native typing", async () => {
    const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;
    // mixed.xlsx has a column "Val" = [10, 20, "N/A"], which makes DuckDB's
    // native inference fail; the import must fall back and infer per-column.
    const tableName = await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/mixed.xlsx`
    );
    const schema = await testCtx.getTableSchema(tableName);
    expect(schema.columnType("ID").kind).toBe("integer");
    expect(schema.columnType("Name").kind).toBe("string");
    expect(schema.columnType("Val").kind).toBe("string");
    expect(schema.columnType("Amt").kind).toBe("real");

    const rows = await rowsOf(tableName);
    expect(rows.map((r) => ({ ID: r["ID"], Val: r["Val"], Amt: r["Amt"] }))).toEqual([
      { ID: 1, Val: "10", Amt: 1.5 },
      { ID: 2, Val: "20", Amt: 2.5 },
      { ID: 3, Val: "N/A", Amt: 3.5 },
    ]);
  });

  test("imports an explicitly named sheet of a multi-sheet workbook", async () => {
    const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;
    const tableName = await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/workbook_multi.xlsx`,
      "Salaries"
    );
    const rows = await rowsOf(tableName);
    expect(rows.map((r) => ({ EmpID: r["EmpID"], Salary: r["Salary"] }))).toEqual([
      { EmpID: "E001", Salary: 90000 },
      { EmpID: "E003", Salary: 85000 },
    ]);
  });

  test("replacing a table name swaps its contents", async () => {
    const duckDbDriver = testCtx.db as reltabDuckDB.DuckDBDriver;
    const t1 = await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/workbook_multi.xlsx`
    );
    // t1 holds the first sheet ("Employees", cols EmpID/Name/Dept)
    await reltabDuckDB.nativeXLSXImport(
      duckDbDriver.db,
      `${SUPPORT}/workbook_multi.xlsx`,
      "Salaries",
      t1
    );
    const schema = await testCtx.getTableSchema(t1);
    expect(schema.columns).toContain("Salary");
    expect(schema.columns).not.toContain("Name");
  });
});
