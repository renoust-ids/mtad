import * as React from "react";
import * as reltab from "reltab";
import * as actions from "../actions";
import { FilterEditor } from "./FilterEditor";
import { AppState } from "../AppState";
import { ViewState } from "../ViewState";
import { StateRef } from "oneref";
import { useState } from "react";
import { getDefaultDialect } from "reltab";

export interface FooterProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onFilter?: (filterExp: reltab.FilterExp) => void;
  rightFooterSlot?: JSX.Element;
}

type FilterTab = "table" | "analytics";

// The summary is cropped once it exceeds MAX_FILTER_STR_CHARS characters.
// When a "T:"/"A:" prefix is shown the maximum is reduced by this many
// characters before cropping, so the prefixed text occupies the same width.
const MAX_FILTER_STR_CHARS = 60;
const MAX_FILTER_STR_PREFIX_PAD = 4;

const cropFilterStr = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;

export const Footer: React.FunctionComponent<FooterProps> = (
  props: FooterProps
) => {
  const { appState, stateRef, rightFooterSlot = undefined, onFilter } = props;
  const [tab, setTab] = useState<FilterTab>("table");
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [hoverTab, setHoverTab] = useState<FilterTab | null>(null);
  const [prevTable, setPrevTable] = useState<reltab.FilterExp | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<reltab.FilterExp | null>(
    null
  );

  // console.log("Footer: ", appState.toJS());

  const viewState = appState.viewState;
  const viewParams = viewState.viewParams;
  const tableFE = viewParams.filterExp;
  const analyticsFE = viewParams.analyticsFilterExp;

  const handleTabClick = (nextTab: FilterTab) => {
    if (!expanded || tab !== nextTab) {
      // expanding (or switching) the editor for nextTab; snap its current
      // filter into the "previous" slot for cancel, unless we're mid-edit:
      if (!dirty) {
        if (nextTab === "table") {
          setPrevTable(tableFE);
        } else {
          setPrevAnalytics(analyticsFE);
        }
      }
      setTab(nextTab);
      setExpanded(true);
      setDirty(true);
    } else {
      // clicking the active tab collapses the editor:
      setExpanded(false);
    }
  };

  const handleCancel = () => {
    // restore previous filter for the active tab:
    const fe =
      tab === "table"
        ? prevTable || new reltab.FilterExp()
        : prevAnalytics || new reltab.FilterExp();
    if (tab === "table") {
      actions.setFilter(fe, stateRef);
    } else {
      actions.setAnalyticsFilter(fe, stateRef);
    }
    setExpanded(false);
    setDirty(false);
    setPrevTable(null);
    setPrevAnalytics(null);
  };

  const handleApply = (filterExp: reltab.FilterExp) => {
    if (tab === "table") {
      actions.setFilter(filterExp, stateRef);
      onFilter?.(filterExp);
    } else {
      actions.setAnalyticsFilter(filterExp, stateRef);
    }
  };

  const handleDone = () => {
    setExpanded(false);
    setDirty(false);
    setPrevTable(null);
    setPrevAnalytics(null);
  };

  const handleApplyAnalyticsChange = (event: any) => {
    actions.setApplyAnalyticsFilters(event.target.checked, stateRef);
  };

  const activeFE = tab === "table" ? tableFE : analyticsFE;
  // Show the active tab's filter string while modifying a filter (editor
  // open), prefixing it with "T:" (table) or "A:" (analytics). Hovering a tab
  // overrides with that tab's prefixed string. When a prefix is shown the
  // string is cropped at MAX_FILTER_STR_CHARS minus MAX_FILTER_STR_PREFIX_PAD.
  const hoveredFE =
    hoverTab != null
      ? hoverTab === "table"
        ? tableFE
        : analyticsFE
      : null;
  const summaryFE = hoveredFE != null ? hoveredFE : activeFE;
  const showPrefix = hoverTab != null || expanded;
  const prefixForTable = (hoverTab != null ? hoverTab : tab) === "table";
  const prefix = showPrefix ? (prefixForTable ? "T: " : "A: ") : "";
  const maxLen = showPrefix
    ? MAX_FILTER_STR_CHARS - MAX_FILTER_STR_PREFIX_PAD
    : MAX_FILTER_STR_CHARS;
  const filterStr =
    prefix + cropFilterStr(summaryFE.toSqlWhere(getDefaultDialect()), maxLen);

  const expandClass = expanded ? "footer-expanded" : "footer-collapsed";

  const editorComponent = expanded ? (
    <>
      {tab === "analytics" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
          }}
        >
          <input
            type="checkbox"
            id="apply-analytics-filters"
            checked={viewParams.applyAnalyticsFilters}
            onChange={handleApplyAnalyticsChange}
          />
          <label htmlFor="apply-analytics-filters" style={{ marginBottom: 0 }}>
            Apply Analytics Filters
          </label>
        </div>
      )}
      <FilterEditor
        appState={appState}
        stateRef={stateRef}
        schema={viewState.baseSchema}
        filterExp={activeFE}
        onCancel={handleCancel}
        onApply={handleApply}
        onDone={handleDone}
      />
    </>
  ) : null;

  let rowCountBlock = null;
  const queryView = appState.viewState.queryView;
  if (queryView) {
    const numFmt = (num: number) =>
      num.toLocaleString(undefined, { useGrouping: true });

    const { rowCount, baseRowCount, filterRowCount } = queryView;
    const rowCountStr = numFmt(rowCount);
    const rcParts = [rowCountStr];
    if (rowCount !== baseRowCount) {
      rcParts.push(" (");
      if (filterRowCount !== baseRowCount && filterRowCount !== rowCount) {
        const filterCountStr = numFmt(filterRowCount);
        rcParts.push(filterCountStr);
        rcParts.push(" Filtered, ");
      }
      rcParts.push(numFmt(baseRowCount));
      rcParts.push(" Total)");
    }
    const rcStr = rcParts.join("");
    rowCountBlock = (
      <div className="footer-block">
        <span className="footer-value">
          {rcStr} Row{rowCount === 1 ? "" : "s"}
        </span>
      </div>
    );
  }
  return (
    <div className={"footer " + expandClass}>
      <div className="footer-top-row">
        <div className="footer-filter-block">
          <a
            onClick={(event) => {
              event.preventDefault();
              handleTabClick("table");
            }}
            onMouseEnter={() => setHoverTab("table")}
            onMouseLeave={() => setHoverTab(null)}
            tabIndex={0}
            style={{
              marginRight: 10,
              fontWeight:
                tab === "table" && expanded ? 600 : "normal",
            }}
          >
            Table Filters
          </a>
          <a
            onClick={(event) => {
              event.preventDefault();
              handleTabClick("analytics");
            }}
            onMouseEnter={() => setHoverTab("analytics")}
            onMouseLeave={() => setHoverTab(null)}
            tabIndex={0}
            style={{
              marginRight: 10,
              fontWeight:
                tab === "analytics" && expanded ? 600 : "normal",
            }}
          >
            Analytics Filters
          </a>
          <span className="filter-summary"> {filterStr}</span>
        </div>
        <div className="footer-right-block">
          {rowCountBlock}
          {rightFooterSlot}
        </div>
      </div>
      {editorComponent}
    </div>
  );
};