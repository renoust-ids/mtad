import _ from "lodash";
import { mutableGet, StateRef } from "oneref";
import * as React from "react";
import { useRef } from "react";
import * as reltab from "reltab";
import { Dialog, Button, Intent, Alert } from "@blueprintjs/core";
import { AppState } from "../AppState";
import { DataRow } from "../PagedDataView";
import { ViewState, CellEditState } from "../ViewState";
import * as actions from "../actions";
import * as util from "../util";
import { CellEditStartData, DataGrid, DataGridProps } from "./DataGrid";
import { CellEditModal } from "./CellEditModal";
import HistogramDialog from "./HistogramDialog";
import SplomDialog from "./SplomDialog";
import ScatterPlotDialog from "./ScatterPlotDialog";
import ConfusionMatrixDialog from "./ConfusionMatrixDialog";
import CorrelationMatrixDialog from "./CorrelationMatrixDialog";
import KnowledgeGraphDialog from "./KnowledgeGraphDialog";
import { ScatterAxisFilterArg } from "./categoricalAxis";
import { SimpleClipboard } from "./SimpleClipboard";

import { CellClickData } from "./CellClickData";
import { Cell, ColumnData, SelectionChangeData } from "./SelectionChangeData";

export type OpenURLFn = (url: string) => void;

export interface GridPaneProps {
  appState: AppState;
  viewState: ViewState;
  stateRef: StateRef<AppState>;
  clipboard: SimpleClipboard;
  openURL: OpenURLFn;
  embedded: boolean;
  onCellClick?: (cell: CellClickData) => void;
  onSelectionChange?: (data: SelectionChangeData) => void;
}

