import { AggFn, numericAggFns, basicAggFns } from "./AggFn";

// Classification of column types:
export type ColumnKind =
  | "string"
  | "integer"
  | "real"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "timestamp"
  | "blob"
  | "dialect"; // unknown; specific to db engine SQL dialect

export const defaultAggForKind = (kind: ColumnKind): AggFn => {
  switch (kind) {
    case "string":
    case "boolean":
    case "date":
    case "time":
    case "timestamp":
      return "uniq";
    case "integer":
    case "real":
      return "sum";
    default:
      return "null";
  }
};

const kindIsNumeric = (kind: ColumnKind): boolean => {
  switch (kind) {
    case "integer":
    case "real":
      return true;
    default:
      return false;
  }
};

export type StringRenderFn = (val: any) => string;

type ColumnTypeOpts = {
  defaultAggFn?: AggFn;
  stringRender?: StringRenderFn;
};

const defaultValRender: StringRenderFn = (val: any) => {
  if (val == null) {
    return "";
  }
  if (typeof val === "string") {
    return val;
  }
  if (typeof val === "bigint") {
    return val.toString();
  }
  try {
    return String(val);
  } catch (err) {
    console.error("error stringifying value: ", val);
    return "";
  }
};

export class ColumnType {
  readonly sqlTypeName: string;
  readonly kind: ColumnKind;
  readonly defaultAggFn: AggFn;
  readonly stringRender: StringRenderFn;

  constructor(
    sqlTypeName: string,
    kind: ColumnKind,
    opts: ColumnTypeOpts = {}
  ) {
    this.sqlTypeName = sqlTypeName;
    this.kind = kind;
    this.defaultAggFn =
      opts.defaultAggFn === undefined
        ? defaultAggForKind(kind)
        : opts.defaultAggFn;
    this.stringRender =
      opts.stringRender === undefined ? defaultValRender : opts.stringRender;
  }
}

export interface CoreColumnTypes {
  integer: ColumnType;
  real: ColumnType;
  string: ColumnType;
  boolean: ColumnType;
}

export const colIsNumeric = (ct: ColumnType) => kindIsNumeric(ct.kind);
export const colIsString = (ct: ColumnType) => ct.kind === "string";

// Temporal (time / date / timestamp) column kinds. These can be histogrammed
// as numbers by first converting the values to epoch seconds via an "epoch"
// value expression (see defs.epoch).
export const temporalKinds: ReadonlySet<ColumnKind> = new Set([
  "date",
  "time",
  "datetime",
  "timestamp",
]);

export const isTemporalKind = (kind: ColumnKind): boolean =>
  temporalKinds.has(kind);

export const isTemporal = (ct: ColumnType): boolean =>
  isTemporalKind(ct.kind);

export const aggFns = (ct: ColumnType): AggFn[] => {
  if (colIsNumeric(ct)) {
    return numericAggFns;
  }
  return basicAggFns;
};

export type ColumnTypeMap = { [sqlTypeName: string]: ColumnType };
