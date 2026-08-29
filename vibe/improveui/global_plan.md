# Plan de réalisation : UI Improvements

## Objectif global
Améliorer les context menus de MTad pour la manipulation de colonnes, lignes et cellules, et ajouter des options d'export.

## Architecture cible

```
Context Menu Colonne (onHeaderContextMenu)
    ├── Rename (existant)
    ├── Delete Column → ALTER TABLE DROP COLUMN → execSql()
    └── Duplicate Column → ALTER TABLE ADD COLUMN AS → execSql()

Context Menu Cellules (onContextMenu)
    ├── Edit / Edit all (existant)
    ├── Delete Rows → DELETE FROM WHERE rowid IN (...) sur les feuilles, sinon WHERE valeurs → execSql()
    ├── Duplicate Rows → INSERT INTO SELECT * WHERE rowid IN (...) sur les feuilles, sinon WHERE valeurs → execSql()
    ├── Copy (cells) → clipboard.writeText(TSV) ← cellules sélectionnées uniquement
    └── Copy (rows) → clipboard.writeText(TSV) ← toutes colonnes visibles des lignes sélectionnées

Context Menu Lignes Agrégées (onContextMenu, _isLeaf === false)
    ├── Edit all (existant)
    ├── Delete All Aggregate Rows → DELETE FROM WHERE pivotCols match → execSql()
    └── Duplicate All Aggregate Rows → INSERT INTO SELECT * WHERE pivotCols match → execSql()

Ciblage rowid (Step 8) : column cachée _rid = rowid DuckDB, threadée jusqu'aux
lignes feuilles du grid. Edit/Duplicate/Delete sur une ligne feuille ciblent un
rowid précis ; les lignes agrégées/root retombent sur la clause par valeurs.
Lignes agrégées (Step 9) : clause WHERE construite depuis le chemin de pivot
(_path[i] → vpivots[i]), jamais vide pour la racine (1=1).
Tri par label de pivot (Step 9) : colonne _pivot sortable, direction appliquée
au _path i de chaque profondeur (_pivot exclu du mécanisme _sortVal).

Export Interface (ExportBeginDialog)
    ├── Visible Columns Only (checkbox, défaut=true)
    └── Column Order (checkbox, défaut=true)
```

## Fichiers concernés

| Package | Fichier | Modification |
|---------|---------|-------------|
| reltab | `src/DataSource.ts` | deleteColumn, duplicateColumn, deleteRows, duplicateRows |
| reltab | `src/remote/Connection.ts` | Request interfaces + Remote methods |
| reltab | `src/remote/server.ts` | Server handlers |
| tadviewer | `src/actions.ts` | Actions: deleteColumn, duplicateColumn, deleteRows, duplicateRows, copyRows |
| tadviewer | `src/components/DataGrid.tsx` | Context menus enrichis + copy rows logic |
| tadviewer | `src/components/GridPane.tsx` | Dialog state + callbacks |
| tadviewer | `src/components/AppPane.tsx` | Export checkboxes |
| tadviewer | `src/AppState.ts` | exportVisibleOnly, exportColumnOrder |

## Étapes

### Step 1: Backend DataSourceConnection methods
- deleteColumn, duplicateColumn, deleteRows, duplicateRows
- Wire through remote transport

### Step 2: Column context menu: Delete & Duplicate
- Delete Column with confirmation
- Duplicate Column with name dialog

### Step 3: Row operations from cell selection
- Delete Rows: identifies rows from cell selection ranges
- Duplicate Rows: copies full rows

### Step 4: Aggregate row operations
- Delete All Aggregate Rows
- Duplicate All Aggregate Rows

### Step 5: Cell/Row copy in context menu
- Copy (cells): clipboard TSV of selected cells
- Copy (rows): clipboard TSV of all visible columns for selected rows

### Step 6: Export interface options
- Visible Columns Only checkbox
- Column Order checkbox

### Step 7: Build & E2E testing

### Step 8: Ciblage par rowid physique (rows bug-fix)
- Colonne cachée `_rid` (= rowid DuckDB) threadée jusqu'aux lignes feuilles
- Edit/Duplicate/Delete ciblent un rowid précis (plus d'explosion 1→2→4, plus
  d'édition touchant toutes les copies)
- Régression pivot corrigée (NULL typé sur agrégés/root + cycle circulaire
  `defaultDialect` cassé)

### Step 9: Corrections contextuel (fix + features)
- Fix duplication/suppression des lignes agrégées : clause WHERE construite
  depuis le chemin de pivot `_path[i]` → `vpivots[i]` (jamais vide pour la
  racine)
- Feature tri par label de pivot : colonne `_pivot` sortable, direction
  utilisateur appliquée au `_path i` de chaque profondeur (`_pivot` exclu du
  `_sortVal`)
- Chore libellés de menus : Rename/Duplicate/Delete Column, Edit Cell,
  Delete/Duplicate/Copy Row(s), Copy Cell(s) selon la sélection
