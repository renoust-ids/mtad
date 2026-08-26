import * as Immutable from "immutable";
import { ViewParams } from "./ViewParams";
import { QueryView } from "./QueryView";
import { PagedDataView } from "./PagedDataView";
import { Timer } from "./Timer";
import * as reltab from "reltab";
import { ColumnKind, DataSourcePath } from "reltab";

export interface CellEditState {
  readonly row: number;
  readonly col: number;
  readonly columnId: string;
  readonly value: any;
  readonly rawValue: any;
  readonly columnKind: ColumnKind;
  readonly sqlTypeName?: string;
  readonly isAggregateRow: boolean;
  readonly rowData: { [columnId: string]: any };
}

/**
 * Immutable representation of all state associated
 * with a single view.
 *
 * Consists of user-editable ViewParams plus any associated
 * query / network / render state
 */
export interface ViewStateProps {
  dbc: reltab.DataSourceConnection | null;
  dsPath: DataSourcePath | null;
  baseQuery: reltab.QueryExp | null;
  baseSchema: reltab.Schema | null; // always in sync with baseQuery

  viewParams: ViewParams;
  initialViewParams: ViewParams; // for dirty detection
  loadingTimer: Timer;
  viewportTop: number;
  viewportBottom: number;
  queryView: QueryView | undefined | null;
  dataView: PagedDataView | undefined | null;

  delayedCalcMode: boolean; // If true, don't recalc from view params until user hits "apply"
  editingCell: CellEditState | null;
}

const defaultViewStateProps: ViewStateProps = {
  dbc: null,
  dsPath: null,
  baseQuery: null,
  baseSchema: null,
  viewParams: new ViewParams(),
  initialViewParams: new ViewParams(),
  loadingTimer: new Timer(),
  viewportTop: 0,
  viewportBottom: 0,
  queryView: null,
  dataView: null,
  delayedCalcMode: true,
  editingCell: null,
};

export class ViewState
  extends Immutable.Record(defaultViewStateProps)
  implements ViewStateProps
{
  public readonly dbc!: reltab.DataSourceConnection;
  public readonly dsPath!: DataSourcePath;
  public readonly baseQuery!: reltab.QueryExp;
  public readonly baseSchema!: reltab.Schema; // always in sync with baseQuery
  public readonly viewParams!: ViewParams;
  public readonly initialViewParams!: ViewParams;
  public readonly loadingTimer!: Timer;
  public readonly viewportTop!: number;
  public readonly viewportBottom!: number;
  public readonly queryView!: QueryView | undefined | null;
  public readonly dataView!: PagedDataView | undefined | null;
  public readonly delayedCalcMode!: boolean;
  public readonly editingCell!: CellEditState | null;
}
