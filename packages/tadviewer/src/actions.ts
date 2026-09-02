import { ViewParams } from "./ViewParams";
import { ViewState, CellEditState } from "./ViewState";
import {
  AppState,
  ExportFormat,
  CsvJoinType,
  JoinCsvDialogState,
} from "./AppState";
import * as reltab from "reltab";
import { Activity, ColumnListTypes } from "./components/defs";
import { ScatterAxisFilterArg } from "./components/categoricalAxis";
import { Path, PathTree } from "aggtree";
import * as aggtree from "aggtree";
import { StateRef, update, mutableGet, awaitableUpdate_ } from "oneref";
import log from "loglevel";
import {
  DataSourcePath,
  DataSourceId,
  resolvePath,
  DataSourceConnection,
  and,
  col,
  constVal,
  NumericColumnHistogramData,
  SubExp,
  FilterExp,
  UnaryRelExp,
} from "reltab";
import * as util from "./util";
import { QueryView } from "./QueryView";

export async function initAppState(
  rtc: reltab.ReltabConnection,
  stateRef: StateRef<AppState>
): Promise<void> {
  const st = await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState =>
      st.set("rtc", rtc).set("initialized", true) as AppState
  );
  console.log("initAppState: st: ", st.toJS());
}

export async function setActivity(
  activity: Activity,
  stateRef: StateRef<AppState>
) {
  await awaitableUpdate_(
    stateRef,
    (st: AppState) => st.set("activity", activity) as AppState
  );
}

export async function startAppLoadingTimer(
  stateRef: StateRef<AppState>
): Promise<void> {
  // hard to precisely type the path-dependent type of pathUpdater, so use any
  const ltUpdater = util.pathUpdater(stateRef, ["appLoadingTimer"]) as any;
  update(
    stateRef,
    (st: AppState): AppState =>
      st.set(
        "appLoadingTimer",
        st.appLoadingTimer.run(200, ltUpdater)
      ) as AppState
  );
}

export async function stopAppLoadingTimer(
  stateRef: StateRef<AppState>
): Promise<void> {
  update(
    stateRef,
    (st: AppState): AppState =>
      st.set("appLoadingTimer", st.appLoadingTimer.stop()) as AppState
  );
}

// replace current view in AppState with a query on the specified
// dataSource
export const setQueryView = async (
  stateRef: StateRef<AppState>,
  dsc: DataSourceConnection,
  sqlQuery: string,
  showColumnHistograms: boolean
): Promise<void> => {
  const appState = mutableGet(stateRef);

  // console.log("replaceCurrentView: queryTableName: ", dsPath, queryTableName);

  const baseQuery = reltab.sqlQuery(sqlQuery);
  const baseSchema = await aggtree.getBaseSchema(
    dsc,
    baseQuery,
    appState.showRecordCount
  );

  // start off with all columns displayed:
  const displayColumns = baseSchema.columns.slice();

  const openPaths = new PathTree();
  const initialViewParams = new ViewParams({
    displayColumns,
    openPaths,
    showColumnHistograms,
  });

  const viewState = new ViewState({
    dbc: dsc,
    baseSchema,
    baseQuery,
    viewParams: initialViewParams,
    initialViewParams,
  });

  // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables

  await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewState) as AppState
  );
};

export const replaceCurrentView = async (
  dsPath: DataSourcePath,
  stateRef: StateRef<AppState>,
  viewParams?: ViewParams
): Promise<void> => {
  console.log("*** replaceCurrentView: dsPath: ", dsPath);
  const appState = mutableGet(stateRef);

  const targetNode = await resolvePath(appState.rtc, dsPath);
  if (targetNode.isContainer) {
    await setActivity("DataSource", stateRef);
    return;
  }

  const dbc = await appState.rtc.connect(dsPath.sourceId);

  const { path } = dsPath;
  const baseTableName = path[path.length - 1];

  const windowTitle = baseTableName;

  const queryTableName = await dbc.getTableName(dsPath);

  // console.log("replaceCurrentView: queryTableName: ", dsPath, queryTableName);

  const baseQuery = reltab.tableQuery(queryTableName);
  const baseSchema = await aggtree.getBaseSchema(
    dbc,
    baseQuery,
    appState.showRecordCount
  );

  // start off with all columns displayed (excluding internal _-prefixed cols):
  const displayColumns = baseSchema.columns.filter(
    (cid) => !cid.startsWith("_") && cid !== "Rec"
  );

  const openPaths = new PathTree();
  if (!viewParams) {
    viewParams = new ViewParams({
      displayColumns,
      openPaths,
    });
  }
  const initialViewParams = viewParams;

  const viewState = new ViewState({
    dbc,
    dsPath,
    baseSchema,
    baseQuery,
    viewParams,
    initialViewParams,
  });

  // We explicitly set rather than merge() because merge
  // will attempt to deep convert JS objects to Immutables

  await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewState) as AppState
  );
};

export const openDataSourcePath = async (
  path: DataSourcePath,
  stateRef: StateRef<AppState>,
  viewParams?: ViewParams
): Promise<void> => {
  const appState = mutableGet(stateRef);

  const modifiedViewParams =
    appState.viewState?.viewParams !== appState.viewState?.initialViewParams;

  if (modifiedViewParams) {
    setViewConfirmDialogOpen(true, path, stateRef);
  } else {
    try {
      await startAppLoadingTimer(stateRef);
      await replaceCurrentView(path, stateRef, viewParams);
    } finally {
      stopAppLoadingTimer(stateRef);
    }
  }
};

// helper to hoist a ViewParams => ViewParams fn to an AppState => AppState
// Always resets the viewport
const vpUpdate =
  (f: (vp: ViewParams) => ViewParams) =>
  (s: AppState): AppState =>
    s.updateIn(["viewState", "viewParams"], (vpu: unknown) =>
      f(vpu as ViewParams)
    ) as AppState;

export const toggleShown = (
  cid: string,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.toggleShown(cid))
  );
};
export const toggleAllShown = (stateRef: StateRef<AppState>): void => {
  update(stateRef, (s) => {
    const schema = s.viewState.baseSchema;
    const viewParams = s.viewState.viewParams;
    const allShown = schema.columns.length === viewParams.displayColumns.length;
    const nextDisplayColumns = allShown ? [] : schema.columns;
    return vpUpdate(
      (viewParams) =>
        viewParams.set("displayColumns", nextDisplayColumns) as ViewParams
    )(s);
  });
};
export const togglePivot = (
  cid: string,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.togglePivot(cid))
  );
};
export const toggleSort = (cid: string, stateRef: StateRef<AppState>): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.toggleSort(cid))
  );
};
export const setSortDir = (
  cid: string,
  asc: boolean,
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setSortDir(cid, asc))
  );
};
export const toggleShowRoot = (stateRef: StateRef<AppState>): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("showRoot", !viewParams.showRoot) as ViewParams
    )
  );
};
export const setShowColumnHistograms = (
  stateRef: StateRef<AppState>,
  showColumnHistograms: boolean
): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set(
          "showColumnHistograms",
          showColumnHistograms
        ) as ViewParams
    )
  );
};
export const toggleShowColumnHistograms = (
  stateRef: StateRef<AppState>
): void => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set(
          "showColumnHistograms",
          !viewParams.showColumnHistograms
        ) as ViewParams
    )
  );
};

