// An interactive per-column histogram dialog, opened from the column header
// context menu or the Analytics menu. Numeric columns get a binned histogram
// (with bin count, log scale, null bar, brush-to-filter); other columns get a
// categorical bar chart whose bars can be selected to filter the grid.
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import * as reltab from "reltab";
import {
  Button,
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
  VictoryBrushContainer,
  VictoryChart,
} from "victory";
import { mutableGet, StateRef } from "oneref";
import { AppState } from "../AppState";
import { ColumnKind } from "reltab";
import { ColumnHistogramData, loadColumnHistogramData } from "../actions";

export interface HistogramDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  colId: string | null;
  onClose: () => void;
  onSelectColumn?: (colId: string) => void;
  onBrushFilter: (colId: string, range: [number, number] | null) => void;
  onCategoryFilter?: (
    colId: string,
    values: string[],
    includeNull: boolean
  ) => void;
}

const MAX_CATEGORIES = 20;

const round2 = (n: number): number =>
  Number(Math.round(Number(n + "e2")) + "e-2");

const countLabel = (n: number): string => n.toLocaleString();

function numericStatsFormatter(n: number | null | undefined): string {
  return n == null ? "-" : round2(n).toLocaleString();
}

interface HoverInfo {
  left: number;
  top: number;
  lines: string[];
  count: number;
}

interface CatBar {
  value: string;
  count: number;
  isNull: boolean;
}

