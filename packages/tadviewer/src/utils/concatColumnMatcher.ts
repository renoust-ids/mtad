/**
 * Utility for automatically generating column mappings for the "Concatenate
 * File" feature. Given the original table's columns/types and the new file's
 * columns/types, it produces an ordered list of ConcatCsvMapping entries that
 * the dialog can present and the user can tweak.
 */

import { ConcatCsvMapping } from "../AppState";

export type ColTypeMap = { [colId: string]: string };

/**
 * Resolve the result SQL type when concatenating a value of type `t1` with a
 * value of type `t2`. The result is the "widest" compatible type; types are
 * normalised to duckdb family before comparison so synonyms (e.g. INTEGER vs
 * INT) collapse onto the same family.
 *
 * Ordering (widest -> narrowest). This is inspired by DuckDB's own casting
 * coercion rules:
 *   VARCHAR  (can absorb anything as text)
 *   TIMESTAMP / DATE / TIME
 *   DOUBLE / FLOAT
 *   BOOLEAN? (kept as-is: concatenating bool+bool stays bool; mixing with a
 *             numeric promotes to the numeric)
 *   INTEGER family (BIGINT/SMALLINT/etc.)
 */
const familyRank: Record<string, number> = {
  VARCHAR: 100,
  TEXT: 100,
  TIMESTAMP: 90,
  DATETIME: 90,
  TIMESTAMPTZ: 90,
  "TIMESTAMP WITH TIME ZONE": 90,
  TIMESTAMP_NS: 90,
  TIMESTAMP_S: 90,
  TIMESTAMP_MS: 90,
  DATE: 88,
  TIME: 87,
  DOUBLE: 70,
  FLOAT: 70,
  REAL: 70,
  DECIMAL: 70,
  BOOLEAN: 60,
  BOOL: 60,
  BIGINT: 50,
  INTEGER: 50,
  SMALLINT: 50,
  TINYINT: 50,
  HUGEINT: 50,
  UBIGINT: 50,
  UINTEGER: 50,
  USMALLINT: 50,
  UTINYINT: 50,
  BLOB: 40,
};

export const normalizeType = (t: string): string => {
  const upper = t.toUpperCase();
  if (upper === "INT" || upper === "INT4" || upper === "SIGNED") return "INTEGER";
  if (upper === "STRING") return "VARCHAR";
  if (upper === "BOOL") return "BOOLEAN";
  if (upper === "FLOAT4") return "FLOAT";
  if (upper === "FLOAT8" || upper === "FLOAT64") return "DOUBLE";
  return upper;
};

const familyOf = (type: string): number => {
  const norm = normalizeType(type);
  const rank = familyRank[norm];
  return rank ?? 0;
};

/**
 * The fixed result SQL type name for a pair of source types.
 * Returns null when the pair should be left as-is (identical types).
 */
export const widenType = (t1: string, t2: string): string | null => {
  const n1 = normalizeType(t1);
  const n2 = normalizeType(t2);
  if (n1 === n2) return null;

  const r1 = familyOf(n1);
  const r2 = familyOf(n2);
  if (r1 === 0 || r2 === 0) return "VARCHAR";
  if (r1 >= r2) return n1;
  return n2;
};

/**
 * Produce an initial ordered list of mappings for the concatenate dialog.
 *
 * Matching strategy:
 *  1. Auto-match columns by case-insensitive name. When a match is found it is
 *     a "matched" mapping; the result type is the widened type between the two
 *     source types.
 *  2. Any original column not matched appears as an "original-only" mapping
 *     (new side contributes NULL).
 *  3. Any new column not matched appears as a "new-only" mapping (original
 *     side contributes NULL).
 *
 * The order is: matched first (in original-table order), then original-only
 * (in original-table order), then new-only (in new-file order).
 */
export const autoMatchMappings = (
  originalCols: ColTypeMap,
  newCols: ColTypeMap
): ConcatCsvMapping[] => {
  // Normalise the original column order, preserving the map's insertion order.
  const originalOrder = Object.keys(originalCols);
  const newOrder = Object.keys(newCols);

  // Lower-cased name -> original colId (first wins on collision)
  const originalByName: Record<string, string> = {};
  for (const cid of originalOrder) {
    const key = cid.toLowerCase();
    if (!(key in originalByName)) originalByName[key] = cid;
  }

  const newByName: Record<string, string> = {};
  for (const cid of newOrder) {
    const key = cid.toLowerCase();
    if (!(key in newByName)) newByName[key] = cid;
  }

  const matched: ConcatCsvMapping[] = [];
  const matchedNewKeys = new Set<string>();
  const matchedOrigKeys = new Set<string>();

  for (const origCid of originalOrder) {
    const key = origCid.toLowerCase();
    const newCid = newByName[key];
    if (newCid != null) {
      matched.push({
        originalCol: origCid,
        newCol: newCid,
        matched: true,
        originalType: originalCols[origCid],
        newType: newCols[newCid],
        castType: widenType(originalCols[origCid], newCols[newCid]),
        nullString: "",
      });
      matchedOrigKeys.add(origCid);
      matchedNewKeys.add(newCid);
    }
  }

  const originalOnly: ConcatCsvMapping[] = [];
  for (const origCid of originalOrder) {
    if (matchedOrigKeys.has(origCid)) continue;
    originalOnly.push({
      originalCol: origCid,
      newCol: "",
      matched: false,
      originalType: originalCols[origCid],
      newType: "",
      castType: null,
      nullString: "",
    });
  }

  const newOnly: ConcatCsvMapping[] = [];
  for (const newCid of newOrder) {
    if (matchedNewKeys.has(newCid)) continue;
    newOnly.push({
      originalCol: "",
      newCol: newCid,
      matched: false,
      originalType: "",
      newType: newCols[newCid],
      castType: null,
      nullString: "",
    });
  }

  return [...matched, ...originalOnly, ...newOnly];
};

/**
 * Convert an ordered list of ConcatCsvMapping into the reltab ConcatCsvArgs
 * outputColumns that the query engine needs.
 */
export const mappingsToOutputColumns = (
  mappings: ConcatCsvMapping[]
): {
  matched: {
    originalCol: string;
    newCol: string;
    castType: string;
    nullString?: string;
  }[];
  originalOnly: { originalCol: string; originalType: string }[];
  newOnly: {
    newCol: string;
    newColType: string;
    nullString?: string;
  }[];
} => {
  const matched: {
    originalCol: string;
    newCol: string;
    castType: string;
    nullString?: string;
  }[] = [];
  const originalOnly: {
    originalCol: string;
    originalType: string;
  }[] = [];
  const newOnly: {
    newCol: string;
    newColType: string;
    nullString?: string;
  }[] = [];

  for (const m of mappings) {
    if (m.matched && m.originalCol && m.newCol) {
      matched.push({
        originalCol: m.originalCol,
        newCol: m.newCol,
        castType: m.castType ?? m.originalType,
        nullString: m.nullString || undefined,
      });
    } else if (m.originalCol) {
      originalOnly.push({
        originalCol: m.originalCol,
        originalType: m.originalType,
      });
    } else if (m.newCol) {
      newOnly.push({
        newCol: m.newCol,
        newColType: m.newType,
        nullString: m.nullString || undefined,
      });
    }
  }

  return { matched, originalOnly, newOnly };
};
