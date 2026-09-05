import { DbDataSource, DbDriver, DataSourceId } from "../src/DataSource";
import { Schema } from "../src/Schema";
import { tableQuery } from "../src/QueryExp";
import { DuckDBDialect } from "../src/dialects/DuckDBDialect";
import {
  getKnowledgeGraphData,
  KnowledgeGraphData,
} from "../src/knowledgeGraph";

const sourceId: DataSourceId = {
  providerName: "duckdb",
  resourceId: ":memory:",
};

const tableSchema = new Schema(
  DuckDBDialect,
  ["k1", "k2", "p1", "p2", "n"],
  {
    k1: { columnType: "VARCHAR", displayName: "k1" },
    k2: { columnType: "VARCHAR", displayName: "k2" },
    p1: { columnType: "VARCHAR", displayName: "p1" },
    p2: { columnType: "VARCHAR", displayName: "p2" },
    n: { columnType: "INTEGER", displayName: "n" },
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

const allSql = (runSqlQuery: RunSqlQuery): string[] =>
  runSqlQuery.mock.calls.map((c) => c[0] as string);

const sqlOf = (runSqlQuery: RunSqlQuery, needle: string): string =>
  allSql(runSqlQuery).find((s) => s.includes(needle)) as string;

// Route the mock driver's runSqlQuery by SQL content.
const routeSql = (
  runSqlQuery: RunSqlQuery,
  routes: Array<[needle: string, rows: Array<Record<string, unknown>>]>
): void => {
  runSqlQuery.mockImplementation(async (sql: string) => {
    for (const [needle, rows] of routes) {
      if (sql.includes(needle)) {
        return rows;
      }
    }
    throw new Error("no route for SQL: " + sql.slice(0, 120));
  });
};

describe("getKnowledgeGraphData (per-column mode)", () => {
  test("counts key/property occurrences and key×property co-occurrences", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      // rowCount
      ["rowCount", [{ rowCount: BigInt(4) }]],
      // key occurrence
      [
        "'k' AS __group",
        [
          { __group: "k", __colid: "k1", __v: "Sales", __occ: BigInt(3) },
          { __group: "k", __colid: "k1", __v: "Eng", __occ: BigInt(1) },
        ],
      ],
      // edges
      [
        "__kcol",
        [
          { __kcol: "k1", __kval: "Sales", __pcol: "p1", __pval: "red", __w: BigInt(2) },
          { __kcol: "k1", __kval: "Eng", __pcol: "p1", __pval: "blue", __w: BigInt(1) },
        ],
      ],
      // property occurrence
      [
        "'p' AS __group",
        [
          { __group: "p", __colid: "p1", __v: "red", __occ: BigInt(2) },
          { __group: "p", __colid: "p1", __v: "blue", __occ: BigInt(2) },
        ],
      ],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1"],
      ["p1"]
    );

    expect(data.totalRows).toBe(4);
    expect(data.nodes).toHaveLength(4);
    const keyNodes = data.nodes.filter((n) => n.group === "key");
    const propNodes = data.nodes.filter((n) => n.group === "prop");
    expect(keyNodes).toEqual([
      { id: "k:k1:Sales", group: "key", label: "Sales", colId: "k1", occurrence: 3 },
      { id: "k:k1:Eng", group: "key", label: "Eng", colId: "k1", occurrence: 1 },
    ]);
    expect(propNodes).toEqual([
      { id: "p:p1:red", group: "prop", label: "red", colId: "p1", occurrence: 2 },
      { id: "p:p1:blue", group: "prop", label: "blue", colId: "p1", occurrence: 2 },
    ]);
    expect(data.edges).toEqual([
      { source: "k:k1:Sales", target: "p:p1:red", weight: 2 },
      { source: "k:k1:Eng", target: "p:p1:blue", weight: 1 },
    ]);
  });

  test("generates SQL filtering nulls and casting property values to VARCHAR", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(2) }]],
      ["'k' AS __group", [{ __group: "k", __colid: "k1", __v: "A", __occ: BigInt(2) }]],
      ["__kcol", [{ __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(2) }]],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "x", __occ: BigInt(2) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    await getKnowledgeGraphData(ds, tableQuery("t"), tableSchema, ["k1"], ["p1"]);

    const keySql = sqlOf(runSqlQuery, "'k' AS __group");
    expect(keySql).toContain('GROUP BY "k1"');
    expect(keySql).toContain('WHERE "k1" IS NOT NULL');

    const propSql = sqlOf(runSqlQuery, "'p' AS __group");
    expect(propSql).toContain('CAST("p1" AS VARCHAR)');
    expect(propSql).toContain('GROUP BY CAST("p1" AS VARCHAR)');

    const edgeSql = sqlOf(runSqlQuery, "__kcol");
    expect(edgeSql).toContain('"k1" AS __kval');
    expect(edgeSql).toContain('CAST("p1" AS VARCHAR) AS __pval');
    expect(edgeSql).toContain('WHERE "k1" IS NOT NULL AND "p1" IS NOT NULL');
    expect(edgeSql).toContain('GROUP BY "k1", CAST("p1" AS VARCHAR)');
  });

  test("creates one key node set per key column", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(3) }]],
      // key occurrence batched over k1 and k2
      [
        "'k' AS __group",
        [
          { __group: "k", __colid: "k1", __v: "A", __occ: BigInt(2) },
          { __group: "k", __colid: "k2", __v: "A", __occ: BigInt(1) },
        ],
      ],
      ["__kcol", [{ __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(2) }]],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "x", __occ: BigInt(2) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1", "k2"],
      ["p1"]
    );

    // distinct node ids even when the same value appears in two key columns
    const ids = data.nodes.filter((n) => n.group === "key").map((n) => n.id).sort();
    expect(ids).toEqual(["k:k1:A", "k:k2:A"]);
  });

  test("empty columns produce empty data", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [["rowCount", [{ rowCount: BigInt(0) }]]]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(ds, tableQuery("t"), tableSchema, [], []);
    expect(data.nodes).toEqual([]);
    expect(data.edges).toEqual([]);
    expect(data.totalRows).toBe(0);
  });
});

