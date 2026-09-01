// Shared helpers for plotting categorical columns on a (numeric) scatter axis.
// Each distinct category is assigned an integer "slot" (0, 1, 2, ...) so the
// axis stays a continuous numeric scale (needed by the brush overlay and
// Victory). The tick labels are recovered from the slot mapping. Both the
// standalone Scatter Plot dialog and the SPLOM master use these helpers.

export type ScatterAxisKind = "numeric" | "temporal" | "categorical";

export interface ScatterAxisSpec {
  colId: string;
  kind: ScatterAxisKind;
  // Per-axis domain in plot coordinates (for categorical this is the slot
  // range padded by ±0.5 so each category occupies its own half-open band).
  domain: [number, number];
  // For categorical axes only: ordered distinct labels, slot index = position.
  slotLabels: string[] | null;
  // Legacy: plain numeric/temporal domain labels come from fmtAxis; for
  // categorical, fmtAxis is expected to look up slotLabels by index.
  isCategorical: boolean;
}

// Map a categorical label to its slot index, or -1 if unknown.
export const categoricalSlot = (
  spec: ScatterAxisSpec,
  label: string
): number => {
  if (spec.slotLabels == null) {
    return -1;
  }
  return spec.slotLabels.indexOf(label);
};

// Build a categorical axis spec for a column from the raw point values,
// keeping labels in first-seen order (stable across render). Pass the colId
// and the raw ScatterPoint values keyed by that column.
export const buildCategoricalAxis = (
  colId: string,
  rawValues: Array<number | string | boolean | null>
): ScatterAxisSpec => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const v of rawValues) {
    if (v == null) {
      continue;
    }
    const s = String(v);
    if (!seen.has(s)) {
      seen.add(s);
      labels.push(s);
    }
  }
  const domain: [number, number] =
    labels.length === 0 ? [0, 1] : [-0.5, labels.length - 0.5];
  return { colId, kind: "categorical", domain, slotLabels: labels, isCategorical: true };
};

// Compute the (numerical) coordinate for a raw point value on an axis.
export const axisCoord = (
  spec: ScatterAxisSpec,
  v: number | string | boolean | null
): number | null => {
  if (v == null) {
    return null;
  }
  if (spec.isCategorical) {
    const idx = spec.slotLabels == null ? -1 : spec.slotLabels.indexOf(String(v));
    return idx < 0 ? null : idx;
  }
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

// Map the numeric/raw axis coordinate to a tick label (used by fmtAxis).
export const axisTickLabel = (
  spec: ScatterAxisSpec,
  coord: number
): string | number => {
  if (spec.isCategorical) {
    const idx = Math.round(coord);
    const label = spec.slotLabels != null ? spec.slotLabels[idx] : undefined;
    return label != null ? label : "";
  }
  return coord;
};

// Convert a brushed [lo, hi] coordinate range on a categorical axis into the
// ordered list of labels whose slots fall within it. Empty => nothing selected.
export const categoricalValuesInRange = (
  spec: ScatterAxisSpec,
  range: [number, number] | null
): string[] => {
  if (!spec.isCategorical || spec.slotLabels == null || range == null) {
    return [];
  }
  const lo = Math.ceil(Math.min(range[0], range[1]) - 0.5);
  const hi = Math.floor(Math.max(range[0], range[1]) + 0.5);
  const out: string[] = [];
  for (let idx = lo; idx <= hi; idx++) {
    const label = spec.slotLabels[idx];
    if (label != null && !out.includes(label)) {
      out.push(label);
    }
  }
  return out;
};

// Per-axis brush result forwarded by a 2D scatter dialog to the analytics
// filter. Numeric/temporal axes carry a continuous `range` (rendered as a
// >= / <= pair); a categorical axis carries the exact `values` selected by
// brushing (rendered as an IN clause).
export interface ScatterAxisFilterArg {
  colId: string;
  range?: [number, number] | null;
  values?: string[] | null;
}

// Translate a 2D brush (in plot coordinates) into the per-axis filter args,
// mapping categorical slots back to their category labels.
export const axisFilterArgs = (
  xSpec: ScatterAxisSpec | null,
  xRange: [number, number] | null,
  ySpec: ScatterAxisSpec | null,
  yRange: [number, number] | null
): [ScatterAxisFilterArg, ScatterAxisFilterArg] => {
  const build = (
    spec: ScatterAxisSpec | null,
    range: [number, number] | null
  ): ScatterAxisFilterArg => {
    if (spec == null) {
      return { colId: "", range: null };
    }
    if (spec.isCategorical) {
      return { colId: spec.colId, values: categoricalValuesInRange(spec, range) };
    }
    return { colId: spec.colId, range };
  };
  return [build(xSpec, xRange), build(ySpec, yRange)];
};

