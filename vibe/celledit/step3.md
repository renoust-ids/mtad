# Étape 3 : State management — editingCell dans AppState/ViewState

## Objectif
Intégrer l'état d'édition dans le state management global (oneref/Immutable.js) pour que :
- Le double-clic mette à jour `editingCell` dans le state
- La modale lise `editingCell` depuis le state
- Les actions `commitCellEdit` et `cancelCellEdit` gèrent les transitions

## Contexte technique
- L'état est immutable (Immutable.js records)
- `ViewState` contient `viewParams`, `dataView`, `queryView`, etc.
- `AppState` contient `viewState`
- Les mutations passent par `actions.ts` → `update(stateRef, stateTransformer)`
- Le composant `GridPane` est un composant fonctionnel qui reçoit `viewState` et `viewParams` en props

## 3.1 Ajouter editingCell à ViewState

**Fichier** : `packages/tadviewer/src/ViewState.ts`

Dans la définition de `ViewState` (qui est un record Immutable.js), ajouter :

```typescript
// Type pour l'état d'édition
export interface CellEditState {
  readonly row: number;
  readonly col: number;
  readonly columnId: string;
  readonly value: any;
  readonly columnKind: ColumnKind;
  readonly isAggregateRow: boolean;
}

// Dans ViewState, ajouter le champ (après les champs existants) :
editingCell: CellEditState | null;
```

**Note** : ViewState est un Immutable.js record. Il faut modifier le `recordDef` ou le constructeur pour inclure ce champ avec une valeur par défaut `null`.

## 3.2 Ajouter les actions dans actions.ts

**Fichier** : `packages/tadviewer/src/actions.ts`

```typescript
import { CellEditState } from "./ViewState";

export function startCellEdit(
  editState: CellEditState
): StateTransformer {
  return (state: AppState) =>
    state.update("viewState", (vs) =>
      vs.set("editingCell", editState)
    );
}

export function commitCellEdit(
  newValue: string,
  stateRef: StateRef
): void {
  update(stateRef, (state) => {
    const editState = state.viewState.editingCell;
    if (!editState) return state;

    // Phase 1 : simulation — log only
    console.log(
      `[CellEdit] Would commit: row=${editState.row}, col=${editState.columnId}, ` +
      `old=${editState.value}, new=${newValue}`
    );

    // Fermer l'état d'édition
    return state.update("viewState", (vs) =>
      vs.set("editingCell", null)
    );
  });
}

export function cancelCellEdit(): StateTransformer {
  return (state: AppState) =>
    state.update("viewState", (vs) =>
      vs.set("editingCell", null)
    );
}
```

## 3.3 Câbler GridPane sur le state global

**Fichier** : `packages/tadviewer/src/components/GridPane.tsx`

Remplacer l'état local `editingCell` par la lecture depuis `viewState.editingCell` et les actions :

```typescript
// Avant (état local) :
// const [editingCell, setEditingCell] = useState<CellEditStartData | null>(null);

// Après (état global) :
const editingCell = viewState.editingCell;

const handleEditStart = (data: CellEditStartData) => {
  const colType = schema.getColumn(data.columnId);
  actions.startCellEdit({
    row: data.row,
    col: data.col,
    columnId: data.columnId,
    value: data.value,
    columnKind: colType?.columnType?.kind ?? "string",
    isAggregateRow: data.isPivot,
  })(stateRef);
};

const handleEditSave = (newValue: string) => {
  actions.commitCellEdit(newValue, stateRef);
};

const handleEditCancel = () => {
  actions.cancelCellEdit()(stateRef);
};
```

## 3.4 Simplifier DataGrid.tsx

**Fichier** : `packages/tadviewer/src/components/DataGrid.tsx`

Simplifier la callback `onCellEditStart` pour ne contenir que le data brut (pas le columnKind, c'est GridPane qui le résout).

## Instructions de test
1. Build complet
2. Ouvrir un CSV, double-cliquer → modale s'ouvre (vérifier via devtools que `viewState.editingCell` est défini)
3. Cliquer Cancel → `editingCell` redevient `null`
4. Cliquer Save → le console.log de simulation s'affiche, `editingCell` redevient `null`

## Validation
Commit : `feat(tadviewer): add editingCell state to ViewState`
