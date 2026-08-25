# Étape 2 : Validation du type de colonne

## Objectif
Ajouter la validation du type dans la modale : la saisie de l'utilisateur doit être compatible avec le `ColumnKind` de la colonne. Un message d'erreur s'affiche si la valeur n'est pas valide, et le bouton Save est désactivé.

## Contexte technique
- `ColumnKind` est défini dans `packages/reltab/src/ColumnType.ts` : `string | integer | real | boolean | date | time | datetime | timestamp | blob | dialect`
- Le `ColumnType` complet est accessible via `schema.columns[colId].columnType`
- La modale `CellEditModal` reçoit déjà `columnId` — il faut lui transmettre aussi le `ColumnKind`

## 2.1 Créer un module de validation des types

**Fichier** : `packages/tadviewer/src/CellEditValidation.ts` (nouveau)

```typescript
import { ColumnKind } from "reltab";

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCellValue(
  value: string,
  kind: ColumnKind
): ValidationResult {
  if (value.trim() === "" || value.toLowerCase() === "null") {
    return { valid: true }; // null autorisé
  }

  switch (kind) {
    case "string":
    case "dialect":
      return { valid: true };

    case "integer":
      if (/^-?\d+$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be an integer (e.g., 42, -7)" };

    case "real":
      if (/^-?\d+\.?\d*([eE][+-]?\d+)?$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be a number (e.g., 3.14, -2.5)" };

    case "boolean":
      if (/^(true|false|1|0|yes|no)$/i.test(value.trim())) {
        return { valid: true };
      }
      return {
        valid: false,
        error: "Must be true/false, 1/0, or yes/no",
      };

    case "date":
      if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
        const d = new Date(value.trim());
        if (!isNaN(d.getTime())) return { valid: true };
      }
      return { valid: false, error: "Must be YYYY-MM-DD format" };

    case "time":
      if (/^\d{2}:\d{2}(:\d{2})?$/.test(value.trim())) {
        return { valid: true };
      }
      return { valid: false, error: "Must be HH:MM or HH:MM:SS format" };

    case "datetime":
    case "timestamp":
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(value.trim())) {
        return { valid: true };
      }
      return {
        valid: false,
        error: "Must be ISO 8601 format (YYYY-MM-DDTHH:MM:SS)",
      };

    case "blob":
      return { valid: false, error: "BLOB columns are not editable" };

    default:
      return { valid: true };
  }
}
```

## 2.2 Étendre CellEditModalProps avec le ColumnKind

**Fichier** : `packages/tadviewer/src/components/CellEditModal.tsx`

Ajouter une prop `columnKind: ColumnKind` et intégrer la validation :

```typescript
import { validateCellValue } from "../CellEditValidation";

// Dans le composant :
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  if (isOpen) {
    const result = validateCellValue(editValue, columnKind);
    setError(result.valid ? null : result.error ?? null);
  }
}, [editValue, isOpen, columnKind]);

// Dans le JSX, ajouter sous le champ de saisie :
{error && (
  <p className="bp4-text-muted" style={{ color: "#cf4c35", marginTop: 4 }}>
    {error}
  </p>
)}

// Désactiver Save si erreur :
<Button
  intent={Intent.PRIMARY}
  onClick={handleSave}
  disabled={isAggregateRow || error !== null}
>
  Save
</Button>
```

## 2.3 Transmettre le ColumnKind depuis GridPane

**Fichier** : `packages/tadviewer/src/components/GridPane.tsx`

Dans le callback `onCellEditStart`, récupérer le `ColumnKind` depuis le schema :

```typescript
onCellEditStart={(data) => {
  const colType = schema.getColumn(data.columnId);
  setEditingCell({
    ...data,
    columnKind: colType?.columnType?.kind ?? "string",
  });
}}
```

Mettre à jour `CellEditStartData` dans `DataGrid.tsx` pour inclure `columnKind`.

## Instructions de test
1. Build tadviewer + tad-app
2. Ouvrir un CSV avec des colonnes de types variés
3. Double-cliquer sur une colonne `integer` → saisir "abc" → erreur s'affiche, Save désactivé
4. Saisir "42" → erreur disparaît, Save activé
5. Double-cliquer sur une colonne `boolean` → saisir "maybe" → erreur
6. Tester `date`, `real`, `string` (pas d'erreur possible)

## Validation
Commit : `feat(tadviewer): add column type validation in CellEditModal`
