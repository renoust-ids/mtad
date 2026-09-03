import * as reltab from "../src/reltab";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import { ConcatCsvArgs, ConcatCsvOutputColumn } from "../src/QueryRep";

const { tableQuery } = reltab;

const sampleCsvPath = "/tmp/new_sample.csv";

const barttestSchema = new reltab.Schema(
  DuckDBDialect,
  ["Name", "Base", "TCOE", "Union", "Job Family"],
  {
    Name: { displayName: "Name", columnType: "VARCHAR" },
    Base: { displayName: "Base", columnType: "DOUBLE" },
    TCOE: { displayName: "TCOE", columnType: "DOUBLE" },
    Union: { displayName: "Union", columnType: "VARCHAR" },
    "Job Family": { displayName: "Job Family", columnType: "VARCHAR" },
  }
);

const tableMap = {
  [JSON.stringify({ operator: "table", tableName: "barttest" })]:
    barttestSchema,
};

const mkOutputColumns = (): ConcatCsvOutputColumn[] => [
  { kind: "matched", originalCol: "Name", newCol: "name", castType: "VARCHAR" },
  { kind: "originalOnly", originalCol: "Base", originalType: "DOUBLE" },
  { kind: "newOnly", newCol: "bonus", newColType: "INTEGER" },
];

const mkArgs = (overrides?: Partial<ConcatCsvArgs>): ConcatCsvArgs => ({
  rightTablePath: sampleCsvPath,
  outputColumns: mkOutputColumns(),
  ...overrides,
});

const mkRhsSchema = () => ({
  name: { displayName: "name", columnType: "VARCHAR" },
  bonus: { displayName: "bonus", columnType: "INTEGER" },
});

const mkRhsColumns = () => ["name", "bonus"];

test("concatCsv - creates correct AST node", () => {
  const q = tableQuery("barttest");
  const args = mkArgs();
  const cq = q.concatCsv(args, mkRhsSchema(), mkRhsColumns());
  const rep = (cq as any)._rep;
  expect(rep.operator).toBe("concatCsv");
  expect(rep.args.rightTablePath).toBe(sampleCsvPath);
  expect(rep.args.outputColumns.length).toBe(3);
  expect(rep.args.outputColumns[0].kind).toBe("matched");
  expect(rep.rhsColumns).toEqual(["name", "bonus"]);
});

test("concatCsv - toSql emits a UNION ALL of two selects", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const sql = cq.toSql(DuckDBDialect, tableMap);

  expect(sql).toContain("UNION ALL");
  expect(sql).toContain("read_csv_auto");
  expect(sql).toContain(sampleCsvPath);
  expect(sql).toContain("header=True");
  // original side (subquery from barttest) and file side both present
  expect(sql).toContain("FROM barttest");
  expect(sql).toMatch(/SELECT "Name"/);
});

test("concatCsv - matched column casts the new column to result type", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const sql = cq.toSql(DuckDBDialect, tableMap);
  expect(sql).toContain("TRY_CAST(t1.\"name\" AS VARCHAR)");
});

test("concatCsv - missing original columns are NULL on the file side", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const sql = cq.toSql(DuckDBDialect, tableMap);
  expect(sql).toContain("CAST(NULL AS DOUBLE)");
});

test("concatCsv - new-only columns are NULL on the original side", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const sql = cq.toSql(DuckDBDialect, tableMap);
  // original side: bonus is NULL
  expect(sql).toContain("CAST(NULL AS INTEGER)");
});

test("concatCsv - per-column null string wraps with NULLIF", () => {
  const q = tableQuery("barttest");
  const args = mkArgs({
    outputColumns: [
      {
        kind: "matched",
        originalCol: "Name",
        newCol: "name",
        castType: "VARCHAR",
        nullString: "N/A",
      },
      { kind: "newOnly", newCol: "bonus", newColType: "INTEGER" },
    ],
  });
  const cq = q.concatCsv(args, mkRhsSchema(), mkRhsColumns());
  const sql = cq.toSql(DuckDBDialect, tableMap);
  expect(sql).toContain('NULLIF(CAST(t1."name" AS VARCHAR), "N/A")');
});

test("concatCsv - getSchema returns result columns in output order", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const schema = cq.getSchema(DuckDBDialect, tableMap);
  expect(schema.columns).toEqual(["Name", "Base", "bonus"]);
  expect(schema.columnMetadata["Name"].columnType).toBe("VARCHAR");
  expect(schema.columnMetadata["Base"].columnType).toBe("DOUBLE");
  expect(schema.columnMetadata["bonus"].columnType).toBe("INTEGER");
});

test("concatCsv - serialization roundtrip", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const jsonStr = JSON.stringify({ query: cq });
  const deserialized = reltab.deserializeQueryReq(jsonStr);
  expect(deserialized.query).toBeDefined();
});

test("concatCsv - toJS renders concatCsv call", () => {
  const q = tableQuery("barttest");
  const cq = q.concatCsv(mkArgs(), mkRhsSchema(), mkRhsColumns());
  const js = cq.toJS();
  expect(js).toContain("concatCsv");
  expect(js).toContain("barttest");
  expect(js).toContain(sampleCsvPath);
});
