# Concatenate File Feature - Implementation Plan

## Overview
Add a "Concatenate File..." menu option that allows users to append rows from a new file to the current table, with intelligent column alignment and type casting.

## Key Requirements
1. **Menu Item**: "Concatenate File..." in File menu (similar to "Join File...")
2. **File Selection**: Dialog to select CSV/TSV/XLSX files
3. **Column Alignment**: 
   - Auto-match columns by name (case-insensitive)
   - Propose type casting using DuckDB rules (TRY_CAST for safety)
   - Show casting operations in the dialog
4. **User Controls**:
   - Per-column null value specification
   - Custom column mapping with "+" button to add new mappings
   - Display new columns that will be added
5. **Backend**: Use existing `concatCsv` reltab implementation

## Implementation Steps

### Step 1: Add Menu Item
**File**: `packages/tad-app/app/appMenu.ts`
- Add "Concatenate File..." menu item after "Join File..."
- Send IPC message `start-csv-concatenate` to renderer

### Step 2: Add AppState for ConcatenateDialog
**File**: `packages/tadviewer/src/AppState.ts`
- Add `ConcatCsvDialogState` interface
- Add `concatCsvDialog` to `AppStateProps`
- Define default state

### Step 3: Add Actions for ConcatenateDialog
**File**: `packages/tadviewer/src/actions.ts`
- Add actions for opening/closing dialog
- Add actions for setting file path, columns, mappings
- Add action for confirming concatenation

### Step 4: Create ConcatCsvDialog Component
**File**: `packages/tadviewer/src/components/ConcatCsvDialog.tsx`

**Dialog Layout**:
```
┌─────────────────────────────────────────────────────────────┐
│ Concatenate File                                            │
├─────────────────────────────────────────────────────────────┤
│ File: [path/to/file.csv] [📂]                              │
│ Sheet: [Sheet1 ▼] (if XLSX)                                │
│                                                             │
│ Column Mapping:                                             │
│ ┌─────────────────┬─────────────────┬─────────────────┬───┐ │
│ │ Original Column │ New Column      │ Result Type     │   │ │
│ ├─────────────────┼─────────────────┼─────────────────┼───┤ │
│ │ Name            │ name            │ VARCHAR         │   │ │
│ │ Base            │ --              │ DOUBLE          │   │ │
│ │ --              │ bonus           │ INTEGER         │   │ │
│ └─────────────────┴─────────────────┴─────────────────┴───┘ │
│ [+ Add Mapping]                                             │
│                                                             │
│ New Columns to Add:                                         │
│ • bonus (INTEGER)                                           │
│                                                             │
│ Per-Column Null Values:                                     │
│ Name: [N/A        ]                                         │
│ Base: [           ]                                         │
│ bonus: [           ]                                        │
├─────────────────────────────────────────────────────────────┤
│ [Cancel]                              [Concatenate]         │
└─────────────────────────────────────────────────────────────┘
```

**Features**:
- Auto-open file picker when dialog opens
- Auto-match columns by name (case-insensitive)
- Show type casting when types differ
- "+" button to add custom column mappings
- Display new columns that will be added
- Per-column null value inputs

### Step 5: Implement Column Matching Logic
**File**: `packages/tadviewer/src/utils/concatColumnMatcher.ts`

**Logic**:
1. Get original table columns and types from current view
2. Get new file columns and types from file header
3. Match columns by name (case-insensitive)
4. For matched columns:
   - If types are identical: no cast needed
   - If types differ: use DuckDB's TRY_CAST to the wider type
5. Identify unmatched columns (original-only, new-only)
6. Return mapping suggestions

### Step 6: Add IPC Handler for Concatenate
**File**: `packages/tad-app/app/appWindow.ts`
- Add handler for `start-csv-concatenate` message
- Reuse existing file selection and header reading logic

### Step 7: Wire Up Dialog in Main App
**File**: `packages/tadviewer/src/components/AppRoot.tsx`
- Import and render `ConcatCsvDialog`
- Connect to app state and actions

### Step 8: Implement Confirm Concatenation Action
**File**: `packages/tadviewer/src/actions.ts`
- `confirmConcatCsv` action that:
  1. Builds `ConcatCsvArgs` from dialog state
  2. Calls `reltab.concatCsv()` on the current query
  3. Creates new table with concatenated results
  4. Opens the new table in the viewer

## Type Casting Rules (DuckDB)
- Use `TRY_CAST` for safety (returns NULL on failure)
- DuckDB will handle type promotion automatically:
  - INTEGER + DOUBLE → DOUBLE
  - BOOLEAN + INTEGER → INTEGER
  - DOUBLE + VARCHAR → VARCHAR
  - DATE + TIMESTAMP → TIMESTAMP

## Testing Strategy
1. Unit tests for column matching logic
2. Unit tests for dialog state management
3. Integration test with sample CSV files
4. Test with XLSX files (multi-sheet support)

## Files to Create/Modify
1. **Create**: `packages/tadviewer/src/components/ConcatCsvDialog.tsx`
2. **Create**: `packages/tadviewer/src/utils/concatColumnMatcher.ts`
3. **Modify**: `packages/tad-app/app/appMenu.ts`
4. **Modify**: `packages/tadviewer/src/AppState.ts`
5. **Modify**: `packages/tadviewer/src/actions.ts`
6. **Modify**: `packages/tadviewer/src/components/AppRoot.tsx`

## Dependencies
- Existing `concatCsv` reltab implementation (already done)
- Existing file selection IPC handlers
- BlueprintJS components (Dialog, FormGroup, HTMLSelect, Button, etc.)

## Risks & Mitigations
1. **Risk**: Large files may cause performance issues
   - **Mitigation**: DuckDB handles large files efficiently with streaming

2. **Risk**: Complex type casting may fail
   - **Mitigation**: Use TRY_CAST and show errors in dialog

3. **Risk**: Column name conflicts
   - **Mitigation**: Allow user to override auto-matching with custom mappings

## Next Steps
1. Start with Step 1 (menu item)
2. Implement step by step with tests
3. Test with sample data
4. Refine UI based on feedback
