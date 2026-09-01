// Standalone 2D scatter plot, opened from "Analytics > Scatter Plot". Uses the
// same shared ScatterPlot component as the SPLOM master view (2D brush, log
// scales, regression trend line, stats row), with X/Y/color selects and a
// sample / table-filter toggle.
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import * as reltab from "reltab";
import { Button, Dialog, HTMLSelect, Slider, Spinner, Switch } from "@blueprintjs/core";
import { mutableGet, StateRef } from "oneref";
import { AppState } from "../AppState";
import {
  ScatterPlotViewData,
  loadScatterPlot,
} from "../actions";
import ScatterPlot, { ScatterPoint } from "./ScatterPlot";
import {
  ScatterAxisFilterArg,
  ScatterAxisKind,
  ScatterAxisSpec,
  axisCoord,
  axisFilterArgs,
  axisTickLabel,
  buildCategoricalAxis,
} from "./categoricalAxis";

export interface ScatterPlotDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
  onBrushFilter: (
    xArg: ScatterAxisFilterArg,
    yArg: ScatterAxisFilterArg
  ) => void;
}

const DEFAULT_SAMPLE = 5000;

// Categorical palette, harmonized with the rest of the UI (#A3D5FF accents).
const CAT_COLORS = [
  "#A3D5FF",
  "#9BB8AE",
  "#F2C14E",
  "#F28B82",
  "#C5A3FF",
  "#8AB8E8",
  "#FFB3A7",
  "#A8C686",
  "#E8A0BF",
  "#A9A9D5",
];
const DOTS_COLOR = "#A3D5FF";
const OTHER_COLOR = "#8A9BA8";

