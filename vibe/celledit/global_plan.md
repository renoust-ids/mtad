# Plan de réalisation : Édition de Cellule (Cell Editing)

## Objectif global
Permettre à l'utilisateur de modifier visuellement la valeur d'une cellule du grid via un double-clic, avec validation du type et retour visuel. Phase 1 = UI/UX uniquement, sans écriture dans la source de données.

## Architecture cible

```
Double-clic sur cellule
        │
        ▼
DataGrid.tsx ─── grid.onDblClick.subscribe() ───▶ dispatch editingCell state
        │
        ▼
AppState.editingCell = { row, col, value, columnType }
        │
        ▼
CellEditModal.tsx ─── Lit editingCell ───▶ Affiche la modale BlueprintJS
        │                                      ├── Champ de saisie adapté au type
        │                                      ├── Validation en temps réel
        │                                      ├── Info pivot si ligne agrégat
        │                                      └── Boutons Save / Cancel
        │
        ▼
(Phase 1: simulation "Saved" / Phase 2: DataSourceConnection.updateCell())
```

## Fichiers concernés

| Package | Fichier | Modification |
|---------|---------|-------------|
| tadviewer | `src/components/DataGrid.tsx` | Ajout `grid.onDblClick` handler |
| tadviewer | `src/components/CellEditModal.tsx` | **Nouveau** composant modale |
| tadviewer | `src/components/GridPane.tsx` | Passer les props d'édition |
| tadviewer | `src/components/AppPane.tsx` | Passer les props d'édition |
| tadviewer | `src/ViewState.ts` | Ajout champ `editingCell` |
| tadviewer | `src/AppState.ts` | Ajout champ `editingCell` |
| tadviewer | `src/actions.ts` | Nouvelles actions : `startCellEdit`, `commitCellEdit`, `cancelCellEdit` |
| reltab | `src/ColumnType.ts` | Utilisation existante des `ColumnKind` pour la validation |

## Étapes

### Étape 1 : Double-clic + CellEditModal (UI de base)
- Ajouter `grid.onDblClick.subscribe()` dans `DataGrid.tsx`
- Créer `<CellEditModal />` avec BlueprintJS `<Dialog>`
- Afficher la valeur courante, un champ de saisie, boutons Save/Cancel
- Gestion de l'ouverture/fermeture via callback

### Étape 2 : Validation du type de colonne
- Mapper `ColumnKind` → règles de validation :
  - `string` : tout accepté
  - `integer` : entier uniquement (regex `^-?\d+$`)
  - `real` : nombre décimal (regex `^-?\d+\.?\d*$`)
  - `boolean` : `true`/`false`/`1`/`0`/`yes`/`no`
  - `date` : format YYYY-MM-DD
  - `timestamp` : format ISO 8601
  - `blob` : non éditable
- Afficher message d'erreur sous le champ si invalide
- Désactiver le bouton Save si invalide

### Étape 3 : State management
- Ajouter `editingCell` dans `ViewState` (via oneref/Immutable.js)
- Créer les actions : `startCellEdit(row, col, value, columnType)`, `commitCellEdit(newValue)`, `cancelCellEdit()`
- Le double-clic déclenche `startCellEdit`
- Save déclenche `commitCellEdit` → met à jour le dataView localement (Phase 1: simulation)
- Cancel déclenche `cancelCellEdit` → ferme la modale

### Étape 4 : Pivot awareness
- Détecter `_isLeaf === false` dans la ligne éditée
- Afficher un bandeau d'information : "This is an aggregated value from pivot hierarchy"
- Désactiver le bouton Save pour les lignes d'agrégat
- Pour les lignes feuille sous un pivot : afficher un avertissement que la modification simulée ne propage pas (Phase 1)

### Étape 5 : Build et E2E
- `cd packages/tadviewer && npx webpack --mode production`
- `cd packages/tad-app && npm run build-assets && npx webpack --mode production`
- Test local avec `./run.sh`
- Vérifier : double-clic, validation type, pivot, cancel, save (simulation)
