// Analytics "Knowledge Graph" dialog, opened from "Analytics > Knowledge
// Graph". The user picks key columns and property columns; each distinct
// non-null key value becomes a "key" node and each distinct non-null property
// value becomes a "property" node, with a weighted co-occurrence edge between
// a key and a property whenever both are non-null in the same row. The graph
// is rendered force-directed (graphology + sigma). An optional "composite
// key" mode concatenates the (non-null) key values of each row into a single
// multi-column key node. Occurrence / co-occurrence counts drive node sizes
// and edge thickness; node size can alternatively be driven by centrality
// (degree or betweenness). Sampling, min occurrence / min edge weight
// thresholds, and an isolated-nodes toggle refine the graph; the min sliders
// re-filter the already-loaded data without re-querying, so exploration is
// instant (the sample / table-filters options trigger a reload).
import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
  NumericInput,
  Slider,
  Spinner,
  Switch,
  Tag,
} from "@blueprintjs/core";
import { mutableGet, StateRef } from "oneref";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import betweennessCentrality from "graphology-metrics/centrality/betweenness";
import { degreeCentrality } from "graphology-metrics/centrality/degree";
import Sigma from "sigma";
import { AppState } from "../AppState";
import { KnowledgeGraphViewData, loadKnowledgeGraphData } from "../actions";

export interface KnowledgeGraphDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
}

const MAX_KG_COLS = 24;
const DEFAULT_SAMPLE = 20000;

const KEY_NODE_COLOR = "#137cbd";
const PROP_NODE_COLOR = "#d9822b";
const EDGE_COLOR = "rgba(126, 150, 173, 0.55)";
const NODE_SIZE_MIN = 2;
const NODE_SIZE_MAX = 26;
const EDGE_TICK_MIN = 0.5;
const EDGE_TICK_MAX = 4;

interface ColOption {
  value: string;
  label: string;
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

const countLabel = (n: number): string => n.toLocaleString();

// Post-query filtering / graph-page settings. The min thresholds and
// isolated-nodes toggle are applied on the (already loaded) data so they can
// be adjusted without reloading from the backend.
interface KGViewSettings {
  minNodeOccurrence: number;
  minEdgeWeight: number;
  showIsolatedNodes: boolean;
  sizeBy: "occurrence" | "centrality";
  centralityMeasure: "degree" | "betweenness";
}

interface FilteredKGData {
  nodes: reltab.KnowledgeGraphNode[];
  edges: reltab.KnowledgeGraphEdge[];
}

// Filter nodes/edges by the min thresholds and drop nodes left without edges
// unless isolated nodes are shown. Pure, so the dialog can show counts.
const filterKGData = (
  data: KnowledgeGraphViewData,
  settings: KGViewSettings
): FilteredKGData => {
  const nodes = data.data.nodes.filter(
    (n) => n.occurrence >= settings.minNodeOccurrence
  );
  const nodeSet = new Set(nodes.map((n) => n.id));
  const edges = data.data.edges.filter(
    (e) =>
      e.weight >= settings.minEdgeWeight &&
      nodeSet.has(e.source) &&
      nodeSet.has(e.target)
  );
  if (!settings.showIsolatedNodes) {
    const hasEdge = new Set<string>();
    for (const e of edges) {
      hasEdge.add(e.source);
      hasEdge.add(e.target);
    }
    const kept = nodes.filter((n) => hasEdge.has(n.id));
    const keptSet = new Set(kept.map((n) => n.id));
    return {
      nodes: kept,
      edges: edges.filter(
        (e) => keptSet.has(e.source) && keptSet.has(e.target)
      ),
    };
  }
  return { nodes, edges };
};

// Build a normalized size mapper: maps the value range [min..max] to the
// pixel size range. All-equal values map to the mid range.
const makeSizeScale = (values: number[], min: number, max: number) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (hi <= lo) {
    return () => (min + max) / 2;
  }
  return (v: number) => min + ((max - min) * (v - lo)) / (hi - lo);
};

