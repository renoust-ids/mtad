// Scatter Plot Matrix (SPLOM) dialog, opened from the Analytics menu. Renders
// an interactive N x N matrix over a manual column selection: pairwise scatters
// with Pearson correlation annotations, a client-side mini histogram on the
// diagonal (click opens the Distribution dialog), optional categorical
// coloring, sampling, and a fatal "Apply Table Filters" toggle that follows
// the Distribution dialog's behavior (analytics filters are intentionally
// excluded, since they are the output of SPLOM brush interactions).
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as reltab from "reltab";
import {
  Button,
  Checkbox,
  Dialog,
  HTMLSelect,
  Slider,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import {
  VictoryAxis,
  VictoryBar,
  VictoryChart,
  VictoryScatter,
} from "victory";
import { mutableGet, StateRef } from "oneref";
import { AppState } from "../AppState";
import { SplomViewData, loadSplomData } from "../actions";

export interface SplomDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
  onBrushFilter: (
    xColId: string,
    xRange: [number, number] | null,
    yColId: string,
    yRange: [number, number] | null
  ) => void;
  onOpenDistribution: (colId: string) => void;
}

const MAX_MATRIX_COLS = 10;
const MAX_LEGEND_CATS = 10;
const DIAG_BINS = 10;
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

const fmtOpts = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
};

const round2 = (n: number): number =>
  Number(Math.round(Number(n + "e2")) + "e-2");

const countLabel = (n: number): string => n.toLocaleString();

// Correlated-cell background: blue for positive r, red for negative r, gray
// for near-zero, with increasing saturation away from zero.
const rColor = (r: number): string => {
  const a = Math.min(0.85, 0.18 + Math.abs(r) * 0.6);
  const base =
    r < 0 ? "242, 139, 130" : r > 0 ? "163, 213, 255" : "200, 205, 210";
  return `rgba(${base}, ${a})`;
};

interface HoverInfo {
  left: number;
  top: number;
  lines: string[];
}

// One visible point of a cell, with the (already resolved) dot color.
interface CellPt {
  x: number | string | boolean;
  y: number | string | boolean;
  color: string;
}

