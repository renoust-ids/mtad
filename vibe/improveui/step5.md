# ÉTAPE 5 : Export Interface - Options de colonnes

## Objectif
Ajouter des options d'export dans le dialogue d'export CSV/Parquet pour filtrer les colonnes visibles et respecter l'ordre d'affichage.

## Fonctionnalités

### Checkbox: Visible Columns Only
- **Label**: "Export visible columns only"
- **Défaut**: `true` (coché)
- **Comportement**: 
  - Si coché: Exporte uniquement les colonnes dans `viewParams.displayColumns`
  - Si décoché: Exporte toutes les colonnes du schéma
- **Implémentation**: Filtrer les colonnes avant export

### Checkbox: Column Order
- **Label**: "Export in displayed column order"
- **Défaut**: `true` (coché)
- **Comportement**:
  - Si coché: Utilise l'ordre de `viewParams.displayColumns`
  - Si décoché: Utilise l'ordre naturel du schéma (ou ordre alphabétique)
- **Implémentation**: Trier les colonnes selon l'option

## UI dans ExportBeginDialog
```tsx
<FormGroup label="Export Options">
  <Checkbox checked={exportVisibleOnly} onChange={...}>
    Export visible columns only
  </Checkbox>
  <Checkbox checked={exportColumnOrder} onChange={...}>
    Export in displayed column order
  </Checkbox>
</FormGroup>
```

## AppState modifications
```typescript
interface AppStateProps {
  // ... existing
  exportVisibleOnly: boolean;  // défaut: true
  exportColumnOrder: boolean;  // défaut: true
}
```

## Export flow
1. L'utilisateur coche/décoche les options
2. Au clic "Export", les options sont passées au handler
3. Le handler filtre les colonnes selon `exportVisibleOnly`
4. Le handler trie les colonnes selon `exportColumnOrder`
5. L'export se fait avec les colonnes filtrées/triées

## Fichiers à modifier
1. `packages/tadviewer/src/AppState.ts` - Nouveaux champs exportVisibleOnly, exportColumnOrder
2. `packages/tadviewer/src/actions.ts` - Actions setExportVisibleOnly, setExportColumnOrder
3. `packages/tadviewer/src/components/AppPane.tsx` - Checkboxes dans ExportBeginDialog
4. `packages/tad-app/app/fileExport.ts` - Utiliser les options pour filtrer/trier les colonnes

## Validation
- Build tadviewer: `cd packages/tadviewer && npx webpack --mode production`
- Build tad-app: `cd packages/tad-app && npm run build-assets && npx webpack --mode production`
- Test: Export avec/dans sans les options
- Vérifier: Colonnes exportées correspondent aux options sélectionnées
- Commit: `feat(tadviewer): add column visibility and order options to export`