// Build the graphology + sigma-ready graph view from the loaded data:
// filter, assemble the bipartite graph, size nodes by occurrence or
// centrality, scale edge thickness by co-occurrence weight, then run a
// ForceAtlas2 layout (seeded with random positions, which FA2 requires).
const buildGraphView = (
  data: KnowledgeGraphViewData,
  settings: KGViewSettings
): { graph: Graph; nNodes: number; nEdges: number } | null => {
  const filtered = filterKGData(data, settings);
  const graph = new Graph();
  for (const n of filtered.nodes) {
    graph.addNode(n.id, {
      label: n.label,
      group: n.group,
      colId: n.colId,
      occurrence: n.occurrence,
      color: n.group === "key" ? KEY_NODE_COLOR : PROP_NODE_COLOR,
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
    });
  }
  if (graph.order === 0) {
    return null;
  }
  for (const e of filtered.edges) {
    if (!graph.hasEdge(e.source, e.target)) {
      graph.addEdge(e.source, e.target, { weight: e.weight });
    }
  }

  // Centrality attributes (degree always shown in the hover tooltip).
  degreeCentrality.assign(graph, { nodeCentralityAttribute: "degree" });
  if (settings.sizeBy === "centrality" && settings.centralityMeasure === "betweenness") {
    betweennessCentrality.assign(graph, {
      nodeCentralityAttribute: "betweenness",
      getEdgeWeight: "weight",
    });
  }

  // Node size: occurrence count, or the chosen centrality measure.
  const sizeVals = graph.nodes().map((n) =>
    settings.sizeBy === "occurrence"
      ? graph.getNodeAttribute(n, "occurrence")
      : graph.getNodeAttribute(
          n,
          settings.centralityMeasure === "degree" ? "degree" : "betweenness"
        )
  );
  const nodeSize = makeSizeScale(sizeVals, NODE_SIZE_MIN, NODE_SIZE_MAX);
  graph.forEachNode((n) => {
    graph.setNodeAttribute(
      n,
      "size",
      settings.sizeBy === "occurrence"
        ? nodeSize(graph.getNodeAttribute(n, "occurrence"))
        : nodeSize(
            graph.getNodeAttribute(
              n,
              settings.centralityMeasure === "degree" ? "degree" : "betweenness"
            )
          )
    );
  });

  // Edge thickness ∝ co-occurrence weight.
  const edgeVals = graph.edges().map((e) => graph.getEdgeAttribute(e, "weight"));
  const edgeTick = makeSizeScale(edgeVals, EDGE_TICK_MIN, EDGE_TICK_MAX);
  graph.forEachEdge((e) => {
    graph.setEdgeAttribute(e, "size", edgeTick(graph.getEdgeAttribute(e, "weight")));
    graph.setEdgeAttribute(e, "color", EDGE_COLOR);
  });

  // ForceAtlas2 layout (fewer iterations for large graphs to stay snappy).
  const order = graph.order;
  const iterations = order > 5000 ? 200 : order > 2000 ? 400 : 600;
  forceAtlas2.assign(graph, {
    iterations,
    settings: {
      ...forceAtlas2.inferSettings(graph),
      edgeWeightInfluence: 1,
    },
    getEdgeWeight: "weight",
  });

  return { graph, nNodes: graph.order, nEdges: graph.size };
};

interface HoverInfo {
  x: number;
  y: number;
  label: string;
  group: string;
  occurrence: number;
  degree: number;
}