const SplomDialog: React.FunctionComponent<SplomDialogProps> = ({
  appState,
  stateRef,
  onClose,
  onBrushFilter,
  onOpenDistribution,
}) => {
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [colorColId, setColorColId] = useState<string | null>(null);
  const [sampleLimit, setSampleLimit] = useState<number>(DEFAULT_SAMPLE);
  const [sampleSliderVal, setSampleSliderVal] = useState<number | null>(null);
  const [useAllRows, setUseAllRows] = useState(false);
  const [applyTableFilters, setApplyTableFilters] = useState(true);
  const [minFreqVal, setMinFreqVal] = useState<number | null>(null);
  const [minFreqSliderVal, setMinFreqSliderVal] = useState<number | null>(null);
  const [data, setData] = useState<SplomViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePair, setActivePair] = useState<{
    xColId: string;
    yColId: string;
  } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const matrixWrapRef = useRef<HTMLDivElement>(null);

  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;

  // The query and schema whose data the SPLOM should describe: with a pivot
  // active this is the aggregated tree query; otherwise the base query (or its
  // table-filtered subset when "Apply Table Filters" is checked).
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

  // Reload whenever the table filter (or its apply toggle) changes, so the
  // SPLOM tracks the filtered subset.
  const tableFilterKey = !applyTableFilters
    ? ""
    : (() => {
        const app = mutableGet(stateRef);
        const fe = app.viewState?.viewParams.filterExp;
        return fe != null && fe.opArgs.length > 0
          ? fe.toSqlWhere(reltab.getDefaultDialect())
          : "";
      })();

  const matrixKey = selectedCols.join("\u001f");
  const curSample = sampleSliderVal ?? sampleLimit;

  const availableCols = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    return viewSchema.columns.filter(
      (cid) => !cid.startsWith("_") && cid !== "Rec"
    );
  }, [viewSchema]);

  const eligibleCount = useMemo(() => {
    if (viewSchema == null) {
      return 0;
    }
    return selectedCols.filter(
      (cid) => reltab.splomColKind(viewSchema.columnType(cid)) !== "categorical"
    ).length;
  }, [selectedCols, viewSchema]);

  useEffect(() => {
    if (selectedCols.length === 0) {
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
    const { query, schema } = qs;
    setLoading(true);
    setError(null);
    setData(null);
    setActivePair(null);
    runSplom();
    return () => {
      cancelled = true;
    };

    async function runSplom() {
      try {
        const app = mutableGet(stateRef);
        const v = app.viewState;
        const res = await loadSplomData(v!.dbc!, query, schema, {
          matrixColIds: selectedCols,
          colorColId,
          sampleLimit: useAllRows ? 0 : curSample,
        });
        if (cancelled) return;
        setData(res);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(`Error loading scatter plot matrix: ${String(err)}`);
          setLoading(false);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrixKey, colorColId, curSample, useAllRows, applyTableFilters, tableFilterKey, stateRef]);

  // Legend for the color column (top categories above the min frequency, the
  // rest grouped as "Other"). Computed before cellPts so cell colors can use it.
  const legend = useMemo(() => {
    const colorFreqs = data?.colorFreqs;
    if (colorFreqs == null) {
      return null;
    }
    const thr =
      minFreqVal ?? minFreqSliderVal ?? Math.round(colorFreqs.totalCount * 0.02);
    const safeThr = Number.isFinite(thr) && thr >= 0 ? Math.round(thr) : 0;
    const top = colorFreqs.binData
      .filter((b) => b.count >= safeThr)
      .slice(0, MAX_LEGEND_CATS);
    const shown = new Set(top.map((b) => String(b.value)));
    const otherCount =
      colorFreqs.binData
        .filter((b) => !shown.has(String(b.value)))
        .reduce((s, b) => s + b.count, 0) + colorFreqs.nullCount;
    const entries: { label: string; count: number; color: string }[] = top.map(
      (b, i) => ({
        label: String(b.value),
        count: b.count,
        color: CAT_COLORS[i % CAT_COLORS.length],
      })
    );
    if (otherCount > 0) {
      entries.push({ label: "Other", count: otherCount, color: OTHER_COLOR });
    }
    return { entries, byLabel: new Map(entries.map((e) => [e.label, e.color])) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.colorFreqs, minFreqVal, minFreqSliderVal]);

  // Cell points: one map per off-diagonal cell, filtered pairwise.
  const cellPts = useMemo(() => {
    const map: Record<string, CellPt[]> = {};
    if (data == null || data.points.points.length === 0) {
      return map;
    }
    const points = data.points.points;
    const colorVal = (pt: reltab.ScatterPoint): string => {
      if (data.points.colorColId == null) {
        return DOTS_COLOR;
      }
      const v = pt[data.points.colorColId];
      const cat = v == null ? "(null)" : String(v);
      if (cat === "(null)") {
        return OTHER_COLOR;
      }
      const c = legend?.byLabel.get(cat);
      return c != null ? c : OTHER_COLOR;
    };
    for (let i = 0; i < selectedCols.length; i++) {
      for (let j = 0; j < selectedCols.length; j++) {
        if (i === j) {
          continue;
        }
        const colI = selectedCols[i];
        const colJ = selectedCols[j];
        const pts: CellPt[] = [];
        for (const pt of points) {
          const x = pt[colI];
          const y = pt[colJ];
          if (x == null || y == null) {
            continue;
          }
          pts.push({ x, y, color: colorVal(pt) });
        }
        map[`${i},${j}`] = pts;
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedCols, legend]);

  // Per-column display domain (min/max with 5% padding) over all points.
  const domains = useMemo(() => {
    const d: Record<string, [number, number]> = {};
    if (data == null) {
      return d;
    }
    for (const cid of selectedCols) {
      let mn = Infinity;
      let mx = -Infinity;
      for (const pt of data.points.points) {
        const v = pt[cid];
        if (typeof v === "number") {
          if (v < mn) mn = v;
          if (v > mx) mx = v;
        }
      }
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) {
        d[cid] = [0, 1];
        continue;
      }
      const pad = (mx - mn) * 0.05 || Math.max(1, Math.abs(mx) * 0.05);
      d[cid] = [mn - pad, mx + pad];
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedCols]);

  // Client-side diagonal data (numeric/temporal histogram bins or categorical
  // bar counts) derived from the already-loaded points.
  const diagData = useMemo(() => {
    const map: Record<string, { kind: "numeric"; bins: { mid: number; count: number }[] } | { kind: "cat"; bars: { label: string; count: number }[] }> = {};
    if (data == null || viewSchema == null) {
      return map;
    }
    for (const cid of selectedCols) {
      const kind = reltab.splomColKind(viewSchema.columnType(cid));
      if (kind !== "categorical") {
        const dom = domains[cid] ?? [0, 1];
        const bins = new Array<number>(DIAG_BINS).fill(0);
        let minV = Infinity;
        let maxV = -Infinity;
        for (const pt of data.points.points) {
          const v = pt[cid];
          if (typeof v === "number") {
            bins[Math.min(DIAG_BINS - 1, Math.floor(((v - dom[0]) / (dom[1] - dom[0])) * DIAG_BINS))] += 1;
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
        }
        map[cid] = {
          kind: "numeric",
          bins: bins
            .map((count, i) => ({
              mid: dom[0] + ((i + 0.5) / DIAG_BINS) * (dom[1] - dom[0]),
              count,
            }))
            .filter((b) => b.count > 0),
        };
      } else {
        const counts = new Map<string, number>();
        let nullCount = 0;
        for (const pt of data.points.points) {
          const v = pt[cid];
          if (v == null) {
            nullCount += 1;
          } else {
            const key = String(v);
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
        }
        const bars = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([label, count]) => ({ label, count }));
        if (nullCount > 0) {
          bars.push({ label: "(null)", count: nullCount });
        }
        map[cid] = { kind: "cat", bars };
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, selectedCols, viewSchema, domains]);

  const colKindOf = (cid: string): reltab.ColumnKind | "string" =>
    viewSchema != null ? viewSchema.columnType(cid).kind : "string";

  const colIsCategorical = (cid: string): boolean =>
    viewSchema != null &&
    reltab.splomColKind(viewSchema.columnType(cid)) === "categorical";

  const fmtAxis = (
    cid: string,
    v: number | string | boolean
  ): string | number => {
    const k = colKindOf(cid);
    if (reltab.isTemporalKind(k) && typeof v === "number") {
      const d = new Date(v * 1000);
      if (k === "date") {
        return d.toISOString().slice(0, 10);
      }
      if (k === "time") {
        return d.toISOString().slice(11, 16);
      }
      return d.toISOString().slice(0, 16);
    }
    if (typeof v === "number") {
      return v.toLocaleString(undefined, fmtOpts);
    }
    return String(v);
  };

  const toggleCol = (cid: string, checked: boolean) => {
    setHoverInfo(null);
    if (checked) {
      if (selectedCols.length >= MAX_MATRIX_COLS) {
        return;
      }
      if (!selectedCols.includes(cid)) {
        setSelectedCols([...selectedCols, cid]);
      }
    } else {
      setSelectedCols(selectedCols.filter((c) => c !== cid));
      if (colorColId === cid) {
        setColorColId(null);
      }
    }
  };

  // Hover tooltip for an off-diagonal cell, computed from pixel position
  // against the cell's shared projection (matching the VictoryChart padding).
  const handleCellMouseMove = (
    e: React.MouseEvent<HTMLDivElement>,
    i: number,
    j: number
  ) => {
    const wrap = matrixWrapRef.current;
    if (!wrap) {
      return;
    }
    const colI = selectedCols[i];
    const colJ = selectedCols[j];
    if (colIsCategorical(colI) || colIsCategorical(colJ)) {
      return;
    }
    const pts = cellPts[`${i},${j}`];
    if (pts == null || pts.length === 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const padLeft = 42;
    const padTop = 14;
    const plotW = Math.max(1, rect.width - padLeft - 14);
    const plotH = Math.max(1, rect.height - padTop - 28);
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (mx < padLeft || mx > padLeft + plotW) {
      return;
    }
    const domX = domains[colI] ?? [0, 1];
    const domY = domains[colJ] ?? [0, 1];
    let x = domX[0] + ((mx - padLeft) / plotW) * (domX[1] - domX[0]);
    let y = domY[1] - ((my - padTop) / plotH) * (domY[1] - domY[0]);
    if (x < domX[0]) x = domX[0];
    if (x > domX[1]) x = domX[1];
    if (y < domY[0]) y = domY[0];
    if (y > domY[1]) y = domY[1];
    const oLeft = Math.min(mx + 12, rect.width - 170);
    const oTop = my + 12;
    const sample = pts.length >= 5000 ? " (sampled)" : "";
    setHoverInfo({
      left: oLeft,
      top: oTop,
      lines: [
        `${colI}: ${fmtAxis(colI, x)}`,
        `${colJ}: ${fmtAxis(colJ, y)}`,
        `plotted: ${countLabel(pts.length)}${sample}`,
      ],
    });
  };

  const renderDiag = (i: number) => {
    const cid = selectedCols[i];
    const dd = diagData[cid];
    if (dd == null) {
      return null;
    }
    let chart: React.ReactNode;
    if (dd.kind === "numeric") {
      const dom = domains[cid] ?? [0, 1];
      if (dd.bins.length === 0) {
        chart = (
          <p className="bp4-text-muted" style={{ fontSize: 11 }}>
            single value
          </p>
        );
      } else {
        const maxCount = Math.max(0, ...dd.bins.map((b) => b.count));
        chart = (
          <VictoryChart
            height={130}
            padding={{ top: 10, bottom: 22, left: 34, right: 10 }}
            domain={{ x: dom, y: [0, maxCount] }}
          >
            <VictoryAxis
              tickValues={[dom[0], dom[1]]}
              tickFormat={(t: number) => fmtAxis(cid, t)}
              style={{
                axis: { stroke: "#CBD2D9" },
                tickLabels: { fontSize: 8, padding: 3 },
              }}
            />
            <VictoryBar
              style={{ data: { fill: DOTS_COLOR } }}
              data={dd.bins}
              x="mid"
              y="count"
            />
          </VictoryChart>
        );
      }
    } else if (dd.bars.length === 0) {
      chart = (
        <p className="bp4-text-muted" style={{ fontSize: 11 }}>
          no data
        </p>
      );
    } else {
      chart = (
        <VictoryChart
          height={130}
          padding={{ top: 10, bottom: 30, left: 34, right: 10 }}
        >
          <VictoryAxis
            tickValues={dd.bars.map((b) => b.label)}
            style={{
              axis: { stroke: "#CBD2D9" },
              tickLabels: { fontSize: 7, angle: 45, textAnchor: "start" },
            }}
          />
          <VictoryBar
            style={{ data: { fill: DOTS_COLOR } }}
            data={dd.bars}
            x="label"
            y="count"
          />
        </VictoryChart>
      );
    }
    return (
      <div
        title="Open Distribution"
        onClick={() => onOpenDistribution(cid)}
        style={{ cursor: "pointer", height: 150 }}
      >
        {chart}
        <div
          className="bp4-text-muted"
          style={{
            fontSize: 11,
            textAlign: "center",
            marginTop: 4,
            whiteSpace: "nowrap",
          }}
        >
          {viewSchema?.displayName(cid) ?? cid} ▸ Distribution
        </div>
      </div>
    );
  };

  const renderCell = (i: number, j: number) => {
    if (i === j) {
      return renderDiag(i);
    }
    const colI = selectedCols[i];
    const colJ = selectedCols[j];
    const pts = cellPts[`${i},${j}`] ?? [];
    const xNumeric = !colIsCategorical(colI);
    const yNumeric = !colIsCategorical(colJ);
    const numericPair = xNumeric && yNumeric;
    const upper = j > i;
    const corr =
      numericPair && data != null
        ? data.correlations.find(
            (c) =>
              (c.xColId === colI && c.yColId === colJ) ||
              (c.xColId === colJ && c.yColId === colI)
          )
        : undefined;
    const corrText =
      corr != null && corr.r != null && corr.n >= 2
        ? `r = ${round2(corr.r)}`
        : "n/a";
    const fill = upper && corr != null && corr.r != null ? rColor(corr.r) : null;

    const domain =
      xNumeric && yNumeric
        ? { x: domains[colI] ?? [0, 1], y: domains[colJ] ?? [0, 1] }
        : null;

    const scatter =
      pts.length === 0 ? (
        <p className="bp4-text-muted" style={{ fontSize: 11 }}>
          No data for this pair.
        </p>
      ) : (
        <VictoryChart
          height={150}
          padding={{ top: 14, bottom: 28, left: 42, right: 14 }}
          domain={domain ?? undefined}
        >
          <VictoryAxis
            tickCount={3}
            tickFormat={(t: unknown) =>
              fmtAxis(colI, t as number | string | boolean)
            }
            style={{
              axis: { stroke: "#CBD2D9" },
              tickLabels: { fontSize: 8, padding: 3 },
            }}
          />
          <VictoryAxis
            dependentAxis
            tickCount={3}
            tickFormat={(t: unknown) =>
              fmtAxis(colJ, t as number | string | boolean)
            }
            style={{
              axis: { stroke: "#CBD2D9" },
              tickLabels: { fontSize: 8, padding: 3 },
            }}
          />
          <VictoryScatter
            style={{ data: { fill: (d: { datum?: CellPt }) => (d.datum != null ? d.datum.color : DOTS_COLOR) } }}
            data={pts}
            x="x"
            y="y"
            size={2}
          />
        </VictoryChart>
      );

    return (
      <div
        style={{
          position: "relative",
          border: "1px solid rgba(17, 20, 24, 0.08)",
          borderRadius: 4,
          background: fill ?? "#FFFFFF",
          overflow: "hidden",
          padding: 6,
        }}
        onMouseMove={(e) => handleCellMouseMove(e, i, j)}
        onMouseLeave={() => setHoverInfo(null)}
        onClick={() => setActivePair({ xColId: colI, yColId: colJ })}
      >
        {scatter}
        {corrText !== "n/a" && (
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 4,
              fontSize: 10,
              fontWeight: 600,
              color: "#1D7324",
            }}
          >
            {corrText}
          </div>
        )}
      </div>
    );
  };

  const toggleColorCol = (cid: string) => {
    setHoverInfo(null);
    setColorColId(cid === "" ? null : cid);
  };

  // --- master-detail (simple scatter for now; interactions in phase B) ---
  const renderMaster = () => {
    if (activePair == null) {
      return null;
    }
    const { xColId, yColId } = activePair;
    const i = selectedCols.indexOf(xColId);
    const j = selectedCols.indexOf(yColId);
    const pts: CellPt[] =
      i >= 0 && j >= 0 ? (cellPts[`${i},${j}`] ?? []) : [];
    const chart = (
      <VictoryChart
        height={420}
        padding={{ top: 24, bottom: 48, left: 64, right: 24 }}
        domain={{
          x: domains[xColId] ?? [0, 1],
          y: domains[yColId] ?? [0, 1],
        }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 11, padding: 6 },
          }}
          tickFormat={(t: unknown) =>
            fmtAxis(xColId, t as number | string | boolean)
          }
        />
        <VictoryAxis
          dependentAxis
          tickCount={5}
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 11, padding: 4 },
          }}
          tickFormat={(t: unknown) =>
            fmtAxis(yColId, t as number | string | boolean)
          }
        />
        {pts.length > 0 && (
          <VictoryScatter
            style={{ data: { fill: (d: { datum?: CellPt }) => (d.datum != null ? d.datum.color : DOTS_COLOR) } }}
            data={pts}
            x="x"
            y="y"
            size={3}
          />
        )}
      </VictoryChart>
    );
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Button
            small
            icon="arrow-left"
            onClick={() => setActivePair(null)}
          >
            Back to matrix
          </Button>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {viewSchema?.displayName(xColId) ?? xColId} ×{" "}
            {viewSchema?.displayName(yColId) ?? yColId}
          </div>
          <div style={{ width: 110 }} />
        </div>
        {pts.length === 0 ? (
          <p className="bp4-text-muted">No data for this column pair.</p>
        ) : (
          chart
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          <Tag minimal>n: {countLabel(pts.length)}</Tag>
        </div>
      </div>
    );
  };

  // --- main render ---
  const isOpen = vs != null && appState.splomDialogOpen;
  const sp = data?.points;
  const nSel = selectedCols.length;
  const matrixBody = (
    <>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
          Matrix columns ({nSel}/{MAX_MATRIX_COLS})
        </div>
        {nSel >= MAX_MATRIX_COLS && (
          <div className="bp4-text-muted" style={{ fontSize: 11 }}>
            Maximum {MAX_MATRIX_COLS} columns.
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            marginTop: 6,
            maxHeight: 160,
            overflow: "auto",
          }}
        >
          {(["numeric", "categorical"] as const).map((group) => {
            const cols = availableCols.filter((cid) => {
              if (viewSchema == null) {
                return false;
              }
              const k = reltab.splomColKind(viewSchema.columnType(cid));
              return group === "numeric"
                ? k !== "categorical"
                : k === "categorical";
            });
            if (cols.length === 0) {
              return null;
            }
            return (
              <div key={group}>
                <div className="bp4-text-muted" style={{ fontSize: 11 }}>
                  {group === "numeric"
                    ? "Numeric & temporal"
                    : "Categorical"}
                </div>
                {cols.map((cid) => (
                  <Checkbox
                    key={cid}
                    checked={selectedCols.includes(cid)}
                    disabled={
                      !selectedCols.includes(cid) &&
                      selectedCols.length >= MAX_MATRIX_COLS
                    }
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      toggleCol(cid, e.target.checked)
                    }
                    label={viewSchema?.displayName(cid) ?? cid}
                  />
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 24, alignItems: "center", marginTop: 8 }}>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Color by
            </div>
            <HTMLSelect
              value={colorColId ?? ""}
              onChange={(e) => toggleColorCol(e.target.value)}
            >
              <option value="">None</option>
              {availableCols.map((cid) => (
                <option key={cid} value={cid}>
                  {viewSchema?.displayName(cid) ?? cid}
                </option>
              ))}
            </HTMLSelect>
          </div>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Sample: {useAllRows ? "all" : countLabel(curSample)}
            </div>
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
          <Switch
            label="Use all rows"
            checked={useAllRows}
            onChange={() => setUseAllRows(!useAllRows)}
          />
          <Switch
            label="Apply Table Filters"
            checked={applyTableFilters}
            onChange={() => {
              setApplyTableFilters(!applyTableFilters);
              setHoverInfo(null);
            }}
          />
        </div>
        {legend != null && (
          <div style={{ marginTop: 8 }}>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Min freq
            </div>
            <div style={{ display: "flex", alignItems: "center", maxWidth: 300 }}>
              <Slider
                min={1}
                max={Math.max(
                  10,
                  Math.round(data!.points.totalRows * 0.5)
                )}
                stepSize={1}
                labelRenderer={false}
                value={minFreqVal ?? minFreqSliderVal ?? 1}
                onChange={(v: number) => setMinFreqSliderVal(v)}
                onRelease={(v: number) => {
                  setMinFreqSliderVal(v);
                  setMinFreqVal(v);
                }}
              />
            </div>
          </div>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            margin: "8px 0",
          }}
        >
          {nSel === 0 && (
            <span className="bp4-text-muted" style={{ fontSize: 12 }}>
              Select at least 2 numeric or temporal columns to build the
              matrix.
            </span>
          )}
          {nSel > 0 && eligibleCount < 2 && (
            <span className="bp4-text-muted" style={{ fontSize: 12 }}>
              Select at least 2 numeric or temporal columns (categorical
              columns alone cannot be correlated — they can color the points).
            </span>
          )}
          {sp != null && nSel >= 2 && (
            <span style={{ fontSize: 12 }}>
              <strong>{nSel}×{nSel}</strong> · {countLabel(sp.points.length)}{" "}
              plotted / {countLabel(sp.totalRows)} total
              {sp.sampled ? " (sampled)" : ""} ·{" "}
              {data != null && data.correlations.length} correlation
              {data != null && data.correlations.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {nSel === 0 || eligibleCount < 2 ? (
        <p className="bp4-text-muted">Select columns above to build the matrix.</p>
      ) : loading ? (
        <Spinner />
      ) : error != null ? (
        <p className="bp4-intent-danger">{error}</p>
      ) : data != null ? (
        activePair != null ? (
          renderMaster()
        ) : (
          <div
            ref={matrixWrapRef}
            onMouseLeave={() => setHoverInfo(null)}
            style={{
              display: "grid",
              gap: 4,
              gridTemplateColumns: `48px repeat(${nSel}, minmax(160px, 190px))`,
              minWidth: "max-content",
            }}
          >
            <div />
            {selectedCols.map((cid) => (
              <div
                key={`h${cid}`}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  transform: "rotate(-45deg)",
                  transformOrigin: "bottom left",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 120,
                }}
              >
                {viewSchema?.displayName(cid) ?? cid}
              </div>
            ))}
            {selectedCols.map((cid, i) => (
              <React.Fragment key={`r${cid}`}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    alignSelf: "center",
                  }}
                >
                  {viewSchema?.displayName(cid) ?? cid}
                </div>
                {selectedCols.map((_cj, j) => (
                  <div key={`c${i}-${j}`}>{renderCell(i, j)}</div>
                ))}
              </React.Fragment>
            ))}
          </div>
        )
      ) : null}

      {legend != null && !loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginTop: 8,
            borderTop: "1px solid rgba(17, 20, 24, 0.1)",
            paddingTop: 8,
          }}
        >
          <span className="bp4-text-muted" style={{ fontSize: 11 }}>
            {colorColId != null
              ? `Color by ${viewSchema?.displayName(colorColId) ?? colorColId}:`
              : "Correlation:"}
          </span>
          {colorColId != null
            ? legend.entries.map((e) => (
                <span key={e.label} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: e.color,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ fontSize: 11 }}>{e.label}</span>
                </span>
              ))
            : data != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 11 }}>−1</span>
                  <span
                    style={{
                      width: 120,
                      height: 8,
                      borderRadius: 4,
                      background:
                        "linear-gradient(to right, rgba(242,139,130,0.85), #FFFFFF, rgba(163,213,255,0.85))",
                    }}
                  />
                  <span style={{ fontSize: 11 }}>+1</span>
                </span>
              )}
        </div>
      )}
    </>
  );

  return (
    <Dialog
      isOpen={isOpen}
      title="Scatter Plot Matrix (SPLOM)"
      onClose={onClose}
      canOutsideClickClose={false}
      style={{
        resize: "both",
        overflow: "auto",
        minWidth: 620,
        minHeight: 420,
        maxWidth: "95vw",
        maxHeight: "95vh",
      }}
    >
      <div className="bp4-dialog-body">{matrixBody}</div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default SplomDialog;