const HistogramDialog: React.FunctionComponent<HistogramDialogProps> = ({
  appState,
  stateRef,
  colId,
  onClose,
  onSelectColumn,
  onBrushFilter,
  onCategoryFilter,
}) => {
  const [data, setData] = useState<ColumnHistogramData | null>(null);
  const [stats, setStats] = useState<reltab.NumericSummaryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [binCount, setBinCount] = useState<number | null>(null);
  const [sliderVal, setSliderVal] = useState<number | null>(null);
  const [minOccVal, setMinOccVal] = useState<number | null>(null);
  const [minOccSliderVal, setMinOccSliderVal] = useState<number | null>(null);
  const [logY, setLogY] = useState(false);
  const [showNulls, setShowNulls] = useState(true);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(new Set());
  const [selectedNull, setSelectedNull] = useState(false);
  const chartWrapRef = useRef<HTMLDivElement>(null);

  const isOpen = colId != null;
  const numeric = data != null && "binWidth" in data;

  // The query and schema whose data the histogram should describe. When a
  // pivot is active this is the aggregated (tree) query and its schema, so
  // the histogram reflects the aggregated cells; otherwise the base query.
  const getViewQueryAndSchema = (): {
    query: reltab.QueryExp;
    schema: reltab.Schema;
  } | null => {
    const app = mutableGet(stateRef);
    const vs = app.viewState;
    if (!vs?.dbc || !vs.baseQuery || !vs.baseSchema) {
      return null;
    }
    const isPivoted = vs.viewParams.vpivots.length > 0;
    return {
      query:
        isPivoted && vs.queryView != null ? vs.queryView.query : vs.baseQuery,
      schema:
        isPivoted && vs.dataView?.schema != null
          ? vs.dataView.schema
          : vs.baseSchema,
    };
  };

  useEffect(() => {
    if (colId == null) {
      return;
    }
    let cancelled = false;
    const qs = getViewQueryAndSchema();
    if (qs == null) {
      return;
    }
    const { query, schema } = qs;
    const colKind: ColumnKind = schema.columnType(colId).kind;
    const isNumericCol = colKind === "integer" || colKind === "real";

    setLoading(true);
    setError(null);
    setData(null);
    setStats(null);
    setBinCount(null);
    setSliderVal(null);
    setMinOccVal(null);
    setMinOccSliderVal(null);
    setHoverInfo(null);
    setSelectedCats(new Set());
    setSelectedNull(false);

    const run = async () => {
      try {
        const app = mutableGet(stateRef);
        const vs = app.viewState;
        const res = await loadColumnHistogramData(
          vs!.dbc!,
          query,
          schema,
          colId,
          undefined
        );
        if (cancelled) return;
        setData(res);
        if (res != null && isNumericCol) {
          const statsMap = await vs!.dbc!.getColumnStatsMap(query);
          const s = statsMap[colId];
          if (s != null && s.statsType === "numeric") {
            if (cancelled) return;
            setStats(s);
          }
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(`Error loading histogram: ${String(err)}`);
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colId, stateRef]);

  // re-bin with an explicit count without touching stats
  useEffect(() => {
    if (colId == null || binCount == null) {
      return;
    }
    let cancelled = false;
    const qs = getViewQueryAndSchema();
    if (qs == null) {
      return;
    }
    const { query, schema } = qs;
    const run = async () => {
      try {
        const app = mutableGet(stateRef);
        const vs = app.viewState;
        const res = await loadColumnHistogramData(
          vs!.dbc!,
          query,
          schema,
          colId,
          binCount
        );
        if (!cancelled && res != null && "binWidth" in res) {
          setData(res);
        }
      } catch (err) {
        if (!cancelled) setError(`Error re-binning histogram: ${String(err)}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binCount, colId, stateRef]);

  const handleBrushEnd = (brushInfo: any) => {
    if (colId == null) return;
    const app = mutableGet(stateRef);
    const vs = app.viewState;
    if (vs == null || !vs.baseSchema.columns.includes(colId)) {
      return;
    }
    const ck = vs.baseSchema.columnType(colId).kind;
    let [minVal, maxVal] = brushInfo.x;
    if (ck === "integer") {
      minVal = Math.round(minVal);
      maxVal = Math.round(maxVal);
    } else {
      minVal = round2(minVal);
      maxVal = round2(maxVal);
    }
    onBrushFilter(colId, [minVal, maxVal]);
  };

  const categoricalBars = (
    catData: reltab.CategoricalDistributionData
  ): CatBar[] => {
    const minOcc =
      minOccSliderVal ?? minOccVal ?? Math.round(catData.totalCount * 0.02);
    const values = catData.binData
      .filter((b) => b.count >= minOcc)
      .slice(0, MAX_CATEGORIES);
    const bars: CatBar[] = values.map((b) => ({
      value: String(b.value),
      count: b.count,
      isNull: false,
    }));
    if (showNulls && catData.nullCount > 0) {
      bars.push({ value: "(null)", count: catData.nullCount, isNull: true });
    }
    return bars.filter((d) => (logY ? d.count > 0 : true));
  };

  const handleChartMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const wrap = chartWrapRef.current;
    if (!wrap || data == null) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const padLeft = 64;
    const padRight = 24;
    const plotW = wrap.offsetWidth - padLeft - padRight;
    if (mx < padLeft || mx > padLeft + plotW) {
      return;
    }
    const oLeft = Math.min(mx + 14, wrap.offsetWidth - 190);
    const oTop = e.clientY - rect.top + 14;
    if ("binWidth" in data) {
      const numData = data as reltab.NumericColumnHistogramData;
      const binW = plotW / numData.binCount;
      let i = Math.floor((mx - padLeft) / binW);
      i = Math.max(0, Math.min(numData.binCount - 1, i));
      const binMin = numData.niceMinVal + i * numData.binWidth;
      const binMax = binMin + numData.binWidth;
      setHoverInfo({
        left: oLeft,
        top: oTop,
        lines: [
          `${round2(binMin).toLocaleString()} \u2013 ${round2(
            binMax
          ).toLocaleString()}`,
        ],
        count: numData.binData[i] ?? 0,
      });
    } else {
      const catData = data as reltab.CategoricalDistributionData;
      const bars = categoricalBars(catData);
      if (bars.length === 0) {
        return;
      }
      const barW = plotW / bars.length;
      let i = Math.floor((mx - padLeft) / barW);
      i = Math.max(0, Math.min(bars.length - 1, i));
      setHoverInfo({
        left: oLeft,
        top: oTop,
        lines: [bars[i].value],
        count: bars[i].count,
      });
    }
  };

  const applyCategoryFilter = (next: Set<string>, nextNull: boolean) => {
    if (colId == null) return;
    onCategoryFilter?.(colId, Array.from(next), nextNull);
  };

  const toggleCatValue = (value: string) => {
    const next = new Set(selectedCats);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    setSelectedCats(next);
    applyCategoryFilter(next, selectedNull);
  };

  const toggleCatNull = () => {
    const nextNull = !selectedNull;
    setSelectedNull(nextNull);
    applyCategoryFilter(selectedCats, nextNull);
  };

  const isCatSelected = (value: string): boolean =>
    value === "(null)" ? selectedNull : selectedCats.has(value);

  const renderChartWrap = (chart: React.ReactNode) => (
    <div
      ref={chartWrapRef}
      style={{ position: "relative" }}
      onMouseMove={handleChartMouseMove}
    >
      {chart}
      {hoverInfo != null && (
        <div
          style={{
            position: "absolute",
            left: hoverInfo.left,
            top: hoverInfo.top,
            background: "#F5F8FA",
            border: "1px solid #137CBD",
            borderRadius: 3,
            padding: "4px 8px",
            fontSize: 12,
            lineHeight: 1.4,
            pointerEvents: "none",
            zIndex: 30,
            maxWidth: 260,
            boxShadow: "0 2px 6px rgba(17, 20, 24, 0.2)",
          }}
        >
          {hoverInfo.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div>
            <strong>count: {countLabel(hoverInfo.count)}</strong>
          </div>
        </div>
      )}
    </div>
  );

  const renderNumericChart = () => {
    const numData = data as reltab.NumericColumnHistogramData;
    const chartData = numData.binData
      .map((count: number, i: number) => ({
        binMid: numData.niceMinVal + (i + 0.5) * numData.binWidth,
        count,
      }))
      .filter((d) => (logY ? d.count > 0 : true));
    const nullCount = stats?.pctNull ? Math.round(stats.pctNull * stats.count) : 0;
    const nullBars =
      showNulls && nullCount > 0
        ? [{ binMid: numData.niceMaxVal + numData.binWidth * 1.5, count: nullCount }]
        : [];

    const fmtOpts = {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      useGrouping: true,
    };

    // Highlight the bars that fall inside the current brush selection
    const brushActive =
      numData.brushMaxVal - numData.brushMinVal <
      numData.niceMaxVal - numData.niceMinVal - 1e-9;
    const binColor = (d: any): string => {
      if (
        brushActive &&
        d.binMid >= numData.brushMinVal &&
        d.binMid <= numData.brushMaxVal
      ) {
        return "#FCD5CE";
      }
      return "#A3D5FF";
    };

    const chart = (
      <VictoryChart
        height={260}
        padding={{ top: 24, bottom: 44, left: 64, right: 24 }}
        domain={{ x: [numData.niceMinVal, numData.niceMaxVal + numData.binWidth * 2] }}
        scale={{ y: logY ? "log" : "linear" }}
        containerComponent={
          <VictoryBrushContainer
            responsive={true}
            brushDimension="x"
            brushDomain={{
              x: [numData.brushMinVal, numData.brushMaxVal],
            }}
            onBrushDomainChangeEnd={handleBrushEnd}
          />
        }
      >
        <VictoryAxis
          tickValues={[numData.niceMinVal, numData.niceMaxVal]}
          tickFormat={(tick: number) => tick.toLocaleString(undefined, fmtOpts)}
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 11, padding: 6 },
          }}
        />
        <VictoryAxis
          dependentAxis
          tickCount={4}
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 11, padding: 4 },
          }}
        />
        <VictoryBar
          style={{ data: { fill: binColor } }}
          data={chartData}
          x="binMid"
          y="count"
        />
        {nullBars.length > 0 && (
          <VictoryBar
            style={{ data: { fill: "#8A9BA8" } }}
            data={nullBars}
            x="binMid"
            y="count"
          />
        )}
      </VictoryChart>
    );
    return renderChartWrap(chart);
  };

  const renderCategoricalChart = () => {
    const catData = data as reltab.CategoricalDistributionData;
    const bars = categoricalBars(catData);

    if (catData.totalCount === 0) {
      return <p className="bp4-text-muted">No data for this column.</p>;
    }
    if (bars.length === 0) {
      return <p className="bp4-text-muted">No non-null values to display.</p>;
    }

    const minOccDefault = Math.round(catData.totalCount * 0.02);
    const minOccCurrent = minOccSliderVal ?? minOccVal ?? minOccDefault;
    const minOccMax = Math.max(10, Math.round(catData.totalCount * 0.5));

    const chart = (
      <VictoryChart
        height={260}
        padding={{ top: 24, bottom: 74, left: 64, right: 24 }}
        scale={{ y: logY ? "log" : "linear" }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 9, angle: 40, textAnchor: "start" },
          }}
          tickValues={bars.map((d) => d.value)}
        />
        <VictoryAxis
          dependentAxis
          tickCount={4}
          style={{
            axis: { stroke: "#CBD2D9" },
            tickLabels: { fontSize: 11, padding: 4 },
          }}
        />
        <VictoryBar
          style={{
            data: {
              fill: (d: any) => (isCatSelected(d.value) ? "#FCD5CE" : "#A3D5FF"),
            },
          }}
          data={bars}
          x="value"
          y="count"
          events={[
            {
              target: "data",
              eventHandlers: {
                onClick: (_evt: any, props: any) => {
                  const val = String(props.datum.value);
                  if (val === "(null)") {
                    toggleCatNull();
                  } else {
                    toggleCatValue(val);
                  }
                  return undefined;
                },
              },
            },
          ]}
        />
      </VictoryChart>
    );
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: "nowrap",
              marginRight: 10,
            }}
          >
            Min freq:
          </span>
          <div style={{ flexGrow: 1 }}>
            <Slider
              min={0}
              max={minOccMax}
              stepSize={1}
              value={minOccCurrent}
              labelRenderer={false}
              onChange={(v) => setMinOccSliderVal(v)}
              onRelease={(v) => setMinOccVal(v)}
            />
          </div>
          <span
            style={{
              fontSize: 12,
              marginLeft: 10,
              whiteSpace: "nowrap",
            }}
          >
            {countLabel(Math.round(minOccCurrent))}
          </span>
        </div>
        {renderChartWrap(chart)}
        <div className="bp4-text-muted" style={{ fontSize: 12, marginTop: 4 }}>
          Click a bar to filter the grid to that value; click it again to
          remove it. Select several to combine them. Values with fewer
          occurrences than the minimum are hidden.
        </div>
      </div>
    );
  };

  const renderStatsPanel = () => {
    const wrap = (tags: React.ReactNode) => (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{tags}</div>
    );
    if (numeric) {
      const numData = data as reltab.NumericColumnHistogramData;
      const nullPct = stats?.pctNull ?? null;
      const rows = stats?.count ?? 0;
      const nulls = nullPct == null ? 0 : Math.round(nullPct * rows);
      return wrap(
        <>
          <Tag minimal>Bins: {numData.binCount.toString()}</Tag>
          <Tag minimal>Rows: {countLabel(rows)}</Tag>
          <Tag minimal>Nulls: {countLabel(nulls)}</Tag>
          <Tag minimal>Unique: {(stats?.approxUnique ?? "-").toString()}</Tag>
          <Tag minimal>Min: {numericStatsFormatter(stats?.min)}</Tag>
          <Tag minimal>Max: {numericStatsFormatter(stats?.max)}</Tag>
          <Tag minimal>Mean: {numericStatsFormatter(stats?.mean)}</Tag>
          <Tag minimal>Std: {numericStatsFormatter(stats?.std)}</Tag>
        </>
      );
    }
    if (data != null) {
      const catData = data as reltab.CategoricalDistributionData;
      return wrap(
        <>
          <Tag minimal>Values: {countLabel(catData.binData.length)}</Tag>
          <Tag minimal>Nulls: {countLabel(catData.nullCount)}</Tag>
          <Tag minimal>Total: {countLabel(catData.totalCount)}</Tag>
        </>
      );
    }
    return null;
  };

  let body: React.ReactNode = null;
  if (loading) {
    body = <Spinner />;
  } else if (error != null) {
    body = <p className="bp4-intent-danger">{error}</p>;
  } else if (data == null) {
    body = (
      <p className="bp4-text-muted">
        No histogram available for this column (it may have no data or a single
        repeated value).
      </p>
    );
  } else {
    body = (
      <>
        {numeric && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
              }}
            >
              <div className="bp4-text-muted" style={{ fontSize: 12 }}>
                Bins
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>
                {sliderVal ??
                  binCount ??
                  (data as reltab.NumericColumnHistogramData).binCount}
              </div>
            </div>
            <Slider
              min={2}
              max={50}
              stepSize={1}
              labelRenderer={false}
              labelStepSize={10}
              value={Math.min(
                Math.max(
                  sliderVal ?? (data as reltab.NumericColumnHistogramData).binCount,
                  2
                ),
                50
              )}
              onChange={(v: number) => setSliderVal(v)}
              onRelease={(v: number) => setBinCount(v)}
            />
          </div>
        )}
        {numeric ? renderNumericChart() : renderCategoricalChart()}
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            margin: "8px 0",
          }}
        >
          <Switch label="Log Y" checked={logY} onChange={() => setLogY(!logY)} />
          <Switch
            label="Show nulls"
            checked={showNulls}
            onChange={() => setShowNulls(!showNulls)}
          />
        </div>
        {renderStatsPanel()}
      </>
    );
  }

  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;
  const displayName =
    colId != null ? viewSchema?.displayName(colId) ?? colId : "";
  const columns =
    viewSchema != null
      ? viewSchema.columns.filter((cid) => !cid.startsWith("_") && cid !== "Rec")
      : [];

  return (
    <Dialog
      isOpen={isOpen}
      title={`${displayName} - Histogram`}
      onClose={onClose}
      canOutsideClickClose={false}
      style={{
        resize: "both",
        overflow: "auto",
        minWidth: 420,
        minHeight: 300,
        maxWidth: "95vw",
        maxHeight: "95vh",
      }}
    >
      <div className="bp4-dialog-body" onMouseLeave={() => setHoverInfo(null)}>
        <div style={{ marginBottom: 10 }}>
          <HTMLSelect
            value={colId ?? ""}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              onSelectColumn?.(e.target.value)
            }
          >
            {columns.map((cid) => (
              <option key={cid} value={cid}>
                {viewSchema!.displayName(cid)}
              </option>
            ))}
          </HTMLSelect>
        </div>
        {body}
      </div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default HistogramDialog;