export const reorderColumnList = (dstProps: any, srcProps: any) => {
  console.log("reorderColumnList: ", dstProps, srcProps);

  if (dstProps.columnListType !== srcProps.columnListType) {
    console.log("mismatched column list types, ignoring...");
    return;
  }

  const fieldKey = dstProps.columnListType;
  const isSortKey = fieldKey === ColumnListTypes.SORT;
  update(
    dstProps.stateRef,
    vpUpdate((viewParams) => {
      let colList = viewParams.get(fieldKey).slice();

      if (isSortKey) {
        const srcSortKey = srcProps.rowData;
        const srcIndex = colList.findIndex((k: any) => k[0] === srcSortKey[0]);

        if (srcIndex === -1) {
          return viewParams;
        } // remove source from its current position:

        colList.splice(srcIndex, 1);
        const dstSortKey = dstProps.rowData;
        const dstIndex = colList.findIndex((k: any) => k[0] === dstSortKey[0]);

        if (dstIndex === -1) {
          return viewParams;
        }

        colList.splice(dstIndex, 0, srcSortKey);
        return viewParams.set(fieldKey, colList) as ViewParams;
      } else {
        const srcColumnId = srcProps.rowData;
        const srcIndex = colList.indexOf(srcColumnId);

        if (srcIndex === -1) {
          return viewParams;
        } // remove source from its current position:

        colList.splice(srcIndex, 1);
        const dstColumnId = dstProps.rowData;
        const dstIndex = colList.indexOf(dstColumnId);

        if (dstIndex === -1) {
          return viewParams;
        }

        colList.splice(dstIndex, 0, srcColumnId);

        if (fieldKey === "vpivots") {
          // evil hack
          return viewParams.setVPivots(colList);
        } else {
          return viewParams.set(fieldKey, colList) as ViewParams;
        }
      }
    })
  );
};
/*
 * single column version of setting sort key
 * (until we implement compound sort keys)
 */

export const setSortKey = (
  sortKey: Array<[string, boolean]>,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (st: AppState): AppState => {
    const nextSt = vpUpdate(
      (viewParams) => viewParams.set("sortKey", sortKey) as ViewParams
    )(st);
    return nextSt;
  });
};

export const setColumnOrder = (
  displayColumns: Array<string>,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("displayColumns", displayColumns) as ViewParams
    )
  );
};

export const openPath = (path: Path, stateRef: StateRef<AppState>) => {
  log.info("openPath: opening path: ", path);
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.openPath(path))
  );
};

export const closePath = (path: Path, stateRef: StateRef<AppState>) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.closePath(path))
  );
};

export const setAggFn = (
  cid: string,
  aggFn: reltab.AggFn,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setAggFn(cid, aggFn))
  );
};

export const updateViewport = (
  top: number,
  bottom: number,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (st) =>
      st.update(
        "viewState",
        (vs) =>
          vs!.set("viewportTop", top).set("viewportBottom", bottom) as ViewState
      ) as AppState
  );
};

export const setDefaultFormatOptions = (
  colType: string,
  opts: any,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.setIn(["defaultFormats", colType], opts) as ViewParams
    )
  );
};

export const setColumnFormatOptions = (
  cid: string,
  opts: any,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.setColumnFormat(cid, opts))
  );
};

export const setShowHiddenCols = (
  show: boolean,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) => viewParams.set("showHiddenCols", show) as ViewParams
    )
  );
};

export const setExportBeginDialogOpen = (
  openState: boolean,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportBeginDialogOpen", openState));
};

export const setExportProgressDialogOpen = (
  openState: boolean,
  exportPathBaseName: string,
  stateRef: StateRef<AppState>
) => {
  console.log("exportProgressDialogOpen: ", exportPathBaseName);
  update(
    stateRef,
    (s) =>
      s
        .set("exportProgressDialogOpen", openState)
        .set("exportPathBaseName", exportPathBaseName) as AppState
  );
};
export const setExportFormat = (
  exportFormat: ExportFormat,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportFormat", exportFormat));
};

export const setExportPath = (
  exportPath: string,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportPath", exportPath));
};

export const setViewConfirmDialogOpen = (
  openState: boolean,
  path: DataSourcePath | null,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (s) =>
      s
        .set("viewConfirmDialogOpen", openState)
        .set("viewConfirmSourcePath", path) as AppState
  );
};

export const setExportProgress = (
  percentComplete: number,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportPercent", percentComplete) as AppState);
};

export const setExportVisibleOnly = (
  visibleOnly: boolean,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportVisibleOnly", visibleOnly) as AppState);
};

export const setExportColumnOrder = (
  columnOrder: boolean,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) => s.set("exportColumnOrder", columnOrder) as AppState);
};

export const setFilter = (
  fe: reltab.FilterExp,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate((viewParams) => viewParams.set("filterExp", fe) as ViewParams)
  );
};

// Convert a numeric epoch-second value (as produced by the temporal
// histogram machinery) to a string literal comparable with the raw temporal
// column of the given kind.
const epochToTemporalString = (kind: reltab.ColumnKind, epochSec: number): string => {
  const d = new Date(epochSec * 1000);
  if (kind === "date") {
    return d.toISOString().slice(0, 10);
  }
  if (kind === "time") {
    return d.toISOString().slice(11, 19);
  }
  return d.toISOString().slice(0, 19);
};

// --- Common analytics-filter entry point for Views (Distribution, Scatter) ---
//
// Every 2D visualization that lets the user "select" elements (brushing a
// scatter, brushing a histogram, clicking categorical bars) funnels its result
// through setAnalyticsClauses below. Requirements that motivate this single
// code path:
//   1. Selections APPEND to the current analytics filter (an AND of all
//      clauses), replacing only the clauses for the columns being (re)selected
//      while preserving criteria from other Views.
//   2. Views only ever write the ANALYTICS filter (analyticsFilterExp); the
//      TABLE filter (filterExp) is written solely by manual editing in the
//      footer editor.
//
// A single per-column constraint to append. `add` appends that column's new
// clauses onto the given AND filter.
export interface AnalyticsConstraint {
  colId: string;
  add: (fe: reltab.FilterExp) => reltab.FilterExp;
}

