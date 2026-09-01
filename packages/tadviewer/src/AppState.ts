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
  leftCol: "",
  rightCol: "",
  joinType: "inner",
  forceStringCast: true,
  nullString: "",
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

  histogramDialogColId: string | null;

  splomDialogOpen: boolean;

  scatterPlotDialogOpen: boolean;

  // XY pair the Scatter Plot dialog should be pre-seeded with (set when a
  // non-diagonal SPLOM cell is clicked to open that pair as a Scatter Plot).
  scatterXColId: string | null;
  scatterYColId: string | null;

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
  histogramDialogColId: null,
  splomDialogOpen: false,
  scatterPlotDialogOpen: false,
  scatterXColId: null,
  scatterYColId: null,
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
  public readonly histogramDialogColId!: string | null;
  public readonly splomDialogOpen!: boolean;
  public readonly scatterPlotDialogOpen!: boolean;
  public readonly scatterXColId!: string | null;
  public readonly scatterYColId!: string | null;
  public readonly appLoadingTimer!: Timer;
  public readonly activity!: Activity;
  public readonly showRecordCount!: boolean;
}
