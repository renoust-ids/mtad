import * as React from "react";
import { useState, useEffect } from "react";
import {
  Button,
  Dialog,
  Classes,
  FormGroup,
  InputGroup,
  HTMLSelect,
  Spinner,
  Icon,
  Tag,
} from "@blueprintjs/core";
import { ConcatCsvDialogState, ConcatCsvMapping } from "../AppState";
import * as actions from "../actions";
import { StateRef } from "oneref";
import { AppState } from "../AppState";
import { widenType } from "../utils/concatColumnMatcher";

export interface ConcatCsvDialogProps {
  appState: ConcatCsvDialogState;
  stateRef: StateRef<AppState>;
  onSelectCsvFile: () => Promise<string | null>;
  onGetCsvHeaders: (
    path: string,
    sheet?: string
  ) => Promise<{
    columns: string[];
    types: Record<string, string>;
    sheets?: string[];
  }>;
  onConcatConfirmed: (concatArgs: {
    csvPath: string;
    sheet: string;
    rightColumns: { [colId: string]: string };
    mappings: ConcatCsvMapping[];
  }) => void;
}

const columnOptions = (
  cols: { [colId: string]: string },
  exclude?: Set<string>,
  includeEmpty = true
) => {
  const opts: { label: string; value: string }[] = [];
  if (includeEmpty) opts.push({ label: "-- none --", value: "" });
  for (const [cid, type] of Object.entries(cols)) {
    if (exclude && exclude.has(cid)) continue;
    opts.push({ label: `${cid} (${type})`, value: cid });
  }
  return opts;
};

