# Mission: UI Improvements - Context Menus & Export

## Objectif
Améliorer les context menus de MTad avec des opérations de manipulation de colonnes, lignes et cellules, et ajouter des options d'export.

## Fonctionnalités

### Context Menu Colonne
- **Rename** (existant)
- **Delete Column** : `ALTER TABLE ... DROP COLUMN` avec confirmation
- **Duplicate Column** : `ALTER TABLE ... ADD COLUMN new_col AS old_col` avec nom éditable (suffixe `_2`)

### Context Menu Cellules (tout type de sélection)
- **Edit / Edit all** (existant)
- **Delete Rows** : Supprime toutes les lignes contenant des cellules sélectionnées
- **Duplicate Rows** : Duplique toutes les lignes contenant des cellules sélectionnées
- **Copy (cells)** : Copie uniquement les valeurs des cellules sélectionnées (TSV) — équivalent Cmd+C
- **Copy (rows)** : Copie toutes les colonnes visibles des lignes sélectionnées (TSV)

### Context Menu Lignes Agrégées
- **Delete All Aggregate Rows** : Supprime toutes les lignes du groupe agrégé
- **Duplicate All Aggregate Rows** : Duplique toutes les lignes du groupe agrégé

### Export Interface
- **Visible Columns Only** : Checkbox, défaut=true
- **Column Order** : Checkbox, défaut=true

## Contraintes techniques
- Backend: DuckDB via `execSql()` pour DDL/DML
- Sélection: CellSelectionModel existant — extraire les lignes des ranges sélectionnés
- Clipboard: `SimpleClipboard.writeText()` existant — étendre pour Copy (rows)
- UI: BlueprintJS Alert/Dialog
- Refresh: Re-fetch schema + data après opérations

## Steps
1. Backend DataSourceConnection methods
2. Column context menu: Delete & Duplicate
3. Row operations from cell selection: Delete/Duplicate Rows
4. Aggregate row operations: Delete All / Duplicate All
5. Cell/Row copy operations in context menu
6. Export: Visible columns + order checkboxes
7. Build & E2E testing
