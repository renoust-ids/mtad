import * as React from "react";
import * as reltab from "reltab";
import { AppState } from "../AppState";
import { Button } from "@blueprintjs/core";
import { FilterEditorRow } from "./FilterEditorRow";
import { DelayedCalcFooter } from "./DelayedCalcFooter";
import { StateRef } from "oneref";
import { useState } from "react";
import { FilterExp, SubExp } from "reltab";

type RefUpdater = (f: (s: AppState) => AppState) => void;

/**
 * Table filters are populated ONLY by manual input in this form (never by
 * View / analytics interactions).
 */
export const TABLE_FILTER_EDITOR_CLASS = "table-filter-editor";

/**
 * Analytics filters are populated either by manual input in this form or by
 * interaction within analytics views (brushing, bar clicks). The form uses a
 * distinct class so the two editors can be styled and targeted independently.
 */
export const ANALYTICS_FILTER_EDITOR_CLASS = "analytics-filter-editor";

export interface FilterEditorProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  schema: reltab.Schema;
  filterExp: reltab.FilterExp | null;
  onCancel: () => void;
  onApply: (fe: reltab.FilterExp) => void;
  onDone: () => void;
  className: string;
}

const getOpArgs = (filterExp: FilterExp | null): (SubExp | null)[] => {
  if (filterExp === null) return [null];
  let { opArgs } = filterExp;
  if (!opArgs || opArgs.length === 0) {
    return [null];
  }
  return opArgs;
};

export const FilterEditor: React.FunctionComponent<FilterEditorProps> = ({
  appState,
  stateRef,
  schema,
  filterExp,
  onCancel,
  onApply,
  onDone,
  className,
}) => {
  const [op, setOp] = useState(filterExp != null ? filterExp.op : "AND");
  const [opArgs, setOpArgs] = useState(getOpArgs(filterExp));
  const [dirty, setDirty] = useState(false);

  const handleAddRow = () => {
    setOpArgs(opArgs.concat(null));
    setDirty(true);
  };

  const handleDeleteRow = (idx: number) => {
    const nextOpArgs = opArgs.slice();
    delete nextOpArgs[idx]; // delete, not splice, to keep React keys correct
    setOpArgs(nextOpArgs);
    setDirty(true);
  };

  const handleOpChange = (nextOp: reltab.BoolOp) => {
    setOp(nextOp);
    setDirty(true);
  };

  const handleUpdateRow = (idx: number, re: reltab.RelExp | null) => {
    const nextOpArgs = opArgs.slice();
    nextOpArgs[idx] = re;
    setOpArgs(nextOpArgs);
    setDirty(true);
  };

  const handleApply = () => {
    const nnOpArgs: any = opArgs.filter((r) => r != null);
    const fe = new reltab.FilterExp(op, nnOpArgs);
    onApply(fe);
    setDirty(false);
  };

  const handleDone = () => {
    handleApply();
    onDone();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleApply();
  };

  const feRows = opArgs.map((re, idx) => {
    return (
      <FilterEditorRow
        appState={appState}
        stateRef={stateRef}
        key={"fe-row-" + idx}
        schema={schema}
        relExp={re as reltab.BinRelExp | reltab.UnaryRelExp}
        onDeleteRow={() => handleDeleteRow(idx)}
        onUpdate={(re) => handleUpdateRow(idx, re)}
      />
    );
  });

  return (
    <form className={className} onSubmit={handleFormSubmit}>
      <div className="filter-editor-filter-pane">
        <div className="filter-editor-select-row">
          <div className="bp4-select bp4-minimal">
            <select
              onChange={(e) => handleOpChange(e.target.value as reltab.BoolOp)}
            >
              <option value="AND">All Of (AND)</option>
              <option value="OR">Any Of (OR)</option>
            </select>
          </div>
        </div>
        <div className="filter-editor-edit-section">
          <div className="filter-editor-scroll-pane">
            {feRows}
            <div className="filter-editor-row">
              <div className="filter-edit-add-row">
                <Button
                  className="bp4-minimal"
                  icon="add"
                  onClick={(e: any) => handleAddRow()}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      <DelayedCalcFooter
        dirty={dirty}
        onCancel={onCancel}
        onApply={handleApply}
        onDone={handleDone}
      />
    </form>
  );
};

/**
 * Table filter editor form. Table filters can only be populated manually
 * from this form (see actions.setFilter: never written by View interactions).
 */
export const TableFilterEditor: React.FunctionComponent<
  Omit<FilterEditorProps, "className">
> = (props) => (
  <FilterEditor {...props} className={TABLE_FILTER_EDITOR_CLASS} />
);

/**
 * Analytics filter editor form. Analytics filters are either filled manually
 * from this form or by interaction within analytics views (see
 * actions.setAnalyticsClauses).
 */
export const AnalyticsFilterEditor: React.FunctionComponent<
  Omit<FilterEditorProps, "className">
> = (props) => (
  <FilterEditor {...props} className={ANALYTICS_FILTER_EDITOR_CLASS} />
);
