// An interactive per-column histogram dialog, opened from the column header
// context menu. Numeric columns get a binned histogram (with bin count, log
// scale, null bar, brush-to-filter); other columns get a categorical bar
// chart.
import * as React from "react";
import { useEffect, useState } from "react";
import * as reltab from "reltab";
import {
  Button,
  Dialog,
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
  onBrushFilter: (colId: string, range: [number, number] | null) => void;
}

const MAX_CATEGORIES = 20;

const round2 = (n: number): number =>
  Number(Math.round(Number(n + "e2")) + "e-2");

const countLabel = (n: number): string => n.toLocaleString();

function numericStatsFormatter(n: number | null | undefined): string {
  return n == null ? "-" : round2(n).toLocaleString();
}

const HistogramDialog: React.FunctionComponent<HistogramDialogProps> = ({
  appState,
  stateRef,
  colId,
  onClose,
  onBrushFilter,
}) => {
  const [data, setData] = useState<ColumnHistogramData | null>(null);
  const [stats, setStats] = useState<reltab.NumericSummaryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [binCount, setBinCount] = useState<number | null>(null);
  const [sliderVal, setSliderVal] = useState<number | null>(null);
  const [logY, setLogY] = useState(false);
  const [showNulls, setShowNulls] = useState(true);

  const isOpen = colId != null;
  const numeric = data != null && "binWidth" in data;

  useEffect(() => {
    if (colId == null) {
      return;
    }
    let cancelled = false;
    const app = mutableGet(stateRef);
    const vs = app.viewState;
    if (!vs?.dbc || !vs.baseQuery || !vs.baseSchema) {
      return;
    }
    const colKind: ColumnKind = vs.baseSchema.columnType(colId).kind;
    const isNumericCol = colKind === "integer" || colKind === "real";

    setLoading(true);
    setError(null);
    setData(null);
    setStats(null);
    setBinCount(null);
    setSliderVal(null);

    const run = async () => {
      try {
        const res = await loadColumnHistogramData(
          vs.dbc!,
          vs.baseQuery!,
          vs.baseSchema!,
          colId,
          undefined
        );
        if (cancelled) return;
        setData(res);
        if (res != null && isNumericCol) {
          const statsMap = await vs.dbc!.getColumnStatsMap(vs.baseQuery!);
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
  }, [colId, stateRef]);

  // re-bin with an explicit count without touching stats
  useEffect(() => {
    if (colId == null || binCount == null) {
      return;
    }
    let cancelled = false;
    const app = mutableGet(stateRef);
    const vs = app.viewState;
    if (!vs?.dbc || !vs.baseQuery || !vs.baseSchema) {
      return;
    }
    const run = async () => {
      try {
        const res = await loadColumnHistogramData(
          vs.dbc!,
          vs.baseQuery!,
          vs.baseSchema!,
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
  }, [binCount, colId, stateRef]);

  const handleBrushEnd = (brushInfo: any) => {
    if (colId == null) return;
    const app = mutableGet(stateRef);
    const vs = app.viewState;
    const ck = vs?.baseSchema.columnType(colId).kind;
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

    return (
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
          style={{ data: { fill: "#137CBD" } }}
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
  };

  const renderCategoricalChart = () => {
    const catData = data as reltab.CategoricalDistributionData;
    const values = catData.binData.slice(0, MAX_CATEGORIES);
    const bars = showNulls && catData.nullCount > 0
      ? [...values.map((b) => ({ value: String(b.value), count: b.count })), { value: "(null)", count: catData.nullCount }]
      : values.map((b) => ({ value: String(b.value), count: b.count }));
    const shown = bars.filter((d) => (logY ? d.count > 0 : true));

    if (catData.totalCount === 0) {
      return <p className="bp4-text-muted">No data for this column.</p>;
    }
    if (shown.length === 0) {
      return <p className="bp4-text-muted">No non-null values to display.</p>;
    }

    return (
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
          tickValues={shown.map((d) => d.value)}
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
          style={{ data: { fill: "#137CBD" } }}
          data={shown}
          x="value"
          y="count"
        />
      </VictoryChart>
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
            <div className="bp4-text-muted" style={{ fontSize: 12 }}>
              Bins
            </div>
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

  const displayName =
    colId != null
      ? appState.viewState?.baseSchema.displayName(colId) ?? colId
      : "";

  return (
    <Dialog
      isOpen={isOpen}
      title={`${displayName} - Histogram`}
      onClose={onClose}
      canOutsideClickClose={false}
    >
      <div className="bp4-dialog-body">{body}</div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default HistogramDialog;