// GridPaneInternal the un-memoized GridPane component
const GridPaneInternal: React.FunctionComponent<GridPaneProps> = ({
  appState,
  viewState,
  stateRef,
  clipboard,
  openURL,
  embedded,
  onCellClick,
  onSelectionChange,
}) => {
  const viewStateRef = useRef<ViewState>(viewState);

  viewStateRef.current = viewState;

  // Only show loading modal if we've been loading more than 500 ms
  const lt = viewState.loadingTimer;
  const showLoadingModal = lt.running && lt.elapsed > 500;

  const { dataView, viewParams } = viewState;
  const { showColumnHistograms } = viewState.viewParams;
  const histoMap = viewState.queryView?.histoMap;

  const getColumnFormatter = React.useCallback(
    (schema: reltab.Schema, cid: string) =>
      viewState.viewParams.getColumnFormatter(schema, cid),
    [viewState.viewParams]
  );

  const getColumnCssClassName = React.useCallback(
    (schema: reltab.Schema, cid: string) =>
      viewState.viewParams.getColumnClassName(schema, cid),
    [viewState.viewParams]
  );

  let pivotColumnDisplayName = "";
  if (dataView) {
    const { schema } = dataView;
    const pivotNames = viewParams.vpivots.map((cid) => schema.displayName(cid));
    const leafCid = viewParams.pivotLeafColumn;
    let leafPivotStr = leafCid ? " > " + schema.displayName(leafCid) : "";
    pivotColumnDisplayName = "Pivot: " + pivotNames.join(" > ") + leafPivotStr;
  }

  const showHiddenColumns = viewParams.showHiddenCols;
  const displayColumns = viewParams.displayColumns;

  const onViewportChanged = React.useCallback(
    (top: number, bottom: number) => {
      actions.updateViewport(top, bottom, stateRef);
    },
    [stateRef]
  );

  const onHistogramBrushRange = React.useCallback(
    (cid: string, range: [number, number] | null) => {
      actions.setHistogramBrushRange(cid, range, stateRef);
    },
    [stateRef]
  );

  const onHistogramBrushFilter = React.useCallback(
    (cid: string, range: [number, number] | null) => {
      actions.setHistogramBrushFilter(cid, range, stateRef);
    },
    [stateRef]
  );

  const onSetSortKey = React.useCallback(
    (sortKey: [string, boolean][]) => {
      actions.setSortKey(sortKey, stateRef);
    },
    [stateRef]
  );
  const sortKey = viewParams.sortKey;

  const onGridSelectionChange = React.useCallback(
    (anchor: Cell, focus: Cell, columns: string[], items: any[][]) => {
      const appState = mutableGet(stateRef);
      const { viewState } = appState;
      if (onSelectionChange) {
        const columnData: ColumnData[] = columns.map((column) => ({
          ...viewState?.baseSchema.columnMetadata[column],
          columnId: column,
        }));
        onSelectionChange({
          selectedGridItems: items,
          columns: columnData,
          gridAnchor: anchor,
          gridFocus: focus,
        });
      }
    },
    []
  );

  const onGridClick = React.useCallback(
    (
      row: number,
      column: number,
      item: DataRow,
      columnId: string,
      cellVal: any
    ) => {
      const appState = mutableGet(stateRef);
      const { viewState } = appState;
      const { viewParams, dataView } = viewState;
      // log.info("onGridClick: item: ", item);

      if (onCellClick) {
        const columnData =
          viewState?.baseSchema.columnMetadata[columnId] ?? null;
        onCellClick({
          value: cellVal,
          column: { ...columnData, columnId },
          cell: { row, col: column },
        });
      }

      if (columnId === "_pivot") {
        if (item._isLeaf) {
          return;
        }
        const vpivots = viewParams.vpivots;
        const depth = item._depth;
        let path: string[] = [];
        for (let i = 0; i < vpivots.length && i < depth; i++) {
          let pathItem = item["_path" + i];
          path.push(item["_path" + i] as string);
        }
        // log.info("onGridClick: path: ", path);
        if (item._isOpen) {
          actions.closePath(path, stateRef);
        } else {
          actions.openPath(path, stateRef);
        }
      } else {
        if (dataView?.schema.columnIndex(columnId)) {
          const ch = viewParams.getClickHandler(dataView.schema, columnId);
          ch({ openURL }, row, column, cellVal);
        }
      }
    },
    [stateRef]
  );

  const onSetColumnOrder = React.useCallback(
    (columnIds: string[]) => {
      actions.setColumnOrder(columnIds, stateRef);
    },
    [stateRef]
  );

  const isPivoted = viewParams.vpivots.length > 0;

  const editingCell = viewState.editingCell;

  const handleEditStart = React.useCallback(
    (data: CellEditStartData) => {
      actions.startCellEdit({
        row: data.row,
        col: data.col,
        columnId: data.columnId,
        value: data.value,
        rawValue: data.rawValue,
        columnKind: data.columnKind,
        sqlTypeName: data.sqlTypeName,
        isAggregateRow: data.isAggregateRow,
        isPivot: data.isPivot,
        pivotDepth: data.pivotDepth,
        rowData: data.rowData,
        rid: data.rid,
      }, stateRef);
    },
    [stateRef]
  );

  const handleEditSave = React.useCallback(
    async (newValue: string) => {
      await actions.commitCellEdit(newValue, stateRef);
    },
    [stateRef]
  );

  const handleEditCancel = React.useCallback(() => {
    actions.cancelCellEdit(stateRef);
  }, [stateRef]);

  // Column rename state
  const [renameState, setRenameState] = React.useState<{
    isOpen: boolean;
    columnId: string;
    newName: string;
  }>({ isOpen: false, columnId: "", newName: "" });

  const handleColumnRename = React.useCallback(
    (columnId: string) => {
      setRenameState({ isOpen: true, columnId, newName: columnId });
    },
    []
  );

  const handleRenameSave = React.useCallback(async () => {
    const { columnId, newName } = renameState;
    if (!newName.trim() || newName === columnId) {
      setRenameState((s) => ({ ...s, isOpen: false }));
      return;
    }
    // Get table name from baseQuery
    const baseQuery = viewState.baseQuery as any;
    const getTableName = (rep: any): string | null => {
      if (!rep) return null;
      if (rep.tableName) return rep.tableName;
      if (rep.from) return getTableName(rep.from);
      return null;
    };
    const tableName = getTableName(baseQuery?._rep);
    if (!tableName) {
      console.error("renameColumn: could not find table name");
      setRenameState((s) => ({ ...s, isOpen: false }));
      return;
    }
    await actions.renameColumn(tableName, columnId, newName.trim(), stateRef);
    setRenameState((s) => ({ ...s, isOpen: false }));
  }, [renameState, viewState.baseQuery, stateRef]);

  const handleRenameCancel = React.useCallback(() => {
    setRenameState((s) => ({ ...s, isOpen: false }));
  }, []);

  // Column delete confirmation state
  const [deleteState, setDeleteState] = React.useState<{
    isOpen: boolean;
    columnId: string;
  }>({ isOpen: false, columnId: "" });

  const handleColumnDelete = React.useCallback((columnId: string) => {
    setDeleteState({ isOpen: true, columnId });
  }, []);

  const handleDeleteConfirm = React.useCallback(async () => {
    const { columnId } = deleteState;
    const baseQuery = viewState.baseQuery as any;
    const getTableName = (rep: any): string | null => {
      if (!rep) return null;
      if (rep.tableName) return rep.tableName;
      if (rep.from) return getTableName(rep.from);
      return null;
    };
    const tableName = getTableName(baseQuery?._rep);
    if (!tableName) {
      console.error("deleteColumn: could not find table name");
      setDeleteState({ isOpen: false, columnId: "" });
      return;
    }
    await actions.deleteColumn(tableName, columnId, stateRef);
    setDeleteState({ isOpen: false, columnId: "" });
  }, [deleteState, viewState.baseQuery, stateRef]);

  const handleDeleteCancel = React.useCallback(() => {
    setDeleteState({ isOpen: false, columnId: "" });
  }, []);

  // Column duplicate state
  const [duplicateState, setDuplicateState] = React.useState<{
    isOpen: boolean;
    sourceColumn: string;
    newColumn: string;
  }>({ isOpen: false, sourceColumn: "", newColumn: "" });

  const handleColumnDuplicate = React.useCallback((columnId: string) => {
    setDuplicateState({ isOpen: true, sourceColumn: columnId, newColumn: `${columnId}_2` });
  }, []);

  const handleDuplicateSave = React.useCallback(async () => {
    const { sourceColumn, newColumn } = duplicateState;
    if (!newColumn.trim() || newColumn === sourceColumn) {
      setDuplicateState({ isOpen: false, sourceColumn: "", newColumn: "" });
      return;
    }
    const baseQuery = viewState.baseQuery as any;
    const getTableName = (rep: any): string | null => {
      if (!rep) return null;
      if (rep.tableName) return rep.tableName;
      if (rep.from) return getTableName(rep.from);
      return null;
    };
    const tableName = getTableName(baseQuery?._rep);
    if (!tableName) {
      console.error("duplicateColumn: could not find table name");
      setDuplicateState({ isOpen: false, sourceColumn: "", newColumn: "" });
      return;
    }
    await actions.duplicateColumn(tableName, sourceColumn, newColumn.trim(), stateRef);
    setDuplicateState({ isOpen: false, sourceColumn: "", newColumn: "" });
  }, [duplicateState, viewState.baseQuery, stateRef]);

  const handleDuplicateCancel = React.useCallback(() => {
    setDuplicateState({ isOpen: false, sourceColumn: "", newColumn: "" });
  }, []);

  // Column histogram dialog state (lives in AppState so it can be opened
  // from the app menu)
  const handleOpenHistogram = React.useCallback(
    (columnId: string) => actions.openColumnHistogram(columnId, stateRef),
    [stateRef]
  );

  const handleCloseHistogram = React.useCallback(
    () => actions.closeColumnHistogram(stateRef),
    [stateRef]
  );

  const handleCloseSplom = React.useCallback(
    () => actions.closeSplom(stateRef),
    [stateRef]
  );

  const handleCloseScatterPlot = React.useCallback(
    () => actions.closeScatterPlot(stateRef),
    [stateRef]
  );

  const handleCloseConfusionMatrix = React.useCallback(
    () => actions.closeConfusionMatrix(stateRef),
    [stateRef]
  );

  const handleCloseCorrelationMatrix = React.useCallback(
    () => actions.closeCorrelationMatrix(stateRef),
    [stateRef]
  );

  const handleCloseKnowledgeGraph = React.useCallback(
    () => actions.closeKnowledgeGraph(stateRef),
    [stateRef]
  );

  // A non-diagonal SPLOM cell was clicked: open that XY pair as a standalone
  // Scatter Plot dialog (closing the SPLOM).
  const handleOpenScatterPlotForPair = React.useCallback(
    (xColId: string, yColId: string) =>
      actions.openScatterPlotForPair(xColId, yColId, stateRef),
    [stateRef]
  );

  const handleSelectHistogramColumn = React.useCallback(
    (columnId: string) => actions.openColumnHistogram(columnId, stateRef),
    [stateRef]
  );

  const handleCategoryFilter = React.useCallback(
    (colId: string, values: string[], includeNull: boolean) =>
      actions.setCategoryHistogramFilter(colId, values, includeNull, stateRef),
    [stateRef]
  );

  // Scatter plot matrix dialog (opened from the Analytics menu): a 2D brush
  // becomes an analytics filter on both axes.
  const handleSplomBrushFilter = React.useCallback(
    (
      xColId: string,
      xRange: [number, number] | null,
      yColId: string,
      yRange: [number, number] | null
    ) =>
      actions.setSplomBrushFilter(xColId, xRange, yColId, yRange, stateRef),
    [stateRef]
  );

  // Standalone Scatter Plot brush: per-axis clauses (numeric range or
  // categorical IN) forwarded straight to the coupled action.
  const handleScatterPlotBrushFilter = React.useCallback(
    (
      xArg: ScatterAxisFilterArg,
      yArg: ScatterAxisFilterArg
    ) => actions.setScatterPlotBrushFilter(xArg, yArg, stateRef),
    [stateRef]
  );

  // Insert column state
  const [insertColumnState, setInsertColumnState] = React.useState<{
    isOpen: boolean;
    newColumn: string;
  }>({ isOpen: false, newColumn: "" });

  const genUniqueColumnName = React.useCallback(
    (baseName: string): string => {
      const existing = new Set(
        (viewState.baseSchema ? viewState.baseSchema.columns : []).filter(
          (cid) => !cid.startsWith("_") && cid !== "Rec"
        )
      );
      let candidate = baseName;
      let i = 2;
      while (existing.has(candidate)) {
        candidate = `${baseName}_${i}`;
        i++;
      }
      return candidate;
    },
    [viewState.baseSchema]
  );

  const handleInsertColumn = React.useCallback(
    (columnId: string) => {
      const suggested = genUniqueColumnName(
        columnId ? `${columnId}_new` : "new_column"
      );
      setInsertColumnState({ isOpen: true, newColumn: suggested });
    },
    [genUniqueColumnName]
  );

  const handleInsertColumnSave = React.useCallback(async () => {
    const { newColumn } = insertColumnState;
    if (!newColumn.trim()) {
      setInsertColumnState({ isOpen: false, newColumn: "" });
      return;
    }
    const baseQuery = viewState.baseQuery as any;
    const getTableName = (rep: any): string | null => {
      if (!rep) return null;
      if (rep.tableName) return rep.tableName;
      if (rep.from) return getTableName(rep.from);
      return null;
    };
    const tableName = getTableName(baseQuery?._rep);
    if (!tableName) {
      console.error("insertColumn: could not find table name");
      setInsertColumnState({ isOpen: false, newColumn: "" });
      return;
    }
    await actions.insertColumn(tableName, newColumn.trim(), stateRef);
    setInsertColumnState({ isOpen: false, newColumn: "" });
  }, [insertColumnState, viewState.baseQuery, stateRef]);

  const handleInsertColumnCancel = React.useCallback(() => {
    setInsertColumnState({ isOpen: false, newColumn: "" });
  }, []);

  // Row operations from cell selection
  const handleDeleteRows = React.useCallback(
    async (rowDataList: { [columnId: string]: any }[]) => {
      await actions.deleteRows(rowDataList, stateRef);
    },
    [stateRef]
  );

  const handleDuplicateRows = React.useCallback(
    async (rowDataList: { [columnId: string]: any }[]) => {
      await actions.duplicateRows(rowDataList, stateRef);
    },
    [stateRef]
  );

  const handleInsertRow = React.useCallback(async () => {
    await actions.insertRow(stateRef);
  }, [stateRef]);

  const handleDeleteAggregateRows = React.useCallback(
    async (item: any, depth: number) => {
      await actions.deleteAllAggregateRows(item, depth, stateRef);
    },
    [stateRef]
  );

  const handleDuplicateAggregateRows = React.useCallback(
    async (item: any, depth: number) => {
      await actions.duplicateAllAggregateRows(item, depth, stateRef);
    },
    [stateRef]
  );

  const dataGridProps: DataGridProps = {
    dataView,
    showColumnHistograms,
    histoMap,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    showLoadingModal,
    showHiddenColumns,
    displayColumns,
    onViewportChanged,
    onHistogramBrushRange,
    onHistogramBrushFilter,
    onSetSortKey,
    onGridClick,
    onGridSelectionChange,
    onSetColumnOrder,
    onCellEditStart: handleEditStart,
    onColumnRename: handleColumnRename,
    onColumnDelete: handleColumnDelete,
    onColumnDuplicate: handleColumnDuplicate,
    onInsertColumn: handleInsertColumn,
    onColumnHistogram: handleOpenHistogram,
    onDeleteRows: handleDeleteRows,
    onDuplicateRows: handleDuplicateRows,
    onInsertRow: handleInsertRow,
    onDeleteAggregateRows: handleDeleteAggregateRows,
    onDuplicateAggregateRows: handleDuplicateAggregateRows,
    vpivots: viewParams.vpivots,
    sortKey,
    isPivoted,
    clipboard,
    openURL,
    embedded,
  };

  return (
    <>
      <DataGrid {...dataGridProps} />
      <CellEditModal
        isOpen={editingCell !== null}
        columnId={editingCell?.columnId ?? ""}
        columnDisplayName={editingCell?.columnId ?? ""}
        currentValue={editingCell?.value}
        columnKind={editingCell?.columnKind ?? "string"}
        sqlTypeName={editingCell?.sqlTypeName}
        isAggregateRow={editingCell?.isAggregateRow ?? false}
        isPivot={editingCell?.isPivot ?? false}
        onSave={handleEditSave}
        onCancel={handleEditCancel}
      />
      <Dialog
        isOpen={renameState.isOpen}
        title="Rename Column"
        onClose={handleRenameCancel}
        canOutsideClickClose={true}
      >
        <div className="bp4-dialog-body">
          <label className="bp4-label">
            New name for "{renameState.columnId}":
            <input
              className="bp4-input bp4-fill"
              type="text"
              value={renameState.newName}
              onChange={(e) => setRenameState((s) => ({ ...s, newName: e.target.value }))}
              autoFocus
            />
          </label>
        </div>
        <div className="bp4-dialog-footer">
          <div className="bp4-dialog-footer-actions">
            <Button onClick={handleRenameCancel}>Cancel</Button>
            <Button
              intent={Intent.PRIMARY}
              onClick={handleRenameSave}
              disabled={!renameState.newName.trim() || renameState.newName === renameState.columnId}
            >
              Rename
            </Button>
          </div>
        </div>
      </Dialog>
      <Alert
        isOpen={deleteState.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        intent={Intent.DANGER}
        confirmButtonText="Yes, Delete"
        cancelButtonText="Cancel"
      >
        <p>
          Are you sure you want to delete column <strong>"{deleteState.columnId}"</strong>?
          This will drop all its content.
        </p>
      </Alert>
      <Dialog
        isOpen={duplicateState.isOpen}
        title="Duplicate Column"
        onClose={handleDuplicateCancel}
        canOutsideClickClose={true}
      >
        <div className="bp4-dialog-body">
          <label className="bp4-label">
            New name for duplicate of "{duplicateState.sourceColumn}":
            <input
              className="bp4-input bp4-fill"
              type="text"
              value={duplicateState.newColumn}
              onChange={(e) => setDuplicateState((s) => ({ ...s, newColumn: e.target.value }))}
              autoFocus
            />
          </label>
        </div>
        <div className="bp4-dialog-footer">
          <div className="bp4-dialog-footer-actions">
            <Button onClick={handleDuplicateCancel}>Cancel</Button>
            <Button
              intent={Intent.PRIMARY}
              onClick={handleDuplicateSave}
              disabled={!duplicateState.newColumn.trim() || duplicateState.newColumn === duplicateState.sourceColumn}
            >
              Duplicate
            </Button>
          </div>
        </div>
      </Dialog>
      <Dialog
        isOpen={insertColumnState.isOpen}
        title="Insert Column"
        onClose={handleInsertColumnCancel}
        canOutsideClickClose={true}
      >
        <div className="bp4-dialog-body">
          <label className="bp4-label">
            Name for the new empty column:
            <input
              className="bp4-input bp4-fill"
              type="text"
              value={insertColumnState.newColumn}
              onChange={(e) => setInsertColumnState((s) => ({ ...s, newColumn: e.target.value }))}
              autoFocus
            />
          </label>
        </div>
        <div className="bp4-dialog-footer">
          <div className="bp4-dialog-footer-actions">
            <Button onClick={handleInsertColumnCancel}>Cancel</Button>
            <Button
              intent={Intent.PRIMARY}
              onClick={handleInsertColumnSave}
              disabled={!insertColumnState.newColumn.trim()}
            >
              Insert
            </Button>
          </div>
        </div>
      </Dialog>
      <HistogramDialog
        appState={appState}
        stateRef={stateRef}
        colId={appState.histogramDialogColId}
        onClose={handleCloseHistogram}
        onSelectColumn={handleSelectHistogramColumn}
        onBrushFilter={onHistogramBrushFilter}
        onCategoryFilter={handleCategoryFilter}
      />
      <SplomDialog
        appState={appState}
        stateRef={stateRef}
        onClose={handleCloseSplom}
        onOpenDistribution={handleSelectHistogramColumn}
        onOpenScatterPlot={handleOpenScatterPlotForPair}
      />
      <ScatterPlotDialog
        appState={appState}
        stateRef={stateRef}
        onClose={handleCloseScatterPlot}
        onBrushFilter={handleScatterPlotBrushFilter}
      />
      <ConfusionMatrixDialog
        appState={appState}
        stateRef={stateRef}
        onClose={handleCloseConfusionMatrix}
        onFilter={(rowArg, colArg) =>
          actions.setConfusionMatrixFilter(rowArg, colArg, stateRef)
        }
        onClearFilter={(rowColId, colColId) =>
          actions.clearConfusionMatrixFilter(rowColId, colColId, stateRef)
        }
      />
      <CorrelationMatrixDialog
        appState={appState}
        stateRef={stateRef}
        onClose={handleCloseCorrelationMatrix}
      />
      <KnowledgeGraphDialog
        appState={appState}
        stateRef={stateRef}
        onClose={handleCloseKnowledgeGraph}
      />
    </>
  );
};

// TODO: It might be better to move this memoization down a level into DataGrid,
// but we'll leave it here for now
const gridPanePropsEqual = (oldProps: any, nextProps: any): boolean => {
  const viewState = oldProps.viewState;
  const nextViewState = nextProps.viewState;
  const omitPred = (val: any, key: string, obj: Object) =>
    key.startsWith("viewport");
  // N.B.: We use toObject rather than toJS because we only want a
  // shallow conversion
  const vs = _.omitBy(viewState.toObject(), omitPred);
  const nvs = _.omitBy(nextViewState.toObject(), omitPred);
  const ret =
    util.shallowEqual(vs, nvs) &&
    oldProps.appState.showColumnHistograms ===
      nextProps.appState.showColumnHistograms &&
    oldProps.appState.histogramDialogColId ===
      nextProps.appState.histogramDialogColId &&
    oldProps.appState.splomDialogOpen ===
      nextProps.appState.splomDialogOpen &&
    oldProps.appState.scatterPlotDialogOpen ===
      nextProps.appState.scatterPlotDialogOpen &&
    oldProps.appState.confusionMatrixDialogOpen ===
      nextProps.appState.confusionMatrixDialogOpen &&
    oldProps.appState.correlationMatrixDialogOpen ===
      nextProps.appState.correlationMatrixDialogOpen &&
    oldProps.appState.knowledgeGraphDialogOpen ===
      nextProps.appState.knowledgeGraphDialogOpen;
  return ret;
};

export const GridPane = React.memo(GridPaneInternal, gridPanePropsEqual);
