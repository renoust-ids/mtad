// An interactive per-column distribution dialog, opened from the column header
// context menu or the Analytics menu. Numeric and temporal columns get a binned
// histogram (with bin count, log scale, null bar, brush-to-filter); other
// columns get a categorical bar chart whose bars can be selected to filter the
// grid.
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

const fmtOpts = {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  useGrouping: true,
};

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

// Displays a number that can be edited by double-clicking it, committing on
// Enter / blur. Used to fine-tune slider values (bins, min frequency).
interface EditableNumberProps {
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}

const EditableNumber: React.FunctionComponent<EditableNumberProps> = ({
  value,
  min,
  max,
  onCommit,
}) => {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value));

  const commit = () => {
    const parsed = Number.parseInt(text, 10);
    if (!Number.isNaN(parsed)) {
      onCommit(Math.max(min, Math.min(max, Math.round(parsed))));
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        className="bp4-input"
        style={{
          width: 96,
          padding: "1px 6px",
          fontSize: 12,
          textAlign: "right",
        }}
        type="number"
        autoFocus
        value={text}
        min={min}
        max={max}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
          } else if (e.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span
      style={{
        cursor: "pointer",
        textDecoration: "underline dotted",
        userSelect: "none",
      }}
      title="Double-click to edit"
      onDoubleClick={() => {
        setText(String(value));
        setEditing(true);
      }}
    >
      {value.toLocaleString()}
    </span>
  );
};

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

  // Is the current column temporal (date / time / timestamp)? Temporal columns
  // are histogrammed over epoch-second values and shown with date formatting.
  const qsv = getViewQueryAndSchema();
  const viewKind: ColumnKind =
    colId != null && qsv != null
      ? qsv.schema.columnType(colId).kind
      : ("string" as ColumnKind);
  const temporal = colId != null && reltab.isTemporalKind(viewKind);

  const fmtX = (x: number): string => {
    if (!temporal) {
      return x.toLocaleString(undefined, fmtOpts);
    }
    const d = new Date(x * 1000);
    if (viewKind === "date") {
      return d.toISOString().slice(0, 10);
    }
    if (viewKind === "time") {
      return d.toISOString().slice(11, 16);
    }
    return d.toISOString().slice(0, 16);
  };

  const fmtStat = (n: number | null | undefined): string =>
    n == null ? "-" : temporal ? fmtX(n) : numericStatsFormatter(n);

  // The query and schema whose data the histogram should describe. When a
  // pivot is active this is the aggregated (tree) query and its schema, so
  // the histogram reflects the aggregated cells; otherwise the base query.
  function getViewQueryAndSchema(): {
    query: reltab.QueryExp;
    schema: reltab.Schema;
  } | null {
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
  }

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
    const isNumericCol =
      colKind === "integer" ||
      colKind === "real" ||
      reltab.isTemporalKind(colKind);

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
          // Temporal columns are histogrammed over epoch-second values, so
          // numeric stats must be computed on the converted column.
          const s = reltab.isTemporalKind(colKind)
            ? await reltab.getTemporalColumnNumericStats(
                vs!.dbc!,
                query,
                colId
              )
            : (await vs!.dbc!.getColumnStatsMap(query))[colId];
          if (s != null && s.statsType === "numeric") {
            if (cancelled) return;
            setStats(s);
          }
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(`Error loading distribution: ${String(err)}`);
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
        if (!cancelled) setError(`Error re-binning distribution: ${String(err)}`);
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
    if (ck === "integer" || reltab.isTemporalKind(ck)) {
      minVal = Math.round(minVal);
      maxVal = Math.round(maxVal);
    } else {
      minVal = round2(minVal);
      maxVal = round2(maxVal);
    }
    onBrushFilter(colId, [minVal, maxVal]);
  };

  // Minimum occurrence threshold for categorical bars. Defaults to a rounded
  // 2% of the column's total count; the user can override it with the slider
  // or by double-clicking the value. Guarded against NaN / negative inputs.
  const minOccFor = (catData: reltab.CategoricalDistributionData): number => {
    const dflt = Math.round(catData.totalCount * 0.02);
    const raw = minOccSliderVal ?? minOccVal ?? dflt;
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : dflt;
  };

  const minOccMaxFor = (
    catData: reltab.CategoricalDistributionData
  ): number => Math.max(10, Math.round(catData.totalCount * 0.5));

  const categoricalBars = (
    catData: reltab.CategoricalDistributionData,
    minOcc: number
  ): CatBar[] => {
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
        lines: [`${fmtX(binMin)} \u2013 ${fmtX(binMax)}`],
        count: numData.binData[i] ?? 0,
      });
    } else {
      const catData = data as reltab.CategoricalDistributionData;
      const bars = categoricalBars(catData, minOccFor(catData));
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

    // Highlight the bars that fall inside the current brush selection
    const brushActive =
      numData.brushMaxVal - numData.brushMinVal <
      numData.niceMaxVal - numData.niceMinVal - 1e-9;
    const binColor = (p: any): string => {
      const mid = p?.datum?.binMid;
      if (
        brushActive &&
        mid != null &&
        mid >= numData.brushMinVal &&
        mid <= numData.brushMaxVal
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
          tickFormat={(tick: number) => fmtX(tick)}
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
    const minOcc = minOccFor(catData);
    const minOccMax = minOccMaxFor(catData);
    const bars = categoricalBars(catData, minOcc);

    const minOccControl = (
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
            value={minOcc}
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
          <EditableNumber
            value={minOcc}
            min={0}
            max={minOccMax}
            onCommit={(v) => {
              setMinOccSliderVal(v);
              setMinOccVal(v);
            }}
          />
        </span>
      </div>
    );

    if (catData.totalCount === 0) {
      return (
        <div>
          {minOccControl}
          <p className="bp4-text-muted">No data for this column.</p>
        </div>
      );
    }
    if (bars.length === 0) {
      return (
        <div>
          {minOccControl}
          <p className="bp4-text-muted">
            No values above the selected minimum frequency (try lowering it).
          </p>
        </div>
      );
    }

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
              fill: (p: any) =>
                isCatSelected(String(p.datum?.value)) ? "#FCD5CE" : "#A3D5FF",
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
        {minOccControl}
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
          <Tag minimal>Min: {fmtStat(stats?.min)}</Tag>
          <Tag minimal>Max: {fmtStat(stats?.max)}</Tag>
          <Tag minimal>Mean: {fmtStat(stats?.mean)}</Tag>
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
        No distribution available for this column (it may have no data or a
        single repeated value).
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
                <EditableNumber
                  value={
                    sliderVal ??
                    binCount ??
                    (data as reltab.NumericColumnHistogramData).binCount
                  }
                  min={2}
                  max={50}
                  onCommit={(v) => {
                    setSliderVal(v);
                    setBinCount(v);
                  }}
                />
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
      title={`${displayName} - Distribution`}
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