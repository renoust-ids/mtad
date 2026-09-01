// A single reusable 2D scatter plot with interactive exploration controls. Used
// both for the SPLOM master-detail view and the standalone "Analytics > Scatter
// Plot" dialog. Provides a 2D brush (which reports a data-space range on both
// axes), optional log scales per axis, a fitted linear regression trend line,
// a hover tooltip, and a stats row.
import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Tag } from "@blueprintjs/core";
import {
  VictoryAxis,
  VictoryChart,
  VictoryLine,
  VictoryScatter,
} from "victory";
import RectBrushOverlay from "./RectBrushOverlay";

export interface ScatterPoint {
  x: number;
  y: number;
  color: string;
}

export interface ScatterRegression {
  slope: number | null;
  intercept: number | null;
  r: number | null;
  r2: number | null;
  n: number;
}

export interface ScatterPlotProps {
  xColId: string;
  yColId: string;
  pts: ScatterPoint[];
  xDomain: [number, number];
  yDomain: [number, number];
  // Axis kinds drive whether the log toggle is offered (categorical axes are
  // slot-encoded integer bands and cannot be log-scaled).
  xKind?: "numeric" | "temporal" | "categorical";
  yKind?: "numeric" | "temporal" | "categorical";
  regression?: ScatterRegression | null;
  // Format an axis value for a tick or tooltip.
  fmtAxis: (colId: string, v: number) => string | number;
  // Report a 2D brush selection in data-space (raw, pre-log) on both axes;
  // null means the brush was cleared.
  onBrushFilter: (
    xRange: [number, number] | null,
    yRange: [number, number] | null
  ) => void;
}

// Log10 helpers with a floor so non-positive values stay representable.
const logFloor = 1e-9;
const toLog = (v: number): number =>
  v <= logFloor ? Math.log10(logFloor) : Math.log10(v);
const toLogInv = (v: number): number => Math.pow(10, v);

interface HoverInfo {
  left: number;
  top: number;
  lines: string[];
}

const countLabel = (n: number): string => n.toLocaleString();
const round2 = (n: number): number =>
  Number(Math.round(Number(n + "e2")) + "e-2");
const DOTS_COLOR = "#A3D5FF";

