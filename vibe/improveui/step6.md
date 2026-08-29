# ÉTAPE 6 : Export Interface - Options de colonnes

## Objectif
Ajouter des options d'export dans le dialogue d'export pour filtrer les colonnes visibles et respecter l'ordre d'affichage.

## Fonctionnalités

### Checkbox: Visible Columns Only
- **Label**: "Export visible columns only"
- **Défaut**: `true` (coché)
- **Comportement**: 
  - Si coché: Exporte uniquement les colonnes dans `viewParams.displayColumns`
  - Si décoché: Exporte toutes les colonnes du schéma

### Checkbox: Column Order
- **Label**: "Export in displayed column order"
- **Défaut**: `true` (coché)
- **Comportement**:
  - Si coché: Utilise l'ordre de `viewParams.displayColumns`
  - Si décoché: Utilise l'ordre du schéma source (ou alphabétique)

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

## AppState
```typescript
exportVisibleOnly: boolean;  // défaut: true
exportColumnOrder: boolean;  // défaut: true
```

## Export flow
1. Options passées au handler d'export via IPC
2. CSV export: Filtrer/trier les colonnes avant écriture
3. Parquet export: Utiliser SELECT avec colonnes filtrées dans la COPY query

## Fichiers à modifier
1. `packages/tadviewer/src/AppState.ts`
2. `packages/tadviewer/src/actions.ts`
3. `packages/tadviewer/src/components/AppPane.tsx`
4. `packages/tad-app/app/fileExport.ts`

## Validation
- Build tadviewer + tad-app
- Test: Export CSV avec/dans sans options
- Vérifier: Colonnes exportées correspondent aux options
- Commit: `feat(tadviewer): add column visibility and order options to export`
