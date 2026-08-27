import { ColumnKind } from "reltab";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCellValue(
  value: string,
  kind: ColumnKind,
  sqlTypeName?: string
): ValidationResult {
  if (value.trim() === "" || value.toLowerCase() === "null") {
    return { valid: true }; // null autorisé
  }

  switch (kind) {
    case "string":
    case "dialect":
      return { valid: true };

    case "integer":
      if (/^-?\d+$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be an integer (e.g., 42, -7)" };

    case "real":
      if (/^-?\d+\.?\d*([eE][+-]?\d+)?$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be a number (e.g., 3.14, -2.5)" };

    case "boolean":
      if (/^(true|false|1|0|yes|no)$/i.test(value.trim())) {
        return { valid: true };
      }
      return {
        valid: false,
        error: "Must be true/false, 1/0, or yes/no",
      };

    case "date":
      if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const d = new Date(value.trim());
        if (!isNaN(d.getTime())) return { valid: true };
      }
      return { valid: false, error: "Must be YYYY-MM-DD format" };

    case "time":
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be HH:MM or HH:MM:SS format" };

    case "datetime":
    case "timestamp": {
      // Use sqlTypeName to determine the expected format
      const upperType = sqlTypeName?.toUpperCase();
      if (upperType === "DATE") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
          const d = new Date(value.trim());
          if (!isNaN(d.getTime())) return { valid: true };
        }
        return { valid: false, error: "Must be YYYY-MM-DD format" };
      }
      if (upperType === "TIME" || upperType === "TIME WITH TIME ZONE") {
        if (/^\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
          return { valid: true };
        }
        return { valid: false, error: "Must be HH:MM or HH:MM:SS format" };
      }
      // TIMESTAMP, DATETIME, TIMESTAMPTZ, etc.
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value.trim())) {
        return { valid: true };
      }
      return {
        valid: false,
        error: "Must be ISO 8601 format (YYYY-MM-DDTHH:MM:SS)",
      };
    }

    case "blob":
      return { valid: false, error: "BLOB columns are not editable" };

    default:
      return { valid: true };
  }
}
