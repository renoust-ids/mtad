# Known Issues, Warnings and Non-Blocking Errors

This document tracks known non-blocking warnings and errors observed while running MTad. None of them affect functionality; they are collected here so they can be recognized, explained, and (where worth it) addressed later without re-investigation.

Table of contents:

- [1. DevTools `Autofill.enable` / `Autofill.setAddresses` errors](#1-devtools-autofillenable--autofillsetaddresses-errors)
- [2. Blueprint `Portal` legacy `contextTypes` + `findDOMNode` deprecation warnings](#2-blueprint-portal-legacy-contexttypes--finddomnode-deprecation-warnings)
- [3. `*** DuckDbDialect: Error converting Invalid time value`](#3-duckdbdialect-error-converting-invalid-time-value)
- [4. xlsx mixed-column import fallback logs (`retrying as text + inference`)](#4-xlsx-mixed-column-import-fallback-logs)

---

## 1. DevTools `Autofill.enable` / `Autofill.setAddresses` errors

**Observed as:**
```
[<pid>:<ts>:ERROR:CONSOLE(1)] "Request Autofill.enable failed. {"code":-32601,"message":"'Autofill.enable' wasn't found"}", source: devtools://devtools/bundled/core/protocol_client/protocol_client.js (1)
[<pid>:<ts>:ERROR:CONSOLE(1)] "Request Autofill.setAddresses failed. {"code":-32601,"message":"'Autofill.setAddresses' wasn't found"}", source: devtools://devtools/bundled/core/protocol_client/protocol_client.js (1)
```

**When:** When Chrome DevTools is opened (Debug ▸ Toggle Developer Tools, `Cmd+Alt+I`, or `F12`).

**Cause:** Electron's embedded Chromium is a stripped build. When the DevTools frontend boots it issues `Autofill.enable` / `Autofill.setAddresses` Chrome DevTools Protocol (CDP) commands, but those methods are only implemented in full Chrome. Electron's target returns `code:-32601 "wasn't found"`, which the DevTools frontend logs as a console error.

**Impact:** None — cosmetic, dev-tooling noise only. Unrelated to application or IPC functionality.

**Why not fixed:** Upstream, closed Electron issue (electron/electron#41614, #46868, #49267). There is no runtime way to disable specific CDP methods in Electron. The messages only appear while DevTools is manually opened.

**Mitigations applied / options:**
- Removed the app's automatic `openDevTools()`/`closeDevTools()` call (was running on every window creation) — this eliminated the *automatic* occurrences. See commit `faf5c26`.
- Manual DevTools opens still show the messages; possible mitigations explored were Electron upgrade to a version whose DevTools frontend matches its Chromium (34/35), or opening DevTools detached, but both are version-dependent and not guaranteed.

**Decision:** Ignore. Do not fix for now.

---

## 2. Blueprint `Portal` legacy `contextTypes` + `findDOMNode` deprecation warnings

**Observed as:**
```
Warning: Blueprint4.Portal uses the legacy contextTypes API which is no longer supported and will be removed in the next major release. Use React.createContext() with static contextType instead.
Warning: findDOMNode is deprecated and will be removed in the next major release. Instead, add a ref directly to the element you want to reference.
```
(The stack traces point at `Portal` → `Overlay` → `Dialog` inside `@blueprintjs/core`.)

**When:** Whenever a Blueprint dialog/overlay opens (e.g. the SPLOM dialog, Histogram, Join CSV, cell edit modal, etc.).

**Cause:** The app uses **React 18.3** with **@blueprintjs/core 4.12.0** (and `react-transition-group` 4.4.5, a Blueprint `Overlay` dependency). Blueprint 4 targets React 17 internals:
- `Portal` reads `Z_INDEX_CONTEXT` through the legacy React `contextTypes` API.
- `Overlay`'s enter/exit transitions go through `react-transition-group`, which calls the deprecated `findDOMNode`.

React 18 prints deprecation warnings for both. It is non-functional.

**Impact:** None — deprecation warnings only.

**Why not fixed:** Blueprint is used pervasively (all Dialogs, the sidebar trees in `DataSourceSidebar`/`PivotSidebar`, filter editors, popovers, tooltips, format panels). The correct fix is upgrading to **@blueprintjs/core v5**, which removes `findDOMNode`/legacy context and supports React 18 — but v4→v5 is a **major** release with breaking theme/CSS/API changes, so it is not a minor update and risks regressions across the UI.

**Related/mitigations:**
- The single use of Blueprint's `ResizeSensor` was replaced with a ref-based `ResizeObserver` (commit `fc8ee92`) — a local, self-contained fix that removed one `findDOMNode` source outside of the Dialog/Overlay internals.
- The remaining Dialog/Overlay warnings are internal to Blueprint and cannot be removed without upgrading Blueprint.

**Decision:** Accept (document only). Do not fix now; revisit if/when upgrading to Blueprint 5 or React 19.

---

## 3. `*** DuckDbDialect: Error converting Invalid time value`

**Observed as:**
```
*** DuckDbDialect: Error converting Invalid time value:  19:43:00
```

**When:** When a **TIME** column (or time-only value) is rendered, e.g. displaying a `TIME` cell from an Excel import in the grid.

**Cause:** `createTimestampStringRenderer({ timeOnly: true })` in
`packages/reltab/src/dialects/DuckDBDialect.ts` is used as the cell formatter for `TIME` columns. It parsed the value with `new Date(...).toISOString()`, which throws a `RangeError` for a bare time string like `19:43:00` (an invalid JS Date) — then printed a `console.info` and fell back to `String(val)`.

The value is a valid time; it just is not a parseable JS `Date`, so the message was spurious, repeated for every rendered TIME cell.

**Impact:** None functionally (fallback produced the correct value). It was console noise.

**Fix applied:** `packages/reltab/src/dialects/DuckDBDialect.ts` now short-circuits bare `HH:MM`/`HH:MM:SS` time values before calling `new Date()`, rendering them as-is. A dedicated unit test was added (`packages/reltab/test/DuckDBDialect.test.ts`). See commit `6f784fe`.

**Residual note:** The `timeOnly` path for *full* `DATETIME` (`YYYY-MM-DDTHH:MM`) values still parses them with `new Date()` and shifts to UTC via `toISOString()` (a pre-existing latent behavior — local input is rendered in UTC). Unchanged and out of scope.

---

## 4. xlsx mixed-column import fallback logs

**Observed as (terminal/log):**
```
caught exception while importing xlsx (retrying as text + inference):  [Error: Invalid Input Error: read_xlsx: Failed to parse cell 'C12': Could not convert string '湛慶' to DOUBLE]
caught exception while importing xlsx (retrying as text + inference):  [Error: Invalid Input Error: read_xlsx: Failed to parse cell 'O5': Could not convert string '醍醐寺' to DOUBLE]
```

**When:** When opening an `.xlsx` workbook that has a **mixed-type column** — a column DuckDB's `read_xlsx` infers as numeric (e.g. `DOUBLE`) but which contains a stray text cell (e.g. a Japanese artist/temple name `湛慶`, `醍醐寺`).

**Cause:** DuckDB's native `read_xlsx` with `all_varchar=false` fails the **entire** import as soon as one cell cannot be coerced to the inferred column type. `nativeXLSXImport` (in `packages/reltab-duckdb/src/xlsximport.ts`) catches this and re-reads the whole sheet as text (`all_varchar=true`), then infers each column's type per-value. This is **expected, deliberate** fallback behavior.

**Impact:** None — the import succeeds through the inference path (e.g. the Buddha workbook loads all 1002 rows across 28 columns). The log line was informational but repeated for every mixed-column workbook.

**Fix applied (cosmetic):** The fallback notices were re-routed from `console.log` to `loglevel` (`log.debug` for the retry notice, `log.error` for a genuine inference failure). See commit `fdb2891`. Normal imports no longer emit the retry message.

**Future enhancement (not done):** A mixed column forces the whole sheet onto per-column inference, so a numeric column that *could* stay fully numeric becomes `VARCHAR` if any one cell is textual; and the textual cell (`湛慶`) becomes a string row in that column. A more refined approach would split columns (keep fully-numeric columns typed, cast only the mixed ones) — deferred.

---

## Notes on logging conventions

- The renderer uses `loglevel`; the Electron main process uses `electron-log`. New logs should prefer these over raw `console.*` so they can be leveled toggled in production.
- These warnings are tracked here rather than fixed because they originate in vendor code (`@blueprintjs/core`, `react-transition-group`, Chromium DevTools) and fixing them requires a major dependency upgrade that does not meet the "no major updates" constraint.