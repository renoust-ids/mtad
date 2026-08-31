# SPEC — Scatter Plot Matrix (SPLOM) interactif

> Statut : **spec** — à valider par l'utilisateur avant implémentation.
> Branche cible : `feat/splom`.
> Package concernés : `reltab` (backend), `tadviewer` (UI), `tad-app` (menu Analytics + IPC).

## 1. Vue d'ensemble

Un dialog **Scatter Plot Matrix (SPLOM)** ouvre un explorateur 2D multi-colonnes :

- **Matrice N×N** des colonnes sélectionnées (axes = lignes/colonnes de la grille).
- **Diagonale** : mini-distribution d'une colonne (histogramme binné client-side pour numeric/temporal, bar chart catégoriel pour string/boolean). Un clic ouvre le dialog **Distribution** existant pour cette colonne.
- **Hors-diagonale (i,j)** : scatter plot de la colonne `i` (axe X) vs colonne `j` (axe Y), points échantillonnés, colorés par une colonne catégorielle optionnelle, avec annotation de corrélation de Pearson (r) pour les paires numériques.
- **Master-detail** : un clic sur une cellule hors-diagonale agrandit la paire dans un grand panneau avec axes lisibles, échelles log par axe, **brush rectangulaire 2D → filtre**, tooltips, trend line (régression linéaire), stats de la paire.

