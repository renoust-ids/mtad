// Analytics "Correlation Matrix" dialog, opened from "Analytics > Correlation
// Matrix". The user picks a set of columns (numeric/temporal and categorical);
// the view renders an N×N matrix of pairwise association indices (Pearson / eta
// / Cramér's V, exactly as the SPLOM) as a colored heat-map, with a Pearson /
// Spearman toggle for the numeric pairs, an optional random sample bounding the
// correlation computation, and a min non-null occurrence threshold that blanks
// poorly-observed pairs. Columns that are always-null or constant are excluded
// from the picker and listed as an advisory. The matrix is read-only (no
// filtering cell interaction).
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import Select, {
  components,
  GroupBase,
  OptionProps,
  StylesConfig,
} from "react-select";
import * as reltab from "reltab";
import {
  Button,
  Dialog,
  HTMLSelect,
  Menu,
  MenuItem,
  NumericInput,
  Slider,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { mutableGet, StateRef } from "oneref";
import { AppState } from "../AppState";
import {
  CorrelationMatrixViewData,
  loadCorrelationMatrixData,
} from "../actions";

export interface CorrelationMatrixDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
}

const MAX_MATRIX_COLS = 24;
const DEFAULT_SAMPLE = 20000;

const cellColor = (norm: number): string => {
  const f = Math.max(0, Math.min(norm, 1));
  const r = 163 + (59 - 163) * f;
  const g = 213 + (130 - 213) * f;
  const b = 255 + (196 - 255) * f;
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

interface ColOption {
  value: string;
  label: string;
  kind: "numeric" | "categorical";
}

const colSelectStyles: StylesConfig<ColOption, true, GroupBase<ColOption>> = {
  control: (provided) => ({ ...provided, minWidth: 340, fontSize: 13 }),
  menu: (provided) => ({ ...provided, fontSize: 13 }),
  option: (provided) => ({
    ...provided,
    display: "flex",
    alignItems: "center",
  }),
  multiValue: (provided) => ({ ...provided, fontSize: 12 }),
  multiValueLabel: (provided) => ({ ...provided, paddingRight: 4 }),
};

const CheckboxOption: React.FC<
  OptionProps<ColOption, true, GroupBase<ColOption>>
> = ({ innerProps, innerRef, label, isSelected, isDisabled }) => (
  <div
    ref={innerRef}
    {...innerProps}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px",
      opacity: isDisabled ? 0.4 : 1,
    }}
  >
    <input type="checkbox" readOnly checked={isSelected} />
    <span style={{ flex: 1 }}>{label}</span>
    {isSelected && <span className="bp4-text-muted">✓</span>}
  </div>
);

const round3 = (n: number): number =>
  Number(Math.round(Number(n + "e3")) + "e-3");

const countLabel = (n: number): string => n.toLocaleString();

const CorrCell: React.FC<{
  value: number | null;
  n: number;
}> = ({ value, n }) => {
  if (value == null) {
    // blanked (below min occurrence) -> empty cell
    return <div style={{ minHeight: 30 }} />;
  }
  // r/eta/V range: r is -1..1, eta/V are 0..1. Normalize by interpreting the
  // sign with the magnitude to a 0..1 tint.
  const norm = Math.abs(value);
  const color = cellColor(norm);
  return (
    <div
      title={`${round3(value)} (n=${n})`}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 30,
        padding: "2px 4px",
        borderRadius: 3,
        cursor: "default",
        color: norm > 0.55 ? "#fff" : "#1a2433",
        background: color,
      }}
    >
      {round3(value)}
    </div>
  );
};

const CorrelationMatrixDialog: React.FunctionComponent<
  CorrelationMatrixDialogProps