// Numeric/temporal range constraint (>= lo AND <= hi). Temporal columns store
// epoch-second values but the filter references the raw column with a typed
// literal (DATE/TIMESTAMP), which DuckDB casts in comparisons. Returns null for
// a null range (i.e. "no constraint" for this axis).
const mkRangeConstraint = (
  kind: reltab.ColumnKind,
  colId: string,
  range: [number, number] | null
): AnalyticsConstraint | null => {
  if (range == null) {
    return null;
  }
  return {
    colId,
    add: (fe) => {
      const lhs = col(colId);
      if (reltab.isTemporalKind(kind)) {
        return fe
          .ge(lhs, constVal(epochToTemporalString(kind, range[0])))
          .le(lhs, constVal(epochToTemporalString(kind, range[1])));
      }
      return fe.ge(lhs, constVal(range[0])).le(lhs, constVal(range[1]));
    },
  };
};

// Categorical constraint (IN values, optionally plus IS NULL). Returns null
// when neither values nor includeNull are set (i.e. the column's filter is only
// being cleared).
const mkValuesConstraint = (
  colId: string,
  values: string[] | null,
  includeNull?: boolean
): AnalyticsConstraint | null => {
  const hasValues = values != null && values.length > 0;
  const hasNull = includeNull === true;
  if (!hasValues && !hasNull) {
    return null;
  }
  return {
    colId,
    add: (fe) => {
      let nfe: reltab.FilterExp = fe;
      if (hasValues) {
        nfe = nfe.chainBinRelExp(
          "IN",
          col(colId),
          constVal(values as unknown as reltab.Scalar)
        );
      }
      if (hasNull) {
        nfe = nfe.isNull(col(colId));
      }
      return nfe;
    },
  };
};

// Build the constraint for a scatter-axis argument (range for numeric/temporal,
// values for categorical).
const mkAxisArgConstraint = (
  appState: AppState,
  arg: ScatterAxisFilterArg
): AnalyticsConstraint | null => {
  const kind = appState.viewState.baseSchema.columnType(arg.colId).kind;
  if (arg.values != null) {
    return mkValuesConstraint(arg.colId, arg.values);
  }
  return mkRangeConstraint(kind, arg.colId, arg.range ?? null);
};

// Common entry point for all View-derived analytics filters. Cleans up any
// prior clauses on the given columns, then appends the new constraints to the
// existing analytics filter (AND), preserving clauses for other columns.
export const setAnalyticsClauses = (
  cleanColIds: string[],
  constraints: AnalyticsConstraint[],
  stateRef: StateRef<AppState>
) => {
  const appState = mutableGet(stateRef);
  const prevFE = appState.viewState.viewParams.analyticsFilterExp;
  if (prevFE != null && prevFE.op !== "AND") {
    log.info(
      "setAnalyticsClauses: unexpected structure for current filter expression, ignoring"
    );
    return;
  }
  let baseFE = prevFE == null ? and() : prevFE;
  for (const cid of cleanColIds) {
    baseFE = filterExpWithoutCol(baseFE, cid);
  }
  let nextFE = baseFE;
  for (const c of constraints) {
    nextFE = c.add(nextFE);
  }
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("analyticsFilterExp", nextFE) as ViewParams
    )
  );
};

export const setHistogramBrushFilter = (
  colId: string,
  range: [number, number] | null,
  stateRef: StateRef<AppState>
) => {
  if (range === null) {
    return;
  }
  const appState = mutableGet(stateRef);
  const kind = appState.viewState.baseSchema.columnType(colId).kind;
  const constraint = mkRangeConstraint(kind, colId, range);
  setAnalyticsClauses(
    [colId],
    constraint != null ? [constraint] : [],
    stateRef
  );
};

export const setHistogramBrushRange = (
  colId: string,
  range: [number, number] | null,
  stateRef: StateRef<AppState>
) => {
  if (range !== null) {
    update(
      stateRef,
      (st: AppState): AppState =>
        st.updateIn(["viewState", "queryView"], (qvu: unknown) => {
          const oldQueryView = qvu as QueryView;
          const oldHistData = oldQueryView.histoMap[colId];
          const newHistData: NumericColumnHistogramData = {
            ...oldHistData,
            brushMinVal: range[0],
            brushMaxVal: range[1],
          };
          const newHistoMap = {
            ...oldQueryView.histoMap,
            [colId]: newHistData,
          };
          const newQueryView = oldQueryView.set("histoMap", newHistoMap);
          return newQueryView;
        }) as AppState
    );
  }
};

/*
 * TODO: dead code?
export const ensureDistinctColVals = (colId: string, stateRef: StateRef<AppState>) => {
  update(stateRef, appState => {
    const updSet = appState.requestedColumnVals.add(colId);
    return appState.set("requestedColumnVals", updSet);
  });
};
*/

// --- Column Histogram Dialog Actions ---

export type ColumnHistogramData =
  | reltab.NumericColumnHistogramData
  | reltab.CategoricalDistributionData;

// Open the column histogram dialog for a column.
export const openColumnHistogram = (
  colId: string,
  stateRef: StateRef<AppState>
) => {
  const app = mutableGet(stateRef);
  if (app.viewState == null) {
    return;
  }
  update(stateRef, (s) => s.set("histogramDialogColId", colId) as AppState);
};

export const closeColumnHistogram = (stateRef: StateRef<AppState>) => {
  update(stateRef, (s) => s.set("histogramDialogColId", null) as AppState);
};

// Remove all filter clauses that reference colId from a filter expression.
// Mirrors the cleanup logic in setHistogramBrushFilter but also handles
// unary (IS NULL / NOT NULL) clauses.
export const filterExpWithoutCol = (
  baseFE: FilterExp,
  colId: string
): FilterExp => {
  const cleanedArgs = baseFE.opArgs.filter((subExp: SubExp) => {
    if (subExp.expType === "UnaryRelExp") {
      const arg = (subExp as UnaryRelExp).arg;
      if (arg.expType === "ColRef" && arg.colName === colId) {
        return false;
      }
      return true;
    }
    if (subExp.expType === "BinRelExp") {
      const lhs = (subExp as reltab.BinRelExp).lhs;
      if (lhs.expType === "ColRef" && lhs.colName === colId) {
        return false;
      }
      return true;
    }
    return true;
  });
  return new FilterExp("AND", cleanedArgs);
};

// Set (or clear) a categorical (IN / IS NULL) filter for a column, applied to
// the analytics filter expression. Empty values and no null -> filter is
// cleared for the column.
export const setCategoryHistogramFilter = (
  colId: string,
  values: string[],
  includeNull: boolean,
  stateRef: StateRef<AppState>
) => {
  const constraint = mkValuesConstraint(colId, values, includeNull);
  setAnalyticsClauses(
    [colId],
    constraint != null ? [constraint] : [],
    stateRef
  );
};