// canvas-mounted sigma renderer: builds the view from the current data +
// settings and owns the renderer lifecycle (killed on change/unmount).
const GraphView: React.FC<{
  data: KnowledgeGraphViewData;
  settings: KGViewSettings;
}> = React.memo(({ data, settings }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [empty, setEmpty] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    // Clear any previous sigma canvases in the container.
    container.innerHTML = "";
    let renderer: Sigma | null = null;
    const built = buildGraphView(data, settings);
    if (built == null) {
      setEmpty("No graph to display: drop the min thresholds or pick other columns.");
      setHover(null);
      return;
    }
    setEmpty(null);
    const { graph } = built;
    renderer = new Sigma(graph, container, {
      renderLabels: false,
      renderEdgeLabels: false,
    });
    const enterNode = (payload: { node: string; event: { x: number; y: number } }) => {
      const n = payload.node;
      setHover({
        x: payload.event?.x ?? 0,
        y: payload.event?.y ?? 0,
        label: (graph.getNodeAttribute(n, "label") as string) ?? n,
        group: (graph.getNodeAttribute(n, "group") as string) ?? "",
        occurrence: (graph.getNodeAttribute(n, "occurrence") as number) ?? 0,
        degree: graph.degree(n),
      });
    };
    const leaveNode = () => setHover(null);
    renderer.on("enterNode", enterNode);
    renderer.on("leaveNode", leaveNode);
    return () => {
      renderer?.off("enterNode", enterNode);
      renderer?.off("leaveNode", leaveNode);
      renderer?.kill();
    };
  }, [data, settings]);

  return (
    <div
      style={{
        position: "relative",
        height: "46vh",
        minHeight: 320,
        border: "1px solid rgba(16, 22, 26, 0.15)",
        borderRadius: 4,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      {empty != null ? (
        <p
          className="bp4-text-muted"
          style={{ padding: 12, fontSize: 12, margin: 0 }}
        >
          {empty}
        </p>
      ) : (
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      )}
      {hover != null && (
        <div
          style={{
            position: "absolute",
            left: hover.x + 10,
            top: hover.y + 10,
            zIndex: 5,
            background: "rgba(17, 20, 24, 0.92)",
            color: "#f6f7f9",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            maxWidth: 340,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontWeight: 600 }}>{hover.label}</div>
          <div className="bp4-text-muted" style={{ fontSize: 10 }}>
            {hover.group === "key" ? "Key" : "Property"}
            {" · "}
            occurrence {countLabel(hover.occurrence)} · degree {hover.degree}
          </div>
        </div>
      )}
    </div>
  );
});

const KnowledgeGraphDialog: React.FunctionComponent<
  KnowledgeGraphDialogProps