const ScatterPlot: React.FunctionComponent<ScatterPlotProps> = ({
  xColId,
  yColId,
  pts,
  xDomain,
  yDomain,
  xKind = "numeric",
  yKind = "numeric",
  regression,
  fmtAxis,
  onBrushFilter,
}) => {
  const [logX, setLogX] = useState(false);
  const [logY, setLogY] = useState(false);
  const [brushSel, setBrushSel] = useState<{
    x: [number, number];
    y: [number, number];
  } | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const plotWrapRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState<number>(720);

  // Reset brush/log when the axis pair changes (remount-safe).
  useEffect(() => {
    setBrushSel(null);
    setLogX(false);
    setLogY(false);
  }, [xColId, yColId]);

  // Measure the available width so the plot stays responsive in its container.
  useEffect(() => {
    const el = plotWrapRef.current;
    if (el == null) {
      return;
    }
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) {
        setPlotWidth(Math.max(320, w));
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rawDomX = xDomain;
  const rawDomY = yDomain;
  const useLogX = logX && xKind !== "categorical";
  const useLogY = logY && yKind !== "categorical";
  const domX: [number, number] = useLogX
    ? [toLog(rawDomX[0]), toLog(rawDomX[1])]
    : rawDomX;
  const domY: [number, number] = useLogY
    ? [toLog(rawDomY[0]), toLog(rawDomY[1])]
    : rawDomY;
  const tx = useLogX ? toLog : (v: number) => v;
  const ty = useLogY ? toLog : (v: number) => v;

  const dataPts = pts
    .map((p) => ({ x: tx(p.x), y: ty(p.y), color: p.color, origX: p.x, origY: p.y }))
    .filter(
      (p) =>
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        Number.isFinite(p.origX) &&
        Number.isFinite(p.origY)
    );

  const padLeft = 64;
  const padTop = 24;
  const padRight = 24;
  const padBottom = 48;
  const plotW = Math.max(120, plotWidth - padLeft - padRight);
  const plotH = 320;

  const toData = (px: number, py: number) => ({
    x: domX[0] + (px / plotW) * (domX[1] - domX[0]),
    y: domY[1] - (py / plotH) * (domY[1] - domY[0]),
  });
  const toPixel = (x: number, y: number) => ({
    x: ((x - domX[0]) / (domX[1] - domX[0])) * plotW,
    y: ((domY[1] - y) / (domY[1] - domY[0])) * plotH,
  });

  // Regression trend line. The fit is in raw units, so map x back to raw (if
  // log) before evaluating, then map the fitted y into display space.
  let trendPts: { x: number; y: number }[] = [];
  if (
    regression != null &&
    regression.slope != null &&
    regression.intercept != null
  ) {
    const x0 = domX[0];
    const x1 = domX[1];
    const xs = useLogX ? [toLogInv(x0), toLogInv(x1)] : [x0, x1];
    const ys = xs.map((xv) => regression.slope! * xv + regression.intercept!);
    trendPts = ys.map((yv, k) => ({ x: xs[k], y: yv }));
    if (useLogX || useLogY) {
      trendPts = trendPts.map((t) => ({
        x: useLogX ? toLog(t.x) : t.x,
        y: useLogY ? toLog(t.y) : t.y,
      }));
    }
  }

  const minMax =
    dataPts.length > 0
      ? {
          xMin: Math.min(...dataPts.map((p) => p.origX)),
          xMax: Math.max(...dataPts.map((p) => p.origX)),
          yMin: Math.min(...dataPts.map((p) => p.origY)),
          yMax: Math.max(...dataPts.map((p) => p.origY)),
        }
      : null;

  const handleBrushSelect = (
    region: { x: [number, number]; y: [number, number] } | null
  ) => {
    setBrushSel(region);
    setHoverInfo(null);
    if (region == null) {
      onBrushFilter(null, null);
      return;
    }
    const xlo = useLogX ? toLogInv(region.x[0]) : region.x[0];
    const xhi = useLogX ? toLogInv(region.x[1]) : region.x[1];
    const ylo = useLogY ? toLogInv(region.y[0]) : region.y[0];
    const yhi = useLogY ? toLogInv(region.y[1]) : region.y[1];
    onBrushFilter([Math.min(xlo, xhi), Math.max(xlo, xhi)], [
      Math.min(ylo, yhi),
      Math.max(ylo, yhi),
    ]);
  };

  const onPlotMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left - padLeft;
    const my = e.clientY - rect.top - padTop;
    if (mx < 0 || my < 0 || mx > plotW || my > plotH) {
      setHoverInfo(null);
      return;
    }
    const di = toData(mx, my);
    const xv = useLogX ? toLogInv(di.x) : di.x;
    const yv = useLogY ? toLogInv(di.y) : di.y;
    setHoverInfo({
      left: e.clientX - rect.left + 12,
      top: e.clientY - rect.top + 12,
      lines: [
        `${xColId}: ${fmtAxis(xColId, xv)}`,
        `${yColId}: ${fmtAxis(yColId, yv)}`,
      ],
    });
  };

  const stats: string[] = [];
  stats.push(`n: ${countLabel(dataPts.length)}`);
  if (regression != null && regression.r != null && regression.n >= 2) {
    stats.push(`r: ${round2(regression.r)}`);
  }
  if (
    regression != null &&
    regression.slope != null &&
    regression.intercept != null
  ) {
    stats.push(`y = ${round2(regression.slope)}·x + ${round2(regression.intercept)}`);
  }
  if (regression != null && regression.r2 != null && regression.n >= 2) {
    stats.push(`r²: ${round2(regression.r2)}`);
  }
  if (minMax != null) {
    stats.push(
      `${xColId}: [${fmtAxis(xColId, minMax.xMin)}, ${fmtAxis(xColId, minMax.xMax)}]`
    );
    stats.push(
      `${yColId}: [${fmtAxis(yColId, minMax.yMin)}, ${fmtAxis(yColId, minMax.yMax)}]`
    );
  }

  const xLoggable = xKind !== "categorical";
  const yLoggable = yKind !== "categorical";

  return (
    <div>
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginBottom: 8 }}>
        {xLoggable && (
          <>
            <span className="bp4-text-muted" style={{ fontSize: 11 }}>
              log X
            </span>
            <input
              type="checkbox"
              checked={logX}
              onChange={() => {
                setLogX((v) => !v);
                setBrushSel(null);
              }}
            />
          </>
        )}
        {yLoggable && (
          <>
            <span className="bp4-text-muted" style={{ fontSize: 11 }}>
              log Y
            </span>
            <input
              type="checkbox"
              checked={logY}
              onChange={() => {
                setLogY((v) => !v);
                setBrushSel(null);
              }}
            />
          </>
        )}
      </div>
      <div
        ref={plotWrapRef}
        style={{ position: "relative", width: "100%" }}
        onMouseMove={onPlotMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
      >
        <VictoryChart
          height={plotH + padTop + padBottom}
          width={plotW + padLeft + padRight}
          padding={{
            top: padTop,
            bottom: padBottom,
            left: padLeft,
            right: padRight,
          }}
          domain={{ x: domX, y: domY }}
        >
          <VictoryAxis
            style={{
              axis: { stroke: "#CBD2D9" },
              tickLabels: { fontSize: 11, padding: 6 },
            }}
            tickFormat={(t: unknown) =>
              fmtAxis(xColId, useLogX ? toLogInv(t as number) : (t as number))
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
              fmtAxis(yColId, useLogY ? toLogInv(t as number) : (t as number))
            }
          />
          {trendPts.length === 2 && (
            <VictoryLine
              style={{ data: { stroke: "#E07F1D", strokeWidth: 2 } }}
              data={trendPts}
            />
          )}
          {dataPts.length > 0 && (
            <VictoryScatter
              style={{
                data: {
                  fill: (d: { datum?: { color: string } }) =>
                    d.datum != null ? d.datum.color : DOTS_COLOR,
                  opacity: ({ active }: { active?: boolean }) =>
                    active === true ? 1 : 0.75,
                },
              }}
              data={dataPts}
              x="x"
              y="y"
              size={3}
            />
          )}
        </VictoryChart>
        <RectBrushOverlay
          left={padLeft}
          top={padTop}
          width={plotW}
          height={plotH}
          toData={toData}
          toPixel={toPixel}
          selection={brushSel}
          onBrushSelect={handleBrushSelect}
        />
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
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {stats.map((s, k) => (
          <Tag key={k} minimal>
            {s}
          </Tag>
        ))}
      </div>
      <div className="bp4-text-muted" style={{ fontSize: 11, marginTop: 6 }}>
        Drag to brush a 2D region and filter the table on both axes; click
        without dragging to clear.
      </div>
    </div>
  );
};

export default ScatterPlot;