// Set the analytics filter expression directly (e.g. from the Analytics
// Filters editor in the footer).
export const setAnalyticsFilter = (
  fe: reltab.FilterExp,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) =>
        viewParams.set("analyticsFilterExp", fe) as ViewParams
    )
  );
};

// Enable or disable application of the analytics filter to the view.
export const setApplyAnalyticsFilters = (
  apply: boolean,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    vpUpdate(
      (viewParams) => viewParams.set("applyAnalyticsFilters", apply) as ViewParams
    )
  );
};

// Fetch the data backing the column histogram dialog for one column.
// Numeric columns get a binned histogram, everything else gets categorical
// frequency data. binCount (optional) lets the dialog re-bin numeric columns.
// query/schema are the (possibly pivoted / aggregated) query and schema whose
// data the histogram should describe.
export async function loadColumnHistogramData(
  dbc: DataSourceConnection,
  query: reltab.QueryExp,
  schema: reltab.Schema,
  colId: string,
  binCount?: number
): Promise<ColumnHistogramData | null> {
  const kind = schema.columnType(colId).kind;
  if (
    kind === "integer" ||
    kind === "real" ||
    reltab.isTemporalKind(kind)
  ) {
    return reltab.getColumnHistogramDataForBins(
      dbc,
      query,
      schema,
      colId,
      binCount
    );
  }
  return reltab.getColumnFrequencyData(dbc, query, colId);
}

// --- Scatter Plot Matrix (SPLOM) Dialog Actions ---

// Data backing the SPLOM dialog: scatter points + correlation matrix + the
// color column's category frequencies (when color by is enabled).
export interface SplomViewData {
  points: reltab.ScatterPlotData;
  correlations: reltab.PairCorrelation[];
  colorFreqs?: reltab.CategoricalDistributionData | null;
}

// Open / close the SPLOM dialog (state lives in AppState so it can be opened
// from the app menu).
export const openSplom = (stateRef: StateRef<AppState>) => {
  const app = mutableGet(stateRef);
  if (app.viewState == null) {
    return;
  }
  update(stateRef, (s) => s.set("splomDialogOpen", true) as AppState);
};

export const closeSplom = (stateRef: StateRef<AppState>) => {
  update(stateRef, (s) => s.set("splomDialogOpen", false) as AppState);
};

// Open / close the standalone "Analytics > Scatter Plot" dialog (a single-pair
// 2D scatter built on the same shared ScatterPlot component as the SPLOM
// master view). An optional {xColId,yColId} pair pre-seeds the dialog's axes
// (used when a non-diagonal SPLOM cell is clicked to open that pair).
export const openScatterPlot = (
  stateRef: StateRef<AppState>,
  pair?: { xColId: string; yColId: string }
) => {
  const app = mutableGet(stateRef);
  if (app.viewState == null) {
    return;
  }
  update(
    stateRef,
    (s) =>
      s
        .set("scatterPlotDialogOpen", true)
        .set("scatterXColId", pair != null ? pair.xColId : null)
        .set("scatterYColId", pair != null ? pair.yColId : null) as AppState
  );
};

export const closeScatterPlot = (stateRef: StateRef<AppState>) => {
  update(
    stateRef,
    (s) =>
      s
        .set("scatterPlotDialogOpen", false)
        .set("scatterXColId", null)
        .set("scatterYColId", null) as AppState
  );
};

// Open the Scatter Plot dialog pre-seeded with a given XY pair (from a
// non-diagonal SPLOM cell). The SPLOM dialog stays open underneath so the user
// can continue exploring the matrix afterwards.
export const openScatterPlotForPair = (
  xColId: string,
  yColId: string,
  stateRef: StateRef<AppState>
) => {
  update(
    stateRef,
    (s) =>
      s
        .set("scatterPlotDialogOpen", true)
        .set("scatterXColId", xColId)
        .set("scatterYColId", yColId) as AppState
  );
};

// Fetch the data backing the SPLOM dialog for the given query and schema:
// scatter points (with sampling), the correlation matrix (computed over the
// full data), and the color column's category frequencies when one is set.
export async function loadSplomData(
  dbc: DataSourceConnection,
  query: reltab.QueryExp,
  schema: reltab.Schema,
  opts: reltab.ScatterPlotOptions
): Promise<SplomViewData> {
  const points = await reltab.getScatterPlotData(dbc, query, schema, opts);
  const correlations = await reltab.getCorrelationMatrix(
    dbc,
    query,
    schema,
    opts.matrixColIds
  );
  let colorFreqs: reltab.CategoricalDistributionData | null = null;
  if (opts.colorColId != null && opts.colorColId.length > 0) {
    colorFreqs = await reltab.getColumnFrequencyData(
      dbc,
      query,
      opts.colorColId
    );
  }
  return { points, correlations, colorFreqs };
}

// Linear regression for the active master-detail pair (slope/intercept/R²),
// fetched on demand when a cell is clicked so the trend line and stats tags can
// be drawn. Uses the raw matrix column ids (correlation SQL derives epochs for
// temporal columns internally).
export async function loadPairRegression(
  dbc: DataSourceConnection,
  query: reltab.QueryExp,
  schema: reltab.Schema,
  xColId: string,
  yColId: string
): Promise<reltab.PairRegression> {
  return reltab.getPairRegression(dbc, query, schema, xColId, yColId);
}

// Data backing the standalone scatter plot: points for the chosen (x, y, color)
// columns plus the fitted linear regression for the pair.
export interface ScatterPlotViewData {
  points: reltab.ScatterPlotData;
  regression: reltab.PairRegression | null;
}

export async function loadScatterPlot(
  dbc: DataSourceConnection,
  query: reltab.QueryExp,
  schema: reltab.Schema,
  xColId: string,
  yColId: string,
  colorColId: string | null,
  sampleLimit: number
): Promise<ScatterPlotViewData> {
  const points = await reltab.getScatterPlotData(dbc, query, schema, {
    matrixColIds: [xColId, yColId],
    colorColId,
    sampleLimit,
  });
  let regression: reltab.PairRegression | null = null;
  try {
    regression = await reltab.getPairRegression(
      dbc,
      query,
      schema,
      xColId,
      yColId
    );
  } catch (err) {
    // A non-regressable pair (e.g. NaN-producing data) should not break the
    // whole dialog; the trend line is simply omitted.
    regression = null;
  }
  return { points, regression };
}

// Set a 2D (rectangular) analytics filter from a SPLOM brush. Cleans up any
// existing clauses referencing either column, then constrains both axes with
// numeric/temporal ranges. A null range for an axis clears that axis.
export const setSplomBrushFilter = (
  xColId: string,
  xRange: [number, number] | null,
  yColId: string,
  yRange: [number, number] | null,
  stateRef: StateRef<AppState>
) => {
  const appState = mutableGet(stateRef);
  const kx = appState.viewState.baseSchema.columnType(xColId).kind;
  const ky = appState.viewState.baseSchema.columnType(yColId).kind;
  const constraints = [
    mkRangeConstraint(kx, xColId, xRange),
    mkRangeConstraint(ky, yColId, yRange),
  ].filter((c) => c != null) as AnalyticsConstraint[];
  setAnalyticsClauses([xColId, yColId], constraints, stateRef);
};