> = ({ appState, stateRef, onClose }) => {
  const [keyCols, setKeyCols] = useState<string[]>([]);
  const [propCols, setPropCols] = useState<string[]>([]);
  const [compositeKey, setCompositeKey] = useState(false);
  const [useAllRows, setUseAllRows] = useState(false);
  const [sampleLimit, setSampleLimit] = useState<number>(DEFAULT_SAMPLE);
  const [sampleSliderVal, setSampleSliderVal] = useState<number | null>(null);
  const [applyTableFilters, setApplyTableFilters] = useState(true);
  const [minNodeOccurrence, setMinNodeOccurrence] = useState<number>(1);
  const [minEdgeWeight, setMinEdgeWeight] = useState<number>(1);
  const [sizeBy, setSizeBy] = useState<"occurrence" | "centrality">(
    "occurrence"
  );
  const [centralityMeasure, setCentralityMeasure] = useState<
    "degree" | "betweenness"
  >("degree");
  const [showIsolatedNodes, setShowIsolatedNodes] = useState(false);
  const [data, setData] = useState<KnowledgeGraphViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vs = appState.viewState;
  const pivotActive = vs != null && vs.viewParams.vpivots.length > 0;
  const viewSchema =
    pivotActive && vs?.dataView?.schema != null
      ? vs.dataView.schema
      : vs?.baseSchema ?? null;

  // The query and schema whose rows the graph should describe (mirrors the
  // CorrelationMatrix/SPLOM "Apply Table Filters" behavior).
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

  // Order of the picked columns doesn't change the graph, so sort for a
  // stable reload key.
  const kgKey = useMemo(
    () =>
      `${compositeKey ? "c" : "p"}\u001f${[...keyCols].sort().join("\u001f")}\u001f${[...propCols].sort().join("\u001f")}`,
    [keyCols, propCols, compositeKey]
  );

  const availableCols = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    return viewSchema.columns.filter(
      (cid) => !cid.startsWith("_") && cid !== "Rec"
    );
  }, [viewSchema]);

  const colGroupedOptions = useMemo(() => {
    if (viewSchema == null) {
      return [];
    }
    return [
      {
        label: "Columns",
        options: availableCols.map((cid) => ({
          value: cid,
          label: viewSchema.displayName(cid),
        })),
      },
    ] as GroupBase<ColOption>[];
  }, [availableCols, viewSchema]);

  const keySelectedOptions: ColOption[] = useMemo(() => {
    const flat = colGroupedOptions.flatMap((g) => g.options);
    const byValue = new Map(flat.map((o) => [o.value, o]));
    return keyCols
      .map((cid) => byValue.get(cid))
      .filter((o): o is ColOption => o != null);
  }, [colGroupedOptions, keyCols]);

  const propSelectedOptions: ColOption[] = useMemo(() => {
    const flat = colGroupedOptions.flatMap((g) => g.options);
    const byValue = new Map(flat.map((o) => [o.value, o]));
    return propCols
      .map((cid) => byValue.get(cid))
      .filter((o): o is ColOption => o != null);
  }, [colGroupedOptions, propCols]);

  const curSample = sampleLimit;

  useEffect(() => {
    if (keyCols.length < 1 || propCols.length < 1) {
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
    loadKnowledgeGraphData(v.dbc, query, schema, keyCols, propCols, {
      keyMode: compositeKey ? "composite" : "per-column",
      sampleLimit: useAllRows ? 0 : curSample,
    })
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(`Error loading knowledge graph: ${String(err)}`);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kgKey,
    useAllRows,
    curSample,
    applyTableFilters,
    tableFilterKey,
    stateRef,
  ]);

  const isOpen = vs != null && appState.knowledgeGraphDialogOpen;
  const nKey = keyCols.length;
  const nProp = propCols.length;
  const canBuild = nKey > 0 && nProp > 0;

  // Filtered node/edge counts for the summary line (cheap, no layout).
  const counts = useMemo(() => {
    if (data == null) {
      return null;
    }
    const f = filterKGData(data, {
      minNodeOccurrence,
      minEdgeWeight,
      showIsolatedNodes,
      sizeBy,
      centralityMeasure,
    });
    return { nNodes: f.nodes.length, nEdges: f.edges.length };
  }, [
    data,
    minNodeOccurrence,
    minEdgeWeight,
    showIsolatedNodes,
    sizeBy,
    centralityMeasure,
  ]);

  const viewSettings: KGViewSettings = useMemo(
    () => ({
      minNodeOccurrence,
      minEdgeWeight,
      showIsolatedNodes,
      sizeBy,
      centralityMeasure,
    }),
    [minNodeOccurrence, minEdgeWeight, showIsolatedNodes, sizeBy, centralityMeasure]
  );

  const handleSelectAllKeys = () => {
    setKeyCols(availableCols.slice(0, MAX_KG_COLS));
  };
  const handleClearKeys = () => {
    setKeyCols([]);
  };
  const handleSelectAllProps = () => {
    setPropCols(availableCols.slice(0, MAX_KG_COLS));
  };
  const handleClearProps = () => {
    setPropCols([]);
  };

  const mkSelect = (
    value: ColOption[],
    onChange: (next: string[]) => void,
    placeholder: string,
    onSelectAll: () => void,
    onClear: () => void,
    nSel: number
  ) => (
    <>
      <Select<ColOption, true>
        isMulti
        isSearchable
        closeMenuOnSelect={false}
        components={{ Option: CheckboxOption }}
        styles={colSelectStyles}
        placeholder={placeholder}
        options={colGroupedOptions}
        value={value}
        onChange={(selected) => {
          const next = (selected ?? [])
            .map((o) => o.value)
            .slice(0, MAX_KG_COLS);
          onChange(next);
        }}
        isOptionDisabled={(o) =>
          !value.some((s) => s.value === o.value) &&
          value.length >= MAX_KG_COLS
        }
      />
      {availableCols.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <Button
            small
            minimal
            disabled={nSel >= Math.min(availableCols.length, MAX_KG_COLS)}
            onClick={onSelectAll}
          >
            Select all
          </Button>
          <Button small minimal disabled={nSel === 0} onClick={onClear}>
            Clear
          </Button>
        </div>
      )}
    </>
  );

  const statsLine = counts != null
    ? `${countLabel(counts.nNodes)} nodes · ${countLabel(counts.nEdges)} edges${
        useAllRows ? "" : ` (sample of ${countLabel(curSample)})`
      } · ${countLabel(data?.data.totalRows ?? 0)} total rows`
    : "";

  return (
    <Dialog
      isOpen={isOpen}
      title="Knowledge Graph"
      onClose={onClose}
      canOutsideClickClose={false}
      style={{
        resize: "both",
        overflow: "auto",
        minWidth: 760,
        minHeight: 540,
        maxWidth: "95vw",
        maxHeight: "95vh",
      }}
    >
      <div
        className="bp4-dialog-body"
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>Key columns ({nKey}/{MAX_KG_COLS})</span>
            <Switch
              label="Composite key"
              checked={compositeKey}
              onChange={() => setCompositeKey(!compositeKey)}
            />
          </div>
          {mkSelect(
            keySelectedOptions,
            setKeyCols,
            "Type to filter, then select key columns…",
            handleSelectAllKeys,
            handleClearKeys,
            nKey
          )}
        </div>

        <div>
          <div
            style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
          >
            Property columns ({nProp}/{MAX_KG_COLS})
          </div>
          {mkSelect(
            propSelectedOptions,
            setPropCols,
            "Type to filter, then select property columns…",
            handleSelectAllProps,
            handleClearProps,
            nProp
          )}
        </div>

        <div
          style={{
            display: "flex",
            gap: 20,
            alignItems: "flex-end",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div>
              <div className="bp4-text-muted" style={{ fontSize: 11 }}>
                Min node occurrence
              </div>
              <Slider
                min={1}
                max={100}
                stepSize={1}
                labelRenderer={false}
                value={minNodeOccurrence}
                onChange={(v: number) => setMinNodeOccurrence(v)}
              />
            </div>
            <NumericInput
              min={1}
              max={1000000}
              value={minNodeOccurrence}
              onValueChange={(v) => setMinNodeOccurrence(v)}
              style={{ width: 64 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div>
              <div className="bp4-text-muted" style={{ fontSize: 11 }}>
                Min edge co-occurrence
              </div>
              <Slider
                min={1}
                max={100}
                stepSize={1}
                labelRenderer={false}
                value={minEdgeWeight}
                onChange={(v: number) => setMinEdgeWeight(v)}
              />
            </div>
            <NumericInput
              min={1}
              max={1000000}
              value={minEdgeWeight}
              onValueChange={(v) => setMinEdgeWeight(v)}
              style={{ width: 64 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          </div>
          <div>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              Size
            </div>
            <HTMLSelect
              value={sizeBy}
              onChange={(e) =>
                setSizeBy(e.target.value === "centrality" ? "centrality" : "occurrence")
              }
            >
              <option value="occurrence">Occurrence</option>
              <option value="centrality">Centrality</option>
            </HTMLSelect>
          </div>
          {sizeBy === "centrality" && (
            <div>
              <div className="bp4-text-muted" style={{ fontSize: 11 }}>
                Centrality
              </div>
              <HTMLSelect
                value={centralityMeasure}
                onChange={(e) =>
                  setCentralityMeasure(
                    e.target.value === "betweenness" ? "betweenness" : "degree"
                  )
                }
              >
                <option value="degree">Degree</option>
                <option value="betweenness">Betweenness</option>
              </HTMLSelect>
            </div>
          )}
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
          <Switch
            label="Show isolated nodes"
            checked={showIsolatedNodes}
            onChange={() => setShowIsolatedNodes(!showIsolatedNodes)}
          />
        </div>

        {!canBuild ? (
          <p className="bp4-text-muted">
            Select at least one key column and one property column to build the
            graph.
          </p>
        ) : loading ? (
          <Spinner />
        ) : error != null ? (
          <p className="bp4-intent-danger">{error}</p>
        ) : data != null ? (
          <>
            <div className="bp4-text-muted" style={{ fontSize: 11 }}>
              {statsLine}
            </div>
            <GraphView data={data} settings={viewSettings} />
          </>
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

export default KnowledgeGraphDialog;