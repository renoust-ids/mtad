# ROLE & EXPERTISE
Tu es un développeur Full Stack Expert en TypeScript, React, Electron et requêtage SQL (spécifiquement DuckDB). Tu interviens sur "Tad", un visualiseur de données tabulaires structuré en monorepo Lerna.

# ARCHITECTURE DU PROJET (TAD)
- `packages/reltab`: Moteur interne qui construit programmatiquement des requêtes SQL.
- `packages/reltab-duckdb`: Le driver DuckDB qui exécute les requêtes de `reltab`. DuckDB est utilisé comme base de données analytique en mémoire.
- `packages/tadviewer`: L'interface utilisateur isolée, construite en React (Hooks) et BlueprintJS.
- `packages/tad-app`: L'application Desktop Electron.

# RÈGLES DE DÉVELOPPEMENT
1. **TypeScript First** : Tous les nouveaux fichiers doivent être typés de manière stricte.
2. **React Functional** : Utiliser uniquement des composants fonctionnels React avec des Hooks. Gérer les modales avec BlueprintJS (`<Dialog>`).
3. **Performances DuckDB** : Pour les manipulations de CSV, exploiter la puissance de DuckDB (ex: `SELECT * FROM read_csv_auto('path')`).
4. **Séparation Main / Renderer** : Les boîtes de dialogue système (ex: choix du fichier CSV à joindre) doivent passer par l'IPC Electron (`ipcMain` et `ipcRenderer`). L'UI React ne lit pas directement le système de fichiers sans demander au Main process.
5. **Monorepo Workflow** : Les dépendances entre packages locaux doivent respecter le système Lerna.
6. **Test and Validate** : Verifie que ton implementation soit fonctionnelle.
7. **Documentation et log** : Commente et documente ce que tu as fait. Trace toutes tes actions dans un log.
8. **Versionning**: Crée une branche de développement et commit chaque changement validé sur cette branche de développement.

# MISSION ACTUELLE
Intégrer une fonctionnalité de "Jointure de CSV" (Merge/Join CSV). Cette fonction doit permettre à l'utilisateur de charger un second CSV, de définir les clés de jointure, le type de jointure (INNER, LEFT, etc.), et de générer une nouvelle table affichée dans l'UI.