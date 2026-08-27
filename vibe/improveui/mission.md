# MISSION : UI IMPROVEMENTS

Améliorer l'interface utilisateur de MTad avec des fonctionnalités de manipulation de colonnes/lignes et des options d'export.

### Fonctionnalités à implémenter

#### 1. Context Menu Colonne
- **Supprimer colonne** : `ALTER TABLE ... DROP COLUMN` avec confirmation ("Yes"/"Cancel")
- **Dupliquer colonne** : `ALTER TABLE ... ADD COLUMN new_col AS old_col` avec nom éditable (suffixe `_2` par défaut)

#### 2. Context Menu Ligne
- **Supprimer ligne** : `DELETE FROM ... WHERE` avec confirmation
- **Dupliquer ligne** : `INSERT INTO ... SELECT * FROM ... WHERE` pour copier une ligne

#### 3. Context Menu Lignes Agrégées
- **Supprimer toutes les lignes agrégées** : `DELETE FROM ... WHERE` pour toutes les lignes du groupe
- **Dupliquer toutes les lignes agrégées** : `INSERT INTO ... SELECT * FROM ... WHERE` pour toutes les lignes du groupe

#### 4. Export Interface
- **Checkbox "Visible columns only"** : Exporter uniquement les colonnes avec `show` cochée (défaut: true)
- **Checkbox "Column order"** : Exporter dans l'ordre affiché (défaut: true)

### Contraintes techniques
- Backend: DuckDB via `execSql()` pour toutes les opérations DDL/DML
- Validation: `DataSourceConnection` interface + `DbDataSource` impl + remote transport
- UI: BlueprintJS Dialog pour confirmations et saisie de nom
- Refresh: Re-fetch schema et data après chaque opération
- Commit: Un commit par étape, message conventionnel `feat(tadviewer): ...` ou `feat(reltab): ...`

### Étapes
1. Backend: Ajouter méthodes à DataSourceConnection
2. Context Menu Colonne: Delete & Duplicate
3. Context Menu Ligne: Delete & Duplicate
4. Context Menu Lignes Agrégées: Delete all & Duplicate all
5. Export Interface: Options de colonnes visibles et ordre
