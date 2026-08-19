# STATE_HANDOFF.md — Après Étape 2

## Branche active
`joincsv`

## Dernier état (pas encore commité)
Pas de commit Étape 2 encore — tous les fichiers sont en working tree.

## Fichiers clés créés/modifiés

### Étape 1 (reltab — déjà fait)
- `packages/reltab/src/QueryRep.ts` — `CsvJoinType`, `JoinCsvArgs`, `JoinCsvQueryRep`
- `packages/reltab/src/QueryExp.ts` — méthode `joinCsv()`
- `packages/reltab/src/SQLQuery.ts` — `SQLFromCsvJoin`
- `packages/reltab/src/toSql.ts` — `joinCsvQueryToSql()`
- `packages/reltab/src/getSchema.ts` — `joinCsvGetSchema()`
- `packages/reltab/src/pp.ts` — handler `csvJoin`
- `packages/reltab/src/reltab.ts` — exports publics
- `packages/reltab/test/joinCsv.test.ts` — 9 tests unitaires

### Étape 2 (Electron — nouvellement fait)
- `packages/tad-app/app/appMenu.ts` — Ajout menu "Join CSV..." (`CmdOrCtrl+J`) envoie `start-csv-join`
- `packages/tad-app/app/main.ts` — Ajout `ipcMain.handle('dialog:selectCsvForJoin')` avec `dialog.showOpenDialog`

## Types/signatures importants (reltab)

```typescript
type CsvJoinType = "inner" | "left" | "right" | "outer";
interface JoinCsvArgs { rightTablePath, joinType, leftCol, rightCol, forceStringCast, nullString? }
interface JoinCsvQueryRep { operator: "joinCsv", args: JoinCsvArgs, rhsSchema: ColumnMetaMap, rhsColumns: string[], from: QueryRep }
// Méthode: joinCsv(args, rhsSchema, rhsColumns): QueryExp
```

## IPC新增 (tad-app)
- **Menu → Renderer**: `start-csv-join` (via `webContents.send`)
- **Renderer → Main**: `dialog:selectCsvForJoin` (via `ipcMain.handle`) → retourne `string | null`

## Architecture reltab (à retenir)
- `QueryExp` wrapper autour de `QueryRep` (union discriminée par `operator`)
- `toSql.ts` traduit `QueryRep` → `SQLQueryAST`
- `pp.ts` rend `SQLQueryAST` → string SQL
- `getSchema.ts` calcule le schéma depuis `QueryRep` + `LeafSchemaMap`

## Résultats tests
- reltab: 11/11 PASS (9 new + 2 existing)
- reltab TypeScript build: OK
- reltab-duckdb: tests écrits mais bloqués (pas de binary native DuckDB pour Node v26.7.0)
- tad-app: aucune erreur TS introduite (erreurs préexistantes uniquement)

## Objectif étape 3
Dans `packages/tadviewer` :
1. Créer composant `<JoinCsvDialog />` (BlueprintJS `<Dialog>`)
2. Écouter événement `start-csv-join` (IPC renderer)
3. Déclencher `ipcRenderer.invoke('dialog:selectCsvForJoin')` pour choisir le fichier
4. Lire les headers du CSV sélectionné (IPC pour lister les colonnes)
5. Capturer : colonnes de jointure, type de jointure, options de robustesse
6. Commit: `feat(tadviewer): add JoinCsvDialog React component`
