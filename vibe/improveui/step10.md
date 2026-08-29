# ÉTAPE 10 : Insert Row/Column, hover en bordures, right-click sur sélection multi-cellules

## Objectif
Trois features demandées par l'utilisateur :
1. **Insérer** une nouvelle ligne vide ou une nouvelle colonne vide au clic droit.
2. **Hover** : remplacer le fill bleu par une **bordure épaisse bleu foncé `#5a6375`** (même style que la sélection).
3. **Right-click** : si la cellule survolée appartient déjà à la sélection, **ne pas** réduire la sélection à une cellule (menu agit sur tout le groupe).

---

## 1. Insert Row / Insert Column

### Backend (reltab)
- `DataSourceConnection.insertRow(tableName)` → `INSERT INTO "t" DEFAULT VALUES` (ligne entièrement NULL).
- `DataSourceConnection.insertColumn(tableName, columnName)` → `ALTER TABLE "t" ADD COLUMN "c" VARCHAR` + invalidation du cache de schéma.
- Transport remote : types de requête + méthodes `RemoteDataSourceConnection` + handlers serveur `DataSourceConnection.insertRow` / `insertColumn`.
- Test unitaire `test/dataSourceMutations.test.ts` (mock DbDriver).

### UI (tadviewer)
- Menu **cellule** (clic droit) : nouvel item **Insert Row** → append une ligne vide.
- Menu **en-tête de colonne** (clic droit) : nouvel item **Insert Column** → dialog Blueprint nom (suggestion auto-unique `{col}_new`, `new_column`, `new_column_2`, …) → add colonne vide.

### Validation (DuckDB réelle)
Table `t(a, b)` → `insertRow` puis `insertColumn("new_col")` :
```
rows: [{"a":1,"b":"x","new_col":null},{"a":null,"b":null,"new_col":null}]
columns: ["a","b","new_col"]
```

---

## 2. Hover : bordure au lieu de fill

`packages/tadviewer/src/slickgrid.scss` :
```scss
.slickcell:hover, .slick-row.* .slick-cell:hover {
  background-color: transparent;
  box-shadow: inset 0 0 0 2px #5a6375;
}
.slick-cell:hover.selected { box-shadow: inset 0 0 0 2px #5a6375; }
```
- Le `box-shadow` inset évite le décalage de layout (contrairement à un `border-width`).
- Les cellules sélectionnées conservent leur fill tout en affichant la bordure de survol.

---

## 3. Right-click qui préserve la sélection

`DataGrid.tsx` / `onContextMenu` : avant de re-sélectionner, on teste si `(row, cell)` est dans un des ranges `getSelectedRanges()` ; si oui on garde la sélection (et on positionne seulement `setActiveCell`), sinon on réduit à la cellule.

---

## Fichiers modifiés
| Package | Fichier | Modification |
|---------|---------|-------------|
| reltab | `src/DataSource.ts` | `insertRow`, `insertColumn` (interface + DbDataSource) |
| reltab | `src/remote/Connection.ts` | Types de requête + RemoteDataSourceConnection |
| reltab | `src/remote/server.ts` | Handlers + registry |
| reltab | `test/dataSourceMutations.test.ts` | Tests unitaires |
| tadviewer | `src/actions.ts` | `insertRow`, `insertColumn` actions |
| tadviewer | `src/components/GridPane.tsx` | Dialog Insert Column + wiring |
| tadviewer | `src/components/DataGrid.tsx` | Items de menu, props, right-click groupé |
| tadviewer | `src/slickgrid.scss` | Hover bordure `#5a6375` |

## Commits
- `feat(reltab): add insertRow and insertColumn methods` (9c37b9d)
- `feat(tadviewer): add Insert Row and Insert Column context menu actions` (077720f)
- `feat(tadviewer): keep multi-cell selection when right-clicking a selected cell` (49e077b)
- `fix(tadviewer): hover draws thick #5a6375 border instead of fill` (c1ab322)

## Validation
- [x] `packages/reltab` : `tsc` + `npm test` (13 tests)
- [x] `packages/tadviewer` : `tsc` + webpack production
- [x] SQL vérifié sur DuckDB réelle (ligne vide + colonne vide)
- [ ] E2E manuel Electron : Insert Row, Insert Column, hover border, right-click groupe