// Set the 2D scatter brush filter, one analytics-filter clause per axis:
//   - numeric/temporal axis -> and(ge(col, lo), le(col, hi))
//   - categorical axis       -> in(col, [v1, v2, ...])
// Cleans up any existing clauses referencing either column (mirrors
// setSplomBrushFilter / setCategoryHistogramFilter), then constrains both axes.
export const setScatterPlotBrushFilter = (
  xArg: ScatterAxisFilterArg,
  yArg: ScatterAxisFilterArg,
  stateRef: StateRef<AppState>
) => {
  const appState = mutableGet(stateRef);
  const constraints = [
    mkAxisArgConstraint(appState, xArg),
    mkAxisArgConstraint(appState, yArg),
  ].filter((c) => c != null) as AnalyticsConstraint[];
  setAnalyticsClauses([xArg.colId, yArg.colId], constraints, stateRef);
};

// --- Join CSV Dialog Actions ---

export const openJoinCsvDialog = (
  leftColumns: string[],
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      open: true,
      csvPath: null,
      leftColumns,
      rightColumns: [],
      sheets: [],
      sheet: "",
      leftCol: "",
      rightCol: "",
      joinType: "inner" as CsvJoinType,
      forceStringCast: true,
      nullString: "",
    } as JoinCsvDialogState)
  );
};

