/**
 *
 * Knowledge graph (bipartite key ↔ property co-occurrence) helpers using reltab.
 *
 * Every source row links each of its key values to each of its property values:
 * - a KEY node exists for each distinct non-null value of a key column (per-column
 *   mode) or for each composite key tuple (composite mode);
 * - a PROPERTY node exists for each distinct non-null value of a property column;
 * - an EDGE exists for each (key value, property value) pair that co-occur on the
 *   same row.
 *
 * NULL never produces a node, hence never an incident edge. Node weight is the
 * occurrence (number of source rows where the value is non-null), edge weight is
 * the co-occurrence (number of rows where key and property are both non-null).
 */

import { DataSourceConnection } from "./DataSource";
import { QueryExp, sqlQuery } from "./QueryExp";
import { Schema } from "./Schema";
import { TableRep } from "./TableRep";
import { sqlEscapeString } from "./defs";

const quoteColName = (cid: string): string => '"' + cid.replace(/"/g, '""') + '"';

// Internal separator between the parts of a composite key (both in the SQL
// concat_ws() call and in the assembled node id).
const COMP_SEP = "\u001f";

export type KGNodeGroup = "key" | "prop";
export type KGKeyMode = "per-column" | "composite";

export interface KnowledgeGraphNode {
  // Stable id: "k:<colId>:<value>" (per-column), "k:<composite>" (composite),
  // or "p:<propColId>:<value>".
  id: string;
  group: KGNodeGroup;
  label: string;
  // Source column id; undefined for a composite key node (multi-column).
  colId?: string;
  // Number of source rows where the value is non-null.
  occurrence: number;
}

export interface KnowledgeGraphEdge {
  source: string; // key node id
  target: string; // prop node id
  weight: number; // co-occurrence (rows where key and prop are both non-null)
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  totalRows: number;
}

export interface KnowledgeGraphOptions {
  // "per-column" (default) | "composite".
  keyMode?: KGKeyMode;
  // Positive value bounds the source rows used (ORDER BY random() LIMIT n).
  sampleLimit?: number;
  // Node threshold: drop nodes with occurrence strictly below this value.
  minNodeOccurrence?: number;
  // Edge threshold: drop edges with weight strictly below this value.
  minEdgeWeight?: number;
}

const num = (v: unknown): number =>
  typeof v === "bigint" ? Number(v) : (v as number);

const str = (v: unknown): string => String(v);

// Build the SQL source for the __kg subquery: the base query, optionally wrapped
// in a random sample of at most `limit` rows.
const kgSourceSql = async (
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  sampleLimit?: number
): Promise<string> => {
  const baseSql = await dsConn.getSqlForQuery(baseQuery);
  const n = sampleLimit != null && sampleLimit > 0 ? Math.floor(sampleLimit) : 0;
  if (n > 0) {
    return `SELECT * FROM ( ${baseSql} ) AS __kg ORDER BY random() LIMIT ${n}`;
  }
  return baseSql;
};

// Combine the sampled/raw source into the literal used everywhere below.
const srcFrag = (srcSql: string): string => `( ${srcSql} ) AS __kg`;

/**
 * SQL for per-column key node occurrence, one branch per key column.
 */
const perColumnKeyOccSql = (srcSql: string, keyColIds: string[]): string => {
  const branches = keyColIds.map((cid) => {
    const qc = quoteColName(cid);
    return [
      "SELECT 'k' AS __group,",
      `       ${sqlEscapeString(cid)} AS __colid,`,
      `       ${qc} AS __v,`,
      "       count(*) AS __occ",
      `FROM ${srcFrag(srcSql)}`,
      `WHERE ${qc} IS NOT NULL`,
      `GROUP BY ${qc}`,
    ].join("\n");
  });
  return branches.join("\nUNION ALL\n");
};

/**
 * SQL for per-column property node occurrence, one branch per property column.
 */
const perColumnPropOccSql = (srcSql: string, propColIds: string[]): string => {
  const branches = propColIds.map((cid) => {
    const qc = quoteColName(cid);
    return [
      "SELECT 'p' AS __group,",
      `       ${sqlEscapeString(cid)} AS __colid,`,
      `       CAST(${qc} AS VARCHAR) AS __v,`,
      "       count(*) AS __occ",
      `FROM ${srcFrag(srcSql)}`,
      `WHERE ${qc} IS NOT NULL`,
      `GROUP BY CAST(${qc} AS VARCHAR)`,
    ].join("\n");
  });
  return branches.join("\nUNION ALL\n");
};

/**
 * SQL for per-column co-occurrence edges, one branch per key×property pair.
 */
const perColumnEdgeSql = (
  srcSql: string,
  keyColIds: string[],
  propColIds: string[]
): string => {
  const branches: string[] = [];
  for (const kcid of keyColIds) {
    const qk = quoteColName(kcid);
    for (const pcid of propColIds) {
      const qp = quoteColName(pcid);
      branches.push(
        [
          `SELECT ${sqlEscapeString(kcid)} AS __kcol,`,
          `       ${qk} AS __kval,`,
          `       ${sqlEscapeString(pcid)} AS __pcol,`,
          `       CAST(${qp} AS VARCHAR) AS __pval,`,
          "       count(*) AS __w",
          `FROM ${srcFrag(srcSql)}`,
          `WHERE ${qk} IS NOT NULL AND ${qp} IS NOT NULL`,
          `GROUP BY ${qk}, CAST(${qp} AS VARCHAR)`,
        ].join("\n")
      );
    }
  }
  return branches.join("\nUNION ALL\n");
};

// Expression yielding the composite key for a row: the non-null parts of the
// key columns, joined by the SEP control character. Empty strings are also
// treated as absent (NULLIF(CAST(...), '')).
const compositeKeyExp = (keyColIds: string[]): string => {
  const parts = keyColIds.map(
    (cid) => `NULLIF(CAST(${quoteColName(cid)} AS VARCHAR), '')`
  );
  return `concat_ws(chr(${COMP_SEP.charCodeAt(0)}), ${parts.join(", ")})`;
};

/**
 * SQL for composite key node occurrence. Rows where ALL key columns are null
 * produce no node.
 */
const compositeKeyOccSql = (srcSql: string, keyColIds: string[]): string => {
  const keyExp = compositeKeyExp(keyColIds);
  const notAllNull = keyColIds
    .map((cid) => `${quoteColName(cid)} IS NOT NULL`)
    .join(" OR ");
  return [
    `SELECT ${keyExp} AS __v,`,
    "       count(*) AS __occ",
    `FROM ${srcFrag(srcSql)}`,
    `WHERE ${notAllNull}`,
    "GROUP BY __v",
  ].join("\n");
};

/**
 * SQL for composite-mode co-occurrence edges, one branch per property column.
 */
const compositeEdgeSql = (
  srcSql: string,
  keyColIds: string[],
  propColIds: string[]
): string => {
  const keyExp = compositeKeyExp(keyColIds);
  const notAllNull = keyColIds
    .map((cid) => `${quoteColName(cid)} IS NOT NULL`)
    .join(" OR ");
  const branches = propColIds.map((pcid) => {
    const qp = quoteColName(pcid);
    return [
      `SELECT ${keyExp} AS __k,`,
      `       ${sqlEscapeString(pcid)} AS __pcol,`,
      `       CAST(${qp} AS VARCHAR) AS __v,`,
      "       count(*) AS __w",
      `FROM ${srcFrag(srcSql)}`,
      `WHERE (${notAllNull}) AND ${qp} IS NOT NULL`,
      "GROUP BY __k, CAST(" + qp + " AS VARCHAR)",
    ].join("\n");
  });
  return branches.join("\nUNION ALL\n");
};

/**
 * Compute the knowledge-graph data for the given key columns × property columns.
 *
 * Per-column mode (default) creates one key node per distinct non-null value of
 * each key column; composite mode creates one key node per row from the
 * non-null parts of the key columns.
 */
export async function getKnowledgeGraphData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  keyColIds: string[],
  propColIds: string[],
  opts?: KnowledgeGraphOptions
): Promise<KnowledgeGraphData> {
  const {
    keyMode = "per-column",
    sampleLimit,
    minNodeOccurrence = 0,
    minEdgeWeight = 0,
  } = opts ?? {};

  const totalRows = await dsConn.rowCount(baseQuery);

  const nodes: KnowledgeGraphNode[] = [];
  const nodeById = new Map<string, KnowledgeGraphNode>();
  const edges: KnowledgeGraphEdge[] = [];
  const edgeKey = new Map<string, number>();

  const ensureNode = (id: string, group: KGNodeGroup, label: string, colId: string | undefined, occurrence: number): void => {
    const existing = nodeById.get(id);
    if (existing) {
      existing.occurrence += occurrence;
    } else {
      const node: KnowledgeGraphNode = {
        id,
        group,
        label,
        occurrence,
      };
      if (colId !== undefined) {
        node.colId = colId;
      }
      nodeById.set(id, node);
      nodes.push(node);
    }
  };

  const addEdge = (source: string, target: string, weight: number): void => {
    const ek = source + "\u001e" + target;
    const prev = edgeKey.get(ek);
    if (prev !== undefined) {
      edges[prev].weight += weight;
    } else {
      edgeKey.set(ek, edges.length);
      edges.push({ source, target, weight });
    }
  };

  const srcSql = await kgSourceSql(dsConn, baseQuery, sampleLimit);
  const keyOk = keyColIds.length > 0;
  const propOk = propColIds.length > 0;

  if (keyMode === "composite") {
    if (keyOk) {
      const occSql = compositeKeyOccSql(srcSql, keyColIds);
      const occRes: TableRep = await dsConn.evalQuery(sqlQuery(occSql));
      for (const r of occRes.rowData) {
        const composite = str(r.__v);
        ensureNode("k:" + composite, "key", composite.split(COMP_SEP).join(", "), undefined, num(r.__occ));
      }
      if (propOk) {
        const edgeSql = compositeEdgeSql(srcSql, keyColIds, propColIds);
        const edgeRes: TableRep = await dsConn.evalQuery(sqlQuery(edgeSql));
        for (const r of edgeRes.rowData) {
          const composite = str(r.__k);
          const propId = "p:" + str(r.__pcol) + ":" + str(r.__v);
          addEdge("k:" + composite, propId, num(r.__w));
        }
      }
    }
    if (propOk) {
      // Property nodes for composite mode.
      const propOccSql = perColumnPropOccSql(srcSql, propColIds);
      const propOccRes: TableRep = await dsConn.evalQuery(sqlQuery(propOccSql));
      for (const r of propOccRes.rowData) {
        ensureNode(
          "p:" + str(r.__colid) + ":" + str(r.__v),
          "prop",
          str(r.__v),
          str(r.__colid),
          num(r.__occ)
        );
      }
    }
  } else {
    // per-column mode
    if (keyOk) {
      const occSql = perColumnKeyOccSql(srcSql, keyColIds);
      const occRes: TableRep = await dsConn.evalQuery(sqlQuery(occSql));
      for (const r of occRes.rowData) {
        const cid = str(r.__colid);
        ensureNode("k:" + cid + ":" + str(r.__v), "key", str(r.__v), cid, num(r.__occ));
      }
      if (propOk) {
        const edgeSql = perColumnEdgeSql(srcSql, keyColIds, propColIds);
        const edgeRes: TableRep = await dsConn.evalQuery(sqlQuery(edgeSql));
        for (const r of edgeRes.rowData) {
          const kid = "k:" + str(r.__kcol) + ":" + str(r.__kval);
          const pid = "p:" + str(r.__pcol) + ":" + str(r.__pval);
          addEdge(kid, pid, num(r.__w));
        }
      }
    }
    if (propOk) {
      const propOccSql = perColumnPropOccSql(srcSql, propColIds);
      const propOccRes: TableRep = await dsConn.evalQuery(sqlQuery(propOccSql));
      for (const r of propOccRes.rowData) {
        const cid = str(r.__colid);
        ensureNode("p:" + cid + ":" + str(r.__v), "prop", str(r.__v), cid, num(r.__occ));
      }
    }
  }

  // Apply thresholds. Nodes dropped by minNodeOccurrence also drop their edges so
  // the returned graph stays coherent. Edges are further filtered by minEdgeWeight.
  let keptNodes = nodes;
  let keptEdges = edges;
  if (minNodeOccurrence > 0) {
    const keptIds = new Set<string>();
    keptNodes = [];
    for (const n of nodes) {
      if (n.occurrence >= minNodeOccurrence) {
        keptIds.add(n.id);
        keptNodes.push(n);
      }
    }
    keptEdges = keptEdges.filter(
      (e) => keptIds.has(e.source) && keptIds.has(e.target)
    );
  }
  if (minEdgeWeight > 0) {
    keptEdges = keptEdges.filter((e) => e.weight >= minEdgeWeight);
  }

  return { nodes: keptNodes, edges: keptEdges, totalRows };
}
