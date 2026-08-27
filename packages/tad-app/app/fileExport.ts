import * as reltab from "reltab";
import * as csv from "fast-csv";
import * as fs from "fs";
import { BrowserWindow, dialog } from "electron";
import { DbDataSource } from "reltab";
import { ExportFormat, ParquetExportOptions } from "tadviewer";
import path from "path";

export const openExportBeginDialog = async (
  win: BrowserWindow,
  filterRowCount: number,
  query: reltab.QueryExp
) => {
  win.webContents.send("open-export-begin-dialog", {
    openState: true,
    filterRowCount,
  });
};

export const exportFile = async (
  win: BrowserWindow,
  exportFormat: ExportFormat,
  exportPath: string,
  filterRowCount: number,
  query: reltab.QueryExp,
  parquetExportOptions: ParquetExportOptions,
  exportVisibleOnly: boolean = true,
  exportColumnOrder: boolean = true,
  displayColumns: string[] = []
) => {
  if (exportFormat === "csv") {
    return exportCSV(win, exportPath, filterRowCount, query, exportVisibleOnly, exportColumnOrder, displayColumns);
  } else if (exportFormat === "parquet") {
    return exportParquet(win, exportPath, query, parquetExportOptions, exportVisibleOnly, exportColumnOrder, displayColumns);
  } else {
    console.error("Unsupported export format: ", exportFormat);
  }
};

const exportParquet = async (
  win: BrowserWindow,
  saveFilename: string,
  query: reltab.QueryExp,
  parquetExportOptions: ParquetExportOptions,
  exportVisibleOnly: boolean = true,
  exportColumnOrder: boolean = true,
  displayColumns: string[] = []
) => {
  let exportPercent = 0;
  const exportPathBaseName = path.basename(saveFilename);
  win.webContents.send("open-export-progress-dialog", {
    openState: true,
    exportPathBaseName,
    exportPercent,
  });

  try {
    const appRtc = reltab.getExportConnection() as DbDataSource;

    const baseQuery = await appRtc.getSqlForQuery(query);

    // Build SELECT with specific columns if needed
    let selectQuery: string;
    if (exportVisibleOnly && displayColumns.length > 0) {
      const colList = displayColumns.map((c) => `"${c}"`).join(", ");
      selectQuery = `SELECT ${colList} FROM (${baseQuery})`;
    } else if (exportColumnOrder && displayColumns.length > 0) {
      const schema = await appRtc.getSchema(query);
      const schemaSet = new Set(schema.columns);
      const ordered = displayColumns.filter((cid) => schemaSet.has(cid));
      const remaining = schema.columns.filter((cid) => !displayColumns.includes(cid));
      const allCols = [...ordered, ...remaining];
      const colList = allCols.map((c) => `"${c}"`).join(", ");
      selectQuery = `SELECT ${colList} FROM (${baseQuery})`;
    } else {
      selectQuery = baseQuery;
    }

    const copyQuery = `COPY (${selectQuery}) TO '${saveFilename}' (FORMAT 'parquet', COMPRESSION '${parquetExportOptions.compression}')`;

    const rows = await appRtc.db.runSqlQuery(copyQuery);
  } catch (rawErr) {
    const err = rawErr as Error;
    win.webContents.send("close-export-progress-dialog");

    dialog.showErrorBox("Error saving file: ", err.toString());
  }
  win.webContents.send("export-progress", {
    percentComplete: 1,
  });
};

// maximum number of items outstanding before pause and commit:
// Some studies of sqlite found this number about optimal
const BATCHSIZE = 10000;
const exportCSV = async (
  win: BrowserWindow,
  saveFilename: string,
  filterRowCount: number,
  query: reltab.QueryExp,
  exportVisibleOnly: boolean = true,
  exportColumnOrder: boolean = true,
  displayColumns: string[] = []
) => {
  let exportPercent = 0;
  const exportPathBaseName = path.basename(saveFilename);

  win.webContents.send("open-export-progress-dialog", {
    openState: true,
    exportPathBaseName,
    exportPercent,
  });
  const csvStream = csv.format({
    headers: true,
  });
  const writableStream = fs.createWriteStream(saveFilename);
  csvStream.pipe(writableStream);
  const appRtc = reltab.getExportConnection() as DbDataSource;
  if (appRtc == null) {
    console.error("exportCSV: no DataSource available for export");
    return;
  }

  const schema = await appRtc.getSchema(query);

  // Determine which columns to export and in what order
  let exportColumns: string[];
  if (exportVisibleOnly && displayColumns.length > 0) {
    // Filter to only visible columns present in the schema
    exportColumns = displayColumns.filter((cid) => schema.columns.includes(cid));
  } else if (exportColumnOrder && displayColumns.length > 0) {
    // Use display order but include all schema columns
    const schemaSet = new Set(schema.columns);
    const ordered = displayColumns.filter((cid) => schemaSet.has(cid));
    const remaining = schema.columns.filter((cid) => !displayColumns.includes(cid));
    exportColumns = [...ordered, ...remaining];
  } else {
    exportColumns = schema.columns;
  }

  const mapRow = (row: reltab.Row) => {
    return exportColumns.map((cid) => {
      const ct = schema.columnType(cid);
      const val = row[cid];
      const formatted = ct ? ct.stringRender(val) : String(val ?? "");
      return [schema.displayName(cid), formatted];
    });
  };

  let offset = 0;
  let percentComplete = 0;

  while (offset < filterRowCount) {
    let limit = Math.min(BATCHSIZE, filterRowCount - offset);
    let res = await appRtc.evalQuery(query, offset, limit);
    res.rowData.map((row) => {
      csvStream.write(mapRow(row));
    });
    offset += res.rowData.length;
    percentComplete = offset / filterRowCount;
    win.webContents.send("export-progress", {
      percentComplete,
    });
  }

  csvStream.end();
  win.webContents.send("export-progress", {
    percentComplete: 1,
  });
};
