# Étape 1 : Double-clic + CellEditModal (UI de base)

## Objectif
Ajouter la capacité de détecter un double-clic sur une cellule du grid et afficher une modale de dialogue permettant de visualiser et modifier la valeur de la cellule.

## Contexte technique
- Le grid utilise **SlickGrid** (via `slickgrid-es6`) dans `DataGrid.tsx`
- Aucun gestionnaire `onDblClick` n'existe actuellement
- Les cellules sont rendues par des `formatters` (fonctions qui retournent du HTML)
- L'état est géré par **oneref** (Flux-like immutable state)
- Les dialogs utilisent **BlueprintJS** `<Dialog>`

## 1.1 Ajouter le gestionnaire double-clic dans DataGrid.tsx

**Fichier** : `packages/tadviewer/src/components/DataGrid.tsx`

Dans `createGrid()` (vers la ligne 487, après `grid.onClick.subscribe`), ajouter :

```typescript
grid.onDblClick.subscribe((_event: Event, data: Slick.OnDblClickEventData) => {
  const item = dataView.getItem(data.row);
  const columns = grid.getColumns();
  const column = columns[data.cell];

  // Exclure les colonnes système
  if (["_", "_id", "_parentId"].includes(column.id)) {
    return;
  }

  // Exclure les lignes d'agrégat (non-leaf)
  if (item && !item._isLeaf) {
    return;
  }

  const value = item ? item[column.id] : null;
  onCellEditStart?.({
    row: data.row,
    col: data.cell,
    columnId: column.id,
    value,
    isPivot: column.id === "_pivot",
  });
});
```

**Props à ajouter** au composant `DataGrid` :

```typescript
interface DataGridProps {
  // ... props existantes ...
  onCellEditStart?: (data: CellEditStartData) => void;
}

interface CellEditStartData {
  row: number;
  col: number;
  columnId: string;
  value: any;
  isPivot: boolean;
}
```

## 1.2 Créer le composant CellEditModal.tsx

**Fichier** : `packages/tadviewer/src/components/CellEditModal.tsx` (nouveau)

```typescript
import React, { useState, useEffect } from "react";
import { Dialog, Button, Intent } from "@blueprintjs/core";

interface CellEditModalProps {
  isOpen: boolean;
  columnId: string;
  columnDisplayName: string;
  currentValue: any;
  isAggregateRow: boolean;
  onSave: (newValue: string) => void;
  onCancel: () => void;
}

export const CellEditModal: React.FC<CellEditModalProps> = ({
  isOpen,
  columnId,
  columnDisplayName,
  currentValue,
  isAggregateRow,
  onSave,
  onCancel,
}) => {
  const [editValue, setEditValue] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setEditValue(currentValue != null ? String(currentValue) : "");
    }
  }, [isOpen, currentValue]);

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
        {isAggregateRow && (
          <div className="bp4-callout bp4-intent-warning">
            This is an aggregated/pivoted value. Editing is not available in
            read-only mode.
          </div>
        )}
        <label className="bp4-label">
          Value:
          <input
            className="bp4-input bp4-fill"
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            disabled={isAggregateRow}
            autoFocus
          />
        </label>
      </div>
      <div className="bp4-dialog-footer">
        <div className="bp4-dialog-footer-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            intent={Intent.PRIMARY}
            onClick={handleSave}
            disabled={isAggregateRow}
          >
            Save
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
```

## 1.3 Câbler dans GridPane.tsx

**Fichier** : `packages/tadviewer/src/components/GridPane.tsx`

- Ajouter l'état local `editingCell` dans le composant
- Passer `onCellEditStart` au `DataGrid`
- Rendre `<CellEditModal />` avec les props appropriées

```typescript
// Dans GridPane :
const [editingCell, setEditingCell] = useState<CellEditStartData | null>(null);

// Passer au DataGrid :
<DataGrid
  onCellEditStart={setEditingCell}
  // ... autres props
/>

// Rendre la modale :
<CellEditModal
  isOpen={editingCell !== null}
  columnId={editingCell?.columnId ?? ""}
  columnDisplayName={editingCell?.columnId ?? ""}
  currentValue={editingCell?.value}
  isAggregateRow={editingCell?.isPivot ?? false}
  onSave={(val) => {
    console.log("Cell edit (phase 1 - no save):", editingCell, val);
    setEditingCell(null);
  }}
  onCancel={() => setEditingCell(null)}
/>
```

## Instructions de test
1. `cd packages/tadviewer && npx webpack --mode production`
2. `cd packages/tad-app && npm run build-assets && npx webpack --mode production`
3. `./run.sh`
4. Ouvrir un CSV, double-cliquer sur une cellule → la modale doit s'ouvrir
5. Vérifier que la valeur courante est affichée
6. Cliquer Cancel → la modale se ferme
7. Double-cliquer sur une colonne `_pivot` → rien ne doit se passer
8. Vérifier l'absence d'erreurs dans la console

## Validation
Commit : `feat(tadviewer): add CellEditModal component and double-click handler`