export const closeJoinCsvDialog = (stateRef: StateRef<AppState>) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      open: false,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvPath = (
  csvPath: string,
  rightColumns: string[],
  stateRef: StateRef<AppState>,
  sheets?: string[]
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      csvPath,
      rightColumns,
      sheets: sheets ?? s.joinCsvDialog.sheets,
      sheet:
        sheets != null && sheets.length > 0
          ? sheets[0]
          : s.joinCsvDialog.sheet,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvSheet = (
  sheet: string,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      sheet,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvLeftCol = (
  col: string,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      leftCol: col,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvRightCol = (
  col: string,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      rightCol: col,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvType = (
  joinType: CsvJoinType,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      joinType,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvForceStringCast = (
  force: boolean,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      forceStringCast: force,
    } as JoinCsvDialogState)
  );
};

export const setJoinCsvNullString = (
  nullStr: string,
  stateRef: StateRef<AppState>
) => {
  update(stateRef, (s) =>
    s.set("joinCsvDialog", {
      ...s.joinCsvDialog,
      nullString: nullStr,
    } as JoinCsvDialogState)
  );
};

export const confirmCsvJoin = async (
  joinArgs: {
    csvPath: string;
    sheet: string;
    joinType: CsvJoinType;
    leftCol: string;
    rightCol: string;
    forceStringCast: boolean;
    nullString: string;
  },
  rightColumns: string[],
  stateRef: StateRef<AppState>,
  importXlsx?: (path: string, sheet: string) => Promise<string | undefined>
): Promise<void> => {
  const appState = mutableGet(stateRef);
  const { viewState } = appState;
  if (!viewState || !viewState.baseQuery || !viewState.dbc) {
    log.error("confirmCsvJoin: no active view to join onto");
    return;
  }

  const { baseQuery, dbc } = viewState;

  const rhsSchema: { [colId: string]: { displayName: string; columnType: string } } = {};
  for (const cid of rightColumns) {
    rhsSchema[cid] = { displayName: cid, columnType: "VARCHAR" };
  }

  const reltabArgs: reltab.JoinCsvArgs = {
    rightTablePath: joinArgs.csvPath,
    joinType: joinArgs.joinType,
    leftCol: joinArgs.leftCol,
    rightCol: joinArgs.rightCol,
    forceStringCast: joinArgs.forceStringCast,
    nullString: joinArgs.nullString || undefined,
  };

  // For workbooks (.xlsx), import the selected sheet into the shared DuckDB and
  // join against that table (the RHS reference is a table name, not a file).
  if (joinArgs.csvPath.toLowerCase().endsWith(".xlsx")) {
    if (!importXlsx) {
      log.error("confirmCsvJoin: xlsx join requires an import callback");
      return;
    }
    const rhsTableName = await importXlsx(joinArgs.csvPath, joinArgs.sheet);
    if (!rhsTableName) {
      log.error("confirmCsvJoin: failed to import xlsx sheet for join");
      return;
    }
    reltabArgs.rhsTableName = rhsTableName;
  }

  const fusionQuery = baseQuery.joinCsv(reltabArgs, rhsSchema, rightColumns);

  // Materialize the fusion result into a new DuckDB table so all columns are editable
  const materializedTableName = `_fused_${Date.now()}`;
  const fusionSql = await dbc.getSqlForQuery(fusionQuery);
  const createTableSql = `CREATE TABLE "${materializedTableName}" AS ${fusionSql}`;
  console.log(`[JoinCSV] Materializing: ${createTableSql}`);
  await dbc.execSql(createTableSql);

  // Use a simple tableQuery pointing to the materialized table
  const newBaseQuery = reltab.tableQuery(materializedTableName);
  const newBaseSchema = await aggtree.getBaseSchema(
    dbc,
    newBaseQuery,
    appState.showRecordCount
  );

  const displayColumns = newBaseSchema.columns.slice();
  const openPaths = new PathTree();
  const initialViewParams = new ViewParams({
    displayColumns,
    openPaths,
  });

  const viewStateNew = new ViewState({
    dbc,
    dsPath: viewState.dsPath,
    baseSchema: newBaseSchema,
    baseQuery: newBaseQuery,
    viewParams: initialViewParams,
    initialViewParams,
  });

  await awaitableUpdate_(
    stateRef,
    (st: AppState): AppState => st.set("viewState", viewStateNew) as AppState
  );
};

// --- Cell Edit Actions ---

export const startCellEdit = (
  editState: CellEditState,
  stateRef: StateRef<AppState>
): void => {
  update(stateRef, (state: AppState) =>
    state.update("viewState", (vs) =>
      vs!.set("editingCell", editState)
    )
  );
};

export const commitCellEdit = async (
  newValue: string,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const editState = state.viewState.editingCell;
  if (!editState) return;

  const { dbc, baseQuery, baseSchema } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("commitCellEdit: no database connection or base query");
    return;
  }

  // Get the table name by traversing the from chain (handles joinCsv, etc.)
  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  const queryRep = (baseQuery as any)._rep;
  const tableName = getTableName(queryRep);
  if (!tableName) {
    console.error("commitCellEdit: could not find table name in query", baseQuery);
    return;
  }

  // Get the target table's schema to filter rowData to only columns in the table
  let tableSchema: reltab.Schema | null = null;
  try {
    tableSchema = await dbc.getTableSchema(tableName);
  } catch (err) {
    console.error("commitCellEdit: could not get table schema", err);
    return;
  }
  const tableColumns = new Set(tableSchema.columns);

  // Format a raw value for use in SQL WHERE clause
  const formatWhereValue = (col: string, val: any): string => {
    if (val === null || val === undefined) return `"${col}" IS NULL`;
    if (val instanceof Date) {
      const ct = tableSchema?.columnType(col);
      const sqlType = ct?.sqlTypeName;
      if (sqlType === "DATE") {
        return `"${col}" = '${val.toISOString().split("T")[0]}'`;
      } else if (sqlType === "TIME") {
        const timePart = val.toISOString().split("T")[1].replace(/\.\d{3}Z$/, "");
        return `"${col}" = '${timePart}'`;
      }
      // TIMESTAMP and others: use full ISO string
      return `"${col}" = '${val.toISOString()}'`;
    }
    if (typeof val === "string") {
      return `"${col}" = '${val.replace(/'/g, "''")}'`;
    }
    return `"${col}" = ${val}`;
  };

  // Build WHERE clause from row data, only using columns that exist in the target table
  // For leaf rows, use the physical rowid to target exactly one row.
  let whereClause: string;
  if (!editState.isAggregateRow && editState.rid != null) {
    whereClause = `rowid = ${editState.rid}`;
  } else {
    const whereParts: string[] = [];
    for (const [col, val] of Object.entries(editState.rowData)) {
      if (tableColumns.has(col)) {
        whereParts.push(formatWhereValue(col, val));
      }
    }
    whereClause = whereParts.join(" AND ");
  }
  
  // Build the new value - handle different types
  let sqlValue: string;
  const trimmed = newValue.trim();
  if (newValue === "" || trimmed.toLowerCase() === "null") {
    sqlValue = "NULL";
  } else if (editState.columnKind === "string" || editState.columnKind === "dialect" || editState.columnKind === "date" || editState.columnKind === "time" || editState.columnKind === "datetime" || editState.columnKind === "timestamp") {
    sqlValue = `'${newValue.replace(/'/g, "''")}'`;
  } else if (editState.columnKind === "boolean") {
    sqlValue = /^(true|yes|1)$/i.test(trimmed) ? "TRUE" : "FALSE";
  } else {
    sqlValue = newValue;
  }

  let sql: string;

  // Pivot label editing: UPDATE table SET pivotColumn = newValue WHERE pivotColumn = oldValue
  if (editState.isAggregateRow && editState.isPivot) {
    const vpivots = state.viewState.viewParams.vpivots;
    const pivotIndex = editState.pivotDepth! - 1;
    const pivotColumn = pivotIndex >= 0 ? vpivots[pivotIndex] : null;
    if (!pivotColumn) {
      console.error("commitCellEdit: could not determine pivot column for depth", editState.pivotDepth);
      return;
    }
    const oldValue = editState.rawValue;
    const oldValueStr = formatWhereValue(pivotColumn, oldValue).replace(/^"[^"]*" = /, "");
    sql = `UPDATE "${tableName}" SET "${pivotColumn}" = ${sqlValue} WHERE "${pivotColumn}" = ${oldValueStr}`;
  } else if (editState.isAggregateRow && !editState.isPivot) {
    // Aggregate cell editing: UPDATE table SET column = newValue WHERE pivotCol1 = val1 AND pivotCol2 = val2
    const vpivots = state.viewState.viewParams.vpivots;
    const depth = editState.pivotDepth ?? 1;
    const groupByCols = vpivots.slice(0, depth);
    if (groupByCols.length === 0) {
      console.error("commitCellEdit: no group-by columns for aggregate row at depth", depth);
      return;
    }
    const whereParts: string[] = [];
    for (const col of groupByCols) {
      const val = editState.rowData[col];
      if (val === null || val === undefined) {
        whereParts.push(`"${col}" IS NULL`);
      } else {
        whereParts.push(formatWhereValue(col, val));
      }
    }
    const aggregateWhere = whereParts.join(" AND ");
    sql = `UPDATE "${tableName}" SET "${editState.columnId}" = ${sqlValue} WHERE ${aggregateWhere}`;
  } else {
    sql = `UPDATE "${tableName}" SET "${editState.columnId}" = ${sqlValue} WHERE ${whereClause}`;
  }
  
  console.log(`[CellEdit] Executing: ${sql}`);

  try {
    // Execute the UPDATE via raw SQL
    await dbc.execSql(sql);
    
    console.log(
      `[CellEdit] Committed: row=${editState.row}, col=${editState.columnId}, ` +
      `old=${editState.value}, new=${newValue}`
    );

    // Trigger data refresh by updating viewParams reference
    // This will cause PivotRequester to re-fetch data
    update(stateRef, (st: AppState) => {
      const currentVP = st.viewState.viewParams;
      // Create a new reference to trigger PivotRequester refresh
      const newVP = currentVP.set("displayColumns", currentVP.displayColumns.slice()) as ViewParams;
      return st
        .update("viewState", (vs) =>
          vs!
            .set("editingCell", null)
            .set("viewParams", newVP) as ViewState
        );
    });
  } catch (err) {
    console.error("[CellEdit] Error executing UPDATE:", err);
    // Still close the modal even on error
    update(stateRef, (st: AppState) =>
      st.update("viewState", (vs) =>
        vs!.set("editingCell", null)
      )
    );
  }
};

export const cancelCellEdit = (
  stateRef: StateRef<AppState>
): void => {
  update(stateRef, (state: AppState) =>
    state.update("viewState", (vs) =>
      vs!.set("editingCell", null)
    )
  );
};

// --- Column Rename Action ---

export const renameColumn = async (
  tableName: string,
  oldName: string,
  newName: string,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc } = state.viewState;
  if (!dbc) {
    console.error("renameColumn: no database connection");
    return;
  }

  try {
    await dbc.renameColumn(tableName, oldName, newName);
    console.log(
      `[ColumnRename] Renamed column "${oldName}" to "${newName}" in table "${tableName}"`
    );

    const appState = mutableGet(stateRef);
    const showRecordCount = appState.showRecordCount;

    // Re-fetch the baseQuery and baseSchema after rename.
    const newBQ = reltab.tableQuery(tableName);
    const newBaseSchema = await aggtree.getBaseSchema(
      dbc,
      newBQ,
      showRecordCount
    );

    // Update ViewParams to replace old column name with new name
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      if (!vp) return st;

      // Helper to replace column name in an array
      const replaceInArr = (arr: string[]): string[] =>
        arr.map((c) => (c === oldName ? newName : c));

      // Helper to replace column name in sortKey
      const replaceInSortKey = (sortKey: Array<[string, boolean]>): Array<[string, boolean]> =>
        sortKey.map(([col, asc]) => [col === oldName ? newName : col, asc]);

      // Helper to replace column name in aggMap
      const replaceInAggMap = (aggMap: { [cid: string]: reltab.AggFn }): { [cid: string]: reltab.AggFn } => {
        if (aggMap[oldName] !== undefined) {
          const newAggMap = { ...aggMap };
          newAggMap[newName] = newAggMap[oldName];
          delete newAggMap[oldName];
          return newAggMap;
        }
        return aggMap;
      };

      const newVP = vp
        .set("displayColumns", replaceInArr(vp.displayColumns))
        .set("vpivots", replaceInArr(vp.vpivots))
        .set("sortKey", replaceInSortKey(vp.sortKey))
        .set("aggMap", replaceInAggMap(vp.aggMap)) as ViewParams;

      return st.update("viewState", (vs) =>
        vs!
          .set("viewParams", newVP)
          .set("baseQuery", newBQ)
          .set("baseSchema", newBaseSchema) as ViewState
      );
    });
  } catch (err) {
    console.error("[ColumnRename] Error renaming column:", err);
  }
};

