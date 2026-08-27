# ÉTAPE 7 : Build & E2E Testing

## Objectif
Build complet et tests E2E de toutes les fonctionnalités ajoutées.

## Checklist de test

### Context Menu Colonne
- [ ] Right-click header → Rename fonctionne
- [ ] Right-click header → Delete → confirmation s'affiche → Yes supprime
- [ ] Right-click header → Delete → Cancel ne fait rien
- [ ] Right-click header → Duplicate → dialogue nom s'affiche → Save duplique
- [ ] Duplicate avec nom existant → erreur
- [ ] Colonnes système (_, _id, _parentId, Rec) → pas de menu

### Context Menu Cellules
- [ ] Single cell → right-click → Edit fonctionne
- [ ] Select range → right-click → Delete Rows → confirmation → supprime
- [ ] Select range → right-click → Duplicate Rows → duplique
- [ ] Select range → right-click → Copy (cells) → paste → TSV cellules
- [ ] Select range → right-click → Copy (rows) → paste → TSV colonnes visibles avec header

### Context Menu Lignes Agrégées
- [ ] Aggregate row → right-click → Edit all fonctionne
- [ ] Aggregate row → right-click → Delete All → confirmation → supprime
- [ ] Aggregate row → right-click → Duplicate All → duplique
- [ ] Leaf row → les items aggregate ne sont PAS affichés

### Export
- [ ] Export dialog affiche les 2 checkboxes
- [ ] Visible only coché → exporte colonnes visibles uniquement
- [ ] Visible only décoché → exporte toutes les colonnes
- [ ] Column order coché → colonnes dans l'ordre affiché
- [ ] Column order décoché → colonnes dans l'ordre source

## Build commands
```bash
# reltab
cd packages/reltab && npx tsc -p tsconfig-build.json

# tadviewer
cd packages/tadviewer && npx webpack --mode production

# tad-app
cd packages/tad-app && npm run build-assets && npx webpack --mode production

# Electron
cd packages/tad-app && npx electron-builder --mac dir --arm64 --publish=never
```

## Validation
- Tous les tests ci-dessus passent
- Pas de régressions sur les fonctionnalités existantes
- Commit: `test: add E2E tests for context menu and export features`
