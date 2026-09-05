import * as reltab from "reltab";
import { DataSourceConnection, DbDataSource } from "reltab";
import { getKnowledgeGraphData } from "reltab";
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
    "test/support/knowledge_graph.csv"
  );

  return testCtx;
});

const q1 = reltab.tableQuery("knowledge_graph");

const nodeOf = (
  data: reltab.KnowledgeGraphData,
  id: string
): reltab.KnowledgeGraphNode | undefined =>
  data.nodes.find((n) => n.id === id);

const edgeOf = (
  data: reltab.KnowledgeGraphData,
  source: string,
  target: string
): reltab.KnowledgeGraphEdge | undefined =>
  data.edges.find((e) => e.source === source && e.target === target);

test("per-column mode counts key/property occurrences and co-occurrences", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getKnowledgeGraphData(
    testCtx,
    q1,
    schema,
    ["k1", "k2"],
    ["p1", "p2"]
  );

  expect(data.totalRows).toBe(10);

  // key node occurrences
  expect(nodeOf(data, "k:k1:Sales")!.occurrence).toBe(5);
  expect(nodeOf(data, "k:k1:Eng")!.occurrence).toBe(2);
  expect(nodeOf(data, "k:k1:Support")!.occurrence).toBe(1);
  expect(nodeOf(data, "k:k2:2023")!.occurrence).toBe(4);
  expect(nodeOf(data, "k:k2:2024")!.occurrence).toBe(2);

  // property node occurrences
  expect(nodeOf(data, "p:p1:red")!.occurrence).toBe(4);
  expect(nodeOf(data, "p:p1:blue")!.occurrence).toBe(2);
  expect(nodeOf(data, "p:p1:green")!.occurrence).toBe(3);
  expect(nodeOf(data, "p:p2:east")!.occurrence).toBe(5);
  expect(nodeOf(data, "p:p2:north")!.occurrence).toBe(2);
  expect(nodeOf(data, "p:p2:west")!.occurrence).toBe(3);

  // nodes carry their source column id and group
  const sales = nodeOf(data, "k:k1:Sales")!;
  expect(sales.group).toBe("key");
  expect(sales.colId).toBe("k1");
  expect(nodeOf(data, "p:p1:red")!.group).toBe("prop");

  // key-value (k1 × p1) co-occurrences
  expect(edgeOf(data, "k:k1:Sales", "p:p1:red")!.weight).toBe(3);
  expect(edgeOf(data, "k:k1:Sales", "p:p1:blue")!.weight).toBe(2);
  expect(edgeOf(data, "k:k1:Eng", "p:p1:green")!.weight).toBe(1);
  expect(edgeOf(data, "k:k1:Support", "p:p1:red")).toBeUndefined();

  // key-value (k2 × p2) co-occurrences
  expect(edgeOf(data, "k:k2:2023", "p:p2:east")!.weight).toBe(2);
  expect(edgeOf(data, "k:k2:2023", "p:p2:north")!.weight).toBe(2);
  expect(edgeOf(data, "k:k2:2024", "p:p2:east")!.weight).toBe(2);
});

test("null values never create nodes or edges", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getKnowledgeGraphData(
    testCtx,
    q1,
    schema,
    ["k1", "k2"],
    ["p1", "p2"]
  );

  // rows 4 (k2 null), 8 (k1 null), 9 (both null) and 10 (p1 null) contribute
  // nothing for their null columns
  const allIds = new Set(data.nodes.map((n) => n.id));
  expect(allIds.has("k:k2:")).toBe(false);
  expect(allIds.has("k:k1:")).toBe(false);
  expect(allIds.has("p:p1:")).toBe(false);
  expect(allIds.has("p:p2:")).toBe(false);

  // Support (row 10) has null p1: no (Support, prop) edge exists at all
  expect(edgeOf(data, "k:k1:Support", "p:p1:east")).toBeUndefined();
  // but (Support, east) exists through p2
  expect(edgeOf(data, "k:k1:Support", "p:p2:east")!.weight).toBe(1);
});

test("composite mode groups non-empty key parts into one node per row", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getKnowledgeGraphData(
    testCtx,
    q1,
    schema,
    ["k1", "k2"],
    ["p1"],
    { keyMode: "composite" }
  );

  expect(data.totalRows).toBe(10);

  // composite key nodes: one per row, from non-null parts only
  expect(data.nodes.filter((n) => n.group === "key")).toHaveLength(7);
  const sales23 = nodeOf(data, "k:Sales\u001f2023")!;
  expect(sales23.occurrence).toBe(3);
  expect(sales23.label).toBe("Sales, 2023");
  expect(sales23.colId).toBeUndefined();

  // partial-null key -> node from the non-null part only
  const salesOnly = nodeOf(data, "k:Sales")!;
  expect(salesOnly.occurrence).toBe(1);
  expect(salesOnly.label).toBe("Sales");
  const k2Only = nodeOf(data, "k:2023")!;
  expect(k2Only.occurrence).toBe(1);
  expect(k2Only.label).toBe("2023");
  // (k1, k2) both null (row 9) -> no node
  expect(nodeOf(data, "k:")).toBeUndefined();

  // composite key × property co-occurrence
  expect(edgeOf(data, "k:Sales\u001f2023", "p:p1:red")!.weight).toBe(2);
  expect(edgeOf(data, "k:Sales", "p:p1:blue")!.weight).toBe(1);
  expect(edgeOf(data, "k:2023", "p:p1:green")!.weight).toBe(1);
  expect(edgeOf(data, "k:Support", "p:p1:east")).toBeUndefined();
});

test("sampling bounds the computed rows", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getKnowledgeGraphData(
    testCtx,
    q1,
    schema,
    ["k1"],
    ["p1"],
    { sampleLimit: 5 }
  );

  // totalRows reflects the full source, while counts derive from <= 5 rows
  expect(data.totalRows).toBe(10);
  const totalOcc = data.nodes.reduce((acc, n) => acc + n.occurrence, 0);
  // occurrences come from at most sampleLimit source rows per node set
  expect(totalOcc <= 10).toBe(true);
});

test("min node occurrence and min edge weight thresholds filter the result", async () => {
  const schema = await testCtx.getSchema(q1);
  const data = await getKnowledgeGraphData(
    testCtx,
    q1,
    schema,
    ["k2"],
    ["p2"],
    { minNodeOccurrence: 2, minEdgeWeight: 2 }
  );

  // k2:2023 (4) survives, k2:2024 (2) survives; occurrences validated below
  const keyIds = data.nodes.filter((n) => n.group === "key").map((n) => n.id);
  expect(keyIds).toEqual(["k:k2:2023", "k:k2:2024"]);

  // edges must have weight >= 2 and both endpoints must survive
  for (const e of data.edges) {
    expect(e.weight).toBeGreaterThanOrEqual(2);
  }
  expect(edgeOf(data, "k:k2:2023", "p:p2:east")!.weight).toBe(2);
  expect(edgeOf(data, "k:k2:2023", "p:p2:north")!.weight).toBe(2);
});