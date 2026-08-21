import * as React from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Button,
  Dialog,
  Classes,
  FormGroup,
  InputGroup,
  HTMLSelect,
  Checkbox,
  Spinner,
} from "@blueprintjs/core";
import { JoinCsvDialogState, CsvJoinType } from "../AppState";
import * as actions from "../actions";
import { StateRef } from "oneref";
import { AppState } from "../AppState";

const JOIN_TYPE_OPTIONS = [
  { label: "Inner Join", value: "inner" },
  { label: "Left Join", value: "left" },
  { label: "Right Join", value: "right" },
  { label: "Full Outer Join", value: "outer" },
];

export interface JoinCsvDialogProps {
  appState: JoinCsvDialogState;
  stateRef: StateRef<AppState>;
  onSelectCsvFile: () => Promise<string | null>;
  onGetCsvHeaders: (
    csvPath: string
  ) => Promise<{ columns: string[]; types: Record<string, string> }>;
  onJoinConfirmed: (joinArgs: {
    csvPath: string;
    joinType: CsvJoinType;
    leftCol: string;
    rightCol: string;
    forceStringCast: boolean;
    nullString: string;
  }) => void;
}

export const JoinCsvDialog: React.FunctionComponent<JoinCsvDialogProps> = ({
  appState,
  stateRef,
  onSelectCsvFile,
  onGetCsvHeaders,
  onJoinConfirmed,
}: JoinCsvDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leftColRef = useRef<HTMLSelectElement | null>(null);

  const {
    open,
    csvPath,
    leftColumns,
    rightColumns,
    leftCol,
    rightCol,
    joinType,
    forceStringCast,
    nullString,
  } = appState;

  const doSelectFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const selectedPath = await onSelectCsvFile();
      if (selectedPath) {
        const headers = await onGetCsvHeaders(selectedPath);
        actions.setJoinCsvPath(selectedPath, headers.columns, stateRef);
      } else {
        actions.closeJoinCsvDialog(stateRef);
      }
    } catch (err) {
      setError(`Failed to read CSV: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [onSelectCsvFile, onGetCsvHeaders, stateRef]);

  useEffect(() => {
    if (open && !csvPath) {
      doSelectFile();
    }
  }, [open]);

  useEffect(() => {
    if (open && rightColumns.length > 0 && leftCol && rightCol) {
      setTimeout(() => leftColRef.current?.focus(), 0);
    }
  }, [open, rightColumns.length, leftCol, rightCol]);

  const handleConfirm = () => {
    if (!csvPath || !leftCol || !rightCol) {
      return;
    }
    onJoinConfirmed({
      csvPath,
      joinType,
      leftCol,
      rightCol,
      forceStringCast,
      nullString,
    });
    actions.closeJoinCsvDialog(stateRef);
  };

  const handleClose = () => {
    actions.closeJoinCsvDialog(stateRef);
  };

  const canConfirm = csvPath && leftCol && rightCol && !loading;

  const leftColOptions = [{ label: "-- select column --", value: "" }, ...leftColumns.map((c) => ({ label: c, value: c }))];
  const rightColOptions = [{ label: "-- select column --", value: "" }, ...rightColumns.map((c) => ({ label: c, value: c }))];

  const shortCsvPath = csvPath
    ? csvPath.split(/[/\\]/).pop() ?? csvPath
    : null;

  return (
    <Dialog
      title="Join CSV"
      onClose={handleClose}
      isOpen={open}
      canOutsideClickClose={false}
    >
      <div className={Classes.DIALOG_BODY}>
        {loading && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <Spinner size={24} />
          </div>
        )}

        {error && (
          <p style={{ marginBottom: 8, color: "#cf4f39" }}>
            {error}
          </p>
        )}

        {!loading && (
          <>
            <FormGroup
              label="CSV File"
              labelFor="csv-file-path"
              style={{ marginBottom: 12 }}
            >
              <InputGroup
                id="csv-file-path"
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

            {csvPath && rightColumns.length > 0 && (
              <>
                <FormGroup
                  label="Join Type"
                  labelFor="join-type-select"
                  style={{ marginBottom: 12 }}
                >
                  <HTMLSelect
                    id="join-type-select"
                    value={joinType}
                    onChange={(e) =>
                      actions.setJoinCsvType(
                        e.target.value as CsvJoinType,
                        stateRef
                      )
                    }
                    options={JOIN_TYPE_OPTIONS}
                  />
                </FormGroup>

                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    marginBottom: 12,
                  }}
                >
                  <FormGroup
                    label="Left Column (Current View)"
                    labelFor="left-col-select"
                    style={{ flex: 1 }}
                  >
                    <HTMLSelect
                      id="left-col-select"
                      elementRef={leftColRef}
                      value={leftCol}
                      onChange={(e) =>
                        actions.setJoinCsvLeftCol(e.target.value, stateRef)
                      }
                      options={leftColOptions}
                    />
                  </FormGroup>

                  <FormGroup
                    label="Right Column (CSV)"
                    labelFor="right-col-select"
                    style={{ flex: 1 }}
                  >
                    <HTMLSelect
                      id="right-col-select"
                      value={rightCol}
                      onChange={(e) =>
                        actions.setJoinCsvRightCol(e.target.value, stateRef)
                      }
                      options={rightColOptions}
                    />
                  </FormGroup>
                </div>

                <FormGroup
                  label="Null String (optional)"
                  labelFor="null-string-input"
                  style={{ marginBottom: 12 }}
                >
                  <InputGroup
                    id="null-string-input"
                    value={nullString}
                    placeholder="e.g. NA, NULL, N/A"
                    onChange={(e) =>
                      actions.setJoinCsvNullString(e.target.value, stateRef)
                    }
                  />
                </FormGroup>

                <Checkbox
                  checked={forceStringCast}
                  label="Force string cast for join columns (recommended)"
                  onChange={(e) =>
                    actions.setJoinCsvForceStringCast(
                      (e.target as HTMLInputElement).checked,
                      stateRef
                    )
                  }
                />
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
            Join
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