Le SPLOM est **composé sur la même requête que la vue** : sur une vue pivotée, la matrice est calculée sur la requête agrégée ; sur une vue plate, sur la requête de base (optionnellement filtrée par les **table filters** via le switch "Apply Table Filters", à l'exclusion volontaire des analytics filters — même logique que Distribution).

---

## 2. Modèle de données (backend reltab)

Nouveau module `packages/reltab/src/splom.ts`, exporté par le barrel `reltab.ts`.

### 2.1 Types

```ts
// Une colonne de la matrice : soit numérique, soit temporelle (convertie en epoch),
// soit catégorielle (axe discret + barres).
export type SplomColKind = "numeric" | "temporal" | "categorical";

// Point de scatter : valeurs par colonne matricielle + valeur de la colonne de couleur.
export interface ScatterPoint {
  // clé = id de colonne matricielle (d'origine), valeur = nombre (epoch pour temporelles) | null
  [colId: string]: number | string | boolean | null;
}

export interface ScatterPlotData {
  colIds: string[];                 // colonnes de la matrice, dans l'ordre
  colKinds: SplomColKind[];         // kind associé à chaque colonne
  points: ScatterPoint[];           // lignes échantillonnées
  sampled: boolean;                 // true si downsampling actif
  totalRows: number;                // rowCount de la requête de base
  colorColId?: string | null;       // colonne de couleur (si activée)
}

// Corrélation d'une paire (triangle supérieur, paires numériques×numériques).
export interface PairCorrelation {
  xColId: string;
  yColId: string;
  r: number | null;                 // null si corr() est NULL (constante / données insuffisantes)
  n: number;                        // count(*) des lignes où x ET y non nuls
}

// Régression linéaire d'une paire (pour la trend line du master-detail).
export interface PairRegression {
  xColId: string;
  yColId: string;
  slope: number | null;
  intercept: number | null;
  r2: number | null;
  n: number;
}

export interface ScatterPlotOptions {
  matrixColIds: string[];
  colorColId?: string | null;
  sampleLimit?: number;             // 0 / undefined => pas d'échantillonnage
  randomSample?: boolean;           // défaut true : ORDER BY random() LIMIT n
}
```

### 2.2 Helper de classification

```ts
export const splomColKind = (ct: ColumnType): SplomColKind =>
  kindIsNumeric(ct.kind) ? "numeric"
  : isTemporal(ct)       ? "temporal"
  :                        "categorical";
```

`kindIsNumeric`/`isTemporal` sont exportés par `ColumnType.ts` (`colIsNumeric`, `isTemporal`). Vérifier les exports.

### 2.3 Requête des données scatter

```ts
// Construit la requête projetant les colonnes de la matrice (+ la colonne de couleur).
// Les colonnes temporelles sont converties en epoch-secondes via une colonne dérivée
// "__splom_<cid>" (pattern temporalValueQuery). Retourne aussi le mapping
// colonne dérivée -> id d'origine.
export function splomScatterQuery(
  baseQuery: QueryExp,
  schema: Schema,
  matrixColIds: string[],
  colorColId?: string | null
): { query: QueryExp; derivedNames: Record<string, string> };
```

- Numériques : projetées telles quelles (`project([...])`).
- Temporelles : `baseQuery.extend("__splom_<cid>", epoch(col(cid)))` puis projection de `__splom_<cid>`.
- Catégorielles : projetées telles quelles (valeurs `string|boolean|null`), utilisées pour les axes discrets et le jitter.

### 2.4 Chargement des points (échantillonnage)

```ts
export async function getScatterPlotData(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  opts: ScatterPlotOptions
): Promise<ScatterPlotData>;
```

1. `totalRows = await dsConn.rowCount(baseQuery)`.
2. Si `sampleLimit > 0` :
   - **randomSample (défaut)** : on récupère le SQL de la requête scatter (`const sql = await dsConn.getSqlForQuery(query)`), on l'enveloppe dans `SELECT * FROM ( <sql> ) ORDER BY random() LIMIT <sampleLimit>` et on l'exécute via le leaf `sqlQuery(...)` + `dsConn.evalQuery`.
   - sinon : `dsConn.evalQuery(query, 0, sampleLimit)` (requête existante, LIMIT seulement).
3. Mapping rows → `ScatterPoint[]`. Les valeurs `bigint` sont converties en `Number` (cellules BigInt), `null` conservé.

> **Note SQL brut** : `sqlQuery(sql)` est un leaf existant (`QueryExp.ts:355`) résolu par `DbDataSource.getLeafDepSchema` (`case "sql"` → `db.getSqlQuerySchema`). reltab-duckdb implémente `getSqlQuerySchema` via `describe <sql>`. Le wrap `SELECT * FROM (...) ORDER BY random() LIMIT n` doit être validé par un test d'intégration (describe + all). Fallback si problème : `ORDER BY random()` via une colonne dérivée `__rnd = random()` … (ne pas sur-ingénierer : valider en step 1).

### 2.5 Matrice de corrélation (SQL, par paire)

```ts
// SQL UNION ALL d'une requête # source, avec CTE MATERIALIZED pour un seul scan.
// Paires = triangle supérieur des colonnes numériques×numériques uniquement.
export function pairwiseCorrelationSql(
  baseSql: string,
  pairs: Array<[xColId: string, yColId: string]>
): string;

export async function getCorrelationMatrix(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  matrixColIds: string[]
): Promise<PairCorrelation[]>;
```

Forme du SQL généré :

```sql
WITH __splom_src AS MATERIALIZED (
  <baseSql>
)
SELECT 'a' AS __x, 'b' AS __y,
       corr("a", "b") AS __r,
       regr_count("a", "b") AS __n
FROM __splom_src
UNION ALL
SELECT 'a', 'c', corr("a", "c"), regr_count("a", "c")
FROM __splom_src
UNION ALL
...
```

- Exécution : `baseSql = await dsConn.getSqlForQuery(query)` puis `dsConn.evalQuery(sqlQuery(corrSql))`.
- Brainage identifiants : utiliser le quoting du dialect (réutiliser le mécanisme d'échappement existant, cf. `sqlEscapeString`/quoting de `toSql`).
- Mapping : une ligne par paire → `PairCorrelation`. `__r` peut être `null` (colonne constante, n < 2) → `r: null`, l'UI affiche "n/a".
- `regr_count` = nombre de paires non nulles (n pour l'affichage).

### 2.6 Régression (trend line du master-detail)

```ts
export async function getPairRegression(
  dsConn: DataSourceConnection,
  baseQuery: QueryExp,
  schema: Schema,
  xColId: string,
  yColId: string
): Promise<PairRegression>;
```

Via un leaf `sqlQuery` de la forme :

```sql
SELECT corr("x", "y") AS __r,
       regr_slope("y", "x") AS __slope,
       regr_intercept("y", "x") AS __intercept,
       regr_r2("y", "x") AS __r2,
       regr_count("y", "x") AS __n
FROM ( <baseSql> ) __s
WHERE "x" IS NOT NULL AND "y" IS NOT NULL
```

> DuckDB : ordre des arguments `regr_slope(y, x)` (pente de y sur x). Vérifier signatures dans un test d'intégration reltab-duckdb. `corr(x,y)` est symétrique.

### 2.7 Réutilisation existante

- **Comptage des catégories de la colonne de couleur** (légende/min-occurrence) : réutiliser `reltab.getColumnFrequencyData(dsConn, baseQuery, colorColId)` → `CategoricalDistributionData` (existe déjà, `histogram.ts:324`).
- **Stats par colonne** (tags du master-detail) : `dsConn.getColumnStatsMap(query)` / `getTemporalColumnNumericStats` (existant).

---

## 3. Actions tadviewer

### 3.1 État (AppState.ts)

```ts
splomDialogOpen: boolean;       // false par défaut (defaultAppStateProps)
```

Sélection des colonnes / options = état local du dialog (composant), ouvert depuis le menu Analytics. Nécessaire seulement `splomDialogOpen` dans AppState (pattern `histogramDialogColId`, mais pas de colonne cible : le SPLOM ne nécessite pas de colonne de départ).

### 3.2 Actions (actions.ts)

```ts
export const openSplom = (stateRef: StateRef<AppState>) => void;   // set splomDialogOpen = true
export const closeSplom = (stateRef: StateRef<AppState>) => void;  // set false

// Charge les données SPLOM (points + corrélation + fréquences de couleur).
export async function loadSplomData(
  dbc: DataSourceConnection,
  query: reltab.QueryExp,
  schema: reltab.Schema,
  opts: reltab.ScatterPlotOptions
): Promise<SplomViewData>;

// SplomViewData (local tadviewer) = reltab.ScatterPlotData
//   + correlations: reltab.PairCorrelation[]
//   + colorFreqs?: reltab.CategoricalDistributionData | null

// Applique un filtre analytics 2D (brush rectangulaire).
export const setSplomBrushFilter = (
  xColId: string, xRange: [number, number],
  yColId: string, yRange: [number, number],
  stateRef: StateRef<AppState>
) => void;
```

`setSplomBrushFilter` :
- Nettoie les clauses existantes portant sur `xColId` ET `yColId` dans `analyticsFilterExp` (réutiliser `filterExpWithoutCol` à deux reprises).
- Construit `fe = baseFE.ge(col(x), cx0).le(col(x), cx1).ge(col(y), cy0).le(col(y), cy1)`.
- Colonnes temporelles : convertir les bornes epoch en littéral typé (réutiliser `epochToTemporalString`).
- Écrit dans `viewParams.analyticsFilterExp` (pattern exact de `setHistogramBrushFilter`).

Le filtre est ensuite "Apply Analytics Filters" via le footer existant (aucune autre modification).

**Réf. distances** : reload du SPLOM quand `analyticsFilterExp` change ? Non : comme Distribution, on ne re-rend JAMAIS sur les analytics filters (auto-référentiel). La flèche : SPLOM → filtre → grid. Si l'utilisateur re-ouvre le SPLOM, le filtre analytics s'applique via table filter seulement si "Apply Table Filters" ; on garde l'exclusion analytics.

---

## 4. UI — SplomDialog.tsx

Nouveau fichier `packages/tadviewer/src/components/SplomDialog.tsx`.

### 4.1 Props

```ts
export interface SplomDialogProps {
  appState: AppState;
  stateRef: StateRef<AppState>;
  onClose: () => void;
  onBrushFilter: (xCol: string, xRange: [number, number],
                  yCol: string, yRange: [number, number]) => void;
  onOpenDistribution: (colId: string) => void;
}
```

Rendu dans `GridPane.tsx` à côté de `<HistogramDialog>` :

```tsx
<SplomDialog
  appState={appState}
  stateRef={stateRef}
  onClose={actions.closeSplom}
  onBrushFilter={handleSplomBrushFilter}      // → actions.setSplomBrushFilter
  onOpenDistribution={handleSelectHistogramColumn}  // réutilise openColumnHistogram
/>
```

### 4.2 Sélection des colonnes (manuelle)

- **HTMLSelect / listes de checkboxes** (Bluepring `Checkbox`), toutes les colonnes non-métadonnées (`!cid.startsWith("_") && cid !== "Rec"`), groupées par type :
  - Section "Numériques & temporelles" (recommandées pour la matrice).
  - Section "Catégorielles" (permises dans la matrice ET comme canal de couleur).
- Ordre d'affichage = ordre de sélection (réordonnable en cliquant — approach simple : l'ordre de la liste du schéma, documenté).
- Sélection initiale : **vide**. Au premier rendu, la matrice affiche un message d'invite "Select at least 2 numeric or temporal columns" et le bouton des options. L'utilisateur coche manuellement les colonnes souhaitées.
- **Color by** : `<HTMLSelect>` "None" ou une colonne (typiquement catégorielle). Les fréquences viennent de `getColumnFrequencyData` ; le **seuil minimal d'occurrences** ("Min freq", défaut 2% du total, pattern exact de `HistogramDialog.minOccFor`) masque dans la légende les catégories rares → regroupées en "Other" (gris).
- **Sampling** : `<Slider>` "Sample" de 500 à 20 000 (défaut 5 000) + `Switch` "Use all rows" (désactive l'échantillonnage).
- **Apply Table Filters** : `<Switch>` (défaut on) — comme Distribution.
- **Nombre de colonnes** : afficher `N×N` résultant.

### 4.3 Rendu de la matrice

Structure DOM : grille CSS (flex/grid) `N×N` de cellules carrées ~170–210 px, scrollable, dialog `resize: both`.

- **En-têtes** : libellés de colonnes (rotés 45° en x) = `schema.displayName(cid)`.
- **Diagonale (i,i)** :
  - numeric/temporal : mini-histogramme 10 bins calculé **client-side** depuis `ScatterPlotData.points` (pas de requête supplémentaire) ; axe des bornes (min/max), étiquette epoch formatée (`fmtX`).
  - catégorielle : mini bar chart des 5–10 catégories les plus fréquentes (client-side), "(null)" agrégé en dernier.
  - Interaction : clic → `onOpenDistribution(colId)` ; tooltip "Open Distribution".
- **Hors-diagonale (i,j)** :
  - axes X = col i, Y = col j. Domaines = min/max des données (padding 5%), temporelles en epoch puis labels formatés.
  - Points filtrés pairwise (suppriment les null de l'un des deux axes).
  - Couleur : si color by actif → palette catégorielle (≈10 couleurs, style Blueprint/`#A3D5FF`-compatibles) + légende ; sinon couleur unique `#A3D5FF` (cohérent avec Distribution) en alpha raisonnable pour l'overdraw.
  - **Corrélation** : coin supérieur-gauche `r = 0.83` (2 décimales, `round2`), fond de la cellule teinté par r (échelle rouge↔gris↔bleu, cf. section 4.5) pour le triangle supérieur ; "n/a" pour paires non calculables (catégorielle impliquée ou r null).
  - **Hover** : tooltip overlay `x: <val>`, `y: <val>` (± `color: <cat>`) — réutiliser le pattern `HoverInfo`/`renderChartWrap`.
  - Clic sur la cellule → **master-detail**.

Rendu des scatters : `VictoryChart` + `VictoryScatter` (léger, pas de brush dans les cellules). Pour éviter N² reseau de requêtes, toutes les données viennent des `ScatterPlotData.points` déjà chargés ; chaque cellule dérive ses `{x, y, color}` par un `useMemo`.

### 4.4 Master-detail (grand panneau)

Ouvert via un clic sur une cellule hors-diagonale. Affiché soit :
- dans le même dialog (remplace la matrice, bouton "← Back to matrix" + titre de la paire), *ou*
- en second `<Dialog>` Blueprint superposé (recommandé : conserve le contexte).

Contenu :
- `VictoryChart` grand (hauteur ~420 px) : `VictoryScatter` des points de la paire (même sample et même couleur que la matrice).
- **Échelles log** : `Switch` Log X / Log Y (points > 0 uniquement pour l'axe log ; les points hors domaine sont exclus de l'axe).
- **Brush rectangulaire 2D** : overlay custom (div absolu superposé au graphe : `onMouseDown`/`onMouseMove`/`onMouseUp`), mapping pixel→data via les domaines (victory `scale`), dessin du rectangle semi-transparent, `onMouseUp` → `onBrushFilter(xCol, [x0,x1], yCol, [y0,y1])`.
  - *Pourquoi un overlay custom* : VictoryBrushContainer ne gère que le brush 1D (dimension x). Le brush 2D est un petit composant local `RectBrushOverlay`.
  - Le filtre est appliqué **au relâchement** (pattern `onBrushDomainChangeEnd`).
  - Au survol pendant le drag : afficher les bornes en cours (tooltip).
- **Trend line** : droite y = intercept + slope·x issue de `getPairRegression` (dessinée via `LineSegment`/`VictoryLine` à 2 points) ; label `y = m·x + b` + `r² = …`.
- **Stats de la paire** : Tags `n` (points tracés), `r`, `slope`, `intercept`, `r²`, `min/max x` et `min/max y` (pattern `renderStatsPanel` de Distribution).
- **Tooltip hover** : même pattern HoverInfo.

### 4.5 Échelle de corrélation (couleur)

Fonction utilitaire locale (exportée pour tests éventuels) :

```ts
const rColor = (r: number): string => {
  // r ∈ [-1, 1] (0 → blanc/gris) : interpolation linéaire
  // r < 0 : rouge (#F28B82 → #8A9BA8)
  // r > 0 : bleu (#A3D5FF → …) ; utilise la même palette que le reste de l'UI
};
```

Légende du gradient `-1 ↔ 0 ↔ +1` affichée au bas du dialog.

- **États loading / vide / erreur**
  - `Spinner` pendant le chargement ; `error` → ligne rouge (`bp4-intent-danger`) ; données vides → "No data for this column pair."
  - Matrice vide (aucune colonne sélectionnée) → message d'invite "Select at least 2 numeric or temporal columns".
  - Moins de 2 colonnes numériques/temporelles → message d'invite "Select at least 2 numeric or temporal columns" (les colonnes catégorielles seules ne suffisent pas : une paire catégorielle×catégorielle n'a pas de scatter corrélé — elles servent de couleur).

---

## 5. Wiring menu Analytics + IPC (tad-app)

### `appMenu.ts` (analyticsSubmenu, ~ligne 135)

```ts
const analyticsSubmenu: MenuItemConstructorOptions[] = [
  { label: "Distribution", click: ... },   // existant
  { label: "Scatter Plot Matrix", click: (item, focusedWindow) => {
      focusedWindow?.webContents.send("open-splom");
  }},
];
```

Libellé : **"Scatter Plot Matrix"** (dialog titré "Scatter Plot Matrix (SPLOM)").

### `electronRenderMain.tsx` (~ligne 260)

```ts
ipcRenderer.on("open-splom", () => {
  actions.openSplom(stateRef);
});
```

---

## 6. Interactions — synthèse

| # | Interaction | Où | Action / implémentation |
|---|-------------|----|-------------------------|
| 1 | Clic cellule hors-diagonale → master-detail | matrice | état local `activePair` |
| 2 | Brush rectangulaire 2D → filtre analytics | master-detail | `setSplomBrushFilter` → `analyticsFilterExp` (footer "Analytics Filters", toggle Apply) |
| 3 | Clic diagonale → Distribution | matrice | `actions.openColumnHistogram(colId)` (existant) |
| 4 | Hover tooltips (x, y, cat) | matrice + master | pattern HoverInfo |
| 5 | Corrélation r (texte + fond) | matrice (triangle + coins) | `getCorrelationMatrix` (SQL) |
| 6 | Colorer par colonne catégorielle | matrice + master | `getColumnFrequencyData` + palette + légende + "Other" |
| 7 | Échelle log X/Y par paire | master-detail | switches locaux |
| 8 | Échantillonnage (slider + "Use all") | options | `getScatterPlotData(sampleLimit)` (ORDER BY random() LIMIT n) |
| 9 | Apply Table Filters | options | même logique que Distribution (exclut analytics filters) |
| 10 | Trend line linéaire | master-detail | `getPairRegression` (regr_slope/intercept/r2) |

---

## 7. Performance & limites

- **N max** = 10 colonnes matricielles (sinon N² cellules ingérable). Message si dépassé.
- Le **sample** par défaut (5 000 points) borne le coût de rendu. La corrélation reste calculée **sur toutes les lignes** (SQL) — indépendante de l'échantillon.
- **Une seule requête de points** pour toute la matrice + **une seule requête de corrélation** (UNION ALL + CTE MATERIALIZED ⇒ un scan de la source) + 1 requête par paire de régression (à l'ouverture du master-detail uniquement).
- BigInt → `Number(...)` à la conversion des rows (pattern existant `rowCount`).
- Les valeurs `null` : exclues par paire (axe manquant) ; les colonnes 100 % nulles n'ont pas de corrélation (r = null).

---

## 8. Risques / pièges

- `corr()`/`regr_*` retournent `NULL` sur données constantes ou n < 2 → gérer `r/slope/intercept = null` proprement ("n/a").
- `describe WITH ... SELECT ... UNION ALL ...` doit être validé en DuckDB ; sinon wrapper `SELECT * FROM (WITH ...) __s`.
- Ordering des arguments `regr_slope(y, x)` (y sur x) — à confirmer par test d'intégration.
- Colonnes temporelles : ne JAMAIS appeler `corr` sur la valeur brute (date/time) — appliquer l'epoch. Étiquettes via le pattern `fmtX`.
- Le brush 2D custom doit convertir pixels↔data sans re-render superflu (mapping via `VictoryChart` scale ; utiliser `domain` figé au composant).
- Quoting des identifiants dans les chaînes SQL brutes : réutiliser le quoting de reltab (ne pas interpoler à la main).
- `sqlQuery(...)` nécessite `getSqlQuerySchema` (describe) côté duckdb : s'assurer que les alias (`__x`, `__y`, `__r`, `__n`) sont stables (le schema retourné les utilise).
- Ne pas casser les mini-charts de la header row ni le dialog Distribution (le SPLOM est orthogonal).
- Snapshot failures pré-existants dans `basic.auto.test.ts` (BigInt SUM) — hors scope.

---

## 9. Fichiers concernés

| Package | Fichier | Modification |
|---------|---------|--------------|
| reltab | `src/splom.ts` | nouveau : types + helpers + queries scatter/corr/regression |
| reltab | `src/reltab.ts` | barrel : `export * from "./splom"` |
| reltab | `test/splom.test.ts` | tests unitaires (mock DbDriver) |
| reltab-duckdb | `test/splom.auto.test.ts` | tests d'intégration DuckDB (corr/regr/describe/sample) |
| tadviewer | `src/AppState.ts` | `splomDialogOpen` |
| tadviewer | `src/actions.ts` | `openSplom`, `closeSplom`, `loadSplomData`, `setSplomBrushFilter` |
| tadviewer | `src/components/SplomDialog.tsx` | nouveau dialog + `RectBrushOverlay` |
| tadviewer | `src/components/GridPane.tsx` | rendu `<SplomDialog>` + handler brush |
| tad-app | `app/appMenu.ts` | item "Scatter Plot Matrix" dans Analytics |
| tad-app | `src/electronRenderMain.tsx` | handler IPC `open-splom` |
| docs | `doc/features.md`, README, quickstart | section SPLOM |
| CI | `.github/workflows/build.yml` | trigger `feat/splom` (avant push de fin) |