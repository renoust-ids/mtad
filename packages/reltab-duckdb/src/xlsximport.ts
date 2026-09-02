/**
 * Import Excel (.xlsx) workbooks into DuckDB.
 *
 * Uses DuckDB's native read_xlsx (excel extension). Sheet names are enumerated
 * directly from the .xlsx ZIP (xl/workbook.xml) with a small dependency-free
 * ZIP reader, since DuckDB does not expose a workbook/sheet listing function.
 */

import * as fs from "fs";
import * as log from "loglevel";
import * as path from "path";
import * as zlib from "zlib";
import { Connection, Database } from "duckdb-async";
import * as prettyHRTime from "pretty-hrtime";
import { genTableName, mapIdent } from "./csvimport";
import { initS3 } from "./s3utils";

export const excelFileExtensions = ["xlsx"];

const MAXLEN = 16;

/**
 * Parse the ZIP central directory and return an index of entries with the
 * info needed to extract each (local header offset, compression method,
 * compressed size).
 */
const readZipEntries = (
  buf: Buffer
): { [name: string]: { method: number; compSize: number; localOff: number } } => {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error("getXlsxSheetNames: not a valid zip archive");
  }
  const cdCount = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries: { [name: string]: { method: number; compSize: number; localOff: number } } = {};
  for (let n = 0; n < cdCount; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      break;
    }
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    entries[name] = { method, compSize, localOff };
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
};

/**
 * Extract a single entry (as a utf8 string) from a zip buffer.
 */
const extractEntry = (
  buf: Buffer,
  info: { method: number; compSize: number; localOff: number }
): string => {
  if (buf.readUInt32LE(info.localOff) !== 0x04034b50) {
    throw new Error("getXlsxSheetNames: bad local file header");
  }
  const method = buf.readUInt16LE(info.localOff + 8);
  const nameLen = buf.readUInt16LE(info.localOff + 26);
  const extraLen = buf.readUInt16LE(info.localOff + 28);
  const dataOff = info.localOff + 30 + nameLen + extraLen;
  const data = buf.subarray(dataOff, dataOff + info.compSize);
  if (method === 0) {
    return data.toString("utf8"); // stored (uncompressed)
  }
  if (method === 8) {
    return zlib.inflateRawSync(data).toString("utf8"); // deflate
  }
  throw new Error(`getXlsxSheetNames: unsupported compression method ${method}`);
};

/**
 * Return the sheet names of an .xlsx workbook, in workbook order.
 * Reads xl/workbook.xml from the ZIP.
 */
export const getXlsxSheetNames = (filePath: string): string[] => {
  const buf = fs.readFileSync(filePath);
  const entries = readZipEntries(buf);
  const wb = entries["xl/workbook.xml"];
  if (!wb) {
    throw new Error(`getXlsxSheetNames: no xl/workbook.xml in ${filePath}`);
  }
  const xml = extractEntry(buf, wb);
  const sheetNames: string[] = [];
  const re = /<sheet\b[^>]*\bname="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    sheetNames.push(m[1]);
  }
  return sheetNames;
};

/* map a sheet name to a valid SQL table suffix */
const mapSheetIdent = (sheet: string): string => {
  let ident = mapIdent(sheet);
  if (ident.length >= MAXLEN) {
    ident = ident.slice(0, MAXLEN);
  }
  return ident;
};

