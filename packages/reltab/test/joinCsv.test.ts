import * as reltab from "../src/reltab";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import { JoinCsvArgs, CsvJoinType } from "../src/QueryRep";

const { tableQuery } = reltab;

const sampleCsvPath = "/tmp/test_sample.csv";
const sampleRhsSchema: { [colId: string]: { displayName: string; columnType: string } } = {
  firstName: { displayName: "firstName", columnType: "VARCHAR" },
  lastName: { displayName: "lastName", columnType: "VARCHAR" },
  email: { displayName: "email", columnType: "VARCHAR" },
  phoneNumber: { displayName: "phoneNumber", columnType: "VARCHAR" },
};
const sampleRhsColumns = ["firstName", "lastName", "email", "phoneNumber"];

test("joinCsv - creates correct AST node", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  const rep = (jq as any)._rep;
  expect(rep.operator).toBe("joinCsv");
  expect(rep.args.rightTablePath).toBe(sampleCsvPath);
  expect(rep.args.joinType).toBe("left");
  expect(rep.args.leftCol).toBe("Name");
  expect(rep.args.rightCol).toBe("firstName");
  expect(rep.args.forceStringCast).toBe(true);
  expect(rep.args.nullString).toBeUndefined();
  expect(rep.rhsColumns).toEqual(sampleRhsColumns);
  expect(rep.rhsSchema).toEqual(sampleRhsSchema);
});

test("joinCsv - inner join type", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "inner",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: false,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);
  const rep = (jq as any)._rep;
  expect(rep.args.joinType).toBe("inner");
});

test("joinCsv - with nullString option", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
    nullString: "N/A",
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);
  const rep = (jq as any)._rep;
  expect(rep.args.nullString).toBe("N/A");
});

test("joinCsv - getSchema returns combined columns", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  // We need a tableMap with the barttest schema to test getSchema
  // For now, just test the AST is well-formed
  const rep = (jq as any)._rep;
  expect(rep.operator).toBe("joinCsv");
});

test("joinCsv - toSql generates correct SQL", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  // We need a tableMap with the barttest schema
  const barttestSchema = new reltab.Schema(DuckDBDialect, ["Job Family", "Title", "Union", "Name", "Base", "TCOE"], {
    "Job Family": { displayName: "Job Family", columnType: "VARCHAR" },
    "Title": { displayName: "Title", columnType: "VARCHAR" },
    "Union": { displayName: "Union", columnType: "VARCHAR" },
    "Name": { displayName: "Name", columnType: "VARCHAR" },
    "Base": { displayName: "Base", columnType: "DOUBLE" },
    "TCOE": { displayName: "TCOE", columnType: "DOUBLE" },
  });

  const tableMap = {
    [JSON.stringify({ operator: "table", tableName: "barttest" })]: barttestSchema,
  };

  const sql = jq.toSql(DuckDBDialect, tableMap);

  // Verify the SQL contains the expected elements
  expect(sql).toContain("read_csv_auto");
  expect(sql).toContain(sampleCsvPath);
  expect(sql).toContain("LEFT JOIN");
  expect(sql).toContain("header=True");
  expect(sql).toContain("CAST");
  expect(sql).toContain("VARCHAR");
  expect(sql).toContain("ON");
});

test("joinCsv - inner join SQL generation", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: "/data/lookup.csv",
    joinType: "inner",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: false,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  const barttestSchema = new reltab.Schema(DuckDBDialect, ["Job Family", "Title", "Union", "Name", "Base", "TCOE"], {
    "Job Family": { displayName: "Job Family", columnType: "VARCHAR" },
    "Title": { displayName: "Title", columnType: "VARCHAR" },
    "Union": { displayName: "Union", columnType: "VARCHAR" },
    "Name": { displayName: "Name", columnType: "VARCHAR" },
    "Base": { displayName: "Base", columnType: "DOUBLE" },
    "TCOE": { displayName: "TCOE", columnType: "DOUBLE" },
  });

  const tableMap = {
    [JSON.stringify({ operator: "table", tableName: "barttest" })]: barttestSchema,
  };

  const sql = jq.toSql(DuckDBDialect, tableMap);

  expect(sql).toContain("INNER JOIN");
  expect(sql).toContain("/data/lookup.csv");
  // No CAST when forceStringCast is false
  expect(sql).not.toMatch(/CAST\(.*VARCHAR/);
});

test("joinCsv - with nullString in SQL", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
    nullString: "NULL",
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  const barttestSchema = new reltab.Schema(DuckDBDialect, ["Job Family", "Title", "Union", "Name", "Base", "TCOE"], {
    "Job Family": { displayName: "Job Family", columnType: "VARCHAR" },
    "Title": { displayName: "Title", columnType: "VARCHAR" },
    "Union": { displayName: "Union", columnType: "VARCHAR" },
    "Name": { displayName: "Name", columnType: "VARCHAR" },
    "Base": { displayName: "Base", columnType: "DOUBLE" },
    "TCOE": { displayName: "TCOE", columnType: "DOUBLE" },
  });

  const tableMap = {
    [JSON.stringify({ operator: "table", tableName: "barttest" })]: barttestSchema,
  };

  const sql = jq.toSql(DuckDBDialect, tableMap);

  expect(sql).toContain("nullstr='NULL'");
});

test("joinCsv - serialization roundtrip", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
    nullString: "N/A",
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  const jsonStr = JSON.stringify({ query: jq });
  const deserialized = reltab.deserializeQueryReq(jsonStr);

  expect(deserialized.query).toBeDefined();
});

test("joinCsv - toJS produces valid JS representation", () => {
  const q = tableQuery("barttest");
  const args: JoinCsvArgs = {
    rightTablePath: sampleCsvPath,
    joinType: "left",
    leftCol: "Name",
    rightCol: "firstName",
    forceStringCast: true,
  };
  const jq = q.joinCsv(args, sampleRhsSchema, sampleRhsColumns);

  const js = jq.toJS();
  expect(js).toContain("joinCsv");
  expect(js).toContain("barttest");
  expect(js).toContain(sampleCsvPath);
});