describe("getKnowledgeGraphData (composite mode)", () => {
  test("builds a composite key from non-null parts via concat_ws + NULLIF", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(3) }]],
      [
        "GROUP BY __v",
        [
          { __v: "Sales\u001f2023", __occ: BigInt(2) },
          { __v: "Eng", __occ: BigInt(1) },
        ],
      ],
      [" AS __k,", [{ __k: "Sales\u001f2023", __pcol: "p1", __v: "red", __w: BigInt(2) }]],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "red", __occ: BigInt(2) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1", "k2"],
      ["p1"],
      { keyMode: "composite" }
    );

    const keyNodes = data.nodes.filter((n) => n.group === "key");
    expect(keyNodes).toEqual([
      { id: "k:Sales\u001f2023", group: "key", label: "Sales, 2023", occurrence: 2 },
      { id: "k:Eng", group: "key", label: "Eng", occurrence: 1 },
    ]);
    expect(data.edges).toEqual([
      { source: "k:Sales\u001f2023", target: "p:p1:red", weight: 2 },
    ]);

    const keySql = sqlOf(runSqlQuery, "concat_ws");
    expect(keySql).toContain("concat_ws(chr(31)");
    expect(keySql).toContain('NULLIF(CAST("k1" AS VARCHAR), \'\')');
    expect(keySql).toContain('NULLIF(CAST("k2" AS VARCHAR), \'\')');
    expect(keySql).toContain('WHERE "k1" IS NOT NULL OR "k2" IS NOT NULL');
    expect(keySql).toContain("GROUP BY __v");
  });

  test("composite key nodes carry no colId and label joins parts with ', '", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(1) }]],
      ["GROUP BY __v", [{ __v: "A\u001fB\u001fC", __occ: BigInt(1) }]],
      [" AS __k,", [{ __k: "A\u001fB\u001fC", __pcol: "p1", __v: "x", __w: BigInt(1) }]],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "x", __occ: BigInt(1) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1", "k2", "k3"],
      ["p1"],
      { keyMode: "composite" }
    );

    const keyNode = data.nodes.find((n) => n.group === "key")!;
    expect(keyNode.id).toBe("k:A\u001fB\u001fC");
    expect(keyNode.label).toBe("A, B, C");
    expect(keyNode.colId).toBeUndefined();
  });
});

