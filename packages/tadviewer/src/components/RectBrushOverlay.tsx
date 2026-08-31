// A 2D rectangular brush overlay used by the SPLOM master-detail view. Unlike
// Victory's 1D brush container, this lets the user drag a rectangle over the
// plot area to select a range in both data dimensions. Ranges are reported
// back (in data coordinates) via `onBrushSelect`.
import * as React from "react";
import { useRef, useState } from "react";

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export interface RectBrushOverlayProps {
  // Pixel rectangle of the plot area (getBoundingClientRect-style, relative to
  // the overlay's positioned parent).
  left: number;
  top: number;
  width: number;
  height: number;
  // Map a pixel offset inside the plot area to data coordinates.
  toData: (px: number, py: number) => { x: number; y: number };
  // Map data coordinates to pixel offsets inside the plot area (inverse of
  // toData), used to render a persisted selection.
  toPixel: (x: number, y: number) => { x: number; y: number };
  // Called with the selected data ranges (or null when the selection is
  // cleared, e.g. by a click without dragging).
  onBrushSelect: (
    region: { x: [number, number]; y: [number, number] } | null
  ) => void;
  // Optional externally-held selection (in data space) to render persistently.
  selection?: { x: [number, number]; y: [number, number] } | null;
}

const RectBrushOverlay: React.FunctionComponent<RectBrushOverlayProps> = ({
  left,
  top,
  width,
  height,
  toData,
  toPixel,
  onBrushSelect,
  selection,
}) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const draggingRef = useRef(false);

  const onMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      curX: e.clientX - rect.left,
      curY: e.clientY - rect.top,
    });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setDrag((d) =>
      d == null
        ? null
        : {
            ...d,
            curX: e.clientX - rect.left,
            curY: e.clientY - rect.top,
          }
    );
  };

  const onMouseUp = () => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    if (drag != null) {
      const sx = Math.min(drag.startX, drag.curX);
      const sy = Math.min(drag.startY, drag.curY);
      const ex = Math.max(drag.startX, drag.curX);
      const ey = Math.max(drag.startY, drag.curY);
      if (ex - sx < 3 || ey - sy < 3) {
        // A near-zero drag is treated as a brush clear.
        onBrushSelect(null);
      } else {
        const d0 = toData(sx, sy);
        const d1 = toData(ex, ey);
        onBrushSelect({
          x: [Math.min(d0.x, d1.x), Math.max(d0.x, d1.x)],
          y: [Math.max(d0.y, d1.y), Math.min(d0.y, d1.y)],
        });
      }
    }
    setDrag(null);
  };

  // Rect to draw: during an active drag use the live drag geometry; otherwise
  // use the externally-held selection (data space mapped to pixels).
  let draw: { x: number; y: number; w: number; h: number } | null = null;
  if (drag != null) {
    draw = {
      x: Math.min(drag.startX, drag.curX),
      y: Math.min(drag.startY, drag.curY),
      w: Math.abs(drag.curX - drag.startX),
      h: Math.abs(drag.curY - drag.startY),
    };
  } else if (selection != null) {
    const p0 = toPixel(selection.x[0], selection.y[1]);
    const p1 = toPixel(selection.x[1], selection.y[0]);
    draw = {
      x: Math.min(p0.x, p1.x),
      y: Math.min(p0.y, p1.y),
      w: Math.abs(p1.x - p0.x),
      h: Math.abs(p1.y - p0.y),
    };
  }

  const visible = draw != null && draw.w > 1 && draw.h > 1;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        cursor: "crosshair",
      }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => {
        draggingRef.current = false;
      }}
    >
      {visible && draw != null && (
        <div
          style={{
            position: "absolute",
            left: draw.x,
            top: draw.y,
            width: draw.w,
            height: draw.h,
            border: "1.5px solid #137CBD",
            background: "rgba(19, 124, 189, 0.15)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  );
};

export default RectBrushOverlay;