// --- Column Delete Action ---

export const deleteColumn = async (
  tableName: string,
  columnName: string,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc } = state.viewState;
  if (!dbc) {
    console.error("deleteColumn: no database connection");
    return;
  }

  try {
    await dbc.deleteColumn(tableName, columnName);
    console.log(`[ColumnDelete] Deleted column "${columnName}" from table "${tableName}"`);

    const appState = mutableGet(stateRef);
    const showRecordCount = appState.showRecordCount;
    const vp = appState.viewState.viewParams;

    // Re-fetch schema
    const newBQ = reltab.tableQuery(tableName);
    const newBaseSchema = await aggtree.getBaseSchema(dbc, newBQ, showRecordCount);

    // Remove column from ViewParams arrays
    const removeFromArr = (arr: string[]): string[] =>
      arr.filter((c) => c !== columnName);

    const newVP = vp
      .set("displayColumns", removeFromArr(vp.displayColumns))
      .set("vpivots", removeFromArr(vp.vpivots))
      .set("sortKey", vp.sortKey.filter(([col]) => col !== columnName))
      .set("aggMap", (() => {
        const m = { ...vp.aggMap };
        delete m[columnName];
        return m;
      })()) as ViewParams;

    update(stateRef, (st: AppState) =>
      st.update("viewState", (vs) =>
        vs!
          .set("viewParams", newVP)
          .set("baseQuery", newBQ)
          .set("baseSchema", newBaseSchema) as ViewState
      )
    );
  } catch (err) {
    console.error("[ColumnDelete] Error deleting column:", err);
  }
};

// --- Column Duplicate Action ---

export const duplicateColumn = async (
  tableName: string,
  sourceColumn: string,
  newColumn: string,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc } = state.viewState;
  if (!dbc) {
    console.error("duplicateColumn: no database connection");
    return;
  }

  try {
    await dbc.duplicateColumn(tableName, sourceColumn, newColumn);
    console.log(`[ColumnDuplicate] Duplicated column "${sourceColumn}" as "${newColumn}" in table "${tableName}"`);

    const appState = mutableGet(stateRef);
    const showRecordCount = appState.showRecordCount;
    const vp = appState.viewState.viewParams;

    // Re-fetch schema
    const newBQ = reltab.tableQuery(tableName);
    const newBaseSchema = await aggtree.getBaseSchema(dbc, newBQ, showRecordCount);

    // Add new column after source in displayColumns
    const newDisplayCols = [...vp.displayColumns];
    const srcIdx = newDisplayCols.indexOf(sourceColumn);
    if (srcIdx >= 0) {
      newDisplayCols.splice(srcIdx + 1, 0, newColumn);
    } else {
      newDisplayCols.push(newColumn);
    }

    const newVP = vp
      .set("displayColumns", newDisplayCols) as ViewParams;

    update(stateRef, (st: AppState) =>
      st.update("viewState", (vs) =>
        vs!
          .set("viewParams", newVP)
          .set("baseQuery", newBQ)
          .set("baseSchema", newBaseSchema) as ViewState
      )
    );
  } catch (err) {
    console.error("[ColumnDuplicate] Error duplicating column:", err);
  }
};

// --- Insert Row Action ---

const getTableNameFromQuery = (baseQuery: any): string | null => {
  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  return getTableName(baseQuery?._rep);
};

export const insertRow = async (
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc, baseQuery } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("insertRow: no database connection or baseQuery");
    return;
  }

  const tableName = getTableNameFromQuery(baseQuery);
  if (!tableName) {
    console.error("insertRow: could not find table name");
    return;
  }

  try {
    await dbc.insertRow(tableName);
    console.log(`[InsertRow] Inserted new empty row in "${tableName}"`);

    // Trigger data refresh
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      const newVP = vp.set("displayColumns", vp.displayColumns.slice()) as ViewParams;
      return st.update("viewState", (vs) => vs!.set("viewParams", newVP) as ViewState);
    });
  } catch (err) {
    console.error("[InsertRow] Error inserting row:", err);
  }
};

// --- Insert Column Action ---

export const insertColumn = async (
  tableName: string,
  columnName: string,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc } = state.viewState;
  if (!dbc) {
    console.error("insertColumn: no database connection");
    return;
  }

  try {
    await dbc.insertColumn(tableName, columnName);
    console.log(`[InsertColumn] Added column "${columnName}" to table "${tableName}"`);

    const appState = mutableGet(stateRef);
    const showRecordCount = appState.showRecordCount;
    const vp = appState.viewState.viewParams;

    // Re-fetch schema
    const newBQ = reltab.tableQuery(tableName);
    const newBaseSchema = await aggtree.getBaseSchema(dbc, newBQ, showRecordCount);

    // Append the new column to the display columns
    const newDisplayCols = [...vp.displayColumns, columnName];

    const newVP = vp
      .set("displayColumns", newDisplayCols) as ViewParams;

    update(stateRef, (st: AppState) =>
      st.update("viewState", (vs) =>
        vs!
          .set("viewParams", newVP)
          .set("baseQuery", newBQ)
          .set("baseSchema", newBaseSchema) as ViewState
      )
    );
  } catch (err) {
    console.error("[InsertColumn] Error inserting column:", err);
  }
};

// --- Row Operations ---

const EXCLUDE_COLS = ["Rec", "_id", "_parentId"];

const formatSqlValue = (val: any): string => {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === "string") {
    const escaped = val.replace(/'/g, "''");
    return `'${escaped}'`;
  }
  return `'${String(val)}'`;
};