describe("getKnowledgeGraphData (sampling and thresholds)", () => {
  test("wraps the source in ORDER BY random() LIMIT when sampleLimit is set", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(100) }]],
      ["'k' AS __group", [{ __group: "k", __colid: "k1", __v: "A", __occ: BigInt(10) }]],
      ["__kcol", [{ __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(5) }]],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "x", __occ: BigInt(5) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    await getKnowledgeGraphData(ds, tableQuery("t"), tableSchema, ["k1"], ["p1"], {
      sampleLimit: 50,
    });

    const keySql = sqlOf(runSqlQuery, "'k' AS __group");
    expect(keySql).toContain("ORDER BY random() LIMIT 50");
    const edgeSql = sqlOf(runSqlQuery, "__kcol");
    expect(edgeSql).toContain("ORDER BY random() LIMIT 50");
  });

  test("minNodeOccurrence drops nodes and their edges", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(4) }]],
      [
        "'k' AS __group",
        [
          { __group: "k", __colid: "k1", __v: "A", __occ: BigInt(3) },
          { __group: "k", __colid: "k1", __v: "B", __occ: BigInt(1) },
        ],
      ],
      [
        "__kcol",
        [
          { __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(2) },
          { __kcol: "k1", __kval: "B", __pcol: "p1", __pval: "y", __w: BigInt(1) },
        ],
      ],
      [
        "'p' AS __group",
        [
          { __group: "p", __colid: "p1", __v: "x", __occ: BigInt(2) },
          { __group: "p", __colid: "p1", __v: "y", __occ: BigInt(2) },
        ],
      ],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1"],
      ["p1"],
      { minNodeOccurrence: 2 }
    );

    const keyIds = data.nodes.filter((n) => n.group === "key").map((n) => n.id);
    expect(keyIds).toEqual(["k:k1:A"]);
    // edge incident to dropped node B is removed too
    expect(data.edges).toEqual([
      { source: "k:k1:A", target: "p:p1:x", weight: 2 },
    ]);
  });

  test("minEdgeWeight drops low-weight edges", async () => {
    const runSqlQuery = jest.fn();
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(4) }]],
      ["'k' AS __group", [{ __group: "k", __colid: "k1", __v: "A", __occ: BigInt(3) }]],
      [
        "__kcol",
        [
          { __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(2) },
          { __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "y", __w: BigInt(1) },
        ],
      ],
      [
        "'p' AS __group",
        [
          { __group: "p", __colid: "p1", __v: "x", __occ: BigInt(2) },
          { __group: "p", __colid: "p1", __v: "y", __occ: BigInt(1) },
        ],
      ],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1"],
      ["p1"],
      { minEdgeWeight: 2 }
    );

    expect(data.edges).toEqual([
      { source: "k:k1:A", target: "p:p1:x", weight: 2 },
    ]);
  });

  test("aggregates duplicate node rows and edge rows (same id twice)", async () => {
    const runSqlQuery = jest.fn();
    // two key columns each yield a node with the same value - in the SQL these
    // would be distinct per-loop groups; a re-run with the same composite key
    // must accumulate occurrences instead of emitting duplicate nodes.
    routeSql(runSqlQuery, [
      ["rowCount", [{ rowCount: BigInt(2) }]],
      [
        "'k' AS __group",
        [
          { __group: "k", __colid: "k1", __v: "A", __occ: BigInt(1) },
          { __group: "k", __colid: "k1", __v: "A", __occ: BigInt(1) },
        ],
      ],
      [
        "__kcol",
        [
          { __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(1) },
          { __kcol: "k1", __kval: "A", __pcol: "p1", __pval: "x", __w: BigInt(1) },
        ],
      ],
      ["'p' AS __group", [{ __group: "p", __colid: "p1", __v: "x", __occ: BigInt(2) }]],
    ]);
    const ds = new DbDataSource(makeDriver(runSqlQuery));

    const data: KnowledgeGraphData = await getKnowledgeGraphData(
      ds,
      tableQuery("t"),
      tableSchema,
      ["k1"],
      ["p1"]
    );

    expect(data.nodes.filter((n) => n.group === "key")).toHaveLength(1);
    expect(data.nodes.filter((n) => n.group === "key")[0].occurrence).toBe(2);
    expect(data.edges).toEqual([
      { source: "k:k1:A", target: "p:p1:x", weight: 2 },
    ]);
  });
});