/**
 *
 * A DataGrid component, implemented using SlickGrid.
 *
 * This is a refactor of the original GridPane that decouples SlickGrid from Tad. The goal is to define a virtual DataGrid React
 * component that does not have any Tad or SlickGrid details in the
 */
// for debugging resize handler:
// import $ from 'jquery'
import _ from "lodash";
import * as React from "react";

/* /// <reference path="slickgrid-es6.d.ts"> */
import { ResizeSensor } from "@blueprintjs/core";
import * as he from "he";
import { useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import * as reltab from "reltab";
import { ColumnKind, ColumnType, NumericColumnHistogramData } from "reltab";
import * as SlickGrid from "slickgrid-es6";
import {
  VictoryAxis,
  VictoryBar,
  VictoryBrushContainer,
  VictoryChart,
} from "victory";
import { CellFormatter } from "../FormatOptions";
import { DataRow, PagedDataView } from "../PagedDataView";
import { LoadingModal } from "./LoadingModal";
import { Cell } from "./SelectionChangeData";
import { SimpleClipboard } from "./SimpleClipboard";

const { Slick } = SlickGrid;
const { Plugins } = SlickGrid as any;
const { CellRangeSelector, CellSelectionModel, CellCopyManager, AutoTooltips } =
  Plugins;

export type OpenURLFn = (url: string) => void;

export interface CellEditStartData {
  row: number;
  col: number;
  columnId: string;
  value: any;
  rawValue: any;
  columnKind: ColumnKind;
  sqlTypeName?: string;
  isPivot: boolean;
  pivotDepth?: number;
  isAggregateRow: boolean;
  rowData: { [columnId: string]: any };
}

let divCounter = 0;

const genContainerId = (): string => `epGrid${divCounter++}`;

const baseGridOptions = {
  multiColumnSort: true,
  headerRowHeight: 80,
};

const INDENT_PER_LEVEL = 15; // pixels

const calcIndent = (depth: number): number => INDENT_PER_LEVEL * depth;

/*
 * Formatter for cells in pivot column
 */
const groupCellFormatter = (
  row: any,
  cell: any,
  value: any,
  columnDef: any,
  item: any
) => {
  const toggleCssClass = "slick-group-toggle";
  const toggleExpandedCssClass = "expanded";
  const toggleCollapsedCssClass = "collapsed";
  const groupTitleCssClass = "slick-group-title";

  var indentation = calcIndent(item._depth) + "px";

  // We could consider using the text formatter from ViewParams here, but
  // for now let's just use he.encode() to ensure reasonable escaping
  // of special characters and avoid any HTML / JS injection issues:
  var pivotStr = item._pivot == null ? "" : he.encode(item._pivot);

  const expandClass = !item._isLeaf
    ? item._isOpen
      ? toggleExpandedCssClass
      : toggleCollapsedCssClass
    : "";
  const ret = `
<span class='${toggleCssClass} ${expandClass}' style='margin-left: ${indentation}'>
</span>
<span class='${groupTitleCssClass}' level='${item._depth}'>${pivotStr}</span>`;
  return ret;
};

// scan table data to make best effort at initial column widths
const MINCOLWIDTH = 60;
const MAXCOLWIDTH = 330;

const CHAR_WIDTH = 7.0; // max width of a character in the font used

// TODO: use real font metrics:
const measureStringWidth = (s: string): number => 8 + CHAR_WIDTH * s.length;
const measureHeaderStringWidth = (s: string): number =>
  24 + CHAR_WIDTH * s.length;

// get column width for specific column:
const getColWidth = (
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  cnm: string
) => {
  const { schema } = dataView;
  let sf: (val: any) => string;
  if (schema.columnIndex(cnm)) {
    const cf = getColumnFormatter(schema, cnm);
    sf = (val: any) => cf(val) ?? val.toString();
  } else {
    sf = (val: any) => val.toString();
  }
  let colWidth;
  const offset = dataView.getOffset();
  const limit = offset + dataView.getItemCount();
  for (var i = offset; i < limit; i++) {
    var row = dataView.getItem(i);
    var cellVal = row![cnm];
    var cellWidth = MINCOLWIDTH;
    if (cellVal) {
      cellWidth = measureStringWidth(sf(cellVal));
    }
    if (cnm === "_pivot") {
      cellWidth += calcIndent(row!._depth + 2);
    }
    colWidth = Math.min(
      MAXCOLWIDTH,
      Math.max(colWidth || MINCOLWIDTH, cellWidth)
    );
  }
  const displayName = dataView.schema.displayName(cnm);
  const headerStrWidth = measureHeaderStringWidth(displayName);
  colWidth = Math.min(
    MAXCOLWIDTH,
    Math.max(colWidth || MINCOLWIDTH, headerStrWidth)
  );
  return colWidth;
};

type ColWidthMap = { [cid: string]: number };

function getInitialColWidthsMap(
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView
): ColWidthMap {
  // let's approximate the column width:
  var colWidths: ColWidthMap = {};
  var nRows = dataView.getLength();
  if (nRows === 0) {
    return {};
  }
  const initRow = dataView.getItem(0);
  for (let cnm in initRow) {
    colWidths[cnm] = getColWidth(getColumnFormatter, dataView, cnm);
  }

  return colWidths;
}

/*
 * Construct map of SlickGrid column descriptors from base schema
 * and column width info
 *
 * Map should contain entries for all column ids
 */
const mkSlickColMap = (
  schema: reltab.Schema,
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  getColumnCssClassName: (schema: reltab.Schema, cid: string) => string | null,
  pivotColumnDisplayName: string,
  colWidths: ColWidthMap
) => {
  let slickColMap: any = {};

  // hidden columns:
  slickColMap["_id"] = { id: "_id", field: "_id", name: "_id" };
  slickColMap["_parentId"] = {
    id: "_parentId",
    field: "_parentId",
    name: "_parentId",
  };
  for (let colId of schema.columns) {
    let cmd = schema.columnMetadata[colId];
    if (!cmd) {
      console.error("could not find column metadata for ", colId, schema);
    }
    let ci: any = {
      id: colId,
      field: colId,
      cssClass: "",
      name: "",
      formatter: null,
    };
    if (colId === "_pivot") {
      ci.cssClass = "pivot-column";
      ci.name = he.encode(pivotColumnDisplayName);
      ci.toolTip = he.encode(pivotColumnDisplayName);
      ci.formatter = groupCellFormatter;
    } else {
      var displayName = cmd.displayName || colId;
      ci.name = he.encode(displayName);
      ci.toolTip = he.encode(displayName);
      ci.sortable = true;
      const ff = getColumnFormatter(schema, colId);
      const cellClass = getColumnCssClassName(schema, colId);
      if (cellClass != null) {
        ci.cssClass = cellClass;
      }
      ci.formatter = (
        row: any,
        cell: any,
        value: any,
        columnDef: any,
        item: any
      ) => (ff as any)(value);
    }
    ci.width = colWidths[colId];
    slickColMap[colId] = ci;
  }
  return slickColMap;
};

interface NumericColumnHistogramProps {
  histData: NumericColumnHistogramData;
  colType: ColumnType;
  onHistogramBrushRange?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  onHistogramBrushFilter?: (
    colId: string,
    range: [number, number] | null
  ) => void;
}

// gross hack to round to two decimal places:
function round(value: number, decimals: number): number {
  return Number(
    Math.round(Number(value.toString() + "e" + decimals.toString())) +
      "e-" +
      decimals
  );
}
const NumericColumnHistogram = ({
  colType,
  histData,
  onHistogramBrushRange,
  onHistogramBrushFilter,
}: NumericColumnHistogramProps) => {
  const {
    colId,
    binWidth,
    niceMinVal,
    niceMaxVal,
    binData,
    brushMinVal,
    brushMaxVal,
  } = histData;
  const chartData = binData.map((count: number, binIndex: number) => ({
    binMid: niceMinVal + (binIndex + 0.5) * binWidth,
    count,
  }));
  const fmtOpts = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  };

  const handleBrush = (brushInfo: any) => {
    onHistogramBrushRange?.(colId, brushInfo.x);
  };
  const handleBrushEnd = (brushInfo: any) => {
    let [minVal, maxVal] = brushInfo.x;
    if (colType.kind === "integer") {
      minVal = Math.round(minVal);
      maxVal = Math.round(maxVal);
    } else {
      minVal = round(minVal, 2);
      maxVal = round(maxVal, 2);
    }
    onHistogramBrushFilter?.(colId, [minVal, maxVal]);
  };

  return (
    <VictoryChart
      padding={60}
      domain={{ x: [niceMinVal, niceMaxVal + binWidth * 2] }}
      containerComponent={
        <VictoryBrushContainer
          responsive={true}
          brushDimension="x"
          brushDomain={{ x: [brushMinVal, brushMaxVal] }}
          onBrushDomainChange={handleBrush}
          onBrushDomainChangeEnd={handleBrushEnd}
        />
      }
    >
      <VictoryAxis
        tickValues={[niceMinVal, niceMaxVal]}
        tickFormat={(tick: number) => tick.toLocaleString(undefined, fmtOpts)}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryAxis
        dependentAxis
        tickCount={2}
        style={{
          axis: { stroke: "none" },
          tickLabels: { fontSize: 40 },
        }}
      />
      <VictoryBar
        style={{ data: { fill: "rgb(25, 118, 210)" } }}
        data={chartData}
        x="binMid"
        y="count"
      />
    </VictoryChart>
  );
};