const buildRowWhere = (rowData: { [columnId: string]: any }): string => {
  const parts = Object.entries(rowData)
    .filter(([k]) => !EXCLUDE_COLS.includes(k) && !k.startsWith("_"))
    .map(([k, v]) => `"${k}" = ${formatSqlValue(v)}`);
  return parts.join(" AND ");
};

const buildMultiRowWhere = (rowDataList: { [columnId: string]: any }[]): string => {
  if (rowDataList.length === 0) return "1=0";
  if (rowDataList.length === 1) return buildRowWhere(rowDataList[0]);
  const clauses = rowDataList.map((rd) => `(${buildRowWhere(rd)})`);
  return clauses.join(" OR ");
};

// Build a WHERE clause that targets exactly the given rows by their physical
// rowid, if available. Returns null if no rowids are present (e.g. aggregate rows).
const buildRowIdWhere = (
  rowDataList: { [columnId: string]: any }[]
): string | null => {
  if (rowDataList.length === 0) return null;
  // only valid when every row is a leaf row carrying a physical rowid
  const allLeaf = rowDataList.every((rd) => rd._isLeaf);
  if (!allLeaf) return null;
  const rids = rowDataList
    .map((rd) => rd._rid)
    .filter((r) => r != null)
    .map((r) => Number(r));
  if (rids.length === 0) return null;
  return `rowid IN (${rids.join(", ")})`;
};

// Build a WHERE clause that targets every leaf row rolling up into an
// aggregate row. The pivot path of an aggregate row is materialized in its
// `_path` columns: `_path[i]` holds the value of the i-th pivot column
// (vpivots[i]) for every level i < depth. Map each path element back onto its
// pivot column so the clause matches exactly the underlying leaf rows.
const buildAggregateRowWhere = (
  item: { [columnId: string]: any },
  vpivots: string[],
  depth: number
): string => {
  const parts: string[] = [];
  for (let i = 0; i < depth && i < vpivots.length; i++) {
    const col = vpivots[i];
    const value = item["_path" + i] ?? item[col];
    parts.push(`"${col}" = ${formatSqlValue(value)}`);
  }
  // depth 0 (root row) has no pivot columns -> match everything
  if (parts.length === 0) return "1=1";
  return parts.join(" AND ");
};

// --- Delete Rows Action ---

export const deleteRows = async (
  rowDataList: { [columnId: string]: any }[],
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc, baseQuery } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("deleteRows: no database connection or baseQuery");
    return;
  }

  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  const tableName = getTableName((baseQuery as any)._rep);
  if (!tableName) {
    console.error("deleteRows: could not find table name");
    return;
  }

  try {
    const whereClause = buildRowIdWhere(rowDataList) ?? buildMultiRowWhere(rowDataList);
    await dbc.deleteRows(tableName, whereClause);
    console.log(`[DeleteRows] Deleted ${rowDataList.length} row(s) from "${tableName}"`);

    // Trigger data refresh
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      const newVP = vp.set("displayColumns", vp.displayColumns.slice()) as ViewParams;
      return st.update("viewState", (vs) => vs!.set("viewParams", newVP) as ViewState);
    });
  } catch (err) {
    console.error("[DeleteRows] Error deleting rows:", err);
  }
};

// --- Duplicate Rows Action ---

export const duplicateRows = async (
  rowDataList: { [columnId: string]: any }[],
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc, baseQuery } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("duplicateRows: no database connection or baseQuery");
    return;
  }

  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  const tableName = getTableName((baseQuery as any)._rep);
  if (!tableName) {
    console.error("duplicateRows: could not find table name");
    return;
  }

  try {
    const whereClause = buildRowIdWhere(rowDataList) ?? buildMultiRowWhere(rowDataList);
    await dbc.duplicateRows(tableName, whereClause);
    console.log(`[DuplicateRows] Duplicated ${rowDataList.length} row(s) in "${tableName}"`);

    // Trigger data refresh
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      const newVP = vp.set("displayColumns", vp.displayColumns.slice()) as ViewParams;
      return st.update("viewState", (vs) => vs!.set("viewParams", newVP) as ViewState);
    });
  } catch (err) {
    console.error("[DuplicateRows] Error duplicating rows:", err);
  }
};

// --- Aggregate Row Operations ---

export const deleteAllAggregateRows = async (
  item: any,
  depth: number,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc, baseQuery, viewParams } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("deleteAllAggregateRows: no database connection or baseQuery");
    return;
  }

  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  const tableName = getTableName((baseQuery as any)._rep);
  if (!tableName) {
    console.error("deleteAllAggregateRows: could not find table name");
    return;
  }

  try {
    // Build WHERE from the aggregate row's pivot path: each _path[i] value
    // mapped back onto vpivots[i]
    const whereClause = buildAggregateRowWhere(item, viewParams.vpivots, depth);

    await dbc.deleteRows(tableName, whereClause);
    console.log(`[DeleteAllAggregate] Deleted aggregate rows for depth ${depth} in "${tableName}"`);

    // Trigger data refresh
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      const newVP = vp.set("displayColumns", vp.displayColumns.slice()) as ViewParams;
      return st.update("viewState", (vs) => vs!.set("viewParams", newVP) as ViewState);
    });
  } catch (err) {
    console.error("[DeleteAllAggregate] Error deleting aggregate rows:", err);
  }
};

export const duplicateAllAggregateRows = async (
  item: any,
  depth: number,
  stateRef: StateRef<AppState>
): Promise<void> => {
  const state = mutableGet(stateRef);
  const { dbc, baseQuery, viewParams } = state.viewState;
  if (!dbc || !baseQuery) {
    console.error("duplicateAllAggregateRows: no database connection or baseQuery");
    return;
  }

  const getTableName = (rep: any): string | null => {
    if (!rep) return null;
    if (rep.tableName) return rep.tableName;
    if (rep.from) return getTableName(rep.from);
    return null;
  };
  const tableName = getTableName((baseQuery as any)._rep);
  if (!tableName) {
    console.error("duplicateAllAggregateRows: could not find table name");
    return;
  }

  try {
    const whereClause = buildAggregateRowWhere(item, viewParams.vpivots, depth);

    await dbc.duplicateRows(tableName, whereClause);
    console.log(`[DuplicateAllAggregate] Duplicated aggregate rows for depth ${depth} in "${tableName}"`);

    // Trigger data refresh
    update(stateRef, (st: AppState) => {
      const vp = st.viewState.viewParams;
      const newVP = vp.set("displayColumns", vp.displayColumns.slice()) as ViewParams;
      return st.update("viewState", (vs) => vs!.set("viewParams", newVP) as ViewState);
    });
  } catch (err) {
    console.error("[DuplicateAllAggregate] Error duplicating aggregate rows:", err);
  }
};
