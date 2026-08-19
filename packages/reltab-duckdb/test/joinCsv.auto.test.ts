import * as path from "path";
import * as reltab from "reltab";
import {
  DataSourceConnection,
  DbDataSource,
  tableQuery,
} from "reltab";
import * as reltabDuckDB from "../src/reltab-duckdb";
import * as util from "./testUtils";

const { col, constVal } = reltab;

let testCtx: DataSourceConnection;

const joinCsvPath = path.resolve(__dirname, "support/join_data.csv");
const sampleCsvPath = path.resolve(__dirname, "support/sample.csv");

const rhsSchema: { [colId: string]: { displayName: string; columnType: string } } = {
  firstName: { displayName: "firstName", columnType: "VARCHAR" },
  department: { displayName: "department", columnType: "VARCHAR" },
  location: { displayName: "location", columnType: "VARCHAR" },
};
const rhsColumns = ["firstName", "department", "location"];

beforeAll(async (): Promise<DataSourceConnection> => {
  const ctx = await reltab.getConnection({
    providerName: "duckdb",
    resourceId: ":memory:",
  });

  testCtx = ctx;

  const dbds = ctx as DbDataSource;
  const duckDbDriver = dbds.db as reltabDuckDB.DuckDBDriver;

  await reltabDuckDB.nativeCSVImport(duckDbDriver.db, sampleCsvPath);

  return testCtx;
});

test("joinCsv - SQL generation contains read_csv_auto", async () => {
  const dbds = testCtx as DbDataSource;
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "left",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: true,
    },
    rhsSchema,
    rhsColumns
  );

  const sqlQuery = await dbds.getSqlForQuery(jq);
  console.log("*** joinCsv SQL:\n", sqlQuery);

  expect(sqlQuery).toContain("read_csv_auto");
  expect(sqlQuery).toContain(joinCsvPath);
  expect(sqlQuery).toContain("LEFT JOIN");
  expect(sqlQuery).toContain("header=True");
});

test("joinCsv - left join execution returns combined data", async () => {
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "left",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: true,
    },
    rhsSchema,
    rhsColumns
  );

  const res = await testCtx.evalQuery(jq);
  console.log("*** joinCsv result:");
  util.logTable(res);

  // sample.csv has 3 rows (John, Jane, James)
  // join_data.csv has 4 rows (John, Jane, James, Alice)
  // Left join should return 3 rows (all from sample, with nulls for non-matching)
  expect(res.rowData.length).toBe(3);

  // Check that the combined schema includes columns from both tables
  expect(res.schema.columns).toContain("firstName");
  expect(res.schema.columns).toContain("department");
  expect(res.schema.columns).toContain("location");
  expect(res.schema.columns).toContain("email");
  expect(res.schema.columns).toContain("phoneNumber");
});

test("joinCsv - inner join execution returns only matching rows", async () => {
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "inner",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: false,
    },
    rhsSchema,
    rhsColumns
  );

  const res = await testCtx.evalQuery(jq);
  console.log("*** joinCsv inner result:");
  util.logTable(res);

  // Inner join: sample has John, Jane, James; join_data has John, Jane, James, Alice
  // All 3 from sample match, so 3 rows
  expect(res.rowData.length).toBe(3);

  // Check that department column is populated (not null)
  const deptCol = res.getColumn("department");
  expect(deptCol).toBeDefined();
  expect(deptCol!.every((v: any) => v !== null)).toBe(true);
});

test("joinCsv - right join with CAST generates correct SQL", async () => {
  const dbds = testCtx as DbDataSource;
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "right",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: true,
      nullString: "N/A",
    },
    rhsSchema,
    rhsColumns
  );

  const sqlQuery = await dbds.getSqlForQuery(jq);
  console.log("*** joinCsv right join SQL:\n", sqlQuery);

  expect(sqlQuery).toContain("RIGHT JOIN");
  expect(sqlQuery).toContain("CAST");
  expect(sqlQuery).toContain("VARCHAR");
  expect(sqlQuery).toContain("nullstr='N/A'");
});

test("joinCsv - full outer join execution", async () => {
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "outer",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: false,
    },
    rhsSchema,
    rhsColumns
  );

  const res = await testCtx.evalQuery(jq);
  console.log("*** joinCsv full outer result:");
  util.logTable(res);

  // Full outer join: sample has 3 rows, join_data has 4 rows
  // 3 match (John, Jane, James), 1 unmatched from right (Alice)
  // Total: 4 rows
  expect(res.rowData.length).toBe(4);

  // Check that the schema includes columns from both tables
  expect(res.schema.columns).toContain("department");
  expect(res.schema.columns).toContain("email");
});

test("joinCsv - getSchema returns correct combined schema", () => {
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "left",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: true,
    },
    rhsSchema,
    rhsColumns
  );

  const sampleSchema = new reltab.Schema(reltab.DuckDBDialect, ["firstName", "lastName", "email", "phoneNumber"], {
    firstName: { displayName: "firstName", columnType: "VARCHAR" },
    lastName: { displayName: "lastName", columnType: "VARCHAR" },
    email: { displayName: "email", columnType: "VARCHAR" },
    phoneNumber: { displayName: "phoneNumber", columnType: "VARCHAR" },
  });

  const tableMap = {
    [JSON.stringify({ operator: "table", tableName: "sample" })]: sampleSchema,
  };

  const schema = jq.getSchema(reltab.DuckDBDialect, tableMap);

  // Should have all left columns + right columns (minus join key from right)
  expect(schema.columns).toContain("firstName");
  expect(schema.columns).toContain("lastName");
  expect(schema.columns).toContain("email");
  expect(schema.columns).toContain("phoneNumber");
  expect(schema.columns).toContain("department");
  expect(schema.columns).toContain("location");
});

test("joinCsv - serialization and deserialization", async () => {
  const q1 = tableQuery("sample");
  const jq = q1.joinCsv(
    {
      rightTablePath: joinCsvPath,
      joinType: "left",
      leftCol: "firstName",
      rightCol: "firstName",
      forceStringCast: true,
    },
    rhsSchema,
    rhsColumns
  );

  const jsonStr = JSON.stringify({ query: jq });
  const deserialized = reltab.deserializeQueryReq(jsonStr);

  // Execute the deserialized query
  const res = await testCtx.evalQuery(deserialized.query);
  expect(res.rowData.length).toBe(3);
  expect(res.schema.columns).toContain("department");
});
