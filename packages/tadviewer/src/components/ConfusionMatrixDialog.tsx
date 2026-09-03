// Analytics "Confusion Matrix" dialog, opened from "Analytics > Confusion
// Matrix". The user picks a Row variable and a Column variable (the same column
// is allowed, producing a symmetric within-column co-occurrence matrix); the
// view renders the co-occurrence counts between their classes as a colored
// matrix. Numeric axes are auto-binned with an adjustable bin count; a
// minimum-occurrence threshold blanks low cells; a mode toggle switches between
// raw counts and row- or column-normalized conditional frequencies.
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import * as reltab from "reltab";
import {
  Button,
  Dialog,
  HTMLSelect,
  NumericInput,
  Slider,
  Spinner,
  Switch,
  Tooltip,
} from "@blueprintjs/core";
import { mutableGet, StateRef } from "oneref";
import { AppState } from "../AppState";
import { ConfusionMatrixViewData, loadConfusionMatrixData } from "../actions";
import { ScatterAxisFilterArg } from "./categoricalAxis";
import { ConfusionMatrixData } from "reltab";

export interface ConfusionMatrixDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
  onFilter: (
    rowArg: ScatterAxisFilterArg,
    colArg: ScatterAxisFilterArg
  ) => void;
  onClearFilter: (rowColId: string, colColId: string) => void;
}

const DEFAULT_SAMPLE = 20000;

