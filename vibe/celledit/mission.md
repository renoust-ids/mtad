# MISSION : ÉDITION DE CELLULE (Cell Editing)

L'objectif est de permettre à l'utilisateur de modifier la valeur d'une cellule en double-cliquant dessus, via une modale de dialogue, avec validation du type de colonne. **Phase 1 : UI/UX en lecture seule (pas d'écriture dans la source de données).**

### Contraintes fonctionnelles
- **Double-clic** sur une cellule → ouvre une modale avec la valeur courante
- **Validation du type** : la modale vérifie la compatibilité de la saisie avec le `ColumnKind` (string, integer, real, boolean, date, etc.)
- **Colonnes non éditables** : `_pivot` (arbre), `_id`, `_parentId`, et les lignes d'agrégat (`_isLeaf === false`)
- **Lignes Rec** : les numéros de ligne ne sont pas éditables (pas de colonne Rec dédiée, mais les métadonnées de ligne `_depth`, `_isOpen`, etc. sont exclues)
- **Valeurs pivotées** : si une valeur pivotée est modifiée, avertir l'utilisateur que cela affecterait toutes les valeurs agrégées sous-jacentes (information-only en phase 1)
- **Sauvegarde** : en phase 1, la modale affiche "Saved" (simulation) sans écrire dans la source. La logique d'écriture sera ajoutée en phase 2.
- **Annulation** : bouton "Cancel" pour fermer sans modification

### ÉTAPE 1 : Gestion du double-clic et composant CellEditModal
- **Action** : Ajouter un gestionnaire `grid.onDblClick.subscribe(...)` dans `DataGrid.tsx` et créer le composant `<CellEditModal />` avec BlueprintJS `<Dialog>`.
- **Instruction de test** : Build tadviewer, vérifier qu'un double-clic ouvre la modale.
- **Validation** : Commit `feat(tadviewer): add CellEditModal component and double-click handler`.

### ÉTAPE 2 : Validation du type de colonne
- **Action** : Dans la modale, ajouter la validation du type : `integer` → rejeter les floats, `boolean` → Accepter只有 true/false/1/0, `date`/`timestamp` → valider le format, etc.
- **Instruction de test** : Tester avec différents types de colonnes, vérifier les messages d'erreur.
- **Validation** : Commit `feat(tadviewer): add column type validation in CellEditModal`.

### ÉTAPE 3 : Gestion de l'état d'édition dans AppState
- **Action** : Ajouter `editingCell: { row: number; col: number; value: Scalar; columnType: ColumnType } | null` dans `ViewState` ou `AppState`. Câbler le double-clic pour mettre à jour cet état, et la modale pour le lire.
- **Instruction de test** : Vérifier que l'état se propage correctement.
- **Validation** : Commit `feat(tadviewer): add editingCell state to ViewState`.

### ÉTAPE 4 : Information sur les valeurs pivotées
- **Action** : Dans la modale, détecter si la ligne éditée est une ligne agrégat (`_isLeaf === false`) ou une valeur pivotée. Afficher un message informatif : "This is an aggregated/pivoted value. Editing would affect all underlying records." Désactiver le bouton Save pour les lignes agrégat.
- **Instruction de test** : Ouvrir un CSV avec des pivots, double-cliquer sur une ligne agrégat, vérifier le message.
- **Validation** : Commit `feat(tadviewer): add pivot awareness to CellEditModal`.

### ÉTAPE 5 : Build et validation E2E
- **Action** : Rebuild complet, test dans l'app packaged.
- **Instruction de test** : Ouvrir customers.csv, double-cliquer sur une cellule, vérifier la modale, tester les types, tester avec des pivots.
- **Validation** : Commit final et push.
