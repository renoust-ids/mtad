import React, { useState, useEffect } from "react";
import { Dialog, Button, Intent } from "@blueprintjs/core";
import { ColumnKind } from "reltab";
import { validateCellValue } from "../CellEditValidation";

interface CellEditModalProps {
  isOpen: boolean;
  columnId: string;
  columnDisplayName: string;
  currentValue: any;
  columnKind: ColumnKind;
  sqlTypeName?: string;
  isAggregateRow: boolean;
  isPivot: boolean;
  onSave: (newValue: string) => void | Promise<void>;
  onCancel: () => void;
}

export const CellEditModal: React.FC<CellEditModalProps> = ({
  isOpen,
  columnId,
  columnDisplayName,
  currentValue,
  columnKind,
  sqlTypeName,
  isAggregateRow,
  isPivot,
  onSave,
  onCancel,
}) => {
  const [editValue, setEditValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditValue(currentValue != null ? String(currentValue) : "");
      setError(null);
    }
  }, [isOpen, currentValue]);

  useEffect(() => {
    if (isOpen) {
      const result = validateCellValue(editValue, columnKind, sqlTypeName);
      setError(result.valid ? null : result.error ?? null);
    }
  }, [editValue, isOpen, columnKind, sqlTypeName]);

  const handleSave = () => {
    onSave(editValue);
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={`Edit: ${columnDisplayName}`}
      onClose={onCancel}
      canOutsideClickClose={true}
    >
      <div className="bp4-dialog-body">
        {isAggregateRow && isPivot && (
          <div className="bp4-callout bp4-intent-primary">
            This will update the grouping value for all rows in this group.
          </div>
        )}
        {isAggregateRow && !isPivot && (
          <div className="bp4-callout bp4-intent-primary">
            This will update all rows in this group to the new value.
          </div>
        )}
        <label className="bp4-label">
          Value:
          <input
            className="bp4-input bp4-fill"
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            autoFocus
          />
        </label>
        {error && (
          <p className="bp4-text-muted" style={{ color: "#cf4c35", marginTop: 4 }}>
            {error}
          </p>
        )}
      </div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            intent={Intent.PRIMARY}
            onClick={handleSave}
            disabled={error !== null}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
