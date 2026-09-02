# AGENT_DEV_LOG — Excel Spreadsheet Loading & Joining

## 2026-09-01 — Planification
- Création branche `feat/excel` (depuis `master` `4c00387`, v0.0.6).
- Exploration de l'architecture chargement (`reltab-fs`/`reltab-duckdb`, `dataFileExtensions`, `getTableName`) et jointure (`JoinCsvDialog`, IPC `main.ts`, `confirmCsvJoin`, reltab `joinCsv`/`toSql`/`pp`).
- 5 décisions de design validées par l'utilisateur (voir `mission.md`).
- Rédaction : `mission.md`, `spec.md`, `global_plan.md`, `STATE_HANDOFF.md`, `AGENT_DEV_LOG.md`.