/* quote a column/table identifier for use in SQL */
const quoteIdent = (s: string): string => '"' + s.replace(/"/g, '""') + '"';

/* SQL for the read_xlsx table function for a given sheet.
 *
 * With allText=false we rely on DuckDB's native type inference (numeric,
 * TIMESTAMP, DATE, TIME, VARCHAR). With allText=true every column is read as
 * VARCHAR, which never fails on mixed columns but renders Excel date/time
 * cells as serial numbers.
 */
const xlsxReadSql = (filePath: string, sheet?: string, allText?: boolean): string => {
  const sheetOption = sheet != null && sheet !== "" ? `, sheet='${sheet}'` : "";
  const allVarchar = allText ? ", all_varchar=true" : "";
  return `read_xlsx('${filePath}'${sheetOption}${allVarchar})`;
};

/**
 * Guess the most specific type for a VARCHAR column by checking which candidate
 * types every non-empty value can be coerced to. Returns a DuckDB type name.
 */
const inferColumnType = async (
  dbConn: Connection,
  stagingTable: string,
  column: string
): Promise<string> => {
  const q = quoteIdent(column);
  const row = await dbConn.all(
    `SELECT
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '') AS nonempty,
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '' AND regexp_full_match(TRIM(${q}), '[+-]?[0-9]+')) AS int_,
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '' AND TRY_CAST(${q} AS DOUBLE) IS NOT NULL) AS dbl,
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '' AND TRY_CAST(${q} AS TIME) IS NOT NULL) AS tm,
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '' AND TRY_CAST(${q} AS TIMESTAMP) IS NOT NULL) AS ts,
       COUNT(*) FILTER (WHERE TRIM(${q}) <> '' AND TRY_CAST(${q} AS DATE) IS NOT NULL) AS dt
     FROM ${stagingTable}`
  );
  const r = row[0];
  const nonempty = Number(r["nonempty"]);
  if (nonempty === 0) {
    return "VARCHAR";
  }
  const allCast = (key: string): boolean => Number(r[key]) === nonempty;
  if (allCast("int_")) return "INTEGER";
  if (allCast("dbl")) return "DOUBLE";
  if (allCast("tm")) return "TIME";
  if (allCast("ts")) return "TIMESTAMP";
  if (allCast("dt")) return "DATE";
  return "VARCHAR";
};

/**
 * Fallback import used when DuckDB's native read_xlsx type inference fails (a
 * mixed column, e.g. mostly numeric with a stray string cell). The sheet is
 * staged as text and each column is type-inferred from its values.
 */
const importWithInference = async (
  dbConn: Connection,
  tableName: string,
  filePath: string,
  sheet?: string
): Promise<void> => {
  const staged = tableName + "_staging";
  await dbConn.all(
    `CREATE OR REPLACE TABLE ${staged} AS SELECT * FROM ${xlsxReadSql(filePath, sheet, true)}`
  );

  const colsRes = await dbConn.all(`DESCRIBE ${staged}`);
  const columns = colsRes.map((r) => r["column_name"] as string);

  const selectList: string[] = [];
  for (const c of columns) {
    const q = quoteIdent(c);
    const type = await inferColumnType(dbConn, staged, c);
    const picked =
      type === "VARCHAR" ? `${q}` : `TRY_CAST(${q} AS ${type})`;
    selectList.push(
      `CASE WHEN TRIM(${q}) = '' THEN NULL ELSE ${picked} END AS ${q}`
    );
  }

  await dbConn.all(
    `CREATE OR REPLACE TABLE ${tableName} AS SELECT ${selectList.join(", ")} FROM ${staged}`
  );
  await dbConn.all(`DROP TABLE IF EXISTS ${staged}`);
};

/**
 * Return the column names of a workbook sheet (first sheet if sheet omitted),
 * as inferred by DuckDB's read_xlsx.
 */
export const getXlsxSheetColumns = async (
  db: Database,
  filePath: string,
  sheet?: string
): Promise<string[]> => {
  const dbConn: Connection = await db.connect();
  const sql = `DESCRIBE SELECT * FROM ${xlsxReadSql(filePath, sheet, false)}`;
  const res = await dbConn.all(sql);
  return res.map((r) => r["column_name"] as string);
};

/**
 * Native import of an .xlsx workbook sheet into a DuckDB table using DuckDB's
 * read_xlsx. DuckDB's type inference is used when possible (numeric, TIMESTAMP,
 * DATE, TIME); if a mixed column makes inference fail, the sheet is re-read as
 * text and each column's type is guessed from its values.
 */
export const nativeXLSXImport = async (
  db: Database,
  filePath: string,
  sheet?: string,
  tableName?: string
): Promise<string> => {
  const importStart = process.hrtime();

  const dbConn: Connection = await db.connect();
  await initS3(dbConn);
  if (!tableName) {
    tableName = genTableName(filePath);
    if (sheet != null && sheet !== "") {
      tableName = tableName + "_" + mapSheetIdent(sheet);
    }
  }

  try {
    const query = `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM ${xlsxReadSql(filePath, sheet, false)}`;
    await dbConn.all(query);
  } catch (err) {
    console.log(
      "caught exception while importing xlsx (retrying as text + inference): ",
      err
    );
    try {
      await importWithInference(dbConn, tableName, filePath, sheet);
    } catch (inferErr) {
      console.log("caught exception while inferring xlsx types: ", inferErr);
      throw inferErr;
    }
  }
  const importTime = process.hrtime(importStart);
  log.info(
    "DuckDB nativeXLSXImport: import completed in ",
    prettyHRTime(importTime)
  );

  return tableName;
};