export const ConcatCsvDialog: React.FunctionComponent<ConcatCsvDialogProps> = ({
  appState,
  stateRef,
  onSelectCsvFile,
  onGetCsvHeaders,
  onConcatConfirmed,
}: ConcatCsvDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    open,
    csvPath,
    originalColumns,
    newColumns,
    sheets,
    sheet,
    mappings,
  } = appState;

  const doSelectFile = async () => {
    setLoading(true);
    setError(null);
    try {
      const selectedPath = await onSelectCsvFile();
      if (selectedPath) {
        const headers = await onGetCsvHeaders(selectedPath);
        const newCols: { [colId: string]: string } = {};
        for (const cid of headers.columns) {
          newCols[cid] = headers.types[cid] ?? "VARCHAR";
        }
        actions.setConcatCsvPath(
          selectedPath,
          newCols,
          stateRef,
          headers.sheets
        );
      } else {
        actions.closeConcatCsvDialog(stateRef);
      }
    } catch (err) {
      setError(`Failed to read file: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const doSelectSheet = async (newSheet: string) => {
    if (!csvPath) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await onGetCsvHeaders(csvPath, newSheet);
      const newCols: { [colId: string]: string } = {};
      for (const cid of headers.columns) {
        newCols[cid] = headers.types[cid] ?? "VARCHAR";
      }
      actions.setConcatCsvSheet(newSheet, stateRef);
      actions.setConcatCsvPath(csvPath, newCols, stateRef);
    } catch (err) {
      setError(`Failed to read sheet headers: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !csvPath) {
      doSelectFile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    actions.closeConcatCsvDialog(stateRef);
  };

  const handleConfirm = () => {
    if (!csvPath || mappings.length === 0) return;
    onConcatConfirmed({
      csvPath,
      sheet,
      rightColumns: newColumns,
      mappings,
    });
    actions.closeConcatCsvDialog(stateRef);
  };

  const updateMapping = (index: number, patch: Partial<ConcatCsvMapping>) => {
    const m = mappings[index];
    let next: ConcatCsvMapping = { ...m, ...patch };
    // Recompute matched/result-type when either column changes
    if (patch.originalCol !== undefined || patch.newCol !== undefined) {
      const orig = next.originalCol || "";
      const nw = next.newCol || "";
      next.matched = Boolean(orig && nw);
      next.originalType = orig ? originalColumns[orig] ?? "" : "";
      next.newType = nw ? newColumns[nw] ?? "" : "";
      next.castType =
        orig && nw ? widenType(next.originalType, next.newType) : null;
    }
    actions.updateConcatCsvMapping(index, next, stateRef);
  };

  const addMapping = () => {
    actions.addConcatCsvMapping(stateRef);
  };

  const removeMapping = (index: number) => {
    actions.removeConcatCsvMapping(index, stateRef);
  };

  const canConfirm = csvPath && mappings.length > 0 && !loading;

  // Get all new-only columns being added
  const newColsAdded = mappings.filter((m) => !m.originalCol && m.newCol);

  const shortCsvPath = csvPath
    ? csvPath.split(/[/\\]/).pop() ?? csvPath
    : null;

  return (
    <Dialog
      title="Concatenate File"
      onClose={handleClose}
      isOpen={open}
      canOutsideClickClose={false}
      style={{ width: 640 }}
    >
      <div className={Classes.DIALOG_BODY}>
        {loading && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <Spinner size={24} />
          </div>
        )}

        {error && (
          <p style={{ marginBottom: 8, color: "#cf4f39" }}>{error}</p>
        )}

        {!loading && (
          <>
            <FormGroup
              label="File"
              labelFor="concat-csv-path"
              style={{ marginBottom: 12 }}
            >
              <InputGroup
                id="concat-csv-path"
                value={shortCsvPath ?? ""}
                readOnly
                rightElement={
                  <Button
                    icon="folder-open"
                    minimal
                    onClick={doSelectFile}
                  />
                }
              />
            </FormGroup>

            {csvPath && sheets.length > 1 && (
              <FormGroup
                label="Sheet"
                labelFor="concat-sheet-select"
                style={{ marginBottom: 12 }}
              >
                <HTMLSelect
                  id="concat-sheet-select"
                  value={sheet}
                  onChange={(e) => doSelectSheet(e.target.value)}
                  options={sheets.map((s) => ({ label: s, value: s }))}
                />
              </FormGroup>
            )}

            {csvPath && mappings.length > 0 && (
              <>
                <div
                  style={{
                    fontWeight: 600,
                    marginBottom: 8,
                    fontSize: 13,
                  }}
                >
                  Column Mapping
                </div>

                {mappings.map((m, idx) => {
                  const usedOrig = new Set(
                    mappings.map((mm) => mm.originalCol).filter(Boolean)
                  );
                  const usedNew = new Set(
                    mappings.map((mm) => mm.newCol).filter(Boolean)
                  );
                  // allow the current row's own values
                  if (m.originalCol) usedOrig.delete(m.originalCol);
                  if (m.newCol) usedNew.delete(m.newCol);

                  return (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <HTMLSelect
                          fill
                          value={m.originalCol}
                          onChange={(e) =>
                            updateMapping(idx, {
                              originalCol: e.target.value,
                            })
                          }
                          options={columnOptions(
                            originalColumns,
                            usedOrig
                          )}
                        />
                      </div>
                      <Icon icon="arrow-right" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <HTMLSelect
                          fill
                          value={m.newCol}
                          onChange={(e) =>
                            updateMapping(idx, { newCol: e.target.value })
                          }
                          options={columnOptions(
                            newColumns,
                            usedNew
                          )}
                        />
                      </div>
                      {m.matched && (
                        <Tag
                          minimal
                          intent={
                            m.castType && m.castType !== m.originalType
                              ? "warning"
                              : "none"
                          }
                          style={{ flexShrink: 0 }}
                        >
                          {m.castType && m.castType !== m.originalType
                            ? `→ ${m.castType}`
                            : m.originalType}
                        </Tag>
                      )}
                      <Button
                        icon="cross"
                        minimal
                        small
                        onClick={() => removeMapping(idx)}
                      />
                    </div>
                  );
                })}

                <Button
                  icon="plus"
                  minimal
                  small
                  onClick={addMapping}
                  style={{ marginBottom: 12 }}
                >
                  Add Mapping
                </Button>

                {/* New columns that will be added */}
                {newColsAdded.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        marginBottom: 6,
                        fontSize: 13,
                      }}
                    >
                      New Columns Added
                    </div>
                    {newColsAdded.map((m, i) => (
                      <Tag
                        key={i}
                        intent="success"
                        style={{ marginRight: 6, marginBottom: 4 }}
                      >
                        {m.newCol} ({m.newType})
                      </Tag>
                    ))}
                  </div>
                )}

                {/* Per-column null values */}
                <div style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: 6,
                      fontSize: 13,
                    }}
                  >
                    Null Values
                  </div>
                  {mappings.map((m, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          flex: 1,
                          fontSize: 13,
                          color: "#5c7080",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.originalCol || m.newCol}
                      </div>
                      <div style={{ flex: 1 }}>
                        <InputGroup
                          placeholder="null string (e.g. N/A)"
                          value={m.nullString}
                          onChange={(e) =>
                            updateMapping(idx, {
                              nullString: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={handleClose}>Cancel</Button>
          <Button
            intent="primary"
            disabled={!canConfirm}
            onClick={handleConfirm}
          >
            Concatenate
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