const ScatterPlotDialog: React.FunctionComponent<ScatterPlotDialogProps> = ({
  appState,
  stateRef,
  onClose,
  onBrushFilter,
}) => {
  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;

  const [xColId, setXColId] = useState<string | null>(null);
  const [yColId, setYColId] = useState<string | null>(null);
  const [colorColId, setColorColId] = useState<string | null>(null);
  const [useAllRows, setUseAllRows] = useState(false);
  const [applyTableFilters, setApplyTableFilters] = useState(true);
  const [sampleLimit, setSampleLimit] = useState<number>(DEFAULT_SAMPLE);
  const [sampleSliderVal, setSampleSliderVal] = useState<number | null>(null);
  const [data, setData] = useState<ScatterPlotViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Default the axis selection to the first two numeric columns the first time
  // the dialog has a schema available (only once, to preserve user edits).
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (viewSchema == null || initialized) {
      return;
    }
    const nums = availableCols.filter(isNumeric);
    if (nums.length >= 2) {
      setXColId(nums[0]);
      setYColId(nums[1]);
    } else if (nums.length === 1) {
      setXColId(nums[0]);
    }
    setInitialized(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSchema]);

  // Pre-seed the axes with a pair requested by another view (a non-diagonal
  // SPLOM cell). Runs whenever the external preset pair changes; null means
  // "no preset", leaving the current selection untouched.
  const presetX = appState.scatterXColId;
  const presetY = appState.scatterYColId;
  useEffect(() => {
    if (presetX == null || presetY == null) {
      return;
    }
    setXColId(presetX);
    setYColId(presetY);
    setInitialized(true);
    setData(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetX, presetY]);

  // The query and schema whose data the plot should describe (mirrors the
  // SPLOM's getViewQueryAndSchema, honoring "Apply Table Filters").
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

  const curSample = sampleSliderVal ?? sampleLimit;
  const pairKey = xColId && yColId ? `${xColId}\u001f${yColId}` : "";

  useEffect(() => {
    if (xColId == null || yColId == null) {
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
    loadScatterPlot(
      v.dbc,
      qs.query,
      qs.schema,
      xColId,
      yColId,
      colorColId,
      useAllRows ? 0 : curSample
    )
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Error loading scatter plot: ${String(err)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairKey, colorColId, curSample, useAllRows, applyTableFilters, tableFilterKey, stateRef]);

  // Axis kind for a column: categorical (discrete slots) vs numeric/temporal.
  const axisKindFor = (cid: string | null): ScatterAxisKind => {
    if (viewSchema == null || cid == null) {
      return "numeric";
    }
    return reltab.splomColKind(viewSchema.columnType(cid)) === "categorical"
      ? "categorical"
      : reltab.isTemporalKind(viewSchema.columnType(cid).kind)
      ? "temporal"
      : "numeric";
  };

  // Build the axis spec for a column from the loaded points. Categorical axes
  // become slot-encoded integer bands; numeric/temporal keep their domain.
  const axisSpecFor = (cid: string | null): ScatterAxisSpec | null => {
    if (data == null || cid == null) {
      return null;
    }
    const kind = axisKindFor(cid);
    if (kind === "categorical") {
      const raw: Array<number | string | boolean | null> = [];
      for (const p of data.points.points) {
        raw.push(p[cid] ?? null);
      }
      return buildCategoricalAxis(cid, raw);
    }
    // Numeric/temporal domain with 5% padding.
    let mn = Infinity;
    let mx = -Infinity;
    for (const p of data.points.points) {
      const v = p[cid];
      if (typeof v === "number" && Number.isFinite(v)) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    let domain: [number, number] = [0, 1];
    if (Number.isFinite(mn) && Number.isFinite(mx)) {
      const pad = (mx - mn) * 0.05 || Math.max(1, Math.abs(mx) * 0.05);
      domain = [mn - pad, mx + pad];
    }
    return { colId: cid, kind, domain, slotLabels: null, isCategorical: false };
  };

  const xSpec = useMemo(() => axisSpecFor(xColId), [data, xColId, viewSchema]);
  const ySpec = useMemo(() => axisSpecFor(yColId), [data, yColId, viewSchema]);

  // Deterministic categorical color map for the color column (first-seen order
  // across the palette); empty when no color column is selected.
  const colorById: Map<string, string> = useMemo(() => {
    const map: Map<string, string> = new Map();
    if (data == null || colorColId == null || data.points.colorColId == null) {
      return map;
    }
    let ci = 0;
    for (const p of data.points.points) {
      const v = p[colorColId];
      if (v == null || v === "") {
        continue;
      }
      const key = String(v);
      if (!map.has(key)) {
        map.set(key, CAT_COLORS[ci % CAT_COLORS.length]);
        ci++;
      }
    }
    return map;
  }, [data, colorColId]);

  const scatterPts: ScatterPoint[] = useMemo(() => {
    const pts: ScatterPoint[] = [];
    if (data == null || xSpec == null || ySpec == null) {
      return pts;
    }
    for (const p of data.points.points) {
      const x = axisCoord(xSpec, p[xSpec.colId] ?? null);
      const y = axisCoord(ySpec, p[ySpec.colId] ?? null);
      if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      let color = DOTS_COLOR;
      if (data.points.colorColId != null && colorColId != null) {
        const v = p[colorColId];
        const key = v == null || v === "" ? "" : String(v);
        color = key === "" ? OTHER_COLOR : (colorById.get(key) ?? OTHER_COLOR);
      }
      pts.push({ x, y, color });
    }
    return pts;
  }, [data, xSpec, ySpec, colorColId, colorById]);

  // Legend entries (label, color) for the color column, if one is selected.
  const colorLegend = useMemo(() => {
    if (colorColId == null || colorById.size === 0) {
      return null;
    }
    return Array.from(colorById.entries()).map(([label, color]) => ({ label, color }));
  }, [colorColId, colorById]);

  // Axis label formatter: temporal -> date, numeric -> locale number, and
  // categorical -> the category name at the (rounded) slot coordinate.
  const fmtAxis = (cid: string, v: number): string | number => {
    const spec = cid === xColId ? xSpec : ySpec;
    if (spec != null && spec.isCategorical) {
      return axisTickLabel(spec, v);
    }
    const k =
      viewSchema != null ? viewSchema.columnType(cid).kind : ("string" as reltab.ColumnKind);
    if (reltab.isTemporalKind(k)) {
      const d = new Date(v * 1000);
      if (k === "date") {
        return d.toISOString().slice(0, 10);
      }
      if (k === "time") {
        return d.toISOString().slice(11, 16);
      }
      return d.toISOString().slice(0, 16);
    }
    return v.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  // Translate a 2D brush into per-axis analytics-filter clauses: numeric axes
  // keep the range (>= / <=), categorical axes become an IN of the brushed
  // category labels. Called both on new brushes and on clear.
  const handleBrushFilter = (
    xr: [number, number] | null,
    yr: [number, number] | null
  ) => {
    const [xArg, yArg] = axisFilterArgs(xSpec, xr, ySpec, yr);
    onBrushFilter(xArg, yArg);
  };

  const isOpen = vs != null && appState.scatterPlotDialogOpen;
  const canPlot = xColId != null && yColId != null && xColId !== yColId;

  return (
    <Dialog
      isOpen={isOpen}
      title="Scatter Plot"
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
        onMouseLeave={() => undefined}
      >
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>X axis</div>
            <HTMLSelect
              value={xColId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setXColId(v === "" ? null : v);
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
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>Y axis</div>
            <HTMLSelect
              value={yColId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setYColId(v === "" ? null : v);
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
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>Color by</div>
            <HTMLSelect
              value={colorColId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setColorColId(v === "" ? null : v);
                setData(null);
              }}
            >
              <option value="">None</option>
              {availableCols.map((cid) => (
                <option key={cid} value={cid}>
                  {viewSchema?.displayName(cid) ?? cid}
                </option>
              ))}
            </HTMLSelect>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span className="bp4-text-muted" style={{ fontSize: 11 }}>
              Sample: {useAllRows ? "all" : (curSample).toLocaleString()}
            </span>
            <Slider
              min={500}
              max={20000}
              stepSize={500}
              labelRenderer={false}
              value={curSample}
              disabled={useAllRows}
              onChange={(v: number) => setSampleSliderVal(v)}
              onRelease={(v: number) => {
                setSampleSliderVal(v);
                setSampleLimit(v);
              }}
            />
          </div>
          <Switch label="Use all rows" checked={useAllRows} onChange={() => setUseAllRows(!useAllRows)} />
          <Switch label="Apply Table Filters" checked={applyTableFilters} onChange={() => setApplyTableFilters(!applyTableFilters)} />
        </div>

        {!canPlot ? (
          <p className="bp4-text-muted">Select two distinct columns to plot.</p>
        ) : loading ? (
          <Spinner />
        ) : error != null ? (
          <p className="bp4-intent-danger">{error}</p>
        ) : data != null && scatterPts.length === 0 ? (
          <p className="bp4-text-muted">No data for this column pair.</p>
        ) : data != null && xSpec != null && ySpec != null ? (
          <ScatterPlot
            xColId={xSpec.colId}
            yColId={ySpec.colId}
            pts={scatterPts}
            xDomain={xSpec.domain}
            yDomain={ySpec.domain}
            xKind={xSpec.kind}
            yKind={ySpec.kind}
            regression={xSpec.isCategorical || ySpec.isCategorical ? null : data.regression}
            fmtAxis={(cid, v) => fmtAxis(cid, v)}
            onBrushFilter={handleBrushFilter}
          />
        ) : null}
        {colorLegend != null && colorLegend.length > 0 && (
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Color by {viewSchema?.displayName(colorColId as string) ?? colorColId}:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {colorLegend.map(({ label, color }, i) => (
                <span
                  key={i}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: color,
                    }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default ScatterPlotDialog;