> = ({ appState, stateRef, onClose }) => {
  const [selectedCols, setSelectedCols] = useState<string[]>([]);
  const [rank, setRank] = useState(false);
  const [useAllRows, setUseAllRows] = useState(false);
  const [sampleLimit, setSampleLimit] = useState<number>(DEFAULT_SAMPLE);
  const [sampleSliderVal, setSampleSliderVal] = useState<number | null>(null);
  const [applyTableFilters, setApplyTableFilters] = useState(true);
  const [minOccurrence, setMinOccurrence] = useState<number>(1);
  const [data, setData] = useState<CorrelationMatrixViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;

  // The query and schema whose data the matrix should describe (mirrors the
  // ConfusionMatrix/SPLOM "Apply Table Filters" behavior).
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

  const matrixKey = selectedCols.join("\u001f");

  const availableCols = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    return viewSchema.columns.filter(
      (cid) => !cid.startsWith("_") && cid !== "Rec"
    );
  }, [viewSchema]);

  // Excluded always-null / constant columns: excluded from the picker options
  // and listed as an advisory in the dialog.
  const excluded = data?.constantOrNullColIds ?? [];

  // MultiSelect options, grouped into numeric/temporal vs categorical, with the
  // always-null / constant columns removed.
  const colGroupedOptions = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    const excludedSet = new Set(excluded);
    const byKind = (kind: "numeric" | "categorical") =>
      availableCols
        .filter((cid) => !excludedSet.has(cid))
        .filter(
          (cid) =>
            (kind === "numeric"
              ? reltab.splomColKind(viewSchema.columnType(cid)) !== "categorical"
              : reltab.splomColKind(viewSchema.columnType(cid)) === "categorical")
        )
        .map((cid) => ({
          value: cid,
          label: viewSchema.displayName(cid),
          kind,
        }));
    const numeric = byKind("numeric");
    const categorical = byKind("categorical");
    const groups: GroupBase<ColOption>[] = [];
    if (numeric.length > 0) {
      groups.push({ label: "Numeric & temporal", options: numeric });
    }
    if (categorical.length > 0) {
      groups.push({ label: "Categorical", options: categorical });
    }
    return groups;
  }, [availableCols, excluded, viewSchema]);

  const colSelectedOptions: ColOption[] = useMemo(() => {
    const flat = colGroupedOptions.flatMap((g) => g.options);
    const byValue = new Map(flat.map((o) => [o.value, o]));
    return selectedCols
      .map((cid) => byValue.get(cid))
      .filter((o): o is ColOption => o != null);
  }, [colGroupedOptions, selectedCols]);

  const curMinOcc = minOccurrence;
  const curSample = sampleLimit;

  useEffect(() => {
    if (selectedCols.length < 2) {
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
    const app = mutableGet(stateRef);
    const v = app.viewState;
    if (!v?.dbc) {
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    loadCorrelationMatrixData(v.dbc, query, schema, selectedCols, {
      rank,
      sampleLimit: useAllRows ? 0 : curSample,
      minOccurrence: curMinOcc,
    })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Error loading correlation matrix: ${String(err)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    matrixKey,
    rank,
    curMinOcc,
    useAllRows,
    curSample,
    applyTableFilters,
    tableFilterKey,
    stateRef,
  ]);

  const isOpen = vs != null && appState.correlationMatrixDialogOpen;
  const nSel = selectedCols.length;

  // All pickable column ids (excludes null/constant/id-like), for Select all.
  const allSelectableCols = useMemo(() => {
    return colGroupedOptions.flatMap((g) => g.options.map((o) => o.value));
  }, [colGroupedOptions]);

  const handleSelectAll = () => {
    setSelectedCols(allSelectableCols.slice(0, MAX_MATRIX_COLS));
  };

  const handleClear = () => {
    setSelectedCols([]);
  };

  // Remove a single column (row & column) from the matrix, e.g. via context menu.
  const removeCol = (cid: string) => {
    setSelectedCols((prev) => prev.filter((c) => c !== cid));
  };

  // Fixed-position context menu ("Remove" on a row/column header).
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    cid: string;
    label: string;
  } | null>(null);

  const openCtxMenu = (e: React.MouseEvent, cid: string) => {
    e.preventDefault();
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      cid,
      label: viewSchema?.displayName(cid) ?? cid,
    });
  };

  useEffect(() => {
    if (ctxMenu == null) {
      return;
    }
    const close = () => setCtxMenu(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setCtxMenu(null);
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  // Vertical headroom for the -45deg column headers so long names stay visible
  // (each header rotates about its own bottom-left; reach ~ nameLen * sin(45deg)).
  const headerH = useMemo(() => {
    if (selectedCols.length === 0) {
      return 40;
    }
    const maxNameLen = Math.max(
      ...selectedCols.map((cid) => (viewSchema?.displayName(cid) ?? cid).length)
    );
    return Math.max(40, Math.min(Math.ceil(maxNameLen * 4.5) + 14, 200));
  }, [selectedCols, viewSchema]);

  // Build an N×N lookup (symmetric): value(i,j) for i<j from the upper
  // triangle returned by the backend; diagonal is 1.
  const cells: (number | null)[][] = useMemo(() => {
    if (data == null) {
      return [];
    }
    const m: (number | null)[][] = selectedCols.map(() =>
      selectedCols.map(() => null)
    );
    const idx = new Map(selectedCols.map((cid, i) => [cid, i]));
    for (const c of data.data) {
      const i = idx.get(c.xColId);
      const j = idx.get(c.yColId);
      if (i == null || j == null) {
        continue;
      }
      m[i][j] = c.strength;
      m[j][i] = c.strength;
    }
    for (let i = 0; i < selectedCols.length; i++) {
      m[i][i] = 1;
    }
    return m;
  }, [data, selectedCols]);

  const countByKey = useMemo(() => {
    const m = new Map<string, number>();
    if (data == null) {
      return m;
    }
    const idx = new Map(selectedCols.map((cid, i) => [cid, i]));
    for (const c of data.data) {
      const i = idx.get(c.xColId);
      const j = idx.get(c.yColId);
      if (i == null || j == null) {
        continue;
      }
      m.set(`${Math.min(i, j)}\u001f${Math.max(i, j)}`, c.n);
    }
    return m;
  }, [data, selectedCols]);

  return (
    <Dialog
      isOpen={isOpen}
      title="Correlation Matrix"
      onClose={onClose}
      canOutsideClickClose={false}
      style={{
        resize: "both",
        overflow: "auto",
        minWidth: 680,
        minHeight: 480,
        maxWidth: "95vw",
        maxHeight: "95vh",
      }}
    >
      <div
        className="bp4-dialog-body"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Matrix columns ({nSel}/{MAX_MATRIX_COLS})
          </div>
          {nSel >= MAX_MATRIX_COLS && (
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Maximum {MAX_MATRIX_COLS} columns.
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Select<ColOption, true>
              isMulti
              isSearchable
              closeMenuOnSelect={false}
              components={{ Option: CheckboxOption }}
              styles={colSelectStyles}
              placeholder="Type to filter, then select matrix columns…"
              options={colGroupedOptions}
              value={colSelectedOptions}
              onChange={(selected) => {
                const next = (selected ?? [])
                  .map((o) => o.value)
                  .slice(0, MAX_MATRIX_COLS);
                setSelectedCols(next);
              }}
              isOptionDisabled={(o) =>
                !colSelectedOptions.some((s) => s.value === o.value) &&
                colSelectedOptions.length >= MAX_MATRIX_COLS
              }
              formatOptionLabel={(o, { context }) =>
                context === "menu" ? (
                  <span
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      width: "100%",
                    }}
                  >
                    <span>{o.label}</span>
                    <span className="bp4-text-muted" style={{ fontSize: 10 }}>
                      {o.kind === "numeric"
                        ? "numeric/temporal"
                        : "categorical"}
                    </span>
                  </span>
                ) : (
                  <span>{o.label}</span>
                )
              }
            />
          </div>
          {allSelectableCols.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <Button
                small
                minimal
                disabled={
                  nSel >=
                  Math.min(allSelectableCols.length, MAX_MATRIX_COLS)
                }
                onClick={handleSelectAll}
              >
                Select all
              </Button>
              <Button small minimal disabled={nSel === 0} onClick={handleClear}>
                Clear
              </Button>
            </div>
          )}
          {excluded.length > 0 && (
            <div className="bp4-text-muted" style={{ marginTop: 6 }}>
              <Tag intent="warning" minimal>
                Not usable (null / constant / ID)
              </Tag>{" "}
              (excluded): {excluded.map((cid) => viewSchema?.displayName(cid) ?? cid).join(", ")}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Correlation
            </div>
            <HTMLSelect
              value={rank ? "spearman" : "pearson"}
              onChange={(e) => setRank(e.target.value === "spearman")}
            >
              <option value="pearson">Pearson</option>
              <option value="spearman">Spearman</option>
            </HTMLSelect>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div>
              <div className="bp4-text-muted" style={{ fontSize: 11 }}>
                Min non-null occurrences
              </div>
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
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Sample: {useAllRows ? "all" : countLabel(curSample)}
            </div>
            <Slider
              min={500}
              max={20000}
              stepSize={500}
              labelRenderer={false}
              value={sampleSliderVal ?? sampleLimit}
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
            onChange={() => setApplyTableFilters(!applyTableFilters)}
          />
        </div>

        {nSel < 2 ? (
          <p className="bp4-text-muted">
            Select at least 2 columns to build the matrix.
          </p>
        ) : loading ? (
          <Spinner />
        ) : error != null ? (
          <p className="bp4-intent-danger">{error}</p>
        ) : data != null ? (
          <div style={{ overflow: "auto" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `auto repeat(${nSel}, minmax(72px, 1fr))`,
                gap: 2,
                fontSize: 11,
                alignItems: "stretch",
                width: "max-content",
                minWidth: "100%",
              }}
            >
              <div />
              {selectedCols.map((cid) => (
                <div
                  key={`h${cid}`}
                  onContextMenu={(e) => openCtxMenu(e, cid)}
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    fontSize: 11,
                    fontWeight: 600,
                    transform: "rotate(-45deg)",
                    transformOrigin: "bottom left",
                    whiteSpace: "nowrap",
                    color: "#445",
                    cursor: "context-menu",
                    padding: "2px 4px",
                    height: headerH,
                    overflow: "visible",
                  }}
                  title={`${viewSchema?.displayName(cid) ?? cid} (right-click for actions)`}
                >
                  {viewSchema?.displayName(cid) ?? cid}
                </div>
              ))}
              {selectedCols.map((cid, ri) => (
                <React.Fragment key={`r${cid}`}>
                  <div
                    onContextMenu={(e) => openCtxMenu(e, cid)}
                    style={{
                      fontWeight: 600,
                      color: "#445",
                      padding: "2px 6px",
                      whiteSpace: "nowrap",
                      cursor: "context-menu",
                    }}
                    title={`${viewSchema?.displayName(cid) ?? cid} (right-click for actions)`}
                  >
                    {viewSchema?.displayName(cid) ?? cid}
                  </div>
                  {selectedCols.map((cid2, ci) => {
                    const value = cells[ri]?.[ci] ?? null;
                    const minI = Math.min(ri, ci);
                    const maxI = Math.max(ri, ci);
                    const n = countByKey.get(
                      `${minI}\u001f${maxI}`
                    );
                      return (
                        <CorrCell
                          key={`${ri}\u001f${ci}`}
                          value={value}
                          n={n ?? 0}
                        />
                      );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {ctxMenu != null && (
        <div
          style={{
            position: "fixed",
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 30,
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Menu>
            <MenuItem
              icon="trash"
              text={`Remove "${ctxMenu.label}"`}
              onClick={() => {
                removeCol(ctxMenu.cid);
                setCtxMenu(null);
              }}
            />
          </Menu>
        </div>
      )}
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
};

export default CorrelationMatrixDialog;
