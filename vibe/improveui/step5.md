# ÉTAPE 5 : Context Menu Cellules - Copy Operations

## Objectif
Ajouter "Copy (cells)" et "Copy (rows)" au context menu des cellules pour copier dans le presse-papier.

## Fonctionnalités existantes
- **Cmd+C / Ctrl+C** : Copie le range sélectionné en TSV via `CellCopyManager` + `document copy` listener
- `copySelectedRange(range)` dans DataGrid.tsx copie uniquement les cellules du range
- `SimpleClipboard.writeText()` est le mécanisme de clipboard

### Copy (cells)
- Équivalent exact de Cmd+C
- Copie uniquement les valeurs des cellules sélectionnées
- Format: TSV (tab-separated, CRLF row separator)
- Utilise `copySelectedRange()` existant
- Réutilise la logique de `escapeTabs()` pour les cellules contenant des tabs

### Copy (rows)
- Copie TOUTES les colonnes visibles des lignes contenant des cellules sélectionnées
- Format: TSV avec en-tête (noms de colonnes visibles)
- Pour chaque ligne dans les ranges sélectionnées:
  - Extraire toutes les valeurs des colonnes visibles (pas seulement la sélection)
  - Joindre avec \t
- En-tête: noms des colonnes visibles séparés par \t
- Lignes: valeurs séparées par \t, lignes séparées par \r\n

## Logique Copy (rows)
```typescript
// 1. Obtenir les lignes uniques des ranges sélectionnés
const ranges = grid.getSelectionModel().getSelectedRanges();
const selectedRows = [...new Set(ranges.flatMap(r => 
  Array.from({length: r.toRow - r.fromRow + 1}, (_, i) => r.fromRow + i)
))];

// 2. Obtenir les colonnes visibles (hors métadonnées)
const visibleCols = grid.getColumns().filter(c => !c.id.startsWith("_") && c.id !== "Rec");

// 3. Construire TSV
const header = visibleCols.map(c => c.name).join("\t");
const rows = selectedRows.map(rowIdx => {
  const item = dataView.getItemById(rowIdx);
  return visibleCols.map(c => String(item[c.id] ?? "")).join("\t");
});
const tsv = [header, ...rows].join("\r\n");
clipboard.writeText(tsv);
```

## Context Menu Items (cellules, après étape 5)
```
Edit / Edit all              (existant)
─ separator ─
Delete Rows                  (Étape 3)
Duplicate Rows               (Étape 3)
─ separator ─
Copy (cells)                 (nouveau)
Copy (rows)                  (nouveau)
```

## Fichiers à modifier
1. `packages/tadviewer/src/components/DataGrid.tsx` — Menu items + copyRows function

## Validation
- Build: `cd packages/tadviewer && npx webpack --mode production`
- Test: Select cells → right-click → Copy (cells) → paste → TSV des cellules
- Test: Select cells → right-click → Copy (rows) → paste → TSV colonnes visibles
- Commit: `feat(tadviewer): add copy cells and copy rows to context menu`