const getGridOptions = ({ showColumnHistograms, histoMap }: DataGridProps) => {
  const histoCount = histoMap ? Object.keys(histoMap).length : 0;

  const showHeaderRow = showColumnHistograms && histoCount > 0;
  const gridOptions = {
    ...baseGridOptions,
    showHeaderRow,
  };
  return gridOptions;
};

// escape tabs by placing string in quotes
function escapeTabs(cellData: any): any {
  if (typeof cellData === "string" && cellData.indexOf("\t") >= 0) {
    return '"' + cellData.replace(/"/g, '""') + '"';
  }
  return cellData;
}

// Extract unique row indices from SlickGrid selection ranges
function getUniqueRowsFromRanges(ranges: any[], grid: any): number[] {
  const rowSet = new Set<number>();
  if (!ranges || ranges.length === 0) {
    // No selection — use the right-clicked row
    const activeCell = grid.getActiveCell();
    if (activeCell) {
      rowSet.add(activeCell.row);
    }
  } else {
    for (const range of ranges) {
      for (let r = range.fromRow; r <= range.toRow; r++) {
        rowSet.add(r);
      }
    }
  }
  return Array.from(rowSet).sort((a, b) => a - b);
}

/* Create grid from the specified set of columns */
const createGrid = (
  containerId: string,
  columns: any,
  dataView: any,
  props: DataGridProps
) => {
  const {
    histoMap,
    onViewportChanged,
    onHistogramBrushRange,
    onHistogramBrushFilter,
    onSetSortKey,
    onGridClick,
    onGridSelectionChange,
    onSetColumnOrder,
    onCellEditStart,
    onColumnRename,
    onColumnDelete,
    onColumnDuplicate,
    onDeleteRows,
    onDuplicateRows,
    onDeleteAggregateRows,
    onDuplicateAggregateRows,
    vpivots,
    sortKey,
    clipboard,
    openURL,
    embedded,
  } = props;

  const gridOptions = getGridOptions(props);
  let grid = new Slick.Grid(`#${containerId}`, dataView, columns, gridOptions);

  const selectionModel = new CellSelectionModel();
  grid.setSelectionModel(selectionModel);
  selectionModel.onSelectedRangesChanged.subscribe((e: any, args: any) => {
    const { fromCell, toCell, fromRow, toRow } = args[0];

    const selectedColumns = grid
      .getColumns()
      .slice(fromCell, toCell + 1)
      .map((col: any) => col.id);

    let items = [];
    const gridCols = grid.getColumns();
    const gridData = grid.getData();

    for (let row = fromRow; row <= toRow; row++) {
      const rowData = gridData.getItem(row);
      const selectedDataInRow = [];
      for (let col = fromCell; col <= toCell; col++) {
        const cid = gridCols[col].id;
        selectedDataInRow.push(rowData[cid]);
      }
      items.push(selectedDataInRow);
    }

    onGridSelectionChange?.(
      { row: fromRow, column: fromCell },
      { row: toRow, column: toCell },
      selectedColumns,
      items
    );
  });

  const copyManager = new CellCopyManager();
  grid.registerPlugin(copyManager);
  grid.registerPlugin(new AutoTooltips({ enableForCells: true }));

  const copySelectedRange = async (range: any) => {
    let copyRowStrings: string[] = [];
    const gridCols = grid.getColumns();
    const gridData = grid.getData();
    for (let row = range.fromRow; row <= range.toRow; row++) {
      const rowData = gridData.getItem(row);
      const copyRow = [];
      for (let col = range.fromCell; col <= range.toCell; col++) {
        const cid = gridCols[col].id;
        copyRow.push(escapeTabs(rowData[cid]));
      }
      copyRowStrings.push(copyRow.join("\t"));
    }
    const copyData = copyRowStrings.join("\r\n");
    clipboard.writeText(copyData);
  };

  copyManager.onCopyCells.subscribe(async (e: any, args: any) => {
    const range = args.ranges[0];
    copySelectedRange(range);
  });

  // gross hack, but makes copy menu item work in Electron:
  if (!embedded) {
    document.addEventListener("copy", function (e) {
      const ranges = grid.getSelectionModel().getSelectedRanges();
      if (ranges && ranges.length != 0) {
        copySelectedRange(ranges[0]);
      }
    });
  }
  const rangeSelector = new CellRangeSelector();

  grid.registerPlugin(rangeSelector);

  const updateViewportDebounced = _.debounce(() => {
    const vp = grid.getViewport();
    onViewportChanged?.(vp.top, vp.bottom);
  }, 100);

  grid.onViewportChanged.subscribe((e: any, args: any) => {
    updateViewportDebounced();
  });

  grid.onHeaderRowCellRendered.subscribe((e: any, { node, column }: any) => {
    console.log("onHeaderRowCellRendered: ", column);
    if (dataView && histoMap && histoMap[column.id]) {
      const histo = histoMap[column.id];
      const colType = dataView.schema.columnType(column.id);
      const root = ReactDOM.createRoot(node);
      root.render(
        <NumericColumnHistogram
          histData={histo}
          colType={colType}
          onHistogramBrushRange={onHistogramBrushRange}
          onHistogramBrushFilter={onHistogramBrushFilter}
        />
      );
      node.classList.add("slick-editable");
    } else {
      console.log("*** no histo for column: ", column.id);
    }
  });

  grid.onSort.subscribe((e: any, args: any) => {
    // console.log("grid onSort: ", args);
    // convert back from slickGrid format: */
    const sortKey = args.sortCols.map((sc: any) => [
      sc.sortCol.field,
      sc.sortAsc,
    ]);
    onSetSortKey?.(sortKey);
  });

  const handleGridClick = (e: any, args: any) => {
    // log.info("onGridClick: ", e, args);
    const columns = grid.getColumns();
    const col = columns[args.cell];
    var item = grid.getDataItem(args.row);
    if (!col || !item) return;

    onGridClick?.(args.row, args.cell, item, col.id, item[col.id]);
  };

  grid.onClick.subscribe(handleGridClick);

  grid.onDblClick.subscribe((_event: Event, data: any) => {
    const currentDataView = grid.getData();
    const item = currentDataView.getItem(data.row);
    const columns = grid.getColumns();
    const column = columns[data.cell];

    // Exclude system columns
    if (["_", "_id", "_parentId", "Rec"].includes(column.id)) {
      return;
    }

    // Exclude _pivot column on leaf rows (no pivot column to update)
    if (item && item._isLeaf && column.id === "_pivot") {
      return;
    }

    const value = item ? item[column.id] : null;
    const colType = currentDataView.schema?.columnType(column.id);
    const formattedValue = colType ? colType.stringRender(value) : String(value ?? "");
    
    // Extract row data (excluding metadata columns), store raw values
    const rowData: { [columnId: string]: any } = {};
    if (item) {
      for (const key of Object.keys(item)) {
        if (!key.startsWith('_') && key !== 'Rec') {
          rowData[key] = item[key];
        }
      }
    }
    
    onCellEditStart?.({
      row: data.row,
      col: data.cell,
      columnId: column.id,
      value: formattedValue,
      rawValue: value,
      columnKind: colType?.kind ?? "string",
      sqlTypeName: colType?.sqlTypeName,
      isPivot: column.id === "_pivot",
      pivotDepth: item?._depth,
      isAggregateRow: !item?._isLeaf,
      rowData,
    });
  });

  // Cell right-click context menu for editing
  grid.onContextMenu.subscribe((event: any, _args: any) => {
    event.preventDefault();
    const cellInfo = grid.getCellFromEvent(event);
    if (!cellInfo) return;

    // Simulate a left-click at the same position so the cell under the
    // right-click cursor gets selected (highlighted) too.
    const row = cellInfo.row;
    const cell = cellInfo.cell;
    grid.setActiveCell(row, cell);
    const selModel = grid.getSelectionModel();
    if (selModel) {
      selModel.setSelectedRanges([new Slick.Range(row, cell)]);
    }

    const currentDataView = grid.getData();
    const item = currentDataView.getItem(cellInfo.row);
    const columns = grid.getColumns();
    const column = columns[cellInfo.cell];
    if (!column || !item) return;

    // Exclude system columns
    if (["_", "_id", "_parentId", "Rec"].includes(column.id)) {
      return;
    }

    // Exclude _pivot column on leaf rows (no pivot column to update)
    if (item._isLeaf && column.id === "_pivot") {
      return;
    }

    // Remove any existing context menu
    const existing = document.getElementById("cell-ctx-menu");
    if (existing) existing.remove();

    const value = item ? item[column.id] : null;
    const colType = currentDataView.schema?.columnType(column.id);
    const formattedValue = colType
      ? colType.stringRender(value)
      : String(value ?? "");

    // Extract row data (excluding metadata columns), store raw values
    const rowData: { [columnId: string]: any } = {};
    if (item) {
      for (const key of Object.keys(item)) {
        if (!key.startsWith("_") && key !== "Rec") {
          rowData[key] = item[key];
        }
      }
    }

    const isPivotCell = column.id === "_pivot";
    const isAggregate = item && !item._isLeaf;

    const cellEditData: CellEditStartData = {
      row: cellInfo.row,
      col: cellInfo.cell,
      columnId: column.id,
      value: formattedValue,
      rawValue: value,
      columnKind: colType?.kind ?? "string",
      sqlTypeName: colType?.sqlTypeName,
      isPivot: isPivotCell,
      pivotDepth: item?._depth,
      isAggregateRow: isAggregate,
      rowData,
    };

    const menu = document.createElement("div");
    menu.id = "cell-ctx-menu";
    menu.className = "bp4-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "9999";
    menu.style.left = `${(event.originalEvent ?? event).clientX}px`;
    menu.style.top = `${(event.originalEvent ?? event).clientY}px`;

    const menuItem = document.createElement("div");
    menuItem.className = "bp4-menu-item";
    // Aggregate rows always say "Edit all"; leaf rows say "Edit"
    menuItem.textContent = isAggregate ? "Edit all" : "Edit";
    menuItem.addEventListener("click", () => {
      menu.remove();
      onCellEditStart?.(cellEditData);
    });
    menu.appendChild(menuItem);

    // Add separator
    const sep1 = document.createElement("div");
    sep1.className = "bp4-menu-divider";
    menu.appendChild(sep1);

    // Delete Rows item
    const deleteRowsItem = document.createElement("div");
    deleteRowsItem.className = "bp4-menu-item";
    deleteRowsItem.textContent = "Delete Rows";
    deleteRowsItem.addEventListener("click", () => {
      menu.remove();
      // Get selected rows from selection model
      const ranges = grid.getSelectionModel().getSelectedRanges();
      const selectedRows = getUniqueRowsFromRanges(ranges, grid);
      // Get data for each selected row
      const dv = grid.getData();
      const rowDataList = selectedRows
        .map((rowIdx: number) => dv.getItem(rowIdx))
        .filter((item: any) => item);
      onDeleteRows?.(rowDataList);
    });
    menu.appendChild(deleteRowsItem);

    // Duplicate Rows item
    const dupRowsItem = document.createElement("div");
    dupRowsItem.className = "bp4-menu-item";
    dupRowsItem.textContent = "Duplicate Rows";
    dupRowsItem.addEventListener("click", () => {
      menu.remove();
      const ranges = grid.getSelectionModel().getSelectedRanges();
      const selectedRows = getUniqueRowsFromRanges(ranges, grid);
      const dv = grid.getData();
      const rowDataList = selectedRows
        .map((rowIdx: number) => dv.getItem(rowIdx))
        .filter((item: any) => item);
      onDuplicateRows?.(rowDataList);
    });
    menu.appendChild(dupRowsItem);

    // Aggregate-only items
    if (isAggregate) {
      const sep2 = document.createElement("div");
      sep2.className = "bp4-menu-divider";
      menu.appendChild(sep2);

      const delAggItem = document.createElement("div");
      delAggItem.className = "bp4-menu-item";
      delAggItem.textContent = "Delete All Aggregate Rows";
      delAggItem.addEventListener("click", () => {
        menu.remove();
        onDeleteAggregateRows?.(item, item._depth);
      });
      menu.appendChild(delAggItem);

      const dupAggItem = document.createElement("div");
      dupAggItem.className = "bp4-menu-item";
      dupAggItem.textContent = "Duplicate All Aggregate Rows";
      dupAggItem.addEventListener("click", () => {
        menu.remove();
        onDuplicateAggregateRows?.(item, item._depth);
      });
      menu.appendChild(dupAggItem);
    }

    // Copy items (available for all rows)
    const sep3 = document.createElement("div");
    sep3.className = "bp4-menu-divider";
    menu.appendChild(sep3);

    const copyCellsItem = document.createElement("div");
    copyCellsItem.className = "bp4-menu-item";
    copyCellsItem.textContent = "Copy (cells)";
    copyCellsItem.addEventListener("click", () => {
      menu.remove();
      const ranges = grid.getSelectionModel().getSelectedRanges();
      if (ranges && ranges.length > 0) {
        copySelectedRange(ranges[0]);
      }
    });
    menu.appendChild(copyCellsItem);

    const copyRowsItem = document.createElement("div");
    copyRowsItem.className = "bp4-menu-item";
    copyRowsItem.textContent = "Copy (rows)";
    copyRowsItem.addEventListener("click", () => {
      menu.remove();
      const ranges = grid.getSelectionModel().getSelectedRanges();
      const selectedRows = getUniqueRowsFromRanges(ranges, grid);
      // Get visible non-metadata columns
      const visibleCols = grid.getColumns().filter(
        (c: any) => !c.id.startsWith("_") && c.id !== "Rec"
      );
      const dv = grid.getData();
      // Build TSV with header
      const header = visibleCols.map((c: any) => c.name).join("\t");
      const rows = selectedRows.map((rowIdx: number) => {
        const item = dv.getItem(rowIdx);
        return visibleCols.map((c: any) => escapeTabs(item[c.id])).join("\t");
      });
      clipboard.writeText([header, ...rows].join("\r\n"));
    });
    menu.appendChild(copyRowsItem);

    document.body.appendChild(menu);

    // Close menu on outside click
    const closeMenu = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  });

  grid.onColumnsReordered.subscribe((e: any, args: any) => {
    const cols = grid.getColumns();
    const displayColIds = cols
      .map((c: any) => c.field)
      .filter((cid: any) => cid[0] !== "_");
    onSetColumnOrder?.(displayColIds);
  });

  // Column header right-click context menu for renaming
  grid.onHeaderContextMenu.subscribe((e: Event, args: any) => {
    e.preventDefault();
    const column = args.column;
    if (!column || column.id.startsWith("_") || column.id === "Rec") return;

    // Remove any existing context menu
    const existing = document.getElementById("col-header-ctx-menu");
    if (existing) existing.remove();

    const menu = document.createElement("div");
    menu.id = "col-header-ctx-menu";
    menu.className = "bp4-menu";
    menu.style.position = "fixed";
    menu.style.zIndex = "9999";
    menu.style.left = `${(e as MouseEvent).clientX}px`;
    menu.style.top = `${(e as MouseEvent).clientY}px`;

    const renameItem = document.createElement("div");
    renameItem.className = "bp4-menu-item";
    renameItem.textContent = "Rename";
    renameItem.addEventListener("click", () => {
      menu.remove();
      onColumnRename?.(column.id);
    });
    menu.appendChild(renameItem);

    const deleteItem = document.createElement("div");
    deleteItem.className = "bp4-menu-item";
    deleteItem.textContent = "Delete";
    deleteItem.addEventListener("click", () => {
      menu.remove();
      onColumnDelete?.(column.id);
    });
    menu.appendChild(deleteItem);

    const duplicateItem = document.createElement("div");
    duplicateItem.className = "bp4-menu-item";
    duplicateItem.textContent = "Duplicate";
    duplicateItem.addEventListener("click", () => {
      menu.remove();
      onColumnDuplicate?.(column.id);
    });
    menu.appendChild(duplicateItem);

    document.body.appendChild(menu);

    // Close menu on outside click
    const closeMenu = (ev: MouseEvent) => {
      if (!menu.contains(ev.target as Node)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    setTimeout(() => document.addEventListener("click", closeMenu), 0);
  });

  // load the first page
  grid.onViewportChanged.notify();

  return grid;
};

interface GridState {
  grid: any;
  colWidthsMap: ColWidthMap | null;
  slickColMap: any;
  containerId: string;
}

const updateColWidth = (
  gs: GridState,
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  colId: string
) => {
  const colWidth = getColWidth(getColumnFormatter, dataView, colId);
  gs.colWidthsMap![colId] = colWidth;
  gs.slickColMap[colId].width = colWidth;
};

// Get grid columns based on current column visibility settings:
const getGridCols = (
  gs: GridState,
  isPivoted: boolean,
  showHiddenColumns: boolean,
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter,
  dataView: PagedDataView,
  displayColumns: string[]
) => {
  let gridCols = displayColumns.map((cid) => gs.slickColMap[cid]);
  if (isPivoted) {
    updateColWidth(gs, getColumnFormatter, dataView!, "_pivot");
    let pivotCol = gs.slickColMap["_pivot"];
    gridCols.unshift(pivotCol);
  }
  if (showHiddenColumns) {
    const hiddenColIds = _.difference(
      _.keys(gs.slickColMap),
      gridCols.map((gc) => gc.field)
    );
    const hiddenCols = hiddenColIds.map((cid) => gs.slickColMap[cid]);
    gridCols = gridCols.concat(hiddenCols);
  }
  return gridCols;
};

/*
 * update grid from dataView
 */
const updateGrid = (gs: GridState, props: DataGridProps) => {
  const {
    dataView,
    getColumnFormatter,
    getColumnCssClassName,
    isPivoted,
    showHiddenColumns,
    displayColumns,
    pivotColumnDisplayName,
    sortKey,
  } = props;

  gs.slickColMap = mkSlickColMap(
    dataView!.schema,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName ?? "",
    gs.colWidthsMap!
  );
  const gridCols = getGridCols(
    gs,
    isPivoted!,
    showHiddenColumns,
    getColumnFormatter,
    dataView!,
    displayColumns
  );

  const grid = gs.grid;

  const gridOptions = getGridOptions(props);
  // console.log("updateGrid: gridOptions: ", gridOptions);

  grid.setOptions(gridOptions);
  grid.setHeaderRowVisibility(gridOptions.showHeaderRow);

  // In pre-Hooks version, we wouldn't do this on first render (grid creation).
  // May want or need to optimize for that case.
  grid.setColumns(gridCols);
  grid.setData(dataView);

  // update sort columns:
  const vpSortKey = sortKey
    ? sortKey.map(([columnId, sortAsc]) => ({ columnId, sortAsc }))
    : [];
  grid.setSortColumns(vpSortKey);
  grid.invalidateAllRows();
  grid.updateRowCount();
  grid.render();
  grid.resizeCanvas();
};

const createGridState = (
  containerId: string,
  props: DataGridProps
): GridState => {
  const {
    dataView,
    showColumnHistograms,
    histoMap,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName,
    showLoadingModal,
    clipboard,
    openURL,
    embedded,
    isPivoted,
    showHiddenColumns,
    displayColumns,
  } = props;

  const colWidthsMap = getInitialColWidthsMap(getColumnFormatter, dataView!);
  const slickColMap = mkSlickColMap(
    dataView!.schema,
    getColumnFormatter,
    getColumnCssClassName,
    pivotColumnDisplayName ?? "",
    colWidthsMap
  );
  const gs = { grid: null, colWidthsMap, slickColMap, containerId };

  const gridCols = getGridCols(
    gs,
    isPivoted ?? false,
    showHiddenColumns,
    getColumnFormatter,
    dataView!,
    displayColumns
  );
  gs.grid = createGrid(containerId, gridCols, dataView, props);
  return gs;
};

export interface DataGridProps {
  dataView: PagedDataView | null | undefined;
  showColumnHistograms?: boolean;
  histoMap?: reltab.ColumnHistogramMap;
  getColumnFormatter: (schema: reltab.Schema, cid: string) => CellFormatter;
  getColumnCssClassName: (schema: reltab.Schema, cid: string) => string | null;
  pivotColumnDisplayName?: string;
  isPivoted?: boolean;
  showHiddenColumns: boolean;
  displayColumns: string[];
  showLoadingModal: boolean;
  clipboard: SimpleClipboard;
  onViewportChanged?: (top: number, bottom: number) => void;
  onHistogramBrushRange?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  onHistogramBrushFilter?: (
    colId: string,
    range: [number, number] | null
  ) => void;
  sortKey?: [string, boolean][];
  onSetSortKey?: (sortKey: [string, boolean][]) => void;
  onGridClick?: (
    row: number,
    column: number,
    dataRow: DataRow,
    columnId: string,
    cellVal: any
  ) => void;
  onGridSelectionChange?: (
    anchor: Cell,
    focus: Cell,
    columns: string[],
    items: any[][]
  ) => void;
  onSetColumnOrder?: (displayColumns: string[]) => void;
  onCellEditStart?: (data: CellEditStartData) => void;
  onColumnRename?: (columnId: string) => void;
  onColumnDelete?: (columnId: string) => void;
  onColumnDuplicate?: (columnId: string) => void;
  onDeleteRows?: (rowDataList: { [columnId: string]: any }[]) => void;
  onDuplicateRows?: (rowDataList: { [columnId: string]: any }[]) => void;
  onDeleteAggregateRows?: (item: any, depth: number) => void;
  onDuplicateAggregateRows?: (item: any, depth: number) => void;
  vpivots?: string[];
  openURL: OpenURLFn;
  embedded: boolean;
}

export const DataGrid: React.FunctionComponent<DataGridProps> = (
  props: DataGridProps
) => {
  const {
    dataView,
    showColumnHistograms,
    histoMap,
    showLoadingModal,
    clipboard,
    openURL,
    embedded,
  } = props;
  const containerIdRef = useRef(genContainerId());
  const [gridState, setGridState] = useState<GridState | null>(null);

  const prevShowColumnHistograms = useRef(showColumnHistograms);

  React.useLayoutEffect(() => {
    let gs = gridState;
    // The extra check here for prevShowColumnHistograms is a workaround
    // for an apparent bug in SlickGrid where it doesn't seem to re-render
    // correctly when we dynamically change the showHeaderRow option on the grid.
    if (
      gs === null ||
      (prevShowColumnHistograms.current !== showColumnHistograms && histoMap)
    ) {
      // log.debug("RawGridPane: creating grid state");
      gs = createGridState(containerIdRef.current, props);
      gs.grid.resizeCanvas();
      setGridState(gs);
      // log.debug("RawGridPane: done creating grid state");
      prevShowColumnHistograms.current = showColumnHistograms;
    }
    if (dataView != null) {
      // log.debug("RawGridPane: updating grid");
      updateGrid(gs, props);
    } else {
      // log.debug("RawGridPane: no view change, skipping grid update");
    }
  }, [dataView, gridState, showColumnHistograms]);

  const handleGridResize = () => {
    // TODO: debounce?
    if (gridState) {
      gridState.grid.resizeCanvas();
    }
  };

  const handleWindowResize = (e: any) => {
    // console.log("handleWindowResize: ", e);
    if (gridState) {
      /*
      const $container = $(container)
      console.log('$container: ', $container)
      const pvh = $.css($container[0], 'height', true)
      console.log('viewport height before resize:', pvh)
      */
      gridState.grid.resizeCanvas();
      /*
      console.log('viewport height after resize:', $.css($container[0], 'height', true))
      console.log('gridPane.handleWindowResize: done with resize and render')
      */
    }
  };

  const lm = showLoadingModal ? <LoadingModal embedded={embedded} /> : null;

  return (
    <div className="gridPaneOuter">
      <div className="gridPaneInner">
        <ResizeSensor onResize={handleGridResize}>
          <div
            id={containerIdRef.current}
            className="slickgrid-container full-height"
          />
        </ResizeSensor>
      </div>
      {lm}
    </div>
  );
};