// Cell fill interpolation from a light tint to the accent color.
const cellColor = (norm: number): string => {
  const f = Math.max(0, Math.min(norm, 1));
  const r = 163 + (59 - 163) * f;
  const g = 213 + (130 - 213) * f;
  const b = 255 + (196 - 255) * f;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

// Selection highlight, harmonized with the distribution (histogram) selection
// tint so a chosen cell reads like a selected category.
const SELECT_TINT = "#FCD5CE";

// Convert a numeric/temporal bin index into a range filter arg. Temporal bins
// are stored in epoch seconds and rendered as raw epoch ranges (the action layer
// converts them for the filter, mirroring the scatter/SPLOM filters).
const binRangeArg = (bin: reltab.CmBin | undefined): [number, number] | null => {
  if (bin == null || bin.low == null || bin.high == null) {
    return null;
  }
  return [bin.low, bin.high];
};

// A resolved (non-null-binned, post-threshold) view of the matrix: only the bins
// that actually contain a kept cell are shown, so empty rows/columns disappear
// as the bin count or the minimum-occurrence threshold changes.
interface MatrixView {
  d: ConfusionMatrixData;
  colBins: number[]; // surviving colBin indices (in order)
  rowBins: number[]; // surviving rowBin indices (in order)
  cellsByKey: Map<string, reltab.CmMatrixCell>;
  normValue: (c: reltab.CmMatrixCell) => number;
  displayValue: (c: reltab.CmMatrixCell) => string;
}

const ConfusionMatrixDialog: React.FunctionComponent<
  ConfusionMatrixDialogProps
> = ({ appState, stateRef, onClose, onFilter, onClearFilter }) => {
  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;

  const [rowColId, setRowColId] = useState<string | null>(null);
  const [colColId, setColColId] = useState<string | null>(null);
  // Default bin count is applied immediately on open (and whenever a numeric
  // axis is selected), rather than waiting for the user to touch a slider.
  const DEFAULT_BIN_COUNT = 5;
  const [rowBinCount, setRowBinCount] = useState<number | null>(
    DEFAULT_BIN_COUNT
  );
  const [colBinCount, setColBinCount] = useState<number | null>(
    DEFAULT_BIN_COUNT
  );
  const [minOccurrence, setMinOccurrence] = useState<number>(1);
  const [mode, setMode] = useState<reltab.CmMode>("count");
  const [useAllRows, setUseAllRows] = useState(false);
  const [applyTableFilters, setApplyTableFilters] = useState(true);
  const [data, setData] = useState<ConfusionMatrixViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<{
    rowBin: number;
    colBin: number;
  } | null>(null);

  const availableCols = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    return viewSchema.columns.filter(
      (cid) => !cid.startsWith("_") && cid !== "Rec"
    );
  }, [viewSchema]);

  const isNumeric = (cid: string): boolean =>
    viewSchema != null &&
    reltab.splomColKind(viewSchema.columnType(cid)) !== "categorical";

  // Default the axis selection to the first two columns the first time the
  // dialog has a schema available (only once, to preserve user edits).
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (viewSchema == null || initialized) {
      return;
    }
    if (availableCols.length >= 2) {
      setRowColId(availableCols[0]);
      setColColId(availableCols[1]);
    } else if (availableCols.length === 1) {
      setRowColId(availableCols[0]);
    }
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSchema]);

  // Swap the row and column variables (and their bin counts).
  const swapAxes = () => {
    setRowColId(colColId);
    setColColId(rowColId);
    setRowBinCount(colBinCount);
    setColBinCount(rowBinCount);
    setSelectedCell(null);
    setData(null);
  };

  // The query and schema whose data the matrix should describe (mirrors the
  // ScatterPlot's getViewQueryAndSchema, honoring "Apply Table Filters").
  function getViewQueryAndSchema(): {
    query: reltab.QueryExp;
    schema: reltab.Schema;
  } | null {
    const app = mutableGet(stateRef);
    const v = app.viewState;
    if (!v?.dbc || !v.baseQuery || !v.baseSchema) {
      return null;
    }
    if (v.viewParams.vpivots.length > 0) {
      return {
        query: v.queryView != null ? v.queryView.query : v.baseQuery,
        schema: v.dataView?.schema != null ? v.dataView.schema : v.baseSchema,
      };
    }
    let query = v.baseQuery;
    const tableFE = v.viewParams.filterExp;
    if (applyTableFilters && tableFE != null && tableFE.opArgs.length > 0) {
      query = v.baseQuery.filter(tableFE);
    }
    return { query, schema: v.baseSchema };
  }

  const tableFilterKey = !applyTableFilters
    ? ""
    : (() => {
        const app = mutableGet(stateRef);
        const fe = app.viewState?.viewParams.filterExp;
        return fe != null && fe.opArgs.length > 0
          ? fe.toSqlWhere(reltab.getDefaultDialect())
          : "";
      })();

  const curMinOcc = minOccurrence;
  const curRowBin = rowBinCount;
  const curColBin = colBinCount;
  const pairKey =
    rowColId && colColId ? `${rowColId}\u001f${colColId}` : "";

  useEffect(() => {
    if (rowColId == null || colColId == null) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const qs = getViewQueryAndSchema();
    if (qs == null) {
      return;
    }
    const app = mutableGet(stateRef);
    const v = app.viewState;
    if (!v?.dbc) {
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    loadConfusionMatrixData(
      v.dbc,
      qs.query,
      qs.schema,
      rowColId,
      colColId,
      {
        rowBinCount: isNumeric(rowColId) ? curRowBin ?? undefined : undefined,
        colBinCount: isNumeric(colColId) ? curColBin ?? undefined : undefined,
        minOccurrence: curMinOcc,
        mode,
        useAllRows,
        sampleLimit: useAllRows ? 0 : DEFAULT_SAMPLE,
      }
    )
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Error loading confusion matrix: ${String(err)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pairKey,
    curRowBin,
    curColBin,
    curMinOcc,
    mode,
    useAllRows,
    applyTableFilters,
    tableFilterKey,
    stateRef,
  ]);

  const isOpen = vs != null && appState.confusionMatrixDialogOpen;

  // Matrix layout: only rows/columns that contain a kept cell are shown;
  // empty rows/columns are removed as the bin count or threshold changes.
  const matrix: MatrixView | null = useMemo(() => {
    if (data == null) {
      return null;
    }
    const d = data.data;
    const maxCount = Math.max(1, ...d.cells.map((c) => c.count));
    const cellsByKey = new Map<string, reltab.CmMatrixCell>();
    const rowSet = new Set<number>();
    const colSet = new Set<number>();
    for (const c of d.cells) {
      cellsByKey.set(`${c.rowBin}\u001f${c.colBin}`, c);
      rowSet.add(c.rowBin);
      colSet.add(c.colBin);
    }
    const normValue = (c: reltab.CmMatrixCell): number =>
      mode === "count" ? c.count / maxCount : (c.freq ?? 0);
    return {
      d,
      rowBins: d.rowBins
        .map((_, i) => i)
        .filter((i) => rowSet.has(i)),
      colBins: d.colBins
        .map((_, i) => i)
        .filter((i) => colSet.has(i)),
      cellsByKey,
      normValue,
      displayValue: (c: reltab.CmMatrixCell): string =>
        mode === "count"
          ? String(c.count)
          : c.freq == null
          ? "-"
          : c.freq.toLocaleString(undefined, {
              style: "percent",
              maximumFractionDigits: 1,
            }),
    };
  }, [data, mode]);

  // Build the per-axis filter args for a clicked cell and forward them to the
  // coupled analytics-filter action.
  const handleCellClick = (
    ri: number,
    ci: number
  ) => {
    // Clicking the already-selected cell deselects it and removes the filter.
    if (
      selectedCell != null &&
      selectedCell.rowBin === ri &&
      selectedCell.colBin === ci
    ) {
      setSelectedCell(null);
      if (rowColId != null && colColId != null) {
        onClearFilter(rowColId, colColId);
      }
      return;
    }
    setSelectedCell({ rowBin: ri, colBin: ci });
    if (matrix == null) {
      return;
    }
    const { d } = matrix;
    const rBin = d.rowBins[ri];
    const cBin = d.colBins[ci];
    const rowArg: ScatterAxisFilterArg =
      d.rowKind === "categorical"
        ? { colId: d.rowColId, values: [String(rBin.value)] }
        : { colId: d.rowColId, range: binRangeArg(rBin) ?? undefined };
    const colArg: ScatterAxisFilterArg =
      d.colKind === "categorical"
        ? { colId: d.colColId, values: [String(cBin.value)] }
        : { colId: d.colColId, range: binRangeArg(cBin) ?? undefined };
    onFilter(rowArg, colArg);
  };

  return (
    <Dialog
      isOpen={isOpen}
      title="Confusion Matrix"
      onClose={onClose}
      canOutsideClickClose={false}
      style={{
        resize: "both",
        overflow: "auto",
        minWidth: 640,
        minHeight: 420,
        maxWidth: "95vw",
        maxHeight: "95vh",
      }}
    >
      <div
        className="bp4-dialog-body"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>Row variable</div>
            <HTMLSelect
              value={rowColId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setRowColId(v === "" ? null : v);
                setSelectedCell(null);
                setData(null);
              }}
            >
              {availableCols.map((cid) => (
                <option key={cid} value={cid}>
                  {viewSchema?.displayName(cid) ?? cid}
                  {isNumeric(cid) ? "" : " (cat)"}
                </option>
              ))}
            </HTMLSelect>
          </div>
          <Tooltip content="Swap row and column">
            <Button icon="swap-horizontal" onClick={swapAxes} />
          </Tooltip>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>Column variable</div>
            <HTMLSelect
              value={colColId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setColColId(v === "" ? null : v);
                setSelectedCell(null);
                setData(null);
              }}
            >
              {availableCols.map((cid) => (
                <option key={cid} value={cid}>
                  {viewSchema?.displayName(cid) ?? cid}
                  {isNumeric(cid) ? "" : " (cat)"}
                </option>
              ))}
            </HTMLSelect>
          </div>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>Mode</div>
            <HTMLSelect
              value={mode}
              onChange={(e) => setMode(e.target.value as reltab.CmMode)}
            >
              <option value="count">Count</option>
              <option value="rows">Conditional on rows (P(col|row))</option>
              <option value="cols">Conditional on columns (P(row|col))</option>
            </HTMLSelect>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          {rowColId != null && isNumeric(rowColId) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div>
                <div className="bp4-text-muted" style={{ fontSize: 11 }}>Row bins</div>
                <Slider
                  min={2}
                  max={50}
                  stepSize={1}
                  labelRenderer={false}
                  value={curRowBin ?? 5}
                  onChange={(v: number) => setRowBinCount(v)}
                />
              </div>
              <NumericInput
                min={2}
                max={200}
                value={curRowBin ?? 5}
                onValueChange={(v) => setRowBinCount(v)}
                style={{ width: 56 }}
              />
            </div>
          )}
          {colColId != null && isNumeric(colColId) && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div>
                <div className="bp4-text-muted" style={{ fontSize: 11 }}>Col bins</div>
                <Slider
                  min={2}
                  max={50}
                  stepSize={1}
                  labelRenderer={false}
                  value={curColBin ?? 5}
                  onChange={(v: number) => setColBinCount(v)}
                />
              </div>
              <NumericInput
                min={2}
                max={200}
                value={curColBin ?? 5}
                onValueChange={(v) => setColBinCount(v)}
                style={{ width: 56 }}
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div>
              <div className="bp4-text-muted" style={{ fontSize: 11 }}>Min occurrences</div>
              <Slider
                min={1}
                max={100}
                stepSize={1}
                labelRenderer={false}
                value={curMinOcc}
                onChange={(v: number) => setMinOccurrence(v)}
              />
            </div>
            <NumericInput
              min={1}
              max={10000}
              value={curMinOcc}
              onValueChange={(v) => setMinOccurrence(v)}
              style={{ width: 64 }}
            />
          </div>
          <Switch label="Use all rows" checked={useAllRows} onChange={() => setUseAllRows(!useAllRows)} />
          <Switch label="Apply Table Filters" checked={applyTableFilters} onChange={() => setApplyTableFilters(!applyTableFilters)} />
        </div>

        {rowColId == null || colColId == null ? (
          <p className="bp4-text-muted">Select a row and column variable.</p>
        ) : loading ? (
          <Spinner />
        ) : error != null ? (
          <p className="bp4-intent-danger">{error}</p>
        ) : matrix != null && matrix.rowBins.length === 0 ? (
          <p className="bp4-text-muted">No data for this column pair.</p>
        ) : matrix != null ? (
          <div style={{ overflow: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `auto repeat(${matrix.colBins.length}, minmax(64px, 1fr))`,
                gap: 2,
                fontSize: 11,
                alignItems: "stretch",
                width: "max-content",
                minWidth: "100%",
              }}
            >
              <div />
              {matrix.colBins.map((ci) => (
                <div
                  key={`c${ci}`}
                  style={{
                    textAlign: "center",
                    fontWeight: 600,
                    color: "#445",
                    padding: "2px 4px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={matrix.d.colBins[ci].label}
                >
                  {matrix.d.colBins[ci].label}
                </div>
              ))}
              {matrix.rowBins.map((ri) => (
                <React.Fragment key={`r${ri}`}>
                  <div
                    style={{
                      fontWeight: 600,
                      color: "#445",
                      padding: "2px 6px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 160,
                    }}
                    title={matrix.d.rowBins[ri].label}
                  >
                    {matrix.d.rowBins[ri].label}
                  </div>
                  {matrix.colBins.map((ci) => {
                    const cell = matrix.cellsByKey.get(`${ri}\u001f${ci}`);
                    const isSelected =
                      selectedCell != null &&
                      selectedCell.rowBin === ri &&
                      selectedCell.colBin === ci;
                    return (
                      <div
                        key={`${ri}\u001f${ci}`}
                        onClick={() => handleCellClick(ri, ci)}
                        title="Click to filter on this cell"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minHeight: 30,
                          padding: "2px 4px",
                          borderRadius: 3,
                          cursor: "pointer",
                          color:
                            cell != null && matrix.normValue(cell) > 0.55
                              ? "#fff"
                              : "#1a2433",
                          background:
                            cell != null
                              ? cellColor(matrix.normValue(cell))
                              : "transparent",
                          outline: isSelected
                            ? `2px solid ${SELECT_TINT}`
                            : "none",
                          outlineOffset: -1,
                        }}
                      >
                        {cell != null ? matrix.displayValue(cell) : ""}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ConfusionMatrixDialog;

