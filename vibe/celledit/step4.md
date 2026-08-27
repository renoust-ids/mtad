# Étape 4 : Information sur les valeurs pivotées

## Objectif
Améliorer la modale pour gérer spécifiquement le cas des lignes pivotées/agrégées :
- Les lignes d'agrégat (`_isLeaf === false`) ne sont pas éditables → message informatif + Save désactivé
- Les lignes feuille sous un pivot → avertissement que la modification ne propage pas (Phase 1)
- Distinguer visuellement les deux cas

## 4.1 Modifier CellEditModal pour les pivots

**Fichier** : `packages/tadviewer/src/components/CellEditModal.tsx`

Le composant reçoit déjà `isAggregateRow`. Il faut ajouter un props `isPivotedView: boolean` (true si des vpivots sont actifs) pour afficher un avertissement contextuel.

```typescript
interface CellEditModalProps {
  // ... existant ...
  isPivotedView: boolean; // true si des colonnes de pivot sont actives
}

// Dans le JSX, avant le champ de saisie :
{isAggregateRow ? (
  <div className="bp4-callout bp4-intent-warning" style={{ marginBottom: 12 }}>
    <strong>Aggregated value</strong>
    <p>
      This value is computed from an aggregation (e.g., sum, count) over
      underlying records. Editing is not available for aggregated rows.
    </p>
  </div>
) : isPivotedView ? (
  <div className="bp4-callout bp4-intent-primary" style={{ marginBottom: 12 }}>
    <strong>Pivoted view active</strong>
    <p>
      You are editing a leaf value in a pivoted view. In read-only mode, this
      change is simulated and will not propagate to the underlying data source.
    </p>
  </div>
) : null}
```

## 4.2 Désactiver l'édition des lignes d'agrégat

Le bouton Save doit être désactivé si `isAggregateRow === true`. C'est déjà fait à l'étape 1, vérifier que c'est bien le cas.

## 4.3 Détecter les pivots actifs dans GridPane

**Fichier** : `packages/tadviewer/src/components/GridPane.tsx`

```typescript
const isPivotedView = viewParams.vpivots.length > 0;

// Passer à CellEditModal :
<CellEditModal
  isPivotedView={isPivotedView}
  // ... autres props
/>
```

## 4.4 Exclure les colonnes système

Vérifier que dans `DataGrid.tsx`, le gestionnaire double-clic exclut bien :
- `_pivot` (colonne d'arbre)
- `_id`, `_parentId` (colonnes SlickGrid internes)
- `_depth`, `_isOpen`, `_isLeaf`, `_pathN` (métadonnées de ligne)

Ces colonnes ne doivent jamais déclencher l'ouverture de la modale.

## Instructions de test
1. Build complet
2. Ouvrir un CSV **sans pivot** → double-cliquer sur une cellule → pas d'avertissement pivot
3. Ajouter un pivot (ex: par une colonne) → double-cliquer sur une ligne feuille → affiche l'avertissement "Pivoted view active"
4. Double-cliquer sur une ligne d'agrégat (ligne parent dans l'arbre) → affiche "Aggregated value" + Save désactivé
5. Vérifier que `_pivot`, `_id`, `_parentId` ne déclenchent rien au double-clic

## Validation
Commit : `feat(tadviewer): add pivot awareness to CellEditModal`
