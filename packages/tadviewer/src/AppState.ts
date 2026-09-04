import * as Immutable from "immutable";
import { ViewState } from "./ViewState";
import * as reltab from "reltab";
import { DataSourcePath, DataSourceId } from "reltab";
import { Timer } from "./Timer";
import { Activity } from "./components/defs";
/**
 * Immutable representation of application state
 *
 * Just a single view in a single untabbed window for now.
 */

export type ExportFormat = "csv" | "parquet";

export interface ParquetExportOptions {
  compression: "uncompressed" | "snappy" | "gzip" | "zstd";
}

export const defaultParquetExportOptions: ParquetExportOptions = {
  compression: "snappy",
};

export type CsvJoinType = "inner" | "left" | "right" | "outer";

export interface JoinCsvDialogState {
  open: boolean;
  csvPath: string | null;
  leftColumns: string[];
  rightColumns: string[];
  // Workbooks (.xlsx) can expose multiple sheets; sheets lists them and sheet
  // holds the currently selected one ("" for non-workbook files).
  sheets: string[];
  sheet: string;
  leftCol: string;
  rightCol: string;
  joinType: CsvJoinType;
  forceStringCast: boolean;
  nullString: string;
}

const defaultJoinCsvDialogState: JoinCsvDialogState = {
  open: false,
  csvPath: null,
  leftColumns: [],
  rightColumns: [],
  sheets: [],
  sheet: "",
  leftCol: "",
  rightCol: "",
  joinType: "inner",
  forceStringCast: true,
  nullString: "",
};

// A column mapping entry in the concatenate dialog.
export interface ConcatCsvMapping {
  // column in the current (original) table, or "" if new-only
  originalCol: string;
  // column in the new file, or "" if original-only
  newCol: string;
  // whether the current entry maps two columns together (matched)
  matched: boolean;
  originalType: string;
  newType: string;
  // the resulting SQL type name after any cast
  castType: string | null;
  // per-column null string sentinel (empty = none)
  nullString: string;
}

export interface ConcatCsvDialogState {
  open: boolean;
  csvPath: string | null;
  // Columns of the original (current) table: { colId: sqlTypeName }
  originalColumns: { [colId: string]: string };
  // Columns of the new file: { colId: sqlTypeName }
  newColumns: { [colId: string]: string };
  sheets: string[];
  sheet: string;
  // ordered list of column mappings (drives the final output column order)
  mappings: ConcatCsvMapping[];
  // keeps track of the original + new columns so we know what's left unmapped
  loaded: boolean;
}

const defaultConcatCsvDialogState: ConcatCsvDialogState = {
  open: false,
  csvPath: null,
  originalColumns: {},
  newColumns: {},
  sheets: [],
  sheet: "",
  mappings: [],
  loaded: false,
};

export interface AppStateProps {
  initialized: boolean; // Has main process initialization completed?

  windowTitle: string; // Usually just the table name or file name

  rtc: reltab.ReltabConnection | null;

  viewState: ViewState | null;
  exportBeginDialogOpen: boolean;
  exportProgressDialogOpen: boolean;
  exportFormat: ExportFormat;
  exportPath: string;
  exportPathBaseName: string;
  exportPercent: number;
  exportVisibleOnly: boolean;
  exportColumnOrder: boolean;

  viewConfirmDialogOpen: boolean;
  viewConfirmSourcePath: DataSourcePath | null;

  joinCsvDialog: JoinCsvDialogState;

  concatCsvDialog: ConcatCsvDialogState;

  histogramDialogColId: string | null;

  splomDialogOpen: boolean;

  scatterPlotDialogOpen: boolean;

  // XY pair the Scatter Plot dialog should be pre-seeded with (set when a
  // non-diagonal SPLOM cell is clicked to open that pair as a Scatter Plot).
  scatterXColId: string | null;
  scatterYColId: string | null;

  confusionMatrixDialogOpen: boolean;

  correlationMatrixDialogOpen: boolean;

  appLoadingTimer: Timer;
  activity: Activity;
  showRecordCount: boolean;
}

const defaultAppStateProps: AppStateProps = {
  initialized: false,
  windowTitle: "",
  rtc: null,
  viewState: null,
  exportBeginDialogOpen: false,
  exportProgressDialogOpen: false,
  exportFormat: "parquet",
  exportPath: "",
  exportPathBaseName: "",
  exportPercent: 0,
  exportVisibleOnly: true,
  exportColumnOrder: true,
  viewConfirmDialogOpen: false,
  viewConfirmSourcePath: null,
  joinCsvDialog: defaultJoinCsvDialogState,
  concatCsvDialog: defaultConcatCsvDialogState,
  histogramDialogColId: null,
  splomDialogOpen: false,
  scatterPlotDialogOpen: false,
  scatterXColId: null,
  scatterYColId: null,
  confusionMatrixDialogOpen: false,
  correlationMatrixDialogOpen: false,
  appLoadingTimer: new Timer(),
  activity: "None",
  showRecordCount: true,
};

export class AppState extends Immutable.Record(defaultAppStateProps) {
  public readonly initialized!: boolean; // Has main process initialization completed?

  public readonly windowTitle!: string; // Usually just the table name or file name

  public readonly rtc!: reltab.ReltabConnection;

  public readonly viewState!: ViewState;
  public readonly exportBeginDialogOpen!: boolean;
  public readonly exportProgressDialogOpen!: boolean;
  public readonly exportFormat!: ExportFormat;
  public readonly exportPath!: string;
  public readonly exportPathBaseName!: string;
  public readonly exportPercent!: number;
  public readonly exportVisibleOnly!: boolean;
  public readonly exportColumnOrder!: boolean;
  public readonly viewConfirmDialogOpen!: boolean;
  public readonly viewConfirmSourcePath!: DataSourcePath | null;
  public readonly joinCsvDialog!: JoinCsvDialogState;
  public readonly concatCsvDialog!: ConcatCsvDialogState;
  public readonly histogramDialogColId!: string | null;
  public readonly splomDialogOpen!: boolean;
  public readonly scatterPlotDialogOpen!: boolean;
  public readonly scatterXColId!: string | null;
  public readonly scatterYColId!: string | null;
  public readonly confusionMatrixDialogOpen!: boolean;
  public readonly correlationMatrixDialogOpen!: boolean;
  public readonly appLoadingTimer!: Timer;
  public readonly activity!: Activity;
  public readonly showRecordCount!: boolean;
}
