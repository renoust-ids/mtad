# STATE HANDOFF - Improve UI

## Current State
- **Branch**: `improveui` (created from master v0.0.3)
- **Status**: Planning complete, awaiting implementation

## Goal
Implement UI improvements: column/row manipulation via context menus and export options.

## Key Files
- `vibe/improveui/mission.md` - High-level mission
- `vibe/improveui/global_plan.md` - Implementation plan
- `vibe/improveui/step1.md` - Backend DataSourceConnection methods
- `vibe/improveui/step2.md` - Column context menu (Delete/Duplicate)
- `vibe/improveui/step3.md` - Row context menu (Delete/Duplicate)
- `vibe/improveui/step4.md` - Aggregate row context menu (Delete All/Duplicate All)
- `vibe/improveui/step5.md` - Export interface options

## Implementation Order
1. **Step 1** (Backend): DataSourceConnection methods - Foundation for all features
2. **Step 2** (Column Menu): Delete & Duplicate column
3. **Step 3** (Row Menu): Delete & Duplicate row (leaf rows only)
4. **Step 4** (Aggregate Menu): Delete All & Duplicate All aggregate rows
5. **Step 5** (Export): Visible columns only + column order checkboxes

## Key Patterns
- Backend: `execSql()` for all DDL/DML operations
- UI: BlueprintJS Alert for confirmation, Dialog for input
- State: oneref pattern with `update(stateRef, ...)`
- Refresh: Create new ViewParams reference to trigger PivotRequester re-fetch

## Conventions
- Commit messages: `feat(tadviewer): ...` or `feat(reltab): ...`
- Each step = one commit
- Build commands:
  - reltab: `cd packages/reltab && npx tsc -p tsconfig-build.json`
  - tadviewer: `cd packages/tadviewer && npx webpack --mode production`
  - tad-app: `cd packages/tad-app && npm run build-assets && npx webpack --mode production`

## Contacts
- See `vibe/celledit/STATE_HANDOFF.md` for previous session patterns
- See `vibe/celledit/AGENT_DEV_LOG.md` for detailed development log
